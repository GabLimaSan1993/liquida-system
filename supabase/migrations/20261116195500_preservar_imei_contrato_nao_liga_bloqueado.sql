-- Preserve the contractual IMEI as principal identifier for Blocked/No power devices en route to the report.
-- Physical identification, when any, is kept separately in respostas_funcional.identificacao.
CREATE OR REPLACE FUNCTION liquida_private.triagem_laudo_imei_contrato_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO pg_catalog, public, liquida_private
AS $function$
DECLARE
  v_ordem jsonb;
  v_imei_contrato text;
  v_dados jsonb;
BEGIN
  IF NEW.status_atual IS DISTINCT FROM 'Aguardando laudo'
     OR NOT liquida_private.laudo_requer_imei_contrato(
       NEW.aparelho_bloqueado, NEW.defeitos_adicionais, NEW.respostas_funcional
     )
  THEN
    RETURN NEW;
  END IF;

  v_ordem := liquida_private.triagem_ordem_contexto(NEW.voucher);
  v_imei_contrato := nullif(btrim(v_ordem->>'imei'), '');

  IF v_imei_contrato IS NULL OR v_ordem->>'estado' IS DISTINCT FROM 'ativo' THEN
    RAISE EXCEPTION 'Voucher %: IMEI do contrato não localizado/ativo. Regularize o vínculo antes de enviar Bloqueado/Não liga ao Laudo.', NEW.voucher
      USING ERRCODE='22023';
  END IF;

  -- Always keep the contractual IMEI in the principal column, even if an older
  -- value was present (including a physical IMEI entered by the operator).
  NEW.imei := v_imei_contrato;

  -- Do not rewrite any historical physical scan or invent a physical reading.
  -- Only add the contractual reference when valid identification JSON exists.
  BEGIN
    v_dados := NEW.respostas_funcional::jsonb;
  EXCEPTION WHEN others THEN
    v_dados := NULL;
  END;
  IF jsonb_typeof(v_dados)='object'
      AND jsonb_typeof(v_dados->'identificacao')='object'
  THEN
    v_dados := jsonb_set(
      v_dados,
      '{identificacao}',
      (v_dados->'identificacao')
        || jsonb_build_object(
             'imei_contrato',v_imei_contrato,
             'imei_principal_origem','contrato'
           ),
      true
    );
    NEW.respostas_funcional := v_dados::text;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS zzzz_triagem_laudo_imei_contrato_guard ON public.assurant_triagem;
CREATE TRIGGER zzzz_triagem_laudo_imei_contrato_guard
BEFORE INSERT OR UPDATE OF status_atual, imei, aparelho_bloqueado, defeitos_adicionais,
  data_funcional, respostas_funcional
ON public.assurant_triagem
FOR EACH ROW
EXECUTE FUNCTION liquida_private.triagem_laudo_imei_contrato_guard();

CREATE OR REPLACE FUNCTION public.assurant_triagem_nao_liga_finalizar(p_voucher text, p_defeitos text[], p_produto jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
 SET statement_timeout TO '20s'
AS $function$
DECLARE
 v text:=upper(btrim(coalesce(p_voucher,'')));
 v_user uuid:=auth.uid();
 v_nome text;
 v_ordem jsonb;
 v_imei_contrato text;
 v_retorno jsonb;
 v_t public.assurant_triagem%ROWTYPE;
 v_antes jsonb;
 v_respostas jsonb;
 v_agora timestamp without time zone:=timezone('UTC',now());
 v_defeitos text[];
 v_defeito_texto text;
 v_modelo text;
 v_sku text;
 v_id bigint;
 v_ajuste uuid;
 v_motivo_retriagem text:=btrim(coalesce(p_produto->>'motivo_retriagem',''));
 v_eh_retriagem boolean:=false;
 v_motivo text:='DIVERGÊNCIA · NÃO LIGA — aparelho encaminhado ao Laudo antes da Triagem Cosmética. Sem Análise Assurant.';
BEGIN
 IF v_user IS NULL OR NOT liquida_private.triagem_pode_operar()
 THEN RAISE EXCEPTION 'Sem permissão para finalizar a triagem funcional' USING ERRCODE='42501'; END IF;
 IF v !~ '^[A-Z][A-Z0-9_-]{2,63}$' THEN RAISE EXCEPTION 'Voucher inválido'; END IF;
 IF p_produto IS NOT NULL AND jsonb_typeof(p_produto)<>'object'
 THEN RAISE EXCEPTION 'Identificação do produto inválida'; END IF;
 IF v_motivo_retriagem<>'' AND length(v_motivo_retriagem) NOT BETWEEN 3 AND 500
 THEN RAISE EXCEPTION 'Informe o motivo da retriagem (3 a 500 caracteres)'; END IF;
 IF coalesce(cardinality(p_defeitos),0)>25
 THEN RAISE EXCEPTION 'Máximo de 25 defeitos adicionais'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_defeitos,ARRAY[]::text[])) f
     WHERE f IS NULL OR length(btrim(f)) NOT BETWEEN 1 AND 150
        OR f LIKE '%;%' OR f ~ '[[:cntrl:]]')
 THEN RAISE EXCEPTION 'Defeito adicional inválido'; END IF;
 IF EXISTS(SELECT 1 FROM unnest(coalesce(p_defeitos,ARRAY[]::text[])) f
     WHERE NOT EXISTS(SELECT 1 FROM public.triagem_defeitos d
       WHERE d.ativo IS TRUE AND lower(btrim(d.nome))=lower(btrim(f))))
 THEN RAISE EXCEPTION 'Selecione os defeitos adicionais do catálogo ativo'; END IF;
 SELECT coalesce(array_agg(nome ORDER BY nome),ARRAY[]::text[]) INTO v_defeitos
 FROM (SELECT DISTINCT ON(lower(btrim(d.nome))) btrim(d.nome) nome
       FROM public.triagem_defeitos d
       WHERE d.ativo AND EXISTS(SELECT 1 FROM unnest(coalesce(p_defeitos,ARRAY[]::text[])) f
          WHERE lower(btrim(f))=lower(btrim(d.nome)))
         AND lower(btrim(d.nome)) NOT IN ('não liga','nao liga','aparelho não liga','aparelho nao liga')
       ORDER BY lower(btrim(d.nome)),btrim(d.nome)) x;
 v_defeito_texto:=array_to_string(ARRAY['Não liga — divergência funcional']||v_defeitos,'; ');

 -- Sem Ordem e conflito de IMEI já pendente continuam em seus fluxos próprios.
 v_retorno:=public.assurant_triagem_checar_ordem(v);
 IF coalesce((v_retorno->>'divergencia')::boolean,false) THEN RETURN v_retorno; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v,0));
 SELECT * INTO v_t FROM public.assurant_triagem WHERE voucher=v FOR UPDATE;
 IF FOUND THEN
   v_eh_retriagem:=v_motivo_retriagem<>'';
   IF v_eh_retriagem
      AND v_t.status_atual NOT IN ('Aguardando laudo','Aguardando triagem funcional','Aguardando triagem cosmética')
   THEN RAISE EXCEPTION 'Retriagem restrita a Funcional, Laudo pendente ou Cosmética antes de sua conclusão'; END IF;
   IF v_eh_retriagem AND (v_t.data_cosmetico IS NOT NULL OR v_t.data_alocacao IS NOT NULL
       OR v_t.data_oracle IS NOT NULL OR v_t.oracle_confirmado_em IS NOT NULL)
   THEN RAISE EXCEPTION 'O aparelho já avançou para cosmética/estoque. Necessária conciliação antes de retriar'; END IF;
   IF v_eh_retriagem AND v_t.data_laudo IS NOT NULL
      AND v_t.status_atual<>'Aguardando triagem cosmética'
   THEN RAISE EXCEPTION 'Laudo já elaborado: regularize antes de reabrir sua etapa'; END IF;
   IF v_eh_retriagem AND v_t.status_atual='Aguardando laudo'
      AND EXISTS(SELECT 1 FROM public.triagem_laudos l WHERE l.voucher=v)
   THEN RAISE EXCEPTION 'Laudo já emitido: regularize antes de refazer a triagem'; END IF;
   IF v_t.status_atual='Aguardando laudo'
     AND coalesce(v_t.respostas_funcional,'') LIKE '%"nao_liga_declarado_na_funcional"%'
     AND NOT v_eh_retriagem
   THEN RETURN jsonb_build_object('ok',true,'idempotente',true,
       'voucher',v,'status',v_t.status_atual,'divergencia',true,
       'nao_liga_local',true,'tipo_problema','nao_liga','destino','laudo',
       'tipo_laudo','DIVERGENCIA','motivo',v_motivo);
   END IF;
   IF (v_t.status_atual IS DISTINCT FROM 'Aguardando triagem funcional'
       AND NOT(v_eh_retriagem AND v_t.status_atual IN('Aguardando laudo','Aguardando triagem cosmética')))
      OR v_t.data_alocacao IS NOT NULL OR v_t.data_oracle IS NOT NULL
      OR v_t.oracle_confirmado_em IS NOT NULL THEN
      RAISE EXCEPTION 'Voucher já avançou no processo (%). Não é permitido reabrir etapas concluídas.',
        coalesce(v_t.status_atual,'sem status');
   END IF;
   IF v_t.imei IS NOT NULL AND EXISTS(SELECT 1 FROM public.wms_alocacoes a
       WHERE a.imei=v_t.imei AND a.status='confirmado' AND a.retirado_em IS NULL)
   THEN RAISE EXCEPTION 'IMEI alocado no WMS. Regularize o vínculo antes de continuar'; END IF;
 END IF;
 v_ordem:=liquida_private.triagem_ordem_contexto(v);
 v_imei_contrato:=nullif(btrim(v_ordem->>'imei'),'');
 IF v_ordem->>'estado'<>'ativo' AND NOT liquida_private.triagem_sem_ordem_autorizado(v,v_ordem->>'estado')
 THEN RAISE EXCEPTION 'Sem Ordem: regularize essa divergência antes da triagem'; END IF;
 v_antes:=CASE WHEN v_t.id IS NOT NULL THEN to_jsonb(v_t) ELSE NULL END;
 v_modelo:=coalesce(nullif(btrim(p_produto->>'modelo'),''),nullif(btrim(v_t.modelo),''),
                     nullif(btrim(v_ordem->>'modelo'),''));
 v_sku:=coalesce(nullif(btrim(p_produto->>'sku'),''),nullif(btrim(v_t.sku),''),
                  nullif(btrim(v_ordem->>'sku'),''));
 IF length(coalesce(v_modelo,''))>200 OR length(coalesce(v_sku,''))>100
 THEN RAISE EXCEPTION 'Identificação do aparelho excede o tamanho permitido'; END IF;
 -- Laudo já concluído: a revisitação na bancada só pode preservar
 -- a etapa Cosmética, sem reabrir Laudo emitido. O gatilho de integridade
 -- já permite essa revisão com evento auditado pré-registrado.
 IF v_eh_retriagem AND v_t.data_laudo IS NOT NULL
    AND v_t.status_atual='Aguardando triagem cosmética' THEN
   INSERT INTO liquida_private.triagem_nao_liga_encaminhamentos(
     voucher,triagem_id,status_anterior,status_novo,motivo,
     usuario_id,dados_anteriores,dados_posteriores
   ) VALUES (
     v,v_t.id,v_t.status_atual,v_t.status_atual,
     v_motivo||' [RETRIAGEM — LAUDO EMITIDO PRESERVADO]',
     v_user,v_antes,NULL
   ) RETURNING id INTO v_id;
 END IF;
 v_respostas:=jsonb_build_object(
   'versao',4,
   'origem','nao_liga_declarado_na_funcional',
   'canal','YBV',
   'respondido_em',to_char(v_agora,'YYYY-MM-DD"T"HH24:MI:SS'),
   'identificacao',jsonb_build_object(
      'imei1',NULL,'imei2',NULL,'imei_contrato',v_imei_contrato,'origem_imei','referencia_cadastro','identificacao_nao_bipada',true,
      'conferencia_imei','nao_realizada','teste_funcional_completo',false),
   'produto',jsonb_build_object(
      'marca',nullif(btrim(p_produto->>'marca'),''),
      'modelo',v_modelo,
      'armazenamento',nullif(btrim(p_produto->>'armazenamento'),''),
      'cor',nullif(btrim(p_produto->>'cor'),'')),
   'respostas',jsonb_build_array(jsonb_build_object(
      'pergunta','O aparelho liga?','resposta','nao','divergente',true,
      'observacao','Demais testes não realizados porque o aparelho não liga')),
   'defeitos_adicionais',to_jsonb(v_defeitos),
   'destino',jsonb_build_object(
      'laudo',true,'tipo_laudo','DIVERGENCIA','tipo_divergencia','NAO_LIGA',
      'nao_liga_para_triagem',true,'motivo',v_motivo,'etapa','laudo')
 );
 INSERT INTO public.assurant_triagem(
   voucher,imei,modelo,sku,status_atual,origem_triagem,
   resultado_triagem_funcional,defeitos_adicionais,respostas_funcional,
   data_funcional,funcional_por,atualizado_em
 ) VALUES(
   v,v_imei_contrato,v_modelo,v_sku,'Aguardando laudo','liquida',
   'BAD',v_defeito_texto,v_respostas::text,v_agora,v_user,v_agora
 ) ON CONFLICT(voucher) DO UPDATE SET
   status_atual=CASE WHEN v_eh_retriagem AND v_t.data_laudo IS NOT NULL
     THEN v_t.status_atual ELSE 'Aguardando laudo' END,
   imei=EXCLUDED.imei, -- IMEI principal sempre corresponde ao contrato, nunca à leitura indisponível
   origem_triagem='liquida',
   modelo=coalesce(EXCLUDED.modelo,public.assurant_triagem.modelo),
   sku=coalesce(EXCLUDED.sku,public.assurant_triagem.sku),
   resultado_triagem_funcional='BAD',
   defeitos_adicionais=EXCLUDED.defeitos_adicionais,
   respostas_funcional=EXCLUDED.respostas_funcional,
   data_funcional=v_agora,
   funcional_por=v_user,
   atualizado_em=v_agora
 RETURNING * INTO v_t;
 IF v_id IS NULL THEN
   INSERT INTO liquida_private.triagem_nao_liga_encaminhamentos(
     voucher,triagem_id,status_anterior,status_novo,motivo,
     usuario_id,dados_anteriores,dados_posteriores
   ) VALUES(
     v,v_t.id,v_antes->>'status_atual',v_t.status_atual,v_motivo,
     v_user,v_antes,to_jsonb(v_t)
   ) RETURNING id INTO v_id;
 ELSE
   UPDATE liquida_private.triagem_nao_liga_encaminhamentos
   SET status_novo=v_t.status_atual,dados_posteriores=to_jsonb(v_t)
   WHERE id=v_id;
 END IF;
 IF v_eh_retriagem THEN
   INSERT INTO public.assurant_rastreabilidade_ajustes(
     imei,campo,valor_anterior,valor_novo,motivo,criado_por
   ) VALUES(
     coalesce(v_t.imei,NULLIF(v_antes->>'imei','')),
     'triagem_funcional.revisao',v_antes::text,to_jsonb(v_t)::text,
     v_motivo_retriagem,v_user
   ) RETURNING id INTO v_ajuste;
 END IF;
 SELECT u.nome INTO v_nome FROM public.user_profiles u WHERE u.id=v_user;
 RETURN jsonb_build_object('ok',true,'retriagem',v_eh_retriagem,'ajuste_id',v_ajuste,'divergencia',true,'nao_liga_local',true,
   'tipo_problema','nao_liga','tipo_laudo','DIVERGENCIA','voucher',v,
   'status',v_t.status_atual,'destino',
      CASE WHEN v_t.status_atual='Aguardando triagem cosmética' THEN 'cosmetica' ELSE 'laudo' END,
   'proxima_etapa_apos_laudo','Aguardando triagem cosmética',
   'defeitos_adicionais',to_jsonb(v_defeitos),
   'identificacao_nao_bipada',true,'motivo',v_motivo,
   'criado_em',now(),'criado_por_nome',v_nome);
END
$function$
;
