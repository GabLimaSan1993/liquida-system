import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, Package,
  X, ChevronDown, ChevronUp, Clock,
  Layers, ArrowRight, Loader, RefreshCw,
  FileText, Store,
} from "lucide-react";
import {
  listarPedidosAguardandoAlocacao,
  listarGruposPicking,
  listarPedidosGrupo,
  listarPedidosEmAnalise,
  listarPedidosFaturamento,
  buscarSugestaoFifo,
  alocarPedido,
  fecharGruposPendentes,
  registrarBipagem,
  marcarNaoLocalizado,
  resolverAnalise,
  registrarNF,
  buscarKpisPedidosB2C,
} from "../services/pedidosB2CService.js";
import { useAuth } from "../AuthContext.jsx";

function fmtR(v) { return v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"; }
function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtData(d) { if (!d) return "—"; return new Date(d).toLocaleString("pt-BR"); }

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
    aguardando_alocacao: { label: "Aguardando Alocação", cls: "bg-slate-50 text-slate-600 ring-slate-200" },
    alocado:             { label: "Alocado",             cls: "bg-blue-50 text-blue-700 ring-blue-200"    },
    em_picking:          { label: "Em Picking",          cls: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
    em_analise:          { label: "Em Análise",          cls: "bg-orange-50 text-orange-700 ring-orange-200" },
    embalado:            { label: "Embalado",            cls: "bg-purple-50 text-purple-700 ring-purple-200" },
    faturado:            { label: "Faturado",            cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    concluido:           { label: "Concluído",           cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  };
  const s = map[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${s.cls}`}>{s.label}</span>;
}

function GradeBadge({ grade }) {
  if (!grade) return <span className="text-slate-300">—</span>;
  const g = grade.toLowerCase();
  const cls =
    g.includes("like new")  ? "bg-emerald-50 text-emerald-700" :
    g.includes("excelente") ? "bg-blue-50 text-blue-700"       :
    g.includes("muito bom") ? "bg-purple-50 text-purple-700"   :
    g.includes("bom")       ? "bg-yellow-50 text-yellow-700"   :
    "bg-slate-50 text-slate-500";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${cls}`}>{grade}</span>;
}

// ══════════════════════════════════════════════════════════
// ABA ALOCAÇÃO
// ══════════════════════════════════════════════════════════
function TabAlocacao({ onGrupoFormado }) {
  const { user } = useAuth();
  const [pedidos, setPedidos]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [horaCorte, setHoraCorte]           = useState("");
  const [busca, setBusca]                   = useState("");
  const [alocandoId, setAlocandoId]         = useState(null);
  const [sugestoes, setSugestoes]           = useState([]);
  const [loadingSugestao, setLoadingSugestao] = useState(false);
  const [feedback, setFeedback]             = useState(null);
  const [pendentes, setPendentes]           = useState(0);
  const [fechandoGrupo, setFechandoGrupo]   = useState(false);

  useEffect(() => { carregar(); }, [horaCorte]);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarPedidosAguardandoAlocacao(horaCorte);
      setPedidos(data);
      // Conta quantos estão alocados sem grupo
      const { data: semGrupo } = await import("../lib/supabase").then(m =>
        m.supabase.from("pedidos_b2c").select("id", { count: "exact" })
          .eq("status", "alocado").is("grupo_id", null)
      );
      setPendentes(semGrupo?.length || 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function abrirSugestoes(pedido) {
    if (alocandoId === pedido.id) { setAlocandoId(null); setSugestoes([]); return; }
    setAlocandoId(pedido.id);
    setLoadingSugestao(true);
    setSugestoes([]);
    try {
      const res = await buscarSugestaoFifo(pedido.sku_produto, pedido.grade_produto);
      setSugestoes(res);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setLoadingSugestao(false); }
  }

  async function handleAlocar(pedido, sugestao) {
    try {
      const { grupoFormado } = await alocarPedido(pedido.id, sugestao.imei, sugestao.sku, sugestao.grade, user.id);
      setPedidos(prev => prev.filter(p => p.id !== pedido.id));
      setAlocandoId(null);
      setSugestoes([]);

      if (grupoFormado) {
        setFeedback({ tipo: "ok", msg: `✓ Pedido alocado! Grupo #${grupoFormado.numero} criado com 20 pedidos.` });
        setPendentes(0);
        if (onGrupoFormado) onGrupoFormado();
      } else {
        setPendentes(prev => prev + 1);
        setFeedback({ tipo: "ok", msg: `✓ Pedido #${pedido.id_anymarket} alocado — IMEI ${sugestao.imei}` });
      }
      setTimeout(() => setFeedback(null), 4000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
  }

  async function handleFecharGrupo() {
    setFechandoGrupo(true);
    try {
      const grupo = await fecharGruposPendentes(user.id);
      if (grupo) {
        setFeedback({ tipo: "ok", msg: `✓ Grupo #${grupo.numero} criado com ${grupo.total_pedidos} pedidos.` });
        setPendentes(0);
        if (onGrupoFormado) onGrupoFormado();
      } else {
        setFeedback({ tipo: "aviso", msg: "Nenhum pedido alocado aguardando grupo." });
      }
      setTimeout(() => setFeedback(null), 4000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setFechandoGrupo(false); }
  }

  const pedidosFiltrados = pedidos.filter(p =>
    !busca ||
    String(p.id_anymarket).includes(busca) ||
    p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
    p.sku_produto?.toLowerCase().includes(busca.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-purple-500" />
            <label className="text-xs font-bold text-slate-600">Hora de corte:</label>
            <input
              type="time"
              value={horaCorte}
              onChange={e => setHoraCorte(e.target.value)}
              className="rounded-xl border border-[#E9D5FF] px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white"
            />
          </div>
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por ID, cliente ou SKU..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
            />
          </div>
          <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        {/* Banner de pendentes */}
        {pendentes > 0 && (
          <div className="mt-4 flex items-center justify-between gap-3 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-4 py-3">
            <div className="text-xs font-semibold text-amber-700">
              ⚠ {pendentes} pedido{pendentes > 1 ? "s" : ""} alocado{pendentes > 1 ? "s" : ""} aguardando grupo (menos de 20)
            </div>
            <button
              onClick={handleFecharGrupo}
              disabled={fechandoGrupo}
              className="text-xs font-bold px-3 py-1.5 rounded-xl bg-amber-500 text-white hover:bg-amber-600 transition disabled:opacity-50 shrink-0">
              {fechandoGrupo ? "Criando..." : "Fechar grupo"}
            </button>
          </div>
        )}
      </Card>

      {feedback && (
        <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${
          feedback.tipo === "ok"    ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
          feedback.tipo === "aviso" ? "bg-amber-50 text-amber-700 ring-amber-200" :
          "bg-red-50 text-red-700 ring-red-200"
        }`}>
          {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="font-semibold">{feedback.msg}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : pedidosFiltrados.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">{horaCorte ? "Nenhum pedido aguardando alocação para este corte." : "Defina a hora de corte para ver os pedidos."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-semibold">{fmtN(pedidosFiltrados.length)} pedidos aguardando alocação</p>
          {pedidosFiltrados.map(p => (
            <div key={p.id} className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                      <span className="text-xs text-slate-400">{p.marketplace}</span>
                      {p.data_de_pagamento && (
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="h-3 w-3" /> {p.data_de_pagamento}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-semibold text-slate-700 truncate">{p.titulo_produto}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs text-slate-500 font-mono">{p.sku_produto}</span>
                      <GradeBadge grade={p.grade_produto} />
                      <span className="text-xs font-bold text-emerald-700">{fmtR(p.total_do_pedido)}</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{p.cliente}</p>
                  </div>
                  <button
                    onClick={() => abrirSugestoes(p)}
                    className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ring-1 transition shrink-0 ${
                      alocandoId === p.id
                        ? "bg-purple-100 text-purple-700 ring-purple-300"
                        : "bg-[#7F2D92] text-white ring-[#7F2D92] hover:bg-[#5B1E74]"
                    }`}>
                    <Layers className="h-3.5 w-3.5" />
                    {alocandoId === p.id ? "Fechar" : "Ver FIFO"}
                  </button>
                </div>
              </div>

              {alocandoId === p.id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  {loadingSugestao ? (
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Loader className="h-4 w-4 animate-spin text-purple-500" />
                      Buscando sugestões FIFO...
                    </div>
                  ) : sugestoes.length === 0 ? (
                    <div className="flex items-center gap-2 text-xs text-amber-600 font-semibold">
                      <AlertTriangle className="h-4 w-4" />
                      Nenhum IMEI disponível para este SKU e grade.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs font-bold text-slate-500 mb-2">
                        Sugestões FIFO — {sugestoes.length} opção{sugestoes.length > 1 ? "ões" : ""} disponível{sugestoes.length > 1 ? "eis" : ""}
                      </p>
                      {sugestoes.slice(0, 5).map((s, idx) => (
                        <div key={s.imei} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ${idx === 0 ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"}`}>
                          <div className="flex items-center gap-3 flex-wrap flex-1 min-w-0">
                            {idx === 0 && (
                              <span className="text-xs font-black text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-lg shrink-0">FIFO</span>
                            )}
                            <span className="font-mono font-bold text-slate-800 text-xs">{s.imei}</span>
                            <GradeBadge grade={s.grade} />
                            {s.local && <span className="text-xs text-slate-400 font-mono">{s.local}</span>}
                            {s.data_subinv && <span className="text-xs text-slate-400">Entrada: {s.data_subinv}</span>}
                          </div>
                          <button
                            onClick={() => handleAlocar(p, s)}
                            className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] transition shrink-0">
                            <ArrowRight className="h-3 w-3" /> Alocar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA PICKING
// ══════════════════════════════════════════════════════════
function TabPicking() {
  const { user } = useAuth();
  const [grupos, setGrupos]               = useState([]);
  const [grupoSel, setGrupoSel]           = useState(null);
  const [pedidos, setPedidos]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [imeiInput, setImeiInput]         = useState("");
  const [feedback, setFeedback]           = useState(null);
  const [modalAnalise, setModalAnalise]   = useState(null);
  const [motivoAnalise, setMotivoAnalise] = useState("");
  const inputRef = useRef(null);

  useEffect(() => { carregarGrupos(); }, []);
  useEffect(() => { if (grupoSel) carregarPedidos(); }, [grupoSel]);
  useEffect(() => { if (grupoSel) inputRef.current?.focus(); }, [grupoSel]);

  async function carregarGrupos() {
    setLoading(true);
    try { setGrupos(await listarGruposPicking()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function carregarPedidos() {
    const data = await listarPedidosGrupo(grupoSel.id);
    setPedidos(data);
  }

  async function handleBipar(e) {
    e.preventDefault();
    if (!imeiInput.trim() || !grupoSel) return;
    const imei = imeiInput.trim();
    setImeiInput("");

    const pedido = pedidos.find(p => p.imei_alocado === imei && p.status === "em_picking");
    if (!pedido) {
      setFeedback({ tipo: "erro", msg: `IMEI ${imei} não encontrado neste grupo ou já bipado.` });
      setTimeout(() => setFeedback(null), 3000);
      inputRef.current?.focus();
      return;
    }

    const res = await registrarBipagem(pedido.id, imei, user.id);
    if (res.ok) {
      setFeedback({ tipo: "ok", msg: `✓ Pedido #${pedido.id_anymarket} bipado!` });
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: "embalado", bipado_em: new Date().toISOString() } : p));
    } else {
      setFeedback({ tipo: "erro", msg: res.erro });
    }
    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  async function confirmarAnalise() {
    if (!modalAnalise) return;
    try {
      await marcarNaoLocalizado(modalAnalise.id, motivoAnalise || "Não localizado", user.id);
      setPedidos(prev => prev.map(p => p.id === modalAnalise.id ? { ...p, status: "em_analise" } : p));
      setFeedback({ tipo: "aviso", msg: `⚠ Pedido #${modalAnalise.id_anymarket} enviado para análise.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setModalAnalise(null); setMotivoAnalise(""); }
  }

  const totalGrupo = pedidos.length;
  const bipados    = pedidos.filter(p => ["embalado", "faturado", "concluido"].includes(p.status)).length;
  const emAnalise  = pedidos.filter(p => p.status === "em_analise").length;
  const pendentes  = pedidos.filter(p => p.status === "em_picking").length;
  const pct        = totalGrupo > 0 ? Math.round((bipados / totalGrupo) * 100) : 0;

  if (!grupoSel) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-500">Selecione um grupo de picking:</p>
          <button onClick={carregarGrupos} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : grupos.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum grupo de picking em aberto.</p>
            <p className="text-xs mt-1">Aloque 20 pedidos na aba Alocação para criar um grupo automaticamente.</p>
          </div>
        ) : (
          <div className="grid gap-3">
            {grupos.map(g => {
              const pctG = g.total_pedidos > 0 ? Math.round((g.concluidos || 0) / g.total_pedidos * 100) : 0;
              return (
                <button key={g.id} onClick={() => setGrupoSel(g)}
                  className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 text-left hover:ring-purple-300 hover:bg-purple-50 transition-all">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="font-black text-slate-800">Grupo #{g.numero}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{g.total_pedidos} pedidos · criado em {fmtData(g.criado_em)}</div>
                    </div>
                    <StatusBadge status={g.status} />
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#7F2D92] transition-all" style={{ width: `${pctG}%` }} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {modalAnalise && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-amber-100 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800">Não Localizado</h2>
                <p className="text-xs text-slate-500">Pedido #{modalAnalise.id_anymarket}</p>
              </div>
            </div>
            <div className="bg-slate-50 ring-1 ring-slate-200 rounded-2xl p-4 mb-4 space-y-1">
              <p className="text-xs font-bold text-slate-500">IMEI alocado</p>
              <p className="font-mono font-bold text-slate-800">{modalAnalise.imei_alocado}</p>
              <p className="text-xs text-slate-500">{modalAnalise.titulo_produto}</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 mb-1">Motivo (opcional)</label>
              <input
                value={motivoAnalise}
                onChange={e => setMotivoAnalise(e.target.value)}
                placeholder="Ex: não encontrado no local indicado"
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={confirmarAnalise}
                className="flex-1 rounded-2xl bg-amber-500 py-3 text-sm font-bold text-white hover:bg-amber-600 transition">
                Confirmar — Enviar para Análise
              </button>
              <button onClick={() => { setModalAnalise(null); setMotivoAnalise(""); inputRef.current?.focus(); }}
                className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <button onClick={() => { setGrupoSel(null); setPedidos([]); carregarGrupos(); }}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
            <X className="h-3 w-3" /> Trocar grupo
          </button>
          <div className="flex-1">
            <h3 className="font-black text-slate-800 text-sm">Grupo #{grupoSel.numero}</h3>
            <p className="text-xs text-slate-500">{totalGrupo} pedidos</p>
          </div>
          <StatusBadge status={grupoSel.status} />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <KpiMini label="Bipados"    value={fmtN(bipados)}   sub={`${pct}%`} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
          <KpiMini label="Pendentes"  value={fmtN(pendentes)}                 color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
          <KpiMini label="Em Análise" value={fmtN(emAnalise)}                 color="bg-orange-50 ring-orange-200 text-orange-700" />
        </div>

        <Card>
          <div className="h-3 bg-slate-100 rounded-full overflow-hidden mb-4">
            <div className="h-full rounded-full bg-[#7F2D92] transition-all" style={{ width: `${pct}%` }} />
          </div>
          <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
            <Search className="h-4 w-4 text-[#7F2D92]" /> Bipar IMEI
          </h3>
          <form onSubmit={handleBipar} className="flex gap-3">
            <input
              ref={inputRef}
              type="text"
              value={imeiInput}
              onChange={e => setImeiInput(e.target.value)}
              placeholder="Bipe o IMEI do aparelho..."
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              autoComplete="off"
            />
            <button type="submit" disabled={!imeiInput.trim()}
              className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
              <CheckCircle className="h-4 w-4" /> Confirmar
            </button>
          </form>
          {feedback && (
            <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${
              feedback.tipo === "ok"    ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
              feedback.tipo === "aviso" ? "bg-amber-50 text-amber-700 ring-amber-200" :
              "bg-red-50 text-red-700 ring-red-200"
            }`}>
              {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span className="font-semibold">{feedback.msg}</span>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-black text-slate-800 text-sm mb-4">Pedidos do grupo ({totalGrupo})</h3>
          <div className="space-y-2">
            {pedidos.map(p => {
              const concluido = ["embalado", "faturado", "concluido"].includes(p.status);
              return (
                <div key={p.id} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                  concluido       ? "bg-emerald-50 ring-emerald-200 opacity-60" :
                  p.status === "em_analise" ? "bg-orange-50 ring-orange-200" :
                  "bg-slate-50 ring-slate-200"
                }`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-slate-800 text-xs">#{p.id_anymarket}</span>
                      <span className="font-mono text-xs text-slate-500">{p.imei_alocado}</span>
                      <GradeBadge grade={p.grade_produto} />
                    </div>
                    <p className="text-xs text-slate-500 truncate mt-0.5">{p.titulo_produto}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={p.status} />
                    {p.status === "em_picking" && (
                      <button onClick={() => setModalAnalise(p)}
                        className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition whitespace-nowrap">
                        Não localizado
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// ABA EM ANÁLISE
// ══════════════════════════════════════════════════════════
function TabAnalise() {
  const { user } = useAuth();
  const [pedidos, setPedidos]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [busca, setBusca]                   = useState("");
  const [modalResolver, setModalResolver]   = useState(null);
  const [novoImei, setNovoImei]             = useState("");
  const [feedback, setFeedback]             = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try { setPedidos(await listarPedidosEmAnalise()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleResolver() {
    if (!modalResolver) return;
    try {
      await resolverAnalise(modalResolver.id, novoImei.trim() || null, user.id);
      setPedidos(prev => prev.filter(p => p.id !== modalResolver.id));
      setFeedback({ tipo: "ok", msg: `✓ Pedido #${modalResolver.id_anymarket} devolvido para picking.` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setModalResolver(null); setNovoImei(""); }
  }

  const filtrados = pedidos.filter(p =>
    !busca ||
    String(p.id_anymarket).includes(busca) ||
    p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
    p.imei_alocado?.includes(busca)
  );

  return (
    <>
      {modalResolver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <h2 className="text-lg font-black text-slate-800 mb-1">Resolver Análise</h2>
            <p className="text-xs text-slate-500 mb-4">Pedido #{modalResolver.id_anymarket}</p>
            <div className="bg-slate-50 ring-1 ring-slate-200 rounded-2xl p-4 mb-4 space-y-1">
              <p className="text-xs font-bold text-slate-500">IMEI original alocado</p>
              <p className="font-mono font-bold text-slate-800">{modalResolver.imei_alocado}</p>
              <p className="text-xs text-slate-500">{modalResolver.motivo_analise}</p>
            </div>
            <div className="mb-4">
              <label className="block text-xs font-bold text-slate-600 mb-1">Novo IMEI (deixe vazio para manter o mesmo)</label>
              <input
                value={novoImei}
                onChange={e => setNovoImei(e.target.value)}
                placeholder="Bipe ou digite o novo IMEI..."
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={handleResolver}
                className="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition">
                Devolver para Picking
              </button>
              <button onClick={() => { setModalResolver(null); setNovoImei(""); }}
                className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {feedback && (
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
            {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{feedback.msg}</span>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por ID, cliente ou IMEI..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-600">Nenhum pedido em análise!</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(p => (
              <Card key={p.id} className="ring-1 ring-orange-200">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 truncate">{p.titulo_produto}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs font-mono text-slate-500">IMEI: {p.imei_alocado}</span>
                      <GradeBadge grade={p.grade_produto} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{p.cliente}</p>
                    {p.motivo_analise && <p className="text-xs text-orange-600 font-semibold mt-1">⚠ {p.motivo_analise}</p>}
                    {p.analise_em && <p className="text-xs text-slate-400 mt-0.5">Em análise desde: {fmtData(p.analise_em)}</p>}
                  </div>
                  <button onClick={() => setModalResolver(p)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition shrink-0">
                    <CheckCircle className="h-3.5 w-3.5" /> Resolver
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// ABA FATURAMENTO
// ══════════════════════════════════════════════════════════
function TabFaturamento() {
  const { user } = useAuth();
  const [pedidos, setPedidos]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const [modalNF, setModalNF]     = useState(null);
  const [numeroNF, setNumeroNF]   = useState("");
  const [chaveNF, setChaveNF]     = useState("");
  const [feedback, setFeedback]   = useState(null);
  const [faturando, setFaturando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try { setPedidos(await listarPedidosFaturamento()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleFaturar() {
    if (!modalNF || !numeroNF.trim()) return;
    setFaturando(true);
    try {
      await registrarNF(modalNF.id, numeroNF.trim(), chaveNF.trim() || null, user.id);
      setPedidos(prev => prev.filter(p => p.id !== modalNF.id));
      setFeedback({ tipo: "ok", msg: `✓ Pedido #${modalNF.id_anymarket} faturado — NF ${numeroNF.trim()}` });
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setFaturando(false); setModalNF(null); setNumeroNF(""); setChaveNF(""); }
  }

  const filtrados  = pedidos.filter(p =>
    !busca ||
    String(p.id_anymarket).includes(busca) ||
    p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
    p.imei_bipado?.includes(busca)
  );
  const totalValor = filtrados.reduce((s, p) => s + (p.total_do_pedido || 0), 0);

  return (
    <>
      {modalNF && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-2xl bg-emerald-100 flex items-center justify-center shrink-0">
                <FileText className="h-5 w-5 text-emerald-600" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-800">Registrar NF</h2>
                <p className="text-xs text-slate-500">Pedido #{modalNF.id_anymarket}</p>
              </div>
            </div>
            <div className="bg-slate-50 ring-1 ring-slate-200 rounded-2xl p-4 mb-4 space-y-1">
              <p className="text-xs font-bold text-slate-500">Produto</p>
              <p className="text-sm font-semibold text-slate-800">{modalNF.titulo_produto}</p>
              <p className="text-xs font-mono text-slate-500">IMEI: {modalNF.imei_bipado || modalNF.imei_alocado}</p>
              <p className="text-xs font-bold text-emerald-700">{fmtR(modalNF.total_do_pedido)}</p>
            </div>
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Número da NF *</label>
                <input
                  value={numeroNF}
                  onChange={e => setNumeroNF(e.target.value)}
                  placeholder="Ex: 51430"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Chave de Acesso (opcional)</label>
                <input
                  value={chaveNF}
                  onChange={e => setChaveNF(e.target.value)}
                  placeholder="44 dígitos..."
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={handleFaturar} disabled={!numeroNF.trim() || faturando}
                className="flex-1 rounded-2xl bg-emerald-600 py-3 text-sm font-bold text-white hover:bg-emerald-700 transition disabled:opacity-50">
                {faturando ? "Registrando..." : "Confirmar NF"}
              </button>
              <button onClick={() => { setModalNF(null); setNumeroNF(""); setChaveNF(""); }}
                className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {feedback && (
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
            {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{feedback.msg}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <KpiMini label="Aguardando NF" value={fmtN(filtrados.length)} color="bg-purple-50 ring-purple-200 text-purple-700" />
          <KpiMini label="Valor total"   value={fmtR(totalValor)}       color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por ID, cliente ou IMEI..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : filtrados.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido aguardando faturamento.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtrados.map(p => (
              <Card key={p.id} className="ring-1 ring-purple-200">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                      <span className="text-xs text-slate-400">{p.marketplace}</span>
                      <span className="text-xs font-bold text-emerald-700">{fmtR(p.total_do_pedido)}</span>
                    </div>
                    <p className="text-sm font-semibold text-slate-700 truncate">{p.titulo_produto}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-xs font-mono text-slate-500">IMEI: {p.imei_bipado || p.imei_alocado}</span>
                      <GradeBadge grade={p.grade_produto} />
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{p.cliente}</p>
                    {p.embalado_em && <p className="text-xs text-slate-400 mt-0.5">Embalado em: {fmtData(p.embalado_em)}</p>}
                  </div>
                  <button onClick={() => setModalNF(p)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition shrink-0">
                    <FileText className="h-3.5 w-3.5" /> Registrar NF
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function PedidosB2CPage() {
  const [aba, setAba]   = useState("alocacao");
  const [kpis, setKpis] = useState(null);

  useEffect(() => { recarregarKpis(); }, []);

  async function recarregarKpis() {
    buscarKpisPedidosB2C().then(setKpis).catch(console.error);
  }

  const ABAS = [
    { key: "alocacao",    label: "Alocação",    icon: Layers        },
    { key: "picking",     label: "Picking",     icon: Search        },
    { key: "analise",     label: "Em Análise",  icon: AlertTriangle },
    { key: "faturamento", label: "Faturamento", icon: FileText      },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🛍️</span>
        <div>
          <h2 className="text-lg font-black text-slate-800">Pedidos B2C</h2>
          <p className="text-xs text-slate-500">Alocação FIFO, picking, embalagem e faturamento · Marketplace</p>
        </div>
      </div>

      {kpis && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini label="Aguard. Alocação" value={fmtN(kpis.aguardando_alocacao)} color="bg-slate-50 ring-slate-200 text-slate-700" />
          <KpiMini label="Em Picking"        value={fmtN(kpis.em_picking)}          color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
          <KpiMini label="Em Análise"        value={fmtN(kpis.em_analise)}          color="bg-orange-50 ring-orange-200 text-orange-700" />
          <KpiMini label="Faturados"         value={fmtN(kpis.faturado + kpis.concluido)} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        </div>
      )}

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

      {aba === "alocacao"    && <TabAlocacao onGrupoFormado={recarregarKpis} />}
      {aba === "picking"     && <TabPicking />}
      {aba === "analise"     && <TabAnalise />}
      {aba === "faturamento" && <TabFaturamento />}
    </div>
  );
}
