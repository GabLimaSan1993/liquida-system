-- Visão conjunta: fila atual completa e histórico de cosmética pelo período selecionado.
CREATE OR REPLACE FUNCTION liquida_private.fechamento_lojas_periodo_consultar(p_situacao text DEFAULT 'aguardando'::text, p_laudo text DEFAULT ''::text, p_busca text DEFAULT ''::text, p_rede text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limite integer DEFAULT 100, p_resumo boolean DEFAULT true, p_data_inicial date DEFAULT NULL::date, p_data_final date DEFAULT NULL::date, p_data_referencia text DEFAULT 'cosmetica'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
 SET statement_timeout TO '25s'
 SET plan_cache_mode TO 'force_custom_plan'
 SET jit TO 'off'
AS $function$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501'; end if;
 if coalesce(p_situacao,'') not in ('aguardando','concluida','todos','laudos_liquida','cosmetica') or coalesce(p_laudo,'') not in ('','sim','nao') then raise exception 'Filtro inválido'; end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then raise exception 'Período inválido'; end if;
 -- Parâmetro legado mantido para compatibilidade; a referência é sempre cosmética.
 p_data_referencia := 'cosmetica';
 if p_situacao='laudos_liquida' then
 with source as materialized (select * from liquida_private.fechamento_lojas where voucher in (select voucher from public.triagem_laudos)), base as materialized (
 select * from source
 where (p_situacao='todos' or situacao=p_situacao or (p_situacao='cosmetica' and (situacao='aguardando' or data_cosmetico is not null)) or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'))
 and (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
 and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,loja,codigo_loja) ilike '%'||p_busca||'%')
 and (coalesce(p_rede,'')='' or rede=p_rede) and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)
 ), resumo as (
 select count(*) as total,count(*) filter(where tem_laudo) as com_laudo,count(*) filter(where not tem_laudo) as sem_laudo,
 count(*) filter(where situacao='aguardando') as aguardando,count(*) filter(where data_cosmetico is not null and (p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)) as passaram_cosmetica,count(*) filter(where situacao='concluida') as concluidos,count(*) filter(where situacao='fora_fila') as fora_fila,
 count(*) filter(where sem_tradein) as sem_tradein,count(*) filter(where preco_real is null) as sem_valor,
 coalesce(sum(total),0) as valor_total,coalesce(sum(preco_real),0) as valor_real from base
 )
 select jsonb_build_object('resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
 'redes',case when p_resumo then (select coalesce(jsonb_agg(rede order by rede),'[]') from (select distinct rede from source where (p_situacao='todos' or situacao=p_situacao or (p_situacao='cosmetica' and (situacao='aguardando' or data_cosmetico is not null)) or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica')) and rede is not null and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)) n) else '[]'::jsonb end,
 'itens',(select coalesce(jsonb_agg(n),'[]') from (select * from base order by coalesce(data_funcional,data_tradein) asc nulls last,voucher,id limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))) n),
 'consultado_em',now()) into v;
 return v;
 end if;
 with base as materialized (
 select * from liquida_private.fechamento_lojas
 where (p_situacao='todos' or situacao=p_situacao or (p_situacao='cosmetica' and (situacao='aguardando' or data_cosmetico is not null)) or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'))
 and (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
 and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,loja,codigo_loja) ilike '%'||p_busca||'%')
 and (coalesce(p_rede,'')='' or rede=p_rede) and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)
 ), resumo as (
 select count(*) as total,count(*) filter(where tem_laudo) as com_laudo,count(*) filter(where not tem_laudo) as sem_laudo,
 count(*) filter(where situacao='aguardando') as aguardando,count(*) filter(where data_cosmetico is not null and (p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)) as passaram_cosmetica,count(*) filter(where situacao='concluida') as concluidos,count(*) filter(where situacao='fora_fila') as fora_fila,
 count(*) filter(where sem_tradein) as sem_tradein,count(*) filter(where preco_real is null) as sem_valor,
 coalesce(sum(total),0) as valor_total,coalesce(sum(preco_real),0) as valor_real from base
 )
 select jsonb_build_object('resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
 'redes',case when p_resumo then (select coalesce(jsonb_agg(rede order by rede),'[]') from (select distinct rede from liquida_private.fechamento_lojas where (p_situacao='todos' or situacao=p_situacao or (p_situacao='cosmetica' and (situacao='aguardando' or data_cosmetico is not null)) or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica')) and rede is not null and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_inicial is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and ((p_situacao='cosmetica' and situacao='aguardando') or p_data_final is null or (data_cosmetico at time zone 'America/Sao_Paulo')::date<=p_data_final)) n) else '[]'::jsonb end,
 'itens',(select coalesce(jsonb_agg(n),'[]') from (select * from base order by coalesce(data_funcional,data_tradein) asc nulls last,voucher,id limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))) n),
 'consultado_em',now()) into v;
 return v;
end $function$;
