import { supabase } from '../lib/supabase.js';

async function operar(acao, recebimentoId, codigo = null, objetoId = null) {
  if (!recebimentoId) throw new Error('Selecione uma carga dos Correios.');
  const { data, error } = await supabase.rpc('recebimento_correios_operar', {
    p_acao: acao,
    p_recebimento_id: recebimentoId,
    p_codigo: codigo,
    p_objeto_id: objetoId,
  });
  if (error) throw new Error(error.message || 'Erro ao operar o recebimento dos Correios.');
  if (!data?.ok) throw new Error(data?.erro || 'Não foi possível confirmar a operação.');
  return data;
}

export async function listarObjetosCorreios(recebimentoId) {
  return operar('listar', recebimentoId);
}

export async function biparObjetoCorreios(recebimentoId, codigo) {
  return operar('bipar', recebimentoId, codigo);
}

export async function estornarObjetoCorreios(recebimentoId, objetoId) {
  return operar('estornar', recebimentoId, null, objetoId);
}

export async function concluirRecebimentoCorreios(recebimentoId) {
  // Não gera voucher YBV nem libera triagem. Os itens aguardam vínculo posterior.
  return operar('concluir', recebimentoId);
}
