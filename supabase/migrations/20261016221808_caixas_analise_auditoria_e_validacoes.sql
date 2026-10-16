-- Preserva os campos de auditoria anteriores e acrescenta os eventos deste lote.
alter table public.assurant_rastreabilidade_ajustes drop constraint assurant_rastreabilidade_ajustes_campo_chk;
alter table public.assurant_rastreabilidade_ajustes add constraint assurant_rastreabilidade_ajustes_campo_chk check (campo=any(array['cor','sku','imei','modelo','triagem_funcional.revisao','triagem_cosmetica.recuperacao_importacao','carga_inicial.caixas.liberacao','carga_inicial.caixas.divergencia','carga_inicial.caixas.cadastro']));
