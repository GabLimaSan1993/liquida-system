-- Executar BEGIN; + operations/20261016_liberar_caixas_analise.sql + este arquivo.
-- Todas as alterações, inclusive a simulação completa de alocação, são desfeitas.
select set_config('request.jwt.claim.sub',(select id::text from public.user_profiles where email='gabriellimadossantos1993@gmail.com'),'true');
do $teste$
declare pagina jsonb; offset_atual integer:=0; vistos integer:=0; qtd integer; ator uuid:=auth.uid(); evento uuid; resposta jsonb; reserva uuid; endereco jsonb; etapa text; codigo text;
begin
 if (select count(*) from public.assurant_caixas_liberadas)<>1101 then raise exception 'Lote incorreto';end if;
 loop
  pagina:=public.assurant_armazenagem_fila(offset_atual,200);
  select count(*) into qtd from jsonb_array_elements(pagina) p where p->>'referencia_caixa' is not null;
  vistos:=vistos+qtd;
  exit when jsonb_array_length(pagina)<200;
  offset_atual:=offset_atual+200;
 end loop;
 if vistos<>1101 then raise exception 'Fila truncada: %',vistos;end if;
 if exists(select 1 from public.assurant_triagem_indicadores t join public.assurant_caixas_liberadas x on x.triagem_id=t.id) then raise exception 'Lote vazou nos indicadores de triagem';end if;
 if exists(select 1 from public.estoque_subinv_indicadores s join public.assurant_caixas_liberadas x on x.imei=s.imei) then raise exception 'Lote vazou no estoque dos indicadores';end if;
 if exists(select 1 from public.vw_assurant_estoque_detalhe_atual s join public.assurant_caixas_liberadas x on x.imei=s.imei) then raise exception 'Lote vazou em aging/estoque executivo';end if;
 if exists(select 1 from liquida_private.esteira_tradein s join public.assurant_caixas_liberadas x on x.voucher=s.voucher or x.imei=s.imei) then raise exception 'Lote vazou na Gestão da Esteira';end if;
 if exists(select 1 from public.assurant_rastreabilidade_ajustes a join public.assurant_triagem t on t.id=(a.valor_anterior::jsonb #>> '{triagem,id}')::uuid where a.campo='carga_inicial.caixas.liberacao' and (
  (a.valor_anterior::jsonb #>> '{triagem,data_recebimento}') is distinct from to_jsonb(t)->>'data_recebimento' or
  (a.valor_anterior::jsonb #>> '{triagem,data_funcional}') is distinct from to_jsonb(t)->>'data_funcional' or
  (a.valor_anterior::jsonb #>> '{triagem,data_cosmetico}') is distinct from to_jsonb(t)->>'data_cosmetico' or
  (a.valor_anterior::jsonb #>> '{triagem,data_alocacao}') is distinct from to_jsonb(t)->>'data_alocacao')) then raise exception 'Histórico de datas alterado';end if;
 if has_function_privilege('anon','public.assurant_armazenagem_fila(integer,integer)','execute') or has_function_privilege('anon','public.assurant_caixas_completar_cadastro(text,text,text,text,text,text)','execute') then raise exception 'Acesso anônimo indevido';end if;
 -- Um item sem cadastro aparece na fila, recebe somente os dados conferidos e pode ser alocado.
 if exists(select 1 from public.assurant_triagem where imei='190009000000001') then raise exception 'IMEI de teste já existe';end if;
 insert into public.wms_carga_inicial_eventos(sessao_id,endereco_id,imei,resultado,caixa_codigo,snapshot,operador_id)
 select sessao_id,endereco_id,'190009000000001','segregado','ANALISE04','{}',ator from public.wms_carga_inicial_eventos limit 1 returning id into evento;
 insert into public.assurant_caixas_liberadas(imei,evento_id,caixa_codigo,liberado_por) values('190009000000001',evento,'ANALISE04',ator);
 resposta:=public.assurant_caixas_completar_cadastro('190009000000001','190009000000001','CI-TEST-CAIXAS-190009','BRZDEV11480','SAMSUNG GALAXY S21 PLUS','QUEBRADO');
 if not (resposta->>'ok')::boolean then raise exception 'Cadastro não foi concluído';end if;
 if exists(select 1 from public.assurant_triagem where voucher='CI-TEST-CAIXAS-190009' and (data_funcional is not null or data_cosmetico is not null)) then raise exception 'Datas de triagem inventadas';end if;
 resposta:=public.wms_reservar_endereco('CI-TEST-CAIXAS-190009',ator);
 if not coalesce((resposta->>'ok')::boolean,false) then raise exception 'Falha na reserva: %',resposta;end if;
 reserva:=(resposta #>> '{reserva,id}')::uuid; endereco:=resposta->'endereco';
 foreach etapa in array array['rua','bloco','andar','coluna','linha'] loop
  codigo:=case etapa when 'rua' then 'RUA'||lpad(endereco->>'rua',2,'0') when 'bloco' then 'BL'||lpad(endereco->>'bloco',2,'0') when 'andar' then 'AD'||lpad(endereco->>'andar',2,'0') when 'coluna' then 'COL'||(endereco->>'coluna') when 'linha' then 'LIN'||lpad(endereco->>'linha',2,'0') end;
  resposta:=public.wms_registrar_bipagem(reserva,etapa,codigo,ator);
  if not coalesce((resposta->>'ok')::boolean,false) then raise exception 'Falha na confirmação: %',resposta;end if;
 end loop;
 if not coalesce((resposta->>'concluido')::boolean,false) then raise exception 'Armazenagem não foi concluída';end if;
 if exists(select 1 from public.assurant_triagem_indicadores where voucher='CI-TEST-CAIXAS-190009') or exists(select 1 from public.wms_alocacoes_indicadores where voucher='CI-TEST-CAIXAS-190009') then raise exception 'Exclusão perdida após armazenar';end if;
 if exists(select 1 from liquida_private.producao_base where fonte_id='CI-TEST-CAIXAS-190009' or (fonte='wms_alocacoes' and fonte_id=reserva::text)) then raise exception 'Armazenagem entrou na produção/bonificação';end if;
 if not exists(select 1 from public.wms_alocacoes where id=reserva and status='confirmado') then raise exception 'Registro operacional de alocação perdido';end if;
 perform set_config('request.jwt.claim.sub','','true');
 begin perform public.assurant_armazenagem_fila(); raise exception 'Permitiu acesso sem autenticação'; exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub',ator::text,'true');
end $teste$;
select 'Fila completa; histórico preservado; cadastro e alocação funcionando; exclusão persistente dos indicadores e da produção; acesso validado.' resultado;
rollback;
