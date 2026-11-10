import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, ClipboardList, Download, FileSpreadsheet, FileText, PackageCheck, RefreshCw, Search, Truck } from 'lucide-react';
import { useAuth } from '../../AuthContext.jsx';
import { supabase } from '../../lib/supabase.js';
import { baixarDeclaracaoDevolucao } from '../../services/tradeinOnlineDevolucaoService.js';
import {
  listarRomaneiosDevolucaoOnline,
  fecharRomaneioDevolucaoOnline,
  baixarRomaneioDevolucaoOnline
} from '../../services/romaneioDevolucaoOnlineService.js';

const botao='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:cursor-not-allowed disabled:opacity-40';

/** Usa a Expedição B2C existente, sem misturar e-tickets com romaneios de notas fiscais. */
export default function DevolucoesOnlineExpedicaoPanel() {
  const {user,profile}=useAuth();
  const operador=profile?.nome||user?.email||'Operador de Expedição';
  const [itens,setItens]=useState([]);
  const [romaneios,setRomaneios]=useState([]);
  const [selecionados,setSelecionados]=useState([]);
  const [carregando,setCarregando]=useState(true);
  const [fechando,setFechando]=useState(false);
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');
  const [busca,setBusca]=useState('');
  const [baixando,setBaixando]=useState('');
  const [mostrarHistorico,setMostrarHistorico]=useState(false);

  const carregar=useCallback(async()=>{
    setCarregando(true);setErro('');
    try {
      const [fila,historico]=await Promise.all([
        supabase.rpc('assurant_tradein_online_expedicao_pendentes'),
        listarRomaneiosDevolucaoOnline()
      ]);
      if(fila.error)throw fila.error;
      const pendentes=fila.data?.aparelhos||[];
      setItens(pendentes);
      setRomaneios(historico?.romaneios||[]);
      setSelecionados(prev=>prev.filter(id=>pendentes.some(item=>item.aparelho_id===id)));
    }catch(e){
      setErro(e.message||'Falha ao carregar as devoluções Trade-In Online.');
    }finally{setCarregando(false);}
  },[]);
  useEffect(()=>{carregar();},[carregar]);

  const filtrados=useMemo(()=>itens.filter(i=>
    [i.voucher,i.eticket,i.imei,i.codigo_rastreio,i.modelo].some(s=>
      String(s||'').toLowerCase().includes(busca.toLowerCase()))
  ),[itens,busca]);
  const idsVisiveis=filtrados.map(i=>i.aparelho_id);
  const todosSelecionados=idsVisiveis.length>0&&idsVisiveis.every(id=>selecionados.includes(id));

  function selecionarItem(id){
    if(fechando)return;
    setSelecionados(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id]);
  }
  function selecionarVisiveis(){
    if(fechando)return;
    setSelecionados(prev=>todosSelecionados
      ?prev.filter(id=>!idsVisiveis.includes(id))
      :[...new Set([...prev,...idsVisiveis])]);
  }

  async function baixarDeclaracao(item,tipo) {
    setBaixando(item.aparelho_id+'-'+tipo);setErro('');
    try {await baixarDeclaracaoDevolucao(tipo==='pdf'?item.pdf_path:item.excel_path,item.voucher,tipo);}
    catch(e){setErro(e.message);}
    finally{setBaixando('');}
  }

  async function reimprimir(romaneio) {
    setBaixando(romaneio.codigo);setErro('');
    try {await baixarRomaneioDevolucaoOnline(romaneio.pdf_path,romaneio.codigo);}
    catch(e){setErro('Não foi possível baixar o romaneio '+romaneio.codigo+': '+e.message);}
    finally{setBaixando('');}
  }

  async function fecharSelecionados() {
    if(fechando||carregando||!selecionados.length)return;
    const quantidade=selecionados.length;
    if(!window.confirm(
      'Fechar romaneio de devoluções Trade-ins Online com '+quantidade+' volume(s)?\n\n'+
      'Os vouchers selecionados sairão de Aguardando Expedição, serão registrados como EXPEDIDOS e ficarão vinculados a um único PDF. Essa operação não pode ser repetida para os mesmos e-tickets.'
    ))return;

    setFechando(true);setErro('');setSucesso('');
    let resultado;
    try {
      resultado=await fecharRomaneioDevolucaoOnline(selecionados,operador);
      setSucesso('Romaneio '+resultado.codigo+' fechado com '+resultado.quantidade+
        ' volume(s). Os vouchers foram registrados como expedidos e o PDF ficou salvo para reimpressão.');
      setSelecionados([]);
    }catch(e){
      setErro(e.message||'Não foi possível fechar o romaneio. Nenhum voucher deve ter sido movimentado.');
    }finally {setFechando(false);}

    if(resultado){
      // O fechamento já foi confirmado pelo banco: falha de download não desfaz o romaneio.
      try {await carregar();} catch { /* manter o número e a mensagem de sucesso */ }
      try {await baixarRomaneioDevolucaoOnline(resultado.pdf_path,resultado.codigo);}
      catch(e){setErro('Romaneio fechado com sucesso, mas o download não iniciou: '+e.message+'. Reimprima pelo histórico abaixo.');}
    }
  }

  return <section className="mb-7 overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-sm">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-violet-50/60 p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-100 p-3 text-violet-700"><PackageCheck size={21}/></div>
        <div>
          <h2 className="text-base font-black text-slate-900">Devoluções Trade-ins Online — Expedição</h2>
          <p className="mt-1 text-xs text-slate-600">Selecione os e-tickets do lote, feche e gere um romaneio PDF único</p>
        </div>
      </div>
      <button type="button" onClick={carregar} disabled={carregando||fechando} className={botao}>
        <RefreshCw size={15} className={carregando?'animate-spin':''}/> Atualizar ({itens.length})
      </button>
    </header>

    {erro&&<p role="alert" className="mx-4 my-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">{erro}</p>}
    {sucesso&&<p role="status" className="mx-4 my-3 flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-900"><CheckCircle2 size={16} className="shrink-0"/>{sucesso}</p>}

    <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
      <p className="text-xs text-slate-600">
        <strong>{itens.length}</strong> aguardando expedição · <strong>{selecionados.length}</strong> selecionado(s)
        <span className="ml-1 text-slate-500">— separados dos romaneios B2C com chave de NF</span>
      </p>
      <div className="relative"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/>
        <input className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-xs"
          value={busca} onChange={e=>setBusca(e.target.value)}
          placeholder="Voucher, e-ticket ou IMEI"/>
      </div>
    </div>

    <div className="overflow-x-auto px-4 py-4 sm:px-5">
      <table className="w-full min-w-[880px] text-left text-xs">
        <thead className="border-b border-slate-200 bg-slate-50 text-slate-600"><tr>
          <th className="w-12 p-2.5 text-center">
            <input type="checkbox" aria-label="Selecionar todos os vouchers visíveis"
              title="Selecionar ou desmarcar todos os vouchers exibidos no filtro"
              checked={todosSelecionados} disabled={carregando||fechando||!idsVisiveis.length}
              onChange={selecionarVisiveis} className="h-4 w-4 accent-violet-700"/>
          </th>
          {['Voucher','E-ticket','Aparelho / IMEI','Objeto Correios','Declaração','Situação'].map(x=>
            <th className="p-2.5 font-bold" key={x}>{x}</th>)}
        </tr></thead>
        <tbody>{filtrados.map(item=><tr
          className={'border-b border-slate-100 '+(selecionados.includes(item.aparelho_id)?'bg-violet-50/70':'')}
          key={item.aparelho_id}>
          <td className="p-2.5 text-center">
            <input type="checkbox" aria-label={'Selecionar voucher '+item.voucher}
              checked={selecionados.includes(item.aparelho_id)}
              disabled={carregando||fechando}
              onChange={()=>selecionarItem(item.aparelho_id)}
              className="h-4 w-4 accent-violet-700"/>
          </td>
          <td className="p-2.5 font-mono font-bold text-violet-700">{item.voucher}</td>
          <td className="p-2.5 font-mono font-semibold">{item.eticket}</td>
          <td className="p-2.5"><strong>{item.modelo||'—'}</strong>
            <p className="mt-1 font-mono text-slate-500">{item.imei||'—'}</p></td>
          <td className="p-2.5 font-mono">{item.codigo_rastreio||'—'}</td>
          <td className="p-2.5"><div className="flex gap-2">
            <button type="button" disabled={!!baixando||fechando} onClick={()=>baixarDeclaracao(item,'pdf')}
              className={botao+' !px-2.5 !py-2'}><FileText size={13}/>PDF</button>
            <button type="button" disabled={!!baixando||fechando} onClick={()=>baixarDeclaracao(item,'xlsx')}
              className={botao+' !px-2.5 !py-2'}><FileSpreadsheet size={13}/>Excel</button>
          </div></td>
          <td className="p-2.5"><span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1.5 font-bold text-amber-900">
            <Truck size={13}/>Aguardando expedição</span></td>
        </tr>)}</tbody>
      </table>
      {!carregando&&!filtrados.length&&<p className="py-7 text-center text-xs text-slate-500">
        Nenhuma devolução Online aguardando expedição neste filtro.
      </p>}
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/80 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={botao} onClick={selecionarVisiveis}
          disabled={!idsVisiveis.length||carregando||fechando}>
          {todosSelecionados?'Desmarcar visíveis':'Selecionar todos os visíveis'}
        </button>
        <span className="text-xs font-bold text-slate-700">{selecionados.length} volume(s) no romaneio</span>
      </div>
      <button type="button" onClick={fecharSelecionados}
        disabled={!selecionados.length||carregando||fechando}
        className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40">
        {fechando?<RefreshCw size={16} className="animate-spin"/>:<ClipboardList size={16}/>}
        {fechando?'Fechando romaneio...':'Fechar e gerar romaneio PDF'}
      </button>
    </div>

    <div className="border-t border-slate-200">
      <button type="button" className="flex w-full items-center justify-between gap-2 p-4 text-left text-xs font-bold text-slate-700 hover:bg-slate-50 sm:px-5"
        onClick={()=>setMostrarHistorico(v=>!v)}>
        <span className="flex items-center gap-2"><ClipboardList size={16} className="text-violet-700"/>Histórico de romaneios fechados ({romaneios.length}) — reimprimir PDF</span>
        {mostrarHistorico?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
      </button>
      {mostrarHistorico&&<div className="overflow-x-auto px-4 pb-4 sm:px-5">
        <table className="w-full min-w-[630px] text-left text-xs">
          <thead><tr className="border-b bg-slate-50 text-slate-600">
            {['Romaneio','Data de fechamento','Volumes','Responsável','Documento'].map(x=>
              <th className="p-2.5" key={x}>{x}</th>)}
          </tr></thead>
          <tbody>{romaneios.map(item=><tr className="border-b border-slate-100" key={item.id}>
            <td className="p-2.5 font-mono font-bold text-violet-700">{item.codigo}</td>
            <td className="p-2.5">{item.fechado_em?new Date(item.fechado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—'}</td>
            <td className="p-2.5 font-bold tabular-nums">{item.quantidade}</td>
            <td className="p-2.5">{item.fechado_por_nome||'—'}</td>
            <td className="p-2.5"><button type="button" disabled={!!baixando||fechando}
              onClick={()=>reimprimir(item)} className={botao+' !px-2.5 !py-2'}>
              <Download size={13}/>Reimprimir PDF
            </button></td>
          </tr>)}</tbody>
        </table>
        {!romaneios.length&&<p className="py-4 text-xs text-slate-500">Ainda não há romaneios fechados.</p>}
      </div>}
    </div>
  </section>;
}
