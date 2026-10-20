do $fix$
declare v_def text;
begin
 select pg_get_functiondef(p.oid) into v_def
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='liquida_private'
   and p.proname='fechamento_lojas_exportar_lote'
   and pg_get_function_identity_arguments(p.oid)=
    'p_situacao text, p_laudo text, p_busca text, p_rede text, p_limite integer, p_tem_cursor boolean, p_cursor_data timestamp with time zone, p_cursor_voucher text, p_cursor_id uuid, p_data_inicial date, p_data_final date';
 if v_def is null then raise exception 'Função de exportação não encontrada'; end if;
 v_def:=replace(v_def,'v_limite:=least(2000,greatest(1,coalesce(p_limite,1000)));','v_limite:=least(5000,greatest(1,coalesce(p_limite,1000)));');
 if position('v_limite:=least(5000' in v_def)=0 then raise exception 'Não foi possível ampliar o lote'; end if;
 execute v_def;
end $fix$;
