import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, PackageCheck, RefreshCw, Search, Truck } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { baixarDeclaracaoDevolucao } from '../../services/tradeinOnlineDevolucaoService.js';

/** As devoluções Online compartilham a tela física de Expedição, sem entrar nos romaneios com NF da B2C. */
export default function DevolucoesOnlineExpedicaoPanel() {
  const [itens,setItens]=useState([]);
  const [carregando,setCarregando]=useState(false);
  const [erro,setErro]=useState('');
  const [busca,setBusca]=useState('');
  const [baixando,setBaixando]=useState('');
  const carregar=useCallback(async()=>{
    setCarregando(true);setErro('');
    try {
      const {data,error}=await supabase.rpc('assurant_tradein_online_expedicao_pendentes');
      if(error) throw error;
      setItens(data?.aparelhos||[]);
    } catch(e) {setErro(e.message||'Falha ao carregar as devoluções Trade-In Online.');}
    finally {setCarregando(false);}
  },[]);
  useEffect(()=>{carregar();},[carregar]);
  const filtrados=useMemo(()=>itens.filter(i=>[i.voucher,i.eticket,i.imei,i.codigo_rastreio,i.modelo]
    .some(s=>String(s||'').toLowerCase().includes(busca.toLowerCase()))),[itens,busca]);
  async function baixar(item,tipo){
    setBaixando(item.aparelho_id+'-'+tipo);setErro('');
    try{await baixarDeclaracaoDevolucao(tipo==='pdf'?item.pdf_path:item.excel_path,item.voucher,tipo);}
    catch(e){setErro(e.message);}
    finally{setBaixando('');}
  }
  return <section className="mb-7 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-violet-50/60 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><PackageCheck size={21}/></div>
        <div>
          <h2 className="text-base font-black text-slate-900">Devoluções Trade-ins Online — Expedição</h2>
          <p className="mt-1 text-xs text-slate-600">Declarações geradas e e-tickets aguardando expedição na fila principal</p>
        </div>
      </div>
      <button type="button" onClick={carregar} disabled={carregando}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">
        <RefreshCw size={15} className={carregando?'animate-spin':''}/> Atualizar ({itens.length})
      </button>
    </header>
    {erro&&<p role="alert" className="mx-4 my-3 rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-900">{erro}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
      <p className="text-xs text-slate-500">Fila por <strong>e-ticket</strong> — independente dos romaneios B2C com chave de NF.</p>
      <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/>
        <input className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs" value={busca}
          onChange={e=>setBusca(e.target.value)} placeholder="Voucher, e-ticket ou IMEI"/>
      </div>
    </div>
    <div className="overflow-x-auto px-4 py-4 sm:px-5">
      <table className="w-full min-w-[780px] text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr>
          {['Voucher','E-ticket','Aparelho / IMEI','Objeto Correios','Declaração','Situação'].map(x=>
            <th className="p-2.5 font-bold" key={x}>{x}</th>)}
        </tr></thead>
        <tbody>{filtrados.map(item=><tr className="border-b border-slate-100" key={item.aparelho_id}>
          <td className="p-2.5 font-mono font-bold text-violet-700">{item.voucher}</td>
          <td className="p-2.5 font-mono font-semibold">{item.eticket}</td>
          <td className="p-2.5"><strong>{item.modelo||'—'}</strong><p className="mt-1 font-mono text-slate-500">{item.imei||'—'}</p></td>
          <td className="p-2.5 font-mono">{item.codigo_rastreio||'—'}</td>
          <td className="p-2.5"><div className="flex gap-2">
            <button type="button" disabled={!!baixando} onClick={()=>baixar(item,'pdf')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 font-bold hover:bg-slate-50 disabled:opacity-40">
              <FileText size={13}/>PDF
            </button>
            <button type="button" disabled={!!baixando} onClick={()=>baixar(item,'xlsx')}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 font-bold hover:bg-slate-50 disabled:opacity-40">
              <FileSpreadsheet size={13}/>Excel
            </button>
          </div></td>
          <td className="p-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 font-bold text-amber-900">
            <Truck size={13}/>Aguardando expedição</span></td>
        </tr>)}</tbody>
      </table>
      {!carregando&&!filtrados.length&&<p className="py-6 text-center text-xs text-slate-500">
        Nenhuma devolução Online aguardando expedição.
      </p>}
    </div>
  </section>;
}
