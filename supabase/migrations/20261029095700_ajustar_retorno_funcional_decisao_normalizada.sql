CREATE OR REPLACE FUNCTION public.assurant_divergencias_decidir(p_caso uuid, p_decisao text, p_diretriz text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'liquida_private'
AS $function$
declare
 c public.assurant_divergencias_imei%rowtype;
 t public.assurant_triagem%rowtype;
 v_voucher text;
 destino text;
 v_justificativa text := btrim(coalesce(p_diretriz,''));
 v_decisao text := lower(btrim(coalesce(p_decisao,'')));
begin
 if not public.assurant_divergencias_pode_decidir() then
   raise exception 'Acesso restrito à decisão Assurant.' using errcode='42501';
 end if;
 if v_decisao in ('retriagem','retornar','retornar_funcional','retorno_funcional','retornar_para_triagem','retorno_triagem') then v_decisao:='reconferencia'; end if;
 if v_decisao not in ('autorizado','devolver','reconferencia') then
   raise exception 'Decisão inválida para divergência: %. Selecione Retornar para Triagem Funcional.',coalesce(nullif(p_decisao,''),'(vazio)');
 end if;
 if length(v_justificativa)<5 then
   raise exception 'Informe uma justificativa com pelo menos 5 caracteres.';
 end if;
 select voucher into v_voucher from public.assurant_divergencias_imei where id=p_caso;
 if v_voucher is null then raise exception 'Caso não localizado.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(v_voucher,0));
 select * into c from public.assurant_divergencias_imei where id=p_caso for update;

 if c.status='pendente' then
   null;
 elsif c.status='devolver' and v_decisao='reconferencia' then
   null;
 else
   raise exception 'Esta decisão não pode ser modificada nesse estado (%).',c.status;
 end if;

 select * into t from public.assurant_triagem where id=c.triagem_id for update;
 if t.id is null or t.voucher is distinct from c.voucher then
   raise exception 'Triagem original não localizada ou vinculada a outro voucher.';
 end if;
 if v_decisao='reconferencia' then
   if c.status='devolver' and t.status_atual is distinct from 'Segregado - devolução à origem' then
     raise exception 'O produto não está mais segregado; atualize a tela.';
   end if;
   if t.data_alocacao is not null or t.data_oracle is not null or
      t.oracle_confirmado_em is not null or t.data_cosmetico is not null or
      exists(select 1 from public.wms_alocacoes w where w.voucher=c.voucher and w.status='confirmado' and w.retirado_em is null) then
      raise exception 'Aparelho já avançou no fluxo; regularize a movimentação antes de retornar à funcional.';
   end if;
 end if;

 destino:=case
   when v_decisao='devolver' then 'Segregado - devolução à origem'
   when v_decisao='reconferencia' then 'Aguardando triagem funcional'
   when c.tipo_problema='nao_liga' then 'Aguardando laudo'
   else 'Aguardando triagem funcional'
 end;

 insert into liquida_private.triagem_divergencias_decisoes_log
 (caso_id,voucher,status_anterior,status_novo,diretriz_anterior,diretriz_nova,usuario_id,origem,decidido_anterior_por,decidido_anterior_em)
 values(c.id,c.voucher,c.status,v_decisao,c.diretriz,v_justificativa,auth.uid(),'decisao_assurant',c.decidido_por,c.decidido_em);

 update public.assurant_divergencias_imei
    set status=v_decisao,diretriz=v_justificativa,decidido_por=auth.uid(),decidido_em=now()
  where id=c.id;
 update public.assurant_triagem
    set status_atual=destino,
        atualizado_em=timezone('UTC',now()),
        reanalise=case when v_decisao='reconferencia' then 'Sim' else reanalise end,
        defeitos_adicionais=case when c.tipo_problema='nao_liga' and v_decisao='autorizado'
           then concat_ws('; ',nullif(defeitos_adicionais,''),'Aparelho Não Liga') else defeitos_adicionais end,
        resultado_triagem_funcional=case when c.tipo_problema='nao_liga' and v_decisao='autorizado' then 'BAD' else resultado_triagem_funcional end,
        grade=case when c.tipo_problema='nao_liga' and v_decisao='autorizado' then 'QUEBRADO' else grade end
  where id=t.id;
 if not found then raise exception 'Falha ao atualizar a fila da funcional.'; end if;

 return jsonb_build_object('ok',true,'voucher',c.voucher,'status',destino,
    'reencaminhado',v_decisao='reconferencia');
end $function$
;
