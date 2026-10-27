-- Desmembramento de componentes: OS origem, PN opcional, credito atomico e auditoria.
create table if not exists liquida_private.lb_desmembramento_lotes (
 id uuid primary key,
 os_id bigint not null references public.ordens_servico(id),
 condenacao_id bigint not null references public.linha_branca_condenacoes(id),
 usuario_id uuid not null references public.user_profiles(id),
 criado_em timestamptz not null default now()
);
create table if not exists liquida_private.lb_desmembramento_pecas (
 id bigint generated always as identity primary key,
 lote_id uuid not null references liquida_private.lb_desmembramento_lotes(id),
 os_id bigint not null references public.ordens_servico(id),
 estoque_id bigint not null references public.linha_branca_pecas_estoque(id),
 pn text,
 codigo_estoque text not null,
 descricao text not null check(length(trim(descricao)) between 3 and 400),
 quantidade int not null check(quantidade between 1 and 10000),
 localizacao text,
 maquina_origem text,
 marca_origem text,
 modelo_origem text,
 criado_em timestamptz not null default now()
);
create index if not exists lb_desm_pecas_os_idx on liquida_private.lb_desmembramento_pecas(os_id,criado_em desc);
alter table liquida_private.lb_desmembramento_lotes enable row level security;
alter table liquida_private.lb_desmembramento_pecas enable row level security;
revoke all on liquida_private.lb_desmembramento_lotes from public,anon,authenticated;
revoke all on liquida_private.lb_desmembramento_pecas from public,anon,authenticated;

create or replace function liquida_private.lb_desmembramento_operar(p_acao text,p_dados jsonb)
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set statement_timeout='25s'
as $f$
declare
 v_uid uuid:=auth.uid();
 v_profile public.user_profiles%rowtype;
 v_os public.ordens_servico%rowtype;
 v_con public.linha_branca_condenacoes%rowtype;
 v_num text:=btrim(p_dados->>'numero_os');
 v_itens jsonb:=p_dados->'pecas';
 v_item jsonb;
 v_qtd int;
 v_nome text;
 v_codigo text;
 v_pn text;
 v_local text;
 v_estoque_id bigint;
 v_item_id bigint;
 v_lote uuid;
 v_result jsonb:='[]'::jsonb;
 v_rows jsonb;
begin
 select * into v_profile from public.user_profiles where id=v_uid;
 if v_uid is null or not found or not (
    coalesce(v_profile.is_master,false) or
    '/v2/linha-branca'=any(coalesce(v_profile.telas_permitidas,'{}'::text[])) or
    '/v2/linha-branca/desmembramento'=any(coalesce(v_profile.telas_permitidas,'{}'::text[]))
 ) then raise exception 'Sem permissão para desmembramento da Linha Branca' using errcode='42501'; end if;

 if p_acao='listar' then
   select coalesce(jsonb_agg(to_jsonb(z)),'[]'::jsonb) into v_rows from (
     select i.id,os.numero_os,i.maquina_origem,i.marca_origem,i.modelo_origem,
       i.descricao,i.pn,i.codigo_estoque,i.quantidade,i.localizacao,
       i.criado_em,i.estoque_id,pe.saldo,up.nome as operador
     from liquida_private.lb_desmembramento_pecas i
     join public.ordens_servico os on os.id=i.os_id
     join public.linha_branca_pecas_estoque pe on pe.id=i.estoque_id
     join liquida_private.lb_desmembramento_lotes lo on lo.id=i.lote_id
     left join public.user_profiles up on up.id=lo.usuario_id
     order by i.criado_em desc,i.id desc limit 80
   ) z;
   return jsonb_build_object('ok',true,'itens',v_rows);
 end if;
 if p_acao not in ('consultar','registrar') then raise exception 'Ação inválida'; end if;
 if v_num is null or length(v_num) not between 1 and 40 then raise exception 'Informe o número da OS'; end if;
 select * into v_os from public.ordens_servico
  where numero_os=v_num and linha_produto='Linha Branca' limit 1 for share;
 if not found then raise exception 'OS % não encontrada na Linha Branca',v_num; end if;
 select * into v_con from public.linha_branca_condenacoes
  where os_id=v_os.id and status='aprovada' and destino='Desmembramento'
  order by decidido_em desc nulls last,id desc limit 1 for share;
 if not found then raise exception 'OS sem aprovação para Desmembramento. Solicite a aprovação do destino antes de lançar peças.'; end if;
 if v_os.area_destino is distinct from 'Desmembramento' then
   raise exception 'Destino atual da OS não é Desmembramento (%)',coalesce(v_os.area_destino,'não informado');
 end if;

 if p_acao='consultar' then
   select coalesce(jsonb_agg(to_jsonb(z)),'[]'::jsonb) into v_rows from (
     select i.id,i.descricao,i.pn,i.codigo_estoque,i.quantidade,i.criado_em,i.localizacao,pe.saldo
     from liquida_private.lb_desmembramento_pecas i
     join public.linha_branca_pecas_estoque pe on pe.id=i.estoque_id
     where i.os_id=v_os.id order by i.id desc limit 100
   ) z;
   return jsonb_build_object('ok',true,
      'os',jsonb_build_object('id',v_os.id,'numero_os',v_os.numero_os,
        'maquina',v_os.categoria,'marca',v_os.marca,'modelo',v_os.modelo,
        'serial',v_os.serial_number,'status',v_os.status_atual,
        'condenacao_id',v_con.id),'itens',v_rows);
 end if;

 if coalesce(p_dados->>'solicitacao_id','') !~ '^[a-fA-F0-9-]{36}$' then raise exception 'Identificador de solicitação inválido'; end if;
 v_lote:=(p_dados->>'solicitacao_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended('LB_DESM_LOTE_'||v_lote::text,0));
 if exists(select 1 from liquida_private.lb_desmembramento_lotes where id=v_lote) then
   if exists(select 1 from liquida_private.lb_desmembramento_lotes where id=v_lote and os_id<>v_os.id) then
      raise exception 'Identificador reutilizado para outra OS';
   end if;
   select coalesce(jsonb_agg(jsonb_build_object('id',i.id,'descricao',i.descricao,'pn',i.pn,
     'codigo_estoque',i.codigo_estoque,'estoque_id',i.estoque_id,'quantidade',i.quantidade)),'[]'::jsonb)
     into v_result from liquida_private.lb_desmembramento_pecas i where i.lote_id=v_lote;
   return jsonb_build_object('ok',true,'repetido',true,'numero_os',v_os.numero_os,'itens',v_result);
 end if;
 if jsonb_typeof(v_itens) is distinct from 'array' or jsonb_array_length(v_itens) not between 1 and 30 then
    raise exception 'Informe de 1 a 30 peças'; end if;
 insert into liquida_private.lb_desmembramento_lotes(id,os_id,condenacao_id,usuario_id)
 values(v_lote,v_os.id,v_con.id,v_uid);
 for v_item in select value from jsonb_array_elements(v_itens) loop
   if jsonb_typeof(v_item) is distinct from 'object' then raise exception 'Peça inválida'; end if;
   v_nome:=nullif(btrim(v_item->>'descricao'),'');
   v_pn:=nullif(upper(btrim(v_item->>'pn')),'');
   v_local:=nullif(btrim(v_item->>'localizacao'),'');
   if v_nome is null or length(v_nome) not between 3 and 400 then raise exception 'Descrição da peça obrigatória (3 a 400 caracteres)'; end if;
   if v_pn is not null and (length(v_pn)>100 or v_pn !~ '^[A-Z0-9][A-Z0-9._/-]*$') then
      raise exception 'PN inválido'; end if;
   if v_local is not null and length(v_local)>120 then raise exception 'Localização muito longa'; end if;
   if coalesce(v_item->>'quantidade','') !~ '^[0-9]{1,5}$' then raise exception 'Quantidade inteira obrigatória'; end if;
   v_qtd:=(v_item->>'quantidade')::int;
   if v_qtd not between 1 and 10000 then raise exception 'Quantidade entre 1 e 10000'; end if;
   -- Quando não há PN informado, o código interno é exclusivo e não finge ser PN de fabricante.
   v_codigo:=coalesce(v_pn,'DESM-SEM-PN-'||replace(gen_random_uuid()::text,'-',''));
   perform pg_advisory_xact_lock(hashtextextended('LB_EST_'||v_codigo,0));
   v_estoque_id:=null;
   if v_pn is not null then
      select id into v_estoque_id from public.linha_branca_pecas_estoque
      where upper(btrim(pn))=v_codigo and ativo=true order by id limit 1 for update;
   end if;
   if v_estoque_id is null then
      insert into public.linha_branca_pecas_estoque(pn,descricao,saldo,unidade,localizacao,ativo)
      values(v_codigo,v_nome,v_qtd,'UN',v_local,true)
      returning id into v_estoque_id;
   else
      update public.linha_branca_pecas_estoque
      set saldo=saldo+v_qtd,updated_at=now(),localizacao=coalesce(localizacao,v_local)
      where id=v_estoque_id;
   end if;
   insert into liquida_private.lb_desmembramento_pecas
     (lote_id,os_id,estoque_id,pn,codigo_estoque,descricao,quantidade,localizacao,maquina_origem,marca_origem,modelo_origem)
   values (v_lote,v_os.id,v_estoque_id,v_pn,v_codigo,v_nome,v_qtd,v_local,v_os.categoria,v_os.marca,v_os.modelo)
   returning id into v_item_id;
   v_result:=v_result||jsonb_build_array(jsonb_build_object('id',v_item_id,'descricao',v_nome,
        'pn',v_pn,'codigo_estoque',v_codigo,'estoque_id',v_estoque_id,'quantidade',v_qtd));
 end loop;
 return jsonb_build_object('ok',true,'repetido',false,'numero_os',v_os.numero_os,'itens',v_result);
end $f$;
revoke all on function liquida_private.lb_desmembramento_operar(text,jsonb) from public,anon;
grant execute on function liquida_private.lb_desmembramento_operar(text,jsonb) to authenticated;
create or replace function public.linha_branca_desmembramento(p_acao text,p_dados jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog
as $p$ select liquida_private.lb_desmembramento_operar(p_acao,p_dados) $p$;
revoke all on function public.linha_branca_desmembramento(text,jsonb) from public,anon;
grant execute on function public.linha_branca_desmembramento(text,jsonb) to authenticated;