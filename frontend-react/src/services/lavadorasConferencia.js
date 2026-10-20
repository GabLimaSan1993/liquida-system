export const TIPOS_LAVADORAS = ["Lavadora", "Secadora", "Lava e Seca", "Lava Louças"];
export const TENSOES_LAVADORAS = ["127V", "220V"];
export const CORES_LAVADORAS = ["Branco", "Grafite", "Preto", "Inox", "Off-White"];
export const CATEGORIAS_LAVADORAS = [
  "Lavadora", "LAVADORA", "Lavadoras", "Lava e Seca", "LAVA E SECA",
  "Secadora", "SECADORA", "SECADORA DE ROUPA", "Secadora de roupa",
  "Lava Louças", "Lava Louça", "LAVA LOUÇAS", "LAVA LOUÇA", "LAVA LOUCAS", "Lava-louças",
];

export function normalizarConferencia(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toLocaleLowerCase("pt-BR").replace(/[\s_-]+/g, " ");
}

export function identificarTipoLavadora(valor) {
  const texto = normalizarConferencia(valor);
  if (/^lava(?:dora)?\s+e\s+seca\b/.test(texto)) return "Lava e Seca";
  if (/^lava\s*loucas?\b/.test(texto)) return "Lava Louças";
  if (/^secadora\b/.test(texto)) return "Secadora";
  if (/^lavadoras?\b/.test(texto)) return "Lavadora";
  return "";
}

export function duracaoTesteLavadora(tipo) {
  const duracoes = { Lavadora: 25 * 60, Secadora: 30 * 60, "Lava e Seca": 74 * 60, "Lava Louças": 30 * 60 };
  return duracoes[identificarTipoLavadora(tipo)] || 25 * 60;
}

export function normalizarCampoConferencia(campo, valor) {
  const texto = normalizarConferencia(valor);
  if (campo === "tipo") return normalizarConferencia(identificarTipoLavadora(valor) || valor);
  if (campo === "tensao") {
    const tensao = texto.replace(/\s/g, "");
    if (["110", "110v", "127", "127v"].includes(tensao)) return "127v";
    if (["220", "220v"].includes(tensao)) return "220v";
  }
  if (campo === "cor") {
    if (["branca", "branco"].includes(texto)) return "branco";
    if (["preta", "preto"].includes(texto)) return "preto";
    if (["inox look", "inox"].includes(texto)) return "inox";
  }
  if (campo === "capacidade") return texto.replace(/\s/g, "").replace(",", ".");
  return texto;
}

export function valoresConferenciaIguais(campo, esperado, fisico) {
  return Boolean(String(esperado || "").trim() && String(fisico || "").trim()) &&
    normalizarCampoConferencia(campo, esperado) === normalizarCampoConferencia(campo, fisico);
}

export function produtoImportado(os) {
  return String(os?.observacoes_logistica || "").match(/(?:^|\|)\s*Produto:\s*([^|]+)/i)?.[1]?.trim() || "";
}

export function tipoReferenciaLavadora(os, referencia) {
  const descrito = identificarTipoLavadora(referencia?.descricao) || identificarTipoLavadora(produtoImportado(os));
  if (descrito) return descrito;
  const categoria = identificarTipoLavadora(os?.categoria);
  // A categoria histórica Lavadora também agrupa Lava e Seca: a conferência identifica o subtipo.
  return categoria === "Lavadora" ? "" : categoria;
}

export function dadosHistoricosOs(os) {
  const descricao = produtoImportado(os);
  return {
    marca: os.marca, modelo: os.modelo,
    capacidade: descricao.match(/\b\d+(?:[.,]\d+)?\s*(?:KG|SERVI[CÇ]OS)\b/i)?.[0] || "",
  };
}

export function sugestoesConferencia(historico, campo, { marca = "", modelo = "" } = {}) {
  if (campo === "modelo" && !marca.trim()) return [];
  if (campo === "capacidade" && (!marca.trim() || !modelo.trim())) return [];
  const unicos = new Map();
  for (const item of historico) {
    if (campo !== "marca" && !valoresConferenciaIguais("marca", item.marca, marca)) continue;
    if (campo === "capacidade" && !valoresConferenciaIguais("modelo", item.modelo, modelo)) continue;
    const valor = String(item[campo] || "").trim();
    const chave = normalizarCampoConferencia(campo, valor);
    if (valor && !unicos.has(chave)) unicos.set(chave, valor);
  }
  return [...unicos.values()].sort((a, b) => a.localeCompare(b, "pt-BR", { numeric: true }));
}

export function atualizarConferencia(atual, campo, valor) {
  return {
    ...atual, [campo]: valor,
    ...(campo === "marca" && !valoresConferenciaIguais("marca", atual.marca, valor) ? { modelo: "", capacidade: "" } : {}),
    ...(campo === "modelo" && !valoresConferenciaIguais("modelo", atual.modelo, valor) ? { capacidade: "" } : {}),
  };
}
