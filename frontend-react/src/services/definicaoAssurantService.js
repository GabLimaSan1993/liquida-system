import { supabase } from '../lib/supabase.js';

export const DEFINICAO_ASSURANT_ROUTE = '/v2/assurant/b2c/definicao-assurant';

async function rpc(nome, parametros) {
  const { data, error } = await supabase.rpc(nome, parametros);
  if (error) throw new Error(error.message);
  if (data?.ok === false) throw new Error(data.erro || 'Não foi possível concluir a ação.');
  return data;
}

export const encaminharDefinicaoAssurant = (pedidoId, motivo) => rpc('b2c_encaminhar_definicao_assurant', { p_pedido_id: pedidoId, p_motivo: motivo.trim() });
export const consultarOpcoesAssurant = pedidoId => rpc('b2c_definicao_opcoes', { p_pedido_id: pedidoId });
export const aprovarDefinicaoAssurant = (pedidoId, opcao, upgrade, observacoes) => rpc('b2c_assurant_aprovar_definicao', {
  p_pedido_id: pedidoId, p_sku: opcao.sku, p_grade: opcao.grade, p_cor: opcao.cor,
  p_vinculo_tipo: opcao.vinculo_tipo || null, p_vinculo_referencia: opcao.vinculo_referencia || null,
  p_upgrade_confirmado: upgrade, p_observacoes: observacoes.trim() || null,
});

export async function carregarCasosAssurant() {
  const { data, error } = await supabase.from('b2c_definicao_assurant_casos')
    .select('id,pedido_id,motivo,encaminhado_em,encaminhado_nome,estado,observacoes')
    .in('estado', ['pendente', 'aguardando_desvinculacao']).order('encaminhado_em');
  if (error) throw new Error(error.message);
  return new Map((data || []).map(c => [c.pedido_id, c]));
}

export const consultarRelatorioDefinicao = (filtros, offset = 0, limit = 200) => rpc('b2c_definicao_assurant_relatorio', {
  p_inicio: filtros.inicio, p_fim: filtros.fim, p_base: filtros.base,
  p_offset: offset, p_limit: limit,
});

export async function consultarRelatorioCompleto(filtros, progresso = () => {}) {
  const rows = [];
  let total = 0;
  do {
    const pagina = await consultarRelatorioDefinicao(filtros, rows.length, 500);
    total = pagina.total;
    if (!pagina.rows.length && rows.length < total) throw new Error('O relatório mudou durante a exportação. Atualize e tente novamente.');
    rows.push(...pagina.rows);
    progresso(rows.length, total);
  } while (rows.length < total);
  // Uma atualização concorrente não pode repetir casos silenciosamente no Excel.
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error('O relatório mudou durante a exportação. Atualize e tente novamente.');
  return rows;
}

const LABELS = {
  id: 'ID', id_anymarket: 'Pedido AnyMarket', item_seq: 'Item', cliente: 'Cliente', cpf_cnpj: 'CPF/CNPJ',
  marketplace: 'Marketplace', titulo_produto: 'Produto vendido', sku_produto: 'SKU vendido', grade_produto: 'Grade vendida',
  valor_unitario: 'Valor unitário', total_do_pedido: 'Total do pedido', status: 'Status do pedido',
  sku_definido: 'SKU definido', grade_definida: 'Grade definida', imei_alocado: 'IMEI alocado', imei_bipado: 'IMEI bipado',
  status_anymarket: 'Status AnyMarket', definicao_status: 'Status da definição', definicao_resumo: 'Resumo da definição',
  numero_nf: 'Número NF', chave_nf: 'Chave NF', grupo_id: 'ID da lista', motivo_analise: 'Motivo da análise',
  upgrade_aprovado: 'Upgrade aprovado', upgrade_aprovado_por: 'Upgrade aprovado por', upgrade_aprovado_em: 'Data do upgrade',
  upgrade_grade_origem: 'Grade original do upgrade', upgrade_grade_destino: 'Grade aprovada do upgrade', upgrade_cor_destino: 'Cor aprovada',
};
const label = key => LABELS[key] || key.replaceAll('_', ' ');
const fmtData = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '';

export function linhaRelatorioDefinicao(caso) {
  const atual = caso.pedido_atual || {};
  const escolhido = caso.selecao || {};
  const row = {
    'Caso': caso.id, 'Pedido AnyMarket': String(atual.id_anymarket || caso.pedido_original?.id_anymarket || ''),
    'Item': atual.item_seq, 'Estado da tratativa': caso.estado,
    'Encaminhado em': fmtData(caso.encaminhado_em), 'Encaminhado por': caso.encaminhado_nome,
    'Motivo do encaminhamento': caso.motivo, 'Decidido em': fmtData(caso.decidido_em), 'Decidido por': caso.decidido_nome,
    'Resolvido em': fmtData(caso.resolvido_em), 'Resolvido por': caso.resolvido_nome, 'Observações Assurant': caso.observacoes,
    'SKU aprovado': escolhido.sku, 'Modelo aprovado': escolhido.modelo, 'Capacidade aprovada': escolhido.capacidade,
    'Cor aprovada': escolhido.cor, 'Grade aprovada': escolhido.grade, 'Relação de grade': escolhido.relacao,
    'IMEI FIFO aprovado': escolhido.fifo?.imei, 'Posição WMS aprovada': escolhido.fifo?.local,
    'Data SubInv aprovada': escolhido.fifo?.data_subinv, 'Quantidade da alternativa': escolhido.quantidade,
    'Vínculo selecionado': escolhido.vinculo_tipo, 'Referência do vínculo': escolhido.vinculo_referencia,
    'Dias na tratativa': Math.max(0, Math.floor(((caso.resolvido_em ? new Date(caso.resolvido_em) : new Date()) - new Date(caso.encaminhado_em)) / 86400000)),
  };
  for (const [key, value] of Object.entries(atual)) row[`Atual · ${label(key)}`] = value;
  for (const [key, value] of Object.entries(caso.pedido_original || {})) row[`Encaminhamento · ${label(key)}`] = value;
  row['ID do encaminhador'] = caso.encaminhado_por;
  row['ID do decisor'] = caso.decidido_por;
  row['ID de quem resolveu'] = caso.resolvido_por;
  return row;
}

function planilha(XLSX, rows) {
  const safe = rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => {
    const cell = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : value;
    if (String(cell).length > 32767) throw new Error(`O campo ${key} excede o limite de uma célula do Excel.`);
    return [key, cell];
  })));
  const ws = XLSX.utils.json_to_sheet(safe);
  if (ws['!ref']) ws['!autofilter'] = { ref: ws['!ref'] };
  ws['!cols'] = Object.keys(safe[0] || {}).map(key => ({ wch: Math.min(45, Math.max(18, key.length + 2)) }));
  return ws;
}

export async function exportarRelatorioDefinicao(casos, filtros) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, planilha(XLSX, casos.map(linhaRelatorioDefinicao)), 'Pedidos');
  const eventos = casos.flatMap(c => (c.eventos || []).map(e => ({
    'Caso': c.id, 'Pedido AnyMarket': String(c.pedido_atual?.id_anymarket || ''), 'Evento': e.evento,
    'Data': fmtData(e.criado_em), 'Operador': e.operador_nome, 'ID do operador': e.operador_id,
    ...Object.fromEntries(Object.entries(e.dados || {}).map(([k, v]) => [label(k), v])),
  })));
  XLSX.utils.book_append_sheet(wb, planilha(XLSX, eventos), 'Histórico');
  const alternativas = casos.flatMap(c => (c.selecao?.candidatos || []).map(a => ({
    'Caso': c.id, 'Pedido AnyMarket': String(c.pedido_atual?.id_anymarket || ''),
    'IMEI escolhido': c.selecao?.fifo?.imei, ...a,
  })));
  XLSX.utils.book_append_sheet(wb, planilha(XLSX, alternativas), 'FIFO da alternativa');
  XLSX.utils.book_append_sheet(wb, planilha(XLSX, [{
    'Início': filtros.inicio, 'Fim': filtros.fim, 'Data de referência': filtros.base,
    'Fuso horário': 'America/Sao_Paulo', 'Gerado em': fmtData(new Date()), 'Total de tratativas': casos.length,
  }]), 'Filtros');
  XLSX.writeFile(wb, `Definicao_Assurant_${filtros.inicio}_a_${filtros.fim}.xlsx`);
}
