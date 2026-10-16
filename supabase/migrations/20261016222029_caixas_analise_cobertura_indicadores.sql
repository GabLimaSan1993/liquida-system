-- Evita duplicar na fila vouchers de ciclos antigos do mesmo aparelho.
-- Workers privados com autorização explícita; RPCs públicas apenas delegam.;

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
   x.imei is not null and (nullif(trim(t.voucher),'') is null or nullif(trim(t.sku),'') is null or nullif(trim(t.modelo),'') is null or coalesce(nullif(trim(t.grade_cosmetica),''),t.grade,'') not in ('QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW')) as pendente_cadastro
  from public.assurant_triagem t left join public.assurant_caixas_liberadas x on x.triagem_id=t.id
  where not exists(select 1 from public.assurant_caixas_liberadas cx where cx.triagem_id is distinct from t.id and (cx.imei=t.imei or cx.imei_identificado=t.imei)) and t.status_atual in ('Aguardando armazenagem','Aguardando alocação','Aguardando alocacao','Aguardando locação','Aguardando locacao')
  union all
  select null::text,coalesce(x.imei_identificado,x.imei),null::text,null::text,null::text,null::text,null::text,null::timestamp,x.imei,x.caixa_codigo,true
  from public.assurant_caixas_liberadas x where x.triagem_id is null
 ) select coalesce(jsonb_agg(to_jsonb(q) order by q.voucher nulls last,q.imei),'[]'::jsonb) into v from
 (select * from fila order by voucher nulls last,imei offset greatest(coalesce(p_offset,0),0) limit least(greatest(coalesce(p_limite,200),1),500)) q;
 return v;
end $function$;

revoke all on function liquida_private.caixas_armazenagem_fila(integer,integer) from public,anon; grant execute on function liquida_private.caixas_armazenagem_fila(integer,integer) to authenticated;

CREATE OR REPLACE FUNCTION liquida_private.caixas_completar_cadastro(p_referencia text, p_imei text, p_voucher text, p_sku text, p_modelo text, p_grade text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare x public.assurant_caixas_liberadas%rowtype; t public.assurant_triagem%rowtype; antes jsonb; v_voucher text:=upper(trim(p_voucher)); v_imei text:=upper(trim(p_imei));
begin
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

revoke all on function liquida_private.caixas_completar_cadastro(text,text,text,text,text,text) from public,anon; grant execute on function liquida_private.caixas_completar_cadastro(text,text,text,text,text,text) to authenticated;

create or replace function public.assurant_armazenagem_fila(p_offset integer default 0,p_limite integer default 200) returns jsonb
language sql stable security invoker set search_path=pg_catalog as $$ select liquida_private.caixas_armazenagem_fila(p_offset,p_limite); $$;
create or replace function public.assurant_caixas_completar_cadastro(p_referencia text,p_imei text,p_voucher text,p_sku text,p_modelo text,p_grade text) returns jsonb
language sql security invoker set search_path=pg_catalog as $$ select liquida_private.caixas_completar_cadastro(p_referencia,p_imei,p_voucher,p_sku,p_modelo,p_grade); $$;
revoke all on function public.assurant_armazenagem_fila(integer,integer) from public,anon;
revoke all on function public.assurant_caixas_completar_cadastro(text,text,text,text,text,text) from public,anon;
grant execute on function public.assurant_armazenagem_fila(integer,integer) to authenticated;
grant execute on function public.assurant_caixas_completar_cadastro(text,text,text,text,text,text) to authenticated;

create view public.meli_validacoes_indicadores with(security_invoker=true) as select t.* from public.meli_validacoes t
where not exists(select 1 from public.assurant_caixas_liberadas x where x.imei=t.imei or x.imei_identificado=t.imei);
create view public.romaneio_itens_indicadores with(security_invoker=true) as select t.* from public.romaneio_itens t
where not (exists(select 1 from public.pedidos_b2c p where p.chave_nf=t.chave_nf) and not exists(select 1 from public.pedidos_b2c_indicadores p where p.chave_nf=t.chave_nf));
revoke all on public.meli_validacoes_indicadores,public.romaneio_itens_indicadores from public,anon;
grant select on public.meli_validacoes_indicadores,public.romaneio_itens_indicadores to authenticated;

create or replace view public.vw_ind_expedicao_dia as
 SELECT (ri.bipado_em)::date AS dia,
        CASE lower(COALESCE(r.canal, ''::text))
            WHEN 'magalu'::text THEN 'Magazine Luiza'::text
            WHEN 'meli'::text THEN 'Mercado Livre'::text
            WHEN 'via_varejo'::text THEN 'Via Varejo'::text
            WHEN 'seguradora'::text THEN 'Seguradora'::text
            ELSE COALESCE(r.canal, 'Outros'::text)
        END AS marketplace,
    count(*) AS pedidos
   FROM (romaneio_itens_indicadores ri
     JOIN romaneios r ON ((r.id = ri.romaneio_id)))
  WHERE (ri.bipado_em IS NOT NULL)
  GROUP BY ((ri.bipado_em)::date),
        CASE lower(COALESCE(r.canal, ''::text))
            WHEN 'magalu'::text THEN 'Magazine Luiza'::text
            WHEN 'meli'::text THEN 'Mercado Livre'::text
            WHEN 'via_varejo'::text THEN 'Via Varejo'::text
            WHEN 'seguradora'::text THEN 'Seguradora'::text
            ELSE COALESCE(r.canal, 'Outros'::text)
        END;

create or replace view public.vw_assurant_b2c_coletas_mes as
 WITH rom AS (
         SELECT (date_trunc('month'::text, (r.fechado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date AS mes,
                CASE lower(COALESCE(r.canal, ''::text))
                    WHEN 'magalu'::text THEN 'Magazine Luiza'::text
                    WHEN 'meli'::text THEN 'Mercado Livre'::text
                    WHEN 'via_varejo'::text THEN 'Via Varejo'::text
                    WHEN 'seguradora'::text THEN 'Seguradora'::text
                    ELSE COALESCE(r.canal, 'Outros'::text)
                END AS marketplace,
            count(DISTINCT r.id) AS romaneios_fechados,
            count(ri.id) AS volumes_bipados
           FROM (romaneios r
             JOIN romaneio_itens_indicadores ri ON (((ri.romaneio_id = r.id) AND (ri.bipado_em IS NOT NULL))))
          WHERE ((r.fechado_em IS NOT NULL) AND (lower(COALESCE(r.status, ''::text)) = 'fechado'::text))
          GROUP BY ((date_trunc('month'::text, (r.fechado_em AT TIME ZONE 'America/Sao_Paulo'::text)))::date),
                CASE lower(COALESCE(r.canal, ''::text))
                    WHEN 'magalu'::text THEN 'Magazine Luiza'::text
                    WHEN 'meli'::text THEN 'Mercado Livre'::text
                    WHEN 'via_varejo'::text THEN 'Via Varejo'::text
                    WHEN 'seguradora'::text THEN 'Seguradora'::text
                    ELSE COALESCE(r.canal, 'Outros'::text)
                END
        )
 SELECT cf.mes,
    cf.marketplace,
    cf.coletas_fisicas AS coletas_efetivas,
    COALESCE(r.volumes_bipados, (0)::bigint) AS volumes_bipados
   FROM (vw_assurant_coletas_fisicas_mes cf
     LEFT JOIN rom r ON (((r.mes = cf.mes) AND (r.marketplace = cf.marketplace))))
UNION ALL
 SELECT r.mes,
    r.marketplace,
    r.romaneios_fechados AS coletas_efetivas,
    r.volumes_bipados
   FROM rom r
  WHERE (r.marketplace <> ALL (ARRAY['Magazine Luiza'::text, 'Mercado Livre'::text]));

create or replace view public.vw_assurant_b2c_canal_comparativo_periodo_atual as
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
        ), base AS (
         SELECT p.periodo,
            t.marketplace,
            t.status_anymarket,
            t.pago_em,
                CASE
                    WHEN ((t.embalagem_conclusao_em IS NOT NULL) AND (t.embalagem_conclusao_em >= t.pago_em)) THEN assurant_horas_sem_fds(t.pago_em, t.embalagem_conclusao_em)
                    ELSE NULL::numeric
                END AS horas_pago_embalagem
           FROM (periodos p
             JOIN vw_assurant_b2c_timeline t ON (((((t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio) AND (((t.pago_em AT TIME ZONE 'America/Sao_Paulo'::text))::date < p.fim_exclusivo))))
        ), stats AS (
         SELECT base.periodo,
            base.marketplace,
            count(*) AS pagos,
            (count(*) - count(*) FILTER (WHERE (lower(COALESCE(base.status_anymarket, ''::text)) = 'cancelado'::text))) AS embalados,
            count(*) FILTER (WHERE (lower(COALESCE(base.status_anymarket, ''::text)) = 'cancelado'::text)) AS cancelados,
            count(*) FILTER (WHERE (base.horas_pago_embalagem IS NOT NULL)) AS ciclos_validos,
            count(*) FILTER (WHERE (base.horas_pago_embalagem <= (24)::numeric)) AS ate_24h,
            round(((100.0 * (count(*) FILTER (WHERE (base.horas_pago_embalagem <= (24)::numeric)))::numeric) / (NULLIF(count(*) FILTER (WHERE (base.horas_pago_embalagem IS NOT NULL)), 0))::numeric), 2) AS pct_ate_24h,
            round((percentile_cont((0.5)::double precision) WITHIN GROUP (ORDER BY ((base.horas_pago_embalagem)::double precision)) FILTER (WHERE (base.horas_pago_embalagem IS NOT NULL)))::numeric, 2) AS mediana_h,
            round((percentile_cont((0.9)::double precision) WITHIN GROUP (ORDER BY ((base.horas_pago_embalagem)::double precision)) FILTER (WHERE (base.horas_pago_embalagem IS NOT NULL)))::numeric, 2) AS p90_h
           FROM base
          GROUP BY base.periodo, base.marketplace
        ), feriados AS (
         SELECT v.d AS data
           FROM ( VALUES ('2026-09-07'::date)) v(d)
        ), coletas_magalu AS (
         SELECT p.periodo,
            'Magazine Luiza'::text AS marketplace,
            count(*) AS coletas_efetivas
           FROM ((periodos p
             CROSS JOIN LATERAL generate_series((p.inicio)::timestamp with time zone, ((p.fim_exclusivo - 1))::timestamp with time zone, '1 day'::interval) g(d))
             LEFT JOIN feriados f ON ((f.data = (g.d)::date)))
          WHERE ((EXTRACT(isodow FROM g.d) >= (1)::numeric) AND (EXTRACT(isodow FROM g.d) <= (5)::numeric) AND (f.data IS NULL))
          GROUP BY p.periodo
        ), coletas_meli AS (
         SELECT p.periodo,
            'Mercado Livre'::text AS marketplace,
            COALESCE(sum(a_1.quantidade_coletas), (0)::bigint) AS coletas_efetivas
           FROM (periodos p
             LEFT JOIN assurant_coletas_fisicas a_1 ON (((a_1.marketplace = 'Mercado Livre'::text) AND (a_1.data >= p.inicio) AND (a_1.data < p.fim_exclusivo))))
          GROUP BY p.periodo
        ), coletas_outros AS (
         SELECT p.periodo,
                CASE lower(COALESCE(r.canal, ''::text))
                    WHEN 'magalu'::text THEN 'Magazine Luiza'::text
                    WHEN 'meli'::text THEN 'Mercado Livre'::text
                    WHEN 'via_varejo'::text THEN 'Via Varejo'::text
                    WHEN 'seguradora'::text THEN 'Seguradora'::text
                    ELSE COALESCE(r.canal, 'Outros'::text)
                END AS marketplace,
            count(DISTINCT r.id) AS coletas_efetivas
           FROM ((periodos p
             JOIN romaneios r ON (((((r.fechado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date >= p.inicio) AND (((r.fechado_em AT TIME ZONE 'America/Sao_Paulo'::text))::date < p.fim_exclusivo))))
             JOIN romaneio_itens_indicadores ri ON (((ri.romaneio_id = r.id) AND (ri.bipado_em IS NOT NULL))))
          WHERE ((lower(COALESCE(r.status, ''::text)) = 'fechado'::text) AND (lower(COALESCE(r.canal, ''::text)) <> ALL (ARRAY['magalu'::text, 'meli'::text])))
          GROUP BY p.periodo,
                CASE lower(COALESCE(r.canal, ''::text))
                    WHEN 'magalu'::text THEN 'Magazine Luiza'::text
                    WHEN 'meli'::text THEN 'Mercado Livre'::text
                    WHEN 'via_varejo'::text THEN 'Via Varejo'::text
                    WHEN 'seguradora'::text THEN 'Seguradora'::text
                    ELSE COALESCE(r.canal, 'Outros'::text)
                END
        ), coletas AS (
         SELECT coletas_magalu.periodo,
            coletas_magalu.marketplace,
            coletas_magalu.coletas_efetivas
           FROM coletas_magalu
        UNION ALL
         SELECT coletas_meli.periodo,
            coletas_meli.marketplace,
            coletas_meli.coletas_efetivas
           FROM coletas_meli
        UNION ALL
         SELECT coletas_outros.periodo,
            coletas_outros.marketplace,
            coletas_outros.coletas_efetivas
           FROM coletas_outros
        ), marketplaces AS (
         SELECT DISTINCT stats.marketplace
           FROM stats
          WHERE (stats.periodo = 'ATUAL'::text)
        ), a AS (
         SELECT stats.periodo,
            stats.marketplace,
            stats.pagos,
            stats.embalados,
            stats.cancelados,
            stats.ciclos_validos,
            stats.ate_24h,
            stats.pct_ate_24h,
            stats.mediana_h,
            stats.p90_h
           FROM stats
          WHERE (stats.periodo = 'ATUAL'::text)
        ), b AS (
         SELECT stats.periodo,
            stats.marketplace,
            stats.pagos,
            stats.embalados,
            stats.cancelados,
            stats.ciclos_validos,
            stats.ate_24h,
            stats.pct_ate_24h,
            stats.mediana_h,
            stats.p90_h
           FROM stats
          WHERE (stats.periodo = 'ANTERIOR'::text)
        ), ca AS (
         SELECT coletas.periodo,
            coletas.marketplace,
            coletas.coletas_efetivas
           FROM coletas
          WHERE (coletas.periodo = 'ATUAL'::text)
        ), cb AS (
         SELECT coletas.periodo,
            coletas.marketplace,
            coletas.coletas_efetivas
           FROM coletas
          WHERE (coletas.periodo = 'ANTERIOR'::text)
        )
 SELECT m.marketplace,
    a.pagos AS pagos_atual,
    b.pagos AS pagos_anterior,
    a.embalados AS embalados_atual,
    b.embalados AS embalados_anterior,
    a.cancelados AS cancelados_atual,
    b.cancelados AS cancelados_anterior,
    a.ciclos_validos AS ciclos_validos_atual,
    a.ate_24h AS ate_24h_atual,
    a.pct_ate_24h AS pct_ate_24h_atual,
    b.pct_ate_24h AS pct_ate_24h_anterior,
    a.mediana_h AS mediana_h_atual,
    b.mediana_h AS mediana_h_anterior,
        CASE
            WHEN (b.mediana_h > (0)::numeric) THEN round(((100.0 * (a.mediana_h - b.mediana_h)) / b.mediana_h), 2)
            ELSE NULL::numeric
        END AS variacao_mediana_pct,
    a.p90_h AS p90_h_atual,
    b.p90_h AS p90_h_anterior,
    COALESCE(ca.coletas_efetivas, (0)::bigint) AS coletas_efetivas_atual,
    COALESCE(cb.coletas_efetivas, (0)::bigint) AS coletas_efetivas_anterior
   FROM ((((marketplaces m
     LEFT JOIN a ON ((a.marketplace = m.marketplace)))
     LEFT JOIN b ON ((b.marketplace = m.marketplace)))
     LEFT JOIN ca ON ((ca.marketplace = m.marketplace)))
     LEFT JOIN cb ON ((cb.marketplace = m.marketplace)));

create or replace view liquida_private.producao_caixas_exclusoes as
select 'assurant_triagem'::text fonte,t.voucher::text fonte_id from public.assurant_triagem t join public.assurant_caixas_liberadas x on x.triagem_id=t.id or x.imei=t.imei or x.imei_identificado=t.imei or x.voucher=t.voucher
union select 'assurant_triagem',t.id::text from public.assurant_triagem t join public.assurant_caixas_liberadas x on x.triagem_id=t.id or x.imei=t.imei or x.imei_identificado=t.imei or x.voucher=t.voucher
union select 'wms_alocacoes',t.id::text from public.wms_alocacoes t join public.assurant_caixas_liberadas x on x.voucher=t.voucher or x.imei=t.imei or x.imei_identificado=t.imei
union select 'recebimento_vouchers',t.id::text from public.recebimento_vouchers t join public.assurant_caixas_liberadas x on x.voucher=t.voucher
union select 'pedidos_b2c',t.id::text from public.pedidos_b2c t join public.assurant_caixas_liberadas x on x.imei=coalesce(nullif(t.imei_bipado,''),t.imei_alocado) or x.imei_identificado=coalesce(nullif(t.imei_bipado,''),t.imei_alocado)
union select 'b2b_itens',t.id::text from public.b2b_itens t join public.assurant_caixas_liberadas x on x.imei=coalesce(nullif(t.imei_bipado,''),t.imei) or x.imei_identificado=coalesce(nullif(t.imei_bipado,''),t.imei) or x.voucher=t.voucher
union select 'meli_validacoes',t.id::text from public.meli_validacoes t join public.assurant_caixas_liberadas x on x.imei=t.imei or x.imei_identificado=t.imei
union select 'romaneio_itens',t.id::text from public.romaneio_itens t where not exists(select 1 from public.romaneio_itens_indicadores i where i.id=t.id);

create or replace view liquida_private.producao_base as
select q.fonte,q.fonte_id,q.etapa,q.realizado_em,q.colaborador_id,
case when q.fonte='b2b_nfs' then greatest(q.quantidade-(select count(*)::integer from public.b2b_itens b join public.b2b_nfs n on n.pedido_id=b.pedido_id and n.numero_nf=b.nf where n.id::text=q.fonte_id and exists(select 1 from public.assurant_caixas_liberadas x where x.imei=coalesce(nullif(b.imei_bipado,''),b.imei) or x.imei_identificado=coalesce(nullif(b.imei_bipado,''),b.imei) or x.voucher=b.voucher)),0) else q.quantidade end quantidade,
q.canal,q.unidade,q.referencia,q.retrabalho from ( SELECT fonte,
    fonte_id,
    etapa,
    realizado_em,
    colaborador_id,
    quantidade,
    canal,
    unidade,
    referencia,
    retrabalho
   FROM ( SELECT 'recebimento_vouchers'::text AS fonte,
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
           FROM meli_validacoes_indicadores t
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
           FROM romaneio_itens_indicadores t
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
  WHERE (NOT (EXISTS ( SELECT 1
           FROM liquida_private.producao_caixas_exclusoes x
          WHERE ((x.fonte = q.fonte) AND (x.fonte_id = q.fonte_id)))))) q;
revoke all on liquida_private.producao_base,liquida_private.producao_caixas_exclusoes from public,anon,authenticated;
