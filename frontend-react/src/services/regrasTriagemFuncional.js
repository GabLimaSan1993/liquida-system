import { defeitoExigeQuebrado } from "./defeitosGrade.js";
import { codigoCondicaoCompra } from "./condicaoCompra.js";
export function respostaFuncionalNegativa(resposta) {
  const valor = String(resposta?.resposta || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return !!resposta?.divergente || valor === "nao";
}
export function bloqueioExigeLaudo(aparelhoBloqueado, defeitos) {
  const itens = (Array.isArray(defeitos) ? defeitos : String(defeitos || "").split(";"));
  return aparelhoBloqueado === true || itens.some(item => /^bloquead[oa](?:\s|$)|^bloqueio(?:\s|$)/i.test(String(item || "").trim()));
}
export function negativaLigaOuDesbloqueio(resposta) {
  if (!respostaFuncionalNegativa(resposta)) return false;
  const texto = String(resposta?.pergunta || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const id = resposta?.perguntaId || resposta?.pergunta_id;
  return [
    "96f0d85a-28fa-4043-af6d-c0d7d9a97a08", "4bc389af-8dd8-454c-9e0f-78f368f33fcd",
    "3806e4c1-e0ec-4c81-829c-3cd07ec10381", "f1e24699-a8c2-42b3-967a-d2d8199fca51",
    "bb2c5d8f-ef4e-4fc7-a2ad-7317340cb02f", "f6fd68af-26e4-4180-b71e-a33bedf5828b",
    "bf6f8163-0528-4d72-b650-71f6e516a970", "f7b0c886-c4b1-42d9-ae24-766be24ff585",
  ].includes(id) || /\b(liga|ligando|desbloqueado)\b|sem senha|senha ou e.?mail/.test(texto);
}
export function decidirDestino({ condicaoDeclarada, condicaoSufixo, respostas, aparelhoBloqueado = false, defeitos }) {
  const compra = codigoCondicaoCompra(condicaoDeclarada, condicaoSufixo);
  const bloqueado = bloqueioExigeLaudo(aparelhoBloqueado, defeitos);
  const negativas = (Array.isArray(respostas) ? respostas : []).filter(respostaFuncionalNegativa);
  if (compra === "BM" && (negativas.length || bloqueado)) {
    return { laudo: true, motivo: "Compra BM com negativa na triagem funcional" };
  }
  if (compra === "TR" && (bloqueado || negativas.some(negativaLigaOuDesbloqueio))) {
    return { laudo: true, motivo: "Compra TR/Defeituoso com negativa em ligar ou desbloqueio" };
  }
  return { laudo: false, motivo: compra === "TR" ? "Compra TR/Defeituoso sem negativa em ligar ou desbloqueio" : compra === "BM" ? "Compra BM sem negativa na funcional" : "Condição de compra sem regra de laudo" };
}
export function resultadoFuncional(respostas, defeitos, aparelhoBloqueado = false) {
  return bloqueioExigeLaudo(aparelhoBloqueado, defeitos) || defeitoExigeQuebrado(defeitos) || (Array.isArray(respostas) ? respostas : []).some(respostaFuncionalNegativa) ? "BAD" : "GOOD";
}

