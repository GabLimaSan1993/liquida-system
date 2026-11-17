export const DEFEITOS_SCRAP = Object.freeze(['Scrap - Não Liga', 'Scrap - Bloqueado Conta']);

// Incompatíveis com o destino "Não Reparado Desbloqueado".
// "Não Liga" é a grafia curta já disponível no catálogo da triagem.
export const DEFEITOS_INCOMPATIVEIS_DESBLOQUEADO = Object.freeze([
  'Bloqueado Senha',
  'Bloqueado Com Senha (Tela)',
  'Não Inicializa',
  'Aparelho Não Liga',
  'Não Liga',
  'Bloqueado Conta',
  'Bloqueado Com Senha',
  'Scrap - Não Liga',
  'Scrap - Bloqueado Conta',
]);

const normalizarDefeito = valor => String(valor ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');

const nomesIncompativeis = new Set(DEFEITOS_INCOMPATIVEIS_DESBLOQUEADO.map(normalizarDefeito));

export function defeitosBloqueantesDesbloqueado(defeitos = []) {
  if (!Array.isArray(defeitos)) return [];
  return [...new Set(defeitos.filter(d => nomesIncompativeis.has(normalizarDefeito(d))))];
}

export function validarConclusaoLaboratorio(resultado, defeitos = []) {
  const ativos = Array.isArray(defeitos) ? defeitos : [];
  if (resultado === 'reparado' && ativos.length > 0) {
    return 'Reparado exige zero defeitos ativos. Remova ou resolva todos os defeitos antes de concluir.';
  }
  if (resultado === 'sem_reparo') {
    const bloqueantes = defeitosBloqueantesDesbloqueado(ativos);
    if (bloqueantes.length) {
      return 'Não Reparado Desbloqueado não permite os seguintes defeitos ativos: ' +
        bloqueantes.join('; ') + '. Resolva/remova os defeitos ou ajuste o resultado antes de concluir.';
    }
  }
  if (resultado === 'irrecuperavel' && !ativos.some(d => DEFEITOS_SCRAP.includes(d))) {
    return 'Scrap exige o defeito Scrap - Não Liga ou Scrap - Bloqueado Conta. Selecione a classificação antes de concluir.';
  }
  return '';
}

export function selecionarDefeitoScrap(defeitos = [], selecionado) {
  if (!DEFEITOS_SCRAP.includes(selecionado)) return Array.isArray(defeitos) ? defeitos : [];
  return [...(Array.isArray(defeitos) ? defeitos : []).filter(d => !DEFEITOS_SCRAP.includes(d)), selecionado];
}
