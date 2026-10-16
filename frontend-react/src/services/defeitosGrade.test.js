import test from "node:test";
import assert from "node:assert/strict";
import { defeitoExigeQuebrado } from "./defeitosGrade.js";
import { decidirDestino, resultadoFuncional } from "./regrasTriagemFuncional.js";
test("qualquer defeito adicional determina BAD, mesmo com perguntas positivas", () => {
  for (const defeitos of [["Tampa Descolando"], "Câmera com falha", "Tampa Descascada", ["Muitos Riscos na Carcaça"], ["Outro defeito"]]) {
    assert.equal(defeitoExigeQuebrado(defeitos), true);
    assert.equal(resultadoFuncional([{ resposta: "sim", divergente: false }], defeitos), "BAD");
  }
  for (const defeitos of [null, "", [], [" ", ""], "; ;"]) assert.equal(defeitoExigeQuebrado(defeitos), false);
});
test("toda negativa exige laudo, qualquer que seja a condição declarada ou o canal", () => {
  for (const condicaoDeclarada of ["Bom", "Defeituoso", null]) for (const canal of ["YBV", "SAMV", "GRV", "DEV"]) for (const resposta of [{ resposta: "não" }, { resposta: "nao" }, { resposta: "sim", divergente: true }]) {
    assert.equal(decidirDestino({ respostas: [resposta], condicaoDeclarada, canal }).laudo, true);
    assert.equal(resultadoFuncional([resposta], []), "BAD");
  }
  assert.equal(decidirDestino({ respostas: [{ resposta: "sim", divergente: false }] }).laudo, false);
  assert.equal(resultadoFuncional([{ resposta: "sim" }], []), "GOOD");
});
