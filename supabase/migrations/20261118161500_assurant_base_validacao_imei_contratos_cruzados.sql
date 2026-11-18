-- Base de validacao IMEI x contrato em analise Assurant.
-- Apenas SELECT; exige permissao de Divergencias IMEI.
CREATE OR REPLACE FUNCTION public.assurant_divergencias_imei_base_validacao(p_incluir_resolvidos boolean DEFAULT false)
 RETURNS TABLE(caso_id uuid, voucher text, status_caso text, tipo_problema text, criado_em timestamp with time zone, criado_por_nome text, imei_contrato_registrado text, imei_contrato_atual text, imei_contrato_historico text, imei_fisico_1 text, imei_fisico_2 text, imei_cadastro_1 text, imei_cadastro_2 text, contrato_outro_voucher_imei1 text, contrato_outro_voucher_imei2 text, modelo_triagem text, modelo_contrato text, status_produto text, sku text, tipo_aparelho text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
 SET statement_timeout TO '25s'
AS $function$
begin
  if not public.assurant_divergencias_pode_decidir() then
    raise exception 'Sem permissão para exportar divergências de IMEI' using errcode='42501';
  end if;
  return query
  select
    d.id as caso_id,
    d.voucher,
    d.status as status_caso,
    d.tipo_problema,
    d.criado_em,
    d.criado_por_nome,
    d.imei_esperado as imei_contrato_registrado,
    g.imei as imei_contrato_atual,
    h.imei_serial as imei_contrato_historico,
    d.imei1 as imei_fisico_1,
    d.imei2 as imei_fisico_2,
    t.imei as imei_cadastro_1,
    t.imei2 as imei_cadastro_2,
    outro1.vouchers as contrato_outro_voucher_imei1,
    outro2.vouchers as contrato_outro_voucher_imei2,
    coalesce(d.modelo,t.modelo) as modelo_triagem,
    g.aparelho as modelo_contrato,
    t.status_atual as status_produto,
    coalesce(d.sku,t.sku) as sku,
    d.tipo_aparelho
  from public.assurant_divergencias_imei d
  left join public.assurant_triagem t on t.voucher=d.voucher
  left join public.tradein_geral g
    on d.voucher ~ '^YBV[0-9]+$' and g.voucher=(substring(d.voucher from 4))::integer
  left join public.tradein_historico h
    on d.voucher ~ '^YBV[0-9]+$' and h.voucher_key=substring(d.voucher from 4)
  left join lateral (
    select string_agg('YBV'||x.voucher::text, ', ' order by x.voucher) as vouchers
    from public.tradein_geral x
    where x.imei = d.imei1 and nullif(trim(d.imei1),'') is not null
      and 'YBV'||x.voucher::text <> d.voucher
  ) outro1 on true
  left join lateral (
    select string_agg('YBV'||x.voucher::text, ', ' order by x.voucher) as vouchers
    from public.tradein_geral x
    where x.imei = d.imei2 and nullif(trim(d.imei2),'') is not null
      and 'YBV'||x.voucher::text <> d.voucher
  ) outro2 on true
  where d.tipo_problema='imei_divergente'
    and (p_incluir_resolvidos or d.status in ('pendente','reconferencia'))
  order by d.criado_em desc, d.id;
end;
$function$

revoke all on function public.assurant_divergencias_imei_base_validacao(boolean) from public,anon;
grant execute on function public.assurant_divergencias_imei_base_validacao(boolean) to authenticated;
