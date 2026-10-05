import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Wrench, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { operarReparo, exportarReparo } from '../services/reparoPickingService.js';

const labels = { pendente: 'Aguardando bipagem', bloqueado: 'Pendência', bipado: 'Bipado', em_reparo: 'Em reparo' };
const number = n => Number(n || 0).toLocaleString('pt-BR');
const date = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export default function ReparoOperacaoPanel({ modo = 'picking' }) {
  const [pedidos, setPedidos] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [imei, setImei] = useState('');
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState('');
  const [historico, setHistorico] = useState(false);
  const [destino, setDestino] = useState('');
  const [referencia, setReferencia] = useState('');
  const inputRef = useRef(null);
  const oracle = modo === 'oracle';

  const carregar = useCallback(async signal => {
    setLoading(true);
    try {
      const data = await operarReparo(oracle ? 'listar_oracle' : 'listar_picking', null, {}, signal);
      if (!signal?.aborted) setPedidos(data);
    } catch (err) { if (!signal?.aborted) setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [oracle]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) carregar(controller.signal); });
    return () => controller.abort();
  }, [carregar]);

  async function abrir(id) {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await operarReparo(oracle ? 'detalhar_oracle' : 'detalhar_picking', id);
      setDetail(data); setDestino(data.pedido.status_destino_oracle || '');
      setReferencia(data.pedido.referencia_oracle || ''); setBusca(''); setFiltro('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function executar(acao, extra = {}) {
    if (!detail || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await operarReparo(acao, detail.pedido.id, extra);
      setPedidos(p => p.map(x => x.id === data.pedido.id ? data.pedido : x));
      if (acao === 'concluir') {
        setDetail(null); setMessage('Picking concluído. Pedido disponível em Integração Oracle → Reparos.');
        await carregar();
      } else {
        setDetail(data);
        setMessage(acao === 'bipar' ? `Aparelho ${extra.p_imei} separado para reparo.` : acao === 'confirmar_oracle' ? 'Movimentação Oracle registrada. Aparelhos em reparo.' : 'Posições e pendências atualizadas.');
      }
      setImei('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); if (!oracle) inputRef.current?.focus(); }
  }

  async function exportar() {
    if (!detail) return;
    setBusy(true); setError('');
    try { await exportarReparo(detail.pedido, detail.itens, modo, destino); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const pedidosVisiveis = pedidos.filter(p => !oracle || historico || p.status === 'aguardando_oracle');
  const pedido = detail?.pedido;
  const itens = (detail?.itens || []).filter(i => (!filtro || i.status === filtro) &&
    `${i.imei} ${i.voucher || ''} ${i.modelo || ''} ${i.sku || ''}`.toLowerCase().includes(busca.toLowerCase().trim()));

  return <section className="space-y-4 rounded-2xl border border-orange-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Wrench className="h-5 w-5 text-orange-600" />
        <div><h2 className="text-lg font-bold text-slate-800">{oracle ? 'Movimentação Oracle — Reparos' : 'Picking para reparo'}</h2>
          <p className="text-xs text-slate-500">Pedido interno • sem faturamento</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {detail && <button disabled={busy} onClick={() => { setDetail(null); carregar(); }} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><ArrowLeft size={14} />Pedidos</button>}
        {detail && <button disabled={busy} onClick={exportar} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><Download size={14} />{oracle ? 'Exportar movimentação' : 'Exportar picking'}</button>}
        <button disabled={busy || loading} onClick={() => detail && !oracle ? executar('atualizar') : detail ? abrir(detail.pedido.id) : carregar()} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} />{detail && !oracle ? 'Atualizar posições' : 'Atualizar'}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {loading && !detail && <p className="text-sm text-slate-500">Consultando reparos…</p>}
    {!detail && <>
      {oracle && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={historico} onChange={e => setHistorico(e.target.checked)} />Mostrar movimentações concluídas</label>}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{pedidosVisiveis.map(p => <button disabled={busy} onClick={() => abrir(p.id)} key={p.id} className="rounded-xl border border-slate-200 p-4 text-left hover:border-orange-400 disabled:opacity-50">
        <p className="font-bold text-slate-800">{p.lote}</p><p className="mt-1 text-xs text-slate-500">{number(p.total)} aparelhos • {date(p.criado_em)}</p>
        <p className="mt-3 text-sm">{oracle ? p.status === 'em_reparo' ? 'Movimentação confirmada' : 'Aguardando movimentação Oracle' : `${number(p.bipados)} bipados • ${number(p.bloqueados)} com pendência`}</p>
      </button>)}</div>
      {!loading && !pedidosVisiveis.length && <p className="py-3 text-sm text-slate-500">{oracle ? 'Nenhum reparo aguardando movimentação. Os pedidos entram aqui após concluir o picking.' : 'Nenhum picking de reparo em aberto.'}</p>}
    </>}
    {pedido && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50 p-4">
        <div><p className="font-bold">{pedido.lote}</p><p className="mt-1 text-sm">{number(pedido.bipados)} de {number(pedido.total)} bipados • {number(pedido.pendentes)} aguardando bipagem • {number(pedido.bloqueados)} com pendência</p></div>
        {!oracle && <button disabled={busy || pedido.bipados !== pedido.total || pedido.bloqueados > 0} onClick={() => executar('concluir')} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><CheckCircle2 size={16} />Concluir picking</button>}
      </div>
      {!oracle && <form onSubmit={e => { e.preventDefault(); if (imei.trim()) executar('bipar', { p_imei: imei.trim() }); }} className="flex flex-wrap gap-2">
        <input ref={inputRef} autoFocus aria-label="IMEI ou número de série para bipagem" value={imei} onChange={e => setImei(e.target.value)} disabled={busy} placeholder="Bipar IMEI / número de série" className="min-w-64 flex-1 rounded-xl border p-3 font-mono text-sm" />
        <button disabled={busy || !imei.trim()} className="rounded-xl bg-purple-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">Bipar para reparo</button>
      </form>}
      {oracle && pedido.status === 'aguardando_oracle' && <form onSubmit={e => { e.preventDefault(); executar('confirmar_oracle', { p_status_oracle: destino, p_referencia_oracle: referencia }); }} className="space-y-3 rounded-xl border border-violet-200 bg-violet-50 p-4">
        <p className="text-sm">Realize a mudança de status no Oracle e registre a confirmação abaixo.</p>
        <div className="flex flex-wrap items-end gap-3"><label className="min-w-60 flex-1 text-xs font-semibold">Status de destino no Oracle<input required value={destino} onChange={e => setDestino(e.target.value)} placeholder="Código ou nome do status de reparo" className="mt-2 block w-full rounded-lg border bg-white p-3 text-sm" /></label>
          <label className="min-w-60 flex-1 text-xs font-semibold">Referência da movimentação<input required value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Número / protocolo da movimentação" className="mt-2 block w-full rounded-lg border bg-white p-3 text-sm" /></label>
          <button disabled={busy || !destino.trim() || !referencia.trim()} className="rounded-xl bg-purple-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">Registrar movimentação realizada</button>
        </div>
      </form>}
      {oracle && pedido.status === 'em_reparo' && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Status Oracle: {pedido.status_destino_oracle} • Referência: {pedido.referencia_oracle} • Confirmado em {date(pedido.oracle_confirmado_em)}</p>}
      <div className="flex flex-wrap gap-3"><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Consultar IMEI, voucher, modelo ou SKU" aria-label="Consultar aparelho" className="min-w-60 flex-1 rounded-lg border p-2 text-sm" />
        <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar status do picking" className="rounded-lg border p-2 text-sm"><option value="">Todos os aparelhos</option><option value="pendente">Aguardando bipagem</option><option value="bloqueado">Com pendência</option><option value="bipado">Bipados</option><option value="em_reparo">Em reparo</option></select>
      </div>
      <div className="max-h-[580px] overflow-auto rounded-xl border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr>{['IMEI / Série', 'Voucher', 'Modelo / SKU', 'Local WMS', 'Situação', 'Pendência / Bipagem'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">
        {itens.map(i => <tr key={i.id}><td className="p-3 font-mono font-semibold">{i.imei}</td><td className="p-3">{i.voucher || '—'}</td><td className="p-3">{i.modelo || 'Não informado'}<p className="mt-1 text-slate-400">{i.sku || '—'} • {i.grade || 'Sem grade'}</p></td><td className="whitespace-nowrap p-3">{i.local_wms || 'Sem posição WMS'}</td><td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 font-semibold ${i.status === 'bloqueado' ? 'bg-red-50 text-red-700' : i.status === 'pendente' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{labels[i.status]}</span></td><td className="min-w-56 max-w-96 p-3">{i.pendencia || date(i.bipado_em)}</td></tr>)}
        {!itens.length && <tr><td colSpan={6} className="p-8 text-center text-slate-500">Nenhum aparelho neste filtro.</td></tr>}
      </tbody></table></div>
      {!oracle && <p className="text-xs text-slate-500">Posições vêm do WMS atual. Aparelhos com pendência ficam no pedido e impedem a conclusão até serem regularizados. A bipagem registra a retirada física para reparo.</p>}
    </>}
  </section>;
}
