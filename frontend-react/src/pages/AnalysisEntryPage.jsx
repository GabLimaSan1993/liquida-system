import { useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  applyAnalysisFilters,
  buildAnalysisFilterOptions,
  buildEtapaRows,
  buildLotRows,
  buildOsRows,
  buildOverview,
  buildSupplierRows,
  buildTimelineSeries,
  fetchAnalysisRows,
} from "../services/analysisService.js";

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

const EMPTY_FILTERS = {
  fornecedor: "",
  ano: "",
  mes: "",
  semana: "",
  dataInicio: "",
  dataFim: "",
};

function SectionCard({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] bg-white shadow-xl shadow-violet-100/80 ${className}`}>
      {children}
    </div>
  );
}

function StatCard({ title, value, helper, accent = "purple" }) {
  const accentMap = {
    purple: "text-[#6B1F87]",
    orange: "text-[#F97316]",
    green: "text-[#059669]",
    blue: "text-[#2563EB]",
  };

  return (
    <div className="rounded-[24px] bg-[#FCFAFF] p-5 ring-1 ring-[#E9D5FF]">
      <div className="text-sm font-medium text-slate-500">{title}</div>
      <div className={`mt-2 text-2xl font-black tracking-tight ${accentMap[accent]}`}>
        {value}
      </div>
      {helper ? <div className="mt-1 text-xs text-slate-500">{helper}</div> : null}
    </div>
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

function formatMoney(value) {
  return Number(value || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 2,
  });
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return `${(Number(value) * 100).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}%`;
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
              {Number(entry.value || 0).toLocaleString("pt-BR")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Breadcrumbs({ fornecedor, lote, etapa, onResetFornecedor, onResetLote, onResetEtapa }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        onClick={onResetFornecedor}
        className="rounded-full bg-[#FCFAFF] px-3 py-1.5 font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]"
      >
        Fornecedores
      </button>

      {fornecedor ? (
        <>
          <span className="text-slate-400">/</span>
          <button
            type="button"
            onClick={onResetLote}
            className="rounded-full bg-[#FCFAFF] px-3 py-1.5 font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]"
          >
            {fornecedor}
          </button>
        </>
      ) : null}

      {lote ? (
        <>
          <span className="text-slate-400">/</span>
          <button
            type="button"
            onClick={onResetEtapa}
            className="rounded-full bg-[#FCFAFF] px-3 py-1.5 font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]"
          >
            Lote {lote}
          </button>
        </>
      ) : null}

      {etapa ? (
        <>
          <span className="text-slate-400">/</span>
          <span className="rounded-full bg-[#FCFAFF] px-3 py-1.5 font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {etapa}
          </span>
        </>
      ) : null}
    </div>
  );
}

export default function AnalysisEntryPage() {
  const [rows, setRows] = useState([]);
  const [filteredRows, setFilteredRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  const [draftFilters, setDraftFilters] = useState({ ...EMPTY_FILTERS });
  const [appliedFilters, setAppliedFilters] = useState({ ...EMPTY_FILTERS });

  const [selectedFornecedor, setSelectedFornecedor] = useState("");
  const [selectedLote, setSelectedLote] = useState("");
  const [selectedEtapa, setSelectedEtapa] = useState("");

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setPageError("");

        const data = await fetchAnalysisRows();
        setRows(data || []);
        setFilteredRows(applyAnalysisFilters(data || [], EMPTY_FILTERS));
      } catch (error) {
        console.error(error);
        setPageError(`Erro ao carregar análise: ${error.message || "falha na consulta"}`);
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const filterOptions = useMemo(() => buildAnalysisFilterOptions(rows), [rows]);

  const overview = useMemo(() => buildOverview(filteredRows), [filteredRows]);

  const supplierRows = useMemo(() => buildSupplierRows(filteredRows), [filteredRows]);

  const lotRows = useMemo(
    () => buildLotRows(filteredRows, selectedFornecedor),
    [filteredRows, selectedFornecedor]
  );

  const etapaRows = useMemo(
    () => buildEtapaRows(filteredRows, selectedFornecedor, selectedLote),
    [filteredRows, selectedFornecedor, selectedLote]
  );

  const osRows = useMemo(
    () => buildOsRows(filteredRows, selectedFornecedor, selectedLote, selectedEtapa),
    [filteredRows, selectedFornecedor, selectedLote, selectedEtapa]
  );

  const timelineSeries = useMemo(
    () => buildTimelineSeries(filteredRows, appliedFilters.ano),
    [filteredRows, appliedFilters.ano]
  );

  function updateDraft(field, value) {
    setDraftFilters((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function applyFilters() {
    const filtered = applyAnalysisFilters(rows, draftFilters);

    setAppliedFilters(draftFilters);
    setFilteredRows(filtered);

    setSelectedFornecedor("");
    setSelectedLote("");
    setSelectedEtapa("");
  }

  function clearFilters() {
    const reset = { ...EMPTY_FILTERS };
    const filtered = applyAnalysisFilters(rows, reset);

    setDraftFilters(reset);
    setAppliedFilters(reset);
    setFilteredRows(filtered);

    setSelectedFornecedor("");
    setSelectedLote("");
    setSelectedEtapa("");
  }

  function handleFornecedorClick(fornecedor) {
    setSelectedFornecedor(fornecedor);
    setSelectedLote("");
    setSelectedEtapa("");
  }

  function handleLoteClick(lote) {
    setSelectedLote(lote);
    setSelectedEtapa("");
  }

  function handleEtapaClick(etapa) {
    setSelectedEtapa(etapa);
  }

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="p-6">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#6B1F87]">
              Análise de Entrada
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Acompanhe entrada, disponibilidade, itens vendidos, PMV e rentabilidade.
            </p>
          </div>

          <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-6">
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
              value={draftFilters.ano}
              onChange={(e) => updateDraft("ano", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos os anos</option>
              {filterOptions.anos.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.mes}
              onChange={(e) => updateDraft("mes", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todos os meses</option>
              {filterOptions.meses.map((item) => (
                <option key={item} value={item}>
                  {MONTH_LABELS[item - 1]}
                </option>
              ))}
            </select>

            <select
              value={draftFilters.semana}
              onChange={(e) => updateDraft("semana", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            >
              <option value="">Todas as semanas</option>
              {filterOptions.semanas.map((item) => (
                <option key={item} value={item}>
                  Semana {item}
                </option>
              ))}
            </select>

            <input
              type="date"
              value={draftFilters.dataInicio}
              onChange={(e) => updateDraft("dataInicio", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            />

            <input
              type="date"
              value={draftFilters.dataFim}
              onChange={(e) => updateDraft("dataFim", e.target.value)}
              className="rounded-2xl border border-[#E9D5FF] bg-white px-4 py-3 text-sm outline-none"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <ActionButton primary onClick={applyFilters}>
              Aplicar filtros
            </ActionButton>
            <ActionButton onClick={clearFilters}>Limpar filtros</ActionButton>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Fornecedores"
              value={Number(overview.totalFornecedores || 0).toLocaleString("pt-BR")}
              helper="Com filtros aplicados"
              accent="purple"
            />
            <StatCard
              title="Lotes"
              value={Number(overview.totalLotes || 0).toLocaleString("pt-BR")}
              helper="Com filtros aplicados"
              accent="purple"
            />
            <StatCard
              title="OS"
              value={Number(overview.totalOs || 0).toLocaleString("pt-BR")}
              helper="Quantidade distinta"
              accent="purple"
            />
            <StatCard
              title="Vendidos"
              value={Number(overview.vendidos || 0).toLocaleString("pt-BR")}
              helper="Etapa analítica"
              accent="blue"
            />
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Disponíveis"
              value={Number(overview.disponiveis || 0).toLocaleString("pt-BR")}
              helper="Prontos para venda"
              accent="green"
            />
            <StatCard
              title="Em processo"
              value={Number(overview.emProcesso || 0).toLocaleString("pt-BR")}
              helper="Ainda em fluxo"
              accent="orange"
            />
            <StatCard
              title="Valor de entrada"
              value={formatMoney(overview.valorEntrada)}
              helper="Base de custo"
              accent="purple"
            />
            <StatCard
              title="Valor de venda"
              value={formatMoney(overview.valorVenda)}
              helper="PMV agregado"
              accent="blue"
            />
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="p-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-xl font-bold text-[#6B1F87]">Evolução operacional</h2>
              <p className="mt-1 text-sm text-slate-500">
                Itens vendidos, disponíveis e em processo ao longo dos meses.
              </p>
            </div>

            <Breadcrumbs
              fornecedor={selectedFornecedor}
              lote={selectedLote}
              etapa={selectedEtapa}
              onResetFornecedor={() => {
                setSelectedFornecedor("");
                setSelectedLote("");
                setSelectedEtapa("");
              }}
              onResetLote={() => {
                setSelectedLote("");
                setSelectedEtapa("");
              }}
              onResetEtapa={() => {
                setSelectedEtapa("");
              }}
            />
          </div>

          <div className="mt-6 h-[380px]">
            {pageError ? (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
                {pageError}
              </div>
            ) : loading ? (
              <div className="rounded-2xl border border-[#E9D5FF] bg-[#FCFAFF] p-4 text-sm text-slate-600">
                Carregando análise...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timelineSeries}>
                  <CartesianGrid stroke="#E9D5FF" strokeDasharray="4 4" />
                  <XAxis
                    dataKey="periodo"
                    tick={{ fill: "#64748B", fontSize: 13, fontWeight: 600 }}
                    axisLine={{ stroke: "#D8B4FE" }}
                    tickLine={{ stroke: "#D8B4FE" }}
                  />
                  <YAxis
                    tick={{ fill: "#64748B", fontSize: 12, fontWeight: 600 }}
                    axisLine={{ stroke: "#D8B4FE" }}
                    tickLine={{ stroke: "#D8B4FE" }}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="vendidos" name="Vendidos" fill="#2563EB" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="disponiveis" name="Disponíveis" fill="#059669" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="emProcesso" name="Em processo" fill="#F97316" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard>
        <div className="p-6 space-y-6">
          {!selectedFornecedor ? (
            <div>
              <h2 className="text-xl font-bold text-[#6B1F87]">Fornecedores</h2>
              <p className="mt-1 text-sm text-slate-500">
                Clique em um fornecedor para abrir os lotes.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-[#FCFAFF]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Fornecedor
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Lotes
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        OS
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Vendidos
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Disponíveis
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Em processo
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Valor entrada
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Valor venda
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {supplierRows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                          Nenhum registro encontrado.
                        </td>
                      </tr>
                    ) : (
                      supplierRows.map((item) => (
                        <tr
                          key={item.fornecedor}
                          className="cursor-pointer border-t border-[#F3E8FF] hover:bg-[#FCFAFF]"
                          onClick={() => handleFornecedorClick(item.fornecedor)}
                        >
                          <td className="px-4 py-3 text-sm font-semibold text-[#6B1F87]">
                            {item.fornecedor}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">{item.lotes}</td>
                          <td className="px-4 py-3 text-right text-sm">{item.os}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#2563EB]">{item.vendidos}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#059669]">{item.disponiveis}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#F97316]">{item.emProcesso}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatMoney(item.valorEntrada)}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatMoney(item.valorVenda)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !selectedLote ? (
            <div>
              <h2 className="text-xl font-bold text-[#6B1F87]">Lotes do fornecedor</h2>
              <p className="mt-1 text-sm text-slate-500">
                Clique em um lote para abrir as etapas.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-[#FCFAFF]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Lote
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        OS
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Vendidos
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Disponíveis
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Em processo
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Valor entrada
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Valor venda
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {lotRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                          Nenhum lote encontrado.
                        </td>
                      </tr>
                    ) : (
                      lotRows.map((item) => (
                        <tr
                          key={item.lote}
                          className="cursor-pointer border-t border-[#F3E8FF] hover:bg-[#FCFAFF]"
                          onClick={() => handleLoteClick(item.lote)}
                        >
                          <td className="px-4 py-3 text-sm font-semibold text-[#6B1F87]">
                            {item.lote}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">{item.os}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#2563EB]">{item.vendidos}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#059669]">{item.disponiveis}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#F97316]">{item.emProcesso}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatMoney(item.valorEntrada)}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatMoney(item.valorVenda)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : !selectedEtapa ? (
            <div>
              <h2 className="text-xl font-bold text-[#6B1F87]">Etapas do lote</h2>
              <p className="mt-1 text-sm text-slate-500">
                Clique em uma etapa para abrir as OS.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-[#FCFAFF]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Etapa
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        OS
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Vendidos
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Disponíveis
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Em processo
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Valor entrada
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Valor venda
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {etapaRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-500">
                          Nenhuma etapa encontrada.
                        </td>
                      </tr>
                    ) : (
                      etapaRows.map((item) => (
                        <tr
                          key={item.etapa}
                          className="cursor-pointer border-t border-[#F3E8FF] hover:bg-[#FCFAFF]"
                          onClick={() => handleEtapaClick(item.etapa)}
                        >
                          <td className="px-4 py-3 text-sm font-semibold text-[#6B1F87]">
                            {item.etapa}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">{item.os}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#2563EB]">{item.vendidos}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#059669]">{item.disponiveis}</td>
                          <td className="px-4 py-3 text-right text-sm text-[#F97316]">{item.emProcesso}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatMoney(item.valorEntrada)}</td>
                          <td className="px-4 py-3 text-right text-sm">{formatMoney(item.valorVenda)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-bold text-[#6B1F87]">OS da etapa</h2>
              <p className="mt-1 text-sm text-slate-500">
                Detalhamento final das OS.
              </p>

              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full bg-white">
                  <thead className="bg-[#FCFAFF]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        OS
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Etapa análise
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Etapa original
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Categoria
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Tipo
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                        Marca
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        Custo net
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        PMV
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                        MC
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {osRows.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-sm text-slate-500">
                          Nenhuma OS encontrada.
                        </td>
                      </tr>
                    ) : (
                      osRows.map((item, index) => (
                        <tr
                          key={`${item.numOs}-${index}`}
                          className="border-t border-[#F3E8FF] hover:bg-[#FCFAFF]"
                        >
                          <td className="px-4 py-3 text-sm font-semibold text-[#6B1F87]">
                            {item.numOs}
                          </td>
                          <td className="px-4 py-3 text-sm">{item.etapa}</td>
                          <td className="px-4 py-3 text-sm">{item.etapaOriginal}</td>
                          <td className="px-4 py-3 text-sm">{item.categoriaProduto}</td>
                          <td className="px-4 py-3 text-sm">{item.tipoProd}</td>
                          <td className="px-4 py-3 text-sm">{item.marca}</td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatMoney(item.custoNet)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {formatMoney(item.pmvVenda)}
                          </td>
                          <td className="px-4 py-3 text-right text-sm font-semibold">
                            {formatPercent(item.mcRentabilidade)}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );
}