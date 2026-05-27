import { useState } from "react";
import {
  Package, Truck, ScanLine, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle, Clock, Award
} from "lucide-react";

// ── Dados mockados — substituir por API depois ──────────
const RESUMO_MES = {
  mes: "Abr/26",
  recebimento: { total: 12629, grv: 536, online: 2379, ybv: 9471, dev: 243 },
  expedicao:   { total: 9767,  b2b: 3306, b2c: 3762, b2e: 450, b2i: 2249 },
  triagem:     { total: 11633, funcional: 11633, cosmetica: 0, laudo: 0, alocacao: 0, oracle: 0 },
  faturamento: 242833,
  custo:       156770,
  ebitda:      86063,
  margem:      0.354,
};

const SLA_MES = {
  recebimento: { meta: 95, realizado: 97.2 },
  triagem:     { meta: 95, realizado: 96.1 },
  expedicao_b2c: { meta: 100, realizado: 98.4 },
  expedicao_b2b: { meta: 90,  realizado: 94.7 },
  inventario:  { meta: 99.8, realizado: 99.9 },
};

// ── Helpers ──────────────────────────────────────────────
function calcMultiplicador(processo, realizado) {
  const faixas = {
    triagem:       [[95, 100], [98, 105]],
    expedicao_b2c: [[90, 100], [98, 105]],
    expedicao_b2b: [[95, 100], [98, 105]],
  };
  const f = faixas[processo];
  if (!f) return { mult: 100, label: "100%", color: "text-emerald-600" };
  if (realizado >= f[1][0]) return { mult: f[1][1], label: "+5% bônus", color: "text-emerald-600" };
  if (realizado >= f[0][0]) return { mult: f[0][1], label: "100% ok", color: "text-slate-500" };
  return { mult: 90, label: "-10% desconto", color: "text-red-500" };
}

function fmtBRL(v) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtPct(v) {
  return (v * 100).toFixed(1) + "%";
}

// ── Componentes ──────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, color = "purple", trend }) {
  const colors = {
    purple: "bg-purple-50 text-purple-700 ring-purple-200",
    green:  "bg-emerald-50 text-emerald-700 ring-emerald-200",
    blue:   "bg-blue-50 text-blue-700 ring-blue-200",
    orange: "bg-orange-50 text-orange-700 ring-orange-200",
    red:    "bg-red-50 text-red-700 ring-red-200",
  };
  return (
    <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className={`inline-flex items-center justify-center h-10 w-10 rounded-xl ring-1 ${colors[color]}`}>
          <Icon className="h-5 w-5" />
        </span>
        {trend !== undefined && (
          <span className={`text-xs font-semibold ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>
            {trend >= 0 ? "+" : ""}{trend}%
          </span>
        )}
      </div>
      <div>
        <div className="text-2xl font-black text-slate-800">{value}</div>
        <div className="text-xs font-semibold text-slate-500 mt-0.5">{label}</div>
        {sub && <div className="text-xs text-slate-400 mt-1">{sub}</div>}
      </div>
    </div>
  );
}

function SlaBar({ label, meta, realizado, processo }) {
  const pct = Math.min(realizado, 100);
  const ok = realizado >= meta;
  const mult = calcMultiplicador(processo, realizado);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="font-semibold text-slate-700">{label}</span>
        <div className="flex items-center gap-2">
          <span className={`text-xs font-bold ${mult.color}`}>{mult.label}</span>
          <span className={`font-black ${ok ? "text-emerald-600" : "text-red-500"}`}>
            {realizado.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${ok ? "bg-emerald-500" : "bg-red-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-slate-400">
        <span>Meta: {meta}%</span>
        <span className={ok ? "text-emerald-500" : "text-red-400"}>
          {ok ? "✓ Dentro do SLA" : "✗ Fora do SLA"}
        </span>
      </div>
    </div>
  );
}

function VolBar({ label, value, total, color }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-xs font-semibold text-slate-600 text-right shrink-0">{label}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-14 text-xs font-bold text-slate-700 text-right shrink-0">
        {value.toLocaleString("pt-BR")}
      </span>
      <span className="w-10 text-xs text-slate-400 text-right shrink-0">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────
export default function AssurantDashboardPage() {
  const [mes] = useState(RESUMO_MES.mes);
  const r = RESUMO_MES;

  // Calcular impacto financeiro do SLA
  const bonusTriagem    = calcMultiplicador("triagem",       SLA_MES.triagem.realizado);
  const bonusExpB2C     = calcMultiplicador("expedicao_b2c", SLA_MES.expedicao_b2c.realizado);
  const bonusExpB2B     = calcMultiplicador("expedicao_b2b", SLA_MES.expedicao_b2b.realizado);
  const impactoSLA      = r.faturamento * ((bonusTriagem.mult + bonusExpB2C.mult + bonusExpB2B.mult) / 3 / 100 - 1);

  return (
    <div className="space-y-6">

      {/* Cabeçalho do mês */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Operação Assurant</h2>
            <p className="text-xs text-slate-500">Warehouse · {mes} · dados provisórios</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-purple-600 bg-purple-50 ring-1 ring-purple-200 px-3 py-1.5 rounded-xl">
          Lucro Presumido · 14,33% impostos
        </span>
      </div>

      {/* KPIs financeiros */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard icon={TrendingUp}   label="Faturamento Bruto"  value={fmtBRL(r.faturamento)} color="purple" />
        <KpiCard icon={TrendingDown} label="Custos Operacionais" value={fmtBRL(r.custo)}       color="orange" />
        <KpiCard icon={Award}        label="EBITDA"              value={fmtBRL(r.ebitda)}       color="green" />
        <KpiCard
          icon={r.margem > 0 ? CheckCircle : AlertTriangle}
          label="Margem Líquida"
          value={fmtPct(r.margem)}
          color={r.margem >= 0.15 ? "green" : r.margem >= 0 ? "orange" : "red"}
        />
      </div>

      {/* Volume por canal + SLA lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Volumes */}
        <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm space-y-5">
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <Package className="h-4 w-4 text-purple-600" /> Volumes por Canal
          </h3>

          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Recebimento — {r.recebimento.total.toLocaleString("pt-BR")} un
            </p>
            <VolBar label="GRV"      value={r.recebimento.grv}    total={r.recebimento.total} color="bg-purple-400" />
            <VolBar label="Online"   value={r.recebimento.online}  total={r.recebimento.total} color="bg-purple-500" />
            <VolBar label="YBV"      value={r.recebimento.ybv}     total={r.recebimento.total} color="bg-purple-600" />
            <VolBar label="Devol."   value={r.recebimento.dev}     total={r.recebimento.total} color="bg-purple-300" />
          </div>

          <div className="border-t border-slate-100 pt-4 space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Expedição — {r.expedicao.total.toLocaleString("pt-BR")} un
            </p>
            <VolBar label="B2B" value={r.expedicao.b2b} total={r.expedicao.total} color="bg-blue-500" />
            <VolBar label="B2C" value={r.expedicao.b2c} total={r.expedicao.total} color="bg-blue-400" />
            <VolBar label="B2E" value={r.expedicao.b2e} total={r.expedicao.total} color="bg-blue-300" />
            <VolBar label="B2I" value={r.expedicao.b2i} total={r.expedicao.total} color="bg-blue-200" />
          </div>

          <div className="border-t border-slate-100 pt-4">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Triagem — {r.triagem.total.toLocaleString("pt-BR")} un
            </p>
            <VolBar label="Funcional" value={r.triagem.funcional} total={r.triagem.total} color="bg-emerald-500" />
          </div>
        </div>

        {/* SLA */}
        <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm space-y-5">
          <h3 className="font-black text-slate-800 flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-600" /> SLA Contratual
          </h3>

          <div className="space-y-4">
            <SlaBar label="Recebimento (95% em 24h)"  meta={SLA_MES.recebimento.meta}   realizado={SLA_MES.recebimento.realizado}   processo="recebimento" />
            <SlaBar label="Triagem (95% em 24h)"      meta={SLA_MES.triagem.meta}       realizado={SLA_MES.triagem.realizado}       processo="triagem" />
            <SlaBar label="Expedição B2C (100% D+0)"  meta={SLA_MES.expedicao_b2c.meta} realizado={SLA_MES.expedicao_b2c.realizado} processo="expedicao_b2c" />
            <SlaBar label="Expedição B2B (90% em 24h)" meta={SLA_MES.expedicao_b2b.meta} realizado={SLA_MES.expedicao_b2b.realizado} processo="expedicao_b2b" />
            <SlaBar label="Inventário (99,8%)"        meta={SLA_MES.inventario.meta}    realizado={SLA_MES.inventario.realizado}    processo="inventario" />
          </div>

          {/* Impacto financeiro do SLA */}
          <div className={`rounded-xl p-4 ${impactoSLA >= 0 ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-orange-50 ring-1 ring-orange-200"}`}>
            <p className="text-xs font-bold text-slate-500 mb-1">Impacto financeiro do SLA no mês</p>
            <p className={`text-xl font-black ${impactoSLA >= 0 ? "text-emerald-700" : "text-orange-700"}`}>
              {impactoSLA >= 0 ? "+" : ""}{fmtBRL(impactoSLA)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Multiplicadores contratuais aplicados sobre faturamento
            </p>
          </div>
        </div>
      </div>

      {/* Alerta operação reparo */}
      <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">Atenção: Operação de Reparo sem contrato formal</p>
          <p className="text-xs text-orange-600 mt-0.5">
            O contrato (cláusula 6.2 do Apêndice A) exclui a Operação de Reparo. Serviço está sendo prestado
            sem base contratual. Incluir no próximo aditivo com precificação própria.
          </p>
        </div>
      </div>

    </div>
  );
}