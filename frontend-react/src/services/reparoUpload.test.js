import test from 'node:test';
import assert from 'node:assert/strict';
import { validarLinhasReparo, lerUploadReparo, normalizarVoucherReparo } from './reparoUpload.js';

test('importação para reparo identifica vouchers e aceita número YBV sem prefixo', () => {
  assert.deepEqual(validarLinhasReparo([
    [' VOUCHER '], ['  YBV123456  '], [456789], ['samv112233'],
    ['DEV1YBV333222'], ['']
  ]), ['YBV123456', 'YBV456789', 'SAMV112233', 'DEV1YBV333222']);
  assert.equal(normalizarVoucherReparo('000459711'), 'YBV459711');
});

test('arquivo antigo por IMEI recebe orientação específica', () => {
  assert.throws(() => validarLinhasReparo([['IMEI'], ['351234567890123']]), /modelo antigo por IMEI/);
});

test('vouchers repetidos, IMEIs disfarçados e formatos inválidos são rejeitados', () => {
  assert.throws(() => validarLinhasReparo([['VOUCHER'], ['']]), /pelo menos um voucher/);
  assert.throws(() => validarLinhasReparo([['VOUCHER'], ['YBV112233'], ['112233']]), /voucher repetido/);
  assert.throws(() => validarLinhasReparo([['VOUCHER'], ['351234567890123']]), /parece um IMEI/);
  assert.throws(() => validarLinhasReparo([['VOUCHER'], ['@@@']]), /Linha 2/);
  assert.throws(() => validarLinhasReparo([['VOUCHER'], ...Array.from({length:2001},(_,i)=>['YBV'+String(i+100000)])]), /máximo 2000/);
});

test('CSV com coluna voucher é aceito e preserva códigos', async () => {
  const csv=new TextEncoder().encode('VOUCHER\r\nYBV001234\r\nSAMV123456\r\n');
  const dados=await lerUploadReparo({name:'reparo.csv',size:csv.length,arrayBuffer:async()=>csv});
  assert.deepEqual(dados,['YBV1234','SAMV123456']);
});
