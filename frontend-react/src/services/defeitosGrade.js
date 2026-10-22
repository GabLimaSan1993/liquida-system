const FAIXAS_BATERIA_SEM_DEFEITO = new Set([
  "saude da bateria abaixo de 80%",
  "saude da bateria entre 80% e 85%",
]);

export function ehFaixaBateriaSemDefeito(valor) {
  return FAIXAS_BATERIA_SEM_DEFEITO.has(String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase());
}

export function filtrarDefeitosAdicionais(defeitos) {
  const lista = Array.isArray(defeitos) ? defeitos : String(defeitos || "").split(";");
  return lista.map(defeito => String(defeito || "").trim()).filter(defeito => defeito && !ehFaixaBateriaSemDefeito(defeito));
}

// Faixas de saúde da bateria não são defeitos adicionais.
export function defeitoExigeQuebrado(defeitos) {
  return filtrarDefeitosAdicionais(defeitos).length > 0;
}
