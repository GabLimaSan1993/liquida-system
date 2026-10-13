-- Reuse the same execution source and authorization as the production dashboard.
create or replace function liquida_private.producao_detalhada(
 p_inicio date,p_fim date,p_etapa text default null,p_canal text default null,
 p_colaborador uuid default null,p_cursor jsonb default null
) returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='25s' as $$
declare v jsonb;
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid() and '/v2/assurant/gestao/producao'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Produção da Esteira' using errcode='42501';
 end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>3660 then raise exception 'Período inválido (máximo de 10 anos).'; end if;
 with eventos as materialized (
  select distinct on (fonte,fonte_id,etapa,realizado_em) * from liquida_private.producao_base
  where realizado_em >= p_inicio::timestamp at time zone 'America/Sao_Paulo'
    and realizado_em < (p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
    and (p_etapa is null or etapa=p_etapa) and (p_canal is null or canal=p_canal)
  order by fonte,fonte_id,etapa,realizado_em,retrabalho desc,colaborador_id nulls last
 ), pagina as materialized (
  select e.* from eventos e
  left join public.user_profiles u on u.id=e.colaborador_id
  where not e.retrabalho and e.quantidade>0
    and (p_colaborador is null or u.id=p_colaborador)
    and (p_cursor is null or (e.realizado_em,e.fonte,e.fonte_id,e.etapa) >
      ((p_cursor->>'realizado_em')::timestamptz,p_cursor->>'fonte',p_cursor->>'fonte_id',p_cursor->>'etapa'))
  order by e.realizado_em,e.fonte,e.fonte_id,e.etapa limit 2001
 ), selecionados as materialized (
  select * from pagina order by realizado_em,fonte,fonte_id,etapa limit 2000
 ), identificados as (
  select e.*,coalesce(nullif(u.nome,''),'Responsável não identificado') as usuario,
   coalesce(nullif(t.voucher,''),nullif(w.voucher,''),nullif(b.voucher,''),nullif(pw.voucher,''),nullif(mt.voucher,''),'') as voucher,
   coalesce(nullif(t.imei,''),nullif(w.imei,''),nullif(b.imei_bipado,''),nullif(b.imei,''),nullif(p.imei_bipado,''),nullif(p.imei_alocado,''),nullif(m.imei,''),'') as serial_imei,
   nf.pedido_id as nf_pedido_id,nf.numero_nf
  from selecionados e
  left join public.user_profiles u on u.id=e.colaborador_id
  left join public.assurant_triagem t on e.fonte in ('assurant_triagem','recebimento_vouchers') and t.voucher=e.referencia
  left join public.wms_alocacoes w on e.fonte='wms_alocacoes' and w.id::text=e.fonte_id
  left join public.b2b_itens b on e.fonte='b2b_itens' and b.id::text=e.fonte_id
  left join public.pedidos_b2c p on e.fonte='pedidos_b2c' and p.id::text=e.fonte_id
  left join public.wms_alocacoes pw on pw.id=p.wms_alocacao_id
  left join public.meli_validacoes m on e.fonte='meli_validacoes' and m.id::text=e.fonte_id
  left join lateral (select at.voucher from public.assurant_triagem at where at.imei=m.imei order by at.atualizado_em desc nulls last,at.id limit 1) mt on m.id is not null
  left join public.b2b_nfs nf on e.fonte='b2b_nfs' and nf.id::text=e.fonte_id
 ), linhas as (
  select i.usuario,i.etapa,
   case when i.fonte='b2b_nfs' then coalesce(nfi.voucher,'') else i.voucher end as voucher,
   case when i.fonte='b2b_nfs' then coalesce(nullif(nfi.imei_bipado,''),nfi.imei,'') else i.serial_imei end as serial_imei,
   to_char(i.realizado_em at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS') as data_local,
   i.realizado_em,i.fonte,i.fonte_id,s.n
  from identificados i
  -- Preserve quantities in sources recorded per NF. Unidentified items stay blank.
  cross join lateral generate_series(1,i.quantidade) s(n)
  left join lateral (
   select bi.voucher,bi.imei,bi.imei_bipado from public.b2b_itens bi
   where i.fonte='b2b_nfs' and bi.pedido_id=i.nf_pedido_id and bi.nf=i.numero_nf
   order by bi.id offset (s.n-1) limit 1
  ) nfi on i.fonte='b2b_nfs'
 )
 select jsonb_build_object(
  'dados',coalesce((select jsonb_agg(jsonb_build_object('usuario',l.usuario,'etapa',l.etapa,'voucher',l.voucher,'serial_imei',l.serial_imei,'data_local',l.data_local) order by l.realizado_em,l.fonte,l.fonte_id,l.n) from linhas l),'[]'::jsonb),
  'proximo_cursor',case when (select count(*) from pagina)>2000 then
   (select jsonb_build_object('realizado_em',realizado_em,'fonte',fonte,'fonte_id',fonte_id,'etapa',etapa) from selecionados order by realizado_em desc,fonte desc,fonte_id desc,etapa desc limit 1)
   else null end
 ) into v;
 return v;
end $$;
revoke all on function liquida_private.producao_detalhada(date,date,text,text,uuid,jsonb) from public,anon;
grant execute on function liquida_private.producao_detalhada(date,date,text,text,uuid,jsonb) to authenticated;
create or replace function public.assurant_producao_esteira_detalhada(
 p_inicio date,p_fim date,p_etapa text default null,p_canal text default null,
 p_colaborador uuid default null,p_cursor jsonb default null
) returns jsonb language sql security invoker set search_path=pg_catalog as $$
 select liquida_private.producao_detalhada(p_inicio,p_fim,p_etapa,p_canal,p_colaborador,p_cursor);
$$;
revoke all on function public.assurant_producao_esteira_detalhada(date,date,text,text,uuid,jsonb) from public,anon;
grant execute on function public.assurant_producao_esteira_detalhada(date,date,text,text,uuid,jsonb) to authenticated;
