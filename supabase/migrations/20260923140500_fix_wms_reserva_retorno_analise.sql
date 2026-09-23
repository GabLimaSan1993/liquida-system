-- Permite que uma reserva B2C em análise seja reativada no mesmo ciclo físico.
-- Antes, wms_reservar_saida exigia endereço "ocupado" logo na primeira busca,
-- mas wms_marcar_analise_saida altera o endereço para "bloqueado". Isso impedia
-- o retorno de um pedido em análise para o picking usando o mesmo IMEI.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_original text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='wms_reservar_saida'
    and pg_get_function_identity_arguments(p.oid)='p_imei text, p_canal text, p_referencia text, p_usuario uuid';

  if v_oid is null then
    raise exception 'wms_reservar_saida não encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_original := v_def;

  v_def := replace(
    v_def,
    E'    and e.status = ''ocupado''\n',
    E'    and (\n      e.status = ''ocupado''\n      or (\n        e.status = ''bloqueado''\n        and exists (\n          select 1\n          from public.wms_reservas_saida rr\n          where rr.alocacao_id = a.id\n            and rr.status in (''reservado'', ''analise'', ''reconciliar'')\n            and rr.canal = v_canal\n            and rr.referencia_id = p_referencia\n        )\n      )\n    )\n'
  );

  -- Idempotente se o ambiente já estiver corrigido.
  if v_def <> v_original then
    execute v_def;
  end if;
end;
$patch$;
