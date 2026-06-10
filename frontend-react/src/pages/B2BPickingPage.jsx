import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, Download,
  Package, X, BarChart3, Clock, Box, FileText,
  Tag, Plus, Lock, MapPin, RotateCcw,
} from "lucide-react";
import {
  listarPedidosB2B, listarItens,
  registrarBipagem, exportarFaturamento,
  listarExportacoes, marcarNaoLocalizado,
  reverterNaoLocalizado,
} from "../services/b2bService.js";
import {
  buscarCaixaAberta, criarCaixa, listarCaixas,
  listarItensCaixa, embalarImei, fecharCaixa,
  gerarRomaneio, gerarEtiqueta, gerarRomaneioPedido,
} from "../services/b2bEmbalagemService.js";
import { useAuth } from "../AuthContext.jsx";

function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtR(v) { return v ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"; }

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>
      {children}
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
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ring-1 ${s.cls}`}>
      {s.label}
    </span>
  );
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

// ── Modal confirmação Não Localizado ──────────────────────
function ModalNaoLocalizado({ item, onConfirmar, onCancelar }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
            <MapPin className="h-5 w-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">Não Localizado</h2>
            <p className="text-xs text-slate-500">Confirme que o aparelho não foi encontrado</p>
          </div>
        </div>

        <div className="bg-amber-50 ring-1 ring-amber-200 rounded-2xl p-4 mb-6 space-y-1">
          <p className="text-xs font-bold text-amber-700">Aparelho</p>
          <p className="text-sm font-semibold text-slate-800">{item.modelo}</p>
          <p className="text-xs text-slate-500 font-mono">{item.imei}</p>
          <p className="text-xs text-slate-500">Local: <span className="font-semibold font-mono">{item.local_estoque || "—"}</span></p>
        </div>

        <p className="text-sm text-slate-600 mb-6">
          O aparelho será marcado como <span className="font-bold text-amber-700">Não Localizado</span> e removido da lista de pendentes. O responsável será notificado para análise.
        </p>

        <div className="flex gap-3">
          <button onClick={onConfirmar}
            className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 transition">
            Confirmar — Não Localizado
          </button>
          <button onClick={onCancelar}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modal reverter Não Localizado ─────────────────────────
function ModalReverter({ item, onConfirmar, onCancelar }) {
  const [rua,   setRua]   = useState("");
  const [bloco, setBloco] = useState("");
  const [andar, setAndar] = useState("");
  const [ap,    setAp]    = useState("");
  const [erro,  setErro]  = useState("");

  function handleConfirmar() {
    if (!rua.trim() || !bloco.trim() || !andar.trim() || !ap.trim()) {
      setErro("Preencha todos os campos de localização.");
      return;
    }
    const novoLocal = `RUA ${rua.trim()}/BL${bloco.trim()}/AD${andar.trim()}/${ap.trim().toUpperCase()}`;
    onConfirmar(novoLocal);
  }

  const inputCls = "w-full rounded-xl border border-[#E9D5FF] px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white uppercase";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-10 w-10 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0">
            <RotateCcw className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-800">Reverter para Pendente</h2>
            <p className="text-xs text-slate-500">Informe a nova localização do aparelho</p>
          </div>
        </div>

        <div className="bg-slate-50 ring-1 ring-slate-200 rounded-2xl p-4 mb-5 space-y-1">
          <p className="text-xs font-bold text-slate-500">Aparelho</p>
          <p className="text-sm font-semibold text-slate-800">{item.modelo}</p>
          <p className="text-xs text-slate-500 font-mono">{item.imei}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Rua *</label>
            <input value={rua} onChange={e => setRua(e.target.value)}
              className={inputCls} placeholder="Ex: 1" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Bloco *</label>
            <input value={bloco} onChange={e => setBloco(e.target.value)}
              className={inputCls} placeholder="Ex: 03" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Andar *</label>
            <input value={andar} onChange={e => setAndar(e.target.value)}
              className={inputCls} placeholder="Ex: 02" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">AP *</label>
            <input value={ap} onChange={e => setAp(e.target.value)}
              className={inputCls} placeholder="Ex: B03" />
          </div>
        </div>

        {(rua || bloco || andar || ap) && (
          <div className="bg-purple-50 ring-1 ring-purple-200 rounded-xl px-4 py-2 mb-4 text-xs font-mono text-purple-700 font-bold">
            Novo local: RUA {rua || "?"}/BL{bloco || "?"}/AD{andar || "?"}/{ap?.toUpperCase() || "?"}
          </div>
        )}

        {erro && (
          <div className="bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2 mb-4 text-xs font-semibold text-red-600">
            {erro}
          </div>
        )}

        <div className="flex gap-3">
          <button onClick={handleConfirmar}
            className="flex-1 rounded-2xl bg-[#7F2D92] py-3 text-sm font-bold text-white hover:bg-[#5B1E74] transition">
            Confirmar nova localização
          </button>
          <button onClick={onCancelar}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA PICKING
// ══════════════════════════════════════════════════════════
function TabPicking({ pedidos, onAtualizar }) {
  const { user }                          = useAuth();
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

  useEffect(() => { if (pedidoSel) carregarItens(); }, [pedidoSel]);
  useEffect(() => { if (pedidoSel) inputRef.current?.focus(); }, [pedidoSel]);

  async function carregarItens() {
    setLoading(true);
    const data = await listarItens(pedidoSel.id);
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
      setItens(prev => prev.map(i =>
        i.imei === imeiInput.trim()
          ? { ...i, status: "bipado", bipado_em: new Date().toISOString() }
          : i
      ));
      setPedido(prev => ({ ...prev, total_bipados: (prev.total_bipados || 0) + 1 }));
      onAtualizar?.();
    } else {
      setFeedback({ tipo: "erro", msg: res.erro });
    }
    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  async function handleNaoLocalizado(item) {
    setModalNaoLoc(item);
  }

  async function confirmarNaoLocalizado() {
    if (!modalNaoLoc) return;
    try {
      await marcarNaoLocalizado(modalNaoLoc.id, user.id);
      setItens(prev => prev.map(i =>
        i.id === modalNaoLoc.id
          ? { ...i, status: "nao_localizado", nao_localizado_em: new Date().toISOString() }
          : i
      ));
      setFeedback({ tipo: "aviso", msg: `⚠ IMEI ${modalNaoLoc.imei} marcado como Não Localizado.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setModalNaoLoc(null);
      inputRef.current?.focus();
    }
  }

  async function confirmarReverter(novoLocal) {
    if (!modalReverter) return;
    try {
      await reverterNaoLocalizado(modalReverter.id, novoLocal);
      setItens(prev => prev.map(i =>
        i.id === modalReverter.id
          ? { ...i, status: "pendente", local_estoque: novoLocal, nao_localizado_em: null }
          : i
      ));
      setFeedback({ tipo: "ok", msg: `✓ IMEI ${modalReverter.imei} revertido para Pendente.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setModalReverter(null);
      inputRef.current?.focus();
    }
  }

  // Extrair ruas disponíveis
  const ruasDisponiveis = [...new Set(
    itens
      .filter(i => i.local_estoque)
      .map(i => {
        const match = i.local_estoque.match(/^RUA\s+(\d+)/i);
        return match ? `RUA ${match[1]}` : null;
      })
      .filter(Boolean)
  )].sort((a, b) => {
    const na = parseInt(a.replace("RUA ", ""));
    const nb = parseInt(b.replace("RUA ", ""));
    return na - nb;
  });

  function toggleRua(rua) {
    setRuasSel(prev =>
      prev.includes(rua) ? prev.filter(r => r !== rua) : [...prev, rua]
    );
  }

  const itensFiltrados = itens.filter(i => {
    const matchFiltro = filtro === "todos" || i.status === filtro;
    const matchBusca  = !busca ||
      i.imei.includes(busca) ||
      i.modelo?.toLowerCase().includes(busca.toLowerCase()) ||
      i.local_estoque?.toLowerCase().includes(busca.toLowerCase()) ||
      i.voucher?.toLowerCase().includes(busca.toLowerCase());
    const matchRua = ruasSel.length === 0 || ruasSel.some(r => {
      const num = r.replace("RUA ", "");
      return i.local_estoque?.match(new RegExp(`^RUA\\s+${num}\\b`, "i"));
    });
    return matchFiltro && matchBusca && matchRua;
  });

  const totalBipados     = itens.filter(i => i.status === "bipado").length;
  const totalPendente    = itens.filter(i => i.status === "pendente").length;
  const totalNaoLoc      = itens.filter(i => i.status === "nao_localizado").length;
  const valorTotal       = itens.filter(i => i.status === "bipado").reduce((s, i) => s + (i.valor || 0), 0);

  if (!pedidoSel) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Selecione um pedido:</p>
          <button onClick={onAtualizar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
        </div>
        {pedidos.filter(p => p.status === "aberto").length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido em aberto.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pedidos.filter(p => p.status === "aberto").map(p => (
              <button key={p.id} onClick={() => setPedido(p)}
                className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 text-left hover:ring-purple-300 hover:bg-purple-50 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{p.lote}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                  </div>
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
      {modalNaoLoc && (
        <ModalNaoLocalizado
          item={modalNaoLoc}
          onConfirmar={confirmarNaoLocalizado}
          onCancelar={() => { setModalNaoLoc(null); inputRef.current?.focus(); }}
        />
      )}
      {modalReverter && (
        <ModalReverter
          item={modalReverter}
          onConfirmar={confirmarReverter}
          onCancelar={() => { setModalReverter(null); inputRef.current?.focus(); }}
        />
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setPedido(null); setItens([]); setRuasSel([]); }}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <X className="h-3 w-3" /> Trocar pedido
          </button>
          <div className="flex-1">
            <h3 className="font-black text-slate-800 text-sm">{pedidoSel.lote}</h3>
            <p className="text-xs text-slate-500">{pedidoSel.cliente}</p>
          </div>
          <StatusBadge status={pedidoSel.status} />
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini label="Total" value={fmtN(pedidoSel.total_itens)} color="bg-purple-50 ring-purple-200 text-purple-700" />
          <KpiMini label="Bipados" value={fmtN(totalBipados)}
            sub={`${Math.round((totalBipados / (pedidoSel.total_itens || 1)) * 100)}%`}
            color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
          <KpiMini label="Pendentes" value={fmtN(totalPendente)} color="bg-orange-50 ring-orange-200 text-orange-700" />
          {totalNaoLoc > 0
            ? <KpiMini label="Não Localizados" value={fmtN(totalNaoLoc)} color="bg-amber-50 ring-amber-200 text-amber-700" />
            : <KpiMini label="Valor bipado" value={fmtR(valorTotal)} color="bg-blue-50 ring-blue-200 text-blue-700" />
          }
        </div>

        <Card><ProgressBar value={totalBipados} total={pedidoSel.total_itens || 0} /></Card>

        {/* Filtro de ruas */}
        {ruasDisponiveis.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Filtrar por rua:
              </span>
              <button
                onClick={() => setRuasSel([])}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  ruasSel.length === 0 ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                Todas
              </button>
              {ruasDisponiveis.map(rua => (
                <button key={rua} onClick={() => toggleRua(rua)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
                    ruasSel.includes(rua)
                      ? "bg-[#7F2D92] text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {rua}
                </button>
              ))}
              {ruasSel.length > 0 && (
                <span className="text-xs text-purple-600 font-semibold ml-1">
                  {itensFiltrados.filter(i => i.status === "pendente").length} pendentes nas ruas selecionadas
                </span>
              )}
            </div>
          </Card>
        )}

        {/* Input de bipagem */}
        <Card>
          <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4 text-sm">
            <Search className="h-4 w-4 text-[#7F2D92]" /> Bipar IMEI
          </h3>
          <form onSubmit={handleBipar} className="flex gap-3">
            <input ref={inputRef} type="text" value={imeiInput}
              onChange={e => setImei(e.target.value)}
              placeholder="Bipe ou digite o IMEI..."
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              autoComplete="off" />
            <button type="submit" disabled={!imeiInput.trim()}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <CheckCircle className="h-4 w-4" /> Confirmar
            </button>
          </form>
          {feedback && (
            <div className={`mt-3 flex items-start gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${
              feedback.tipo === "ok"     ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : feedback.tipo === "aviso" ? "bg-amber-50 text-amber-700 ring-amber-200"
              : "bg-red-50 text-red-700 ring-red-200"
            }`}>
              {feedback.tipo === "ok"
                ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              }
              <div>
                <p className="font-semibold">{feedback.msg}</p>
                {feedback.item && <p className="text-xs mt-0.5 opacity-80">{feedback.item.modelo} · {feedback.item.grade} · {feedback.item.local_estoque}</p>}
              </div>
            </div>
          )}
        </Card>

        {/* Lista de itens */}
        <Card>
          <div className="flex items-center gap-3 mb-4 flex-wrap">
            <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
              <Package className="h-4 w-4 text-[#7F2D92]" /> Lista de itens
            </h3>
            <div className="flex gap-2 ml-auto flex-wrap">
              {[
                { key: "todos",          label: "Todos"           },
                { key: "pendente",       label: "Pendentes"       },
                { key: "bipado",         label: "Bipados"         },
                { key: "nao_localizado", label: "Não Localizados" },
              ].map(f => (
                <button key={f.key} onClick={() => setFiltro(f.key)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
                    filtro === f.key ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {f.label}
                  {f.key === "nao_localizado" && totalNaoLoc > 0 && (
                    <span className="ml-1.5 bg-amber-400 text-white rounded-full px-1.5 py-0.5 text-xs">
                      {totalNaoLoc}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="relative mb-3">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar IMEI, modelo, voucher ou local..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Local</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                      <th className="px-3 py-2 text-left font-bold text-slate-500">Voucher</th>
                      <th className="px-3 py-2 text-center font-bold text-slate-500">Status</th>
                      <th className="px-3 py-2 text-center font-bold text-slate-500">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itensFiltrados.slice(0, 200).map(item => (
                      <tr key={item.id} className={`hover:bg-slate-50 ${item.status === "bipado" ? "opacity-50" : ""}`}>
                        <td className="px-3 py-2 font-mono text-slate-600">{item.local_estoque || "—"}</td>
                        <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                        <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{item.modelo}</td>
                        <td className="px-3 py-2">
                          <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{item.grade}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-slate-600">{item.voucher || "—"}</td>
                        <td className="px-3 py-2 text-center"><StatusBadge status={item.status} /></td>
                        <td className="px-3 py-2 text-center">
                          {item.status === "pendente" && (
                            <button
                              onClick={() => handleNaoLocalizado(item)}
                              className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition whitespace-nowrap"
                            >
                              Não localizado
                            </button>
                          )}
                          {item.status === "nao_localizado" && (
                            <button
                              onClick={() => setModalReverter(item)}
                              className="text-xs font-semibold px-2 py-1 rounded-lg bg-purple-50 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-100 transition flex items-center gap-1 mx-auto"
                            >
                              <RotateCcw className="h-3 w-3" /> Reverter
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {itensFiltrados.length > 200 && (
                <p className="text-xs text-center text-slate-400 mt-2">
                  Mostrando 200 de {fmtN(itensFiltrados.length)} itens.
                </p>
              )}
              {itensFiltrados.length === 0 && (
                <p className="text-center text-slate-400 text-sm py-8">Nenhum item encontrado.</p>
              )}
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
function TabEmbalagem({ pedidos, onAtualizar }) {
  const { user }                    = useAuth();
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

  useEffect(() => { if (pedidoSel) carregarCaixas(); }, [pedidoSel]);
  useEffect(() => {
    if (caixaAtiva) {
      carregarItensCaixa();
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [caixaAtiva]);

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
    const data = await listarItensCaixa(caixaAtiva.id);
    setItensCaixa(data);
  }

  async function handleNovaCaixa() {
    setLoading(true);
    try {
      const nova = await criarCaixa(pedidoSel.id, user.id);
      setCaixaAtiva(nova);
      setCaixas(prev => [...prev, nova]);
      setItensCaixa([]);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleFecharCaixa() {
    if (!caixaAtiva) return;
    setLoading(true);
    try {
      await fecharCaixa(caixaAtiva.id, user.id);
      setCaixas(prev => prev.map(c =>
        c.id === caixaAtiva.id ? { ...c, status: "fechada", fechado_em: new Date().toISOString() } : c
      ));
      setCaixaAtiva(null);
      setItensCaixa([]);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  async function handleBipar(e) {
    e.preventDefault();
    if (!imeiInput.trim() || !caixaAtiva || !pedidoSel) return;
    const res = await embalarImei(imeiInput.trim(), pedidoSel.id, caixaAtiva.id, user.id);
    setImei("");
    if (res.ok) {
      const novoItem = { ...res.item, caixa_id: caixaAtiva.id, embalado_em: new Date().toISOString() };
      setItensCaixa(prev => [...prev, novoItem]);
      setCaixaAtiva(prev => ({ ...prev, total_itens: res.totalCaixa }));
      setCaixas(prev => prev.map(c =>
        c.id === caixaAtiva.id ? { ...c, total_itens: res.totalCaixa } : c
      ));
      if (res.caixaFechou) {
        setFeedback({ tipo: "fechou", msg: `✓ Caixa ${caixaAtiva.numero} completa com ${CAPACIDADE} unidades! Fechada automaticamente.` });
        setCaixaAtiva(prev => ({ ...prev, status: "fechada" }));
        setCaixas(prev => prev.map(c =>
          c.id === caixaAtiva.id ? { ...c, status: "fechada", total_itens: CAPACIDADE } : c
        ));
      } else {
        setFeedback({ tipo: "ok", msg: `✓ ${imeiInput.trim()} embalado — Caixa ${caixaAtiva.numero}: ${res.totalCaixa}/${CAPACIDADE}` });
      }
    } else {
      setFeedback({ tipo: "erro", msg: res.erro });
    }
    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  async function handleRomaneio(caixa) {
    setGerando(caixa.id + "_rom");
    try { await gerarRomaneio(caixa.id, pedidoSel); }
    catch (e) { alert("Erro ao gerar romaneio: " + e.message); }
    finally { setGerando(null); }
  }

  async function handleEtiqueta(caixa) {
    setGerando(caixa.id + "_etq");
    try { await gerarEtiqueta(caixa.id, pedidoSel, caixas.length); }
    catch (e) { alert("Erro ao gerar etiqueta: " + e.message); }
    finally { setGerando(null); }
  }

  async function handleRomaneioPedido() {
    setGerandoRomaneio(true);
    try { await gerarRomaneioPedido(pedidoSel); }
    catch (e) { alert("Erro ao gerar romaneio: " + e.message); }
    finally { setGerandoRomaneio(false); }
  }

  async function verDetalhesCaixa(caixa) {
    if (caixaDetalhes?.id === caixa.id) { setCaixaDetalhes(null); return; }
    setCaixaDetalhes(caixa);
    const data = await listarItensCaixa(caixa.id);
    setItensCaixaDet(data);
  }

  const totalEmbalados = caixas.reduce((s, c) => s + (c.total_itens || 0), 0);
  const totalBipados   = pedidoSel?.total_bipados || 0;

  if (!pedidoSel) {
    const pedidosDisponiveis = pedidos.filter(p => p.total_bipados > 0);
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Selecione um pedido para iniciar a embalagem:</p>
        {pedidosDisponiveis.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Box className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido com itens bipados ainda.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {pedidosDisponiveis.map(p => (
              <button key={p.id} onClick={() => setPedido(p)}
                className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 text-left hover:ring-purple-300 hover:bg-purple-50 transition-all">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{p.lote}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                  </div>
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
        <button onClick={() => { setPedido(null); setCaixaAtiva(null); setCaixas([]); setItensCaixa([]); }}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <X className="h-3 w-3" /> Trocar pedido
        </button>
        <div className="flex-1">
          <h3 className="font-black text-slate-800 text-sm">{pedidoSel.lote}</h3>
          <p className="text-xs text-slate-500">{pedidoSel.cliente}</p>
        </div>
        <button onClick={handleRomaneioPedido} disabled={gerandoRomaneio || caixas.length === 0}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-100 transition disabled:opacity-40">
          {gerandoRomaneio
            ? <div className="h-3 w-3 border-2 border-purple-300 border-t-purple-700 rounded-full animate-spin" />
            : <FileText className="h-3 w-3" />
          }
          Romaneio do Pedido
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Bipados (disponíveis)" value={fmtN(totalBipados)} color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Embalados" value={fmtN(totalEmbalados)}
          sub={`${Math.round((totalEmbalados / (totalBipados || 1)) * 100)}%`}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="A embalar" value={fmtN(totalBipados - totalEmbalados)} color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Caixas" value={fmtN(caixas.length)}
          sub={`${caixas.filter(c => c.status === "fechada").length} fechadas`}
          color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <Card>
        <p className="text-xs font-semibold text-slate-500 mb-2">Progresso da embalagem</p>
        <ProgressBar value={totalEmbalados} total={totalBipados} color="#F97316" />
      </Card>

      {caixaAtiva && caixaAtiva.status === "aberta" ? (
        <Card>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <Box className="h-4 w-4 text-[#7F2D92]" /> Caixa {caixaAtiva.numero} — Em uso
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">{caixaAtiva.total_itens || 0}/{CAPACIDADE} unidades</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="text-right">
                <div className="text-2xl font-black text-[#7F2D92]">{caixaAtiva.total_itens || 0}/{CAPACIDADE}</div>
                <div className="text-xs text-slate-400">unidades</div>
              </div>
              <button onClick={handleFecharCaixa} disabled={loading || !caixaAtiva.total_itens}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-100 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-200 transition disabled:opacity-40">
                <Lock className="h-3 w-3" /> Fechar caixa
              </button>
            </div>
          </div>

          <div className="mb-4">
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.round(((caixaAtiva.total_itens || 0) / CAPACIDADE) * 100)}%`,
                  background: (caixaAtiva.total_itens || 0) >= CAPACIDADE ? "#1D9E75" : "#7F2D92",
                }} />
            </div>
          </div>

          <form onSubmit={handleBipar} className="flex gap-3">
            <input ref={inputRef} type="text" value={imeiInput}
              onChange={e => setImei(e.target.value)}
              placeholder="Bipe o IMEI para embalar..."
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              autoComplete="off" />
            <button type="submit" disabled={!imeiInput.trim()}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <CheckCircle className="h-4 w-4" /> Confirmar
            </button>
          </form>

          {feedback && (
            <div className={`mt-3 flex items-start gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${
              feedback.tipo === "ok" || feedback.tipo === "fechou"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-red-50 text-red-700 ring-red-200"
            }`}>
              {feedback.tipo !== "erro"
                ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              }
              <p className="font-semibold">{feedback.msg}</p>
            </div>
          )}

          {itensCaixa.length > 0 && (
            <div className="mt-4 overflow-x-auto">
              <p className="text-xs font-bold text-slate-500 mb-2">Itens nesta caixa ({itensCaixa.length})</p>
              <table className="min-w-full text-xs">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-3 py-2 text-left font-bold text-slate-500">#</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                    <th className="px-3 py-2 text-left font-bold text-slate-500">SKU</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {itensCaixa.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 font-semibold">{idx + 1}</td>
                      <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                      <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.modelo}</td>
                      <td className="px-3 py-2">
                        <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{item.grade}</span>
                      </td>
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
              <p className="text-xs text-slate-400 mt-0.5">
                {caixas.filter(c => c.status === "fechada").length > 0
                  ? "Todas as caixas foram fechadas. Abra uma nova para continuar."
                  : "Abra a primeira caixa para iniciar a embalagem."}
              </p>
            </div>
            <button onClick={handleNovaCaixa} disabled={loading}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <Plus className="h-4 w-4" />
              {loading ? "Criando..." : "Nova caixa"}
            </button>
          </div>
        </Card>
      )}

      {caixas.length > 0 && (
        <Card>
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-4">
            <Box className="h-4 w-4 text-[#7F2D92]" /> Todas as caixas ({caixas.length})
          </h3>
          <div className="space-y-3">
            {caixas.map(caixa => (
              <div key={caixa.id}>
                <div className={`flex items-center justify-between gap-3 p-3 rounded-xl ring-1 ${
                  caixa.status === "aberta" ? "bg-purple-50 ring-purple-200" : "bg-slate-50 ring-slate-200"
                }`}>
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-xl flex items-center justify-center font-black text-sm shrink-0 ${
                      caixa.status === "aberta" ? "bg-[#7F2D92] text-white" : "bg-slate-300 text-white"
                    }`}>
                      {caixa.numero}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Caixa {caixa.numero}</div>
                      <div className="text-xs text-slate-500">{caixa.total_itens || 0}/{CAPACIDADE} unidades</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap justify-end">
                    <StatusBadge status={caixa.status} />
                    <button onClick={() => verDetalhesCaixa(caixa)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50 transition">
                      {caixaDetalhes?.id === caixa.id ? "Ocultar" : "Ver itens"}
                    </button>
                    <button onClick={() => handleRomaneio(caixa)}
                      disabled={gerando === caixa.id + "_rom" || !caixa.total_itens}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 ring-1 ring-purple-200 hover:bg-purple-100 transition disabled:opacity-40">
                      {gerando === caixa.id + "_rom"
                        ? <div className="h-3 w-3 border-2 border-purple-300 border-t-purple-700 rounded-full animate-spin" />
                        : <FileText className="h-3 w-3" />
                      }
                      Romaneio
                    </button>
                    <button onClick={() => handleEtiqueta(caixa)}
                      disabled={gerando === caixa.id + "_etq" || !caixa.total_itens}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-200 hover:bg-orange-100 transition disabled:opacity-40">
                      {gerando === caixa.id + "_etq"
                        ? <div className="h-3 w-3 border-2 border-orange-300 border-t-orange-700 rounded-full animate-spin" />
                        : <Tag className="h-3 w-3" />
                      }
                      Etiqueta
                    </button>
                  </div>
                </div>

                {caixaDetalhes?.id === caixa.id && (
                  <div className="mt-2 overflow-x-auto rounded-xl border border-slate-100">
                    <table className="min-w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-3 py-2 text-left font-bold text-slate-500">#</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-500">SKU</th>
                          <th className="px-3 py-2 text-right font-bold text-slate-500">Valor</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itensCaixaDet.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-400">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                            <td className="px-3 py-2 text-slate-600 max-w-[160px] truncate">{item.modelo}</td>
                            <td className="px-3 py-2">
                              <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{item.grade}</span>
                            </td>
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
// ABA PEDIDOS
// ══════════════════════════════════════════════════════════
function TabPedidos({ pedidos, onAtualizar }) {
  const { user, profile }             = useAuth();
  const [exportando, setExportando]   = useState(null);
  const [feedbackExp, setFeedbackExp] = useState({});
  const [historicoAberto, setHistoricoAberto] = useState(null);
  const [historico, setHistorico]     = useState([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);

  async function handleExportar(pedido) {
    setExportando(pedido.id);
    setFeedbackExp(prev => ({ ...prev, [pedido.id]: null }));
    try {
      const nomeUsuario = profile?.nome || user?.email || "Usuário";
      const res = await exportarFaturamento(pedido.id, user.id, nomeUsuario);
      if (res.bloqueado) {
        setFeedbackExp(prev => ({ ...prev, [pedido.id]: { tipo: "bloqueado", msg: res.msg } }));
      } else {
        setFeedbackExp(prev => ({
          ...prev,
          [pedido.id]: { tipo: "ok", msg: `✓ Exportação v${res.numeroExportacao} — ${fmtN(res.total)} itens — ${res.nomeArquivo}` },
        }));
        onAtualizar?.();
      }
    } catch (e) {
      setFeedbackExp(prev => ({ ...prev, [pedido.id]: { tipo: "erro", msg: e.message } }));
    } finally {
      setExportando(null);
    }
  }

  async function verHistorico(pedidoId) {
    if (historicoAberto === pedidoId) { setHistoricoAberto(null); return; }
    setHistoricoAberto(pedidoId);
    setLoadingHistorico(true);
    const data = await listarExportacoes(pedidoId);
    setHistorico(data);
    setLoadingHistorico(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-slate-800 flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-[#7F2D92]" /> Todos os Pedidos B2B
        </h3>
        <button onClick={onAtualizar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
      </div>

      {pedidos.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum pedido importado ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {pedidos.map(p => {
            const fb = feedbackExp[p.id];
            return (
              <Card key={p.id}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <div className="font-bold text-slate-800 text-sm">{p.lote}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Importado em {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
                    <StatusBadge status={p.status} />
                    <button onClick={() => verHistorico(p.id)}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 transition">
                      <Clock className="h-3 w-3" /> Histórico
                    </button>
                    <button onClick={() => handleExportar(p)}
                      disabled={exportando === p.id || !p.total_bipados}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition disabled:opacity-40">
                      {exportando === p.id
                        ? <div className="h-3 w-3 border-2 border-emerald-300 border-t-emerald-700 rounded-full animate-spin" />
                        : <Download className="h-3 w-3" />
                      }
                      Exportar
                    </button>
                  </div>
                </div>

                <ProgressBar value={p.total_bipados || 0} total={p.total_itens || 0} />

                <div className="grid grid-cols-3 gap-3 mt-3">
                  <div className="bg-slate-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-black text-slate-800">{fmtN(p.total_itens)}</div>
                    <div className="text-xs text-slate-400">Total</div>
                  </div>
                  <div className="bg-emerald-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-black text-emerald-700">{fmtN(p.total_bipados || 0)}</div>
                    <div className="text-xs text-emerald-500">Bipados</div>
                  </div>
                  <div className="bg-orange-50 rounded-xl p-3 text-center">
                    <div className="text-lg font-black text-orange-700">
                      {fmtN((p.total_itens || 0) - (p.total_bipados || 0))}
                    </div>
                    <div className="text-xs text-orange-500">Pendentes</div>
                  </div>
                </div>

                {fb && (
                  <div className={`mt-3 flex items-start gap-2 text-xs rounded-xl px-4 py-3 ring-1 ${
                    fb.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                    : fb.tipo === "bloqueado" ? "bg-amber-50 text-amber-700 ring-amber-200"
                    : "bg-red-50 text-red-700 ring-red-200"
                  }`}>
                    {fb.tipo === "ok"
                      ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    }
                    <p className="font-semibold leading-relaxed">{fb.msg}</p>
                  </div>
                )}

                {historicoAberto === p.id && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    <p className="text-xs font-bold text-slate-500 mb-2">Histórico de exportações</p>
                    {loadingHistorico ? (
                      <div className="flex items-center justify-center h-10">
                        <div className="h-4 w-4 border-2 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
                      </div>
                    ) : historico.length === 0 ? (
                      <p className="text-xs text-slate-400">Nenhuma exportação realizada.</p>
                    ) : (
                      <div className="space-y-2">
                        {historico.map((exp, idx) => (
                          <div key={exp.id}
                            className="flex items-center justify-between text-xs bg-slate-50 rounded-xl px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-[#7F2D92]">v{historico.length - idx}</span>
                              <span className="text-slate-600">{exp.nome_usuario}</span>
                            </div>
                            <div className="flex items-center gap-3 text-slate-400">
                              <span className="font-semibold text-slate-600">{fmtN(exp.total_itens)} itens</span>
                              <span>{new Date(exp.exportado_em).toLocaleString("pt-BR")}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function B2BPickingPage() {
  const [aba, setAba]         = useState("picking");
  const [pedidos, setPedidos] = useState([]);

  useEffect(() => { carregarPedidos(); }, []);

  async function carregarPedidos() {
    const data = await listarPedidosB2B();
    setPedidos(data);
  }

  const ABAS = [
    { key: "picking",   label: "Picking",   icon: Search    },
    { key: "embalagem", label: "Embalagem", icon: Box       },
    { key: "pedidos",   label: "Faturamento",   icon: BarChart3 },
  ];

  const pedidosAbertos    = pedidos.filter(p => p.status === "aberto").length;
  const pedidosConcluidos = pedidos.filter(p => p.status === "concluido").length;

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
          {pedidosAbertos > 0 && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-orange-50 text-orange-700 ring-1 ring-orange-200">
              {pedidosAbertos} em aberto
            </span>
          )}
          {pedidosConcluidos > 0 && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              {pedidosConcluidos} concluído{pedidosConcluidos > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                aba === a.key ? "bg-[#7F2D92] text-white shadow-md" : "text-slate-500 hover:bg-slate-100"
              }`}>
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

      {aba === "picking"   && <TabPicking   pedidos={pedidos} onAtualizar={carregarPedidos} />}
      {aba === "embalagem" && <TabEmbalagem pedidos={pedidos} onAtualizar={carregarPedidos} />}
      {aba === "pedidos"   && <TabPedidos   pedidos={pedidos} onAtualizar={carregarPedidos} />}
    </div>
  );
}