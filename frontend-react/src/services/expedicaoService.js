import { supabase } from "../lib/supabase";

const CANAIS_VALIDOS = ["magalu", "meli", "via_varejo", "seguradora"];

export function canaisExpedicao() {
  return [
    { id: "magalu",     nome: "Magalu" },
    { id: "meli",       nome: "Meli" },
    { id: "via_varejo", nome: "Via Varejo" },
    { id: "seguradora", nome: "Seguradora" },
  ];
}

// Abre um romaneio novo para o canal, ou devolve o que já está aberto (um por canal).
export async function abrirRomaneio(canal, userId, userNome) {
  if (!CANAIS_VALIDOS.includes(canal)) throw new Error("Canal inválido.");

  const { data: existente } = await supabase
    .from("romaneios")
    .select("*")
    .eq("canal", canal)
    .eq("status", "aberto")
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existente) return existente;

  const { data, error } = await supabase
    .from("romaneios")
    .insert({ canal, criado_por: userId, criado_por_nome: userNome || "Operador" })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarItens(romaneioId) {
  const { data, error } = await supabase
    .from("romaneio_itens")
    .select("*")
    .eq("romaneio_id", romaneioId)
    .order("bipado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// Bipa um par chave+etiqueta. Valida 44 dígitos e bloqueia chave duplicada no romaneio.
export async function biparVolume(romaneioId, chaveNf, etiqueta, userId) {
  const chave = String(chaveNf || "").replace(/\D/g, "");
  const et = String(etiqueta || "").trim();
  if (chave.length !== 44) throw new Error(`A chave da NF precisa ter 44 dígitos (tem ${chave.length}).`);
  if (!et) throw new Error("Etiqueta vazia.");

  const { data: existe } = await supabase
    .from("romaneio_itens")
    .select("id")
    .eq("romaneio_id", romaneioId)
    .eq("chave_nf", chave)
    .maybeSingle();
  if (existe) throw new Error("Essa chave já foi bipada neste romaneio.");

  const { data, error } = await supabase
    .from("romaneio_itens")
    .insert({ romaneio_id: romaneioId, chave_nf: chave, etiqueta: et, bipado_por: userId })
    .select("*")
    .single();
  if (error) {
    if (String(error.message).includes("uniq_rom_item_chave"))
      throw new Error("Essa chave já foi bipada neste romaneio.");
    throw new Error(error.message);
  }

  const { count } = await supabase
    .from("romaneio_itens")
    .select("id", { count: "exact", head: true })
    .eq("romaneio_id", romaneioId);
  await supabase.from("romaneios").update({ total_volumes: count || 0 }).eq("id", romaneioId);

  return data;
}

export async function removerItem(itemId, romaneioId) {
  const { error } = await supabase.from("romaneio_itens").delete().eq("id", itemId);
  if (error) throw new Error(error.message);
  const { count } = await supabase
    .from("romaneio_itens")
    .select("id", { count: "exact", head: true })
    .eq("romaneio_id", romaneioId);
  await supabase.from("romaneios").update({ total_volumes: count || 0 }).eq("id", romaneioId);
}

export async function fecharRomaneio(romaneioId) {
  const { count } = await supabase
    .from("romaneio_itens")
    .select("id", { count: "exact", head: true })
    .eq("romaneio_id", romaneioId);
  if (!count) throw new Error("Não é possível fechar um romaneio sem volumes.");

  const { data, error } = await supabase
    .from("romaneios")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), total_volumes: count })
    .eq("id", romaneioId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}