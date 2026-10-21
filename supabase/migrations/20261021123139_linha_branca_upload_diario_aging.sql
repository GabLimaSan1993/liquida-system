-- Upload diário: estágio por lotes, publicação atômica e histórico da origem.
alter table public.ordens_servico add column if not exists dados_aging jsonb;
alter table public.ordens_servico add column if not exists data_referencia_aging date;

create function public.linha_branca_upload_autorizado() returns boolean
language sql stable security invoker set search_path=public as $$
 select exists(select 1 from public.user_profiles p where p.id=(select auth.uid())
 and (p.is_master or '/v2/linha-branca/uploads'=any(p.telas_permitidas)));
$$;
revoke all on function public.linha_branca_upload_autorizado() from public,anon;
grant execute on function public.linha_branca_upload_autorizado() to authenticated;

create table public.linha_branca_importacoes (
 id uuid primary key default gen_random_uuid(),
 arquivo text not null,
 sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
 data_referencia date not null,
 total_arquivo integer not null check(total_arquivo>0),
 total_linha_branca integer not null check(total_linha_branca>0 and total_linha_branca<=total_arquivo),
 status text not null default 'recebendo' check(status in ('recebendo','concluido')),
 inseridas integer not null default 0,
 atualizadas integer not null default 0,
 preservadas integer not null default 0,
 criado_por uuid not null default auth.uid() references auth.users(id),
 operador text not null,
 created_at timestamptz not null default now(),
 concluido_em timestamptz,
 unique(sha256,data_referencia)
);
create index linha_branca_importacoes_usuario_idx on public.linha_branca_importacoes(criado_por);
create table public.linha_branca_importacao_itens (
 importacao_id uuid not null references public.linha_branca_importacoes(id),
 numero_os text not null check(numero_os ~ '^[0-9]+$'),
 dados jsonb not null check(jsonb_typeof(dados)='object'),
 primary key(importacao_id,numero_os)
);
alter table public.linha_branca_importacoes enable row level security;
alter table public.linha_branca_importacao_itens enable row level security;
create policy uploads_ler on public.linha_branca_importacoes for select to authenticated
 using(public.linha_branca_upload_autorizado());
create policy uploads_inserir on public.linha_branca_importacoes for insert to authenticated
 with check(public.linha_branca_upload_autorizado() and criado_por=(select auth.uid()));
create policy uploads_atualizar on public.linha_branca_importacoes for update to authenticated
 using(public.linha_branca_upload_autorizado()) with check(public.linha_branca_upload_autorizado());
create policy upload_itens_ler on public.linha_branca_importacao_itens for select to authenticated
 using(public.linha_branca_upload_autorizado());
create policy upload_itens_inserir on public.linha_branca_importacao_itens for insert to authenticated
 with check(public.linha_branca_upload_autorizado() and exists(select 1 from public.linha_branca_importacoes i where i.id=importacao_id and i.status='recebendo'));
grant select,insert,update on public.linha_branca_importacoes to authenticated;
grant select,insert on public.linha_branca_importacao_itens to authenticated;

create function public.linha_branca_upload_iniciar(p_arquivo text,p_sha256 text,p_data_referencia date,p_total_arquivo integer,p_total_linha_branca integer)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v public.linha_branca_importacoes;
begin
 if not public.linha_branca_upload_autorizado() then raise exception 'Sem permissão para importar Linha Branca.'; end if;
 if p_data_referencia> (now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data de referência não pode ser futura.'; end if;
 insert into public.linha_branca_importacoes(arquivo,sha256,data_referencia,total_arquivo,total_linha_branca,operador)
 select p_arquivo,p_sha256,p_data_referencia,p_total_arquivo,p_total_linha_branca,p.nome from public.user_profiles p where p.id=auth.uid()
 on conflict(sha256,data_referencia) do nothing;
 select * into strict v from public.linha_branca_importacoes where sha256=p_sha256 and data_referencia=p_data_referencia;
 if v.total_linha_branca<>p_total_linha_branca or v.total_arquivo<>p_total_arquivo then raise exception 'O arquivo diverge da importação iniciada.'; end if;
 return to_jsonb(v);
end; $$;

create function public.linha_branca_upload_lote(p_importacao uuid,p_registros jsonb)
returns integer language plpgsql security invoker set search_path=public as $$
declare v_status text; v_total integer;
begin
 if not public.linha_branca_upload_autorizado() then raise exception 'Sem permissão para importar Linha Branca.'; end if;
 select status into strict v_status from public.linha_branca_importacoes where id=p_importacao for update;
 if v_status<>'recebendo' then raise exception 'Importação já concluída.'; end if;
 if jsonb_typeof(p_registros)<>'array' or jsonb_array_length(p_registros) not between 1 and 250 then raise exception 'Lote inválido: envie até 250 OSs.'; end if;
 if exists(select 1 from jsonb_array_elements(p_registros) r where
   r->>'numero_os' !~ '^[0-9]+$' or nullif(r->>'marca','') is null or nullif(r->>'categoria','') is null
   or r->>'dt_entrada' is null or r->>'status_atual' is null or r->>'etapa_atual' is null
   or upper(trim(r->'dados_origem'->>'categoria_produto')) is distinct from 'LINHA BRANCA'
   or (r->>'numero_os') is distinct from (r->'dados_origem'->>'num_OS')
 ) then raise exception 'Lote contém OS inválida ou fora da Linha Branca.'; end if;
 if exists(select 1 from jsonb_array_elements(p_registros) r join public.linha_branca_importacao_itens t
   on t.importacao_id=p_importacao and t.numero_os=r->>'numero_os' where t.dados is distinct from r)
 then raise exception 'OS repetida com dados divergentes.'; end if;
 insert into public.linha_branca_importacao_itens(importacao_id,numero_os,dados)
 select p_importacao,r->>'numero_os',r from jsonb_array_elements(p_registros) r on conflict do nothing;
 select count(*) into v_total from public.linha_branca_importacao_itens where importacao_id=p_importacao;
 return v_total;
end; $$;

create function public.linha_branca_upload_concluir(p_importacao uuid)
returns jsonb language plpgsql security invoker set search_path=public as $$
declare v public.linha_branca_importacoes; v_count integer; v_inseridas integer; v_atualizadas integer; v_preservadas integer;
begin
 if not public.linha_branca_upload_autorizado() then raise exception 'Sem permissão para importar Linha Branca.'; end if;
 -- Serializa publicações para que uma referência antiga nunca sobreponha a nova.
 perform pg_advisory_xact_lock(1837526134);
 select * into strict v from public.linha_branca_importacoes where id=p_importacao for update;
 if v.status='concluido' then return to_jsonb(v); end if;
 select count(*) into v_count from public.linha_branca_importacao_itens where importacao_id=p_importacao;
 if v_count<>v.total_linha_branca then raise exception 'Carga incompleta: % de % OSs recebidas.',v_count,v.total_linha_branca; end if;
 if exists(select 1 from public.linha_branca_importacao_itens t join public.ordens_servico o using(numero_os)
 where t.importacao_id=p_importacao and o.linha_produto<>'Linha Branca') then raise exception 'Existe OS cadastrada em outra linha de produto. Nenhuma alteração aplicada.'; end if;

 -- Atualiza a origem; o estado operacional, a identificação física e o trabalho técnico são preservados.
 update public.ordens_servico o set dados_aging=t.dados->'dados_origem',data_referencia_aging=v.data_referencia
 from public.linha_branca_importacao_itens t where t.importacao_id=p_importacao and t.numero_os=o.numero_os
 and (o.data_referencia_aging is null or o.data_referencia_aging<=v.data_referencia)
 and (o.dados_aging is distinct from t.dados->'dados_origem' or o.data_referencia_aging is distinct from v.data_referencia);
 get diagnostics v_atualizadas=row_count;

 insert into public.ordens_servico(numero_os,dt_entrada,linha_produto,categoria,marca,modelo,serial_number,imei,voltagem,fornecedor,lote,numero_nf,
 status_atual,etapa_atual,area_destino,origem,observacoes_logistica,dados_aging,data_referencia_aging,criado_por)
 select t.numero_os,(d->>'dt_entrada')::date,'Linha Branca',d->>'categoria',d->>'marca',d->>'modelo',d->>'serial_number',nullif(d->'dados_origem'->>'IMEI',''),d->>'voltagem',d->>'fornecedor',d->>'lote',d->>'numero_nf',
 d->>'status_atual',d->>'etapa_atual',d->>'area_destino','Aging diário '||to_char(v.data_referencia,'DD/MM/YYYY'),
 concat_ws(' | ','Importação Aging diário','Etapa origem: '||(d->'dados_origem'->>'ETAPA'),'Tipo original: '||(d->'dados_origem'->>'tipo_prod'),
 'Abertura original: '||(d->'dados_origem'->>'Dt_Abert'),'Produto: '||(d->'dados_origem'->>'descricaoProduto'),
 'Cor: '||(d->'dados_origem'->>'Cor'),'SKU ALS: '||(d->'dados_origem'->>'SKU'),
 'Part number: '||(d->'dados_origem'->>'PartNumberModelo'),'Observações origem: '||(d->'dados_origem'->>'OBSERVACOES')),
 d->'dados_origem',v.data_referencia,v.operador
 from public.linha_branca_importacao_itens t cross join lateral(select t.dados d) x
 where t.importacao_id=p_importacao on conflict(numero_os) do nothing;
 get diagnostics v_inseridas=row_count;
 v_preservadas:=v_count-v_inseridas-v_atualizadas;
 update public.linha_branca_importacoes set status='concluido',inseridas=v_inseridas,atualizadas=v_atualizadas,preservadas=v_preservadas,concluido_em=now()
 where id=p_importacao returning * into v;
 return to_jsonb(v);
end; $$;
revoke all on function public.linha_branca_upload_iniciar(text,text,date,integer,integer) from public,anon;
revoke all on function public.linha_branca_upload_lote(uuid,jsonb) from public,anon;
revoke all on function public.linha_branca_upload_concluir(uuid) from public,anon;
grant execute on function public.linha_branca_upload_iniciar(text,text,date,integer,integer) to authenticated;
grant execute on function public.linha_branca_upload_lote(uuid,jsonb) to authenticated;
grant execute on function public.linha_branca_upload_concluir(uuid) to authenticated;
notify pgrst,'reload schema';
