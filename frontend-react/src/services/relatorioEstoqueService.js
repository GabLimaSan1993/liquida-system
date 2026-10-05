import { supabase } from '../lib/supabase.js';

export async function consultarEstoque(filters, offset = 0, limit = 100, summary = true, signal) {
  let request = supabase.rpc('assurant_relatorio_estoque', {
    p_data_inicial: filters.dataInicial || null, p_data_final: filters.dataFinal || null,
    p_data_referencia: filters.dataReferencia, p_status: filters.status, p_grade: filters.grade,
    p_rede: filters.rede, p_busca: filters.busca.trim(), p_offset: offset, p_limite: limit, p_resumo: summary,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw error;
  return data;
}
export async function exportarEstoque(filters, onProgress) {
  const worker = new Worker(new URL('./relatorioEstoqueExport.worker.js', import.meta.url), { type: 'module' });
  const send = data => new Promise((resolve, reject) => {
    worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
    worker.onerror = event => reject(new Error(event.message || 'Falha ao gerar Excel.'));
    worker.postMessage(data);
  });
  try {
    await send({ type: 'init' });
    const first = await consultarEstoque(filters, 0, 5000, true);
    const total = Number(first.resumo.total);
    if (!total) throw new Error('Nenhum aparelho encontrado para exportação.');
    const ids = new Set();
    let count = 0;
    let batch = first;
    while (count < total) {
      if (!batch.itens.length || count + batch.itens.length > total) throw new Error('Os dados mudaram durante a exportação. Atualize e exporte novamente.');
      for (const item of batch.itens) {
        if (ids.has(item.id)) throw new Error('Os dados mudaram durante a exportação. Atualize e exporte novamente.');
        ids.add(item.id);
      }
      await send({ type: 'chunk', items: batch.itens });
      count += batch.itens.length;
      onProgress(count, total);
      if (count < total) batch = await consultarEstoque(filters, count, 5000, false);
    }
    onProgress(total, total, true);
    const { buffer } = await send({ type: 'finish' });
    const url = URL.createObjectURL(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Relatorio_Estoque_${filters.dataReferencia}_${filters.dataInicial || 'inicio'}_${filters.dataFinal || 'hoje'}.xlsx`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return total;
  } finally {
    worker.terminate();
  }
}
