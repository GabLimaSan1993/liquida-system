import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { sincronizarTinyAno } from "../services/tinyService.js";
import { RefreshCw, ChevronDown, X } from "lucide-react";

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

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function KpiCard({ title, value, subtitle, color, onClick, active }) {
  const colors = {
    red: { bg: active ? "bg-red-600" : "bg-red-50", text: active ? "text-white" : "text-red-700", sub: active ? "text-red-100" : "text-red-400" },
    green: { bg: active ? "bg-green-600" : "bg-green-50", text: active ? "text-white" : "text-green-700", sub: active ? "text-green-100" : "text-green-400" },
    orange: { bg: active ? "bg-orange-500" : "bg-orange-50", text: active ? "text-white" : "text-orange-700", sub: active ? "text-orange-100" : "text-orange-400" },
    blue: { bg: active ? "bg-blue-600" : "bg-blue-50", text: active ? "text-white" : "text-blue-700", sub: active ? "text-blue-100" : "text-blue-400" },
    purple: { bg: active ? "bg-[#6B1F87]" : "bg-purple-50", text: active ? "text-white" : "text-[#6B1F87]", sub: active ? "text-purple-200" : "text-purple-400" },
  };
  const c = colors[color] || colors.purple;
  return (
    <div
      onClick={onClick}
      className={`rounded-[24px] ${c.bg} p-5 transition ${onClick ? "cursor-pointer hover:opacity-90" : ""}`}
    >
      <div className={`text-xs font-semibold uppercase tracking-widest mb-3 ${c.sub}`}>{title}</div>
      <div className={`text-2xl font-black ${c.text}`}>{value}</div>
      {subtitle && <div className={`text-xs mt-1 ${c.sub}`}>{subtitle}</div>}
    </div>
  );
}

function AVencerModal({ rows, onClose }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const d7 = addDays(7);
  const d14 = addDays(14);
  const d21 = addDays(21);
  const d28 = addDays(28);

  const faixas = [
    { label: "Próximos 7 dias", rows: rows.filter((r) => r.data_vencimento >= hoje && r.data_vencimento <= d7) },
    { label: "8 a 14 dias", rows: rows.filter((r) => r.data_vencimento > d7 && r.data_vencimento <= d14) },
    { label: "15 a 21 dias", rows: rows.filter((r) => r.data_vencimento > d14 && r.data_vencimento <= d21) },
    { label: "22 a 28 dias", rows: rows.filter((r) => r.data_vencimento > d21 && r.data_vencimento <= d28) },
    { label: "+ 28 dias", rows: rows.filter((r) => r.data_vencimento > d28) },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl rounded-[28px] bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-black text-[#6B1F87]">A Vencer</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          {faixas.map((faixa) => (
            <div key={faixa.label} className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
              <div className="flex items-center justify-between mb-2">
                <span className="font-bold text-[#6B1F87]">{faixa.label}</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-slate-500">{faixa.rows.length} contas</span>
                  <span className="font-black text-red-700">{fmt(faixa.rows.reduce((s, r) => s + (r.saldo || 0), 0))}</span>
                </div>
              </div>
              {faixa.rows.length > 0 && (
                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
                  {faixa.rows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between text-sm py-1 border-b border-[#E9D5FF]">
                      <span className="text-slate-600 truncate max-w-[60%]">{r.nome_cliente || "-"}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 text-xs">{fmtDate(r.data_vencimento)}</span>
                        <span className="font-semibold text-red-700">{fmt(r.saldo)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ContasPagarPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState("");
  const [showAVencer, setShowAVencer] = useState(false);
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
        .order("data_vencimento", { ascending: true })
        .limit(50000);

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
    const anoAtual = new Date().getFullYear();
    const anos = [2023, 2024, 2025, anoAtual].filter((a, i, arr) => arr.indexOf(a) === i);
    try {
      setSyncing(true);
      let totalCP = 0;
      for (const ano of anos) {
        setStatus(`Sincronizando ${ano}...`);
        const result = await sincronizarTinyAno(ano);
        totalCP += result.contas_pagar || 0;
      }
      setStatus(`Sincronizado! ${totalCP} contas a pagar atualizadas.`);
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

  const hoje = new Date().toISOString().slice(0, 10);

  const totalAberto = useMemo(() =>
    rows.filter((r) => r.situacao === "aberto").reduce((s, r) => s + (r.saldo || 0), 0),
    [rows]
  );

  const totalPago = useMemo(() =>
    rows.filter((r) => r.situacao === "pago").reduce((s, r) => s + (r.valor || 0), 0),
    [rows]
  );

  const vencidos = useMemo(() =>
    rows.filter((r) => r.situacao === "aberto" && r.data_vencimento < hoje),
    [rows, hoje]
  );

  const aVencer = useMemo(() =>
    rows.filter((r) => r.situacao === "aberto" && r.data_vencimento >= hoje),
    [rows, hoje]
  );

  const totalParcial = useMemo(() =>
    rows.filter((r) => r.situacao === "parcial").reduce((s, r) => s + (r.saldo || 0), 0),
    [rows]
  );

  return (
    <>
      {showAVencer && (
        <AVencerModal rows={aVencer} onClose={() => setShowAVencer(false)} />
      )}

      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          <KpiCard
            title="Total em Aberto"
            value={fmt(totalAberto)}
            subtitle={`${rows.filter((r) => r.situacao === "aberto").length} contas`}
            color="red"
          />
          <KpiCard
            title="A Vencer"
            value={fmt(aVencer.reduce((s, r) => s + (r.saldo || 0), 0))}
            subtitle={`${aVencer.length} contas — clique para detalhar`}
            color="blue"
            onClick={() => setShowAVencer(true)}
          />
          <KpiCard
            title="Vencidos"
            value={fmt(vencidos.reduce((s, r) => s + (r.saldo || 0), 0))}
            subtitle={`${vencidos.length} contas`}
            color="orange"
          />
          <KpiCard
            title="Total Pago"
            value={fmt(totalPago)}
            subtitle={`${rows.filter((r) => r.situacao === "pago").length} contas`}
            color="green"
          />
        </div>

        <SectionCard>
          <div className="flex flex-wrap gap-3 items-end justify-between">
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <div className="text-xs font-semibold text-slate-500 mb-1">Buscar</div>
                <input type="text" value={filters.busca} onChange={(e) => update("busca", e.target.value)} className={inputClass()} placeholder="Fornecedor..." />
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
              <button onClick={loadData} className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] px-5 py-2.5 text-sm font-bold text-white">Filtrar</button>
              <button onClick={() => setFilters({ situacao: "", dtInicio: "", dtFim: "", busca: "" })} className="rounded-2xl border border-[#E9D5FF] px-5 py-2.5 text-sm font-semibold text-[#6B1F87] bg-white">Limpar</button>
            </div>
            <button onClick={handleSync} disabled={syncing} className="flex items-center gap-2 rounded-2xl bg-[#6B1F87] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#5B1E74] disabled:opacity-50 transition">
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
                  <tr><td colSpan={8} className="text-center py-12 text-slate-400">Nenhuma conta encontrada.</td></tr>
                ) : (
                  rows.map((row) => {
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
    </>
  );
}