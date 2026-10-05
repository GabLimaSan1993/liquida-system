-- Filtrar e resumir antes de carregar os detalhes da página. Sem truncar o histórico.
CREATE OR REPLACE FUNCTION liquida_private.fechamento_lojas_periodo_consultar(p_situacao text DEFAULT 'aguardando'::text, p_laudo text DEFAULT ''::text, p_busca text DEFAULT ''::text, p_rede text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limite integer DEFAULT 100, p_resumo boolean DEFAULT true, p_data_inicial date DEFAULT NULL::date, p_data_final date DEFAULT NULL::date, p_data_referencia text DEFAULT 'cosmetica'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET statement_timeout TO '25s'
 SET plan_cache_mode TO 'force_custom_plan'
 SET jit TO 'off'
 SET enable_mergejoin TO 'off'
 SET work_mem TO '32MB'
AS $function$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501'; end if;
 if coalesce(p_situacao,'') not in ('aguardando','concluida','todos','laudos_liquida','cosmetica') or coalesce(p_laudo,'') not in ('','sim','nao') then raise exception 'Filtro inválido'; end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then raise exception 'Período inválido'; end if;
 -- Parâmetro legado mantido para compatibilidade; a referência é sempre cosmética.
 p_data_referencia := 'cosmetica';

 with native as materialized (
  select distinct on (voucher) voucher,id from public.triagem_laudos order by voucher,criado_em desc,id
 ), source as materialized (
  select t.id,t.voucher,t.imei,t.sku,t.modelo,
   case when t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica']) then 'aguardando' when t.data_cosmetico is not null then 'concluida' else 'fora_fila' end as situacao,
   t.data_cosmetico at time zone 'UTC' as data_cosmetico,
   coalesce(t.data_funcional at time zone 'UTC',liquida_private.tradein_data(g.inicio),h.inicio) as ordem_data,
   (t.data_laudo is not null or n.id is not null or ga.data_laudo is not null) as tem_laudo,
   coalesce(nullif(g.codigo_loja,''),h.codigo_loja) as codigo_loja,
   coalesce(nullif(g.loja,''),h.loja,t.loja) as loja,
   coalesce(nullif(g.rede,''),h.rede,t.rede) as rede,
   coalesce(g.valor_total_pagar,h.valor_total_pagar) as total,
   coalesce(g.valor_total_pagar,h.valor_total_pagar) as preco_real,
   (g.voucher is null and h.id is null) as sem_tradein
  from public.assurant_triagem t
  left join native n on n.voucher=t.voucher
  left join public.tradein_geral g on g.voucher_ybv=t.voucher
  left join public.tradein_historico h on h.voucher_key=case when t.voucher ~ '^YBV[0-9]+$' then substring(t.voucher from 4) end
  left join public.assurant_gaia_ultimo ga on ga.voucher=t.voucher
  where (t.data_cosmetico is not null or t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica']) or n.id is not null)
   and (
    p_situacao='todos'
    or (p_situacao='cosmetica' and (t.data_cosmetico is not null or t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'])))
    or (p_situacao='aguardando' and t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica']))
    or (p_situacao='concluida' and t.data_cosmetico is not null and not coalesce(t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica']),false))
    or (p_situacao='laudos_liquida' and n.id is not null)
   )
   and (p_data_inicial is null or (p_situacao='cosmetica' and t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'])) or t.data_cosmetico >= ((p_data_inicial::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC'))
   and (p_data_final is null or (p_situacao='cosmetica' and t.status_atual=any(array['Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'])) or t.data_cosmetico < (((p_data_final+1)::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC'))
 ), base as not materialized (
  select * from source where (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
   and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,loja,codigo_loja) ilike '%'||p_busca||'%')
   and (coalesce(p_rede,'')='' or rede=p_rede)
 ), resumo as (
  select count(*) as total,count(*) filter(where tem_laudo) as com_laudo,count(*) filter(where not tem_laudo) as sem_laudo,
   count(*) filter(where situacao='aguardando') as aguardando,
   count(*) filter(where data_cosmetico is not null and (p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)) as passaram_cosmetica,
   count(*) filter(where situacao='concluida') as concluidos,count(*) filter(where situacao='fora_fila') as fora_fila,
   count(*) filter(where sem_tradein) as sem_tradein,count(*) filter(where preco_real is null) as sem_valor,
   coalesce(sum(total),0) as valor_total,coalesce(sum(preco_real),0) as valor_real from base
 ), pagina as materialized (
  select id,voucher,ordem_data from base order by ordem_data asc nulls last,voucher,id
   limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))
 )
 select jsonb_build_object(
  'resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
  'redes',case when p_resumo then (select coalesce(jsonb_agg(rede order by rede),'[]'::jsonb) from (select distinct rede from source where rede is not null) r) else '[]'::jsonb end,
  'itens',(select coalesce(jsonb_agg(to_jsonb(f) order by p.ordem_data asc nulls last,p.voucher,p.id),'[]'::jsonb) from pagina p cross join lateral (select * from liquida_private.fechamento_lojas f where f.id=p.id offset 0) f),
  'consultado_em',now()
 ) into v;
 return v;
end $function$;
