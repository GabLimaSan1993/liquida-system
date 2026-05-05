import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import Breadcrumbs from "../components/Breadcrumbs.jsx";
import TopFilters from "../components/TopFilters.jsx";
import SummaryCards from "../components/SummaryCards.jsx";
import {
  defaultFilters,
  filtersFromSearchParams,
  filtersToSearchParams,
} from "../lib/filterParams.js";
import {
  fetchFilterOptions,
  fetchStatusSerials,
} from "../services/analysisService.js";

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
  });
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return date.toLocaleString("pt-BR");
}

export default function StatusDetailPage() {
  const { fornecedor, lote, status } = useParams();
  const decodedFornecedor = decodeURIComponent(fornecedor || "");
  const decodedLote = decodeURIComponent(lote || "");
  const decodedStatus = decodeURIComponent(status || "");

  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersMeta, setFiltersMeta] = useState({ suppliers: [], years: [] });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageError, setPageError] = useState("");

  const filters = useMemo(() => {
    const parsed = filtersFromSearchParams(searchParams);
    return { ...defaultFilters, ...parsed, fornecedor: decodedFornecedor };
  }, [searchParams, decodedFornecedor]);

  function handleFilterChange(nextFilters) {
    setSearchParams(
      filtersToSearchParams({
        ...nextFilters,
        fornecedor: decodedFornecedor,
      })
    );
  }

  useEffect(() => {
    async function loadOptions() {
      try {
        const options = await fetchFilterOptions();
        setFiltersMeta(options);
      } catch (error) {
        console.error(error);
      }
    }

    loadOptions();
  }, []);

  useEffect(() => {
    async function loadRows() {
      try {
        setLoading(true);
        setPageError("");
        const data = await fetchStatusSerials(
          decodedFornecedor,
          decodedLote,
          decodedStatus,
          filters
        );
        setRows(data);
      } catch (error) {
        console.error(error);
        setPageError(`Erro ao carregar seriais: ${error.message || "falha na consulta"}`);
      } finally {
        setLoading(false);
      }
    }

    loadRows();
  }, [decodedFornecedor, decodedLote, decodedStatus, filters]);

  const summary = useMemo(() => {
    const totalItens = rows.length;
    const totalValor = rows.reduce((acc, row) => acc + Number(row.custo_net || 0), 0);

    return {
      totalItens,
      totalValor,
      ticketMedio: totalItens ? totalValor / totalItens : 0,
    };
  }, [rows]);

  const cards = [
    { label: "Fornecedor", value: decodedFornecedor },
    { label: "Lote", value: decodedLote },
    { label: "Status", value: decodedStatus },
    { label: "Itens", value: summary.totalItens.toLocaleString("pt-BR") },
    { label: "Valor total", value: formatMoney(summary.totalValor) },
    { label: "Ticket médio", value: formatMoney(summary.ticketMedio) },
  ];

  return (
    <SectionCard>
      <div className="p-6 space-y-6">
        <Breadcrumbs
          items={[
            { label: "Análise de Entrada", to: `/analise-entrada?${searchParams.toString()}` },
            {
              label: decodedFornecedor,
              to: `/analise-entrada/fornecedor/${encodeURIComponent(decodedFornecedor)}?${searchParams.toString()}`,
            },
            {
              label: decodedLote,
              to: `/analise-entrada/fornecedor/${encodeURIComponent(
                decodedFornecedor
              )}/lote/${encodeURIComponent(decodedLote)}?${searchParams.toString()}`,
            },
            { label: decodedStatus },
          ]}
        />

        <div>
          <h2 className="text-xl font-bold text-[#6B1F87]">Itens por status</h2>
          <p className="mt-1 text-sm text-slate-500">
            Lista detalhada por item, usando IMEI e, quando não houver, Serial Out.
          </p>
        </div>

        <TopFilters
          filters={filters}
          onChange={handleFilterChange}
          suppliers={filtersMeta.suppliers}
          years={filtersMeta.years}
        />

        <SummaryCards cards={cards} />

        {pageError ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-600">
            {pageError}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-2xl border border-[#E9D5FF] bg-[#FCFAFF] p-4 text-sm text-slate-600">
            Carregando seriais...
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] ring-1 ring-[#E9D5FF]">
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead className="bg-[#FCFAFF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Num. OS
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Identificador
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      IMEI
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Serial Out
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Modelo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Descrição
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Categoria
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Custo
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Data abertura
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Último log
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum item encontrado.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row, index) => (
                      <tr
                        key={`${row.unique_key || row.identificador_item || "item"}-${index}`}
                        className="border-t border-[#F3E8FF] hover:bg-[#FCFAFF]"
                      >
                        <td className="px-4 py-3 text-sm font-medium text-[#6B1F87]">
                          {row.num_os || "-"}
                        </td>
                        <td className="px-4 py-3 text-sm">{row.identificador_item || "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.imei || "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.serial_out || "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.modelo || "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.descricao_produto || "-"}</td>
                        <td className="px-4 py-3 text-sm">{row.categoria_produto || "-"}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-[#6B1F87]">
                          {formatMoney(row.custo_net)}
                        </td>
                        <td className="px-4 py-3 text-sm">{formatDateTime(row.dt_abert)}</td>
                        <td className="px-4 py-3 text-sm">{formatDateTime(row.dt_ult_log)}</td>
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
  );
}