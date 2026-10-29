-- Ignora a atualização operacional de divergências no GAIA (o espelho ainda recebe os dados).
-- Evita erro no trigger BEFORE INSERT mesmo durante ON CONFLICT.
-- Importação não modifica local/endereços de estoque nem o WMS.
CREATE OR REPLACE FUNCTION public.upsert_triagem(rows jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'Usuário não autenticado';
  end if;

  /*
   * Guarda sempre o último estado recebido do GAIA antes do merge.
   * Assim a transição GAIA -> Liquida continua auditável mesmo quando
   * os campos operacionais do Liquida precisam ser preservados.
   */
  insert into public.assurant_gaia_ultimo (
    voucher,
    imei,
    status_gaia,
    grade_gaia,
    tela,
    laterais,
    traseira,
    data_funcional,
    data_cosmetico,
    data_laudo,
    atualizado_em_gaia,
    payload,
    importado_em,
    importado_por
  )
  select distinct on (upper(trim(r->>'voucher')))
    upper(trim(r->>'voucher')),
    nullif(trim(r->>'imei'),''),
    nullif(trim(r->>'status_atual'),''),
    nullif(trim(r->>'grade'),''),
    nullif(trim(r->>'tela'),''),
    nullif(trim(r->>'laterais'),''),
    nullif(trim(r->>'traseira'),''),
    nullif(r->>'data_funcional','')::timestamptz,
    nullif(r->>'data_cosmetico','')::timestamptz,
    nullif(r->>'data_laudo','')::timestamptz,
    nullif(r->>'atualizado_em','')::timestamptz,
    r,
    now(),
    auth.uid()
  from pg_catalog.jsonb_array_elements(rows) as r
  where nullif(trim(r->>'voucher'),'') is not null
  order by
    upper(trim(r->>'voucher')),
    nullif(r->>'atualizado_em','')::timestamptz desc nulls last
  on conflict (voucher) do update set
    imei=excluded.imei,
    status_gaia=excluded.status_gaia,
    grade_gaia=excluded.grade_gaia,
    tela=excluded.tela,
    laterais=excluded.laterais,
    traseira=excluded.traseira,
    data_funcional=excluded.data_funcional,
    data_cosmetico=excluded.data_cosmetico,
    data_laudo=excluded.data_laudo,
    atualizado_em_gaia=excluded.atualizado_em_gaia,
    payload=excluded.payload,
    importado_em=excluded.importado_em,
    importado_por=excluded.importado_por;

  with registros as (
    select distinct on (
      upper(trim(r->>'voucher'))
    )
      r
    from pg_catalog.jsonb_array_elements(rows) as r
    where nullif(trim(r->>'voucher'), '') is not null
      -- O BEFORE INSERT de triagem bloqueia a divergência ANTES do ON CONFLICT.
      -- Arquivamos a linha em assurant_gaia_ultimo, sem tocar na triagem segregada.
      and not exists (
        select 1 from public.assurant_divergencias_imei d
         where d.voucher = upper(trim(r->>'voucher'))
           and d.status in ('pendente','devolver')
      )
    order by
      upper(trim(r->>'voucher')),
      nullif(r->>'atualizado_em', '')::timestamptz desc nulls last
  )
  insert into public.assurant_triagem (
    voucher,
    imei,
    sku,
    modelo,
    local,
    cliente,
    loja,
    rede,
    tipo_de_rede,
    lote,
    status_atual,
    condicao,
    triagem_funcional,
    grade,
    criado_em,
    atualizado_em,
    tela,
    laterais,
    traseira,
    defeitos_adicionais,
    resultado_triagem_funcional,
    data_recebimento,
    data_funcional,
    data_cosmetico,
    data_laudo,
    data_alocacao,
    data_oracle,
    respostas_funcional,
    status_bateria,
    reanalise,
    aging,
    uploaded_by,
    mes_referencia,
    origem_triagem
  )
  select
    upper(trim(r->>'voucher')),
    nullif(trim(r->>'imei'), ''),
    nullif(upper(trim(r->>'sku')), ''),
    r->>'modelo',
    null::text, -- O relatório GAIA não define nem modifica endereços de estoque.
    r->>'cliente',
    r->>'loja',
    r->>'rede',
    r->>'tipo_de_rede',
    r->>'lote',

    case
      when lower(trim(coalesce(r->>'status_atual', ''))) in (
        'aguardando alocação',
        'aguardando alocacao',
        'aguardando locação',
        'aguardando locacao'
      )
      then 'Aguardando armazenagem'
      else nullif(trim(r->>'status_atual'), '')
    end,

    r->>'condicao',
    r->>'triagem_funcional',
    r->>'grade',
    nullif(r->>'criado_em', '')::timestamptz,
    nullif(r->>'atualizado_em', '')::timestamptz,
    r->>'tela',
    r->>'laterais',
    r->>'traseira',
    r->>'defeitos_adicionais',
    r->>'resultado_triagem_funcional',
    nullif(r->>'data_recebimento', '')::timestamptz,
    nullif(r->>'data_funcional', '')::timestamptz,
    nullif(r->>'data_cosmetico', '')::timestamptz,
    nullif(r->>'data_laudo', '')::timestamptz,
    nullif(r->>'data_alocacao', '')::timestamptz,
    nullif(r->>'data_oracle', '')::timestamptz,
    r->>'respostas_funcional',
    r->>'status_bateria',
    r->>'reanalise',
    r->>'aging',
    nullif(r->>'uploaded_by', '')::uuid,
    r->>'mes_referencia',
    'gaia'
  from registros

  on conflict (voucher) do update set
    /*
     * A partir do momento em que a triagem operacional foi iniciada
     * dentro do Liquida, o GAIA deixa de ser fonte de verdade para
     * identidade/status/campos da triagem desse ciclo.
     */
    imei = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.imei
      else excluded.imei
    end,

    sku = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.sku
      else excluded.sku
    end,

    modelo = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.modelo
      else excluded.modelo
    end,

    cliente = excluded.cliente,
    loja = excluded.loja,
    rede = excluded.rede,
    tipo_de_rede = excluded.tipo_de_rede,
    lote = excluded.lote,

    status_atual = case
      -- Não retirar do fluxo de definição/devolução um produto sob decisão pendente.
      when exists (
        select 1
        from public.assurant_divergencias_imei d
        where d.voucher = public.assurant_triagem.voucher
          and d.status in ('pendente','devolver')
      ) then public.assurant_triagem.status_atual
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and public.assurant_gaia_legado_pode_avancar(
         public.assurant_triagem.data_recebimento,
         public.assurant_triagem.criado_em,
         public.assurant_triagem.status_atual,
         excluded.status_atual,
         excluded.grade
       )
       and not public.wms_imei_protegido(public.assurant_triagem.imei, excluded.imei)
      then 'Aguardando armazenagem'
      when
        (
          (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
          and (
            public.assurant_triagem.data_funcional is not null
            or public.assurant_triagem.data_cosmetico is not null
            or public.assurant_triagem.data_laudo is not null
            or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
          )
        )
        or lower(trim(coalesce(public.assurant_triagem.status_atual,''))) in (
          'reservado para pedido b2c',
          'reservado para pedido b2b'
        )
        or public.wms_imei_protegido(public.assurant_triagem.imei, excluded.imei)
      then public.assurant_triagem.status_atual
      else excluded.status_atual
    end,

    condicao = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.condicao
      else excluded.condicao
    end,

    triagem_funcional = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.triagem_funcional
      else excluded.triagem_funcional
    end,

    grade = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and public.assurant_triagem.grade is null
       and public.assurant_gaia_legado_pode_avancar(
         public.assurant_triagem.data_recebimento,
         public.assurant_triagem.criado_em,
         public.assurant_triagem.status_atual,
         excluded.status_atual,
         excluded.grade
       )
       and not public.wms_imei_protegido(public.assurant_triagem.imei, excluded.imei)
      then excluded.grade
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.grade
      else excluded.grade
    end,

    criado_em = coalesce(
      public.assurant_triagem.criado_em,
      excluded.criado_em
    ),

    atualizado_em = greatest(
      public.assurant_triagem.atualizado_em,
      excluded.atualizado_em
    ),

    tela = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.tela
      else excluded.tela
    end,

    laterais = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.laterais
      else excluded.laterais
    end,

    traseira = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.traseira
      else excluded.traseira
    end,

    defeitos_adicionais = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.defeitos_adicionais
      else excluded.defeitos_adicionais
    end,

    resultado_triagem_funcional = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then public.assurant_triagem.resultado_triagem_funcional
      else excluded.resultado_triagem_funcional
    end,

    data_recebimento = coalesce(public.assurant_triagem.data_recebimento, excluded.data_recebimento),

    data_funcional = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and public.assurant_triagem.data_funcional is not null
      then public.assurant_triagem.data_funcional
      else excluded.data_funcional
    end,

    data_cosmetico = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and public.assurant_triagem.data_cosmetico is not null
      then public.assurant_triagem.data_cosmetico
      else excluded.data_cosmetico
    end,

    data_laudo = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and public.assurant_triagem.data_laudo is not null
      then public.assurant_triagem.data_laudo
      else excluded.data_laudo
    end,

    data_alocacao = coalesce(public.assurant_triagem.data_alocacao, excluded.data_alocacao),
    data_oracle = coalesce(public.assurant_triagem.data_oracle, excluded.data_oracle),

    respostas_funcional = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
      then public.assurant_triagem.respostas_funcional
      else excluded.respostas_funcional
    end,

    status_bateria = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and public.assurant_triagem.data_funcional is not null
      then public.assurant_triagem.status_bateria
      else excluded.status_bateria
    end,

    reanalise = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
       )
      then public.assurant_triagem.reanalise
      else excluded.reanalise
    end,

    aging = excluded.aging,
    uploaded_by = excluded.uploaded_by,
    mes_referencia = excluded.mes_referencia,

    origem_triagem = case
      when (lower(coalesce(public.assurant_triagem.origem_triagem,''))='liquida' or public.assurant_triagem.funcional_por is not null or public.assurant_triagem.cosmetico_por is not null or public.assurant_triagem.laudo_por is not null)
       and (
         public.assurant_triagem.data_funcional is not null
         or public.assurant_triagem.data_cosmetico is not null
         or public.assurant_triagem.data_laudo is not null
         or nullif(trim(coalesce(public.assurant_triagem.respostas_funcional,'')),'') is not null
       )
      then 'liquida'
      else 'gaia'
    end;
end;
$function$
;
