-- Configuração privada; o token é criptografado no Vault e nunca retorna ao navegador.
create table private.chamados_whatsapp_config (
 id boolean primary key default true check(id), ativo boolean not null default false,
 modo text not null default 'teste' check(modo in ('teste','producao')),
 destinatario text, remetente text, account_sid text, token_secret_id uuid,
 content_sid text, atualizado_em timestamptz not null default now(), atualizado_por uuid
);
insert into private.chamados_whatsapp_config(id) values(true);
create table private.chamados_whatsapp_fila (
 id uuid primary key default gen_random_uuid(), chamado_id uuid unique references public.sistema_chamados(id),
 teste boolean not null default false, payload jsonb not null,
 estado text not null default 'pendente' check(estado in ('pendente','despachado','enviando','aceito','entregue','erro','incerto')),
 token uuid not null default gen_random_uuid(), tentativas integer not null default 0,
 message_sid text, erro text, criado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now(), entregue_em timestamptz,
 check((teste and chamado_id is null) or (not teste and chamado_id is not null))
);
create index chamados_whatsapp_fila_estado_idx on private.chamados_whatsapp_fila(estado,atualizado_em);
alter table private.chamados_whatsapp_config enable row level security;
alter table private.chamados_whatsapp_fila enable row level security;
revoke all on private.chamados_whatsapp_config, private.chamados_whatsapp_fila from public,anon,authenticated;

create function private.chamados_whatsapp_disparar() returns void
language plpgsql security definer set search_path='' as $$
declare q record; c private.chamados_whatsapp_config;
begin
 select * into c from private.chamados_whatsapp_config where id;
 if c.token_secret_id is null then return; end if;
 -- Em caso de queda após começar um envio, não repetir às cegas e duplicar mensagens.
 update private.chamados_whatsapp_fila set estado='incerto',erro='Envio sem confirmação. Confira o histórico na Twilio antes de tentar novamente.',atualizado_em=now()
 where estado='enviando' and atualizado_em<now()-interval '3 minutes';
 update private.chamados_whatsapp_fila set estado='pendente',atualizado_em=now()
 where estado='despachado' and atualizado_em<now()-interval '3 minutes' and tentativas<5;
 for q in select * from private.chamados_whatsapp_fila
 where (estado='pendente' or (estado='aceito' and atualizado_em<now()-interval '1 minute'))
 and (teste or (c.ativo and c.modo='producao')) and ((estado='pendente' and tentativas<5) or (estado='aceito' and tentativas<30))
 order by criado_em limit 10 for update skip locked loop
   perform net.http_post(url:='https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/chamados-whatsapp',
    headers:='{"Content-Type":"application/json"}'::jsonb, body:=jsonb_build_object('id',q.id,'token',q.token),timeout_milliseconds:=10000);
   if q.estado='pendente' then update private.chamados_whatsapp_fila set estado='despachado',atualizado_em=now() where id=q.id;
   else update private.chamados_whatsapp_fila set atualizado_em=now() where id=q.id; end if;
 end loop;
end; $$;
revoke all on function private.chamados_whatsapp_disparar() from public,anon,authenticated;

create function private.chamados_whatsapp_abertura() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from private.chamados_whatsapp_config where id and ativo and modo='producao') then
  insert into private.chamados_whatsapp_fila(chamado_id,payload)
  values(new.id,jsonb_build_object('numero',new.numero,'titulo',new.titulo,'prioridade',new.prioridade,
   'solicitante',new.solicitante_nome,'tela',new.tela_nome,'criado_em',new.criado_em));
  begin perform private.chamados_whatsapp_disparar(); exception when others then
   -- A abertura do chamado independe da disponibilidade do serviço de notificações.
   null;
  end;
 end if;
 return new;
end; $$;
revoke all on function private.chamados_whatsapp_abertura() from public,anon,authenticated;
create trigger chamados_whatsapp_abertura after insert on public.sistema_chamados
for each row execute function private.chamados_whatsapp_abertura();

create function private.chamados_whatsapp_gerenciar(p_acao text,p_dados jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c private.chamados_whatsapp_config; v_token text; v_secret uuid; v_id uuid;
begin
 if not private.chamados_pode_gerir() then raise exception 'Gestão de WhatsApp exclusiva de Gabriel.' using errcode='42501'; end if;
 select * into c from private.chamados_whatsapp_config where id for update;
 if p_acao='salvar' then
  if coalesce(p_dados->>'destinatario','') !~ '^\+[1-9][0-9]{7,14}$' or coalesce(p_dados->>'remetente','') !~ '^\+[1-9][0-9]{7,14}$'
   or coalesce(p_dados->>'account_sid','') !~ '^AC[0-9a-fA-F]{32}$' or coalesce(p_dados->>'modo','') not in ('teste','producao')
  then raise exception 'Confira os números com código do país, Account SID e modo de envio.'; end if;
  if coalesce((p_dados->>'ativo')::boolean,false) and (p_dados->>'modo'<>'producao' or coalesce(p_dados->>'content_sid','') !~ '^HX[0-9a-fA-F]{32}$')
  then raise exception 'Os avisos automáticos exigem produção e um modelo aprovado (Content SID HX...).'; end if;
  v_token:=nullif(trim(p_dados->>'auth_token'),'');
  if v_token is not null then
   if v_token !~ '^[0-9a-fA-F]{32}$' then raise exception 'Auth Token inválido.'; end if;
   if c.token_secret_id is null then
    select vault.create_secret(v_token,'liquida_chamados_twilio_token','Token de envio de avisos de chamados') into v_secret;
   else perform vault.update_secret(c.token_secret_id,v_token); v_secret:=c.token_secret_id; end if;
  elsif c.account_sid is distinct from (p_dados->>'account_sid') and c.token_secret_id is not null then
   raise exception 'Ao trocar a conta, informe o token da nova conta.';
  end if;
  if coalesce((p_dados->>'ativo')::boolean,false) and coalesce(v_secret,c.token_secret_id) is null then raise exception 'Informe o Auth Token antes de ativar.'; end if;
  update private.chamados_whatsapp_config set destinatario=p_dados->>'destinatario',remetente=p_dados->>'remetente',account_sid=p_dados->>'account_sid',
   token_secret_id=coalesce(v_secret,c.token_secret_id),modo=p_dados->>'modo',ativo=coalesce((p_dados->>'ativo')::boolean,false),
   content_sid=nullif(trim(p_dados->>'content_sid'),''),atualizado_em=now(),atualizado_por=auth.uid() where id returning * into c;
 elsif p_acao='teste' then
  if c.token_secret_id is null or c.remetente is null or c.destinatario is null then raise exception 'Salve as credenciais antes de testar.'; end if;
  if exists(select 1 from private.chamados_whatsapp_fila where teste and criado_em>now()-interval '1 minute') then raise exception 'Aguarde um minuto antes de outro teste.'; end if;
  insert into private.chamados_whatsapp_fila(teste,payload) values(true,jsonb_build_object('titulo','Teste de conexão do Liquida System')) returning id into v_id;
  perform private.chamados_whatsapp_disparar();
 elsif p_acao<>'consultar' then raise exception 'Ação inválida.';
 end if;
 return jsonb_build_object('config',to_jsonb(c)-'token_secret_id','token_configurado',c.token_secret_id is not null,'teste_id',v_id,
  'envios',coalesce((select jsonb_agg(x order by x.criado_em desc) from (
   select f.id,f.chamado_id,f.teste,f.payload->>'numero' as numero,f.estado,f.tentativas,f.message_sid,f.erro,f.criado_em,f.entregue_em
   from private.chamados_whatsapp_fila f order by criado_em desc limit 20) x),'[]'::jsonb));
end; $$;
revoke all on function private.chamados_whatsapp_gerenciar(text,jsonb) from public,anon;
grant execute on function private.chamados_whatsapp_gerenciar(text,jsonb) to authenticated;
create function public.chamados_whatsapp(p_acao text default 'consultar',p_dados jsonb default '{}') returns jsonb
language sql security invoker set search_path='' as $$ select private.chamados_whatsapp_gerenciar(p_acao,p_dados); $$;
revoke all on function public.chamados_whatsapp(text,jsonb) from public,anon;
grant execute on function public.chamados_whatsapp(text,jsonb) to authenticated;

-- O nonce autentica o webhook. Os RPCs do worker são exclusivos de service_role.
create function private.chamados_whatsapp_claim(p_id uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare q private.chamados_whatsapp_fila; c private.chamados_whatsapp_config; v_token text;
begin
 select * into q from private.chamados_whatsapp_fila where id=p_id and token=p_token for update;
 if not found or q.estado not in ('despachado','aceito') then return null; end if;
 select * into c from private.chamados_whatsapp_config where id;
 if not q.teste and (not c.ativo or c.modo<>'producao') then return null; end if;
 select decrypted_secret into v_token from vault.decrypted_secrets where id=c.token_secret_id;
 if v_token is null then return null; end if;
 if q.estado='despachado' then update private.chamados_whatsapp_fila set estado='enviando',tentativas=tentativas+1,atualizado_em=now() where id=q.id;
 else update private.chamados_whatsapp_fila set tentativas=tentativas+1,atualizado_em=now() where id=q.id; end if;
 return jsonb_build_object('id',q.id,'payload',q.payload,'teste',q.teste,'message_sid',q.message_sid,
  'acao',case when q.estado='aceito' then 'consultar' else 'enviar' end,
  'config',(to_jsonb(c)-'token_secret_id')||jsonb_build_object('auth_token',v_token));
end; $$;
revoke all on function private.chamados_whatsapp_claim(uuid,uuid) from public,anon,authenticated;
grant usage on schema private to service_role;
grant execute on function private.chamados_whatsapp_claim(uuid,uuid) to service_role;
create function public.chamados_whatsapp_claim(p_id uuid,p_token uuid) returns jsonb
language sql security invoker set search_path='' as $$ select private.chamados_whatsapp_claim(p_id,p_token); $$;
revoke all on function public.chamados_whatsapp_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.chamados_whatsapp_claim(uuid,uuid) to service_role;

create function private.chamados_whatsapp_finalizar(p_id uuid,p_token uuid,p_estado text,p_sid text,p_erro text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_estado not in ('pendente','aceito','entregue','erro','incerto') then raise exception 'Estado inválido.'; end if;
 update private.chamados_whatsapp_fila set estado=p_estado,message_sid=coalesce(p_sid,message_sid),erro=left(p_erro,500),
  atualizado_em=now(),entregue_em=case when p_estado='entregue' then now() else entregue_em end
 where id=p_id and token=p_token and estado in ('enviando','aceito');
end; $$;
revoke all on function private.chamados_whatsapp_finalizar(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function private.chamados_whatsapp_finalizar(uuid,uuid,text,text,text) to service_role;
create function public.chamados_whatsapp_finalizar(p_id uuid,p_token uuid,p_estado text,p_sid text default null,p_erro text default null) returns void
language sql security invoker set search_path='' as $$ select private.chamados_whatsapp_finalizar(p_id,p_token,p_estado,p_sid,p_erro); $$;
revoke all on function public.chamados_whatsapp_finalizar(uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.chamados_whatsapp_finalizar(uuid,uuid,text,text,text) to service_role;
select cron.schedule('chamados-whatsapp','* * * * *','select private.chamados_whatsapp_disparar()');
notify pgrst,'reload schema';
