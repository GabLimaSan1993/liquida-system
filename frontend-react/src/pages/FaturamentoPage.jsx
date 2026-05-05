import { useEffect, useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  fetchFaturamentoRaw,
  buildFilterOptions,
  applyFaturamentoFilters,
  buildFaturamentoOverview,
  buildTopFornecedores,
  buildYearCurvesByMonth,
  buildMonthCurveByDay,
  buildWeekCurveByMonth,
} from "../services/faturamentoService.js";

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

const EMPTY_FILTERS = {
  ano: "",
  mes: "",
  semana: "",
  devolvido: "",
  fornecedor: "",
  marca: "",
  categoria: "",
  subcategoria: "",
  cliente: "",
};

function SectionCard({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] bg-white shadow-xl shadow-violet-100/80 ${className}`}>
      {children}
    </div>
  );
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}

function formatAxisMoney(value) {
  const numeric = Number(value || 0);
  if (!Number.isFinite(numeric)) return "R$ 0";

  if (Math.abs(numeric) >= 1_000_000) {
    return `R$ ${(numeric / 1_000_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 1,
    })}M`;
  }

  if (Math.abs(numeric) >= 1_000) {
    return `R$ ${(numeric / 1_000).toLocaleString("pt-BR", {
      maximumFractionDigits: 0,
    })}k`;
  }

  return `R$ ${numeric.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  })}`;
}

function FilterButton({ active, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        active
          ? "bg-[#6B1F87] text-white shadow-lg"
          : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]"
      }`}
    >
      {children}
    </button>
  );
}

function ActionButton({ children, primary = false, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl px-4 py-2.5 text-sm font-semibold transition ${
        primary
          ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
          : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]"
      }`}
    >
      {children}
    </button>
  );
}

function StatCard({ label, value, helper }) {
  return (
    <div className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
      <div className="text-sm font-medium text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight text-[#6B1F87]">{value}</div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 shadow-xl">
      <div className="text-sm font-semibold text-slate-500">{label}</div>
      <div className="mt-2 space-y-1.5">
        {payload.map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="font-semibold text-slate-700">{entry.name}:</span>
            <span className="font-bold" style={{ color: entry.color }}>
              {formatMoney(entry.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function getSeriesColor(index) {
  const palette = [
    "#6B1F87",
    "#F97316",
    "#A855F7",
    "#0EA5E9",
    "#10B981",
    "#EF4444",
    "#F59E0B",
    "#7C3AED",
    "#EC4899",
    "#14B8A6",
    "#8B5CF6",
    "#F43F5E",
  ];

  return palette[index % palette.length];
}

function normalizeText(value) {
  return String(value || "").trim().toUpperCase();
}

function buildSubcategoriaChartByYear(rows, categoriaSelecionada, selectedYears = []) {
  if (!categoriaSelecionada) {
    return {
      series: [],
      chartRows: MONTH_LABELS.map((label, index) => ({
        periodo: label,
        mes: index + 1,
      })),
    };
  }

  const filtered = rows.filter(
    (row) => normalizeText(row.categoria) === normalizeText(categoriaSelecionada)
  );

  const availableYears = Array.from(
    new Set(
      filtered
        .map((row) => Number(row.ano_ref))
        .filter((year) => Number.isFinite(year))
    )
  ).sort((a, b) => a - b);

  const yearsToUse = selectedYears.length > 0 ? selectedYears : availableYears;

  const chartRows = MONTH_LABELS.map((label, index) => {
    const monthNumber = index + 1;
    const item = {
      periodo: label,
      mes: monthNumber,
    };

    yearsToUse.forEach((year) => {
      const total = filtered
        .filter(
          (row) =>
            Number(row.ano_ref) === Number(year) &&
            Number(row.mes_ref) === Number(monthNumber)
        )
        .reduce((acc, row) => acc + Number(row.valor_vendido || 0), 0);

      item[String(year)] = total;
    });

    return item;
  });

  return {
    series: yearsToUse.map((year) => String(year)),
    chartRows,
  };
}

function buildSubcategoriaChartByMonth(rows, categoriaSelecionada, selectedYear) {
  if (!categoriaSelecionada || !selectedYear) {
    return { series: [], chartRows: [] };
  }

  const filtered = rows.filter(
    (row) =>
      normalizeText(row.categoria) === normalizeText(categoriaSelecionada) &&
      Number(row.ano_ref) === Number(selectedYear)
  );

  const subcategorias = Array.from(
    new Set(
      filtered
        .map((row) => row.sub_categoria)
        .filter((value) => value && String(value).trim() !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));

  const dayLabels = Array.from({ length: 31 }, (_, index) => index + 1);

  const chartRows = dayLabels.map((day) => {
    const item = { periodo: String(day).padStart(2, "0"), dia: day };

    subcategorias.forEach((subcategoria) => {
      const total = filtered
        .filter((row) => {
          const date = row.dt_ref ? new Date(`${row.dt_ref}T00:00:00`) : null;
          if (!date || Number.isNaN(date.getTime())) return false;

          return (
            normalizeText(row.sub_categoria) === normalizeText(subcategoria) &&
            date.getDate() === day
          );
        })
        .reduce((acc, row) => acc + Number(row.valor_vendido || 0), 0);

      item[subcategoria] = total;
    });

    return item;
  });

  return {
    series: subcategorias,
    chartRows,
  };
}

function buildSubcategoriaChartByWeek(rows, categoriaSelecionada, selectedYear) {
  if (!categoriaSelecionada || !selectedYear) {
    return { series: [], chartRows: [] };
  }

  const filtered = rows.filter(
    (row) =>
      normalizeText(row.categoria) === normalizeText(categoriaSelecionada) &&
      Number(row.ano_ref) === Number(selectedYear)
  );

  const subcategorias = Array.from(
    new Set(
      filtered
        .map((row) => row.sub_categoria)
        .filter((value) => value && String(value).trim() !== "")
    )
  ).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));

  const weeks = Array.from(
    new Set(
      filtered
        .map((row) => Number(row.semana_ref_num))
        .filter((week) => Number.isFinite(week))
    )
  ).sort((a, b) => a - b);

  const chartRows = weeks.map((week) => {
    const item = {
      periodo: `S${week}`,
      semana: week,
    };

    subcategorias.forEach((subcategoria) => {
      const total = filtered
        .filter(
          (row) =>
            normalizeText(row.sub_categoria) === normalizeText(subcategoria) &&
            Number(row.semana_ref_num) === Number(week)
        )
        .reduce((acc, row) => acc + Number(row.valor_vendido || 0), 0);

      item[subcategoria] = total;
    });

    return item;
  });

  return {
    series: subcategorias,
    chartRows,
  };
}

export default function FaturamentoPage() {
  const [rows, setRows] = useState([]);
  const [filteredRows, setFilteredRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");
  const [viewMode, setViewMode] = useState("ano");
  const [subcategoriaViewMode, setSubcategoriaViewMode] = useState("ano");

  const [draftFilters, setDraftFilters] = useState({ ...EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS });
  const [categoriaGrafico, setCategoriaGrafico] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setPageError("");
        const data = await fetchFaturamentoRaw();
        const filtered = applyFaturamentoFilters(data || [], { ...EMPTY_FILTERS });

        setRows(data || []);
        setFilteredRows(filtered);
      } catch (error) {
        console.error(error);
        setPageError(`Erro ao carregar faturamento: ${error.message || "falha na consulta"}`);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filterOptions = useMemo(() => buildFilterOptions(rows), [rows]);

  const categoriasDisponiveisGrafico = useMemo(() => {
    return Array.from(
      new Set(
        filteredRows
          .map((row) => row.categoria)
          .filter((value) => value && String(value).trim() !== "")
      )
    ).sort((a, b) => String(a).localeCompare(String(b), "pt-BR"));
  }, [filteredRows]);

  useEffect(() => {
    if (!categoriaGrafico && categoriasDisponiveisGrafico.length > 0) {
      setCategoriaGrafico(categoriasDisponiveisGrafico[0]);
      return;
    }

    if (
      categoriaGrafico &&
      !categoriasDisponiveisGrafico.some(
        (item) => normalizeText(item) === normalizeText(categoriaGrafico)
      )
    ) {
      setCategoriaGrafico(categoriasDisponiveisGrafico[0] || "");
    }
  }, [categoriasDisponiveisGrafico, categoriaGrafico]);

  const selectedYears = useMemo(() => {
    if (appliedFilters.ano) {
      return [Number(appliedFilters.ano)];
    }

    return filterOptions.years;
  }, [appliedFilters.ano, filterOptions.years]);

  const selectedReferenceYear = useMemo(() => {
    if (appliedFilters.ano) return Number(appliedFilters.ano);
    return filterOptions.years.length > 0
      ? filterOptions.years[filterOptions.years.length - 1]
      : null;
  }, [appliedFilters.ano, filterOptions.years]);

  const overview = useMemo(() => buildFaturamentoOverview(filteredRows), [filteredRows]);

  const yearCurves = useMemo(
    () => buildYearCurvesByMonth(filteredRows, selectedYears),
    [filteredRows, selectedYears]
  );

  const monthCurves = useMemo(
    () => buildMonthCurveByDay(filteredRows, selectedReferenceYear),
    [filteredRows, selectedReferenceYear]
  );

  const weekCurves = useMemo(
    () => buildWeekCurveByMonth(filteredRows, selectedReferenceYear),
    [filteredRows, selectedReferenceYear]
  );

  const topFornecedores = useMemo(() => buildTopFornecedores(filteredRows, 10), [filteredRows]);

  const subcategoriaYearCurves = useMemo(
    () => buildSubcategoriaChartByYear(filteredRows, categoriaGrafico, selectedYears),
    [filteredRows, categoriaGrafico, selectedYears]
  );

  const subcategoriaMonthCurves = useMemo(
    () => buildSubcategoriaChartByMonth(filteredRows, categoriaGrafico, selectedReferenceYear),
    [filteredRows, categoriaGrafico, selectedReferenceYear]
  );

  const subcategoriaWeekCurves = useMemo(
    () => buildSubcategoriaChartByWeek(filteredRows, categoriaGrafico, selectedReferenceYear),
    [filteredRows, categoriaGrafico, selectedReferenceYear]
  );

  function updateDraft(field, value) {
    setDraftFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyFilters() {
    const filtered = applyFaturamentoFilters(rows, draftFilters);
    setAppliedFilters(draftFilters);
    setFilteredRows(filtered);
  }

  function clearFilters() {
    const reset = { ...EMPTY_FILTERS };
    const filtered = applyFaturamentoFilters(rows, reset);

    setDraftFilters(reset);
    setAppliedFilters(reset);
    setFilteredRows(filtered);
  }

  function renderYearChart() {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={yearCurves.chartRows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#E9D5FF" strokeDasharray="4 4" />
          <XAxis
            dataKey="periodo"
            tick={{ fill: "#64748B", fontSize: 13, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
          />
          <YAxis
            tickFormatter={formatAxisMoney}
            tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "13px", fontWeight: 700, color: "#6B1F87", paddingTop: "12px" }} />
          {yearCurves.years.map((year, index) => (
            <Line
              key={year}
              type="monotone"
              dataKey={String(year)}
              name={String(year)}
              stroke={getSeriesColor(index)}
              strokeWidth={3}
              dot={{ r: 4, strokeWidth: 2, fill: "#fff" }}
              activeDot={{ r: 6 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  function renderMonthChart() {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={monthCurves.seriesByMonth} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#E9D5FF" strokeDasharray="4 4" />
          <XAxis
            dataKey="periodo"
            tick={{ fill: "#64748B", fontSize: 13, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
          />
          <YAxis
            tickFormatter={formatAxisMoney}
            tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "13px", fontWeight: 700, color: "#6B1F87", paddingTop: "12px" }} />
          {monthCurves.months.map((month, index) => (
            <Line
              key={month}
              type="monotone"
              dataKey={MONTH_LABELS[month - 1]}
              name={MONTH_LABELS[month - 1]}
              stroke={getSeriesColor(index)}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  function renderWeekChart() {
    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={weekCurves.chartRows} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#E9D5FF" strokeDasharray="4 4" />
          <XAxis
            dataKey="periodo"
            tick={{ fill: "#64748B", fontSize: 13, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
          />
          <YAxis
            tickFormatter={formatAxisMoney}
            tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "13px", fontWeight: 700, color: "#6B1F87", paddingTop: "12px" }} />
          {weekCurves.weeks.map((week, index) => (
            <Line
              key={week}
              type="monotone"
              dataKey={`S${week}`}
              name={`Semana ${week}`}
              stroke={getSeriesColor(index)}
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  function renderSubcategoriaChart() {
    const chartData =
      subcategoriaViewMode === "ano"
        ? subcategoriaYearCurves.chartRows
        : subcategoriaViewMode === "mes"
        ? subcategoriaMonthCurves.chartRows
        : subcategoriaWeekCurves.chartRows;

    const series =
      subcategoriaViewMode === "ano"
        ? subcategoriaYearCurves.series
        : subcategoriaViewMode === "mes"
        ? subcategoriaMonthCurves.series
        : subcategoriaWeekCurves.series;

    return (
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 10 }}>
          <CartesianGrid stroke="#E9D5FF" strokeDasharray="4 4" />
          <XAxis
            dataKey="periodo"
            tick={{ fill: "#64748B", fontSize: 13, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
          />
          <YAxis
            tickFormatter={formatAxisMoney}
            tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }}
            axisLine={{ stroke: "#D8B4FE" }}
            tickLine={{ stroke: "#D8B4FE" }}
            width={90}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: "13px", fontWeight: 700, color: "#6B1F87", paddingTop: "12px" }} />
          {series.map((serie, index) => (
            <Line
              key={serie}
              type="monotone"
              dataKey={serie}
              name={serie}
              stroke={getSeriesColor(index)}
              strokeWidth={3}
              dot={false}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  const subcategoriaSeries =
    subcategoriaViewMode === "ano"
      ? subcategoriaYearCurves.series
      : subcategoriaViewMode === "mes"
      ? subcategoriaMonthCurves.series
      : subcategoriaWeekCurves.series;

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="p-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#6B1F87]">Análise de Faturamento</h1>
            <p className="mt-1 text-sm text-slate-500">
              A análise considera somente registros com tipo igual a Considerar.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <select
              value={draftFilters.ano}
              onChange={(e) => updateDraft("ano", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos os anos</option>
              {filterOptions.years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.mes}
              onChange={(e) => updateDraft("mes", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos os meses</option>
              {filterOptions.months.map((month) => (
                <option key={month} value={month}>
                  {MONTH_LABELS[month - 1]}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.semana}
              onChange={(e) => updateDraft("semana", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todas as semanas</option>
              {filterOptions.weeks.map((week) => (
                <option key={week} value={week}>
                  Semana {week}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.devolvido}
              onChange={(e) => updateDraft("devolvido", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos devolvidos</option>
              {filterOptions.devolvidos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.fornecedor}
              onChange={(e) => updateDraft("fornecedor", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos os fornecedores</option>
              {filterOptions.fornecedores.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.marca}
              onChange={(e) => updateDraft("marca", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todas as marcas</option>
              {filterOptions.marcas.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.categoria}
              onChange={(e) => updateDraft("categoria", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todas as categorias</option>
              {filterOptions.categorias.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.subcategoria}
              onChange={(e) => updateDraft("subcategoria", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todas as subcategorias</option>
              {filterOptions.subcategorias.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.cliente}
              onChange={(e) => updateDraft("cliente", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos os clientes</option>
              {filterOptions.clientes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton primary onClick={applyFilters}>
              Aplicar filtros
            </ActionButton>
            <ActionButton onClick={clearFilters}>Limpar filtros</ActionButton>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Valor vendido"
              value={formatMoney(overview.totalValorVendido)}
              helper="Somente tipo = Considerar"
            />
            <StatCard
              label="Valor final"
              value={formatMoney(overview.totalValorFinal)}
              helper="Somente tipo = Considerar"
            />
            <StatCard
              label="Lucro bruto"
              value={formatMoney(overview.totalLucro)}
              helper="Valor final - custo"
            />
            <StatCard
              label="Ticket médio"
              value={formatMoney(overview.ticketMedio)}
              helper="Por nota fiscal"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <h2 className="text-[28px] font-black tracking-tight text-[#6B1F87]">
              Faturamento
            </h2>

            <div className="flex flex-wrap gap-2">
              <FilterButton active={viewMode === "ano"} onClick={() => setViewMode("ano")}>
                Ano
              </FilterButton>
              <FilterButton active={viewMode === "mes"} onClick={() => setViewMode("mes")}>
                Mês
              </FilterButton>
              <FilterButton active={viewMode === "semana"} onClick={() => setViewMode("semana")}>
                Semana
              </FilterButton>
            </div>
          </div>

          <div className="mt-6 h-[430px]">
            {pageError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                {pageError}
              </div>
            ) : loading ? (
              <div className="rounded-2xl border border-[#E9D5FF] bg-[#FCFAFF] p-4 text-sm text-slate-600">
                Carregando faturamento...
              </div>
            ) : viewMode === "ano" ? (
              renderYearChart()
            ) : viewMode === "mes" ? (
              renderMonthChart()
            ) : (
              renderWeekChart()
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6B1F87]">
                Evolução por subcategoria
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Selecione uma categoria para visualizar as subcategorias no período filtrado.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <select
                value={categoriaGrafico}
                onChange={(e) => setCategoriaGrafico(e.target.value)}
                className="min-w-[280px] rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
              >
                <option value="">Selecione uma categoria</option>
                {categoriasDisponiveisGrafico.map((categoria) => (
                  <option key={categoria} value={categoria}>
                    {categoria}
                  </option>
                ))}
              </select>

              <div className="flex flex-wrap gap-2">
                <FilterButton
                  active={subcategoriaViewMode === "ano"}
                  onClick={() => setSubcategoriaViewMode("ano")}
                >
                  Ano
                </FilterButton>
                <FilterButton
                  active={subcategoriaViewMode === "mes"}
                  onClick={() => setSubcategoriaViewMode("mes")}
                >
                  Mês
                </FilterButton>
                <FilterButton
                  active={subcategoriaViewMode === "semana"}
                  onClick={() => setSubcategoriaViewMode("semana")}
                >
                  Semana
                </FilterButton>
              </div>
            </div>
          </div>

          <div className="mt-6 h-[430px]">
            {!categoriaGrafico ? (
              <div className="rounded-2xl border border-[#E9D5FF] bg-[#FCFAFF] p-4 text-sm text-slate-600">
                Selecione uma categoria para visualizar o gráfico por subcategoria.
              </div>
            ) : subcategoriaSeries.length === 0 ? (
              <div className="rounded-2xl border border-[#E9D5FF] bg-[#FCFAFF] p-4 text-sm text-slate-600">
                Não há subcategorias para a categoria selecionada no período atual.
              </div>
            ) : (
              renderSubcategoriaChart()
            )}
          </div>
        </div>
      </SectionCard>

     </div>
  );
}