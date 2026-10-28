import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, Clock3, FileText, PackageCheck, RefreshCw, TrendingUp, Warehouse, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../lib/supabase.js";

const STAGES = [
  { id:"recebimento", label:"Recebimento", grupo:"Esteira" },
  { id:"destrinche", label:"Destrinche", grupo:"Esteira", semCaptura:true },
  { id:"funcional", label:"Triagem funcional", grupo:"Esteira" },
  { id:"laudo", label:"Laudos", grupo:"Esteira" },
  { id:"cosmetica", label:"Triagem cosmética", grupo:"Esteira" },
  { id:"armazenagem", label:"Armazenagem", grupo:"Esteira" },
  { id:"oracle", label:"Entrada Oracle", grupo:"Esteira" },
  { id:"picking_b2b", label:"Picking B2B", grupo:"B2B" },
  { id:"embalagem_b2b", label:"Embalagem B2B", grupo:"B2B" },
  { id:"faturamento_b2b", label:"Faturamento B2B (itens)", grupo:"B2B" },
  { id:"picking_b2c", label:"Picking B2C", grupo:"B2C" },
  { id:"validacao_meli", label:"Validação MELI", grupo:"B2C" },
  { id:"embalagem_b2c", label:"Embalagem B2C", grupo:"B2C" },
  { id:"faturamento_b2c", label:"Faturamento B2C (itens)", grupo:"B2C" },
  { id:"expedicao", label:"Expedição B2C (volumes)", grupo:"B2C" },
];
const STAGE_NAMES=Object.fromEntries(STAGES.map(s=>[s.id,s.label]));
const BACKLOG_NAMES = {
  antes_recebimento:"Pré-recebimento",
  aguardando_funcional:"Aguardando funcional",
  aguardando_laudo:"Aguardando laudo",
  aguardando_cosmetica:"Aguardando cosmética",
  aguardando_armazenagem:"Aguardando armazenagem",
  aguardando_oracle:"Aguardando Oracle"
};
const fmtNum = v=>Number(v||0).toLocaleString("pt-BR");
const fmtBRL = v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtShort = v=>Number(v||0).toLocaleString("pt-BR",{notation:"compact",maximumFractionDigits:1});
const tzNow = ()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const iso = date=>date.toISOString().slice(0,10);
const utc = text=>new Date(text+"T12:00:00Z");
const offset = (text,n)=>{const d=utc(text);d.setUTCDate(d.getUTCDate()+n);return iso(d);};
function intervalo(modo,base,inicio,fim){
  if(modo==="personalizado")return {inicio,fim,agrupamento:"dia"};
  if(modo==="dia")return {inicio:base,fim:base,agrupamento:"dia"};
  if(modo==="semana"){const d=utc(base);const n=(d.getUTCDay()+6)%7;return {inicio:offset(base,-n),fim:offset(base,6-n),agrupamento:"dia"};}
  const [ano,mes]=base.split("-").map(Number);
  if(modo==="mes")return {inicio:base.slice(0,7)+"-01",fim:iso(new Date(Date.UTC(ano,mes,0))),agrupamento:"dia"};
  return {inicio:ano+"-01-01",fim:ano+"-12-31",agrupamento:"mes"};
}
function PeriodLabel({data}){return <span className="text-sm font-semibold text-slate-500">{data.inicio===data.fim?new Date(data.inicio+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"}):[data.inicio,data.fim].map(v=>new Date(v+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})).join(" a ")}</span>}
function Kpi({titulo,valor,detalhe,icon:Icon,subtle=false}){
  return <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
    <div className="flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-wider text-slate-500">{titulo}</p><span className={"rounded-xl p-2.5 "+(subtle?"bg-slate-100 text-slate-600":"bg-violet-50 text-violet-700")}><Icon size={19}/></span></div>
    <p className="mt-3 break-words text-2xl font-black tracking-tight text-slate-900 md:text-[27px]">{valor}</p>
    <p className="mt-2 text-xs text-slate-500">{detalhe}</p>
  </div>;
}
function InfoEmpty({texto}){return <div className="flex min-h-32 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-5 text-center text-sm text-slate-500">{texto}</div>;}
const inputStyle="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
const panel="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";

export default function FechamentoDiarioV2Page(){
  const hoje=useMemo(tzNow,[]);
  const [modo,setModo]=useState("dia");
  const [base,setBase]=useState(hoje);
  const [inicioCustom,setInicioCustom]=useState(offset(hoje,-6));
  const [fimCustom,setFimCustom]=useState(hoje);
  const [grupoCustom,setGrupoCustom]=useState("dia");
  const [filtros,setFiltros]=useState(()=>intervalo("dia",hoje,hoje,hoje));
  const [dados,setDados]=useState(null);
  const [backlog,setBacklog]=useState(null);
  const [erro,setErro]=useState("");
  const [erroBacklog,setErroBacklog]=useState("");
  const [loading,setLoading]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [grupoEtapa,setGrupoEtapa]=useState("Todos");

  const carregar=useCallback(async(signal)=>{
    setLoading(true);setErro("");setErroBacklog("");
    const params={p_inicio:filtros.inicio,p_fim:filtros.fim,p_agrupamento:filtros.agrupamento};
    const referencia=filtros.fim>hoje?hoje:filtros.fim;
    const [fat,back]=await Promise.allSettled([
      supabase.rpc("assurant_fechamento_diario_periodo",params).abortSignal(signal),
      supabase.rpc("assurant_fechamento_diario_backlog",{p_referencia:referencia}).abortSignal(signal)
    ]);
    if(signal.aborted)return;
    if(fat.status==="fulfilled"&&!fat.value.error){setDados(fat.value.data);}
    else{setDados(null);setErro(fat.status==="rejected"?String(fat.reason):fat.value.error?.message||"Erro ao consultar produção e faturamento.");}
    if(back.status==="fulfilled"&&!back.value.error){setBacklog(back.value.data);}
    else{setBacklog(null);setErroBacklog(back.status==="rejected"?String(back.reason):back.value.error?.message||"Backlog indisponível.");}
    setLoading(false);
  },[filtros,hoje]);
  useEffect(()=>{const controller=new AbortController();carregar(controller.signal);return ()=>controller.abort();},[carregar,refresh]);
  function aplicar(e){
    e.preventDefault();const next=intervalo(modo,base,inicioCustom,fimCustom);
    if(modo==="personalizado")next.agrupamento=grupoCustom;
    if(!next.inicio||!next.fim||next.inicio>next.fim){setErro("Informe um período válido.");return;}
    if((utc(next.fim)-utc(next.inicio))/86400000>3660){setErro("Limite de 10 anos por consulta.");return;}
    if(next.fim>hoje)next.fim=hoje;
    if(next.inicio>next.fim){setErro("O período deve começar até hoje.");return;}
    setFiltros(next);setRefresh(x=>x+1);
  }
  const financeiro=useMemo(()=>{
    const rows=dados?.faturamento||[];
    const totais={B2B:{valor:0,itens:0,documentos:0},B2C:{valor:0,itens:0,documentos:0}};
    const byPeriod=new Map();
    for(const r of rows){
      const acc=totais[r.canal];if(!acc)continue;
      acc.valor+=Number(r.valor||0);acc.itens+=Number(r.itens||0);acc.documentos+=Number(r.documentos||0);
      const item=byPeriod.get(r.periodo)||{periodo:r.periodo,B2B:0,B2C:0};
      item[r.canal]+=Number(r.valor||0);byPeriod.set(r.periodo,item);
    }
    return {totais,serie:[...byPeriod.values()].sort((a,b)=>a.periodo.localeCompare(b.periodo))};
  },[dados]);
  const producao=useMemo(()=>{
    const byStage=new Map();
    for(const r of dados?.producao||[]){
      const st=byStage.get(r.etapa)||{total:0};
      st.total+=Number(r.total||0);byStage.set(r.etapa,st);
    }
    return STAGES.filter(s=>grupoEtapa==="Todos"||s.grupo===grupoEtapa).map(s=>({...s,...(byStage.get(s.id)||{total:0}),temDados:byStage.has(s.id)}));
  },[dados,grupoEtapa]);
  const etapasBacklog=backlog?.etapas||[];
  const totalBacklog=etapasBacklog.filter(s=>s.etapa!=="antes_recebimento").reduce((n,s)=>n+Number(s.total||0),0);
  const preRecebimento=Number(etapasBacklog.find(s=>s.etapa==="antes_recebimento")?.total||0);
  const maiorBacklog=Math.max(1,...etapasBacklog.map(x=>Number(x.total||0)));
  const totalFat=financeiro.totais.B2B.valor+financeiro.totais.B2C.valor;
  const chartRows=producao.filter(x=>!x.semCaptura&&x.temDados);
  const cor="#6d28d9";

  return <div className="mx-auto max-w-[1660px] space-y-5 pb-14 text-slate-900">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[.2em] text-violet-700">Assurant · Gestão e performance</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Fechamento Diário</h1>
        <div className="mt-2 flex flex-wrap items-center gap-3"><PeriodLabel data={filtros}/><span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">Acesso restrito</span></div>
      </div>
      <button type="button" onClick={()=>setRefresh(v=>v+1)} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50"><RefreshCw size={16} className={loading?"animate-spin":""}/> Atualizar dados</button>
    </div>

    <form onSubmit={aplicar} className={panel}>
      <div className="flex flex-wrap items-center gap-2">
        {[
          ["dia","Diário"],["semana","Semanal"],["mes","Mensal"],["ano","Anual"],["personalizado","Período específico"]
        ].map(([id,label])=><button key={id} type="button" onClick={()=>setModo(id)} className={"rounded-xl px-3.5 py-2 text-xs font-black transition "+(modo===id?"bg-violet-700 text-white":"bg-slate-100 text-slate-600 hover:bg-slate-200")}>{label}</button>)}
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {modo!=="personalizado"?<label className="flex flex-col gap-1 text-xs font-bold text-slate-500">Data de referência<input type="date" max={hoje} value={base} onChange={e=>setBase(e.target.value)} className={inputStyle} required /></label>:<>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">De<input type="date" value={inicioCustom} max={hoje} onChange={e=>setInicioCustom(e.target.value)} className={inputStyle} required/></label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">Até<input type="date" value={fimCustom} max={hoje} onChange={e=>setFimCustom(e.target.value)} className={inputStyle} required/></label>
          <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">Agrupar por<select className={inputStyle} value={grupoCustom} onChange={e=>setGrupoCustom(e.target.value)}><option value="dia">Dia</option><option value="semana">Semana</option><option value="mes">Mês</option><option value="ano">Ano</option></select></label>
        </>}
        <button type="submit" className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-black text-white hover:bg-slate-800">Aplicar filtros</button>
        <p className="pb-2 text-xs text-slate-400">Horários e fechamentos em Brasília (UTC−3)</p>
      </div>
    </form>
    {loading&&<div role="status" className="rounded-xl border border-violet-100 bg-violet-50 p-3 text-xs font-semibold text-violet-700">Carregando os indicadores do período...</div>}
    {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{erro}</div>}
    {erroBacklog&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Backlog: {erroBacklog}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi titulo="Faturamento total" valor={dados?fmtBRL(totalFat):"—"} detalhe="B2B + B2C, sem duplicar pedidos" icon={TrendingUp}/>
      <Kpi titulo="Faturamento B2B" valor={dados?fmtBRL(financeiro.totais.B2B.valor):"—"} detalhe={fmtNum(financeiro.totais.B2B.documentos)+" NFs · "+fmtNum(financeiro.totais.B2B.itens)+" itens"} icon={FileText}/>
      <Kpi titulo="Faturamento B2C" valor={dados?fmtBRL(financeiro.totais.B2C.valor):"—"} detalhe={fmtNum(financeiro.totais.B2C.documentos)+" pedidos · "+fmtNum(financeiro.totais.B2C.itens)+" itens"} icon={PackageCheck}/>
      <Kpi titulo="Backlog operacional" valor={backlog?fmtNum(totalBacklog):"—"} detalhe={fmtNum(preRecebimento)+" pré-recebimento, fora do backlog físico"} icon={Warehouse} subtle/>
    </div>
    <div className="grid gap-4 xl:grid-cols-5">
      <section className={panel+" xl:col-span-3"}>
        <div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="text-base font-black">Evolução do faturamento</h2><p className="mt-1 text-xs text-slate-500">Valores faturados por data de competência operacional</p></div><BarChart3 className="text-violet-600" size={20}/></div>
        {financeiro.serie.length?<div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={financeiro.serie} margin={{left:5,right:8,bottom:6,top:10}}>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="#e2e8f0"/>
          <XAxis dataKey="periodo" tick={{fontSize:10}} interval="preserveStartEnd" tickFormatter={v=>v.slice(5).replace("-","/")}/>
          <YAxis tick={{fontSize:11}} tickFormatter={fmtShort} width={68}/>
          <Tooltip formatter={v=>fmtBRL(v)} labelFormatter={v=>"Período: "+v}/>
          <Legend/>
          <Bar dataKey="B2B" name="B2B" stackId="fat" fill="#6d28d9" maxBarSize={42}/>
          <Bar dataKey="B2C" name="B2C" stackId="fat" fill="#10b981" radius={[3,3,0,0]} maxBarSize={42}/>
        </BarChart></ResponsiveContainer></div>:<InfoEmpty texto={loading?"Carregando faturamento...":"Nenhum faturamento encontrado neste período."}/>}
      </section>
      <section className={panel+" xl:col-span-2"}>
        <h2 className="text-base font-black">Participação por canal</h2><p className="mb-5 mt-1 text-xs text-slate-500">Composição financeira do período selecionado</p>
        {["B2B","B2C"].map((c,i)=><div className="mb-6" key={c}>
          <div className="flex items-center justify-between text-sm"><span className="font-bold">{c}</span><span className="font-black">{fmtBRL(financeiro.totais[c].valor)}</span></div>
          <div className="mt-2 h-3 overflow-hidden rounded-full bg-slate-100"><div className={"h-full rounded-full "+(i===0?"bg-violet-700":"bg-emerald-500")} style={{width:(totalFat?100*financeiro.totais[c].valor/totalFat:0)+"%"}}/></div>
          <p className="mt-2 text-xs text-slate-500">{totalFat?((100*financeiro.totais[c].valor/totalFat).toFixed(1).replace(".",",")+"%"):"0%"} do faturamento</p>
        </div>)}
        <p className="rounded-xl bg-slate-50 p-3 text-xs leading-5 text-slate-500">B2B considera somente NFs sem erro. B2C consolida cada pedido uma vez, inclusive quando possui diversos aparelhos.</p>
      </section>
    </div>

    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><h2 className="flex items-center gap-2 text-base font-black"><Activity size={19} className="text-violet-700"/> Produção por estação</h2><p className="mt-1 text-xs text-slate-500">Produção total de cada estação, incluindo as revisões e os reprocessamentos registrados, sem contagem em coluna separada</p></div>
        <div className="flex flex-wrap gap-1.5">{["Todos","Esteira","B2B","B2C"].map(x=><button type="button" key={x} className={"rounded-lg px-3 py-1.5 text-xs font-bold "+(grupoEtapa===x?"bg-violet-700 text-white":"bg-slate-100 text-slate-600")} onClick={()=>setGrupoEtapa(x)}>{x}</button>)}</div>
      </div>
      {dados&&chartRows.length?<div className="mt-5 h-[320px] w-full"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows.map(x=>({nome:x.label,total:x.total}))} layout="vertical" margin={{left:5,right:15,top:5,bottom:5}}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="#e2e8f0"/>
        <YAxis dataKey="nome" type="category" width={155} tick={{fontSize:11}}/>
        <XAxis type="number" tickFormatter={fmtShort} tick={{fontSize:11}}/>
        <Tooltip formatter={fmtNum}/>
        <Legend/>
        <Bar name="Produção total" dataKey="total" fill={cor} radius={[0,4,4,0]} maxBarSize={17}/>
      </BarChart></ResponsiveContainer></div>:<div className="mt-4"><InfoEmpty texto="Sem eventos de produção para as estações selecionadas."/></div>}
      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[620px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr><th className="px-3 py-3">Estação / etapa</th><th className="px-3 py-3">Área</th><th className="px-3 py-3 text-right">Produzido</th><th className="px-3 py-3">Leitura</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{producao.map(row=><tr key={row.id}><td className="px-3 py-3 font-bold">{row.label}</td><td className="px-3 py-3 text-slate-500">{row.grupo}</td><td className="px-3 py-3 text-right font-black">{row.semCaptura?"—":fmtNum(row.total)}</td><td className="px-3 py-3 text-slate-500">{row.semCaptura?"Sem captura específica no sistema":row.temDados?"Eventos registrados":"Sem registros no período"}</td></tr>)}</tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Destrinche ainda não dispõe de captura própria na base de produção; não é exibido um zero artificial.</p>
    </section>
    <section className={panel}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="flex items-center gap-2 text-base font-black"><Clock3 size={18} className="text-violet-700"/> Backlog por etapa</h2><p className="mt-1 text-xs text-slate-500">Saldo pendente ao final de {backlog?.data_referencia||filtros.fim}, considerando todas as entradas até a data — não apenas entradas do período.</p></div>
        <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">Saldo operacional: {backlog?fmtNum(totalBacklog):"—"}</div>
      </div>
      {backlog?<div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {etapasBacklog.map((item,i)=><div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4" key={item.etapa}>
          <div className="flex justify-between gap-2"><span className="text-xs font-bold text-slate-600">{BACKLOG_NAMES[item.etapa]||item.nome}</span><span className="text-lg font-black">{fmtNum(item.total)}</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className={"h-full rounded-full "+(i===0?"bg-slate-400":"bg-violet-600")} style={{width:(Number(item.total||0)/maiorBacklog*100)+"%"}}/></div>
          {i===0&&<p className="mt-2 text-[11px] text-slate-500">Fila externa, não contabilizada no backlog físico</p>}
        </div>)}
      </div>:<div className="mt-4"><InfoEmpty texto={loading?"Calculando saldos...":"Sem informação de backlog para esta referência."}/></div>}
      <p className="mt-4 flex items-start gap-2 text-xs leading-5 text-slate-500"><AlertTriangle size={15} className="mt-0.5 shrink-0"/>Para datas anteriores a hoje, o backlog é reconstruído pelos marcos registrados nas etapas. Cancelamentos e o estágio de laudos utilizam o estado atual, de modo que os totais históricos podem sofrer revisões.</p>
    </section>
    <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-400"><p>Fontes: pedidos_b2c, b2b_nfs, produção da esteira e histórico de trade-in.</p><p>Última consulta: {dados?.atualizado_em?new Date(dados.atualizado_em).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—"}</p></div>
  </div>;
}
