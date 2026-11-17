export const DEFEITOS_SCRAP = Object.freeze(['Scrap - Não Liga', 'Scrap - Bloqueado Conta']);

export function validarConclusaoLaboratorio(resultado, defeitos = []) {
  const ativos = Array.isArray(defeitos) ? defeitos : [];
  if (resultado === 'reparado' && ativos.length > 0) {
    return 'Reparado exige zero defeitos ativos. Remova ou resolva todos os defeitos antes de concluir.';
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
