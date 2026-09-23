
create table if not exists public.assurant_desvinculacoes_pedido (
  id uuid primary key default gen_random_uuid(),
  imei text not null,
  motivo text not null,
  usuario_id uuid not null,
  b2c_vinculos jsonb not null default '[]'::jsonb,
  b2b_vinculos jsonb not null default '[]'::jsonb,
  wms_alocacao_id uuid null,
  wms_resultado jsonb null,
  b2b_exportados integer not null default 0,
  criado_em timestamptz not null default now(),
  constraint assurant_desvinculacoes_pedido_motivo_chk
    check (length(btrim(motivo)) >= 3)
);

create index if not exists assurant_desvinculacoes_pedido_imei_idx
  on public.assurant_desvinculacoes_pedido (imei, criado_em desc);

alter table public.assurant_desvinculacoes_pedido enable row level security;

revoke all on table public.assurant_desvinculacoes_pedido from anon, authenticated;

create or replace function public.assurant_rastreabilidade_autorizado()
returns boolean
language sql
stable
security definer
set search_path = public
as $function$
  select
    auth.uid() is not null
    and exists (
      select 1
      from public.user_profiles u
      where u.id = auth.uid()
        and (
          coalesce(u.is_master, false)
          or '/v2/assurant/estoque/rastreabilidade' = any(
            coalesce(u.telas_permitidas, '{}'::text[])
          )
        )
    );
$function$;

revoke all on function public.assurant_rastreabilidade_autorizado() from public, anon;
grant execute on function public.assurant_rastreabilidade_autorizado() to authenticated;

do $patch$
declare
  v_oid oid;
  v_def text;
  v_original text;
begin
  for v_oid in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'assurant_rastreabilidade_privada',
        'assurant_reserva_especial_status',
        'assurant_reservar_item_especial',
        'assurant_liberar_item_especial',
        'assurant_finalizar_item_especial'
      )
  loop
    v_def := pg_get_functiondef(v_oid);
    v_original := v_def;

    v_def := replace(
      v_def,
      'if auth.uid() is distinct from v_owner then',
      'if not public.assurant_rastreabilidade_autorizado() then'
    );

    v_def := replace(
      v_def,
      'if v_user is distinct from v_owner then',
      'if not public.assurant_rastreabilidade_autorizado() then'
    );

    if v_def = v_original then
      raise exception 'Não foi possível atualizar a autorização da função %', v_oid::regprocedure;
    end if;

    execute v_def;
  end loop;
end;
$patch$;

revoke all on function public.assurant_rastreabilidade_privada(text, text) from public, anon;
revoke all on function public.assurant_reserva_especial_status(text) from public, anon;
revoke all on function public.assurant_reservar_item_especial(text, text) from public, anon;
revoke all on function public.assurant_liberar_item_especial(uuid, text) from public, anon;
revoke all on function public.assurant_finalizar_item_especial(uuid, text, text, text) from public, anon;

grant execute on function public.assurant_rastreabilidade_privada(text, text) to authenticated;
grant execute on function public.assurant_reserva_especial_status(text) to authenticated;
grant execute on function public.assurant_reservar_item_especial(text, text) to authenticated;
grant execute on function public.assurant_liberar_item_especial(uuid, text) to authenticated;
grant execute on function public.assurant_finalizar_item_especial(uuid, text, text, text) to authenticated;

create or replace function public.assurant_desvinculacoes_item(p_imei text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_imei text := nullif(btrim(p_imei), '');
  v_result jsonb;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Acesso restrito à Rastreabilidade do Item'
      using errcode = '42501';
  end if;

  if v_imei is null then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', d.id,
        'imei', d.imei,
        'motivo', d.motivo,
        'usuario_id', d.usuario_id,
        'usuario_nome', u.nome,
        'b2c_vinculos', d.b2c_vinculos,
        'b2b_vinculos', d.b2b_vinculos,
        'wms_alocacao_id', d.wms_alocacao_id,
        'wms_resultado', d.wms_resultado,
        'b2b_exportados', d.b2b_exportados,
        'criado_em', d.criado_em
      )
      order by d.criado_em desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.assurant_desvinculacoes_pedido d
  left join public.user_profiles u on u.id = d.usuario_id
  where btrim(d.imei) = v_imei;

  return v_result;
end;
$function$;

revoke all on function public.assurant_desvinculacoes_item(text) from public, anon;
grant execute on function public.assurant_desvinculacoes_item(text) to authenticated;

create or replace function public.assurant_desvincular_item_pedidos(
  p_imei text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user uuid := auth.uid();
  v_imei text := nullif(btrim(p_imei), '');
  v_motivo text := nullif(btrim(p_motivo), '');

  v_b2c_ids uuid[];
  v_b2b_ids uuid[];
  v_b2b_pedidos uuid[];
  v_b2c_snapshot jsonb := '[]'::jsonb;
  v_b2b_snapshot jsonb := '[]'::jsonb;
  v_b2c_qtd integer := 0;
  v_b2b_qtd integer := 0;
  v_b2b_exportados integer := 0;

  v_alocacao_id uuid;
  v_endereco_id bigint;
  v_reserva_canal text;
  v_reserva_referencia text;
  v_canal_retirada text;
  v_referencia_retirada text;
  v_wms_result jsonb := null;

  v_audit_id uuid;
  v_pedido_id uuid;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Acesso restrito à Rastreabilidade do Item'
      using errcode = '42501';
  end if;

  if v_imei is null then
    return jsonb_build_object('ok', false, 'erro', 'IMEI/serial não informado.');
  end if;

  if v_motivo is null or length(v_motivo) < 3 then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Informe o motivo da desvinculação com pelo menos 3 caracteres.'
    );
  end if;

  if exists (
    select 1
    from public.assurant_reservas_especiais r
    where btrim(r.imei) = v_imei
      and r.status = 'reservado'
  ) then
    return jsonb_build_object(
      'ok', false,
      'erro', 'O aparelho possui uma reserva especial ativa. Libere a reserva de Troca/Venda Funcionário antes de desvincular do pedido.'
    );
  end if;

  select
    array_agg(p.id order by p.criado_em),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', p.id,
          'pedido', p.id_anymarket,
          'status', p.status,
          'marketplace', p.marketplace,
          'sku_produto', p.sku_produto,
          'sku_alocado', p.sku_alocado,
          'grade_produto', p.grade_produto,
          'grade_alocada', p.grade_alocada,
          'imei_alocado', p.imei_alocado,
          'imei_bipado', p.imei_bipado,
          'local_alocado', p.local_alocado,
          'wms_alocacao_id', p.wms_alocacao_id,
          'alocado_em', p.alocado_em,
          'bipado_em', p.bipado_em,
          'embalado_em', p.embalado_em
        )
        order by p.criado_em
      ),
      '[]'::jsonb
    )
  into v_b2c_ids, v_b2c_snapshot
  from public.pedidos_b2c p
  where (
      btrim(coalesce(p.imei_alocado, '')) = v_imei
      or btrim(coalesce(p.imei_bipado, '')) = v_imei
    )
    and p.status in (
      'alocado',
      'em_picking',
      'em_analise',
      'aguardando_definicao_produto',
      'embalado'
    )
    and nullif(btrim(coalesce(p.numero_nf, '')), '') is null
    and nullif(btrim(coalesce(p.chave_nf, '')), '') is null
    and p.faturado_em is null;

  v_b2c_qtd := coalesce(cardinality(v_b2c_ids), 0);

  select
    array_agg(i.id order by i.id),
    array_agg(distinct i.pedido_id),
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'item_id', i.id,
          'pedido_id', i.pedido_id,
          'lote', bp.lote,
          'cliente', bp.cliente,
          'status', i.status,
          'imei', i.imei,
          'imei_bipado', i.imei_bipado,
          'voucher', i.voucher,
          'local_estoque', i.local_estoque,
          'caixa_id', i.caixa_id,
          'embalado_em', i.embalado_em,
          'bipado_em', i.bipado_em,
          'exportado_faturamento', exists (
            select 1
            from public.b2b_itens_exportados ex
            where ex.item_id = i.id
          )
        )
        order by i.id
      ),
      '[]'::jsonb
    )
  into v_b2b_ids, v_b2b_pedidos, v_b2b_snapshot
  from public.b2b_itens i
  join public.b2b_pedidos bp on bp.id = i.pedido_id
  where btrim(coalesce(i.imei, '')) = v_imei
    and i.status in ('pendente', 'nao_localizado', 'em_analise', 'bipado')
    and nullif(btrim(coalesce(i.nf, '')), '') is null
    and bp.encerrado_sem_faturamento_em is null
    and coalesce(bp.status, '') <> 'concluido';

  v_b2b_qtd := coalesce(cardinality(v_b2b_ids), 0);

  if v_b2c_qtd = 0 and v_b2b_qtd = 0 then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Nenhum vínculo operacional B2B/B2C aberto e elegível para desvinculação foi encontrado. Vínculos já faturados ou concluídos são preservados como histórico.'
    );
  end if;

  if v_b2b_qtd > 0 then
    select count(*)
    into v_b2b_exportados
    from public.b2b_itens_exportados ex
    where ex.item_id = any(v_b2b_ids);
  end if;

  select
    a.id,
    a.endereco_id
  into
    v_alocacao_id,
    v_endereco_id
  from public.wms_alocacoes a
  join public.wms_enderecos e on e.id = a.endereco_id
  where btrim(a.imei) = v_imei
    and a.status = 'confirmado'
    and e.ativo = true
    and e.status in ('ocupado', 'bloqueado')
  order by coalesce(a.confirmado_em, a.reservado_em) desc nulls last, a.id desc
  limit 1
  for update of a;

  if v_alocacao_id is not null then
    select r.canal, r.referencia_id
    into v_reserva_canal, v_reserva_referencia
    from public.wms_reservas_saida r
    where r.alocacao_id = v_alocacao_id
      and r.status in ('reservado', 'analise', 'reconciliar')
    order by r.reservado_em desc
    limit 1
    for update;

    if v_reserva_canal in ('TROCA', 'VENDA_FUNCIONARIO') then
      return jsonb_build_object(
        'ok', false,
        'erro', 'A posição atual está reservada por um fluxo especial. Libere essa reserva antes da desvinculação.'
      );
    end if;

    if v_reserva_canal in ('B2C', 'B2B') then
      v_canal_retirada := v_reserva_canal;
      v_referencia_retirada := v_reserva_referencia;
    elsif v_b2c_qtd > 0 then
      v_canal_retirada := 'B2C';
      v_referencia_retirada := v_b2c_ids[1]::text;
    else
      v_canal_retirada := 'B2B';
      v_referencia_retirada := v_b2b_ids[1]::text;
    end if;

    v_wms_result := public.wms_confirmar_retirada_saida(
      v_canal_retirada,
      v_referencia_retirada,
      v_imei,
      v_user
    );

    if not coalesce((v_wms_result ->> 'ok')::boolean, false) then
      return jsonb_build_object(
        'ok', false,
        'erro', coalesce(
          v_wms_result ->> 'erro',
          'Não foi possível encerrar o ciclo físico atual no WMS.'
        )
      );
    end if;
  end if;

  if v_b2c_qtd > 0 then
    update public.pedidos_b2c p
    set
      status = 'aguardando_alocacao',
      imei_alocado = null,
      sku_alocado = null,
      grade_alocada = null,
      alocado_em = null,
      alocado_por = null,
      imei_bipado = null,
      bipado_em = null,
      bipado_por = null,
      motivo_analise = null,
      analise_em = null,
      analise_por = null,
      resolvido_em = null,
      resolvido_por = null,
      embalado_em = null,
      embalado_por = null,
      codigo_embalagem = null,
      etapa_embalagem = null,
      emb_nf_colada = false,
      emb_selado = false,
      emb_etiquetado = false,
      data_subinv_alocado = null,
      local_subinv_alocado = null,
      local_alocado = null,
      fifo_posicao = null,
      fifo_total_candidatos = null,
      fifo_origem = null,
      wms_alocacao_id = null,
      atualizado_em = now()
    where p.id = any(v_b2c_ids);
  end if;

  if v_b2b_qtd > 0 then
    update public.b2b_itens i
    set
      status = 'nao_faturar',
      imei_bipado = null,
      bipado_em = null,
      bipado_por = null,
      caixa_id = null,
      embalado_em = null,
      embalado_por = null,
      local_estoque = null,
      motivo_nao_faturar = 'desvinculado_rastreabilidade',
      obs_nao_faturar = v_motivo,
      nao_faturar_em = now(),
      nao_faturar_por = v_user
    where i.id = any(v_b2b_ids);

    foreach v_pedido_id in array v_b2b_pedidos
    loop
      perform public.b2b_atualizar_contador(v_pedido_id);

      update public.b2b_pedidos bp
      set status_picking = case
        when not exists (
          select 1
          from public.b2b_itens x
          where x.pedido_id = v_pedido_id
            and x.status in ('pendente', 'nao_localizado', 'em_analise')
        )
        and exists (
          select 1
          from public.b2b_itens x
          where x.pedido_id = v_pedido_id
        )
        then 'concluido'
        else 'em_andamento'
      end
      where bp.id = v_pedido_id;
    end loop;
  end if;

  update public.assurant_triagem t
  set
    status_atual = 'Aguardando armazenagem',
    atualizado_em = now()
  where t.id = (
    select x.id
    from public.assurant_triagem x
    where btrim(x.imei) = v_imei
    order by coalesce(x.atualizado_em, x.criado_em) desc nulls last,
             x.criado_em desc nulls last,
             x.id desc
    limit 1
  );

  insert into public.assurant_desvinculacoes_pedido (
    imei,
    motivo,
    usuario_id,
    b2c_vinculos,
    b2b_vinculos,
    wms_alocacao_id,
    wms_resultado,
    b2b_exportados
  )
  values (
    v_imei,
    v_motivo,
    v_user,
    v_b2c_snapshot,
    v_b2b_snapshot,
    v_alocacao_id,
    v_wms_result,
    v_b2b_exportados
  )
  returning id into v_audit_id;

  return jsonb_build_object(
    'ok', true,
    'auditoria_id', v_audit_id,
    'imei', v_imei,
    'b2c_desvinculados', v_b2c_qtd,
    'b2b_desvinculados', v_b2b_qtd,
    'b2b_exportados', v_b2b_exportados,
    'status_triagem', 'Aguardando armazenagem',
    'wms_alocacao_encerrada', v_alocacao_id
  );
end;
$function$;

revoke all on function public.assurant_desvincular_item_pedidos(text, text) from public, anon;
grant execute on function public.assurant_desvincular_item_pedidos(text, text) to authenticated;
