do $test$
declare r jsonb; m text;
begin
 perform set_config('request.jwt.claim.sub',(select id::text from public.user_profiles where is_master limit 1),true);
 foreach m in array array['FIT 3','GALAXY FIT3','SAMSUNG FIT 3 40MM GRAY','Samsung  Fit 3  Gray'] loop
  assert liquida_private.triagem_tipo(m)='RELOGIO','Fit não classificado como relógio';
  r:=public.assurant_triagem_identificar('YBV438874','R7AX60XHHLR',null,m,'BRZSWT13504');
  assert (r->>'confere')::boolean,'Serial do voucher não aceito';
  assert r->>'tipo'='RELOGIO','Tipo incorreto';
 end loop;
 assert liquida_private.triagem_tipo('GALAXY S24 ULTRA')='CELULAR','Celular perdeu sua validação';
 assert liquida_private.triagem_tipo('GALAXY TAB S9')='TABLET','Tablet incorreto';
 assert (select status_atual='Aguardando triagem funcional' from public.assurant_triagem where voucher='YBV438874'),'Etapa do voucher alterada';
end;$test$;
