CREATE OR REPLACE FUNCTION public.wms_cancelar_reserva_saida(
  p_canal text,
  p_referencia text,
  p_usuario uuid DEFAULT NULL::uuid,
  p_motivo text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_qtd integer := 0;
  v_enderecos bigint[];
  v_canal text := upper(btrim(p_canal));
begin
  if v_canal='REPARO' then
    raise exception 'Reparo deve ser executado exclusivamente pelo picking interno'
      using errcode='42501';
  end if;

  with alvo as materialized (
    select r.id,r.endereco_id
    from public.wms_reservas_saida r
    where r.canal=v_canal
      and r.referencia_id=p_referencia
      and r.status in ('reservado','analise','reconciliar')
    for update
  ),
  canceladas as (
    update public.wms_reservas_saida r
    set status='cancelado',
        motivo=coalesce(p_motivo,r.motivo),
        finalizado_em=now(),
        finalizado_por=p_usuario,
        atualizado_em=now()
    from alvo a
    where r.id=a.id
    returning a.endereco_id
  )
  select count(*)::integer,array_agg(distinct endereco_id)
  into v_qtd,v_enderecos
  from canceladas;

  if v_canal='B2C' and coalesce(cardinality(v_enderecos),0)>0 then
    update public.wms_enderecos e
    set status='ocupado',
        atualizado_em=now()
    where e.id=any(v_enderecos)
      and e.ativo=true
      and e.status='bloqueado'
      and exists (
        select 1
        from public.wms_alocacoes a
        join public.estoque_subinv s
          on btrim(s.imei)=btrim(a.imei)
         and s.data_subinv is not null
         and upper(btrim(coalesce(s.local_subinv,''))) not in ('ALPHA','YUSEN','YUSSEN','PEND')
        where a.endereco_id=e.id
          and a.status='confirmado'
          and a.retirado_em is null
      )
      and not exists (
        select 1
        from public.wms_reservas_saida r
        where r.endereco_id=e.id
          and r.status in ('reservado','analise','reconciliar')
      )
      and not exists (
        select 1
        from public.wms_alocacoes a
        join public.meli_aparelhos_bloqueados mb
          on btrim(mb.imei)=btrim(a.imei)
        where a.endereco_id=e.id
          and a.status='confirmado'
          and a.retirado_em is null
      )
      and not exists (
        select 1
        from public.wms_alocacoes a
        join public.pedidos_b2c pb
          on btrim(coalesce(pb.imei_alocado,''))=btrim(a.imei)
        where a.endereco_id=e.id
          and a.status='confirmado'
          and a.retirado_em is null
          and pb.id::text<>p_referencia
          and pb.status in (
            'alocado','em_picking','embalado','faturado',
            'aguardando_validacao_meli','em_analise','aguardando_definicao_produto'
          )
      )
      and not exists (
        select 1
        from public.wms_alocacoes a
        join public.b2b_itens bi on btrim(bi.imei)=btrim(a.imei)
        join public.b2b_pedidos bp on bp.id=bi.pedido_id
        where a.endereco_id=e.id
          and a.status='confirmado'
          and a.retirado_em is null
          and bi.status in ('pendente','nao_localizado','em_analise','bipado')
          and nullif(btrim(coalesce(bi.nf,'')),'') is null
          and bp.encerrado_sem_faturamento_em is null
          and coalesce(bp.status,'')<>'concluido'
      )
      and not exists (
        select 1
        from public.wms_alocacoes a
        join public.assurant_reservas_especiais esp
          on btrim(esp.imei)=btrim(a.imei)
         and esp.status='reservado'
        where a.endereco_id=e.id
          and a.status='confirmado'
          and a.retirado_em is null
      );
  end if;

  return jsonb_build_object('ok',true,'canceladas',v_qtd);
end;
$function$;

-- Corrige os resíduos atuais que possuem Sub_Inv válido e nenhum vínculo ativo.
update public.wms_enderecos e
set status='ocupado',
    atualizado_em=now()
from public.wms_alocacoes a
join public.estoque_subinv s
  on btrim(s.imei)=btrim(a.imei)
 and s.data_subinv is not null
 and upper(btrim(coalesce(s.local_subinv,''))) not in ('ALPHA','YUSEN','YUSSEN','PEND')
where a.endereco_id=e.id
  and a.status='confirmado'
  and a.retirado_em is null
  and e.ativo=true
  and e.status='bloqueado'
  and not exists (
    select 1
    from public.wms_reservas_saida r
    where r.alocacao_id=a.id
      and r.status in ('reservado','analise','reconciliar')
  )
  and not exists (
    select 1
    from public.meli_aparelhos_bloqueados mb
    where btrim(mb.imei)=btrim(a.imei)
  )
  and not exists (
    select 1
    from public.pedidos_b2c pb
    where btrim(coalesce(pb.imei_alocado,''))=btrim(a.imei)
      and pb.status in (
        'alocado','em_picking','embalado','faturado',
        'aguardando_validacao_meli','em_analise','aguardando_definicao_produto'
      )
  )
  and not exists (
    select 1
    from public.b2b_itens bi
    join public.b2b_pedidos bp on bp.id=bi.pedido_id
    where btrim(bi.imei)=btrim(a.imei)
      and bi.status in ('pendente','nao_localizado','em_analise','bipado')
      and nullif(btrim(coalesce(bi.nf,'')),'') is null
      and bp.encerrado_sem_faturamento_em is null
      and coalesce(bp.status,'')<>'concluido'
  )
  and not exists (
    select 1
    from public.assurant_reservas_especiais esp
    where btrim(esp.imei)=btrim(a.imei)
      and esp.status='reservado'
  )
  and not exists (
    select 1
    from public.trocas_b2c_assurant_operacao op
    where btrim(op.imei)=btrim(a.imei)
      and op.status_furbtech='alocado'
  );
