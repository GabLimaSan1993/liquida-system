-- Importações GAIA não podem sobrescrever triagens identificadas por operadores do Liquida.
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
    r->>'local',
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

    local = case
      when
        lower(trim(coalesce(public.assurant_triagem.status_atual,''))) in (
          'reservado para pedido b2c',
          'reservado para pedido b2b'
        )
        or public.wms_imei_protegido(public.assurant_triagem.imei, excluded.imei)
      then public.assurant_triagem.local
      else coalesce(
        nullif(trim(excluded.local), ''),
        public.assurant_triagem.local
      )
    end,

    cliente = excluded.cliente,
    loja = excluded.loja,
    rede = excluded.rede,
    tipo_de_rede = excluded.tipo_de_rede,
    lote = excluded.lote,

    status_atual = case
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
$function$;

CREATE OR REPLACE FUNCTION public.assurant_cosmetica_salvar(p_voucher text, p_tela text, p_laterais text, p_traseira text, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_voucher text := upper(trim(coalesce(p_voucher,'')));
  v_tela text := upper(trim(coalesce(p_tela,'')));
  v_laterais text := upper(trim(coalesce(p_laterais,'')));
  v_traseira text := upper(trim(coalesce(p_traseira,'')));
  v_t public.assurant_triagem%rowtype;
  v_grade_cosmetica text;
  v_grade_final text;
  v_rebaixado boolean := false;
  v_status_final text;
  v_now timestamp without time zone := timezone('UTC',now());
  v_hierarquia text[] := array['QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW'];
  v_bateria_baixa boolean;
begin
  if v_user is null or p_usuario is distinct from v_user then
    return jsonb_build_object('ok',false,'erro','Sessão inválida para concluir a triagem cosmética.');
  end if;

  if v_voucher='' then
    return jsonb_build_object('ok',false,'erro','Voucher obrigatório.');
  end if;

  if not (v_tela = any(v_hierarquia))
     or not (v_laterais = any(v_hierarquia))
     or not (v_traseira = any(v_hierarquia))
  then
    return jsonb_build_object('ok',false,'erro','Classificação cosmética inválida. Preencha tela, laterais e traseira.');
  end if;

  select *
    into v_t
  from public.assurant_triagem
  where upper(trim(voucher))=v_voucher
  order by coalesce(atualizado_em,criado_em) desc nulls last
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',false,'erro',format('Voucher %s não encontrado na triagem.',v_voucher));
  end if;

  if v_t.status_atual in ('Aguardando armazenagem','Triagem de devolução concluída')
     and v_t.data_cosmetico is not null
     and upper(trim(coalesce(v_t.tela,'')))=v_tela
     and upper(trim(coalesce(v_t.laterais,'')))=v_laterais
     and upper(trim(coalesce(v_t.traseira,'')))=v_traseira
  then
    return jsonb_build_object(
      'ok',true,
      'idempotente',true,
      'voucher',v_t.voucher,
      'grade',v_t.grade,
      'gradeCosmetica',v_t.grade_cosmetica,
      'rebaixado',coalesce(v_t.rebaixado_bateria,false),
      'status',v_t.status_atual
    );
  end if;

  if v_t.status_atual is distinct from 'Aguardando triagem cosmética' then
    return jsonb_build_object(
      'ok',false,
      'erro',format(
        'Este aparelho não está aguardando triagem cosmética (status atual: %s).',
        coalesce(v_t.status_atual,'sem status')
      )
    );
  end if;

  select x.grade
    into v_grade_cosmetica
  from (
    values
      (v_tela,array_position(v_hierarquia,v_tela)),
      (v_laterais,array_position(v_hierarquia,v_laterais)),
      (v_traseira,array_position(v_hierarquia,v_traseira))
  ) as x(grade,pos)
  order by x.pos asc
  limit 1;

  v_bateria_baixa := trim(coalesce(v_t.status_bateria,''))='Saúde da bateria entre 70 e 79%';

  if upper(trim(coalesce(v_t.resultado_triagem_funcional,'')))='BAD' then
    v_grade_final := 'QUEBRADO';
    v_rebaixado := false;
  elsif v_bateria_baixa then
    v_rebaixado := true;
    if v_grade_cosmetica in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM') then
      v_grade_final := 'OUTLET';
    else
      v_grade_final := 'QUEBRADO';
    end if;
  else
    v_grade_final := v_grade_cosmetica;
    v_rebaixado := false;
  end if;

  update public.assurant_triagem
     set tela=v_tela,
         laterais=v_laterais,
         traseira=v_traseira,
         grade=v_grade_final,
         grade_cosmetica=v_grade_cosmetica,
         rebaixado_bateria=v_rebaixado,
         status_atual='Aguardando armazenagem',
         data_cosmetico=v_now,
         cosmetico_por=v_user,
         origem_triagem='liquida',
         atualizado_em=v_now
   where id=v_t.id
   returning status_atual
      into v_status_final;

  return jsonb_build_object(
    'ok',true,
    'voucher',v_t.voucher,
    'grade',v_grade_final,
    'gradeCosmetica',v_grade_cosmetica,
    'rebaixado',v_rebaixado,
    'status',v_status_final
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_retriagem_funcional_salvar(p_voucher text, p_imei text, p_sku text, p_modelo text, p_status_proposto text, p_resultado text, p_respostas text, p_status_bateria text, p_bateria_percentual integer, p_defeitos_adicionais text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
    origem_triagem = 'liquida',
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

alter table public.assurant_rastreabilidade_ajustes drop constraint assurant_rastreabilidade_ajustes_campo_chk;
alter table public.assurant_rastreabilidade_ajustes add constraint assurant_rastreabilidade_ajustes_campo_chk check (campo=any(array['cor','sku','imei','modelo','triagem_funcional.revisao','triagem_cosmetica.recuperacao_importacao']::text[]));
