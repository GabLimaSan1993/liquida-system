import { useState, useEffect } from "react";
import {
  Clock, Users, TrendingUp, Search, ChevronDown,
  AlertTriangle, CheckCircle, ArrowRight, BarChart3
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend
} from "recharts";
import { supabase } from "../../lib/supabase";

// ── Helpers ──────────────────────────────────────────────
function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtPct(v, total) {
  if (!total) return "0,0%";
  return ((v / total) * 100).toFixed(1).replace(".", ",") + "%";
}

// ── Paleta ───────────────────────────────────────────────
const ETAPA_COLORS = {
  "Recebimento":                           "#7F2D92",
  "Triagem Funcional":                     "#9B3AAD",
  "Triagem Cosmética":                     "#B347C8",
  "Laudo":                                 "#F97316",
  "Alocação":                              "#F59E0B",
  "Oracle":                                "#5B1E74",
  "Produto expedido":                      "#10b981",
  "Reservado para reparo":                 "#ef4444",
  "Retorno de Reparo":                     "#f87171",
  "Reservado para pedido B2B":             "#3b82f6",
  "Reservado para pedido B2C":             "#60a5fa",
  "Produto vinculado com pedido":          "#06b6d4",
  "Produto alocado em box":                "#0891b2",
  "Triagem ALS":                           "#8b5cf6",
  "Laudo ALS":                             "#7c3aed",
  "Nota fiscal anexada":                   "#64748b",
  "Movimentação de sub inventário realizado": "#94a3b8",
};

const ETAPA_ORDEM = [
  "Recebimento",
  "Triagem Funcional",
  "Triagem Cosmética",
  "Laudo",
  "Alocação",
  "Oracle",
  "Produto vinculado com pedido",
  "Produto alocado em box",
  "Produto expedido",
];

// ── Componentes base ─────────────────────────────────────
function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, icon: Icon, color = "text-[#7F2D92]" }) {
  return (
    <h3 className={`font-black text-slate-800 flex items-center gap-2 mb-4 ${color}`}>
      <Icon className="h-4 w-4" />
      {children}
    </h3>
  );
}

function KpiMini({ label, value, sub, color = "bg-purple-50 ring-purple-200 text-purple-700" }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${color}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-semibold mt-0.5 opacity-80">{label}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
    </div>
  );
}

function TabBtn({ label, icon: Icon, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
        active
          ? "bg-[#7F2D92] text-white shadow-md"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </button>
  );
}

function MesSelector({ meses, mesSel, onChange }) {
  const [open, setOpen] = useState(false);
  const todos = mesSel.length === meses.length;

  function toggleMes(m) {
    if (mesSel.includes(m)) {
      if (mesSel.length === 1) return;
      onChange(mesSel.filter(x => x !== m));
    } else {
      onChange([...mesSel, m]);
    }
  }

  function toggleTodos() {
    if (todos) onChange([meses[0]]);
    else onChange([...meses]);
  }

  const label = todos
    ? "Todos os meses"
    : mesSel.length === 1
    ? mesSel[0]
    : `${mesSel.length} meses selecionados`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] cursor-pointer hover:border-purple-300 transition-all min-w-[210px] justify-between"
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-20 bg-white rounded-2xl shadow-xl ring-1 ring-slate-200 p-2 min-w-[210px] max-h-80 overflow-y-auto">
            <button
              onClick={toggleTodos}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${
                todos ? "bg-[#7F2D92] text-white" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                todos ? "border-white bg-white" : "border-slate-300"
              }`}>
                {todos && (
                  <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#7F2D92" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              Todos os meses
            </button>

            <div className="h-px bg-slate-100 mx-2 mb-1" />

            {meses.map(m => {
              const sel = mesSel.includes(m);
              return (
                <button key={m} onClick={() => toggleMes(m)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all ${
                    sel ? "text-[#7F2D92] font-semibold bg-purple-50" : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    sel ? "border-[#7F2D92] bg-[#7F2D92]" : "border-slate-300"
                  }`}>
                    {sel && (
                      <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                        <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5"
                          strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {m}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ── Tooltip customizado ───────────────────────────────────
function CustomTooltipBar({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-2xl shadow-xl ring-1 ring-purple-100 px-4 py-3 text-sm">
      <p className="font-bold text-slate-700 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-semibold">
          {fmtN(p.value)} unidades
        </p>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 1 — FUNIL DE PRODUÇÃO
// ══════════════════════════════════════════════════════════
function TabFunil({ mes }) {
  const [data, setData]       = useState(null);
  const [ciclo, setCiclo]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [{ data: etapas }, { data: cicloData }] = await Promise.all([
        supabase.rpc("assurant_sla_volume_etapas", { meses: mes }),
        supabase.rpc("assurant_sla_ciclo_total",   { meses: mes }),
      ]);

      // Montar mapa de volumes
      const volumeMap = {};
      (etapas || []).forEach(r => { volumeMap[r.etapa] = Number(r.total); });

      // Total geral
      const total = Object.values(volumeMap).reduce((s, v) => s + v, 0);

      // Funil ordenado
      const funil = ETAPA_ORDEM
        .filter(e => volumeMap[e])
        .map(e => ({ etapa: e, total: volumeMap[e] }));

      // Outras etapas não no funil principal
      const outras = (etapas || [])
        .filter(r => !ETAPA_ORDEM.includes(r.etapa))
        .map(r => ({ etapa: r.etapa, total: Number(r.total) }));

      setData({ funil, outras, volumeMap, total });
      setCiclo(cicloData?.[0] || null);
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data)   return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { funil, outras, total } = data;
  const maxFunil = funil[0]?.total || 1;

  return (
    <div className="space-y-4">
      {/* KPIs ciclo total */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total Movimentações" value={fmtN(total)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        {ciclo && (
          <>
            <KpiMini label="Ciclo Médio (Rec→Exp)" value={`${ciclo.media_dias}d`}
              sub={`${fmtN(ciclo.total)} vouchers completos`}
              color="bg-blue-50 ring-blue-200 text-blue-700" />
            <KpiMini label="Ciclo Mínimo" value={`${ciclo.minimo_dias}d`}
              color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
            <KpiMini label="Ciclo Máximo" value={`${ciclo.maximo_dias}d`}
              color="bg-orange-50 ring-orange-200 text-orange-700" />
          </>
        )}
      </div>

      {/* Funil visual */}
      <Card>
        <SectionTitle icon={TrendingUp}>Funil de Produção — Etapas Principais</SectionTitle>
        <div className="space-y-3">
          {funil.map(({ etapa, total: qtd }, idx) => {
            const pct     = (qtd / maxFunil) * 100;
            const pctTotal = fmtPct(qtd, total);
            const cor     = ETAPA_COLORS[etapa] || "#94a3b8";

            return (
              <div key={etapa} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-4">{idx + 1}</span>
                    <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cor }} />
                    <span className="font-semibold text-slate-700">{etapa}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400">{pctTotal}</span>
                    <span className="font-bold text-slate-800 w-20 text-right">{fmtN(qtd)}</span>
                  </div>
                </div>
                <div className="h-6 bg-slate-100 rounded-xl overflow-hidden relative">
                  <div
                    className="h-full rounded-xl flex items-center justify-end pr-3 transition-all duration-700"
                    style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: cor }}
                  >
                    {pct >= 15 && (
                      <span className="text-white text-xs font-bold">{fmtN(qtd)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Outras etapas */}
      {outras.length > 0 && (
        <Card>
          <SectionTitle icon={ArrowRight}>Etapas Complementares</SectionTitle>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {outras.map(({ etapa, total: qtd }) => (
              <div key={etapa} className="flex items-center justify-between text-sm px-3 py-2 rounded-xl bg-slate-50">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: ETAPA_COLORS[etapa] || "#94a3b8" }} />
                  <span className="font-medium text-slate-600">{etapa}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-400">{fmtPct(qtd, total)}</span>
                  <span className="font-bold text-slate-800">{fmtN(qtd)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 2 — TEMPO ENTRE ETAPAS
// ══════════════════════════════════════════════════════════
function TabTempos({ mes }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase.rpc("assurant_sla_tempo_etapas", { meses: mes });
      setData(rows || []);
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data?.length) return <p className="text-slate-400 text-sm">Sem dados.</p>;

  // Filtrar transições mais relevantes (funil principal)
  const principais = data.filter(r =>
    ETAPA_ORDEM.includes(r.etapa) && ETAPA_ORDEM.includes(r.prox_etapa)
  );

  const outras = data.filter(r =>
    !principais.includes(r)
  ).slice(0, 10);

  function corTempo(horas) {
    if (horas <= 24)  return "text-emerald-600 bg-emerald-50 ring-emerald-200";
    if (horas <= 72)  return "text-yellow-600 bg-yellow-50 ring-yellow-200";
    if (horas <= 168) return "text-orange-600 bg-orange-50 ring-orange-200";
    return "text-red-600 bg-red-50 ring-red-200";
  }

  function labelTempo(horas) {
    if (horas < 24)   return `${horas}h`;
    const dias = (horas / 24).toFixed(1);
    return `${dias}d`;
  }

  return (
    <div className="space-y-4">

      {/* Legenda */}
      <div className="flex items-center gap-3 flex-wrap text-xs">
        <span className="font-semibold text-slate-500">Referência SLA:</span>
        <span className="bg-emerald-50 text-emerald-600 ring-1 ring-emerald-200 px-2 py-1 rounded-lg font-semibold">≤ 24h ✓</span>
        <span className="bg-yellow-50 text-yellow-600 ring-1 ring-yellow-200 px-2 py-1 rounded-lg font-semibold">24-72h atenção</span>
        <span className="bg-orange-50 text-orange-600 ring-1 ring-orange-200 px-2 py-1 rounded-lg font-semibold">3-7d alerta</span>
        <span className="bg-red-50 text-red-600 ring-1 ring-red-200 px-2 py-1 rounded-lg font-semibold">&gt; 7d crítico</span>
      </div>

      {/* Transições principais */}
      <Card>
        <SectionTitle icon={Clock}>Tempo Médio — Funil Principal</SectionTitle>
        <div className="space-y-3">
          {principais.map((r, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 hover:bg-purple-50 transition-all">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: ETAPA_COLORS[r.etapa] || "#94a3b8" }} />
                <span className="text-xs font-semibold text-slate-600 truncate">{r.etapa}</span>
                <ArrowRight className="h-3 w-3 text-slate-300 shrink-0" />
                <div className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: ETAPA_COLORS[r.prox_etapa] || "#94a3b8" }} />
                <span className="text-xs font-semibold text-slate-600 truncate">{r.prox_etapa}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`text-xs font-bold px-2 py-1 rounded-lg ring-1 ${corTempo(Number(r.media_horas))}`}>
                  {labelTempo(Number(r.media_horas))}
                </span>
                <span className="text-xs text-slate-400">{fmtN(r.total)} casos</span>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Outras transições */}
      {outras.length > 0 && (
        <Card>
          <SectionTitle icon={Clock}>Outras Transições</SectionTitle>
          <div className="space-y-2">
            {outras.map((r, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 text-xs">
                <span className="text-slate-500 truncate flex-1">
                  {r.etapa} → {r.prox_etapa}
                </span>
                <span className={`font-bold px-2 py-0.5 rounded-lg ring-1 ${corTempo(Number(r.media_horas))}`}>
                  {labelTempo(Number(r.media_horas))}
                </span>
                <span className="text-slate-400">{fmtN(r.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 3 — PRODUTIVIDADE POR USUÁRIO
// ══════════════════════════════════════════════════════════
function TabUsuarios({ mes }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [etapaFiltro, setEtapa] = useState("Todas");

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase.rpc("assurant_sla_usuarios", { meses: mes });
      setData(rows || []);
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data?.length) return <p className="text-slate-400 text-sm">Sem dados.</p>;

  // Agregar por usuário
  const porUsuario = {};
  const etapas     = new Set(["Todas"]);

  data.forEach(r => {
    const qtd = Number(r.total);
    etapas.add(r.etapa);
    if (!porUsuario[r.usuario]) porUsuario[r.usuario] = { total: 0, etapas: {} };
    porUsuario[r.usuario].total += qtd;
    porUsuario[r.usuario].etapas[r.etapa] = (porUsuario[r.usuario].etapas[r.etapa] || 0) + qtd;
  });

  const totalGeral = Object.values(porUsuario).reduce((s, u) => s + u.total, 0);

  // Filtrar por etapa
  const usuariosArr = Object.entries(porUsuario)
    .map(([nome, info]) => ({
      nome,
      total: etapaFiltro === "Todas"
        ? info.total
        : (info.etapas[etapaFiltro] || 0),
    }))
    .filter(u => u.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 15);

  const maxUser = usuariosArr[0]?.total || 1;

  // Dados para gráfico de barras top 8
  const chartData = usuariosArr.slice(0, 8).map(u => ({
    name: u.nome.split(" ")[0], // primeiro nome
    total: u.total,
  }));

  return (
    <div className="space-y-4">

      {/* Filtro por etapa */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500">Filtrar por etapa:</span>
        {[...etapas].slice(0, 10).map(e => (
          <button key={e}
            onClick={() => setEtapa(e)}
            className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
              etapaFiltro === e
                ? "bg-[#7F2D92] text-white"
                : "bg-slate-100 text-slate-600 hover:bg-purple-50"
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      {/* Gráfico top 8 */}
      <Card>
        <SectionTitle icon={BarChart3}>Top 8 Usuários — {etapaFiltro}</SectionTitle>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip content={<CustomTooltipBar />} />
            <Bar dataKey="total" fill="#7F2D92" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Lista completa */}
      <Card>
        <SectionTitle icon={Users}>Ranking de Produtividade</SectionTitle>
        <div className="space-y-3">
          {usuariosArr.map(({ nome, total: qtd }, idx) => {
            const pct = (qtd / maxUser) * 100;
            const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `${idx + 1}.`;
            return (
              <div key={nome} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-sm w-6 shrink-0">{medal}</span>
                    <span className="font-semibold text-slate-700 truncate max-w-[200px]">{nome}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-slate-400">
                      {fmtPct(qtd, totalGeral)}
                    </span>
                    <span className="font-bold text-slate-800 w-16 text-right">{fmtN(qtd)}</span>
                  </div>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: idx === 0 ? "#7F2D92" : idx === 1 ? "#9B3AAD" : idx === 2 ? "#B347C8" : "#C084FC",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 4 — PRODUÇÃO DIÁRIA
// ══════════════════════════════════════════════════════════
function TabDiaria({ mes }) {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [etapasSel, setEtapas]  = useState(["Triagem Funcional", "Triagem Cosmética", "Laudo"]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase.rpc("assurant_sla_producao_diaria", { meses: mes });
      setData(rows || []);
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data?.length) return <p className="text-slate-400 text-sm">Sem dados.</p>;

  // Agregar por dia e etapa
  const diasMap = {};
  const etapasDisp = new Set();

  data.forEach(r => {
    etapasDisp.add(r.etapa);
    if (!diasMap[r.dia]) diasMap[r.dia] = {};
    diasMap[r.dia][r.etapa] = Number(r.total);
  });

  const chartData = Object.entries(diasMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .slice(-30) // últimos 30 dias
    .map(([dia, etapas]) => ({
      dia: dia.slice(5), // MM-DD
      ...etapas,
    }));

  const etapasFiltro = [...etapasDisp].filter(e => ETAPA_ORDEM.includes(e));

  function toggleEtapa(e) {
    if (etapasSel.includes(e)) {
      if (etapasSel.length === 1) return;
      setEtapas(etapasSel.filter(x => x !== e));
    } else {
      setEtapas([...etapasSel, e]);
    }
  }

  return (
    <div className="space-y-4">

      {/* Filtro etapas */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-semibold text-slate-500">Etapas:</span>
        {etapasFiltro.map(e => (
          <button key={e}
            onClick={() => toggleEtapa(e)}
            className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1.5 ${
              etapasSel.includes(e) ? "text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
            style={etapasSel.includes(e) ? { backgroundColor: ETAPA_COLORS[e] || "#7F2D92" } : {}}
          >
            <div className="h-2 w-2 rounded-full bg-current opacity-70" />
            {e}
          </button>
        ))}
      </div>

      {/* Gráfico de linha diária */}
      <Card>
        <SectionTitle icon={TrendingUp}>Produção Diária — Últimos 30 dias</SectionTitle>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="dia" tick={{ fontSize: 10, fill: "#94a3b8" }}
              interval={Math.floor(chartData.length / 10)} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} />
            <Tooltip
              contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
              formatter={(v, name) => [fmtN(v), name]}
            />
            <Legend
              formatter={(value) => (
                <span style={{ fontSize: 11, color: "#475569" }}>{value}</span>
              )}
            />
            {etapasSel.map(e => (
              <Line
                key={e}
                type="monotone"
                dataKey={e}
                stroke={ETAPA_COLORS[e] || "#94a3b8"}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Resumo por dia — últimos 7 */}
      <Card>
        <SectionTitle icon={Clock}>Últimos 7 dias — Volume por Etapa</SectionTitle>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-2 text-left font-bold text-slate-500 rounded-l-xl">Etapa</th>
                {Object.keys(diasMap).sort().slice(-7).map(d => (
                  <th key={d} className="px-3 py-2 text-right font-bold text-slate-500 whitespace-nowrap">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {etapasFiltro.map(e => (
                <tr key={e} className="hover:bg-slate-50">
                  <td className="px-3 py-2 font-semibold text-slate-700 flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: ETAPA_COLORS[e] || "#94a3b8" }} />
                    {e}
                  </td>
                  {Object.keys(diasMap).sort().slice(-7).map(d => (
                    <td key={d} className="px-3 py-2 text-right font-semibold text-slate-700">
                      {fmtN(diasMap[d]?.[e] || 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 5 — BUSCA POR VOUCHER
// ══════════════════════════════════════════════════════════
function TabBusca() {
  const [voucher, setVoucher]   = useState("");
  const [resultado, setResultado] = useState(null);
  const [loading, setLoading]   = useState(false);
  const [erro, setErro]         = useState("");

  async function buscar() {
    if (!voucher.trim()) return;
    setLoading(true);
    setErro("");
    setResultado(null);

    const { data, error } = await supabase.rpc("assurant_busca_voucher", {
      p_voucher: voucher.trim().toUpperCase()
    });

    if (error) {
      setErro(error.message);
    } else if (!data?.length) {
      setErro(`Voucher "${voucher.trim()}" não encontrado na base.`);
    } else {
      setResultado(data);
    }
    setLoading(false);
  }

  // Calcular tempo entre etapas
  function calcTempos(rows) {
    return rows.map((r, idx) => {
      if (idx === 0) return { ...r, delta: null };
      const ant  = new Date(rows[idx - 1].data_etapa);
      const atual = new Date(r.data_etapa);
      const diffH = ((atual - ant) / 3600000).toFixed(1);
      const diffD = (diffH / 24).toFixed(1);
      return { ...r, delta: { horas: diffH, dias: diffD } };
    });
  }

  const timeline = resultado ? calcTempos(resultado) : [];

  // Ciclo total
  const cicloTotal = timeline.length > 1
    ? ((new Date(timeline[timeline.length - 1].data_etapa) - new Date(timeline[0].data_etapa)) / 3600000 / 24).toFixed(1)
    : null;

  function corDelta(horas) {
    if (!horas) return "";
    const h = Number(horas);
    if (h <= 24)  return "text-emerald-600";
    if (h <= 72)  return "text-yellow-600";
    if (h <= 168) return "text-orange-600";
    return "text-red-500";
  }

  return (
    <div className="space-y-4">
      {/* Busca */}
      <Card>
        <SectionTitle icon={Search}>Rastrear Voucher</SectionTitle>
        <div className="flex gap-3">
          <input
            type="text"
            value={voucher}
            onChange={(e) => setVoucher(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === "Enter" && buscar()}
            placeholder="Ex: YBV109060"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] uppercase"
          />
          <button
            onClick={buscar}
            disabled={loading || !voucher.trim()}
            className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50"
          >
            {loading
              ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Search className="h-4 w-4" />
            }
            Buscar
          </button>
        </div>

        {erro && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {erro}
          </div>
        )}
      </Card>

      {/* Resultado */}
      {resultado && (
        <>
          {/* KPIs do voucher */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiMini label="Voucher"      value={voucher}
              color="bg-purple-50 ring-purple-200 text-purple-700" />
            <KpiMini label="Etapas"       value={resultado.length}
              color="bg-blue-50 ring-blue-200 text-blue-700" />
            <KpiMini label="Ciclo Total"  value={cicloTotal ? `${cicloTotal}d` : "—"}
              sub="primeira → última etapa"
              color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
            <KpiMini label="IMEI/Serial"  value={resultado[0]?.serial_imei || "—"}
              color="bg-slate-50 ring-slate-200 text-slate-600" />
          </div>

          {/* Timeline */}
          <Card>
            <SectionTitle icon={Clock}>Histórico de Movimentação</SectionTitle>
            <div className="relative">
              {/* Linha vertical */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200" />

              <div className="space-y-0">
                {timeline.map((r, idx) => {
                  const isUltimo = idx === timeline.length - 1;
                  const cor = ETAPA_COLORS[r.etapa] || "#94a3b8";
                  const data = new Date(r.data_etapa);

                  return (
                    <div key={idx} className="relative flex gap-4 pb-4">
                      {/* Ponto na linha */}
                      <div className="relative z-10 flex items-start">
                        <div
                          className="h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ring-2 ring-white"
                          style={{ backgroundColor: cor }}
                        >
                          {idx + 1}
                        </div>
                      </div>

                      {/* Conteúdo */}
                      <div className={`flex-1 bg-slate-50 rounded-xl p-3 ${isUltimo ? "ring-2 ring-purple-300" : ""}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-800 text-sm">{r.etapa}</div>
                            <div className="text-xs text-slate-500 mt-0.5">{r.usuario || "—"}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-xs font-semibold text-slate-600">
                              {data.toLocaleDateString("pt-BR")}
                            </div>
                            <div className="text-xs text-slate-400">
                              {data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </div>
                          </div>
                        </div>

                        {/* Delta tempo */}
                        {r.delta && (
                          <div className={`mt-2 text-xs font-semibold ${corDelta(r.delta.horas)}`}>
                            ⏱ {Number(r.delta.horas) < 24
                              ? `${r.delta.horas}h desde etapa anterior`
                              : `${r.delta.dias}d desde etapa anterior`
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Status final */}
            <div className={`mt-2 rounded-xl p-3 flex items-center gap-2 ${
              timeline[timeline.length - 1]?.etapa === "Produto expedido"
                ? "bg-emerald-50 ring-1 ring-emerald-200"
                : "bg-purple-50 ring-1 ring-purple-200"
            }`}>
              {timeline[timeline.length - 1]?.etapa === "Produto expedido"
                ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                : <Clock className="h-4 w-4 text-purple-600 shrink-0" />
              }
              <span className="text-sm font-bold text-slate-700">
                Status atual: <span className="text-[#7F2D92]">{timeline[timeline.length - 1]?.etapa}</span>
              </span>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function AssurantSLAPage() {
  const [aba, setAba]       = useState("funil");
  const [meses, setMeses]   = useState([]);
  const [mesSel, setMesSel] = useState([]);

  useEffect(() => {
  async function loadMeses() {
    const { data, error } = await supabase.rpc("assurant_mov_meses_disponiveis");
    console.log("meses data:", data);
    console.log("meses error:", error);
    if (data) {
      const lista = data.map(r => r.mes).filter(Boolean);
      console.log("lista final:", lista);
      setMeses(lista);
      if (lista.length > 0) setMesSel([lista[0]]);
    }
  }
  loadMeses();
}, []);

  const ABAS = [
    { key: "funil",    label: "Funil de Produção",  icon: TrendingUp },
    { key: "tempos",   label: "Tempo entre Etapas", icon: Clock },
    { key: "usuarios", label: "Produtividade",      icon: Users },
    { key: "diaria",   label: "Produção Diária",    icon: BarChart3 },
    { key: "busca",    label: "Buscar Voucher",      icon: Search },
  ];

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📊</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">SLA & Rastreabilidade</h2>
            <p className="text-xs text-slate-500">
              Assurant Warehouse · {fmtN(848372)} movimentações
            </p>
          </div>
        </div>
        {aba !== "busca" && meses.length > 0 && (
          <MesSelector meses={meses} mesSel={mesSel} onChange={setMesSel} />
        )}
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => (
          <TabBtn key={a.key} label={a.label} icon={a.icon}
            active={aba === a.key} onClick={() => setAba(a.key)} />
        ))}
      </div>

      {/* Conteúdo */}
      {mesSel.length > 0 && (
        <>
          {aba === "funil"    && <TabFunil    mes={mesSel} />}
          {aba === "tempos"   && <TabTempos   mes={mesSel} />}
          {aba === "usuarios" && <TabUsuarios mes={mesSel} />}
          {aba === "diaria"   && <TabDiaria   mes={mesSel} />}
        </>
      )}
      {aba === "busca" && <TabBusca />}

    </div>
  );
}