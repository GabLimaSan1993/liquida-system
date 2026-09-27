import { supabase } from "../lib/supabase.js";

const PAGE_SIZE = 1000;
const PROFILE_CHUNK = 200;
const PEDIDO_CHUNK = 200;

function isoInicioAno(ano) {
  return new Date(`${ano}-01-01T00:00:00-03:00`).toISOString();
}

function isoFimAno(ano) {
  return new Date(`${Number(ano) + 1}-01-01T00:00:00-03:00`).toISOString();
}

async function buscarPedidosFaturadosAno(ano) {
  const rows = [];
  const inicio = isoInicioAno(ano);
  const fim = isoFimAno(ano);

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("pedidos_b2c")
      .select([
        "id",
        "id_anymarket",
        "marketplace",
        "titulo_produto",
        "sku_produto",
        "grade_produto",
        "sku_alocado",
        "grade_alocada",
        "imei_alocado",
        "imei_bipado",
        "numero_nf",
        "faturado_em",
        "alocado_em",
        "alocado_por",
        "status",
        "status_anymarket",
      ].join(","))
      .not("faturado_em", "is", null)
      .gte("faturado_em", inicio)
      .lt("faturado_em", fim)
      .order("faturado_em", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function buscarAuditoriasPorJanela(ano) {
  const rows = [];
  const inicioAno = new Date(isoInicioAno(ano));
  const fimAno = new Date(isoFimAno(ano));

  // Margem para capturar alocações feitas antes do faturamento na virada do ano.
  inicioAno.setUTCDate(inicioAno.getUTCDate() - 45);
  fimAno.setUTCDate(fimAno.getUTCDate() + 7);

  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("fifo_auditoria")
      .select("id,pedido_id,id_anymarket,sku_buscado,grade_alvo,imei_escolhido,data_subinv_escolhido,posicao_escolhida,total_candidatos,origem,criado_por,criado_em")
      .gte("criado_em", inicioAno.toISOString())
      .lt("criado_em", fimAno.toISOString())
      .order("criado_em", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }

  return rows;
}

async function buscarAuditoriasFaltantes(pedidoIds) {
  if (!pedidoIds.length) return [];

  const rows = [];

  for (let i = 0; i < pedidoIds.length; i += PEDIDO_CHUNK) {
    const bloco = pedidoIds.slice(i, i + PEDIDO_CHUNK);
    const { data, error } = await supabase
      .from("fifo_auditoria")
      .select("id,pedido_id,id_anymarket,sku_buscado,grade_alvo,imei_escolhido,data_subinv_escolhido,posicao_escolhida,total_candidatos,origem,criado_por,criado_em")
      .in("pedido_id", bloco)
      .order("criado_em", { ascending: true });

    if (error) throw new Error(error.message);
    rows.push(...(data || []));
  }

  return rows;
}

async function buscarNomesUsuarios(ids) {
  const unicos = [...new Set(ids.filter(Boolean))];
  if (!unicos.length) return new Map();

  const mapa = new Map();

  for (let i = 0; i < unicos.length; i += PROFILE_CHUNK) {
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id,nome,email")
      .in("id", unicos.slice(i, i + PROFILE_CHUNK));

    if (error) throw new Error(error.message);

    for (const item of data || []) {
      mapa.set(item.id, item);
    }
  }

  return mapa;
}

function indexarAuditorias(rows) {
  const mapa = new Map();

  for (const item of rows) {
    if (!mapa.has(item.pedido_id)) mapa.set(item.pedido_id, []);
    mapa.get(item.pedido_id).push(item);
  }

  for (const lista of mapa.values()) {
    lista.sort((a, b) => new Date(b.criado_em) - new Date(a.criado_em));
  }

  return mapa;
}

function normalizarImei(value) {
  return String(value || "").trim();
}

function montarLinha(pedido, auditorias, usuarios) {
  const finalImei = normalizarImei(pedido.imei_bipado || pedido.imei_alocado);
  const lista = auditorias || [];

  const auditoriaFinal = finalImei
    ? lista.find((a) => normalizarImei(a.imei_escolhido) === finalImei)
    : null;

  const auditoriaContexto = auditoriaFinal || lista[0] || null;

  const posicaoFinal = auditoriaFinal?.posicao_escolhida ?? null;
  const auditavel = Boolean(auditoriaFinal && Number.isFinite(Number(posicaoFinal)));
  const fifoCorreto = auditavel && Number(posicaoFinal) === 1;
  const divergente = auditavel && Number(posicaoFinal) !== 1;

  const operadorId =
    auditoriaFinal?.criado_por ||
    auditoriaContexto?.criado_por ||
    pedido.alocado_por ||
    null;

  const operador = usuarios.get(operadorId);

  return {
    ...pedido,
    imei_faturado: finalImei || null,
    auditoria_id: auditoriaContexto?.id || null,
    auditoria_final_id: auditoriaFinal?.id || null,
    auditoria_em: auditoriaContexto?.criado_em || null,
    origem_fifo: auditoriaContexto?.origem || null,
    imei_auditado: auditoriaContexto?.imei_escolhido || null,
    data_subinv_auditada: auditoriaContexto?.data_subinv_escolhido || null,
    posicao_fifo: posicaoFinal,
    total_candidatos: auditoriaFinal?.total_candidatos ?? auditoriaContexto?.total_candidatos ?? null,
    auditavel,
    fifo_correto: fifoCorreto,
    divergente,
    sem_rastro_final: !auditavel,
    operador_id: operadorId,
    operador_nome: operador?.nome || null,
    operador_email: operador?.email || null,
    total_eventos_fifo: lista.length,
    teve_reescolha: lista.length > 1,
  };
}

export async function carregarAuditoriaFifoAno(ano) {
  const pedidos = await buscarPedidosFaturadosAno(ano);
  if (!pedidos.length) return [];

  let auditorias = await buscarAuditoriasPorJanela(ano);
  let mapaAuditorias = indexarAuditorias(auditorias);

  const faltantes = pedidos
    .filter((p) => !mapaAuditorias.has(p.id))
    .map((p) => p.id);

  if (faltantes.length) {
    const extras = await buscarAuditoriasFaltantes(faltantes);
    auditorias = [...auditorias, ...extras];
    mapaAuditorias = indexarAuditorias(auditorias);
  }

  const idsUsuarios = [
    ...pedidos.map((p) => p.alocado_por),
    ...auditorias.map((a) => a.criado_por),
  ];
  const usuarios = await buscarNomesUsuarios(idsUsuarios);

  return pedidos.map((pedido) =>
    montarLinha(
      pedido,
      mapaAuditorias.get(pedido.id) || [],
      usuarios
    )
  );
}

export async function buscarFilaAuditoriaFifo(auditoriaId) {
  if (!auditoriaId) return null;

  const { data, error } = await supabase
    .from("fifo_auditoria")
    .select("id,pedido_id,id_anymarket,imei_escolhido,posicao_escolhida,total_candidatos,candidatos,origem,criado_em")
    .eq("id", auditoriaId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  const candidatos = Array.isArray(data.candidatos)
    ? [...data.candidatos].sort(
        (a, b) => Number(a.posicao || 999999) - Number(b.posicao || 999999)
      )
    : [];

  return {
    ...data,
    candidatos,
    historico_truncado:
      Number(data.total_candidatos || 0) > candidatos.length,
  };
}
