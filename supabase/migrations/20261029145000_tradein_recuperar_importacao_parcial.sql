-- Retomada segura da mesma carga, vinculada ao usuário e metadados da planilha.
-- Não modifica registros: identifica a importação parcial para reusar o mesmo UUID.
create or replace function public.tradein_recuperar_importacao(
  p_arquivo text,
  p_total integer,
  p_metadados jsonb
) returns jsonb
language plpgsql stable security definer
set search_path to 'pg_catalog','public','liquida_private'
as $func$
declare c liquida_private.tradein_importacoes%rowtype;
begin
 if not liquida_private.tradein_pode_importar() then
    raise exception 'Sem permissão para importar Trade-in' using errcode='42501';
 end if;
 if nullif(btrim(p_arquivo),'') is null or p_total is null or p_total<1 or p_metadados is null then
    raise exception 'Parâmetros inválidos para retomada da importação';
 end if;
 select * into c
   from liquida_private.tradein_importacoes i
   where i.criado_por=auth.uid()
     and i.arquivo=p_arquivo
     and i.total_vouchers=p_total
     and i.metadados=p_metadados
     and i.concluido_em is null
     and i.gravados>0
   order by i.atualizado_em desc limit 1;
 if not found then
   return jsonb_build_object('encontrada',false);
 end if;
 return jsonb_build_object(
   'encontrada',true,
   'importacao_id',c.id,
   'gravados',c.gravados,
   'total',c.total_vouchers,
   'arquivo',c.arquivo
 );
end $func$;
revoke all on function public.tradein_recuperar_importacao(text,integer,jsonb) from public,anon;
grant execute on function public.tradein_recuperar_importacao(text,integer,jsonb) to authenticated;
