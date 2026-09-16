import {
  AlertTriangle,
  Check,
  History,
  PackagePlus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  WashingMachine,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../AuthContext.jsx";
import {
  condenarOs,
  fetchOsParaReparo,
  fetchTriagemDaOs,
  salvarExecucaoReparo,
} from "../../services/reparoLinhaBrancaService.js";
import {
  REPAROS_ELETRICOS_LAVADORAS,
  REPAROS_ESTETICOS_LAVADORAS,
  REPAROS_MECANICOS_LAVADORAS,
} from "../../services/linhaBrancaService.js";
import { fetchHistoricoLavadora } from "../../services/lavadorasTriagemService.js";

const AREA_CONFIG = {
  "Reparo Mecânico": { titulo: "Mecânico", lista: REPAROS_MECANICOS_LAVADORAS },
  "Reparo Elétrico": { titulo: "Elétrico", lista: REPAROS_ELETRICOS_LAVADORAS },
  "Reparo Estético": { titulo: "Estético", lista: REPAROS_ESTETICOS_LAVADORAS },
};

const AREAS = Object.keys(AREA_CONFIG);
const EMPTY = {
  diagnostico_final: "",
  observacoes: "",
  pecas: [],
  novaPeca: "",
  dt_inicio: "",
  servicos: [],
  motivoCondenacao: "",
};

function Info({ label, value }) {
  return <div><div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div><div className="mt-1 text-sm font-black text-slate-800">{value || "—"}</div></div>;
}

export default function ReparosLavadorasV2Page() {
  const { profile } = useAuth();
  const tecnico = profile?.nome || "Operação";

  const [osList, setOsList] = useState([]);
  const [busca, setBusca] = useState("");
  const [selectedOsId, setSelectedOsId] = useState("");
  const [areaAtual, setAreaAtual] = useState("");
  const [execucao, setExecucao] = useState({ ...EMPTY, dt_inicio: new Date().toISOString() });
  const [historico, setHistorico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const selectedOs = useMemo(
    () => osList.find((item) => String(item.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  const areasPendentes = useMemo(() => {
    if (!selectedOs) return [];
    const concluidas = selectedOs.areas_concluidas || [];
    return (selectedOs.areas_reparo || []).filter((area) => AREAS.includes(area) && !concluidas.includes(area));
  }, [selectedOs]);

  const configArea = areaAtual ? AREA_CONFIG[areaAtual] : null;

  const osFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return osList;
    return osList.filter((os) => [os.numero_os, os.serial_number, os.marca, os.modelo, os.fornecedor, os.lote].filter(Boolean).some((campo) => String(campo).toLowerCase().includes(termo)));
  }, [osList, busca]);

  async function carregarOs() {
    try {
      setLoading(true);
      const resultados = await Promise.all(AREAS.map((area) => fetchOsParaReparo(area)));
      const mapa = new Map();
      resultados.flat().forEach((os) => mapa.set(os.id, os));
      const filtradas = await Promise.all([...mapa.values()].map(async (os) => {
        try {
          const triagem = await fetchTriagemDaOs(os.id);
          if (triagem?.tipo_produto !== "Lavadoras") return null;
          return { ...os, __triagem: triagem };
        } catch {
          return null;
        }
      }));
      setOsList(filtradas.filter(Boolean));
    } catch (error) {
      setMensagem(`Erro ao carregar OS: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarOs();
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function carregarHistorico() {
      if (!selectedOs?.id) {
        setHistorico(null);
        return;
      }
      try {
        const data = await fetchHistoricoLavadora(selectedOs.id);
        if (!cancelado) setHistorico(data);
      } catch (error) {
        if (!cancelado) setMensagem(`Erro ao carregar histórico: ${error.message}`);
      }
    }
    carregarHistorico();
    return () => { cancelado = true; };
  }, [selectedOs?.id]);

  function selecionarOs(os) {
    const concluidas = os.areas_concluidas || [];
    const pendentes = (os.areas_reparo || []).filter((area) => AREAS.includes(area) && !concluidas.includes(area));
    setSelectedOsId(String(os.id));
    setAreaAtual(pendentes[0] || "");
    setBusca("");
    setMensagem("");
    setExecucao({ ...EMPTY, dt_inicio: new Date().toISOString() });
  }

  function limpar() {
    setSelectedOsId("");
    setAreaAtual("");
    setBusca("");
    setHistorico(null);
    setExecucao({ ...EMPTY, dt_inicio: new Date().toISOString() });
  }

  function toggleServico(item) {
    setExecucao((atual) => ({
      ...atual,
      servicos: atual.servicos.includes(item)
        ? atual.servicos.filter((valor) => valor !== item)
        : [...atual.servicos, item],
    }));
  }

  function adicionarPeca() {
    const peca = execucao.novaPeca.trim();
    if (!peca) return;
    setExecucao((atual) => ({ ...atual, pecas: [...atual.pecas, peca], novaPeca: "" }));
  }

  async function salvar() {
    if (!selectedOs || !areaAtual || !execucao.diagnostico_final.trim() || !execucao.servicos.length) {
      return setMensagem("Informe o diagnóstico e selecione ao menos um serviço executado.");
    }
    try {
      setSaving(true);
      const numeroOs = selectedOs.numero_os;
      const haviaMaisAreas = areasPendentes.length > 1;
      await salvarExecucaoReparo(selectedOs, {
        tecnico,
        dt_inicio: execucao.dt_inicio,
        diagnostico_final: execucao.diagnostico_final,
        servico_executado: execucao.servicos.join(", "),
        peca_trocada: execucao.pecas.length > 0,
        descricao_peca: execucao.pecas.join(", "),
        observacoes: execucao.observacoes,
      }, areaAtual);
      limpar();
      await carregarOs();
      setMensagem(haviaMaisAreas
        ? `Reparo da OS ${numeroOs} concluído nesta especialidade. A OS segue para a próxima área.`
        : `Reparo da OS ${numeroOs} concluído. Equipamento encaminhado para Bancada Pós-Reparo.`);
    } catch (error) {
      setMensagem(`Erro ao salvar reparo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function condenar() {
    if (!selectedOs) return;
    if (!execucao.motivoCondenacao.trim()) return setMensagem("Informe a justificativa da condenação / Scrap.");
    try {
      setSaving(true);
      const numeroOs = selectedOs.numero_os;
      await condenarOs(selectedOs, execucao.motivoCondenacao, tecnico);
      limpar();
      await carregarOs();
      setMensagem(`OS ${numeroOs} condenada e encaminhada para Scrap.`);
    } catch (error) {
      setMensagem(`Erro ao condenar produto: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="border-b border-slate-200 pb-6"><div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Linha Branca · Lavadoras</div><div className="mt-2 flex items-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3EFF5] text-[#4C1D95]"><Wrench className="h-6 w-6" /></div><div><h1 className="text-3xl font-black tracking-[-0.035em] text-slate-900">Reparos de Lavadoras</h1><p className="mt-1 text-sm text-slate-500">Erro da triagem, escopo solicitado, execução técnica e decisão de reparabilidade.</p></div></div></div>

      {mensagem ? <div className="mt-5 flex items-start justify-between rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800"><span>{mensagem}</span><button type="button" onClick={() => setMensagem("")}><X className="h-4 w-4" /></button></div> : null}

      <section className="mt-6 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">OS aguardando reparo</h2><span className="text-[10px] font-black text-slate-400">{loading ? "..." : osList.length}</span></div><div className="relative mt-4"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OS, modelo ou serial" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none" /></div><select value={selectedOsId} onChange={(e) => { const os = osFiltradas.find((item) => String(item.id) === e.target.value); if (os) selecionarOs(os); }} className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><option value="">Selecione uma OS</option>{osFiltradas.map((os) => <option key={os.id} value={os.id}>{os.numero_os} — {os.marca} {os.modelo}</option>)}</select>
          {selectedOs ? <><div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-3"><WashingMachine className="h-6 w-6 text-[#5B35C9]" /><div><div className="text-base font-black text-slate-900">{selectedOs.numero_os}</div><div className="text-[10px] text-slate-500">{selectedOs.marca} {selectedOs.modelo}</div></div></div><div className="mt-4 grid grid-cols-2 gap-3"><Info label="Tensão" value={selectedOs.voltagem} /><Info label="Serial" value={selectedOs.serial_number} /><Info label="Status" value={selectedOs.status_atual} /><Info label="Área atual" value={selectedOs.area_destino} /></div></div><button type="button" onClick={limpar} className="mt-3 text-[10px] font-black text-slate-500">Trocar OS</button></> : null}
        </div>

        <div className="space-y-5">
          {selectedOs ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5"><div className="flex items-center gap-2 text-sm font-black text-rose-800"><AlertTriangle className="h-4 w-4" /> Origem da falha / Triagem</div><div className="mt-3 text-sm leading-6 text-rose-700">{selectedOs.__triagem?.observacoes_triagem || "Sem observação de falha na triagem."}</div><div className="mt-4 grid gap-2 md:grid-cols-3"><div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Mecânicos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_mecanicos || []).join(", ") || "—"}</div></div><div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Elétricos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_eletricos || []).join(", ") || "—"}</div></div><div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Estéticos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_esteticos || []).join(", ") || "—"}</div></div></div></div> : null}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}><div className="flex flex-wrap gap-2">{areasPendentes.map((area) => <button key={area} type="button" onClick={() => { setAreaAtual(area); setExecucao((a) => ({ ...a, servicos: [] })); }} className={`rounded-xl px-4 py-2 text-xs font-black ${areaAtual === area ? "bg-[#5B35C9] text-white" : "bg-slate-100 text-slate-600"}`}>{area}</button>)}</div>{configArea ? <div className="mt-5"><div className="text-sm font-black text-slate-900">Serviços — {configArea.titulo}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{configArea.lista.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-[10px] font-bold ${execucao.servicos.includes(item) ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}><input type="checkbox" checked={execucao.servicos.includes(item)} onChange={() => toggleServico(item)} />{item}</label>)}</div></div> : null}
            <div className="mt-5 grid gap-4 lg:grid-cols-2"><label><span className="text-[11px] font-black text-slate-600">Diagnóstico final *</span><textarea rows={4} value={execucao.diagnostico_final} onChange={(e) => setExecucao((a) => ({ ...a, diagnostico_final: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label><span className="text-[11px] font-black text-slate-600">Observações</span><textarea rows={4} value={execucao.observacoes} onChange={(e) => setExecucao((a) => ({ ...a, observacoes: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label></div>
            <div className="mt-4"><div className="text-[11px] font-black text-slate-600">Peças utilizadas</div><div className="mt-2 flex gap-2"><input value={execucao.novaPeca} onChange={(e) => setExecucao((a) => ({ ...a, novaPeca: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarPeca(); } }} placeholder="Digite a peça" className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" /><button type="button" onClick={adicionarPeca} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black"><PackagePlus className="h-4 w-4" /> Adicionar</button></div><div className="mt-2 flex flex-wrap gap-2">{execucao.pecas.map((peca, index) => <span key={`${peca}-${index}`} className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{peca}</span>)}</div></div>
            <button type="button" onClick={salvar} disabled={saving || !selectedOs || !areaAtual || !execucao.diagnostico_final.trim() || !execucao.servicos.length} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5B35C9] text-xs font-black text-white disabled:bg-slate-300"><Save className="h-4 w-4" /> Salvar reparo desta área</button>
          </div>

          {historico ? <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><History className="h-4 w-4 text-[#5B35C9]" /> Histórico técnico</div><div className="mt-4 grid gap-3 md:grid-cols-3"><div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Ciclos</div>{historico.ciclos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.etapa_teste} · ciclo {item.numero_ciclo} · {item.status}</div>)}</div><div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Reparos anteriores</div>{historico.reparos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.area_execucao} · {item.servico_executado || item.diagnostico_final}</div>)}</div><div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Laudos</div>{historico.laudos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.titulo}</div>)}</div></div></div> : null}

          <div className={`rounded-2xl border border-rose-100 bg-rose-50 p-5 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}><div className="flex items-center gap-2 text-sm font-black text-rose-800"><Trash2 className="h-4 w-4" /> Condenação / Scrap</div><p className="mt-1 text-[11px] text-rose-600">Use quando o reparo não for tecnicamente ou economicamente viável.</p><textarea rows={3} value={execucao.motivoCondenacao} onChange={(e) => setExecucao((a) => ({ ...a, motivoCondenacao: e.target.value }))} placeholder="Justificativa obrigatória da condenação" className="mt-3 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={condenar} disabled={saving || !execucao.motivoCondenacao.trim()} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-40"><Trash2 className="h-4 w-4" /> Condenar e enviar para Scrap</button></div>
        </div>
      </section>
    </div>
  );
}
