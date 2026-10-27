-- Laboratório de triagem TR. Nenhuma alteração no fluxo BM ou em outros usuários.
create table if not exists liquida_private.triagem_unificada_tr_testes (
 id uuid primary key default gen_random_uuid(),
 voucher text not null unique,
 triagem_id uuid not null references public.assurant_triagem(id),
 imei text,
 decisao text not null check (decisao in ('laudo','armazenagem')),
 foto_frontal_path text,
 foto_traseira_path text,
 camera_frontal_funciona boolean,
 camera_traseira_funciona boolean,
 defeitos text[] not null default '{}',
 grade_final text,
 antes jsonb not null,
 depois jsonb not null,
 criado_por uuid not null references public.user_profiles(id),
 criado_em timestamptz not null default now()
);
alter table liquida_private.triagem_unificada_tr_testes enable row level security;
revoke all on liquida_private.triagem_unificada_tr_testes from public,anon,authenticated;
insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('triagem-tr-teste','triagem-tr-teste',false,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "TR teste upload owner" on storage.objects;
drop policy if exists "TR teste read owner" on storage.objects;
create policy "TR teste upload owner" on storage.objects for insert to authenticated
with check (bucket_id='triagem-tr-teste' and auth.uid()='b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid
and (storage.foldername(name))[1]=auth.uid()::text);
create policy "TR teste read owner" on storage.objects for select to authenticated
using (bucket_id='triagem-tr-teste' and auth.uid()='b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid
and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function liquida_private.triagem_unificada_tr_operar(p_dados jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public set statement_timeout='25s'
as $tr$
declare
 v_usuario uuid:=auth.uid();
 v_voucher text:=upper(btrim(p_dados->>'voucher'));
 v_imei text:=btrim(p_dados->>'imei');
 v_condicao text:=p_dados->>'condicao';
 v_t public.assurant_triagem%rowtype;
 v_tradein record;
 v_numero text;
 v_front text:=p_dados->>'foto_frontal_path';
 v_back text:=p_dados->>'foto_traseira_path';
 v_cf boolean;
 v_ct boolean;
 v_def text[];
 v_hier text[]:=array['QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW'];
 v_tela text:=upper(btrim(p_dados->>'tela'));
 v_laterais text:=upper(btrim(p_dados->>'laterais'));
 v_traseira text:=upper(btrim(p_dados->>'traseira'));
 v_cos text;
 v_grade text;
 v_bateria_baixa boolean;
 v_bad boolean;
 v_destino text;
 v_antes jsonb;
 v_depois jsonb;
 v_id uuid;
 v_tipos text[];
begin
 if v_usuario is distinct from 'b517d70a-56be-4b4f-8b9e-a03c769dd3c3'::uuid
 then raise exception 'A tela de testes está liberada somente para o administrador piloto' using errcode='42501'; end if;
 if v_voucher !~ '^YBV[0-9]+$' then
   raise exception 'No piloto, use um voucher YBV com compra TR identificada no TradeIn'; end if;
 v_numero:=substring(v_voucher from '[0-9]+$');
 select tg.condicao_sufixo,tg.condicao_aparelho,tg.imei
 into v_tradein from public.tradein_geral tg where tg.voucher=v_numero::bigint limit 1;
 if not found or (upper(coalesce(v_tradein.condicao_sufixo,''))<>'TR'
   and upper(coalesce(v_tradein.condicao_aparelho,'')) not in ('DEFEITUOSO','TRINCADO')) then
   raise exception 'Voucher não identificado como compra TR no TradeIn. Não é permitido substituir fluxo BM.'; end if;
 select * into v_t from public.assurant_triagem where voucher=v_voucher for update;
 if not found then raise exception 'Voucher não encontrado na triagem'; end if;
 if v_t.status_atual is distinct from 'Aguardando triagem funcional' or v_t.data_funcional is not null then
   raise exception 'Triagem não está na fila inicial; não é permitido sobrescrever histórico (status %)',v_t.status_atual; end if;
 if exists(select 1 from liquida_private.triagem_unificada_tr_testes where voucher=v_voucher) then
   raise exception 'Este voucher já foi concluído pelo piloto'; end if;
 if v_condicao not in ('normal','nao_liga','bloqueado') then raise exception 'Informe a condição inicial'; end if;
 if nullif(btrim(p_dados->>'modelo'),'') is null then raise exception 'Modelo físico obrigatório'; end if;
 if nullif(v_imei,'') is not null and v_imei !~ '^[0-9]{14,16}$' then raise exception 'IMEI inválido'; end if;
 if v_condicao<>'nao_liga' and v_imei is null then raise exception 'Informe o IMEI físico'; end if;
 if nullif(btrim(v_tradein.imei),'') is not null and v_imei is not null
   and btrim(v_tradein.imei)<>v_imei then raise exception 'IMEI difere do TradeIn. Encaminhe para divergências antes de concluir'; end if;
 if nullif(btrim(v_t.imei),'') is not null and v_imei is not null
   and btrim(v_t.imei)<>v_imei then raise exception 'IMEI difere do recebimento. Encaminhe para divergências'; end if;
 v_antes:=jsonb_build_object('status',v_t.status_atual,'imei',v_t.imei,'grade',v_t.grade,
    'modelo',v_t.modelo,'data_funcional',v_t.data_funcional);
 v_destino:=case when v_condicao in('nao_liga','bloqueado') then 'laudo' else 'armazenagem' end;
 if v_destino='armazenagem' then
   if not (v_tela=any(v_hier) and v_laterais=any(v_hier) and v_traseira=any(v_hier)) then
     raise exception 'Responda Tela, Laterais e Traseira conforme as opções da cosmética'; end if;
   if (p_dados->>'camera_frontal_funciona') not in ('true','false') or
      (p_dados->>'camera_traseira_funciona') not in ('true','false') then
     raise exception 'Teste o funcionamento das duas câmeras'; end if;
   v_cf:=(p_dados->>'camera_frontal_funciona')::boolean;
   v_ct:=(p_dados->>'camera_traseira_funciona')::boolean;
   if v_front is null or v_back is null
      or v_front !~ ('^'||v_usuario::text||'/[a-zA-Z0-9_-]+_frontal[.]((jpg)|(jpeg)|(png)|(webp))$')
      or v_back !~ ('^'||v_usuario::text||'/[a-zA-Z0-9_-]+_traseira[.]((jpg)|(jpeg)|(png)|(webp))$')
   then raise exception 'Fotos de câmera frontal e traseira são obrigatórias'; end if;
   if not exists(select 1 from storage.objects where bucket_id='triagem-tr-teste' and name=v_front) or
      not exists(select 1 from storage.objects where bucket_id='triagem-tr-teste' and name=v_back)
   then raise exception 'Fotos não encontradas no armazenamento privado'; end if;
   select array_agg(distinct d) into v_def from (
      select btrim(value) as d from jsonb_array_elements_text(coalesce(p_dados->'defeitos','[]'::jsonb))
   ) x where d<>'';
   v_def:=coalesce(v_def,'{}'::text[]);
   if cardinality(v_def)>30 then raise exception 'Lista de defeitos inválida'; end if;
   v_bad:=not v_cf or not v_ct or cardinality(v_def)>0;
   if not v_cf then v_def:=array_append(v_def,'Câmera frontal não funciona'); end if;
   if not v_ct then v_def:=array_append(v_def,'Câmera traseira não funciona'); end if;
   select z.grade into v_cos from (values
    (v_tela,array_position(v_hier,v_tela)),
    (v_laterais,array_position(v_hier,v_laterais)),
    (v_traseira,array_position(v_hier,v_traseira))
   ) z(grade,pos) order by pos limit 1;
   v_bateria_baixa:=btrim(coalesce(v_t.status_bateria,''))='Saúde da bateria entre 70 e 79%';
   v_grade:=case when v_bad then 'QUEBRADO'
      when v_bateria_baixa and v_cos in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM') then 'OUTLET'
      when v_bateria_baixa then 'QUEBRADO' else v_cos end;
 else
   v_def:=case when v_condicao='bloqueado' then array['Aparelho bloqueado']::text[]
      else array['Aparelho não liga']::text[] end;
 end if;
 update public.assurant_triagem set
   imei=coalesce(v_imei,imei),
   modelo=btrim(p_dados->>'modelo'),
   data_funcional=timezone('UTC',now()),
   funcional_por=v_usuario,
   origem_triagem='liquida',
   status_atual=case when v_destino='laudo' then 'Aguardando laudo' else 'Aguardando armazenagem' end,
   resultado_triagem_funcional=case when v_bad or v_destino='laudo' then 'BAD' else 'GOOD' end,
   defeitos_adicionais=array_to_string(v_def,'; '),
   respostas_funcional=jsonb_build_object('versao',4,'fluxo','TR_UNIFICADO_TESTE',
      'identificacao',jsonb_build_object('imei1',v_imei,'condicao',v_condicao),
      'cameras',jsonb_build_object('frontal_funciona',v_cf,'traseira_funciona',v_ct,
                                   'foto_frontal_path',v_front,'foto_traseira_path',v_back),
      'defeitos',to_jsonb(v_def),'destino',v_destino)::text,
   data_cosmetico=case when v_destino='armazenagem' then timezone('UTC',now()) else data_cosmetico end,
   cosmetico_por=case when v_destino='armazenagem' then v_usuario else cosmetico_por end,
   tela=case when v_destino='armazenagem' then v_tela else tela end,
   laterais=case when v_destino='armazenagem' then v_laterais else laterais end,
   traseira=case when v_destino='armazenagem' then v_traseira else traseira end,
   grade=case when v_destino='armazenagem' then v_grade else grade end,
   grade_cosmetica=case when v_destino='armazenagem' then v_cos else grade_cosmetica end,
   rebaixado_bateria=case when v_destino='armazenagem' then (not v_bad and v_bateria_baixa) else rebaixado_bateria end,
   atualizado_em=timezone('UTC',now())
 where id=v_t.id;
 v_depois:=jsonb_build_object('status',case when v_destino='laudo' then 'Aguardando laudo' else 'Aguardando armazenagem' end,
   'grade',v_grade,'grade_cosmetica',v_cos,'imei',coalesce(v_imei,v_t.imei),'destino',v_destino);
 insert into liquida_private.triagem_unificada_tr_testes
   (voucher,triagem_id,imei,decisao,foto_frontal_path,foto_traseira_path,
    camera_frontal_funciona,camera_traseira_funciona,defeitos,grade_final,antes,depois,criado_por)
 values (v_voucher,v_t.id,coalesce(v_imei,v_t.imei),v_destino,v_front,v_back,v_cf,v_ct,
         v_def,v_grade,v_antes,v_depois,v_usuario) returning id into v_id;
 return jsonb_build_object('ok',true,'id',v_id,'voucher',v_voucher,'status',v_depois->>'status',
     'grade',v_grade,'destino',v_destino);
end $tr$;
revoke all on function liquida_private.triagem_unificada_tr_operar(jsonb) from public,anon;
grant execute on function liquida_private.triagem_unificada_tr_operar(jsonb) to authenticated;
create or replace function public.assurant_triagem_unificada_tr_teste(p_dados jsonb)
returns jsonb language sql security invoker set search_path=pg_catalog
as $f$ select liquida_private.triagem_unificada_tr_operar(p_dados) $f$;
revoke all on function public.assurant_triagem_unificada_tr_teste(jsonb) from public,anon;
grant execute on function public.assurant_triagem_unificada_tr_teste(jsonb) to authenticated;
