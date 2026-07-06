import { supabase } from "../lib/supabase";

const GRADE_HIERARQUIA = {
  "like new":           1,
  "excelente":          2,
  "muito bom":          3,
  "bom":                4,
  "outlet":             5,
  "outlet bateria 70%": 5,
};

// Sufixo -CCx do SKU do anúncio indica a grade vendida.
// A triagem guarda só o SKU base (modelo), com a grade em coluna própria.
const CC_GRADE = {
  cc2: "Muito Bom",
  cc3: "Bom",
  cc4: "Outlet",
};

function normalizeGrade(grade) {
  if (!grade) return null;
  return grade.toLowerCase().trim();
}

function gradeOrdem(grade) {
  return GRADE_HIERARQUIA[normalizeGrade(grade)] ?? 99;
}

function gradeAceita(gradeDisponivel, gradePedido) {
  return gradeOrdem(gradeDisponivel) <= gradeOrdem(gradePedido);
}

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
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "aguardando_alocacao")
    .eq("status_anymarket", "Pago")
    .order("data_de_pagamento", { ascending: true });

  if (error) throw new Error(error.message);

  if (horaCorte) {
    const [hCorte, mCorte] = horaCorte.split(":").map(Number);
    return (data || []).filter(p => {
      if (!p.data_de_pagamento) return false;
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

  const pedidos = data || [];

  // Enriquece com local e voucher do estoque (para o picking saber onde buscar a peça).
  // Busca ao vivo na triagem pelo imei_alocado — reflete a localização atual da peça.
  const imeis = pedidos.map(p => p.imei_alocado).filter(Boolean);
  if (imeis.length) {
    const { data: estoque } = await supabase
      .from("assurant_triagem")
      .select("imei, local, voucher")
      .in("imei", imeis);
    const mapa = {};
    (estoque || []).forEach(e => { mapa[e.imei] = e; });
    pedidos.forEach(p => {
      const e = mapa[p.imei_alocado];
      p.local_estoque   = e?.local   || null;
      p.voucher_estoque = e?.voucher || null;
    });
  }

  return pedidos;
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
  // O SKU do anúncio vem como MODELO-CCx, onde -CCx codifica a grade vendida.
  // A triagem guarda só o MODELO base. Então: corta o -CCx para achar o modelo
  // no estoque, e usa o -CCx para definir a grade (mais confiável que o título).
  const skuRaw  = String(skuProduto || "").trim();
  const ccMatch = skuRaw.match(/-(CC\d+)$/i);
  const skuBase = skuRaw.replace(/-CC\d+$/i, "").trim();
  const ccCode  = ccMatch ? ccMatch[1].toLowerCase() : null;
  // Grade vem do código -CCx; sem código conhecido (ex.: sem sufixo), usa a grade do título.
  const gradeAlvo = (ccCode && CC_GRADE[ccCode]) ? CC_GRADE[ccCode] : gradePedido;

  const { data: disponiveis, error } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, grade, local, voucher")
    .eq("sku", skuBase)
    .eq("status_atual", "Produto disponível");

  if (error) throw new Error(error.message);
  if (!disponiveis?.length) return [];

  // Só grades aceitáveis: grade exata ou superior (nunca inferior à vendida)
  const imeisValidos = disponiveis.filter(item =>
    gradeAceita(item.grade, gradeAlvo)
  );

  if (!imeisValidos.length) return [];

  const imeisList = imeisValidos.map(i => i.imei);
  const { data: subinv } = await supabase
    .from("estoque_subinv")
    .select("imei, data_subinv")
    .in("imei", imeisList);

  const subinvMap = {};
  (subinv || []).forEach(s => { subinvMap[s.imei] = s.data_subinv; });

  // Distância de grade em relação ao pedido:
  //   0  = grade exata (prioridade máxima)
  //   >0 = grade superior (quanto menor, mais próxima da vendida — menos "desperdício")
  const ordemPedido = gradeOrdem(gradeAlvo);

  const ordenados = imeisValidos
    .map(item => ({
      ...item,
      data_subinv:     subinvMap[item.imei] || null,
      distancia_grade: ordemPedido - gradeOrdem(item.grade),
    }))
    .sort((a, b) => {
      // 1º) grade exata primeiro; só depois sobe para grades superiores, por proximidade
      if (a.distancia_grade !== b.distancia_grade) {
        return a.distancia_grade - b.distancia_grade;
      }
      // 2º) dentro da mesma grade, FIFO puro (subinventário mais antigo primeiro)
      if (!a.data_subinv && !b.data_subinv) return 0;
      if (!a.data_subinv) return 1;
      if (!b.data_subinv) return -1;
      return new Date(a.data_subinv) - new Date(b.data_subinv);
    });

  return ordenados;
}

// ── Verifica e cria grupos automaticamente ────────────────
async function verificarECriarGrupo(userId) {
  const TAMANHO = 20;

  // Busca pedidos alocados sem grupo
  const { data: semGrupo, error } = await supabase
    .from("pedidos_b2c")
    .select("id")
    .eq("status", "alocado")
    .is("grupo_id", null)
    .order("alocado_em", { ascending: true });

  if (error || !semGrupo?.length) return null;

  // Só cria grupo se tiver 20 ou mais
  if (semGrupo.length < TAMANHO) return null;

  // Pega os primeiros 20
  const lote = semGrupo.slice(0, TAMANHO);

  return await _criarGrupo(lote.map(p => p.id), userId);
}

async function _criarGrupo(pedidoIds, userId) {
  // Busca o próximo número de grupo
  const { data: ultimoGrupo } = await supabase
    .from("pedidos_b2c_grupos")
    .select("numero")
    .order("numero", { ascending: false })
    .limit(1)
    .single();

  const proximoNumero = (ultimoGrupo?.numero || 0) + 1;

  // Cria o grupo
  const { data: grupo, error: errGrupo } = await supabase
    .from("pedidos_b2c_grupos")
    .insert({
      numero:        proximoNumero,
      status:        "aberto",
      total_pedidos: pedidoIds.length,
      criado_por:    userId,
    })
    .select()
    .single();

  if (errGrupo) throw new Error(errGrupo.message);

  // Vincula os pedidos ao grupo e muda status para em_picking
  for (const id of pedidoIds) {
    await supabase
      .from("pedidos_b2c")
      .update({
        grupo_id:      grupo.id,
        status:        "em_picking",
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", id);
  }

  return grupo;
}

export async function alocarPedido(pedidoId, imei, sku, grade, userId) {
  // 1. Atualiza o pedido para alocado
  const { error: errPedido } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "alocado",
      imei_alocado:  imei,
      sku_alocado:   sku,
      grade_alocada: grade,
      alocado_em:    new Date().toISOString(),
      alocado_por:   userId,
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

  // 3. Verifica se formou grupo de 20
  const grupoFormado = await verificarECriarGrupo(userId);

  return { ok: true, grupoFormado };
}

// ── Fechar grupos pendentes (sobras < 20) ─────────────────
export async function fecharGruposPendentes(userId) {
  const { data: semGrupo, error } = await supabase
    .from("pedidos_b2c")
    .select("id")
    .eq("status", "alocado")
    .is("grupo_id", null)
    .order("alocado_em", { ascending: true });

  if (error) throw new Error(error.message);
  if (!semGrupo?.length) return null;

  return await _criarGrupo(semGrupo.map(p => p.id), userId);
}

// ══════════════════════════════════════════════════════════
// PICKING
// ══════════════════════════════════════════════════════════

export async function registrarBipagem(pedidoId, imeiDigitado, userId) {
  const imei = String(imeiDigitado).trim();

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
      status:        "embalado",
      imei_bipado:   imei,
      bipado_em:     new Date().toISOString(),
      bipado_por:    userId,
      embalado_em:   new Date().toISOString(),
      embalado_por:  userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);

  if (errUpdate) return { ok: false, erro: errUpdate.message };

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
  } else {
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
      status:         "em_analise",
      motivo_analise: motivo || "Não localizado",
      analise_em:     new Date().toISOString(),
      analise_por:    userId,
      atualizado_em:  new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

export async function resolverAnalise(pedidoId, novoImei, userId) {
  const { data: pedido } = await supabase
    .from("pedidos_b2c")
    .select("imei_alocado")
    .eq("id", pedidoId)
    .single();

  if (pedido?.imei_alocado) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Produto disponível" })
      .eq("imei", pedido.imei_alocado);
  }

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