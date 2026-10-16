-- A situação corrente continua em tradein_geral. Versões são apenas anexadas
-- em tabelas privadas; nenhuma carga apaga vouchers ausentes ou o histórico legado.
create table liquida_private.tradein_importacoes (
 id uuid primary key,
 arquivo text not null check(length(arquivo) between 1 and 255),
 criado_por uuid not null,
 criado_por_nome text,
 iniciado_em timestamptz not null default now(),
 atualizado_em timestamptz not null default now(),
 concluido_em timestamptz,
 total_vouchers integer not null check(total_vouchers between 1 and 1000000),
 gravados integer not null default 0 check(gravados>=0 and gravados<=total_vouchers),
 metadados jsonb not null default '{}'::jsonb
);
create table liquida_private.tradein_importacao_blocos (
 importacao_id uuid not null references liquida_private.tradein_importacoes(id),
 numero integer not null check(numero>0),
 conteudo_hash text not null,
 gravados integer not null,
 primary key(importacao_id,numero)
);
create table liquida_private.tradein_versoes (
 id bigint generated always as identity primary key,
 voucher text not null,
 fonte text not null check(fonte in ('tradein_geral','tradein_historico')),
 evento text not null check(evento in ('estado_anterior','importado','inserido','atualizado','excluido')),
 registrado_em timestamptz not null default clock_timestamp(),
 importacao_id uuid references liquida_private.tradein_importacoes(id),
 arquivo text,
 usuario_id uuid,
 usuario_nome text,
 dados jsonb not null
);
create index tradein_versoes_voucher_idx on liquida_private.tradein_versoes(voucher,id desc);
create index tradein_versoes_importacao_idx on liquida_private.tradein_versoes(importacao_id);
alter table liquida_private.tradein_importacoes enable row level security;
alter table liquida_private.tradein_importacao_blocos enable row level security;
alter table liquida_private.tradein_versoes enable row level security;
revoke all on liquida_private.tradein_importacoes,liquida_private.tradein_importacao_blocos,liquida_private.tradein_versoes from public,anon,authenticated;

create function liquida_private.tradein_pode_importar() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and exists(select 1 from public.user_profiles u where u.id=auth.uid()
 and (u.is_master or '/upload'=any(coalesce(u.telas_permitidas,'{}'::text[]))
 or '/v2/assurant/uploads'=any(coalesce(u.telas_permitidas,'{}'::text[]))));
$$;
revoke all on function liquida_private.tradein_pode_importar() from public,anon,authenticated;

create function liquida_private.tradein_capturar_versao() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare j jsonb; a jsonb; v text; ator uuid:=auth.uid(); nome text; imp uuid; arq text;
begin
 j:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 v:=public.tradein_voucher_key(coalesce(j->>'voucher',j->>'voucher_original'));
 if v is null then return null; end if;
 imp:=nullif(current_setting('liquida.tradein_importacao',true),'')::uuid;
 if imp is not null then
  select arquivo into arq from liquida_private.tradein_importacoes where id=imp and criado_por=ator;
  if not found then raise exception 'Contexto de importação inválido'; end if;
 else
  arq:=j->>'source_file';
 end if;
 select coalesce(nullif(trim(u.nome),''),u.email) into nome from public.user_profiles u where u.id=ator;
 if tg_op='UPDATE' and not exists(select 1 from liquida_private.tradein_versoes h where h.voucher=v and h.fonte=tg_table_name) then
  a:=to_jsonb(old);
  insert into liquida_private.tradein_versoes(voucher,fonte,evento,arquivo,usuario_id,usuario_nome,dados)
  values(v,tg_table_name,'estado_anterior',a->>'source_file',nullif(a->>'importado_por','')::uuid,
   (select coalesce(nullif(trim(u.nome),''),u.email) from public.user_profiles u where u.id=nullif(a->>'importado_por','')::uuid),a);
 end if;
 insert into liquida_private.tradein_versoes(voucher,fonte,evento,importacao_id,arquivo,usuario_id,usuario_nome,dados)
 values(v,tg_table_name,case when tg_op='DELETE' then 'excluido' when imp is not null then 'importado'
  when tg_op='INSERT' then 'inserido' else 'atualizado' end,imp,arq,ator,nome,j);
 return null;
end;
$$;
revoke all on function liquida_private.tradein_capturar_versao() from public,anon,authenticated;
create trigger tradein_guardar_versao after insert or update or delete on public.tradein_geral
 for each row execute function liquida_private.tradein_capturar_versao();
create trigger tradein_guardar_versao after insert or update or delete on public.tradein_historico
 for each row execute function liquida_private.tradein_capturar_versao();

create function liquida_private.tradein_importar_bloco(p_importacao uuid,p_arquivo text,p_total integer,p_bloco integer,p_registros jsonb,p_metadados jsonb default '{}'::jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare carga liquida_private.tradein_importacoes%rowtype; anterior_hash text; h text; qtd integer; payload jsonb; colunas text; atualizacoes text; contexto text;
begin
 if not liquida_private.tradein_pode_importar() then raise exception 'Sem permissão para importar Trade-in' using errcode='42501'; end if;
 if p_importacao is null or nullif(trim(p_arquivo),'') is null or length(p_arquivo)>255 or p_total is null or p_total not between 1 and 1000000
 or p_bloco is null or p_bloco not between 1 and ceil(p_total/500.0)::integer then raise exception 'Identificação da carga inválida'; end if;
 if jsonb_typeof(p_registros) is distinct from 'array' then raise exception 'Registros devem ser uma lista'; end if;
 qtd:=jsonb_array_length(p_registros);
 if qtd<>least(500,p_total-(p_bloco-1)*500) then raise exception 'Quantidade de registros do bloco inválida'; end if;
 if exists(select 1 from jsonb_array_elements(p_registros) r where jsonb_typeof(r)<>'object'
  or coalesce(r->>'voucher','') !~ '^[0-9]{1,9}$' or (r->>'voucher')::integer<=0) then raise exception 'Voucher numérico inválido'; end if;
 if (select count(distinct (r->>'voucher')::integer) from jsonb_array_elements(p_registros) r)<>qtd then raise exception 'Voucher duplicado no bloco'; end if;
 if exists(select 1 from jsonb_array_elements(p_registros) r cross join lateral jsonb_object_keys(r) k
  where not exists(select 1 from pg_attribute a where a.attrelid='public.tradein_geral'::regclass and a.attname=k
   and a.attnum>0 and not a.attisdropped and a.attgenerated='' and a.attname not in ('importado_em','importado_por'))) then
  raise exception 'Campo não permitido na importação';
 end if;
 -- Serializa blocos de cargas concorrentes antes de combinar campos ausentes.
 perform pg_advisory_xact_lock(hashtextextended('tradein_importacao_blocos',0));
 insert into liquida_private.tradein_importacoes(id,arquivo,criado_por,criado_por_nome,total_vouchers,metadados)
 values(p_importacao,p_arquivo,auth.uid(),(select coalesce(nullif(trim(u.nome),''),u.email) from public.user_profiles u where u.id=auth.uid()),p_total,coalesce(p_metadados,'{}'))
 on conflict(id) do nothing;
 select * into carga from liquida_private.tradein_importacoes where id=p_importacao for update;
 if carga.criado_por<>auth.uid() or carga.arquivo<>p_arquivo or carga.total_vouchers<>p_total or carga.metadados<>coalesce(p_metadados,'{}') then
  raise exception 'Carga pertence a outro usuário ou tem metadados diferentes' using errcode='42501'; end if;
 h:=md5(p_registros::text);
 select conteudo_hash into anterior_hash from liquida_private.tradein_importacao_blocos where importacao_id=p_importacao and numero=p_bloco;
 if found then
  if anterior_hash<>h then raise exception 'Bloco já recebido com conteúdo diferente'; end if;
  return jsonb_build_object('gravadas',qtd,'total_gravado',carga.gravados,'concluido',carga.concluido_em is not null,'repetido',true);
 end if;
 if carga.concluido_em is not null then raise exception 'Carga já concluída'; end if;
 if exists(select 1 from jsonb_array_elements(p_registros) r join liquida_private.tradein_versoes v
  on v.importacao_id=p_importacao and v.voucher=r->>'voucher' and v.evento='importado') then raise exception 'Voucher repetido entre blocos'; end if;
 -- Campos ausentes não apagam o cadastro; campos explicitamente vazios o atualizam.
 select jsonb_agg(coalesce(to_jsonb(g),'{}'::jsonb)||r||jsonb_build_object('importado_em',clock_timestamp(),'importado_por',auth.uid())) into payload
 from jsonb_array_elements(p_registros) r left join public.tradein_geral g on g.voucher=(r->>'voucher')::integer;
 select string_agg(format('%I',attname),',' order by attnum),
  string_agg(format('%1$I=excluded.%1$I',attname),',' order by attnum) filter(where attname<>'voucher')
 into colunas,atualizacoes from pg_attribute where attrelid='public.tradein_geral'::regclass and attnum>0 and not attisdropped and attgenerated='';
 contexto:=current_setting('liquida.tradein_importacao',true);
 perform set_config('liquida.tradein_importacao',p_importacao::text,true);
 execute format('insert into public.tradein_geral(%1$s) select %1$s from jsonb_populate_recordset(null::public.tradein_geral,$1) order by voucher on conflict(voucher) do update set %2$s',colunas,atualizacoes) using payload;
 perform set_config('liquida.tradein_importacao',coalesce(contexto,''),true);
 insert into liquida_private.tradein_importacao_blocos(importacao_id,numero,conteudo_hash,gravados) values(p_importacao,p_bloco,h,qtd);
 update liquida_private.tradein_importacoes set gravados=gravados+qtd,atualizado_em=clock_timestamp(),
  concluido_em=case when gravados+qtd=total_vouchers then clock_timestamp() end where id=p_importacao returning * into carga;
 return jsonb_build_object('gravadas',qtd,'total_gravado',carga.gravados,'concluido',carga.concluido_em is not null,'repetido',false);
end;
$$;
revoke all on function liquida_private.tradein_importar_bloco(uuid,text,integer,integer,jsonb,jsonb) from public,anon,authenticated;
grant execute on function liquida_private.tradein_importar_bloco(uuid,text,integer,integer,jsonb,jsonb) to authenticated;
create function public.tradein_importar_bloco(p_importacao uuid,p_arquivo text,p_total integer,p_bloco integer,p_registros jsonb,p_metadados jsonb default '{}'::jsonb) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.tradein_importar_bloco(p_importacao,p_arquivo,p_total,p_bloco,p_registros,p_metadados);
$$;
revoke all on function public.tradein_importar_bloco(uuid,text,integer,integer,jsonb,jsonb) from public,anon;
grant execute on function public.tradein_importar_bloco(uuid,text,integer,integer,jsonb,jsonb) to authenticated;

create function liquida_private.tradein_consultar_versoes(p_voucher text,p_limite integer default 100,p_antes bigint default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
begin
 if not liquida_private.tradein_pode_importar() then raise exception 'Sem permissão para consultar histórico Trade-in' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(v) order by v.id desc) from (
  select * from liquida_private.tradein_versoes where voucher=public.tradein_voucher_key(p_voucher) and (p_antes is null or id<p_antes)
  order by id desc limit greatest(1,least(coalesce(p_limite,100),500))
 ) v),'[]'::jsonb);
end;
$$;
revoke all on function liquida_private.tradein_consultar_versoes(text,integer,bigint) from public,anon,authenticated;
grant execute on function liquida_private.tradein_consultar_versoes(text,integer,bigint) to authenticated;
create function public.tradein_consultar_versoes(p_voucher text,p_limite integer default 100,p_antes bigint default null) returns jsonb
language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.tradein_consultar_versoes(p_voucher,p_limite,p_antes);
$$;
revoke all on function public.tradein_consultar_versoes(text,integer,bigint) from public,anon;
grant execute on function public.tradein_consultar_versoes(text,integer,bigint) to authenticated;
