import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  History,
  PackageCheck,
  PackagePlus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "../../AuthContext.jsx";
import {
  REPAROS_ELETRICOS_REFRIG,
  REPAROS_ESTETICOS_REFRIG,
  REPAROS_MECANICOS_REFRIG,
} from "../../services/linhaBrancaService.js";
import { salvarExecucaoReparo } from "../../services/reparoLinhaBrancaService.js";
import {
  DESTINOS_CONDENACAO,
  atualizarNecessidadeCompraStatus,
  consultarPecaPorPn,
  decidirCondenacao,
  fetchCondenacoesPendentes,
  fetchHistoricoRefrigeracao,
  fetchNecessidadesCompraPendentes,
  fetchOsRefrigeracaoParaReparo,
  isGerenteLinhaBranca,
  registrarDemandaPeca,
  solicitarCondenacao,
  uploadFotosCondenacao,
} from "../../services/refrigeracaoService.js";

const AREA_CONFIG = {
  "Reparo Mecânico": { titulo: "Mecânico", lista: REPAROS_MECANICOS_REFRIG },
  "Reparo Elétrico": { titulo: "Elétrico", lista: REPAROS_ELETRICOS_REFRIG },
  "Reparo Estético": { titulo: "Estético", lista: REPAROS_ESTETICOS_REFRIG },
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
  reposicaoTroca: null,
};

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-800">{value || "—"}</div>
    </div>
  );
}

export default function ReparosRefrigeracaoV2Page() {
  const { profile } = useAuth();
  const tecnico = profile?.nome || "Operação";

  const [osList, setOsList] = useState([]);
  const [busca, setBusca] = useState("");
  const [selectedOsId, setSelectedOsId] = useState("");
  const [areaAtual, setAreaAtual] = useState("");
  const [execucao, setExecucao] = useState({ ...EMPTY, dt_inicio: new Date().toISOString() });
  const [historico, setHistorico] = useState(null);
  const [consultaPeca, setConsultaPeca] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const [ehGerente, setEhGerente] = useState(false);
  const [condenacoesPendentes, setCondenacoesPendentes] = useState([]);
  const [comprasPendentes, setComprasPendentes] = useState([]);
  const [decisoes, setDecisoes] = useState({});

  const selectedOs = useMemo(
    () => osList.find((item) => String(item.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  const areasPendentes = useMemo(() => {
    if (!selectedOs) return [];
    const concluidas = selectedOs.areas_concluidas || [];
    return (selectedOs.areas_reparo || []).filter(
      (area) => AREAS.includes(area) && !concluidas.includes(area)
    );
  }, [selectedOs]);

  const configArea = areaAtual ? AREA_CONFIG[areaAtual] : null;

  const osFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return osList;
    return osList.filter((os) =>
      [os.numero_os, os.serial_number, os.marca, os.modelo, os.fornecedor, os.lote]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo))
    );
  }, [osList, busca]);

  async function carregarOs() {
    try {
      setLoading(true);
      const data = await fetchOsRefrigeracaoParaReparo();
      setOsList(data);
    } catch (error) {
      setMensagem(`Erro ao carregar OS: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function carregarPendenciasGerente() {
    if (!ehGerente) return;
    try {
      const [condenacoes, compras] = await Promise.all([
        fetchCondenacoesPendentes(),
        fetchNecessidadesCompraPendentes(),
      ]);
      setCondenacoesPendentes(condenacoes);
      setComprasPendentes(compras);
      setDecisoes((atual) => {
        const proximo = { ...atual };
        condenacoes.forEach((item) => {
          if (!proximo[item.id]) proximo[item.id] = { destino: "Scrap", observacoes: "" };
        });
        return proximo;
      });
    } catch (error) {
      setMensagem(`Erro ao carregar pendências gerenciais: ${error.message}`);
    }
  }

  useEffect(() => {
    carregarOs();
  }, []);

  useEffect(() => {
    let cancelado = false;
    async function verificarGerencia() {
      if (!profile?.id) return;
      try {
        const resultado = await isGerenteLinhaBranca(profile.id);
        if (!cancelado) setEhGerente(resultado);
      } catch {
        if (!cancelado) setEhGerente(false);
      }
    }
    verificarGerencia();
    return () => { cancelado = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (ehGerente) carregarPendenciasGerente();
  }, [ehGerente]);

  useEffect(() => {
    let cancelado = false;
    async function carregarHistorico() {
      if (!selectedOs?.id) {
        setHistorico(null);
        return;
      }
      try {
        const data = await fetchHistoricoRefrigeracao(selectedOs.id);
        if (!cancelado) setHistorico(data);
      } catch (error) {
        if (!cancelado) setMensagem(`Erro ao carregar histórico: ${error.message}`);
      }
    }
    carregarHistorico();
    return () => { cancelado = true; };
  }, [selectedOs?.id]);

  useEffect(() => {
    const pn = execucao.novaPeca.trim();
    if (pn.length < 3) {
      setConsultaPeca(null);
      return undefined;
    }

    setConsultaPeca({ status: "buscando" });
    const timer = window.setTimeout(async () => {
      try {
        const peca = await consultarPecaPorPn(pn);
        if (peca && Number(peca.saldo || 0) > 0) {
          setConsultaPeca({ status: "estoque", peca });
        } else if (peca) {
          setConsultaPeca({ status: "sem_estoque", peca });
        } else {
          setConsultaPeca({ status: "nao_encontrado", peca: null });
        }
      } catch (error) {
        setConsultaPeca({ status: "erro", mensagem: error.message });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [execucao.novaPeca]);

  function selecionarOs(os) {
    const concluidas = os.areas_concluidas || [];
    const pendentes = (os.areas_reparo || []).filter(
      (area) => AREAS.includes(area) && !concluidas.includes(area)
    );

    setSelectedOsId(String(os.id));
    setAreaAtual(pendentes[0] || "");
    setBusca("");
    setMensagem("");
    setFotos([]);
    setConsultaPeca(null);
    setExecucao({ ...EMPTY, dt_inicio: new Date().toISOString() });
  }

  function limpar() {
    setSelectedOsId("");
    setAreaAtual("");
    setBusca("");
    setHistorico(null);
    setFotos([]);
    setConsultaPeca(null);
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

  async function adicionarPeca() {
    if (!selectedOs) return setMensagem("Selecione uma OS antes de adicionar a peça.");
    const pn = execucao.novaPeca.trim();
    if (!pn) return;

    try {
      setSaving(true);
      const resultado = await registrarDemandaPeca({
        os: selectedOs,
        pn,
        quantidade: 1,
        usuario: profile,
      });

      const item = {
        pn: pn.toUpperCase(),
        tipo: resultado.tipo,
        descricao: resultado.peca?.descricao || null,
        saldo: resultado.peca?.saldo ?? null,
        localizacao: resultado.peca?.localizacao || null,
      };

      setExecucao((atual) => ({
        ...atual,
        pecas: atual.pecas.some((peca) => peca.pn === item.pn)
          ? atual.pecas
          : [...atual.pecas, item],
        novaPeca: "",
      }));
      setConsultaPeca(null);
      setMensagem(
        resultado.tipo === "estoque"
          ? `PN ${item.pn} disponível. Requisição de separação gerada.`
          : `PN ${item.pn} sem disponibilidade. Necessidade de compra enviada ao Marcelo.`
      );
      if (ehGerente) await carregarPendenciasGerente();
    } catch (error) {
      setMensagem(`Erro ao registrar peça: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function salvar() {
    if (!selectedOs || !areaAtual || !execucao.diagnostico_final.trim() || !execucao.servicos.length) {
      return setMensagem("Informe o diagnóstico e selecione ao menos um serviço executado.");
    }

    try {
      setSaving(true);
      const numeroOs = selectedOs.numero_os;
      const haviaMaisAreas = areasPendentes.length > 1;

      await salvarExecucaoReparo(
        selectedOs,
        {
          tecnico,
          dt_inicio: execucao.dt_inicio,
          diagnostico_final: execucao.diagnostico_final,
          servico_executado: execucao.servicos.join(", "),
          peca_trocada: execucao.pecas.length > 0,
          descricao_peca: execucao.pecas.map((item) => item.pn).join(", "),
          observacoes: execucao.observacoes,
        },
        areaAtual
      );

      limpar();
      await carregarOs();
      setMensagem(
        haviaMaisAreas
          ? `Reparo da OS ${numeroOs} concluído nesta especialidade. A OS segue para a próxima área.`
          : `Reparo da OS ${numeroOs} concluído. Equipamento encaminhado para Bancada de Testes.`
      );
    } catch (error) {
      setMensagem(`Erro ao salvar reparo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function solicitarCondenacaoAtual() {
    if (!selectedOs) return;
    if (!execucao.motivoCondenacao.trim()) return setMensagem("Informe a justificativa da condenação.");
    if (execucao.reposicaoTroca === null) return setMensagem("Informe se haverá reposição ou troca.");
    if (execucao.reposicaoTroca && fotos.length === 0) {
      return setMensagem("Carregue ao menos uma foto quando houver reposição ou troca.");
    }

    try {
      setSaving(true);
      let paths = [];
      if (execucao.reposicaoTroca && fotos.length) {
        paths = await uploadFotosCondenacao({
          osId: selectedOs.id,
          files: fotos,
          userId: profile?.id,
        });
      }

      await solicitarCondenacao({
        os: selectedOs,
        motivo: execucao.motivoCondenacao,
        temReposicaoTroca: execucao.reposicaoTroca,
        fotos: paths,
        usuario: profile,
      });

      const numeroOs = selectedOs.numero_os;
      limpar();
      await carregarOs();
      if (ehGerente) await carregarPendenciasGerente();
      setMensagem(`Condenação da OS ${numeroOs} enviada para aprovação do Marcelo.`);
    } catch (error) {
      setMensagem(`Erro ao solicitar condenação: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function decidir(item, aprovar) {
    const decisao = decisoes[item.id] || { destino: "Scrap", observacoes: "" };
    try {
      setSaving(true);
      await decidirCondenacao({
        condenacao: item,
        aprovar,
        destino: aprovar ? decisao.destino : null,
        observacoes: decisao.observacoes,
        usuario: profile,
      });
      await Promise.all([carregarPendenciasGerente(), carregarOs()]);
      setMensagem(
        aprovar
          ? `Condenação da OS ${item.ordens_servico?.numero_os || item.os_id} aprovada e destinada para ${decisao.destino}.`
          : `Condenação da OS ${item.ordens_servico?.numero_os || item.os_id} rejeitada.`
      );
    } catch (error) {
      setMensagem(`Erro ao decidir condenação: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function atualizarCompra(id, status) {
    try {
      setSaving(true);
      await atualizarNecessidadeCompraStatus(id, status, profile?.id);
      await carregarPendenciasGerente();
    } catch (error) {
      setMensagem(`Erro ao atualizar necessidade de compra: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="border-b border-slate-200 pb-6">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
          Linha Branca · Refrigeração
        </div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3EFF5] text-[#4C1D95]">
            <Wrench className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-[-0.035em] text-slate-900">Reparos de Refrigeração</h1>
            <p className="mt-1 text-sm text-slate-500">
              Origem da falha, escopo solicitado, execução técnica, peças e decisão de reparabilidade.
            </p>
          </div>
        </div>
      </div>

      {mensagem ? (
        <div className="mt-5 flex items-start justify-between gap-3 rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
          <span>{mensagem}</span>
          <button type="button" onClick={() => setMensagem("")}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {ehGerente ? (
        <section className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-amber-900">
                  <ShieldCheck className="h-4 w-4" /> Aprovações de condenação
                </div>
                <p className="mt-1 text-[11px] text-amber-700">Pendências exclusivas do gerente da Linha Branca.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-800">{condenacoesPendentes.length}</span>
            </div>

            <div className="mt-4 space-y-3">
              {condenacoesPendentes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-white/60 p-4 text-xs text-amber-700">
                  Nenhuma condenação aguardando aprovação.
                </div>
              ) : condenacoesPendentes.map((item) => {
                const decisao = decisoes[item.id] || { destino: "Scrap", observacoes: "" };
                return (
                  <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-4">
                    <div className="text-sm font-black text-slate-900">{item.ordens_servico?.numero_os || `OS #${item.os_id}`}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{item.ordens_servico?.marca} {item.ordens_servico?.modelo}</div>
                    <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs leading-5 text-rose-700">{item.motivo}</div>
                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-bold">
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-600">
                        Reposição/troca: {item.tem_reposicao_troca ? "Sim" : "Não"}
                      </span>
                      {(item.fotos_assinadas || []).map((foto, index) => foto.url ? (
                        <a key={foto.path} href={foto.url} target="_blank" rel="noreferrer" className="rounded-full bg-blue-50 px-2.5 py-1 text-blue-700">
                          Foto {index + 1}
                        </a>
                      ) : null)}
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr]">
                      <select
                        value={decisao.destino}
                        onChange={(e) => setDecisoes((atual) => ({ ...atual, [item.id]: { ...decisao, destino: e.target.value } }))}
                        className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold"
                      >
                        {DESTINOS_CONDENACAO.map((destino) => <option key={destino} value={destino}>{destino}</option>)}
                      </select>
                      <input
                        value={decisao.observacoes}
                        onChange={(e) => setDecisoes((atual) => ({ ...atual, [item.id]: { ...decisao, observacoes: e.target.value } }))}
                        placeholder="Observação da decisão"
                        className="h-10 rounded-xl border border-slate-200 px-3 text-xs"
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" disabled={saving} onClick={() => decidir(item, true)} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[10px] font-black text-white">
                        <CheckCircle2 className="h-4 w-4" /> Aprovar e destinar
                      </button>
                      <button type="button" disabled={saving} onClick={() => decidir(item, false)} className="h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600">
                        Rejeitar condenação
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-black text-blue-900">
                  <ShoppingCart className="h-4 w-4" /> Necessidades de compra
                </div>
                <p className="mt-1 text-[11px] text-blue-700">PNs sem saldo no estoque de peças.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-blue-800">{comprasPendentes.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {comprasPendentes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-blue-200 bg-white/60 p-4 text-xs text-blue-700">
                  Nenhuma necessidade de compra aberta.
                </div>
              ) : comprasPendentes.map((item) => (
                <div key={item.id} className="rounded-xl border border-blue-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-xs font-black text-slate-900">{item.pn}</div>
                      <div className="mt-0.5 text-[10px] text-slate-500">{item.ordens_servico?.numero_os || `OS #${item.os_id}`} · {item.ordens_servico?.marca} {item.ordens_servico?.modelo}</div>
                    </div>
                    <span className="rounded-full bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">{item.status}</span>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => atualizarCompra(item.id, "em_cotacao")} className="rounded-lg border border-blue-200 px-3 py-1.5 text-[10px] font-black text-blue-700">Em cotação</button>
                    <button type="button" onClick={() => atualizarCompra(item.id, "comprada")} className="rounded-lg bg-blue-700 px-3 py-1.5 text-[10px] font-black text-white">Comprada</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="mt-6 grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">OS aguardando reparo</h2>
            <span className="text-[10px] font-black text-slate-400">{loading ? "..." : osList.length}</span>
          </div>

          <div className="relative mt-4">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar OS, modelo ou serial"
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#765D81]"
            />
          </div>

          <select
            value={selectedOsId}
            onChange={(e) => {
              const os = osFiltradas.find((item) => String(item.id) === e.target.value);
              if (os) selecionarOs(os);
            }}
            className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700"
          >
            <option value="">Selecione uma OS</option>
            {osFiltradas.map((os) => (
              <option key={os.id} value={os.id}>{os.numero_os} — {os.marca} {os.modelo}</option>
            ))}
          </select>

          {selectedOs ? (
            <>
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <div className="flex items-center gap-3">
                  <Wrench className="h-6 w-6 text-[#5B35C9]" />
                  <div>
                    <div className="text-base font-black text-slate-900">{selectedOs.numero_os}</div>
                    <div className="text-[10px] text-slate-500">{selectedOs.marca} {selectedOs.modelo}</div>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Info label="Tensão" value={selectedOs.voltagem} />
                  <Info label="Serial" value={selectedOs.serial_number} />
                  <Info label="Status" value={selectedOs.status_atual} />
                  <Info label="Área atual" value={selectedOs.area_destino} />
                </div>
              </div>
              <button type="button" onClick={limpar} className="mt-3 text-[10px] font-black text-slate-500">Trocar OS</button>
            </>
          ) : null}
        </div>

        <div className="space-y-5">
          {selectedOs ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-rose-800">
                <AlertTriangle className="h-4 w-4" /> Origem da falha / Triagem
              </div>
              <div className="mt-3 text-sm leading-6 text-rose-700">
                {selectedOs.__triagem?.observacoes_triagem || "Sem observação de falha registrada na triagem."}
              </div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[10px] font-black text-slate-500">Mecânicos solicitados</div>
                  <div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_mecanicos || []).join(", ") || "—"}</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[10px] font-black text-slate-500">Elétricos solicitados</div>
                  <div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_eletricos || []).join(", ") || "—"}</div>
                </div>
                <div className="rounded-xl bg-white p-3">
                  <div className="text-[10px] font-black text-slate-500">Estéticos solicitados</div>
                  <div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_esteticos || []).join(", ") || "—"}</div>
                </div>
              </div>
            </div>
          ) : null}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
            <div className="flex flex-wrap gap-2">
              {areasPendentes.map((area) => (
                <button
                  key={area}
                  type="button"
                  onClick={() => {
                    setAreaAtual(area);
                    setExecucao((a) => ({ ...a, servicos: [] }));
                  }}
                  className={`rounded-xl px-4 py-2 text-xs font-black ${areaAtual === area ? "bg-[#5B35C9] text-white" : "bg-slate-100 text-slate-600"}`}
                >
                  {area}
                </button>
              ))}
            </div>

            {configArea ? (
              <div className="mt-5">
                <div className="text-sm font-black text-slate-900">Serviços — {configArea.titulo}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {configArea.lista.map((item) => (
                    <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-[10px] font-bold ${execucao.servicos.includes(item) ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}>
                      <input type="checkbox" checked={execucao.servicos.includes(item)} onChange={() => toggleServico(item)} />
                      {item}
                    </label>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-slate-300 p-4 text-xs text-slate-500">
                A OS não possui especialidade de reparo pendente configurada.
              </div>
            )}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label>
                <span className="text-[11px] font-black text-slate-600">Diagnóstico final *</span>
                <textarea rows={4} value={execucao.diagnostico_final} onChange={(e) => setExecucao((a) => ({ ...a, diagnostico_final: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
              <label>
                <span className="text-[11px] font-black text-slate-600">Observações</span>
                <textarea rows={4} value={execucao.observacoes} onChange={(e) => setExecucao((a) => ({ ...a, observacoes: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
              </label>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black text-slate-700">
                <PackageCheck className="h-4 w-4 text-[#5B35C9]" /> Peças utilizadas — validação por PN
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={execucao.novaPeca}
                  onChange={(e) => setExecucao((a) => ({ ...a, novaPeca: e.target.value.toUpperCase() }))}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarPeca(); } }}
                  placeholder="Digite o PN"
                  className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm"
                />
                <button type="button" onClick={adicionarPeca} disabled={saving || !execucao.novaPeca.trim()} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black disabled:opacity-40">
                  <PackagePlus className="h-4 w-4" /> Adicionar
                </button>
              </div>

              {consultaPeca ? (
                <div className="mt-2">
                  {consultaPeca.status === "buscando" ? <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">Consultando estoque...</span> : null}
                  {consultaPeca.status === "estoque" ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700">EM ESTOQUE · saldo {consultaPeca.peca.saldo} · {consultaPeca.peca.localizacao || "sem localização"}</span> : null}
                  {consultaPeca.status === "sem_estoque" ? <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black text-rose-700">SEM SALDO · será gerada necessidade de compra</span> : null}
                  {consultaPeca.status === "nao_encontrado" ? <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black text-rose-700">PN NÃO ENCONTRADO · será gerada necessidade de compra</span> : null}
                </div>
              ) : null}

              <div className="mt-3 flex flex-wrap gap-2">
                {execucao.pecas.map((peca) => (
                  <span key={peca.pn} className={`rounded-full px-3 py-1 text-[10px] font-black ${peca.tipo === "estoque" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {peca.pn} · {peca.tipo === "estoque" ? "requisição gerada" : "compra necessária"}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={salvar}
              disabled={saving || !selectedOs || !areaAtual || !execucao.diagnostico_final.trim() || !execucao.servicos.length}
              className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5B35C9] text-xs font-black text-white disabled:bg-slate-300"
            >
              <Wrench className="h-4 w-4" /> Salvar reparo desta área
            </button>
          </div>

          {historico ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900">
                <History className="h-4 w-4 text-[#5B35C9]" /> Histórico técnico
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black text-slate-400">Triagens</div>
                  {(historico.triagens || []).slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.observacoes_triagem || "Triagem registrada"}</div>)}
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black text-slate-400">Reparos anteriores</div>
                  {(historico.reparos || []).slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.area_execucao} · {item.servico_executado || item.diagnostico_final}</div>)}
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <div className="text-[10px] font-black text-slate-400">Peças / compras</div>
                  {(historico.requisicoes || []).slice(-2).map((item) => <div key={`r-${item.id}`} className="mt-2 text-[10px] text-emerald-700">{item.pn} · requisição {item.status}</div>)}
                  {(historico.compras || []).slice(-2).map((item) => <div key={`c-${item.id}`} className="mt-2 text-[10px] text-rose-700">{item.pn} · compra {item.status}</div>)}
                </div>
              </div>
            </div>
          ) : null}

          <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-5 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
            <div className="flex items-center gap-2 text-sm font-black text-amber-900">
              <ShieldCheck className="h-4 w-4" /> Solicitar condenação
            </div>
            <p className="mt-1 text-[11px] leading-5 text-amber-700">
              A condenação não é automática. A solicitação será enviada ao Marcelo para aprovação e definição do destino: Scrap, venda no estado ou desmembramento.
            </p>

            <textarea
              rows={3}
              value={execucao.motivoCondenacao}
              onChange={(e) => setExecucao((a) => ({ ...a, motivoCondenacao: e.target.value }))}
              placeholder="Justificativa técnica obrigatória"
              className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm"
            />

            <div className="mt-3">
              <div className="text-[11px] font-black text-amber-900">Terá reposição ou troca?</div>
              <div className="mt-2 flex gap-2">
                {[true, false].map((valor) => (
                  <button
                    key={String(valor)}
                    type="button"
                    onClick={() => setExecucao((a) => ({ ...a, reposicaoTroca: valor }))}
                    className={`h-9 rounded-xl px-4 text-xs font-black ${execucao.reposicaoTroca === valor ? "bg-amber-700 text-white" : "border border-amber-200 bg-white text-amber-800"}`}
                  >
                    {valor ? "Sim" : "Não"}
                  </button>
                ))}
              </div>
            </div>

            {execucao.reposicaoTroca === true ? (
              <label className="mt-4 block rounded-xl border border-dashed border-amber-300 bg-white p-4">
                <div className="flex items-center gap-2 text-[11px] font-black text-amber-900"><Camera className="h-4 w-4" /> Fotos para reposição / troca</div>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => setFotos(Array.from(e.target.files || []))}
                  className="mt-3 block w-full text-xs text-slate-500"
                />
                <div className="mt-2 text-[10px] text-slate-400">{fotos.length} arquivo(s) selecionado(s)</div>
              </label>
            ) : null}

            <button
              type="button"
              onClick={solicitarCondenacaoAtual}
              disabled={saving || !execucao.motivoCondenacao.trim() || execucao.reposicaoTroca === null}
              className="mt-4 flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-40"
            >
              <ShieldCheck className="h-4 w-4" /> Enviar condenação para aprovação
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
