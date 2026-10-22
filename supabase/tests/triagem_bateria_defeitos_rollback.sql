begin;
do $$
declare item uuid; estado jsonb;
begin
 assert liquida_private.triagem_limpar_faixas_bateria('Saúde da bateria abaixo de 80%; Saúde da bateria entre 80% e 85%') is null;
 assert liquida_private.triagem_limpar_faixas_bateria('Tela Quebrada; Saúde da bateria abaixo de 80%; Bateria Inchada') = 'Tela Quebrada; Bateria Inchada';
 assert not liquida_private.triagem_defeito_exige_quebrado('Saúde da bateria entre 80% e 85%');
 assert liquida_private.triagem_defeito_exige_quebrado('Saúde da bateria abaixo 70%');
 assert liquida_private.triagem_defeito_exige_quebrado('Saúde da bateria abaixo de 80%; Bateria Inchada');

 insert into public.assurant_triagem(voucher, origem_triagem, status_atual, defeitos_adicionais, status_bateria, bateria_percentual)
 values('QA-BATERIA-FAIXAS-20261022', 'gaia', 'Aguardando triagem funcional',
  'Saúde da bateria abaixo de 80%; Tela Quebrada; Saúde da bateria entre 80% e 85%', 'Saúde da bateria abaixo de 80%', 75)
 returning id into item;
 assert (select defeitos_adicionais = 'Tela Quebrada' and bateria_percentual = 75 and status_bateria = 'Saúde da bateria abaixo de 80%' from public.assurant_triagem where id=item), 'Importação deve limpar apenas defeitos';

 update public.assurant_triagem set defeitos_adicionais = 'Saúde da bateria entre 80% e 85%' where id=item;
 assert (select defeitos_adicionais is null from public.assurant_triagem where id=item), 'Atualização não pode reintroduzir a faixa';

 select t.id,to_jsonb(t) - 'defeitos_adicionais' into item,estado
 from public.assurant_triagem t join liquida_private.triagem_bateria_defeitos_revisao r on r.id=t.id
 where t.origem_triagem='gaia' and t.data_alocacao is not null limit 1;
 assert item is not null, 'Produto já alocado deve estar incluído na limpeza';
 update public.assurant_triagem set defeitos_adicionais=concat_ws('; ',nullif(defeitos_adicionais,''),'Saúde da bateria abaixo de 80%','Saúde da bateria entre 80% e 85%') where id=item;
 assert (select (to_jsonb(t) - 'defeitos_adicionais') = estado from public.assurant_triagem t where id=item), 'Não deve alterar alocação, grade, etapas ou bateria';
 assert (select t.defeitos_adicionais is not distinct from r.defeitos_depois from public.assurant_triagem t join liquida_private.triagem_bateria_defeitos_revisao r on r.id=t.id where t.id=item), 'Não deve apagar outros defeitos';
end;
$$;
set local role authenticated;
select liquida_private.triagem_limpar_faixas_bateria('Saúde da bateria abaixo de 80%; Bateria Inchada') = 'Bateria Inchada' as acesso_autenticado_ok;
rollback;
