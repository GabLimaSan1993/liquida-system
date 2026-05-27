import { useState, useEffect } from "react";
import {
  Package, Clock, AlertTriangle, CheckCircle,
  FileText, Layers, ChevronDown
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { supabase } from "../../lib/supabase";

// ── Helpers ──────────────────────────────────────────────
function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtPct(v, total) {
  if (!total) return "0,0%";
  return ((v / total) * 100).toFixed(1).replace(".", ",") + "%";
}

function proximoMes(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 12
    ? `${ano + 1}-01`
    : `${ano}-${String(m + 1).padStart(2, "0")}`;
}

function mesAnterior(mes) {
  const [ano, m] = mes.split("-").map(Number);
  return m === 1
    ? `${ano - 1}-12`
    : `${ano}-${String(m - 1).padStart(2, "0")}`;
}

function filtraMes(query, mes) {
  return query
    .gte("data_recebimento", `${mes}-01`)
    .lt("data_recebimento", `${proximoMes(mes)}-01`);
}

function normalizaCanal(val) {
  if (!val) return "N/A";
  const v = val.trim();
  if (v === "Loja Vivo" || v === "Loja Samsung") return "YBV (Lojas)";
  if (v === "DEV") return "Devolução";
  return v;
}

function normalizaCondicao(val) {
  if (!val) return "Não informado";
  const v = val.trim().toUpperCase();
  if (["BOM", "BOA", "BOM "].includes(v))           return "Bom";
  if (["EXCELENTE", "LIKE NEW"].includes(v))         return "Excelente";
  if (["TRINCADO", "TELA TRINCADA"].includes(v))     return "Trincado";
  if (["MEDIA", "REGULAR"].includes(v))              return "Regular";
  if (v === "ONLINE")                                return "Online";
  return "Outros";
}

function normalizaFuncional(val) {
  if (!val) return "Sem triagem";
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

// ── Paletas ───────────────────────────────────────────────
const GRADE_COLORS = {
  "EXCELENTE":     "bg-emerald-500",
  "MUITO BOM":     "bg-emerald-400",
  "BOM":           "bg-blue-400",
  "REGULAR":       "bg-yellow-400",
  "QUEBRADO":      "bg-red-400",
  "LIKE NEW":      "bg-teal-400",
  "Não informado": "bg-slate-300",
};

const CANAL_COLORS = {
  "YBV (Lojas)": "bg-purple-500",
  "Online":      "bg-blue-400",
  "GRV":         "bg-emerald-500",
  "Devolução":   "bg-orange-400",
  "N/A":         "bg-slate-300",
};

const CONDICAO_COLORS = {
  "Excelente":     "#10b981",
  "Bom":           "#3b82f6",
  "Trincado":      "#ef4444",
  "Regular":       "#f59e0b",
  "Online":        "#8b5cf6",
  "Não informado": "#94a3b8",
  "Outros":        "#64748b",
};

// ── Componentes base ─────────────────────────────────────
function TabBtn({ label, icon: Icon, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
        active
          ? "bg-purple-600 text-white shadow-md"
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
      <Icon className="h-4 w-4 text-purple-600" />
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
      <div className="h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );
}

function MesSelector({ meses, mesSel, onChange }) {
  return (
    <div className="relative">
      <select
        value={mesSel}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-8 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
      >
        {meses.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ── Pizza ─────────────────────────────────────────────────
function PizzaCondicao({ dados, total }) {
  const RADIAN = Math.PI / 180;

  function renderLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }) {
    if (percent < 0.04) return null;
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
    const x = cx + radius * Math.cos(-midAngle * RADIAN);
    const y = cy + radius * Math.sin(-midAngle * RADIAN);
    return (
      <text x={x} y={y} fill="white" textAnchor="middle"
        dominantBaseline="central" style={{ fontSize: 11, fontWeight: 700 }}>
        {(percent * 100).toFixed(0)}%
      </text>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={dados}
          cx="50%"
          cy="50%"
          outerRadius={95}
          dataKey="value"
          labelLine={false}
          label={renderLabel}
        >
          {dados.map((entry) => (
            <Cell key={entry.name} fill={CONDICAO_COLORS[entry.name] || "#94a3b8"} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value, name) => [
            `${fmtN(value)} (${fmtPct(value, total)})`, name
          ]}
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }}
        />
      </PieChart>
    </ResponsiveContainer>
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

      const mesAnt = mesAnterior(mes);

      // Mês atual e anterior em paralelo
      const [{ data: rows }, { data: rowsAnt }] = await Promise.all([
        filtraMes(
          supabase.from("assurant_triagem")
            .select("tipo_de_rede, condicao, modelo, status_atual, data_recebimento"),
          mes
        ),
        filtraMes(
          supabase.from("assurant_triagem").select("tipo_de_rede"),
          mesAnt
        ),
      ]);

      if (!rows) { setLoading(false); return; }

      const canais    = {};
      const condicoes = {};
      const modelos   = {};
      const statusMap = {};
      let totalRecebidos = 0;
      let comData        = 0;
      let semData        = 0;

      rows.forEach(r => {
        totalRecebidos++;

        const canal = normalizaCanal(r.tipo_de_rede);
        canais[canal] = (canais[canal] || 0) + 1;

        const cond = normalizaCondicao(r.condicao);
        condicoes[cond] = (condicoes[cond] || 0) + 1;

        const mod = r.modelo || "Não informado";
        modelos[mod] = (modelos[mod] || 0) + 1;

        const st = r.status_atual || "Não informado";
        statusMap[st] = (statusMap[st] || 0) + 1;

        if (r.data_recebimento) comData++; else semData++;
      });

      const canaisAnt = {};
      let totalAnt = 0;
      (rowsAnt || []).forEach(r => {
        totalAnt++;
        const canal = normalizaCanal(r.tipo_de_rede);
        canaisAnt[canal] = (canaisAnt[canal] || 0) + 1;
      });

      const topModelos     = Object.entries(modelos).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const topStatus      = Object.entries(statusMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
      const pizzaCondicao  = Object.entries(condicoes)
        .sort((a, b) => b[1] - a[1])
        .map(([name, value]) => ({ name, value }));

      setData({
        canais, canaisAnt, totalAnt,
        pizzaCondicao, topModelos, topStatus,
        totalRecebidos, comData, semData, mesAnt,
      });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data)   return <p className="text-slate-400 text-sm">Sem dados para este mês.</p>;

  const {
    canais, canaisAnt, totalAnt,
    pizzaCondicao, topModelos, topStatus,
    totalRecebidos, comData, semData, mesAnt,
  } = data;

  const canaisArr = Object.entries(canais).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total Recebido"  value={fmtN(totalRecebidos)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Mês Anterior"    value={fmtN(totalAnt)}
          sub={mesAnt}
          color="bg-slate-50 ring-slate-200 text-slate-600" />
        <KpiMini label="Com Data Receb." value={fmtN(comData)}
          sub={fmtPct(comData, totalRecebidos)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Data Receb." value={fmtN(semData)}
          sub={fmtPct(semData, totalRecebidos)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Volume por canal com comparativo */}
        <Card>
          <SectionTitle icon={Package}>Volume por Canal</SectionTitle>
          <div className="space-y-5">
            {canaisArr.map(([canal, qtd]) => {
              const qtdAnt  = canaisAnt[canal] || 0;
              const delta   = qtd - qtdAnt;
              const deltaPos = delta >= 0;
              const deltaPct = qtdAnt > 0
                ? ((delta / qtdAnt) * 100).toFixed(1)
                : null;

              return (
                <div key={canal} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-slate-700">{canal}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                        deltaPos
                          ? "bg-emerald-50 text-emerald-600"
                          : "bg-red-50 text-red-500"
                      }`}>
                        {deltaPos ? "▲" : "▼"} {fmtN(Math.abs(delta))}
                        {deltaPct && ` · ${Math.abs(deltaPct)}%`}
                      </span>
                      <div className="text-right">
                        <div className="font-bold text-slate-800">{fmtN(qtd)}</div>
                        <div className="text-xs text-slate-400">ant: {fmtN(qtdAnt)}</div>
                      </div>
                    </div>
                  </div>
                  {/* Barra mês atual */}
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${CANAL_COLORS[canal] || "bg-slate-400"}`}
                      style={{ width: `${totalRecebidos > 0 ? (qtd / totalRecebidos) * 100 : 0}%` }}
                    />
                  </div>
                  {/* Barra mês anterior */}
                  <div className="h-1 bg-slate-50 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-slate-300"
                      style={{ width: `${totalAnt > 0 ? (qtdAnt / totalAnt) * 100 : 0}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-slate-400">
                    <span>{fmtPct(qtd, totalRecebidos)} do total</span>
                    <span>▬ cinza = mês anterior</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Pizza condição */}
        <Card>
          <SectionTitle icon={Layers}>Por Condição</SectionTitle>
          <PizzaCondicao dados={pizzaCondicao} total={totalRecebidos} />
          <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
            {pizzaCondicao.map(({ name, value }) => (
              <div key={name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: CONDICAO_COLORS[name] || "#94a3b8" }} />
                  <span className="font-medium text-slate-600">{name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">{fmtPct(value, totalRecebidos)}</span>
                  <span className="font-bold text-slate-700 w-14 text-right">{fmtN(value)}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Top modelos */}
        <Card>
          <SectionTitle icon={Package}>Top Modelos Recebidos</SectionTitle>
          <div className="space-y-3">
            {topModelos.map(([mod, qtd]) => (
              <StatRow key={mod} label={mod} value={qtd}
                total={totalRecebidos} color="bg-emerald-400" />
            ))}
          </div>
        </Card>

        {/* Status atual */}
        <Card>
          <SectionTitle icon={Clock}>Status Atual</SectionTitle>
          <div className="space-y-3">
            {topStatus.map(([st, qtd]) => (
              <StatRow key={st} label={st} value={qtd}
                total={totalRecebidos} color="bg-purple-400" />
            ))}
          </div>
        </Card>

      </div>
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
      const { data: rows } = await filtraMes(
        supabase.from("assurant_triagem")
          .select("triagem_funcional, grade, resultado_triagem_funcional, data_funcional, status_bateria"),
        mes
      );

      if (!rows) { setLoading(false); return; }

      const funcionais = {};
      const grades     = {};
      const resultados = {};
      const baterias   = {};
      let total      = 0;
      let semTriagem = 0;
      let comTriagem = 0;

      rows.forEach(r => {
        total++;
        const func = normalizaFuncional(r.triagem_funcional);
        funcionais[func] = (funcionais[func] || 0) + 1;
        if (!r.triagem_funcional) semTriagem++; else comTriagem++;

        const grade = r.grade || "Não informado";
        grades[grade] = (grades[grade] || 0) + 1;

        const res = r.resultado_triagem_funcional || "Não informado";
        resultados[res] = (resultados[res] || 0) + 1;

        if (r.status_bateria) {
          baterias[r.status_bateria] = (baterias[r.status_bateria] || 0) + 1;
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
  const funcionaisArr = Object.entries(funcionais).sort((a, b) => b[1] - a[1]);
  const gradesArr     = Object.entries(grades).sort((a, b) => b[1] - a[1]);
  const resultadosArr = Object.entries(resultados).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const bateriasArr   = Object.entries(baterias).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total"       value={fmtN(total)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Triagem" value={fmtN(comTriagem)}
          sub={fmtPct(comTriagem, total)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Triagem" value={fmtN(semTriagem)}
          sub={fmtPct(semTriagem, total)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Resultados"  value={Object.keys(resultados).length}
          color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <SectionTitle icon={CheckCircle}>Resultado Funcional</SectionTitle>
          <div className="space-y-3">
            {funcionaisArr.map(([func, qtd]) => (
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
            {gradesArr.map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={total}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle icon={CheckCircle}>Resultado da Triagem</SectionTitle>
          <div className="space-y-3">
            {resultadosArr.map(([res, qtd]) => (
              <StatRow key={res} label={res} value={qtd} total={total}
                color="bg-blue-400" />
            ))}
          </div>
        </Card>

        {bateriasArr.length > 0 && (
          <Card>
            <SectionTitle icon={Layers}>Status da Bateria</SectionTitle>
            <div className="space-y-3">
              {bateriasArr.map(([bat, qtd]) => (
                <StatRow key={bat} label={bat} value={qtd} total={total}
                  color="bg-purple-400" />
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
      const { data: rows } = await filtraMes(
        supabase.from("assurant_triagem")
          .select("tela, laterais, traseira, defeitos_adicionais, grade, data_cosmetico"),
        mes
      );

      if (!rows) { setLoading(false); return; }

      const telas      = {};
      const lateraisM  = {};
      const traseirasM = {};
      const defeitosM  = {};
      const gradesM    = {};
      let total       = 0;
      let comEstetica = 0;
      let semEstetica = 0;

      rows.forEach(r => {
        total++;
        if (r.data_cosmetico) comEstetica++; else semEstetica++;

        const tela = r.tela || "Não informado";
        telas[tela] = (telas[tela] || 0) + 1;

        const lat = r.laterais || "Não informado";
        lateraisM[lat] = (lateraisM[lat] || 0) + 1;

        const tras = r.traseira || "Não informado";
        traseirasM[tras] = (traseirasM[tras] || 0) + 1;

        const grade = r.grade || "Não informado";
        gradesM[grade] = (gradesM[grade] || 0) + 1;

        if (r.defeitos_adicionais?.trim()) {
          const def = r.defeitos_adicionais.trim();
          defeitosM[def] = (defeitosM[def] || 0) + 1;
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
    if (u === "QUEBRADO")                    return "bg-red-400";
    if (["LIKE NEW","EXCELENTE"].includes(u)) return "bg-emerald-400";
    if (u === "MUITO BOM")                   return "bg-emerald-300";
    if (u === "BOM")                         return "bg-blue-400";
    if (u === "REGULAR")                     return "bg-yellow-400";
    return "bg-slate-300";
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiMini label="Total"        value={fmtN(total)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Estética" value={fmtN(comEstetica)}
          sub={fmtPct(comEstetica, total)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Estética" value={fmtN(semEstetica)}
          sub={fmtPct(semEstetica, total)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
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
      const { data: rows } = await filtraMes(
        supabase.from("assurant_triagem")
          .select("data_laudo, data_alocacao, data_oracle, reanalise, status_atual, grade, modelo"),
        mes
      );

      if (!rows) { setLoading(false); return; }

      let total           = 0;
      let comLaudo        = 0;
      let semLaudo        = 0;
      let comReanalise    = 0;
      let comAlocacao     = 0;
      let comOracle       = 0;
      let aguardandoLaudo = 0;
      const gradesLaudo  = {};
      const modelosLaudo = {};

      rows.forEach(r => {
        total++;
        if (r.data_laudo) comLaudo++; else semLaudo++;
        if (r.reanalise === "Sim") comReanalise++;
        if (r.data_alocacao) comAlocacao++;
        if (r.data_oracle) comOracle++;
        if (r.status_atual?.toLowerCase().includes("laudo")) aguardandoLaudo++;

        if (r.data_laudo) {
          const grade = r.grade || "Não informado";
          gradesLaudo[grade] = (gradesLaudo[grade] || 0) + 1;
          const mod = r.modelo || "Não informado";
          modelosLaudo[mod] = (modelosLaudo[mod] || 0) + 1;
        }
      });

      const topModelosLaudo = Object.entries(modelosLaudo)
        .sort((a, b) => b[1] - a[1]).slice(0, 8);

      setData({ total, comLaudo, semLaudo, comReanalise, comAlocacao,
                comOracle, aguardandoLaudo, gradesLaudo, topModelosLaudo });
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
        <KpiMini label="Com Laudo"     value={fmtN(comLaudo)}
          sub={fmtPct(comLaudo, total)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Laudo"     value={fmtN(semLaudo)}
          sub={fmtPct(semLaudo, total)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Aguard. Laudo" value={fmtN(aguardandoLaudo)}
          sub="em status atual"
          color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="Com Reanálise" value={fmtN(comReanalise)}
          sub={fmtPct(comReanalise, total)}
          color="bg-red-50 ring-red-200 text-red-700" />
      </div>

      <Card>
        <SectionTitle icon={FileText}>Pipeline Pós-Laudo</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini label="Com Laudo"    value={fmtN(comLaudo)}
            sub={fmtPct(comLaudo, total)}
            color="bg-purple-50 ring-purple-200 text-purple-700" />
          <KpiMini label="Com Alocação" value={fmtN(comAlocacao)}
            sub={fmtPct(comAlocacao, total)}
            color="bg-blue-50 ring-blue-200 text-blue-700" />
          <KpiMini label="Com Oracle"   value={fmtN(comOracle)}
            sub={fmtPct(comOracle, total)}
            color="bg-teal-50 ring-teal-200 text-teal-700" />
          <KpiMini label="Reanálise"    value={fmtN(comReanalise)}
            sub={fmtPct(comReanalise, total)}
            color="bg-red-50 ring-red-200 text-red-700" />
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
              <StatRow key={mod} label={mod} value={qtd} total={comLaudo}
                color="bg-purple-400" />
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
  const [mesSel, setMesSel] = useState("");
  const [totais, setTotais] = useState(null);

  useEffect(() => {
    async function loadMeses() {
      const { data } = await supabase
        .from("assurant_triagem")
        .select("data_recebimento")
        .not("data_recebimento", "is", null)
        .order("data_recebimento", { ascending: false });

      if (data) {
        const unique = [...new Set(
          data.map(r => r.data_recebimento?.slice(0, 7))
        )].filter(Boolean);
        setMeses(unique);
        if (unique.length > 0) setMesSel(unique[0]);
      }
    }
    loadMeses();
  }, []);

  useEffect(() => {
    if (!mesSel) return;
    async function loadTotais() {
      const base = () => supabase
        .from("assurant_triagem")
        .select("*", { count: "exact", head: true });

      const [
        { count: total },
        { count: comLaudo },
        { count: finalizados },
      ] = await Promise.all([
        filtraMes(base(), mesSel),
        filtraMes(base(), mesSel).not("data_laudo", "is", null),
        filtraMes(base(), mesSel).eq("status_atual", "Finalizado"),
      ]);

      setTotais({ total, comLaudo, finalizados });
    }
    loadTotais();
  }, [mesSel]);

  const ABAS = [
    { key: "recebimento", label: "Recebimento",       icon: Package,     badge: totais?.total },
    { key: "funcional",   label: "Triagem Funcional", icon: CheckCircle, badge: null },
    { key: "estetica",    label: "Triagem Estética",  icon: Layers,      badge: null },
    { key: "laudos",      label: "Laudos",            icon: FileText,    badge: totais?.comLaudo },
  ];

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Operação Assurant</h2>
            <p className="text-xs text-slate-500">
              Warehouse · filtrado por data real de recebimento
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {meses.length > 0 && (
            <MesSelector meses={meses} mesSel={mesSel} onChange={setMesSel} />
          )}
          {totais && (
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 ring-1 ring-purple-200 px-3 py-1.5 rounded-xl">
              {fmtN(totais.total)} recebidos · {fmtN(totais.finalizados)} finalizados
            </span>
          )}
        </div>
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => (
          <TabBtn
            key={a.key}
            label={a.label}
            icon={a.icon}
            active={aba === a.key}
            onClick={() => setAba(a.key)}
            badge={a.badge}
          />
        ))}
      </div>

      {/* Conteúdo */}
      {mesSel && (
        <>
          {aba === "recebimento" && <TabRecebimento      mes={mesSel} />}
          {aba === "funcional"   && <TabTriagemFuncional  mes={mesSel} />}
          {aba === "estetica"    && <TabTriagemEstetica   mes={mesSel} />}
          {aba === "laudos"      && <TabLaudos            mes={mesSel} />}
        </>
      )}

      {/* Alerta reparo */}
      <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">
            Operação de Reparo sem contrato formal
          </p>
          <p className="text-xs text-orange-600 mt-0.5">
            Cláusula 6.2 do Apêndice A exclui reparo do contrato atual.
            Incluir no próximo aditivo com precificação própria.
          </p>
        </div>
      </div>

    </div>
  );
}