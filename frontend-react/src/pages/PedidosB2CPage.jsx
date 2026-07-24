import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, Package,
  X, ChevronDown, ChevronUp, Clock,
  Layers, ArrowRight, Loader, RefreshCw,
  FileText, Store, MapPin, Ticket, Download, Upload, Lock, Unlock,
  Scale, Clock3, FileWarning, HelpCircle, CornerUpLeft, Building2, Palette, Ban,
} from "lucide-react";
import {
  listarPedidosAguardandoAlocacao,
  listarGruposPicking,
  reservarGrupoPicking,
  liberarTravaPicking,
  listarPedidosGrupo,
  listarPedidosEmAnalise,
  listarEmAnaliseComOpcao,
  listarGruposFaturamento,
  gerarPlanilhaFaturamentoGrupo,
  importarNFsGrupo,
  importarNFsXmlGrupo,
  buscarSugestaoFifo,
  buscarComparativoAging,
  listarPedidosAguardandoDefinicao,
  marcarSemProduto,
  definirProduto,
  validarSkuDefinicao,
  cancelarPedidoDefinicao,
  listarDefinicaoConcluidos,
  listarDefinicaoCancelados,
  gerarPdfSemProduto,
  alocarPedido,
  fecharGruposPendentes,
  registrarBipagem,
  marcarNaoLocalizado,
  naoLocalizadoBuscarProximo,
  resolverAnalise,
  resolverAnaliseParaEmbalagem,
  prepararResolucaoAnalise,
  buscarKpisPedidosB2C,
} from "../services/pedidosB2CService.js";
import { useAuth } from "../AuthContext.jsx";

function fmtR(v) { return v != null ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"; }
function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtData(d) { if (!d) return "—"; return new Date(d).toLocaleString("pt-BR"); }

// Detecta o tipo de documento pelo número de dígitos (ignora pontuação).
// 11 = CPF, 14 = CNPJ, qualquer outra coisa (vazio, nulo, contagem estranha) = sem documento.
function tipoDocumento(cpfCnpj) {
  const digitos = String(cpfCnpj || "").replace(/\D/g, "");
  if (digitos.length === 14) return "cnpj";
  if (digitos.length === 11) return "cpf";
  return "sem";
}

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
  const [mpFiltro, setMpFiltro]             = useState("todos");
  const [alocandoId, setAlocandoId]         = useState(null);
  const [sugestoes, setSugestoes]           = useState([]);
  const [loadingSugestao, setLoadingSugestao] = useState(false);
  const [feedback, setFeedback]             = useState(null);
  const [pendentes, setPendentes]           = useState(0);
  const [fechandoGrupo, setFechandoGrupo]   = useState(false);
  const [semProdutoId, setSemProdutoId]     = useState(null);

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
      const res = await buscarSugestaoFifo(pedido.sku_definido || pedido.sku_produto, pedido.grade_definida || pedido.grade_produto);
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
        const n = grupoFormado.gruposCriados || 1;
        setFeedback({ tipo: "ok", msg: n > 1
          ? `✓ Pedido alocado! Leva de 20 fechada — ${n} grupos criados (um por marketplace).`
          : `✓ Pedido alocado! Grupo #${grupoFormado.numero} criado com ${grupoFormado.total_pedidos || 20} pedidos.` });
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
        const n = grupo.gruposCriados || 1;
        setFeedback({ tipo: "ok", msg: n > 1
          ? `✓ ${n} grupos criados (um por marketplace).`
          : `✓ Grupo #${grupo.numero} criado com ${grupo.total_pedidos} pedidos.` });
        setPendentes(0);
        if (onGrupoFormado) onGrupoFormado();
      } else {
        setFeedback({ tipo: "aviso", msg: "Nenhum pedido alocado aguardando grupo." });
      }
      setTimeout(() => setFeedback(null), 4000);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setFechandoGrupo(false); }
  }

  async function handleSemProduto(pedido) {
    setSemProdutoId(pedido.id);
    try {
      await gerarPdfSemProduto(pedido);
      await marcarSemProduto(pedido.id, user.id);
      setPedidos(prev => prev.filter(p => p.id !== pedido.id));
      setAlocandoId(null);
      setSugestoes([]);
      setFeedback({ tipo: "ok", msg: `✓ PDF gerado — pedido #${pedido.id_anymarket} enviado para Aguardando Definição.` });
      setTimeout(() => setFeedback(null), 4000);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally { setSemProdutoId(null); }
  }

  // Marketplaces presentes nos pedidos aguardando alocação (para os botões de filtro)
  const marketplacesDisponiveis = Array.from(
    new Set(pedidos.map(p => p.marketplace).filter(Boolean))
  ).sort();

  const pedidosFiltrados = pedidos.filter(p =>
    (mpFiltro === "todos" || p.marketplace === mpFiltro) &&
    (!busca ||
      String(p.id_anymarket).includes(busca) ||
      p.cliente?.toLowerCase().includes(busca.toLowerCase()) ||
      p.sku_produto?.toLowerCase().includes(busca.toLowerCase()))
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

        {/* Filtro por marketplace */}
        {marketplacesDisponiveis.length > 0 && (
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-slate-500 flex items-center gap-1">
              <Store className="h-3.5 w-3.5" /> Marketplace:
            </span>
            <button onClick={() => setMpFiltro("todos")}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                mpFiltro === "todos" ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}>
              Todos ({pedidos.length})
            </button>
            {marketplacesDisponiveis.map(mp => {
              const qtd = pedidos.filter(p => p.marketplace === mp).length;
              return (
                <button key={mp} onClick={() => setMpFiltro(mp)}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition ${
                    mpFiltro === mp ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}>
                  {mp} ({qtd})
                </button>
              );
            })}
          </div>
        )}

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
          {pedidosFiltrados.map(p => {
            const doc = tipoDocumento(p.cpf_cnpj);
            const cardCls =
              doc === "cnpj" ? "bg-amber-50 ring-2 ring-amber-300" :
              doc === "sem"  ? "bg-red-50 ring-2 ring-red-300" :
              "bg-white ring-1 ring-slate-200";
            return (
            <div key={p.id} className={`rounded-2xl shadow-sm overflow-hidden ${cardCls}`}>
              <div className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                      <span className="text-xs text-slate-400">{p.marketplace}</span>
                      {doc === "cnpj" && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg bg-amber-500 text-white">
                          <Building2 className="h-3 w-3" /> CNPJ — Pessoa Jurídica
                        </span>
                      )}
                      {doc === "sem" && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-lg bg-red-600 text-white">
                          <AlertTriangle className="h-3 w-3" /> Sem CPF/CNPJ
                        </span>
                      )}
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
                    <p className="text-xs text-slate-400 mt-0.5">
                      {p.cliente}
                      {doc === "sem"
                        ? " · documento não informado"
                        : p.cpf_cnpj ? ` · ${p.cpf_cnpj}` : ""}
                    </p>
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
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 text-xs text-amber-600 font-semibold">
                        <AlertTriangle className="h-4 w-4" />
                        Nenhum IMEI disponível para este SKU e grade.
                      </div>
                      <button
                        onClick={() => handleSemProduto(p)}
                        disabled={semProdutoId === p.id}
                        className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-xl bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition disabled:opacity-50 shrink-0">
                        {semProdutoId === p.id
                          ? <div className="h-3 w-3 border-2 border-amber-300 border-t-amber-700 rounded-full animate-spin" />
                          : <FileWarning className="h-3.5 w-3.5" />}
                        Sem produto — gerar PDF
                      </button>
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
            );
          })}
        </div>
      )}
    </div>
  );
}// ══════════════════════════════════════════════════════════
// ABA PICKING
// ══════════════════════════════════════════════════════════
function TabPicking() {
  const { user, profile } = useAuth();
  const [grupos, setGrupos]               = useState([]);
  const [grupoSel, setGrupoSel]           = useState(null);
  const [pedidos, setPedidos]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [imeiInput, setImeiInput]         = useState("");
  const [feedback, setFeedback]           = useState(null);
  const [modalAnalise, setModalAnalise]   = useState(null);
  const [motivoAnalise, setMotivoAnalise] = useState("");
  const [abrindoId, setAbrindoId]         = useState(null);
  const [conferindo, setConferindo]       = useState(null);
  const [checks, setChecks]               = useState({ cor: false, modelo: false, sku: false });
  const [buscandoProximo, setBuscandoProximo] = useState(null);
  const [ruasSel, setRuasSel] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => { carregarGrupos(); }, []);
  useEffect(() => { if (grupoSel) { carregarPedidos(); setRuasSel([]); } }, [grupoSel]);
  useEffect(() => { if (grupoSel) inputRef.current?.focus(); }, [grupoSel]);

  async function carregarGrupos() {
    setLoading(true);
    try { setGrupos(await listarGruposPicking()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function abrirGrupo(g) {
    setAbrindoId(g.id);
    setFeedback(null);
    try {
      const res = await reservarGrupoPicking(g.id, user.id, profile?.nome);
      if (res.ok) {
        setGrupoSel(g);
      } else if (res.bloqueado) {
        setFeedback({ tipo: "erro", msg: `Grupo em separacao por ${res.por}. Aguarde a conclusao.` });
        await carregarGrupos();
      }
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally { setAbrindoId(null); }
  }

  async function handleLiberarTrava(g, ev) {
    ev.stopPropagation();
    try {
      await liberarTravaPicking(g.id);
      setFeedback({ tipo: "ok", msg: `Trava do Grupo #${g.numero} liberada.` });
      setTimeout(() => setFeedback(null), 3000);
      await carregarGrupos();
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
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

    // Abre o painel de conferência (cor/modelo/SKU) antes de confirmar a bipagem.
    setChecks({ cor: false, modelo: false, sku: false });
    setConferindo(pedido);
  }

  // Confirma a bipagem após a operadora conferir os três itens.
  async function confirmarBipagem() {
    const pedido = conferindo;
    if (!pedido) return;
    const res = await registrarBipagem(pedido.id, pedido.imei_alocado, user.id);
    if (res.ok) {
      setFeedback({ tipo: "ok", msg: `✓ Pedido #${pedido.id_anymarket} bipado!` });
      setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: "embalado", bipado_em: new Date().toISOString() } : p));
    } else {
      setFeedback({ tipo: "erro", msg: res.erro });
    }
    setConferindo(null);
    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  // Divergência na conferência: a peça errada sai do estoque sugerível (vai para "Em análise
  // de estoque") e o pedido recebe a PRÓXIMA opção do FIFO, seguindo no mesmo grupo — igual
  // ao "Não localizado". Antes ia direto para análise sem segunda opção, e o pedido travava lá.
  async function divergenciaConferencia() {
    const pedido = conferindo;
    if (!pedido) return;
    const faltou = [];
    if (!checks.cor)    faltou.push("cor");
    if (!checks.modelo) faltou.push("modelo");
    if (!checks.sku)    faltou.push("SKU");
    const motivo = `Divergência na conferência: ${faltou.join(", ")}`;
    setConferindo(null);
    setBuscandoProximo(pedido.id);
    try {
      const res = await naoLocalizadoBuscarProximo(pedido, user.id, motivo);
      if (res.trocado) {
        setPedidos(prev => prev.map(p => p.id === pedido.id
          ? { ...p, imei_alocado: res.novoImei, grade_alocada: res.grade, local_estoque: res.local }
          : p));
        setFeedback({ tipo: "ok", msg: `✓ Peça divergente separada. Nova peça para #${pedido.id_anymarket}: IMEI ${res.novoImei}${res.local ? ` · ${res.local}` : ""}. Bipe a nova peça.` });
      } else {
        setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: "em_analise" } : p));
        setFeedback({ tipo: "aviso", msg: `⚠ Sem segunda opção no FIFO para #${pedido.id_anymarket} — enviado para análise (${motivo}).` });
      }
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally {
      setBuscandoProximo(null);
      setTimeout(() => setFeedback(null), 5000);
      inputRef.current?.focus();
    }
  }

  // "Não localizado": manda o IMEI para análise de estoque e busca o próximo do FIFO.
  // Se achar, troca na hora e o pedido segue no grupo. Se não, vai para análise.
  async function handleNaoLocalizado(pedido) {
    setBuscandoProximo(pedido.id);
    try {
      const res = await naoLocalizadoBuscarProximo(pedido, user.id);
      if (res.trocado) {
        setPedidos(prev => prev.map(p => p.id === pedido.id
          ? { ...p, imei_alocado: res.novoImei, grade_alocada: res.grade, local_estoque: res.local }
          : p));
        setFeedback({ tipo: "ok", msg: `✓ Nova peça para #${pedido.id_anymarket}: IMEI ${res.novoImei}${res.local ? ` · ${res.local}` : ""}. Bipe a nova peça.` });
      } else {
        setPedidos(prev => prev.map(p => p.id === pedido.id ? { ...p, status: "em_analise" } : p));
        setFeedback({ tipo: "aviso", msg: `⚠ Sem segunda opção para #${pedido.id_anymarket} — enviado para análise.` });
      }
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setBuscandoProximo(null);
      setTimeout(() => setFeedback(null), 5000);
    }
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

  // Filtro de rua (mesma lógica do Picking B2B): a rua sai do local_estoque da peça,
  // ex.: "RUA 4/BL02/AD01/A" -> "RUA 4". Multi-seleção; vazio = todas.
  const ruasDisponiveis = [...new Set(
    pedidos
      .filter(i => i.local_estoque)
      .map(i => { const m = i.local_estoque.match(/^RUA\s+(\d+)/i); return m ? `RUA ${m[1]}` : null; })
      .filter(Boolean)
  )].sort((a, b) => parseInt(a.replace("RUA ", "")) - parseInt(b.replace("RUA ", "")));

  function toggleRua(rua) {
    setRuasSel(prev => prev.includes(rua) ? prev.filter(r => r !== rua) : [...prev, rua]);
  }

  const pedidosFiltrados = pedidos.filter(p =>
    ruasSel.length === 0 ||
    ruasSel.some(r => p.local_estoque?.match(new RegExp(`^RUA\\s+${r.replace("RUA ", "")}\\b`, "i")))
  );
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
        {feedback && (
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${
            feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
          }`}>
            {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">{feedback.msg}</span>
          </div>
        )}

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
              const travadoOutro = g.picking_por && g.picking_por !== user.id;
              const travadoVoce   = g.picking_por && g.picking_por === user.id;
              const cardCls = travadoOutro
                ? "bg-slate-50 ring-1 ring-slate-200 opacity-60 cursor-not-allowed"
                : travadoVoce
                ? "bg-white ring-2 ring-[#7F2D92] hover:ring-[#5B1E74] cursor-pointer"
                : "bg-white ring-1 ring-slate-200 hover:ring-purple-300 hover:bg-purple-50 cursor-pointer";
              return (
                <div key={g.id}
                  onClick={() => { if (!travadoOutro && abrindoId !== g.id) abrirGrupo(g); }}
                  className={`rounded-2xl p-4 text-left transition-all ${cardCls}`}>
                  <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                    <div>
                      <div className="font-black text-slate-800 flex items-center gap-2">
                        Grupo #{g.numero}
                        {g.marketplace && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                            {g.marketplace}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{g.total_pedidos} pedidos · criado em {fmtData(g.criado_em)}</div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {travadoOutro && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200">
                          <Lock className="h-3 w-3" /> Em separação por {g.picking_por_nome || "outro operador"}
                        </span>
                      )}
                      {travadoVoce && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                          <Lock className="h-3 w-3" /> Em separação por você
                        </span>
                      )}
                      <StatusBadge status={g.status} />
                      {abrindoId === g.id && <Loader className="h-4 w-4 animate-spin text-purple-500" />}
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full bg-[#7F2D92] transition-all" style={{ width: `${pctG}%` }} />
                  </div>
                  {travadoOutro && profile?.is_master && (
                    <button onClick={(ev) => handleLiberarTrava(g, ev)}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 transition">
                      <Unlock className="h-3.5 w-3.5" /> Liberar trava (master)
                    </button>
                  )}
                </div>
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

          {conferindo && (
            <div className="mt-4 rounded-2xl ring-1 ring-purple-200 bg-purple-50/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Search className="h-4 w-4 text-[#7F2D92]" />
                <span className="font-bold text-slate-800 text-sm">Confira o aparelho antes de embalar</span>
                <span className="text-xs text-slate-500">#{conferindo.id_anymarket} · IMEI {conferindo.imei_alocado}</span>
              </div>

              <div className="bg-white rounded-xl ring-1 ring-slate-200 px-3 py-2.5 mb-3">
                <div className="text-xs text-slate-500 mb-0.5">Produto do pedido:</div>
                <div className="text-sm font-semibold text-slate-800">{conferindo.titulo_produto}</div>
                <div className="text-xs font-mono text-slate-500 mt-1">SKU: {conferindo.sku_produto}</div>
              </div>

              <div className="space-y-2 mb-3">
                {[
                  { key: "cor",    label: "A cor do aparelho confere" },
                  { key: "modelo", label: "O modelo confere" },
                  { key: "sku",    label: "O SKU confere" },
                ].map(item => (
                  <label key={item.key} className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={checks[item.key]}
                      onChange={e => setChecks(prev => ({ ...prev, [item.key]: e.target.checked }))}
                      className="h-5 w-5 rounded accent-[#7F2D92] cursor-pointer"
                    />
                    {item.label}
                    {!checks[item.key] && <span className="text-xs text-red-500">— não confere</span>}
                  </label>
                ))}
              </div>

              {checks.cor && checks.modelo && checks.sku ? (
                <button onClick={confirmarBipagem}
                  className="w-full flex items-center justify-center gap-2 bg-[#7F2D92] text-white py-2.5 rounded-xl text-sm font-bold hover:bg-[#5B1E74] transition">
                  <CheckCircle className="h-4 w-4" /> Confirmar bipagem
                </button>
              ) : (
                <>
                  <div className="flex items-center gap-2 bg-red-50 text-red-700 rounded-xl px-3 py-2 text-xs font-semibold mb-2 ring-1 ring-red-200">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    Marque tudo que confere. O que ficar desmarcado envia o pedido para análise.
                  </div>
                  <div className="flex gap-2">
                    <button onClick={divergenciaConferencia}
                      className="flex-1 flex items-center justify-center gap-2 bg-red-600 text-white py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition">
                      <ArrowRight className="h-4 w-4" /> Enviar para análise
                    </button>
                    <button onClick={() => { setConferindo(null); inputRef.current?.focus(); }}
                      className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">
                      Cancelar
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

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
          {ruasDisponiveis.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap mb-4">
              <span className="text-xs font-bold text-slate-500 flex items-center gap-1"><MapPin className="h-3 w-3" /> Filtrar por rua:</span>
              <button onClick={() => setRuasSel([])} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${ruasSel.length === 0 ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Todas</button>
              {ruasDisponiveis.map(rua => (
                <button key={rua} onClick={() => toggleRua(rua)} className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${ruasSel.includes(rua) ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{rua}</button>
              ))}
              {ruasSel.length > 0 && <span className="text-xs text-purple-600 font-semibold ml-1">{pedidosFiltrados.filter(p => p.status === "em_picking").length} pendentes nas ruas selecionadas</span>}
            </div>
          )}
          <div className="space-y-2">
            {pedidosFiltrados.map(p => {
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
                    {(p.local_estoque || p.voucher_estoque) && (
                      <div className="flex items-center gap-2 flex-wrap mt-1.5">
                        {p.local_estoque && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                            <MapPin className="h-3.5 w-3.5" /> {p.local_estoque}
                          </span>
                        )}
                        {p.voucher_estoque && (
                          <span className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200">
                            <Ticket className="h-3.5 w-3.5" /> {p.voucher_estoque}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={p.status} />
                    {p.status === "em_picking" && (
                      <button onClick={() => handleNaoLocalizado(p)} disabled={buscandoProximo === p.id}
                        className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200 hover:bg-amber-100 transition whitespace-nowrap disabled:opacity-50">
                        {buscandoProximo === p.id ? "Buscando..." : "Não localizado"}
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
// Opções do modal de resolução de análise. As três divergências corrigem o cadastro
// da peça e devolvem ela ao estoque com o dado certo — por isso o FIFO não repete o erro.
const OPCOES_RESOLUCAO = [
  { key: "localizado",        label: "Localizado",           desc: "Achei o aparelho — segue para embalagem", icon: CheckCircle,   bg: "bg-emerald-600", ring: "ring-emerald-600" },
  { key: "divergencia_cor",   label: "Divergência de cor",   desc: "O cadastro da cor está errado",           icon: Palette,       bg: "bg-[#7F2D92]",   ring: "ring-[#7F2D92]" },
  { key: "divergencia_sku",   label: "Divergência de SKU",   desc: "É outro produto",                          icon: Ticket,        bg: "bg-[#7F2D92]",   ring: "ring-[#7F2D92]" },
  { key: "divergencia_grade", label: "Divergência de grade", desc: "A grade não confere",                      icon: Scale,         bg: "bg-[#7F2D92]",   ring: "ring-[#7F2D92]" },
];

const GRADES_POSSIVEIS = ["Like New", "Excelente", "Muito Bom", "Bom", "Outlet", "Outlet Bateria 70%"];

function TabAnalise() {
  const { user } = useAuth();
  const [pedidos, setPedidos]               = useState([]);
  const [loading, setLoading]               = useState(true);
  const [busca, setBusca]                   = useState("");
  const [modalResolver, setModalResolver]   = useState(null);
  const [novoImei, setNovoImei]             = useState("");
  const [tipoResolucao, setTipoResolucao]   = useState(null);
  const [valorReal, setValorReal]           = useState("");
  const [corLivre, setCorLivre]             = useState("");
  const [prep, setPrep]                     = useState(null);
  const [carregandoPrep, setCarregandoPrep] = useState(false);
  const [feedback, setFeedback]             = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try { setPedidos(await listarEmAnaliseComOpcao()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  // Ao abrir o modal, busca as cores do modelo e a próxima opção do FIFO
  useEffect(() => {
    if (!modalResolver) { setPrep(null); return; }
    let cancelado = false;
    setCarregandoPrep(true);
    prepararResolucaoAnalise(modalResolver)
      .then(r => { if (!cancelado) setPrep(r); })
      .catch(e => { console.error(e); if (!cancelado) setPrep({ peca: null, cores: [], proximo: null }); })
      .finally(() => { if (!cancelado) setCarregandoPrep(false); });
    return () => { cancelado = true; };
  }, [modalResolver]);

  // A cor pode vir do dropdown ou do campo livre ("Outra")
  function valorFinal() {
    if (tipoResolucao === "divergencia_cor" && valorReal === "__outra__") return corLivre.trim();
    return valorReal.trim();
  }

  function podeConfirmar() {
    if (!tipoResolucao) return false;
    if (tipoResolucao === "localizado") return true;
    if (!valorFinal()) return false;
    const imei = novoImei.trim();
    if (!imei) return false;
    // Com sugestão do FIFO, o operador tem que bipar exatamente aquele aparelho
    if (prep?.proximo && imei !== prep.proximo.imei) return false;
    return true;
  }

  async function handleResolver() {
    if (!modalResolver || !tipoResolucao) return;
    try {
      await resolverAnaliseParaEmbalagem(
        modalResolver.id,
        { tipo: tipoResolucao, valorReal: valorFinal(), novoImei: novoImei.trim() },
        user.id
      );
      setPedidos(prev => prev.filter(p => p.id !== modalResolver.id));
      setFeedback({ tipo: "ok", msg: `✓ Pedido #${modalResolver.id_anymarket} resolvido — volta ao picking em um novo grupo.` });
      setTimeout(() => setFeedback(null), 4000);
      fecharModal();
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
      setTimeout(() => setFeedback(null), 5000);
    }
  }

  function fecharModal() {
    setModalResolver(null);
    setTipoResolucao(null);
    setNovoImei("");
    setValorReal("");
    setCorLivre("");
    setPrep(null);
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
          <div className="w-full max-w-md rounded-[28px] bg-white shadow-2xl flex flex-col max-h-[92vh]">
            {/* Cabeçalho fixo */}
            <div className="px-6 pt-6 pb-3 shrink-0">
              <h2 className="text-lg font-black text-slate-800">Resolver Análise</h2>
              <p className="text-xs text-slate-500 mb-3">Pedido #{modalResolver.id_anymarket}</p>
              <div className="bg-slate-50 ring-1 ring-slate-200 rounded-xl px-3 py-2">
                <p className="font-mono font-bold text-sm text-slate-800">{modalResolver.imei_alocado}</p>
                <p className="text-[11px] text-slate-500 leading-tight">{modalResolver.motivo_analise}</p>
              </div>
            </div>

            {/* Corpo rolável — o botão de confirmar fica sempre visível no rodapé */}
            <div className="px-6 overflow-y-auto grow">
            <p className="text-xs font-bold text-slate-600 mb-1.5">O que aconteceu?</p>
            <div className="space-y-1.5 mb-3">
              {OPCOES_RESOLUCAO.map(op => {
                const Icon = op.icon;
                const ativo = tipoResolucao === op.key;
                return (
                  <button key={op.key} onClick={() => { setTipoResolucao(op.key); setValorReal(""); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition ring-1 ${
                      ativo ? `${op.bg} text-white ${op.ring}` : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50"
                    }`}>
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold leading-tight">{op.label}</div>
                      <div className={`text-[11px] leading-tight ${ativo ? "text-white/80" : "text-slate-400"}`}>{op.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            {tipoResolucao && tipoResolucao !== "localizado" && (
              <>
                {/* O que a peça REALMENTE é — corrige o cadastro antes de devolver ao estoque */}
                <div className="mb-3">
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    {tipoResolucao === "divergencia_cor"   && "Qual a cor real do aparelho? *"}
                    {tipoResolucao === "divergencia_sku"   && "Qual o SKU real do aparelho? *"}
                    {tipoResolucao === "divergencia_grade" && "Qual a grade real do aparelho? *"}
                  </label>

                  {tipoResolucao === "divergencia_cor" && (
                    prep?.cores?.length ? (
                      <select value={valorReal} onChange={e => setValorReal(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white">
                        <option value="">Selecione...</option>
                        {prep.cores.map(c => <option key={c} value={c}>{c}</option>)}
                        <option value="__outra__">Outra (digitar)</option>
                      </select>
                    ) : (
                      <input value={valorReal} onChange={e => setValorReal(e.target.value)}
                        placeholder="Ex: Preto"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
                    )
                  )}
                  {tipoResolucao === "divergencia_cor" && valorReal === "__outra__" && (
                    <input value={corLivre} onChange={e => setCorLivre(e.target.value)} autoFocus
                      placeholder="Digite a cor..."
                      className="w-full mt-2 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
                  )}

                  {tipoResolucao === "divergencia_sku" && (
                    <input value={valorReal} onChange={e => setValorReal(e.target.value)}
                      placeholder="Ex: BRZDEV12571"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
                  )}

                  {tipoResolucao === "divergencia_grade" && (
                    <select value={valorReal} onChange={e => setValorReal(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white">
                      <option value="">Selecione...</option>
                      {GRADES_POSSIVEIS.map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                  )}

                  <p className="text-[11px] text-slate-400 mt-1">
                    {prep?.peca && (
                      <>Cadastro atual: <span className="font-semibold text-slate-500">
                        {tipoResolucao === "divergencia_cor"   ? (prep.peca.cor   || "—") :
                         tipoResolucao === "divergencia_sku"   ? (prep.peca.sku   || "—") :
                                                                  (prep.peca.grade || "—")}
                      </span> · será corrigido e a peça volta ao estoque</>
                    )}
                  </p>
                </div>

                {/* Aparelho que vai para o pedido: o FIFO manda, ou o operador informa */}
                {carregandoPrep ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                    <Loader className="h-3.5 w-3.5 animate-spin" /> Procurando outra opção no estoque...
                  </div>
                ) : prep?.proximo ? (
                  <>
                    <div className="bg-emerald-50 ring-1 ring-emerald-200 rounded-xl p-3 mb-3">
                      <p className="text-[11px] font-bold text-emerald-700 flex items-center gap-1 mb-1">
                        <MapPin className="h-3 w-3" /> BUSQUE ESTE APARELHO
                      </p>
                      <p className="font-mono font-bold text-sm text-emerald-800">{prep.proximo.imei}</p>
                      <p className="text-xs text-emerald-700">{prep.proximo.local} · {prep.proximo.grade}</p>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs font-bold text-slate-600 mb-1">Bipe o aparelho que você pegou *</label>
                      <input value={novoImei} onChange={e => setNovoImei(e.target.value)} autoFocus
                        placeholder="Bipe o IMEI..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
                      {novoImei.trim() && novoImei.trim() !== prep.proximo.imei && (
                        <p className="text-[11px] font-semibold text-red-600 mt-1">
                          Este não é o aparelho indicado pelo FIFO. Bipe o {prep.proximo.imei}.
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-start gap-2 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2 mb-3 text-xs text-amber-800">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                      <span>Sem outra opção no FIFO para este produto. Informe o aparelho que será usado.</span>
                    </div>
                    <div className="mb-3">
                      <label className="block text-xs font-bold text-slate-600 mb-1">IMEI do aparelho que você vai usar *</label>
                      <input value={novoImei} onChange={e => setNovoImei(e.target.value)} autoFocus
                        placeholder="Bipe ou digite o IMEI..."
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
                    </div>
                  </>
                )}
              </>
            )}

            </div>

            {/* Rodapé fixo */}
            <div className="flex gap-2 px-6 py-4 shrink-0 border-t border-slate-100">
              <button onClick={handleResolver}
                disabled={!podeConfirmar()}
                className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-[13px] font-bold text-white hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                Confirmar — segue para embalagem
              </button>
              <button onClick={fecharModal}
                className="px-4 rounded-xl bg-slate-100 py-2.5 text-[13px] font-bold text-slate-600 hover:bg-slate-200 transition">
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
                      {p.temOpcaoFifo && (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 ring-1 ring-emerald-300">
                          <CheckCircle className="h-3 w-3" /> Opção disponível no FIFO
                        </span>
                      )}
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
}// ══════════════════════════════════════════════════════════
// ABA FATURAMENTO
// ══════════════════════════════════════════════════════════
function TabFaturamento() {
  const { user, profile } = useAuth();
  const [grupos, setGrupos]                 = useState([]);
  const [loading, setLoading]               = useState(true);
  const [baixando, setBaixando]             = useState(null);
  const [subindo, setSubindo]               = useState(null);
  const [feedback, setFeedback]             = useState({});
  const [expandido, setExpandido]           = useState(null);
  const [pedidosGrupo, setPedidosGrupo]     = useState({});
  const [loadingPedidos, setLoadingPedidos] = useState(null);
  const [histAberto, setHistAberto]         = useState(null);
  const [pendencias, setPendencias]         = useState({});
  const [avisosSku, setAvisosSku]           = useState({});
  const inputRefs = useRef({});

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try { setGrupos(await listarGruposFaturamento()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleVerPedidos(grupo) {
    if (expandido === grupo.id) { setExpandido(null); return; }
    setExpandido(grupo.id);
    if (!pedidosGrupo[grupo.id]) {
      setLoadingPedidos(grupo.id);
      try {
        const data = await listarPedidosGrupo(grupo.id);
        setPedidosGrupo(prev => ({ ...prev, [grupo.id]: data }));
      } catch (e) { console.error(e); }
      finally { setLoadingPedidos(null); }
    }
  }

  async function handleBaixar(grupo) {
    setBaixando(grupo.id);
    setFeedback(prev => ({ ...prev, [grupo.id]: null }));
    try {
      const res = await gerarPlanilhaFaturamentoGrupo(grupo.id, user.id, profile?.nome);
      if (!res.ok) {
        setFeedback(prev => ({ ...prev, [grupo.id]: { tipo: "erro", msg: res.erro } }));
      } else {
        setFeedback(prev => ({ ...prev, [grupo.id]: { tipo: "ok", msg: `✓ Planilha gerada — ${res.total} linha${res.total > 1 ? "s" : ""} (${res.nomeArquivo})` } }));
        const agora = new Date().toISOString();
        const novoDl = { usuario_nome: profile?.nome || "você", total_linhas: res.total, baixado_em: agora };
        setGrupos(prev => prev.map(x => x.id === grupo.id
          ? { ...x,
              baixado_por: user.id, baixado_por_nome: profile?.nome || "você", baixado_em: agora,
              downloads: [novoDl, ...(x.downloads || [])],
              totalDownloads: (x.totalDownloads || 0) + 1 }
          : x));
      }
    } catch (e) {
      setFeedback(prev => ({ ...prev, [grupo.id]: { tipo: "erro", msg: e.message } }));
    } finally { setBaixando(null); }
  }

  async function handleSubir(grupo, file) {
    if (!file) return;
    setSubindo(grupo.id);
    setFeedback(prev => ({ ...prev, [grupo.id]: null }));
    setPendencias(prev => ({ ...prev, [grupo.id]: null }));
    setAvisosSku(prev => ({ ...prev, [grupo.id]: null }));
    try {
      // XML/ZIP casa pelo IMEI (dentro da NF-e); planilha casa pelo ID_PEDIDO.
      const ehXml = /\.(zip|xml)$/i.test(file.name);
      const res = ehXml
        ? await importarNFsXmlGrupo(file, grupo.id, user.id)
        : await importarNFsGrupo(file, grupo.id, user.id);

      const partes = [`${res.faturados} pedido${res.faturados !== 1 ? "s" : ""} faturado${res.faturados !== 1 ? "s" : ""}`];
      if (ehXml) {
        partes.unshift(`${res.totalXmls} XML${res.totalXmls !== 1 ? "s" : ""} lido${res.totalXmls !== 1 ? "s" : ""}`);
        if (res.ignorados?.length) partes.push(`${res.ignorados.length} pendente${res.ignorados.length > 1 ? "s" : ""}`);
        if (res.avisos?.length) partes.push(`${res.avisos.length} com SKU divergente`);
        setPendencias(prev => ({ ...prev, [grupo.id]: res.ignorados || [] }));
        setAvisosSku(prev => ({ ...prev, [grupo.id]: res.avisos || [] }));
      } else {
        if (res.semNF > 0)     partes.push(`${res.semNF} linha${res.semNF > 1 ? "s" : ""} sem NF`);
        if (res.ignorados > 0) partes.push(`${res.ignorados} ignorada${res.ignorados > 1 ? "s" : ""}`);
      }
      const msg = (res.grupoConcluido ? "✓ Grupo concluído! " : "✓ ") + partes.join(" · ");
      setFeedback(prev => ({ ...prev, [grupo.id]: { tipo: res.grupoConcluido ? "ok" : "aviso", msg } }));
      setPedidosGrupo(prev => { const n = { ...prev }; delete n[grupo.id]; return n; });
      setExpandido(null);
      carregar();
    } catch (e) {
      setFeedback(prev => ({ ...prev, [grupo.id]: { tipo: "erro", msg: e.message } }));
    } finally {
      setSubindo(null);
      if (inputRefs.current[grupo.id]) inputRefs.current[grupo.id].value = "";
    }
  }

  // Contadores: quantos grupos já foram baixados para emissão de NF e quantos não
  const gruposBaixados    = grupos.filter(g => (g.totalDownloads || 0) > 0).length;
  const gruposNaoBaixados = grupos.length - gruposBaixados;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Baixe a planilha do grupo e suba as NFs: os XMLs da NF-e (.zip ou .xml) casam pelo IMEI, ou a planilha com a coluna NUMERO_NF preenchida.</p>
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {grupos.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <KpiMini label="Grupos a faturar"      value={fmtN(grupos.length)}      color="bg-slate-50 ring-slate-200 text-slate-700" />
          <KpiMini label="Baixados para NF"      value={fmtN(gruposBaixados)}     color="bg-blue-50 ring-blue-200 text-blue-700" />
          <KpiMini label="Aguardando download"   value={fmtN(gruposNaoBaixados)}  color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : grupos.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <FileText className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhum grupo aguardando faturamento.</p>
          <p className="text-xs mt-1">Os grupos aparecem aqui quando o picking é concluído.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map(g => {
            const fb = feedback[g.id];
            const aberto = expandido === g.id;
            const lista = pedidosGrupo[g.id] || [];
            const aFaturar = lista.filter(p => p.status === "embalado");
            const emAnalise = lista.filter(p => p.status === "em_analise");
            const ultimoDl = g.downloads?.[0];
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                  <div className="min-w-0">
                    <div className="font-black text-slate-800">Grupo #{g.numero}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      <span className="font-semibold text-slate-600">{g.aFaturar} a faturar</span>
                      <span className="font-bold text-emerald-700"> · {fmtR(g.valorAFaturar)}</span>
                      {g.emAnalise > 0 && <span className="text-orange-600"> · {g.emAnalise} em análise</span>}
                      {g.faturados > 0 && <span className="text-emerald-600"> · {g.faturados} faturado{g.faturados > 1 ? "s" : ""}</span>}
                    </div>
                    {g.marketplaces?.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                        {g.marketplaces.map(mp => (
                          <span key={mp.nome} className="inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                            {mp.nome} · {mp.qtd}
                          </span>
                        ))}
                      </div>
                    )}
                    {g.totalDownloads > 0 ? (
                      <button onClick={() => setHistAberto(histAberto === g.id ? null : g.id)}
                        className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 ring-1 ring-blue-200 hover:bg-blue-100 transition">
                        <Download className="h-3 w-3" />
                        Baixado {g.totalDownloads}x{ultimoDl ? ` · último por ${ultimoDl.usuario_nome} · ${fmtData(ultimoDl.baixado_em)}` : ""}
                        {histAberto === g.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                      </button>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
                        <Download className="h-3 w-3" /> Não baixado
                      </div>
                    )}
                    {histAberto === g.id && g.downloads?.length > 0 && (
                      <div className="mt-2 space-y-1 bg-slate-50 rounded-xl p-2.5 ring-1 ring-slate-200">
                        <p className="text-xs font-bold text-slate-500 mb-1">Histórico de downloads</p>
                        {g.downloads.map((d, i) => (
                          <div key={i} className="text-xs text-slate-600 flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{d.usuario_nome || "—"}</span>
                            <span className="text-slate-400">{fmtData(d.baixado_em)}</span>
                            {d.total_linhas != null && <span className="text-slate-400">· {d.total_linhas} linha{d.total_linhas !== 1 ? "s" : ""}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200 shrink-0">Aguardando NF</span>
                </div>

                <div className="flex gap-2 flex-wrap items-center">
                  <button onClick={() => handleBaixar(g)} disabled={baixando === g.id || g.aFaturar === 0}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] transition disabled:opacity-40">
                    {baixando === g.id ? <div className="h-3 w-3 border-2 border-purple-200 border-t-white rounded-full animate-spin" /> : <Download className="h-3 w-3" />}
                    {g.totalDownloads > 0 ? "Baixar novamente" : "Baixar planilha"} ({g.aFaturar})
                  </button>
                  <label className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl ring-1 transition ${
                    subindo === g.id ? "bg-blue-50 text-blue-400 ring-blue-200 opacity-60 cursor-pointer" :
                    "bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100 cursor-pointer"
                  }`}>
                    {subindo === g.id ? <div className="h-3 w-3 border-2 border-blue-300 border-t-blue-700 rounded-full animate-spin" /> : <Upload className="h-3 w-3" />}
                    Subir NFs
                    <input type="file" accept=".xlsx,.xls,.zip,.xml" className="hidden"
                      ref={el => inputRefs.current[g.id] = el}
                      disabled={subindo === g.id}
                      onChange={e => handleSubir(g, e.target.files?.[0])} />
                  </label>
                  <button onClick={() => handleVerPedidos(g)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 transition">
                    {aberto ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    Ver pedidos
                  </button>
                </div>

                {aberto && (
                  <div className="mt-3 border-t border-slate-100 pt-3">
                    {loadingPedidos === g.id ? (
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <Loader className="h-4 w-4 animate-spin text-purple-500" /> Carregando pedidos...
                      </div>
                    ) : (
                      <>
                        <p className="text-xs font-bold text-slate-500 mb-2">Pedidos a faturar ({aFaturar.length})</p>
                        <div className="space-y-1.5">
                          {aFaturar.map(p => (
                            <div key={p.id} className="flex items-center justify-between gap-3 bg-slate-50 rounded-lg px-3 py-2">
                              <div className="min-w-0">
                                <div className="text-xs text-slate-700"><span className="font-bold">#{p.id_anymarket}</span> <span className="text-slate-400">· {p.marketplace}</span></div>
                                <div className="text-xs text-slate-500 font-mono truncate">{p.imei_bipado || p.imei_alocado} · {p.cliente}</div>
                              </div>
                              <span className="text-xs font-bold text-emerald-700 shrink-0">{fmtR(p.total_do_pedido)}</span>
                            </div>
                          ))}
                        </div>
                        {emAnalise.length > 0 && (
                          <>
                            <p className="text-xs font-bold text-orange-600 mt-3 mb-2">Em análise — fora da planilha ({emAnalise.length})</p>
                            <div className="space-y-1.5">
                              {emAnalise.map(p => (
                                <div key={p.id} className="flex items-center justify-between gap-3 bg-orange-50 ring-1 ring-orange-200 rounded-lg px-3 py-2">
                                  <div className="min-w-0">
                                    <div className="text-xs text-orange-700"><span className="font-bold">#{p.id_anymarket}</span> <span>· {p.marketplace}</span></div>
                                    <div className="text-xs text-orange-600 font-mono truncate">{p.imei_alocado} · {p.motivo_analise || "não localizado"}</div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}

                {fb && (
                  <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${
                    fb.tipo === "ok"    ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                    fb.tipo === "aviso" ? "bg-amber-50 text-amber-700 ring-amber-200" :
                    "bg-red-50 text-red-700 ring-red-200"
                  }`}>
                    {fb.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                    <span className="font-semibold">{fb.msg}</span>
                  </div>
                )}

                {/* Detalhe das NFs que não puderam ser faturadas (upload de XML) */}
                {pendencias[g.id]?.length > 0 && (
                  <div className="mt-2 rounded-xl bg-amber-50 ring-1 ring-amber-200 p-3">
                    <p className="text-xs font-bold text-amber-800 mb-1.5">
                      NFs não faturadas ({pendencias[g.id].length}) — verifique antes de reenviar
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {pendencias[g.id].map((p, i) => (
                        <div key={i} className="text-xs text-amber-900 flex flex-wrap items-center gap-x-2">
                          {p.nf && <span className="font-bold">NF {p.nf}</span>}
                          {p.imei && <span className="font-mono">{p.imei}</span>}
                          {p.pedido && <span className="text-amber-700">#{p.pedido}</span>}
                          <span className="text-amber-700">— {p.motivo}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* SKU da NF diferente do alocado — faturado pelo IMEI, mas vale conferir */}
                {avisosSku[g.id]?.length > 0 && (
                  <div className="mt-2 rounded-xl bg-blue-50 ring-1 ring-blue-200 p-3">
                    <p className="text-xs font-bold text-blue-800 mb-1.5">
                      Faturados com SKU divergente ({avisosSku[g.id].length}) — esperado em troca de aparelho ou substituto
                    </p>
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {avisosSku[g.id].map((p, i) => (
                        <div key={i} className="text-xs text-blue-900 flex flex-wrap items-center gap-x-2">
                          {p.nf && <span className="font-bold">NF {p.nf}</span>}
                          {p.imei && <span className="font-mono">{p.imei}</span>}
                          {p.pedido && <span className="text-blue-700">#{p.pedido}</span>}
                          <span className="text-blue-700">— {p.motivo}</span>
                        </div>
                      ))}
                    </div>
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
// ABA AGUARDANDO DEFINIÇÃO DE PRODUTO
// ══════════════════════════════════════════════════════════
function TabAguardandoDefinicao() {
  const { user } = useAuth();
  const [pedidos, setPedidos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [feedback, setFeedback] = useState(null);
  const [baixando, setBaixando] = useState(null);
  const [modalDef, setModalDef] = useState(null);
  const [mesmoSku, setMesmoSku] = useState(true);
  const [novoSku, setNovoSku]   = useState("");
  const [novaGrade, setNovaGrade] = useState("Excelente");
  const [imeiDef, setImeiDef]   = useState("");
  const [skuCheck, setSkuCheck] = useState(null);
  const [salvando, setSalvando] = useState(false);
  const [aba, setAba]           = useState("pendentes");
  const [concluidos, setConcluidos] = useState([]);
  const [cancelados, setCancelados] = useState([]);
  const [modalCancel, setModalCancel] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [pend, conc, canc] = await Promise.all([
        listarPedidosAguardandoDefinicao(),
        listarDefinicaoConcluidos(),
        listarDefinicaoCancelados(),
      ]);
      setPedidos(pend); setConcluidos(conc); setCancelados(canc);
    }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleCancelar() {
    if (!modalCancel) return;
    setCancelando(true);
    try {
      await cancelarPedidoDefinicao(modalCancel.id, user.id);
      setFeedback({ tipo: "ok", msg: `Pedido #${modalCancel.id_anymarket} cancelado.` });
      setTimeout(() => setFeedback(null), 4000);
      setModalCancel(null);
      carregar();
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setCancelando(false); }
  }

  async function handleBaixarPdf(p) {
    setBaixando(p.id);
    try { await gerarPdfSemProduto(p); }
    catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setBaixando(null); }
  }

  function abrirModal(p) {
    setModalDef(p);
    setMesmoSku(true);
    setNovoSku("");
    setNovaGrade(p.grade_produto || "Excelente");
    setImeiDef("");
    setSkuCheck(null);
  }

  function fecharModal() { setModalDef(null); }

  async function checarSku(valor, grade) {
    setNovoSku(valor);
    if (!valor.trim()) { setSkuCheck(null); return; }
    try { setSkuCheck(await validarSkuDefinicao(valor, grade ?? novaGrade)); }
    catch { setSkuCheck(null); }
  }

  async function trocarGrade(grade) {
    setNovaGrade(grade);
    if (!novoSku.trim()) return;
    try { setSkuCheck(await validarSkuDefinicao(novoSku, grade)); }
    catch { setSkuCheck(null); }
  }

  async function handleConcluir() {
    if (!modalDef) return;
    if (!mesmoSku) {
      if (!novoSku.trim() || !novaGrade.trim()) {
        setFeedback({ tipo: "erro", msg: "Informe o novo SKU e a nova grade." });
        return;
      }
      if (!skuCheck?.existe) {
        setFeedback({ tipo: "erro", msg: "SKU não encontrado no estoque. Confira o código." });
        return;
      }
    }
    setSalvando(true);
    try {
      const res = await definirProduto(modalDef.id,
        { mesmoSku, novoSku, novaGrade, imei: imeiDef }, user.id);
      setPedidos(prev => prev.filter(x => x.id !== modalDef.id));
      setFeedback({ tipo: "ok", msg: res.alocadoDireto
        ? `✓ Pedido #${modalDef.id_anymarket} alocado direto no IMEI ${imeiDef.trim()} — aguardando grupo.`
        : `✓ Pedido #${modalDef.id_anymarket} devolvido para alocação${mesmoSku ? "" : " com novo SKU"}.` });
      setTimeout(() => setFeedback(null), 4000);
      fecharModal();
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-slate-500">Pedidos sem aparelho disponível — aguardando a Assurant indicar um substituto.</p>
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {feedback && (
        <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
          {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
          <span className="font-semibold">{feedback.msg}</span>
        </div>
      )}

      <div className="flex gap-1 mb-4 border-b border-slate-200">
        {[
          { k: "pendentes",  label: "Pendentes",  n: pedidos.length },
          { k: "concluidos", label: "Concluídos", n: concluidos.length },
          { k: "cancelados", label: "Cancelados", n: cancelados.length },
        ].map(t => (
          <button key={t.k} onClick={() => setAba(t.k)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${aba === t.k ? "border-[#7F2D92] text-[#7F2D92]" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            {t.label} <span className={`text-xs px-1.5 py-0.5 rounded-full ml-1 ${aba === t.k ? "bg-purple-100 text-[#7F2D92]" : "bg-slate-100 text-slate-500"}`}>{fmtN(t.n)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : aba === "pendentes" ? (
        pedidos.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido aguardando definição de produto.</p>
          </div>
        ) : (
        <div className="space-y-3">
          <p className="text-xs text-slate-500 font-semibold">{fmtN(pedidos.length)} pedido{pedidos.length > 1 ? "s" : ""} aguardando definição</p>
          {pedidos.map(p => (
            <Card key={p.id} className="ring-1 ring-amber-200">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                    <span className="text-xs text-slate-400">{p.marketplace}</span>
                    <GradeBadge grade={p.grade_produto} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 truncate">{p.titulo_produto}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-xs text-slate-500 font-mono">{p.sku_produto}</span>
                    <span className="text-xs font-bold text-emerald-700">{fmtR(p.total_do_pedido)}</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">{p.cliente}</p>
                  {p.definicao_solicitada_em && (
                    <p className="text-xs text-amber-600 font-semibold mt-1">
                      Aguardando desde {fmtData(p.definicao_solicitada_em)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => handleBaixarPdf(p)} disabled={baixando === p.id}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-slate-50 text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 transition disabled:opacity-50">
                    {baixando === p.id ? <div className="h-3 w-3 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    Baixar PDF
                  </button>
                  <button onClick={() => abrirModal(p)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition">
                    <CornerUpLeft className="h-3.5 w-3.5" />
                    Definir produto
                  </button>
                  <button onClick={() => setModalCancel(p)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition">
                    <Ban className="h-3.5 w-3.5" />
                    Pedido cancelado
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
        )
      ) : aba === "concluidos" ? (
        concluidos.length === 0 ? (
          <div className="text-center py-12 text-slate-400"><CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum pedido definido ainda.</p></div>
        ) : (
        <div className="space-y-2">
          {concluidos.map(p => (
            <Card key={p.id} className="ring-1 ring-emerald-100">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                    <span className="text-xs text-slate-400">{p.marketplace}</span>
                    <StatusBadge status={p.status} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 truncate">{p.titulo_produto}</p>
                  {p.definicao_resumo && <p className="text-xs text-emerald-700 font-semibold mt-1">{p.definicao_resumo}</p>}
                  {p.definicao_resolvido_em && <p className="text-xs text-slate-400 mt-0.5">Definido em {fmtData(p.definicao_resolvido_em)}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
        )
      ) : (
        cancelados.length === 0 ? (
          <div className="text-center py-12 text-slate-400"><Ban className="h-8 w-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nenhum pedido cancelado.</p></div>
        ) : (
        <div className="space-y-2">
          {cancelados.map(p => (
            <Card key={p.id} className="ring-1 ring-red-100">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-slate-800 text-sm">#{p.id_anymarket}</span>
                    <span className="text-xs text-slate-400">{p.marketplace}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-lg bg-red-100 text-red-700">Cancelado</span>
                  </div>
                  <p className="text-sm font-semibold text-slate-700 truncate">{p.titulo_produto}</p>
                  {p.definicao_resolvido_em && <p className="text-xs text-slate-400 mt-0.5">Cancelado em {fmtData(p.definicao_resolvido_em)}</p>}
                </div>
              </div>
            </Card>
          ))}
        </div>
        )
      )}

      {modalDef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={fecharModal}>
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-black text-slate-800 text-base">Definir produto</h3>
              <button onClick={fecharModal} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Pedido #{modalDef.id_anymarket} · {modalDef.marketplace} · {modalDef.titulo_produto}</p>

            <div className="bg-slate-50 rounded-xl px-3 py-2.5 mb-4">
              <span className="text-xs text-slate-400">Original do cliente</span>
              <div className="text-xs font-mono text-slate-600 mt-0.5">{modalDef.sku_produto} · {modalDef.grade_produto}</div>
            </div>

            <label className="block text-xs font-bold text-slate-700 mb-2">É o mesmo SKU?</label>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setMesmoSku(true)}
                className={`flex-1 text-sm font-semibold py-2 rounded-xl transition ${mesmoSku ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Sim</button>
              <button onClick={() => setMesmoSku(false)}
                className={`flex-1 text-sm font-semibold py-2 rounded-xl transition ${!mesmoSku ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>Não</button>
            </div>

            {!mesmoSku && (
              <div className="border-t border-slate-100 pt-4 mb-4">
                <label className="block text-xs text-slate-600 mb-1">Novo SKU</label>
                <input value={novoSku} onChange={e => checarSku(e.target.value)} placeholder="Ex: BRZDEV12643"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-1 focus:ring-2 focus:ring-purple-200 outline-none" />
                {skuCheck && (skuCheck.existe
                  ? <div className="mb-3">
                      <div className="text-xs text-emerald-700 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> {skuCheck.modelo}</div>
                      {skuCheck.gradeExata !== undefined && (
                        <div className="text-xs text-slate-500 mt-0.5 pl-4">
                          <span className="font-semibold text-emerald-700">{skuCheck.gradeExata}</span> em {novaGrade}
                          {skuCheck.gradeAcima > 0 && <> · <span className="font-semibold text-slate-600">{skuCheck.gradeAcima}</span> em grade superior</>}
                        </div>
                      )}
                    </div>
                  : <div className="text-xs text-red-600 flex items-center gap-1 mb-3"><AlertTriangle className="h-3 w-3" /> SKU não encontrado no estoque</div>)}

                <label className="block text-xs text-slate-600 mb-1">Nova grade</label>
                <select value={novaGrade} onChange={e => trocarGrade(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-1 focus:ring-2 focus:ring-purple-200 outline-none">
                  <option>Like New</option>
                  <option>Excelente</option>
                  <option>Muito Bom</option>
                  <option>Bom</option>
                  <option>Outlet</option>
                </select>
              </div>
            )}

            <label className="block text-xs text-slate-600 mb-1">IMEI <span className="text-slate-400">(opcional)</span></label>
            <input value={imeiDef} onChange={e => setImeiDef(e.target.value)} placeholder="Bipe ou digite o IMEI"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm mb-1.5 focus:ring-2 focus:ring-purple-200 outline-none" />
            <p className="text-xs text-slate-400 mb-5 leading-relaxed">
              Com IMEI: aloca direto neste aparelho, aguarda formar grupo.<br />
              Sem IMEI: volta para alocação e o FIFO sugere pelo SKU{mesmoSku ? "" : " novo"}.
            </p>

            <div className="flex gap-2 justify-end">
              <button onClick={fecharModal} className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Cancelar</button>
              <button onClick={handleConcluir} disabled={salvando}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-[#7F2D92] text-white hover:bg-[#6d2680] transition disabled:opacity-50 flex items-center gap-2">
                {salvando && <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                Concluir definição
              </button>
            </div>
          </div>
        </div>
      )}

      {modalCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onClick={() => setModalCancel(null)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h3 className="font-black text-slate-800 text-base">Cancelar pedido?</h3>
            </div>
            <p className="text-sm text-slate-500 mb-5 leading-relaxed">
              O pedido #{modalCancel.id_anymarket} vai para a aba Cancelados. Se houver aparelho reservado, ele volta ao estoque. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModalCancel(null)}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200 transition">Voltar</button>
              <button onClick={handleCancelar} disabled={cancelando}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition disabled:opacity-50 flex items-center gap-2">
                {cancelando && <div className="h-3 w-3 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                Cancelar pedido
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
// Emails com acesso à aba de comparativo de aging. Preencha com os endereços certos.
const EMAILS_COMPARATIVO = [
  "SEU_EMAIL_AQUI@liquidapreco.com.br",
  "EMAIL_DO_JHONATAN_AQUI@liquidapreco.com.br",
];

function TabComparativoAging() {
  const [linhas, setLinhas]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);
  const [soAlertas, setSoAlertas] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true); setErro(null);
    try { setLinhas(await buscarComparativoAging()); }
    catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  }

  const visiveis = soAlertas ? linhas.filter(l => l.alerta) : linhas;
  const totalAlertas = linhas.filter(l => l.alerta).length;

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex items-start gap-3">
          <Scale className="h-5 w-5 text-[#7F2D92] shrink-0 mt-0.5" />
          <div className="text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Aparelhos sem subinv que o FIFO não sugere</p>
            <p className="text-xs mt-1 leading-relaxed">
              O FIFO só sugere peças com subinv. Aqui você vê, por pedido, o aparelho selecionado
              comparado com a alternativa mais velha <span className="font-semibold">sem</span> subinv.
              A idade do selecionado vem do subinv; a da alternativa, da coluna aging da triagem —
              são fontes diferentes, então a comparação é aproximada. Só destacamos diferenças de
              {" "}{30} dias ou mais.
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiMini label="Pedidos com alternativa" value={fmtN(linhas.length)} color="bg-slate-50 ring-slate-200 text-slate-700" />
        <KpiMini label="Com peça +velha (30d+)"   value={fmtN(totalAlertas)} color="bg-amber-50 ring-amber-200 text-amber-700" />
        <KpiMini label="Margem de erro média"     value="±6d"                color="bg-slate-50 ring-slate-200 text-slate-700" />
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setSoAlertas(s => !s)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
            soAlertas ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}>
          <AlertTriangle className="h-4 w-4" />
          {soAlertas ? "Mostrando só alertas" : "Só peças mais velhas"}
        </button>
        <button onClick={carregar} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">
          <RefreshCw className="h-4 w-4" /> Recarregar
        </button>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-8 justify-center">
          <Loader className="h-4 w-4 animate-spin" /> Calculando comparativo…
        </div>
      )}
      {erro && <Card className="text-sm text-red-600">Erro: {erro}</Card>}

      {!loading && !erro && visiveis.length === 0 && (
        <Card className="text-sm text-slate-500 text-center py-8">
          Nenhum pedido com alternativa sem subinv{soAlertas ? " acima da margem" : ""}.
        </Card>
      )}

      {!loading && !erro && visiveis.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 text-left">
                <th className="px-3 py-2 font-semibold">Pedido</th>
                <th className="px-3 py-2 font-semibold">Selecionado (FIFO)</th>
                <th className="px-3 py-2 font-semibold text-center">Idade</th>
                <th className="px-3 py-2 font-semibold">Alternativa (sem subinv)</th>
                <th className="px-3 py-2 font-semibold text-center">Aging</th>
                <th className="px-3 py-2 font-semibold text-center">Situação</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((l, i) => (
                <tr key={`${l.pedido}-${i}`} className={`border-b border-slate-100 ${l.alerta ? "bg-amber-50" : ""}`}>
                  <td className="px-3 py-2 font-medium text-slate-700">{l.pedido}</td>
                  <td className="px-3 py-2">
                    {l.sel_imei ? (
                      <>
                        <div className="text-slate-700">{l.sel_imei}</div>
                        <div className="text-xs text-slate-500">{l.sel_grade} · subinv {fmtDataCurta(l.sel_subinv)}</div>
                      </>
                    ) : <span className="text-xs text-slate-400">nenhum com subinv</span>}
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{l.sel_idade != null ? `${l.sel_idade}d` : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="text-slate-700">{l.alt_imei}</div>
                    <div className="text-xs text-slate-500">{l.alt_grade} · {l.alt_local || "sem local"}</div>
                  </td>
                  <td className="px-3 py-2 text-center font-medium text-slate-700">{l.alt_aging}d</td>
                  <td className="px-3 py-2 text-center">
                    {l.alerta ? (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-1 rounded-md text-xs font-semibold">
                        <Clock3 className="h-3 w-3" /> +{l.diff_dias}d mais velha
                      </span>
                    ) : l.diff_dias != null ? (
                      <span className="text-xs text-slate-400">
                        {l.diff_dias >= 0 ? `+${l.diff_dias}d · dentro da margem` : "alternativa +nova"}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400">sem selecionado p/ comparar</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}

function fmtDataCurta(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function PedidosB2CPage() {
  const { profile, user } = useAuth();
  const [aba, setAba]   = useState("alocacao");
  const [kpis, setKpis] = useState(null);

  useEffect(() => { recarregarKpis(); }, []);

  async function recarregarKpis() {
    buscarKpisPedidosB2C().then(setKpis).catch(console.error);
  }

  // Acesso à aba de comparativo: master OU email na allowlist
  const emailUsuario = (user?.email || "").toLowerCase();
  const podeVerComparativo =
    profile?.is_master ||
    EMAILS_COMPARATIVO.map(e => e.toLowerCase()).includes(emailUsuario);

  const ABAS = [
    { key: "alocacao",    label: "Alocação",    icon: Layers        },
    { key: "picking",     label: "Picking",     icon: Search        },
    { key: "analise",     label: "Em Análise",  icon: AlertTriangle },
    { key: "definicao",   label: "Aguardando Definição", icon: HelpCircle },
    { key: "faturamento", label: "Faturamento", icon: FileText      },
    ...(podeVerComparativo
      ? [{ key: "comparativo", label: "Comparativo Aging", icon: Scale }]
      : []),
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
      {aba === "definicao"   && <TabAguardandoDefinicao />}
      {aba === "faturamento" && <TabFaturamento />}
      {aba === "comparativo" && podeVerComparativo && <TabComparativoAging />}
    </div>
  );
}