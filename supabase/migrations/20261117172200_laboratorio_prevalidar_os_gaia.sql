-- Verifica todos os vouchers e OS GAIA antes do primeiro lote de recebimento.
CREATE OR REPLACE FUNCTION public.assurant_reparo_lab_prevalidar_os_gaia(p_linhas jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
 SET statement_timeout TO '30s'
AS $function$
declare v_line jsonb; v_voucher text; v_os text; v_h record; v_a record;
        v_total integer:=0; v_erros jsonb:='[]'::jsonb;
begin
 if auth.uid() is null or not exists(
  select 1 from public.user_profiles u where u.id=auth.uid() and
   (u.is_master is true or '/v2/assurant/laboratorio/reparos'=any(coalesce(u.telas_permitidas,'{}'::text[])))
 ) then raise exception 'Sem permissão no Laboratório.' using errcode='42501'; end if;
 if p_linhas is null or jsonb_typeof(p_linhas)<>'array'
  or jsonb_array_length(p_linhas) not between 1 and 250
 then raise exception 'Envie de 1 a 250 pares Voucher + OS GAIA.'; end if;
 for v_line in select value from jsonb_array_elements(p_linhas) loop
  v_total:=v_total+1; v_voucher:=upper(btrim(coalesce(v_line->>'voucher','')));
  v_os:=btrim(coalesce(v_line->>'os_gaia',''));
  if jsonb_typeof(v_line)<>'object'
    or v_voucher !~ '^[A-Z0-9][A-Z0-9_-]{2,59}$'
    or v_voucher ~ '^([0-9]{15}|IMEI|OS|VOUCHER)$'
    or v_os !~ '^[A-Za-z0-9._/-]{2,60}$'
  then
    v_erros:=v_erros||jsonb_build_array(jsonb_build_object('voucher',v_voucher,'motivo','Voucher ou OS GAIA inválido')); continue;
  end if;
  if not liquida_private.reparo_lab_trilha_valida(v_voucher)
    or not liquida_private.reparo_lab_enviado_warehouse(v_voucher) then
    v_erros:=v_erros||jsonb_build_array(jsonb_build_object('voucher',v_voucher,'motivo','Sem envio Warehouse ou sem histórico de recebimento/triagem'));continue;
  end if;
  select id,status,os_numero into v_h from liquida_private.reparo_lab_itens
  where upper(btrim(voucher))=v_voucher order by atualizado_em desc nulls last,id desc limit 1;
  select id,status,os_numero into v_a from liquida_private.reparo_lab_avulsos where voucher=v_voucher;
  if (v_h.id is null and v_a.id is null) or (v_h.id is not null and v_a.id is not null) then
    v_erros:=v_erros||jsonb_build_array(jsonb_build_object('voucher',v_voucher,'motivo','Item ausente ou duplicado no Laboratório')); continue;
  end if;
  if exists(select 1 from liquida_private.reparo_lab_itens i where upper(btrim(i.os_numero))=upper(v_os) and (v_h.id is null or i.id<>v_h.id))
    or exists(select 1 from liquida_private.reparo_lab_avulsos a where upper(btrim(a.os_numero))=upper(v_os) and (v_a.id is null or a.id<>v_a.id)) then
    v_erros:=v_erros||jsonb_build_array(jsonb_build_object('voucher',v_voucher,'motivo','OS GAIA vinculada a outro voucher')); continue;
  end if;
  if v_h.id is not null and not (
     v_h.status='aguardando_recebimento'
     or (v_h.status in ('recebido','em_reparo','concluido') and
         (v_h.os_numero=v_os or (v_h.status='recebido' and v_h.os_numero is null)))
   ) then
    v_erros:=v_erros||jsonb_build_array(jsonb_build_object('voucher',v_voucher,'motivo','Etapa ou OS divergente no histórico')); continue;
  end if;
  if v_a.id is not null and not (
     v_a.status='aguardando_recebimento'
     or (v_a.status in ('recebido','em_reparo','concluido') and
         (v_a.os_numero=v_os or (v_a.status='recebido' and v_a.os_numero is null)))
   ) then
    v_erros:=v_erros||jsonb_build_array(jsonb_build_object('voucher',v_voucher,'motivo','Etapa ou OS divergente no individual')); continue;
  end if;
  v_h:=null; v_a:=null;
 end loop;
 return jsonb_build_object('ok',jsonb_array_length(v_erros)=0,
  'total',v_total,'falhas',v_erros);
end;$function$;
REVOKE ALL ON FUNCTION public.assurant_reparo_lab_prevalidar_os_gaia(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_lab_prevalidar_os_gaia(jsonb) TO authenticated;
