import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, Package,
  ChevronDown, ChevronUp, X, ScanLine, FileText,
  Truck, RefreshCw, MapPin, Clock,
} from "lucide-react";
import {
  listarTrocas, buscarSugestoesPorSku, validarImeiTroca,
  registrarSeparacao, registrarFaturamento, moverParaReembolso,
  atualizarStatusTroca,
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

function KpiMini({ label, value, color = "bg-purple-50 ring-purple-200 text-purple-700" }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${color}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-semibold mt-0.5 opacity-80">{label}</div>
    </div>
  );
}

const STATUS_MAP = {
  em_aberto:        { label: "Em aberto",         cls: "bg-blue-50 text-blue-700 ring-blue-200"       },
  em_separacao:     { label: "Em separação",       cls: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
  faturado:         { label: "Faturado",           cls: "bg-purple-50 text-purple-700 ring-purple-200" },
  postado:          { label: "Postado",            cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  movido_reembolso: { label: "Mov. p/ reembolso",  cls: "bg-red-50 text-red-700 ring-red-200"          },
  concluido:        { label: "Concluído",          cls: "bg-slate-100 text-slate-600 ring-slate-200"   },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${s.cls}`}>{s.label}</span>;
}

// ══════════════════════════════════════════════════════════
// ABA SEPARAÇÃO — card de troca
// ══════════════════════════════════════════════════════════
function CardSeparacao({ troca, onAtualizar }) {
  const { user }                        = useAuth();
  const [aberto, setAberto]             = useState(false);
  const [sugestoes, setSugestoes]       = useState({});
  const [loadingSug, setLoadingSug]     = useState(false);
  const [imeiInput, setImeiInput]       = useState("");
  const [skuEscolhido, setSkuEscolhido] = useState("");
  const [feedback, setFeedback]         = useState(null);
  const [bipando, setBipando]           = useState(false);
  const inputRef                        = useRef(null);
  const op = troca.trocas_b2c_operacao?.[0] || {};
  const skus = (troca.trocas_b2c_skus || []).sort((a, b) => a.ordem - b.ordem);
  const jaSeparado = !!op.imei;

  async function carregarSugestoes() {
    if (!skus.length) return;
    setLoadingSug(true);
    try {
      const data = await buscarSugestoesPorSku(skus);
      setSugestoes(data);
    } catch (e) { console.error(e); }
    finally { setLoadingSug(false); }
  }

  function handleAbrir() {
    const novoAberto = !aberto;
    setAberto(novoAberto);
    if (novoAberto && !Object.keys(sugestoes).length) carregarSugestoes();
    if (novoAberto) setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function handleBipar(e) {
    e.preventDefault();
    if (!imeiInput.trim()) return;
    if (!skuEscolhido) return setFeedback({ tipo: "erro", msg: "Selecione o SKU antes de bipar." });

    setBipando(true);
    setFeedback(null);
    try {
      const val = await validarImeiTroca(imeiInput.trim(), skus);
      if (!val.ok) return setFeedback({ tipo: "erro", msg: val.erro });

      // Verifica se o SKU do IMEI bate com o escolhido
      if (val.item.sku !== skuEscolhido) {
        return setFeedback({
          tipo: "erro",
          msg: `SKU do aparelho (${val.item.sku}) não bate com o SKU selecionado (${skuEscolhido}).`,
        });
      }

      await registrarSeparacao(troca.id, imeiInput.trim(), skuEscolhido, user.id);
      setFeedback({ tipo: "ok", msg: `✓ IMEI ${imeiInput.trim()} registrado! ${val.item.modelo} · ${val.item.local}` });
      setImeiInput("");
      setTimeout(() => { onAtualizar?.(); }, 1500);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setBipando(false);
      inputRef.current?.focus();
    }
  }

  function usarSugestao(item, sku) {
    setImeiInput(item.imei);
    setSkuEscolhido(sku);
    inputRef.current?.focus();
  }

  return (
    <Card className={`ring-1 ${jaSeparado ? "ring-emerald-200" : "ring-slate-200"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-slate-800 text-sm">#{troca.id_anymarket}</span>
            <StatusBadge status={troca.status} />
            {jaSeparado && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg ring-1 bg-emerald-50 text-emerald-700 ring-emerald-200 flex items-center gap-1">
                <CheckCircle className="h-3 w-3" /> IMEI: {op.imei}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-slate-700">{troca.nome_cliente}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{troca.produto_original}</div>
        </div>
        {!jaSeparado && troca.status !== "movido_reembolso" && (
          <button onClick={handleAbrir}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-purple-700 transition shrink-0">
            {aberto ? <><ChevronUp className="h-4 w-4" /> Fechar</> : <><ChevronDown className="h-4 w-4" /> Separar</>}
          </button>
        )}
      </div>

      {aberto && !jaSeparado && troca.status !== "movido_reembolso" && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">

          {/* SKU a usar */}
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">SKU a separar</label>
            <div className="flex gap-2 flex-wrap">
              {skus.map(s => (
                <button key={s.id} onClick={() => setSkuEscolhido(s.sku)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ring-1 ${skuEscolhido === s.sku ? "bg-[#7F2D92] text-white ring-[#7F2D92]" : "bg-slate-100 text-slate-600 ring-slate-200 hover:bg-slate-200"}`}>
                  {s.sku}
                  {s.descricao && <span className="ml-1 opacity-70 font-normal">· {s.descricao}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Sugestões FIFO */}
          {skuEscolhido && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Sugestões FIFO — {skuEscolhido}
                </p>
                <button onClick={carregarSugestoes} className="text-xs text-slate-400 hover:text-purple-700">↻</button>
              </div>
              {loadingSug ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <div className="h-3 w-3 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                  Buscando...
                </div>
              ) : (sugestoes[skuEscolhido] || []).length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Nenhum aparelho disponível para este SKU.</p>
              ) : (
                <div className="space-y-1.5">
                  {(sugestoes[skuEscolhido] || []).map((item, idx) => (
                    <button key={item.imei} onClick={() => usarSugestao(item, skuEscolhido)}
                      className="w-full flex items-center gap-3 bg-purple-50 hover:bg-purple-100 rounded-xl px-3 py-2 transition text-left">
                      <span className="h-5 w-5 rounded-lg bg-[#7F2D92] text-white text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                      <div className="flex-1 min-w-0">
                        <span className="text-xs font-bold text-purple-800 font-mono">{item.imei}</span>
                        <span className="text-xs text-purple-600 ml-2 truncate">{item.modelo}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-purple-600">
                        <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{item.local || "—"}</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{fmtData(item.data_alocacao)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bipar IMEI */}
          <div>
            <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1">
              <ScanLine className="h-3.5 w-3.5" /> Bipar IMEI
            </p>
            <form onSubmit={handleBipar} className="flex gap-2">
              <input ref={inputRef} value={imeiInput} onChange={e => setImeiInput(e.target.value)}
                placeholder="Bipe ou digite o IMEI..."
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                autoComplete="off" />
              <button type="submit" disabled={bipando || !imeiInput.trim()}
                className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] transition disabled:opacity-50">
                {bipando ? <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                Confirmar
              </button>
            </form>
          </div>

          {feedback && (
            <div className={`flex items-start gap-2 text-xs rounded-xl px-4 py-3 ring-1 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
              {feedback.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              <p className="font-semibold">{feedback.msg}</p>
            </div>
          )}

          {/* Mover para reembolso */}
          <button onClick={async () => {
            if (!confirm("Mover para reembolso?")) return;
            await moverParaReembolso(troca.id);
            onAtualizar?.();
          }} className="text-xs font-semibold text-red-600 hover:text-red-800 transition flex items-center gap-1">
            <X className="h-3.5 w-3.5" /> Mover p/ reembolso
          </button>
        </div>
      )}

      {troca.status === "movido_reembolso" && (
        <div className="mt-3 bg-red-50 ring-1 ring-red-200 rounded-xl px-4 py-2 text-xs text-red-700 font-semibold">
          Movida para reembolso.
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════
// ABA FATURAMENTO — card de troca
// ══════════════════════════════════════════════════════════
function CardFaturamento({ troca, onAtualizar }) {
  const { user }              = useAuth();
  const [aberto, setAberto]   = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const op = troca.trocas_b2c_operacao?.[0] || {};

  const [form, setForm] = useState({
    nf:           op.nf           || "",
    aut_postagem: op.aut_postagem || "",
    rastreio:     op.rastreio     || "",
  });

  function setField(f, v) { setForm(prev => ({ ...prev, [f]: v })); }

  async function handleSalvar() {
    if (!form.nf.trim()) return setFeedback({ tipo: "erro", msg: "Informe o número da NF." });
    setSalvando(true);
    setFeedback(null);
    try {
      await registrarFaturamento(troca.id, form, user.id);
      setFeedback({ tipo: "ok", msg: form.rastreio ? "✓ Postado! Troca concluída." : "✓ NF registrada!" });
      setTimeout(() => { onAtualizar?.(); }, 1500);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally { setSalvando(false); }
  }

  const concluido = troca.status === "concluido";

  return (
    <Card className={`ring-1 ${concluido ? "ring-emerald-200 opacity-80" : "ring-slate-200"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-slate-800 text-sm">#{troca.id_anymarket}</span>
            <StatusBadge status={troca.status} />
            {op.status_furbtech && (
              <StatusBadge status={op.status_furbtech} />
            )}
          </div>
          <div className="text-sm font-semibold text-slate-700">{troca.nome_cliente}</div>
          <div className="text-xs text-slate-400 mt-0.5">
            IMEI: <span className="font-mono font-semibold">{op.imei || "—"}</span>
            {op.sku_escolhido && <span className="ml-2">· SKU: {op.sku_escolhido}</span>}
          </div>
          {op.nf && <div className="text-xs text-slate-400 mt-0.5">NF: {op.nf}{op.aut_postagem && ` · Aut: ${op.aut_postagem}`}</div>}
          {op.rastreio && <div className="text-xs text-emerald-600 font-semibold mt-0.5 flex items-center gap-1"><Truck className="h-3 w-3" />{op.rastreio}</div>}
        </div>
        {!concluido && (
          <button onClick={() => setAberto(p => !p)}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-purple-700 transition shrink-0">
            {aberto ? <><ChevronUp className="h-4 w-4" /> Fechar</> : <><ChevronDown className="h-4 w-4" /> Faturar</>}
          </button>
        )}
      </div>

      {aberto && !concluido && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">NF *</label>
              <input value={form.nf} onChange={e => setField("nf", e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                placeholder="Número da NF" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Autorização de Postagem</label>
              <input value={form.aut_postagem} onChange={e => setField("aut_postagem", e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                placeholder="Código de autorização" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Rastreio</label>
              <input value={form.rastreio} onChange={e => setField("rastreio", e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                placeholder="Código de rastreio (preenchendo aqui conclui a troca)" />
            </div>
          </div>

          {feedback && (
            <div className={`flex items-center gap-2 text-xs rounded-xl px-3 py-2 ring-1 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
              {feedback.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
              <span className="font-semibold">{feedback.msg}</span>
            </div>
          )}

          <button onClick={handleSalvar} disabled={salvando}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] transition disabled:opacity-50">
            {salvando ? <div className="h-3 w-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
            Salvar
          </button>
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function TrocasB2CFurbtechPage() {
  const [aba, setAba]           = useState("trocas");
  const [trocas, setTrocas]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [busca, setBusca]       = useState("");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarTrocas();
      setTrocas(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const ABAS = [
    { key: "trocas",    label: "Trocas",    icon: RefreshCw },
    { key: "separacao", label: "Separação", icon: ScanLine  },
    { key: "faturamento", label: "Faturamento", icon: FileText },
  ];

  // Filtros por aba
  const trocasFiltradas = trocas.filter(t => {
    const matchBusca = !busca
      || t.id_anymarket?.includes(busca)
      || t.nome_cliente?.toLowerCase().includes(busca.toLowerCase())
      || t.cpf?.includes(busca);

    if (aba === "trocas") return matchBusca;

    if (aba === "separacao") {
      const op = t.trocas_b2c_operacao?.[0];
      const semImei = !op?.imei;
      return matchBusca && semImei && t.status !== "movido_reembolso" && t.status !== "concluido";
    }

    if (aba === "faturamento") {
      const op = t.trocas_b2c_operacao?.[0];
      const temImei = !!op?.imei;
      return matchBusca && temImei;
    }

    return matchBusca;
  });

  const contadores = {
    emAberto:    trocas.filter(t => t.status === "em_aberto").length,
    separacao:   trocas.filter(t => { const op = t.trocas_b2c_operacao?.[0]; return !op?.imei && t.status !== "movido_reembolso" && t.status !== "concluido"; }).length,
    faturamento: trocas.filter(t => { const op = t.trocas_b2c_operacao?.[0]; return !!op?.imei; }).length,
    concluidos:  trocas.filter(t => t.status === "concluido").length,
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Trocas B2C</h2>
            <p className="text-xs text-slate-500">Gestão de trocas · Assurant Warehouse</p>
          </div>
        </div>
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Em aberto"    value={contadores.emAberto}    color="bg-blue-50 ring-blue-200 text-blue-700" />
        <KpiMini label="P/ separar"   value={contadores.separacao}   color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="P/ faturar"   value={contadores.faturamento} color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Concluídos"   value={contadores.concluidos}  color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
      </div>

      {/* Abas */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${aba === a.key ? "bg-[#7F2D92] text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}>
              <Icon className="h-4 w-4 shrink-0" />
              {a.label}
              {a.key === "separacao" && contadores.separacao > 0 && (
                <span className="ml-1 bg-yellow-400 text-white text-xs font-black rounded-full px-1.5 py-0.5">{contadores.separacao}</span>
              )}
              {a.key === "faturamento" && contadores.faturamento > 0 && (
                <span className="ml-1 bg-purple-400 text-white text-xs font-black rounded-full px-1.5 py-0.5">{contadores.faturamento}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por ID, nome ou CPF..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white" />
      </div>

      {/* Conteúdo */}
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
          {aba === "trocas" && trocasFiltradas.map(t => (
            <Card key={t.id} className={`ring-1 ${STATUS_MAP[t.status]?.cls?.replace("bg-", "ring-").replace(" text-", " ") || "ring-slate-200"}`}>
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-slate-800 text-sm">#{t.id_anymarket}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{t.nome_cliente}</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{t.produto_original}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Solicitado em {fmtData(t.criado_em)}</div>
                  {t.trocas_b2c_skus?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {t.trocas_b2c_skus.sort((a, b) => a.ordem - b.ordem).map(s => (
                        <span key={s.id} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">{s.sku}</span>
                      ))}
                    </div>
                  )}
                  {t.trocas_b2c_operacao?.[0]?.imei && (
                    <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> IMEI: {t.trocas_b2c_operacao[0].imei}
                      {t.trocas_b2c_operacao[0].rastreio && <><Truck className="h-3 w-3 ml-1" />{t.trocas_b2c_operacao[0].rastreio}</>}
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}

          {aba === "separacao" && trocasFiltradas.map(t => (
            <CardSeparacao key={t.id} troca={t} onAtualizar={carregar} />
          ))}

          {aba === "faturamento" && trocasFiltradas.map(t => (
            <CardFaturamento key={t.id} troca={t} onAtualizar={carregar} />
          ))}
        </div>
      )}
    </div>
  );
}