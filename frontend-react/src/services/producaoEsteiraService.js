import { supabase } from '../lib/supabase.js';

export const ETAPAS_PRODUCAO = [
  ['recebimento', 'Recebimento', '#6366f1'], ['funcional', 'Triagem funcional', '#7c3aed'],
  ['laudo', 'Laudo', '#c026d3'], ['cosmetica', 'Triagem cosmética', '#db2777'],
  ['armazenagem', 'Armazenagem', '#0891b2'], ['oracle', 'Entrada Oracle', '#2563eb'],
  ['picking_b2c', 'Picking B2C', '#059669'], ['picking_b2b', 'Picking B2B', '#65a30d'],
  ['validacao_meli', 'Validação MELI', '#ca8a04'], ['embalagem_b2c', 'Embalagem B2C', '#ea580c'],
  ['embalagem_b2b', 'Embalagem B2B', '#d97706'], ['faturamento_b2c', 'Faturamento B2C', '#475569'],
  ['faturamento_b2b', 'Faturamento B2B', '#0f766e'], ['expedicao', 'Expedição', '#dc2626'],
].map(([id, nome, cor]) => ({ id, nome, cor }));

export async function consultarProducao(filters, signal) {
  const { data, error } = await supabase.rpc('assurant_producao_esteira', {
    p_inicio: filters.inicio, p_fim: filters.fim, p_agrupamento: filters.agrupamento,
  }).abortSignal(signal);
  if (error) throw error;
  return data;
}

export function resumirProducao(dados, pesos = {}) {
  const pessoas = new Map(), etapas = new Map(), periodos = new Map();
  let total = 0, semResponsavel = 0, retrabalho = 0;
  for (const d of dados) {
    const n = Number(d.producao || 0), r = Number(d.retrabalho || 0);
    total += n; retrabalho += r;
    if (!d.colaborador_id) semResponsavel += n;
    const etapa = etapas.get(d.etapa) || { producao: 0, retrabalho: 0, unidade: d.unidade };
    etapa.producao += n; etapa.retrabalho += r; etapas.set(d.etapa, etapa);
    const periodo = periodos.get(d.periodo) || { periodo: d.periodo, total: 0 };
    periodo[d.etapa] = (periodo[d.etapa] || 0) + n; periodo.total += n; periodos.set(d.periodo, periodo);
    if (!d.colaborador_id) continue;
    const p = pessoas.get(d.colaborador_id) || { id: d.colaborador_id, nome: d.colaborador, producao: 0, retrabalho: 0, pontos: 0, dias: new Set(), etapas: {} };
    p.producao += n; p.retrabalho += r; p.pontos += n * Number(pesos[d.etapa] ?? 1);
    // Dias ativos are returned independently of chart grouping.
    for (const dia of d.dias_ativos || []) if (n) p.dias.add(dia);
    p.etapas[d.etapa] = (p.etapas[d.etapa] || 0) + n; pessoas.set(p.id, p);
  }
  const ranking = [...pessoas.values()].sort((a,b) => b.pontos-a.pontos || b.producao-a.producao || a.nome.localeCompare(b.nome));
  let posicao = 0;
  for (let i = 0; i < ranking.length; i++) {
    const p = ranking[i];
    if (!i || p.pontos !== ranking[i-1].pontos) posicao = i + 1;
    p.posicao = posicao; p.diasAtivos = p.dias.size; p.media = p.dias.size ? p.producao / p.dias.size : 0;
  }
  return { total, semResponsavel, retrabalho, ranking, etapas, periodos: [...periodos.values()].sort((a,b) => a.periodo.localeCompare(b.periodo)) };
}

// Largest remainder distributes whole cents and preserves the exact simulation budget.
export function distribuirBonus(ranking, valor) {
  const cents = Math.round(Math.max(0, Number(valor) || 0) * 100);
  const total = ranking.reduce((s,p) => s + p.pontos, 0);
  if (!total || !cents) return new Map();
  const partes = ranking.map(p => { const exato = cents * p.pontos / total; return { id:p.id, cents:Math.floor(exato), resto:exato-Math.floor(exato) }; });
  let saldo = cents - partes.reduce((s,p) => s+p.cents, 0);
  const maiores = [...partes].sort((a,b) => b.resto-a.resto || a.id.localeCompare(b.id));
  for (let i=0; i<saldo; i++) maiores[i].cents++;
  return new Map(partes.map(p => [p.id,p.cents/100]));
}
