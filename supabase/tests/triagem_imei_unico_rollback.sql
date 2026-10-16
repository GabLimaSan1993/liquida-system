-- Executar somente dentro de transação com ROLLBACK. Nenhum envio externo.
update liquida_private.triagem_divergencia_config set destinatarios='{}' where id;
do $test$
declare u uuid; r jsonb; c uuid; tok uuid; modelo text; rejeitou boolean;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 insert into public.tradein_historico(voucher_original,imei_serial,aparelho,source_file,source_row) values
 ('YBV1900000010','123456789012345','IPHONE 5','teste_imei_unico_transacional',10),
 ('YBV1900000011','123456789012345','GALAXY S24','teste_imei_unico_transacional',11),
 ('YBV1900000012','R7AX60XHHLR','FIT 3','teste_imei_unico_transacional',12),
 ('YBV1900000013','F4K123ABCDEF','IPAD 10','teste_imei_unico_transacional',13);
 foreach modelo in array array['IPHONE 5','IPHONE 5C','IPHONE 5S','IPHONE 6','IPHONE 6S PLUS','IPHONE6 PLUS','IPHONE 7','IPHONE 7 PLUS','MOTO ONE MACRO','MOTOROLA ONE MICRO','SAMSUNG GALAXY J4 PLUS','GALAXY J7 PRIME','SAMSUNG J 5'] loop
  r:=public.assurant_triagem_identificar('YBV1900000010','123456789012345',null,modelo,null,false);
  assert (r->>'confere')::boolean,'Modelo de um IMEI bloqueado: '||modelo;
  insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,status_atual,respostas_funcional)
   values('YBV1900000010','123456789012345',modelo,'liquida',now(),'Aguardando triagem cosmética',
    jsonb_build_object('produto',jsonb_build_object('modelo',modelo),'identificacao',jsonb_build_object('imei1','123456789012345','aparelho_bloqueado',false))::text)
   on conflict(voucher) do update set modelo=excluded.modelo,respostas_funcional=excluded.respostas_funcional;
 end loop;
 foreach modelo in array array['IPHONE 15','IPHONE 16','IPHONE 16 PRO MAX','GALAXY S24','GALAXY S6','MOTO G6'] loop
  rejeitou:=false;
  begin perform public.assurant_triagem_identificar('YBV1900000011','123456789012345',null,modelo,null,false);
  exception when others then rejeitou:=true; end;
  assert rejeitou,'Modelo de dois IMEIs liberado sem IMEI 2: '||modelo;
  r:=public.assurant_triagem_identificar('YBV1900000011','123456789012345',null,modelo,null,true);
  assert (r->>'confere')::boolean,'Bloqueado não aceitou um IMEI: '||modelo;
 end loop;
 r:=public.assurant_triagem_identificar('YBV1900000011','123456789012345','123456789012346','GALAXY S24',null,false);
 assert (r->>'confere')::boolean,'Dois IMEIs válidos rejeitados';
 insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,status_atual,respostas_funcional)
 values('YBV1900000011','123456789012345','GALAXY S24','liquida',now(),'Aguardando triagem cosmética',
 '{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":"123456789012345","aparelho_bloqueado":true}}');
 assert (select aparelho_bloqueado and imei2 is null from public.assurant_triagem where voucher='YBV1900000011'),'Bloqueio não auditado';
 rejeitou:=false;
 begin update public.assurant_triagem set respostas_funcional='{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":"123456789012345","aparelho_bloqueado":false}}' where voucher='YBV1900000011';
 exception when others then rejeitou:=true; end;
 assert rejeitou,'Conclusão de dois IMEIs burlada';
 rejeitou:=false;
 begin perform public.assurant_triagem_identificar('YBV1900000011','12345678901234',null,'GALAXY S24',null,true);
 exception when others then rejeitou:=true; end;
 assert rejeitou,'Bloqueado aceitou IMEI curto';
 r:=public.assurant_triagem_identificar('YBV1900000012','R7AX60XHHLR',null,'FIT 3',null,false);
 assert (r->>'confere')::boolean and r->>'tipo'='RELOGIO','Fit 3 regrediu';
 r:=public.assurant_triagem_identificar('YBV1900000013','F4K123ABCDEF',null,'IPAD 10',null,false);
 assert (r->>'confere')::boolean and r->>'tipo'='TABLET','Tablet regrediu';
 insert into public.tradein_historico(voucher_original,imei_serial,aparelho,source_file,source_row)
 values('YBV1900000014','323456789012345','GALAXY S24','teste_imei_unico_transacional',14);
 r:=public.assurant_triagem_identificar('YBV1900000014','423456789012345',null,'GALAXY S24',null,true);
 c:=(r->>'caso_id')::uuid;
 assert c is not null and r->>'criado_por_nome' is not null and r->>'criado_em' is not null,'Etiqueta sem usuário/data';
 assert (r->>'aparelho_bloqueado')::boolean,'Caso perdeu bloqueio';
 r:=public.assurant_triagem_identificar('YBV1900000014','423456789012345',null,'GALAXY S24',null,true);
 assert (r->>'caso_id')::uuid=c and r->>'criado_por_nome' is not null,'Reimpressão perdeu dados';
 assert exists(select 1 from liquida_private.triagem_divergencia_email where caso_id=c),'Aviso não enfileirado';
 update liquida_private.triagem_divergencia_config set destinatarios=array['luiz.affonso@assurant.com','edyelves.bezerra@assurant.com','alex.feliciano@assurant.com'],copias=array['jhonatan.nascimento@liquidapreco.com.br','gabriel.lima@liquidapreco.com.br'] where id;
 select token into tok from liquida_private.triagem_divergencia_email where caso_id=c;
 r:=public.assurant_divergencia_email_claim(c,tok);
 assert jsonb_array_length(r->'destinatarios')=3 and jsonb_array_length(r->'copias')=2,'Destinatários/cópias incorretos';
 assert r->'destinatarios'->>0='luiz.affonso@assurant.com' and r->'copias'->>0='jhonatan.nascimento@liquidapreco.com.br','Ordem dos destinatários errada';
 assert public.assurant_divergencia_email_claim(c,tok) is null,'Aviso duplicado';
 assert not has_function_privilege('authenticated','public.assurant_divergencia_email_claim(uuid,uuid)','execute'),'Worker exposto';
 assert not has_function_privilege('authenticated','public.assurant_divergencias_configurar(text[])','execute'),'Destinatários editáveis pela tela';
end;
$test$;
