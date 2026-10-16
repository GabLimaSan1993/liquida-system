-- Executar em transação com ROLLBACK. Não altera o caso real permanentemente.
do $test$
declare u uuid; t public.assurant_triagem%rowtype; j jsonb;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 select * into t from public.assurant_triagem where voucher='YBV439949' for update;
 -- Todos os defeitos adicionais devem impor Quebrado, sem depender da pergunta.
 update public.assurant_triagem set defeitos_adicionais='Tampa Descascada',resultado_triagem_funcional='GOOD',grade='MUITO BOM' where id=t.id;
 assert (select resultado_triagem_funcional='BAD' and grade='QUEBRADO' from public.assurant_triagem where id=t.id),'Defeito adicional ignorado';
 -- Negativa explícita deve mandar para laudo mesmo se o cliente informar divergente=false.
 j:=t.respostas_funcional::jsonb;
 j:=jsonb_set(j,'{respostas,0,resposta}','"não"'::jsonb);
 j:=jsonb_set(j,'{respostas,0,divergente}','false'::jsonb);
 update public.assurant_triagem set respostas_funcional=j::text,status_atual='Aguardando triagem cosmética',resultado_triagem_funcional='GOOD',data_funcional=t.data_funcional+interval '1 second' where id=t.id;
 assert (select status_atual='Aguardando laudo' and resultado_triagem_funcional='BAD' from public.assurant_triagem where id=t.id),'Negativa pulou laudo';
 assert liquida_private.triagem_funcional_tem_negativa('{"respostas":[{"resposta":"nao"}]}'),'Nao sem acento ignorado';
 assert not liquida_private.triagem_funcional_tem_negativa('{"respostas":[{"resposta":"sim","divergente":false}]}'),'Sim foi considerado negativo';
 assert not has_function_privilege('authenticated','liquida_private.triagem_funcional_tem_negativa(text)','execute'),'Helper privado exposto';
end;
$test$;
