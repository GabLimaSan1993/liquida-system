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
import { supabase } from "../../lib/supabase.js";
import FotosEsteticasLavadora from "../../components/linha-branca/FotosEsteticasLavadora.jsx";
import { conferirEvidenciasEsteticas } from "../../services/lavadorasPreventivaService.js";
import {
  condenarOs,
  fetchOsAguardandoCmp,
  fetchOsSemEspecialidadeParaReparo,
  fetchOsParaReparo,
  fetchTriagemDaOs,
  osAguardandoCmp,
  osAguardandoPeca,
  salvarExecucaoReparo,
  concluirReparoComPecaFisica,
} from "../../services/reparoLinhaBrancaService.js";
import {
  REPAROS_ELETRICOS_LAVADORAS,
  REPAROS_ESTETICOS_LAVADORAS,
  REPAROS_MECANICOS_LAVADORAS,
} from "../../services/linhaBrancaService.js";
import { fetchHistoricoLavadora } from "../../services/lavadorasTriagemService.js";
import { identificarTipoLavadora } from "../../services/lavadorasConferencia.js";
import {
  carregarPendenciasLavadora,
  diasDeAging,
  pendenciaAberta,
  registrarNecessidadePeca,
  salvarDiagnosticoPendente,
} from "../../services/lavadorasPendenciasService.js";
import { classificarTriagemLavadora, nivelEfetivoLavadora, nivelServicoLavadora, tecnicoHabilitadoLavadora, tecnicoPodeAtuarOsLavadora, VISUAL_NIVEIS_LAVADORAS } from "../../services/reparosLavadorasNiveis.js";

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
  const [pecasResumo, setPecasResumo] = useState({});
  const [busca, setBusca] = useState("");
  const [filtroNivel, setFiltroNivel] = useState("todos");
  const [selectedOsId, setSelectedOsId] = useState("");
  const [areaAtual, setAreaAtual] = useState("");
  const [execucao, setExecucao] = useState({ ...EMPTY, dt_inicio: new Date().toISOString() });
  const [historico, setHistorico] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fotosEsteticasPendentes,setFotosEsteticasPendentes]=useState(false);
  const [mensagem, setMensagem] = useState("");
  const [pendencias, setPendencias] = useState({ diagnosticos: [], requisicoes: [], compras: [], estoque: [] });
  const [pendenciasVersao, setPendenciasVersao] = useState(0);
  const [carregandoPendencias, setCarregandoPendencias] = useState(false);
  const [buscaPeca, setBuscaPeca] = useState("");
  const [pecaSelecionadaId, setPecaSelecionadaId] = useState("");
  const [quantidadePeca, setQuantidadePeca] = useState("1");
  const [defeitoVinculado, setDefeitoVinculado] = useState("");
  const [pecaFisicaConfirmada,setPecaFisicaConfirmada]=useState(false);
  const [origemPecaFisica,setOrigemPecaFisica]=useState("");

  const selectedOs = useMemo(
    () => osList.find((item) => String(item.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  const areasPendentes = useMemo(() => {
    if (!selectedOs) return [];
    const concluidas = selectedOs.areas_concluidas || [];
    const areas = selectedOs.__especialidade_indefinida ? AREAS : (selectedOs.areas_reparo || []);
    return areas.filter((area) => AREAS.includes(area) && !concluidas.includes(area));
  }, [selectedOs]);

  const configArea = areaAtual ? AREA_CONFIG[areaAtual] : null;
  const nivelDaOs = selectedOs ? nivelEfetivoLavadora(selectedOs) : null;
  const nivelDaExecucao = useMemo(() => {
    const maior = execucao.servicos.reduce((max, servico) => {
      const nivel = nivelServicoLavadora(areaAtual, servico);
      return Math.max(max, nivel ? Number(nivel.slice(1)) : 3);
    }, 0);
    const nivelBase = selectedOs?.__especialidade_indefinida ? 1 : Number(nivelDaOs?.slice(1) || 3);
    return "N" + Math.max(nivelBase, maior);
  }, [execucao.servicos, areaAtual, nivelDaOs, selectedOs?.__especialidade_indefinida]);
  const podeExecutar = selectedOs
    ? (selectedOs.__especialidade_indefinida
        ? !selectedOs.retorno_pos_reparo_exclusivo_carlos
        : tecnicoPodeAtuarOsLavadora(profile, selectedOs))
      && tecnicoHabilitadoLavadora(profile, nivelDaExecucao)
    : false;
  const verTodos = profile?.is_master === true;
  const diagnosticoSalvo = pendencias.diagnosticos.find((item) => item.area_reparo === areaAtual);
  const todasNecessidades = useMemo(() => [
    ...pendencias.requisicoes.map((item) => ({ ...item, tipo: "estoque" })),
    ...pendencias.compras.map((item) => ({ ...item, tipo: "compra" })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)), [pendencias.requisicoes, pendencias.compras]);
  const necessidadesAbertas = todasNecessidades.filter((item) =>
    pendenciaAberta(item, item.tipo));
  const pecaSelecionada = pendencias.estoque.find((item) => String(item.id) === String(pecaSelecionadaId));
  const sugestoesPecas = useMemo(() => {
    const termo = buscaPeca.trim().toLocaleLowerCase("pt-BR");
    if (termo.length < 2) return [];
    return pendencias.estoque
      .filter((item) => [item.descricao, item.pn, item.marca].some((campo) =>
        String(campo || "").toLocaleLowerCase("pt-BR").includes(termo)))
      .sort((a, b) => Number(b.marca?.toLowerCase() === selectedOs?.marca?.toLowerCase()) -
        Number(a.marca?.toLowerCase() === selectedOs?.marca?.toLowerCase()))
      .slice(0, 8);
  }, [buscaPeca, pendencias.estoque, selectedOs?.marca]);

  const osFiltradas = useMemo(() => {
    const termo=busca.trim().toLowerCase();
    return osList.filter(os=>(filtroNivel==="todos"||nivelEfetivoLavadora(os)===filtroNivel)
      && (!termo || [os.numero_os,os.serial_number,os.marca,os.modelo,os.fornecedor,os.lote]
       .filter(Boolean).some(c=>String(c).toLowerCase().includes(termo))));
  },[osList,busca,filtroNivel]);

  async function carregarOs() {
    try {
      setLoading(true);
      const resultados = await Promise.all([
        ...AREAS.map((area) => fetchOsParaReparo(area, false)),
        fetchOsAguardandoCmp(),
        fetchOsSemEspecialidadeParaReparo(),
      ]);
      const mapa = new Map();
      resultados.flat().forEach((os) => mapa.set(os.id, os));
      // Somente as OSs da família de lavadoras entram nesta tela.
      const candidatos = [...mapa.values()].filter((os) => {
        const pendente = osAguardandoPeca(os) || osAguardandoCmp(os) ||
          (os.status_atual === "Em reparo" && !(os.areas_reparo || []).length);
        return !pendente || Boolean(identificarTipoLavadora(os.categoria));
      });
      // Busca as triagens em lote (OSs antigas aguardando peça não possuem triagem).
      const { data: triagens, error: triagensError } = candidatos.length
        ? await supabase
            .from("linha_branca_triagens")
            .select("*")
            .in("os_id", candidatos.map(os => os.id))
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (triagensError) throw triagensError;
      const porOs = new Map();
      (triagens || []).forEach((triagem) => {
        if (!porOs.has(String(triagem.os_id))) porOs.set(String(triagem.os_id), triagem);
      });
      const filtradas = candidatos.map((os) => {
        const pendente = osAguardandoPeca(os) || osAguardandoCmp(os) ||
          (os.status_atual === "Em reparo" && !(os.areas_reparo || []).length);
        const semArea = !(os.areas_reparo || []).length;
        const deLavadora = Boolean(identificarTipoLavadora(os.categoria));
        const triagem = porOs.get(String(os.id)) || null;
        if (triagem?.tipo_produto !== "Lavadoras" && !(pendente && deLavadora)) return null;
        return { ...os, __especialidade_indefinida: pendente && semArea, __triagem: triagem };
      });
      const visiveis=filtradas.filter(Boolean).filter(os =>
        verTodos || os.__especialidade_indefinida || tecnicoPodeAtuarOsLavadora(profile, os)
      );
      setOsList(visiveis);
      const grupos=[];
      for(let k=0;k<visiveis.length;k+=200)grupos.push(visiveis.slice(k,k+200).map(os=>Number(os.id)));
      if(grupos.length){
        const responses=await Promise.all(grupos.map(ids=>
          supabase.rpc("linha_branca_reparo_pecas_resumo",{p_os_ids:ids})
        ));
        for(const res of responses)if(res.error)throw new Error("Requisições de peças: "+res.error.message);
        setPecasResumo(Object.assign({},...responses.map(x=>x.data||{})));
      }else setPecasResumo({});
    } catch (error) {
      setMensagem(`Erro ao carregar OS: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarOs();
  }, [profile?.id, profile?.is_master]);

  useEffect(() => {
    let ativo = true;
    if (!selectedOs?.id) {
      setPendencias({ diagnosticos: [], requisicoes: [], compras: [], estoque: [] });
      return undefined;
    }
    setCarregandoPendencias(true);
    carregarPendenciasLavadora(selectedOs.id)
      .then((dados) => { if (ativo) setPendencias(dados); })
      .catch((error) => { if (ativo) setMensagem("Erro ao consultar peças e diagnósticos: " + error.message); })
      .finally(() => { if (ativo) setCarregandoPendencias(false); });
    return () => { ativo = false; };
  }, [selectedOs?.id, pendenciasVersao]);

  useEffect(() => {
    const registro = pendencias.diagnosticos.find((item) => item.area_reparo === areaAtual);
    setExecucao((atual) => ({
      ...atual,
      diagnostico_final: registro?.diagnostico || "",
      observacoes: registro?.observacoes || "",
      servicos: registro?.servicos || [],
    }));
  }, [selectedOs?.id, areaAtual, pendencias.diagnosticos]);

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
    const areas = os.__especialidade_indefinida ? AREAS : (os.areas_reparo || []);
    const pendentes = areas.filter((area) => AREAS.includes(area) && !concluidas.includes(area));
    setPendencias({ diagnosticos: [], requisicoes: [], compras: [], estoque: [] });
    setBuscaPeca("");
    setPecaSelecionadaId("");
    setQuantidadePeca("1");
    setDefeitoVinculado("");
    setPecaFisicaConfirmada(false);
    setOrigemPecaFisica("");
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
    setPendencias({ diagnosticos: [], requisicoes: [], compras: [], estoque: [] });
    setBuscaPeca("");
    setPecaSelecionadaId("");
    setQuantidadePeca("1");
    setDefeitoVinculado("");
    setPecaFisicaConfirmada(false);
    setOrigemPecaFisica("");
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

  async function salvarDiagnostico() {
    if (!selectedOs || !areaAtual || !(execucao.diagnostico_final.trim() || execucao.servicos.length)) {
      return setMensagem("Selecione uma especialidade e registre o defeito encontrado.");
    }
    try {
      setSaving(true);
      const registro = await salvarDiagnosticoPendente(selectedOs, areaAtual, execucao, profile);
      setPendencias((atual) => ({
        ...atual,
        diagnosticos: [...atual.diagnosticos.filter((d) => d.area_reparo !== areaAtual), registro],
      }));
      setMensagem(`Diagnóstico da OS ${selectedOs.numero_os} salvo sem concluir o reparo. O equipamento permanece na etapa atual.`);
    } catch (error) {
      setMensagem("Erro ao salvar diagnóstico: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function requisitarPeca() {
    if (!selectedOs || !areaAtual || !(execucao.diagnostico_final.trim() || execucao.servicos.length)) {
      return setMensagem("Registre o diagnóstico para vincular a necessidade de peça.");
    }
    if (!buscaPeca.trim() || !Number.isFinite(Number(quantidadePeca)) || Number(quantidadePeca) <= 0) {
      return setMensagem("Informe a peça necessária e a quantidade.");
    }
    try {
      setSaving(true);
      const diagnostico = await salvarDiagnosticoPendente(selectedOs, areaAtual, execucao, profile);
      const resultado = await registrarNecessidadePeca({
        os: selectedOs,
        diagnostico,
        descricao: buscaPeca,
        estoqueId: pecaSelecionadaId,
        quantidade: quantidadePeca,
        defeito: defeitoVinculado || (execucao.servicos.length === 1 ? execucao.servicos[0] : ""),
        profile,
        estoque: pendencias.estoque,
      });
      setBuscaPeca("");
      setPecaSelecionadaId("");
      setQuantidadePeca("1");
      setDefeitoVinculado("");
      setPendenciasVersao((v) => v + 1);
      await carregarOs();
      setMensagem(resultado.destino === "requisicao"
        ? `Requisição de estoque #${resultado.registro.id} criada para a OS ${selectedOs.numero_os}. Sem conclusão de reparo.`
        : `Necessidade de compra #${resultado.registro.id} registrada para a OS ${selectedOs.numero_os}. Aging iniciado e reparo pendente.`);
      if (resultado.aviso) setMensagem((msg) => msg + " Atenção ao status da OS: " + resultado.aviso);
    } catch (error) {
      setMensagem("Erro ao registrar necessidade: " + error.message);
    } finally {
      setSaving(false);
    }
  }

  async function salvar() {
    if (!selectedOs || !areaAtual || !execucao.diagnostico_final.trim() || !execucao.servicos.length) {
      return setMensagem("Informe o diagnóstico e selecione ao menos um serviço executado.");
    }
    if (necessidadesAbertas.length) {
      if (!pecaFisicaConfirmada || origemPecaFisica.trim().length < 8 || !execucao.pecas.length)
        return setMensagem("Com compras/requisições abertas, só conclua se a peça estiver realmente instalada: identifique a peça, confirme fisicamente e informe de onde veio.");
      if (!window.confirm("Confirma que TODAS as peças pendentes foram FISICAMENTE INSTALADAS nesta lavadora? A OS avançará para a próxima etapa; a compra/requisição continuará aberta para conciliação administrativa."))
        return;
    }
    if (!podeExecutar) return setMensagem(selectedOs?.retorno_pos_reparo_exclusivo_carlos ? "Retorno reprovado na bancada: somente Carlos Dias pode refazer este reparo." : "Nível N3 disponível para Carlos Dias e Alexandre Gabriel; N1/N2 também para Kauã. Retorno reprovado na bancada segue exclusivo de Carlos Dias.");
    if(areaAtual==="Reparo Estético"){
      try{
        const fotos=await conferirEvidenciasEsteticas(selectedOs.id);
        if(fotos.pendentes.length)return setMensagem("Fotos obrigatórias DEPOIS pendentes: "+fotos.pendentes.join(", "));
      }catch(error){return setMensagem("Não foi possível conferir as evidências: "+error.message)}
    }
    try {
      setSaving(true);
      const numeroOs = selectedOs.numero_os;
      const haviaMaisAreas = !selectedOs.__especialidade_indefinida && areasPendentes.length > 1;
      const conciliacao=necessidadesAbertas.length
        ? await concluirReparoComPecaFisica(selectedOs,execucao,areaAtual,origemPecaFisica.trim())
        : await salvarExecucaoReparo(selectedOs, {
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
      setMensagem((haviaMaisAreas
        ? `Reparo da OS ${numeroOs} concluído nesta especialidade. A OS segue para a próxima área.`
        : `Reparo da OS ${numeroOs} concluído. Equipamento encaminhado para Bancada Pós-Reparo.`) +
        (conciliacao?.compras_pendentes_para_conciliar || conciliacao?.requisicoes_pendentes_para_conciliar
          ? " Conferência física registrada com usuário e data. A compra/requisição NÃO foi baixada: conferir a origem e regularizar o estoque/compras."
          : ""));
    } catch (error) {
      setMensagem(`Erro ao salvar reparo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function condenar() {
    if (!selectedOs) return;
    if (!tecnicoPodeAtuarOsLavadora(profile,selectedOs)) return setMensagem("Esta OS retornou da bancada e está exclusiva para Carlos Dias.");
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
        <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><h2 className="text-sm font-black text-slate-900">OS aguardando reparo</h2><span className="text-[10px] font-black text-slate-400">{loading ? "..." : osList.length}</span></div><div className="relative mt-4"><Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OS, modelo ou serial" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none" /></div><div className="mt-3 grid grid-cols-4 gap-1.5" role="group" aria-label="Filtrar por nível">
           {[["todos","Todos"],["N1","N1"],["N2","N2"],["N3","N3"]].map(([valor,rotulo]) => <button key={valor} type="button" onClick={()=>setFiltroNivel(valor)}
             aria-pressed={filtroNivel===valor} className={`rounded-lg border px-2 py-2 text-xs font-bold ${filtroNivel===valor?"border-violet-500 bg-violet-100 text-violet-800":"border-slate-200 bg-white text-slate-600"}`}>{rotulo}</button>)}
          </div>
          <div className="mt-3 max-h-[460px] space-y-2 overflow-y-auto pr-1" aria-label="Fila de OSs para reparo">
            {osFiltradas.map(os=>{
              const nivel=nivelEfetivoLavadora(os), estilo=VISUAL_NIVEIS_LAVADORAS[nivel];
              const pendente=classificarTriagemLavadora(os.__triagem).pendente;
              const retrabalhoCarlos=os.retorno_pos_reparo_exclusivo_carlos===true;
              const req=pecasResumo[String(os.id)]||{};
              const abertas=Number(req.abertas||0);
              return <button type="button" key={os.id} onClick={()=>selecionarOs(os)}
                className={`w-full rounded-xl border p-3 text-left transition-colors ${estilo.card} ${String(os.id)===selectedOsId?"ring-2 ring-violet-500":""}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${estilo.bolinha}`} aria-label={`Nível ${nivel}`}/>
                  <span className="text-sm font-bold text-slate-900">OS {os.numero_os}</span>
                  <span className={`ml-auto rounded-md px-2 py-0.5 text-[10px] font-black ${estilo.selo}`}>{pendente?"A avaliar / N3":nivel}</span>
                </div>
                <div className="mt-1 pl-4 text-xs text-slate-600">{os.marca||"—"} {os.modelo||""}</div>
                {os.tecnico_responsavel&&<div className="mt-1 pl-4 text-[10px] font-semibold text-slate-600">Responsável: {os.tecnico_responsavel}</div>}
                {abertas>0&&<div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] font-bold text-amber-900">
                  <span>Peça necessária · {abertas} requisição(ões) · maior aging: {req.aging_max_dias??"—"} dias</span>
                  <span className="mt-0.5 block font-medium">{(req.pecas||[]).map(p=>p.nome).join(", ")}</span>
                </div>}
                {retrabalhoCarlos&&<div className="mt-1.5 pl-4 text-[10px] font-bold text-rose-800">Retorno da bancada · exclusivo Carlos</div>}
                <div className="mt-1 pl-4 text-[10px] text-slate-500">{os.__especialidade_indefinida ? "Definir especialidade do reparo" : (os.areas_reparo||[]).join(" • ")}</div>
              </button>;
            })}
            {!osFiltradas.length && <p className="rounded-lg bg-slate-50 px-3 py-5 text-center text-xs text-slate-500">Nenhuma OS disponível para este nível e usuário.</p>}
          </div>
          {selectedOs ? <><div className="mt-4 rounded-xl bg-slate-50 p-4"><div className="flex items-center gap-3"><WashingMachine className="h-6 w-6 text-[#5B35C9]" /><div><div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${VISUAL_NIVEIS_LAVADORAS[nivelDaOs].bolinha}`}/><span className="text-base font-black text-slate-900">{selectedOs.numero_os}</span><span className={`rounded px-2 py-0.5 text-xs font-black ${VISUAL_NIVEIS_LAVADORAS[nivelDaOs].selo}`}>{nivelDaOs}</span>{selectedOs.retorno_pos_reparo_exclusivo_carlos&&<span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">Retrabalho · Carlos</span>}</div><div className="text-[10px] text-slate-500">{selectedOs.marca} {selectedOs.modelo}</div></div></div><div className="mt-4 grid grid-cols-2 gap-3"><Info label="Tensão" value={selectedOs.voltagem} /><Info label="Serial" value={selectedOs.serial_number} /><Info label="Status" value={selectedOs.status_atual} /><Info label="Área atual" value={selectedOs.__especialidade_indefinida ? "Especialidade a definir" : selectedOs.area_destino} /></div></div><button type="button" onClick={limpar} className="mt-3 text-[10px] font-black text-slate-500">Trocar OS</button></> : null}
        </div>

        <div className="space-y-5">
          {selectedOs&&Number(pecasResumo[String(selectedOs.id)]?.abertas||0)>0&&
            <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-950">
              <p className="font-black">Peças necessárias — requisições em aberto</p>
              {(pecasResumo[String(selectedOs.id)]?.pecas||[]).map((p,i)=>
                <p key={i} className="mt-1">
                  {p.nome} · Requisição original: {p.data_original?.split("-").reverse().join("/")||new Date(p.aberta_em).toLocaleDateString("pt-BR")} · <strong>{p.aging_dias} dias de aging</strong>
                </p>)}
              <p className="mt-2 text-[11px]">Responsável pela OS: {selectedOs.tecnico_responsavel||"Não atribuído"}. O registro da requisição não comprova entrega da peça.</p>
            </div>}
          {selectedOs ? <div className="rounded-2xl border border-rose-100 bg-rose-50 p-5"><div className="flex items-center gap-2 text-sm font-black text-rose-800"><AlertTriangle className="h-4 w-4" /> Origem da falha / Triagem</div><div className="mt-3 text-sm leading-6 text-rose-700">{selectedOs.__triagem?.observacoes_triagem || "Sem triagem cadastrada para esta OS. O defeito pode ser registrado diretamente na bancada, sem avançar a OS."}</div><div className="mt-4 grid gap-2 md:grid-cols-3"><div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Mecânicos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_mecanicos || []).join(", ") || "—"}</div></div><div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Elétricos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_eletricos || []).join(", ") || "—"}</div></div><div className="rounded-xl bg-white p-3"><div className="text-[10px] font-black text-slate-500">Estéticos solicitados</div><div className="mt-2 text-[10px] text-slate-600">{(selectedOs.__triagem?.reparos_esteticos || []).join(", ") || "—"}</div></div></div></div> : null}

          <div className={`rounded-2xl border p-5 ${selectedOs ? VISUAL_NIVEIS_LAVADORAS[nivelDaOs].card : "border-slate-200 bg-white opacity-40 pointer-events-none"}`}>
            {selectedOs && <p className="mb-3 text-xs font-bold text-slate-700">Complexidade: {nivelDaExecucao} · {selectedOs.retorno_pos_reparo_exclusivo_carlos ? "Reprovado no pós-reparo: revisão exclusiva de Carlos Dias" : podeExecutar ? "Técnico habilitado" : "Execução restrita ao técnico habilitado."}</p>}
            {selectedOs?.__especialidade_indefinida && <p className="mb-3 text-xs font-bold text-amber-800">OS sem triagem cadastrada: selecione a especialidade, salve o diagnóstico e registre as peças necessárias. Não é preciso concluir o serviço.</p>}
             <div className="flex flex-wrap gap-2">{areasPendentes.map((area) => <button key={area} type="button" onClick={() => { setAreaAtual(area); setDefeitoVinculado(""); setExecucao((a) => ({ ...a, servicos: [] })); }} className={`rounded-xl px-4 py-2 text-xs font-black ${areaAtual === area ? "bg-[#5B35C9] text-white" : "bg-slate-100 text-slate-600"}`}>{area}</button>)}</div>{configArea ? <div className="mt-5"><div className="text-sm font-black text-slate-900">Serviços — {configArea.titulo}</div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{configArea.lista.map((item) => <label key={item} className={`flex cursor-pointer items-center gap-2 rounded-xl border p-3 text-[10px] font-bold ${VISUAL_NIVEIS_LAVADORAS[nivelServicoLavadora(areaAtual,item)]?.card || "border-slate-200 bg-slate-50"}`}>
              <input type="checkbox" checked={execucao.servicos.includes(item)} onChange={() => toggleServico(item)} />
              <span className="flex-1">{item}</span><span className="font-black">{nivelServicoLavadora(areaAtual,item)||"A avaliar"}</span>
            </label>)}</div></div> : null}
            {selectedOs && areaAtual==="Reparo Estético" && <div className="mt-4">
               <FotosEsteticasLavadora key={selectedOs.id} osId={selectedOs.id} onEstado={setFotosEsteticasPendentes}/>
             </div>}
             <div className="mt-5 grid gap-4 lg:grid-cols-2"><label><span className="text-[11px] font-black text-slate-600">Diagnóstico / defeito encontrado (ou selecione o serviço)</span><textarea rows={4} value={execucao.diagnostico_final} onChange={(e) => setExecucao((a) => ({ ...a, diagnostico_final: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label><label><span className="text-[11px] font-black text-slate-600">Observações</span><textarea rows={4} value={execucao.observacoes} onChange={(e) => setExecucao((a) => ({ ...a, observacoes: e.target.value }))} className="mt-1.5 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label></div>
            <section className="mt-5 rounded-xl border border-violet-200 bg-white/80 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><h3 className="text-sm font-black text-slate-900">Diagnóstico e peças necessárias</h3>
                    <p className="mt-1 text-xs text-slate-500">Salve mesmo sem possuir a peça. Este registro não conclui o reparo nem baixa o estoque.</p></div>
                  {diagnosticoSalvo && <span className="rounded-lg bg-emerald-100 px-2 py-1 text-xs font-bold text-emerald-800">Diagnóstico salvo</span>}
                </div>
                <button type="button" onClick={salvarDiagnostico}
                  disabled={saving || carregandoPendencias || !(execucao.diagnostico_final.trim() || execucao.servicos.length) || !areaAtual}
                  className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg bg-violet-700 px-4 text-xs font-black text-white disabled:opacity-40">
                  <Save className="h-4 w-4" /> Salvar diagnóstico sem concluir
                </button>
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-black text-slate-900">Requisição de peças / necessidade de compra</h4>
                  <p className="mt-1 text-xs text-slate-500">Consulte por nome ou PN. Se não houver saldo disponível, será aberta uma necessidade de compra vinculada ao defeito.</p>
                  <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_110px]">
                    <label className="text-xs font-bold text-slate-600">Peça necessária
                      <input value={buscaPeca} onChange={(e) => { setBuscaPeca(e.target.value); setPecaSelecionadaId(""); }}
                        placeholder="Ex.: tambor, placa ou código PN" className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" />
                    </label>
                    <label className="text-xs font-bold text-slate-600">Quantidade
                      <input type="number" min="0.001" step="0.001" value={quantidadePeca}
                        onChange={(e) => setQuantidadePeca(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" />
                    </label>
                  </div>
                  {sugestoesPecas.length > 0 && !pecaSelecionada && <div className="mt-2 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                    {sugestoesPecas.map((peca) => <button key={peca.id} type="button"
                      onClick={() => { setPecaSelecionadaId(String(peca.id)); setBuscaPeca(peca.descricao || peca.pn); }}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-violet-50">
                      <span><b>{peca.descricao || peca.pn}</b> · {peca.pn} {peca.marca ? "· " + peca.marca : ""}</span>
                      <span className={peca.disponivel > 0 ? "font-bold text-emerald-700" : "font-bold text-amber-700"}>
                        Disponível: {peca.disponivel}
                      </span>
                    </button>)}
                  </div>}
                  {pecaSelecionada && <p className="mt-2 rounded-lg bg-slate-100 p-2 text-xs text-slate-700">
                    <b>Peça cadastrada:</b> {pecaSelecionada.pn} · Saldo físico: {pecaSelecionada.saldo} · Disponível após requisições: {pecaSelecionada.disponivel}
                    {Number(quantidadePeca) > pecaSelecionada.disponivel ? " · Sem quantidade suficiente: compra necessária" : " · Requisição de estoque"}
                  </p>}
                  <label className="mt-3 block text-xs font-bold text-slate-600">Defeito / serviço relacionado à peça
                    <select value={defeitoVinculado} onChange={(e) => setDefeitoVinculado(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm">
                      <option value="">Diagnóstico geral{execucao.servicos.length === 1 ? " (serviço selecionado automaticamente)" : ""}</option>
                      {execucao.servicos.map((servico) => <option key={servico} value={servico}>{servico}</option>)}
                    </select>
                  </label>
                  <button type="button" onClick={requisitarPeca}
                    disabled={saving || carregandoPendencias || !(execucao.diagnostico_final.trim() || execucao.servicos.length) || !buscaPeca.trim() || Number(quantidadePeca) <= 0}
                    className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-lg border border-amber-400 bg-amber-50 px-4 text-xs font-black text-amber-900 disabled:opacity-40">
                    <PackagePlus className="h-4 w-4" /> Registrar necessidade de peça
                  </button>
                </div>
                <div className="mt-5 border-t border-slate-200 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="text-xs font-black text-slate-900">Requisições vinculadas à OS</h4>
                    <span className="text-xs font-bold text-amber-800">{necessidadesAbertas.length} em aberto{necessidadesAbertas.length ? " · Maior aging: " + Math.max(...necessidadesAbertas.map((p) => diasDeAging(p.created_at))) + " dias" : ""}</span>
                  </div>
                  {carregandoPendencias ? <p className="mt-2 text-xs text-slate-500">Consultando necessidades...</p>
                    : todasNecessidades.length === 0 ? <p className="mt-2 text-xs text-slate-500">Nenhuma peça requisitada nesta OS.</p>
                    : <div className="mt-2 space-y-2">{todasNecessidades.map((item) => <div key={item.tipo + item.id}
                      className="flex flex-wrap justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <div><p className="font-bold text-slate-900">{item.tipo === "compra" ? "Compra" : "Estoque"} #{item.id} · {item.descricao || item.pn}</p>
                        <p className="mt-1 text-slate-600">Qtd. {item.quantidade} · {item.defeito_referente || "Diagnóstico geral"} · {item.status.replaceAll("_", " ")}</p></div>
                      <div className="font-bold text-slate-700">{pendenciaAberta(item, item.tipo) ? "Aging: " + diasDeAging(item.created_at) + " dias" : "Encerrada"}</div>
                    </div>)}</div>}
                </div>
              </section>
              <div className="mt-4"><div className="text-[11px] font-black text-slate-600">Peças efetivamente utilizadas na execução</div><div className="mt-2 flex gap-2"><input value={execucao.novaPeca} onChange={(e) => setExecucao((a) => ({ ...a, novaPeca: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); adicionarPeca(); } }} placeholder="Digite a peça" className="h-10 flex-1 rounded-xl border border-slate-200 px-3 text-sm" /><button type="button" onClick={adicionarPeca} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 px-3 text-xs font-black"><PackagePlus className="h-4 w-4" /> Adicionar</button></div><div className="mt-2 flex flex-wrap gap-2">{execucao.pecas.map((peca, index) => <span key={`${peca}-${index}`} className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-600">{peca}</span>)}</div></div>
            {necessidadesAbertas.length>0&&
              <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                <div className="flex items-center gap-2 text-xs font-black text-amber-950"><AlertTriangle className="h-4 w-4"/> Compra/requisição em aberto</div>
                <p className="mt-2 text-xs leading-relaxed text-amber-900">
                  A pendência administrativa NÃO significa que a peça esteja fisicamente ausente.
                  Se o componente foi realmente instalado, é possível concluir o serviço após uma confirmação rastreável.
                  A compra continuará aberta para conciliação, sem registrar recebimento ou alterar estoque automaticamente.
                </p>
                <label className="mt-3 flex items-start gap-2 text-xs font-bold text-amber-950">
                  <input type="checkbox" className="mt-0.5" checked={pecaFisicaConfirmada}
                    onChange={e=>setPecaFisicaConfirmada(e.target.checked)} disabled={saving} />
                  Confirmo que TODAS as peças pendentes listadas acima foram fisicamente instaladas na lavadora.
                </label>
                <label className="mt-3 block text-xs font-bold text-amber-950">
                  Origem física da peça / justificativa (obrigatório)
                  <textarea rows={2} value={origemPecaFisica} disabled={saving}
                    onChange={e=>setOrigemPecaFisica(e.target.value)}
                    placeholder="Ex.: peça entregue diretamente pela equipe de compras, documento a conciliar"
                    className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-slate-900" />
                </label>
                <p className="mt-2 text-[11px] text-amber-900">
                  Informe em “Peças efetivamente utilizadas” o PN ou a descrição de cada peça pendente.
                  O sistema registrará a conferência física e manterá o aging administrativo separado.
                </p>
              </div>}
            <button type="button" onClick={salvar}
              disabled={saving || !selectedOs || !podeExecutar ||
                (necessidadesAbertas.length>0 && (!pecaFisicaConfirmada || origemPecaFisica.trim().length<8 || !execucao.pecas.length)) ||
                (areaAtual==="Reparo Estético" && fotosEsteticasPendentes) ||
                !areaAtual || !execucao.diagnostico_final.trim() || !execucao.servicos.length}
              className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#5B35C9] px-3 py-2 text-xs font-black text-white disabled:bg-slate-300">
              <Check className="h-4 w-4" /> {necessidadesAbertas.length>0
                ? "Concluir reparo com peça física confirmada"
                : "Concluir reparo executado desta área"}
            </button>
          </div>

          {historico ? <div className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center gap-2 text-sm font-black text-slate-900"><History className="h-4 w-4 text-[#5B35C9]" /> Histórico técnico</div><div className="mt-4 grid gap-3 md:grid-cols-4"><div className="rounded-xl bg-violet-50 p-3"><div className="text-[10px] font-black text-violet-500">Retornos de loja</div>{historico.retornos.map((item) => <div key={item.id} className="mt-2 text-[10px] text-violet-700">Retorno #{item.numero_retorno} · {item.motivo} · {item.status}</div>)}</div><div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Ciclos</div>{historico.ciclos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.etapa_teste} · ciclo {item.numero_ciclo} · {item.status}</div>)}</div><div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Reparos anteriores</div>{historico.reparos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.area_execucao} · {item.servico_executado || item.diagnostico_final}</div>)}</div><div className="rounded-xl bg-slate-50 p-3"><div className="text-[10px] font-black text-slate-400">Laudos</div>{historico.laudos.slice(-4).map((item) => <div key={item.id} className="mt-2 text-[10px] text-slate-600">{item.titulo}</div>)}</div></div></div> : null}

          <div className={`rounded-2xl border border-rose-100 bg-rose-50 p-5 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}><div className="flex items-center gap-2 text-sm font-black text-rose-800"><Trash2 className="h-4 w-4" /> Condenação / Scrap</div><p className="mt-1 text-[11px] text-rose-600">Use quando o reparo não for tecnicamente ou economicamente viável.</p><textarea rows={3} value={execucao.motivoCondenacao} onChange={(e) => setExecucao((a) => ({ ...a, motivoCondenacao: e.target.value }))} placeholder="Justificativa obrigatória da condenação" className="mt-3 w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm" /><button type="button" onClick={condenar} disabled={saving || !tecnicoPodeAtuarOsLavadora(profile,selectedOs) || !execucao.motivoCondenacao.trim()} className="mt-3 flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-40"><Trash2 className="h-4 w-4" /> Condenar e enviar para Scrap</button></div>
        </div>
      </section>
    </div>
  );
}
