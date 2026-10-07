-- Testes transacionais: todos os aparelhos, pedidos e alterações de teste são revertidos.
create or replace function pg_temp.test_meli_fluxo()
returns jsonb language plpgsql security invoker as $$
declare
 v_user uuid:='b517d70a-56be-4b4f-8b9e-a03c769dd3c3'; v_outro uuid;
 v_p uuid:=gen_random_uuid(); v_g uuid:=gen_random_uuid(); v_e bigint[]; v_result jsonb;
 v_answers jsonb; v_status text; v_tests text[]:='{}'; v_failed boolean; v_num integer;
begin
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  select array_agg(id) into v_e from(select id from public.wms_enderecos where ativo and status='livre' order by id limit 2 for update)t;
  if array_length(v_e,1)<>2 then raise exception 'Sem posições livres para o teste.'; end if;
  update public.wms_enderecos set status='ocupado' where id=any(v_e);
  insert into public.assurant_triagem(voucher,imei,sku,modelo,grade,status_atual,status_bateria) values
   ('QA-MELI-001','000000000070001','QA-MELI-20261007','QA MELI Android','BOM','Produto disponível','saúde da bateria acima de 80%'),
   ('QA-MELI-002','000000000070002','QA-MELI-20261007','QA MELI Android','BOM','Produto disponível','saúde da bateria acima de 80%');
  insert into public.wms_alocacoes(voucher,imei,endereco_id,grade_fisica,grade_venda,tipo_produto,sku,status,confirmado_em,operador_id)
   select 'QA-MELI-001','000000000070001',v_e[1],e.grade_fisica,'BOM','CELULAR','QA-MELI-20261007','confirmado',now(),v_user from public.wms_enderecos e where e.id=v_e[1];
  insert into public.wms_alocacoes(voucher,imei,endereco_id,grade_fisica,grade_venda,tipo_produto,sku,status,confirmado_em,operador_id)
   select 'QA-MELI-002','000000000070002',v_e[2],e.grade_fisica,'BOM','CELULAR','QA-MELI-20261007','confirmado',now(),v_user from public.wms_enderecos e where e.id=v_e[2];
  insert into public.estoque_subinv(imei,data_subinv,local_subinv) values('000000000070001','1901-01-01','WH2 B2C'),('000000000070002','1902-01-01','WH2 B2C');
  select max(numero)+1 into v_num from public.pedidos_b2c_grupos;
  insert into public.pedidos_b2c_grupos(id,numero,status,total_pedidos,criado_por,status_faturamento) values(v_g,v_num,'aberto',1,v_user,'pendente');
  insert into public.pedidos_b2c(id,id_anymarket,sku_marketplace,sku_produto,grade_produto,titulo_produto,marketplace,status,status_anymarket,criado_por)
   values(v_p,-710700001,'QA-MELI-20261007','QA-MELI-20261007','BOM','QA MELI Android','Mercado Livre','aguardando_alocacao','Pago',v_user);
  perform set_config('role','authenticated',true);
  v_result:=public.b2c_processar_alocacao_backend(v_p);
  if v_result->>'imei'<>'000000000070001' then raise exception 'FIFO não escolheu o mais antigo: %',v_result; end if;
  update public.pedidos_b2c set status='em_picking',grupo_id=v_g where id=v_p;
  update public.pedidos_b2c set status='embalado',imei_bipado='000000000070001',bipado_em=clock_timestamp(),bipado_por=v_user where id=v_p;
  select status into v_status from public.pedidos_b2c where id=v_p;
  if v_status<>'aguardando_validacao_meli' then raise exception 'Picking pulou validação: %',v_status; end if;
  if not exists(select 1 from public.wms_localizar_saida(array['000000000070001']) where reserva_referencia=v_p::text and reserva_canal='B2C') then raise exception 'Reserva não foi preservada durante os testes.'; end if;
  v_tests:=array_append(v_tests,'picking → validação; reserva preservada');
  v_failed:=false;
  begin update public.pedidos_b2c set status='faturado',numero_nf='QA' where id=v_p; exception when others then
   if sqlerrm not like 'Faturamento MELI bloqueado:%' then raise; end if; v_failed:=true;
  end;
  if not v_failed then raise exception 'Faturamento sem teste foi aceito.'; end if;
  v_tests:=array_append(v_tests,'faturamento sem aprovação bloqueado');
  v_failed:=false;
  begin perform public.meli_finalizar_validacao(v_p,'000000000070001','android','{}',null,null); exception when others then
   if sqlerrm not like 'Todos os testes precisam%' then raise; end if; v_failed:=true;
  end;
  if not v_failed then raise exception 'Checklist incompleto foi aceito.'; end if;
  v_tests:=array_append(v_tests,'checklist incompleto bloqueado');
  select jsonb_object_agg(k,true) into v_answers from unnest(array['modelo','cor','capacidade','sem_linhas','sem_manchas','sem_burnin','tela_colada','touch_completo','sem_trinca','sem_amassado','sem_descascado','cameras','botoes','conector','riscos_grade','liga_desliga','audio','contas_removidas','resetado'])k;
  v_result:=public.meli_finalizar_validacao(v_p,'000000000070001','android',v_answers||'{"sem_linhas":false}', 'QA: linha na tela',null);
  if v_result->>'status'<>'em_picking' or v_result->>'imei_substituto'<>'000000000070002' then raise exception 'Substituição FIFO incorreta: %',v_result; end if;
  if exists(select 1 from public.wms_buscar_candidatos_saida('QA-MELI-20261007') where imei='000000000070001') then raise exception 'Reprovado ainda é candidato.'; end if;
  if (public.wms_reservar_saida('000000000070001','B2C',v_p::text,v_user)->>'ok')::boolean then raise exception 'Reprovado ainda reservável.'; end if;
  v_tests:=array_append(v_tests,'reprovação → estoque bloqueado + próximo FIFO no picking');
  update public.pedidos_b2c set status='embalado',imei_bipado='000000000070002',bipado_em=clock_timestamp(),bipado_por=v_user where id=v_p;
  v_failed:=false;
  begin perform public.meli_finalizar_validacao(v_p,'000000000070001','android',v_answers,null,null); exception when others then
   if sqlerrm not like 'IMEI divergente%' then raise; end if; v_failed:=true;
  end;
  if not v_failed then raise exception 'IMEI divergente foi aceito.'; end if;
  v_tests:=array_append(v_tests,'IMEI divergente bloqueado');
  -- A aprovação é testada em um sub-bloco revertido para também testar falta de substituto.
  begin
   v_result:=public.meli_finalizar_validacao(v_p,'000000000070002','android',v_answers,null,null);
   if v_result->>'status'<>'embalado' then raise exception 'Aprovação não liberou faturamento: %',v_result; end if;
   update public.pedidos_b2c set status='faturado',numero_nf='QA-APROVADO',faturado_em=now() where id=v_p;
   v_tests:=array_append(v_tests,'aprovação completa → WMS retirado → faturamento');
   raise exception using errcode='PZ002',message='rollback cenário aprovado';
  exception when sqlstate 'PZ002' then null; end;
  v_result:=public.meli_finalizar_validacao(v_p,'000000000070002','android',v_answers||'{"audio":false}','QA: sem áudio',null);
  if v_result->>'status'<>'aguardando_definicao_produto' or v_result->>'imei_substituto' is not null then raise exception 'Sem substituto não foi para definição: %',v_result; end if;
  v_tests:=array_append(v_tests,'sem substituto → aguardando definição');
  select id into v_outro from public.user_profiles where id not in(v_user,'6e0ac557-93a2-42ae-8595-12648b2ac0de','48fc7302-33ca-4895-a41c-2582b442453b') limit 1;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_outro,'role','authenticated')::text,true);
  if public.meli_validacao_autorizado() then raise exception 'Usuário não liberado está autorizado.'; end if;
  if exists(select 1 from public.meli_validacoes) then raise exception 'RLS revelou checklist ao usuário não liberado.'; end if;
  v_failed:=false;
  begin perform public.meli_finalizar_validacao(v_p,'000000000070002','android',v_answers,null,null); exception when insufficient_privilege then v_failed:=true; end;
  if not v_failed then raise exception 'Usuário não liberado conseguiu finalizar teste.'; end if;
  v_tests:=array_append(v_tests,'usuário não liberado: RLS e RPC bloqueados');
  raise exception using errcode='PZ001',message='rollback de todos os dados de teste';
 exception when sqlstate 'PZ001' then null; end;
 return jsonb_build_object('ok',true,'testes',v_tests,'dados_de_teste','revertidos');
end; $$;
select pg_temp.test_meli_fluxo();
