-- Retorno físico por minuta: resultado técnico define a fila sem movimentação Oracle automática.
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
           oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
           atualizado_em=now() AT TIME ZONE 'UTC'
       WHERE id=v_t.id;
     v_destino:='1000'; v_entrada:='Scrap — aguardando alocação';
   ELSIF v_l.resultado='sem_reparo' THEN
     UPDATE liquida_private.reparo_itens SET status='retorno_armazenagem' WHERE id=v_i.id;
     UPDATE public.assurant_triagem
       SET status_atual='Aguardando armazenagem',grade='QUEBRADO',
           oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
           atualizado_em=now() AT TIME ZONE 'UTC'
       WHERE id=v_t.id;
     v_destino:='7';v_entrada:='Aguardando armazenagem — sem reparo';
   ELSE
     UPDATE liquida_private.reparo_itens SET status='retorno_armazenagem' WHERE id=v_i.id;
     UPDATE public.assurant_triagem
       SET status_atual='Aguardando triagem cosmética',
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
         oracle_confirmado_em=NULL,oracle_confirmado_por=NULL,
         atualizado_em=now() AT TIME ZONE 'UTC'
     WHERE id=v_triagem_id;
   ELSIF v_classificacao IN ('sem_reparo','irrecuperavel') THEN
     v_status_destino:='Aguardando armazenagem';
     v_subinv_destino:=CASE WHEN v_classificacao='irrecuperavel' THEN '1000' ELSE '7' END;
     UPDATE public.assurant_triagem
     SET status_atual=v_status_destino,grade='QUEBRADO',
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
