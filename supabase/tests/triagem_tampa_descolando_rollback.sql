-- Regressão do caso YBV439949. Executar somente em BEGIN/ROLLBACK.
do $test$
declare u uuid; t public.assurant_triagem%rowtype; r jsonb;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select * into t from public.assurant_triagem where voucher='YBV439949' for update;
 assert t.imei='351742730132430' and t.data_alocacao is null,'Caso mudou; revisar';
 assert liquida_private.triagem_defeito_exige_quebrado(t.defeitos_adicionais),'Defeito não reconhecido';
 assert liquida_private.triagem_defeito_exige_quebrado('Tampa Descascada'),'Defeito adicional ignorado';
 update public.assurant_triagem set status_atual='Aguardando triagem cosmética' where id=t.id;
 r:=public.assurant_cosmetica_salvar(t.voucher,t.tela,t.laterais,t.traseira,u);
 assert (r->>'ok')::boolean and r->>'grade'='QUEBRADO','RPC não calculou Quebrado';
 assert r->>'gradeCosmetica'=t.grade_cosmetica,'Estética perdida';
 assert (select grade='QUEBRADO' and resultado_triagem_funcional='BAD' and data_funcional=t.data_funcional from public.assurant_triagem where id=t.id),'Registro incoerente';
 update public.assurant_triagem set grade='MUITO BOM',resultado_triagem_funcional='GOOD' where id=t.id;
 assert (select grade='QUEBRADO' and resultado_triagem_funcional='BAD' from public.assurant_triagem where id=t.id),'Gravação direta burlou a regra';
 update public.assurant_triagem set defeitos_adicionais=null,resultado_triagem_funcional='GOOD',grade='MUITO BOM' where id=t.id;
 assert (select grade='MUITO BOM' and resultado_triagem_funcional='GOOD' from public.assurant_triagem where id=t.id),'Sem defeito teve classificação alterada';
end;
$test$;
