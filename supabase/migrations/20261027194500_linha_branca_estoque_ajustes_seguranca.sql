-- Evita nota fiscal duplicada com série vazia e repetição de consumo.
-- Restringe requisições às OS em fluxo de reparo.
create unique index if not exists lb_nf_documento_unico
on liquida_private.lb_estoque_notas_entrada (upper(btrim(fornecedor)),btrim(numero_nf),coalesce(btrim(serie_nf),''));

create or replace function liquida_private.lb_estoque_central_operar(p_acao text,p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='30s'
as $fn$
declare
 v_uid uuid:=auth.uid();
 v_perfil public.user_profiles%rowtype;
 v_req public.linha_branca_pecas_requisicoes%rowtype;
 v_compra public.linha_branca_necessidades_compra%rowtype;
 v_os public.ordens_servico%rowtype;
 v_est public.linha_branca_pecas_estoque%rowtype;
 v_wip liquida_private.lb_wip_operacao%rowtype;
 v_nota uuid;
 v_saida_id uuid;
 v_acao text:=btrim(coalesce(p_acao,''));
 v_id uuid;
 v_num text;
 v_pn text;
 v_desc text;
 v_tipo text;
 v_qtd numeric;
 v_saldo numeric;
 v_req_id bigint;
 v_compra_id bigint;
 v_os_id bigint;
 v_estoque_id bigint;
 v_linha jsonb;
 v_itens jsonb;
 v_origem text;
 v_local text;
 v_etapa text;
 v_motivo text;
 v_rowcount integer;
begin
 select * into v_perfil from public.user_profiles where id=v_uid;
 if not found or v_uid is null or not (
   coalesce(v_perfil.is_master,false)
   or '/v2/linha-branca'=any(coalesce(v_perfil.telas_permitidas,'{}'::text[]))
   or '/v2/linha-branca/gestao/estoque'=any(coalesce(v_perfil.telas_permitidas,'{}'::text[]))
 ) then raise exception 'Usuário sem acesso ao estoque da Linha Branca' using errcode='42501'; end if;

 if v_acao='painel' then
  return jsonb_build_object(
   'estoque',coalesce((select jsonb_agg(to_jsonb(x)) from (
     select id,pn,descricao,saldo,unidade,localizacao,ativo,tipo_item
     from public.linha_branca_pecas_estoque where ativo=true order by descricao,id limit 600
   ) x),'[]'::jsonb),
   'requisicoes',coalesce((select jsonb_agg(to_jsonb(x)) from (
     select r.id,r.pn,r.quantidade,r.status,r.created_at,r.solicitado_por_nome,r.observacoes,
       r.estoque_id,os.numero_os,os.categoria,os.modelo
     from public.linha_branca_pecas_requisicoes r
     join public.ordens_servico os on os.id=r.os_id
     where r.status<>'cancelada' order by r.created_at desc,r.id desc limit 150
   ) x),'[]'::jsonb),
   'compras',coalesce((select jsonb_agg(to_jsonb(x)) from (
     select c.id,c.pn,c.descricao,c.quantidade,c.status,c.created_at,c.observacoes,
       os.numero_os,os.modelo
     from public.linha_branca_necessidades_compra c
     join public.ordens_servico os on os.id=c.os_id
     where c.status<>'cancelada' order by c.created_at desc,c.id desc limit 150
   ) x),'[]'::jsonb),
   'notas',coalesce((select jsonb_agg(to_jsonb(x)) from (
     select id,numero_nf,serie_nf,chave_nfe,fornecedor,criado_em
     from liquida_private.lb_estoque_notas_entrada order by criado_em desc limit 80
   ) x),'[]'::jsonb),
   'movimentacoes',coalesce((select jsonb_agg(to_jsonb(x)) from (
     select m.id,m.tipo,m.quantidade,m.antes,m.depois,m.observacoes,m.criado_em,
        e.pn,e.descricao,os.numero_os,m.nota_id,m.compra_id,u.nome as operador
     from liquida_private.lb_estoque_movimentacoes m
     join public.linha_branca_pecas_estoque e on e.id=m.estoque_id
     left join public.ordens_servico os on os.id=m.os_id
     left join public.user_profiles u on u.id=m.usuario_id
     order by m.criado_em desc,m.id desc limit 150
   ) x),'[]'::jsonb),
   'desmembramentos',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select p.id,p.descricao,p.codigo_estoque,p.quantidade,p.criado_em,os.numero_os
      from liquida_private.lb_desmembramento_pecas p
      join public.ordens_servico os on os.id=p.os_id
      order by p.criado_em desc limit 80
   ) x),'[]'::jsonb),
   'wip',coalesce((select jsonb_agg(to_jsonb(x)) from (
      select w.id,w.identificador,w.categoria,w.marca,w.modelo,w.serial,w.origem,w.endereco,
        w.etapa,w.observacoes,w.criado_em,w.atualizado_em,os.numero_os
      from liquida_private.lb_wip_operacao w
      left join public.ordens_servico os on os.id=w.os_id
      order by w.atualizado_em desc limit 200
   ) x),'[]'::jsonb)
  );
 end if;

 if v_acao='solicitar_peca' then
  v_num:=nullif(btrim(p_dados->>'numero_os'),'');
  v_estoque_id:=nullif(p_dados->>'estoque_id','')::bigint;
  v_qtd:=nullif(p_dados->>'quantidade','')::numeric;
  if v_num is null or v_estoque_id is null or coalesce(v_qtd,0)<=0 or v_qtd>10000 then
    raise exception 'Informe OS, peça e quantidade válida'; end if;
  select * into v_os from public.ordens_servico where numero_os=v_num and linha_produto='Linha Branca';
  if not found then raise exception 'OS não localizada na Linha Branca'; end if;
  if v_os.status_atual not in ('Triado','Encaminhado para reparo','Em reparo','Aguardando peça','Triado - aguardando kit') then
    raise exception 'OS não está em etapa de reparo (status %)',v_os.status_atual; end if;
  select * into v_est from public.linha_branca_pecas_estoque where id=v_estoque_id and ativo=true;
  if not found then raise exception 'Peça não localizada'; end if;
  insert into public.linha_branca_pecas_requisicoes
    (os_id,estoque_id,pn,quantidade,status,solicitado_por,solicitado_por_nome,observacoes)
  values(v_os.id,v_est.id,v_est.pn,v_qtd,'solicitada',v_uid,v_perfil.nome,
    nullif(btrim(p_dados->>'observacoes'),''))
  returning id into v_req_id;
  return jsonb_build_object('ok',true,'requisicao_id',v_req_id);
 end if;

 if v_acao='atender_requisicao' then
  v_req_id:=nullif(p_dados->>'requisicao_id','')::bigint;
  v_tipo:=upper(btrim(p_dados->>'destino'));
  if v_tipo not in ('SEPARADA','ENTREGUE','CANCELADA') then raise exception 'Status inválido'; end if;
  select * into v_req from public.linha_branca_pecas_requisicoes where id=v_req_id for update;
  if not found then raise exception 'Requisição inexistente'; end if;
  if v_req.status in ('entregue','cancelada') then raise exception 'Requisição já finalizada'; end if;
  if v_tipo='CANCELADA' then
    update public.linha_branca_pecas_requisicoes set status='cancelada',updated_at=now() where id=v_req_id;
    return jsonb_build_object('ok',true,'status','cancelada');
  end if;
  if v_tipo='SEPARADA' then
    update public.linha_branca_pecas_requisicoes set status='separada',updated_at=now() where id=v_req_id;
    return jsonb_build_object('ok',true,'status','separada');
  end if;
  select * into v_est from public.linha_branca_pecas_estoque where id=v_req.estoque_id for update;
  if not found or not v_est.ativo then raise exception 'Peça não disponível no cadastro de estoque'; end if;
  if v_est.saldo<v_req.quantidade then raise exception 'Saldo insuficiente: disponível %, requisitado %',v_est.saldo,v_req.quantidade; end if;
  update public.linha_branca_pecas_estoque set saldo=saldo-v_req.quantidade,updated_at=now() where id=v_est.id;
  update public.linha_branca_pecas_requisicoes set status='entregue',updated_at=now() where id=v_req.id;
  insert into liquida_private.lb_estoque_movimentacoes
   (movimento_id,estoque_id,tipo,quantidade,antes,depois,os_id,requisicao_id,usuario_id,observacoes)
  values(gen_random_uuid(),v_est.id,'SAIDA_REQUISICAO',v_req.quantidade,v_est.saldo,
   v_est.saldo-v_req.quantidade,v_req.os_id,v_req.id,v_uid,nullif(btrim(p_dados->>'observacoes'),''));
  return jsonb_build_object('ok',true,'status','entregue','saldo',v_est.saldo-v_req.quantidade);
 end if;

 if v_acao='solicitar_compra' then
  v_num:=nullif(btrim(p_dados->>'numero_os'),'');
  v_pn:=nullif(upper(btrim(p_dados->>'pn')),'');
  v_desc:=nullif(btrim(p_dados->>'descricao'),'');
  v_qtd:=nullif(p_dados->>'quantidade','')::numeric;
  if v_num is null or coalesce(v_qtd,0)<=0 or v_qtd>10000 or (v_pn is null and v_desc is null) then
    raise exception 'Informe OS, peça ou descrição, e quantidade'; end if;
  select * into v_os from public.ordens_servico where numero_os=v_num and linha_produto='Linha Branca';
  if not found then raise exception 'OS não encontrada na Linha Branca'; end if;
  if v_pn is null then v_pn:='SOLICITACAO-SEM-PN-'||replace(gen_random_uuid()::text,'-',''); end if;
  insert into public.linha_branca_necessidades_compra
    (os_id,pn,descricao,quantidade,status,solicitado_por,solicitado_por_nome,observacoes)
  values(v_os.id,v_pn,v_desc,v_qtd,'necessidade_aberta',v_uid,v_perfil.nome,
    nullif(btrim(p_dados->>'observacoes'),''))
  returning id into v_compra_id;
  return jsonb_build_object('ok',true,'compra_id',v_compra_id);
 end if;

 if v_acao='atualizar_compra' then
  v_compra_id:=nullif(p_dados->>'compra_id','')::bigint;
  v_tipo:=lower(btrim(p_dados->>'status'));
  if v_tipo not in ('em_cotacao','comprada','cancelada') then
    raise exception 'Estado inválido: entrada recebida exige NF'; end if;
  select * into v_compra from public.linha_branca_necessidades_compra where id=v_compra_id for update;
  if not found or v_compra.status in ('recebida','cancelada') then raise exception 'Necessidade não pode ser atualizada'; end if;
  if v_tipo='em_cotacao' and v_compra.status<>'necessidade_aberta' then raise exception 'Etapa anterior incompatível'; end if;
  if v_tipo='comprada' and v_compra.status not in ('necessidade_aberta','em_cotacao') then raise exception 'Etapa anterior incompatível'; end if;
  update public.linha_branca_necessidades_compra
  set status=v_tipo,updated_at=now() where id=v_compra_id;
  return jsonb_build_object('ok',true,'status',v_tipo);
 end if;

 if v_acao='entrada_nf' then
  v_id:=nullif(p_dados->>'operacao_id','')::uuid;
  v_num:=nullif(btrim(p_dados->>'numero_nf'),'');
  v_origem:=nullif(btrim(p_dados->>'fornecedor'),'');
  v_itens:=p_dados->'itens';
  if v_id is null or v_num is null or length(v_num)>30 or v_origem is null or length(v_origem) not between 3 and 200
      or jsonb_typeof(v_itens) is distinct from 'array' or jsonb_array_length(v_itens) not between 1 and 30 then
    raise exception 'Preencha fornecedor, NF e itens de entrada'; end if;
  v_pn:=nullif(btrim(p_dados->>'chave_nfe'),'');
  if v_pn is not null and v_pn !~ '^[0-9]{44}$' then raise exception 'Chave NF-e deve conter 44 dígitos'; end if;
  if exists(select 1 from liquida_private.lb_estoque_notas_entrada where id=v_id) then
    return jsonb_build_object('ok',true,'repetida',true);
  end if;
  insert into liquida_private.lb_estoque_notas_entrada
    (id,numero_nf,serie_nf,chave_nfe,fornecedor,observacoes,usuario_id)
  values(v_id,v_num,nullif(btrim(p_dados->>'serie_nf'),''),v_pn,
    v_origem,nullif(btrim(p_dados->>'observacoes'),''),v_uid);
  for v_linha in select value from jsonb_array_elements(v_itens) loop
    v_pn:=nullif(upper(btrim(v_linha->>'pn')),'');
    v_desc:=nullif(btrim(v_linha->>'descricao'),'');
    v_local:=nullif(btrim(v_linha->>'localizacao'),'');
    v_tipo:=upper(coalesce(nullif(btrim(v_linha->>'tipo_item'),''),'PECA'));
    v_qtd:=nullif(v_linha->>'quantidade','')::numeric;
    v_compra_id:=nullif(v_linha->>'compra_id','')::bigint;
    if v_desc is null or length(v_desc)>400 or v_qtd is null or v_qtd<=0 or v_qtd>100000
       or v_tipo not in ('PECA','INSUMO') or (v_pn is not null and length(v_pn)>100) then
      raise exception 'Item da NF inválido (descrição, tipo, PN ou quantidade)'; end if;
    if v_compra_id is not null then
      select * into v_compra from public.linha_branca_necessidades_compra where id=v_compra_id for update;
      if not found or v_compra.status='cancelada' then raise exception 'Compra não encontrada ou cancelada'; end if;
      if v_pn is not null and v_pn<>upper(btrim(v_compra.pn)) then raise exception 'PN diverge da compra %',v_compra_id; end if;
      if v_pn is null then v_pn:=upper(btrim(v_compra.pn)); end if;
      select coalesce(sum(quantidade),0) into v_saldo from liquida_private.lb_estoque_movimentacoes
         where compra_id=v_compra_id and tipo='ENTRADA_NF';
      if v_saldo+v_qtd>v_compra.quantidade then
        raise exception 'Quantidade acima do saldo da compra %: pedido %, já recebido %',v_compra_id,v_compra.quantidade,v_saldo;
      end if;
    end if;
    if v_pn is null then v_pn:='NF-SEM-PN-'||replace(gen_random_uuid()::text,'-',''); end if;
    perform pg_advisory_xact_lock(hashtextextended('LB_EST_'||v_pn,0));
    select * into v_est from public.linha_branca_pecas_estoque
      where upper(btrim(pn))=v_pn and ativo=true order by id limit 1 for update;
    if found then
      if v_est.tipo_item<>v_tipo then raise exception 'PN % cadastrado em categoria diferente',v_pn; end if;
      v_saldo:=v_est.saldo;
      update public.linha_branca_pecas_estoque set saldo=saldo+v_qtd,updated_at=now(),
        localizacao=coalesce(localizacao,v_local) where id=v_est.id;
      v_estoque_id:=v_est.id;
    else
      insert into public.linha_branca_pecas_estoque(pn,descricao,saldo,unidade,localizacao,ativo,tipo_item)
      values(v_pn,v_desc,v_qtd,'UN',v_local,true,v_tipo) returning id into v_estoque_id;
      v_saldo:=0;
    end if;
    insert into liquida_private.lb_estoque_movimentacoes
      (movimento_id,estoque_id,tipo,quantidade,antes,depois,compra_id,nota_id,usuario_id)
    values(gen_random_uuid(),v_estoque_id,'ENTRADA_NF',v_qtd,v_saldo,v_saldo+v_qtd,v_compra_id,v_id,v_uid);
    if v_compra_id is not null then
      select coalesce(sum(quantidade),0) into v_saldo from liquida_private.lb_estoque_movimentacoes
       where compra_id=v_compra_id and tipo='ENTRADA_NF';
      if v_saldo>=v_compra.quantidade then
        update public.linha_branca_necessidades_compra
         set status='recebida',updated_at=now() where id=v_compra_id;
      end if;
    end if;
  end loop;
  return jsonb_build_object('ok',true,'nota_id',v_id,'itens',jsonb_array_length(v_itens));
 end if;

 if v_acao='saida_insumo' then
  v_saida_id:=nullif(p_dados->>'operacao_id','')::uuid;
  if v_saida_id is null then raise exception 'Identificador de baixa obrigatório'; end if;
  perform pg_advisory_xact_lock(hashtextextended('LB_INSUMO_'||v_saida_id::text,0));
  if exists(select 1 from liquida_private.lb_estoque_movimentacoes
            where movimento_id=v_saida_id and tipo='SAIDA_INSUMO') then
    return jsonb_build_object('ok',true,'repetida',true);
  end if;
  v_estoque_id:=nullif(p_dados->>'estoque_id','')::bigint;
  v_qtd:=nullif(p_dados->>'quantidade','')::numeric;
  v_motivo:=nullif(btrim(p_dados->>'motivo'),'');
  v_num:=nullif(btrim(p_dados->>'numero_os'),'');
  if v_estoque_id is null or v_qtd is null or v_qtd<=0 or v_qtd>100000 or v_motivo is null then
    raise exception 'Selecione insumo, quantidade e finalidade'; end if;
  if v_num is not null then
    select * into v_os from public.ordens_servico where numero_os=v_num and linha_produto='Linha Branca';
    if not found then raise exception 'OS informada não existe'; end if;
    v_os_id:=v_os.id;
  end if;
  select * into v_est from public.linha_branca_pecas_estoque
   where id=v_estoque_id and ativo=true and tipo_item='INSUMO' for update;
  if not found then raise exception 'Insumo não encontrado'; end if;
  if v_est.saldo<v_qtd then raise exception 'Saldo insuficiente'; end if;
  update public.linha_branca_pecas_estoque set saldo=saldo-v_qtd,updated_at=now() where id=v_estoque_id;
  insert into liquida_private.lb_estoque_movimentacoes
    (movimento_id,estoque_id,tipo,quantidade,antes,depois,os_id,usuario_id,observacoes)
  values(v_saida_id,v_estoque_id,'SAIDA_INSUMO',v_qtd,v_est.saldo,v_est.saldo-v_qtd,v_os_id,v_uid,v_motivo);
  return jsonb_build_object('ok',true,'saldo',v_est.saldo-v_qtd);
 end if;

 if v_acao='wip_salvar' then
  v_id:=nullif(p_dados->>'id','')::uuid;
  v_num:=nullif(btrim(p_dados->>'numero_os'),'');
  v_etapa:=upper(coalesce(nullif(btrim(p_dados->>'etapa'),''),'AGUARDANDO_ENTRADA'));
  v_motivo:=nullif(btrim(p_dados->>'motivo'),'');
  v_local:=nullif(btrim(p_dados->>'endereco'),'');
  if v_etapa not in ('AGUARDANDO_ENTRADA','PRE_TRATAMENTO','LIBERADO_LINHA','EM_LINHA','BLOQUEADO')
    then raise exception 'Etapa WIP inválida'; end if;
  if v_num is not null then
    select * into v_os from public.ordens_servico where numero_os=v_num and linha_produto='Linha Branca';
    if not found then raise exception 'OS não encontrada na Linha Branca'; end if;
    v_os_id:=v_os.id;
  end if;
  if v_id is null then
    if v_num is null and nullif(btrim(p_dados->>'identificador'),'') is null
      then raise exception 'Informe OS ou identificador para pré-entrada'; end if;
    if v_os_id is not null and exists(select 1 from liquida_private.lb_wip_operacao where os_id=v_os_id)
      then raise exception 'OS já cadastrada no WIP'; end if;
    insert into liquida_private.lb_wip_operacao
      (os_id,identificador,categoria,marca,modelo,serial,origem,endereco,etapa,observacoes,usuario_id)
    values (v_os_id,nullif(btrim(p_dados->>'identificador'),''),coalesce(nullif(btrim(p_dados->>'categoria'),''),coalesce(v_os.categoria,'Linha Branca')),
       coalesce(nullif(btrim(p_dados->>'marca'),''),v_os.marca),coalesce(nullif(btrim(p_dados->>'modelo'),''),v_os.modelo),
       coalesce(nullif(btrim(p_dados->>'serial'),''),v_os.serial_number),
       nullif(btrim(p_dados->>'origem'),''),v_local,v_etapa,nullif(btrim(p_dados->>'observacoes'),''),v_uid)
    returning id into v_id;
    insert into liquida_private.lb_wip_historico(wip_id,etapa_nova,endereco_novo,motivo,usuario_id)
    values(v_id,v_etapa,v_local,'Cadastro inicial',v_uid);
  else
    select * into v_wip from liquida_private.lb_wip_operacao where id=v_id for update;
    if not found then raise exception 'Item WIP inexistente'; end if;
    if v_wip.etapa<>v_etapa or v_wip.endereco is distinct from v_local then
      if v_motivo is null then raise exception 'Informe o motivo da movimentação WIP'; end if;
      insert into liquida_private.lb_wip_historico
       (wip_id,etapa_anterior,etapa_nova,endereco_anterior,endereco_novo,motivo,usuario_id)
      values (v_id,v_wip.etapa,v_etapa,v_wip.endereco,v_local,v_motivo,v_uid);
    end if;
    update liquida_private.lb_wip_operacao set etapa=v_etapa,endereco=v_local,
       observacoes=coalesce(nullif(btrim(p_dados->>'observacoes'),''),observacoes),
       atualizado_em=now() where id=v_id;
  end if;
  return jsonb_build_object('ok',true,'wip_id',v_id,'etapa',v_etapa);
 end if;

 raise exception 'Ação desconhecida';
end $fn$;