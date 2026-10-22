-- Saúde da bateria permanece em status_bateria/bateria_percentual.
-- Somente estas duas opções deixam de ser defeitos adicionais.
create or replace function liquida_private.triagem_limpar_faixas_bateria(p_defeitos text)
returns text language sql immutable security invoker
set search_path = pg_catalog
as $$
 with itens as (
  select btrim(d) as nome, ordem,
   translate(lower(btrim(d)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
    in ('saude da bateria abaixo de 80%', 'saude da bateria entre 80% e 85%') as remover
  from regexp_split_to_table(p_defeitos, ';') with ordinality as x(d, ordem)
 )
 select case when exists(select 1 from itens where remover)
  then (select string_agg(nome, '; ' order by ordem) from itens where not remover and nome <> '')
  else p_defeitos end;
$$;
revoke all on function liquida_private.triagem_limpar_faixas_bateria(text) from public;
grant execute on function liquida_private.triagem_limpar_faixas_bateria(text) to authenticated, service_role;

-- Uma limpeza isolada não é uma nova triagem: preserva a grade/etapa histórica.
-- Mantém integralmente as demais regras vigentes desta função.
do $migration$
declare definicao text; inicio text := E'begin\n if new.data_funcional is null';
begin
 definicao := pg_get_functiondef('liquida_private.triagem_defeitos_grade_guard()'::regprocedure);
 if strpos(definicao, inicio) = 0 then raise exception 'Regra de grade mudou; revisar migração antes de aplicar.'; end if;
 definicao := replace(definicao, inicio, $guard$begin
 if tg_op = 'UPDATE' then
  if new.defeitos_adicionais is distinct from old.defeitos_adicionais
   and new.defeitos_adicionais is not distinct from liquida_private.triagem_limpar_faixas_bateria(old.defeitos_adicionais)
   and (to_jsonb(new) - 'defeitos_adicionais') = (to_jsonb(old) - 'defeitos_adicionais') then
   return new;
  end if;
 end if;
 if new.data_funcional is null$guard$);
 execute definicao;
end;
$migration$;

create or replace function liquida_private.triagem_defeito_exige_quebrado(p_defeitos text)
returns boolean language sql immutable security invoker
set search_path = pg_catalog
as $$
 select exists(select 1 from regexp_split_to_table(coalesce(liquida_private.triagem_limpar_faixas_bateria(p_defeitos),''),';') d where btrim(d) <> '');
$$;

create or replace function liquida_private.triagem_limpar_faixas_bateria_guard()
returns trigger language plpgsql security invoker
set search_path = pg_catalog
as $$
begin
 new.defeitos_adicionais := liquida_private.triagem_limpar_faixas_bateria(new.defeitos_adicionais);
 return new;
end;
$$;
revoke all on function liquida_private.triagem_limpar_faixas_bateria_guard() from public;

-- Executa antes da regra de grade; cobre triagens, retriagens e importações Gaia.
create trigger aa_triagem_limpar_faixas_bateria
before insert or update of defeitos_adicionais on public.assurant_triagem
for each row execute function liquida_private.triagem_limpar_faixas_bateria_guard();

update public.triagem_defeitos set ativo = false
where translate(lower(btrim(nome)), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
 in ('saude da bateria abaixo de 80%', 'saude da bateria entre 80% e 85%');

-- Histórico privado para reversão da limpeza, inclusive produtos já alocados.
create table liquida_private.triagem_bateria_defeitos_revisao (
 id uuid primary key,
 defeitos_antes text,
 defeitos_depois text,
 corrigido_em timestamptz not null default now()
);
alter table liquida_private.triagem_bateria_defeitos_revisao enable row level security;
revoke all on liquida_private.triagem_bateria_defeitos_revisao from public, anon, authenticated;

create temporary table bateria_defeitos_estado_anterior on commit drop as
select id, to_jsonb(t) - 'defeitos_adicionais' as estado
from public.assurant_triagem t
where defeitos_adicionais is distinct from liquida_private.triagem_limpar_faixas_bateria(defeitos_adicionais);

insert into liquida_private.triagem_bateria_defeitos_revisao(id, defeitos_antes, defeitos_depois)
select t.id, t.defeitos_adicionais, liquida_private.triagem_limpar_faixas_bateria(t.defeitos_adicionais)
from public.assurant_triagem t join bateria_defeitos_estado_anterior a on a.id=t.id;

update public.assurant_triagem t
set defeitos_adicionais = r.defeitos_depois
from liquida_private.triagem_bateria_defeitos_revisao r
where t.id = r.id;

-- Relatórios/indicadores leem assurant_triagem diretamente ou por view.
-- Não reclassifica grades, resultados, etapas nem vínculos de pedidos/WMS.
do $$
begin
 if exists(select 1 from public.assurant_triagem t join bateria_defeitos_estado_anterior a on a.id=t.id
  where (to_jsonb(t) - 'defeitos_adicionais') is distinct from a.estado) then
  raise exception 'Limpeza alterou campos fora dos defeitos adicionais; operação cancelada.';
 end if;
 if exists(select 1 from public.assurant_triagem where defeitos_adicionais is distinct from liquida_private.triagem_limpar_faixas_bateria(defeitos_adicionais)) then
  raise exception 'Restaram faixas de bateria nos defeitos adicionais.';
 end if;
end;
$$;
