-- Cards de devolução ao Warehouse, vinculados à minuta física emitida.
-- Não expor produtos concluídos que ainda não possuem minuta de devolução.
CREATE OR REPLACE FUNCTION public.assurant_reparo_retorno_minutas(
  p_acao text,
  p_minuta_id uuid DEFAULT NULL,
  p_codigo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog'
SET statement_timeout TO '35s'
AS $function$
DECLARE
  v_usuario uuid := auth.uid();
  v_codigo text := upper(btrim(coalesce(p_codigo,'')));
  v_minuta liquida_private.reparo_lab_devolucoes_unificadas%ROWTYPE;
  v_item record;
  v_correspondencias integer;
  v_retorno jsonb;
  v_itens jsonb;
  v_resumo jsonb;
BEGIN
  IF v_usuario IS NULL OR NOT EXISTS(
    SELECT 1 FROM public.user_profiles up
    WHERE up.id=v_usuario AND
       (coalesce(up.is_master,false) OR
        up.telas_permitidas @> ARRAY['/v2/assurant/estoque/retorno-reparo']::text[])
  ) THEN
    RAISE EXCEPTION 'Sem permissão de Retorno de Reparo' USING ERRCODE='42501';
  END IF;

  IF p_acao='listar' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.numero DESC),'[]'::jsonb)
      INTO v_resumo
    FROM (
      SELECT d.id,d.numero,d.criado_em,d.status,
             count(di.id)::int AS total,
             count(di.id) FILTER (WHERE coalesce(a.status,h.status)='devolvido_warehouse')::int AS recebidos,
             count(di.id) FILTER (WHERE coalesce(a.status,h.status)='em_devolucao')::int AS pendentes,
             CASE WHEN count(DISTINCT di.resultado)=1 AND
                         min(di.resultado) IN ('reparado','sem_reparo','irrecuperavel')
                  THEN min(di.resultado) ELSE 'misto' END AS classificacao
      FROM liquida_private.reparo_lab_devolucoes_unificadas d
      JOIN liquida_private.reparo_lab_devolucoes_unificadas_itens di
           ON di.devolucao_id=d.id
      LEFT JOIN liquida_private.reparo_lab_avulsos a
           ON di.origem='individual' AND a.id=di.item_id
      LEFT JOIN liquida_private.reparo_lab_itens h
           ON di.origem='historico' AND h.id=di.item_id
      WHERE d.status IN ('emitido','recebimento_parcial')
      GROUP BY d.id
      HAVING count(di.id) FILTER (WHERE coalesce(a.status,h.status)='em_devolucao')>0
      ORDER BY d.numero DESC LIMIT 300
    ) q;
    RETURN jsonb_build_object('ok',true,'minutas',v_resumo);
  END IF;

  IF p_minuta_id IS NULL THEN
    RAISE EXCEPTION 'Selecione a minuta para conferir o retorno';
  END IF;
  IF p_acao='receber' THEN
    SELECT * INTO v_minuta
    FROM liquida_private.reparo_lab_devolucoes_unificadas
    WHERE id=p_minuta_id AND status IN ('emitido','recebimento_parcial')
    FOR UPDATE;
  ELSE
    SELECT * INTO v_minuta
    FROM liquida_private.reparo_lab_devolucoes_unificadas
    WHERE id=p_minuta_id AND status<>'cancelado';
  END IF;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Minuta inexistente, cancelada ou já finalizada';
  END IF;

  IF p_acao='receber' THEN
    IF length(v_codigo)<3 OR length(v_codigo)>80 THEN
      RAISE EXCEPTION 'Bipe um Voucher ou IMEI válido';
    END IF;
    SELECT count(*)::int INTO v_correspondencias
    FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
    WHERE di.devolucao_id=v_minuta.id AND
      (upper(btrim(coalesce(di.voucher,'')))=v_codigo OR
       upper(btrim(coalesce(di.imei,'')))=v_codigo);
    IF v_correspondencias<>1 THEN
      RAISE EXCEPTION 'Voucher/IMEI não pertence exclusivamente a esta minuta (% correspondências)',v_correspondencias;
    END IF;
    SELECT di.item_id,di.origem,di.voucher,di.imei,di.resultado,
           coalesce(a.status,h.status) AS status_atual,
           coalesce(a.resultado,h.resultado) AS resultado_atual
    INTO v_item
    FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
    LEFT JOIN liquida_private.reparo_lab_avulsos a
       ON di.origem='individual' AND a.id=di.item_id
    LEFT JOIN liquida_private.reparo_lab_itens h
       ON di.origem='historico' AND h.id=di.item_id
    WHERE di.devolucao_id=v_minuta.id AND
      (upper(btrim(coalesce(di.voucher,'')))=v_codigo OR
       upper(btrim(coalesce(di.imei,'')))=v_codigo)
    LIMIT 1;
    IF v_item.status_atual='devolvido_warehouse' THEN
      RAISE EXCEPTION 'Aparelho % já foi recebido no Warehouse',v_item.voucher;
    END IF;
    IF v_item.status_atual IS DISTINCT FROM 'em_devolucao' THEN
      RAISE EXCEPTION 'Aparelho % não está em devolução pelo Laboratório',v_item.voucher;
    END IF;
    IF v_item.resultado_atual IS DISTINCT FROM v_item.resultado THEN
      RAISE EXCEPTION 'Resultado atual do aparelho % diverge da minuta. Regularize antes de receber.',v_item.voucher;
    END IF;

    -- A confirmação física e a movimentação segura permanecem na rotina nativa;
    -- apenas se acrescenta aqui a trava contra bipagem em minuta incorreta.
    v_retorno:=public.assurant_reparo_retorno_laboratorio('receber',v_item.item_id,v_item.origem);
    IF coalesce(v_retorno->>'ok','false')<>'true' THEN
      RAISE EXCEPTION 'O retorno físico não foi confirmado pelo sistema';
    END IF;
    RETURN jsonb_build_object(
      'ok',true,'minuta_id',v_minuta.id,'voucher',v_item.voucher,
      'imei',v_item.imei,'resultado',v_item.resultado,
      'mensagem',v_retorno->>'mensagem'
    );
  ELSIF p_acao<>'detalhar' THEN
    RAISE EXCEPTION 'Ação inválida de conferência de minuta';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.voucher,x.item_id),'[]'::jsonb)
  INTO v_itens
  FROM (
    SELECT di.item_id,di.origem,di.voucher,di.imei,di.modelo,di.os_numero,
           di.resultado,
           coalesce(a.status,h.status) AS status,
           coalesce(a.devolvido_em,h.devolvido_em) AS recebido_em,
           coalesce(a.defeitos_origem,h.defeitos_origem) AS defeitos_origem,
           coalesce(a.defeitos_atual,h.defeitos_atual) AS defeitos_atual
    FROM liquida_private.reparo_lab_devolucoes_unificadas_itens di
    LEFT JOIN liquida_private.reparo_lab_avulsos a
      ON di.origem='individual' AND a.id=di.item_id
    LEFT JOIN liquida_private.reparo_lab_itens h
      ON di.origem='historico' AND h.id=di.item_id
    WHERE di.devolucao_id=v_minuta.id
  ) x;

  SELECT jsonb_build_object('id',v_minuta.id,'numero',v_minuta.numero,
         'criado_em',v_minuta.criado_em,'status',v_minuta.status,
         'total',jsonb_array_length(v_itens),
         'recebidos',(SELECT count(*) FROM jsonb_array_elements(v_itens) t(x)
                      WHERE t.x->>'status'='devolvido_warehouse'),
         'pendentes',(SELECT count(*) FROM jsonb_array_elements(v_itens) t(x)
                      WHERE t.x->>'status'='em_devolucao'),
         'classificacao',(SELECT CASE WHEN count(DISTINCT x->>'resultado')=1 AND
                             min(x->>'resultado') IN ('reparado','sem_reparo','irrecuperavel')
                           THEN min(x->>'resultado') ELSE 'misto' END
                          FROM jsonb_array_elements(v_itens) x))
    INTO v_resumo;
  RETURN jsonb_build_object('ok',true,'minuta',v_resumo,'itens',v_itens);
END
$function$;

REVOKE ALL ON FUNCTION public.assurant_reparo_retorno_minutas(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assurant_reparo_retorno_minutas(text,uuid,text) TO authenticated;
