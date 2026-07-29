import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// IMPORTADOR DA PLANILHA TRADEIN (base diária, só canal YBV)
//
// Diferente do Relatório AP, esta tabela NÃO acumula: o arquivo do dia é a
// base completa e faz upsert por voucher. O que a triagem precisa é a verdade
// de hoje — se um voucher sumir do arquivo, a linha antiga fica (não apagamos),
// mas qualquer voucher presente é sobrescrito com o dado mais novo.
//
// O voucher vem só numérico (410225). A coluna voucher_ybv é calculada pelo
// banco como 'YBV' || voucher, que é o formato usado na assurant_triagem.
// ══════════════════════════════════════════════════════════

const COLUNAS = {
  "VOUCHER":              "voucher",
  "SKU":                  "sku",
  "MARCA":                "marca",
  "APARELHO":             "aparelho",
  "CONDIÇÃO DO APARELHO": "condicao_aparelho",
  "IMEI":                 "imei",
  "INICIO":               "inicio",
  "APROVAÇÃO":            "aprovacao",
  "STATUS ATUAL":         "status_atual",
  "INICIO STATUS ATUAL":  "inicio_status",
  "VALOR TOTAL A PAGAR":  "valor_total_pagar",
  "NOME VENDEDOR":        "nome_vendedor",
  "CLIENTE":              "cliente",
  "CPF":                  "cpf",
  "EMAIL":                "email",
  "TELEFONE":             "telefone",
  "ENDEREÇO":             "endereco",
  "NÚMERO":               "numero",
  "BAIRRO":               "bairro",
  "COMPLEMENTO":          "complemento",
  "CEP":                  "cep",
  "CIDADE":               "cidade",
  "UF":                   "uf",
  "LOJA":                 "loja",
  "VALOR TRADE IN":       "valor_tradein",
  "VALOR CAMPANHA":       "valor_campanha",
  "NOME CAMPANHA":        "nome_campanha",
  "LOTE":                 "lote",
  "CAE":                  "cae",
  "PONTO DE VENDA AFIP":  "ponto_venda_afip",
  "PRODUTO COMPRADO":     "produto_comprado",
  "REDE":                 "rede",
  "CÓDIGO DA LOJA":       "codigo_loja",
  "SITUATION_DESCRIPTION": "situation_desc",
  "CANCELED":             "canceled",
};

const NUMERICAS = new Set(["valor_total_pagar", "valor_tradein", "valor_campanha"]);

// Mesma normalização usada no Relatório AP: tolera acento, caixa e espaço duplo.
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

// "1.234,56" e "1234.56" viram 1234.56. Qualquer coisa não numérica vira null.
function numero(v) {
  const s = limpar(v);
  if (s == null) return null;
  const limpo = s.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(limpo);
  return isNaN(n) ? null : n;
}

// BRZDEV11728BM -> { base: "BRZDEV11728", sufixo: "BM" }
// O sufixo é a condição declarada pela loja: BM = Bom, TR = Defeituoso.
export function quebrarSku(sku) {
  const s = String(sku || "").trim().toUpperCase();
  const m = s.match(/^([A-Z]+\d+)([A-Z]*)$/);
  if (!m) return { base: s || null, sufixo: null };
  return { base: m[1], sufixo: m[2] || null };
}

function lerPlanilha(rows) {
  const linhas = XLSX.utils.sheet_to_json(rows, { defval: "", raw: false });
  if (!linhas.length) throw new Error("A planilha está vazia.");
  return linhas;
}

export async function previewTradein(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const linhas = lerPlanilha(wb.Sheets[wb.SheetNames[0]]);

  const cabecalho = Object.keys(linhas[0]).map(chaveNormalizada);
  const esperadas = Object.keys(COLUNAS_NORM);
  const faltando    = esperadas.filter(c => !cabecalho.includes(c));
  const naoMapeadas = cabecalho.filter(c => c && !esperadas.includes(c));

  const chaveVoucher = Object.keys(linhas[0]).find(k => chaveNormalizada(k) === "VOUCHER");
  const chaveImei    = Object.keys(linhas[0]).find(k => chaveNormalizada(k) === "IMEI");
  const chaveStatus  = Object.keys(linhas[0]).find(k => chaveNormalizada(k) === "STATUS ATUAL");
  const chaveCanc    = Object.keys(linhas[0]).find(k => chaveNormalizada(k) === "CANCELED");

  const vouchers = new Set();
  let semVoucher = 0, semImei = 0, cancelados = 0;
  const porStatus = {};

  for (const l of linhas) {
    const v = chaveVoucher ? limpar(l[chaveVoucher]) : null;
    if (!v || !/^\d+$/.test(v)) semVoucher++; else vouchers.add(v);
    if (!chaveImei || !limpar(l[chaveImei])) semImei++;
    const st = chaveStatus ? (limpar(l[chaveStatus]) || "(vazio)") : "(sem coluna)";
    porStatus[st] = (porStatus[st] || 0) + 1;
    if (chaveCanc && String(limpar(l[chaveCanc]) || "").toUpperCase() === "SIM") cancelados++;
  }

  return {
    totalLinhas: linhas.length,
    vouchers: vouchers.size,
    semVoucher,
    semImei,
    cancelados,
    porStatus,
    faltando,
    naoMapeadas,
  };
}

export async function uploadTradein(file, userId, userNome, onProgress) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const linhas = lerPlanilha(wb.Sheets[wb.SheetNames[0]]);

  const mapa = {};
  for (const cab of Object.keys(linhas[0])) {
    const destino = COLUNAS_NORM[chaveNormalizada(cab)];
    if (destino) mapa[cab] = destino;
  }
  if (!Object.values(mapa).includes("voucher")) {
    throw new Error('A planilha não tem a coluna "VOUCHER" — sem ela não há como casar com a triagem.');
  }

  // Dedupe dentro do próprio arquivo: se o mesmo voucher vier duas vezes,
  // o upsert em bloco falha por conflito interno. Fica a última ocorrência.
  const porVoucher = new Map();
  let semVoucher = 0, cancelados = 0;

  for (const row of linhas) {
    const r = { importado_por: userId };
    for (const [origem, destino] of Object.entries(mapa)) {
      r[destino] = NUMERICAS.has(destino) ? numero(row[origem]) : limpar(row[origem]);
    }

    const v = r.voucher;
    if (!v || !/^\d+$/.test(String(v))) { semVoucher++; continue; }
    r.voucher = parseInt(v, 10);

    const { base, sufixo } = quebrarSku(r.sku);
    r.sku_base        = base;
    r.condicao_sufixo = sufixo;

    if (String(r.canceled || "").toUpperCase() === "SIM") cancelados++;

    porVoucher.set(r.voucher, r);
  }

  const registros = [...porVoucher.values()];
  if (!registros.length) throw new Error("Nenhuma linha com VOUCHER numérico válido.");

  const BLOCO = 500;
  let gravadas = 0;
  for (let i = 0; i < registros.length; i += BLOCO) {
    const bloco = registros.slice(i, i + BLOCO);
    const { error } = await supabase
      .from("tradein_geral")
      .upsert(bloco, { onConflict: "voucher" });
    if (error) throw new Error(`Erro ao gravar o bloco ${i / BLOCO + 1}: ${error.message}`);
    gravadas += bloco.length;
    if (onProgress) {
      onProgress({ fase: "TradeIn", pct: Math.round((gravadas / registros.length) * 100) });
    }
  }

  return {
    gravadas,
    totalLinhas: linhas.length,
    duplicadosNoArquivo: linhas.length - semVoucher - registros.length,
    semVoucher,
    cancelados,
    importadoPor: userNome || null,
    importadoEm: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════
// VALIDAÇÃO DE IMEI NA TRIAGEM FUNCIONAL
// Recebe o voucher (formato YBV ou numérico) e o IMEI digitado na bancada.
// ══════════════════════════════════════════════════════════

// Status em que o aparelho ainda não saiu da loja — validar contra eles
// deixaria passar aparelho que fisicamente não deveria estar aqui.
const STATUS_NAO_COLETADO = ["Aparelho em Loja", "Aguardando Confirmação"];

export async function validarImeiTradein(voucher, imeiDigitado) {
  const numeroVoucher = String(voucher || "").replace(/\D/g, "");
  if (!numeroVoucher) return { ok: false, erro: "Voucher inválido." };

  const { data, error } = await supabase
    .from("tradein_geral")
    .select("voucher, voucher_ybv, imei, sku, sku_base, condicao_sufixo, marca, aparelho, condicao_aparelho, loja, status_atual, canceled")
    .eq("voucher", parseInt(numeroVoucher, 10))
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) {
    return { ok: false, encontrado: false, erro: `Voucher ${numeroVoucher} não existe na base TradeIn.` };
  }

  const imeiBase = String(data.imei || "").trim();
  const imeiBip  = String(imeiDigitado || "").trim();
  const confere  = imeiBase !== "" && imeiBase === imeiBip;

  return {
    ok: true,
    encontrado: true,
    confere,
    imeiTradein: imeiBase,
    imeiDigitado: imeiBip,
    naoColetado: STATUS_NAO_COLETADO.includes(data.status_atual),
    cancelado: String(data.canceled || "").toUpperCase() === "SIM",
    dados: data,
  };
}