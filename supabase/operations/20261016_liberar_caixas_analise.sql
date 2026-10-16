-- Executar em transação. Lote autorizado pelo responsável da operação em 16/10/2026.
do $liberacao$
declare ator uuid; n integer;
begin
 select id into strict ator from public.user_profiles where email='gabriellimadossantos1993@gmail.com' and is_master;
 if exists(select 1 from public.assurant_caixas_liberadas) then raise exception 'Lote já registrado; não repetir a liberação';end if;
 create temporary table lote_caixas on commit drop as
 with orig as materialized (
  select distinct on(imei) * from public.wms_carga_inicial_eventos where resultado='segregado' and estornado_em is null order by imei,criado_em desc
 ) select o.* from orig o
 where not exists(select 1 from public.wms_alocacoes a where a.imei=o.imei and (a.confirmado_em>o.criado_em or a.retirado_em>o.criado_em or a.status='confirmado'))
 and not exists(select 1 from public.wms_carga_inicial_eventos e where e.imei=o.imei and e.criado_em>o.criado_em and e.resultado='alocado' and e.estornado_em is null)
 and not exists(select 1 from public.b2b_itens b where coalesce(nullif(trim(b.imei_bipado),''),b.imei)=o.imei and greatest(b.bipado_em,b.embalado_em)>(o.criado_em at time zone 'UTC'));
 select count(*) into n from lote_caixas;
 if n<>1101 then raise exception 'Lote mudou: % aparelhos; revisar antes de executar',n;end if;
 -- Bloqueia as linhas e revalida reservas para não capturar itens que saíram durante o levantamento.
 perform 1 from public.assurant_triagem t join lote_caixas l on l.triagem_id=t.id for update of t;
 if exists(select 1 from lote_caixas l join public.wms_alocacoes a on a.imei=l.imei where a.status in('reservado','confirmado') and a.retirado_em is null) then raise exception 'Há reserva/alocação ativa no lote; revisar';end if;
 insert into public.assurant_caixas_liberadas(imei,evento_id,caixa_codigo,triagem_id,voucher,liberado_por)
 select l.imei,l.id,l.caixa_codigo,t.id,t.voucher,ator from lote_caixas l left join public.assurant_triagem t on t.id=l.triagem_id;
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 select l.imei,'carga_inicial.caixas.liberacao',jsonb_build_object('evento',to_jsonb(l),'triagem',to_jsonb(t))::text,
 jsonb_build_object('caixa',l.caixa_codigo,'status','Aguardando armazenagem','excluir_indicadores',true,'pendente_cadastro',t.id is null)::text,
 'Liberação das caixas de Em Análise para armazenagem, autorizada por Gabriel. Exclusão persistente de todos os indicadores; histórico preservado.',ator
 from lote_caixas l left join public.assurant_triagem t on t.id=l.triagem_id;
 -- A liberação operacional não se apresenta como decisão da Assurant; registra retorno para conferência.
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 select l.imei,'carga_inicial.caixas.divergencia',to_jsonb(d)::text,jsonb_build_object('status','reconferencia')::text,
 'Liberação operacional do lote das caixas para armazenagem solicitada por Gabriel; histórico da divergência preservado.',ator
 from public.assurant_divergencias_imei d join public.assurant_caixas_liberadas l on l.voucher=d.voucher where d.status in('pendente','devolver');
 update public.assurant_divergencias_imei d set status='reconferencia',diretriz='Liberação operacional do lote da carga inicial para armazenagem, solicitada por Gabriel; sem alteração das evidências anteriores.',decidido_por=ator,decidido_em=now()
 where d.status in('pendente','devolver') and exists(select 1 from public.assurant_caixas_liberadas l where l.voucher=d.voucher);
 update public.assurant_triagem t set status_atual='Aguardando armazenagem',
 grade=coalesce(nullif(trim(t.grade),''),nullif(trim(e.snapshot->>'grade'),'')),
 sku=coalesce(nullif(trim(t.sku),''),nullif(trim(e.snapshot->>'sku'),'')),
 modelo=coalesce(nullif(trim(t.modelo),''),nullif(trim(e.snapshot->>'modelo'),'')),
 atualizado_em=timezone('UTC',now())
 from public.assurant_caixas_liberadas x join public.wms_carga_inicial_eventos e on e.id=x.evento_id where t.id=x.triagem_id;
 if exists(select 1 from public.assurant_caixas_liberadas x join public.assurant_triagem t on t.id=x.triagem_id where t.status_atual<>'Aguardando armazenagem') then raise exception 'Algum aparelho não entrou na fila; desfazer lote para revisão';end if;
end $liberacao$;
