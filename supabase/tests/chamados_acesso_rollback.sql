begin;

set local request.jwt.claims='{"sub":"b517d70a-56be-4b4f-8b9e-a03c769dd3c3","role":"authenticated"}';
set local role authenticated;
insert into public.sistema_chamados(id,titulo,tipo,prioridade,tela_nome,tela_rota,descricao,resultado_esperado)
values('00000000-0000-4000-8000-000000000019','Teste de chamado','melhoria','normal','Teste de tela','/chamados','Teste completo com rollback.','Resultado esperado.');
update public.sistema_chamados set status='em_analise' where id='00000000-0000-4000-8000-000000000019';
insert into public.sistema_chamado_eventos(chamado_id,texto) values('00000000-0000-4000-8000-000000000019','Comentário de teste.');
do $$ begin
 if (select count(*) from public.sistema_chamado_eventos where chamado_id='00000000-0000-4000-8000-000000000019')<>3 then raise exception 'Histórico incorreto'; end if;
 if (select solicitante_nome from public.sistema_chamados where id='00000000-0000-4000-8000-000000000019')<>'Gabriel Lima' then raise exception 'Autor incorreto'; end if;
end $$;
reset role;
set local request.jwt.claims='{"sub":"8549de55-3657-4042-86c6-822cd3d49941","role":"authenticated"}';
set local role authenticated;
do $$ begin if not private.chamados_tem_acesso() then raise exception 'Fernando sem acesso'; end if; end $$;
insert into public.sistema_chamado_eventos(chamado_id,texto) values('00000000-0000-4000-8000-000000000019','Teste Fernando.');
reset role;
set local request.jwt.claims='{"sub":"6e0ac557-93a2-42ae-8595-12648b2ac0de","role":"authenticated"}';
set local role authenticated;
do $$ begin if not private.chamados_tem_acesso() then raise exception 'Jhonatan sem acesso'; end if; end $$;
reset role;
set local request.jwt.claims='{"sub":"70a0c481-ff5e-476a-b65c-92c8a30676de","role":"authenticated"}';
set local role authenticated;
do $$ begin
 if private.chamados_tem_acesso() then raise exception 'Usuário indevido autorizado'; end if;
 if exists(select 1 from public.sistema_chamados) then raise exception 'Chamados expostos'; end if;
 begin
 insert into public.sistema_chamados(titulo,tipo,tela_nome,descricao) values('Acesso indevido','melhoria','Teste','Teste de permissão negada');
 raise exception 'Inserção indevida aceita';
 exception when insufficient_privilege then null; end;
 begin
 update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'::text[]),'/chamados') where id=auth.uid();
 raise exception 'Autoelevação aceita';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

rollback;

