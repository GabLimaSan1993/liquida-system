-- Executar com BEGIN/ROLLBACK. Nenhuma notificação externa é enviada.
update liquida_private.triagem_divergencia_config set destinatarios='{}' where id;
do $test$
declare u uuid; r jsonb; j jsonb; t uuid; rejeitou boolean;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert not exists(select 1 from public.tradein_geral where voucher in (190008001,190008002,190008003)),'Fixture em uso';
 insert into public.tradein_geral(voucher,imei,canceled) values(190008001,'123456789012345','NÃO'),(190008002,'123456789012347','NÃO'),(190008003,'123456789012350','NÃO');
 r:=public.assurant_triagem_identificar('YBV190008001',null,null,'GALAXY S24',null,false,true);
 assert (r->>'prosseguir')::boolean and not (r->>'confere')::boolean and (r->>'identificacao_nao_bipada')::boolean,'Danos da tela não liberou identificação opcional';
 assert not (r->>'divergencia')::boolean,'Danos da tela gerou divergência';
 j:='{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":null,"imei2":null,"aparelho_bloqueado":false,"danos_tela":true},"respostas":[{"resposta":"sim"}]}';
 insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,respostas_funcional,status_atual,resultado_triagem_funcional)
 values('YBV190008001',null,'GALAXY S24','liquida',now(),j::text,'Aguardando triagem cosmética','GOOD') returning id into t;
 assert (select imei='123456789012345' and imei2 is null and status_atual='Aguardando triagem cosmética' and grade='QUEBRADO' and resultado_triagem_funcional='BAD' and defeitos_adicionais='Danos da tela' from public.assurant_triagem where id=t),'Persistência sem bipagem não preservou referência/defeito';
 assert (select (respostas_funcional::jsonb->'identificacao'->>'identificacao_nao_bipada')::boolean and respostas_funcional::jsonb->'identificacao'->>'origem_imei'='referencia_cadastro' and respostas_funcional::jsonb->'identificacao'->>'imei1' is null from public.assurant_triagem where id=t),'Referência cadastral foi confundida com bipagem';
 -- Um código fornecido é guardado como bipagem, sem envio a Divergências nesta exceção.
 r:=public.assurant_triagem_identificar('YBV190008002','123456789012349',null,'GALAXY S24',null,false,true);
 assert (r->>'prosseguir')::boolean and not (r->>'confere')::boolean and not (r->>'divergencia')::boolean,'Exceção de danos criou segregação';
 j:=jsonb_set(j,'{identificacao,imei1}','"123456789012349"');
 insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,respostas_funcional,status_atual)
 values('YBV190008002','123456789012349','GALAXY S24','liquida',now(),j::text,'Aguardando triagem cosmética');
 assert (select respostas_funcional::jsonb->'identificacao'->>'conferencia_imei'='divergente' from public.assurant_triagem where voucher='YBV190008002'),'Exceção omitiu resultado da comparação';
 assert not exists(select 1 from public.assurant_divergencias_imei where voucher in ('YBV190008001','YBV190008002')),'Caso ou e-mail indevido';
 -- Respostas negativas continuam obrigando laudo.
 update public.assurant_triagem set respostas_funcional=jsonb_set(respostas_funcional::jsonb,'{respostas,0,resposta}','"não"')::text where id=t;
 assert (select status_atual='Aguardando laudo' from public.assurant_triagem where id=t),'Negativa pulou laudo';
 -- Sem a condição de danos, a identificação não pode ser omitida.
 rejeitou:=false;
 begin perform public.assurant_triagem_identificar('YBV190008001',null,null,'GALAXY S24',null,false,false); exception when others then rejeitou:=true; end;
 assert rejeitou,'Regra normal foi afrouxada';
 rejeitou:=false;
 begin perform public.assurant_triagem_identificar('YBV190008001','123456789012345','123456789012346','GALAXY S24',null,false,true); exception when others then rejeitou:=true; end;
 assert rejeitou,'Danos aceitou dois códigos';
 rejeitou:=false;
 begin perform public.assurant_triagem_identificar('YBV190008001','12345678901234',null,'GALAXY S24',null,false,true); exception when others then rejeitou:=true; end;
 assert rejeitou,'Danos aceitou IMEI malformado';
 -- Retriagem de aparelho antigo preserva a referência e audita a falta de bipagem.
 insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,respostas_funcional,status_atual)
 values('YBV190008003','123456789012350','GALAXY S24','gaia',now()-interval '1 day','N/A','Aguardando triagem funcional');
 j:='{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":null,"imei2":null,"aparelho_bloqueado":false,"danos_tela":true},"respostas":[{"resposta":"sim"}]}';
 r:=public.assurant_retriagem_funcional_salvar('YBV190008003',null,null,'GALAXY S24','Aguardando triagem cosmética','BAD',j::text,null,null,'Danos da tela','Teste de retriagem com tela danificada');
 assert (select origem_triagem='liquida' and imei='123456789012350' and (respostas_funcional::jsonb->'identificacao'->>'identificacao_nao_bipada')::boolean from public.assurant_triagem where voucher='YBV190008003'),'Retriagem legada perdeu identificação auditada';
 assert r->>'ajuste_id' is not null,'Histórico de retriagem não registrado';
 assert not has_function_privilege('anon','public.assurant_triagem_identificar(text,text,text,text,text,boolean,boolean)','execute'),'RPC liberada sem login';
end;
$test$;
