-- A condição de compra decide o laudo; reprovações e defeitos continuam definindo BAD/QUEBRADO.
create or replace function liquida_private.triagem_condicao_compra(p_condicao text, p_sufixo text)
returns text language sql immutable security invoker set search_path=pg_catalog as $$
 select case
  when upper(btrim(coalesce(p_sufixo,''))) in ('BM','TR') then upper(btrim(p_sufixo))
  when lower(btrim(coalesce(p_condicao,''))) in ('bm','bom','bons') then 'BM'
  when lower(btrim(coalesce(p_condicao,''))) in ('tr','trincado','quebrado','quebrados','defeituoso','defeituosos') then 'TR'
  else null end;
$$;

create or replace function liquida_private.triagem_laudo_por_compra(p_condicao text,p_sufixo text,p_respostas text,p_bloqueado boolean,p_defeitos text)
returns boolean language plpgsql immutable security invoker set search_path=pg_catalog as $$
declare j jsonb; compra text; bloqueado boolean; critica boolean;
begin
 compra:=liquida_private.triagem_condicao_compra(p_condicao,p_sufixo);
 bloqueado:=liquida_private.triagem_bloqueio_exige_laudo(p_respostas,p_bloqueado,p_defeitos);
 if compra='BM' then return bloqueado or liquida_private.triagem_funcional_tem_negativa(p_respostas); end if;
 if compra is distinct from 'TR' then return false; end if;
 if bloqueado then return true; end if;
 begin j:=p_respostas::jsonb; exception when others then return false; end;
 if jsonb_typeof(j->'respostas') is distinct from 'array' then return false; end if;
 select exists(select 1 from jsonb_array_elements(j->'respostas') e
  where (e->>'divergente'='true' or lower(btrim(e->>'resposta')) in ('não','nao'))
   and (coalesce(e->>'pergunta_id',e->>'perguntaId') in (
    '96f0d85a-28fa-4043-af6d-c0d7d9a97a08','4bc389af-8dd8-454c-9e0f-78f368f33fcd',
    '3806e4c1-e0ec-4c81-829c-3cd07ec10381','f1e24699-a8c2-42b3-967a-d2d8199fca51',
    'bb2c5d8f-ef4e-4fc7-a2ad-7317340cb02f','f6fd68af-26e4-4180-b71e-a33bedf5828b',
    'bf6f8163-0528-4d72-b650-71f6e516a970','f7b0c886-c4b1-42d9-ae24-766be24ff585')
    or lower(coalesce(e->>'pergunta','')) ~ '\m(liga|ligando|desbloqueado)\M|sem senha|senha ou e.?mail')) into critica;
 return critica;
end;
$$;

revoke all on function liquida_private.triagem_condicao_compra(text,text) from public,anon,authenticated;
revoke all on function liquida_private.triagem_laudo_por_compra(text,text,text,boolean,text) from public,anon,authenticated;

create or replace function liquida_private.triagem_defeitos_grade_guard()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare negativa boolean; concluiu boolean; bloqueado boolean; laudo_pendente boolean; j jsonb;
 compra text; condicao text; sufixo text; exige_laudo boolean; contrato text; motivo text;
begin
 if new.data_funcional is null then return new; end if;
 begin j:=new.respostas_funcional::jsonb; exception when others then j:='{}'::jsonb; end;
 if new.origem_triagem not in ('liquida','devolucao_b2c') and not coalesce((j->'identificacao'->>'danos_tela')::boolean,false) then return new; end if;
 if new.origem_triagem='gaia' and coalesce((j->'identificacao'->>'danos_tela')::boolean,false) then new.origem_triagem:='liquida'; end if;
 if coalesce((j->'identificacao'->>'danos_tela')::boolean,false) and lower(coalesce(new.defeitos_adicionais,'')) !~ '(^|;)[[:space:]]*danos da tela([[:space:]]*;|[[:space:]]*$)' then
  new.defeitos_adicionais:=concat_ws('; ',nullif(trim(new.defeitos_adicionais),''),'Danos da tela');
 end if;
 negativa:=liquida_private.triagem_funcional_tem_negativa(new.respostas_funcional);
 bloqueado:=liquida_private.triagem_bloqueio_exige_laudo(new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);
 if liquida_private.triagem_defeito_exige_quebrado(new.defeitos_adicionais) then
  new.resultado_triagem_funcional:='BAD'; new.grade:='QUEBRADO'; new.rebaixado_bateria:=false;
 elsif negativa or bloqueado then new.resultado_triagem_funcional:='BAD'; end if;
 if tg_op='INSERT' then concluiu:=true;
 else concluiu:=new.data_funcional is distinct from old.data_funcional or new.respostas_funcional is distinct from old.respostas_funcional; end if;
 laudo_pendente:=new.data_laudo is null or new.data_laudo<new.data_funcional;

 -- Nunca usa a grade obtida na triagem como condição da compra.
 -- Só YBV pode consultar o contrato YBV; GRV/DEV com mesmos números não se misturam.
 if new.voucher ~ '^(YBV)+[0-9]+$' then
  contrato:='YBV'||regexp_replace(new.voucher,'^(YBV)+','');
  select g.condicao_aparelho,g.condicao_sufixo into condicao,sufixo
   from public.tradein_geral g where g.voucher_ybv=contrato;
  if nullif(btrim(condicao),'') is null and nullif(btrim(sufixo),'') is null then
   select h.condicao_aparelho,substring(upper(h.sku_original) from '(BM|TR)$') into condicao,sufixo
    from public.tradein_historico h where h.voucher_key=substring(contrato from 4);
  end if;
 end if;
 if nullif(btrim(condicao),'') is null and nullif(btrim(sufixo),'') is null then
  condicao:=coalesce(nullif(btrim(j#>>'{destino,condicao_declarada}'),''),new.condicao);
  sufixo:=nullif(btrim(j#>>'{destino,condicao_sufixo_declarado}'),'');
 end if;
 compra:=liquida_private.triagem_condicao_compra(condicao,sufixo);
 exige_laudo:=liquida_private.triagem_laudo_por_compra(condicao,sufixo,new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);

 if (concluiu and exige_laudo) or (exige_laudo and laudo_pendente and new.status_atual ilike '%cosm%') then
  if new.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=new.imei and w.status='confirmado') then
   raise exception 'A condição de compra e a negativa funcional exigem laudo. Regularize o vínculo de armazenagem antes de prosseguir.';
  end if;
  if new.status_atual is distinct from 'Finalizado' then new.status_atual:='Aguardando laudo'; end if;
 elsif concluiu and not exige_laudo and new.status_atual='Aguardando laudo' then
  new.status_atual:='Aguardando triagem cosmética';
 end if;
 if concluiu and jsonb_typeof(j)='object' then
  motivo:=case when exige_laudo and compra='BM' then 'Compra BM com negativa na triagem funcional'
   when exige_laudo and compra='TR' then 'Compra TR/Defeituoso com negativa em ligar ou desbloqueio'
   when compra='TR' then 'Compra TR/Defeituoso sem negativa em ligar ou desbloqueio'
   when compra='BM' then 'Compra BM sem negativa na funcional'
   else 'Condição de compra sem regra de laudo' end;
  j:=jsonb_set(j,'{destino}',coalesce(j->'destino','{}'::jsonb)||jsonb_build_object('laudo',exige_laudo,'motivo',motivo,'condicao_declarada',condicao,'condicao_sufixo_declarado',compra));
  new.respostas_funcional:=j::text;
 end if;
 return new;
end;
$$;
