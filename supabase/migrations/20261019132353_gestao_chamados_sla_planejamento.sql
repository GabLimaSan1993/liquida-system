-- Management is exclusive to the verified Gabriel account, independently of master status.
create function private.chamados_pode_gerir() returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid()='b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid and private.chamados_tem_acesso()
 and exists(select 1 from public.user_profiles p where p.id=auth.uid() and '/chamados/gestao'=any(coalesce(p.telas_permitidas,'{}'::text[])));
$$;
revoke all on function private.chamados_pode_gerir() from public,anon;
grant execute on function private.chamados_pode_gerir() to authenticated;
create or replace function private.chamados_sincronizar_permissao() returns trigger language plpgsql security definer set search_path='' as $$
declare anterior boolean:=false; novo boolean; gestao_anterior boolean:=false; gestao_nova boolean;
begin
 if tg_op='UPDATE' then
 anterior:='/chamados'=any(coalesce(old.telas_permitidas,'{}'::text[]));
 gestao_anterior:='/chamados/gestao'=any(coalesce(old.telas_permitidas,'{}'::text[])); end if;
 novo:='/chamados'=any(coalesce(new.telas_permitidas,'{}'::text[]));
 gestao_nova:='/chamados/gestao'=any(coalesce(new.telas_permitidas,'{}'::text[]));
 if anterior is distinct from novo or gestao_anterior is distinct from gestao_nova then
 if not ((auth.uid() is not null and exists(select 1 from private.chamados_gestores where usuario_id=auth.uid()))
 or coalesce(auth.jwt()->>'role','')='service_role'
 or (auth.uid() is null and session_user in ('postgres','supabase_admin') and coalesce(auth.jwt()->>'role','') not in ('anon','authenticated'))) then
 raise exception 'Somente a gestão de usuários pode alterar o acesso a chamados.' using errcode='42501'; end if;
 if gestao_nova and new.id<>'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid then
 raise exception 'A gestão de chamados é exclusiva de Gabriel Lima.' using errcode='42501'; end if;
 if novo then insert into private.chamados_acessos values(new.id) on conflict do nothing;
 else delete from private.chamados_acessos where usuario_id=new.id; end if;
 end if;
 return new;
end $$;
update public.user_profiles set telas_permitidas=array_append(telas_permitidas,'/chamados/gestao')
where id='b517d70a-56be-4b4f-8b9e-a03c769dd3c3' and not ('/chamados/gestao'=any(coalesce(telas_permitidas,'{}'::text[])));

create table public.sistema_chamados_sla (
 prioridade text primary key check(prioridade in ('baixa','normal','alta','urgente')),
 primeira_resposta_h integer check(primeira_resposta_h between 1 and 8760),
 resolucao_h integer check(resolucao_h between 1 and 8760),
 atualizado_em timestamptz not null default now(),
 atualizado_por uuid references auth.users(id),
 check(primeira_resposta_h is null or resolucao_h is null or primeira_resposta_h<=resolucao_h)
);
insert into public.sistema_chamados_sla(prioridade) values('baixa'),('normal'),('alta'),('urgente');
alter table public.sistema_chamados_sla enable row level security;
revoke all on public.sistema_chamados_sla from public,anon,authenticated;
grant select on public.sistema_chamados_sla to authenticated;
grant update(primeira_resposta_h,resolucao_h) on public.sistema_chamados_sla to authenticated;
create policy chamados_sla_ler on public.sistema_chamados_sla for select to authenticated using((select private.chamados_pode_gerir()));
create policy chamados_sla_alterar on public.sistema_chamados_sla for update to authenticated using((select private.chamados_pode_gerir())) with check((select private.chamados_pode_gerir()));

alter table public.sistema_chamados
 add column responsavel_id uuid references auth.users(id),
 add column responsavel_nome text,
 add column prazo_planejado_em timestamptz,
 add column esforco_estimado_h numeric(8,2) check(esforco_estimado_h between 0 and 10000),
 add column proxima_acao text check(length(proxima_acao)<=2000),
 add column sla_primeira_resposta_h integer check(sla_primeira_resposta_h between 1 and 8760),
 add column sla_resolucao_h integer check(sla_resolucao_h between 1 and 8760),
 add column prazo_primeira_resposta_em timestamptz,
 add column prazo_resolucao_em timestamptz,
 add column primeira_resposta_em timestamptz,
 add column resolvido_em timestamptz,
 add column cancelado_em timestamptz;
create index sistema_chamados_prazo_idx on public.sistema_chamados(prazo_planejado_em) where status not in ('concluido','cancelado');
create index sistema_chamados_responsavel_idx on public.sistema_chamados(responsavel_id);
grant update(prioridade,responsavel_id,prazo_planejado_em,esforco_estimado_h,proxima_acao,sla_primeira_resposta_h,sla_resolucao_h,prazo_primeira_resposta_em,prazo_resolucao_em,primeira_resposta_em) on public.sistema_chamados to authenticated;
alter table public.sistema_chamado_eventos drop constraint sistema_chamado_eventos_tipo_check;
alter table public.sistema_chamado_eventos add constraint sistema_chamado_eventos_tipo_check check(tipo in ('abertura','status','comentario','planejamento','sla'));

create function private.chamados_controlar_planejamento() returns trigger language plpgsql security definer set search_path='' as $$
declare cfg public.sistema_chamados_sla%rowtype;
begin
 if not private.chamados_tem_acesso() then raise exception 'Acesso não autorizado.' using errcode='42501'; end if;
 if tg_op='INSERT' then
 select * into cfg from public.sistema_chamados_sla where prioridade=new.prioridade;
 new.sla_primeira_resposta_h=cfg.primeira_resposta_h; new.sla_resolucao_h=cfg.resolucao_h;
 new.prazo_primeira_resposta_em=new.criado_em+make_interval(hours=>cfg.primeira_resposta_h);
 new.prazo_resolucao_em=new.criado_em+make_interval(hours=>cfg.resolucao_h);
 else
 if (new.prioridade,new.responsavel_id,new.prazo_planejado_em,new.esforco_estimado_h,new.proxima_acao,new.sla_primeira_resposta_h,new.sla_resolucao_h,new.prazo_primeira_resposta_em,new.prazo_resolucao_em,new.primeira_resposta_em)
 is distinct from (old.prioridade,old.responsavel_id,old.prazo_planejado_em,old.esforco_estimado_h,old.proxima_acao,old.sla_primeira_resposta_h,old.sla_resolucao_h,old.prazo_primeira_resposta_em,old.prazo_resolucao_em,old.primeira_resposta_em)
 and not private.chamados_pode_gerir() then raise exception 'Somente Gabriel pode gerir prazos, responsáveis e SLAs.' using errcode='42501'; end if;
 if new.responsavel_id is distinct from old.responsavel_id then
 if new.responsavel_id is not null and not exists(select 1 from private.chamados_acessos where usuario_id=new.responsavel_id) then raise exception 'O responsável precisa ter acesso a chamados.'; end if;
 select coalesce(nullif(trim(p.nome),''),p.email) into new.responsavel_nome from public.user_profiles p where p.id=new.responsavel_id;
 end if;
 if private.chamados_pode_gerir() and new.primeira_resposta_em is null and
 ((new.status is distinct from old.status and new.status in ('em_analise','em_desenvolvimento','aguardando_informacoes','concluido'))
 or (new.responsavel_id is distinct from old.responsavel_id and new.responsavel_id is not null)) then new.primeira_resposta_em=now(); end if;
 if new.status='concluido' and old.status<>'concluido' then new.resolvido_em=now();
 elsif new.status<>'concluido' then new.resolvido_em=null; end if;
 if new.status='cancelado' and old.status<>'cancelado' then new.cancelado_em=now();
 elsif new.status<>'cancelado' then new.cancelado_em=null; end if;
 end if;
 return new;
end $$;
revoke all on function private.chamados_controlar_planejamento() from public,anon,authenticated;
create trigger chamados_controlar_planejamento before insert or update on public.sistema_chamados for each row execute function private.chamados_controlar_planejamento();

create or replace function private.chamados_historico() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_op='INSERT' then insert into public.sistema_chamado_eventos(chamado_id,tipo,texto) values(new.id,'abertura','Chamado aberto.');
 else
 if old.status is distinct from new.status then insert into public.sistema_chamado_eventos(chamado_id,tipo,texto) values(new.id,'status',old.status||' → '||new.status); end if;
 if (new.prioridade,new.responsavel_id,new.prazo_planejado_em,new.esforco_estimado_h,new.proxima_acao) is distinct from (old.prioridade,old.responsavel_id,old.prazo_planejado_em,old.esforco_estimado_h,old.proxima_acao) then
 insert into public.sistema_chamado_eventos(chamado_id,tipo,texto) values(new.id,'planejamento',
 'Planejamento atualizado. Responsável: '||coalesce(new.responsavel_nome,'Não definido')||'. Prioridade: '||new.prioridade||'. Prazo planejado: '||coalesce(to_char(new.prazo_planejado_em at time zone 'America/Sao_Paulo','DD/MM/YYYY HH24:MI'),'Não definido')||'. Esforço previsto: '||coalesce(new.esforco_estimado_h::text,'Não definido')||' h. Próxima ação: '||coalesce(nullif(new.proxima_acao,''),'Não definida')); end if;
 if (new.prazo_primeira_resposta_em,new.prazo_resolucao_em) is distinct from (old.prazo_primeira_resposta_em,old.prazo_resolucao_em) then
 insert into public.sistema_chamado_eventos(chamado_id,tipo,texto) values(new.id,'sla','SLAs definidos a partir da abertura. Primeiro retorno: '||coalesce(new.sla_primeira_resposta_h::text,'Não definido')||' h. Resolução: '||coalesce(new.sla_resolucao_h::text,'Não definido')||' h.'); end if;
 end if; return new;
end $$;
create function private.chamados_comentario_primeiro_retorno() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.tipo='comentario' and private.chamados_pode_gerir() then update public.sistema_chamados set primeira_resposta_em=now() where id=new.chamado_id and primeira_resposta_em is null; end if;
 return new;
end $$;
revoke all on function private.chamados_comentario_primeiro_retorno() from public,anon,authenticated;
create trigger chamados_comentario_primeiro_retorno after insert on public.sistema_chamado_eventos for each row execute function private.chamados_comentario_primeiro_retorno();

create function private.chamados_auditar_config_sla() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if not private.chamados_pode_gerir() then raise exception 'Gestão exclusiva de Gabriel.' using errcode='42501'; end if;
 new.atualizado_em=now(); new.atualizado_por=auth.uid(); return new;
end $$;
revoke all on function private.chamados_auditar_config_sla() from public,anon,authenticated;
create trigger chamados_auditar_config_sla before update on public.sistema_chamados_sla for each row execute function private.chamados_auditar_config_sla();
create function public.chamados_configurar_sla(p_regras jsonb,p_aplicar_abertos boolean default false) returns integer language plpgsql security invoker set search_path='' as $$
declare regra jsonb; total integer:=0;
begin
 if not private.chamados_pode_gerir() then raise exception 'Gestão exclusiva de Gabriel.' using errcode='42501'; end if;
 if jsonb_typeof(p_regras)<>'array' or jsonb_array_length(p_regras)<>4 or
 (select count(distinct r->>'prioridade') from jsonb_array_elements(p_regras)r where r->>'prioridade' in ('baixa','normal','alta','urgente'))<>4 then raise exception 'Informe uma regra para cada prioridade.'; end if;
 for regra in select * from jsonb_array_elements(p_regras) loop
 update public.sistema_chamados_sla set primeira_resposta_h=(regra->>'primeira_resposta_h')::integer,resolucao_h=(regra->>'resolucao_h')::integer where prioridade=regra->>'prioridade';
 end loop;
 if p_aplicar_abertos then
 update public.sistema_chamados c set
 sla_primeira_resposta_h=coalesce(c.sla_primeira_resposta_h,s.primeira_resposta_h),
 sla_resolucao_h=coalesce(c.sla_resolucao_h,s.resolucao_h),
 prazo_primeira_resposta_em=coalesce(c.prazo_primeira_resposta_em,c.criado_em+make_interval(hours=>s.primeira_resposta_h)),
 prazo_resolucao_em=coalesce(c.prazo_resolucao_em,c.criado_em+make_interval(hours=>s.resolucao_h))
 from public.sistema_chamados_sla s where s.prioridade=c.prioridade and c.status not in ('concluido','cancelado')
 and ((c.prazo_primeira_resposta_em is null and s.primeira_resposta_h is not null) or (c.prazo_resolucao_em is null and s.resolucao_h is not null));
 get diagnostics total=row_count; end if;
 return total;
end $$;
revoke all on function public.chamados_configurar_sla(jsonb,boolean) from public,anon;
grant execute on function public.chamados_configurar_sla(jsonb,boolean) to authenticated;
