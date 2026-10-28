
-- Optimize Fechamento Diário Assurant backlog. Old Esteira view performed correlated WMS scans
-- over historical trade-ins. Merge the voucher-level WMS dates once before joining.
CREATE OR REPLACE FUNCTION liquida_private.assurant_fechamento_diario_backlog(
 p_referencia date
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path TO 'pg_catalog','public'
 SET statement_timeout TO '60s'
AS $body$
DECLARE
 v_fim timestamptz;
 v_result jsonb;
BEGIN
 IF auth.uid() IS DISTINCT FROM 'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid THEN
   RAISE EXCEPTION 'Sem permissão para Fechamento Diário' USING errcode='42501';
 END IF;
 IF p_referencia IS NULL OR p_referencia < date '2020-01-01' OR
    p_referencia > (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
   RAISE EXCEPTION 'Data de referência inválida';
 END IF;
 v_fim := (p_referencia+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';

 WITH wms_primeira AS MATERIALIZED (
   SELECT voucher,min(confirmado_em) AS primeira
     FROM public.wms_alocacoes
    WHERE confirmado_em IS NOT NULL
    GROUP BY voucher
 ),
 trade AS MATERIALIZED (
   SELECT ('YBV'||g.voucher::text) AS voucher,
     coalesce(liquida_private.tradein_data(g.inicio),h.inicio) AS inicio,
     coalesce(nullif(g.imei,''),h.imei_serial) AS imei,
     CASE WHEN g.canceled IS NULL THEN coalesce(h.cancelado,false)
          ELSE upper(btrim(g.canceled))=any(array['SIM','TRUE','1','YES']) END AS cancelado
   FROM public.tradein_geral g
   LEFT JOIN public.tradein_historico h ON h.voucher_key=g.voucher::text
   UNION ALL
   SELECT 'YBV'||h.voucher_key,h.inicio,h.imei_serial,coalesce(h.cancelado,false)
   FROM public.tradein_historico h
   WHERE NOT EXISTS (SELECT 1 FROM public.tradein_geral g WHERE g.voucher::text=h.voucher_key)
 ),
 base AS MATERIALIZED (
  SELECT g.voucher,g.inicio,
      t.status_atual,
      (t.data_recebimento AT TIME ZONE 'UTC') AS recebimento,
      (t.data_funcional AT TIME ZONE 'UTC') AS funcional,
      (t.data_cosmetico AT TIME ZONE 'UTC') AS cosmetica,
      CASE WHEN (t.data_alocacao AT TIME ZONE 'UTC') >= g.inicio
           THEN (t.data_alocacao AT TIME ZONE 'UTC') END AS alocacao_historico,
      CASE WHEN w.primeira >= g.inicio THEN w.primeira
           WHEN w.primeira < g.inicio THEN
             (SELECT min(a.confirmado_em) FROM public.wms_alocacoes a
               WHERE a.voucher=g.voucher AND a.confirmado_em>=g.inicio)
           END AS alocacao_wms,
      coalesce(t.oracle_confirmado_em,(t.data_oracle AT TIME ZONE 'UTC')) AS oracle
  FROM trade g
  LEFT JOIN public.assurant_triagem t ON t.voucher=g.voucher
  LEFT JOIN wms_primeira w ON w.voucher=g.voucher
  WHERE g.inicio < v_fim
    AND NOT g.cancelado
    AND NOT EXISTS (
      SELECT 1 FROM public.assurant_caixas_liberadas x
      WHERE x.voucher=g.voucher OR x.imei=g.imei OR x.imei_identificado=g.imei
    )
 ),
 counts AS (
  SELECT
   count(*) FILTER (WHERE recebimento IS NULL OR recebimento >= v_fim) AS antes_recebimento,
   count(*) FILTER (WHERE recebimento<v_fim AND (funcional IS NULL OR funcional>=v_fim)) AS aguardando_funcional,
   count(*) FILTER (WHERE funcional<v_fim AND (cosmetica IS NULL OR cosmetica>=v_fim) AND coalesce(status_atual,'') ilike '%laudo%') AS aguardando_laudo,
   count(*) FILTER (WHERE funcional<v_fim AND (cosmetica IS NULL OR cosmetica>=v_fim) AND coalesce(status_atual,'') not ilike '%laudo%') AS aguardando_cosmetica,
   count(*) FILTER (WHERE cosmetica<v_fim AND (least(alocacao_historico,alocacao_wms) IS NULL OR least(alocacao_historico,alocacao_wms)>=v_fim)) AS aguardando_armazenagem,
   count(*) FILTER (WHERE least(alocacao_historico,alocacao_wms)<v_fim AND (oracle IS NULL OR oracle>=v_fim)) AS aguardando_oracle
  FROM base
 )
 SELECT jsonb_build_object(
   'data_referencia',p_referencia,'atualizado_em',now(),
   'etapas',jsonb_build_array(
     jsonb_build_object('etapa','antes_recebimento','nome','Pré-recebimento','total',antes_recebimento),
     jsonb_build_object('etapa','aguardando_funcional','nome','Aguardando triagem funcional','total',aguardando_funcional),
     jsonb_build_object('etapa','aguardando_laudo','nome','Aguardando laudo','total',aguardando_laudo),
     jsonb_build_object('etapa','aguardando_cosmetica','nome','Aguardando triagem cosmética','total',aguardando_cosmetica),
     jsonb_build_object('etapa','aguardando_armazenagem','nome','Aguardando armazenagem','total',aguardando_armazenagem),
     jsonb_build_object('etapa','aguardando_oracle','nome','Aguardando Oracle','total',aguardando_oracle)
   ),
   'criterio','Saldo reconstruído por marcos operacionais até o final do dia. Cancelamentos e status de laudo históricos usam estado atual; pré-recebimento não é backlog físico.',
   'fonte','Trade-in + triagem + WMS consolidados em uma única passagem'
 ) INTO v_result
 FROM counts;
 RETURN v_result;
END $body$;
