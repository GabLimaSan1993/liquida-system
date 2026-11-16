import {useEffect,useMemo,useState} from "react";
import {Activity,Clock3,Factory,Info,Loader2,Trophy,TrendingUp} from "lucide-react";
import {
 ResponsiveContainer,LineChart,Line,BarChart,Bar,
 XAxis,YAxis,CartesianGrid,Tooltip,Legend
} from "recharts";
import {supabase} from "../../lib/supabase.js";

const ETAPAS=[
 {id:"Triagem",label:"Triagem",key:"triagem",cor:"#7c3aed"},
 {id:"Bancada de testes",label:"Bancada de testes",key:"bancada",cor:"#0891b2"},
 {id:"Reparo",label:"Reparos",key:"reparos",cor:"#e08d18"}
];
const numero=v=>Number(v||0).toLocaleString("pt-BR");
const decimal=v=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:1});
const tempo=v=>v==null?"—":Number(v)>=3600?
 (Math.floor(Number(v)/3600)+"h "+Math.round(Number(v)%3600/60)+"min"):
 (Math.round(Number(v)/60)+" min");
const numDias=(a,b)=>Math.round((Date.parse(b+"T00:00:00Z")-Date.parse(a+"T00:00:00Z"))/86400000);
const formatoData=(data,mes)=>mes?
 String(data).slice(5,7)+"/"+String(data).slice(0,4):
 String(data).slice(8,10)+"/"+String(data).slice(5,7);
const card="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
function completarSerie(registros,inicio,fim,agrupar,zeros) {
 const porData=new Map((registros||[]).map(r=>[String(r.periodo).slice(0,10),r]));
 const resultado=[];
 if(!inicio||!fim)return resultado;
 const mes=agrupar==="mes";
 let d=new Date(mes?inicio.slice(0,7)+"-01T00:00:00Z":inicio+"T00:00:00Z");
 const ultimo=new Date(mes?fim.slice(0,7)+"-01T00:00:00Z":fim+"T00:00:00Z");
 for(let i=0;i<1100&&d<=ultimo;i++){
   const dia=d.toISOString().slice(0,10);
   const x=porData.get(dia)||{};
   resultado.push({
     ...x,periodo:dia,rotulo:formatoData(dia,mes),
     ...(zeros?{triagem:Number(x.triagem||0),bancada:Number(x.bancada||0),
       reparos:Number(x.reparos||0),entradas:Number(x.entradas||0),
       saidas_qcc:Number(x.saidas_qcc||0),expedidos:Number(x.expedidos||0)}:{})
   });
   if(mes)d.setUTCMonth(d.getUTCMonth()+1);
   else d.setUTCDate(d.getUTCDate()+1);
 }
 return resultado;
}
function GraficoVazio({carregando,erro,criador}) {
 return <div className="flex min-h-52 items-center justify-center rounded-xl bg-slate-50 p-5 text-center text-xs text-slate-500">
  {carregando?<span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin"/>Consultando histórico…</span>:
   erro?<span role="alert" className="text-rose-700">{erro}</span>:criador||"Sem registros no período escolhido."}
 </div>;
}
function Titulo({Icon,eyebrow,titulo,descricao}){
 return <div className="mb-4">
  <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-700"><Icon size={14}/>{eyebrow}</p>
  <h2 className="mt-1 text-base font-black text-slate-900">{titulo}</h2>
  <p className="mt-1 text-xs leading-5 text-slate-500">{descricao}</p>
 </div>;
}
async function consultar(nome,args,signal){
 let q=supabase.rpc(nome,args);
 if(signal)q=q.abortSignal(signal);
 const {data,error}=await q;
 if(error)throw Error(error.message);
 return data;
}

export default function ComplementosProducaoLinhaBranca({
 periodo,area,departamento,tecnico,colaboradores=[],versao=0
}){
 const [colaboradorLocal,setColaboradorLocal]=useState("");
 const [base,setBase]=useState(null);
 const [filtrado,setFiltrado]=useState(null);
 const [kardex,setKardex]=useState(null);
 const [carregandoBase,setCarregandoBase]=useState(true);
 const [carregandoFiltro,setCarregandoFiltro]=useState(false);
 const [carregandoKardex,setCarregandoKardex]=useState(true);
 const [erroBase,setErroBase]=useState("");
 const [erroFiltro,setErroFiltro]=useState("");
 const [erroKardex,setErroKardex]=useState("");
 const {inicio,fim,agrupar}=periodo;
 const valido=Boolean(inicio&&fim&&fim>=inicio&&numDias(inicio,fim)<=1095);
 const efetivo=tecnico||colaboradorLocal;

 useEffect(()=>{
  if(!valido){setBase(null);setCarregandoBase(false);return;}
  const ctrl=new AbortController();
  setCarregandoBase(true);setErroBase("");
  consultar("linha_branca_produtividade_curvas_adicional",{
    p_inicio:inicio,p_fim:fim,p_area:area||null,p_departamento:departamento||null,
    p_tecnico:tecnico||null,p_agrupar:agrupar
  },ctrl.signal).then(d=>{if(!ctrl.signal.aborted)setBase(d);})
    .catch(e=>{if(!ctrl.signal.aborted){setBase(null);setErroBase(e.message);}})
    .finally(()=>{if(!ctrl.signal.aborted)setCarregandoBase(false);});
  return ()=>ctrl.abort();
 },[inicio,fim,agrupar,area,departamento,tecnico,versao,valido]);

 useEffect(()=>{
  if(!valido||!colaboradorLocal||tecnico){setFiltrado(null);setCarregandoFiltro(false);setErroFiltro("");return;}
  const ctrl=new AbortController();
  setCarregandoFiltro(true);setErroFiltro("");
  consultar("linha_branca_produtividade_curvas_adicional",{
    p_inicio:inicio,p_fim:fim,p_area:area||null,p_departamento:departamento||null,
    p_tecnico:colaboradorLocal,p_agrupar:agrupar
  },ctrl.signal).then(d=>{if(!ctrl.signal.aborted)setFiltrado(d);})
    .catch(e=>{if(!ctrl.signal.aborted){setFiltrado(null);setErroFiltro(e.message);}})
    .finally(()=>{if(!ctrl.signal.aborted)setCarregandoFiltro(false);});
  return ()=>ctrl.abort();
 },[inicio,fim,agrupar,area,departamento,colaboradorLocal,tecnico,versao,valido]);

 useEffect(()=>{
  if(!valido){setKardex(null);setCarregandoKardex(false);return;}
  const ctrl=new AbortController();
  setCarregandoKardex(true);setErroKardex("");
  consultar("linha_branca_aging_kardex_historico",{
   p_inicio:inicio,p_fim:fim,p_area:area||null,p_agrupar:agrupar
  },ctrl.signal).then(d=>{if(!ctrl.signal.aborted)setKardex(d);})
    .catch(e=>{if(!ctrl.signal.aborted){setKardex(null);setErroKardex(e.message);}})
    .finally(()=>{if(!ctrl.signal.aborted)setCarregandoKardex(false);});
  return ()=>ctrl.abort();
 },[inicio,fim,agrupar,area,versao,valido]);

 const disponiveis=useMemo(()=>[...new Set([
   ...(base?.ranking||[]).map(x=>x.tecnico),...colaboradores,
   ...(tecnico?[tecnico]:[])
 ].filter(x=>x&&x!=="Não identificado"))].sort((a,b)=>a.localeCompare(b,"pt-BR")),
 [base,colaboradores,tecnico]);
 const produtivo=tecnico?base:colaboradorLocal?filtrado:base;
 const esperando=carregandoBase||(!tecnico&&!!colaboradorLocal&&carregandoFiltro);
 const erroProd=erroBase||erroFiltro;
 const curvas=useMemo(()=>completarSerie(produtivo?.curvas,inicio,fim,agrupar,true),
  [produtivo,inicio,fim,agrupar]);
 const kardexSerie=useMemo(()=>completarSerie(kardex?.serie,inicio,fim,agrupar,true),
  [kardex,inicio,fim,agrupar]);
 const temResultados=Boolean((produtivo?.curvas||[]).length);
 const mediaGeral=produtivo?.tempos||[];
 const cobertura=kardex?.cobertura||{};
 const mostrarKardex=Boolean(kardex);
 return <div className="space-y-4">
  <section className={card}>
   <div className="flex flex-wrap items-start justify-between gap-3">
    <Titulo Icon={TrendingUp} eyebrow="Séries temporais · Liquida System"
      titulo="Curva de produção por etapa"
      descricao="Quantidade de OS distintas por etapa em cada data: triagem, bancada de testes e reparos. Vários testes da mesma OS no mesmo dia contam uma única vez por etapa."/>
    <label className="text-xs font-semibold text-slate-700">
      Colaborador
      <select value={efetivo} disabled={Boolean(tecnico)}
        onChange={e=>setColaboradorLocal(e.target.value)}
        className="mt-1 block min-w-[210px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
        <option value="">Todos os colaboradores</option>
        {disponiveis.map(p=><option value={p} key={p}>{p}</option>)}
      </select>
    </label>
   </div>
   {!valido||erroProd||esperando||!temResultados?
     <GraficoVazio carregando={esperando} erro={erroProd} criador={!valido?"Informe um período válido.":null}/>:
     <div className="h-[290px] w-full">
      <ResponsiveContainer width="100%" height="100%">
       <LineChart data={curvas} margin={{top:8,right:18,bottom:6,left:-20}}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
        <XAxis dataKey="rotulo" interval="preserveStartEnd" minTickGap={38} tick={{fontSize:10}}/>
        <YAxis allowDecimals={false} tick={{fontSize:10}}/>
        <Tooltip formatter={v=>[numero(v),"OS distintas"]}/>
        <Legend wrapperStyle={{fontSize:11}}/>
        {ETAPAS.map(e=><Line key={e.key} type="monotone" dataKey={e.key}
          name={e.label} stroke={e.cor} strokeWidth={2.5}
          dot={curvas.length<=40?{r:2.5}:false} activeDot={{r:5}}/>)}
       </LineChart>
      </ResponsiveContainer>
     </div>}
   <p className="mt-2 text-[11px] text-slate-500">
    Contagem de produtos distintos, não de tentativas. Filtros de período, categoria, departamento e colaborador do cabeçalho permanecem ativos.
   </p>
  </section>

  <section className={card}>
   <Titulo Icon={Clock3} eyebrow="Tempo operacional · Liquida System" titulo="Tempos médios e medianas por etapa"
    descricao={"Duração cronometrada dos ciclos concluídos dentro de "+inicio+" a "+fim+
      ". Reparos continuam contabilizados na produção, porém o tempo real não é aferido: o intervalo de preenchimento do formulário não representa execução física."}/>
   {!valido||erroProd||esperando?<GraficoVazio carregando={esperando} erro={erroProd}/>:
    <div className="grid gap-3 md:grid-cols-3">
      {ETAPAS.map(e=>{
       const t=mediaGeral.find(x=>x.etapa===e.id)||{};
       return <div key={e.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
        <div className="flex items-center gap-2 text-xs font-black text-slate-700">
         <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:e.cor}}/>{e.label}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
         <div><p className="text-[10px] font-bold uppercase text-slate-500">Média</p>
          <p className="mt-1 text-xl font-black text-slate-900">{e.id==="Reparo"?"Não aferido":tempo(t.media_segundos)}</p></div>
         <div><p className="text-[10px] font-bold uppercase text-slate-500">Mediana</p>
          <p className="mt-1 text-xl font-black text-slate-900">{e.id==="Reparo"?"Não aferido":tempo(t.mediana_segundos)}</p></div>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
         {e.id==="Reparo"
         ?numero(t.produtos)+" OS com reparo registrado · sem cronômetro operacional"
         :numero(t.duracoes_validas)+" execuções cronometradas · "+numero(t.produtos)+" OS"}
        </p>
       </div>;
      })}
    </div>}
  </section>

  <section className={card}>
   <Titulo Icon={Trophy} eyebrow="Classificação · liquida" titulo="Ranking de produção por colaborador e etapa"
    descricao="Classificação por quantidade de OS distintas produzidas na etapa, com desempate por registros. Sujeita aos filtros do cabeçalho; selecionar um nome na curva não altera as posições do ranking geral."/>
   {!valido||erroBase||carregandoBase?<GraficoVazio carregando={carregandoBase} erro={erroBase}/>:
    <div className="grid gap-3 xl:grid-cols-3">
      {ETAPAS.map(e=>{
       const participantes=(base?.ranking||[]).filter(x=>x.etapa===e.id);
       return <div key={e.id} className="overflow-hidden rounded-xl border border-slate-200">
        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3">
          <span className="h-2.5 w-2.5 rounded-full" style={{backgroundColor:e.cor}}/>
          <h3 className="text-xs font-black text-slate-800">{e.label}</h3>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {participantes.map((p,i)=><div key={p.tecnico+"-"+i}
            className={"grid grid-cols-[26px_1fr_60px] items-center gap-2 border-b border-slate-100 px-3 py-2.5 "+
              (p.tecnico===efetivo?"bg-violet-50":"")}>
            <span className="text-xs font-black text-slate-400">{p.posicao}º</span>
            <div className="min-w-0"><p className="truncate text-xs font-bold text-slate-800">{p.tecnico}</p>
              <p className="text-[10px] text-slate-500">{numero(p.registros)} registros</p></div>
            <div className="text-right"><strong className="text-sm text-slate-900">{numero(p.produtos)}</strong>
              <p className="text-[10px] text-slate-500">OS</p></div>
          </div>)}
          {!participantes.length&&<p className="p-4 text-xs text-slate-500">Sem colaboradores identificados.</p>}
        </div>
       </div>;
      })}
    </div>}
   <p className="mt-3 text-[11px] text-slate-500">“Não identificado” é excluído do ranking, mas permanece nos totais da produção para evidenciar lacunas de apontamento.</p>
  </section>

  <section className={card}>
   <Titulo Icon={Factory} eyebrow="Base histórica de Aging · externo"
    titulo="Kardex de entrada e saída · OS"
    descricao="Entrada pela Dt_Abert e saída operacional pela primeira aparição em QCC, com data DtUltLog. Uma OS é contabilizada uma única vez em cada evento, mesmo presente em múltiplos arquivos."/>
   {mostrarKardex&&<div className="mb-4 grid gap-3 sm:grid-cols-3">
     {[
      ["Entradas no período",kardex?.resumo?.entradas],
      ["Saídas identificadas em QCC",kardex?.resumo?.saidas_qcc],
      ["Expedido no período",kardex?.resumo?.expedidos]
     ].map(([t,v])=><div key={t} className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{t}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{numero(v)}</p>
     </div>)}
    </div>}
   {!valido||erroKardex||carregandoKardex||!mostrarKardex?
    <GraficoVazio carregando={carregandoKardex} erro={erroKardex}/>:
    <div className="h-[290px] w-full">
     <ResponsiveContainer width="100%" height="100%">
      <BarChart data={kardexSerie} margin={{top:8,right:16,bottom:5,left:-18}} barGap={2}>
       <CartesianGrid strokeDasharray="3 3" vertical={false}/>
       <XAxis dataKey="rotulo" interval="preserveStartEnd" minTickGap={38} tick={{fontSize:10}}/>
       <YAxis allowDecimals={false} tick={{fontSize:10}}/>
       <Tooltip formatter={v=>[numero(v),"OS"]}/><Legend wrapperStyle={{fontSize:11}}/>
       <Bar dataKey="entradas" name="Entrada · Dt_Abert" fill="#7c3aed" maxBarSize={24}/>
       <Bar dataKey="saidas_qcc" name="Saída · QCC (DtUltLog)" fill="#0891b2" maxBarSize={24}/>
      </BarChart>
     </ResponsiveContainer>
    </div>}
   <p className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
    <Info size={14} className="mt-0.5 shrink-0"/> QCC é um marco operacional, não confirmação fiscal de expedição. O DtUltLog pode ser anterior ao upload; estas datas refletem o histórico recebido, e não uma série completa de transições do sistema externo.
   </p>
  </section>

  <section className={card}>
   <Titulo Icon={Activity} eyebrow="Aging de produtos expedidos · histórico externo"
    titulo="Tempo médio e mediano das OS expedidas"
    descricao="Dias corridos entre Dt_Abert e DtUltLog nas OS identificadas pela etapa Expedido; ordenação pelo mês ou dia da última movimentação. Só entram registros com datas válidas."/>
   {!valido||erroKardex||carregandoKardex||!mostrarKardex?
    <GraficoVazio carregando={carregandoKardex} erro={erroKardex}/>:
    <div className="h-[290px] w-full">
     <ResponsiveContainer width="100%" height="100%">
      <LineChart data={kardexSerie} margin={{top:8,right:16,bottom:5,left:-20}}>
       <CartesianGrid strokeDasharray="3 3" vertical={false}/>
       <XAxis dataKey="rotulo" interval="preserveStartEnd" minTickGap={38} tick={{fontSize:10}}/>
       <YAxis tick={{fontSize:10}} unit="d"/>
       <Tooltip formatter={v=>[v==null?"—":decimal(v)+" dias","Aging"]}/>
       <Legend wrapperStyle={{fontSize:11}}/>
       <Line type="monotone" dataKey="aging_medio_dias" name="Aging médio (dias)"
        stroke="#7c3aed" strokeWidth={2.5} connectNulls={false}
        dot={kardexSerie.length<=40?{r:2.5}:false} activeDot={{r:5}}/>
       <Line type="monotone" dataKey="aging_mediano_dias" name="Aging mediano (dias)"
        stroke="#0891b2" strokeWidth={2.5} connectNulls={false}
        dot={kardexSerie.length<=40?{r:2.5}:false} activeDot={{r:5}}/>
      </LineChart>
     </ResponsiveContainer>
    </div>}
   <p className="mt-3 text-[11px] leading-5 text-slate-500">
     Histórico disponível: {cobertura.primeiro_upload||"—"} a {cobertura.ultimo_upload||"—"} ·
     {numero(cobertura.uploads)} arquivos · {numero(cobertura.os_unicas)} OS distintas ·
     {numero(cobertura.qcc_identificadas)} QCC · {numero(cobertura.expedidos_identificados)} Expedido.
     O histórico de Aging não contém autoria confiável por colaborador para estas etapas; por isso o filtro de colaborador não é aplicado aos dois gráficos externos. Período e categoria do cabeçalho são aplicados.
   </p>
  </section>
 </div>;
}
