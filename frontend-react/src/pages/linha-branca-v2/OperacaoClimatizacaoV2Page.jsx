import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Snowflake,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import {
  fetchKitsParaOperacao,
  finalizarOperacaoClimatizacao,
  iniciarOperacaoClimatizacao,
  pausarOperacaoClimatizacao,
  retomarOperacaoClimatizacao,
} from "../../services/climatizacaoService.js";

const TEMPO_TESTE = 30 * 60;

function segundosOperados(op, agoraMs) {
  if (!op?.iniciado_em) return 0;
  const inicio = new Date(op.iniciado_em).getTime();
  const fim = op.finalizado_em ? new Date(op.finalizado_em).getTime() : agoraMs;
  let pausado = Number(op.tempo_pausado_seg || 0);
  if (op.status === "pausado" && op.pausa_iniciada_em) {
    pausado += Math.max(0, Math.floor((agoraMs - new Date(op.pausa_iniciada_em).getTime()) / 1000));
  }
  return Math.max(0, Math.floor((fim - inicio) / 1000) - pausado);
}

function formatar(seg) {
  const min = Math.floor(seg / 60).toString().padStart(2, "0");
  const sec = Math.floor(seg % 60).toString().padStart(2, "0");
  return `${min}:${sec}`;
}

export default function OperacaoClimatizacaoV2Page() {
  const { profile } = useAuth();
  const [kits, setKits] = useState([]);
  const [kitId, setKitId] = useState("");
  const [agora, setAgora] = useState(Date.now());
  const [motivoPausa, setMotivoPausa] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [falhas, setFalhas] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const kit = useMemo(() => kits.find((k) => String(k.id) === String(kitId)) || null, [kits, kitId]);
  const operacao = kit?.operacoes?.find((op) => ["em_teste", "pausado"].includes(op.status)) || null;
  const tempo = segundosOperados(operacao, agora);
  const faltante = Math.max(0, TEMPO_TESTE - tempo);
  const testeCompleto = tempo >= TEMPO_TESTE;

  async function carregar(preservar = true) {
    try {
      setLoading(true);
      const data = await fetchKitsParaOperacao();
      setKits(data);
      if (!preservar || !data.some((k) => String(k.id) === String(kitId))) {
        setKitId(data[0]?.id ? String(data[0].id) : "");
      }
    } catch (error) {
      setMensagem(`Erro ao carregar kits: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(false); }, []);
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setFalhas({});
    setObservacoes("");
    setMotivoPausa("");
  }, [kitId]);

  async function iniciar() {
    try {
      setSaving(true);
      await iniciarOperacaoClimatizacao(kit.id, profile?.nome);
      await carregar();
      setMensagem(`Teste do ${kit.codigo} iniciado.`);
    } catch (error) {
      setMensagem(`Erro ao iniciar: ${error.message}`);
    } finally { setSaving(false); }
  }

  async function pausar() {
    if (!motivoPausa.trim()) {
      setMensagem("Informe o motivo da pausa por falha antes de pausar.");
      return;
    }
    try {
      setSaving(true);
      await pausarOperacaoClimatizacao(operacao.id, motivoPausa);
      setMotivoPausa("");
      await carregar();
      setMensagem("Teste pausado e falha registrada.");
    } catch (error) {
      setMensagem(`Erro ao pausar: ${error.message}`);
    } finally { setSaving(false); }
  }

  async function retomar() {
    try {
      setSaving(true);
      await retomarOperacaoClimatizacao(operacao.id);
      await carregar();
      setMensagem("Teste retomado.");
    } catch (error) {
      setMensagem(`Erro ao retomar: ${error.message}`);
    } finally { setSaving(false); }
  }

  function setDestino(componenteId, destino) {
    setFalhas((current) => {
      const next = { ...current };
      if (!destino) delete next[componenteId];
      else next[componenteId] = destino;
      return next;
    });
  }

  async function finalizar() {
    if (!operacao) return;
    const listaFalhas = Object.entries(falhas).map(([componente_id, destino]) => ({
      componente_id: Number(componente_id),
      destino,
    }));

    if (listaFalhas.length === 0 && !testeCompleto) {
      setMensagem(`Para aprovar o kit, complete os 30 minutos de teste. Restam ${formatar(faltante)}.`);
      return;
    }

    try {
      setSaving(true);
      await finalizarOperacaoClimatizacao(operacao.id, listaFalhas, observacoes, profile?.nome);
      const codigo = kit.codigo;
      await carregar(false);
      setMensagem(listaFalhas.length ? `${codigo} encerrado com reprovação parcial/total e componentes redirecionados.` : `${codigo} aprovado e enviado para Higienização.`);
    } catch (error) {
      setMensagem(`Erro ao finalizar: ${error.message}`);
    } finally { setSaving(false); }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Climatização</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Operação</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Ligação do conjunto, teste pneumático/hidráulico/tubulações e validação operacional com ciclo de 30 minutos.</p>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-bold text-slate-600">Kit para operação</label>
            <select value={kitId} onChange={(e) => setKitId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">
              <option value="">Selecione um kit</option>
              {kits.map((k) => <option key={k.id} value={k.id}>{k.codigo} — {k.status}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => carregar()} className="mt-5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600"><RefreshCcw className="h-4 w-4" />Atualizar</button>
        </div>
      </section>

      {kit && (
        <>
          <section className="mt-6 grid gap-5 xl:grid-cols-[0.7fr_1.3fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3"><Snowflake className="h-5 w-5 text-[#4C1D95]" /><div><div className="text-xs font-bold text-slate-400">KIT</div><div className="text-xl font-black text-slate-900">{kit.codigo}</div></div></div>
              <div className="mt-7 flex flex-col items-center rounded-2xl bg-slate-950 p-7 text-white">
                <Clock3 className="h-6 w-6 text-violet-300" />
                <div className="mt-3 font-mono text-5xl font-black tracking-tight">{formatar(tempo)}</div>
                <div className="mt-2 text-xs font-semibold text-slate-400">Meta 30:00 · {testeCompleto ? "tempo concluído" : `faltam ${formatar(faltante)}`}</div>
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10"><div className="h-full bg-violet-400 transition-all" style={{ width: `${Math.min(100, (tempo / TEMPO_TESTE) * 100)}%` }} /></div>
              </div>

              {!operacao ? (
                <button type="button" onClick={iniciar} disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4C1D95] px-5 py-3 text-sm font-bold text-white"><Play className="h-4 w-4" />Iniciar teste</button>
              ) : operacao.status === "em_teste" ? (
                <div className="mt-4">
                  <input value={motivoPausa} onChange={(e) => setMotivoPausa(e.target.value)} placeholder="Motivo da pausa por falha" className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
                  <button type="button" onClick={pausar} disabled={saving} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800"><Pause className="h-4 w-4" />Pausar teste</button>
                </div>
              ) : (
                <button type="button" onClick={retomar} disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white"><Play className="h-4 w-4" />Retomar teste</button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-black text-slate-900">Componentes do kit</div>
              <div className="mt-4 space-y-3">
                {kit.itens.map((item) => {
                  const comp = item.componente;
                  const os = comp?.os;
                  const destino = falhas[comp?.id] || "";
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div><div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{comp?.tipo_unidade}</div><div className="mt-1 text-sm font-black text-slate-900">{os?.numero_os || "—"}</div><div className="mt-0.5 text-xs text-slate-500">{os?.marca} {os?.modelo}</div></div>
                        <select value={destino} onChange={(e) => setDestino(comp.id, e.target.value)} disabled={!operacao} className="h-11 min-w-[220px] rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 disabled:bg-slate-50">
                          <option value="">Sem falha / aprovado</option>
                          <option value="reparo">Falha → Reparo</option>
                          <option value="venda_no_estado">Falha → Venda no estado</option>
                          <option value="scrap">Falha → Scrap</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <label className="text-sm font-black text-slate-800">Apontamentos do teste</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={5} placeholder="Pressão, temperatura, ruído, vazamento, comportamento, intervenções durante o teste..." className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-[#765D81]" />
            {Object.keys(falhas).length > 0 && <div className="mt-3 flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800"><AlertTriangle className="h-4 w-4" />Ao finalizar, somente os componentes com falha sairão para o destino escolhido. Os demais voltarão para Aguardando Kit.</div>}
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={finalizar} disabled={!operacao || saving} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-40 ${Object.keys(falhas).length ? "bg-amber-600" : "bg-emerald-600"}`}><Save className="h-4 w-4" />{Object.keys(falhas).length ? "Finalizar com falha" : "Aprovar kit"}</button>
            <button type="button" onClick={() => { setFalhas({}); setObservacoes(""); }} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600"><RotateCcw className="h-4 w-4" />Limpar apontamentos</button>
            {testeCompleto && !Object.keys(falhas).length && <div className="flex items-center gap-2 px-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Ciclo mínimo cumprido</div>}
          </div>
        </>
      )}

      {mensagem && <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">{loading ? "Carregando..." : mensagem}</div>}
    </div>
  );
}
