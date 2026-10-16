-- A família Samsung J volta à validação padrão de dois IMEIs.
create or replace function liquida_private.triagem_exige_dois_imeis(p_modelo text,p_bloqueado boolean default false) returns boolean
language sql stable security definer set search_path=public,liquida_private as $$
 select not coalesce(p_bloqueado,false) and liquida_private.triagem_tipo(p_modelo)='CELULAR'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])IPHONE[[:space:]]*[567](S|C)?([^A-Z0-9]|$|PLUS)'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])(MOTO(ROLA)?[[:space:]]+)?ONE[[:space:]]+(MICRO|MACRO)([^A-Z0-9]|$)';
$$;
revoke all on function liquida_private.triagem_exige_dois_imeis(text,boolean) from public,anon,authenticated;

-- Retorno para nova conferência encerra a pendência anterior sem autorizar
-- o par divergente. O caso e seu aviso permanecem no histórico.
alter table public.assurant_divergencias_imei drop constraint assurant_divergencias_imei_status_check;
alter table public.assurant_divergencias_imei add constraint assurant_divergencias_imei_status_check
 check(status in ('pendente','autorizado','devolver','reconferencia'));
