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

function getWeekRange(dateStr) {
  const date = new Date(dateStr + "T12:00:00");
  const day = date.getDay();
  const monday = new Date(date);
  monday.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt2 = (d) => `${String(d.getDate()).padStart(2,"0")}/${String(d.getMonth()+1).padStart(2,"0")}`;
  return `${fmt2(monday)} a ${fmt2(sunday)}`;
}

function TransactionRow({ row }) {
  return (
    <div className="grid grid-cols-[1fr_130px_130px_90px] gap-2 px-6 py-2.5 text-sm border-b border-[#F4ECFA] hover:bg-[#FCFAFF] transition">
      <span className="text-slate-600 truncate">{row.historico || "-"}</span>
      <span className="text-right text-green-700 font-medium">{row.credito ? fmt(row.credito) : "-"}</span>
      <span className="text-right text-red-700 font-medium">{row.debito ? fmt(row.debito) : "-"}</span>
      <span className={`text-right text-xs font-semibold ${
        row.tipo === "Crédito" ? "text-green-600" : "text-red-600"
      }`}>{row.tipo}</span>
    </div>
  );
}

function DayGroup({ date, rows, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const credito = rows.reduce((s, r) => s + (r.credito || 0), 0);
  const debito = rows.reduce((s, r) => s + (r.debito || 0), 0);
  const saldo = credito - debito;

  return (
    <div className="mb-1">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between cursor-pointer px-4 py-2.5 bg-white rounded-xl hover:bg-purple-50 transition border border-[#E9D5FF]"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-[#6B1F87]" /> : <ChevronRight className="h-3.5 w-3.5 text-[#6B1F87]" />}
          <span className="font-bold text-[#6B1F87] text-sm">{fmtDate(date)}</span>
          <span className="text-xs text-slate-400">{rows.length} reg.</span>
        </div>
        <div className="flex items-center gap-6 text-xs font-semibold">
          {credito > 0 && <span className="text-green-700">{fmt(credito)}</span>}
          {debito > 0 && <span className="text-red-700">{fmt(debito)}</span>}
          <span className={`font-bold ${saldo >= 0 ? "text-[#6B1F87]" : "text-red-700"}`}>{fmt(saldo)}</span>
        </div>
      </div>
      {open && (
        <div className="ml-2 mt-1 rounded-xl overflow-hidden border border-[#E9D5FF]">
          {/* Header mini */}
          <div className="grid grid-cols-[1fr_130px_130px_90px] gap-2 px-6 py-2 text-xs font-bold uppercase tracking-wide text-slate-400 bg-[#FCFAFF] border-b border-[#E9D5FF]">
            <span>Histórico</span>
            <span className="text-right">Crédito</span>
            <span className="text-right">Débito</span>
            <span className="text-right">Tipo</span>
          </div>
          {rows.map((row) => <TransactionRow key={row.id} row={row} />)}
        </div>
      )}
    </div>
  );
}

function WeekGroup({ weekLabel, days, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  const allRows = Object.values(days).flat();
  const credito = allRows.reduce((s, r) => s + (r.credito || 0), 0);
  const debito = allRows.reduce((s, r) => s + (r.debito || 0), 0);
  const saldo = credito - debito;
  const count = allRows.length;

  return (
    <div className="mb-3">
      <div
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between cursor-pointer px-4 py-3 bg-[#4C1D95] rounded-2xl hover:bg-[#3b1672] transition"
      >
        <div className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4 text-white" /> : <ChevronRight className="h-4 w-4 text-white" />}
          <span className="font-bold text-white text-sm">{weekLabel}</span>
          <span className="text-xs text-white/50">{count} reg.</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-bold">
          <span className="text-green-300">{fmt(credito)}</span>
          <span className="text-red-300">{fmt(debito)}</span>
          <span className={`text-white`}>{fmt(saldo)}</span>
        </div>
      </div>

      {open && (
        <div className="mt-2 ml-2 space-y-1">
          {Object.entries(days).map(([date, rows]) => (
            <DayGroup key={date} date={date} rows={rows} defaultOpen={Object.keys(days).length === 1} />
          ))}
        </div>
      )}
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

  // Agrupa por semana → dia
  const groupedBySemana = useMemo(() => {
    const weeks = {};
    rows.forEach((row) => {
      if (!row.data) return;
      const week = getWeekNumber(row.data);
      const year = row.data.slice(0, 4);
      const range = getWeekRange(row.data);
      const weekKey = `Sem ${week} — ${range}/${year}`;
      if (!weeks[weekKey]) weeks[weekKey] = {};
      if (!weeks[weekKey][row.data]) weeks[weekKey][row.data] = [];
      weeks[weekKey][row.data].push(row);
    });
    return weeks;
  }, [rows]);

  // Agrupa por mês → dia
  const groupedByMes = useMemo(() => {
    const months = {};
    rows.forEach((row) => {
      if (!row.data) return;
      const [y, m] = row.data.split("-");
      const monthKey = `${m}/${y}`;
      if (!months[monthKey]) months[monthKey] = {};
      if (!months[monthKey][row.data]) months[monthKey][row.data] = [];
      months[monthKey][row.data].push(row);
    });
    return months;
  }, [rows]);

  // Agrupa só por dia
  const groupedByDia = useMemo(() => {
    const days = {};
    rows.forEach((row) => {
      if (!row.data) return;
      if (!days[row.data]) days[row.data] = [];
      days[row.data].push(row);
    });
    return days;
  }, [rows]);

  function update(field, value) {
    setFilters((cur) => ({ ...cur, [field]: value }));
  }

  const fmt2 = (v) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
        <KpiCard title="Total Créditos" value={fmt2(totalCredito)} icon={TrendingUp} color="green" />
        <KpiCard title="Total Débitos" value={fmt2(totalDebito)} icon={TrendingDown} color="red" />
        <KpiCard title="Saldo do Período" value={fmt2(saldo)} icon={Wallet} color={saldo >= 0 ? "purple" : "red"} />
      </div>

      {/* Filtros */}
      <SectionCard>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">De</div>
            <input type="date" value={filters.dtInicio} onChange={(e) => update("dtInicio", e.target.value)} className={inputClass()} />
          </div>
          <div>
            <div className="text-xs font-semibold text-slate-500 mb-1">Até</div>
            <input type="date" value={filters.dtFim} onChange={(e) => update("dtFim", e.target.value)} className={inputClass()} />
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
          <button onClick={loadData} className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] px-5 py-2.5 text-sm font-bold text-white">
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
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-[#6B1F87]">
            Lançamentos
            <span className="ml-2 text-sm font-normal text-slate-400">{rows.length} registros</span>
          </h2>
          <div className="flex gap-2">
            {["dia", "semana", "mes"].map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={`rounded-2xl px-3 py-1.5 text-xs font-bold transition ${
                  groupBy === g ? "bg-[#6B1F87] text-white" : "bg-[#FCFAFF] text-[#6B1F87] ring-1 ring-[#E9D5FF]"
                }`}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Carregando...</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center text-slate-400">Nenhum lançamento encontrado.</div>
        ) : (
          <div className="space-y-1">
            {groupBy === "semana" && Object.entries(groupedBySemana).map(([week, days]) => (
              <WeekGroup key={week} weekLabel={week} days={days} />
            ))}

            {groupBy === "mes" && Object.entries(groupedByMes).map(([month, days]) => (
              <WeekGroup key={month} weekLabel={month} days={days} />
            ))}

            {groupBy === "dia" && Object.entries(groupedByDia).map(([date, dayRows]) => (
              <DayGroup key={date} date={date} rows={dayRows} defaultOpen={false} />
            ))}
          </div>
        )}

        {/* Totais */}
        <div className="mt-6 grid grid-cols-[1fr_130px_130px_90px] gap-2 px-4 py-3 bg-[#4C1D95] rounded-2xl text-white text-sm font-bold">
          <span>Total Geral</span>
          <span className="text-right text-green-300">{fmt2(totalCredito)}</span>
          <span className="text-right text-red-300">{fmt2(totalDebito)}</span>
          <span className="text-right">{fmt2(saldo)}</span>
        </div>
      </SectionCard>
    </div>
  );
}