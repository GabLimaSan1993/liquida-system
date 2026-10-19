import { supabase } from '../lib/supabase.js';
export async function listarRegrasSla() {
  const { data, error } = await supabase.from('sistema_chamados_sla').select('*');
  if (error) throw error;
  return data;
}
export async function listarResponsaveisChamados() {
  const { data, error } = await supabase.from('user_profiles').select('id,nome').contains('telas_permitidas', ['/chamados']).order('nome');
  if (error) throw error;
  return data;
}
export async function salvarPlanejamento(id, campos) {
  const { data, error } = await supabase.from('sistema_chamados').update(campos).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function salvarRegrasSla(regras, aplicarAbertos) {
  const { data, error } = await supabase.rpc('chamados_configurar_sla', { p_regras: regras, p_aplicar_abertos: aplicarAbertos });
  if (error) throw error;
  return data;
}
