CREATE OR REPLACE FUNCTION liquida_private.assurant_fechamento_diario_periodo(p_inicio date, p_fim date, p_agrupamento text DEFAULT 'dia'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET statement_timeout TO '60s'
AS $function$
declare
  v_res jsonb;
begin
  if auth.uid() is null or auth.uid() <> all (array['b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid,'a5115520-a653-4ae3-b0ae-177674ffbff7'::uuid,'6e0ac557-93a2-42ae-8595-12648b2ac0de'::uuid,'8549de55-3657-4042-86c6-822cd3d49941'::uuid]) then
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
      coalesce(sum(quantidade),0)::bigint total
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
      'producao','Eventos deduplicados por fonte, identificador, etapa e instante; todos os registros de produção (incluindo revisões/reprocessamentos) somados à respectiva estação',
      'fuso','America/Sao_Paulo')
  ) into v_res;
  return v_res;
end $function$
;
