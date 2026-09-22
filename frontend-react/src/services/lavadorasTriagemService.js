import { supabase } from "../lib/supabase.js";

export const DURACAO_CICLO_LAVADORA = 25 * 60;
export const POSICOES_BANCADA_LAVADORAS = Array.from(
  { length: 20 },
  (_, index) => String(index + 1).padStart(2, "0")
);

export const STATUS_RESERVA_POSICAO = [
  "em_ciclo",
  "pausado",
  "pausado_erro",
  "aguardando_segundo",
  "aguardando_higienizacao",
  "aguardando_resultado",
];

const STATUS_TRIAGEM_OS = ["Recebido", "Aguardando triagem", "Em triagem"];

function nowIso() {
  return new Date().toISOString();
}

function normalizar(valor) {
  return String(valor || "")
    .trim()
    .toLocaleLowerCase("pt-BR")
    .replace(/\s+/g, " ");
}

export function valoresIguais(esperado, fisico) {
  if (!String(esperado || "").trim() || !String(fisico || "").trim()) return false;
  return normalizar(esperado) === normalizar(fisico);
}

export function calcularTempoExecutado(ciclo, referencia = Date.now()) {
  if (!ciclo) return 0;
  let total = Number(ciclo.tempo_executado_segundos || 0);

  if (ciclo.status === "em_ciclo" && ciclo.ultimo_inicio_em) {
    const inicio = new Date(ciclo.ultimo_inicio_em).getTime();
    if (Number.isFinite(inicio)) {
      total += Math.max(0, Math.floor((referencia - inicio) / 1000));
    }
  }

  const alvo = Number(ciclo.duracao_alvo_segundos || DURACAO_CICLO_LAVADORA);
  return Math.max(0, Math.min(total, alvo));
}

export async function registrarEventoLavadora({
  cicloId,
  osId,
  tipoEvento,
  detalhes,
  tempoExecutado,
  operador,
}) {
  const { error } = await supabase.from("linha_branca_lavadora_eventos").insert({
    ciclo_id: cicloId,
    os_id: osId,
    tipo_evento: tipoEvento,
    detalhes: detalhes || null,
    tempo_executado_segundos:
      tempoExecutado === undefined ? null : tempoExecutado,
    operador: operador || null,
  });
  if (error) throw error;
}

async function criarLaudo({ osId, tipo, titulo, resumo, dados, operador }) {
  const { data, error } = await supabase
    .from("linha_branca_lavadora_laudos")
    .insert({
      os_id: osId,
      tipo,
      titulo,
      resumo: resumo || null,
      dados: dados || {},
      operador: operador || null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function fetchLaudosLavadora(osId) {
  if (!osId) return [];
  const { data, error } = await supabase
    .from("linha_branca_lavadora_laudos")
    .select("*")
    .eq("os_id", osId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function fetchEventosCicloLavadora(cicloId) {
  if (!cicloId) return [];
  const { data, error } = await supabase
    .from("linha_branca_lavadora_eventos")
    .select("*")
    .eq("ciclo_id", cicloId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function fetchHistoricoLavadora(osId) {
  if (!osId) return { ciclos: [], eventos: [], reparos: [], laudos: [], triagens: [] };

  const [ciclosRes, eventosRes, reparosRes, laudosRes, triagensRes] = await Promise.all([
    supabase
      .from("linha_branca_lavadora_ciclos")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_lavadora_eventos")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("ordens_servico_execucao")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_lavadora_laudos")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_triagens")
      .select("*")
      .eq("os_id", osId)
      .eq("tipo_produto", "Lavadoras")
      .order("created_at", { ascending: true }),
  ]);

  for (const resposta of [ciclosRes, eventosRes, reparosRes, laudosRes, triagensRes]) {
    if (resposta.error) throw resposta.error;
  }

  return {
    ciclos: ciclosRes.data || [],
    eventos: eventosRes.data || [],
    reparos: reparosRes.data || [],
    laudos: laudosRes.data || [],
    triagens: triagensRes.data || [],
  };
}


export async function fetchIndicadoresLavadoras() {
  const [{ data: osData, error: osError }, { data: ciclosData, error: ciclosError }] =
    await Promise.all([
      supabase
        .from("ordens_servico")
        .select("id,status_atual,etapa_atual,area_destino,updated_at")
        .eq("linha_produto", "Linha Branca")
        .eq("categoria", "Lavadora"),
      supabase
        .from("linha_branca_lavadora_ciclos")
        .select("id,os_id,status,etapa_teste,updated_at")
        .order("updated_at", { ascending: false })
        .limit(500),
    ]);

  if (osError) throw osError;
  if (ciclosError) throw ciclosError;

  const osList = osData || [];
  const ciclos = ciclosData || [];
  const ativos = ciclos.filter((ciclo) => STATUS_RESERVA_POSICAO.includes(ciclo.status));
  const osEmTeste = new Set(ativos.map((ciclo) => String(ciclo.os_id)));

  return {
    aguardandoTriagem: osList.filter((os) =>
      STATUS_TRIAGEM_OS.includes(os.status_atual) && !osEmTeste.has(String(os.id))
    ).length,
    emReparo: osList.filter((os) =>
      ["Triado", "Em reparo", "Aguardando peça"].includes(os.status_atual) ||
      String(os.area_destino || "").startsWith("Reparo")
    ).length,
    emTestes: osEmTeste.size,
    concluidas: osList.filter((os) =>
      ["Aprovado", "Limpeza", "Higienização", "Qualidade", "Finalizado"].includes(os.status_atual)
    ).length,
  };
}

export async function fetchPainelTriagemLavadoras() {
  const [{ data: osData, error: osError }, { data: ciclosData, error: ciclosError }] =
    await Promise.all([
      supabase
        .from("ordens_servico")
        .select("*")
        .eq("linha_produto", "Linha Branca")
        .eq("categoria", "Lavadora")
        .order("dt_entrada", { ascending: true }),
      supabase
        .from("linha_branca_lavadora_ciclos")
        .select("*")
        .eq("etapa_teste", "triagem")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  if (osError) throw osError;
  if (ciclosError) throw ciclosError;

  const osList = osData || [];
  const ciclos = ciclosData || [];
  const osMap = new Map(osList.map((item) => [String(item.id), item]));
  const ciclosEnriquecidos = ciclos.map((ciclo) => ({
    ...ciclo,
    os: osMap.get(String(ciclo.os_id)) || null,
  }));

  const osReservadas = new Set(
    ciclosEnriquecidos
      .filter((ciclo) => STATUS_RESERVA_POSICAO.includes(ciclo.status))
      .map((ciclo) => String(ciclo.os_id))
  );

  const aguardando = osList.filter(
    (os) => STATUS_TRIAGEM_OS.includes(os.status_atual) && !osReservadas.has(String(os.id))
  );

  return { osList, aguardando, ciclos: ciclosEnriquecidos };
}

export async function fetchPainelBancadaPosReparo() {
  const [{ data: osData, error: osError }, { data: ciclosData, error: ciclosError }] =
    await Promise.all([
      supabase
        .from("ordens_servico")
        .select("*")
        .eq("linha_produto", "Linha Branca")
        .eq("categoria", "Lavadora")
        .eq("area_destino", "Bancada de Testes")
        .order("dt_entrada", { ascending: true }),
      supabase
        .from("linha_branca_lavadora_ciclos")
        .select("*")
        .eq("etapa_teste", "pos_reparo")
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  if (osError) throw osError;
  if (ciclosError) throw ciclosError;

  const osList = osData || [];
  const osMap = new Map(osList.map((item) => [String(item.id), item]));
  const ciclos = (ciclosData || []).map((item) => ({
    ...item,
    os: osMap.get(String(item.os_id)) || null,
  }));
  const reservadas = new Set(
    ciclos.filter((item) => STATUS_RESERVA_POSICAO.includes(item.status)).map((item) => String(item.os_id))
  );

  return {
    osList,
    aguardando: osList.filter((os) => !reservadas.has(String(os.id))),
    ciclos,
  };
}

export async function buscarReferenciaProduto(os) {
  if (!os?.modelo) return null;
  let query = supabase
    .from("produtos_catalogo")
    .select("marca, modelo, capacidade, cor, descricao, tipo")
    .ilike("modelo", os.modelo)
    .eq("ativo", true)
    .limit(1);
  if (os.marca) query = query.ilike("marca", os.marca);
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

async function posicoesOcupadas(etapaTeste) {
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .select("os_id, posicao, status")
    .eq("etapa_teste", etapaTeste)
    .in("status", STATUS_RESERVA_POSICAO);
  if (error) throw error;
  return data || [];
}

async function proximaTentativa(osId, etapaTeste) {
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .select("tentativa")
    .eq("os_id", osId)
    .eq("etapa_teste", etapaTeste)
    .order("tentativa", { ascending: false })
    .limit(1);
  if (error) throw error;
  return Number(data?.[0]?.tentativa || 0) + 1;
}

async function criarCiclo({
  os,
  operador,
  validacaoProduto,
  posicao,
  etapaTeste,
  numeroCiclo,
}) {
  const ocupadas = await posicoesOcupadas(etapaTeste);
  if (ocupadas.some((item) => String(item.os_id) === String(os.id))) {
    throw new Error("Esta OS já possui um ciclo ou decisão pendente nesta bancada.");
  }

  const setOcupadas = new Set(ocupadas.map((item) => String(item.posicao)));
  const posicaoEscolhida =
    String(posicao || "") || POSICOES_BANCADA_LAVADORAS.find((item) => !setOcupadas.has(item));
  if (!posicaoEscolhida) throw new Error("Não há posição de bancada disponível.");
  if (setOcupadas.has(posicaoEscolhida)) throw new Error(`A posição ${posicaoEscolhida} já está ocupada.`);

  const instante = nowIso();
  const tentativa = await proximaTentativa(os.id, etapaTeste);
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .insert({
      os_id: os.id,
      tentativa,
      posicao: posicaoEscolhida,
      status: "em_ciclo",
      etapa_teste: etapaTeste,
      numero_ciclo: numeroCiclo,
      duracao_alvo_segundos: DURACAO_CICLO_LAVADORA,
      tempo_executado_segundos: 0,
      iniciado_em: instante,
      ultimo_inicio_em: instante,
      operador: operador || null,
      validacao_produto: validacaoProduto || {},
    })
    .select("*")
    .single();
  if (error) throw error;

  await registrarEventoLavadora({
    cicloId: data.id,
    osId: os.id,
    tipoEvento: "Ciclo iniciado",
    detalhes: `${etapaTeste === "pos_reparo" ? "Teste pós-reparo" : `Ciclo ${numeroCiclo} da triagem`} iniciado · Posição ${posicaoEscolhida} · 25:00`,
    tempoExecutado: 0,
    operador,
  });
  return data;
}

export async function iniciarCicloLavadora({ os, operador, validacaoProduto, posicao }) {
  if (!os?.id) throw new Error("OS inválida para iniciar o ciclo.");
  const ciclo = await criarCiclo({
    os,
    operador,
    validacaoProduto,
    posicao,
    etapaTeste: "triagem",
    numeroCiclo: 1,
  });

  const { error } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Em triagem",
      etapa_atual: "Triagem",
      area_destino: "Triagem Lavadoras",
      tecnico_triagem: operador || null,
    })
    .eq("id", os.id);
  if (error) throw error;
  return ciclo;
}

export async function iniciarSegundoCicloLavadora(cicloAnterior, operador) {
  if (!cicloAnterior?.id || cicloAnterior.status !== "aguardando_segundo") {
    throw new Error("O primeiro ciclo ainda não está liberado para iniciar o segundo.");
  }

  const os = cicloAnterior.os || { id: cicloAnterior.os_id };
  const { error: liberarError } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({ status: "concluido", resultado: "aprovado" })
    .eq("id", cicloAnterior.id)
    .eq("status", "aguardando_segundo");
  if (liberarError) throw liberarError;

  try {
    const ciclo = await criarCiclo({
      os,
      operador,
      validacaoProduto: cicloAnterior.validacao_produto || {},
      posicao: cicloAnterior.posicao,
      etapaTeste: "triagem",
      numeroCiclo: 2,
    });
    await registrarEventoLavadora({
      cicloId: ciclo.id,
      osId: ciclo.os_id,
      tipoEvento: "Segundo ciclo iniciado",
      detalhes: "Segundo ciclo obrigatório iniciado após aprovação do primeiro ciclo.",
      tempoExecutado: 0,
      operador,
    });
    return ciclo;
  } catch (error) {
    await supabase
      .from("linha_branca_lavadora_ciclos")
      .update({ status: "aguardando_segundo" })
      .eq("id", cicloAnterior.id);
    throw error;
  }
}

export async function iniciarCicloPosReparo({ os, operador, posicao }) {
  if (!os?.id) throw new Error("OS inválida para iniciar o teste pós-reparo.");
  const ciclo = await criarCiclo({
    os,
    operador,
    validacaoProduto: {},
    posicao,
    etapaTeste: "pos_reparo",
    numeroCiclo: 1,
  });

  const { error } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Bancada de Testes",
      etapa_atual: "Bancada de Testes",
      area_destino: "Bancada de Testes",
      tecnico_bancada: operador || null,
    })
    .eq("id", os.id);
  if (error) throw error;
  return ciclo;
}

export async function pausarCicloLavadora(ciclo, operador, porErro = false) {
  if (!ciclo?.id || ciclo.status !== "em_ciclo") throw new Error("Este ciclo não está em execução.");
  const tempoExecutado = calcularTempoExecutado(ciclo);
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: porErro ? "pausado_erro" : "pausado",
      tempo_executado_segundos: tempoExecutado,
      ultimo_inicio_em: null,
      pausado_em: nowIso(),
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEventoLavadora({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: porErro ? "Parada por erro" : "Ciclo pausado",
    detalhes: porErro ? "Cronômetro interrompido por falha apresentada." : "Pausa operacional.",
    tempoExecutado,
    operador,
  });
  return data;
}

export async function registrarErroCicloLavadora({
  ciclo,
  erroDescricao,
  codigoErro,
  observacoes,
  operador,
}) {
  if (!ciclo?.id) throw new Error("Ciclo inválido.");
  if (!String(erroDescricao || "").trim()) throw new Error("Informe o erro apresentado pela lavadora.");

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      erro_descricao: erroDescricao.trim(),
      erro_tipo: "Erro informado pelo técnico",
      erro_codigo: codigoErro?.trim() || null,
      erro_observacoes: observacoes?.trim() || null,
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEventoLavadora({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Erro registrado",
    detalhes: [erroDescricao.trim(), codigoErro ? `Código ${codigoErro}` : null, observacoes || null]
      .filter(Boolean)
      .join(" · "),
    tempoExecutado: Number(data.tempo_executado_segundos || 0),
    operador,
  });
  return data;
}

export async function retomarCicloLavadora(ciclo, operador) {
  if (!ciclo?.id || !["pausado", "pausado_erro"].includes(ciclo.status)) {
    throw new Error("Este ciclo não está pausado.");
  }
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({ status: "em_ciclo", ultimo_inicio_em: nowIso(), pausado_em: null })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) throw error;

  await registrarEventoLavadora({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Retomada do ciclo",
    detalhes: "Cronômetro retomado após verificação do técnico.",
    tempoExecutado: Number(ciclo.tempo_executado_segundos || 0),
    operador,
  });
  return data;
}

async function registrarTriagemReparo({
  ciclo,
  reparosMecanicos,
  reparosEletricos,
  reparosEsteticos,
  operador,
  observacoes,
}) {
  const { error } = await supabase.from("linha_branca_triagens").insert({
    os_id: ciclo.os_id,
    tipo_produto: "Lavadoras",
    precisa_reparo: true,
    reparos_mecanicos: reparosMecanicos || [],
    reparos_eletricos: reparosEletricos || [],
    reparos_esteticos: reparosEsteticos || [],
    observacoes_triagem: observacoes || null,
    triado_por: operador || null,
  });
  if (error) throw error;
}

export async function enviarCicloParaReparo({
  ciclo,
  reparosMecanicos = [],
  reparosEletricos = [],
  reparosEsteticos = [],
  erroDescricao,
  codigoErro,
  observacoes,
  operador,
}) {
  if (!ciclo?.id) throw new Error("Ciclo inválido.");
  const areas = [];
  if (reparosMecanicos.length) areas.push("Reparo Mecânico");
  if (reparosEletricos.length) areas.push("Reparo Elétrico");
  if (reparosEsteticos.length) areas.push("Reparo Estético");
  if (!areas.length) throw new Error("Selecione ao menos um reparo mecânico, elétrico ou estético.");

  let cicloAtual = ciclo;
  if (erroDescricao?.trim() && erroDescricao.trim() !== ciclo.erro_descricao) {
    cicloAtual = await registrarErroCicloLavadora({
      ciclo,
      erroDescricao,
      codigoErro,
      observacoes,
      operador,
    });
  }

  const tempoExecutado = calcularTempoExecutado(cicloAtual);
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: "enviado_reparo",
      resultado: "interrompido",
      tempo_executado_segundos: tempoExecutado,
      ultimo_inicio_em: null,
      concluido_em: nowIso(),
      area_reparo: areas.join(" | "),
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) throw error;

  const resumoErro = [
    erroDescricao || cicloAtual.erro_descricao,
    codigoErro || cicloAtual.erro_codigo ? `Código ${codigoErro || cicloAtual.erro_codigo}` : null,
    observacoes || cicloAtual.erro_observacoes,
  ].filter(Boolean).join(" · ");

  await registrarTriagemReparo({
    ciclo: data,
    reparosMecanicos,
    reparosEletricos,
    reparosEsteticos,
    operador,
    observacoes: `Falha em ${data.etapa_teste === "pos_reparo" ? "teste pós-reparo" : `ciclo ${data.numero_ciclo} da triagem`}. ${resumoErro}`,
  });

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Triado",
      etapa_atual: areas[0],
      area_destino: areas[0],
      areas_reparo: areas,
      areas_concluidas: [],
      tecnico_responsavel: operador || null,
      aprovado_bancada: false,
      obs_bancada: data.etapa_teste === "pos_reparo" ? resumoErro : null,
    })
    .eq("id", data.os_id);
  if (osError) throw osError;

  await registrarEventoLavadora({
    cicloId: data.id,
    osId: data.os_id,
    tipoEvento: "Encaminhado para reparo",
    detalhes: `${areas.join(", ")} · ${resumoErro}`,
    tempoExecutado,
    operador,
  });
  return data;
}

export async function condenarLavadora({ ciclo, os, motivo, operador }) {
  const osId = os?.id || ciclo?.os_id;
  if (!osId) throw new Error("OS inválida.");
  if (!String(motivo || "").trim()) throw new Error("Informe a justificativa da condenação / scrap.");

  if (ciclo?.id) {
    const tempo = calcularTempoExecutado(ciclo);
    const { error: cicloError } = await supabase
      .from("linha_branca_lavadora_ciclos")
      .update({
        status: "reprovado",
        resultado: "reprovado",
        tempo_executado_segundos: tempo,
        ultimo_inicio_em: null,
        concluido_em: nowIso(),
      })
      .eq("id", ciclo.id);
    if (cicloError) throw cicloError;

    await registrarEventoLavadora({
      cicloId: ciclo.id,
      osId,
      tipoEvento: "Produto condenado / scrap",
      detalhes: motivo.trim(),
      tempoExecutado: tempo,
      operador,
    });
  }

  const { error: execError } = await supabase.from("ordens_servico_execucao").insert({
    os_id: osId,
    area_execucao: ciclo?.etapa_teste === "pos_reparo" ? "Bancada de Testes" : "Triagem Lavadoras",
    tecnico: operador || null,
    dt_inicio: nowIso(),
    dt_fim: nowIso(),
    aprovado: false,
    condenado: true,
    motivo_condenacao: motivo.trim(),
    observacoes: motivo.trim(),
  });
  if (execError) throw execError;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Condenado",
      etapa_atual: "Scrap",
      area_destino: "Scrap",
      tecnico_responsavel: operador || null,
      aprovado_bancada: false,
    })
    .eq("id", osId);
  if (osError) throw osError;

  await criarLaudo({
    osId,
    tipo: "condenacao_scrap",
    titulo: "Laudo de condenação / Scrap",
    resumo: motivo.trim(),
    dados: { motivo: motivo.trim(), ciclo: ciclo || null },
    operador,
  });
  return true;
}

export async function concluirCicloLavadora(ciclo, operador) {
  if (!ciclo?.id || ciclo.status !== "em_ciclo") return ciclo;
  const alvo = Number(ciclo.duracao_alvo_segundos || DURACAO_CICLO_LAVADORA);
  if (calcularTempoExecutado(ciclo) < alvo) return ciclo;

  if (ciclo.erro_descricao || ciclo.erro_codigo || ciclo.erro_observacoes) {
    const { data, error } = await supabase
      .from("linha_branca_lavadora_ciclos")
      .update({
        status: "pausado_erro",
        tempo_executado_segundos: alvo,
        ultimo_inicio_em: null,
        pausado_em: nowIso(),
      })
      .eq("id", ciclo.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }

  let novoStatus = "concluido";
  if (ciclo.etapa_teste === "triagem" && Number(ciclo.numero_ciclo) === 1) {
    novoStatus = "aguardando_segundo";
  } else if (ciclo.etapa_teste === "triagem" && Number(ciclo.numero_ciclo) === 2) {
    novoStatus = "aguardando_higienizacao";
  } else if (ciclo.etapa_teste === "pos_reparo") {
    novoStatus = "aguardando_resultado";
  }

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: novoStatus,
      resultado: novoStatus === "aguardando_resultado" ? null : "aprovado",
      tempo_executado_segundos: alvo,
      ultimo_inicio_em: null,
      pausado_em: null,
      concluido_em: nowIso(),
    })
    .eq("id", ciclo.id)
    .eq("status", "em_ciclo")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (!data) return ciclo;

  const evento =
    novoStatus === "aguardando_segundo"
      ? "Primeiro ciclo concluído"
      : novoStatus === "aguardando_higienizacao"
        ? "Segundo ciclo concluído"
        : novoStatus === "aguardando_resultado"
          ? "Teste pós-reparo concluído"
          : "Ciclo concluído";
  await registrarEventoLavadora({
    cicloId: data.id,
    osId: data.os_id,
    tipoEvento: evento,
    detalhes: "25 minutos efetivos concluídos sem falhas.",
    tempoExecutado: alvo,
    operador: operador || data.operador,
  });

  if (novoStatus === "aguardando_higienizacao") {
    const { data: ciclos, error: ciclosError } = await supabase
      .from("linha_branca_lavadora_ciclos")
      .select("id, numero_ciclo, tempo_executado_segundos, iniciado_em, concluido_em, operador")
      .eq("os_id", data.os_id)
      .eq("etapa_teste", "triagem")
      .in("numero_ciclo", [1, 2])
      .order("numero_ciclo", { ascending: true });
    if (ciclosError) throw ciclosError;

    await criarLaudo({
      osId: data.os_id,
      tipo: "triagem_sem_falhas",
      titulo: "Laudo de Triagem - Lavadora aprovada sem falhas",
      resumo: "Produto performou sem problemas nos dois ciclos obrigatórios de lavagem.",
      dados: { ciclos: ciclos || [], conclusao: "Produto performou sem problemas nos dois ciclos de lavagem." },
      operador: operador || data.operador,
    });

    const { error: osError } = await supabase
      .from("ordens_servico")
      .update({
        status_atual: "Aprovado",
        etapa_atual: "Aprovado",
        area_destino: null,
        tecnico_triagem: operador || data.operador || null,
      })
      .eq("id", data.os_id);
    if (osError) throw osError;
  }

  return data;
}

export async function enviarTriagemParaHigienizacao(ciclo, operador) {
  if (!ciclo?.id || ciclo.status !== "aguardando_higienizacao" || Number(ciclo.numero_ciclo) !== 2) {
    throw new Error("A lavadora precisa concluir os dois ciclos antes de seguir para Higienização.");
  }

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({ status: "concluido", resultado: "aprovado" })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) throw error;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Limpeza",
      etapa_atual: "Limpeza",
      area_destino: "Limpeza",
      tecnico_triagem: operador || ciclo.operador || null,
    })
    .eq("id", ciclo.os_id);
  if (osError) throw osError;

  await registrarEventoLavadora({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Encaminhado para Higienização",
    detalhes: "Dois ciclos de triagem concluídos sem falhas. Laudo aprovado.",
    tempoExecutado: Number(ciclo.tempo_executado_segundos || DURACAO_CICLO_LAVADORA),
    operador,
  });
  return data;
}

export async function aprovarPosReparo(ciclo, operador, observacoes = "") {
  if (!ciclo?.id || ciclo.etapa_teste !== "pos_reparo" || ciclo.status !== "aguardando_resultado") {
    throw new Error("Conclua o ciclo pós-reparo antes de aprovar a lavadora.");
  }

  const historico = await fetchHistoricoLavadora(ciclo.os_id);
  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({ status: "concluido", resultado: "aprovado" })
    .eq("id", ciclo.id)
    .select("*")
    .single();
  if (error) throw error;

  await criarLaudo({
    osId: ciclo.os_id,
    tipo: "pos_reparo_aprovado",
    titulo: "Laudo Pós-Reparo - Lavadora aprovada",
    resumo: "Produto aprovado em ciclo de validação após reparo, com histórico técnico preservado.",
    dados: {
      ciclo_pos_reparo: data,
      ciclos_anteriores: historico.ciclos,
      reparos: historico.reparos,
      eventos: historico.eventos,
      observacoes: observacoes || null,
      conclusao: "Produto aprovado após reparo e liberado para Higienização.",
    },
    operador,
  });

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Limpeza",
      etapa_atual: "Limpeza",
      area_destino: "Limpeza",
      aprovado_bancada: true,
      obs_bancada: observacoes || "Aprovado no teste pós-reparo.",
      tecnico_bancada: operador || null,
    })
    .eq("id", ciclo.os_id);
  if (osError) throw osError;

  await registrarEventoLavadora({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Aprovado pós-reparo",
    detalhes: "Lavadora liberada para Higienização.",
    tempoExecutado: Number(ciclo.tempo_executado_segundos || DURACAO_CICLO_LAVADORA),
    operador,
  });
  return data;
}
