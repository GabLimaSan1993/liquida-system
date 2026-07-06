import { useState, useRef, useEffect } from "react";
import {
  Search, CheckCircle, AlertTriangle,
  ArrowLeft, Lock, FileText, Package, Tag, Loader,
} from "lucide-react";
import { biparNaMesa, confirmarPassoMesa4 } from "../services/B2CEmbalagemService.js";
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

// Painel dos 3 passos da mesa 4 (NF colada → selado → etiquetado)
function Mesa4Panel({ ativo, proc, onPasso, onFechar }) {
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
    </div>
  );
}

export default function B2CEmbalagemMesaPage() {
  const { user, profile } = useAuth();
  const [mesa, setMesa]           = useState(null);
  const [imeiInput, setImeiInput] = useState("");
  const [historico, setHistorico] = useState([]);
  const [ativo, setAtivo]         = useState(null);   // aparelho em finalização na mesa 4
  const [proc, setProc]           = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { if (mesa) inputRef.current?.focus(); }, [mesa, ativo]);

  const nome   = profile?.nome || "Usuário";
  const feitos = historico.filter(h => h.ok).length;

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
        <Mesa4Panel ativo={ativo} proc={proc} onPasso={confirmarPasso} onFechar={() => setAtivo(null)} />
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