import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, Download,
  Package, X, BarChart3, Clock, Box, FileText,
  Tag, Plus, Lock, MapPin, RotateCcw, TrendingUp,
  ChevronDown, ChevronUp, Calendar, Upload,
} from "lucide-react";
import {
  listarPedidosB2B, listarItensComStatusGaia,
  registrarBipagem, exportarFaturamento, importarNFPlanilha,
  listarExportacoes, marcarNaoLocalizado,
  reverterNaoLocalizado, buscarResumoValorPedido,
  listarNFsPedido, listarPedidosConcluidos,
} from "../services/b2bService.js";
import {
  buscarCaixaAberta, criarCaixa, listarCaixas,
  listarItensCaixa, embalarImei, fecharCaixa,
  gerarRomaneio, gerarEtiqueta, gerarRomaneioPedido,
} from "../services/b2bEmbalagemService.js";
import { useAuth } from "../AuthContext.jsx";

function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtR(v) { return v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"; }

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
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

function StatusBadge({ status }) {
  const map = {
    aberto:         { label: "Em aberto",      cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    concluido:      { label: "Concluído",       cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    pendente:       { label: "Pendente",        cls: "bg-slate-50 text-slate-500 ring-slate-200" },
    bipado:         { label: "Bipado",          cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    nao_localizado: { label: "Não Localizado",  cls: "bg-amber-50 text-amber-700 ring-amber-200" },
    aberta:         { label: "Aberta",          cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    fechada:        { label: "Fechada",         cls: "bg-slate-50 text-slate-600 ring-slate-200" },
  };
  const s = map[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ring-1 ${s.cls}`}>{s.label}</span>;
}

function ProgressBar({ value, total, color }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{fmtN(value)} de {fmtN(total)}</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: color || (pct === 100 ? "#1D9E75" : "#7F2D92") }} />
      </div>
    </div>
  );
}

function ModalNaoLocalizado({ item, onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0"><MapPin className="h-5 w-5 text-amber-600" /></div>
          <div><h2 className="text-lg font-black text-slate-800">Não Localizado</h2><p className="text-xs text-slate-500">Confirme que o aparelho não foi encontrado</p></div>
        </div>
        <div className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-4 mb-6 space-y-1">
          <p className="text-xs font-bold text-amber-700">Aparelho</p>
          <p className="text-sm font-semibold text-slate-800">{item.modelo}</p>
          <p className="text-xs text-slate-500 font-mono">{item.imei}</p>
          <p className="text-xs text-slate-500">Local: <span className="font-semibold font-mono">{item.local_estoque || "—"}</span></p>
        </div>
        <p className="text-sm text-slate-600 mb-6">O aparelho será marcado como <span className="font-bold text-amber-700">Não Localizado</span> e removido da lista de pendentes.</p>
        <div className="flex gap-3">
          <button onClick={onConfirmar} className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 transition">Confirmar — Não Localizado</button>
          <button onClick={onCancelar} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function ModalReverter({ item, onConfirmar, onCancelar }) {
  const [rua, setRua] = useState(""), [bloco, setBloco] = useState(""), [andar, setAndar] = useState(""), [ap, setAp] = useState(""), [erro, setErro] = useState("");

  function handleConfirmar() {
    if (!rua.trim() || !bloco.trim() || !andar.trim() || !ap.trim()) { setErro("Preencha todos os campos de localização."); return; }
    onConfirmar(`RUA ${rua.trim()}/BL${bloco.trim()}/AD${andar.trim()}/${ap.trim().toUpperCase()}`);
  }

  const inputCls = "w-full rounded-xl border border-[#E9D5FF] px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0"><RotateCcw className="h-5 w-5 text-purple-600" /></div>
          <div><h2 className="text-lg font-black text-slate-800">Reverter para Pendente</h2><p className="text-xs text-slate-500">Informe a nova localização do aparelho</p></div>
        </div>
        <div className="bg-slate-50 ring-1 ring-slate-200 rounded-2xl p-4 mb-5 space-y-1">
          <p className="text-xs font-bold text-slate-500">Aparelho</p>
          <p className="text-sm font-semibold text-slate-800">{item.modelo}</p>
          <p className="text-xs text-slate-500 font-mono">{item.imei}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div><label className="block text-xs font-bold text-slate-600 mb-1">Rua *</label><input value={rua} onChange={e => setRua(e.target.value)} className={inputCls} placeholder="Ex: 1" /></div>
          <div><label className="block text-xs font-bold text-slate-600 mb-1">Bloco *</label><input value={bloco} onChange={e => setBloco(e.target.value)} className={inputCls} placeholder="Ex: 03" /></div>
          <div><label className="block text-xs font-bold text-slate-600 mb-1">Andar *</label><input value={andar} onChange={e => setAndar(e.target.value)} className={inputCls} placeholder="Ex: 02" /></div>
          <div><label className="block text-xs font-bold text-slate-600 mb-1">AP *</label><input value={ap} onChange={e => setAp(e.target.value)} className={inputCls} placeholder="Ex: B03" /></div>
        </div>
        {(rua || bloco || andar || ap) && (
          <div className="bg-purple-50 ring-1 ring-purple-200 rounded-xl px-4 py-2 mb-4 text-xs font-mono text-purple-700 font-bold">
            Novo local: RUA {rua || "?"}/BL{bloco || "?"}/AD{andar || "?"}/{ap?.toUpperCase() || "?"}
          </div>
        )}
        {erro && <div className="bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2 mb-4 text-xs font-semibold text-red-600">{erro}</div>}
        <div className="flex gap-3">
          <button onClick={handleConfirmar} className="flex-1 rounded-2xl bg-[#7F2D92] py-3 text-sm font-bold text-white hover:bg-[#5B1E74] transition">Confirmar nova localização</button>
          <button onClick={onCancelar} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

function GaiaBadge({ status }) {
  if (!status) return <span className="text-slate-300">—</span>;
  const cls =
    status === "Finalizado"            ? "bg-emerald-50 text-emerald-700" :
    status === "Produto disponível"    ? "bg-blue-50 text-blue-700"       :
    status === "Reservado para reparo" ? "bg-orange-50 text-orange-700"   :
    "bg-slate-50 text-slate-500";
  return <span className={`px-2 py-0.5 rounded-lg font-semibold text-xs ${cls}`}>{status}</span>;
}

// ══════════════════════════════════════════════════════════
// ABA PICKING
// ══════════════════════════════════════════════════════════
function TabPicking({ pedidosIniciais, onAtualizarSilencioso }) {
  const { user }                          = useAuth();
  const [pedidos, setPedidos]             = useState(pedidosIniciais);
  const [pedidoSel, setPedido]            = useState(null);
  const [itens, setItens]                 = useState([]);
  const [loading, setLoading]             = useState(false);
  const [imeiInput, setImei]              = useState("");
  const [feedback, setFeedback]           = useState(null);
  const [filtro, setFiltro]               = useState("pendente");
  const [busca, setBusca]                 = useState("");
  const [ruasSel, setRuasSel]             = useState([]);
  const [modalNaoLoc, setModalNaoLoc]     = useState(null);
  const [modalReverter, setModalReverter] = useState(null);
  const inputRef                          = useRef(null);

  // ── CORREÇÃO: sincroniza quando o pai termina de carregar ──
  useEffect(() => {
    if (pedidosIniciais.length > 0 && pedidos.length === 0) {
      setPedidos(pedidosIniciais);
    }
  }, [pedidosIniciais]);

  async function atualizarPedidos() {
    const data = await listarPedidosB2B();
    setPedidos(data);
    if (pedidoSel) {
      const atualizado = data.find(p => p.id === pedidoSel.id);
      if (atualizado) setPedido(atualizado);
    }
    onAtualizarSilencioso?.(data);
  }

  useEffect(() => { if (pedidoSel) carregarItens(); }, [pedidoSel]);
  useEffect(() => { if (pedidoSel) inputRef.current?.focus(); }, [pedidoSel]);

  async function carregarItens() {
    setLoading(true);
    const data = await listarItensComStatusGaia(pedidoSel.id);
    setItens(data);
    setLoading(false);
  }

  async function handleBipar(e) {
    e.preventDefault();
    if (!imeiInput.trim() || !pedidoSel) return;
    const res = await registrarBipagem(imeiInput.trim(), pedidoSel.id, user.id);
    setImei("");
    if (res.ok) {
      setFeedback({ tipo: "ok", msg: `✓ IMEI ${imeiInput.trim()} bipado!`, item: res.item });
      setItens(prev => prev.map(i => i.imei === imeiInput.trim() ? { ...i, status: "bipado", bipado_em: new Date().toISOString() } : i));
      setPedido(prev => ({ ...prev, total_bipados: (prev.total_bipados || 0) + 1 }));
      atualizarPedidos();
    } else {
      setFeedback({ tipo: "erro", msg: res.erro });
    }
    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  async function confirmarNaoLocalizado() {
    if (!modalNaoLoc) return;
    try {
      await marcarNaoLocalizado(modalNaoLoc.id, user.id);
      setItens(prev => prev.map(i => i.id === modalNaoLoc.id ? { ...i, status: "nao_localizado", nao_localizado_em: new Date().toISOString() } : i));
      setFeedback({ tipo: "aviso", msg: `⚠ IMEI ${modalNaoLoc.imei} marcado como Não Localizado.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setModalNaoLoc(null); inputRef.current?.focus(); }
  }

  async function confirmarReverter(novoLocal) {
    if (!modalReverter) return;
    try {
      await reverterNaoLocalizado(modalReverter.id, novoLocal);
      setItens(prev => prev.map(i => i.id === modalReverter.id ? { ...i, status: "pendente", local_estoque: novoLocal, nao_localizado_em: null } : i));
      setFeedback({ tipo: "ok", msg: `✓ IMEI ${modalReverter.imei} revertido para Pendente.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setModalReverter(null); inputRef.current?.focus(); }
  }

  const ruasDisponiveis = [...new Set(
    itens.filter(i => i.local_estoque)
      .map(i => { const m = i.local_estoque.match(/^RUA\s+(\d+)/i); return m ? `RUA ${m[1]}` : null; })
      .filter(Boolean)
  )].sort((a, b) => parseInt(a.replace("RUA ", "")) - parseInt(b.replace("RUA ", "")));

  function toggleRua(rua) {
    setRuasSel(prev => prev.includes(rua) ? prev.filter(r => r !== rua) : [...prev, rua]);
  }

  const itensFiltrados = itens.filter(i => {
    const matchFiltro = filtro === "todos" || i.status === filtro;
    const matchBusca  = !busca || i.imei.includes(busca) || i.modelo?.toLowerCase().includes(busca.toLowerCase()) || i.local_estoque?.toLowerCase().includes(busca.toLowerCase()) || i.voucher?.toLowerCase().includes(busca.toLowerCase());
    const matchRua    = ruasSel.length === 0 || ruasSel.some(r => i.local_estoque?.match(new RegExp(`^RUA\\s+${r.replace("RUA ", "")}\\b`, "i")));
    return matchFiltro && matchBusca && matchRua;
  });

  const totalBipados  = itens.filter(i => i.status === "bipado").length;
  const totalPendente = itens.filter(i => i.status === "pendente").length;
  const totalNaoLoc   = itens.filter(i => i.status === "nao_localizado").length;
  const valorTotal    = itens.filter(i => i.status === "bipado").reduce((s, i) => s + (i.valor || 0), 0);

  if (!pedidoSel) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Selecione um pedido:</p>
          <button onClick={atualizarPedidos} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
        </div>
        {pedidos.filter(p => p.status === "aberto").length === 0 ? (
          <div className="text-center py-12 text-slate-400"><Package className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum pedido em aberto.</p></div>
        ) : (
          <div className="grid gap-3">
            {pedidos.filter(p => p.status === "aberto").map(p => (
              <button key={p.id} onClick={() => setPedido(p)}
                className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 text-left hover:ring-purple-300 hover:bg-purple-50 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div><div className="font-bold text-slate-800 text-sm">{p.lote}</div><div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div></div>
                  <StatusBadge status={p.status} />
                </div>
                <ProgressBar value={p.total_bipados || 0} total={p.total_itens || 0} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {modalNaoLoc && <ModalNaoLocalizado item={modalNaoLoc} onConfirmar={confirmarNaoLocalizado} onCancelar={() => { setModalNaoLoc(null); inputRef.current?.focus(); }} />}
      {modalReverter && <ModalReverter item={modalReverter} onConfirmar={confirmarReverter} onCancelar={() => { setModalReverter(null); inputRef.current?.focus(); }} />}

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setPedido(null); setItens([]); setRuasSel([]); }} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><X className="h-3 w-3" /> Trocar pedido</button>
          <div className="flex-1"><h3 className="font-black text-slate-800 text-sm">{pedidoSel.lote}</h3><p className="text-xs text-slate-500">{pedidoSel.cliente}</p></div>
          <StatusBadge status={pedidoSel.status} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini label="Total" value={fmtN(pedidoSel.total_itens)} color="bg-purple-50 ring-purple-200 text-purple-700" />
          <KpiMini label="Bipados" value={fmtN(totalBipados)} sub={`${Math.round((totalBipados / (pedidoSel.total_itens || 1)) * 100)}%`} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
          <KpiMini label="Pendentes" value={fmtN(totalPendente)} color="bg-orange-50 ring-orange-200 text-orange-700" />
          {totalNaoLoc > 0
            ? <KpiMini label="Não Localizados" value={fmtN(totalNaoLoc)} color="bg-amber-50 ring-amber-200 text-amber-700" />
            : <KpiMini label="Valor bipado" value={fmtR(valorTotal)} color="bg-blue-50 ring-blue-200 text-blue-700" />
          }
        </div>

        <Card><ProgressBar value={totalBipados} total={pedidoSel.total_itens || 0} /></Card>

        {ruasDisponiveis.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" /> Filtrar por rua:</span>
              <button onClick={() => setRuasSel([])} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${ruasSel.length === 0 ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Todas</button>
              {ruasDisponiveis.map(rua => (
                <button key={rua} onClick={() => toggleRua(rua)} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${ruasSel.includes(rua) ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{rua}</button>
              ))}
              {ruasSel.length > 0 && <span className="text-xs text-purple-600 font-semibold ml-1">{itensFiltrados.filter(i => i.status === "pendente").length} pendentes nas ruas selecionadas</span>}
            </div>
          </Card>
        )}

        <Card>
          <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4 text-sm"><Search className="h-4 w-4 text-[#7F2D92]" /> Bipar IMEI</h3>
          <form onSubmit={handleBipar} className="flex gap-3">
            <input ref={inputRef} type="text" value={imeiInput} onChange={e => setImei(e.target.value)}
              placeholder="Bipe ou digite o IMEI..."
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              autoComplete="off" />
            <button type="submit" disabled={!imeiInput.trim()}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <CheckCircle className="h-4 w-4" /> Confirmar
            </button>
          </form>
          {feedback && (
            <div className={`mt-3 flex items-start gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : feedback.tipo === "aviso" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
              {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
              <div>
                <p className="font-semibold">{feedback.msg}</p>
                {feedback.item && <p className="text-xs mt-0.5 opacity-80">{feedback.item.modelo} · {feedback.item.grade} · {feedback.item.local_estoque}</p>}
              </div>
            </div>
          )}
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Package className="h-4 w-4 text-[#7F2D92]" /> Lista de itens</h3>
            <div className="flex gap-2 ml-auto flex-wrap">
              {[{ key: "todos", label: "Todos" }, { key: "pendente", label: "Pendentes" }, { key: "bipado", label: "Bipados" }, { key: "nao_localizado", label: "Não Localizados" }].map(f => (
                <button key={f.key} onClick={() => setFiltro(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtro === f.key ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                  {f.label}
                  {f.key === "nao_localizado" && totalNaoLoc > 0 && <span className="ml-1.5 bg-amber-400 text-white rounded-full px-1.5 py-0.5 text-xs">{totalNaoLoc}</span>}
                </button>
              ))}
            </div>
          </div>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar IMEI, modelo, voucher, local ou status Gaia..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </div>
          {loading ? (
            <div className="flex items-center justify-center h-32"><div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" /></div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead><tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Local</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Voucher</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Status Gaia</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-500">Status</th>
                    <th className="px-3 py-2 text-center font-bold text-slate-500">Ação</th>
                  </tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {itensFiltrados.slice(0, 200).map(item => (
                      <tr key={item.id} className={`hover:bg-slate-50 ${item.status === "bipado" ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2 font-mono text-slate-600">{item.local_estoque || "—"}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.modelo}</td>
                        <td className="px-3 py-2"><span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{item.grade}</span></td>
                        <td className="px-3 py-2 font-mono text-slate-600">{item.voucher || "—"}</td>
                        <td className="px-3 py-2"><GaiaBadge status={item.status_gaia} /></td>
                        <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-2 text-center">
                          {item.status === "pendente" && (
                            <button onClick={() => setModalNaoLoc(item)} className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition whitespace-nowrap">Não localizado</button>
                          )}
                          {item.status === "nao_localizado" && (
                            <button onClick={() => setModalReverter(item)} className="text-xs font-semibold px-2 py-1 rounded-lg bg-purple-50 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-100 transition flex items-center gap-1 mx-auto">
                              <RotateCcw className="h-3 w-3" /> Reverter
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {itensFiltrados.length > 200 && <p className="text-xs text-center text-slate-400 mt-2">Mostrando 200 de {fmtN(itensFiltrados.length)} itens.</p>}
              {itensFiltrados.length === 0 && <p className="text-center text-slate-400 text-sm py-8">Nenhum item encontrado.</p>}
            </>
          )}
        </Card>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// ABA EMBALAGEM
// ══════════════════════════════════════════════════════════
function TabEmbalagem({ pedidosIniciais, onAtualizarSilencioso }) {
  const { user }                    = useAuth();
  const [pedidos, setPedidos]       = useState(pedidosIniciais);
  const [pedidoSel, setPedido]      = useState(null);
  const [caixaAtiva, setCaixaAtiva] = useState(null);
  const [caixas, setCaixas]         = useState([]);
  const [itensCaixa, setItensCaixa] = useState([]);
  const [imeiInput, setImei]        = useState("");
  const [feedback, setFeedback]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [gerando, setGerando]       = useState(null);
  const [gerandoRomaneio, setGerandoRomaneio] = useState(false);
  const [caixaDetalhes, setCaixaDetalhes]     = useState(null);
  const [itensCaixaDet, setItensCaixaDet]     = useState([]);
  const inputRef                    = useRef(null);
  const CAPACIDADE                  = 30;

  useEffect(() => {
    if (pedidosIniciais.length > 0 && pedidos.length === 0) {
      setPedidos(pedidosIniciais);
    }
  }, [pedidosIniciais]);

  async function atualizarPedidos() {
    const data = await listarPedidosB2B();
    setPedidos(data);
    if (pedidoSel) {
      const atualizado = data.find(p => p.id === pedidoSel.id);
      if (atualizado) setPedido(atualizado);
    }
    onAtualizarSilencioso?.(data);
  }

  useEffect(() => { if (pedidoSel) carregarCaixas(); }, [pedidoSel]);
  useEffect(() => { if (caixaAtiva) { carregarItensCaixa(); setTimeout(() => inputRef.current?.focus(), 100); } }, [caixaAtiva]);

  async function carregarCaixas() {
    setLoading(true);
    const data = await listarCaixas(pedidoSel.id);
    setCaixas(data);
    const aberta = data.find(c => c.status === "aberta");
    if (aberta) setCaixaAtiva(aberta);
    setLoading(false);
  }

  async function carregarItensCaixa() {
    if (!caixaAtiva) return;
    setItensCaixa(await listarItensCaixa(caixaAtiva.id));
  }

  async function handleNovaCaixa() {
    setLoading(true);
    try { const nova = await criarCaixa(pedidoSel.id, user.id); setCaixaAtiva(nova); setCaixas(prev => [...prev, nova]); setItensCaixa([]); }
    catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setLoading(false); }
  }

  async function handleFecharCaixa() {
    if (!caixaAtiva) return;
    setLoading(true);
    try {
      await fecharCaixa(caixaAtiva.id, user.id);
      setCaixas(prev => prev.map(c => c.id === caixaAtiva.id ? { ...c, status: "fechada", fechado_em: new Date().toISOString() } : c));
      setCaixaAtiva(null); setItensCaixa([]);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setLoading(false); }
  }

  async function handleBipar(e) {
    e.preventDefault();
    if (!imeiInput.trim() || !caixaAtiva || !pedidoSel) return;
    const res = await embalarImei(imeiInput.trim(), pedidoSel.id, caixaAtiva.id, user.id);
    setImei("");
    if (res.ok) {
      setItensCaixa(prev => [...prev, { ...res.item, caixa_id: caixaAtiva.id, embalado_em: new Date().toISOString() }]);
      setCaixaAtiva(prev => ({ ...prev, total_itens: res.totalCaixa }));
      setCaixas(prev => prev.map(c => c.id === caixaAtiva.id ? { ...c, total_itens: res.totalCaixa } : c));
      if (res.caixaFechou) {
        setFeedback({ tipo: "fechou", msg: `✓ Caixa ${caixaAtiva.numero} completa! Fechada automaticamente.` });
        setCaixaAtiva(prev => ({ ...prev, status: "fechada" }));
        setCaixas(prev => prev.map(c => c.id === caixaAtiva.id ? { ...c, status: "fechada", total_itens: CAPACIDADE } : c));
      } else {
        setFeedback({ tipo: "ok", msg: `✓ ${imeiInput.trim()} embalado — Caixa ${caixaAtiva.numero}: ${res.totalCaixa}/${CAPACIDADE}` });
      }
    } else { setFeedback({ tipo: "erro", msg: res.erro }); }
    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  async function handleRomaneio(caixa) {
    setGerando(caixa.id + "_rom");
    try { await gerarRomaneio(caixa.id, pedidoSel); } catch (e) { alert("Erro: " + e.message); } finally { setGerando(null); }
  }

  async function handleEtiqueta(caixa) {
    setGerando(caixa.id + "_etq");
    try { await gerarEtiqueta(caixa.id, pedidoSel, caixas.length); } catch (e) { alert("Erro: " + e.message); } finally { setGerando(null); }
  }

  async function handleRomaneioPedido() {
    setGerandoRomaneio(true);
    try { await gerarRomaneioPedido(pedidoSel); } catch (e) { alert("Erro: " + e.message); } finally { setGerandoRomaneio(false); }
  }

  async function verDetalhesCaixa(caixa) {
    if (caixaDetalhes?.id === caixa.id) { setCaixaDetalhes(null); return; }
    setCaixaDetalhes(caixa);
    setItensCaixaDet(await listarItensCaixa(caixa.id));
  }

  const totalEmbalados = caixas.reduce((s, c) => s + (c.total_itens || 0), 0);
  const totalBipados   = pedidoSel?.total_bipados || 0;

  if (!pedidoSel) {
    const pedidosDisponiveis = pedidos.filter(p => p.total_bipados > 0);
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Selecione um pedido para iniciar a embalagem:</p>
          <button onClick={atualizarPedidos} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
        </div>
        {pedidosDisponiveis.length === 0 ? (
          <div className="text-center py-12 text-slate-400"><Box className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum pedido com itens bipados ainda.</p></div>
        ) : (
          <div className="grid gap-3">
            {pedidosDisponiveis.map(p => (
              <button key={p.id} onClick={() => setPedido(p)} className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 text-left hover:ring-purple-300 hover:bg-purple-50 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div><div className="font-bold text-slate-800 text-sm">{p.lote}</div><div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div></div>
                  <StatusBadge status={p.status} />
                </div>
                <ProgressBar value={p.total_bipados || 0} total={p.total_itens || 0} />
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setPedido(null); setCaixaAtiva(null); setCaixas([]); setItensCaixa([]); }} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><X className="h-3 w-3" /> Trocar pedido</button>
        <div className="flex-1"><h3 className="font-black text-slate-800 text-sm">{pedidoSel.lote}</h3><p className="text-xs text-slate-500">{pedidoSel.cliente}</p></div>
        <button onClick={handleRomaneioPedido} disabled={gerandoRomaneio || caixas.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-100 transition disabled:opacity-40">
          {gerandoRomaneio ? <div className="h-3 w-3 border-2 border-purple-300 border-t-purple-700 rounded-full animate-spin" /> : <FileText className="h-3 w-3" />}
          Romaneio do Pedido
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Bipados (disponíveis)" value={fmtN(totalBipados)} color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Embalados" value={fmtN(totalEmbalados)} sub={`${Math.round((totalEmbalados / (totalBipados || 1)) * 100)}%`} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="A embalar" value={fmtN(totalBipados - totalEmbalados)} color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Caixas" value={fmtN(caixas.length)} sub={`${caixas.filter(c => c.status === "fechada").length} fechadas`} color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <Card><p className="text-xs font-semibold text-slate-500 mb-2">Progresso da embalagem</p><ProgressBar value={totalEmbalados} total={totalBipados} color="#F97316" /></Card>

      {caixaAtiva && caixaAtiva.status === "aberta" ? (
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><Box className="h-4 w-4 text-[#7F2D92]" /> Caixa {caixaAtiva.numero} — Em uso</h3>
              <p className="text-xs text-slate-500 mt-0.5">{caixaAtiva.total_itens || 0}/{CAPACIDADE} unidades</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right"><div className="text-2xl font-black text-[#7F2D92]">{caixaAtiva.total_itens || 0}/{CAPACIDADE}</div><div className="text-xs text-slate-400">unidades</div></div>
              <button onClick={handleFecharCaixa} disabled={loading || !caixaAtiva.total_itens}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 transition disabled:opacity-40">
                <Lock className="h-3 w-3" /> Fechar caixa
              </button>
            </div>
          </div>
          <div className="mb-4">
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300" style={{ width: `${Math.round(((caixaAtiva.total_itens || 0) / CAPACIDADE) * 100)}%`, background: (caixaAtiva.total_itens || 0) >= CAPACIDADE ? "#1D9E75" : "#7F2D92" }} />
            </div>
          </div>
          <form onSubmit={handleBipar} className="flex gap-3">
            <input ref={inputRef} type="text" value={imeiInput} onChange={e => setImei(e.target.value)}
              placeholder="Bipe o IMEI para embalar..."
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              autoComplete="off" />
            <button type="submit" disabled={!imeiInput.trim()}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <CheckCircle className="h-4 w-4" /> Confirmar
            </button>
          </form>
          {feedback && (
            <div className={`mt-3 flex items-start gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${feedback.tipo === "ok" || feedback.tipo === "fechou" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
              {feedback.tipo !== "erro" ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
              <p className="font-semibold">{feedback.msg}</p>
            </div>
          )}
          {itensCaixa.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="text-xs font-bold text-slate-500 mb-2">Itens nesta caixa ({itensCaixa.length})</p>
              <table className="min-w-full text-xs">
                <thead><tr className="bg-slate-50">
                  <th className="px-3 py-2 text-left font-bold text-slate-500">#</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">SKU</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {itensCaixa.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 font-semibold">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.modelo}</td>
                      <td className="px-3 py-2"><span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{item.grade}</span></td>
                      <td className="px-3 py-2 text-slate-500 font-mono">{item.cod_item || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold text-slate-700 text-sm">Nenhuma caixa aberta</p>
              <p className="text-xs text-slate-400 mt-0.5">{caixas.filter(c => c.status === "fechada").length > 0 ? "Todas as caixas foram fechadas. Abra uma nova para continuar." : "Abra a primeira caixa para iniciar a embalagem."}</p>
            </div>
            <button onClick={handleNovaCaixa} disabled={loading}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <Plus className="h-4 w-4" /> {loading ? "Criando..." : "Nova caixa"}
            </button>
          </div>
        </Card>
      )}

      {caixas.length > 0 && (
        <Card>
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4"><Box className="h-4 w-4 text-[#7F2D92]" /> Todas as caixas ({caixas.length})</h3>
          <div className="space-y-3">
            {caixas.map(caixa => (
              <div key={caixa.id}>
                <div className={`flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ${caixa.status === "aberta" ? "bg-purple-50 ring-purple-200" : "bg-slate-50 ring-slate-200"}`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${caixa.status === "aberta" ? "bg-[#7F2D92] text-white" : "bg-slate-300 text-white"}`}>{caixa.numero}</div>
                    <div><div className="text-sm font-bold text-slate-800">Caixa {caixa.numero}</div><div className="text-xs text-slate-500">{caixa.total_itens || 0}/{CAPACIDADE} unidades</div></div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <StatusBadge status={caixa.status} />
                    <button onClick={() => verDetalhesCaixa(caixa)} className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 transition">{caixaDetalhes?.id === caixa.id ? "Ocultar" : "Ver itens"}</button>
                    <button onClick={() => handleRomaneio(caixa)} disabled={gerando === caixa.id + "_rom" || !caixa.total_itens}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-100 transition disabled:opacity-40">
                      {gerando === caixa.id + "_rom" ? <div className="h-3 w-3 border-2 border-purple-300 border-t-purple-700 rounded-full animate-spin" /> : <FileText className="h-3 w-3" />} Romaneio
                    </button>
                    <button onClick={() => handleEtiqueta(caixa)} disabled={gerando === caixa.id + "_etq" || !caixa.total_itens}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-200 hover:bg-orange-100 transition disabled:opacity-40">
                      {gerando === caixa.id + "_etq" ? <div className="h-3 w-3 border-2 border-orange-300 border-t-orange-700 rounded-full animate-spin" /> : <Tag className="h-3 w-3" />} Etiqueta
                    </button>
                  </div>
                </div>
                {caixaDetalhes?.id === caixa.id && (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead><tr className="bg-slate-50">
                        <th className="px-3 py-2 text-left font-bold text-slate-500">#</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                        <th className="px-3 py-2 text-left font-bold text-slate-500">SKU</th>
                        <th className="px-3 py-2 text-right font-bold text-slate-500">Valor</th>
                      </tr></thead>
                      <tbody className="divide-y divide-slate-100">
                        {itensCaixaDet.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                            <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.modelo}</td>
                            <td className="px-3 py-2"><span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{item.grade}</span></td>
                            <td className="px-3 py-2 text-slate-500 font-mono">{item.cod_item || "—"}</td>
                            <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtR(item.valor)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA FATURAMENTO
// ══════════════════════════════════════════════════════════
function TabPedidos({ pedidosIniciais, onAtualizarSilencioso }) {
  const { user, profile }               = useAuth();
  const [pedidos, setPedidos]           = useState(pedidosIniciais);
  const [exportando, setExportando]     = useState(null);
  const [importandoNF, setImportandoNF] = useState(null);
  const [feedbackExp, setFeedbackExp]   = useState({});
  const [resumos, setResumos]           = useState({});
  const [nfs, setNfs]                   = useState({});
  const [painelAberto, setPainelAberto] = useState({});
  const [loadingResumo, setLoadingResumo] = useState({});
  const inputNFRefs = useRef({});

  useEffect(() => {
    if (pedidosIniciais.length > 0 && pedidos.length === 0) {
      setPedidos(pedidosIniciais);
    }
  }, [pedidosIniciais]);

  async function atualizarPedidos() {
    const data = await listarPedidosB2B();
    setPedidos(data);
    onAtualizarSilencioso?.(data);
  }

  useEffect(() => { pedidos.forEach(p => carregarResumo(p.id)); }, [pedidos]);

  async function carregarResumo(pedidoId) {
    if (resumos[pedidoId]) return;
    setLoadingResumo(prev => ({ ...prev, [pedidoId]: true }));
    const [resumo, nfsPedido] = await Promise.all([buscarResumoValorPedido(pedidoId), listarNFsPedido(pedidoId)]);
    setResumos(prev => ({ ...prev, [pedidoId]: resumo }));
    setNfs(prev => ({ ...prev, [pedidoId]: nfsPedido }));
    setLoadingResumo(prev => ({ ...prev, [pedidoId]: false }));
  }

  async function handleExportar(pedido) {
    setExportando(pedido.id);
    setFeedbackExp(prev => ({ ...prev, [pedido.id]: null }));
    try {
      const nomeUsuario = profile?.nome || user?.email || "Usuário";
      const res = await exportarFaturamento(pedido.id, user.id, nomeUsuario);
      if (res.bloqueado) {
        setFeedbackExp(prev => ({ ...prev, [pedido.id]: { tipo: "bloqueado", msg: res.msg } }));
      } else {
        setFeedbackExp(prev => ({ ...prev, [pedido.id]: { tipo: "ok", msg: `✓ Exportação v${res.numeroExportacao} — ${fmtN(res.total)} itens — ${res.nomeArquivo}` } }));
        setResumos(prev => ({ ...prev, [pedido.id]: null }));
        carregarResumo(pedido.id);
        atualizarPedidos();
      }
    } catch (e) {
      setFeedbackExp(prev => ({ ...prev, [pedido.id]: { tipo: "erro", msg: e.message } }));
    } finally { setExportando(null); }
  }

  async function handleImportarNF(pedido, file) {
    if (!file) return;
    setImportandoNF(pedido.id);
    setFeedbackExp(prev => ({ ...prev, [pedido.id]: null }));
    try {
      const res = await importarNFPlanilha(file, pedido.id, user.id);
      setFeedbackExp(prev => ({
        ...prev,
        [pedido.id]: {
          tipo: "ok",
          msg: `✓ ${res.totalNFs} NF${res.totalNFs > 1 ? "s" : ""} importada${res.totalNFs > 1 ? "s" : ""} (${res.nfs.join(", ")}) — ${fmtN(res.totalItens)} itens`,
        },
      }));
      setResumos(prev => ({ ...prev, [pedido.id]: null }));
      setNfs(prev => ({ ...prev, [pedido.id]: null }));
      carregarResumo(pedido.id);
      atualizarPedidos();
    } catch (e) {
      setFeedbackExp(prev => ({ ...prev, [pedido.id]: { tipo: "erro", msg: e.message } }));
    } finally {
      setImportandoNF(null);
      if (inputNFRefs.current[pedido.id]) inputNFRefs.current[pedido.id].value = "";
    }
  }

  const pedidosAbertos = pedidos.filter(p => p.status !== "concluido");
  const totalValorGlobal    = Object.values(resumos).reduce((s, r) => s + (r?.totalValor || 0), 0);
  const totalFaturadoGlobal = Object.values(resumos).reduce((s, r) => s + (r?.valorFaturado || 0), 0);
  const totalAguardando     = totalValorGlobal - totalFaturadoGlobal;
  const pctFaturado         = totalValorGlobal > 0 ? Math.round((totalFaturadoGlobal / totalValorGlobal) * 100) : 0;

  function getStatusFat(p, resumo, nfsPedido) {
    if (nfsPedido?.length > 0) return "faturado";
    const bipados = p.total_bipados || 0, total = p.total_itens || 0;
    if (bipados >= total && total > 0) return "em_faturamento";
    if (bipados > 0) return "em_separacao";
    return "ag_separacao";
  }

  const STATUS_FAT = {
    faturado:       { label: "Faturado",       cls: "bg-emerald-100 text-emerald-700 ring-emerald-200" },
    em_faturamento: { label: "Em Faturamento", cls: "bg-purple-100 text-purple-700 ring-purple-200"   },
    em_separacao:   { label: "Em Separação",   cls: "bg-yellow-100 text-yellow-700 ring-yellow-200"   },
    ag_separacao:   { label: "Ag. Separação",  cls: "bg-slate-100 text-slate-600 ring-slate-200"      },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-slate-800 flex items-center gap-2 text-sm"><BarChart3 className="h-4 w-4 text-[#7F2D92]" /> Faturamento B2B</h3>
        <button onClick={atualizarPedidos} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <KpiMini label="Aguardando faturamento" value={fmtR(totalAguardando)} sub={`${fmtN(pedidosAbertos.length)} pedidos`} color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Faturado" value={fmtR(totalFaturadoGlobal)} sub={`${fmtN(Object.values(resumos).reduce((s, r) => s + (r?.qtdFaturada || 0), 0))} itens`} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="% Faturado" value={`${pctFaturado}%`} sub="do valor total" color="bg-purple-50 ring-purple-200 text-purple-700" />
      </div>

      {pedidosAbertos.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><Package className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum pedido em aberto.</p></div>
      ) : (
        <div className="space-y-3">
          {pedidosAbertos.map(p => {
            const resumo    = resumos[p.id];
            const nfsPedido = nfs[p.id] || [];
            const isLoading = loadingResumo[p.id];
            const fb        = feedbackExp[p.id];
            const statusFat = getStatusFat(p, resumo, nfsPedido);
            const cfgStatus = STATUS_FAT[statusFat];
            const valorFaturado   = resumo?.valorFaturado || 0;
            const valorAguardando = (resumo?.totalValor || 0) - valorFaturado;
            const qtdFaturada     = resumo?.qtdFaturada || 0;
            const qtdAguardando   = (p.total_bipados || 0) - qtdFaturada;
            const borderColor     = statusFat === "faturado" ? "ring-emerald-200" : statusFat === "em_faturamento" ? "ring-purple-200" : statusFat === "em_separacao" ? "ring-yellow-200" : "ring-slate-200";

            return (
              <Card key={p.id} className={`ring-1 ${borderColor}`}>
                <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-slate-800 text-sm truncate">{p.lote}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                    <div className="text-xs text-slate-400 mt-0.5">{p.total_itens} produtos · Importado em {new Date(p.criado_em).toLocaleDateString("pt-BR")}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${cfgStatus.cls}`}>{cfgStatus.label}</span>
                    {resumo && <span className="text-sm font-black text-slate-800">{fmtR(resumo.totalValor)}</span>}
                  </div>
                </div>
                <div className="mb-4">
                  <p className="text-xs font-semibold text-slate-400 mb-1">Separação</p>
                  <ProgressBar value={p.total_bipados || 0} total={p.total_itens || 0} />
                </div>
                {isLoading ? (
                  <div className="flex items-center justify-center h-12"><div className="h-4 w-4 border-2 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" /></div>
                ) : resumo ? (
                  <div className="grid grid-cols-2 gap-3 mb-4">
                    <div className="bg-emerald-50 ring-1 ring-emerald-100 rounded-xl p-3">
                      <p className="text-xs text-emerald-600 font-semibold mb-1">✓ Faturado</p>
                      <p className="text-sm font-black text-emerald-700">{fmtR(valorFaturado)}</p>
                      <p className="text-xs text-emerald-500 mt-0.5">{fmtN(qtdFaturada)} itens</p>
                    </div>
                    <div className="bg-orange-50 ring-1 ring-orange-100 rounded-xl p-3">
                      <p className="text-xs text-orange-600 font-semibold mb-1">⏳ Aguardando</p>
                      <p className="text-sm font-black text-orange-700">{fmtR(valorAguardando)}</p>
                      <p className="text-xs text-orange-500 mt-0.5">{fmtN(qtdAguardando)} itens</p>
                    </div>
                  </div>
                ) : null}
                {nfsPedido.length > 0 && (
                  <div className="mb-4">
                    <button onClick={() => setPainelAberto(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                      className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-purple-700 transition mb-2">
                      <FileText className="h-3 w-3" /> Notas Fiscais ({nfsPedido.length})
                      {painelAberto[p.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                    {painelAberto[p.id] && (
                      <div className="space-y-2 bg-slate-50 rounded-xl p-3">
                        {nfsPedido.map(nf => (
                          <div key={nf.id} className="flex items-center justify-between text-xs bg-white rounded-xl px-3 py-2 ring-1 ring-slate-200">
                            <div className="flex items-center gap-2">
                              <FileText className="h-3.5 w-3.5 text-purple-500" />
                              <span className="font-bold text-slate-700">NF {nf.numero_nf}</span>
                              <span className="text-slate-400">· {fmtN(nf.total_itens)} itens</span>
                              {nf.valor_total > 0 && <span className="font-semibold text-emerald-600">· {fmtR(nf.valor_total)}</span>}
                              {nf.data_faturamento && <span className="text-slate-400">· {new Date(nf.data_faturamento).toLocaleDateString("pt-BR")}</span>}
                            </div>
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 flex items-center gap-1">
                              <CheckCircle className="h-3 w-3" /> Importada
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => handleExportar(p)} disabled={exportando === p.id || !p.total_bipados}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition disabled:opacity-40">
                    {exportando === p.id ? <div className="h-3 w-3 border-2 border-emerald-300 border-t-emerald-700 rounded-full animate-spin" /> : <Download className="h-3 w-3" />}
                    Exportar faturamento
                  </button>
                  <label className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ring-1 transition cursor-pointer ${importandoNF === p.id ? "bg-blue-50 text-blue-400 ring-blue-200 opacity-60" : "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100"}`}>
                    {importandoNF === p.id ? <div className="h-3 w-3 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" /> : <Upload className="h-3 w-3" />}
                    Importar NF
                    <input type="file" accept=".xlsx,.xls" className="hidden"
                      ref={el => inputNFRefs.current[p.id] = el}
                      disabled={importandoNF === p.id}
                      onChange={e => handleImportarNF(p, e.target.files?.[0])} />
                  </label>
                </div>
                {fb && (
                  <div className={`mt-3 flex items-start gap-2 text-xs rounded-xl px-4 py-3 ring-1 ${fb.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : fb.tipo === "bloqueado" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
                    {fb.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
                    <p className="font-semibold leading-relaxed">{fb.msg}</p>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA CONCLUÍDOS
// ══════════════════════════════════════════════════════════
function TabConcluidos({ onVoltar }) {
  const [pedidos, setPedidos]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [filtroAno, setFiltroAno]       = useState("todos");
  const [filtroMes, setFiltroMes]       = useState("todos");
  const [painelAberto, setPainelAberto] = useState({});

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const data = await listarPedidosConcluidos();
    setPedidos(data);
    setLoading(false);
  }

  const anos = [...new Set(pedidos.map(p => p.anoPedido))].sort((a, b) => b - a);

  const pedidosFiltrados = pedidos.filter(p => {
    const matchAno = filtroAno === "todos" || p.anoPedido === Number(filtroAno);
    const matchMes = filtroMes === "todos" || p.mesPedido === Number(filtroMes);
    return matchAno && matchMes;
  });

  const totalValorFat   = pedidosFiltrados.reduce((s, p) => s + (p.valorFat || 0), 0);
  const totalQtd        = pedidosFiltrados.reduce((s, p) => s + (p.total_itens || 0), 0);
  const temposMedios    = pedidosFiltrados.filter(p => p.tempoMedio != null);
  const tempoMedioGeral = temposMedios.length > 0
    ? Math.round(temposMedios.reduce((s, p) => s + p.tempoMedio, 0) / temposMedios.length)
    : null;

  const porMes = {};
  pedidosFiltrados.forEach(p => {
    const key = `${p.anoPedido}-${String(p.mesPedido).padStart(2, "0")}`;
    if (!porMes[key]) porMes[key] = { ano: p.anoPedido, mes: p.mesPedido, qtdPedidos: 0, valorFat: 0, totalItens: 0 };
    porMes[key].qtdPedidos++;
    porMes[key].valorFat   += p.valorFat || 0;
    porMes[key].totalItens += p.total_itens || 0;
  });
  const resumoMeses = Object.values(porMes).sort((a, b) => b.ano - a.ano || b.mes - a.mes);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onVoltar} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"><X className="h-3 w-3" /> Voltar</button>
        <h3 className="font-black text-slate-800 flex items-center gap-2 text-sm flex-1"><TrendingUp className="h-4 w-4 text-emerald-600" /> Pedidos Faturados</h3>
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <KpiMini label="Total faturado" value={fmtR(totalValorFat)} sub={`${pedidosFiltrados.length} pedidos`} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Produtos faturados" value={fmtN(totalQtd)} sub="unidades" color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Tempo médio" value={tempoMedioGeral != null ? `${tempoMedioGeral}d` : "—"} sub="do pedido ao faturamento" color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar className="h-4 w-4 text-slate-400" />
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroAno("todos")} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtroAno === "todos" ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Todos os anos</button>
            {anos.map(a => (
              <button key={a} onClick={() => setFiltroAno(String(a))} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtroAno === String(a) ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{a}</button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setFiltroMes("todos")} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtroMes === "todos" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Todos os meses</button>
            {[...new Set(pedidos.map(p => p.mesPedido))].sort((a, b) => a - b).map(m => (
              <button key={m} onClick={() => setFiltroMes(String(m))} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtroMes === String(m) ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{MESES[m - 1]}</button>
            ))}
          </div>
        </div>
      </Card>

      {resumoMeses.length > 0 && (
        <Card>
          <h4 className="font-black text-slate-700 text-xs mb-3 flex items-center gap-2"><Calendar className="h-3.5 w-3.5 text-purple-500" /> Resumo por período</h4>
          <div className="space-y-2">
            {resumoMeses.map(m => (
              <div key={`${m.ano}-${m.mes}`} className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="font-black text-slate-700 w-12">{MESES[m.mes - 1]}/{m.ano}</span>
                  <span className="text-slate-500">{m.qtdPedidos} pedido{m.qtdPedidos > 1 ? "s" : ""}</span>
                  <span className="text-slate-500">{fmtN(m.totalItens)} itens</span>
                </div>
                <span className="font-black text-emerald-700">{fmtR(m.valorFat)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32"><div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" /></div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-slate-400"><CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum pedido faturado encontrado.</p></div>
      ) : (
        <div className="space-y-3">
          {pedidosFiltrados.map(p => (
            <Card key={p.id} className="ring-1 ring-emerald-200">
              <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-slate-800 text-sm truncate">{p.lote}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {p.total_itens} produtos · {MESES[p.mesPedido - 1]}/{p.anoPedido}
                    {p.tempoMedio != null && <span className="ml-2 text-blue-500 font-semibold">· {p.tempoMedio}d até faturar</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 bg-emerald-100 text-emerald-700 ring-emerald-200 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Faturado
                  </span>
                  <span className="text-sm font-black text-emerald-700">{fmtR(p.valorFat)}</span>
                </div>
              </div>
              {p.nfs?.length > 0 && (
                <div>
                  <button onClick={() => setPainelAberto(prev => ({ ...prev, [p.id]: !prev[p.id] }))}
                    className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-purple-700 transition mb-2">
                    <FileText className="h-3 w-3" /> Notas Fiscais ({p.nfs.length})
                    {painelAberto[p.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </button>
                  {painelAberto[p.id] && (
                    <div className="space-y-2 bg-slate-50 rounded-xl p-3">
                      {p.nfs.map(nf => (
                        <div key={nf.id} className="flex items-center justify-between text-xs bg-white rounded-xl px-3 py-2 ring-1 ring-slate-200">
                          <div className="flex items-center gap-2">
                            <FileText className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="font-bold text-slate-700">NF {nf.numero_nf}</span>
                            <span className="text-slate-400">· {fmtN(nf.total_itens)} itens</span>
                            {nf.valor_total > 0 && <span className="font-semibold text-emerald-600">· {fmtR(nf.valor_total)}</span>}
                          </div>
                          {nf.data_faturamento && <span className="text-slate-400">{new Date(nf.data_faturamento).toLocaleDateString("pt-BR")}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function B2BPickingPage() {
  const [aba, setAba]                       = useState("picking");
  const [pedidos, setPedidos]               = useState([]);
  const [verConcluidos, setVerConcluidos]   = useState(false);
  const [loadingPedidos, setLoadingPedidos] = useState(true);

  useEffect(() => { carregarPedidos(); }, []);

  async function carregarPedidos() {
    setLoadingPedidos(true);
    const data = await listarPedidosB2B();
    setPedidos(data);
    setLoadingPedidos(false);
  }

  function atualizarSilencioso(data) {
    setPedidos(data);
  }

  const ABAS = [
    { key: "picking",   label: "Picking",     icon: Search    },
    { key: "embalagem", label: "Embalagem",   icon: Box       },
    { key: "pedidos",   label: "Faturamento", icon: BarChart3 },
  ];

  const contadores = {
    picking: {
      aberto:         pedidos.filter(p => p.status === "aberto").length,
      concluido:      pedidos.filter(p => p.status === "concluido").length,
      labelAberto:    "em aberto",
      labelConcluido: "concluído",
      aoConcluido:    () => setVerConcluidos(false),
    },
    embalagem: {
      aberto:         pedidos.filter(p => (p.total_bipados || 0) > 0 && p.status !== "concluido").length,
      concluido:      pedidos.filter(p => p.status === "concluido").length,
      labelAberto:    "para embalar",
      labelConcluido: "embalado",
      aoConcluido:    () => setVerConcluidos(false),
    },
    pedidos: {
      aberto:         pedidos.filter(p => p.status !== "concluido").length,
      concluido:      pedidos.filter(p => p.status === "concluido").length,
      labelAberto:    "aguardando faturamento",
      labelConcluido: "faturado",
      aoConcluido:    () => { setAba("pedidos"); setVerConcluidos(true); },
    },
  };

  const ctx = contadores[aba];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Picking B2B</h2>
            <p className="text-xs text-slate-500">Separação, embalagem e faturamento · Assurant Warehouse</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {ctx.aberto > 0 && (
            <button onClick={() => setVerConcluidos(false)}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-200 hover:bg-orange-100 transition">
              {ctx.aberto} {ctx.labelAberto}
            </button>
          )}
          {ctx.concluido > 0 && (
            <button onClick={ctx.aoConcluido}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition">
              {ctx.concluido} {ctx.labelConcluido}{ctx.concluido > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={() => { setAba(a.key); setVerConcluidos(false); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${aba === a.key ? "bg-[#7F2D92] text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}>
              <Icon className="h-4 w-4 shrink-0" />
              {a.label}
            </button>
          );
        })}
      </div>

      <div className="bg-blue-50 ring-1 ring-blue-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-xs text-blue-700">
        <span>ℹ</span>
        <span>Para importar um novo pedido B2B, acesse <strong>Uploads → Pedido B2B — Picking</strong>.</span>
      </div>

      {/* Aguarda carregar antes de renderizar as abas */}
      {loadingPedidos ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {aba === "picking"   && <TabPicking   pedidosIniciais={pedidos} onAtualizarSilencioso={atualizarSilencioso} />}
          {aba === "embalagem" && <TabEmbalagem pedidosIniciais={pedidos} onAtualizarSilencioso={atualizarSilencioso} />}
          {aba === "pedidos"   && !verConcluidos && <TabPedidos pedidosIniciais={pedidos} onAtualizarSilencioso={atualizarSilencioso} />}
          {aba === "pedidos"   && verConcluidos  && <TabConcluidos onVoltar={() => setVerConcluidos(false)} />}
        </>
      )}
    </div>
  );
}