create or replace function liquida_private.fechamento_lojas_exportar_lote(
 p_situacao text default 'aguardando',
 p_laudo text default '',
 p_busca text default '',
 p_rede text default '',
 p_limite integer default 1000,
 p_tem_cursor boolean default false,
 p_cursor_data timestamptz default null,
 p_cursor_voucher text default null,
 p_cursor_id uuid default null,
 p_data_inicial date default null,
 p_data_final date default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_catalog
set statement_timeout='25s'
set plan_cache_mode='force_custom_plan'
set jit='off'
set enable_mergejoin='off'
set work_mem='32MB'
as $$
declare v jsonb; v_limite integer;
begin
 if auth.uid() is null or not exists(
  select 1 from public.user_profiles u
  where u.id=auth.uid()
   and '/v2/assurant/gestao/fechamento-lojas'=any(coalesce(u.telas_permitidas,'{}'::text[]))
 ) then
  raise exception 'Sem permissão para Fechamento de Lojas' using errcode='42501';
 end if;
 if coalesce(p_situacao,'') not in ('aguardando','concluida','todos','laudos_liquida','cosmetica')
    or coalesce(p_laudo,'') not in ('','sim','nao') then
  raise exception 'Filtro inválido';
 end if;
 if p_data_inicial is not null and p_data_final is not null and p_data_inicial>p_data_final then
  raise exception 'Período inválido';
 end if;
 if p_tem_cursor and p_cursor_id is null then raise exception 'Cursor inválido'; end if;
 v_limite:=least(2000,greatest(1,coalesce(p_limite,1000)));

 with native as materialized (
  select distinct on (voucher) voucher,id
  from public.triagem_laudos
  order by voucher,criado_em desc,id
 ), source as materialized (
  select t.id,t.voucher,
   coalesce(
    t.data_funcional at time zone 'UTC',
    liquida_private.tradein_data(g.inicio),
    h.inicio
   ) as ordem_data,
   (t.data_laudo is not null or n.id is not null or ga.data_laudo is not null) as tem_laudo,
   coalesce(nullif(g.codigo_loja,''),h.codigo_loja) as codigo_loja,
   coalesce(nullif(g.loja,''),h.loja,t.loja) as loja,
   coalesce(nullif(g.rede,''),h.rede,t.rede) as rede
  from public.assurant_triagem t
  left join native n on n.voucher=t.voucher
  left join public.tradein_geral g on g.voucher_ybv=t.voucher
  left join public.tradein_historico h on h.voucher_key=
   case when t.voucher ~ '^YBV[0-9]+$' then substring(t.voucher from 4) end
  left join public.assurant_gaia_ultimo ga on ga.voucher=t.voucher
  where (
    t.data_cosmetico is not null
    or t.status_atual=any(array[
     'Aguardando triagem cosmética','Aguardando triagem cosmetica',
     'Aguardando cosmética','Aguardando cosmetica'
    ])
    or n.id is not null
   )
   and (
    p_situacao='todos'
    or (p_situacao='cosmetica' and (
      t.data_cosmetico is not null
      or t.status_atual=any(array[
       'Aguardando triagem cosmética','Aguardando triagem cosmetica',
       'Aguardando cosmética','Aguardando cosmetica'
      ])
    ))
    or (p_situacao='aguardando' and t.status_atual=any(array[
      'Aguardando triagem cosmética','Aguardando triagem cosmetica',
      'Aguardando cosmética','Aguardando cosmetica'
    ]))
    or (p_situacao='concluida' and t.data_cosmetico is not null
      and not coalesce(t.status_atual=any(array[
       'Aguardando triagem cosmética','Aguardando triagem cosmetica',
       'Aguardando cosmética','Aguardando cosmetica'
      ]),false))
    or (p_situacao='laudos_liquida' and n.id is not null)
   )
   and (
    p_data_inicial is null
    or (p_situacao='cosmetica' and t.status_atual=any(array[
     'Aguardando triagem cosmética','Aguardando triagem cosmetica',
     'Aguardando cosmética','Aguardando cosmetica'
    ]))
    or t.data_cosmetico >= ((p_data_inicial::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC')
   )
   and (
    p_data_final is null
    or (p_situacao='cosmetica' and t.status_atual=any(array[
     'Aguardando triagem cosmética','Aguardando triagem cosmetica',
     'Aguardando cosmética','Aguardando cosmetica'
    ]))
    or t.data_cosmetico < (((p_data_final+1)::timestamp at time zone 'America/Sao_Paulo') at time zone 'UTC')
   )
   and not exists(
    select 1 from public.assurant_caixas_liberadas x
    where x.voucher=t.voucher or x.imei=t.imei or x.imei_identificado=t.imei
   )
 ), base as not materialized (
  select * from source
  where (coalesce(p_laudo,'')='' or tem_laudo=(p_laudo='sim'))
   and (coalesce(p_busca,'')='' or concat_ws(' ',voucher,loja,codigo_loja) ilike '%'||p_busca||'%')
   and (coalesce(p_rede,'')='' or rede=p_rede)
 ), pagina as materialized (
  select id,voucher,ordem_data
  from base
  where not p_tem_cursor
   or (
    p_cursor_data is not null and (
     ordem_data>p_cursor_data
     or (ordem_data=p_cursor_data and (coalesce(voucher,''),id)>(coalesce(p_cursor_voucher,''),p_cursor_id))
     or ordem_data is null
    )
   )
   or (
    p_cursor_data is null and ordem_data is null
    and (coalesce(voucher,''),id)>(coalesce(p_cursor_voucher,''),p_cursor_id)
   )
  order by ordem_data asc nulls last,coalesce(voucher,''),id
  limit v_limite
 ), detalhes as materialized (
  select p.id,p.voucher,p.ordem_data,to_jsonb(f) item
  from pagina p
  join liquida_private.fechamento_lojas f on f.id=p.id
 )
 select jsonb_build_object(
  'itens',coalesce((
   select jsonb_agg(item order by ordem_data asc nulls last,coalesce(voucher,''),id)
   from detalhes
  ),'[]'::jsonb),
  'cursor',(
   select jsonb_build_object(
    'data',ordem_data,
    'voucher',voucher,
    'id',id
   )
   from pagina
   order by ordem_data desc nulls first,coalesce(voucher,'') desc,id desc
   limit 1
  ),
  'fim',(select count(*)<v_limite from pagina),
  'lidos',(select count(*) from pagina)
 ) into v;
 return v;
end $$;

revoke all on function liquida_private.fechamento_lojas_exportar_lote(
 text,text,text,text,integer,boolean,timestamptz,text,uuid,date,date
) from public,anon;
grant execute on function liquida_private.fechamento_lojas_exportar_lote(
 text,text,text,text,integer,boolean,timestamptz,text,uuid,date,date
) to authenticated;

create or replace function public.assurant_fechamento_lojas_exportar_lote(
 p_situacao text default 'aguardando',
 p_laudo text default '',
 p_busca text default '',
 p_rede text default '',
 p_limite integer default 1000,
 p_tem_cursor boolean default false,
 p_cursor_data timestamptz default null,
 p_cursor_voucher text default null,
 p_cursor_id uuid default null,
 p_data_inicial date default null,
 p_data_final date default null
)
returns jsonb
language sql
security invoker
set search_path=pg_catalog
as $$
 select liquida_private.fechamento_lojas_exportar_lote(
  p_situacao,p_laudo,p_busca,p_rede,p_limite,p_tem_cursor,
  p_cursor_data,p_cursor_voucher,p_cursor_id,p_data_inicial,p_data_final
 );
$$;

revoke all on function public.assurant_fechamento_lojas_exportar_lote(
 text,text,text,text,integer,boolean,timestamptz,text,uuid,date,date
) from public,anon;
grant execute on function public.assurant_fechamento_lojas_exportar_lote(
 text,text,text,text,integer,boolean,timestamptz,text,uuid,date,date
) to authenticated;
