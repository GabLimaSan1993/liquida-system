create schema if not exists private;
create table private.chamados_gestores (usuario_id uuid primary key references auth.users(id) on delete cascade);
create table private.chamados_acessos (usuario_id uuid primary key references auth.users(id) on delete cascade);
alter table private.chamados_gestores enable row level security;
alter table private.chamados_acessos enable row level security;
revoke all on private.chamados_gestores, private.chamados_acessos from public, anon, authenticated;
insert into private.chamados_gestores select id from public.user_profiles where is_master is true;

create function private.chamados_tem_acesso() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from private.chamados_acessos where usuario_id=auth.uid());
$$;
revoke all on function private.chamados_tem_acesso() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.chamados_tem_acesso() to authenticated;

-- Keep this permission in sync with central user management without trusting self-edited profiles.
create function private.chamados_sincronizar_permissao() returns trigger language plpgsql security definer set search_path='' as $$
declare anterior boolean := false; novo boolean;
begin
 if tg_op='UPDATE' then anterior := '/chamados'=any(coalesce(old.telas_permitidas,'{}'::text[])); end if;
 novo := '/chamados'=any(coalesce(new.telas_permitidas,'{}'::text[]));
 if anterior is distinct from novo then
   if not ((auth.uid() is not null and exists(select 1 from private.chamados_gestores where usuario_id=auth.uid()))
     or coalesce(auth.jwt()->>'role','')='service_role'
     or (auth.uid() is null and session_user in ('postgres','supabase_admin') and coalesce(auth.jwt()->>'role','') not in ('anon','authenticated'))) then
     raise exception 'Somente a gestão de usuários pode alterar o acesso a chamados.' using errcode='42501';
   end if;
   if novo then insert into private.chamados_acessos values(new.id) on conflict do nothing;
   else delete from private.chamados_acessos where usuario_id=new.id; end if;
 end if;
 return new;
end $$;
revoke all on function private.chamados_sincronizar_permissao() from public, anon, authenticated;
create trigger chamados_sincronizar_permissao after insert or update of telas_permitidas on public.user_profiles for each row execute function private.chamados_sincronizar_permissao();

do $$ begin
 if (select count(*) from public.user_profiles where lower(email) in ('gabriellimadossantos1993@gmail.com','fpazian@gtsam.com.br','jhonatan.nascimento@liquidapreco.com.br')) <> 3 then
 raise exception 'Não foi possível identificar os três usuários autorizados.'; end if;
end $$;
update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'::text[]),'/chamados')
where lower(email) in ('gabriellimadossantos1993@gmail.com','fpazian@gtsam.com.br','jhonatan.nascimento@liquidapreco.com.br')
and not ('/chamados'=any(coalesce(telas_permitidas,'{}'::text[])));

create table public.sistema_chamados (
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 titulo text not null check(length(trim(titulo)) between 3 and 180),
 tipo text not null check(tipo in ('melhoria','correcao','solicitacao')),
 prioridade text not null default 'normal' check(prioridade in ('baixa','normal','alta','urgente')),
 tela_nome text not null check(length(trim(tela_nome)) between 2 and 200),
 tela_rota text check(length(tela_rota)<=500 and (tela_rota is null or tela_rota ~ '^(/[^/]|https://)')),
 descricao text not null check(length(trim(descricao)) between 10 and 15000),
 resultado_esperado text check(length(resultado_esperado)<=10000),
 status text not null default 'aberto' check(status in ('aberto','em_analise','em_desenvolvimento','aguardando_informacoes','concluido','cancelado')),
 solicitante_id uuid not null default auth.uid() references auth.users(id),
 solicitante_nome text not null default '',
 criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now()
);
create index sistema_chamados_criado_idx on public.sistema_chamados(criado_em desc);
create table public.sistema_chamado_eventos (
 id uuid primary key default gen_random_uuid(),
 chamado_id uuid not null references public.sistema_chamados(id) on delete cascade,
 tipo text not null default 'comentario' check(tipo in ('abertura','status','comentario')),
 texto text not null check(length(trim(texto)) between 1 and 10000),
 autor_id uuid not null default auth.uid() references auth.users(id),
 autor_nome text not null default '',
 criado_em timestamptz not null default now()
);
create index sistema_chamado_eventos_chamado_idx on public.sistema_chamado_eventos(chamado_id,criado_em);
create table public.sistema_chamado_anexos (
 id uuid primary key default gen_random_uuid(),
 chamado_id uuid not null references public.sistema_chamados(id) on delete cascade,
 nome text not null check(length(nome) between 1 and 240 and lower(nome) ~ '\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|csv|txt|zip|pptx?)$'),
 caminho text unique not null,
 tamanho bigint not null check(tamanho between 1 and 20971520),
 mime_type text not null,
 criado_por uuid not null default auth.uid() references auth.users(id),
 criado_em timestamptz not null default now()
);
create index sistema_chamado_anexos_chamado_idx on public.sistema_chamado_anexos(chamado_id);
alter table public.sistema_chamados enable row level security;
alter table public.sistema_chamado_eventos enable row level security;
alter table public.sistema_chamado_anexos enable row level security;
revoke all on public.sistema_chamados,public.sistema_chamado_eventos,public.sistema_chamado_anexos from public,anon,authenticated;
grant select on public.sistema_chamados,public.sistema_chamado_eventos,public.sistema_chamado_anexos to authenticated;
grant insert(id,titulo,tipo,prioridade,tela_nome,tela_rota,descricao,resultado_esperado) on public.sistema_chamados to authenticated;
grant update(status) on public.sistema_chamados to authenticated;
grant usage on sequence public.sistema_chamados_numero_seq to authenticated;
grant insert(chamado_id,texto) on public.sistema_chamado_eventos to authenticated;
grant insert(chamado_id,nome,caminho,tamanho,mime_type) on public.sistema_chamado_anexos to authenticated;
create policy chamados_leitura on public.sistema_chamados for select to authenticated using((select private.chamados_tem_acesso()));
create policy chamados_criar on public.sistema_chamados for insert to authenticated with check((select private.chamados_tem_acesso()) and solicitante_id=(select auth.uid()));
create policy chamados_status on public.sistema_chamados for update to authenticated using((select private.chamados_tem_acesso())) with check((select private.chamados_tem_acesso()));
create policy chamados_eventos_leitura on public.sistema_chamado_eventos for select to authenticated using((select private.chamados_tem_acesso()));
create policy chamados_comentar on public.sistema_chamado_eventos for insert to authenticated with check((select private.chamados_tem_acesso()) and autor_id=(select auth.uid()) and tipo='comentario');
create policy chamados_anexos_leitura on public.sistema_chamado_anexos for select to authenticated using((select private.chamados_tem_acesso()));
create policy chamados_anexos_criar on public.sistema_chamado_anexos for insert to authenticated with check((select private.chamados_tem_acesso()) and criado_por=(select auth.uid()) and split_part(caminho,'/',1)=chamado_id::text and split_part(caminho,'/',2)=(select auth.uid())::text);

create function private.chamados_registrar_evento() returns trigger language plpgsql security definer set search_path='' as $$
declare nome text;
begin
 if auth.uid() is null or not private.chamados_tem_acesso() then raise exception 'Acesso a chamados não autorizado.' using errcode='42501'; end if;
 select coalesce(nullif(trim(p.nome),''),p.email) into nome from public.user_profiles p where id=auth.uid();
 if tg_table_name='sistema_chamado_eventos' then new.autor_nome=coalesce(nome,'Usuário'); return new; end if;
 if tg_op='INSERT' then
   new.solicitante_nome=coalesce(nome,'Usuário');
 else new.atualizado_em=now(); end if;
 return new;
end $$;
revoke all on function private.chamados_registrar_evento() from public,anon,authenticated;
create trigger chamados_preencher before insert or update on public.sistema_chamados for each row execute function private.chamados_registrar_evento();
create trigger chamados_autor_comentario before insert on public.sistema_chamado_eventos for each row execute function private.chamados_registrar_evento();
create function private.chamados_historico() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then
 insert into public.sistema_chamado_eventos(chamado_id,tipo,texto) values(new.id,'abertura','Chamado aberto.');
 elsif old.status is distinct from new.status then
 insert into public.sistema_chamado_eventos(chamado_id,tipo,texto) values(new.id,'status',old.status||' → '||new.status);
 end if; return new;
end $$;
revoke all on function private.chamados_historico() from public,anon,authenticated;
create trigger chamados_historico after insert or update on public.sistema_chamados for each row execute function private.chamados_historico();
create function private.chamados_validar_anexo() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.chamados_tem_acesso() then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 perform 1 from public.sistema_chamados where id=new.chamado_id for update;
 if (select count(*) from public.sistema_chamado_anexos where chamado_id=new.chamado_id)>=10 then raise exception 'Limite de 10 anexos por chamado.'; end if;
 if not exists(select 1 from storage.objects where bucket_id='sistema-chamados' and name=new.caminho and owner_id=auth.uid()::text) then raise exception 'Arquivo não encontrado ou sem permissão.'; end if;
 return new;
end $$;
revoke all on function private.chamados_validar_anexo() from public,anon,authenticated;
create trigger chamados_validar_anexo before insert on public.sistema_chamado_anexos for each row execute function private.chamados_validar_anexo();

insert into storage.buckets(id,name,public,file_size_limit) values('sistema-chamados','sistema-chamados',false,20971520);
create policy chamados_arquivos_inserir on storage.objects for insert to authenticated with check(bucket_id='sistema-chamados' and (select private.chamados_tem_acesso()) and (storage.foldername(name))[2]=(select auth.uid())::text and exists(select 1 from public.sistema_chamados c where c.id::text=(storage.foldername(name))[1]) and lower(storage.extension(name)) in ('png','jpg','jpeg','webp','gif','pdf','doc','docx','xls','xlsx','csv','txt','zip','ppt','pptx'));
create policy chamados_arquivos_ler on storage.objects for select to authenticated using(bucket_id='sistema-chamados' and (select private.chamados_tem_acesso()));
create policy chamados_arquivos_limpar on storage.objects for delete to authenticated using(bucket_id='sistema-chamados' and (select private.chamados_tem_acesso()) and owner_id=(select auth.uid())::text and not exists(select 1 from public.sistema_chamado_anexos a where a.caminho=name));
