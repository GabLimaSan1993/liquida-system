-- Sempre executar em transação com ROLLBACK.
do $test$
declare u uuid; r jsonb; cid uuid; rejected boolean; ident text; st text; t uuid;
begin
 select id into u from public.user_profiles where is_master=true limit 1;
 assert u is not null,'Perfil master necessário';
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert not exists(select 1 from public.tradein_historico where voucher_original='YBV1900000001'),'Fixture em uso';
 insert into public.tradein_historico(voucher_original,imei_serial,aparelho,source_file,source_row)
 values('YBV1900000001','123456789012345','GALAXY S24','teste_transacional',1);
 r:=public.assurant_triagem_identificar('YBV1900000001','123456789012346','123456789012345','GALAXY S24',null);
 assert (r->>'confere')::boolean and r->>'imei_canonico'='123456789012345','Contrato deve conferir com IMEI 2';
 foreach ident in array array['12345678901234','1234567890123456','ABC456789012345',''] loop
  rejected:=false;
  begin perform public.assurant_triagem_identificar('YBV1900000001',ident,'123456789012346','GALAXY S24',null);
  exception when others then rejected:=true; end;
  assert rejected,'Código inválido aceito';
 end loop;
 rejected:=false;
 begin perform public.assurant_triagem_identificar('YBV1900000001','123456789012345','123456789012345','GALAXY S24',null);
 exception when others then rejected:=true; end;
 assert rejected,'IMEIs iguais aceitos';
 r:=public.assurant_triagem_identificar('YBV1900000002','R58M-123ABC',null,'WATCH 6',null);
 assert (r->>'confere')::boolean and r->>'tipo'='RELOGIO','Relógio bloqueado';
 r:=public.assurant_triagem_identificar('YBV1900000003','F4K123ABCDEF',null,'IPAD 10',null);
 assert (r->>'confere')::boolean and r->>'tipo'='TABLET','Tablet bloqueado';
 r:=public.assurant_triagem_identificar('YBV1900000001','223456789012345','223456789012346','GALAXY S24',null);
 cid:=(r->>'caso_id')::uuid;
 assert (r->>'divergencia')::boolean and cid is not null,'Divergência ausente';
 select id,status_atual into t,st from public.assurant_triagem where voucher='YBV1900000001';
 assert st='Aguardando definição Assurant - IMEI divergente','Não segregou';
 assert (select data_funcional is null from public.assurant_triagem where id=t),'Contou como triagem concluída';
 r:=public.assurant_triagem_identificar('YBV1900000001','223456789012345','223456789012346','GALAXY S24',null);
 assert (r->>'caso_id')::uuid=cid,'Caso duplicado';
 rejected:=false;
 begin update public.assurant_triagem set status_atual='Aguardando triagem cosmética' where id=t;
 exception when others then rejected:=true; end;
 assert rejected,'Segregação ignorada';
 perform set_config('request.jwt.claim.sub','',true);rejected:=false;
 begin perform public.assurant_divergencias_decidir(cid,'autorizado','Teste');
 exception when insufficient_privilege then rejected:=true; end;
 assert rejected,'Decisão não autorizada';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform public.assurant_divergencias_decidir(cid,'autorizado','Autorizado para teste transacional');
 assert (select status_atual='Aguardando triagem funcional' from public.assurant_triagem where id=t),'Não voltou à funcional';
 r:=public.assurant_triagem_identificar('YBV1900000001','223456789012345','223456789012346','GALAXY S24',null);
 assert (r->>'confere')::boolean,'Par aprovado bloqueado';
 assert (select imei_serial='123456789012345' from public.tradein_historico where voucher_original='YBV1900000001'),'Contrato alterado';
 rejected:=false;
 begin update public.assurant_triagem set data_funcional=now(),respostas_funcional='{}' where id=t;
 exception when others then rejected:=true; end;
 assert rejected,'Conclusão sem IMEIs aceita';
 update public.assurant_triagem set imei='223456789012345',data_funcional=now(),status_atual='Aguardando triagem cosmética',
 respostas_funcional='{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":"223456789012345","imei2":"223456789012346"}}' where id=t;
 assert (select imei2='223456789012346' from public.assurant_triagem where id=t),'IMEI 2 não preservado';
 r:=public.assurant_triagem_identificar('YBV1900000001','323456789012345','323456789012346','GALAXY S24',null);
 cid:=(r->>'caso_id')::uuid;assert cid is not null,'Outro par não segregou';
 perform public.assurant_divergencias_decidir(cid,'devolver','Devolver à loja conforme teste');
 assert (select status_atual='Segregado - devolução à origem' from public.assurant_triagem where id=t),'Devolução não segregou';
end;
$test$;
