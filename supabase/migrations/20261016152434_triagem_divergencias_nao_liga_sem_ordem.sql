alter table public.assurant_divergencias_imei add column tipo_problema text not null default 'imei_divergente'
 check(tipo_problema in ('imei_divergente','nao_liga','sem_ordem'));
alter table public.assurant_divergencias_imei add column motivo text;
alter table public.assurant_divergencias_imei add column ordem_snapshot jsonb;
alter table public.assurant_divergencias_imei alter column imei1 drop not null;
alter table public.assurant_divergencias_imei alter column tipo_aparelho drop not null;

create or replace function liquida_private.triagem_ordem_contexto(p_voucher text) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v text:=upper(trim(p_voucher)); num text; g public.tradein_geral%rowtype; h public.tradein_historico%rowtype; d public.devolucoes_b2c%rowtype;
begin
 select dv.* into d from public.devolucoes_b2c dv join public.assurant_triagem t on t.devolucao_id=dv.id where t.voucher=v limit 1;
 if found then return jsonb_build_object('estado',case when d.cancelada_em is not null then 'cancelado' else 'ativo' end,'fonte','devolucao_b2c','voucher',v,'imei',coalesce(d.imei_recebido,d.imei_vendido),'modelo',d.produto_original,'sku',d.sku_original); end if;
 if v ~ '^YBV[0-9]+$' then
  num:=substring(v from 4);
  if length(num)<=10 and num::bigint<=2147483647 then
   select * into g from public.tradein_geral where voucher=num::integer limit 1;
   if found then
    return jsonb_build_object('estado',case when upper(trim(coalesce(g.canceled,''))) in ('SIM','S','TRUE','1','YES') or coalesce(g.status_atual,'') ilike '%cancel%' then 'cancelado' else 'ativo' end,
     'fonte','tradein_geral','voucher',v,'imei',g.imei,'modelo',g.aparelho,'sku',g.sku_base,'status',g.status_atual);
   end if;
  end if;
 end if;
 if num is not null then
  select * into h from public.tradein_historico where voucher_key=num limit 1;
 else
  select * into h from public.tradein_historico where upper(voucher_original)=v order by importado_em desc limit 1;
 end if;
 if found then return jsonb_build_object('estado',case when coalesce(h.cancelado,false) or coalesce(h.status_atual,'') ilike '%cancel%' then 'cancelado' else 'ativo' end,
 'fonte','tradein_historico','voucher',v,'imei',h.imei_serial,'modelo',h.aparelho,'sku',h.sku_original,'status',h.status_atual); end if;
 return jsonb_build_object('estado','ausente','fonte',null,'voucher',v);
end;
$$;
revoke all on function liquida_private.triagem_ordem_contexto(text) from public,anon,authenticated;

create or replace function liquida_private.triagem_sem_ordem_autorizado(p_voucher text,p_estado text) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.assurant_divergencias_imei c where c.voucher=p_voucher and c.tipo_problema='sem_ordem'
 and c.status='autorizado' and c.ordem_snapshot->>'estado'=p_estado);
$$;
revoke all on function liquida_private.triagem_sem_ordem_autorizado(text,text) from public,anon,authenticated;

create or replace function liquida_private.triagem_divergencia_retorno(c public.assurant_divergencias_imei) returns jsonb
language sql stable set search_path=pg_catalog as $$
 select (to_jsonb(c)-'imei_esperado'-'ordem_snapshot') || jsonb_build_object('ok',true,'confere',false,'divergencia',true,'caso_id',c.id,'tipo',c.tipo_aparelho);
$$;
revoke all on function liquida_private.triagem_divergencia_retorno(public.assurant_divergencias_imei) from public,anon,authenticated;

create or replace function liquida_private.triagem_registrar_pendencia(p_voucher text,p_tipo text,p_motivo text,p_ordem jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare t public.assurant_triagem%rowtype; c public.assurant_divergencias_imei%rowtype;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional.' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_voucher,0));
 select * into c from public.assurant_divergencias_imei where voucher=p_voucher and status='pendente' for update;
 if found then return liquida_private.triagem_divergencia_retorno(c); end if;
 select * into t from public.assurant_triagem where voucher=p_voucher for update;
 if exists(select 1 from public.assurant_divergencias_imei where voucher=p_voucher and status='devolver') then raise exception 'Aparelho segregado para devolução à origem. Consulte a diretriz da Assurant.'; end if;
 if t.data_alocacao is not null or exists(select 1 from public.wms_alocacoes where imei=t.imei and status='confirmado') then raise exception 'Aparelho já armazenado. Regularize o vínculo físico antes de encaminhar à Assurant.'; end if;
 insert into public.assurant_divergencias_imei(voucher,triagem_id,tipo_problema,tipo_aparelho,imei_esperado,imei1,modelo,sku,motivo,ordem_snapshot,criado_por,criado_por_nome)
 values(p_voucher,t.id,p_tipo,case when coalesce(t.modelo,p_ordem->>'modelo') is not null then liquida_private.triagem_tipo(coalesce(t.modelo,p_ordem->>'modelo')) end,
 p_ordem->>'imei',null,coalesce(t.modelo,p_ordem->>'modelo'),coalesce(t.sku,p_ordem->>'sku'),p_motivo,p_ordem,auth.uid(),
 (select coalesce(nullif(trim(nome),''),email) from public.user_profiles where id=auth.uid())) returning * into c;
 insert into public.assurant_triagem(voucher,imei,modelo,sku,status_atual,origem_triagem,atualizado_em)
 values(p_voucher,coalesce(t.imei,p_ordem->>'imei'),c.modelo,c.sku,'Aguardando definição Assurant - Divergência','liquida',timezone('UTC',now()))
 on conflict(voucher) do update set status_atual=excluded.status_atual,atualizado_em=excluded.atualizado_em;
 update public.assurant_divergencias_imei set triagem_id=(select id from public.assurant_triagem where voucher=p_voucher) where id=c.id;
 insert into liquida_private.triagem_divergencia_email(caso_id) values(c.id);
 perform liquida_private.triagem_divergencia_disparar();
 return liquida_private.triagem_divergencia_retorno(c);
end;
$$;
revoke all on function liquida_private.triagem_registrar_pendencia(text,text,text,jsonb) from public,anon,authenticated;

create or replace function public.assurant_triagem_checar_ordem(p_voucher text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare v text:=upper(trim(coalesce(p_voucher,''))); o jsonb; c public.assurant_divergencias_imei%rowtype;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional.' using errcode='42501'; end if;
 if v !~ '^[A-Z][A-Z0-9_-]{2,63}$' then raise exception 'Informe um voucher válido.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v,0));
 select * into c from public.assurant_divergencias_imei where voucher=v and status='pendente';
 if found then return liquida_private.triagem_divergencia_retorno(c); end if;
 if exists(select 1 from public.assurant_divergencias_imei where voucher=v and status='devolver') then raise exception 'Aparelho segregado para devolução à origem. Consulte a diretriz da Assurant.'; end if;
 o:=liquida_private.triagem_ordem_contexto(v);
 if o->>'estado'<>'ativo' and not liquida_private.triagem_sem_ordem_autorizado(v,o->>'estado') then
  return liquida_private.triagem_registrar_pendencia(v,'sem_ordem',case when o->>'estado'='cancelado' then 'Trade-in cancelado' else 'Trade-in não localizado nas bases atual e histórica' end,o);
 end if;
 return jsonb_build_object('ok',true,'divergencia',false,'ordem_reconhecida',o->>'estado'='ativo','sem_ordem_autorizado',o->>'estado'<>'ativo');
end;
$$;
revoke all on function public.assurant_triagem_checar_ordem(text) from public,anon;
grant execute on function public.assurant_triagem_checar_ordem(text) to authenticated;

create or replace function public.assurant_triagem_nao_liga(p_voucher text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare v text:=upper(trim(p_voucher)); r jsonb;
begin
 r:=public.assurant_triagem_checar_ordem(v);
 if coalesce((r->>'divergencia')::boolean,false) then return r; end if;
 return liquida_private.triagem_registrar_pendencia(v,'nao_liga','Aparelho não liga; não foi possível realizar os testes ou bipar os IMEIs na tela',liquida_private.triagem_ordem_contexto(v));
end;
$$;
revoke all on function public.assurant_triagem_nao_liga(text) from public,anon;
grant execute on function public.assurant_triagem_nao_liga(text) to authenticated;

create or replace function public.assurant_divergencias_decidir(p_caso uuid,p_decisao text,p_diretriz text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare c public.assurant_divergencias_imei%rowtype; destino text;
begin
 if not public.assurant_divergencias_pode_decidir() then raise exception 'Acesso restrito à decisão Assurant.' using errcode='42501'; end if;
 if p_decisao not in ('autorizado','devolver') or length(trim(coalesce(p_diretriz,'')))<5 then raise exception 'Informe a decisão e uma diretriz com pelo menos 5 caracteres.'; end if;
 -- Mesmo lock da bipagem: evita recriar um caso enquanto a decisão está em andamento.
 select voucher into destino from public.assurant_divergencias_imei where id=p_caso;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(destino,''),0));
 select * into c from public.assurant_divergencias_imei where id=p_caso for update;
 if c.id is null or c.status<>'pendente' then raise exception 'Caso inexistente ou já decidido. Atualize a tela.'; end if;
 destino:=case when p_decisao='devolver' then 'Segregado - devolução à origem' when c.tipo_problema='nao_liga' then 'Aguardando laudo' else 'Aguardando triagem funcional' end;
 update public.assurant_divergencias_imei set status=p_decisao,diretriz=trim(p_diretriz),decidido_por=auth.uid(),decidido_em=now() where id=p_caso;
 update public.assurant_triagem set status_atual=destino,atualizado_em=timezone('UTC',now()),
 defeitos_adicionais=case when c.tipo_problema='nao_liga' and p_decisao='autorizado' then concat_ws('; ',nullif(defeitos_adicionais,''),'Aparelho Não Liga') else defeitos_adicionais end,
 resultado_triagem_funcional=case when c.tipo_problema='nao_liga' and p_decisao='autorizado' then 'BAD' else resultado_triagem_funcional end,
 grade=case when c.tipo_problema='nao_liga' and p_decisao='autorizado' then 'QUEBRADO' else grade end
 where id=c.triagem_id;
 return jsonb_build_object('ok',true,'status',destino);
end;
$$;

CREATE OR REPLACE FUNCTION public.assurant_triagem_identificar(p_voucher text, p_imei1 text, p_imei2 text, p_modelo text, p_sku text DEFAULT NULL::text, p_bloqueado boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'liquida_private'
AS $function$
declare v text:=upper(trim(p_voucher)); a text:=trim(p_imei1); b text:=nullif(trim(p_imei2),'');
 tipo text:=liquida_private.triagem_tipo(p_modelo); esperado text; t public.assurant_triagem%rowtype; c public.assurant_divergencias_imei%rowtype; entrada jsonb;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional.' using errcode='42501'; end if;
 if coalesce(v,'')='' or coalesce(trim(p_modelo),'')='' then raise exception 'Voucher e modelo obrigatórios.'; end if;
 entrada:=public.assurant_triagem_checar_ordem(v);
 if coalesce((entrada->>'divergencia')::boolean,false) then return entrada; end if;
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
 return jsonb_build_object('ok',true,'confere',false,'divergencia',true,'caso_id',c.id,'voucher',v,'imei1',a,'imei2',b,'modelo',p_modelo,'tipo',tipo,'tipo_problema','imei_divergente','criado_em',c.criado_em,'criado_por_nome',c.criado_por_nome,'aparelho_bloqueado',c.aparelho_bloqueado);
end;
$function$;

CREATE OR REPLACE FUNCTION liquida_private.triagem_identificacao_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'liquida_private'
AS $function$
declare j jsonb; a text; b text; tipo text; esperado text; ordem jsonb;
begin
 if exists(select 1 from public.assurant_divergencias_imei d where d.voucher=new.voucher and d.status in('pendente','devolver'))
 and new.status_atual not in('Aguardando definição Assurant - IMEI divergente','Aguardando definição Assurant - Divergência','Segregado - devolução à origem') then
  raise exception 'Divergência: aparelho segregado aguardando diretriz da Assurant.';
 end if;
 if new.origem_triagem not in ('liquida','devolucao_b2c') or new.data_funcional is null then return new; end if;
 if tg_op='UPDATE' and new.data_funcional is not distinct from old.data_funcional and new.respostas_funcional is not distinct from old.respostas_funcional then return new; end if;
 ordem:=liquida_private.triagem_ordem_contexto(new.voucher);
 if ordem->>'estado'<>'ativo' and not liquida_private.triagem_sem_ordem_autorizado(new.voucher,ordem->>'estado') then
  raise exception 'Sem Ordem: encaminhe o aparelho para decisão da Assurant antes da triagem funcional.';
 end if;
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
$function$;

notify pgrst, 'reload schema';

