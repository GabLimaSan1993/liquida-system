import test from 'node:test';
import assert from 'node:assert/strict';
import { agruparProdutosBranca,limitesPeriodo,montarEventosBranca,resumirGestaoBranca,resumirPainelBranca } from './gestaoLinhaBrancaUtils.js';
const os=(id,extra={})=>({id,numero_os:String(id),marca:'LG',modelo:'CV12',categoria:'Lavadora',fornecedor:'Distribuidor Azul',dt_entrada:'2026-10-19',criado_por:'Importação CSV',created_at:'2026-10-20T14:00:00Z',status_atual:'Aguardando triagem',...extra});
const base=extra=>({os:[os(1)],triagens:[],triagensLegado:[],execucoes:[],ciclos:[],historico:[],eventos:[],consumos:[],...extra});
const filtro={inicio:'2026-10-20',fim:'2026-10-20',sla:'48',grupo:'dia'};
test('status importado não vira produção e fornecedor nunca é inferido pela marca',()=>{
 const b=base({historico:[{id:1,os_id:1,status_anterior:'Aguardando triagem',status_novo:'Finalizado',created_at:'2026-10-20T14:00:00Z'}],triagens:[{id:2,os_id:1,triado_por:'Carlos',created_at:'2026-10-20T15:00:00Z'}]});
 assert.equal(montarEventosBranca(b).filter(e=>e.etapa!=='Recebimento').length,1);const r=resumirGestaoBranca(b,filtro);
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

test('recebimento importado acompanha a abertura original da OS, inclusive nos filtros e SLA',()=>{
 const b=base({os:[os(1,{dt_entrada:'2026-10-05',created_at:'2026-10-16T19:04:43Z'})]});
 const recebimento=montarEventosBranca(b).find(e=>e.etapa==='Recebimento');
 assert.equal(recebimento.dia,'2026-10-05');
 assert.equal(recebimento.hora,null);
 assert.equal(recebimento.tecnico,'Sem técnico identificado');
 const r=resumirGestaoBranca(b,{...filtro,inicio:'2026-10-05',fim:'2026-10-05'});
 assert.equal(r.eventos.length,1);assert.equal(r.semHorario,1);
 assert.equal(r.horas.reduce((s,h)=>s+h.total,0),0);
 assert.equal(resumirGestaoBranca(b,{...filtro,inicio:'2026-10-16',fim:'2026-10-16'}).eventos.length,0);
 assert.equal(r.carteira[0].aging_horas>0,true);
});
test('recebimento operacional preserva o horário conhecido e uma única entrada por OS',()=>{
 const b=base({os:[os(1,{criado_por:'Carlos',dt_entrada:'2026-10-20',created_at:'2026-10-20T14:30:00Z'})]});
 const r=resumirGestaoBranca(b,filtro);
 assert.equal(r.eventos.length,1);assert.equal(r.eventos[0].dia,'2026-10-20');
 assert.equal(r.eventos[0].hora,'11');assert.equal(r.horas[11].total,1);
});
test('OS importada sem dia original não assume a data de importação como recebimento',()=>{
 const b=base({os:[os(1,{dt_entrada:null})]});
 assert.equal(montarEventosBranca(b).length,0);
});

test('destino da triagem usa equipamentos únicos e inclui reparo mesmo após nova triagem',()=>{
 const b=base({os:[os(1),os(2),os(3),os(4)],triagens:[
  {id:1,os_id:1,triado_por:'Carlos',precisa_reparo:true,created_at:'2026-10-20T14:00:00Z'},
  {id:2,os_id:1,triado_por:'Carlos',precisa_reparo:false,created_at:'2026-10-20T16:00:00Z'},
  {id:3,os_id:2,triado_por:'Ana',precisa_reparo:false,created_at:'2026-10-20T14:00:00Z'},
  {id:4,os_id:3,triado_por:'Ana',precisa_reparo:null,created_at:'2026-10-20T14:00:00Z'},
 ],execucoes:[{id:1,os_id:4,area_execucao:'Triagem Lavadoras',condenado:true,dt_fim:'2026-10-20T15:00:00Z',tecnico:'Ana'}]});
 const p=resumirPainelBranca(resumirGestaoBranca(b,filtro));
 assert.equal(p.triados,4);assert.equal(p.reparo,1);assert.equal(p.taxaReparo,25);
 assert.deepEqual(p.distribuicao.map(d=>d.total),[1,1,1,1]);
 assert.equal(p.distribuicao.reduce((s,d)=>s+d.total,0),p.triados);
 assert.equal(p.reparados,0);
});
test('falha pós-reparo pertence à bancada e não aumenta triagens ou conversão para reparo',()=>{
 const b=base({triagens:[{id:1,os_id:1,triado_por:'Carlos',precisa_reparo:true,created_at:'2026-10-20T14:00:01Z'}],
 ciclos:[{id:1,os_id:1,etapa_teste:'pos_reparo',numero_ciclo:1,status:'enviado_reparo',resultado:'interrompido',operador:'Carlos',iniciado_em:'2026-10-20T13:00:00Z',concluido_em:'2026-10-20T14:00:00Z'}]});
 const r=resumirGestaoBranca(b,filtro),p=resumirPainelBranca(r);
 assert.equal(r.eventos.length,1);assert.equal(r.eventos[0].etapa,'Bancada de Testes');
 assert.equal(p.triados,0);assert.equal(p.reparo,0);assert.equal(p.taxaReparo,null);
});
test('condenação na triagem não vira reparo nem duplica ciclo e execução',()=>{
 const b=base({execucoes:[{id:1,os_id:1,area_execucao:'Triagem Lavadoras',condenado:true,tecnico:'Carlos',dt_fim:'2026-10-20T14:00:01Z'}],
 ciclos:[{id:1,os_id:1,etapa_teste:'triagem',numero_ciclo:1,status:'reprovado',resultado:'reprovado',operador:'Carlos',iniciado_em:'2026-10-20T13:00:00Z',concluido_em:'2026-10-20T14:00:00Z'}]});
 const r=resumirGestaoBranca(b,filtro),p=resumirPainelBranca(r);
 assert.equal(r.eventos.length,1);assert.equal(r.eventos[0].etapa,'Triagem');
 assert.equal(p.triados,1);assert.equal(p.reparados,0);assert.equal(p.distribuicao.find(d=>d.id==='condenado').total,1);
});
test('ranking visual exclui recebimento e colaborador ausente e preserva filtros',()=>{
 const b=base({os:[os(1,{criado_por:'Importação CSV',dt_entrada:'2026-10-20'}),os(2,{categoria:'Geladeira'})],
 triagens:[{id:1,os_id:1,triado_por:'Carlos',precisa_reparo:true,created_at:'2026-10-20T14:00:00Z'},{id:2,os_id:2,triado_por:null,precisa_reparo:false,created_at:'2026-10-20T15:00:00Z'}]});
 const p=resumirPainelBranca(resumirGestaoBranca(b,filtro));
 assert.equal(p.ranking.length,1);assert.equal(p.ranking[0].total,1);assert.equal(p.semTecnico,1);
 assert.equal(p.atividades,2);assert.equal(p.equipamentos,2);
 assert.equal(p.categorias.find(c=>c.nome==='Lavadoras').equipamentos,1);
 assert.equal(p.categorias.find(c=>c.nome==='Refrigeração').equipamentos,1);
 const lav=resumirPainelBranca(resumirGestaoBranca(b,{...filtro,area:'Lavadoras',tecnico:'Carlos'}));
 assert.equal(lav.triados,1);assert.equal(lav.reparo,1);assert.equal(lav.taxaReparo,100);
});
test('destino legado desconhecido não é aprovado e filtro de período usa Brasília',()=>{
 const b=base({os:[os(1),os(2)],triagensLegado:[{id:1,os_id:1,triado_por:'Ana',destino_pos_triagem:'Reparo Mecânico',dt_triagem:'2026-10-21T01:00:00Z'},{id:2,os_id:2,triado_por:'Ana',destino_pos_triagem:null,dt_triagem:'2026-10-21T02:00:00Z'}]});
 const p=resumirPainelBranca(resumirGestaoBranca(b,filtro));
 assert.equal(p.triados,2);assert.equal(p.reparo,1);assert.equal(p.taxaReparo,50);
 assert.equal(p.distribuicao.find(d=>d.id==='sem_resultado').total,1);
});
