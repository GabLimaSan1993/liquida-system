-- Testes reversíveis de ponta a ponta no banco. Executar com BEGIN/ROLLBACK.
do $qa$
declare u uuid; c record; v_num bigint; v_imei text; t uuid; j jsonb; atual public.assurant_triagem%rowtype;
begin
 select id into u from public.user_profiles where is_master limit 1;
 perform set_config('request.jwt.claim.sub',u::text,true);
 assert not exists(select 1 from public.tradein_geral where voucher between 190020101 and 190020110),'Fixture em uso';
 for c in select * from (values
  (1,'Bom','BM','Leitores biométricos funcionando?',false,true),
  (2,'Trincado','TR','Leitores biométricos funcionando?',false,false),
  (3,'Defeituoso','TR','O aparelho liga, efetua chamadas e se escuta?',false,true),
  (4,'Trincado','TR','Aparelho desbloqueado de senhas e e-mail?',false,true),
  (5,'Trincado','TR','O aparelho está sem danos na tela?',false,false),
  (6,'Defeituoso','TR','Leitores biométricos funcionando?',true,true),
  (7,'Excelente',null,'O aparelho liga, efetua chamadas e se escuta?',false,false)
 ) as cenarios(n,condicao,sufixo,pergunta,bloqueado,esperado) loop
  v_num:=190020100+c.n; v_imei:='1900201000000'||lpad(c.n::text,2,'0');
  insert into public.tradein_geral(voucher,imei,canceled,condicao_aparelho,condicao_sufixo)
   values(v_num,v_imei,'NÃO',c.condicao,c.sufixo);
  j:=jsonb_build_object('produto',jsonb_build_object('modelo','IPHONE 11'),
   'identificacao',jsonb_build_object('imei1',v_imei,'imei2','2900201000000'||lpad(c.n::text,2,'0'),'aparelho_bloqueado',c.bloqueado),
   'destino',jsonb_build_object('laudo',true,'condicao_declarada','Bom','condicao_sufixo_declarado','BM'),
   'respostas',jsonb_build_array(jsonb_build_object('pergunta',c.pergunta,'resposta','não','divergente',false)));
  insert into public.assurant_triagem(voucher,imei,modelo,origem_triagem,data_funcional,respostas_funcional,status_atual,resultado_triagem_funcional,defeitos_adicionais)
   values('YBV'||v_num::text,v_imei,'IPHONE 11','liquida',timezone('UTC',now()),j::text,'Aguardando laudo','GOOD','Tela descascada') returning id into t;
  select * into atual from public.assurant_triagem where id=t;
  assert (atual.status_atual='Aguardando laudo')=c.esperado,format('Destino incorreto cenário %s: %s',c.n,atual.status_atual);
  assert atual.resultado_triagem_funcional='BAD' and atual.grade='QUEBRADO','Dispensa de laudo alterou classificação física';
  assert (atual.respostas_funcional::jsonb#>>'{destino,laudo}')::boolean=c.esperado,'Metadados divergentes do destino';
  if c.esperado then
   update public.assurant_triagem set status_atual='Aguardando triagem cosmética' where id=t;
   assert (select status_atual='Aguardando laudo' from public.assurant_triagem where id=t),'Status isolado burlou laudo obrigatório';
   update public.assurant_triagem set status_atual='Aguardando triagem cosmética',data_laudo=timezone('UTC',now())+interval '1 minute' where id=t;
   assert (select status_atual='Aguardando triagem cosmética' from public.assurant_triagem where id=t),'Laudo concluído não liberou cosmética';
  end if;
 end loop;
 assert not has_function_privilege('authenticated','liquida_private.triagem_laudo_por_compra(text,text,text,boolean,text)','execute'),'Helper exposto';
 assert not has_function_privilege('anon','liquida_private.triagem_condicao_compra(text,text)','execute'),'Helper exposto';
end;
$qa$;
