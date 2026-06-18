import { supabase } from "../lib/supabase";

export async function criarTroca(dados, skus, userId) {
  const { data: troca, error } = await supabase
    .from("trocas_b2c")
    .insert({
      id_anymarket:          dados.id_anymarket,
      nome_cliente:          dados.nome_cliente,
      cpf:                   dados.cpf,
      endereco:              dados.endereco,
      endereco_cep:          dados.endereco_cep,
      endereco_rua:          dados.endereco_rua,
      endereco_numero:       dados.endereco_numero,
      endereco_complemento:  dados.endereco_complemento,
      endereco_bairro:       dados.endereco_bairro,
      endereco_cidade:       dados.endereco_cidade,
      endereco_estado:       dados.endereco_estado,
      produto_original:      dados.produto_original,
      produto_condicao:      dados.produto_condicao,
      produto_grade:         dados.produto_grade,
      status:                "em_aberto",
      criado_por:            userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (skus?.length > 0) {
    const { error: errSkus } = await supabase
      .from("trocas_b2c_skus")
      .insert(
        skus.map((s, idx) => ({
          troca_id:   troca.id,
          sku:        s.sku,
          descricao:  s.descricao,
          grade:      s.grade || null,
          observacao: s.observacao || null,
          ordem:      idx,
        }))
      );
    if (errSkus) throw new Error(errSkus.message);
  }

  return troca;
}

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

export async function buscarTroca(id) {
  const { data, error } = await supabase
    .from("trocas_b2c")
    .select("*, trocas_b2c_skus(*), trocas_b2c_operacao(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarStatusTroca(id, status) {
  const { error } = await supabase
    .from("trocas_b2c")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function salvarOperacao(trocaId, dados, userId) {
  const { data: existente } = await supabase
    .from("trocas_b2c_operacao")
    .select("id")
    .eq("troca_id", trocaId)
    .single();

  if (existente) {
    const { error } = await supabase
      .from("trocas_b2c_operacao")
      .update({ ...dados, atualizado_em: new Date().toISOString(), atualizado_por: userId })
      .eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_operacao")
      .insert({ troca_id: trocaId, ...dados, atualizado_por: userId });
    if (error) throw new Error(error.message);
  }
}

export async function buscarDescricaoPorSku(sku) {
  if (!sku || sku.trim().length < 4) return null;
  const { data } = await supabase
    .from("assurant_triagem")
    .select("sku, modelo")
    .eq("sku", sku.trim())
    .limit(1)
    .single();
  return data?.modelo || null;
}

// ════════════════════════════════════════════════════════
// SUGESTÃO FIFO (visão Oracle via estoque_subinv)
// Reutilizável para Trocas B2C e B2C em geral.
// Chama a RPC buscar_fifo_sku, que faz o JOIN triagem + estoque_subinv,
// ordena por data_subinv ASC (mais antigo primeiro) e classifica o status.
// ════════════════════════════════════════════════════════
export async function buscarSugestoesFIFO(skus, limite = 5) {
  if (!skus?.length) return {};

  const resultado = {};

  for (const skuObj of skus) {
    const sku = skuObj.sku?.trim();
    if (!sku) continue;

    const { data, error } = await supabase
      .rpc("buscar_fifo_sku", { p_sku: sku, p_limite: limite });

    if (error) {
      resultado[sku] = { erro: error.message, candidatos: [], gradeDesejada: skuObj.grade || null };
      continue;
    }

    resultado[sku] = {
      erro:          null,
      gradeDesejada: skuObj.grade || null,
      observacao:    skuObj.observacao || null,
      candidatos:    data || [],
    };
  }

  return resultado;
}

// Mantida para retrocompatibilidade — agora delega para o FIFO Oracle
export async function buscarSugestoesPorSku(skus) {
  const fifo = await buscarSugestoesFIFO(skus, 5);
  // Converte para o formato antigo (array por sku) caso algo ainda use
  const legado = {};
  for (const [sku, info] of Object.entries(fifo)) {
    legado[sku] = info.candidatos || [];
  }
  return legado;
}

export async function validarImeiTroca(imei, skusAceitos) {
  const imeiTrim = String(imei).trim();

  const { data: triagem } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, modelo, local, grade, status_atual, criado_em")
    .eq("imei", imeiTrim)
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  if (!triagem) return { ok: false, erro: "IMEI não encontrado na base Assurant." };

  const skusAceitosLista = skusAceitos.map(s => s.sku?.trim()).filter(Boolean);
  if (!skusAceitosLista.includes(triagem.sku)) {
    return {
      ok: false,
      erro: `SKU do aparelho (${triagem.sku}) não está na lista de SKUs aceitos para esta troca.`,
    };
  }

  // Precisa estar fisicamente no estoque Oracle
  const { data: subinv } = await supabase
    .from("estoque_subinv")
    .select("imei, data_subinv")
    .eq("imei", imeiTrim)
    .single();

  if (!subinv) return { ok: false, erro: "IMEI não está no estoque Oracle (subinventory) — indisponível." };

  const { data: b2bItem } = await supabase
    .from("b2b_itens")
    .select("id, status")
    .eq("imei", imeiTrim)
    .in("status", ["pendente", "bipado"])
    .single();

  if (b2bItem) return { ok: false, erro: "IMEI reservado em pedido B2B ativo — não disponível para troca." };

  const { data: trocaAtiva } = await supabase
    .from("trocas_b2c_operacao")
    .select("id")
    .eq("imei", imeiTrim)
    .in("status_furbtech", ["em_separacao", "faturado", "postado"])
    .single();

  if (trocaAtiva) return { ok: false, erro: "IMEI já está sendo usado em outra troca B2C." };

  const agingOracle = Math.floor(
    (new Date() - new Date(subinv.data_subinv)) / (1000 * 60 * 60 * 24)
  );

  return { ok: true, item: { ...triagem, data_subinv: subinv.data_subinv, aging_oracle: agingOracle } };
}

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
      .from("trocas_b2c_operacao").update(payload).eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_operacao").insert({ troca_id: trocaId, ...payload });
    if (error) throw new Error(error.message);
  }

  await atualizarStatusTroca(trocaId, "em_aberto");
}

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

  await atualizarStatusTroca(trocaId, dados.rastreio ? "concluido" : "em_aberto");
}

export async function moverParaReembolso(trocaId) {
  await atualizarStatusTroca(trocaId, "movido_reembolso");
}