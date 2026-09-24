-- Catálogo mestre de SKUs 24/09/2026:
-- APPLE IPHONE 13 MINI 128GB GREEN -> BRZDEV15021.
insert into public.produtos_catalogo(
  tipo,sku_als,sku_oracle,fabricante,marca,modelo,capacidade,cor,descricao,pendente,ativo
)
select
  'APARELHO',
  'BRZDEV15021',
  'BRZDEV15021',
  'APPLE',
  'APPLE',
  'IPHONE 13 MINI',
  '128GB',
  'GREEN',
  'APPLE IPHONE 13 MINI 128GB GREEN',
  false,
  true
where not exists (
  select 1
  from public.produtos_catalogo
  where upper(trim(coalesce(sku_als,'')))='BRZDEV15021'
     or upper(trim(coalesce(sku_oracle,'')))='BRZDEV15021'
);
