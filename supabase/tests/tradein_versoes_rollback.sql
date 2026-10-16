-- Executar dentro de BEGIN/ROLLBACK. Nenhum dado ou envio de teste persiste.
do $test$
declare u uuid; outro uuid; c1 uuid:=gen_random_uuid(); c2 uuid:=gen_random_uuid(); c3 uuid:=gen_random_uuid(); r jsonb; n bigint; rejeitou boolean; payload jsonb;
begin
 select id into u from public.user_profiles where is_master limit 1;
 select id into outro from public.user_profiles where not coalesce(is_master,false)
  and not '/upload'=any(coalesce(telas_permitidas,'{}'::text[]))
  and not '/v2/assurant/uploads'=any(coalesce(telas_permitidas,'{}'::text[])) limit 1;
 assert u is not null and outro is not null,'Perfis de teste necessários';
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert not exists(select 1 from public.tradein_geral where voucher between 190001001 and 190001004),'Fixture em uso';
 insert into public.tradein_geral(voucher,imei,cliente,status_atual,canceled,importado_por)
 values(190001001,'123456789012345','Cliente preservado','Em espera','NÃO',u),
       (190001003,'123456789012347','Ausente da nova carga','Em espera','NÃO',u);
 -- Simula um estado anterior à implantação da trilha de versões.
 delete from liquida_private.tradein_versoes where voucher='190001001';
 payload:='[{"voucher":190001001,"status_atual":"Cancelado","canceled":"SIM"},{"voucher":190001002,"imei":"123456789012346","status_atual":"Coleta solicitada","canceled":"NÃO"}]';
 r:=public.tradein_importar_bloco(c1,'arquivo_a.xlsx',2,1,payload,'{"total_linhas":2}');
 assert (r->>'concluido')::boolean and (r->>'total_gravado')::integer=2,'Carga não concluiu';
 assert (select status_atual='Cancelado' and canceled='SIM' and cliente='Cliente preservado' and importado_por=u from public.tradein_geral where voucher=190001001),'Estado atual incorreto';
 assert (select status_atual='Em espera' from public.tradein_geral where voucher=190001003),'Voucher ausente foi apagado ou modificado';
 assert exists(select 1 from liquida_private.tradein_versoes where voucher='190001001' and evento='estado_anterior' and dados->>'status_atual'='Em espera'),'Estado anterior não preservado';
 assert exists(select 1 from liquida_private.tradein_versoes where voucher='190001001' and importacao_id=c1 and arquivo='arquivo_a.xlsx' and usuario_id=u and usuario_nome is not null and dados->>'canceled'='SIM'),'Proveniência ou cancelamento ausente';
 select count(*) into n from liquida_private.tradein_versoes where importacao_id=c1;
 r:=public.tradein_importar_bloco(c1,'arquivo_a.xlsx',2,1,payload,'{"total_linhas":2}');
 assert (r->>'repetido')::boolean,'Reenvio não identificado';
 assert (select count(*)=n from liquida_private.tradein_versoes where importacao_id=c1),'Reenvio duplicou histórico';
 rejeitou:=false;
 begin perform public.tradein_importar_bloco(c1,'arquivo_a.xlsx',2,1,'[{"voucher":190001001,"status_atual":"Outra versão"},{"voucher":190001002}]','{"total_linhas":2}');
 exception when others then rejeitou:=true; end;
 assert rejeitou,'Reenvio alterado aceito';
 r:=public.tradein_importar_bloco(c2,'arquivo_b.xlsx',1,1,'[{"voucher":190001001,"status_atual":"Coleta solicitada","canceled":"NÃO"}]');
 assert (select count(*)=3 from liquida_private.tradein_versoes where voucher='190001001'),'Segunda carga sobrescreveu versões anteriores';
 assert (select status_atual='Coleta solicitada' and canceled='NÃO' and cliente='Cliente preservado' from public.tradein_geral where voucher=190001001),'Nova situação não aplicada';
 r:=public.tradein_consultar_versoes('YBV190001001');
 assert jsonb_array_length(r)=3 and r->0->>'arquivo'='arquivo_b.xlsx','Consulta não ordenou versões';
 -- Falha de um registro reverte todos os registros e a identificação do bloco.
 rejeitou:=false;
 begin perform public.tradein_importar_bloco(gen_random_uuid(),'falha.xlsx',2,1,
  '[{"voucher":190001001,"status_atual":"Não gravar"},{"voucher":190001002,"valor_tradein":"valor inválido"}]');
 exception when others then rejeitou:=true; end;
 assert rejeitou,'Tipo inválido aceito';
 assert not exists(select 1 from liquida_private.tradein_importacoes where arquivo='falha.xlsx'),'Falha deixou carga ou bloco gravado';
 assert (select status_atual='Coleta solicitada' from public.tradein_geral where voucher=190001001),'Bloco falhou parcialmente';
 -- Escritas fora da tela e na base histórica também preservam versões.
 update public.tradein_geral set status_atual='Atualização administrativa' where voucher=190001001;
 assert exists(select 1 from liquida_private.tradein_versoes where voucher='190001001' and evento='atualizado' and importacao_id is null),'Escrita direta não auditada';
 insert into public.tradein_historico(voucher_original,imei_serial,source_file,source_row,status_atual)
 values('YBV190001004','123456789012348','fixture_versoes.xlsx',1,'Antigo');
 update public.tradein_historico set status_atual='Atualizado' where voucher_key='190001004';
 assert (select count(*)=2 from liquida_private.tradein_versoes where voucher='190001004' and fonte='tradein_historico' and arquivo='fixture_versoes.xlsx'),'Base histórica sem auditoria';
 perform set_config('request.jwt.claim.sub',outro::text,true);
 rejeitou:=false;
 begin perform public.tradein_importar_bloco(gen_random_uuid(),'proibido.xlsx',1,1,'[{"voucher":190001001}]');
 exception when insufficient_privilege then rejeitou:=true; end;
 assert rejeitou,'Usuário sem permissão importou';
 rejeitou:=false;
 begin perform public.tradein_consultar_versoes('190001001'); exception when insufficient_privilege then rejeitou:=true; end;
 assert rejeitou,'Usuário sem permissão leu dados históricos';
 perform set_config('request.jwt.claim.sub',u::text,true);
 rejeitou:=false;
 begin perform public.tradein_importar_bloco(c1,'arquivo_a.xlsx',2,1,payload,'{}'); exception when insufficient_privilege then rejeitou:=true; end;
 assert rejeitou,'Metadados da carga puderam ser trocados';
 -- Uma carga incompleta não se apresenta como concluída e reenvios não somam.
 assert not exists(select 1 from public.tradein_geral where voucher between 190002001 and 190002501),'Fixtures de bloco em uso';
 select jsonb_agg(jsonb_build_object('voucher',i,'status_atual','Em espera') order by i) into payload from generate_series(190002001,190002500) i;
 r:=public.tradein_importar_bloco(c3,'dois_blocos.xlsx',501,1,payload);
 assert not (r->>'concluido')::boolean and (r->>'total_gravado')::integer=500,'Carga parcial marcada como concluída';
 r:=public.tradein_importar_bloco(c3,'dois_blocos.xlsx',501,1,payload);
 assert (r->>'total_gravado')::integer=500 and (r->>'repetido')::boolean,'Reenvio somou quantidade';
 r:=public.tradein_importar_bloco(c3,'dois_blocos.xlsx',501,2,'[{"voucher":190002501,"status_atual":"Em espera"}]');
 assert (r->>'concluido')::boolean and (r->>'total_gravado')::integer=501,'Último bloco não concluiu carga';
 assert (select count(*)=501 from liquida_private.tradein_versoes where importacao_id=c3),'Histórico incompleto entre blocos';
 assert not has_table_privilege('authenticated','liquida_private.tradein_versoes','INSERT,UPDATE,DELETE'),'Histórico pode ser adulterado pela API';
 assert not has_function_privilege('anon','public.tradein_importar_bloco(uuid,text,integer,integer,jsonb,jsonb)','EXECUTE'),'Importação exposta sem login';
 assert not has_function_privilege('anon','public.tradein_consultar_versoes(text,integer,bigint)','EXECUTE'),'Histórico exposto sem login';
end;
$test$;
