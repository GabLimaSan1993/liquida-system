
create or replace function public.assurant_relatorio_als_fluxo(
 p_data_inicial date default null,
 p_data_final date default null
) returns jsonb
language plpgsql
security definer
set search_path to pg_catalog,public,liquida_private
set statement_timeout to '25s'
as $$
declare
 saida jsonb;
begin
 if auth.uid() is null or not exists (
    select 1 from public.user_profiles u where u.id=auth.uid()
    and (
       u.is_master is true
       or '/v2/assurant/gestao/relatorio-estoque'=any(coalesce(u.telas_permitidas,'{}'::text[]))
       or '/v2/assurant/recebimento/gestao'=any(coalesce(u.telas_permitidas,'{}'::text[]))
       or '/v2/assurant/online/triagem-als'=any(coalesce(u.telas_permitidas,'{}'::text[]))
    )
 ) then
   raise exception 'Sem permissão para consultar rastreabilidade ALS' using errcode='42501';
 end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then
   raise exception 'A data inicial não pode ser posterior à final' using errcode='22007';
 end if;

 with
 objetos as materialized (
    select o.id,o.recebimento_id,o.codigo_rastreio,o.status as status_objeto,
    o.status_vinculo,o.bipado_em,o.bipado_por_nome,o.vinculado_em,
    r.transportadora,r.destinatario_correios,r.iniciado_em,r.concluido_em
    from liquida_private.recebimento_correios_objetos o
    join public.recebimentos r on r.id=o.recebimento_id
    where (p_data_inicial is null or (o.bipado_em at time zone 'America/Sao_Paulo')::date >=p_data_inicial)
      and (p_data_final is null or (o.bipado_em at time zone 'America/Sao_Paulo')::date <=p_data_final)
 ),
 eventos as materialized (
   select e.aparelho_id,
    min(e.criado_em) filter(where e.evento='triagem_als_concluida') as evento_als_em,
    min(e.criado_em) filter(where e.evento in ('laudo_grv_salvo','laudo_samv_confirmado')) as laudo_em,
    min(e.criado_em) filter(where e.evento='laudo_grv_omni_finalizado') as omni_em,
    min(e.criado_em) filter(where e.evento='decisao_cliente_registrada') as decisao_em,
    min(e.criado_em) filter(where e.evento='devolucao_declaracao_gerada') as devolucao_em,
    min(e.criado_em) filter(where e.evento='vinculacao_desfeita') as desvinculado_em
   from liquida_private.tradein_online_eventos e
   join objetos o on o.id=e.objeto_id
   group by e.aparelho_id
 ),
 dados as (
    select o.id as objeto_id,o.recebimento_id,o.codigo_rastreio,o.status_objeto,
    o.status_vinculo,o.bipado_em as recebido_em,o.bipado_por_nome as recebido_por,
    o.vinculado_em as objeto_vinculado_em,o.transportadora,o.destinatario_correios,
    o.iniciado_em as carga_iniciada_em,o.concluido_em as carga_concluida_em,
    a.id as aparelho_id,a.voucher,a.imei as imei_als,a.imei2 as imei2_als,
    a.modelo,a.marca,a.sku,a.tipo_aparelho,a.modalidade,
    a.criado_em as vinculacao_criada_em,
    a.resultado_als,a.defeitos_als,a.triado_em as triagem_als_em,
    a.etapa as etapa_online,a.decisao_cliente,a.decisao_cliente_em,
    ev.laudo_em,ev.omni_em,ev.decisao_em as decisao_evento_em,
    ev.devolucao_em,
    t.imei as imei_warehouse,t.imei2 as imei2_warehouse,
    t.status_atual as status_warehouse,t.data_recebimento as recebimento_warehouse_em,
    t.data_funcional as funcional_registrada_em,t.data_cosmetico as cosmetica_em,
    t.data_laudo as laudo_warehouse_em,t.data_alocacao as alocacao_em,
    t.data_oracle as oracle_em,t.oracle_confirmado_em,
    t.grade,t.local as local_warehouse,
    (select count(*)::integer from liquida_private.tradein_online_aparelhos hist where hist.objeto_id=o.id) as total_vinculacoes_historicas
    from objetos o
    left join liquida_private.tradein_online_aparelhos a on a.objeto_id=o.id and a.ativo is true
    left join eventos ev on ev.aparelho_id=a.id
    left join public.assurant_triagem t on t.id=a.triagem_convencional_id
 ),
 historico as (
   select a.id as aparelho_id,a.objeto_id,o.codigo_rastreio,a.ativo,
   a.voucher,a.imei,a.imei2,a.modelo,a.etapa,a.resultado_als,
   a.criado_em as vinculacao_em,a.triado_em as triagem_als_em,
   ev.desvinculado_em,
   a.triagem_convencional_id
   from objetos o
   join liquida_private.tradein_online_aparelhos a on a.objeto_id=o.id
   left join eventos ev on ev.aparelho_id=a.id
 )
 select jsonb_build_object(
  'gerado_em',now(),
  'criterio','recebimento físico de objetos Correios (inclusive estornados), com vínculo ativo ALS e histórico de vínculos separados',
  'objetos',coalesce((select jsonb_agg(to_jsonb(d) order by d.recebido_em desc,d.objeto_id) from dados d),'[]'::jsonb),
  'historico_vinculos',coalesce((select jsonb_agg(to_jsonb(h) order by h.vinculacao_em desc,h.aparelho_id) from historico h),'[]'::jsonb)
 ) into saida;
 return saida;
end;
$$;
revoke all on function public.assurant_relatorio_als_fluxo(date,date) from public,anon;
grant execute on function public.assurant_relatorio_als_fluxo(date,date) to authenticated;
