create table public.linha_branca_pecas_consumos (
 id bigint generated always as identity primary key,
 os_id bigint not null references public.ordens_servico(id),
 pn text not null check (length(trim(pn)) > 0),
 descricao text,
 quantidade numeric(14,3) not null check (quantidade > 0 and quantidade < 1000000),
 custo_unitario numeric(14,4) check (custo_unitario >= 0 and custo_unitario < 100000000),
 utilizado_em timestamptz not null,
 tecnico text not null check (length(trim(tecnico)) > 0),
 registrado_por uuid not null references auth.users(id) default auth.uid(),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index linha_branca_consumos_os_data_idx on public.linha_branca_pecas_consumos(os_id,utilizado_em);
alter table public.linha_branca_pecas_consumos enable row level security;
create policy consumos_gestao_select on public.linha_branca_pecas_consumos for select to authenticated using (
 exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and (p.is_master or '/v2/linha-branca/gestao/producao'=any(p.telas_permitidas)))
);
create policy consumos_gestao_insert on public.linha_branca_pecas_consumos for insert to authenticated with check (
 registrado_por=(select auth.uid()) and exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and (p.is_master or '/v2/linha-branca/gestao/producao'=any(p.telas_permitidas)))
 and exists(select 1 from public.ordens_servico o where o.id=os_id and o.linha_produto='Linha Branca')
);
create policy consumos_gestao_update on public.linha_branca_pecas_consumos for update to authenticated using (
 exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and (p.is_master or '/v2/linha-branca/gestao/producao'=any(p.telas_permitidas)))
) with check (
 exists(select 1 from public.user_profiles p where p.id=(select auth.uid()) and (p.is_master or '/v2/linha-branca/gestao/producao'=any(p.telas_permitidas)))
 and exists(select 1 from public.ordens_servico o where o.id=os_id and o.linha_produto='Linha Branca')
);
grant select,insert on public.linha_branca_pecas_consumos to authenticated;
grant update(custo_unitario,updated_at) on public.linha_branca_pecas_consumos to authenticated;
grant usage,select on sequence public.linha_branca_pecas_consumos_id_seq to authenticated;

-- Snapshot das conclusões futuras: o executor não depende de um cadastro de OS alterado depois.
create table public.linha_branca_producao_eventos (
 id bigint generated always as identity primary key,
 os_id bigint not null references public.ordens_servico(id),
 etapa text not null check (etapa in ('Higienização','Qualidade','Bancada de Testes')),
 tecnico text not null,
 resultado text not null,
 realizado_em timestamptz not null default now(),
 registrado_por uuid not null default auth.uid() references auth.users(id)
);
create index linha_branca_producao_os_data_idx on public.linha_branca_producao_eventos(os_id,realizado_em);
alter table public.linha_branca_producao_eventos enable row level security;
create policy producao_eventos_select on public.linha_branca_producao_eventos for select to authenticated using (true);
create policy producao_eventos_insert on public.linha_branca_producao_eventos for insert to authenticated with check (
 registrado_por=(select auth.uid()) and pg_trigger_depth()>0 and exists(select 1 from public.ordens_servico o where o.id=os_id and o.linha_produto='Linha Branca')
);
grant select,insert on public.linha_branca_producao_eventos to authenticated;
grant usage,select on sequence public.linha_branca_producao_eventos_id_seq to authenticated;
create function public.registrar_conclusao_linha_branca() returns trigger language plpgsql security invoker set search_path=public as $$
declare v_etapa text; v_tecnico text; v_resultado text:='aprovado';
begin
 if new.linha_produto is distinct from 'Linha Branca' or auth.uid() is null then return new; end if;
 if old.status_atual is not distinct from new.status_atual and old.etapa_atual is not distinct from new.etapa_atual then return new; end if;
 if old.status_atual in ('Limpeza','Higienização') and new.status_atual='Qualidade' then
  v_etapa:='Higienização'; v_tecnico:=new.tecnico_limpeza;
 elsif old.status_atual='Qualidade' and new.status_atual in ('Concluído','Concluido','Finalizado','Aprovado','Em reparo','Triado','Limpeza') then
  v_etapa:='Qualidade'; v_tecnico:=new.tecnico_qualidade;
  if new.status_atual in ('Em reparo','Triado','Limpeza') then v_resultado:='reprovado'; end if;
 elsif old.status_atual in ('Bancada de Testes','Em teste final') and new.status_atual in ('Aprovado','Limpeza','Higienização','Em reparo','Triado') then
  v_etapa:='Bancada de Testes'; v_tecnico:=new.tecnico_bancada;
  if new.status_atual in ('Em reparo','Triado') then v_resultado:='reprovado'; end if;
 else return new; end if;
 if nullif(trim(v_tecnico),'') is null then select nome into v_tecnico from public.user_profiles where id=auth.uid(); end if;
 insert into public.linha_branca_producao_eventos(os_id,etapa,tecnico,resultado) values(new.id,v_etapa,coalesce(v_tecnico,'Sem técnico identificado'),v_resultado);
 return new;
end; $$;
revoke all on function public.registrar_conclusao_linha_branca() from public,anon;
grant execute on function public.registrar_conclusao_linha_branca() to authenticated;
create trigger trg_conclusao_linha_branca after update on public.ordens_servico for each row execute function public.registrar_conclusao_linha_branca();
