import { supabase } from "../lib/supabase";

// ── Criar solicitação de troca (Assurant) ────────────────
export async function criarTroca(dados, skus, userId) {
  const { data: troca, error } = await supabase
    .from("trocas_b2c")
    .insert({
      id_anymarket:     dados.id_anymarket,
      nome_cliente:     dados.nome_cliente,
      cpf:              dados.cpf,
      endereco:         dados.endereco,
      produto_original: dados.produto_original,
      status:           "em_aberto",
      criado_por:       userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (skus?.length > 0) {
    const { error: errSkus } = await supabase
      .from("trocas_b2c_skus")
      .insert(
        skus.map((s, idx) => ({
          troca_id:  troca.id,
          sku:       s.sku,
          descricao: s.descricao,
          ordem:     idx,
        }))
      );
    if (errSkus) throw new Error(errSkus.message);
  }

  return troca;
}

// ── Listar trocas ─────────────────────────────────────────
export async function listarTrocas(filtroStatus = null) {
  let query = supabase
    .from("trocas_b2c")
    .select("*, trocas_b2c_skus(*), trocas_b2c_operacao(*)")
    .order("criado_em", { ascending: false });

  if (filtroStatus) query = query.eq("status", filtroStatus);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Buscar troca por ID ───────────────────────────────────
export async function buscarTroca(id) {
  const { data, error } = await supabase
    .from("trocas_b2c")
    .select("*, trocas_b2c_skus(*), trocas_b2c_operacao(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ── Atualizar status da troca ─────────────────────────────
export async function atualizarStatusTroca(id, status) {
  const { error } = await supabase
    .from("trocas_b2c")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

// ── Salvar/atualizar operação Furbtech ───────────────────
export async function salvarOperacao(trocaId, dados, userId) {
  const { data: existente } = await supabase
    .from("trocas_b2c_operacao")
    .select("id")
    .eq("troca_id", trocaId)
    .single();

  if (existente) {
    const { error } = await supabase
      .from("trocas_b2c_operacao")
      .update({
        ...dados,
        atualizado_em:  new Date().toISOString(),
        atualizado_por: userId,
      })
      .eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_operacao")
      .insert({
        troca_id:       trocaId,
        ...dados,
        atualizado_por: userId,
      });
    if (error) throw new Error(error.message);
  }
}

// ── Buscar sugestões FIFO por SKU ────────────────────────
// Para cada SKU da lista, retorna os 5 IMEIs mais antigos disponíveis
// Regras:
//   1. Existe em assurant_triagem com o SKU correto
//   2. Não está em b2b_itens com status pendente/bipado
//   3. Não está em trocas_b2c_operacao já em uso
export async function buscarSugestoesPorSku(skus) {
  if (!skus?.length) return {};

  // Buscar IMEIs já usados em trocas (em separação ou faturado)
  const { data: imeisEmTroca } = await supabase
    .from("trocas_b2c_operacao")
    .select("imei")
    .not("imei", "is", null)
    .in("status_furbtech", ["em_separacao", "faturado", "postado"]);

  const imeisOcupadosTroca = new Set((imeisEmTroca || []).map(i => i.imei).filter(Boolean));

  // Buscar IMEIs ocupados no B2B
  const { data: imeisB2B } = await supabase
    .from("b2b_itens")
    .select("imei")
    .in("status", ["pendente", "bipado"]);

  const imeisOcupadosB2B = new Set((imeisB2B || []).map(i => i.imei).filter(Boolean));

  const resultado = {};

  for (const skuObj of skus) {
    const sku = skuObj.sku?.trim();
    if (!sku) continue;

    // Buscar candidatos na triagem ordenados por data_alocacao (FIFO)
    const { data: candidatos } = await supabase
      .from("assurant_triagem")
      .select("imei, sku, modelo, local, data_alocacao, grade, status_atual")
      .eq("sku", sku)
      .not("imei", "is", null)
      .order("data_alocacao", { ascending: true })
      .limit(50); // busca mais para filtrar os ocupados

    const disponiveis = (candidatos || []).filter(c =>
      c.imei &&
      !imeisOcupadosTroca.has(c.imei) &&
      !imeisOcupadosB2B.has(c.imei)
    ).slice(0, 5); // pega os 5 mais antigos

    resultado[sku] = disponiveis;
  }

  return resultado;
}

// ── Validar IMEI para separação ──────────────────────────
export async function validarImeiTroca(imei, skusAceitos) {
  const imeiTrim = String(imei).trim();

  // 1. Existe na triagem?
  const { data: triagem } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, modelo, local, data_alocacao, grade")
    .eq("imei", imeiTrim)
    .single();

  if (!triagem) return { ok: false, erro: "IMEI não encontrado na base Assurant." };

  // 2. SKU compatível com os aceitos?
  const skusAceitosLista = skusAceitos.map(s => s.sku?.trim()).filter(Boolean);
  if (!skusAceitosLista.includes(triagem.sku)) {
    return {
      ok: false,
      erro: `SKU do aparelho (${triagem.sku}) não está na lista de SKUs aceitos para esta troca.`,
    };
  }

  // 3. Não está em pedido B2B ativo?
  const { data: b2bItem } = await supabase
    .from("b2b_itens")
    .select("id, status, pedido_id")
    .eq("imei", imeiTrim)
    .in("status", ["pendente", "bipado"])
    .single();

  if (b2bItem) {
    return { ok: false, erro: "IMEI reservado em pedido B2B ativo — não disponível para troca." };
  }

  // 4. Não está em outra troca ativa?
  const { data: trocaAtiva } = await supabase
    .from("trocas_b2c_operacao")
    .select("id, troca_id, status_furbtech")
    .eq("imei", imeiTrim)
    .in("status_furbtech", ["em_separacao", "faturado", "postado"])
    .single();

  if (trocaAtiva) {
    return { ok: false, erro: "IMEI já está sendo usado em outra troca B2C." };
  }

  return { ok: true, item: triagem };
}

// ── Registrar separação (bipar IMEI) ─────────────────────
export async function registrarSeparacao(trocaId, imei, skuEscolhido, userId) {
  const { data: existente } = await supabase
    .from("trocas_b2c_operacao")
    .select("id")
    .eq("troca_id", trocaId)
    .single();

  const payload = {
    sku_escolhido:   skuEscolhido,
    imei,
    data_separacao:  new Date().toISOString().split("T")[0],
    status_furbtech: "em_separacao",
    atualizado_em:   new Date().toISOString(),
    atualizado_por:  userId,
  };

  if (existente) {
    const { error } = await supabase
      .from("trocas_b2c_operacao")
      .update(payload)
      .eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_operacao")
      .insert({ troca_id: trocaId, ...payload });
    if (error) throw new Error(error.message);
  }

  // Atualiza status da troca
  await atualizarStatusTroca(trocaId, "em_aberto");
}

// ── Registrar faturamento ────────────────────────────────
export async function registrarFaturamento(trocaId, dados, userId) {
  const { error } = await supabase
    .from("trocas_b2c_operacao")
    .update({
      nf:              dados.nf,
      aut_postagem:    dados.aut_postagem,
      rastreio:        dados.rastreio,
      status_furbtech: dados.rastreio ? "postado" : "faturado",
      atualizado_em:   new Date().toISOString(),
      atualizado_por:  userId,
    })
    .eq("troca_id", trocaId);

  if (error) throw new Error(error.message);

  // Se tem rastreio, conclui a troca
  const novoStatus = dados.rastreio ? "concluido" : "em_aberto";
  await atualizarStatusTroca(trocaId, novoStatus);
}

// ── Mover para reembolso ──────────────────────────────────
export async function moverParaReembolso(trocaId) {
  await atualizarStatusTroca(trocaId, "movido_reembolso");
}