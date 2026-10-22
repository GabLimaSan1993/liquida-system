-- Reaplica a regra BM/TR à fila já existente, sem simular nova triagem.
-- A classificação física, as respostas, autores e datas de produção são preservados.
-- O bloqueio impede gravações concorrentes durante a atualização administrativa.
lock table public.assurant_triagem in share row exclusive mode;

create temporary table laudo_fila_antes on commit drop as
select id, to_jsonb(t) as estado from public.assurant_triagem t
where status_atual = 'Aguardando laudo';

create temporary table laudo_fila_liberar on commit drop as
with fila as (
 select t.*,case when pg_input_is_valid(t.respostas_funcional,'jsonb') then t.respostas_funcional::jsonb else null end j
 from public.assurant_triagem t where t.status_atual='Aguardando laudo'
), fontes as (
 select t.*,g.condicao_aparelho cg,g.condicao_sufixo sg,h.condicao_aparelho ch,substring(upper(h.sku_original) from '(BM|TR)$') sh
 from fila t
 left join public.tradein_geral g on t.voucher ~ '^(YBV)+[0-9]+$' and g.voucher_ybv='YBV'||regexp_replace(t.voucher,'^(YBV)+','')
 left join public.tradein_historico h on t.voucher ~ '^(YBV)+[0-9]+$' and h.voucher_key=regexp_replace(t.voucher,'^(YBV)+','')
), contexto as (
 select f.*,
 case when nullif(btrim(cg),'') is not null or nullif(btrim(sg),'') is not null then cg
 when nullif(btrim(ch),'') is not null or nullif(btrim(sh),'') is not null then ch
 else coalesce(nullif(btrim(j#>>'{destino,condicao_declarada}'),''),condicao) end condicao_compra,
 case when nullif(btrim(cg),'') is not null or nullif(btrim(sg),'') is not null then sg
 when nullif(btrim(ch),'') is not null or nullif(btrim(sh),'') is not null then sh
 else nullif(btrim(j#>>'{destino,condicao_sufixo_declarado}'),'') end sufixo_compra
 from fontes f
), avaliacao as (
 select c.*,liquida_private.triagem_condicao_compra(condicao_compra,sufixo_compra) compra,
 liquida_private.triagem_laudo_por_compra(condicao_compra,sufixo_compra,respostas_funcional,aparelho_bloqueado,defeitos_adicionais) exige_laudo
 from contexto c
)

select id, voucher, imei, compra, condicao_compra, sufixo_compra
from avaliacao a
where compra in ('BM','TR') and not exige_laudo and j is not null
 and jsonb_typeof(j->'respostas')='array'
 and data_funcional is not null and data_alocacao is null
 and (compra='BM' or (
  exists(select 1 from jsonb_array_elements(j->'respostas') e
   where lower(coalesce(e->>'pergunta','')) ~ '\m(liga|ligando)\M' and lower(btrim(e->>'resposta'))='sim')
  and exists(select 1 from jsonb_array_elements(j->'respostas') e
   where lower(coalesce(e->>'pergunta','')) ~ 'desbloqueado|sem senha|senha ou e.?mail' and lower(btrim(e->>'resposta'))='sim')
 ))
 and not exists(select 1 from public.wms_alocacoes w where w.imei=a.imei and w.status='confirmado')
 and not exists(select 1 from public.assurant_divergencias_imei d where d.voucher=a.voucher and d.status in('pendente','devolver'));

do $validar$
begin
 assert (select count(*)=372 from laudo_fila_liberar), 'Lote de laudos mudou; revisar antes de executar.';
 assert exists(select 1 from pg_trigger where tgrelid='public.assurant_triagem'::regclass
  and tgname='zz_triagem_defeitos_grade_guard' and tgenabled='O'), 'Regra de grade indisponível.';
end;
$validar$;

-- A regra de grade recalcula também em updates de status.
-- Suspende somente esse trigger durante o lote já validado, sob lock e na mesma
-- transação: nenhuma outra sessão pode aproveitar a suspensão.
alter table public.assurant_triagem disable trigger zz_triagem_defeitos_grade_guard;
update public.assurant_triagem t
set status_atual='Aguardando triagem cosmética', atualizado_em=timezone('UTC',now())
from laudo_fila_liberar l where l.id=t.id and t.status_atual='Aguardando laudo';
alter table public.assurant_triagem enable trigger zz_triagem_defeitos_grade_guard;

do $conferir$
begin
 if exists(select 1 from laudo_fila_liberar l join public.assurant_triagem t on t.id=l.id
  join laudo_fila_antes a on a.id=t.id
  where t.status_atual<>'Aguardando triagem cosmética'
   or (to_jsonb(t)-'status_atual'-'atualizado_em') is distinct from (a.estado-'status_atual'-'atualizado_em')) then
  raise exception 'Destino incorreto ou alteração fora da etapa; operação cancelada.';
 end if;
 if exists(select 1 from laudo_fila_antes a join public.assurant_triagem t on t.id=a.id
  where not exists(select 1 from laudo_fila_liberar l where l.id=t.id) and to_jsonb(t) is distinct from a.estado) then
  raise exception 'Produto fora do lote foi alterado; operação cancelada.';
 end if;
 assert exists(select 1 from pg_trigger where tgrelid='public.assurant_triagem'::regclass
  and tgname='zz_triagem_defeitos_grade_guard' and tgenabled='O'), 'Regra de grade não foi reativada.';
end;
$conferir$;

insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
select t.imei,'triagem_funcional.revisao',a.estado::text,
 jsonb_build_object('voucher',t.voucher,'status_atual',t.status_atual,'compra',l.compra,
  'condicao_declarada',l.condicao_compra,'condicao_sufixo_declarado',l.sufixo_compra,'exige_laudo',false)::text,
 'Revisão da fila de laudo solicitada por Gabriel: compra TR/Defeituoso sem negativa em ligar ou desbloqueio segue para cosmética. Regra BM/TR aplicada; classificação física, respostas, autores e datas originais preservados.',
 (select id from public.user_profiles where email='gabriellimadossantos1993@gmail.com' and is_master)
from laudo_fila_liberar l join public.assurant_triagem t on t.id=l.id join laudo_fila_antes a on a.id=t.id;
