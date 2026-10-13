-- Allow an authorized closing operator to archive only a missing historical PDF.
-- This creates no public bucket and grants no anonymous table/storage access.
create policy fechamento_laudo_reemissao_insert on storage.objects
for insert to authenticated with check (
 bucket_id='triagem-laudos'
 and exists(select 1 from public.user_profiles u where u.id=auth.uid()
  and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[])))
 and exists(select 1 from public.triagem_laudos l where nullif(l.pdf_path,'') is null
  and name=auth.uid()::text||'/reemissoes/'||l.id::text||'.pdf')
);
create or replace function liquida_private.fechamento_laudo_arquivar(p_laudo_id uuid)
returns text language plpgsql security definer set search_path=pg_catalog as $$
declare v_path text; v_pdf text;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid()
  and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501';
 end if;
 select nullif(pdf_path,'') into v_pdf from public.triagem_laudos where id=p_laudo_id for update;
 if not found then raise exception 'Laudo não encontrado'; end if;
 if v_pdf is not null then return v_pdf; end if;
 v_path=auth.uid()::text||'/reemissoes/'||p_laudo_id::text||'.pdf';
 if not exists(select 1 from storage.objects o where o.bucket_id='triagem-laudos'
  and o.name=v_path and o.metadata->>'mimetype'='application/pdf') then
  raise exception 'PDF não arquivado para este laudo';
 end if;
 update public.triagem_laudos set pdf_path=v_path where id=p_laudo_id;
 return v_path;
end $$;
revoke all on function liquida_private.fechamento_laudo_arquivar(uuid) from public,anon;
grant execute on function liquida_private.fechamento_laudo_arquivar(uuid) to authenticated;
create or replace function public.assurant_fechamento_laudo_arquivar(p_laudo_id uuid)
returns text language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.fechamento_laudo_arquivar(p_laudo_id);
$$;
revoke all on function public.assurant_fechamento_laudo_arquivar(uuid) from public,anon;
grant execute on function public.assurant_fechamento_laudo_arquivar(uuid) to authenticated;
