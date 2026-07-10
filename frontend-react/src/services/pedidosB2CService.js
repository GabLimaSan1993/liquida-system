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
  // - Outlet (CC4): SÓ bateria entre 70 e 79% E grade Bom ou superior (Bom, Muito Bom, Excelente, Like New).
  //   "Bom" tem ordem 4 na hierarquia; "Bom ou superior" = ordem <= 4. Regular e Quebrado ficam de fora.
  // - Demais: grade exata ou superior (nunca inferior à vendida), sem regra de bateria.
  const ORDEM_BOM = gradeOrdem("Bom");
  const imeisValidos = disponiveis.filter(item => {
    if (ehOutlet) {
      const bateriaOk = normalizeGrade(item.status_bateria) === "saúde da bateria entre 70 e 79%";
      return bateriaOk && gradeOrdem(item.grade) <= ORDEM_BOM;
    }
    return gradeAceita(item.grade, gradeAlvo);
  });

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
      // Outlet mistura grades de propósito (Bom pra cima), então não prioriza grade:
      // é FIFO puro entre os elegíveis. Nos demais casos, grade mais próxima primeiro.
      if (!ehOutlet && a.distancia_grade !== b.distancia_grade) {
        return a.distancia_grade - b.distancia_grade;
      }
      // FIFO: subinventário mais antigo primeiro (nulos vão para o fim)
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
  const { data: grupos, error } = await supabase
    .from("pedidos_b2c_grupos")
    .select("*")
    .eq("status", "concluido")
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
    if (!cont[p.grupo_id]) cont[p.grupo_id] = { aFaturar: 0, emAnalise: 0, faturados: 0, valorAFaturar: 0, mp: {} };
    const c = cont[p.grupo_id];
    if (p.status === "embalado") {
      c.aFaturar++;
      c.valorAFaturar += (p.total_do_pedido || 0);
      const nome = p.marketplace || "—";
      c.mp[nome] = (c.mp[nome] || 0) + 1;
    } else if (p.status === "em_analise") {
      c.emAnalise++;
    } else if (["faturado", "concluido"].includes(p.status)) {
      c.faturados++;
    }
  });

  return lista.map(g => {
    const c = cont[g.id] || { aFaturar: 0, emAnalise: 0, faturados: 0, valorAFaturar: 0, mp: {} };
    const marketplaces = Object.entries(c.mp)
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd);
    return {
      ...g,
      aFaturar: c.aFaturar,
      emAnalise: c.emAnalise,
      faturados: c.faturados,
      valorAFaturar: c.valorAFaturar,
      marketplaces,
    };
  });
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