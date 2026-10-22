import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { validarLinhasReparo, lerUploadReparo } from './reparoUpload.js';

test('valida cabeçalho, espaços, linhas vazias e zeros iniciais', () => {
  assert.deepEqual(validarLinhasReparo([[' imei '], ['001234567890123'], [''], [351234567890123]]), ['001234567890123', '351234567890123']);
});
test('rejeita lista vazia, IMEI malformado, duplicado e volume acima do limite', () => {
  assert.throws(() => validarLinhasReparo([['Voucher'], ['YBV123456']]), /coluna IMEI/);
  assert.throws(() => validarLinhasReparo([['IMEI'], ['']]), /pelo menos um/);
  assert.throws(() => validarLinhasReparo([['IMEI'], ['3.51234E+14']]), /Linha 2/);
  assert.throws(() => validarLinhasReparo([['IMEI'], ['12345678901234']]), /15 números/);
  assert.throws(() => validarLinhasReparo([['IMEI'], ['351234567890123'], ['351234567890123']]), /repetido da linha 2/);
  assert.throws(() => validarLinhasReparo([['IMEI'], ...Array.from({ length: 2001 }, (_, i) => [String(100000000000000 + i)])]), /máximo 2000/);
});
test('o modelo publicado aceita dados na aba Reparo e preserva o IMEI', async () => {
  // O arquivo entregue também é o modelo disponível para download no sistema.
  const path = new URL('../../public/modelos/Modelo_Upload_Envio_Reparo.xlsx', import.meta.url);
  const buffer = await fs.readFile(path);
  await assert.rejects(lerUploadReparo({ name: 'modelo.xlsx', size: buffer.length, arrayBuffer: async () => buffer }), /pelo menos um/);
  const csv = new TextEncoder().encode('IMEI\r\n001234567890123\r\n351234567890123\r\n');
  assert.deepEqual(await lerUploadReparo({ name: 'reparo.csv', size: csv.length, arrayBuffer: async () => csv }), ['001234567890123', '351234567890123']);
});
