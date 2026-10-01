import { supabase } from "../lib/supabase";

/**
 * Resolve o identificador operacional canônico do voucher.
 *
 * Regra:
 * - entrada YBV123456 -> YBV123456
 * - entrada 123456 -> se YBV123456 já existe na triagem, usa YBV123456
 * - caso contrário, preserva a entrada original
 *
 * Isso evita criar um segundo registro numérico para um voucher YBV já
 * existente no legado/Gaia.
 */
export async function resolverVoucherCanonico(voucher) {
  const bruto = String(voucher || "").trim().toUpperCase();
  if (!bruto) return "";

  const somenteNumeros = /^\d+$/.test(bruto);
  const candidatoYbv = somenteNumeros ? `YBV${bruto}` : null;

  if (candidatoYbv) {
    const { data, error } = await supabase
      .from("assurant_triagem")
      .select("voucher")
      .eq("voucher", candidatoYbv)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (data?.voucher) return data.voucher;
  }

  return bruto;
}

export function numeroVoucher(voucher) {
  const texto = String(voucher || "").trim().toUpperCase();
  const match = texto.match(/(\d+)/);
  return match ? match[1] : "";
}
