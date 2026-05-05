import { supabase } from "../lib/supabase";

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

const MONTH_LABELS = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

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

function normalizeText(value) {
  return String(value || "").trim().toUpperCase();
}

function fixSubcategoria(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const normalized = normalizeText(text);

  const corrections = {
    "ASPIRADOR DE PÃ“": "ASPIRADOR DE PÓ",
    "ASPIRADOR DE PÃ”": "ASPIRADOR DE PÓ",
    "LAVA LOUÃ‡AS": "LAVA LOUÇAS",
    "LAVADORA DE ALTA PRESSÃƒO": "LAVADORA DE ALTA PRESSÃO",
    "PURIFICADOR DE ÃGUA": "PURIFICADOR DE ÁGUA",
    "PURIFICADOR DE Ã�GUA": "PURIFICADOR DE ÁGUA",
  };

  return corrections[normalized] || text;
}

function normalizeRow(row) {
  return {
    ...row,
    sub_categoria: fixSubcategoria(row.sub_categoria),
  };
}

export async function fetchFaturamentoRaw() {
  const rows = await fetchAllRows(
    "vw_faturamento_base_normalizada",
    [
      "id",
      "dt_ref",
      "ano_ref",
      "mes_ref",
      "semana_ref_num",
      "valor_vendido",
      "valor_final",
      "valor_produto",
      "custo",
      "mc",
      "cmv",
      "cliente_original",
      "fornecedor_original",
      "marca_original",
      "categoria",
      "sub_categoria",
      "numero_nf",
      "sku",
      "serial_original",
      "lote_original",
      "tipo",
      "devolvido",
    ].join(",")
  );

  return rows.map(normalizeRow);
}

export function buildFilterOptions(rows) {
  const uniqueSorted = (mapper) =>
    Array.from(
      new Set(
        rows
          .map(mapper)
          .filter((value) => value !== null && value !== undefined && String(value).trim() !== "")
      )
    ).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));

  return {
    years: uniqueSorted((row) => row.ano_ref),
    months: uniqueSorted((row) => row.mes_ref),
    weeks: uniqueSorted((row) => row.semana_ref_num),
    devolvidos: uniqueSorted((row) => row.devolvido),
    fornecedores: uniqueSorted((row) => row.fornecedor_original),
    marcas: uniqueSorted((row) => row.marca_original),
    categorias: uniqueSorted((row) => row.categoria),
    subcategorias: uniqueSorted((row) => row.sub_categoria),
    clientes: uniqueSorted((row) => row.cliente_original),
  };
}

export function applyFaturamentoFilters(rows, filters) {
  return rows.filter((row) => {
    if (normalizeText(row.tipo) !== "CONSIDERAR") return false;

    if (filters.ano && Number(row.ano_ref) !== Number(filters.ano)) return false;
    if (filters.mes && Number(row.mes_ref) !== Number(filters.mes)) return false;
    if (filters.semana && Number(row.semana_ref_num) !== Number(filters.semana)) return false;

    if (filters.devolvido && normalizeText(row.devolvido) !== normalizeText(filters.devolvido)) {
      return false;
    }

    if (
      filters.fornecedor &&
      normalizeText(row.fornecedor_original) !== normalizeText(filters.fornecedor)
    ) {
      return false;
    }

    if (filters.marca && normalizeText(row.marca_original) !== normalizeText(filters.marca)) {
      return false;
    }

    if (filters.categoria && normalizeText(row.categoria) !== normalizeText(filters.categoria)) {
      return false;
    }

    if (
      filters.subcategoria &&
      normalizeText(row.sub_categoria) !== normalizeText(filters.subcategoria)
    ) {
      return false;
    }

    if (filters.cliente && normalizeText(row.cliente_original) !== normalizeText(filters.cliente)) {
      return false;
    }

    return true;
  });
}

export function buildFaturamentoOverview(rows) {
  const totalValorVendido = rows.reduce((acc, row) => acc + toNumber(row.valor_vendido), 0);
  const totalValorFinal = rows.reduce((acc, row) => acc + toNumber(row.valor_final), 0);
  const totalCusto = rows.reduce((acc, row) => acc + toNumber(row.custo), 0);

  const notasSet = new Set();
  const clientesSet = new Set();
  const fornecedoresSet = new Set();

  rows.forEach((row) => {
    if (row.numero_nf) notasSet.add(String(row.numero_nf).trim());
    if (row.cliente_original) clientesSet.add(String(row.cliente_original).trim());
    if (row.fornecedor_original) fornecedoresSet.add(String(row.fornecedor_original).trim());
  });

  return {
    totalValorVendido,
    totalValorFinal,
    totalCusto,
    totalLucro: totalValorFinal - totalCusto,
    totalNotas: notasSet.size,
    totalClientes: clientesSet.size,
    totalFornecedores: fornecedoresSet.size,
    ticketMedio: notasSet.size ? totalValorFinal / totalNotasSize(notasSet) : 0,
  };
}

function totalNotasSize(set) {
  return set.size;
}

export function buildAvailableYears(rows) {
  return Array.from(
    new Set(
      rows
        .map((row) => Number(row.ano_ref))
        .filter((year) => Number.isFinite(year))
    )
  ).sort((a, b) => a - b);
}

export function buildYearCurvesByMonth(rows, selectedYears = []) {
  const availableYears = buildAvailableYears(rows);
  const yearsToUse = selectedYears.length > 0 ? selectedYears : availableYears;

  const chartRows = MONTH_LABELS.map((label, index) => {
    const monthNumber = index + 1;
    const item = {
      periodo: label,
      mes: monthNumber,
    };

    yearsToUse.forEach((year) => {
      const total = rows
        .filter(
          (row) =>
            Number(row.ano_ref) === Number(year) &&
            Number(row.mes_ref) === Number(monthNumber)
        )
        .reduce((acc, row) => acc + toNumber(row.valor_vendido), 0);

      item[String(year)] = total;
    });

    return item;
  });

  return {
    years: yearsToUse,
    chartRows,
  };
}

export function buildMonthCurveByDay(rows, selectedYear) {
  if (!selectedYear) {
    return { months: [], seriesByMonth: [] };
  }

  const filtered = rows.filter((row) => Number(row.ano_ref) === Number(selectedYear));
  const availableMonths = Array.from(
    new Set(
      filtered
        .map((row) => Number(row.mes_ref))
        .filter((month) => Number.isFinite(month))
    )
  ).sort((a, b) => a - b);

  const dayLabels = Array.from({ length: 31 }, (_, index) => index + 1);

  const seriesByMonth = dayLabels.map((day) => {
    const item = { periodo: String(day).padStart(2, "0"), dia: day };

    availableMonths.forEach((month) => {
      const total = filtered
        .filter((row) => {
          const date = row.dt_ref ? new Date(`${row.dt_ref}T00:00:00`) : null;
          if (!date || Number.isNaN(date.getTime())) return false;

          return Number(row.mes_ref) === Number(month) && date.getDate() === day;
        })
        .reduce((acc, row) => acc + toNumber(row.valor_vendido), 0);

      item[MONTH_LABELS[month - 1]] = total;
    });

    return item;
  });

  return {
    months: availableMonths,
    seriesByMonth,
  };
}

export function buildWeekCurveByMonth(rows, selectedYear) {
  if (!selectedYear) {
    return { weeks: [], chartRows: [] };
  }

  const filtered = rows.filter((row) => Number(row.ano_ref) === Number(selectedYear));
  const availableWeeks = Array.from(
    new Set(
      filtered
        .map((row) => Number(row.semana_ref_num))
        .filter((week) => Number.isFinite(week))
    )
  ).sort((a, b) => a - b);

  const chartRows = MONTH_LABELS.map((label, index) => {
    const monthNumber = index + 1;
    const item = {
      periodo: label,
      mes: monthNumber,
    };

    availableWeeks.forEach((week) => {
      const total = filtered
        .filter(
          (row) =>
            Number(row.mes_ref) === Number(monthNumber) &&
            Number(row.semana_ref_num) === Number(week)
        )
        .reduce((acc, row) => acc + toNumber(row.valor_vendido), 0);

      item[`S${week}`] = total;
    });

    return item;
  });

  return {
    weeks: availableWeeks,
    chartRows,
  };
}

export function buildTopFornecedores(rows, limit = 10) {
  const map = new Map();

  rows.forEach((row) => {
    const key = row.fornecedor_original || "SEM FORNECEDOR";
    if (!map.has(key)) {
      map.set(key, {
        fornecedor: key,
        valor_vendido: 0,
      });
    }

    map.get(key).valor_vendido += toNumber(row.valor_vendido);
  });

  return Array.from(map.values())
    .sort((a, b) => b.valor_vendido - a.valor_vendido)
    .slice(0, limit);
}