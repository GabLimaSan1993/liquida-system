import { supabase } from "../lib/supabase";

// ── Hierarquia de grades (menor número = melhor) ──────────
const GRADE_HIERARQUIA = {
  "like new":           1,
  "excelente":          2,
  "muito bom":          3,
  "bom":                4,
  "outlet":             5,
  "outlet bateria 70%": 5,
};

function normalizeGrade(grade) {
  if (!grade) return null;
  return grade.toLowerCase().trim();
}

function gradeOrdem(grade) {
  return GRADE_HIERARQUIA[normalizeGrade(grade)] ?? 99;
}

// Retorna true se gradeDisponivel é igual ou melhor que gradePedido
function gradeAceita(gradeDisponivel, gradePedido) {
  return gradeOrdem(gradeDisponivel) <= gradeOrdem(gradePedido);
}

// ── Extrai grade do titulo_produto ────────────────────────
export function extrairGrade(tituloProduto) {
  if (!tituloProduto) return null;
  const partes = tituloProduto.split(" - ");
  if (partes.length < 2) return null;
  return partes[partes.length - 1].trim();
}

// ══════════════════════════════════════════════════════════
// LISTAGENS
// ══════════════════════════════════════════════════════════

export async function listarPedidosAguardandoAlocacao(horaCorte) {
  // Filtra pedidos pagos até a hora de corte
  // data_de_pagamento vem no formato "DD/MM/YYYY HH:MM:SS"
  let query = supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "aguardando_alocacao")
    .eq("status_anymarket", "Pago")
    .order("data_de_pagamento", { ascending: true });

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  // Filtra por hora de corte no frontend (data_de_pagamento é texto DD/MM/YYYY HH:MM:SS)
  if (horaCorte) {
    const [hCorte, mCorte] = horaCorte.split(":").map(Number);
    return (data || []).filter(p => {
      if (!p.data_de_pagamento) return false;
      // Extrai hora da string DD/MM/YYYY HH:MM:SS
      const match = p.data_de_pagamento.match(/(\d{2}):(\d{2}):\d{2}$/);
      if (!match) return false;
      const h = parseInt(match[1]);
      const m = parseInt(match[2]);
      return h < hCorte || (h === hCorte && m <= mCorte);
    });
  }

  return data || [];
}

export async function listarGruposPicking() {
  const { data, error } = await supabase
    .from("pedidos_b2c_grupos")
    .select("*")
    .in("status", ["aberto", "em_picking"])
    .order("criado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarPedidosGrupo(grupoId) {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("grupo_id", grupoId)
    .order("data_de_pagamento", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarPedidosEmAnalise() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "em_analise")
    .order("analise_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarPedidosEmbalagem() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "alocado")
    .order("alocado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarPedidosFaturamento() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "embalado")
    .order("embalado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarPedidosConcluidos() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "concluido")
    .order("faturado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ══════════════════════════════════════════════════════════
// ALOCAÇÃO FIFO
// ══════════════════════════════════════════════════════════

export async function buscarSugestaoFifo(skuProduto, gradePedido) {
  // 1. Busca IMEIs disponíveis na assurant_triagem com o SKU correto
  const { data: disponiveis, error } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, grade, local, voucher")
    .eq("sku", skuProduto)
    .eq("status_atual", "Produto disponível");

  if (error) throw new Error(error.message);
  if (!disponiveis?.length) return [];

  // 2. Filtra por grade igual ou superior
  const imeisValidos = disponiveis.filter(item =>
    gradeAceita(item.grade, gradePedido)
  );

  if (!imeisValidos.length) return [];

  // 3. Cruza com estoque_subinv para pegar data_subinv (FIFO)
  const imeisList = imeisValidos.map(i => i.imei);
  const { data: subinv } = await supabase
    .from("estoque_subinv")
    .select("imei, data_subinv")
    .in("imei", imeisList);

  const subinvMap = {};
  (subinv || []).forEach(s => { subinvMap[s.imei] = s.data_subinv; });

  // 4. Ordena por data_subinv ASC (mais antigo primeiro = FIFO)
  //    IMEIs sem data_subinv ficam por último
  const ordenados = imeisValidos
    .map(item => ({
      ...item,
      data_subinv: subinvMap[item.imei] || null,
    }))
    .sort((a, b) => {
      if (!a.data_subinv && !b.data_subinv) return 0;
      if (!a.data_subinv) return 1;
      if (!b.data_subinv) return -1;
      return new Date(a.data_subinv) - new Date(b.data_subinv);
    });

  return ordenados;
}

export async function alocarPedido(pedidoId, imei, sku, grade, userId) {
  // 1. Atualiza o pedido
  const { error: errPedido } = await supabase
    .from("pedidos_b2c")
    .update({
      status:       "alocado",
      imei_alocado: imei,
      sku_alocado:  sku,
      grade_alocada: grade,
      alocado_em:   new Date().toISOString(),
      alocado_por:  userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (errPedido) throw new Error(errPedido.message);

  // 2. Reserva o IMEI na assurant_triagem
  const { error: errTriagem } = await supabase
    .from("assurant_triagem")
    .update({ status_atual: "Reservado para pedido B2C" })
    .eq("imei", imei);
  if (errTriagem) throw new Error(errTriagem.message);

  return { ok: true };
}

export async function alocarLote(pedidos, userId) {
  // Aloca múltiplos pedidos de uma vez, evitando alocar o mesmo IMEI
  const imeisUsados = new Set();
  const resultados = [];

  for (const pedido of pedidos) {
    const sugestoes = await buscarSugestaoFifo(pedido.sku_produto, pedido.grade_produto);

    // Pega a primeira sugestão que não foi usada nesta rodada
    const sugestao = sugestoes.find(s => !imeisUsados.has(s.imei));

    if (!sugestao) {
      resultados.push({ pedidoId: pedido.id, ok: false, erro: "Sem estoque disponível" });
      continue;
    }

    try {
      await alocarPedido(pedido.id, sugestao.imei, sugestao.sku, sugestao.grade, userId);
      imeisUsados.add(sugestao.imei);
      resultados.push({ pedidoId: pedido.id, ok: true, imei: sugestao.imei });
    } catch (e) {
      resultados.push({ pedidoId: pedido.id, ok: false, erro: e.message });
    }
  }

  return resultados;
}

// ══════════════════════════════════════════════════════════
// GRUPOS DE PICKING
// ══════════════════════════════════════════════════════════

export async function criarGruposPicking(pedidosAlocados, userId) {
  // Agrupa os pedidos alocados em grupos de 20
  const TAMANHO_GRUPO = 20;
  const grupos = [];

  // Busca o último número de grupo para continuar a sequência
  const { data: ultimoGrupo } = await supabase
    .from("pedidos_b2c_grupos")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  let proximoNumero = (ultimoGrupo?.numero || 0) + 1;

  for (let i = 0; i < pedidosAlocados.length; i += TAMANHO_GRUPO) {
    const lote = pedidosAlocados.slice(i, i + TAMANHO_GRUPO);

    // Cria o grupo
    const { data: grupo, error: errGrupo } = await supabase
      .from("pedidos_b2c_grupos")
      .insert({
        numero:        proximoNumero,
        status:        "aberto",
        total_pedidos: lote.length,
        criado_por:    userId,
      })
      .select()
      .single();

    if (errGrupo) throw new Error(errGrupo.message);

    // Vincula os pedidos ao grupo
    const updates = lote.map(p => ({ id: p.id, grupo_id: grupo.id }));
    for (const upd of updates) {
      await supabase
        .from("pedidos_b2c")
        .update({ grupo_id: upd.grupo_id, status: "em_picking", atualizado_em: new Date().toISOString() })
        .eq("id", upd.id);
    }

    grupos.push({ ...grupo, pedidos: lote });
    proximoNumero++;
  }

  return grupos;
}

// ══════════════════════════════════════════════════════════
// PICKING
// ══════════════════════════════════════════════════════════

export async function registrarBipagem(pedidoId, imeiDigitado, userId) {
  const imei = String(imeiDigitado).trim();

  // Busca o pedido
  const { data: pedido, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("id", pedidoId)
    .single();

  if (error || !pedido) return { ok: false, erro: "Pedido não encontrado." };
  if (pedido.status === "embalado") return { ok: false, erro: "Pedido já bipado." };
  if (pedido.imei_alocado !== imei) {
    return { ok: false, erro: `IMEI incorreto. Esperado: ${pedido.imei_alocado}` };
  }

  const { error: errUpdate } = await supabase
    .from("pedidos_b2c")
    .update({
      status:       "embalado",
      imei_bipado:  imei,
      bipado_em:    new Date().toISOString(),
      bipado_por:   userId,
      embalado_em:  new Date().toISOString(),
      embalado_por: userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);

  if (errUpdate) return { ok: false, erro: errUpdate.message };

  // Verifica se o grupo foi concluído
  if (pedido.grupo_id) {
    await verificarConclusaoGrupo(pedido.grupo_id);
  }

  return { ok: true, pedido };
}

async function verificarConclusaoGrupo(grupoId) {
  const { data: pedidos } = await supabase
    .from("pedidos_b2c")
    .select("status")
    .eq("grupo_id", grupoId);

  const todos = pedidos || [];
  const concluidos = todos.filter(p =>
    ["embalado", "faturado", "concluido", "em_analise"].includes(p.status)
  ).length;

  if (concluidos >= todos.length) {
    await supabase
      .from("pedidos_b2c_grupos")
      .update({ status: "concluido" })
      .eq("id", grupoId);
  } else if (todos.some(p => p.status === "embalado")) {
    await supabase
      .from("pedidos_b2c_grupos")
      .update({ status: "em_picking" })
      .eq("id", grupoId);
  }
}

// ══════════════════════════════════════════════════════════
// EM ANÁLISE
// ══════════════════════════════════════════════════════════

export async function marcarNaoLocalizado(pedidoId, motivo, userId) {
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "em_analise",
      motivo_analise: motivo || "Não localizado",
      analise_em:    new Date().toISOString(),
      analise_por:   userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

export async function resolverAnalise(pedidoId, novoImei, userId) {
  // Busca o pedido para liberar o IMEI antigo
  const { data: pedido } = await supabase
    .from("pedidos_b2c")
    .select("imei_alocado")
    .eq("id", pedidoId)
    .single();

  // Libera o IMEI antigo
  if (pedido?.imei_alocado) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Produto disponível" })
      .eq("imei", pedido.imei_alocado);
  }

  // Reserva o novo IMEI
  if (novoImei) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Reservado para pedido B2C" })
      .eq("imei", novoImei);
  }

  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "em_picking",
      imei_alocado:  novoImei || pedido?.imei_alocado,
      resolvido_em:  new Date().toISOString(),
      resolvido_por: userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

// ══════════════════════════════════════════════════════════
// FATURAMENTO
// ══════════════════════════════════════════════════════════

export async function registrarNF(pedidoId, numeroNf, chaveNf, userId) {
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "faturado",
      numero_nf:     numeroNf,
      chave_nf:      chaveNf || null,
      faturado_em:   new Date().toISOString(),
      faturado_por:  userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

export async function concluirPedido(pedidoId) {
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "concluido",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

// ══════════════════════════════════════════════════════════
// KPIs
// ══════════════════════════════════════════════════════════

export async function buscarKpisPedidosB2C() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("status");
  if (error) throw new Error(error.message);

  const todos = data || [];
  return {
    total:               todos.length,
    aguardando_alocacao: todos.filter(p => p.status === "aguardando_alocacao").length,
    alocado:             todos.filter(p => p.status === "alocado").length,
    em_picking:          todos.filter(p => p.status === "em_picking").length,
    em_analise:          todos.filter(p => p.status === "em_analise").length,
    embalado:            todos.filter(p => p.status === "embalado").length,
    faturado:            todos.filter(p => p.status === "faturado").length,
    concluido:           todos.filter(p => p.status === "concluido").length,
  };
}