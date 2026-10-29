import test from "node:test";
import assert from "node:assert/strict";
import { tipoDoAparelho, erroIdentificacao, exigeDoisImeis } from "./identificacaoAparelho.js";
test("danos da tela permite um IMEI opcional sem aceitar código malformado ou segundo código", () => {
  assert.equal(exigeDoisImeis("GALAXY S24", "", false, true), false);
  assert.equal(erroIdentificacao("CELULAR", "", null, { modelo: "GALAXY S24", danosTela: true }), null);
  assert.equal(erroIdentificacao("CELULAR", "123456789012345", null, { modelo: "GALAXY S24", danosTela: true }), null);
  assert.ok(erroIdentificacao("CELULAR", "12345678901234", null, { danosTela: true }));
  assert.ok(erroIdentificacao("CELULAR", "", "123456789012345", { danosTela: true }));
  assert.equal(erroIdentificacao("RELOGIO", "", null, { danosTela: true }), null);
  assert.equal(erroIdentificacao("CELULAR", "", null, { aparelhoBloqueado: true }), null);
});
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


test("aparelho bloqueado aceita IMEI ausente ou um IMEI válido, sem relaxar os 15 dígitos", () => {
  assert.equal(erroIdentificacao("CELULAR", "", "", { modelo: "GALAXY S24", aparelhoBloqueado: true }), null);
  assert.ok(erroIdentificacao("CELULAR", "123456789012345", "123456789012346", { modelo: "GALAXY S24", aparelhoBloqueado: true }));
  assert.equal(exigeDoisImeis("GALAXY S24", "", true), false);
  assert.equal(erroIdentificacao("CELULAR", "123456789012345", null, { modelo: "GALAXY S24", aparelhoBloqueado: true }), null);
  for (const codigo of ["12345678901234", "1234567890123456", "R7AX60XHHLR"]) {
    assert.ok(erroIdentificacao("CELULAR", codigo, null, { modelo: "GALAXY S24", aparelhoBloqueado: true }));
  }
  assert.ok(erroIdentificacao("CELULAR", "123456789012345", null, { modelo: "GALAXY S24" }));
});
test("modelos de IMEI único e celulares de dois IMEIs não se confundem", () => {
  for (const modelo of ["IPHONE 5", "IPHONE 5C", "IPHONE 5S", "IPHONE 6", "IPHONE 6S PLUS", "IPHONE6 PLUS"]) {
    assert.equal(exigeDoisImeis(modelo), false, modelo);
    assert.equal(erroIdentificacao("CELULAR", "123456789012345", null, { modelo }), null, modelo);
  }
  for (const modelo of ["IPHONE 15", "IPHONE 16", "IPHONE 16 PRO MAX", "GALAXY S24", "GALAXY A06", "MOTO G6", "GALAXY S6", "SAMSUNG GALAXY J4 PLUS", "GALAXY J7 PRIME", "SAMSUNG J 5", "GALAXY J5 PRIME"]) {
    assert.equal(exigeDoisImeis(modelo), true, modelo);
    assert.ok(erroIdentificacao("CELULAR", "123456789012345", null, { modelo }), modelo);
    assert.equal(erroIdentificacao("CELULAR", "123456789012345", "123456789012346", { modelo }), null, modelo);
    assert.equal(erroIdentificacao("CELULAR", "123456789012345", null, { modelo, aparelhoBloqueado: true }), null, modelo);
  }
  assert.equal(exigeDoisImeis("MODELO ESPECIAL", "SMARTWATCH"), false);
  assert.equal(exigeDoisImeis("MODELO ESPECIAL", "RELOGIO"), false);
});


test("iPhones 7 e Motorola One Micro/Macro aceitam um IMEI, sem afetar iPhone 17 e outros One", () => {
  for (const modelo of ["IPHONE 7", "IPHONE 7 PLUS", "IPHONE 7 INT", "IPHONE 7 PLUS INT", "MOTO ONE MACRO", "MOTOROLA ONE MICRO", "MOTOROLA ONE MACRO", "ONE MICRO"]) {
    assert.equal(exigeDoisImeis(modelo), false, modelo);
    assert.equal(erroIdentificacao("CELULAR", "123456789012345", null, { modelo }), null, modelo);
    assert.ok(erroIdentificacao("CELULAR", "12345678901234", null, { modelo }), modelo);
  }
  for (const modelo of ["IPHONE 17", "IPHONE 17 PRO MAX", "MOTO ONE VISION", "MOTO ONE ACTION", "MOTO G7"]) {
    assert.equal(exigeDoisImeis(modelo), true, modelo);
    assert.ok(erroIdentificacao("CELULAR", "123456789012345", null, { modelo }), modelo);
  }
});
