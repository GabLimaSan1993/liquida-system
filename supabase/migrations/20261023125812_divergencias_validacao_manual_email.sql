-- Divergências só geram aviso após validação manual, caso a caso.
alter table liquida_private.triagem_divergencia_config
 add column validador_id uuid references public.user_profiles(id);
update liquida_private.triagem_divergencia_config
 set validador_id=(select id from public.user_profiles where lower(email)='leandro.silva@liquidapreco.com.br')
 where id;
alter table liquida_private.triagem_divergencia_email
 add column validado_por uuid references public.user_profiles(id),
 add column validado_em timestamptz;
alter table liquida_private.triagem_divergencia_email alter column estado set default 'aguardando_validacao';

-- Invalida solicitações automáticas ainda não enviadas. Histórico enviado permanece intacto.
update liquida_private.triagem_divergencia_email
 set estado='aguardando_validacao',token=gen_random_uuid(),erro=null,atualizado_em=now()
 where enviado_em is null;

-- Compatibilidade com os RPCs de triagem existentes: registrar nunca dispara e-mail.
create or replace function liquida_private.triagem_divergencia_disparar() returns void
language plpgsql security definer set search_path=pg_catalog as $$
begin
 return;
end;
$$;
revoke all on function liquida_private.triagem_divergencia_disparar() from public,anon,authenticated;
do $$
declare j record;
begin
 for j in select jobid from cron.job where jobname='triagem-divergencia-email' loop
  perform cron.unschedule(j.jobid);
 end loop;
end;
$$;

create or replace function liquida_private.divergencia_pode_enviar_email() returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(
  select 1 from public.user_profiles u where u.id=auth.uid()
  and (u.is_master or (u.id=(select validador_id from liquida_private.triagem_divergencia_config where id)
   and '/v2/assurant/triagens/divergencias-imei'=any(coalesce(u.telas_permitidas,'{}'::text[]))))
 );
$$;
revoke all on function liquida_private.divergencia_pode_enviar_email() from public,anon,authenticated;

create or replace function liquida_private.divergencia_enviar_email(p_caso uuid,p_confirmada boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare c public.assurant_divergencias_imei%rowtype; q liquida_private.triagem_divergencia_email%rowtype; requisicao bigint;
begin
 if not liquida_private.divergencia_pode_enviar_email() then
  raise exception 'Somente o Leandro e a gestão podem validar e enviar o e-mail.' using errcode='42501';
 end if;
 if p_confirmada is distinct from true then raise exception 'Confirme a conferência física da divergência antes de enviar.'; end if;
 select * into c from public.assurant_divergencias_imei where id=p_caso for update;
 if not found or c.status<>'pendente' then raise exception 'Caso inexistente ou já decidido. Atualize a tela.'; end if;
 if not exists(select 1 from liquida_private.triagem_divergencia_config where id and cardinality(destinatarios)>0) then
  raise exception 'Destinatários de e-mail não configurados.';
 end if;
 insert into liquida_private.triagem_divergencia_email(caso_id) values(p_caso) on conflict(caso_id) do nothing;
 select * into q from liquida_private.triagem_divergencia_email where caso_id=p_caso for update;
 if q.enviado_em is not null then return jsonb_build_object('ok',true,'ja_enviado',true); end if;
 if (q.estado='pendente' and q.validado_em is not null and q.atualizado_em>now()-interval '2 minutes')
 or (q.estado='enviando' and q.atualizado_em>now()-interval '5 minutes') then
  return jsonb_build_object('ok',true,'em_andamento',true);
 end if;
 update liquida_private.triagem_divergencia_email set
  validado_por=coalesce(validado_por,auth.uid()),validado_em=coalesce(validado_em,now()),
  estado='pendente',token=gen_random_uuid(),erro=null,atualizado_em=now()
 where caso_id=p_caso returning * into q;
 requisicao:=net.http_post(
  url:='https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/email-divergencia-imei',
  headers:='{"Content-Type":"application/json"}'::jsonb,
  body:=jsonb_build_object('caso_id',q.caso_id,'token',q.token),timeout_milliseconds:=10000);
 return jsonb_build_object('ok',true,'solicitado',true);
end;
$$;
revoke all on function liquida_private.divergencia_enviar_email(uuid,boolean) from public,anon;
grant execute on function liquida_private.divergencia_enviar_email(uuid,boolean) to authenticated;
create or replace function public.assurant_divergencia_enviar_email(p_caso uuid,p_confirmada boolean default false) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.divergencia_enviar_email(p_caso,p_confirmada);
$$;
revoke all on function public.assurant_divergencia_enviar_email(uuid,boolean) from public,anon;
grant execute on function public.assurant_divergencia_enviar_email(uuid,boolean) to authenticated;

create or replace function public.assurant_divergencias_listar() returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
begin
 if not public.assurant_divergencias_pode_decidir() then raise exception 'Acesso restrito à decisão Assurant.' using errcode='42501'; end if;
 return jsonb_build_object('casos',coalesce((select jsonb_agg(x order by x.criado_em desc) from (
  select d.*,e.estado email_status,e.enviado_em email_enviado_em,e.erro email_erro,
   e.validado_em email_validado_em,u.nome email_validado_por_nome,e.atualizado_em email_atualizado_em
  from public.assurant_divergencias_imei d
  left join liquida_private.triagem_divergencia_email e on e.caso_id=d.id
  left join public.user_profiles u on u.id=e.validado_por
  order by d.criado_em desc limit 1000) x),'[]'::jsonb),
  'pode_enviar_email',liquida_private.divergencia_pode_enviar_email(),
  'destinatarios',(select to_jsonb(destinatarios) from liquida_private.triagem_divergencia_config where id));
end;
$$;

create or replace function public.assurant_divergencia_email_claim(p_caso uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=pg_catalog as $$
declare q liquida_private.triagem_divergencia_email%rowtype; ds text[]; cs text[];
begin
 select * into q from liquida_private.triagem_divergencia_email where caso_id=p_caso and token=p_token for update;
 if q.caso_id is null or q.enviado_em is not null or q.validado_por is null or q.validado_em is null
 or q.estado<>'pendente' then return null; end if;
 if not exists(select 1 from public.assurant_divergencias_imei where id=p_caso and status='pendente') then return null; end if;
 select destinatarios,copias into ds,cs from liquida_private.triagem_divergencia_config where id;
 if coalesce(cardinality(ds),0)=0 then return null; end if;
 update liquida_private.triagem_divergencia_email set estado='enviando',tentativas=tentativas+1,atualizado_em=now() where caso_id=p_caso;
 return jsonb_build_object('caso',(select to_jsonb(d) from public.assurant_divergencias_imei d where id=p_caso),'destinatarios',ds,'copias',cs);
end;
$$;
revoke all on function public.assurant_divergencia_email_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assurant_divergencia_email_claim(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
