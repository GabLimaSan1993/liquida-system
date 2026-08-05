import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, Package,
  ChevronDown, ChevronUp, X, ScanLine, FileText,
  Truck, RefreshCw, MapPin, Clock, Wrench, Loader, Filter, FlaskConical,
  Download, Upload,
} from "lucide-react";
import {
  listarTrocas, buscarSugestoesFIFO, registrarFaturamento, moverParaReembolso,
  alocarTroca, listarParaSeparacao, confirmarSeparacao, naoLocalizadoSeparacao,
  aprovarTeste, reprovarTeste, gerarPlanilhaTrocas, importarXmlsTrocas,
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
  alocado:          { label: "Alocado",            cls: "bg-blue-50 text-blue-700 ring-blue-200"       },
  em_separacao:     { label: "Separado",           cls: "bg-yellow-50 text-yellow-700 ring-yellow-200" },
  aprovado:         { label: "Aprovado no teste",  cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  reprovado:        { label: "Reprovado",          cls: "bg-red-50 text-red-700 ring-red-200"         },
  nao_localizado:   { label: "Não localizado",     cls: "bg-orange-50 text-orange-700 ring-orange-200" },
  faturado:         { label: "Faturado",           cls: "bg-purple-50 text-purple-700 ring-purple-200" },
  postado:          { label: "Postado",            cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  movido_reembolso: { label: "Mov. p/ reembolso",  cls: "bg-red-50 text-red-700 ring-red-200"          },
  concluido:        { label: "Concluído",          cls: "bg-slate-100 text-slate-600 ring-slate-200"   },
};

function StatusBadge({ status }) {
  const s = STATUS_MAP[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${s.cls}`}>{s.label}</span>;
}

// Badge de status do aparelho no estoque (Gaia)
function EstoqueStatusBadge({ status, classe }) {
  const reparo = status === "Reservado para reparo";
  const cls = classe === "disponivel"
    ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
    : reparo
      ? "bg-orange-50 text-orange-700 ring-orange-200"
      : "bg-amber-50 text-amber-700 ring-amber-200";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ring-1 flex items-center gap-1 ${cls}`}>
      {reparo && <Wrench className="h-2.5 w-2.5" />}
      {status}
    </span>
  );
}

// Badge de aging
function AgingBadge({ dias }) {
  const cls = dias >= 180 ? "bg-red-50 text-red-700 ring-red-200"
    : dias >= 90 ? "bg-orange-50 text-orange-700 ring-orange-200"
    : "bg-slate-50 text-slate-600 ring-slate-200";
  return <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ring-1 ${cls}`}>{dias}d</span>;
}

// Badge de bateria
function BateriaBadge({ status }) {
  if (!status) return null;
  const txt = status.replace("Saúde da bateria ", "");
  const outlet = status === "Saúde da bateria entre 70 e 79%";
  const cls = outlet ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-semibold ${cls}`}>🔋 {txt}</span>;
}

// Extrai "RUA 7" de "RUA 7/BL04/AD04/A" — o filtro da separação trabalha por rua.
function ruaDe(local) {
  const t = String(local || "").trim().toUpperCase();
  if (!t) return "SEM LOCAL";
  const m = t.match(/^(R(?:UA|A)?\s*\d+)/);
  return m ? m[1].replace(/\s+/g, " ") : t.split("/")[0] || "SEM LOCAL";
}

// ══════════════════════════════════════════════════════════
// ABA TROCAS — escolher a peça do FIFO (alocação)
// ══════════════════════════════════════════════════════════
function CardAlocacao({ troca, onAtualizar }) {
  const { user }                        = useAuth();
  const [aberto, setAberto]             = useState(false);
  const [sugestoes, setSugestoes]       = useState({});
  const [loadingSug, setLoadingSug]     = useState(false);
  const [skuEscolhido, setSkuEscolhido] = useState("");
  const [feedback, setFeedback]         = useState(null);
  const [alocando, setAlocando]         = useState(null);

  const op   = troca.trocas_b2c_assurant_operacao?.[0] || {};
  const skus = (troca.trocas_b2c_assurant_skus || []).sort((a, b) => a.ordem - b.ordem);
  const jaAlocado = !!op.imei;

  // IMEIs que já falharam nesta troca não voltam a ser sugeridos.
  const jaTentados = (Array.isArray(op.tentativas) ? op.tentativas : []).map(t => t.imei);

  async function carregarSugestoes() {
    if (!skus.length) return;
    setLoadingSug(true);
    try { setSugestoes(await buscarSugestoesFIFO(skus, 5, jaTentados)); }
    catch (e) { console.error(e); }
    finally { setLoadingSug(false); }
  }

  function handleAbrir() {
    const novo = !aberto;
    setAberto(novo);
    if (novo && !skuEscolhido && skus.length) setSkuEscolhido(skus[0].sku);
    if (novo && !Object.keys(sugestoes).length) carregarSugestoes();
  }

  async function handleAlocar(item) {
    if (alocando) return;
    setAlocando(item.imei);
    setFeedback(null);
    try {
      const r = await alocarTroca(troca.id, item.imei, skuEscolhido, user.id);
      if (!r.ok) setFeedback({ tipo: "erro", msg: r.erro });
      else {
        setFeedback({ tipo: "ok", msg: `Alocado ${item.imei} · ${item.local || "sem local"}` });
        setTimeout(() => onAtualizar?.(), 1200);
      }
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setAlocando(null); }
  }

  const infoSku    = sugestoes[skuEscolhido] || sugestoes[Object.keys(sugestoes)[0]] || null;
  const candidatos = infoSku?.candidatos || [];
  const gradeAlvo  = infoSku?.gradeAlvo || null;

  return (
    <Card className={`ring-1 ${jaAlocado ? "ring-emerald-200" : "ring-slate-200"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-slate-800 text-sm">#{troca.id_anymarket}</span>
            <StatusBadge status={troca.status} />
            {op.status_furbtech && <StatusBadge status={op.status_furbtech} />}
          </div>
          <div className="text-sm font-semibold text-slate-700">{troca.nome_cliente}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{troca.produto_original}</div>
          <div className="flex gap-1 flex-wrap mt-2">
            {skus.map(s => (
              <span key={s.id} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">
                {s.sku}{(s.grade_alvo || s.grade) && ` · ${s.grade_alvo || s.grade}`}
              </span>
            ))}
          </div>
          {jaAlocado && (
            <div className="text-xs text-emerald-600 font-semibold mt-1.5 flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Alocado: {op.imei}
            </div>
          )}
          {jaTentados.length > 0 && (
            <div className="text-xs text-amber-600 font-semibold mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {jaTentados.length} aparelho(s) já descartado(s) nesta troca
            </div>
          )}
        </div>
        {!jaAlocado && troca.status !== "movido_reembolso" && (
          <button onClick={handleAbrir}
            className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-purple-700 transition shrink-0">
            {aberto ? <><ChevronUp className="h-4 w-4" /> Fechar</> : <><ChevronDown className="h-4 w-4" /> Alocar</>}
          </button>
        )}
      </div>

      {aberto && !jaAlocado && troca.status !== "movido_reembolso" && (
        <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
          {skus.length > 1 && (
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-2">SKU (em ordem de preferência)</label>
              <div className="flex flex-col gap-2">
                {skus.map(s => (
                  <button key={s.id} onClick={() => setSkuEscolhido(s.sku)}
                    className={`text-left px-3 py-2 rounded-xl font-semibold transition-all ring-1 ${skuEscolhido === s.sku ? "bg-[#7F2D92] text-white ring-[#7F2D92]" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"}`}>
                    <span className="text-xs font-mono">{s.sku}</span>
                    {(s.grade_alvo || s.grade) && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-md font-bold ${skuEscolhido === s.sku ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
                        {s.grade_alvo || s.grade}
                      </span>
                    )}
                    {s.descricao && <div className={`text-[11px] font-normal mt-0.5 ${skuEscolhido === s.sku ? "text-white/80" : "text-slate-500"}`}>{s.descricao}</div>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Sugestões FIFO — {skuEscolhido}
                {gradeAlvo && <span className="text-purple-600">· grade alvo: {gradeAlvo}</span>}
              </p>
              <button onClick={carregarSugestoes} className="text-xs text-slate-400 hover:text-purple-700">↻</button>
            </div>

            {loadingSug ? (
              <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                <Loader className="h-3 w-3 animate-spin" /> Buscando no estoque...
              </div>
            ) : candidatos.length === 0 ? (
              <p className="text-xs text-slate-400 py-2">Nenhum aparelho disponível para este SKU.</p>
            ) : (
              <div className="space-y-1.5">
                {candidatos.map((item, idx) => (
                  <div key={item.imei}
                    className={`flex items-start gap-3 rounded-xl px-3 py-2 ring-1 ${idx === 0 ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-100"}`}>
                    <span className={`h-5 w-5 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 ${idx === 0 ? "bg-[#7F2D92]" : "bg-slate-400"}`}>{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-slate-800 font-mono">{item.imei}</span>
                        <AgingBadge dias={item.aging_oracle} />
                        {item.grade && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-purple-100 text-purple-700">{item.grade}</span>
                        )}
                        <BateriaBadge status={item.status_bateria} />
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.modelo}</div>
                      <div className="flex items-center gap-2 flex-wrap mt-1">
                        <span className="text-[10px] text-slate-500 font-semibold flex items-center gap-0.5">
                          <MapPin className="h-2.5 w-2.5" />{item.local || "sem local"}
                        </span>
                        <span className="text-[10px] text-slate-400">subinv: {fmtData(item.data_subinv)}</span>
                      </div>
                    </div>
                    <button onClick={() => handleAlocar(item)} disabled={!!alocando}
                      className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] disabled:opacity-50">
                      {alocando === item.imei ? <Loader className="h-3 w-3 animate-spin" /> : "Alocar"}
                    </button>
                  </div>
                ))}
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <Clock className="h-2.5 w-2.5" /> Mesmo FIFO do B2C — ordenado por antiguidade no armazém.
                </p>
              </div>
            )}
          </div>

          {feedback && (
            <div className={`flex items-start gap-2 text-xs rounded-xl px-4 py-3 ring-1 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
              {feedback.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
              <p className="font-semibold">{feedback.msg}</p>
            </div>
          )}

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
// ABA SEPARAÇÃO — lista por rua, bipar e "não localizado"
// ══════════════════════════════════════════════════════════
function ListaSeparacao({ trocas, locais, onAtualizar }) {
  const { user }              = useAuth();
  const [ruaSel, setRuaSel]   = useState(null);
  const [imeis, setImeis]     = useState({});
  const [proc, setProc]       = useState(null);
  const [feedback, setFeedback] = useState(null);

  const itens = trocas
    .map(t => ({ troca: t, loc: locais[t.id] || {} }))
    .filter(x => x.loc.imei);

  const porRua = {};
  itens.forEach(x => {
    const r = ruaDe(x.loc.local);
    (porRua[r] ||= []).push(x);
  });
  const ruas = Object.keys(porRua).sort();
  const visiveis = ruaSel ? { [ruaSel]: porRua[ruaSel] || [] } : porRua;

  async function handleBipar(trocaId) {
    const v = (imeis[trocaId] || "").trim();
    if (!v || proc) return;
    setProc(trocaId);
    setFeedback(null);
    try {
      const r = await confirmarSeparacao(trocaId, v, user.id);
      if (!r.ok) setFeedback({ tipo: "erro", msg: r.erro });
      else {
        setFeedback({ tipo: "ok", msg: `Separado ${v} — segue para o teste.` });
        setImeis(p => ({ ...p, [trocaId]: "" }));
        setTimeout(() => onAtualizar?.(), 900);
      }
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setProc(null); }
  }

  async function handleNaoLocalizado(trocaId, imei) {
    if (!confirm(`Marcar ${imei} como não localizado? A peça sai do estoque até alguém conferir.`)) return;
    setProc(trocaId);
    try {
      const r = await naoLocalizadoSeparacao(trocaId, user.id, null);
      if (!r.ok) setFeedback({ tipo: "erro", msg: r.erro });
      else {
        setFeedback({ tipo: "ok", msg: `${imei} marcado como não localizado. A troca voltou para alocação.` });
        setTimeout(() => onAtualizar?.(), 900);
      }
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setProc(null); }
  }

  if (!itens.length) {
    return (
      <div className="text-center py-12 text-slate-400">
        <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nada para separar — aloque uma peça na aba Trocas.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="h-3.5 w-3.5 text-slate-400" />
          <span className="text-xs font-bold text-slate-500">Filtrar por rua:</span>
          <button onClick={() => setRuaSel(null)}
            className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${!ruaSel ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            Todas · {itens.length}
          </button>
          {ruas.map(r => (
            <button key={r} onClick={() => setRuaSel(ruaSel === r ? null : r)}
              className={`text-xs font-bold px-3 py-1.5 rounded-xl transition ${ruaSel === r ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
              {r} · {porRua[r].length}
            </button>
          ))}
        </div>
      </Card>

      {feedback && (
        <div className={`flex items-start gap-2 text-xs rounded-xl px-4 py-3 ring-1 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
          {feedback.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          <p className="font-semibold">{feedback.msg}</p>
        </div>
      )}

      {Object.entries(visiveis).map(([rua, lista]) => (
        <Card key={rua}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-black text-slate-700 text-sm flex items-center gap-2">
              <MapPin className="h-4 w-4 text-[#7F2D92]" /> {rua}
            </h3>
            <span className="text-xs text-slate-400">{lista.length} aparelho{lista.length === 1 ? "" : "s"}</span>
          </div>
          <div className="space-y-2">
            {lista.map(({ troca, loc }) => (
              <div key={troca.id} className="rounded-xl ring-1 ring-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-800">{loc.imei}</span>
                      {loc.grade && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-md font-bold bg-purple-100 text-purple-700">{loc.grade}</span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{loc.modelo}</div>
                    <div className="text-[11px] font-bold text-[#7F2D92] mt-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {loc.local || "sem local"}
                      {loc.voucher && <span className="text-slate-400 font-normal ml-1">{loc.voucher}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs font-bold text-slate-600">#{troca.id_anymarket}</div>
                    <div className="text-[11px] text-slate-400">{troca.nome_cliente}</div>
                  </div>
                </div>

                <div className="flex gap-2 mt-3 flex-wrap">
                  <input
                    value={imeis[troca.id] || ""}
                    onChange={e => setImeis(p => ({ ...p, [troca.id]: e.target.value }))}
                    onKeyDown={e => { if (e.key === "Enter") handleBipar(troca.id); }}
                    placeholder="Bipe o IMEI para confirmar..."
                    className="flex-1 min-w-[180px] rounded-xl border border-slate-200 px-3 py-2 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#7F2D92]"
                    autoComplete="off" />
                  <button onClick={() => handleBipar(troca.id)} disabled={proc === troca.id}
                    className="text-xs font-bold px-4 py-2 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] disabled:opacity-50 flex items-center gap-1.5">
                    {proc === troca.id ? <Loader className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
                    Confirmar
                  </button>
                  <button onClick={() => handleNaoLocalizado(troca.id, loc.imei)} disabled={proc === troca.id}
                    className="text-xs font-bold px-4 py-2 rounded-xl ring-1 ring-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> Não localizado
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA TESTE — aprovado ou reprovado (com motivos em cards)
// ══════════════════════════════════════════════════════════
function CardTeste({ troca, onAtualizar }) {
  const { user }              = useAuth();
  const [modo, setModo]       = useState(null);
  const [motivos, setMotivos] = useState([]);
  const [texto, setTexto]     = useState("");
  const [proc, setProc]       = useState(false);
  const [feedback, setFeedback] = useState(null);

  const op = troca.trocas_b2c_assurant_operacao?.[0] || {};

  function addMotivo() {
    const v = texto.trim();
    if (!v) return;
    if (!motivos.includes(v)) setMotivos(m => [...m, v]);
    setTexto("");
  }

  async function handleAprovar() {
    if (proc) return;
    setProc(true);
    try {
      await aprovarTeste(troca.id, user.id);
      setFeedback({ tipo: "ok", msg: "Aprovado — segue para o faturamento." });
      setTimeout(() => onAtualizar?.(), 900);
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setProc(false); }
  }

  async function handleReprovar() {
    if (proc) return;
    if (!motivos.length) return setFeedback({ tipo: "erro", msg: "Informe ao menos um motivo." });
    setProc(true);
    try {
      const r = await reprovarTeste(troca.id, motivos, user.id);
      if (!r.ok) setFeedback({ tipo: "erro", msg: r.erro });
      else {
        setFeedback({ tipo: "ok", msg: `Reprovado. ${r.imeiReprovado} voltou ao estoque — realoque na aba Trocas.` });
        setTimeout(() => onAtualizar?.(), 1500);
      }
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setProc(false); }
  }

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-slate-800 text-sm">#{troca.id_anymarket}</span>
            <StatusBadge status={op.status_furbtech} />
          </div>
          <div className="font-mono text-xs font-bold text-slate-700">{op.imei}</div>
          <div className="text-xs text-slate-400 mt-0.5">{troca.nome_cliente} · {troca.produto_substituto || op.sku_escolhido}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <button onClick={handleAprovar} disabled={proc}
          className="flex-1 text-sm font-bold px-4 py-3 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 hover:bg-emerald-100 disabled:opacity-50 flex items-center justify-center gap-2">
          <CheckCircle className="h-4 w-4" /> Aprovado
        </button>
        <button onClick={() => setModo(modo === "reprovar" ? null : "reprovar")} disabled={proc}
          className={`flex-1 text-sm font-bold px-4 py-3 rounded-xl ring-1 disabled:opacity-50 flex items-center justify-center gap-2 ${modo === "reprovar" ? "bg-red-600 text-white ring-red-600" : "bg-red-50 text-red-700 ring-red-200 hover:bg-red-100"}`}>
          <X className="h-4 w-4" /> Reprovado
        </button>
      </div>

      {modo === "reprovar" && (
        <div className="border-t border-slate-100 pt-3 space-y-3">
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-2">Motivos — digite e tecle enter</label>
            {motivos.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mb-2">
                {motivos.map(m => (
                  <span key={m} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-red-50 text-red-700 ring-1 ring-red-200">
                    {m}
                    <button onClick={() => setMotivos(l => l.filter(x => x !== m))} className="hover:text-red-900">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <div className="flex gap-2">
              <input value={texto} onChange={e => setTexto(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addMotivo(); } }}
                placeholder="Ex.: tela com mancha"
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
              <button onClick={addMotivo} className="text-xs font-bold px-3 py-2 rounded-xl ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50">
                Adicionar
              </button>
            </div>
          </div>

          <button onClick={handleReprovar} disabled={proc || !motivos.length}
            className="w-full text-sm font-bold px-4 py-2.5 rounded-xl bg-red-600 text-white hover:bg-red-700 disabled:opacity-40 flex items-center justify-center gap-2">
            {proc ? <Loader className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
            Confirmar reprovação ({motivos.length})
          </button>
          <p className="text-[11px] text-slate-400">
            A peça volta ao estoque como disponível e a troca retorna para alocação, sem repetir este IMEI.
          </p>
        </div>
      )}

      {feedback && (
        <div className={`flex items-start gap-2 text-xs rounded-xl px-4 py-3 ring-1 mt-3 ${feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
          {feedback.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
          <p className="font-semibold">{feedback.msg}</p>
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════
// ABA SEPARAÇÃO — card antigo (não usado)
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
  const op = troca.trocas_b2c_assurant_operacao?.[0] || {};
  const skus = (troca.trocas_b2c_assurant_skus || []).sort((a, b) => a.ordem - b.ordem);
  const jaSeparado = !!op.imei;

  async function carregarSugestoes() {
    if (!skus.length) return;
    setLoadingSug(true);
    try {
      const data = await buscarSugestoesFIFO(skus, 5);
      console.log("SUGESTOES:", data, "| SKUs da troca:", skus.map(s => s.sku));
      setSugestoes(data);
    } catch (e) { console.error("Erro buscarSugestoesFIFO:", e); }
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

      if (val.item.sku !== skuEscolhido) {
        return setFeedback({
          tipo: "erro",
          msg: `SKU do aparelho (${val.item.sku}) não bate com o SKU selecionado (${skuEscolhido}).`,
        });
      }

      await registrarSeparacao(troca.id, imeiInput.trim(), skuEscolhido, user.id);
      const agingMsg = val.item.aging_oracle != null ? ` · ${val.item.aging_oracle}d` : "";
      setFeedback({ tipo: "ok", msg: `✓ IMEI ${imeiInput.trim()} registrado! ${val.item.modelo}${agingMsg}` });
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

  const infoSku    = sugestoes[skuEscolhido] || null;
  const candidatos = infoSku?.candidatos || [];
  const gradeAlvo  = infoSku?.gradeAlvo || null;
  const obsSku     = infoSku?.observacao || null;

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
            <label className="block text-xs font-bold text-slate-600 mb-2">SKU a separar (em ordem de preferência)</label>
            <div className="flex flex-col gap-2">
              {skus.map(s => (
                <button key={s.id} onClick={() => setSkuEscolhido(s.sku)}
                  className={`text-left px-3 py-2 rounded-xl font-semibold transition-all ring-1 ${skuEscolhido === s.sku ? "bg-[#7F2D92] text-white ring-[#7F2D92]" : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"}`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono">{s.sku}</span>
                    {(s.grade_alvo || s.grade) && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${skuEscolhido === s.sku ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"}`}>
                        {s.grade_alvo || s.grade}
                      </span>
                    )}
                  </div>
                  {s.descricao && <div className={`text-[11px] font-normal mt-0.5 ${skuEscolhido === s.sku ? "text-white/80" : "text-slate-500"}`}>{s.descricao}</div>}
                  {s.observacao && (
                    <div className={`text-[11px] font-semibold mt-0.5 flex items-center gap-1 ${skuEscolhido === s.sku ? "text-amber-200" : "text-amber-600"}`}>
                      <AlertTriangle className="h-2.5 w-2.5" /> {s.observacao}
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Sugestões FIFO */}
          {skuEscolhido && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-slate-500 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Sugestões FIFO (visão Oracle) — {skuEscolhido}
                  {gradeAlvo && <span className="text-purple-600">· grade alvo: {gradeAlvo}</span>}
                </p>
                <button onClick={carregarSugestoes} className="text-xs text-slate-400 hover:text-purple-700">↻</button>
              </div>
              {obsSku && (
                <div className="bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-1.5 mb-2 text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> {obsSku}
                </div>
              )}
              {loadingSug ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <div className="h-3 w-3 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
                  Buscando no estoque Oracle...
                </div>
              ) : candidatos.length === 0 ? (
                <p className="text-xs text-slate-400 py-2">Nenhum aparelho disponível no estoque Oracle para este SKU.</p>
              ) : (
                <div className="space-y-1.5">
                  {candidatos.map((item, idx) => {
                    const gradeBate = item.grade_bate;
                    return (
                      <button key={item.imei} onClick={() => usarSugestao(item, skuEscolhido)}
                        className={`w-full flex items-start gap-3 rounded-xl px-3 py-2 transition text-left ring-1 ${gradeBate ? "bg-emerald-50 hover:bg-emerald-100 ring-emerald-200" : "bg-slate-50 hover:bg-slate-100 ring-slate-100"}`}>
                        <span className={`h-5 w-5 rounded-lg text-white text-xs font-black flex items-center justify-center shrink-0 mt-0.5 ${idx === 0 ? "bg-[#7F2D92]" : "bg-slate-400"}`}>{idx + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-800 font-mono">{item.imei}</span>
                            <AgingBadge dias={item.aging_oracle} />
                            {item.grade && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold ${gradeBate ? "bg-emerald-200 text-emerald-800" : "bg-slate-200 text-slate-600"}`}>
                                {item.grade}{gradeBate && " ✓"}
                              </span>
                            )}
                            <BateriaBadge status={item.status_bateria} />
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">{item.modelo}</div>
                          <div className="flex items-center gap-2 flex-wrap mt-1">
                            <EstoqueStatusBadge status={item.status_atual} classe={item.classe_status} />
                            <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{item.local || "sem local"}</span>
                            <span className="text-[10px] text-slate-400">subinv: {fmtData(item.data_subinv)}</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" /> Ordenado por aging (mais antigo primeiro). Verde = grade bate com a desejada.
                  </p>
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
  const op = troca.trocas_b2c_assurant_operacao?.[0] || {};

  const [baixando, setBaixando] = useState(false);
  const [subindo, setSubindo]   = useState(false);
  const inputXml = useRef(null);

  // A NF não é digitada: vem do XML. Aqui só entram os dados da transportadora.
  const [form, setForm] = useState({
    nf:           op.nf           || "",
    aut_postagem: op.aut_postagem || "",
    rastreio:     op.rastreio     || "",
  });

  function setField(f, v) { setForm(prev => ({ ...prev, [f]: v })); }

  async function handleBaixar() {
    if (baixando) return;
    setBaixando(true);
    setFeedback(null);
    try {
      const r = await gerarPlanilhaTrocas(troca.id);
      setFeedback(r.ok
        ? { tipo: "ok",   msg: `Planilha ${r.nomeArquivo} gerada.` }
        : { tipo: "erro", msg: r.erro });
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setBaixando(false); }
  }

  async function handleXml(e) {
    const file = e.target.files?.[0];
    if (!file || subindo) return;
    setSubindo(true);
    setFeedback(null);
    try {
      const r = await importarXmlsTrocas(file, user.id, troca.id);
      if (r.faturadas > 0) {
        setFeedback({ tipo: "ok", msg: "NF importada do XML." });
        setTimeout(() => onAtualizar?.(), 1200);
      } else {
        const motivo = r.ignorados?.[0]?.motivo || "Nenhum item casou com esta troca.";
        setFeedback({ tipo: "erro", msg: motivo });
      }
    } catch (err) { setFeedback({ tipo: "erro", msg: err.message }); }
    finally {
      setSubindo(false);
      if (inputXml.current) inputXml.current.value = "";
    }
  }

  async function handleSalvar() {
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
          <div className="flex gap-2 flex-wrap">
            <button onClick={handleBaixar} disabled={baixando}
              className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] disabled:opacity-50">
              {baixando ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Baixar planilha
            </button>
            <label className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
              <input ref={inputXml} type="file" accept=".xml,.zip" onChange={handleXml} className="hidden" disabled={subindo} />
              {subindo ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              Subir XML
            </label>
            {op.nf && (
              <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-2.5 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle className="h-3.5 w-3.5" /> NF {op.nf}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
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
function TrocasB2CFurbtechPageAntigo() {
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

  const trocasFiltradas = trocas.filter(t => {
    const matchBusca = !busca
      || t.id_anymarket?.includes(busca)
      || t.nome_cliente?.toLowerCase().includes(busca.toLowerCase())
      || t.cpf?.includes(busca);

    if (aba === "trocas") return matchBusca;

    if (aba === "separacao") {
      const op = t.trocas_b2c_assurant_operacao?.[0];
      const semImei = !op?.imei;
      return matchBusca && semImei && t.status !== "movido_reembolso" && t.status !== "concluido";
    }

    if (aba === "faturamento") {
      const op = t.trocas_b2c_assurant_operacao?.[0];
      const temImei = !!op?.imei;
      return matchBusca && temImei;
    }

    return matchBusca;
  });

  const contadores = {
    emAberto:    trocas.filter(t => t.status === "Em aberto" || t.status === "em_aberto").length,
    separacao:   trocas.filter(t => { const op = t.trocas_b2c_assurant_operacao?.[0]; return !op?.imei && t.status !== "movido_reembolso" && t.status !== "concluido"; }).length,
    faturamento: trocas.filter(t => { const op = t.trocas_b2c_assurant_operacao?.[0]; return !!op?.imei; }).length,
    concluidos:  trocas.filter(t => t.status === "concluido").length,
  };

  return (
    <div className="space-y-5">
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Em aberto"    value={contadores.emAberto}    color="bg-blue-50 ring-blue-200 text-blue-700" />
        <KpiMini label="P/ separar"   value={contadores.separacao}   color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="P/ faturar"   value={contadores.faturamento} color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Concluídos"   value={contadores.concluidos}  color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
      </div>

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

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por ID, nome ou CPF..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white" />
      </div>

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
            <Card key={t.id} className="ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-black text-slate-800 text-sm">#{t.id_anymarket}</span>
                    <StatusBadge status={t.status} />
                  </div>
                  <div className="text-sm font-semibold text-slate-700">{t.nome_cliente}</div>
                  <div className="text-xs text-slate-400 mt-0.5 truncate">{t.produto_original}</div>
                  <div className="text-xs text-slate-400 mt-0.5">Solicitado em {fmtData(t.criado_em)}</div>
                  {t.trocas_b2c_assurant_skus?.length > 0 && (
                    <div className="flex gap-1 flex-wrap mt-2">
                      {t.trocas_b2c_assurant_skus.sort((a, b) => a.ordem - b.ordem).map(s => (
                        <span key={s.id} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-lg font-semibold">
                          {s.sku}{(s.grade_alvo || s.grade) && ` · ${s.grade_alvo || s.grade}`}
                        </span>
                      ))}
                    </div>
                  )}
                  {t.trocas_b2c_assurant_operacao?.[0]?.imei && (
                    <div className="text-xs text-emerald-600 font-semibold mt-1 flex items-center gap-1">
                      <CheckCircle className="h-3 w-3" /> IMEI: {t.trocas_b2c_assurant_operacao[0].imei}
                      {t.trocas_b2c_assurant_operacao[0].rastreio && <><Truck className="h-3 w-3 ml-1" />{t.trocas_b2c_assurant_operacao[0].rastreio}</>}
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

// ══════════════════════════════════════════════════════════
// ABA FATURAMENTO — planilha para o fiscal e volta dos XMLs
// ══════════════════════════════════════════════════════════
function PainelFaturamento({ onAtualizar }) {
  const { user }              = useAuth();
  const [baixando, setBaixando] = useState(false);
  const [subindo, setSubindo]   = useState(false);
  const [resultado, setResultado] = useState(null);
  const inputRef = useRef(null);

  async function handleBaixar() {
    if (baixando) return;
    setBaixando(true);
    setResultado(null);
    try {
      const r = await gerarPlanilhaTrocas();
      if (!r.ok) setResultado({ tipo: "erro", msg: r.erro });
      else setResultado({ tipo: "ok", msg: `${r.total} troca(s) na planilha ${r.nomeArquivo}.` });
    } catch (e) { setResultado({ tipo: "erro", msg: e.message }); }
    finally { setBaixando(false); }
  }

  async function handleXml(e) {
    const file = e.target.files?.[0];
    if (!file || subindo) return;
    setSubindo(true);
    setResultado(null);
    try {
      const r = await importarXmlsTrocas(file, user.id);
      const ign = r.ignorados?.length || 0;
      setResultado({
        tipo: r.faturadas > 0 ? "ok" : "erro",
        msg: `${r.faturadas} troca(s) faturada(s) de ${r.totalItens} item(ns)` +
             (ign ? ` · ${ign} ignorado(s)` : ""),
        ignorados: r.ignorados || [],
      });
      if (r.faturadas > 0) setTimeout(() => onAtualizar?.(), 1200);
    } catch (err) { setResultado({ tipo: "erro", msg: err.message }); }
    finally {
      setSubindo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-black text-slate-800 text-sm">Faturamento das trocas</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Baixe a planilha, emita as notas e suba os XMLs — o casamento é pelo IMEI.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleBaixar} disabled={baixando}
            className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] disabled:opacity-50">
            {baixando ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Baixar planilha
          </button>
          <label className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 rounded-xl ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer">
            <input ref={inputRef} type="file" accept=".xml,.zip" onChange={handleXml} className="hidden" disabled={subindo} />
            {subindo ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
            Subir XMLs
          </label>
        </div>
      </div>

      {resultado && (
        <div className={`mt-3 rounded-xl px-4 py-3 ring-1 text-xs ${resultado.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"}`}>
          <div className="flex items-start gap-2">
            {resultado.tipo === "ok" ? <CheckCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />}
            <p className="font-semibold">{resultado.msg}</p>
          </div>
          {resultado.ignorados?.length > 0 && (
            <div className="mt-2 border-t border-current/10 pt-2 space-y-0.5">
              {resultado.ignorados.slice(0, 12).map((i, k) => (
                <div key={k} className="text-[11px] opacity-80">
                  {i.arquivo}{i.imei ? ` · ${i.imei}` : ""} — {i.motivo}
                </div>
              ))}
              {resultado.ignorados.length > 12 && (
                <div className="text-[11px] opacity-60">e mais {resultado.ignorados.length - 12}...</div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function TrocasB2CFurbtechPage() {
  const [trocas, setTrocas]   = useState([]);
  const [locais, setLocais]   = useState({});
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [aba, setAba]         = useState("trocas");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [lista, locs] = await Promise.all([listarTrocas(), listarParaSeparacao()]);
      setTrocas(lista);
      setLocais(locs || {});
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const ABAS = [
    { key: "trocas",      label: "Trocas",      icon: RefreshCw    },
    { key: "separacao",   label: "Separação",   icon: ScanLine     },
    { key: "teste",       label: "Teste",       icon: FlaskConical },
    { key: "faturamento", label: "Faturamento", icon: FileText     },
  ];

  // Em que etapa cada troca está — o status_furbtech da operação é quem manda.
  function etapa(t) {
    const op = t.trocas_b2c_assurant_operacao?.[0];
    if (t.status === "movido_reembolso" || t.status === "concluido") return "fechada";
    if (!op?.imei)                             return "alocacao";
    if (op.status_furbtech === "alocado")      return "separacao";
    if (op.status_furbtech === "em_separacao") return "teste";
    return "faturamento";
  }

  const combina = t => !busca
    || t.id_anymarket?.includes(busca)
    || t.nome_cliente?.toLowerCase().includes(busca.toLowerCase())
    || t.cpf?.includes(busca);

  const daAba = {
    trocas:      trocas.filter(t => combina(t) && ["alocacao", "fechada"].includes(etapa(t))),
    separacao:   trocas.filter(t => combina(t) && etapa(t) === "separacao"),
    teste:       trocas.filter(t => combina(t) && etapa(t) === "teste"),
    faturamento: trocas.filter(t => combina(t) && etapa(t) === "faturamento"),
  };

  const contadores = {
    alocacao:    trocas.filter(t => etapa(t) === "alocacao").length,
    separacao:   trocas.filter(t => etapa(t) === "separacao").length,
    teste:       trocas.filter(t => etapa(t) === "teste").length,
    faturamento: trocas.filter(t => etapa(t) === "faturamento").length,
  };

  const lista = daAba[aba] || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔄</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Trocas B2C</h2>
            <p className="text-xs text-slate-500">Alocação · separação · teste · faturamento</p>
          </div>
        </div>
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold">↻ Atualizar</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="P/ alocar"  value={contadores.alocacao}    color="bg-blue-50 ring-blue-200 text-blue-700" />
        <KpiMini label="P/ separar" value={contadores.separacao}   color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="P/ testar"  value={contadores.teste}       color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="P/ faturar" value={contadores.faturamento} color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => {
          const Icon = a.icon;
          const n = a.key === "trocas" ? contadores.alocacao : contadores[a.key];
          return (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${aba === a.key ? "bg-[#7F2D92] text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}>
              <Icon className="h-4 w-4 shrink-0" />
              {a.label}
              {n > 0 && (
                <span className={`ml-1 text-xs font-black rounded-full px-1.5 py-0.5 ${aba === a.key ? "bg-white/25 text-white" : "bg-slate-200 text-slate-600"}`}>{n}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por ID, nome ou CPF..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : aba === "separacao" ? (
        <ListaSeparacao trocas={lista} locais={locais} onAtualizar={carregar} />
      ) : lista.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma troca nesta etapa.</p>
        </div>
      ) : (
        <div className="space-y-3">
          
          {aba === "trocas"      && lista.map(t => <CardAlocacao    key={t.id} troca={t} onAtualizar={carregar} />)}
          {aba === "teste"       && lista.map(t => <CardTeste       key={t.id} troca={t} onAtualizar={carregar} />)}
          {aba === "faturamento" && lista.map(t => <CardFaturamento key={t.id} troca={t} onAtualizar={carregar} />)}
        </div>
      )}
    </div>
  );
}