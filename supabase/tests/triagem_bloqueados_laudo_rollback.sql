-- Executar em transação com ROLLBACK.
do $test$
declare u uuid; t uuid; j jsonb;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert not exists(select 1 from public.tradein_geral where voucher in (190006001,190006002)),'Fixture em uso';
 insert into public.tradein_geral(voucher,imei,canceled,condicao_aparelho,condicao_sufixo) values(190006001,'123456789012345','NÃO','Bom','BM'),(190006002,'123456789012347','NÃO','Bom','BM');
 j:='{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":"123456789012345","aparelho_bloqueado":true},"respostas":[{"resposta":"sim","divergente":false}]}';
 insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,respostas_funcional,status_atual,resultado_triagem_funcional,aparelho_bloqueado)
 values('YBV190006001','123456789012345','GALAXY S24','liquida',now(),j::text,'Aguardando triagem cosmética','GOOD',false) returning id into t;
 assert (select status_atual='Aguardando laudo' and resultado_triagem_funcional='BAD' and aparelho_bloqueado from public.assurant_triagem where id=t),'Bloqueio no JSON não exigiu laudo';
 -- Cliente antigo tenta trocar apenas o status, sem passar por laudo.
 update public.assurant_triagem set status_atual='Aguardando triagem cosmética' where id=t;
 assert (select status_atual='Aguardando laudo' from public.assurant_triagem where id=t),'Troca de status burlou laudo';
 -- Laudo posterior à funcional libera cosmética sem apagar o bloqueio físico.
 update public.assurant_triagem set data_laudo=timezone('UTC',now())+interval '1 minute',status_atual='Aguardando triagem cosmética' where id=t;
 assert (select status_atual='Aguardando triagem cosmética' from public.assurant_triagem where id=t),'Laudo concluído não liberou cosmética';
 -- Nova funcional exige novo laudo, mesmo se houver um laudo anterior.
 update public.assurant_triagem set data_funcional=timezone('UTC',now())+interval '2 minutes',status_atual='Aguardando triagem cosmética' where id=t;
 assert (select status_atual='Aguardando laudo' from public.assurant_triagem where id=t),'Reutilizou laudo antigo na retriagem bloqueada';
 -- Só o defeito adicional de bloqueio também exige laudo.
 insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,respostas_funcional,status_atual,resultado_triagem_funcional,defeitos_adicionais)
 values('YBV190006002','123456789012347','GALAXY S24','liquida',now(),
 '{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":"123456789012347","imei2":"123456789012348","aparelho_bloqueado":false},"respostas":[{"resposta":"sim"}]}',
 'Aguardando triagem cosmética','GOOD','Bloqueado conta') returning id into t;
 assert (select status_atual='Aguardando laudo' and resultado_triagem_funcional='BAD' and grade='QUEBRADO' from public.assurant_triagem where id=t),'Defeito de bloqueio pulou laudo';
 assert not liquida_private.triagem_bloqueio_exige_laudo('N/A',false,'Desbloqueado; Sem bloqueio'),'Texto sem bloqueio gerou laudo';
 assert liquida_private.triagem_bloqueio_exige_laudo('N/A',false,'Tela quebrada; Bloqueado Com Senha'),'Bloqueio legado ignorado';
 assert liquida_private.triagem_bloqueio_exige_laudo('N/A',true,null),'Campo de bloqueio ignorado';
 assert not has_function_privilege('authenticated','liquida_private.triagem_bloqueio_exige_laudo(text,boolean,text)','execute'),'Helper exposto';
end;
$test$;
