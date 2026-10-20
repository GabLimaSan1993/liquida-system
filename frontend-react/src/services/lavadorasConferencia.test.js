import test from "node:test";
import assert from "node:assert/strict";
import {
  atualizarConferencia, dadosHistoricosOs, duracaoTesteLavadora,
  sugestoesConferencia, tipoReferenciaLavadora, valoresConferenciaIguais,
} from "./lavadorasConferencia.js";

test("cada tipo tem o tempo de teste solicitado", () => {
  assert.equal(duracaoTesteLavadora("Lavadora"), 1500);
  assert.equal(duracaoTesteLavadora("Secadora"), 1800);
  assert.equal(duracaoTesteLavadora("Lava e Seca"), 4440);
  assert.equal(duracaoTesteLavadora("LAVA LOUÇAS"), 1800);
});

test("modelo e capacidade dependem dos campos anteriores, sem misturar marcas", () => {
  const historico = [
    { marca: "LG", modelo: "CV5012", capacidade: "12 KG" },
    { marca: "lg", modelo: "CV5012", capacidade: "12KG" },
    { marca: "LG", modelo: "CV9014", capacidade: "14 KG" },
    { marca: "Samsung", modelo: "WD11", capacidade: "11 KG" },
  ];
  assert.deepEqual(sugestoesConferencia(historico, "marca"), ["LG", "Samsung"]);
  assert.deepEqual(sugestoesConferencia(historico, "modelo"), []);
  assert.deepEqual(sugestoesConferencia(historico, "modelo", { marca: "LG" }), ["CV5012", "CV9014"]);
  assert.deepEqual(sugestoesConferencia(historico, "capacidade", { marca: "LG" }), []);
  assert.deepEqual(sugestoesConferencia(historico, "capacidade", { marca: "lg", modelo: "CV5012" }), ["12 KG"]);
  assert.deepEqual(sugestoesConferencia(historico, "modelo", { marca: "Marca nova" }), []);
});

test("trocar marca ou modelo limpa os dados dependentes e permite texto novo", () => {
  const atual = { marca: "LG", modelo: "CV5012", capacidade: "12 KG" };
  assert.deepEqual(atualizarConferencia(atual, "marca", "Marca nova"), { marca: "Marca nova", modelo: "", capacidade: "" });
  assert.deepEqual(atualizarConferencia(atual, "modelo", "Modelo novo"), { marca: "LG", modelo: "Modelo novo", capacidade: "" });
});

test("Lava e Seca histórica não fica presa à categoria geral Lavadora", () => {
  assert.equal(tipoReferenciaLavadora({ categoria: "Lavadora" }, { descricao: "LAVA E SECA LG CV5012 INOX 12 KG" }), "Lava e Seca");
  assert.equal(tipoReferenciaLavadora({ categoria: "Lavadora" }, null), "");
  assert.equal(tipoReferenciaLavadora({ categoria: "SECADORA DE ROUPA" }, null), "Secadora");
});

test("dados históricos são compatíveis com as seleções fixas sem aceitar tensão divergente", () => {
  assert.equal(valoresConferenciaIguais("cor", "INOX LOOK", "Inox"), true);
  assert.equal(valoresConferenciaIguais("tensao", "110V", "127V"), true);
  assert.equal(valoresConferenciaIguais("tensao", "127V", "220V"), false);
  assert.equal(dadosHistoricosOs({ observacoes_logistica: "Produto: LAVA LOUÇAS 14 SERVIÇOS 220V | Cor: INOX" }).capacidade, "14 SERVIÇOS");
});
