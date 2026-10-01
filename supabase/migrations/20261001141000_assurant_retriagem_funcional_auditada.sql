-- Retriagem funcional auditada
-- Permite revisar uma triagem funcional já concluída sem perder o histórico
-- e sem regredir automaticamente aparelhos que já avançaram no fluxo.

create or replace function public.assurant_retriagem_funcional_salvar(
  p_voucher text,
  p_imei text,
  p_sku text,
  p_modelo text,
  p_status_proposto text,
  p_resultado text,
  p_respostas text,
  p_status_bateria text,
  p_bateria_percentual integer,
  p_defeitos_adicionais text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_user uuid := auth.uid();
  v_voucher text := upper(trim(coalesce(p_voucher,'')));
  v_motivo text := trim(coalesce(p_motivo,''));
  v_old public.assurant_triagem%rowtype;
  v_status_final text;
  v_downstream boolean := false;
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_ajuste_id uuid;
  v_now timestamp without time zone := timezone('UTC', now());
begin
  if v_user is null then
    raise exception 'Sessão inválida.';
  end if;
  if v_voucher = '' then
    raise exception 'Voucher obrigatório.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Informe o motivo da retriagem com pelo menos 3 caracteres.';
  end if;

  select *
    into v_old
  from public.assurant_triagem
  where upper(trim(voucher)) = v_voucher
  order by coalesce(atualizado_em,criado_em) desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'Voucher % não encontrado na triagem.', v_voucher;
  end if;
  if v_old.data_funcional is null then
    raise exception 'O voucher ainda não possui uma triagem funcional anterior.';
  end if;

  v_old_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'voucher', v_old.voucher,
    'imei', v_old.imei,
    'sku', v_old.sku,
    'modelo', v_old.modelo,
    'status_atual', v_old.status_atual,
    'resultado', v_old.resultado_triagem_funcional,
    'respostas_funcional', v_old.respostas_funcional,
    'status_bateria', v_old.status_bateria,
    'bateria_percentual', v_old.bateria_percentual,
    'defeitos_adicionais', v_old.defeitos_adicionais,
    'data_funcional', v_old.data_funcional,
    'funcional_por', v_old.funcional_por
  ));

  v_downstream := coalesce(v_old.status_atual,'') not in (
    'Aguardando triagem funcional',
    'Aguardando triagem cosmética',
    'Aguardando laudo',
    'Aguardando análise Assurant',
    'Aguardando definição Assurant - IMEI divergente'
  );

  v_status_final := case
    when v_downstream then v_old.status_atual
    else coalesce(nullif(trim(p_status_proposto),''), v_old.status_atual)
  end;

  update public.assurant_triagem
  set
    imei = nullif(trim(p_imei),''),
    sku = nullif(trim(p_sku),''),
    modelo = nullif(trim(p_modelo),''),
    status_atual = v_status_final,
    resultado_triagem_funcional = nullif(trim(p_resultado),''),
    respostas_funcional = p_respostas,
    status_bateria = nullif(trim(p_status_bateria),''),
    bateria_percentual = p_bateria_percentual,
    defeitos_adicionais = nullif(trim(p_defeitos_adicionais),''),
    funcional_por = v_user,
    data_funcional = v_now,
    origem_triagem = coalesce(nullif(v_old.origem_triagem,''),'liquida'),
    atualizado_em = v_now
  where id = v_old.id;

  select jsonb_strip_nulls(jsonb_build_object(
    'voucher', t.voucher,
    'imei', t.imei,
    'sku', t.sku,
    'modelo', t.modelo,
    'status_atual', t.status_atual,
    'resultado', t.resultado_triagem_funcional,
    'respostas_funcional', t.respostas_funcional,
    'status_bateria', t.status_bateria,
    'bateria_percentual', t.bateria_percentual,
    'defeitos_adicionais', t.defeitos_adicionais,
    'data_funcional', t.data_funcional,
    'funcional_por', t.funcional_por
  ))
  into v_new_snapshot
  from public.assurant_triagem t
  where t.id = v_old.id;

  insert into public.assurant_rastreabilidade_ajustes(
    imei,campo,valor_anterior,valor_novo,motivo,criado_por
  )
  values(
    coalesce(nullif(trim(p_imei),''), v_old.imei),
    'triagem_funcional.revisao',
    v_old_snapshot::text,
    v_new_snapshot::text,
    v_motivo,
    v_user
  )
  returning id into v_ajuste_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_old.id,
    'voucher', v_old.voucher,
    'imei', coalesce(nullif(trim(p_imei),''), v_old.imei),
    'status_atual', v_status_final,
    'status_preservado', v_downstream,
    'ajuste_id', v_ajuste_id,
    'anterior', v_old_snapshot,
    'novo', v_new_snapshot
  );
end;
$function$;

revoke all on function public.assurant_retriagem_funcional_salvar(
  text,text,text,text,text,text,text,text,integer,text,text
) from public, anon;

grant execute on function public.assurant_retriagem_funcional_salvar(
  text,text,text,text,text,text,text,text,integer,text,text
) to authenticated;

create or replace function public.assurant_retriagens_funcionais_item(p_imei text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_imei text := trim(coalesce(p_imei,''));
  v_result jsonb;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Usuário sem permissão para consultar a rastreabilidade.';
  end if;
  if v_imei = '' then
    raise exception 'IMEI obrigatório.';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', a.id,
      'imei', a.imei,
      'motivo', a.motivo,
      'criado_em', a.criado_em,
      'usuario_id', a.criado_por,
      'usuario_nome', up.nome,
      'anterior', case when a.valor_anterior is null then null else a.valor_anterior::jsonb end,
      'novo', case when a.valor_novo is null then null else a.valor_novo::jsonb end
    )
    order by a.criado_em desc, a.id desc
  ), '[]'::jsonb)
  into v_result
  from public.assurant_rastreabilidade_ajustes a
  left join public.user_profiles up on up.id=a.criado_por
  where trim(a.imei)=v_imei
    and a.campo='triagem_funcional.revisao';

  return v_result;
end;
$function$;

revoke all on function public.assurant_retriagens_funcionais_item(text) from public, anon;
grant execute on function public.assurant_retriagens_funcionais_item(text) to authenticated;
