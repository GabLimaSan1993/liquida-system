// Qualquer defeito adicional selecionado prevalece sobre a avaliação estética.
export function defeitoExigeQuebrado(defeitos) {
  const lista = Array.isArray(defeitos) ? defeitos : String(defeitos || "").split(";");
  return lista.some(defeito => String(defeito || "").trim().length > 0);
}
