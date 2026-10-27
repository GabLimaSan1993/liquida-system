-- A etapa Aguardando CMP vem do Aging depois da triagem e deve permanecer na fila de reparo.
-- O gatilho mantém essa regra também para OS já existentes, cujo estado operacional era
-- preservado pelo importador diário.

create or replace function public.linha_branca_aplicar_etapa_cmp()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.linha_produto = 'Linha Branca'
     and upper(trim(coalesce(new.dados_aging ->> 'ETAPA', ''))) ~
       '^AGUARDANDO( CONFIRMAÇÃO DE MOVIMENTAÇÃO)? CMP(/HF)?$' then
    new.status_atual := 'Aguardando peça';
    new.etapa_atual := 'Reparo';

    if new.area_destino is null
       or new.area_destino in ('Recebido', 'Aguardando triagem', 'Em triagem') then
      new.area_destino := 'Reparo Mecânico';
    end if;

    if coalesce(cardinality(new.areas_reparo), 0) = 0 then
      new.areas_reparo := array['Reparo Mecânico']::text[];
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_linha_branca_aplicar_etapa_cmp on public.ordens_servico;
create trigger trg_linha_branca_aplicar_etapa_cmp
before insert or update of dados_aging, data_referencia_aging
on public.ordens_servico
for each row
execute function public.linha_branca_aplicar_etapa_cmp();

-- Corrige imediatamente a OS 542636 e todas as demais OS já carregadas nessa etapa.
update public.ordens_servico
set
  status_atual = 'Aguardando peça',
  etapa_atual = 'Reparo',
  area_destino = case
    when area_destino is null or area_destino in ('Recebido', 'Aguardando triagem', 'Em triagem')
      then 'Reparo Mecânico'
    else area_destino
  end,
  areas_reparo = case
    when coalesce(cardinality(areas_reparo), 0) = 0
      then array['Reparo Mecânico']::text[]
    else areas_reparo
  end,
  updated_at = now()
where linha_produto = 'Linha Branca'
  and upper(trim(coalesce(dados_aging ->> 'ETAPA', ''))) ~
    '^AGUARDANDO( CONFIRMAÇÃO DE MOVIMENTAÇÃO)? CMP(/HF)?$';
