import { supabase } from "../lib/supabase.js";

export const CHECKLIST_CLIMATIZACAO = [
  "Motoventilador",
  "Serpentina",
  "Placa",
  "Compressor",
  "Interface",
  "Carcaça",
  "Conexão",
];

const MAPA_AREA_REPARO = {
  Motoventilador: "Reparo Mecânico",
  Serpentina: "Reparo Mecânico",
  Placa: "Reparo Elétrico",
  Compressor: "Reparo Mecânico",
  Interface: "Reparo Elétrico",
  "Carcaça": "Reparo Estético",
  "Conexão": "Reparo Mecânico",
};

function areasPorChecklist(checklist = {}) {
  const areas = new Set();
  Object.entries(checklist).forEach(([item, valor]) => {
    if (valor === "ruim" && MAPA_AREA_REPARO[item]) {
      areas.add(MAPA_AREA_REPARO[item]);
    }
  });
  return [...areas];
}

export async function fetchOsClimatizacaoAguardandoTriagem() {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .eq("linha_produto", "Linha Branca")
    .in("status_atual", ["Recebido", "Aguardando triagem", "Em triagem"])
    .order("dt_entrada", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function salvarTriagemClimatizacao(os, payload) {
  const areasReparo = areasPorChecklist(payload.checklist);
  const statusComponente = {
    aprovado: "aguardando_kit",
    reparo: "em_reparo",
    venda_no_estado: "venda_no_estado",
    scrap: "scrap",
  }[payload.resultado];

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
    resultado_triagem: payload.resultado,
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

  const observacoesTriagem = [
    `Tipo: ${payload.tipo_unidade}`,
    `Energização: ${payload.energiza ? "Liga" : "Não liga"}`,
    `Destino: ${payload.resultado}`,
    payload.observacoes ? `Observações: ${payload.observacoes}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: historicoError } = await supabase
    .from("linha_branca_triagens")
    .insert({
      os_id: os.id,
      tipo_produto: "Ar-condicionado",
      precisa_reparo: payload.resultado === "reparo",
      reparos_mecanicos: areasReparo.includes("Reparo Mecânico")
        ? ["TRIAGEM CLIMATIZAÇÃO"]
        : [],
      reparos_eletricos: areasReparo.includes("Reparo Elétrico")
        ? ["TRIAGEM CLIMATIZAÇÃO"]
        : [],
      reparos_esteticos: areasReparo.includes("Reparo Estético")
        ? ["TRIAGEM CLIMATIZAÇÃO"]
        : [],
      observacoes_triagem: observacoesTriagem,
      triado_por: payload.triado_por || null,
    });

  if (historicoError) throw historicoError;

  let osUpdate;
  if (payload.resultado === "aprovado") {
    osUpdate = {
      status_atual: "Triado - aguardando kit",
      etapa_atual: "Aguardando kit",
      area_destino: "Aguardando kit",
      areas_reparo: [],
      areas_concluidas: [],
    };
  } else if (payload.resultado === "reparo") {
    const areas = areasReparo.length ? areasReparo : ["Reparo Mecânico"];
    osUpdate = {
      status_atual: "Triado",
      etapa_atual: areas[0],
      area_destino: areas[0],
      areas_reparo: areas,
      areas_concluidas: [],
    };
  } else if (payload.resultado === "venda_no_estado") {
    osUpdate = {
      status_atual: "Venda no estado",
      etapa_atual: "Venda no estado",
      area_destino: "Venda no estado",
      areas_reparo: [],
      areas_concluidas: [],
    };
  } else {
    osUpdate = {
      status_atual: "Condenado",
      etapa_atual: "Scrap",
      area_destino: "Scrap",
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
  return data || [];
}

export async function registrarReparoClimatizacao(componente, payload) {
  const os = componente.os;
  if (!os) throw new Error("OS vinculada ao componente não encontrada.");

  const { error: execError } = await supabase
    .from("ordens_servico_execucao")
    .insert({
      os_id: os.id,
      area_execucao: "Reparo Climatização",
      tecnico: payload.tecnico || null,
      dt_inicio: payload.dt_inicio || new Date().toISOString(),
      dt_fim: new Date().toISOString(),
      diagnostico_final: payload.diagnostico || null,
      servico_executado: payload.servico || null,
      peca_trocada: Boolean(payload.pecas),
      descricao_peca_trocada: payload.pecas || null,
      aprovado: payload.destino === "reparado",
      condenado: payload.destino === "scrap",
      motivo_condenacao: payload.destino === "scrap" ? payload.diagnostico : null,
      observacoes: payload.observacoes || null,
    });
  if (execError) throw execError;

  const destino = payload.destino;
  const statusComponente = {
    reparado: "aguardando_kit",
    scrap: "scrap",
    venda_no_estado: "venda_no_estado",
  }[destino];

  if (!statusComponente) throw new Error("Destino de reparo inválido.");

  const { error: componenteError } = await supabase
    .from("climatizacao_componentes")
    .update({
      status: statusComponente,
      updated_at: new Date().toISOString(),
    })
    .eq("id", componente.id);
  if (componenteError) throw componenteError;

  const osUpdate =
    destino === "reparado"
      ? {
          status_atual: "Triado - aguardando kit",
          etapa_atual: "Aguardando kit",
          area_destino: "Aguardando kit",
          areas_reparo: [],
          areas_concluidas: [],
        }
      : destino === "scrap"
      ? {
          status_atual: "Condenado",
          etapa_atual: "Scrap",
          area_destino: "Scrap",
        }
      : {
          status_atual: "Venda no estado",
          etapa_atual: "Venda no estado",
          area_destino: "Venda no estado",
        };

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      ...osUpdate,
      tecnico_responsavel: payload.tecnico || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", os.id);
  if (osError) throw osError;

  return true;
}

export async function fetchIndicadoresClimatizacao() {
  const [{ count: aguardandoKit }, { count: emReparo }, { count: vendaEstado }, { count: scrap }, { data: kits }] =
    await Promise.all([
      supabase.from("climatizacao_componentes").select("id", { count: "exact", head: true }).eq("status", "aguardando_kit"),
      supabase.from("climatizacao_componentes").select("id", { count: "exact", head: true }).eq("status", "em_reparo"),
      supabase.from("climatizacao_componentes").select("id", { count: "exact", head: true }).eq("status", "venda_no_estado"),
      supabase.from("climatizacao_componentes").select("id", { count: "exact", head: true }).eq("status", "scrap"),
      supabase.from("climatizacao_kits").select("id,status"),
    ]);

  return {
    aguardandoKit: aguardandoKit || 0,
    emReparo: emReparo || 0,
    vendaEstado: vendaEstado || 0,
    scrap: scrap || 0,
    kitsFormados: (kits || []).filter((kit) => ["formado", "em_operacao", "pausado"].includes(kit.status)).length,
    kitsAprovados: (kits || []).filter((kit) => ["aprovado", "higienizacao", "finalizado"].includes(kit.status)).length,
  };
}
