import { supabase } from "../lib/supabase.js";
import {
  atualizarNecessidadeCompraStatus,
  consultarPecaPorPn,
  isGerenteLinhaBranca,
  registrarDemandaPeca,
  salvarContextoReposicaoTroca,
  uploadFotosPecas,
} from "./refrigeracaoService.js";

export {
  atualizarNecessidadeCompraStatus,
  consultarPecaPorPn,
  isGerenteLinhaBranca,
  registrarDemandaPeca,
  salvarContextoReposicaoTroca,
  uploadFotosPecas,
};

export const CHECKLIST_CLIMATIZACAO = [
  "Motoventilador",
  "Serpentina",
  "Placa",
  "Compressor",
  "Interface",
  "Carcaça",
  "Conexão",
];

export const CHECKLIST_OPERACAO_CLIMATIZACAO = [
  "Tubulações e conexões",
  "Vácuo do sistema",
  "Pressão de trabalho",
  "Drenagem",
  "Corrente elétrica",
  "Temperatura de insuflamento",
  "Comunicação condensadora/evaporadora",
  "Ruído e vibração",
];

const MAPA_AREA_REPARO = {
  Motoventilador: "Reparo Mecânico",
  Serpentina: "Reparo Mecânico",
  Placa: "Reparo Elétrico",
  Compressor: "Reparo Mecânico",
  Interface: "Reparo Elétrico",
  Carcaça: "Reparo Estético",
  Conexão: "Reparo Mecânico",
};

function categoriaClimatizacao(categoria) {
  return String(categoria || "").toLowerCase().startsWith("ar-condicionado");
}

function areasPorChecklist(checklist = {}, energiza = true) {
  const areas = new Set();
  Object.entries(checklist).forEach(([item, valor]) => {
    if (valor === "ruim" && MAPA_AREA_REPARO[item]) {
      areas.add(MAPA_AREA_REPARO[item]);
    }
  });

  if (!energiza && areas.size === 0) {
    areas.add("Reparo Elétrico");
  }

  return [...areas];
}

function reparosPorArea(checklist = {}, area) {
  return Object.entries(checklist)
    .filter(([item, valor]) => valor === "ruim" && MAPA_AREA_REPARO[item] === area)
    .map(([item]) => item.toUpperCase());
}

function tipoPelaCategoria(categoria) {
  const valor = String(categoria || "").toLowerCase();
  if (valor.includes("condensadora")) return "condensadora";
  if (valor.includes("evaporadora")) return "evaporadora";
  return "";
}

export function inferirTipoUnidadeClimatizacao(os) {
  return tipoPelaCategoria(os?.categoria);
}

export async function fetchOsClimatizacaoAguardandoTriagem() {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .eq("linha_produto", "Linha Branca")
    .ilike("categoria", "Ar-condicionado%")
    .in("status_atual", ["Recebido", "Aguardando triagem", "Em triagem"])
    .order("dt_entrada", { ascending: true });

  if (error) throw error;
  return data || [];
}

async function criarSolicitacaoCondenacao({
  os,
  motivo,
  areaRetorno,
  usuarioId,
  usuarioNome,
}) {
  const { data: existente, error: existenteError } = await supabase
    .from("linha_branca_condenacoes")
    .select("*")
    .eq("os_id", os.id)
    .eq("status", "aguardando_aprovacao")
    .limit(1)
    .maybeSingle();

  if (existenteError) throw existenteError;
  if (existente) return existente;

  const { data, error } = await supabase
    .from("linha_branca_condenacoes")
    .insert({
      os_id: os.id,
      categoria: os.categoria || "Ar-condicionado",
      motivo: String(motivo || "").trim() || "Condenação técnica solicitada.",
      area_retorno: areaRetorno || "Reparo",
      status: "aguardando_aprovacao",
      solicitado_por: usuarioId || null,
      solicitado_por_nome: usuarioNome || null,
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function salvarTriagemClimatizacao(os, payload) {
  if (!os?.id || !categoriaClimatizacao(os.categoria)) {
    throw new Error("A OS selecionada não pertence à Climatização.");
  }

  if (!payload.tipo_unidade) throw new Error("Informe se a unidade é condensadora ou evaporadora.");
  if (!payload.modelo_validado) throw new Error("Confirme o modelo antes de concluir a triagem.");
  if (!String(payload.tensao || "").trim()) throw new Error("Informe e valide a tensão da unidade.");

  const tensaoSistema = String(os.voltagem || "").trim().toLowerCase();
  const tensaoFisica = String(payload.tensao || "").trim().toLowerCase();
  if (tensaoSistema && tensaoSistema !== tensaoFisica) {
    throw new Error("A tensão física está divergente da tensão cadastrada na OS.");
  }

  const areasReparo = areasPorChecklist(payload.checklist, payload.energiza);
  const possuiFalha = Object.values(payload.checklist || {}).some((valor) => valor === "ruim");

  if (payload.resultado === "aprovado" && (!payload.energiza || possuiFalha)) {
    throw new Error("Uma unidade com falha ou que não energiza não pode ser aprovada para formação de kit.");
  }

  const resultado = payload.resultado === "scrap" ? "condenacao" : payload.resultado;
  const statusComponente = {
    aprovado: "aguardando_kit",
    reparo: "em_reparo",
    venda_no_estado: "venda_no_estado",
    condenacao: "aguardando_condenacao",
  }[resultado];

  if (!statusComponente) throw new Error("Resultado de triagem inválido.");

  const componentePayload = {
    os_id: os.id,
    tipo_unidade: payload.tipo_unidade,
    capacidade_btu: payload.capacidade_btu || null,
    tensao: payload.tensao || os.voltagem || null,
    gas_refrigerante: payload.gas_refrigerante || null,
    energiza: payload.energiza,
    checklist: {
      ...payload.checklist,
      faltando_pecas: Boolean(payload.faltando_pecas),
      oxidacao: Boolean(payload.oxidacao),
      pecas_quebradas: Boolean(payload.pecas_quebradas),
      modelo_validado: Boolean(payload.modelo_validado),
    },
    resultado_triagem: resultado,
    status: statusComponente,
    observacoes_triagem: payload.observacoes || null,
    triado_por: payload.triado_por || null,
    triado_em: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: componente, error: componenteError } = await supabase
    .from("climatizacao_componentes")
    .upsert(componentePayload, { onConflict: "os_id" })
    .select("*")
    .single();

  if (componenteError) throw componenteError;

  let areas = areasReparo;
  if (resultado === "reparo" && !areas.length) {
    areas = payload.energiza === false ? ["Reparo Elétrico"] : ["Reparo Mecânico"];
  }

  const observacoesTriagem = [
    `Tipo: ${payload.tipo_unidade}`,
    `Energização: ${payload.energiza ? "Liga" : "Não liga"}`,
    `Destino: ${resultado}`,
    payload.observacoes ? `Observações: ${payload.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: historicoError } = await supabase
    .from("linha_branca_triagens")
    .insert({
      os_id: os.id,
      tipo_produto: "Ar-condicionado",
      precisa_reparo: resultado === "reparo",
      reparos_mecanicos: reparosPorArea(payload.checklist, "Reparo Mecânico"),
      reparos_eletricos: reparosPorArea(payload.checklist, "Reparo Elétrico"),
      reparos_esteticos: reparosPorArea(payload.checklist, "Reparo Estético"),
      observacoes_triagem: observacoesTriagem,
      triado_por: payload.triado_por || null,
    });

  if (historicoError) throw historicoError;

  let osUpdate;
  if (resultado === "aprovado") {
    osUpdate = {
      status_atual: "Triado - aguardando kit",
      etapa_atual: "Aguardando kit",
      area_destino: "Aguardando kit",
      areas_reparo: [],
      areas_concluidas: [],
    };
  } else if (resultado === "reparo") {
    osUpdate = {
      status_atual: "Triado",
      etapa_atual: areas[0],
      area_destino: areas[0],
      areas_reparo: areas,
      areas_concluidas: [],
    };
  } else if (resultado === "venda_no_estado") {
    osUpdate = {
      status_atual: "Venda no estado",
      etapa_atual: "Venda no estado",
      area_destino: "Venda no estado",
      areas_reparo: [],
      areas_concluidas: [],
    };
  } else {
    osUpdate = {
      status_atual: "Em reparo",
      etapa_atual: "Reparo",
      area_destino: "Reparo",
      areas_reparo: [],
      areas_concluidas: [],
    };
  }

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      ...osUpdate,
      tecnico_triagem: payload.triado_por || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", os.id);

  if (osError) throw osError;

  if (resultado === "condenacao") {
    await criarSolicitacaoCondenacao({
      os,
      motivo: payload.observacoes || "Unidade condenada tecnicamente durante a triagem de Climatização.",
      areaRetorno: "Triagem",
      usuarioId: payload.usuario_id,
      usuarioNome: payload.triado_por,
    });
  }

  return componente;
}

export async function fetchComponentesAguardandoKit() {
  const { data, error } = await supabase
    .from("climatizacao_componentes")
    .select("*, os:ordens_servico(*)")
    .eq("status", "aguardando_kit")
    .order("triado_em", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function formarKitClimatizacao(componenteIds, tecnico, observacoes = "") {
  const { data, error } = await supabase.rpc("climatizacao_formar_kit", {
    p_componente_ids: componenteIds,
    p_tecnico: tecnico || null,
    p_observacoes: observacoes || null,
  });

  if (error) throw error;
  return data;
}

export async function fetchKitsParaOperacao() {
  const { data, error } = await supabase
    .from("climatizacao_kits")
    .select(`
      *,
      itens:climatizacao_kit_itens(
        *,
        componente:climatizacao_componentes(
          *,
          os:ordens_servico(*)
        )
      ),
      operacoes:climatizacao_operacoes(*)
    `)
    .in("status", ["formado", "em_operacao", "pausado"])
    .order("formado_em", { ascending: true });

  if (error) throw error;

  return (data || []).map((kit) => ({
    ...kit,
    itens: (kit.itens || []).filter((item) => item.ativo),
    operacoes: (kit.operacoes || []).sort((a, b) => b.id - a.id),
  }));
}

export async function iniciarOperacaoClimatizacao(kitId, tecnico) {
  const { data, error } = await supabase.rpc("climatizacao_iniciar_operacao", {
    p_kit_id: kitId,
    p_tecnico: tecnico || null,
  });
  if (error) throw error;
  return data;
}

export async function pausarOperacaoClimatizacao(operacaoId, motivo) {
  const { data, error } = await supabase.rpc("climatizacao_pausar_operacao", {
    p_operacao_id: operacaoId,
    p_motivo: motivo || null,
  });
  if (error) throw error;
  return data;
}

export async function retomarOperacaoClimatizacao(operacaoId) {
  const { data, error } = await supabase.rpc("climatizacao_retomar_operacao", {
    p_operacao_id: operacaoId,
  });
  if (error) throw error;
  return data;
}

export async function salvarMedicoesOperacaoClimatizacao(
  operacaoId,
  medicoes,
  checklistOperacao
) {
  if (!operacaoId) throw new Error("Operação inválida.");

  const { data, error } = await supabase
    .from("climatizacao_operacoes")
    .update({
      medicoes: medicoes || {},
      checklist_operacao: checklistOperacao || {},
      updated_at: new Date().toISOString(),
    })
    .eq("id", operacaoId)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

export async function finalizarOperacaoClimatizacao(
  operacaoId,
  falhas,
  observacoes,
  tecnico
) {
  const { data, error } = await supabase.rpc("climatizacao_finalizar_operacao", {
    p_operacao_id: operacaoId,
    p_falhas: falhas || [],
    p_observacoes: observacoes || null,
    p_tecnico: tecnico || null,
  });
  if (error) throw error;
  return data;
}

export async function fetchComponentesEmReparo() {
  const { data, error } = await supabase
    .from("climatizacao_componentes")
    .select("*, os:ordens_servico(*)")
    .eq("status", "em_reparo")
    .order("updated_at", { ascending: true });

  if (error) throw error;

  const componentes = data || [];
  const osIds = componentes.map((item) => item.os_id);
  if (!osIds.length) return [];

  const { data: triagens, error: triagemError } = await supabase
    .from("linha_branca_triagens")
    .select("*")
    .in("os_id", osIds)
    .eq("tipo_produto", "Ar-condicionado")
    .order("created_at", { ascending: false });

  if (triagemError) throw triagemError;

  const triagemPorOs = new Map();
  (triagens || []).forEach((triagem) => {
    const chave = String(triagem.os_id);
    if (!triagemPorOs.has(chave)) triagemPorOs.set(chave, triagem);
  });

  return componentes.map((componente) => ({
    ...componente,
    __triagem: triagemPorOs.get(String(componente.os_id)) || null,
  }));
}

export async function fetchHistoricoClimatizacao(osId) {
  if (!osId) {
    return {
      triagens: [],
      reparos: [],
      requisicoes: [],
      compras: [],
      pecasContexto: [],
      condenacoes: [],
    };
  }

  const respostas = await Promise.all([
    supabase
      .from("linha_branca_triagens")
      .select("*")
      .eq("os_id", osId)
      .eq("tipo_produto", "Ar-condicionado")
      .order("created_at", { ascending: true }),
    supabase
      .from("ordens_servico_execucao")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_pecas_requisicoes")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_necessidades_compra")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_reparo_pecas_contexto")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_condenacoes")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
  ]);

  respostas.forEach((resposta) => {
    if (resposta.error) throw resposta.error;
  });

  return {
    triagens: respostas[0].data || [],
    reparos: respostas[1].data || [],
    requisicoes: respostas[2].data || [],
    compras: respostas[3].data || [],
    pecasContexto: respostas[4].data || [],
    condenacoes: respostas[5].data || [],
  };
}

export async function registrarReparoClimatizacao(componente, payload, areaExecucao) {
  const os = componente?.os;
  if (!os) throw new Error("OS vinculada ao componente não encontrada.");
  if (!areaExecucao) throw new Error("Selecione a especialidade do reparo.");

  const { error: execError } = await supabase
    .from("ordens_servico_execucao")
    .insert({
      os_id: os.id,
      area_execucao: areaExecucao,
      tecnico: payload.tecnico || null,
      dt_inicio: payload.dt_inicio || new Date().toISOString(),
      dt_fim: new Date().toISOString(),
      diagnostico_final: payload.diagnostico || null,
      servico_executado: payload.servico || null,
      peca_trocada: Boolean(payload.pecas),
      descricao_peca_trocada: payload.pecas || null,
      aprovado: true,
      condenado: false,
      observacoes: payload.observacoes || null,
    });

  if (execError) throw execError;

  if (payload.destino === "venda_no_estado") {
    const [{ error: componenteError }, { error: osError }] = await Promise.all([
      supabase
        .from("climatizacao_componentes")
        .update({ status: "venda_no_estado", updated_at: new Date().toISOString() })
        .eq("id", componente.id),
      supabase
        .from("ordens_servico")
        .update({
          status_atual: "Venda no estado",
          etapa_atual: "Venda no estado",
          area_destino: "Venda no estado",
          tecnico_responsavel: payload.tecnico || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", os.id),
    ]);

    if (componenteError) throw componenteError;
    if (osError) throw osError;
    return true;
  }

  const concluidas = Array.from(new Set([...(os.areas_concluidas || []), areaExecucao]));
  const areas = (os.areas_reparo || []).filter((area) =>
    ["Reparo Mecânico", "Reparo Elétrico", "Reparo Estético"].includes(area)
  );
  const todasConcluidas = areas.length === 0 || areas.every((area) => concluidas.includes(area));
  const proximaArea = areas.find((area) => !concluidas.includes(area)) || null;

  const { error: componenteError } = await supabase
    .from("climatizacao_componentes")
    .update({
      status: todasConcluidas ? "aguardando_kit" : "em_reparo",
      updated_at: new Date().toISOString(),
    })
    .eq("id", componente.id);

  if (componenteError) throw componenteError;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: todasConcluidas ? "Triado - aguardando kit" : "Em reparo",
      etapa_atual: todasConcluidas ? "Aguardando kit" : proximaArea || areaExecucao,
      area_destino: todasConcluidas ? "Aguardando kit" : proximaArea || areaExecucao,
      areas_concluidas: concluidas,
      tecnico_responsavel: payload.tecnico || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", os.id);

  if (osError) throw osError;
  return true;
}

export async function solicitarCondenacaoClimatizacao(
  componente,
  motivo,
  usuario,
  areaRetorno = "Reparo"
) {
  const os = componente?.os;
  if (!os?.id) throw new Error("OS vinculada ao componente não encontrada.");
  if (!String(motivo || "").trim()) throw new Error("Informe a justificativa da condenação.");

  await criarSolicitacaoCondenacao({
    os,
    motivo,
    areaRetorno,
    usuarioId: usuario?.id,
    usuarioNome: usuario?.nome,
  });

  const [{ error: componenteError }, { error: osError }] = await Promise.all([
    supabase
      .from("climatizacao_componentes")
      .update({ status: "aguardando_condenacao", updated_at: new Date().toISOString() })
      .eq("id", componente.id),
    supabase
      .from("ordens_servico")
      .update({
        status_atual: "Em reparo",
        etapa_atual: "Reparo",
        area_destino: "Reparo",
        tecnico_responsavel: usuario?.nome || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", os.id),
  ]);

  if (componenteError) throw componenteError;
  if (osError) throw osError;
  return true;
}

export async function fetchCondenacoesClimatizacaoPendentes() {
  const { data, error } = await supabase
    .from("linha_branca_condenacoes")
    .select("*, ordens_servico(*)")
    .eq("status", "aguardando_aprovacao")
    .order("solicitado_em", { ascending: true });

  if (error) throw error;
  return (data || []).filter((item) => categoriaClimatizacao(item.ordens_servico?.categoria));
}

export async function decidirCondenacaoClimatizacao({
  condenacao,
  aprovar,
  destino,
  observacoes,
  usuario,
}) {
  if (!condenacao?.id) throw new Error("Solicitação de condenação inválida.");
  const gerente = await isGerenteLinhaBranca(usuario?.id);
  if (!gerente) throw new Error("A decisão é restrita ao gerente da Linha Branca.");

  if (aprovar && !["Scrap", "Venda no estado", "Desmembramento"].includes(destino)) {
    throw new Error("Selecione o destino da condenação.");
  }

  const { data, error } = await supabase
    .from("linha_branca_condenacoes")
    .update({
      status: aprovar ? "aprovada" : "rejeitada",
      destino: aprovar ? destino : null,
      decidido_por: usuario?.id || null,
      decidido_por_nome: usuario?.nome || null,
      decidido_em: new Date().toISOString(),
      decisao_observacoes: observacoes?.trim() || null,
    })
    .eq("id", condenacao.id)
    .eq("status", "aguardando_aprovacao")
    .select("*")
    .single();

  if (error) throw error;

  const { data: componente, error: componenteBuscaError } = await supabase
    .from("climatizacao_componentes")
    .select("id")
    .eq("os_id", condenacao.os_id)
    .limit(1)
    .maybeSingle();

  if (componenteBuscaError) throw componenteBuscaError;

  if (!aprovar) {
    if (componente?.id) {
      const { error: componenteError } = await supabase
        .from("climatizacao_componentes")
        .update({ status: "em_reparo", updated_at: new Date().toISOString() })
        .eq("id", componente.id);
      if (componenteError) throw componenteError;
    }

    const retorno =
      condenacao.area_retorno && condenacao.area_retorno.startsWith("Reparo")
        ? condenacao.area_retorno
        : "Reparo Mecânico";

    const { error: osError } = await supabase
      .from("ordens_servico")
      .update({
        status_atual: "Em reparo",
        etapa_atual: retorno,
        area_destino: retorno,
        updated_at: new Date().toISOString(),
      })
      .eq("id", condenacao.os_id);

    if (osError) throw osError;
    return data;
  }

  const componenteStatus =
    destino === "Scrap"
      ? "scrap"
      : destino === "Venda no estado"
        ? "venda_no_estado"
        : "desmembramento";

  if (componente?.id) {
    const { error: componenteError } = await supabase
      .from("climatizacao_componentes")
      .update({ status: componenteStatus, updated_at: new Date().toISOString() })
      .eq("id", componente.id);
    if (componenteError) throw componenteError;
  }

  const osUpdate =
    destino === "Scrap"
      ? { status_atual: "Scrap", etapa_atual: "Scrap", area_destino: "Scrap" }
      : destino === "Venda no estado"
        ? {
            status_atual: "Venda no estado",
            etapa_atual: "Venda no estado",
            area_destino: "Venda no estado",
          }
        : {
            status_atual: "Condenado",
            etapa_atual: "Condenado",
            area_destino: "Desmembramento",
          };

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      ...osUpdate,
      tecnico_responsavel: usuario?.nome || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", condenacao.os_id);

  if (osError) throw osError;
  return data;
}

export async function fetchNecessidadesCompraClimatizacaoPendentes() {
  const { data, error } = await supabase
    .from("linha_branca_necessidades_compra")
    .select("*, ordens_servico(numero_os,marca,modelo,categoria)")
    .in("status", ["necessidade_aberta", "em_cotacao"])
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []).filter((item) => categoriaClimatizacao(item.ordens_servico?.categoria));
}

export async function fetchIndicadoresClimatizacao() {
  const [
    { count: aguardandoTriagem, error: aguardandoError },
    { data: componentes, error: componentesError },
    { data: kits, error: kitsError },
  ] = await Promise.all([
    supabase
      .from("ordens_servico")
      .select("id", { count: "exact", head: true })
      .eq("linha_produto", "Linha Branca")
      .ilike("categoria", "Ar-condicionado%")
      .in("status_atual", ["Recebido", "Aguardando triagem", "Em triagem"]),
    supabase
      .from("climatizacao_componentes")
      .select("id,status,tipo_unidade,updated_at,os:ordens_servico(numero_os,marca,modelo,categoria,status_atual,etapa_atual,area_destino)"),
    supabase
      .from("climatizacao_kits")
      .select("id,codigo,status,formado_em,updated_at"),
  ]);

  if (aguardandoError) throw aguardandoError;
  if (componentesError) throw componentesError;
  if (kitsError) throw kitsError;

  const listaComponentes = componentes || [];
  const listaKits = kits || [];

  return {
    aguardandoTriagem: aguardandoTriagem || 0,
    aguardandoKit: listaComponentes.filter((item) => item.status === "aguardando_kit").length,
    emReparo: listaComponentes.filter((item) => item.status === "em_reparo").length,
    aguardandoCondenacao: listaComponentes.filter((item) => item.status === "aguardando_condenacao").length,
    vendaEstado: listaComponentes.filter((item) => item.status === "venda_no_estado").length,
    higienizacao: listaComponentes.filter((item) => item.status === "higienizacao").length,
    kitsFormados: listaKits.filter((kit) => ["formado", "em_operacao", "pausado"].includes(kit.status)).length,
    kitsEmOperacao: listaKits.filter((kit) => ["em_operacao", "pausado"].includes(kit.status)).length,
    kitsAprovados: listaKits.filter((kit) => ["aprovado", "higienizacao", "finalizado"].includes(kit.status)).length,
    componentes: listaComponentes,
    kits: listaKits,
  };
}
