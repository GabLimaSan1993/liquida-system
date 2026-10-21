export const FORMATO_VOUCHER_RECEBIMENTO = /^YBV[0-9]{6}$/;

export function validarVoucherRecebimento(valor) {
  const voucher = String(valor ?? "").trim().toUpperCase();
  if (!voucher) return { ok: false, voucher, erro: "Bipe ou digite um voucher no formato YBV123456." };
  if (!voucher.startsWith("YBV")) {
    return { ok: false, voucher, erro: "O voucher deve começar obrigatoriamente com as letras YBV. Exemplo: YBV123456." };
  }
  if (!FORMATO_VOUCHER_RECEBIMENTO.test(voucher)) {
    return { ok: false, voucher, erro: "Após YBV, informe exatamente 6 números, sem letras, espaços ou símbolos. Exemplo: YBV123456." };
  }
  return { ok: true, voucher };
}
