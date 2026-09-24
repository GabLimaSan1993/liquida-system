-- Ao corrigir a cor física na rastreabilidade, ajusta também o SKU automaticamente
-- usando o cadastro mestre de produtos (mesmo modelo/capacidade/tipo/tamanho na nova cor).

alter table public.assurant_rastreabilidade_ajustes
  drop constraint if exists assurant_rastreabilidade_ajustes_campo_chk;

alter table public.assurant_rastreabilidade_ajustes
  add constraint assurant_rastreabilidade_ajustes_campo_chk
  check (campo in ('cor','sku'));

create or replace function public.assurant_rastreabilidade_sku_por_cor(
  p_imei text,
  p_cor text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_imei text := trim(coalesce(p_imei,''));
  v_cor text := upper(trim(coalesce(p_cor,'')));
  v_sku_atual text;
  v_pc public.produtos_catalogo%rowtype;
  v_sku_novo text;
  v_descricao_nova text;
  v_marca_nova text;
  v_qtd integer := 0;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Usuário sem permissão para consultar a rastreabilidade.';
  end if;

  if v_imei = '' then raise exception 'IMEI obrigatório.'; end if;
  if length(v_cor) < 2 then raise exception 'Cor obrigatória.'; end if;

  select coalesce(
    (
      select a.sku
      from public.wms_alocacoes a
      where trim(a.imei)=v_imei
        and a.status='confirmado'
        and a.retirado_em is null
      order by a.confirmado_em desc nulls last,a.criado_em desc nulls last
      limit 1
    ),
    (
      select t.sku
      from public.assurant_triagem t
      where trim(t.imei)=v_imei
      order by coalesce(t.atualizado_em,t.criado_em) desc nulls last,t.id desc
      limit 1
    )
  ) into v_sku_atual;

  if nullif(trim(coalesce(v_sku_atual,'')),'') is null then
    return jsonb_build_object(
      'ok',false,'encontrado',false,'imei',v_imei,'cor',v_cor,
      'erro','O aparelho não possui SKU atual para localizar o SKU da nova cor.'
    );
  end if;

  select pc.*
  into v_pc
  from public.produtos_catalogo pc
  where upper(trim(coalesce(pc.sku_als,'')))=upper(trim(v_sku_atual))
     or upper(trim(coalesce(pc.sku_oracle,'')))=upper(trim(v_sku_atual))
  order by coalesce(pc.ativo,false) desc,pc.data_cadastro desc nulls last
  limit 1;

  if not found then
    return jsonb_build_object(
      'ok',false,'encontrado',false,'imei',v_imei,'cor',v_cor,'sku_atual',v_sku_atual,
      'erro','SKU atual não encontrado no catálogo de produtos.'
    );
  end if;

  with candidatos as (
    select distinct
      coalesce(nullif(trim(pc.sku_als),''),nullif(trim(pc.sku_oracle),'')) as sku,
      pc.descricao,
      pc.marca
    from public.produtos_catalogo pc
    where coalesce(pc.ativo,true)=true
      and upper(trim(coalesce(pc.cor,'')))=v_cor
      and upper(trim(coalesce(pc.modelo,'')))=upper(trim(coalesce(v_pc.modelo,'')))
      and upper(trim(coalesce(pc.capacidade,'')))=upper(trim(coalesce(v_pc.capacidade,'')))
      and upper(trim(coalesce(pc.tamanho,'')))=upper(trim(coalesce(v_pc.tamanho,'')))
      and upper(trim(coalesce(pc.tipo,'')))=upper(trim(coalesce(v_pc.tipo,'')))
      and upper(trim(coalesce(pc.marca,'')))=upper(trim(coalesce(v_pc.marca,'')))
      and nullif(trim(coalesce(pc.sku_als,pc.sku_oracle,'')),'') is not null
  )
  select count(*),min(sku),min(descricao),min(marca)
  into v_qtd,v_sku_novo,v_descricao_nova,v_marca_nova
  from candidatos;

  if v_qtd = 0 then
    return jsonb_build_object(
      'ok',false,
      'encontrado',false,
      'imei',v_imei,
      'cor',v_cor,
      'sku_atual',v_sku_atual,
      'modelo',v_pc.modelo,
      'capacidade',v_pc.capacidade,
      'erro',format(
        'Não existe SKU ativo no catálogo para %s %s na cor %s.',
        coalesce(v_pc.modelo,'produto'),
        coalesce(v_pc.capacidade,''),
        v_cor
      )
    );
  end if;

  if v_qtd > 1 then
    return jsonb_build_object(
      'ok',false,
      'encontrado',false,
      'ambiguo',true,
      'imei',v_imei,
      'cor',v_cor,
      'sku_atual',v_sku_atual,
      'erro','Há mais de um SKU compatível com a cor informada. Revise o catálogo antes da correção.'
    );
  end if;

  return jsonb_build_object(
    'ok',true,
    'encontrado',true,
    'imei',v_imei,
    'cor',v_cor,
    'sku_atual',v_sku_atual,
    'sku_novo',v_sku_novo,
    'descricao_nova',v_descricao_nova,
    'marca_nova',v_marca_nova,
    'modelo',v_pc.modelo,
    'capacidade',v_pc.capacidade,
    'cor_atual_catalogo',upper(trim(coalesce(v_pc.cor,'')))
  );
end
$function$;

create or replace function public.assurant_rastreabilidade_cor(p_imei text)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_imei text := trim(coalesce(p_imei,''));
  v_sku text;
  v_cor_sistema text;
  v_cor_ajuste record;
  v_sku_ajuste record;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Usuário sem permissão para consultar a rastreabilidade.';
  end if;

  if v_imei = '' then raise exception 'IMEI obrigatório.'; end if;

  select coalesce(
    (
      select a.sku
      from public.wms_alocacoes a
      where trim(a.imei)=v_imei
        and a.status='confirmado'
        and a.retirado_em is null
      order by a.confirmado_em desc nulls last,a.criado_em desc nulls last
      limit 1
    ),
    (
      select t.sku
      from public.assurant_triagem t
      where trim(t.imei)=v_imei
      order by coalesce(t.atualizado_em,t.criado_em) desc nulls last,t.id desc
      limit 1
    )
  ) into v_sku;

  select upper(trim(pc.cor))
  into v_cor_sistema
  from public.produtos_catalogo pc
  where upper(trim(coalesce(pc.sku_als,'')))=upper(trim(coalesce(v_sku,'')))
     or upper(trim(coalesce(pc.sku_oracle,'')))=upper(trim(coalesce(v_sku,'')))
  order by coalesce(pc.ativo,false) desc,pc.data_cadastro desc nulls last
  limit 1;

  select a.id,a.valor_anterior,a.valor_novo,a.motivo,a.criado_por,a.criado_em,up.nome criado_por_nome
  into v_cor_ajuste
  from public.assurant_rastreabilidade_ajustes a
  left join public.user_profiles up on up.id=a.criado_por
  where trim(a.imei)=v_imei and a.campo='cor'
  order by a.criado_em desc,a.id desc
  limit 1;

  select a.id,a.valor_anterior,a.valor_novo,a.motivo,a.criado_por,a.criado_em,up.nome criado_por_nome
  into v_sku_ajuste
  from public.assurant_rastreabilidade_ajustes a
  left join public.user_profiles up on up.id=a.criado_por
  where trim(a.imei)=v_imei and a.campo='sku'
  order by a.criado_em desc,a.id desc
  limit 1;

  return jsonb_build_object(
    'imei',v_imei,
    'sku_atual',v_sku,
    'sku_anterior',v_sku_ajuste.valor_anterior,
    'sku_corrigido',v_sku_ajuste.id is not null,
    'cor_sistema',v_cor_sistema,
    'cor_atual',coalesce(v_cor_ajuste.valor_novo,v_cor_sistema),
    'corrigida',v_cor_ajuste.id is not null,
    'sku_cor_pendente',
      v_cor_ajuste.id is not null
      and upper(trim(coalesce(v_cor_ajuste.valor_novo,''))) <> upper(trim(coalesce(v_cor_sistema,''))),
    'ajuste_id',v_cor_ajuste.id,
    'motivo',v_cor_ajuste.motivo,
    'alterado_em',v_cor_ajuste.criado_em,
    'alterado_por',v_cor_ajuste.criado_por,
    'alterado_por_nome',v_cor_ajuste.criado_por_nome
  );
end
$function$;

create or replace function public.assurant_atualizar_cor_rastreabilidade(
  p_imei text,
  p_cor text,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','public'
as $function$
declare
  v_imei text := trim(coalesce(p_imei,''));
  v_cor text := upper(trim(coalesce(p_cor,'')));
  v_motivo text := trim(coalesce(p_motivo,''));
  v_usuario uuid := auth.uid();
  v_map jsonb;
  v_cor_anterior text;
  v_sku_anterior text;
  v_sku_novo text;
  v_descricao_nova text;
  v_marca_nova text;
  v_color_id uuid;
  v_sku_id uuid;
begin
  if not public.assurant_rastreabilidade_autorizado() then
    raise exception 'Usuário sem permissão para alterar a rastreabilidade.';
  end if;

  if v_imei = '' then raise exception 'IMEI obrigatório.'; end if;
  if length(v_cor) < 2 or length(v_cor) > 60 then raise exception 'Informe uma cor válida.'; end if;
  if length(v_motivo) < 3 then raise exception 'Informe o motivo da correção com pelo menos 3 caracteres.'; end if;

  if not exists (
    select 1 from public.assurant_triagem t where trim(t.imei)=v_imei
    union all
    select 1 from public.wms_alocacoes a where trim(a.imei)=v_imei
    limit 1
  ) then
    raise exception 'IMEI não encontrado na operação Assurant.';
  end if;

  v_map := public.assurant_rastreabilidade_sku_por_cor(v_imei,v_cor);

  if coalesce((v_map->>'encontrado')::boolean,false) is not true then
    raise exception '%',coalesce(v_map->>'erro','Não foi possível localizar o SKU correspondente à nova cor.');
  end if;

  v_sku_anterior := nullif(trim(v_map->>'sku_atual'),'');
  v_sku_novo := nullif(trim(v_map->>'sku_novo'),'');
  v_descricao_nova := nullif(trim(v_map->>'descricao_nova'),'');
  v_marca_nova := nullif(trim(v_map->>'marca_nova'),'');

  select coalesce(
    (
      select a.valor_novo
      from public.assurant_rastreabilidade_ajustes a
      where trim(a.imei)=v_imei and a.campo='cor'
      order by a.criado_em desc,a.id desc
      limit 1
    ),
    v_map->>'cor_atual_catalogo'
  ) into v_cor_anterior;

  if upper(trim(coalesce(v_cor_anterior,''))) = v_cor
     and upper(trim(coalesce(v_sku_anterior,''))) = upper(trim(coalesce(v_sku_novo,''))) then
    return public.assurant_rastreabilidade_cor(v_imei)
      || jsonb_build_object('ok',true,'alterado',false,'sku_alterado',false);
  end if;

  insert into public.assurant_rastreabilidade_ajustes(
    imei,campo,valor_anterior,valor_novo,motivo,criado_por
  )
  values(v_imei,'cor',v_cor_anterior,v_cor,v_motivo,v_usuario)
  returning id into v_color_id;

  if upper(trim(coalesce(v_sku_anterior,''))) <> upper(trim(coalesce(v_sku_novo,''))) then
    insert into public.assurant_rastreabilidade_ajustes(
      imei,campo,valor_anterior,valor_novo,motivo,criado_por
    )
    values(
      v_imei,'sku',v_sku_anterior,v_sku_novo,
      'Alteração automática por correção de cor: '||v_motivo,v_usuario
    )
    returning id into v_sku_id;

    update public.assurant_triagem
    set sku=v_sku_novo,
        modelo=coalesce(v_descricao_nova,modelo),
        atualizado_em=now()
    where id=(
      select t.id
      from public.assurant_triagem t
      where trim(t.imei)=v_imei
      order by coalesce(t.atualizado_em,t.criado_em) desc nulls last,t.id desc
      limit 1
    );

    update public.wms_alocacoes
    set sku=v_sku_novo,
        modelo=coalesce(v_descricao_nova,modelo),
        marca=coalesce(v_marca_nova,marca),
        atualizado_em=now()
    where trim(imei)=v_imei
      and status='confirmado'
      and retirado_em is null;
  end if;

  return public.assurant_rastreabilidade_cor(v_imei)
    || jsonb_build_object(
      'ok',true,
      'alterado',true,
      'sku_alterado',
        upper(trim(coalesce(v_sku_anterior,''))) <> upper(trim(coalesce(v_sku_novo,''))),
      'sku_anterior',v_sku_anterior,
      'sku_novo',v_sku_novo,
      'ajuste_cor_id',v_color_id,
      'ajuste_sku_id',v_sku_id
    );
end
$function$;

revoke all on function public.assurant_rastreabilidade_sku_por_cor(text,text) from public,anon;
revoke all on function public.assurant_rastreabilidade_cor(text) from public,anon;
revoke all on function public.assurant_atualizar_cor_rastreabilidade(text,text,text) from public,anon;

grant execute on function public.assurant_rastreabilidade_sku_por_cor(text,text) to authenticated;
grant execute on function public.assurant_rastreabilidade_cor(text) to authenticated;
grant execute on function public.assurant_atualizar_cor_rastreabilidade(text,text,text) to authenticated;
