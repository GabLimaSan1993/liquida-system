-- A exceção de danos da tela permite uma identificação opcional e auditada.
create function liquida_private.triagem_validar_identificacao(p_modelo text,p_imei1 text,p_imei2 text,p_bloqueado boolean,p_danos_tela boolean) returns void
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
begin
 if coalesce(p_danos_tela,false) then
  if coalesce(p_bloqueado,false) then raise exception 'Selecione apenas uma condição inicial'; end if;
  if nullif(trim(p_imei2),'') is not null then raise exception 'Danos da tela permite informar apenas um código'; end if;
  if nullif(trim(p_imei1),'') is null then return; end if;
  perform liquida_private.triagem_validar_identificacao(p_modelo,p_imei1,null,true);
 else
  perform liquida_private.triagem_validar_identificacao(p_modelo,p_imei1,p_imei2,p_bloqueado);
 end if;
end;
$$;
revoke all on function liquida_private.triagem_validar_identificacao(text,text,text,boolean,boolean) from public,anon,authenticated;

-- Mantém a assinatura anterior para clientes já abertos e as regras normais.
create function public.assurant_triagem_identificar(p_voucher text,p_imei1 text,p_imei2 text,p_modelo text,p_sku text,p_bloqueado boolean,p_danos_tela boolean) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare v text:=upper(trim(p_voucher)); a text:=nullif(trim(p_imei1),''); r jsonb; esperado text;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão para triagem funcional' using errcode='42501'; end if;
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
$$;
revoke all on function public.assurant_triagem_identificar(text,text,text,text,text,boolean,boolean) from public,anon;
grant execute on function public.assurant_triagem_identificar(text,text,text,text,text,boolean,boolean) to authenticated;

create or replace function liquida_private.triagem_identificacao_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
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
 if danos then
  referencia:=case when tg_op='UPDATE' then coalesce(old.imei,esperado) else esperado end;
  -- Mantém a referência cadastral para rastreabilidade, distinguindo-a da bipagem.
  new.imei:=coalesce(a,referencia);
  new.imei2:=null; new.tipo_aparelho:=tipo; new.aparelho_bloqueado:=false;
  j:=jsonb_set(j,'{identificacao}',coalesce(j->'identificacao','{}'::jsonb)||jsonb_build_object(
   'imei1',a,'imei2',null,'danos_tela',true,'identificacao_nao_bipada',a is null,
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
$$;
revoke all on function liquida_private.triagem_identificacao_guard() from public,anon,authenticated;

-- Inclui automaticamente o defeito declarado, mesmo se um cliente omitir o campo.
create or replace function liquida_private.triagem_defeitos_grade_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare negativa boolean; concluiu boolean; bloqueado boolean; laudo_pendente boolean; j jsonb;
begin
 if new.origem_triagem not in ('liquida','devolucao_b2c') or new.data_funcional is null then return new; end if;
 begin j:=new.respostas_funcional::jsonb; exception when others then j:='{}'::jsonb; end;
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
 if ((negativa or bloqueado) and concluiu) or (bloqueado and laudo_pendente and new.status_atual ilike '%cosm%') then
  if new.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=new.imei and w.status='confirmado') then
   raise exception 'Bloqueio ou resposta negativa exige laudo. Regularize o vínculo de armazenagem antes de prosseguir.';
  end if;
  new.status_atual:='Aguardando laudo';
 end if;
 return new;
end;
$$;
revoke all on function liquida_private.triagem_defeitos_grade_guard() from public,anon,authenticated;
