-- Permite que a ação administrativa de Rastreabilidade desvincule
-- itens B2B de lotes encerrados sem faturamento, desde que o item
-- ainda não possua NF e o pedido não esteja concluído.
--
-- A exceção continua estrita: somente a transição para nao_faturar
-- com motivo desvinculado_rastreabilidade feita por usuário autorizado
-- pode alterar itens de lote encerrado sem faturamento.

create or replace function public.b2b_proteger_lote_encerrado_sem_faturamento()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  anterior uuid;
  novo uuid;
  p record;
begin
  if tg_op <> 'INSERT' then anterior := old.pedido_id; end if;
  if tg_op <> 'DELETE' then novo := new.pedido_id; end if;

  for p in
    select id, lote, encerrado_sem_faturamento_em
    from public.b2b_pedidos
    where id = anterior or id = novo
    order by id
    for share
  loop
    if p.encerrado_sem_faturamento_em is not null then
      if tg_op = 'UPDATE'
         and old.pedido_id = p.id
         and new.pedido_id = p.id
         and new.status = 'nao_faturar'
         and new.motivo_nao_faturar = 'desvinculado_rastreabilidade'
         and public.assurant_rastreabilidade_autorizado()
      then
        continue;
      end if;

      raise exception
        'Lote % concluído sem faturamento. Histórico somente leitura; operação não realizada.',
        p.lote;
    end if;
  end loop;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$function$;

do $patch$
declare
  v_oid oid;
  v_def text;
  v_original text;
begin
  select p.oid
    into v_oid
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'assurant_desvincular_item_pedidos'
    and pg_get_function_identity_arguments(p.oid) = 'p_imei text, p_motivo text';

  if v_oid is null then
    raise exception 'Função assurant_desvincular_item_pedidos(text,text) não encontrada';
  end if;

  v_def := pg_get_functiondef(v_oid);
  v_original := v_def;

  v_def := replace(
    v_def,
    E'    and bp.encerrado_sem_faturamento_em is null\n    and coalesce(bp.status, '''') <> ''concluido'';',
    E'    and coalesce(bp.status, '''') <> ''concluido'';'
  );

  -- Se já estiver corrigida, mantém a migration idempotente.
  if v_def <> v_original then
    execute v_def;
  end if;
end;
$patch$;
