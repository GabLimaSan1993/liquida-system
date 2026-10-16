import { defeitoExigeQuebrado } from "./defeitosGrade.js";
export function respostaFuncionalNegativa(resposta) {
  const valor = String(resposta?.resposta || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return !!resposta?.divergente || valor === "nao";
}
export function bloqueioExigeLaudo(aparelhoBloqueado, defeitos) {
  const itens = (Array.isArray(defeitos) ? defeitos : String(defeitos || "").split(";"));
  return aparelhoBloqueado === true || itens.some(item => /^bloquead[oa](?:\s|$)|^bloqueio(?:\s|$)/i.test(String(item || "").trim()));
}
export function decidirDestino({ respostas, aparelhoBloqueado = false, defeitos }) {
  if (bloqueioExigeLaudo(aparelhoBloqueado, defeitos)) return { laudo: true, motivo: "Aparelho bloqueado exige laudo" };
  const negativas = (Array.isArray(respostas) ? respostas : []).filter(respostaFuncionalNegativa);
  return negativas.length
    ? { laudo: true, motivo: `Resposta negativa na funcional: ${negativas.length} pergunta(s)` }
    : { laudo: false, motivo: "Sem respostas negativas na funcional" };
}
export function resultadoFuncional(respostas, defeitos, aparelhoBloqueado = false) {
  return bloqueioExigeLaudo(aparelhoBloqueado, defeitos) || defeitoExigeQuebrado(defeitos) || (Array.isArray(respostas) ? respostas : []).some(respostaFuncionalNegativa) ? "BAD" : "GOOD";
}
