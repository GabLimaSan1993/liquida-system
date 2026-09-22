import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Gauge,
  Pause,
  Play,
  RefreshCcw,
  RotateCcw,
  Save,
  Snowflake,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import {
  CHECKLIST_OPERACAO_CLIMATIZACAO,
  fetchKitsParaOperacao,
  finalizarOperacaoClimatizacao,
  iniciarOperacaoClimatizacao,
  pausarOperacaoClimatizacao,
  retomarOperacaoClimatizacao,
  salvarMedicoesOperacaoClimatizacao,
} from "../../services/climatizacaoService.js";

const TEMPO_TESTE = 30 * 60;
const EMPTY_MEDICOES = {
  vacuo_micron: "",
  pressao_baixa_psi: "",
  pressao_alta_psi: "",
  corrente_a: "",
  temperatura_entrada_c: "",
  temperatura_saida_c: "",
};

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

function CampoMedicao({ label, unit, value, onChange, placeholder }) {
  return (
    <label className="text-[11px] font-black text-slate-600">
      {label}
      <div className="relative mt-1.5">
        <input
          type="number"
          step="any"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 pr-12 text-sm outline-none focus:border-[#765D81]"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-400">{unit}</span>
      </div>
    </label>
  );
}

export default function OperacaoClimatizacaoV2Page() {
  const { profile } = useAuth();
  const [kits, setKits] = useState([]);
  const [kitId, setKitId] = useState("");
  const [agora, setAgora] = useState(Date.now());
  const [motivoPausa, setMotivoPausa] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [falhas, setFalhas] = useState({});
  const [medicoes, setMedicoes] = useState({ ...EMPTY_MEDICOES });
  const [checklistOperacao, setChecklistOperacao] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const kit = useMemo(
    () => kits.find((item) => String(item.id) === String(kitId)) || null,
    [kits, kitId]
  );

  const operacao = kit?.operacoes?.find((op) => ["em_teste", "pausado"].includes(op.status)) || null;
  const tempo = segundosOperados(operacao, agora);
  const faltante = Math.max(0, TEMPO_TESTE - tempo);
  const testeCompleto = tempo >= TEMPO_TESTE;

  const checklistCompleto = CHECKLIST_OPERACAO_CLIMATIZACAO.every(
    (item) => checklistOperacao[item] === "ok"
  );
  const existeFalhaChecklist = Object.values(checklistOperacao).some((valor) => valor === "falha");
  const medicoesObrigatorias = Boolean(
    String(medicoes.vacuo_micron).trim() &&
    String(medicoes.pressao_baixa_psi).trim() &&
    String(medicoes.corrente_a).trim() &&
    String(medicoes.temperatura_entrada_c).trim() &&
    String(medicoes.temperatura_saida_c).trim()
  );

  const deltaT = useMemo(() => {
    const entrada = Number(medicoes.temperatura_entrada_c);
    const saida = Number(medicoes.temperatura_saida_c);
    if (!Number.isFinite(entrada) || !Number.isFinite(saida)) return null;
    return entrada - saida;
  }, [medicoes.temperatura_entrada_c, medicoes.temperatura_saida_c]);

  async function carregar(preservar = true) {
    try {
      setLoading(true);
      const data = await fetchKitsParaOperacao();
      setKits(data);
      if (!preservar || !data.some((item) => String(item.id) === String(kitId))) {
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
    const id = window.setInterval(() => setAgora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    setFalhas({});
    setObservacoes("");
    setMotivoPausa("");
    setMedicoes({ ...EMPTY_MEDICOES });
    setChecklistOperacao({});
  }, [kitId]);

  useEffect(() => {
    if (!operacao?.id) return;
    setMedicoes({ ...EMPTY_MEDICOES, ...(operacao.medicoes || {}) });
    setChecklistOperacao(operacao.checklist_operacao || {});
  }, [operacao?.id]);

  async function iniciar() {
    if (!kit) return;
    try {
      setSaving(true);
      await iniciarOperacaoClimatizacao(kit.id, profile?.nome);
      await carregar();
      setMensagem(`Teste do ${kit.codigo} iniciado. Faça as leituras técnicas durante o ciclo.`);
    } catch (error) {
      setMensagem(`Erro ao iniciar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function pausar() {
    if (!motivoPausa.trim()) {
      setMensagem("Informe o erro/falha apresentada antes de pausar.");
      return;
    }
    try {
      setSaving(true);
      await salvarMedicoesOperacaoClimatizacao(operacao.id, medicoes, checklistOperacao);
      await pausarOperacaoClimatizacao(operacao.id, motivoPausa);
      setMotivoPausa("");
      await carregar();
      setMensagem("Teste pausado; cronômetro e leituras foram preservados.");
    } catch (error) {
      setMensagem(`Erro ao pausar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function retomar() {
    try {
      setSaving(true);
      await retomarOperacaoClimatizacao(operacao.id);
      await carregar();
      setMensagem("Teste retomado.");
    } catch (error) {
      setMensagem(`Erro ao retomar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function salvarLeituras() {
    if (!operacao) return;
    try {
      setSaving(true);
      await salvarMedicoesOperacaoClimatizacao(operacao.id, medicoes, checklistOperacao);
      await carregar();
      setMensagem("Leituras técnicas salvas.");
    } catch (error) {
      setMensagem(`Erro ao salvar leituras: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function setDestino(componenteId, destino) {
    setFalhas((atual) => {
      const proximo = { ...atual };
      if (!destino) delete proximo[componenteId];
      else proximo[componenteId] = destino;
      return proximo;
    });
  }

  function marcarChecklist(item, valor) {
    setChecklistOperacao((atual) => ({ ...atual, [item]: valor }));
  }

  async function finalizar() {
    if (!operacao) return;

    const listaFalhas = Object.entries(falhas).map(([componente_id, destino]) => ({
      componente_id: Number(componente_id),
      destino,
    }));

    if (listaFalhas.length === 0) {
      if (!testeCompleto) {
        setMensagem(`Para aprovar o kit, complete os 30 minutos. Restam ${formatar(faltante)}.`);
        return;
      }
      if (!medicoesObrigatorias) {
        setMensagem("Preencha vácuo, pressão de baixa, corrente e temperaturas antes de aprovar.");
        return;
      }
      if (!checklistCompleto) {
        setMensagem("Todos os itens do checklist operacional precisam estar OK para aprovar o kit.");
        return;
      }
    }

    if (existeFalhaChecklist && listaFalhas.length === 0) {
      setMensagem("Há falha no checklist. Indique qual componente será enviado para reparo, venda no estado ou condenação.");
      return;
    }

    try {
      setSaving(true);
      await salvarMedicoesOperacaoClimatizacao(operacao.id, medicoes, checklistOperacao);
      await finalizarOperacaoClimatizacao(
        operacao.id,
        listaFalhas,
        observacoes,
        profile?.nome
      );

      const codigo = kit.codigo;
      await carregar(false);
      setMensagem(
        listaFalhas.length
          ? `${codigo} encerrado com falha. Os componentes foram redirecionados individualmente.`
          : `${codigo} aprovado no ciclo de 30 minutos e enviado para Higienização.`
      );
    } catch (error) {
      setMensagem(`Erro ao finalizar: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Climatização</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Operação do conjunto</h1>
        <p className="mt-2 max-w-4xl text-sm leading-6 text-slate-500">
          Ligação do kit, tubulações, vácuo, pressão, corrente, drenagem, temperatura e validação funcional com 30 minutos efetivos.
        </p>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="min-w-0 flex-1">
            <label className="text-xs font-bold text-slate-600">Kit para operação</label>
            <select value={kitId} onChange={(e) => setKitId(e.target.value)} className="mt-2 h-12 w-full rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700">
              <option value="">Selecione um kit</option>
              {kits.map((item) => <option key={item.id} value={item.id}>{item.codigo} — {item.status}</option>)}
            </select>
          </div>
          <button type="button" onClick={() => carregar()} className="mt-5 flex h-12 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-600">
            <RefreshCcw className="h-4 w-4" />Atualizar
          </button>
        </div>
      </section>

      {kit ? (
        <>
          <section className="mt-6 grid gap-5 xl:grid-cols-[0.68fr_1.32fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center gap-3">
                <Snowflake className="h-5 w-5 text-[#4C1D95]" />
                <div><div className="text-xs font-bold text-slate-400">KIT</div><div className="text-xl font-black text-slate-900">{kit.codigo}</div></div>
              </div>

              <div className="mt-7 flex flex-col items-center rounded-2xl bg-slate-950 p-7 text-white">
                <Clock3 className="h-6 w-6 text-violet-300" />
                <div className="mt-3 font-mono text-5xl font-black tracking-tight">{formatar(tempo)}</div>
                <div className="mt-2 text-xs font-semibold text-slate-400">
                  Meta 30:00 · {testeCompleto ? "tempo concluído" : `faltam ${formatar(faltante)}`}
                </div>
                <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div className="h-full bg-violet-400 transition-all" style={{ width: `${Math.min(100, (tempo / TEMPO_TESTE) * 100)}%` }} />
                </div>
              </div>

              {!operacao ? (
                <button type="button" onClick={iniciar} disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#4C1D95] px-5 py-3 text-sm font-bold text-white disabled:opacity-40">
                  <Play className="h-4 w-4" />Iniciar teste
                </button>
              ) : operacao.status === "em_teste" ? (
                <div className="mt-4">
                  <textarea value={motivoPausa} onChange={(e) => setMotivoPausa(e.target.value)} rows={2} placeholder="Erro/falha apresentada para pausar o teste" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
                  <button type="button" onClick={pausar} disabled={saving} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-800">
                    <Pause className="h-4 w-4" />Pausar por falha
                  </button>
                </div>
              ) : (
                <button type="button" onClick={retomar} disabled={saving} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white">
                  <Play className="h-4 w-4" />Retomar teste
                </button>
              )}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="text-sm font-black text-slate-900">Componentes do kit</div>
              <div className="mt-4 space-y-3">
                {kit.itens.map((item) => {
                  const componente = item.componente;
                  const os = componente?.os;
                  const destino = falhas[componente?.id] || "";
                  return (
                    <div key={item.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">{componente?.tipo_unidade}</div>
                          <div className="mt-1 text-sm font-black text-slate-900">{os?.numero_os || "—"}</div>
                          <div className="mt-0.5 text-xs text-slate-500">{os?.marca} {os?.modelo}</div>
                          <div className="mt-1 text-[10px] font-semibold text-slate-400">{componente?.capacidade_btu || "—"} BTU · {componente?.tensao || "—"} · {componente?.gas_refrigerante || "—"}</div>
                        </div>
                        <select value={destino} onChange={(e) => setDestino(componente.id, e.target.value)} disabled={!operacao} className="h-11 min-w-[250px] rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-700 disabled:bg-slate-50">
                          <option value="">Sem falha / aprovado</option>
                          <option value="reparo">Falha → Reparo</option>
                          <option value="venda_no_estado">Falha → Venda no estado</option>
                          <option value="condenacao">Falha → Solicitar condenação</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={`mt-6 rounded-2xl border border-slate-200 bg-white p-5 ${!operacao ? "pointer-events-none opacity-50" : ""}`}>
            <div className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Gauge className="h-4 w-4 text-[#5B35C9]" /> Leituras técnicas
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <CampoMedicao label="Vácuo" unit="micron" value={medicoes.vacuo_micron} onChange={(v) => setMedicoes((a) => ({ ...a, vacuo_micron: v }))} placeholder="Ex.: 500" />
              <CampoMedicao label="Pressão de baixa" unit="PSI" value={medicoes.pressao_baixa_psi} onChange={(v) => setMedicoes((a) => ({ ...a, pressao_baixa_psi: v }))} placeholder="Ex.: 120" />
              <CampoMedicao label="Pressão de alta" unit="PSI" value={medicoes.pressao_alta_psi} onChange={(v) => setMedicoes((a) => ({ ...a, pressao_alta_psi: v }))} placeholder="Opcional" />
              <CampoMedicao label="Corrente" unit="A" value={medicoes.corrente_a} onChange={(v) => setMedicoes((a) => ({ ...a, corrente_a: v }))} placeholder="Ex.: 5.8" />
              <CampoMedicao label="Temperatura entrada" unit="°C" value={medicoes.temperatura_entrada_c} onChange={(v) => setMedicoes((a) => ({ ...a, temperatura_entrada_c: v }))} placeholder="Ex.: 26" />
              <CampoMedicao label="Temperatura saída" unit="°C" value={medicoes.temperatura_saida_c} onChange={(v) => setMedicoes((a) => ({ ...a, temperatura_saida_c: v }))} placeholder="Ex.: 12" />
            </div>
            {deltaT !== null ? (
              <div className="mt-3 inline-flex rounded-full bg-violet-50 px-3 py-1.5 text-[10px] font-black text-violet-700">ΔT calculado: {deltaT.toFixed(1)} °C</div>
            ) : null}
          </section>

          <section className={`mt-6 rounded-2xl border border-slate-200 bg-white p-5 ${!operacao ? "pointer-events-none opacity-50" : ""}`}>
            <div className="text-sm font-black text-slate-900">Checklist operacional</div>
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div className="grid grid-cols-[1fr_100px_100px] bg-slate-50 px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <span>Verificação</span><span className="text-center">OK</span><span className="text-center">Falha</span>
              </div>
              {CHECKLIST_OPERACAO_CLIMATIZACAO.map((item) => (
                <div key={item} className="grid grid-cols-[1fr_100px_100px] items-center border-t border-slate-100 px-4 py-3">
                  <span className="text-xs font-bold text-slate-700">{item}</span>
                  <button type="button" onClick={() => marcarChecklist(item, "ok")} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border ${checklistOperacao[item] === "ok" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`}><Check className="h-4 w-4" /></button>
                  <button type="button" onClick={() => marcarChecklist(item, "falha")} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border ${checklistOperacao[item] === "falha" ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300 text-transparent"}`}><X className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
            <button type="button" onClick={salvarLeituras} disabled={!operacao || saving} className="mt-4 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600 disabled:opacity-40"><Save className="h-4 w-4" />Salvar leituras</button>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
            <label className="text-sm font-black text-slate-800">Apontamentos do teste</label>
            <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={5} placeholder="Ruídos, comportamento, vazamento, intervenção durante o teste e conclusão técnica..." className="mt-3 w-full resize-none rounded-xl border border-slate-200 p-4 text-sm outline-none focus:border-[#765D81]" />
            {Object.keys(falhas).length > 0 ? (
              <div className="mt-3 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                Componentes sem falha retornam para Aguardando Kit. Componentes condenados aguardam aprovação do Marcelo; não existe envio direto para Scrap.
              </div>
            ) : null}
          </section>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={finalizar} disabled={!operacao || saving} className={`flex items-center gap-2 rounded-xl px-5 py-3 text-sm font-bold text-white disabled:opacity-40 ${Object.keys(falhas).length ? "bg-amber-600" : "bg-emerald-600"}`}>
              <Save className="h-4 w-4" />{Object.keys(falhas).length ? "Finalizar com falha" : "Aprovar kit"}
            </button>
            <button type="button" onClick={() => { setFalhas({}); setObservacoes(""); setChecklistOperacao({}); setMedicoes({ ...EMPTY_MEDICOES }); }} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600">
              <RotateCcw className="h-4 w-4" />Limpar apontamentos
            </button>
            {testeCompleto && checklistCompleto && medicoesObrigatorias && !Object.keys(falhas).length ? (
              <div className="flex items-center gap-2 px-2 text-sm font-bold text-emerald-700"><CheckCircle2 className="h-5 w-5" />Teste apto para aprovação</div>
            ) : null}
          </div>
        </>
      ) : null}

      {mensagem ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">{loading ? "Carregando..." : mensagem}</div>
      ) : null}
    </div>
  );
}
