import { supabase } from '../lib/supabase.js';
export async function chamadosWhatsapp(acao = 'consultar', dados = {}) {
  const { data, error } = await supabase.rpc('chamados_whatsapp', { p_acao: acao, p_dados: dados });
  if (error) throw new Error(error.message);
  return data;
}
