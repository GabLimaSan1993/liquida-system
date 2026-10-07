-- Teste integrado transacional: fixtures e todas as decisões são revertidas.
create or replace function pg_temp.test_definicao_assurant()
returns jsonb language plpgsql security invoker as $$
declare
 v_admin uuid:='b517d70a-56be-4b4f-8b9e-a03c769dd3c3';
 v_rafa uuid:='c08f67b1-ea17-42ab-8eed-5c3adc469141';
 v_assurant uuid:='48fc7302-33ca-4895-a41c-2582b442453b';
 v_outro uuid:='87e791ea-cdf3-47f3-b69d-72bc2ae8880a';
 v_p uuid:=gen_random_uuid(); v_outro_p uuid:=gen_random_uuid(); v_e bigint[]; v_id uuid; v_res jsonb; v_ops jsonb; v_falhou boolean;
 v_tests text[]:='{}'; v_sku text; v_grade text; v_imei text; i integer; v_dia date:=(now() at time zone 'America/Sao_Paulo')::date;
begin
 begin
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_admin,'role','authenticated')::text,true);
  select array_agg(id) into v_e from(select id from public.wms_enderecos where ativo and status='livre' order by id limit 5 for update)t;
  if array_length(v_e,1)<>5 then raise exception 'Sem cinco posições livres para QA.'; end if;
  update public.wms_enderecos set status='ocupado' where id=any(v_e);
  insert into public.produtos_catalogo(sku_als,sku_oracle,marca,modelo,capacidade,cor) values
   ('QA-DEF-BLACK','QA-DEF-BLACK','QA','QA DEFINICAO','256GB','BLACK'),
   ('QA-DEF-WHITE','QA-DEF-WHITE','QA','QA DEFINICAO','256GB','WHITE'),
   ('QA-DEF-128','QA-DEF-128','QA','QA DEFINICAO','128GB','WHITE');
  for i in 1..5 loop
   v_sku:=case when i in(1,2) then 'QA-DEF-BLACK' when i=4 then 'QA-DEF-128' else 'QA-DEF-WHITE' end;
   v_grade:=case when i=3 then 'BOM' when i=4 then 'LIKE NEW' else 'EXCELENTE' end;
   v_imei:='00000000007110'||i;
   insert into public.assurant_triagem(voucher,imei,sku,modelo,grade,status_atual,status_bateria) values ('QA-DEF-'||i,v_imei,v_sku,'QA DEFINICAO',v_grade,'Produto disponível','saúde da bateria acima de 80%');
   insert into public.wms_alocacoes(voucher,imei,endereco_id,grade_fisica,grade_venda,tipo_produto,sku,status,confirmado_em,operador_id)
    select 'QA-DEF-'||i,v_imei,v_e[i],e.grade_fisica,v_grade,'CELULAR',v_sku,'confirmado',now(),v_admin from public.wms_enderecos e where e.id=v_e[i];
   insert into public.estoque_subinv(imei,data_subinv,local_subinv) values(v_imei,('1900-01-01'::date+i),'WH2 B2C');
  end loop;
  insert into public.pedidos_b2c(id,id_anymarket,sku_marketplace,sku_produto,grade_produto,titulo_produto,marketplace,status,status_anymarket,criado_por,definicao_status,definicao_solicitada_em)
   values(v_p,-710700101,'QA-DEF-BLACK-CC3','QA-DEF-BLACK-CC3','BOM','QA DEFINICAO 256GB BLACK - Bom','Mercado Livre','aguardando_definicao_produto','Pago',v_admin,'pendente',now());
  insert into public.pedidos_b2c(id,id_anymarket,sku_marketplace,sku_produto,grade_produto,titulo_produto,marketplace,status,status_anymarket,criado_por) values(v_outro_p,-710700102,'QA-DEF-WHITE-CC3','QA-DEF-WHITE-CC3','BOM','QA outro pedido','Outro','aguardando_alocacao','Pago',v_admin);
  perform set_config('role','authenticated',true);
  insert into public.meli_validacoes(pedido_id,id_anymarket,imei,sistema,resultado,respostas,motivo,operador_id,operador_nome)
   values(v_p,-710700101,'000000000071105','android','reprovado','{"sem_linhas":false}','QA bloqueio MELI',v_admin,'QA') returning id into v_id;
  insert into public.meli_aparelhos_bloqueados(imei,validacao_id,motivo,criado_por) values('000000000071105',v_id,'QA bloqueio MELI',v_admin);

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_rafa,'role','authenticated')::text,true);
  if (select definicao_etapa from public.pedidos_b2c where id=v_p)<>'liquida' then raise exception 'Pedido iniciou na etapa errada.'; end if;
  v_falhou:=false;
  begin perform public.b2c_encaminhar_definicao_assurant(v_p,''); exception when others then if sqlerrm not like 'Informe por que%' then raise; end if; v_falhou:=true; end;
  if not v_falhou then raise exception 'Encaminhamento sem motivo permitido.'; end if;
  v_res:=public.b2c_encaminhar_definicao_assurant(v_p,'QA: conferido estoque; solicitar upgrade ou mudança de cor');
  if (select definicao_etapa from public.pedidos_b2c where id=v_p)<>'assurant' then raise exception 'Não encaminhou.'; end if;
  if public.b2c_encaminhar_definicao_assurant(v_p,'QA segunda tentativa')->>'caso_id'<>v_res->>'caso_id' then raise exception 'Encaminhamento duplicado criou outro caso.'; end if;
  v_tests:=array_append(v_tests,'Liquida → Assurant com motivo e autor; encaminhamento idempotente');
  v_falhou:=false;
  begin perform public.b2c_assurant_aprovar_definicao(v_p,'QA-DEF-BLACK','Excelente','BLACK',null,null,true,null); exception when insufficient_privilege then v_falhou:=true; end;
  if not v_falhou then raise exception 'Rafaela aprovou decisão restrita à Assurant.'; end if;
  v_tests:=array_append(v_tests,'Liquida não aprova a decisão da Assurant');

  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_assurant,'role','authenticated')::text,true);
  v_ops:=public.b2c_definicao_opcoes(v_p);
  if jsonb_array_length(v_ops->'opcoes')<>2 then raise exception 'Família/grades ou bloqueio incorretos: %',v_ops; end if;
  if not exists(select 1 from jsonb_array_elements(v_ops->'opcoes') o where o->>'cor'='WHITE' and o->>'grade'='Bom') then raise exception 'Variante de outra cor não exibida.'; end if;
  if not exists(select 1 from jsonb_array_elements(v_ops->'opcoes') o where o->>'cor'='BLACK' and (o->>'quantidade')::integer=2 and o->'fifo'->>'imei'='000000000071101') then raise exception 'FIFO/quantidade incorretos.'; end if;
  v_tests:=array_append(v_tests,'alternativas por cor e grade; capacidade diferente e bloqueio MELI excluídos; FIFO por alternativa');
  v_falhou:=false;
  begin perform public.b2c_assurant_aprovar_definicao(v_p,'QA-DEF-BLACK','Excelente','BLACK',null,null,false,null); exception when others then if sqlerrm not like 'Confirme a aprovação%' then raise; end if; v_falhou:=true; end;
  if not v_falhou then raise exception 'Upgrade sem ciência permitido.'; end if;
  if exists(select 1 from public.b2c_upgrade_aprovacoes where pedido_id=v_p) then raise exception 'Erro parcial deixou upgrade.'; end if;
  v_tests:=array_append(v_tests,'upgrade exige aprovação explícita e falha não deixa alterações parciais');
  begin
   perform public.b2c_processar_alocacao_backend(v_outro_p);
   v_res:=public.b2c_assurant_aprovar_definicao(v_p,'QA-DEF-WHITE','Bom','WHITE','B2C','-710700102',false,'QA solicitação de transferência');
   if not (v_res->>'aguardandoDesvinculacao')::boolean then raise exception 'Vinculado não gerou fila da Liquida: %',v_res; end if;
   if (select estado from public.b2c_definicao_assurant_casos where pedido_id=v_p)<>'aguardando_desvinculacao' then raise exception 'Caso não atualizou aguardando transferência.'; end if;
   perform set_config('request.jwt.claims',jsonb_build_object('sub',v_rafa,'role','authenticated')::text,true);
   v_res:=public.assurant_processar_solicitacao_desvinculacao((v_res->>'solicitacao_id')::uuid,'QA: transferência autorizada pela Liquida');
   if not (v_res->>'ok')::boolean then raise exception 'Transferência da Liquida falhou: %',v_res; end if;
   if (select estado from public.b2c_definicao_assurant_casos where pedido_id=v_p)<>'concluido' then raise exception 'Transferência não concluiu o caso.'; end if;
   v_tests:=array_append(v_tests,'vínculo existente → solicitação à Liquida → transferência e conclusão auditadas');
   raise exception using errcode='PZ002',message='rollback do cenário de desvinculação';
  exception when sqlstate 'PZ002' then null; end;
  v_res:=public.b2c_assurant_aprovar_definicao(v_p,'QA-DEF-BLACK','Excelente','BLACK',null,null,true,'QA aprovação registrada');
  if v_res->>'imei'<>'000000000071101' or not (v_res->>'grupoFormado')::boolean then raise exception 'Alocação/ grupo incorretos: %',v_res; end if;
  if not exists(select 1 from public.pedidos_b2c where id=v_p and status='em_picking' and upgrade_aprovado and upgrade_aprovado_por=v_assurant) then raise exception 'Upgrade/picking não persistidos.'; end if;
  if not exists(select 1 from public.wms_localizar_saida(array['000000000071101']) where reserva_referencia=v_p::text and reserva_canal='B2C') then raise exception 'Reserva WMS não pertence ao pedido.'; end if;
  v_tests:=array_append(v_tests,'aprovação atômica → IMEI FIFO reservado, upgrade auditado e grupo no picking');
  v_res:=public.b2c_definicao_assurant_relatorio(v_dia,v_dia);
  if (v_res->>'total')::integer<>1 or v_res->'rows'->0->>'estado'<>'concluido' or jsonb_array_length(v_res->'rows'->0->'eventos')<>2 then raise exception 'Relatório/histórico incorretos: %',v_res; end if;
  if v_res->'rows'->0->'pedido_original'->>'grade_produto'<>'BOM' or v_res->'rows'->0->'pedido_atual'->>'grade_definida'<>'Excelente' then raise exception 'Snapshot original/atual incorreto.'; end if;
  if (public.b2c_definicao_assurant_relatorio(v_dia-1,v_dia-1)->>'total')::integer<>0 then raise exception 'Filtro vazou fora do período.'; end if;
  if (public.b2c_definicao_assurant_relatorio(v_dia,v_dia,'decidido')->>'total')::integer<>1 then raise exception 'Filtro por decisão incorreto.'; end if;
  v_tests:=array_append(v_tests,'relatório com período inclusivo de Brasília, decisão, snapshots e histórico');
  update public.pedidos_b2c set status='embalado',imei_bipado='000000000071101',bipado_em=clock_timestamp(),bipado_por=v_assurant where id=v_p;
  if (select status from public.pedidos_b2c where id=v_p)<>'aguardando_validacao_meli' then raise exception 'Upgrade pulou validação MELI.'; end if;
  v_tests:=array_append(v_tests,'substituto MELI continua obrigatório na bancada após picking');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_outro,'role','authenticated')::text,true);
  if exists(select 1 from public.b2c_definicao_assurant_casos) then raise exception 'RLS permitiu usuário não liberado.'; end if;
  v_falhou:=false;
  begin perform public.b2c_definicao_assurant_relatorio(v_dia,v_dia); exception when insufficient_privilege then v_falhou:=true; end;
  if not v_falhou then raise exception 'Relatório permitido ao usuário não liberado.'; end if;
  v_tests:=array_append(v_tests,'usuário não liberado: RLS e relatório bloqueados');
  raise exception using errcode='PZ001',message='rollback de todos os dados QA';
 exception when sqlstate 'PZ001' then null; end;
 return jsonb_build_object('ok',true,'testes',v_tests,'dados_de_teste','revertidos');
end; $$;
select pg_temp.test_definicao_assurant();
