import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { sincronizarTiny } from "../services/tinyService.js";
import { RefreshCw, TrendingDown } from "lucide-react";

function SectionCard({ children }) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      {children}
    </div>
  );
}

function inputClass() {
  return "rounded-2xl border border-[#E9D5FF] px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#F59E0B]/40 bg-white";
}

function fmt(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function StatusBadge({ status }) {
  const styles = {
    aberto: "bg-yellow-100 text-yellow-700",
    pago: "bg-green-100 text-green-700",
    cancelado: "bg-red-100 text-red-700",
    parcial: "bg-blue-100 text-blue-700",
  };
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

export default function ContasPagarPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [filters, setFilters] = useState({
    situacao: "",
    dtInicio: "",
    dtFim: "",
    busca: "",
  });

  async function loadData() {
    try {
      setLoading(true);
      let query = supabase
        .from("contas_pagar")
        .select("*")
        .order("data_vencimento", { ascending: true });

      if (filters.situacao) query = query.eq("situacao", filters.situacao);
      if (filters.dtInicio) query = query.gte("data_vencimento", filters.dtInicio);
      if (filters.dtFim) query = query.lte("data_vencimento", filters.dtFim);
      if (filters.busca) query = query.ilike("nome_cliente", `%${filters.busca}%`);

      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      setStatus(`Erro ao carregar: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  async function handleSync() {
    try {
      setSyncing(true);
      setStatus("Sincronizando com Tiny...");
      const result = await sincronizarTiny();
      setStatus(`Sincronizado! ${result.contas_pagar} contas a pagar atualizadas.`);
      await loadData();
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }

  function update(field, value) {
    setFilters((cur) => ({ ...cur, [field]: value }));
  }

  const totalAberto = useMemo(() =>
    rows.filter((r) => r.situacao === "aberto").reduce((s, r) => s + (r.saldo || 0), 0),
    [rows]
  );

  const totalPago = useMemo(() =>
    rows.filter((r) => r.situacao === "pago").reduce((s, r) => s + (r.valor || 0), 0),
    [rows]
  );

  const vencidos = useMemo(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return rows.filter((r) => r.situacao === "aberto" && r.data_vencimento < hoje);
  }, [rows]);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <div className="rounded-[24px] bg-red-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Total em Aberto</div>
          <div className="text-2xl font-black text-red-700">{fmt(totalAberto)}</div>
        </div>
        <div className="rounded-[24px] bg-green-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Total Pago</div>
          <div className="text-2xl font-black text-green-700">{fmt(totalPago)}</div>
        </div>
        <div className="rounded-[24px] bg-orange-50 p-5">
          <div className="text-xs font-semibold uppercase tracking-widest text-slate-500 mb-3">Vencidos</div>
          <div className="text-2xl font-black text-orange-700">{vencidos.length} contas</div>
          <div className="text-sm text-orange-600 mt-1">{fmt(vencidos.reduce((s, r) => s + (r.saldo || 0), 0))}</div>
        </div>
      </div>

      {/* Filtros */}
      <SectionCard>
        <div className="flex flex-wrap gap-3 items-end justify-between">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Buscar</div>
              <input
                type="text"
                value={filters.busca}
                onChange={(e) => update("busca", e.target.value)}
                className={inputClass()}
                placeholder="Fornecedor..."
              />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Situação</div>
              <select value={filters.situacao} onChange={(e) => update("situacao", e.target.value)} className={inputClass()}>
                <option value="">Todas</option>
                <option value="aberto">Aberto</option>
                <option value="pago">Pago</option>
                <option value="parcial">Parcial</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Vencimento de</div>
              <input type="date" value={filters.dtInicio} onChange={(e) => update("dtInicio", e.target.value)} className={inputClass()} />
            </div>
            <div>
              <div className="text-xs font-semibold text-slate-500 mb-1">Até</div>
              <input type="date" value={filters.dtFim} onChange={(e) => update("dtFim", e.target.value)} className={inputClass()} />
            </div>
            <button onClick={loadData} className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] px-5 py-2.5 text-sm font-bold text-white">
              Filtrar
            </button>
            <button onClick={() => setFilters({ situacao: "", dtInicio: "", dtFim: "", busca: "" })} className="rounded-2xl border border-[#E9D5FF] px-5 py-2.5 text-sm font-semibold text-[#6B1F87] bg-white">
              Limpar
            </button>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-2xl bg-[#6B1F87] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#5B1E74] disabled:opacity-50 transition"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Sincronizando..." : "Sincronizar Tiny"}
          </button>
        </div>

        {status && (
          <div className="mt-3 rounded-2xl bg-[#FCFAFF] px-4 py-3 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        )}
      </SectionCard>

      {/* Tabela */}
      <SectionCard>
        <h2 className="text-lg font-bold text-[#6B1F87] mb-4">
          Contas a Pagar
          <span className="ml-2 text-sm font-normal text-slate-400">{rows.length} registros</span>
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#E9D5FF]">
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Fornecedor</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Histórico</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Doc</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Emissão</th>
                <th className="text-left py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Vencimento</th>
                <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Valor</th>
                <th className="text-right py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Saldo</th>
                <th className="text-center py-3 px-4 text-xs font-bold uppercase tracking-wide text-slate-400">Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-12 text-slate-400">Nenhuma conta encontrada. Sincronize com o Tiny.</td></tr>
              ) : (
                rows.map((row) => {
                  const hoje = new Date().toISOString().slice(0, 10);
                  const vencido = row.situacao === "aberto" && row.data_vencimento < hoje;
                  return (
                    <tr key={row.id} className={`border-b border-[#F4ECFA] hover:bg-[#FCFAFF] transition ${vencido ? "bg-red-50/50" : ""}`}>
                      <td className="py-3 px-4 font-medium text-slate-700">{row.nome_cliente || "-"}</td>
                      <td className="py-3 px-4 text-slate-500 max-w-[200px] truncate">{row.historico || "-"}</td>
                      <td className="py-3 px-4 text-slate-500">{row.numero_doc || "-"}</td>
                      <td className="py-3 px-4 text-slate-500">{fmtDate(row.data_emissao)}</td>
                      <td className={`py-3 px-4 font-medium ${vencido ? "text-red-600" : "text-slate-700"}`}>
                        {fmtDate(row.data_vencimento)}
                        {vencido && <span className="ml-1 text-xs text-red-500">⚠ Vencido</span>}
                      </td>
                      <td className="py-3 px-4 text-right font-medium text-slate-700">{fmt(row.valor)}</td>
                      <td className="py-3 px-4 text-right font-bold text-red-700">{fmt(row.saldo)}</td>
                      <td className="py-3 px-4 text-center"><StatusBadge status={row.situacao} /></td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-[#4C1D95] text-white">
                  <td colSpan={5} className="py-3 px-4 font-bold">Total</td>
                  <td className="py-3 px-4 text-right font-bold">{fmt(rows.reduce((s, r) => s + (r.valor || 0), 0))}</td>
                  <td className="py-3 px-4 text-right font-bold text-red-300">{fmt(rows.reduce((s, r) => s + (r.saldo || 0), 0))}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </SectionCard>
    </div>
  );
}