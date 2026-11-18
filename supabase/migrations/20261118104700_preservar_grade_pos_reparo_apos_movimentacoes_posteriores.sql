-- Complemento de segurança de fluxo: a exceção pós-reparo precisa
-- persistir após a armazenagem em qualquer status, até uma nova funcional
-- ou um novo apontamento técnico. Sem liberar bateria crítica.
CREATE OR REPLACE FUNCTION liquida_private.triagem_defeitos_grade_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare negativa boolean; concluiu boolean; bloqueado boolean; laudo_pendente boolean; j jsonb;
 compra text; condicao text; sufixo text; exige_laudo boolean; contrato text; motivo text;
begin
 -- O retorno de reparo validado pela bipagem no Warehouse libera uma NOVA
 -- cosmética: preservar o laudo e a funcional antigos sem reimpô-los na grade.
 -- Se houver nova funcional ou alteração nos defeitos, aplicar regras normais.
 if tg_op='UPDATE'
    and new.retorno_reparo_em is not null
    and (new.data_funcional is null or new.data_funcional at time zone 'UTC' <= new.retorno_reparo_em)
    -- O reparo permanece válido após a cosmética, inclusive em reserva,
    -- pedido e faturamento; a funcional antiga não pode rebaixar a grade.
    and new.defeitos_adicionais is not distinct from old.defeitos_adicionais
    and new.resultado_triagem_funcional is not distinct from old.resultado_triagem_funcional
    and new.respostas_funcional is not distinct from old.respostas_funcional
    and new.data_funcional is not distinct from old.data_funcional
 then
    return new;
 end if;
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
 -- Não liga: o Laudo é obrigatório independentemente da condição BM/TR.
 -- Nenhuma regra de compra pode mandar a divergência direto à Cosmética.
 if new.status_atual='Aguardando laudo'
    and new.origem_triagem='liquida'
    and new.resultado_triagem_funcional='BAD'
    and j->>'origem'='nao_liga_declarado_na_funcional'
    and j#>>'{destino,tipo_laudo}'='DIVERGENCIA'
    and j#>>'{destino,tipo_divergencia}'='NAO_LIGA'
    and j#>>'{destino,laudo}'='true'
    and j#>>'{identificacao,identificacao_nao_bipada}'='true'
 then
   new.grade:='QUEBRADO';
   new.rebaixado_bateria:=false;
   return new;
 end if;
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
$function$
;