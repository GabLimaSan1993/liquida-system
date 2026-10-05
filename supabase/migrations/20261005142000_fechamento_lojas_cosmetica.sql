create or replace view liquida_private.fechamento_lojas as
select t.id,t.voucher,t.imei,t.sku,t.modelo,t.grade,t.status_atual,t.origem_triagem,
case when t.status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica') then 'aguardando' else 'concluida' end as situacao,
t.data_funcional at time zone 'UTC' as data_funcional,t.data_cosmetico at time zone 'UTC' as data_cosmetico,
coalesce(t.data_laudo at time zone 'UTC',l.criado_em,ga.data_laudo) as data_laudo,
(t.data_laudo is not null or l.id is not null or ga.data_laudo is not null) as tem_laudo,
nullif(concat_ws('; ',nullif(l.motivo,''),nullif(l.defeitos,''),nullif(t.defeitos_adicionais,'')),'') as motivo_divergencia,
l.pdf_path as laudo_url,
coalesce(nullif(g.codigo_loja,''),h.codigo_loja) as codigo_loja,
coalesce(nullif(g.loja,''),h.loja,t.loja) as loja,g.uf,
coalesce(nullif(g.rede,''),h.rede,t.rede) as rede,
coalesce(liquida_private.tradein_data(g.inicio),h.inicio) as data_tradein,
coalesce(nullif(g.nome_vendedor,''),h.nome_vendedor) as vendedor,
u.nome as usuario,
coalesce(nullif(g.marca,''),h.marca) as marca,
coalesce(nullif(g.aparelho,''),h.aparelho,t.modelo) as produto,
coalesce(nullif(g.produto_comprado,''),h.produto_comprado) as novo_aparelho,
coalesce(nullif(g.cliente,''),t.cliente) as cliente,g.cpf as cpf_cnpj,
coalesce(nullif(g.condicao_aparelho,''),h.condicao_aparelho,t.condicao) as condicao,
coalesce(g.valor_total_pagar,h.valor_total_pagar) as total,
coalesce(g.valor_total_pagar,h.valor_total_pagar) as preco_real,
coalesce(nullif(g.nome_campanha,''),h.nome_campanha) as campanha,
coalesce(g.valor_campanha,h.valor_campanha) as valor_campanha,
(g.voucher is null and h.id is null) as sem_tradein
from public.assurant_triagem t
left join public.tradein_geral g on g.voucher_ybv=t.voucher
left join public.tradein_historico h on h.voucher_key=case when t.voucher ~ '^YBV[0-9]+$' then substring(t.voucher from 4) end
left join public.assurant_gaia_ultimo ga on ga.voucher=t.voucher
left join public.user_profiles u on u.id=t.funcional_por
left join lateral (select l.id,l.motivo,l.defeitos,l.pdf_path,l.criado_em from public.triagem_laudos l where l.voucher=t.voucher order by l.criado_em desc,l.id limit 1) l on true
where t.data_cosmetico is not null or t.status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica');
revoke all on liquida_private.fechamento_lojas from public,anon,authenticated;

create or replace function liquida_private.fechamento_lojas_consultar(p_situacao text default 'aguardando',p_laudo text default '',p_busca text default '',p_rede text default '',p_offset integer default 0,p_limite integer default 100,p_resumo boolean default true)
returns jsonb language plpgsql security definer set search_path=public,pg_catalog set statement_timeout='25s' as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501'; end if;
 if coalesce(p_situacao,'') not in ('aguardando','concluida','todos') or coalesce(p_laudo,'') not in ('','sim','nao') then raise exception 'Filtro inválido'; end if;
 with base as materialized (
 select * from liquida_private.fechamento_lojas
 where (p_situacao='todos' or situacao=p_situacao)
 and (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
 and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,loja,codigo_loja) ilike '%'||p_busca||'%')
 and (coalesce(p_rede,'')='' or rede=p_rede)
 ), resumo as (
 select count(*) as total,count(*) filter(where tem_laudo) as com_laudo,count(*) filter(where not tem_laudo) as sem_laudo,
 count(*) filter(where situacao='aguardando') as aguardando,count(*) filter(where situacao='concluida') as concluidos,
 count(*) filter(where sem_tradein) as sem_tradein,count(*) filter(where preco_real is null) as sem_valor,
 coalesce(sum(total),0) as valor_total,coalesce(sum(preco_real),0) as valor_real from base
 )
 select jsonb_build_object('resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
 'redes',case when p_resumo then (select coalesce(jsonb_agg(rede order by rede),'[]') from (select distinct rede from liquida_private.fechamento_lojas where (p_situacao='todos' or situacao=p_situacao) and rede is not null) n) else '[]'::jsonb end,
 'itens',(select coalesce(jsonb_agg(n),'[]') from (select * from base order by coalesce(data_funcional,data_tradein) asc nulls last,voucher,id limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))) n),
 'consultado_em',now()) into v;
 return v;
end $$;
revoke all on function liquida_private.fechamento_lojas_consultar(text,text,text,text,integer,integer,boolean) from public,anon;
grant execute on function liquida_private.fechamento_lojas_consultar(text,text,text,text,integer,integer,boolean) to authenticated;
create or replace function public.assurant_fechamento_lojas(p_situacao text default 'aguardando',p_laudo text default '',p_busca text default '',p_rede text default '',p_offset integer default 0,p_limite integer default 100,p_resumo boolean default true)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select liquida_private.fechamento_lojas_consultar(p_situacao,p_laudo,p_busca,p_rede,p_offset,p_limite,p_resumo);
$$;
revoke all on function public.assurant_fechamento_lojas(text,text,text,text,integer,integer,boolean) from public,anon;
grant execute on function public.assurant_fechamento_lojas(text,text,text,text,integer,integer,boolean) to authenticated;
update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'::text[]),'/v2/assurant/gestao/fechamento-lojas') where id='b517d70a-56be-4b4f-8b9e-a03c769dd3c3' and not ('/v2/assurant/gestao/fechamento-lojas'=any(coalesce(telas_permitidas,'{}'::text[])));
