import { useState, useRef, useEffect } from "react";
import {
  Search, CheckCircle, AlertTriangle,
  ArrowLeft, Lock, FileText, Package, Tag, Loader,
  ListChecks, RefreshCw, Clock, Printer, Download,
} from "lucide-react";
import { biparNaMesa, confirmarPassoMesa4, listarPendentesMesa } from "../services/B2CEmbalagemService.js";
import { buscarEtiqueta, registrarImpressao, baixarZpl } from "../services/etiquetasService.js";
import { useAuth } from "../AuthContext.jsx";

const MESAS = [
  { key: "mesa_1", label: "Mesa 1", desc: "Recebimento das listas do picking" },
  { key: "mesa_2", label: "Mesa 2", desc: "Limpeza + caixa do aparelho" },
  { key: "mesa_3", label: "Mesa 3", desc: "Caixa parda + saco de transporte" },
  { key: "mesa_4", label: "Mesa 4", desc: "NF, selagem e etiqueta" },
];

function mesaLabel(k) {
  return ({ mesa_1: "Mesa 1", mesa_2: "Mesa 2", mesa_3: "Mesa 3", mesa_4: "Mesa 4" })[k] || k;
}

function GradeBadge({ grade }) {
  if (!grade) return <span className="text-slate-300 text-xs">—</span>;
  const g = grade.toLowerCase();
  const cls =
    g.includes("like new")  ? "bg-emerald-50 text-emerald-700" :
    g.includes("excelente") ? "bg-blue-50 text-blue-700"       :
    g.includes("muito bom") ? "bg-purple-50 text-purple-700"   :
    g.includes("bom")       ? "bg-yellow-50 text-yellow-700"   :
    "bg-slate-50 text-slate-500";
  return <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${cls}`}>{grade}</span>;
}

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl">📦</span>
      <div>
        <h2 className="text-lg font-black text-slate-800">Embalagem — Mesas</h2>
        <p className="text-xs text-slate-500">Bipagem por mesa · esteira 1 → 2 → 3 → 4 → saída</p>
      </div>
    </div>
  );
}

// Bipagem da chave da NF → acha a etiqueta do marketplace → baixa o .zpl p/ a Zebra.
// A chave carrega o número da NF (posições 26–34), então funciona mesmo antes de o
// XML daquela nota ter sido importado no sistema.
function PainelEtiqueta({ pedido, userId, onImpresso }) {
  const [chave, setChave]   = useState("");
  const [busca, setBusca]   = useState(null);
  const [proc, setProc]     = useState(false);
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  async function handleBuscar(e) {
    e.preventDefault();
    const v = chave.trim();
    if (!v || proc) return;
    setProc(true);
    try {
      const r = await buscarEtiqueta(v);
      setBusca(r);
      if (r.ok) setChave("");
    } catch (err) {
      setBusca({ ok: false, erro: err.message });
    } finally {
      setProc(false);
      ref.current?.focus();
    }
  }

  async function handleImprimir(et) {
    baixarZpl(et);
    try {
      await registrarImpressao(et.id, userId);
      setBusca(prev => ({
        ...prev,
        etiquetas: prev.etiquetas.map(x =>
          x.id === et.id ? { ...x, total_impressoes: (x.total_impressoes || 0) + 1 } : x),
      }));
      onImpresso?.();
    } catch (err) { console.error(err); }
  }

  // Confere se a etiqueta achada é mesmo a do pedido que está na mesa
  const nfPedido = pedido?.numero_nf ? String(parseInt(pedido.numero_nf, 10)) : null;
  const divergente = busca?.ok && nfPedido && busca.nf !== nfPedido;

  return (
    <div className="mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4">
      <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
        <Printer className="h-3.5 w-3.5 text-purple-500" /> Etiqueta do e-commerce
      </div>

      <form onSubmit={handleBuscar} className="flex gap-2">
        <input
          ref={ref}
          value={chave}
          onChange={e => setChave(e.target.value)}
          placeholder="Bipe a chave da NF na caixa"
          className="flex-1 rounded-xl ring-1 ring-slate-200 px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-purple-400 outline-none"
          disabled={proc}
        />
        <button type="submit" disabled={proc || !chave.trim()}
          className="px-4 py-2 rounded-xl bg-[#7F2D92] text-white text-sm font-bold disabled:opacity-50">
          {proc ? <Loader className="h-4 w-4 animate-spin" /> : "Buscar"}
        </button>
      </form>

      {busca && !busca.ok && (
        <div className="mt-2 flex items-start gap-2 text-xs font-semibold text-red-700 bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> {busca.erro}
        </div>
      )}

      {busca?.ok && (
        <div className="mt-2 space-y-2">
          {divergente && (
            <div className="flex items-start gap-2 text-xs font-semibold text-amber-800 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              A chave bipada é da NF {busca.nf}, mas o aparelho na mesa é da NF {nfPedido}. Confira a caixa.
            </div>
          )}
          {busca.etiquetas.map(et => (
            <div key={et.id} className="flex items-center justify-between gap-3 flex-wrap bg-white rounded-xl ring-1 ring-slate-200 px-3 py-2">
              <div className="text-xs">
                <span className="font-black text-slate-700">NF {et.numero_nf}</span>
                {et.volume > 1 && <span className="text-slate-500"> · vol {et.volume}</span>}
                <span className="text-slate-500"> · {et.marketplace}</span>
                {et.total_impressoes > 0 && (
                  <span className="block text-amber-600 font-semibold">
                    já impressa {et.total_impressoes}x
                  </span>
                )}
              </div>
              <button onClick={() => handleImprimir(et)}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {et.total_impressoes > 0 ? "Imprimir de novo" : "Imprimir etiqueta"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Painel dos 3 passos da mesa 4 (NF colada → selado → etiquetado)
function Mesa4Panel({ ativo, proc, onPasso, onFechar, userId }) {
  const { pedido, passos, semNF } = ativo;
  const imei = pedido.imei_bipado || pedido.imei_alocado;
  const steps = [
    { key: "nf_colada",  campo: "emb_nf_colada",  label: "NF impressa e colada",     icon: FileText, bloq: semNF },
    { key: "selado",     campo: "emb_selado",     label: "Saco selado",              icon: Package,  dep: "emb_nf_colada" },
    { key: "etiquetado", campo: "emb_etiquetado", label: "Etiqueta do e-commerce",   icon: Tag,      dep: "emb_selado" },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 ring-2 ring-[#7F2D92] shadow-sm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="font-mono font-bold text-slate-800 text-sm">{imei}</div>
          <div className="text-xs text-slate-500">
            #{pedido.id_anymarket}{pedido.marketplace ? ` · ${pedido.marketplace}` : ""}{pedido.numero_nf ? ` · NF ${pedido.numero_nf}` : ""}
          </div>
        </div>
        <button onClick={onFechar} className="text-xs text-slate-400 hover:text-slate-600 shrink-0">Deixar p/ depois</button>
      </div>

      <div className="space-y-2">
        {steps.map(s => {
          const feito = passos[s.campo];
          const depFalta = s.dep && !passos[s.dep];
          const bloqueado = s.bloq || depFalta;
          const Icon = s.icon;
          return (
            <button key={s.key} disabled={feito || bloqueado || proc} onClick={() => onPasso(s.key)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 ring-1 transition text-left ${
                feito       ? "bg-emerald-50 ring-emerald-200" :
                bloqueado   ? "bg-slate-50 ring-slate-200 opacity-60 cursor-not-allowed" :
                "bg-white ring-slate-200 hover:bg-purple-50 hover:ring-purple-300"
              }`}>
              {feito ? <CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                : s.bloq ? <Lock className="h-5 w-5 text-amber-500 shrink-0" />
                : <Icon className="h-5 w-5 text-slate-400 shrink-0" />}
              <span className={`text-sm font-semibold ${feito ? "text-emerald-700" : bloqueado ? "text-slate-400" : "text-slate-700"}`}>
                {s.label}
                {s.bloq && <span className="block text-xs font-normal text-amber-600">Falta faturar — sem NF lançada</span>}
              </span>
            </button>
          );
        })}
      </div>

      {/* Etiqueta do marketplace: aparece quando o saco já está selado e falta etiquetar */}
      {passos.emb_selado && !passos.emb_etiquetado && (
        <PainelEtiqueta pedido={pedido} userId={userId} />
      )}
    </div>
  );
}

// Lista de pendentes da mesa, agrupada por lista de picking (grupo)
function PendentesMesa({ mesa, dados, loading, onAtualizar }) {
  const total = dados?.total || 0;
  const grupos = dados?.grupos || [];
  const titulo = mesa === "mesa_1" ? "Aguardando a Mesa 1" : `Aguardando a ${mesaLabel(mesa)}`;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <ListChecks className="h-4 w-4 text-[#7F2D92]" />
        <h3 className="font-black text-slate-800 text-sm">{titulo}</h3>
        {total > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
            {total} aparelho{total > 1 ? "s" : ""} · {grupos.length} lista{grupos.length > 1 ? "s" : ""}
          </span>
        )}
        <button onClick={onAtualizar} className="ml-auto text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-slate-500 py-4">
          <Loader className="h-4 w-4 animate-spin text-purple-500" /> Carregando pendentes...
        </div>
      ) : total === 0 ? (
        <div className="flex items-center gap-2 text-xs text-slate-400 py-4">
          <Clock className="h-4 w-4 opacity-40" />
          Nenhum aparelho aguardando esta mesa.
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g, gi) => (
            <div key={g.grupo_id || `sem-grupo-${gi}`} className="rounded-xl ring-1 ring-slate-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
                <ListChecks className="h-3.5 w-3.5 text-[#7F2D92]" />
                <span className="text-xs font-black text-slate-700">
                  {g.numero != null ? `Lista de picking · Grupo #${g.numero}` : "Sem grupo"}
                </span>
                <span className="ml-auto text-xs text-slate-500 font-semibold">
                  {g.itens.length} aparelho{g.itens.length > 1 ? "s" : ""}
                </span>
              </div>
              <div className="divide-y divide-slate-100">
                {g.itens.map(it => (
                  <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-800 text-xs">{it.imei || "—"}</span>
                        <GradeBadge grade={it.grade} />
                      </div>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{it.modelo}</p>
                    </div>
                    {it.cliente && <span className="text-xs text-slate-400 shrink-0 truncate max-w-[40%]">{it.cliente}</span>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function B2CEmbalagemMesaPage() {
  const { user, profile } = useAuth();
  const [mesa, setMesa]           = useState(null);
  const [imeiInput, setImeiInput] = useState("");
  const [historico, setHistorico] = useState([]);
  const [ativo, setAtivo]         = useState(null);   // aparelho em finalização na mesa 4
  const [proc, setProc]           = useState(false);
  const [pendentes, setPendentes]         = useState({ grupos: [], total: 0 });
  const [loadingPend, setLoadingPend]     = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (mesa) inputRef.current?.focus(); }, [mesa, ativo]);
  useEffect(() => { if (mesa) carregarPendentes(); }, [mesa]);

  const nome   = profile?.nome || "Usuário";
  const feitos = historico.filter(h => h.ok).length;

  async function carregarPendentes() {
    if (!mesa) return;
    setLoadingPend(true);
    try {
      const res = await listarPendentesMesa(mesa);
      if (res.ok) setPendentes({ grupos: res.grupos, total: res.total });
      else setPendentes({ grupos: [], total: 0 });
    } catch (e) {
      console.error(e);
      setPendentes({ grupos: [], total: 0 });
    } finally {
      setLoadingPend(false);
    }
  }

  function addHist(item) {
    setHistorico(prev => [{ ...item, ts: Date.now() + Math.random() }, ...prev].slice(0, 30));
  }

  async function handleBipar(e) {
    e.preventDefault();
    const imei = imeiInput.trim();
    if (!imei || proc) return;
    setImeiInput("");
    setProc(true);
    try {
      const res = await biparNaMesa(imei, mesa, user.id, nome);
      if (!res.ok) {
        addHist({ ok: false, imei, msg: res.erro });
      } else if (mesa === "mesa_4") {
        setAtivo({
          pedido: res.pedido,
          semNF: res.semNF,
          passos: {
            emb_nf_colada:  !!res.pedido.emb_nf_colada,
            emb_selado:     !!res.pedido.emb_selado,
            emb_etiquetado: !!res.pedido.emb_etiquetado,
          },
        });
        addHist({ ok: true, imei, msg: `${res.reaberto ? "Reaberto" : "Chegou na Mesa 4"} — #${res.pedido.id_anymarket}` });
      } else {
        addHist({ ok: true, imei, msg: `Avançou para ${mesaLabel(mesa)} — #${res.pedido.id_anymarket}` });
      }
    } catch (err) {
      addHist({ ok: false, imei, msg: err.message });
    } finally {
      setProc(false);
      inputRef.current?.focus();
      carregarPendentes();
    }
  }

  async function confirmarPasso(passo) {
    if (!ativo || proc) return;
    setProc(true);
    const imei = ativo.pedido.imei_bipado || ativo.pedido.imei_alocado;
    try {
      const res = await confirmarPassoMesa4(ativo.pedido.id, passo, user.id, nome);
      if (!res.ok) {
        addHist({ ok: false, imei, msg: res.erro });
      } else if (res.finalizou) {
        addHist({ ok: true, imei, msg: `Liberado para saída — #${ativo.pedido.id_anymarket}` });
        setAtivo(null);
      } else {
        setAtivo(prev => ({ ...prev, passos: { ...prev.passos, ...res.passos } }));
      }
    } catch (err) {
      addHist({ ok: false, imei, msg: err.message });
    } finally {
      setProc(false);
      inputRef.current?.focus();
    }
  }

  // ── Seleção de mesa ──
  if (!mesa) {
    return (
      <div className="space-y-5">
        <Header />
        <p className="text-sm text-slate-500">Escolha a sua mesa para começar a bipar:</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {MESAS.map(m => (
            <button key={m.key} onClick={() => { setMesa(m.key); setHistorico([]); setAtivo(null); }}
              className="text-left bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm hover:ring-purple-300 hover:bg-purple-50 transition-all">
              <div className="font-black text-slate-800">{m.label}</div>
              <div className="text-xs text-slate-500 mt-1">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  const mesaAtual = MESAS.find(m => m.key === mesa);

  return (
    <div className="space-y-4">
      <Header />

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={() => { setMesa(null); setAtivo(null); }}
          className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Trocar mesa
        </button>
        <div className="flex-1">
          <h3 className="font-black text-slate-800 text-sm">{mesaAtual.label}</h3>
          <p className="text-xs text-slate-500">{mesaAtual.desc}</p>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          {feitos} nesta sessão
        </span>
      </div>

      {mesa === "mesa_4" && ativo && (
        <Mesa4Panel ativo={ativo} proc={proc} onPasso={confirmarPasso} onFechar={() => setAtivo(null)} userId={user?.id} />
      )}

      <Card>
        <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-[#7F2D92]" /> Bipar IMEI
        </h3>
        <form onSubmit={handleBipar} className="flex gap-3">
          <input ref={inputRef} type="text" value={imeiInput} onChange={e => setImeiInput(e.target.value)}
            placeholder="Bipe o IMEI do aparelho..." autoComplete="off"
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          <button type="submit" disabled={!imeiInput.trim() || proc}
            className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-semibold hover:bg-[#5B1E74] transition disabled:opacity-50">
            {proc ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />} Confirmar
          </button>
        </form>
        {mesa === "mesa_4" && (
          <p className="text-xs text-slate-400 mt-2">Bipe o aparelho para abrir os 3 passos de finalização. Se faltar a NF, deixe para depois e rebipe quando a NF sair.</p>
        )}
      </Card>

      <PendentesMesa mesa={mesa} dados={pendentes} loading={loadingPend} onAtualizar={carregarPendentes} />

      <Card>
        <h3 className="font-black text-slate-800 text-sm mb-3">Últimos bipes</h3>
        {historico.length === 0 ? (
          <p className="text-xs text-slate-400">Nenhum aparelho bipado ainda nesta sessão.</p>
        ) : (
          <div className="space-y-2">
            {historico.map(h => (
              <div key={h.ts} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1 ${h.ok ? "bg-emerald-50 ring-emerald-200" : "bg-red-50 ring-red-200"}`}>
                {h.ok ? <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />}
                <div className="min-w-0">
                  {h.imei && <div className={`text-xs font-mono font-bold ${h.ok ? "text-emerald-800" : "text-red-800"}`}>{h.imei}</div>}
                  <div className={`text-xs ${h.ok ? "text-emerald-700" : "text-red-700"}`}>{h.msg}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}