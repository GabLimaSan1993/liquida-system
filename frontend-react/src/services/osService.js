import { supabase } from "../lib/supabase";

export function getLinhaPrefix(linhaProduto) {
  const linha = String(linhaProduto || "").trim().toUpperCase();

  if (linha.includes("BRANCA")) return "BR";
  if (linha.includes("MARROM")) return "MR";
  if (linha.includes("CELULAR")) return "CL";
  if (linha.includes("DIVERSOS")) return "DV";

  return "OS";
}

export function buildNumeroOs(linhaProduto = "Diversos") {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const randomPart = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
  const prefix = getLinhaPrefix(linhaProduto);

  return `OS-${prefix}-${datePart}-${timePart}-${randomPart}`;
}

export function buildLote(linhaProduto = "Diversos") {
  const now = new Date();

  const datePart = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("");

  const timePart = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");

  const randomPart = String(Math.floor(Math.random() * 9999)).padStart(4, "0");
  const prefix = getLinhaPrefix(linhaProduto);

  return `LOTE-${prefix}-${datePart}-${timePart}-${randomPart}`;
}

function textContent(parent, selector) {
  const node = parent?.querySelector(selector);
  return node?.textContent?.trim() || "";
}

function parseNumber(value) {
  const number = Number(String(value || "").replace(",", "."));
  return Number.isFinite(number) ? number : 0;
}

export async function parseXmlNfe(file) {
  const xmlText = await file.text();
  const parser = new DOMParser();
  const xml = parser.parseFromString(xmlText, "text/xml");

  const parserError = xml.querySelector("parsererror");
  if (parserError) {
    throw new Error("XML inválido ou com estrutura não reconhecida.");
  }

  const infNFe = xml.querySelector("infNFe");
  const ide = xml.querySelector("ide");
  const emit = xml.querySelector("emit");

  const chaveNfeRaw = infNFe?.getAttribute("Id") || "";
  const chave_nfe = chaveNfeRaw.replace(/^NFe/i, "");

  const numero_nf = textContent(ide, "nNF");
  const serie_nf = textContent(ide, "serie");
  const data_emissao =
    textContent(ide, "dhEmi")?.slice(0, 10) ||
    textContent(ide, "dEmi")?.slice(0, 10) ||
    "";

  const fornecedor = textContent(emit, "xNome");
  const fornecedor_cnpj = textContent(emit, "CNPJ");

  const itens = Array.from(xml.querySelectorAll("det")).map((det, index) => {
    const prod = det.querySelector("prod");

    const codigo = textContent(prod, "cProd");
    const descricao = textContent(prod, "xProd");
    const ncm = textContent(prod, "NCM");
    const cfop = textContent(prod, "CFOP");
    const unidade = textContent(prod, "uCom");
    const quantidade = parseNumber(textContent(prod, "qCom"));
    const valor_unitario = parseNumber(textContent(prod, "vUnCom"));
    const valor_total = parseNumber(textContent(prod, "vProd"));

    return {
      index,
      codigo,
      descricao,
      ncm,
      cfop,
      unidade,
      quantidade,
      valor_unitario,
      valor_total,
      label: `${codigo || "SEM CÓDIGO"} - ${descricao || "SEM DESCRIÇÃO"}`,
    };
  });

  if (!numero_nf || !fornecedor || itens.length === 0) {
    throw new Error("Não foi possível localizar fornecedor, número da NF ou itens no XML.");
  }

  return {
    chave_nfe,
    numero_nf,
    serie_nf,
    data_emissao,
    fornecedor,
    fornecedor_cnpj,
    itens,
    xml_file_name: file.name,
  };
}

export async function createOrdemServico(payload) {
  const { data: ordem, error } = await supabase
    .from("ordens_servico")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;

  const agingPayload = {
    unique_key: `${payload.numero_os}|${payload.serial_number || payload.imei || ""}`,
    num_os: payload.numero_os,
    num_nf: payload.numero_nf || null,
    operacao: payload.origem || "Compra",
    marca: payload.marca || null,
    serial_out: payload.serial_number || null,
    imei: payload.imei || null,
    categoria_produto: payload.categoria || null,
    tipo_prod: payload.linha_produto || null,
    etapa: payload.etapa_atual || "Aguardando triagem",
    modelo: payload.modelo || null,
    descricao_produto: payload.descricao_produto || payload.categoria || null,
    dt_abert: payload.dt_entrada || null,
    id_lote: payload.lote || null,
    dt_ult_log: payload.dt_entrada || null,
    desc_ult_log: payload.etapa_atual || "Aguardando triagem",
    desc_atendimento: "OS criada via abertura operacional",
    nome_cliente: payload.fornecedor || null,
    custo_net: payload.valor_entrada || null,
    item_disponivel_venda: false,
    status_os: "Recebido / Aguardando triagem",
  };

  const { error: agingError } = await supabase
    .from("aging_os_operacional")
    .insert(agingPayload);

  if (agingError) {
    throw agingError;
  }

  return ordem;
}