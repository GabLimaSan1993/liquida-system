-- Operational controls complement existing receiving, stock and production screens.
-- Production closing format and GRV Online were deferred by the user.
create table liquida_private.gestao_metas (
 dia date not null, etapa text not null, quantidade integer not null check(quantidade>=0),
 objetivo text not null check(length(btrim(objetivo)) between 3 and 1000),
 atualizado_em timestamptz not null default clock_timestamp(), atualizado_por uuid not null references public.user_profiles(id),
 primary key(dia,etapa), check(etapa in('recebimento','funcional','laudo','cosmetica','armazenagem','oracle','picking_b2c','picking_b2b','validacao_meli','embalagem_b2c','embalagem_b2b','faturamento_b2c','faturamento_b2b','expedicao'))
);
create table liquida_private.gestao_efetivo (
 dia date not null, colaborador_id uuid not null references public.user_profiles(id),
 equipe text not null check(length(btrim(equipe)) between 1 and 100), presente boolean not null,
 horas numeric(5,2) check(horas>=0 and horas<=24),
 atualizado_em timestamptz not null default clock_timestamp(), atualizado_por uuid not null references public.user_profiles(id),
 primary key(dia,colaborador_id), check(presente or coalesce(horas,0)=0)
);
create table liquida_private.gestao_alteracoes (
 id uuid primary key default gen_random_uuid(), tipo text not null, chave jsonb not null,
 antes jsonb, depois jsonb not null, justificativa text not null check(length(btrim(justificativa))>=5),
 usuario_id uuid not null references public.user_profiles(id), criado_em timestamptz not null default clock_timestamp()
);
alter table liquida_private.gestao_metas enable row level security;
alter table liquida_private.gestao_efetivo enable row level security;
alter table liquida_private.gestao_alteracoes enable row level security;
revoke all on liquida_private.gestao_metas,liquida_private.gestao_efetivo,liquida_private.gestao_alteracoes from public,anon,authenticated;
create function liquida_private.gestao_operar(p_acao text,p_dados jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='30s' as $$
declare u public.user_profiles%rowtype; d date; fim date; ant jsonb; dep jsonb; v_etapa text; pessoa uuid; q integer;
begin
 select * into u from public.user_profiles where id=auth.uid();
 if u.id is null or not '/v2/assurant/gestao/producao'=any(coalesce(u.telas_permitidas,'{}')) then raise exception 'Sem permissão para Produção da Esteira' using errcode='42501'; end if;
 if p_acao='consultar' then
  d:=(p_dados->>'inicio')::date; fim:=(p_dados->>'fim')::date;
  if d is null or fim is null or fim<d or fim-d>366 then raise exception 'Selecione até 367 dias para a gestão diária'; end if;
  return jsonb_build_object('metas',coalesce((select jsonb_agg(to_jsonb(m) order by dia,etapa) from liquida_private.gestao_metas m where dia between d and fim),'[]'),
  'efetivo',coalesce((select jsonb_agg(to_jsonb(e)||jsonb_build_object('nome',p.nome) order by dia,p.nome) from liquida_private.gestao_efetivo e join public.user_profiles p on p.id=e.colaborador_id where dia between d and fim),'[]'),
  'pessoas',coalesce((select jsonb_agg(jsonb_build_object('id',id,'nome',coalesce(nullif(nome,''),email)) order by nome) from public.user_profiles),'[]'),
  'pode_editar',coalesce(u.is_master,false) or '/v2/assurant/gestao/producao/configurar'=any(coalesce(u.telas_permitidas,'{}')),
  'producao',liquida_private.producao_consultar(d,fim,'dia'));
 end if;
 if not(coalesce(u.is_master,false) or '/v2/assurant/gestao/producao/configurar'=any(coalesce(u.telas_permitidas,'{}'))) then raise exception 'Sem permissão para configurar metas e efetivo' using errcode='42501'; end if;
 if length(btrim(coalesce(p_dados->>'justificativa','')))<5 then raise exception 'Informe uma justificativa com pelo menos 5 caracteres'; end if;
 d:=(p_dados->>'dia')::date;
 if d is null or d<'2024-01-01' or d>'2100-12-31' then raise exception 'Data inválida'; end if;
 if p_acao='salvar_meta' then
  v_etapa:=p_dados->>'etapa'; q:=(p_dados->>'quantidade')::integer;
  if q is null or q<0 or q>10000000 then raise exception 'Quantidade inválida'; end if;
  perform pg_advisory_xact_lock(hashtextextended('meta:'||d||':'||v_etapa,0));
  select to_jsonb(m) into ant from liquida_private.gestao_metas m where dia=d and etapa=v_etapa for update;
  if ant->>'atualizado_em' is distinct from p_dados->>'versao' then raise exception 'Meta alterada por outro usuário. Atualize a consulta.'; end if;
  insert into liquida_private.gestao_metas(dia,etapa,quantidade,objetivo,atualizado_por) values(d,v_etapa,q,btrim(p_dados->>'objetivo'),u.id)
  on conflict(dia,etapa) do update set quantidade=excluded.quantidade,objetivo=excluded.objetivo,atualizado_em=clock_timestamp(),atualizado_por=u.id returning to_jsonb(gestao_metas.*) into dep;
 elsif p_acao='salvar_presenca' then
  if d>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'O efetivo realizado não pode ser registrado no futuro'; end if;
  pessoa:=(p_dados->>'colaborador_id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended('efetivo:'||d||':'||pessoa,0));
  select to_jsonb(e) into ant from liquida_private.gestao_efetivo e where dia=d and colaborador_id=pessoa for update;
  if ant->>'atualizado_em' is distinct from p_dados->>'versao' then raise exception 'Efetivo alterado por outro usuário. Atualize a consulta.'; end if;
  insert into liquida_private.gestao_efetivo(dia,colaborador_id,equipe,presente,horas,atualizado_por)
  values(d,pessoa,btrim(p_dados->>'equipe'),(p_dados->>'presente')::boolean,nullif(p_dados->>'horas','')::numeric,u.id)
  on conflict(dia,colaborador_id) do update set equipe=excluded.equipe,presente=excluded.presente,horas=excluded.horas,atualizado_em=clock_timestamp(),atualizado_por=u.id returning to_jsonb(gestao_efetivo.*) into dep;
 else raise exception 'Ação inválida'; end if;
 insert into liquida_private.gestao_alteracoes(tipo,chave,antes,depois,justificativa,usuario_id)
 values(p_acao,jsonb_build_object('dia',d,'etapa',v_etapa,'colaborador_id',pessoa),ant,dep,btrim(p_dados->>'justificativa'),u.id);
 return jsonb_build_object('ok',true);
end $$;
create function public.assurant_gestao_operacional(p_acao text,p_dados jsonb default '{}') returns jsonb language sql security invoker set search_path=pg_catalog as $$select liquida_private.gestao_operar(p_acao,p_dados)$$;
revoke all on function liquida_private.gestao_operar(text,jsonb),public.assurant_gestao_operacional(text,jsonb) from public,anon;
grant execute on function liquida_private.gestao_operar(text,jsonb),public.assurant_gestao_operacional(text,jsonb) to authenticated;

-- Read-only physical inventory: one row per allocation; reservations are collected,
-- never joined as extra stock units. Inconsistencies remain visible.
create function liquida_private.inventario_geral(p_busca text default '',p_divergentes boolean default false,p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='25s' as $$
declare v jsonb;
begin
 if not exists(select 1 from public.user_profiles where id=auth.uid() and (is_master or '/v2/assurant/estoque/consulta'=any(coalesce(telas_permitidas,'{}')))) then raise exception 'Sem permissão para consulta de estoque' using errcode='42501'; end if;
 with base as materialized(
 select a.id,a.voucher,a.imei,a.sku,a.modelo,a.grade_fisica,a.grade_venda,a.confirmado_em,a.endereco_id,
 public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha) endereco,e.status status_endereco,
 coalesce(r.reservas,'[]') reservas,coalesce(r.qtd,0) reservas_ativas,
 array_remove(array[
 case when count(*) over(partition by a.endereco_id)>1 then 'Mais de um produto no endereço' end,
 case when nullif(btrim(a.imei),'') is not null and count(*) over(partition by btrim(a.imei))>1 then 'IMEI em mais de uma posição' end,
 case when e.id is null or not e.ativo then 'Endereço ausente ou inativo' end,
 case when e.status not in('ocupado','bloqueado') then 'Status do endereço incompatível' end,
 case when coalesce(r.qtd,0)>1 then 'Mais de uma reserva ativa' end,
 case when r.incompativel then 'Reserva com IMEI ou endereço incompatível' end
 ],null) divergencias
 from public.wms_alocacoes a left join public.wms_enderecos e on e.id=a.endereco_id
 left join lateral(select count(*) qtd,bool_or(s.endereco_id is distinct from a.endereco_id or btrim(s.imei) is distinct from btrim(a.imei)) incompativel,
 jsonb_agg(jsonb_build_object('canal',s.canal,'referencia',s.referencia_id,'status',s.status,'reservado_em',s.reservado_em) order by s.reservado_em) reservas
 from public.wms_reservas_saida s where s.alocacao_id=a.id and s.status in('reservado','analise','reconciliar')) r on true
 where a.status='confirmado' and a.retirado_em is null
 ), filtrada as materialized(select * from base where
 (coalesce(p_busca,'')='' or concat_ws(' ',voucher,imei,sku,modelo,endereco,reservas::text) ilike '%'||btrim(p_busca)||'%') and (not coalesce(p_divergentes,false) or cardinality(divergencias)>0))
 select jsonb_build_object('total',(select count(*) from filtrada),'saldo_fisico',(select count(*) from base),
 'comprometidos',(select count(*) from base where reservas_ativas>0),'bloqueados',(select count(*) from base where status_endereco='bloqueado'),
 'livres',(select count(*) from base where reservas_ativas=0 and status_endereco='ocupado' and cardinality(divergencias)=0),
 'divergentes',(select count(*) from base where cardinality(divergencias)>0),
 'dados',coalesce((select jsonb_agg(to_jsonb(t) order by endereco,imei,id) from(select * from filtrada order by endereco,imei,id limit 100 offset greatest(0,coalesce(p_offset,0))) t),'[]'),
 'consultado_em',now()) into v; return v;
end $$;
create function public.assurant_inventario_geral(p_busca text default '',p_divergentes boolean default false,p_offset integer default 0) returns jsonb language sql security invoker set search_path=pg_catalog as $$select liquida_private.inventario_geral(p_busca,p_divergentes,p_offset)$$;
revoke all on function liquida_private.inventario_geral(text,boolean,integer),public.assurant_inventario_geral(text,boolean,integer) from public,anon;
grant execute on function liquida_private.inventario_geral(text,boolean,integer),public.assurant_inventario_geral(text,boolean,integer) to authenticated;

-- Correios uses the existing receipt -> voucher -> functional flow.
alter table public.recebimentos add column codigo_rastreio text;
alter table public.recebimentos add constraint recebimentos_correios_rastreio check(transportadora<>'Correios' or coalesce(codigo_rastreio,'') ~ '^[A-Z]{2}[0-9]{9}[A-Z]{2}$');
create unique index recebimentos_correios_objeto_uidx on public.recebimentos(upper(codigo_rastreio)) where transportadora='Correios';
create function liquida_private.correios_consultar(p_inicio date,p_fim date,p_busca text default '',p_offset integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v jsonb;
begin
 if not exists(select 1 from public.user_profiles where id=auth.uid() and (is_master or '/v2/assurant/recebimento'=any(coalesce(telas_permitidas,'{}')) or '/v2/assurant/recebimento/gestao'=any(coalesce(telas_permitidas,'{}')))) then raise exception 'Sem permissão para recebimento' using errcode='42501'; end if;
 if p_inicio is null or p_fim is null or p_fim<p_inicio or p_fim-p_inicio>366 then raise exception 'Período inválido (até 367 dias)'; end if;
 with base as materialized(select r.id,r.codigo_rastreio,r.status,r.iniciado_em,r.concluido_em,r.iniciado_por_nome,
 v.voucher,v.bipado_em,v.bipado_por_nome from public.recebimentos r left join public.recebimento_vouchers v on v.recebimento_id=r.id
 where r.transportadora='Correios' and r.iniciado_em>=p_inicio::timestamp at time zone 'America/Sao_Paulo' and r.iniciado_em<(p_fim+1)::timestamp at time zone 'America/Sao_Paulo'
 and(coalesce(p_busca,'')='' or concat_ws(' ',r.codigo_rastreio,v.voucher) ilike '%'||btrim(p_busca)||'%'))
 select jsonb_build_object('total',(select count(*) from base),'objetos',(select count(distinct id) from base),'vouchers',(select count(voucher) from base),
 'dados',coalesce((select jsonb_agg(to_jsonb(t) order by iniciado_em desc,id,voucher) from(select * from base order by iniciado_em desc,id,voucher limit 100 offset greatest(0,coalesce(p_offset,0)))t),'[]')) into v;return v;
end $$;
create function public.assurant_correios_consultar(p_inicio date,p_fim date,p_busca text default '',p_offset integer default 0) returns jsonb language sql security invoker set search_path=pg_catalog as $$select liquida_private.correios_consultar(p_inicio,p_fim,p_busca,p_offset)$$;
revoke all on function liquida_private.correios_consultar(date,date,text,integer),public.assurant_correios_consultar(date,date,text,integer) from public,anon;
grant execute on function liquida_private.correios_consultar(date,date,text,integer),public.assurant_correios_consultar(date,date,text,integer) to authenticated;

create table liquida_private.b2c_baixas (
 id uuid primary key default gen_random_uuid(), pedido_id uuid not null references public.pedidos_b2c(id),
 alocacao_id uuid not null references public.wms_alocacoes(id), imei text not null,
 justificativa text not null check(length(btrim(justificativa)) between 10 and 2000),
 status text not null default 'pendente' check(status in('pendente','efetivada','rejeitada')),
 solicitado_por uuid not null references public.user_profiles(id), solicitado_em timestamptz not null default clock_timestamp(),
 decidido_por uuid references public.user_profiles(id), decidido_em timestamptz, parecer text,
 antes jsonb not null, depois jsonb,
 check(decidido_por is null or decidido_por<>solicitado_por)
);
create unique index b2c_baixas_pendente_uidx on liquida_private.b2c_baixas(alocacao_id) where status='pendente';
create table liquida_private.b2c_baixas_eventos (
 id uuid primary key default gen_random_uuid(), baixa_id uuid not null references liquida_private.b2c_baixas(id),
 acao text not null, usuario_id uuid not null references public.user_profiles(id), criado_em timestamptz not null default clock_timestamp(), dados jsonb not null
);
alter table liquida_private.b2c_baixas enable row level security;
alter table liquida_private.b2c_baixas_eventos enable row level security;
revoke all on liquida_private.b2c_baixas,liquida_private.b2c_baixas_eventos from public,anon,authenticated;
-- Returns a locked, minimal operational snapshot; commercial/personal data is omitted.
create function liquida_private.b2c_baixa_validar(p_pedido uuid) returns jsonb
language plpgsql set search_path=pg_catalog,public as $$
declare p public.pedidos_b2c%rowtype; a public.wms_alocacoes%rowtype; e public.wms_enderecos%rowtype;
begin
 select * into p from public.pedidos_b2c where id=p_pedido for update;
 if not found then raise exception 'Pedido não encontrado'; end if;
 if p.status not in('faturado','concluido') or p.faturado_em is null or (nullif(btrim(p.numero_nf),'') is null and coalesce(p.chave_nf,'') !~ '^[0-9]{44}$') then raise exception 'Baixa manual exige pedido faturado ou concluído e nota fiscal registrada'; end if;
 if nullif(btrim(p.imei_alocado),'') is null then raise exception 'Pedido sem IMEI alocado'; end if;
 if p.imei_bipado is not null and btrim(p.imei_bipado)<>btrim(p.imei_alocado) then raise exception 'IMEI bipado difere do IMEI alocado'; end if;
 if (select count(*) from public.wms_alocacoes where btrim(imei)=btrim(p.imei_alocado) and status='confirmado' and retirado_em is null)<>1 then raise exception 'É necessária uma única alocação física confirmada para o IMEI'; end if;
 select * into a from public.wms_alocacoes where btrim(imei)=btrim(p.imei_alocado) and status='confirmado' and retirado_em is null for update;
 if p.wms_alocacao_id is not null and p.wms_alocacao_id<>a.id then raise exception 'O vínculo WMS do pedido mudou ou não corresponde à posição física'; end if;
 select * into e from public.wms_enderecos where id=a.endereco_id for update;
 if not found or not e.ativo or e.status not in('ocupado','bloqueado') then raise exception 'Endereço físico inválido para retirada'; end if;
 if (select count(*) from public.wms_alocacoes where endereco_id=a.endereco_id and status='confirmado' and retirado_em is null)<>1 then raise exception 'Endereço contém mais de uma alocação ativa'; end if;
 if exists(select 1 from public.wms_reservas_saida where alocacao_id=a.id and status in('reservado','analise','reconciliar') and(canal<>'B2C' or referencia_id<>p.id::text)) then raise exception 'Produto reservado por outro fluxo'; end if;
 if exists(select 1 from public.pedidos_b2c where id<>p.id and btrim(imei_alocado)=btrim(p.imei_alocado) and status not in('cancelado','concluido')) then raise exception 'IMEI vinculado a outro pedido B2C'; end if;
 return jsonb_build_object('pedido_id',p.id,'pedido',p.id_anymarket,'sku',p.sku_alocado,'status_pedido',p.status,'numero_nf',p.numero_nf,'chave_nf',p.chave_nf,'faturado_em',p.faturado_em,
 'imei',btrim(p.imei_alocado),'alocacao_id',a.id,'endereco_id',a.endereco_id,'endereco',public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha),
 'alocacao_atualizada_em',a.atualizado_em,'status_endereco',e.status);
end $$;
revoke all on function liquida_private.b2c_baixa_validar(uuid) from public,anon,authenticated;
create function liquida_private.b2c_baixa_operar(p_acao text,p_dados jsonb default '{}') returns jsonb
language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='25s' as $$
declare u public.user_profiles%rowtype; s liquida_private.b2c_baixas%rowtype; snap jsonb; res jsonb; v_id uuid; busca text;
begin
 select * into u from public.user_profiles where id=auth.uid();
 if u.id is null or not(coalesce(u.is_master,false) or lower(u.email) like '%@liquidapreco.com.br') or not '/v2/assurant/b2c/baixas'=any(coalesce(u.telas_permitidas,'{}')) then raise exception 'Sem permissão para baixas B2C' using errcode='42501'; end if;
 if p_acao='listar' then
  return jsonb_build_object('pode_aprovar','/v2/assurant/b2c/baixas/aprovar'=any(coalesce(u.telas_permitidas,'{}')),
   'total',(select count(*) from liquida_private.b2c_baixas),
   'dados',coalesce((select jsonb_agg(to_jsonb(x) order by solicitado_em desc,id) from(
    select b.*,p.nome solicitante,d.nome aprovador from liquida_private.b2c_baixas b join public.user_profiles p on p.id=b.solicitado_por left join public.user_profiles d on d.id=b.decidido_por
    order by b.solicitado_em desc,b.id limit 50 offset greatest(0,coalesce((p_dados->>'offset')::integer,0)))x),'[]'));
 elsif p_acao='buscar' then
  busca:=btrim(p_dados->>'busca'); if length(coalesce(busca,''))<3 then raise exception 'Informe pedido ou IMEI'; end if;
  return jsonb_build_object('dados',coalesce((select jsonb_agg(to_jsonb(x)) from(select id,id_anymarket,sku_alocado,imei_alocado,status,numero_nf,wms_alocacao_id from public.pedidos_b2c where id::text=busca or id_anymarket::text=busca or imei_alocado=busca order by criado_em desc limit 100)x),'[]'));
 elsif p_acao='simular' then
  return liquida_private.b2c_baixa_validar((p_dados->>'pedido_id')::uuid);
 elsif p_acao='solicitar' then
  if length(btrim(coalesce(p_dados->>'justificativa','')))<10 then raise exception 'Descreva a justificativa com pelo menos 10 caracteres'; end if;
  snap:=liquida_private.b2c_baixa_validar((p_dados->>'pedido_id')::uuid);
  if snap is distinct from p_dados->'previa' then raise exception 'Pedido ou posição mudou desde a prévia. Consulte novamente.'; end if;
  insert into liquida_private.b2c_baixas(pedido_id,alocacao_id,imei,justificativa,solicitado_por,antes)
  values((snap->>'pedido_id')::uuid,(snap->>'alocacao_id')::uuid,snap->>'imei',btrim(p_dados->>'justificativa'),u.id,snap) returning * into s;
 elsif p_acao in('aprovar','rejeitar') then
  if not '/v2/assurant/b2c/baixas/aprovar'=any(coalesce(u.telas_permitidas,'{}')) then raise exception 'Sem permissão para aprovar baixas B2C' using errcode='42501'; end if;
  select * into s from liquida_private.b2c_baixas where id=(p_dados->>'id')::uuid for update;
  if not found then raise exception 'Solicitação não encontrada'; end if;
  if s.solicitado_por=u.id then raise exception 'A aprovação deve ser feita por outro usuário autorizado'; end if;
  if s.status<>'pendente' then raise exception 'Solicitação já decidida. Atualize a lista.'; end if;
  if length(btrim(coalesce(p_dados->>'parecer','')))<10 then raise exception 'Informe parecer com pelo menos 10 caracteres'; end if;
  if p_acao='aprovar' then
   snap:=liquida_private.b2c_baixa_validar(s.pedido_id);
   if snap is distinct from s.antes then raise exception 'Pedido ou posição alterado desde a solicitação. Rejeite e solicite novamente.'; end if;
   res:=public.wms_confirmar_retirada_saida('B2C',s.pedido_id::text,s.imei,u.id);
   if not coalesce((res->>'ok')::boolean,false) or (res->>'alocacao_id')::uuid is distinct from s.alocacao_id then raise exception 'Retirada não confirmada: %',coalesce(res->>'erro','alocação divergente'); end if;
   if not exists(select 1 from public.wms_alocacoes where id=s.alocacao_id and status='retirado' and retirado_por=u.id and saida_referencia=s.pedido_id::text) then raise exception 'WMS não confirmou a saída'; end if;
   update liquida_private.b2c_baixas set status='efetivada',decidido_por=u.id,decidido_em=clock_timestamp(),parecer=btrim(p_dados->>'parecer'),depois=res where id=s.id returning * into s;
  else
   update liquida_private.b2c_baixas set status='rejeitada',decidido_por=u.id,decidido_em=clock_timestamp(),parecer=btrim(p_dados->>'parecer') where id=s.id returning * into s;
  end if;
 else raise exception 'Ação inválida'; end if;
 insert into liquida_private.b2c_baixas_eventos(baixa_id,acao,usuario_id,dados) values(s.id,p_acao,u.id,to_jsonb(s));
 return jsonb_build_object('ok',true,'id',s.id,'status',s.status);
end $$;
create function public.assurant_b2c_baixa_manual(p_acao text,p_dados jsonb default '{}') returns jsonb language sql security invoker set search_path=pg_catalog as $$select liquida_private.b2c_baixa_operar(p_acao,p_dados)$$;
revoke all on function liquida_private.b2c_baixa_operar(text,jsonb),public.assurant_b2c_baixa_manual(text,jsonb) from public,anon;
grant execute on function liquida_private.b2c_baixa_operar(text,jsonb),public.assurant_b2c_baixa_manual(text,jsonb) to authenticated;
-- Rights stay in the central user administration. Enable the owner to configure
-- and review, without assigning authority to any other employee.
update public.user_profiles set telas_permitidas=array(select distinct unnest(coalesce(telas_permitidas,'{}')||array['/v2/assurant/b2c/baixas','/v2/assurant/b2c/baixas/aprovar'])) where id='b517d70a-56be-4b4f-8b9e-a03c769dd3c3' and is_master;

create table liquida_private.correios_eventos (
 id uuid primary key default gen_random_uuid(), recebimento_id uuid not null,
 tabela text not null, operacao text not null, usuario_id uuid, registrado_em timestamptz not null default clock_timestamp(), antes jsonb, depois jsonb
);
create index correios_eventos_recebimento_idx on liquida_private.correios_eventos(recebimento_id,registrado_em);
alter table liquida_private.correios_eventos enable row level security;
revoke all on liquida_private.correios_eventos from public,anon,authenticated;
create function liquida_private.correios_auditar() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
declare ant jsonb; dep jsonb; rid uuid; eh boolean;
begin
 if tg_op<>'INSERT' then ant:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then dep:=to_jsonb(new); end if;
 if tg_table_name='recebimentos' then
  rid:=coalesce((dep->>'id')::uuid,(ant->>'id')::uuid);
  eh:=coalesce(dep->>'transportadora','')='Correios' or coalesce(ant->>'transportadora','')='Correios';
 else
  rid:=coalesce((dep->>'recebimento_id')::uuid,(ant->>'recebimento_id')::uuid);
  select transportadora='Correios' into eh from public.recebimentos where id=rid;
 end if;
 if eh then insert into liquida_private.correios_eventos(recebimento_id,tabela,operacao,usuario_id,antes,depois) values(rid,tg_table_name,tg_op,auth.uid(),ant,dep); end if;
 return coalesce(new,old);
end $$;
revoke all on function liquida_private.correios_auditar() from public,anon,authenticated;
create trigger correios_recebimento_auditoria after insert or update or delete on public.recebimentos for each row execute function liquida_private.correios_auditar();
create trigger correios_voucher_auditoria after insert or update or delete on public.recebimento_vouchers for each row execute function liquida_private.correios_auditar();
create function liquida_private.correios_historico(p_id uuid) returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not exists(select 1 from public.user_profiles where id=auth.uid() and(is_master or '/v2/assurant/recebimento'=any(coalesce(telas_permitidas,'{}')) or '/v2/assurant/recebimento/gestao'=any(coalesce(telas_permitidas,'{}')))) then raise exception 'Sem permissão para recebimento' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(x) order by registrado_em,id) from(select e.id,e.operacao,e.tabela,e.registrado_em,coalesce(u.nome,'Não identificado') responsavel,e.antes,e.depois from liquida_private.correios_eventos e left join public.user_profiles u on u.id=e.usuario_id where recebimento_id=p_id)x),'[]');
end $$;
create function public.assurant_correios_historico(p_id uuid) returns jsonb language sql security invoker set search_path=pg_catalog as $$select liquida_private.correios_historico(p_id)$$;
revoke all on function liquida_private.correios_historico(uuid),public.assurant_correios_historico(uuid) from public,anon;
grant execute on function liquida_private.correios_historico(uuid),public.assurant_correios_historico(uuid) to authenticated;
