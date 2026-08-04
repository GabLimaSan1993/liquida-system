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
// "Aguardando alocação" também ficou de fora: é a etapa ANTERIOR à armazenagem — a peça
// terminou a triagem mas ainda não foi guardada na prateleira, então não tem endereço
// (98% desses registros vêm com `local` vazio). Sugerir essas peças mandava o separador
// procurar o que não tem endereço, e o pedido morria em "não localizado".
const STATUS_ALOCAVEIS = [
  "Produto disponível",
  "Em processo de devolução Agd RI",
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
    .eq("oculto_picking", false)
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

  // Conta quantos pedidos cada grupo realmente tem (para esconder grupos-casca vazios).
  const qtdPorGrupo = {};
  (pedidos || []).forEach(p => { qtdPorGrupo[p.grupo_id] = (qtdPorGrupo[p.grupo_id] || 0) + 1; });

  return grupos
    // Grupo sem nenhum pedido não deve aparecer no picking. Isso acontece quando todos
    // os itens de um grupo vão para análise (a regra tira o item do grupo, e a casca fica
    // vazia). Some da tela sem precisar apagar o registro do grupo.
    .filter(g => (qtdPorGrupo[g.id] || 0) > 0)
    .map(g => {
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

// Lista os pedidos em análise já marcando quais têm SEGUNDA OPÇÃO disponível no FIFO
// (aparelho que entrou no estoque depois que o pedido caiu em análise). Em vez de rodar
// o FIFO por pedido (lento com dezenas), traz o estoque alocável UMA vez e cruza em
// memória: para cada pedido, existe aparelho do mesmo SKU, grade igual ou melhor,
// disponível, com subinv e WH2? Se sim, marca temOpcaoFifo = true para o selo na lista.
export async function listarEmAnaliseComOpcao() {
  const pedidos = await listarPedidosEmAnalise();
  if (!pedidos.length) return [];

  // OTIMIZAÇÃO: em vez de varrer TODO o estoque alocável, busca só os SKUs que os
  // pedidos em análise precisam. São poucos SKUs distintos, então a consulta fica leve.
  const skuBasePorPedido = new Map();
  const skusAlvo = new Set();
  for (const p of pedidos) {
    const skuRaw = p.sku_definido || p.sku_produto || "";
    const skuBase = await traduzirSku(String(skuRaw).replace(/-CC\d+$/i, "").trim());
    skuBasePorPedido.set(p.id, skuBase);
    if (skuBase) skusAlvo.add(skuBase);
  }
  if (!skusAlvo.size) return pedidos.map(p => ({ ...p, temOpcaoFifo: false }));

  // Busca só o estoque alocável DESSES SKUs (não o estoque inteiro).
  const { data: triagem } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, grade, local, status_atual, criado_em")
    .in("status_atual", STATUS_ALOCAVEIS)
    .in("sku", [...skusAlvo])
    .limit(5000);

  const porImei = new Map();
  for (const t of (triagem || [])) {
    const a = porImei.get(t.imei);
    if (!a || new Date(t.criado_em) > new Date(a.criado_em)) porImei.set(t.imei, t);
  }

  // Subinv só dos IMEIs desses SKUs.
  const imeis = [...porImei.keys()];
  const subinv = new Map();
  for (let i = 0; i < imeis.length; i += 1000) {
    const { data } = await supabase
      .from("estoque_subinv").select("imei, data_subinv, local_subinv")
      .in("imei", imeis.slice(i, i + 1000));
    (data || []).forEach(s => subinv.set(s.imei, s));
  }

  // Índice do estoque sugerível por SKU (só o que o FIFO ofereceria).
  const temLocal = (t) => !!(t.local && String(t.local).trim());
  const wh2ok = (loc) => loc == null || String(loc).trim() === "" || String(loc).trim().toUpperCase().startsWith("WH2");
  const porSku = new Map();
  for (const t of porImei.values()) {
    const st = subinv.get(t.imei);
    if (!st?.data_subinv || !temLocal(t) || !wh2ok(st.local_subinv)) continue;
    if (!porSku.has(t.sku)) porSku.set(t.sku, []);
    porSku.get(t.sku).push(t);
  }

  // Enriquece com local e voucher da triagem (pelo imei_alocado), pra mostrar no card de
  // análise ONDE o operador deveria ter achado a peça. Mesma regra do picking: prefere a
  // passagem mais recente COM local preenchido; entre iguais, a mais nova.
  const imeisAnalise = pedidos.map(p => p.imei_alocado).filter(Boolean);
  const locVouch = new Map();
  for (let i = 0; i < imeisAnalise.length; i += 200) {
    const { data: est } = await supabase
      .from("assurant_triagem")
      .select("imei, local, voucher, criado_em")
      .in("imei", imeisAnalise.slice(i, i + 200));
    (est || []).forEach(e => {
      const atual = locVouch.get(e.imei);
      if (!atual) { locVouch.set(e.imei, e); return; }
      const eTemLocal = !!(e.local && String(e.local).trim());
      const aTemLocal = !!(atual.local && String(atual.local).trim());
      if (eTemLocal !== aTemLocal) { if (eTemLocal) locVouch.set(e.imei, e); }
      else if (new Date(e.criado_em) > new Date(atual.criado_em)) locVouch.set(e.imei, e);
    });
  }

  return pedidos.map(p => {
    const skuBase = skuBasePorPedido.get(p.id);
    const gradeAlvo = p.grade_definida || p.grade_produto;
    const candidatos = porSku.get(skuBase) || [];
    const temOpcaoFifo = candidatos.some(c => gradeAceita(c.grade, gradeAlvo));
    const est = locVouch.get(p.imei_alocado);
    return {
      ...p, temOpcaoFifo,
      local_estoque: est?.local || null,
      voucher_estoque: est?.voucher || null,
    };
  });
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
  const imeisElegiveis = disponiveis.filter(item => itemElegivel(item, ehOutlet, gradeAlvo));

  if (!imeisElegiveis.length) return [];

  // TRAVA DE DONO: nunca sugerir aparelho que já está amarrado a um pedido ativo.
  // O status_atual da triagem sozinho não basta — reimportação da planilha, resolução de
  // análise e carimbo manual já devolveram para "Produto disponível" peças que tinham dono,
  // e o FIFO ofereceu de novo (o mesmo IMEI apareceu em dois pedidos embalados). Aqui a
  // fonte da verdade é a própria pedidos_b2c: existindo pedido ativo apontando para o
  // IMEI, ele sai da lista, não importa o que a triagem diga.
  const imeisEmUso = new Set();
  const candidatosImei = imeisElegiveis.map(i => i.imei);
  const BLOCO_DONO = 200;
  for (let i = 0; i < candidatosImei.length; i += BLOCO_DONO) {
    const { data: donos, error: errDonos } = await supabase
      .from("pedidos_b2c")
      .select("imei_alocado")
      .in("status", ["alocado", "em_picking", "embalado"])
      .in("imei_alocado", candidatosImei.slice(i, i + BLOCO_DONO));
    if (errDonos) throw new Error(`Falha ao verificar IMEIs em uso: ${errDonos.message}`);
    (donos || []).forEach(d => {
      if (d.imei_alocado) imeisEmUso.add(String(d.imei_alocado).trim());
    });
  }

  const imeisValidos = imeisElegiveis.filter(i => !imeisEmUso.has(String(i.imei).trim()));
  if (!imeisValidos.length) return [];

  const imeisList = imeisValidos.map(i => i.imei);
  const { data: subinv } = await supabase
    .from("estoque_subinv")
    .select("imei, data_subinv, local_subinv")
    .in("imei", imeisList);

  const subinvMap = {};
  (subinv || []).forEach(s => { subinvMap[s.imei] = s; });

  // Distância de grade em relação ao pedido:
  //   0  = grade exata (prioridade máxima)
  //   >0 = grade superior (quanto menor, mais próxima da vendida — menos "desperdício")
  const ordemPedido = gradeOrdem(gradeAlvo);

  // O FIFO só SUGERE aparelhos que estão fisicamente no armazém (WH2): precisam ter
  //   (1) local preenchido — a garantia do Gaia de que o aparelho está no armazém, e
  //   (2) data_subinv — a âncora de antiguidade para o FIFO.
  // Sem local OU sem subinv, o aparelho é pulado (o pedido segue com o próximo elegível).
  // (Os pulados não somem do controle — aparecem na aba Comparativo Aging à parte.)
  // (3) armazém do Oracle (local_subinv) sendo WH2 — "WH2 B2C" ou "WH2 CENTER CELL".
  // É o que impede sugerir peça que está em CENTER CELL / ALPHA / YUSEN (fora do WH2).
  // Atenção: "CENTER CELL" e "WH2 CENTER CELL" são armazéns diferentes — teste por PREFIXO.
  // local_subinv NULO é aceito de propósito: enquanto a base não for reimportada com a
  // coluna LOCAL, todo o estoque está sem armazém e o FIFO travaria. Como o importador
  // recusa planilha sem LOCAL, nulo só existe em dados anteriores à virada.
  const temLocal = (item) => !!(item.local && String(item.local).trim());
  const ehWH2 = (loc) => String(loc || "").trim().toUpperCase().startsWith("WH2");
  const armazemOk = (loc) => loc == null || String(loc).trim() === "" || ehWH2(loc);
  const ordenados = imeisValidos
    .map(item => ({
      ...item,
      data_subinv:     subinvMap[item.imei]?.data_subinv || null,
      local_subinv:    subinvMap[item.imei]?.local_subinv || null,
      distancia_grade: ordemPedido - gradeOrdem(item.grade),
    }))
    .filter(item => item.data_subinv && temLocal(item) && armazemOk(item.local_subinv))
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
// Ordem devolvida por gradeOrdem() para grade fora da hierarquia comercial
// (QUEBRADO, REGULAR, EM ANALISE...) e também para pedido SEM grade reconhecida.
// Sem barreira explícita, 99 <= 99 é verdadeiro e o FIFO oferece peça quebrada
// para pedido sem grade — foi o que aconteceu no pedido 364344445 (S24 Ultra 1TB
// vendido como Excelente, título sem " - " antes da grade, grade_produto nulo).
const GRADE_FORA_HIERARQUIA = 99;

function itemElegivel(item, ehOutlet, gradeAlvo) {
  // Barreira dura 1: peça de grade não-comercial nunca é alocável.
  const ordemItem = gradeOrdem(item.grade);
  if (ordemItem >= GRADE_FORA_HIERARQUIA) return false;

  // Barreira dura 2: pedido sem grade reconhecida não aloca às cegas.
  // Melhor cair em "sem produto" (Aguardando Definição) do que sair peça errada.
  if (gradeOrdem(gradeAlvo) >= GRADE_FORA_HIERARQUIA) return false;

  const bateria = normalizeGrade(item.status_bateria);
  if (ehOutlet) {
    return bateria === BATERIA_OUTLET && ordemItem <= gradeOrdem("Bom");
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
  const localSubinvMap = {};
  // O .in() tem limite prático de itens; fatia em blocos de 1000
  for (let i = 0; i < todosImeis.length; i += 1000) {
    const bloco = todosImeis.slice(i, i + 1000);
    const { data: sub } = await supabase
      .from("estoque_subinv").select("imei, data_subinv, local_subinv").in("imei", bloco);
    (sub || []).forEach(s => {
      subinvMap[s.imei] = s.data_subinv;
      localSubinvMap[s.imei] = s.local_subinv;
    });
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
    // (local_subinv nulo é aceito enquanto a base não tem a coluna LOCAL — mesma regra do FIFO)
    const temLocalCmp = (c) => !!(c.local && String(c.local).trim());
    const armazemOkCmp = (loc) => loc == null || String(loc).trim() === "" ||
      String(loc).trim().toUpperCase().startsWith("WH2");
    const comSubinv = candidatos
      .map(c => ({ ...c, data_subinv: subinvMap[c.imei] || null, local_subinv: localSubinvMap[c.imei] || null }))
      .filter(c => c.data_subinv && temLocalCmp(c) && armazemOkCmp(c.local_subinv))
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
// Um pedido do marketplace pode ter vários itens (1 linha = 1 IMEI). Os itens de um
// mesmo pedido têm que sair na MESMA nota, então precisam ficar no MESMO grupo.
// Esta função devolve os pedidos cujos itens estão TODOS alocados e sem grupo —
// pedido pela metade não entra em leva nenhuma, senão racha em dois grupos e duas NFs.
async function agruparPedidosCompletos(semGrupo) {
  const ids = [...new Set(semGrupo.map(p => p.id_anymarket))];

  // Busca TODOS os itens desses pedidos, em qualquer status, em blocos (URL não estoura).
  const todosItens = [];
  const BLOCO_IDS = 200;
  for (let i = 0; i < ids.length; i += BLOCO_IDS) {
    const bloco = ids.slice(i, i + BLOCO_IDS);
    const { data, error } = await supabase
      .from("pedidos_b2c")
      .select("id, id_anymarket, status, grupo_id")
      .in("id_anymarket", bloco);
    if (error) throw new Error(`Falha ao verificar itens do pedido: ${error.message}`);
    todosItens.push(...(data || []));
  }

  const itensPorPedido = new Map();
  for (const it of todosItens) {
    if (!itensPorPedido.has(it.id_anymarket)) itensPorPedido.set(it.id_anymarket, []);
    itensPorPedido.get(it.id_anymarket).push(it);
  }

  const prontos = [];
  for (const p of semGrupo) {
    const irmaos = itensPorPedido.get(p.id_anymarket) || [];
    const completo = irmaos.length > 0 &&
      irmaos.every(i => i.status === "alocado" && !i.grupo_id);
    if (!completo) continue;
    if (prontos.some(x => x.id_anymarket === p.id_anymarket)) continue;

    // semGrupo já vem ordenado por alocado_em, então o primeiro item de cada pedido
    // que aparece aqui é o mais antigo dele — é ele que define a vez do pedido (FIFO).
    prontos.push({
      id_anymarket: p.id_anymarket,
      marketplace:  p.marketplace,
      itemIds:      semGrupo.filter(x => x.id_anymarket === p.id_anymarket).map(x => x.id),
    });
  }

  return prontos;
}

// Monta a leva enfiando pedidos INTEIROS até chegar ao tamanho. Nunca parte um pedido:
// se o próximo não couber, a leva fecha menor e ele vai na próxima (mantém o FIFO).
// Exceção: pedido que sozinho já passa do tamanho entra assim mesmo e o grupo estoura —
// a integridade do pedido vale mais que o número 20.
function montarLote(pedidosProntos, tamanho) {
  const lote = [];
  let total = 0;
  for (const ped of pedidosProntos) {
    if (total > 0 && total + ped.itemIds.length > tamanho) break;
    lote.push(ped);
    total += ped.itemIds.length;
    if (total >= tamanho) break;
  }
  return { lote, total };
}

async function verificarECriarGrupo(userId) {
  const TAMANHO = 20;

  // Busca itens alocados sem grupo, com o pedido a que pertencem (para nunca separá-los).
  const { data: semGrupo, error } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, marketplace")
    .eq("status", "alocado")
    .is("grupo_id", null)
    .order("alocado_em", { ascending: true });

  if (error || !semGrupo?.length) return null;

  const prontos = await agruparPedidosCompletos(semGrupo);
  if (!prontos.length) return null;

  // O gatilho conta só itens de pedido COMPLETO. Pode haver 20 itens alocados na tela
  // e nenhum grupo formar, porque são pedaços de pedidos incompletos — é o esperado:
  // eles esperam os irmãos. Para as sobras existe o "Fechar grupos pendentes".
  const totalPronto = prontos.reduce((s, p) => s + p.itemIds.length, 0);
  if (totalPronto < TAMANHO) return null;

  const { lote } = montarLote(prontos, TAMANHO);
  if (!lote.length) return null;

  // Divide por marketplace: cada marketplace vira seu próprio grupo, mesmo menor.
  // Grupo NUNCA mistura marketplace — isso já causou problema na operação.
  // Como um pedido tem um marketplace só, seus itens continuam juntos.
  const porMarketplace = {};
  for (const ped of lote) {
    const mp = ped.marketplace || "—";
    (porMarketplace[mp] ||= []).push(...ped.itemIds);
  }

  const grupos = [];
  for (const itemIds of Object.values(porMarketplace)) {
    const g = await _criarGrupo(itemIds, userId);
    if (g) grupos.push(g);
  }
  if (!grupos.length) return null;

  return { ...grupos[0], gruposCriados: grupos.length };
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

// ── Auditoria de FIFO ─────────────────────────────────────
// A estoque_subinv é SUBSTITUÍDA a cada importação do Oracle: aparelho que sai do estoque
// some da tabela, e com ele a data_subinv que ancorou a decisão do FIFO (hoje 1.996 de 2.161
// alocados já estão sem registro). Sem congelar a foto no momento da alocação não há como
// auditar depois por que uma peça foi escolhida. Grava o snapshot no pedido + a fila em
// fifo_auditoria. Nunca lança: auditoria não pode derrubar a alocação.
async function registrarAuditoriaFifo(pedidoId, { sugestao, candidatos, origem, pedido, userId }) {
  try {
    const lista = Array.isArray(candidatos) ? candidatos : [];
    const idx = sugestao ? lista.findIndex(c => String(c.imei) === String(sugestao.imei)) : -1;
    const posicao = idx >= 0 ? idx + 1 : null;
    const gradeAlvo = pedido?.grade_definida || pedido?.grade_produto || null;

    await supabase.from("pedidos_b2c").update({
      data_subinv_alocado:   sugestao?.data_subinv  || null,
      local_subinv_alocado:  sugestao?.local_subinv || null,
      local_alocado:         sugestao?.local        || null,
      fifo_posicao:          posicao,
      fifo_total_candidatos: lista.length || null,
      fifo_origem:           origem || null,
    }).eq("id", pedidoId);

    // Só os 10 primeiros: é a vizinhança que explica a escolha. A fila inteira de um SKU
    // com centenas de peças infla a tabela sem agregar nada à auditoria.
    const candidatosLog = lista.slice(0, 10).map((c, i) => ({
      posicao:      i + 1,
      imei:         c.imei,
      grade:        c.grade,
      data_subinv:  c.data_subinv  || null,
      local:        c.local        || null,
      local_subinv: c.local_subinv || null,
      escolhido:    sugestao ? String(c.imei) === String(sugestao.imei) : false,
    }));

    await supabase.from("fifo_auditoria").insert({
      pedido_id:             pedidoId,
      id_anymarket:          pedido?.id_anymarket != null ? String(pedido.id_anymarket) : null,
      sku_buscado:           sugestao?.sku || null,
      grade_alvo:            gradeAlvo,
      eh_outlet:             normalizeGrade(gradeAlvo) === "outlet",
      imei_escolhido:        sugestao?.imei || null,
      data_subinv_escolhido: sugestao?.data_subinv || null,
      posicao_escolhida:     posicao,
      total_candidatos:      lista.length,
      candidatos:            candidatosLog,
      origem:                origem || null,
      criado_por:            userId || null,
    });
  } catch (e) {
    console.error("Falha ao registrar auditoria de FIFO:", e?.message || e);
  }
}

// O banco tem um índice único parcial (idx_b2c_imei_unico_ativo) que impede o
// mesmo IMEI de ficar preso a dois pedidos vivos ao mesmo tempo. Quando dois
// operadores alocam quase juntos, o segundo bate nessa trava e o Postgres
// devolve 23505 — traduz para uma mensagem que o operador entenda.
function traduzErroAlocacao(error, imei) {
  const cod = error?.code || "";
  const msg = error?.message || "";
  if (cod === "23505" || /idx_b2c_imei_unico_ativo|duplicate key/i.test(msg)) {
    return new Error(
      `O aparelho ${imei || ""} acabou de ser alocado em outro pedido. ` +
      `Atualize a lista e escolha outro.`
    );
  }
  return new Error(msg || "Falha ao alocar.");
}

// O 6º parâmetro (auditoria) é opcional: { sugestao, candidatos, origem, pedido }.
// Sem ele a alocação funciona igual, só não deixa rastro auditável.
export async function alocarPedido(pedidoId, imei, sku, grade, userId, auditoria) {
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
  if (errPedido) throw traduzErroAlocacao(errPedido, imei);

  // 2. Reserva o IMEI na assurant_triagem
  const { error: errTriagem } = await supabase
    .from("assurant_triagem")
    .update({ status_atual: "Reservado para pedido B2C" })
    .eq("imei", imei);
  if (errTriagem) throw new Error(errTriagem.message);

  // 3. Congela a foto do FIFO antes que o subinv seja reimportado
  if (auditoria) {
    await registrarAuditoriaFifo(pedidoId, { ...auditoria, userId });
  }

  // 4. Verifica se formou grupo de 20
  const grupoFormado = await verificarECriarGrupo(userId);

  return { ok: true, grupoFormado };
}

// ── Fechar grupos pendentes (sobras) — um grupo por marketplace ──
export async function fecharGruposPendentes(userId) {
  const { data: semGrupo, error } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, marketplace")
    .eq("status", "alocado")
    .is("grupo_id", null)
    .order("alocado_em", { ascending: true });

  if (error) throw new Error(error.message);
  if (!semGrupo?.length) return null;

  // VÁLVULA MANUAL: aqui o operador está pedindo explicitamente para fechar as sobras.
  // Diferente da formação automática, NÃO exigimos pedido completo. Por quê: um item que
  // volta para a alocação (ex.: resolvido de análise) de um pedido cujos irmãos JÁ foram
  // embalados/faturados nunca estaria "completo" — e ficaria preso para sempre, contado
  // pela faixa mas impossível de fechar. A regra de pedido inteiro vale na automática
  // (verificarECriarGrupo), que é quem garante a nota única no fluxo normal.
  // Ordena por marketplace agrupando todos os alocados sem grupo, inteiros ou sobras.
  const porMarketplace = {};
  for (const ped of semGrupo) {
    const mp = ped.marketplace || "—";
    (porMarketplace[mp] ||= []).push(ped.id);
  }

  const grupos = [];
  for (const itemIds of Object.values(porMarketplace)) {
    const grupo = await _criarGrupo(itemIds, userId);
    if (grupo) grupos.push(grupo);
  }

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

  // TRAVA pedido multi-item: nenhum item pode ser bipado/embalado enquanto um IRMÃO do
  // mesmo pedido estiver em análise. Pedido multi-item anda sempre junto — se um para,
  // todos param, até a análise ser resolvida.
  const { data: irmaos } = await supabase
    .from("pedidos_b2c")
    .select("id, status")
    .eq("id_anymarket", pedido.id_anymarket)
    .neq("id", pedidoId);
  if ((irmaos || []).some(i => i.status === "em_analise")) {
    return { ok: false, erro: "Pedido tem outro item em análise — resolva antes de bipar este." };
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
  // "em_analise" saiu daqui: agora o item em análise deixa o grupo (grupo_id = null),
  // então não precisa mais ser contado como concluído para o grupo poder fechar.
  const concluidos = todos.filter(p =>
    ["embalado", "faturado", "concluido"].includes(p.status)
  ).length;

  // Grupo que ficou sem nenhum pedido (todos saíram para análise) não deve reabrir.
  if (todos.length > 0 && concluidos >= todos.length) {
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
  // REGRA: pedido multi-item anda SEMPRE junto. Se um item cai em análise, os irmãos que
  // já avançaram (alocado em grupo, em picking, embalado) RECUAM para "alocado" sem grupo
  // e esperam a resolução — mantendo o IMEI reservado (não perdem a peça já achada).
  // Só voltam a andar quando TODOS os itens do pedido estiverem prontos de novo.
  const { data: alvo } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, grupo_id")
    .eq("id", pedidoId)
    .single();
  if (!alvo) throw new Error("Pedido não encontrado.");

  const agora = new Date().toISOString();
  const gruposAfetados = new Set();
  if (alvo.grupo_id) gruposAfetados.add(alvo.grupo_id);

  // 1. O item vai para análise (sai do grupo).
  const { error: errItem } = await supabase
    .from("pedidos_b2c")
    .update({
      status:         "em_analise",
      grupo_id:       null,
      motivo_analise: motivo || "Não localizado",
      analise_em:     agora,
      analise_por:    userId,
      atualizado_em:  agora,
    })
    .eq("id", pedidoId);
  if (errItem) throw new Error(errItem.message);

  // 2. Puxa os IRMÃOS que já avançaram de volta para "alocado" sem grupo. Mantém o IMEI
  //    reservado (imei_alocado, sku_alocado, grade_alocada intactos). Limpa só bipagem/
  //    embalagem, porque eles recuam de etapa. Não toca em item já faturado/concluído.
  const { data: irmaos } = await supabase
    .from("pedidos_b2c")
    .select("id, grupo_id, status")
    .eq("id_anymarket", alvo.id_anymarket)
    .neq("id", pedidoId)
    .in("status", ["alocado", "em_picking", "embalado"]);

  for (const irmao of (irmaos || [])) {
    if (irmao.grupo_id) gruposAfetados.add(irmao.grupo_id);
    await supabase
      .from("pedidos_b2c")
      .update({
        status:        "alocado",
        grupo_id:      null,
        imei_bipado:   null,
        bipado_em:     null,
        bipado_por:    null,
        embalado_em:   null,
        embalado_por:  null,
        atualizado_em: agora,
      })
      .eq("id", irmao.id);
  }

  // 3. Recalcula todo grupo tocado: sem os itens que saíram, os que sobraram podem fechar.
  for (const gid of gruposAfetados) {
    await verificarConclusaoGrupo(gid);
  }
}

// Picking — "Não localizado" com busca automática de segunda opção.
// 1. Manda o IMEI não encontrado para "Em análise de estoque" (sai do estoque sugerível).
// 2. Busca o próximo IMEI do FIFO para o mesmo pedido (excluindo o antigo).
// 3. Se achar: reserva o novo e o pedido segue no grupo apontando para ele.
//    Se não achar: manda o pedido para análise (fluxo atual).
// Retorna { trocado: true, novoImei, local } | { trocado: false } (foi para análise).
export async function naoLocalizadoBuscarProximo(pedido, userId, motivo) {
  const imeiAntigo = pedido.imei_alocado;
  // Motivo padrão é o "não localizado" do picking. A conferência de cor/modelo/SKU passa
  // o motivo da divergência e reaproveita este mesmo fluxo: a peça problemática sai do
  // estoque sugerível e o pedido ganha a próxima opção do FIFO sem cair em análise.
  const motivoFinal = motivo || "Não localizado";

  // 1. IMEI antigo vai para análise de estoque (não some, mas sai do FIFO até verificação)
  if (imeiAntigo) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Em análise de estoque" })
      .eq("imei", imeiAntigo);
  }

  // 2. Busca a próxima sugestão FIFO. Usa SKU/grade DEFINIDOS quando existirem (pedido que
  //    passou por definição de produto), senão os originais — mesma regra do FIFO.
  const skuBusca   = pedido.sku_definido   || pedido.sku_produto;
  const gradeBusca = pedido.grade_definida || pedido.grade_produto;
  const sugestoes = await buscarSugestaoFifo(skuBusca, gradeBusca);
  // Exclui por segurança o próprio antigo (caso ainda apareça) e qualquer já reservado
  const proximo = (sugestoes || []).find(s => s.imei !== imeiAntigo);

  if (proximo) {
    // 3a. Reserva o novo IMEI e aponta o pedido para ele — segue no mesmo grupo
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Reservado para pedido B2C" })
      .eq("imei", proximo.imei);

    const { error: errTroca } = await supabase
      .from("pedidos_b2c")
      .update({
        imei_alocado:  proximo.imei,
        sku_alocado:   proximo.sku,
        grade_alocada: proximo.grade,
        atualizado_em: new Date().toISOString(),
      })
      .eq("id", pedido.id);
    if (errTroca) throw traduzErroAlocacao(errTroca, proximo.imei);

    // Troca no picking também é decisão do FIFO — registra com a origem certa.
    await registrarAuditoriaFifo(pedido.id, {
      sugestao: proximo, candidatos: sugestoes,
      origem: motivo ? "divergencia_conferencia" : "nao_localizado",
      pedido, userId,
    });

    return { trocado: true, novoImei: proximo.imei, local: proximo.local, grade: proximo.grade };
  }

  // 3b. Sem segunda opção: manda o pedido para análise, preservando o motivo real.
  await marcarNaoLocalizado(pedido.id, `${motivoFinal} (sem segunda opção no FIFO)`, userId);
  return { trocado: false };
}

// Monta os dados do modal de resolução de análise:
//   - a peça atual na triagem (para mostrar/corrigir cor, SKU e grade)
//   - as cores já vistas nesse modelo (fonte provisória até existir o catálogo por fabricante)
//   - a próxima opção do FIFO, se houver — só para LER (não reserva nada aqui)
export async function prepararResolucaoAnalise(pedido) {
  let peca = null;
  if (pedido.imei_alocado) {
    // Um IMEI pode ter várias passagens; a linha mais recente é o registro atual da peça
    // (é a que o FIFO usa depois de deduplicar).
    const { data } = await supabase
      .from("assurant_triagem")
      .select("unique_key, imei, marca, modelo, cor, sku, grade, local")
      .eq("imei", pedido.imei_alocado)
      .order("criado_em", { ascending: false })
      .limit(1);
    peca = data?.[0] || null;
  }

  // Cores que já apareceram nesse modelo. Provisório: quando existir a lista oficial
  // por marca/modelo, é só trocar a origem deste array.
  let cores = [];
  if (peca?.modelo) {
    const { data: linhas } = await supabase
      .from("assurant_triagem")
      .select("cor")
      .eq("modelo", peca.modelo)
      .not("cor", "is", null)
      .limit(2000);
    cores = Array.from(new Set((linhas || []).map(l => String(l.cor).trim()).filter(Boolean))).sort();
  }

  // Próxima opção do FIFO para o mesmo produto do pedido (exclui a peça com problema)
  let proximo = null;
  try {
    const sugestoes = await buscarSugestaoFifo(pedido.sku_produto, pedido.grade_produto);
    proximo = (sugestoes || []).find(s => s.imei !== pedido.imei_alocado) || null;
  } catch { proximo = null; }

  return { peca, cores, proximo };
}

// Resolve a análise mandando o pedido DIRETO para embalagem/faturamento.
// Quem resolve está com o aparelho na mão (bipou), então não faz sentido devolver
// para o picking para outra pessoa bipar de novo.
//
//   tipo "localizado"        → o aparelho apareceu; mantém o IMEI, nada muda no estoque.
//   tipo "divergencia_cor"   → o cadastro da cor está errado
//   tipo "divergencia_sku"   → o cadastro do SKU está errado
//   tipo "divergencia_grade" → o cadastro da grade está errado
//
// Nas três divergências: o valor informado CORRIGE o cadastro da peça (só na linha mais
// recente da triagem — as passagens antigas são histórico e ficam intactas), a peça volta
// para "Produto disponível" já com o dado certo (assim o FIFO não repete o erro), e o
// pedido segue com o novoImei que o operador bipou.
const CAMPO_DIVERGENCIA = {
  divergencia_cor:   "cor",
  divergencia_sku:   "sku",
  divergencia_grade: "grade",
};

export async function resolverAnaliseParaEmbalagem(pedidoId, { tipo, valorReal, novoImei }, userId) {
  const { data: pedido } = await supabase
    .from("pedidos_b2c")
    .select("imei_alocado, grupo_id, motivo_analise")
    .eq("id", pedidoId)
    .single();
  if (!pedido) throw new Error("Pedido não encontrado.");

  const agora = new Date().toISOString();
  let imeiFinal = pedido.imei_alocado;
  let motivo    = pedido.motivo_analise || "";

  if (tipo !== "localizado") {
    const campo = CAMPO_DIVERGENCIA[tipo];
    if (!campo) throw new Error("Tipo de resolução inválido.");

    const valor = String(valorReal || "").trim();
    if (!valor) throw new Error("Informe o valor real do aparelho.");

    const imei = String(novoImei || "").trim();
    if (!imei) throw new Error("Bipe o aparelho que será usado no pedido.");
    if (imei === pedido.imei_alocado) throw new Error("O novo IMEI é igual ao que já está alocado.");

    if (pedido.imei_alocado) {
      // Corrige o cadastro só na linha mais recente — é a que o FIFO lê
      const { data: linhas } = await supabase
        .from("assurant_triagem")
        .select("unique_key, " + campo)
        .eq("imei", pedido.imei_alocado)
        .order("criado_em", { ascending: false })
        .limit(1);
      const peca = linhas?.[0];
      const valorAntigo = peca ? peca[campo] : null;

      if (peca?.unique_key) {
        const { error: errCampo } = await supabase
          .from("assurant_triagem")
          .update({ [campo]: valor })
          .eq("unique_key", peca.unique_key);
        if (errCampo) throw new Error(`Falha ao corrigir ${campo} da peça: ${errCampo.message}`);
      }

      // Peça volta ao estoque já com o dado corrigido
      await supabase.from("assurant_triagem")
        .update({ status_atual: "Produto disponível" })
        .eq("imei", pedido.imei_alocado);

      const rotulo = { cor: "cor", sku: "SKU", grade: "grade" }[campo];
      motivo = [motivo, `Divergência de ${rotulo}: ${pedido.imei_alocado} era "${valorAntigo || "—"}" e é "${valor}" (cadastro corrigido, peça devolvida ao estoque) · trocado por ${imei}`]
        .filter(Boolean).join(" | ");
    }

    // Peça correta fica reservada para este pedido
    await supabase.from("assurant_triagem")
      .update({ status_atual: "Reservado para pedido B2C" })
      .eq("imei", imei);

    imeiFinal = imei;
  }

  // Toda análise resolvida volta ao picking SEM grupo (grupo_id já é null desde que o
  // item entrou em análise). Vira um alocado avulso que a formação de grupo recolhe numa
  // leva nova — o item não pula o picking nem tenta reentrar no grupo antigo (que já
  // pode ter faturado). A troca de aparelho, quando houve, já foi feita acima.
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:         "alocado",
      imei_alocado:   imeiFinal,
      motivo_analise: motivo || null,
      resolvido_em:   agora,
      resolvido_por:  userId,
      atualizado_em:  agora,
    })
    .eq("id", pedidoId);
  if (error) throw traduzErroAlocacao(error, imeiFinal);

  // Recolhe numa leva de grupo (respeita pedido inteiro + marketplace, como sempre).
  const grupoFormado = await verificarECriarGrupo(userId);
  return { ok: true, imei: imeiFinal, grupoFormado };
}

// Resolve a análise pegando o PRIMEIRO aparelho da lista FIFO e alocando no pedido.
// O aparelho antigo (não localizado) vai para "Em análise de estoque". O novo é
// reservado e o pedido volta ao picking (sem grupo), para alguém buscar e bipar.
// Usa o SKU/grade definidos quando existirem (senão os originais), igual o FIFO.
export async function seguirComOpcaoFifo(pedido, userId) {
  const imeiAntigo = pedido.imei_alocado;

  const sku   = pedido.sku_definido   || pedido.sku_produto;
  const grade = pedido.grade_definida || pedido.grade_produto;
  const sugestoes = await buscarSugestaoFifo(sku, grade);
  const proximo = (sugestoes || []).find(s => s.imei !== imeiAntigo);

  if (!proximo) {
    return { ok: false, erro: "Nenhuma opção disponível no FIFO agora." };
  }

  if (imeiAntigo) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Em análise de estoque" })
      .eq("imei", imeiAntigo);
  }

  await supabase
    .from("assurant_triagem")
    .update({ status_atual: "Reservado para pedido B2C" })
    .eq("imei", proximo.imei);

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:        "em_picking",
      grupo_id:      null,
      imei_alocado:  proximo.imei,
      sku_alocado:   proximo.sku,
      grade_alocada: proximo.grade,
      resolvido_em:  agora,
      resolvido_por: userId,
      atualizado_em: agora,
    })
    .eq("id", pedido.id);
  if (error) throw traduzErroAlocacao(error, proximo.imei);

  const grupoFormado = await verificarECriarGrupo(userId);
  return { ok: true, novoImei: proximo.imei, local: proximo.local, grade: proximo.grade, grupoFormado };
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
      grupo_id:      null,
      imei_alocado:  novoImei || pedido?.imei_alocado,
      resolvido_em:  new Date().toISOString(),
      resolvido_por: userId,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);

  // O item resolvido volta ao picking SEM grupo: vira um alocado avulso que a formação
  // de grupo recolhe numa leva nova — grupo diferente do original, como a operação pede.
  // (O grupo antigo já foi recalculado quando o item saiu, em marcarNaoLocalizado.)
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
    .or("definicao_status.is.null,definicao_status.eq.pendente")
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

// Cancela um pedido a partir da tela de definição. Definitivo. Se o pedido tinha
// aparelho reservado, o aparelho volta ao estoque ("Produto disponível"). O pedido
// sai do fluxo (status = cancelado) e passa a viver na aba Cancelados.
export async function cancelarPedidoDefinicao(pedidoId, userId) {
  const { data: pedido } = await supabase
    .from("pedidos_b2c")
    .select("imei_alocado")
    .eq("id", pedidoId)
    .single();

  // Solta o aparelho reservado, se houver, de volta ao estoque.
  if (pedido?.imei_alocado) {
    await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Produto disponível" })
      .eq("imei", pedido.imei_alocado)
      .eq("status_atual", "Reservado para pedido B2C");
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("pedidos_b2c")
    .update({
      status:                 "cancelado",
      definicao_status:       "cancelado",
      definicao_resolvido_em: agora,
      definicao_resolvido_por: userId,
      definicao_resumo:       "Pedido cancelado",
      atualizado_em:          agora,
    })
    .eq("id", pedidoId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Histórico: pedidos que foram DEFINIDOS (voltaram ao fluxo). Seguem a vida normal no
// picking/faturamento, mas ficam registrados aqui pela coluna definicao_status.
export async function listarDefinicaoConcluidos() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("definicao_status", "concluido")
    .order("definicao_resolvido_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Histórico: pedidos cancelados pela tela de definição.
export async function listarDefinicaoCancelados() {
  const { data, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("definicao_status", "cancelado")
    .order("definicao_resolvido_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Valida um SKU digitado na definição de produto: existe algum aparelho com esse SKU
// no catálogo? (Aceita mesmo sem estoque livre agora — o substituto pode chegar depois.)
// Retorna { existe, modelo, disponiveis } para a tela mostrar o feedback.
export async function validarSkuDefinicao(skuDigitado, grade) {
  const raw = String(skuDigitado || "").trim();
  if (!raw) return { existe: false };

  // Traduz BZ661 (Assurant) -> BRZDEV (ALS) e corta -CCx antes de buscar, igual o FIFO.
  const skuSemCC = raw.replace(/-CC\d+$/i, "").trim();
  const skuBase  = await traduzirSku(skuSemCC);

  const { data, error } = await supabase
    .from("assurant_triagem")
    .select("modelo, grade, status_atual")
    .eq("sku", skuBase)
    .limit(1000);
  if (error) throw new Error(error.message);
  if (!data?.length) return { existe: false, skuBase };

  const disp = data.filter(d => STATUS_ALOCAVEIS.includes(d.status_atual));
  const resultado = { existe: true, skuBase, modelo: data[0].modelo, disponiveis: disp.length };

  // Contagem por grade quando a tela informa a grade: exatos naquela grade + em grade superior.
  if (grade) {
    const ordAlvo = gradeOrdem(grade);
    resultado.gradeExata = disp.filter(d => gradeOrdem(d.grade) === ordAlvo).length;
    resultado.gradeAcima = disp.filter(d => gradeOrdem(d.grade) < ordAlvo).length;
  }
  return resultado;
}

// Conclui a definição de produto de um pedido em "aguardando_definicao_produto".
// mesmoSku=false grava sku_definido/grade_definida (preserva o original do cliente).
// Se vier imei: aloca DIRETO naquele aparelho (pula o FIFO), status = alocado,
//   e dispara a formação de grupo. Se não vier: volta para aguardando_alocacao,
//   e o FIFO passa a sugerir pelo SKU/grade definidos (ou originais, se mesmoSku).
export async function definirProduto(pedidoId, { mesmoSku, novoSku, novaGrade, imei }, userId) {
  const { data: pedido } = await supabase
    .from("pedidos_b2c").select("sku_produto, grade_produto").eq("id", pedidoId).single();
  if (!pedido) throw new Error("Pedido não encontrado.");

  // O que passa a valer para o FIFO/alocação.
  const gradeVal = mesmoSku ? null : String(novaGrade || "").trim();
  let skuVal = null;
  if (!mesmoSku) {
    const raw = String(novoSku || "").trim();
    if (!raw || !gradeVal) throw new Error("Informe o novo SKU e a nova grade.");
    // Grava o SKU JÁ TRADUZIDO (BRZDEV), que é o que o FIFO usa para achar estoque.
    skuVal = await traduzirSku(raw.replace(/-CC\d+$/i, "").trim());
  }

  const skuEfetivo   = mesmoSku ? pedido.sku_produto   : skuVal;
  const gradeEfetiva = mesmoSku ? pedido.grade_produto : gradeVal;
  const imeiTrim = String(imei || "").trim();

  // Resumo do que foi definido, para o histórico da aba Concluídos.
  const parteSku = mesmoSku ? "mesmo SKU" : `${skuVal} ${gradeVal}`;
  const parteImei = imeiTrim ? `alocado direto no IMEI ${imeiTrim}` : "voltou ao FIFO";
  const resumo = `Definido: ${parteSku} · ${parteImei}`;
  const agora = new Date().toISOString();

  const campos = {
    // sku_definido/grade_definida só são gravados quando muda o SKU; no mesmo SKU
    // ficam nulos e o sistema segue usando o original.
    sku_definido:   mesmoSku ? null : skuVal,
    grade_definida: mesmoSku ? null : gradeVal,
    // Marca o histórico: o pedido foi definido (entra na aba Concluídos) mesmo seguindo
    // o fluxo normal. definicao_status é paralelo ao status real, não interfere nele.
    definicao_status:       "concluido",
    definicao_resolvido_em: agora,
    definicao_resolvido_por: userId,
    definicao_resumo:       resumo,
    atualizado_em:  agora,
  };

  if (imeiTrim) {
    // Aloca DIRETO neste IMEI, pula o FIFO. Reserva o aparelho e aponta o pedido.
    const { error: errDef } = await supabase.from("pedidos_b2c").update({
      ...campos,
      status:        "alocado",
      imei_alocado:  imeiTrim,
      sku_alocado:   skuEfetivo,
      grade_alocada: gradeEfetiva,
      alocado_em:    new Date().toISOString(),
      alocado_por:   userId,
    }).eq("id", pedidoId);
    if (errDef) throw traduzErroAlocacao(errDef, imeiTrim);

    const { error: errTri } = await supabase
      .from("assurant_triagem")
      .update({ status_atual: "Reservado para pedido B2C" })
      .eq("imei", imeiTrim);
    if (errTri) throw new Error(errTri.message);

    const grupoFormado = await verificarECriarGrupo(userId);
    return { ok: true, alocadoDireto: true, grupoFormado };
  }

  // Sem IMEI: volta para a fila; o FIFO usará o SKU/grade efetivos.
  await supabase.from("pedidos_b2c").update({
    ...campos,
    status: "aguardando_alocacao",
  }).eq("id", pedidoId);

  return { ok: true, alocadoDireto: false };
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
    .eq("oculto_faturamento", false)
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);

  const lista = grupos || [];
  if (!lista.length) return [];

  const ids = lista.map(g => g.id);
  const { data: pedidos } = await supabase
    .from("pedidos_b2c")
    .select("grupo_id, status, marketplace, total_do_pedido, embalado_em")
    .in("grupo_id", ids);

  // Histórico de downloads de cada grupo (todos os downloads, mais recente primeiro)
  const { data: downloads } = await supabase
    .from("pedidos_b2c_downloads")
    .select("grupo_id, usuario_nome, total_linhas, baixado_em")
    .in("grupo_id", ids)
    .order("baixado_em", { ascending: false });

  const dlPorGrupo = {};
  (downloads || []).forEach(d => {
    (dlPorGrupo[d.grupo_id] ||= []).push(d);
  });

  const cont = {};
  (pedidos || []).forEach(p => {
    if (!cont[p.grupo_id]) cont[p.grupo_id] = { aFaturar: 0, emAnalise: 0, emPicking: 0, faturados: 0, valorAFaturar: 0, mp: {} };
    const c = cont[p.grupo_id];
    if (p.status === "embalado") {
      c.aFaturar++;
      c.valorAFaturar += (p.total_do_pedido || 0);
      const nome = p.marketplace || "—";
      c.mp[nome] = (c.mp[nome] || 0) + 1;
      // Guarda o embalado mais antigo do grupo: é o que define quanto tempo ele está parado sem NF.
      if (p.embalado_em && (!c.embaladoMaisAntigo || p.embalado_em < c.embaladoMaisAntigo)) {
        c.embaladoMaisAntigo = p.embalado_em;
      }
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
      const dls = dlPorGrupo[g.id] || [];
      return {
        ...g,
        aFaturar: c.aFaturar,
        emAnalise: c.emAnalise,
        emPicking: c.emPicking,
        faturados: c.faturados,
        valorAFaturar: c.valorAFaturar,
        marketplaces,
        downloads: dls,              // histórico completo (mais recente primeiro)
        totalDownloads: dls.length,  // quantas vezes já foi baixado
        embaladoMaisAntigo: c.embaladoMaisAntigo || null,
        diasParado: c.embaladoMaisAntigo
          ? Math.floor((Date.now() - new Date(c.embaladoMaisAntigo).getTime()) / 86400000)
          : null,
      };
    })
    // Só mostra grupos que têm ao menos um pedido pronto para faturar
    .filter(g => g.aFaturar > 0);
}

// Grupos que já têm ao menos um pedido faturado — alimenta a aba "Faturados".
// Um grupo parcialmente faturado aparece aqui E na lista de aguardando: o que já
// saiu fica visível sem esconder o que ainda falta.
export async function listarGruposFaturados() {
  const { data: pedidos, error } = await supabase
    .from("pedidos_b2c")
    .select("grupo_id, id_anymarket, marketplace, total_do_pedido, numero_nf, data_de_pagamento, faturado_em, faturado_por")
    .in("status", ["faturado", "concluido"])
    .not("grupo_id", "is", null);
  if (error) throw new Error(error.message);

  const lista = pedidos || [];
  if (!lista.length) return [];

  // Um pedido pode ter mais de uma linha (multi-item). O valor do pedido é o mesmo
  // em todas elas, então somar linha a linha inflaria o total: agrupa por id_anymarket
  // e soma uma vez por pedido, contando as linhas separadamente como unidades.
  const cont = {};
  lista.forEach(p => {
    const c = (cont[p.grupo_id] ||= { porPedido: {}, mp: {}, nfs: [], ultimo: null, porId: null, unidades: 0 });
    c.unidades++;
    const nome = p.marketplace || "—";
    c.mp[nome] = (c.mp[nome] || 0) + 1;
    if (p.numero_nf) c.nfs.push(String(p.numero_nf));
    if (p.faturado_em && (!c.ultimo || p.faturado_em > c.ultimo)) {
      c.ultimo = p.faturado_em;
      c.porId  = p.faturado_por || null;
    }
    const chave = String(p.id_anymarket);
    const ped = (c.porPedido[chave] ||= {
      id_anymarket: p.id_anymarket,
      valor: 0,
      unidades: 0,
      faturadoEm: null,
      pagamento: p.data_de_pagamento || null,
      nfs: [],
    });
    ped.unidades++;
    if (!ped.valor) ped.valor = p.total_do_pedido || 0;
    if (p.numero_nf) ped.nfs.push(String(p.numero_nf));
    if (p.faturado_em && (!ped.faturadoEm || p.faturado_em > ped.faturadoEm)) ped.faturadoEm = p.faturado_em;
  });

  // Busca os grupos em blocos: lista grande de ids estoura a URL do PostgREST silenciosamente.
  const ids = Object.keys(cont);
  const BLOCO_IDS = 200;
  const grupos = [];
  for (let i = 0; i < ids.length; i += BLOCO_IDS) {
    const { data, error: e2 } = await supabase
      .from("pedidos_b2c_grupos")
      .select("*")
      .in("id", ids.slice(i, i + BLOCO_IDS));
    if (e2) throw new Error(e2.message);
    grupos.push(...(data || []));
  }

  const userIds = [...new Set(Object.values(cont).map(c => c.porId).filter(Boolean))];
  const nomes = {};
  for (let i = 0; i < userIds.length; i += BLOCO_IDS) {
    const { data: perfis } = await supabase
      .from("user_profiles")
      .select("id, nome")
      .in("id", userIds.slice(i, i + BLOCO_IDS));
    (perfis || []).forEach(u => { nomes[u.id] = u.nome; });
  }

  return grupos
    .map(g => {
      const c = cont[g.id];
      const nfs = [...new Set(c.nfs)].sort((a, b) => Number(a) - Number(b));
      const pedidosFat = Object.values(c.porPedido).map(p => ({
        ...p,
        // Dias do pagamento até o faturamento. data_de_pagamento é texto DD/MM/AAAA.
        dias: diasEntrePagamentoEFaturamento(p.pagamento, p.faturadoEm),
      }));
      return {
        ...g,
        faturados: pedidosFat.length,
        unidades: c.unidades,
        valorFaturado: pedidosFat.reduce((acc, p) => acc + (p.valor || 0), 0),
        marketplaces: Object.entries(c.mp)
          .map(([nome, qtd]) => ({ nome, qtd }))
          .sort((a, b) => b.qtd - a.qtd),
        totalNfs: nfs.length,
        nfDe: nfs[0] || null,
        nfAte: nfs[nfs.length - 1] || null,
        faturadoEm: c.ultimo,
        faturadoPorNome: nomes[c.porId] || null,
        pedidosFat,
      };
    })
    .sort((a, b) => (b.numero || 0) - (a.numero || 0));
}

// data_de_pagamento vem como texto "DD/MM/AAAA HH:MM:SS" do AnyMarket. Monta a data
// por partes em vez de deixar o new Date() interpretar — evita o desvio de fuso.
function diasEntrePagamentoEFaturamento(pagamentoTxt, faturadoIso) {
  if (!pagamentoTxt || !faturadoIso) return null;
  const m = String(pagamentoTxt).match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const pag = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  const fat = new Date(faturadoIso);
  const fatUtc = Date.UTC(fat.getUTCFullYear(), fat.getUTCMonth(), fat.getUTCDate());
  const d = Math.round((fatUtc - pag) / 86400000);
  return d >= 0 ? d : null;
}

// Gera e baixa a planilha do grupo com os pedidos prontos para faturar (status embalado).
// Os que estão em análise ficam de fora — não têm peça para faturar.
export async function gerarPlanilhaFaturamentoGrupo(grupoId, userId, userNome) {
  const { data: grupo } = await supabase
    .from("pedidos_b2c_grupos")
    .select("numero")
    .eq("id", grupoId)
    .single();

  // Sem trava: qualquer usuário pode baixar (e rebaixar) a planilha do grupo.
  // Cada download é registrado em pedidos_b2c_downloads para o histórico.
  const { data: pedidos, error } = await supabase
    .from("pedidos_b2c")
    .select("*")
    .eq("grupo_id", grupoId)
    .eq("status", "embalado")
    .order("id_anymarket", { ascending: true });
  if (error) throw new Error(error.message);
  if (!pedidos?.length) return { ok: false, erro: "Nenhum pedido pronto para faturar neste grupo." };

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

  // Registra o download no histórico (todos ficam guardados)
  await supabase.from("pedidos_b2c_downloads").insert({
    grupo_id:     grupoId,
    usuario_id:   userId,
    usuario_nome: userNome || "Usuário",
    total_linhas: rows.length,
  });

  // Mantém as colunas do grupo apontando para o ÚLTIMO download (leitura rápida)
  await supabase
    .from("pedidos_b2c_grupos")
    .update({ baixado_por: userId, baixado_por_nome: userNome || "Usuário", baixado_em: new Date().toISOString() })
    .eq("id", grupoId);

  return { ok: true, total: rows.length, nomeArquivo };
}

// Lê a planilha de volta e fatura cada linha que tiver NUMERO_NF preenchido.
// Casa pelo ID_PEDIDO (id interno único). Linha sem NF é ignorada (fica para a próxima leva).
export async function importarNFsGrupo(file, grupoId, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        // Sem trava: qualquer usuário pode subir as NFs do grupo.
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

// ── Importação de NFs por XML (NF-e) ──────────────────────
// O IMEI vem no fim da descrição do produto (xProd), ex.:
//   <xProd>SAMSUNG GALAXY S24 ULTRA 512GB TITANIUM BLACK 352364850100375</xProd>
// Cuidado: <nProt> (protocolo de autorização) também tem 15 dígitos — por isso o IMEI
// é lido SÓ de dentro de det/prod/xProd, nunca varrendo o XML inteiro.
function imeiDoXProd(xProd) {
  const m = String(xProd || "").match(/(\d{15})\s*$/);
  return m ? m[1] : null;
}

// Compara SKUs ignorando sufixo de grade (-CC2/-CC3/-CC4), espaços e caixa.
function baseSku(s) {
  return String(s || "").toUpperCase().trim().replace(/\s+/g, "").replace(/-CC\d+$/, "");
}

function parseNFeXml(texto) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const um = (ctx, tag) => ctx?.getElementsByTagNameNS("*", tag)[0]?.textContent?.trim() || null;

  const infNFe = doc.getElementsByTagNameNS("*", "infNFe")[0];
  if (!infNFe) return null;
  const ide = infNFe.getElementsByTagNameNS("*", "ide")[0];

  // Chave: do protocolo, ou do atributo Id do infNFe (formato "NFe3526...")
  const chave = um(doc, "chNFe") || String(infNFe.getAttribute("Id") || "").replace(/^NFe/i, "") || null;

  const itens = [];
  const dets = infNFe.getElementsByTagNameNS("*", "det");
  for (let i = 0; i < dets.length; i++) {
    const prod = dets[i].getElementsByTagNameNS("*", "prod")[0];
    if (!prod) continue;
    const xProd = um(prod, "xProd") || "";
    itens.push({ imei: imeiDoXProd(xProd), cProd: um(prod, "cProd"), xProd });
  }

  return { numeroNf: um(ide, "nNF"), serie: um(ide, "serie"), chave, itens };
}

// Sobe XMLs de NF-e (um .xml ou um .zip com vários) e fatura casando pelo IMEI.
// Uma NF pode ter vários itens — todos são faturados com o mesmo número de nota.
// O IMEI é a identificação única do aparelho: se a NF traz o IMEI do pedido, é ele.
// O SKU só é conferido para AVISAR (não bloqueia): o sku_alocado pode estar desatualizado
// após troca de aparelho, e em "aguardando definição" a Assurant manda um substituto de
// modelo diferente — nesses casos divergir é o esperado, não erro.
export async function importarNFsXmlGrupo(file, grupoId, userId) {
  const arquivos = [];
  if (/\.zip$/i.test(file.name)) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    const nomes = Object.keys(zip.files);
    for (const nome of nomes) {
      const entrada = zip.files[nome];
      if (entrada.dir || !/\.xml$/i.test(nome)) continue;
      arquivos.push({ nome: nome.split("/").pop(), texto: await entrada.async("string") });
    }
    if (!arquivos.length) throw new Error("Nenhum arquivo .xml encontrado dentro do ZIP.");
  } else {
    arquivos.push({ nome: file.name, texto: await file.text() });
  }

  // Pedidos do grupo indexados por IMEI
  const { data: pedidosGrupo } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, status, imei_alocado, sku_alocado")
    .eq("grupo_id", grupoId);
  const porImei = {};
  (pedidosGrupo || []).forEach(p => {
    if (p.imei_alocado) porImei[String(p.imei_alocado).trim()] = p;
  });

  let faturados = 0;
  let totalItens = 0;
  const ignorados = [];
  const avisos = [];

  for (const arq of arquivos) {
    const nfe = parseNFeXml(arq.texto);
    if (!nfe) { ignorados.push({ arquivo: arq.nome, motivo: "XML inválido ou fora do padrão NF-e" }); continue; }
    if (!nfe.itens.length) { ignorados.push({ arquivo: arq.nome, motivo: "NF sem itens" }); continue; }

    for (const item of nfe.itens) {
      totalItens++;
      if (!item.imei) {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, motivo: "IMEI não encontrado na descrição do produto" });
        continue;
      }
      const pedido = porImei[item.imei];
      if (!pedido) {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, imei: item.imei, motivo: "IMEI não pertence a este grupo" });
        continue;
      }
      if (pedido.status !== "embalado") {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, imei: item.imei, pedido: pedido.id_anymarket,
                         motivo: `Pedido não está aguardando NF (status: ${pedido.status})` });
        continue;
      }

      const { error } = await supabase
        .from("pedidos_b2c")
        .update({
          status:        "faturado",
          numero_nf:     nfe.numeroNf,
          chave_nf:      nfe.chave,
          faturado_em:   new Date().toISOString(),
          faturado_por:  userId,
          atualizado_em: new Date().toISOString(),
        })
        .eq("id", pedido.id);
      if (error) {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, imei: item.imei, motivo: error.message });
        continue;
      }

      faturados++;
      // Faturou pelo IMEI; se o SKU não bate, registra o aviso para conferência posterior.
      if (item.cProd && pedido.sku_alocado && baseSku(item.cProd) !== baseSku(pedido.sku_alocado)) {
        avisos.push({ nf: nfe.numeroNf, imei: item.imei, pedido: pedido.id_anymarket,
                      motivo: `SKU da NF (${item.cProd}) diferente do alocado (${pedido.sku_alocado})` });
      }
    }
  }

  const grupoConcluido = await verificarConclusaoFaturamentoGrupo(grupoId);
  return { ok: true, faturados, ignorados, avisos, totalXmls: arquivos.length, totalItens, grupoConcluido };
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