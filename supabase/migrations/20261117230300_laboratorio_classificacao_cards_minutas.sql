CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_devolucao(p_acao text, p_itens jsonb DEFAULT NULL::jsonb, p_todos boolean DEFAULT false, p_manifesto_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '45s'
AS $function$
DECLARE
 v_usuario uuid := auth.uid();
 v_ids_ind uuid[] := '{}'::uuid[];
 v_ids_hist uuid[] := '{}'::uuid[];
 v_count_ind integer := 0;
 v_count_hist integer := 0;
 v_total integer := 0;
 v_manifesto uuid;
 v_numero bigint;
 v_pedido uuid;
 v_retorno uuid;
 v_affected integer;
 v_linha record;
BEGIN
 IF v_usuario IS NULL OR NOT EXISTS (
   SELECT 1 FROM public.user_profiles u
   WHERE u.id=v_usuario AND (
     coalesce(u.is_master,false)
     OR u.telas_permitidas @> ARRAY['/v2/assurant/laboratorio/reparos']::text[]
   )
 ) THEN RAISE EXCEPTION 'Sem permissão de Laboratório de Reparos'
   USING ERRCODE='42501'; END IF;

 IF p_acao='listar' THEN
  RETURN jsonb_build_object('ok',true,'romaneios',
    coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.retorno_warehouse_pendente DESC,t.numero DESC)
      FROM (SELECT id,numero,total,status,criado_em,
          (SELECT CASE
              WHEN count(DISTINCT di.resultado)=1
                   AND min(di.resultado) IN ('reparado','sem_reparo','irrecuperavel')
              THEN min(di.resultado)
              ELSE 'misto'
            END
           FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
           WHERE di.devolucao_id=d.id) AS classificacao,
          (SELECT count(*)::int FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
            WHERE di.devolucao_id=d.id AND di.devolucao_lab_solicitada_em IS NOT NULL)
            AS retorno_warehouse_pendente,
          (SELECT nome FROM public.user_profiles WHERE id=d.criado_por) AS criado_por_nome
        FROM liquida_private.reparo_lab_devolucoes_unificadas d
        ORDER BY retorno_warehouse_pendente DESC,numero DESC LIMIT 40) t),'[]'::jsonb));
 END IF;

 IF p_acao='detalhar' THEN
  IF p_manifesto_id IS NULL THEN RAISE EXCEPTION 'Selecione o romaneio'; END IF;
  IF NOT EXISTS (SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas
                 WHERE id=p_manifesto_id) THEN
    RAISE EXCEPTION 'Romaneio não encontrado'; END IF;
  RETURN jsonb_build_object('ok',true,
    'romaneio',(SELECT jsonb_build_object('id',d.id,'numero',d.numero,
      'total',d.total,'status',d.status,'criado_em',d.criado_em,
      'criado_por_nome',(SELECT nome FROM public.user_profiles WHERE id=d.criado_por))
      FROM liquida_private.reparo_lab_devolucoes_unificadas d WHERE id=p_manifesto_id),
    'itens',coalesce((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.voucher,i.item_id)
      FROM liquida_private.reparo_lab_devolucoes_unificadas_itens i
      WHERE i.devolucao_id=p_manifesto_id),'[]'::jsonb));
 END IF;

 IF p_acao IS DISTINCT FROM 'gerar' THEN
   RAISE EXCEPTION 'Ação de devolução inválida';
 END IF;

 -- Serializa emissões simultâneas, impedindo repetir o mesmo voucher em minutas.
 PERFORM pg_advisory_xact_lock(hashtext('assurant_reparo_lab_devolucao_unificada'));

 IF coalesce(p_todos,false) THEN
   RAISE EXCEPTION 'Minuta total desabilitada. Selecione os aparelhos ou importe a planilha de vouchers.';
 END IF;
 IF coalesce(p_todos,false) THEN
   SELECT coalesce(array_agg(id), '{}'::uuid[])
   INTO v_ids_ind FROM liquida_private.reparo_lab_avulsos
   WHERE status='concluido';
   SELECT coalesce(array_agg(id), '{}'::uuid[])
   INTO v_ids_hist FROM liquida_private.reparo_lab_itens
   WHERE status='concluido' AND romaneio_retorno_id IS NULL;
 ELSE
   IF p_itens IS NULL OR jsonb_typeof(p_itens)<>'array'
     OR jsonb_array_length(p_itens)<1 OR jsonb_array_length(p_itens)>5000 THEN
     RAISE EXCEPTION 'Selecione de 1 a 5000 aparelhos concluídos';
   END IF;
   IF EXISTS (
     SELECT 1 FROM jsonb_array_elements(p_itens) AS e(x)
     WHERE jsonb_typeof(e.x)<>'object'
       OR e.x->>'origem' NOT IN ('individual','historico')
       OR coalesce(e.x->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   ) THEN RAISE EXCEPTION 'Itens inválidos para minuta de devolução'; END IF;
   SELECT coalesce(array_agg(DISTINCT (e.x->>'id')::uuid), '{}'::uuid[])
     INTO v_ids_ind
   FROM jsonb_array_elements(p_itens) AS e(x)
   WHERE e.x->>'origem'='individual';
   SELECT coalesce(array_agg(DISTINCT (e.x->>'id')::uuid), '{}'::uuid[])
     INTO v_ids_hist
   FROM jsonb_array_elements(p_itens) AS e(x)
   WHERE e.x->>'origem'='historico';
 END IF;
 v_count_ind:=coalesce(array_length(v_ids_ind,1),0);
 v_count_hist:=coalesce(array_length(v_ids_hist,1),0);
 v_total:=v_count_ind+v_count_hist;
 IF v_total<1 THEN RAISE EXCEPTION 'Não há reparos concluídos disponíveis para devolução'; END IF;

 IF v_count_ind <> (
    SELECT count(*) FROM liquida_private.reparo_lab_avulsos a
    WHERE a.id=ANY(v_ids_ind) AND a.status='concluido'
      AND NOT EXISTS (SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas_itens d
                      WHERE d.item_id=a.id AND d.origem='individual')
   )
 OR v_count_hist <> (
    SELECT count(*) FROM liquida_private.reparo_lab_itens i
    WHERE i.id=ANY(v_ids_hist) AND i.status='concluido' AND i.romaneio_retorno_id IS NULL
      AND NOT EXISTS (SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas_itens d
                      WHERE d.item_id=i.id AND d.origem='historico')
   ) THEN
   RAISE EXCEPTION 'Um ou mais vouchers já foram devolvidos ou não estão mais concluídos. Atualize a lista.';
 END IF;

 -- Não emitir romaneios com classificações finais misturadas.
 IF (SELECT count(DISTINCT resultado) FROM (
   SELECT resultado FROM liquida_private.reparo_lab_avulsos WHERE id=ANY(v_ids_ind)
   UNION ALL SELECT resultado FROM liquida_private.reparo_lab_itens WHERE id=ANY(v_ids_hist)
 ) z) <> 1 OR EXISTS (
   SELECT 1 FROM (
     SELECT resultado FROM liquida_private.reparo_lab_avulsos WHERE id=ANY(v_ids_ind)
     UNION ALL SELECT resultado FROM liquida_private.reparo_lab_itens WHERE id=ANY(v_ids_hist)
   ) z WHERE resultado NOT IN ('reparado','sem_reparo','irrecuperavel') OR resultado IS NULL
 ) THEN RAISE EXCEPTION 'A minuta deve conter somente Reparados, somente Quebrados ou somente Scrap.';END IF;

 INSERT INTO liquida_private.reparo_lab_devolucoes_unificadas(criado_por,total)
 VALUES (v_usuario,v_total) RETURNING id,numero INTO v_manifesto,v_numero;

 INSERT INTO liquida_private.reparo_lab_devolucoes_unificadas_itens
 (devolucao_id,origem,item_id,voucher,imei,modelo,os_numero,resultado)
 SELECT v_manifesto,'individual',a.id,a.voucher,a.imei,a.modelo,a.os_numero,a.resultado
 FROM liquida_private.reparo_lab_avulsos a WHERE a.id=ANY(v_ids_ind);
 INSERT INTO liquida_private.reparo_lab_devolucoes_unificadas_itens
 (devolucao_id,origem,item_id,voucher,imei,modelo,os_numero,resultado)
 SELECT v_manifesto,'historico',i.id,coalesce(i.voucher,''),i.imei,i.modelo,i.os_numero,i.resultado
 FROM liquida_private.reparo_lab_itens i WHERE i.id=ANY(v_ids_hist);

 UPDATE liquida_private.reparo_lab_avulsos a
 SET status='em_devolucao',atualizado_em=now()
 WHERE a.id=ANY(v_ids_ind) AND a.status='concluido';
 GET DIAGNOSTICS v_affected=ROW_COUNT;
 IF v_affected<>v_count_ind THEN
   RAISE EXCEPTION 'Os aparelhos individuais sofreram alteração concorrente. Tente novamente.';
 END IF;

 INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
 SELECT a.id,'minuta_devolucao_gerada',
   jsonb_build_object('status','concluido'),
   jsonb_build_object('status','em_devolucao','romaneio',v_numero,'romaneio_id',v_manifesto),
   v_usuario
 FROM liquida_private.reparo_lab_avulsos a WHERE a.id=ANY(v_ids_ind);

 -- Preserva o vínculo com o fluxo de retorno anterior para itens históricos.
 -- Um romaneio nativo por pedido, vinculado ao romaneio unificado impresso.
 FOR v_pedido IN
   SELECT DISTINCT pedido_id
   FROM liquida_private.reparo_lab_itens WHERE id=ANY(v_ids_hist)
 LOOP
   INSERT INTO liquida_private.reparo_lab_romaneios
      (pedido_id,tipo,criado_por)
   VALUES (v_pedido,'retorno',v_usuario)
   RETURNING id INTO v_retorno;
   UPDATE liquida_private.reparo_lab_itens
   SET status='em_devolucao',romaneio_retorno_id=v_retorno,atualizado_em=now()
   WHERE pedido_id=v_pedido AND id=ANY(v_ids_hist) AND status='concluido'
     AND romaneio_retorno_id IS NULL;
   GET DIAGNOSTICS v_affected=ROW_COUNT;
   IF v_affected <> (SELECT count(*) FROM liquida_private.reparo_lab_itens
                       WHERE pedido_id=v_pedido AND id=ANY(v_ids_hist))
   THEN RAISE EXCEPTION 'Os itens históricos sofreram alteração concorrente. Tente novamente.';
   END IF;
   INSERT INTO liquida_private.reparo_lab_eventos(romaneio_id,acao,usuario_id,posterior)
   VALUES(v_retorno,'minuta_devolucao_unificada',v_usuario,
     jsonb_build_object('romaneio_unificado_id',v_manifesto,'numero',v_numero,'quantidade',v_affected));
 END LOOP;

 RETURN jsonb_build_object('ok',true,'romaneio_id',v_manifesto,
   'numero',v_numero,'total',v_total,
   'individuais',v_count_ind,'historicos',v_count_hist);
END
$function$
;
