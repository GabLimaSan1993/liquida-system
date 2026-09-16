import {
  AlertTriangle,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  WashingMachine,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../AuthContext.jsx";
import {
  REPAROS_ELETRICOS_LAVADORAS,
  REPAROS_ESTETICOS_LAVADORAS,
  REPAROS_MECANICOS_LAVADORAS,
} from "../../services/linhaBrancaService.js";
import {
  DURACAO_CICLO_LAVADORA,
  POSICOES_BANCADA_LAVADORAS,
  STATUS_RESERVA_POSICAO,
  aprovarPosReparo,
  calcularTempoExecutado,
  concluirCicloLavadora,
  condenarLavadora,
  enviarCicloParaReparo,
  fetchHistoricoLavadora,
  fetchPainelBancadaPosReparo,
  iniciarCicloPosReparo,
  pausarCicloLavadora,
  registrarErroCicloLavadora,
  retomarCicloLavadora,
} from "../../services/lavadorasTriagemService.js";

const EMPTY_DECISAO = {
  erroDescricao: "",
  codigoErro: "",
  observacoes: "",
  mecanicos: [],
  eletricos: [],
  esteticos: [],
  motivoCondenacao: "",
};

function formatarSegundos(total) {
  const valor = Math.max(0, Number(total || 0));
  const minutos = Math.floor(valor / 60);
  const segundos = Math.floor(valor % 60);
  return `${String(minutos).padStart(2, "0")}:${String(segundos).padStart(2, "0")}`;
}

function formatarDataHora(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "—";
  return data.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RepairGroup({ title, items, selected, onToggle }) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <div className="mb-2 text-[11px] font-black text-slate-700">{title}</div>
      <div className="max-h-40 space-y-1 overflow-y-auto pr-1">
        {items.map((item) => (
          <label key={item} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-1.5 text-[10px] text-slate-600 hover:bg-slate-50">
            <input
              type="checkbox"
              checked={selected.includes(item)}
              onChange={() => onToggle(item)}
              className="mt-0.5"
            />
            <span>{item}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

function Stat({ icon: Icon, value, label, tone = "violet" }) {
  const styles = {
    violet: "bg-violet-50 text-violet-700",
    blue: "bg-blue-50 text-blue-700",
    red: "bg-rose-50 text-rose-700",
    green: "bg-emerald-50 text-emerald-700",
  };
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${styles[tone]}`}><Icon className="h-5 w-5" /></div>
      <div><div className="text-xl font-black text-slate-900">{value}</div><div className="text-[10px] font-bold text-slate-500">{label}</div></div>
    </div>
  );
}

export default function BancadaTestesLavadorasV2Page() {
  const { profile } = useAuth();
  const operador = profile?.nome || "Operação";

  const [painel, setPainel] = useState({ aguardando: [], ciclos: [], osList: [] });
  const [selectedOsId, setSelectedOsId] = useState("");
  const [selectedCicloId, setSelectedCicloId] = useState("");
  const [posicaoNova, setPosicaoNova] = useState("");
  const [busca, setBusca] = useState("");
  const [historico, setHistorico] = useState(null);
  const [decisao, setDecisao] = useState({ ...EMPTY_DECISAO });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [tick, setTick] = useState(Date.now());
  const finalizandoRef = useRef(new Set());

  const carregar = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setLoading(true);
      const data = await fetchPainelBancadaPosReparo();
      setPainel(data);
      setSelectedOsId((atual) => {
        if (atual && data.aguardando.some((item) => String(item.id) === String(atual))) return atual;
        return data.aguardando[0]?.id ? String(data.aguardando[0].id) : "";
      });
      setSelectedCicloId((atual) => {
        if (atual && data.ciclos.some((item) => String(item.id) === String(atual))) return atual;
        const ciclo = data.ciclos.find((item) => STATUS_RESERVA_POSICAO.includes(item.status)) || data.ciclos[0];
        return ciclo?.id ? String(ciclo.id) : "";
      });
    } catch (error) {
      setMensagem(`Erro ao carregar bancada: ${error.message}`);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const selectedOs = useMemo(
    () => painel.aguardando.find((item) => String(item.id) === String(selectedOsId)) || null,
    [painel.aguardando, selectedOsId]
  );

  const selectedCiclo = useMemo(
    () => painel.ciclos.find((item) => String(item.id) === String(selectedCicloId)) || null,
    [painel.ciclos, selectedCicloId]
  );

  useEffect(() => {
    let cancelado = false;
    async function buscarHistorico() {
      const osId = selectedCiclo?.os_id || selectedOs?.id;
      if (!osId) {
        setHistorico(null);
        return;
      }
      try {
        const data = await fetchHistoricoLavadora(osId);
        if (!cancelado) setHistorico(data);
      } catch (error) {
        if (!cancelado) setMensagem(`Erro ao carregar histórico técnico: ${error.message}`);
      }
    }
    buscarHistorico();
    return () => {
      cancelado = true;
    };
  }, [selectedCiclo?.os_id, selectedOs?.id]);

  useEffect(() => {
    const vencidos = painel.ciclos.filter(
      (ciclo) =>
        ciclo.status === "em_ciclo" &&
        calcularTempoExecutado(ciclo, tick) >= Number(ciclo.duracao_alvo_segundos || DURACAO_CICLO_LAVADORA)
    );
    vencidos.forEach((ciclo) => {
      if (finalizandoRef.current.has(ciclo.id)) return;
      finalizandoRef.current.add(ciclo.id);
      concluirCicloLavadora(ciclo, ciclo.operador || operador)
        .then(() => carregar({ silencioso: true }))
        .catch((error) => setMensagem(`Erro ao concluir teste pós-reparo: ${error.message}`))
        .finally(() => finalizandoRef.current.delete(ciclo.id));
    });
  }, [tick, painel.ciclos, carregar, operador]);

  const ocupadas = useMemo(
    () => new Set(painel.ciclos.filter((item) => STATUS_RESERVA_POSICAO.includes(item.status)).map((item) => String(item.posicao))),
    [painel.ciclos]
  );

  const disponiveis = useMemo(
    () => POSICOES_BANCADA_LAVADORAS.filter((item) => !ocupadas.has(item)),
    [ocupadas]
  );

  useEffect(() => {
    if (!posicaoNova || !disponiveis.includes(posicaoNova)) setPosicaoNova(disponiveis[0] || "");
  }, [disponiveis, posicaoNova]);

  const osFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return painel.aguardando;
    return painel.aguardando.filter((os) =>
      [os.numero_os, os.serial_number, os.marca, os.modelo]
        .filter(Boolean)
        .some((valor) => String(valor).toLowerCase().includes(termo))
    );
  }, [painel.aguardando, busca]);

  const cards = useMemo(() => {
    const mapa = new Map();
    [...painel.ciclos]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .forEach((ciclo) => {
        if (!mapa.has(String(ciclo.posicao)) && STATUS_RESERVA_POSICAO.includes(ciclo.status)) {
          mapa.set(String(ciclo.posicao), ciclo);
        }
      });
    return POSICOES_BANCADA_LAVADORAS.map((posicao) => ({ posicao, ciclo: mapa.get(posicao) || null }));
  }, [painel.ciclos]);

  const metricas = useMemo(() => ({
    aguardando: painel.aguardando.length,
    emTeste: painel.ciclos.filter((item) => item.status === "em_ciclo").length,
    erro: painel.ciclos.filter((item) => item.status === "pausado_erro").length,
    aguardandoResultado: painel.ciclos.filter((item) => item.status === "aguardando_resultado").length,
  }), [painel]);

  async function executar(acao) {
    try {
      setSaving(true);
      setMensagem("");
      await acao();
      await carregar({ silencioso: true });
    } catch (error) {
      setMensagem(error.message || "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  }

  function iniciar() {
    if (!selectedOs) return setMensagem("Selecione uma OS para iniciar o teste pós-reparo.");
    if (!posicaoNova) return setMensagem("Não há posição disponível.");
    executar(async () => {
      const ciclo = await iniciarCicloPosReparo({ os: selectedOs, operador, posicao: posicaoNova });
      setSelectedCicloId(String(ciclo.id));
      setMensagem(`Teste pós-reparo iniciado na posição ${posicaoNova}.`);
    });
  }

  function abrirErro(ciclo) {
    executar(async () => {
      const pausado = ciclo.status === "em_ciclo" ? await pausarCicloLavadora(ciclo, operador, true) : ciclo;
      setSelectedCicloId(String(ciclo.id));
      setDecisao({
        ...EMPTY_DECISAO,
        erroDescricao: pausado.erro_descricao || ciclo.erro_descricao || "",
        codigoErro: pausado.erro_codigo || ciclo.erro_codigo || "",
        observacoes: pausado.erro_observacoes || ciclo.erro_observacoes || "",
      });
    });
  }

  function toggle(chave, item) {
    setDecisao((atual) => ({
      ...atual,
      [chave]: atual[chave].includes(item)
        ? atual[chave].filter((valor) => valor !== item)
        : [...atual[chave], item],
    }));
  }

  async function registrarErro() {
    if (!selectedCiclo) return;
    if (!decisao.erroDescricao.trim()) return setMensagem("Informe o erro apresentado.");
    await executar(async () => {
      await registrarErroCicloLavadora({
        ciclo: selectedCiclo,
        erroDescricao: decisao.erroDescricao,
        codigoErro: decisao.codigoErro,
        observacoes: decisao.observacoes,
        operador,
      });
      setMensagem("Erro registrado no teste pós-reparo.");
    });
  }

  async function retornarReparo() {
    if (!selectedCiclo) return;
    await executar(async () => {
      await enviarCicloParaReparo({
        ciclo: selectedCiclo,
        reparosMecanicos: decisao.mecanicos,
        reparosEletricos: decisao.eletricos,
        reparosEsteticos: decisao.esteticos,
        erroDescricao: decisao.erroDescricao,
        codigoErro: decisao.codigoErro,
        observacoes: decisao.observacoes,
        operador,
      });
      setDecisao({ ...EMPTY_DECISAO });
      setMensagem("Lavadora devolvida ao reparo com o novo escopo técnico.");
    });
  }

  async function aprovar() {
    if (!selectedCiclo) return;
    await executar(async () => {
      await aprovarPosReparo(selectedCiclo, operador, decisao.observacoes);
      setDecisao({ ...EMPTY_DECISAO });
      setMensagem("Lavadora aprovada. Laudo pós-reparo gerado e equipamento encaminhado para Higienização.");
    });
  }

  async function condenar() {
    if (!selectedCiclo) return;
    if (!decisao.motivoCondenacao.trim()) return setMensagem("Informe a justificativa da condenação.");
    await executar(async () => {
      await condenarLavadora({
        ciclo: selectedCiclo,
        os: selectedCiclo.os,
        motivo: decisao.motivoCondenacao,
        operador,
      });
      setDecisao({ ...EMPTY_DECISAO });
      setMensagem("Produto condenado e encaminhado para Scrap.");
    });
  }

  if (loading) {
    return <div className="flex min-h-[520px] items-center justify-center"><div className="text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-[#4C1D95]" /><div className="mt-3 text-sm font-bold text-slate-500">Carregando bancada pós-reparo...</div></div></div>;
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div><div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Linha Branca · Lavadoras</div><h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Bancada Pós-Reparo</h1><p className="mt-1 text-sm text-slate-500">Uma lavagem de 25 minutos para validar o reparo, com histórico técnico completo.</p></div>
        <button type="button" onClick={() => carregar()} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600"><RefreshCw className="h-4 w-4" /> Atualizar</button>
      </div>

      {mensagem ? <div className="mt-5 flex items-start justify-between rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800"><span>{mensagem}</span><button type="button" onClick={() => setMensagem("")}><X className="h-4 w-4" /></button></div> : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat icon={Clock3} value={metricas.aguardando} label="Aguardando bancada" />
        <Stat icon={Play} value={metricas.emTeste} label="Em teste agora" tone="blue" />
        <Stat icon={AlertTriangle} value={metricas.erro} label="Paradas por erro" tone="red" />
        <Stat icon={CheckCircle2} value={metricas.aguardandoResultado} label="Aguardando decisão final" tone="green" />
      </section>

      <section className="mt-5 grid gap-5 2xl:grid-cols-[380px_minmax(0,1fr)_420px]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="text-sm font-black text-slate-900">Selecionar OS pós-reparo</h2>
          <div className="relative mt-4"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OS, modelo ou serial" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none" /></div>
          <select value={selectedOsId} onChange={(e) => setSelectedOsId(e.target.value)} className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"><option value="">Selecione uma OS</option>{osFiltradas.map((os) => <option key={os.id} value={os.id}>{os.numero_os} — {os.marca} {os.modelo}</option>)}</select>
          {selectedOs ? <div className="mt-4 rounded-xl bg-slate-50 p-4 text-xs"><div className="text-lg font-black text-slate-900">{selectedOs.numero_os}</div><div className="mt-2 text-slate-500">{selectedOs.marca} {selectedOs.modelo}</div><div className="text-slate-400">{selectedOs.voltagem || "—"} · {selectedOs.serial_number || "Sem serial"}</div></div> : null}
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2"><select value={posicaoNova} onChange={(e) => setPosicaoNova(e.target.value)} className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"><option value="">Posição</option>{disponiveis.map((p) => <option key={p} value={p}>Posição {p}</option>)}</select><button type="button" onClick={iniciar} disabled={!selectedOs || !posicaoNova || saving} className="flex h-11 items-center gap-2 rounded-xl bg-[#5B35C9] px-4 text-xs font-black text-white disabled:bg-slate-300"><Play className="h-4 w-4 fill-current" /> Iniciar</button></div>

          <div className="mt-6 border-t border-slate-100 pt-4"><div className="text-xs font-black text-slate-800">Histórico carregado</div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div className="rounded-lg bg-slate-50 p-2">Ciclos anteriores: <strong>{historico?.ciclos?.length || 0}</strong></div><div className="rounded-lg bg-slate-50 p-2">Reparos: <strong>{historico?.reparos?.length || 0}</strong></div><div className="rounded-lg bg-slate-50 p-2">Eventos: <strong>{historico?.eventos?.length || 0}</strong></div><div className="rounded-lg bg-slate-50 p-2">Laudos: <strong>{historico?.laudos?.length || 0}</strong></div></div></div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Bancada de validação</h2><p className="mt-1 text-[11px] text-slate-400">20 posições · 1 ciclo pós-reparo por passagem.</p></div>
          <div className="max-h-[1080px] overflow-y-auto p-4"><div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">{cards.map(({ posicao, ciclo }) => {
            if (!ciclo) return <button key={posicao} type="button" onClick={() => setPosicaoNova(posicao)} className="flex min-h-[215px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-4"><WashingMachine className="h-8 w-8 text-slate-300" /><div className="mt-3 text-xs font-black text-slate-600">Posição {posicao}</div><div className="mt-1 text-[10px] text-slate-400">Disponível</div></button>;
            const executado = calcularTempoExecutado(ciclo, tick);
            const progresso = Math.min(100, Math.round((executado / DURACAO_CICLO_LAVADORA) * 100));
            const erro = ciclo.status === "pausado_erro";
            const pausado = ciclo.status === "pausado";
            const resultado = ciclo.status === "aguardando_resultado";
            return <div key={`${posicao}-${ciclo.id}`} onClick={() => setSelectedCicloId(String(ciclo.id))} className={`min-h-[215px] cursor-pointer rounded-2xl border p-4 ${String(selectedCicloId) === String(ciclo.id) ? "border-violet-400 ring-2 ring-violet-100" : erro ? "border-rose-200" : "border-slate-200"}`}><div className="flex justify-between"><span className="text-[10px] font-black text-slate-600">Posição {posicao}</span><span className={`rounded-full px-2 py-1 text-[9px] font-black ${resultado ? "bg-emerald-50 text-emerald-700" : erro ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>{resultado ? "Teste concluído" : erro ? "Erro" : pausado ? "Pausada" : "Em teste"}</span></div><div className="mt-4 text-xs font-black text-slate-900">{ciclo.os?.numero_os || `OS #${ciclo.os_id}`}</div><div className="mt-1 text-[10px] text-slate-500">{ciclo.os?.marca} {ciclo.os?.modelo}</div><div className="mt-5 text-lg font-black text-slate-900">{formatarSegundos(executado)} <span className="text-xs text-slate-400">/ 25:00</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full ${erro ? "bg-rose-500" : resultado ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${progresso}%` }} /></div><div className="mt-4 flex gap-2">{ciclo.status === "em_ciclo" ? <><button type="button" onClick={(e) => { e.stopPropagation(); executar(() => pausarCicloLavadora(ciclo, operador, false)); }} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 text-[10px] font-black"><Pause className="h-3.5 w-3.5" /> Pausar</button><button type="button" onClick={(e) => { e.stopPropagation(); abrirErro(ciclo); }} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-rose-600 text-[10px] font-black text-white"><AlertTriangle className="h-3.5 w-3.5" /> Erro</button></> : null}{pausado || erro ? <button type="button" onClick={(e) => { e.stopPropagation(); executar(() => retomarCicloLavadora(ciclo, operador)); }} className="flex h-9 flex-1 items-center justify-center gap-1 rounded-lg bg-[#5B35C9] text-[10px] font-black text-white"><RotateCcw className="h-3.5 w-3.5" /> Retomar</button> : null}</div></div>;
          })}</div></div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-black text-slate-900">Resultado e decisão</h2><p className="mt-1 text-[11px] text-slate-400">Aprovar, retornar ao reparo ou condenar.</p></div>
          {!selectedCiclo ? <div className="flex min-h-[500px] flex-col items-center justify-center px-6 text-center"><History className="h-9 w-9 text-slate-300" /><div className="mt-3 text-sm font-black text-slate-600">Selecione uma lavadora</div></div> : <div className="space-y-4 p-5">
            <div className="rounded-xl bg-slate-50 p-3"><div className="text-xs font-black text-slate-900">{selectedCiclo.os?.numero_os || `OS #${selectedCiclo.os_id}`}</div><div className="mt-1 text-[10px] text-slate-500">Status: {selectedCiclo.status} · {formatarDataHora(selectedCiclo.concluido_em || selectedCiclo.iniciado_em)}</div></div>
            {selectedCiclo.status === "aguardando_resultado" ? <button type="button" onClick={aprovar} disabled={saving} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 text-xs font-black text-white"><Check className="h-4 w-4" /> Aprovar e enviar para Higienização</button> : null}
            <label className="block"><span className="text-[11px] font-black text-slate-600">Erro apresentado / motivo da reprovação</span><input value={decisao.erroDescricao} onChange={(e) => setDecisao((a) => ({ ...a, erroDescricao: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="Campo digitável" /></label>
            <label className="block"><span className="text-[11px] font-black text-slate-600">Código do erro</span><input value={decisao.codigoErro} onChange={(e) => setDecisao((a) => ({ ...a, codigoErro: e.target.value }))} className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
            <label className="block"><span className="text-[11px] font-black text-slate-600">Observações</span><textarea rows={3} value={decisao.observacoes} onChange={(e) => setDecisao((a) => ({ ...a, observacoes: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            {selectedCiclo.status === "pausado_erro" ? <button type="button" onClick={registrarErro} className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-black">Salvar erro</button> : null}
            <RepairGroup title="Retornar para Reparo Mecânico" items={REPAROS_MECANICOS_LAVADORAS} selected={decisao.mecanicos} onToggle={(item) => toggle("mecanicos", item)} />
            <RepairGroup title="Retornar para Reparo Elétrico" items={REPAROS_ELETRICOS_LAVADORAS} selected={decisao.eletricos} onToggle={(item) => toggle("eletricos", item)} />
            <RepairGroup title="Retornar para Reparo Estético" items={REPAROS_ESTETICOS_LAVADORAS} selected={decisao.esteticos} onToggle={(item) => toggle("esteticos", item)} />
            <button type="button" onClick={retornarReparo} disabled={saving || !decisao.erroDescricao.trim()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-rose-600 text-xs font-black text-white disabled:opacity-40"><Wrench className="h-4 w-4" /> Reprovar e retornar ao reparo</button>
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-3"><div className="text-[11px] font-black text-rose-800">Condenação / Scrap</div><textarea rows={2} value={decisao.motivoCondenacao} onChange={(e) => setDecisao((a) => ({ ...a, motivoCondenacao: e.target.value }))} placeholder="Justificativa obrigatória" className="mt-2 w-full rounded-lg border border-rose-200 bg-white px-3 py-2 text-xs" /><button type="button" onClick={condenar} disabled={saving || !decisao.motivoCondenacao.trim()} className="mt-2 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-slate-900 text-[10px] font-black text-white disabled:opacity-40"><Trash2 className="h-3.5 w-3.5" /> Condenar e enviar para Scrap</button></div>
          </div>}
        </div>
      </section>

      {historico ? <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-sm font-black text-slate-900">Histórico técnico consolidado</h2><div className="mt-4 grid gap-3 lg:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">Ciclos</div>{historico.ciclos.slice(-5).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.etapa_teste} · ciclo {item.numero_ciclo} · {item.status} · {formatarSegundos(item.tempo_executado_segundos)}</div>)}</div><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">Reparos</div>{historico.reparos.slice(-5).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.area_execucao} · {item.servico_executado || item.diagnostico_final || "Registro técnico"}</div>)}</div><div className="rounded-xl bg-slate-50 p-4"><div className="text-[10px] font-black uppercase text-slate-400">Laudos</div>{historico.laudos.slice(-5).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.titulo}</div>)}</div></div></section> : null}
    </div>
  );
}
