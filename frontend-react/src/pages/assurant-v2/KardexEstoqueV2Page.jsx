import { useEffect, useMemo, useState } from 'react';
import {
  Archive, ArrowDownRight, ArrowUpRight, CalendarDays, ChevronLeft, ChevronRight,
  Clock3, Download, FileSpreadsheet, Filter, Layers3, RefreshCw, Search, TrendingUp, Warehouse
} from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis,
  Tooltip, Legend, Bar, Line
} from 'recharts';
import * as XLSX from 'xlsx';
import { consultarKardexWms, PERIODOS_KARDEX } from '../../services/kardexEstoqueService.js';

const ROTA='/v2/assurant/estoque/kardex';
const GRADES=['QUEBRADO','REGULAR','BOM','MUITO BOM','EXCELENTE','LIKE NEW','OUTROS'];
const formatter=new Intl.NumberFormat('pt-BR');
const numero=v=>formatter.format(Number(v)||0);
const hora=v=>v?new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}):'—';
const yyyyMmDd=d=>[
  d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')
].join('-');
const hojeBrasil=()=>new Intl.DateTimeFormat('sv-SE',{
  timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const dataLocal=s=>new Date(String(s||'2026-01-01')+'T12:00:00');
function inicioRecomendado(periodo,fim){
  const d=dataLocal(fim);
  if(periodo==='dia')d.setDate(d.getDate()-29);
  if(periodo==='semana')d.setDate(d.getDate()-((d.getDay()+6)%7)-11*7);
  if(periodo==='mes'){d.setDate(1);d.setMonth(d.getMonth()-11);}
  if(periodo==='trimestre'){d.setDate(1);d.setMonth(Math.floor(d.getMonth()/3)*3-21);}
  if(periodo==='ano'){d.setMonth(0,1);d.setFullYear(d.getFullYear()-4);}
  return yyyyMmDd(d);
}
const rotuloPeriodo=(valor,tipo)=>{
  if(!valor)return '—';
  const d=dataLocal(valor);
  if(tipo==='dia')return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  if(tipo==='semana'){
    const fim=new Date(d);
    fim.setDate(fim.getDate()+6);
    return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})+'–'+fim.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'});
  }
  if(tipo==='mes')return d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'});
  if(tipo==='trimestre')return 'T'+(Math.floor(d.getMonth()/3)+1)+'/'+d.getFullYear();
  return String(d.getFullYear());
};
const botao='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 hover:bg-violet-50 disabled:opacity-40';
const campo='rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-violet-500';
function Kpi({titulo,valor,subtitulo,icon:Icon,accent}){
  return <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-500">
      {titulo}<Icon className={accent||'text-violet-700'} size={19}/>
    </div>
    <p className="mt-2 text-3xl font-black tabular-nums text-slate-900">{numero(valor)}</p>
    <p className="mt-1 text-[11px] leading-4 text-slate-500">{subtitulo}</p>
  </div>;
}
function TooltipKardex({active,payload,label}){
  if(!active||!payload?.length)return null;
  return <div className="rounded-xl border border-slate-200 bg-white p-3 text-xs shadow-xl">
    <p className="mb-2 font-bold text-slate-900">{label}</p>
    {payload.map(x=><p key={x.dataKey} className="mt-1" style={{color:x.color}}>{x.name}: <strong>{numero(x.value)}</strong></p>)}
  </div>;
}
function exportarExcel(dados,config){
  const wb=XLSX.utils.book_new();
  const resumo=dados.resumo||{};
  const cabecalho=[
    ['KARDEX FÍSICO WMS - ASSURANT'],
    ['Início',config.inicio],['Fim',config.fim],['Periodicidade',config.periodo],
    ['Busca',config.buscaAplicada||'Todos'],['SKU',config.skuAplicado||'Todos'],
    ['Grade',config.grade||'Todas'],['Fonte','WMS: armazenagem, retirada e cancelamento'],
    ['Cobertura inicial WMS',dados.primeira_data_wms||'—'],
    [],['Saldo de abertura',resumo.saldo_abertura],['Entradas',resumo.entradas],
    ['Retiradas',resumo.saidas],['Estornos',resumo.estornos],
    ['Variação',resumo.variacao],['Saldo de fechamento',resumo.saldo_fechamento],
    [],['IMPORTANTE','Kardex de posições físicas; não é saldo Oracle nem inventário fiscal.']
  ];
  const s1=XLSX.utils.aoa_to_sheet(cabecalho);
  s1['!cols']=[{wch:29},{wch:48}];
  XLSX.utils.book_append_sheet(wb,s1,'Resumo');
  const e=(dados.evolucao||[]).map(x=>({
    'Período':rotuloPeriodo(x.inicio,config.periodo),
    'Início':x.inicio,'Entradas':x.entradas,'Retiradas':x.saidas,
    'Estornos':x.estornos,'Variação líquida':x.variacao,'Saldo final':x.saldo
  }));
  const s2=XLSX.utils.json_to_sheet(e.length?e:[{'Período':'Sem dados'}]);
  s2['!cols']=[{wch:23},{wch:14},{wch:16},{wch:16},{wch:16},{wch:19},{wch:18}];
  XLSX.utils.book_append_sheet(wb,s2,'Evolução');
  const m=(dados.movimentacoes||[]).map(x=>({
    'Data/hora':hora(x.data),'Tipo':x.tipo,'Quantidade':x.quantidade,
    'Saldo após evento':x.saldo_apos,'IMEI / serial':x.imei||'',
    'Voucher':x.voucher||'','SKU':x.sku||'',
    'Marca':x.marca||'','Modelo':x.modelo||'',
    'Grade':x.grade||'','Endereço':x.endereco||'',
    'Canal de saída':x.canal||'','Referência':x.referencia||'',
    'Colaborador':x.operador||''
  }));
  const s3=XLSX.utils.json_to_sheet(m.length?m:[{'Data/hora':'Sem movimentos'}]);
  s3['!cols']=Array.from({length:14},(_,i)=>({wch:i===10?44:i===0?22:23}));
  XLSX.utils.book_append_sheet(wb,s3,'Movimentos página '+(dados.pagina||1));
  const s4=XLSX.utils.json_to_sheet((dados.canais||[]).map(x=>({
    'Canal de retirada':x.canal,'Quantidade':x.quantidade
  })));
  XLSX.utils.book_append_sheet(wb,s4,'Canais de saída');
  XLSX.writeFile(wb,'Kardex_WMS_'+config.periodo+'_'+config.inicio+'_a_'+config.fim+'.xlsx');
}

export default function KardexEstoqueV2Page(){
  const hoje=useMemo(hojeBrasil,[]);
  const [periodo,setPeriodo]=useState('semana');
  const [inicio,setInicio]=useState(()=>inicioRecomendado('semana',hoje));
  const [fim,setFim]=useState(hoje);
  const [busca,setBusca]=useState('');
  const [sku,setSku]=useState('');
  const [buscaAplicada,setBuscaAplicada]=useState('');
  const [skuAplicado,setSkuAplicado]=useState('');
  const [grade,setGrade]=useState('');
  const [pagina,setPagina]=useState(1);
  const [revisao,setRevisao]=useState(0);
  const [dados,setDados]=useState(null);
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState('');
  const [mostrarFiltros,setMostrarFiltros]=useState(false);

  function selecionarPeriodo(proximo){
    if(periodo===proximo)return;
    setPeriodo(proximo);setInicio(inicioRecomendado(proximo,hoje));setFim(hoje);setPagina(1);
  }
  useEffect(()=>{
    let ativo=true;
    setCarregando(true);setErro('');
    consultarKardexWms({inicio,fim,periodo,busca:buscaAplicada,sku:skuAplicado,grade,pagina})
      .then(result=>{if(ativo)setDados(result);})
      .catch(err=>{if(ativo){setErro(err.message);setDados(null);}})
      .finally(()=>{if(ativo)setCarregando(false);});
    return()=>{ativo=false;};
  },[inicio,fim,periodo,buscaAplicada,skuAplicado,grade,pagina,revisao]);

  const resumo=dados?.resumo||{};
  const evolucao=useMemo(()=>(dados?.evolucao||[]).map(x=>({...x,label:rotuloPeriodo(x.inicio,periodo)})),[dados?.evolucao,periodo]);
  const paginas=Math.max(1,Math.ceil((Number(resumo.movimentos)||0)/100));
  const primeiraData=dados?.primeira_data_wms;
  const temFiltro=Boolean(buscaAplicada||skuAplicado||grade);
  const totalSaidas=(dados?.canais||[]).reduce((sum,item)=>sum+Number(item.quantidade||0),0);

  return <div className="mx-auto max-w-[1600px] space-y-5 pb-8">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Assurant · Estoque</p>
          <div className="mt-1 flex items-center gap-3">
            <div className="rounded-xl bg-violet-50 p-3 text-violet-700"><Layers3 size={23}/></div>
            <div>
              <h1 className="text-2xl font-black text-slate-900">Kardex de Estoque</h1>
              <p className="mt-1 text-xs text-slate-500">Movimentações do WMS com saldo cronológico, por IMEI, voucher, SKU e grade</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={botao} onClick={()=>setMostrarFiltros(v=>!v)}>
            <Filter size={15}/> Filtros {temFiltro?'ativos':''}
          </button>
          <button type="button" className={botao} disabled={carregando} onClick={()=>setRevisao(v=>v+1)}>
            <RefreshCw size={15} className={carregando?'animate-spin':''}/> Atualizar
          </button>
          <button type="button" className={botao} disabled={!dados||carregando}
            onClick={()=>exportarExcel(dados,{inicio,fim,periodo,buscaAplicada,skuAplicado,grade})}>
            <Download size={15}/> Excel
          </button>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2" role="group" aria-label="Periodicidade do Kardex">
        {PERIODOS_KARDEX.map(item=><button key={item.id} type="button"
          aria-pressed={periodo===item.id} onClick={()=>selecionarPeriodo(item.id)}
          className={'rounded-xl border px-4 py-2.5 text-xs font-bold transition '+
            (periodo===item.id?'border-violet-700 bg-violet-700 text-white':'border-slate-200 bg-slate-50 text-slate-700 hover:border-violet-300')}>
          {item.nome}
        </button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <label className="text-xs font-bold text-slate-600">De
          <input type="date" value={inicio} max={fim} onChange={e=>{setInicio(e.target.value);setPagina(1);}} className={campo+' mt-1 block'}/>
        </label>
        <label className="text-xs font-bold text-slate-600">Até
          <input type="date" value={fim} min={inicio} onChange={e=>{setFim(e.target.value);setPagina(1);}} className={campo+' mt-1 block'}/>
        </label>
        <span className="mb-2 text-xs text-slate-500"><CalendarDays size={14} className="mr-1 inline"/> Intervalo ajustável em todas as visões</span>
      </div>
      {mostrarFiltros&&<form className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-slate-100 bg-slate-50 p-4"
        onSubmit={e=>{e.preventDefault();setBuscaAplicada(busca.trim());setSkuAplicado(sku.trim());setPagina(1);}}>
        <label className="min-w-[225px] flex-1 text-xs font-bold text-slate-600">IMEI, voucher, modelo ou SKU
          <input className={campo+' mt-1 w-full'} value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar no histórico WMS" maxLength={90}/>
        </label>
        <label className="min-w-[190px] flex-1 text-xs font-bold text-slate-600">SKU exato
          <input className={campo+' mt-1 w-full'} value={sku} onChange={e=>setSku(e.target.value)} placeholder="Ex.: BRZDEV12571"/>
        </label>
        <label className="min-w-[175px] text-xs font-bold text-slate-600">Grade
          <select className={campo+' mt-1 block w-full'} value={grade} onChange={e=>{setGrade(e.target.value);setPagina(1);}}>
            <option value="">Todas as grades</option>
            {GRADES.map(x=><option value={x} key={x}>{x}</option>)}
          </select>
        </label>
        <button type="submit" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-bold text-white"><Search size={14}/>Aplicar</button>
        <button type="button" className={botao} onClick={()=>{setBusca('');setSku('');setBuscaAplicada('');setSkuAplicado('');setGrade('');setPagina(1);}}>Limpar</button>
      </form>}
    </header>

    <div className="rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-3 text-xs leading-relaxed text-violet-950">
      <strong>Kardex físico WMS.</strong> Entrada = armazenagem confirmada; saída = retirada do WMS (inclusive para reparo);
      estorno = cancelamento de armazenagem confirmada. O saldo é de <strong>alocações físicas registradas</strong>,
      não é o estoque Oracle nem a quantidade de produtos em triagem. A cobertura começa no primeiro registro do WMS
      {primeiraData?' ('+new Date(primeiraData+'T12:00:00').toLocaleDateString('pt-BR')+')':''}.
      Retiradas e realocações internas são exibidas como eventos físicos separados, sem presumir uma compra ou venda.
    </div>
    {erro&&<div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-900" role="alert">
      Não foi possível consultar o Kardex: {erro}
      <button type="button" className="ml-3 underline" onClick={()=>setRevisao(v=>v+1)}>Tentar novamente</button>
    </div>}

    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <Kpi titulo="Saldo de abertura" valor={resumo.saldo_abertura} subtitulo="Posições antes do início" icon={Warehouse}/>
      <Kpi titulo="Entradas" valor={resumo.entradas} subtitulo="Armazenagens confirmadas" icon={ArrowUpRight} accent="text-emerald-600"/>
      <Kpi titulo="Saídas" valor={resumo.saidas} subtitulo="Retiradas físicas do WMS" icon={ArrowDownRight} accent="text-rose-600"/>
      <Kpi titulo="Estornos" valor={resumo.estornos} subtitulo="Alocações canceladas" icon={RefreshCw} accent="text-amber-600"/>
      <Kpi titulo="Variação líquida" valor={resumo.variacao} subtitulo="Entradas − saídas − estornos" icon={TrendingUp}/>
      <Kpi titulo="Saldo de fechamento" valor={resumo.saldo_fechamento} subtitulo="Posições ao fim do período" icon={Archive} accent="text-emerald-700"/>
    </div>

    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(290px,0.85fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="font-black text-slate-900">Evolução do estoque</h2>
            <p className="mt-1 text-xs text-slate-500">Entradas, retiradas e saldo ao final de cada {periodo==='mes'?'mês':periodo==='trimestre'?'trimestre':periodo==='ano'?'ano':periodo==='semana'?'semana':'dia'}</p></div>
          <span className="rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600">{evolucao.length} período(s)</span>
        </div>
        {carregando&&!dados?<div className="flex h-[300px] items-center justify-center text-xs text-slate-500"><RefreshCw size={16} className="mr-2 animate-spin"/>Calculando movimentações...</div>:
        evolucao.length?<div className="mt-4 h-[320px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={evolucao} margin={{top:8,right:12,left:5,bottom:5}}>
              <CartesianGrid strokeDasharray="3 5" stroke="#e9edf5"/>
              <XAxis dataKey="label" tick={{fontSize:10,fill:'#64748b'}} interval="preserveStartEnd" minTickGap={24}/>
              <YAxis yAxisId="mov" tick={{fontSize:10,fill:'#64748b'}} tickFormatter={numero}/>
              <YAxis yAxisId="saldo" orientation="right" tick={{fontSize:10,fill:'#64748b'}} tickFormatter={numero}/>
              <Tooltip content={<TooltipKardex/>}/>
              <Legend wrapperStyle={{fontSize:11}}/>
              <Bar yAxisId="mov" dataKey="entradas" name="Armazenagens" fill="#8b5cf6" maxBarSize={28} radius={[3,3,0,0]}/>
              <Bar yAxisId="mov" dataKey="saidas" name="Retiradas" fill="#f59e0b" maxBarSize={28} radius={[3,3,0,0]}/>
              <Line yAxisId="saldo" dataKey="saldo" name="Saldo WMS" stroke="#0f766e" strokeWidth={2.7} dot={evolucao.length<=14}/>
            </ComposedChart>
          </ResponsiveContainer>
        </div>:<p className="py-20 text-center text-xs text-slate-500">Sem períodos para os filtros selecionados.</p>}
        <p className="mt-2 text-[11px] text-slate-500">O saldo considera também os estornos. Na exportação Excel você encontra as quantidades e o saldo exato por período.</p>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between"><h2 className="font-black text-slate-900">Saídas por canal</h2><Layers3 className="text-violet-700" size={18}/></div>
        <p className="mt-1 text-xs text-slate-500">Destino informado nas retiradas do WMS no período.</p>
        <div className="mt-5 space-y-3">
          {(dados?.canais||[]).map(x=><div key={x.canal}>
            <div className="mb-1 flex items-center justify-between gap-2 text-xs">
              <span className="font-bold text-slate-700">{x.canal}</span>
              <span className="tabular-nums text-slate-500">{numero(x.quantidade)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-violet-600" style={{width:(totalSaidas>0?100*Number(x.quantidade)/totalSaidas:0)+'%'}}/>
            </div>
          </div>)}
          {(!dados?.canais?.length)&&<p className="py-12 text-center text-xs text-slate-500">Sem retiradas no período selecionado.</p>}
        </div>
      </section>
    </div>

    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5">
        <div><h2 className="font-black text-slate-900">Razão de movimentações</h2>
          <p className="mt-1 text-xs text-slate-500">{numero(resumo.movimentos)} registros no período · ordenados do mais recente ao mais antigo</p></div>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-bold text-slate-600"><Clock3 size={13}/>Data e hora de cada evento</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-600"><tr>
            {['Data / hora','Movimento','IMEI / Serial','Voucher','SKU / Modelo','Grade','Endereço físico','Canal / referência','Saldo após'].map(col=>
              <th key={col} className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold">{col}</th>)}
          </tr></thead>
          <tbody>{(dados?.movimentacoes||[]).map((x,i)=><tr key={x.tipo+'-'+x.id+'-'+i} className="border-b border-slate-100 hover:bg-violet-50/30">
            <td className="whitespace-nowrap px-3 py-3 text-slate-600">{hora(x.data)}</td>
            <td className="px-3 py-3"><span className={'inline-flex rounded-lg px-2 py-1 text-[10px] font-black '+
              (x.tipo==='ENTRADA'?'bg-emerald-50 text-emerald-700':x.tipo==='SAIDA'?'bg-rose-50 text-rose-700':'bg-amber-50 text-amber-800')}>
                {x.tipo==='ENTRADA'?'+1': '-1'} · {x.tipo==='ENTRADA'?'Entrada':x.tipo==='SAIDA'?'Saída':'Estorno'}</span>
            </td>
            <td className="whitespace-nowrap px-3 py-3 font-mono text-slate-700">{x.imei||'—'}</td>
            <td className="whitespace-nowrap px-3 py-3 font-mono font-semibold text-violet-700">{x.voucher||'—'}</td>
            <td className="max-w-[210px] px-3 py-3"><p className="font-mono font-bold">{x.sku||'—'}</p><p className="mt-1 text-[11px] text-slate-500">{[x.marca,x.modelo].filter(Boolean).join(' ')||'—'}</p></td>
            <td className="whitespace-nowrap px-3 py-3">{x.grade||'—'}</td>
            <td className="min-w-[205px] max-w-[270px] px-3 py-3 text-slate-600">{x.endereco||'—'}</td>
            <td className="px-3 py-3"><p className="font-bold">{x.canal||'—'}</p><p className="mt-1 text-[11px] text-slate-500">{x.referencia||'—'}</p></td>
            <td className="px-3 py-3 text-right font-black tabular-nums">{numero(x.saldo_apos)}</td>
          </tr>)}</tbody>
        </table>
        {!carregando&&!(dados?.movimentacoes||[]).length&&<p className="py-12 text-center text-xs text-slate-500">Nenhuma movimentação encontrada para os filtros.</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <p className="text-[11px] text-slate-500">Página {pagina} de {paginas} · 100 movimentos por página. O Excel exporta os detalhes da página atual e toda a evolução agregada.</p>
        <div className="flex gap-2">
          <button type="button" className={botao} disabled={carregando||pagina===1} onClick={()=>setPagina(v=>Math.max(1,v-1))}><ChevronLeft size={15}/>Anterior</button>
          <button type="button" className={botao} disabled={carregando||pagina>=paginas} onClick={()=>setPagina(v=>Math.min(paginas,v+1))}>Próxima<ChevronRight size={15}/></button>
        </div>
      </div>
    </section>
    <p className="text-[11px] text-slate-500">Esta tela é de consulta e não altera alocações, estoque, FIFO ou pedidos. Saldo histórico reconstruído pelos eventos gravados no WMS, sem inventar saldos anteriores à implantação.</p>
  </div>;
}
