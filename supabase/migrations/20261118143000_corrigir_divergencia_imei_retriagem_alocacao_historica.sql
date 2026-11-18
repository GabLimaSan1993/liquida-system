-- 2026-11-18 — Banco da triagem funcional / divergência de IMEI.
-- Não criar identidade nova nem alterar WMS ao registrar divergência em voucher que
-- voltou explicitamente à fila funcional com uma alocação histórica.
-- Apenas substitui a trava antiga, preservando a lógica original de confronto,
-- a autorização e as atualizações já limitadas a status_atual.

do $mig$
declare
  definicao text;
  original text := $old$ if t.id is not null and (t.data_alocacao is not null or exists(select 1 from public.wms_alocacoes w where w.imei=t.imei and w.status='confirmado')) then
  raise exception 'Aparelho já armazenado. Regularize o vínculo físico antes de segregar uma nova identificação.';
 end if;$old$;
  corrigido text := $new$ -- A divergência é uma pendência de conferência, não uma nova alocação/IMEI no WMS.
 -- Se o voucher está explicitamente na fila funcional (inclusive retriagem), sua
 -- alocação histórica não impede registrar a divergência. Não modificar IMEI,
 -- data_alocacao, posição nem registros WMS neste fluxo.
 if t.id is not null
    and coalesce(t.status_atual,'') <> 'Aguardando triagem funcional'
    and (t.data_alocacao is not null or exists(
       select 1 from public.wms_alocacoes w
       where w.voucher=v and w.status='confirmado'
    )) then
  raise exception 'Aparelho já armazenado fora da fila funcional. Regularize o vínculo físico antes de segregar uma nova identificação.';
 end if;$new$;
begin
  select pg_get_functiondef('public.assurant_triagem_identificar(text,text,text,text,text,boolean)'::regprocedure)
    into definicao;
  if definicao is null then raise exception 'RPC de identificação ausente'; end if;
  if strpos(definicao,corrigido)>0 then return; end if;
  if strpos(definicao, original)=0 then
    raise exception 'Trecho de proteção esperado não encontrado; migração interrompida sem alterações';
  end if;
  execute replace(definicao, original, corrigido);
end
$mig$;
