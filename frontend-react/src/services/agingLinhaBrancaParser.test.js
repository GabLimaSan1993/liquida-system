import test from "node:test";
import assert from "node:assert/strict";
import { parseAgingLinhaBranca, dataAging, dataNomeArquivo, categoriaAging, etapaAging } from "./agingLinhaBrancaParser.js";

const header = "num_OS;categoria_produto;tipo_prod;ETAPA;Marca;Dt_Abert;Modelo;SerialIn;descricaoProduto";
const row = "570000;LINHA BRANCA;LAVADORA DE ROUPA;PCP;LG;20/10/2026 12:30;CV;123;LAVA E SECA 12 KG";
test("seleciona categoria e tipo originais, preservando cada OS", () => {
  const r = parseAgingLinhaBranca(`\uFEFF${header}\r\n${row}\r\n1;LINHA MARROM;TV;PCP;LG;20/10/2026;TV;123;TV 43\"\r\n`);
  assert.equal(r.total, 2); assert.equal(r.registros.length, 1); assert.equal(r.outrasCategorias, 1);
  assert.equal(r.registros[0].categoria, "Lavadora"); assert.equal(r.registros[0].dados_origem.descricaoProduto, "LAVA E SECA 12 KG");
});
test("aspas literais no ALS não juntam OSs", () => {
  const r = parseAgingLinhaBranca(`${header}\n${row.replace('LAVA E SECA 12 KG', 'Modelo 12\" sem aspas de fechamento')}\n${row.replace('570000','570001')}`);
  assert.equal(r.registros.length, 2); assert.equal(r.erros.length, 0);
});
test("aceita exportação CSV com campos protegidos", () => {
  const quotedHeader = header.split(';').map(s => `"${s}"`).join(';');
  const quotedRow = row.split(';').map(s => `"${s}"`).join(';');
  assert.equal(parseAgingLinhaBranca(`${quotedHeader}\n${quotedRow}`).registros.length, 1);
});
test("repetições idênticas são únicas; divergentes bloqueiam importação", () => {
  assert.equal(parseAgingLinhaBranca(`${header}\n${row}\n${row}`).repetidas, 1);
  assert.equal(parseAgingLinhaBranca(`${header}\n${row}\n${row.replace(';PCP;', ';QCC;')}`).erros.length, 1);
});
test("falha claramente para colunas, linhas, datas ou etapas inválidas", () => {
  assert.throws(() => parseAgingLinhaBranca('num_OS;ETAPA'), /Colunas ausentes/);
  assert.equal(parseAgingLinhaBranca(`${header}\n${row};extra`).erros.length, 1);
  assert.equal(parseAgingLinhaBranca(`${header}\n${row.replace(';PCP;', ';DESCONHECIDA;')}`).erros.length, 1);
  assert.equal(dataAging('31/02/2026'), null);
  assert.equal(dataNomeArquivo('Relatório_Aging_Personalizado20_10_2026 (1).csv'), '2026-10-20');
});
test("equipamentos e etapas posteriores não voltam para triagem", () => {
  assert.equal(categoriaAging('LAVADORA DE ALTA PRESSÃO'), 'LAVADORA DE ALTA PRESSÃO');
  assert.equal(categoriaAging('LAVA LOUÇAS'), 'Lava Louças');
  assert.equal(categoriaAging('SECADORA DE ROUPA'), 'Secadora');
  assert.equal(etapaAging('SCRAP Prejuízo Venda no Estado').status, 'Scrap');
  assert.equal(etapaAging('QCC').status, 'Qualidade');
  assert.equal(etapaAging('Aguardando Confirmação de movimentação CMP/HF').status, 'Aprovado');
  assert.equal(etapaAging('Laboratorio').status, 'Em reparo');
  assert.equal(etapaAging('Expedido').status, 'Finalizado');
});
