-- Corrige o destino do 'Não liga' na Funcional, inclusive em OSs de retriagem.
-- Preserva testes e IMEIs anteriores; registra o novo encaminhamento na auditoria privada.
-- A exceção não relaxa as regras normais de laudos e divergências para outros motivos.

CREATE OR REPLACE FUNCTION liquida_private.triagem_defeitos_grade_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare negativa boolean; concluiu boolean; bloqueado boolean; laudo_pendente boolean; j jsonb;
 compra text; condicao text; sufixo text; exige_laudo boolean; contrato text; motivo text;
begin
 -- RPC-authorized, audit-protected exception; ordinary laudo rules still apply.
 if tg_op='UPDATE'
    and new.status_atual='Aguardando triagem cosmética'
    and new.resultado_triagem_funcional='BAD'
    and coalesce(new.defeitos_adicionais,'') ilike '%Não liga — divergência funcional%'
    and exists(
      select 1 from liquida_private.triagem_nao_liga_encaminhamentos e
       where e.triagem_id=new.id and e.voucher=new.voucher
         and e.usuario_id=auth.uid()
         and e.status_novo='Aguardando triagem cosmética'
         and e.dados_posteriores is null
         and e.registrado_em >= now()-interval '5 minutes'
    ) then
   new.grade:='QUEBRADO';
   new.rebaixado_bateria:=false;
   return new;
 end if;
 if tg_op = 'UPDATE' then
  if new.defeitos_adicionais is distinct from old.defeitos_adicionais
   and new.defeitos_adicionais is not distinct from liquida_private.triagem_limpar_faixas_bateria(old.defeitos_adicionais)
   and (to_jsonb(new) - 'defeitos_adicionais') = (to_jsonb(old) - 'defeitos_adicionais') then
   return new;
  end if;
 end if;
 if new.data_funcional is null then return new; end if;
 begin j:=new.respostas_funcional::jsonb; exception when others then j:='{}'::jsonb; end;
 if new.origem_triagem not in ('liquida','devolucao_b2c') and not coalesce((j->'identificacao'->>'danos_tela')::boolean,false) then return new; end if;
 if new.origem_triagem='gaia' and coalesce((j->'identificacao'->>'danos_tela')::boolean,false) then new.origem_triagem:='liquida'; end if;
 if coalesce((j->'identificacao'->>'danos_tela')::boolean,false) and lower(coalesce(new.defeitos_adicionais,'')) !~ '(^|;)[[:space:]]*danos da tela([[:space:]]*;|[[:space:]]*$)' then
  new.defeitos_adicionais:=concat_ws('; ',nullif(trim(new.defeitos_adicionais),''),'Danos da tela');
 end if;
 negativa:=liquida_private.triagem_funcional_tem_negativa(new.respostas_funcional);
 bloqueado:=liquida_private.triagem_bloqueio_exige_laudo(new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);
 if liquida_private.triagem_defeito_exige_quebrado(new.defeitos_adicionais) then
  new.resultado_triagem_funcional:='BAD'; new.grade:='QUEBRADO'; new.rebaixado_bateria:=false;
 elsif negativa or bloqueado then new.resultado_triagem_funcional:='BAD'; end if;
 if tg_op='INSERT' then concluiu:=true;
 else concluiu:=new.data_funcional is distinct from old.data_funcional or new.respostas_funcional is distinct from old.respostas_funcional; end if;
 laudo_pendente:=new.data_laudo is null or new.data_laudo<new.data_funcional;

 -- Nunca usa a grade obtida na triagem como condição da compra.
 -- Só YBV pode consultar o contrato YBV; GRV/DEV com mesmos números não se misturam.
 if new.voucher ~ '^(YBV)+[0-9]+$' then
  contrato:='YBV'||regexp_replace(new.voucher,'^(YBV)+','');
  select g.condicao_aparelho,g.condicao_sufixo into condicao,sufixo
   from public.tradein_geral g where g.voucher_ybv=contrato;
  if nullif(btrim(condicao),'') is null and nullif(btrim(sufixo),'') is null then
   select h.condicao_aparelho,substring(upper(h.sku_original) from '(BM|TR)$') into condicao,sufixo
    from public.tradein_historico h where h.voucher_key=substring(contrato from 4);
  end if;
 end if;
 if nullif(btrim(condicao),'') is null and nullif(btrim(sufixo),'') is null then
  condicao:=coalesce(nullif(btrim(j#>>'{destino,condicao_declarada}'),''),new.condicao);
  sufixo:=nullif(btrim(j#>>'{destino,condicao_sufixo_declarado}'),'');
 end if;
 compra:=liquida_private.triagem_condicao_compra(condicao,sufixo);
 exige_laudo:=liquida_private.triagem_laudo_por_compra(condicao,sufixo,new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);

 if (concluiu and exige_laudo) or (exige_laudo and laudo_pendente and new.status_atual ilike '%cosm%') then
  if new.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=new.imei and w.status='confirmado') then
   raise exception 'A condição de compra e a negativa funcional exigem laudo. Regularize o vínculo de armazenagem antes de prosseguir.';
  end if;
  if new.status_atual is distinct from 'Finalizado' then new.status_atual:='Aguardando laudo'; end if;
 elsif concluiu and not exige_laudo and new.status_atual='Aguardando laudo' then
  new.status_atual:='Aguardando triagem cosmética';
 end if;
 if concluiu and jsonb_typeof(j)='object' then
  motivo:=case when exige_laudo and compra='BM' then 'Compra BM com negativa na triagem funcional'
   when exige_laudo and compra='TR' then 'Compra TR/Defeituoso com negativa em ligar ou desbloqueio'
   when compra='TR' then 'Compra TR/Defeituoso sem negativa em ligar ou desbloqueio'
   when compra='BM' then 'Compra BM sem negativa na funcional'
   else 'Condição de compra sem regra de laudo' end;
  j:=jsonb_set(j,'{destino}',coalesce(j->'destino','{}'::jsonb)||jsonb_build_object('laudo',exige_laudo,'motivo',motivo,'condicao_declarada',condicao,'condicao_sufixo_declarado',compra));
  new.respostas_funcional:=j::text;
 end if;
 return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.assurant_triagem_nao_liga(p_voucher text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
DECLARE
 v text:=upper(btrim(coalesce(p_voucher,'')));
 r jsonb; ordem jsonb; t public.assurant_triagem%ROWTYPE;
 snap jsonb; v_agora timestamp without time zone:=timezone('UTC',now());
 v_tinha_funcional boolean:=false; v_log_id bigint;
 v_motivo text:='Não liga — divergência funcional. Encaminhar à triagem cosmética; não enviar para Análise Assurant.';
 v_respostas jsonb;
BEGIN
 IF NOT liquida_private.triagem_pode_operar() THEN
   RAISE EXCEPTION 'Sem permissão para triagem funcional' USING ERRCODE='42501';
 END IF;
 IF v !~ '^[A-Z][A-Z0-9_-]{2,63}$' THEN RAISE EXCEPTION 'Voucher inválido'; END IF;
 -- Preserva Sem Ordem e divergência de IMEI já pendentes.
 r:=public.assurant_triagem_checar_ordem(v);
 IF coalesce((r->>'divergencia')::boolean,false) THEN RETURN r; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(v,0));
 SELECT * INTO t FROM public.assurant_triagem WHERE voucher=v FOR UPDATE;
 v_tinha_funcional:=FOUND AND t.data_funcional IS NOT NULL;
 IF FOUND AND t.status_atual='Aguardando triagem cosmética'
    AND (coalesce(t.respostas_funcional::jsonb#>>'{destino,nao_liga_para_triagem}','')='true'
         OR EXISTS(select 1 from liquida_private.triagem_nao_liga_encaminhamentos e
            where e.voucher=v and e.triagem_id=t.id and e.status_novo='Aguardando triagem cosmética'))
 THEN
   RETURN jsonb_build_object('ok',true,'divergencia',true,'nao_liga_local',true,
     'idempotente',true,'voucher',v,'tipo_problema','nao_liga',
     'destino','triagem_cosmetica','status','Aguardando triagem cosmética',
     'modelo',t.modelo,'motivo',v_motivo);
 END IF;
 IF FOUND AND (coalesce(t.status_atual,'')<>'Aguardando triagem funcional'
             OR t.data_alocacao IS NOT NULL OR t.data_oracle IS NOT NULL
             OR t.oracle_confirmado_em IS NOT NULL) THEN
   RAISE EXCEPTION 'Voucher já avançou no processo (%). Não é possível substituir a triagem anterior.',
      t.status_atual;
 END IF;
 IF FOUND AND EXISTS(SELECT 1 FROM public.wms_alocacoes a
                       WHERE a.imei=t.imei AND a.status='confirmado' AND a.retirado_em IS NULL) THEN
   RAISE EXCEPTION 'Aparelho já está alocado no WMS. Concilie o vínculo antes de redirecionar.';
 END IF;
 ordem:=liquida_private.triagem_ordem_contexto(v);
 IF ordem->>'estado'<>'ativo' AND NOT liquida_private.triagem_sem_ordem_autorizado(v,ordem->>'estado') THEN
   RAISE EXCEPTION 'Sem Ordem: a divergência deve ser regularizada antes da triagem.';
 END IF;
 snap:=CASE WHEN FOUND THEN to_jsonb(t) ELSE NULL END;
 -- Preserve functional history and IMEIs from earlier triage; record this exception separately.
 IF v_tinha_funcional THEN
   INSERT INTO liquida_private.triagem_nao_liga_encaminhamentos(
      voucher,triagem_id,status_anterior,status_novo,motivo,usuario_id,dados_anteriores)
   VALUES(v,t.id,t.status_atual,'Aguardando triagem cosmética',
      v_motivo,auth.uid(),snap) RETURNING id INTO v_log_id;
   UPDATE public.assurant_triagem
     SET status_atual='Aguardando triagem cosmética',
         origem_triagem='liquida',
         resultado_triagem_funcional='BAD',
         defeitos_adicionais=CASE
           WHEN coalesce(defeitos_adicionais,'') ILIKE '%Não liga — divergência funcional%'
             THEN defeitos_adicionais
           ELSE concat_ws('; ',nullif(btrim(coalesce(defeitos_adicionais,'')),''),'Não liga — divergência funcional')
         END,
         atualizado_em=v_agora
    WHERE id=t.id RETURNING * INTO t;
   UPDATE liquida_private.triagem_nao_liga_encaminhamentos
     SET dados_posteriores=to_jsonb(t)
    WHERE id=v_log_id;
   RETURN jsonb_build_object('ok',true,'divergencia',true,'nao_liga_local',true,
      'tipo_problema','nao_liga','voucher',v,'modelo',t.modelo,'retriagem',true,
      'identificacao_nao_bipada',true,'destino','triagem_cosmetica',
      'status',t.status_atual,'motivo',v_motivo,'criado_em',now(),
      'criado_por_nome',(SELECT nome FROM public.user_profiles WHERE id=auth.uid()));
 END IF;
 v_respostas:=jsonb_build_object(
   'versao',3,'origem','nao_liga_declarado_na_funcional',
   'identificacao',jsonb_build_object('imei1',NULL,'imei2',NULL,
      'identificacao_nao_bipada',true,'conferencia_imei','nao_realizada'),
   'produto',jsonb_build_object('modelo',coalesce(t.modelo,ordem->>'modelo')),
   'respostas',jsonb_build_array(
      jsonb_build_object('pergunta','O aparelho liga?','resposta','nao',
         'divergente',true,'observacao','Teste funcional completo não realizado — aparelho não liga')),
   'destino',jsonb_build_object('laudo',false,'nao_liga_para_triagem',true,
      'motivo',v_motivo,'etapa','triagem_cosmetica'),
   'respondido_em',to_char(v_agora,'YYYY-MM-DD"T"HH24:MI:SS'));
 -- NÃO popula data_funcional: não houve triagem funcional completa.
 -- Isso evita declarar falso teste/IMEI e mantém a exceção no fluxo cosmético.
 INSERT INTO public.assurant_triagem(
    voucher,imei,modelo,sku,status_atual,origem_triagem,
    resultado_triagem_funcional,defeitos_adicionais,respostas_funcional,
    atualizado_em)
 VALUES(v,NULL,coalesce(t.modelo,ordem->>'modelo'),
        coalesce(t.sku,ordem->>'sku'),
        'Aguardando triagem cosmética','liquida','BAD',
        concat_ws('; ',nullif(btrim(coalesce(t.defeitos_adicionais,'')),''),
          'Não liga — divergência funcional'),
        v_respostas::text,v_agora)
 ON CONFLICT(voucher) DO UPDATE SET
    status_atual='Aguardando triagem cosmética',
    origem_triagem='liquida',
    modelo=coalesce(public.assurant_triagem.modelo,EXCLUDED.modelo),
    sku=coalesce(public.assurant_triagem.sku,EXCLUDED.sku),
    resultado_triagem_funcional='BAD',
    defeitos_adicionais=EXCLUDED.defeitos_adicionais,
    respostas_funcional=EXCLUDED.respostas_funcional,
    atualizado_em=v_agora
 RETURNING * INTO t;
 INSERT INTO liquida_private.triagem_nao_liga_encaminhamentos(
   voucher,triagem_id,status_anterior,status_novo,motivo,usuario_id,
   dados_anteriores,dados_posteriores)
 VALUES(v,t.id,snap->>'status_atual',t.status_atual,v_motivo,auth.uid(),snap,to_jsonb(t));
 RETURN jsonb_build_object(
   'ok',true,'divergencia',true,'nao_liga_local',true,
   'tipo_problema','nao_liga','voucher',v,'modelo',t.modelo,
   'destino','triagem_cosmetica','status',t.status_atual,
   'motivo',v_motivo,'criado_em',now(),
   'criado_por_nome',(SELECT nome FROM public.user_profiles WHERE id=auth.uid()));
END;
$function$;
