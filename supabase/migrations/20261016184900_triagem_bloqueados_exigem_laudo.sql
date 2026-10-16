create function liquida_private.triagem_bloqueio_exige_laudo(p_respostas text,p_bloqueado boolean,p_defeitos text) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare j jsonb; b boolean;
begin
 begin j:=coalesce(p_respostas,'{}')::jsonb; exception when others then j:='{}'; end;
 begin b:=(j->'identificacao'->>'aparelho_bloqueado')::boolean; exception when others then b:=null; end;
 return coalesce(b,p_bloqueado,false) or lower(coalesce(p_defeitos,'')) ~ '(^|;)[[:space:]]*(bloquead[oa]|bloqueio)([[:space:]]|;|$)';
end;
$$;
revoke all on function liquida_private.triagem_bloqueio_exige_laudo(text,boolean,text) from public,anon,authenticated;

create or replace function liquida_private.triagem_defeitos_grade_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
declare negativa boolean; concluiu boolean; bloqueado boolean; laudo_pendente boolean;
begin
 if new.origem_triagem not in ('liquida','devolucao_b2c') or new.data_funcional is null then return new; end if;
 negativa:=liquida_private.triagem_funcional_tem_negativa(new.respostas_funcional);
 bloqueado:=liquida_private.triagem_bloqueio_exige_laudo(new.respostas_funcional,new.aparelho_bloqueado,new.defeitos_adicionais);
 if liquida_private.triagem_defeito_exige_quebrado(new.defeitos_adicionais) then
  new.resultado_triagem_funcional:='BAD';
  new.grade:='QUEBRADO';
  new.rebaixado_bateria:=false;
 elsif negativa or bloqueado then
  new.resultado_triagem_funcional:='BAD';
 end if;
 if tg_op='INSERT' then concluiu:=true;
 else concluiu:=new.data_funcional is distinct from old.data_funcional or new.respostas_funcional is distinct from old.respostas_funcional; end if;
 laudo_pendente:=new.data_laudo is null or new.data_laudo<new.data_funcional;
 if ((negativa or bloqueado) and concluiu) or (bloqueado and laudo_pendente and new.status_atual ilike '%cosm%') then
  if new.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=new.imei and w.status='confirmado') then
   raise exception 'Bloqueio ou resposta negativa exige laudo. Regularize o vínculo de armazenagem antes de prosseguir.';
  end if;
  new.status_atual:='Aguardando laudo';
 end if;
 return new;
end;
$$;
revoke all on function liquida_private.triagem_defeitos_grade_guard() from public,anon,authenticated;
drop trigger zz_triagem_defeitos_grade_guard on public.assurant_triagem;
create trigger zz_triagem_defeitos_grade_guard before insert or update of
 defeitos_adicionais,resultado_triagem_funcional,grade,data_cosmetico,data_funcional,respostas_funcional,status_atual,aparelho_bloqueado
 on public.assurant_triagem for each row execute function liquida_private.triagem_defeitos_grade_guard();
