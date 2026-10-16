-- BEGIN; + operations/20261016_retornos_fisicos_73_vouchers.sql + este arquivo.
select set_config('request.jwt.claim.sub',(select id::text from public.user_profiles where email='gabriellimadossantos1993@gmail.com'),true);
do $teste$
declare caso record;pagina jsonb;item jsonb;resposta jsonb;ator uuid:=auth.uid();offset_atual integer:=0;vistos integer:=0;pendentes integer:=0;reservados integer:=0;
begin
 if (select count(*) from liquida_private.armazenagem_retornos)<>73 then raise exception 'Lote incorreto';end if;
 if exists(select 1 from liquida_private.armazenagem_retornos r join public.assurant_triagem t on t.id=r.triagem_id where t.status_atual<>'Aguardando armazenagem') then raise exception 'Item fora da fila';end if;
 if (select count(*) from public.assurant_triagem_indicadores t join liquida_private.armazenagem_retornos r on r.triagem_id=t.id)<>73 then raise exception 'Retorno excluído dos indicadores';end if;
 if exists(select 1 from public.assurant_rastreabilidade_ajustes a join liquida_private.armazenagem_retornos r on r.imei=a.imei join public.assurant_triagem t on t.id=r.triagem_id where a.campo='armazenagem.retorno_operacional' and (
 (a.valor_anterior::jsonb #>> '{triagem,data_funcional}') is distinct from to_jsonb(t)->>'data_funcional' or
 (a.valor_anterior::jsonb #>> '{triagem,data_cosmetico}') is distinct from to_jsonb(t)->>'data_cosmetico' or
 (a.valor_anterior::jsonb #>> '{triagem,data_recebimento}') is distinct from to_jsonb(t)->>'data_recebimento' or
 (a.valor_anterior::jsonb #>> '{triagem,data_alocacao}') is distinct from to_jsonb(t)->>'data_alocacao')) then raise exception 'Histórico de triagem alterado';end if;
 if exists(select 1 from public.assurant_rastreabilidade_ajustes a cross join lateral jsonb_array_elements(a.valor_anterior::jsonb->'b2c') b join public.pedidos_b2c p on p.id=(b->>'id')::uuid where a.campo='armazenagem.retorno_operacional' and (
  b->>'status_anymarket' is distinct from to_jsonb(p)->>'status_anymarket' or b->>'numero_nf' is distinct from to_jsonb(p)->>'numero_nf' or b->>'chave_nf' is distinct from to_jsonb(p)->>'chave_nf' or b->>'faturado_em' is distinct from to_jsonb(p)->>'faturado_em' or b->>'bipado_em' is distinct from to_jsonb(p)->>'bipado_em' or b->>'embalado_em' is distinct from to_jsonb(p)->>'embalado_em')) then raise exception 'Histórico comercial alterado';end if;
 loop
  pagina:=public.assurant_armazenagem_fila(offset_atual,500);
  for item in select value from jsonb_array_elements(pagina) loop
   if item->>'referencia_retorno' is not null then
    vistos:=vistos+1;
    if (item->>'pendente_cadastro')::boolean then pendentes:=pendentes+1;end if;
   end if;
  end loop;
  exit when jsonb_array_length(pagina)<500;
  offset_atual:=offset_atual+500;
  if offset_atual>10000 then raise exception 'Fila sem término';end if;
 end loop;
 if vistos<>73 or pendentes<>1 then raise exception 'Fila incorreta: % itens, % pendências',vistos,pendentes;end if;
 for caso in select a.*,t.grade,t.grade_cosmetica from liquida_private.armazenagem_retornos a join public.assurant_triagem t on t.id=a.triagem_id order by a.voucher_solicitado loop
  resposta:=public.wms_preparar_status_armazenagem(caso.voucher_solicitado);
  if not coalesce((resposta->>'ok')::boolean,false) or resposta->>'voucher'<>caso.voucher_atual then raise exception 'Falha na resolução: % %',caso.voucher_solicitado,resposta;end if;
  if caso.voucher_atual='DEV3YBV397336' then continue;end if;
  resposta:=public.wms_reservar_endereco(caso.voucher_solicitado,ator);
  if not coalesce((resposta->>'ok')::boolean,false) then raise exception 'Falha na reserva: % %',caso.voucher_solicitado,resposta;end if;
  if resposta #>> '{reserva,voucher}'<>caso.voucher_atual then raise exception 'Reserva no ciclo antigo: %',caso.voucher_solicitado;end if;
  perform public.wms_cancelar_reserva((resposta #>> '{reserva,id}')::uuid,ator);
  reservados:=reservados+1;
 end loop;
 if reservados<>72 then raise exception 'Esperava 72 reservas, recebeu %',reservados;end if;
 -- Grade fictícia SOMENTE no teste desfeito, para validar o preenchimento na mesma fila.
 resposta:=public.assurant_caixas_completar_cadastro('RETORNO:DEV3YBV397336','357576781131519','DEV3YBV397336','BRZDEV12594','SAMSUNG GALAXY A55 5G 256GB LIGHT BLUE','REGULAR');
 if not (resposta->>'ok')::boolean then raise exception 'Complemento de grade falhou';end if;
 resposta:=public.wms_reservar_endereco('DEV1YBV397336',ator);
 if not coalesce((resposta->>'ok')::boolean,false) or resposta #>> '{reserva,voucher}'<>'DEV3YBV397336' then raise exception 'Reserva após complemento falhou: %',resposta;end if;
 perform public.wms_cancelar_reserva((resposta #>> '{reserva,id}')::uuid,ator);
 if has_function_privilege('anon','public.assurant_armazenagem_fila(integer,integer)','execute') or has_function_privilege('authenticated','liquida_private.armazenagem_retorno_completar(text,text,text,text,text,text)','execute') then raise exception 'Permissões indevidas';end if;
end $teste$;
select '73 na fila e nos indicadores; 72 reservas validadas; 1 grade pendente com complemento testado; ciclos atuais, notas e históricos preservados.' resultado;
rollback;
