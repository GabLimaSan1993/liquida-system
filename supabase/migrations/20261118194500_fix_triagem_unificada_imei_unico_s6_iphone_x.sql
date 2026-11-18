-- Corrige a divergência entre Triagem Unificada e a regra central de IMEIs.
-- Galaxy S6, S6 Edge (+), iPhone X têm IMEI 1 obrigatório e IMEI 2 opcional.
-- A regra também é a mesma usada na Triagem Funcional e ALS.
-- Não altera nenhum aparelho, status, histórico, IMEI ou movimento de estoque.

DO $patch$
DECLARE
 def text;
 old_regra text := $old$
 v_dois_imeis:=v_condicao not in ('bloqueado','nao_liga','danos_tela')
   and v_celular
   and v_modelo !~ '(IPHONE[[:space:]]*[5678](S|C)?([[:space:]]|PLUS|$))'
   and v_modelo !~ '((MOTO(ROLA)?[[:space:]]+)?ONE[[:space:]]+(MICRO|MACRO)([[:space:]]|$))';$old$;
 nova_regra text := $new$
 -- Usar a mesma regra oficial de IMEI da Triagem Funcional/ALS.
 -- Galaxy S6/S6 Edge e iPhone X: IMEI 1 obrigatório; IMEI 2 opcional.
 v_dois_imeis:=v_condicao not in ('bloqueado','nao_liga','danos_tela')
   and v_celular
   and liquida_private.triagem_exige_dois_imeis(v_modelo,false);$new$;
 old_bloqueio text := $old$
     if not v_dois_imeis and v_imei2 is not null then
       raise exception 'IMEI 2 não aplicável à condição/modelo selecionado';
     end if;$old$;
 novo_bloqueio text := $new$
     -- Em modelos de IMEI único o segundo código é opcional, não proibido;
     -- se informado, já foi validado acima (15 dígitos e distinto).
     if v_condicao in ('bloqueado','danos_tela') and v_imei2 is not null then
       raise exception 'Na condição selecionada informe no máximo um IMEI físico';
     end if;$new$;
BEGIN
 SELECT pg_get_functiondef('liquida_private.triagem_unificada_tr_operar(jsonb)'::regprocedure) INTO def;
 IF def IS NULL THEN RAISE EXCEPTION 'Função do piloto não localizada'; END IF;
 IF strpos(def,nova_regra)>0 AND strpos(def,novo_bloqueio)>0 THEN
   RAISE NOTICE 'Regra já corrigida; nenhuma alteração adicional';
   RETURN;
 END IF;
 IF strpos(def,old_regra)=0 OR strpos(def,old_bloqueio)=0 THEN
   RAISE EXCEPTION 'Mudança concorrente detectada na função. Não aplicar alteração parcial.';
 END IF;
 def:=replace(replace(def,old_regra,nova_regra),old_bloqueio,novo_bloqueio);
 EXECUTE def;
END
$patch$;

-- Testes sem escrita de dados operacionais: deixar falhar a migração se a
-- regra central voltar a exigir um IMEI inexistente nesses aparelhos.
DO $test$
DECLARE m text;
BEGIN
 FOREACH m IN ARRAY ARRAY[
   'SAMSUNG GALAXY S6 32GB GOLD',
   'SAMSUNG GALAXY S6 EDGE 32GB BLACK',
   'SAMSUNG GALAXY S6 EDGE PLUS 32GB WHITE',
   'APPLE IPHONE X 64GB GRAY',
   'IPHONE X INT'
 ] LOOP
   IF liquida_private.triagem_exige_dois_imeis(m,false) THEN
     RAISE EXCEPTION 'Regressão: modelo exige IMEI2: %',m;
   END IF;
   PERFORM liquida_private.triagem_validar_identificacao(m,'354890123456789',null,false,false);
 END LOOP;
 IF NOT liquida_private.triagem_exige_dois_imeis('IPHONE XR',false)
    OR NOT liquida_private.triagem_exige_dois_imeis('GALAXY S24',false) THEN
    RAISE EXCEPTION 'Regressão: IMEI2 indevidamente liberado para modelo não abrangido';
 END IF;
END $test$;
