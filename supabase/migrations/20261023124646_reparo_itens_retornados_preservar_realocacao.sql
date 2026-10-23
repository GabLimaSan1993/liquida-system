-- Itens fisicamente retornados não voltam ao picking nem à movimentação Oracle do lote anterior.
alter table liquida_private.reparo_itens drop constraint reparo_itens_status_check;
alter table liquida_private.reparo_itens add constraint reparo_itens_status_check check(status in ('pendente','bloqueado','bipado','em_reparo','retornado'));
CREATE OR REPLACE FUNCTION liquida_private.reparo_detalhes(p_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 select jsonb_build_object('pedido',(select to_jsonb(p)||jsonb_build_object('total',count(i.id) filter(where i.status<>'retornado'),'retornados',count(i.id) filter(where i.status='retornado'),'bipados',count(i.id) filter(where i.status in ('bipado','em_reparo')),'pendentes',count(i.id) filter(where i.status='pendente'),'bloqueados',count(i.id) filter(where i.status='bloqueado')) from liquida_private.reparo_pedidos p join liquida_private.reparo_itens i on i.pedido_id=p.id where p.id=p_id group by p.id),
 'itens',coalesce((select jsonb_agg(i order by i.local_wms nulls last,i.ordem) from liquida_private.reparo_itens i where i.pedido_id=p_id),'[]'::jsonb));
$function$
;
CREATE OR REPLACE FUNCTION liquida_private.reparo_operar(p_acao text, p_pedido_id uuid DEFAULT NULL::uuid, p_imei text DEFAULT NULL::text, p_imeis text[] DEFAULT NULL::text[], p_status_oracle text DEFAULT NULL::text, p_referencia_oracle text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
 SET jit TO 'off'
AS $function$
declare v_id uuid; v_hash text; v_p liquida_private.reparo_pedidos%rowtype; v_i liquida_private.reparo_itens%rowtype; v_r public.wms_reservas_saida%rowtype; v_a public.wms_alocacoes%rowtype; v_json jsonb;
begin
 if p_acao not in ('listar_picking','listar_oracle','detalhar_picking','detalhar_oracle','criar','atualizar','bipar','concluir','confirmar_oracle') or p_acao is null then raise exception 'Ação inválida'; end if;
 if not liquida_private.reparo_autorizado(case when p_acao in ('listar_oracle','detalhar_oracle','confirmar_oracle') then 'oracle' else 'picking' end) then raise exception 'Sem permissão para esta operação de reparo' using errcode='42501'; end if;
 if p_acao in ('listar_picking','listar_oracle') then
  select coalesce(jsonb_agg(x order by x.criado_em desc),'[]'::jsonb) into v_json from (
   select p.*,count(i.id) filter(where i.status<>'retornado') total,count(i.id) filter(where i.status='retornado') retornados,count(i.id) filter(where i.status in ('bipado','em_reparo')) bipados,count(i.id) filter(where i.status='bloqueado') bloqueados
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
  if not exists(select 1 from liquida_private.reparo_itens where pedido_id=v_p.id and status='bipado') or exists(select 1 from liquida_private.reparo_itens where pedido_id=v_p.id and status not in ('bipado','retornado')) then raise exception 'Conclua a bipagem de todos os aparelhos e resolva as pendências antes de concluir'; end if;
  update liquida_private.reparo_pedidos set status='aguardando_oracle',picking_concluido_em=now(),picking_concluido_por=auth.uid() where id=v_p.id;
  update public.assurant_triagem t set status_atual='Aguardando movimentação Oracle para reparo',atualizado_em=now() at time zone 'UTC' from liquida_private.reparo_itens i where i.pedido_id=v_p.id and i.status<>'retornado' and t.voucher=i.voucher and t.imei=i.imei;
  return liquida_private.reparo_detalhes(v_p.id);
 end if;
 if p_acao='confirmar_oracle' then
  if v_p.status<>'aguardando_oracle' then raise exception 'Pedido não está aguardando movimentação Oracle'; end if;
  if nullif(btrim(p_status_oracle),'') is null or nullif(btrim(p_referencia_oracle),'') is null then raise exception 'Informe o status de destino e a referência da movimentação realizada no Oracle'; end if;
  update liquida_private.reparo_pedidos set status='em_reparo',oracle_confirmado_em=now(),oracle_confirmado_por=auth.uid(),status_destino_oracle=btrim(p_status_oracle),referencia_oracle=btrim(p_referencia_oracle) where id=v_p.id;
  update liquida_private.reparo_itens set status='em_reparo' where pedido_id=v_p.id and status<>'retornado';
  update public.assurant_triagem t set status_atual='Em reparo',atualizado_em=now() at time zone 'UTC' from liquida_private.reparo_itens i where i.pedido_id=v_p.id and i.status<>'retornado' and t.voucher=i.voucher and t.imei=i.imei;
  insert into public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by) select (select nome from public.user_profiles where id=auth.uid()),'Oracle — reparo: '||btrim(p_status_oracle)||' / '||btrim(p_referencia_oracle),i.voucher,i.imei,now() at time zone 'UTC',auth.uid() from liquida_private.reparo_itens i where pedido_id=v_p.id and status<>'retornado';
  return liquida_private.reparo_detalhes(v_p.id);
 end if;
 raise exception 'Ação não executada';
end $function$

;
