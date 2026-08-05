import { useState, useRef, useEffect } from "react";
import {
  Search, CheckCircle, AlertTriangle, Lock, FileText, Package, Tag, Loader,
  ListChecks, RefreshCw, Printer, Download,
} from "lucide-react";
import { biparNaMesa, confirmarPassoMesa4, listarPendentesMesa } from "../services/B2CEmbalagemService.js";
import { buscarEtiqueta, registrarImpressao, baixarZpl } from "../services/etiquetasService.js";
import { useAuth } from "../AuthContext.jsx";

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

// Bipagem da chave da NF → acha a etiqueta do marketplace → baixa o .zpl p/ a Zebra.
// A chave carrega o número da NF (posições 26–34), então funciona mesmo antes de o
// XML daquela nota ter sido importado. Imprimir é o gesto que conclui a embalagem.
function PainelEtiqueta({ pedido, userId, onImpresso, bloqueado }) {
  const [chave, setChave] = useState("");
  const [busca, setBusca] = useState(null);
  const [proc, setProc]   = useState(false);
  const ref = useRef(null);

  useEffect(() => { if (!bloqueado) ref.current?.focus(); }, [bloqueado]);

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
    try { await registrarImpressao(et.id, userId); } catch (err) { console.error(err); }
    onImpresso?.();   // conclui a embalagem
  }

  const nfPedido = pedido?.numero_nf ? String(parseInt(pedido.numero_nf, 10)) : null;
  const divergente = busca?.ok && nfPedido && busca.nf !== nfPedido;

  if (bloqueado) {
    return (
      <div className="mt-3 rounded-xl bg-slate-50 ring-1 ring-slate-200 p-4 opacity-60">
        <div className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
          <Lock className="h-3.5 w-3.5" /> Etiqueta do e-commerce — conclua os passos acima
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl bg-slate-50 ring-1 ring-purple-200 p-4">
      <div className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
        <Printer className="h-3.5 w-3.5 text-purple-500" /> Etiqueta do e-commerce
        <span className="font-normal text-slate-400">· imprimir conclui a embalagem</span>
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
                  <span className="block text-amber-600 font-semibold">já impressa {et.total_impressoes}x</span>
                )}
              </div>
              <button onClick={() => handleImprimir(et)} disabled={divergente}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5" />
                {et.total_impressoes > 0 ? "Imprimir de novo" : "Imprimir e concluir"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Painel de finalização do aparelho na mesa
function PainelAtivo({ ativo, proc, onPasso, onFechar, onEtiquetaImpressa, userId }) {
  const { pedido, passos, semNF } = ativo;
  const imei = pedido.imei_bipado || pedido.imei_alocado;
  const steps = [
    { key: "nf_colada", campo: "emb_nf_colada", label: "NF impressa e colada", icon: FileText, bloq: semNF },
    { key: "selado",    campo: "emb_selado",    label: "Saco selado",          icon: Package,  dep: "emb_nf_colada" },
  ];

  return (
    <div className="bg-white rounded-2xl p-5 ring-2 ring-[#7F2D92] shadow-sm">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div className="min-w-0">
          <div className="font-mono font-bold text-slate-800 text-sm">{imei}</div>
          <div className="text-xs text-slate-500">
            #{pedido.id_anymarket}{pedido.marketplace ? ` · ${pedido.marketplace}` : ""}{pedido.numero_nf ? ` · NF ${pedido.numero_nf}` : ""}
          </div>
          {pedido.titulo_produto && (
            <div className="text-xs text-slate-400 mt-0.5">{pedido.titulo_produto}</div>
          )}
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
                feito     ? "bg-emerald-50 ring-emerald-200" :
                bloqueado ? "bg-slate-50 ring-slate-200 opacity-60 cursor-not-allowed" :
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

      <PainelEtiqueta
        pedido={pedido}
        userId={userId}
        bloqueado={!passos.emb_selado}
        onImpresso={onEtiquetaImpressa}
      />
    </div>
  );
}

// Fila da mesa, agrupada por lista de picking
function FilaMesa({ dados, loading, onAtualizar }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
          <ListChecks className="h-4 w-4 text-[#7F2D92]" /> Aguardando na mesa
          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
            {dados.total} aparelho{dados.total === 1 ? "" : "s"} · {dados.grupos.length} lista{dados.grupos.length === 1 ? "" : "s"}
          </span>
        </h3>
        <button onClick={onAtualizar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Loader className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : dados.grupos.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">Nada aguardando — tudo etiquetado.</p>
      ) : (
        <div className="space-y-3">
          {dados.grupos.map(g => (
            <div key={g.grupo_id || "sem"} className="rounded-xl ring-1 ring-slate-100 overflow-hidden">
              <div className="flex items-center justify-between bg-slate-50 px-4 py-2">
                <span className="text-xs font-black text-slate-700 flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5 text-purple-500" />
                  {g.numero != null ? `Lista de picking · Grupo #${g.numero}` : "Sem lista"}
                </span>
                <span className="text-xs text-slate-500">{g.itens.length} aparelho{g.itens.length === 1 ? "" : "s"}</span>
              </div>
              <div className="divide-y divide-slate-100">
                {g.itens.map(it => (
                  <div key={it.id} className="flex items-center justify-between gap-3 flex-wrap px-4 py-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-700">{it.imei}</span>
                        <GradeBadge grade={it.grade} />
                        {it.semNF && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700 ring-1 ring-amber-200">
                            sem NF
                          </span>
                        )}
                        {it.naMesa && (
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                            na mesa · {it.passos}/3
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500 truncate">{it.modelo}</div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{it.cliente}</span>
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
  const [imeiInput, setImeiInput] = useState("");
  const [historico, setHistorico] = useState([]);
  const [ativo, setAtivo]         = useState(null);
  const [proc, setProc]           = useState(false);
  const [pendentes, setPendentes] = useState({ grupos: [], total: 0 });
  const [loadingPend, setLoadingPend] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, [ativo]);
  useEffect(() => { carregarPendentes(); }, []);

  const nome   = profile?.nome || "Usuário";
  const feitos = historico.filter(h => h.ok).length;

  async function carregarPendentes() {
    setLoadingPend(true);
    try {
      const res = await listarPendentesMesa();
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
      const res = await biparNaMesa(imei, "mesa_4", user.id, nome);
      if (!res.ok) {
        addHist({ ok: false, imei, msg: res.erro });
      } else {
        setAtivo({
          pedido: res.pedido,
          semNF: res.semNF,
          passos: {
            emb_nf_colada:  !!res.pedido.emb_nf_colada,
            emb_selado:     !!res.pedido.emb_selado,
            emb_etiquetado: !!res.pedido.emb_etiquetado,
          },
        });
        addHist({ ok: true, imei, msg: `${res.reaberto ? "Reaberto" : "Na mesa"} — #${res.pedido.id_anymarket}` });
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
      carregarPendentes();
    }
  }

  // Imprimiu a etiqueta = passo final: conclui a embalagem
  async function handleEtiquetaImpressa() {
    await confirmarPasso("etiquetado");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Embalagem B2C</h2>
            <p className="text-xs text-slate-500">Bipe o IMEI · cole a NF · sele · imprima a etiqueta</p>
          </div>
        </div>
        <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
          {feitos} nesta sessão
        </span>
      </div>

      {ativo && (
        <PainelAtivo
          ativo={ativo}
          proc={proc}
          onPasso={confirmarPasso}
          onFechar={() => setAtivo(null)}
          onEtiquetaImpressa={handleEtiquetaImpressa}
          userId={user?.id}
        />
      )}

      <Card>
        <h3 className="font-black text-slate-800 text-sm flex items-center gap-2 mb-3">
          <Search className="h-4 w-4 text-[#7F2D92]" /> Bipar aparelho ou nota
        </h3>
        <form onSubmit={handleBipar} className="flex gap-2">
          <input
            ref={inputRef}
            value={imeiInput}
            onChange={e => setImeiInput(e.target.value)}
            placeholder="Bipe o IMEI, a chave da NF ou digite o número da nota..."
            className="flex-1 rounded-2xl ring-1 ring-slate-200 px-4 py-3 font-mono text-sm focus:ring-2 focus:ring-purple-400 outline-none"
            disabled={proc}
          />
          <button type="submit" disabled={proc || !imeiInput.trim()}
            className="px-6 py-3 rounded-2xl bg-[#7F2D92] text-white font-bold text-sm disabled:opacity-50 flex items-center gap-2">
            {proc ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            Confirmar
          </button>
        </form>
        <p className="text-xs text-slate-400 mt-2">
          Aceita IMEI (15 dígitos), chave da NF (44) ou o número da nota. Se faltar a NF, deixe para depois e rebipe quando a NF sair.
        </p>
      </Card>

      <FilaMesa dados={pendentes} loading={loadingPend} onAtualizar={carregarPendentes} />

      <Card>
        <h3 className="font-black text-slate-800 text-sm mb-3">Últimos bipes</h3>
        {historico.length === 0 ? (
          <p className="text-sm text-slate-400">Nenhum aparelho bipado ainda nesta sessão.</p>
        ) : (
          <div className="space-y-1.5">
            {historico.map(h => (
              <div key={h.ts} className="flex items-center gap-2 text-xs">
                {h.ok ? <CheckCircle className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      : <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />}
                <span className="font-mono text-slate-600">{h.imei}</span>
                <span className={h.ok ? "text-slate-500" : "text-red-600 font-semibold"}>{h.msg}</span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}