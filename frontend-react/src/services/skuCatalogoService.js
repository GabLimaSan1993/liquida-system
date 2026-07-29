import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// IMPORTADOR DA BASE DE SKU (Assurant)
//
// Substitui a base inteira a cada importação: a planilha é o catálogo
// completo, não um incremento. Os modelos que os operadores cadastraram
// como pendentes são PRESERVADOS — eles não existem na planilha oficial
// e sumiriam junto se a gente apagasse tudo.
// ══════════════════════════════════════════════════════════

const COLUNAS = {
  "TIPO":         "tipo",
  "DATA":         "data_cadastro",
  "SKU ORACLE":   "sku_oracle",
  "SKU ALS":      "sku_als",
  "MANUFACTURER": "fabricante",
  "MARCA":        "marca",
  "MODELO":       "modelo",
  "CAPACIDADE":   "capacidade",
  "TAMANHO (SMARTWATCH)": "tamanho",
  "COR":          "cor",
  "DESCRICAO":    "descricao",
  "CNN":          "cnn",
};

function chaveNormalizada(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const COLUNAS_NORM = Object.fromEntries(
  Object.entries(COLUNAS).map(([o, d]) => [chaveNormalizada(o), d])
);

function limpar(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "-" ? null : s;
}

// A coluna Data vem como serial do Excel ou como texto. Serial precisa de
// aritmética UTC pura: new Date() desloca por fuso e a data volta um dia.
function data(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const ms = Date.UTC(1899, 11, 30) + v * 86400000;
    return new Date(ms).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return iso[0];
  return null;
}

function lerLinhas(file_wb) {
  const sheet = file_wb.Sheets[file_wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  if (!linhas.length) throw new Error("A planilha está vazia.");
  return linhas;
}

export async function previewSkus(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const linhas = lerLinhas(wb);

  const cabecalho = Object.keys(linhas[0]).map(chaveNormalizada);
  const esperadas = Object.keys(COLUNAS_NORM);
  const faltando    = esperadas.filter(c => !cabecalho.includes(c));
  const naoMapeadas = cabecalho.filter(c => c && !esperadas.includes(c));

  const chave = n => Object.keys(linhas[0]).find(k => chaveNormalizada(k) === n);
  const kTipo = chave("TIPO"), kAls = chave("SKU ALS"), kMarca = chave("MARCA");

  const porTipo = {};
  let semSku = 0, semMarca = 0;
  for (const l of linhas) {
    const t = kTipo ? (limpar(l[kTipo]) || "(vazio)") : "(sem coluna)";
    porTipo[t] = (porTipo[t] || 0) + 1;
    if (!kAls   || !limpar(l[kAls]))   semSku++;
    if (!kMarca || !limpar(l[kMarca])) semMarca++;
  }

  return {
    totalLinhas: linhas.length,
    porTipo,
    semSku,
    semMarca,
    aparelhos: porTipo["APARELHO"] || 0,
    faltando,
    naoMapeadas,
  };
}

export async function uploadSkus(file, userId, userNome, onProgress) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: false });
  const linhas = lerLinhas(wb);

  const mapa = {};
  for (const cab of Object.keys(linhas[0])) {
    const destino = COLUNAS_NORM[chaveNormalizada(cab)];
    if (destino) mapa[cab] = destino;
  }
  if (!Object.values(mapa).includes("marca") || !Object.values(mapa).includes("modelo")) {
    throw new Error('A planilha precisa das colunas "MARCA" e "MODELO".');
  }

  const registros = [];
  let ignoradas = 0;
  for (const row of linhas) {
    const r = { pendente: false, ativo: true };
    for (const [origem, destino] of Object.entries(mapa)) {
      r[destino] = destino === "data_cadastro" ? data(row[origem]) : limpar(row[origem]);
    }
    if (!r.marca || !r.modelo) { ignoradas++; continue; }
    r.tipo = (r.tipo || "APARELHO").toUpperCase();
    for (const c of ["marca", "modelo", "capacidade", "cor", "sku_als", "sku_oracle"]) {
      if (r[c]) r[c] = String(r[c]).toUpperCase();
    }
    registros.push(r);
  }
  if (!registros.length) throw new Error("Nenhuma linha válida na planilha.");

  // Apaga só o que veio de importação anterior. Os pendentes cadastrados
  // pelos operadores na bancada ficam — não estão na planilha oficial.
  const { error: errDel } = await supabase
    .from("produtos_catalogo").delete().eq("pendente", false);
  if (errDel) throw new Error(`Erro ao limpar a base anterior: ${errDel.message}`);

  const BLOCO = 500;
  let gravadas = 0;
  for (let i = 0; i < registros.length; i += BLOCO) {
    const bloco = registros.slice(i, i + BLOCO);
    const { error } = await supabase.from("produtos_catalogo").insert(bloco);
    if (error) throw new Error(`Erro ao gravar o bloco ${i / BLOCO + 1}: ${error.message}`);
    gravadas += bloco.length;
    if (onProgress) {
      onProgress({ fase: "SKUs", pct: Math.round((gravadas / registros.length) * 100) });
    }
  }

  const aparelhos = registros.filter(r => r.tipo === "APARELHO").length;

  return {
    gravadas,
    aparelhos,
    ignoradas,
    totalLinhas: linhas.length,
    importadoPor: userNome || null,
    importadoEm: new Date().toISOString(),
  };
}