-- Trade-in deve ser importado integralmente, mesmo quando o voucher está
-- segregado na Assurant. A sincronização para triagem fica bloqueada APENAS
-- para divergências ativas; os dados e as versões do Trade-in são preservados.
-- Não modifica endereços, status da triagem ou alocações do WMS.
create or replace function liquida_private.tradein_pode_sincronizar_triagem(p_voucher text)
returns boolean
language sql stable security definer
set search_path to 'pg_catalog','public'
as $$
  select not exists (
    select 1 from public.assurant_divergencias_imei d
    where d.voucher = p_voucher
      and d.status in ('pendente','devolver')
  );
$$;
revoke all on function liquida_private.tradein_pode_sincronizar_triagem(text) from public, anon;
grant execute on function liquida_private.tradein_pode_sincronizar_triagem(text) to authenticated;

do $migracao$
declare
 v_ddl text;
 v_novo text;
begin
 select pg_get_triggerdef(t.oid)
 into v_ddl
 from pg_trigger t
 where t.tgrelid='public.tradein_geral'::regclass
   and t.tgname='trg_sem_ordem_auto_geral'
   and not t.tgisinternal;

 if v_ddl is null then
   raise exception 'Trigger de sincronização do Trade-in não encontrado.';
 end if;

 -- Não substituir silenciosamente condições preexistentes.
 if v_ddl ilike '% WHEN (%' then
   raise exception 'Trigger já possui condição WHEN: revisar antes de migrar.';
 end if;

 v_novo := replace(
   v_ddl,
   ' EXECUTE FUNCTION',
   ' WHEN (liquida_private.tradein_pode_sincronizar_triagem(''YBV''::text || NEW.voucher::text)) EXECUTE FUNCTION'
 );
 if v_novo = v_ddl then
   raise exception 'Definição de trigger inesperada: %', v_ddl;
 end if;

 execute 'drop trigger trg_sem_ordem_auto_geral on public.tradein_geral';
 execute v_novo;
end
$migracao$;
