CREATE OR REPLACE FUNCTION public.assurant_retriagem_funcional_salvar(p_voucher text, p_imei text, p_sku text, p_modelo text, p_status_proposto text, p_resultado text, p_respostas text, p_status_bateria text, p_bateria_percentual integer, p_defeitos_adicionais text, p_motivo text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_voucher text := upper(trim(coalesce(p_voucher,'')));
  v_motivo text := trim(coalesce(p_motivo,''));
  v_old public.assurant_triagem%rowtype;
  v_status_final text;
  v_downstream boolean := false;
  v_old_snapshot jsonb;
  v_new_snapshot jsonb;
  v_ajuste_id uuid;
  v_now timestamp without time zone := timezone('UTC', now());
begin
  if v_user is null then
    raise exception 'Sessão inválida.';
  end if;
  if v_voucher = '' then
    raise exception 'Voucher obrigatório.';
  end if;
  if length(v_motivo) < 3 then
    raise exception 'Informe o motivo da retriagem com pelo menos 3 caracteres.';
  end if;

  select *
    into v_old
  from public.assurant_triagem
  where upper(trim(voucher)) = v_voucher
  order by coalesce(atualizado_em,criado_em) desc nulls last
  limit 1
  for update;

  if not found then
    raise exception 'Voucher % não encontrado na triagem.', v_voucher;
  end if;
  -- Não substituir o histórico de item fisicamente estocado.
  if coalesce(v_old.status_atual,'') not in
    ('Aguardando triagem funcional','Aguardando laudo','Aguardando triagem cosmética') then
    raise exception 'Retriagem bloqueada: voucher % está em %. Regularize a movimentação de estoque para retornar à funcional.',v_voucher,coalesce(v_old.status_atual,'sem status');
  end if;
  if exists(select 1 from public.wms_alocacoes w
     where (upper(btrim(coalesce(w.voucher,'')))=v_voucher
       or (v_old.imei is not null and btrim(w.imei)=btrim(v_old.imei)))
       and w.status in ('confirmado','reservado') and w.retirado_em is null) then
    raise exception 'Retriagem bloqueada: IMEI/voucher com estoque WMS ativo. Regularize a retirada física antes de refazer a funcional.';
  end if;
  if v_old.data_alocacao is not null or v_old.data_oracle is not null then
    raise exception 'Retriagem bloqueada: alocação e Oracle históricos ainda associados a esta entrada. Regularize o retorno no estoque.';
  end if;
  -- Cadastros antigos de Não liga / Laudo podem estar sem data_funcional.
  -- A revisão será auditada e só é admitida antes de cosmética/estoque.
  if v_old.data_funcional is null then
    if v_old.status_atual not in ('Aguardando laudo','Aguardando triagem cosmética')
       or v_old.data_cosmetico is not null or v_old.data_alocacao is not null
       or v_old.data_oracle is not null or v_old.oracle_confirmado_em is not null
       or exists (select 1 from public.wms_alocacoes w
         where w.imei=v_old.imei and w.status='confirmado' and w.retirado_em is null)
    then
      raise exception 'Registro sem triagem funcional histórica só pode ser revisado antes de cosmética e armazenagem.';
    end if;
  end if;
  if v_old.status_atual='Aguardando laudo' AND (
      v_old.data_laudo is not null OR exists(
        select 1 from public.triagem_laudos l where l.voucher=v_old.voucher
      )
    ) then
    raise exception 'Laudo já emitido. Regularize o Laudo antes de reabrir esta etapa.';
  end if;

  v_old_snapshot := jsonb_strip_nulls(jsonb_build_object(
    'voucher', v_old.voucher,
    'imei', v_old.imei,
    'sku', v_old.sku,
    'modelo', v_old.modelo,
    'status_atual', v_old.status_atual,
    'resultado', v_old.resultado_triagem_funcional,
    'respostas_funcional', v_old.respostas_funcional,
    'status_bateria', v_old.status_bateria,
    'bateria_percentual', v_old.bateria_percentual,
    'defeitos_adicionais', v_old.defeitos_adicionais,
    'data_funcional', v_old.data_funcional,
    'funcional_por', v_old.funcional_por
  ));

  v_downstream := coalesce(v_old.status_atual,'') not in (
    'Aguardando triagem funcional',
    'Aguardando triagem cosmética',
    'Aguardando laudo',
    'Aguardando análise Assurant',
    'Aguardando definição Assurant - IMEI divergente'
  ) AND NOT (
    v_old.status_atual='Em análise de estoque'
    AND EXISTS (
      SELECT 1 FROM public.meli_aparelhos_bloqueados b
      WHERE b.imei=btrim(v_old.imei)
    )
  );

  -- Se o Laudo já foi concluído e o aparelho está na Cosmética,
  -- não devolver automaticamente ao Laudo nem sobrescrever seu histórico.
  if v_old.data_laudo is not null and v_old.status_atual='Aguardando triagem cosmética' then
    v_downstream := true;
  end if;
  v_status_final := case
    when v_downstream then v_old.status_atual
    else coalesce(nullif(trim(p_status_proposto),''), v_old.status_atual)
  end;

  update public.assurant_triagem
  set
    imei = nullif(trim(p_imei),''),
    sku = nullif(trim(p_sku),''),
    modelo = nullif(trim(p_modelo),''),
    status_atual = v_status_final,
    resultado_triagem_funcional = nullif(trim(p_resultado),''),
    respostas_funcional = p_respostas,
    status_bateria = nullif(trim(p_status_bateria),''),
    bateria_percentual = p_bateria_percentual,
    defeitos_adicionais = nullif(trim(p_defeitos_adicionais),''),
    funcional_por = v_user,
    data_funcional = v_now,
    origem_triagem = 'liquida',
    atualizado_em = v_now
  where id = v_old.id;

  select jsonb_strip_nulls(jsonb_build_object(
    'voucher', t.voucher,
    'imei', t.imei,
    'sku', t.sku,
    'modelo', t.modelo,
    'status_atual', t.status_atual,
    'resultado', t.resultado_triagem_funcional,
    'respostas_funcional', t.respostas_funcional,
    'status_bateria', t.status_bateria,
    'bateria_percentual', t.bateria_percentual,
    'defeitos_adicionais', t.defeitos_adicionais,
    'data_funcional', t.data_funcional,
    'funcional_por', t.funcional_por
  ))
  into v_new_snapshot
  from public.assurant_triagem t
  where t.id = v_old.id;

  insert into public.assurant_rastreabilidade_ajustes(
    imei,campo,valor_anterior,valor_novo,motivo,criado_por
  )
  values(
    coalesce(nullif(trim(p_imei),''), v_old.imei),
    'triagem_funcional.revisao',
    v_old_snapshot::text,
    v_new_snapshot::text,
    v_motivo,
    v_user
  )
  returning id into v_ajuste_id;

  return jsonb_build_object(
    'ok', true,
    'id', v_old.id,
    'voucher', v_old.voucher,
    'imei', coalesce(nullif(trim(p_imei),''), v_old.imei),
    'status_atual', v_status_final,
    'status_preservado', v_downstream,
    'ajuste_id', v_ajuste_id,
    'anterior', v_old_snapshot,
    'novo', v_new_snapshot
  );
end;
$function$
;

CREATE OR REPLACE FUNCTION public.assurant_triagem_retriagem_elegibilidade(p_voucher text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare v text:=upper(btrim(coalesce(p_voucher,''))); t public.assurant_triagem%rowtype; w record;
begin
 if not liquida_private.triagem_pode_operar() then raise exception 'Sem permissão de triagem funcional' using errcode='42501'; end if;
 if length(v)<3 or length(v)>90 then raise exception 'Voucher inválido' using errcode='22023'; end if;
 select * into t from public.assurant_triagem where upper(btrim(voucher))=v order by atualizado_em desc nulls last limit 1;
 if not found then return jsonb_build_object('pode_retriar',true); end if;
 select a.voucher,a.status,e.rua,e.bloco,e.andar,e.coluna,e.linha into w
 from public.wms_alocacoes a left join public.wms_enderecos e on e.id=a.endereco_id
 where (upper(btrim(coalesce(a.voucher,'')))=v or (nullif(btrim(t.imei),'') is not null and btrim(a.imei)=btrim(t.imei)))
 and a.status in ('confirmado','reservado') and a.retirado_em is null
 order by case when a.status='confirmado' then 0 else 1 end,a.confirmado_em desc nulls last limit 1;
 if found then
   return jsonb_build_object('pode_retriar',false,'codigo','ESTOQUE_ATIVO','status_atual',t.status_atual,
    'motivo','Aparelho com estoque WMS ativo. Regularize a movimentação física na Gestão de Estoque antes de refazer a Triagem Funcional.',
    'voucher_estoque',w.voucher,'status_wms',w.status,
    'endereco',concat_ws(' / ',case when w.rua is not null then 'Rua '||lpad(w.rua::text,2,'0') end,
    case when w.bloco is not null then 'Bloco '||lpad(w.bloco::text,2,'0') end,
    case when w.andar is not null then 'Andar '||lpad(w.andar::text,2,'0') end,
    case when w.coluna is not null then 'Coluna '||w.coluna end,
    case when w.linha is not null then 'Linha '||lpad(w.linha::text,2,'0') end));
 end if;
 if coalesce(t.status_atual,'') not in ('Aguardando triagem funcional','Aguardando laudo','Aguardando triagem cosmética') then
  return jsonb_build_object('pode_retriar',false,'codigo','ETAPA_INCOMPATIVEL','status_atual',t.status_atual,
   'motivo','O voucher está em '||coalesce(t.status_atual,'etapa não identificada')||'. Regularize sua entrada na fila de Triagem Funcional.');
 end if;
 if t.data_alocacao is not null or t.data_oracle is not null then
  return jsonb_build_object('pode_retriar',false,'codigo','HISTORICO_ESTOQUE_PENDENTE','status_atual',t.status_atual,
   'motivo','O registro já possui alocação e Oracle. Regularize o retorno de estoque antes da retriagem.');
 end if;
 if t.status_atual='Aguardando laudo' and (t.data_laudo is not null or exists(select 1 from public.triagem_laudos l where l.voucher=t.voucher)) then
  return jsonb_build_object('pode_retriar',false,'codigo','LAUDO_EMITIDO','status_atual',t.status_atual,
   'motivo','Laudo já emitido: regularize a etapa de Laudo antes de retornar à funcional.');
 end if;
 return jsonb_build_object('pode_retriar',true,'codigo','LIBERADO','status_atual',t.status_atual);
end;
$function$
;