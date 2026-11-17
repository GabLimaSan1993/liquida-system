import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, PackageCheck, RefreshCw, ScanLine, X } from 'lucide-react';
import { supabase } from '../../lib/supabase.js';
import { classificacaoLaboratorio } from '../../services/laboratorioClassificacao.js';

const CAMPO='rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500';
const BOTAO='inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-50';
const dataBR=valor=>valor ? new Date(valor).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—';
const numeroMinuta=numero=>'LAB-DEV-'+String(numero).padStart(6,'0');
const textoStatus=s=>s==='devolvido_warehouse'?'Recebido no Warehouse':s==='em_devolucao'?'Aguardando bipagem':s||'Indefinido';
const CORES={
  reparado:{card:'border-lime-300 bg-lime-50 hover:bg-lime-100',chip:'border-lime-400 bg-lime-200 text-lime-950',barra:'bg-lime-600',texto:'text-lime-900',linha:'bg-lime-50/60'},
  sem_reparo:{card:'border-blue-300 bg-blue-50 hover:bg-blue-100',chip:'border-blue-400 bg-blue-200 text-blue-950',barra:'bg-blue-600',texto:'text-blue-900',linha:'bg-blue-50/60'},
  irrecuperavel:{card:'border-red-300 bg-red-50 hover:bg-red-100',chip:'border-red-400 bg-red-200 text-red-950',barra:'bg-red-600',texto:'text-red-900',linha:'bg-red-50/60'},
  misto:{card:'border-amber-300 bg-amber-50 hover:bg-amber-100',chip:'border-amber-400 bg-amber-100 text-amber-900',barra:'bg-amber-600',texto:'text-amber-900',linha:'bg-amber-50/60'}
};
const corMinuta=resultado=>CORES[resultado]||CORES.misto;
const labelMinuta=resultado=>classificacaoLaboratorio(resultado)?.rotulo||'Mista (legado)';
const listaDefeitos=x=>Array.isArray(x)?x.map(v=>String(v||'').trim()).filter(Boolean):[];

async function consultar(acao,id=null,codigo=null) {
  const {data,error}=await supabase.rpc('assurant_reparo_retorno_minutas',{
    p_acao:acao,p_minuta_id:id,p_codigo:codigo
  });
  if(error)throw new Error(error.message||'Erro na conferência do retorno');
  if(!data?.ok)throw new Error('O banco não confirmou a operação da minuta.');
  return data;
}

export default function RetornoLaboratorioMinutas(){
  const [minutas,setMinutas]=useState([]);
  const [detalhe,setDetalhe]=useState(null);
  const [leitura,setLeitura]=useState('');
  const [filtro,setFiltro]=useState('');
  const [tipo,setTipo]=useState('');
  const [ocupado,setOcupado]=useState(false);
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState('');
  const [aviso,setAviso]=useState('');
  const inputRef=useRef(null);

  const carregar=useCallback(async()=>{
    const r=await consultar('listar');
    setMinutas(r.minutas||[]);
    return r.minutas||[];
  },[]);

  useEffect(()=>{
    let ativo=true;
    consultar('listar').then(r=>{if(ativo)setMinutas(r.minutas||[]);})
      .catch(e=>{if(ativo)setErro(e.message);})
      .finally(()=>{if(ativo)setCarregando(false);});
    return()=>{ativo=false;};
  },[]);

  async function atualizar(){
    if(ocupado)return;
    setOcupado(true);setErro('');setAviso('');
    try{
      const recentes=await carregar();
      if(detalhe){
        const encontrada=recentes.some(m=>m.id===detalhe.minuta.id);
        setDetalhe(encontrada?await consultar('detalhar',detalhe.minuta.id):null);
      }
    }catch(e){setErro(e.message);}
    finally{setOcupado(false);}
  }

  async function abrir(minuta){
    if(ocupado)return;
    setOcupado(true);setErro('');setAviso('');setLeitura('');
    try{setDetalhe(await consultar('detalhar',minuta.id));}
    catch(e){setErro(e.message);}
    finally{setOcupado(false);inputRef.current?.focus();}
  }

  async function bipar(event){
    event.preventDefault();
    const codigo=leitura.trim().toUpperCase();
    if(!codigo||ocupado||!detalhe?.minuta?.id)return;
    setOcupado(true);setErro('');setAviso('');
    try{
      const r=await consultar('receber',detalhe.minuta.id,codigo);
      const [lista,registro]=await Promise.all([
        consultar('listar'),consultar('detalhar',detalhe.minuta.id)
      ]);
      setMinutas(lista.minutas||[]);
      setLeitura('');
      if(Number(registro.minuta?.pendentes||0)===0){
        setDetalhe(null);
        setAviso(numeroMinuta(registro.minuta.numero)+' recebida integralmente e retirada da fila.');
      }else{
        setDetalhe(registro);
        setAviso('Recebido: '+r.voucher+' · '+registro.minuta.recebidos+' de '+registro.minuta.total);
      }
    }catch(e){
      setErro(e.message||'Não foi possível confirmar este aparelho.');
      setLeitura('');
    }finally{setOcupado(false);inputRef.current?.focus();}
  }

  async function exportar(){
    if(ocupado)return;
    setOcupado(true);setErro('');
    try{
      const XLSX=await import('xlsx');
      const foco=detalhe? [detalhe]:await Promise.all(minutas.map(m=>consultar('detalhar',m.id)));
      const linhas=foco.flatMap(registro=>(registro.itens||[]).map(i=>({
        'Minuta':numeroMinuta(registro.minuta.numero),
        'Classificação':labelMinuta(i.resultado),
        'Voucher':i.voucher||'',
        'IMEI':String(i.imei||''),
        'Modelo':i.modelo||'',
        'OS GAIA':i.os_numero||'',
        'Status Warehouse':textoStatus(i.status),
        'Recebido em':i.recebido_em?dataBR(i.recebido_em):'',
        'Defeitos da triagem':listaDefeitos(i.defeitos_origem).join('; '),
        'Defeitos finais do Laboratório':listaDefeitos(i.defeitos_atual).join('; ')
      })));
      if(!linhas.length)throw new Error('Não há minutas para exportar.');
      const sheet=XLSX.utils.json_to_sheet(linhas);
      sheet['!autofilter']={ref:sheet['!ref']};
      sheet['!cols']=[{wch:20},{wch:20},{wch:22},{wch:20},{wch:35},{wch:22},{wch:25},{wch:23},{wch:55},{wch:55}];
      const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'Recebimento Warehouse');
      XLSX.writeFile(wb,detalhe?'Retorno_'+numeroMinuta(detalhe.minuta.numero)+'.xlsx':'Retorno_Laboratorio_Minutas_Pendentes.xlsx');
      setAviso('Exportados '+linhas.length+' aparelhos por minuta.');
    }catch(e){setErro(e.message||'Falha ao exportar as minutas.');}
    finally{setOcupado(false);}
  }

  const visiveis=minutas.filter(m=>
    (!tipo||m.classificacao===tipo) &&
    (!filtro.trim()||[numeroMinuta(m.numero),m.numero,labelMinuta(m.classificacao)]
      .some(x=>String(x).toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR').trim())))
  );
  const itens=detalhe?.itens||[];
  const totais=minutas.reduce((acc,m)=>({total:acc.total+Number(m.total||0),recebidos:acc.recebidos+Number(m.recebidos||0)}),{total:0,recebidos:0});

  return <section className="space-y-4 rounded-2xl border border-violet-200 bg-white p-4 shadow-sm md:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-black text-slate-900">Retorno de Reparo · Recebimento Warehouse</h2>
        <p className="mt-1 text-xs text-slate-500">Selecione a minuta recebida do Laboratório e confira seus aparelhos por bipagem.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={()=>void exportar()} disabled={ocupado||!minutas.length}
          className={BOTAO+' border-slate-200 bg-white text-slate-800'}><Download size={15}/>Exportar retorno e defeitos</button>
        <button type="button" onClick={()=>void atualizar()} disabled={ocupado||carregando}
          className={BOTAO+' border-slate-200 bg-white text-slate-800'}><RefreshCw size={15}/>Atualizar</button>
      </div>
    </div>
    {erro&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{erro}</p>}
    {aviso&&<p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{aviso}</p>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="rounded-lg bg-slate-100 px-3 py-2 font-semibold text-slate-700">{minutas.length} minutas pendentes</span>
        <span className="font-semibold text-slate-500">{totais.recebidos} / {totais.total} aparelhos recebidos</span>
      </div>
      <input className={CAMPO+' w-full max-w-xs'} value={filtro}
        onChange={e=>setFiltro(e.target.value)} aria-label="Pesquisar minuta"
        placeholder="Pesquisar número da minuta" autoComplete="off"/>
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={()=>setTipo('')}
        className={BOTAO+' '+(!tipo?'border-violet-600 bg-violet-700 text-white':'border-slate-200 bg-white text-slate-700')}>Todas</button>
      {['reparado','sem_reparo','irrecuperavel','misto'].map(t=><button key={t} type="button"
        onClick={()=>setTipo(t)} aria-pressed={tipo===t}
        className={BOTAO+' border '+corMinuta(t).chip+(tipo===t?' ring-2 ring-violet-500':'')}>
        {labelMinuta(t)}
      </button>)}
    </div>

    <div className="flex flex-wrap gap-2">
      {visiveis.map(m=>{
        const tema=corMinuta(m.classificacao);
        const percentual=Number(m.total)>0?Math.round(100*Number(m.recebidos)/Number(m.total)):0;
        const ativo=detalhe?.minuta?.id===m.id;
        return <button type="button" key={m.id} disabled={ocupado} onClick={()=>void abrir(m)}
          aria-pressed={ativo}
          className={'min-w-[220px] max-w-[310px] flex-1 rounded-xl border-2 p-3 text-left transition '+tema.card+(ativo?' ring-2 ring-violet-500 ring-offset-1':'')}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <span className={'text-sm font-black '+tema.texto}>{numeroMinuta(m.numero)}</span>
            <span className={'rounded-md border px-2 py-1 text-[10px] font-black '+tema.chip}>{labelMinuta(m.classificacao)}</span>
          </div>
          <div className="mt-2 flex items-end justify-between gap-2">
            <span className="text-xs font-semibold text-slate-700">{m.recebidos} / {m.total} recebidos</span>
            <span className="text-[11px] text-slate-500">{m.pendentes} pendentes</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/80">
            <div className={'h-full rounded-full '+tema.barra} style={{width:percentual+'%'}}/>
          </div>
          <p className="mt-2 text-[11px] text-slate-500">{dataBR(m.criado_em)}</p>
        </button>;
      })}
      {!carregando&&!visiveis.length&&<p className="w-full py-8 text-center text-sm text-slate-500">
        {minutas.length?'Nenhuma minuta nesta classificação.':'Nenhuma minuta aguardando recebimento do Warehouse.'}
      </p>}
      {carregando&&<p className="py-6 text-sm text-slate-500">Carregando minutas...</p>}
    </div>

    {detalhe&&<div className="space-y-4 border-t border-slate-100 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="text-sm font-black text-slate-900">{numeroMinuta(detalhe.minuta.numero)}</h3>
          <span className={'rounded-md border px-2.5 py-1 text-xs font-bold '+corMinuta(detalhe.minuta.classificacao).chip}>
            {labelMinuta(detalhe.minuta.classificacao)}
          </span>
          <span className="text-xs font-semibold text-slate-500">
            {detalhe.minuta.recebidos} de {detalhe.minuta.total} recebidos · {detalhe.minuta.pendentes} pendentes
          </span>
        </div>
        <button type="button" onClick={()=>{setDetalhe(null);setErro('');setLeitura('');}}
          disabled={ocupado} className={BOTAO+' border-slate-200 bg-white text-slate-700'}>
          <X size={14}/>Fechar
        </button>
      </div>

      <form onSubmit={e=>void bipar(e)} className="flex flex-wrap gap-2">
        <input ref={inputRef} autoFocus value={leitura} onChange={e=>setLeitura(e.target.value)}
          placeholder="Bipar Voucher ou IMEI desta minuta" autoComplete="off"
          aria-label="Voucher ou IMEI do aparelho recebido"
          disabled={ocupado} className={CAMPO+' min-w-[220px] flex-1 font-mono'}/>
        <button disabled={ocupado||!leitura.trim()} type="submit"
          className={BOTAO+' border-violet-700 bg-violet-700 px-4 text-white'}>
          <ScanLine size={16}/>Confirmar chegada
        </button>
      </form>

      <div className="max-h-[430px] overflow-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[950px] text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 text-slate-600">
            <tr>{['Voucher','IMEI / Série','Modelo / OS','Classificação','Conferência'].map(t=><th key={t} className="px-3 py-3 font-bold">{t}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {itens.map(i=><tr key={i.origem+':'+i.item_id} className={corMinuta(i.resultado).linha}>
              <td className="px-3 py-3 font-bold">{i.voucher||'—'}</td>
              <td className="px-3 py-3 font-mono">{i.imei||'Não informado'}</td>
              <td className="px-3 py-3">{i.modelo||'—'}<p className="mt-0.5 text-[11px] text-slate-500">OS {i.os_numero||'—'}</p></td>
              <td className="px-3 py-3"><span className={'rounded border px-2 py-1 text-[10px] font-bold '+corMinuta(i.resultado).chip}>{labelMinuta(i.resultado)}</span></td>
              <td className="px-3 py-3">{i.status==='devolvido_warehouse'
                ? <span className="inline-flex items-center gap-1 font-bold text-emerald-700"><PackageCheck size={14}/>Recebido {dataBR(i.recebido_em)}</span>
                : <span className="font-semibold text-amber-800">{textoStatus(i.status)}</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-500">Somente aparelhos desta minuta podem ser recebidos. A confirmação é física; não presume movimentação no Oracle ou no WMS.</p>
    </div>}
  </section>;
}
