-- Tampa Descolando prevalece sobre a classificação estética.
create or replace function liquida_private.triagem_defeito_exige_quebrado(p_defeitos text) returns boolean
language sql immutable set search_path=pg_catalog as $$
 select exists(select 1 from regexp_split_to_table(coalesce(p_defeitos,''),';') d
 where upper(regexp_replace(trim(d),'[[:space:]]+',' ','g'))='TAMPA DESCOLANDO');
$$;
revoke all on function liquida_private.triagem_defeito_exige_quebrado(text) from public,anon,authenticated;

create or replace function liquida_private.triagem_defeitos_grade_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public,liquida_private as $$
begin
 if new.origem_triagem in ('liquida','devolucao_b2c') and new.data_funcional is not null
 and liquida_private.triagem_defeito_exige_quebrado(new.defeitos_adicionais) then
  new.resultado_triagem_funcional:='BAD';
  if new.data_cosmetico is not null then
   new.grade:='QUEBRADO';
   new.rebaixado_bateria:=false;
  end if;
 end if;
 return new;
end;
$$;
revoke all on function liquida_private.triagem_defeitos_grade_guard() from public,anon,authenticated;
create trigger zz_triagem_defeitos_grade_guard before insert or update of defeitos_adicionais,resultado_triagem_funcional,grade,data_cosmetico,data_funcional,respostas_funcional
on public.assurant_triagem for each row execute function liquida_private.triagem_defeitos_grade_guard();

CREATE OR REPLACE FUNCTION public.assurant_cosmetica_salvar(p_voucher text, p_tela text, p_laterais text, p_traseira text, p_usuario uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare
  v_user uuid := auth.uid();
  v_voucher text := upper(trim(coalesce(p_voucher,'')));
  v_tela text := upper(trim(coalesce(p_tela,'')));
  v_laterais text := upper(trim(coalesce(p_laterais,'')));
  v_traseira text := upper(trim(coalesce(p_traseira,'')));
  v_t public.assurant_triagem%rowtype;
  v_grade_cosmetica text;
  v_grade_final text;
  v_rebaixado boolean := false;
  v_status_final text;
  v_now timestamp without time zone := timezone('UTC',now());
  v_hierarquia text[] := array['QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW'];
  v_bateria_baixa boolean;
begin
  if v_user is null or p_usuario is distinct from v_user then
    return jsonb_build_object('ok',false,'erro','Sessão inválida para concluir a triagem cosmética.');
  end if;

  if v_voucher='' then
    return jsonb_build_object('ok',false,'erro','Voucher obrigatório.');
  end if;

  if not (v_tela = any(v_hierarquia))
     or not (v_laterais = any(v_hierarquia))
     or not (v_traseira = any(v_hierarquia))
  then
    return jsonb_build_object('ok',false,'erro','Classificação cosmética inválida. Preencha tela, laterais e traseira.');
  end if;

  select *
    into v_t
  from public.assurant_triagem
  where upper(trim(voucher))=v_voucher
  order by coalesce(atualizado_em,criado_em) desc nulls last
  limit 1
  for update;

  if not found then
    return jsonb_build_object('ok',false,'erro',format('Voucher %s não encontrado na triagem.',v_voucher));
  end if;

  if v_t.status_atual in ('Aguardando armazenagem','Triagem de devolução concluída')
     and v_t.data_cosmetico is not null
     and upper(trim(coalesce(v_t.tela,'')))=v_tela
     and upper(trim(coalesce(v_t.laterais,'')))=v_laterais
     and upper(trim(coalesce(v_t.traseira,'')))=v_traseira
  then
    return jsonb_build_object(
      'ok',true,
      'idempotente',true,
      'voucher',v_t.voucher,
      'grade',v_t.grade,
      'gradeCosmetica',v_t.grade_cosmetica,
      'rebaixado',coalesce(v_t.rebaixado_bateria,false),
      'status',v_t.status_atual
    );
  end if;

  if v_t.status_atual is distinct from 'Aguardando triagem cosmética' then
    return jsonb_build_object(
      'ok',false,
      'erro',format(
        'Este aparelho não está aguardando triagem cosmética (status atual: %s).',
        coalesce(v_t.status_atual,'sem status')
      )
    );
  end if;

  select x.grade
    into v_grade_cosmetica
  from (
    values
      (v_tela,array_position(v_hierarquia,v_tela)),
      (v_laterais,array_position(v_hierarquia,v_laterais)),
      (v_traseira,array_position(v_hierarquia,v_traseira))
  ) as x(grade,pos)
  order by x.pos asc
  limit 1;

  v_bateria_baixa := trim(coalesce(v_t.status_bateria,''))='Saúde da bateria entre 70 e 79%';

  if upper(trim(coalesce(v_t.resultado_triagem_funcional,'')))='BAD'
     or liquida_private.triagem_defeito_exige_quebrado(v_t.defeitos_adicionais) then
    v_grade_final := 'QUEBRADO';
    v_rebaixado := false;
  elsif v_bateria_baixa then
    v_rebaixado := true;
    if v_grade_cosmetica in ('LIKE NEW','EXCELENTE','MUITO BOM','BOM') then
      v_grade_final := 'OUTLET';
    else
      v_grade_final := 'QUEBRADO';
    end if;
  else
    v_grade_final := v_grade_cosmetica;
    v_rebaixado := false;
  end if;

  update public.assurant_triagem
     set tela=v_tela,
         laterais=v_laterais,
         traseira=v_traseira,
         grade=v_grade_final,
         grade_cosmetica=v_grade_cosmetica,
         rebaixado_bateria=v_rebaixado,
         status_atual='Aguardando armazenagem',
         data_cosmetico=v_now,
         cosmetico_por=v_user,
         origem_triagem='liquida',
         atualizado_em=v_now
   where id=v_t.id
   returning status_atual
      into v_status_final;

  return jsonb_build_object(
    'ok',true,
    'voucher',v_t.voucher,
    'grade',v_grade_final,
    'gradeCosmetica',v_grade_cosmetica,
    'rebaixado',v_rebaixado,
    'status',v_status_final
  );
end;
$function$;
