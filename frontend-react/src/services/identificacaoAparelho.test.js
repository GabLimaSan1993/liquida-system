import test from "node:test";
import assert from "node:assert/strict";
import { tipoDoAparelho, erroIdentificacao } from "./identificacaoAparelho.js";
test("celular exige dois IMEIs distintos e de exatamente 15 dígitos", () => {
  assert.equal(
    erroIdentificacao("CELULAR", "123456789012345", "123456789012346"),
    null,
  );
  for (const valor of [
    "12345678901234",
    "1234567890123456",
    "ABC456789012345",
    "",
  ])
    assert.ok(erroIdentificacao("CELULAR", valor, "123456789012346"));
  assert.ok(erroIdentificacao("CELULAR", "123456789012345", ""));
  assert.ok(erroIdentificacao("CELULAR", "123456789012345", "123456789012345"));
});
test("serial de relógio e tablet preserva letras e tamanho diferente de IMEI", () => {
  for (const tipo of ["TABLET", "RELOGIO"]) {
    assert.equal(erroIdentificacao(tipo, "R58M-123AB/9"), null);
    assert.equal(erroIdentificacao(tipo, "F4K123ABCDEF"), null);
    assert.ok(erroIdentificacao(tipo, "A"));
    assert.ok(erroIdentificacao(tipo, "ABC DEF"));
  }
});
test("tipo segue catálogo e modelo físico", () => {
  assert.equal(tipoDoAparelho("GALAXY S24 PLUS"), "CELULAR");
  assert.equal(tipoDoAparelho("GALAXY TAB S9"), "TABLET");
  assert.equal(tipoDoAparelho("IPAD 10"), "TABLET");
  assert.equal(tipoDoAparelho("WATCH 6 LTE"), "RELOGIO");
  assert.equal(tipoDoAparelho("FIT 3", "SMARTWATCH"), "RELOGIO");
});

test("Fit 3 é relógio mesmo com variações do modelo ou cadastro APARELHO", () => {
  for (const modelo of ["FIT 3", "GALAXY FIT3", "SAMSUNG FIT 3 40MM GRAY", "Samsung  Fit 3  Gray"]) {
    assert.equal(tipoDoAparelho(modelo, "APARELHO"), "RELOGIO");
    assert.equal(erroIdentificacao(tipoDoAparelho(modelo), "R7AX60XHHLR"), null);
  }
});
