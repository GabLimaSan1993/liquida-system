-- Faltas de malote precisam ficar pendentes, nunca marcar recebimento sem bipagem.
ALTER TABLE liquida_private.reparo_lab_itens DROP CONSTRAINT IF EXISTS reparo_lab_itens_status_check;
ALTER TABLE liquida_private.reparo_lab_itens ADD CONSTRAINT reparo_lab_itens_status_check
 CHECK (status=ANY(ARRAY['aguardando_recebimento','recebido','em_reparo','concluido','em_devolucao','devolvido_warehouse','devolucao_pendente_warehouse']::text[]));


CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_malotes(p_acao text, p_romaneio_id uuid DEFAULT NULL::uuid, p_codigo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
DECLARE v_user uuid:=auth.uid();v_r liquida_private.reparo_lab_romaneios%rowtype;
 v_i liquida_private.reparo_lab_itens%rowtype;v_codigo text:=upper(btrim(coalesce(p_codigo,'')));
 v_total integer;v_conferidos integer;v_pendentes integer;v_itens jsonb;v_malotes jsonb;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.user_profiles up WHERE up.id=v_user AND
   (up.is_master is true OR '/v2/assurant/laboratorio/reparos'=any(coalesce(up.telas_permitidas,'{}'::text[])))
 ) THEN RAISE EXCEPTION 'Sem permissão para conferência do malote no laboratório.' USING ERRCODE='42501';END IF;
 IF p_acao='listar' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.criado_em DESC),'[]'::jsonb) INTO v_malotes FROM(
   SELECT r.id,r.numero,r.pedido_id,p.lote,r.criado_em,r.conferencia_concluida_em,
    count(i.id)::integer total,count(i.conferido_em)::integer conferidos,
    count(*) filter(where i.conferido_em is null and i.status<>'devolucao_pendente_warehouse')::integer faltantes,
    count(*) filter(where i.status='devolucao_pendente_warehouse')::integer devolucoes_pendentes
   FROM liquida_private.reparo_lab_romaneios r
   JOIN liquida_private.reparo_pedidos p ON p.id=r.pedido_id
   JOIN liquida_private.reparo_lab_itens i ON i.romaneio_saida_id=r.id
   WHERE r.tipo='envio' AND r.status<>'cancelado' AND r.conferencia_concluida_em IS NULL
   GROUP BY r.id,p.id
   ORDER BY r.conferencia_concluida_em NULLS FIRST,r.criado_em DESC LIMIT 150
  ) z;
  RETURN jsonb_build_object('ok',true,'malotes',v_malotes);
 END IF;
 IF p_romaneio_id IS NULL THEN RAISE EXCEPTION 'Selecione um malote do Warehouse.';END IF;
 SELECT * INTO v_r FROM liquida_private.reparo_lab_romaneios
  WHERE id=p_romaneio_id AND tipo='envio' AND status<>'cancelado' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Malote Warehouse não encontrado ou cancelado.';END IF;
 IF p_acao='bipar' THEN
  IF v_r.conferencia_concluida_em IS NOT NULL THEN RAISE EXCEPTION 'Malote já conferido; a minuta foi emitida.';END IF;
  IF length(v_codigo) NOT BETWEEN 2 AND 80 THEN RAISE EXCEPTION 'Bipe o voucher, IMEI ou SKU válido.';END IF;
  -- Voucher/IMEI individual têm prioridade. SKU pode repetir: cada bipagem conta uma unidade ainda não conferida.
  SELECT * INTO v_i FROM liquida_private.reparo_lab_itens i
   WHERE i.romaneio_saida_id=v_r.id
    AND (upper(btrim(coalesce(i.voucher,'')))=v_codigo OR upper(btrim(coalesce(i.imei,'')))=v_codigo)
   ORDER BY i.ordem,i.id LIMIT 1 FOR UPDATE;
  IF FOUND THEN
   IF v_i.status='devolucao_pendente_warehouse' THEN RAISE EXCEPTION 'Devolução solicitada ao Warehouse; cancele antes de bipar.';END IF;
   IF v_i.status<>'aguardando_recebimento' THEN RAISE EXCEPTION 'Aparelho fora de Aguardando recebimento';END IF;
   IF v_i.conferido_em IS NOT NULL THEN RAISE EXCEPTION 'Aparelho % já foi conferido neste malote.',v_i.voucher;END IF;
  ELSE
   -- A leitura de SKU só identifica o aparelho se for exclusivo deste malote.
   -- Quando há diversas unidades do mesmo SKU, exigir voucher/IMEI para garantir identidade.
   IF (SELECT count(*) FROM liquida_private.reparo_lab_itens i
       WHERE i.romaneio_saida_id=v_r.id AND upper(btrim(coalesce(i.sku,'')))=v_codigo)>1 THEN
      RAISE EXCEPTION 'SKU compartilhado por vários aparelhos do malote. Para conferir cada unidade fisicamente, bipe o Voucher ou o IMEI.';
   END IF;
   SELECT * INTO v_i FROM liquida_private.reparo_lab_itens i
    WHERE i.romaneio_saida_id=v_r.id AND upper(btrim(coalesce(i.sku,'')))=v_codigo
      AND i.conferido_em IS NULL
    ORDER BY i.ordem,i.id LIMIT 1 FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Código não pertence ao malote ou todas as unidades do SKU já foram conferidas.';END IF;
  END IF;
  UPDATE liquida_private.reparo_lab_itens SET conferido_em=now(),conferido_por=v_user,conferido_codigo=v_codigo,atualizado_em=now()
   WHERE id=v_i.id RETURNING * INTO v_i;
  INSERT INTO liquida_private.reparo_lab_eventos(item_id,romaneio_id,acao,usuario_id,posterior)
   VALUES(v_i.id,v_r.id,'conferencia_malote_bipagem',v_user,
    jsonb_build_object('voucher',v_i.voucher,'imei',v_i.imei,'sku',v_i.sku,'codigo_lido',v_codigo));
 ELSIF p_acao='desfazer' THEN
  IF v_r.conferencia_concluida_em IS NOT NULL THEN RAISE EXCEPTION 'A minuta já foi gerada: não é possível desfazer conferência.';END IF;
  SELECT * INTO v_i FROM liquida_private.reparo_lab_itens i
    WHERE i.romaneio_saida_id=v_r.id AND i.conferido_em IS NOT NULL AND
      (upper(btrim(coalesce(i.voucher,'')))=v_codigo OR upper(btrim(coalesce(i.imei,'')))=v_codigo)
    LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Voucher/IMEI não consta entre os conferidos.';END IF;
  UPDATE liquida_private.reparo_lab_itens SET conferido_em=NULL,conferido_por=NULL,conferido_codigo=NULL,atualizado_em=now() WHERE id=v_i.id RETURNING * INTO v_i;
  INSERT INTO liquida_private.reparo_lab_eventos(item_id,romaneio_id,acao,usuario_id,posterior)
   VALUES(v_i.id,v_r.id,'conferencia_malote_desfeita',v_user,jsonb_build_object('voucher',v_i.voucher));
 ELSIF p_acao='solicitar_devolucao' THEN
  IF v_r.conferencia_concluida_em IS NOT NULL THEN RAISE EXCEPTION 'Malote fechado';END IF;
  SELECT * INTO v_i FROM liquida_private.reparo_lab_itens i
    WHERE i.romaneio_saida_id=v_r.id
      AND (upper(btrim(coalesce(i.voucher,'')))=v_codigo OR upper(btrim(coalesce(i.imei,'')))=v_codigo)
    LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Aparelho não pertence ao malote';END IF;
  IF v_i.conferido_em IS NOT NULL OR v_i.status<>'aguardando_recebimento'
    THEN RAISE EXCEPTION 'Somente aparelhos faltantes e ainda não recebidos podem ser devolvidos';END IF;
  UPDATE liquida_private.reparo_lab_itens SET status='devolucao_pendente_warehouse',atualizado_em=now()
    WHERE id=v_i.id RETURNING * INTO v_i;
  INSERT INTO liquida_private.reparo_lab_eventos(item_id,romaneio_id,acao,usuario_id,posterior)
    VALUES(v_i.id,v_r.id,'falta_malote_devolucao_solicitada_warehouse',v_user,
      jsonb_build_object('voucher',v_i.voucher,'status',v_i.status,'recebido_fisicamente',false));
 ELSIF p_acao='restaurar_devolucao' THEN
  IF v_r.conferencia_concluida_em IS NOT NULL THEN RAISE EXCEPTION 'Malote fechado';END IF;
  SELECT * INTO v_i FROM liquida_private.reparo_lab_itens i
    WHERE i.romaneio_saida_id=v_r.id AND i.status='devolucao_pendente_warehouse'
      AND (upper(btrim(coalesce(i.voucher,'')))=v_codigo OR upper(btrim(coalesce(i.imei,'')))=v_codigo)
    LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Não há solicitação pendente deste aparelho';END IF;
  UPDATE liquida_private.reparo_lab_itens SET status='aguardando_recebimento',atualizado_em=now()
    WHERE id=v_i.id RETURNING * INTO v_i;
  INSERT INTO liquida_private.reparo_lab_eventos(item_id,romaneio_id,acao,usuario_id,posterior)
    VALUES(v_i.id,v_r.id,'falta_malote_devolucao_cancelada',v_user,
      jsonb_build_object('voucher',v_i.voucher,'status',v_i.status));
 ELSIF p_acao='gerar_minuta' THEN
  SELECT count(*)::integer,count(conferido_em)::integer,
    count(*) filter (where status='devolucao_pendente_warehouse')::integer
    INTO v_total,v_conferidos,v_pendentes
    FROM liquida_private.reparo_lab_itens i WHERE i.romaneio_saida_id=v_r.id;
  IF v_total=0 OR v_conferidos+v_pendentes<>v_total THEN
   RAISE EXCEPTION 'Malote pendente: % bipados, % devoluções solicitadas, % total. Decida sobre todas as unidades.',v_conferidos,v_pendentes,v_total;
  END IF;
  IF v_r.conferencia_concluida_em IS NULL THEN
   UPDATE liquida_private.reparo_lab_romaneios
     SET conferencia_concluida_em=now(),conferencia_concluida_por=v_user WHERE id=v_r.id;
   INSERT INTO liquida_private.reparo_lab_eventos(romaneio_id,acao,usuario_id,posterior)
    VALUES(v_r.id,'minuta_gaia_gerada',v_user,jsonb_build_object('total',v_total));
  END IF;
 ELSIF p_acao<>'detalhar' THEN
  RAISE EXCEPTION 'Ação de malote inválida.';
 END IF;
 IF p_acao NOT IN ('bipar','desfazer') THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',i.id,'voucher',i.voucher,'imei',i.imei,'modelo',i.modelo,'sku',i.sku,'grade',i.grade,
   'defeitos_adicionais',i.defeitos_adicionais,'os_gaia',coalesce(i.os_numero,''),
   'conferido_em',i.conferido_em,'conferido_codigo',i.conferido_codigo,'status',i.status
 ) ORDER BY i.ordem,i.id),'[]'::jsonb) INTO v_itens
 FROM liquida_private.reparo_lab_itens i WHERE i.romaneio_saida_id=v_r.id;
 ELSE
  v_itens:='[]'::jsonb;
 END IF;
 SELECT count(*)::integer,count(conferido_em)::integer,
    count(*) filter(where status='devolucao_pendente_warehouse')::integer
    INTO v_total,v_conferidos,v_pendentes
 FROM liquida_private.reparo_lab_itens i WHERE i.romaneio_saida_id=v_r.id;
 RETURN jsonb_build_object('ok',true,
  'romaneio',(SELECT to_jsonb(r)||jsonb_build_object('lote',p.lote)
              FROM liquida_private.reparo_lab_romaneios r JOIN liquida_private.reparo_pedidos p ON p.id=r.pedido_id WHERE r.id=v_r.id),
  'total',v_total,'conferidos',v_conferidos,'devolucoes_pendentes',v_pendentes,
  'faltantes',v_total-v_conferidos-v_pendentes,'itens',v_itens,
  'ultimo_conferido',CASE WHEN v_i.id IS NULL THEN null ELSE jsonb_build_object('id',v_i.id,'voucher',v_i.voucher,'modelo',v_i.modelo,'sku',v_i.sku,'conferido_em',v_i.conferido_em) END);
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
