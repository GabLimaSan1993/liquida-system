-- One source of complete metadata for historical PDF reissues and repairs.
create or replace function liquida_private.laudo_dados_completos(p_laudo_id uuid)
returns jsonb language plpgsql security invoker set search_path=pg_catalog as $$
declare l record; t record; v record; p record; r jsonb;
begin
 select * into l from public.triagem_laudos where id=p_laudo_id;
 if not found then raise exception 'Laudo não encontrado'; end if;
 select * into t from public.assurant_triagem where voucher=l.voucher;
 select * into v from liquida_private.fechamento_lojas where voucher=l.voucher;
 -- Conflicting catalog records leave only the ambiguous field unavailable.
 select
  case when count(distinct nullif(trim(marca),''))=1 then min(nullif(trim(marca),'')) end as marca,
  case when count(distinct nullif(trim(modelo),''))=1 then min(nullif(trim(modelo),'')) end as modelo,
  case when count(distinct nullif(trim(capacidade),''))=1 then min(nullif(trim(capacidade),'')) end as capacidade,
  case when count(distinct nullif(trim(cor),''))=1 then min(nullif(trim(cor),'')) end as cor
 into p from public.produtos_catalogo
 where ativo and (sku_als=split_part(upper(trim(t.sku)),'-',1) or sku_oracle=split_part(upper(trim(t.sku)),'-',1));
 begin r=t.respostas_funcional::jsonb; exception when invalid_text_representation then r=null; end;
 return jsonb_build_object(
  'criado_em',l.criado_em,'observacao',l.observacao,'qtd_fotos',l.qtd_fotos,
  'respostas_funcional',t.respostas_funcional,
  'dados',jsonb_build_object(
   'voucher',l.voucher,'imei',coalesce(nullif(trim(l.imei),''),nullif(trim(t.imei),'')),
   'cliente',coalesce(nullif(trim(v.cliente),''),nullif(trim(t.cliente),'')),
   'loja',coalesce(nullif(trim(v.loja),''),nullif(trim(t.loja),'')),
   'produto',jsonb_build_object(
    'marca',coalesce(nullif(trim(r#>>'{produto,marca}'),''),p.marca,nullif(trim(v.marca),'')),
    'modelo',coalesce(nullif(trim(r#>>'{produto,modelo}'),''),p.modelo,nullif(trim(v.modelo),''),nullif(trim(t.modelo),'')),
    'armazenamento',coalesce(nullif(trim(r#>>'{produto,armazenamento}'),''),nullif(trim(r#>>'{produto,capacidade}'),''),p.capacidade),
    'cor',coalesce(nullif(trim(r#>>'{produto,cor}'),''),p.cor)),
   'motivo',l.motivo,'divergencias',coalesce(l.divergencias,'[]'::jsonb),
   'defeitos',case when nullif(l.defeitos,'') is null then '[]'::jsonb else to_jsonb(string_to_array(l.defeitos,';')) end));
end $$;
revoke all on function liquida_private.laudo_dados_completos(uuid) from public,anon,authenticated;
grant execute on function liquida_private.laudo_dados_completos(uuid) to service_role;

create or replace function liquida_private.fechamento_laudo_dados(p_laudo_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin
 if auth.uid() is null or not exists(select 1 from public.user_profiles u where u.id=auth.uid()
  and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))) then
  raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501';
 end if;
 return liquida_private.laudo_dados_completos(p_laudo_id);
end $$;
