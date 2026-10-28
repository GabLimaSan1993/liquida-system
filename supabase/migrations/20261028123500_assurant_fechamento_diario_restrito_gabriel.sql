
-- Fechamento Diário Assurant: acesso individual na função, não apenas na interface.
create or replace function liquida_private.assurant_fechamento_diario_periodo(
  p_inicio date, p_fim date, p_agrupamento text default 'dia'
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog', 'public'
set statement_timeout to '60s'
as $body$
declare
  v_res jsonb;
begin
  if auth.uid() is distinct from 'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid then
    raise exception 'Sem permissão para Fechamento Diário' using errcode='42501';
  end if;
  if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>3660 then
    raise exception 'Período inválido (máximo 10 anos)';
  end if;
  if p_agrupamento not in ('dia','semana','mes','ano') then
    raise exception 'Agrupamento inválido';
  end if;
  with b2c_pedido as materialized (
    select id_anymarket,
      min(faturado_em) faturado_em,
      max(coalesce(total_do_pedido,0)) valor,
      count(*)::int itens
    from public.pedidos_b2c
    where faturado_em is not null and status is distinct from 'cancelado'
    group by id_anymarket
  ),
  notas as materialized (
    select date_trunc(
      case p_agrupamento when 'semana' then 'week' when 'mes' then 'month' when 'ano' then 'year' else 'day' end,
      n.data_faturamento at time zone 'America/Sao_Paulo')::date periodo,
      'B2B'::text canal, coalesce(n.valor_total,0) valor,
      greatest(coalesce(n.total_itens,0),0)::bigint itens, 1::bigint documentos
    from public.b2b_nfs n
    where n.data_faturamento >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
      and n.data_faturamento < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
      and n.status = 'ok'
    union all
    select date_trunc(
      case p_agrupamento when 'semana' then 'week' when 'mes' then 'month' when 'ano' then 'year' else 'day' end,
      b.faturado_em at time zone 'America/Sao_Paulo')::date periodo,
      'B2C'::text canal, b.valor, b.itens::bigint, 1::bigint
    from b2c_pedido b
    where b.faturado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
      and b.faturado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
  ),
  financeiro as (
    select periodo,canal,round(sum(valor)::numeric,2) valor,
      sum(itens)::bigint itens,sum(documentos)::bigint documentos
    from notas group by periodo,canal
  ),
  eventos as materialized (
    select distinct on (fonte,fonte_id,etapa,realizado_em)
      fonte,fonte_id,etapa,realizado_em,quantidade,canal,unidade,retrabalho
    from liquida_private.producao_base
    where realizado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
      and realizado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
    order by fonte,fonte_id,etapa,realizado_em,retrabalho desc
  ),
  produtivo as (
    select date_trunc(
        case p_agrupamento when 'semana' then 'week' when 'mes' then 'month' when 'ano' then 'year' else 'day' end,
        realizado_em at time zone 'America/Sao_Paulo')::date periodo,
      etapa,canal,unidade,
      coalesce(sum(quantidade) filter (where not retrabalho),0)::bigint total,
      coalesce(sum(quantidade) filter (where retrabalho),0)::bigint retrabalho
    from eventos
    group by 1,2,3,4
  )
  select jsonb_build_object(
    'inicio',p_inicio,'fim',p_fim,'agrupamento',p_agrupamento,'atualizado_em',now(),
    'faturamento',coalesce((select jsonb_agg(to_jsonb(x) order by x.periodo,x.canal) from financeiro x),'[]'::jsonb),
    'producao',coalesce((select jsonb_agg(to_jsonb(x) order by x.periodo,x.etapa) from produtivo x),'[]'::jsonb),
    'criterios',jsonb_build_object(
      'b2b','Notas com status ok; data_faturamento; valor_total da nota; erro excluído',
      'b2c','Uma vez por id_anymarket; faturado_em mais antigo; total_do_pedido sem multiplicação por item; cancelados excluídos',
      'producao','Eventos de liquida_private.producao_base, deduplicados por fonte, identificador, etapa e instante; retrabalho separado',
      'fuso','America/Sao_Paulo')
  ) into v_res;
  return v_res;
end $body$;

create or replace function liquida_private.assurant_fechamento_diario_backlog(
  p_referencia date
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public'
set statement_timeout to '60s'
as $body$
declare
  v_res jsonb;
  v_fim timestamptz;
begin
  if auth.uid() is distinct from 'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid then
    raise exception 'Sem permissão para Fechamento Diário' using errcode='42501';
  end if;
  if p_referencia is null or p_referencia < date '2020-01-01' or p_referencia > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Data de referência inválida';
  end if;
  v_fim := (p_referencia+1)::timestamp at time zone 'America/Sao_Paulo';
  select jsonb_build_object(
    'data_referencia',p_referencia,'atualizado_em',now(),
    'etapas',jsonb_build_array(
      jsonb_build_object('etapa','antes_recebimento','nome','Pré-recebimento','total',count(*) filter(where e.recebimento is null or e.recebimento>=v_fim)),
      jsonb_build_object('etapa','aguardando_funcional','nome','Aguardando triagem funcional','total',count(*) filter(where e.recebimento<v_fim and (e.funcional is null or e.funcional>=v_fim))),
      jsonb_build_object('etapa','aguardando_laudo','nome','Aguardando laudo','total',count(*) filter(where e.funcional<v_fim and (e.cosmetica is null or e.cosmetica>=v_fim) and coalesce(e.status_liquida,'') ilike '%laudo%')),
      jsonb_build_object('etapa','aguardando_cosmetica','nome','Aguardando triagem cosmética','total',count(*) filter(where e.funcional<v_fim and (e.cosmetica is null or e.cosmetica>=v_fim) and coalesce(e.status_liquida,'') not ilike '%laudo%')),
      jsonb_build_object('etapa','aguardando_armazenagem','nome','Aguardando armazenagem','total',count(*) filter(where e.cosmetica<v_fim and (e.armazenagem is null or e.armazenagem>=v_fim))),
      jsonb_build_object('etapa','aguardando_oracle','nome','Aguardando Oracle','total',count(*) filter(where e.armazenagem<v_fim and (e.oracle is null or e.oracle>=v_fim)))
    ),
    'criterio','Saldo reconstruído até o final do dia pela primeira passagem de cada etapa; cancelados atuais excluídos; estágio de laudo apurado pelo status atual. Pré-recebimento não representa estoque físico.',
    'fonte','liquida_private.esteira_tradein'
  ) into v_res
  from liquida_private.esteira_tradein e
  where e.inicio < v_fim and not e.cancelado;
  return v_res;
end $body$;

create or replace function public.assurant_fechamento_diario_periodo(
 p_inicio date,p_fim date,p_agrupamento text default 'dia'
) returns jsonb language sql security invoker set search_path to 'pg_catalog'
as $body$
  select liquida_private.assurant_fechamento_diario_periodo(p_inicio,p_fim,p_agrupamento)
$body$;

create or replace function public.assurant_fechamento_diario_backlog(
 p_referencia date
) returns jsonb language sql security invoker set search_path to 'pg_catalog'
as $body$
  select liquida_private.assurant_fechamento_diario_backlog(p_referencia)
$body$;

revoke all on function public.assurant_fechamento_diario_periodo(date,date,text) from public,anon;
revoke all on function public.assurant_fechamento_diario_backlog(date) from public,anon;
grant execute on function public.assurant_fechamento_diario_periodo(date,date,text) to authenticated;
grant execute on function public.assurant_fechamento_diario_backlog(date) to authenticated;
revoke all on function liquida_private.assurant_fechamento_diario_periodo(date,date,text) from public,anon;
revoke all on function liquida_private.assurant_fechamento_diario_backlog(date) from public,anon;
grant execute on function liquida_private.assurant_fechamento_diario_periodo(date,date,text) to authenticated;
grant execute on function liquida_private.assurant_fechamento_diario_backlog(date) to authenticated;
