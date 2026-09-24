-- Correção física de cor por IMEI na Rastreabilidade Assurant.
-- Preserva SKU/modelo sistêmicos e registra histórico auditável.

create table if not exists public.assurant_rastreabilidade_ajustes (
  id uuid primary key default gen_random_uuid(),
  imei text not null,
  campo text not null,
  valor_anterior text,
  valor_novo text not null,
  motivo text not null,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint assurant_rastreabilidade_ajustes_campo_chk check (campo in ('cor')),
  constraint assurant_rastreabilidade_ajustes_imei_chk check (length(trim(imei)) between 8 and 40),
  constraint assurant_rastreabilidade_ajustes_motivo_chk check (length(trim(motivo)) >= 3)
);

create index if not exists idx_assurant_rastreabilidade_ajustes_imei_campo_data
  on public.assurant_rastreabilidade_ajustes (imei,campo,criado_em desc);

alter table public.assurant_rastreabilidade_ajustes enable row level security;
revoke all on table public.assurant_rastreabilidade_ajustes from anon, authenticated;

create or replace function public.assurant_rastreabilidade_cor(p_imei text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_imei text := trim(coalesce(p_imei,''));
  v_sku text;
  v_cor_sistema text;
  v_ajuste record;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Usuário sem permissão para consultar a rastreabilidade.';
  end if;

  if v_imei = '' then raise exception 'IMEI obrigatório.'; end if;

  select coalesce(
    (select a.sku from public.wms_alocacoes a
      where trim(a.imei)=v_imei and a.status='confirmado' and a.retirado_em is null
      order by a.confirmado_em desc nulls last,a.criado_em desc nulls last limit 1),
    (select t.sku from public.assurant_triagem t
      where trim(t.imei)=v_imei
      order by coalesce(t.atualizado_em,t.criado_em) desc nulls last,t.id desc limit 1)
  ) into v_sku;

  select upper(trim(pc.cor))
  into v_cor_sistema
  from public.produtos_catalogo pc
  where upper(trim(coalesce(pc.sku_als,'')))=upper(trim(coalesce(v_sku,'')))
     or upper(trim(coalesce(pc.sku_oracle,'')))=upper(trim(coalesce(v_sku,'')))
  order by coalesce(pc.ativo,false) desc,pc.data_cadastro desc nulls last
  limit 1;

  select a.id,a.valor_anterior,a.valor_novo,a.motivo,a.criado_por,a.criado_em,up.nome criado_por_nome
  into v_ajuste
  from public.assurant_rastreabilidade_ajustes a
  left join public.user_profiles up on up.id=a.criado_por
  where trim(a.imei)=v_imei and a.campo='cor'
  order by a.criado_em desc,a.id desc
  limit 1;

  return jsonb_build_object(
    'imei',v_imei,'sku',v_sku,'cor_sistema',v_cor_sistema,
    'cor_atual',coalesce(v_ajuste.valor_novo,v_cor_sistema),
    'corrigida',v_ajuste.id is not null,'ajuste_id',v_ajuste.id,
    'motivo',v_ajuste.motivo,'alterado_em',v_ajuste.criado_em,
    'alterado_por',v_ajuste.criado_por,'alterado_por_nome',v_ajuste.criado_por_nome
  );
end
$function$;

create or replace function public.assurant_atualizar_cor_rastreabilidade(
  p_imei text,p_cor text,p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_imei text := trim(coalesce(p_imei,''));
  v_cor text := upper(trim(coalesce(p_cor,'')));
  v_motivo text := trim(coalesce(p_motivo,''));
  v_anterior text;
  v_sku text;
  v_id uuid;
  v_usuario uuid := auth.uid();
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Usuário sem permissão para alterar a rastreabilidade.';
  end if;
  if v_imei = '' then raise exception 'IMEI obrigatório.'; end if;
  if length(v_cor) < 2 or length(v_cor) > 60 then raise exception 'Informe uma cor válida.'; end if;
  if length(v_motivo) < 3 then raise exception 'Informe o motivo da correção com pelo menos 3 caracteres.'; end if;

  if not exists (
    select 1 from public.assurant_triagem t where trim(t.imei)=v_imei
    union all
    select 1 from public.wms_alocacoes a where trim(a.imei)=v_imei
    limit 1
  ) then raise exception 'IMEI não encontrado na operação Assurant.'; end if;

  select coalesce(
    (select a.sku from public.wms_alocacoes a
      where trim(a.imei)=v_imei and a.status='confirmado' and a.retirado_em is null
      order by a.confirmado_em desc nulls last,a.criado_em desc nulls last limit 1),
    (select t.sku from public.assurant_triagem t
      where trim(t.imei)=v_imei
      order by coalesce(t.atualizado_em,t.criado_em) desc nulls last,t.id desc limit 1)
  ) into v_sku;

  select coalesce(
    (select a.valor_novo from public.assurant_rastreabilidade_ajustes a
      where trim(a.imei)=v_imei and a.campo='cor'
      order by a.criado_em desc,a.id desc limit 1),
    (select upper(trim(pc.cor)) from public.produtos_catalogo pc
      where upper(trim(coalesce(pc.sku_als,'')))=upper(trim(coalesce(v_sku,'')))
         or upper(trim(coalesce(pc.sku_oracle,'')))=upper(trim(coalesce(v_sku,'')))
      order by coalesce(pc.ativo,false) desc,pc.data_cadastro desc nulls last limit 1)
  ) into v_anterior;

  if upper(trim(coalesce(v_anterior,''))) = v_cor then
    return public.assurant_rastreabilidade_cor(v_imei) || jsonb_build_object('ok',true,'alterado',false);
  end if;

  insert into public.assurant_rastreabilidade_ajustes(
    imei,campo,valor_anterior,valor_novo,motivo,criado_por
  ) values(v_imei,'cor',v_anterior,v_cor,v_motivo,v_usuario)
  returning id into v_id;

  return public.assurant_rastreabilidade_cor(v_imei)
    || jsonb_build_object('ok',true,'alterado',true,'ajuste_id',v_id);
end
$function$;

revoke all on function public.assurant_rastreabilidade_cor(text) from public,anon;
revoke all on function public.assurant_atualizar_cor_rastreabilidade(text,text,text) from public,anon;
grant execute on function public.assurant_rastreabilidade_cor(text) to authenticated;
grant execute on function public.assurant_atualizar_cor_rastreabilidade(text,text,text) to authenticated;
