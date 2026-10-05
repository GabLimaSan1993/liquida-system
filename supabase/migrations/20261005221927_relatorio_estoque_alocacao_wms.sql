-- Relatório de estoque no modelo warehouse (31 colunas), com consulta e exportação paginadas.
create or replace function liquida_private.relatorio_estoque_consultar(
 p_data_inicial date default null,p_data_final date default null,p_data_referencia text default 'recebimento',
 p_status text default '',p_grade text default '',p_rede text default '',p_busca text default '',
 p_offset integer default 0,p_limite integer default 100,p_resumo boolean default true
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set jit='off' set plan_cache_mode='force_custom_plan'
as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/relatorio-estoque'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Relatório de Estoque' using errcode='42501';
 end if;
 if coalesce(p_data_referencia,'') not in ('recebimento','funcional','cosmetica','laudo','alocacao','oracle','criacao','atualizacao') then raise exception 'Referência de período inválida';end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then raise exception 'A data inicial deve ser anterior ou igual à final';end if;
 with alocacoes as materialized (
  select distinct on (a.imei,upper(trim(a.voucher))) a.imei,upper(trim(a.voucher)) as voucher,a.confirmado_em
  from public.wms_alocacoes a join public.wms_enderecos e on e.id=a.endereco_id
  where p_data_referencia='alocacao' and a.status='confirmado' and a.retirado_em is null
  order by a.imei,upper(trim(a.voucher)),a.confirmado_em desc nulls last,a.criado_em desc,a.id
 ), source as materialized (
  select t.id,t.voucher,t.status_atual,t.grade,t.rede,t.data_funcional,t.data_cosmetico,t.data_oracle,
   case p_data_referencia when 'recebimento' then t.data_recebimento when 'funcional' then t.data_funcional when 'cosmetica' then t.data_cosmetico when 'laudo' then t.data_laudo when 'alocacao' then coalesce(a.confirmado_em at time zone 'UTC',t.data_alocacao) when 'oracle' then t.data_oracle when 'criacao' then t.criado_em when 'atualizacao' then t.atualizado_em end as data_ref,
   case when coalesce(p_busca,'')<>'' then concat_ws(' ',t.voucher,t.imei,t.sku,t.modelo,t.cliente,t.loja,t.local) end as busca
  from public.assurant_triagem t left join alocacoes a on a.imei=t.imei and a.voucher=upper(trim(t.voucher))
  where (p_data_inicial is null or (case p_data_referencia when 'recebimento' then t.data_recebimento when 'funcional' then t.data_funcional when 'cosmetica' then t.data_cosmetico when 'laudo' then t.data_laudo when 'alocacao' then coalesce(a.confirmado_em at time zone 'UTC',t.data_alocacao) when 'oracle' then t.data_oracle when 'criacao' then t.criado_em when 'atualizacao' then t.atualizado_em end)>=((p_data_inicial::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC'))
   and (p_data_final is null or (case p_data_referencia when 'recebimento' then t.data_recebimento when 'funcional' then t.data_funcional when 'cosmetica' then t.data_cosmetico when 'laudo' then t.data_laudo when 'alocacao' then coalesce(a.confirmado_em at time zone 'UTC',t.data_alocacao) when 'oracle' then t.data_oracle when 'criacao' then t.criado_em when 'atualizacao' then t.atualizado_em end)<(((p_data_final+1)::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC'))
 ), base as not materialized (
  select * from source
  where (coalesce(p_status,'')='' or status_atual=p_status)
   and (coalesce(p_grade,'')='' or upper(trim(coalesce(grade,'')))=upper(trim(p_grade)))
   and (coalesce(p_rede,'')='' or rede=p_rede)
   and (coalesce(p_busca,'')='' or busca ilike '%'||p_busca||'%')
 ), resumo as (
  select count(*) as total,count(*) filter(where data_funcional is not null) as funcional,
   count(*) filter(where data_cosmetico is not null) as cosmetica,count(*) filter(where data_oracle is not null) as oracle from base
 ), pagina as materialized (
  select id,voucher,data_ref from base order by data_ref desc nulls last,voucher,id
   limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))
 ), detalhes as (
  select t.id,t.voucher,t.imei,t.sku,t.modelo,
   coalesce(w.local,nullif(trim(t.local),'')) as local,
   t.cliente,t.loja,t.rede,t.tipo_de_rede,t.lote,t.status_atual,t.condicao,t.triagem_funcional,t.grade,
   t.criado_em at time zone 'UTC' as criado_em,t.atualizado_em at time zone 'UTC' as atualizado_em,
   t.tela,t.laterais,t.traseira,t.defeitos_adicionais,t.resultado_triagem_funcional,
   t.data_recebimento at time zone 'UTC' as data_recebimento,t.data_funcional at time zone 'UTC' as data_funcional,
   t.data_cosmetico at time zone 'UTC' as data_cosmetico,t.data_laudo at time zone 'UTC' as data_laudo,
   coalesce(w.confirmado_em,t.data_alocacao at time zone 'UTC') as data_alocacao,
   t.data_oracle at time zone 'UTC' as data_oracle,
   t.respostas_funcional,t.status_bateria,t.reanalise,t.aging,
   p.data_ref as ordem_data,t.origem_triagem
  from pagina p join public.assurant_triagem t on t.id=p.id
  left join lateral (
   select a.confirmado_em,
    'RUA '||e.rua||'/BL'||lpad(e.bloco::text,2,'0')||'/AD'||lpad(e.andar::text,2,'0')||'/AP '||e.coluna||lpad(e.linha::text,2,'0') as local
   from public.wms_alocacoes a join public.wms_enderecos e on e.id=a.endereco_id
   where a.imei=t.imei and upper(trim(a.voucher))=upper(trim(t.voucher)) and a.status='confirmado' and a.retirado_em is null
   order by a.confirmado_em desc nulls last,a.criado_em desc,a.id limit 1
  ) w on true
 )
 select jsonb_build_object(
  'resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
  'filtros',case when p_resumo then jsonb_build_object(
   'status',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct status_atual as x from source where nullif(trim(status_atual),'') is not null) f),
   'grades',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct upper(trim(grade)) as x from source where nullif(trim(grade),'') is not null) f),
   'redes',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct rede as x from source where nullif(trim(rede),'') is not null) f)
  ) else null end,
  'itens',(select coalesce(jsonb_agg(to_jsonb(d)-'ordem_data' order by d.ordem_data desc nulls last,d.voucher,d.id),'[]'::jsonb) from detalhes d),
  'consultado_em',now()
 ) into v;
 return v;
end $$;
