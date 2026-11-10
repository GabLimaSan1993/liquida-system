import { supabase } from '../lib/supabase.js';

export const ROTAS_TRADEIN_ONLINE = [
  { id: 'vinculacao', titulo: 'Vinculação de Objetos', rota: '/v2/assurant/online/vinculacao', etapa: null },
  { id: 'triagem-als', titulo: 'Triagem ALS', rota: '/v2/assurant/online/triagem-als', etapa: 'aguardando_triagem_als' },
  { id: 'laudo', titulo: 'Laudo', rota: '/v2/assurant/online/laudo', etapa: 'aguardando_laudo' },
  { id: 'decisao-cliente', titulo: 'Aguardando Decisão do Cliente', rota: '/v2/assurant/online/decisao-cliente', etapa: 'aguardando_decisao_cliente' },
  { id: 'devolucao', titulo: 'Aguardando Devolução', rota: '/v2/assurant/online/devolucao', etapa: 'aguardando_devolucao' },
  { id: 'expedicao', titulo: 'Expedição', rota: '/v2/assurant/online/expedicao', etapa: 'aguardando_expedicao' },
];

async function operar(acao, dados={}) {
  const { data, error } = await supabase.rpc('assurant_tradein_online_operar', {
    p_acao: acao,
    p_dados: dados,
  });
  if (error) throw new Error(error.message || 'Não foi possível consultar a esteira Trade-In Online.');
  if (!data?.ok) throw new Error(data?.erro || 'A operação não foi concluída.');
  return data;
}

export const listarObjetosOnline = () => operar('listar_objetos');
export const listarVinculosOnline = () => operar('listar_vinculacao');
export const listarEtapaOnline = etapa => operar('listar_etapa', { etapa });
export const vincularAparelhoOnline = dados => operar('vincular', dados);
export const desvincularAparelhoOnline = aparelho_id => operar('desvincular', { aparelho_id });

export async function finalizarTriagemAlsOnline(dados) {
  const { data, error } = await supabase.rpc('assurant_tradein_online_triagem_als_finalizar', {
    p_dados: dados,
  });
  if (error) throw new Error(error.message || 'Não foi possível concluir a Triagem ALS.');
  if (!data?.ok) throw new Error(data?.erro || 'Triagem ALS não foi concluída.');
  return data;
}
