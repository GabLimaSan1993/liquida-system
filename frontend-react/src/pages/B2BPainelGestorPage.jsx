import { useState, useEffect } from "react";
import {
  Gauge, RefreshCw, Clock, AlertTriangle, TrendingUp,
  Package, FileText, ScanLine, PackageCheck, Search, MapPin, Ban,
  Zap, GitCommitHorizontal, PauseCircle,
} from "lucide-react";
import {
  buscarPainelGestorB2B, fmtDuracao, fmtCadencia,
  buscarVisaoGeralB2B, agruparPor, agruparMotivos, listarPedidosAcompanhamento,
} from "../services/B2BPainelGestorService.js";

const ABAS = [
  { key: "geral",       label: "Visão geral" },
  { key: "picking",     label: "Picking"     },
  { key: "embalagem",   label: "Embalagem"   },
  { key: "faturamento", label: "Faturamento" },
  { key: "pedidos",     label: "Pedidos"     },
];

const CORES_STATUS = {
  "FATURADO":                 "bg-emerald-500 text-white",
  "EM FATURAMENTO (PARCIAL)": "bg-red-800 text-white",
  "AGUARDANDO FATURAMENTO":   "bg-blue-500 text-white",
  "EM SEPARAÇÃO":             "bg-yellow-300 text-yellow-900",
};

const MESES_TABELA = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                      "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const fmtDia = (iso) => {
  if (!iso) return "—";
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
};

const brl = v => "R$ " + Math.round(Number(v) || 0).toLocaleString("pt-BR");

// Curva do nível aberto: uma linha com o faturado de cada período, em SVG puro
// (nenhuma biblioteca) para não pesar a página.
function CurvaPeriodo({ pontos, selecionados, onClicar }) {
  if (pontos.length < 2) return null;
  const L = 640, A = 130, PAD = 8;
  const max = Math.max(1, ...pontos.map(p => p.valor));
  const passo = pontos.length > 1 ? (L - PAD * 2) / (pontos.length - 1) : 0;
  const xy = pontos.map((p, i) => ({
    ...p,
    x: PAD + i * passo,
    y: A - PAD - (p.valor / max) * (A - PAD * 3),
  }));
  const linha = xy.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${linha} L${xy[xy.length - 1].x.toFixed(1)},${A - PAD} L${xy[0].x.toFixed(1)},${A - PAD} Z`;

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${L} ${A}`} className="w-full" style={{ height: 130 }}>
        <path d={area}  fill="#7F2D92" opacity="0.08" />
        <path d={linha} fill="none" stroke="#7F2D92" strokeWidth="2" />
        {xy.map(p => {
          const on = selecionados.map(String).includes(String(p.nome));
          return (
            <g key={p.nome} onClick={() => onClicar?.(p.nome)} style={{ cursor: "pointer" }}>
              <circle cx={p.x} cy={p.y} r={on ? 5 : 3.5} fill={on ? "#7F2D92" : "#fff"} stroke="#7F2D92" strokeWidth="2" />
              <text x={p.x} y={A - 1} textAnchor="middle" fontSize="9" fill="#94a3b8">{p.nome}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// Barras horizontais dos cortes da visão geral.
function Ranking({ titulo, icone: Icone, dados, mostrarValor = true, cor = "bg-[#7F2D92]", temValor = true }) {
  // Cada card ordena sozinho: por valor faturado ou por volume de itens.
  const [ordem, setOrdem] = useState(mostrarValor ? "valor" : "itens");
  const porValor = ordem === "valor" && temValor;
  const lista = [...dados].sort((a, b) => porValor ? b.valor - a.valor : b.itens - a.itens);
  const max = Math.max(1, ...lista.map(d => (porValor ? d.valor : d.itens)));
  return (
    <Card>
      <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
          <Icone className="h-4 w-4 text-[#7F2D92]" /> {titulo}
        </h3>
        {temValor && (
          <div className="flex gap-1">
            <button onClick={() => setOrdem("valor")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${ordem === "valor" ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              Valor
            </button>
            <button onClick={() => setOrdem("itens")}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg transition ${ordem === "itens" ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              Volume
            </button>
          </div>
        )}
      </div>
      {lista.length === 0 ? (
        <p className="text-xs text-slate-400">Sem dados no período.</p>
      ) : (
        <div className="space-y-3">
          {lista.map(d => {
            const base = porValor ? d.valor : d.itens;
            return (
              <div key={d.nome}>
                <div className="flex justify-between items-baseline text-xs mb-1 gap-2">
                  <span className="font-semibold text-slate-700 truncate">{d.nome}</span>
                  <span className="text-slate-500 shrink-0">
                    {temValor ? `${brl(d.valor)} · ${d.itens}` : `${d.itens} ${d.itens === 1 ? "item" : "itens"}`}
                  </span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className={`h-full ${cor} rounded-full`} style={{ width: `${Math.round(base / max * 100)}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

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
          {fmtDuracao(mediaMin)}{qtd ? ` · ${qtd} itens` : ""}
        </span>
      </div>
      <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${gargalo ? "bg-amber-500" : "bg-[#7F2D92]"}`} style={{ width: `${largura}%` }} />
      </div>
    </div>
  );
}

function MiniStat({ label, value, sub, cor = "slate" }) {
  const map = {
    slate:   "bg-white ring-slate-200 text-slate-800",
    purple:  "bg-purple-50 text-[#26215C]",
    emerald: "bg-emerald-50 text-[#04342C]",
    red:     "bg-red-50 text-[#501313]",
    amber:   "bg-amber-50 text-[#633806]",
  };
  const isRing = cor === "slate";
  return (
    <div className={`rounded-xl p-3 ${isRing ? "ring-1" : ""} ${map[cor]}`}>
      <div className={`text-xs ${cor === "slate" ? "text-slate-500" : "opacity-80"}`}>{label}</div>
      <div className="text-lg font-black mt-0.5">{value}</div>
      {sub && <div className={`text-[11px] mt-0.5 ${cor === "slate" ? "text-slate-400" : "opacity-70"}`}>{sub}</div>}
    </div>
  );
}

function LinhaTempo({ icon: Icon, corIcon, label, valor, sub }) {
  return (
    <div className="bg-white ring-1 ring-slate-200 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${corIcon}`} />
        <span className="text-xs text-slate-500">{label}</span>
        <span className="ml-auto text-lg font-black text-slate-800">{valor}</span>
      </div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Chip({ label, valor, cor = "slate" }) {
  const map = {
    slate:   "bg-white ring-slate-200 text-slate-600",
    purple:  "bg-purple-50 ring-purple-200 text-[#7F2D92]",
    amber:   "bg-amber-50 ring-amber-200 text-amber-700",
    pink:    "bg-pink-50 ring-pink-200 text-pink-700",
    emerald: "bg-emerald-50 ring-emerald-200 text-emerald-700",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl ring-1 ${map[cor]}`}>
      {label} <b className="font-black">{valor}</b>
    </span>
  );
}

export default function B2BPainelGestorPage() {
  const [periodo, setPeriodo] = useState("30d");
  const [dados, setDados]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [aba, setAba]         = useState("geral");

  // Visão geral: árvore de períodos + linhas por item, carregadas uma vez.
  const [geral, setGeral]       = useState(null);
  const [loadGeral, setLoadGeral] = useState(false);
  const [nivel, setNivel]       = useState("ano");
  const [ano, setAno]           = useState(null);
  const [mes, setMes]           = useState(null);
  const [semana, setSemana]     = useState(null);
  const [sel, setSel]           = useState([]);

  // Aba Pedidos — o acompanhamento que hoje é planilha.
  const [pedidosAcomp, setPedidosAcomp] = useState(null);
  const [loadPed, setLoadPed]           = useState(false);
  const [filtroStatus, setFiltroStatus] = useState(null);
  const [buscaPed, setBuscaPed]         = useState("");
  // Nós abertos da tabela dinâmica: "2026", "2026|Agosto", "2026|Agosto|05"
  const [abertos, setAbertos]           = useState(() => new Set());

  function alternarNo(chave) {
    setAbertos(prev => {
      const n = new Set(prev);
      n.has(chave) ? n.delete(chave) : n.add(chave);
      return n;
    });
  }

  useEffect(() => { carregar(); }, [periodo]);
  useEffect(() => { if (aba === "geral" && !geral) carregarGeral(); }, [aba]);
  useEffect(() => { if (aba === "pedidos" && !pedidosAcomp) carregarPedidos(); }, [aba]);

  async function carregarPedidos() {
    setLoadPed(true);
    try {
      const r = await listarPedidosAcompanhamento();
      setPedidosAcomp(r.ok ? r.pedidos : []);
    } catch (e) { console.error(e); setPedidosAcomp([]); }
    finally { setLoadPed(false); }
  }

  async function carregarGeral() {
    setLoadGeral(true);
    try {
      const r = await buscarVisaoGeralB2B();
      setGeral(r.ok ? r : null);
    } catch (e) { console.error(e); setGeral(null); }
    finally { setLoadGeral(false); }
  }

  // Opções do nível aberto e o nó de cada uma.
  const noDe = (k) => {
    if (!geral) return null;
    if (nivel === "ano")    return geral.periodos[k];
    if (nivel === "mes")    return geral.periodos[ano]?.meses?.[k];
    if (nivel === "semana") return geral.periodos[ano]?.meses?.[mes]?.semanas?.[k];
    return geral.periodos[ano]?.meses?.[mes]?.semanas?.[semana]?.dias?.[k];
  };
  const opcoesNivel = !geral ? [] :
    nivel === "ano"    ? Object.keys(geral.periodos) :
    nivel === "mes"    ? Object.keys(geral.periodos[ano]?.meses || {}) :
    nivel === "semana" ? Object.keys(geral.periodos[ano]?.meses?.[mes]?.semanas || {}) :
                         Object.keys(geral.periodos[ano]?.meses?.[mes]?.semanas?.[semana]?.dias || {});

  function abrirNivel(k) {
    if (nivel === "dia") {
      setSel(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k]);
      return;
    }
    if (nivel === "ano")      { setAno(k); setNivel("mes"); }
    else if (nivel === "mes") { setMes(k); setNivel("semana"); }
    else                      { setSemana(k); setNivel("dia"); }
    setSel([]);
  }

  function voltarPara(alvo) {
    if (alvo === "ano")    { setNivel("ano");    setAno(null); setMes(null); setSemana(null); }
    if (alvo === "mes")    { setNivel("mes");    setMes(null); setSemana(null); }
    if (alvo === "semana") { setNivel("semana"); setSemana(null); }
    setSel([]);
  }

  // Filtra as linhas pelo recorte aberto (e pela seleção múltipla, quando houver).
  const noRecorte = (l) => {
    if (ano    && String(l.ano) !== String(ano)) return false;
    if (mes    && l.mes    !== mes)    return false;
    if (semana && l.semana !== semana) return false;
    if (sel.length) {
      const campo = nivel === "dia" ? "dia" : nivel === "semana" ? "semana" : nivel === "mes" ? "mes" : "ano";
      if (!sel.map(String).includes(String(l[campo]))) return false;
    }
    return true;
  };

  const linhasFiltradas = (geral?.linhas || []).filter(noRecorte);
  const naoFatFiltrados = (geral?.naoFaturados || []).filter(noRecorte);
  const totalValor = linhasFiltradas.reduce((s, l) => s + l.valor, 0);
  const ticket = linhasFiltradas.length ? totalValor / linhasFiltradas.length : 0;

  async function carregar() {
    setLoading(true);
    try {
      const res = await buscarPainelGestorB2B(periodo);
      setDados(res.ok ? res : null);
    } catch (e) { console.error(e); setDados(null); }
    finally { setLoading(false); }
  }

  const kpis    = dados?.kpis;
  const etapas  = dados?.etapas || [];
  const picking = dados?.picking || {};
  const caixas  = dados?.caixas || {};
  const nfs     = dados?.nfs || {};
  const wip     = dados?.wip || {};

  const maxEtapa = Math.max(1, ...etapas.map(e => e.mediaMin || 0));
  const gargaloLabel = kpis?.gargalo?.label;
  const emProcesso = wip.em_processo ?? kpis?.emProcessoAgora ?? 0;

  const faixas = picking.faixasLote || [];
  const pausas = picking.pausas || { qtd: 0, totalMin: 0, maior: null };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <Gauge className="h-6 w-6 text-[#7F2D92]" />
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-800">Painel Gestor · Processo B2B</h2>
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

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
              aba === a.key ? "bg-[#7F2D92] text-white shadow-md" : "text-slate-500 hover:bg-slate-100"
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === "geral" && (
        loadGeral ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : !geral ? (
          <div className="text-center py-12 text-slate-400">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Não foi possível carregar a visão geral.</p>
          </div>
        ) : (
          <>
            <Card>
              <div className="text-xs text-slate-500 mb-2.5">
                <button onClick={() => voltarPara("ano")} className="text-purple-700 font-semibold hover:underline">Todos os anos</button>
                {ano && <> › <button onClick={() => voltarPara("mes")} className="text-purple-700 font-semibold hover:underline">{ano}</button></>}
                {mes && <> › <button onClick={() => voltarPara("semana")} className="text-purple-700 font-semibold hover:underline">{mes}</button></>}
                {semana && <> › <span className="font-semibold text-slate-600">{semana}</span></>}
              </div>
              <div className="flex gap-2 flex-wrap">
                {opcoesNivel.map(k => {
                  const no = noDe(k);
                  const on = sel.map(String).includes(String(k));
                  return (
                    <button key={k} onClick={() => abrirNivel(k)}
                      className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ring-1 ${
                        on ? "bg-[#7F2D92] text-white ring-[#7F2D92]" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                      }`}>
                      {k} · {no?.itens ?? 0}
                    </button>
                  );
                })}
              </div>
              <CurvaPeriodo
                pontos={opcoesNivel.map(k => ({ nome: k, valor: noDe(k)?.valor || 0, itens: noDe(k)?.itens || 0 }))}
                selecionados={sel}
                onClicar={k => setSel(s => s.includes(k) ? s.filter(x => x !== k) : [...s, k])}
              />
              <p className="text-[11px] text-slate-400 mt-2">
                {nivel === "dia"
                  ? "Clique nos dias para somar · clique de novo para tirar"
                  : "Clique para abrir o nível seguinte"}
              </p>
            </Card>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard label="Faturado"      value={brl(totalValor)} sub={`${linhasFiltradas.length} itens`} />
              <KpiCard label="Itens"         value={linhasFiltradas.length} sub="no recorte" />
              <KpiCard label="Ticket médio"  value={brl(ticket)} sub="por item" />
              <KpiCard label="Não faturados" value={naoFatFiltrados.length} sub="com motivo" destaque={naoFatFiltrados.length > 0} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Ranking titulo="Faturamento por cliente" icone={TrendingUp} dados={agruparPor(linhasFiltradas, "cliente")} />
              <Ranking titulo="Por grade" icone={Package} dados={agruparPor(linhasFiltradas, "grade")} cor="bg-blue-500" />
              <Ranking titulo="Por produto" icone={ScanLine} dados={agruparPor(linhasFiltradas, "modelo")} cor="bg-emerald-600" />
              <Ranking titulo="Motivos de não faturamento" icone={Ban} dados={agruparMotivos(naoFatFiltrados)} temValor={false} mostrarValor={false} cor="bg-amber-500" />
            </div>
          </>
        )
      )}

      {aba === "pedidos" && (
        loadPed ? (
          <div className="flex items-center justify-center h-40">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : !pedidosAcomp?.length ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido encontrado.</p>
          </div>
        ) : (() => {
          const cont = {};
          pedidosAcomp.forEach(p => { cont[p.status] = (cont[p.status] || 0) + 1; });
          const q = buscaPed.trim().toLowerCase();
          const lista = pedidosAcomp.filter(p =>
            (!filtroStatus || p.status === filtroStatus) &&
            (!q || p.cliente.toLowerCase().includes(q) || String(p.lote || "").toLowerCase().includes(q))
          );
          return (
            <>
              <Card>
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <button onClick={() => setFiltroStatus(null)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${!filtroStatus ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                    Todos · {pedidosAcomp.length}
                  </button>
                  {Object.keys(CORES_STATUS).filter(k => cont[k]).map(k => (
                    <button key={k} onClick={() => setFiltroStatus(filtroStatus === k ? null : k)}
                      className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${filtroStatus === k ? CORES_STATUS[k] : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                      {k} · {cont[k]}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                  <input value={buscaPed} onChange={e => setBuscaPed(e.target.value)}
                    placeholder="Buscar por cliente ou lote..."
                    className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
                </div>
              </Card>

              <Card className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-slate-500 border-b border-slate-200">
                      <th className="px-2 py-2 font-bold">Período / cliente</th>
                      <th className="px-2 py-2 font-bold">Data pedido</th>
                      <th className="px-2 py-2 font-bold text-right">Pedido</th>
                      <th className="px-2 py-2 font-bold text-right">Separado</th>
                      <th className="px-2 py-2 font-bold text-center">Status</th>
                      <th className="px-2 py-2 font-bold">Dt faturamento</th>
                      <th className="px-2 py-2 font-bold text-right">Aging</th>
                      <th className="px-2 py-2 font-bold text-right">Diferença</th>
                      <th className="px-2 py-2 font-bold">Observações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      // Agrupa em ano › mês › dia; o pedido continua sendo a linha final,
                      // para não perder cliente, status e observação no caminho.
                      const arv = {};
                      lista.forEach(p => {
                        const [a, m, d] = (p.dataPedido || "0000-00-00").split("-");
                        const mesNome = MESES_TABELA[Number(m) - 1] || m;
                        ((((arv[a] ||= {})[mesNome] ||= {})[d] ||= [])).push(p);
                      });

                      const soma = (peds) => peds.reduce((s, p) => ({
                        total: s.total + p.total, separado: s.separado + p.separado,
                        diferenca: s.diferenca + p.diferenca, qtd: s.qtd + 1,
                      }), { total: 0, separado: 0, diferenca: 0, qtd: 0 });

                      const linhas = [];
                      Object.keys(arv).sort((x, y) => y.localeCompare(x)).forEach(ano => {
                        const dosAno = Object.values(arv[ano]).flatMap(m => Object.values(m).flat());
                        const tA = soma(dosAno);
                        const chaveA = ano;
                        linhas.push(
                          <tr key={chaveA} className="border-b border-slate-200 bg-slate-50 cursor-pointer hover:bg-slate-100"
                              onClick={() => alternarNo(chaveA)}>
                            <td className="px-2 py-2 font-black text-slate-800">
                              {abertos.has(chaveA) ? "▾" : "▸"} {ano}
                            </td>
                            <td className="px-2 py-2 text-slate-400">{tA.qtd} pedidos</td>
                            <td className="px-2 py-2 text-right font-bold">{tA.total}</td>
                            <td className="px-2 py-2 text-right">{tA.separado}</td>
                            <td colSpan={3} />
                            <td className="px-2 py-2 text-right font-bold text-amber-700">{tA.diferenca || ""}</td>
                            <td />
                          </tr>,
                        );
                        if (!abertos.has(chaveA)) return;

                        Object.keys(arv[ano])
                          .sort((x, y) => MESES_TABELA.indexOf(y) - MESES_TABELA.indexOf(x))
                          .forEach(mes => {
                            const dosMes = Object.values(arv[ano][mes]).flat();
                            const tM = soma(dosMes);
                            const chaveM = `${ano}|${mes}`;
                            linhas.push(
                              <tr key={chaveM} className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                                  onClick={() => alternarNo(chaveM)}>
                                <td className="px-2 py-2 pl-6 font-bold text-slate-700">
                                  {abertos.has(chaveM) ? "▾" : "▸"} {mes}
                                </td>
                                <td className="px-2 py-2 text-slate-400">{tM.qtd} pedidos</td>
                                <td className="px-2 py-2 text-right font-semibold">{tM.total}</td>
                                <td className="px-2 py-2 text-right">{tM.separado}</td>
                                <td colSpan={3} />
                                <td className="px-2 py-2 text-right font-semibold text-amber-700">{tM.diferenca || ""}</td>
                                <td />
                              </tr>,
                            );
                            if (!abertos.has(chaveM)) return;

                            Object.keys(arv[ano][mes]).sort((x, y) => y.localeCompare(x)).forEach(dia => {
                              const peds = arv[ano][mes][dia];
                              const tD = soma(peds);
                              const chaveD = `${ano}|${mes}|${dia}`;
                              linhas.push(
                                <tr key={chaveD} className="border-b border-slate-100 cursor-pointer hover:bg-slate-50"
                                    onClick={() => alternarNo(chaveD)}>
                                  <td className="px-2 py-2 pl-12 font-semibold text-slate-600">
                                    {abertos.has(chaveD) ? "▾" : "▸"} dia {dia}
                                  </td>
                                  <td className="px-2 py-2 text-slate-400">{tD.qtd} pedidos</td>
                                  <td className="px-2 py-2 text-right">{tD.total}</td>
                                  <td className="px-2 py-2 text-right">{tD.separado}</td>
                                  <td colSpan={3} />
                                  <td className="px-2 py-2 text-right text-amber-700">{tD.diferenca || ""}</td>
                                  <td />
                                </tr>,
                              );
                              if (!abertos.has(chaveD)) return;

                              peds.forEach(p => linhas.push(
                                <tr key={p.id} className="border-b border-slate-100 hover:bg-purple-50/40">
                                  <td className="px-2 py-2 pl-16 font-semibold text-slate-700">
                                    {p.cliente}
                                    {p.lote && <span className="block text-[10px] font-normal text-slate-400">{p.lote}</span>}
                                  </td>
                                  <td className="px-2 py-2 text-slate-600">{fmtDia(p.dataPedido)}</td>
                                  <td className="px-2 py-2 text-right font-semibold text-slate-700">{p.total}</td>
                                  <td className="px-2 py-2 text-right text-slate-600">{p.separado}</td>
                                  <td className="px-2 py-2 text-center">
                                    <span className={`inline-block text-[10px] font-black px-2 py-1 rounded ${CORES_STATUS[p.status] || "bg-slate-200 text-slate-600"}`}>
                                      {p.status}
                                    </span>
                                  </td>
                                  <td className="px-2 py-2 text-slate-600">{fmtDia(p.dataFaturamento)}</td>
                                  <td className={`px-2 py-2 text-right font-semibold ${p.agingAberto && p.aging > 2 ? "text-red-600" : "text-slate-600"}`}>
                                    {p.aging != null ? `${p.aging}d` : "—"}
                                  </td>
                                  <td className={`px-2 py-2 text-right font-bold ${p.diferenca > 0 ? "text-amber-700" : "text-slate-400"}`}>
                                    {p.diferenca}
                                  </td>
                                  <td className="px-2 py-2 text-slate-500 max-w-[220px]">{p.observacoes || "—"}</td>
                                </tr>,
                              ));
                            });
                          });
                      });
                      return linhas;
                    })()}
                  </tbody>
                </table>
                {lista.length === 0 && (
                  <p className="text-xs text-slate-400 text-center py-6">Nenhum pedido com esse filtro.</p>
                )}
              </Card>
            </>
          );
        })()
      )}

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
          <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3 ${aba === "geral" ? "hidden" : ""}`}>
            <KpiCard label="Tempo médio total"  value={fmtDuracao(kpis.tempoMedioTotalMin)} sub="data do pedido → faturado" />
            <KpiCard label="Itens faturados"     value={kpis.itensFaturados}                 sub="no período" />
            <KpiCard label="Em processo agora"   value={emProcesso}                          sub="itens em aberto" />
            <KpiCard label="Gargalo atual"       value={kpis.gargalo?.label || "—"}          sub={kpis.gargalo ? `${fmtDuracao(kpis.gargalo.mediaMin)} em média` : "sem dados"} destaque={!!kpis.gargalo} />
          </div>

          {/* Tempo médio por etapa */}
          <Card className={aba === "geral" ? "hidden" : ""}>
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

          {/* Dentro do picking — linha inteira */}
          <Card className={aba === "picking" ? "" : "hidden"}>
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <ScanLine className="h-4 w-4 text-[#7F2D92]" data-aba-picking /> Dentro do picking · tempos e ritmo
            </h3>

            {/* Separação + cadência */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-2.5">
              <LinhaTempo icon={PackageCheck} corIcon="text-[#534AB7]"
                label="Separação" valor={fmtDuracao(picking.separacaoMin)}
                sub={`data do pedido → bipado · ${picking.qtdSeparacao || 0} itens`} />
              <LinhaTempo icon={Zap} corIcon="text-[#534AB7]"
                label="Cadência" valor={fmtCadencia(picking.cadenciaSeg)}
                sub="intervalo médio entre bipes · sem pausas" />
              <LinhaTempo icon={Search} corIcon="text-[#993556]"
                label="Até ir para análise" valor={fmtDuracao(picking.ateAnaliseMin)}
                sub={`pedido → não localizado · ${picking.qtdAnalise || 0} itens`} />
            </div>

            {/* Lote inteiro por faixa */}
            <div className="bg-slate-50 rounded-xl p-3 mb-2.5">
              <div className="flex items-center gap-2 mb-2">
                <GitCommitHorizontal className="h-4 w-4 text-[#534AB7]" />
                <span className="text-xs font-semibold text-slate-600">Lote inteiro (1º → último bipe) · por tamanho</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {faixas.map(f => (
                  <div key={f.chave} className="bg-white ring-1 ring-slate-200 rounded-lg p-2.5 text-center">
                    <div className="text-[11px] text-slate-400 font-semibold">{f.label}</div>
                    <div className="text-sm font-black text-slate-800 mt-0.5">{fmtDuracao(f.mediaMin)}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{f.qtdLotes} {f.qtdLotes === 1 ? "lote" : "lotes"}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Pausas apontadas */}
            <div className={`rounded-xl p-3 mb-2.5 ${pausas.qtd > 0 ? "bg-amber-50" : "bg-slate-50"}`}>
              <div className="flex items-center gap-2">
                <PauseCircle className={`h-4 w-4 ${pausas.qtd > 0 ? "text-[#854F0B]" : "text-slate-400"}`} />
                <span className={`text-xs font-semibold ${pausas.qtd > 0 ? "text-[#854F0B]" : "text-slate-500"}`}>Pausas sem justificativa</span>
                <span className={`ml-auto text-lg font-black ${pausas.qtd > 0 ? "text-[#633806]" : "text-slate-700"}`}>
                  {pausas.qtd} · {fmtDuracao(pausas.totalMin)}
                </span>
              </div>
              <div className={`text-[11px] mt-1 ${pausas.qtd > 0 ? "text-[#854F0B]" : "text-slate-400"}`}>
                {pausas.qtd > 0
                  ? <>intervalos acima de 5 min entre bipes{pausas.maior ? ` — maior: ${fmtDuracao(pausas.maior.min)} (${pausas.maior.quem}, lote ${pausas.maior.lote})` : ""}</>
                  : "nenhuma pausa acima de 5 min no período"}
              </div>
            </div>

            {/* Desfechos da análise */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-emerald-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-[#0F6E56]" />
                  <span className="text-[11px] text-[#0F6E56]">Análise → localizado</span>
                </div>
                <div className="text-base font-black text-[#04342C] mt-1">{fmtDuracao(picking.analiseLocalizadoMin)}</div>
                <div className="text-[10px] text-[#0F6E56] mt-0.5">encontrado depois · {picking.qtdLocalizado || 0} itens</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-3">
                <div className="flex items-center gap-1.5">
                  <Ban className="h-3.5 w-3.5 text-[#854F0B]" />
                  <span className="text-[11px] text-[#854F0B]">Análise → não faturar</span>
                </div>
                <div className="text-base font-black text-[#633806] mt-1">{fmtDuracao(picking.analiseNaoFaturarMin)}</div>
                <div className="text-[10px] text-[#854F0B] mt-0.5">baixado · {picking.qtdNaoFaturar || 0} itens</div>
              </div>
            </div>
          </Card>

          {/* Embalagem + NFs */}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-4 ${["embalagem","faturamento"].includes(aba) ? "" : "hidden"}`}>
            <Card>
              <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                <Package className="h-4 w-4 text-[#7F2D92]" /> Dentro da embalagem · caixas
              </h3>
              <div className="space-y-3">
                <MiniStat label="Tempo médio da caixa" value={fmtDuracao(caixas.tempoMedioMin)} sub="abertura → fechamento" />
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="Fechadas" value={caixas.fechadas || 0} cor="emerald" />
                  <MiniStat label="Abertas"  value={caixas.abertas || 0}  cor="purple" />
                </div>
                <MiniStat label="Média de itens por caixa" value={caixas.mediaItens != null ? caixas.mediaItens : "—"} />
              </div>
            </Card>

            <Card>
              <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                <FileText className="h-4 w-4 text-[#7F2D92]" /> Dentro do faturamento · NFs
              </h3>
              <div className="space-y-3">
                <div className="bg-white ring-1 ring-slate-200 rounded-xl p-3">
                  <div className="text-xs text-slate-500">NFs sem erro</div>
                  <div className="text-lg font-black text-[#04342C] mt-0.5">{nfs.pctOk != null ? `${nfs.pctOk}%` : "—"}</div>
                  <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${nfs.pctOk || 0}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <MiniStat label="NFs com erro" value={nfs.comErro || 0} cor="red" />
                  <MiniStat label="Total NFs"    value={nfs.total || 0} />
                </div>
                <MiniStat label="Itens não faturar (período)" value={nfs.naoFaturar || 0} cor="amber" />
              </div>
            </Card>
          </div>

          {/* WIP agora */}
          <Card className={aba === "geral" ? "hidden" : ""}>
            <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
              <Clock className="h-4 w-4 text-[#7F2D92]" /> Onde os itens estão agora
            </h3>
            <div className="flex flex-wrap gap-2">
              <Chip label="Aguard. picking"    valor={wip.aguard_picking || 0} />
              <Chip label="Não localizado"     valor={wip.nao_localizado || 0} cor="pink" />
              <Chip label="Aguard. embalagem"  valor={wip.aguard_embalagem || 0} cor="purple" />
              <Chip label="Aguard. NF"         valor={wip.aguard_nf || 0} cor="amber" />
              <Chip label="Não faturar"        valor={wip.nao_faturar || 0} />
              <Chip label="Faturados hoje"     valor={wip.faturados_hoje || 0} cor="emerald" />
            </div>
          </Card>
        </>
      )}
    </div>
  );
}