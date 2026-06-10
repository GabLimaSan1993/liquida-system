import { useState, useEffect } from "react";
import {
  Package, Clock, AlertTriangle, CheckCircle,
  FileText, Layers, ChevronDown, BarChart3,
  Calendar, Edit2, Save, X,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from "recharts";
import { supabase } from "../../lib/supabase";

// ── Helpers ──────────────────────────────────────────────
function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtPct(v, total) {
  if (!total) return "0,0%";
  return ((v / total) * 100).toFixed(1).replace(".", ",") + "%";
}

function mesAnterior(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

function normalizaFuncional(val) {
  if (!val || val === "Sem triagem") return "Sem triagem";
  const v = val.trim().toUpperCase();
  if (["BOM", "BOA", "BOM "].includes(v))                 return "Bom";
  if (["EXCELENTE", "LIKE NEW"].includes(v))               return "Excelente/Like New";
  if (["TRINCADO", "TELA TRINCADA"].includes(v))           return "Trincado";
  if (["MUITO BOM"].includes(v))                           return "Muito Bom";
  if (["MEDIA", "REGULAR"].includes(v))                    return "Regular";
  if (v.includes("NÃO LIGA") || v.includes("BLOQUEADO"))  return "Não liga/Bloqueado";
  if (v.includes("DEVOLUÇÃO PROCEDENTE"))                  return "Dev. Procedente";
  if (v.includes("DEVOLUÇÃO IMPROCEDENTE"))                return "Dev. Improcedente";
  if (["RECUSADO","GENERICO","ONLINE","#N/D"].includes(v)) return "Outros";
  return val.trim();
}

function normalizaCondicao(val) {
  if (!val) return "Não informado";
  const v = val.trim().toUpperCase();
  if (["BOM", "BOA", "BOM "].includes(v))       return "Bom";
  if (["EXCELENTE", "LIKE NEW"].includes(v))     return "Excelente";
  if (["TRINCADO", "TELA TRINCADA"].includes(v)) return "Trincado";
  if (["MEDIA", "REGULAR"].includes(v))          return "Regular";
  if (v === "ONLINE")                            return "Online";
  return "Outros";
}

function getMarca(modelo) {
  if (!modelo) return "OUTROS";
  const m = modelo.trim().toUpperCase();
  if (m.startsWith("SAMSUNG"))  return "SAMSUNG";
  if (m.startsWith("APPLE"))    return "APPLE";
  if (m.startsWith("MOTOROLA")) return "MOTOROLA";
  if (m.startsWith("LG"))       return "LG";
  if (m.startsWith("XIAOMI"))   return "XIAOMI";
  return "OUTROS";
}

// Extrai data do nome do lote: 20260527_GLOBAL_... → 2026-05-27
function extrairDataLote(lote) {
  if (!lote) return null;
  const match = lote.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

function fmtData(dateStr) {
  if (!dateStr) return "—";
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

// ── Status calculado do pedido ────────────────────────────
function calcularStatus(pedido, exportacoes, nfs) {
  const temNF        = nfs?.length > 0;
  const temExport    = exportacoes?.length > 0;
  const bipados      = pedido.total_bipados || 0;
  const total        = pedido.total_itens   || 0;
  const pickingOk    = total > 0 && bipados >= total;

  if (temNF)                       return "faturado";
  if (temExport && !pickingOk)     return "faturamento_parcial";
  if (pickingOk)                   return "em_faturamento";
  if (bipados > 0)                 return "em_separacao";
  return                                  "ag_separacao";
}

const STATUS_CONFIG = {
  ag_separacao:       { label: "Ag. Separação",      bg: "bg-slate-100",   text: "text-slate-600",   border: "border-slate-300"   },
  em_separacao:       { label: "Em Separação",        bg: "bg-yellow-100",  text: "text-yellow-700",  border: "border-yellow-300"  },
  em_faturamento:     { label: "Em Faturamento",      bg: "bg-purple-100",  text: "text-purple-700",  border: "border-purple-300"  },
  faturamento_parcial:{ label: "Faturamento Parcial", bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-300"    },
  faturado:           { label: "Faturado",            bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-300" },
  pedido_retirado:    { label: "Pedido Retirado",     bg: "bg-teal-100",    text: "text-teal-700",    border: "border-teal-300"    },
};

function StatusPedidoBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.ag_separacao;
  return (
    <span className={`text-xs font-bold px-3 py-1 rounded-lg border ${cfg.bg} ${cfg.text} ${cfg.border} whitespace-nowrap`}>
      {cfg.label}
    </span>
  );
}

// ── Paletas ───────────────────────────────────────────────
const LP_COLORS = {
  "Bom":           "#7F2D92",
  "Trincado":      "#F97316",
  "Excelente":     "#F59E0B",
  "Regular":       "#5B1E74",
  "Online":        "#C084FC",
  "Não informado": "#94a3b8",
  "Outros":        "#64748b",
};

const LP_CANAL = {
  "YBV (Lojas)": "#7F2D92",
  "Online":      "#F97316",
  "GRV":         "#F59E0B",
  "Devolução":   "#5B1E74",
  "N/A":         "#94a3b8",
};

const MARCA_COLORS = {
  "SAMSUNG":  "#7F2D92",
  "APPLE":    "#F97316",
  "MOTOROLA": "#F59E0B",
  "LG":       "#5B1E74",
  "XIAOMI":   "#C084FC",
  "OUTROS":   "#94a3b8",
};

const MODEL_SHADES = [
  "#7F2D92","#9B3AAD","#B347C8","#C55FD4",
  "#F97316","#F59E0B","#5B1E74","#C084FC",
];

const GRADE_COLORS = {
  "EXCELENTE":     "bg-emerald-500",
  "MUITO BOM":     "bg-emerald-400",
  "BOM":           "bg-blue-400",
  "REGULAR":       "bg-yellow-400",
  "QUEBRADO":      "bg-red-400",
  "LIKE NEW":      "bg-teal-400",
  "Não informado": "bg-slate-300",
};

// ── Componentes base ─────────────────────────────────────
function TabBtn({ label, icon: Icon, active, onClick, badge }) {
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
      {badge != null && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
          active ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"
        }`}>
          {fmtN(badge)}
        </span>
      )}
    </button>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, icon: Icon }) {
  return (
    <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4">
      <Icon className="h-4 w-4 text-[#7F2D92]" />
      {children}
    </h3>
  );
}

function StatRow({ label, value, total, color = "bg-purple-400" }) {
  const p = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600 truncate max-w-[60%]">{label}</span>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-slate-400">{fmtPct(value, total)}</span>
          <span className="font-bold text-slate-800">{fmtN(value)}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`}
          style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
    </div>
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

// ── Seletor de mês ────────────────────────────────────────
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
            <button onClick={toggleTodos}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all mb-1 ${
                todos ? "bg-[#7F2D92] text-white" : "text-slate-600 hover:bg-slate-50"
              }`}>
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                todos ? "border-white bg-white" : "border-slate-300"
              }`}>
                {todos && <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                  <path d="M1.5 5L4 7.5L8.5 2.5" stroke="#7F2D92" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>}
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
                  }`}>
                  <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    sel ? "border-[#7F2D92] bg-[#7F2D92]" : "border-slate-300"
                  }`}>
                    {sel && <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                      <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>}
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

// ── Pizza rosca condição ──────────────────────────────────
function PizzaCondicao({ dados, total }) {
  const [ativo, setAtivo] = useState(null);
  const RADIAN = Math.PI / 180;

  function renderLabel({ cx, cy, midAngle, outerRadius, percent, name }) {
    if (percent < 0.03) return null;
    const radius = outerRadius + 30;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} textAnchor={x > cx ? "start" : "end"}
        dominantBaseline="central"
        style={{ fontSize: 11, fontWeight: 600, fill: "#475569" }}>
        {`${name} · ${(percent * 100).toFixed(1)}%`}
      </text>
    );
  }

  function CustomTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-purple-100 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-3 w-3 rounded-full shrink-0"
            style={{ backgroundColor: LP_COLORS[name] || "#94a3b8" }} />
          <span className="font-bold text-slate-700">{name}</span>
        </div>
        <div className="font-black text-lg" style={{ color: "#7F2D92" }}>{fmtN(value)}</div>
        <div className="text-slate-400 text-xs">{fmtPct(value, total)} do total</div>
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie data={dados} cx="50%" cy="50%"
            innerRadius={72} outerRadius={105}
            paddingAngle={2} dataKey="value"
            labelLine={false} label={renderLabel}
            onMouseEnter={(_, idx) => setAtivo(idx)}
            onMouseLeave={() => setAtivo(null)}>
            {dados.map((entry, idx) => (
              <Cell key={entry.name}
                fill={LP_COLORS[entry.name] || "#94a3b8"}
                opacity={ativo === null || ativo === idx ? 1 : 0.4}
                stroke={ativo === idx ? "#fff" : "transparent"}
                strokeWidth={ativo === idx ? 3 : 0}
                style={{ cursor: "pointer", transition: "opacity 0.2s" }}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
          <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 22, fontWeight: 900, fill: "#4C1D95" }}>{fmtN(total)}</text>
          <text x="50%" y="56%" textAnchor="middle" dominantBaseline="central"
            style={{ fontSize: 11, fill: "#94a3b8" }}>aparelhos</text>
        </PieChart>
      </ResponsiveContainer>

      <div className="mt-2 space-y-1.5 border-t border-slate-100 pt-3">
        {dados.map(({ name, value }, idx) => (
          <div key={name}
            className={`flex items-center justify-between text-xs rounded-xl px-3 py-2 transition-all cursor-default ${
              ativo === idx ? "ring-1 ring-purple-200" : "hover:bg-slate-50"
            }`}
            style={ativo === idx ? { backgroundColor: "#FAF5FF" } : {}}
            onMouseEnter={() => setAtivo(idx)}
            onMouseLeave={() => setAtivo(null)}>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full shrink-0"
                style={{ backgroundColor: LP_COLORS[name] || "#94a3b8" }} />
              <span className="font-semibold text-slate-600">{name}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${total > 0 ? (value / total) * 100 : 0}%`,
                    backgroundColor: LP_COLORS[name] || "#94a3b8",
                  }} />
              </div>
              <span className="text-slate-400 w-10 text-right font-medium">{fmtPct(value, total)}</span>
              <span className="font-bold text-slate-700 w-14 text-right">{fmtN(value)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rosca dupla: Marcas + Modelos ────────────────────────
function RoscaMarcasModelos({ dadosMarcas, modelosPorMarca, total }) {
  const [marcaSel, setMarcaSel] = useState(null);
  const marcaAtiva = marcaSel || dadosMarcas[0]?.name;

  const todosModelosMarca = marcaAtiva
    ? Object.entries(modelosPorMarca[marcaAtiva] || {}).sort((a, b) => b[1] - a[1])
    : [];

  const totalMarca   = todosModelosMarca.reduce((s, [, v]) => s + v, 0);
  const dadosModelos = todosModelosMarca.slice(0, 8).map(([name, value]) => ({ name, value }));

  function TooltipMarca({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-purple-100 px-4 py-3 text-sm">
        <div className="flex items-center gap-2 mb-1">
          <div className="h-3 w-3 rounded-full" style={{ backgroundColor: MARCA_COLORS[name] || "#94a3b8" }} />
          <span className="font-bold text-slate-700">{name}</span>
        </div>
        <div className="font-black text-lg" style={{ color: "#7F2D92" }}>{fmtN(value)}</div>
        <div className="text-slate-400 text-xs">{fmtPct(value, total)} do total</div>
      </div>
    );
  }

  function TooltipModelo({ active, payload }) {
    if (!active || !payload?.length) return null;
    const { name, value } = payload[0];
    return (
      <div className="bg-white rounded-2xl shadow-xl ring-1 ring-purple-100 px-4 py-3 text-sm max-w-[220px]">
        <span className="font-bold text-slate-700 text-xs leading-tight block">{name}</span>
        <div className="font-black text-lg mt-1" style={{ color: "#F97316" }}>{fmtN(value)}</div>
        <div className="text-slate-400 text-xs">{fmtPct(value, totalMarca)} de {marcaAtiva}</div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <SectionTitle icon={Package}>Volume por Marca</SectionTitle>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={dadosMarcas} cx="50%" cy="50%"
              innerRadius={60} outerRadius={90}
              paddingAngle={2} dataKey="value"
              onClick={(entry) => setMarcaSel(marcaSel === entry.name ? null : entry.name)}
              style={{ cursor: "pointer" }}>
              {dadosMarcas.map((entry) => (
                <Cell key={entry.name}
                  fill={MARCA_COLORS[entry.name] || "#94a3b8"}
                  opacity={marcaSel === null || marcaSel === entry.name ? 1 : 0.35}
                  stroke={marcaSel === entry.name ? "#fff" : "transparent"}
                  strokeWidth={marcaSel === entry.name ? 3 : 0}
                />
              ))}
            </Pie>
            <Tooltip content={<TooltipMarca />} />
            <text x="50%" y="46%" textAnchor="middle" dominantBaseline="central"
              style={{ fontSize: 18, fontWeight: 900, fill: "#4C1D95" }}>{fmtN(total)}</text>
            <text x="50%" y="56%" textAnchor="middle" dominantBaseline="central"
              style={{ fontSize: 10, fill: "#94a3b8" }}>total</text>
          </PieChart>
        </ResponsiveContainer>

        <div className="space-y-1.5 border-t border-slate-100 pt-3">
          {dadosMarcas.map(({ name, value }) => (
            <button key={name}
              onClick={() => setMarcaSel(marcaSel === name ? null : name)}
              className={`w-full flex items-center justify-between text-xs rounded-xl px-3 py-2 transition-all ${
                marcaSel === name ? "ring-2 ring-purple-400" : "hover:bg-slate-50"
              }`}
              style={marcaSel === name ? { backgroundColor: "#FAF5FF" } : {}}>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full shrink-0"
                  style={{ backgroundColor: MARCA_COLORS[name] || "#94a3b8" }} />
                <span className="font-semibold text-slate-700">{name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-400">{fmtPct(value, total)}</span>
                <span className="font-bold text-slate-800 w-12 text-right">{fmtN(value)}</span>
              </div>
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 text-center mt-2">Clique na marca para filtrar os modelos →</p>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <Package className="h-4 w-4 text-[#F97316]" />
            Modelos
          </h3>
          <span className="text-xs font-bold px-3 py-1 rounded-xl"
            style={{ backgroundColor: "#FAF5FF", color: "#7F2D92", outline: "1px solid #E9D5FF" }}>
            {marcaAtiva}
          </span>
        </div>

        {dadosModelos.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-slate-400 text-sm">Sem dados</div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={dadosModelos} cx="50%" cy="50%"
                  innerRadius={60} outerRadius={90} paddingAngle={2} dataKey="value">
                  {dadosModelos.map((_, idx) => (
                    <Cell key={idx} fill={MODEL_SHADES[idx % MODEL_SHADES.length]} />
                  ))}
                </Pie>
                <Tooltip content={<TooltipModelo />} />
                <text x="50%" y="44%" textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: 18, fontWeight: 900, fill: "#4C1D95" }}>{fmtN(totalMarca)}</text>
                <text x="50%" y="54%" textAnchor="middle" dominantBaseline="central"
                  style={{ fontSize: 9, fill: "#94a3b8" }}>{marcaAtiva}</text>
              </PieChart>
            </ResponsiveContainer>

            <div className="space-y-1.5 border-t border-slate-100 pt-3 max-h-48 overflow-y-auto">
              {dadosModelos.map(({ name, value }, idx) => (
                <div key={name} className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg hover:bg-slate-50">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: MODEL_SHADES[idx % MODEL_SHADES.length] }} />
                    <span className="font-medium text-slate-600 truncate">{name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <span className="text-slate-400">{fmtPct(value, totalMarca)}</span>
                    <span className="font-bold text-slate-800 w-10 text-right">{fmtN(value)}</span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA GESTÃO DE PEDIDOS B2B
// ══════════════════════════════════════════════════════════
function TabGestao() {
  const [pedidos, setPedidos]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [editandoPrevisao, setEditandoPrevisao] = useState(null);
  const [novaPrevisao, setNovaPrevisao]         = useState("");
  const [salvando, setSalvando]     = useState(false);
  const [filtroStatus, setFiltroStatus] = useState("todos");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      // Buscar pedidos
      const { data: pedidosData } = await supabase
        .from("b2b_pedidos")
        .select("*")
        .order("criado_em", { ascending: false });

      if (!pedidosData?.length) { setPedidos([]); setLoading(false); return; }

      // Buscar exportações e NFs para cada pedido
      const ids = pedidosData.map(p => p.id);

      const [{ data: exportacoes }, { data: nfs }] = await Promise.all([
        supabase.from("b2b_exportacoes").select("pedido_id, id").in("pedido_id", ids),
        supabase.from("b2b_nfs").select("pedido_id, id").in("pedido_id", ids),
      ]);

      const expMap = {};
      (exportacoes || []).forEach(e => {
        if (!expMap[e.pedido_id]) expMap[e.pedido_id] = [];
        expMap[e.pedido_id].push(e);
      });

      const nfMap = {};
      (nfs || []).forEach(n => {
        if (!nfMap[n.pedido_id]) nfMap[n.pedido_id] = [];
        nfMap[n.pedido_id].push(n);
      });

      const pedidosEnriquecidos = pedidosData.map(p => ({
        ...p,
        exportacoes:    expMap[p.id]  || [],
        nfs:            nfMap[p.id]   || [],
        statusCalc:     calcularStatus(p, expMap[p.id] || [], nfMap[p.id] || []),
        dataPedidoCalc: p.data_pedido || extrairDataLote(p.lote),
      }));

      setPedidos(pedidosEnriquecidos);
    } finally {
      setLoading(false);
    }
  }

  async function salvarPrevisao(pedidoId) {
    setSalvando(true);
    try {
      await supabase
        .from("b2b_pedidos")
        .update({ previsao_faturamento: novaPrevisao || null })
        .eq("id", pedidoId);
      setPedidos(prev => prev.map(p =>
        p.id === pedidoId ? { ...p, previsao_faturamento: novaPrevisao || null } : p
      ));
      setEditandoPrevisao(null);
    } finally {
      setSalvando(false);
    }
  }

  const STATUS_FILTROS = [
    { key: "todos",              label: "Todos"              },
    { key: "ag_separacao",       label: "Ag. Separação"      },
    { key: "em_separacao",       label: "Em Separação"       },
    { key: "em_faturamento",     label: "Em Faturamento"     },
    { key: "faturamento_parcial",label: "Fat. Parcial"       },
    { key: "faturado",           label: "Faturado"           },
  ];

  const pedidosFiltrados = filtroStatus === "todos"
    ? pedidos
    : pedidos.filter(p => p.statusCalc === filtroStatus);

  // KPIs por status
  const kpis = {
    ag_separacao:        pedidos.filter(p => p.statusCalc === "ag_separacao").length,
    em_separacao:        pedidos.filter(p => p.statusCalc === "em_separacao").length,
    em_faturamento:      pedidos.filter(p => p.statusCalc === "em_faturamento").length,
    faturamento_parcial: pedidos.filter(p => p.statusCalc === "faturamento_parcial").length,
    faturado:            pedidos.filter(p => p.statusCalc === "faturado").length,
  };

  if (loading) return <Loader />;

  return (
    <div className="space-y-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiMini label="Ag. Separação"       value={kpis.ag_separacao}
          color="bg-slate-50 ring-slate-200 text-slate-600" />
        <KpiMini label="Em Separação"        value={kpis.em_separacao}
          color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="Em Faturamento"      value={kpis.em_faturamento}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Faturamento Parcial" value={kpis.faturamento_parcial}
          color="bg-blue-50 ring-blue-200 text-blue-700" />
        <KpiMini label="Faturado"            value={kpis.faturado}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
      </div>

      {/* Filtros de status */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTROS.map(f => (
          <button key={f.key} onClick={() => setFiltroStatus(f.key)}
            className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
              filtroStatus === f.key ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}>
            {f.label}
            {f.key !== "todos" && (
              <span className={`ml-1.5 text-xs font-bold ${filtroStatus === f.key ? "text-white/70" : "text-slate-400"}`}>
                ({kpis[f.key] || 0})
              </span>
            )}
          </button>
        ))}
        <button onClick={carregar}
          className="ml-auto text-xs text-slate-500 hover:text-purple-700 font-semibold">
          ↻ Atualizar
        </button>
      </div>

      {/* Tabela */}
      <Card>
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-3 py-3 text-left font-bold text-slate-500">Cliente</th>
                <th className="px-3 py-3 text-center font-bold text-slate-500">Data Pedido</th>
                <th className="px-3 py-3 text-center font-bold text-slate-500">Pedido</th>
                <th className="px-3 py-3 text-center font-bold text-slate-500">Separado</th>
                <th className="px-3 py-3 text-center font-bold text-slate-500">Status</th>
                <th className="px-3 py-3 text-center font-bold text-slate-500">Previsão Fat.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pedidosFiltrados.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">

                  {/* Cliente + Lote */}
                  <td className="px-3 py-3">
                    <div className="font-bold text-slate-800">{p.cliente}</div>
                    <div className="text-slate-400 text-xs mt-0.5 max-w-[220px] truncate">{p.lote}</div>
                  </td>

                  {/* Data Pedido */}
                  <td className="px-3 py-3 text-center text-slate-600 font-semibold">
                    {fmtData(p.dataPedidoCalc)}
                  </td>

                  {/* Total itens */}
                  <td className="px-3 py-3 text-center font-black text-slate-800">
                    {fmtN(p.total_itens)}
                  </td>

                  {/* Separado (bipados) */}
                  <td className="px-3 py-3 text-center">
                    <div className="font-black text-slate-800">{fmtN(p.total_bipados || 0)}</div>
                    <div className="text-slate-400 text-xs">
                      {p.total_itens > 0
                        ? `${Math.round(((p.total_bipados || 0) / p.total_itens) * 100)}%`
                        : "—"}
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-3 py-3 text-center">
                    <StatusPedidoBadge status={p.statusCalc} />
                  </td>

                  {/* Previsão Faturamento */}
                  <td className="px-3 py-3 text-center">
                    {editandoPrevisao === p.id ? (
                      <div className="flex items-center gap-1 justify-center">
                        <input
                          type="date"
                          value={novaPrevisao}
                          onChange={e => setNovaPrevisao(e.target.value)}
                          className="rounded-lg border border-purple-300 px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                        />
                        <button onClick={() => salvarPrevisao(p.id)} disabled={salvando}
                          className="p-1 rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition">
                          <Save className="h-3 w-3" />
                        </button>
                        <button onClick={() => setEditandoPrevisao(null)}
                          className="p-1 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200 transition">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 justify-center">
                        <span className={`font-semibold ${p.previsao_faturamento ? "text-slate-700" : "text-slate-300"}`}>
                          {p.previsao_faturamento ? fmtData(p.previsao_faturamento) : "—"}
                        </span>
                        <button
                          onClick={() => {
                            setEditandoPrevisao(p.id);
                            setNovaPrevisao(p.previsao_faturamento || "");
                          }}
                          className="p-1 rounded-lg text-slate-300 hover:text-purple-600 hover:bg-purple-50 transition">
                          <Edit2 className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {pedidosFiltrados.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum pedido encontrado.</p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 1 — RECEBIMENTO
// ══════════════════════════════════════════════════════════
function TabRecebimento({ mes }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const lista  = Array.isArray(mes) ? mes : [mes];
      const mesAnt = lista.length === 1 ? mesAnterior(lista[0]) : null;

      const promises = [supabase.rpc("assurant_dash_recebimento", { meses: lista })];
      if (mesAnt) promises.push(supabase.rpc("assurant_dash_recebimento", { meses: [mesAnt] }));

      const results = await Promise.all(promises);
      const rows    = results[0].data || [];
      const rowsAnt = mesAnt ? (results[1].data || []) : [];

      const canais = {}, condicoes = {}, statusMap = {}, marcas = {}, modelosPorMarca = {};
      let totalRecebidos = 0, comData = 0, semData = 0;

      rows.forEach(r => {
        const qtd = Number(r.total);
        totalRecebidos += qtd;
        if (r.com_data) comData += qtd; else semData += qtd;
        canais[r.canal] = (canais[r.canal] || 0) + qtd;
        const cond = normalizaCondicao(r.condicao);
        condicoes[cond] = (condicoes[cond] || 0) + qtd;
        statusMap[r.status_atual] = (statusMap[r.status_atual] || 0) + qtd;
        const marca = getMarca(r.modelo);
        marcas[marca] = (marcas[marca] || 0) + qtd;
        if (!modelosPorMarca[marca]) modelosPorMarca[marca] = {};
        modelosPorMarca[marca][r.modelo] = (modelosPorMarca[marca][r.modelo] || 0) + qtd;
      });

      const canaisAnt = {};
      let totalAnt = 0;
      rowsAnt.forEach(r => {
        const qtd = Number(r.total);
        totalAnt += qtd;
        canaisAnt[r.canal] = (canaisAnt[r.canal] || 0) + qtd;
      });

      setData({
        canais, canaisAnt, totalAnt, mesAnt,
        pizzaCondicao: Object.entries(condicoes).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
        topStatus:     Object.entries(statusMap).sort((a, b) => b[1] - a[1]).slice(0, 8),
        dadosMarcas:   Object.entries(marcas).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value })),
        modelosPorMarca, totalRecebidos, comData, semData,
      });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data)   return <p className="text-slate-400 text-sm">Sem dados para este período.</p>;

  const { canais, canaisAnt, totalAnt, mesAnt, pizzaCondicao, topStatus,
          dadosMarcas, modelosPorMarca, totalRecebidos, comData, semData } = data;
  const canaisArr = Object.entries(canais).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total Recebido" value={fmtN(totalRecebidos)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        {mesAnt ? (
          <KpiMini label="Mês Anterior" value={fmtN(totalAnt)} sub={mesAnt}
            color="bg-slate-50 ring-slate-200 text-slate-600" />
        ) : (
          <KpiMini label="Meses Selecionados" value={Array.isArray(mes) ? mes.length : 1}
            sub="período acumulado" color="bg-slate-50 ring-slate-200 text-slate-600" />
        )}
        <KpiMini label="Com Data Receb." value={fmtN(comData)} sub={fmtPct(comData, totalRecebidos)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Data Receb." value={fmtN(semData)} sub={fmtPct(semData, totalRecebidos)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={Package}>Volume por Canal</SectionTitle>
          <div className="space-y-5">
            {canaisArr.map(([canal, qtd]) => {
              const qtdAnt   = canaisAnt[canal] || 0;
              const delta    = qtd - qtdAnt;
              const deltaPos = delta >= 0;
              const deltaPct = mesAnt && qtdAnt > 0 ? ((delta / qtdAnt) * 100).toFixed(1) : null;
              const pctTotal = totalRecebidos > 0 ? ((qtd / totalRecebidos) * 100).toFixed(1) : "0";
              const pctAnt   = totalAnt > 0 ? (qtdAnt / totalAnt) * 100 : 0;
              const barWidth = Math.max(Number(pctTotal), 4);

              return (
                <div key={canal} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: LP_CANAL[canal] || "#94a3b8" }} />
                      <span className="font-semibold text-slate-700">{canal}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {mesAnt && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                          deltaPos ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"
                        }`}>
                          {deltaPos ? "▲" : "▼"} {fmtN(Math.abs(delta))}
                          {deltaPct && ` · ${Math.abs(deltaPct)}%`}
                        </span>
                      )}
                      <div className="text-right">
                        <div className="font-bold text-slate-800">{fmtN(qtd)}</div>
                        {mesAnt && <div className="text-xs text-slate-400">ant: {fmtN(qtdAnt)}</div>}
                      </div>
                    </div>
                  </div>
                  <div className="relative h-6 bg-slate-100 rounded-xl overflow-hidden">
                    <div className="h-full rounded-xl flex items-center justify-end pr-2 transition-all duration-700"
                      style={{ width: `${barWidth}%`, backgroundColor: LP_CANAL[canal] || "#94a3b8" }}>
                      {Number(pctTotal) >= 10 && (
                        <span className="text-white text-xs font-bold">{pctTotal}%</span>
                      )}
                    </div>
                    {Number(pctTotal) < 10 && (
                      <span className="absolute top-1/2 -translate-y-1/2 text-xs font-bold text-slate-600"
                        style={{ left: `calc(${barWidth}% + 6px)` }}>
                        {pctTotal}%
                      </span>
                    )}
                  </div>
                  {mesAnt && (
                    <>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-slate-300 transition-all duration-700"
                          style={{ width: `${pctAnt}%` }} />
                      </div>
                      <div className="text-xs text-slate-400 text-right">
                        ▬ cinza = mês anterior ({fmtN(qtdAnt)})
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={Layers}>Por Condição</SectionTitle>
          <PizzaCondicao dados={pizzaCondicao} total={totalRecebidos} />
        </Card>
      </div>

      <RoscaMarcasModelos dadosMarcas={dadosMarcas} modelosPorMarca={modelosPorMarca} total={totalRecebidos} />

      <Card>
        <SectionTitle icon={Clock}>Status Atual</SectionTitle>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {topStatus.map(([st, qtd]) => (
            <StatRow key={st} label={st} value={qtd} total={totalRecebidos} color="bg-purple-400" />
          ))}
        </div>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 2 — TRIAGEM FUNCIONAL
// ══════════════════════════════════════════════════════════
function TabTriagemFuncional({ mes }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const lista = Array.isArray(mes) ? mes : [mes];
      const { data: rows } = await supabase.rpc("assurant_dash_funcional", { meses: lista });
      if (!rows) { setLoading(false); return; }

      const funcionais = {}, grades = {}, resultados = {}, baterias = {};
      let total = 0, semTriagem = 0, comTriagem = 0;

      rows.forEach(r => {
        const qtd = Number(r.total);
        total += qtd;
        const func = normalizaFuncional(r.triagem_funcional);
        funcionais[func] = (funcionais[func] || 0) + qtd;
        if (r.triagem_funcional === "Sem triagem") semTriagem += qtd; else comTriagem += qtd;
        grades[r.grade] = (grades[r.grade] || 0) + qtd;
        resultados[r.resultado_triagem_funcional] = (resultados[r.resultado_triagem_funcional] || 0) + qtd;
        if (r.status_bateria && r.status_bateria !== "Sem info") {
          baterias[r.status_bateria] = (baterias[r.status_bateria] || 0) + qtd;
        }
      });

      setData({ funcionais, grades, resultados, baterias, total, semTriagem, comTriagem });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data)   return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { funcionais, grades, resultados, baterias, total, semTriagem, comTriagem } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total"       value={fmtN(total)} color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Triagem" value={fmtN(comTriagem)} sub={fmtPct(comTriagem, total)} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Triagem" value={fmtN(semTriagem)} sub={fmtPct(semTriagem, total)} color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Resultados"  value={Object.keys(resultados).length} color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={CheckCircle}>Resultado Funcional</SectionTitle>
          <div className="space-y-3">
            {Object.entries(funcionais).sort((a, b) => b[1] - a[1]).map(([func, qtd]) => (
              <StatRow key={func} label={func} value={qtd} total={total}
                color={
                  ["Bom","Excelente/Like New","Muito Bom"].includes(func) ? "bg-emerald-400" :
                  ["Trincado","Não liga/Bloqueado"].includes(func)        ? "bg-red-400"     :
                  func === "Sem triagem"                                  ? "bg-slate-300"   :
                  "bg-yellow-400"
                } />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={Layers}>Distribuição por Grade</SectionTitle>
          <div className="space-y-3">
            {Object.entries(grades).sort((a, b) => b[1] - a[1]).map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={total}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={CheckCircle}>Resultado da Triagem</SectionTitle>
          <div className="space-y-3">
            {Object.entries(resultados).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([res, qtd]) => (
              <StatRow key={res} label={res} value={qtd} total={total} color="bg-blue-400" />
            ))}
          </div>
        </Card>

        {Object.keys(baterias).length > 0 && (
          <Card>
            <SectionTitle icon={Layers}>Status da Bateria</SectionTitle>
            <div className="space-y-3">
              {Object.entries(baterias).sort((a, b) => b[1] - a[1]).map(([bat, qtd]) => (
                <StatRow key={bat} label={bat} value={qtd} total={total} color="bg-purple-400" />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 3 — TRIAGEM ESTÉTICA
// ══════════════════════════════════════════════════════════
function TabTriagemEstetica({ mes }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const lista = Array.isArray(mes) ? mes : [mes];
      const { data: rows } = await supabase.rpc("assurant_dash_estetica", { meses: lista });
      if (!rows) { setLoading(false); return; }

      const telas = {}, lateraisM = {}, traseirasM = {}, defeitosM = {}, gradesM = {};
      let total = 0, comEstetica = 0, semEstetica = 0;

      rows.forEach(r => {
        const qtd = Number(r.total);
        total += qtd;
        if (r.com_estetica) comEstetica += qtd; else semEstetica += qtd;
        telas[r.tela]          = (telas[r.tela]          || 0) + qtd;
        lateraisM[r.laterais]  = (lateraisM[r.laterais]  || 0) + qtd;
        traseirasM[r.traseira] = (traseirasM[r.traseira] || 0) + qtd;
        gradesM[r.grade]       = (gradesM[r.grade]       || 0) + qtd;
        if (r.defeitos_adicionais?.trim()) {
          defeitosM[r.defeitos_adicionais] = (defeitosM[r.defeitos_adicionais] || 0) + qtd;
        }
      });

      setData({ telas, lateraisM, traseirasM, defeitosM, gradesM, total, comEstetica, semEstetica });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data)   return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { telas, lateraisM, traseirasM, defeitosM, gradesM, total, comEstetica, semEstetica } = data;

  function colorEstetica(v) {
    const u = (v || "").toUpperCase();
    if (u === "QUEBRADO")                     return "bg-red-400";
    if (["LIKE NEW","EXCELENTE"].includes(u)) return "bg-emerald-400";
    if (u === "MUITO BOM")                    return "bg-emerald-300";
    if (u === "BOM")                          return "bg-blue-400";
    if (u === "REGULAR")                      return "bg-yellow-400";
    return "bg-slate-300";
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiMini label="Total"        value={fmtN(total)} color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Estética" value={fmtN(comEstetica)} sub={fmtPct(comEstetica, total)} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Estética" value={fmtN(semEstetica)} sub={fmtPct(semEstetica, total)} color="bg-orange-50 ring-orange-200 text-orange-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={Layers}>Estado da Tela</SectionTitle>
          <div className="space-y-3">
            {Object.entries(telas).sort((a,b) => b[1]-a[1]).map(([v, qtd]) => (
              <StatRow key={v} label={v} value={qtd} total={total} color={colorEstetica(v)} />
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle icon={Layers}>Estado das Laterais</SectionTitle>
          <div className="space-y-3">
            {Object.entries(lateraisM).sort((a,b) => b[1]-a[1]).map(([v, qtd]) => (
              <StatRow key={v} label={v} value={qtd} total={total} color={colorEstetica(v)} />
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle icon={Layers}>Estado da Traseira</SectionTitle>
          <div className="space-y-3">
            {Object.entries(traseirasM).sort((a,b) => b[1]-a[1]).map(([v, qtd]) => (
              <StatRow key={v} label={v} value={qtd} total={total} color={colorEstetica(v)} />
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle icon={CheckCircle}>Grade Estética Geral</SectionTitle>
          <div className="space-y-3">
            {Object.entries(gradesM).sort((a,b) => b[1]-a[1]).map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={total}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>
        {Object.keys(defeitosM).length > 0 && (
          <Card className="lg:col-span-2">
            <SectionTitle icon={AlertTriangle}>Defeitos Adicionais</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {Object.entries(defeitosM).sort((a,b) => b[1]-a[1]).slice(0,10).map(([def, qtd]) => (
                <StatRow key={def} label={def} value={qtd} total={total} color="bg-orange-400" />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 4 — LAUDOS
// ══════════════════════════════════════════════════════════
function TabLaudos({ mes }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const lista = Array.isArray(mes) ? mes : [mes];
      const { data: rows } = await supabase.rpc("assurant_dash_laudos", { meses: lista });
      if (!rows) { setLoading(false); return; }

      let total = 0, comLaudo = 0, semLaudo = 0, comReanalise = 0;
      let comAlocacao = 0, comOracle = 0, aguardandoLaudo = 0;
      const gradesLaudo = {}, modelosLaudo = {};

      rows.forEach(r => {
        const qtd = Number(r.total);
        total += qtd;
        if (r.com_laudo)      comLaudo      += qtd; else semLaudo += qtd;
        if (r.com_reanalise)  comReanalise  += qtd;
        if (r.com_alocacao)   comAlocacao   += qtd;
        if (r.com_oracle)     comOracle     += qtd;
        if (r.aguardando_laudo) aguardandoLaudo += qtd;
        if (r.com_laudo) {
          gradesLaudo[r.grade]   = (gradesLaudo[r.grade]   || 0) + qtd;
          modelosLaudo[r.modelo] = (modelosLaudo[r.modelo] || 0) + qtd;
        }
      });

      setData({
        total, comLaudo, semLaudo, comReanalise, comAlocacao,
        comOracle, aguardandoLaudo, gradesLaudo,
        topModelosLaudo: Object.entries(modelosLaudo).sort((a, b) => b[1] - a[1]).slice(0, 8),
      });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data)   return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { total, comLaudo, semLaudo, comReanalise, comAlocacao,
          comOracle, aguardandoLaudo, gradesLaudo, topModelosLaudo } = data;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Com Laudo"     value={fmtN(comLaudo)} sub={fmtPct(comLaudo, total)} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Laudo"     value={fmtN(semLaudo)} sub={fmtPct(semLaudo, total)} color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Aguard. Laudo" value={fmtN(aguardandoLaudo)} sub="em status atual" color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="Com Reanálise" value={fmtN(comReanalise)} sub={fmtPct(comReanalise, total)} color="bg-red-50 ring-red-200 text-red-700" />
      </div>

      <Card>
        <SectionTitle icon={FileText}>Pipeline Pós-Laudo</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini label="Com Laudo"    value={fmtN(comLaudo)} sub={fmtPct(comLaudo, total)} color="bg-purple-50 ring-purple-200 text-purple-700" />
          <KpiMini label="Com Alocação" value={fmtN(comAlocacao)} sub={fmtPct(comAlocacao, total)} color="bg-blue-50 ring-blue-200 text-blue-700" />
          <KpiMini label="Com Oracle"   value={fmtN(comOracle)} sub={fmtPct(comOracle, total)} color="bg-teal-50 ring-teal-200 text-teal-700" />
          <KpiMini label="Reanálise"    value={fmtN(comReanalise)} sub={fmtPct(comReanalise, total)} color="bg-red-50 ring-red-200 text-red-700" />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={Layers}>Grade dos Aparelhos com Laudo</SectionTitle>
          <div className="space-y-3">
            {Object.entries(gradesLaudo).sort((a,b) => b[1]-a[1]).map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={comLaudo}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>
        <Card>
          <SectionTitle icon={Package}>Top Modelos com Laudo</SectionTitle>
          <div className="space-y-3">
            {topModelosLaudo.map(([mod, qtd]) => (
              <StatRow key={mod} label={mod} value={qtd} total={comLaudo} color="bg-purple-400" />
            ))}
          </div>
        </Card>
      </div>

      {semLaudo > 0 && (
        <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-orange-800">
              {fmtN(semLaudo)} aparelhos sem laudo ({fmtPct(semLaudo, total)})
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Desses, {fmtN(aguardandoLaudo)} estão com status "Aguardando laudo" no sistema.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function AssurantDashboardPage() {
  const [aba, setAba]       = useState("recebimento");
  const [meses, setMeses]   = useState([]);
  const [mesSel, setMesSel] = useState([]);
  const [totais, setTotais] = useState(null);

  useEffect(() => {
    async function loadMeses() {
      const { data } = await supabase.rpc("assurant_meses_disponiveis");
      if (data) {
        const lista = data.map(r => r.mes).filter(Boolean);
        setMeses(lista);
        if (lista.length > 0) setMesSel([lista[0]]);
      }
    }
    loadMeses();
  }, []);

  useEffect(() => {
    if (!mesSel.length) return;
    async function loadTotais() {
      const { data } = await supabase.rpc("assurant_dash_totais", { meses: mesSel });
      if (data?.[0]) setTotais(data[0]);
    }
    loadTotais();
  }, [mesSel]);

  const ABAS = [
    { key: "recebimento", label: "Recebimento",       icon: Package,     badge: totais?.total,      comMes: true  },
    { key: "funcional",   label: "Triagem Funcional", icon: CheckCircle, badge: null,               comMes: true  },
    { key: "estetica",    label: "Triagem Estética",  icon: Layers,      badge: null,               comMes: true  },
    { key: "laudos",      label: "Laudos",            icon: FileText,    badge: totais?.com_laudo,  comMes: true  },
    { key: "gestao",      label: "Gestão B2B",        icon: BarChart3,   badge: null,               comMes: false },
  ];

  const abaAtual = ABAS.find(a => a.key === aba);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Operação Assurant</h2>
            <p className="text-xs text-slate-500">Warehouse · filtrado por data real de recebimento</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {abaAtual?.comMes && meses.length > 0 && (
            <MesSelector meses={meses} mesSel={mesSel} onChange={setMesSel} />
          )}
          {totais && abaAtual?.comMes && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl"
              style={{ backgroundColor: "#FAF5FF", color: "#7F2D92", outline: "1px solid #E9D5FF" }}>
              {fmtN(totais.total)} recebidos · {fmtN(totais.finalizados)} finalizados
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => (
          <TabBtn key={a.key} label={a.label} icon={a.icon}
            active={aba === a.key} onClick={() => setAba(a.key)} badge={a.badge} />
        ))}
      </div>

      {aba === "gestao" ? (
        <TabGestao />
      ) : mesSel.length > 0 ? (
        <>
          {aba === "recebimento" && <TabRecebimento      mes={mesSel} />}
          {aba === "funcional"   && <TabTriagemFuncional  mes={mesSel} />}
          {aba === "estetica"    && <TabTriagemEstetica   mes={mesSel} />}
          {aba === "laudos"      && <TabLaudos            mes={mesSel} />}
        </>
      ) : null}

      <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">Operação de Reparo sem contrato formal</p>
          <p className="text-xs text-orange-600 mt-0.5">
            Cláusula 6.2 do Apêndice A exclui reparo do contrato atual.
            Incluir no próximo aditivo com precificação própria.
          </p>
        </div>
      </div>
    </div>
  );
}