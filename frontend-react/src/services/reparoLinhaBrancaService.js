import { supabase } from "../lib/supabase";

export function osAguardandoCmp(os) {
  if (os?.origem === "Retorno de Loja") return false;
  const etapa = String(os?.dados_aging?.ETAPA || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, " ");
  return /^AGUARDANDO(?: CONFIRMACAO DE MOVIMENTACAO)? CMP(?:\/HF)?$/.test(etapa);
}

// Fila operacional: o status atual prevalece sobre o histórico importado de Aging.
export function osAguardandoPeca(os) {
  return String(os?.status_atual || "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim().toUpperCase() === "AGUARDANDO PECA";
}

export async function fetchOsAguardandoPeca() {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .eq("linha_produto", "Linha Branca")
    .eq("status_atual", "Aguardando peça")
    .order("dt_entrada", { ascending: true });

  if (error) throw error;
  return data || [];
}

// Compatibilidade com as telas que já utilizavam a fila de Aguardando CMP.
export const fetchOsAguardandoCmp = fetchOsAguardandoPeca;

export async function fetchOsParaReparo(areaExecucao) {
  const [{ data, error }, aguardandoPeca] = await Promise.all([
    supabase
      .from("ordens_servico")
      .select("*")
      .contains("areas_reparo", [areaExecucao])
      .not("areas_concluidas", "cs", `{${areaExecucao}}`)
      .in("status_atual", ["Triado", "Em reparo", "Aguardando peça"])
      .order("dt_entrada", { ascending: true }),
    fetchOsAguardandoPeca(),
  ]);

  if (error) throw error;
  const mapa = new Map((data || []).map((os) => [String(os.id), os]));
  // OSs históricas sem triagem ou especialidade são abertas no reparo mecânico,
  // podendo ser reclassificadas pelo técnico antes da conclusão.
  if (areaExecucao === "Reparo Mecânico") {
    aguardandoPeca.filter((os) => !(os.areas_reparo || []).length)
      .forEach((os) => mapa.set(String(os.id), os));
  }
  return [...mapa.values()].sort((a, b) =>
    String(a.dt_entrada || "").localeCompare(String(b.dt_entrada || "")));
}

export async function fetchTriagemDaOs(osId) {
  const { data, error } = await supabase
    .from("linha_branca_triagens")
    .select("*")
    .eq("os_id", osId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function condenarOs(os, motivo, tecnico) {
  const { error: execError } = await supabase
    .from("ordens_servico_execucao")
    .insert({
      os_id: os.id,
      area_execucao: os.area_destino,
      tecnico,
      dt_inicio: new Date().toISOString(),
      dt_fim: new Date().toISOString(),
      condenado: true,
      motivo_condenacao: motivo,
      aprovado: false,
    });

  if (execError) throw execError;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Condenado",
      etapa_atual: "Scrap",
      area_destino: "Scrap",
      tecnico_responsavel: tecnico,
    })
    .eq("id", os.id);

  if (osError) throw osError;
  return true;
}

export async function salvarExecucaoReparo(os, execucao, areaExecucao) {
  const { error: execError } = await supabase
    .from("ordens_servico_execucao")
    .insert({
      os_id: os.id,
      area_execucao: areaExecucao,
      tecnico: execucao.tecnico,
      dt_inicio: execucao.dt_inicio,
      dt_fim: new Date().toISOString(),
      diagnostico_final: execucao.diagnostico_final,
      servico_executado: execucao.servico_executado,
      peca_trocada: execucao.peca_trocada,
      descricao_peca_trocada: execucao.descricao_peca,
      aprovado: true,
      observacoes: execucao.observacoes,
      condenado: false,
    });

  if (execError) throw execError;

  // Adiciona a área atual nas concluídas sem duplicar registros.
  const areasConcluidasAtualizadas = Array.from(
    new Set([...(os.areas_concluidas || []), areaExecucao])
  );

  // Direciona automaticamente para a próxima especialidade ainda pendente.
  const areasReparo = (os.areas_reparo || []).length ? os.areas_reparo : [areaExecucao];
  const areasPendentes = areasReparo.filter(
    (area) => !areasConcluidasAtualizadas.includes(area)
  );
  const todasConcluidas = areasPendentes.length === 0;
  const proximaArea = areasPendentes[0] || null;

  const novoStatus = todasConcluidas ? "Bancada de Testes" : "Em reparo";
  const novaEtapa = todasConcluidas ? "Bancada de Testes" : proximaArea;
  const novaArea = todasConcluidas ? "Bancada de Testes" : proximaArea;
  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: novoStatus,
      etapa_atual: novaEtapa,
      area_destino: novaArea,
      areas_reparo: areasReparo,
      areas_concluidas: areasConcluidasAtualizadas,
      tecnico_responsavel: execucao.tecnico,
    })
    .eq("id", os.id);

  if (osError) throw osError;
  return true;
}
