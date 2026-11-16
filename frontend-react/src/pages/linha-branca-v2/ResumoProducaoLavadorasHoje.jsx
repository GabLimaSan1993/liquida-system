import {useEffect,useMemo,useState} from "react";
import {CheckCircle2,RefreshCw} from "lucide-react";
import {supabase} from "../../lib/supabase.js";

const dataSP=()=>{
 const parts=new Intl.DateTimeFormat("en-US",{
  timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"
 }).formatToParts(new Date());
 const val=k=>parts.find(x=>x.type===k)?.value||"";
 return [val("year"),val("month"),val("day")].join("-");
};
const n=v=>Number(v||0).toLocaleString("pt-BR");

export default function ResumoProducaoLavadorasHoje({
  categoria="triagem",dia,tecnico="",versao=0,compacto=false
}){
 const hoje=dia||dataSP();
 const [data,setData]=useState(null),[erro,setErro]=useState("");
 const [carregando,setCarregando]=useState(true);
 const [refrescar,setRefrescar]=useState(0);

 useEffect(()=>{
  let ativo=true;
  async function carregar(){
   setCarregando(true);setErro("");
   try {
    const {data:resp,error}=await supabase.rpc("linha_branca_resumo_diario_lavadoras",{p_dia:hoje});
    if(error)throw error;
    if(ativo)setData(resp);
   }catch(e){if(ativo){setData(null);setErro(e.message||"Consulta indisponível");}}
   finally{if(ativo)setCarregando(false);}
  }
  carregar();
  const timer=window.setInterval(carregar,60000);
  return()=>{ativo=false;window.clearInterval(timer);};
 },[hoje,versao,refrescar]);

 const pessoas=useMemo(()=>data?.por_colaborador||[],[data]);
 const agregado=(etapa,campo)=>{
  if(!tecnico)return Number(campo==="liberadas"?(data?.bancada?.liberadas||0):
      campo==="concluidos"?(data?.reparos?.concluidos||0):
      data?.triagem?.[campo]||0);
  return pessoas.filter(x=>x.tecnico===tecnico&&x.etapa===etapa)
      .reduce((acc,x)=>acc+Number(x[campo==="liberadas"?"entregues":campo==="concluidos"?"entregues":campo]||0),0);
 };
 const metricas=categoria==="triagem"?[
   ["Triagens trabalhadas",tecnico?agregado("Triagem","os_trabalhadas"):data?.triagem?.trabalhadas],
   ["Etapas entregues",agregado("Triagem","entregues")],
   ["Encaminhadas para Reparo",agregado("Triagem","para_reparo")],
   ["Aprovadas sem Reparo",agregado("Triagem","aprovadas_sem_reparo")],
   ["Aguardando 2º ciclo",tecnico?agregado("Triagem","pendentes"):data?.triagem?.aguardando_segundo_ciclo],
 ]:categoria==="bancada"?[
   ["Testes finalizados",tecnico?agregado("Bancada de testes","execucoes"):data?.bancada?.testes_finalizados],
   ["Liberadas à Higienização",agregado("Bancada - liberações","liberadas")],
   ["Aguardando decisão",tecnico?agregado("Bancada de testes","pendentes"):data?.bancada?.aguardando_decisao],
   ["Cancelados fora da produção",data?.bancada?.testes_cancelados_excluidos],
 ]:[
   ["Triagens entregues",agregado("Triagem","entregues")],
   ["Reparos concluídos",agregado("Reparo","concluidos")],
   ["Liberadas pela Bancada",agregado("Bancada - liberações","liberadas")],
   ["Testes aguardando decisão",tecnico?agregado("Bancada de testes","pendentes"):data?.bancada?.aguardando_decisao],
 ];
 return <section className="rounded-2xl border border-violet-100 bg-violet-50/40 p-4">
  <div className="flex flex-wrap items-center justify-between gap-2">
   <div>
    <h2 className="text-sm font-black text-slate-900">Produção comprovada · {hoje.slice(8,10)}/{hoje.slice(5,7)}/{hoje.slice(0,4)}</h2>
    <p className="mt-1 text-[11px] text-slate-600">{tecnico?"Colaborador: "+tecnico:"Toda a operação"} · OS únicas por etapa · sem duplicar diagnósticos ou testes cancelados</p>
   </div>
   <button type="button" onClick={()=>setRefrescar(v=>v+1)} disabled={carregando}
    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-800 disabled:opacity-50">
    <RefreshCw size={14} className={carregando?"animate-spin":""}/> Atualizar
   </button>
  </div>
  {erro?<p className="mt-3 rounded-lg bg-rose-50 p-2 text-xs text-rose-700" role="alert">{erro}</p>:
  <div className={"mt-3 grid gap-2 "+(compacto?"grid-cols-2 lg:grid-cols-4":"grid-cols-2 lg:grid-cols-5")}>
   {metricas.map(([titulo,v])=><div key={titulo} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
    <div className="flex items-center gap-2"><CheckCircle2 size={13} className="text-violet-600"/>
      <span className="text-[10px] font-semibold text-slate-500">{titulo}</span></div>
    <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{carregando&&!data?"…":n(v)}</p>
   </div>)}
  </div>}
  {categoria==="triagem"&&<p className="mt-3 text-[11px] text-slate-600">
    Entregas de Triagem = encaminhamentos para Reparo + aprovações após dois ciclos.
    Aprovação não significa que todas as OS passaram sem defeito.
  </p>}
  {categoria==="bancada"&&<p className="mt-3 text-[11px] text-slate-600">
    Teste finalizado não significa liberação. A liberação conta na data da decisão, mesmo se o ciclo foi executado anteriormente.
  </p>}
  {categoria==="geral"&&!!pessoas.length&&!compacto&&<details className="mt-3 rounded-lg border border-violet-100 bg-white p-3">
    <summary className="cursor-pointer text-xs font-bold text-violet-800">Conferir por colaborador e etapa</summary>
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[660px] text-left text-xs">
      <thead><tr>{["Colaborador","Etapa","OS trabalhadas","Entregues","Pendentes","Execuções"].map(x=>
       <th key={x} className="border-b p-2">{x}</th>)}</tr></thead>
      <tbody>{pessoas.map((x,i)=><tr key={i} className="border-b last:border-0">
       <td className="p-2 font-semibold">{x.tecnico}</td><td className="p-2">{x.etapa}</td>
       {[x.os_trabalhadas,x.entregues,x.pendentes,x.execucoes].map((v,j)=>
        <td key={j} className="p-2 tabular-nums">{n(v)}</td>)}
      </tr>)}</tbody>
    </table></div>
  </details>}
 </section>;
}
