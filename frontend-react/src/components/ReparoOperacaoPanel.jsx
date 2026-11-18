import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Upload, RefreshCw, Wrench, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { operarReparo, operarReparoPorVouchers, listarPainelReparo, detalharPainelReparo, exportarReparo, exportarFilaOracleReparo, exportarPlanilhaWarehouseGaia } from '../services/reparoPickingService.js';
import { lerUploadReparoFlexivel, baixarModeloReparoVoucher } from '../services/reparoUpload.js';
import { useAuth } from '../AuthContext.jsx';
import { imprimirMinutaReparo, imprimirEtiquetasCaixasReparo } from '../services/reparoDocumentosService.js';

const labels = { pendente: 'Aguardando bipagem', bloqueado: 'Pendência', bipado: 'Bipado', em_reparo: 'Em reparo', retornado: 'Retornado' };
const statusPedido = p => p.origem_lab === 'planilha_laboratorio' ? 'Histórico — laboratório' : p.status === 'picking' ? 'Em separação' : p.status === 'aguardando_oracle' ? 'Aguardando Oracle' : p.oracle_confirmado_em ? 'Oracle confirmado' : 'Em reparo';
const tipoPedido = p => /REVIS|NAO.?INICI|NÃO.?INICI/i.test(p?.lote || '') ? 'Revisão' : 'Reparo';
const number = n => Number(n || 0).toLocaleString('pt-BR');
const date = d => d ? new Date(d).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

export default function ReparoOperacaoPanel({ modo = 'picking' }) {
  const { profile } = useAuth();
  const podeImportarReparo = Boolean(profile?.is_master || profile?.telas_permitidas?.includes('/v2/assurant/b2b/reparo/importar'));
  const [pedidos, setPedidos] = useState([]);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [imei, setImei] = useState('');
  const [busca, setBusca] = useState('');
  const [buscaPedidos, setBuscaPedidos] = useState('');
  const [filtroPedidos, setFiltroPedidos] = useState('todos');
  const [filtro, setFiltro] = useState('');
  const [historico, setHistorico] = useState(false);
  const [destino, setDestino] = useState('');
  const [referencia, setReferencia] = useState('');
  const [tipoProcesso, setTipoProcesso] = useState('Reparo');
  const [quantidadeCaixas, setQuantidadeCaixas] = useState(1);
  const inputRef = useRef(null);
  const arquivoRef = useRef(null);
  const [upload, setUpload] = useState(null);
  const [relatorioImportacao, setRelatorioImportacao] = useState(null);
  const [ultimoEnvioLab, setUltimoEnvioLab] = useState(null);
  const oracle = modo === 'oracle';

  async function selecionarArquivo(event) {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (!arquivo || busy) return;
    setBusy(true); setError(''); setMessage(''); setUpload(null); setRelatorioImportacao(null);
    try { setUpload({ nome: arquivo.name, ...await lerUploadReparoFlexivel(arquivo) }); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function importarReparo() {
    if (!upload || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await operarReparoPorVouchers(upload.vouchers);
      setUpload(null);
      setRelatorioImportacao(data.importacao || null);
      await carregar();
      if (!data.pedido) {
        setDetail(null);
        setMessage('Nenhum novo aparelho incluído. Confira os vouchers já vinculados a outros pickings ou que precisam de regularização.');
      } else if (data.pedido.status === 'picking') {
        setDetail(data); setImei(''); setBusca(''); setFiltro('');
        setTipoProcesso(tipoPedido(data?.pedido) === 'Revisão' ? 'Revisão não inicializa' : 'Reparo');
        setMessage(`Lote ${data.pedido.lote} criado a partir dos vouchers: ${number(data.importacao?.incluidos || data.pedido.total)} incluídos e ${number(data.importacao?.qtd_ignorados)} ignorados. ${number(data.pedido.bloqueados)} com pendência. Confira a lista antes da bipagem.`);
      } else {
        setDetail(null);
        setMessage(`Esta lista já foi importada no lote ${data.pedido.lote}. Consulte Integração Oracle → Reparos para acompanhar a movimentação.`);
      }
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const carregar = useCallback(async signal => {
    setLoading(true);
    try {
      const data = await listarPainelReparo(signal);
      if (!signal?.aborted) setPedidos(data);
    } catch (err) { if (!signal?.aborted) setError(err.message); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [oracle]);

  useEffect(() => {
    const controller = new AbortController();
    queueMicrotask(() => { if (!controller.signal.aborted) carregar(controller.signal); });
    return () => controller.abort();
  }, [carregar]);

  useEffect(() => {
    if (!busy && detail && !oracle) inputRef.current?.focus();
  }, [busy, detail, oracle]);

  async function abrir(id) {
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await detalharPainelReparo(id);
      setDetail(data); setDestino(data.pedido.status_destino_oracle || '');
      setTipoProcesso(tipoPedido(data?.pedido) === 'Revisão' ? 'Revisão não inicializa' : 'Reparo');
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
        setUltimoEnvioLab(data?.pedido?.id || detail.pedido.id);
        setDetail(null); setMessage('Picking concluído e malote enviado automaticamente para Aguardando Recebimento no Laboratório. A operadora confere os aparelhos e gera a planilha com OS GAIA.');
        await carregar();
      } else {
        setDetail(data);
        await carregar();
        setMessage(acao === 'bipar' ? `Aparelho ${extra.p_imei} separado para reparo.` : acao === 'confirmar_oracle' ? 'Movimentação Oracle registrada. Aparelhos em reparo.' : 'Posições e pendências atualizadas.');
      }
      setImei('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function exportar() {
    if (!detail) return;
    setBusy(true); setError('');
    try { await exportarReparo(detail.pedido, detail.itens, modo, destino); }
    catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function baixarEntregaGaia(pedidoId) {
    if (!pedidoId || busy) return;
    setBusy(true);setError("");
    try {
      const total=await exportarPlanilhaWarehouseGaia(pedidoId);
      setMessage(total+" aparelhos exportados para conferência de envio. A planilha final com OS GAIA será gerada pela operadora após conferir todo o malote.");
    } catch(err) { setError(err.message || "Erro ao exportar planilha GAIA."); }
    finally { setBusy(false); }
  }

  async function baixarFilaOracle() {
    setBusy(true); setError(''); setMessage('');
    try {
      const resposta = await exportarFilaOracleReparo();
      setMessage(`Fila Oracle de envio: ${number(resposta.total)} IMEIs bipados, dos quais ${number(resposta.liberados)} estão liberados após a conclusão do picking. O arquivo não registra movimentações no Oracle.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  function imprimirDocumento(tipo) {
    if (!detail) return;
    setError('');
    try {
      const processo = tipoProcesso.trim() || 'Reparo';
      if (tipo === 'minuta') imprimirMinutaReparo(detail.pedido, detail.itens, processo);
      else imprimirEtiquetasCaixasReparo(detail.pedido, processo, quantidadeCaixas);
    } catch (err) { setError(err.message); }
  }

  const contadores = {
    todos: pedidos.length,
    picking: pedidos.filter(p => p.status === 'picking').length,
    aguardando_oracle: pedidos.filter(p => p.status === 'aguardando_oracle').length,
    em_reparo: pedidos.filter(p => p.status === 'em_reparo').length,
  };
  const pedidosVisiveis = pedidos.filter(p => {
    if (oracle && !((p.status === 'picking' && Number(p.fila_oracle) > 0) || p.status === 'aguardando_oracle' || (historico && p.status === 'em_reparo'))) return false;
    if (!oracle && filtroPedidos !== 'todos' && p.status !== filtroPedidos) return false;
    const termo = buscaPedidos.trim().toLowerCase();
    return !termo || [p.lote, p.criado_por_nome, p.origem_lab, tipoPedido(p), statusPedido(p)].some(x => String(x || '').toLowerCase().includes(termo));
  });
  const pedido = detail?.pedido;
  const ehPickingAtivo = !oracle && pedido?.status === 'picking';
  const itens = (detail?.itens || []).filter(i => (!filtro || i.status === filtro) &&
    `${i.imei} ${i.voucher || ''} ${i.modelo || ''} ${i.sku || ''} ${i.grade || ''} ${i.defeitos_adicionais || ''}`.toLowerCase().includes(busca.toLowerCase().trim()));

  return <section className="space-y-4 rounded-2xl border border-orange-200 bg-white p-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3"><Wrench className="h-5 w-5 text-orange-600" />
        <div><h2 className="text-lg font-bold text-slate-800">{oracle ? 'Movimentação Oracle — Reparos' : 'Pedidos de reparo e revisão'}</h2>
          <p className="text-xs text-slate-500">Pedido interno • sem faturamento</p></div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!oracle && podeImportarReparo && <>
          <button type="button" onClick={baixarModeloReparoVoucher} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><Download size={14} />Baixar layout por voucher</button>
          <input ref={arquivoRef} type="file" accept=".xlsx,.xls,.csv" aria-label="Planilha de vouchers para reparo" className="hidden" onChange={selecionarArquivo} disabled={busy} />
          <button disabled={busy || loading} onClick={() => arquivoRef.current?.click()} className="flex items-center gap-2 rounded-xl bg-purple-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Upload size={14} />Importar para reparo</button>
        </>}
        {oracle && <button disabled={busy} onClick={baixarFilaOracle} className="flex items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800"><Download size={14} />Fila Oracle dos IMEIs bipados</button>}
        {detail && <button disabled={busy} onClick={() => { setDetail(null); carregar(); }} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><ArrowLeft size={14} />Pedidos</button>}
        {detail && (!oracle || detail.pedido.status !== 'picking') && <button disabled={busy} onClick={exportar} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><Download size={14} />{oracle ? 'Exportar movimentação' : 'Exportar picking'}</button>}
        {((oracle && detail?.pedido?.status !== 'picking' && detail?.pedido?.id) || (!oracle && ultimoEnvioLab)) && (
          <button type="button" disabled={busy} onClick={()=>void baixarEntregaGaia(oracle ? detail.pedido.id : ultimoEnvioLab)}
            className="flex items-center gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">
            <Download size={14} /> Planilha de envio ao laboratório
          </button>
        )}
        {detail && ehPickingAtivo && <>
          <label className="text-xs font-semibold text-slate-600">Classificação do processo
            <input list="tipos-reparo" value={tipoProcesso} onChange={e => setTipoProcesso(e.target.value)}
              placeholder="Reparo / Revisão não inicializa" className="mt-1 block min-w-48 rounded-lg border bg-white px-3 py-2 text-xs" maxLength={70}/>
            <datalist id="tipos-reparo"><option value="Reparo"/><option value="Revisão não inicializa"/><option value="Revisão técnica"/><option value="Reclassificação"/></datalist>
          </label>
          <button type="button" disabled={busy} onClick={() => imprimirDocumento('minuta')} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><Download size={14}/>Prévia da minuta (não envia)</button>
          <label className="text-xs font-semibold text-slate-600">Caixas
            <input type="number" value={quantidadeCaixas} onChange={e => setQuantidadeCaixas(e.target.value)}
              min="1" max="100" className="mt-1 block w-16 rounded-lg border bg-white px-2 py-2 text-xs"/>
          </label>
          <button type="button" disabled={busy} onClick={() => imprimirDocumento('etiquetas')} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs"><Download size={14}/>Etiquetas das caixas</button>
        </>}
        <button disabled={busy || loading} onClick={() => detail && ehPickingAtivo ? executar('atualizar') : detail ? abrir(detail.pedido.id) : carregar()} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs disabled:opacity-50"><RefreshCw size={14} />{detail && ehPickingAtivo ? 'Atualizar posições' : 'Atualizar'}</button>
      </div>
    </div>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {message && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
    {relatorioImportacao && (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-slate-800">
        <p className="font-black">Resultado da importação por voucher: {number(relatorioImportacao.incluidos)} incluídos, {number(relatorioImportacao.qtd_ignorados)} não incluídos.</p>
        {relatorioImportacao.qtd_ignorados > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer font-semibold text-amber-900">Ver vouchers não incluídos e respectivos motivos</summary>
            <div className="mt-2 max-h-60 overflow-auto rounded-lg border bg-white p-2">
              {relatorioImportacao.ignorados.map((x, index) => (
                <div key={x.voucher + '-' + index} className="border-b px-2 py-1.5 last:border-0">
                  <span className="font-mono font-bold">{x.voucher}</span> — {x.motivo}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    )}
    {!oracle && upload && <div className="space-y-3 rounded-xl border border-purple-200 bg-purple-50 p-4">
      <p className="text-sm font-semibold text-slate-800">{upload.nome} • {number(upload.vouchers.length)} vouchers válidos para reparo</p>
      <p className="text-xs text-slate-600">A importação usa o voucher para localizar o aparelho e seu IMEI no WMS/Triagem. Vouchers já presentes em pickings ativos serão ignorados e listados. A retirada física continua exigindo bipagem.</p>
      {(upload.qtdInvalidos > 0 || upload.qtdRepetidos > 0) && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
          <p className="font-black">{number(upload.qtdInvalidos)} linha(s) inválida(s) e {number(upload.qtdRepetidos)} voucher(s) repetido(s) ignorados.</p>
          <p className="mt-1">Somente os {number(upload.vouchers.length)} vouchers válidos serão importados. IMEIs não substituem vouchers.</p>
          {!!upload.invalidos.length && <p className="mt-2">{upload.invalidos.join(" · ")}</p>}
          {!!upload.repetidos.length && <p className="mt-2">{upload.repetidos.join(" · ")}</p>}
        </div>
      )}
      <details className="text-xs text-slate-600"><summary className="cursor-pointer font-semibold">Conferir vouchers do arquivo</summary><div className="mt-2 max-h-40 overflow-auto rounded-lg border bg-white p-3 font-mono">{upload.vouchers.map(codigo => <div key={codigo}>{codigo}</div>)}</div></details>
      <div className="flex gap-2"><button disabled={busy} onClick={importarReparo} className="rounded-lg bg-purple-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">{busy ? 'Importando…' : 'Importar e criar lote'}</button><button disabled={busy} onClick={() => setUpload(null)} className="rounded-lg border bg-white px-4 py-2 text-xs disabled:opacity-50">Cancelar</button></div>
    </div>}
    {loading && !detail && <p className="text-sm text-slate-500">Consultando reparos…</p>}
    {!detail && <>
      <div className="flex flex-wrap items-center gap-2">
        {!oracle && [
          { key: 'todos', titulo: 'Todos' },
          { key: 'picking', titulo: 'Em picking' },
          { key: 'aguardando_oracle', titulo: 'Fila Oracle' },
          { key: 'em_reparo', titulo: 'Histórico / Em reparo' },
        ].map(opcao => (
          <button key={opcao.key} type="button" onClick={() => setFiltroPedidos(opcao.key)}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${filtroPedidos === opcao.key ? 'border-orange-500 bg-orange-50 text-orange-900' : 'border-slate-200 text-slate-600'}`}>{opcao.titulo} · {number(contadores[opcao.key])}</button>
        ))}
        {oracle && <label className="flex items-center gap-2 text-xs text-slate-600"><input type="checkbox" checked={historico} onChange={e => setHistorico(e.target.checked)} />Incluir histórico de reparo</label>}
        <input aria-label="Buscar pedidos de reparo" value={buscaPedidos} onChange={e => setBuscaPedidos(e.target.value)}
          placeholder="Buscar lote, responsável ou tipo" className="min-w-52 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs" />
      </div>
      {oracle && <p className="text-xs text-slate-500">
        Pré-lista: <strong>{number(pedidos.filter(p => p.status === 'picking').reduce((n,p) => n + Number(p.fila_oracle || 0), 0))} IMEIs</strong> em lotes abertos ·
        Liberados: <strong>{number(pedidos.filter(p => p.status === 'aguardando_oracle').reduce((n,p) => n + Number(p.fila_oracle || 0), 0))} IMEIs</strong>.
        A confirmação Oracle fica disponível após concluir o picking.
      </p>}
      <div className="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-3">{pedidosVisiveis.map(p => <button disabled={busy} onClick={() => abrir(p.id)} key={p.id} className="flex min-w-0 w-full flex-col items-start rounded-xl border border-slate-200 p-4 text-left whitespace-normal hover:border-orange-400 disabled:opacity-50">
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-orange-700">{tipoPedido(p)}</span>
          <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${p.status === 'aguardando_oracle' ? 'bg-violet-50 text-violet-800' : p.status === 'picking' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{oracle && p.status === 'picking' ? 'Pré-lista Oracle' : statusPedido(p)}</span>
        </div>
        <p className="mt-2 w-full whitespace-normal font-bold leading-snug text-slate-800 [overflow-wrap:anywhere]">{p.lote}</p>
        <p className="mt-1 text-xs text-slate-500">{number(p.total)} aparelhos • {date(p.criado_em)}</p>
        <p className="mt-1 text-xs text-slate-500">{p.criado_por_nome || '—'}</p>
        <p className="mt-3 text-sm text-slate-700">{oracle ? `${number(p.fila_oracle)} bipados na fila` : p.status === 'picking' ? `${number(p.bipados)} bipados · ${number(p.pendentes)} pendentes · ${number(p.bloqueados)} bloqueados` : p.status === 'aguardando_oracle' ? `${number(p.fila_oracle)} aguardando Oracle` : 'Consultar histórico do lote'}</p>
      </button>)}</div>
      {!loading && !pedidosVisiveis.length && <p className="py-3 text-sm text-slate-500">{oracle ? 'Nenhum item bipado na pré-lista ou lote liberado para movimentação.' : 'Nenhum pedido encontrado para este filtro.'}</p>}
    </>}
    {pedido && <>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-orange-50 p-4">
        <div className="min-w-0 flex-1"><p className="whitespace-normal font-bold [overflow-wrap:anywhere]">{pedido.lote}</p><p className="mt-1 text-xs font-semibold text-amber-800">{statusPedido(pedido)}</p><p className="mt-1 text-sm">{pedido.status === 'picking' ? `${number(pedido.bipados)} de ${number(pedido.total)} bipados • ${number(pedido.pendentes)} aguardando bipagem • ${number(pedido.bloqueados)} com pendência` : `${number(pedido.total)} aparelhos no histórico do lote`}</p></div>
        {ehPickingAtivo && <button disabled={busy || pedido.bipados !== pedido.total || pedido.bloqueados > 0} onClick={() => executar('concluir')} className="flex items-center gap-2 rounded-xl bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><CheckCircle2 size={16} />Gerar minuta e enviar ao laboratório</button>}
      </div>
      {ehPickingAtivo && <form onSubmit={e => { e.preventDefault(); if (imei.trim()) executar('bipar', { p_imei: imei.trim() }); }} className="flex flex-wrap gap-2">
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
      {oracle && pedido.status === 'picking' && <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Os aparelhos bipados deste lote estão na pré-lista Oracle. Aguardam a conclusão do picking para liberação da movimentação.</p>}
      {oracle && pedido.status === 'em_reparo' && pedido.oracle_confirmado_em && <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">Status Oracle: {pedido.status_destino_oracle} • Referência: {pedido.referencia_oracle} • Confirmado em {date(pedido.oracle_confirmado_em)}</p>}
      <div className="flex flex-wrap gap-3"><input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Consultar IMEI, voucher, modelo ou SKU" aria-label="Consultar aparelho" className="min-w-60 flex-1 rounded-lg border p-2 text-sm" />
        <select value={filtro} onChange={e => setFiltro(e.target.value)} aria-label="Filtrar status do picking" className="rounded-lg border p-2 text-sm"><option value="">Todos os aparelhos</option><option value="pendente">Aguardando bipagem</option><option value="bloqueado">Com pendência</option><option value="bipado">Bipados</option><option value="em_reparo">Em reparo</option></select>
      </div>
      <div className="max-h-[580px] overflow-auto rounded-xl border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr>{['IMEI / Série', 'Voucher', 'Modelo', 'SKU', 'Grade', 'Defeitos Adicionais', 'Local WMS', 'Situação', 'Pendência / Bipagem'].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead><tbody className="divide-y">
        {itens.map(i => <tr key={i.id}><td className="p-3 font-mono font-semibold">{i.imei}</td><td className="p-3">{i.voucher || '—'}</td><td className="p-3">{i.modelo || 'Não informado'}</td><td className="p-3 font-mono">{i.sku || '—'}</td><td className="p-3">{i.grade || '—'}</td><td className="max-w-64 whitespace-normal p-3">{i.defeitos_adicionais || '—'}</td><td className="whitespace-nowrap p-3">{i.local_wms || 'Sem posição WMS'}</td><td className="p-3"><span className={`whitespace-nowrap rounded-full px-2 py-1 font-semibold ${i.status === 'bloqueado' ? 'bg-red-50 text-red-700' : i.status === 'pendente' ? 'bg-amber-50 text-amber-700' : 'bg-emerald-50 text-emerald-700'}`}>{pedido?.origem_lab === 'planilha_laboratorio' && i.status === 'pendente' ? 'Histórico importado' : labels[i.status] || i.status}</span></td><td className="min-w-56 max-w-96 p-3">{i.pendencia || date(i.bipado_em)}</td></tr>)}
        {!itens.length && <tr><td colSpan={9} className="p-8 text-center text-slate-500">Nenhum aparelho neste filtro.</td></tr>}
      </tbody></table></div>
      {ehPickingAtivo && <p className="text-xs text-slate-500">Posições vêm do WMS atual. Aparelhos com pendência ficam no pedido e impedem a conclusão até serem regularizados. A bipagem registra a retirada física para reparo.</p>}
    </>}
  </section>;
}
