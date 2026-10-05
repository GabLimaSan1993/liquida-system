create schema if not exists liquida_private;
revoke all on schema liquida_private from public, anon, authenticated;

create or replace function liquida_private.tradein_data(p text) returns timestamptz
language plpgsql immutable set search_path = pg_catalog as $$
begin
 if nullif(btrim(p),'') is null then return null; end if;
 if p ~ '^\d{2}/\d{2}/\d{4}' then
  return to_timestamp(p,'DD/MM/YYYY HH24:MI:SS') at time zone 'UTC' at time zone 'America/Sao_Paulo';
 elsif p ~ '^\d{4}-\d{2}-\d{2}' then
  return p::timestamp at time zone 'America/Sao_Paulo';
 end if;
 return null;
exception when others then return null;
end $$;
revoke all on function liquida_private.tradein_data(text) from public,anon,authenticated;

create or replace view liquida_private.esteira_tradein as
with trade as (
 select g.voucher::text as chave, 'YBV'||g.voucher::text as voucher,
 coalesce(nullif(g.imei,''),h.imei_serial) as imei,
 coalesce(nullif(g.aparelho,''),h.aparelho) as modelo,
 coalesce(nullif(g.rede,''),h.rede) as rede,coalesce(nullif(g.loja,''),h.loja) as loja,
 coalesce(liquida_private.tradein_data(g.inicio),h.inicio) as inicio,
 coalesce(liquida_private.tradein_data(g.aprovacao),h.aprovacao) as aprovacao,
 g.status_atual as status_tradein,
 case when g.canceled is null then coalesce(h.cancelado,false) else upper(btrim(g.canceled)) in ('SIM','TRUE','1','YES') end as cancelado
 from public.tradein_geral g left join public.tradein_historico h on h.voucher_key=g.voucher::text
 union all
 select h.voucher_key,'YBV'||h.voucher_key,h.imei_serial,h.aparelho,h.rede,h.loja,h.inicio,h.aprovacao,h.status_atual,coalesce(h.cancelado,false)
 from public.tradein_historico h where not exists(select 1 from public.tradein_geral g where g.voucher::text=h.voucher_key)
), etapas as (
 select g.*,t.status_atual as status_liquida,t.origem_triagem,
 t.data_recebimento at time zone 'UTC' as recebimento,
 t.data_funcional at time zone 'UTC' as funcional,
 t.data_laudo at time zone 'UTC' as laudo,
 t.data_cosmetico at time zone 'UTC' as cosmetica,
 least(case when t.data_alocacao at time zone 'UTC' >= g.inicio then t.data_alocacao at time zone 'UTC' end,w.armazenagem) as armazenagem,
 case when t.data_alocacao at time zone 'UTC' >= g.inicio and (w.armazenagem is null or t.data_alocacao at time zone 'UTC' <= w.armazenagem) then 'Histórico de alocação' when w.armazenagem is not null then 'WMS confirmado' end as fonte_armazenagem,
 coalesce(t.oracle_confirmado_em,t.data_oracle at time zone 'UTC') as oracle
 from trade g
 left join public.assurant_triagem t on t.voucher=g.voucher
 left join lateral (select min(a.confirmado_em) as armazenagem from public.wms_alocacoes a where a.voucher=g.voucher and a.confirmado_em >= g.inicio) w on true
)
select e.*,
 case when cancelado then 'Cancelado' when armazenagem is not null then 'Armazenado' when cosmetica is not null then 'Aguardando armazenagem' when status_liquida ilike '%laudo%' then 'Aguardando laudo' when funcional is not null then 'Aguardando cosmética' when recebimento is not null then 'Aguardando funcional' else 'Antes do recebimento' end as etapa,
 case when armazenagem >= inicio then extract(epoch from (armazenagem-inicio))/86400 end as prazo_total_dias,
 case when recebimento >= inicio then extract(epoch from (recebimento-inicio))/86400 end as prazo_recebimento_dias,
 case when funcional >= recebimento then extract(epoch from (funcional-recebimento))/86400 end as prazo_funcional_dias,
 case when cosmetica >= funcional then extract(epoch from (cosmetica-funcional))/86400 end as prazo_cosmetica_dias,
 case when armazenagem >= cosmetica then extract(epoch from (armazenagem-cosmetica))/86400 end as prazo_armazenagem_dias,
 case when not cancelado and armazenagem is null and inicio <= now() then extract(epoch from (now()-inicio))/86400 end as aging_dias,
 ((recebimento < inicio) or (funcional < recebimento) or (cosmetica < funcional) or (armazenagem < cosmetica)) is true as datas_inconsistentes
from etapas e;
revoke all on liquida_private.esteira_tradein from public,anon,authenticated;

-- Reads the owner-restricted historical source only after explicit screen authorization.
create or replace function liquida_private.gestao_esteira(p_inicio date default '2026-09-01',p_fim date default current_date,p_busca text default '',p_etapa text default '',p_rede text default '',p_pagina integer default 0)
returns jsonb language plpgsql security definer set search_path = public,pg_catalog set statement_timeout='20s' as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/esteira'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Gestão da Esteira' using errcode='42501';
 end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio then raise exception 'Período inválido'; end if;
 with base as materialized (
 select * from liquida_private.esteira_tradein where inicio >= p_inicio::timestamp at time zone 'America/Sao_Paulo' and inicio < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
 ), filtrado as materialized (
 select * from base where (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,modelo,loja) ilike '%'||p_busca||'%') and (coalesce(p_etapa,'')='' or etapa=p_etapa) and (coalesce(p_rede,'')='' or rede=p_rede)
 ), resumo as (
 select count(*) as total,count(*) filter(where armazenagem is not null and not cancelado) as armazenados,count(*) filter(where armazenagem is null and not cancelado) as pendentes,count(*) filter(where cancelado) as cancelados,
 round(avg(prazo_total_dias) filter(where not cancelado),2) as prazo_medio,
 round((percentile_cont(0.5) within group(order by prazo_total_dias) filter(where not cancelado))::numeric,2) as mediana,
 round((percentile_cont(0.9) within group(order by prazo_total_dias) filter(where not cancelado))::numeric,2) as p90,
 round(avg(aging_dias),2) as aging_medio,
 count(*) filter(where datas_inconsistentes) as inconsistentes,
 count(prazo_total_dias) filter(where not cancelado) as amostra_prazo,
 round(avg(prazo_recebimento_dias) filter(where not cancelado),2) as recebimento_medio,
 round(avg(prazo_funcional_dias) filter(where not cancelado),2) as funcional_medio,
 round(avg(prazo_cosmetica_dias) filter(where not cancelado),2) as cosmetica_medio,
 round(avg(prazo_armazenagem_dias) filter(where not cancelado),2) as armazenagem_medio,
 count(prazo_recebimento_dias) filter(where not cancelado) as recebimento_n,
 count(prazo_funcional_dias) filter(where not cancelado) as funcional_n,
 count(prazo_cosmetica_dias) filter(where not cancelado) as cosmetica_n,
 count(prazo_armazenagem_dias) filter(where not cancelado) as armazenagem_n
 from filtrado
 )
 select jsonb_build_object('resumo',(select to_jsonb(r) from resumo r),'etapas',(select coalesce(jsonb_agg(x),'[]') from (select etapa,count(*) as quantidade from filtrado group by etapa) x),'semanas',(select coalesce(jsonb_agg(x order by semana),'[]') from (select date_trunc('week',inicio at time zone 'America/Sao_Paulo')::date as semana,count(*) as entradas,count(*) filter(where armazenagem is not null and not cancelado) as armazenados,round(avg(prazo_total_dias) filter(where not cancelado),2) as prazo_medio from filtrado group by 1) x),'redes',(select coalesce(jsonb_agg(rede order by rede),'[]') from (select distinct rede from base where rede is not null) x),'itens',(select coalesce(jsonb_agg(x),'[]') from (select * from filtrado order by aging_dias desc nulls last,inicio desc,voucher limit 100 offset greatest(0,coalesce(p_pagina,0))*100) x),'atualizado_em',now()) into v;
 return v;
end $$;
revoke all on function liquida_private.gestao_esteira(date,date,text,text,text,integer) from public,anon;
grant usage on schema liquida_private to authenticated;
grant execute on function liquida_private.gestao_esteira(date,date,text,text,text,integer) to authenticated;
create or replace function public.assurant_gestao_esteira(p_inicio date default '2026-09-01',p_fim date default current_date,p_busca text default '',p_etapa text default '',p_rede text default '',p_pagina integer default 0)
returns jsonb language sql security invoker set search_path = pg_catalog as $rpc$
select liquida_private.gestao_esteira(p_inicio,p_fim,p_busca,p_etapa,p_rede,p_pagina);
$rpc$;
revoke all on function public.assurant_gestao_esteira(date,date,text,text,text,integer) from public,anon;
grant execute on function public.assurant_gestao_esteira(date,date,text,text,text,integer) to authenticated;
update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'::text[]),'/v2/assurant/gestao/esteira') where id='b517d70a-56be-4b4f-8b9e-a03c769dd3c3' and not ('/v2/assurant/gestao/esteira'=any(coalesce(telas_permitidas,'{}'::text[])));
