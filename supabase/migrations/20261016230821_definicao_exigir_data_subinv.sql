-- Definição Assurant/Furb: elegibilidade exige data no estoque Sub_Inv atual.
-- Mantém assinaturas, permissões, histórico e fluxo geral de armazenagem.

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
    select
      p.id,p.id_anymarket,p.marketplace,p.cliente,p.status,p.grupo_id
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
    else null
  end as vinculo_tipo,

  case
    when e.especial_id is not null then e.especial_id::text
    when e.reserva_especial_ref is not null then e.reserva_especial_ref
    when e.b2c_id_anymarket is not null then e.b2c_id_anymarket::text
    when e.reserva_b2c_ref is not null then e.reserva_b2c_ref
    when e.b2b_lote is not null then e.b2b_lote
    else e.reserva_b2b_ref
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
    'reserva_wms_especial_id',e.reserva_especial_wms_id
  )) as vinculo_detalhes

from enriquecidos e
-- Somente o estoque Sub_Inv atual com data torna o produto elegível.
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

CREATE OR REPLACE FUNCTION public.b2c_definicao_opcoes(p_pedido_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare v_p public.pedidos_b2c%rowtype; v_grade text; v_opcoes jsonb; v_skus jsonb; v_vinculos jsonb;
begin
 if not (public.b2c_definicao_acesso('assurant') or public.b2c_definicao_acesso('liquida')) then raise exception 'Sem permissão para consultar as alternativas de definição.' using errcode='42501'; end if;
 select * into v_p from public.pedidos_b2c where id=p_pedido_id;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 v_grade:=public.b2c_grade_alvo_exata(v_p.sku_produto,v_p.grade_produto);
 select jsonb_agg(to_jsonb(f)) into v_skus from public.b2c_definicao_familia(v_p.sku_produto) f;
 with candidatos as (
  select c.*,coalesce(nullif(btrim(f.cor),''),'Sem cor') as cor,f.capacidade,
   coalesce(f.modelo,c.modelo) as modelo_catalogo,
   case when lower(coalesce(c.status_bateria,''))='saúde da bateria entre 70 e 79%' then 'OUTLET' else public.b2c_normalizar_grade_exata(c.grade) end as grade_comercial
  from public.b2c_definicao_familia(v_p.sku_produto) f
  cross join lateral public.assurant_definicao_candidatos(f.sku) c
  where c.data_subinv is not null
    and not private.b2c_definicao_imei_bloqueado(c.imei)
  and (c.disponivel or c.vinculo_tipo is not null)
  and coalesce(c.vinculo_detalhes->>'b2c_item_id','')<>v_p.id::text
  and not exists(select 1 from public.pedidos_b2c p where btrim(p.imei_alocado)=c.imei and p.status in ('aguardando_validacao_meli','embalado','faturado','concluido'))
  and public.b2c_grade_ordem_exata(c.grade)>=public.b2c_grade_ordem_exata('BOM')
  and lower(coalesce(c.status_bateria,'')) not in ('saúde da bateria abaixo 70%','saúde da bateria abaixo de 80%')
 ), elegiveis as (
  select c.*,
   case grade_comercial when 'LIKE NEW' then 'Like New' when 'EXCELENTE' then 'Excelente' when 'MUITO BOM' then 'Muito Bom' when 'BOM' then 'Bom' when 'OUTLET' then 'Outlet' end as grade_exibicao,
   case when public.b2c_grade_ordem_exata(grade_comercial)>public.b2c_grade_ordem_exata(v_grade) then 'upgrade' when public.b2c_grade_ordem_exata(grade_comercial)<public.b2c_grade_ordem_exata(v_grade) then 'downgrade' else 'mesma_grade' end as relacao
  from candidatos c where grade_comercial in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM','OUTLET')
 ), agrupados as (
  select sku,grade_comercial,grade_exibicao,cor,capacidade,modelo_catalogo,relacao,disponivel,vinculo_tipo,vinculo_referencia,
   jsonb_agg(to_jsonb(e) order by data_subinv nulls last,imei) as candidatos
  from elegiveis e group by sku,grade_comercial,grade_exibicao,cor,capacidade,modelo_catalogo,relacao,disponivel,vinculo_tipo,vinculo_referencia
 )
 select coalesce(jsonb_agg(jsonb_build_object(
  'sku',sku,'modelo',modelo_catalogo,'capacidade',capacidade,'grade',grade_exibicao,'cor',cor,'relacao',relacao,
  'quantidade',jsonb_array_length(candidatos),'fifo',candidatos->0,'candidatos',candidatos,
  'grade_fisica_fifo',candidatos->0->>'grade','outlet',grade_comercial='OUTLET',
  'disponivel',disponivel,'vinculo_tipo',vinculo_tipo,'vinculo_referencia',vinculo_referencia,
  'vinculo_descricao',candidatos->0->>'vinculo_descricao','vinculo_detalhes',candidatos->0->'vinculo_detalhes'
 ) order by cor,public.b2c_grade_ordem_exata(grade_comercial) desc,disponivel desc,sku),'[]'::jsonb) into v_opcoes from agrupados;
 select coalesce(jsonb_agg(to_jsonb(v)),'[]'::jsonb) into v_vinculos from public.b2c_definicao_familia(v_p.sku_produto) f cross join lateral public.assurant_definicao_vinculos_sku(f.sku,v_p.id) v;
 return jsonb_build_object('existe',true,'skuBase',regexp_replace(v_p.sku_produto,'-CC[0-9]+$','','i'),'gradeOrigem',case v_grade when 'LIKE NEW' then 'Like New' when 'EXCELENTE' then 'Excelente' when 'MUITO BOM' then 'Muito Bom' when 'BOM' then 'Bom' when 'OUTLET' then 'Outlet' else v_p.grade_produto end,'modelo',v_skus->0->>'modelo','familia',coalesce(v_skus,'[]'::jsonb),'opcoes',v_opcoes,'vinculosSku',v_vinculos);
end; $function$;

CREATE OR REPLACE FUNCTION private.b2c_definicao_guard_etapa()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
 if old.status='aguardando_definicao_produto' and (new.upgrade_aprovado is distinct from old.upgrade_aprovado or new.upgrade_imei is distinct from old.upgrade_imei) and coalesce(new.upgrade_aprovado,false) and (new.definicao_etapa<>'assurant' or not public.b2c_definicao_acesso('assurant')) then raise exception 'Encaminhe à Assurant para aprovar o upgrade.' using errcode='42501'; end if;
 if old.status<>'aguardando_definicao_produto' and new.status='aguardando_definicao_produto' and old.definicao_assurant_caso_id is not null then
  new.definicao_etapa:='liquida'; new.definicao_assurant_caso_id:=null;
 end if;
 if new.definicao_etapa is distinct from old.definicao_etapa or new.definicao_assurant_caso_id is distinct from old.definicao_assurant_caso_id then
  if new.definicao_etapa='assurant' then
   if not public.b2c_definicao_acesso('liquida') or not exists(select 1 from public.b2c_definicao_assurant_casos c where c.id=new.definicao_assurant_caso_id and c.pedido_id=new.id and c.encaminhado_por=auth.uid() and c.estado='pendente') then raise exception 'Encaminhe o pedido pela ação da Liquida.' using errcode='42501'; end if;
  elsif old.status='aguardando_definicao_produto' and old.definicao_etapa='assurant' then
   raise exception 'A definição encaminhada deve ser resolvida na fila da Assurant.';
  end if;
 end if;
 if old.status='aguardando_definicao_produto' and old.definicao_etapa='assurant' and (
  new.imei_alocado is distinct from old.imei_alocado or new.status is distinct from old.status or new.definicao_status is distinct from old.definicao_status or new.upgrade_aprovado is distinct from old.upgrade_aprovado or new.upgrade_imei is distinct from old.upgrade_imei
 ) then
  if not public.b2c_definicao_acesso('assurant') and not (public.b2c_definicao_acesso('liquida') and (old.definicao_status='aguardando_desvinculacao' or new.status='cancelado')) and not (new.status='cancelado' and current_user in ('postgres','service_role','supabase_admin')) then raise exception 'Esta definição deve ser aprovada pela Assurant.' using errcode='42501'; end if;
 end if;
 -- A data atual é obrigatória também em confirmações diretas ou de telas antigas.
 if old.status='aguardando_definicao_produto' then
  if (new.status in ('alocado','em_picking') or new.definicao_status='concluido')
     and nullif(btrim(new.imei_alocado),'') is not null
     and not exists(select 1 from public.estoque_subinv s where btrim(s.imei)=btrim(new.imei_alocado) and s.data_subinv is not null) then
   raise exception 'Produto sem data de Sub_Inv não é uma opção viável para definição. Atualize as alternativas.';
  end if;
  if coalesce(new.upgrade_aprovado,false)
     and (new.upgrade_aprovado is distinct from old.upgrade_aprovado or new.upgrade_imei is distinct from old.upgrade_imei)
     and not exists(select 1 from public.estoque_subinv s where btrim(s.imei)=btrim(new.upgrade_imei) and s.data_subinv is not null) then
   raise exception 'Produto sem data de Sub_Inv não é uma opção viável para definição. Atualize as alternativas.';
  end if;
 end if;
 return new;
end; $function$;

CREATE OR REPLACE FUNCTION public.assurant_processar_solicitacao_desvinculacao(p_solicitacao_id uuid, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_motivo text := nullif(btrim(p_motivo),'');
  v_s public.assurant_solicitacoes_desvinculacao%rowtype;
  v_p public.pedidos_b2c%rowtype;
  v_alocacao public.wms_alocacoes%rowtype;
  v_endereco public.wms_enderecos%rowtype;

  v_src_b2c public.pedidos_b2c%rowtype;
  v_src_b2c_found boolean := false;
  v_src_group uuid;
  v_group_count integer := 0;
  v_b2c_snapshot jsonb := '[]'::jsonb;

  v_b2b_ids uuid[];
  v_b2b_pedidos uuid[];
  v_b2b_snapshot jsonb := '[]'::jsonb;
  v_b2b_exportados integer := 0;
  v_pedido_id uuid;

  v_especial public.assurant_reservas_especiais%rowtype;
  v_especial_snapshot jsonb := null;
  v_resultado jsonb;
begin
  if not public.assurant_desvinculacao_liquida_autorizado() then
    raise exception 'Ação restrita à equipe Liquida Preço' using errcode='42501';
  end if;

  if v_motivo is null or length(v_motivo)<3 then
    return jsonb_build_object('ok',false,'erro','Informe o motivo/justificativa com pelo menos 3 caracteres.');
  end if;

  select * into v_s
  from public.assurant_solicitacoes_desvinculacao
  where id=p_solicitacao_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'erro','Solicitação não encontrada.');
  end if;

  if v_s.status not in ('pendente','erro') then
    return jsonb_build_object('ok',false,'erro','Esta solicitação já foi tratada.');
  end if;

  -- Revalida antes de desfazer qualquer vínculo; protege a data durante a transferência.
  perform 1 from public.estoque_subinv s
  where btrim(s.imei)=btrim(v_s.imei) and s.data_subinv is not null
  for share;
  if not found then
    return jsonb_build_object('ok',false,'erro','Produto sem data de Sub_Inv não é uma opção viável para definição. Atualize as alternativas.');
  end if;

  update public.assurant_solicitacoes_desvinculacao
  set status='processando',atualizado_em=now()
  where id=v_s.id;

  select * into v_p
  from public.pedidos_b2c
  where id=v_s.pedido_b2c_id
  for update;

  if not found
     or v_p.status<>'aguardando_definicao_produto'
     or coalesce(v_p.definicao_status,'')<>'aguardando_desvinculacao' then
    raise exception 'O pedido B2C destino não está mais aguardando esta transferência.';
  end if;

  select a.* into v_alocacao
  from public.wms_alocacoes a
  join public.wms_enderecos e on e.id=a.endereco_id
  where btrim(a.imei)=btrim(v_s.imei)
    and a.status='confirmado'
    and e.ativo=true
    and e.status in ('ocupado','bloqueado')
  order by coalesce(a.confirmado_em,a.reservado_em,a.criado_em) desc nulls last,a.id desc
  limit 1
  for update of a;

  if not found then
    raise exception 'O IMEI não possui mais posição física confirmada no WMS.';
  end if;

  select * into v_endereco
  from public.wms_enderecos
  where id=v_alocacao.endereco_id
  for update;

  -- Descobre vínculo B2C de origem ainda sem NF.
  select * into v_src_b2c
  from public.pedidos_b2c pb
  where pb.id<>v_p.id
    and btrim(coalesce(pb.imei_alocado,''))=btrim(v_s.imei)
    and pb.status in ('alocado','em_picking','em_analise')
    and nullif(btrim(coalesce(pb.numero_nf,'')),'') is null
    and nullif(btrim(coalesce(pb.chave_nf,'')),'') is null
  order by pb.atualizado_em desc nulls last,pb.id desc
  limit 1
  for update;

  v_src_b2c_found := found;

  if v_s.vinculo_tipo='B2C' then
    if not v_src_b2c_found then
      raise exception 'O vínculo B2C de origem não existe mais ou já possui NF.';
    end if;

    if nullif(v_s.vinculo_detalhes->>'b2c_item_id','') is not null
       and (v_s.vinculo_detalhes->>'b2c_item_id')::uuid<>v_src_b2c.id then
      raise exception 'O vínculo B2C mudou desde a seleção. Atualize a solicitação.';
    end if;
  elsif v_src_b2c_found then
    raise exception 'O aparelho passou a estar vinculado ao B2C #% e precisa ser revisado.',
      v_src_b2c.id_anymarket;
  end if;

  -- Qualquer B2C faturado torna o aparelho intocável.
  if exists (
    select 1
    from public.pedidos_b2c pb
    where btrim(coalesce(pb.imei_alocado,''))=btrim(v_s.imei)
      and pb.status<>'cancelado'
      and (
        pb.status='faturado'
        or nullif(btrim(coalesce(pb.numero_nf,'')),'') is not null
        or nullif(btrim(coalesce(pb.chave_nf,'')),'') is not null
      )
  ) then
    raise exception 'O aparelho já possui NF/vínculo B2C faturado e não pode ser transferido.';
  end if;

  -- Se a origem é outro B2C, devolve o pedido de origem para nova definição.
  if v_src_b2c_found then
    v_src_group := v_src_b2c.grupo_id;
    v_b2c_snapshot := jsonb_build_array(jsonb_build_object(
      'tipo','origem',
      'pedido_id',v_src_b2c.id,
      'pedido',v_src_b2c.id_anymarket,
      'status',v_src_b2c.status,
      'grupo_id',v_src_b2c.grupo_id,
      'imei',v_src_b2c.imei_alocado
    ));

    update public.pedidos_b2c
    set
      status='aguardando_definicao_produto',
      grupo_id=null,
      imei_alocado=null,
      sku_alocado=null,
      grade_alocada=null,
      wms_alocacao_id=null,
      alocado_em=null,
      alocado_por=null,
      imei_bipado=null,
      bipado_em=null,
      bipado_por=null,
      embalado_em=null,
      embalado_por=null,
      definicao_status='pendente',
      definicao_solicitada_em=now(),
      definicao_solicitada_por=v_user,
      definicao_resolvido_em=null,
      definicao_resolvido_por=null,
      definicao_resumo=concat(
        'IMEI ',v_s.imei,' transferido pela Liquida Preço para o pedido B2C #',
        v_p.id_anymarket,'. Necessária nova definição.'
      ),
      motivo_analise=concat(
        'IMEI transferido para B2C #',v_p.id_anymarket,' · ',v_motivo
      ),
      atualizado_em=now()
    where id=v_src_b2c.id;

    if v_src_group is not null then
      select count(*) into v_group_count
      from public.pedidos_b2c
      where grupo_id=v_src_group;

      if v_group_count=0 then
        update public.pedidos_b2c_grupos
        set total_pedidos=0,
            status='concluido',
            oculto_picking=true,
            oculto_faturamento=true
        where id=v_src_group;
      else
        update public.pedidos_b2c_grupos
        set total_pedidos=v_group_count
        where id=v_src_group;
      end if;
    end if;
  end if;

  -- Vínculos B2B ainda sem NF.
  select
    array_agg(i.id order by i.id),
    array_agg(distinct i.pedido_id),
    coalesce(jsonb_agg(jsonb_build_object(
      'item_id',i.id,
      'pedido_id',i.pedido_id,
      'lote',bp.lote,
      'cliente',bp.cliente,
      'status',i.status,
      'exportado_faturamento',
      exists(select 1 from public.b2b_itens_exportados ex where ex.item_id=i.id)
    ) order by i.id),'[]'::jsonb)
  into v_b2b_ids,v_b2b_pedidos,v_b2b_snapshot
  from public.b2b_itens i
  join public.b2b_pedidos bp on bp.id=i.pedido_id
  where btrim(i.imei)=btrim(v_s.imei)
    and i.status in ('pendente','nao_localizado','em_analise','bipado')
    and nullif(btrim(coalesce(i.nf,'')),'') is null
    and bp.encerrado_sem_faturamento_em is null
    and coalesce(bp.status,'')<>'concluido';

  if coalesce(cardinality(v_b2b_ids),0)>0 then
    select count(*) into v_b2b_exportados
    from public.b2b_itens_exportados ex
    where ex.item_id=any(v_b2b_ids);

    update public.b2b_itens i
    set status='nao_faturar',
        imei_bipado=null,
        bipado_em=null,
        bipado_por=null,
        caixa_id=null,
        embalado_em=null,
        embalado_por=null,
        local_estoque=null,
        motivo_nao_faturar='transferido_b2c_definicao',
        obs_nao_faturar=v_motivo,
        nao_faturar_em=now(),
        nao_faturar_por=v_user
    where i.id=any(v_b2b_ids);

    foreach v_pedido_id in array v_b2b_pedidos loop
      perform public.b2b_atualizar_contador(v_pedido_id);

      update public.b2b_pedidos bp
      set status_picking=case
        when not exists (
          select 1
          from public.b2b_itens x
          where x.pedido_id=v_pedido_id
            and x.status in ('pendente','nao_localizado','em_analise')
        )
        and exists (
          select 1 from public.b2b_itens x where x.pedido_id=v_pedido_id
        )
        then 'concluido'
        else 'em_andamento'
      end
      where bp.id=v_pedido_id;
    end loop;
  end if;

  -- Troca / Venda Funcionário.
  select * into v_especial
  from public.assurant_reservas_especiais r
  where btrim(r.imei)=btrim(v_s.imei)
    and r.status='reservado'
  order by r.reservado_em desc
  limit 1
  for update;

  if found then
    v_especial_snapshot:=jsonb_build_object(
      'id',v_especial.id,
      'tipo',v_especial.tipo,
      'reservado_em',v_especial.reservado_em,
      'reservado_por',v_especial.reservado_por
    );

    update public.assurant_reservas_especiais
    set status='cancelado',
        cancelado_em=now(),
        cancelado_por=v_user,
        cancelamento_motivo=v_motivo,
        atualizado_em=now()
    where id=v_especial.id;
  end if;

  -- Garante o encerramento das reservas do vínculo anterior.
  update public.wms_reservas_saida r
  set status='cancelado',
      motivo=concat('Transferido para B2C por solicitação de definição: ',v_motivo),
      finalizado_em=now(),
      finalizado_por=v_user,
      atualizado_em=now()
  where r.alocacao_id=v_alocacao.id
    and r.status in ('reservado','analise','reconciliar')
    and (
      r.canal in ('B2B','TROCA','VENDA_FUNCIONARIO')
      or (
        v_src_b2c_found
        and r.canal='B2C'
        and r.referencia_id=v_src_b2c.id::text
      )
    );

  if exists (
    select 1
    from public.wms_reservas_saida r
    where r.alocacao_id=v_alocacao.id
      and r.status in ('reservado','analise','reconciliar')
  ) then
    raise exception 'Existe outro vínculo operacional ativo no WMS que precisa ser revisado antes da transferência.';
  end if;

  -- Se a posição estava bloqueada somente por análise/reserva anterior, libera
  -- para a reserva do B2C destino no mesmo ciclo físico.
  update public.wms_enderecos
  set status='ocupado',
      atualizado_em=now()
  where id=v_alocacao.endereco_id
    and status='bloqueado'
    and not exists (
      select 1
      from public.wms_reservas_saida r
      where r.alocacao_id=v_alocacao.id
        and r.status in ('reservado','analise','reconciliar')
    );

  update public.pedidos_b2c
  set
    sku_definido=case
      when upper(regexp_replace(coalesce(v_p.sku_produto,''),'-CC[0-9]+$','','i'))
           <>upper(v_s.sku_destino)
      then v_s.sku_destino
      else null
    end,
    grade_definida=case
      when upper(coalesce(v_p.grade_produto,''))<>upper(v_s.grade_destino)
        or upper(regexp_replace(coalesce(v_p.sku_produto,''),'-CC[0-9]+$','','i'))
           <>upper(v_s.sku_destino)
      then v_s.grade_destino
      else null
    end,
    definicao_status='concluido',
    definicao_resolvido_em=now(),
    definicao_resolvido_por=v_user,
    definicao_resumo=concat(
      'Liquida Preço transferiu IMEI ',v_s.imei,' de ',v_s.vinculo_tipo,
      ' para B2C · ',v_s.sku_destino,' · ',v_s.grade_destino,
      case when v_s.cor_destino is not null then ' · '||v_s.cor_destino else '' end
    ),
    status='alocado',
    imei_alocado=v_s.imei,
    sku_alocado=v_s.sku_destino,
    grade_alocada=coalesce(v_s.grade_fisica,v_s.grade_destino),
    wms_alocacao_id=v_alocacao.id,
    alocado_em=now(),
    alocado_por=v_user,
    atualizado_em=now()
  where id=v_p.id;

  update public.assurant_triagem t
  set status_atual='Reservado para pedido B2C',
      atualizado_em=now()
  where t.id=(
    select x.id
    from public.assurant_triagem x
    where btrim(x.imei)=btrim(v_s.imei)
    order by coalesce(x.atualizado_em,x.criado_em) desc nulls last,
             x.criado_em desc nulls last,
             x.id desc
    limit 1
  );

  v_resultado:=jsonb_build_object(
    'b2c_origem',case when v_src_b2c_found then v_b2c_snapshot else '[]'::jsonb end,
    'b2b_vinculos',v_b2b_snapshot,
    'b2b_exportados',v_b2b_exportados,
    'reserva_especial',v_especial_snapshot,
    'wms_alocacao_id',v_alocacao.id,
    'local',public.wms_endereco_texto(
      v_endereco.rua,v_endereco.bloco,v_endereco.andar,v_endereco.coluna,v_endereco.linha
    ),
    'pedido_b2c_destino',v_p.id_anymarket
  );

  update public.assurant_solicitacoes_desvinculacao
  set status='concluido',
      resolvido_por=v_user,
      resolvido_em=now(),
      motivo_resolucao=v_motivo,
      resultado=v_resultado,
      atualizado_em=now()
  where id=v_s.id;

  insert into public.assurant_desvinculacoes_pedido (
    imei,motivo,usuario_id,b2c_vinculos,b2b_vinculos,wms_alocacao_id,wms_resultado,b2b_exportados
  ) values (
    v_s.imei,
    concat('Transferência controlada para pedido B2C #',v_p.id_anymarket,': ',v_motivo),
    v_user,
    (case when v_src_b2c_found then v_b2c_snapshot else '[]'::jsonb end)
      || jsonb_build_array(jsonb_build_object(
        'tipo','destino',
        'pedido_id',v_p.id,
        'pedido',v_p.id_anymarket,
        'destino','B2C'
      )),
    v_b2b_snapshot,
    v_alocacao.id,
    jsonb_build_object(
      'transferencia_sem_rearmazenagem',true,
      'local_preservado',true
    ),
    v_b2b_exportados
  );

  return jsonb_build_object(
    'ok',true,
    'pedido_b2c_id',v_p.id,
    'id_anymarket',v_p.id_anymarket,
    'imei',v_s.imei,
    'wms_alocacao_id',v_alocacao.id,
    'resultado',v_resultado
  );

exception when others then
  update public.assurant_solicitacoes_desvinculacao
  set status='pendente',
      resultado=jsonb_build_object('erro',sqlerrm),
      atualizado_em=now()
  where id=p_solicitacao_id;

  return jsonb_build_object('ok',false,'erro',sqlerrm);
end;
$function$;
