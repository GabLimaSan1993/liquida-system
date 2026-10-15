-- Retorna pedidos em qualquer etapa, inclusive antes da alocação de IMEI.
-- Preserva autorização e evita vínculos de expedição por NF/chave vazias.

CREATE OR REPLACE FUNCTION public.assurant_rastreabilidade_privada(p_busca text DEFAULT NULL::text, p_imei text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_owner constant uuid := 'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid;
  v_busca text := nullif(btrim(p_busca), '');
  v_imei text := nullif(btrim(p_imei), '');
  v_pedido bigint;
  v_matches jsonb := '[]'::jsonb;
  v_resumo jsonb := null;
  v_eventos jsonb := '[]'::jsonb;
  v_wms jsonb := '[]'::jsonb;
  v_b2c jsonb := '[]'::jsonb;
  v_b2b jsonb := '[]'::jsonb;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Acesso restrito à Rastreabilidade do Item'
      using errcode = '42501';
  end if;

  if v_busca is null and v_imei is null then
    return jsonb_build_object(
      'privado', true,
      'matches', '[]'::jsonb,
      'resumo', null,
      'eventos', '[]'::jsonb,
      'wms_ciclos', '[]'::jsonb,
      'pedidos_b2c', '[]'::jsonb,
      'pedidos_b2b', '[]'::jsonb
    );
  end if;

  if v_busca is not null then
    select p.id_anymarket
      into v_pedido
    from public.pedidos_b2c p
    where p.id_anymarket::text = v_busca
       or btrim(coalesce(p.numero_nf,'')) = v_busca
       or btrim(coalesce(p.chave_nf,'')) = v_busca
    order by p.atualizado_em desc nulls last
    limit 1;
  end if;

  if v_imei is null and v_busca is not null then
    select z.imei
      into v_imei
    from (
      select btrim(t.imei) as imei, 1 as prioridade, coalesce(t.atualizado_em,t.criado_em)::timestamptz as dt
      from public.assurant_triagem t
      where btrim(t.imei)=v_busca

      union all
      select btrim(a.imei), 2, coalesce(a.atualizado_em,a.criado_em)
      from public.wms_alocacoes a
      where btrim(a.imei)=v_busca

      union all
      select btrim(o.imei), 3,
        coalesce(
          public.assurant_oracle_evento_em(o.dt_complete_ri,null),
          public.assurant_oracle_evento_em(o.data_emissao_nf,null),
          o.importado_em
        )
      from public.entrada_oracle_ap o
      where btrim(o.imei)=v_busca

      union all
      select btrim(s.imei), 4, s.atualizado_em
      from public.estoque_subinv s
      where btrim(s.imei)=v_busca

      union all
      select btrim(t.imei), 5, coalesce(t.atualizado_em,t.criado_em)::timestamptz
      from public.assurant_triagem t
      where btrim(coalesce(t.voucher,''))=v_busca
        and nullif(btrim(t.imei),'') is not null

      union all
      select btrim(a.imei), 6, coalesce(a.atualizado_em,a.criado_em)
      from public.wms_alocacoes a
      where btrim(coalesce(a.voucher,''))=v_busca
        and nullif(btrim(a.imei),'') is not null

      union all
      select btrim(coalesce(p.imei_bipado,p.imei_alocado)), 7, p.atualizado_em
      from public.pedidos_b2c p
      where (
        p.id_anymarket::text=v_busca
        or btrim(coalesce(p.numero_nf,''))=v_busca
        or btrim(coalesce(p.chave_nf,''))=v_busca
      )
      and nullif(btrim(coalesce(p.imei_bipado,p.imei_alocado,'')),'') is not null

      union all
      select btrim(i.imei), 8, coalesce(i.nao_faturar_em, i.localizado_em, i.embalado_em::timestamptz, i.bipado_em::timestamptz)
      from public.b2b_itens i
      where (
        btrim(coalesce(i.voucher,''))=v_busca
        or btrim(coalesce(i.nf,''))=v_busca
      )
      and nullif(btrim(i.imei),'') is not null
    ) z
    where nullif(z.imei,'') is not null
    order by z.prioridade, z.dt desc nulls last
    limit 1;
  end if;

  -- Pedidos exatos devem retornar mesmo sem IMEI; o wrapper resolve os matches.
  if v_busca is not null and v_pedido is null then
    with raw as (
      select btrim(t.imei) as imei
      from public.assurant_triagem t
      where btrim(coalesce(t.imei,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(t.voucher,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(t.sku,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(t.modelo,'')) ilike '%'||v_busca||'%'

      union
      select btrim(a.imei)
      from public.wms_alocacoes a
      where btrim(coalesce(a.imei,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(a.voucher,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(a.sku,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(a.modelo,'')) ilike '%'||v_busca||'%'

      union
      select btrim(coalesce(p.imei_bipado,p.imei_alocado))
      from public.pedidos_b2c p
      where p.id_anymarket::text ilike '%'||v_busca||'%'
         or btrim(coalesce(p.numero_nf,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(p.chave_nf,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(p.sku_produto,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(p.imei_alocado,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(p.imei_bipado,'')) ilike '%'||v_busca||'%'

      union
      select btrim(i.imei)
      from public.b2b_itens i
      where btrim(coalesce(i.imei,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(i.voucher,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(i.nf,'')) ilike '%'||v_busca||'%'
         or btrim(coalesce(i.cod_item,'')) ilike '%'||v_busca||'%'
    ),
    d as (
      select distinct imei
      from raw
      where nullif(imei,'') is not null
      limit 100
    ),
    enriquecido as (
      select
        d.imei,
        coalesce(
          (select t.voucher from public.assurant_triagem t where btrim(t.imei)=d.imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
          (select a.voucher from public.wms_alocacoes a where btrim(a.imei)=d.imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
        ) as voucher,
        coalesce(
          (select t.sku from public.assurant_triagem t where btrim(t.imei)=d.imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
          (select a.sku from public.wms_alocacoes a where btrim(a.imei)=d.imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
        ) as sku,
        coalesce(
          (select t.modelo from public.assurant_triagem t where btrim(t.imei)=d.imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
          (select a.modelo from public.wms_alocacoes a where btrim(a.imei)=d.imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
        ) as modelo,
        coalesce(
          (select t.grade from public.assurant_triagem t where btrim(t.imei)=d.imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
          (select a.grade_venda from public.wms_alocacoes a where btrim(a.imei)=d.imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
        ) as grade,
        coalesce(
          (select a.status from public.wms_alocacoes a where btrim(a.imei)=d.imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1),
          (select t.status_atual from public.assurant_triagem t where btrim(t.imei)=d.imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
          (select coalesce(nullif(o.inv_status,''),nullif(o.po_status,''),'Oracle')
           from public.entrada_oracle_ap o
           where btrim(o.imei)=d.imei
           order by
             (public.assurant_oracle_evento_em(o.dt_complete_ri,null) is not null) desc,
             o.importado_em desc nulls last
           limit 1),
          (select concat('SubInv ',s.local_subinv)
           from public.estoque_subinv s
           where btrim(s.imei)=d.imei
           order by s.data_subinv desc nulls last
           limit 1)
        ) as status,
        coalesce(
          (select public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha)
           from public.wms_alocacoes a join public.wms_enderecos e on e.id=a.endereco_id
           where btrim(a.imei)=d.imei and a.status='confirmado'
           order by a.confirmado_em desc nulls last limit 1),
          (select t.local from public.assurant_triagem t where btrim(t.imei)=d.imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
          (select s.local_subinv from public.estoque_subinv s
           where btrim(s.imei)=d.imei
           order by s.data_subinv desc nulls last
           limit 1)
        ) as local
      from d
    )
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'imei', imei,
          'voucher', voucher,
          'sku', sku,
          'modelo', modelo,
          'grade', grade,
          'status', status,
          'local', local
        )
        order by case when imei=v_imei then 0 else 1 end, voucher nulls last, imei
      ),
      '[]'::jsonb
    )
    into v_matches
    from enriquecido;

    -- Busca numérica curta é tratada como chave operacional exata
    -- (pedido/NF/chave), evitando falsos positivos por trechos de IMEI.
    if v_busca ~ '^[0-9]{1,14}$' then
      select coalesce(jsonb_agg(x.item), '[]'::jsonb)
      into v_matches
      from jsonb_array_elements(v_matches) as x(item)
      where exists (
        select 1
        from public.pedidos_b2c p
        where (btrim(coalesce(p.imei_alocado,'')) = x.item ->> 'imei'
               or btrim(coalesce(p.imei_bipado,'')) = x.item ->> 'imei')
          and (p.id_anymarket::text = v_busca
               or btrim(coalesce(p.numero_nf,'')) = v_busca
               or btrim(coalesce(p.chave_nf,'')) = v_busca)
      )
      or exists (
        select 1
        from public.b2b_itens i
        where btrim(coalesce(i.imei,'')) = x.item ->> 'imei'
          and btrim(coalesce(i.nf,'')) = v_busca
      );
    end if;

    -- Enriquece cada resultado com o vínculo de pedido mais recente.
    select coalesce(
      jsonb_agg(
        x.item || jsonb_build_object(
          'pedido_b2c', (
            select p.id_anymarket
            from public.pedidos_b2c p
            where btrim(coalesce(p.imei_alocado,'')) = x.item ->> 'imei'
               or btrim(coalesce(p.imei_bipado,'')) = x.item ->> 'imei'
            order by p.atualizado_em desc nulls last, p.criado_em desc nulls last
            limit 1
          ),
          'nf_b2c', (
            select p.numero_nf
            from public.pedidos_b2c p
            where btrim(coalesce(p.imei_alocado,'')) = x.item ->> 'imei'
               or btrim(coalesce(p.imei_bipado,'')) = x.item ->> 'imei'
            order by p.atualizado_em desc nulls last, p.criado_em desc nulls last
            limit 1
          ),
          'lote_b2b', (
            select bp.lote
            from public.b2b_itens i
            join public.b2b_pedidos bp on bp.id = i.pedido_id
            where btrim(coalesce(i.imei,'')) = x.item ->> 'imei'
            order by bp.criado_em desc nulls last
            limit 1
          ),
          'nf_b2b', (
            select i.nf
            from public.b2b_itens i
            join public.b2b_pedidos bp on bp.id = i.pedido_id
            where btrim(coalesce(i.imei,'')) = x.item ->> 'imei'
            order by bp.criado_em desc nulls last
            limit 1
          )
        )
        order by case when x.item ->> 'imei' = v_imei then 0 else 1 end, x.item ->> 'voucher', x.item ->> 'imei'
      ),
      '[]'::jsonb
    )
    into v_matches
    from jsonb_array_elements(v_matches) as x(item);
  end if;

  if v_imei is not null then
    select jsonb_build_object(
      'imei', v_imei,
      'voucher', coalesce(
        (select t.voucher from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
        (select a.voucher from public.wms_alocacoes a where btrim(a.imei)=v_imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
      ),
      'sku', coalesce(
        (select t.sku from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
        (select a.sku from public.wms_alocacoes a where btrim(a.imei)=v_imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
      ),
      'modelo', coalesce(
        (select t.modelo from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
        (select a.modelo from public.wms_alocacoes a where btrim(a.imei)=v_imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
      ),
      'grade', coalesce(
        (select t.grade from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
        (select a.grade_venda from public.wms_alocacoes a where btrim(a.imei)=v_imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1)
      ),
      'condicao', (select t.condicao from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
      'status_triagem', (select t.status_atual from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
      'status_wms', (select a.status from public.wms_alocacoes a where btrim(a.imei)=v_imei order by coalesce(a.atualizado_em,a.criado_em) desc nulls last limit 1),
      'local', coalesce(
        (select public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha)
         from public.wms_alocacoes a join public.wms_enderecos e on e.id=a.endereco_id
         where btrim(a.imei)=v_imei and a.status='confirmado'
         order by a.confirmado_em desc nulls last limit 1),
        (select t.local from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
        (select s.local_subinv
         from public.estoque_subinv s
         where btrim(s.imei)=v_imei
         order by s.data_subinv desc nulls last
         limit 1)
      ),
      'data_recebimento', (select t.data_recebimento from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
      'data_oracle', coalesce(
        (select coalesce(t.oracle_confirmado_em, t.data_oracle at time zone 'America/Sao_Paulo')
         from public.assurant_triagem t
         where btrim(t.imei)=v_imei
         order by coalesce(t.atualizado_em,t.criado_em) desc nulls last
         limit 1),
        (select max(public.assurant_oracle_evento_em(o.dt_complete_ri,null))
         from public.entrada_oracle_ap o
         where btrim(o.imei)=v_imei),
        (select max(public.assurant_oracle_evento_em(o.data_emissao_nf,null))
         from public.entrada_oracle_ap o
         where btrim(o.imei)=v_imei)
      ),
      'oracle_status', (
        select coalesce(nullif(o.inv_status,''),nullif(o.po_status,''))
        from public.entrada_oracle_ap o
        where btrim(o.imei)=v_imei
        order by
          (public.assurant_oracle_evento_em(o.dt_complete_ri,null) is not null) desc,
          o.importado_em desc nulls last
        limit 1
      ),
      'oracle_po', (
        select coalesce(nullif(o.po_gerada,''),nullif(o.id_po,''))
        from public.entrada_oracle_ap o
        where btrim(o.imei)=v_imei
        order by o.importado_em desc nulls last
        limit 1
      ),
      'oracle_ri', (
        select nullif(o.ri_numero,'')
        from public.entrada_oracle_ap o
        where btrim(o.imei)=v_imei
        order by o.importado_em desc nulls last
        limit 1
      ),
      'oracle_nf', (
        select nullif(o.nota_gerada,'')
        from public.entrada_oracle_ap o
        where btrim(o.imei)=v_imei
        order by o.importado_em desc nulls last
        limit 1
      ),
      'status_bateria', (select t.status_bateria from public.assurant_triagem t where btrim(t.imei)=v_imei order by coalesce(t.atualizado_em,t.criado_em) desc nulls last limit 1),
      'data_subinv', (select s.data_subinv from public.estoque_subinv s where btrim(s.imei)=v_imei order by s.data_subinv desc nulls last limit 1),
      'local_subinv', (select s.local_subinv from public.estoque_subinv s where btrim(s.imei)=v_imei order by s.data_subinv desc nulls last limit 1),
      'ciclos_wms', (select count(*) from public.wms_alocacoes a where btrim(a.imei)=v_imei),
      'pedidos_b2c', (select count(*) from public.pedidos_b2c p where btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei),
      'pedidos_b2b', (select count(*) from public.b2b_itens i where btrim(i.imei)=v_imei)
    )
    into v_resumo;
  elsif v_pedido is not null then
    select jsonb_build_object(
      'imei', null,
      'voucher', null,
      'sku', p.sku_produto,
      'modelo', p.titulo_produto,
      'grade', p.grade_produto,
      'condicao', null,
      'status_triagem', null,
      'status_wms', null,
      'local', p.local_alocado,
      'data_recebimento', null,
      'data_oracle', null,
      'status_bateria', null,
      'data_subinv', p.data_subinv_alocado,
      'local_subinv', p.local_subinv_alocado,
      'ciclos_wms', 0,
      'pedidos_b2c', 1,
      'pedidos_b2b', 0,
      'pedido', p.id_anymarket,
      'nf', p.numero_nf
    )
    into v_resumo
    from public.pedidos_b2c p
    where p.id_anymarket=v_pedido
    order by p.item_seq nulls first
    limit 1;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'status', a.status,
        'voucher', a.voucher,
        'sku', a.sku,
        'grade_fisica', a.grade_fisica,
        'grade_venda', a.grade_venda,
        'local', public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha),
        'endereco_status', e.status,
        'criado_em', a.criado_em,
        'confirmado_em', a.confirmado_em,
        'cancelado_em', a.cancelado_em,
        'retirado_em', a.retirado_em,
        'saida_canal', a.saida_canal,
        'saida_referencia', a.saida_referencia,
        'bipagens', a.bipagens
      )
      order by coalesce(a.confirmado_em,a.criado_em) desc
    ),
    '[]'::jsonb
  )
  into v_wms
  from public.wms_alocacoes a
  left join public.wms_enderecos e on e.id=a.endereco_id
  where v_imei is not null and btrim(a.imei)=v_imei;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', p.id,
        'pedido', p.id_anymarket,
        'marketplace', p.marketplace,
        'cliente', p.cliente,
        'status', p.status,
        'status_anymarket', p.status_anymarket,
        'sku_produto', p.sku_produto,
        'sku_alocado', p.sku_alocado,
        'grade_produto', p.grade_produto,
        'grade_alocada', p.grade_alocada,
        'imei_alocado', p.imei_alocado,
        'imei_bipado', p.imei_bipado,
        'numero_nf', p.numero_nf,
        'chave_nf', p.chave_nf,
        'rastreio', p.codigo_de_rastreio,
        'grupo', g.numero,
        'criado_em', p.criado_em,
        'alocado_em', p.alocado_em,
        'bipado_em', p.bipado_em,
        'analise_em', p.analise_em,
        'resolvido_em', p.resolvido_em,
        'embalado_em', p.embalado_em,
        'faturado_em', p.faturado_em,
        'definicao_status', p.definicao_status,
        'definicao_resumo', p.definicao_resumo
      )
      order by p.criado_em desc
    ),
    '[]'::jsonb
  )
  into v_b2c
  from public.pedidos_b2c p
  left join public.pedidos_b2c_grupos g on g.id=p.grupo_id
  where (
    v_imei is not null
    and (
      btrim(coalesce(p.imei_alocado,''))=v_imei
      or btrim(coalesce(p.imei_bipado,''))=v_imei
    )
  )
  or (v_pedido is not null and p.id_anymarket=v_pedido);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'item_id', i.id,
        'pedido_id', i.pedido_id,
        'lote', p.lote,
        'cliente', p.cliente,
        'pedido_status', p.status,
        'item_status', i.status,
        'voucher', i.voucher,
        'imei', i.imei,
        'modelo', i.modelo,
        'grade', i.grade,
        'local_estoque', i.local_estoque,
        'nf', i.nf,
        'bipado_em', i.bipado_em,
        'embalado_em', i.embalado_em,
        'nao_localizado_em', i.nao_localizado_em,
        'localizado_em', i.localizado_em,
        'nao_faturar_em', i.nao_faturar_em,
        'motivo_nao_faturar', i.motivo_nao_faturar,
        'obs_nf', i.obs_nf
      )
      order by p.criado_em desc nulls last, i.bipado_em desc nulls last
    ),
    '[]'::jsonb
  )
  into v_b2b
  from public.b2b_itens i
  left join public.b2b_pedidos p on p.id=i.pedido_id
  where v_imei is not null and btrim(i.imei)=v_imei;

  with eventos as (
    select
      t.data_recebimento at time zone 'America/Sao_Paulo' as data,
      'Recebimento'::text as categoria,
      'Recebimento registrado'::text as evento,
      t.status_atual::text as status,
      concat_ws(' · ', nullif(t.voucher,''), nullif(t.cliente,''), nullif(t.loja,''))::text as descricao,
      'assurant_triagem'::text as origem,
      null::uuid as usuario_id,
      t.id::text as referencia,
      jsonb_build_object('voucher',t.voucher,'sku',t.sku,'modelo',t.modelo) as extra
    from public.assurant_triagem t
    where v_imei is not null and btrim(t.imei)=v_imei and t.data_recebimento is not null

    union all
    select
      a.criado_em,
      'Rastreabilidade'::text,
      case
        when a.campo='imei' then 'Troca de IMEI'
        when a.campo='modelo' then 'Alteração de modelo'
        when a.campo='sku' then 'Alteração de SKU'
        when a.campo='cor' then 'Alteração de cor'
        else 'Ajuste cadastral'
      end::text,
      'corrigido'::text,
      concat_ws(
        ' · ',
        case
          when nullif(trim(a.valor_anterior),'') is not null
            then a.valor_anterior || ' → ' || a.valor_novo
          else a.valor_novo
        end,
        nullif(a.motivo,'')
      )::text,
      'assurant_rastreabilidade_ajustes'::text,
      a.criado_por,
      a.id::text,
      jsonb_build_object(
        'campo',a.campo,
        'valor_anterior',a.valor_anterior,
        'valor_novo',a.valor_novo,
        'motivo',a.motivo
      )
    from public.assurant_rastreabilidade_ajustes a
    where v_imei is not null and btrim(a.imei)=v_imei

    union all
    select t.data_funcional at time zone 'America/Sao_Paulo','Triagem','Triagem funcional concluída',
      coalesce(t.resultado_triagem_funcional,t.triagem_funcional),
      concat_ws(' · ', nullif(t.condicao,''), nullif(t.status_bateria,'')),
      'assurant_triagem',t.funcional_por,t.id::text,
      jsonb_build_object('respostas',t.respostas_funcional,'bateria_percentual',t.bateria_percentual)
    from public.assurant_triagem t
    where v_imei is not null and btrim(t.imei)=v_imei and t.data_funcional is not null

    union all
    select t.data_laudo at time zone 'America/Sao_Paulo','Triagem','Laudo concluído',
      t.condicao, nullif(t.defeitos_adicionais,''),'assurant_triagem',t.laudo_por,t.id::text,
      jsonb_build_object('condicao',t.condicao,'defeitos',t.defeitos_adicionais)
    from public.assurant_triagem t
    where v_imei is not null and btrim(t.imei)=v_imei and t.data_laudo is not null

    union all
    select t.data_cosmetico at time zone 'America/Sao_Paulo','Triagem','Triagem cosmética concluída',
      coalesce(t.grade_cosmetica,t.grade),
      concat_ws(' · ', nullif(t.laterais,''), nullif(t.traseira,'')),
      'assurant_triagem',t.cosmetico_por,t.id::text,
      jsonb_build_object('grade',t.grade,'grade_cosmetica',t.grade_cosmetica,'laterais',t.laterais,'traseira',t.traseira)
    from public.assurant_triagem t
    where v_imei is not null and btrim(t.imei)=v_imei and t.data_cosmetico is not null

    union all
    select coalesce(t.oracle_confirmado_em,t.data_oracle at time zone 'America/Sao_Paulo'),
      'Oracle','Entrada Oracle registrada','Oracle realizado',
      concat_ws(' · ', nullif(t.sku,''), nullif(t.modelo,'')),
      'assurant_triagem',t.oracle_confirmado_por,t.id::text,
      jsonb_build_object('sku',t.sku,'modelo',t.modelo)
    from public.assurant_triagem t
    where v_imei is not null and btrim(t.imei)=v_imei and (t.oracle_confirmado_em is not null or t.data_oracle is not null)

    union all
    select
      coalesce(
        public.assurant_oracle_evento_em(o.dt_complete_ri,null),
        public.assurant_oracle_evento_em(o.data_emissao_nf,null),
        o.importado_em
      ),
      'Oracle',
      'Entrada Oracle registrada',
      coalesce(nullif(o.inv_status,''),nullif(o.po_status,''),'Oracle'),
      concat_ws(
        ' · ',
        case when nullif(o.po_gerada,'') is not null then 'PO '||o.po_gerada end,
        case when nullif(o.ri_numero,'') is not null then 'RI '||o.ri_numero end,
        case when nullif(o.nota_gerada,'') is not null then 'NF '||o.nota_gerada end,
        case when nullif(o.filial,'') is not null then o.filial end
      ),
      'entrada_oracle_ap',
      null::uuid,
      o.id::text,
      jsonb_strip_nulls(jsonb_build_object(
        'po',o.po_gerada,
        'id_po',o.id_po,
        'ri',o.ri_numero,
        'nf',o.nota_gerada,
        'inv_status',o.inv_status,
        'po_status',o.po_status,
        'status_sefaz',o.status_sefaz,
        'filial',o.filial,
        'importado_em',o.importado_em,
        'importado_por',o.importado_por
      ))
    from public.entrada_oracle_ap o
    where v_imei is not null
      and btrim(o.imei)=v_imei
      and o.id=(
        select oo.id
        from public.entrada_oracle_ap oo
        where btrim(oo.imei)=v_imei
        order by
          (public.assurant_oracle_evento_em(oo.dt_complete_ri,null) is not null) desc,
          oo.importado_em desc nulls last
        limit 1
      )

    union all
    select a.criado_em,'WMS','Ciclo físico WMS iniciado',a.status,
      concat_ws(' · ', nullif(a.voucher,''), nullif(a.sku,'')),
      'wms_alocacoes',a.operador_id,a.id::text,
      jsonb_build_object('bipagens',a.bipagens,'alocacao_id',a.id)
    from public.wms_alocacoes a
    where v_imei is not null and btrim(a.imei)=v_imei and a.criado_em is not null

    union all
    select a.confirmado_em,'WMS','Armazenagem confirmada','confirmado',
      public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha),
      'wms_alocacoes',a.confirmado_por,a.id::text,
      jsonb_build_object('endereco_id',a.endereco_id,'grade_fisica',a.grade_fisica,'grade_venda',a.grade_venda)
    from public.wms_alocacoes a
    left join public.wms_enderecos e on e.id=a.endereco_id
    where v_imei is not null and btrim(a.imei)=v_imei and a.confirmado_em is not null

    union all
    select a.cancelado_em,'WMS','Alocação WMS cancelada','cancelado',
      public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha),
      'wms_alocacoes',a.operador_id,a.id::text,
      jsonb_build_object('endereco_id',a.endereco_id)
    from public.wms_alocacoes a
    left join public.wms_enderecos e on e.id=a.endereco_id
    where v_imei is not null and btrim(a.imei)=v_imei and a.cancelado_em is not null

    union all
    select a.retirado_em,'WMS','Retirada do WMS','retirado',
      concat_ws(' · ', nullif(a.saida_canal,''), nullif(a.saida_referencia,'')),
      'wms_alocacoes',a.retirado_por,a.id::text,
      jsonb_build_object('saida_canal',a.saida_canal,'saida_referencia',a.saida_referencia,'endereco_id',a.endereco_id)
    from public.wms_alocacoes a
    where v_imei is not null and btrim(a.imei)=v_imei and a.retirado_em is not null

    union all
    select r.reservado_em,'WMS','Reserva de saída criada',r.status,
      concat_ws(' · ', nullif(r.canal,''), nullif(r.motivo,'')),
      'wms_reservas_saida',r.reservado_por,r.id::text,
      jsonb_build_object('alocacao_id',r.alocacao_id,'referencia_id',r.referencia_id)
    from public.wms_reservas_saida r
    where v_imei is not null and btrim(r.imei)=v_imei and r.reservado_em is not null

    union all
    select r.finalizado_em,'WMS','Reserva de saída finalizada',r.status,
      concat_ws(' · ', nullif(r.canal,''), nullif(r.motivo,'')),
      'wms_reservas_saida',r.finalizado_por,r.id::text,
      jsonb_build_object('alocacao_id',r.alocacao_id,'referencia_id',r.referencia_id)
    from public.wms_reservas_saida r
    where v_imei is not null and btrim(r.imei)=v_imei and r.finalizado_em is not null

    union all
    select c.criado_em,'WMS','Evento de carga inicial',c.resultado,
      concat_ws(' · ', nullif(c.regra,''), nullif(c.caixa_codigo,''), nullif(c.local_anterior,'')),
      'wms_carga_inicial_eventos',c.operador_id,c.id::text,
      coalesce(c.snapshot,'{}'::jsonb)
    from public.wms_carga_inicial_eventos c
    where v_imei is not null and btrim(c.imei)=v_imei and c.criado_em is not null

    union all
    select c.caixa_confirmada_em,'WMS','Caixa da carga inicial confirmada',c.resultado,
      nullif(c.caixa_codigo,''),'wms_carga_inicial_eventos',c.caixa_confirmada_por,c.id::text,
      coalesce(c.snapshot,'{}'::jsonb)
    from public.wms_carga_inicial_eventos c
    where v_imei is not null and btrim(c.imei)=v_imei and c.caixa_confirmada_em is not null

    union all
    select c.estornado_em,'WMS','Evento de carga inicial estornado','estornado',
      nullif(c.caixa_codigo,''),'wms_carga_inicial_eventos',c.estornado_por,c.id::text,
      coalesce(c.snapshot,'{}'::jsonb)
    from public.wms_carga_inicial_eventos c
    where v_imei is not null and btrim(c.imei)=v_imei and c.estornado_em is not null

    union all
    select s.atualizado_em,'Estoque','Snapshot do SubInv',s.local_subinv,
      concat('Data SubInv: ',coalesce(to_char(s.data_subinv,'DD/MM/YYYY'),'—')),
      'estoque_subinv',null::uuid,s.imei,
      jsonb_build_object('data_subinv',s.data_subinv,'local_subinv',s.local_subinv)
    from public.estoque_subinv s
    where v_imei is not null and btrim(s.imei)=v_imei and s.atualizado_em is not null

    union all
    select p.criado_em,'B2C','Pedido B2C registrado',p.status,
      concat_ws(' · ', p.id_anymarket::text, nullif(p.marketplace,''), nullif(p.cliente,'')),
      'pedidos_b2c',p.criado_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'sku',p.sku_produto,'grade',p.grade_produto)
    from public.pedidos_b2c p
    where (
      v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei)
    ) or (v_pedido is not null and p.id_anymarket=v_pedido)

    union all
    select p.definicao_solicitada_em,'B2C','Definição de produto solicitada',p.definicao_status,
      concat_ws(' · ', p.id_anymarket::text, nullif(p.sku_produto,'')),
      'pedidos_b2c',p.definicao_solicitada_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'resumo',p.definicao_resumo)
    from public.pedidos_b2c p
    where p.definicao_solicitada_em is not null
      and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.definicao_resolvido_em,'B2C','Definição de produto resolvida',p.definicao_status,
      nullif(p.definicao_resumo,''),'pedidos_b2c',p.definicao_resolvido_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'sku_definido',p.sku_definido,'grade_definida',p.grade_definida)
    from public.pedidos_b2c p
    where p.definicao_resolvido_em is not null
      and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.alocado_em,'B2C','IMEI alocado ao pedido',p.status,
      concat_ws(' · ', p.id_anymarket::text, nullif(p.imei_alocado,''), nullif(p.local_alocado,'')),
      'pedidos_b2c',p.alocado_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'imei',p.imei_alocado,'fifo_posicao',p.fifo_posicao,'fifo_total',p.fifo_total_candidatos)
    from public.pedidos_b2c p
    where p.alocado_em is not null
      and ((v_imei is not null and btrim(coalesce(p.imei_alocado,''))=v_imei)
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.bipado_em,'B2C','IMEI bipado no picking',p.status,
      concat_ws(' · ', p.id_anymarket::text, nullif(p.imei_bipado,'')),
      'pedidos_b2c',p.bipado_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'imei',p.imei_bipado)
    from public.pedidos_b2c p
    where p.bipado_em is not null
      and ((v_imei is not null and btrim(coalesce(p.imei_bipado,''))=v_imei)
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.analise_em,'B2C','Pedido enviado para análise','em_analise',
      nullif(p.motivo_analise,''),'pedidos_b2c',p.analise_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket)
    from public.pedidos_b2c p
    where p.analise_em is not null
      and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.resolvido_em,'B2C','Análise resolvida',p.status,
      nullif(p.motivo_analise,''),'pedidos_b2c',p.resolvido_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket)
    from public.pedidos_b2c p
    where p.resolvido_em is not null
      and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.embalado_em,'B2C','Embalagem concluída','embalado',
      concat_ws(' · ', p.id_anymarket::text, nullif(p.codigo_embalagem,'')),
      'pedidos_b2c',p.embalado_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'codigo_embalagem',p.codigo_embalagem)
    from public.pedidos_b2c p
    where p.embalado_em is not null
      and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select p.faturado_em,'Faturamento','Faturamento B2C registrado','faturado',
      concat_ws(' · ', 'NF '||coalesce(p.numero_nf,'—'), nullif(p.marketplace,'')),
      'pedidos_b2c',p.faturado_por,p.id::text,
      jsonb_build_object('pedido',p.id_anymarket,'nf',p.numero_nf,'chave_nf',p.chave_nf,'rastreio',p.codigo_de_rastreio)
    from public.pedidos_b2c p
    where p.faturado_em is not null
      and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
           or (v_pedido is not null and p.id_anymarket=v_pedido))

    union all
    select f.criado_em,'FIFO','Decisão FIFO registrada',f.origem,
      concat_ws(' · ', 'Pedido '||coalesce(f.id_anymarket,'—'), 'Posição '||coalesce(f.posicao_escolhida::text,'—')),
      'fifo_auditoria',f.criado_por,f.id::text,
      jsonb_build_object('sku_buscado',f.sku_buscado,'grade_alvo',f.grade_alvo,'imei_escolhido',f.imei_escolhido,'total_candidatos',f.total_candidatos)
    from public.fifo_auditoria f
    where f.criado_em is not null
      and ((v_imei is not null and btrim(coalesce(f.imei_escolhido,''))=v_imei)
           or (v_pedido is not null and f.id_anymarket=v_pedido::text))

    union all
    select bp.criado_em at time zone 'America/Sao_Paulo','B2B','Pedido B2B criado',bp.status,
      concat_ws(' · ', nullif(bp.lote,''), nullif(bp.cliente,'')),
      'b2b_pedidos',bp.criado_por,bp.id::text,
      jsonb_build_object('lote',bp.lote,'cliente',bp.cliente,'item_status',bi.status)
    from public.b2b_itens bi
    join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where v_imei is not null and btrim(bi.imei)=v_imei and bp.criado_em is not null

    union all
    select bi.bipado_em at time zone 'America/Sao_Paulo','B2B','Item bipado no picking',bi.status,
      concat_ws(' · ', nullif(bp.lote,''), nullif(bi.local_estoque,'')),
      'b2b_itens',bi.bipado_por,bi.id::text,
      jsonb_build_object('lote',bp.lote,'nf',bi.nf)
    from public.b2b_itens bi
    left join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where v_imei is not null and btrim(bi.imei)=v_imei and bi.bipado_em is not null

    union all
    select bi.embalado_em at time zone 'America/Sao_Paulo','B2B','Item embalado',bi.status,
      concat_ws(' · ', nullif(bp.lote,''), nullif(bi.nf,'')),
      'b2b_itens',bi.embalado_por,bi.id::text,
      jsonb_build_object('lote',bp.lote,'nf',bi.nf)
    from public.b2b_itens bi
    left join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where v_imei is not null and btrim(bi.imei)=v_imei and bi.embalado_em is not null

    union all
    select bi.nao_localizado_em at time zone 'America/Sao_Paulo','B2B','Item não localizado','nao_localizado',
      concat_ws(' · ', nullif(bi.nao_localizado_local,''), nullif(bi.motivo_nao_faturar,'')),
      'b2b_itens',bi.nao_localizado_por,bi.id::text,
      jsonb_build_object('lote',bp.lote)
    from public.b2b_itens bi
    left join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where v_imei is not null and btrim(bi.imei)=v_imei and bi.nao_localizado_em is not null

    union all
    select bi.localizado_em,'B2B','Item localizado',bi.status,
      nullif(bi.localizado_local,''),'b2b_itens',bi.localizado_por,bi.id::text,
      jsonb_build_object('lote',bp.lote)
    from public.b2b_itens bi
    left join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where v_imei is not null and btrim(bi.imei)=v_imei and bi.localizado_em is not null

    union all
    select bi.nao_faturar_em,'B2B','Item marcado para não faturar','nao_faturar',
      concat_ws(' · ', nullif(bi.motivo_nao_faturar,''), nullif(bi.obs_nao_faturar,'')),
      'b2b_itens',bi.nao_faturar_por,bi.id::text,
      jsonb_build_object('lote',bp.lote,'nf',bi.nf)
    from public.b2b_itens bi
    left join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where v_imei is not null and btrim(bi.imei)=v_imei and bi.nao_faturar_em is not null

    union all
    select em.criado_em,'Expedição','Etiqueta de marketplace registrada','etiqueta',
      concat_ws(' · ', 'NF '||coalesce(em.numero_nf,'—'), nullif(em.marketplace,''), nullif(em.tag_code,'')),
      'etiquetas_marketplace',em.criado_por,em.id::text,
      jsonb_build_object('nf',em.numero_nf,'pedido_mkt',em.pedido_mkt,'tag_code',em.tag_code,'arquivo_origem',em.arquivo_origem)
    from public.etiquetas_marketplace em
    where em.criado_em is not null
      and exists (
        select 1 from public.pedidos_b2c p
        where nullif(btrim(p.numero_nf),'')=nullif(btrim(em.numero_nf),'')
          and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
               or (v_pedido is not null and p.id_anymarket=v_pedido))
      )

    union all
    select em.impresso_em,'Expedição','Etiqueta de marketplace impressa','impresso',
      concat_ws(' · ', 'NF '||coalesce(em.numero_nf,'—'), nullif(em.tag_code,'')),
      'etiquetas_marketplace',em.impresso_por,em.id::text,
      jsonb_build_object('nf',em.numero_nf,'total_impressoes',em.total_impressoes)
    from public.etiquetas_marketplace em
    where em.impresso_em is not null
      and exists (
        select 1 from public.pedidos_b2c p
        where nullif(btrim(p.numero_nf),'')=nullif(btrim(em.numero_nf),'')
          and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
               or (v_pedido is not null and p.id_anymarket=v_pedido))
      )

    union all
    select ri.bipado_em,'Expedição','Bipagem em romaneio',r.status,
      concat_ws(' · ', 'Romaneio #'||r.numero::text, nullif(r.canal,''), nullif(ri.etiqueta,'')),
      'romaneio_itens',ri.bipado_por,ri.id::text,
      jsonb_build_object('romaneio',r.numero,'canal',r.canal,'chave_nf',ri.chave_nf)
    from public.romaneio_itens ri
    join public.romaneios r on r.id=ri.romaneio_id
    where ri.bipado_em is not null
      and exists (
        select 1 from public.pedidos_b2c p
        where nullif(btrim(p.chave_nf),'')=nullif(btrim(ri.chave_nf),'')
          and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
               or (v_pedido is not null and p.id_anymarket=v_pedido))
      )

    union all
    select r.fechado_em,'Expedição','Romaneio fechado',r.status,
      concat_ws(' · ', 'Romaneio #'||r.numero::text, nullif(r.canal,'')),
      'romaneios',null::uuid,r.id::text,
      jsonb_build_object('romaneio',r.numero,'canal',r.canal,'total_volumes',r.total_volumes)
    from public.romaneios r
    where r.fechado_em is not null
      and exists (
        select 1
        from public.romaneio_itens ri
        join public.pedidos_b2c p on nullif(btrim(p.chave_nf),'')=nullif(btrim(ri.chave_nf),'')
        where ri.romaneio_id=r.id
          and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
               or (v_pedido is not null and p.id_anymarket=v_pedido))
      )

    union all
    select am.importado_em,'Marketplace','Snapshot AnyMarket importado',am.status,
      concat_ws(' · ', am.id_anymarket::text, nullif(am.status_no_marketplace,''), nullif(am.status_da_entrega_no_marketplace,'')),
      'anymarket_pedidos',am.importado_por,am.id::text,
      jsonb_build_object('pedido',am.id_anymarket,'nf',am.numero_da_nota_fiscal,'chave_nf',am.chave_de_acesso_nf,'rastreio',am.codigo_de_rastreio,'substatus_entrega',am.substatus_da_entrega_no_marketplace)
    from (
      select distinct on (a.id_anymarket) a.*
      from public.anymarket_pedidos a
      where exists (
        select 1 from public.pedidos_b2c p
        where p.id_anymarket=a.id_anymarket
          and ((v_imei is not null and (btrim(coalesce(p.imei_alocado,''))=v_imei or btrim(coalesce(p.imei_bipado,''))=v_imei))
               or (v_pedido is not null and p.id_anymarket=v_pedido))
      )
      order by a.id_anymarket,a.importado_em desc
    ) am
    where am.importado_em is not null
  ),
  enriquecidos as (
    select
      e.data,e.categoria,e.evento,e.status,e.descricao,e.origem,e.referencia,e.extra,
      e.usuario_id,
      coalesce(u.nome, case when e.usuario_id is not null then e.usuario_id::text end) as usuario
    from eventos e
    left join public.user_profiles u on u.id=e.usuario_id
    where e.data is not null
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'data', data,
        'categoria', categoria,
        'evento', evento,
        'status', status,
        'descricao', descricao,
        'origem', origem,
        'referencia', referencia,
        'usuario_id', usuario_id,
        'usuario', usuario,
        'extra', extra
      )
      order by data desc, categoria, evento
    ),
    '[]'::jsonb
  )
  into v_eventos
  from enriquecidos;

  return jsonb_build_object(
    'privado', true,
    'busca', v_busca,
    'selecionado_imei', v_imei,
    'selecionado_pedido', v_pedido,
    'matches', v_matches,
    'resumo', v_resumo,
    'eventos', v_eventos,
    'wms_ciclos', v_wms,
    'pedidos_b2c', v_b2c,
    'pedidos_b2b', v_b2b
  );
end;
$function$;


CREATE OR REPLACE FUNCTION public.assurant_rastreabilidade_privada_fast(p_busca text DEFAULT NULL::text, p_imei text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_busca text := nullif(btrim(p_busca),'');
  v_imei text := nullif(btrim(p_imei),'');
  v_search jsonb;
  v_matches jsonb := '[]'::jsonb;
  v_sel text;
  v_pedido bigint;
  v_result jsonb;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Acesso restrito à Rastreabilidade do Item'
      using errcode='42501';
  end if;

  if v_busca is null and v_imei is null then
    return public.assurant_rastreabilidade_privada(null,null);
  end if;

  if v_busca is not null and v_busca ~ '^[0-9]+$' then
    select p.id_anymarket
    into v_pedido
    from public.pedidos_b2c p
    where p.id_anymarket::text=v_busca
       or nullif(btrim(p.numero_nf),'')=v_busca
       or nullif(btrim(p.chave_nf),'')=v_busca
    order by p.atualizado_em desc nulls last
    limit 1;
  end if;

  -- Pedido sem aparelho também tem histórico próprio, em qualquer status.
  if v_pedido is not null and v_imei is null and not exists (
    select 1 from public.pedidos_b2c p
    where p.id_anymarket=v_pedido
      and coalesce(nullif(btrim(p.imei_bipado),''),nullif(btrim(p.imei_alocado),'')) is not null
  ) then
    return public.assurant_rastreabilidade_privada(v_pedido::text,null)
      || jsonb_build_object('busca',v_busca,'selecionado_pedido',v_pedido,'matches','[]'::jsonb);
  end if;

  if v_busca is not null then
    v_search := public.assurant_rastreabilidade_matches_fast(v_busca);
    v_matches := coalesce(v_search->'matches','[]'::jsonb);
    v_sel := nullif(v_search->>'selected_imei','');
  end if;

  if v_imei is not null then
    v_sel := v_imei;
  end if;

  if v_sel is null and v_pedido is not null then
    return public.assurant_rastreabilidade_privada(v_busca,null)
      || jsonb_build_object('busca',v_busca,'selecionado_pedido',v_pedido,'matches',v_matches);
  end if;

  if v_sel is null then
    return jsonb_build_object(
      'privado',true,
      'busca',v_busca,
      'selecionado_imei',null,
      'selecionado_pedido',v_pedido,
      'matches',v_matches,
      'resumo',null,
      'eventos','[]'::jsonb,
      'wms_ciclos','[]'::jsonb,
      'pedidos_b2c','[]'::jsonb,
      'pedidos_b2b','[]'::jsonb
    );
  end if;

  -- Mantém o pedido exato no contexto e evita varredura textual na rotina completa.
  v_result := public.assurant_rastreabilidade_privada(case when v_pedido is not null then v_pedido::text else null end,v_sel);

  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'busca',v_busca,
      'selecionado_imei',v_sel,
      'selecionado_pedido',v_pedido,
      'matches',v_matches
    );
end;
$function$;
