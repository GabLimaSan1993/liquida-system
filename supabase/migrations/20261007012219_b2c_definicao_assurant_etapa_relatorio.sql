-- A definição inicia na Liquida; somente o encaminhamento explícito abre a fila Assurant.
alter table public.pedidos_b2c add column definicao_etapa text not null default 'liquida' check (definicao_etapa in ('liquida','assurant'));
alter table public.pedidos_b2c add column definicao_assurant_caso_id uuid;

create or replace function public.b2c_definicao_acesso(p_etapa text)
returns boolean language sql stable security invoker set search_path=public
as $$ select auth.uid() is not null and exists (
 select 1 from public.user_profiles u where u.id=auth.uid() and (
  u.is_master or
  (p_etapa='assurant' and '/v2/assurant/b2c/definicao-assurant'=any(coalesce(u.telas_permitidas,'{}'::text[]))) or
  (p_etapa='liquida' and lower(u.email) like '%@liquidapreco.com.br' and ('/v2/assurant/b2c'=any(coalesce(u.telas_permitidas,'{}'::text[])) or '/b2c/pedidos'=any(coalesce(u.telas_permitidas,'{}'::text[]))))
 )); $$;
revoke all on function public.b2c_definicao_acesso(text) from public,anon;
grant execute on function public.b2c_definicao_acesso(text) to authenticated;

create table public.b2c_definicao_assurant_casos (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references public.pedidos_b2c(id),
 encaminhado_em timestamptz not null default now(),
 encaminhado_por uuid not null references auth.users(id), encaminhado_nome text not null,
 motivo text not null check (length(btrim(motivo))>0),
 estado text not null default 'pendente' check(estado in ('pendente','aguardando_desvinculacao','concluido','cancelado','devolvido')),
 pedido_original jsonb not null, selecao jsonb, observacoes text,
 decidido_em timestamptz, decidido_por uuid references auth.users(id), decidido_nome text,
 resolvido_em timestamptz, resolvido_por uuid references auth.users(id), resolvido_nome text
);
create unique index b2c_definicao_assurant_aberto_idx on public.b2c_definicao_assurant_casos(pedido_id) where estado in ('pendente','aguardando_desvinculacao');
create index b2c_definicao_assurant_periodo_idx on public.b2c_definicao_assurant_casos(encaminhado_em,id);
alter table public.pedidos_b2c add constraint pedidos_b2c_definicao_assurant_caso_fkey foreign key(definicao_assurant_caso_id) references public.b2c_definicao_assurant_casos(id);
create table public.b2c_definicao_assurant_eventos (
 id uuid primary key default gen_random_uuid(), caso_id uuid not null references public.b2c_definicao_assurant_casos(id),
 evento text not null, criado_em timestamptz not null default now(),
 operador_id uuid references auth.users(id), operador_nome text, dados jsonb not null
);
create index b2c_definicao_assurant_eventos_caso_idx on public.b2c_definicao_assurant_eventos(caso_id,criado_em);
alter table public.b2c_definicao_assurant_casos enable row level security;
alter table public.b2c_definicao_assurant_eventos enable row level security;
revoke all on public.b2c_definicao_assurant_casos,public.b2c_definicao_assurant_eventos from anon,authenticated;
grant select,insert on public.b2c_definicao_assurant_casos to authenticated;
grant update(selecao,observacoes,decidido_em,decidido_por,decidido_nome) on public.b2c_definicao_assurant_casos to authenticated;
grant select on public.b2c_definicao_assurant_eventos to authenticated;
create policy b2c_definicao_casos_leitura on public.b2c_definicao_assurant_casos for select to authenticated using ((select public.b2c_definicao_acesso('assurant')) or (select public.b2c_definicao_acesso('liquida')));
create policy b2c_definicao_casos_inserir on public.b2c_definicao_assurant_casos for insert to authenticated with check ((select public.b2c_definicao_acesso('liquida')) and encaminhado_por=auth.uid());
create policy b2c_definicao_casos_decidir on public.b2c_definicao_assurant_casos for update to authenticated using ((select public.b2c_definicao_acesso('assurant')) and estado='pendente') with check ((select public.b2c_definicao_acesso('assurant')));
create policy b2c_definicao_eventos_leitura on public.b2c_definicao_assurant_eventos for select to authenticated using ((select public.b2c_definicao_acesso('assurant')) or (select public.b2c_definicao_acesso('liquida')));

-- Consulta de bloqueio em schema não exposto: o bloqueio MELI vale para todos os decisores.
create or replace function private.b2c_definicao_imei_bloqueado(p_imei text)
returns boolean language sql stable security definer set search_path=public
as $$ select auth.uid() is null or exists(select 1 from public.meli_aparelhos_bloqueados where imei=btrim(p_imei)); $$;
revoke all on function private.b2c_definicao_imei_bloqueado(text) from public,anon;
grant execute on function private.b2c_definicao_imei_bloqueado(text) to authenticated;

create or replace function public.b2c_definicao_familia(p_sku text)
returns table(sku text,marca text,modelo text,capacidade text,cor text)
language sql stable security invoker set search_path=public
as $$
 with base as (
  select coalesce((select d.sku_als from public.sku_de_para d where upper(btrim(d.sku_assurant))=upper(regexp_replace(btrim(p_sku),'-CC[0-9]+$','','i')) limit 1),regexp_replace(btrim(p_sku),'-CC[0-9]+$','','i')) as sku
 ), origem as (
  select c.* from public.produtos_catalogo c,base b
  where upper(btrim(c.sku_als))=upper(b.sku) or upper(btrim(c.sku_oracle))=upper(b.sku)
  order by c.ativo desc nulls last,c.data_cadastro desc nulls last limit 1
 )
 select distinct coalesce(nullif(btrim(c.sku_als),''),nullif(btrim(c.sku_oracle),'')),c.marca,c.modelo,c.capacidade,c.cor
 from public.produtos_catalogo c,origem o
 where (c.ativo or c.sku_als=o.sku_als) and nullif(btrim(c.modelo),'') is not null
 and upper(btrim(c.marca))=upper(btrim(o.marca))
 and upper(btrim(c.modelo))=upper(btrim(o.modelo))
 and regexp_replace(upper(coalesce(c.capacidade,'')),'[^A-Z0-9]','','g')=regexp_replace(upper(coalesce(o.capacidade,'')),'[^A-Z0-9]','','g')
 and nullif(btrim(o.capacidade),'') is not null
 and (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida'))
 union all
 select b.sku,null,null,null,null from base b where not exists(select 1 from origem)
 and (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida'));
 $$;
revoke all on function public.b2c_definicao_familia(text) from public,anon;
grant execute on function public.b2c_definicao_familia(text) to authenticated;

create or replace function public.b2c_definicao_opcoes(p_pedido_id uuid)
returns jsonb language plpgsql stable security invoker set search_path=public
as $$
declare v_p public.pedidos_b2c%rowtype; v_grade text; v_opcoes jsonb; v_skus jsonb; v_vinculos jsonb;
begin
 if not (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida')) then raise exception 'Sem permissão para consultar as alternativas de definição.' using errcode='42501'; end if;
 select * into v_p from public.pedidos_b2c where id=p_pedido_id;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 v_grade:=public.b2c_grade_alvo_exata(v_p.sku_produto,v_p.grade_produto);
 select jsonb_agg(to_jsonb(f)) into v_skus from public.b2c_definicao_familia(v_p.sku_produto) f;
 with candidatos as (
  select c.*,coalesce(nullif(btrim(f.cor),''),'Sem cor') as cor,f.capacidade,
   coalesce(f.modelo,c.modelo) as modelo_catalogo,
   case when lower(coalesce(c.status_bateria,''))='saúde da bateria entre 70 e 79%' then 'OUTLET' else public.b2c_normalizar_grade_exata(c.grade) end as grade_comercial
  from public.b2c_definicao_familia(v_p.sku_produto) f
  cross join lateral public.assurant_definicao_candidatos(f.sku) c
  where not private.b2c_definicao_imei_bloqueado(c.imei)
  and (c.disponivel or c.vinculo_tipo is not null)
  and coalesce(c.vinculo_detalhes->>'b2c_item_id','')<>v_p.id::text
  and not exists(select 1 from public.pedidos_b2c p where btrim(p.imei_alocado)=c.imei and p.status in ('aguardando_validacao_meli','embalado','faturado','concluido'))
  and public.b2c_grade_ordem_exata(c.grade)>=public.b2c_grade_ordem_exata('BOM')
  and lower(coalesce(c.status_bateria,'')) not in ('saúde da bateria abaixo 70%','saúde da bateria abaixo de 80%')
 ), elegiveis as (
  select c.*,
   case grade_comercial when 'LIKE NEW' then 'Like New' when 'EXCELENTE' then 'Excelente' when 'MUITO BOM' then 'Muito Bom' when 'BOM' then 'Bom' when 'OUTLET' then 'Outlet' end as grade_exibicao,
   case when public.b2c_grade_ordem_exata(grade_comercial)>public.b2c_grade_ordem_exata(v_grade) then 'upgrade' when public.b2c_grade_ordem_exata(grade_comercial)<public.b2c_grade_ordem_exata(v_grade) then 'downgrade' else 'mesma_grade' end as relacao
  from candidatos c where grade_comercial in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM','OUTLET')
 ), agrupados as (
  select sku,grade_comercial,grade_exibicao,cor,capacidade,modelo_catalogo,relacao,disponivel,vinculo_tipo,vinculo_referencia,
   jsonb_agg(to_jsonb(e) order by data_subinv nulls last,imei) as candidatos
  from elegiveis e group by sku,grade_comercial,grade_exibicao,cor,capacidade,modelo_catalogo,relacao,disponivel,vinculo_tipo,vinculo_referencia
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'sku',sku,'modelo',modelo_catalogo,'capacidade',capacidade,'grade',grade_exibicao,'cor',cor,'relacao',relacao,
  'quantidade',jsonb_array_length(candidatos),'fifo',candidatos->0,'candidatos',candidatos,
  'grade_fisica_fifo',candidatos->0->>'grade','outlet',grade_comercial='OUTLET',
  'disponivel',disponivel,'vinculo_tipo',vinculo_tipo,'vinculo_referencia',vinculo_referencia,
  'vinculo_descricao',candidatos->0->>'vinculo_descricao','vinculo_detalhes',candidatos->0->'vinculo_detalhes'
 ) order by cor,public.b2c_grade_ordem_exata(grade_comercial) desc,disponivel desc,sku),'[]'::jsonb) into v_opcoes from agrupados;
 select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into v_vinculos from public.b2c_definicao_familia(v_p.sku_produto) f cross join lateral public.assurant_definicao_vinculos_sku(f.sku,v_p.id) v;
 return jsonb_build_object('existe',true,'skuBase',regexp_replace(v_p.sku_produto,'-CC[0-9]+$','','i'),'gradeOrigem',case v_grade when 'LIKE NEW' then 'Like New' when 'EXCELENTE' then 'Excelente' when 'MUITO BOM' then 'Muito Bom' when 'BOM' then 'Bom' when 'OUTLET' then 'Outlet' else v_p.grade_produto end,'modelo',v_skus->0->>'modelo','familia',coalesce(v_skus,'[]'::jsonb),'opcoes',v_opcoes,'vinculosSku',v_vinculos);
end; $$;
revoke all on function public.b2c_definicao_opcoes(uuid) from public,anon;
grant execute on function public.b2c_definicao_opcoes(uuid) to authenticated;

create or replace function public.b2c_encaminhar_definicao_assurant(p_pedido_id uuid,p_motivo text)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare v_p public.pedidos_b2c%rowtype; v_id uuid; v_nome text;
begin
 if not public.b2c_definicao_acesso('liquida') then raise exception 'Somente a Liquida pode encaminhar o pedido à Assurant.' using errcode='42501'; end if;
 if nullif(btrim(p_motivo),'') is null then raise exception 'Informe por que não foi possível alocar o produto.'; end if;
 select * into v_p from public.pedidos_b2c where id=p_pedido_id for update;
 if not found or v_p.status<>'aguardando_definicao_produto' or coalesce(v_p.definicao_status,'pendente') not in ('pendente') then raise exception 'O pedido não está pendente de definição.'; end if;
 if v_p.definicao_etapa='assurant' then return jsonb_build_object('ok',true,'caso_id',v_p.definicao_assurant_caso_id,'ja_encaminhado',true); end if;
 if nullif(btrim(v_p.imei_alocado),'') is not null then raise exception 'O pedido ainda possui um IMEI alocado. Confira o vínculo antes de encaminhar.'; end if;
 select nome into v_nome from public.user_profiles where id=auth.uid();
 insert into public.b2c_definicao_assurant_casos(pedido_id,encaminhado_por,encaminhado_nome,motivo,pedido_original)
 values(v_p.id,auth.uid(),coalesce(v_nome,'Liquida'),btrim(p_motivo),to_jsonb(v_p)) returning id into v_id;
 update public.pedidos_b2c set definicao_etapa='assurant',definicao_assurant_caso_id=v_id,definicao_status='pendente',atualizado_em=now() where id=v_p.id;
 return jsonb_build_object('ok',true,'caso_id',v_id,'id_anymarket',v_p.id_anymarket);
end; $$;
revoke all on function public.b2c_encaminhar_definicao_assurant(uuid,text) from public,anon;
grant execute on function public.b2c_encaminhar_definicao_assurant(uuid,text) to authenticated;

create or replace function private.b2c_definicao_guard_etapa()
returns trigger language plpgsql security invoker set search_path=public
as $$
begin
 if old.status='aguardando_definicao_produto' and (new.upgrade_aprovado is distinct from old.upgrade_aprovado or new.upgrade_imei is distinct from old.upgrade_imei) and coalesce(new.upgrade_aprovado,false) and (new.definicao_etapa<>'assurant' or not public.b2c_definicao_acesso('assurant')) then raise exception 'Encaminhe à Assurant para aprovar o upgrade.' using errcode='42501'; end if;
 if old.status<>'aguardando_definicao_produto' and new.status='aguardando_definicao_produto' and old.definicao_assurant_caso_id is not null then
  new.definicao_etapa:='liquida'; new.definicao_assurant_caso_id:=null;
 end if;
 if new.definicao_etapa is distinct from old.definicao_etapa or new.definicao_assurant_caso_id is distinct from old.definicao_assurant_caso_id then
  if new.definicao_etapa='assurant' then
   if not public.b2c_definicao_acesso('liquida') or not exists(select 1 from public.b2c_definicao_assurant_casos c where c.id=new.definicao_assurant_caso_id and c.pedido_id=new.id and c.encaminhado_por=auth.uid() and c.estado='pendente') then raise exception 'Encaminhe o pedido pela ação da Liquida.' using errcode='42501'; end if;
  elsif old.status='aguardando_definicao_produto' and old.definicao_etapa='assurant' then
   raise exception 'A definição encaminhada deve ser resolvida na fila da Assurant.';
  end if;
 end if;
 if old.status='aguardando_definicao_produto' and old.definicao_etapa='assurant' and (
  new.imei_alocado is distinct from old.imei_alocado or new.status is distinct from old.status or new.definicao_status is distinct from old.definicao_status or new.upgrade_aprovado is distinct from old.upgrade_aprovado or new.upgrade_imei is distinct from old.upgrade_imei
 ) then
  if not public.b2c_definicao_acesso('assurant') and not (public.b2c_definicao_acesso('liquida') and (old.definicao_status='aguardando_desvinculacao' or new.status='cancelado')) and not (new.status='cancelado' and current_user in ('postgres','service_role','supabase_admin')) then raise exception 'Esta definição deve ser aprovada pela Assurant.' using errcode='42501'; end if;
 end if;
 return new;
end; $$;
revoke all on function private.b2c_definicao_guard_etapa() from public,anon,authenticated;
create trigger aa0z_b2c_definicao_guard_etapa before update on public.pedidos_b2c for each row execute function private.b2c_definicao_guard_etapa();

create or replace function private.b2c_definicao_auditar_etapa()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_estado text; v_nome text; v_evento text;
begin
 if new.definicao_assurant_caso_id is null then return new; end if;
 if not (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida')) and not (auth.uid() is null and new.status='cancelado') then return new; end if;
 select nome into v_nome from public.user_profiles where id=auth.uid();
 v_nome:=coalesce(v_nome,'Sistema');
 if new.definicao_assurant_caso_id is distinct from old.definicao_assurant_caso_id then v_evento:='encaminhado_assurant';
 elsif new.definicao_status is distinct from old.definicao_status or (old.status='aguardando_definicao_produto' and new.status is distinct from old.status) then
  v_estado:=case when new.status='cancelado' then 'cancelado' when new.definicao_status='concluido' then 'concluido' when new.definicao_status='aguardando_desvinculacao' then 'aguardando_desvinculacao' else 'pendente' end;
  update public.b2c_definicao_assurant_casos set estado=v_estado,
   resolvido_em=case when v_estado in ('concluido','cancelado') then now() else null end,
   resolvido_por=case when v_estado in ('concluido','cancelado') then auth.uid() else null end,
   resolvido_nome=case when v_estado in ('concluido','cancelado') then v_nome else null end
  where id=new.definicao_assurant_caso_id;
  v_evento:=v_estado;
 end if;
 if v_evento is not null then insert into public.b2c_definicao_assurant_eventos(caso_id,evento,operador_id,operador_nome,dados) values(new.definicao_assurant_caso_id,v_evento,auth.uid(),v_nome,to_jsonb(new)); end if;
 return new;
end; $$;
revoke all on function private.b2c_definicao_auditar_etapa() from public,anon,authenticated;
create trigger z_b2c_definicao_auditar_etapa after update on public.pedidos_b2c for each row execute function private.b2c_definicao_auditar_etapa();

create or replace function public.b2c_assurant_aprovar_definicao(p_pedido_id uuid,p_sku text,p_grade text,p_cor text,p_vinculo_tipo text default null,p_vinculo_referencia text default null,p_upgrade_confirmado boolean default false,p_observacoes text default null)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare v_p public.pedidos_b2c%rowtype; v_consulta jsonb; v_o jsonb; v_res jsonb; v_nome text; v_grupo uuid; v_num integer; v_total integer;
begin
 if not public.b2c_definicao_acesso('assurant') then raise exception 'Sem permissão para aprovar a definição da Assurant.' using errcode='42501'; end if;
 -- Serializa a decisão por pedido comercial, inclusive os pedidos com múltiplos itens.
 perform pg_advisory_xact_lock(hashtext('b2c_definicao_'||(select id_anymarket::text from public.pedidos_b2c where id=p_pedido_id)));
 select * into v_p from public.pedidos_b2c where id=p_pedido_id for update;
 if not found or v_p.status<>'aguardando_definicao_produto' or v_p.definicao_etapa<>'assurant' or coalesce(v_p.definicao_status,'pendente')<>'pendente' then raise exception 'Pedido não está pendente na fila da Assurant. Atualize a tela.'; end if;
 v_consulta:=public.b2c_definicao_opcoes(v_p.id);
 select o into v_o from jsonb_array_elements(v_consulta->'opcoes') o
 where upper(o->>'sku')=upper(btrim(p_sku)) and public.b2c_normalizar_grade_exata(o->>'grade')=public.b2c_normalizar_grade_exata(p_grade) and o->>'cor'=p_cor
 and coalesce(o->>'vinculo_tipo','')=coalesce(p_vinculo_tipo,'') and coalesce(o->>'vinculo_referencia','')=coalesce(p_vinculo_referencia,'') limit 1;
 if v_o is null then raise exception 'A opção escolhida mudou no WMS. Atualize as alternativas.'; end if;
 if v_o->>'relacao'='downgrade' then raise exception 'Grade inferior ao produto comprado não pode ser aprovada nesta tela.'; end if;
 if v_o->>'relacao'='upgrade' and not coalesce(p_upgrade_confirmado,false) then raise exception 'Confirme a aprovação do upgrade pela Assurant.'; end if;
 -- A reserva é decidida no banco: nenhum IMEI é recebido do navegador.
 perform 1 from public.wms_alocacoes where id=(v_o->'fifo'->>'alocacao_id')::uuid for update;
 select nome into v_nome from public.user_profiles where id=auth.uid();
 if v_o->>'relacao'='upgrade' then
  perform public.b2c_registrar_aprovacao_upgrade(v_p.id,v_o->'fifo'->>'imei',v_o->>'sku',v_o->>'grade',v_o->>'cor');
 end if;
 update public.b2c_definicao_assurant_casos set selecao=v_o,observacoes=nullif(btrim(p_observacoes),''),decidido_em=now(),decidido_por=auth.uid(),decidido_nome=v_nome where id=v_p.definicao_assurant_caso_id;
 if nullif(v_o->>'vinculo_tipo','') is not null then
  v_res:=public.assurant_solicitar_desvinculacao_b2c(v_p.id,v_o->'fifo'->>'imei',v_o->>'sku',v_o->>'grade',v_o->>'grade_fisica_fifo',v_o->>'cor',v_o->>'relacao',v_o->>'vinculo_tipo',v_o->>'vinculo_referencia',v_o->'vinculo_detalhes');
  if not coalesce((v_res->>'ok')::boolean,false) then raise exception '%',v_res->>'erro'; end if;
  return v_res||jsonb_build_object('aguardandoDesvinculacao',true,'relacao',v_o->>'relacao','grade',v_o->>'grade','cor',v_o->>'cor','vinculoDescricao',v_o->>'vinculo_descricao');
 end if;
 v_res:=public.wms_reservar_saida(v_o->'fifo'->>'imei','B2C',v_p.id::text,auth.uid());
 if not coalesce((v_res->>'ok')::boolean,false) then raise exception 'A opção não está mais disponível: %',v_res->>'erro'; end if;
 update public.pedidos_b2c set status='alocado',sku_definido=v_o->>'sku',grade_definida=v_o->>'grade',imei_alocado=v_o->'fifo'->>'imei',sku_alocado=v_o->>'sku',grade_alocada=v_o->>'grade_fisica_fifo',wms_alocacao_id=(v_o->'fifo'->>'alocacao_id')::uuid,alocado_em=now(),alocado_por=auth.uid(),grupo_id=null,
  definicao_status='concluido',definicao_resolvido_em=now(),definicao_resolvido_por=auth.uid(),definicao_resumo=concat('Assurant aprovou ',v_o->>'sku',' · ',v_o->>'grade',' · ',v_o->>'cor',' · IMEI FIFO ',v_o->'fifo'->>'imei',case when v_o->>'relacao'='upgrade' then ' · UPGRADE APROVADO' else '' end),atualizado_em=now()
 where id=v_p.id;
 update public.assurant_triagem set status_atual='Reservado para pedido B2C',atualizado_em=now() where btrim(imei)=v_o->'fifo'->>'imei';
 -- Mantém a regra de formar um único grupo quando todos os itens estiverem alocados.
 if not exists(select 1 from public.pedidos_b2c where id_anymarket=v_p.id_anymarket and (status<>'alocado' or grupo_id is not null)) then
  perform pg_advisory_xact_lock(hashtext('b2c_grupo_exclusivo_desvinculacao'));
  select count(*) into v_total from public.pedidos_b2c where id_anymarket=v_p.id_anymarket;
  select coalesce(max(numero),0)+1 into v_num from public.pedidos_b2c_grupos;
  insert into public.pedidos_b2c_grupos(numero,status,total_pedidos,criado_por,status_faturamento) values(v_num,'aberto',v_total,auth.uid(),'pendente') returning id into v_grupo;
  update public.pedidos_b2c set grupo_id=v_grupo,status='em_picking',atualizado_em=now() where id_anymarket=v_p.id_anymarket and status='alocado' and grupo_id is null;
 end if;
 return jsonb_build_object('ok',true,'imei',v_o->'fifo'->>'imei','sku',v_o->>'sku','grade',v_o->>'grade','cor',v_o->>'cor','relacao',v_o->>'relacao','grupoFormado',v_grupo is not null);
end; $$;
revoke all on function public.b2c_assurant_aprovar_definicao(uuid,text,text,text,text,text,boolean,text) from public,anon;
grant execute on function public.b2c_assurant_aprovar_definicao(uuid,text,text,text,text,text,boolean,text) to authenticated;

create or replace function public.b2c_definicao_assurant_relatorio(p_inicio date,p_fim date,p_base text default 'encaminhado',p_offset integer default 0,p_limit integer default 200)
returns jsonb language plpgsql stable security invoker set search_path=public
as $$
declare v_inicio timestamptz; v_fim timestamptz; v_total bigint; v_rows jsonb;
begin
 if not (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida')) then raise exception 'Sem permissão para o relatório de definição.' using errcode='42501'; end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_base not in ('encaminhado','decidido','resolvido') or p_offset<0 or p_limit not between 1 and 1000 then raise exception 'Período ou paginação inválidos.'; end if;
 v_inicio:=p_inicio::timestamp at time zone 'America/Sao_Paulo'; v_fim:=(p_fim+1)::timestamp at time zone 'America/Sao_Paulo';
 select count(*) into v_total from public.b2c_definicao_assurant_casos c where (case p_base when 'decidido' then c.decidido_em when 'resolvido' then c.resolvido_em else c.encaminhado_em end)>=v_inicio and (case p_base when 'decidido' then c.decidido_em when 'resolvido' then c.resolvido_em else c.encaminhado_em end)<v_fim;
 select coalesce(jsonb_agg(to_jsonb(r)),'[]'::jsonb) into v_rows from (
  select c.*,to_jsonb(p) as pedido_atual,
   coalesce((select jsonb_agg(to_jsonb(e) order by e.criado_em,e.id) from public.b2c_definicao_assurant_eventos e where e.caso_id=c.id),'[]'::jsonb) as eventos
  from public.b2c_definicao_assurant_casos c join public.pedidos_b2c p on p.id=c.pedido_id
  where (case p_base when 'decidido' then c.decidido_em when 'resolvido' then c.resolvido_em else c.encaminhado_em end)>=v_inicio and (case p_base when 'decidido' then c.decidido_em when 'resolvido' then c.resolvido_em else c.encaminhado_em end)<v_fim
  order by c.encaminhado_em,c.id offset p_offset limit p_limit
 ) r;
 return jsonb_build_object('rows',v_rows,'total',v_total,'inicio',p_inicio,'fim',p_fim,'base',p_base);
end; $$;
revoke all on function public.b2c_definicao_assurant_relatorio(date,date,text,integer,integer) from public,anon;
grant execute on function public.b2c_definicao_assurant_relatorio(date,date,text,integer,integer) to authenticated;

-- Decisoras que já operam definição, lideranças da operação e administradores.
update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'::text[]),'/v2/assurant/b2c/definicao-assurant')
where (is_master or nome in ('Letícia Felizidoro','Vanessa Piovesani','Jhonatan Landim','Janine Andressa Domingos'))
and not ('/v2/assurant/b2c/definicao-assurant'=any(coalesce(telas_permitidas,'{}'::text[])));
