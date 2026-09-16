import { supabase } from "../lib/supabase.js";

export const DURACAO_CICLO_LAVADORA = 25 * 60;
export const POSICOES_BANCADA_LAVADORAS = Array.from(
  { length: 20 },
  (_, index) => String(index + 1).padStart(2, "0")
);

const STATUS_TRIAGEM = [
  "Recebido",
  "Aguardando triagem",
  "Em triagem",
];

const STATUS_CICLO_ATIVO = [
  "em_ciclo",
  "pausado",
  "pausado_erro",
];

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
  if (!String(esperado || "").trim() || !String(fisico || "").trim()) {
    return false;
  }

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

async function registrarEvento({
  cicloId,
  osId,
  tipoEvento,
  detalhes,
  tempoExecutado,
  operador,
}) {
  const { error } = await supabase
    .from("linha_branca_lavadora_eventos")
    .insert({
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
        .order("created_at", { ascending: false })
        .limit(250),
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

  const osComCicloAtivo = new Set(
    ciclosEnriquecidos
      .filter((ciclo) => STATUS_CICLO_ATIVO.includes(ciclo.status))
      .map((ciclo) => String(ciclo.os_id))
  );

  const aguardando = osList.filter(
    (os) =>
      STATUS_TRIAGEM.includes(os.status_atual) &&
      !osComCicloAtivo.has(String(os.id))
  );

  return {
    osList,
    aguardando,
    ciclos: ciclosEnriquecidos,
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

  if (os.marca) {
    query = query.ilike("marca", os.marca);
  }

  const { data, error } = await query;

  if (error) throw error;
  return data?.[0] || null;
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

export async function iniciarCicloLavadora({
  os,
  operador,
  validacaoProduto,
  posicao,
}) {
  if (!os?.id) throw new Error("OS inválida para iniciar o ciclo.");

  const { data: existentes, error: existentesError } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .select("id, os_id, tentativa, posicao, status")
    .or(`os_id.eq.${os.id},status.in.(${STATUS_CICLO_ATIVO.join(",")})`);

  if (existentesError) throw existentesError;

  const lista = existentes || [];
  const ativoDaOs = lista.find(
    (item) =>
      String(item.os_id) === String(os.id) &&
      STATUS_CICLO_ATIVO.includes(item.status)
  );

  if (ativoDaOs) {
    throw new Error("Esta OS já possui um ciclo ativo.");
  }

  const tentativasDaOs = lista.filter(
    (item) => String(item.os_id) === String(os.id)
  );

  const tentativa =
    tentativasDaOs.reduce(
      (maior, item) => Math.max(maior, Number(item.tentativa || 0)),
      0
    ) + 1;

  const ocupadas = new Set(
    lista
      .filter((item) => STATUS_CICLO_ATIVO.includes(item.status))
      .map((item) => String(item.posicao))
  );

  const posicaoEscolhida =
    posicao ||
    POSICOES_BANCADA_LAVADORAS.find((item) => !ocupadas.has(item));

  if (!posicaoEscolhida) {
    throw new Error("Não há posição de bancada disponível no momento.");
  }

  if (ocupadas.has(String(posicaoEscolhida))) {
    throw new Error(`A posição ${posicaoEscolhida} já está ocupada.`);
  }

  const instante = nowIso();

  const { data: ciclo, error: insertError } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .insert({
      os_id: os.id,
      tentativa,
      posicao: String(posicaoEscolhida),
      status: "em_ciclo",
      duracao_alvo_segundos: DURACAO_CICLO_LAVADORA,
      tempo_executado_segundos: 0,
      iniciado_em: instante,
      ultimo_inicio_em: instante,
      operador: operador || null,
      validacao_produto: validacaoProduto || {},
    })
    .select("*")
    .single();

  if (insertError) throw insertError;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Em triagem",
      etapa_atual: "Triagem",
      area_destino: "Triagem Lavadoras",
      tecnico_triagem: operador || null,
    })
    .eq("id", os.id);

  if (osError) throw osError;

  await registrarEvento({
    cicloId: ciclo.id,
    osId: os.id,
    tipoEvento: "Ciclo iniciado",
    detalhes: `Início do ciclo de lavagem (25:00) · Posição ${posicaoEscolhida}`,
    tempoExecutado: 0,
    operador,
  });

  return ciclo;
}

export async function pausarCicloLavadora(ciclo, operador, porErro = false) {
  if (!ciclo?.id) throw new Error("Ciclo inválido.");

  const tempoExecutado = calcularTempoExecutado(ciclo);
  const instante = nowIso();
  const novoStatus = porErro ? "pausado_erro" : "pausado";

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: novoStatus,
      tempo_executado_segundos: tempoExecutado,
      ultimo_inicio_em: null,
      pausado_em: instante,
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();

  if (error) throw error;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Em triagem",
      etapa_atual: "Triagem",
      area_destino: "Triagem Lavadoras",
    })
    .eq("id", ciclo.os_id);

  if (osError) throw osError;

  await registrarEvento({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: porErro ? "Parada por erro" : "Ciclo pausado",
    detalhes: porErro
      ? "Cronômetro interrompido para registro da falha."
      : "Pausa operacional do ciclo.",
    tempoExecutado,
    operador,
  });

  return data;
}

export async function registrarErroCicloLavadora({
  ciclo,
  tipoErro,
  codigoErro,
  observacoes,
  areaReparo,
  operador,
}) {
  if (!ciclo?.id) throw new Error("Ciclo inválido.");
  if (!tipoErro) throw new Error("Informe o tipo de erro.");

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      erro_tipo: tipoErro,
      erro_codigo: codigoErro || null,
      erro_observacoes: observacoes || null,
      area_reparo: areaReparo || null,
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();

  if (error) throw error;

  const detalhes = [
    tipoErro,
    codigoErro ? `Código ${codigoErro}` : null,
    observacoes || null,
  ]
    .filter(Boolean)
    .join(" · ");

  await registrarEvento({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Erro registrado",
    detalhes,
    tempoExecutado: Number(ciclo.tempo_executado_segundos || 0),
    operador,
  });

  return data;
}

export async function retomarCicloLavadora(ciclo, operador) {
  if (!ciclo?.id) throw new Error("Ciclo inválido.");

  if (!["pausado", "pausado_erro"].includes(ciclo.status)) {
    throw new Error("Este ciclo não está pausado.");
  }

  const instante = nowIso();

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: "em_ciclo",
      ultimo_inicio_em: instante,
      pausado_em: null,
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();

  if (error) throw error;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Em triagem",
      etapa_atual: "Triagem",
      area_destino: "Triagem Lavadoras",
    })
    .eq("id", ciclo.os_id);

  if (osError) throw osError;

  await registrarEvento({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Retomada do ciclo",
    detalhes: "Ciclo retomado após verificação.",
    tempoExecutado: Number(ciclo.tempo_executado_segundos || 0),
    operador,
  });

  return data;
}

async function registrarTriagemLavadora({
  osId,
  precisaReparo,
  areaReparo,
  operador,
  observacoes,
}) {
  const payload = {
    os_id: osId,
    tipo_produto: "Lavadoras",
    precisa_reparo: Boolean(precisaReparo),
    reparos_mecanicos:
      areaReparo === "Reparo Mecânico" ? ["CICLO DE LAVAGEM"] : [],
    reparos_eletricos:
      areaReparo === "Reparo Elétrico" ? ["CICLO DE LAVAGEM"] : [],
    reparos_esteticos:
      areaReparo === "Reparo Estético" ? ["CICLO DE LAVAGEM"] : [],
    observacoes_triagem: observacoes || null,
    triado_por: operador || null,
  };

  const { error } = await supabase
    .from("linha_branca_triagens")
    .insert(payload);

  if (error) throw error;
}

export async function enviarCicloParaReparo({
  ciclo,
  areaReparo,
  operador,
}) {
  if (!ciclo?.id) throw new Error("Ciclo inválido.");
  if (!areaReparo) throw new Error("Selecione a área de reparo.");

  const tempoExecutado = calcularTempoExecutado(ciclo);
  const instante = nowIso();

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: "enviado_reparo",
      tempo_executado_segundos: tempoExecutado,
      ultimo_inicio_em: null,
      concluido_em: instante,
      area_reparo: areaReparo,
    })
    .eq("id", ciclo.id)
    .select("*")
    .single();

  if (error) throw error;

  const observacoes = [
    `Ciclo interrompido aos ${tempoExecutado}s.`,
    ciclo.erro_tipo ? `Erro: ${ciclo.erro_tipo}.` : null,
    ciclo.erro_codigo ? `Código: ${ciclo.erro_codigo}.` : null,
    ciclo.erro_observacoes || null,
  ]
    .filter(Boolean)
    .join(" ");

  await registrarTriagemLavadora({
    osId: ciclo.os_id,
    precisaReparo: true,
    areaReparo,
    operador,
    observacoes,
  });

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Triado",
      etapa_atual: areaReparo,
      area_destino: areaReparo,
      areas_reparo: [areaReparo],
      areas_concluidas: [],
      tecnico_triagem: operador || null,
    })
    .eq("id", ciclo.os_id);

  if (osError) throw osError;

  await registrarEvento({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Encaminhado para reparo",
    detalhes: areaReparo,
    tempoExecutado,
    operador,
  });

  return data;
}

export async function concluirCicloLavadora(ciclo, operador) {
  if (!ciclo?.id || ciclo.status !== "em_ciclo") return ciclo;

  const tempoExecutado = calcularTempoExecutado(ciclo);
  const alvo = Number(ciclo.duracao_alvo_segundos || DURACAO_CICLO_LAVADORA);

  if (tempoExecutado < alvo) return ciclo;

  const instante = nowIso();

  const { data, error } = await supabase
    .from("linha_branca_lavadora_ciclos")
    .update({
      status: "concluido",
      tempo_executado_segundos: alvo,
      ultimo_inicio_em: null,
      pausado_em: null,
      concluido_em: instante,
    })
    .eq("id", ciclo.id)
    .eq("status", "em_ciclo")
    .select("*")
    .maybeSingle();

  if (error) throw error;
  if (!data) return ciclo;

  await registrarTriagemLavadora({
    osId: ciclo.os_id,
    precisaReparo: false,
    areaReparo: null,
    operador,
    observacoes: "Ciclo de lavagem concluído com 25 minutos efetivos e sem falha impeditiva.",
  });

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Aprovado",
      etapa_atual: "Aprovado",
      area_destino: null,
      tecnico_triagem: operador || ciclo.operador || null,
    })
    .eq("id", ciclo.os_id);

  if (osError) throw osError;

  await registrarEvento({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Ciclo concluído",
    detalhes: "25 minutos efetivos cumpridos.",
    tempoExecutado: alvo,
    operador: operador || ciclo.operador,
  });

  return data;
}

export async function encaminharLavadoraParaBancada(ciclo, operador) {
  if (!ciclo?.id || ciclo.status !== "concluido") {
    throw new Error("Somente ciclos concluídos podem avançar para a bancada.");
  }

  const { error } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: "Bancada de Testes",
      etapa_atual: "Bancada de Testes",
      area_destino: "Bancada de Testes",
    })
    .eq("id", ciclo.os_id);

  if (error) throw error;

  await registrarEvento({
    cicloId: ciclo.id,
    osId: ciclo.os_id,
    tipoEvento: "Encaminhado para bancada",
    detalhes: "Triagem aprovada; OS liberada para a próxima etapa.",
    tempoExecutado: Number(ciclo.tempo_executado_segundos || DURACAO_CICLO_LAVADORA),
    operador,
  });

  return true;
}
