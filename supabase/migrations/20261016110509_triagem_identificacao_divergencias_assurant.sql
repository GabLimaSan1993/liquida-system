-- Identificação física, segregação e decisão auditada da Assurant.
alter table public.assurant_triagem add column if not exists imei2 text;
alter table public.assurant_triagem add column if not exists tipo_aparelho text;

create table public.assurant_divergencias_imei (
 id uuid primary key default gen_random_uuid(), voucher text not null,
 triagem_id uuid references public.assurant_triagem(id), tipo_aparelho text not null,
 imei_esperado text, imei1 text not null, imei2 text, modelo text, sku text,
 status text not null default 'pendente' check(status in ('pendente','autorizado','devolver')),
 diretriz text, criado_por uuid not null, criado_em timestamptz not null default now(),
 decidido_por uuid, decidido_em timestamptz
);
create unique index assurant_divergencias_imei_pendente on public.assurant_divergencias_imei(voucher) where status='pendente';
create index assurant_divergencias_imei_voucher on public.assurant_divergencias_imei(voucher,criado_em desc);
create table liquida_private.triagem_divergencia_email (
 caso_id uuid primary key references public.assurant_divergencias_imei(id),
 token uuid not null default gen_random_uuid(), estado text not null default 'pendente',
 tentativas integer not null default 0, atualizado_em timestamptz not null default now(),
 enviado_em timestamptz, erro text
);
create table liquida_private.triagem_divergencia_config (
 id boolean primary key default true check(id), destinatarios text[] not null default '{}', atualizado_por uuid, atualizado_em timestamptz not null default now()
);
insert into liquida_private.triagem_divergencia_config(id) values(true);
alter table public.assurant_divergencias_imei enable row level security;
alter table liquida_private.triagem_divergencia_email enable row level security;
alter table liquida_private.triagem_divergencia_config enable row level security;
revoke all on public.assurant_divergencias_imei from anon,authenticated;
revoke all on liquida_private.triagem_divergencia_email,liquida_private.triagem_divergencia_config from anon,authenticated;

create or replace function public.assurant_divergencias_pode_decidir() returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.user_profiles u where u.id=auth.uid()
 and (u.is_master or '/v2/assurant/triagens/divergencias-imei'=any(coalesce(u.telas_permitidas,'{}'::text[]))));
$$;
revoke all on function public.assurant_divergencias_pode_decidir() from public,anon;
grant execute on function public.assurant_divergencias_pode_decidir() to authenticated;

create or replace function liquida_private.triagem_pode_operar() returns boolean
language sql stable security definer set search_path=public as $$
 select auth.uid() is not null and exists(select 1 from public.user_profiles u where u.id=auth.uid()
 and (u.is_master or '/v2/assurant/triagens/funcional'=any(coalesce(u.telas_permitidas,'{}'::text[]))
 or '/triagens/funcional'=any(coalesce(u.telas_permitidas,'{}'::text[]))));
$$;
revoke all on function liquida_private.triagem_pode_operar() from public,anon,authenticated;

create or replace function liquida_private.triagem_tipo(p_modelo text) returns text
language sql stable security definer set search_path=public as $$
 select case when upper(coalesce(p_modelo,'')) ~ '(WATCH|RELÓGIO|RELOGIO|SMARTWATCH|\mBAND\M)' then 'RELOGIO'
 when exists(select 1 from public.produtos_catalogo where modelo=p_modelo and tipo='SMARTWATCH' and ativo) then 'RELOGIO'
 when exists(select 1 from public.produtos_catalogo where modelo=p_modelo and tipo='TABLET' and ativo) then 'TABLET'
 when upper(coalesce(p_modelo,'')) ~ '(IPAD|TABLET|\mTAB\M|MATEPAD|XIAOMI PAD|REDMI PAD|LENOVO.*PAD)' then 'TABLET' else 'CELULAR' end;
$$;
revoke all on function liquida_private.triagem_tipo(text) from public,anon,authenticated;

create or replace function liquida_private.triagem_validar_codigos(p_tipo text,p_imei1 text,p_imei2 text) returns void
language plpgsql set search_path=pg_catalog as $$
begin
 if p_tipo='CELULAR' then
  if coalesce(p_imei1,'') !~ '^[0-9]{15}$' or coalesce(p_imei2,'') !~ '^[0-9]{15}$' then
   raise exception 'Celulares exigem dois IMEIs de exatamente 15 dígitos numéricos.';
  end if;
  if p_imei1=p_imei2 then raise exception 'Os IMEIs 1 e 2 devem ser diferentes.'; end if;
 elsif p_tipo not in ('TABLET','RELOGIO') or coalesce(p_imei1,'') !~ '^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$' then
  raise exception 'Referência/serial inválido: informe de 3 a 64 caracteres sem espaços.';
 end if;
end;
$$;
revoke all on function liquida_private.triagem_validar_codigos(text,text,text) from public,anon,authenticated;

create or replace function liquida_private.triagem_codigo_esperado(p_voucher text) returns text
language sql stable security definer set search_path=public as $$
 select coalesce(
 (select nullif(trim(t.imei),'') from public.tradein_geral t where upper(p_voucher) ~ '^YBV[0-9]+$'
 and t.voucher::text=substring(upper(p_voucher) from 4) limit 1),
 (select nullif(trim(h.imei_serial),'') from public.tradein_historico h where upper(h.voucher_original)=upper(p_voucher)
 or (upper(p_voucher) ~ '^YBV[0-9]+$' and h.voucher_key=substring(upper(p_voucher) from 4))
 order by h.importado_em desc limit 1));
$$;
revoke all on function liquida_private.triagem_codigo_esperado(text) from public,anon,authenticated;

-- HTTP assíncrono: o nonce só existe no schema privado e é validado pelo worker.
create or replace function liquida_private.triagem_divergencia_disparar() returns void
language plpgsql security definer set search_path=public,liquida_private,net as $$
declare q record;
begin
 if not exists(select 1 from liquida_private.triagem_divergencia_config where cardinality(destinatarios)>0) then return; end if;
 for q in select * from liquida_private.triagem_divergencia_email where enviado_em is null
 and tentativas<8 and (estado='pendente' or (estado in ('erro','enviando') and atualizado_em<now()-interval '5 minutes')) limit 30 for update skip locked loop
  perform net.http_post(url:='https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/email-divergencia-imei',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('caso_id',q.caso_id,'token',q.token),timeout_milliseconds:=10000);
 end loop;
end;
$$;
revoke all on function liquida_private.triagem_divergencia_disparar() from public,anon,authenticated;

create or replace function public.assurant_triagem_identificar(p_voucher text,p_imei1 text,p_imei2 text,p_modelo text,p_sku text default null)
returns jsonb language plpgsql security definer set search_path=public,liquida_private as $$
declare v text:=upper(trim(p_voucher)); a text:=trim(p_imei1); b text:=nullif(trim(p_imei2),'');
 tipo text:=liquida_private.triagem_tipo(p_modelo); esperado text; t public.assurant_triagem%rowtype; c public.assurant_divergencias_imei%rowtype;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional.' using errcode='42501'; end if;
 if coalesce(v,'')='' or coalesce(trim(p_modelo),'')='' then raise exception 'Voucher e modelo obrigatórios.'; end if;
 perform liquida_private.triagem_validar_codigos(tipo,a,b);
 perform pg_advisory_xact_lock(hashtextextended(v,0));
 select * into t from public.assurant_triagem where voucher=v for update;
 select * into c from public.assurant_divergencias_imei where voucher=v and status='pendente';
 if found then return jsonb_build_object('ok',true,'confere',false,'divergencia',true,'caso_id',c.id,'voucher',v,'imei1',c.imei1,'imei2',c.imei2,'modelo',c.modelo,'tipo',c.tipo_aparelho); end if;
 esperado:=liquida_private.triagem_codigo_esperado(v);
 if t.devolucao_id is not null then
  select case when d.definicao_assurant_status='autorizado' then d.imei_recebido else d.imei_vendido end into esperado from public.devolucoes_b2c d where d.id=t.devolucao_id;
 end if;
 if esperado is null or upper(esperado)=upper(a) or upper(esperado)=upper(coalesce(b,''))
 or exists(select 1 from public.assurant_divergencias_imei d where d.voucher=v and d.status='autorizado' and d.imei1=a and coalesce(d.imei2,'')=coalesce(b,'')) then
  return jsonb_build_object('ok',true,'confere',true,'semBase',esperado is null,'imei_canonico',case when upper(esperado)=upper(coalesce(b,'')) then b else a end,'tipo',tipo);
 end if;
 if t.id is not null and (t.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=t.imei and w.status='confirmado')) then
  raise exception 'Aparelho já armazenado. Regularize o vínculo físico antes de segregar uma nova identificação.';
 end if;
 insert into public.assurant_divergencias_imei(voucher,triagem_id,tipo_aparelho,imei_esperado,imei1,imei2,modelo,sku,criado_por)
 values(v,t.id,tipo,esperado,a,b,p_modelo,p_sku,auth.uid()) returning * into c;
 insert into public.assurant_triagem(voucher,imei,imei2,tipo_aparelho,modelo,sku,status_atual,origem_triagem,atualizado_em)
 values(v,a,b,tipo,p_modelo,p_sku,'Aguardando definição Assurant - IMEI divergente','liquida',timezone('UTC',now()))
 on conflict(voucher) do update set status_atual=excluded.status_atual,atualizado_em=excluded.atualizado_em;
 update public.assurant_divergencias_imei set triagem_id=(select id from public.assurant_triagem where voucher=v) where id=c.id;
 insert into liquida_private.triagem_divergencia_email(caso_id) values(c.id);
 perform liquida_private.triagem_divergencia_disparar();
 return jsonb_build_object('ok',true,'confere',false,'divergencia',true,'caso_id',c.id,'voucher',v,'imei1',a,'imei2',b,'modelo',p_modelo,'tipo',tipo);
end;
$$;
revoke all on function public.assurant_triagem_identificar(text,text,text,text,text) from public,anon;
grant execute on function public.assurant_triagem_identificar(text,text,text,text,text) to authenticated;

-- Impede concluir funcional ou mover equipamento segregado por gravação direta.
create or replace function liquida_private.triagem_identificacao_guard() returns trigger
language plpgsql security definer set search_path=public,liquida_private as $$
declare j jsonb; a text; b text; tipo text; esperado text;
begin
 if exists(select 1 from public.assurant_divergencias_imei d where d.voucher=new.voucher and d.status in('pendente','devolver'))
 and new.status_atual not in('Aguardando definição Assurant - IMEI divergente','Segregado - devolução à origem') then
  raise exception 'IMEI divergente: aparelho segregado aguardando diretriz da Assurant.';
 end if;
 if new.origem_triagem not in ('liquida','devolucao_b2c') or new.data_funcional is null then return new; end if;
 if tg_op='UPDATE' and new.data_funcional is not distinct from old.data_funcional and new.respostas_funcional is not distinct from old.respostas_funcional then return new; end if;
 begin j:=new.respostas_funcional::jsonb; exception when others then raise exception 'Identificação física obrigatória na triagem funcional.'; end;
 a:=nullif(trim(j->'identificacao'->>'imei1'),''); b:=nullif(trim(j->'identificacao'->>'imei2'),'');
 tipo:=liquida_private.triagem_tipo(coalesce(j->'produto'->>'modelo',new.modelo));
 perform liquida_private.triagem_validar_codigos(tipo,a,b);
 esperado:=liquida_private.triagem_codigo_esperado(new.voucher);
 if new.devolucao_id is not null then
  select case when definicao_assurant_status='autorizado' then imei_recebido else imei_vendido end into esperado from public.devolucoes_b2c where id=new.devolucao_id;
 end if;
 if esperado is not null and upper(esperado)<>upper(a) and upper(esperado)<>upper(coalesce(b,''))
 and not exists(select 1 from public.assurant_divergencias_imei d where d.voucher=new.voucher and d.status='autorizado' and d.imei1=a and coalesce(d.imei2,'')=coalesce(b,'')) then
  raise exception 'Identificação divergente do contrato. Segregue o aparelho para decisão da Assurant.';
 end if;
 if new.imei is distinct from a and new.imei is distinct from b then raise exception 'IMEI principal deve corresponder a uma das bipagens.'; end if;
 new.imei2:=case when new.imei=b then a else b end; new.tipo_aparelho:=tipo;
 return new;
end;
$$;
revoke all on function liquida_private.triagem_identificacao_guard() from public,anon,authenticated;
create trigger zz_triagem_identificacao_guard before insert or update on public.assurant_triagem for each row execute function liquida_private.triagem_identificacao_guard();

create or replace function public.assurant_divergencias_listar() returns jsonb
language plpgsql security definer set search_path=public,liquida_private as $$
begin
 if not public.assurant_divergencias_pode_decidir() then raise exception 'Acesso restrito à decisão Assurant.' using errcode='42501'; end if;
 return jsonb_build_object('casos',coalesce((select jsonb_agg(x order by x.criado_em desc) from (
 select d.*,e.estado email_status,e.enviado_em email_enviado_em,e.erro email_erro from public.assurant_divergencias_imei d left join liquida_private.triagem_divergencia_email e on e.caso_id=d.id order by d.criado_em desc limit 1000) x),'[]'::jsonb),
 'destinatarios',(select to_jsonb(destinatarios) from liquida_private.triagem_divergencia_config where id));
end;
$$;
revoke all on function public.assurant_divergencias_listar() from public,anon;
grant execute on function public.assurant_divergencias_listar() to authenticated;

create or replace function public.assurant_divergencias_decidir(p_caso uuid,p_decisao text,p_diretriz text) returns jsonb
language plpgsql security definer set search_path=public,liquida_private as $$
declare c public.assurant_divergencias_imei%rowtype;
begin
 if not public.assurant_divergencias_pode_decidir() then raise exception 'Acesso restrito à decisão Assurant.' using errcode='42501'; end if;
 if p_decisao not in ('autorizado','devolver') or length(trim(coalesce(p_diretriz,'')))<5 then raise exception 'Informe a decisão e uma diretriz com pelo menos 5 caracteres.'; end if;
 select * into c from public.assurant_divergencias_imei where id=p_caso for update;
 if c.id is null or c.status<>'pendente' then raise exception 'Caso inexistente ou já decidido. Atualize a tela.'; end if;
 update public.assurant_divergencias_imei set status=p_decisao,diretriz=trim(p_diretriz),decidido_por=auth.uid(),decidido_em=now() where id=p_caso;
 update public.assurant_triagem set status_atual=case when p_decisao='autorizado' then 'Aguardando triagem funcional' else 'Segregado - devolução à origem' end,
 atualizado_em=timezone('UTC',now()) where id=c.triagem_id;
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.assurant_divergencias_decidir(uuid,text,text) from public,anon;
grant execute on function public.assurant_divergencias_decidir(uuid,text,text) to authenticated;

create or replace function public.assurant_divergencias_configurar(p_destinatarios text[]) returns jsonb
language plpgsql security definer set search_path=public,liquida_private as $$
declare e text;
begin
 if not public.assurant_divergencias_pode_decidir() then raise exception 'Sem permissão.' using errcode='42501'; end if;
 if cardinality(p_destinatarios)>30 then raise exception 'Máximo de 30 destinatários.'; end if;
 foreach e in array coalesce(p_destinatarios,'{}') loop
  if e !~* '^[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}$' then raise exception 'E-mail inválido: %',e; end if;
 end loop;
 update liquida_private.triagem_divergencia_config set destinatarios=array(select distinct lower(trim(x)) from unnest(coalesce(p_destinatarios,'{}')) x),atualizado_por=auth.uid(),atualizado_em=now() where id;
 perform liquida_private.triagem_divergencia_disparar();
 return jsonb_build_object('ok',true);
end;
$$;
revoke all on function public.assurant_divergencias_configurar(text[]) from public,anon;
grant execute on function public.assurant_divergencias_configurar(text[]) to authenticated;

-- Worker com service_role: nonce privado, claim atômico e registro do resultado.
create or replace function public.assurant_divergencia_email_claim(p_caso uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,liquida_private as $$
declare q liquida_private.triagem_divergencia_email%rowtype; ds text[];
begin
 select * into q from liquida_private.triagem_divergencia_email where caso_id=p_caso and token=p_token for update;
 if q.caso_id is null or q.enviado_em is not null or (q.estado='enviando' and q.atualizado_em>now()-interval '5 minutes') then return null; end if;
 select destinatarios into ds from liquida_private.triagem_divergencia_config where id;
 if coalesce(cardinality(ds),0)=0 then return null; end if;
 update liquida_private.triagem_divergencia_email set estado='enviando',tentativas=tentativas+1,atualizado_em=now() where caso_id=p_caso;
 return jsonb_build_object('caso',(select to_jsonb(d) from public.assurant_divergencias_imei d where id=p_caso),'destinatarios',ds);
end;
$$;
revoke all on function public.assurant_divergencia_email_claim(uuid,uuid) from public,anon,authenticated;
grant execute on function public.assurant_divergencia_email_claim(uuid,uuid) to service_role;
create or replace function public.assurant_divergencia_email_finalizar(p_caso uuid,p_token uuid,p_erro text default null) returns void
language sql security definer set search_path=liquida_private as $$
 update liquida_private.triagem_divergencia_email set estado=case when p_erro is null then 'enviado' else 'erro' end,
 enviado_em=case when p_erro is null then now() else null end,erro=left(p_erro,500),atualizado_em=now() where caso_id=p_caso and token=p_token;
$$;
revoke all on function public.assurant_divergencia_email_finalizar(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.assurant_divergencia_email_finalizar(uuid,uuid,text) to service_role;

-- A mesma equipe Assurant já autorizada a definir pedidos passa a decidir divergências.
update public.user_profiles set telas_permitidas=array_append(telas_permitidas,'/v2/assurant/triagens/divergencias-imei')
where lower(email) like '%@assurant.com' and '/v2/assurant/b2c/definicao-assurant'=any(telas_permitidas)
and not ('/v2/assurant/triagens/divergencias-imei'=any(telas_permitidas));
select cron.schedule('triagem-divergencia-email','*/5 * * * *','select liquida_private.triagem_divergencia_disparar()');
