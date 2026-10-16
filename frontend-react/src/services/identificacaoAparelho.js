export function tipoDoAparelho(modelo = "", tipoCatalogo = "") {
  const nome = String(modelo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (tipoCatalogo === "SMARTWATCH") return "RELOGIO";
  if (tipoCatalogo === "TABLET") return "TABLET";
  if (/WATCH|RELOGIO|SMARTWATCH|\bBAND\b/.test(nome)) return "RELOGIO";
  if (/IPAD|TABLET|\bTAB\b|MATEPAD|XIAOMI PAD|REDMI PAD|LENOVO.*PAD/.test(nome))
    return "TABLET";
  return "CELULAR";
}

export function erroIdentificacao(tipo, codigo, imei2 = "") {
  const primeiro = String(codigo || "").trim();
  const segundo = String(imei2 || "").trim();
  if (tipo === "CELULAR") {
    if (!/^\d{15}$/.test(primeiro))
      return "O IMEI 1 deve ter exatamente 15 dígitos numéricos.";
    if (!/^\d{15}$/.test(segundo))
      return "Bipe o IMEI 2 com exatamente 15 dígitos numéricos.";
    if (primeiro === segundo)
      return "Os dois IMEIs devem ser diferentes. Confira os códigos em *#06#.";
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/.test(primeiro)) {
    return "Bipe a referência/serial do aparelho (3 a 64 caracteres, sem espaços).";
  }
  return null;
}
