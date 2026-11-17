import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFEITOS_SCRAP, DEFEITOS_INCOMPATIVEIS_DESBLOQUEADO, defeitosBloqueantesDesbloqueado, selecionarDefeitoScrap, validarConclusaoLaboratorio } from './laboratorioConclusaoValidacao.js';

test('Reparado só pode ser concluído sem defeitos ativos', () => {
  assert.match(validarConclusaoLaboratorio('reparado', ['Tela Quebrada']), /zero defeitos/i);
  assert.equal(validarConclusaoLaboratorio('reparado', []), '');
});

test('Scrap requer um defeito classificatório vigente do catálogo', () => {
  assert.match(validarConclusaoLaboratorio('irrecuperavel', ['Não Inicializa']), /Scrap exige/);
  for (const tipo of DEFEITOS_SCRAP) {
    assert.equal(validarConclusaoLaboratorio('irrecuperavel', [tipo]), '');
  }
  assert.equal(validarConclusaoLaboratorio('sem_reparo', ['Tela Quebrada']), '');
});

test('Escolher classificação Scrap substitui a outra, preservando demais defeitos', () => {
  const final = selecionarDefeitoScrap(['Tela Quebrada', 'Scrap - Não Liga'], 'Scrap - Bloqueado Conta');
  assert.deepEqual(final, ['Tela Quebrada', 'Scrap - Bloqueado Conta']);
  assert.equal(validarConclusaoLaboratorio('irrecuperavel', final), '');
});

test('Não Reparado Desbloqueado bloqueia todos os defeitos incompatíveis do catálogo', () => {
  for (const defeito of DEFEITOS_INCOMPATIVEIS_DESBLOQUEADO) {
    const erro = validarConclusaoLaboratorio('sem_reparo', ['Tela Quebrada', defeito]);
    assert.match(erro, /Não Reparado Desbloqueado não permite/);
    assert.ok(erro.includes(defeito), 'Mensagem deve identificar: ' + defeito);
  }
});

test('Não Reparado Desbloqueado considera variações de espaços, acentos e caixa', () => {
  const ativos = [' BLOQUEADO   SENHA ', 'nao inicializa', 'BLOQUEADO CONTA', 'Scrap - Nao Liga'];
  assert.deepEqual(defeitosBloqueantesDesbloqueado(ativos), ativos);
  assert.match(validarConclusaoLaboratorio('sem_reparo', ativos), /Não Reparado Desbloqueado não permite/);
});

test('Não Reparado Desbloqueado é permitido com defeitos não bloqueantes', () => {
  assert.equal(validarConclusaoLaboratorio('sem_reparo', []), '');
  assert.equal(validarConclusaoLaboratorio('sem_reparo', ['Tela Quebrada', 'Bateria Ruim']), '');
  assert.deepEqual(defeitosBloqueantesDesbloqueado(['Tela Quebrada']), []); 
});
