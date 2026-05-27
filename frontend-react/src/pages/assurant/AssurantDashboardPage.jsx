import {
  Package, Truck, ScanLine, AlertTriangle, CheckCircle, Clock,
} from "lucide-react";

// ── Dados mockados — substituir por API depois ──────────
const RESUMO_MES = {
  mes: "Abr/26",
  recebimento: { total: 12629, grv: 536, online: 2379, ybv: 9471, dev: 243 },
  expedicao:   { total: 9767,  b2b: 3306, b2c: 3762, b2e: 450, b2i: 2249 },
  triagem:     { total: 11633, funcional: 11633, cosmetica: 0, laudo: 0, alocacao: 0, oracle: 0 },
};

const SLA_MES = {
  recebimento:   { meta: 95,   realizado: 97.2 },
  triagem:       { meta: 95,   realizado: 96.1 },
  expedicao_b2c: { meta: 100,  realizado: 98.4 },
  expedicao_b2b: { meta: 90,   realizado: 94.7 },
  inventario:    { meta: 99.8, realizado: 99.9 },
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
  if (realizado >= f[1][0]) return { mult: f[1][1], label: "+5% bônus",     color: "text-emerald-600" };
  if (realizado >= f[0][0]) return { mult: f[0][1], label: "100% ok",       color: "text-slate-500" };
  return                           { mult: 90,       label: "-10% desconto", color: "text-red-500" };
}

// ── Componentes ──────────────────────────────────────────
function SlaBar({ label, meta, realizado, processo }) {
  const pct = Math.min(realizado, 100);
  const ok  = realizado >= meta;
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
  const r = RESUMO_MES;

  return (
    <div className="space-y-6">

      {/* Cabeçalho do mês */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Operação Assurant</h2>
            <p className="text-xs text-slate-500">Warehouse · {r.mes} · dados provisórios</p>
          </div>
        </div>
        <span className="text-xs font-semibold text-purple-600 bg-purple-50 ring-1 ring-purple-200 px-3 py-1.5 rounded-xl">
          Contrato ativo
        </span>
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
            <VolBar label="GRV"    value={r.recebimento.grv}    total={r.recebimento.total} color="bg-purple-400" />
            <VolBar label="Online" value={r.recebimento.online}  total={r.recebimento.total} color="bg-purple-500" />
            <VolBar label="YBV"    value={r.recebimento.ybv}     total={r.recebimento.total} color="bg-purple-600" />
            <VolBar label="Devol." value={r.recebimento.dev}     total={r.recebimento.total} color="bg-purple-300" />
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

          <div className="border-t border-slate-100 pt-4 space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
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
            <SlaBar label="Recebimento (95% em 24h)"    meta={SLA_MES.recebimento.meta}   realizado={SLA_MES.recebimento.realizado}   processo="recebimento" />
            <SlaBar label="Triagem (95% em 24h)"        meta={SLA_MES.triagem.meta}       realizado={SLA_MES.triagem.realizado}       processo="triagem" />
            <SlaBar label="Expedição B2C (100% D+0)"    meta={SLA_MES.expedicao_b2c.meta} realizado={SLA_MES.expedicao_b2c.realizado} processo="expedicao_b2c" />
            <SlaBar label="Expedição B2B (90% em 24h)"  meta={SLA_MES.expedicao_b2b.meta} realizado={SLA_MES.expedicao_b2b.realizado} processo="expedicao_b2b" />
            <SlaBar label="Inventário (99,8%)"          meta={SLA_MES.inventario.meta}    realizado={SLA_MES.inventario.realizado}    processo="inventario" />
          </div>
        </div>
      </div>

      {/* Alerta operação reparo */}
      <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">
            Atenção: Operação de Reparo sem contrato formal
          </p>
          <p className="text-xs text-orange-600 mt-0.5">
            O contrato (cláusula 6.2 do Apêndice A) exclui a Operação de Reparo.
            Serviço está sendo prestado sem base contratual.
            Incluir no próximo aditivo com precificação própria.
          </p>
        </div>
      </div>

    </div>
  );
}