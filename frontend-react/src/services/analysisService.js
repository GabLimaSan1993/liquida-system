import { supabase } from "../lib/supabase";

const MONTH_LABELS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeText(value) {
  return String(value || "").trim().toUpperCase();
}

function formatFornecedor(value) {
  const text = String(value || "").trim();
  return text || "SEM FORNECEDOR";
}

function formatLote(value) {
  const text = String(value || "").trim();
  return text || "SEM LOTE";
}

function formatEtapa(value) {
  const text = String(value || "").trim();
  return text || "SEM ETAPA";
}

function getDateRef(row) {
  return row.dt_ref || null;
}

async function fetchAllRows(tableName, columns) {
  const pageSize = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await supabase
      .from(tableName)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) {
      throw error;
    }

    const safeData = data || [];
    allRows = allRows.concat(safeData);

    if (safeData.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return allRows;
}

export async function fetchAnalysisRows() {
  return fetchAllRows(
    "aging_entrada_cache",
    [
      "id",
      "num_os",
      "num_nf",
      "operacao",
      "marca",
      "categoria_produto",
      "tipo_prod",
      "etapa",
      "etapa_analise",
      "modelo",
      "descricao_produto",
      "id_lote",
      "serial_out",
      "imei",
      "custo_net",
      "item_disponivel_venda",
      "status_os",
      "item_vendido",
      "pmv_venda",
      "mc_rentabilidade",
      "dt_ref",
      "ano_ref",
      "mes_ref",
      "semana_ref",
      "fornecedor_original",
    ].join(",")
  );
}

export function buildAnalysisFilterOptions(rows) {
  const uniqueSorted = (mapper, sortMode = "text") =>
    Array.from(
      new Set(
        rows
          .map(mapper)
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
      )
    ).sort((a, b) => {
      if (sortMode === "number") return Number(a) - Number(b);
      return String(a).localeCompare(String(b), "pt-BR");
    });

  return {
    fornecedores: uniqueSorted((row) => formatFornecedor(row.fornecedor_original)),
    anos: uniqueSorted((row) => row.ano_ref, "number"),
    meses: uniqueSorted((row) => row.mes_ref, "number"),
    semanas: uniqueSorted((row) => row.semana_ref, "number"),
  };
}

export function applyAnalysisFilters(rows, filters) {
  return rows.filter((row) => {
    if (
      filters.fornecedor &&
      normalizeText(formatFornecedor(row.fornecedor_original)) !==
        normalizeText(filters.fornecedor)
    ) {
      return false;
    }

    if (filters.ano && Number(row.ano_ref) !== Number(filters.ano)) {
      return false;
    }

    if (filters.mes && Number(row.mes_ref) !== Number(filters.mes)) {
      return false;
    }

    if (filters.semana && Number(row.semana_ref) !== Number(filters.semana)) {
      return false;
    }

    if (filters.dataInicio) {
      const rowDate = getDateRef(row);
      if (!rowDate || rowDate < filters.dataInicio) return false;
    }

    if (filters.dataFim) {
      const rowDate = getDateRef(row);
      if (!rowDate || rowDate > filters.dataFim) return false;
    }

    return true;
  });
}

export function buildOverview(rows) {
  const fornecedores = new Set();
  const lotes = new Set();
  const osSet = new Set();

  let vendidos = 0;
  let disponiveis = 0;
  let emProcesso = 0;
  let valorEntrada = 0;
  let valorVenda = 0;

  rows.forEach((row) => {
    fornecedores.add(formatFornecedor(row.fornecedor_original));
    lotes.add(formatLote(row.id_lote));
    if (row.num_os) osSet.add(String(row.num_os).trim());

    const etapa = formatEtapa(row.etapa_analise);

    if (normalizeText(etapa) === "VENDIDO") {
      vendidos += 1;
    } else if (row.item_disponivel_venda) {
      disponiveis += 1;
    } else {
      emProcesso += 1;
    }

    valorEntrada += toNumber(row.custo_net);
    valorVenda += toNumber(row.pmv_venda);
  });

  return {
    totalFornecedores: fornecedores.size,
    totalLotes: lotes.size,
    totalOs: osSet.size,
    vendidos,
    disponiveis,
    emProcesso,
    valorEntrada,
    valorVenda,
    ticketMedioVenda: osSet.size ? valorVenda / osSet.size : 0,
  };
}

export function buildSupplierRows(rows) {
  const map = new Map();

  rows.forEach((row) => {
    const fornecedor = formatFornecedor(row.fornecedor_original);

    if (!map.has(fornecedor)) {
      map.set(fornecedor, {
        fornecedor,
        lotesSet: new Set(),
        osSet: new Set(),
        vendidos: 0,
        disponiveis: 0,
        emProcesso: 0,
        valorEntrada: 0,
        valorVenda: 0,
      });
    }

    const item = map.get(fornecedor);

    item.lotesSet.add(formatLote(row.id_lote));
    if (row.num_os) item.osSet.add(String(row.num_os).trim());

    const etapa = formatEtapa(row.etapa_analise);

    if (normalizeText(etapa) === "VENDIDO") {
      item.vendidos += 1;
    } else if (row.item_disponivel_venda) {
      item.disponiveis += 1;
    } else {
      item.emProcesso += 1;
    }

    item.valorEntrada += toNumber(row.custo_net);
    item.valorVenda += toNumber(row.pmv_venda);
  });

  return Array.from(map.values())
    .map((item) => ({
      fornecedor: item.fornecedor,
      lotes: item.lotesSet.size,
      os: item.osSet.size,
      vendidos: item.vendidos,
      disponiveis: item.disponiveis,
      emProcesso: item.emProcesso,
      valorEntrada: item.valorEntrada,
      valorVenda: item.valorVenda,
      ticketMedioVenda: item.osSet.size ? item.valorVenda / item.osSet.size : 0,
    }))
    .sort((a, b) => b.valorEntrada - a.valorEntrada);
}

export function buildLotRows(rows, fornecedorSelecionado) {
  const base = fornecedorSelecionado
    ? rows.filter(
        (row) =>
          normalizeText(formatFornecedor(row.fornecedor_original)) ===
          normalizeText(fornecedorSelecionado)
      )
    : rows;

  const map = new Map();

  base.forEach((row) => {
    const lote = formatLote(row.id_lote);

    if (!map.has(lote)) {
      map.set(lote, {
        lote,
        osSet: new Set(),
        vendidos: 0,
        disponiveis: 0,
        emProcesso: 0,
        valorEntrada: 0,
        valorVenda: 0,
      });
    }

    const item = map.get(lote);

    if (row.num_os) item.osSet.add(String(row.num_os).trim());

    const etapa = formatEtapa(row.etapa_analise);

    if (normalizeText(etapa) === "VENDIDO") {
      item.vendidos += 1;
    } else if (row.item_disponivel_venda) {
      item.disponiveis += 1;
    } else {
      item.emProcesso += 1;
    }

    item.valorEntrada += toNumber(row.custo_net);
    item.valorVenda += toNumber(row.pmv_venda);
  });

  return Array.from(map.values())
    .map((item) => ({
      lote: item.lote,
      os: item.osSet.size,
      vendidos: item.vendidos,
      disponiveis: item.disponiveis,
      emProcesso: item.emProcesso,
      valorEntrada: item.valorEntrada,
      valorVenda: item.valorVenda,
      ticketMedioVenda: item.osSet.size ? item.valorVenda / item.osSet.size : 0,
    }))
    .sort((a, b) => b.valorEntrada - a.valorEntrada);
}

export function buildEtapaRows(rows, fornecedorSelecionado, loteSelecionado) {
  const base = rows.filter((row) => {
    const sameFornecedor = fornecedorSelecionado
      ? normalizeText(formatFornecedor(row.fornecedor_original)) ===
        normalizeText(fornecedorSelecionado)
      : true;

    const sameLote = loteSelecionado
      ? normalizeText(formatLote(row.id_lote)) === normalizeText(loteSelecionado)
      : true;

    return sameFornecedor && sameLote;
  });

  const map = new Map();

  base.forEach((row) => {
    const etapa = formatEtapa(row.etapa_analise);

    if (!map.has(etapa)) {
      map.set(etapa, {
        etapa,
        osSet: new Set(),
        vendidos: 0,
        disponiveis: 0,
        emProcesso: 0,
        valorEntrada: 0,
        valorVenda: 0,
      });
    }

    const item = map.get(etapa);

    if (row.num_os) item.osSet.add(String(row.num_os).trim());

    if (normalizeText(etapa) === "VENDIDO") {
      item.vendidos += 1;
    } else if (row.item_disponivel_venda) {
      item.disponiveis += 1;
    } else {
      item.emProcesso += 1;
    }

    item.valorEntrada += toNumber(row.custo_net);
    item.valorVenda += toNumber(row.pmv_venda);
  });

  return Array.from(map.values())
    .map((item) => ({
      etapa: item.etapa,
      os: item.osSet.size,
      vendidos: item.vendidos,
      disponiveis: item.disponiveis,
      emProcesso: item.emProcesso,
      valorEntrada: item.valorEntrada,
      valorVenda: item.valorVenda,
      ticketMedioVenda: item.osSet.size ? item.valorVenda / item.osSet.size : 0,
    }))
    .sort((a, b) => b.valorEntrada - a.valorEntrada);
}

export function buildOsRows(rows, fornecedorSelecionado, loteSelecionado, etapaSelecionada) {
  return rows
    .filter((row) => {
      const sameFornecedor = fornecedorSelecionado
        ? normalizeText(formatFornecedor(row.fornecedor_original)) ===
          normalizeText(fornecedorSelecionado)
        : true;

      const sameLote = loteSelecionado
        ? normalizeText(formatLote(row.id_lote)) === normalizeText(loteSelecionado)
        : true;

      const sameEtapa = etapaSelecionada
        ? normalizeText(formatEtapa(row.etapa_analise)) === normalizeText(etapaSelecionada)
        : true;

      return sameFornecedor && sameLote && sameEtapa;
    })
    .map((row) => ({
      numOs: row.num_os || "",
      etapa: formatEtapa(row.etapa_analise),
      etapaOriginal: formatEtapa(row.etapa),
      categoriaProduto: row.categoria_produto || "",
      tipoProd: row.tipo_prod || "",
      marca: row.marca || "",
      modelo: row.modelo || "",
      descricaoProduto: row.descricao_produto || "",
      serialOut: row.serial_out || "",
      imei: row.imei || "",
      custoNet: toNumber(row.custo_net),
      pmvVenda: toNumber(row.pmv_venda),
      mcRentabilidade:
        row.mc_rentabilidade === null || row.mc_rentabilidade === undefined
          ? null
          : Number(row.mc_rentabilidade),
      dtRef: getDateRef(row),
    }))
    .sort((a, b) => String(a.numOs).localeCompare(String(b.numOs), "pt-BR"));
}

export function buildTimelineSeries(rows, selectedYear) {
  const base = selectedYear
    ? rows.filter((row) => Number(row.ano_ref) === Number(selectedYear))
    : rows;

  const chartRows = MONTH_LABELS.map((label, index) => {
    const monthNumber = index + 1;
    const monthRows = base.filter((row) => Number(row.mes_ref) === Number(monthNumber));

    const vendidos = monthRows.filter(
      (row) => normalizeText(formatEtapa(row.etapa_analise)) === "VENDIDO"
    ).length;

    const disponiveis = monthRows.filter(
      (row) =>
        normalizeText(formatEtapa(row.etapa_analise)) !== "VENDIDO" &&
        row.item_disponivel_venda
    ).length;

    const emProcesso = monthRows.filter(
      (row) =>
        normalizeText(formatEtapa(row.etapa_analise)) !== "VENDIDO" &&
        !row.item_disponivel_venda
    ).length;

    return {
      periodo: label,
      vendidos,
      disponiveis,
      emProcesso,
    };
  });

  return chartRows;
}