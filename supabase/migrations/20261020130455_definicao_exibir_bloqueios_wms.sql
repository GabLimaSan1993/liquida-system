-- Mantém posições residualmente bloqueadas fora do FIFO automático, mas as
-- apresenta em Aguardando Definição para liberação controlada pela Liquida.

ALTER TABLE public.assurant_solicitacoes_desvinculacao
  DROP CONSTRAINT assurant_solic_desv_vinculo_chk;

ALTER TABLE public.assurant_solicitacoes_desvinculacao
  ADD CONSTRAINT assurant_solic_desv_vinculo_chk
  CHECK (vinculo_tipo = ANY (ARRAY[
    'B2C'::text,
    'B2B'::text,
    'TROCA'::text,
    'VENDA_FUNCIONARIO'::text,
    'WMS_BLOQUEADO'::text
  ]));

CREATE OR REPLACE FUNCTION public.assurant_definicao_candidatos(p_sku text)
 RETURNS TABLE(alocacao_id uuid, endereco_id bigint, imei text, voucher text, sku text, marca text, modelo text, grade text, status_bateria text, status_atual text, data_subinv date, local_subinv text, aging_dias integer, local text, rua smallint, bloco smallint, andar smallint, coluna text, linha smallint, disponivel boolean, vinculo_tipo text, vinculo_referencia text, vinculo_descricao text, vinculo_detalhes jsonb)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with candidatos as (
  select distinct on (a.imei)
    a.id as alocacao_id,
    e.id as endereco_id,
    btrim(a.imei) as imei,
    a.voucher,
    coalesce(a.sku,tri.sku) as sku,
    a.marca,
    coalesce(a.modelo,tri.modelo) as modelo,
    coalesce(a.grade_venda,tri.grade,tri.grade_cosmetica) as grade,
    tri.status_bateria,
    tri.status_atual,
    a.confirmado_em,
    e.status as status_endereco,
    e.rua,e.bloco,e.andar,e.coluna,e.linha
  from public.wms_alocacoes a
  join public.wms_enderecos e on e.id=a.endereco_id
  left join lateral (
    select t.sku,t.modelo,t.grade,t.grade_cosmetica,t.status_bateria,t.status_atual
    from public.assurant_triagem t
    where btrim(t.imei)=btrim(a.imei)
    order by coalesce(t.atualizado_em,t.criado_em) desc nulls last,t.criado_em desc nulls last,t.id desc
    limit 1
  ) tri on true
  where a.status='confirmado'
    and a.retirado_em is null
    and e.ativo=true
    and e.status in ('ocupado','bloqueado')
    and a.imei is not null
    and upper(btrim(coalesce(a.sku,tri.sku)))=upper(btrim(p_sku))
  order by a.imei,coalesce(a.confirmado_em,a.reservado_em,a.criado_em) desc nulls last,a.id desc
),
enriquecidos as (
  select
    c.*,
    sub.data_subinv,
    sub.local_subinv,
    case when sub.data_subinv is null then null
      else greatest(0,(now() at time zone 'America/Sao_Paulo')::date-sub.data_subinv)::integer
    end as aging_dias,

    rativa.id as reserva_ativa_id,
    rultima.id as ultima_reserva_id,
    rultima.canal as ultima_reserva_canal,
    rultima.status as ultima_reserva_status,
    rultima.motivo as ultima_reserva_motivo,
    rultima.finalizado_em as ultima_reserva_finalizado_em,

    rb2c.id as reserva_b2c_id,
    rb2c.referencia_id as reserva_b2c_ref,

    pb.id as b2c_item_id,
    pb.id_anymarket as b2c_id_anymarket,
    pb.marketplace as b2c_marketplace,
    pb.cliente as b2c_cliente,
    pb.status as b2c_status,
    pb.grupo_id as b2c_grupo_id,

    rb2b.id as reserva_b2b_id,
    rb2b.referencia_id as reserva_b2b_ref,

    rsp.id as reserva_especial_wms_id,
    rsp.canal as reserva_especial_canal,
    rsp.referencia_id as reserva_especial_ref,

    bi.item_id as b2b_item_id,
    bi.pedido_id as b2b_pedido_id,
    bi.lote as b2b_lote,
    bi.cliente as b2b_cliente,
    bi.item_status as b2b_item_status,
    bi.exportado as b2b_exportado,

    esp.id as especial_id,
    esp.tipo as especial_tipo
  from candidatos c
  left join lateral (
    select s.data_subinv,s.local_subinv
    from public.estoque_subinv s
    where btrim(s.imei)=c.imei
    order by s.data_subinv desc nulls last
    limit 1
  ) sub on true

  left join lateral (
    select r.id
    from public.wms_reservas_saida r
    where r.alocacao_id=c.alocacao_id
      and r.status in ('reservado','analise','reconciliar')
    order by r.reservado_em desc
    limit 1
  ) rativa on true

  left join lateral (
    select r.id,r.canal,r.status,r.motivo,r.finalizado_em
    from public.wms_reservas_saida r
    where r.alocacao_id=c.alocacao_id
    order by coalesce(r.atualizado_em,r.finalizado_em,r.reservado_em,r.criado_em) desc nulls last,r.id desc
    limit 1
  ) rultima on true

  left join lateral (
    select r.id,r.referencia_id
    from public.wms_reservas_saida r
    join public.pedidos_b2c pbr
      on pbr.id::text=r.referencia_id
     and nullif(btrim(coalesce(pbr.numero_nf,'')),'') is null
     and nullif(btrim(coalesce(pbr.chave_nf,'')),'') is null
     and pbr.status not in ('faturado','cancelado')
    where r.alocacao_id=c.alocacao_id
      and r.status in ('reservado','analise','reconciliar')
      and r.canal='B2C'
    order by r.reservado_em desc
    limit 1
  ) rb2c on true

  left join lateral (
    select p.id,p.id_anymarket,p.marketplace,p.cliente,p.status,p.grupo_id
    from public.pedidos_b2c p
    where btrim(coalesce(p.imei_alocado,''))=c.imei
      and p.status in ('alocado','em_picking','em_analise')
      and nullif(btrim(coalesce(p.numero_nf,'')),'') is null
      and nullif(btrim(coalesce(p.chave_nf,'')),'') is null
    order by p.atualizado_em desc nulls last,p.id desc
    limit 1
  ) pb on true

  left join lateral (
    select r.id,r.referencia_id
    from public.wms_reservas_saida r
    where r.alocacao_id=c.alocacao_id
      and r.status in ('reservado','analise','reconciliar')
      and r.canal='B2B'
    order by r.reservado_em desc
    limit 1
  ) rb2b on true

  left join lateral (
    select r.id,r.canal,r.referencia_id
    from public.wms_reservas_saida r
    where r.alocacao_id=c.alocacao_id
      and r.status in ('reservado','analise','reconciliar')
      and r.canal in ('TROCA','VENDA_FUNCIONARIO')
    order by r.reservado_em desc
    limit 1
  ) rsp on true

  left join lateral (
    select
      i.id as item_id,i.pedido_id,bp.lote,bp.cliente,i.status as item_status,
      exists(select 1 from public.b2b_itens_exportados ex where ex.item_id=i.id) as exportado
    from public.b2b_itens i
    join public.b2b_pedidos bp on bp.id=i.pedido_id
    where nullif(btrim(coalesce(i.nf,'')),'') is null
      and (
        (
          rb2b.id is not null
          and (
            i.id::text=rb2b.referencia_id
            or i.pedido_id::text=rb2b.referencia_id
            or btrim(i.imei)=c.imei
          )
        )
        or (
          btrim(i.imei)=c.imei
          and i.status in ('pendente','nao_localizado','em_analise','bipado')
          and bp.encerrado_sem_faturamento_em is null
          and coalesce(bp.status,'')<>'concluido'
        )
      )
    order by i.bipado_em desc nulls last,i.id desc
    limit 1
  ) bi on true

  left join lateral (
    select r.id,r.tipo
    from public.assurant_reservas_especiais r
    where btrim(r.imei)=c.imei and r.status='reservado'
    order by r.reservado_em desc
    limit 1
  ) esp on true
)
select
  e.alocacao_id,e.endereco_id,e.imei,e.voucher,e.sku,e.marca,e.modelo,e.grade,
  e.status_bateria,e.status_atual,e.data_subinv,e.local_subinv,e.aging_dias,
  public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha) as local,
  e.rua,e.bloco,e.andar,e.coluna,e.linha,

  (
    e.status_endereco='ocupado'
    and e.reserva_ativa_id is null
    and e.reserva_b2c_id is null
    and e.b2c_item_id is null
    and e.b2b_item_id is null
    and e.reserva_b2b_id is null
    and e.especial_id is null
    and e.reserva_especial_wms_id is null
  ) as disponivel,

  case
    when e.especial_id is not null then e.especial_tipo
    when e.reserva_especial_canal is not null then e.reserva_especial_canal
    when e.b2c_item_id is not null or e.reserva_b2c_id is not null then 'B2C'
    when e.b2b_item_id is not null or e.reserva_b2b_id is not null then 'B2B'
    when e.status_endereco='bloqueado' and e.reserva_ativa_id is null then 'WMS_BLOQUEADO'
    else null
  end as vinculo_tipo,

  case
    when e.especial_id is not null then e.especial_id::text
    when e.reserva_especial_ref is not null then e.reserva_especial_ref
    when e.b2c_id_anymarket is not null then e.b2c_id_anymarket::text
    when e.reserva_b2c_ref is not null then e.reserva_b2c_ref
    when e.b2b_lote is not null then e.b2b_lote
    when e.reserva_b2b_ref is not null then e.reserva_b2b_ref
    when e.status_endereco='bloqueado' and e.reserva_ativa_id is null then e.alocacao_id::text
    else null
  end as vinculo_referencia,

  case
    when coalesce(e.especial_tipo,e.reserva_especial_canal)='TROCA'
      then 'Reservado para Troca'
    when coalesce(e.especial_tipo,e.reserva_especial_canal)='VENDA_FUNCIONARIO'
      then 'Reservado para Venda Funcionário'
    when e.b2c_item_id is not null or e.reserva_b2c_id is not null
      then concat(
        'B2C #',coalesce(e.b2c_id_anymarket::text,e.reserva_b2c_ref,'—'),
        case when e.b2c_marketplace is not null then ' · '||e.b2c_marketplace else '' end,
        case when e.b2c_status is not null then ' · '||e.b2c_status else '' end
      )
    when e.b2b_item_id is not null or e.reserva_b2b_id is not null
      then concat(
        'B2B ',coalesce(e.b2b_lote,e.reserva_b2b_ref,'—'),
        case when e.b2b_cliente is not null then ' · '||e.b2b_cliente else '' end
      )
    when e.status_endereco='bloqueado' and e.reserva_ativa_id is null
      then 'Posição WMS bloqueada após encerramento do vínculo anterior'
    else null
  end as vinculo_descricao,

  jsonb_strip_nulls(jsonb_build_object(
    'b2c_item_id',e.b2c_item_id,
    'b2c_id_anymarket',e.b2c_id_anymarket,
    'b2c_marketplace',e.b2c_marketplace,
    'b2c_cliente',e.b2c_cliente,
    'b2c_status',e.b2c_status,
    'b2c_grupo_id',e.b2c_grupo_id,
    'reserva_b2c_id',e.reserva_b2c_id,

    'b2b_item_id',e.b2b_item_id,
    'b2b_pedido_id',e.b2b_pedido_id,
    'b2b_lote',e.b2b_lote,
    'b2b_cliente',e.b2b_cliente,
    'b2b_status',e.b2b_item_status,
    'b2b_exportado',e.b2b_exportado,
    'reserva_b2b_id',e.reserva_b2b_id,

    'reserva_especial_id',e.especial_id,
    'reserva_especial_tipo',e.especial_tipo,
    'reserva_wms_especial_id',e.reserva_especial_wms_id,

    'wms_status_endereco',e.status_endereco,
    'ultima_reserva_id',e.ultima_reserva_id,
    'ultima_reserva_canal',e.ultima_reserva_canal,
    'ultima_reserva_status',e.ultima_reserva_status,
    'ultima_reserva_motivo',e.ultima_reserva_motivo,
    'ultima_reserva_finalizado_em',e.ultima_reserva_finalizado_em
  )) as vinculo_detalhes

from enriquecidos e
where e.data_subinv is not null
  and upper(btrim(coalesce(e.local_subinv,''))) not in ('ALPHA','YUSEN','YUSSEN','PEND')
  and (
    e.status_endereco='ocupado'
    or e.b2c_item_id is not null
    or e.reserva_b2c_id is not null
    or e.b2b_item_id is not null
    or e.reserva_b2b_id is not null
    or e.especial_id is not null
    or e.reserva_especial_wms_id is not null
    or (
      e.status_endereco='bloqueado'
      and e.reserva_ativa_id is null
      and e.b2c_item_id is null
      and e.reserva_b2c_id is null
      and e.b2b_item_id is null
      and e.reserva_b2b_id is null
      and e.especial_id is null
      and e.reserva_especial_wms_id is null
      and not exists (
        select 1
        from public.meli_aparelhos_bloqueados mb
        where btrim(mb.imei)=e.imei
      )
    )
  )
  and not exists (
    select 1
    from public.pedidos_b2c pnf
    where btrim(coalesce(pnf.imei_alocado,''))=e.imei
      and (
        nullif(btrim(coalesce(pnf.numero_nf,'')),'') is not null
        or nullif(btrim(coalesce(pnf.chave_nf,'')),'') is not null
        or pnf.status='faturado'
      )
      and pnf.status<>'cancelado'
  )
  and (
    e.reserva_especial_wms_id is null
    or e.reserva_especial_canal in ('TROCA','VENDA_FUNCIONARIO')
  )
order by e.data_subinv nulls last,e.imei;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_solicitar_desvinculacao_b2c(p_pedido_id uuid, p_imei text, p_sku text, p_grade text, p_grade_fisica text, p_cor text, p_relacao_grade text, p_vinculo_tipo text, p_vinculo_referencia text, p_vinculo_detalhes jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_pedido public.pedidos_b2c%rowtype;
  v_candidato record;
  v_id uuid;
  v_tipo text := upper(btrim(coalesce(p_vinculo_tipo,'')));
begin
  if v_user is null then
    raise exception 'Usuário não autenticado' using errcode='42501';
  end if;

  select * into v_pedido
  from public.pedidos_b2c
  where id=p_pedido_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'erro','Pedido B2C não encontrado.');
  end if;

  if v_pedido.status<>'aguardando_definicao_produto' then
    return jsonb_build_object('ok',false,'erro','O pedido não está mais aguardando definição.');
  end if;

  if v_tipo not in ('B2C','B2B','TROCA','VENDA_FUNCIONARIO','WMS_BLOQUEADO') then
    return jsonb_build_object('ok',false,'erro','O aparelho selecionado não possui vínculo elegível para solicitação.');
  end if;

  select * into v_candidato
  from public.assurant_definicao_candidatos(p_sku) c
  where btrim(c.imei)=btrim(p_imei)
  limit 1;

  if not found then
    return jsonb_build_object('ok',false,'erro','O aparelho não está mais elegível/armazenado no WMS. Atualize a consulta.');
  end if;

  if coalesce(v_candidato.vinculo_tipo,'')<>v_tipo then
    return jsonb_build_object(
      'ok',false,
      'erro','O vínculo do aparelho mudou. Atualize as opções antes de continuar.',
      'vinculo_atual',v_candidato.vinculo_tipo
    );
  end if;

  if v_tipo='B2C'
     and coalesce(v_candidato.vinculo_detalhes->>'b2c_item_id','')=p_pedido_id::text then
    return jsonb_build_object('ok',false,'erro','O aparelho já pertence a este próprio pedido B2C.');
  end if;

  update public.assurant_solicitacoes_desvinculacao
  set status='cancelado',
      resolvido_em=now(),
      resolvido_por=v_user,
      motivo_resolucao='Substituída por uma nova solicitação da Assurant',
      atualizado_em=now()
  where pedido_b2c_id=p_pedido_id
    and status in ('pendente','processando');

  insert into public.assurant_solicitacoes_desvinculacao (
    pedido_b2c_id,imei,sku_destino,grade_destino,grade_fisica,cor_destino,
    relacao_grade,vinculo_tipo,vinculo_referencia,vinculo_detalhes,
    wms_alocacao_id,solicitado_por
  ) values (
    p_pedido_id,btrim(p_imei),btrim(p_sku),btrim(p_grade),nullif(btrim(p_grade_fisica),''),
    nullif(btrim(p_cor),''),nullif(btrim(p_relacao_grade),''),v_tipo,
    nullif(btrim(p_vinculo_referencia),''),
    coalesce(p_vinculo_detalhes,'{}'::jsonb) || jsonb_build_object(
      'descricao',v_candidato.vinculo_descricao,
      'local',v_candidato.local,
      'data_subinv',v_candidato.data_subinv
    ),
    v_candidato.alocacao_id,v_user
  )
  returning id into v_id;

  update public.pedidos_b2c
  set definicao_status='aguardando_desvinculacao',
      definicao_resumo=concat(
        'Assurant selecionou ',btrim(p_sku),' · ',btrim(p_grade),
        case when nullif(btrim(p_cor),'') is not null then ' · '||btrim(p_cor) else '' end,
        ' · IMEI ',btrim(p_imei),' · aguardando transferência pela Liquida Preço'
      ),
      atualizado_em=now()
  where id=p_pedido_id;

  return jsonb_build_object(
    'ok',true,
    'solicitacao_id',v_id,
    'status','aguardando_desvinculacao',
    'imei',btrim(p_imei),
    'vinculo_tipo',v_tipo,
    'vinculo_descricao',v_candidato.vinculo_descricao
  );
end;
$function$;
