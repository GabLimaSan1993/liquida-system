-- No fluxo B2B, o usuário de importado_por é quem registra a NF no sistema.
-- O indicador passa a atribuir essa atividade ao colaborador identificado.
-- Preserva datas, volumes, exclusões operacionais e regras de retrabalho.
create temporary table producao_b2b_antes on commit drop as
select distinct on(fonte,fonte_id,etapa,realizado_em) *
from liquida_private.producao_base where etapa='faturamento_b2b'
order by fonte,fonte_id,etapa,realizado_em,retrabalho desc,colaborador_id nulls last;

do $migration$
declare definicao text;
 padrao text := '(''faturamento_b2b''::text AS etapa,[[:space:]]*t\.data_faturamento AS realizado_em,[[:space:]]*)NULL::uuid AS colaborador_id';
begin
 definicao := pg_get_viewdef('liquida_private.producao_base'::regclass,true);
 if (select count(*) from regexp_matches(definicao,padrao,'g'))<>1 then
  raise exception 'Fonte de produção B2B mudou; revisar antes de aplicar.';
 end if;
 execute 'create or replace view liquida_private.producao_base as '||regexp_replace(definicao,padrao,'\1t.importado_por AS colaborador_id');
end;
$migration$;

-- Corrige o responsável dos eventos históricos quando a NF e a data coincidem.
update liquida_private.producao_eventos e set colaborador_id=n.importado_por
from public.b2b_nfs n
where e.fonte='b2b_nfs' and e.etapa='faturamento_b2b' and e.fonte_id=n.id::text
 and e.realizado_em=n.data_faturamento and e.colaborador_id is null and n.importado_por is not null;

-- Próximas NFs já capturam o colaborador que registrou o faturamento.
drop trigger producao_capturar on public.b2b_nfs;
create trigger producao_capturar after insert or update of data_faturamento,importado_por
on public.b2b_nfs for each row execute function liquida_private.producao_capturar(
'[{"etapa":"faturamento_b2b","data":"data_faturamento","usuario":"importado_por","tz":true,"canal":"B2B","unidade":"itens","quantidade":"total_itens"}]');

do $conferir$
begin
 if exists(
  with depois as (
   select distinct on(fonte,fonte_id,etapa,realizado_em) *
   from liquida_private.producao_base where etapa='faturamento_b2b'
   order by fonte,fonte_id,etapa,realizado_em,retrabalho desc,colaborador_id nulls last
  )
  select 1 from producao_b2b_antes a full join depois d using(fonte,fonte_id,etapa,realizado_em)
  where a.fonte is null or d.fonte is null
   or (to_jsonb(a)-'colaborador_id') is distinct from (to_jsonb(d)-'colaborador_id')
 ) then raise exception 'A correção alterou produção, datas ou quantidades; operação cancelada.';end if;
 if exists(select 1 from liquida_private.producao_base b join public.b2b_nfs n on b.fonte='b2b_nfs' and b.fonte_id=n.id::text and b.realizado_em=n.data_faturamento
  where b.etapa='faturamento_b2b' and n.importado_por is not null and b.colaborador_id is distinct from n.importado_por) then
  raise exception 'Restaram eventos de faturamento B2B sem o colaborador registrado.';
 end if;
end;
$conferir$;
