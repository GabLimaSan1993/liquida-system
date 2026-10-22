import test from "node:test";
import assert from "node:assert/strict";
import { defeitoExigeQuebrado, filtrarDefeitosAdicionais } from "./defeitosGrade.js";
import { resultadoFuncional } from "./regrasTriagemFuncional.js";

test("as duas faixas de bateria não são defeitos nem tornam a funcional BAD", () => {
  const faixas = ["Saúde da bateria abaixo de 80%", "Saúde da bateria entre 80% e 85%"];
  assert.deepEqual(filtrarDefeitosAdicionais(faixas), []);
  assert.deepEqual(filtrarDefeitosAdicionais(" SAUDE DA BATERIA ABAIXO DE 80% ; Saúde da bateria entre 80% e 85% "), []);
  assert.equal(defeitoExigeQuebrado(faixas), false);
  assert.equal(resultadoFuncional([{ resposta: "sim" }], faixas), "GOOD");
  assert.equal(resultadoFuncional([{ resposta: "não" }], faixas), "BAD");
});

test("remoção preserva os demais defeitos e a faixa abaixo de 70%", () => {
  const outros = ["Tela Quebrada", "Bateria Inchada", "Saúde da bateria abaixo 70%", "Peça não Genuína - Bateria"];
  const entrada = `Saúde da bateria abaixo de 80%; ${outros.join("; ")}; Saúde da bateria entre 80% e 85%`;
  assert.deepEqual(filtrarDefeitosAdicionais(entrada), outros);
  assert.equal(defeitoExigeQuebrado(entrada), true);
  assert.equal(resultadoFuncional([{ resposta: "sim" }], entrada), "BAD");
  assert.deepEqual(filtrarDefeitosAdicionais(null), []);
});
