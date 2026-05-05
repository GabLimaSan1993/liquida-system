import { supabase } from "../lib/supabase";

export async function fetchOsParaReparo(areaExecucao) {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .eq("area_destino", areaExecucao)
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
  const proximaArea = calcularProximaArea(os, areaExecucao);

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
      descricao_peca_t: execucao.descricao_peca,
      aprovado: true,
      observacoes: execucao.observacoes,
      condenado: false,
    });

  if (execError) throw execError;

  const novoStatus = proximaArea ? "Triado" : "Bancada de Testes";
  const novaEtapa = proximaArea ?? "Bancada de Testes";
  const novaArea = proximaArea ?? "Bancada de Testes";

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: novoStatus,
      etapa_atual: novaEtapa,
      area_destino: novaArea,
      tecnico_responsavel: execucao.tecnico,
    })
    .eq("id", os.id);

  if (osError) throw osError;
  return true;
}

function calcularProximaArea(os, areaAtual) {
  // Busca próxima área com reparos pendentes baseado na triagem
  const ordem = ["Reparo Mecânico", "Reparo Elétrico", "Reparo Estético"];
  const idx = ordem.indexOf(areaAtual);
  for (let i = idx + 1; i < ordem.length; i++) {
    if (os.area_destino === ordem[i]) return ordem[i];
  }
  return null;
}