-- Correção da Entrada Oracle após a separação do retorno de laboratório.
-- A função pública continua SECURITY INVOKER; não se concede SELECT nas tabelas privadas.
-- Retornos de laboratório ainda pendentes ficam na fila especializada de reparos.

CREATE OR REPLACE FUNCTION liquida_private.oracle_excluir_retorno_lab(p_voucher text, p_imei text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT auth.uid() IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM liquida_private.reparo_lab_avulsos a
      WHERE a.voucher = p_voucher
        AND a.imei = p_imei
        AND a.status = 'devolvido_warehouse'
        AND a.devolvido_em IS NOT NULL
        AND a.reparo_item_origem_id IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM liquida_private.reparo_lab_itens h
      WHERE h.voucher = p_voucher
        AND h.imei = p_imei
        AND h.status = 'devolvido_warehouse'
        AND h.devolvido_em IS NOT NULL
    )
  );
$function$
;
REVOKE ALL ON FUNCTION liquida_private.oracle_excluir_retorno_lab(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION liquida_private.oracle_excluir_retorno_lab(text,text) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_reparo_lab_itens_oracle_retorno_voucher_imei
ON liquida_private.reparo_lab_itens (voucher, imei)
WHERE status = 'devolvido_warehouse' AND devolvido_em IS NOT NULL;

CREATE OR REPLACE FUNCTION public.assurant_oracle_listar(p_visao text DEFAULT 'pendentes'::text, p_limite integer DEFAULT 500, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '15s'
AS $function$
DECLARE resultado jsonb;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada' USING ERRCODE='42501'; END IF;
 IF p_visao NOT IN ('pendentes','concluidos') THEN RAISE EXCEPTION 'Visão Oracle inválida'; END IF;
 IF p_limite NOT BETWEEN 1 AND 500 OR p_offset IS NULL OR p_offset<0 OR p_offset>100000
 THEN RAISE EXCEPTION 'Limites de paginação inválidos'; END IF;

 WITH origem AS MATERIALIZED (
   SELECT DISTINCT ON (t.imei)
     t.id,t.imei,t.voucher,t.sku,t.modelo,t.grade,t.grade_cosmetica,t.status_bateria,
     t.local,t.status_atual,t.criado_em,t.oracle_confirmado_em,t.oracle_confirmado_por
   FROM public.assurant_triagem t
   WHERE (
       p_visao = 'pendentes'
       AND t.status_atual = 'Aguardando oracle'
       AND NOT liquida_private.oracle_excluir_retorno_lab(t.voucher, t.imei)
     )
     OR (p_visao = 'concluidos' AND t.oracle_confirmado_em IS NOT NULL)
   ORDER BY t.imei,
     (CASE WHEN p_visao='concluidos' THEN t.oracle_confirmado_em ELSE t.criado_em END) DESC NULLS LAST,
     t.id DESC
 ), pagina AS (
   SELECT * FROM origem
   ORDER BY (CASE WHEN p_visao='concluidos' THEN oracle_confirmado_em ELSE criado_em END) DESC NULLS LAST,
     imei LIMIT p_limite OFFSET p_offset
 )
 SELECT jsonb_build_object(
  'total',(SELECT count(*) FROM origem),
  'itens',coalesce((
     SELECT jsonb_agg(jsonb_build_object(
       'id',t.id,'imei',t.imei,'voucher',t.voucher,'sku',t.sku,
       'produto',t.modelo,'grade',coalesce(nullif(t.grade,''),t.grade_cosmetica),
       'statusBateria',t.status_bateria,'local',t.local,
       'documento',ap.cpf_cnpj,'nomeCliente',ap.nome,'ri',ap.ri_numero,
       'nf',ap.nota_gerada,'poStatus',ap.po_status,
       'temMatchAp',ap.po_gerada IS NOT NULL,
       'pendenteRi',ap.ri_numero IS NULL OR nullif(btrim(ap.ri_numero),'') IS NULL,
       'confirmadoEm',t.oracle_confirmado_em,
       'confirmadoPor',u.nome,'statusAtual',t.status_atual
     ) ORDER BY (CASE WHEN p_visao='concluidos' THEN t.oracle_confirmado_em ELSE t.criado_em END) DESC NULLS LAST,t.imei)
     FROM pagina t
     LEFT JOIN LATERAL(
       SELECT a.po_gerada,a.cpf_cnpj,a.nome,a.ri_numero,a.nota_gerada,a.po_status
       FROM public.entrada_oracle_ap a
       WHERE a.po_gerada=t.voucher
       ORDER BY a.importado_em DESC,a.id DESC LIMIT 1
     ) ap ON true
     LEFT JOIN public.user_profiles u ON u.id=t.oracle_confirmado_por
  ),'[]'::jsonb)
 ) INTO resultado;
 RETURN resultado;
END $function$
;
