import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  Clock3,
  History,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  TimerReset,
  WashingMachine,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "../../AuthContext.jsx";
import {
  DURACAO_CICLO_LAVADORA,
  POSICOES_BANCADA_LAVADORAS,
  buscarReferenciaProduto,
  calcularTempoExecutado,
  concluirCicloLavadora,
  encaminharLavadoraParaBancada,
  enviarCicloParaReparo,
  fetchEventosCicloLavadora,
  fetchPainelTriagemLavadoras,
  iniciarCicloLavadora,
  pausarCicloLavadora,
  registrarErroCicloLavadora,
  retomarCicloLavadora,
  valoresIguais,
} from "../../services/lavadorasTriagemService.js";

const TIPOS_ERRO = [
  "Não liga",
  "Código de erro no display",
  "Não enche",
  "Não drena",
  "Vazamento",
  "Não gira",
  "Não centrifuga",
  "Ruído anormal",
  "Vibração excessiva",
  "Falha de motor",
  "Falha de placa",
  "Falha elétrica",
  "Outro",
];

const AREAS_REPARO = ["Reparo Mecânico", "Reparo Elétrico", "Reparo Estético"];
const STATUS_ATIVOS = ["em_ciclo", "pausado", "pausado_erro"];

const EMPTY_VALIDACAO = {
  marca: "",
  modelo: "",
  tensao: "",
  tipo: "",
  capacidade: "",
  cor: "",
  descricao: "",
};

const EMPTY_ERRO = {
  tipoErro: "",
  codigoErro: "",
  observacoes: "",
  areaReparo: "Reparo Elétrico",
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
    second: "2-digit",
  });
}

function formatarData(valor) {
  if (!valor) return "—";
  const data = new Date(`${valor}T12:00:00`);
  return Number.isNaN(data.getTime()) ? valor : data.toLocaleDateString("pt-BR");
}

function hoje(valor) {
  if (!valor) return false;
  const data = new Date(valor);
  const atual = new Date();
  return (
    data.getFullYear() === atual.getFullYear() &&
    data.getMonth() === atual.getMonth() &&
    data.getDate() === atual.getDate()
  );
}

function statusValidacao(esperado, fisico, obrigatorio = false) {
  if (!String(esperado || "").trim()) {
    return { label: "Sem referência", tone: "neutral", ok: !obrigatorio };
  }
  if (!String(fisico || "").trim()) {
    return { label: "Não identificado", tone: "neutral", ok: false };
  }
  if (valoresIguais(esperado, fisico)) {
    return { label: "Confirmado", tone: "success", ok: true };
  }
  return { label: "Divergente", tone: "danger", ok: false };
}

function StatusPill({ status }) {
  const styles = {
    success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    danger: "bg-rose-50 text-rose-700 ring-rose-200",
    warning: "bg-amber-50 text-amber-700 ring-amber-200",
    info: "bg-blue-50 text-blue-700 ring-blue-200",
    neutral: "bg-slate-100 text-slate-600 ring-slate-200",
    purple: "bg-violet-50 text-violet-700 ring-violet-200",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ring-1 ring-inset ${styles[status.tone] || styles.neutral}`}
    >
      {status.tone === "success" ? <Check className="h-3 w-3" /> : null}
      {status.tone === "danger" ? <AlertTriangle className="h-3 w-3" /> : null}
      {status.label}
    </span>
  );
}

function MetricCard({ icon: Icon, value, label, helper, tone = "purple" }) {
  const tones = {
    purple: "bg-violet-50 text-violet-700",
    blue: "bg-blue-50 text-blue-600",
    red: "bg-rose-50 text-rose-600",
    green: "bg-emerald-50 text-emerald-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };

  return (
    <div className="flex min-h-[104px] items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4">
      <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${tones[tone]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-2xl font-black tracking-tight text-slate-900">{value}</div>
        <div className="truncate text-xs font-black text-slate-700">{label}</div>
        <div className="mt-1 truncate text-[10px] font-medium text-slate-400">{helper}</div>
      </div>
    </div>
  );
}

function RingProgress({ percent, tone = "blue", children }) {
  const color = tone === "green" ? "#16a34a" : tone === "red" ? "#e11d48" : "#2563eb";
  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full"
      style={{ background: `conic-gradient(${color} ${percent}%, #e2e8f0 0)` }}
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white">{children}</div>
    </div>
  );
}

export default function TriagemLavadorasV2Page() {
  const { profile } = useAuth();
  const operador = profile?.nome || "Operação";

  const [painel, setPainel] = useState({ aguardando: [], ciclos: [], osList: [] });
  const [selectedOsId, setSelectedOsId] = useState("");
  const [selectedCicloId, setSelectedCicloId] = useState("");
  const [referenciaProduto, setReferenciaProduto] = useState(null);
  const [validacao, setValidacao] = useState({ ...EMPTY_VALIDACAO });
  const [posicaoNova, setPosicaoNova] = useState("");
  const [buscaOs, setBuscaOs] = useState("");
  const [eventos, setEventos] = useState([]);
  const [erroCiclo, setErroCiclo] = useState(null);
  const [erroForm, setErroForm] = useState({ ...EMPTY_ERRO });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [tick, setTick] = useState(Date.now());
  const finalizandoRef = useRef(new Set());

  const carregarPainel = useCallback(async ({ silencioso = false } = {}) => {
    try {
      if (!silencioso) setLoading(true);
      const data = await fetchPainelTriagemLavadoras();
      setPainel(data);

      setSelectedOsId((atual) => {
        if (atual && data.aguardando.some((item) => String(item.id) === String(atual))) return atual;
        return data.aguardando[0]?.id ? String(data.aguardando[0].id) : "";
      });

      setSelectedCicloId((atual) => {
        if (atual && data.ciclos.some((item) => String(item.id) === String(atual))) return atual;
        const preferido = data.ciclos.find((item) => STATUS_ATIVOS.includes(item.status)) || data.ciclos[0];
        return preferido?.id ? String(preferido.id) : "";
      });
    } catch (error) {
      setMensagem(`Erro ao carregar triagem: ${error.message}`);
    } finally {
      if (!silencioso) setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregarPainel();
  }, [carregarPainel]);

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
    async function carregarReferencia() {
      if (!selectedOs) {
        setReferenciaProduto(null);
        setValidacao({ ...EMPTY_VALIDACAO });
        return;
      }
      try {
        const referencia = await buscarReferenciaProduto(selectedOs);
        if (!cancelado) {
          setReferenciaProduto(referencia);
          setValidacao({ ...EMPTY_VALIDACAO });
        }
      } catch {
        if (!cancelado) {
          setReferenciaProduto(null);
          setValidacao({ ...EMPTY_VALIDACAO });
        }
      }
    }
    carregarReferencia();
    return () => {
      cancelado = true;
    };
  }, [selectedOs]);

  useEffect(() => {
    let cancelado = false;
    async function carregarEventos() {
      if (!selectedCiclo?.id) {
        setEventos([]);
        return;
      }
      try {
        const data = await fetchEventosCicloLavadora(selectedCiclo.id);
        if (!cancelado) setEventos(data);
      } catch (error) {
        if (!cancelado) setMensagem(`Erro ao carregar histórico: ${error.message}`);
      }
    }
    carregarEventos();
    return () => {
      cancelado = true;
    };
  }, [selectedCiclo?.id]);

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
        .then(() => carregarPainel({ silencioso: true }))
        .catch((error) => setMensagem(`Erro ao concluir ciclo: ${error.message}`))
        .finally(() => finalizandoRef.current.delete(ciclo.id));
    });
  }, [tick, painel.ciclos, carregarPainel, operador]);

  const linhasValidacao = useMemo(() => {
    if (!selectedOs) return [];
    return [
      { key: "marca", label: "Marca", sistema: selectedOs.marca, obrigatorio: true },
      { key: "modelo", label: "Modelo", sistema: selectedOs.modelo, obrigatorio: true },
      { key: "tensao", label: "Tensão", sistema: selectedOs.voltagem, obrigatorio: true },
      { key: "tipo", label: "Tipo", sistema: selectedOs.categoria, obrigatorio: true },
      {
        key: "capacidade",
        label: "Capacidade",
        sistema: referenciaProduto?.capacidade || "",
        obrigatorio: Boolean(referenciaProduto?.capacidade),
      },
      {
        key: "cor",
        label: "Cor",
        sistema: referenciaProduto?.cor || "",
        obrigatorio: Boolean(referenciaProduto?.cor),
      },
      {
        key: "descricao",
        label: "Descrição / características",
        sistema:
          referenciaProduto?.descricao ||
          [selectedOs.marca, selectedOs.modelo, selectedOs.voltagem].filter(Boolean).join(" "),
        obrigatorio: false,
      },
    ];
  }, [selectedOs, referenciaProduto]);

  const validacaoLiberada = useMemo(
    () =>
      linhasValidacao
        .filter((item) => item.obrigatorio)
        .every((item) => statusValidacao(item.sistema, validacao[item.key], true).ok),
    [linhasValidacao, validacao]
  );

  const posicoesOcupadas = useMemo(
    () =>
      new Set(
        painel.ciclos
          .filter((item) => STATUS_ATIVOS.includes(item.status))
          .map((item) => String(item.posicao))
      ),
    [painel.ciclos]
  );

  const posicoesDisponiveis = useMemo(
    () => POSICOES_BANCADA_LAVADORAS.filter((item) => !posicoesOcupadas.has(item)),
    [posicoesOcupadas]
  );

  useEffect(() => {
    if (!posicaoNova || !posicoesDisponiveis.includes(posicaoNova)) {
      setPosicaoNova(posicoesDisponiveis[0] || "");
    }
  }, [posicoesDisponiveis, posicaoNova]);

  const osFiltradas = useMemo(() => {
    const termo = buscaOs.trim().toLocaleLowerCase("pt-BR");
    if (!termo) return painel.aguardando;
    return painel.aguardando.filter((os) =>
      [os.numero_os, os.serial_number, os.marca, os.modelo, os.lote, os.fornecedor]
        .filter(Boolean)
        .some((valor) => String(valor).toLocaleLowerCase("pt-BR").includes(termo))
    );
  }, [painel.aguardando, buscaOs]);

  const metricas = useMemo(() => {
    const emCiclo = painel.ciclos.filter((item) => item.status === "em_ciclo").length;
    const erros = painel.ciclos.filter((item) => item.status === "pausado_erro").length;
    const concluidasHoje = painel.ciclos.filter(
      (item) => item.status === "concluido" && hoje(item.concluido_em)
    ).length;
    const primeiraTentativa = painel.ciclos.filter(
      (item) => Number(item.tentativa) === 1 && ["concluido", "enviado_reparo"].includes(item.status)
    );
    const aprovadasPrimeira = primeiraTentativa.filter((item) => item.status === "concluido").length;
    return {
      aguardando: painel.aguardando.length,
      emCiclo,
      erros,
      concluidasHoje,
      taxa: primeiraTentativa.length
        ? Math.round((aprovadasPrimeira / primeiraTentativa.length) * 100)
        : 0,
    };
  }, [painel]);

  const cardsBancada = useMemo(() => {
    const porPosicao = new Map();
    const recentes = [...painel.ciclos].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    recentes.forEach((ciclo) => {
      const posicao = String(ciclo.posicao);
      if (porPosicao.has(posicao)) return;
      if (STATUS_ATIVOS.includes(ciclo.status) || (ciclo.status === "concluido" && hoje(ciclo.concluido_em))) {
        porPosicao.set(posicao, ciclo);
      }
    });

    return POSICOES_BANCADA_LAVADORAS.map((posicao) => ({
      posicao,
      ciclo: porPosicao.get(posicao) || null,
    }));
  }, [painel.ciclos]);

  async function executarAcao(acao) {
    try {
      setSaving(true);
      setMensagem("");
      await acao();
      await carregarPainel({ silencioso: true });
    } catch (error) {
      setMensagem(error.message || "Não foi possível concluir a operação.");
    } finally {
      setSaving(false);
    }
  }

  function payloadValidacao() {
    return Object.fromEntries(
      linhasValidacao.map((item) => [
        item.key,
        {
          sistema: item.sistema || null,
          fisico: validacao[item.key] || null,
          status: statusValidacao(item.sistema, validacao[item.key], item.obrigatorio).label,
          obrigatorio: item.obrigatorio,
        },
      ])
    );
  }

  function iniciarCiclo() {
    if (!selectedOs) return setMensagem("Selecione uma OS para iniciar o ciclo.");
    if (!validacaoLiberada) {
      return setMensagem("Confirme os campos obrigatórios do produto antes de iniciar o ciclo.");
    }
    if (!posicaoNova) return setMensagem("Não há posição de bancada disponível.");

    executarAcao(async () => {
      const ciclo = await iniciarCicloLavadora({
        os: selectedOs,
        operador,
        validacaoProduto: payloadValidacao(),
        posicao: posicaoNova,
      });
      setSelectedCicloId(String(ciclo.id));
      setMensagem(`OS ${selectedOs.numero_os} iniciou o ciclo de 25 minutos na posição ${posicaoNova}.`);
    });
  }

  function abrirErro(ciclo) {
    executarAcao(async () => {
      const pausado =
        ciclo.status === "em_ciclo" ? await pausarCicloLavadora(ciclo, operador, true) : ciclo;
      setErroCiclo({ ...ciclo, ...pausado, os: ciclo.os });
      setErroForm({
        tipoErro: ciclo.erro_tipo || "",
        codigoErro: ciclo.erro_codigo || "",
        observacoes: ciclo.erro_observacoes || "",
        areaReparo: ciclo.area_reparo || "Reparo Elétrico",
      });
      setSelectedCicloId(String(ciclo.id));
    });
  }

  async function salvarErro(somenteSalvar = true) {
    if (!erroCiclo) return;
    if (!erroForm.tipoErro) return setMensagem("Informe o tipo de erro antes de salvar.");

    await executarAcao(async () => {
      const atualizado = await registrarErroCicloLavadora({
        ciclo: erroCiclo,
        tipoErro: erroForm.tipoErro,
        codigoErro: erroForm.codigoErro,
        observacoes: erroForm.observacoes,
        areaReparo: erroForm.areaReparo,
        operador,
      });

      if (!somenteSalvar) {
        await enviarCicloParaReparo({
          ciclo: { ...erroCiclo, ...atualizado },
          areaReparo: erroForm.areaReparo,
          operador,
        });
        setErroCiclo(null);
        setErroForm({ ...EMPTY_ERRO });
        setMensagem(`OS encaminhada para ${erroForm.areaReparo}.`);
      } else {
        setErroCiclo((atual) => ({ ...atual, ...atualizado }));
        setMensagem("Parada e erro registrados com sucesso.");
      }
    });
  }

  function selecionarCiclo(ciclo) {
    setSelectedCicloId(String(ciclo.id));
    if (ciclo.status === "pausado_erro") {
      setErroCiclo(ciclo);
      setErroForm({
        tipoErro: ciclo.erro_tipo || "",
        codigoErro: ciclo.erro_codigo || "",
        observacoes: ciclo.erro_observacoes || "",
        areaReparo: ciclo.area_reparo || "Reparo Elétrico",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-[#4C1D95]" />
          <div className="mt-3 text-sm font-bold text-slate-500">Carregando triagem operacional...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1800px]">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-6 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
            Linha Branca · Lavadoras
          </div>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3EFF5] text-[#4C1D95]">
              <WashingMachine className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-[-0.035em] text-slate-900">Triagem de Lavadoras</h1>
              <p className="mt-1 max-w-3xl text-sm text-slate-500">
                Valide o produto e execute o ciclo de lavagem de 25 minutos, com até 20 máquinas em paralelo.
              </p>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => carregarPainel()}
          disabled={saving}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar operação
        </button>
      </div>

      {mensagem ? (
        <div className="mt-5 flex items-start justify-between gap-4 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
          <span>{mensagem}</span>
          <button type="button" onClick={() => setMensagem("")} className="shrink-0 text-violet-400 hover:text-violet-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={Clock3} value={metricas.aguardando} label="Aguardando triagem" helper="OS na fila de validação" />
        <MetricCard icon={Play} value={metricas.emCiclo} label="Em ciclo" helper="Lavadoras em execução" tone="blue" />
        <MetricCard icon={AlertTriangle} value={metricas.erros} label="Paradas por erro" helper="Aguardando avaliação" tone="red" />
        <MetricCard icon={CheckCircle2} value={metricas.concluidasHoje} label="Aprovadas hoje" helper="Ciclos concluídos no dia" tone="green" />
        <MetricCard icon={Settings2} value={`${metricas.taxa}%`} label="Aprovação 1ª tentativa" helper="Base nos ciclos finalizados" tone="indigo" />
      </section>

      <section className="mt-5 grid gap-5 2xl:grid-cols-[420px_minmax(0,1fr)_340px]">
        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="text-sm font-black text-slate-900">Validação do Produto</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">Confira sistema x equipamento físico.</p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-500">
              {painel.aguardando.length} OS
            </span>
          </div>

          <div className="p-5">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={buscaOs}
                onChange={(event) => setBuscaOs(event.target.value)}
                placeholder="Buscar OS, modelo ou serial"
                className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none transition focus:border-[#765D81] focus:bg-white focus:ring-2 focus:ring-[#765D81]/10"
              />
            </div>

            <select
              value={selectedOsId}
              onChange={(event) => setSelectedOsId(event.target.value)}
              className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#765D81] focus:ring-2 focus:ring-[#765D81]/10"
            >
              <option value="">Selecione uma OS</option>
              {osFiltradas.map((os) => (
                <option key={os.id} value={os.id}>
                  {os.numero_os} — {os.marca || "Sem marca"} {os.modelo || ""}
                </option>
              ))}
            </select>

            {selectedOs ? (
              <>
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">OS</div>
                      <div className="mt-1 text-lg font-black text-slate-900">{selectedOs.numero_os}</div>
                    </div>
                    <StatusPill status={{ label: "Aguardando triagem", tone: "purple" }} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-200 pt-4 text-xs">
                    <div>
                      <div className="font-bold text-slate-400">Entrada</div>
                      <div className="mt-1 font-black text-slate-700">{formatarData(selectedOs.dt_entrada)}</div>
                    </div>
                    <div>
                      <div className="font-bold text-slate-400">Serial</div>
                      <div className="mt-1 truncate font-black text-slate-700">{selectedOs.serial_number || "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[96px_1fr_1fr] border-b border-slate-200 bg-slate-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <div>Característica</div><div>Sistema</div><div>Físico</div>
                  </div>
                  {linhasValidacao.map((item) => {
                    const status = statusValidacao(item.sistema, validacao[item.key], item.obrigatorio);
                    return (
                      <div key={item.key} className="border-b border-slate-100 px-3 py-3 last:border-b-0">
                        <div className="grid grid-cols-[96px_1fr_1fr] items-start gap-2">
                          <div className="pt-2 text-[11px] font-black text-slate-600">
                            {item.label}{item.obrigatorio ? <span className="ml-1 text-rose-500">*</span> : null}
                          </div>
                          <div className="pt-2 text-[11px] font-semibold text-slate-500">{item.sistema || "—"}</div>
                          {item.key === "descricao" ? (
                            <textarea
                              rows={2}
                              value={validacao[item.key]}
                              onChange={(event) => setValidacao((atual) => ({ ...atual, [item.key]: event.target.value }))}
                              className="min-h-[54px] w-full rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] outline-none focus:border-[#765D81]"
                            />
                          ) : (
                            <input
                              value={validacao[item.key]}
                              onChange={(event) => setValidacao((atual) => ({ ...atual, [item.key]: event.target.value }))}
                              className="h-9 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] outline-none focus:border-[#765D81]"
                            />
                          )}
                        </div>
                        <div className="mt-2 flex justify-end"><StatusPill status={status} /></div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-[1fr_auto] gap-3">
                  <select
                    value={posicaoNova}
                    onChange={(event) => setPosicaoNova(event.target.value)}
                    className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-[#765D81]"
                  >
                    {posicoesDisponiveis.length === 0 ? <option value="">Sem posição disponível</option> : null}
                    {posicoesDisponiveis.map((posicao) => <option key={posicao} value={posicao}>Posição {posicao}</option>)}
                  </select>
                  <button
                    type="button"
                    onClick={iniciarCiclo}
                    disabled={!validacaoLiberada || !posicaoNova || saving}
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#5B35C9] px-4 text-xs font-black text-white transition hover:bg-[#4C2AB2] disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    <Play className="h-4 w-4 fill-current" /> Iniciar ciclo
                  </button>
                </div>
              </>
            ) : (
              <div className="mt-5 rounded-2xl border border-dashed border-slate-300 px-5 py-10 text-center">
                <WashingMachine className="mx-auto h-7 w-7 text-slate-300" />
                <div className="mt-3 text-sm font-black text-slate-500">Nenhuma OS selecionada</div>
                <p className="mt-1 text-xs text-slate-400">Selecione uma lavadora aguardando triagem.</p>
              </div>
            )}
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <Settings2 className="h-4 w-4 text-[#5B35C9]" /> Bancada de Lavagem
              </h2>
              <p className="mt-0.5 text-[11px] text-slate-400">
                20 posições · cronômetros independentes de 25 minutos efetivos.
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-[10px] font-black text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {metricas.emCiclo} máquinas em operação
            </div>
          </div>

          <div className="max-h-[980px] overflow-y-auto p-4">
            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
              {cardsBancada.map(({ posicao, ciclo }) => {
                if (!ciclo) {
                  return (
                    <button
                      key={posicao}
                      type="button"
                      onClick={() => {
                        setPosicaoNova(posicao);
                        document.querySelector("input[placeholder='Buscar OS, modelo ou serial']")?.focus();
                      }}
                      className="flex min-h-[222px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/60 p-5 text-center transition hover:border-violet-300 hover:bg-violet-50/40"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-[#5B35C9] ring-1 ring-slate-200">
                        <Play className="h-4 w-4 fill-current" />
                      </div>
                      <div className="mt-3 text-xs font-black text-slate-600">Bancada disponível</div>
                      <div className="mt-1 text-[10px] font-semibold text-slate-400">Posição {posicao}</div>
                      <div className="mt-4 rounded-lg border border-violet-200 bg-white px-3 py-2 text-[10px] font-black text-violet-700">
                        Iniciar novo ciclo
                      </div>
                    </button>
                  );
                }

                const executado = calcularTempoExecutado(ciclo, tick);
                const alvo = Number(ciclo.duracao_alvo_segundos || DURACAO_CICLO_LAVADORA);
                const progresso = Math.min(100, Math.round((executado / alvo) * 100));
                const pausadoErro = ciclo.status === "pausado_erro";
                const pausado = ciclo.status === "pausado";
                const concluido = ciclo.status === "concluido";
                const tone = concluido ? "green" : pausadoErro ? "red" : "blue";
                const status = concluido
                  ? { label: "Concluída", tone: "success" }
                  : pausadoErro
                    ? { label: "Pausada por erro", tone: "danger" }
                    : pausado
                      ? { label: "Pausada", tone: "warning" }
                      : { label: "Em ciclo", tone: "info" };

                return (
                  <div
                    key={posicao}
                    onClick={() => selecionarCiclo(ciclo)}
                    className={`min-h-[222px] cursor-pointer rounded-2xl border bg-white p-4 transition ${
                      String(selectedCicloId) === String(ciclo.id)
                        ? "border-violet-400 ring-2 ring-violet-100"
                        : pausadoErro
                          ? "border-rose-200"
                          : "border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-black text-slate-600">Posição {posicao}</div>
                      <StatusPill status={status} />
                    </div>

                    <div className="mt-4 flex items-start gap-3">
                      <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${concluido ? "bg-emerald-50 text-emerald-600" : pausadoErro ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500"}`}>
                        <WashingMachine className="h-7 w-7" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-black text-slate-900">{ciclo.os?.numero_os || `OS #${ciclo.os_id}`}</div>
                        <div className="mt-1 truncate text-[11px] font-semibold text-slate-500">{ciclo.os?.marca || "—"} {ciclo.os?.modelo || ""}</div>
                        <div className="text-[10px] text-slate-400">{ciclo.os?.voltagem || "—"} · Tentativa {ciclo.tentativa}</div>
                        <div className="mt-1 truncate text-[10px] text-slate-400">Operador: {ciclo.operador || "—"}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-3">
                      <RingProgress percent={progresso} tone={tone}>
                        {concluido ? <Check className="h-5 w-5 text-emerald-600" /> : pausadoErro ? <CircleAlert className="h-5 w-5 text-rose-600" /> : <span className="text-[9px] font-black text-slate-500">{progresso}%</span>}
                      </RingProgress>
                      <div>
                        <div className="text-base font-black text-slate-900">{formatarSegundos(executado)} <span className="text-xs text-slate-400">/ 25:00</span></div>
                        <div className={`text-[10px] font-semibold ${pausadoErro ? "text-rose-500" : concluido ? "text-emerald-600" : "text-slate-400"}`}>
                          {pausadoErro ? "Cronômetro parado por falha" : pausado ? "Ciclo pausado" : concluido ? `Concluído ${formatarDataHora(ciclo.concluido_em)}` : "Ciclo de lavagem"}
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2">
                      {ciclo.status === "em_ciclo" ? (
                        <>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              executarAcao(() => pausarCicloLavadora(ciclo, operador, false));
                            }}
                            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 text-[10px] font-black text-slate-600 hover:bg-slate-100"
                          >
                            <Pause className="h-3.5 w-3.5 fill-current" /> Pausar
                          </button>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              abrirErro(ciclo);
                            }}
                            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-[10px] font-black text-white hover:bg-rose-700"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" /> Parar por erro
                          </button>
                        </>
                      ) : null}

                      {pausado || pausadoErro ? (
                        <>
                          <button
                            type="button"
                            disabled={saving}
                            onClick={(event) => {
                              event.stopPropagation();
                              executarAcao(() => retomarCicloLavadora(ciclo, operador));
                            }}
                            className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#5B35C9] text-[10px] font-black text-white hover:bg-[#4C2AB2]"
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Retomar ciclo
                          </button>
                          {pausadoErro ? (
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                selecionarCiclo(ciclo);
                              }}
                              className="flex h-9 flex-1 items-center justify-center gap-1.5 rounded-lg bg-rose-600 text-[10px] font-black text-white hover:bg-rose-700"
                            >
                              <Wrench className="h-3.5 w-3.5" /> Tratar erro
                            </button>
                          ) : null}
                        </>
                      ) : null}

                      {concluido ? (
                        <button
                          type="button"
                          disabled={saving}
                          onClick={(event) => {
                            event.stopPropagation();
                            executarAcao(() => encaminharLavadoraParaBancada(ciclo, operador));
                          }}
                          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-[10px] font-black text-emerald-700 hover:bg-emerald-100"
                        >
                          Enviar para próxima etapa <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="min-w-0 rounded-2xl border border-slate-200 bg-white">
          {erroCiclo ? (
            <>
              <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
                <div>
                  <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                    <AlertTriangle className="h-4 w-4 text-rose-600" /> Registro de Erro
                  </h2>
                  <p className="mt-1 text-[11px] font-semibold text-slate-400">{erroCiclo.os?.numero_os || `OS #${erroCiclo.os_id}`}</p>
                </div>
                <button type="button" onClick={() => setErroCiclo(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-4 p-5">
                <label className="block">
                  <span className="text-[11px] font-black text-slate-600">Tipo de erro *</span>
                  <select
                    value={erroForm.tipoErro}
                    onChange={(event) => setErroForm((atual) => ({ ...atual, tipoErro: event.target.value }))}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  >
                    <option value="">Selecione...</option>
                    {TIPOS_ERRO.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-black text-slate-600">Código do erro</span>
                  <input
                    value={erroForm.codigoErro}
                    onChange={(event) => setErroForm((atual) => ({ ...atual, codigoErro: event.target.value }))}
                    placeholder="Ex.: E3"
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  />
                </label>

                <label className="block">
                  <span className="text-[11px] font-black text-slate-600">Área de reparo</span>
                  <select
                    value={erroForm.areaReparo}
                    onChange={(event) => setErroForm((atual) => ({ ...atual, areaReparo: event.target.value }))}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  >
                    {AREAS_REPARO.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select>
                </label>

                <label className="block">
                  <span className="text-[11px] font-black text-slate-600">Observações do técnico</span>
                  <textarea
                    rows={5}
                    maxLength={500}
                    value={erroForm.observacoes}
                    onChange={(event) => setErroForm((atual) => ({ ...atual, observacoes: event.target.value }))}
                    placeholder="Descreva o comportamento da lavadora..."
                    className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                  />
                  <div className="mt-1 text-right text-[10px] font-semibold text-slate-400">{erroForm.observacoes.length}/500</div>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => salvarErro(true)}
                    disabled={saving || !erroForm.tipoErro}
                    className="h-10 rounded-xl border border-slate-200 bg-slate-50 text-[11px] font-black text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                  >
                    Salvar parada
                  </button>
                  <button
                    type="button"
                    onClick={() => salvarErro(false)}
                    disabled={saving || !erroForm.tipoErro}
                    className="flex h-10 items-center justify-center gap-2 rounded-xl bg-rose-600 text-[11px] font-black text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Wrench className="h-4 w-4" /> Enviar para reparo
                  </button>
                </div>

                <div className="rounded-xl border border-rose-100 bg-rose-50 p-3 text-[10px] font-semibold leading-5 text-rose-700">
                  Ao enviar para reparo, o ciclo é encerrado e a tentativa fica preservada no histórico da OS.
                </div>
              </div>
            </>
          ) : (
            <div className="flex min-h-[460px] flex-col items-center justify-center px-6 text-center">
              <TimerReset className="h-9 w-9 text-slate-300" />
              <div className="mt-4 text-sm font-black text-slate-600">Registro de erro</div>
              <p className="mt-2 max-w-[230px] text-xs leading-5 text-slate-400">
                Clique em <strong>Parar por erro</strong> em qualquer lavadora para congelar o relógio e registrar a falha.
              </p>
            </div>
          )}
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <History className="h-4 w-4 text-[#5B35C9]" /> Histórico do Ciclo / Eventos
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-400">Histórico completo da OS selecionada na bancada.</p>
          </div>
          {selectedCiclo ? (
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-black text-slate-600">
              {selectedCiclo.os?.numero_os || `OS #${selectedCiclo.os_id}`} · Tentativa {selectedCiclo.tentativa}
            </div>
          ) : null}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-5 py-3">Data e hora</th>
                <th className="px-5 py-3">Evento</th>
                <th className="px-5 py-3">Detalhes</th>
                <th className="px-5 py-3">Tempo executado</th>
                <th className="px-5 py-3">Operador</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs text-slate-600">
              {eventos.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">
                    {selectedCiclo ? "Ainda não há eventos registrados para este ciclo." : "Selecione uma lavadora da bancada para visualizar o histórico."}
                  </td>
                </tr>
              ) : (
                eventos.map((evento) => (
                  <tr key={evento.id}>
                    <td className="whitespace-nowrap px-5 py-3 font-semibold text-slate-500">{formatarDataHora(evento.created_at)}</td>
                    <td className="whitespace-nowrap px-5 py-3 font-black text-slate-700">{evento.tipo_evento}</td>
                    <td className="min-w-[280px] px-5 py-3">{evento.detalhes || "—"}</td>
                    <td className="whitespace-nowrap px-5 py-3 font-black">{evento.tempo_executado_segundos == null ? "—" : formatarSegundos(evento.tempo_executado_segundos)}</td>
                    <td className="whitespace-nowrap px-5 py-3">{evento.operador || "Sistema"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
