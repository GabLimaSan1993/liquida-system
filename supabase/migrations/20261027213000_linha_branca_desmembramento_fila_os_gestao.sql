-- Fila de avaliação de desmembramento solicitada pela gestão.
-- Não altera os status operacionais, aprovações ou saldos existentes.
create table if not exists liquida_private.lb_desmembramento_fila (
 numero_os text primary key check(numero_os ~ '^[0-9]{5,12}$'),
 origem text not null,
 observacoes text,
 registrado_em timestamptz not null default now(),
 ativo boolean not null default true
);
alter table liquida_private.lb_desmembramento_fila enable row level security;
revoke all on liquida_private.lb_desmembramento_fila from public,anon,authenticated;
insert into liquida_private.lb_desmembramento_fila(numero_os,origem,observacoes)
values
 ('568445','Solicitação da gestão em 27/10/2026','OS já existente em Scrap: requer avaliação e aprovação para mudança de destino'),
 ('539627','Solicitação da gestão em 27/10/2026','OS não encontrada no cadastro operacional: requer regularização da identificação'),
 ('510305','Solicitação da gestão em 27/10/2026','OS não encontrada no cadastro operacional: requer regularização da identificação'),
 ('551483','Solicitação da gestão em 27/10/2026','OS não encontrada no cadastro operacional: requer regularização da identificação')
on conflict(numero_os) do update
 set ativo=true,observacoes=excluded.observacoes;

create or replace function liquida_private.lb_desmembramento_fila_consultar()
returns jsonb language plpgsql security definer
set search_path=pg_catalog,public set statement_timeout='15s'
as $f$
declare
 v_uid uuid:=auth.uid();
 v_profile public.user_profiles%rowtype;
 v_result jsonb;
begin
 select * into v_profile from public.user_profiles where id=v_uid;
 if not found or v_uid is null or not (
   coalesce(v_profile.is_master,false)
   or '/v2/linha-branca/desmembramento'=any(coalesce(v_profile.telas_permitidas,'{}'::text[]))
 ) then
  raise exception 'Acesso negado à fila de desmembramento' using errcode='42501';
 end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by q.registrado_em,q.numero_os),'[]'::jsonb)
 into v_result from (
  select f.numero_os,f.registrado_em,f.origem,f.observacoes,
    o.id as os_id,o.linha_produto,o.categoria,o.marca,o.modelo,
    o.status_atual,o.etapa_atual,o.area_destino,
    coalesce(c.aprovado,false) and o.area_destino='Desmembramento' as liberado_estoque,
    case when o.id is null then 'OS NÃO CADASTRADA'
      when coalesce(c.aprovado,false) and o.area_destino='Desmembramento' then 'LIBERADO'
      when o.area_destino='Scrap' then 'SCRAP — AVALIAR'
      else 'AGUARDANDO APROVAÇÃO' end as situacao,
    (select count(*)::int from liquida_private.lb_desmembramento_pecas p
        where p.os_id=o.id) as pecas_registradas
  from liquida_private.lb_desmembramento_fila f
  left join public.ordens_servico o on o.numero_os=f.numero_os and o.linha_produto='Linha Branca'
  left join lateral (
     select true as aprovado from public.linha_branca_condenacoes c
     where c.os_id=o.id and c.status='aprovada' and c.destino='Desmembramento'
     order by c.decidido_em desc nulls last,c.id desc limit 1
  ) c on true
  where f.ativo
 ) q;
 return jsonb_build_object('ok',true,'oss',v_result);
end $f$;
revoke all on function liquida_private.lb_desmembramento_fila_consultar() from public,anon;
grant execute on function liquida_private.lb_desmembramento_fila_consultar() to authenticated;
create or replace function public.linha_branca_desmembramento_fila()
returns jsonb language sql security invoker set search_path=pg_catalog
as $w$ select liquida_private.lb_desmembramento_fila_consultar() $w$;
revoke all on function public.linha_branca_desmembramento_fila() from public,anon;
grant execute on function public.linha_branca_desmembramento_fila() to authenticated;
