-- Lote legado liberado por solicitação operacional; exclusão persistente dos indicadores.
create table public.assurant_caixas_liberadas (
 imei text primary key, imei_identificado text, evento_id uuid not null unique references public.wms_carga_inicial_eventos(id),
 caixa_codigo text not null references public.wms_caixas_analise(codigo), triagem_id uuid references public.assurant_triagem(id),
 voucher text, liberado_em timestamptz not null default now(), liberado_por uuid not null,
 cadastro_completado_em timestamptz, cadastro_completado_por uuid
);
alter table public.assurant_caixas_liberadas enable row level security;
revoke all on public.assurant_caixas_liberadas from public,anon,authenticated;
grant select on public.assurant_caixas_liberadas to authenticated;
create policy caixas_liberadas_leitura on public.assurant_caixas_liberadas for select to authenticated using ((select auth.uid()) is not null);
create index caixas_liberadas_voucher on public.assurant_caixas_liberadas(voucher);
create index caixas_liberadas_identificado on public.assurant_caixas_liberadas(imei_identificado);
comment on table public.assurant_caixas_liberadas is 'Exceção da carga inicial. Nunca excluir ao alocar: todos os indicadores devem continuar ignorando o lote.';

create view public.assurant_triagem_indicadores with (security_invoker=true) as
 select t.* from public.assurant_triagem t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.imei or x.imei_identificado=t.imei or x.voucher=t.voucher);
 revoke all on public.assurant_triagem_indicadores from public,anon;
 grant select on public.assurant_triagem_indicadores to authenticated;

create view public.estoque_subinv_indicadores with (security_invoker=true) as
 select t.* from public.estoque_subinv t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.imei or x.imei_identificado=t.imei);
 revoke all on public.estoque_subinv_indicadores from public,anon;
 grant select on public.estoque_subinv_indicadores to authenticated;

create view public.assurant_movimentacao_indicadores with (security_invoker=true) as
 select t.* from public.assurant_movimentacao t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.serial_imei or x.imei_identificado=t.serial_imei or x.voucher=t.voucher);
 revoke all on public.assurant_movimentacao_indicadores from public,anon;
 grant select on public.assurant_movimentacao_indicadores to authenticated;

create view public.wms_alocacoes_indicadores with (security_invoker=true) as
 select t.* from public.wms_alocacoes t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.imei or x.imei_identificado=t.imei or x.voucher=t.voucher);
 revoke all on public.wms_alocacoes_indicadores from public,anon;
 grant select on public.wms_alocacoes_indicadores to authenticated;

create view public.recebimento_vouchers_indicadores with (security_invoker=true) as
 select t.* from public.recebimento_vouchers t where not exists(select 1 from public.assurant_caixas_liberadas x where x.voucher=t.voucher);
 revoke all on public.recebimento_vouchers_indicadores from public,anon;
 grant select on public.recebimento_vouchers_indicadores to authenticated;

create view public.pedidos_b2c_indicadores with (security_invoker=true) as
 select t.* from public.pedidos_b2c t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=coalesce(nullif(t.imei_bipado,''),t.imei_alocado) or x.imei_identificado=coalesce(nullif(t.imei_bipado,''),t.imei_alocado));
 revoke all on public.pedidos_b2c_indicadores from public,anon;
 grant select on public.pedidos_b2c_indicadores to authenticated;

create view public.b2b_itens_indicadores with (security_invoker=true) as
 select t.* from public.b2b_itens t where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=coalesce(nullif(t.imei_bipado,''),t.imei) or x.imei_identificado=coalesce(nullif(t.imei_bipado,''),t.imei) or x.voucher=t.voucher);
 revoke all on public.b2b_itens_indicadores from public,anon;
 grant select on public.b2b_itens_indicadores to authenticated;

create or replace view public.vw_ind_estoque_aging as
 SELECT
        CASE
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 30) THEN '0. Até 30 dias'::text
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 60) THEN '1. 31 a 60'::text
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 90) THEN '2. 61 a 90'::text
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 180) THEN '3. 91 a 180'::text
            ELSE '4. Mais de 180'::text
        END AS faixa,
    count(*) AS aparelhos
   FROM estoque_subinv_indicadores
  WHERE (data_subinv IS NOT NULL)
  GROUP BY
        CASE
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 30) THEN '0. Até 30 dias'::text
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 60) THEN '1. 31 a 60'::text
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 90) THEN '2. 61 a 90'::text
            WHEN ((assurant_gestao_data_referencia() - data_subinv) <= 180) THEN '3. 91 a 180'::text
            ELSE '4. Mais de 180'::text
        END;

create or replace view public.vw_assurant_estoque_qualidade_atual as
 WITH base AS (
         SELECT e.imei,
            e.data_subinv,
            e.local_subinv,
            (e.imei ~ '^[0-9]{15}$'::text) AS imei_valido,
            (EXISTS ( SELECT 1
                   FROM assurant_triagem_indicadores t
                  WHERE (t.imei = e.imei))) AS tem_triagem
           FROM estoque_subinv_indicadores e
        )
 SELECT count(*) AS total_estoque,
    count(*) FILTER (WHERE ((data_subinv IS NOT NULL) AND ((assurant_gestao_data_referencia() - data_subinv) > 90))) AS mais_90_dias,
    count(*) FILTER (WHERE (NOT imei_valido)) AS imei_invalido,
    count(*) FILTER (WHERE (imei_valido AND (NOT tem_triagem))) AS sem_triagem,
    count(*) FILTER (WHERE (imei_valido AND tem_triagem)) AS integros
   FROM base;

create or replace view public.vw_ind_grades_mes as
 SELECT (date_trunc('month'::text, data_cosmetico))::date AS mes,
    COALESCE(NULLIF(btrim(grade_cosmetica), ''::text), NULLIF(btrim(grade), ''::text), '(sem grade)'::text) AS grade,
    count(*) AS aparelhos
   FROM assurant_triagem_indicadores
  WHERE ((data_cosmetico IS NOT NULL) AND ((data_cosmetico)::date <= assurant_gestao_data_referencia()))
  GROUP BY ((date_trunc('month'::text, data_cosmetico))::date), COALESCE(NULLIF(btrim(grade_cosmetica), ''::text), NULLIF(btrim(grade), ''::text), '(sem grade)'::text);

create or replace view public.vw_ind_estoque_posicao as
 SELECT COALESCE(NULLIF(TRIM(BOTH FROM local_subinv), ''::text), '(sem local)'::text) AS subinventario,
    count(*) AS aparelhos
   FROM estoque_subinv_indicadores
  WHERE (upper(TRIM(BOTH FROM COALESCE(local_subinv, ''::text))) <> ALL (ARRAY['ALPHA'::text, 'YUSEN'::text, 'YUSSEN'::text, 'PEND'::text]))
  GROUP BY COALESCE(NULLIF(TRIM(BOTH FROM local_subinv), ''::text), '(sem local)'::text);

create or replace view public.vw_ind_ocorrencias as
 SELECT (date_trunc('month'::text, COALESCE(analise_em, definicao_solicitada_em)))::date AS mes,
        CASE
            WHEN (motivo_analise ~~* '%armaz%externo%'::text) THEN 'IMEI em armazém externo'::text
            WHEN ((motivo_analise ~~* '%divergenc%'::text) OR (motivo_analise ~~* '%divergênc%'::text)) THEN 'Estoque físico com erro'::text
            WHEN (motivo_analise ~~* '%localizado%'::text) THEN 'Sem estoque físico'::text
            WHEN ((status = 'aguardando_definicao_produto'::text) OR (definicao_solicitada_em IS NOT NULL)) THEN 'Sem estoque em lista'::text
            ELSE 'Outro / não classificado'::text
        END AS categoria,
    count(*) AS ocorrencias
   FROM pedidos_b2c_indicadores
  WHERE (COALESCE(analise_em, definicao_solicitada_em) IS NOT NULL)
  GROUP BY ((date_trunc('month'::text, COALESCE(analise_em, definicao_solicitada_em)))::date),
        CASE
            WHEN (motivo_analise ~~* '%armaz%externo%'::text) THEN 'IMEI em armazém externo'::text
            WHEN ((motivo_analise ~~* '%divergenc%'::text) OR (motivo_analise ~~* '%divergênc%'::text)) THEN 'Estoque físico com erro'::text
            WHEN (motivo_analise ~~* '%localizado%'::text) THEN 'Sem estoque físico'::text
            WHEN ((status = 'aguardando_definicao_produto'::text) OR (definicao_solicitada_em IS NOT NULL)) THEN 'Sem estoque em lista'::text
            ELSE 'Outro / não classificado'::text
        END;

create or replace view public.vw_ind_pedidos_mes as
 SELECT (date_trunc('month'::text, criado_em))::date AS mes,
    count(*) AS pedidos
   FROM pedidos_b2c_indicadores
  GROUP BY ((date_trunc('month'::text, criado_em))::date);

create or replace view public.vw_ind_triagem_dia as
 SELECT dia,
    sum(funcional) AS funcional,
    sum(cosmetica) AS cosmetica
   FROM ( SELECT (assurant_triagem_indicadores.data_funcional)::date AS dia,
            1 AS funcional,
            0 AS cosmetica
           FROM assurant_triagem_indicadores
          WHERE (assurant_triagem_indicadores.data_funcional IS NOT NULL)
        UNION ALL
         SELECT (assurant_triagem_indicadores.data_cosmetico)::date AS data_cosmetico,
            0,
            1
           FROM assurant_triagem_indicadores
          WHERE (assurant_triagem_indicadores.data_cosmetico IS NOT NULL)) x
  GROUP BY dia;

create or replace view public.vw_ind_filas as
 SELECT COALESCE(NULLIF(TRIM(BOTH FROM status_atual), ''::text), '(sem status)'::text) AS etapa,
    count(*) AS aparelhos
   FROM assurant_triagem_indicadores
  GROUP BY COALESCE(NULLIF(TRIM(BOTH FROM status_atual), ''::text), '(sem status)'::text);

create or replace view public.vw_ind_b2b_dia as
 SELECT (bipado_em)::date AS dia,
    count(*) AS itens
   FROM b2b_itens_indicadores
  WHERE (bipado_em IS NOT NULL)
  GROUP BY ((bipado_em)::date);

create or replace view public.vw_ind_leadtime_mes as
 SELECT (date_trunc('month'::text, data_recebimento))::date AS mes,
    count(*) FILTER (WHERE ((EXTRACT(epoch FROM (data_funcional - data_recebimento)) / (3600)::numeric) >= (1)::numeric)) AS aparelhos,
    count(*) FILTER (WHERE ((EXTRACT(epoch FROM (data_funcional - data_recebimento)) / (3600)::numeric) < (1)::numeric)) AS excluidos_tempo_zero,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((f_horas_uteis(data_recebimento, data_funcional))::double precision)) FILTER (WHERE ((EXTRACT(epoch FROM (data_funcional - data_recebimento)) / (3600)::numeric) >= (1)::numeric)))::numeric, 1) AS receb_funcional_h,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((f_horas_uteis(data_funcional, data_cosmetico))::double precision)))::numeric, 1) AS funcional_cosmetica_h,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((f_horas_uteis(data_funcional, data_laudo))::double precision)))::numeric, 1) AS funcional_laudo_h,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((f_horas_uteis(data_cosmetico, data_oracle))::double precision)))::numeric, 1) AS cosmetica_oracle_h,
    round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((f_horas_uteis(data_recebimento, data_oracle))::double precision)) FILTER (WHERE ((EXTRACT(epoch FROM (data_funcional - data_recebimento)) / (3600)::numeric) >= (1)::numeric)))::numeric, 1) AS ponta_a_ponta_h
   FROM assurant_triagem_indicadores
  WHERE (data_recebimento IS NOT NULL)
  GROUP BY ((date_trunc('month'::text, data_recebimento))::date);

create or replace view public.vw_tradein_margem_b2c as
 WITH historico AS (
         SELECT h.id,
            h.voucher_original,
            h.voucher_key,
            h.imei_serial,
            h.sku_original,
            h.marca,
            h.aparelho,
            h.condicao_aparelho,
            h.inicio,
            h.aprovacao,
            h.status_atual,
            h.inicio_status_atual,
            h.valor_total_pagar,
            h.nome_vendedor,
            h.loja,
            h.valor_trade_in,
            h.valor_campanha,
            h.nome_campanha,
            h.lote,
            h.cae,
            h.ponto_venda_afip,
            h.produto_comprado,
            h.rede,
            h.codigo_loja,
            h.situation_description,
            h.cancelado,
            h.source_file,
            h.source_row,
            h.importado_em,
            lead(h.inicio) OVER (PARTITION BY NULLIF(btrim(h.imei_serial), ''::text) ORDER BY h.inicio, h.id) AS proxima_entrada
           FROM tradein_historico h
        ), base AS (
         SELECT h.id,
            h.voucher_original,
            h.voucher_key,
            h.imei_serial,
            h.sku_original,
            h.marca,
            h.aparelho,
            h.condicao_aparelho,
            h.inicio,
            h.aprovacao,
            h.status_atual,
            h.inicio_status_atual,
            h.valor_total_pagar,
            h.nome_vendedor,
            h.loja,
            h.valor_trade_in,
            h.valor_campanha,
            h.nome_campanha,
            h.lote,
            h.cae,
            h.ponto_venda_afip,
            h.produto_comprado,
            h.rede,
            h.codigo_loja,
            h.situation_description,
            h.cancelado,
            h.source_file,
            h.source_row,
            h.importado_em,
            h.proxima_entrada,
            t.voucher AS voucher_liquida,
            t.sku AS sku_triagem,
            t.modelo AS modelo_triagem,
            t.grade AS grade_triagem,
            t.status_atual AS status_triagem,
            t.criado_em AS triagem_em,
            p.id AS pedido_b2c_id,
            p.id_anymarket,
            p.marketplace,
            p.status AS status_pedido,
            p.status_anymarket,
            p.titulo_produto,
            p.sku_produto,
            p.sku_alocado,
            p.grade_produto,
            p.grade_alocada,
            p.valor_unitario,
            p.total_do_pedido,
            p.numero_nf,
            p.alocado_em,
            p.faturado_em,
            COALESCE(NULLIF(btrim(p.imei_bipado), ''::text), NULLIF(btrim(p.imei_alocado), ''::text)) AS imei_vendido
           FROM ((historico h
             LEFT JOIN LATERAL ( SELECT t_1.id,
                    t_1.voucher,
                    t_1.imei,
                    t_1.sku,
                    t_1.modelo,
                    t_1.local,
                    t_1.cliente,
                    t_1.loja,
                    t_1.rede,
                    t_1.tipo_de_rede,
                    t_1.lote,
                    t_1.status_atual,
                    t_1.condicao,
                    t_1.triagem_funcional,
                    t_1.grade,
                    t_1.criado_em,
                    t_1.atualizado_em,
                    t_1.tela,
                    t_1.laterais,
                    t_1.traseira,
                    t_1.defeitos_adicionais,
                    t_1.resultado_triagem_funcional,
                    t_1.data_recebimento,
                    t_1.data_funcional,
                    t_1.data_cosmetico,
                    t_1.data_laudo,
                    t_1.data_alocacao,
                    t_1.data_oracle,
                    t_1.respostas_funcional,
                    t_1.status_bateria,
                    t_1.reanalise,
                    t_1.aging,
                    t_1.uploaded_at,
                    t_1.uploaded_by,
                    t_1.mes_referencia,
                    t_1.local_normalizado,
                    t_1.oracle_confirmado_em,
                    t_1.oracle_confirmado_por,
                    t_1.funcional_por,
                    t_1.cosmetico_por,
                    t_1.laudo_por,
                    t_1.origem_triagem,
                    t_1.bateria_percentual,
                    t_1.grade_cosmetica,
                    t_1.rebaixado_bateria,
                    t_1.devolucao_id
                   FROM assurant_triagem_indicadores t_1
                  WHERE ((btrim(t_1.imei) = btrim(h.imei_serial)) AND (tradein_voucher_key(t_1.voucher) = h.voucher_key))
                  ORDER BY t_1.criado_em DESC NULLS LAST
                 LIMIT 1) t ON (true))
             LEFT JOIN LATERAL ( SELECT p_1.id,
                    p_1.id_anymarket,
                    p_1.hora_corte,
                    p_1.status,
                    p_1.cpf_cnpj,
                    p_1.cliente,
                    p_1.telefone,
                    p_1.email,
                    p_1.marketplace,
                    p_1.data_pedido,
                    p_1.data_de_pagamento,
                    p_1.titulo_produto,
                    p_1.sku_produto,
                    p_1.grade_produto,
                    p_1.valor_unitario,
                    p_1.total_do_pedido,
                    p_1.codigo_de_rastreio,
                    p_1.logradouro,
                    p_1.numero,
                    p_1.complemento,
                    p_1.bairro,
                    p_1.municipio,
                    p_1.estado,
                    p_1.cep,
                    p_1.imei_alocado,
                    p_1.sku_alocado,
                    p_1.grade_alocada,
                    p_1.alocado_em,
                    p_1.alocado_por,
                    p_1.imei_bipado,
                    p_1.bipado_em,
                    p_1.bipado_por,
                    p_1.motivo_analise,
                    p_1.analise_em,
                    p_1.analise_por,
                    p_1.resolvido_em,
                    p_1.resolvido_por,
                    p_1.embalado_em,
                    p_1.embalado_por,
                    p_1.codigo_embalagem,
                    p_1.numero_nf,
                    p_1.chave_nf,
                    p_1.faturado_em,
                    p_1.faturado_por,
                    p_1.grupo_id,
                    p_1.criado_em,
                    p_1.atualizado_em,
                    p_1.criado_por,
                    p_1.status_anymarket,
                    p_1.data_entrega,
                    p_1.etapa_embalagem,
                    p_1.emb_nf_colada,
                    p_1.emb_selado,
                    p_1.emb_etiquetado,
                    p_1.definicao_solicitada_em,
                    p_1.definicao_solicitada_por,
                    p_1.sku_marketplace,
                    p_1.item_seq,
                    p_1.sku_definido,
                    p_1.grade_definida,
                    p_1.definicao_status,
                    p_1.definicao_resolvido_em,
                    p_1.definicao_resolvido_por,
                    p_1.definicao_resumo,
                    p_1.data_subinv_alocado,
                    p_1.local_subinv_alocado,
                    p_1.local_alocado,
                    p_1.fifo_posicao,
                    p_1.fifo_total_candidatos,
                    p_1.fifo_origem,
                    p_1.wms_alocacao_id
                   FROM pedidos_b2c_indicadores p_1
                  WHERE ((COALESCE(NULLIF(btrim(p_1.imei_bipado), ''::text), NULLIF(btrim(p_1.imei_alocado), ''::text)) = btrim(h.imei_serial)) AND (COALESCE(p_1.alocado_em, p_1.faturado_em, p_1.criado_em) >= COALESCE(h.inicio, '-infinity'::timestamp with time zone)) AND ((h.proxima_entrada IS NULL) OR (COALESCE(p_1.alocado_em, p_1.faturado_em, p_1.criado_em) < h.proxima_entrada)))
                  ORDER BY (p_1.faturado_em IS NOT NULL) DESC, COALESCE(p_1.faturado_em, p_1.alocado_em, p_1.criado_em) DESC NULLS LAST
                 LIMIT 1) p ON (true))
        )
 SELECT id AS tradein_id,
    voucher_original,
    voucher_key,
    imei_serial,
    sku_original AS sku_tradein,
    marca,
    aparelho,
    condicao_aparelho,
    inicio AS data_tradein,
    aprovacao,
    status_atual AS status_tradein,
    valor_trade_in,
    valor_campanha,
    valor_total_pagar AS custo_tradein,
    loja,
    rede,
    codigo_loja,
    nome_vendedor,
    lote,
    cancelado,
    voucher_liquida,
    sku_triagem,
    modelo_triagem,
    grade_triagem,
    status_triagem,
    triagem_em,
    pedido_b2c_id,
    id_anymarket,
    marketplace,
    status_pedido,
    status_anymarket,
    titulo_produto,
    sku_produto,
    sku_alocado,
    grade_produto,
    grade_alocada,
    valor_unitario AS receita_item,
    total_do_pedido,
    numero_nf,
    alocado_em,
    faturado_em,
    imei_vendido,
        CASE
            WHEN ((faturado_em IS NOT NULL) AND (valor_unitario IS NOT NULL) AND (valor_total_pagar IS NOT NULL)) THEN round((valor_unitario - valor_total_pagar), 2)
            ELSE NULL::numeric
        END AS margem_bruta_rs,
        CASE
            WHEN ((faturado_em IS NOT NULL) AND (valor_unitario IS NOT NULL) AND (valor_unitario <> (0)::numeric) AND (valor_total_pagar IS NOT NULL)) THEN round((((valor_unitario - valor_total_pagar) / valor_unitario) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS margem_bruta_pct,
        CASE
            WHEN ((faturado_em IS NOT NULL) AND (inicio IS NOT NULL)) THEN (((faturado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date - ((inicio AT TIME ZONE 'America/Sao_Paulo'::text))::date)
            ELSE NULL::integer
        END AS aging_ate_venda_dias,
        CASE
            WHEN cancelado THEN 'tradein_cancelado'::text
            WHEN (voucher_liquida IS NULL) THEN 'sem_triagem_imei_voucher'::text
            WHEN (pedido_b2c_id IS NULL) THEN 'tradein_sem_pedido_b2c'::text
            WHEN (faturado_em IS NULL) THEN 'pedido_sem_faturamento'::text
            ELSE 'margem_calculavel'::text
        END AS status_vinculo,
    source_file,
    source_row,
    importado_em
   FROM base;

create or replace view public.vw_fechamento_inventario_inicial_202608 as
 WITH eventos_ordenados AS (
         SELECT e.id,
            e.sessao_id,
            e.endereco_id,
            e.alocacao_id,
            e.triagem_id,
            e.imei,
            e.resultado,
            e.regra,
            e.caixa_codigo,
            e.status_gaia,
            e.possui_subinv,
            e.data_subinv,
            e.local_subinv,
            e.proximo_status,
            e.local_anterior,
            e.status_anterior,
            e.snapshot,
            e.operador_id,
            e.criado_em,
            e.caixa_confirmada_em,
            e.caixa_confirmada_por,
            e.estornado_em,
            e.estornado_por,
            row_number() OVER (PARTITION BY (TRIM(BOTH FROM e.imei)) ORDER BY e.criado_em DESC, e.id DESC) AS ordem_final,
            count(*) OVER (PARTITION BY (TRIM(BOTH FROM e.imei))) AS quantidade_bipagens
           FROM wms_carga_inicial_eventos e
          WHERE ((e.estornado_em IS NULL) AND (NULLIF(TRIM(BOTH FROM e.imei), ''::text) IS NOT NULL))
        ), fisico_final AS (
         SELECT TRIM(BOTH FROM eventos_ordenados.imei) AS imei,
            eventos_ordenados.resultado,
            eventos_ordenados.regra,
            eventos_ordenados.caixa_codigo,
            eventos_ordenados.status_gaia,
            eventos_ordenados.possui_subinv,
            eventos_ordenados.data_subinv,
            eventos_ordenados.proximo_status,
            eventos_ordenados.criado_em,
            eventos_ordenados.endereco_id,
            eventos_ordenados.sessao_id,
            eventos_ordenados.quantidade_bipagens
           FROM eventos_ordenados
          WHERE (eventos_ordenados.ordem_final = 1)
        ), subinv_base AS (
         SELECT DISTINCT ON ((TRIM(BOTH FROM h.imei))) TRIM(BOTH FROM h.imei) AS imei,
            h.data_subinv,
            h.local_subinv,
            h.carga_id
           FROM estoque_subinv_historico h
          WHERE ((h.carga_id = 'c3e1ee95-3624-48fb-ab55-af2281abe55e'::uuid) AND (NULLIF(TRIM(BOTH FROM h.imei), ''::text) IS NOT NULL))
          ORDER BY (TRIM(BOTH FROM h.imei)), h.data_subinv DESC NULLS LAST
        ), triagem_ordenada AS (
         SELECT TRIM(BOTH FROM t.imei) AS imei,
            t.sku,
            t.modelo,
            t.grade,
            t.voucher,
            t.status_bateria,
            t.status_atual,
            row_number() OVER (PARTITION BY (TRIM(BOTH FROM t.imei)) ORDER BY t.atualizado_em DESC NULLS LAST, t.criado_em DESC NULLS LAST) AS ordem_triagem
           FROM assurant_triagem_indicadores t
          WHERE (NULLIF(TRIM(BOTH FROM t.imei), ''::text) IS NOT NULL)
        ), triagem_base AS (
         SELECT triagem_ordenada.imei,
            triagem_ordenada.sku,
            triagem_ordenada.modelo,
            triagem_ordenada.grade,
            triagem_ordenada.voucher,
            triagem_ordenada.status_bateria,
            triagem_ordenada.status_atual
           FROM triagem_ordenada
          WHERE (triagem_ordenada.ordem_triagem = 1)
        ), custos_candidatos AS (
         SELECT TRIM(BOTH FROM a.imei) AS chave_custo,
            a.id,
            a.custo_net,
            a.dt_ref,
            a.num_os,
            a.num_nf,
            a.modelo,
            a.descricao_produto,
            a.fornecedor_original,
            'IMEI'::text AS vinculo_custo
           FROM aging_entrada_cache a
          WHERE (NULLIF(TRIM(BOTH FROM a.imei), ''::text) IS NOT NULL)
        UNION ALL
         SELECT TRIM(BOTH FROM a.serial_out) AS chave_custo,
            a.id,
            a.custo_net,
            a.dt_ref,
            a.num_os,
            a.num_nf,
            a.modelo,
            a.descricao_produto,
            a.fornecedor_original,
            'SERIAL_OUT'::text AS vinculo_custo
           FROM aging_entrada_cache a
          WHERE ((NULLIF(TRIM(BOTH FROM a.serial_out), ''::text) IS NOT NULL) AND (TRIM(BOTH FROM a.serial_out) IS DISTINCT FROM TRIM(BOTH FROM COALESCE(a.imei, ''::text))))
        ), custos_ordenados AS (
         SELECT c_1.chave_custo,
            c_1.id,
            c_1.custo_net,
            c_1.dt_ref,
            c_1.num_os,
            c_1.num_nf,
            c_1.modelo,
            c_1.descricao_produto,
            c_1.fornecedor_original,
            c_1.vinculo_custo,
            row_number() OVER (PARTITION BY c_1.chave_custo ORDER BY (c_1.custo_net IS NOT NULL) DESC, c_1.dt_ref DESC NULLS LAST, c_1.id DESC) AS ordem_custo
           FROM custos_candidatos c_1
        ), custos_base AS (
         SELECT custos_ordenados.chave_custo,
            custos_ordenados.custo_net,
            custos_ordenados.dt_ref,
            custos_ordenados.num_os,
            custos_ordenados.num_nf,
            custos_ordenados.modelo,
            custos_ordenados.descricao_produto,
            custos_ordenados.fornecedor_original,
            custos_ordenados.vinculo_custo
           FROM custos_ordenados
          WHERE (custos_ordenados.ordem_custo = 1)
        ), universo AS (
         SELECT COALESCE(f.imei, s.imei) AS imei,
            (f.imei IS NOT NULL) AS encontrado_fisicamente,
            (s.imei IS NOT NULL) AS consta_subinv_assurant,
                CASE
                    WHEN (s.imei IS NULL) THEN false
                    ELSE (upper(TRIM(BOTH FROM COALESCE(s.local_subinv, ''::text))) ~~ 'WH2%'::text)
                END AS consta_subinv_wh2,
            f.resultado,
            f.regra,
            f.caixa_codigo,
            f.status_gaia,
            f.possui_subinv AS possuia_subinv_na_bipagem,
            f.data_subinv AS data_subinv_na_bipagem,
            f.proximo_status,
            f.criado_em AS data_bipagem,
            f.endereco_id,
            f.sessao_id,
            f.quantidade_bipagens,
            s.data_subinv AS data_subinv_assurant,
            s.local_subinv,
            s.carga_id
           FROM (fisico_final f
             FULL JOIN subinv_base s ON ((s.imei = f.imei)))
        ), classificado AS (
         SELECT u.imei,
            u.encontrado_fisicamente,
            u.consta_subinv_assurant,
            u.consta_subinv_wh2,
            u.resultado,
            u.regra,
            u.caixa_codigo,
            u.status_gaia,
            u.possuia_subinv_na_bipagem,
            u.data_subinv_na_bipagem,
            u.proximo_status,
            u.data_bipagem,
            u.endereco_id,
            u.sessao_id,
            u.quantidade_bipagens,
            u.data_subinv_assurant,
            u.local_subinv,
            u.carga_id,
                CASE
                    WHEN (u.encontrado_fisicamente AND u.consta_subinv_wh2 AND (u.resultado = 'alocado'::text)) THEN 'CONCILIADO - ENCONTRADO E ALOCADO'::text
                    WHEN (u.encontrado_fisicamente AND u.consta_subinv_wh2 AND (u.resultado = 'segregado'::text)) THEN 'SUBINV ENCONTRADO - EM ANÁLISE'::text
                    WHEN (u.encontrado_fisicamente AND (NOT u.consta_subinv_assurant) AND (u.resultado = 'alocado'::text)) THEN 'ENCONTRADO E ALOCADO - FORA DO SUBINV'::text
                    WHEN (u.encontrado_fisicamente AND (NOT u.consta_subinv_assurant) AND (u.resultado = 'segregado'::text)) THEN 'ENCONTRADO EM ANÁLISE - FORA DO SUBINV'::text
                    WHEN (u.encontrado_fisicamente AND u.consta_subinv_assurant AND (NOT u.consta_subinv_wh2)) THEN 'ENCONTRADO FISICAMENTE - SUBINV FORA DO WH2'::text
                    WHEN ((NOT u.encontrado_fisicamente) AND u.consta_subinv_wh2) THEN 'SUBINV WH2 - NÃO ENCONTRADO FISICAMENTE'::text
                    WHEN ((NOT u.encontrado_fisicamente) AND u.consta_subinv_assurant AND (NOT u.consta_subinv_wh2)) THEN 'SUBINV FORA DO WH2 - FORA DO ESCOPO FÍSICO'::text
                    ELSE 'OUTRA DIVERGÊNCIA'::text
                END AS classificacao,
                CASE
                    WHEN (NOT u.encontrado_fisicamente) THEN 'NÃO ENCONTRADO'::text
                    WHEN (u.resultado = 'alocado'::text) THEN 'ALOCADO NO WMS'::text
                    WHEN (u.resultado = 'segregado'::text) THEN 'EM ANÁLISE'::text
                    ELSE upper(COALESCE(u.resultado, 'SEM RESULTADO'::text))
                END AS situacao_inventario
           FROM universo u
        )
 SELECT c.imei,
    c.classificacao,
    c.situacao_inventario,
    c.encontrado_fisicamente,
    c.consta_subinv_assurant,
    c.consta_subinv_wh2,
    c.resultado,
    c.regra,
    c.caixa_codigo,
    caixa.nome AS caixa_nome,
    caixa.motivo AS motivo_caixa,
    c.status_gaia AS status_gaia_na_bipagem,
    c.proximo_status,
    c.possuia_subinv_na_bipagem,
    c.data_subinv_na_bipagem,
    c.data_bipagem,
    c.quantidade_bipagens,
    c.data_subinv_assurant,
    c.local_subinv AS local_subinv_assurant,
    c.carga_id AS carga_subinv_id,
    c.sessao_id,
    c.endereco_id,
        CASE
            WHEN (endereco.id IS NULL) THEN NULL::text
            ELSE concat('RUA ', lpad((endereco.rua)::text, 2, '0'::text), ' · BL ', lpad((endereco.bloco)::text, 2, '0'::text), ' · AD ', lpad((endereco.andar)::text, 2, '0'::text), ' · AP ', endereco.coluna, lpad((endereco.linha)::text, 2, '0'::text))
        END AS local_wms_inventario,
    triagem.voucher,
    triagem.sku,
    COALESCE(triagem.modelo, custo.modelo, custo.descricao_produto) AS modelo,
    triagem.grade,
    triagem.status_bateria,
    triagem.status_atual AS status_atual_sistema,
    custo.custo_net,
    custo.dt_ref AS data_referencia_custo,
    custo.vinculo_custo,
    custo.num_os AS os_custo,
    custo.num_nf AS nf_custo,
    custo.fornecedor_original AS fornecedor_custo,
        CASE
            WHEN (custo.custo_net IS NULL) THEN 'CUSTO NÃO LOCALIZADO'::text
            ELSE 'CUSTO LOCALIZADO'::text
        END AS situacao_custo
   FROM ((((classificado c
     LEFT JOIN wms_caixas_analise caixa ON ((caixa.codigo = c.caixa_codigo)))
     LEFT JOIN wms_enderecos endereco ON ((endereco.id = c.endereco_id)))
     LEFT JOIN triagem_base triagem ON ((triagem.imei = c.imei)))
     LEFT JOIN custos_base custo ON ((custo.chave_custo = c.imei)));

create or replace view public.vw_margem_b2c_gabriel as
 WITH vendas AS (
         SELECT p_1.id,
            p_1.id_anymarket,
            p_1.hora_corte,
            p_1.status,
            p_1.cpf_cnpj,
            p_1.cliente,
            p_1.telefone,
            p_1.email,
            p_1.marketplace,
            p_1.data_pedido,
            p_1.data_de_pagamento,
            p_1.titulo_produto,
            p_1.sku_produto,
            p_1.grade_produto,
            p_1.valor_unitario,
            p_1.total_do_pedido,
            p_1.codigo_de_rastreio,
            p_1.logradouro,
            p_1.numero,
            p_1.complemento,
            p_1.bairro,
            p_1.municipio,
            p_1.estado,
            p_1.cep,
            p_1.imei_alocado,
            p_1.sku_alocado,
            p_1.grade_alocada,
            p_1.alocado_em,
            p_1.alocado_por,
            p_1.imei_bipado,
            p_1.bipado_em,
            p_1.bipado_por,
            p_1.motivo_analise,
            p_1.analise_em,
            p_1.analise_por,
            p_1.resolvido_em,
            p_1.resolvido_por,
            p_1.embalado_em,
            p_1.embalado_por,
            p_1.codigo_embalagem,
            p_1.numero_nf,
            p_1.chave_nf,
            p_1.faturado_em,
            p_1.faturado_por,
            p_1.grupo_id,
            p_1.criado_em,
            p_1.atualizado_em,
            p_1.criado_por,
            p_1.status_anymarket,
            p_1.data_entrega,
            p_1.etapa_embalagem,
            p_1.emb_nf_colada,
            p_1.emb_selado,
            p_1.emb_etiquetado,
            p_1.definicao_solicitada_em,
            p_1.definicao_solicitada_por,
            p_1.sku_marketplace,
            p_1.item_seq,
            p_1.sku_definido,
            p_1.grade_definida,
            p_1.definicao_status,
            p_1.definicao_resolvido_em,
            p_1.definicao_resolvido_por,
            p_1.definicao_resumo,
            p_1.data_subinv_alocado,
            p_1.local_subinv_alocado,
            p_1.local_alocado,
            p_1.fifo_posicao,
            p_1.fifo_total_candidatos,
            p_1.fifo_origem,
            p_1.wms_alocacao_id,
            COALESCE(NULLIF(btrim(p_1.imei_bipado), ''::text), NULLIF(btrim(p_1.imei_alocado), ''::text)) AS imei_final
           FROM pedidos_b2c_indicadores p_1
          WHERE ((p_1.faturado_em IS NOT NULL) AND (( SELECT auth.uid() AS uid) = 'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid))
        )
 SELECT p.id AS pedido_item_id,
    p.id_anymarket,
    p.item_seq,
    p.marketplace,
    p.status AS status_pedido,
    p.status_anymarket,
    p.numero_nf,
    p.faturado_em,
    p.titulo_produto,
    p.sku_produto,
    p.sku_alocado,
    p.grade_produto,
    p.grade_alocada,
    p.imei_final,
    p.valor_unitario AS preco_venda,
    p.total_do_pedido,
    t.voucher AS voucher_liquida,
    t.sku AS sku_triagem,
    t.modelo AS modelo_triagem,
    t.grade AS grade_triagem,
    t.criado_em AS triagem_em,
    h.id AS tradein_id,
    h.voucher_original AS voucher_tradein,
    h.voucher_key,
    h.inicio AS data_tradein,
    h.sku_original AS sku_tradein,
    h.aparelho AS aparelho_tradein,
    h.condicao_aparelho,
    h.valor_trade_in,
    h.valor_campanha,
    h.valor_total_pagar AS custo_entrada,
    h.rede,
    h.loja,
    h.nome_vendedor AS vendedor_tradein,
        CASE
            WHEN (h.id IS NULL) THEN NULL::numeric
            ELSE round((p.valor_unitario - h.valor_total_pagar), 2)
        END AS margem_rs,
        CASE
            WHEN ((h.id IS NULL) OR (p.valor_unitario IS NULL) OR (p.valor_unitario = (0)::numeric)) THEN NULL::numeric
            ELSE round((((p.valor_unitario - h.valor_total_pagar) / p.valor_unitario) * (100)::numeric), 2)
        END AS margem_pct,
        CASE
            WHEN (h.id IS NULL) THEN NULL::integer
            ELSE (((p.faturado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date - ((h.inicio AT TIME ZONE 'America/Sao_Paulo'::text))::date)
        END AS aging_ate_venda_dias,
        CASE
            WHEN (p.imei_final IS NULL) THEN 'sem_imei_final'::text
            WHEN (t.voucher IS NULL) THEN 'sem_voucher_triagem'::text
            WHEN (h.id IS NULL) THEN 'sem_custo_historico'::text
            ELSE 'margem_calculavel'::text
        END AS status_margem
   FROM ((vendas p
     LEFT JOIN LATERAL ( SELECT t_1.voucher,
            t_1.sku,
            t_1.modelo,
            t_1.grade,
            t_1.criado_em
           FROM assurant_triagem_indicadores t_1
          WHERE ((btrim(t_1.imei) = p.imei_final) AND (t_1.criado_em <= (p.faturado_em AT TIME ZONE 'UTC'::text)))
          ORDER BY t_1.criado_em DESC NULLS LAST
         LIMIT 1) t ON (true))
     LEFT JOIN tradein_historico h ON (((btrim(h.imei_serial) = p.imei_final) AND (h.voucher_key = tradein_voucher_key(t.voucher)) AND (h.cancelado = false))));

create or replace view public.vw_assurant_b2c_timeline as
 WITH item_base AS (
         SELECT p.id,
            p.id_anymarket,
            p.hora_corte,
            p.status,
            p.cpf_cnpj,
            p.cliente,
            p.telefone,
            p.email,
            p.marketplace,
            p.data_pedido,
            p.data_de_pagamento,
            p.titulo_produto,
            p.sku_produto,
            p.grade_produto,
            p.valor_unitario,
            p.total_do_pedido,
            p.codigo_de_rastreio,
            p.logradouro,
            p.numero,
            p.complemento,
            p.bairro,
            p.municipio,
            p.estado,
            p.cep,
            p.imei_alocado,
            p.sku_alocado,
            p.grade_alocada,
            p.alocado_em,
            p.alocado_por,
            p.imei_bipado,
            p.bipado_em,
            p.bipado_por,
            p.motivo_analise,
            p.analise_em,
            p.analise_por,
            p.resolvido_em,
            p.resolvido_por,
            p.embalado_em,
            p.embalado_por,
            p.codigo_embalagem,
            p.numero_nf,
            p.chave_nf,
            p.faturado_em,
            p.faturado_por,
            p.grupo_id,
            p.criado_em,
            p.atualizado_em,
            p.criado_por,
            p.status_anymarket,
            p.data_entrega,
            p.etapa_embalagem,
            p.emb_nf_colada,
            p.emb_selado,
            p.emb_etiquetado,
            p.definicao_solicitada_em,
            p.definicao_solicitada_por,
            p.sku_marketplace,
            p.item_seq,
            p.sku_definido,
            p.grade_definida,
            p.definicao_status,
            p.definicao_resolvido_em,
            p.definicao_resolvido_por,
            p.definicao_resumo,
            p.data_subinv_alocado,
            p.local_subinv_alocado,
            p.local_alocado,
            p.fifo_posicao,
            p.fifo_total_candidatos,
            p.fifo_origem,
                CASE
                    WHEN (p.data_de_pagamento ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$'::text) THEN make_timestamptz((SUBSTRING(p.data_de_pagamento FROM 7 FOR 4))::integer, (SUBSTRING(p.data_de_pagamento FROM 4 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 1 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 12 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 15 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 18 FOR 2))::double precision, 'America/Sao_Paulo'::text)
                    ELSE NULL::timestamp with time zone
                END AS pago_em,
            g.picking_em
           FROM (pedidos_b2c_indicadores p
             LEFT JOIN pedidos_b2c_grupos g ON ((g.id = p.grupo_id)))
        ), agg AS (
         SELECT item_base.id_anymarket,
            max(item_base.marketplace) AS marketplace,
            max(item_base.cliente) AS cliente,
            count(*) AS qtd_itens,
            max(item_base.total_do_pedido) AS valor_pedido,
            max(item_base.status_anymarket) AS status_anymarket,
            string_agg(DISTINCT item_base.status, ', '::text ORDER BY item_base.status) AS status_interno,
            max(item_base.pago_em) AS pago_em,
            min(item_base.alocado_em) AS alocacao_inicio_em,
            max(item_base.alocado_em) AS alocacao_conclusao_em,
            max(item_base.picking_em) AS picking_em,
            min(item_base.bipado_em) AS separacao_inicio_em,
            max(item_base.bipado_em) AS separacao_conclusao_em,
            min(item_base.embalado_em) AS embalagem_inicio_em,
            max(item_base.embalado_em) AS embalagem_conclusao_em,
            bool_and(COALESCE(item_base.emb_etiquetado, false)) AS etiquetado,
            min(item_base.faturado_em) AS faturamento_inicio_em,
            max(item_base.faturado_em) AS faturamento_conclusao_em,
            count(*) FILTER (WHERE (item_base.alocado_em IS NOT NULL)) AS itens_alocados,
            count(*) FILTER (WHERE (item_base.bipado_em IS NOT NULL)) AS itens_separados,
            count(*) FILTER (WHERE (item_base.embalado_em IS NOT NULL)) AS itens_embalados,
            count(*) FILTER (WHERE (item_base.emb_etiquetado IS TRUE)) AS itens_etiquetados,
            count(*) FILTER (WHERE (item_base.faturado_em IS NOT NULL)) AS itens_faturados
           FROM item_base
          GROUP BY item_base.id_anymarket
        )
 SELECT id_anymarket,
    marketplace,
    cliente,
    qtd_itens,
    valor_pedido,
    status_anymarket,
    status_interno,
    pago_em,
    alocacao_inicio_em,
    alocacao_conclusao_em,
    picking_em,
    separacao_inicio_em,
    separacao_conclusao_em,
    embalagem_inicio_em,
    embalagem_conclusao_em,
    etiquetado,
    faturamento_inicio_em,
    faturamento_conclusao_em,
    itens_alocados,
    itens_separados,
    itens_embalados,
    itens_etiquetados,
    itens_faturados,
    (pago_em IS NOT NULL) AS tem_pagamento,
    ((itens_alocados = qtd_itens) AND (qtd_itens > 0)) AS alocacao_completa,
    (picking_em IS NOT NULL) AS picking_realizado,
    ((itens_separados = qtd_itens) AND (qtd_itens > 0)) AS separacao_completa,
    ((itens_embalados = qtd_itens) AND (qtd_itens > 0)) AS embalagem_completa,
    ((itens_etiquetados = qtd_itens) AND (qtd_itens > 0)) AS etiquetagem_completa,
    ((itens_faturados = qtd_itens) AND (qtd_itens > 0)) AS faturamento_completo,
        CASE
            WHEN ((pago_em IS NOT NULL) AND (alocacao_conclusao_em >= pago_em)) THEN round((EXTRACT(epoch FROM (alocacao_conclusao_em - pago_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_pago_ate_alocacao,
        CASE
            WHEN ((alocacao_conclusao_em IS NOT NULL) AND (picking_em >= alocacao_conclusao_em)) THEN round((EXTRACT(epoch FROM (picking_em - alocacao_conclusao_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_alocacao_ate_picking,
        CASE
            WHEN ((picking_em IS NOT NULL) AND (separacao_conclusao_em >= picking_em)) THEN round((EXTRACT(epoch FROM (separacao_conclusao_em - picking_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_picking_ate_separacao,
        CASE
            WHEN ((separacao_conclusao_em IS NOT NULL) AND (embalagem_conclusao_em >= separacao_conclusao_em)) THEN round((EXTRACT(epoch FROM (embalagem_conclusao_em - separacao_conclusao_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_separacao_ate_embalagem,
        CASE
            WHEN ((embalagem_conclusao_em IS NOT NULL) AND (faturamento_conclusao_em >= embalagem_conclusao_em)) THEN round((EXTRACT(epoch FROM (faturamento_conclusao_em - embalagem_conclusao_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_embalagem_ate_faturamento,
        CASE
            WHEN ((pago_em IS NOT NULL) AND (faturamento_conclusao_em >= pago_em)) THEN round((EXTRACT(epoch FROM (faturamento_conclusao_em - pago_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_ponta_a_ponta,
    (NOT (((pago_em IS NOT NULL) AND (alocacao_conclusao_em IS NOT NULL) AND (alocacao_conclusao_em < pago_em)) OR ((alocacao_conclusao_em IS NOT NULL) AND (picking_em IS NOT NULL) AND (picking_em < alocacao_conclusao_em)) OR ((picking_em IS NOT NULL) AND (separacao_conclusao_em IS NOT NULL) AND (separacao_conclusao_em < picking_em)) OR ((separacao_conclusao_em IS NOT NULL) AND (embalagem_conclusao_em IS NOT NULL) AND (embalagem_conclusao_em < separacao_conclusao_em)) OR ((embalagem_conclusao_em IS NOT NULL) AND (faturamento_conclusao_em IS NOT NULL) AND (faturamento_conclusao_em < embalagem_conclusao_em)))) AS cronologia_valida,
    'Sem timestamp dedicado de etiquetagem; emb_etiquetado informa apenas conclusão.'::text AS observacao_etiquetagem
   FROM agg a;

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
         SELECT b2b_nfs.pedido_id,
            count(*) AS qtd_nfs,
            count(*) FILTER (WHERE (b2b_nfs.status = 'erro'::text)) AS qtd_nfs_erro,
            min(b2b_nfs.data_faturamento) FILTER (WHERE (COALESCE(b2b_nfs.status, ''::text) <> 'erro'::text)) AS primeiro_faturamento_em,
            max(b2b_nfs.data_faturamento) FILTER (WHERE (COALESCE(b2b_nfs.status, ''::text) <> 'erro'::text)) AS ultimo_faturamento_em
           FROM b2b_nfs
          GROUP BY b2b_nfs.pedido_id
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
           FROM (((b2b_pedidos p
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

create or replace view public.vw_assurant_etapas_mensais as
 WITH eventos AS (
         SELECT (date_trunc('month'::text, (t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS periodo_inicio,
            'B2C'::text AS canal,
            e.etapa,
            e.minutos
           FROM (vw_assurant_b2c_timeline t
             CROSS JOIN LATERAL ( VALUES ('Entrada pedido → Separação'::text,
                        CASE
                            WHEN ((t.separacao_conclusao_em IS NOT NULL) AND (t.separacao_conclusao_em >= t.pago_em)) THEN (EXTRACT(epoch FROM (t.separacao_conclusao_em - t.pago_em)) / 60.0)
                            ELSE NULL::numeric
                        END), ('Separação → Faturamento'::text,
                        CASE
                            WHEN ((t.faturamento_conclusao_em IS NOT NULL) AND (t.separacao_conclusao_em IS NOT NULL) AND (t.faturamento_conclusao_em >= t.separacao_conclusao_em)) THEN (EXTRACT(epoch FROM (t.faturamento_conclusao_em - t.separacao_conclusao_em)) / 60.0)
                            ELSE NULL::numeric
                        END)) e(etapa, minutos))
          WHERE ((t.pago_em IS NOT NULL) AND (e.minutos IS NOT NULL))
        UNION ALL
         SELECT (date_trunc('month'::text, (x.definicao_solicitada_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS date_trunc,
            'B2C'::text AS text,
            'Aguardando definição → Saída'::text AS text,
            (EXTRACT(epoch FROM (x.definicao_resolvido_em - x.definicao_solicitada_em)) / 60.0)
           FROM pedidos_b2c_indicadores x
          WHERE ((x.definicao_solicitada_em IS NOT NULL) AND (x.definicao_resolvido_em IS NOT NULL) AND (x.definicao_resolvido_em >= x.definicao_solicitada_em))
        UNION ALL
         SELECT (date_trunc('month'::text, (t.pedido_criado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS date_trunc,
            'B2B'::text AS text,
            e.etapa,
            e.minutos
           FROM (vw_assurant_b2b_item_timeline t
             CROSS JOIN LATERAL ( VALUES ('Entrada pedido → Separação'::text,t.min_pedido_ate_separacao), ('Separação → Embalagem'::text,t.min_separacao_ate_embalagem), ('Embalagem → Faturamento'::text,t.min_embalagem_ate_faturamento)) e(etapa, minutos))
          WHERE ((NOT t.eh_reparo_interno) AND (e.minutos IS NOT NULL))
        ), stats AS (
         SELECT eventos.periodo_inicio,
            eventos.canal,
            eventos.etapa,
            count(*) AS amostra,
            round(avg(eventos.minutos), 2) AS media_min,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((eventos.minutos)::double precision)))::numeric, 2) AS mediana_min,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((eventos.minutos)::double precision)))::numeric, 2) AS p90_min
           FROM eventos
          GROUP BY eventos.periodo_inicio, eventos.canal, eventos.etapa
        ), comp AS (
         SELECT s.periodo_inicio,
            s.canal,
            s.etapa,
            s.amostra,
            s.media_min,
            s.mediana_min,
            s.p90_min,
            lag(s.mediana_min) OVER (PARTITION BY s.canal, s.etapa ORDER BY s.periodo_inicio) AS mediana_anterior_min,
            lag(s.p90_min) OVER (PARTITION BY s.canal, s.etapa ORDER BY s.periodo_inicio) AS p90_anterior_min,
            lag(s.amostra) OVER (PARTITION BY s.canal, s.etapa ORDER BY s.periodo_inicio) AS amostra_anterior
           FROM stats s
        )
 SELECT periodo_inicio,
    canal,
    etapa,
    amostra,
    media_min,
    mediana_min,
    p90_min,
    mediana_anterior_min,
    p90_anterior_min,
    amostra_anterior,
        CASE
            WHEN (mediana_anterior_min > (0)::numeric) THEN round(((100.0 * (mediana_min - mediana_anterior_min)) / mediana_anterior_min), 2)
            ELSE NULL::numeric
        END AS variacao_mediana_pct,
        CASE
            WHEN (p90_anterior_min > (0)::numeric) THEN round(((100.0 * (p90_min - p90_anterior_min)) / p90_anterior_min), 2)
            ELSE NULL::numeric
        END AS variacao_p90_pct
   FROM comp;

create or replace view public.vw_assurant_b2c_item_timeline as
 SELECT p.id AS item_id,
    p.id_anymarket,
    p.item_seq,
    p.marketplace,
    p.sku_produto,
    p.grade_produto,
    p.status,
    p.status_anymarket,
        CASE
            WHEN (p.data_de_pagamento ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$'::text) THEN make_timestamptz((SUBSTRING(p.data_de_pagamento FROM 7 FOR 4))::integer, (SUBSTRING(p.data_de_pagamento FROM 4 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 1 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 12 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 15 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 18 FOR 2))::double precision, 'America/Sao_Paulo'::text)
            ELSE NULL::timestamp with time zone
        END AS pago_em,
    p.alocado_em,
    g.picking_em,
    p.bipado_em AS separacao_em,
    p.embalado_em,
    p.emb_etiquetado AS etiquetado,
    p.faturado_em,
        CASE
            WHEN ((p.alocado_em IS NOT NULL) AND (p.data_de_pagamento ~ '^\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}$'::text)) THEN round((EXTRACT(epoch FROM (p.alocado_em - make_timestamptz((SUBSTRING(p.data_de_pagamento FROM 7 FOR 4))::integer, (SUBSTRING(p.data_de_pagamento FROM 4 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 1 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 12 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 15 FOR 2))::integer, (SUBSTRING(p.data_de_pagamento FROM 18 FOR 2))::double precision, 'America/Sao_Paulo'::text))) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_pago_ate_alocacao,
        CASE
            WHEN ((g.picking_em IS NOT NULL) AND (p.alocado_em IS NOT NULL) AND (g.picking_em >= p.alocado_em)) THEN round((EXTRACT(epoch FROM (g.picking_em - p.alocado_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_alocacao_ate_picking,
        CASE
            WHEN ((p.bipado_em IS NOT NULL) AND (g.picking_em IS NOT NULL) AND (p.bipado_em >= g.picking_em)) THEN round((EXTRACT(epoch FROM (p.bipado_em - g.picking_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_picking_ate_separacao,
        CASE
            WHEN ((p.embalado_em IS NOT NULL) AND (p.bipado_em IS NOT NULL) AND (p.embalado_em >= p.bipado_em)) THEN round((EXTRACT(epoch FROM (p.embalado_em - p.bipado_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_separacao_ate_embalagem,
        CASE
            WHEN ((p.faturado_em IS NOT NULL) AND (p.embalado_em IS NOT NULL) AND (p.faturado_em >= p.embalado_em)) THEN round((EXTRACT(epoch FROM (p.faturado_em - p.embalado_em)) / 60.0), 2)
            ELSE NULL::numeric
        END AS min_embalagem_ate_faturamento
   FROM (pedidos_b2c_indicadores p
     LEFT JOIN pedidos_b2c_grupos g ON ((g.id = p.grupo_id)));

create or replace view public.vw_assurant_b2b_item_timeline as
 WITH nf_numero AS (
         SELECT b2b_nfs.pedido_id,
            b2b_nfs.numero_nf,
            max(b2b_nfs.data_faturamento) FILTER (WHERE (COALESCE(b2b_nfs.status, ''::text) <> 'erro'::text)) AS faturado_em
           FROM b2b_nfs
          GROUP BY b2b_nfs.pedido_id, b2b_nfs.numero_nf
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
     JOIN b2b_pedidos p ON ((p.id = i.pedido_id)))
     LEFT JOIN nf_numero nfn ON (((nfn.pedido_id = i.pedido_id) AND (nfn.numero_nf = i.nf))))
     LEFT JOIN nf_pedido nfp ON ((nfp.pedido_id = i.pedido_id)));

create or replace view public.vw_assurant_etapas_semanais as
 WITH eventos AS (
         SELECT (date_trunc('week'::text, (t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS periodo_inicio,
            'B2C'::text AS canal,
            e.etapa,
            e.minutos
           FROM (vw_assurant_b2c_timeline t
             CROSS JOIN LATERAL ( VALUES ('Entrada pedido → Separação'::text,
                        CASE
                            WHEN ((t.separacao_conclusao_em IS NOT NULL) AND (t.separacao_conclusao_em >= t.pago_em)) THEN (EXTRACT(epoch FROM (t.separacao_conclusao_em - t.pago_em)) / 60.0)
                            ELSE NULL::numeric
                        END), ('Separação → Faturamento'::text,
                        CASE
                            WHEN ((t.faturamento_conclusao_em IS NOT NULL) AND (t.separacao_conclusao_em IS NOT NULL) AND (t.faturamento_conclusao_em >= t.separacao_conclusao_em)) THEN (EXTRACT(epoch FROM (t.faturamento_conclusao_em - t.separacao_conclusao_em)) / 60.0)
                            ELSE NULL::numeric
                        END)) e(etapa, minutos))
          WHERE ((t.pago_em IS NOT NULL) AND (e.minutos IS NOT NULL))
        UNION ALL
         SELECT (date_trunc('week'::text, (x.definicao_solicitada_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS date_trunc,
            'B2C'::text AS text,
            'Aguardando definição → Saída'::text AS text,
            (EXTRACT(epoch FROM (x.definicao_resolvido_em - x.definicao_solicitada_em)) / 60.0)
           FROM pedidos_b2c_indicadores x
          WHERE ((x.definicao_solicitada_em IS NOT NULL) AND (x.definicao_resolvido_em IS NOT NULL) AND (x.definicao_resolvido_em >= x.definicao_solicitada_em))
        UNION ALL
         SELECT (date_trunc('week'::text, (t.pedido_criado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS date_trunc,
            'B2B'::text AS text,
            e.etapa,
            e.minutos
           FROM (vw_assurant_b2b_item_timeline t
             CROSS JOIN LATERAL ( VALUES ('Entrada pedido → Separação'::text,t.min_pedido_ate_separacao), ('Separação → Embalagem'::text,t.min_separacao_ate_embalagem), ('Embalagem → Faturamento'::text,t.min_embalagem_ate_faturamento)) e(etapa, minutos))
          WHERE ((NOT t.eh_reparo_interno) AND (e.minutos IS NOT NULL))
        ), stats AS (
         SELECT eventos.periodo_inicio,
            eventos.canal,
            eventos.etapa,
            count(*) AS amostra,
            round(avg(eventos.minutos), 2) AS media_min,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((eventos.minutos)::double precision)))::numeric, 2) AS mediana_min,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((eventos.minutos)::double precision)))::numeric, 2) AS p90_min
           FROM eventos
          GROUP BY eventos.periodo_inicio, eventos.canal, eventos.etapa
        ), comp AS (
         SELECT s.periodo_inicio,
            s.canal,
            s.etapa,
            s.amostra,
            s.media_min,
            s.mediana_min,
            s.p90_min,
            lag(s.mediana_min) OVER (PARTITION BY s.canal, s.etapa ORDER BY s.periodo_inicio) AS mediana_anterior_min,
            lag(s.p90_min) OVER (PARTITION BY s.canal, s.etapa ORDER BY s.periodo_inicio) AS p90_anterior_min,
            lag(s.amostra) OVER (PARTITION BY s.canal, s.etapa ORDER BY s.periodo_inicio) AS amostra_anterior
           FROM stats s
        )
 SELECT periodo_inicio,
    canal,
    etapa,
    amostra,
    media_min,
    mediana_min,
    p90_min,
    mediana_anterior_min,
    p90_anterior_min,
    amostra_anterior,
        CASE
            WHEN (mediana_anterior_min > (0)::numeric) THEN round(((100.0 * (mediana_min - mediana_anterior_min)) / mediana_anterior_min), 2)
            ELSE NULL::numeric
        END AS variacao_mediana_pct,
        CASE
            WHEN (p90_anterior_min > (0)::numeric) THEN round(((100.0 * (p90_min - p90_anterior_min)) / p90_anterior_min), 2)
            ELSE NULL::numeric
        END AS variacao_p90_pct
   FROM comp;

create or replace view public.vw_assurant_operacao_dia as
 WITH eventos AS (
         SELECT (assurant_triagem_indicadores.data_recebimento)::date AS dia,
            (1)::bigint AS recebidos,
            (0)::bigint AS funcional,
            (0)::bigint AS cosmetica,
            (0)::bigint AS laudos,
            (0)::bigint AS oracle
           FROM assurant_triagem_indicadores
          WHERE (assurant_triagem_indicadores.data_recebimento IS NOT NULL)
        UNION ALL
         SELECT (assurant_triagem_indicadores.data_funcional)::date AS data_funcional,
            0,
            1,
            0,
            0,
            0
           FROM assurant_triagem_indicadores
          WHERE (assurant_triagem_indicadores.data_funcional IS NOT NULL)
        UNION ALL
         SELECT (assurant_triagem_indicadores.data_cosmetico)::date AS data_cosmetico,
            0,
            0,
            1,
            0,
            0
           FROM assurant_triagem_indicadores
          WHERE (assurant_triagem_indicadores.data_cosmetico IS NOT NULL)
        UNION ALL
         SELECT (assurant_triagem_indicadores.data_laudo)::date AS data_laudo,
            0,
            0,
            0,
            1,
            0
           FROM assurant_triagem_indicadores
          WHERE (assurant_triagem_indicadores.data_laudo IS NOT NULL)
        UNION ALL
         SELECT (COALESCE(assurant_triagem_indicadores.data_oracle, (assurant_triagem_indicadores.oracle_confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS "coalesce",
            0,
            0,
            0,
            0,
            1
           FROM assurant_triagem_indicadores
          WHERE (COALESCE(assurant_triagem_indicadores.data_oracle, (assurant_triagem_indicadores.oracle_confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text)) IS NOT NULL)
        )
 SELECT dia,
    (sum(recebidos))::bigint AS recebidos,
    (sum(funcional))::bigint AS funcional,
    (sum(cosmetica))::bigint AS cosmetica,
    (sum(laudos))::bigint AS laudos,
    (sum(oracle))::bigint AS oracle,
    (((sum(funcional) + sum(cosmetica)) + sum(laudos)))::bigint AS eventos_triagem
   FROM eventos
  GROUP BY dia;

create or replace view public.vw_assurant_estoque_detalhe_atual as
 SELECT e.imei,
    e.data_subinv,
        CASE
            WHEN (e.data_subinv IS NULL) THEN NULL::integer
            ELSE (CURRENT_DATE - e.data_subinv)
        END AS dias_estoque,
        CASE
            WHEN (e.data_subinv IS NULL) THEN 'Sem data'::text
            WHEN ((CURRENT_DATE - e.data_subinv) <= 30) THEN 'Até 30 dias'::text
            WHEN ((CURRENT_DATE - e.data_subinv) <= 60) THEN '31 a 60 dias'::text
            WHEN ((CURRENT_DATE - e.data_subinv) <= 90) THEN '61 a 90 dias'::text
            WHEN ((CURRENT_DATE - e.data_subinv) <= 180) THEN '91 a 180 dias'::text
            ELSE 'Mais de 180 dias'::text
        END AS faixa_aging,
    e.local_subinv,
    COALESCE(t.sku, w.wms_sku) AS sku,
    COALESCE(t.modelo, w.wms_modelo, c.modelo) AS modelo,
    COALESCE(c.marca, w.wms_marca) AS marca,
    COALESCE(t.grade, w.grade_venda, w.grade_fisica) AS grade,
    c.capacidade,
    c.cor,
    c.descricao,
    t.voucher,
    t.cliente,
    t.status_atual,
    t.data_recebimento,
    t.data_funcional,
    t.data_cosmetico,
    t.data_laudo,
    t.oracle_em,
    w.wms_status,
    w.confirmado_em AS wms_confirmado_em,
    w.rua,
    w.bloco,
    w.andar,
    w.coluna,
    w.linha,
        CASE
            WHEN (w.rua IS NULL) THEN NULL::text
            ELSE concat('RUA', w.rua, ' · B', w.bloco, ' · A', w.andar, ' · AP', COALESCE(w.coluna, ''::text), lpad(COALESCE((w.linha)::text, ''::text), 2, '0'::text))
        END AS endereco_wms
   FROM (((estoque_subinv_indicadores e
     LEFT JOIN LATERAL ( SELECT t1.sku,
            t1.modelo,
            t1.voucher,
            t1.cliente,
            COALESCE(NULLIF(TRIM(BOTH FROM t1.grade_cosmetica), ''::text), NULLIF(TRIM(BOTH FROM t1.grade), ''::text)) AS grade,
            t1.status_atual,
            t1.data_recebimento,
            t1.data_funcional,
            t1.data_cosmetico,
            t1.data_laudo,
            COALESCE(t1.oracle_confirmado_em, (t1.data_oracle AT TIME ZONE 'America/Sao_Paulo'::text)) AS oracle_em
           FROM assurant_triagem_indicadores t1
          WHERE ((t1.imei = e.imei) AND (t1.imei IS NOT NULL) AND (TRIM(BOTH FROM t1.imei) <> ''::text))
          ORDER BY COALESCE(t1.atualizado_em, t1.criado_em, t1.uploaded_at, t1.data_cosmetico, t1.data_funcional, t1.data_recebimento) DESC NULLS LAST
         LIMIT 1) t ON (true))
     LEFT JOIN LATERAL ( SELECT a.sku AS wms_sku,
            a.modelo AS wms_modelo,
            a.marca AS wms_marca,
            a.grade_venda,
            a.grade_fisica,
            a.tipo_produto,
            a.status AS wms_status,
            a.confirmado_em,
            we.rua,
            we.bloco,
            we.andar,
            we.coluna,
            we.linha
           FROM (wms_alocacoes_indicadores a
             LEFT JOIN wms_enderecos we ON ((we.id = a.endereco_id)))
          WHERE ((a.imei = e.imei) AND (a.status = 'confirmado'::text) AND (a.retirado_em IS NULL))
          ORDER BY a.confirmado_em DESC NULLS LAST, a.criado_em DESC
         LIMIT 1) w ON (true))
     LEFT JOIN LATERAL ( SELECT p.marca,
            p.modelo,
            p.capacidade,
            p.cor,
            p.descricao
           FROM produtos_catalogo p
          WHERE ((COALESCE(t.sku, w.wms_sku) IS NOT NULL) AND ((p.sku_als = COALESCE(t.sku, w.wms_sku)) OR (p.sku_oracle = COALESCE(t.sku, w.wms_sku))))
          ORDER BY p.ativo DESC NULLS LAST, p.data_cadastro DESC NULLS LAST
         LIMIT 1) c ON (true));

create or replace view liquida_private.esteira_tradein as select q.* from ( WITH trade AS (
         SELECT (g.voucher)::text AS chave,
            ('YBV'::text || (g.voucher)::text) AS voucher,
            COALESCE(NULLIF(g.imei, ''::text), h.imei_serial) AS imei,
            COALESCE(NULLIF(g.aparelho, ''::text), h.aparelho) AS modelo,
            COALESCE(NULLIF(g.rede, ''::text), h.rede) AS rede,
            COALESCE(NULLIF(g.loja, ''::text), h.loja) AS loja,
            COALESCE(liquida_private.tradein_data(g.inicio), h.inicio) AS inicio,
            COALESCE(liquida_private.tradein_data(g.aprovacao), h.aprovacao) AS aprovacao,
            g.status_atual AS status_tradein,
                CASE
                    WHEN (g.canceled IS NULL) THEN COALESCE(h.cancelado, false)
                    ELSE (upper(btrim(g.canceled)) = ANY (ARRAY['SIM'::text, 'TRUE'::text, '1'::text, 'YES'::text]))
                END AS cancelado
           FROM (tradein_geral g
             LEFT JOIN tradein_historico h ON ((h.voucher_key = (g.voucher)::text)))
        UNION ALL
         SELECT h.voucher_key,
            ('YBV'::text || h.voucher_key),
            h.imei_serial,
            h.aparelho,
            h.rede,
            h.loja,
            h.inicio,
            h.aprovacao,
            h.status_atual,
            COALESCE(h.cancelado, false) AS "coalesce"
           FROM tradein_historico h
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM tradein_geral g
                  WHERE ((g.voucher)::text = h.voucher_key))))
        ), etapas AS (
         SELECT g.chave,
            g.voucher,
            g.imei,
            g.modelo,
            g.rede,
            g.loja,
            g.inicio,
            g.aprovacao,
            g.status_tradein,
            g.cancelado,
            t.status_atual AS status_liquida,
            t.origem_triagem,
            (t.data_recebimento AT TIME ZONE 'UTC'::text) AS recebimento,
            (t.data_funcional AT TIME ZONE 'UTC'::text) AS funcional,
            (t.data_laudo AT TIME ZONE 'UTC'::text) AS laudo,
            (t.data_cosmetico AT TIME ZONE 'UTC'::text) AS cosmetica,
            LEAST(
                CASE
                    WHEN ((t.data_alocacao AT TIME ZONE 'UTC'::text) >= g.inicio) THEN (t.data_alocacao AT TIME ZONE 'UTC'::text)
                    ELSE NULL::timestamp with time zone
                END, w.armazenagem) AS armazenagem,
                CASE
                    WHEN (((t.data_alocacao AT TIME ZONE 'UTC'::text) >= g.inicio) AND ((w.armazenagem IS NULL) OR ((t.data_alocacao AT TIME ZONE 'UTC'::text) <= w.armazenagem))) THEN 'Histórico de alocação'::text
                    WHEN (w.armazenagem IS NOT NULL) THEN 'WMS confirmado'::text
                    ELSE NULL::text
                END AS fonte_armazenagem,
            COALESCE(t.oracle_confirmado_em, (t.data_oracle AT TIME ZONE 'UTC'::text)) AS oracle
           FROM ((trade g
             LEFT JOIN assurant_triagem t ON ((t.voucher = g.voucher)))
             LEFT JOIN LATERAL ( SELECT min(a.confirmado_em) AS armazenagem
                   FROM wms_alocacoes a
                  WHERE ((a.voucher = g.voucher) AND (a.confirmado_em >= g.inicio))) w ON (true))
        )
 SELECT chave,
    voucher,
    imei,
    modelo,
    rede,
    loja,
    inicio,
    aprovacao,
    status_tradein,
    cancelado,
    status_liquida,
    origem_triagem,
    recebimento,
    funcional,
    laudo,
    cosmetica,
    armazenagem,
    fonte_armazenagem,
    oracle,
        CASE
            WHEN cancelado THEN 'Cancelado'::text
            WHEN (armazenagem IS NOT NULL) THEN 'Armazenado'::text
            WHEN (cosmetica IS NOT NULL) THEN 'Aguardando armazenagem'::text
            WHEN (status_liquida ~~* '%laudo%'::text) THEN 'Aguardando laudo'::text
            WHEN (funcional IS NOT NULL) THEN 'Aguardando cosmética'::text
            WHEN (recebimento IS NOT NULL) THEN 'Aguardando funcional'::text
            ELSE 'Antes do recebimento'::text
        END AS etapa,
        CASE
            WHEN (armazenagem >= inicio) THEN (EXTRACT(epoch FROM (armazenagem - inicio)) / (86400)::numeric)
            ELSE NULL::numeric
        END AS prazo_total_dias,
        CASE
            WHEN (recebimento >= inicio) THEN (EXTRACT(epoch FROM (recebimento - inicio)) / (86400)::numeric)
            ELSE NULL::numeric
        END AS prazo_recebimento_dias,
        CASE
            WHEN (funcional >= recebimento) THEN (EXTRACT(epoch FROM (funcional - recebimento)) / (86400)::numeric)
            ELSE NULL::numeric
        END AS prazo_funcional_dias,
        CASE
            WHEN (cosmetica >= funcional) THEN (EXTRACT(epoch FROM (cosmetica - funcional)) / (86400)::numeric)
            ELSE NULL::numeric
        END AS prazo_cosmetica_dias,
        CASE
            WHEN (armazenagem >= cosmetica) THEN (EXTRACT(epoch FROM (armazenagem - cosmetica)) / (86400)::numeric)
            ELSE NULL::numeric
        END AS prazo_armazenagem_dias,
        CASE
            WHEN ((NOT cancelado) AND (armazenagem IS NULL) AND (inicio <= now())) THEN (EXTRACT(epoch FROM (now() - inicio)) / (86400)::numeric)
            ELSE NULL::numeric
        END AS aging_dias,
    (((recebimento < inicio) OR (funcional < recebimento) OR (cosmetica < funcional) OR (armazenagem < cosmetica)) IS TRUE) AS datas_inconsistentes
   FROM etapas e) q
   where not exists(select 1 from public.assurant_caixas_liberadas x where x.voucher=q.voucher or x.imei=q.imei or x.imei_identificado=q.imei);

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

create or replace view public.vw_assurant_leadtime_cockpit_atual_v2 as
 WITH parametros AS (
         SELECT (date_trunc('month'::text, (assurant_gestao_data_referencia())::timestamp without time zone))::date AS mes_atual,
            assurant_gestao_data_referencia() AS corte_operacional,
            ( SELECT (min((w.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS min
                   FROM wms_alocacoes_indicadores w
                  WHERE (w.confirmado_em IS NOT NULL)) AS baseline_wms_inicio
        ), periodos AS (
         SELECT p_1.mes_atual,
            p_1.corte_operacional,
            p_1.baseline_wms_inicio,
            ((p_1.mes_atual - '1 mon'::interval))::date AS mes_anterior,
            (p_1.corte_operacional + 1) AS atual_fim_exclusivo,
            (((p_1.mes_atual - '1 mon'::interval))::date + (EXTRACT(day FROM p_1.corte_operacional))::integer) AS anterior_fim_exclusivo
           FROM parametros p_1
        ), rf_atual_base AS (
         SELECT f_horas_uteis(a.data_recebimento, a.data_funcional) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_recebimento IS NOT NULL) AND (a.data_funcional IS NOT NULL) AND (a.data_funcional >= a.data_recebimento) AND (a.data_recebimento >= p_1.mes_atual) AND (a.data_recebimento < p_1.atual_fim_exclusivo) AND (a.data_funcional < p_1.atual_fim_exclusivo) AND (f_horas_uteis(a.data_recebimento, a.data_funcional) > (0)::numeric))
        ), rf_anterior_base AS (
         SELECT f_horas_uteis(a.data_recebimento, a.data_funcional) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_recebimento IS NOT NULL) AND (a.data_funcional IS NOT NULL) AND (a.data_funcional >= a.data_recebimento) AND (a.data_recebimento >= p_1.mes_anterior) AND (a.data_recebimento < p_1.anterior_fim_exclusivo) AND (a.data_funcional < p_1.anterior_fim_exclusivo) AND (f_horas_uteis(a.data_recebimento, a.data_funcional) > (0)::numeric))
        ), rf_atual AS (
         SELECT count(*) AS amostra,
            round(avg(rf_atual_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((rf_atual_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((rf_atual_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (rf_atual_base.horas < (1)::numeric)) AS prioridades_menor_1h,
            count(*) FILTER (WHERE (rf_atual_base.horas = (0)::numeric)) AS timestamps_simultaneos
           FROM rf_atual_base
        ), rf_anterior AS (
         SELECT count(*) AS amostra,
            round(avg(rf_anterior_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((rf_anterior_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((rf_anterior_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (rf_anterior_base.horas < (1)::numeric)) AS prioridades_menor_1h,
            count(*) FILTER (WHERE (rf_anterior_base.horas = (0)::numeric)) AS timestamps_simultaneos
           FROM rf_anterior_base
        ), fc_atual_base AS (
         SELECT (EXTRACT(epoch FROM (a.data_cosmetico - a.data_funcional)) / 3600.0) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_funcional IS NOT NULL) AND (a.data_cosmetico IS NOT NULL) AND (a.data_cosmetico >= a.data_funcional) AND (a.data_cosmetico >= p_1.mes_atual) AND (a.data_cosmetico < p_1.atual_fim_exclusivo))
        ), fc_anterior_base AS (
         SELECT (EXTRACT(epoch FROM (a.data_cosmetico - a.data_funcional)) / 3600.0) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_funcional IS NOT NULL) AND (a.data_cosmetico IS NOT NULL) AND (a.data_cosmetico >= a.data_funcional) AND (a.data_cosmetico >= p_1.mes_anterior) AND (a.data_cosmetico < p_1.anterior_fim_exclusivo))
        ), fc_atual AS (
         SELECT count(*) AS amostra,
            round(avg(fc_atual_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((fc_atual_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((fc_atual_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (fc_atual_base.horas < (1)::numeric)) AS abaixo_1h
           FROM fc_atual_base
        ), fc_anterior AS (
         SELECT count(*) AS amostra,
            round(avg(fc_anterior_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((fc_anterior_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((fc_anterior_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (fc_anterior_base.horas < (1)::numeric)) AS abaixo_1h
           FROM fc_anterior_base
        ), cosmetica_coorte AS (
         SELECT a.voucher,
            a.data_cosmetico
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.voucher IS NOT NULL) AND (a.data_cosmetico IS NOT NULL) AND (a.data_cosmetico >= p_1.mes_atual) AND (a.data_cosmetico < p_1.atual_fim_exclusivo))
        ), cosmetica_wms AS (
         SELECT c.voucher,
            c.data_cosmetico,
            w.confirmado_local,
            (EXTRACT(epoch FROM (w.confirmado_local - c.data_cosmetico)) / 3600.0) AS horas
           FROM (cosmetica_coorte c
             JOIN LATERAL ( SELECT min((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text)) AS confirmado_local
                   FROM wms_alocacoes_indicadores x
                  WHERE ((x.voucher = c.voucher) AND (x.confirmado_em IS NOT NULL) AND ((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text) >= c.data_cosmetico) AND (((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date <= assurant_gestao_data_referencia()))) w ON ((w.confirmado_local IS NOT NULL)))
        ), cw_stats AS (
         SELECT count(*) AS amostra,
            round(avg(cosmetica_wms.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((cosmetica_wms.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((cosmetica_wms.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (cosmetica_wms.horas <= (24)::numeric)) AS ate_24h,
            count(*) FILTER (WHERE (cosmetica_wms.horas <= (48)::numeric)) AS ate_48h,
            round(((100.0 * (count(*) FILTER (WHERE (cosmetica_wms.horas <= (48)::numeric)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS pct_ate_48h,
            count(*) FILTER (WHERE (cosmetica_wms.horas > (168)::numeric)) AS acima_7d,
            round(((100.0 * (count(*) FILTER (WHERE (cosmetica_wms.horas > (168)::numeric)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS pct_acima_7d
           FROM cosmetica_wms
        ), cw_pendentes AS (
         SELECT count(*) AS pendentes
           FROM cosmetica_coorte c
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM wms_alocacoes_indicadores x
                  WHERE ((x.voucher = c.voucher) AND (x.confirmado_em IS NOT NULL) AND ((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text) >= c.data_cosmetico) AND (((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date <= assurant_gestao_data_referencia())))))
        )
 SELECT p.mes_atual,
    p.mes_anterior,
    p.corte_operacional,
    p.baseline_wms_inicio,
    rfa.amostra AS receb_funcional_amostra_atual,
    rfp.amostra AS receb_funcional_amostra_anterior,
    rfa.media_h AS receb_funcional_media_atual_h,
    rfp.media_h AS receb_funcional_media_anterior_h,
    rfa.mediana_h AS receb_funcional_mediana_atual_h,
    rfp.mediana_h AS receb_funcional_mediana_anterior_h,
    rfa.p90_h AS receb_funcional_p90_atual_h,
    rfp.p90_h AS receb_funcional_p90_anterior_h,
    rfa.prioridades_menor_1h AS receb_funcional_prioridades_menor_1h,
    rfa.timestamps_simultaneos AS receb_funcional_timestamps_simultaneos,
        CASE
            WHEN (rfp.mediana_h > (0)::numeric) THEN round(((100.0 * (rfa.mediana_h - rfp.mediana_h)) / rfp.mediana_h), 2)
            ELSE NULL::numeric
        END AS receb_funcional_variacao_mediana_pct,
        CASE
            WHEN (rfp.media_h > (0)::numeric) THEN round(((100.0 * (rfa.media_h - rfp.media_h)) / rfp.media_h), 2)
            ELSE NULL::numeric
        END AS receb_funcional_variacao_media_pct,
        CASE
            WHEN (rfp.p90_h > (0)::numeric) THEN round(((100.0 * (rfa.p90_h - rfp.p90_h)) / rfp.p90_h), 2)
            ELSE NULL::numeric
        END AS receb_funcional_variacao_p90_pct,
    fca.amostra AS funcional_cosmetica_amostra_atual,
    fcp.amostra AS funcional_cosmetica_amostra_anterior,
    fca.media_h AS funcional_cosmetica_media_atual_h,
    fcp.media_h AS funcional_cosmetica_media_anterior_h,
    fca.mediana_h AS funcional_cosmetica_mediana_atual_h,
    fcp.mediana_h AS funcional_cosmetica_mediana_anterior_h,
    fca.p90_h AS funcional_cosmetica_p90_atual_h,
    fcp.p90_h AS funcional_cosmetica_p90_anterior_h,
    fca.abaixo_1h AS funcional_cosmetica_abaixo_1h,
        CASE
            WHEN (fcp.mediana_h > (0)::numeric) THEN round(((100.0 * (fca.mediana_h - fcp.mediana_h)) / fcp.mediana_h), 2)
            ELSE NULL::numeric
        END AS funcional_cosmetica_variacao_mediana_pct,
        CASE
            WHEN (fcp.media_h > (0)::numeric) THEN round(((100.0 * (fca.media_h - fcp.media_h)) / fcp.media_h), 2)
            ELSE NULL::numeric
        END AS funcional_cosmetica_variacao_media_pct,
        CASE
            WHEN (fcp.p90_h > (0)::numeric) THEN round(((100.0 * (fca.p90_h - fcp.p90_h)) / fcp.p90_h), 2)
            ELSE NULL::numeric
        END AS funcional_cosmetica_variacao_p90_pct,
    cws.amostra AS cosmetica_wms_amostra,
    cws.media_h AS cosmetica_wms_media_h,
    cws.mediana_h AS cosmetica_wms_mediana_h,
    cws.p90_h AS cosmetica_wms_p90_h,
    cws.ate_24h AS cosmetica_wms_ate_24h,
    cws.ate_48h AS cosmetica_wms_ate_48h,
    cws.pct_ate_48h AS cosmetica_wms_pct_ate_48h,
    cws.acima_7d AS cosmetica_wms_acima_7d,
    cws.pct_acima_7d AS cosmetica_wms_pct_acima_7d,
    cwp.pendentes AS cosmetica_wms_pendentes,
    false AS cosmetica_wms_comparavel_mes_anterior
   FROM ((((((periodos p
     CROSS JOIN rf_atual rfa)
     CROSS JOIN rf_anterior rfp)
     CROSS JOIN fc_atual fca)
     CROSS JOIN fc_anterior fcp)
     CROSS JOIN cw_stats cws)
     CROSS JOIN cw_pendentes cwp);

create or replace view public.vw_assurant_leadtime_cockpit_atual as
 WITH parametros AS (
         SELECT (date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS mes_atual,
            ( SELECT (max(a.data_funcional))::date AS max
                   FROM assurant_triagem_indicadores a
                  WHERE ((a.data_funcional >= date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text))) AND (a.data_funcional < (date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)) + '1 mon'::interval)))) AS corte_funcional,
            ( SELECT (max(a.data_cosmetico))::date AS max
                   FROM assurant_triagem_indicadores a
                  WHERE ((a.data_cosmetico >= date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text))) AND (a.data_cosmetico < (date_trunc('month'::text, (now() AT TIME ZONE 'America/Sao_Paulo'::text)) + '1 mon'::interval)))) AS corte_cosmetica,
            ( SELECT (min((w.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS min
                   FROM wms_alocacoes_indicadores w
                  WHERE (w.confirmado_em IS NOT NULL)) AS baseline_wms_inicio
        ), periodos AS (
         SELECT p_1.mes_atual,
            p_1.corte_funcional,
            p_1.corte_cosmetica,
            p_1.baseline_wms_inicio,
            ((p_1.mes_atual - '1 mon'::interval))::date AS mes_anterior,
            (p_1.corte_funcional + 1) AS funcional_fim_exclusivo,
            (((p_1.mes_atual - '1 mon'::interval))::date + (EXTRACT(day FROM p_1.corte_funcional))::integer) AS funcional_anterior_fim_exclusivo,
            (p_1.corte_cosmetica + 1) AS cosmetica_fim_exclusivo,
            (((p_1.mes_atual - '1 mon'::interval))::date + (EXTRACT(day FROM p_1.corte_cosmetica))::integer) AS cosmetica_anterior_fim_exclusivo
           FROM parametros p_1
        ), rf_atual_base AS (
         SELECT f_horas_uteis(a.data_recebimento, a.data_funcional) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_recebimento IS NOT NULL) AND (a.data_funcional IS NOT NULL) AND (a.data_funcional >= a.data_recebimento) AND (a.data_funcional >= p_1.mes_atual) AND (a.data_funcional < p_1.funcional_fim_exclusivo))
        ), rf_anterior_base AS (
         SELECT f_horas_uteis(a.data_recebimento, a.data_funcional) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_recebimento IS NOT NULL) AND (a.data_funcional IS NOT NULL) AND (a.data_funcional >= a.data_recebimento) AND (a.data_funcional >= p_1.mes_anterior) AND (a.data_funcional < p_1.funcional_anterior_fim_exclusivo))
        ), rf_atual AS (
         SELECT count(*) AS amostra,
            round(avg(rf_atual_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((rf_atual_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((rf_atual_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (rf_atual_base.horas < (1)::numeric)) AS prioridades_menor_1h,
            count(*) FILTER (WHERE (rf_atual_base.horas = (0)::numeric)) AS timestamps_simultaneos
           FROM rf_atual_base
        ), rf_anterior AS (
         SELECT count(*) AS amostra,
            round(avg(rf_anterior_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((rf_anterior_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((rf_anterior_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (rf_anterior_base.horas < (1)::numeric)) AS prioridades_menor_1h,
            count(*) FILTER (WHERE (rf_anterior_base.horas = (0)::numeric)) AS timestamps_simultaneos
           FROM rf_anterior_base
        ), fc_atual_base AS (
         SELECT (EXTRACT(epoch FROM (a.data_cosmetico - a.data_funcional)) / 3600.0) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_funcional IS NOT NULL) AND (a.data_cosmetico IS NOT NULL) AND (a.data_cosmetico >= a.data_funcional) AND (a.data_cosmetico >= p_1.mes_atual) AND (a.data_cosmetico < p_1.cosmetica_fim_exclusivo))
        ), fc_anterior_base AS (
         SELECT (EXTRACT(epoch FROM (a.data_cosmetico - a.data_funcional)) / 3600.0) AS horas
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.data_funcional IS NOT NULL) AND (a.data_cosmetico IS NOT NULL) AND (a.data_cosmetico >= a.data_funcional) AND (a.data_cosmetico >= p_1.mes_anterior) AND (a.data_cosmetico < p_1.cosmetica_anterior_fim_exclusivo))
        ), fc_atual AS (
         SELECT count(*) AS amostra,
            round(avg(fc_atual_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((fc_atual_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((fc_atual_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (fc_atual_base.horas < (1)::numeric)) AS abaixo_1h
           FROM fc_atual_base
        ), fc_anterior AS (
         SELECT count(*) AS amostra,
            round(avg(fc_anterior_base.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((fc_anterior_base.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((fc_anterior_base.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (fc_anterior_base.horas < (1)::numeric)) AS abaixo_1h
           FROM fc_anterior_base
        ), cosmetica_coorte AS (
         SELECT a.voucher,
            a.data_cosmetico
           FROM (assurant_triagem_indicadores a
             CROSS JOIN periodos p_1)
          WHERE ((a.voucher IS NOT NULL) AND (a.data_cosmetico IS NOT NULL) AND (a.data_cosmetico >= p_1.mes_atual) AND (a.data_cosmetico < p_1.cosmetica_fim_exclusivo))
        ), cosmetica_wms AS (
         SELECT c.voucher,
            c.data_cosmetico,
            w.confirmado_local,
            (EXTRACT(epoch FROM (w.confirmado_local - c.data_cosmetico)) / 3600.0) AS horas
           FROM (cosmetica_coorte c
             JOIN LATERAL ( SELECT min((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text)) AS confirmado_local
                   FROM wms_alocacoes_indicadores x
                  WHERE ((x.voucher = c.voucher) AND (x.confirmado_em IS NOT NULL) AND ((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text) >= c.data_cosmetico))) w ON ((w.confirmado_local IS NOT NULL)))
        ), cw_stats AS (
         SELECT count(*) AS amostra,
            round(avg(cosmetica_wms.horas), 2) AS media_h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((cosmetica_wms.horas)::double precision)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((cosmetica_wms.horas)::double precision)))::numeric, 2) AS p90_h,
            count(*) FILTER (WHERE (cosmetica_wms.horas <= (24)::numeric)) AS ate_24h,
            count(*) FILTER (WHERE (cosmetica_wms.horas <= (48)::numeric)) AS ate_48h,
            round(((100.0 * (count(*) FILTER (WHERE (cosmetica_wms.horas <= (48)::numeric)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS pct_ate_48h,
            count(*) FILTER (WHERE (cosmetica_wms.horas > (168)::numeric)) AS acima_7d,
            round(((100.0 * (count(*) FILTER (WHERE (cosmetica_wms.horas > (168)::numeric)))::numeric) / (NULLIF(count(*), 0))::numeric), 2) AS pct_acima_7d
           FROM cosmetica_wms
        ), cw_pendentes AS (
         SELECT count(*) AS pendentes
           FROM cosmetica_coorte c
          WHERE (NOT (EXISTS ( SELECT 1
                   FROM wms_alocacoes_indicadores x
                  WHERE ((x.voucher = c.voucher) AND (x.confirmado_em IS NOT NULL) AND ((x.confirmado_em AT TIME ZONE 'America/Sao_Paulo'::text) >= c.data_cosmetico)))))
        )
 SELECT p.mes_atual,
    p.mes_anterior,
    p.corte_funcional,
    p.corte_cosmetica,
    p.baseline_wms_inicio,
    rfa.amostra AS receb_funcional_amostra_atual,
    rfp.amostra AS receb_funcional_amostra_anterior,
    rfa.media_h AS receb_funcional_media_atual_h,
    rfp.media_h AS receb_funcional_media_anterior_h,
    rfa.mediana_h AS receb_funcional_mediana_atual_h,
    rfp.mediana_h AS receb_funcional_mediana_anterior_h,
    rfa.p90_h AS receb_funcional_p90_atual_h,
    rfp.p90_h AS receb_funcional_p90_anterior_h,
    rfa.prioridades_menor_1h AS receb_funcional_prioridades_menor_1h,
    rfa.timestamps_simultaneos AS receb_funcional_timestamps_simultaneos,
        CASE
            WHEN (rfp.mediana_h > (0)::numeric) THEN round(((100.0 * (rfa.mediana_h - rfp.mediana_h)) / rfp.mediana_h), 2)
            ELSE NULL::numeric
        END AS receb_funcional_variacao_mediana_pct,
        CASE
            WHEN (rfp.media_h > (0)::numeric) THEN round(((100.0 * (rfa.media_h - rfp.media_h)) / rfp.media_h), 2)
            ELSE NULL::numeric
        END AS receb_funcional_variacao_media_pct,
        CASE
            WHEN (rfp.p90_h > (0)::numeric) THEN round(((100.0 * (rfa.p90_h - rfp.p90_h)) / rfp.p90_h), 2)
            ELSE NULL::numeric
        END AS receb_funcional_variacao_p90_pct,
    fca.amostra AS funcional_cosmetica_amostra_atual,
    fcp.amostra AS funcional_cosmetica_amostra_anterior,
    fca.media_h AS funcional_cosmetica_media_atual_h,
    fcp.media_h AS funcional_cosmetica_media_anterior_h,
    fca.mediana_h AS funcional_cosmetica_mediana_atual_h,
    fcp.mediana_h AS funcional_cosmetica_mediana_anterior_h,
    fca.p90_h AS funcional_cosmetica_p90_atual_h,
    fcp.p90_h AS funcional_cosmetica_p90_anterior_h,
    fca.abaixo_1h AS funcional_cosmetica_abaixo_1h,
        CASE
            WHEN (fcp.mediana_h > (0)::numeric) THEN round(((100.0 * (fca.mediana_h - fcp.mediana_h)) / fcp.mediana_h), 2)
            ELSE NULL::numeric
        END AS funcional_cosmetica_variacao_mediana_pct,
        CASE
            WHEN (fcp.media_h > (0)::numeric) THEN round(((100.0 * (fca.media_h - fcp.media_h)) / fcp.media_h), 2)
            ELSE NULL::numeric
        END AS funcional_cosmetica_variacao_media_pct,
        CASE
            WHEN (fcp.p90_h > (0)::numeric) THEN round(((100.0 * (fca.p90_h - fcp.p90_h)) / fcp.p90_h), 2)
            ELSE NULL::numeric
        END AS funcional_cosmetica_variacao_p90_pct,
    cws.amostra AS cosmetica_wms_amostra,
    cws.media_h AS cosmetica_wms_media_h,
    cws.mediana_h AS cosmetica_wms_mediana_h,
    cws.p90_h AS cosmetica_wms_p90_h,
    cws.ate_24h AS cosmetica_wms_ate_24h,
    cws.ate_48h AS cosmetica_wms_ate_48h,
    cws.pct_ate_48h AS cosmetica_wms_pct_ate_48h,
    cws.acima_7d AS cosmetica_wms_acima_7d,
    cws.pct_acima_7d AS cosmetica_wms_pct_acima_7d,
    cwp.pendentes AS cosmetica_wms_pendentes,
    false AS cosmetica_wms_comparavel_mes_anterior
   FROM ((((((periodos p
     CROSS JOIN rf_atual rfa)
     CROSS JOIN rf_anterior rfp)
     CROSS JOIN fc_atual fca)
     CROSS JOIN fc_anterior fcp)
     CROSS JOIN cw_stats cws)
     CROSS JOIN cw_pendentes cwp);

create or replace view public.vw_assurant_etapas_comparativo_periodo_atual as
 WITH params AS (
         SELECT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date AS hoje
        ), periodos AS (
         SELECT 'ATUAL'::text AS periodo,
            (date_trunc('month'::text, (params.hoje)::timestamp with time zone))::date AS inicio,
            (params.hoje + 1) AS fim_exclusivo
           FROM params
        UNION ALL
         SELECT 'ANTERIOR'::text AS text,
            ((date_trunc('month'::text, (params.hoje)::timestamp with time zone) - '1 mon'::interval))::date AS date,
            (((date_trunc('month'::text, (params.hoje)::timestamp with time zone) - '1 mon'::interval))::date + (EXTRACT(day FROM params.hoje))::integer)
           FROM params
        ), eventos AS (
         SELECT p.periodo,
            'B2C'::text AS canal,
            e.etapa,
            e.minutos
           FROM ((periodos p
             JOIN vw_assurant_b2c_timeline t ON (((((t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio) AND (((t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text))::date < p.fim_exclusivo))))
             CROSS JOIN LATERAL ( VALUES ('Entrada pedido → Separação'::text,
                        CASE
                            WHEN ((t.separacao_conclusao_em IS NOT NULL) AND (t.separacao_conclusao_em >= t.pago_em)) THEN (EXTRACT(epoch FROM (t.separacao_conclusao_em - t.pago_em)) / 60.0)
                            ELSE NULL::numeric
                        END), ('Separação → Faturamento'::text,
                        CASE
                            WHEN ((t.faturamento_conclusao_em IS NOT NULL) AND (t.separacao_conclusao_em IS NOT NULL) AND (t.faturamento_conclusao_em >= t.separacao_conclusao_em)) THEN (EXTRACT(epoch FROM (t.faturamento_conclusao_em - t.separacao_conclusao_em)) / 60.0)
                            ELSE NULL::numeric
                        END)) e(etapa, minutos))
          WHERE (e.minutos IS NOT NULL)
        UNION ALL
         SELECT p.periodo,
            'B2C'::text AS text,
            'Aguardando definição → Saída'::text AS text,
            (EXTRACT(epoch FROM (x.definicao_resolvido_em - x.definicao_solicitada_em)) / 60.0)
           FROM (periodos p
             JOIN pedidos_b2c_indicadores x ON (((((x.definicao_solicitada_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio) AND (((x.definicao_solicitada_em AT TIME ZONE 'America/Sao_Paulo'::text))::date < p.fim_exclusivo))))
          WHERE ((x.definicao_resolvido_em IS NOT NULL) AND (x.definicao_resolvido_em >= x.definicao_solicitada_em))
        UNION ALL
         SELECT p.periodo,
            'B2B'::text AS text,
            e.etapa,
            e.minutos
           FROM ((periodos p
             JOIN vw_assurant_b2b_item_timeline t ON (((((t.pedido_criado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio) AND (((t.pedido_criado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date < p.fim_exclusivo))))
             CROSS JOIN LATERAL ( VALUES ('Entrada pedido → Separação'::text,t.min_pedido_ate_separacao), ('Separação → Embalagem'::text,t.min_separacao_ate_embalagem), ('Embalagem → Faturamento'::text,t.min_embalagem_ate_faturamento)) e(etapa, minutos))
          WHERE ((NOT t.eh_reparo_interno) AND (e.minutos IS NOT NULL))
        ), stats AS (
         SELECT eventos.periodo,
            eventos.canal,
            eventos.etapa,
            count(*) AS amostra,
            round(avg(eventos.minutos), 2) AS media_min,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((eventos.minutos)::double precision)))::numeric, 2) AS mediana_min,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((eventos.minutos)::double precision)))::numeric, 2) AS p90_min
           FROM eventos
          GROUP BY eventos.periodo, eventos.canal, eventos.etapa
        ), keys AS (
         SELECT DISTINCT stats.canal,
            stats.etapa
           FROM stats
        ), a AS (
         SELECT stats.periodo,
            stats.canal,
            stats.etapa,
            stats.amostra,
            stats.media_min,
            stats.mediana_min,
            stats.p90_min
           FROM stats
          WHERE (stats.periodo = 'ATUAL'::text)
        ), b AS (
         SELECT stats.periodo,
            stats.canal,
            stats.etapa,
            stats.amostra,
            stats.media_min,
            stats.mediana_min,
            stats.p90_min
           FROM stats
          WHERE (stats.periodo = 'ANTERIOR'::text)
        )
 SELECT k.canal,
    k.etapa,
    a.amostra AS amostra_atual,
    b.amostra AS amostra_anterior,
    a.media_min AS media_atual_min,
    b.media_min AS media_anterior_min,
    a.mediana_min AS mediana_atual_min,
    b.mediana_min AS mediana_anterior_min,
        CASE
            WHEN (b.mediana_min > (0)::numeric) THEN round(((100.0 * (a.mediana_min - b.mediana_min)) / b.mediana_min), 2)
            ELSE NULL::numeric
        END AS variacao_mediana_pct,
    a.p90_min AS p90_atual_min,
    b.p90_min AS p90_anterior_min
   FROM ((keys k
     LEFT JOIN a USING (canal, etapa))
     LEFT JOIN b USING (canal, etapa));

create or replace view liquida_private.fechamento_lojas as select q.* from ( SELECT t.id,
    t.voucher,
    t.imei,
    t.sku,
    t.modelo,
    t.grade,
    t.status_atual,
    t.origem_triagem,
        CASE
            WHEN (t.status_atual = ANY (ARRAY['Aguardando triagem cosmética'::text, 'Aguardando triagem cosmetica'::text, 'Aguardando cosmética'::text, 'Aguardando cosmetica'::text])) THEN 'aguardando'::text
            WHEN (t.data_cosmetico IS NOT NULL) THEN 'concluida'::text
            ELSE 'fora_fila'::text
        END AS situacao,
    (t.data_funcional AT TIME ZONE 'UTC'::text) AS data_funcional,
    (t.data_cosmetico AT TIME ZONE 'UTC'::text) AS data_cosmetico,
    COALESCE((t.data_laudo AT TIME ZONE 'UTC'::text), l.criado_em, ga.data_laudo) AS data_laudo,
    ((t.data_laudo IS NOT NULL) OR (l.id IS NOT NULL) OR (ga.data_laudo IS NOT NULL)) AS tem_laudo,
    NULLIF(concat_ws('; '::text, NULLIF(l.motivo, ''::text), NULLIF(l.defeitos, ''::text), NULLIF(t.defeitos_adicionais, ''::text)), ''::text) AS motivo_divergencia,
    COALESCE(l.pdf_path,
        CASE
            WHEN ((l.id IS NULL) AND ((ga.data_laudo IS NOT NULL) OR ((t.origem_triagem = 'gaia'::text) AND (t.data_laudo IS NOT NULL))) AND (t.voucher ~ '^YBV[0-9]+$'::text)) THEN (('https://s3.sa-east-1.amazonaws.com/xpcell.s3.centercell.com.br/report/'::text || t.voucher) || '-report.pdf'::text)
            ELSE NULL::text
        END) AS laudo_url,
    COALESCE(NULLIF(g.codigo_loja, ''::text), h.codigo_loja) AS codigo_loja,
    COALESCE(NULLIF(g.loja, ''::text), h.loja, t.loja) AS loja,
    g.uf,
    COALESCE(NULLIF(g.rede, ''::text), h.rede, t.rede) AS rede,
    COALESCE(liquida_private.tradein_data(g.inicio), h.inicio) AS data_tradein,
    COALESCE(NULLIF(g.nome_vendedor, ''::text), h.nome_vendedor) AS vendedor,
    u.nome AS usuario,
    COALESCE(NULLIF(g.marca, ''::text), h.marca) AS marca,
    COALESCE(NULLIF(g.aparelho, ''::text), h.aparelho, t.modelo) AS produto,
    COALESCE(NULLIF(g.produto_comprado, ''::text), h.produto_comprado) AS novo_aparelho,
    COALESCE(NULLIF(g.cliente, ''::text), t.cliente) AS cliente,
    g.cpf AS cpf_cnpj,
    COALESCE(NULLIF(g.condicao_aparelho, ''::text), h.condicao_aparelho, t.condicao) AS condicao,
    COALESCE(g.valor_total_pagar, h.valor_total_pagar) AS total,
    COALESCE(g.valor_total_pagar, h.valor_total_pagar) AS preco_real,
    COALESCE(NULLIF(g.nome_campanha, ''::text), h.nome_campanha) AS campanha,
    COALESCE(g.valor_campanha, h.valor_campanha) AS valor_campanha,
    ((g.voucher IS NULL) AND (h.id IS NULL)) AS sem_tradein,
    l.id AS laudo_id
   FROM (((((assurant_triagem t
     LEFT JOIN tradein_geral g ON ((g.voucher_ybv = t.voucher)))
     LEFT JOIN tradein_historico h ON ((h.voucher_key =
        CASE
            WHEN (t.voucher ~ '^YBV[0-9]+$'::text) THEN SUBSTRING(t.voucher FROM 4)
            ELSE NULL::text
        END)))
     LEFT JOIN assurant_gaia_ultimo ga ON ((ga.voucher = t.voucher)))
     LEFT JOIN user_profiles u ON ((u.id = t.funcional_por)))
     LEFT JOIN LATERAL ( SELECT l_1.id,
            l_1.motivo,
            l_1.defeitos,
            l_1.pdf_path,
            l_1.criado_em
           FROM triagem_laudos l_1
          WHERE (l_1.voucher = t.voucher)
          ORDER BY l_1.criado_em DESC, l_1.id
         LIMIT 1) l ON (true))
  WHERE ((l.id IS NOT NULL) OR (t.data_cosmetico IS NOT NULL) OR (t.status_atual = ANY (ARRAY['Aguardando triagem cosmética'::text, 'Aguardando triagem cosmetica'::text, 'Aguardando cosmética'::text, 'Aguardando cosmetica'::text])))) q
   where not exists(select 1 from public.assurant_caixas_liberadas x where x.voucher=q.voucher or x.imei=q.imei or x.imei_identificado=q.imei);

create view liquida_private.producao_caixas_exclusoes as
 select 'assurant_triagem'::text fonte,t.voucher::text fonte_id from public.assurant_triagem t join public.assurant_caixas_liberadas x on x.triagem_id=t.id
 union select 'assurant_triagem',t.id::text from public.assurant_triagem t join public.assurant_caixas_liberadas x on x.triagem_id=t.id
 union select 'wms_alocacoes',t.id::text from public.wms_alocacoes t join public.assurant_caixas_liberadas x on x.voucher=t.voucher or x.imei=t.imei or x.imei_identificado=t.imei
 union select 'recebimento_vouchers',t.id::text from public.recebimento_vouchers t join public.assurant_caixas_liberadas x on x.voucher=t.voucher
 union select 'pedidos_b2c',t.id::text from public.pedidos_b2c t join public.assurant_caixas_liberadas x on x.imei=coalesce(nullif(t.imei_bipado,''),t.imei_alocado) or x.imei_identificado=coalesce(nullif(t.imei_bipado,''),t.imei_alocado)
 union select 'b2b_itens',t.id::text from public.b2b_itens t join public.assurant_caixas_liberadas x on x.imei=coalesce(nullif(t.imei_bipado,''),t.imei) or x.imei_identificado=coalesce(nullif(t.imei_bipado,''),t.imei) or x.voucher=t.voucher;
revoke all on liquida_private.producao_caixas_exclusoes from public,anon,authenticated;

create or replace view liquida_private.producao_base as select q.* from ( SELECT 'recebimento_vouchers'::text AS fonte,
    (t.id)::text AS fonte_id,
    'recebimento'::text AS etapa,
    t.bipado_em AS realizado_em,
    t.bipado_por AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM recebimento_vouchers_indicadores t
  WHERE (t.bipado_em IS NOT NULL)
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'recebimento'::text AS etapa,
    (t.data_recebimento AT TIME ZONE 'UTC'::text) AS realizado_em,
    NULL::uuid AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE ((t.data_recebimento IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM recebimento_vouchers_indicadores rv
          WHERE (rv.voucher = t.voucher)))))
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'funcional'::text AS etapa,
    (t.data_funcional AT TIME ZONE 'UTC'::text) AS realizado_em,
    t.funcional_por AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    (EXISTS ( SELECT 1
           FROM assurant_rastreabilidade_ajustes a
          WHERE ((a.campo = 'triagem_funcional.revisao'::text) AND (((a.valor_novo)::jsonb ->> 'voucher'::text) = t.voucher) AND ((((a.valor_novo)::jsonb ->> 'data_funcional'::text))::timestamp without time zone = t.data_funcional)))) AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE (t.data_funcional IS NOT NULL)
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'laudo'::text AS etapa,
    (t.data_laudo AT TIME ZONE 'UTC'::text) AS realizado_em,
    t.laudo_por AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE (t.data_laudo IS NOT NULL)
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'cosmetica'::text AS etapa,
    (t.data_cosmetico AT TIME ZONE 'UTC'::text) AS realizado_em,
    t.cosmetico_por AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE (t.data_cosmetico IS NOT NULL)
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'armazenagem'::text AS etapa,
    (t.data_alocacao AT TIME ZONE 'UTC'::text) AS realizado_em,
    NULL::uuid AS colaborador_id,
    1 AS quantidade,
    'Estoque'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE ((t.data_alocacao IS NOT NULL) AND (NOT (EXISTS ( SELECT 1
           FROM wms_alocacoes_indicadores a
          WHERE ((a.voucher = t.voucher) AND (a.confirmado_em IS NOT NULL))))))
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'oracle'::text AS etapa,
    t.oracle_confirmado_em AS realizado_em,
    t.oracle_confirmado_por AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE (t.oracle_confirmado_em IS NOT NULL)
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    COALESCE(NULLIF(t.voucher, ''::text), (t.id)::text) AS fonte_id,
    'oracle'::text AS etapa,
    (t.data_oracle AT TIME ZONE 'UTC'::text) AS realizado_em,
    NULL::uuid AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM assurant_triagem_indicadores t
  WHERE ((t.data_oracle IS NOT NULL) AND (t.oracle_confirmado_em IS NULL))
UNION ALL
 SELECT 'wms_alocacoes'::text AS fonte,
    (t.id)::text AS fonte_id,
    'armazenagem'::text AS etapa,
    t.confirmado_em AS realizado_em,
    t.confirmado_por AS colaborador_id,
    1 AS quantidade,
    'Estoque'::text AS canal,
    'aparelhos'::text AS unidade,
    t.voucher AS referencia,
    false AS retrabalho
   FROM wms_alocacoes_indicadores t
  WHERE (t.confirmado_em IS NOT NULL)
UNION ALL
 SELECT 'pedidos_b2c'::text AS fonte,
    (t.id)::text AS fonte_id,
    'picking_b2c'::text AS etapa,
    t.bipado_em AS realizado_em,
    t.bipado_por AS colaborador_id,
    1 AS quantidade,
    'B2C'::text AS canal,
    'itens'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM pedidos_b2c_indicadores t
  WHERE (t.bipado_em IS NOT NULL)
UNION ALL
 SELECT 'pedidos_b2c'::text AS fonte,
    (t.id)::text AS fonte_id,
    'embalagem_b2c'::text AS etapa,
    t.embalado_em AS realizado_em,
    t.embalado_por AS colaborador_id,
    1 AS quantidade,
    'B2C'::text AS canal,
    'itens'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM pedidos_b2c_indicadores t
  WHERE (t.embalado_em IS NOT NULL)
UNION ALL
 SELECT 'pedidos_b2c'::text AS fonte,
    (t.id)::text AS fonte_id,
    'faturamento_b2c'::text AS etapa,
    t.faturado_em AS realizado_em,
    t.faturado_por AS colaborador_id,
    1 AS quantidade,
    'B2C'::text AS canal,
    'itens'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM pedidos_b2c_indicadores t
  WHERE (t.faturado_em IS NOT NULL)
UNION ALL
 SELECT 'b2b_itens'::text AS fonte,
    (t.id)::text AS fonte_id,
    'picking_b2b'::text AS etapa,
    (t.bipado_em AT TIME ZONE 'UTC'::text) AS realizado_em,
    t.bipado_por AS colaborador_id,
    1 AS quantidade,
    'B2B'::text AS canal,
    'itens'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM b2b_itens_indicadores t
  WHERE (t.bipado_em IS NOT NULL)
UNION ALL
 SELECT 'b2b_itens'::text AS fonte,
    (t.id)::text AS fonte_id,
    'embalagem_b2b'::text AS etapa,
    (t.embalado_em AT TIME ZONE 'UTC'::text) AS realizado_em,
    t.embalado_por AS colaborador_id,
    1 AS quantidade,
    'B2B'::text AS canal,
    'itens'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM b2b_itens_indicadores t
  WHERE (t.embalado_em IS NOT NULL)
UNION ALL
 SELECT 'b2b_nfs'::text AS fonte,
    (t.id)::text AS fonte_id,
    'faturamento_b2b'::text AS etapa,
    t.data_faturamento AS realizado_em,
    NULL::uuid AS colaborador_id,
    GREATEST(COALESCE(t.total_itens, 0), 0) AS quantidade,
    'B2B'::text AS canal,
    'itens'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM b2b_nfs t
  WHERE ((t.data_faturamento IS NOT NULL) AND (COALESCE(t.status, ''::text) <> 'erro'::text))
UNION ALL
 SELECT 'meli_validacoes'::text AS fonte,
    (t.id)::text AS fonte_id,
    'validacao_meli'::text AS etapa,
    t.criado_em AS realizado_em,
    t.operador_id AS colaborador_id,
    1 AS quantidade,
    'B2C'::text AS canal,
    'aparelhos'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM meli_validacoes t
  WHERE (t.criado_em IS NOT NULL)
UNION ALL
 SELECT 'romaneio_itens'::text AS fonte,
    (t.id)::text AS fonte_id,
    'expedicao'::text AS etapa,
    t.bipado_em AS realizado_em,
    t.bipado_por AS colaborador_id,
    1 AS quantidade,
    'B2C'::text AS canal,
    'volumes'::text AS unidade,
    (t.id)::text AS referencia,
    false AS retrabalho
   FROM romaneio_itens t
  WHERE (t.bipado_em IS NOT NULL)
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    ((a.valor_anterior)::jsonb ->> 'voucher'::text) AS fonte_id,
    'funcional'::text AS etapa,
    ((((a.valor_anterior)::jsonb ->> 'data_funcional'::text))::timestamp without time zone AT TIME ZONE 'UTC'::text) AS realizado_em,
    (NULLIF(((a.valor_anterior)::jsonb ->> 'funcional_por'::text), ''::text))::uuid AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    ((a.valor_anterior)::jsonb ->> 'voucher'::text) AS referencia,
    (EXISTS ( SELECT 1
           FROM assurant_rastreabilidade_ajustes b
          WHERE ((b.campo = 'triagem_funcional.revisao'::text) AND (((b.valor_novo)::jsonb ->> 'voucher'::text) = ((a.valor_anterior)::jsonb ->> 'voucher'::text)) AND (((b.valor_novo)::jsonb ->> 'data_funcional'::text) = ((a.valor_anterior)::jsonb ->> 'data_funcional'::text))))) AS retrabalho
   FROM assurant_rastreabilidade_ajustes a
  WHERE ((a.campo = 'triagem_funcional.revisao'::text) AND (NULLIF(((a.valor_anterior)::jsonb ->> 'data_funcional'::text), ''::text) IS NOT NULL))
UNION ALL
 SELECT 'assurant_triagem'::text AS fonte,
    ((a.valor_novo)::jsonb ->> 'voucher'::text) AS fonte_id,
    'funcional'::text AS etapa,
    ((((a.valor_novo)::jsonb ->> 'data_funcional'::text))::timestamp without time zone AT TIME ZONE 'UTC'::text) AS realizado_em,
    (NULLIF(((a.valor_novo)::jsonb ->> 'funcional_por'::text), ''::text))::uuid AS colaborador_id,
    1 AS quantidade,
    'Trade-in'::text AS canal,
    'aparelhos'::text AS unidade,
    ((a.valor_novo)::jsonb ->> 'voucher'::text) AS referencia,
    true AS retrabalho
   FROM assurant_rastreabilidade_ajustes a
  WHERE ((a.campo = 'triagem_funcional.revisao'::text) AND (NULLIF(((a.valor_novo)::jsonb ->> 'data_funcional'::text), ''::text) IS NOT NULL))
UNION ALL
 SELECT e.fonte,
    e.fonte_id,
    e.etapa,
    e.realizado_em,
    e.colaborador_id,
    e.quantidade,
    e.canal,
    e.unidade,
    e.referencia,
    e.retrabalho
   FROM liquida_private.producao_eventos e
  WHERE (NOT ((e.fonte = 'assurant_triagem'::text) AND (((e.etapa = 'recebimento'::text) AND (EXISTS ( SELECT 1
           FROM recebimento_vouchers_indicadores r
          WHERE (r.voucher = e.fonte_id)))) OR ((e.etapa = 'armazenagem'::text) AND (EXISTS ( SELECT 1
           FROM wms_alocacoes_indicadores a
          WHERE ((a.voucher = e.fonte_id) AND (a.confirmado_em IS NOT NULL))))) OR ((e.etapa = 'oracle'::text) AND (EXISTS ( SELECT 1
           FROM assurant_triagem_indicadores t
          WHERE ((t.voucher = e.fonte_id) AND (t.oracle_confirmado_em IS NOT NULL) AND (e.realizado_em = (t.data_oracle AT TIME ZONE 'UTC'::text)) AND (e.realizado_em <> t.oracle_confirmado_em))))))))) q
 where not exists(select 1 from liquida_private.producao_caixas_exclusoes x where x.fonte=q.fonte and x.fonte_id=q.fonte_id);

CREATE OR REPLACE FUNCTION public.assurant_sla_volume_etapas(meses text[])
 RETURNS TABLE(etapa text, total bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select etapa, count(*) as total
  from assurant_movimentacao_indicadores
  where to_char(data_etapa, 'YYYY-MM') = any(meses)
  group by etapa
  order by total desc;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_sla_usuarios(meses text[])
 RETURNS TABLE(usuario text, etapa text, total bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select usuario, etapa, count(*) as total
  from assurant_movimentacao_indicadores
  where to_char(data_etapa, 'YYYY-MM') = any(meses)
    and usuario is not null
  group by usuario, etapa
  order by total desc;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_sla_etapas(meses text[])
 RETURNS TABLE(etapa text, total bigint, primeiro_mes text, ultimo_mes text)
 LANGUAGE sql
AS $function$
  select
    etapa,
    count(*)                                    as total,
    to_char(min(data_etapa), 'YYYY-MM')         as primeiro_mes,
    to_char(max(data_etapa), 'YYYY-MM')         as ultimo_mes
  from assurant_movimentacao_indicadores
  where to_char(data_etapa, 'YYYY-MM') = any(meses)
  group by etapa
  order by total desc;
$function$;

CREATE OR REPLACE FUNCTION liquida_private.relatorio_estoque_consultar(p_data_inicial date DEFAULT NULL::date, p_data_final date DEFAULT NULL::date, p_data_referencia text DEFAULT 'recebimento'::text, p_status text DEFAULT ''::text, p_grade text DEFAULT ''::text, p_rede text DEFAULT ''::text, p_busca text DEFAULT ''::text, p_offset integer DEFAULT 0, p_limite integer DEFAULT 100, p_resumo boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
 SET jit TO 'off'
 SET plan_cache_mode TO 'force_custom_plan'
AS $function$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/relatorio-estoque'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Relatório de Estoque' using errcode='42501';
 end if;
 if coalesce(p_data_referencia,'') not in ('recebimento','funcional','cosmetica','laudo','alocacao','oracle','criacao','atualizacao') then raise exception 'Referência de período inválida';end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then raise exception 'A data inicial deve ser anterior ou igual à final';end if;
 with alocacoes as materialized (
  select distinct on (a.imei,upper(trim(a.voucher))) a.imei,upper(trim(a.voucher)) as voucher,a.confirmado_em
  from public.wms_alocacoes_indicadores a join public.wms_enderecos e on e.id=a.endereco_id
  where p_data_referencia='alocacao' and a.status='confirmado' and a.retirado_em is null
  order by a.imei,upper(trim(a.voucher)),a.confirmado_em desc nulls last,a.criado_em desc,a.id
 ), source as materialized (
  select t.id,t.voucher,t.status_atual,t.grade,t.rede,t.data_funcional,t.data_cosmetico,t.data_oracle,
   case p_data_referencia when 'recebimento' then t.data_recebimento when 'funcional' then t.data_funcional when 'cosmetica' then t.data_cosmetico when 'laudo' then t.data_laudo when 'alocacao' then coalesce(a.confirmado_em at time zone 'UTC',t.data_alocacao) when 'oracle' then t.data_oracle when 'criacao' then t.criado_em when 'atualizacao' then t.atualizado_em end as data_ref,
   case when coalesce(p_busca,'')<>'' then concat_ws(' ',t.voucher,t.imei,t.sku,t.modelo,t.cliente,t.loja,t.local) end as busca
  from public.assurant_triagem_indicadores t left join alocacoes a on a.imei=t.imei and a.voucher=upper(trim(t.voucher))
  where (p_data_inicial is null or (case p_data_referencia when 'recebimento' then t.data_recebimento when 'funcional' then t.data_funcional when 'cosmetica' then t.data_cosmetico when 'laudo' then t.data_laudo when 'alocacao' then coalesce(a.confirmado_em at time zone 'UTC',t.data_alocacao) when 'oracle' then t.data_oracle when 'criacao' then t.criado_em when 'atualizacao' then t.atualizado_em end)>=((p_data_inicial::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC'))
   and (p_data_final is null or (case p_data_referencia when 'recebimento' then t.data_recebimento when 'funcional' then t.data_funcional when 'cosmetica' then t.data_cosmetico when 'laudo' then t.data_laudo when 'alocacao' then coalesce(a.confirmado_em at time zone 'UTC',t.data_alocacao) when 'oracle' then t.data_oracle when 'criacao' then t.criado_em when 'atualizacao' then t.atualizado_em end)<(((p_data_final+1)::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC'))
 ), base as not materialized (
  select * from source
  where (coalesce(p_status,'')='' or status_atual=p_status)
   and (coalesce(p_grade,'')='' or upper(trim(coalesce(grade,'')))=upper(trim(p_grade)))
   and (coalesce(p_rede,'')='' or rede=p_rede)
   and (coalesce(p_busca,'')='' or busca ilike '%'||p_busca||'%')
 ), resumo as (
  select count(*) as total,count(*) filter(where data_funcional is not null) as funcional,
   count(*) filter(where data_cosmetico is not null) as cosmetica,count(*) filter(where data_oracle is not null) as oracle from base
 ), pagina as materialized (
  select id,voucher,data_ref from base order by data_ref desc nulls last,voucher,id
   limit least(5000,greatest(1,coalesce(p_limite,100))) offset greatest(0,coalesce(p_offset,0))
 ), detalhes as (
  select t.id,t.voucher,t.imei,t.sku,t.modelo,
   coalesce(w.local,nullif(trim(t.local),'')) as local,
   t.cliente,t.loja,t.rede,t.tipo_de_rede,t.lote,t.status_atual,t.condicao,t.triagem_funcional,t.grade,
   t.criado_em at time zone 'UTC' as criado_em,t.atualizado_em at time zone 'UTC' as atualizado_em,
   t.tela,t.laterais,t.traseira,t.defeitos_adicionais,t.resultado_triagem_funcional,
   t.data_recebimento at time zone 'UTC' as data_recebimento,t.data_funcional at time zone 'UTC' as data_funcional,
   t.data_cosmetico at time zone 'UTC' as data_cosmetico,t.data_laudo at time zone 'UTC' as data_laudo,
   coalesce(w.confirmado_em,t.data_alocacao at time zone 'UTC') as data_alocacao,
   t.data_oracle at time zone 'UTC' as data_oracle,
   t.respostas_funcional,t.status_bateria,t.reanalise,t.aging,
   p.data_ref as ordem_data,t.origem_triagem
  from pagina p join public.assurant_triagem_indicadores t on t.id=p.id
  left join lateral (
   select a.confirmado_em,
    'RUA '||e.rua||'/BL'||lpad(e.bloco::text,2,'0')||'/AD'||lpad(e.andar::text,2,'0')||'/AP '||e.coluna||lpad(e.linha::text,2,'0') as local
   from public.wms_alocacoes_indicadores a join public.wms_enderecos e on e.id=a.endereco_id
   where a.imei=t.imei and upper(trim(a.voucher))=upper(trim(t.voucher)) and a.status='confirmado' and a.retirado_em is null
   order by a.confirmado_em desc nulls last,a.criado_em desc,a.id limit 1
  ) w on true
 )
 select jsonb_build_object(
  'resumo',case when p_resumo then (select to_jsonb(r) from resumo r) else null end,
  'filtros',case when p_resumo then jsonb_build_object(
   'status',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct status_atual as x from source where nullif(trim(status_atual),'') is not null) f),
   'grades',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct upper(trim(grade)) as x from source where nullif(trim(grade),'') is not null) f),
   'redes',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct rede as x from source where nullif(trim(rede),'') is not null) f)
  ) else null end,
  'itens',(select coalesce(jsonb_agg(to_jsonb(d)-'ordem_data' order by d.ordem_data desc nulls last,d.voucher,d.id),'[]'::jsonb) from detalhes d),
  'consultado_em',now()
 ) into v;
 return v;
end $function$;

CREATE OR REPLACE FUNCTION public.assurant_sla_funil(meses text[])
 RETURNS TABLE(de_etapa text, para_etapa text, media_horas numeric, total bigint)
 LANGUAGE sql
AS $function$
  with eventos as (
    select
      voucher,
      etapa,
      data_etapa,
      lead(etapa)      over (partition by voucher order by data_etapa) as prox_etapa,
      lead(data_etapa) over (partition by voucher order by data_etapa) as prox_data
    from assurant_movimentacao_indicadores
    where to_char(data_etapa, 'YYYY-MM') = any(meses)
  )
  select
    etapa                                                          as de_etapa,
    prox_etapa                                                     as para_etapa,
    round(avg(extract(epoch from (prox_data - data_etapa))/3600), 1) as media_horas,
    count(*)                                                       as total
  from eventos
  where prox_etapa is not null
  group by etapa, prox_etapa
  having count(*) > 10
  order by total desc
  limit 20;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_sla_tempo_etapas(meses text[])
 RETURNS TABLE(etapa text, prox_etapa text, media_horas numeric, media_dias numeric, total bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  with eventos as (
    select
      voucher,
      etapa,
      data_etapa,
      lead(etapa)      over (partition by voucher order by data_etapa) as prox_etapa,
      lead(data_etapa) over (partition by voucher order by data_etapa) as prox_data
    from assurant_movimentacao_indicadores
    where to_char(data_etapa, 'YYYY-MM') = any(meses)
      and data_etapa is not null
  )
  select
    etapa,
    prox_etapa,
    round(avg(extract(epoch from (prox_data - data_etapa))/3600), 1)    as media_horas,
    round(avg(extract(epoch from (prox_data - data_etapa))/3600/24), 1) as media_dias,
    count(*) as total
  from eventos
  where prox_etapa is not null
    and prox_data > data_etapa
  group by etapa, prox_etapa
  having count(*) >= 10
  order by total desc
  limit 30;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_sla_producao_diaria(meses text[])
 RETURNS TABLE(dia text, etapa text, total bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  select
    to_char(data_etapa, 'YYYY-MM-DD') as dia,
    etapa,
    count(*) as total
  from assurant_movimentacao_indicadores
  where to_char(data_etapa, 'YYYY-MM') = any(meses)
    and data_etapa is not null
  group by dia, etapa
  order by dia desc, total desc;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_sla_ciclo_total(meses text[])
 RETURNS TABLE(media_dias numeric, minimo_dias numeric, maximo_dias numeric, total bigint)
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  with rec as (
    select voucher, min(data_etapa) as dt_rec
    from assurant_movimentacao_indicadores
    where etapa = 'Recebimento'
      and to_char(data_etapa, 'YYYY-MM') = any(meses)
    group by voucher
  ),
  exp as (
    select voucher, min(data_etapa) as dt_exp
    from assurant_movimentacao_indicadores
    where etapa = 'Produto expedido'
    group by voucher
  )
  select
    round(avg(extract(epoch from (e.dt_exp - r.dt_rec))/3600/24), 1) as media_dias,
    round(min(extract(epoch from (e.dt_exp - r.dt_rec))/3600/24), 1) as minimo_dias,
    round(max(extract(epoch from (e.dt_exp - r.dt_rec))/3600/24), 1) as maximo_dias,
    count(*) as total
  from rec r
  join exp e using(voucher)
  where e.dt_exp > r.dt_rec;
$function$;

CREATE OR REPLACE FUNCTION public.wms_resumo_estoque()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with base as (
    select
      e.*,
      (a.id is not null) as tem_produto,
      case
        when a.id is not null and s.data_subinv is not null
          then greatest(
            0,
            (now() at time zone 'America/Sao_Paulo')::date - s.data_subinv
          )::integer
        else null
      end as aging_dias
    from public.wms_enderecos e
    left join lateral (
      select x.id, x.imei
      from public.wms_alocacoes x
      where x.endereco_id = e.id
        and x.status in ('reservado', 'confirmado')
      order by x.criado_em desc
      limit 1
    ) a on true
    left join lateral (
      select x.data_subinv
      from public.estoque_subinv x
      where x.imei = a.imei
      order by x.data_subinv desc nulls last
      limit 1
    ) s on a.id is not null
    where e.ativo = true and not exists (
    select 1 from public.wms_alocacoes wa join public.assurant_caixas_liberadas cx
    on cx.imei=wa.imei or cx.imei_identificado=wa.imei or cx.voucher=wa.voucher
    where wa.endereco_id=e.id and wa.status in ('reservado','confirmado'))
  ), totais as (
    select
      count(*)::integer as total,
      count(*) filter (where status = 'livre')::integer as livres,
      count(*) filter (where status = 'reservado')::integer as reservados,
      count(*) filter (where status = 'ocupado')::integer as ocupados,
      count(*) filter (where status = 'bloqueado')::integer as bloqueados,
      round(avg(aging_dias)::numeric, 1) as aging_medio_dias,
      count(aging_dias)::integer as produtos_com_aging,
      count(*) filter (where tem_produto and aging_dias is null)::integer as produtos_sem_aging
    from base
  ), por_grade as (
    select jsonb_agg(
      jsonb_build_object(
        'grade', grade_fisica,
        'total', total,
        'livres', livres,
        'reservados', reservados,
        'ocupados', ocupados,
        'bloqueados', bloqueados,
        'aging_medio_dias', aging_medio_dias,
        'produtos_com_aging', produtos_com_aging,
        'produtos_sem_aging', produtos_sem_aging,
        'ocupacao_percentual',
          case when total = 0 then 0
               else round((ocupados + reservados)::numeric * 100 / total, 2)
          end
      ) order by ordem
    ) as dados
    from (
      select
        grade_fisica,
        case grade_fisica
          when 'QUEBRADO' then 1 when 'REGULAR' then 2 when 'BOM' then 3
          when 'MUITO BOM' then 4 when 'EXCELENTE' then 5
          when 'LIKE NEW' then 6 else 7
        end as ordem,
        count(*)::integer as total,
        count(*) filter (where status = 'livre')::integer as livres,
        count(*) filter (where status = 'reservado')::integer as reservados,
        count(*) filter (where status = 'ocupado')::integer as ocupados,
        count(*) filter (where status = 'bloqueado')::integer as bloqueados,
        round(avg(aging_dias)::numeric, 1) as aging_medio_dias,
        count(aging_dias)::integer as produtos_com_aging,
        count(*) filter (where tem_produto and aging_dias is null)::integer as produtos_sem_aging
      from base
      group by grade_fisica
    ) g
  ), por_rua as (
    select jsonb_agg(
      jsonb_build_object(
        'rua', rua,
        'grade', grade_fisica,
        'tipo_produto', tipo_produto,
        'total', total,
        'livres', livres,
        'reservados', reservados,
        'ocupados', ocupados,
        'bloqueados', bloqueados,
        'aging_medio_dias', aging_medio_dias,
        'aging_menor_dias', aging_menor_dias,
        'aging_maior_dias', aging_maior_dias,
        'produtos_com_aging', produtos_com_aging,
        'produtos_sem_aging', produtos_sem_aging,
        'ocupacao_percentual',
          case when total = 0 then 0
               else round((ocupados + reservados)::numeric * 100 / total, 2)
          end
      ) order by rua
    ) as dados
    from (
      select
        rua,
        min(grade_fisica) as grade_fisica,
        min(tipo_produto) as tipo_produto,
        count(*)::integer as total,
        count(*) filter (where status = 'livre')::integer as livres,
        count(*) filter (where status = 'reservado')::integer as reservados,
        count(*) filter (where status = 'ocupado')::integer as ocupados,
        count(*) filter (where status = 'bloqueado')::integer as bloqueados,
        round(avg(aging_dias)::numeric, 1) as aging_medio_dias,
        min(aging_dias)::integer as aging_menor_dias,
        max(aging_dias)::integer as aging_maior_dias,
        count(aging_dias)::integer as produtos_com_aging,
        count(*) filter (where tem_produto and aging_dias is null)::integer as produtos_sem_aging
      from base
      group by rua
    ) r
  ), por_bloco as (
    select jsonb_agg(
      jsonb_build_object(
        'rua', rua,
        'bloco', bloco,
        'total', total,
        'livres', livres,
        'reservados', reservados,
        'ocupados', ocupados,
        'bloqueados', bloqueados,
        'aging_medio_dias', aging_medio_dias,
        'aging_menor_dias', aging_menor_dias,
        'aging_maior_dias', aging_maior_dias,
        'produtos_com_aging', produtos_com_aging,
        'produtos_sem_aging', produtos_sem_aging
      ) order by rua, bloco
    ) as dados
    from (
      select
        rua,
        bloco,
        count(*)::integer as total,
        count(*) filter (where status = 'livre')::integer as livres,
        count(*) filter (where status = 'reservado')::integer as reservados,
        count(*) filter (where status = 'ocupado')::integer as ocupados,
        count(*) filter (where status = 'bloqueado')::integer as bloqueados,
        round(avg(aging_dias)::numeric, 1) as aging_medio_dias,
        min(aging_dias)::integer as aging_menor_dias,
        max(aging_dias)::integer as aging_maior_dias,
        count(aging_dias)::integer as produtos_com_aging,
        count(*) filter (where tem_produto and aging_dias is null)::integer as produtos_sem_aging
      from base
      group by rua, bloco
    ) b
  ), por_andar as (
    select jsonb_agg(
      jsonb_build_object(
        'rua', rua,
        'bloco', bloco,
        'andar', andar,
        'total', total,
        'livres', livres,
        'reservados', reservados,
        'ocupados', ocupados,
        'bloqueados', bloqueados,
        'aging_medio_dias', aging_medio_dias,
        'aging_menor_dias', aging_menor_dias,
        'aging_maior_dias', aging_maior_dias,
        'produtos_com_aging', produtos_com_aging,
        'produtos_sem_aging', produtos_sem_aging
      ) order by rua, bloco, andar desc
    ) as dados
    from (
      select
        rua,
        bloco,
        andar,
        count(*)::integer as total,
        count(*) filter (where status = 'livre')::integer as livres,
        count(*) filter (where status = 'reservado')::integer as reservados,
        count(*) filter (where status = 'ocupado')::integer as ocupados,
        count(*) filter (where status = 'bloqueado')::integer as bloqueados,
        round(avg(aging_dias)::numeric, 1) as aging_medio_dias,
        min(aging_dias)::integer as aging_menor_dias,
        max(aging_dias)::integer as aging_maior_dias,
        count(aging_dias)::integer as produtos_com_aging,
        count(*) filter (where tem_produto and aging_dias is null)::integer as produtos_sem_aging
      from base
      group by rua, bloco, andar
    ) a
  )
  select jsonb_build_object(
    'total', t.total,
    'livres', t.livres,
    'reservados', t.reservados,
    'ocupados', t.ocupados,
    'bloqueados', t.bloqueados,
    'aging_medio_dias', t.aging_medio_dias,
    'produtos_com_aging', t.produtos_com_aging,
    'produtos_sem_aging', t.produtos_sem_aging,
    'ocupacao_percentual',
      case when t.total = 0 then 0
           else round((t.ocupados + t.reservados)::numeric * 100 / t.total, 2)
      end,
    'por_grade', coalesce(g.dados, '[]'::jsonb),
    'por_rua', coalesce(r.dados, '[]'::jsonb),
    'por_bloco', coalesce(b.dados, '[]'::jsonb),
    'por_andar', coalesce(a.dados, '[]'::jsonb)
  )
  from totais t
  cross join por_grade g
  cross join por_rua r
  cross join por_bloco b
  cross join por_andar a;
$function$;

create or replace function liquida_private.caixas_pode_armazenar() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
select auth.uid() is not null and exists(select 1 from public.user_profiles u where u.id=auth.uid() and
 (u.is_master or '/v2/assurant/estoque/armazenagem'=any(coalesce(u.telas_permitidas,'{}'::text[])) or '/triagens/armazenagem'=any(coalesce(u.telas_permitidas,'{}'::text[]))));
$$;
revoke all on function liquida_private.caixas_pode_armazenar() from public,anon,authenticated;
create or replace function public.assurant_armazenagem_fila(p_offset integer default 0,p_limite integer default 200) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v jsonb;
begin
 if not liquida_private.caixas_pode_armazenar() then raise exception 'Sem permissão para armazenagem' using errcode='42501'; end if;
 with fila as (
  select t.voucher,t.imei,t.sku,t.modelo,t.grade,t.grade_cosmetica,t.respostas_funcional,t.data_cosmetico,
   x.imei as referencia_caixa,x.caixa_codigo,
   x.imei is not null and (nullif(trim(t.voucher),'') is null or nullif(trim(t.sku),'') is null or nullif(trim(t.modelo),'') is null or coalesce(nullif(trim(t.grade_cosmetica),''),t.grade,'') not in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW','OUTLET')) as pendente_cadastro
  from public.assurant_triagem t left join public.assurant_caixas_liberadas x on x.triagem_id=t.id
  where t.status_atual in ('Aguardando armazenagem','Aguardando alocação','Aguardando alocacao','Aguardando locação','Aguardando locacao')
  union all
  select null::text,coalesce(x.imei_identificado,x.imei),null::text,null::text,null::text,null::text,null::text,null::timestamp,x.imei,x.caixa_codigo,true
  from public.assurant_caixas_liberadas x where x.triagem_id is null
 ) select coalesce(jsonb_agg(to_jsonb(q) order by q.voucher nulls last,q.imei),'[]'::jsonb) into v from
 (select * from fila order by voucher nulls last,imei offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limite,200),1),500)) q;
 return v;
end $$;
revoke all on function public.assurant_armazenagem_fila(integer,integer) from public,anon;
grant execute on function public.assurant_armazenagem_fila(integer,integer) to authenticated;
create or replace function public.assurant_caixas_completar_cadastro(p_referencia text,p_imei text,p_voucher text,p_sku text,p_modelo text,p_grade text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare x public.assurant_caixas_liberadas%rowtype; t public.assurant_triagem%rowtype; antes jsonb; v_voucher text:=upper(trim(p_voucher)); v_imei text:=upper(trim(p_imei));
begin
 if not liquida_private.caixas_pode_armazenar() then raise exception 'Sem permissão para armazenagem' using errcode='42501';end if;
 select * into x from public.assurant_caixas_liberadas where imei=p_referencia for update;
 if not found then raise exception 'Item não pertence às caixas liberadas';end if;
 if nullif(v_voucher,'') is null or nullif(trim(p_sku),'') is null or nullif(trim(p_modelo),'') is null then raise exception 'Informe voucher, SKU e modelo do aparelho';end if;
 if v_imei !~ '^[A-Z0-9-]{5,30}$' or v_imei ~ '^(YBV|DEV)' or (v_imei ~ '^[0-9]+$' and length(v_imei)<>15) then raise exception 'Bipe um IMEI de 15 dígitos ou o serial físico do aparelho';end if;
 if p_grade not in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW') then raise exception 'Informe uma grade física válida';end if;
 if exists(select 1 from public.wms_alocacoes a where a.imei=v_imei and a.status in('reservado','confirmado') and a.retirado_em is null) then raise exception 'Aparelho já possui alocação ativa';end if;
 select * into t from public.assurant_triagem where id=x.triagem_id for update;
 if t.id is not null and t.status_atual<>'Aguardando armazenagem' then raise exception 'Aparelho já seguiu para outra etapa';end if;
 if t.id is null then
  select * into t from public.assurant_triagem where voucher=v_voucher for update;
  if t.id is not null and t.imei is distinct from v_imei then raise exception 'Voucher já vinculado a outro aparelho';end if;
  if t.id is not null and t.status_atual<>'Aguardando armazenagem' then raise exception 'Voucher já está em outra etapa';end if;
 end if;
 if exists(select 1 from public.assurant_triagem a where (a.imei=v_imei or a.voucher=v_voucher) and a.id is distinct from t.id) then raise exception 'IMEI ou voucher já cadastrado em outro registro';end if;
 antes:=to_jsonb(t);
 if t.id is not null and t.voucher is distinct from v_voucher then raise exception 'Preserve o voucher cadastrado do aparelho';end if;
 -- Marca a identidade física antes da gravação para a exclusão cobrir os triggers de produção.
 update public.assurant_caixas_liberadas set imei_identificado=v_imei,voucher=v_voucher where imei=x.imei;
 if t.id is null then
  insert into public.assurant_triagem(voucher,imei,sku,modelo,grade,status_atual,origem_triagem,criado_em,atualizado_em)
  values(v_voucher,v_imei,upper(trim(p_sku)),trim(p_modelo),p_grade,'Aguardando armazenagem','carga_inicial',timezone('UTC',now()),timezone('UTC',now())) returning * into t;
 else
  update public.assurant_triagem set imei=v_imei,sku=coalesce(nullif(trim(sku),''),upper(trim(p_sku))),modelo=coalesce(nullif(trim(modelo),''),trim(p_modelo)),
   grade=case when coalesce(nullif(trim(grade_cosmetica),''),grade,'') in('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW') then grade else p_grade end,
   grade_cosmetica=case when grade_cosmetica='OUTLET' then p_grade else grade_cosmetica end,atualizado_em=timezone('UTC',now()) where id=t.id returning * into t;
 end if;
 update public.assurant_caixas_liberadas set triagem_id=t.id,cadastro_completado_em=now(),cadastro_completado_por=auth.uid() where imei=x.imei;
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 values(v_imei,'carga_inicial.caixas.cadastro',antes::text,to_jsonb(t)::text,'Complemento de cadastro físico na fila de armazenagem; lote excluído dos indicadores',auth.uid());
 return jsonb_build_object('ok',true,'voucher',t.voucher);
end $$;
revoke all on function public.assurant_caixas_completar_cadastro(text,text,text,text,text,text) from public,anon;
grant execute on function public.assurant_caixas_completar_cadastro(text,text,text,text,text,text) to authenticated;
