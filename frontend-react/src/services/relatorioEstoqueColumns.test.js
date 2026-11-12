import test from 'node:test';
import assert from 'node:assert/strict';
import * as XLSX from 'xlsx';
import { COLUNAS_ESTOQUE, CAMPOS_ESTOQUE, linhaEstoque } from './relatorioEstoqueColumns.js';

test('percentual da bateria e defeitos da triagem e laboratório preservados', () => {
  assert.equal(COLUNAS_ESTOQUE.length, 37);
  assert.equal(COLUNAS_ESTOQUE[30], 'Saúde da bateria (%)');
  assert.equal(CAMPOS_ESTOQUE[30], 'bateria_percentual');
  assert.equal(CAMPOS_ESTOQUE[31], 'defeitos_triagem');
  assert.equal(CAMPOS_ESTOQUE[34], 'defeitos_laboratorio');
  assert.equal(CAMPOS_ESTOQUE[35], 'defeitos_adicionados_laboratorio');
  assert.equal(CAMPOS_ESTOQUE[36], 'defeitos_removidos_laboratorio');
  assert.equal(CAMPOS_ESTOQUE.includes('aging'), false);
  const linha = linhaEstoque({ voucher: 'YBV-TESTE', imei: '001234567890123', status_bateria: 'Saúde da bateria entre 80% e 85%', bateria_percentual: 83, aging: 245 });
  assert.equal(linha[30], 83);
  assert.equal(linha[1], '001234567890123');
  assert.equal(linha[28], 'Saúde da bateria entre 80% e 85%');
  assert.equal(linhaEstoque({ bateria_percentual: 0 })[30], 0);
  assert.equal(linhaEstoque({ bateria_percentual: 100 })[30], 100);
  assert.equal(linhaEstoque({ bateria_percentual: null, status_bateria: 'Acima de 80%', aging: 12 })[30], null);
});

test('Excel gerado pelo worker exporta números e mantém ausências em branco', async () => {
  const previousSelf = globalThis.self;
  const respostas = [];
  globalThis.self = { postMessage: resposta => respostas.push(resposta) };
  try {
    await import('./relatorioEstoqueExport.worker.js');
    globalThis.self.onmessage({ data: { type: 'init' } });
    globalThis.self.onmessage({ data: { type: 'chunk', items: [{ bateria_percentual: 87 }, { bateria_percentual: 0 }, { bateria_percentual: null }] } });
    globalThis.self.onmessage({ data: { type: 'finish' } });
    const resultado = respostas.at(-1);
    assert.equal(resultado.error, undefined);
    assert.equal(resultado.rows, 3);
    const book = XLSX.read(resultado.buffer, { type: 'array' });
    const sheet = book.Sheets.warehouse;
    assert.equal(sheet.AE1.v, 'Saúde da bateria (%)');
    assert.equal(sheet.AF1.v, 'Defeitos_Triagem');
    assert.equal(sheet.AI1.v, 'Defeitos_Laboratorio');
    assert.equal(sheet.AE2.t, 'n');
    assert.equal(sheet.AE2.v, 87);
    assert.equal(sheet.AE3.t, 'n');
    assert.equal(sheet.AE3.v, 0);
    assert.equal(sheet.AE4, undefined);
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
});
