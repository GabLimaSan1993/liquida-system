import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  History,
  PackageCheck,
  PackagePlus,
  Search,
  ShieldCheck,
  ShoppingCart,
  Snowflake,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import {
  REPAROS_ELETRICOS_CLIMATIZACAO,
  REPAROS_ESTETICOS_CLIMATIZACAO,
  REPAROS_MECANICOS_CLIMATIZACAO,
} from "../../services/linhaBrancaService.js";
import {
  atualizarNecessidadeCompraStatus,
  consultarPecaPorPn,
  decidirCondenacaoClimatizacao,
  fetchComponentesEmReparo,
  fetchCondenacoesClimatizacaoPendentes,
  fetchHistoricoClimatizacao,
  fetchNecessidadesCompraClimatizacaoPendentes,
  isGerenteLinhaBranca,
  registrarDemandaPeca,
  registrarReparoClimatizacao,
  salvarContextoReposicaoTroca,
  solicitarCondenacaoClimatizacao,
  uploadFotosPecas,
} from "../../services/climatizacaoService.js";

const AREA_CONFIG = {
  "Reparo Mecânico": { titulo: "Mecânico", lista: REPAROS_MECANICOS_CLIMATIZACAO },
  "Reparo Elétrico": { titulo: "Elétrico", lista: REPAROS_ELETRICOS_CLIMATIZACAO },
  "Reparo Estético": { titulo: "Estético", lista: REPAROS_ESTETICOS_CLIMATIZACAO },
};

const AREAS = Object.keys(AREA_CONFIG);
const EMPTY = {
  diagnostico: "",
  observacoes: "",
  servicos: [],
  pecas: [],
  novaPeca: "",
  reposicaoTroca: null,
  destino: "reparado",
  motivoCondenacao: "",
  dt_inicio: "",
};

function Info({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-black text-slate-800">{value || "—"}</div>
    </div>
  );
}

function areasDoComponente(componente) {
  const os = componente?.os;
  const configuradas = (os?.areas_reparo || []).filter((area) => AREAS.includes(area));
  if (configuradas.length) return configuradas;

  const triagem = componente?.__triagem;
  const areas = [];
  if ((triagem?.reparos_mecanicos || []).length) areas.push("Reparo Mecânico");
  if ((triagem?.reparos_eletricos || []).length) areas.push("Reparo Elétrico");
  if ((triagem?.reparos_esteticos || []).length) areas.push("Reparo Estético");
  return areas.length ? areas : ["Reparo Mecânico"];
}

export default function ReparosClimatizacaoV2Page() {
  const { profile } = useAuth();
  const tecnico = profile?.nome || "Operação";

  const [componentes, setComponentes] = useState([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [busca, setBusca] = useState("");
  const [areaAtual, setAreaAtual] = useState("");
  const [form, setForm] = useState({ ...EMPTY, dt_inicio: new Date().toISOString() });
  const [consultaPeca, setConsultaPeca] = useState(null);
  const [fotos, setFotos] = useState([]);
  const [historico, setHistorico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const [ehGerente, setEhGerente] = useState(false);
  const [condenacoes, setCondenacoes] = useState([]);
  const [compras, setCompras] = useState([]);
  const [decisoes, setDecisoes] = useState({});

  const selecionado = useMemo(
    () => componentes.find((item) => String(item.id) === String(selecionadoId)) || null,
    [componentes, selecionadoId]
  );

  const os = selecionado?.os || null;

  const areasPendentes = useMemo(() => {
    if (!selecionado) return [];
    const concluidas = os?.areas_concluidas || [];
    return areasDoComponente(selecionado).filter((area) => !concluidas.includes(area));
  }, [selecionado, os?.areas_concluidas]);

  const configArea = areaAtual ? AREA_CONFIG[areaAtual] : null;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return componentes;
    return componentes.filter((item) =>
      [
        item.os?.numero_os,
        item.os?.serial_number,
        item.os?.marca,
        item.os?.modelo,
        item.tipo_unidade,
      ].some((campo) => String(campo || "").toLowerCase().includes(termo))
    );
  }, [componentes, busca]);

  async function carregar() {
    try {
      setLoading(true);
      setComponentes(await fetchComponentesEmReparo());
    } catch (error) {
      setMensagem(`Erro ao carregar reparos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function carregarGerencia() {
    if (!ehGerente) return;
    try {
      const [condenacoesData, comprasData] = await Promise.all([
        fetchCondenacoesClimatizacaoPendentes(),
        fetchNecessidadesCompraClimatizacaoPendentes(),
      ]);
      setCondenacoes(condenacoesData);
      setCompras(comprasData);
      setDecisoes((atual) => {
        const proximo = { ...atual };
        condenacoesData.forEach((item) => {
          if (!proximo[item.id]) proximo[item.id] = { destino: "Scrap", observacoes: "" };
        });
        return proximo;
      });
    } catch (error) {
      setMensagem(`Erro ao carregar gestão: ${error.message}`);
    }
  }

  useEffect(() => { carregar(); }, []);

  useEffect(() => {
    let cancelado = false;
    async function verificar() {
      if (!profile?.id) return;
      try {
        const resultado = await isGerenteLinhaBranca(profile.id);
        if (!cancelado) setEhGerente(resultado);
      } catch {
        if (!cancelado) setEhGerente(false);
      }
    }
    verificar();
    return () => { cancelado = true; };
  }, [profile?.id]);

  useEffect(() => {
    if (ehGerente) carregarGerencia();
  }, [ehGerente]);

  useEffect(() => {
    let cancelado = false;
    async function buscarHistorico() {
      if (!os?.id) {
        setHistorico(null);
        return;
      }
      try {
        const data = await fetchHistoricoClimatizacao(os.id);
        if (!cancelado) setHistorico(data);
      } catch (error) {
        if (!cancelado) setMensagem(`Erro ao carregar histórico: ${error.message}`);
      }
    }
    buscarHistorico();
    return () => { cancelado = true; };
  }, [os?.id]);

  useEffect(() => {
    const pn = form.novaPeca.trim();
    if (pn.length < 3) {
      setConsultaPeca(null);
      return undefined;
    }

    setConsultaPeca({ status: "buscando" });
    const timer = window.setTimeout(async () => {
      try {
        const peca = await consultarPecaPorPn(pn);
        if (peca && Number(peca.saldo || 0) > 0) setConsultaPeca({ status: "estoque", peca });
        else if (peca) setConsultaPeca({ status: "sem_estoque", peca });
        else setConsultaPeca({ status: "nao_encontrado", peca: null });
      } catch (error) {
        setConsultaPeca({ status: "erro", mensagem: error.message });
      }
    }, 400);

    return () => window.clearTimeout(timer);
  }, [form.novaPeca]);

  function selecionar(item) {
    const pendentes = areasDoComponente(item).filter(
      (area) => !(item.os?.areas_concluidas || []).includes(area)
    );
    setSelecionadoId(String(item.id));
    setAreaAtual(pendentes[0] || "Reparo Mecânico");
    setBusca("");
    setFotos([]);
    setConsultaPeca(null);
    setForm({ ...EMPTY, dt_inicio: new Date().toISOString() });
    setMensagem("");
  }

  function limpar() {
    setSelecionadoId("");
    setAreaAtual("");
    setBusca("");
    setFotos([]);
    setHistorico(null);
    setConsultaPeca(null);
    setForm({ ...EMPTY, dt_inicio: new Date().toISOString() });
  }

  function toggleServico(item) {
    setForm((atual) => ({
      ...atual,
      servicos: atual.servicos.includes(item)
        ? atual.servicos.filter((valor) => valor !== item)
        : [...atual.servicos, item],
    }));
  }

  async function adicionarPeca() {
    if (!os) return;
    const pn = form.novaPeca.trim();
    if (!pn) return;

    try {
      setSaving(true);
      const resultado = await registrarDemandaPeca({
        os,
        pn,
        quantidade: 1,
        usuario: profile,
      });

      const item = {
        pn: pn.toUpperCase(),
        tipo: resultado.tipo,
        descricao: resultado.peca?.descricao || null,
        saldo: resultado.peca?.saldo ?? null,
      };

      setForm((atual) => ({
        ...atual,
        pecas: atual.pecas.some((peca) => peca.pn === item.pn)
          ? atual.pecas
          : [...atual.pecas, item],
        novaPeca: "",
      }));
      setConsultaPeca(null);
      setMensagem(
        resultado.tipo === "estoque"
          ? `PN ${item.pn}: requisição de separação gerada.`
          : `PN ${item.pn}: necessidade de compra enviada ao Marcelo.`
      );
      if (ehGerente) await carregarGerencia();
    } catch (error) {
      setMensagem(`Erro ao registrar peça: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function salvar() {
    if (!selecionado || !areaAtual || !form.diagnostico.trim() || !form.servicos.length) {
      return setMensagem("Informe o diagnóstico e selecione ao menos um serviço executado.");
    }
    if (form.reposicaoTroca === null) {
      return setMensagem("Informe na seção de peças se haverá reposição ou troca.");
    }

    try {
      setSaving(true);

      let fotosPecas = [];
      if (form.reposicaoTroca && fotos.length) {
        fotosPecas = await uploadFotosPecas({
          osId: os.id,
          areaReparo: areaAtual,
          files: fotos,
          userId: profile?.id,
        });
      }

      await salvarContextoReposicaoTroca({
        os,
        areaReparo: areaAtual,
        temReposicaoTroca: form.reposicaoTroca,
        fotos: fotosPecas,
        usuario: profile,
      });

      await registrarReparoClimatizacao(
        selecionado,
        {
          tecnico,
          dt_inicio: form.dt_inicio,
          diagnostico: form.diagnostico,
          servico: form.servicos.join(", "),
          pecas: form.pecas.map((item) => item.pn).join(", "),
          observacoes: form.observacoes,
          destino: form.destino,
        },
        areaAtual
      );

      const numero = os.numero_os;
      const maisAreas = areasPendentes.length > 1 && form.destino !== "venda_no_estado";
      limpar();
      await carregar();
      setMensagem(
        form.destino === "venda_no_estado"
          ? `OS ${numero} segregada para Venda no estado.`
          : maisAreas
            ? `Reparo da OS ${numero} concluído nesta especialidade. Segue para a próxima área.`
            : `Reparo da OS ${numero} concluído. Unidade voltou para Aguardando Kit.`
      );
    } catch (error) {
      setMensagem(`Erro ao salvar reparo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function solicitarCondenacao() {
    if (!selecionado || !form.motivoCondenacao.trim()) {
      return setMensagem("Informe a justificativa técnica da condenação.");
    }

    try {
      setSaving(true);
      const numero = os.numero_os;
      await solicitarCondenacaoClimatizacao(
        selecionado,
        form.motivoCondenacao,
        profile,
        areaAtual || "Reparo"
      );
      limpar();
      await carregar();
      if (ehGerente) await carregarGerencia();
      setMensagem(`Condenação da OS ${numero} enviada para aprovação do Marcelo.`);
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
      await decidirCondenacaoClimatizacao({
        condenacao: item,
        aprovar,
        destino: aprovar ? decisao.destino : null,
        observacoes: decisao.observacoes,
        usuario: profile,
      });
      await Promise.all([carregarGerencia(), carregar()]);
      setMensagem(
        aprovar
          ? `Condenação aprovada: ${decisao.destino}.`
          : "Condenação rejeitada. Unidade devolvida ao reparo."
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
      await carregarGerencia();
    } catch (error) {
      setMensagem(`Erro ao atualizar necessidade de compra: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1700px]">
      <div className="border-b border-slate-200 pb-6">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Linha Branca · Climatização</div>
        <div className="mt-2 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#F3EFF5] text-[#4C1D95]"><Wrench className="h-6 w-6" /></div>
          <div>
            <h1 className="text-3xl font-black tracking-[-0.035em] text-slate-900">Reparos de Climatização</h1>
            <p className="mt-1 text-sm text-slate-500">Escopo técnico por especialidade, peças, reposição/troca e decisão de reparabilidade.</p>
          </div>
        </div>
      </div>

      {mensagem ? (
        <div className="mt-5 flex items-start justify-between rounded-2xl border border-violet-100 bg-violet-50 px-4 py-3 text-sm font-semibold text-violet-800">
          <span>{mensagem}</span><button type="button" onClick={() => setMensagem("")}><X className="h-4 w-4" /></button>
        </div>
      ) : null}

      {ehGerente ? (
        <section className="mt-6 grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black text-amber-900"><ShieldCheck className="h-4 w-4" /> Aprovações de condenação</div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-800">{condenacoes.length}</span>
            </div>
            <div className="mt-4 space-y-3">
              {condenacoes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-amber-200 bg-white/60 p-4 text-xs text-amber-700">Nenhuma condenação de Climatização pendente.</div>
              ) : condenacoes.map((item) => {
                const decisao = decisoes[item.id] || { destino: "Scrap", observacoes: "" };
                return (
                  <div key={item.id} className="rounded-xl border border-amber-200 bg-white p-4">
                    <div className="text-sm font-black text-slate-900">{item.ordens_servico?.numero_os || `OS #${item.os_id}`}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{item.ordens_servico?.marca} {item.ordens_servico?.modelo}</div>
                    <div className="mt-3 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">{item.motivo}</div>
                    <div className="mt-3 grid gap-2 md:grid-cols-[180px_1fr]">
                      <select value={decisao.destino} onChange={(e) => setDecisoes((a) => ({ ...a, [item.id]: { ...decisao, destino: e.target.value } }))} className="h-10 rounded-xl border border-slate-200 px-3 text-xs font-bold">
                        <option value="Scrap">Scrap</option>
                        <option value="Venda no estado">Venda no estado</option>
                        <option value="Desmembramento">Desmembramento</option>
                      </select>
                      <input value={decisao.observacoes} onChange={(e) => setDecisoes((a) => ({ ...a, [item.id]: { ...decisao, observacoes: e.target.value } }))} placeholder="Observação da decisão" className="h-10 rounded-xl border border-slate-200 px-3 text-xs" />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <button type="button" onClick={() => decidir(item, true)} disabled={saving} className="flex h-9 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-[10px] font-black text-white"><CheckCircle2 className="h-4 w-4" />Aprovar e destinar</button>
                      <button type="button" onClick={() => decidir(item, false)} disabled={saving} className="h-9 rounded-lg border border-slate-200 px-3 text-[10px] font-black text-slate-600">Rejeitar</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black text-blue-900"><ShoppingCart className="h-4 w-4" /> Necessidades de compra</div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-blue-800">{compras.length}</span>
            </div>
            <div className="mt-4 space-y-2">
              {compras.length === 0 ? (
                <div className="rounded-xl border border-dashed border-blue-200 bg-white/60 p-4 text-xs text-blue-700">Nenhuma compra de Climatização pendente.</div>
              ) : compras.map((item) => (
                <div key={item.id} className="rounded-xl border border-blue-200 bg-white p-3">
                  <div className="text-xs font-black text-slate-900">{item.pn}</div>
                  <div className="mt-1 text-[10px] text-slate-500">{item.ordens_servico?.numero_os} · {item.ordens_servico?.marca} {item.ordens_servico?.modelo}</div>
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
          <div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">Unidades aguardando reparo</h2><span className="text-[10px] font-black text-slate-400">{loading ? "..." : componentes.length}</span></div>
          <div className="relative mt-4"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OS, modelo ou serial" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm" /></div>
          <select value={selecionadoId} onChange={(e) => { const item = filtrados.find((x) => String(x.id) === e.target.value); if (item) selecionar(item); }} className="mt-3 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700">
            <option value="">Selecione uma unidade</option>
            {filtrados.map((item) => <option key={item.id} value={item.id}>{item.os?.numero_os} — {item.os?.marca} {item.os?.modelo}</option>)}
          </select>

          {selecionado ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <div className="flex items-center gap-3"><Snowflake className="h-6 w-6 text-[#5B35C9]" /><div><div className="text-base font-black text-slate-900">{os?.numero_os}</div><div className="text-[10px] capitalize text-slate-500">{selecionado.tipo_unidade} · {os?.marca} {os?.modelo}</div></div></div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <Info label="Tensão" value={selecionado.tensao || os?.voltagem} />
                <Info label="BTU" value={selecionado.capacidade_btu} />
                <Info label="Gás" value={selecionado.gas_refrigerante} />
                <Info label="Área atual" value={areaAtual} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          {selecionado ? (
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5">
              <div className="flex items-center gap-2 text-sm font-black text-rose-800"><AlertTriangle className="h-4 w-4" /> Origem da falha / Triagem</div>
              <div className="mt-3 text-sm leading-6 text-rose-700">{selecionado.__triagem?.observacoes_triagem || selecionado.observacoes_triagem || "Sem observação de falha registrada."}</div>
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Mecânicos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selecionado.__triagem?.reparos_mecanicos || []).join(", ") || "—"}</div></div>
                <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Elétricos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selecionado.__triagem?.reparos_eletricos || []).join(", ") || "—"}</div></div>
                <div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Estéticos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selecionado.__triagem?.reparos_esteticos || []).join(", ") || "—"}</div></div>
              </div>
            </div>
          ) : null}

          <div className={`rounded-2xl border border-slate-200 bg-white p-5 ${!selecionado ? "pointer-events-none opacity-40" : ""}`}>
            <div className="flex flex-wrap gap-2">
              {areasPendentes.map((area) => <button key={area} type="button" onClick={() => { setAreaAtual(area); setFotos([]); setForm((a) => ({ ...a, servicos: [], reposicaoTroca: null })); }} className={`rounded-xl px-4 py-2 text-xs font-black ${areaAtual === area ? "bg-[#5B35C9] text-white" : "bg-slate-100 text-slate-600"}`}>{area}</button>)}
            </div>

            {configArea ? (
              <div className="mt-5">
                <div className="text-sm font-black text-slate-900">Serviços — {configArea.titulo}</div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {configArea.lista.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-[10px] font-bold ${form.servicos.includes(item) ? "border-violet-300 bg-violet-50 text-violet-800" : "border-slate-200 text-slate-600"}`}><input type="checkbox" checked={form.servicos.includes(item)} onChange={() => toggleServico(item)} />{item}</label>)}
                </div>
              </div>
            ) : null}

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <label><span className="text-[11px] font-black text-slate-600">Diagnóstico final *</span><textarea rows={4} value={form.diagnostico} onChange={(e) => setForm((a) => ({ ...a, diagnostico: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
              <label><span className="text-[11px] font-black text-slate-600">Observações</span><textarea rows={4} value={form.observacoes} onChange={(e) => setForm((a) => ({ ...a, observacoes: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
            </div>

            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center gap-2 text-[11px] font-black text-slate-700"><PackageCheck className="h-4 w-4 text-[#5B35C9]" /> Peças utilizadas — validação por PN</div>
              <div className="mt-2 flex gap-2">
                <input value={form.novaPeca} onChange={(e) => setForm((a) => ({ ...a, novaPeca: e.target.value.toUpperCase() }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarPeca(); } }} placeholder="Digite o PN" className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm" />
                <button type="button" onClick={adicionarPeca} disabled={saving || !form.novaPeca.trim()} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black disabled:opacity-40"><PackagePlus className="h-4 w-4" />Adicionar</button>
              </div>
              {consultaPeca ? <div className="mt-2">
                {consultaPeca.status === "buscando" ? <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">Consultando estoque...</span> : null}
                {consultaPeca.status === "estoque" ? <span className="rounded-full bg-emerald-100 px-3 py-1 text-[10px] font-black text-emerald-700">EM ESTOQUE · saldo {consultaPeca.peca.saldo}</span> : null}
                {["sem_estoque","nao_encontrado"].includes(consultaPeca.status) ? <span className="rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black text-rose-700">SEM DISPONIBILIDADE · gera necessidade de compra</span> : null}
              </div> : null}
              <div className="mt-3 flex flex-wrap gap-2">{form.pecas.map((peca) => <span key={peca.pn} className={`rounded-full px-3 py-1 text-[10px] font-black ${peca.tipo === "estoque" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{peca.pn} · {peca.tipo === "estoque" ? "requisição gerada" : "compra necessária"}</span>)}</div>

              <div className="mt-4 border-t border-slate-200 pt-4">
                <div className="text-[11px] font-black text-slate-700">Haverá reposição ou troca de peça?</div>
                <div className="mt-2 flex gap-2">{[true,false].map((valor) => <button key={String(valor)} type="button" onClick={() => { setForm((a) => ({ ...a, reposicaoTroca: valor })); if (!valor) setFotos([]); }} className={`h-9 rounded-xl px-4 text-xs font-black ${form.reposicaoTroca === valor ? "bg-[#5B35C9] text-white" : "border border-slate-200 bg-white text-slate-600"}`}>{valor ? "Sim" : "Não"}</button>)}</div>
                {form.reposicaoTroca === true ? <label className="mt-3 block rounded-xl border border-dashed border-violet-200 bg-white p-4"><div className="flex items-center gap-2 text-[11px] font-black text-violet-800"><Camera className="h-4 w-4" /> Fotos da peça / evidência</div><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => setFotos(Array.from(e.target.files || []))} className="mt-3 block w-full text-xs text-slate-500" /><div className="mt-2 text-[10px] text-slate-400">{fotos.length} arquivo(s)</div></label> : null}
              </div>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={() => setForm((a) => ({ ...a, destino: "reparado" }))} className={`rounded-xl border px-4 py-3 text-xs font-black ${form.destino === "reparado" ? "border-emerald-400 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-600"}`}>Reparado · voltar para formação de kit</button>
              <button type="button" onClick={() => setForm((a) => ({ ...a, destino: "venda_no_estado" }))} className={`rounded-xl border px-4 py-3 text-xs font-black ${form.destino === "venda_no_estado" ? "border-amber-400 bg-amber-50 text-amber-700" : "border-slate-200 text-slate-600"}`}>Segregar para Venda no estado</button>
            </div>

            <button type="button" onClick={salvar} disabled={saving || !selecionado || !areaAtual || !form.diagnostico.trim() || !form.servicos.length || form.reposicaoTroca === null} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5B35C9] text-xs font-black text-white disabled:bg-slate-300"><Wrench className="h-4 w-4" />Salvar reparo desta área</button>
          </div>

          {historico ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center gap-2 text-sm font-black text-slate-900"><History className="h-4 w-4 text-[#5B35C9]" /> Histórico técnico</div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Triagens</div>{historico.triagens.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.observacoes_triagem || "Triagem registrada"}</div>)}</div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Reparos</div>{historico.reparos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.area_execucao} · {item.servico_executado || item.diagnostico_final}</div>)}</div>
                <div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Peças / compras</div>{historico.requisicoes.slice(-2).map((item) => <div key={`r-${item.id}`} className="mt-2 text-[10px] text-emerald-700">{item.pn} · requisição {item.status}</div>)}{historico.compras.slice(-2).map((item) => <div key={`c-${item.id}`} className="mt-2 text-[10px] text-rose-700">{item.pn} · compra {item.status}</div>)}</div>
              </div>
            </div>
          ) : null}

          <div className={`rounded-2xl border border-amber-200 bg-amber-50 p-5 ${!selecionado ? "pointer-events-none opacity-40" : ""}`}>
            <div className="flex items-center gap-2 text-sm font-black text-amber-900"><ShieldCheck className="h-4 w-4" /> Solicitar condenação</div>
            <p className="mt-1 text-[11px] leading-5 text-amber-700">Sem descarte direto. A decisão vai para o Marcelo, que define Scrap, Venda no estado ou Desmembramento.</p>
            <textarea rows={3} value={form.motivoCondenacao} onChange={(e) => setForm((a) => ({ ...a, motivoCondenacao: e.target.value }))} placeholder="Justificativa técnica obrigatória" className="mt-3 w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm" />
            <button type="button" onClick={solicitarCondenacao} disabled={saving || !form.motivoCondenacao.trim()} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-40"><ShieldCheck className="h-4 w-4" />Enviar condenação para aprovação</button>
          </div>
        </div>
      </section>
    </div>
  );
}
