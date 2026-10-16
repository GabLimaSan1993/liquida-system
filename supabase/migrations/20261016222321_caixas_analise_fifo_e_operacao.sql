create view public.fifo_auditoria_indicadores with(security_invoker=true) as select t.* from public.fifo_auditoria t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.imei_escolhido or x.imei_identificado=t.imei_escolhido);
 revoke all on public.fifo_auditoria_indicadores from public,anon; grant select on public.fifo_auditoria_indicadores to authenticated;

create view public.fifo_auditoria_db_indicadores with(security_invoker=true) as select t.* from public.fifo_auditoria_db t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.imei_escolhido or x.imei_identificado=t.imei_escolhido);
 revoke all on public.fifo_auditoria_db_indicadores from public,anon; grant select on public.fifo_auditoria_db_indicadores to authenticated;

create view public.mv_anymarket_ultima_indicadores with(security_invoker=true) as select t.* from public.mv_anymarket_ultima t
 where not (exists(select 1 from public.pedidos_b2c p where p.id_anymarket::text=t.id_anymarket::text) and not exists(select 1 from public.pedidos_b2c_indicadores p where p.id_anymarket::text=t.id_anymarket::text));
 revoke all on public.mv_anymarket_ultima_indicadores from public,anon;grant select on public.mv_anymarket_ultima_indicadores to authenticated;

create view public.assurant_historico_vendas_indicadores with(security_invoker=true) as select t.* from public.assurant_historico_vendas t
 where not (exists(select 1 from public.pedidos_b2c p where p.id_anymarket::text=t.id_anymarket::text) and not exists(select 1 from public.pedidos_b2c_indicadores p where p.id_anymarket::text=t.id_anymarket::text));
 revoke all on public.assurant_historico_vendas_indicadores from public,anon;grant select on public.assurant_historico_vendas_indicadores to authenticated;

create view public.b2b_pedidos_indicadores with(security_invoker=true) as
 select (jsonb_populate_record(null::public.b2b_pedidos,to_jsonb(t)||jsonb_build_object('total_itens',greatest(coalesce(t.total_itens,0)-c.excluidos,0),'total_bipados',greatest(coalesce(t.total_bipados,0)-c.bipados,0)))).*
 from public.b2b_pedidos t cross join lateral (
 select count(*)::integer excluidos,count(*)filter(where b.bipado_em is not null)::integer bipados from public.b2b_itens b where b.pedido_id=t.id and exists(select 1 from public.assurant_caixas_liberadas x where x.imei=coalesce(nullif(b.imei_bipado,''),b.imei) or x.imei_identificado=coalesce(nullif(b.imei_bipado,''),b.imei) or x.voucher=b.voucher)
 ) c where c.excluidos=0 or coalesce(t.total_itens,0)>c.excluidos;
 create view public.b2b_nfs_indicadores with(security_invoker=true) as
 select (jsonb_populate_record(null::public.b2b_nfs,to_jsonb(t)||jsonb_build_object('total_itens',greatest(coalesce(t.total_itens,0)-c.excluidos,0)))).*
 from public.b2b_nfs t cross join lateral (
 select count(*)::integer excluidos from public.b2b_itens b where b.pedido_id=t.pedido_id and b.nf=t.numero_nf and exists(select 1 from public.assurant_caixas_liberadas x where x.imei=coalesce(nullif(b.imei_bipado,''),b.imei) or x.imei_identificado=coalesce(nullif(b.imei_bipado,''),b.imei) or x.voucher=b.voucher)
 ) c where c.excluidos=0 or coalesce(t.total_itens,0)>c.excluidos;
 revoke all on public.b2b_pedidos_indicadores,public.b2b_nfs_indicadores from public,anon;
 grant select on public.b2b_pedidos_indicadores,public.b2b_nfs_indicadores to authenticated;
 -- Os registros operacionais, notas e valores originais permanecem preservados.;

create or replace view public.vw_ind_sla_base as
 SELECT id_anymarket,
    marketplace,
    status,
    pago_em,
    handover_em,
    (date_trunc('month'::text, pago_em))::date AS mes,
    COALESCE(limite_envio, ((date_trunc('day'::text, pago_em) + '2 days'::interval) - '00:00:01'::interval)) AS prazo,
    (limite_envio IS NOT NULL) AS prazo_do_canal
   FROM mv_anymarket_ultima_indicadores;

create or replace view public.vw_ind_canal_mes as
 SELECT (date_trunc('month'::text, pago_em))::date AS mes,
    marketplace,
    count(*) AS pagos,
    count(*) FILTER (WHERE (handover_em IS NOT NULL)) AS expedidos,
    count(*) FILTER (WHERE (status = 'Cancelado'::text)) AS cancelados
   FROM mv_anymarket_ultima_indicadores
  GROUP BY ((date_trunc('month'::text, pago_em))::date), marketplace;

create or replace view public.vw_ind_erros_mes as
 SELECT (date_trunc('month'::text, pago_em))::date AS mes,
    count(*) FILTER (WHERE (falha IS NOT NULL)) AS falhas_integracao,
    count(*) FILTER (WHERE (status = 'Cancelado'::text)) AS cancelados,
    count(*) AS pedidos
   FROM mv_anymarket_ultima_indicadores
  GROUP BY ((date_trunc('month'::text, pago_em))::date);

create or replace view public.vw_assurant_b2b_timeline as
 WITH itens AS (
         SELECT b2b_itens_indicadores.pedido_id,
            count(*) AS qtd_itens_base,
            count(*) FILTER (WHERE (b2b_itens_indicadores.status = 'bipado'::text)) AS qtd_itens_bipados_ativos,
            count(*) FILTER (WHERE (b2b_itens_indicadores.status = 'nao_faturar'::text)) AS qtd_itens_nao_faturar,
            count(*) FILTER (WHERE (b2b_itens_indicadores.status = ANY (ARRAY['pendente'::text, 'em_analise'::text, 'nao_localizado'::text]))) AS qtd_itens_pendentes,
            count(*) FILTER (WHERE ((b2b_itens_indicadores.status = 'bipado'::text) AND (b2b_itens_indicadores.embalado_em IS NOT NULL))) AS qtd_itens_embalados,
            count(*) FILTER (WHERE (b2b_itens_indicadores.nf_erro IS TRUE)) AS qtd_itens_nf_erro,
            (min(b2b_itens_indicadores.bipado_em) AT TIME ZONE 'UTC'::text) AS primeiro_bip_em,
            (max(b2b_itens_indicadores.bipado_em) AT TIME ZONE 'UTC'::text) AS ultimo_bip_em,
            (min(b2b_itens_indicadores.embalado_em) AT TIME ZONE 'UTC'::text) AS primeira_embalagem_em,
            (max(b2b_itens_indicadores.embalado_em) AT TIME ZONE 'UTC'::text) AS ultima_embalagem_em,
            max(
                CASE
                    WHEN ((b2b_itens_indicadores.status = 'nao_faturar'::text) AND (b2b_itens_indicadores.nao_faturar_em IS NOT NULL)) THEN b2b_itens_indicadores.nao_faturar_em
                    WHEN (b2b_itens_indicadores.bipado_em IS NOT NULL) THEN (b2b_itens_indicadores.bipado_em AT TIME ZONE 'UTC'::text)
                    ELSE NULL::timestamp with time zone
                END) AS ultimo_evento_picking_em
           FROM b2b_itens_indicadores
          GROUP BY b2b_itens_indicadores.pedido_id
        ), caixas AS (
         SELECT b2b_caixas.pedido_id,
            count(*) AS qtd_caixas,
            count(*) FILTER (WHERE (b2b_caixas.fechado_em IS NOT NULL)) AS qtd_caixas_fechadas,
            (min(b2b_caixas.criado_em) AT TIME ZONE 'UTC'::text) AS primeira_caixa_em,
            (max(b2b_caixas.fechado_em) AT TIME ZONE 'UTC'::text) AS ultima_caixa_fechada_em
           FROM b2b_caixas
          GROUP BY b2b_caixas.pedido_id
        ), nfs AS (
         SELECT b2b_nfs_indicadores.pedido_id,
            count(*) AS qtd_nfs,
            count(*) FILTER (WHERE (b2b_nfs_indicadores.status = 'erro'::text)) AS qtd_nfs_erro,
            min(b2b_nfs_indicadores.data_faturamento) FILTER (WHERE (COALESCE(b2b_nfs_indicadores.status, ''::text) <> 'erro'::text)) AS primeiro_faturamento_em,
            max(b2b_nfs_indicadores.data_faturamento) FILTER (WHERE (COALESCE(b2b_nfs_indicadores.status, ''::text) <> 'erro'::text)) AS ultimo_faturamento_em
           FROM b2b_nfs_indicadores
          GROUP BY b2b_nfs_indicadores.pedido_id
        ), base AS (
         SELECT p.id AS pedido_id,
            p.lote,
            p.cliente,
            p.total_itens,
            p.status,
            p.status_picking,
            p.status_faturamento,
            p.data_pedido,
            p.previsao_faturamento,
            (p.criado_em AT TIME ZONE 'UTC'::text) AS pedido_criado_em,
            p.email_conclusao_em,
            p.encerrado_sem_faturamento_em,
            COALESCE(i.qtd_itens_base, (0)::bigint) AS qtd_itens_base,
            COALESCE(i.qtd_itens_bipados_ativos, (0)::bigint) AS qtd_itens_bipados_ativos,
            COALESCE(i.qtd_itens_nao_faturar, (0)::bigint) AS qtd_itens_nao_faturar,
            COALESCE(i.qtd_itens_pendentes, (0)::bigint) AS qtd_itens_pendentes,
            COALESCE(i.qtd_itens_embalados, (0)::bigint) AS qtd_itens_embalados,
            COALESCE(i.qtd_itens_nf_erro, (0)::bigint) AS qtd_itens_nf_erro,
            i.primeiro_bip_em,
            i.ultimo_bip_em,
                CASE
                    WHEN (p.status_picking = 'concluido'::text) THEN i.ultimo_evento_picking_em
                    ELSE NULL::timestamp with time zone
                END AS picking_conclusao_em,
            i.primeira_embalagem_em,
                CASE
                    WHEN ((COALESCE(i.qtd_itens_bipados_ativos, (0)::bigint) > 0) AND (COALESCE(i.qtd_itens_embalados, (0)::bigint) = COALESCE(i.qtd_itens_bipados_ativos, (0)::bigint))) THEN i.ultima_embalagem_em
                    ELSE NULL::timestamp with time zone
                END AS embalagem_conclusao_em,
            COALESCE(c.qtd_caixas, (0)::bigint) AS qtd_caixas,
            COALESCE(c.qtd_caixas_fechadas, (0)::bigint) AS qtd_caixas_fechadas,
            c.primeira_caixa_em,
            c.ultima_caixa_fechada_em,
            COALESCE(n.qtd_nfs, (0)::bigint) AS qtd_nfs,
            COALESCE(n.qtd_nfs_erro, (0)::bigint) AS qtd_nfs_erro,
            n.primeiro_faturamento_em,
            n.ultimo_faturamento_em,
            ((upper(COALESCE(p.cliente, ''::text)) ~~ '%REPARO INTERNO%'::text) OR (upper(COALESCE(p.lote, ''::text)) ~~ '%REPARO_INTERNO%'::text)) AS eh_reparo_interno
           FROM (((b2b_pedidos_indicadores p
             LEFT JOIN itens i ON ((i.pedido_id = p.id)))
             LEFT JOIN caixas c ON ((c.pedido_id = p.id)))
             LEFT JOIN nfs n ON ((n.pedido_id = p.id)))
        )
 SELECT pedido_id,
    lote,
    cliente,
    total_itens,
    status,
    status_picking,
    status_faturamento,
    data_pedido,
    previsao_faturamento,
    pedido_criado_em,
    email_conclusao_em,
    encerrado_sem_faturamento_em,
    qtd_itens_base,
    qtd_itens_bipados_ativos,
    qtd_itens_nao_faturar,
    qtd_itens_pendentes,
    qtd_itens_embalados,
    qtd_itens_nf_erro,
    primeiro_bip_em,
    ultimo_bip_em,
    picking_conclusao_em,
    primeira_embalagem_em,
    embalagem_conclusao_em,
    qtd_caixas,
    qtd_caixas_fechadas,
    primeira_caixa_em,
    ultima_caixa_fechada_em,
    qtd_nfs,
    qtd_nfs_erro,
    primeiro_faturamento_em,
    ultimo_faturamento_em,
    eh_reparo_interno,
    (primeiro_bip_em IS NOT NULL) AS picking_iniciado,
    (status_picking = 'concluido'::text) AS picking_completo,
    (embalagem_conclusao_em IS NOT NULL) AS embalagem_completa,
    ((status_faturamento = 'concluido'::text) OR (email_conclusao_em IS NOT NULL)) AS faturamento_completo,
        CASE
            WHEN (primeiro_bip_em >= pedido_criado_em) THEN round((EXTRACT(epoch FROM (primeiro_bip_em - pedido_criado_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_pedido_ate_inicio_picking,
        CASE
            WHEN (picking_conclusao_em >= primeiro_bip_em) THEN round((EXTRACT(epoch FROM (picking_conclusao_em - primeiro_bip_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_duracao_picking,
        CASE
            WHEN (embalagem_conclusao_em >= picking_conclusao_em) THEN round((EXTRACT(epoch FROM (embalagem_conclusao_em - picking_conclusao_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_picking_ate_embalagem,
        CASE
            WHEN (ultimo_faturamento_em >= embalagem_conclusao_em) THEN round((EXTRACT(epoch FROM (ultimo_faturamento_em - embalagem_conclusao_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_embalagem_ate_faturamento,
        CASE
            WHEN (((status_faturamento = 'concluido'::text) OR (email_conclusao_em IS NOT NULL)) AND (COALESCE(email_conclusao_em, ultimo_faturamento_em) >= pedido_criado_em)) THEN round((EXTRACT(epoch FROM (COALESCE(email_conclusao_em, ultimo_faturamento_em) - pedido_criado_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_ponta_a_ponta,
    (NOT (((primeiro_bip_em IS NOT NULL) AND (primeiro_bip_em < pedido_criado_em)) OR ((picking_conclusao_em IS NOT NULL) AND (primeiro_bip_em IS NOT NULL) AND (picking_conclusao_em < primeiro_bip_em)) OR ((embalagem_conclusao_em IS NOT NULL) AND (picking_conclusao_em IS NOT NULL) AND (embalagem_conclusao_em < picking_conclusao_em)) OR ((ultimo_faturamento_em IS NOT NULL) AND (embalagem_conclusao_em IS NOT NULL) AND (ultimo_faturamento_em < embalagem_conclusao_em)))) AS cronologia_valida
   FROM base b;

create or replace view public.vw_assurant_b2b_operacao_dia as
 WITH dias AS (
         SELECT (b2b_pedidos_indicadores.criado_em)::date AS dia,
            count(*) AS pedidos_recebidos,
            COALESCE(sum(b2b_pedidos_indicadores.total_itens), (0)::bigint) AS itens_recebidos,
            (0)::bigint AS itens_faturados,
            (0)::bigint AS notas_emitidas,
            (0)::bigint AS erros_nf
           FROM b2b_pedidos_indicadores
          WHERE (b2b_pedidos_indicadores.criado_em IS NOT NULL)
          GROUP BY ((b2b_pedidos_indicadores.criado_em)::date)
        UNION ALL
         SELECT (b2b_nfs_indicadores.data_faturamento)::date AS dia,
            (0)::bigint AS int8,
            (0)::bigint AS int8,
            COALESCE(sum(b2b_nfs_indicadores.total_itens), (0)::bigint) AS itens_faturados,
            count(*) AS notas_emitidas,
            count(*) FILTER (WHERE ((COALESCE(TRIM(BOTH FROM b2b_nfs_indicadores.motivo_erro), ''::text) <> ''::text) OR (lower(COALESCE(b2b_nfs_indicadores.status, ''::text)) ~~ '%erro%'::text))) AS erros_nf
           FROM b2b_nfs_indicadores
          WHERE (b2b_nfs_indicadores.data_faturamento IS NOT NULL)
          GROUP BY ((b2b_nfs_indicadores.data_faturamento)::date)
        )
 SELECT dia,
    (sum(pedidos_recebidos))::bigint AS pedidos_recebidos,
    (sum(itens_recebidos))::bigint AS itens_recebidos,
    (sum(itens_faturados))::bigint AS itens_faturados,
    (sum(notas_emitidas))::bigint AS notas_emitidas,
    (sum(erros_nf))::bigint AS erros_nf
   FROM dias
  GROUP BY dia;

create or replace view public.vw_assurant_b2b_item_timeline as
 WITH nf_numero AS (
         SELECT b2b_nfs_indicadores.pedido_id,
            b2b_nfs_indicadores.numero_nf,
            max(b2b_nfs_indicadores.data_faturamento) FILTER (WHERE (COALESCE(b2b_nfs_indicadores.status, ''::text) <> 'erro'::text)) AS faturado_em
           FROM b2b_nfs_indicadores
          GROUP BY b2b_nfs_indicadores.pedido_id, b2b_nfs_indicadores.numero_nf
        ), nf_pedido AS (
         SELECT nf_numero.pedido_id,
            count(*) FILTER (WHERE (nf_numero.faturado_em IS NOT NULL)) AS qtd_nfs_ok,
            max(nf_numero.faturado_em) FILTER (WHERE (nf_numero.faturado_em IS NOT NULL)) AS unica_nf_em
           FROM nf_numero
          GROUP BY nf_numero.pedido_id
        )
 SELECT i.id AS item_id,
    i.pedido_id,
    p.lote,
    p.cliente,
    i.imei,
    i.modelo,
    i.grade,
    i.status,
    i.nf,
    ((upper(COALESCE(p.cliente, ''::text)) ~~ '%REPARO INTERNO%'::text) OR (upper(COALESCE(p.lote, ''::text)) ~~ '%REPARO_INTERNO%'::text)) AS eh_reparo_interno,
    (p.criado_em AT TIME ZONE 'UTC'::text) AS pedido_criado_em,
    (i.bipado_em AT TIME ZONE 'UTC'::text) AS separacao_em,
    (i.embalado_em AT TIME ZONE 'UTC'::text) AS embalado_em,
    COALESCE(nfn.faturado_em,
        CASE
            WHEN (nfp.qtd_nfs_ok = 1) THEN nfp.unica_nf_em
            ELSE NULL::timestamp with time zone
        END) AS faturado_em,
        CASE
            WHEN ((i.bipado_em IS NOT NULL) AND ((i.bipado_em AT TIME ZONE 'UTC'::text) >= (p.criado_em AT TIME ZONE 'UTC'::text))) THEN round((EXTRACT(epoch FROM ((i.bipado_em AT TIME ZONE 'UTC'::text) - (p.criado_em AT TIME ZONE 'UTC'::text))) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_pedido_ate_separacao,
        CASE
            WHEN ((i.embalado_em IS NOT NULL) AND (i.bipado_em IS NOT NULL) AND (i.embalado_em >= i.bipado_em)) THEN round((EXTRACT(epoch FROM (i.embalado_em - i.bipado_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_separacao_ate_embalagem,
        CASE
            WHEN ((COALESCE(nfn.faturado_em,
            CASE
                WHEN (nfp.qtd_nfs_ok = 1) THEN nfp.unica_nf_em
                ELSE NULL::timestamp with time zone
            END) IS NOT NULL) AND (i.embalado_em IS NOT NULL) AND (COALESCE(nfn.faturado_em,
            CASE
                WHEN (nfp.qtd_nfs_ok = 1) THEN nfp.unica_nf_em
                ELSE NULL::timestamp with time zone
            END) >= (i.embalado_em AT TIME ZONE 'UTC'::text))) THEN round((EXTRACT(epoch FROM (COALESCE(nfn.faturado_em,
            CASE
                WHEN (nfp.qtd_nfs_ok = 1) THEN nfp.unica_nf_em
                ELSE NULL::timestamp with time zone
            END) - (i.embalado_em AT TIME ZONE 'UTC'::text))) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_embalagem_ate_faturamento
   FROM (((b2b_itens_indicadores i
     JOIN b2b_pedidos_indicadores p ON ((p.id = i.pedido_id)))
     LEFT JOIN nf_numero nfn ON (((nfn.pedido_id = i.pedido_id) AND (nfn.numero_nf = i.nf))))
     LEFT JOIN nf_pedido nfp ON ((nfp.pedido_id = i.pedido_id)));

create or replace view public.vw_assurant_erros_processo_mes as
 WITH b2c_base AS (
         SELECT (date_trunc('month'::text, t.pago_em))::date AS mes,
            t.status_anymarket,
            t.embalagem_conclusao_em,
            t.faturamento_conclusao_em
           FROM vw_assurant_b2c_timeline t
          WHERE ((t.pago_em IS NOT NULL) AND (((t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text))::date <= assurant_gestao_data_referencia()))
        ), b2c_falhas AS (
         SELECT (date_trunc('month'::text, m_1.pago_em))::date AS mes,
            count(*) FILTER (WHERE (m_1.falha IS NOT NULL)) AS falhas_integracao
           FROM mv_anymarket_ultima_indicadores m_1
          WHERE ((m_1.pago_em IS NOT NULL) AND (((m_1.pago_em AT TIME ZONE 'America/Sao_Paulo'::text))::date <= assurant_gestao_data_referencia()))
          GROUP BY ((date_trunc('month'::text, m_1.pago_em))::date)
        ), retrabalho AS (
         SELECT b2c_base.mes,
            count(*) FILTER (WHERE ((lower(COALESCE(b2c_base.status_anymarket, ''::text)) = 'cancelado'::text) AND (b2c_base.embalagem_conclusao_em IS NULL))) AS cancelados_marketplace,
            count(*) FILTER (WHERE ((lower(COALESCE(b2c_base.status_anymarket, ''::text)) = 'cancelado'::text) AND (b2c_base.embalagem_conclusao_em IS NOT NULL) AND (b2c_base.faturamento_conclusao_em IS NULL))) AS cancelados_pos_embalagem,
            count(*) FILTER (WHERE ((lower(COALESCE(b2c_base.status_anymarket, ''::text)) = 'cancelado'::text) AND (b2c_base.faturamento_conclusao_em IS NOT NULL))) AS cancelados_pos_faturamento
           FROM b2c_base
          GROUP BY b2c_base.mes
        ), b2b AS (
         SELECT (date_trunc('month'::text, n.data_faturamento))::date AS mes,
            count(*) FILTER (WHERE ((COALESCE(btrim(n.motivo_erro), ''::text) <> ''::text) OR (lower(COALESCE(n.status, ''::text)) ~~ '%erro%'::text))) AS erros_nf_b2b
           FROM b2b_nfs_indicadores n
          WHERE ((n.data_faturamento IS NOT NULL) AND ((n.data_faturamento)::date <= assurant_gestao_data_referencia()))
          GROUP BY ((date_trunc('month'::text, n.data_faturamento))::date)
        ), meses AS (
         SELECT b2c_falhas.mes
           FROM b2c_falhas
        UNION
         SELECT retrabalho.mes
           FROM retrabalho
        UNION
         SELECT b2b.mes
           FROM b2b
        )
 SELECT m.mes,
    COALESCE(f.falhas_integracao, (0)::bigint) AS falhas_integracao,
    COALESCE(r.cancelados_marketplace, (0)::bigint) AS cancelados_marketplace,
    COALESCE(r.cancelados_pos_embalagem, (0)::bigint) AS cancelados_pos_embalagem,
    COALESCE(r.cancelados_pos_faturamento, (0)::bigint) AS cancelados_pos_faturamento,
    COALESCE(b.erros_nf_b2b, (0)::bigint) AS erros_nf_b2b
   FROM (((meses m
     LEFT JOIN b2c_falhas f USING (mes))
     LEFT JOIN retrabalho r USING (mes))
     LEFT JOIN b2b b USING (mes));

create or replace view public.vw_assurant_historico_vendas_classificado as
 WITH devol AS (
         SELECT assurant_historico_devolucoes.id_anymarket,
            count(*) AS devolucoes_solicitadas,
            sum(assurant_historico_devolucoes.quantidade) AS unidades_devolucao_solicitadas,
            bool_or((assurant_historico_devolucoes.data_entrega_cd IS NOT NULL)) AS devolucao_recebida_cd,
            max(assurant_historico_devolucoes.data_devolucao) AS ultima_devolucao_em
           FROM assurant_historico_devolucoes
          GROUP BY assurant_historico_devolucoes.id_anymarket
        )
 SELECT v.id,
    v.chave_importacao,
    v.id_anymarket,
    v.codigo_pedido,
    v.data_pedido,
    v.marketplace,
    v.status_final,
    v.data_pagamento,
    v.titulo_produto,
    v.quantidade,
    v.valor_unitario,
    v.sku_produto,
    v.sku_base,
    v.grade_normalizada,
    v.numero_nf,
    v.chave_nf,
    v.data_emissao_nf,
    v.data_entrega,
    v.data_handover,
    v.motivo_cancelamento,
    v.data_cancelamento,
    v.sku_marketplace,
    v.condicao_produto,
    v.data_importacao,
    v.falha,
    v.local_estoque,
    v.origem_arquivo,
    v.origem_linha,
    v.criado_em,
    (COALESCE(NULLIF(TRIM(BOTH FROM v.numero_nf), ''::text), NULLIF(TRIM(BOTH FROM v.chave_nf), ''::text)) IS NOT NULL) AS tem_nf,
    ((COALESCE(NULLIF(TRIM(BOTH FROM v.numero_nf), ''::text), NULLIF(TRIM(BOTH FROM v.chave_nf), ''::text)) IS NOT NULL) OR (v.data_handover IS NOT NULL) OR (lower(COALESCE(v.status_final, ''::text)) = ANY (ARRAY['entregue'::text, 'enviado'::text, 'faturado'::text]))) AS teve_saida_bruta,
    COALESCE(d.devolucoes_solicitadas, (0)::bigint) AS devolucoes_solicitadas,
    COALESCE(d.unidades_devolucao_solicitadas, (0)::bigint) AS unidades_devolucao_solicitadas,
    COALESCE(d.devolucao_recebida_cd, false) AS devolucao_recebida_cd,
    d.ultima_devolucao_em,
    (((COALESCE(NULLIF(TRIM(BOTH FROM v.numero_nf), ''::text), NULLIF(TRIM(BOTH FROM v.chave_nf), ''::text)) IS NOT NULL) OR (v.data_handover IS NOT NULL) OR (lower(COALESCE(v.status_final, ''::text)) = ANY (ARRAY['entregue'::text, 'enviado'::text, 'faturado'::text]))) AND (NOT COALESCE(d.devolucao_recebida_cd, false))) AS saida_liquida_estimada,
    (((v.quantidade)::numeric * v.valor_unitario))::numeric(16,2) AS valor_produtos
   FROM (assurant_historico_vendas_indicadores v
     LEFT JOIN devol d USING (id_anymarket));

create or replace view public.vw_assurant_vendas_precificacao as
 SELECT COALESCE(h.data_emissao_nf, h.data_handover, h.data_pagamento, h.data_pedido) AS data_venda,
    h.id_anymarket,
    h.marketplace,
    h.sku_produto,
    h.sku_base,
    h.grade_normalizada AS grade,
    h.titulo_produto,
    h.quantidade,
    h.valor_unitario,
    h.valor_produtos,
    h.teve_saida_bruta,
    h.saida_liquida_estimada,
    h.devolucoes_solicitadas,
    h.devolucao_recebida_cd,
    'historico_anymarket'::text AS origem
   FROM vw_assurant_historico_vendas_classificado h
  WHERE (h.teve_saida_bruta AND (h.data_pedido < '2026-08-01 19:00:00+00'::timestamp with time zone))
UNION ALL
 SELECT COALESCE(p.faturado_em, p.embalado_em, p.bipado_em, p.alocado_em, p.criado_em) AS data_venda,
    p.id_anymarket,
    p.marketplace,
    COALESCE(NULLIF(TRIM(BOTH FROM p.sku_alocado), ''::text), NULLIF(TRIM(BOTH FROM p.sku_produto), ''::text)) AS sku_produto,
    regexp_replace(COALESCE(NULLIF(TRIM(BOTH FROM p.sku_alocado), ''::text), NULLIF(TRIM(BOTH FROM p.sku_produto), ''::text)), '-CC[0-9]+$'::text, ''::text, 'i'::text) AS sku_base,
    COALESCE(NULLIF(TRIM(BOTH FROM p.grade_alocada), ''::text), NULLIF(TRIM(BOTH FROM p.grade_produto), ''::text)) AS grade,
    p.titulo_produto,
    1 AS quantidade,
    (COALESCE(p.valor_unitario, (0)::numeric))::numeric(14,2) AS valor_unitario,
    (COALESCE(p.valor_unitario, (0)::numeric))::numeric(16,2) AS valor_produtos,
    true AS teve_saida_bruta,
    true AS saida_liquida_estimada,
    (0)::bigint AS devolucoes_solicitadas,
    false AS devolucao_recebida_cd,
    'sistema_b2c'::text AS origem
   FROM pedidos_b2c_indicadores p
  WHERE ((p.faturado_em IS NOT NULL) AND (p.faturado_em >= '2026-08-01 19:00:00+00'::timestamp with time zone) AND (COALESCE(NULLIF(TRIM(BOTH FROM p.sku_alocado), ''::text), NULLIF(TRIM(BOTH FROM p.sku_produto), ''::text)) IS NOT NULL));

create or replace view public.vw_fifo_auditoria_cobertura_mes as
 WITH params AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS inicio_mes
        ), base AS (
         SELECT d.id,
            d.pedido_id,
            d.id_anymarket,
            d.item_seq,
            d.sku_buscado,
            d.grade_alvo,
            d.imei_escolhido,
            d.imei_anterior,
            d.data_subinv_escolhido,
            d.local_subinv_escolhido,
            d.posicao_escolhida,
            d.total_candidatos,
            d.candidatos,
            d.auditavel,
            d.motivo_nao_auditavel,
            d.origem,
            d.status_pedido,
            d.alocado_em,
            d.criado_por,
            d.criado_em
           FROM (fifo_auditoria_db_indicadores d
             CROSS JOIN params p)
          WHERE (((d.alocado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio_mes)
        )
 SELECT count(*) AS total_registros,
    count(*) FILTER (WHERE auditavel) AS auditaveis,
    count(*) FILTER (WHERE (NOT auditavel)) AS nao_auditaveis_historicos_ou_excecao,
    count(*) FILTER (WHERE (auditavel AND (posicao_escolhida = 1))) AS posicao_1,
    count(*) FILTER (WHERE (auditavel AND (posicao_escolhida = 2))) AS posicao_2,
    count(*) FILTER (WHERE (auditavel AND (posicao_escolhida >= 3))) AS posicao_3_mais,
    round(((100.0 * (count(*) FILTER (WHERE auditavel))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS cobertura_auditavel_pct,
    round(((100.0 * (count(*) FILTER (WHERE (auditavel AND (posicao_escolhida = 1))))::numeric) / (NULLIF(count(*) FILTER (WHERE auditavel), 0))::numeric), 2) AS acuracidade_estrita_pct
   FROM base;

create or replace view public.vw_assurant_fifo_acuracidade_periodo_atual as
 WITH params AS (
         SELECT date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)) AS inicio_atual,
            (now() AT TIME ZONE 'America/Sao_Paulo'::text) AS fim_atual,
            date_trunc('month'::text, ((now() AT TIME ZONE 'America/Sao_Paulo'::text) - '1 mon'::interval)) AS inicio_anterior
        ), limites AS (
         SELECT params.inicio_atual,
            params.fim_atual,
            params.inicio_anterior,
            (params.inicio_anterior + (params.fim_atual - params.inicio_atual)) AS fim_anterior
           FROM params
        ), base AS (
         SELECT (fa.criado_em AT TIME ZONE 'America/Sao_Paulo'::text) AS criado_local,
            fa.id_anymarket,
            fa.sku_buscado,
            fa.grade_alvo,
            fa.posicao_escolhida,
            fa.total_candidatos,
            fa.data_subinv_escolhido,
            fa.candidatos,
                CASE
                    WHEN (fa.posicao_escolhida = 1) THEN true
                    WHEN ((fa.posicao_escolhida > 1) AND ((NULLIF(((fa.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date = fa.data_subinv_escolhido)) THEN true
                    ELSE false
                END AS fifo_aderente_tecnico,
                CASE
                    WHEN (fa.posicao_escolhida = 1) THEN true
                    ELSE false
                END AS fifo_aderente_estrito,
                CASE
                    WHEN ((fa.posicao_escolhida > 1) AND ((NULLIF(((fa.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date = fa.data_subinv_escolhido)) THEN true
                    ELSE false
                END AS empate_data_mais_antiga
           FROM fifo_auditoria_indicadores fa
          WHERE (fa.criado_em IS NOT NULL)
        ), atual AS (
         SELECT b.criado_local,
            b.id_anymarket,
            b.sku_buscado,
            b.grade_alvo,
            b.posicao_escolhida,
            b.total_candidatos,
            b.data_subinv_escolhido,
            b.candidatos,
            b.fifo_aderente_tecnico,
            b.fifo_aderente_estrito,
            b.empate_data_mais_antiga
           FROM (base b
             CROSS JOIN limites l)
          WHERE ((b.criado_local >= l.inicio_atual) AND (b.criado_local <= l.fim_atual))
        ), anterior AS (
         SELECT b.criado_local,
            b.id_anymarket,
            b.sku_buscado,
            b.grade_alvo,
            b.posicao_escolhida,
            b.total_candidatos,
            b.data_subinv_escolhido,
            b.candidatos,
            b.fifo_aderente_tecnico,
            b.fifo_aderente_estrito,
            b.empate_data_mais_antiga
           FROM (base b
             CROSS JOIN limites l)
          WHERE ((b.criado_local >= l.inicio_anterior) AND (b.criado_local <= l.fim_anterior))
        ), agg_atual AS (
         SELECT count(*) AS total_auditorias_atual,
            count(*) FILTER (WHERE atual.fifo_aderente_estrito) AS aderentes_estritos_atual,
            count(*) FILTER (WHERE atual.fifo_aderente_tecnico) AS aderentes_tecnicos_atual,
            count(*) FILTER (WHERE atual.empate_data_mais_antiga) AS empates_atual,
            count(*) FILTER (WHERE (NOT atual.fifo_aderente_tecnico)) AS desvios_reais_atual,
            count(*) FILTER (WHERE (atual.posicao_escolhida = 2)) AS posicao_2_atual,
            count(*) FILTER (WHERE (atual.posicao_escolhida >= 3)) AS posicao_3_mais_atual
           FROM atual
        ), agg_anterior AS (
         SELECT count(*) AS total_auditorias_anterior,
            count(*) FILTER (WHERE anterior.fifo_aderente_estrito) AS aderentes_estritos_anterior,
            count(*) FILTER (WHERE anterior.fifo_aderente_tecnico) AS aderentes_tecnicos_anterior,
            count(*) FILTER (WHERE anterior.empate_data_mais_antiga) AS empates_anterior,
            count(*) FILTER (WHERE (NOT anterior.fifo_aderente_tecnico)) AS desvios_reais_anterior,
            count(*) FILTER (WHERE (anterior.posicao_escolhida = 2)) AS posicao_2_anterior,
            count(*) FILTER (WHERE (anterior.posicao_escolhida >= 3)) AS posicao_3_mais_anterior
           FROM anterior
        )
 SELECT a.total_auditorias_atual,
    a.aderentes_estritos_atual,
    a.aderentes_tecnicos_atual,
    a.empates_atual,
    a.desvios_reais_atual,
    a.posicao_2_atual,
    a.posicao_3_mais_atual,
    p.total_auditorias_anterior,
    p.aderentes_estritos_anterior,
    p.aderentes_tecnicos_anterior,
    p.empates_anterior,
    p.desvios_reais_anterior,
    p.posicao_2_anterior,
    p.posicao_3_mais_anterior,
    round(((100.0 * (a.aderentes_estritos_atual)::numeric) / (NULLIF(a.total_auditorias_atual, 0))::numeric), 2) AS acuracidade_estrita_atual_pct,
    round(((100.0 * (p.aderentes_estritos_anterior)::numeric) / (NULLIF(p.total_auditorias_anterior, 0))::numeric), 2) AS acuracidade_estrita_anterior_pct,
    round(((100.0 * (a.aderentes_tecnicos_atual)::numeric) / (NULLIF(a.total_auditorias_atual, 0))::numeric), 2) AS acuracidade_tecnica_atual_pct,
    round(((100.0 * (p.aderentes_tecnicos_anterior)::numeric) / (NULLIF(p.total_auditorias_anterior, 0))::numeric), 2) AS acuracidade_tecnica_anterior_pct,
    round((((100.0 * (a.aderentes_tecnicos_atual)::numeric) / (NULLIF(a.total_auditorias_atual, 0))::numeric) - ((100.0 * (p.aderentes_tecnicos_anterior)::numeric) / (NULLIF(p.total_auditorias_anterior, 0))::numeric)), 2) AS variacao_acuracidade_tecnica_pp
   FROM (agg_atual a
     CROSS JOIN agg_anterior p);

create or replace view public.vw_assurant_fifo_acuracidade_sku_periodo_atual as
 WITH params AS (
         SELECT date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)) AS inicio_atual,
            (now() AT TIME ZONE 'America/Sao_Paulo'::text) AS fim_atual,
            date_trunc('month'::text, ((now() AT TIME ZONE 'America/Sao_Paulo'::text) - '1 mon'::interval)) AS inicio_anterior
        ), limites AS (
         SELECT params.inicio_atual,
            params.fim_atual,
            params.inicio_anterior,
            (params.inicio_anterior + (params.fim_atual - params.inicio_atual)) AS fim_anterior
           FROM params
        ), base AS (
         SELECT (fa.criado_em AT TIME ZONE 'America/Sao_Paulo'::text) AS criado_local,
            fa.sku_buscado,
            fa.posicao_escolhida,
            fa.data_subinv_escolhido,
            fa.candidatos,
                CASE
                    WHEN (fa.posicao_escolhida = 1) THEN true
                    WHEN ((fa.posicao_escolhida > 1) AND ((NULLIF(((fa.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date = fa.data_subinv_escolhido)) THEN true
                    ELSE false
                END AS fifo_aderente_tecnico,
                CASE
                    WHEN (fa.posicao_escolhida = 1) THEN true
                    ELSE false
                END AS fifo_aderente_estrito,
                CASE
                    WHEN ((fa.posicao_escolhida > 1) AND ((NULLIF(((fa.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date = fa.data_subinv_escolhido)) THEN true
                    ELSE false
                END AS empate_data_mais_antiga
           FROM fifo_auditoria_indicadores fa
          WHERE ((fa.criado_em IS NOT NULL) AND (fa.sku_buscado IS NOT NULL))
        ), atual AS (
         SELECT b.criado_local,
            b.sku_buscado,
            b.posicao_escolhida,
            b.data_subinv_escolhido,
            b.candidatos,
            b.fifo_aderente_tecnico,
            b.fifo_aderente_estrito,
            b.empate_data_mais_antiga
           FROM (base b
             CROSS JOIN limites l)
          WHERE ((b.criado_local >= l.inicio_atual) AND (b.criado_local <= l.fim_atual))
        ), anterior AS (
         SELECT b.criado_local,
            b.sku_buscado,
            b.posicao_escolhida,
            b.data_subinv_escolhido,
            b.candidatos,
            b.fifo_aderente_tecnico,
            b.fifo_aderente_estrito,
            b.empate_data_mais_antiga
           FROM (base b
             CROSS JOIN limites l)
          WHERE ((b.criado_local >= l.inicio_anterior) AND (b.criado_local <= l.fim_anterior))
        ), skus AS (
         SELECT atual.sku_buscado
           FROM atual
        UNION
         SELECT anterior.sku_buscado
           FROM anterior
        ), aa AS (
         SELECT atual.sku_buscado,
            count(*) AS total_auditorias_atual,
            count(*) FILTER (WHERE atual.fifo_aderente_estrito) AS aderentes_estritos_atual,
            count(*) FILTER (WHERE atual.fifo_aderente_tecnico) AS aderentes_tecnicos_atual,
            count(*) FILTER (WHERE atual.empate_data_mais_antiga) AS empates_atual,
            count(*) FILTER (WHERE (NOT atual.fifo_aderente_tecnico)) AS desvios_reais_atual,
            count(*) FILTER (WHERE (atual.posicao_escolhida = 2)) AS posicao_2_atual,
            count(*) FILTER (WHERE (atual.posicao_escolhida >= 3)) AS posicao_3_mais_atual
           FROM atual
          GROUP BY atual.sku_buscado
        ), ap AS (
         SELECT anterior.sku_buscado,
            count(*) AS total_auditorias_anterior,
            count(*) FILTER (WHERE anterior.fifo_aderente_estrito) AS aderentes_estritos_anterior,
            count(*) FILTER (WHERE anterior.fifo_aderente_tecnico) AS aderentes_tecnicos_anterior,
            count(*) FILTER (WHERE anterior.empate_data_mais_antiga) AS empates_anterior,
            count(*) FILTER (WHERE (NOT anterior.fifo_aderente_tecnico)) AS desvios_reais_anterior,
            count(*) FILTER (WHERE (anterior.posicao_escolhida = 2)) AS posicao_2_anterior,
            count(*) FILTER (WHERE (anterior.posicao_escolhida >= 3)) AS posicao_3_mais_anterior
           FROM anterior
          GROUP BY anterior.sku_buscado
        )
 SELECT s.sku_buscado,
    COALESCE(aa.total_auditorias_atual, (0)::bigint) AS total_auditorias_atual,
    COALESCE(aa.aderentes_estritos_atual, (0)::bigint) AS aderentes_estritos_atual,
    COALESCE(aa.aderentes_tecnicos_atual, (0)::bigint) AS aderentes_tecnicos_atual,
    COALESCE(aa.empates_atual, (0)::bigint) AS empates_atual,
    COALESCE(aa.desvios_reais_atual, (0)::bigint) AS desvios_reais_atual,
    COALESCE(aa.posicao_2_atual, (0)::bigint) AS posicao_2_atual,
    COALESCE(aa.posicao_3_mais_atual, (0)::bigint) AS posicao_3_mais_atual,
    COALESCE(ap.total_auditorias_anterior, (0)::bigint) AS total_auditorias_anterior,
    COALESCE(ap.aderentes_estritos_anterior, (0)::bigint) AS aderentes_estritos_anterior,
    COALESCE(ap.aderentes_tecnicos_anterior, (0)::bigint) AS aderentes_tecnicos_anterior,
    COALESCE(ap.empates_anterior, (0)::bigint) AS empates_anterior,
    COALESCE(ap.desvios_reais_anterior, (0)::bigint) AS desvios_reais_anterior,
    COALESCE(ap.posicao_2_anterior, (0)::bigint) AS posicao_2_anterior,
    COALESCE(ap.posicao_3_mais_anterior, (0)::bigint) AS posicao_3_mais_anterior,
    round(((100.0 * (COALESCE(aa.aderentes_tecnicos_atual, (0)::bigint))::numeric) / (NULLIF(COALESCE(aa.total_auditorias_atual, (0)::bigint), 0))::numeric), 2) AS acuracidade_tecnica_atual_pct,
    round(((100.0 * (COALESCE(ap.aderentes_tecnicos_anterior, (0)::bigint))::numeric) / (NULLIF(COALESCE(ap.total_auditorias_anterior, (0)::bigint), 0))::numeric), 2) AS acuracidade_tecnica_anterior_pct,
    round((((100.0 * (COALESCE(aa.aderentes_tecnicos_atual, (0)::bigint))::numeric) / (NULLIF(COALESCE(aa.total_auditorias_atual, (0)::bigint), 0))::numeric) - ((100.0 * (COALESCE(ap.aderentes_tecnicos_anterior, (0)::bigint))::numeric) / (NULLIF(COALESCE(ap.total_auditorias_anterior, (0)::bigint), 0))::numeric)), 2) AS variacao_acuracidade_tecnica_pp
   FROM ((skus s
     LEFT JOIN aa ON ((aa.sku_buscado = s.sku_buscado)))
     LEFT JOIN ap ON ((ap.sku_buscado = s.sku_buscado)));

create or replace view public.vw_assurant_fifo_comparativo_periodo_atual as
 WITH params AS (
         SELECT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date AS hoje
        ), periodos AS (
         SELECT 'ATUAL'::text AS periodo,
            (date_trunc('month'::text, (params.hoje)::timestamp without time zone))::date AS inicio,
            (params.hoje + 1) AS fim_exclusivo
           FROM params
        UNION ALL
         SELECT 'ANTERIOR'::text AS text,
            ((date_trunc('month'::text, (params.hoje)::timestamp without time zone) - '1 mon'::interval))::date AS date,
            (((date_trunc('month'::text, (params.hoje)::timestamp without time zone) - '1 mon'::interval))::date + (EXTRACT(day FROM params.hoje))::integer)
           FROM params
        ), base AS (
         SELECT p.periodo,
            d.id,
            d.pedido_id,
            d.id_anymarket,
            d.item_seq,
            d.sku_buscado,
            d.grade_alvo,
            d.imei_escolhido,
            d.imei_anterior,
            d.data_subinv_escolhido,
            d.local_subinv_escolhido,
            d.posicao_escolhida,
            d.total_candidatos,
            d.candidatos,
            d.auditavel,
            d.motivo_nao_auditavel,
            d.origem,
            d.status_pedido,
            d.alocado_em,
            d.criado_por,
            d.criado_em,
            (NULLIF(((d.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date AS primeira_data_subinv,
                CASE
                    WHEN ((d.auditavel = true) AND (d.posicao_escolhida IS NOT NULL) AND (d.posicao_escolhida > 1) AND (d.data_subinv_escolhido IS NOT NULL) AND (NULLIF(((d.candidatos -> 0) ->> 'data_subinv'::text), ''::text) IS NOT NULL) AND (d.data_subinv_escolhido = (NULLIF(((d.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date)) THEN true
                    ELSE false
                END AS empate_fifo,
                CASE
                    WHEN ((d.auditavel = true) AND ((d.posicao_escolhida = 1) OR ((d.posicao_escolhida > 1) AND (d.data_subinv_escolhido IS NOT NULL) AND (NULLIF(((d.candidatos -> 0) ->> 'data_subinv'::text), ''::text) IS NOT NULL) AND (d.data_subinv_escolhido = (NULLIF(((d.candidatos -> 0) ->> 'data_subinv'::text), ''::text))::date)))) THEN true
                    ELSE false
                END AS aderente_tecnico
           FROM (periodos p
             JOIN fifo_auditoria_db_indicadores d ON (((((d.alocado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio) AND (((d.alocado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date < p.fim_exclusivo))))
        ), stats AS (
         SELECT base.periodo,
            count(*) AS alocacoes,
            count(*) FILTER (WHERE (base.auditavel = true)) AS auditaveis,
            count(*) FILTER (WHERE (base.auditavel IS DISTINCT FROM true)) AS nao_auditaveis,
            count(*) FILTER (WHERE ((base.auditavel = true) AND base.aderente_tecnico)) AS aderentes_tecnicos,
            count(*) FILTER (WHERE ((base.auditavel = true) AND (NOT base.aderente_tecnico))) AS desvios_reais,
            count(*) FILTER (WHERE ((base.auditavel = true) AND (base.posicao_escolhida = 1))) AS posicao_1,
            count(*) FILTER (WHERE ((base.auditavel = true) AND (base.posicao_escolhida = 2))) AS posicao_2,
            count(*) FILTER (WHERE ((base.auditavel = true) AND (base.posicao_escolhida >= 3))) AS posicao_3_mais,
            count(*) FILTER (WHERE ((base.auditavel = true) AND base.empate_fifo)) AS empates,
            round(((100.0 * (count(*) FILTER (WHERE (base.auditavel = true)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS cobertura_auditoria_pct,
            round(((100.0 * (count(*) FILTER (WHERE ((base.auditavel = true) AND base.aderente_tecnico)))::numeric) / (NULLIF(count(*) FILTER (WHERE (base.auditavel = true)), 0))::numeric), 2) AS acuracidade_fifo_pct
           FROM base
          GROUP BY base.periodo
        ), a AS (
         SELECT stats.periodo,
            stats.alocacoes,
            stats.auditaveis,
            stats.nao_auditaveis,
            stats.aderentes_tecnicos,
            stats.desvios_reais,
            stats.posicao_1,
            stats.posicao_2,
            stats.posicao_3_mais,
            stats.empates,
            stats.cobertura_auditoria_pct,
            stats.acuracidade_fifo_pct
           FROM stats
          WHERE (stats.periodo = 'ATUAL'::text)
        ), b AS (
         SELECT stats.periodo,
            stats.alocacoes,
            stats.auditaveis,
            stats.nao_auditaveis,
            stats.aderentes_tecnicos,
            stats.desvios_reais,
            stats.posicao_1,
            stats.posicao_2,
            stats.posicao_3_mais,
            stats.empates,
            stats.cobertura_auditoria_pct,
            stats.acuracidade_fifo_pct
           FROM stats
          WHERE (stats.periodo = 'ANTERIOR'::text)
        )
 SELECT COALESCE(a.alocacoes, (0)::bigint) AS alocacoes_atual,
    COALESCE(b.alocacoes, (0)::bigint) AS alocacoes_anterior,
    COALESCE(a.auditaveis, (0)::bigint) AS auditaveis_atual,
    COALESCE(b.auditaveis, (0)::bigint) AS auditaveis_anterior,
    COALESCE(a.nao_auditaveis, (0)::bigint) AS nao_auditaveis_atual,
    COALESCE(b.nao_auditaveis, (0)::bigint) AS nao_auditaveis_anterior,
    COALESCE(a.aderentes_tecnicos, (0)::bigint) AS aderentes_tecnicos_atual,
    COALESCE(b.aderentes_tecnicos, (0)::bigint) AS aderentes_tecnicos_anterior,
    COALESCE(a.desvios_reais, (0)::bigint) AS desvios_reais_atual,
    COALESCE(b.desvios_reais, (0)::bigint) AS desvios_reais_anterior,
    COALESCE(a.posicao_1, (0)::bigint) AS posicao_1_atual,
    COALESCE(b.posicao_1, (0)::bigint) AS posicao_1_anterior,
    COALESCE(a.posicao_2, (0)::bigint) AS posicao_2_atual,
    COALESCE(b.posicao_2, (0)::bigint) AS posicao_2_anterior,
    COALESCE(a.posicao_3_mais, (0)::bigint) AS posicao_3_mais_atual,
    COALESCE(b.posicao_3_mais, (0)::bigint) AS posicao_3_mais_anterior,
    COALESCE(a.empates, (0)::bigint) AS empates_atual,
    COALESCE(b.empates, (0)::bigint) AS empates_anterior,
    a.cobertura_auditoria_pct AS cobertura_auditoria_atual_pct,
    b.cobertura_auditoria_pct AS cobertura_auditoria_anterior_pct,
        CASE
            WHEN ((a.cobertura_auditoria_pct IS NOT NULL) AND (b.cobertura_auditoria_pct IS NOT NULL)) THEN round((a.cobertura_auditoria_pct - b.cobertura_auditoria_pct), 2)
            ELSE NULL::numeric
        END AS variacao_cobertura_pp,
    a.acuracidade_fifo_pct AS acuracidade_fifo_atual_pct,
    b.acuracidade_fifo_pct AS acuracidade_fifo_anterior_pct,
        CASE
            WHEN ((a.acuracidade_fifo_pct IS NOT NULL) AND (b.acuracidade_fifo_pct IS NOT NULL)) THEN round((a.acuracidade_fifo_pct - b.acuracidade_fifo_pct), 2)
            ELSE NULL::numeric
        END AS variacao_acuracidade_pp
   FROM ((( SELECT 1 AS "?column?") x
     LEFT JOIN a ON (true))
     LEFT JOIN b ON (true));

CREATE OR REPLACE FUNCTION public.assurant_dash_estetica(meses text[])
 RETURNS TABLE(tela text, laterais text, traseira text, defeitos_adicionais text, grade text, com_estetica boolean, total bigint)
 LANGUAGE sql
AS $function$
  select
    coalesce(tela,                'Não informado') as tela,
    coalesce(laterais,            'Não informado') as laterais,
    coalesce(traseira,            'Não informado') as traseira,
    coalesce(defeitos_adicionais, '')              as defeitos_adicionais,
    coalesce(grade,               'Não informado') as grade,
    data_cosmetico is not null                     as com_estetica,
    count(*) as total
  from assurant_triagem_indicadores
  where to_char(data_recebimento, 'YYYY-MM') = any(meses)
  group by 1,2,3,4,5,6;
$function$;

alter function public.assurant_dash_estetica(meses text[]) set search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.assurant_dash_funcional(meses text[])
 RETURNS TABLE(triagem_funcional text, grade text, resultado_triagem_funcional text, status_bateria text, total bigint)
 LANGUAGE sql
AS $function$
  select
    coalesce(triagem_funcional,           'Sem triagem')   as triagem_funcional,
    coalesce(grade,                        'Não informado') as grade,
    coalesce(resultado_triagem_funcional,  'Não informado') as resultado_triagem_funcional,
    coalesce(status_bateria,               'Sem info')      as status_bateria,
    count(*) as total
  from assurant_triagem_indicadores
  where to_char(data_recebimento, 'YYYY-MM') = any(meses)
  group by 1,2,3,4;
$function$;

alter function public.assurant_dash_funcional(meses text[]) set search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.assurant_dash_laudos(meses text[])
 RETURNS TABLE(grade text, modelo text, status_atual text, com_laudo boolean, com_alocacao boolean, com_oracle boolean, com_reanalise boolean, aguardando_laudo boolean, total bigint)
 LANGUAGE sql
AS $function$
  select
    coalesce(grade,        'Não informado') as grade,
    coalesce(modelo,       'Não informado') as modelo,
    coalesce(status_atual, 'Não informado') as status_atual,
    data_laudo    is not null               as com_laudo,
    data_alocacao is not null               as com_alocacao,
    data_oracle   is not null               as com_oracle,
    reanalise = 'Sim'                       as com_reanalise,
    status_atual ilike '%laudo%'            as aguardando_laudo,
    count(*) as total
  from assurant_triagem_indicadores
  where to_char(data_recebimento, 'YYYY-MM') = any(meses)
  group by 1,2,3,4,5,6,7,8;
$function$;

alter function public.assurant_dash_laudos(meses text[]) set search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.assurant_dash_recebimento(meses text[])
 RETURNS TABLE(canal text, condicao text, status_atual text, modelo text, com_data boolean, total bigint)
 LANGUAGE sql
AS $function$
  select
    coalesce(
      case
        when tipo_de_rede in ('Loja Vivo','Loja Samsung') then 'YBV (Lojas)'
        when tipo_de_rede = 'DEV' then 'Devolução'
        else tipo_de_rede
      end, 'N/A'
    ) as canal,
    coalesce(condicao,    'Não informado') as condicao,
    coalesce(status_atual,'Não informado') as status_atual,
    coalesce(modelo,      'Não informado') as modelo,
    data_recebimento is not null           as com_data,
    count(*) as total
  from assurant_triagem_indicadores
  where to_char(data_recebimento, 'YYYY-MM') = any(meses)
  group by 1,2,3,4,5;
$function$;

alter function public.assurant_dash_recebimento(meses text[]) set search_path=pg_catalog,public;

CREATE OR REPLACE FUNCTION public.assurant_dash_totais(meses text[])
 RETURNS TABLE(total bigint, finalizados bigint, com_laudo bigint)
 LANGUAGE sql
AS $function$
  select
    count(*)                                          as total,
    count(*) filter (where status_atual = 'Finalizado') as finalizados,
    count(*) filter (where data_laudo is not null)      as com_laudo
  from assurant_triagem_indicadores
  where to_char(data_recebimento, 'YYYY-MM') = any(meses);
$function$;

alter function public.assurant_dash_totais(meses text[]) set search_path=pg_catalog,public;
