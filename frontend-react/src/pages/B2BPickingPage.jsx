import { useState, useEffect, useRef } from "react";
import {
  Upload, Search, CheckCircle, AlertTriangle,
  Download, Package, ChevronDown, X, BarChart3
} from "lucide-react";
import {
  importarPedidoB2B, listarPedidosB2B,
  listarItens, registrarBipagem, exportarFaturamento
} from "../services/b2bService.js";
import { useAuth } from "../AuthContext.jsx";

function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtR(v) { return v ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"; }

// ── Componentes base ──────────────────────────────────────
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
    aberto:    { label: "Em aberto",  cls: "bg-blue-50 text-blue-700 ring-blue-200" },
    concluido: { label: "Concluído",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    pendente:  { label: "Pendente",   cls: "bg-slate-50 text-slate-500 ring-slate-200" },
    bipado:    { label: "Bipado",     cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  };
  const s = map[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ring-1 ${s.cls}`}>
      {s.label}
    </span>
  );
}

// ── Progress bar ──────────────────────────────────────────
function ProgressBar({ value, total }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-slate-500">
        <span>{fmtN(value)} de {fmtN(total)} bipados</span>
        <span className="font-bold">{pct}%</span>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct === 100 ? "#1D9E75" : "#7F2D92",
          }}
        />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 1 — IMPORTAR PEDIDO
// ══════════════════════════════════════════════════════════
function TabImportar({ onImportado }) {
  const { user } = useAuth();
  const [file, setFile]         = useState(null);
  const [loading, setLoading]   = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro]         = useState("");

  async function handleImportar() {
    if (!file) return;
    setLoading(true);
    setErro("");
    setResultado(null);
    try {
      const res = await importarPedidoB2B(file, user.id);
      setResultado(res);
      onImportado?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <Card>
        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4">
          <Upload className="h-4 w-4 text-[#7F2D92]" />
          Importar Planilha de Picking
        </h3>

        <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center hover:border-purple-300 transition-colors">
          <Upload className="h-8 w-8 text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-600 mb-1">
            Arraste a planilha ou clique para selecionar
          </p>
          <p className="text-xs text-slate-400 mb-4">
            Formato: PICKING_*.xlsx — planilha que chega por e-mail da Assurant
          </p>
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={e => { setFile(e.target.files?.[0] || null); setResultado(null); setErro(""); }}
            className="block w-full text-sm text-slate-600"
          />
          {file && (
            <p className="mt-3 text-xs font-semibold text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg">
              📄 {file.name}
            </p>
          )}
        </div>

        <button
          onClick={handleImportar}
          disabled={!file || loading}
          className="mt-4 w-full flex items-center justify-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-[#5B1E74] transition disabled:opacity-50"
        >
          {loading
            ? <><div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Importando...</>
            : <><Upload className="h-4 w-4" /> Importar Pedido</>
          }
        </button>

        {erro && (
          <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            {erro}
          </div>
        )}

        {resultado && (
          <div className="mt-4 bg-emerald-50 ring-1 ring-emerald-200 rounded-xl p-4 space-y-2">
            <div className="flex items-center gap-2 font-bold text-emerald-700">
              <CheckCircle className="h-4 w-4" />
              Pedido importado com sucesso!
            </div>
            <div className="text-sm text-emerald-600 space-y-1">
              <p><span className="font-semibold">Lote:</span> {resultado.lote}</p>
              <p><span className="font-semibold">Cliente:</span> {resultado.cliente}</p>
              <p><span className="font-semibold">Total de itens:</span> {fmtN(resultado.total)}</p>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h3 className="font-black text-slate-800 text-sm mb-3">Instruções</h3>
        <ol className="space-y-2 text-xs text-slate-500 list-decimal list-inside">
          <li>Salve a planilha de picking recebida por e-mail da Assurant</li>
          <li>Selecione o arquivo no campo acima</li>
          <li>Clique em Importar — o sistema valida e carrega todos os IMEIs</li>
          <li>Vá para a aba Picking para iniciar a separação</li>
          <li>Ao finalizar, exporte a lista para o sistema de faturamento</li>
        </ol>
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 2 — PICKING (bipar)
// ══════════════════════════════════════════════════════════
function TabPicking({ pedidos }) {
  const { user }                = useAuth();
  const [pedidoSel, setPedido]  = useState(null);
  const [itens, setItens]       = useState([]);
  const [loading, setLoading]   = useState(false);
  const [imeiInput, setImei]    = useState("");
  const [feedback, setFeedback] = useState(null);
  const [filtro, setFiltro]     = useState("todos");
  const [busca, setBusca]       = useState("");
  const inputRef                = useRef(null);

  useEffect(() => {
    if (pedidoSel) carregarItens();
  }, [pedidoSel]);

  useEffect(() => {
    if (pedidoSel) inputRef.current?.focus();
  }, [pedidoSel]);

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
      setFeedback({ tipo: "ok", msg: `✓ IMEI ${imeiInput.trim()} bipado com sucesso!`, item: res.item });
      // Atualizar item localmente
      setItens(prev => prev.map(i =>
        i.imei === imeiInput.trim()
          ? { ...i, status: "bipado", bipado_em: new Date().toISOString() }
          : i
      ));
      // Atualizar contador do pedido selecionado
      setPedido(prev => ({ ...prev, total_bipados: (prev.total_bipados || 0) + 1 }));
    } else {
      setFeedback({ tipo: "erro", msg: res.erro });
    }

    setTimeout(() => setFeedback(null), 3000);
    inputRef.current?.focus();
  }

  const itensFiltrados = itens.filter(i => {
    const matchFiltro = filtro === "todos" || i.status === filtro;
    const matchBusca  = !busca || i.imei.includes(busca) ||
                        i.modelo?.toLowerCase().includes(busca.toLowerCase()) ||
                        i.local_estoque?.toLowerCase().includes(busca.toLowerCase());
    return matchFiltro && matchBusca;
  });

  const totalBipados  = itens.filter(i => i.status === "bipado").length;
  const totalPendente = itens.filter(i => i.status === "pendente").length;
  const valorTotal    = itens.filter(i => i.status === "bipado").reduce((s, i) => s + (i.valor || 0), 0);

  if (!pedidoSel) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Selecione um pedido para iniciar o picking:</p>
        <div className="grid gap-3">
          {pedidos.filter(p => p.status === "aberto").map(p => (
            <button
              key={p.id}
              onClick={() => setPedido(p)}
              className="bg-white rounded-2xl p-4 ring-1 ring-slate-200 text-left hover:ring-purple-300 hover:bg-purple-50 transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-bold text-slate-800 text-sm">{p.lote}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-3">
                <ProgressBar value={p.total_bipados || 0} total={p.total_itens || 0} />
              </div>
            </button>
          ))}
          {pedidos.filter(p => p.status === "aberto").length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Nenhum pedido em aberto. Importe um pedido primeiro.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header do pedido */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => { setPedido(null); setItens([]); }}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
        >
          <X className="h-3 w-3" /> Trocar pedido
        </button>
        <div className="flex-1">
          <h3 className="font-black text-slate-800 text-sm">{pedidoSel.lote}</h3>
          <p className="text-xs text-slate-500">{pedidoSel.cliente}</p>
        </div>
        <StatusBadge status={pedidoSel.status} />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total do pedido" value={fmtN(pedidoSel.total_itens)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Bipados" value={fmtN(totalBipados)}
          sub={`${Math.round((totalBipados / (pedidoSel.total_itens || 1)) * 100)}%`}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Pendentes" value={fmtN(totalPendente)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Valor bipado" value={fmtR(valorTotal)}
          color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      {/* Progress */}
      <Card>
        <ProgressBar value={totalBipados} total={pedidoSel.total_itens || 0} />
      </Card>

      {/* Input de bipagem */}
      <Card>
        <h3 className="font-black text-slate-800 flex items-center gap-2 mb-4 text-sm">
          <Search className="h-4 w-4 text-[#7F2D92]" />
          Bipar IMEI
        </h3>
        <form onSubmit={handleBipar} className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={imeiInput}
            onChange={e => setImei(e.target.value)}
            placeholder="Bipe ou digite o IMEI..."
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={!imeiInput.trim()}
            className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50"
          >
            <CheckCircle className="h-4 w-4" />
            Confirmar
          </button>
        </form>

        {/* Feedback */}
        {feedback && (
          <div className={`mt-3 flex items-start gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${
            feedback.tipo === "ok"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-red-50 text-red-700 ring-red-200"
          }`}>
            {feedback.tipo === "ok"
              ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
              : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            }
            <div>
              <p className="font-semibold">{feedback.msg}</p>
              {feedback.item && (
                <p className="text-xs mt-0.5 opacity-80">
                  {feedback.item.modelo} · {feedback.item.grade} · {feedback.item.local_estoque}
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Filtros e lista */}
      <Card>
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
            <Package className="h-4 w-4 text-[#7F2D92]" />
            Lista de itens
          </h3>
          <div className="flex gap-2 ml-auto flex-wrap">
            {["todos","pendente","bipado"].map(f => (
              <button key={f} onClick={() => setFiltro(f)}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${
                  filtro === f ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}>
                {f === "todos" ? "Todos" : f === "pendente" ? "Pendentes" : "Bipados"}
              </button>
            ))}
          </div>
        </div>

        {/* Busca */}
        <div className="relative mb-3">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar IMEI, modelo ou local..."
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead>
                <tr className="bg-slate-50 rounded-xl">
                  <th className="px-3 py-2 text-left font-bold text-slate-500">Local</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">IMEI</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">Modelo</th>
                  <th className="px-3 py-2 text-left font-bold text-slate-500">Grade</th>
                  <th className="px-3 py-2 text-right font-bold text-slate-500">Valor</th>
                  <th className="px-3 py-2 text-center font-bold text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itensFiltrados.slice(0, 200).map(item => (
                  <tr key={item.id}
                    className={`hover:bg-slate-50 ${item.status === "bipado" ? "opacity-60" : ""}`}>
                    <td className="px-3 py-2 font-mono text-slate-600">{item.local_estoque || "—"}</td>
                    <td className="px-3 py-2 font-mono font-semibold text-slate-800">{item.imei}</td>
                    <td className="px-3 py-2 text-slate-600 max-w-[180px] truncate">{item.modelo}</td>
                    <td className="px-3 py-2">
                      <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">
                        {item.grade}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-700">{fmtR(item.valor)}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusBadge status={item.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {itensFiltrados.length > 200 && (
              <p className="text-xs text-center text-slate-400 mt-2">
                Mostrando 200 de {fmtN(itensFiltrados.length)} itens. Use o filtro para refinar.
              </p>
            )}
            {itensFiltrados.length === 0 && (
              <p className="text-center text-slate-400 text-sm py-8">Nenhum item encontrado.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 3 — PEDIDOS E EXPORTAÇÃO
// ══════════════════════════════════════════════════════════
function TabPedidos({ pedidos, onAtualizar }) {
  const [exportando, setExportando] = useState(null);

  async function handleExportar(pedido) {
    setExportando(pedido.id);
    try {
      await exportarFaturamento(pedido.id);
    } catch (e) {
      alert("Erro ao exportar: " + e.message);
    } finally {
      setExportando(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-black text-slate-800 flex items-center gap-2 text-sm">
          <BarChart3 className="h-4 w-4 text-[#7F2D92]" />
          Todos os Pedidos B2B
        </h3>
        <button onClick={onAtualizar}
          className="text-xs text-slate-500 hover:text-purple-700 font-semibold">
          ↻ Atualizar
        </button>
      </div>

      <div className="space-y-3">
        {pedidos.map(p => (
          <Card key={p.id}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <div className="font-bold text-slate-800 text-sm">{p.lote}</div>
                <div className="text-xs text-slate-500 mt-0.5">{p.cliente}</div>
                <div className="text-xs text-slate-400 mt-0.5">
                  Importado em {new Date(p.criado_em).toLocaleDateString("pt-BR")}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge status={p.status} />
                <button
                  onClick={() => handleExportar(p)}
                  disabled={exportando === p.id || p.total_bipados === 0}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 transition disabled:opacity-40"
                >
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
          </Card>
        ))}

        {pedidos.length === 0 && (
          <div className="text-center py-12 text-slate-400">
            <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nenhum pedido importado ainda.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function B2BPickingPage() {
  const [aba, setAba]       = useState("picking");
  const [pedidos, setPedidos] = useState([]);

  useEffect(() => { carregarPedidos(); }, []);

  async function carregarPedidos() {
    const data = await listarPedidosB2B();
    setPedidos(data);
  }

  const ABAS = [
    { key: "picking",  label: "Picking",         icon: Search },
    { key: "importar", label: "Importar Pedido",  icon: Upload },
    { key: "pedidos",  label: "Pedidos",          icon: BarChart3 },
  ];

  const pedidosAbertos   = pedidos.filter(p => p.status === "aberto").length;
  const pedidosConcluidos = pedidos.filter(p => p.status === "concluido").length;

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Picking B2B</h2>
            <p className="text-xs text-slate-500">
              Separação e faturamento de pedidos B2B · Assurant Warehouse
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
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

      {/* Abas */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => {
          const Icon = a.icon;
          return (
            <button
              key={a.key}
              onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
                aba === a.key
                  ? "bg-[#7F2D92] text-white shadow-md"
                  : "text-slate-500 hover:bg-slate-100"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {a.label}
            </button>
          );
        })}
      </div>

      {/* Conteúdo */}
      {aba === "importar" && (
        <TabImportar onImportado={() => { carregarPedidos(); setAba("picking"); }} />
      )}
      {aba === "picking" && (
        <TabPicking pedidos={pedidos} />
      )}
      {aba === "pedidos" && (
        <TabPedidos pedidos={pedidos} onAtualizar={carregarPedidos} />
      )}
    </div>
  );
}