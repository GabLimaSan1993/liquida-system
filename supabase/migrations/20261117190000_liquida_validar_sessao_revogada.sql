-- Validação central de sessão para desconexão forçada, com checagem
-- de auth.sessions e autorização somente ao usuário autenticado.
CREATE OR REPLACE FUNCTION public.liquida_sessao_autorizada()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'auth', 'public'
AS $function$
declare
 v_uid uuid:=auth.uid();
 v_session_claim text:=auth.jwt()->>'session_id';
begin
 if v_uid is null or v_session_claim is null
 or v_session_claim !~* '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
 then return false; end if;
 return exists(
  select 1 from auth.sessions s
  where s.id=v_session_claim::uuid
    and s.user_id=v_uid
    and (s.not_after is null or s.not_after>now())
 );
end;
$function$;
REVOKE ALL ON FUNCTION public.liquida_sessao_autorizada() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.liquida_sessao_autorizada() TO authenticated;
