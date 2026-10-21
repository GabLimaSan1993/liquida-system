import { STATUS_RESERVA_POSICAO } from "./lavadorasTriagemService.js";

function normalizarOperador(valor) {
  return String(valor || "").trim().toLocaleLowerCase("pt-BR").replace(/\s+/g, " ");
}

export function painelDoOperador(painel, operador, { verTodos = false } = {}) {
  const nome = normalizarOperador(operador);
  const ciclos = painel.ciclos || [];
  const pertenceAoOperador = (ciclo) =>
    Boolean(nome) && normalizarOperador(ciclo.operador) === nome;
  const reservados = ciclos.filter((ciclo) => STATUS_RESERVA_POSICAO.includes(ciclo.status));

  return {
    ...painel,
    ciclos: verTodos === true ? ciclos : ciclos.filter(pertenceAoOperador),
    posicoesOcupadas: [...new Set(reservados.map((ciclo) => String(ciclo.posicao)))],
    posicoesDeOutros: verTodos === true ? [] : [...new Set(reservados
      .filter((ciclo) => !pertenceAoOperador(ciclo))
      .map((ciclo) => String(ciclo.posicao)))],
  };
}
