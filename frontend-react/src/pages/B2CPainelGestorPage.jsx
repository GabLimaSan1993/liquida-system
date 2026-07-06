import { useState, useEffect } from "react";
import {
  Gauge, RefreshCw, Clock, AlertTriangle, CheckCircle,
  Loader, ListChecks, TrendingUp,
} from "lucide-react";
import { buscarPainelGestorB2C, fmtDuracao } from "../services/B2CPainelGestorService.js";

const PERIODOS = [
  { key: "7d",   label: "7 dias"  },
  { key: "30d",  label: "30 dias" },
  { key: "tudo", label: "Tudo"    },
];

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function KpiCard({ label, value, sub, destaque }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${destaque ? "bg-amber-50 ring-amber-200" : "bg-white ring-slate-200"} shadow-sm`}>
      <div className={`text-xs font-semibold ${destaque ? "text-amber-700" : "text-slate-500"}`}>{label}</div>
      <div className={`text-2xl font-black mt-0.5 ${destaque ? "text-amber-800" : "text-slate-800"}`}>{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${destaque ? "text-amber-600" : "text-slate-400"}`}>{sub}</div>}
    </div>
  );
}

function BarraEtapa({ label, mediaMin, qtd, largura, gargalo, paralela }) {
  return (
    <div>
      <div className="flex justify-between items-center text-xs mb-1 gap-2">
        <span className={`font-semibold flex items-center gap-1.5 ${gargalo ? "text-amber-800" : "text-slate-700"}`}>
          {label}
          {paralela && <span className="text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">paralela</span>}
          {gargalo && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">gargalo</span>}
        </span>
        <span className={gargalo ? "text-amber-700 font-semibold" : "text-slate-500"}>
          {fmtDuracao(mediaMin)}{qtd ? ` · ${qtd} ped.` : ""}
        </span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${gargalo ? "bg-amber-500" : "bg-[#7F2D92]"}`} style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

function MesaCard({ label, mediaMin, qtd, largura, destaque }) {
  return (
    <div className="bg-white ring-1 ring-slate-200 rounded-xl p-3 shadow-sm">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-black mt-0.5 mb-1.5 ${destaque ? "text-amber-800" : "text-slate-800"}`}>{fmtDuracao(mediaMin)}</div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${destaque ? "bg-amber-500" : "bg-[#7F2D92]"}`} style={{ width: `${largura}%` }} />
      </div>
      {qtd ? <div className="text-[11px] text-slate-400 mt-1">{qtd} passagens</div> : <div className="text-[11px] text-slate-300 mt-1">sem dados</div>}
    </div>
  );
}

function Chip({ label, valor, cor = "slate" }) {
  const map = {
    slate:   "bg-white ring-slate-200 text-slate-600",
    purple:  "bg-purple-50 ring-purple-200 text-[#7F2D92]",
    amber:   "bg-amber-50 ring-amber-200 text-amber-700",
    orange:  "bg-orange-50 ring-orange-200 text-orange-700",
    emerald: "bg-emerald-50 ring-emerald-200 text-emerald-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ring-1 ${map[cor]}`}>
      {label} <b className="font-black">{valor}</b>
    </span>
  );
}

export default function B2CPainelGestorPage() {
  const [periodo, setPeriodo] = useState("30d");
  const [dados, setDados]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, [periodo]);

  async function carregar() {
    setLoading(true);
    try {
      const res = await buscarPainelGestorB2C(periodo);
      setDados(res.ok ? res : null);
    } catch (e) { console.error(e); setDados(null); }
    finally { setLoading(false); }
  }

  const kpis   = dados?.kpis;
  const etapas = dados?.etapas || [];
  const mesas  = dados?.mesas || [];
  const wip    = dados?.wip || {};

  const maxEtapa = Math.max(1, ...etapas.map(e => e.mediaMin || 0));
  const maxMesa  = Math.max(1, ...mesas.map(m => m.mediaMin || 0));
  const gargaloLabel = kpis?.gargalo?.label;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Gauge className="h-6 w-6 text-[#7F2D92]" />
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-800">Painel Gestor · Processo B2C</h2>
          <p className="text-xs text-slate-500">Tempos em horário de operação (seg–sex 08:00–17:48 · sáb 07:00–16:00)</p>
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${
                periodo === p.key ? "bg-[#7F2D92] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}>
              {p.label}
            </button>
          ))}
          <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1 ml-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : !dados ? (
        <div className="text-center py-12 text-slate-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Não foi possível carregar o painel.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Tempo médio total"  value={fmtDuracao(kpis.tempoMedioTotalMin)} sub="criado → saída" />
            <KpiCard label="Concluídos"          value={kpis.concluidos}                     sub="no período" />
            <KpiCard label="Em processo agora"   value={kpis.emProcessoAgora}                sub="WIP total" />
            <KpiCard label="Gargalo atual"       value={kpis.gargalo?.label || "—"}          sub={kpis.gargalo ? `${fmtDuracao(kpis.gargalo.mediaMin)} em média` : "sem dados"} destaque={!!kpis.gargalo} />
          </div>

          {/* Tempo médio por etapa */}
          <Card>
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#7F2D92]" /> Tempo médio por etapa
            </h3>
            <div className="space-y-3">
              {etapas.map(e => (
                <BarraEtapa key={e.chave}
                  label={e.label} mediaMin={e.mediaMin} qtd={e.qtd}
                  largura={e.mediaMin ? Math.round((e.mediaMin / maxEtapa) * 100) : 0}
                  gargalo={e.label === gargaloLabel} paralela={e.paralela} />
              ))}
            </div>
          </Card>

          {/* Dentro da embalagem */}
          <Card>
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-[#7F2D92]" /> Dentro da embalagem · por mesa
            </h3>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {mesas.map(m => (
                <MesaCard key={m.chave}
                  label={m.label} mediaMin={m.mediaMin} qtd={m.qtd}
                  largura={m.mediaMin ? Math.round((m.mediaMin / maxMesa) * 100) : 0}
                  destaque={m.mediaMin != null && m.mediaMin === maxMesa && maxMesa > 1} />
              ))}
            </div>
          </Card>

          {/* WIP agora */}
          <Card>
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#7F2D92]" /> Onde os pedidos estão agora
            </h3>
            <div className="flex flex-wrap gap-2">
              <Chip label="Aguard. alocação"     valor={wip.aguardando_alocacao || 0} />
              <Chip label="Picking"              valor={wip.picking || 0} />
              <Chip label="Análise"              valor={wip.analise || 0} cor="orange" />
              <Chip label="Aguard. Mesa 1"       valor={wip.aguardando_mesa_1 || 0} cor="purple" />
              <Chip label="Mesa 1"               valor={wip.mesa_1 || 0} cor="purple" />
              <Chip label="Mesa 2"               valor={wip.mesa_2 || 0} cor="purple" />
              <Chip label="Mesa 3"               valor={wip.mesa_3 || 0} cor="purple" />
              <Chip label="Mesa 4"               valor={wip.mesa_4 || 0} cor="purple" />
              <Chip label="Aguard. faturamento"  valor={wip.aguardando_faturamento || 0} cor="amber" />
              <Chip label="Concluídos hoje"      valor={wip.concluidos_hoje || 0} cor="emerald" />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}