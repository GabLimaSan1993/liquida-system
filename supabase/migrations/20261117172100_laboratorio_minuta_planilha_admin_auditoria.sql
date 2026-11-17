-- Minutas por planilha, desativação de envio total e ajuste admin auditado
-- Capturado do esquema de produção após validação em 17/11/2026.
-- A autenticação e a autorização são verificadas dentro das funções.

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_resolver_minuta_planilha(p_vouchers jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare v jsonb; v_invalidos jsonb; v_total int;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u
  where u.id=auth.uid() and (u.is_master is true
  or '/v2/assurant/laboratorio/reparos'=any(coalesce(u.telas_permitidas,'{}'::text[]))))
 then raise exception 'Sem acesso à geração de minuta do Laboratório' using errcode='42501'; end if;
 if p_vouchers is null or jsonb_typeof(p_vouchers)<>'array'
    or jsonb_array_length(p_vouchers) not between 1 and 250
 then raise exception 'Selecione de 1 a 250 vouchers por lote de validação'; end if;
 if exists(select 1 from jsonb_array_elements(p_vouchers) x
    where jsonb_typeof(x)<>'string' or upper(btrim(x #>> '{}')) !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$')
 then raise exception 'Voucher inválido no arquivo da minuta.'; end if;
 with lista as (
  select upper(btrim(value)) voucher,min(ord)::int ord from
  jsonb_array_elements_text(p_vouchers) with ordinality a(value,ord)
  group by upper(btrim(value))
 ), unidos as (
  select a.voucher,'individual'::text origem,a.id,a.status,
  exists(select 1 from liquida_private.reparo_lab_devolucoes_unificadas_itens i where i.item_id=a.id and i.origem='individual') vinculado
  from liquida_private.reparo_lab_avulsos a join lista l on l.voucher=a.voucher
  union all
  select i.voucher,'historico'::text origem,i.id,i.status,
  i.romaneio_retorno_id is not null or exists(select 1 from liquida_private.reparo_lab_devolucoes_unificadas_itens m where m.item_id=i.id and m.origem='historico') vinculado
  from liquida_private.reparo_lab_itens i join lista l on l.voucher=upper(btrim(i.voucher))
 ), resumo as (
  select l.voucher,l.ord,
   count(u.id) total_encontrados,
   count(u.id) filter(where u.status='concluido' and not u.vinculado) elegiveis,
   jsonb_agg(jsonb_build_object('id',u.id,'origem',u.origem,'status',u.status,'vinculado',u.vinculado))
    filter(where u.id is not null) encontrados
  from lista l left join unidos u on u.voucher=l.voucher
  group by l.voucher,l.ord
 )
 select jsonb_build_object(
   'itens',coalesce(jsonb_agg(jsonb_build_object('voucher',r.voucher,'id',u.id,'origem',u.origem)
    order by r.ord) filter(where r.total_encontrados=1 and r.elegiveis=1),'[]'::jsonb),
   'falhas',coalesce(jsonb_agg(jsonb_build_object('voucher',r.voucher,
    'motivo',case when r.total_encontrados=0 then 'Voucher inexistente no Laboratório'
    when r.total_encontrados>1 then 'Voucher duplicado no histórico; conciliação necessária'
    else 'Não está Concluído ou já vinculado a uma minuta' end)
    order by r.ord) filter(where r.total_encontrados<>1 or r.elegiveis<>1),'[]'::jsonb)
 ) into v
 from resumo r left join unidos u on u.voucher=r.voucher
   and r.total_encontrados=1 and r.elegiveis=1;
 return jsonb_build_object('ok',jsonb_array_length(v->'falhas')=0,
  'itens',v->'itens','falhas',v->'falhas');
end;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_admin_corrigir(p_origem text, p_item_id uuid, p_status text, p_resultado text, p_defeitos jsonb, p_observacoes text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare v_user uuid:=auth.uid(); v_antes jsonb; v_depois jsonb;
        v_status text; v_devolvido timestamptz; v_ret_id uuid; v_os text; v_conclusao timestamptz;
begin
 if v_user is null or not exists(select 1 from public.user_profiles u
   where u.id=v_user and u.is_master is true) then
  raise exception 'Correção de laudo e etapa disponível apenas ao administrador master.' using errcode='42501'; end if;
 if p_origem not in ('individual','historico') or p_item_id is null
 then raise exception 'Item do laboratório inválido.'; end if;
 if p_status not in ('recebido','em_reparo','concluido')
 then raise exception 'Etapa permitida: Aguardando técnico, Em reparo ou Concluído.'; end if;
 if p_resultado is not null and p_resultado not in ('reparado','sem_reparo','irrecuperavel')
 then raise exception 'Resultado de laudo técnico inválido.'; end if;
 if p_defeitos is null or jsonb_typeof(p_defeitos)<>'array'
  or jsonb_array_length(p_defeitos)>60 or exists(
   select 1 from jsonb_array_elements(p_defeitos) v
   where jsonb_typeof(v)<>'string' or length(v #>> '{}')>150
  ) then raise exception 'Defeitos inválidos.'; end if;
 if char_length(btrim(coalesce(p_motivo,''))) not between 10 and 500
 then raise exception 'Informe motivo de auditoria entre 10 e 500 caracteres.'; end if;
 if length(coalesce(p_observacoes,''))>5000 then raise exception 'Observações excedem 5.000 caracteres.'; end if;
 if p_origem='individual' then
   select to_jsonb(a),a.status,a.devolvido_em,a.os_numero,a.concluido_em
     into v_antes,v_status,v_devolvido,v_os,v_conclusao
   from liquida_private.reparo_lab_avulsos a where a.id=p_item_id for update;
 else
   select to_jsonb(a),a.status,a.devolvido_em,a.romaneio_retorno_id,a.os_numero,a.concluido_em
     into v_antes,v_status,v_devolvido,v_ret_id,v_os,v_conclusao
   from liquida_private.reparo_lab_itens a where a.id=p_item_id for update;
 end if;
 if v_antes is null then raise exception 'Voucher não encontrado no Laboratório.'; end if;
 if v_devolvido is not null or v_status='devolvido_warehouse' or v_ret_id is not null
  or exists(select 1 from liquida_private.reparo_lab_devolucoes_unificadas_itens i
    where i.item_id=p_item_id and i.origem=p_origem)
 then raise exception 'Correção bloqueada: aparelho está em minuta ou já foi devolvido ao Warehouse. Regularize a minuta primeiro.'; end if;
 if v_status not in ('recebido','em_reparo','concluido')
 then raise exception 'Etapa atual não permite correção administrativa de laudo.'; end if;
 if p_status='concluido' and (coalesce(p_resultado,v_antes->>'resultado') is null or v_os is null)
 then raise exception 'Concluído exige OS GAIA e resultado técnico.'; end if;
 if p_origem='individual' then
  update liquida_private.reparo_lab_avulsos set
   status=p_status,resultado=p_resultado,
   defeitos_atual=p_defeitos,observacoes=nullif(btrim(p_observacoes),''),
   concluido_em=case when p_status='concluido' then coalesce(concluido_em,now()) else concluido_em end,
   atualizado_em=now()
  where id=p_item_id returning to_jsonb(liquida_private.reparo_lab_avulsos.*) into v_depois;
  insert into liquida_private.reparo_lab_avulsos_eventos(item_id,acao,antes,depois,usuario_id)
   values(p_item_id,'admin_correcao_laudo_etapa',v_antes,
      v_depois || jsonb_build_object('motivo_auditoria',btrim(p_motivo)),v_user);
 else
  update liquida_private.reparo_lab_itens set
   status=p_status,resultado=p_resultado,
   defeitos_atual=p_defeitos,observacoes=nullif(btrim(p_observacoes),''),
   concluido_em=case when p_status='concluido' then coalesce(concluido_em,now()) else concluido_em end,
   atualizado_em=now()
  where id=p_item_id returning to_jsonb(liquida_private.reparo_lab_itens.*) into v_depois;
  insert into liquida_private.reparo_lab_eventos(item_id,acao,anterior,posterior,usuario_id)
   values(p_item_id,'admin_correcao_laudo_etapa',v_antes,
      v_depois || jsonb_build_object('motivo_auditoria',btrim(p_motivo)),v_user);
 end if;
 return jsonb_build_object('ok',true,'item',v_depois || jsonb_build_object('origem',p_origem));
end;
$function$;

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
$function$;

REVOKE ALL ON FUNCTION public.assurant_reparo_lab_resolver_minuta_planilha(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_lab_resolver_minuta_planilha(jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.assurant_reparo_lab_admin_corrigir(text,uuid,text,text,jsonb,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_lab_admin_corrigir(text,uuid,text,text,jsonb,text,text) TO authenticated;
