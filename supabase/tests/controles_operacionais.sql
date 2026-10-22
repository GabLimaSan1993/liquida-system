-- All fixtures, permission changes and physical movements are rolled back.
begin;
select set_config('request.jwt.claim.sub','b517d70a-56be-4b4f-8b9e-a03c769dd3c3',true);
do $$
declare owner_id uuid:='b517d70a-56be-4b4f-8b9e-a03c769dd3c3'; approver uuid; eid bigint; aid uuid:=gen_random_uuid(); pid uuid:=gen_random_uuid(); sid uuid;
 cy uuid:=gen_random_uuid(); c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid(); rec uuid; res jsonb; snap jsonb; initial_a jsonb; initial_p jsonb; old_version text;
begin
 -- Anonymous callers fail independently of the application menu.
 perform set_config('request.jwt.claim.sub','',true);
 begin perform public.assurant_b2c_baixa_manual('listar','{}');raise exception 'TEST anonymous bypass'; exception when insufficient_privilege then null;end;
 begin perform public.assurant_gestao_operacional('consultar','{"inicio":"2026-10-01","fim":"2026-10-21"}');raise exception 'TEST anonymous production bypass'; exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',owner_id::text,true);
 -- Target zero and attendance zero are real data, not missing values.
 perform public.assurant_gestao_operacional('salvar_meta','{"dia":"2026-10-20","etapa":"funcional","quantidade":0,"objetivo":"Fixture operacional","justificativa":"Teste transacional de meta"}');
 select to_jsonb(m)->>'atualizado_em' into old_version from liquida_private.gestao_metas m where dia='2026-10-20' and etapa='funcional';
 begin perform public.assurant_gestao_operacional('salvar_meta','{"dia":"2026-10-20","etapa":"funcional","quantidade":10,"objetivo":"Fixture operacional","justificativa":"Teste concorrência sem versão"}');raise exception 'TEST lost update'; exception when raise_exception then if sqlerrm='TEST lost update' then raise;end if;end;
 perform public.assurant_gestao_operacional('salvar_meta',jsonb_build_object('dia','2026-10-20','etapa','funcional','quantidade',10,'objetivo','Fixture operacional','justificativa','Teste com versão correta','versao',old_version));
 perform public.assurant_gestao_operacional('salvar_presenca',jsonb_build_object('dia','2026-10-20','colaborador_id',owner_id,'equipe','Teste transacional','presente',false,'horas',0,'justificativa','Teste de ausência registrada'));
 if (select count(*) from liquida_private.gestao_alteracoes where justificativa in('Teste transacional de meta','Teste com versão correta','Teste de ausência registrada'))<>3 then raise exception 'TEST audit history';end if;
 -- More than one REST page; open counts are excluded, reconciled shortages remain raw.
 insert into public.inventario_ciclos(id,nome,inicio) values(cy,'Teste transacional de acuracidade','2026-10-01');
 insert into public.inventario_contagens(id,ciclo_id,endereco,status) values(c1,cy,'TEST-A','concluida'),(c2,cy,'TEST-B','concluida'),(c3,cy,'TEST-C','em_contagem');
 insert into public.inventario_itens(contagem_id,ciclo_id,imei,veredito) select c1,cy,'FIXTURE-'||i,'conferido' from generate_series(1,1001)i;
 insert into public.inventario_itens(contagem_id,ciclo_id,imei,veredito,reconciliado_em) values(c1,cy,'FIXTURE-FALTA','falta',now()),(c3,cy,'FIXTURE-ABERTA','sobra',null);
 res:=public.assurant_inventario_acuracidade(cy);
 if (res->>'conferidos')::int<>1001 or (res->>'avaliadosBrutos')::int<>1002 or (res->>'acuraciaPeca')::numeric<>100 or (res->>'acuraciaEndereco')::numeric<>50 then raise exception 'TEST full-cycle accuracy: %',res;end if;
 -- Correios object, voucher and audit. Invalid and duplicate tracking are rejected.
 begin insert into public.recebimentos(transportadora,codigo_rastreio) values('Correios','INVALID');raise exception 'TEST tracking';exception when check_violation then null;end;
 insert into public.recebimentos(transportadora,codigo_rastreio,iniciado_por,iniciado_por_nome,iniciado_em) values('Correios','ZZ000000001BR',owner_id,'Fixture','2026-10-20 12:00:00-03') returning id into rec;
 begin insert into public.recebimentos(transportadora,codigo_rastreio) values('Correios','ZZ000000001BR');raise exception 'TEST duplicate object';exception when unique_violation then null;end;
 insert into public.recebimento_vouchers(recebimento_id,voucher,bipado_por,bipado_por_nome) values(rec,'YBV000001',owner_id,'Fixture');
 if jsonb_array_length(public.assurant_correios_historico(rec))<>2 then raise exception 'TEST Correios audit';end if;
 res:=public.assurant_correios_consultar('2026-10-20','2026-10-20','ZZ000000001BR',0);
 if (res->>'objetos')::int<>1 or (res->>'vouchers')::int<>1 then raise exception 'TEST Correios consultation';end if;
 -- Separate existing authorized identity, permissions last only this transaction.
 select id into approver from public.user_profiles where id<>owner_id and lower(email) like '%@liquidapreco.com.br' order by id limit 1;
 if approver is null then raise exception 'TEST needs second Liquida identity';end if;
 update public.user_profiles set telas_permitidas=coalesce(telas_permitidas,'{}')||array['/v2/assurant/b2c/baixas','/v2/assurant/b2c/baixas/aprovar'] where id=approver;
 select e.id into eid from public.wms_enderecos e where ativo and status='livre' and not exists(select 1 from public.wms_alocacoes a where a.endereco_id=e.id and a.status in('confirmado','reservado')) order by e.id limit 1 for update;
 if eid is null then raise exception 'TEST needs free WMS address';end if;
 update public.wms_enderecos set status='ocupado' where id=eid;
 insert into public.wms_alocacoes(id,voucher,imei,endereco_id,tipo_produto,grade_fisica,grade_venda,status,confirmado_em,confirmado_por,operador_id) values(aid,'FIXTURE-BAIXA','999999999999901',eid,'Smartphone','BOM','BOM','confirmado','2026-08-30 12:00:00-03',owner_id,owner_id);
 insert into public.pedidos_b2c(id,id_anymarket,status,marketplace,sku_marketplace,grade_produto) values(pid,-99920261022001,'aguardando_alocacao','Amazon','FIXTURE','BOM');
 update public.pedidos_b2c set status='faturado',grade_alocada='BOM',imei_alocado='999999999999901',sku_alocado='FIXTURE',wms_alocacao_id=aid,faturado_em='2026-09-01 12:00:00-03',numero_nf='FIXTURE' where id=pid;
 perform public.wms_reservar_saida('999999999999901','B2C',pid::text,owner_id);
 select to_jsonb(a) into initial_a from public.wms_alocacoes a where id=aid;
 select to_jsonb(p) into initial_p from public.pedidos_b2c p where id=pid;
 snap:=public.assurant_b2c_baixa_manual('simular',jsonb_build_object('pedido_id',pid));
 res:=public.assurant_b2c_baixa_manual('solicitar',jsonb_build_object('pedido_id',pid,'previa',snap,'justificativa','Teste transacional de saída física'));sid:=(res->>'id')::uuid;
 if (select to_jsonb(a) from public.wms_alocacoes a where id=aid) is distinct from initial_a then raise exception 'TEST stock changed before approval';end if;
 begin perform public.assurant_b2c_baixa_manual('aprovar',jsonb_build_object('id',sid,'parecer','Tentativa de aprovação própria'));raise exception 'TEST self approval';exception when raise_exception then if sqlerrm='TEST self approval' then raise;end if;end;
 begin perform public.assurant_b2c_baixa_manual('solicitar',jsonb_build_object('pedido_id',pid,'previa',snap,'justificativa','Solicitação repetida do teste'));raise exception 'TEST duplicate request';exception when unique_violation then null;end;
 perform set_config('request.jwt.claim.sub',approver::text,true);
 update public.wms_alocacoes set atualizado_em=atualizado_em+interval '1 second' where id=aid;
 begin perform public.assurant_b2c_baixa_manual('aprovar',jsonb_build_object('id',sid,'parecer','Tentativa com alocação alterada'));raise exception 'TEST stale approval';exception when raise_exception then if sqlerrm='TEST stale approval' then raise;end if;end;
 update public.wms_alocacoes set atualizado_em=(initial_a->>'atualizado_em')::timestamptz where id=aid;
 res:=public.assurant_b2c_baixa_manual('aprovar',jsonb_build_object('id',sid,'parecer','Confirmada saída física no teste transacional'));
 if res->>'status'<>'efetivada' or not exists(select 1 from public.wms_alocacoes where id=aid and status='retirado' and retirado_por=approver) or not exists(select 1 from public.wms_enderecos where id=eid and status='livre') then raise exception 'TEST WMS effect';end if;
 if (select to_jsonb(p) from public.pedidos_b2c p where id=pid) is distinct from initial_p then raise exception 'TEST order unexpectedly changed';end if;
 if (select count(*) from liquida_private.b2c_baixas_eventos where baixa_id=sid)<>2 then raise exception 'TEST baixa audit';end if;
 begin perform public.assurant_b2c_baixa_manual('aprovar',jsonb_build_object('id',sid,'parecer','Segunda tentativa após conclusão'));raise exception 'TEST repeated approval';exception when raise_exception then if sqlerrm='TEST repeated approval' then raise;end if;end;
end $$;
select 'controles operacionais: cenários transacionais aprovados' resultado;
rollback;
