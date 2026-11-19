-- Referências extraídas da auditoria dos PDFs bancários Santander, competência 2026-06 a 2026-08.
-- Não alterar o status de validação dos lançamentos sem corrigir os detalhes contra os extratos originais.
CREATE TABLE IF NOT EXISTS liquida_private.financeiro_extratos_referencia_pdf (
  banco text NOT NULL,
  conta text NOT NULL,
  mes date NOT NULL,
  arquivo_pdf text NOT NULL,
  creditos_oficiais numeric(18,2) NOT NULL,
  debitos_oficiais numeric(18,2) NOT NULL,
  origem_conferencia text NOT NULL,
  PRIMARY KEY (banco, conta, mes)
);
INSERT INTO liquida_private.financeiro_extratos_referencia_pdf
  (banco,conta,mes,arquivo_pdf,creditos_oficiais,debitos_oficiais,origem_conferencia)
VALUES
 ('Santander','0062130141509','2026-06-01','2026_06.2026 - EXTRATO CONSOLIDADO SANTANDER.pdf',592657.05,565087.23,'Liquida_Preco_Santander_Historico_Auditoria_PDF.csv'),
 ('Santander','0062130141509','2026-07-01','2026_07.2026 - EXTRATO CONSOLIDADO SANTANDER.pdf',3314739.45,3352677.00,'Liquida_Preco_Santander_Historico_Auditoria_PDF.csv'),
 ('Santander','0062130141509','2026-08-01','2026_08.2026 - EXTRATO CONSOLIDADO SANTANDER.pdf',4021494.22,3983556.67,'Liquida_Preco_Santander_Historico_Auditoria_PDF.csv')
ON CONFLICT (banco,conta,mes) DO UPDATE SET
  arquivo_pdf=excluded.arquivo_pdf,
  creditos_oficiais=excluded.creditos_oficiais,
  debitos_oficiais=excluded.debitos_oficiais,
  origem_conferencia=excluded.origem_conferencia;
REVOKE ALL ON TABLE liquida_private.financeiro_extratos_referencia_pdf FROM public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.financeiro_extrato_conferencia_mensal(p_upload_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 with autorizado as (
   select 1 as ok
   where auth.uid() is not null
     and exists(select 1 from public.financeiro_acessos a where a.usuario_id=auth.uid())
 ),
 arquivo as (
   select u.id,u.banco,u.conta
   from public.financeiro_extratos_uploads u
   join autorizado a on a.ok=1
   where u.id=p_upload_id
 ),
 mes as (
   select date_trunc('month',l.data::timestamp)::date competencia,
     count(*) as total,
     count(*) filter(where l.status_extracao='csv_pendente') as pendentes,
     count(*) filter(where l.status_extracao<>'csv_pendente') as conferidos,
     coalesce(sum(l.valor) filter(where l.valor>0),0)::numeric(18,2) creditos_extraidos,
     coalesce(sum(-l.valor) filter(where l.valor<0),0)::numeric(18,2) debitos_extraidos,
     coalesce(sum(l.valor) filter(where l.status_extracao<>'csv_pendente'),0)::numeric(18,2) liquido_conferido
   from public.financeiro_lancamentos_bancarios l
   join arquivo a on l.upload_id=a.id
   group by 1
 )
 select coalesce(jsonb_agg(
    jsonb_build_object(
      'competencia',to_char(m.competencia,'YYYY-MM'),
      'total',m.total,'pendentes',m.pendentes,'conferidos',m.conferidos,
      'creditos_extraidos',m.creditos_extraidos,'debitos_extraidos',m.debitos_extraidos,
      'liquido_conferido',m.liquido_conferido,
      'creditos_oficiais',r.creditos_oficiais,'debitos_oficiais',r.debitos_oficiais,
      'diferenca_creditos',case when r.creditos_oficiais is not null then r.creditos_oficiais-m.creditos_extraidos end,
      'diferenca_debitos',case when r.debitos_oficiais is not null then r.debitos_oficiais-m.debitos_extraidos end,
      'arquivo_pdf',r.arquivo_pdf
    ) order by m.competencia),'[]'::jsonb)
 from mes m cross join arquivo a
 left join liquida_private.financeiro_extratos_referencia_pdf r
 on r.banco=a.banco and r.conta=a.conta and r.mes=m.competencia;
$function$

REVOKE ALL ON FUNCTION public.financeiro_extrato_conferencia_mensal(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.financeiro_extrato_conferencia_mensal(uuid) TO authenticated;
