create or replace view liquida_private.fechamento_lojas as
select t.id,t.voucher,t.imei,t.sku,t.modelo,t.grade,t.status_atual,t.origem_triagem,
case when t.status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica') then 'aguardando' when t.data_cosmetico is not null then 'concluida' else 'fora_fila' end as situacao,
t.data_funcional at time zone 'UTC' as data_funcional,t.data_cosmetico at time zone 'UTC' as data_cosmetico,
coalesce(t.data_laudo at time zone 'UTC',l.criado_em,ga.data_laudo) as data_laudo,
(t.data_laudo is not null or l.id is not null or ga.data_laudo is not null) as tem_laudo,
nullif(concat_ws('; ',nullif(l.motivo,''),nullif(l.defeitos,''),nullif(t.defeitos_adicionais,'')),'') as motivo_divergencia,
coalesce(l.pdf_path,case when l.id is null and (ga.data_laudo is not null or (t.origem_triagem='gaia' and t.data_laudo is not null)) and t.voucher ~ '^YBV[0-9]+$' then 'https://s3.sa-east-1.amazonaws.com/xpcell.s3.centercell.com.br/report/'||t.voucher||'-report.pdf' end) as laudo_url,
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
(g.voucher is null and h.id is null) as sem_tradein,l.id as laudo_id
from public.assurant_triagem t
left join public.tradein_geral g on g.voucher_ybv=t.voucher
left join public.tradein_historico h on h.voucher_key=case when t.voucher ~ '^YBV[0-9]+$' then substring(t.voucher from 4) end
left join public.assurant_gaia_ultimo ga on ga.voucher=t.voucher
left join public.user_profiles u on u.id=t.funcional_por
left join lateral (select l.id,l.motivo,l.defeitos,l.pdf_path,l.criado_em from public.triagem_laudos l where l.voucher=t.voucher order by l.criado_em desc,l.id limit 1) l on true
where l.id is not null or t.data_cosmetico is not null or t.status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica');
revoke all on liquida_private.fechamento_lojas from public,anon,authenticated;

create or replace function liquida_private.fechamento_lojas_periodo_consultar(p_situacao text default 'aguardando',p_laudo text default '',p_busca text default '',p_rede text default '',p_offset integer default 0,p_limite integer default 100,p_resumo boolean default true,p_data_inicial date default null,p_data_final date default null,p_data_referencia text default 'tradein')
returns jsonb language plpgsql security definer set search_path=public,pg_catalog set statement_timeout='25s' set plan_cache_mode='force_custom_plan' set jit='off' as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501'; end if;
 if coalesce(p_situacao,'') not in ('aguardando','concluida','todos','laudos_liquida') or coalesce(p_laudo,'') not in ('','sim','nao') then raise exception 'Filtro inválido'; end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then raise exception 'Período inválido'; end if;
 if p_data_referencia not in ('tradein','funcional','cosmetica','laudo') or p_data_referencia is null then raise exception 'Data de referência inválida'; end if;
 if p_situacao='laudos_liquida' then
 with source as materialized (select * from liquida_private.fechamento_lojas where voucher in (select voucher from public.triagem_laudos)), base as materialized (
 select * from source
 where (p_situacao='todos' or situacao=p_situacao or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'))
 and (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
 and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,loja,codigo_loja) ilike '%'||p_busca||'%')
 and (coalesce(p_rede,'')='' or rede=p_rede) and (p_data_inicial is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date<=p_data_final)
 ), resumo as (
 select count(*) as total,count(*) filter(where tem_laudo) as com_laudo,count(*) filter(where not tem_laudo) as sem_laudo,
 count(*) filter(where situacao='aguardando') as aguardando,count(*) filter(where situacao='concluida') as concluidos,count(*) filter(where situacao='fora_fila') as fora_fila,
 count(*) filter(where sem_tradein) as sem_tradein,count(*) filter(where preco_real is null) as sem_valor,
 coalesce(sum(total),0) as valor_total,coalesce(sum(preco_real),0) as valor_real from base
 )
 select jsonb_build_object('resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
 'redes',case when p_resumo then (select coalesce(jsonb_agg(rede order by rede),'[]') from (select distinct rede from source where (p_situacao='todos' or situacao=p_situacao or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica')) and rede is not null and (p_data_inicial is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date<=p_data_final)) n) else '[]'::jsonb end,
 'itens',(select coalesce(jsonb_agg(n),'[]') from (select * from base order by coalesce(data_funcional,data_tradein) asc nulls last,voucher,id limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))) n),
 'consultado_em',now()) into v;
 return v;
 end if;
 with base as materialized (
 select * from liquida_private.fechamento_lojas
 where (p_situacao='todos' or situacao=p_situacao or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica'))
 and (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
 and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,loja,codigo_loja) ilike '%'||p_busca||'%')
 and (coalesce(p_rede,'')='' or rede=p_rede) and (p_data_inicial is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date<=p_data_final)
 ), resumo as (
 select count(*) as total,count(*) filter(where tem_laudo) as com_laudo,count(*) filter(where not tem_laudo) as sem_laudo,
 count(*) filter(where situacao='aguardando') as aguardando,count(*) filter(where situacao='concluida') as concluidos,count(*) filter(where situacao='fora_fila') as fora_fila,
 count(*) filter(where sem_tradein) as sem_tradein,count(*) filter(where preco_real is null) as sem_valor,
 coalesce(sum(total),0) as valor_total,coalesce(sum(preco_real),0) as valor_real from base
 )
 select jsonb_build_object('resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
 'redes',case when p_resumo then (select coalesce(jsonb_agg(rede order by rede),'[]') from (select distinct rede from liquida_private.fechamento_lojas where (p_situacao='todos' or situacao=p_situacao or (p_situacao='laudos_liquida' and laudo_id is not null)) and (p_situacao<>'laudos_liquida' or voucher in (select voucher from public.triagem_laudos)) and (p_situacao<>'aguardando' or status_atual in ('Aguardando triagem cosmética','Aguardando triagem cosmetica','Aguardando cosmética','Aguardando cosmetica')) and rede is not null and (p_data_inicial is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date>=p_data_inicial) and (p_data_final is null or ((case p_data_referencia when 'tradein' then data_tradein when 'funcional' then data_funcional when 'cosmetica' then data_cosmetico when 'laudo' then data_laudo end) at time zone 'America/Sao_Paulo')::date<=p_data_final)) n) else '[]'::jsonb end,
 'itens',(select coalesce(jsonb_agg(n),'[]') from (select * from base order by coalesce(data_funcional,data_tradein) asc nulls last,voucher,id limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))) n),
 'consultado_em',now()) into v;
 return v;
end $$;
revoke all on function liquida_private.fechamento_lojas_periodo_consultar(text,text,text,text,integer,integer,boolean,date,date,text) from public,anon;
grant execute on function liquida_private.fechamento_lojas_periodo_consultar(text,text,text,text,integer,integer,boolean,date,date,text) to authenticated;
create or replace function public.assurant_fechamento_lojas_periodo(p_situacao text default 'aguardando',p_laudo text default '',p_busca text default '',p_rede text default '',p_offset integer default 0,p_limite integer default 100,p_resumo boolean default true,p_data_inicial date default null,p_data_final date default null,p_data_referencia text default 'tradein')
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select liquida_private.fechamento_lojas_periodo_consultar(p_situacao,p_laudo,p_busca,p_rede,p_offset,p_limite,p_resumo,p_data_inicial,p_data_final,p_data_referencia);
$$;
revoke all on function public.assurant_fechamento_lojas_periodo(text,text,text,text,integer,integer,boolean,date,date,text) from public,anon;
grant execute on function public.assurant_fechamento_lojas_periodo(text,text,text,text,integer,integer,boolean,date,date,text) to authenticated;

-- PDFs completos com fotografias em armazenamento privado.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('triagem-laudos','triagem-laudos',false,20971520,array['application/pdf']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy triagem_laudos_pdf_insert on storage.objects for insert to authenticated with check(bucket_id='triagem-laudos' and (storage.foldername(name))[1]=auth.uid()::text and exists(select 1 from public.user_profiles u where u.id=auth.uid() and (u.is_master or u.telas_permitidas && array['/triagens/laudo','/v2/assurant/triagens/laudo']::text[])));
create policy triagem_laudos_pdf_select on storage.objects for select to authenticated using(bucket_id='triagem-laudos' and exists(select 1 from public.user_profiles u where u.id=auth.uid() and (u.is_master or u.telas_permitidas && array['/triagens/laudo','/v2/assurant/triagens/laudo','/v2/assurant/gestao/fechamento-lojas','/triagens/armazenagem','/v2/assurant/estoque/armazenagem']::text[])) and exists(select 1 from public.triagem_laudos l where l.pdf_path=name));
alter table public.triagem_laudos enable row level security;
revoke truncate,references,trigger,delete,update on public.triagem_laudos from authenticated;
create policy triagem_laudos_operacao_select on public.triagem_laudos for select to authenticated using(criado_por=auth.uid() or exists(select 1 from public.user_profiles u where u.id=auth.uid() and (u.is_master or u.telas_permitidas && array['/triagens/laudo','/v2/assurant/triagens/laudo','/v2/assurant/gestao/fechamento-lojas','/triagens/armazenagem','/v2/assurant/estoque/armazenagem']::text[])));
create policy triagem_laudos_operacao_insert on public.triagem_laudos for insert to authenticated with check(criado_por=auth.uid() and exists(select 1 from public.user_profiles u where u.id=auth.uid() and (u.is_master or u.telas_permitidas && array['/triagens/laudo','/v2/assurant/triagens/laudo']::text[])) and (pdf_path is null or pdf_path=auth.uid()::text||'/'||id::text||'.pdf'));

create or replace function liquida_private.fechamento_laudo_dados(p_laudo_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501'; end if;
 select jsonb_build_object('criado_em',l.criado_em,'observacao',l.observacao,'qtd_fotos',l.qtd_fotos,'respostas_funcional',t.respostas_funcional,'dados',jsonb_build_object('voucher',l.voucher,'imei',l.imei,'cliente',coalesce(v.cliente,t.cliente),'loja',coalesce(v.loja,t.loja),'produto',jsonb_build_object('marca',v.marca,'modelo',coalesce(v.modelo,t.modelo)),'motivo',l.motivo,'divergencias',coalesce(l.divergencias,'[]'::jsonb),'defeitos',case when nullif(l.defeitos,'') is null then '[]'::jsonb else to_jsonb(string_to_array(l.defeitos,';')) end)) into v
 from public.triagem_laudos l left join public.assurant_triagem t on t.voucher=l.voucher left join liquida_private.fechamento_lojas v on v.voucher=l.voucher where l.id=p_laudo_id;
 if v is null then raise exception 'Laudo não encontrado'; end if;
 return v;
end $$;
revoke all on function liquida_private.fechamento_laudo_dados(uuid) from public,anon;
grant execute on function liquida_private.fechamento_laudo_dados(uuid) to authenticated;
create or replace function public.assurant_fechamento_laudo(p_laudo_id uuid) returns jsonb language sql security invoker set search_path=pg_catalog as $$ select liquida_private.fechamento_laudo_dados(p_laudo_id); $$;
revoke all on function public.assurant_fechamento_laudo(uuid) from public,anon;
grant execute on function public.assurant_fechamento_laudo(uuid) to authenticated;
