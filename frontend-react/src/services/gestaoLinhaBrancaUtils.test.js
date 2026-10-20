import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparProdutosBranca,limitesPeriodo,montarEventosBranca,resumirGestaoBranca } from './gestaoLinhaBrancaUtils.js';
const os=(id,extra={})=>({id,numero_os:String(id),marca:'LG',modelo:'CV12',categoria:'Lavadora',fornecedor:'Distribuidor Azul',dt_entrada:'2026-10-19',criado_por:'Importação CSV',created_at:'2026-10-20T14:00:00Z',status_atual:'Aguardando triagem',...extra});
const base=extra=>({os:[os(1)],triagens:[],triagensLegado:[],execucoes:[],ciclos:[],historico:[],eventos:[],consumos:[],...extra});
const filtro={inicio:'2026-10-20',fim:'2026-10-20',sla:'48',grupo:'dia'};
test('status importado não vira produção e fornecedor nunca é inferido pela marca',()=>{
 const b=base({historico:[{id:1,os_id:1,status_anterior:'Aguardando triagem',status_novo:'Finalizado',created_at:'2026-10-20T14:00:00Z'}],triagens:[{id:2,os_id:1,triado_por:'Carlos',created_at:'2026-10-20T15:00:00Z'}]});
 assert.equal(montarEventosBranca(b).length,1);const r=resumirGestaoBranca(b,filtro);
 assert.equal(agruparProdutosBranca(r,'fornecedor')[0].nome,'Distribuidor Azul');
 assert.equal(resumirGestaoBranca(b,{...filtro,fornecedor:'LG'}).eventos.length,0);
});
test('datas e produção horária usam Brasília inclusive na virada do dia',()=>{
 const b=base({triagens:[{id:1,os_id:1,triado_por:'Carlos',created_at:'2026-10-21T01:30:00Z'}]});
 const r=resumirGestaoBranca(b,filtro);assert.equal(r.eventos.length,1);assert.equal(r.horas[22].total,1);
 assert.equal(resumirGestaoBranca(b,{...filtro,inicio:'2026-10-21',fim:'2026-10-21'}).eventos.length,0);
});
test('duas lavagens concluem uma triagem, fontes sobrepostas não duplicam',()=>{
 const b=base({ciclos:[{id:1,os_id:1,etapa_teste:'triagem',numero_ciclo:1,resultado:'aprovado',concluido_em:'2026-10-20T14:00:00Z',iniciado_em:'2026-10-20T13:35:00Z',tempo_executado_segundos:1500},{id:2,os_id:1,etapa_teste:'triagem',numero_ciclo:2,resultado:'aprovado',concluido_em:'2026-10-20T14:26:00Z',iniciado_em:'2026-10-20T14:01:00Z',tempo_executado_segundos:1500}],triagens:[{id:8,os_id:1,triado_por:'Carlos',created_at:'2026-10-20T14:26:02Z'}]});
 const r=resumirGestaoBranca(b,filtro);assert.equal(r.eventos.length,1);assert.equal(r.eventos[0].minutos,50);
});
test('custo pendente não é custo zero e o custo é quantidade vezes valor',()=>{
 const b=base({consumos:[{id:1,os_id:1,quantidade:2,custo_unitario:15,utilizado_em:'2026-10-20T14:00:00Z',tecnico:'Carlos'},{id:2,os_id:1,quantidade:3,custo_unitario:null,utilizado_em:'2026-10-20T14:00:00Z',tecnico:'Carlos'}]});
 const r=resumirGestaoBranca(b,filtro);assert.equal(r.custo,30);assert.equal(r.semCusto,1);assert.equal(r.consumos[1].total,null);
});
test('SLA usa somente conclusões válidas e preserva meta não definida',()=>{
 const b=base({os:[os(1,{status_atual:'Concluído'})],eventos:[{id:1,os_id:1,etapa:'Qualidade',tecnico:'Ana',resultado:'aprovado',realizado_em:'2026-10-20T15:00:00Z'}]});
 const r=resumirGestaoBranca(b,filtro);assert.equal(r.concluidas.length,1);assert.equal(r.leadMedio,36);assert.equal(r.dentro,1);assert.equal(r.carteira.length,0);
 assert.equal(resumirGestaoBranca(b,{...filtro,sla:''}).dentro,null);
});
test('retrabalho é identificado mesmo quando primeira execução ficou fora do período',()=>{
 const b=base({triagens:[{id:1,os_id:1,triado_por:'Carlos',created_at:'2026-10-19T14:00:00Z'},{id:2,os_id:1,triado_por:'Carlos',created_at:'2026-10-20T14:00:00Z'}]});
 assert.equal(resumirGestaoBranca(b,filtro).eventos[0].retrabalho,true);
});
test('semana ISO e ano/mês respeitam limites e virada de ano',()=>{
 assert.deepEqual(limitesPeriodo({modo:'semana',semana:'2026-W01'}),{inicio:'2025-12-29',fim:'2026-01-04'});
 assert.deepEqual(limitesPeriodo({modo:'mes',mes:'2024-02'}),{inicio:'2024-02-01',fim:'2024-02-29'});
 assert.deepEqual(limitesPeriodo({modo:'ano',ano:'2026'}),{inicio:'2026-01-01',fim:'2026-12-31'});
});

test('reexecuções rápidas da mesma fonte continuam sendo retrabalho registrado',()=>{
 const b=base({triagens:[{id:1,os_id:1,triado_por:'Carlos',created_at:'2026-10-20T14:00:00Z'},{id:2,os_id:1,triado_por:'Carlos',created_at:'2026-10-20T14:01:00Z'}]});
 const r=resumirGestaoBranca(b,filtro);assert.equal(r.eventos.length,2);assert.equal(r.eventos[1].retrabalho,true);
});
test('decisão pós-reparo não duplica teste que terminou antes',()=>{
 const b=base({ciclos:[{id:1,os_id:1,etapa_teste:'pos_reparo',numero_ciclo:1,resultado:'aprovado',concluido_em:'2026-10-20T14:00:00Z',iniciado_em:'2026-10-20T13:35:00Z',tempo_executado_segundos:1500}],eventos:[{id:1,os_id:1,etapa:'Bancada de Testes',tecnico:'Carlos',resultado:'aprovado',realizado_em:'2026-10-20T15:00:00Z'}]});
 const r=resumirGestaoBranca(b,filtro);assert.equal(r.eventos.length,1);assert.equal(r.eventos[0].hora,'11');
});
