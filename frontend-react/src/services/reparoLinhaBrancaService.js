import { supabase } from "../lib/supabase";

export async function fetchOsParaReparo(areaExecucao) {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .contains("areas_reparo", [areaExecucao])
    .not("areas_concluidas", "cs", `{${areaExecucao}}`)
    .in("status_atual", ["Triado", "Em reparo"])
    .order("dt_entrada", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchTriagemDaOs(osId) {
  const { data, error } = await supabase
    .from("linha_branca_triagens")
    .select("*")
    .eq("os_id", osId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

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

  // Adiciona área atual nas concluídas
  const areasConcluidasAtualizadas = [
    ...(os.areas_concluidas || []),
    areaExecucao,
  ];

  // Verifica se todas as áreas foram concluídas
  const areasReparo = os.areas_reparo || [];
  const todasConcluidas = areasReparo.every((area) =>
    areasConcluidasAtualizadas.includes(area)
  );

  const novoStatus = todasConcluidas ? "Bancada de Testes" : "Em reparo";
  const novaEtapa = todasConcluidas ? "Bancada de Testes" : areaExecucao;
  const novaArea = todasConcluidas ? "Bancada de Testes" : areaExecucao;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: novoStatus,
      etapa_atual: novaEtapa,
      area_destino: novaArea,
      areas_concluidas: areasConcluidasAtualizadas,
      tecnico_responsavel: execucao.tecnico,
    })
    .eq("id", os.id);

  if (osError) throw osError;
  return true;
}