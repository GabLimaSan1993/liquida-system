import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, Search, Settings2 } from 'lucide-react';
import { consultarRelatorioCompleto, consultarRelatorioDefinicao, exportarRelatorioDefinicao, linhaRelatorioDefinicao } from '../../services/definicaoAssurantService.js';

const hoje = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const iniciais = () => { const fim = hoje(); return { inicio: `${fim.slice(0, 7)}-01`, fim, base: 'encaminhado' }; };
const PADRAO = ['Pedido AnyMarket', 'Item', 'Estado da tratativa', 'Encaminhado em', 'Encaminhado por', 'Motivo do encaminhamento', 'SKU aprovado', 'Cor aprovada', 'Grade aprovada', 'IMEI FIFO aprovado', 'Decidido por', 'Resolvido em'];
const PAGE_SIZE = 200;
const valor = value => value == null ? '—' : typeof value === 'boolean' ? value ? 'Sim' : 'Não' : typeof value === 'object' ? JSON.stringify(value) : String(value);

export default function RelatorioDefinicaoAssurant() {
  const [filtros, setFiltros] = useState(iniciais);
  const [aplicados, setAplicados] = useState(iniciais);
  const [dados, setDados] = useState([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exportando, setExportando] = useState(false);
  const [progresso, setProgresso] = useState('');
  const [erro, setErro] = useState('');
  const [mostrarColunas, setMostrarColunas] = useState(false);
  const [buscaColuna, setBuscaColuna] = useState('');
  const [visiveis, setVisiveis] = useState(PADRAO);
  const request = useRef(0);

  useEffect(() => {
    let ativo = true;
    consultarRelatorioDefinicao(iniciais()).then(r => {
      if (ativo && request.current === 0) { setDados(r.rows); setTotal(r.total); }
    }).catch(e => { if (ativo && request.current === 0) setErro(e.message); }).finally(() => { if (ativo && request.current === 0) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  async function carregar(filtro = filtros, pagina = 0) {
    if (!filtro.inicio || !filtro.fim || filtro.fim < filtro.inicio) { setErro('Informe um período válido, com a data final igual ou posterior à inicial.'); return; }
    const id = ++request.current;
    setLoading(true); setErro('');
    try {
      const r = await consultarRelatorioDefinicao(filtro, pagina, PAGE_SIZE);
      if (id === request.current) { setDados(r.rows); setTotal(r.total); setOffset(pagina); setAplicados({ ...filtro }); }
    } catch (e) { if (id === request.current) setErro(e.message); }
    finally { if (id === request.current) setLoading(false); }
  }

  async function exportar() {
    setExportando(true); setErro(''); setProgresso('Consultando todos os registros…');
    try {
      const casos = await consultarRelatorioCompleto(aplicados, (qtd, count) => setProgresso(`${qtd}/${count} registros`));
      await exportarRelatorioDefinicao(casos, aplicados);
    } catch (e) { setErro(e.message); }
    finally { setExportando(false); setProgresso(''); }
  }

  const linhas = useMemo(() => dados.map(linhaRelatorioDefinicao), [dados]);
  const colunas = useMemo(() => [...new Set([...PADRAO, ...linhas.flatMap(l => Object.keys(l))])], [linhas]);
  const exibidas = visiveis.filter(c => colunas.includes(c));

  return <div className="min-w-0 space-y-4">
    <form onSubmit={e => { e.preventDefault(); carregar(); }} className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <label className="text-xs font-bold text-slate-600">De<input type="date" value={filtros.inicio} onChange={e => setFiltros(f => ({ ...f, inicio: e.target.value }))} className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-slate-600">Até<input type="date" value={filtros.fim} onChange={e => setFiltros(f => ({ ...f, fim: e.target.value }))} className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm" /></label>
      <label className="text-xs font-bold text-slate-600">Data de referência<select value={filtros.base} onChange={e => setFiltros(f => ({ ...f, base: e.target.value }))} className="mt-1 block rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="encaminhado">Encaminhamento à Assurant</option><option value="decidido">Decisão da Assurant</option><option value="resolvido">Conclusão da tratativa</option></select></label>
      <button type="submit" disabled={loading || exportando} className="flex items-center gap-2 rounded-xl bg-violet-900 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Search size={16} />Consultar</button>
      <button type="button" onClick={exportar} disabled={loading || exportando || !total} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{exportando ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}Exportar Excel</button>
    </form>
    <p className="text-xs text-slate-500">Período aplicado: {aplicados.inicio} a {aplicados.fim} • horário de Brasília • {total.toLocaleString('pt-BR')} tratativas. O Excel inclui todos os registros do período e todas as colunas, com abas de histórico e FIFO da alternativa aprovada.</p>
    {progresso && <p role="status" className="text-sm font-bold text-emerald-700">{progresso}</p>}
    {erro && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{erro}</p>}
    <button type="button" onClick={() => setMostrarColunas(x => !x)} aria-expanded={mostrarColunas} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold"><Settings2 size={15} />Colunas ({exibidas.length}/{colunas.length})</button>
    {mostrarColunas && <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex flex-wrap gap-2"><input aria-label="Buscar coluna" placeholder="Buscar coluna…" value={buscaColuna} onChange={e => setBuscaColuna(e.target.value)} className="rounded-lg border border-slate-200 p-2 text-sm" /><button type="button" onClick={() => setVisiveis(colunas)} className="text-xs font-bold text-violet-800">Todas</button><button type="button" onClick={() => setVisiveis(PADRAO)} className="text-xs font-bold text-slate-500">Padrão</button></div>
      <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 xl:grid-cols-3">{colunas.filter(c => c.toLowerCase().includes(buscaColuna.toLowerCase())).map(c => <label key={c} className="flex items-start gap-2 text-xs text-slate-700"><input type="checkbox" checked={visiveis.includes(c)} onChange={e => setVisiveis(v => e.target.checked ? [...v, c] : v.filter(x => x !== c))} />{c}</label>)}</div>
    </div>}
    <div className="max-w-full overflow-x-auto rounded-2xl border border-slate-200 bg-white">
      {loading ? <p className="p-8 text-center text-sm text-slate-500">Consultando relatório…</p> : !linhas.length ? <p className="p-8 text-center text-sm text-slate-500">Nenhuma tratativa da Assurant neste período.</p> : <table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>{exibidas.map(c => <th key={c} className="min-w-40 p-3 font-bold text-slate-500">{c}</th>)}</tr></thead><tbody>{linhas.map((l, i) => <tr key={dados[i].id} className="border-t border-slate-100">{exibidas.map(c => <td key={c} className="max-w-80 break-words p-3 align-top">{valor(l[c])}</td>)}</tr>)}</tbody></table>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{total ? offset + 1 : 0}–{Math.min(offset + dados.length, total)} de {total}</span><div className="flex gap-2"><button type="button" disabled={loading || exportando || offset === 0} onClick={() => carregar(aplicados, Math.max(0, offset - PAGE_SIZE))} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Anterior</button><button type="button" disabled={loading || exportando || offset + PAGE_SIZE >= total} onClick={() => carregar(aplicados, offset + PAGE_SIZE)} className="rounded-lg border bg-white px-3 py-2 disabled:opacity-40">Próxima</button></div></div>
  </div>;
}
