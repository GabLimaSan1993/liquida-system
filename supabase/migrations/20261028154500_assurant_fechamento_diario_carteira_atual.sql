
-- Carteira corrente para o Fechamento Diário; não reconstruir carteira histórica a partir do estado presente.
create or replace function liquida_private.assurant_fechamento_diario_carteira()
returns jsonb language plpgsql security definer
set search_path to 'pg_catalog','public'
set statement_timeout to '25s'
as $fn$
declare v jsonb; v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
 if auth.uid() is null or auth.uid() <> all(array[
  'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid,
  'a5115520-a653-4ae3-b0ae-177674ffbff7'::uuid,
  '6e0ac557-93a2-42ae-8595-12648b2ac0de'::uuid,
  '8549de55-3657-4042-86c6-822cd3d49941'::uuid
 ]) then raise exception 'Sem permissão para Fechamento Diário' using errcode='42501';end if;

 with b2b_base as materialized (
  select p.id pedido_id,
    p.cliente,p.lote,p.status_faturamento,
    i.status status_item,i.embalado_em,i.nao_localizado_em,i.localizado_em,i.nf_erro,
    (
     upper(coalesce(p.cliente,'')) ~ '(REPARO|REVIS|LABORAT|VALIDA)'
     or upper(coalesce(p.lote,'')) ~ '(REPARO|REVIS|VALIDA)'
    ) operacao_interna
  from public.b2b_pedidos p
  join public.b2b_itens i on i.pedido_id=p.id
  where p.status='aberto'
    and p.status_faturamento in ('pendente','parcial','erro_nf')
    and p.encerrado_sem_faturamento_em is null
    and i.nao_faturar_em is null and i.status is distinct from 'nao_faturar'
    and nullif(btrim(coalesce(i.nf,'')),'') is null
 ), b2b_classificado as materialized (
 select *,case
   when operacao_interna then 'interno'
   when status_faturamento='erro_nf' or coalesce(nf_erro,false)
      or (nao_localizado_em is not null and localizado_em is null)
      or status_item='em_analise' then 'restrito'
   when status_item='bipado' and embalado_em is not null then 'pronto'
   when status_item in ('bipado','pendente') then 'preparacao'
   else 'restrito' end classe
 from b2b_base
 ), b2b as (
  select count(*)filter(where classe<>'interno')::int carteira,
    count(*)filter(where classe='pronto')::int pronto,
    count(*)filter(where classe='preparacao')::int preparacao,
    count(*)filter(where classe='restrito')::int restrito,
    count(*)filter(where classe='interno')::int interno,
    count(distinct pedido_id)filter(where classe<>'interno')::int pedidos
  from b2b_classificado
 ), b2c_base as materialized (
  select status from public.pedidos_b2c
  where faturado_em is null and nullif(btrim(coalesce(numero_nf,'')),'') is null
    and status not in ('cancelado','faturado','concluido')
 ), b2c as (
  select count(*)::int carteira,
    count(*)filter(where status='embalado')::int pronto,
    count(*)filter(where status in ('alocado','em_picking'))::int preparacao,
    count(*)filter(where status not in ('embalado','alocado','em_picking'))::int restrito
  from b2c_base
 ), realizados as (
  select
   (select coalesce(sum(greatest(coalesce(total_itens,0),0)),0)::int
    from public.b2b_nfs where status='ok'
     and data_faturamento>=v_hoje::timestamp at time zone 'America/Sao_Paulo'
     and data_faturamento<(v_hoje+1)::timestamp at time zone 'America/Sao_Paulo') b2b,
   (select count(*)::int
    from public.pedidos_b2c where faturado_em is not null and status is distinct from 'cancelado'
     and faturado_em>=v_hoje::timestamp at time zone 'America/Sao_Paulo'
     and faturado_em<(v_hoje+1)::timestamp at time zone 'America/Sao_Paulo') b2c
 ), combinado as (
 select b2b.carteira b2b_carteira,b2b.pronto b2b_pronto,b2b.preparacao b2b_preparacao,
   b2b.restrito b2b_restrito,b2b.interno b2b_interno,b2b.pedidos b2b_pedidos,
   b2c.carteira b2c_carteira,b2c.pronto b2c_pronto,b2c.preparacao b2c_preparacao,b2c.restrito b2c_restrito,
   realizados.b2b b2b_hoje, realizados.b2c b2c_hoje
 from b2b cross join b2c cross join realizados
 )
 select jsonb_build_object(
   'atualizado_em',now(),'data_referencia',v_hoje,'natureza','Fotografia atual da carteira; não representa estoque histórico de pedidos',
   'b2b',jsonb_build_object('carteira',b2b_carteira,'pedidos',b2b_pedidos,'prontos',b2b_pronto,
       'em_preparacao',b2b_preparacao,'com_restricao',b2b_restrito,'operacoes_internas_excluidas',b2b_interno,
       'trabalhaveis',b2b_pronto+b2b_preparacao,'faturados_hoje',b2b_hoje,
       'potencial_hoje',b2b_hoje+b2b_pronto+b2b_preparacao),
   'b2c',jsonb_build_object('carteira',b2c_carteira,'prontos',b2c_pronto,
       'em_preparacao',b2c_preparacao,'com_restricao',b2c_restrito,
       'trabalhaveis',b2c_pronto+b2c_preparacao,'faturados_hoje',b2c_hoje,
       'potencial_hoje',b2c_hoje+b2c_pronto+b2c_preparacao),
   'total',jsonb_build_object('carteira',b2b_carteira+b2c_carteira,
       'trabalhaveis',b2b_pronto+b2b_preparacao+b2c_pronto+b2c_preparacao,
       'prontos',b2b_pronto+b2c_pronto,
       'com_restricao',b2b_restrito+b2c_restrito,
       'faturados_hoje',b2b_hoje+b2c_hoje,
       'potencial_hoje',b2b_hoje+b2c_hoje+b2b_pronto+b2b_preparacao+b2c_pronto+b2c_preparacao,
       'meta',550,
       'faltam_para_meta',greatest(0,550-b2b_hoje-b2c_hoje),
       'carteira_trabalhavel_insuficiente',
         b2b_hoje+b2c_hoje+b2b_pronto+b2b_preparacao+b2c_pronto+b2c_preparacao<550),
   'criterios',jsonb_build_object(
      'b2c','Itens sem NF nem faturado_em; prontos=embalado; preparação=alocado/em_picking; demais dependem de liberação; cancelados e concluídos excluídos',
      'b2b','Somente pedidos abertos sem encerramento; itens sem NF e não marcados não faturar; prontos=embalados; preparação=demais bipados/pendentes; itens em análise, não localizados e erro de NF separados',
      'operacoes_internas','Lotes e clientes com referências a reparo, revisão, laboratório ou validação são excluídos da carteira comercial B2B por regra de triagem conservadora',
      'potencial','Faturado hoje + carteira pronta + em preparação. É um limite indicativo, não garante faturamento no mesmo dia. Itens restritos não entram no potencial.',
      'historico','Disponibilidade retratada na consulta presente, sem extrapolar retroativamente para períodos passados'
   )
 ) into v from combinado;
 return v;
end $fn$;

create or replace function public.assurant_fechamento_diario_carteira()
returns jsonb language sql security invoker set search_path to 'pg_catalog'
as $fn$ select liquida_private.assurant_fechamento_diario_carteira() $fn$;
revoke all on function public.assurant_fechamento_diario_carteira() from public,anon;
grant execute on function public.assurant_fechamento_diario_carteira() to authenticated;
revoke all on function liquida_private.assurant_fechamento_diario_carteira() from public,anon;
grant execute on function liquida_private.assurant_fechamento_diario_carteira() to authenticated;
