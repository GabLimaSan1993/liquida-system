// Classificação comercial do retorno: resultado técnico, não a grade de entrada.
export const CLASSIFICACOES_LAB = [
  { valor: 'reparado', rotulo: 'Reparado', classe: 'bg-lime-100 text-lime-950 border-lime-400', linha: 'bg-lime-100/80 hover:bg-lime-200/80' },
  { valor: 'sem_reparo', rotulo: 'Quebrado', classe: 'bg-blue-100 text-blue-900 border-blue-400', linha: 'bg-blue-100/80 hover:bg-blue-200/80' },
  { valor: 'irrecuperavel', rotulo: 'Scrap', classe: 'bg-red-100 text-red-900 border-red-400', linha: 'bg-red-100/80 hover:bg-red-200/80' },
];
export const classificacaoLaboratorio = resultado =>
  CLASSIFICACOES_LAB.find(c => c.valor === resultado) || null;

export function validarClassificacaoUnica(itens, resultado) {
  if (!resultado || !classificacaoLaboratorio(resultado)) {
    throw new Error('Selecione o resultado final para gerar o romaneio: Reparado, Quebrado ou Scrap.');
  }
  if (!Array.isArray(itens) || !itens.length) {
    throw new Error('Nenhum aparelho concluído selecionado.');
  }
  if (itens.some(i => i.resultado !== resultado)) {
    throw new Error('O romaneio deve conter somente aparelhos da classificação selecionada.');
  }
  return itens;
}
