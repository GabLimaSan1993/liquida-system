-- Acrescenta ao payload do relatório o percentual medido na triagem.
-- Mantém filtros, autorizações, paginação e campos anteriores da API.
do $migration$
declare definicao text; trecho text := 't.respostas_funcional,t.status_bateria,t.reanalise,t.aging,';
begin
 definicao := pg_get_functiondef('liquida_private.relatorio_estoque_consultar(date,date,text,text,text,text,text,integer,integer,boolean)'::regprocedure);
 if strpos(definicao,trecho)=0 then raise exception 'Consulta de estoque mudou; revisar antes de aplicar.';end if;
 definicao := replace(definicao,trecho,trecho||'t.bateria_percentual,');
 execute definicao;
end;
$migration$;
