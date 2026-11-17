
-- Laboratorio: confirmacao individual de OS sem contaminar o malote inteiro.
CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_receber_os_gaia_parcial(p_linhas jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog','public','liquida_private'
SET statement_timeout TO '45s'
AS $$
DECLARE
 v_user uuid:=auth.uid();
 v_linha jsonb; v_voucher text; v_os text; v_motivo text;
 v_h liquida_private.reparo_lab_itens%rowtype;
 v_a liquida_private.reparo_lab_avulsos%rowtype;
 v_confirmados int:=0; v_recusados jsonb:='[]'::jsonb; v_ord int:=0;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND
  (p.is_master IS TRUE OR '/v2/assurant/laboratorio/reparos'=ANY(coalesce(p.telas_permitidas,'{}'::text[])))
 ) THEN RAISE EXCEPTION 'Sem permissão no Laboratório' USING ERRCODE='42501'; END IF;
 IF p_linhas IS NULL OR jsonb_typeof(p_linhas)<>'array' OR jsonb_array_length(p_linhas) NOT BETWEEN 1 AND 250
 THEN RAISE EXCEPTION 'Envie de 1 a 250 pares de OS por lote'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('assurant_reparo_lab_receber_os_gaia',0));
 FOR v_linha IN SELECT value FROM jsonb_array_elements(p_linhas) LOOP
  v_ord:=v_ord+1;
  v_voucher:=upper(btrim(coalesce(v_linha->>'voucher','')));
  v_os:=btrim(coalesce(v_linha->>'os_gaia',''));
  v_motivo:=NULL;
  BEGIN
   IF jsonb_typeof(v_linha)<>'object' OR
      v_voucher !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$' OR
      v_voucher ~ '^[0-9]{15}$' OR v_os !~ '^[A-Za-z0-9._/-]{2,60}$'
   THEN RAISE EXCEPTION 'Voucher/OS inválidos'; END IF;
   IF NOT liquida_private.reparo_lab_trilha_valida(v_voucher)
      OR NOT liquida_private.reparo_lab_enviado_warehouse(v_voucher)
   THEN RAISE EXCEPTION 'Sem histórico de triagem ou envio Warehouse'; END IF;

   v_h:=NULL;v_a:=NULL;
   SELECT * INTO v_h FROM liquida_private.reparo_lab_itens
     WHERE upper(btrim(voucher))=v_voucher
     ORDER BY atualizado_em DESC NULLS LAST,id DESC LIMIT 1 FOR UPDATE;
   SELECT * INTO v_a FROM liquida_private.reparo_lab_avulsos
     WHERE voucher=v_voucher FOR UPDATE;
   IF (v_h.id IS NULL AND v_a.id IS NULL) OR (v_h.id IS NOT NULL AND v_a.id IS NOT NULL)
   THEN RAISE EXCEPTION 'Voucher inexistente ou duplicado no Laboratório'; END IF;
   IF (v_h.id IS NOT NULL AND v_h.status<>'aguardando_recebimento')
     OR (v_a.id IS NOT NULL AND v_a.status<>'aguardando_recebimento')
   THEN RAISE EXCEPTION 'Voucher não está em Aguardando recebimento'; END IF;
   IF v_h.id IS NOT NULL AND EXISTS (
     SELECT 1 FROM liquida_private.reparo_lab_romaneios r
     WHERE r.id=v_h.romaneio_saida_id AND r.tipo='envio'
       AND r.conferencia_concluida_em IS NULL
   ) THEN RAISE EXCEPTION 'Malote ainda não conferido/encerrado'; END IF;
   IF EXISTS (
     SELECT 1 FROM liquida_private.reparo_lab_itens h
       WHERE upper(btrim(h.os_numero))=upper(v_os) AND (v_h.id IS NULL OR h.id<>v_h.id)
   ) OR EXISTS (
     SELECT 1 FROM liquida_private.reparo_lab_avulsos a
       WHERE upper(btrim(a.os_numero))=upper(v_os) AND (v_a.id IS NULL OR a.id<>v_a.id)
   ) THEN RAISE EXCEPTION 'OS GAIA vinculada a outro aparelho'; END IF;
   IF v_h.id IS NOT NULL THEN
     UPDATE liquida_private.reparo_lab_itens
       SET status='recebido',os_numero=v_os,os_referencia=v_os,
           recebido_em=now(),recebido_por=v_user,atualizado_em=now()
       WHERE id=v_h.id AND status='aguardando_recebimento';
     INSERT INTO liquida_private.reparo_lab_eventos(item_id,acao,usuario_id,anterior,posterior)
       VALUES (v_h.id,'recebimento_warehouse_os_gaia_parcial',v_user,
         jsonb_build_object('status',v_h.status,'os_numero',v_h.os_numero),
         jsonb_build_object('status','recebido','os_numero',v_os,'voucher',v_voucher));
   ELSE
     UPDATE liquida_private.reparo_lab_avulsos
       SET status='recebido',os_numero=v_os,os_referencia=v_os,
           recebido_em=now(),recebido_por=v_user,atualizado_em=now()
       WHERE id=v_a.id AND status='aguardando_recebimento';
     INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
       VALUES (v_a.id,'recebimento_warehouse_os_gaia_parcial',
          jsonb_build_object('status',v_a.status,'os_numero',v_a.os_numero),
          jsonb_build_object('status','recebido','os_numero',v_os,'voucher',v_voucher),v_user);
   END IF;
   v_confirmados:=v_confirmados+1;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_motivo=MESSAGE_TEXT;
    v_recusados:=v_recusados||jsonb_build_array(jsonb_build_object('linha',v_ord,
      'voucher',v_voucher,'os_gaia',v_os,'motivo',v_motivo));
  END;
 END LOOP;
 RETURN jsonb_build_object('ok',true,'confirmados',v_confirmados,'recusados',v_recusados,
  'total',jsonb_array_length(p_linhas));
END $$;
REVOKE ALL ON FUNCTION public.assurant_reparo_lab_receber_os_gaia_parcial(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_lab_receber_os_gaia_parcial(jsonb) TO authenticated;

-- Romaneio: identificar aparelho por voucher OU IMEI, sem aceitar ambiguidades.
CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_resolver_minuta_identificadores(p_identificadores jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog','public','liquida_private'
SET statement_timeout TO '30s'
AS $$
DECLARE v_user uuid:=auth.uid(); v_chave text; v_matches int; v_item record;
 v_validos jsonb:='[]'::jsonb; v_falhas jsonb:='[]'::jsonb;
BEGIN
 IF v_user IS NULL OR NOT EXISTS(
  SELECT 1 FROM public.user_profiles p WHERE p.id=v_user AND
  (p.is_master IS TRUE OR '/v2/assurant/laboratorio/reparos'=ANY(coalesce(p.telas_permitidas,'{}'::text[])))
 ) THEN RAISE EXCEPTION 'Sem permissão no Laboratório' USING ERRCODE='42501'; END IF;
 IF p_identificadores IS NULL OR jsonb_typeof(p_identificadores)<>'array' OR
    jsonb_array_length(p_identificadores) NOT BETWEEN 1 AND 250
 THEN RAISE EXCEPTION 'Informe de 1 a 250 vouchers/IMEIs'; END IF;
 FOR v_chave IN SELECT upper(btrim(value)) FROM jsonb_array_elements_text(p_identificadores) LOOP
  IF v_chave !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$' THEN
   v_falhas:=v_falhas||jsonb_build_array(jsonb_build_object('identificador',v_chave,'motivo','Identificador inválido'));
   CONTINUE;
  END IF;
  SELECT count(*),max(id),max(origem),max(voucher),max(imei),max(status),max(resultado),bool_or(vinculado)
    INTO v_matches,v_item.id,v_item.origem,v_item.voucher,v_item.imei,v_item.status,v_item.resultado,v_item.vinculado
  FROM (
   SELECT a.id,'individual'::text origem,a.voucher,a.imei,a.status,a.resultado,
    EXISTS(SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas_itens d
      WHERE d.item_id=a.id AND d.origem='individual') vinculado
   FROM liquida_private.reparo_lab_avulsos a
    WHERE upper(btrim(coalesce(a.voucher,'')))=v_chave OR upper(btrim(coalesce(a.imei,'')))=v_chave
   UNION ALL
   SELECT i.id,'historico',i.voucher,i.imei,i.status,i.resultado,
    (i.romaneio_retorno_id IS NOT NULL OR EXISTS(SELECT 1 FROM liquida_private.reparo_lab_devolucoes_unificadas_itens d
      WHERE d.item_id=i.id AND d.origem='historico'))
   FROM liquida_private.reparo_lab_itens i
    WHERE upper(btrim(coalesce(i.voucher,'')))=v_chave OR upper(btrim(coalesce(i.imei,'')))=v_chave
  ) u;
  IF v_matches=1 AND v_item.status='concluido'
      AND NOT coalesce(v_item.vinculado,false)
      AND v_item.resultado IN ('reparado','sem_reparo','irrecuperavel')
  THEN v_validos:=v_validos||jsonb_build_array(jsonb_build_object(
     'id',v_item.id,'origem',v_item.origem,'voucher',v_item.voucher,'imei',v_item.imei,'resultado',v_item.resultado));
  ELSE v_falhas:=v_falhas||jsonb_build_array(jsonb_build_object('identificador',v_chave,
    'motivo',CASE WHEN v_matches=0 THEN 'Voucher/IMEI não existe no Laboratório'
      WHEN v_matches>1 THEN 'IMEI/voucher ambíguo: mais de um registro; conciliar antes'
      ELSE 'Não está Concluído, está sem resultado ou já possui romaneio' END));
  END IF;
 END LOOP;
 RETURN jsonb_build_object('ok',jsonb_array_length(v_falhas)=0,'itens',v_validos,'falhas',v_falhas);
END $$;
REVOKE ALL ON FUNCTION public.assurant_reparo_lab_resolver_minuta_identificadores(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_lab_resolver_minuta_identificadores(jsonb) TO authenticated;
