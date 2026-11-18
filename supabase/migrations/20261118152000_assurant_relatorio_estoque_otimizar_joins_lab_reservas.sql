do $patch$
declare
 f text;
 f0 text;
 old_joins text := $old$
  left join reservas rv on rv.imei=btrim(t.imei) and rv.voucher=upper(btrim(t.voucher))
  left join lab_etapas le on le.voucher=upper(btrim(t.voucher)) and (le.imei is null or le.imei IS NOT DISTINCT FROM t.imei)
$old$;
 new_joins text := $new$
  -- Não cruzar os ~213 mil cadastros com o laboratório em cada consulta.
  -- A reserva só é necessária para calcular status quando o filtro o exigir.
  left join reservas rv on coalesce(p_status,'')<>'' and rv.imei=btrim(t.imei) and rv.voucher=upper(btrim(t.voucher))
$new$;
 old_base text := $old$base AS NOT MATERIALIZED (
  SELECT * FROM base_sem_lab WHERE coalesce(p_status_laboratorio, '') = ''
   OR status_laboratorio_filtro = p_status_laboratorio
 )$old$;
 new_base text := $new$base AS NOT MATERIALIZED (
  SELECT b.* FROM base_sem_lab b WHERE coalesce(p_status_laboratorio, '') = ''
   OR EXISTS (
    SELECT 1 FROM lab_etapas le
    WHERE le.voucher=upper(btrim(b.voucher))
      AND (le.imei IS NULL OR le.imei IS NOT DISTINCT FROM b.imei)
      AND le.status_etapa=p_status_laboratorio
   )
 )$new$;
 old_lab text := $old$SELECT status_laboratorio_filtro AS etapa,count(*) AS quantidade
      FROM base_sem_lab
      WHERE status_laboratorio_filtro IS NOT NULL
      GROUP BY status_laboratorio_filtro$old$;
 new_lab text := $new$SELECT le.status_etapa AS etapa,count(DISTINCT b.id) AS quantidade
      FROM lab_etapas le
      JOIN base_sem_lab b ON le.voucher=upper(btrim(b.voucher))
        AND (le.imei IS NULL OR le.imei IS NOT DISTINCT FROM b.imei)
      WHERE le.status_etapa IS NOT NULL
      GROUP BY le.status_etapa$new$;
 old_status text := $old$'status',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (select distinct status_atual as x from source where nullif(trim(status_atual),'') is not null) f)$old$;
 new_status text := $new$'status',(select coalesce(jsonb_agg(x order by x),'[]'::jsonb) from (
    select distinct status_atual as x from source where nullif(trim(status_atual),'') is not null
    union select distinct status_exibicao as x from reservas where status_exibicao is not null
   ) f)$new$;
begin
 select pg_get_functiondef('liquida_private.relatorio_estoque_consultar_lab(date,date,text,text,text,text,text,integer,integer,boolean,text)'::regprocedure) into f;
 f0:=f;
 if strpos(f, new_joins)>0 then
  raise notice 'Relatório já otimizado'; return;
 end if;
 if strpos(f,old_joins)=0 or strpos(f,old_base)=0 or strpos(f,old_lab)=0 or strpos(f,old_status)=0
   or strpos(f,'select t.id,t.voucher,coalesce(rv.status_exibicao,t.status_atual) as status_atual, le.status_etapa as status_laboratorio_filtro,')=0
   then raise exception 'Estrutura da função mudou; nenhuma alteração aplicada'; end if;
 f:=replace(f,old_joins,new_joins);
 f:=replace(f,old_base,new_base);
 f:=replace(f,old_lab,new_lab);
 f:=replace(f,old_status,new_status);
 f:=replace(f,'select t.id,t.voucher,coalesce(rv.status_exibicao,t.status_atual) as status_atual, le.status_etapa as status_laboratorio_filtro,',
              'select t.id,t.voucher,t.imei,coalesce(rv.status_exibicao,t.status_atual) as status_atual, null::text as status_laboratorio_filtro,');
 execute f;
 raise notice 'Consulta de estoque otimizada: laboratório via EXISTS, reservas sob demanda, detalhes paginados';
end
$patch$;