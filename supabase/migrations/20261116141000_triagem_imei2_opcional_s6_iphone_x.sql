-- IMEI 2 opcional para S6, S6 Edge (inclusive Plus) e iPhone X.
-- Preserva a regra anterior para iPhone 5-8 e Motorola One Micro/Macro.
create or replace function liquida_private.triagem_exige_dois_imeis(
  p_modelo text,
  p_bloqueado boolean default false
)
returns boolean
language sql stable security definer
set search_path = public, liquida_private
as $function$
 select not coalesce(p_bloqueado,false)
   and liquida_private.triagem_tipo(p_modelo) = 'CELULAR'
   and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])IPHONE[[:space:]]*[5678](S|C)?([^A-Z0-9]|$|PLUS)'
   and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])(MOTO(ROLA)?[[:space:]]+)?ONE[[:space:]]+(MICRO|MACRO)([^A-Z0-9]|$)'
   and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])IPHONE[[:space:]]*X([^A-Z0-9]|$)'
   and upper(coalesce(p_modelo,'')) !~ '(^|[^A-Z0-9])(SAMSUNG[[:space:]]+)?(GALAXY[[:space:]]+)?S6([[:space:]]+EDGE([[:space:]]+PLUS)?)?([^A-Z0-9]|$)';
$function$;
revoke all on function liquida_private.triagem_exige_dois_imeis(text,boolean) from public,anon,authenticated;
