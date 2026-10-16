export function tipoDoAparelho(modelo = "", tipoCatalogo = "") {
  const nome = String(modelo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
  if (["SMARTWATCH", "RELOGIO"].includes(String(tipoCatalogo).toUpperCase())) return "RELOGIO";
  if (tipoCatalogo === "TABLET") return "TABLET";
  if (/WATCH|RELOGIO|SMARTWATCH|\bBAND\b|\bFIT\s*\d/.test(nome)) return "RELOGIO";
  if (/IPAD|TABLET|\bTAB\b|MATEPAD|XIAOMI PAD|REDMI PAD|LENOVO.*PAD/.test(nome))
    return "TABLET";
  return "CELULAR";
}

export function exigeDoisImeis(modelo = "", tipoCatalogo = "", aparelhoBloqueado = false, danosTela = false) {
  if (danosTela || aparelhoBloqueado || tipoDoAparelho(modelo, tipoCatalogo) !== "CELULAR") return false;
  const nome = String(modelo).toUpperCase();
  return !(/\bIPHONE\s*[567](?:S|C)?(?:\b|(?=PLUS))/.test(nome) || /\b(?:MOTO(?:ROLA)?\s+)?ONE\s+(?:MICRO|MACRO)\b/.test(nome));
}

export function erroIdentificacao(tipo, codigo, imei2 = "", { modelo = "", aparelhoBloqueado = false, danosTela = false } = {}) {
  const primeiro = String(codigo || "").trim();
  const segundo = String(imei2 || "").trim();
  if (danosTela && segundo) return "Danos da tela permite informar apenas um código.";
  if (danosTela && !primeiro) return null;
  if (tipo === "CELULAR") {
    if (!/^\d{15}$/.test(primeiro))
      return "O IMEI 1 deve ter exatamente 15 dígitos numéricos.";
    if (exigeDoisImeis(modelo, tipo, aparelhoBloqueado, danosTela) && !/^\d{15}$/.test(segundo))
      return "Bipe o IMEI 2 com exatamente 15 dígitos numéricos.";
    if (segundo && !/^\d{15}$/.test(segundo))
      return "O IMEI 2 deve ter exatamente 15 dígitos numéricos.";
    if (primeiro === segundo)
      return "Os dois IMEIs devem ser diferentes. Confira os códigos em *#06#.";
  } else if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/.test(primeiro)) {
    return "Bipe a referência/serial do aparelho (3 a 64 caracteres, sem espaços).";
  }
  return null;
}
