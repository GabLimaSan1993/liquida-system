import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

export default function ReparoRetornoPanel({ modo = 'armazenagem' }) {
  const oracle = modo === 'oracle';
  const [itens, setItens] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro('');
    try {
      const { data, error } = await supabase.rpc('assurant_reparo_retorno', {
        p_acao: oracle ? 'listar_oracle' : 'listar_armazenagem'
      });
      if (error) throw error;
      setItens(data || []);
    } catch (e) { setErro(e.message || 'Não foi possível consultar os retornos.'); }
    finally { setLoading(false); }
  }, [oracle]);
  useEffect(() => { carregar(); }, [carregar]);

  async function executar(item) {
    const acao = oracle ? 'confirmar_entrada' : 'registrar_retorno';
    const referencia = oracle ? window.prompt(`Informe a referência da entrada realizada no Oracle para o IMEI ${item.imei}:`) : null;
    if (oracle && !referencia?.trim()) return;
    if (!window.confirm(oracle
      ? `Confirmar a entrada Oracle do IMEI ${item.imei} e liberar para venda?`
      : `Confirmar o retorno físico do IMEI ${item.imei} e encaminhar à fila de armazenagem?`)) return;
    setBusy(item.id); setErro(''); setMensagem('');
    try {
      const { error } = await supabase.rpc('assurant_reparo_retorno', {
        p_acao: acao, p_item_id: item.id, p_referencia: referencia?.trim() || null
      });
      if (error) throw error;
      setMensagem(oracle ? 'Entrada Oracle registrada. Produto disponível.' : 'Retorno registrado. Produto enviado para Aguardando armazenagem.');
      await carregar();
    } catch (e) { setErro(e.message || 'Não foi possível registrar esta movimentação.'); }
    finally { setBusy(''); }
  }

  const filtrados = itens.filter(i => [i.imei,i.voucher,i.lote,i.modelo].some(x => String(x || '').toLowerCase().includes(filtro.toLowerCase())));
  return <section className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-black text-slate-800">{oracle ? 'Retorno de reparo — movimentação Oracle' : 'Retorno de reparo — armazenagem'}</h2>
        <p className="mt-1 text-xs text-slate-500">{oracle ? 'Itens que retornaram do reparo e já foram novamente alocados. Confirme a entrada no Oracle para liberar o estoque.' : 'Registre o recebimento do aparelho que saiu pelo picking de reparo. Ele voltará à fila normal de alocação no WMS.'}</p>
      </div>
      <button type="button" onClick={carregar} disabled={loading} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold">Atualizar</button>
    </div>
    <input value={filtro} onChange={e => setFiltro(e.target.value)} placeholder="Filtrar IMEI, voucher ou lote" aria-label="Pesquisar retornos" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
    {erro && <p className="text-sm text-red-700" role="alert">{erro}</p>}
    {mensagem && <p className="text-sm text-green-700" role="status">{mensagem}</p>}
    {loading && <p className="text-xs text-slate-500">Carregando retornos...</p>}
    <div className="overflow-x-auto">
      <table className="min-w-[760px] w-full text-left text-xs">
        <thead><tr className="border-b bg-slate-50"><th className="p-3">IMEI</th><th className="p-3">Voucher</th><th className="p-3">Pedido reparo</th><th className="p-3">Etapa</th><th className="p-3">Ação</th></tr></thead>
        <tbody>{filtrados.map(i => <tr key={i.id} className="border-b">
          <td className="p-3 font-mono font-bold">{i.imei}</td><td className="p-3">{i.voucher || '—'}</td><td className="p-3">{i.lote}</td>
          <td className="p-3">{i.status === 'retorno_armazenagem' ? i.apto_oracle ? 'Realocado — aguardando Oracle' : 'Aguardando alocação' : 'Fora para reparo'}</td>
          <td className="p-3">{oracle
            ? <button type="button" onClick={() => executar(i)} disabled={!!busy} className="rounded-lg bg-violet-700 px-3 py-2 font-bold text-white disabled:opacity-50">Confirmar entrada Oracle</button>
            : i.status === 'retorno_armazenagem'
              ? <span className="text-amber-700">Encaminhado à alocação WMS</span>
              : <button type="button" onClick={() => executar(i)} disabled={!!busy} className="rounded-lg bg-violet-700 px-3 py-2 font-bold text-white disabled:opacity-50">Registrar retorno</button>}
          </td>
        </tr>)}</tbody>
      </table>
      {!loading && filtrados.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum produto nesta etapa.</p>}
    </div>
  </section>;
}
