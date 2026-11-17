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
    coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.numero DESC)
      FROM (SELECT id,numero,total,status,criado_em,
          (SELECT nome FROM public.user_profiles WHERE id=d.criado_por) AS criado_por_nome
        FROM liquida_private.reparo_lab_devolucoes_unificadas d
        ORDER BY numero DESC LIMIT 40) t),'[]'::jsonb));
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

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_individual(p_acao text, p_vouchers jsonb DEFAULT NULL::jsonb, p_item_id uuid DEFAULT NULL::uuid, p_busca text DEFAULT NULL::text, p_status text DEFAULT NULL::text, p_limite integer DEFAULT 100, p_offset integer DEFAULT 0, p_os text DEFAULT NULL::text, p_defeitos jsonb DEFAULT NULL::jsonb, p_resultado text DEFAULT NULL::text, p_observacoes text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET statement_timeout TO '45s'
AS $function$
DECLARE
 v_usuario uuid:=auth.uid();
 v_avulso liquida_private.reparo_lab_avulsos%ROWTYPE;
 v_antigo jsonb;
 v_novo jsonb;
 v_total integer:=0;
 v_importados integer:=0;
 v_ja_existiam integer:=0;
 v_liberados integer:=0;

 v_duplicados integer:=0;
 v_lista jsonb;
 v_termo text:=upper(btrim(coalesce(p_busca,'')));
BEGIN
 -- Mesma política da página principal do laboratório, sem expor a tabela ao PostgREST.
 IF v_usuario IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.user_profiles up
      WHERE up.id=v_usuario AND (
        coalesce(up.is_master,false)
        OR up.telas_permitidas @> ARRAY['/v2/assurant/laboratorio/reparos']::text[]
      )
    )
 THEN RAISE EXCEPTION 'Sem permissão para Laboratório de Reparos. Solicite acesso na Gestão de Usuários.' USING ERRCODE='42501'; END IF;

 IF p_acao='importar' THEN
   IF p_vouchers IS NULL OR jsonb_typeof(p_vouchers)<>'array' THEN RAISE EXCEPTION 'Envie uma lista de vouchers'; END IF;
   SELECT jsonb_array_length(p_vouchers) INTO v_total;
   IF v_total<1 OR v_total>500 THEN RAISE EXCEPTION 'Envie de 1 a 500 vouchers por lote de importação'; END IF;
   IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_vouchers) x
     WHERE jsonb_typeof(x.value)<>'string'
       OR upper(btrim(x.value #>> '{}')) !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$')
   THEN RAISE EXCEPTION 'Há voucher inválido no arquivo'; END IF;

   IF EXISTS (SELECT 1 FROM (SELECT DISTINCT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers)) e
     WHERE NOT liquida_private.reparo_lab_trilha_valida(e.voucher) OR NOT liquida_private.reparo_lab_enviado_warehouse(e.voucher))
   THEN RAISE EXCEPTION 'Entrada no laboratório bloqueada: voucher sem histórico ou sem envio confirmado pelo Warehouse. Nenhum voucher foi cadastrado.' USING ERRCODE='22023';
   END IF;
   -- Evita duplicação mesmo quando duas pessoas importam ao mesmo tempo.
   PERFORM pg_advisory_xact_lock(hashtext('assurant_reparo_lab_individual_importar'));
   WITH entrada AS (
     SELECT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers)
   ), unicos AS (
     SELECT DISTINCT voucher FROM entrada
   ), criados AS (
     INSERT INTO liquida_private.reparo_lab_avulsos(
         voucher,imei,modelo,sku,grade,defeitos_origem,defeitos_atual,
         alerta_origem,criado_por,status,recebido_em,recebido_por)
     SELECT
        e.voucher,
        CASE WHEN t.variantes=1 THEN t.imei ELSE NULL END,
        t.modelo,t.sku,t.grade,
        coalesce(t.defeitos,'[]'::jsonb),
        coalesce(t.defeitos,'[]'::jsonb),
        CASE WHEN t.voucher IS NULL THEN 'Voucher sem triagem localizada; confirmar identificação'
             WHEN t.variantes>1 THEN 'Voucher com mais de um IMEI histórico; confirmar aparelho'
             ELSE NULL END,
        v_usuario,'aguardando_recebimento',NULL,NULL
     FROM unicos e
     LEFT JOIN LATERAL (
       SELECT v.voucher,v.imei,v.modelo,v.sku,v.grade,
         liquida_private.reparo_lab_extrair_defeitos(v.respostas_funcional,v.defeitos_adicionais) AS defeitos,
         (SELECT count(DISTINCT nullif(btrim(t2.imei),'')) FROM public.assurant_triagem t2
          WHERE upper(btrim(t2.voucher))=e.voucher) variantes
       FROM public.assurant_triagem v
       WHERE upper(btrim(v.voucher))=e.voucher
       ORDER BY v.data_funcional DESC NULLS LAST,v.criado_em DESC NULLS LAST
       LIMIT 1
     ) t ON true
     WHERE NOT EXISTS (SELECT 1 FROM liquida_private.reparo_lab_itens ant
       WHERE upper(btrim(ant.voucher))=e.voucher)
     ON CONFLICT (voucher) DO NOTHING
     RETURNING id,voucher
   )
   SELECT count(*) INTO v_importados FROM criados;

   WITH e AS (SELECT upper(btrim(value)) voucher FROM jsonb_array_elements_text(p_vouchers))
   SELECT count(*)-count(DISTINCT voucher) INTO v_duplicados FROM e;
   -- Nova importação é somente pré-registro. Confirmação física ocorre em ação distinta.
   v_liberados:=0;
   v_ja_existiam:=greatest(0,v_total-v_importados-v_duplicados);
   INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
   SELECT a.id,'importacao_aguardando_recebimento',NULL,
     jsonb_build_object('voucher',a.voucher,'status','aguardando_recebimento'),v_usuario
   FROM liquida_private.reparo_lab_avulsos a
   WHERE a.criado_por=v_usuario AND a.status='aguardando_recebimento'
     AND a.criado_em=transaction_timestamp()
     AND NOT EXISTS(SELECT 1 FROM liquida_private.reparo_lab_avulsos_eventos ev
       WHERE ev.item_id=a.id AND ev.acao='importacao_aguardando_recebimento');
   RETURN jsonb_build_object('ok',true,'linhas',v_total,'incluidos',v_importados,
                             'liberados_pendentes',v_liberados,
                             'ja_existentes',v_ja_existiam,'duplicados_na_planilha',v_duplicados,
                             'recebimento_confirmado_por',NULL,
                             'destino','aguardando_recebimento','origem','voucher_individual');
 END IF;

 IF p_acao='exportar' THEN
   RETURN jsonb_build_object('ok',true,'itens',coalesce(
     (SELECT jsonb_agg(to_jsonb(q) ORDER BY q.voucher,q.origem)
      FROM (SELECT voucher,imei,status,'individual'::text origem FROM liquida_private.reparo_lab_avulsos
        UNION ALL SELECT voucher,imei,status,'historico'::text origem FROM liquida_private.reparo_lab_itens) q),'[]'::jsonb));
 END IF;
 IF p_acao='listar' THEN
   IF p_limite IS NULL OR p_limite<1 OR p_limite>200 OR p_offset<0 OR p_offset>200000
     THEN RAISE EXCEPTION 'Paginação inválida'; END IF;
   IF char_length(v_termo)>120 THEN RAISE EXCEPTION 'Busca muito longa'; END IF;
   IF p_resultado IS NOT NULL AND p_resultado NOT IN ('reparado','sem_reparo','irrecuperavel')
      THEN RAISE EXCEPTION 'Classificação final inválida';END IF;
    IF p_status IS NOT NULL AND p_status NOT IN
       ('aguardando_recebimento','recebido','em_reparo','concluido','em_devolucao','devolvido_warehouse','divergencia_voucher')
     THEN RAISE EXCEPTION 'Status inválido'; END IF;

   WITH unidos AS MATERIALIZED (
     SELECT a.id,a.voucher,a.imei,a.modelo,a.sku,a.grade,a.status,
        a.os_referencia,a.os_numero,a.defeitos_origem,a.defeitos_atual,
        a.alerta_origem,a.recebido_em,a.recebido_por,a.tecnico_id,a.iniciado_em,
        a.concluido_em,a.resultado,a.observacoes,a.criado_em,a.atualizado_em,
        NULL::uuid AS pedido_id,NULL::uuid AS romaneio_saida_id,
        NULL::uuid AS romaneio_retorno_id,'individual'::text AS origem
     FROM liquida_private.reparo_lab_avulsos a
     UNION ALL
     SELECT i.id,i.voucher,i.imei,i.modelo,i.sku,i.grade,i.status,
        i.os_referencia,i.os_numero,i.defeitos_origem,i.defeitos_atual,
        i.alerta_origem,i.recebido_em,i.recebido_por,i.tecnico_id,i.iniciado_em,
        i.concluido_em,i.resultado,i.observacoes,
        coalesce(i.recebido_em,i.atualizado_em) AS criado_em,i.atualizado_em,
        i.pedido_id,i.romaneio_saida_id,i.romaneio_retorno_id,'historico'::text AS origem
     FROM liquida_private.reparo_lab_itens i
   ), filtrado AS (
     SELECT * FROM unidos
     WHERE (p_status IS NULL OR status=p_status)
       AND (p_resultado IS NULL OR resultado=p_resultado)
       AND (v_termo='' OR upper(coalesce(voucher,'')) LIKE '%'||v_termo||'%'
            OR upper(coalesce(imei,'')) LIKE '%'||v_termo||'%'
            OR upper(coalesce(os_numero,os_referencia,'')) LIKE '%'||v_termo||'%'
            OR upper(coalesce(modelo,'')) LIKE '%'||v_termo||'%')
   ), pagina AS (
     SELECT * FROM filtrado
     ORDER BY atualizado_em DESC,id DESC LIMIT p_limite OFFSET p_offset
   )
   SELECT jsonb_build_object(
      'total',(SELECT count(*) FROM filtrado),
      'resumo',(SELECT jsonb_object_agg(status,n) FROM
        (SELECT status,count(*) n FROM unidos GROUP BY status) s),
      'itens',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.atualizado_em DESC,x.id DESC) FROM pagina x),'[]'::jsonb)
   ) INTO v_lista;
   RETURN v_lista;
 END IF;

 IF p_item_id IS NULL THEN RAISE EXCEPTION 'Selecione um voucher'; END IF;
 SELECT * INTO v_avulso FROM liquida_private.reparo_lab_avulsos WHERE id=p_item_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Voucher individual não encontrado'; END IF;
 IF NOT liquida_private.reparo_lab_trilha_valida(v_avulso.voucher)
 THEN RAISE EXCEPTION 'Voucher sem histórico de recebimento e passagem pela triagem. Operação bloqueada.'
   USING ERRCODE='22023';
 END IF;
 v_antigo:=to_jsonb(v_avulso);
 IF p_acao='receber' THEN
   IF v_avulso.status<>'aguardando_recebimento' THEN RAISE EXCEPTION 'Voucher já foi recebido'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET status='recebido',
      recebido_em=now(),recebido_por=v_usuario,atualizado_em=now()
      WHERE id=v_avulso.id;
 ELSIF p_acao='validar_os' THEN
   IF v_avulso.status NOT IN ('recebido','em_reparo') THEN RAISE EXCEPTION 'OS disponível somente na bancada'; END IF;
   IF nullif(btrim(coalesce(p_os,'')),'') IS NULL OR length(p_os)>60
   THEN RAISE EXCEPTION 'Informe OS válida de até 60 caracteres'; END IF;
   IF EXISTS(SELECT 1 FROM liquida_private.reparo_lab_avulsos a
             WHERE upper(btrim(a.os_numero))=upper(btrim(p_os)) AND a.id<>v_avulso.id)
       OR EXISTS(SELECT 1 FROM liquida_private.reparo_lab_itens i
                 WHERE upper(btrim(i.os_numero))=upper(btrim(p_os)))
   THEN RAISE EXCEPTION 'OS já vinculada a outro voucher'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET os_numero=btrim(p_os),atualizado_em=now()
   WHERE id=v_avulso.id;
 ELSIF p_acao='salvar_defeitos' THEN
   IF v_avulso.status NOT IN ('recebido','em_reparo') THEN RAISE EXCEPTION 'Voucher não está disponível no técnico'; END IF;
   IF p_defeitos IS NULL OR jsonb_typeof(p_defeitos)<>'array' OR jsonb_array_length(p_defeitos)>60
     OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_defeitos) x
       WHERE jsonb_typeof(x.value)<>'string' OR length(x.value #>> '{}')>150)
   THEN RAISE EXCEPTION 'Defeitos inválidos'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.user_profiles up WHERE up.id=v_usuario AND up.is_master)
      AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_defeitos) d
        WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(coalesce(v_avulso.defeitos_atual,'[]'::jsonb)) atual
          WHERE lower(btrim(atual))=lower(btrim(d)))
          AND NOT EXISTS(SELECT 1 FROM public.triagem_defeitos cat
            WHERE cat.ativo IS TRUE AND lower(btrim(cat.nome))=lower(btrim(d))))
   THEN RAISE EXCEPTION 'Apenas administradores podem cadastrar defeitos fora do catálogo. Selecione um defeito existente.' USING ERRCODE='42501'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET status='em_reparo',
      defeitos_atual=p_defeitos,tecnico_id=v_usuario,
      iniciado_em=coalesce(iniciado_em,now()),atualizado_em=now()
      WHERE id=v_avulso.id;
 ELSIF p_acao='concluir' THEN
   IF v_avulso.status NOT IN ('recebido','em_reparo') THEN RAISE EXCEPTION 'Aparelho não está em reparo'; END IF;
   IF v_avulso.os_numero IS NULL THEN RAISE EXCEPTION 'Confirme a OS antes de concluir'; END IF;
   IF p_resultado IS NULL OR p_resultado NOT IN('reparado','sem_reparo','irrecuperavel') THEN
     RAISE EXCEPTION 'Informe resultado'; END IF;
   UPDATE liquida_private.reparo_lab_avulsos SET status='concluido',
     tecnico_id=coalesce(tecnico_id,v_usuario),iniciado_em=coalesce(iniciado_em,now()),
     concluido_em=now(),resultado=p_resultado,
     observacoes=nullif(btrim(p_observacoes),''),atualizado_em=now()
   WHERE id=v_avulso.id;
 ELSE
   RAISE EXCEPTION 'Ação inválida'; END IF;
 SELECT * INTO v_avulso FROM liquida_private.reparo_lab_avulsos WHERE id=p_item_id;
 INSERT INTO liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
 VALUES(p_item_id,p_acao,v_antigo,to_jsonb(v_avulso),v_usuario);
 RETURN jsonb_build_object('ok',true,'item',to_jsonb(v_avulso)||jsonb_build_object('origem','individual'));
END $function$
;
