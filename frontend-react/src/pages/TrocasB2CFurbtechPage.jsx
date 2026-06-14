// src/pages/TrocasB2CFurbtechPage.jsx
import { useState, useEffect } from "react";
import {
  CheckCircle, AlertTriangle, Clock, Package,
  ChevronDown, ChevronUp, Search, X,
} from "lucide-react";
import {
  listarTrocas, salvarOperacao, atualizarStatusTroca,
} from "../services/trocasB2CService.js";
import { useAuth } from "../AuthContext.jsx";

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white";
const labelCls = "block text-xs font-bold text-slate-600 mb-1";

const STATUS_MAP = {
  em_aberto:          { label: "Em aberto",          cls: "bg-blue-50 text-blue-700 ring-blue-200"     },
  em_separacao:       { label: "Em separação",        cls: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
  faturado:           { label: "Faturado",            cls: "bg-purple-50 text-purple-700 ring-purple-200" },
  postado:            { label: "Postado",             cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  movido_reembolso:   { label: "Movido p/ reembolso", cls: "bg-red-50 text-red-700 ring-red-200"        },
  concluido:          { label: "Concluído",           cls: "bg-slate-50 text-slate-600 ring-slate-200"  },
};

const STATUS_FURBTECH = [
  "em_separacao", "faturado", "postado",
];

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${s.cls}`}>{s.label}</span>
  );
}

function CardTroca({ troca, onAtualizar }) {
  const { user } = useAuth();
  const [aberto, setAberto]     = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const op = troca.trocas_b2c_operacao?.[0] || {};

  const [form, setForm] = useState({
    sku_escolhido:   op.sku_escolhido   || "",
    imei:            op.imei            || "",
    data_separacao:  op.data_separacao  || "",
    nf:              op.nf              || "",
    aut_postagem:    op.aut_postagem    || "",
    rastreio:        op.rastreio        || "",
    status_furbtech: op.status_furbtech || "em_separacao",
  });

  function setField(f, v) { setForm(prev => ({ ...prev, [f]: v })); }

  async function handleSalvar() {
    setSalvando(true);
    setFeedback(null);
    try {
      await salvarOperacao(troca.id, form, user.id);

      // Atualiza status da troca baseado no status Furbtech
      const novoStatus = form.status_furbtech === "postado" ? "concluido"
        : form.status_furbtech === "faturado" ? "em_aberto"
        : "em_aberto";
      if (novoStatus !== troca.status) {
        await atualizarStatusTroca(troca.id, novoStatus);
      }

      setFeedback({ tipo: "ok", msg: "Salvo com sucesso!" });
      setTimeout(() => { setFeedback(null); onAtualizar?.(); }, 1500);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setSalvando(false);
    }
  }

  async function handleMoverReembolso() {
    if (!confirm("Mover esta troca para reembolso?")) return;
    try {
      await atualizarStatusTroca(troca.id, "movido_reembolso");
      onAtualizar?.();
    } catch (e) { alert(e.message); }
  }

  const skus = troca.trocas_b2c_skus || [];

  return (
    <Card className={`ring-1 ${troca.status === "concluido" ? "ring-emerald-200 opacity-70" : troca.status === "movido_reembolso" ? "ring-red-200 opacity-70" : "ring-slate-200"}`}>
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-slate-800 text-sm">#{troca.id_anymarket}</span>
            <StatusBadge status={troca.status} />
            {op.status_furbtech && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg ring-1 bg-purple-50 text-purple-700 ring-purple-200">
                Furbtech: {STATUS_MAP[op.status_furbtech]?.label || op.status_furbtech}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-slate-700">{troca.nome_cliente}</div>
          <div className="text-xs text-slate-400 mt-0.5">{troca.produto_original}</div>
          <div className="text-xs text-slate-400 mt-0.5">Solicitado em {fmtData(troca.criado_em)}</div>
        </div>
        <button onClick={() => setAberto(p => !p)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-purple-700 transition shrink-0">
          {aberto ? <><ChevronUp className="h-4 w-4" /> Fechar</> : <><ChevronDown className="h-4 w-4" /> Detalhes</>}
        </button>
      </div>

      {aberto && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">

          {/* Dados do cliente */}
          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="bg-slate-50 rounded-xl px-4 py-3 space-y-1">
              <p className="font-bold text-slate-500">Cliente</p>
              <p className="text-slate-700 font-semibold">{troca.nome_cliente}</p>
              {troca.cpf && <p className="text-slate-500">CPF: {troca.cpf}</p>}
              {troca.endereco && <p className="text-slate-500 leading-relaxed">{troca.endereco}</p>}
            </div>
          </div>

          {/* SKUs aceitos */}
          {skus.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-2">SKUs aceitos para substituição</p>
              <div className="space-y-1.5">
                {skus.sort((a, b) => a.ordem - b.ordem).map((s, idx) => (
                  <div key={s.id} className="flex items-center gap-2 bg-purple-50 rounded-xl px-3 py-2">
                    <span className="h-5 w-5 rounded-lg bg-[#7F2D92] text-white text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                    <div>
                      <span className="text-xs font-bold text-purple-800">{s.sku}</span>
                      {s.descricao && <span className="text-xs text-purple-600 ml-2">{s.descricao}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Formulário Furbtech */}
          {troca.status !== "movido_reembolso" && (
            <div className="bg-slate-50 rounded-2xl p-4 space-y-3">
              <p className="text-xs font-bold text-slate-600">Operação Furbtech</p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>SKU Escolhido</label>
                  <input value={form.sku_escolhido} onChange={e => setField("sku_escolhido", e.target.value)}
                    className={inputCls} placeholder="BRZDEV..." />
                </div>
                <div>
                  <label className={labelCls}>IMEI</label>
                  <input value={form.imei} onChange={e => setField("imei", e.target.value)}
                    className={inputCls} placeholder="IMEI do aparelho" />
                </div>
                <div>
                  <label className={labelCls}>Data da Separação</label>
                  <input type="date" value={form.data_separacao} onChange={e => setField("data_separacao", e.target.value)}
                    className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>NF</label>
                  <input value={form.nf} onChange={e => setField("nf", e.target.value)}
                    className={inputCls} placeholder="Número da NF" />
                </div>
                <div>
                  <label className={labelCls}>Aut. Postagem</label>
                  <input value={form.aut_postagem} onChange={e => setField("aut_postagem", e.target.value)}
                    className={inputCls} placeholder="Código autorização" />
                </div>
                <div>
                  <label className={labelCls}>Rastreio</label>
                  <input value={form.rastreio} onChange={e => setField("rastreio", e.target.value)}
                    className={inputCls} placeholder="Código de rastreio" />
                </div>
              </div>

              <div>
                <label className={labelCls}>Status Furbtech</label>
                <select value={form.status_furbtech} onChange={e => setField("status_furbtech", e.target.value)}
                  className={inputCls}>
                  {STATUS_FURBTECH.map(s => (
                    <option key={s} value={s}>{STATUS_MAP[s]?.label || s}</option>
                  ))}
                </select>
              </div>

              {feedback && (
                <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ring-1 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
                  {feedback.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  <span className="font-semibold">{feedback.msg}</span>
                </div>
              )}

              <div className="flex gap-2 flex-wrap">
                <button onClick={handleSalvar} disabled={salvando}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] transition disabled:opacity-50">
                  {salvando ? <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                  Salvar
                </button>
                <button onClick={handleMoverReembolso}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100 transition">
                  <X className="h-3.5 w-3.5" /> Mover p/ Reembolso
                </button>
              </div>
            </div>
          )}

          {troca.status === "movido_reembolso" && (
            <div className="bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-3 text-xs text-red-700 font-semibold">
              Esta solicitação foi movida para reembolso.
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

export default function TrocasB2CFurbtechPage() {
  const [trocas, setTrocas]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const [filtroStatus, setFiltro] = useState("todos");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarTrocas();
      setTrocas(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const trocasFiltradas = trocas.filter(t => {
    const matchBusca = !busca
      || t.id_anymarket?.includes(busca)
      || t.nome_cliente?.toLowerCase().includes(busca.toLowerCase())
      || t.cpf?.includes(busca)
      || t.produto_original?.toLowerCase().includes(busca.toLowerCase());

    const matchStatus = filtroStatus === "todos" || t.status === filtroStatus;
    return matchBusca && matchStatus;
  });

  const contadores = {
    em_aberto:        trocas.filter(t => t.status === "em_aberto").length,
    concluido:        trocas.filter(t => t.status === "concluido").length,
    movido_reembolso: trocas.filter(t => t.status === "movido_reembolso").length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Trocas B2C</h2>
            <p className="text-xs text-slate-500">Gestão de trocas e substituições · Assurant</p>
          </div>
        </div>
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl p-4 ring-1 bg-blue-50 ring-blue-200 text-blue-700">
          <div className="text-2xl font-black">{contadores.em_aberto}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Em aberto</div>
        </div>
        <div className="rounded-xl p-4 ring-1 bg-emerald-50 ring-emerald-200 text-emerald-700">
          <div className="text-2xl font-black">{contadores.concluido}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Concluídos</div>
        </div>
        <div className="rounded-xl p-4 ring-1 bg-red-50 ring-red-200 text-red-700">
          <div className="text-2xl font-black">{contadores.movido_reembolso}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Reembolso</div>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por ID, nome, CPF ou produto..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {["todos", "em_aberto", "concluido", "movido_reembolso"].map(s => (
              <button key={s} onClick={() => setFiltro(s)}
                className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtroStatus === s ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {s === "todos" ? "Todos" : STATUS_MAP[s]?.label || s}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Lista */}
      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : trocasFiltradas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma troca encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {trocasFiltradas.map(t => (
            <CardTroca key={t.id} troca={t} onAtualizar={carregar} />
          ))}
        </div>
      )}
    </div>
  );
}