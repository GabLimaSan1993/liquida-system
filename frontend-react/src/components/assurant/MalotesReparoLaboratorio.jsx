import { useCallback, useEffect, useRef, useState } from 'react';
import { ClipboardCheck, Download, PackageCheck, RefreshCw, ScanBarcode, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';

const campo = 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500';
const botao = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50';
const dataBR = x => x ? new Date(x).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—';

async function consultarMalotes(acao, id = null, codigo = null) {
  const { data, error } = await supabase.rpc('assurant_reparo_lab_malotes', {
    p_acao: acao, p_romaneio_id: id, p_codigo: codigo,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error('O laboratório não confirmou a operação do malote.');
  return data;
}

async function baixarMinuta(malote) {
  const XLSX = await import('xlsx');
  const itens = malote?.itens || [];
  if (!malote?.romaneio?.conferencia_concluida_em || !itens.length) {
    throw new Error('A planilha GAIA só é liberada após conferir todos os aparelhos.');
  }
  const colunas = ['Voucher', 'IMEI', 'Modelo', 'SKU', 'Grade', 'Defeitos Adicionais', 'OS GAIA'];
  const linhas = itens.map(i => ({
    Voucher: i.voucher || '',
    IMEI: String(i.imei || ''),
    Modelo: i.modelo || '',
    SKU: String(i.sku || ''),
    Grade: i.grade || '',
    'Defeitos Adicionais': i.defeitos_adicionais || '',
    'OS GAIA': i.os_gaia || '',
  }));
  const folha = XLSX.utils.json_to_sheet(linhas, { header: colunas });
  folha['!autofilter'] = { ref: folha['!ref'] };
  folha['!cols'] = [{ wch: 23 }, { wch: 21 }, { wch: 35 }, { wch: 25 },
    { wch: 15 }, { wch: 65 }, { wch: 22 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Malote GAIA');
  const numero = String(malote.romaneio.numero).padStart(6, '0');
  XLSX.writeFile(livro, 'Malote_LAB_ENV_' + numero + '_GAIA.xlsx');
}

export default function MalotesReparoLaboratorio({ onRecebimentoAtualizado }) {
  const [lista, setLista] = useState([]);
  const [malote, setMalote] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [aviso, setAviso] = useState('');
  const inputRef = useRef(null);

  const listar = useCallback(async () => {
    const resp = await consultarMalotes('listar');
    setLista(resp.malotes || []);
  }, []);

  useEffect(() => {
    let ativo = true;
    consultarMalotes('listar')
      .then(resp => { if (ativo) setLista(resp.malotes || []); })
      .catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, []);

  async function selecionar(id) {
    if (ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      const resp = await consultarMalotes('detalhar', id);
      setMalote(resp); setCodigo('');
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }

  async function executar(acao, valor = null) {
    if (!malote?.romaneio?.id || ocupado) return;
    setOcupado(true); setErro(''); setAviso('');
    try {
      const resp = await consultarMalotes(acao, malote.romaneio.id, valor);
      setMalote(resp);
      setCodigo('');
      await listar();
      if (acao === 'bipar') {
        setAviso('Conferido: ' + resp.ultimo_conferido?.voucher +
          ' · ' + (resp.ultimo_conferido?.modelo || resp.ultimo_conferido?.sku || '') +
          ' · ' + resp.conferidos + ' de ' + resp.total);
      } else if (acao === 'desfazer') {
        setAviso('Bipagem desfeita. O aparelho voltou para a conferência.');
      } else if (acao === 'gerar_minuta') {
        setAviso('Malote conferido e minuta GAIA gerada. Preencha a coluna OS GAIA depois de abrir as OS.');
        await baixarMinuta(resp);
      }
      if (onRecebimentoAtualizado) onRecebimentoAtualizado();
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); inputRef.current?.focus(); }
  }

  async function baixar() {
    setErro('');
    try {
      const atualizado = await consultarMalotes('detalhar', malote.romaneio.id);
      setMalote(atualizado);
      await baixarMinuta(atualizado);
    } catch (e) { setErro(e.message); }
  }

  const items = malote?.itens || [];
  const fechado = Boolean(malote?.romaneio?.conferencia_concluida_em);
  return <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="flex items-center gap-2 text-base font-black text-slate-900"><ScanBarcode size={19} className="text-violet-700"/>Malotes de envio Warehouse → Laboratório</h2>
        <p className="mt-1 text-xs text-slate-500">Cada minuta nasce do picking concluído. Confira os aparelhos físicos antes de gerar a planilha para abertura das OS no GAIA.</p>
      </div>
      <button type="button" className={botao + ' border-slate-200'} disabled={ocupado}
        onClick={async () => { try { await listar(); if (malote) await selecionar(malote.romaneio.id); } catch(e) { setErro(e.message); } }}>
        <RefreshCw size={14}/>Atualizar
      </button>
    </div>
    {erro && <p role="alert" className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{erro}</p>}
    {aviso && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{aviso}</p>}
    <div className="mt-4 flex flex-wrap gap-2">
      {lista.map(lote => <button type="button" key={lote.id} disabled={ocupado}
        onClick={() => selecionar(lote.id)}
        className={'rounded-lg border px-3 py-2 text-left text-xs ' +
          (malote?.romaneio?.id === lote.id ? 'border-violet-500 bg-violet-50' : 'border-slate-200 bg-slate-50 hover:border-violet-300')}>
        <span className="block font-bold text-slate-900">LAB-ENV-{String(lote.numero).padStart(6, '0')}</span>
        <span className="mt-1 block text-slate-600">{lote.lote} · {lote.conferidos}/{lote.total} bipados</span>
        <span className="block text-slate-400">{lote.conferencia_concluida_em ? 'Conferido' : 'Aguardando conferência'}</span>
      </button>)}
      {!lista.length && <p className="text-xs text-slate-500">Nenhum malote de picking Warehouse disponível. Ao concluir um picking, a minuta aparecerá aqui automaticamente.</p>}
    </div>
    {malote && <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-slate-900">{malote.romaneio.lote}</p>
          <p className="text-xs text-slate-500">{malote.conferidos} de {malote.total} conferidos · {malote.faltantes} pendentes · {dataBR(malote.romaneio.criado_em)}</p>
        </div>
        {fechado ? <button type="button" disabled={ocupado} onClick={() => void baixar()}
          className={botao + ' border-emerald-700 bg-emerald-600 text-white'}><Download size={15}/>Baixar minuta com OS GAIA</button>
          : <button type="button" disabled={ocupado || !malote.total || malote.faltantes !== 0}
            onClick={() => void executar('gerar_minuta')}
            className={botao + ' border-emerald-700 bg-emerald-600 text-white'}>
            <ClipboardCheck size={15}/>Concluir conferência e gerar minuta
          </button>}
      </div>
      {!fechado && <form className="flex flex-wrap gap-2" onSubmit={e => { e.preventDefault(); if (codigo.trim()) void executar('bipar', codigo.trim()); }}>
        <input ref={inputRef} className={campo + ' min-w-48 flex-1 font-mono'} autoFocus
          value={codigo} onChange={e => setCodigo(e.target.value)} disabled={ocupado}
          aria-label="Bipar voucher, SKU ou IMEI do malote"
          placeholder="Bipar Voucher, SKU ou IMEI" autoComplete="off"/>
        <button className={botao + ' border-violet-700 bg-violet-700 text-white'} disabled={ocupado || !codigo.trim()}>
          <PackageCheck size={15}/>Conferir aparelho
        </button>
      </form>}
      <div className="max-h-80 overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[980px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-500"><tr>
            {['Voucher','IMEI / Série','Modelo','SKU','Grade','Defeitos Adicionais','Conferência'].map(h => <th key={h} className="px-3 py-2">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{items.map(item => <tr key={item.id} className={item.conferido_em ? 'bg-emerald-50/40' : ''}>
            <td className="px-3 py-2 font-semibold">{item.voucher}</td>
            <td className="px-3 py-2 font-mono">{item.imei || '—'}</td>
            <td className="px-3 py-2">{item.modelo || '—'}</td>
            <td className="px-3 py-2">{item.sku || '—'}</td>
            <td className="px-3 py-2">{item.grade || '—'}</td>
            <td className="max-w-72 px-3 py-2 whitespace-normal">{item.defeitos_adicionais || '—'}</td>
            <td className="px-3 py-2">{item.conferido_em ?
              <span className="flex items-center gap-2 text-emerald-700">Conferido
                {!fechado && <button type="button" disabled={ocupado} title="Desfazer conferência"
                  onClick={() => void executar('desfazer', item.voucher)}
                  className="rounded border border-emerald-300 px-1.5 py-1"><Undo2 size={13}/></button>}
              </span> : <span className="text-amber-700">Pendente</span>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">A coluna OS GAIA será preenchida após a abertura das ordens no GAIA. Importe a mesma planilha na seção “Importar Voucher + OS GAIA” abaixo. Nenhuma bipagem altera Oracle ou estoque automaticamente.</p>
    </div>}
  </section>;
}
