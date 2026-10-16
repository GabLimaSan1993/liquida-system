-- Autorização: retorno físico de 73 aparelhos informado por Gabriel em 16/10/2026.
-- Executar em transação. Não altera notas, status do canal, datas de triagem nem cria Sub_Inv.
do $retorno$
declare ator uuid; n integer;
begin
 select id into strict ator from public.user_profiles where email='gabriellimadossantos1993@gmail.com' and is_master;
 create temporary table retorno_alvos on commit drop as
 select s.voucher voucher_solicitado,t.* from unnest(array['YBV426031','YBV24875','YBV418470','YBV410548','DEV1GRV332464','YBV405417','SAMV371104','DEV1YBV397336','YBV27191','YBV30948','SAMV384698','DEV1YBV351668','YBV426440','YBV354629','DEV1YBV378744','YBV410547','YBV416131','YBV404605','SAMV409424','YBV25613','DEV1SAMV317115','GRV414092','YBV423684','YBV410545','SAMV162868','DEV2YBV412217','DEV2GRV395855','DEV1YBV178308','YBV418819','YBV429682','YBV417155','YBV421935','YBV408907','YBV391975','GRV77862','DEV1YBV73313','DEV1YBV354835','YBV408715','YBV422620','DEV1YBV93326','YBV410624','YBV427355','YBV26278','YBV25770','YBV421433','YBV428541','YBV427549','DEV1GRV78097','SAMV340477','DEV1SAMV314184','DEV1YBV356903','DEV1YBV405507','DEV2YBV353064','SAMV429098','YBV422079','DEV1YBV419306','YBV414976','GRV443963','YBV336961','DEV1YBV419687','DEV3SAMV134624','DEV1SAMV381993','YBV310406','DEV1YBV360900','DEV1YBV317151','YBV423719','DEV1SAMV116592','YBV348545','DEV1YBV414080','DEV1YBV407159','DEV1YBV323738','DEV1YBV309739','YBV332922']) s(voucher)
 join public.assurant_triagem t on t.voucher=case s.voucher when 'DEV1YBV397336' then 'DEV3YBV397336' when 'DEV1YBV93326' then 'DEV2YBV93326' when 'GRV414092' then 'DEV1GRV414092' else s.voucher end;
 select count(*) into n from retorno_alvos;
 if n<>73 or (select count(distinct imei) from retorno_alvos)<>73 then raise exception 'Lote inconsistente: % registros',n;end if;
 if exists(select 1 from retorno_alvos t join liquida_private.armazenagem_retornos r on r.imei=t.imei) then raise exception 'Este retorno já foi registrado';end if;
 perform 1 from public.assurant_triagem t join retorno_alvos x on x.id=t.id for update of t;
 perform 1 from public.wms_alocacoes a join retorno_alvos x on x.imei=a.imei where a.status in('confirmado','reservado') for update of a;
 if exists(select 1 from public.assurant_reservas_especiais e join retorno_alvos t on t.imei=e.imei where e.status='reservado') then raise exception 'Há reserva especial ativa; revisar';end if;
 if exists(select 1 from public.wms_reservas_saida e join retorno_alvos t on t.imei=e.imei where e.status in('reservado','analise','reconciliar') and e.canal<>'B2C') then raise exception 'Há reserva de outro canal ativa; revisar';end if;
 create temporary table retorno_antes on commit drop as
 select t.id,t.imei,jsonb_build_object('voucher_solicitado',t.voucher_solicitado,'triagem',to_jsonb(t)-'voucher_solicitado',
 'wms',coalesce((select jsonb_agg(to_jsonb(a)) from public.wms_alocacoes a where a.imei=t.imei and a.status in('confirmado','reservado')),'[]'),
 'b2c',coalesce((select jsonb_agg(to_jsonb(p)) from public.pedidos_b2c p where (p.imei_alocado=t.imei or p.imei_bipado=t.imei) and p.status in('alocado','em_picking','em_analise','aguardando_definicao_produto','embalado','aguardando_validacao_meli')),'[]'),
 'exclusao_anterior',coalesce((select jsonb_agg(to_jsonb(c)) from public.assurant_caixas_liberadas c where c.imei=t.imei or c.imei_identificado=t.imei or c.triagem_id=t.id or c.voucher=t.voucher),'[]')) snapshot
 from retorno_alvos t;
 -- Somente a fila operacional do pedido é arquivada; a venda e as referências originais ficam intactas.
 update public.pedidos_b2c p set status='arquivado_em_analise',motivo_analise=concat_ws(' | ',nullif(p.motivo_analise,''),'Retorno físico confirmado por Gabriel: aparelho liberado para nova armazenagem; histórico do pedido preservado.'),atualizado_em=now()
 where p.status in('alocado','em_picking','em_analise','aguardando_definicao_produto','embalado','aguardando_validacao_meli') and exists(select 1 from retorno_alvos t where t.imei=p.imei_alocado or t.imei=p.imei_bipado);
 update public.wms_reservas_saida r set status='cancelado',motivo='Retorno físico para nova armazenagem autorizado por Gabriel',finalizado_em=now(),finalizado_por=ator,atualizado_em=now()
 where r.status in('reservado','analise','reconciliar') and r.canal='B2C' and exists(select 1 from retorno_alvos t where t.imei=r.imei);
 create temporary table retorno_enderecos on commit drop as select distinct a.endereco_id from public.wms_alocacoes a join retorno_alvos t on t.imei=a.imei where a.status in('reservado','confirmado');
 -- Cancela o ciclo físico anterior para permitir uma nova posição, mantendo confirmação e histórico antigos.
 update public.wms_alocacoes a set status='cancelado',cancelado_em=now(),atualizado_em=now()
 where a.status in('reservado','confirmado') and exists(select 1 from retorno_alvos t where t.imei=a.imei);
 update public.wms_enderecos e set status='livre',reserva_id=null,reservado_ate=null,atualizado_em=now()
 where e.id in(select endereco_id from retorno_enderecos) and e.status in('reservado','ocupado') and not exists(select 1 from public.wms_alocacoes a where a.endereco_id=e.id and a.status in('reservado','confirmado'));
 -- Estes itens passam a seguir os indicadores normalmente, conforme a nova solicitação.
 delete from public.assurant_caixas_liberadas c using retorno_alvos t where c.triagem_id=t.id or c.voucher=t.voucher or c.voucher=t.voucher_solicitado or c.imei=t.imei or c.imei_identificado=t.imei;
 insert into liquida_private.armazenagem_retornos(voucher_solicitado,voucher_atual,imei,triagem_id,criado_por) select voucher_solicitado,voucher,imei,id,ator from retorno_alvos;
 -- Recupera a autorização de estoque já registrada, sem inventar nova finalização ou RI.
 insert into public.devolucoes_b2c_historico(devolucao_id,acao,status_anterior,status_novo,responsavel_anterior,responsavel_novo,observacao,dados,criado_por)
 select d.id,'retorno_fisico_armazenagem',d.status,'aguardando_armazenagem',d.responsavel_atual,'furbtech','Retorno físico para armazenagem solicitado por Gabriel; destino estoque e finalização anteriores preservados.',jsonb_build_object('voucher',t.voucher,'data_finalizacao_preservada',d.data_finalizacao),ator
 from public.devolucoes_b2c d join retorno_alvos t on t.devolucao_id=d.id where d.destino_final='estoque' and d.data_finalizacao is not null;
 update public.devolucoes_b2c d set status='aguardando_armazenagem',responsavel_atual='furbtech'
 where d.destino_final='estoque' and d.data_finalizacao is not null and exists(select 1 from retorno_alvos t where t.devolucao_id=d.id);
 update public.assurant_triagem t set status_atual='Aguardando armazenagem',local=null,atualizado_em=timezone('UTC',now()) from retorno_alvos x where t.id=x.id;
 if exists(select 1 from retorno_alvos x join public.assurant_triagem t on t.id=x.id where t.status_atual<>'Aguardando armazenagem') then raise exception 'Há aparelhos bloqueados para armazenagem; lote desfeito';end if;
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 select a.imei,'armazenagem.retorno_operacional',a.snapshot::text,jsonb_build_object('triagem',to_jsonb(t),'indicadores_normais',true,'voucher_solicitado',x.voucher_solicitado)::text,
 'Retorno físico autorizado por Gabriel: pedido cancelado/retornado e aparelhos DEV. Reentrada via aguardando armazenagem com indicadores normais; preservados os históricos comercial, de triagem e de Sub_Inv.',ator
 from retorno_antes a join public.assurant_triagem t on t.id=a.id join retorno_alvos x on x.id=a.id;
end $retorno$;
