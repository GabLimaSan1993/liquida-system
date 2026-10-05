import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw, Search, X } from 'lucide-react';
import { consultarEstoque, exportarEstoque } from '../../services/relatorioEstoqueService.js';
import { COLUNAS_ESTOQUE, CAMPOS_ESTOQUE, DATAS_ESTOQUE } from '../../services/relatorioEstoqueColumns.js';

const initial = { dataInicial: '', dataFinal: '', dataReferencia: 'recebimento', status: '', grade: '', rede: '', busca: '' };
const references = [
  ['recebimento', 'Recebimento'], ['funcional', 'Triagem funcional'], ['cosmetica', 'Triagem cosmética'],
  ['laudo', 'Laudo'], ['alocacao', 'Alocação'], ['oracle', 'Oracle'], ['criacao', 'Criação'], ['atualizacao', 'Atualização'],
];
const compact = [0, 1, 3, 4, 10, 13, 21, 22, 23, 24, 25, 26];
const num = value => Number(value || 0).toLocaleString('pt-BR');
const date = value => value ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';
const cell = (item, index) => {
  const value = item[CAMPOS_ESTOQUE[index]];
  return DATAS_ESTOQUE.has(index) ? date(value) : value == null || value === '' ? '—' : typeof value === 'object' ? JSON.stringify(value) : String(value);
};
const inputClass = 'mt-2 block w-full rounded-lg border border-slate-200 bg-white p-2.5 text-sm font-normal text-slate-900';

export default function RelatorioEstoqueV2Page() {
  const [filters, setFilters] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [page, setPage] = useState(0);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState('');
  const [allColumns, setAllColumns] = useState(false);
  const [selected, setSelected] = useState(null);
  const load = useCallback(async signal => {
    setLoading(true);
    setError('');
    try {
      const data = await consultarEstoque(applied, page * 100, 100, true, signal);
      if (!signal.aborted) setResult(data);
    } catch (err) {
      if (!signal.aborted) setError(err.message);
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [applied, page]);
  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) load(controller.signal); });
    return () => controller.abort();
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    const escape = event => { if (event.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [selected]);
  const set = (key, value) => setFilters(f => ({ ...f, [key]: value }));
  function apply(event) {
    event.preventDefault();
    if (filters.dataInicial && filters.dataFinal && filters.dataInicial > filters.dataFinal) {
      setError('A data inicial deve ser anterior ou igual à final.');
      return;
    }
    setPage(0);
    setProgress('');
    setApplied({ ...filters });
  }
  async function exportExcel() {
    setExporting(true);
    setError('');
    setProgress('Preparando Excel…');
    try {
      const total = await exportarEstoque(applied, (done, total, finishing) => setProgress(finishing ? 'Gerando o arquivo Excel…' : `Exportando ${num(done)} de ${num(total)} aparelhos…`));
      setProgress(`${num(total)} aparelhos exportados.`);
    } catch (err) {
      setError(err.message);
      setProgress('');
    } finally {
      setExporting(false);
    }
  }
  const summary = result?.resumo || {};
  const columns = allColumns ? COLUNAS_ESTOQUE.map((_, i) => i) : compact;
  const options = (key, selectedValue) => [...new Set([...(result?.filtros?.[key] || []), ...(selectedValue ? [selectedValue] : [])])];
  return <div className="mx-auto max-w-[1800px] space-y-5 p-4 text-slate-900 md:p-7">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold uppercase tracking-widest text-purple-600">Assurant • Gestão</p>
        <h1 className="mt-1 text-3xl font-bold">Relatório de Estoque</h1>
        <p className="mt-2 text-sm text-slate-500">Status, localização, avaliações e datas de cada etapa do aparelho.</p></div>
      <div className="flex gap-2">
        <button disabled={loading || exporting} onClick={() => setApplied(f => ({ ...f }))} className="flex items-center gap-2 rounded-xl border bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"><RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>Atualizar</button>
        <button disabled={loading || exporting || !summary.total || !!error} onClick={exportExcel} className="flex items-center gap-2 rounded-xl bg-purple-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"><Download size={17}/>{exporting ? 'Exportando…' : 'Exportar Excel'}</button>
      </div>
    </header>
    <form onSubmit={apply} className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 xl:grid-cols-4">
      <label className="text-xs font-semibold text-slate-600">Data de referência<select className={inputClass} value={filters.dataReferencia} onChange={e => set('dataReferencia', e.target.value)}>{references.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Data inicial<input type="date" className={inputClass} value={filters.dataInicial} onChange={e => set('dataInicial', e.target.value)}/></label>
      <label className="text-xs font-semibold text-slate-600">Data final<input type="date" className={inputClass} value={filters.dataFinal} onChange={e => set('dataFinal', e.target.value)}/></label>
      <label className="text-xs font-semibold text-slate-600">Status atual<select className={inputClass} value={filters.status} onChange={e => set('status', e.target.value)}><option value="">Todos</option>{options('status', filters.status).map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Grade<select className={inputClass} value={filters.grade} onChange={e => set('grade', e.target.value)}><option value="">Todas</option>{options('grades', filters.grade).map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Rede<select className={inputClass} value={filters.rede} onChange={e => set('rede', e.target.value)}><option value="">Todas</option>{options('redes', filters.rede).map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Voucher, IMEI, SKU, modelo, cliente, loja ou local<div className="mt-2 flex items-center rounded-lg border border-slate-200 px-3"><Search size={16}/><input className="w-full p-2.5 text-sm font-normal outline-none" value={filters.busca} placeholder="Buscar aparelho" onChange={e => set('busca', e.target.value)}/></div></label>
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2 xl:col-span-4">
        <button disabled={loading || exporting} className="rounded-lg bg-purple-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50">Consultar</button>
        <button type="button" disabled={loading || exporting} onClick={() => { setPage(0); setFilters(initial); setApplied({ ...initial }); setProgress(''); }} className="rounded-lg border px-4 py-2.5 text-sm disabled:opacity-50">Limpar filtros</button>
        <p className="text-xs text-slate-500">Sem datas, todo o histórico. O período usa apenas a referência escolhida, com o dia completo no horário de Brasília.</p>
      </div>
    </form>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading && <p role="status" className="text-sm text-purple-700">Consultando estoque…</p>}
    {progress && <p role="status" className="text-sm text-purple-700">{progress}</p>}
    {result && <div className={loading ? 'pointer-events-none space-y-5 opacity-50' : 'space-y-5'}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[['Aparelhos', summary.total, 'Total da consulta'], ['Com funcional registrada', summary.funcional, 'Data de triagem funcional preenchida'], ['Com cosmética registrada', summary.cosmetica, 'Data de triagem cosmética preenchida'], ['Com Oracle registrado', summary.oracle, 'Data de Oracle preenchida']].map(([label, value, detail]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">{label}</p><p className="mt-3 text-3xl font-bold">{num(value)}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>)}
      </div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="text-lg font-bold">Aparelhos e etapas</h2>
          <p className="mt-1 text-xs text-slate-500">Referência aplicada: {references.find(([key]) => key === applied.dataReferencia)?.[1]} • {applied.dataInicial || 'Sem início'} até {applied.dataFinal || 'Sem fim'}. Excel com as 31 colunas e todos os registros filtrados.</p></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allColumns} onChange={e => setAllColumns(e.target.checked)}/>Mostrar as 31 colunas</label></div>
        <div className="max-h-[650px] overflow-auto"><table className="w-full whitespace-nowrap text-left text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-slate-500"><tr>{columns.map(index => <th key={index} className="px-4 py-3 font-semibold">{COLUNAS_ESTOQUE[index].replaceAll('_', ' ')}</th>)}</tr></thead>
          <tbody className="divide-y divide-slate-100">{result.itens.map(item => <tr key={item.id} className="hover:bg-purple-50/40">{columns.map(index => <td key={index} className="max-w-80 px-4 py-3">{index === 0 ? <button className="font-bold text-purple-700 hover:underline" onClick={() => setSelected(item)}>{item.voucher || 'Ver aparelho'}</button> : <span className="block max-w-80 truncate" title={cell(item, index)}>{cell(item, index)}</span>}</td>)}</tr>)}
            {!result.itens.length && <tr><td colSpan={columns.length} className="p-10 text-center text-slate-500">Nenhum aparelho encontrado.</td></tr>}</tbody>
        </table></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4 text-sm">
          <button disabled={loading || exporting || page === 0} onClick={() => setPage(p => p - 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Anterior</button>
          <span>Página {page + 1} de {Math.max(1, Math.ceil(summary.total / 100))} • {num(summary.total)} aparelhos</span>
          <button disabled={loading || exporting || (page + 1) * 100 >= summary.total} onClick={() => setPage(p => p + 1)} className="rounded-lg border px-4 py-2 disabled:opacity-40">Próxima</button>
        </div>
      </section>
      <p className="text-xs leading-relaxed text-slate-500">Inclui o histórico GAIA e Liquida. Local considera a alocação ativa confirmada quando disponível. Datas e avaliações sem registro ficam em branco no Excel. Os indicadores contam aparelhos com datas registradas; o status atual aparece na tabela. Consulta realizada em {date(result.consultado_em)}.</p>
    </div>}
    {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4" onClick={() => setSelected(null)}>
      <div role="dialog" aria-modal="true" aria-label="Detalhes do aparelho" className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3"><div><h2 className="text-xl font-bold">{selected.voucher}</h2><p className="mt-1 text-sm text-slate-500">{selected.imei} • {selected.status_atual}</p></div><button autoFocus aria-label="Fechar detalhes" onClick={() => setSelected(null)}><X/></button></div>
        <dl className="grid gap-3 sm:grid-cols-2">{COLUNAS_ESTOQUE.map((label, index) => <div key={label} className={index === 27 ? 'rounded-lg bg-slate-50 p-3 sm:col-span-2' : 'rounded-lg bg-slate-50 p-3'}><dt className="text-xs text-slate-500">{label.replaceAll('_', ' ')}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{cell(selected, index)}</dd></div>)}</dl>
      </div>
    </div>}
  </div>;
}
