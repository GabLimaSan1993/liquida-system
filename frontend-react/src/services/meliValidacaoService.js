import { supabase } from '../lib/supabase.js';

export const MELI_ROUTE = '/v2/assurant/b2c/validacao-meli';
export const CHECKLIST_MELI = [
  { titulo: '1. Pedido', itens: [['modelo', 'Modelo igual ao anúncio'], ['cor', 'Cor igual ao anúncio'], ['capacidade', 'Capacidade (GB) igual ao anúncio']] },
  { titulo: '2. Tela e touch', itens: [['sem_linhas', 'Tela sem linhas'], ['sem_manchas', 'Tela sem manchas'], ['sem_burnin', 'Tela sem burn-in'], ['tela_colada', 'Tela bem colada'], ['touch_completo', 'Touch responde em toda a área testada']] },
  { titulo: '3. Estado físico', itens: [['sem_trinca', 'Sem trinca'], ['sem_amassado', 'Sem amassado'], ['sem_descascado', 'Sem descascado'], ['cameras', 'Câmeras em boas condições'], ['botoes', 'Botões em boas condições'], ['conector', 'Entrada do carregador em boas condições'], ['riscos_grade', 'Riscos de acordo com a grade anunciada']] },
  { titulo: '4. Funções', itens: [['liga_desliga', 'Liga e desliga normalmente'], ['audio', 'Alto-falante com som limpo']] },
  { titulo: '5. Contas e preparação', itens: [['contas_removidas', 'Todas as contas removidas; pronto para nova utilização'], ['resetado', 'Aparelho resetado, na tela inicial de configuração']] },
];
export const MELI_ITENS = CHECKLIST_MELI.flatMap(b => b.itens);
export function isMeli(marketplace) {
  return ['mercadolivre', 'mercadolibre', 'meli', 'ml', 'mercadolivrebrasil'].includes(String(marketplace || '').toLowerCase().replace(/[^a-z]/g, ''));
}

export async function listarFilaMeli() {
  const { data, error } = await supabase.from('pedidos_b2c')
    .select('id,id_anymarket,item_seq,titulo_produto,sku_produto,sku_alocado,grade_produto,grade_alocada,imei_bipado,imei_alocado,bipado_em,grupo_id,marketplace')
    .eq('status', 'aguardando_validacao_meli').order('bipado_em', { ascending: true });
  if (error) throw error;
  const pedidos = data || [];
  const grupos = [...new Set(pedidos.map(p => p.grupo_id).filter(Boolean))];
  const numeros = {};
  for (let i = 0; i < grupos.length; i += 200) {
    const { data: lista, error: erro } = await supabase.from('pedidos_b2c_grupos').select('id,numero').in('id', grupos.slice(i, i + 200));
    if (erro) throw erro;
    (lista || []).forEach(g => { numeros[g.id] = g.numero; });
  }
  return pedidos.map(p => ({ ...p, numero_grupo: numeros[p.grupo_id] }));
}

export async function listarHistoricoMeli() {
  const { data, error } = await supabase.from('meli_validacoes').select('*').order('criado_em', { ascending: false }).limit(200);
  if (error) throw error;
  return data || [];
}

export async function finalizarValidacaoMeli(pedido, imei, sistema, respostas, motivo, observacoes) {
  const { data, error } = await supabase.rpc('meli_finalizar_validacao', {
    p_pedido_id: pedido.id, p_imei: imei.trim(), p_sistema: sistema,
    p_respostas: respostas, p_motivo: motivo.trim() || null, p_observacoes: observacoes.trim() || null,
  });
  if (error) throw error;
  if (!data?.ok) throw new Error(data?.erro || 'Não foi possível finalizar a validação.');
  return data;
}

export async function filtrarMeliFaturaveis(pedidos) {
  const ids = [...new Set(pedidos.filter(p => isMeli(p.marketplace) && p.status === 'embalado').map(p => p.id_anymarket))];
  if (!ids.length) return pedidos;
  const prontos = new Set();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await supabase.rpc('meli_pedidos_prontos', { p_ids: ids.slice(i, i + 200) });
    if (error) throw error;
    (data || []).filter(p => p.pronto).forEach(p => prontos.add(String(p.id_anymarket)));
  }
  return pedidos.filter(p => !isMeli(p.marketplace) || p.status !== 'embalado' || prontos.has(String(p.id_anymarket)));
}
