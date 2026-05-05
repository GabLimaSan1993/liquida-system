import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
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
  fetchLotStatuses,
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

export default function LotDetailPage() {
  const { fornecedor, lote } = useParams();
  const decodedFornecedor = decodeURIComponent(fornecedor || "");
  const decodedLote = decodeURIComponent(lote || "");

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
        const data = await fetchLotStatuses(decodedFornecedor, decodedLote, filters);
        setRows(data);
      } catch (error) {
        console.error(error);
        setPageError(`Erro ao carregar status do lote: ${error.message || "falha na consulta"}`);
      } finally {
        setLoading(false);
      }
    }

    loadRows();
  }, [decodedFornecedor, decodedLote, filters]);

  const summary = useMemo(() => {
    const totalStatus = rows.length;
    const totalOs = rows.reduce((acc, row) => acc + Number(row.qtd_os || 0), 0);
    const totalItens = rows.reduce((acc, row) => acc + Number(row.qtd_itens || 0), 0);
    const totalItensUnicos = rows.reduce((acc, row) => acc + Number(row.itens_unicos || 0), 0);
    const totalValor = rows.reduce((acc, row) => acc + Number(row.valor_total_entrada || 0), 0);

    return {
      totalStatus,
      totalOs,
      totalItens,
      totalItensUnicos,
      totalValor,
    };
  }, [rows]);

  const cards = [
    { label: "Fornecedor", value: decodedFornecedor },
    { label: "Lote", value: decodedLote },
    { label: "Status encontrados", value: summary.totalStatus.toLocaleString("pt-BR") },
    { label: "OS", value: summary.totalOs.toLocaleString("pt-BR") },
    { label: "Itens únicos", value: summary.totalItensUnicos.toLocaleString("pt-BR") },
    { label: "Valor total de entrada", value: formatMoney(summary.totalValor) },
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
            { label: decodedLote },
          ]}
        />

        <div>
          <h2 className="text-xl font-bold text-[#6B1F87]">Status por lote</h2>
          <p className="mt-1 text-sm text-slate-500">
            Clique no status para abrir a lista detalhada dos itens e seriais.
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
            Carregando status do lote...
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] ring-1 ring-[#E9D5FF]">
            <div className="overflow-x-auto">
              <table className="min-w-full bg-white">
                <thead className="bg-[#FCFAFF]">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-bold uppercase text-slate-500">
                      Status da OS
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      OS
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Itens
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Itens únicos
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Valor entrada
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Ticket médio
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum status encontrado.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.status_os}
                        className="border-t border-[#F3E8FF] hover:bg-[#FCFAFF]"
                      >
                        <td className="px-4 py-3 text-sm font-semibold text-[#6B1F87]">
                          <Link
                            to={`/analise-entrada/fornecedor/${encodeURIComponent(
                              decodedFornecedor
                            )}/lote/${encodeURIComponent(decodedLote)}/status/${encodeURIComponent(
                              row.status_os
                            )}?${searchParams.toString()}`}
                            className="hover:underline"
                          >
                            {row.status_os}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {Number(row.qtd_os || 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {Number(row.qtd_itens || 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {Number(row.itens_unicos || 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-[#6B1F87]">
                          {formatMoney(row.valor_total_entrada)}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {formatMoney(row.ticket_medio)}
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
  );
}