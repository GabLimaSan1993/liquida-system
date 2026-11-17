-- Correção operacional: retriagem funcional válida após Não Liga / Laudo pendente.
-- Não permite avançar se há laudo emitido, status avançado, estoque WMS ativo
-- ou se a nova funcional ainda indica motivo de laudo.

CREATE OR REPLACE FUNCTION liquida_private.triagem_retriagem_sem_laudo_valida(p_antigo assurant_triagem, p_novo assurant_triagem)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare j jsonb;
begin
  if p_antigo.status_atual is distinct from 'Aguardando laudo'
      or p_novo.status_atual is distinct from 'Aguardando triagem cosmética'
      or p_novo.voucher is distinct from p_antigo.voucher
      or p_antigo.data_laudo is not null or p_novo.data_laudo is not null
      or p_antigo.data_cosmetico is not null or p_antigo.data_alocacao is not null
      or p_antigo.data_oracle is not null or p_antigo.oracle_confirmado_em is not null
      or p_novo.data_cosmetico is not null or p_novo.data_alocacao is not null
      or p_novo.data_oracle is not null or p_novo.oracle_confirmado_em is not null
  then return false; end if;

  if auth.uid() is null or p_novo.funcional_por is distinct from auth.uid()
      or p_novo.data_funcional is null
      or p_novo.data_funcional is not distinct from p_antigo.data_funcional
      or (p_antigo.data_funcional is not null
          and p_novo.data_funcional <= p_antigo.data_funcional)
      or p_novo.respostas_funcional is not distinct from p_antigo.respostas_funcional
      or nullif(btrim(p_novo.imei),'') is null
      or nullif(btrim(p_novo.resultado_triagem_funcional),'') is null
  then return false; end if;

  if exists(select 1 from public.triagem_laudos l
            where l.voucher=p_antigo.voucher)
      or exists(select 1 from public.wms_alocacoes w
        where (upper(btrim(coalesce(w.voucher,'')))=upper(btrim(p_antigo.voucher))
           or (nullif(btrim(p_antigo.imei),'') is not null and btrim(w.imei)=btrim(p_antigo.imei)))
          and w.status in ('confirmado','reservado')
          and w.retirado_em is null)
  then return false; end if;

  if liquida_private.laudo_requer_imei_contrato(
       p_novo.aparelho_bloqueado,
       p_novo.defeitos_adicionais,
       p_novo.respostas_funcional
     )
  then return false; end if;

  begin j:=p_novo.respostas_funcional::jsonb;
  exception when others then return false; end;
  return jsonb_typeof(j)='object'
     and j->>'versao'='3'
     and j#>>'{destino,laudo}'='false'
     and jsonb_typeof(j->'respostas')='array'
     and jsonb_array_length(j->'respostas')>0
     and nullif(btrim(j#>>'{identificacao,imei1}'),'') is not null;
end;
$function$
;
CREATE OR REPLACE FUNCTION liquida_private.triagem_utilizar_imei_contrato_apos_laudo()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare ref jsonb; im text;
begin
  if old.status_atual<>'Aguardando laudo'
      or new.status_atual<>'Aguardando triagem cosmética'
      or not liquida_private.laudo_requer_imei_contrato(
         old.aparelho_bloqueado,old.defeitos_adicionais,old.respostas_funcional)
  then return new; end if;

  -- Nova Funcional auditada e conclusiva: o aparelho passou a ligar,
  -- nenhum Laudo havia sido emitido e o novo resultado não pede Laudo.
  -- Não marcar o IMEI contratual como leitura física nessa situação.
  if liquida_private.triagem_retriagem_sem_laudo_valida(old,new)
  then return new; end if;

  ref:=liquida_private.triagem_ordem_contexto(old.voucher);
  im:=nullif(btrim(ref->>'imei'),'');
  if im is null or ref->>'estado'<>'ativo' then
    raise exception 'Voucher % sem IMEI contratual ativo. Regularize o cadastro antes de concluir o Laudo.',old.voucher using errcode='22023';
  end if;

  if not exists(
      select 1 from public.triagem_laudos l where l.voucher=old.voucher
       and l.imei=im and l.imei_contrato=im and l.origem_imei='contrato'
  ) then
    raise exception 'Voucher % ainda não possui Laudo registrado com o IMEI contratual.',old.voucher using errcode='22023';
  end if;
  if old.imei is distinct from im then
    insert into public.assurant_rastreabilidade_ajustes(
      imei,campo,valor_anterior,valor_novo,motivo,criado_por
    ) values(
      im,'imei',old.imei,im,
      'Após o Laudo de Bloqueado/Não Liga, IMEI contratual vinculado ao voucher. IMEI anterior preservado para auditoria.',
      auth.uid()
    );
  end if;
  new.imei:=im;
  return new;
end;
$function$
;
REVOKE ALL ON FUNCTION liquida_private.triagem_retriagem_sem_laudo_valida(public.assurant_triagem, public.assurant_triagem) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION liquida_private.triagem_utilizar_imei_contrato_apos_laudo() FROM PUBLIC, anon, authenticated;
