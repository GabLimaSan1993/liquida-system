-- Painel gerencial de reparo/revisao: consulta historico, pedidos atuais e fila Oracle sem alterar os fluxos.
create or replace function public.assurant_reparo_painel_pedidos()
returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $$
begin
  if auth.uid() is null or not (
    liquida_private.reparo_autorizado('picking')
    or liquida_private.reparo_autorizado('oracle')
  ) then
    raise exception 'Sem permissão para visualizar pedidos de reparo' using errcode='42501';
  end if;

  return (
    select coalesce(jsonb_agg(to_jsonb(r) order by r.criado_em desc),'[]'::jsonb)
    from (
      select
        p.id,p.lote,p.status,p.origem_lab,p.criado_em,
        p.picking_concluido_em,p.oracle_confirmado_em,
        p.status_destino_oracle,p.referencia_oracle,
        coalesce(nullif(u.nome,''),'—') criado_por_nome,
        count(i.id) filter (where i.status<>'retornado') total,
        count(i.id) filter (where i.status='retornado') retornados,
        count(i.id) filter (where i.status in ('bipado','em_reparo')) bipados,
        count(i.id) filter (where p.status='picking' and i.status='pendente') pendentes,
        count(i.id) filter (where p.status='picking' and i.status='bloqueado') bloqueados,
        count(i.id) filter (where i.status='bipado' and p.status in ('picking','aguardando_oracle')) fila_oracle
      from liquida_private.reparo_pedidos p
      join liquida_private.reparo_itens i on i.pedido_id=p.id
      left join public.user_profiles u on u.id=p.criado_por
      group by p.id,u.nome
    ) r
  );
end;
$$;
revoke all on function public.assurant_reparo_painel_pedidos() from public,anon;
grant execute on function public.assurant_reparo_painel_pedidos() to authenticated;

create or replace function public.assurant_reparo_painel_detalhes(p_pedido_id uuid)
returns jsonb language plpgsql security definer set search_path to 'pg_catalog' as $$
begin
  if auth.uid() is null or not (
    liquida_private.reparo_autorizado('picking')
    or liquida_private.reparo_autorizado('oracle')
  ) then
    raise exception 'Sem permissão para consultar este pedido de reparo' using errcode='42501';
  end if;
  if not exists (select 1 from liquida_private.reparo_pedidos p where p.id=p_pedido_id) then
    raise exception 'Pedido de reparo não encontrado';
  end if;
  return liquida_private.reparo_detalhes(p_pedido_id);
end;
$$;
revoke all on function public.assurant_reparo_painel_detalhes(uuid) from public,anon;
grant execute on function public.assurant_reparo_painel_detalhes(uuid) to authenticated;
notify pgrst, 'reload schema';