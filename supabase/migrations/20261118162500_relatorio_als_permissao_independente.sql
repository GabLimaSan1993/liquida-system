-- Autorizar "Recebimento ALS · Etapas" por sua permissão independente.
-- As concessões de acesso a usuários são administradas em user_profiles.
do $patch$
declare f text;
      old text := $old$or '/v2/assurant/gestao/relatorio-estoque'=any(coalesce(u.telas_permitidas,'{}'::text[]))$old$;
      novo text := $new$or '/v2/assurant/gestao/relatorio-als'=any(coalesce(u.telas_permitidas,'{}'::text[]))
       or '/v2/assurant/gestao/relatorio-estoque'=any(coalesce(u.telas_permitidas,'{}'::text[]))$new$;
begin
  select pg_get_functiondef('public.assurant_relatorio_als_fluxo(date,date)'::regprocedure) into f;
  if f is null then raise exception 'RPC de Recebimento ALS ausente'; end if;
  if strpos(f,novo)>0 then return; end if;
  if strpos(f,old)=0 then raise exception 'Trecho esperado de autorização não encontrado'; end if;
  execute replace(f,old,novo);
end
$patch$;