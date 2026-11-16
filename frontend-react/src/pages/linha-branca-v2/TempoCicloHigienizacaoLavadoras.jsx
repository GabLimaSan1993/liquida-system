import {useEffect,useMemo,useState} from "react";
import {Activity,Clock3,Info,Loader2,AlertCircle} from "lucide-react";
import {
 ResponsiveContainer,ComposedChart,Bar,Line,XAxis,YAxis,
 CartesianGrid,Tooltip,Legend
} from "recharts";
import {supabase} from "../../lib/supabase.js";

const numero=valor=>Number(valor||0).toLocaleString("pt-BR");
const horaLegivel=segundos=>{
 if(segundos==null || !Number.isFinite(Number(segundos)))return "—";
 const total=Math.max(0,Math.round(Number(segundos)/60));
 const dias=Math.floor(total/1440);
 const horas=Math.floor((total%1440)/60);
 const minutos=total%60;
 return (dias?dias+"d ":"")+(horas?horas+"h ":"")+(minutos?minutos+"min":dias||horas?"":"0min");
};
const dataBR=valor=>{
 if(!valor)return "—";
 const d=new Date(valor);
 return Number.isNaN(d.getTime())?"—":new Intl.DateTimeFormat("pt-BR",{
  timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",
  year:"numeric",hour:"2-digit",minute:"2-digit"
 }).format(d);
};
const rotuloPeriodo=(data,mensal)=>{
 const p=String(data||"");
 return mensal?p.slice(5,7)+"/"+p.slice(0,4):p.slice(8,10)+"/"+p.slice(5,7);
};
const cartao="rounded-xl border border-slate-200 bg-slate-50/60 p-3.5";

export default function TempoCicloHigienizacaoLavadoras({periodo,versao=0}){
 const {inicio,fim,agrupar}=periodo||{};
 const [dados,setDados]=useState(null);
 const [loading,setLoading]=useState(true);
 const [erro,setErro]=useState("");
 const [mostrarTodas,setMostrarTodas]=useState(false);

 useEffect(()=>{
  if(!inicio||!fim||fim<inicio){
   setDados(null);setLoading(false);setErro("");return;
  }
  const ctrl=new AbortController();
  setLoading(true);setErro("");
  supabase.rpc("linha_branca_ciclo_ate_higienizacao",{
   p_inicio:inicio,p_fim:fim,p_agrupar:agrupar
  }).abortSignal(ctrl.signal).then(({data,error})=>{
   if(ctrl.signal.aborted)return;
   if(error)throw error;
   setDados(data);
  }).catch(err=>{
   if(!ctrl.signal.aborted){setDados(null);setErro(err.message||"Não foi possível consultar os ciclos.");}
  }).finally(()=>{
   if(!ctrl.signal.aborted)setLoading(false);
  });
  return ()=>ctrl.abort();
 },[inicio,fim,agrupar,versao]);

 const resumo=dados?.resumo||{};
 const serie=useMemo(()=>(dados?.serie||[]).map(r=>({
  ...r,rotulo:rotuloPeriodo(r.periodo,agrupar==="mes"),
  volume:Number(r.total||0),
  media_horas:r.media_horas==null?null:Number(r.media_horas),
  mediana_horas:r.mediana_horas==null?null:Number(r.mediana_horas)
 })),[dados,agrupar]);
 const ordenadas=dados?.mais_demoradas||[];
 const lista=mostrarTodas?ordenadas:ordenadas.slice(0,10);
 const faltantes=dados?.sem_marco||[];
 const temOcorrencias=Number(resumo.recebidas_higienizacao||0)>0;

 return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="mb-4">
   <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-violet-700">
    <Activity size={14}/> Ciclo operacional · Liquida System
   </p>
   <h2 className="mt-1 text-base font-black text-slate-900">Tempo de ciclo até Higienização</h2>
   <p className="mt-1 text-xs leading-5 text-slate-500">
    Da primeira entrada em Triagem à primeira chegada em Higienização. Para OS que
    entraram diretamente em Reparo, o tempo começa na entrada em Reparo.
    Inclui esperas e mede tempo corrido, não horas efetivas de mão de obra.
   </p>
  </div>
  {loading?
   <div className="flex min-h-44 items-center justify-center gap-2 text-xs text-slate-500">
    <Loader2 size={16} className="animate-spin"/> Calculando tempos de ciclo…
   </div>:
   erro?<p className="rounded-lg bg-rose-50 p-3 text-xs text-rose-700" role="alert">{erro}</p>:
   !dados?<p className="text-xs text-slate-500">Selecione um período válido no cabeçalho.</p>:
   <>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
     {[
      ["Média do ciclo",horaLegivel(resumo.media_segundos),"Somente OS com início válido"],
      ["Mediana do ciclo",horaLegivel(resumo.mediana_segundos),"Menos afetada por esperas prolongadas"],
      ["Chegaram à Higienização",numero(resumo.recebidas_higienizacao),"Independentemente do marco inicial"],
      ["Ciclos mensuráveis",numero(resumo.mensuraveis),"De "+numero(resumo.recebidas_higienizacao)+" OS"]
     ].map(([titulo,valor,detalhe])=><div key={titulo} className={cartao}>
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1.5 text-xl font-black text-slate-900">{valor}</p>
      <p className="mt-1 text-[11px] leading-4 text-slate-500">{detalhe}</p>
     </div>)}
    </div>
    <p className="mt-3 text-[11px] text-slate-500">
     Com marco de Triagem: <strong>{numero(resumo.iniciadas_triagem)}</strong> ·
     Entrada direta em Reparo: <strong>{numero(resumo.direto_reparo)}</strong> ·
     Sem marco inicial: <strong>{numero(resumo.sem_marco)}</strong>.
    </p>
    <div className="mt-5">
     <h3 className="text-sm font-black text-slate-800">Evolução do tempo de ciclo e volume concluído</h3>
     <p className="mt-1 text-[11px] text-slate-500">
      Média e mediana por dia de entrada em Higienização; barras mostram todas as lavadoras que chegaram à etapa, inclusive as sem tempo mensurável.
     </p>
    </div>
    {!temOcorrencias?
     <div className="mt-3 flex min-h-44 items-center justify-center rounded-xl bg-slate-50 text-xs text-slate-500">
      Nenhuma lavadora chegou à Higienização no período selecionado.
     </div>:
     <div className="mt-3 h-[310px] w-full">
      <ResponsiveContainer width="100%" height="100%">
       <ComposedChart data={serie} margin={{top:8,right:15,bottom:4,left:-7}}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0"/>
        <XAxis dataKey="rotulo" tick={{fontSize:10}} interval="preserveStartEnd" minTickGap={36}/>
        <YAxis yAxisId="tempo" tick={{fontSize:10}} tickFormatter={v=>v+"h"}
         width={48} domain={[0,"auto"]}/>
        <YAxis yAxisId="volume" orientation="right" tick={{fontSize:10}}
         width={30} allowDecimals={false} domain={[0,"auto"]}/>
        <Tooltip formatter={(value,name)=>{
          if(name==="Chegaram à Higienização")return [numero(value)+" OS",name];
          return [horaLegivel(Number(value)*3600),name];
        }}/>
        <Legend wrapperStyle={{fontSize:11}}/>
        <Bar yAxisId="volume" dataKey="volume" name="Chegaram à Higienização"
         fill="#c4b5fd" maxBarSize={20} radius={[3,3,0,0]}/>
        <Line yAxisId="tempo" dataKey="media_horas" name="Tempo médio"
         type="monotone" connectNulls={false}
         stroke="#7c3aed" strokeWidth={2.5} activeDot={{r:4}}
         dot={serie.length<=31?{r:2}:false}/>
        <Line yAxisId="tempo" dataKey="mediana_horas" name="Tempo mediano"
         type="monotone" connectNulls={false}
         stroke="#0891b2" strokeWidth={2.5} activeDot={{r:4}}
         dot={serie.length<=31?{r:2}:false}/>
       </ComposedChart>
      </ResponsiveContainer>
     </div>}
    <p className="mt-2 flex items-start gap-2 text-[11px] leading-5 text-slate-500">
     <Info size={14} className="mt-0.5 shrink-0"/>
     O filtro de datas e o agrupamento diário/mensal seguem o cabeçalho. Cada OS conta
     uma vez, na primeira chegada à Higienização. A origem do tempo é a Triagem ou
     a entrada direta em Reparo. Este indicador não é atribuível a um único colaborador.
    </p>

    <details className="mt-5 overflow-hidden rounded-xl border border-slate-200">
     <summary className="cursor-pointer select-none bg-slate-50 px-4 py-3 text-xs font-black text-slate-800">
      OS com maior tempo de ciclo · {ordenadas.length} registros disponíveis para conferência
     </summary>
     <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-xs">
       <thead className="border-b bg-slate-50 text-slate-600">
        <tr>{["OS","Início considerado","Fonte do início","Chegada à Higienização","Tempo","Etapa atual"].map(t=>
         <th key={t} className="px-3 py-2 font-bold">{t}</th>)}</tr>
       </thead>
       <tbody className="divide-y divide-slate-100">
        {lista.map(o=><tr key={o.numero_os} className="hover:bg-slate-50">
         <td className="px-3 py-2 font-mono font-bold text-violet-800">{o.numero_os}</td>
         <td className="px-3 py-2">{dataBR(o.data_inicio)}</td>
         <td className="px-3 py-2">{o.origem_marco}</td>
         <td className="px-3 py-2">{dataBR(o.data_fim)}</td>
         <td className="px-3 py-2 font-bold">{horaLegivel(o.segundos)}</td>
         <td className="px-3 py-2">{o.status_atual||"—"}</td>
        </tr>)}
       </tbody>
      </table>
     </div>
     {ordenadas.length>10&&<div className="border-t border-slate-100 p-3">
      <button type="button" onClick={()=>setMostrarTodas(v=>!v)}
       className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-violet-700">
       {mostrarTodas?"Exibir somente 10":"Exibir até 20 OS"}
      </button>
     </div>}
     <p className="px-3 pb-3 text-[11px] text-slate-500">Relação limitada às 20 maiores durações do período; não representa a lista completa de OS.</p>
    </details>
    {faltantes.length>0&&<details className="mt-3 overflow-hidden rounded-xl border border-slate-200">
     <summary className="flex cursor-pointer items-center gap-2 bg-slate-50 px-4 py-3 text-xs font-black text-slate-800">
      <AlertCircle size={15} className="text-amber-700"/>
      {numero(resumo.sem_marco)} OS sem marco inicial confiável
     </summary>
     <p className="px-4 pt-3 text-xs text-slate-600">
      Chegaram à Higienização, mas não foi localizado início anterior de Triagem ou de
      Reparo. Não entram nas médias e medianas.
     </p>
     <div className="overflow-x-auto p-3">
      <table className="w-full min-w-[520px] text-left text-xs">
       <thead><tr>{["OS","Chegada à Higienização","Etapa atual"].map(t=>
        <th key={t} className="px-3 py-2">{t}</th>)}</tr></thead>
       <tbody className="divide-y divide-slate-100">{faltantes.map(o=><tr key={o.numero_os}>
        <td className="px-3 py-2 font-mono font-bold text-violet-800">{o.numero_os}</td>
        <td className="px-3 py-2">{dataBR(o.data_fim)}</td>
        <td className="px-3 py-2">{o.status_atual||"—"}</td>
       </tr>)}</tbody>
      </table>
     </div>
    </details>}
   </>}
 </section>;
}
