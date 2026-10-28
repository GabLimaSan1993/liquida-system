-- Indicadores de cumprimento do acordo de faturamento Assurant.
-- Meta base diária: B2C 150 itens; B2B 400 itens; 550 itens no total.
-- Excedente B2C acima de 150 reduz exigência B2B (mínimo zero), sem reduzir meta total.
create or replace function liquida_private.assurant_fechamento_diario_metas(
  p_inicio date,p_fim date
) returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public'
set statement_timeout to '25s'
as $body$
declare v_result jsonb;
begin
 if auth.uid() is null or auth.uid() <> all(array[
   'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid,
   'a5115520-a653-4ae3-b0ae-177674ffbff7'::uuid,
   '6e0ac557-93a2-42ae-8595-12648b2ac0de'::uuid,
   '8549de55-3657-4042-86c6-822cd3d49941'::uuid
 ]) then raise exception 'Sem permissão para Fechamento Diário' using errcode='42501'; end if;
 if p_inicio is null or p_fim is null or p_inicio>p_fim or p_fim-p_inicio>3660 then
   raise exception 'Período inválido (máximo 10 anos)';
 end if;

 with calendario as (
   select generate_series(p_inicio::timestamp,p_fim::timestamp,'1 day'::interval)::date as dia
 ),
 b2c_pedidos as materialized (
   select id_anymarket,min(faturado_em) as faturado_em,
     count(*)::bigint as quantidade
   from public.pedidos_b2c
   where faturado_em is not null
     and status is distinct from 'cancelado'
   group by id_anymarket
 ),
 b2c as (
   select (faturado_em at time zone 'America/Sao_Paulo')::date as dia,
     sum(quantidade)::bigint as unidades
   from b2c_pedidos
   where faturado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
     and faturado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
   group by 1
 ),
 b2b as (
   select (data_faturamento at time zone 'America/Sao_Paulo')::date as dia,
     sum(greatest(coalesce(total_itens,0),0))::bigint as unidades
   from public.b2b_nfs
   where status='ok'
     and data_faturamento >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
     and data_faturamento < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
   group by 1
 ),
 apurado as (
   select c.dia,coalesce(b2c.unidades,0)::bigint b2c_faturado,
      coalesce(b2b.unidades,0)::bigint b2b_faturado
   from calendario c
   left join b2c on b2c.dia=c.dia
   left join b2b on b2b.dia=c.dia
 ),
 balizado as (
   select dia,b2c_faturado,b2b_faturado,
     b2c_faturado+b2b_faturado as total_faturado,
     150 as meta_b2c,400 as meta_b2b_base,550 as meta_total,
     greatest(0,400-greatest(0,b2c_faturado-150))::int as meta_b2b_ajustada,
     least(400,greatest(0,b2c_faturado-150))::int as capacidade_realocada
   from apurado
 ),
 dias as (
   select *,b2c_faturado>=meta_b2c as b2c_atingiu,
     b2b_faturado>=meta_b2b_ajustada as b2b_atingiu,
     total_faturado>=meta_total as total_atingiu
   from balizado
 )
 select jsonb_build_object(
   'inicio',p_inicio,'fim',p_fim,'atualizado_em',now(),
   'metas',jsonb_build_object('b2c_dia',150,'b2b_dia',400,'total_dia',550),
   'resumo',(select to_jsonb(r) from (
     select count(*)::int dias,
       sum(meta_b2c)::bigint meta_b2c,
       sum(meta_b2b_base)::bigint meta_b2b_base,
       sum(meta_b2b_ajustada)::bigint meta_b2b_ajustada,
       sum(meta_total)::bigint meta_total,
       sum(b2c_faturado)::bigint b2c_faturado,
       sum(b2b_faturado)::bigint b2b_faturado,
       sum(total_faturado)::bigint total_faturado,
       sum(capacidade_realocada)::bigint capacidade_realocada,
       count(*) filter(where total_atingiu)::int dias_meta_total_atingida,
       count(*) filter(where b2c_atingiu and b2b_atingiu)::int dias_ambos_balizadores_atingidos
     from dias
   ) r),
   'dias',coalesce((select jsonb_agg(to_jsonb(x) order by x.dia) from dias x),'[]'::jsonb),
   'criterio','Metas diárias de faturamento por unidades. Cada unidade B2C acima de 150 reduz em uma unidade o balizador B2B até zero; referência combinada permanece 550. Dias corridos no período. B2B: NFs status ok, quantidade total_itens; B2C: itens faturados por pedido distinto (id_anymarket), cancelados excluídos.'
 ) into v_result;
 return v_result;
end
$body$;

create or replace function public.assurant_fechamento_diario_metas(
 p_inicio date,p_fim date
) returns jsonb language sql security invoker
set search_path to 'pg_catalog'
as $body$
 select liquida_private.assurant_fechamento_diario_metas(p_inicio,p_fim)
$body$;
revoke all on function public.assurant_fechamento_diario_metas(date,date) from public,anon;
grant execute on function public.assurant_fechamento_diario_metas(date,date) to authenticated;
revoke all on function liquida_private.assurant_fechamento_diario_metas(date,date) from public,anon;
grant execute on function liquida_private.assurant_fechamento_diario_metas(date,date) to authenticated;
