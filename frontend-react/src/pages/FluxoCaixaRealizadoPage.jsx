import { useEffect, useState, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { TrendingUp, TrendingDown, Wallet, ChevronDown, ChevronRight } from "lucide-react";

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

function KpiCard({ title, value, icon: Icon, color }) {
  const colors = {
    green: { bg: "bg-green-50", text: "text-green-700", icon: "text-green-500" },
    red: { bg: "bg-red-50", text: "text-red-700", icon: "text-red-500" },
    purple: { bg: "bg-purple-50", text: "text-[#6B1F87]", icon: "text-[#6B1F87]" },
  };
  const c = colors[color] || colors.purple;

  return (
    <div className={`rounded-[24px] ${c.bg} p-5 ring-1 ring-white`}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</span>
        <Icon className={`h-4 w-4 ${c.icon}`} />
      </div>
      <div className={`text-2xl font-black ${c.text}`}>{value}</div>
    </div>
  );
}

function fmt(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function fmtDate(dateStr) {
  if (!dateStr) return "-";
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function getWeekNumber(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  const start = new Date(date.getFullYear(), 0, 1);
  return Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7);
}

function getGroupKey(dateStr, groupBy) {
  if (!dateStr) return "Sem data";
  const [y, m, d] = dateStr.split("-");
  if (groupBy === "dia") return `${d}/${m}/${y}`;
  if (groupBy === "mes") return `${m}/${y}`;
  if (groupBy === "ano") return y;
  // semana
  const week = getWeekNumber(dateStr);
  return `Sem ${week} — ${y}`;
}

function GroupRow({ label, credito, debito, count, children }) {
  const [open, setOpen] = useState(true);
  const saldo = (credito || 0) - (debito || 0);

  return (
    <div>
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between cursor-pointer px-4 py-3 bg-[#F4ECFA] rounded-2xl mb-1 hover:bg-purple-100 transition"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-[#6B1F87]" /> : <ChevronRight className="h-4 w-4 text-[#6B1F87]" />}
          <span className="font-bold text-[#6B1F87] text-sm">{label}</span>
          <span className="text-xs text-slate-400">{count} reg.</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-semibold">
          <span className="text-green-700">{fmt(credito)}</span>
          <span className="text-red-700">{fmt(debito)}</span>
          <span className={saldo >= 0 ? "text-[#6B1F87]" : "text-red-700"}>{fmt(saldo)}</span>
        </div>
      </div>
      {open && <div className="mb-2">{children}</div>}
    </div>
  );
}

function TransactionRow({ row }) {
  return (
    <div className="grid grid-cols-[100px_1fr_120px_120px_100px] gap-2 px-4 py-2.5 text-sm border-b border-[#F4ECFA] hover:bg-[#FCFAFF] transition">
      <span className="text-slate-500">{fmtDate(row.data)}</span>
      <span className="text-slate-700 truncate">{row.historico || "-"}</span>
      <span className="text-right text-green-700 font-medium">{row.credito ? fmt(row.credito) : "-"}</span>
      <span className="text-right text-red-700 font-medium">{row.debito ? fmt(row.debito) : "-"}</span>
      <span className={`text-right text-xs font-semibold rounded-full px-2 py-0.5 ${
        row.tipo === "Crédito" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"
      }`}>{row.tipo}</span>
    </div>
  );
}

export default function FluxoCaixaRealizadoPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [groupBy, setGroupBy] = useState("semana");
  const [filters, setFilters] = useState({
    dtInicio: "",
    dtFim: "",
    tipo: "",
    banco: "",
  });

  async function loadData() {
    try {
      setLoading(true);
      let query = supabase
        .from("extrato_ofx")
        .select("*")
        .order("data", { ascending: true });

      if (filters.dtInicio) query = query.gte("data", filters.dtInicio);
      if (filters.dtFim) query = query.lte("data", filters.dtFim);
      if (filters.tipo) query = query.eq("tipo", filters.tipo);
      if (filters.banco) query = query.eq("banco", filters.banco);

      const { data, error } = await query;
      if (error) throw error;
      setRows(data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  const totalCredito = useMemo(() => rows.reduce((s, r) => s + (r.credito || 0), 0), [rows]);
  const totalDebito = useMemo(() => rows.reduce((s, r) => s + (r.debito || 0), 0), [rows]);
  const saldo = totalCredito - totalDebito;

  const bancos = useMemo(() => [...new Set(rows.map((r) => r.banco).filter(Boolean))], [rows]);

  const grouped = useMemo(() => {
    const map = {};
    rows.forEach((row) => {
      const key = getGroupKey(row.data, groupBy);
      if (!map[key]) map[key] = { credito: 0, debito: 0, rows: [] };
      map[key].credito += row.credito || 0;
      map[key].debito += row.debito || 0;
      map[key].rows.push(row);
    });
    return map;
  }, [rows, groupBy]);

  function update(field, value) {
    setFilters((cur) => ({ ...cur, [field]: value }));
  }

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <KpiCard title="Total Créditos" value={fmt(totalCredito)} icon={TrendingUp} color="green" />
        <KpiCard title="Total Débitos" value={fmt(totalDebito)} icon={TrendingDown} color="red" />
        <KpiCard title="Saldo do Período" value={fmt(saldo)} icon={Wallet} color={saldo >= 0 ? "purple" : "red"} />
      </div>

      {/* Filtros */}
      <SectionCard>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">De</div>
            <input
              type="date"
              value={filters.dtInicio}
              onChange={(e) => update("dtInicio", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Até</div>
            <input
              type="date"
              value={filters.dtFim}
              onChange={(e) => update("dtFim", e.target.value)}
              className={inputClass()}
            />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Tipo</div>
            <select value={filters.tipo} onChange={(e) => update("tipo", e.target.value)} className={inputClass()}>
              <option value="">Todos</option>
              <option>Crédito</option>
              <option>Débito</option>
            </select>
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Banco</div>
            <select value={filters.banco} onChange={(e) => update("banco", e.target.value)} className={inputClass()}>
              <option value="">Todos</option>
              {bancos.map((b) => <option key={b}>{b}</option>)}
            </select>
          </div>
          <button
            onClick={loadData}
            className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] px-5 py-2.5 text-sm font-bold text-white"
          >
            Aplicar filtros
          </button>
          <button
            onClick={() => { setFilters({ dtInicio: "", dtFim: "", tipo: "", banco: "" }); }}
            className="rounded-2xl border border-[#E9D5FF] px-5 py-2.5 text-sm font-semibold text-[#6B1F87] bg-white"
          >
            Limpar
          </button>
        </div>
      </SectionCard>

      {/* Tabela */}
      <SectionCard>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-[#6B1F87]">
            Lançamentos
            <span className="ml-2 text-sm font-normal text-slate-400">{rows.length} registros</span>
          </h2>
          <div className="flex gap-2">
            {["dia", "semana", "mes", "ano"].map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`rounded-2xl px-3 py-1.5 text-xs font-bold transition ${
                  groupBy === g
                    ? "bg-[#6B1F87] text-white"
                    : "bg-[#FCFAFF] text-[#6B1F87] ring-1 ring-[#E9D5FF]"
                }`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Header tabela */}
        <div className="grid grid-cols-[100px_1fr_120px_120px_100px] gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 border-b border-[#E9D5FF]">
          <span>Data</span>
          <span>Histórico</span>
          <span className="text-right">Crédito</span>
          <span className="text-right">Débito</span>
          <span className="text-right">Tipo</span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Carregando...</div>
        ) : Object.keys(grouped).length === 0 ? (
          <div className="py-12 text-center text-slate-400">Nenhum lançamento encontrado.</div>
        ) : (
          <div className="mt-2 space-y-2">
            {Object.entries(grouped).map(([key, group]) => (
              <GroupRow
                key={key}
                label={key}
                credito={group.credito}
                debito={group.debito}
                count={group.rows.length}
              >
                {group.rows.map((row) => (
                  <TransactionRow key={row.id} row={row} />
                ))}
              </GroupRow>
            ))}
          </div>
        )}

        {/* Totais */}
        <div className="mt-4 grid grid-cols-[100px_1fr_120px_120px_100px] gap-2 px-4 py-3 bg-[#4C1D95] rounded-2xl text-white text-sm font-bold">
          <span>Total</span>
          <span></span>
          <span className="text-right text-green-300">{fmt(totalCredito)}</span>
          <span className="text-right text-red-300">{fmt(totalDebito)}</span>
          <span className="text-right">{fmt(saldo)}</span>
        </div>
      </SectionCard>
    </div>
  );
}