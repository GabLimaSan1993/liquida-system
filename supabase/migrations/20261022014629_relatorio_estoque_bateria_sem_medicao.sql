-- O salvamento legado convertia ausência de medição em 0 na coluna numérica.
-- Mantém 0 somente quando ele foi explicitamente informado nas respostas.
-- Percentuais positivos são preservados; não estima valores a partir de faixas.
do $migration$
declare definicao text; trecho text := 't.aging,t.bateria_percentual,';
begin
 definicao := pg_get_functiondef('liquida_private.relatorio_estoque_consultar(date,date,text,text,text,text,text,integer,integer,boolean)'::regprocedure);
 if strpos(definicao,trecho)=0 then raise exception 'Consulta de estoque mudou; revisar antes de aplicar.';end if;
 definicao := replace(definicao,trecho,$sql$t.aging,
   case when t.bateria_percentual=0 and not coalesce(
    case when pg_input_is_valid(t.respostas_funcional,'jsonb')
     then (t.respostas_funcional::jsonb#>>'{bateria,percentual}') ~ '^0([.]0+)?$'
     else false end,false)
    then null else t.bateria_percentual end as bateria_percentual,$sql$);
 execute definicao;
end;
$migration$;
