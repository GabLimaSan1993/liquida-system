// src/services/trocasB2CService.js
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
  // Verifica se já existe operação
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