-- A recycled IMEI is not proof that an old sale owns the current physical unit.
do $$
declare def text; old text:= $target$ if p.wms_alocacao_id is not null and p.wms_alocacao_id<>a.id then$target$;
begin
 def:=pg_get_functiondef('liquida_private.b2c_baixa_validar(uuid)'::regprocedure);
 if strpos(def,old)=0 then raise exception 'Trecho esperado da validação de baixa não encontrado'; end if;
 def:=replace(def,old,$replacement$ if a.confirmado_em is null or a.confirmado_em>p.faturado_em then raise exception 'A posição atual é posterior ao faturamento ou não possui confirmação de entrada'; end if;
 if p.wms_alocacao_id is null and not exists(select 1 from public.wms_reservas_saida r where r.alocacao_id=a.id and r.canal='B2C' and r.referencia_id=p.id::text and r.status in('reservado','analise','reconciliar')) then raise exception 'Pedido sem vínculo comprovado com a alocação atual do WMS'; end if;
 if p.wms_alocacao_id is not null and p.wms_alocacao_id<>a.id then$replacement$);
 execute def;
end $$;

-- Compute all cycle records in one database snapshot, without REST's row limit.
create function liquida_private.inventario_acuracidade(p_ciclo uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare v jsonb;
begin
 if not exists(select 1 from public.user_profiles where id=auth.uid() and(is_master or '/v2/assurant/estoque/inventario'=any(coalesce(telas_permitidas,'{}')) or '/inventario'=any(coalesce(telas_permitidas,'{}')))) then raise exception 'Sem permissão para inventário' using errcode='42501'; end if;
 if not exists(select 1 from public.inventario_ciclos where id=p_ciclo) then raise exception 'Ciclo não encontrado'; end if;
 with contagens as materialized(select id,status from public.inventario_contagens where ciclo_id=p_ciclo),
 itens as materialized(select i.* from public.inventario_itens i join contagens c on c.id=i.contagem_id where c.status='concluida'),
 metricas as(select count(*) filter(where veredito='conferido')::numeric conferidos,count(*) filter(where veredito='sobra')::numeric sobras,
 count(*) filter(where veredito='conflito')::numeric conflitos,count(*) filter(where veredito='falta')::numeric faltas,
 count(*) filter(where veredito='falta' and reconciliado_em is not null)::numeric reconciliadas from itens),
 enderecos as(select count(*) total,count(*) filter(where status='concluida')::numeric concluidas,
 count(*) filter(where status='concluida' and not exists(select 1 from itens i where i.contagem_id=c.id and i.veredito<>'conferido'))::numeric perfeitos from contagens c)
 select jsonb_build_object('totalEnderecos',e.total,'concluidas',e.concluidas,'perfeitos',e.perfeitos,'conferidos',m.conferidos,'sobras',m.sobras,'conflitos',m.conflitos,
 'reconciliadas',m.reconciliadas,'fantasmas',m.faltas-m.reconciliadas,'faltasBrutas',m.faltas,'avaliadosBrutos',m.conferidos+m.sobras+m.conflitos+m.faltas,
 'acuraciaPecaBruta',100*m.conferidos/nullif(m.conferidos+m.sobras+m.conflitos+m.faltas,0),
 'acuraciaPeca',100*m.conferidos/nullif(m.conferidos+m.sobras+m.conflitos+m.faltas-m.reconciliadas,0),
 'acuraciaEndereco',100*e.perfeitos/nullif(e.concluidas,0),'referencia',97,'versao_metodologia','2026-10-bruta-endereco-v1','validacao_operacional','pendente') into v from metricas m cross join enderecos e;
 return v;
end $$;
create function public.assurant_inventario_acuracidade(p_ciclo uuid) returns jsonb language sql security invoker set search_path=pg_catalog as $$select liquida_private.inventario_acuracidade(p_ciclo)$$;
revoke all on function liquida_private.inventario_acuracidade(uuid),public.assurant_inventario_acuracidade(uuid) from public,anon;
grant execute on function liquida_private.inventario_acuracidade(uuid),public.assurant_inventario_acuracidade(uuid) to authenticated;
