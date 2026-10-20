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

 v_def:=replace(
  v_def,
  'select t.id,t.voucher,',
  'select t.id,t.voucher,t.imei,t.sku,t.modelo,'
 );
 v_def:=replace(
  v_def,
  'concat_ws('' ''::text, voucher, loja, codigo_loja)',
  'concat_ws('' ''::text, voucher, imei, sku, modelo, loja, codigo_loja)'
 );

 if position('t.imei,t.sku,t.modelo' in replace(v_def,' ',''))=0 then
  raise exception 'Não foi possível incluir os campos de busca';
 end if;
 execute v_def;
end $fix$;
