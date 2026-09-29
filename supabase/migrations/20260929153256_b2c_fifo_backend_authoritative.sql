-- Backend autoritativo para alocação automática B2C.
-- O navegador não decide mais o IMEI; qualquer tentativa cliente é recalculada no banco.

create or replace function public.b2c_fifo_backend_guard()
returns trigger
language plpgsql
set search_path=public
as $function$
declare
  v_sku_raw text;
  v_sku_base text;
  v_sku_mapeado text;
  v_grade_alvo text;
  v_usuario uuid;
  v_c record;
  v_res jsonb;
begin
  if tg_op <> 'UPDATE'
     or old.status <> 'aguardando_alocacao'
     or new.status <> 'alocado'
     or coalesce(new.status_anymarket,old.status_anymarket,'') <> 'Pago'
  then
    return new;
  end if;

  v_usuario := coalesce(new.alocado_por,auth.uid(),new.criado_por,old.criado_por);
  v_sku_raw := coalesce(
    nullif(btrim(new.sku_definido),''),
    nullif(btrim(new.sku_produto),'')
  );
  v_sku_base := regexp_replace(coalesce(v_sku_raw,''),'-CC[0-9]+$','','i');

  select nullif(btrim(d.sku_als),'')
    into v_sku_mapeado
  from public.sku_de_para d
  where upper(btrim(d.sku_assurant))=upper(btrim(v_sku_base))
  limit 1;

  v_sku_base := coalesce(v_sku_mapeado,v_sku_base);

  v_grade_alvo := public.b2c_grade_alvo_exata(
    v_sku_raw,
    coalesce(nullif(btrim(new.grade_definida),''),new.grade_produto)
  );

  new.imei_alocado := null;
  new.sku_alocado := null;
  new.grade_alocada := null;
  new.wms_alocacao_id := null;

  for v_c in
    select c.*
    from public.wms_buscar_candidatos_saida(v_sku_base) c
    where
      (
        v_grade_alvo='OUTLET'
        and lower(coalesce(c.status_bateria,''))='saúde da bateria entre 70 e 79%'
        and public.b2c_grade_ordem_exata(c.grade)>=public.b2c_grade_ordem_exata('BOM')
      )
      or
      (
        v_grade_alvo<>'OUTLET'
        and public.b2c_normalizar_grade_exata(c.grade)=v_grade_alvo
        and lower(coalesce(c.status_bateria,'')) not in (
          'saúde da bateria entre 70 e 79%',
          'saúde da bateria abaixo 70%',
          'saúde da bateria abaixo de 80%'
        )
      )
    order by c.data_subinv,c.imei
  loop
    v_res := public.wms_reservar_saida(
      v_c.imei,
      'B2C',
      new.id::text,
      v_usuario
    );

    if coalesce((v_res->>'ok')::boolean,false) then
      new.imei_alocado := v_c.imei;
      new.sku_alocado := v_c.sku;
      new.grade_alocada := v_c.grade;
      new.wms_alocacao_id := nullif(v_res->>'alocacao_id','')::uuid;
      new.alocado_em := coalesce(new.alocado_em,now());
      new.alocado_por := v_usuario;
      new.motivo_analise := null;
      new.atualizado_em := now();
      return new;
    end if;
  end loop;

  new.status := 'aguardando_definicao_produto';
  new.imei_alocado := null;
  new.sku_alocado := null;
  new.grade_alocada := null;
  new.wms_alocacao_id := null;
  new.alocado_em := null;
  new.alocado_por := null;
  new.data_subinv_alocado := null;
  new.local_subinv_alocado := null;
  new.local_alocado := null;
  new.fifo_posicao := null;
  new.fifo_total_candidatos := null;
  new.fifo_origem := null;
  new.definicao_status := 'pendente';
  new.definicao_solicitada_em := coalesce(new.definicao_solicitada_em,now());
  new.definicao_solicitada_por := coalesce(new.definicao_solicitada_por,v_usuario);
  new.motivo_analise := concat(
    'Nenhum aparelho ',
    coalesce(v_grade_alvo,'de grade válida'),
    ' elegível e reservável encontrado no FIFO para ',
    coalesce(v_sku_base,'SKU não identificado')
  );
  new.atualizado_em := now();

  return new;
end;
$function$;

drop trigger if exists aa0_b2c_fifo_backend_guard_trg on public.pedidos_b2c;
create trigger aa0_b2c_fifo_backend_guard_trg
before update of status,imei_alocado,sku_alocado,grade_alocada
on public.pedidos_b2c
for each row
execute function public.b2c_fifo_backend_guard();

create or replace function public.b2c_processar_alocacao_backend(p_pedido_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path=public
as $function$
declare
  v_user uuid := auth.uid();
  v_p public.pedidos_b2c%rowtype;
begin
  if v_user is null then
    raise exception 'Usuário não autenticado' using errcode='42501';
  end if;

  select * into v_p
  from public.pedidos_b2c
  where id=p_pedido_id
  for update;

  if not found then
    return jsonb_build_object('ok',false,'erro','Pedido não encontrado.');
  end if;

  if v_p.status<>'aguardando_alocacao' then
    return jsonb_build_object(
      'ok',true,'status',v_p.status,'id_anymarket',v_p.id_anymarket,
      'imei',v_p.imei_alocado,'ja_processado',true
    );
  end if;

  if coalesce(v_p.status_anymarket,'')<>'Pago' then
    return jsonb_build_object(
      'ok',false,'erro','Pedido não está com status AnyMarket Pago.',
      'status_anymarket',v_p.status_anymarket
    );
  end if;

  update public.pedidos_b2c
  set status='alocado',
      imei_alocado=null,
      sku_alocado=null,
      grade_alocada=null,
      alocado_em=now(),
      alocado_por=v_user,
      atualizado_em=now()
  where id=p_pedido_id
  returning * into v_p;

  return jsonb_build_object(
    'ok',true,'status',v_p.status,'id_anymarket',v_p.id_anymarket,
    'imei',v_p.imei_alocado,'sku_alocado',v_p.sku_alocado,
    'grade_alocada',v_p.grade_alocada,'wms_alocacao_id',v_p.wms_alocacao_id,
    'definicao_status',v_p.definicao_status,'motivo',v_p.motivo_analise
  );
end;
$function$;

revoke all on function public.b2c_processar_alocacao_backend(uuid) from public,anon;
grant execute on function public.b2c_processar_alocacao_backend(uuid) to authenticated;

create or replace function public.assurant_triagem_guard_reserva_b2c()
returns trigger
language plpgsql
set search_path=public
as $function$
begin
  if new.status_atual='Reservado para pedido B2C'
     and old.status_atual is distinct from new.status_atual
     and not exists (
       select 1
       from public.wms_alocacoes a
       join public.wms_reservas_saida r
         on r.alocacao_id=a.id
        and r.canal='B2C'
        and r.status in ('reservado','analise','reconciliar')
       where btrim(a.imei)=btrim(new.imei)
         and a.status='confirmado'
     )
  then
    new.status_atual := old.status_atual;
  end if;

  return new;
end;
$function$;

drop trigger if exists aa0_assurant_triagem_guard_reserva_b2c_trg
on public.assurant_triagem;

create trigger aa0_assurant_triagem_guard_reserva_b2c_trg
before update of status_atual
on public.assurant_triagem
for each row
execute function public.assurant_triagem_guard_reserva_b2c();

create or replace function public.b2c_proteger_auditoria_backend()
returns trigger
language plpgsql
set search_path=public
as $function$
begin
  if old.fifo_origem='trigger_banco_100pct'
     and new.fifo_origem is distinct from old.fifo_origem
     and old.status in ('alocado','em_picking','embalado','em_analise','faturado')
  then
    new.data_subinv_alocado := old.data_subinv_alocado;
    new.local_subinv_alocado := old.local_subinv_alocado;
    new.local_alocado := old.local_alocado;
    new.fifo_posicao := old.fifo_posicao;
    new.fifo_total_candidatos := old.fifo_total_candidatos;
    new.fifo_origem := old.fifo_origem;
  end if;

  return new;
end;
$function$;

drop trigger if exists aa1_b2c_proteger_auditoria_backend_trg
on public.pedidos_b2c;

create trigger aa1_b2c_proteger_auditoria_backend_trg
before update of data_subinv_alocado,local_subinv_alocado,local_alocado,
                 fifo_posicao,fifo_total_candidatos,fifo_origem
on public.pedidos_b2c
for each row
execute function public.b2c_proteger_auditoria_backend();

create or replace function public.b2c_validar_motor_alocacao(p_versao integer)
returns jsonb
language sql
stable
set search_path=public
as $function$
  select jsonb_build_object(
    'ok',coalesce(p_versao,0)>=3,
    'versao_minima',3,
    'versao_cliente',coalesce(p_versao,0),
    'mensagem',
      case
        when coalesce(p_versao,0)>=3 then 'ok'
        else 'Esta aba está com uma versão antiga do motor B2C. Atualize a página antes de importar o próximo corte.'
      end
  );
$function$;

revoke all on function public.b2c_validar_motor_alocacao(integer) from public,anon;
grant execute on function public.b2c_validar_motor_alocacao(integer) to authenticated;
