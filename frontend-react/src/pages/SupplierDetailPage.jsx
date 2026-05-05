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
  fetchSupplierLots,
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

export default function SupplierDetailPage() {
  const { fornecedor } = useParams();
  const decodedFornecedor = decodeURIComponent(fornecedor || "");
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
        const data = await fetchSupplierLots(decodedFornecedor, filters);
        setRows(data);
      } catch (error) {
        console.error(error);
        setPageError(`Erro ao carregar lotes: ${error.message || "falha na consulta"}`);
      } finally {
        setLoading(false);
      }
    }

    loadRows();
  }, [decodedFornecedor, filters]);

  const summary = useMemo(() => {
    const totalLotes = rows.length;
    const totalOs = rows.reduce((acc, row) => acc + Number(row.qtd_os || 0), 0);
    const totalItens = rows.reduce((acc, row) => acc + Number(row.qtd_itens || 0), 0);
    const totalDisponiveis = rows.reduce((acc, row) => acc + Number(row.disponiveis_venda || 0), 0);
    const totalProcesso = rows.reduce((acc, row) => acc + Number(row.em_processo || 0), 0);
    const totalValor = rows.reduce((acc, row) => acc + Number(row.valor_total_entrada || 0), 0);

    return { totalLotes, totalOs, totalItens, totalDisponiveis, totalProcesso, totalValor };
  }, [rows]);

  const cards = [
    { label: "Fornecedor", value: decodedFornecedor },
    { label: "Lotes", value: summary.totalLotes.toLocaleString("pt-BR") },
    { label: "OS", value: summary.totalOs.toLocaleString("pt-BR") },
    { label: "Itens", value: summary.totalItens.toLocaleString("pt-BR") },
    {
      label: "Disponíveis para venda",
      value: summary.totalDisponiveis.toLocaleString("pt-BR"),
      valueClassName: "text-emerald-600",
    },
    { label: "Valor total de entrada", value: formatMoney(summary.totalValor) },
  ];

  return (
    <SectionCard>
      <div className="p-6 space-y-6">
        <Breadcrumbs
          items={[
            { label: "Análise de Entrada", to: `/analise-entrada?${searchParams.toString()}` },
            { label: decodedFornecedor },
          ]}
        />

        <div>
          <h2 className="text-xl font-bold text-[#6B1F87]">Lotes do fornecedor</h2>
          <p className="mt-1 text-sm text-slate-500">
            Clique no lote para abrir o detalhamento por status da OS.
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
            Carregando lotes...
          </div>
        ) : (
          <div className="overflow-hidden rounded-[24px] ring-1 ring-[#E9D5FF]">
            <div className="overflow-x-auto">
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
                      Itens
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Disponíveis
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase text-slate-500">
                      Em processo
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
                      <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">
                        Nenhum lote encontrado.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.lote} className="border-t border-[#F3E8FF] hover:bg-[#FCFAFF]">
                        <td className="px-4 py-3 text-sm font-semibold text-[#6B1F87]">
                          <Link
                            to={`/analise-entrada/fornecedor/${encodeURIComponent(
                              decodedFornecedor
                            )}/lote/${encodeURIComponent(row.lote)}?${searchParams.toString()}`}
                            className="hover:underline"
                          >
                            {row.lote}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {Number(row.qtd_os || 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          {Number(row.qtd_itens || 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-emerald-600 font-semibold">
                          {Number(row.disponiveis_venda || 0).toLocaleString("pt-BR")}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-amber-600 font-semibold">
                          {Number(row.em_processo || 0).toLocaleString("pt-BR")}
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