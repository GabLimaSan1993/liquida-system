-- IMEI opcional quando bloqueado, rastreabilidade sem fingir leitura física.
CREATE OR REPLACE FUNCTION liquida_private.triagem_validar_identificacao(p_modelo text, p_imei1 text, p_imei2 text, p_bloqueado boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'liquida_private'
AS $function$
begin
 if coalesce(p_bloqueado,false) and nullif(btrim(p_imei1),'') is null and nullif(btrim(p_imei2),'') is null then
   return;
 end if;
 if liquida_private.triagem_tipo(p_modelo)='CELULAR' and not liquida_private.triagem_exige_dois_imeis(p_modelo,p_bloqueado) then
  if coalesce(p_imei1,'') !~ '^[0-9]{15}$' then raise exception 'O IMEI deve ter exatamente 15 dígitos numéricos.'; end if;
  if p_imei2 is not null and (p_imei2 !~ '^[0-9]{15}$' or p_imei1=p_imei2) then raise exception 'O IMEI 2 deve ter 15 dígitos e ser diferente do IMEI 1.'; end if;
 else
  perform liquida_private.triagem_validar_codigos(liquida_private.triagem_tipo(p_modelo),p_imei1,p_imei2);
 end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assurant_triagem_identificar(p_voucher text, p_imei1 text, p_imei2 text, p_modelo text, p_sku text, p_bloqueado boolean, p_danos_tela boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare v text:=upper(trim(p_voucher)); a text:=nullif(trim(p_imei1),''); r jsonb; esperado text;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional' using errcode='42501'; end if;
 if coalesce(p_bloqueado,false) and not coalesce(p_danos_tela,false) and a is null then
   if coalesce(v,'')='' or coalesce(trim(p_modelo),'')='' then raise exception 'Voucher e modelo obrigatórios'; end if;
   r:=public.assurant_triagem_checar_ordem(v);
   if coalesce((r->>'divergencia')::boolean,false) then return r; end if;
   perform liquida_private.triagem_validar_identificacao(p_modelo,a,p_imei2,true,false);
   return jsonb_build_object('ok',true,'prosseguir',true,'confere',false,'divergencia',false,
     'aparelho_bloqueado',true,'identificacao_nao_bipada',true,'imei_canonico',null,
     'conferencia_imei','nao_realizada','tipo',liquida_private.triagem_tipo(p_modelo));
 end if;
 if not coalesce(p_danos_tela,false) then return public.assurant_triagem_identificar(p_voucher,p_imei1,p_imei2,p_modelo,p_sku,p_bloqueado); end if;
 if coalesce(v,'')='' or coalesce(trim(p_modelo),'')='' then raise exception 'Voucher e modelo obrigatórios'; end if;
 r:=public.assurant_triagem_checar_ordem(v);
 if coalesce((r->>'divergencia')::boolean,false) then return r; end if;
 perform liquida_private.triagem_validar_identificacao(p_modelo,a,p_imei2,p_bloqueado,true);
 esperado:=liquida_private.triagem_codigo_esperado(v);
 -- Prosseguir é uma exceção declarada, não uma confirmação fictícia do IMEI.
 return jsonb_build_object('ok',true,'prosseguir',true,'confere',coalesce(upper(a)=upper(esperado),false),
  'divergencia',false,'danos_tela',true,'identificacao_nao_bipada',a is null,'tipo',liquida_private.triagem_tipo(p_modelo),
  'imei_canonico',a);
end;
$function$
;

CREATE OR REPLACE FUNCTION liquida_private.triagem_identificacao_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare j jsonb; a text; b text; tipo text; esperado text; ordem jsonb; danos boolean; bloqueado boolean; referencia text;
begin
 if exists(select 1 from public.assurant_divergencias_imei d where d.voucher=new.voucher and d.status in('pendente','devolver'))
 and new.status_atual not in('Aguardando definição Assurant - IMEI divergente','Aguardando definição Assurant - Divergência','Segregado - devolução à origem') then
  raise exception 'Divergência: aparelho segregado aguardando diretriz da Assurant.';
 end if;
 if new.origem_triagem not in ('liquida','devolucao_b2c') or new.data_funcional is null then return new; end if;
 if tg_op='UPDATE' and new.data_funcional is not distinct from old.data_funcional and new.respostas_funcional is not distinct from old.respostas_funcional then return new; end if;
 ordem:=liquida_private.triagem_ordem_contexto(new.voucher);
 if ordem->>'estado'<>'ativo' and not liquida_private.triagem_sem_ordem_autorizado(new.voucher,ordem->>'estado') then
  raise exception 'Sem Ordem: encaminhe o aparelho para decisão da Assurant antes da triagem funcional.';
 end if;
 begin j:=new.respostas_funcional::jsonb; exception when others then raise exception 'Identificação física obrigatória na triagem funcional.'; end;
 a:=nullif(trim(j->'identificacao'->>'imei1'),''); b:=nullif(trim(j->'identificacao'->>'imei2'),'');
 danos:=coalesce((j->'identificacao'->>'danos_tela')::boolean,false);
 bloqueado:=coalesce((j->'identificacao'->>'aparelho_bloqueado')::boolean,false);
 tipo:=liquida_private.triagem_tipo(coalesce(j->'produto'->>'modelo',new.modelo));
 perform liquida_private.triagem_validar_identificacao(coalesce(j->'produto'->>'modelo',new.modelo),a,b,bloqueado,danos);
 esperado:=liquida_private.triagem_codigo_esperado(new.voucher);
 if new.devolucao_id is not null then
  select case when definicao_assurant_status='autorizado' then imei_recebido else imei_vendido end into esperado from public.devolucoes_b2c where id=new.devolucao_id;
 end if;
 if danos or (bloqueado and a is null) then
  referencia:=case when tg_op='UPDATE' then coalesce(old.imei,esperado) else esperado end;
  -- Mantém a referência cadastral para rastreabilidade, distinguindo-a da bipagem.
  new.imei:=coalesce(a,referencia);
  new.imei2:=null; new.tipo_aparelho:=tipo; new.aparelho_bloqueado:=bloqueado;
  j:=jsonb_set(j,'{identificacao}',coalesce(j->'identificacao','{}'::jsonb)||jsonb_build_object(
   'imei1',a,'imei2',null,'danos_tela',danos,'aparelho_bloqueado',bloqueado,'identificacao_nao_bipada',a is null,
   'origem_imei',case when a is null then 'referencia_cadastro' else 'bipagem' end,
   'conferencia_imei',case when a is null or esperado is null then 'nao_realizada' when upper(a)=upper(esperado) then 'confere' else 'divergente' end));
  new.respostas_funcional:=j::text;
  return new;
 end if;
 if esperado is not null and upper(esperado)<>upper(a) and upper(esperado)<>upper(coalesce(b,''))
 and not exists(select 1 from public.assurant_divergencias_imei d where d.voucher=new.voucher and d.status='autorizado' and d.imei1=a and coalesce(d.imei2,'')=coalesce(b,'')) then
  raise exception 'Identificação divergente do contrato. Segregue o aparelho para decisão da Assurant.';
 end if;
 if new.imei is distinct from a and new.imei is distinct from b then raise exception 'IMEI principal deve corresponder a uma das bipagens.'; end if;
 new.imei2:=case when new.imei=b then a else b end; new.tipo_aparelho:=tipo; new.aparelho_bloqueado:=bloqueado;
 return new;
end;
$function$
;