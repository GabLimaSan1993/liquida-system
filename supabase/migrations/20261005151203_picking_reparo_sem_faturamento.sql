-- Pedido interno: não participa de pedidos comerciais, NF, embalagem ou e-mail B2B.
create table liquida_private.reparo_pedidos (
 id uuid primary key default gen_random_uuid(), lote text not null unique, request_hash text not null unique,
 status text not null default 'picking' check(status in ('picking','aguardando_oracle','em_reparo')),
 criado_em timestamptz not null default now(), criado_por uuid not null references auth.users(id),
 picking_concluido_em timestamptz, picking_concluido_por uuid references auth.users(id),
 oracle_confirmado_em timestamptz, oracle_confirmado_por uuid references auth.users(id),
 status_destino_oracle text, referencia_oracle text
);
create table liquida_private.reparo_itens (
 id uuid primary key default gen_random_uuid(), pedido_id uuid not null references liquida_private.reparo_pedidos(id),
 ordem integer not null, imei text not null, voucher text, modelo text, sku text, grade text,
 alocacao_id uuid references public.wms_alocacoes(id), endereco_id bigint references public.wms_enderecos(id),
 reserva_id uuid references public.wms_reservas_saida(id), local_wms text,
 status text not null default 'bloqueado' check(status in ('pendente','bloqueado','bipado','em_reparo')),
 pendencia text, status_anterior text, bipado_em timestamptz, bipado_por uuid references auth.users(id),
 unique(pedido_id,imei)
);
create index reparo_itens_pedido on liquida_private.reparo_itens(pedido_id,ordem);
create unique index reparo_itens_imei_ativo on liquida_private.reparo_itens(imei) where status in ('pendente','bloqueado','bipado');
alter table liquida_private.reparo_pedidos enable row level security;
alter table liquida_private.reparo_itens enable row level security;
revoke all on liquida_private.reparo_pedidos,liquida_private.reparo_itens from public,anon,authenticated;
alter table public.wms_reservas_saida drop constraint wms_reservas_saida_canal_check;
alter table public.wms_reservas_saida add constraint wms_reservas_saida_canal_check check(canal in ('B2C','B2B','TROCA','VENDA_FUNCIONARIO','REPARO'));

create function liquida_private.reparo_autorizado(p_tipo text) returns boolean
language sql stable security definer set search_path=pg_catalog as $$
 select auth.uid() is not null and exists(select 1 from public.user_profiles u where u.id=auth.uid() and
 (u.is_master or (p_tipo='picking' and u.telas_permitidas && array['/b2b/picking','/v2/assurant/b2b/picking']::text[])
 or (p_tipo='oracle' and u.telas_permitidas && array['/triagens/entrada-oracle','/v2/assurant/triagens/oracle']::text[])));
$$;
create function liquida_private.reparo_detalhes(p_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('pedido',(select to_jsonb(p)||jsonb_build_object('total',count(i.id),'bipados',count(i.id) filter(where i.status in ('bipado','em_reparo')),'pendentes',count(i.id) filter(where i.status='pendente'),'bloqueados',count(i.id) filter(where i.status='bloqueado')) from liquida_private.reparo_pedidos p join liquida_private.reparo_itens i on i.pedido_id=p.id where p.id=p_id group by p.id),
 'itens',coalesce((select jsonb_agg(i order by i.local_wms nulls last,i.ordem) from liquida_private.reparo_itens i where i.pedido_id=p_id),'[]'::jsonb));
$$;

create function liquida_private.reparo_preparar(p_id uuid) returns void
language plpgsql security definer set search_path=pg_catalog set jit='off' as $$
declare v_imeis text[]; r record; v_res uuid;
begin
 select array_agg(imei) into v_imeis from liquida_private.reparo_itens where pedido_id=p_id and status in ('pendente','bloqueado');
 if coalesce(cardinality(v_imeis),0)=0 then return; end if;
 -- Mesma trava de alocação/endereço utilizada nos fluxos de saída do WMS.
 perform a.id from public.wms_alocacoes a where a.status='confirmado' and a.imei=any(v_imeis) order by a.id for update;
 perform e.id from public.wms_enderecos e where e.id in(select a.endereco_id from public.wms_alocacoes a where a.status='confirmado' and a.imei=any(v_imeis)) order by e.id for update;
 for r in with w as materialized(select * from public.wms_localizar_saida(v_imeis))
 select i.id item_id,i.imei solicitado,w.* from liquida_private.reparo_itens i left join w on w.imei=i.imei
 where i.pedido_id=p_id and i.status in ('pendente','bloqueado') order by i.ordem loop
  if r.alocacao_id is null then
   update liquida_private.reparo_itens set status='bloqueado',pendencia='Sem posição atual confirmada no WMS. Localizar/armazenar antes da separação.' where id=r.item_id;
   continue;
  end if;
  select id into v_res from public.wms_reservas_saida where canal='REPARO' and referencia_id=r.item_id::text and alocacao_id=r.alocacao_id and status='reservado';
  if not r.disponivel and v_res is null then
   update liquida_private.reparo_itens set status='bloqueado',alocacao_id=r.alocacao_id,endereco_id=r.endereco_id,local_wms=r.local,
    pendencia=case when r.reserva_canal is not null then 'Reserva ativa em '||r.reserva_canal||' ('||coalesce(r.reserva_referencia,'')||').' else 'Aparelho comprometido com outro pedido ou posição bloqueada. Resolver o vínculo antes de separar.' end where id=r.item_id;
   continue;
  end if;
  if v_res is null then
   begin
    insert into public.wms_reservas_saida(imei,alocacao_id,endereco_id,canal,referencia_id,status,reservado_por,motivo)
    values(r.solicitado,r.alocacao_id,r.endereco_id,'REPARO',r.item_id::text,'reservado',auth.uid(),'Picking interno para reparo — sem faturamento') returning id into v_res;
   exception when unique_violation then
    update liquida_private.reparo_itens set status='bloqueado',pendencia='A posição foi reservada por outro fluxo. Atualize após resolver o vínculo.' where id=r.item_id;
    continue;
   end;
  end if;
  update liquida_private.reparo_itens set voucher=r.voucher,modelo=coalesce(r.modelo,modelo),sku=coalesce(r.sku,sku),grade=r.grade,
   alocacao_id=r.alocacao_id,endereco_id=r.endereco_id,reserva_id=v_res,local_wms=r.local,status='pendente',pendencia=null where id=r.item_id;
  update public.assurant_triagem set status_atual='Reservado para reparo',atualizado_em=now() at time zone 'UTC' where voucher=r.voucher and imei=r.solicitado;
 end loop;
end $$;

create function liquida_private.reparo_operar(p_acao text,p_pedido_id uuid default null,p_imei text default null,p_imeis text[] default null,p_status_oracle text default null,p_referencia_oracle text default null)
returns jsonb language plpgsql security definer set search_path=pg_catalog set jit='off' as $$
declare v_id uuid; v_hash text; v_p liquida_private.reparo_pedidos%rowtype; v_i liquida_private.reparo_itens%rowtype; v_r public.wms_reservas_saida%rowtype; v_a public.wms_alocacoes%rowtype; v_json jsonb;
begin
 if p_acao not in ('listar_picking','listar_oracle','detalhar_picking','detalhar_oracle','criar','atualizar','bipar','concluir','confirmar_oracle') or p_acao is null then raise exception 'Ação inválida'; end if;
 if not liquida_private.reparo_autorizado(case when p_acao in ('listar_oracle','detalhar_oracle','confirmar_oracle') then 'oracle' else 'picking' end) then raise exception 'Sem permissão para esta operação de reparo' using errcode='42501'; end if;
 if p_acao in ('listar_picking','listar_oracle') then
  select coalesce(jsonb_agg(x order by x.criado_em desc),'[]'::jsonb) into v_json from (
   select p.*,count(i.id) total,count(i.id) filter(where i.status in ('bipado','em_reparo')) bipados,count(i.id) filter(where i.status='bloqueado') bloqueados
   from liquida_private.reparo_pedidos p join liquida_private.reparo_itens i on i.pedido_id=p.id
   where (p_acao='listar_picking' and p.status='picking') or (p_acao='listar_oracle' and p.status in ('aguardando_oracle','em_reparo')) group by p.id
  ) x;
  return v_json;
 end if;
 if p_acao='criar' then
  if not exists(select 1 from public.user_profiles where id=auth.uid() and is_master) then raise exception 'Somente a gestão cria pedidos de reparo' using errcode='42501'; end if;
  if coalesce(cardinality(p_imeis),0)=0 or cardinality(p_imeis)>2000 or exists(select 1 from unnest(p_imeis) x where x is null or btrim(x)='' or x !~ '^[0-9]+$') then raise exception 'Lista de identificadores inválida'; end if;
  select md5(string_agg(x,',' order by x)) into v_hash from(select distinct btrim(x) x from unnest(p_imeis) x) n;
  perform pg_advisory_xact_lock(hashtextextended('reparo:'||v_hash,0));
  select id into v_id from liquida_private.reparo_pedidos where request_hash=v_hash;
  if v_id is not null then return liquida_private.reparo_detalhes(v_id); end if;
  if exists(select 1 from liquida_private.reparo_itens where imei=any(p_imeis) and status in ('pendente','bloqueado','bipado')) then raise exception 'Há identificadores em outro picking de reparo ativo'; end if;
  insert into liquida_private.reparo_pedidos(lote,request_hash,criado_por) values('REPARO_'||to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD')||'_'||upper(substr(v_hash,1,6)),v_hash,auth.uid()) returning id into v_id;
  insert into liquida_private.reparo_itens(pedido_id,ordem,imei,voucher,modelo,sku,grade,status_anterior,pendencia)
  select v_id,r.ord,btrim(r.imei),t.voucher,t.modelo,t.sku,t.grade,t.status_atual,'Conferência da posição WMS pendente'
  from (select imei,min(ord)::integer ord from unnest(p_imeis) with ordinality r(imei,ord) group by imei) r
  left join lateral(select * from public.assurant_triagem t where t.imei=btrim(r.imei) order by t.criado_em desc nulls last limit 1)t on true;
  perform liquida_private.reparo_preparar(v_id);
  return liquida_private.reparo_detalhes(v_id);
 end if;
 select * into v_p from liquida_private.reparo_pedidos where id=p_pedido_id for update;
 if not found then raise exception 'Pedido de reparo não encontrado'; end if;
 if p_acao in ('detalhar_picking','detalhar_oracle') then
  if (p_acao='detalhar_picking' and v_p.status<>'picking') or (p_acao='detalhar_oracle' and v_p.status='picking') then raise exception 'Pedido fora desta etapa'; end if;
  return liquida_private.reparo_detalhes(v_p.id);
 end if;
 if p_acao in ('atualizar','bipar','concluir') and v_p.status<>'picking' then raise exception 'Picking já concluído'; end if;
 if p_acao='atualizar' then perform liquida_private.reparo_preparar(v_p.id); return liquida_private.reparo_detalhes(v_p.id); end if;
 if p_acao='bipar' then
  select * into v_i from liquida_private.reparo_itens where pedido_id=v_p.id and imei=btrim(p_imei) for update;
  if not found then raise exception 'Identificador não consta neste pedido'; end if;
  if v_i.status='bipado' then raise exception 'Aparelho já bipado neste pedido'; end if;
  if v_i.status<>'pendente' then raise exception 'Aparelho com pendência: %',coalesce(v_i.pendencia,'posição/vínculo WMS'); end if;
  select * into v_a from public.wms_alocacoes where id=v_i.alocacao_id for update;
  if not found or v_a.status<>'confirmado' or v_a.imei<>v_i.imei then raise exception 'Posição WMS mudou. Atualize as posições antes de bipar'; end if;
  perform id from public.wms_enderecos where id=v_i.endereco_id and status='ocupado' for update;
  if not found then raise exception 'Endereço WMS bloqueado ou indisponível'; end if;
  select * into v_r from public.wms_reservas_saida where id=v_i.reserva_id and canal='REPARO' and referencia_id=v_i.id::text and status='reservado' for update;
  if not found then raise exception 'Reserva de reparo não está ativa'; end if;
  update public.wms_reservas_saida set status='retirado',finalizado_em=now(),finalizado_por=auth.uid(),atualizado_em=now() where id=v_r.id;
  update public.wms_alocacoes set status='retirado',retirado_em=now(),retirado_por=auth.uid(),saida_canal='REPARO',saida_referencia=v_i.id::text,atualizado_em=now() where id=v_i.alocacao_id;
  update public.wms_enderecos set status='livre',reserva_id=null,reservado_ate=null,atualizado_em=now() where id=v_i.endereco_id;
  update liquida_private.reparo_itens set status='bipado',bipado_em=now(),bipado_por=auth.uid() where id=v_i.id;
  update public.assurant_triagem set status_atual='Separado para reparo',atualizado_em=now() at time zone 'UTC' where voucher=v_i.voucher and imei=v_i.imei;
  insert into public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by) values((select nome from public.user_profiles where id=auth.uid()),'Picking para reparo — sem faturamento',v_i.voucher,v_i.imei,now() at time zone 'UTC',auth.uid());
  return liquida_private.reparo_detalhes(v_p.id);
 end if;
 if p_acao='concluir' then
  if not exists(select 1 from liquida_private.reparo_itens where pedido_id=v_p.id) or exists(select 1 from liquida_private.reparo_itens where pedido_id=v_p.id and status<>'bipado') then raise exception 'Conclua a bipagem de todos os aparelhos e resolva as pendências antes de concluir'; end if;
  update liquida_private.reparo_pedidos set status='aguardando_oracle',picking_concluido_em=now(),picking_concluido_por=auth.uid() where id=v_p.id;
  update public.assurant_triagem t set status_atual='Aguardando movimentação Oracle para reparo',atualizado_em=now() at time zone 'UTC' from liquida_private.reparo_itens i where i.pedido_id=v_p.id and t.voucher=i.voucher and t.imei=i.imei;
  return liquida_private.reparo_detalhes(v_p.id);
 end if;
 if p_acao='confirmar_oracle' then
  if v_p.status<>'aguardando_oracle' then raise exception 'Pedido não está aguardando movimentação Oracle'; end if;
  if nullif(btrim(p_status_oracle),'') is null or nullif(btrim(p_referencia_oracle),'') is null then raise exception 'Informe o status de destino e a referência da movimentação realizada no Oracle'; end if;
  update liquida_private.reparo_pedidos set status='em_reparo',oracle_confirmado_em=now(),oracle_confirmado_por=auth.uid(),status_destino_oracle=btrim(p_status_oracle),referencia_oracle=btrim(p_referencia_oracle) where id=v_p.id;
  update liquida_private.reparo_itens set status='em_reparo' where pedido_id=v_p.id;
  update public.assurant_triagem t set status_atual='Em reparo',atualizado_em=now() at time zone 'UTC' from liquida_private.reparo_itens i where i.pedido_id=v_p.id and t.voucher=i.voucher and t.imei=i.imei;
  insert into public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by) select (select nome from public.user_profiles where id=auth.uid()),'Oracle — reparo: '||btrim(p_status_oracle)||' / '||btrim(p_referencia_oracle),i.voucher,i.imei,now() at time zone 'UTC',auth.uid() from liquida_private.reparo_itens i where pedido_id=v_p.id;
  return liquida_private.reparo_detalhes(v_p.id);
 end if;
 raise exception 'Ação não executada';
end $$;
revoke all on function liquida_private.reparo_autorizado(text),liquida_private.reparo_detalhes(uuid),liquida_private.reparo_preparar(uuid),liquida_private.reparo_operar(text,uuid,text,text[],text,text) from public,anon,authenticated;
grant execute on function liquida_private.reparo_operar(text,uuid,text,text[],text,text) to authenticated;
create function public.assurant_reparo_operar(p_acao text,p_pedido_id uuid default null,p_imei text default null,p_imeis text[] default null,p_status_oracle text default null,p_referencia_oracle text default null)
returns jsonb language sql security invoker set search_path=pg_catalog as $$ select liquida_private.reparo_operar(p_acao,p_pedido_id,p_imei,p_imeis,p_status_oracle,p_referencia_oracle); $$;
revoke all on function public.assurant_reparo_operar(text,uuid,text,text[],text,text) from public,anon;
grant execute on function public.assurant_reparo_operar(text,uuid,text,text[],text,text) to authenticated;

CREATE OR REPLACE FUNCTION public.wms_confirmar_retirada_saida(p_canal text, p_referencia text, p_imei text, p_usuario uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reserva public.wms_reservas_saida%rowtype;
  v_res jsonb;
begin
 if upper(btrim(p_canal))='REPARO' then raise exception 'Reparo deve ser executado exclusivamente pelo picking interno' using errcode='42501'; end if;
  select * into v_reserva
  from public.wms_reservas_saida
  where canal = upper(trim(p_canal))
    and referencia_id = p_referencia
    and imei = trim(p_imei)
    and status in ('reservado', 'analise', 'reconciliar')
  order by reservado_em desc
  limit 1
  for update;

  -- Permite que um item legado seja retirado depois de localizado no WMS.
  if not found then
    v_res := public.wms_reservar_saida(
      p_imei, p_canal, p_referencia, p_usuario
    );
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      return v_res;
    end if;

    select * into v_reserva
    from public.wms_reservas_saida
    where id = (v_res ->> 'reserva_id')::uuid
    for update;
  end if;

  update public.wms_reservas_saida
  set status = 'retirado',
      finalizado_em = now(),
      finalizado_por = p_usuario,
      atualizado_em = now()
  where id = v_reserva.id;

  update public.wms_alocacoes
  set status = 'retirado',
      retirado_em = now(),
      retirado_por = p_usuario,
      saida_canal = upper(trim(p_canal)),
      saida_referencia = p_referencia,
      atualizado_em = now()
  where id = v_reserva.alocacao_id
    and status = 'confirmado';

  update public.wms_enderecos
  set status = 'livre',
      reserva_id = null,
      reservado_ate = null,
      atualizado_em = now()
  where id = v_reserva.endereco_id
    and status in ('ocupado', 'bloqueado');

  return jsonb_build_object(
    'ok', true,
    'reserva_id', v_reserva.id,
    'alocacao_id', v_reserva.alocacao_id,
    'endereco_id', v_reserva.endereco_id
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.wms_cancelar_reserva_saida(p_canal text, p_referencia text, p_usuario uuid DEFAULT NULL::uuid, p_motivo text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_qtd integer;
begin
 if upper(btrim(p_canal))='REPARO' then raise exception 'Reparo deve ser executado exclusivamente pelo picking interno' using errcode='42501'; end if;
  update public.wms_reservas_saida
  set status = 'cancelado',
      motivo = coalesce(p_motivo, motivo),
      finalizado_em = now(),
      finalizado_por = p_usuario,
      atualizado_em = now()
  where canal = upper(trim(p_canal))
    and referencia_id = p_referencia
    and status in ('reservado', 'analise', 'reconciliar');

  get diagnostics v_qtd = row_count;
  return jsonb_build_object('ok', true, 'canceladas', v_qtd);
end;
$function$;

CREATE OR REPLACE FUNCTION public.wms_marcar_analise_saida(p_canal text, p_referencia text, p_imei text, p_usuario uuid DEFAULT NULL::uuid, p_motivo text DEFAULT 'Não localizado no picking'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_reserva public.wms_reservas_saida%rowtype;
begin
 if upper(btrim(p_canal))='REPARO' then raise exception 'Reparo deve ser executado exclusivamente pelo picking interno' using errcode='42501'; end if;
  select * into v_reserva
  from public.wms_reservas_saida
  where canal = upper(trim(p_canal))
    and referencia_id = p_referencia
    and imei = trim(p_imei)
    and status in ('reservado', 'analise', 'reconciliar')
  order by reservado_em desc
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'erro', 'Reserva WMS não encontrada.');
  end if;

  update public.wms_reservas_saida
  set status = 'analise',
      motivo = p_motivo,
      atualizado_em = now()
  where id = v_reserva.id;

  update public.wms_enderecos
  set status = 'bloqueado',
      atualizado_em = now()
  where id = v_reserva.endereco_id
    and status = 'ocupado';

  return jsonb_build_object(
    'ok', true,
    'reserva_id', v_reserva.id,
    'endereco_id', v_reserva.endereco_id
  );
end;
$function$;
