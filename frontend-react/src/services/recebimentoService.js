import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// RECEBIMENTO YBV — carga, bipagem de vouchers e romaneio
// ══════════════════════════════════════════════════════════

const TRANSPORTADORAS = ["DHL", "Safe", "ViCargo"];

// ── Criar a carga (tela 1) ──
export async function criarRecebimento({ transportadora, motorista_nome, motorista_cpf, placa, lacres }, userId, userNome) {
  if (!TRANSPORTADORAS.includes(transportadora)) {
    return { ok: false, erro: "Selecione uma transportadora válida." };
  }
  const { data, error } = await supabase
    .from("recebimentos")
    .insert({
      transportadora,
      motorista_nome:    motorista_nome?.trim() || null,
      motorista_cpf:     motorista_cpf?.trim() || null,
      placa:             placa?.trim().toUpperCase() || null,
      lacres:            Array.isArray(lacres) ? lacres : [],
      iniciado_por:      userId,
      iniciado_por_nome: userNome || null,
      status:            "em_andamento",
    })
    .select()
    .single();
  if (error) return { ok: false, erro: error.message };
  return { ok: true, recebimento: data };
}

// ── Bipar um voucher (tela 2) ──
// Regras: precisa começar com YBV; não duplica na mesma carga.
export async function biparVoucher(recebimentoId, voucherDigitado, userId, userNome) {
  const voucher = String(voucherDigitado || "").trim().toUpperCase();
  if (!voucher) return { ok: false, erro: "Bipe um voucher." };
  if (!voucher.startsWith("YBV")) {
    return { ok: false, erro: `"${voucher}" não inicia com YBV — ignorado.`, ignorado: true };
  }

  const { data, error } = await supabase
    .from("recebimento_vouchers")
    .insert({
      recebimento_id:  recebimentoId,
      voucher,
      bipado_por:      userId,
      bipado_por_nome: userNome || null,
    })
    .select()
    .single();

  if (error) {
    // 23505 = violação de unique (voucher repetido nesta carga)
    if (error.code === "23505") {
      return { ok: false, erro: `Voucher ${voucher} já foi bipado nesta carga.`, duplicado: true };
    }
    return { ok: false, erro: error.message };
  }

  // Atualiza o contador da carga
  await atualizarTotal(recebimentoId);
  return { ok: true, voucher: data };
}

// ── Remover um voucher bipado por engano ──
export async function removerVoucher(voucherId, recebimentoId) {
  const { error } = await supabase.from("recebimento_vouchers").delete().eq("id", voucherId);
  if (error) return { ok: false, erro: error.message };
  await atualizarTotal(recebimentoId);
  return { ok: true };
}

async function atualizarTotal(recebimentoId) {
  const { count } = await supabase
    .from("recebimento_vouchers")
    .select("id", { count: "exact", head: true })
    .eq("recebimento_id", recebimentoId);
  await supabase.from("recebimentos")
    .update({ total_vouchers: count || 0 })
    .eq("id", recebimentoId);
  return count || 0;
}

// ── Listar vouchers de uma carga ──
export async function listarVouchers(recebimentoId) {
  const { data, error } = await supabase
    .from("recebimento_vouchers")
    .select("id, voucher, bipado_em, bipado_por_nome")
    .eq("recebimento_id", recebimentoId)
    .order("bipado_em", { ascending: false });
  if (error) return [];
  return data || [];
}

// ── Concluir a carga (grava a hora de término) ──
export async function concluirRecebimento(recebimentoId, userId) {
  const total = await atualizarTotal(recebimentoId);
  const { data, error } = await supabase
    .from("recebimentos")
    .update({ status: "concluido", concluido_em: new Date().toISOString(), concluido_por: userId })
    .eq("id", recebimentoId)
    .select()
    .single();
  if (error) return { ok: false, erro: error.message };
  return { ok: true, recebimento: data, total };
}

// ── Buscar o romaneio completo (cabeçalho + vouchers) ──
export async function buscarRomaneio(recebimentoId) {
  const { data: rec, error } = await supabase
    .from("recebimentos").select("*").eq("id", recebimentoId).single();
  if (error) return { ok: false, erro: error.message };

  const { data: vouchers } = await supabase
    .from("recebimento_vouchers")
    .select("voucher, bipado_em, bipado_por_nome")
    .eq("recebimento_id", recebimentoId)
    .order("bipado_em", { ascending: true });

  return { ok: true, recebimento: rec, vouchers: vouchers || [] };
}

// ── Listar recebimentos recentes (para retomar / histórico) ──
export async function listarRecebimentos(limite = 30) {
  const { data, error } = await supabase
    .from("recebimentos")
    .select("id, transportadora, motorista_nome, placa, status, iniciado_em, concluido_em, total_vouchers, iniciado_por_nome")
    .order("iniciado_em", { ascending: false })
    .limit(limite);
  if (error) return [];
  return data || [];
}

export { TRANSPORTADORAS };