-- Linha Branca / Climatização
-- Padronização operacional: governança de condenação, compatibilidade de kit
-- e leituras estruturadas do teste de operação.

alter table public.climatizacao_componentes
  drop constraint if exists climatizacao_componentes_resultado_triagem_check;
alter table public.climatizacao_componentes
  add constraint climatizacao_componentes_resultado_triagem_check
  check (resultado_triagem = any (array[
    'aprovado'::text,
    'reparo'::text,
    'venda_no_estado'::text,
    'scrap'::text,
    'condenacao'::text
  ]));

alter table public.climatizacao_componentes
  drop constraint if exists climatizacao_componentes_status_check;
alter table public.climatizacao_componentes
  add constraint climatizacao_componentes_status_check
  check (status = any (array[
    'aguardando_triagem'::text,
    'aguardando_kit'::text,
    'em_kit'::text,
    'em_operacao'::text,
    'em_reparo'::text,
    'aguardando_condenacao'::text,
    'venda_no_estado'::text,
    'desmembramento'::text,
    'scrap'::text,
    'higienizacao'::text,
    'aprovado_final'::text
  ]));

alter table public.climatizacao_operacoes
  add column if not exists medicoes jsonb not null default '{}'::jsonb,
  add column if not exists checklist_operacao jsonb not null default '{}'::jsonb;

create or replace function public.climatizacao_formar_kit(
  p_componente_ids bigint[],
  p_tecnico text default null::text,
  p_observacoes text default null::text
)
returns public.climatizacao_kits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kit public.climatizacao_kits;
  v_componente_id bigint;
  v_tipo text;
  v_status_comp text;
  v_cond integer := 0;
  v_evap integer := 0;
  v_tensoes integer := 0;
  v_gases integer := 0;
  v_marcas integer := 0;
  v_campos_incompletos integer := 0;
begin
  if p_componente_ids is null or coalesce(array_length(p_componente_ids, 1), 0) < 2 then
    raise exception 'Selecione uma condensadora e ao menos uma evaporadora.';
  end if;

  foreach v_componente_id in array p_componente_ids loop
    v_tipo := null;
    v_status_comp := null;

    select cc.tipo_unidade, cc.status
      into v_tipo, v_status_comp
    from public.climatizacao_componentes cc
    where cc.id = v_componente_id
    limit 1;

    if v_status_comp is null or v_status_comp <> 'aguardando_kit' then
      raise exception 'Componente % indisponível ou já vinculado a outro kit (status=%).',
        v_componente_id, coalesce(v_status_comp, 'não encontrado');
    end if;

    if v_tipo = 'condensadora' then
      v_cond := v_cond + 1;
    elsif v_tipo = 'evaporadora' then
      v_evap := v_evap + 1;
    end if;
  end loop;

  if v_cond <> 1 or v_evap < 1 then
    raise exception 'O kit deve possuir exatamente 1 condensadora e ao menos 1 evaporadora.';
  end if;

  select
    count(distinct lower(trim(cc.tensao))) filter (where coalesce(trim(cc.tensao), '') <> ''),
    count(distinct lower(trim(cc.gas_refrigerante))) filter (where coalesce(trim(cc.gas_refrigerante), '') <> ''),
    count(distinct lower(trim(os.marca))) filter (where coalesce(trim(os.marca), '') <> ''),
    count(*) filter (
      where coalesce(trim(cc.tensao), '') = ''
         or coalesce(trim(cc.gas_refrigerante), '') = ''
    )
  into v_tensoes, v_gases, v_marcas, v_campos_incompletos
  from public.climatizacao_componentes cc
  join public.ordens_servico os on os.id = cc.os_id
  where cc.id = any(p_componente_ids);

  if v_campos_incompletos > 0 then
    raise exception 'Todos os componentes do kit precisam possuir tensão e gás refrigerante identificados.';
  end if;

  if v_tensoes > 1 then
    raise exception 'Incompatibilidade de tensão entre os componentes selecionados.';
  end if;

  if v_gases > 1 then
    raise exception 'Incompatibilidade de gás refrigerante entre os componentes selecionados.';
  end if;

  if v_marcas > 1 then
    raise exception 'Os componentes selecionados possuem marcas diferentes. Valide a compatibilidade antes da formação do kit.';
  end if;

  insert into public.climatizacao_kits(tecnico_formacao, observacoes)
  values (p_tecnico, p_observacoes)
  returning * into v_kit;

  insert into public.climatizacao_kit_itens(kit_id, componente_id, papel)
  select v_kit.id, cc.id, cc.tipo_unidade
  from public.climatizacao_componentes cc
  where cc.id = any(p_componente_ids);

  update public.climatizacao_componentes cc
     set status = 'em_kit', updated_at = now()
   where cc.id = any(p_componente_ids);

  update public.ordens_servico os
     set status_atual = 'Kit formado',
         etapa_atual = 'Formação de Kit',
         area_destino = 'Operação',
         updated_at = now()
   where os.id in (
     select cc.os_id
     from public.climatizacao_componentes cc
     where cc.id = any(p_componente_ids)
   );

  return v_kit;
end;
$$;

create or replace function public.climatizacao_finalizar_operacao(
  p_operacao_id bigint,
  p_falhas jsonb default '[]'::jsonb,
  p_observacoes text default null::text,
  p_tecnico text default null::text
)
returns public.climatizacao_operacoes
language plpgsql
security definer
set search_path = public
as $$
declare
  v_op public.climatizacao_operacoes;
  v_kit_id bigint;
  v_total integer;
  v_falhas integer;
  v_item record;
  v_destino text;
  v_status_comp text;
  v_status_os text;
  v_etapa_os text;
  v_resultado text;
  v_pausa_extra integer := 0;
begin
  select * into v_op
  from public.climatizacao_operacoes
  where id = p_operacao_id
  for update;

  if v_op.id is null or v_op.status not in ('em_teste','pausado') then
    raise exception 'Operação não disponível para finalização.';
  end if;

  v_kit_id := v_op.kit_id;

  if v_op.status = 'pausado' and v_op.pausa_iniciada_em is not null then
    v_pausa_extra := greatest(extract(epoch from (now() - v_op.pausa_iniciada_em))::integer, 0);
  end if;

  select count(*) into v_total
  from public.climatizacao_kit_itens
  where kit_id = v_kit_id and ativo;

  select count(*) into v_falhas
  from jsonb_array_elements(coalesce(p_falhas, '[]'::jsonb));

  if v_falhas = 0 then
    v_resultado := 'aprovado';

    update public.climatizacao_componentes c
       set status = 'higienizacao', updated_at = now()
     where c.id in (
       select componente_id
       from public.climatizacao_kit_itens
       where kit_id = v_kit_id and ativo
     );

    update public.ordens_servico os
       set status_atual = 'Higienização',
           etapa_atual = 'Higienização',
           area_destino = 'Higienização',
           updated_at = now()
     where os.id in (
       select c.os_id
       from public.climatizacao_componentes c
       join public.climatizacao_kit_itens ki on ki.componente_id = c.id
       where ki.kit_id = v_kit_id and ki.ativo
     );

    update public.climatizacao_kits
       set status = 'aprovado', updated_at = now()
     where id = v_kit_id;
  else
    v_resultado := case
      when v_falhas >= v_total then 'reprovado_total'
      else 'reprovado_parcial'
    end;

    for v_item in
      select ki.componente_id, c.os_id, os.categoria
      from public.climatizacao_kit_itens ki
      join public.climatizacao_componentes c on c.id = ki.componente_id
      join public.ordens_servico os on os.id = c.os_id
      where ki.kit_id = v_kit_id and ki.ativo
    loop
      select elem->>'destino' into v_destino
      from jsonb_array_elements(coalesce(p_falhas, '[]'::jsonb)) elem
      where (elem->>'componente_id')::bigint = v_item.componente_id
      limit 1;

      if v_destino is null then
        v_status_comp := 'aguardando_kit';
        v_status_os := 'Triado - aguardando kit';
        v_etapa_os := 'Aguardando kit';
      elsif v_destino = 'reparo' then
        v_status_comp := 'em_reparo';
        v_status_os := 'Em reparo';
        v_etapa_os := 'Reparo';
      elsif v_destino = 'venda_no_estado' then
        v_status_comp := 'venda_no_estado';
        v_status_os := 'Venda no estado';
        v_etapa_os := 'Venda no estado';
      elsif v_destino in ('scrap','condenacao') then
        v_status_comp := 'aguardando_condenacao';
        v_status_os := 'Em reparo';
        v_etapa_os := 'Reparo';

        if not exists (
          select 1
          from public.linha_branca_condenacoes lc
          where lc.os_id = v_item.os_id
            and lc.status = 'aguardando_aprovacao'
        ) then
          insert into public.linha_branca_condenacoes(
            os_id,
            categoria,
            motivo,
            area_retorno,
            status,
            solicitado_por,
            solicitado_por_nome
          )
          values (
            v_item.os_id,
            v_item.categoria,
            coalesce(nullif(trim(p_observacoes), ''), 'Falha identificada durante teste operacional do kit de climatização.'),
            'Operação',
            'aguardando_aprovacao',
            auth.uid(),
            p_tecnico
          );
        end if;
      else
        raise exception 'Destino inválido para componente %', v_item.componente_id;
      end if;

      update public.climatizacao_componentes
         set status = v_status_comp, updated_at = now()
       where id = v_item.componente_id;

      update public.ordens_servico
         set status_atual = v_status_os,
             etapa_atual = v_etapa_os,
             area_destino = v_etapa_os,
             updated_at = now()
       where id = v_item.os_id;

      update public.climatizacao_kit_itens
         set ativo = false,
             desvinculado_em = now(),
             destino_saida = coalesce(v_destino, 'aguardando_kit')
       where kit_id = v_kit_id
         and componente_id = v_item.componente_id
         and ativo;

      v_destino := null;
    end loop;

    update public.climatizacao_kits
       set status = 'desmembrado', updated_at = now()
     where id = v_kit_id;
  end if;

  update public.climatizacao_operacoes
     set status = 'concluido',
         finalizado_em = now(),
         tempo_pausado_seg = tempo_pausado_seg + v_pausa_extra,
         pausa_iniciada_em = null,
         resultado = v_resultado,
         observacoes = p_observacoes,
         tecnico = coalesce(p_tecnico, tecnico),
         updated_at = now()
   where id = p_operacao_id
   returning * into v_op;

  return v_op;
end;
$$;
