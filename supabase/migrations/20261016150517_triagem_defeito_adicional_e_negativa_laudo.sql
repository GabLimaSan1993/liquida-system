-- Regras finais da funcional: qualquer defeito adicional é Quebrado; negativa exige laudo.
create or replace function liquida_private.triagem_defeito_exige_quebrado(p_defeitos text) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select exists(select 1 from regexp_split_to_table(coalesce(p_defeitos,''),';') d where trim(d)<>'');
$$;
revoke all on function liquida_private.triagem_defeito_exige_quebrado(text) from public,anon,authenticated;

create or replace function liquida_private.triagem_funcional_tem_negativa(p_respostas text) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare j jsonb;
begin
 begin j:=p_respostas::jsonb; exception when others then return false; end;
 if jsonb_typeof(j->'respostas') is distinct from 'array' then return false; end if;
 return exists(select 1 from jsonb_array_elements(j->'respostas') e
 where e->>'divergente'='true' or lower(trim(e->>'resposta')) in ('não','nao'));
end;
$$;
revoke all on function liquida_private.triagem_funcional_tem_negativa(text) from public,anon,authenticated;

create or replace function liquida_private.triagem_defeitos_grade_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare negativa boolean; concluiu boolean;
begin
 if new.origem_triagem not in ('liquida','devolucao_b2c') or new.data_funcional is null then return new; end if;
 negativa:=liquida_private.triagem_funcional_tem_negativa(new.respostas_funcional);
 if liquida_private.triagem_defeito_exige_quebrado(new.defeitos_adicionais) then
  new.resultado_triagem_funcional:='BAD';
  new.grade:='QUEBRADO';
  new.rebaixado_bateria:=false;
 elsif negativa then
  new.resultado_triagem_funcional:='BAD';
 end if;
 if tg_op='INSERT' then concluiu:=true;
 else concluiu:=new.data_funcional is distinct from old.data_funcional or new.respostas_funcional is distinct from old.respostas_funcional; end if;
 if negativa and concluiu then
  if new.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=new.imei and w.status='confirmado') then
   raise exception 'Resposta negativa exige laudo. Regularize o vínculo de armazenagem antes de concluir a retriagem.';
  end if;
  new.status_atual:='Aguardando laudo';
 end if;
 return new;
end;
$$;
revoke all on function liquida_private.triagem_defeitos_grade_guard() from public,anon,authenticated;

