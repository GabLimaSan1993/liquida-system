import test from "node:test";
import assert from "node:assert/strict";
import { codigoCondicaoCompra } from "./condicaoCompra.js";
import { decidirDestino, resultadoFuncional } from "./regrasTriagemFuncional.js";

const negativa = (pergunta, extras = {}) => ({ pergunta, resposta: "não", divergente: false, ...extras });
const cenarios = [
  ["BM com dano estético", "Bom", [negativa("Aparelho sem danos estéticos ou físicos?")], true],
  ["BM com biometria", "BM", [negativa("Leitores biométricos funcionando?")], true],
  ["BM aprovado", "Bom", [{ pergunta: "O aparelho liga?", resposta: "sim" }], false],
  ["BM só defeito adicional", "Bom", [], false, false, ["Tela descascada"]],
  ["BM bloqueado", "Bom", [], true, true],
  ["TR apenas tela", "Trincado", [negativa("O aparelho está sem falhas ou danos na tela?")], false],
  ["Defeituoso apenas biometria", "Defeituoso", [negativa("Leitores biométricos funcionando?")], false],
  ["TR não liga", "TR", [negativa("O aparelho liga, efetua chamadas e se escuta?")], true],
  ["TR ligando/inicializando", "Trincado", [negativa("Seu Samsung está ligando e inicializando normalmente?")], true],
  ["TR senha", "TR", [negativa("Aparelho desbloqueado de senhas e e-mail?")], true],
  ["TR variação senha", "TR", [negativa("Aparelho sem senha ou e-mail?")], true],
  ["TR bloqueio físico", "Defeituoso", [], true, true],
  ["TR defeito bloqueado", "Defeituoso", [], true, false, ["Bloqueado conta"]],
  ["TR defeito desbloqueado", "TR", [], false, false, ["Desbloqueado", "Sem bloqueio"]],
  ["TR aprovado", "TR", [{ pergunta: "O aparelho liga?", resposta: "sim" }], false],
  ["TR ID sem texto", "TR", [negativa("", { pergunta_id: "96f0d85a-28fa-4043-af6d-c0d7d9a97a08" })], true],
  ["Condição ausente", null, [negativa("O aparelho liga?")], false],
  ["Outra condição", "Excelente", [negativa("O aparelho liga?")], false],
];
for (const [nome, condicaoDeclarada, respostas, esperado, aparelhoBloqueado = false, defeitos = []] of cenarios) {
  test(nome, () => assert.equal(decidirDestino({ condicaoDeclarada, respostas, aparelhoBloqueado, defeitos }).laudo, esperado));
}
test("Sufixo da compra prevalece e não usa grade física", () => {
  assert.equal(codigoCondicaoCompra("Bom", "TR"), "TR");
  assert.equal(decidirDestino({ condicaoSufixo: "TR", respostas: [negativa("Leitores biométricos funcionando?")] }).laudo, false);
  assert.equal(codigoCondicaoCompra("Quebrado"), "TR");
  assert.equal(codigoCondicaoCompra("Bons"), "BM");
  assert.equal(codigoCondicaoCompra(null), null);
});
test("TR dispensado de laudo continua BAD com negativa e com defeito adicional", () => {
  assert.equal(resultadoFuncional([negativa("Leitores biométricos funcionando?")], []), "BAD");
  assert.equal(resultadoFuncional([], ["Tela descascada"]), "BAD");
});
