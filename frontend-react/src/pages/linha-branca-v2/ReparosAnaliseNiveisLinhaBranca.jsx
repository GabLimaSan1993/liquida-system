import {useEffect,useState} from "react";
import {ArrowLeft,ChevronRight,Loader2,RefreshCw,Wrench} from "lucide-react";
import {buscarReparosDrilldownLinhaBranca} from "../../services/mapaDepartamentosLinhaBrancaService.js";

const niveis=["N1","N2","N3","Sem nível"];
const tipos=["Mecânico","Elétrico","Estético","Outros"];
const estilos={N1:"border-emerald-200 bg-emerald-50 text-emerald-800",N2:"border-amber-200 bg-amber-50 text-amber-800",N3:"border-rose-200 bg-rose-50 text-rose-800","Sem nível":"border-slate-200 bg-slate-50 text-slate-700"};
const num=n=>Number(n||0).toLocaleString("pt-BR");
const hora=d=>d?new Date(d).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}):"—";

export default function ReparosAnaliseNiveisLinhaBranca({periodo,area="",tecnico="",onVoltar}){
 const [selecao,setSelecao]=useState(null);
 const [resumo,setResumo]=useState(null),[detalhe,setDetalhe]=useState(null);
 const [erro,setErro]=useState(""),[carregando,setCarregando]=useState(true),[revisao,setRevisao]=useState(0);
 useEffect(()=>{setSelecao(null);setDetalhe(null)},[periodo.inicio,periodo.fim,area,tecnico]);
 useEffect(()=>{
  const ctrl=new AbortController();setCarregando(true);setErro("");
  buscarReparosDrilldownLinhaBranca({inicio:periodo.inicio,fim:periodo.fim,area,tecnico,signal:ctrl.signal})
   .then(x=>{if(!ctrl.signal.aborted)setResumo(x)})
   .catch(e=>{if(!ctrl.signal.aborted)setErro(e.message)})
   .finally(()=>{if(!ctrl.signal.aborted)setCarregando(false)});
  return ()=>ctrl.abort();
 },[periodo.inicio,periodo.fim,area,tecnico,revisao]);
 useEffect(()=>{
  if(!selecao)return;
  const ctrl=new AbortController();setCarregando(true);setErro("");setDetalhe(null);
  buscarReparosDrilldownLinhaBranca({
   inicio:periodo.inicio,fim:periodo.fim,area,tecnico,nivel:selecao.nivel,tipo:selecao.tipo,signal:ctrl.signal
  }).then(x=>{if(!ctrl.signal.aborted)setDetalhe(x)})
   .catch(e=>{if(!ctrl.signal.aborted)setErro(e.message)})
   .finally(()=>{if(!ctrl.signal.aborted)setCarregando(false)});
  return ()=>ctrl.abort();
 },[selecao?.nivel,selecao?.tipo,periodo.inicio,periodo.fim,area,tecnico,revisao]);
 const sub=detalhe?.defeitos_colaboradores||[],tecnicos=detalhe?.colaboradores||[];
 const campos=new Map((resumo?.tipos_niveis||[]).map(x=>[x.nivel+"|"+x.tipo,x]));
 const cores=x=>estilos[x]||estilos["Sem nível"];
 const retornar=()=>{if(selecao){setSelecao(null);setDetalhe(null)}else onVoltar?.()};
 return <div className="space-y-5 text-slate-900">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <button type="button" onClick={retornar} className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-violet-700">
     <ArrowLeft className="h-4 w-4"/>{selecao?"Voltar aos níveis e tipos":"Voltar à produção"}
    </button>
    <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">Linha Branca · Reparo</p>
    <h2 className="mt-1 text-2xl font-black">{selecao?"Reparo "+selecao.nivel+" · "+selecao.tipo:"Níveis e tipos de reparo"}</h2>
    <p className="mt-1 text-xs text-slate-500">Reparos concluídos de {periodo.inicio} a {periodo.fim}{area?" · "+area:""}{tecnico?" · "+tecnico:""}</p>
   </div>
   <button type="button" onClick={()=>setRevisao(x=>x+1)} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold disabled:opacity-40">
    <RefreshCw className={"h-4 w-4 "+(carregando?"animate-spin":"")}/>Atualizar
   </button>
  </div>
  {erro&&<p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">{erro}</p>}
  {carregando&&<p className="flex items-center gap-2 rounded-xl bg-violet-50 p-4 text-xs font-bold text-violet-700"><Loader2 className="h-4 w-4 animate-spin"/>Carregando análises...</p>}
  {!selecao&&resumo&&<>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{niveis.map(nivel=>{
    const valor=resumo.niveis?.find(x=>x.nivel===nivel)?.reparos||0;
    return <div key={nivel} className={"rounded-xl border p-4 "+cores(nivel)}>
     <div className="text-xs font-black">{nivel}</div><div className="mt-2 text-3xl font-black tabular-nums">{num(valor)}</div>
     <p className="text-[11px]">reparos concluídos</p>
    </div>;
   })}</div>
   <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="p-4"><h3 className="text-sm font-black">Selecione nível e especialidade</h3>
     <p className="mt-1 text-xs text-slate-500">Clique em um número para abrir os defeitos/serviços por colaborador. {num(resumo.total)} reparos concluídos · {num(resumo.total_os)} OSs distintas.</p></div>
    <div className="overflow-x-auto p-3 pt-0">
     <table className="w-full min-w-[620px] border-separate border-spacing-2 text-center text-xs">
      <thead><tr><th className="text-left">Nível</th>{tipos.map(tipo=><th key={tipo}>{tipo}</th>)}</tr></thead>
      <tbody>{niveis.map(nivel=><tr key={nivel}>
       <th className="text-left"><span className={"inline-flex rounded-lg border px-2.5 py-1 font-black "+cores(nivel)}>{nivel}</span></th>
       {tipos.map(tipo=>{
        const conta=Number(campos.get(nivel+"|"+tipo)?.reparos||0);
        return <td key={tipo}><button type="button" disabled={!conta} onClick={()=>setSelecao({nivel,tipo})}
         aria-label={"Abrir reparos "+nivel+" "+tipo}
         className={"flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-xl border p-2 "+
         (conta?"border-violet-200 bg-white text-violet-700 hover:border-violet-500 hover:bg-violet-50":"border-slate-100 bg-slate-50 text-slate-400")}>
         <span className="text-xl font-black tabular-nums">{num(conta)}</span>
         <span className="inline-flex items-center gap-1 text-[10px]">{conta?"Abrir defeitos":"Sem registros"}{conta?<ChevronRight className="h-3 w-3"/>:null}</span>
        </button></td>;
       })}
      </tr>)}</tbody>
     </table>
    </div>
   </div>
   <p className="rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
    Um reparo com vários serviços conta apenas uma vez, no nível de maior complexidade do catálogo.
    Sem nível comprovado, permanece na categoria “Sem nível”. Nenhuma OS histórica é alterada.
   </p>
  </>}
  {selecao&&detalhe&&<>
   <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
    {[["Reparos concluídos",detalhe.total_selecionado],["Colaboradores",tecnicos.length],["Serviços distintos",new Set(sub.map(x=>x.defeito)).size]].map(([titulo,valor])=>
     <div key={titulo} className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-[10px] font-black uppercase text-slate-500">{titulo}</p>
      <div className="mt-2 text-2xl font-black tabular-nums">{num(valor)}</div>
     </div>)}
   </div>
   <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
    <h3 className="text-sm font-black">Reparos por colaborador</h3>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{tecnicos.map(t=><div key={t.tecnico} className="rounded-lg bg-slate-50 p-3">
     <div className="text-xs font-bold">{t.tecnico}</div><div className="mt-1 text-xl font-black text-violet-700">{num(t.reparos)}</div>
     <p className="text-[10px] text-slate-500">{num(t.os_unicas)} OSs</p>
    </div>)}</div>
   </section>
   <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="p-4"><h3 className="text-sm font-black">Defeito / serviço por colaborador</h3>
     <p className="mt-1 text-xs text-slate-500">Somente itens apontados como executados no reparo. Quando uma execução tem dois itens, são duas ocorrências de serviço, mas um reparo.</p>
    </div>
    <div className="max-h-[550px] overflow-auto"><table className="w-full min-w-[720px] text-left text-xs">
     <thead className="sticky top-0 bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr>
      {["Defeito / serviço","Colaborador","Ocorrências","Reparos","OS únicas","Origem"].map(t=><th key={t} className="p-3">{t}</th>)}
     </tr></thead><tbody className="divide-y divide-slate-100">{sub.map((t,i)=><tr key={t.tecnico+"|"+t.defeito+"|"+i}>
      <td className="p-3 font-bold">{t.defeito}</td><td className="p-3">{t.tecnico}</td>
      <td className="p-3 font-black text-violet-700">{num(t.ocorrencias)}</td>
      <td className="p-3">{num(t.reparos_distintos)}</td><td className="p-3">{num(t.os_unicas)}</td>
      <td className="p-3 text-[10px] text-slate-500">{t.origem_defeito}</td>
     </tr>)}</tbody></table></div>
   </section>
   <details className="rounded-xl border border-slate-200 bg-white p-4">
    <summary className="flex cursor-pointer items-center gap-2 text-sm font-black"><Wrench className="h-4 w-4 text-violet-700"/>Auditar OSs e reparos ({num(detalhe.total_selecionado)})</summary>
    <p className="mt-2 text-xs text-slate-500">Até 100 execuções recentes, com data, técnico, serviço e origem do nível.</p>
    <div className="mt-3 max-h-96 overflow-auto"><table className="w-full min-w-[680px] text-left text-xs">
     <thead className="sticky top-0 bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr>
      {["OS","Técnico","Serviço","Conclusão","Classificação"].map(t=><th key={t} className="p-3">{t}</th>)}
     </tr></thead><tbody className="divide-y divide-slate-100">{(detalhe.registros||[]).map(o=><tr key={o.id}>
      <td className="p-3 font-bold">{o.numero_os}</td><td className="p-3">{o.tecnico}</td>
      <td className="p-3">{o.servico_executado||"Não discriminado"}</td><td className="p-3">{hora(o.dt_fim)}</td>
      <td className="p-3 text-[10px] text-slate-500">{o.origem_nivel}</td>
     </tr>)}</tbody></table></div>
   </details>
   <p className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600">
    Relatório de reparos concluídos no Liquida System; não presume o nível pelo nome do técnico.
    A classificação considera o maior nível dos serviços da execução, preservando os apontamentos originais.
   </p>
  </>}
 </div>;
}
