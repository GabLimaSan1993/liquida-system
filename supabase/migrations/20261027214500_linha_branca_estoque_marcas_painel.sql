-- Gestão de Estoque Linha Branca: disponibilizar dados de classificação no painel
-- Reaproveita a RPC autorizada; não altera saldo ou movimentações.
do $migration$
declare
  atual text;
  anterior text := 'select id,pn,descricao,saldo,unidade,localizacao,ativo,tipo_item';
  novo text := 'select id,pn,descricao,saldo,unidade,localizacao,ativo,tipo_item,marca,categoria,pn_fabricante,compatibilidade';
begin
  select pg_get_functiondef('liquida_private.lb_estoque_central_operar(text,jsonb)'::regprocedure)
    into atual;
  if atual is null or position(anterior in atual)=0 then
    raise exception 'RPC de estoque mudou: revisão manual necessária';
  end if;
  execute replace(atual, anterior, novo);
end
$migration$;