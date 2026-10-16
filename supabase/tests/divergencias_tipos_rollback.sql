-- Executar exclusivamente com BEGIN/ROLLBACK. Nenhum e-mail de teste é enviado.
update liquida_private.triagem_divergencia_config set destinatarios='{}' where id;
do $test$
declare u uuid; r jsonb; cid uuid; rejeitou boolean; total integer;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert not exists(select 1 from public.assurant_triagem where voucher like 'YBV19000100%'),'Fixture já existe';
 insert into public.tradein_historico(voucher_original,imei_serial,aparelho,cancelado,source_file,source_row)
 values('1900010001','123456789012345','GALAXY S24',false,'qa_divergencias_tipos',1),
 ('1900010002','223456789012345','GALAXY S24',false,'qa_divergencias_tipos',2),
 ('1900010003','323456789012345','GALAXY S24',false,'qa_divergencias_tipos',3);
 insert into public.tradein_geral(voucher,canceled,imei,aparelho) values(1900010002,'SIM','223456789012345','GALAXY S24');
 -- Uma referência histórica válida continua reconhecida.
 r:=public.assurant_triagem_checar_ordem('YBV1900010001');
 assert not (r->>'divergencia')::boolean and (r->>'ordem_reconhecida')::boolean,'Histórico válido segregado';
 -- Cancelamento vence a presença da referência.
 r:=public.assurant_triagem_checar_ordem('YBV1900010002');
 cid:=(r->>'caso_id')::uuid;
 assert r->>'tipo_problema'='sem_ordem' and r->>'motivo'='Trade-in cancelado','Cancelado não ficou Sem Ordem';
 assert r->>'criado_por_nome' is not null and r->>'criado_em' is not null,'Etiqueta perdeu usuário/data';
 assert (select ordem_snapshot->>'estado'='cancelado' from public.assurant_divergencias_imei where id=cid),'Snapshot não preservado';
 r:=public.assurant_triagem_checar_ordem('YBV1900010002');
 assert (r->>'caso_id')::uuid=cid,'Cancelado criou caso duplicado';
 -- Ausente nas duas bases entra Sem Ordem sem inventar um IMEI.
 r:=public.assurant_triagem_checar_ordem('YBV1900010004'); cid:=(r->>'caso_id')::uuid;
 assert r->>'tipo_problema'='sem_ordem' and r->>'imei1' is null,'Ausente não ficou Sem Ordem';
 assert (select data_funcional is null from public.assurant_triagem where voucher='YBV1900010004'),'Pendência contada como triagem';
 rejeitou:=false;
 begin update public.assurant_triagem set status_atual='Aguardando armazenagem' where voucher='YBV1900010004';
 exception when others then rejeitou:=true; end;
 assert rejeitou,'Segregação foi ignorada';
 perform set_config('request.jwt.claim.sub','',true);rejeitou:=false;
 begin perform public.assurant_divergencias_decidir(cid,'autorizado','Liberado sem ordem para teste');
 exception when insufficient_privilege then rejeitou:=true; end;
 assert rejeitou,'Decisão sem usuário aceita';
 perform set_config('request.jwt.claim.sub',u::text,true);
 perform public.assurant_divergencias_decidir(cid,'autorizado','Autorizar triagem sem ordem conforme teste');
 r:=public.assurant_triagem_checar_ordem('YBV1900010004');
 assert not (r->>'divergencia')::boolean and (r->>'sem_ordem_autorizado')::boolean,'Autorizado caiu novamente Sem Ordem';
 r:=public.assurant_triagem_identificar('YBV1900010004','423456789012345','423456789012346','GALAXY S24',null,false);
 assert (r->>'confere')::boolean,'Autorização não liberou identificação';
 insert into public.tradein_geral(voucher,canceled,imei,aparelho) values(1900010004,'SIM','423456789012345','GALAXY S24');
 r:=public.assurant_triagem_checar_ordem('YBV1900010004');
 assert (r->>'divergencia')::boolean and r->>'tipo_problema'='sem_ordem','Novo cancelamento ignorou autorização anterior para referência ausente';
 -- Aparelho não liga: não exige IMEI nem conclusão da funcional.
 r:=public.assurant_triagem_nao_liga('YBV1900010001');cid:=(r->>'caso_id')::uuid;
 assert r->>'tipo_problema'='nao_liga' and r->>'imei1' is null,'Não liga exigiu bipagem';
 assert (select data_funcional is null from public.assurant_triagem where voucher='YBV1900010001'),'Não liga contou produção';
 select count(*) into total from liquida_private.triagem_divergencia_email where caso_id=cid;
 assert total=1,'Aviso não enfileirado uma vez';
 r:=public.assurant_triagem_nao_liga('YBV1900010001');assert (r->>'caso_id')::uuid=cid,'Não liga duplicado';
 perform public.assurant_divergencias_decidir(cid,'autorizado','Encaminhar aparelho que não liga para laudo');
 assert (select status_atual='Aguardando laudo' and resultado_triagem_funcional='BAD' and grade='QUEBRADO' from public.assurant_triagem where voucher='YBV1900010001'),'Diretriz Não liga não aplicada';
 -- IMEI divergente preserva o fluxo anterior.
 r:=public.assurant_triagem_identificar('YBV1900010003','523456789012345','523456789012346','GALAXY S24',null,false);
 cid:=(r->>'caso_id')::uuid; assert r->>'tipo_problema'='imei_divergente','IMEI perdeu classificação';
 perform public.assurant_divergencias_decidir(cid,'devolver','Manter segregado para devolver à origem');
 assert (select status_atual='Segregado - devolução à origem' from public.assurant_triagem where voucher='YBV1900010003'),'Devolução não aplicada';
 -- Nenhuma gravação direta pode concluir funcional sem ordem autorizada.
 rejeitou:=false;
 begin insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,status_atual,respostas_funcional)
 values('YBV1900010005','623456789012345','GALAXY S24','liquida',now(),'Aguardando triagem cosmética',
 '{"produto":{"modelo":"GALAXY S24"},"identificacao":{"imei1":"623456789012345","imei2":"623456789012346"}}');
 exception when others then rejeitou:=true; end;
 assert rejeitou,'Funcional sem ordem concluída diretamente';
 assert not has_function_privilege('anon','public.assurant_triagem_checar_ordem(text)','execute'),'Anônimo acessou bipagem';
 assert not has_function_privilege('authenticated','liquida_private.triagem_registrar_pendencia(text,text,text,jsonb)','execute'),'Helper exposto';
end;
$test$;
