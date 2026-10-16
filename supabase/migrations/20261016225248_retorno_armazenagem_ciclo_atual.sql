-- Retornos físicos autorizados: mantém indicadores normais e resolve o ciclo DEV atual.
create table liquida_private.armazenagem_retornos (
 voucher_solicitado text primary key, voucher_atual text not null unique, imei text not null unique,
 triagem_id uuid not null unique references public.assurant_triagem(id), criado_em timestamptz not null default now(), criado_por uuid not null
);
alter table liquida_private.armazenagem_retornos enable row level security;
revoke all on liquida_private.armazenagem_retornos from public,anon,authenticated;
alter table public.assurant_rastreabilidade_ajustes drop constraint assurant_rastreabilidade_ajustes_campo_chk;
alter table public.assurant_rastreabilidade_ajustes add constraint assurant_rastreabilidade_ajustes_campo_chk check (campo=any(array['cor','sku','imei','modelo','triagem_funcional.revisao','triagem_cosmetica.recuperacao_importacao','carga_inicial.caixas.liberacao','carga_inicial.caixas.divergencia','carga_inicial.caixas.cadastro','armazenagem.retorno_operacional','armazenagem.retorno_cadastro']));
create or replace function liquida_private.armazenagem_retorno_completar(p_referencia text,p_imei text,p_voucher text,p_sku text,p_modelo text,p_grade text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare r liquida_private.armazenagem_retornos%rowtype;t public.assurant_triagem%rowtype;antes jsonb;
begin
 if not liquida_private.caixas_pode_armazenar() then raise exception 'Sem permissão para armazenagem' using errcode='42501';end if;
 select * into r from liquida_private.armazenagem_retornos where voucher_atual=substring(p_referencia from 9) for update;
 if not found then raise exception 'Retorno físico não autorizado';end if;
 select * into strict t from public.assurant_triagem where id=r.triagem_id for update;
 if t.status_atual<>'Aguardando armazenagem' then raise exception 'Aparelho já seguiu para outra etapa';end if;
 if upper(trim(p_voucher)) is distinct from r.voucher_atual or upper(trim(p_imei)) is distinct from upper(r.imei) then raise exception 'Preserve o voucher e a identificação física do retorno';end if;
 if nullif(trim(p_sku),'') is null or nullif(trim(p_modelo),'') is null or p_grade is null or p_grade not in('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW') then raise exception 'Informe SKU, modelo e grade física';end if;
 if exists(select 1 from public.wms_alocacoes a where a.imei=r.imei and a.status in('reservado','confirmado') and a.retirado_em is null) then raise exception 'Aparelho já possui alocação ativa';end if;
 antes:=to_jsonb(t);
 update public.assurant_triagem set sku=coalesce(nullif(trim(sku),''),upper(trim(p_sku))),modelo=coalesce(nullif(trim(modelo),''),trim(p_modelo)),
 grade=case when upper(coalesce(nullif(trim(grade_cosmetica),''),grade,'')) in('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW','OUTLET') then grade else p_grade end,
 grade_cosmetica=case when grade='OUTLET' and nullif(trim(grade_cosmetica),'') is null then p_grade else grade_cosmetica end,atualizado_em=timezone('UTC',now()) where id=t.id returning * into t;
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 values(r.imei,'armazenagem.retorno_cadastro',antes::text,to_jsonb(t)::text,'Classificação física conferida no retorno para armazenagem. Indicadores normais; datas históricas preservadas.',auth.uid());
 return jsonb_build_object('ok',true,'voucher',t.voucher);
end $$;
revoke all on function liquida_private.armazenagem_retorno_completar(text,text,text,text,text,text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.wms_reservar_endereco(p_voucher text, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_voucher text :=
    upper(trim(coalesce(p_voucher, '')));

  v_triagem public.assurant_triagem%rowtype;
  v_respostas jsonb;

  v_marca text;
  v_modelo text;

  v_tipo_catalogo text;
  v_tipo_produto text;

  v_grade_fisica text;

  v_endereco public.wms_enderecos%rowtype;
  v_alocacao public.wms_alocacoes%rowtype;

begin

  /*
   * Confere se o usuário que chamou a função
   * é realmente o usuário conectado.
   */
  if auth.uid() is null
     or p_usuario is distinct from auth.uid()
  then
    raise exception
      'Sessão inválida para reservar endereço.';
  end if;


  v_voucher := coalesce((select r.voucher_atual from liquida_private.armazenagem_retornos r where r.voucher_solicitado=v_voucher),v_voucher);

  if v_voucher = '' then
    return jsonb_build_object(
      'ok', false,
      'erro', 'Informe o voucher.'
    );
  end if;


  /*
   * Cancela automaticamente reservas que ficaram
   * abertas por mais de duas horas.
   */
  with reservas_expiradas as (

    update public.wms_alocacoes

    set
      status = 'expirado',
      cancelado_em = now(),
      atualizado_em = now()

    where status = 'reservado'
      and reservado_ate < now()

    returning
      id,
      endereco_id
  )

  update public.wms_enderecos endereco

  set
    status = 'livre',
    reserva_id = null,
    reservado_ate = null,
    atualizado_em = now()

  from reservas_expiradas reserva

  where endereco.id = reserva.endereco_id
    and endereco.reserva_id = reserva.id
    and endereco.status = 'reservado';


  /*
   * Procura o voucher na tabela de triagem.
   */
  select *
  into v_triagem

  from public.assurant_triagem

  where upper(voucher) = v_voucher

  for update;


  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro',
      format(
        'Voucher %s não encontrado na triagem.',
        v_voucher
      )
    );
  end if;


  /*
   * Se o operador já reservou um endereço para
   * este voucher, a função devolve a mesma reserva.
   *
   * Isso evita criar dois endereços para o mesmo produto.
   */
  select *
  into v_alocacao

  from public.wms_alocacoes

  where upper(voucher) = v_voucher
    and status = 'reservado'

  order by reservado_em desc

  limit 1;


  if found then

    select *
    into v_endereco

    from public.wms_enderecos

    where id = v_alocacao.endereco_id;


    return jsonb_build_object(
      'ok', true,
      'reaberta', true,
      'reserva', to_jsonb(v_alocacao),
      'endereco', to_jsonb(v_endereco)
    );

  end if;


  /*
   * Somente produtos que terminaram a triagem cosmética
   * podem ser armazenados.
   */
  if v_triagem.status_atual is distinct from 'Aguardando armazenagem' then
    perform public.wms_preparar_status_armazenagem(v_voucher);

    select *
      into v_triagem
    from public.assurant_triagem
    where upper(trim(voucher)) = v_voucher
    order by coalesce(atualizado_em,criado_em) desc nulls last
    limit 1
    for update;
  end if;

  if v_triagem.status_atual
     is distinct from 'Aguardando armazenagem'
  then

    return jsonb_build_object(
      'ok', false,
      'erro',
      format(
        'Este produto não está aguardando armazenagem. Status atual: %s.',
        coalesce(
          v_triagem.status_atual,
          'sem status'
        )
      )
    );

  end if;


  /*
   * Lê marca e modelo que foram registrados
   * durante a triagem funcional.
   */
  v_respostas :=
    public.wms_jsonb_seguro(
      v_triagem.respostas_funcional::text
    );


  v_marca :=
    nullif(
      upper(
        trim(
          v_respostas #>> '{produto,marca}'
        )
      ),
      ''
    );


  v_modelo :=
    coalesce(

      nullif(
        upper(
          trim(
            v_respostas #>> '{produto,modelo}'
          )
        ),
        ''
      ),

      nullif(
        upper(
          trim(v_triagem.modelo)
        ),
        ''
      )
    );


  /*
   * Verifica no catálogo se é celular,
   * tablet ou smartwatch.
   */
  select upper(tipo)
  into v_tipo_catalogo

  from public.produtos_catalogo

  where nullif(
          trim(v_triagem.sku),
          ''
        ) is not null

    and upper(
          coalesce(sku_als, '')
        ) = upper(v_triagem.sku)

  order by pendente asc nulls last

  limit 1;


  /*
   * Tablets e relógios vão para a Rua 15.
   * Os demais produtos são tratados como celulares.
   */
  v_tipo_produto :=

    case

      when coalesce(
             v_tipo_catalogo,
             ''
           ) in (
             'TABLET',
             'SMARTWATCH',
             'SMART WATCH',
             'WATCH',
             'RELOGIO',
             'RELÓGIO'
           )

        or coalesce(
             v_modelo,
             ''
           ) ~ '(TABLET|IPAD|WATCH|REL[ÓO]GIO)'

      then 'OUTROS'

      else 'CELULAR'

    end;


  /*
   * Define a classificação física utilizada
   * para escolher a rua.
   *
   * OUTLET continua sendo apenas grade de venda.
   */
  if v_tipo_produto = 'OUTROS' then

    v_grade_fisica := 'OUTROS';


  elsif upper(
          coalesce(
            v_triagem.grade,
            ''
          )
        ) = 'QUEBRADO'
  then

    v_grade_fisica := 'QUEBRADO';


  else

    v_grade_fisica :=
      upper(
        trim(
          coalesce(
            v_triagem.grade_cosmetica,
            v_triagem.grade,
            ''
          )
        )
      );

  end if;


  /*
   * Impede a armazenagem se o produto
   * não possuir uma classificação válida.
   */
  if v_grade_fisica not in (
    'QUEBRADO',
    'REGULAR',
    'BOM',
    'MUITO BOM',
    'EXCELENTE',
    'LIKE NEW',
    'OUTROS'
  )
  then

    return jsonb_build_object(
      'ok', false,
      'erro',
      format(
        'Classificação física inválida ou ausente: %s.',
        coalesce(
          v_grade_fisica,
          'não informada'
        )
      )
    );

  end if;


  /*
   * Escolhe automaticamente o melhor endereço.
   *
   * Prioridades:
   *
   * 1. Mesmo modelo próximo.
   * 2. Mesma marca próxima.
   * 3. Rua correta da grade.
   * 4. Bloco do começo para o fim.
   * 5. Andar de cima para baixo.
   * 6. Coluna A até F.
   * 7. Linha 01 até 10.
   */
  select endereco.*
  into v_endereco

  from public.wms_enderecos endereco

  where endereco.ativo = true
    and endereco.status = 'livre'
    and endereco.grade_fisica = v_grade_fisica
    and endereco.tipo_produto = v_tipo_produto

  order by

    /*
     * Primeiro procura a coluna que já possui
     * aparelhos do mesmo modelo.
     */
    (
      select count(*)

      from public.wms_alocacoes alocacao

      join public.wms_enderecos ocupado
        on ocupado.id = alocacao.endereco_id

      where alocacao.status = 'confirmado'

        and upper(
              coalesce(
                alocacao.modelo,
                ''
              )
            ) = coalesce(
                  v_modelo,
                  ''
                )

        and ocupado.rua = endereco.rua
        and ocupado.bloco = endereco.bloco
        and ocupado.andar = endereco.andar
        and ocupado.coluna = endereco.coluna
    ) desc,


    /*
     * Depois procura o andar que já possui
     * aparelhos da mesma marca.
     */
    (
      select count(*)

      from public.wms_alocacoes alocacao

      join public.wms_enderecos ocupado
        on ocupado.id = alocacao.endereco_id

      where alocacao.status = 'confirmado'

        and upper(
              coalesce(
                alocacao.marca,
                ''
              )
            ) = coalesce(
                  v_marca,
                  ''
                )

        and ocupado.rua = endereco.rua
        and ocupado.bloco = endereco.bloco
        and ocupado.andar = endereco.andar
    ) desc,


    endereco.rua asc,
    endereco.bloco asc,

    /*
     * AD05 primeiro, depois AD04 até AD01.
     */
    endereco.andar desc,

    /*
     * Coluna A primeiro e F por último.
     */
    strpos(
      'ABCDEF',
      endereco.coluna
    ) asc,

    /*
     * Linha 01 primeiro e linha 10 por último.
     */
    endereco.linha asc


  for update of endereco skip locked

  limit 1;


  if not found then

    return jsonb_build_object(
      'ok', false,
      'erro',
      format(
        'Não há posição livre para a classificação %s.',
        v_grade_fisica
      )
    );

  end if;


  /*
   * Cria a reserva.
   */
  insert into public.wms_alocacoes (

    voucher,
    imei,
    endereco_id,

    grade_fisica,
    grade_venda,

    tipo_produto,

    marca,
    modelo,
    sku,

    operador_id

  )

  values (

    v_voucher,
    v_triagem.imei,
    v_endereco.id,

    v_grade_fisica,

    upper(
      nullif(
        trim(v_triagem.grade),
        ''
      )
    ),

    v_tipo_produto,

    v_marca,
    v_modelo,
    v_triagem.sku,

    p_usuario
  )

  returning *
  into v_alocacao;


  /*
   * Marca o endereço como reservado.
   */
  update public.wms_enderecos

  set
    status = 'reservado',
    reserva_id = v_alocacao.id,
    reservado_ate = v_alocacao.reservado_ate,
    atualizado_em = now()

  where id = v_endereco.id;


  /*
   * Recarrega o endereço com os dados da reserva.
   */
  select *
  into v_endereco

  from public.wms_enderecos

  where id = v_endereco.id;


  /*
   * Devolve para a tela todos os dados
   * do endereço escolhido.
   */
  return jsonb_build_object(
    'ok', true,
    'reaberta', false,
    'reserva', to_jsonb(v_alocacao),
    'endereco', to_jsonb(v_endereco)
  );

end;
$function$;

CREATE OR REPLACE FUNCTION public.wms_preparar_status_armazenagem(p_voucher text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_voucher text;
  v_status text;
  v_status_normalizado text;
  v_origem text;
  v_data_funcional timestamp without time zone;
  v_data_cosmetico timestamp without time zone;
  v_data_oracle timestamp without time zone;
  v_resultado text;
  v_grade text;
  v_imei text;
  v_tela text;
  v_laterais text;
  v_traseira text;
  v_grade_inferida text;
  v_data_recebimento timestamp without time zone;
  v_criado_em timestamp without time zone;
  v_gaia public.assurant_gaia_ultimo%rowtype;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'erro', 'Usuário não autenticado.');
  end if;

  v_voucher := upper(trim(coalesce(p_voucher, '')));
  v_voucher := coalesce((select r.voucher_atual from liquida_private.armazenagem_retornos r where r.voucher_solicitado=v_voucher),v_voucher);

  if v_voucher = '' then
    return jsonb_build_object('ok', false, 'erro', 'Voucher não informado.');
  end if;

  select
    t.status_atual,
    t.origem_triagem,
    t.data_funcional,
    t.data_cosmetico,
    t.data_oracle,
    t.resultado_triagem_funcional,
    coalesce(t.grade_cosmetica,t.grade),
    t.imei,
    t.tela,
    t.laterais,
    t.traseira,
    t.data_recebimento,
    t.criado_em
  into
    v_status,
    v_origem,
    v_data_funcional,
    v_data_cosmetico,
    v_data_oracle,
    v_resultado,
    v_grade,
    v_imei,
    v_tela,
    v_laterais,
    v_traseira,
    v_data_recebimento,
    v_criado_em
  from public.assurant_triagem t
  where upper(trim(t.voucher)) = v_voucher
  order by t.atualizado_em desc nulls last
  limit 1
  for update;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro', format('Voucher %s não encontrado na triagem.', v_voucher)
    );
  end if;

  v_status_normalizado :=
    lower(trim(regexp_replace(coalesce(v_status, ''), '\s+', ' ', 'g')));

  if v_status_normalizado = 'aguardando armazenagem' then
    return jsonb_build_object(
      'ok', true,
      'alterado', false,
      'voucher', v_voucher,
      'status_anterior', v_status,
      'status_atual', 'Aguardando armazenagem'
    );
  end if;

  /*
   * Reconciliação da virada GAIA -> Liquida.
   * Somente passivo recebido antes de 28/09/2026 pode usar o último
   * estágio legado como evidência. Itens novos continuam 100% Liquida.
   */
  if coalesce(v_data_recebimento,v_criado_em) < timestamp '2026-09-28 00:00:00'
     and v_status_normalizado in (
       'aguardando triagem funcional',
       'aguardando triagem cosmética',
       'aguardando triagem cosmetica'
     )
     and not exists (
       select 1
       from public.wms_alocacoes a
       where trim(a.imei)=trim(v_imei)
         and a.status in ('reservado','confirmado')
         and a.retirado_em is null
     )
  then
    select *
      into v_gaia
    from public.assurant_gaia_ultimo g
    where upper(trim(g.voucher))=v_voucher
    limit 1;

    if found
       and lower(trim(coalesce(v_gaia.status_gaia,'')))='aguardando armazenagem'
       and upper(trim(coalesce(v_gaia.grade_gaia,''))) in (
         'QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW','OUTLET'
       )
    then
      update public.assurant_triagem t
         set status_atual='Aguardando armazenagem',
             grade=coalesce(nullif(trim(t.grade),''),upper(trim(v_gaia.grade_gaia))),
             tela=coalesce(nullif(trim(t.tela),''),nullif(trim(v_gaia.tela),'')),
             laterais=coalesce(nullif(trim(t.laterais),''),nullif(trim(v_gaia.laterais),'')),
             traseira=coalesce(nullif(trim(t.traseira),''),nullif(trim(v_gaia.traseira),'')),
             data_cosmetico=coalesce(
               t.data_cosmetico,
               v_gaia.data_cosmetico at time zone 'UTC'
             ),
             atualizado_em=timezone('UTC',now())
       where upper(trim(t.voucher))=v_voucher;

      return jsonb_build_object(
        'ok',true,
        'alterado',true,
        'reconciliado_gaia_legado',true,
        'voucher',v_voucher,
        'status_anterior',v_status,
        'status_atual','Aguardando armazenagem',
        'grade',upper(trim(v_gaia.grade_gaia))
      );
    end if;
  end if;

  /*
   * Se a cosmética ocorreu depois da última funcional e os três pontos
   * foram gravados, recompõe a grade final caso o fechamento tenha falhado
   * entre a gravação dos detalhes e a mudança de status.
   */
  if v_data_funcional is not null
     and v_data_cosmetico is not null
     and v_data_cosmetico >= v_data_funcional
     and nullif(trim(coalesce(v_grade,'')),'') is null
     and upper(trim(coalesce(v_tela,''))) in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW')
     and upper(trim(coalesce(v_laterais,''))) in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW')
     and upper(trim(coalesce(v_traseira,''))) in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW')
  then
    v_grade_inferida := case
      when 'QUEBRADO' in (upper(trim(v_tela)), upper(trim(v_laterais)), upper(trim(v_traseira))) then 'QUEBRADO'
      when 'REGULAR' in (upper(trim(v_tela)), upper(trim(v_laterais)), upper(trim(v_traseira))) then 'REGULAR'
      when 'BOM' in (upper(trim(v_tela)), upper(trim(v_laterais)), upper(trim(v_traseira))) then 'BOM'
      when 'MUITO BOM' in (upper(trim(v_tela)), upper(trim(v_laterais)), upper(trim(v_traseira))) then 'MUITO BOM'
      when 'EXCELENTE' in (upper(trim(v_tela)), upper(trim(v_laterais)), upper(trim(v_traseira))) then 'EXCELENTE'
      else 'LIKE NEW'
    end;

    update public.assurant_triagem t
       set grade_cosmetica = v_grade_inferida,
           atualizado_em = greatest(coalesce(t.atualizado_em,timezone('UTC',now())),timezone('UTC',now()))
     where upper(trim(t.voucher)) = v_voucher;

    v_grade := v_grade_inferida;
  end if;

  if lower(coalesce(v_origem,'')) <> 'devolucao_b2c'
     and v_data_funcional is not null
     and v_data_cosmetico is not null
     and v_data_cosmetico >= v_data_funcional
     and v_data_oracle is null
     and upper(coalesce(v_resultado,'')) in ('GOOD','BAD')
     and upper(coalesce(v_grade,'')) in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW','OUTLET')
     and v_status_normalizado in (
       'aguardando triagem funcional',
       'aguardando triagem cosmética',
       'aguardando triagem cosmetica',
       'aguardando oracle',
       'aguardando alocação',
       'aguardando alocacao',
       'aguardando locação',
       'aguardando locacao'
     )
     and not exists (
       select 1
       from public.wms_alocacoes a
       where trim(a.imei)=trim(v_imei)
         and a.status in ('reservado','confirmado')
         and a.retirado_em is null
     )
  then
    update public.assurant_triagem t
       set status_atual='Aguardando armazenagem',
           atualizado_em=timezone('UTC',now())
     where upper(trim(t.voucher))=v_voucher;

    return jsonb_build_object(
      'ok', true,
      'alterado', true,
      'recuperado_fluxo_cosmetica', true,
      'voucher', v_voucher,
      'status_anterior', v_status,
      'status_atual', 'Aguardando armazenagem',
      'grade_cosmetica', v_grade
    );
  end if;

  if v_status_normalizado not in (
    'aguardando alocação',
    'aguardando alocacao',
    'aguardando locação',
    'aguardando locacao'
  ) then
    return jsonb_build_object(
      'ok', false,
      'erro', format(
        'O voucher %s está com status "%s" e não pode entrar na armazenagem.',
        v_voucher,
        coalesce(v_status, 'sem status')
      )
    );
  end if;

  update public.assurant_triagem t
     set status_atual = 'Aguardando armazenagem',
         atualizado_em = timezone('UTC',now())
   where upper(trim(t.voucher)) = v_voucher
     and t.status_atual = v_status;

  return jsonb_build_object(
    'ok', true,
    'alterado', true,
    'voucher', v_voucher,
    'status_anterior', v_status,
    'status_atual', 'Aguardando armazenagem'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION liquida_private.caixas_completar_cadastro(p_referencia text, p_imei text, p_voucher text, p_sku text, p_modelo text, p_grade text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare x public.assurant_caixas_liberadas%rowtype; t public.assurant_triagem%rowtype; antes jsonb; v_voucher text:=upper(trim(p_voucher)); v_imei text:=upper(trim(p_imei));
begin
 if p_referencia like 'RETORNO:%' then return liquida_private.armazenagem_retorno_completar(p_referencia,p_imei,p_voucher,p_sku,p_modelo,p_grade);end if;
 if not liquida_private.caixas_pode_armazenar() then raise exception 'Sem permissão para armazenagem' using errcode='42501';end if;
 select * into x from public.assurant_caixas_liberadas where imei=p_referencia for update;
 if not found then raise exception 'Item não pertence às caixas liberadas';end if;
 if nullif(v_voucher,'') is null or nullif(trim(p_sku),'') is null or nullif(trim(p_modelo),'') is null then raise exception 'Informe voucher, SKU e modelo do aparelho';end if;
 if nullif(v_imei,'') is null or v_imei !~ '^[A-Z0-9-]{5,30}$' or v_imei ~ '^(YBV|DEV)' or (v_imei ~ '^[0-9]+$' and length(v_imei)<>15) then raise exception 'Bipe um IMEI de 15 dígitos ou o serial físico do aparelho';end if;
 if p_grade is null or p_grade not in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW') then raise exception 'Informe uma grade física válida';end if;
 if exists(select 1 from public.wms_alocacoes a where a.imei=v_imei and a.status in('reservado','confirmado') and a.retirado_em is null) then raise exception 'Aparelho já possui alocação ativa';end if;
 select * into t from public.assurant_triagem where id=x.triagem_id for update;
 if t.id is not null and t.status_atual<>'Aguardando armazenagem' then raise exception 'Aparelho já seguiu para outra etapa';end if;
 if t.id is null then
  select * into t from public.assurant_triagem where voucher=v_voucher for update;
  if t.id is not null and t.imei is distinct from v_imei then raise exception 'Voucher já vinculado a outro aparelho';end if;
  if t.id is not null and t.status_atual<>'Aguardando armazenagem' then raise exception 'Voucher já está em outra etapa';end if;
 end if;
 if exists(select 1 from public.assurant_triagem a where (a.voucher=v_voucher or (a.imei=v_imei and a.status_atual not in ('Finalizado','Em processo de devolução Agd RI'))) and a.id is distinct from t.id) then raise exception 'IMEI ou voucher já cadastrado em outro registro';end if;
 antes:=to_jsonb(t);
 if t.id is not null and t.voucher is distinct from v_voucher then raise exception 'Preserve o voucher cadastrado do aparelho';end if;
 -- Marca a identidade física antes da gravação para a exclusão cobrir os triggers de produção.
 update public.assurant_caixas_liberadas set imei_identificado=v_imei,voucher=v_voucher where imei=x.imei;
 if t.id is null then
  insert into public.assurant_triagem(voucher,imei,sku,modelo,grade,status_atual,origem_triagem,criado_em,atualizado_em)
  values(v_voucher,v_imei,upper(trim(p_sku)),trim(p_modelo),p_grade,'Aguardando armazenagem','carga_inicial',timezone('UTC',now()),timezone('UTC',now())) returning * into t;
 else
  update public.assurant_triagem set imei=v_imei,sku=coalesce(nullif(trim(sku),''),upper(trim(p_sku))),modelo=coalesce(nullif(trim(modelo),''),trim(p_modelo)),
   grade=case when coalesce(nullif(trim(grade_cosmetica),''),grade,'') in('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW') then grade when grade='OUTLET' then grade else p_grade end,
   grade_cosmetica=case when grade_cosmetica='OUTLET' or (grade='OUTLET' and nullif(trim(grade_cosmetica),'') is null) then p_grade else grade_cosmetica end,atualizado_em=timezone('UTC',now()) where id=t.id returning * into t;
 end if;
 update public.assurant_caixas_liberadas set triagem_id=t.id,cadastro_completado_em=now(),cadastro_completado_por=auth.uid() where imei=x.imei;
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 values(v_imei,'carga_inicial.caixas.cadastro',antes::text,to_jsonb(t)::text,'Complemento de cadastro físico na fila de armazenagem; lote excluído dos indicadores',auth.uid());
 return jsonb_build_object('ok',true,'voucher',t.voucher);
end $function$;

CREATE OR REPLACE FUNCTION liquida_private.caixas_armazenagem_fila(p_offset integer DEFAULT 0, p_limite integer DEFAULT 200)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare v jsonb;
begin
 if not liquida_private.caixas_pode_armazenar() then raise exception 'Sem permissão para armazenagem' using errcode='42501'; end if;
 with fila as (
  select t.voucher,t.imei,t.sku,t.modelo,t.grade,t.grade_cosmetica,t.respostas_funcional,t.data_cosmetico,
   x.imei as referencia_caixa,x.caixa_codigo,
   (x.imei is not null or r.triagem_id is not null) and (nullif(trim(t.voucher),'') is null or nullif(trim(t.sku),'') is null or nullif(trim(t.modelo),'') is null or (coalesce(t.modelo,'') !~* '(WATCH|TABLET|IPAD|REL[ÓO]GIO)' and coalesce(nullif(trim(t.grade_cosmetica),''),t.grade,'') not in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW'))) as pendente_cadastro,case when r.triagem_id is not null then 'RETORNO:'||t.voucher end referencia_retorno,r.voucher_solicitado
  from public.assurant_triagem t left join public.assurant_caixas_liberadas x on x.triagem_id=t.id left join liquida_private.armazenagem_retornos r on r.triagem_id=t.id
  where not exists(select 1 from public.assurant_caixas_liberadas cx where cx.triagem_id is distinct from t.id and (cx.imei=t.imei or cx.imei_identificado=t.imei)) and not exists(select 1 from liquida_private.armazenagem_retornos rr where rr.imei=t.imei and rr.triagem_id<>t.id) and t.status_atual in ('Aguardando armazenagem','Aguardando alocação','Aguardando alocacao','Aguardando locação','Aguardando locacao')
  union all
  select null::text,coalesce(x.imei_identificado,x.imei),null::text,null::text,null::text,null::text,null::text,null::timestamp,x.imei,x.caixa_codigo,true,null::text,null::text
  from public.assurant_caixas_liberadas x where x.triagem_id is null
 ) select coalesce(jsonb_agg(to_jsonb(q) order by q.voucher nulls last,q.imei),'[]'::jsonb) into v from
 (select * from fila order by voucher nulls last,imei offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limite,200),1),500)) q;
 return v;
end $function$;
