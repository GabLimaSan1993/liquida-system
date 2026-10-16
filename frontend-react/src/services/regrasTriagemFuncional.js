import { defeitoExigeQuebrado } from "./defeitosGrade.js";
export function respostaFuncionalNegativa(resposta) {
  const valor = String(resposta?.resposta || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return !!resposta?.divergente || valor === "nao";
}
export function decidirDestino({ respostas }) {
  const negativas = (Array.isArray(respostas) ? respostas : []).filter(respostaFuncionalNegativa);
  return negativas.length
    ? { laudo: true, motivo: `Resposta negativa na funcional: ${negativas.length} pergunta(s)` }
    : { laudo: false, motivo: "Sem respostas negativas na funcional" };
}
export function resultadoFuncional(respostas, defeitos) {
  return defeitoExigeQuebrado(defeitos) || (Array.isArray(respostas) ? respostas : []).some(respostaFuncionalNegativa) ? "BAD" : "GOOD";
}
