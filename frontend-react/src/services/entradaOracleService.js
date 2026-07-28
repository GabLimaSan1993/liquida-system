import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// DE/PARA DE GRADE — texto do Gaia → número do Oracle
// Espelha a tabela grade_oracle_depara. Mantido em código também
// porque a conversão roda na tela, item a item, sem ida ao banco.
// ══════════════════════════════════════════════════════════

// Faixa de bateria que rebaixa a grade (mesma regra usada no FIFO).
const BATERIA_REBAIXA = "saúde da bateria entre 70 e 79%";

const GRADE_ORACLE = {
  "like new":  200,
  "excelente": 201,
  "muito bom": 202,
  "bom":       203,
  "regular":   4,
  "quebrado":  5,
  "outlet":    204,
};

// Converte a grade do Gaia no número Oracle, aplicando a regra de bateria 70-79%:
//  - Like New / Excelente / Muito Bom / Bom + bateria 70-79% → Outlet (204)
//  - Regular  + bateria 70-79% → Quebrado (5)
//  - Quebrado + bateria 70-79% → Quebrado (5)  (já é)
//  - Outlet   → sempre Outlet (204); a bateria não muda nada
// Retorna null para grade desconhecida — a tela mostra em branco em vez de chutar.
export function gradeParaOracle(gradeTexto, statusBateria) {
  const g = String(gradeTexto || "").toLowerCase().trim();
  const bateriaBaixa =
    String(statusBateria || "").toLowerCase().trim() === BATERIA_REBAIXA;

  if (g === "outlet") return 204;

  if (bateriaBaixa) {
    if (["like new", "excelente", "muito bom", "bom"].includes(g)) return 204;
    if (g === "regular")  return 5;
    if (g === "quebrado") return 5;
  }

  return GRADE_ORACLE[g] ?? null;
}

// Útil para a tela: diz se a linha teve a grade rebaixada pela bateria,
// pra marcar o ⚡ ao lado da grade.
export function rebaixadoPorBateria(gradeTexto, statusBateria) {
  const g = String(gradeTexto || "").toLowerCase().trim();
  const bateriaBaixa =
    String(statusBateria || "").toLowerCase().trim() === BATERIA_REBAIXA;
  if (!bateriaBaixa) return false;
  return ["like new", "excelente", "muito bom", "bom", "regular"].includes(g);
}

// ══════════════════════════════════════════════════════════
// IMPORTADOR DO RELATÓRIO AP (planilha diária do Oracle)
// A tabela ACUMULA: cada importação insere linhas novas, nunca sobrescreve.
// A tela lê sempre a versão mais recente de cada po_gerada.
// ══════════════════════════════════════════════════════════

// Cabeçalho do relatório AP → colunas da tabela entrada_oracle_ap.
// As chaves são EXATAMENTE como vêm no cabeçalho do Excel.
const COLUNAS_AP = {
  "AP- CADASTRO":            "ap_cadastro",
  "NOME":                    "nome",
  "CPF/CNPJ":                "cpf_cnpj",
  "CNPJ_LOJA":               "cnpj_loja",
  "ID_PO":                   "id_po",
  "IMEI":                    "imei",
  "PROCESSO DA PO":          "processo_da_po",
  "PO- GERADA":              "po_gerada",
  "PO- DATA CRIACAO PO":     "po_data_criacao",
  "CANAL":                   "canal",
  "AR- GERACAO NF":          "ar_geracao_nf",
  "PO- STATUS":              "po_status",
  "NOTA GERADA":             "nota_gerada",
  "STATUS SEFAZ":            "status_sefaz",
  "MOTIVOS REJEICAO- SEFAZ": "motivos_rejeicao_sefaz",
  "RI- ENTRADA INTERFACE":   "ri_entrada_interface",
  "RI- NUMERO RI":           "ri_numero",
  "DT COMPLETE RI":          "dt_complete_ri",
  "INV- ENTRADA ITEM":       "inv_entrada_item",
  "INV- STATUS":             "inv_status",
  "GL- DATA":                "gl_data",
  "STATUS DADOS BANCARIOS":  "status_dados_bancarios",
  "DT DISPONIVEL AP":        "dt_disponivel_ap",
  "STATUS PAGAMENTO":        "status_pagamento",
  "DATA PAGAMENTO":          "data_pagamento",
  "VALOR NOTA PAGO":         "valor_nota_pago",
  "BANCO-AGENCIA PF":        "banco_agencia_pf",
  "PAGTO":                   "pagto",
  "FILIAL":                  "filial",
  "DATA EMISSÃO NF":         "data_emissao_nf",
};

// Normaliza o nome do cabeçalho pra tolerar acento, espaço duplo e caixa.
// O relatório é gerado pelo Oracle e o cabeçalho varia de export pra export.
function chaveNormalizada(s) {
  return String(s || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

const COLUNAS_AP_NORM = Object.fromEntries(
  Object.entries(COLUNAS_AP).map(([origem, destino]) => [chaveNormalizada(origem), destino])
);

// Valores que o Oracle usa como "vazio".
function limpar(valor) {
  if (valor == null) return null;
  const s = String(valor).trim();
  if (s === "" || s === "-" || s === "- " || s === " - ") return null;
  return s;
}

// Lê a planilha e mostra o que será importado, ANTES de gravar.
export async function previewRelatorioAP(file) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!linhas.length) throw new Error("A planilha está vazia.");

  const cabecalho = Object.keys(linhas[0]).map(chaveNormalizada);
  const esperadas = Object.keys(COLUNAS_AP_NORM);
  const faltando = esperadas.filter(c => !cabecalho.includes(c));
  const naoMapeadas = cabecalho.filter(c => !esperadas.includes(c) && c);

  const comPo = linhas.filter(l => {
    const chave = Object.keys(l).find(k => chaveNormalizada(k) === "PO- GERADA");
    return chave && limpar(l[chave]);
  }).length;

  return {
    totalLinhas: linhas.length,
    comPo,
    semPo: linhas.length - comPo,
    faltando,
    naoMapeadas,
  };
}

export async function uploadRelatorioAP(file, userId, userNome, onProgress) {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const linhas = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
  if (!linhas.length) throw new Error("A planilha está vazia.");

  // Mapeia o cabeçalho real do arquivo para as colunas da tabela.
  const mapa = {};
  for (const cabecalho of Object.keys(linhas[0])) {
    const destino = COLUNAS_AP_NORM[chaveNormalizada(cabecalho)];
    if (destino) mapa[cabecalho] = destino;
  }
  if (!Object.values(mapa).includes("po_gerada")) {
    throw new Error('A planilha não tem a coluna "PO- GERADA" — sem ela não há como casar com o voucher do Gaia.');
  }

  const registros = [];
  let semPo = 0;
  for (const row of linhas) {
    const r = { importado_por: userId };
    for (const [origem, destino] of Object.entries(mapa)) {
      r[destino] = limpar(row[origem]);
    }
    if (!r.po_gerada) { semPo++; continue; } // sem PO não casa com nada
    registros.push(r);
  }
  if (!registros.length) throw new Error("Nenhuma linha com PO- GERADA preenchida.");

  // Insere em blocos de 500. Acumula histórico — nunca apaga importação anterior.
  const BLOCO = 500;
  let inseridas = 0;
  for (let i = 0; i < registros.length; i += BLOCO) {
    const bloco = registros.slice(i, i + BLOCO);
    const { error } = await supabase.from("entrada_oracle_ap").insert(bloco);
    if (error) throw new Error(`Erro ao gravar o bloco ${i / BLOCO + 1}: ${error.message}`);
    inseridas += bloco.length;
    if (onProgress) {
      onProgress({
        fase: "relatório AP",
        pct: Math.round((inseridas / registros.length) * 100),
      });
    }
  }

  const vouchers = new Set(registros.map(r => r.po_gerada));

  return {
    inseridas,
    semPo,
    totalLinhas: linhas.length,
    vouchers: vouchers.size,
    importadoPor: userNome || null,
    importadoEm: new Date().toISOString(),
  };
}

// ══════════════════════════════════════════════════════════
// TELA — ENTRADA NO ORACLE
// Cruza a triagem (status "Aguardando oracle") com o relatório AP
// pela chave voucher = PO- GERADA, e aplica o de/para de grade.
// ══════════════════════════════════════════════════════════

const STATUS_AGUARDANDO = "Aguardando oracle";
const STATUS_CONFIRMADO = "Produto disponível";
const BLOCO_IDS = 200;

// Pega o primeiro valor não vazio entre várias chaves possíveis.
// A assurant_triagem tem nomes de coluna que variam por origem de carga.
function campo(obj, ...chaves) {
  for (const k of chaves) {
    const v = obj?.[k];
    if (v != null && String(v).trim() !== "") return v;
  }
  return null;
}

export async function listarAguardandoOracle() {
  // 1. Itens do Gaia aguardando Oracle. select("*") de propósito: a triagem tem
  //    dezenas de colunas e nomes que variam, e são poucas centenas de linhas.
  const { data: triagem, error: errT } = await supabase
    .from("assurant_triagem")
    .select("*")
    .eq("status_atual", STATUS_AGUARDANDO);
  if (errT) throw new Error(errT.message);
  if (!triagem?.length) return [];

  // 2. Dedupe por IMEI, mantendo a passagem mais recente.
  const porImei = new Map();
  for (const t of triagem) {
    const atual = porImei.get(t.imei);
    if (!atual || new Date(t.criado_em) > new Date(atual.criado_em)) {
      porImei.set(t.imei, t);
    }
  }
  const itens = [...porImei.values()];

  // 3. Busca o relatório AP dos vouchers em jogo, em blocos de 200
  //    (lista grande em .in() estoura a URL em silêncio).
  const vouchers = [...new Set(itens.map(i => i.voucher).filter(Boolean))];
  const apPorPo = new Map();
  for (let i = 0; i < vouchers.length; i += BLOCO_IDS) {
    const { data: ap, error: errAp } = await supabase
      .from("entrada_oracle_ap")
      .select("po_gerada, cpf_cnpj, nome, ri_numero, nota_gerada, po_status, importado_em")
      .in("po_gerada", vouchers.slice(i, i + BLOCO_IDS));
    if (errAp) throw new Error(errAp.message);
    // Fica com a versão MAIS RECENTE de cada PO — é isso que faz o
    // "Pendente RI" se resolver sozinho quando chega um download novo.
    for (const r of (ap || [])) {
      const atual = apPorPo.get(r.po_gerada);
      if (!atual || new Date(r.importado_em) > new Date(atual.importado_em)) {
        apPorPo.set(r.po_gerada, r);
      }
    }
  }

  // 4. Monta a linha da tela.
  return itens.map(t => {
    const ap = apPorPo.get(t.voucher) || null;
    const grade = campo(t, "grade", "grade_cosmetica", "grade_final");
    const bateria = campo(t, "status_bateria");
    return {
      id:            t.id,
      imei:          t.imei,
      voucher:       t.voucher,
      sku:           campo(t, "sku", "cod_item"),
      produto:       campo(t, "produto", "modelo", "descricao"),
      grade,
      statusBateria: bateria,
      gradeOracle:   gradeParaOracle(grade, bateria),
      rebaixado:     rebaixadoPorBateria(grade, bateria),
      local:         campo(t, "local"),
      documento:     ap?.cpf_cnpj  || null,
      nomeCliente:   ap?.nome      || null,
      ri:            ap?.ri_numero || null,
      nf:            ap?.nota_gerada || null,
      poStatus:      ap?.po_status || null,
      temMatchAp:    !!ap,
      pendenteRi:    !ap || !ap.ri_numero,
    };
  });
}

// Lista o histórico do que já foi confirmado no Oracle. Mesmo cruzamento com o
// relatório AP, mais quem confirmou e quando.
export async function listarConfirmadosOracle({ limite = 1000 } = {}) {
  const { data: triagem, error: errT } = await supabase
    .from("assurant_triagem")
    .select("*")
    .not("oracle_confirmado_em", "is", null)
    .order("oracle_confirmado_em", { ascending: false })
    .limit(limite);
  if (errT) throw new Error(errT.message);
  if (!triagem?.length) return [];

  // Dedupe por IMEI, mantendo a confirmação mais recente.
  const porImei = new Map();
  for (const t of triagem) {
    const atual = porImei.get(t.imei);
    if (!atual || new Date(t.oracle_confirmado_em) > new Date(atual.oracle_confirmado_em)) {
      porImei.set(t.imei, t);
    }
  }
  const itens = [...porImei.values()];

  // Relatório AP dos vouchers em jogo (versão mais recente de cada PO).
  const vouchers = [...new Set(itens.map(i => i.voucher).filter(Boolean))];
  const apPorPo = new Map();
  for (let i = 0; i < vouchers.length; i += BLOCO_IDS) {
    const { data: ap, error: errAp } = await supabase
      .from("entrada_oracle_ap")
      .select("po_gerada, cpf_cnpj, ri_numero, nota_gerada, po_status, importado_em")
      .in("po_gerada", vouchers.slice(i, i + BLOCO_IDS));
    if (errAp) throw new Error(errAp.message);
    for (const r of (ap || [])) {
      const atual = apPorPo.get(r.po_gerada);
      if (!atual || new Date(r.importado_em) > new Date(atual.importado_em)) {
        apPorPo.set(r.po_gerada, r);
      }
    }
  }

  // Nome de quem confirmou (a triagem guarda só o uuid).
  const userIds = [...new Set(itens.map(i => i.oracle_confirmado_por).filter(Boolean))];
  const nomes = new Map();
  if (userIds.length) {
    const { data: perfis } = await supabase
      .from("user_profiles").select("id, nome").in("id", userIds);
    (perfis || []).forEach(p => nomes.set(p.id, p.nome));
  }

  return itens.map(t => {
    const ap = apPorPo.get(t.voucher) || null;
    const grade = campo(t, "grade", "grade_cosmetica", "grade_final");
    const bateria = campo(t, "status_bateria");
    return {
      id:            t.id,
      imei:          t.imei,
      voucher:       t.voucher,
      sku:           campo(t, "sku", "cod_item"),
      produto:       campo(t, "produto", "modelo", "descricao"),
      grade,
      statusBateria: bateria,
      gradeOracle:   gradeParaOracle(grade, bateria),
      rebaixado:     rebaixadoPorBateria(grade, bateria),
      local:         campo(t, "local"),
      documento:     ap?.cpf_cnpj    || null,
      ri:            ap?.ri_numero   || null,
      nf:            ap?.nota_gerada || null,
      poStatus:      ap?.po_status   || null,
      pendenteRi:    !ap || !ap.ri_numero,
      confirmadoEm:  t.oracle_confirmado_em,
      confirmadoPor: nomes.get(t.oracle_confirmado_por) || null,
      statusAtual:   t.status_atual,
    };
  });
}

// Confirma a entrada no Oracle: o item vira "Produto disponível" — ou seja,
// passa a ser sugerível pelo FIFO — e grava data/quem confirmou.
export async function confirmarOracle(imeis, userId) {
  const lista = [...new Set((imeis || []).filter(Boolean))];
  if (!lista.length) return { ok: false, erro: "Nenhum item selecionado." };

  const agora = new Date().toISOString();
  let confirmados = 0;

  for (let i = 0; i < lista.length; i += BLOCO_IDS) {
    const bloco = lista.slice(i, i + BLOCO_IDS);
    const { data, error } = await supabase
      .from("assurant_triagem")
      .update({
        status_atual:          STATUS_CONFIRMADO,
        oracle_confirmado_em:  agora,
        oracle_confirmado_por: userId,
      })
      .in("imei", bloco)
      .eq("status_atual", STATUS_AGUARDANDO) // trava: só muda quem ainda está aguardando
      .select("imei");
    if (error) throw new Error(error.message);
    confirmados += (data || []).length;
  }

  return { ok: true, confirmados, solicitados: lista.length, confirmadoEm: agora };
}