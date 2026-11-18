do $clone$
declare f text;
begin
 select pg_get_functiondef(
  'liquida_private.relatorio_estoque_consultar_lab(date,date,text,text,text,text,text,integer,integer,boolean,text)'::regprocedure
 ) into f;
 if f is null or strpos(f,'source as materialized (')=0 then
   raise exception 'Estrutura da função de estoque não compatível; abortado.';
 end if;
 f:=replace(f,'liquida_private.relatorio_estoque_consultar_lab(', 'liquida_private.relatorio_estoque_consultar_lab_exportar(');
 f:=replace(f,'source as materialized (', 'source as not materialized (');
 execute f;
end $clone$;
revoke all on function liquida_private.relatorio_estoque_consultar_lab_exportar(date,date,text,text,text,text,text,integer,integer,boolean,text) from public,anon;
grant execute on function liquida_private.relatorio_estoque_consultar_lab_exportar(date,date,text,text,text,text,text,integer,integer,boolean,text) to authenticated;
create or replace function public.assurant_relatorio_estoque_lab_exportar(
 p_data_inicial date default null,p_data_final date default null,p_data_referencia text default 'recebimento',
 p_status text default '',p_grade text default '',p_rede text default '',p_busca text default '',
 p_offset integer default 0,p_limite integer default 1000,
 p_status_laboratorio text default ''
) returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.relatorio_estoque_consultar_lab_exportar(
  p_data_inicial,p_data_final,p_data_referencia,p_status,p_grade,p_rede,p_busca,p_offset,p_limite,false,p_status_laboratorio
 );
$$;
revoke all on function public.assurant_relatorio_estoque_lab_exportar(date,date,text,text,text,text,text,integer,integer,text) from public,anon;
grant execute on function public.assurant_relatorio_estoque_lab_exportar(date,date,text,text,text,text,text,integer,integer,text) to authenticated;
