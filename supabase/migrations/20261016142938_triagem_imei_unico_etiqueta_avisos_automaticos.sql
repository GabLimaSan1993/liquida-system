-- IMEI único auditado e avisos automáticos com destinatários e cópias definidos.
alter table public.assurant_triagem add column if not exists aparelho_bloqueado boolean not null default false;
alter table public.assurant_divergencias_imei add column if not exists aparelho_bloqueado boolean not null default false;
alter table public.assurant_divergencias_imei add column if not exists criado_por_nome text;
alter table liquida_private.triagem_divergencia_config add column if not exists copias text[] not null default '{}';
update public.assurant_divergencias_imei d set criado_por_nome=coalesce(nullif(trim(u.nome),''),u.email)
from public.user_profiles u where u.id=d.criado_por and d.criado_por_nome is null;

create or replace function liquida_private.triagem_exige_dois_imeis(p_modelo text,p_bloqueado boolean default false) returns boolean
language sql stable security definer set search_path=public,liquida_private as $$
 select not coalesce(p_bloqueado,false) and liquida_private.triagem_tipo(p_modelo)='CELULAR'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])IPHONE[[:space:]]*[56](S|C)?([^A-Z0-9]|$|PLUS)'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])(GALAXY[[:space:]]*)?J[[:space:]]*[0-9]';
$$;
revoke all on function liquida_private.triagem_exige_dois_imeis(text,boolean) from public,anon,authenticated;

create or replace function liquida_private.triagem_validar_identificacao(p_modelo text,p_imei1 text,p_imei2 text,p_bloqueado boolean default false) returns void
language plpgsql security definer set search_path=public,liquida_private as $$
begin
 if liquida_private.triagem_tipo(p_modelo)='CELULAR' and not liquida_private.triagem_exige_dois_imeis(p_modelo,p_bloqueado) then
  if coalesce(p_imei1,'') !~ '^[0-9]{15}$' then raise exception 'O IMEI deve ter exatamente 15 dígitos numéricos.'; end if;
  if p_imei2 is not null and (p_imei2 !~ '^[0-9]{15}$' or p_imei1=p_imei2) then raise exception 'O IMEI 2 deve ter 15 dígitos e ser diferente do IMEI 1.'; end if;
 else
  perform liquida_private.triagem_validar_codigos(liquida_private.triagem_tipo(p_modelo),p_imei1,p_imei2);
 end if;
end;
$$;
revoke all on function liquida_private.triagem_validar_identificacao(text,text,text,boolean) from public,anon,authenticated;

drop function public.assurant_triagem_identificar(text,text,text,text,text);

create or replace function public.assurant_triagem_identificar(p_voucher text,p_imei1 text,p_imei2 text,p_modelo text,p_sku text default null,p_bloqueado boolean default false)
returns jsonb language plpgsql security definer set search_path=public,liquida_private as $$
declare v text:=upper(trim(p_voucher)); a text:=trim(p_imei1); b text:=nullif(trim(p_imei2),'');
 tipo text:=liquida_private.triagem_tipo(p_modelo); esperado text; t public.assurant_triagem%rowtype; c public.assurant_divergencias_imei%rowtype;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional.' using errcode='42501'; end if;
 if coalesce(v,'')='' or coalesce(trim(p_modelo),'')='' then raise exception 'Voucher e modelo obrigatórios.'; end if;
 perform liquida_private.triagem_validar_identificacao(p_modelo,a,b,p_bloqueado);
 perform pg_advisory_xact_lock(hashtextextended(v,0));
 select * into t from public.assurant_triagem where voucher=v for update;
 select * into c from public.assurant_divergencias_imei where voucher=v and status='pendente';
 if found then return jsonb_build_object('ok',true,'confere',false,'divergencia',true,'caso_id',c.id,'voucher',v,'imei1',c.imei1,'imei2',c.imei2,'modelo',c.modelo,'tipo',c.tipo_aparelho,'criado_em',c.criado_em,'criado_por_nome',c.criado_por_nome,'aparelho_bloqueado',c.aparelho_bloqueado); end if;
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
 insert into public.assurant_divergencias_imei(voucher,triagem_id,tipo_aparelho,imei_esperado,imei1,imei2,modelo,sku,criado_por,criado_por_nome,aparelho_bloqueado)
 values(v,t.id,tipo,esperado,a,b,p_modelo,p_sku,auth.uid(),(select coalesce(nullif(trim(nome),''),email) from public.user_profiles where id=auth.uid()),coalesce(p_bloqueado,false)) returning * into c;
 insert into public.assurant_triagem(voucher,imei,imei2,tipo_aparelho,modelo,sku,status_atual,origem_triagem,atualizado_em)
 values(v,a,b,tipo,p_modelo,p_sku,'Aguardando definição Assurant - IMEI divergente','liquida',timezone('UTC',now()))
 on conflict(voucher) do update set status_atual=excluded.status_atual,atualizado_em=excluded.atualizado_em;
 update public.assurant_divergencias_imei set triagem_id=(select id from public.assurant_triagem where voucher=v) where id=c.id;
 insert into liquida_private.triagem_divergencia_email(caso_id) values(c.id);
 perform liquida_private.triagem_divergencia_disparar();
 return jsonb_build_object('ok',true,'confere',false,'divergencia',true,'caso_id',c.id,'voucher',v,'imei1',a,'imei2',b,'modelo',p_modelo,'tipo',tipo,'criado_em',c.criado_em,'criado_por_nome',c.criado_por_nome,'aparelho_bloqueado',c.aparelho_bloqueado);
end;
$$;

revoke all on function public.assurant_triagem_identificar(text,text,text,text,text,boolean) from public,anon;
grant execute on function public.assurant_triagem_identificar(text,text,text,text,text,boolean) to authenticated;

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
 perform liquida_private.triagem_validar_identificacao(coalesce(j->'produto'->>'modelo',new.modelo),a,b,coalesce((j->'identificacao'->>'aparelho_bloqueado')::boolean,false));
 esperado:=liquida_private.triagem_codigo_esperado(new.voucher);
 if new.devolucao_id is not null then
  select case when definicao_assurant_status='autorizado' then imei_recebido else imei_vendido end into esperado from public.devolucoes_b2c where id=new.devolucao_id;
 end if;
 if esperado is not null and upper(esperado)<>upper(a) and upper(esperado)<>upper(coalesce(b,''))
 and not exists(select 1 from public.assurant_divergencias_imei d where d.voucher=new.voucher and d.status='autorizado' and d.imei1=a and coalesce(d.imei2,'')=coalesce(b,'')) then
  raise exception 'Identificação divergente do contrato. Segregue o aparelho para decisão da Assurant.';
 end if;
 if new.imei is distinct from a and new.imei is distinct from b then raise exception 'IMEI principal deve corresponder a uma das bipagens.'; end if;
 new.imei2:=case when new.imei=b then a else b end; new.tipo_aparelho:=tipo; new.aparelho_bloqueado:=coalesce((j->'identificacao'->>'aparelho_bloqueado')::boolean,false);
 return new;
end;
$$;

create or replace function public.assurant_divergencia_email_claim(p_caso uuid,p_token uuid) returns jsonb
language plpgsql security definer set search_path=public,liquida_private as $$
declare q liquida_private.triagem_divergencia_email%rowtype; ds text[]; cs text[];
begin
 select * into q from liquida_private.triagem_divergencia_email where caso_id=p_caso and token=p_token for update;
 if q.caso_id is null or q.enviado_em is not null or (q.estado='enviando' and q.atualizado_em>now()-interval '5 minutes') then return null; end if;
 if not exists(select 1 from public.assurant_divergencias_imei where id=p_caso and status='pendente') then return null; end if;
 select destinatarios,copias into ds,cs from liquida_private.triagem_divergencia_config where id;
 if coalesce(cardinality(ds),0)=0 then return null; end if;
 update liquida_private.triagem_divergencia_email set estado='enviando',tentativas=tentativas+1,atualizado_em=now() where caso_id=p_caso;
 return jsonb_build_object('caso',(select to_jsonb(d) from public.assurant_divergencias_imei d where id=p_caso),'destinatarios',ds,'copias',cs);
end;
$$;

create or replace function liquida_private.triagem_divergencia_disparar() returns void
language plpgsql security definer set search_path=public,liquida_private,net as $$
declare q record;
begin
 if not exists(select 1 from liquida_private.triagem_divergencia_config where cardinality(destinatarios)>0) then return; end if;
 for q in select e.* from liquida_private.triagem_divergencia_email e join public.assurant_divergencias_imei d on d.id=e.caso_id
 where d.status='pendente' and e.enviado_em is null and e.tentativas<8
 and (e.estado='pendente' or (e.estado in ('erro','enviando') and e.atualizado_em<now()-interval '5 minutes')) limit 30 for update of e skip locked loop
  perform net.http_post(url:='https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/email-divergencia-imei',
   headers:='{"Content-Type":"application/json"}'::jsonb,
   body:=jsonb_build_object('caso_id',q.caso_id,'token',q.token),timeout_milliseconds:=10000);
 end loop;
end;
$$;

-- A lista é administrada pelo sistema, sem configuração pela bancada.
revoke all on function public.assurant_divergencias_configurar(text[]) from public,anon,authenticated;
update liquida_private.triagem_divergencia_config set
 destinatarios=array['luiz.affonso@assurant.com','edyelves.bezerra@assurant.com','alex.feliciano@assurant.com'],
 copias=array['jhonatan.nascimento@liquidapreco.com.br','gabriel.lima@liquidapreco.com.br'],
 atualizado_em=now() where id;
notify pgrst, 'reload schema';
