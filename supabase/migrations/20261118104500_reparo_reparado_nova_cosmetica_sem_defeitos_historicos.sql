-- Reparo concluído: a nova triagem cosmética usa a condição atual e não
-- rebaixa automaticamente pela funcional antiga. Histórico original intocado.
ALTER TABLE public.assurant_triagem
  ADD COLUMN IF NOT EXISTS retorno_reparo_em timestamptz;
COMMENT ON COLUMN public.assurant_triagem.retorno_reparo_em IS
  'Recebimento físico do último reparo concluído no laboratório; autoriza nova cosmética sem herdar defeitos funcionais anteriores.';

CREATE OR REPLACE FUNCTION public.assurant_reparo_retorno(p_acao text, p_item_id uuid DEFAULT NULL::uuid, p_referencia text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
 v_i liquida_private.reparo_itens%ROWTYPE;
 v_p liquida_private.reparo_pedidos%ROWTYPE;
 v_t public.assurant_triagem%ROWTYPE;
 v_l liquida_private.reparo_lab_itens%ROWTYPE;
 v_a public.wms_alocacoes%ROWTYPE;
 v_destino text;
 v_entrada text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão não autenticada' USING ERRCODE='42501'; END IF;
 IF p_acao NOT IN ('listar_armazenagem','listar_oracle','registrar_retorno','confirmar_entrada') OR p_acao IS NULL
 THEN RAISE EXCEPTION 'Ação inválida'; END IF;

 IF p_acao IN ('listar_armazenagem','registrar_retorno') THEN
   IF NOT EXISTS (
     SELECT 1 FROM public.user_profiles u
     WHERE u.id=auth.uid()
       AND (coalesce(u.is_master,false) OR u.telas_permitidas @> ARRAY['/v2/assurant/estoque/retorno-reparo']::text[])
   ) THEN
     RAISE EXCEPTION 'Sem permissão para Retorno de Reparo' USING ERRCODE='42501';
   END IF;
 ELSE
   IF NOT liquida_private.reparo_autorizado('oracle') THEN
     RAISE EXCEPTION 'Sem permissão para Oracle' USING ERRCODE='42501';
   END IF;
 END IF;

 IF p_acao IN ('listar_armazenagem','listar_oracle') THEN
  RETURN (
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.bipado_em DESC NULLS LAST),'[]'::jsonb)
    FROM (
     SELECT i.id,i.pedido_id,p.lote,i.imei,i.voucher,i.modelo,i.sku,i.grade AS grade_saida,
       i.status,i.bipado_em,t.status_atual,t.local,t.grade AS grade_atual,
       t.grade_cosmetica,t.data_cosmetico,l.resultado AS resultado_lab,
       l.status AS status_laboratorio,l.os_numero,l.concluido_em,l.devolvido_em,
       a.confirmado_em AS retorno_alocado_em,
       CASE WHEN l.resultado='irrecuperavel' THEN '1000'
            WHEN l.resultado='sem_reparo' THEN '7'
            WHEN l.resultado='reparado' AND l.devolvido_em IS NOT NULL
              AND t.data_cosmetico AT TIME ZONE 'UTC' > l.devolvido_em
            THEN (SELECT gd.grade_oracle::text FROM public.grade_oracle_depara gd
                  WHERE upper(btrim(gd.grade_texto))=upper(btrim(t.grade)) LIMIT 1)
            ELSE NULL END AS subinv_destino,
       '6'::text AS subinv_origem,
       CASE WHEN i.status IN ('retorno_scrap_oracle','retorno_armazenagem') AND l.resultado='irrecuperavel'
                 AND a.id IS NOT NULL
                 AND t.status_atual IN ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
            THEN true
            WHEN i.status='retorno_armazenagem' AND a.id IS NOT NULL
             AND t.status_atual IN ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
             AND l.resultado='sem_reparo' THEN true
            WHEN i.status='retorno_armazenagem' AND a.id IS NOT NULL
             AND t.status_atual IN ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
             AND l.resultado='reparado' AND l.devolvido_em IS NOT NULL
             AND t.data_cosmetico AT TIME ZONE 'UTC' > l.devolvido_em
             AND EXISTS (SELECT 1 FROM public.grade_oracle_depara gd
               WHERE upper(btrim(gd.grade_texto))=upper(btrim(t.grade))) THEN true
            ELSE false END AS apto_oracle,
       (l.status='em_devolucao' AND l.romaneio_retorno_id IS NOT NULL) AS liberado_laboratorio
     FROM liquida_private.reparo_itens i
     JOIN liquida_private.reparo_pedidos p ON p.id=i.pedido_id
     LEFT JOIN liquida_private.reparo_lab_itens l ON l.id=i.id
     LEFT JOIN LATERAL (
       SELECT * FROM public.assurant_triagem t1
       WHERE t1.imei=i.imei AND t1.voucher IS NOT DISTINCT FROM i.voucher
       ORDER BY t1.criado_em DESC NULLS LAST LIMIT 1
     ) t ON true
     LEFT JOIN LATERAL (
       SELECT wa.id,wa.confirmado_em FROM public.wms_alocacoes wa
       WHERE wa.imei=i.imei AND wa.status='confirmado'
         AND wa.confirmado_em > coalesce(l.devolvido_em,i.bipado_em)
       ORDER BY wa.confirmado_em DESC LIMIT 1
     ) a ON true
     WHERE (p_acao='listar_armazenagem' AND (
         (i.status IN ('bipado','em_reparo') AND l.status='em_devolucao' AND l.romaneio_retorno_id IS NOT NULL)
         OR i.status IN ('retorno_armazenagem','retorno_scrap_oracle')))
        OR (p_acao='listar_oracle' AND
          (i.status='retorno_scrap_oracle' OR i.status='retorno_armazenagem'))
     ORDER BY i.bipado_em DESC NULLS LAST LIMIT 1000
    ) x
  );
 END IF;

 IF p_item_id IS NULL THEN RAISE EXCEPTION 'Informe o item do reparo'; END IF;
 SELECT * INTO v_i FROM liquida_private.reparo_itens WHERE id=p_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Item de reparo não localizado'; END IF;
 SELECT * INTO v_p FROM liquida_private.reparo_pedidos WHERE id=v_i.pedido_id;
 SELECT * INTO v_l FROM liquida_private.reparo_lab_itens WHERE id=v_i.id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Resultado técnico do laboratório não localizado'; END IF;
 SELECT * INTO v_t FROM public.assurant_triagem
  WHERE imei=v_i.imei AND voucher IS NOT DISTINCT FROM v_i.voucher
  ORDER BY criado_em DESC NULLS LAST LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Triagem de origem não localizada'; END IF;

 IF p_acao='registrar_retorno' THEN
   IF v_i.status NOT IN ('bipado','em_reparo') THEN
     RAISE EXCEPTION 'Retorno já registrado ou sem saída WMS validada'; END IF;
   IF v_l.status<>'em_devolucao' OR v_l.romaneio_retorno_id IS NULL
     OR v_l.resultado NOT IN ('reparado','sem_reparo','irrecuperavel')
   THEN RAISE EXCEPTION 'Laboratório ainda não concluiu o item com resultado e romaneio de devolução'; END IF;
   IF NOT EXISTS (
     SELECT 1 FROM public.wms_alocacoes a WHERE a.id=v_i.alocacao_id
       AND a.status='retirado' AND a.saida_canal='REPARO'
   ) THEN RAISE EXCEPTION 'Saída do WMS para reparo não confirmada'; END IF;
   IF EXISTS (SELECT 1 FROM public.wms_alocacoes a
              WHERE a.imei=v_i.imei AND a.status='confirmado')
   THEN RAISE EXCEPTION 'Ainda há alocação WMS ativa; confira o IMEI antes de receber'; END IF;

   IF v_l.resultado='irrecuperavel' THEN
     UPDATE liquida_private.reparo_itens
       SET status='retorno_armazenagem' WHERE id=v_i.id;
     UPDATE public.assurant_triagem
       SET status_atual='Aguardando armazenagem',grade='QUEBRADO',
           retorno_reparo_em=NULL,
           oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
           atualizado_em=now() AT TIME ZONE 'UTC'
       WHERE id=v_t.id;
     v_destino:='1000'; v_entrada:='Scrap — aguardando alocação';
   ELSIF v_l.resultado='sem_reparo' THEN
     UPDATE liquida_private.reparo_itens SET status='retorno_armazenagem' WHERE id=v_i.id;
     UPDATE public.assurant_triagem
       SET status_atual='Aguardando armazenagem',grade='QUEBRADO',
           retorno_reparo_em=NULL,
           oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
           atualizado_em=now() AT TIME ZONE 'UTC'
       WHERE id=v_t.id;
     v_destino:='7';v_entrada:='Aguardando armazenagem — sem reparo';
   ELSE
     UPDATE liquida_private.reparo_itens SET status='retorno_armazenagem' WHERE id=v_i.id;
     UPDATE public.assurant_triagem
       SET status_atual='Aguardando triagem cosmética',
           retorno_reparo_em=now(),
           oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
           atualizado_em=now() AT TIME ZONE 'UTC'
       WHERE id=v_t.id;
     v_destino:=NULL;v_entrada:='Aguardando nova triagem cosmética';
   END IF;
   UPDATE liquida_private.reparo_lab_itens
      SET status='devolvido_warehouse',
          devolvido_em=coalesce(devolvido_em,now()),
          devolvido_por=auth.uid(),atualizado_em=now()
     WHERE id=v_i.id;
   UPDATE liquida_private.reparo_lab_romaneios r
      SET status=CASE WHEN NOT EXISTS(
         SELECT 1 FROM liquida_private.reparo_lab_itens li
         WHERE li.romaneio_retorno_id=r.id AND li.status<>'devolvido_warehouse'
      ) THEN 'recebido' ELSE 'recebimento_parcial' END,
      recebido_em=now(),recebido_por=auth.uid()
     WHERE id=v_l.romaneio_retorno_id;
   INSERT INTO public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by)
   VALUES((SELECT nome FROM public.user_profiles WHERE id=auth.uid()),
    'Retorno reparo '||v_l.resultado||' — Sub 6 para '||coalesce(v_destino,'grade pós-cosmética'),
    v_i.voucher,v_i.imei,now() AT TIME ZONE 'UTC',auth.uid());
   RETURN jsonb_build_object('ok',true,'etapa',v_entrada,'resultado',v_l.resultado,
             'subinv_origem','6','subinv_destino',v_destino);
 END IF;

 IF p_acao='confirmar_entrada' THEN
   IF NULLIF(btrim(p_referencia),'') IS NULL THEN
     RAISE EXCEPTION 'Informe a referência da movimentação executada no Oracle'; END IF;
   IF v_l.status<>'devolvido_warehouse' OR v_l.devolvido_em IS NULL THEN
     RAISE EXCEPTION 'Retorno físico ainda não confirmado pelo warehouse'; END IF;
   IF v_l.resultado='irrecuperavel' THEN
     IF v_i.status NOT IN ('retorno_scrap_oracle','retorno_armazenagem')
       THEN RAISE EXCEPTION 'Scrap não está no fluxo de retorno'; END IF;
     SELECT * INTO v_a FROM public.wms_alocacoes
       WHERE imei=v_i.imei AND status='confirmado'
         AND confirmado_em > v_l.devolvido_em
       ORDER BY confirmado_em DESC LIMIT 1;
     IF NOT FOUND THEN RAISE EXCEPTION 'Scrap exige alocação física WMS antes da movimentação Oracle'; END IF;
     IF v_t.status_atual NOT IN ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
       THEN RAISE EXCEPTION 'Scrap ainda não está liberado para Oracle: %',v_t.status_atual; END IF;
     v_destino:='1000';v_entrada:='Scrap';
   ELSE
     IF v_i.status<>'retorno_armazenagem' THEN RAISE EXCEPTION 'Retorno não está aguardando alocação/Oracle'; END IF;
     SELECT * INTO v_a FROM public.wms_alocacoes
       WHERE imei=v_i.imei AND status='confirmado'
         AND confirmado_em > v_l.devolvido_em
       ORDER BY confirmado_em DESC LIMIT 1;
     IF NOT FOUND THEN RAISE EXCEPTION 'Retorno ainda sem nova alocação física WMS confirmada'; END IF;
     IF v_t.status_atual NOT IN ('Aguardando oracle','Aguardando movimentação Oracle retorno reparo')
       THEN RAISE EXCEPTION 'Etapa não liberada para Oracle: %',v_t.status_atual; END IF;
     IF v_l.resultado='sem_reparo' THEN
       IF upper(btrim(coalesce(v_t.grade,'')))<>'QUEBRADO' THEN
         RAISE EXCEPTION 'Sem reparo: grade de destino deve ser Quebrado'; END IF;
       v_destino:='7';
     ELSIF v_l.resultado='reparado' THEN
       IF v_t.data_cosmetico IS NULL OR v_t.data_cosmetico AT TIME ZONE 'UTC' <= v_l.devolvido_em
         THEN RAISE EXCEPTION 'Reparo concluído exige nova triagem cosmética após o retorno'; END IF;
       SELECT gd.grade_oracle::text INTO v_destino FROM public.grade_oracle_depara gd
         WHERE upper(btrim(gd.grade_texto))=upper(btrim(v_t.grade)) LIMIT 1;
       IF v_destino IS NULL THEN RAISE EXCEPTION 'Grade pós-reparo sem correspondência Oracle'; END IF;
     ELSE RAISE EXCEPTION 'Resultado do laboratório não classificado'; END IF;
     v_entrada:='Produto disponível';
   END IF;
   UPDATE liquida_private.reparo_itens SET status='retornado' WHERE id=v_i.id;
   UPDATE public.assurant_triagem
     SET status_atual=v_entrada,oracle_confirmado_em=now(),oracle_confirmado_por=auth.uid(),
         atualizado_em=now() AT TIME ZONE 'UTC'
     WHERE id=v_t.id;
   INSERT INTO public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by)
   VALUES((SELECT nome FROM public.user_profiles WHERE id=auth.uid()),
          'Oracle retorno reparo: Sub 6 → '||v_destino||' / '||btrim(p_referencia),
          v_i.voucher,v_i.imei,now() AT TIME ZONE 'UTC',auth.uid());
   RETURN jsonb_build_object('ok',true,'etapa',v_entrada,'resultado',v_l.resultado,
          'subinv_origem','6','subinv_destino',v_destino,'referencia_oracle',btrim(p_referencia));
 END IF;
 RAISE EXCEPTION 'Ação não executada';
END $function$
;

CREATE OR REPLACE FUNCTION public.assurant_reparo_retorno_laboratorio(p_acao text, p_item_id uuid DEFAULT NULL::uuid, p_origem text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
 v_uid uuid := auth.uid();
 v_avulso liquida_private.reparo_lab_avulsos%ROWTYPE;
 v_hist liquida_private.reparo_lab_itens%ROWTYPE;
 v_picking liquida_private.reparo_itens%ROWTYPE;
 v_romaneio_id uuid;
 v_ref uuid;
 v_resultado jsonb;
 v_direcionar boolean := false;
 v_voucher text;
 v_imei text;
 v_classificacao text;
 v_status_destino text;
 v_subinv_destino text;
 v_triagem_id uuid;
BEGIN
 IF v_uid IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.user_profiles u WHERE u.id=v_uid
   AND (coalesce(u.is_master,false) OR u.telas_permitidas @> ARRAY['/v2/assurant/estoque/retorno-reparo']::text[])
 ) THEN RAISE EXCEPTION 'Sem permissão para Retorno de Reparo' USING ERRCODE='42501'; END IF;
 IF p_acao='listar' THEN
   RETURN (
     SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.concluido_em DESC NULLS LAST,x.voucher),'[]'::jsonb)
     FROM (
       SELECT a.id,'individual'::text AS origem,a.voucher,a.imei,a.modelo,a.os_numero,
              a.status,a.resultado AS resultado_lab,a.defeitos_origem,a.defeitos_atual,
              a.observacoes,a.concluido_em,a.devolvido_em,a.atualizado_em,
              NULL::text AS lote,NULL::uuid AS pedido_id,
              d.devolucao_id,man.numero AS minuta_numero,
              (a.status='em_devolucao' AND d.devolucao_id IS NOT NULL) AS liberado_laboratorio,
              false AS fluxo_wms
       FROM liquida_private.reparo_lab_avulsos a
       LEFT JOIN liquida_private.reparo_lab_devolucoes_unificadas_itens d
         ON d.origem='individual' AND d.item_id=a.id
       LEFT JOIN liquida_private.reparo_lab_devolucoes_unificadas man ON man.id=d.devolucao_id
       WHERE a.status IN ('concluido','em_devolucao')
       UNION ALL
       SELECT h.id,'historico'::text,h.voucher,h.imei,h.modelo,h.os_numero,
              h.status,h.resultado,h.defeitos_origem,h.defeitos_atual,
              h.observacoes,h.concluido_em,h.devolvido_em,h.atualizado_em,
              p.lote,h.pedido_id,d.devolucao_id,man.numero,
              (h.status='devolucao_pendente_warehouse' OR (h.status='em_devolucao' AND
                  (h.romaneio_retorno_id IS NOT NULL OR d.devolucao_id IS NOT NULL))) AS liberado_laboratorio,
              (ri.alocacao_id IS NOT NULL) AS fluxo_wms
       FROM liquida_private.reparo_lab_itens h
       LEFT JOIN liquida_private.reparo_pedidos p ON p.id=h.pedido_id
       LEFT JOIN liquida_private.reparo_itens ri ON ri.id=h.id
       LEFT JOIN liquida_private.reparo_lab_devolucoes_unificadas_itens d
         ON d.origem='historico' AND d.item_id=h.id
       LEFT JOIN liquida_private.reparo_lab_devolucoes_unificadas man ON man.id=d.devolucao_id
       WHERE h.status IN ('concluido','em_devolucao','devolucao_pendente_warehouse')
     ) x
   );
 END IF;
 IF p_acao IS DISTINCT FROM 'receber' OR p_item_id IS NULL OR p_origem NOT IN ('individual','historico')
 THEN RAISE EXCEPTION 'Ação ou aparelho inválido no recebimento'; END IF;
 IF p_origem='individual' THEN
   SELECT * INTO v_avulso FROM liquida_private.reparo_lab_avulsos WHERE id=p_item_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Voucher não encontrado no laboratório'; END IF;
   IF v_avulso.status<>'em_devolucao'
     THEN RAISE EXCEPTION 'Voucher não está em Em devolução. Gere a minuta antes de bipar'; END IF;
   IF v_avulso.resultado NOT IN ('reparado','sem_reparo','irrecuperavel')
     THEN RAISE EXCEPTION 'Reparo sem resultado técnico validado'; END IF;
   SELECT devolucao_id INTO v_romaneio_id
     FROM liquida_private.reparo_lab_devolucoes_unificadas_itens
     WHERE origem='individual' AND item_id=p_item_id;
   IF v_romaneio_id IS NULL THEN RAISE EXCEPTION 'Minuta de devolução não localizada'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos
     SET status='devolvido_warehouse',devolvido_em=now(),devolvido_por=v_uid,atualizado_em=now()
     WHERE id=p_item_id;
   INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
     VALUES(p_item_id,'retorno_fisico_warehouse',
       jsonb_build_object('status','em_devolucao','voucher',v_avulso.voucher),
       jsonb_build_object('status','devolvido_warehouse','minuta_id',v_romaneio_id,
                          'resultado',v_avulso.resultado,'conferido_em',now()),v_uid);
   v_direcionar:=true; v_voucher:=v_avulso.voucher; v_imei:=v_avulso.imei; v_classificacao:=v_avulso.resultado;
   v_resultado:=jsonb_build_object('ok',true,'voucher',v_avulso.voucher,
       'resultado',v_avulso.resultado,'tipo','somente_recebimento_fisico',
       'mensagem','Retorno físico confirmado. Sem movimentação automática de WMS/Oracle');
 ELSE
   SELECT * INTO v_hist FROM liquida_private.reparo_lab_itens WHERE id=p_item_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Item histórico não encontrado'; END IF;
   IF v_hist.status='devolucao_pendente_warehouse' THEN
     UPDATE liquida_private.reparo_lab_itens SET status='devolvido_warehouse',
       devolvido_em=now(),devolvido_por=v_uid,atualizado_em=now() WHERE id=p_item_id;
     INSERT INTO liquida_private.reparo_lab_eventos(item_id,acao,anterior,posterior,usuario_id)
       VALUES (p_item_id,'falta_malote_recebida_fisicamente_warehouse',
         jsonb_build_object('status','devolucao_pendente_warehouse','voucher',v_hist.voucher),
         jsonb_build_object('status','devolvido_warehouse','resultado',NULL,'sem_recebimento_laboratorio',true),
         v_uid);
     RETURN jsonb_build_object('ok',true,'voucher',v_hist.voucher,'resultado',NULL,
       'tipo','regularizacao_falta_malote',
       'mensagem','Falta do malote confirmada pelo Warehouse. Nenhuma entrada WMS/Oracle presumida.');
   END IF;
   IF v_hist.status<>'em_devolucao'
     THEN RAISE EXCEPTION 'Voucher não está em Em devolução. Gere a minuta antes de bipar'; END IF;
   IF v_hist.resultado NOT IN ('reparado','sem_reparo','irrecuperavel')
     THEN RAISE EXCEPTION 'Reparo sem resultado técnico validado'; END IF;
   SELECT devolucao_id INTO v_romaneio_id
     FROM liquida_private.reparo_lab_devolucoes_unificadas_itens
     WHERE origem='historico' AND item_id=p_item_id;
   IF v_hist.romaneio_retorno_id IS NULL AND v_romaneio_id IS NULL
     THEN RAISE EXCEPTION 'Minuta de devolução não localizada'; END IF;
   SELECT * INTO v_picking FROM liquida_private.reparo_itens WHERE id=p_item_id FOR UPDATE;
   IF FOUND AND v_picking.status IN ('bipado','em_reparo') THEN
     -- O fluxo antigo continua sendo responsável por validar WMS, triagem e direcionamento.
     v_resultado:=public.assurant_reparo_retorno('registrar_retorno',p_item_id,NULL);
   ELSE
     -- Item importado historicamente sem picking/WMS validado:
     -- confirmar só a chegada física e NÃO supor uma saída de estoque.
     IF FOUND AND v_picking.alocacao_id IS NOT NULL
       THEN RAISE EXCEPTION 'Há alocação WMS vinculada e status incompatível; necessário conciliar'; END IF;
     UPDATE liquida_private.reparo_lab_itens
       SET status='devolvido_warehouse',devolvido_em=now(),devolvido_por=v_uid,atualizado_em=now()
       WHERE id=p_item_id;
     IF v_hist.romaneio_retorno_id IS NOT NULL THEN
       UPDATE liquida_private.reparo_lab_romaneios r
       SET status=CASE WHEN NOT EXISTS(
         SELECT 1 FROM liquida_private.reparo_lab_itens l
         WHERE l.romaneio_retorno_id=r.id AND l.status<>'devolvido_warehouse'
       ) THEN 'recebido' ELSE 'recebimento_parcial' END,
       recebido_em=now(),recebido_por=v_uid
       WHERE id=v_hist.romaneio_retorno_id;
     END IF;
     v_direcionar:=true; v_voucher:=v_hist.voucher; v_imei:=v_hist.imei; v_classificacao:=v_hist.resultado;
     v_resultado:=jsonb_build_object('ok',true,'voucher',v_hist.voucher,
       'resultado',v_hist.resultado,'tipo','somente_recebimento_fisico',
       'mensagem','Retorno físico confirmado. Sem movimento WMS/Oracle presumido');
   END IF;
   INSERT INTO liquida_private.reparo_lab_eventos(
       item_id,romaneio_id,acao,anterior,posterior,usuario_id)
   VALUES (p_item_id,v_hist.romaneio_retorno_id,'retorno_fisico_warehouse',
       jsonb_build_object('status','em_devolucao','voucher',v_hist.voucher),
       jsonb_build_object('status','devolvido_warehouse',
                          'resultado',v_hist.resultado,'minuta_id',v_romaneio_id),v_uid);
 END IF;


 IF v_direcionar THEN
   SELECT t.id INTO v_triagem_id
   FROM public.assurant_triagem t
   WHERE t.voucher=v_voucher AND t.imei=v_imei
   ORDER BY t.criado_em DESC NULLS LAST LIMIT 1 FOR UPDATE;
   IF v_triagem_id IS NULL THEN
     RAISE EXCEPTION 'Voucher/IMEI sem triagem correspondente. Conferência abortada para conciliação de estoque';
   END IF;
   IF EXISTS (
     SELECT 1 FROM public.wms_alocacoes w
     WHERE w.imei=v_imei AND w.status='confirmado'
   ) THEN
     RAISE EXCEPTION 'O IMEI ainda possui alocação WMS ativa. Regularize antes de confirmar o retorno';
   END IF;
   IF v_classificacao='reparado' THEN
     v_status_destino:='Aguardando triagem cosmética';
     v_subinv_destino:=NULL;
     UPDATE public.assurant_triagem
     SET status_atual=v_status_destino,
         retorno_reparo_em=now(),
         oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
         atualizado_em=now() AT TIME ZONE 'UTC'
     WHERE id=v_triagem_id;
   ELSIF v_classificacao IN ('sem_reparo','irrecuperavel') THEN
     v_status_destino:='Aguardando armazenagem';
     v_subinv_destino:=CASE WHEN v_classificacao='irrecuperavel' THEN '1000' ELSE '7' END;
     UPDATE public.assurant_triagem
     SET status_atual=v_status_destino,grade='QUEBRADO',
         retorno_reparo_em=NULL,
         oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
         atualizado_em=now() AT TIME ZONE 'UTC'
     WHERE id=v_triagem_id;
   ELSE
     RAISE EXCEPTION 'Resultado final do laboratório não classificado';
   END IF;
   INSERT INTO public.assurant_movimentacao
     (usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by)
   VALUES ((SELECT nome FROM public.user_profiles WHERE id=v_uid),
     'Retorno reparo '||v_classificacao||' — '||v_status_destino||
     ' / Sub 6 para '||coalesce(v_subinv_destino,'grade pós-cosmética'),
     v_voucher,v_imei,now() AT TIME ZONE 'UTC',v_uid);
   v_resultado:=v_resultado||jsonb_build_object(
     'tipo','retorno_classificado','etapa',v_status_destino,
     'subinv_origem','6','subinv_destino',v_subinv_destino,
     'mensagem','Retorno físico confirmado e encaminhado para '||v_status_destino||
       '. O Oracle ainda depende da alocação e da confirmação específica.');
 END IF;

 IF v_romaneio_id IS NOT NULL THEN
   UPDATE liquida_private.reparo_lab_devolucoes_unificadas d
     SET status=CASE WHEN NOT EXISTS(
       SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
       LEFT JOIN liquida_private.reparo_lab_avulsos a
         ON di.origem='individual' AND a.id=di.item_id
       LEFT JOIN liquida_private.reparo_lab_itens h
         ON di.origem='historico' AND h.id=di.item_id
       WHERE di.devolucao_id=d.id
         AND coalesce(a.status,h.status)<>'devolvido_warehouse'
     ) THEN 'recebido' ELSE 'recebimento_parcial' END
   WHERE d.id=v_romaneio_id;
 END IF;
 RETURN v_resultado;
END $function$
;

CREATE OR REPLACE FUNCTION liquida_private.triagem_defeitos_grade_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare negativa boolean; concluiu boolean; bloqueado boolean; laudo_pendente boolean; j jsonb;
 compra text; condicao text; sufixo text; exige_laudo boolean; contrato text; motivo text;
begin
 -- O retorno de reparo validado pela bipagem no Warehouse libera uma NOVA
 -- cosmética: preservar o laudo e a funcional antigos sem reimpô-los na grade.
 -- Se houver nova funcional ou alteração nos defeitos, aplicar regras normais.
 if tg_op='UPDATE'
    and new.retorno_reparo_em is not null
    and (new.data_funcional is null or new.data_funcional at time zone 'UTC' <= new.retorno_reparo_em)
    and new.status_atual in ('Aguardando triagem cosmética','Aguardando armazenagem',
       'Aguardando oracle','Aguardando movimentação Oracle retorno reparo','Produto disponível')
    and new.defeitos_adicionais is not distinct from old.defeitos_adicionais
    and new.resultado_triagem_funcional is not distinct from old.resultado_triagem_funcional
    and new.respostas_funcional is not distinct from old.respostas_funcional
    and new.data_funcional is not distinct from old.data_funcional
 then
    return new;
 end if;
 -- RPC-authorized, audit-protected exception; ordinary laudo rules still apply.
 if tg_op='UPDATE'
    and new.status_atual='Aguardando triagem cosmética'
    and new.resultado_triagem_funcional='BAD'
    and coalesce(new.defeitos_adicionais,'') ilike '%Não liga — divergência funcional%'
    and exists(
      select 1 from liquida_private.triagem_nao_liga_encaminhamentos e
       where e.triagem_id=new.id and e.voucher=new.voucher
         and e.usuario_id=auth.uid()
         and e.status_novo='Aguardando triagem cosmética'
         and e.dados_posteriores is null
         and e.registrado_em >= now()-interval '5 minutes'
    ) then
   new.grade:='QUEBRADO';
   new.rebaixado_bateria:=false;
   return new;
 end if;
 if tg_op = 'UPDATE' then
  if new.defeitos_adicionais is distinct from old.defeitos_adicionais
   and new.defeitos_adicionais is not distinct from liquida_private.triagem_limpar_faixas_bateria(old.defeitos_adicionais)
   and (to_jsonb(new) - 'defeitos_adicionais') = (to_jsonb(old) - 'defeitos_adicionais') then
   return new;
  end if;
 end if;
 if new.data_funcional is null then return new; end if;
 begin j:=new.respostas_funcional::jsonb; exception when others then j:='{}'::jsonb; end;
 -- Não liga: o Laudo é obrigatório independentemente da condição BM/TR.
 -- Nenhuma regra de compra pode mandar a divergência direto à Cosmética.
 if new.status_atual='Aguardando laudo'
    and new.origem_triagem='liquida'
    and new.resultado_triagem_funcional='BAD'
    and j->>'origem'='nao_liga_declarado_na_funcional'
    and j#>>'{destino,tipo_laudo}'='DIVERGENCIA'
    and j#>>'{destino,tipo_divergencia}'='NAO_LIGA'
    and j#>>'{destino,laudo}'='true'
    and j#>>'{identificacao,identificacao_nao_bipada}'='true'
 then
   new.grade:='QUEBRADO';
   new.rebaixado_bateria:=false;
   return new;
 end if;
 if new.origem_triagem not in ('liquida','devolucao_b2c') and not coalesce((j->'identificacao'->>'danos_tela')::boolean,false) then return new; end if;
 if new.origem_triagem='gaia' and coalesce((j->'identificacao'->>'danos_tela')::boolean,false) then new.origem_triagem:='liquida'; end if;
 if coalesce((j->'identificacao'->>'danos_tela')::boolean,false) and lower(coalesce(new.defeitos_adicionais,'')) !~ '(^|;)[[:space:]]*danos da tela([[:space:]]*;|[[:space:]]*$)' then
  new.defeitos_adicionais:=concat_ws('; ',nullif(trim(new.defeitos_adicionais),''),'Danos da tela');
 end if;
 negativa:=liquida_private.triagem_funcional_tem_negativa(new.respostas_funcional);
 bloqueado:=liquida_private.triagem_bloqueio_exige_laudo(new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);
 if liquida_private.triagem_defeito_exige_quebrado(new.defeitos_adicionais) then
  new.resultado_triagem_funcional:='BAD'; new.grade:='QUEBRADO'; new.rebaixado_bateria:=false;
 elsif negativa or bloqueado then new.resultado_triagem_funcional:='BAD'; end if;
 if tg_op='INSERT' then concluiu:=true;
 else concluiu:=new.data_funcional is distinct from old.data_funcional or new.respostas_funcional is distinct from old.respostas_funcional; end if;
 laudo_pendente:=new.data_laudo is null or new.data_laudo<new.data_funcional;

 -- Nunca usa a grade obtida na triagem como condição da compra.
 -- Só YBV pode consultar o contrato YBV; GRV/DEV com mesmos números não se misturam.
 if new.voucher ~ '^(YBV)+[0-9]+$' then
  contrato:='YBV'||regexp_replace(new.voucher,'^(YBV)+','');
  select g.condicao_aparelho,g.condicao_sufixo into condicao,sufixo
   from public.tradein_geral g where g.voucher_ybv=contrato;
  if nullif(btrim(condicao),'') is null and nullif(btrim(sufixo),'') is null then
   select h.condicao_aparelho,substring(upper(h.sku_original) from '(BM|TR)$') into condicao,sufixo
    from public.tradein_historico h where h.voucher_key=substring(contrato from 4);
  end if;
 end if;
 if nullif(btrim(condicao),'') is null and nullif(btrim(sufixo),'') is null then
  condicao:=coalesce(nullif(btrim(j#>>'{destino,condicao_declarada}'),''),new.condicao);
  sufixo:=nullif(btrim(j#>>'{destino,condicao_sufixo_declarado}'),'');
 end if;
 compra:=liquida_private.triagem_condicao_compra(condicao,sufixo);
 exige_laudo:=liquida_private.triagem_laudo_por_compra(condicao,sufixo,new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);

 if (concluiu and exige_laudo) or (exige_laudo and laudo_pendente and new.status_atual ilike '%cosm%') then
  if new.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=new.imei and w.status='confirmado') then
   raise exception 'A condição de compra e a negativa funcional exigem laudo. Regularize o vínculo de armazenagem antes de prosseguir.';
  end if;
  if new.status_atual is distinct from 'Finalizado' then new.status_atual:='Aguardando laudo'; end if;
 elsif concluiu and not exige_laudo and new.status_atual='Aguardando laudo' then
  new.status_atual:='Aguardando triagem cosmética';
 end if;
 if concluiu and jsonb_typeof(j)='object' then
  motivo:=case when exige_laudo and compra='BM' then 'Compra BM com negativa na triagem funcional'
   when exige_laudo and compra='TR' then 'Compra TR/Defeituoso com negativa em ligar ou desbloqueio'
   when compra='TR' then 'Compra TR/Defeituoso sem negativa em ligar ou desbloqueio'
   when compra='BM' then 'Compra BM sem negativa na funcional'
   else 'Condição de compra sem regra de laudo' end;
  j:=jsonb_set(j,'{destino}',coalesce(j->'destino','{}'::jsonb)||jsonb_build_object('laudo',exige_laudo,'motivo',motivo,'condicao_declarada',condicao,'condicao_sufixo_declarado',compra));
  new.respostas_funcional:=j::text;
 end if;
 return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assurant_cosmetica_salvar(p_voucher text, p_tela text, p_laterais text, p_traseira text, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_voucher text := upper(trim(coalesce(p_voucher,'')));
  v_tela text := upper(trim(coalesce(p_tela,'')));
  v_laterais text := upper(trim(coalesce(p_laterais,'')));
  v_traseira text := upper(trim(coalesce(p_traseira,'')));
  v_t public.assurant_triagem%rowtype;
  v_grade_cosmetica text;
  v_grade_final text;
  v_rebaixado boolean := false;
  v_status_final text;
  v_now timestamp without time zone := timezone('UTC',now());
  v_hierarquia text[] := array['QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW'];
  v_bateria_baixa boolean;
  v_bateria_critica boolean;
  v_reparo_validado boolean := false;
begin
  if v_user is null or p_usuario is distinct from v_user then
    return jsonb_build_object('ok',false,'erro','Sessão inválida para concluir a triagem cosmética.');
  end if;

  if v_voucher='' then
    return jsonb_build_object('ok',false,'erro','Voucher obrigatório.');
  end if;

  if not (v_tela = any(v_hierarquia))
     or not (v_laterais = any(v_hierarquia))
     or not (v_traseira = any(v_hierarquia))
  then
    return jsonb_build_object('ok',false,'erro','Classificação cosmética inválida. Preencha tela, laterais e traseira.');
  end if;

  select *
    into v_t
  from public.assurant_triagem
  where upper(trim(voucher))=v_voucher
  order by coalesce(atualizado_em,criado_em) desc nulls last
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',false,'erro',format('Voucher %s não encontrado na triagem.',v_voucher));
  end if;

  if v_t.status_atual in ('Aguardando armazenagem','Triagem de devolução concluída')
     and v_t.data_cosmetico is not null
     and upper(trim(coalesce(v_t.tela,'')))=v_tela
     and upper(trim(coalesce(v_t.laterais,'')))=v_laterais
     and upper(trim(coalesce(v_t.traseira,'')))=v_traseira
  then
    return jsonb_build_object(
      'ok',true,
      'idempotente',true,
      'voucher',v_t.voucher,
      'grade',v_t.grade,
      'gradeCosmetica',v_t.grade_cosmetica,
      'rebaixado',coalesce(v_t.rebaixado_bateria,false),
      'status',v_t.status_atual
    );
  end if;

  if v_t.status_atual is distinct from 'Aguardando triagem cosmética' then
    return jsonb_build_object(
      'ok',false,
      'erro',format(
        'Este aparelho não está aguardando triagem cosmética (status atual: %s).',
        coalesce(v_t.status_atual,'sem status')
      )
    );
  end if;

  v_reparo_validado := v_t.retorno_reparo_em IS NOT NULL
    AND (v_t.data_funcional IS NULL OR v_t.data_funcional AT TIME ZONE 'UTC' <= v_t.retorno_reparo_em)
    AND (v_t.data_cosmetico IS NULL OR v_t.data_cosmetico AT TIME ZONE 'UTC' <= v_t.retorno_reparo_em);

  select x.grade
    into v_grade_cosmetica
  from (
    values
      (v_tela,array_position(v_hierarquia,v_tela)),
      (v_laterais,array_position(v_hierarquia,v_laterais)),
      (v_traseira,array_position(v_hierarquia,v_traseira))
  ) as x(grade,pos)
  order by x.pos asc
  limit 1;

  -- Abaixo de 70% é sempre QUEBRADO, independentemente da estética.
  -- A faixa 70-79% continua seguindo o tratamento de Outlet existente.
  v_bateria_critica := (v_t.bateria_percentual BETWEEN 1 AND 69)
    OR lower(coalesce(v_t.status_bateria,'')) LIKE '%abaixo%70%';
  -- Faixa numérica prevalece sobre a descrição importada, que pode estar vazia/desatualizada.
  v_bateria_baixa := (CASE
    WHEN v_t.bateria_percentual IS NOT NULL THEN v_t.bateria_percentual BETWEEN 70 AND 79
    ELSE trim(coalesce(v_t.status_bateria,''))='Saúde da bateria entre 70 e 79%'
  END) AND NOT v_bateria_critica;

  if v_bateria_critica then
    v_grade_final := 'QUEBRADO';
    v_rebaixado := true;
  elsif NOT v_reparo_validado AND (
       upper(trim(coalesce(v_t.resultado_triagem_funcional,'')))='BAD'
       OR liquida_private.triagem_defeito_exige_quebrado(v_t.defeitos_adicionais)
     ) then
    v_grade_final := 'QUEBRADO';
    v_rebaixado := false;
  elsif v_bateria_baixa then
    v_rebaixado := true;
    if v_grade_cosmetica in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM') then
      v_grade_final := 'OUTLET';
    else
      v_grade_final := 'QUEBRADO';
    end if;
  else
    v_grade_final := v_grade_cosmetica;
    v_rebaixado := false;
  end if;

  update public.assurant_triagem
     set tela=v_tela,
         laterais=v_laterais,
         traseira=v_traseira,
         grade=v_grade_final,
         grade_cosmetica=v_grade_cosmetica,
         rebaixado_bateria=v_rebaixado,
         status_atual='Aguardando armazenagem',
         data_cosmetico=v_now,
         cosmetico_por=v_user,
         origem_triagem=CASE WHEN v_t.origem_triagem='tradein_online' THEN 'tradein_online' ELSE 'liquida' END,
         atualizado_em=v_now
   where id=v_t.id
   returning status_atual
      into v_status_final;

  return jsonb_build_object(
    'ok',true,
    'voucher',v_t.voucher,
    'grade',v_grade_final,
    'gradeCosmetica',v_grade_cosmetica,
    'rebaixado',v_rebaixado,
    'status',v_status_final
  );
end;
$function$
;

-- Retroativo somente aos aparelhos realmente recebidos e aguardando nova
-- cosmética; a última classificação laboratorial deve ser REPARADO.
WITH fontes AS (
  SELECT voucher,imei,resultado,devolvido_em FROM liquida_private.reparo_lab_avulsos
  WHERE status='devolvido_warehouse' AND devolvido_em IS NOT NULL
  UNION ALL
  SELECT voucher,imei,resultado,devolvido_em FROM liquida_private.reparo_lab_itens
  WHERE status='devolvido_warehouse' AND devolvido_em IS NOT NULL
), ultimos AS (
  SELECT DISTINCT ON (voucher,imei) voucher,imei,resultado,devolvido_em
  FROM fontes ORDER BY voucher,imei,devolvido_em DESC
)
UPDATE public.assurant_triagem t
SET retorno_reparo_em=u.devolvido_em
FROM ultimos u
WHERE t.voucher=u.voucher AND t.imei=u.imei
  AND t.id=(SELECT z.id FROM public.assurant_triagem z
    WHERE z.voucher=t.voucher AND z.imei=t.imei
    ORDER BY z.criado_em DESC NULLS LAST LIMIT 1)
  AND u.resultado='reparado'
  AND t.status_atual='Aguardando triagem cosmética'
  AND (t.data_cosmetico IS NULL OR t.data_cosmetico AT TIME ZONE 'UTC' <= u.devolvido_em)
  AND (t.retorno_reparo_em IS NULL OR t.retorno_reparo_em < u.devolvido_em);
