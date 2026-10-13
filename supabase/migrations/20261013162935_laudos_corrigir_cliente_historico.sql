create table liquida_private.laudos_cliente_jobs (
 id uuid primary key default gen_random_uuid(),token text not null default encode(extensions.gen_random_bytes(32),'hex'),
 criado_em timestamptz not null default now(),expires_at timestamptz not null default now()+interval '2 hours',
 ativo boolean not null default true
);
create table liquida_private.laudos_cliente_reparos (
 job_id uuid not null references liquida_private.laudos_cliente_jobs(id),laudo_id uuid not null references public.triagem_laudos(id),
 voucher text not null,cliente text not null,pdf_original text,dados jsonb not null,
 status text not null default 'pendente' check(status in ('pendente','corrigido','ja_identificado','erro')),
 pdf_corrigido text,verificacao jsonb,atualizado_em timestamptz,
 primary key(job_id,laudo_id)
);
alter table liquida_private.laudos_cliente_jobs enable row level security;
alter table liquida_private.laudos_cliente_reparos enable row level security;
revoke all on liquida_private.laudos_cliente_jobs,liquida_private.laudos_cliente_reparos from public,anon,authenticated;
grant usage on schema liquida_private to service_role;
create or replace function liquida_private.laudos_cliente_job(p_token text,p_limite int default 8)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare v_job uuid; v jsonb;
begin
 select id into v_job from liquida_private.laudos_cliente_jobs where token=p_token and ativo and expires_at>now();
 if v_job is null then raise exception 'Não autorizado' using errcode='42501'; end if;
 select jsonb_build_object('job_id',v_job,'itens',coalesce((select jsonb_agg(to_jsonb(i)) from
  (select laudo_id,voucher,cliente,pdf_original,dados from liquida_private.laudos_cliente_reparos
   where job_id=v_job and status='pendente' order by (pdf_original is null),laudo_id limit least(greatest(p_limite,1),8)) i),'[]'::jsonb)) into v;
 return v;
end $$;
create or replace function public.laudos_cliente_job(p_token text,p_limite int default 8)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select liquida_private.laudos_cliente_job(p_token,p_limite); $$;
revoke all on function liquida_private.laudos_cliente_job(text,int),public.laudos_cliente_job(text,int) from public,anon,authenticated;
grant execute on function liquida_private.laudos_cliente_job(text,int),public.laudos_cliente_job(text,int) to service_role;
create or replace function liquida_private.laudos_cliente_finalizar(p_token text,p_laudo_id uuid,p_status text,p_path text,p_info jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare v_job uuid; v_original text; v_atual text;
begin
 select id into v_job from liquida_private.laudos_cliente_jobs where token=p_token and ativo and expires_at>now();
 if v_job is null then raise exception 'Não autorizado' using errcode='42501'; end if;
 if p_status not in ('corrigido','ja_identificado','erro') then raise exception 'Status inválido'; end if;
 select pdf_original into v_original from liquida_private.laudos_cliente_reparos
  where job_id=v_job and laudo_id=p_laudo_id and status='pendente' for update;
 if not found then raise exception 'Laudo fora do lote autorizado'; end if;
 if p_status='corrigido' then
  if p_path <> 'retificacoes/clientes/'||v_job::text||'/'||p_laudo_id::text||'.pdf' then raise exception 'Caminho inválido'; end if;
  if not exists(select 1 from storage.objects where bucket_id='triagem-laudos' and name=p_path and metadata->>'mimetype'='application/pdf') then raise exception 'PDF não arquivado'; end if;
  select pdf_path into v_atual from public.triagem_laudos where id=p_laudo_id for update;
  if v_atual is distinct from v_original then raise exception 'O laudo mudou durante a correção'; end if;
  update public.triagem_laudos set pdf_path=p_path where id=p_laudo_id;
 end if;
 update liquida_private.laudos_cliente_reparos set status=p_status,pdf_corrigido=p_path,verificacao=p_info,atualizado_em=now()
  where job_id=v_job and laudo_id=p_laudo_id;
end $$;
create or replace function public.laudos_cliente_finalizar(p_token text,p_laudo_id uuid,p_status text,p_path text,p_info jsonb)
returns void language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.laudos_cliente_finalizar(p_token,p_laudo_id,p_status,p_path,p_info);
$$;
revoke all on function liquida_private.laudos_cliente_finalizar(text,uuid,text,text,jsonb),public.laudos_cliente_finalizar(text,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function liquida_private.laudos_cliente_finalizar(text,uuid,text,text,jsonb),public.laudos_cliente_finalizar(text,uuid,text,text,jsonb) to service_role;
