-- Validação de bancada MELI: autorização explícita, auditoria e substituição atômica.
create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function public.meli_validacao_autorizado()
returns boolean language sql stable security invoker set search_path=public
as $$ select auth.uid() is not null and exists (
 select 1 from public.user_profiles where id=auth.uid()
 and '/v2/assurant/b2c/validacao-meli'=any(coalesce(telas_permitidas,'{}'::text[]))
); $$;
revoke all on function public.meli_validacao_autorizado() from public,anon;
grant execute on function public.meli_validacao_autorizado() to authenticated;

create table public.meli_validacoes (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references public.pedidos_b2c(id),
 id_anymarket bigint not null, imei text not null,
 sistema text not null check(sistema in ('android','ios')),
 resultado text not null check(resultado in ('aprovado','reprovado')),
 respostas jsonb not null, motivo text, observacoes text,
 sku text, grade text, titulo text, local_anterior text,
 operador_id uuid not null references auth.users(id),
 operador_nome text not null, criado_em timestamptz not null default now(),
 imei_substituto text, destino_pedido text
);
create index meli_validacoes_pedido_imei_idx on public.meli_validacoes(pedido_id,imei,criado_em desc);
create table public.meli_aparelhos_bloqueados (
 imei text primary key, validacao_id uuid not null references public.meli_validacoes(id),
 motivo text not null, criado_em timestamptz not null default now(),
 criado_por uuid not null references auth.users(id)
);
alter table public.meli_validacoes enable row level security;
alter table public.meli_aparelhos_bloqueados enable row level security;
revoke all on public.meli_validacoes,public.meli_aparelhos_bloqueados from anon,authenticated;
grant select,insert,update on public.meli_validacoes to authenticated;
grant select,insert on public.meli_aparelhos_bloqueados to authenticated;
create policy meli_validacoes_leitura on public.meli_validacoes for select to authenticated using ((select public.meli_validacao_autorizado()));
create policy meli_validacoes_insercao on public.meli_validacoes for insert to authenticated with check ((select public.meli_validacao_autorizado()) and operador_id=auth.uid());
create policy meli_validacoes_atualizacao on public.meli_validacoes for update to authenticated using ((select public.meli_validacao_autorizado()) and operador_id=auth.uid()) with check ((select public.meli_validacao_autorizado()) and operador_id=auth.uid());
create policy meli_bloqueios_leitura on public.meli_aparelhos_bloqueados for select to authenticated using ((select public.meli_validacao_autorizado()));
create policy meli_bloqueios_insercao on public.meli_aparelhos_bloqueados for insert to authenticated with check ((select public.meli_validacao_autorizado()) and criado_por=auth.uid());

create or replace function public.meli_marketplace(p_marketplace text)
returns boolean language sql immutable security invoker set search_path=public
as $$ select regexp_replace(lower(coalesce(p_marketplace,'')),'[^a-z]','','g') in ('mercadolivre','mercadolibre','meli','ml','mercadolivrebrasil'); $$;

create or replace function private.meli_aprovacao_valida(p public.pedidos_b2c)
returns boolean language sql stable security definer set search_path=public
as $$ select auth.uid() is not null and exists (
 select 1 from public.meli_validacoes v
 where v.pedido_id=p.id and v.imei=btrim(p.imei_bipado)
 and v.imei=btrim(p.imei_alocado) and v.resultado='aprovado'
 and v.criado_em>=p.bipado_em
 and v.sku is not distinct from coalesce(p.sku_alocado,p.sku_definido,p.sku_produto)
 and v.grade is not distinct from coalesce(p.grade_alocada,p.grade_definida,p.grade_produto)
 and v.titulo is not distinct from p.titulo_produto
 and not exists(select 1 from public.meli_aparelhos_bloqueados b where b.imei=v.imei)
); $$;
revoke all on function private.meli_aprovacao_valida(public.pedidos_b2c) from public,anon,authenticated;

create or replace function private.meli_guard_pedido()
returns trigger language plpgsql security definer set search_path=public
as $$
declare v_aprovado boolean; v_fiscal boolean; v_legado boolean:=false;
begin
 if not public.meli_marketplace(new.marketplace) then
  if tg_op='UPDATE' and public.meli_marketplace(old.marketplace) and old.status not in ('faturado','concluido','cancelado') then
   raise exception 'Não é permitido alterar o canal para contornar a validação MELI.';
  end if;
  return new;
 end if;
 if tg_op='UPDATE' then
  v_legado:=old.status in ('faturado','concluido') and (old.faturado_em is not null or nullif(btrim(old.numero_nf),'') is not null);
  if v_legado and (new.imei_alocado is distinct from old.imei_alocado or new.imei_bipado is distinct from old.imei_bipado) then
   raise exception 'Não é permitido trocar o IMEI de um pedido MELI já faturado.';
  end if;
 end if;
 v_aprovado:=private.meli_aprovacao_valida(new);
 if new.status='embalado' and not v_aprovado and not v_legado then
  if nullif(btrim(new.imei_bipado),'') is null or new.imei_bipado is distinct from new.imei_alocado then
   raise exception 'Bipe o IMEI separado antes da validação MELI.';
  end if;
  new.status:='aguardando_validacao_meli';
  new.embalado_em:=null; new.embalado_por:=null;
  new.etapa_embalagem:=null; new.emb_nf_colada:=false; new.emb_selado:=false; new.emb_etiquetado:=false;
 end if;
 v_fiscal:=new.status in ('faturado','concluido') or new.faturado_em is not null
   or nullif(btrim(new.numero_nf),'') is not null or nullif(btrim(new.chave_nf),'') is not null;
 if v_fiscal and not v_legado then
  if not v_aprovado then raise exception 'Faturamento MELI bloqueado: aparelho sem aprovação nos testes.'; end if;
  if exists(select 1 from public.pedidos_b2c p where p.id_anymarket=new.id_anymarket and p.id<>new.id
   and p.status not in ('cancelado','arquivado_em_analise')
   and (p.status not in ('embalado','faturado','concluido') or (p.status='embalado' and not private.meli_aprovacao_valida(p)))) then
   raise exception 'Faturamento MELI bloqueado: há outro item do pedido pendente de separação ou validação.';
  end if;
 end if;
 if new.status='aguardando_validacao_meli' and new.etapa_embalagem is not null then
  raise exception 'Conclua os testes MELI antes da embalagem.';
 end if;
 return new;
end; $$;
revoke all on function private.meli_guard_pedido() from public,anon,authenticated;
create trigger aa00_meli_guard_pedido before insert or update on public.pedidos_b2c for each row execute function private.meli_guard_pedido();

create or replace function private.meli_validar_respostas()
returns trigger language plpgsql security invoker set search_path=public
as $$
declare v_keys text[]:=array['modelo','cor','capacidade','sem_linhas','sem_manchas','sem_burnin','tela_colada','touch_completo','sem_trinca','sem_amassado','sem_descascado','cameras','botoes','conector','riscos_grade','liga_desliga','audio','contas_removidas','resetado'];
begin
 if auth.uid() is null or not public.meli_validacao_autorizado() then raise exception 'Sem permissão para os testes MELI.' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  if (to_jsonb(new)-array['imei_substituto','destino_pedido']) is distinct from (to_jsonb(old)-array['imei_substituto','destino_pedido']) then
   raise exception 'O histórico dos testes MELI não pode ser alterado.';
  end if;
  return new;
 end if;
 if new.operador_id<>auth.uid() then raise exception 'Operador inválido.'; end if;
 new.criado_em:=clock_timestamp();
 if jsonb_typeof(new.respostas)<>'object' then raise exception 'Respostas inválidas.'; end if;
 if new.resultado='aprovado' and exists(select 1 from unnest(v_keys) k where new.respostas->k is distinct from 'true'::jsonb) then
  raise exception 'Todos os testes precisam estar aprovados. Qualquer NÃO reprova.';
 end if;
 if new.resultado='reprovado' and (nullif(btrim(new.motivo),'') is null or not exists(select 1 from unnest(v_keys) k where new.respostas->k='false'::jsonb)) then
  raise exception 'Informe o motivo e pelo menos um teste reprovado.';
 end if;
 return new;
end; $$;
create trigger meli_validar_respostas before insert or update on public.meli_validacoes for each row execute function private.meli_validar_respostas();

create or replace function public.meli_finalizar_validacao(p_pedido_id uuid,p_imei text,p_sistema text,p_respostas jsonb,p_motivo text default null,p_observacoes text default null)
returns jsonb language plpgsql security invoker set search_path=public
as $$
declare v_p public.pedidos_b2c%rowtype; v_user uuid:=auth.uid(); v_nome text; v_id uuid; v_reprovado boolean; v_grupo uuid; v_local text; v_res jsonb; v_grupo_novo uuid; v_num integer;
begin
 if v_user is null or not public.meli_validacao_autorizado() then raise exception 'Sem permissão para a validação MELI.' using errcode='42501'; end if;
 select * into v_p from public.pedidos_b2c where id=p_pedido_id for update;
 if not found then raise exception 'Pedido não encontrado.'; end if;
 if not public.meli_marketplace(v_p.marketplace) or v_p.status<>'aguardando_validacao_meli' then raise exception 'Pedido não está aguardando validação MELI. Atualize a fila.'; end if;
 if btrim(p_imei) is distinct from v_p.imei_bipado or v_p.imei_bipado is distinct from v_p.imei_alocado then raise exception 'IMEI divergente. Bipe o aparelho separado para este pedido.'; end if;
 select nome into v_nome from public.user_profiles where id=v_user;
 select local into v_local from public.wms_localizar_saida(array[v_p.imei_alocado]) limit 1;
 if v_local is null then select public.wms_endereco_texto(e.rua,e.bloco,e.andar,e.coluna,e.linha) into v_local from public.wms_alocacoes a join public.wms_enderecos e on e.id=a.endereco_id where a.id=v_p.wms_alocacao_id; end if;
 v_reprovado:=exists(select 1 from jsonb_each(p_respostas) r where r.value='false'::jsonb);
 insert into public.meli_validacoes(pedido_id,id_anymarket,imei,sistema,resultado,respostas,motivo,observacoes,sku,grade,titulo,local_anterior,operador_id,operador_nome)
 values(v_p.id,v_p.id_anymarket,v_p.imei_bipado,p_sistema,case when v_reprovado then 'reprovado' else 'aprovado' end,p_respostas,nullif(btrim(p_motivo),''),nullif(btrim(p_observacoes),''),coalesce(v_p.sku_alocado,v_p.sku_definido,v_p.sku_produto),coalesce(v_p.grade_alocada,v_p.grade_definida,v_p.grade_produto),v_p.titulo_produto,v_local,v_user,coalesce(v_nome,'Operador')) returning id into v_id;
 if not v_reprovado then
  update public.pedidos_b2c set status='embalado',embalado_em=now(),embalado_por=v_user,atualizado_em=now() where id=v_p.id returning * into v_p;
  update public.meli_validacoes set destino_pedido='embalado' where id=v_id;
  return jsonb_build_object('ok',true,'resultado','aprovado','status',v_p.status,'imei',v_p.imei_bipado);
 end if;
 insert into public.meli_aparelhos_bloqueados(imei,validacao_id,motivo,criado_por) values(v_p.imei_bipado,v_id,p_motivo,v_user);
 update public.assurant_triagem set status_atual=case when exists(select 1 from public.wms_alocacoes a where btrim(a.imei)=v_p.imei_bipado and a.status='confirmado') then 'Em análise de estoque' else 'Aguardando armazenagem' end,reanalise=concat_ws(E'\n',nullif(reanalise,''),'Reprovado na bancada MELI: '||p_motivo),atualizado_em=now() where btrim(imei)=v_p.imei_bipado;
 perform public.wms_cancelar_reserva_saida('B2C',v_p.id::text,v_user,'Reprovado nos testes MELI: '||p_motivo);
 v_grupo:=v_p.grupo_id;
 update public.pedidos_b2c set status='aguardando_alocacao',grupo_id=null,imei_alocado=null,imei_bipado=null,sku_alocado=null,grade_alocada=null,wms_alocacao_id=null,bipado_em=null,bipado_por=null,embalado_em=null,embalado_por=null,alocado_em=null,alocado_por=null,etapa_embalagem=null,emb_nf_colada=false,emb_selado=false,emb_etiquetado=false,data_subinv_alocado=null,local_subinv_alocado=null,local_alocado=null,fifo_posicao=null,fifo_total_candidatos=null,fifo_origem=null,motivo_analise='Reprovado na bancada MELI: '||p_motivo,atualizado_em=now() where id=v_p.id;
 v_res:=public.b2c_processar_alocacao_backend(v_p.id);
 if not coalesce((v_res->>'ok')::boolean,false) then raise exception 'Não foi possível substituir: %',v_res->>'erro'; end if;
 select * into v_p from public.pedidos_b2c where id=v_p.id;
 if v_p.status='alocado' then
  -- Reabre a lista original. Se não houver lista, cria uma exclusiva para a substituição.
  v_grupo_novo:=v_grupo;
  if v_grupo_novo is null then
   perform pg_advisory_xact_lock(hashtext('b2c_grupo_exclusivo_desvinculacao'));
   select coalesce(max(numero),0)+1 into v_num from public.pedidos_b2c_grupos;
   insert into public.pedidos_b2c_grupos(numero,status,total_pedidos,criado_por,status_faturamento) values(v_num,'aberto',1,v_user,'pendente') returning id into v_grupo_novo;
  else
   update public.pedidos_b2c_grupos set status='aberto',status_faturamento='pendente',oculto_picking=false,picking_por=null,picking_por_nome=null,picking_em=null where id=v_grupo_novo;
  end if;
  update public.pedidos_b2c set status='em_picking',grupo_id=v_grupo_novo,atualizado_em=now() where id=v_p.id returning * into v_p;
 end if;
 update public.meli_validacoes set imei_substituto=v_p.imei_alocado,destino_pedido=v_p.status where id=v_id;
 return jsonb_build_object('ok',true,'resultado','reprovado','status',v_p.status,'imei_substituto',v_p.imei_alocado,'grupo_id',v_p.grupo_id,'local_retorno',v_local,'motivo',v_p.motivo_analise);
end; $$;
revoke all on function public.meli_finalizar_validacao(uuid,text,text,jsonb,text,text) from public,anon;
grant execute on function public.meli_finalizar_validacao(uuid,text,text,jsonb,text,text) to authenticated;

-- API de prontidão usada pelo faturamento; não revela o checklist a quem não tem acesso.
create or replace function public.meli_pedidos_prontos(p_ids bigint[])
returns table(id_anymarket bigint,pronto boolean) language sql stable security invoker set search_path=public
as $$ select p.id_anymarket,bool_and(p.status in ('embalado','faturado','concluido')) from public.pedidos_b2c p
 where auth.uid() is not null and p.id_anymarket=any(p_ids) and p.status not in ('cancelado','arquivado_em_analise') group by p.id_anymarket; $$;
revoke all on function public.meli_pedidos_prontos(bigint[]) from public,anon;
grant execute on function public.meli_pedidos_prontos(bigint[]) to authenticated;

-- Liberação inicial explícita: nenhum outro master recebe acesso automaticamente.
update public.user_profiles set telas_permitidas=array_append(coalesce(telas_permitidas,'{}'),'/v2/assurant/b2c/validacao-meli')
where id in ('b517d70a-56be-4b4f-8b9e-a03c769dd3c3','6e0ac557-93a2-42ae-8595-12648b2ac0de','48fc7302-33ca-4895-a41c-2582b442453b')
and not ('/v2/assurant/b2c/validacao-meli'=any(coalesce(telas_permitidas,'{}')));

CREATE OR REPLACE FUNCTION public.wms_sync_pedido_b2c_saida()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_res jsonb;
  v_usuario uuid;
  v_status_ativo boolean;
  v_old_ativo boolean;
begin
  if not public.wms_expedicao_ativa() then
    return new;
  end if;

  v_usuario := coalesce(new.bipado_por, new.alocado_por, auth.uid());
  v_status_ativo := new.status in (
    'alocado', 'em_picking', 'em_analise', 'aguardando_definicao_produto', 'aguardando_validacao_meli'
  );
  v_old_ativo := tg_op = 'UPDATE' and old.status in (
    'alocado', 'em_picking', 'em_analise', 'aguardando_definicao_produto', 'aguardando_validacao_meli'
  );

  if new.imei_alocado is null then
    new.wms_alocacao_id := null;
  elsif tg_op = 'UPDATE'
     and new.imei_alocado is distinct from old.imei_alocado then
    new.wms_alocacao_id := null;
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'cancelado'
     and old.status is distinct from 'cancelado'
     and nullif(trim(new.numero_nf), '') is null
     and nullif(trim(new.chave_nf), '') is null
     and old.imei_alocado is not null then
    update public.assurant_triagem t
    set status_atual = case
          when exists (
            select 1
            from public.wms_alocacoes a
            where btrim(a.imei)=btrim(old.imei_alocado)
              and a.status='confirmado'
              and a.retirado_em is null
          ) then
            case
              when exists (
                select 1
                from public.entrada_oracle_ap o
                where btrim(o.imei)=btrim(old.imei_alocado)
                  and (
                    public.assurant_oracle_evento_em(o.data_emissao_nf,null) is not null
                    or public.assurant_oracle_evento_em(o.dt_complete_ri,null) is not null
                    or upper(btrim(coalesce(o.status_sefaz,'')))='FINALIZADO'
                  )
              )
              or t.data_oracle is not null
              or t.oracle_confirmado_em is not null
              then 'Produto disponível'
              else 'Aguardando oracle'
            end
          else 'Aguardando armazenagem'
        end,
        atualizado_em = now()
    where t.id = (
      select x.id
      from public.assurant_triagem x
      where trim(x.imei) = trim(old.imei_alocado)
      order by coalesce(x.atualizado_em, x.criado_em) desc nulls last,
               x.criado_em desc nulls last,
               x.id desc
      limit 1
    );
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'embalado'
     and new.imei_bipado is not null
     and (old.imei_bipado is null or old.status <> 'embalado') then
    -- Pedidos já separados antes desta implantação possuem retirada registrada.
    if old.status='aguardando_validacao_meli' and exists(select 1 from public.wms_alocacoes a where a.id=new.wms_alocacao_id and a.status='retirado' and a.saida_canal='B2C' and a.saida_referencia=new.id::text and btrim(a.imei)=new.imei_bipado) then return new; end if;
    v_res := public.wms_confirmar_retirada_saida(
      'B2C', new.id::text, new.imei_bipado, v_usuario
    );
    if not coalesce((v_res ->> 'ok')::boolean, false) then
      raise exception 'WMS: %', coalesce(v_res ->> 'erro', 'retirada não confirmada');
    end if;

    if v_res ? 'alocacao_id' then
      new.wms_alocacao_id := (v_res ->> 'alocacao_id')::uuid;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status = 'em_analise'
     and old.status in ('alocado', 'em_picking')
     and old.imei_alocado is not null
     and new.imei_alocado is not distinct from old.imei_alocado then
    perform public.wms_marcar_analise_saida(
      'B2C', old.id::text, old.imei_alocado, v_usuario,
      coalesce(new.motivo_analise, 'Não localizado no picking B2C')
    );
  end if;

  if tg_op = 'UPDATE'
     and v_old_ativo
     and old.imei_alocado is not null
     and (
       not v_status_ativo
       or new.imei_alocado is distinct from old.imei_alocado
     ) then
    if new.status = 'aguardando_definicao_produto'
       and old.imei_alocado is not null then
      perform public.wms_marcar_analise_saida(
        'B2C', old.id::text, old.imei_alocado, v_usuario,
        coalesce(new.motivo_analise, 'Não localizado; aguardando definição')
      );
    end if;

    perform public.wms_cancelar_reserva_saida(
      'B2C', old.id::text, v_usuario, 'Pedido alterado ou cancelado'
    );
  end if;

  if v_status_ativo
     and new.imei_alocado is not null
     and (
       tg_op = 'INSERT'
       or not v_old_ativo
       or new.imei_alocado is distinct from old.imei_alocado
       or (
         new.status in ('alocado', 'em_picking')
         and old.status not in ('alocado', 'em_picking')
       )
     ) then
    v_res := public.wms_reservar_saida(
      new.imei_alocado, 'B2C', new.id::text, v_usuario
    );

    if coalesce((v_res ->> 'ok')::boolean, false)
       and v_res ? 'alocacao_id' then
      new.wms_alocacao_id := (v_res ->> 'alocacao_id')::uuid;
    end if;

    if not coalesce((v_res ->> 'ok')::boolean, false)
       and new.status in ('alocado', 'em_picking') then
      raise exception 'WMS: %', coalesce(v_res ->> 'erro', 'reserva não criada');
    end if;
  end if;

  return new;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.wms_buscar_candidatos_saida(p_sku text)
 RETURNS TABLE(alocacao_id uuid, endereco_id bigint, imei text, voucher text, sku text, marca text, modelo text, grade text, status_bateria text, status_atual text, data_subinv date, local_subinv text, aging_dias integer, local text, rua smallint, bloco smallint, andar smallint, coluna text, linha smallint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with candidatos as (
  select distinct on (a.imei)
    a.id as alocacao_id,
    e.id as endereco_id,
    a.imei,
    a.voucher,
    coalesce(a.sku, tri.sku) as sku,
    a.marca,
    coalesce(a.modelo, tri.modelo) as modelo,
    coalesce(a.grade_venda, tri.grade, tri.grade_cosmetica) as grade,
    tri.status_bateria,
    tri.status_atual,
    a.confirmado_em,
    e.status as status_endereco,
    e.rua,
    e.bloco,
    e.andar,
    e.coluna,
    e.linha
  from public.wms_alocacoes a
  join public.wms_enderecos e
    on e.id = a.endereco_id
  left join lateral (
    select
      t.sku,
      t.modelo,
      t.grade,
      t.grade_cosmetica,
      t.status_bateria,
      t.status_atual
    from public.assurant_triagem t
    where btrim(t.imei) = btrim(a.imei)
    order by t.criado_em desc nulls last
    limit 1
  ) tri on true
  where a.status = 'confirmado'
    and e.ativo = true
    and a.imei is not null
    and upper(btrim(coalesce(a.sku, tri.sku))) = upper(btrim(p_sku))
  order by
    a.imei,
    coalesce(a.confirmado_em, a.reservado_em) desc nulls last,
    a.id desc
),
enriquecidos as (
  select
    c.*,
    sub.data_subinv,
    sub.local_subinv,
    case
      when sub.data_subinv is null then null
      else greatest(
        0,
        (now() at time zone 'America/Sao_Paulo')::date - sub.data_subinv
      )::integer
    end as aging_dias,
    r.id as reserva_id
  from candidatos c
  left join lateral (
    select s.data_subinv, s.local_subinv
    from public.estoque_subinv s
    where btrim(s.imei) = btrim(c.imei)
    order by s.data_subinv desc nulls last
    limit 1
  ) sub on true
  left join lateral (
    select rs.id
    from public.wms_reservas_saida rs
    where rs.alocacao_id = c.alocacao_id
      and rs.status in ('reservado','analise','reconciliar')
    order by rs.reservado_em desc
    limit 1
  ) r on true
)
select
  c.alocacao_id,
  c.endereco_id,
  c.imei,
  c.voucher,
  c.sku,
  c.marca,
  c.modelo,
  c.grade,
  c.status_bateria,
  c.status_atual,
  c.data_subinv,
  c.local_subinv,
  c.aging_dias,
  public.wms_endereco_texto(c.rua,c.bloco,c.andar,c.coluna,c.linha) as local,
  c.rua,
  c.bloco,
  c.andar,
  c.coluna,
  c.linha
from enriquecidos c
where c.status_endereco = 'ocupado'
  and c.reserva_id is null
  and not exists(select 1 from public.meli_aparelhos_bloqueados b where b.imei=btrim(c.imei))
  and c.data_subinv is not null
  and upper(btrim(coalesce(c.local_subinv,''))) not in ('ALPHA','YUSEN','YUSSEN','PEND')

  and not exists (
    select 1
    from public.pedidos_b2c pb
    where pb.status in (
      'alocado','em_picking','embalado','faturado','aguardando_validacao_meli',
      'em_analise','aguardando_definicao_produto'
    )
      and (
        pb.wms_alocacao_id = c.alocacao_id
        or (
          pb.wms_alocacao_id is null
          and btrim(pb.imei_alocado) = btrim(c.imei)
          and (
            pb.alocado_em is null
            or c.confirmado_em is null
            or c.confirmado_em <= pb.alocado_em
          )
        )
      )
  )

  and not exists (
    select 1
    from public.b2b_itens bi
    join public.b2b_pedidos bp on bp.id = bi.pedido_id
    where btrim(bi.imei) = btrim(c.imei)
      and bi.status in ('pendente','nao_localizado','em_analise','bipado')
      and coalesce(bp.status,'') <> 'concluido'
      and (
        bi.status = 'pendente'
        or c.confirmado_em is null
        or (
          case
            when bi.status = 'bipado'
              then bi.bipado_em at time zone 'America/Sao_Paulo'
            when bi.status in ('nao_localizado','em_analise')
              then coalesce(
                bi.localizado_em,
                bi.nao_localizado_em at time zone 'America/Sao_Paulo',
                bi.bipado_em at time zone 'America/Sao_Paulo'
              )
            else null
          end
        ) is null
        or c.confirmado_em <= (
          case
            when bi.status = 'bipado'
              then bi.bipado_em at time zone 'America/Sao_Paulo'
            when bi.status in ('nao_localizado','em_analise')
              then coalesce(
                bi.localizado_em,
                bi.nao_localizado_em at time zone 'America/Sao_Paulo',
                bi.bipado_em at time zone 'America/Sao_Paulo'
              )
            else null
          end
        )
      )
  )

  and not exists (
    select 1
    from public.trocas_b2c_assurant_operacao op
    where btrim(op.imei) = btrim(c.imei)
      and op.status_furbtech = 'alocado'
  )
order by c.data_subinv, c.imei;
$function$
;

CREATE OR REPLACE FUNCTION public.wms_reservar_saida(p_imei text, p_canal text, p_referencia text, p_usuario uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_imei text := trim(p_imei);
  v_canal text := upper(trim(p_canal));
  v_alocacao public.wms_alocacoes%rowtype;
  v_endereco public.wms_enderecos%rowtype;
  v_reserva public.wms_reservas_saida%rowtype;
  v_reserva_ref public.wms_reservas_saida%rowtype;
  v_status_alocacao_antiga text;
begin
  if exists(select 1 from public.meli_aparelhos_bloqueados b where b.imei=v_imei) then return jsonb_build_object('ok',false,'erro','Aparelho reprovado nos testes MELI; bloqueado para venda até tratativa.'); end if;
  if v_imei is null or v_imei = '' then
    return jsonb_build_object('ok', false, 'erro', 'IMEI vazio.');
  end if;

  if v_canal not in ('B2C', 'B2B', 'TROCA', 'VENDA_FUNCIONARIO') then
    return jsonb_build_object('ok', false, 'erro', 'Canal de saída inválido.');
  end if;

  select a.* into v_alocacao
  from public.wms_alocacoes a
  join public.wms_enderecos e on e.id = a.endereco_id
  where trim(a.imei) = v_imei
    and a.status = 'confirmado'
    and e.ativo = true
    and (
      e.status = 'ocupado'
      or (
        e.status = 'bloqueado'
        and exists (
          select 1
          from public.wms_reservas_saida rr
          where rr.alocacao_id = a.id
            and rr.status in ('reservado', 'analise', 'reconciliar')
            and rr.canal = v_canal
            and rr.referencia_id = p_referencia
        )
      )
    )
  order by coalesce(a.confirmado_em, a.reservado_em) desc nulls last, a.id desc
  limit 1
  for update of a;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'erro', 'IMEI não possui posição ocupada e confirmada no novo WMS.'
    );
  end if;

  select * into v_endereco
  from public.wms_enderecos
  where id = v_alocacao.endereco_id
  for update;

  select * into v_reserva
  from public.wms_reservas_saida
  where alocacao_id = v_alocacao.id
    and status in ('reservado', 'analise', 'reconciliar')
  order by reservado_em desc
  limit 1;

  if found then
    if v_reserva.canal = v_canal
       and v_reserva.referencia_id = p_referencia then

      if v_reserva.status in ('analise', 'reconciliar') then
        update public.wms_reservas_saida
        set status = 'reservado',
            motivo = null,
            atualizado_em = now()
        where id = v_reserva.id;

        update public.wms_enderecos
        set status = 'ocupado',
            atualizado_em = now()
        where id = v_reserva.endereco_id
          and status = 'bloqueado';
      end if;

      return jsonb_build_object(
        'ok', true,
        'ja_reservado', true,
        'reserva_id', v_reserva.id,
        'alocacao_id', v_reserva.alocacao_id,
        'endereco_id', v_reserva.endereco_id,
        'local', public.wms_endereco_texto(
          v_endereco.rua, v_endereco.bloco, v_endereco.andar,
          v_endereco.coluna, v_endereco.linha
        )
      );
    end if;

    return jsonb_build_object(
      'ok', false,
      'erro', 'Esta posição física do IMEI já está reservada por outro fluxo.',
      'canal', v_reserva.canal,
      'referencia', v_reserva.referencia_id
    );
  end if;

  select * into v_reserva_ref
  from public.wms_reservas_saida
  where canal = v_canal
    and referencia_id = p_referencia
    and status in ('reservado', 'analise', 'reconciliar')
  order by reservado_em desc
  limit 1;

  if found and v_reserva_ref.alocacao_id is distinct from v_alocacao.id then
    select status into v_status_alocacao_antiga
    from public.wms_alocacoes
    where id = v_reserva_ref.alocacao_id;

    if coalesce(v_status_alocacao_antiga, '') <> 'confirmado' then
      update public.wms_reservas_saida
      set status = 'cancelado',
          motivo = coalesce(motivo, 'Reserva antiga encerrada após nova entrada física do IMEI'),
          finalizado_em = now(),
          finalizado_por = p_usuario,
          atualizado_em = now()
      where id = v_reserva_ref.id;
    else
      return jsonb_build_object(
        'ok', false,
        'erro', 'O pedido já possui outra reserva WMS ativa. Revise antes de substituir.',
        'reserva_id', v_reserva_ref.id,
        'alocacao_id', v_reserva_ref.alocacao_id
      );
    end if;
  end if;

  begin
    insert into public.wms_reservas_saida (
      imei, alocacao_id, endereco_id, canal, referencia_id,
      status, reservado_por
    ) values (
      v_imei, v_alocacao.id, v_alocacao.endereco_id, v_canal,
      p_referencia, 'reservado', p_usuario
    )
    returning * into v_reserva;
  exception when unique_violation then
    return jsonb_build_object(
      'ok', false,
      'erro', 'A posição física do aparelho acabou de ser reservada por outro pedido.'
    );
  end;

  return jsonb_build_object(
    'ok', true,
    'reserva_id', v_reserva.id,
    'alocacao_id', v_alocacao.id,
    'endereco_id', v_endereco.id,
    'local', public.wms_endereco_texto(
      v_endereco.rua, v_endereco.bloco, v_endereco.andar,
      v_endereco.coluna, v_endereco.linha
    )
  );
end;
$function$
;

-- Não permite contornar o bloqueio criando uma reserva diretamente.
create or replace function private.meli_guard_reserva()
returns trigger language plpgsql security definer set search_path=public
as $$ begin
 if new.status in ('reservado','retirado') and exists(select 1 from public.meli_aparelhos_bloqueados b where b.imei=btrim(new.imei)) then
  raise exception 'Aparelho reprovado nos testes MELI; bloqueado para venda até tratativa.';
 end if;
 return new;
end; $$;
revoke all on function private.meli_guard_reserva() from public,anon,authenticated;
create trigger aa00_meli_guard_reserva before insert or update on public.wms_reservas_saida for each row execute function private.meli_guard_reserva();

-- Itens já separados, ainda sem NF, entram na bancada sem retirar o aparelho novamente.
update public.pedidos_b2c set status='aguardando_validacao_meli',embalado_em=null,embalado_por=null,etapa_embalagem=null,emb_nf_colada=false,emb_selado=false,emb_etiquetado=false,atualizado_em=now()
where public.meli_marketplace(marketplace) and status='embalado' and faturado_em is null and nullif(btrim(numero_nf),'') is null and nullif(btrim(chave_nf),'') is null;
notify pgrst,'reload schema';

create or replace function private.meli_guard_permissao()
returns trigger language plpgsql security invoker set search_path=public
as $$ begin
 if (('/v2/assurant/b2c/validacao-meli'=any(coalesce(new.telas_permitidas,'{}'))) is distinct from
     ('/v2/assurant/b2c/validacao-meli'=any(coalesce(old.telas_permitidas,'{}'))))
 and auth.uid() is not null and auth.uid()<>'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid then
  raise exception 'Somente Gabriel pode alterar a liberação inicial da validação MELI.' using errcode='42501';
 end if;
 return new;
end; $$;
create trigger meli_guard_permissao before update on public.user_profiles for each row execute function private.meli_guard_permissao();
