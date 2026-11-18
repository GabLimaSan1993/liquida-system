-- Ajuste pontual: relógios e tablets são identificados por serial alfanumérico.
-- Não altera o status do caso nem autoriza divergências sem conferência.
create or replace function public.assurant_divergencias_regularizar(
 p_caso uuid,p_acao text,p_valor text,p_justificativa text
) returns jsonb
language plpgsql security definer
set search_path to pg_catalog,public,liquida_private
as $function$
declare
 c public.assurant_divergencias_imei%rowtype;
 t public.assurant_triagem%rowtype;
 novo text := upper(btrim(coalesce(p_valor,'')));
 contexto jsonb;
 tipo_identificador text;
begin
 if not public.assurant_divergencias_pode_decidir() then
  raise exception 'Sem autorização para corrigir divergências' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_justificativa,''))) < 8 then
  raise exception 'Informe justificativa com pelo menos 8 caracteres';
 end if;
 select * into c from public.assurant_divergencias_imei where id=p_caso for update;
 if not found or c.status <> 'pendente' then raise exception 'Divergência não está pendente'; end if;
 select * into t from public.assurant_triagem where id=c.triagem_id for update;
 if not found then raise exception 'Triagem original não localizada'; end if;
 if t.status_atual not ilike '%diverg%' and t.status_atual not ilike '%analise%'
    and t.status_atual not ilike '%análise%' and t.status_atual not ilike '%funcional%' then
  raise exception 'Produto já avançou de etapa (%); regularização bloqueada',t.status_atual;
 end if;
 if p_acao='voucher' then
  if novo !~ '^[A-Z][A-Z0-9_-]{2,63}$' or novo=c.voucher then
   raise exception 'Informe um voucher diferente e válido';
  end if;
  contexto:=liquida_private.triagem_ordem_contexto(novo);
  if contexto->>'estado' <> 'ativo' then raise exception 'Voucher correto não encontrado como ordem ativa'; end if;
  if exists(select 1 from public.assurant_triagem where voucher=novo and id<>t.id) then
   raise exception 'Voucher já vinculado a outra triagem';
  end if;
  update public.assurant_triagem set voucher=novo,status_atual='Aguardando triagem funcional',
   atualizado_em=timezone('UTC',now()) where id=t.id;
  update public.assurant_divergencias_imei set status='reconferencia',
   diretriz='Voucher corrigido: '||c.voucher||' → '||novo||'. '||btrim(p_justificativa),
   decidido_por=auth.uid(),decidido_em=now() where id=c.id;
  return jsonb_build_object('ok',true,'voucher_anterior',c.voucher,'voucher_atual',novo,
   'status','Aguardando triagem funcional');
 elsif p_acao='imei' then
  if c.tipo_problema <> 'imei_divergente' then raise exception 'Este caso não é de IMEI divergente'; end if;
  tipo_identificador:=coalesce(nullif(upper(btrim(c.tipo_aparelho)),''),liquida_private.triagem_tipo(c.modelo));
  if tipo_identificador='CELULAR' then
   if novo !~ '^[0-9]{14,16}$' then raise exception 'Informe um IMEI numérico válido'; end if;
  elsif tipo_identificador in ('RELOGIO','TABLET') then
   perform liquida_private.triagem_validar_codigos(tipo_identificador,novo,null);
  else
   raise exception 'Tipo de aparelho não reconhecido para regularização';
  end if;
  if novo not in (
    upper(btrim(coalesce(c.imei1,''))),
    upper(btrim(coalesce(c.imei2,''))),
    upper(btrim(coalesce(c.imei_esperado,'')))
  ) then
   raise exception 'Identificador deve corresponder ao contrato ou a um dos códigos efetivamente bipados';
  end if;
  if exists(select 1 from public.assurant_triagem
    where upper(btrim(imei))=novo and id<>t.id and status_atual not ilike '%cancel%') then
   raise exception 'Identificador já vinculado a outro produto';
  end if;
  update public.assurant_triagem
   set imei=novo,status_atual='Aguardando triagem funcional',
       atualizado_em=timezone('UTC',now()) where id=t.id;
  update public.assurant_divergencias_imei
   set status='reconferencia',
       diretriz=(case when tipo_identificador='CELULAR' then 'IMEI confirmado: ' else 'Serial confirmado: ' end)
                ||novo||'. '||btrim(p_justificativa),
       decidido_por=auth.uid(),decidido_em=now() where id=c.id;
  return jsonb_build_object('ok',true,'imei',novo,'status','Aguardando triagem funcional');
 else
  raise exception 'Ação de regularização inválida';
 end if;
end
$function$;