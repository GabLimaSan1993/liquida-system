import Papa from "papaparse";
import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

const AGING_ALLOWED_COLUMNS = [
  "unique_key",
  "num_os",
  "num_nf",
  "operacao",
  "marca",
  "tag",
  "serial_in",
  "serial_out",
  "imei",
  "chave_item",
  "categoria_produto",
  "tipo_prod",
  "etapa",
  "modelo",
  "descricao_produto",
  "part_number_modelo",
  "cor",
  "banda",
  "num_tecnico",
  "nome_tecnico",
  "dt_abert",
  "aging_day",
  "gradeqa_antigo",
  "subgradeqa_antigo",
  "gradelimpeza_antigo",
  "subgradelimpeza_antigo",
  "gradeembalagem_antigo",
  "subgradeembalagem_antigo",
  "grade_funcional",
  "grade_cosmetica",
  "grade_acessorio",
  "id_lote",
  "dt_lote",
  "pallet",
  "sku",
  "observacoes",
  "dt_ult_log",
  "desc_ult_log",
  "local",
  "motivo",
  "desc_atendimento",
  "desc_proc",
  "nome_cliente",
  "os_anterior",
  "dt_enc_os_anterior",
  "servico_os_anterior",
  "tela_trincada",
  "custo_net",
  "serial_number",
  "usuario_ult_log",
  "desc_laudo",
  "problema",
  "subproblema",
  "informacao_scrap",
  "st",
  "ipi",
  "unit_imposto",
  "cliente_origem",
  "item_disponivel_venda",
  "status_os",
];

const AGING_COLUMN_ALIASES = {
  num_OS: "num_os",
  num_NF: "num_nf",
  Marca: "marca",
  Tag: "tag",
  SerialIn: "serial_in",
  SerialOut: "serial_out",
  IMEI: "imei",
  ETAPA: "etapa",
  Modelo: "modelo",
  descricaoProduto: "descricao_produto",
  PartNumberModelo: "part_number_modelo",
  Cor: "cor",
  Banda: "banda",
  numTecnico: "num_tecnico",
  NomeTecnico: "nome_tecnico",
  Dt_Abert: "dt_abert",
  Aging_Day: "aging_day",
  gradeQa_ANTIGO: "gradeqa_antigo",
  subgradeQA_ANTIGO: "subgradeqa_antigo",
  gradeLimpeza_ANTIGO: "gradelimpeza_antigo",
  subGradeLimpeza_ANTIGO: "subgradelimpeza_antigo",
  gradeEmbalagem_ANTIGO: "gradeembalagem_antigo",
  subGradeEmbalagem_ANTIGO: "subgradeembalagem_antigo",
  GradeFuncional: "grade_funcional",
  GradeCosmetica: "grade_cosmetica",
  GradeAcessorio: "grade_acessorio",
  idLote: "id_lote",
  dtLote: "dt_lote",
  Pallet: "pallet",
  SKU: "sku",
  OBSERVACOES: "observacoes",
  dtUltLog: "dt_ult_log",
  descUltLog: "desc_ult_log",
  descAtendimento: "desc_atendimento",
  descProc: "desc_proc",
  nome_cliente: "nome_cliente",
  osAnterior: "os_anterior",
  dtEncOsAnterior: "dt_enc_os_anterior",
  servicoOsAnterior: "servico_os_anterior",
  telaTrincada: "tela_trincada",
  Custo_Net: "custo_net",
  serialNumber: "serial_number",
  UsuarioUltLog: "usuario_ult_log",
  descLaudo: "desc_laudo",
  clienteOrigem: "cliente_origem",
  ST: "st",
  IPI: "ipi",
  UnitImposto: "unit_imposto",
};

const FATURAMENTO_ALLOWED_COLUMNS = [
  "file_name",
  "file_hash",
  "row_hash",
  "unique_key",
  "data_emissao",
  "numero_nf",
  "cliente",
  "telefone",
  "sku",
  "grade",
  "descricao",
  "serial",
  "valor_produto",
  "valor_vendido",
  "garantia_estendida",
  "valor_garantia_estendida",
  "valor_final",
  "devolvido",
  "fornecedor",
  "lote",
  "custo",
  "cidade_cliente",
  "cidade_empresa",
  "cnpj_empresa",
  "marca",
  "natureza_operacao",
  "pagamento",
  "qtde",
  "categoria",
  "sub_categoria",
  "vendedor",
  "caixa",
  "split",
  "resumo_marca",
  "fornecedor_xpcell",
  "resumo_fornecedor",
  "resumo_sub_cat",
  "operacao",
  "semana",
  "dia_semana",
  "mkup",
  "vendedor_correto",
  "fornecedor_correto",
  "sn_correto",
  "local_operacao",
  "pmv",
  "estado",
  "tipo",
  "mc",
  "cmv",
  "fornecedor_corr",
];

const FATURAMENTO_COLUMN_ALIASES = {
  "DATA DE EMISSAO": "data_emissao",
  "NUMERO DE NF": "numero_nf",
  CLIENTE: "cliente",
  TELEFONE: "telefone",
  SKU: "sku",
  GRADE: "grade",
  DESCRICAO: "descricao",
  SERIAL: "serial",
  "VALOR DO PRODUTO": "valor_produto",
  "VALOR VENDIDO": "valor_vendido",
  "GARANTIA ESTENDIDA": "garantia_estendida",
  "VALOR GARANTIA ESTENDIDA": "valor_garantia_estendida",
  "VALOR FINAL": "valor_final",
  DEVOLVIDO: "devolvido",
  FORNECEDOR: "fornecedor",
  LOTE: "lote",
  CUSTO: "custo",
  "CIDADE CLIENTE": "cidade_cliente",
  "CIDADE EMPRESA": "cidade_empresa",
  "CNPJ EMPRESA": "cnpj_empresa",
  MARCA: "marca",
  "NATUREZA DA OPERACAO": "natureza_operacao",
  PAGAMENTO: "pagamento",
  QTDE: "qtde",
  CATEGORIA: "categoria",
  "SUB CATEGORIA": "sub_categoria",
  VENDEDOR: "vendedor",
  CAIXA: "caixa",
  SPLIT: "split",
  "RESUMO MARCA": "resumo_marca",
  "FORNECEDOR XPCELL": "fornecedor_xpcell",
  "RESUMO FORNECEDOR": "resumo_fornecedor",
  "RESUMO SUB CAT.": "resumo_sub_cat",
  OPERACAO: "operacao",
  SEMANA: "semana",
  "DIA SEMANA": "dia_semana",
  Mkup: "mkup",
  MKUP: "mkup",
  "VENDEDOR CORRETO": "vendedor_correto",
  "FORNECEDOR CORRETO": "fornecedor_correto",
  "SN CORRETO": "sn_correto",
  "LOCAL OPERACAO": "local_operacao",
  PMV: "pmv",
  ESTADO: "estado",
  TIPO: "tipo",
  MC: "mc",
  CMV: "cmv",
  "FORNECEDOR CORR": "fornecedor_corr",
};

function normalizeIdentifier(value) {
  if (value === null || value === undefined || value === "") return null;
  const text = String(value).trim();
  return text === "" || text.toLowerCase() === "nan" ? null : text;
}

function isValidYear(year) {
  return year >= 2000 && year <= 2100;
}

function excelSerialToIso(serial) {
  const value = Number(serial);
  if (!Number.isFinite(value)) return null;
  if (value < 1 || value > 80000) return null;
  const excelEpoch = new Date(Date.UTC(1899, 11, 30));
  const millis = Math.round(value * 24 * 60 * 60 * 1000);
  const date = new Date(excelEpoch.getTime() + millis);
  if (!isValidYear(date.getUTCFullYear())) return null;
  return date.toISOString();
}

function parseDateMaybe(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isValidYear(value.getUTCFullYear()) ? value.toISOString() : null;
  }
  if (typeof value === "number") return excelSerialToIso(value);
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serialIso = excelSerialToIso(Number(text));
    if (serialIso) return serialIso;
  }
  const br = text.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (br) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = br;
    const year = Number(yyyy);
    if (!isValidYear(year)) return null;
    const iso = `${yyyy}-${mm}-${dd}T${hh}:${mi}:${ss}Z`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime()) && isValidYear(parsed.getUTCFullYear())) return parsed.toISOString();
    return null;
  }
  const parsedIso = new Date(text);
  if (!Number.isNaN(parsedIso.getTime()) && isValidYear(parsedIso.getUTCFullYear())) return parsedIso.toISOString();
  return null;
}

function parseDateOnly(value) {
  const iso = parseDateMaybe(value);
  return iso ? iso.slice(0, 10) : null;
}

function parseNumberBr(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value).trim().replace(/\s/g, "");
  if (!text) return null;
  const hasComma = text.includes(",");
  const hasDot = text.includes(".");
  if (hasComma && hasDot) {
    if (text.lastIndexOf(",") > text.lastIndexOf(".")) {
      const n = Number(text.replace(/\./g, "").replace(",", "."));
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(text.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  if (hasComma && !hasDot) {
    const n = Number(text.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  if (hasDot && !hasComma) {
    const parts = text.split(".");
    if (parts.length === 2 && parts[1].length !== 3) {
      const n = Number(text);
      return Number.isFinite(n) ? n : null;
    }
    const n = Number(text.replace(/\./g, ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function isEncerrado(row) {
  const joined = `${row.etapa || ""} | ${row.desc_ult_log || ""} | ${row.desc_proc || ""}`.toUpperCase();
  const palavras = ["ENCERRADO","ENCERRADA","FINALIZADO","FINALIZADA","FECHADO","FECHADA","CONCLUIDO","CONCLUÍDO","CONCLUIDA","CONCLUÍDA","DISPONIVEL","DISPONÍVEL","LIBERADO","LIBERADA"];
  return palavras.some((p) => joined.includes(p));
}

function buildAgingUniqueKey(row) {
  return `${row.num_os || ""}|${row.chave_item || ""}|${row.dt_ult_log || ""}`;
}

async function generateHash(text) {
  if (!window.crypto?.subtle) return text;
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function generateFileHash(file) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const sample = bytes.slice(0, Math.min(bytes.length, 1024 * 1024));
  const text = `${file.name}|${file.size}|${sample.length}|${Array.from(sample).join(",")}`;
  return generateHash(text);
}

async function readFileToRows(file) {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith(".csv")) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "utf-8",
        complete: (results) => resolve(results.data || []),
        error: reject,
      });
    });
  }
  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    return XLSX.utils.sheet_to_json(firstSheet, { defval: null, raw: false });
  }
  throw new Error("Formato não suportado. Envie CSV, XLSX ou XLS.");
}

function mapAgingRow(raw) {
  const row = {};
  Object.keys(raw).forEach((key) => {
    const trimmed = String(key).trim();
    if (trimmed.toLowerCase().startsWith("unnamed:")) return;
    const mapped = AGING_COLUMN_ALIASES[trimmed] || trimmed;
    row[mapped] = raw[key];
  });

  const normalized = {
    num_os: normalizeIdentifier(row.num_os),
    num_nf: normalizeIdentifier(row.num_nf),
    operacao: normalizeIdentifier(row.operacao),
    marca: normalizeIdentifier(row.marca),
    tag: normalizeIdentifier(row.tag),
    serial_in: normalizeIdentifier(row.serial_in),
    serial_out: normalizeIdentifier(row.serial_out),
    imei: normalizeIdentifier(row.imei),
    categoria_produto: normalizeIdentifier(row.categoria_produto),
    tipo_prod: normalizeIdentifier(row.tipo_prod),
    etapa: normalizeIdentifier(row.etapa),
    modelo: normalizeIdentifier(row.modelo),
    descricao_produto: normalizeIdentifier(row.descricao_produto),
    part_number_modelo: normalizeIdentifier(row.part_number_modelo),
    cor: normalizeIdentifier(row.cor),
    banda: normalizeIdentifier(row.banda),
    num_tecnico: normalizeIdentifier(row.num_tecnico),
    nome_tecnico: normalizeIdentifier(row.nome_tecnico),
    dt_abert: parseDateMaybe(row.dt_abert),
    gradeqa_antigo: normalizeIdentifier(row.gradeqa_antigo),
    subgradeqa_antigo: normalizeIdentifier(row.subgradeqa_antigo),
    gradelimpeza_antigo: normalizeIdentifier(row.gradelimpeza_antigo),
    subgradelimpeza_antigo: normalizeIdentifier(row.subgradelimpeza_antigo),
    gradeembalagem_antigo: normalizeIdentifier(row.gradeembalagem_antigo),
    subgradeembalagem_antigo: normalizeIdentifier(row.subgradeembalagem_antigo),
    grade_funcional: normalizeIdentifier(row.grade_funcional),
    grade_cosmetica: normalizeIdentifier(row.grade_cosmetica),
    grade_acessorio: normalizeIdentifier(row.grade_acessorio),
    id_lote: normalizeIdentifier(row.id_lote),
    dt_lote: parseDateMaybe(row.dt_lote),
    pallet: normalizeIdentifier(row.pallet),
    sku: normalizeIdentifier(row.sku),
    observacoes: normalizeIdentifier(row.observacoes),
    dt_ult_log: parseDateMaybe(row.dt_ult_log),
    desc_ult_log: normalizeIdentifier(row.desc_ult_log),
    local: normalizeIdentifier(row.local),
    motivo: normalizeIdentifier(row.motivo),
    desc_atendimento: normalizeIdentifier(row.desc_atendimento),
    desc_proc: normalizeIdentifier(row.desc_proc),
    nome_cliente: normalizeIdentifier(row.nome_cliente),
    os_anterior: normalizeIdentifier(row.os_anterior),
    dt_enc_os_anterior: parseDateMaybe(row.dt_enc_os_anterior),
    servico_os_anterior: normalizeIdentifier(row.servico_os_anterior),
    tela_trincada: normalizeIdentifier(row.tela_trincada),
    custo_net: parseNumberBr(row.custo_net),
    serial_number: normalizeIdentifier(row.serial_number),
    usuario_ult_log: normalizeIdentifier(row.usuario_ult_log),
    desc_laudo: normalizeIdentifier(row.desc_laudo),
    problema: normalizeIdentifier(row.problema),
    subproblema: normalizeIdentifier(row.subproblema),
    informacao_scrap: normalizeIdentifier(row.informacao_scrap),
    st: parseNumberBr(row.st),
    ipi: parseNumberBr(row.ipi),
    unit_imposto: parseNumberBr(row.unit_imposto),
    cliente_origem: normalizeIdentifier(row.cliente_origem),
  };

  const aging = parseNumberBr(row.aging_day);
  normalized.aging_day = aging !== null ? Math.trunc(aging) : null;
  normalized.chave_item = normalized.imei || normalized.serial_out || null;
  normalized.item_disponivel_venda = isEncerrado(normalized);
  normalized.status_os = normalized.item_disponivel_venda ? "Encerrado/Disponível para venda" : "Em processo / não disponível";
  normalized.unique_key = buildAgingUniqueKey(normalized);

  const filtered = {};
  AGING_ALLOWED_COLUMNS.forEach((column) => { filtered[column] = normalized[column] ?? null; });
  return filtered;
}

function mapFaturamentoRow(raw) {
  const row = {};
  Object.keys(raw).forEach((key) => {
    const trimmed = String(key).trim();
    if (trimmed.toLowerCase().startsWith("unnamed:")) return;
    const mapped = FATURAMENTO_COLUMN_ALIASES[trimmed] || trimmed;
    row[mapped] = raw[key];
  });

  const normalized = {
    data_emissao: parseDateOnly(row.data_emissao),
    numero_nf: normalizeIdentifier(row.numero_nf),
    cliente: normalizeIdentifier(row.cliente),
    telefone: normalizeIdentifier(row.telefone),
    sku: normalizeIdentifier(row.sku),
    grade: normalizeIdentifier(row.grade),
    descricao: normalizeIdentifier(row.descricao),
    serial: normalizeIdentifier(row.serial),
    valor_produto: parseNumberBr(row.valor_produto),
    valor_vendido: parseNumberBr(row.valor_vendido),
    garantia_estendida: normalizeIdentifier(row.garantia_estendida),
    valor_garantia_estendida: parseNumberBr(row.valor_garantia_estendida),
    valor_final: parseNumberBr(row.valor_final),
    devolvido: normalizeIdentifier(row.devolvido),
    fornecedor: normalizeIdentifier(row.fornecedor),
    lote: normalizeIdentifier(row.lote),
    custo: parseNumberBr(row.custo),
    cidade_cliente: normalizeIdentifier(row.cidade_cliente),
    cidade_empresa: normalizeIdentifier(row.cidade_empresa),
    cnpj_empresa: normalizeIdentifier(row.cnpj_empresa),
    marca: normalizeIdentifier(row.marca),
    natureza_operacao: normalizeIdentifier(row.natureza_operacao),
    pagamento: normalizeIdentifier(row.pagamento),
    qtde: parseNumberBr(row.qtde),
    categoria: normalizeIdentifier(row.categoria),
    sub_categoria: normalizeIdentifier(row.sub_categoria),
    vendedor: normalizeIdentifier(row.vendedor),
    caixa: normalizeIdentifier(row.caixa),
    split: normalizeIdentifier(row.split),
    resumo_marca: normalizeIdentifier(row.resumo_marca),
    fornecedor_xpcell: normalizeIdentifier(row.fornecedor_xpcell),
    resumo_fornecedor: normalizeIdentifier(row.resumo_fornecedor),
    resumo_sub_cat: normalizeIdentifier(row.resumo_sub_cat),
    operacao: normalizeIdentifier(row.operacao),
    semana: normalizeIdentifier(row.semana),
    dia_semana: normalizeIdentifier(row.dia_semana),
    mkup: parseNumberBr(row.mkup),
    vendedor_correto: normalizeIdentifier(row.vendedor_correto),
    fornecedor_correto: normalizeIdentifier(row.fornecedor_correto),
    sn_correto: normalizeIdentifier(row.sn_correto),
    local_operacao: normalizeIdentifier(row.local_operacao),
    pmv: parseNumberBr(row.pmv),
    estado: normalizeIdentifier(row.estado),
    tipo: normalizeIdentifier(row.tipo),
    mc: parseNumberBr(row.mc),
    cmv: parseNumberBr(row.cmv),
    fornecedor_corr: normalizeIdentifier(row.fornecedor_corr),
  };

  const keyParts = [
    normalized.data_emissao || "",
    normalized.numero_nf || "",
    normalized.cliente || "",
    normalized.sku || "",
    normalized.serial || "",
    normalized.sn_correto || "",
    normalized.lote || "",
    normalized.fornecedor_correto || "",
    normalized.fornecedor_corr || "",
    normalized.fornecedor || "",
    normalized.qtde ?? "",
    normalized.valor_final ?? "",
    normalized.custo ?? "",
  ];

  normalized.unique_key = keyParts.join("|");

  const filtered = {};
  FATURAMENTO_ALLOWED_COLUMNS.forEach((column) => { filtered[column] = normalized[column] ?? null; });
  return filtered;
}

async function enrichRowsWithHashes(rows, file) {
  const fileHash = await generateFileHash(file);
  const enriched = [];
  for (const row of rows) {
    const rowHash = await generateHash(JSON.stringify(row));
    enriched.push({ ...row, file_name: file.name, file_hash: fileHash, row_hash: rowHash });
  }
  return enriched;
}

async function insertInBatches(table, records, onProgress) {
  const batchSize = 500;
  let inserted = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from(table).insert(batch);
    if (error) throw error;
    inserted += batch.length;
    if (onProgress) onProgress({ inserted, duplicates: 0, total: records.length });
  }
  return { inserted, duplicates: 0, total: records.length };
}

export async function previewFile(file, type) {
  const rawRows = await readFileToRows(file);
  let mappedRows = [];
  if (type === "aging") {
    mappedRows = rawRows.map(mapAgingRow).filter((row) => row.num_os || row.chave_item || row.modelo);
  } else if (type === "faturamento") {
    mappedRows = rawRows.map(mapFaturamentoRow).filter((row) => row.data_emissao && (row.numero_nf || row.sku || row.cliente));
  } else {
    throw new Error("Tipo de arquivo inválido.");
  }

  if (type === "faturamento") {
    return {
      totalRows: mappedRows.length,
      previewRows: mappedRows.slice(0, 5).map((row) => ({
        unique_key: row.unique_key,
        data_emissao: row.data_emissao,
        numero_nf: row.numero_nf,
        cliente: row.cliente,
        sku: row.sku,
        serial: row.serial,
        sn_correto: row.sn_correto,
        lote: row.lote,
        qtde: row.qtde,
        valor_vendido: row.valor_vendido,
        valor_final: row.valor_final,
        custo: row.custo,
      })),
    };
  }

  return { totalRows: mappedRows.length, previewRows: mappedRows.slice(0, 5) };
}

export async function uploadAgingFile(file, onProgress) {
  const rawRows = await readFileToRows(file);
  const mappedRows = rawRows.map(mapAgingRow).filter((row) => row.num_os || row.chave_item || row.modelo);
  const enrichedRows = await enrichRowsWithHashes(mappedRows, file);
  return insertInBatches("aging_raw", enrichedRows, onProgress);
}

export async function uploadFaturamentoFile(file, onProgress) {
  const rawRows = await readFileToRows(file);
  const mappedRows = rawRows.map(mapFaturamentoRow).filter((row) => row.data_emissao && (row.numero_nf || row.sku || row.cliente));
  const enrichedRows = await enrichRowsWithHashes(mappedRows, file);
  return insertInBatches("faturamento_raw", enrichedRows, onProgress);
}

export async function uploadOfxFile(file, criado_por, onProgress) {
  const text = await file.text();
  const transactions = [];
  const regex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const t = match[1];
    const get = (tag) => {
      const m = t.match(new RegExp(`<${tag}>([^\\n<]+)`));
      return m ? m[1].trim() : null;
    };

    const dtposted = get("DTPOSTED")?.slice(0, 8);
    const trnamt = parseFloat(get("TRNAMT") || "0");
    const memo = get("MEMO");
    const trntype = get("TRNTYPE");

    let data = null;
    if (dtposted && dtposted.length === 8) {
      data = `${dtposted.slice(0, 4)}-${dtposted.slice(4, 6)}-${dtposted.slice(6, 8)}`;
    }

    const credito = trnamt > 0 ? trnamt : null;
    const debito = trnamt < 0 ? Math.abs(trnamt) : null;

    transactions.push({
      data,
      historico: memo,
      credito,
      debito,
      tipo: trntype === "CREDIT" ? "Crédito" : "Débito",
      banco: file.name,
      criado_por,
    });
  }

  if (transactions.length === 0) throw new Error("Nenhuma transação encontrada no OFX.");

  const batchSize = 500;
  let inserted = 0;

  for (let i = 0; i < transactions.length; i += batchSize) {
    const batch = transactions.slice(i, i + batchSize);
    const { error } = await supabase.from("fluxo_caixa_realizado").insert(batch);
    if (error) throw error;
    inserted += batch.length;
    if (onProgress) onProgress({ inserted, total: transactions.length });
  }

  return { inserted, total: transactions.length };
}