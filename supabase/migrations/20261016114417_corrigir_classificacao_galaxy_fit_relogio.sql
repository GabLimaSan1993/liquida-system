create or replace function liquida_private.triagem_tipo(p_modelo text) returns text
language sql stable security definer set search_path=public as $$
 select case
 when upper(coalesce(p_modelo,'')) ~ '(WATCH|RELÓGIO|RELOGIO|SMARTWATCH|(^|[^A-Z])BAND([^A-Z]|$)|(^|[^A-Z])FIT[[:space:]]*[0-9])' then 'RELOGIO'
 when exists(select 1 from public.produtos_catalogo where upper(trim(modelo))=upper(trim(p_modelo)) and tipo='SMARTWATCH' and ativo) then 'RELOGIO'
 when exists(select 1 from public.produtos_catalogo where upper(trim(modelo))=upper(trim(p_modelo)) and tipo='TABLET' and ativo) then 'TABLET'
 when upper(coalesce(p_modelo,'')) ~ '(IPAD|TABLET|(^|[^A-Z])TAB([^A-Z]|$)|MATEPAD|XIAOMI PAD|REDMI PAD|LENOVO.*PAD)' then 'TABLET'
 else 'CELULAR' end;
$$;
revoke all on function liquida_private.triagem_tipo(text) from public,anon,authenticated;
update public.produtos_catalogo set tipo='SMARTWATCH' where upper(marca)='SAMSUNG' and upper(modelo)='GALAXY FIT3' and tipo='APARELHO';
update public.assurant_triagem set tipo_aparelho='RELOGIO' where voucher='YBV438874' and sku='BRZSWT13504';

