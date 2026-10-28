import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, BarChart3, CalendarDays, Clock3, FileText, PackageCheck, RefreshCw, TrendingUp, Warehouse, AlertTriangle } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
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
  const [metas,setMetas]=useState(null);
  const [carteira,setCarteira]=useState(null);
  const [erro,setErro]=useState("");
  const [erroBacklog,setErroBacklog]=useState("");
  const [erroMetas,setErroMetas]=useState("");
  const [erroCarteira,setErroCarteira]=useState("");
  const [loading,setLoading]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [grupoEtapa,setGrupoEtapa]=useState("Todos");

  const carregar=useCallback(async(signal)=>{
    setLoading(true);setErro("");setErroBacklog("");setErroMetas("");setErroCarteira("");
    const params={p_inicio:filtros.inicio,p_fim:filtros.fim,p_agrupamento:filtros.agrupamento};
    const referencia=filtros.fim>hoje?hoje:filtros.fim;
    const [fat,back,meta,car]=await Promise.allSettled([
      supabase.rpc("assurant_fechamento_diario_periodo",params).abortSignal(signal),
      supabase.rpc("assurant_fechamento_diario_backlog",{p_referencia:referencia}).abortSignal(signal),
      supabase.rpc("assurant_fechamento_diario_metas",{p_inicio:filtros.inicio,p_fim:filtros.fim}).abortSignal(signal),
      supabase.rpc("assurant_fechamento_diario_carteira").abortSignal(signal)
    ]);
    if(signal.aborted)return;
    if(fat.status==="fulfilled"&&!fat.value.error){setDados(fat.value.data);}
    else{setDados(null);setErro(fat.status==="rejected"?String(fat.reason):fat.value.error?.message||"Erro ao consultar produção e faturamento.");}
    if(back.status==="fulfilled"&&!back.value.error){setBacklog(back.value.data);}
    else{setBacklog(null);setErroBacklog(back.status==="rejected"?String(back.reason):back.value.error?.message||"Backlog indisponível.");}
    if(meta.status==="fulfilled"&&!meta.value.error){setMetas(meta.value.data);}
    else{setMetas(null);setErroMetas(meta.status==="rejected"?String(meta.reason):meta.value.error?.message||"Metas indisponíveis.");}
    if(car.status==="fulfilled"&&!car.value.error){setCarteira(car.value.data);}
    else{setCarteira(null);setErroCarteira(car.status==="rejected"?String(car.reason):car.value.error?.message||"Carteira indisponível.");}
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
  const metaResumo=metas?.resumo||null;
  const metaDias=metas?.dias||[];
  const metaDiasVisiveis=metaDias.slice(-60).reverse();
  const metaChart=metaDias.slice(-40).map(r=>({...r,meta:Number(r.meta_total||550)}));
  const metaAtingimento=metaResumo&&Number(metaResumo.meta_total)>0 ? 100*Number(metaResumo.total_faturado)/Number(metaResumo.meta_total) : 0;
  const carteiraTotal=carteira?.total||null;
  const carteiraB2B=carteira?.b2b||null;
  const carteiraB2C=carteira?.b2c||null;
  const b2cPotencial=Number(carteiraB2C?.potencial_hoje||0);
  const b2bPotencial=Number(carteiraB2B?.potencial_hoje||0);
  const balizadorB2BPotencial=Math.max(0,400-Math.max(0,b2cPotencial-150));
  const potencialSuficiente=!!carteiraTotal&&Number(carteiraTotal.potencial_hoje)>=550;
  const b2cSuficiente=b2cPotencial>=150;
  const b2bSuficiente=b2bPotencial>=balizadorB2BPotencial;
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
    {erroMetas&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Meta de faturamento: {erroMetas}</div>}
    {erroCarteira&&<div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Carteira: {erroCarteira}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi titulo="Faturamento total" valor={dados?fmtBRL(totalFat):"—"} detalhe="B2B + B2C, sem duplicar pedidos" icon={TrendingUp}/>
      <Kpi titulo="Faturamento B2B" valor={dados?fmtBRL(financeiro.totais.B2B.valor):"—"} detalhe={fmtNum(financeiro.totais.B2B.documentos)+" NFs · "+fmtNum(financeiro.totais.B2B.itens)+" itens"} icon={FileText}/>
      <Kpi titulo="Faturamento B2C" valor={dados?fmtBRL(financeiro.totais.B2C.valor):"—"} detalhe={fmtNum(financeiro.totais.B2C.documentos)+" pedidos · "+fmtNum(financeiro.totais.B2C.itens)+" itens"} icon={PackageCheck}/>
      <Kpi titulo="Backlog operacional" valor={backlog?fmtNum(totalBacklog):"—"} detalhe={fmtNum(preRecebimento)+" pré-recebimento, fora do backlog físico"} icon={Warehouse} subtle/>
    </div>

    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black"><CalendarDays size={19} className="text-violet-700"/> Meta de faturamento · acordo Assurant</h2>
          <p className="mt-1 text-xs text-slate-500">Meta-base por dia: <strong>150 aparelhos B2C + 400 aparelhos B2B = 550 aparelhos faturados</strong>. Aferição em unidades, não em reais.</p>
        </div>
        <div className="rounded-xl border border-violet-100 bg-violet-50 px-4 py-2 text-xs font-black text-violet-800">
          {metaResumo?fmtNum(metaResumo.dias)+" dia(s) · meta "+fmtNum(metaResumo.meta_total)+" unidades":"Referência: 550 unidades/dia"}
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi titulo="B2C · unidades faturadas" valor={metaResumo?fmtNum(metaResumo.b2c_faturado):"—"} detalhe={metaResumo?"Meta-base "+fmtNum(metaResumo.meta_b2c)+" · "+(metaResumo.meta_b2c?Math.round(metaResumo.b2c_faturado/metaResumo.meta_b2c*100):0)+"%":"Meta 150 por dia"} icon={PackageCheck}/>
        <Kpi titulo="B2B · unidades faturadas" valor={metaResumo?fmtNum(metaResumo.b2b_faturado):"—"} detalhe={metaResumo?"Balizador ajustado "+fmtNum(metaResumo.meta_b2b_ajustada)+" · base "+fmtNum(metaResumo.meta_b2b_base):"Meta-base 400 por dia"} icon={FileText}/>
        <Kpi titulo="Total faturado · unidades" valor={metaResumo?fmtNum(metaResumo.total_faturado):"—"} detalhe={metaResumo?"Meta "+fmtNum(metaResumo.meta_total)+" · "+metaAtingimento.toFixed(1).replace(".",",")+"% de atingimento":"Meta 550 por dia"} icon={TrendingUp}/>
        <Kpi titulo="Dias com meta total atingida" valor={metaResumo?fmtNum(metaResumo.dias_meta_total_atingida)+" / "+fmtNum(metaResumo.dias):"—"} detalhe={metaResumo?fmtNum(metaResumo.dias_ambos_balizadores_atingidos)+" dia(s) com ambos os balizadores atendidos":"Apuração por dia"} icon={BarChart3} subtle/>
      </div>
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-xs font-black text-slate-800">Balizador de realocação B2B → B2C</p>
        <p className="mt-1 text-xs leading-5 text-slate-600">Para cada aparelho B2C faturado <strong>acima de 150 no mesmo dia</strong>, a exigência B2B diminui 1 unidade, limitada a zero. Exemplo: 200 B2C tornam o balizador B2B igual a 350. A meta combinada continua sendo 550 unidades. Isso representa uma referência de capacidade, não confirma movimentação real de colaboradores.</p>
        {metaResumo&&<p className="mt-2 text-xs font-bold text-violet-800">No período: {fmtNum(metaResumo.capacidade_realocada)} unidade(s) compensada(s) no balizador B2B. Meta B2B original {fmtNum(metaResumo.meta_b2b_base)} → ajustada {fmtNum(metaResumo.meta_b2b_ajustada)}.</p>}
        <p className="mt-2 text-[11px] text-slate-500">A referência é aplicada a todos os dias corridos do período selecionado, inclusive fins de semana. O dia atual é parcial; períodos históricos recebem a mesma referência, sem pressupor a data de início do acordo.</p>
      </div>
      {metas&&metaChart.length>1&&<div className="mt-5">
        <h3 className="text-sm font-black">Faturamento diário em unidades x referência total</h3>
        <p className="mt-1 text-xs text-slate-500">Últimos {fmtNum(metaChart.length)} dias do período, com limite visual de 40 datas.</p>
        <div className="mt-3 h-72 w-full"><ResponsiveContainer width="100%" height="100%">
          <BarChart data={metaChart} margin={{top:12,right:12,bottom:8,left:4}}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
            <XAxis dataKey="dia" tick={{fontSize:10}} interval="preserveStartEnd" tickFormatter={s=>s.slice(5).split("-").reverse().join("/")}/>
            <YAxis tick={{fontSize:11}} tickFormatter={fmtShort} width={52}/>
            <Tooltip labelFormatter={x=>"Dia: "+new Date(x+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})} formatter={(v,n)=>[fmtNum(v)+" aparelhos",n]}/>
            <Legend/>
            <ReferenceLine y={550} stroke="#ea580c" strokeDasharray="4 4" label={{value:"Meta 550/dia",position:"insideTopRight",fontSize:10,fill:"#c2410c"}}/>
            <Bar dataKey="b2b_faturado" name="B2B faturado" stackId="unidades" fill="#6d28d9" maxBarSize={36}/>
            <Bar dataKey="b2c_faturado" name="B2C faturado" stackId="unidades" fill="#10b981" radius={[3,3,0,0]} maxBarSize={36}/>
          </BarChart>
        </ResponsiveContainer></div>
      </div>}
      {metas?<div className="mt-5 overflow-x-auto">
        <h3 className="mb-2 text-sm font-black">Apuração e balizador por dia</h3>
        <table className="w-full min-w-[780px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500"><tr>
            <th className="px-3 py-3">Dia</th><th className="px-3 py-3 text-right">B2C / meta</th><th className="px-3 py-3 text-right">B2B / meta ajustada</th>
            <th className="px-3 py-3 text-right">Realocação</th><th className="px-3 py-3 text-right">Total / meta</th><th className="px-3 py-3">Situação</th>
          </tr></thead>
          <tbody className="divide-y divide-slate-100">{metaDiasVisiveis.map(d=>{
            const status=d.b2c_atingiu&&d.b2b_atingiu?"Acordo atendido":d.total_atingiu?"Total atingido · B2C abaixo":d.dia===hoje?"Dia em andamento":"Abaixo da meta";
            const css=d.b2c_atingiu&&d.b2b_atingiu?"bg-emerald-50 text-emerald-800":d.total_atingiu?"bg-sky-50 text-sky-800":d.dia===hoje?"bg-violet-50 text-violet-700":"bg-amber-50 text-amber-800";
            return <tr key={d.dia}>
              <td className="px-3 py-3 font-bold">{new Date(d.dia+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}</td>
              <td className="px-3 py-3 text-right font-bold">{fmtNum(d.b2c_faturado)} / {fmtNum(d.meta_b2c)}</td>
              <td className="px-3 py-3 text-right font-bold">{fmtNum(d.b2b_faturado)} / {fmtNum(d.meta_b2b_ajustada)}</td>
              <td className="px-3 py-3 text-right">{fmtNum(d.capacidade_realocada)}</td>
              <td className="px-3 py-3 text-right font-black">{fmtNum(d.total_faturado)} / {fmtNum(d.meta_total)}</td>
              <td className="px-3 py-3"><span className={"rounded-lg px-2.5 py-1 text-[11px] font-bold "+css}>{status}</span></td>
            </tr>;
          })}</tbody>
        </table>
        {metaDias.length>60&&<p className="mt-3 text-xs text-slate-500">Exibindo os 60 dias mais recentes; os totais do topo consideram todos os {fmtNum(metaDias.length)} dias selecionados.</p>}
      </div>:<div className="mt-4"><InfoEmpty texto={loading?"Calculando metas...":"Sem dados de metas disponíveis."}/></div>}
    </section>

    <section className={panel}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-black"><PackageCheck size={19} className="text-violet-700"/> Carteira de pedidos e capacidade de faturamento</h2>
          <p className="mt-1 text-xs text-slate-500">Fotografia <strong>atual</strong> dos pedidos ainda não faturados, separando os que podem avançar dos que dependem de liberação.</p>
        </div>
        <span className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] font-bold text-slate-600">
          Carteira consultada em {carteira?.atualizado_em?new Date(carteira.atualizado_em).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—"}
        </span>
      </div>
      {carteira&&<>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Kpi titulo="Carteira total B2C" valor={fmtNum(carteiraB2C?.carteira)} detalhe={fmtNum(carteiraB2C?.prontos)+" embalados · "+fmtNum(carteiraB2C?.em_preparacao)+" em preparação"} icon={PackageCheck} subtle/>
          <Kpi titulo="Carteira total B2B" valor={fmtNum(carteiraB2B?.carteira)} detalhe={fmtNum(carteiraB2B?.pedidos)+" lotes · "+fmtNum(carteiraB2B?.prontos)+" preparados"} icon={FileText} subtle/>
          <Kpi titulo="Carteira trabalhável" valor={fmtNum(carteiraTotal?.trabalhaveis)} detalhe={fmtNum(carteiraTotal?.prontos)+" prontos · "+fmtNum(Number(carteiraTotal?.trabalhaveis||0)-Number(carteiraTotal?.prontos||0))+" em preparação"} icon={Warehouse}/>
          <Kpi titulo="Dependentes de liberação" valor={fmtNum(carteiraTotal?.com_restricao)} detalhe="Definições, análises, restrições ou erro fiscal" icon={AlertTriangle} subtle/>
        </div>
        <div className={"mt-4 rounded-xl border p-4 "+(potencialSuficiente&&b2cSuficiente&&b2bSuficiente?"border-emerald-200 bg-emerald-50":"border-amber-200 bg-amber-50")}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-black text-slate-900">
                {potencialSuficiente&&b2cSuficiente&&b2bSuficiente
                  ?"Volume potencial suficiente para a meta, sujeito à execução"
                  :!potencialSuficiente
                  ?"Carteira operacional insuficiente para 550 aparelhos"
                  :"Há volume total, mas falta capacidade em um dos canais"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-700">Potencial indicativo de hoje = já faturado hoje + itens prontos + itens em preparação. Os itens com pendências ou bloqueios ficam fora do potencial.</p>
            </div>
            <span className="rounded-lg bg-white/80 px-3 py-2 text-sm font-black text-slate-900">{fmtNum(carteiraTotal?.potencial_hoje)} / 550 aparelhos</span>
          </div>
          <div className="mt-4 h-3 overflow-hidden rounded-full bg-white/80">
            <div className={"h-full rounded-full "+(potencialSuficiente?"bg-emerald-600":"bg-amber-500")} style={{width:Math.min(100,100*Number(carteiraTotal?.potencial_hoje||0)/550)+"%"}}/>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            <div className="rounded-lg bg-white/75 p-3">
              <p className="text-[11px] font-bold text-slate-500">Faturado hoje</p>
              <p className="mt-1 text-xl font-black text-slate-900">{fmtNum(carteiraTotal?.faturados_hoje)}</p>
            </div>
            <div className="rounded-lg bg-white/75 p-3">
              <p className="text-[11px] font-bold text-slate-500">Faltam para 550</p>
              <p className="mt-1 text-xl font-black text-slate-900">{fmtNum(carteiraTotal?.faltam_para_meta)}</p>
            </div>
            <div className="rounded-lg bg-white/75 p-3">
              <p className="text-[11px] font-bold text-slate-500">Potencial B2C / B2B</p>
              <p className="mt-1 text-lg font-black text-slate-900">{fmtNum(b2cPotencial)} / {fmtNum(b2bPotencial)}</p>
              <p className="mt-1 text-[11px] text-slate-600">Balizador B2B no máximo potencial B2C: {fmtNum(balizadorB2BPotencial)}</p>
            </div>
          </div>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[650px] text-left text-xs">
            <thead className="bg-slate-50 text-slate-500"><tr>
              <th className="px-3 py-3">Canal</th><th className="px-3 py-3 text-right">Carteira total</th>
              <th className="px-3 py-3 text-right">Prontos</th><th className="px-3 py-3 text-right">Em preparação</th>
              <th className="px-3 py-3 text-right">Com pendências</th><th className="px-3 py-3 text-right">Potencial hoje</th>
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {[["B2C",carteiraB2C],["B2B",carteiraB2B]].map(([canal,c])=><tr key={canal}>
                <td className="px-3 py-3 font-bold">{canal}</td>
                <td className="px-3 py-3 text-right font-black">{fmtNum(c.carteira)}</td>
                <td className="px-3 py-3 text-right">{fmtNum(c.prontos)}</td>
                <td className="px-3 py-3 text-right">{fmtNum(c.em_preparacao)}</td>
                <td className="px-3 py-3 text-right">{fmtNum(c.com_restricao)}</td>
                <td className="px-3 py-3 text-right font-black">{fmtNum(c.potencial_hoje)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-5 text-slate-500">
          <strong>Importante:</strong> possuir pedidos em carteira não significa conseguir faturá-los no mesmo dia. B2B exclui {fmtNum(carteiraB2B?.operacoes_internas_excluidas)} itens de lotes identificados como reparo/revisão/validação (não tratados como venda). No B2C, pedidos aguardando definição, alocação, validação ou análise são mostrados como pendência. O potencial é indicativo, não uma promessa de faturamento.
        </p>
        {filtros.inicio!==hoje&&<p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 font-medium text-amber-800">A carteira acima é a disponível hoje, {new Date(hoje+"T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC"})}, e não a carteira que havia no período selecionado. Para avaliar falta de pedidos em dias anteriores, serão necessários snapshots históricos da carteira.</p>}
      </>}
      {!carteira&&<div className="mt-4"><InfoEmpty texto={loading?"Consultando a carteira...":"Carteira não disponível."}/></div>}
    </section>
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
