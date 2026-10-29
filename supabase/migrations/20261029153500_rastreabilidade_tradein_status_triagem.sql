-- Complementa a consulta da origem com status de triagem, sem presumir aprovação efetiva apenas pela data.
CREATE OR REPLACE FUNCTION public.assurant_rastreabilidade_tradein(p_busca text DEFAULT NULL::text, p_imei text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE
  v_busca text := nullif(upper(btrim(p_busca)),'');
  v_imei text := nullif(btrim(p_imei),'');
  v_key text;
  v_voucher text;
  v_origem text;
  v_id_imei text;
  v_sku text;
  v_modelo text;
  v_status text;
  v_cancelado boolean;
  v_inicio timestamptz;
  v_aprovacao timestamptz;
  v_recebido timestamptz;
  v_triagem public.assurant_triagem%rowtype;
  v_eventos jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.assurant_rastreabilidade_autorizado() THEN
    RAISE EXCEPTION 'Acesso restrito à Rastreabilidade do Item' USING errcode='42501';
  END IF;
  IF v_busca IS NULL AND v_imei IS NULL THEN
    RETURN jsonb_build_object('encontrado',false);
  END IF;
  v_key := CASE WHEN v_busca ~ '^(YBV)?[0-9]+$'
    THEN regexp_replace(v_busca,'^YBV','') ELSE NULL END;

  WITH fontes AS (
    SELECT 1 AS prioridade,
      coalesce(nullif(upper(btrim(g.voucher_ybv)),''),'YBV'||g.voucher::text) AS voucher,
      nullif(btrim(g.imei),'') imei,
      nullif(btrim(g.sku),'') sku,
      nullif(btrim(g.aparelho),'') modelo,
      nullif(btrim(g.status_atual),'') status,
      upper(btrim(coalesce(g.canceled,''))) IN ('SIM','S','TRUE','1') cancelado,
      liquida_private.tradein_data(g.inicio) inicio,
      liquida_private.tradein_data(g.aprovacao) aprovacao,
      'tradein_geral'::text origem
    FROM public.tradein_geral g
    WHERE (v_key IS NOT NULL AND g.voucher::text=v_key)
       OR (v_busca IS NOT NULL AND g.imei=v_busca)
       OR (v_imei IS NOT NULL AND g.imei=v_imei)
    UNION ALL
    SELECT 2 AS prioridade,
      CASE WHEN upper(btrim(coalesce(h.voucher_original,''))) LIKE 'YBV%'
        THEN upper(btrim(h.voucher_original)) ELSE 'YBV'||h.voucher_key END,
      nullif(btrim(h.imei_serial),''),
      nullif(btrim(h.sku_original),''),
      nullif(btrim(h.aparelho),''),
      nullif(btrim(h.status_atual),''),
      coalesce(h.cancelado,false),h.inicio,h.aprovacao,
      'tradein_historico'::text
    FROM public.tradein_historico h
    WHERE (v_key IS NOT NULL AND h.voucher_key=v_key)
       OR (v_busca IS NOT NULL AND h.imei_serial=v_busca)
       OR (v_imei IS NOT NULL AND h.imei_serial=v_imei)
  )
  SELECT f.voucher,f.imei,f.sku,f.modelo,f.status,f.cancelado,
    f.inicio,f.aprovacao,f.origem
  INTO v_voucher,v_id_imei,v_sku,v_modelo,v_status,v_cancelado,
    v_inicio,v_aprovacao,v_origem
  FROM fontes f
  ORDER BY CASE WHEN v_key IS NOT NULL AND f.voucher='YBV'||v_key THEN 0 ELSE 1 END,
     f.prioridade, f.inicio DESC NULLS LAST
  LIMIT 1;

  IF v_voucher IS NULL THEN RETURN jsonb_build_object('encontrado',false); END IF;

  SELECT * INTO v_triagem FROM public.assurant_triagem t
  WHERE t.voucher=v_voucher
  LIMIT 1;

  -- Primeiro evento físico real do Liquida, não apenas a existência de cadastro.
  SELECT min(x.data) INTO v_recebido
  FROM (
    SELECT min(rv.bipado_em) AS data FROM public.recebimento_vouchers rv WHERE rv.voucher=v_voucher
    UNION ALL
    SELECT v_triagem.data_recebimento AT TIME ZONE 'America/Sao_Paulo'
    UNION ALL
    SELECT CASE WHEN v_triagem.data_funcional IS NOT NULL
      THEN v_triagem.data_funcional AT TIME ZONE 'America/Sao_Paulo' END
    UNION ALL
    SELECT CASE WHEN v_triagem.data_cosmetico IS NOT NULL
      THEN v_triagem.data_cosmetico AT TIME ZONE 'America/Sao_Paulo' END
    UNION ALL
    SELECT CASE WHEN v_triagem.data_alocacao IS NOT NULL
      THEN v_triagem.data_alocacao AT TIME ZONE 'America/Sao_Paulo' END
    UNION ALL
    SELECT CASE WHEN v_triagem.data_oracle IS NOT NULL
      THEN v_triagem.data_oracle AT TIME ZONE 'America/Sao_Paulo' END
  ) x WHERE x.data IS NOT NULL;

  IF v_inicio IS NOT NULL THEN
    v_eventos := v_eventos || jsonb_build_array(jsonb_build_object(
      'data',v_inicio,'categoria','Trade-in','evento','Trade-in iniciado',
      'status','registrado','descricao','Registro de origem do voucher no programa de trade-in.',
      'origem',v_origem,'referencia',v_voucher,
      'extra',jsonb_build_object('voucher',v_voucher,'modelo',v_modelo,'sku',v_sku,'status_tradein',v_status)
    ));
  END IF;
  IF v_aprovacao IS NOT NULL AND (v_inicio IS NULL OR v_aprovacao>v_inicio) THEN
    v_eventos := v_eventos || jsonb_build_array(jsonb_build_object(
      'data',v_aprovacao,'categoria','Trade-in','evento','Marco de aprovação informado pelo Trade-in',
      'status','aprovado','descricao','Data de aprovação fornecida pela origem, independentemente do status atual do voucher. Não é recebimento físico.',
      'origem',v_origem,'referencia',v_voucher,
      'extra',jsonb_build_object('voucher',v_voucher,'status_tradein',v_status)
    ));
  END IF;
  IF v_cancelado THEN
    v_eventos := v_eventos || jsonb_build_array(jsonb_build_object(
      'data',coalesce(v_aprovacao,v_inicio),'categoria','Trade-in','evento','Trade-in marcado como cancelado',
      'status','cancelado','descricao','Registro cancelado na origem. Não classificado como aguardando recebimento.',
      'origem',v_origem,'referencia',v_voucher
    ));
  END IF;

  RETURN jsonb_build_object(
    'encontrado',true,'voucher',v_voucher,'imei',coalesce(v_id_imei,v_triagem.imei),
    'sku',coalesce(v_sku,v_triagem.sku),'modelo',coalesce(v_modelo,v_triagem.modelo),
    'status_tradein',v_status,'status_triagem',v_triagem.status_atual,'cancelado',v_cancelado,
    'inicio',v_inicio,'aprovacao',v_aprovacao,
    'recebido_em',v_recebido,
    'aguardando_recebimento',NOT v_cancelado AND v_recebido IS NULL,
    'eventos',v_eventos,
    'somente_tradein',v_triagem.id IS NULL,
    'criterio_recebimento','Bipagem no recebimento ou marco físico de triagem/etapa posterior; cadastro do trade-in não equivale a recebimento.'
  );
END
$function$
;
