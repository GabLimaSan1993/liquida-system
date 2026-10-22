import test from 'node:test';
import assert from 'node:assert/strict';
import {calcularAcuracidade,situacaoMetaAcuracidade} from './inventarioAcuracidade.js';
import {compararMetas,produtividadeDiaria} from './gestaoOperacionalUtils.js';
test('inventário bruto preserva desvio reconciliado, ignora contagem aberta e distingue endereços',()=>{
 const c=[{id:'a',status:'concluida'},{id:'b',status:'concluida'},{id:'c',status:'em_contagem'}];
 const itens=[{contagem_id:'a',veredito:'conferido'},{contagem_id:'a',veredito:'falta',reconciliado_em:'2026-10-20'},{contagem_id:'c',veredito:'sobra'}];
 const r=calcularAcuracidade(c,itens);assert.equal(r.acuraciaPecaBruta,50);assert.equal(r.acuraciaPeca,100);assert.equal(r.acuraciaEndereco,50);assert.equal(r.concluidas,2);assert.equal(r.sobras,0);
 assert.equal(calcularAcuracidade([],[]).acuraciaPecaBruta,null);assert.equal(situacaoMetaAcuracidade(96.999),'Abaixo da referência');assert.equal(situacaoMetaAcuracidade(97),'Referência atingida');
});
test('metas comparam mesma etapa e dia; zero difere de meta ausente',()=>{
 const m=[{dia:'2026-10-20',etapa:'funcional',quantidade:10},{dia:'2026-10-21',etapa:'funcional',quantidade:0}];
 const r=compararMetas(m,[{periodo:'2026-10-20',etapa:'funcional',producao:8},{periodo:'2026-10-20',etapa:'expedicao',producao:99},{periodo:'2026-10-22',etapa:'funcional',producao:40}]);
 assert.equal(r.length,2);assert.equal(r[0].realizado,8);assert.equal(r[0].desvio,-2);assert.equal(r[0].atingimento,80);assert.equal(r[1].atingimento,null);
});
test('efetivo inclui quem não produziu, distingue ausência de dado faltante e separa volumes',()=>{
 const e=[{dia:'2026-10-20',colaborador_id:'a',nome:'Ana',equipe:'Triagem',presente:true,horas:8},{dia:'2026-10-20',colaborador_id:'b',nome:'Bia',equipe:'Triagem',presente:false,horas:0}];
 const d=[{periodo:'2026-10-20',colaborador_id:'a',colaborador:'Ana',unidade:'aparelhos',producao:10},{periodo:'2026-10-20',colaborador_id:'a',colaborador:'Ana',unidade:'volumes',producao:2},{periodo:'2026-10-20',colaborador_id:'c',colaborador:'Caio',unidade:'itens',producao:3},{periodo:'2026-10-20',colaborador_id:null,unidade:'itens',producao:4}];
 const r=produtividadeDiaria(e,d);assert.equal(r.linhas.length,3);assert.equal(r.linhas.find(x=>x.colaborador_id==='b').itens,0);assert.equal(r.linhas.find(x=>x.colaborador_id==='c').presente,null);assert.equal(r.equipes.find(x=>x.equipe==='Triagem').presentes,1);assert.equal(r.linhas.find(x=>x.colaborador_id==='a').itens,10);assert.equal(r.linhas.find(x=>x.colaborador_id==='a').volumes,2);assert.equal(r.semResponsavel[0].itens,4);
});
