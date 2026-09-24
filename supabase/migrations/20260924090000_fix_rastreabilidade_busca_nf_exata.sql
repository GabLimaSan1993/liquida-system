-- Corrige busca da Rastreabilidade para evitar falsos positivos em NFs numéricas curtas
-- e enriquece os resultados com o pedido/lote relacionado ao IMEI.

do $patch$
declare
  v_oid oid;
  v_def text;
  v_original text;
  v_needle text := E'    into v_matches\n    from enriquecido;\n  end if;';
  v_insert text;
begin
  select p.oid into v_oid
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public'
    and p.proname='assurant_rastreabilidade_privada'
    and pg_get_function_identity_arguments(p.oid)='p_busca text, p_imei text';

  if v_oid is null then
    raise exception 'assurant_rastreabilidade_privada(text,text) não encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_original := v_def;

  if position('pedido_b2c' in v_def) > 0
     and position('Busca numérica curta é tratada como chave operacional exata' in v_def) > 0 then
    return;
  end if;

  v_insert := E'    into v_matches\n'
    || E'    from enriquecido;\n\n'
    || E'    -- Busca numérica curta é tratada como chave operacional exata\n'
    || E'    -- (pedido/NF/chave), evitando falsos positivos por trechos de IMEI.\n'
    || E'    if v_busca ~ ''^[0-9]{1,14}$'' then\n'
    || E'      select coalesce(jsonb_agg(x.item), ''[]''::jsonb)\n'
    || E'      into v_matches\n'
    || E'      from jsonb_array_elements(v_matches) as x(item)\n'
    || E'      where exists (\n'
    || E'        select 1 from public.pedidos_b2c p\n'
    || E'        where (btrim(coalesce(p.imei_alocado,'''')) = x.item ->> ''imei''\n'
    || E'               or btrim(coalesce(p.imei_bipado,'''')) = x.item ->> ''imei'')\n'
    || E'          and (p.id_anymarket::text = v_busca\n'
    || E'               or btrim(coalesce(p.numero_nf,'''')) = v_busca\n'
    || E'               or btrim(coalesce(p.chave_nf,'''')) = v_busca)\n'
    || E'      )\n'
    || E'      or exists (\n'
    || E'        select 1 from public.b2b_itens i\n'
    || E'        where btrim(coalesce(i.imei,'''')) = x.item ->> ''imei''\n'
    || E'          and btrim(coalesce(i.nf,'''')) = v_busca\n'
    || E'      );\n'
    || E'    end if;\n\n'
    || E'    -- Enriquece cada resultado com o vínculo de pedido mais recente.\n'
    || E'    select coalesce(\n'
    || E'      jsonb_agg(\n'
    || E'        x.item || jsonb_build_object(\n'
    || E'          ''pedido_b2c'', (\n'
    || E'            select p.id_anymarket from public.pedidos_b2c p\n'
    || E'            where btrim(coalesce(p.imei_alocado,'''')) = x.item ->> ''imei''\n'
    || E'               or btrim(coalesce(p.imei_bipado,'''')) = x.item ->> ''imei''\n'
    || E'            order by p.atualizado_em desc nulls last, p.criado_em desc nulls last\n'
    || E'            limit 1\n'
    || E'          ),\n'
    || E'          ''nf_b2c'', (\n'
    || E'            select p.numero_nf from public.pedidos_b2c p\n'
    || E'            where btrim(coalesce(p.imei_alocado,'''')) = x.item ->> ''imei''\n'
    || E'               or btrim(coalesce(p.imei_bipado,'''')) = x.item ->> ''imei''\n'
    || E'            order by p.atualizado_em desc nulls last, p.criado_em desc nulls last\n'
    || E'            limit 1\n'
    || E'          ),\n'
    || E'          ''lote_b2b'', (\n'
    || E'            select bp.lote from public.b2b_itens i\n'
    || E'            join public.b2b_pedidos bp on bp.id = i.pedido_id\n'
    || E'            where btrim(coalesce(i.imei,'''')) = x.item ->> ''imei''\n'
    || E'            order by bp.criado_em desc nulls last limit 1\n'
    || E'          ),\n'
    || E'          ''nf_b2b'', (\n'
    || E'            select i.nf from public.b2b_itens i\n'
    || E'            join public.b2b_pedidos bp on bp.id = i.pedido_id\n'
    || E'            where btrim(coalesce(i.imei,'''')) = x.item ->> ''imei''\n'
    || E'            order by bp.criado_em desc nulls last limit 1\n'
    || E'          )\n'
    || E'        )\n'
    || E'        order by case when x.item ->> ''imei'' = v_imei then 0 else 1 end, x.item ->> ''voucher'', x.item ->> ''imei''\n'
    || E'      ), ''[]''::jsonb\n'
    || E'    ) into v_matches\n'
    || E'    from jsonb_array_elements(v_matches) as x(item);\n'
    || E'  end if;';

  v_def := replace(v_def, v_needle, v_insert);

  if v_def = v_original then
    raise exception 'Bloco de resultados não encontrado para patch';
  end if;

  execute v_def;
end;
$patch$;
