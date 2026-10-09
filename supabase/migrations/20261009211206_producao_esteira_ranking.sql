create schema if not exists liquida_private;
create index if not exists idx_producao_recebimento_voucher on public.recebimento_vouchers(voucher);
create table if not exists liquida_private.producao_eventos (
 fonte text not null,fonte_id text not null,etapa text not null,realizado_em timestamptz not null,
 colaborador_id uuid,quantidade integer not null check(quantidade>=0),canal text not null,
 unidade text not null,referencia text,retrabalho boolean not null default false,
 primary key(fonte,fonte_id,etapa,realizado_em)
);
alter table liquida_private.producao_eventos enable row level security;
revoke all on liquida_private.producao_eventos from public,anon,authenticated;
create index if not exists producao_eventos_periodo on liquida_private.producao_eventos(realizado_em,etapa);
create or replace view liquida_private.producao_base as
select 'recebimento_vouchers' as fonte,t.id::text as fonte_id,'recebimento' as etapa,t.bipado_em as realizado_em,t.bipado_por as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.recebimento_vouchers t where t.bipado_em is not null
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'recebimento' as etapa,t.data_recebimento at time zone 'UTC' as realizado_em,null::uuid as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.assurant_triagem t where t.data_recebimento is not null and not exists(select 1 from public.recebimento_vouchers rv where rv.voucher=t.voucher)
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'funcional' as etapa,t.data_funcional at time zone 'UTC' as realizado_em,t.funcional_por as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,exists(select 1 from public.assurant_rastreabilidade_ajustes a where a.campo='triagem_funcional.revisao' and a.valor_novo::jsonb->>'voucher'=t.voucher and (a.valor_novo::jsonb->>'data_funcional')::timestamp=t.data_funcional) as retrabalho from public.assurant_triagem t where t.data_funcional is not null
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'laudo' as etapa,t.data_laudo at time zone 'UTC' as realizado_em,t.laudo_por as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.assurant_triagem t where t.data_laudo is not null
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'cosmetica' as etapa,t.data_cosmetico at time zone 'UTC' as realizado_em,t.cosmetico_por as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.assurant_triagem t where t.data_cosmetico is not null
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'armazenagem' as etapa,t.data_alocacao at time zone 'UTC' as realizado_em,null::uuid as colaborador_id,1::integer as quantidade,'Estoque' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.assurant_triagem t where t.data_alocacao is not null and not exists(select 1 from public.wms_alocacoes a where a.voucher=t.voucher and a.confirmado_em is not null)
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'oracle' as etapa,t.oracle_confirmado_em as realizado_em,t.oracle_confirmado_por as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.assurant_triagem t where t.oracle_confirmado_em is not null
union all
select 'assurant_triagem' as fonte,coalesce(nullif(t.voucher,''),t.id::text) as fonte_id,'oracle' as etapa,t.data_oracle at time zone 'UTC' as realizado_em,null::uuid as colaborador_id,1::integer as quantidade,'Trade-in' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.assurant_triagem t where t.data_oracle is not null and t.oracle_confirmado_em is null
union all
select 'wms_alocacoes' as fonte,t.id::text as fonte_id,'armazenagem' as etapa,t.confirmado_em as realizado_em,t.confirmado_por as colaborador_id,1::integer as quantidade,'Estoque' as canal,'aparelhos' as unidade,t.voucher::text as referencia,false as retrabalho from public.wms_alocacoes t where t.confirmado_em is not null
union all
select 'pedidos_b2c' as fonte,t.id::text as fonte_id,'picking_b2c' as etapa,t.bipado_em as realizado_em,t.bipado_por as colaborador_id,1::integer as quantidade,'B2C' as canal,'itens' as unidade,t.id::text::text as referencia,false as retrabalho from public.pedidos_b2c t where t.bipado_em is not null
union all
select 'pedidos_b2c' as fonte,t.id::text as fonte_id,'embalagem_b2c' as etapa,t.embalado_em as realizado_em,t.embalado_por as colaborador_id,1::integer as quantidade,'B2C' as canal,'itens' as unidade,t.id::text::text as referencia,false as retrabalho from public.pedidos_b2c t where t.embalado_em is not null
union all
select 'pedidos_b2c' as fonte,t.id::text as fonte_id,'faturamento_b2c' as etapa,t.faturado_em as realizado_em,t.faturado_por as colaborador_id,1::integer as quantidade,'B2C' as canal,'itens' as unidade,t.id::text::text as referencia,false as retrabalho from public.pedidos_b2c t where t.faturado_em is not null
union all
select 'b2b_itens' as fonte,t.id::text as fonte_id,'picking_b2b' as etapa,t.bipado_em at time zone 'UTC' as realizado_em,t.bipado_por as colaborador_id,1::integer as quantidade,'B2B' as canal,'itens' as unidade,t.id::text::text as referencia,false as retrabalho from public.b2b_itens t where t.bipado_em is not null
union all
select 'b2b_itens' as fonte,t.id::text as fonte_id,'embalagem_b2b' as etapa,t.embalado_em at time zone 'UTC' as realizado_em,t.embalado_por as colaborador_id,1::integer as quantidade,'B2B' as canal,'itens' as unidade,t.id::text::text as referencia,false as retrabalho from public.b2b_itens t where t.embalado_em is not null
union all
select 'b2b_nfs' as fonte,t.id::text as fonte_id,'faturamento_b2b' as etapa,t.data_faturamento as realizado_em,null::uuid as colaborador_id,greatest(coalesce(t.total_itens,0),0)::integer as quantidade,'B2B' as canal,'itens' as unidade,t.id::text::text as referencia,false as retrabalho from public.b2b_nfs t where t.data_faturamento is not null and coalesce(t.status,'') <> 'erro'
union all
select 'meli_validacoes' as fonte,t.id::text as fonte_id,'validacao_meli' as etapa,t.criado_em as realizado_em,t.operador_id as colaborador_id,1::integer as quantidade,'B2C' as canal,'aparelhos' as unidade,t.id::text::text as referencia,false as retrabalho from public.meli_validacoes t where t.criado_em is not null
union all
select 'romaneio_itens' as fonte,t.id::text as fonte_id,'expedicao' as etapa,t.bipado_em as realizado_em,t.bipado_por as colaborador_id,1::integer as quantidade,'B2C' as canal,'volumes' as unidade,t.id::text::text as referencia,false as retrabalho from public.romaneio_itens t where t.bipado_em is not null
union all
select 'assurant_triagem'::text as fonte, a.valor_anterior::jsonb->>'voucher' as fonte_id,'funcional'::text as etapa,
 (a.valor_anterior::jsonb->>'data_funcional')::timestamp at time zone 'UTC' as realizado_em,
 nullif(a.valor_anterior::jsonb->>'funcional_por','')::uuid as colaborador_id,1::integer as quantidade,'Trade-in'::text as canal,'aparelhos'::text as unidade,a.valor_anterior::jsonb->>'voucher' as referencia,
 exists(select 1 from public.assurant_rastreabilidade_ajustes b where b.campo='triagem_funcional.revisao' and b.valor_novo::jsonb->>'voucher'=a.valor_anterior::jsonb->>'voucher' and b.valor_novo::jsonb->>'data_funcional'=a.valor_anterior::jsonb->>'data_funcional') as retrabalho
 from public.assurant_rastreabilidade_ajustes a where a.campo='triagem_funcional.revisao' and nullif(a.valor_anterior::jsonb->>'data_funcional','') is not null
union all
select 'assurant_triagem'::text as fonte, a.valor_novo::jsonb->>'voucher' as fonte_id,'funcional'::text as etapa,
 (a.valor_novo::jsonb->>'data_funcional')::timestamp at time zone 'UTC' as realizado_em,
 nullif(a.valor_novo::jsonb->>'funcional_por','')::uuid as colaborador_id,1::integer as quantidade,'Trade-in'::text as canal,'aparelhos'::text as unidade,a.valor_novo::jsonb->>'voucher' as referencia,
 true as retrabalho
 from public.assurant_rastreabilidade_ajustes a where a.campo='triagem_funcional.revisao' and nullif(a.valor_novo::jsonb->>'data_funcional','') is not null
union all
select fonte,fonte_id,etapa,realizado_em,colaborador_id,quantidade,canal,unidade,referencia,retrabalho from liquida_private.producao_eventos;
revoke all on liquida_private.producao_base from public,anon,authenticated;
create or replace function liquida_private.producao_capturar() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare j jsonb; anterior jsonb; cfg jsonb; d timestamptz; ator uuid; v_key text; v_retrabalho boolean;
begin
 anterior:=case when TG_OP='UPDATE' then to_jsonb(OLD) else '{}'::jsonb end;
 for j in select value from jsonb_array_elements(case when TG_OP='UPDATE' then jsonb_build_array(anterior,to_jsonb(NEW)) else jsonb_build_array(to_jsonb(NEW)) end) loop
 for cfg in select value from jsonb_array_elements(TG_ARGV[0]::jsonb) loop
  if nullif(j->>(cfg->>'data'),'') is null then continue; end if;
  if TG_TABLE_NAME='b2b_nfs' and coalesce(j->>'status','')='erro' then continue; end if;
  if TG_TABLE_NAME='assurant_triagem' then
   if cfg->>'etapa'='recebimento' and exists(select 1 from public.recebimento_vouchers r where r.voucher=j->>'voucher') then continue; end if;
   if cfg->>'etapa'='armazenagem' and exists(select 1 from public.wms_alocacoes a where a.voucher=j->>'voucher' and a.confirmado_em is not null) then continue; end if;
   if cfg->>'data'='data_oracle' and nullif(j->>'oracle_confirmado_em','') is not null then continue; end if;
  end if;
  d:=case when (cfg->>'tz')::boolean then (j->>(cfg->>'data'))::timestamptz else (j->>(cfg->>'data'))::timestamp at time zone 'UTC' end;
  ator:=nullif(j->>(cfg->>'usuario'),'')::uuid;
  v_key:=case when TG_TABLE_NAME='assurant_triagem' then coalesce(nullif(j->>'voucher',''),j->>'id') else j->>'id' end;
  v_retrabalho:=j=to_jsonb(NEW) and ((TG_OP='UPDATE' and nullif(anterior->>(cfg->>'data'),'') is not null and anterior->>(cfg->>'data') is distinct from j->>(cfg->>'data')) or exists(select 1 from liquida_private.producao_eventos e where e.fonte=TG_TABLE_NAME and e.fonte_id=v_key and e.etapa=cfg->>'etapa' and e.realizado_em<>d));
  insert into liquida_private.producao_eventos values(TG_TABLE_NAME,v_key,cfg->>'etapa',d,ator,
   case when cfg->>'quantidade'='1' then 1 else greatest(coalesce((j->>(cfg->>'quantidade'))::integer,0),0) end,
   cfg->>'canal',cfg->>'unidade',coalesce(j->>'voucher',j->>'id'),v_retrabalho)
  on conflict do nothing;
 end loop;
 end loop;
 return NEW;
end $$;
revoke all on function liquida_private.producao_capturar() from public,anon,authenticated;
drop trigger if exists producao_capturar on public.recebimento_vouchers;
create trigger producao_capturar after insert or update of bipado_em on public.recebimento_vouchers for each row execute function liquida_private.producao_capturar('[{"etapa": "recebimento", "data": "bipado_em", "usuario": "bipado_por", "tz": true, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}]');
drop trigger if exists producao_capturar on public.assurant_triagem;
create trigger producao_capturar after insert or update of data_recebimento,data_funcional,data_laudo,data_cosmetico,data_alocacao,oracle_confirmado_em,data_oracle on public.assurant_triagem for each row execute function liquida_private.producao_capturar('[{"etapa": "recebimento", "data": "data_recebimento", "usuario": null, "tz": false, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}, {"etapa": "funcional", "data": "data_funcional", "usuario": "funcional_por", "tz": false, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}, {"etapa": "laudo", "data": "data_laudo", "usuario": "laudo_por", "tz": false, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}, {"etapa": "cosmetica", "data": "data_cosmetico", "usuario": "cosmetico_por", "tz": false, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}, {"etapa": "armazenagem", "data": "data_alocacao", "usuario": null, "tz": false, "canal": "Estoque", "unidade": "aparelhos", "quantidade": "1"}, {"etapa": "oracle", "data": "oracle_confirmado_em", "usuario": "oracle_confirmado_por", "tz": true, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}, {"etapa": "oracle", "data": "data_oracle", "usuario": null, "tz": false, "canal": "Trade-in", "unidade": "aparelhos", "quantidade": "1"}]');
drop trigger if exists producao_capturar on public.wms_alocacoes;
create trigger producao_capturar after insert or update of confirmado_em on public.wms_alocacoes for each row execute function liquida_private.producao_capturar('[{"etapa": "armazenagem", "data": "confirmado_em", "usuario": "confirmado_por", "tz": true, "canal": "Estoque", "unidade": "aparelhos", "quantidade": "1"}]');
drop trigger if exists producao_capturar on public.pedidos_b2c;
create trigger producao_capturar after insert or update of bipado_em,embalado_em,faturado_em on public.pedidos_b2c for each row execute function liquida_private.producao_capturar('[{"etapa": "picking_b2c", "data": "bipado_em", "usuario": "bipado_por", "tz": true, "canal": "B2C", "unidade": "itens", "quantidade": "1"}, {"etapa": "embalagem_b2c", "data": "embalado_em", "usuario": "embalado_por", "tz": true, "canal": "B2C", "unidade": "itens", "quantidade": "1"}, {"etapa": "faturamento_b2c", "data": "faturado_em", "usuario": "faturado_por", "tz": true, "canal": "B2C", "unidade": "itens", "quantidade": "1"}]');
drop trigger if exists producao_capturar on public.b2b_itens;
create trigger producao_capturar after insert or update of bipado_em,embalado_em on public.b2b_itens for each row execute function liquida_private.producao_capturar('[{"etapa": "picking_b2b", "data": "bipado_em", "usuario": "bipado_por", "tz": false, "canal": "B2B", "unidade": "itens", "quantidade": "1"}, {"etapa": "embalagem_b2b", "data": "embalado_em", "usuario": "embalado_por", "tz": false, "canal": "B2B", "unidade": "itens", "quantidade": "1"}]');
drop trigger if exists producao_capturar on public.b2b_nfs;
create trigger producao_capturar after insert or update of data_faturamento on public.b2b_nfs for each row execute function liquida_private.producao_capturar('[{"etapa": "faturamento_b2b", "data": "data_faturamento", "usuario": null, "tz": true, "canal": "B2B", "unidade": "itens", "quantidade": "total_itens"}]');
drop trigger if exists producao_capturar on public.meli_validacoes;
create trigger producao_capturar after insert or update of criado_em on public.meli_validacoes for each row execute function liquida_private.producao_capturar('[{"etapa": "validacao_meli", "data": "criado_em", "usuario": "operador_id", "tz": true, "canal": "B2C", "unidade": "aparelhos", "quantidade": "1"}]');
drop trigger if exists producao_capturar on public.romaneio_itens;
create trigger producao_capturar after insert or update of bipado_em on public.romaneio_itens for each row execute function liquida_private.producao_capturar('[{"etapa": "expedicao", "data": "bipado_em", "usuario": "bipado_por", "tz": true, "canal": "B2C", "unidade": "volumes", "quantidade": "1"}]');

create or replace function liquida_private.producao_consultar(p_inicio date,p_fim date,p_agrupamento text default 'dia')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='25s' as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/producao'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Produção da Esteira' using errcode='42501';
 end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>3660 then raise exception 'Período inválido (máximo de 10 anos).'; end if;
 if p_agrupamento not in ('dia','mes','ano') then raise exception 'Agrupamento inválido'; end if;
 with eventos as materialized (
  select distinct on (fonte,fonte_id,etapa,realizado_em) * from liquida_private.producao_base
  where realizado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
  and realizado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
  order by fonte,fonte_id,etapa,realizado_em,retrabalho desc,colaborador_id nulls last
 ), agregado as (
  select date_trunc(case p_agrupamento when 'mes' then 'month' when 'ano' then 'year' else 'day' end,realizado_em at time zone 'America/Sao_Paulo')::date as periodo,
  etapa,canal,unidade,u.id as colaborador_id,coalesce(nullif(u.nome,''),'Responsável não identificado') as colaborador,
  sum(quantidade) filter(where not retrabalho) as producao,sum(quantidade) filter(where retrabalho) as retrabalho,
  array_agg(distinct (realizado_em at time zone 'America/Sao_Paulo')::date) filter(where not retrabalho and quantidade>0) as dias_ativos
  from eventos e left join public.user_profiles u on u.id=e.colaborador_id
  group by 1,2,3,4,5,6
 )
 select jsonb_build_object('dados',coalesce((select jsonb_agg(to_jsonb(a) order by periodo,etapa,colaborador) from agregado a),'[]'::jsonb),'inicio',p_inicio,'fim',p_fim,'agrupamento',p_agrupamento,'atualizado_em',now()) into v;
 return v;
end $$;
revoke all on function liquida_private.producao_consultar(date,date,text) from public,anon;
grant usage on schema liquida_private to authenticated;
grant execute on function liquida_private.producao_consultar(date,date,text) to authenticated;
create or replace function public.assurant_producao_esteira(p_inicio date,p_fim date,p_agrupamento text default 'dia')
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select liquida_private.producao_consultar(p_inicio,p_fim,p_agrupamento); $$;
revoke all on function public.assurant_producao_esteira(date,date,text) from public,anon;
grant execute on function public.assurant_producao_esteira(date,date,text) to authenticated;
update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'::text[]),'/v2/assurant/gestao/producao')
where email in ('gabriellimadossantos1993@gmail.com','jhonatan.nascimento@liquidapreco.com.br')
and not ('/v2/assurant/gestao/producao'=any(coalesce(telas_permitidas,'{}'::text[])));
