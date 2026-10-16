-- Acrescentar iPhone 7/7 Plus e Moto One Micro/Macro à regra de IMEI único.
create or replace function liquida_private.triagem_exige_dois_imeis(p_modelo text,p_bloqueado boolean default false) returns boolean
language sql stable security definer set search_path=public,liquida_private as $$
 select not coalesce(p_bloqueado,false) and liquida_private.triagem_tipo(p_modelo)='CELULAR'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])IPHONE[[:space:]]*[567](S|C)?([^A-Z0-9]|$|PLUS)'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])(GALAXY[[:space:]]*)?J[[:space:]]*[0-9]'
 and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])(MOTO(ROLA)?[[:space:]]+)?ONE[[:space:]]+(MICRO|MACRO)([^A-Z0-9]|$)';
$$;
revoke all on function liquida_private.triagem_exige_dois_imeis(text,boolean) from public,anon,authenticated;

