import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ClipboardCheck, RefreshCw, Search, ShieldCheck, XCircle } from 'lucide-react';
import { CHECKLIST_MELI, MELI_ITENS, finalizarValidacaoMeli, listarFilaMeli, listarHistoricoMeli } from '../../services/meliValidacaoService.js';

const dataHora = valor => valor ? new Date(valor).toLocaleString('pt-BR') : '—';

export default function ValidacaoMeliV2Page() {
  const [fila, setFila] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [aba, setAba] = useState('fila');
  const [busca, setBusca] = useState('');
  const [selecionado, setSelecionado] = useState(null);
  const [imei, setImei] = useState('');
  const [sistema, setSistema] = useState('android');
  const [respostas, setRespostas] = useState({});
  const [motivo, setMotivo] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [loading, setLoading] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [detalhe, setDetalhe] = useState(null);
  const scanner = useRef(null);
  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const [pedidos, registros] = await Promise.all([listarFilaMeli(), listarHistoricoMeli()]);
      setFila(pedidos); setHistorico(registros);
    } catch (e) { setFeedback({ erro: true, texto: e.message }); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let ativo = true;
    Promise.all([listarFilaMeli(), listarHistoricoMeli()]).then(([pedidos, registros]) => {
      if (ativo) { setFila(pedidos); setHistorico(registros); }
    }).catch(e => { if (ativo) setFeedback({ erro: true, texto: e.message }); })
      .finally(() => { if (ativo) setLoading(false); });
    return () => { ativo = false; };
  }, []);

  function abrir(pedido) {
    setSelecionado(pedido); setImei(''); setRespostas({}); setMotivo(''); setObservacoes(''); setFeedback(null);
    setSistema(/iphone|apple|ios/i.test(pedido.titulo_produto || '') ? 'ios' : 'android');
    requestAnimationFrame(() => scanner.current?.focus());
  }
  const itens = useMemo(() => fila.filter(p => `${p.id_anymarket} ${p.imei_bipado} ${p.titulo_produto} ${p.numero_grupo || ''}`.toLowerCase().includes(busca.toLowerCase())), [fila, busca]);
  const respondidos = MELI_ITENS.filter(([key]) => typeof respostas[key] === 'boolean').length;
  const falhas = MELI_ITENS.filter(([key]) => respostas[key] === false);
  const identificado = Boolean(selecionado && imei.trim() === selecionado.imei_bipado);
  const podeAprovar = identificado && respondidos === MELI_ITENS.length && !falhas.length && !salvando;
  const podeReprovar = identificado && falhas.length > 0 && motivo.trim().length > 0 && !salvando;

  async function finalizar() {
    if (!podeAprovar && !podeReprovar) return;
    setSalvando(true); setFeedback(null);
    try {
      const resultado = await finalizarValidacaoMeli(selecionado, imei, sistema, respostas, motivo, observacoes);
      setSelecionado(null);
      await carregar();
      setFeedback({ erro: false, texto: resultado.resultado === 'aprovado'
        ? 'Aparelho aprovado. Liberado para faturamento após a aprovação dos demais itens do mesmo pedido.'
        : resultado.imei_substituto
          ? `Aparelho reprovado e bloqueado para venda. Próximo FIFO: ${resultado.imei_substituto}. Pedido retornou ao picking; o substituto também passará pelos testes. Retorne o reprovado ao estoque para análise/armazenagem.`
          : 'Aparelho reprovado e bloqueado para venda. Sem substituto elegível no FIFO: pedido enviado para Aguardando definição. Retorne o reprovado ao estoque para análise/armazenagem.' });
    } catch (e) { setFeedback({ erro: true, texto: e.message }); }
    finally { setSalvando(false); }
  }

  return <div className="mx-auto max-w-7xl space-y-5 p-4 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-violet-700"><ShieldCheck size={16} /> Controle de qualidade • Mercado Livre</div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Validação e Testes MELI</h1>
        <p className="mt-1 text-sm text-slate-500">Picking → testes de bancada → faturamento. Na dúvida, não sai.</p></div>
      <button type="button" onClick={carregar} disabled={loading || salvando} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold disabled:opacity-50"><RefreshCw size={16} /> Atualizar</button>
    </div>
    {feedback && <div role="alert" className={`rounded-xl border p-4 text-sm ${feedback.erro ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{feedback.texto}</div>}
    <div className="grid gap-3 sm:grid-cols-3">
      {[['Aguardando testes', fila.length], ['Aprovados no histórico', historico.filter(h => h.resultado === 'aprovado').length], ['Reprovados no histórico', historico.filter(h => h.resultado === 'reprovado').length]].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4"><div className="text-2xl font-black text-slate-900">{value}</div><div className="text-sm text-slate-500">{label}</div></div>)}
    </div>
    <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setAba('fila')} className={`rounded-xl px-4 py-2 text-sm font-bold ${aba === 'fila' ? 'bg-[#211136] text-white' : 'bg-white text-slate-600'}`}>Fila de validação</button><button type="button" onClick={() => setAba('historico')} className={`rounded-xl px-4 py-2 text-sm font-bold ${aba === 'historico' ? 'bg-[#211136] text-white' : 'bg-white text-slate-600'}`}>Histórico de testes</button></div>
    {aba === 'fila' ? <>
      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2"><Search size={16} className="text-slate-400" /><input aria-label="Buscar pedido ou IMEI" value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar pedido, IMEI, produto ou lista…" className="w-full bg-transparent text-sm outline-none" /></label>
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,0.8fr)_minmax(0,1.7fr)]">
        <div className="space-y-2">
          {loading && <p className="p-4 text-sm text-slate-500">Carregando fila…</p>}
          {!loading && !itens.length && <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">Nenhum aparelho aguardando validação nesta busca.</div>}
          {itens.map(p => <button type="button" key={p.id} disabled={salvando} onClick={() => abrir(p)} className={`w-full rounded-2xl border bg-white p-4 text-left disabled:opacity-50 ${selecionado?.id === p.id ? 'border-violet-500 ring-2 ring-violet-100' : 'border-slate-200'}`}>
            <div className="flex flex-wrap justify-between gap-1"><span className="font-black text-slate-900">Pedido #{p.id_anymarket}</span><span className="text-xs text-slate-500">Lista {p.numero_grupo || '—'}</span></div>
            <div className="mt-2 break-words text-sm font-semibold text-slate-700">{p.titulo_produto}</div><div className="mt-2 font-mono text-sm">{p.imei_bipado}</div><div className="mt-1 text-xs text-slate-500">{p.grade_alocada || p.grade_produto} • Separado {dataHora(p.bipado_em)}</div>
          </button>)}
        </div>
        {!selecionado ? <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500"><ClipboardCheck className="mx-auto mb-3 text-violet-400" size={36} /><p>Selecione um pedido e bipe o aparelho para iniciar a conferência.</p></div> : <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
          <div className="text-lg font-black">Pedido #{selecionado.id_anymarket}</div><p className="mt-1 break-words text-sm text-slate-600">{selecionado.titulo_produto}</p>
          <p className="mt-1 break-words text-xs text-slate-500">SKU {selecionado.sku_alocado || selecionado.sku_produto} • Grade {selecionado.grade_alocada || selecionado.grade_produto}</p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-slate-600">Bipe o IMEI do aparelho<input ref={scanner} value={imei} disabled={salvando} onChange={e => setImei(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') e.preventDefault(); }} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm" inputMode="numeric" autoComplete="off" /></label>
            <label className="text-xs font-bold text-slate-600">Checklist<select value={sistema} disabled={salvando} onChange={e => { setSistema(e.target.value); setRespostas({}); }} className="mt-1 block w-full rounded-xl border border-slate-300 px-3 py-2 text-sm"><option value="android">Android</option><option value="ios">Apple / iOS</option></select></label></div>
          {imei && <p className={`mt-2 text-xs font-bold ${identificado ? 'text-emerald-700' : 'text-rose-700'}`}>{identificado ? 'IMEI conferido.' : 'IMEI diferente do aparelho separado para este pedido.'}</p>}
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs leading-relaxed text-amber-900"><strong>Tela: brilho máximo e 1 minuto ligada.</strong><br />{sistema === 'ios'
            ? 'Na tela Olá/Emergência, digitar 1 a 9, 0, * e #; tocar também nos cantos superiores. Conferir se todos os números aparecem. Para áudio, o anexo orienta três cliques no botão lateral para ativar a voz; confirme na bancada se o atalho está disponível.'
            : 'Samsung: tentar *#0*# na chamada de emergência. Confirmar se o menu abre após o reset. Outras marcas têm menus próprios. No teste de touch, arrastar sem levantar o dedo e preencher toda a grade. Se o menu não abrir, inspecionar a tela e testar 1 a 9, 0, * e # e os cantos superiores, conforme o anexo.'}<br /><strong>Teste não executado permanece pendente. Qualquer NÃO reprova.</strong></div>
          <fieldset disabled={!identificado || salvando} className="mt-5 space-y-5 disabled:opacity-60">
            {CHECKLIST_MELI.map(bloco => <div key={bloco.titulo}><h2 className="mb-2 text-sm font-black text-violet-900">{bloco.titulo}</h2><div className="divide-y divide-slate-100">{bloco.itens.map(([key, label]) => <div key={key} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="min-w-0 flex-1 text-sm text-slate-700">{label}</span><div role="group" aria-label={label} className="flex shrink-0 gap-1">{[[true, 'Sim'], [false, 'Não']].map(([valor, texto]) => <button type="button" key={texto} aria-pressed={respostas[key] === valor} onClick={() => setRespostas(r => ({ ...r, [key]: valor }))} className={`rounded-lg border px-3 py-1.5 text-xs font-bold ${respostas[key] === valor ? valor ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-rose-600 bg-rose-600 text-white' : 'border-slate-200 text-slate-500'}`}>{texto}</button>)}</div></div>)}</div></div>)}
          </fieldset>
          <div className="mt-4 text-xs font-bold text-slate-500">{respondidos}/{MELI_ITENS.length} itens respondidos • {falhas.length} reprovações</div>
          {falhas.length > 0 && <label className="mt-4 block text-xs font-bold text-rose-700">Motivo da reprovação (obrigatório)<textarea value={motivo} disabled={salvando} onChange={e => setMotivo(e.target.value)} rows={3} className="mt-1 block w-full rounded-xl border border-rose-200 p-3 text-sm text-slate-700" placeholder="Descreva o problema e a tratativa necessária…" /></label>}
          <label className="mt-4 block text-xs font-bold text-slate-600">Observações<textarea value={observacoes} disabled={salvando} onChange={e => setObservacoes(e.target.value)} rows={2} className="mt-1 block w-full rounded-xl border border-slate-200 p-3 text-sm" /></label>
          <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={finalizar} disabled={!podeAprovar} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><CheckCircle2 size={18} />{salvando ? 'Salvando…' : 'Aprovar e liberar faturamento'}</button><button type="button" onClick={finalizar} disabled={!podeReprovar} className="flex items-center gap-2 rounded-xl bg-rose-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><XCircle size={18} />Reprovar e buscar próximo FIFO</button></div>
        </div>}
      </div>
    </> : <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><p className="p-4 text-xs text-slate-500">Últimas 200 validações. Clique em um registro para conferir as respostas.</p><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-500"><tr>{['Data / operador', 'Pedido / IMEI', 'Resultado', 'Destino / substituto', 'Motivo'].map(x => <th key={x} className="p-3">{x}</th>)}</tr></thead><tbody>{historico.map(h => <tr key={h.id} className="border-t border-slate-100"><td className="p-3">{dataHora(h.criado_em)}<div className="text-xs text-slate-500">{h.operador_nome}</div></td><td className="p-3"><button type="button" onClick={() => setDetalhe(h)} className="font-bold text-violet-700 underline">#{h.id_anymarket}</button><div className="font-mono text-xs">{h.imei}</div></td><td className={`p-3 font-bold ${h.resultado === 'aprovado' ? 'text-emerald-700' : 'text-rose-700'}`}>{h.resultado === 'aprovado' ? 'Aprovado' : 'Reprovado'}</td><td className="p-3">{{embalado:'Faturamento',em_picking:'Picking',aguardando_definicao_produto:'Aguardando definição'}[h.destino_pedido] || h.destino_pedido}<div className="font-mono text-xs">{h.imei_substituto || '—'}</div></td><td className="max-w-xs break-words p-3">{h.motivo || '—'}</td></tr>)}</tbody></table>{!historico.length && <p className="p-8 text-center text-slate-500">Nenhuma validação registrada.</p>}</div>}
    {detalhe && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div role="dialog" aria-modal="true" aria-label="Detalhes da validação" className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-6"><div className="flex items-center justify-between gap-3"><h2 className="font-black">Pedido #{detalhe.id_anymarket} • {detalhe.sistema === 'ios' ? 'iOS' : 'Android'}</h2><button type="button" onClick={() => setDetalhe(null)} className="rounded-lg border px-3 py-1 text-sm">Fechar</button></div><p className="mt-2 font-mono text-sm">{detalhe.imei}</p><div className="mt-4 space-y-2">{MELI_ITENS.map(([key,label]) => <div key={key} className="flex justify-between gap-3 text-sm"><span>{label}</span><strong className={detalhe.respostas[key] === true ? 'text-emerald-700' : detalhe.respostas[key] === false ? 'text-rose-700' : 'text-slate-400'}>{detalhe.respostas[key] === true ? 'Sim' : detalhe.respostas[key] === false ? 'Não' : 'Pendente'}</strong></div>)}</div><p className="mt-4 text-sm">{detalhe.motivo}</p><p className="mt-2 whitespace-pre-wrap text-sm text-slate-500">{detalhe.observacoes}</p></div></div>}
  </div>;
}
