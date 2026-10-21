import test from "node:test";
import assert from "node:assert/strict";
import { validarVoucherRecebimento } from "./voucherRecebimento.js";

test("aceita YBV com exatamente seis dígitos, preservando zeros", () => {
  for (const voucher of ["YBV123456", "YBV000001", "YBV000000", "YBV999999"]) {
    assert.deepEqual(validarVoucherRecebimento(voucher), { ok: true, voucher });
  }
  assert.deepEqual(validarVoucherRecebimento(" ybv123456\r\n"), { ok: true, voucher: "YBV123456" });
});

test("bloqueia prefixos incorretos e vouchers sem prefixo", () => {
  for (const valor of ["ABC123456", "YB123456", "YVB123456", "123456", "DEV1YBV123456"]) {
    const r = validarVoucherRecebimento(valor);
    assert.equal(r.ok, false, valor);
    assert.match(r.erro, /letras YBV/);
  }
});

test("bloqueia números faltantes, excedentes, letras e símbolos sem truncar", () => {
  for (const valor of ["YBV", "YBV1", "YBV12345", "YBV1234567", "YBV1234567890", "YBVYBV123456", "YBV12345A", "YBV-123456", "YBV123 456", "YBV１２３４５６", "YBV123\n456", "YBV123456\nX"]) {
    const r = validarVoucherRecebimento(valor);
    assert.equal(r.ok, false, valor);
    assert.match(r.erro, /exatamente 6 números/);
  }
});

test("campos vazios não são aceitos", () => {
  for (const valor of ["", "  ", null, undefined]) assert.equal(validarVoucherRecebimento(valor).ok, false);
});
