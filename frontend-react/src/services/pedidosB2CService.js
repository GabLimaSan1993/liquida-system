import { supabase } from "../lib/supabase";
import * as XLSX from "xlsx";

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

// Faixas de saúde de bateria (valores da coluna status_bateria, já normalizados p/ minúsculo).
// Outlet é definido pela bateria entre 70 e 79%.
const BATERIA_OUTLET = "saúde da bateria entre 70 e 79%";
// Faixas que NÃO servem para um pedido não-Outlet (Outlet ou pior).
// Tudo que não estiver aqui (80%+, 80–85%, 85%+ e sem info/null) é aceito.
const BATERIA_RUINS_NAO_OUTLET = [
  "saúde da bateria entre 70 e 79%",
  "saúde da bateria abaixo 70%",
  "saúde da bateria abaixo de 80%",
];

// Status da triagem em que a peça está fisicamente no armazém e pode ser alocada.
// "Finalizado" (já vendida/expedida) e os "Reservado para..." ficam de fora de propósito.
const STATUS_ALOCAVEIS = [
  "Produto disponível",
  "Em processo de devolução Agd RI",
  "Aguardando alocação",
  "Aguardando oracle",
];

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

  const grupos = data || [];
  if (!grupos.length) return [];

  // Descobre o marketplace de cada grupo pelos pedidos (todos do mesmo marketplace agora)
  const ids = grupos.map(g => g.id);
  const { data: pedidos } = await supabase
    .from("pedidos_b2c")
    .select("grupo_id, marketplace")
    .in("grupo_id", ids);

  const mpPorGrupo = {};
  (pedidos || []).forEach(p => {
    if (!mpPorGrupo[p.grupo_id]) mpPorGrupo[p.grupo_id] = new Set();
    mpPorGrupo[p.grupo_id].add(p.marketplace || "—");
  });

  return grupos.map(g => {
    const mps = mpPorGrupo[g.id] ? Array.from(mpPorGrupo[g.id]) : [];
    const marketplace = mps.length === 1 ? mps[0] : (mps.length > 1 ? "Vários" : null);
    return { ...g, marketplace };
  });
}

// ── Trava de separação (picking) ─────────────────────
// Quando um usuário abre um grupo para separar, o grupo é reservado para ele.
// Ninguém mais consegue abrir até concluir (libera automática) ou o master destravar.

// Tenta reservar o grupo para o usuário. Reserva atômica: só grava se estiver livre
// (picking_por is null) OU se já for do próprio usuário (reabrindo). Se estiver com
// outro, retorna bloqueado com o nome de quem está separando.
export async function reservarGrupoPicking(grupoId, userId, userNome) {
  const { data: grupo } = await supabase
    .from("pedidos_b2c_grupos")
    .select("picking_por, picking_por_nome, picking_em")
    .eq("id", grupoId)
    .single();

  if (grupo?.picking_por && grupo.picking_por === userId) {
    return { ok: true, ja_era_seu: true };
  }

  if (grupo?.picking_por && grupo.picking_por !== userId) {
    return {
      ok: false,
      bloqueado: true,
      por: grupo.picking_por_nome || "outro operador",
      em: grupo.picking_em,
    };
  }

  const { data: reservado } = await supabase
    .from("pedidos_b2c_grupos")
    .update({ picking_por: userId, picking_por_nome: userNome || "Operador", picking_em: new Date().toISOString() })
    .eq("id", grupoId)
    .is("picking_por", null)
    .select("picking_por");

  if (reservado && reservado.length > 0) {
    return { ok: true };
  }

  const { data: dono } = await supabase
    .from("pedidos_b2c_grupos")
    .select("picking_por, picking_por_nome, picking_em")
    .eq("id", grupoId)
    .single();
  if (dono?.picking_por && dono.picking_por !== userId) {
    return { ok: false, bloqueado: true, por: dono.picking_por_nome || "outro operador", em: dono.picking_em };
  }
  return { ok: true };
}

// Libera a trava do picking (master destravando um grupo preso).
// Só solta a reserva — não bipa nada nem muda status de pedido.
export async function liberarTravaPicking(grupoId) {
  const { error } = await supabase
    .from("pedidos_b2c_grupos")
    .update({ picking_por: null, picking_por_nome: null, picking_em: null })
    .eq("id", grupoId);
  if (error) throw new Error(error.message);
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
      .select("imei, local, voucher, criado_em")
      .in("imei", imeis);

    // Um IMEI pode ter várias passagens (ex.: venda + devolução DEV...). Fica a passagem
    // MAIS RECENTE que tenha local preenchido; se nenhuma tiver, a mais recente de todas.
    // (Sem isso, o mapa ficava com uma linha qualquer — às vezes a antiga sem local.)
    const mapa = {};
    (estoque || []).forEach(e => {
      const atual = mapa[e.imei];
      if (!atual) { mapa[e.imei] = e; return; }
      const eTemLocal     = !!(e.local && String(e.local).trim());
      const atualTemLocal = !!(atual.local && String(atual.local).trim());
      // Prefere quem tem local; entre os dois, o mais recente
      if (eTemLocal !== atualTemLocal) {
        if (eTemLocal) mapa[e.imei] = e;
      } else if (new Date(e.criado_em) > new Date(atual.criado_em)) {
        mapa[e.imei] = e;
      }
    });

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

// Alguns anúncios usam o SKU da Assurant (BZ661-xxxxx) em vez do SKU ALS (BRZDEVxxxxx),
// que é o que a triagem guarda. A tabela sku_de_para traduz um no outro.
async function traduzirSku(skuBase) {
  if (!skuBase || skuBase.startsWith("BRZDEV")) return skuBase;
  const { data } = await supabase
    .from("sku_de_para")
    .select("sku_als")
    .eq("sku_assurant", skuBase)
    .maybeSingle();
  return data?.sku_als || skuBase;
}

export async function buscarSugestaoFifo(skuProduto, gradePedido) {
  // O SKU do anúncio vem como MODELO-CCx, onde -CCx codifica a grade vendida.
  // A triagem guarda só o MODELO base. Então: corta o -CCx para achar o modelo
  // no estoque, e usa o -CCx para definir a grade (mais confiável que o título).
  const skuRaw  = String(skuProduto || "").trim();
  const ccMatch = skuRaw.match(/-(CC\d+)$/i);
  const skuSemCC = skuRaw.replace(/-CC\d+$/i, "").trim();
  const ccCode  = ccMatch ? ccMatch[1].toLowerCase() : null;
  // Grade vem do código -CCx; sem código conhecido (ex.: sem sufixo), usa a grade do título.
  const gradeAlvo = (ccCode && CC_GRADE[ccCode]) ? CC_GRADE[ccCode] : gradePedido;

  // Outlet (CC4) não é uma grade física: é definido pela bateria.
  // Regra: apenas aparelhos de grade Bom ou superior COM bateria entre 70 e 79%.
  const ehOutlet = normalizeGrade(gradeAlvo) === "outlet";

  // Traduz o SKU da Assurant para o SKU ALS, quando for o caso.
  const skuBase = await traduzirSku(skuSemCC);

  const { data: encontrados, error } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, grade, local, voucher, status_atual, status_bateria, criado_em")
    .eq("sku", skuBase)
    .in("status_atual", STATUS_ALOCAVEIS);

  if (error) throw new Error(error.message);
  if (!encontrados?.length) return [];

  // Um IMEI pode ter mais de uma passagem pela triagem (ex.: venda + devolução).
  // Fica a linha mais recente, que é o registro atual da peça — evita sugerir a mesma duas vezes.
  const porImei = new Map();
  for (const item of encontrados) {
    const atual = porImei.get(item.imei);
    if (!atual || new Date(item.criado_em) > new Date(atual.criado_em)) {
      porImei.set(item.imei, item);
    }
  }
  const disponiveis = Array.from(porImei.values());

  // Filtro de elegibilidade:
  // - Outlet (CC4): grade Bom ou superior E bateria entre 70 e 79%.
  //   "Bom" tem ordem 4; "Bom ou superior" = ordem <= 4. Regular e Quebrado ficam de fora.
  // - Não-Outlet: grade igual ou superior à vendida E bateria que NÃO seja Outlet nem pior
  //   (exclui 70–79%, abaixo 70% e abaixo de 80%). Aceita 80%+, 80–85%, 85%+ e sem info (null).
  //   Isso impede que um aparelho Outlet (70–79%) seja sugerido para um pedido que não é Outlet.
  const imeisValidos = disponiveis.filter(item => itemElegivel(item, ehOutlet, gradeAlvo));

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

  // O FIFO só SUGERE aparelhos que estão fisicamente no armazém (WH2): precisam ter
  //   (1) local preenchido — a garantia do Gaia de que o aparelho está no armazém, e
  //   (2) data_subinv — a âncora de antiguidade para o FIFO.
  // Sem local OU sem subinv, o aparelho é pulado (o pedido segue com o próximo elegível).
  // (Os pulados não somem do controle — aparecem na aba Comparativo Aging à parte.)
  const temLocal = (item) => !!(item.local && String(item.local).trim());
  const ordenados = imeisValidos
    .map(item => ({
      ...item,
      data_subinv:     subinvMap[item.imei] || null,
      distancia_grade: ordemPedido - gradeOrdem(item.grade),
    }))
    .filter(item => item.data_subinv && temLocal(item))
    .sort((a, b) => {
      // Outlet mistura grades de propósito (Bom pra cima), então não prioriza grade:
      // é FIFO puro entre os elegíveis. Nos demais casos, grade mais próxima primeiro.
      if (!ehOutlet && a.distancia_grade !== b.distancia_grade) {
        return a.distancia_grade - b.distancia_grade;
      }
      // FIFO: subinventário mais antigo primeiro (todos têm subinv aqui)
      return new Date(a.data_subinv) - new Date(b.data_subinv);
    });

  return ordenados;
}

// Aplica a MESMA regra de elegibilidade do FIFO (grade + bateria) a um item de estoque,
// dado se o pedido é Outlet e a grade alvo. Reaproveitada pela sugestão e pelo comparativo.
function itemElegivel(item, ehOutlet, gradeAlvo) {
  const bateria = normalizeGrade(item.status_bateria);
  if (ehOutlet) {
    return bateria === BATERIA_OUTLET && gradeOrdem(item.grade) <= gradeOrdem("Bom");
  }
  const bateriaImprestavel = BATERIA_RUINS_NAO_OUTLET.includes(bateria);
  return gradeAceita(item.grade, gradeAlvo) && !bateriaImprestavel;
}

// ══════════════════════════════════════════════════════════
// COMPARATIVO DE AGING (aparelhos sem subinv que o FIFO não sugere)
// ══════════════════════════════════════════════════════════
//
// Para cada pedido, compara o aparelho que o FIFO SELECIONA (mais antigo COM subinv)
// contra a ALTERNATIVA mais velha que existe SEM subinv (usando a coluna `aging` da triagem
// como referência de idade). Só entram pedidos que têm ao menos uma alternativa sem subinv.
//
// IMPORTANTE: idade do selecionado = dias desde data_subinv; idade da alternativa = coluna aging.
// São fontes diferentes (subinv conta desde o Oracle; aging desde o recebimento), então a
// comparação é APROXIMADA. Só destacamos como "mais velha" quando a diferença passa da margem.
const MARGEM_AGING_DIAS = 30;

export async function buscarComparativoAging() {
  // 1. Todos os pedidos (o comparativo cobre a base inteira, não só aguardando alocação)
  const { data: pedidos, error: errPed } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, sku_produto, grade_produto, titulo_produto, status, imei_alocado");
  if (errPed) throw new Error(errPed.message);
  if (!pedidos?.length) return [];

  // 2. Estoque alocável inteiro, com aging, em um só fetch (evita N consultas por SKU)
  const { data: triagem, error: errTri } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, grade, local, status_atual, status_bateria, aging, criado_em")
    .in("status_atual", STATUS_ALOCAVEIS);
  if (errTri) throw new Error(errTri.message);

  // Dedupe por IMEI: fica a passagem mais recente (mesma regra do FIFO)
  const porImei = new Map();
  for (const item of (triagem || [])) {
    const atual = porImei.get(item.imei);
    if (!atual || new Date(item.criado_em) > new Date(atual.criado_em)) {
      porImei.set(item.imei, item);
    }
  }
  const estoque = Array.from(porImei.values());

  // Indexa o estoque por SKU para busca rápida por pedido
  const estoquePorSku = {};
  for (const item of estoque) {
    (estoquePorSku[item.sku] ||= []).push(item);
  }// 3. Subinv de todos os IMEIs do estoque, em um fetch
  const todosImeis = estoque.map(i => i.imei);
  const subinvMap = {};
  // O .in() tem limite prático de itens; fatia em blocos de 1000
  for (let i = 0; i < todosImeis.length; i += 1000) {
    const bloco = todosImeis.slice(i, i + 1000);
    const { data: sub } = await supabase
      .from("estoque_subinv").select("imei, data_subinv").in("imei", bloco);
    (sub || []).forEach(s => { subinvMap[s.imei] = s.data_subinv; });
  }

  const hoje = new Date();
  const diasDesde = (dataStr) => {
    if (!dataStr) return null;
    const d = new Date(dataStr);
    return Math.floor((hoje - d) / 86400000);
  };
  const agingNum = (a) => {
    if (a == null) return null;
    const n = parseInt(String(a).trim(), 10);
    return Number.isFinite(n) ? n : null;
  };

  const linhas = [];

  for (const p of pedidos) {
    // Resolve grade alvo e SKU base igual ao FIFO
    const skuRaw = String(p.sku_produto || "").trim();
    const ccMatch = skuRaw.match(/-(CC\d+)$/i);
    const skuSemCC = skuRaw.replace(/-CC\d+$/i, "").trim();
    const ccCode = ccMatch ? ccMatch[1].toLowerCase() : null;
    const gradeAlvo = (ccCode && CC_GRADE[ccCode]) ? CC_GRADE[ccCode] : p.grade_produto;
    const ehOutlet = normalizeGrade(gradeAlvo) === "outlet";
    const skuBase = await traduzirSku(skuSemCC);

    const candidatos = (estoquePorSku[skuBase] || [])
      .filter(item => itemElegivel(item, ehOutlet, gradeAlvo));
    if (!candidatos.length) continue;

    // Selecionado = o que o FIFO sugeriria: mais antigo COM subinv E com local (armazém/Gaia)
    const temLocalCmp = (c) => !!(c.local && String(c.local).trim());
    const comSubinv = candidatos
      .map(c => ({ ...c, data_subinv: subinvMap[c.imei] || null }))
      .filter(c => c.data_subinv && temLocalCmp(c))
      .sort((a, b) => new Date(a.data_subinv) - new Date(b.data_subinv));

    // Alternativas = elegíveis SEM subinv, ordenadas pela mais velha (maior aging)
    const semSubinv = candidatos
      .filter(c => !subinvMap[c.imei])
      .map(c => ({ ...c, aging_dias: agingNum(c.aging) }))
      .filter(c => c.aging_dias != null)
      .sort((a, b) => b.aging_dias - a.aging_dias);

    if (!semSubinv.length) continue; // só pedidos que têm alternativa sem subinv

    const selecionado = comSubinv[0] || null;
    const alternativa = semSubinv[0];
    const idadeSelecionado = selecionado ? diasDesde(selecionado.data_subinv) : null;
    const idadeAlternativa = alternativa.aging_dias;
    const diff = (idadeSelecionado != null) ? (idadeAlternativa - idadeSelecionado) : null;

    linhas.push({
      pedido: p.id_anymarket,
      status: p.status,
      sku: p.sku_produto,
      grade_alvo: gradeAlvo,
      sel_imei: selecionado?.imei || null,
      sel_grade: selecionado?.grade || null,
      sel_subinv: selecionado?.data_subinv || null,
      sel_idade: idadeSelecionado,
      alt_imei: alternativa.imei,
      alt_grade: alternativa.grade,
      alt_local: alternativa.local,
      alt_aging: idadeAlternativa,
      diff_dias: diff,
      // "mais velha" só quando passa da margem (evita ruído entre as duas fontes de data)
      alerta: (diff != null && diff >= MARGEM_AGING_DIAS),
    });
  }

  // Ordena: alertas primeiro, depois pela maior diferença
  linhas.sort((a, b) => {
    if (a.alerta !== b.alerta) return a.alerta ? -1 : 1;
    return (b.diff_dias ?? -1e9) - (a.diff_dias ?? -1e9);
  });

  return linhas;
}

// ── Verifica e cria grupos automaticamente ────────────────
async function verificarECriarGrupo(userId) {
  const TAMANHO = 20;

  // Busca pedidos alocados sem grupo, com o marketplace (para agrupar por marketplace)
  const { data: semGrupo, error } = await supabase
    .from("pedidos_b2c")
    .select("id, marketplace")
    .eq("status", "alocado")
    .is("grupo_id", null)
    .order("alocado_em", { ascending: true });

  if (error || !semGrupo?.length) return null;

  // Agrupa por marketplace, preservando a ordem de alocação (FIFO)
  const porMarketplace = {};
  for (const p of semGrupo) {
    const mp = p.marketplace || "—";
    (porMarketplace[mp] ||= []).push(p.id);
  }

  // Fecha automaticamente o primeiro marketplace que atingir 20 pedidos
  for (const [mp, ids] of Object.entries(porMarketplace)) {
    if (ids.length >= TAMANHO) {
      return await _criarGrupo(ids.slice(0, TAMANHO), userId);
    }
  }

  return null;
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

// ── Fechar grupos pendentes (sobras) — um grupo por marketplace ──
export async function fecharGruposPendentes(userId) {
  const { data: semGrupo, error } = await supabase
    .from("pedidos_b2c")
    .select("id, marketplace")
    .eq("status", "alocado")
    .is("grupo_id", null)
    .order("alocado_em", { ascending: true });

  if (error) throw new Error(error.message);
  if (!semGrupo?.length) return null;

  // Agrupa por marketplace e fecha um grupo para cada marketplace (mesmo com < 20)
  const porMarketplace = {};
  for (const p of semGrupo) {
    const mp = p.marketplace || "—";
    (porMarketplace[mp] ||= []).push(p.id);
  }

  const grupos = [];
  for (const ids of Object.values(porMarketplace)) {
    const grupo = await _criarGrupo(ids, userId);
    if (grupo) grupos.push(grupo);
  }

  // Retorna o primeiro grupo e quantos foram criados (um por marketplace)
  if (!grupos.length) return null;
  return { ...grupos[0], gruposCriados: grupos.length };
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
    // Grupo concluído: fecha e libera a trava de picking automaticamente.
    await supabase
      .from("pedidos_b2c_grupos")
      .update({ status: "concluido", picking_por: null, picking_por_nome: null, picking_em: null })
      .eq("id", grupoId);
  } else {
    // Reabriu no picking: limpa a trava de faturamento (fica livre de novo quando voltar).
    await supabase
      .from("pedidos_b2c_grupos")
      .update({ status: "em_picking", baixado_por: null, baixado_por_nome: null, baixado_em: null })
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

// Picking — "Não localizado" com busca automática de segunda opção.
// 1. Manda o IMEI não encontrado para "Em análise de estoque" (sai do estoque sugerível).
// 2. Busca o próximo IMEI do FIFO para o mesmo pedido (excluindo o antigo).
// 3. Se achar: reserva o novo e o pedido segue no grupo apontando para ele.
//    Se não achar: manda o pedido para análise (fluxo atual).
// Retorna { trocado: true, novoImei, local } | { trocado: false } (foi para análise).
export async function naoLocalizadoBuscarProximo(pedido, userId) {
  const imeiAntigo = pedido.imei_alocado;

  // 1. IMEI antigo vai para análise de estoque (não some, mas sai do FIFO até verificação)
  if (imeiAntigo) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Em análise de estoque" })
      .eq("imei", imeiAntigo);
  }

  // 2. Busca a próxima sugestão FIFO para o mesmo produto (o antigo já saiu dos alocáveis)
  const sugestoes = await buscarSugestaoFifo(pedido.sku_produto, pedido.grade_produto);
  // Exclui por segurança o próprio antigo (caso ainda apareça) e qualquer já reservado
  const proximo = (sugestoes || []).find(s => s.imei !== imeiAntigo);

  if (proximo) {
    // 3a. Reserva o novo IMEI e aponta o pedido para ele — segue no mesmo grupo
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Reservado para pedido B2C" })
      .eq("imei", proximo.imei);

    await supabase
      .from("pedidos_b2c")
      .update({
        imei_alocado:  proximo.imei,
        sku_alocado:   proximo.sku,
        grade_alocada: proximo.grade,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", pedido.id);

    return { trocado: true, novoImei: proximo.imei, local: proximo.local, grade: proximo.grade };
  }

  // 3b. Sem segunda opção: manda o pedido para análise (fluxo atual)
  await marcarNaoLocalizado(pedido.id, "Não localizado (sem segunda opção no FIFO)", userId);
  return { trocado: false };
}

export async function resolverAnalise(pedidoId, novoImei, userId) {
  const { data: pedido } = await supabase
    .from("pedidos_b2c")
    .select("imei_alocado, grupo_id")
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

  // Voltou para picking: recalcula o status do grupo (reabre no picking se estava fechado)
  if (pedido?.grupo_id) await verificarConclusaoGrupo(pedido.grupo_id);
}

// ══════════════════════════════════════════════════════════
// AGUARDANDO DEFINIÇÃO DE PRODUTO
// ══════════════════════════════════════════════════════════
// Quando o FIFO não encontra nenhum aparelho para um pedido, ele não vai para
// separação manual: gera um PDF com os dados do pedido (para a Assurant indicar um
// substituto) e fica em "aguardando_definicao_produto" até alguém devolvê-lo ao fluxo.

export async function listarPedidosAguardandoDefinicao() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("status", "aguardando_definicao_produto")
    .order("definicao_solicitada_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// Move o pedido para "aguardando_definicao_produto" (sem alocar nada).
export async function marcarSemProduto(pedidoId, userId) {
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:                  "aguardando_definicao_produto",
      definicao_solicitada_em: new Date().toISOString(),
      definicao_solicitada_por: userId,
      atualizado_em:           new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

// Devolve o pedido para o fluxo normal de alocação (quando a Assurant já definiu o substituto).
export async function voltarParaAlocacao(pedidoId) {
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "aguardando_alocacao",
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
}

// Gera o PDF de solicitação de produto substituto — só dados do pedido e o que precisa.
// Mesmo padrão visual dos outros PDFs do sistema (cabeçalho roxo da marca).
export async function gerarPdfSemProduto(pedido) {
  const { default: jsPDF } = await import("jspdf");
  await import("jspdf-autotable");

  const doc  = new jsPDF();
  const roxo = [127, 45, 146];
  const larg = doc.internal.pageSize.getWidth();

  // Cabeçalho roxo
  doc.setFillColor(roxo[0], roxo[1], roxo[2]);
  doc.rect(0, 0, larg, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text("Solicitação de produto substituto", 14, 13);
  doc.setFontSize(10);
  doc.text("Liquida System · Assurant", 14, 21);

  doc.setTextColor(60, 60, 60);
  doc.setFontSize(9);
  doc.text(`Gerado em ${new Date().toLocaleString("pt-BR")}`, 14, 36);

  // Dados do pedido
  doc.autoTable({
    startY: 42,
    head: [["Dados do pedido", ""]],
    body: [
      ["Pedido (marketplace)", String(pedido.id_anymarket ?? "—")],
      ["Marketplace",          pedido.marketplace || "—"],
      ["Data do pedido",       pedido.data_pedido || pedido.data_de_pagamento || "—"],
      ["Cliente",              pedido.cliente || "—"],
      ["CPF/CNPJ",             pedido.cpf_cnpj || "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: roxo, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });

  // O que precisa
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: [["Produto necessário", ""]],
    body: [
      ["SKU do anúncio", pedido.sku_produto || "—"],
      ["Título",         pedido.titulo_produto || "—"],
      ["Grade pedida",   pedido.grade_produto || "—"],
      ["Valor",          pedido.total_do_pedido != null ? `R$ ${Number(pedido.total_do_pedido).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"],
    ],
    theme: "grid",
    headStyles: { fillColor: roxo, textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 3 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });

  // Campo para a Assurant preencher o aparelho substituto
  doc.autoTable({
    startY: doc.lastAutoTable.finalY + 6,
    head: [["Aparelho substituto (preenchimento Assurant)", ""]],
    body: [
      ["IMEI substituto", "                                        "],
      ["Grade",           "                                        "],
      ["Observações",     "                                        "],
    ],
    theme: "grid",
    headStyles: { fillColor: [90, 90, 90], textColor: 255, fontStyle: "bold" },
    styles: { fontSize: 10, cellPadding: 5, minCellHeight: 12 },
    columnStyles: { 0: { fontStyle: "bold", cellWidth: 55 } },
  });

  doc.save(`sem_produto_pedido_${pedido.id_anymarket}.pdf`);
}// ══════════════════════════════════════════════════════════
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
// FATURAMENTO POR GRUPO (planilha)
// ══════════════════════════════════════════════════════════

// Lista os grupos com picking concluído e faturamento ainda pendente,
// com contagem de quantos estão a faturar (embalado) e em análise.
export async function listarGruposFaturamento() {
  // Antes exigia grupo status='concluido' (todos bipados/analisados). Agora mostra qualquer
  // grupo ainda não faturado que tenha ao menos um pedido EMBALADO pronto — os localizados
  // aparecem para faturar sem esperar os que ainda estão em picking ou em análise.
  const { data: grupos, error } = await supabase
    .from("pedidos_b2c_grupos")
    .select("*")
    .neq("status_faturamento", "concluido")
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);

  const lista = grupos || [];
  if (!lista.length) return [];

  const ids = lista.map(g => g.id);
  const { data: pedidos } = await supabase
    .from("pedidos_b2c")
    .select("grupo_id, status, marketplace, total_do_pedido")
    .in("grupo_id", ids);

  const cont = {};
  (pedidos || []).forEach(p => {
    if (!cont[p.grupo_id]) cont[p.grupo_id] = { aFaturar: 0, emAnalise: 0, emPicking: 0, faturados: 0, valorAFaturar: 0, mp: {} };
    const c = cont[p.grupo_id];
    if (p.status === "embalado") {
      c.aFaturar++;
      c.valorAFaturar += (p.total_do_pedido || 0);
      const nome = p.marketplace || "—";
      c.mp[nome] = (c.mp[nome] || 0) + 1;
    } else if (p.status === "em_analise") {
      c.emAnalise++;
    } else if (p.status === "em_picking") {
      c.emPicking++;
    } else if (["faturado", "concluido"].includes(p.status)) {
      c.faturados++;
    }
  });

  return lista
    .map(g => {
      const c = cont[g.id] || { aFaturar: 0, emAnalise: 0, emPicking: 0, faturados: 0, valorAFaturar: 0, mp: {} };
      const marketplaces = Object.entries(c.mp)
        .map(([nome, qtd]) => ({ nome, qtd }))
        .sort((a, b) => b.qtd - a.qtd);
      return {
        ...g,
        aFaturar: c.aFaturar,
        emAnalise: c.emAnalise,
        emPicking: c.emPicking,
        faturados: c.faturados,
        valorAFaturar: c.valorAFaturar,
        marketplaces,
      };
    })
    // Só mostra grupos que têm ao menos um pedido pronto para faturar
    .filter(g => g.aFaturar > 0);
}

// Gera e baixa a planilha do grupo com os pedidos prontos para faturar (status embalado).
// Os que estão em análise ficam de fora — não têm peça para faturar.
export async function gerarPlanilhaFaturamentoGrupo(grupoId, userId, userNome) {
  const { data: grupo } = await supabase
    .from("pedidos_b2c_grupos")
    .select("numero, baixado_por, baixado_por_nome, baixado_em")
    .eq("id", grupoId)
    .single();

  // Trava: se o grupo já foi baixado por outro usuário, bloqueia o download.
  if (grupo?.baixado_por && grupo.baixado_por !== userId) {
    return {
      ok: false,
      bloqueado: true,
      por: grupo.baixado_por_nome || "outro usuário",
      porId: grupo.baixado_por,
      em: grupo.baixado_em,
      erro: `Grupo já baixado por ${grupo.baixado_por_nome || "outro usuário"}.`,
    };
  }

  const { data: pedidos, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("grupo_id", grupoId)
    .eq("status", "embalado")
    .order("id_anymarket", { ascending: true });
  if (error) throw new Error(error.message);
  if (!pedidos?.length) return { ok: false, erro: "Nenhum pedido pronto para faturar neste grupo." };

  // Reserva o grupo no primeiro download. A condição .is("baixado_por", null)
  // protege contra corrida: só reserva se ninguém tiver reservado ainda.
  if (!grupo?.baixado_por) {
    const { data: reservado } = await supabase
      .from("pedidos_b2c_grupos")
      .update({ baixado_por: userId, baixado_por_nome: userNome || "Usuário", baixado_em: new Date().toISOString() })
      .eq("id", grupoId)
      .is("baixado_por", null)
      .select("baixado_por");
    if (!reservado || reservado.length === 0) {
      const { data: dono } = await supabase
        .from("pedidos_b2c_grupos").select("baixado_por, baixado_por_nome").eq("id", grupoId).single();
      if (dono?.baixado_por && dono.baixado_por !== userId) {
        return {
          ok: false,
          bloqueado: true,
          por: dono.baixado_por_nome || "outro usuário",
          porId: dono.baixado_por,
          erro: `Grupo já baixado por ${dono.baixado_por_nome || "outro usuário"}.`,
        };
      }
    }
  }

  const rows = pedidos.map(p => ({
    "ID_PEDIDO":   p.id,
    "PEDIDO_ML":   p.id_anymarket,
    "MARKETPLACE": p.marketplace || "",
    "CLIENTE":     p.cliente || "",
    "TITULO":      p.titulo_produto || "",
    "SKU":         p.sku_alocado || p.sku_produto || "",
    "GRADE":       p.grade_alocada || p.grade_produto || "",
    "IMEI":        p.imei_bipado || p.imei_alocado || "",
    "VALOR":       p.total_do_pedido != null ? Number(p.total_do_pedido).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    "NUMERO_NF":   "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
  const nomeArquivo = `faturamento_grupo_${grupo?.numero || grupoId}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  return { ok: true, total: rows.length, nomeArquivo };
}

// Lê a planilha de volta e fatura cada linha que tiver NUMERO_NF preenchido.
// Casa pelo ID_PEDIDO (id interno único). Linha sem NF é ignorada (fica para a próxima leva).
export async function importarNFsGrupo(file, grupoId, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Trava: só o usuário que baixou o grupo pode subir as NFs.
        const { data: grupoLock } = await supabase
          .from("pedidos_b2c_grupos").select("baixado_por, baixado_por_nome").eq("id", grupoId).single();
        if (grupoLock?.baixado_por && grupoLock.baixado_por !== userId) {
          throw new Error(`Grupo travado — só ${grupoLock.baixado_por_nome || "quem baixou"} pode subir as NFs.`);
        }

        const wb   = XLSX.read(e.target.result, { type: "binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
        if (!rows.length) throw new Error("Planilha vazia.");

        const comNF = rows.filter(r => r["NUMERO_NF"] != null && String(r["NUMERO_NF"]).trim() !== "");
        if (!comNF.length) throw new Error("Nenhuma linha com NUMERO_NF preenchido.");

        // Status atual dos pedidos do grupo — só faturamos os que estão embalado (aguardando NF)
        const { data: pedidosGrupo } = await supabase
          .from("pedidos_b2c").select("id, status").eq("grupo_id", grupoId);
        const statusPorId = {};
        (pedidosGrupo || []).forEach(p => { statusPorId[String(p.id)] = p.status; });

        let faturados = 0;
        let ignorados = 0;
        for (const row of comNF) {
          const idPedido = String(row["ID_PEDIDO"] ?? "").trim();
          const numeroNf = String(row["NUMERO_NF"]).trim();
          if (!idPedido || statusPorId[idPedido] !== "embalado") { ignorados++; continue; }

          const { error: errUpd } = await supabase
            .from("pedidos_b2c")
            .update({
              status:        "faturado",
              numero_nf:     numeroNf,
              faturado_em:   new Date().toISOString(),
              faturado_por:  userId,
              atualizado_em: new Date().toISOString(),
            })
            .eq("id", idPedido);
          if (errUpd) { ignorados++; } else { faturados++; }
        }

        const grupoConcluido = await verificarConclusaoFaturamentoGrupo(grupoId);
        const semNF = rows.length - comNF.length;

        resolve({ ok: true, faturados, ignorados, semNF, grupoConcluido });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

// Marca o faturamento do grupo como concluído quando não resta nada pendente
// (nada embalado aguardando NF, nem em picking, nem em análise).
async function verificarConclusaoFaturamentoGrupo(grupoId) {
  const { data: pedidos } = await supabase
    .from("pedidos_b2c").select("status").eq("grupo_id", grupoId);
  const todos = pedidos || [];
  const pendente = todos.some(p => ["embalado", "em_picking", "em_analise"].includes(p.status));
  const concluido = todos.length > 0 && !pendente;

  await supabase
    .from("pedidos_b2c_grupos")
    .update({ status_faturamento: concluido ? "concluido" : "pendente" })
    .eq("id", grupoId);

  return concluido;
}

// ══════════════════════════════════════════════════════════
// KPIs
// ══════════════════════════════════════════════════════════

export async function buscarKpisPedidosB2C() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("status, status_anymarket");
  if (error) throw new Error(error.message);

  const todos = data || [];
  return {
    total:               todos.length,
    // Só conta como aguardando alocação os que estão pagos (igual à lista de alocação).
    aguardando_alocacao: todos.filter(p => p.status === "aguardando_alocacao" && p.status_anymarket === "Pago").length,
    alocado:             todos.filter(p => p.status === "alocado").length,
    em_picking:          todos.filter(p => p.status === "em_picking").length,
    em_analise:          todos.filter(p => p.status === "em_analise").length,
    embalado:            todos.filter(p => p.status === "embalado").length,
    faturado:            todos.filter(p => p.status === "faturado").length,
    concluido:           todos.filter(p => p.status === "concluido").length,
  };
}