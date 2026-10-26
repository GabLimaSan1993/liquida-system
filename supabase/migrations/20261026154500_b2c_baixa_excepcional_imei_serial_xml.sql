-- Baixa B2C extraordinária por IMEI ou serial, independentemente do estágio comercial.
-- Sem faturamento fictício; exige XML privado, motivo, segundo aprovador e trilha auditável.
create table if not exists liquida_private.b2c_baixas_excepcionais (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid references public.pedidos_b2c(id),
 pedido_referencia text,
 identificador text not null,
 tipo_identificador text not null check (tipo_identificador in ('imei','serial')),
 alocacao_id uuid references public.wms_alocacoes(id),
 triagem_id uuid references public.assurant_triagem(id),
 xml_path text not null,
 justificativa text not null check (length(btrim(justificativa)) between 10 and 2000),
 antes jsonb not null,
 depois jsonb,
 status text not null default 'pendente' check (status in ('pendente','efetivada','rejeitada')),
 solicitado_por uuid not null references public.user_profiles(id),
 solicitado_em timestamptz not null default clock_timestamp(),
 decidido_por uuid references public.user_profiles(id),
 decidido_em timestamptz,
 parecer text,
 constraint b2c_baixa_excepcional_segregacao check (decidido_por is null or decidido_por <> solicitado_por)
);
create unique index if not exists b2c_baixas_excepcionais_pendente_uidx
 on liquida_private.b2c_baixas_excepcionais (upper(btrim(identificador))) where status='pendente';
create index if not exists b2c_baixas_excepcionais_pedido_idx
 on liquida_private.b2c_baixas_excepcionais (pedido_id,solicitado_em desc);
alter table liquida_private.b2c_baixas_excepcionais enable row level security;
revoke all on liquida_private.b2c_baixas_excepcionais from public,anon,authenticated;

create or replace function public.assurant_b2c_baixa_excepcional_permitido()
returns boolean language sql stable security definer set search_path=pg_catalog as $$
select auth.uid() is not null and exists (
 select 1 from public.user_profiles u where u.id=auth.uid()
 and (u.is_master or lower(coalesce(u.email,'')) like '%@liquidapreco.com.br')
 and '/v2/assurant/b2c/baixas'=any(coalesce(u.telas_permitidas,'{}'::text[]))
);
$$;
revoke all on function public.assurant_b2c_baixa_excepcional_permitido() from public,anon;
grant execute on function public.assurant_b2c_baixa_excepcional_permitido() to authenticated;

insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('b2c-baixas-xml','b2c-baixas-xml',false,2097152,array['application/xml','text/xml'])
on conflict(id) do nothing;
create policy "Baixas B2C XML insert" on storage.objects for insert to authenticated
with check (
 bucket_id='b2c-baixas-xml'
 and (storage.foldername(name))[1] = auth.uid()::text
 and public.assurant_b2c_baixa_excepcional_permitido()
);
create policy "Baixas B2C XML select" on storage.objects for select to authenticated
using (bucket_id='b2c-baixas-xml' and public.assurant_b2c_baixa_excepcional_permitido());

create or replace function liquida_private.b2c_baixa_excepcional_contexto(p_pedido text,p_identificador text,p_tipo text)
returns jsonb language plpgsql set search_path=pg_catalog,public as $$
declare p public.pedidos_b2c%rowtype; a public.wms_alocacoes%rowtype; t public.assurant_triagem%rowtype;
 v_ident text:=upper(btrim(coalesce(p_identificador,'')));
 v_ref text:=nullif(btrim(p_pedido),'');
 v_count integer;
begin
 if p_tipo not in ('imei','serial') then raise exception 'Selecione IMEI ou serial'; end if;
 if p_tipo='imei' and v_ident !~ '^[0-9]{14,16}$' then raise exception 'Informe um IMEI válido, com 14 a 16 dígitos'; end if;
 if p_tipo='serial' and v_ident !~ '^[A-Z0-9_-]{4,50}$' then raise exception 'Informe um serial válido'; end if;
 if v_ref is not null then
   select * into p from public.pedidos_b2c where id::text=v_ref or id_anymarket::text=v_ref
   order by criado_em desc limit 1;
   if not found then raise exception 'Pedido não localizado. Confira o número, ou deixe-o em branco para baixar apenas o aparelho'; end if;
 end if;
 select count(*) into v_count from public.wms_alocacoes
 where upper(btrim(imei))=v_ident and status='confirmado' and retirado_em is null;
 if v_count>1 then raise exception 'Identificador em mais de uma alocação ativa; é necessário conciliar o WMS'; end if;
 select * into a from public.wms_alocacoes
 where upper(btrim(imei))=v_ident and status='confirmado' and retirado_em is null
 order by confirmado_em desc nulls last limit 1;
 select * into t from public.assurant_triagem where upper(btrim(imei))=v_ident
 order by criado_em desc nulls last limit 1;
 if a.id is null and t.id is null then raise exception 'IMEI/serial não localizado no estoque ou na triagem'; end if;
 if t.id is not null and t.status_atual='Baixa manual administrativa' then
   raise exception 'Este produto já foi baixado manualmente';
 end if;
 return jsonb_build_object(
  'pedido_id',p.id,'pedido',p.id_anymarket,'status_pedido',p.status,
  'imei_do_pedido',p.imei_alocado,'numero_nf',p.numero_nf,
  'identificador',v_ident,'tipo_identificador',p_tipo,
  'alocacao_id',a.id,'status_wms',a.status,'endereco_id',a.endereco_id,
  'triagem_id',t.id,'status_produto',t.status_atual,'voucher',coalesce(t.voucher,a.voucher),
  'sku',coalesce(a.sku,t.sku),
  'reserva_ativa',exists(select 1 from public.wms_reservas_saida r
    where r.alocacao_id=a.id and r.status in ('reservado','analise','reconciliar'))
 );
end $$;
revoke all on function liquida_private.b2c_baixa_excepcional_contexto(text,text,text) from public,anon,authenticated;

create or replace function liquida_private.b2c_baixa_excepcional_operar(p_acao text,p_dados jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='25s' as $$
declare u public.user_profiles%rowtype; s liquida_private.b2c_baixas_excepcionais%rowtype;
 snap jsonb; novo jsonb; res jsonb; a public.wms_alocacoes%rowtype;
 e public.wms_enderecos%rowtype; v_ref text; v_path text;
begin
 select * into u from public.user_profiles where id=auth.uid();
 if not public.assurant_b2c_baixa_excepcional_permitido() then
   raise exception 'Sem permissão para baixas excepcionais' using errcode='42501';
 end if;
 if p_acao='listar' then
   return jsonb_build_object(
    'pode_aprovar','/v2/assurant/b2c/baixas/aprovar'=any(coalesce(u.telas_permitidas,'{}'::text[])),
    'total',(select count(*) from liquida_private.b2c_baixas_excepcionais),
    'dados',coalesce((select jsonb_agg(to_jsonb(x) order by x.solicitado_em desc) from
      (select b.*,sol.nome solicitante,apr.nome aprovador
       from liquida_private.b2c_baixas_excepcionais b
       join public.user_profiles sol on sol.id=b.solicitado_por
       left join public.user_profiles apr on apr.id=b.decidido_por
       order by b.solicitado_em desc limit 50 offset greatest(0,coalesce((p_dados->>'offset')::integer,0))) x),'[]'::jsonb)
   );
 elsif p_acao='simular' then
   return liquida_private.b2c_baixa_excepcional_contexto(p_dados->>'pedido',p_dados->>'identificador',p_dados->>'tipo');
 elsif p_acao='solicitar' then
   if length(btrim(coalesce(p_dados->>'justificativa',''))) not between 10 and 2000 then
     raise exception 'Informe motivo entre 10 e 2000 caracteres';
   end if;
   v_path := p_dados->>'xml_path';
   if v_path is null or v_path !~ ('^'||auth.uid()::text||'/[a-f0-9-]{36}[.]xml then
     raise exception 'Anexe um XML válido e vinculado ao solicitante';
   end if;
   if not exists(select 1 from storage.objects where bucket_id='b2c-baixas-xml' and name=v_path) then
     raise exception 'O XML informado não foi encontrado no armazenamento seguro';
   end if;
   snap := liquida_private.b2c_baixa_excepcional_contexto(p_dados->>'pedido',p_dados->>'identificador',p_dados->>'tipo');
   if snap is distinct from p_dados->'previa' then
     raise exception 'O contexto do produto mudou. Consulte novamente antes de solicitar';
   end if;
   if exists(select 1 from liquida_private.b2c_baixas_excepcionais
     where upper(btrim(identificador))=snap->>'identificador' and status='pendente') then
     raise exception 'Já existe uma baixa pendente para este identificador';
   end if;
   insert into liquida_private.b2c_baixas_excepcionais(
     pedido_id,pedido_referencia,identificador,tipo_identificador,alocacao_id,triagem_id,
     xml_path,justificativa,antes,solicitado_por
   ) values(
     (snap->>'pedido_id')::uuid,p_dados->>'pedido',snap->>'identificador',snap->>'tipo_identificador',
     (snap->>'alocacao_id')::uuid,(snap->>'triagem_id')::uuid,
     v_path,btrim(p_dados->>'justificativa'),snap,u.id
   ) returning * into s;
 elsif p_acao in('aprovar','rejeitar') then
   if not '/v2/assurant/b2c/baixas/aprovar'=any(coalesce(u.telas_permitidas,'{}'::text[]))
   then raise exception 'Sem permissão para aprovar baixas excepcionais' using errcode='42501'; end if;
   select * into s from liquida_private.b2c_baixas_excepcionais
     where id=(p_dados->>'id')::uuid for update;
   if not found then raise exception 'Solicitação não localizada'; end if;
   if s.status<>'pendente' then raise exception 'Solicitação já decidida'; end if;
   if s.solicitado_por=u.id then raise exception 'O solicitante não pode aprovar sua própria baixa'; end if;
   if length(btrim(coalesce(p_dados->>'parecer','')))<10 then raise exception 'Informe parecer com 10 caracteres ou mais'; end if;
   if p_acao='rejeitar' then
     update liquida_private.b2c_baixas_excepcionais
       set status='rejeitada',decidido_por=u.id,decidido_em=clock_timestamp(),parecer=btrim(p_dados->>'parecer')
       where id=s.id returning * into s;
   else
     if not exists(select 1 from storage.objects where bucket_id='b2c-baixas-xml' and name=s.xml_path)
     then raise exception 'XML não localizado: aprovação bloqueada'; end if;
     novo := liquida_private.b2c_baixa_excepcional_contexto(
        coalesce(s.pedido_id::text,''),s.identificador,s.tipo_identificador);
     if (novo-'reserva_ativa') is distinct from (s.antes-'reserva_ativa') then
       raise exception 'A identificação, pedido ou posição mudou. Rejeite e solicite novamente';
     end if;
     if s.alocacao_id is not null then
       select * into a from public.wms_alocacoes where id=s.alocacao_id for update;
       if a.status<>'confirmado' or a.retirado_em is not null then
         raise exception 'Alocação já movimentada';
       end if;
       select * into e from public.wms_enderecos where id=a.endereco_id for update;
       if not found or not e.ativo or e.status<>'ocupado'
       then raise exception 'Endereço físico precisa ser conciliado antes da baixa'; end if;
       if (select count(*) from public.wms_alocacoes where endereco_id=e.id and status='confirmado' and retirado_em is null)<>1
       then raise exception 'Endereço possui múltiplos produtos ativos'; end if;
       update public.wms_reservas_saida set status='cancelado',
         finalizado_em=clock_timestamp(),finalizado_por=u.id,atualizado_em=clock_timestamp()
         where alocacao_id=a.id and status in ('reservado','analise','reconciliar');
       update public.wms_alocacoes set status='retirado',retirado_em=clock_timestamp(),retirado_por=u.id,
         saida_canal='BAIXA_MANUAL',saida_referencia=s.id::text,atualizado_em=clock_timestamp()
         where id=a.id;
       update public.wms_enderecos set status='livre',reserva_id=null,reservado_ate=null,
         atualizado_em=clock_timestamp() where id=e.id;
     end if;
     if s.triagem_id is not null then
       update public.assurant_triagem set status_atual='Baixa manual administrativa',
         atualizado_em=timezone('UTC',now())
       where id=s.triagem_id;
     end if;
     insert into public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by)
     values(u.nome,'Baixa manual excepcional — XML vinculado',s.antes->>'voucher',s.identificador,
       timezone('UTC',now()),u.id);
     res:=jsonb_build_object('ok',true,'identificador',s.identificador,
       'wms_retirado',s.alocacao_id is not null,'alocacao_id',s.alocacao_id,
       'triagem_baixada',s.triagem_id is not null,'xml_path',s.xml_path);
     update liquida_private.b2c_baixas_excepcionais set status='efetivada',
       decidido_por=u.id,decidido_em=clock_timestamp(),parecer=btrim(p_dados->>'parecer'),
       depois=res where id=s.id returning * into s;
   end if;
 else
   raise exception 'Ação inválida';
 end if;
 return jsonb_build_object('ok',true,'id',s.id,'status',s.status);
end $$;
revoke all on function liquida_private.b2c_baixa_excepcional_operar(text,jsonb) from public,anon;
grant execute on function liquida_private.b2c_baixa_excepcional_operar(text,jsonb) to authenticated;
create or replace function public.assurant_b2c_baixa_excepcional(p_acao text,p_dados jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select liquida_private.b2c_baixa_excepcional_operar(p_acao,p_dados)
$$;
revoke all on function public.assurant_b2c_baixa_excepcional(text,jsonb) from public,anon;
grant execute on function public.assurant_b2c_baixa_excepcional(text,jsonb) to authenticated;
) then
     raise exception 'Anexe um XML válido e vinculado ao solicitante';
   end if;
   if not exists(select 1 from storage.objects where bucket_id='b2c-baixas-xml' and name=v_path) then
     raise exception 'O XML informado não foi encontrado no armazenamento seguro';
   end if;
   snap := liquida_private.b2c_baixa_excepcional_contexto(p_dados->>'pedido',p_dados->>'identificador',p_dados->>'tipo');
   if snap is distinct from p_dados->'previa' then
     raise exception 'O contexto do produto mudou. Consulte novamente antes de solicitar';
   end if;
   if exists(select 1 from liquida_private.b2c_baixas_excepcionais
     where upper(btrim(identificador))=snap->>'identificador' and status='pendente') then
     raise exception 'Já existe uma baixa pendente para este identificador';
   end if;
   insert into liquida_private.b2c_baixas_excepcionais(
     pedido_id,pedido_referencia,identificador,tipo_identificador,alocacao_id,triagem_id,
     xml_path,justificativa,antes,solicitado_por
   ) values(
     (snap->>'pedido_id')::uuid,p_dados->>'pedido',snap->>'identificador',snap->>'tipo_identificador',
     (snap->>'alocacao_id')::uuid,(snap->>'triagem_id')::uuid,
     v_path,btrim(p_dados->>'justificativa'),snap,u.id
   ) returning * into s;
 elsif p_acao in('aprovar','rejeitar') then
   if not '/v2/assurant/b2c/baixas/aprovar'=any(coalesce(u.telas_permitidas,'{}'::text[]))
   then raise exception 'Sem permissão para aprovar baixas excepcionais' using errcode='42501'; end if;
   select * into s from liquida_private.b2c_baixas_excepcionais
     where id=(p_dados->>'id')::uuid for update;
   if not found then raise exception 'Solicitação não localizada'; end if;
   if s.status<>'pendente' then raise exception 'Solicitação já decidida'; end if;
   if s.solicitado_por=u.id then raise exception 'O solicitante não pode aprovar sua própria baixa'; end if;
   if length(btrim(coalesce(p_dados->>'parecer','')))<10 then raise exception 'Informe parecer com 10 caracteres ou mais'; end if;
   if p_acao='rejeitar' then
     update liquida_private.b2c_baixas_excepcionais
       set status='rejeitada',decidido_por=u.id,decidido_em=clock_timestamp(),parecer=btrim(p_dados->>'parecer')
       where id=s.id returning * into s;
   else
     if not exists(select 1 from storage.objects where bucket_id='b2c-baixas-xml' and name=s.xml_path)
     then raise exception 'XML não localizado: aprovação bloqueada'; end if;
     novo := liquida_private.b2c_baixa_excepcional_contexto(
        coalesce(s.pedido_id::text,''),s.identificador,s.tipo_identificador);
     if (novo-'reserva_ativa') is distinct from (s.antes-'reserva_ativa') then
       raise exception 'A identificação, pedido ou posição mudou. Rejeite e solicite novamente';
     end if;
     if s.alocacao_id is not null then
       select * into a from public.wms_alocacoes where id=s.alocacao_id for update;
       if a.status<>'confirmado' or a.retirado_em is not null then
         raise exception 'Alocação já movimentada';
       end if;
       select * into e from public.wms_enderecos where id=a.endereco_id for update;
       if not found or not e.ativo or e.status not in ('ocupado','bloqueado')
       then raise exception 'Endereço físico precisa ser conciliado antes da baixa'; end if;
       if (select count(*) from public.wms_alocacoes where endereco_id=e.id and status='confirmado' and retirado_em is null)<>1
       then raise exception 'Endereço possui múltiplos produtos ativos'; end if;
       update public.wms_reservas_saida set status='cancelado',
         finalizado_em=clock_timestamp(),finalizado_por=u.id,atualizado_em=clock_timestamp()
         where alocacao_id=a.id and status in ('reservado','analise','reconciliar');
       update public.wms_alocacoes set status='retirado',retirado_em=clock_timestamp(),retirado_por=u.id,
         saida_canal='BAIXA_MANUAL',saida_referencia=s.id::text,atualizado_em=clock_timestamp()
         where id=a.id;
       update public.wms_enderecos set status='livre',reserva_id=null,reservado_ate=null,
         atualizado_em=clock_timestamp() where id=e.id;
     end if;
     if s.triagem_id is not null then
       update public.assurant_triagem set status_atual='Baixa manual administrativa',
         atualizado_em=timezone('UTC',now())
       where id=s.triagem_id;
     end if;
     insert into public.assurant_movimentacao(usuario,etapa,voucher,serial_imei,data_etapa,uploaded_by)
     values(u.nome,'Baixa manual excepcional — XML vinculado',s.antes->>'voucher',s.identificador,
       timezone('UTC',now()),u.id);
     res:=jsonb_build_object('ok',true,'identificador',s.identificador,
       'wms_retirado',s.alocacao_id is not null,'alocacao_id',s.alocacao_id,
       'triagem_baixada',s.triagem_id is not null,'xml_path',s.xml_path);
     update liquida_private.b2c_baixas_excepcionais set status='efetivada',
       decidido_por=u.id,decidido_em=clock_timestamp(),parecer=btrim(p_dados->>'parecer'),
       depois=res where id=s.id returning * into s;
   end if;
 else
   raise exception 'Ação inválida';
 end if;
 return jsonb_build_object('ok',true,'id',s.id,'status',s.status);
end $$;
revoke all on function liquida_private.b2c_baixa_excepcional_operar(text,jsonb) from public,anon;
grant execute on function liquida_private.b2c_baixa_excepcional_operar(text,jsonb) to authenticated;
create or replace function public.assurant_b2c_baixa_excepcional(p_acao text,p_dados jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog as $$
select liquida_private.b2c_baixa_excepcional_operar(p_acao,p_dados)
$$;
revoke all on function public.assurant_b2c_baixa_excepcional(text,jsonb) from public,anon;
grant execute on function public.assurant_b2c_baixa_excepcional(text,jsonb) to authenticated;
