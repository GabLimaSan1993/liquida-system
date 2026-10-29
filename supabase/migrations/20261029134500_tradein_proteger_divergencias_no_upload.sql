-- Migração correta: preserve sincronização fora do upload e apenas desative atualização da triagem durante importação em massa.
CREATE OR REPLACE FUNCTION liquida_private.sem_ordem_auto()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
declare v text; cancelada boolean;
begin
 if tg_table_name='tradein_geral' then
   v:='YBV'||new.voucher::text;
   cancelada:=upper(trim(coalesce(new.canceled,''))) in ('SIM','S','TRUE','1','YES') or coalesce(new.status_atual,'') ilike '%cancel%';
 else
   v:=case when coalesce(new.voucher_key,'') ~ '^[0-9]+$' then 'YBV'||new.voucher_key else upper(trim(coalesce(new.voucher_original,''))) end;
   cancelada:=coalesce(new.cancelado,false) or coalesce(new.status_atual,'') ilike '%cancel%';
 end if;
 if cancelada or v is null then return new; end if;
 -- O upload de Trade-in é apenas informacional: não mexer na triagem física,
 -- especialmente em equipamentos segregados ou aguardando decisão Assurant.
 if nullif(current_setting('liquida.tradein_importacao',true),'') is not null then
   return new;
 end if;
 -- Fora do upload, preservar separação de aparelhos sob decisão da Assurant.
 if exists (
   select 1 from public.assurant_divergencias_imei d
   where d.voucher=v and d.status in ('pendente','devolver')
     and d.tipo_problema <> 'sem_ordem'
 ) then return new; end if;
 update public.assurant_triagem t set status_atual='Aguardando triagem funcional'
 from public.assurant_divergencias_imei d
 where d.triagem_id=t.id and d.voucher=v and d.tipo_problema='sem_ordem'
 and d.status='pendente' and t.status_atual not in ('Produto disponível','Concluído','Faturado');
 update public.assurant_divergencias_imei d set status='reconferencia',
   diretriz='Ordem identificada em nova planilha. Retorno automático à funcional.', decidido_em=now()
 where d.voucher=v and d.tipo_problema='sem_ordem' and d.status='pendente'
 and exists(select 1 from public.assurant_triagem t where t.id=d.triagem_id and t.status_atual='Aguardando triagem funcional');
 return new;
end $function$
;
