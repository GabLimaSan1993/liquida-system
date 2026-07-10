import { useState, useEffect, useRef } from "react";
import {
  Search, CheckCircle, AlertTriangle, ArrowLeft, RefreshCw,
  ClipboardList, BarChart3, Dices, Loader, MapPin, ArrowLeftRight, Lock,
} from "lucide-react";
import {
  cicloAberto, abrirCiclo, sortearDia,
  listarContagensPendentes, abrirContagem, biparItem, fecharContagem,
  painelCiclo, listarConflitos, listarItens,
} from "../services/inventarioService.js";
import { useAuth } from "../AuthContext.jsx";

const MESES = ["janeiro","fevereiro","março","abril","maio","junho",
               "julho","agosto","setembro","outubro","novembro","dezembro"];

function nomeDoCicloAtual() {
  const d = new Date();
  return `Ciclo de ${MESES[d.getMonth()]}/${d.getFullYear()}`;
}

function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtPct(v) { return v == null ? "—" : `${v.toFixed(1).replace(".", ",")}%`; }
function fmtData(d) { return d ? new Date(d).toLocaleString("pt-BR") : "—"; }

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

function Barra({ pct, cor = "bg-[#7F2D92]" }) {
  return (
    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${cor} transition-all`} style={{ width: `${Math.min(100, pct)}%` }} />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA CONTAGEM
// ══════════════════════════════════════════════════════════
function TabContagem({ ciclo }) {
  const { user, profile } = useAuth();
  const [pendentes, setPendentes] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [ativa, setAtiva]         = useState(null);   // contagem aberta
  const [itens, setItens]         = useState([]);
  const [imeiInput, setImeiInput] = useState("");
  const [historico, setHistorico] = useState([]);
  const [proc, setProc]           = useState(false);
  const [resumo, setResumo]       = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (ciclo) carregar(); }, [ciclo]);
  useEffect(() => { if (ativa) inputRef.current?.focus(); }, [ativa]);

  async function carregar() {
    setLoading(true);
    try { setPendentes(await listarContagensPendentes(ciclo.id)); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  function addHist(item) {
    setHistorico(prev => [{ ...item, ts: Date.now() + Math.random() }, ...prev].slice(0, 30));
  }

  async function handleAbrir(cont) {
    setProc(true);
    setResumo(null);
    try {
      const res = await abrirContagem(cont.id, user.id, profile?.nome);
      if (!res.ok) { addHist({ tipo: "erro", msg: res.erro }); return; }
      setAtiva(res.contagem);
      setItens(res.itens);
      setHistorico([]);
    } catch (e) { addHist({ tipo: "erro", msg: e.message }); }
    finally { setProc(false); }
  }

  async function handleBipar(e) {
    e.preventDefault();
    const imei = imeiInput.trim();
    if (!imei || proc || !ativa) return;
    setImeiInput("");
    setProc(true);
    try {
      const res = await biparItem(ativa.id, imei);
      if (!res.ok) {
        addHist({ tipo: "erro", imei, msg: res.erro });
      } else if (res.veredito === "conferido") {
        addHist({ tipo: "ok", imei, msg: "conferido" });
      } else if (res.veredito === "conflito") {
        addHist({ tipo: "erro", imei, msg: "conflito · identificador duplicado no cadastro" });
      } else {
        const de = res.anterior || "sem endereço";
        addHist({ tipo: "aviso", imei, msg: `sobra · era esperado em ${de} — corrigido${res.reconciliou ? " · falta reconciliada" : ""}` });
      }
      setItens(await listarItens(ativa.id));
    } catch (e) { addHist({ tipo: "erro", imei, msg: e.message }); }
    finally {
      setProc(false);
      inputRef.current?.focus();
    }
  }

  async function handleFechar() {
    if (!ativa || proc) return;
    setProc(true);
    try {
      const res = await fecharContagem(ativa.id);
      if (!res.ok) { addHist({ tipo: "erro", msg: res.erro }); return; }
      setResumo(res);
      setAtiva(null);
      setItens([]);
      carregar();
    } catch (e) { addHist({ tipo: "erro", msg: e.message }); }
    finally { setProc(false); }
  }

  if (!ciclo) {
    return (
      <div className="text-center py-12 text-slate-400">
        <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhum ciclo aberto.</p>
        <p className="text-xs mt-1">Peça para abrir um ciclo na aba Gestão.</p>
      </div>
    );
  }

  // ── Lista de endereços do dia ──
  if (!ativa) {
    return (
      <div className="space-y-4">
        {resumo && (
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${
            resumo.perfeito ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-amber-50 text-amber-700 ring-amber-200"
          }`}>
            {resumo.perfeito ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
            <span className="font-semibold">
              Contagem fechada — {resumo.conferidos} conferidas
              {resumo.sobras > 0 && ` · ${resumo.sobras} sobra${resumo.sobras > 1 ? "s" : ""}`}
              {resumo.faltas > 0 && ` · ${resumo.faltas} falta${resumo.faltas > 1 ? "s" : ""}`}
              {resumo.perfeito && " · endereço perfeito!"}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm text-slate-500">Escolha um endereço para contar:</p>
          <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
          </div>
        ) : pendentes.length === 0 ? (
          <div className="text-center py-12 text-slate-400">
            <CheckCircle className="h-8 w-8 mx-auto mb-2 opacity-30 text-emerald-500" />
            <p className="text-sm font-semibold text-emerald-600">Nenhum endereço pendente!</p>
            <p className="text-xs mt-1">Peça para sortear o dia na aba Gestão.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {pendentes.map(c => (
              <button key={c.id} onClick={() => handleAbrir(c)} disabled={proc}
                className="text-left bg-white rounded-xl p-4 ring-1 ring-slate-200 hover:ring-purple-300 hover:bg-purple-50 transition-all disabled:opacity-50">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-[#7F2D92] shrink-0" />
                  <span className="font-mono font-bold text-slate-800 text-sm">{c.endereco}</span>
                </div>
                {c.status === "em_contagem" && (
                  <div className="text-xs text-amber-600 font-semibold mt-1">
                    em contagem · {c.encontradas} de {c.esperadas}
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── Contagem aberta ──
  const esperados  = itens.filter(i => i.veredito === "esperado");
  const conferidos = itens.filter(i => i.veredito === "conferido").length;
  const sobras     = itens.filter(i => ["sobra", "conflito"].includes(i.veredito)).length;
  const total      = ativa.esperadas || 0;
  const pct        = total > 0 ? Math.round((conferidos / total) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setAtiva(null); setItens([]); carregar(); }}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Trocar endereço
        </button>
        <div className="flex-1">
          <h3 className="font-mono font-black text-slate-800 text-sm">{ativa.endereco}</h3>
          <p className="text-xs text-slate-500">{total} esperadas · {conferidos} conferidas · {sobras} sobra{sobras !== 1 ? "s" : ""}</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">Em contagem</span>
      </div>

      <Card>
        <Barra pct={pct} />
        <h3 className="font-black text-slate-800 text-sm mt-4 mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-[#7F2D92]" /> Bipar identificador
        </h3>
        <form onSubmit={handleBipar} className="flex gap-3">
          <input ref={inputRef} type="text" value={imeiInput} onChange={e => setImeiInput(e.target.value)}
            placeholder="Bipe o IMEI ou serial..." autoComplete="off"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          <button type="submit" disabled={!imeiInput.trim() || proc}
            className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
            {proc ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Confirmar
          </button>
        </form>
      </Card>

      {historico.length > 0 && (
        <Card>
          <h3 className="font-black text-slate-800 text-sm mb-3">Últimos bipes</h3>
          <div className="space-y-2">
            {historico.map(h => (
              <div key={h.ts} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${
                h.tipo === "ok"    ? "bg-emerald-50 ring-emerald-200" :
                h.tipo === "aviso" ? "bg-amber-50 ring-amber-200" :
                "bg-red-50 ring-red-200"
              }`}>
                {h.tipo === "ok"    ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> :
                 h.tipo === "aviso" ? <ArrowLeftRight className="h-4 w-4 text-amber-600 shrink-0" /> :
                 <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                <div className="min-w-0">
                  {h.imei && <div className={`text-xs font-mono font-bold ${
                    h.tipo === "ok" ? "text-emerald-800" : h.tipo === "aviso" ? "text-amber-800" : "text-red-800"
                  }`}>{h.imei}</div>}
                  <div className={`text-xs ${
                    h.tipo === "ok" ? "text-emerald-700" : h.tipo === "aviso" ? "text-amber-700" : "text-red-700"
                  }`}>{h.msg}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card>
        <h3 className="font-black text-slate-800 text-sm mb-3">
          Ainda não apareceram ({esperados.length})
        </h3>
        {esperados.length === 0 ? (
          <p className="text-xs text-emerald-600 font-semibold">Tudo que era esperado foi encontrado.</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {esperados.map(i => (
              <span key={i.id} className="text-xs font-mono px-2 py-1 rounded-lg bg-slate-50 text-slate-500 ring-1 ring-slate-200">
                {i.imei || "—"}
              </span>
            ))}
          </div>
        )}
        <button onClick={handleFechar} disabled={proc}
          className="mt-4 flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition disabled:opacity-50">
          <Lock className="h-4 w-4" /> Fechar contagem
        </button>
        {esperados.length > 0 && (
          <p className="text-xs text-amber-600 mt-2">
            Ao fechar, {esperados.length} peça{esperados.length > 1 ? "s serão marcadas" : " será marcada"} como falta.
          </p>
        )}
      </Card>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA GESTÃO
// ══════════════════════════════════════════════════════════
function TabGestao({ ciclo, onCicloMudou, podeSortear }) {
  const { user } = useAuth();
  const [painel, setPainel]     = useState(null);
  const [conflitos, setConflitos] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [proc, setProc]         = useState(false);
  const [feedback, setFeedback] = useState(null);

  useEffect(() => { carregar(); }, [ciclo]);

  async function carregar() {
    if (!ciclo) { setLoading(false); return; }
    setLoading(true);
    try {
      const [p, c] = await Promise.all([painelCiclo(ciclo.id), listarConflitos(ciclo.id)]);
      setPainel(p);
      setConflitos(c);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  async function handleAbrirCiclo() {
    setProc(true);
    try {
      const res = await abrirCiclo(nomeDoCicloAtual(), user.id);
      if (!res.ok) setFeedback({ tipo: "erro", msg: res.erro });
      else { setFeedback({ tipo: "ok", msg: `✓ ${res.ciclo.nome} aberto.` }); onCicloMudou(); }
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setProc(false); }
  }

  async function handleSortear() {
    setProc(true);
    setFeedback(null);
    try {
      const res = await sortearDia(ciclo.id);
      if (!res.ok) setFeedback({ tipo: "aviso", msg: res.erro });
      else setFeedback({ tipo: "ok", msg: `✓ ${res.criadas} endereços sorteados · ${fmtN(res.restantes)} restantes no ciclo.` });
      carregar();
    } catch (e) { setFeedback({ tipo: "erro", msg: e.message }); }
    finally { setProc(false); }
  }

  if (!ciclo) {
    return (
      <div className="space-y-4">
        {feedback && (
          <div className={`flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${
            feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
          }`}>
            <span className="font-semibold">{feedback.msg}</span>
          </div>
        )}
        <div className="text-center py-12">
          <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-30 text-slate-400" />
          <p className="text-sm text-slate-500 mb-4">Nenhum ciclo aberto.</p>
          {podeSortear ? (
            <button onClick={handleAbrirCiclo} disabled={proc}
              className="bg-[#7F2D92] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#5B1E74] transition disabled:opacity-50">
              {proc ? "Abrindo..." : `Abrir ${nomeDoCicloAtual()}`}
            </button>
          ) : (
            <p className="text-xs text-slate-400">Só o gestor pode abrir um ciclo.</p>
          )}
        </div>
      </div>
    );
  }

  const pctCiclo = painel && painel.totalEnderecos > 0
    ? Math.round((painel.concluidas / painel.totalEnderecos) * 100) : 0;

  return (
    <div className="space-y-4">
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

      <Card>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <div>
            <div className="font-black text-slate-800">{ciclo.nome}</div>
            <div className="text-xs text-slate-500 mt-0.5">
              aberto em {fmtData(ciclo.inicio)} · terça a sábado
              {painel && ` · ${fmtN(painel.concluidas)} de ${fmtN(painel.totalEnderecos)} endereços`}
            </div>
          </div>
          {podeSortear && (
            <button onClick={handleSortear} disabled={proc}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-[#7F2D92] text-white hover:bg-[#5B1E74] transition disabled:opacity-50">
              {proc ? <Loader className="h-3 w-3 animate-spin" /> : <Dices className="h-3 w-3" />}
              Sortear o dia
            </button>
          )}
        </div>
        <Barra pct={pctCiclo} />
      </Card>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : painel && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <KpiMini label="Acuracidade por peça"     value={fmtPct(painel.acuraciaPeca)}
              color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
            <KpiMini label="Acuracidade por endereço" value={fmtPct(painel.acuraciaEndereco)}
              sub={`${fmtN(painel.perfeitos)} endereços perfeitos`}
              color="bg-blue-50 ring-blue-200 text-blue-700" />
          </div>

          <Card>
            <h3 className="font-black text-slate-800 text-sm mb-3">Divergências do ciclo</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-emerald-700 font-semibold">Conferidas</span>
                <span className="text-slate-600">{fmtN(painel.conferidos)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700 font-semibold">Sobras (corrigidas)</span>
                <span className="text-slate-600">{fmtN(painel.sobras)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-amber-700 font-semibold">Faltas reconciliadas</span>
                <span className="text-slate-600">{fmtN(painel.reconciliadas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-700 font-semibold">Fantasmas</span>
                <span className="text-slate-600">{fmtN(painel.fantasmas)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-700 font-semibold">Conflitos de cadastro</span>
                <span className="text-slate-600">{fmtN(painel.conflitos)}</span>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-3">Fantasmas só viram perda quando o ciclo fecha.</p>
          </Card>

          {conflitos.length > 0 && (
            <Card className="ring-1 ring-red-200">
              <h3 className="font-black text-slate-800 text-sm mb-3">
                Conflitos para tratar com a Assurant ({conflitos.length})
              </h3>
              <div className="space-y-2">
                {conflitos.map((c, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 bg-red-50 rounded-lg px-3 py-2 ring-1 ring-red-200">
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-bold text-red-800">{c.imei}</div>
                      <div className="text-xs text-red-600">era esperado em {c.endereco_anterior || "sem endereço"}</div>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">{fmtData(c.bipado_em)}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA
// ══════════════════════════════════════════════════════════
export default function InventarioPage() {
  const { profile } = useAuth();
  const [aba, setAba]     = useState("contagem");
  const [ciclo, setCiclo] = useState(null);
  const [loading, setLoading] = useState(true);

  const podeSortear = profile?.is_master || profile?.telas_permitidas?.includes("/inventario/sortear");

  useEffect(() => { carregarCiclo(); }, []);

  async function carregarCiclo() {
    setLoading(true);
    try { setCiclo(await cicloAberto()); }
    catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const ABAS = [
    { key: "contagem", label: "Contagem", icon: ClipboardList },
    { key: "gestao",   label: "Gestão",   icon: BarChart3     },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">📋</span>
        <div>
          <h2 className="text-lg font-black text-slate-800">Inventário Cíclico</h2>
          <p className="text-xs text-slate-500">
            Contagem por endereço · {ciclo ? ciclo.nome : "nenhum ciclo aberto"}
          </p>
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

      {aba === "contagem" && <TabContagem ciclo={ciclo} />}
      {aba === "gestao"   && <TabGestao ciclo={ciclo} onCicloMudou={carregarCiclo} podeSortear={podeSortear} />}
    </div>
  );
}