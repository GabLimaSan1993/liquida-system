import { supabase } from '../lib/supabase.js';

export async function operarReparo(acao, pedidoId = null, extra = {}, signal) {
  let request = supabase.rpc('assurant_reparo_operar', {
    p_acao: acao, p_pedido_id: pedidoId, ...extra,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

export async function exportarReparo(pedido, itens, modo, statusDestino = '') {
  if (modo === 'oracle' && !statusDestino.trim() && !pedido.status_destino_oracle) {
    throw new Error('Informe o status de destino no Oracle antes de exportar.');
  }
  const XLSX = await import('xlsx');
  const rows = itens.map(i => ({
    Pedido: pedido.lote, IMEI: String(i.imei), Voucher: i.voucher || '',
    SKU: i.sku || '', Modelo: i.modelo || '', Grade: i.grade || '',
    'Local WMS': i.local_wms || '', 'Status Picking': i.status,
    Pendência: i.pendencia || '', 'Bipado em': i.bipado_em || '',
    'Status anterior Liquida': i.status_anterior || '',
    ...(modo === 'oracle' ? {
      'Status destino Oracle': statusDestino.trim() || pedido.status_destino_oracle,
      'Referência Oracle': pedido.referencia_oracle || '',
    } : {}),
    Finalidade: 'REPARO INTERNO — SEM FATURAMENTO',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  sheet['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: k === 'Modelo' || k === 'Pendência' ? 55 : 25 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, modo === 'oracle' ? 'Movimentação Oracle' : 'Picking Reparo');
  XLSX.writeFile(book, `${modo === 'oracle' ? 'Movimentacao_Oracle' : 'Picking'}_${pedido.lote}.xlsx`);
}
