-- Correção solicitada para YBV439949: preservar autores, respostas e datas originais.
do $repair$
declare t public.assurant_triagem%rowtype; novo jsonb;
begin
 select * into t from public.assurant_triagem where voucher='YBV439949' and imei='351742730132430' for update;
 if t.id is null then raise exception 'Voucher/IMEI não encontrado.'; end if;
 if t.grade='QUEBRADO' and t.resultado_triagem_funcional='BAD' then return; end if;
 if t.status_atual<>'Aguardando armazenagem' or t.data_alocacao is not null
 or exists(select 1 from public.wms_alocacoes w where w.imei=t.imei and w.status='confirmado')
 then raise exception 'Aparelho avançou no fluxo; revisar antes da correção.'; end if;
 if not liquida_private.triagem_defeito_exige_quebrado(t.defeitos_adicionais) then raise exception 'Defeito não corresponde ao informado.'; end if;
 update public.assurant_triagem set grade='QUEBRADO',resultado_triagem_funcional='BAD',rebaixado_bateria=false,atualizado_em=timezone('UTC',now()) where id=t.id;
 select jsonb_build_object('voucher',voucher,'grade',grade,'grade_cosmetica',grade_cosmetica,'resultado_triagem_funcional',resultado_triagem_funcional,'defeitos_adicionais',defeitos_adicionais)
 into novo from public.assurant_triagem where id=t.id;
 insert into public.assurant_rastreabilidade_ajustes(imei,campo,valor_anterior,valor_novo,motivo,criado_por)
 values(t.imei,'triagem_funcional.revisao',jsonb_build_object('voucher',t.voucher,'grade',t.grade,'grade_cosmetica',t.grade_cosmetica,'resultado_triagem_funcional',t.resultado_triagem_funcional,'defeitos_adicionais',t.defeitos_adicionais)::text,novo::text,
 'Correção solicitada por Gabriel: Tampa Descolando exige grade final QUEBRADO. Defeito adicional era ignorado com respostas positivas. Preservados responsáveis, datas e avaliação estética.',null);
end;
$repair$;
