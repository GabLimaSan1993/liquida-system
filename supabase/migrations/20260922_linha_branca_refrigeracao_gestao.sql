-- Linha Branca / Refrigeração
-- Gestão de condenações com aprovação gerencial, estoque de peças,
-- requisições de separação, necessidades de compra e fotos.

create table if not exists public.linha_branca_responsaveis (
  id bigserial primary key,
  papel text not null,
  user_id uuid not null references public.user_profiles(id) on delete cascade,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (papel, user_id)
);

create table if not exists public.linha_branca_pecas_estoque (
  id bigserial primary key,
  pn text not null,
  descricao text,
  saldo numeric(12,2) not null default 0 check (saldo >= 0),
  unidade text not null default 'UN',
  localizacao text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists linha_branca_pecas_estoque_pn_uidx
  on public.linha_branca_pecas_estoque (upper(pn));

create table if not exists public.linha_branca_pecas_requisicoes (
  id bigserial primary key,
  os_id bigint not null references public.ordens_servico(id) on delete cascade,
  estoque_id bigint references public.linha_branca_pecas_estoque(id) on delete set null,
  pn text not null,
  quantidade numeric(12,2) not null default 1 check (quantidade > 0),
  status text not null default 'solicitada'
    check (status in ('solicitada','separada','entregue','cancelada')),
  solicitado_por uuid references public.user_profiles(id) on delete set null,
  solicitado_por_nome text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists linha_branca_pecas_requisicoes_os_idx
  on public.linha_branca_pecas_requisicoes(os_id);
create unique index if not exists linha_branca_pecas_requisicoes_aberta_uidx
  on public.linha_branca_pecas_requisicoes(os_id, upper(pn))
  where status in ('solicitada','separada');
create index if not exists linha_branca_pecas_requisicoes_estoque_idx
  on public.linha_branca_pecas_requisicoes(estoque_id);
create index if not exists linha_branca_pecas_requisicoes_solicitado_por_idx
  on public.linha_branca_pecas_requisicoes(solicitado_por);

create table if not exists public.linha_branca_necessidades_compra (
  id bigserial primary key,
  os_id bigint not null references public.ordens_servico(id) on delete cascade,
  pn text not null,
  descricao text,
  quantidade numeric(12,2) not null default 1 check (quantidade > 0),
  status text not null default 'necessidade_aberta'
    check (status in ('necessidade_aberta','em_cotacao','comprada','recebida','cancelada')),
  solicitado_por uuid references public.user_profiles(id) on delete set null,
  solicitado_por_nome text,
  responsavel_id uuid references public.user_profiles(id) on delete set null,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists linha_branca_necessidades_compra_os_idx
  on public.linha_branca_necessidades_compra(os_id);
create unique index if not exists linha_branca_necessidades_compra_aberta_uidx
  on public.linha_branca_necessidades_compra(os_id, upper(pn))
  where status in ('necessidade_aberta','em_cotacao');
create index if not exists linha_branca_necessidades_compra_solicitado_por_idx
  on public.linha_branca_necessidades_compra(solicitado_por);
create index if not exists linha_branca_necessidades_compra_responsavel_idx
  on public.linha_branca_necessidades_compra(responsavel_id);

create table if not exists public.linha_branca_condenacoes (
  id bigserial primary key,
  os_id bigint not null references public.ordens_servico(id) on delete cascade,
  linha text not null default 'Linha Branca',
  categoria text,
  motivo text not null,
  area_retorno text,
  tem_reposicao_troca boolean not null default false,
  fotos text[] not null default '{}',
  status text not null default 'aguardando_aprovacao'
    check (status in ('aguardando_aprovacao','aprovada','rejeitada','cancelada')),
  destino text check (destino is null or destino in ('Scrap','Venda no estado','Desmembramento')),
  solicitado_por uuid references public.user_profiles(id) on delete set null,
  solicitado_por_nome text,
  solicitado_em timestamptz not null default now(),
  decidido_por uuid references public.user_profiles(id) on delete set null,
  decidido_por_nome text,
  decidido_em timestamptz,
  decisao_observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists linha_branca_condenacoes_status_idx
  on public.linha_branca_condenacoes(status, created_at);
create unique index if not exists linha_branca_condenacoes_pendente_os_uidx
  on public.linha_branca_condenacoes(os_id)
  where status = 'aguardando_aprovacao';
create index if not exists linha_branca_condenacoes_os_idx
  on public.linha_branca_condenacoes(os_id);
create index if not exists linha_branca_condenacoes_solicitado_por_idx
  on public.linha_branca_condenacoes(solicitado_por);
create index if not exists linha_branca_condenacoes_decidido_por_idx
  on public.linha_branca_condenacoes(decidido_por);
create index if not exists linha_branca_responsaveis_user_idx
  on public.linha_branca_responsaveis(user_id);

insert into public.linha_branca_responsaveis (papel, user_id, ativo)
select 'gerente_linha_branca', up.id, true
from public.user_profiles up
where up.nome = 'Marcelo Ramos'
on conflict (papel, user_id) do update set ativo = true, updated_at = now();

alter table public.linha_branca_responsaveis enable row level security;
alter table public.linha_branca_pecas_estoque enable row level security;
alter table public.linha_branca_pecas_requisicoes enable row level security;
alter table public.linha_branca_necessidades_compra enable row level security;
alter table public.linha_branca_condenacoes enable row level security;

revoke all on table public.linha_branca_responsaveis from anon, authenticated;
revoke all on table public.linha_branca_pecas_estoque from anon, authenticated;
revoke all on table public.linha_branca_pecas_requisicoes from anon, authenticated;
revoke all on table public.linha_branca_necessidades_compra from anon, authenticated;
revoke all on table public.linha_branca_condenacoes from anon, authenticated;

grant select on table public.linha_branca_responsaveis to authenticated;
grant select on table public.linha_branca_pecas_estoque to authenticated;
grant select, insert, update on table public.linha_branca_pecas_requisicoes to authenticated;
grant select, insert, update on table public.linha_branca_necessidades_compra to authenticated;
grant select, insert, update on table public.linha_branca_condenacoes to authenticated;

grant usage, select on sequence public.linha_branca_responsaveis_id_seq to authenticated;
grant usage, select on sequence public.linha_branca_pecas_estoque_id_seq to authenticated;
grant usage, select on sequence public.linha_branca_pecas_requisicoes_id_seq to authenticated;
grant usage, select on sequence public.linha_branca_necessidades_compra_id_seq to authenticated;
grant usage, select on sequence public.linha_branca_condenacoes_id_seq to authenticated;

drop policy if exists linha_branca_responsaveis_select on public.linha_branca_responsaveis;
create policy linha_branca_responsaveis_select
on public.linha_branca_responsaveis for select to authenticated using (true);

drop policy if exists linha_branca_pecas_estoque_select on public.linha_branca_pecas_estoque;
create policy linha_branca_pecas_estoque_select
on public.linha_branca_pecas_estoque for select to authenticated using (true);

drop policy if exists linha_branca_pecas_requisicoes_select on public.linha_branca_pecas_requisicoes;
create policy linha_branca_pecas_requisicoes_select
on public.linha_branca_pecas_requisicoes for select to authenticated using (true);
drop policy if exists linha_branca_pecas_requisicoes_insert on public.linha_branca_pecas_requisicoes;
create policy linha_branca_pecas_requisicoes_insert
on public.linha_branca_pecas_requisicoes for insert to authenticated
with check (solicitado_por = (select auth.uid()));
drop policy if exists linha_branca_pecas_requisicoes_update_gerente on public.linha_branca_pecas_requisicoes;
create policy linha_branca_pecas_requisicoes_update_gerente
on public.linha_branca_pecas_requisicoes for update to authenticated
using (exists (
  select 1 from public.linha_branca_responsaveis r
  where r.user_id=(select auth.uid()) and r.papel='gerente_linha_branca' and r.ativo
))
with check (exists (
  select 1 from public.linha_branca_responsaveis r
  where r.user_id=(select auth.uid()) and r.papel='gerente_linha_branca' and r.ativo
));

drop policy if exists linha_branca_necessidades_compra_select on public.linha_branca_necessidades_compra;
create policy linha_branca_necessidades_compra_select
on public.linha_branca_necessidades_compra for select to authenticated using (true);
drop policy if exists linha_branca_necessidades_compra_insert on public.linha_branca_necessidades_compra;
create policy linha_branca_necessidades_compra_insert
on public.linha_branca_necessidades_compra for insert to authenticated
with check (solicitado_por = (select auth.uid()));
drop policy if exists linha_branca_necessidades_compra_update_gerente on public.linha_branca_necessidades_compra;
create policy linha_branca_necessidades_compra_update_gerente
on public.linha_branca_necessidades_compra for update to authenticated
using (exists (
  select 1 from public.linha_branca_responsaveis r
  where r.user_id=(select auth.uid()) and r.papel='gerente_linha_branca' and r.ativo
))
with check (exists (
  select 1 from public.linha_branca_responsaveis r
  where r.user_id=(select auth.uid()) and r.papel='gerente_linha_branca' and r.ativo
));

drop policy if exists linha_branca_condenacoes_select on public.linha_branca_condenacoes;
create policy linha_branca_condenacoes_select
on public.linha_branca_condenacoes for select to authenticated using (true);
drop policy if exists linha_branca_condenacoes_insert on public.linha_branca_condenacoes;
create policy linha_branca_condenacoes_insert
on public.linha_branca_condenacoes for insert to authenticated
with check (solicitado_por = (select auth.uid()));
drop policy if exists linha_branca_condenacoes_update_gerente on public.linha_branca_condenacoes;
create policy linha_branca_condenacoes_update_gerente
on public.linha_branca_condenacoes for update to authenticated
using (exists (
  select 1 from public.linha_branca_responsaveis r
  where r.user_id=(select auth.uid()) and r.papel='gerente_linha_branca' and r.ativo
))
with check (exists (
  select 1 from public.linha_branca_responsaveis r
  where r.user_id=(select auth.uid()) and r.papel='gerente_linha_branca' and r.ativo
));

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values (
  'linha-branca-condenacoes',
  'linha-branca-condenacoes',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists linha_branca_condenacoes_fotos_insert on storage.objects;
create policy linha_branca_condenacoes_fotos_insert
on storage.objects for insert to authenticated
with check (bucket_id='linha-branca-condenacoes');

drop policy if exists linha_branca_condenacoes_fotos_select on storage.objects;
create policy linha_branca_condenacoes_fotos_select
on storage.objects for select to authenticated
using (bucket_id='linha-branca-condenacoes');


-- Contexto de reposição/troca vinculado ao reparo e às peças, não à condenação.
create table if not exists public.linha_branca_reparo_pecas_contexto (
  id bigserial primary key,
  os_id bigint not null references public.ordens_servico(id) on delete cascade,
  area_reparo text not null,
  tem_reposicao_troca boolean not null default false,
  fotos text[] not null default '{}',
  registrado_por uuid references public.user_profiles(id) on delete set null,
  registrado_por_nome text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (os_id, area_reparo)
);

create index if not exists linha_branca_reparo_pecas_contexto_os_idx
  on public.linha_branca_reparo_pecas_contexto(os_id);
create index if not exists linha_branca_reparo_pecas_contexto_registrado_por_idx
  on public.linha_branca_reparo_pecas_contexto(registrado_por);

alter table public.linha_branca_reparo_pecas_contexto enable row level security;
revoke all on table public.linha_branca_reparo_pecas_contexto from anon, authenticated;
grant select, insert, update on table public.linha_branca_reparo_pecas_contexto to authenticated;
grant usage, select on sequence public.linha_branca_reparo_pecas_contexto_id_seq to authenticated;

drop policy if exists linha_branca_reparo_pecas_contexto_select on public.linha_branca_reparo_pecas_contexto;
create policy linha_branca_reparo_pecas_contexto_select
on public.linha_branca_reparo_pecas_contexto
for select to authenticated
using (true);

drop policy if exists linha_branca_reparo_pecas_contexto_insert on public.linha_branca_reparo_pecas_contexto;
create policy linha_branca_reparo_pecas_contexto_insert
on public.linha_branca_reparo_pecas_contexto
for insert to authenticated
with check (registrado_por = (select auth.uid()));

drop policy if exists linha_branca_reparo_pecas_contexto_update on public.linha_branca_reparo_pecas_contexto;
create policy linha_branca_reparo_pecas_contexto_update
on public.linha_branca_reparo_pecas_contexto
for update to authenticated
using (
  registrado_por = (select auth.uid())
  or exists (
    select 1 from public.linha_branca_responsaveis r
    where r.user_id = (select auth.uid())
      and r.papel = 'gerente_linha_branca'
      and r.ativo
  )
)
with check (
  registrado_por = (select auth.uid())
  or exists (
    select 1 from public.linha_branca_responsaveis r
    where r.user_id = (select auth.uid())
      and r.papel = 'gerente_linha_branca'
      and r.ativo
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'linha-branca-pecas',
  'linha-branca-pecas',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists linha_branca_pecas_fotos_insert on storage.objects;
create policy linha_branca_pecas_fotos_insert
on storage.objects
for insert to authenticated
with check (bucket_id = 'linha-branca-pecas');

drop policy if exists linha_branca_pecas_fotos_select on storage.objects;
create policy linha_branca_pecas_fotos_select
on storage.objects
for select to authenticated
using (bucket_id = 'linha-branca-pecas');
