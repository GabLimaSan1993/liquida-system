import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFEITOS_SCRAP, selecionarDefeitoScrap, validarConclusaoLaboratorio } from './laboratorioConclusaoValidacao.js';

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
