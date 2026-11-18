-- 2026-11-18 | Rastreabilidade por múltiplas frentes e fallback de pedido histórico.
-- Correspondência por pedido, voucher e IMEI; IMEI isolado sem voucher não vincula WMS ao pedido.
-- AnyMarket: snapshot mais recente por pedido para evitar registros repetidos.

CREATE OR REPLACE FUNCTION public.assurant_rastreabilidade_frentes(p_busca text, p_imei text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
 SET statement_timeout TO '20s'
AS $function$
declare
 v_busca text:=nullif(btrim(p_busca),'');
 v_num bigint;
 v_imei text:=coalesce(nullif(btrim(p_imei),''),case when btrim(p_busca) ~ '^[0-9]{15}$' then btrim(p_busca) end);
 v_voucher text:=case when upper(btrim(p_busca)) ~ '^YBV[0-9]+$' then upper(btrim(p_busca)) end;
 v_result jsonb;
begin
 if not public.assurant_rastreabilidade_autorizado() then
   raise exception 'Sem acesso à rastreabilidade do item' using errcode='42501';
 end if;
 if v_busca is null then return jsonb_build_object('encontrado',false,'fontes','[]'::jsonb,'eventos','[]'::jsonb); end if;
 if v_busca ~ '^[0-9]{1,13}$' then v_num:=v_busca::bigint; end if;
 with vinculos as materialized (
    -- Apenas ligações individualizadas e documentadas, nunca por SKU/modelo.
    select nullif(btrim(p.imei_bipado),'') imei,upper(btrim(a.voucher)) voucher
    from public.pedidos_b2c p left join public.wms_alocacoes a on a.id=p.wms_alocacao_id
    where v_num is not null and p.id_anymarket=v_num
    union all
    select nullif(btrim(p.imei_alocado),''),upper(btrim(a.voucher))
    from public.pedidos_b2c p left join public.wms_alocacoes a on a.id=p.wms_alocacao_id
    where v_num is not null and p.id_anymarket=v_num
    union all
    select nullif(btrim(op.imei),''),null::text
    from public.trocas_b2c_assurant t join public.trocas_b2c_assurant_operacao op on op.troca_id=t.id
    where t.id_anymarket=v_busca
    union all
    select nullif(btrim(d.imei_vendido),''),nullif(upper(btrim(d.voucher_origem)),'')
    from public.devolucoes_b2c d where d.id_anymarket=v_busca or d.pedido_portal=v_busca
    union all
    select nullif(btrim(d.imei_recebido),''),nullif(upper(btrim(d.voucher_dev)),'')
    from public.devolucoes_b2c d where d.id_anymarket=v_busca or d.pedido_portal=v_busca
    union all
    select v_imei,v_voucher
 ),
 refs as materialized (
    select distinct nullif(imei,'') imei,nullif(voucher,'') voucher from vinculos where imei is not null or voucher is not null
 ),
 fontes as (
    select 'Histórico de Vendas'::text as frente,'assurant_historico_vendas'::text as origem,
      h.id::text as referencia,h.status_final::text as status,h.titulo_produto::text as titulo,
      null::text as imei,null::text as voucher,
      jsonb_build_object('pedido',h.id_anymarket,'codigo_pedido',h.codigo_pedido,'marketplace',h.marketplace,
        'sku',h.sku_produto,'grade',h.grade_normalizada,'nf',h.numero_nf,'chave_nf',h.chave_nf,
        'valor_unitario',h.valor_unitario,'quantidade',h.quantidade,
        'data_entrega',h.data_entrega,'origem_arquivo',h.origem_arquivo) as detalhes,
      jsonb_build_array(
       jsonb_build_object('data',h.data_pedido,'evento','Pedido registrado no histórico'),
       jsonb_build_object('data',h.data_pagamento,'evento','Pagamento registrado'),
       jsonb_build_object('data',h.data_emissao_nf,'evento','NF emitida'),
       jsonb_build_object('data',h.data_handover,'evento','Handover registrado'),
       jsonb_build_object('data',h.data_entrega,'evento','Entrega registrada'),
       jsonb_build_object('data',h.data_cancelamento,'evento','Cancelamento registrado')
      ) as marcos
    from public.assurant_historico_vendas h
    where (v_num is not null and h.id_anymarket=v_num)
      or h.codigo_pedido=v_busca
      or (char_length(v_busca)>5 and h.numero_nf=v_busca)
    union all
    select 'Pedidos B2C','pedidos_b2c',p.id::text,p.status,p.titulo_produto,
      coalesce(nullif(btrim(p.imei_bipado),''),nullif(btrim(p.imei_alocado),'')),
      upper(btrim(a.voucher)),
      jsonb_build_object('pedido',p.id_anymarket,'sku',p.sku_produto,'grade',p.grade_produto,
         'marketplace',p.marketplace,'nf',p.numero_nf,'status_marketplace',p.status_anymarket,'codigo_rastreio',p.codigo_de_rastreio),
      jsonb_build_array(
         jsonb_build_object('data',p.criado_em,'evento','Pedido criado'),
         jsonb_build_object('data',p.alocado_em,'evento','Alocação B2C'),
         jsonb_build_object('data',p.bipado_em,'evento','Bipagem B2C'),
         jsonb_build_object('data',p.embalado_em,'evento','Embalagem B2C'),
         jsonb_build_object('data',p.faturado_em,'evento','Faturamento B2C')
      )
    from public.pedidos_b2c p left join public.wms_alocacoes a on a.id=p.wms_alocacao_id
    where (v_num is not null and p.id_anymarket=v_num)
       or (v_imei is not null and (p.imei_bipado=v_imei or p.imei_alocado=v_imei))
       or (v_busca=p.numero_nf and char_length(v_busca)>5)
    union all
    select 'Trocas B2C','trocas_b2c_assurant',t.id::text,t.status,
      coalesce(t.produto_substituto,t.produto_original),null::text,null::text,
      jsonb_build_object('pedido',t.id_anymarket,'produto_original',t.produto_original,'produto_substituto',t.produto_substituto,
        'novo_sku',t.novo_sku,'grade',t.produto_grade,'data_solicitacao',t.data_solicitacao),
      jsonb_build_array(
         jsonb_build_object('data',t.criado_em,'evento','Troca registrada'),
         jsonb_build_object('data',t.data_solicitacao,'evento','Solicitação de troca')
      )
    from public.trocas_b2c_assurant t where t.id_anymarket=v_busca
    union all
    select 'Trocas — Operação','trocas_b2c_assurant_operacao',op.id::text,op.status_furbtech,
      coalesce(op.sku_escolhido,t.produto_substituto),nullif(btrim(op.imei),''),null::text,
      jsonb_build_object('pedido',t.id_anymarket,'sku_escolhido',op.sku_escolhido,'imei',op.imei,
        'nf',op.nf,'rastreio',op.rastreio,'teste_resultado',op.teste_resultado,'tentativas',op.tentativas),
      jsonb_build_array(
         jsonb_build_object('data',op.atualizado_em,'evento','Operação de troca atualizada'),
         jsonb_build_object('data',op.data_separacao,'evento','Separação da troca'),
         jsonb_build_object('data',op.data_nf,'evento','NF da troca')
      )
    from public.trocas_b2c_assurant t join public.trocas_b2c_assurant_operacao op on op.troca_id=t.id
    where t.id_anymarket=v_busca or (v_imei is not null and op.imei=v_imei)
    union all
    select 'Devoluções B2C','devolucoes_b2c',d.id::text,d.status,
      d.produto_original,coalesce(d.imei_recebido,d.imei_vendido),coalesce(d.voucher_dev,d.voucher_origem),
      jsonb_build_object('pedido',d.id_anymarket,'pedido_portal',d.pedido_portal,'protocolo',d.protocolo,
        'motivo',d.motivo,'nf_venda',d.nf_venda,'imei_vendido',d.imei_vendido,
        'imei_recebido',d.imei_recebido,'voucher_origem',d.voucher_origem,'voucher_devolucao',d.voucher_dev,
        'destino_final',d.destino_final),
      jsonb_build_array(
         jsonb_build_object('data',d.data_solicitacao,'evento','Devolução solicitada'),
         jsonb_build_object('data',d.data_recebimento,'evento','Devolução recebida'),
         jsonb_build_object('data',d.triagem_concluida_em,'evento','Triagem da devolução concluída'),
         jsonb_build_object('data',d.data_finalizacao,'evento','Devolução finalizada')
      )
    from public.devolucoes_b2c d
    where d.id_anymarket=v_busca or d.pedido_portal=v_busca
       or (v_imei is not null and (d.imei_vendido=v_imei or d.imei_recebido=v_imei))
       or (v_voucher is not null and (upper(d.voucher_dev)=v_voucher or upper(d.voucher_origem)=v_voucher))
    union all
    select 'Histórico de Devoluções','assurant_historico_devolucoes',d.id::text,d.status_devolucao,
      d.produto,null::text,null::text,
      jsonb_build_object('pedido',d.id_anymarket,'tipo',d.tipo_devolucao,'motivo',d.motivo,
       'status_envio',d.status_envio_devolucao,'marketplace',d.marketplace,'origem_arquivo',d.origem_arquivo),
      jsonb_build_array(
       jsonb_build_object('data',d.data_devolucao,'evento','Devolução histórica'),
       jsonb_build_object('data',d.data_entrega_cd,'evento','Entrega ao CD informada')
      )
    from public.assurant_historico_devolucoes d
    where (v_num is not null and (d.id_anymarket=v_num or d.id_devolucao_anymarket=v_num))
      or d.id_devolucao_marketplace=v_busca
    union all
    select 'Integração AnyMarket','anymarket_pedidos',p.id::text,
      coalesce(p.status_no_marketplace,p.status),p.codigo_pedido,
      null::text,null::text,
      jsonb_build_object('pedido',p.id_anymarket,'codigo_pedido',p.codigo_pedido,
       'status_marketplace',p.status_no_marketplace,'codigo_rastreio',p.codigo_de_rastreio),
      '[]'::jsonb
    from (
      -- Um pedido AnyMarket tem múltiplos snapshots de importação.
      -- Exibir o estado mais recente sem repetir dezenas de cartões.
      select src.* from public.anymarket_pedidos src
      where src.id_anymarket=coalesce(v_num,(
        select h.id_anymarket from public.assurant_historico_vendas h
        where h.codigo_pedido=v_busca
        order by h.data_pedido desc nulls last limit 1
      ))
      order by src.importado_em desc nulls last,src.id desc
      limit 1
    ) p
    union all
    select 'Trade-In','tradein_geral',g.voucher::text,g.status_atual,g.aparelho,g.imei,
       coalesce(nullif(upper(btrim(g.voucher_ybv)),''),'YBV'||g.voucher::text),
       jsonb_build_object('sku',g.sku,'modelo',g.aparelho,'status_tradein',g.status_atual,
        'vinculo',case
          when v_voucher is not null and (upper(g.voucher_ybv)=v_voucher or g.voucher::text=substring(v_voucher from 4)) then 'Voucher pesquisado confirmado'
          when exists(select 1 from refs x where x.voucher is not null and x.voucher=upper(g.voucher_ybv)) then 'Voucher vinculado ao pedido'
          else 'Correspondência apenas por IMEI: conferir voucher, não vincular automaticamente' end),
       '[]'::jsonb
    from public.tradein_geral g
    where (v_voucher is not null and (upper(g.voucher_ybv)=v_voucher or g.voucher::text=substring(v_voucher from 4)))
       or (v_imei is not null and g.imei=v_imei)
       or exists(select 1 from refs x where x.imei=g.imei and x.imei is not null)
       or exists(select 1 from refs x where x.voucher=upper(g.voucher_ybv) and x.voucher is not null)
    union all
    select 'Warehouse / WMS','wms_alocacoes',w.id::text,w.status,w.modelo,w.imei,w.voucher,
       jsonb_build_object('sku',w.sku,'grade',w.grade_venda,'data_confirmacao',w.confirmado_em,
        'retirado_em',w.retirado_em,'criterio','Vínculo direto por voucher/IMEI; conferir duplicidades'),
       jsonb_build_array(
         jsonb_build_object('data',w.confirmado_em,'evento','Alocação WMS confirmada'),
         jsonb_build_object('data',w.retirado_em,'evento','Retirada WMS registrada')
       )
    from public.wms_alocacoes w
    where (v_voucher is not null and upper(w.voucher)=v_voucher)
      or (v_imei is not null and w.imei=v_imei)
      -- IMEI isolado em pedido histórico não prova que o WMS é do
      -- mesmo voucher. Exigir vínculo físico voucher + IMEI no pedido.
      or exists(select 1 from refs x
         where x.voucher is not null and upper(w.voucher)=x.voucher
           and (x.imei is null or x.imei=w.imei))
    union all
    select 'Laboratório','reparo_lab_itens',l.id::text,l.status_etapa,l.resultado_descricao,l.imei,l.voucher,
       jsonb_build_object('resultado',l.resultado_descricao),
       jsonb_build_array(jsonb_build_object('data',l.concluido_em,'evento','Reparo concluído'),
                         jsonb_build_object('data',l.atualizado_em,'evento','Laboratório atualizado'))
    from liquida_private.reparo_lab_itens l
    where (v_voucher is not null and upper(l.voucher)=v_voucher)
      or (v_imei is not null and l.imei=v_imei)
      or exists(select 1 from refs x where x.voucher=upper(l.voucher) and x.voucher is not null)
    union all
    select 'Laboratório','reparo_lab_avulsos',l.id::text,l.status_etapa,l.resultado_descricao,l.imei,l.voucher,
       jsonb_build_object('resultado',l.resultado_descricao),
       jsonb_build_array(jsonb_build_object('data',l.concluido_em,'evento','Reparo concluído'),
                         jsonb_build_object('data',l.atualizado_em,'evento','Laboratório atualizado'))
    from liquida_private.reparo_lab_avulsos l
    where (v_voucher is not null and upper(l.voucher)=v_voucher)
      or (v_imei is not null and l.imei=v_imei)
      or exists(select 1 from refs x where x.voucher=upper(l.voucher) and x.voucher is not null)
    union all
    select 'B2B','b2b_itens',i.id::text,i.status,bp.lote,i.imei,i.voucher,
       jsonb_build_object('lote',bp.lote,'pedido_status',bp.status,'nf',i.nf,
          'bipado_em',i.bipado_em,'criterio','Vínculo por IMEI/voucher, não por SKU do lote'),
       jsonb_build_array(jsonb_build_object('data',i.bipado_em,'evento','Bipagem B2B'),
                         jsonb_build_object('data',i.embalado_em,'evento','Embalagem B2B'))
    from public.b2b_itens i join public.b2b_pedidos bp on bp.id=i.pedido_id
    where (v_imei is not null and i.imei=v_imei)
      or (v_voucher is not null and upper(i.voucher)=v_voucher)
      or exists(select 1 from refs x where x.voucher=upper(i.voucher) and x.imei=i.imei and x.imei is not null and x.voucher is not null)
 )
 select jsonb_build_object(
   'encontrado',exists(select 1 from fontes),
   'fontes',coalesce((select jsonb_agg(to_jsonb(f)-'marcos' order by case f.frente
       when 'Histórico de Vendas' then 0 when 'Trocas B2C' then 1 when 'Trocas — Operação' then 2
       when 'Devoluções B2C' then 3 when 'Histórico de Devoluções' then 4 when 'Pedidos B2C' then 5
       when 'Integração AnyMarket' then 6 when 'Trade-In' then 7 else 8 end, f.referencia)
        from (select * from fontes limit 250) f),'[]'::jsonb),
   'eventos',coalesce((select jsonb_agg(
       jsonb_build_object('data',m.value->>'data','categoria',f.frente,
          'evento',m.value->>'evento','status',f.status,'descricao',f.titulo,
          'origem',f.origem,'referencia',f.referencia)
       order by (m.value->>'data')::timestamptz desc nulls last)
        from fontes f cross join lateral jsonb_array_elements(f.marcos) m(value)
        where m.value->>'data' is not null),'[]'::jsonb),
   'fontes_consultadas',jsonb_build_array('Histórico de Vendas','Pedidos B2C','Trocas B2C',
      'Operação de Trocas','Devoluções B2C','Histórico de Devoluções','AnyMarket',
      'Trade-In','WMS','Laboratório','B2B'),
   'criterio','Relacionamentos somente por pedido exato, voucher, IMEI ou vínculo técnico identificado; nunca relacionar produtos apenas por SKU ou modelo'
 ) into v_result;
 return v_result;
end
$function$


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
  v_status_pedido text;
  v_referencia_pedido text;
  v_frentes jsonb;
  v_fonte jsonb;
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
    -- Não tratar venda/troca/devolução histórica como inexistente quando
    -- não foi identificada passagem pela esteira B2C ou IMEI no WMS.
    v_frentes:=public.assurant_rastreabilidade_frentes(v_busca,null);
    if coalesce((v_frentes->>'encontrado')::boolean,false) then
      v_fonte:=v_frentes->'fontes'->0;
      return jsonb_build_object(
        'privado',true,
        'busca',v_busca,
        'selecionado_imei',null,
        'selecionado_pedido',coalesce(v_pedido,
          case when v_busca ~ '^[0-9]{1,13}$' then v_busca::bigint end),
        'matches',v_matches,
        'resumo',jsonb_build_object(
          'voucher',v_fonte->>'voucher',
          'imei',v_fonte->>'imei',
          'sku',coalesce(v_fonte#>>'{detalhes,sku}',v_fonte#>>'{detalhes,sku_produto}'),
          'modelo',v_fonte->>'titulo',
          'grade',v_fonte#>>'{detalhes,grade}',
          'status_operacional',v_fonte->>'status',
          'status_triagem',null,
          'somente_tradein',true,
          'pedido_consultado',v_busca,
          'origem_consulta',v_fonte->>'origem',
          'vinculo_operacional_nao_confirmado',true
        ),
        'eventos',coalesce(v_frentes->'eventos','[]'::jsonb),
        'frentes',v_frentes,
        'wms_ciclos','[]'::jsonb,
        'pedidos_b2c','[]'::jsonb,
        'pedidos_b2b','[]'::jsonb
      );
    end if;
    return jsonb_build_object(
      'privado',true,
      'busca',v_busca,
      'selecionado_imei',null,
      'selecionado_pedido',v_pedido,
      'matches',v_matches,
      'resumo',null,
      'eventos','[]'::jsonb,
      'frentes',v_frentes,
      'wms_ciclos','[]'::jsonb,
      'pedidos_b2c','[]'::jsonb,
      'pedidos_b2b','[]'::jsonb
    );
  end if;

  -- Mantém o pedido exato no contexto e evita varredura textual na rotina completa.
  v_result := public.assurant_rastreabilidade_privada(case when v_pedido is not null then v_pedido::text else null end,v_sel);
  -- Status operacional derivado da bipagem real, sem sobrescrever a triagem.
  if jsonb_typeof(v_result->'resumo')='object' then
    select r.status_exibicao,r.pedido_referencia
      into v_status_pedido,v_referencia_pedido
    from liquida_private.reservas_por_bipagem(v_sel,
      nullif(upper(btrim(v_result#>>'{resumo,voucher}')),'')) r
    where r.status_exibicao is not null
    limit 1;
    v_result:=jsonb_set(v_result,'{resumo}',
      (v_result->'resumo') || jsonb_build_object(
        'status_operacional',coalesce(v_status_pedido,v_result#>>'{resumo,status_triagem}'),
        'pedido_reservado',v_referencia_pedido
      ),true);
  end if;
  return coalesce(v_result,'{}'::jsonb)
    || jsonb_build_object(
      'busca',v_busca,
      'selecionado_imei',v_sel,
      'selecionado_pedido',v_pedido,
      'matches',v_matches
    );
end;
$function$


REVOKE ALL ON FUNCTION public.assurant_rastreabilidade_frentes(text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assurant_rastreabilidade_frentes(text,text) TO authenticated;
