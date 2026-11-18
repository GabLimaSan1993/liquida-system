
-- Fila Oracle exclusiva para retornos laboratoriais sem picking físico comprovado.
-- Não gera movimentação Oracle, apenas a confirma por referência após alocação WMS.
CREATE OR REPLACE FUNCTION public.assurant_reparo_retorno_indiretos(
  p_acao text, p_item_id uuid DEFAULT NULL, p_origem text DEFAULT NULL, p_referencia text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog' SET statement_timeout TO '30s'
AS $$
DECLARE
 v_uid uuid := auth.uid();
 v_voucher text; v_imei text; v_resultado text; v_devolvido timestamptz;
 v_t public.assurant_triagem%ROWTYPE;
 v_aloc public.wms_alocacoes%ROWTYPE;
 v_sub text; v_status text;
BEGIN
 IF v_uid IS NULL OR NOT liquida_private.reparo_autorizado('oracle')
 THEN RAISE EXCEPTION 'Sem permissão para movimentação Oracle de reparo' USING ERRCODE='42501'; END IF;
 IF p_acao='listar' THEN
   RETURN (
     WITH fontes AS (
       SELECT a.id,'individual'::text origem,a.voucher,a.imei,a.modelo,a.os_numero,
         a.resultado,a.devolvido_em
       FROM liquida_private.reparo_lab_avulsos a
       WHERE a.status='devolvido_warehouse' AND a.devolvido_em IS NOT NULL
         AND a.reparo_item_origem_id IS NULL
       UNION ALL
       SELECT h.id,'historico'::text origem,h.voucher,h.imei,h.modelo,h.os_numero,
         h.resultado,h.devolvido_em
       FROM liquida_private.reparo_lab_itens h
       WHERE h.status='devolvido_warehouse' AND h.devolvido_em IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM liquida_private.reparo_itens ri
             WHERE ri.id=h.id AND ri.alocacao_id IS NOT NULL)
     )
     SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.devolvido_em DESC),'[]'::jsonb)
     FROM (
       SELECT s.id,s.origem,true AS via_origem_indireta,s.voucher,s.imei,s.modelo,s.os_numero,
         s.resultado AS resultado_lab,'retorno_armazenagem'::text AS status,
         s.devolvido_em AS bipado_em,s.devolvido_em,
         t.status_atual,t.local,t.grade AS grade_atual,t.grade_cosmetica,t.data_cosmetico,
         w.confirmado_em AS retorno_alocado_em,'6'::text AS subinv_origem,
         CASE WHEN s.resultado='irrecuperavel' THEN '1000'
              WHEN s.resultado='sem_reparo' THEN '7'
              WHEN s.resultado='reparado' AND t.data_cosmetico AT TIME ZONE 'UTC'>s.devolvido_em
              THEN (SELECT gd.grade_oracle::text FROM public.grade_oracle_depara gd
                 WHERE upper(btrim(gd.grade_texto))=upper(btrim(t.grade)) LIMIT 1)
              ELSE NULL END AS subinv_destino,
         (w.confirmado_em IS NOT NULL AND t.status_atual IN
              ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
           AND (s.resultado<>'reparado' OR
                (t.data_cosmetico AT TIME ZONE 'UTC'>s.devolvido_em
                 AND EXISTS (SELECT 1 FROM public.grade_oracle_depara gd
                   WHERE upper(btrim(gd.grade_texto))=upper(btrim(t.grade)))))
         ) AS apto_oracle
       FROM fontes s
       JOIN LATERAL (
         SELECT t1.* FROM public.assurant_triagem t1
         WHERE t1.voucher=s.voucher AND t1.imei=s.imei
         ORDER BY t1.criado_em DESC NULLS LAST LIMIT 1
       ) t ON true
       LEFT JOIN LATERAL (
         SELECT wa.confirmado_em FROM public.wms_alocacoes wa
         WHERE wa.imei=s.imei AND wa.status='confirmado'
           AND wa.confirmado_em>s.devolvido_em
         ORDER BY wa.confirmado_em DESC LIMIT 1
       ) w ON true
       WHERE t.oracle_confirmado_em IS NULL
         AND t.status_atual IN ('Aguardando armazenagem','Aguardando triagem cosmética',
               'Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
       ORDER BY s.devolvido_em DESC LIMIT 1000
     ) q
   );
 END IF;
 IF p_acao<>'confirmar_entrada' OR p_item_id IS NULL OR p_origem NOT IN ('individual','historico')
 THEN RAISE EXCEPTION 'Ação ou item inválido'; END IF;
 IF nullif(btrim(p_referencia),'') IS NULL THEN
   RAISE EXCEPTION 'Informe a referência da movimentação já executada no Oracle'; END IF;
 IF p_origem='individual' THEN
   SELECT voucher,imei,resultado,devolvido_em INTO v_voucher,v_imei,v_resultado,v_devolvido
   FROM liquida_private.reparo_lab_avulsos
   WHERE id=p_item_id AND status='devolvido_warehouse' AND reparo_item_origem_id IS NULL
   FOR UPDATE;
 ELSE
   SELECT h.voucher,h.imei,h.resultado,h.devolvido_em
   INTO v_voucher,v_imei,v_resultado,v_devolvido
   FROM liquida_private.reparo_lab_itens h
   WHERE h.id=p_item_id AND h.status='devolvido_warehouse'
     AND NOT EXISTS (SELECT 1 FROM liquida_private.reparo_itens ri
       WHERE ri.id=h.id AND ri.alocacao_id IS NOT NULL)
   FOR UPDATE;
 END IF;
 IF NOT FOUND OR v_devolvido IS NULL THEN
   RAISE EXCEPTION 'Retorno físico não localizado ou possui picking original que exige o fluxo nativo';
 END IF;
 SELECT * INTO v_t FROM public.assurant_triagem
 WHERE voucher=v_voucher AND imei=v_imei
 ORDER BY criado_em DESC NULLS LAST LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Triagem do voucher/IMEI não localizada'; END IF;
 IF v_t.oracle_confirmado_em IS NOT NULL THEN RAISE EXCEPTION 'Oracle deste retorno já confirmado'; END IF;
 IF v_t.status_atual NOT IN ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
 THEN RAISE EXCEPTION 'Aguardando alocação WMS ou triagem cosmética: %',v_t.status_atual; END IF;
 SELECT * INTO v_aloc FROM public.wms_alocacoes
 WHERE imei=v_imei AND status='confirmado' AND confirmado_em>v_devolvido
 ORDER BY confirmado_em DESC LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Alocação física WMS posterior à devolução não confirmada'; END IF;
 IF v_resultado='irrecuperavel' THEN
   v_sub:='1000'; v_status:='Scrap';
 ELSIF v_resultado='sem_reparo' THEN
   IF upper(btrim(coalesce(v_t.grade,'')))<>'QUEBRADO'
     THEN RAISE EXCEPTION 'Produto sem reparo deve manter grade física Quebrado'; END IF;
   v_sub:='7'; v_status:='Produto disponível';
 ELSIF v_resultado='reparado' THEN
   IF v_t.data_cosmetico IS NULL OR v_t.data_cosmetico AT TIME ZONE 'UTC'<=v_devolvido
   THEN RAISE EXCEPTION 'Reparado exige nova triagem cosmética posterior ao retorno'; END IF;
   SELECT gd.grade_oracle::text INTO v_sub FROM public.grade_oracle_depara gd
   WHERE upper(btrim(gd.grade_texto))=upper(btrim(v_t.grade)) LIMIT 1;
   IF v_sub IS NULL THEN RAISE EXCEPTION 'Grade final sem de/para Oracle'; END IF;
   v_status:='Produto disponível';
 ELSE
   RAISE EXCEPTION 'Classificação de reparo inválida';
 END IF;
 UPDATE public.assurant_triagem
 SET status_atual=v_status,oracle_confirmado_em=now(),oracle_confirmado_por=v_uid,
     atualizado_em=now() AT TIME ZONE 'UTC'
 WHERE id=v_t.id;
 INSERT INTO public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by)
 VALUES ((SELECT nome FROM public.user_profiles WHERE id=v_uid),
   'Oracle retorno reparo: Sub 6 → '||v_sub||' / '||btrim(p_referencia),
   v_voucher,v_imei,now() AT TIME ZONE 'UTC',v_uid);
 RETURN jsonb_build_object('ok',true,'resultado',v_resultado,'etapa',v_status,
   'subinv_origem','6','subinv_destino',v_sub,'referencia_oracle',btrim(p_referencia));
END
$$;
REVOKE ALL ON FUNCTION public.assurant_reparo_retorno_indiretos(text,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_retorno_indiretos(text,uuid,text,text) TO authenticated;

-- Retornos laboratorias são confirmados exclusivamente na aba Reparos — Movimentação.
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
   WHERE (p_visao='pendentes' AND t.status_atual='Aguardando oracle'
      AND NOT EXISTS (
        SELECT 1 FROM liquida_private.reparo_lab_avulsos a
        WHERE a.voucher=t.voucher AND a.imei=t.imei
          AND a.status='devolvido_warehouse'
          AND a.devolvido_em IS NOT NULL
          AND a.reparo_item_origem_id IS NULL
          AND t.oracle_confirmado_em IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM liquida_private.reparo_lab_itens h
        WHERE h.voucher=t.voucher AND h.imei=t.imei
          AND h.status='devolvido_warehouse'
          AND h.devolvido_em IS NOT NULL
          AND t.oracle_confirmado_em IS NULL
      ))
      OR (p_visao='concluidos' AND t.oracle_confirmado_em IS NOT NULL)
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
