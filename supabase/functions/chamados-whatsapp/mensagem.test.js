import test from 'node:test';
import assert from 'node:assert/strict';
import { corpoMensagem, variaveisChamado, resultadoTwilio, erroTwilio } from './mensagem.js';
const config = { remetente: '+17372508034', destinatario: '+5511999999999', modo: 'producao', content_sid: 'HX'+'a'.repeat(32) };
const payload = { numero: 9, titulo: 'Erro\nno laudo', prioridade: 'urgente', solicitante: 'Operador', tela: 'Laudos', criado_em: '2026-10-21T13:30:00Z', descricao: 'Dado que não deve ser enviado', anexos: ['privado.pdf'] };
test('notificação usa modelo aprovado, protocolo e horário de Brasília, sem descrição nem anexos',()=>{
 const body=corpoMensagem({config,payload});const v=JSON.parse(body.get('ContentVariables'));
 assert.equal(body.get('ContentSid'),config.content_sid);assert.equal(v['1'],'CH-00009');assert.equal(v['2'],'Erro no laudo');assert.match(v['6'],/10:30/);
 assert(!body.toString().includes('privado'));assert(!body.has('Body'));assert.equal(body.get('To'),'whatsapp:'+config.destinatario);
});
test('não usa mensagens livres nem remetente de teste para avisos automáticos',()=>{
 assert.throws(()=>corpoMensagem({config:{...config,modo:'teste'},payload}));
 assert.throws(()=>corpoMensagem({config:{...config,content_sid:null},payload}));
 assert(corpoMensagem({config:{...config,modo:'teste'},teste:true}).has('Body'));
});
test('aceitação pelo provedor é diferente de entrega ao celular',()=>{
 assert.equal(resultadoTwilio({status:'queued'}),'aceito');assert.equal(resultadoTwilio({status:'sent'}),'aceito');
 assert.equal(resultadoTwilio({status:'delivered'}),'entregue');assert.equal(resultadoTwilio({status:'undelivered'}),'erro');
 assert.match(erroTwilio(63015),/Vincule/);assert.match(erroTwilio(63016),/janela/);
});
