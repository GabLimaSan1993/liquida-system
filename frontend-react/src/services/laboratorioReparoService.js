import { supabase } from '../lib/supabase.js';

export async function laboratorioReparo(acao, campos = {}) {
  const { data, error } = await supabase.rpc('assurant_reparo_laboratorio', {
    p_acao: acao, p_pedido_id: campos.p_pedido_id ?? null,
    p_item_id: campos.p_item_id ?? null, p_voucher: campos.p_voucher ?? null,
    p_os: campos.p_os ?? null, p_defeitos: campos.p_defeitos ?? null,
    p_resultado: campos.p_resultado ?? null, p_observacoes: campos.p_observacoes ?? null,
  });
  if (error) throw new Error(error.message || 'Não foi possível executar a operação.');
  return data;
}
