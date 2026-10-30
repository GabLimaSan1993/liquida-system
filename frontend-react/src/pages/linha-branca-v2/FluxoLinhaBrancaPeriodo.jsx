import {useEffect,useState} from "react";
import {AlertTriangle,ArrowRight,CheckCircle2,ClipboardList,Clock3,Factory,Loader2,RefreshCw,Truck} from "lucide-react";
import {buscarFluxoLinhaBranca} from "../../services/mapaDepartamentosLinhaBrancaService.js";

const n=v=>Number(v||0).toLocaleString("pt-BR");
const quando=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}):"—";
function Indicador({titulo,valor,descricao,Icon,principal=false}){
 return <div className={"rounded-xl border px-4 py-3 "+(principal?"border-violet-200 bg-violet-50":"border-slate-200 bg-white")}>
  <div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black uppercase tracking-wide text-slate-500">{titulo}</div>
   <Icon className="h-4 w-4 text-violet-600"/></div>
  <div className="mt-2 text-2xl font-black tabular-nums text-slate-900">{n(valor)}</div>
  <p className="mt-1 text-[11px] leading-4 text-slate-500">{descricao}</p>
 </div>;
}
export default function FluxoLinhaBrancaPeriodo({periodo,area,departamento,tecnico}){
 const [dados,setDados]=useState(null),[erro,setErro]=useState("");
 const [carregando,setCarregando]=useState(true),[atualizar,setAtualizar]=useState(0);
 const valido=Boolean(periodo?.inicio&&periodo?.fim&&periodo.inicio<=periodo.fim);
 useEffect(()=>{
  if(!valido){setDados(null);setCarregando(false);return}
  const ctrl=new AbortController();setErro("");setCarregando(true);
  buscarFluxoLinhaBranca({
   inicio:periodo.inicio,fim:periodo.fim,area,departamento,signal:ctrl.signal,
  }).then(x=>{if(!ctrl.signal.aborted)setDados(x)})
    .catch(e=>{if(!ctrl.signal.aborted)setErro(e.message||"Erro ao carregar fluxo operacional")})
    .finally(()=>{if(!ctrl.signal.aborted)setCarregando(false)});
  return ()=>ctrl.abort();
 },[valido,periodo?.inicio,periodo?.fim,area,departamento,atualizar]);
 const r=dados?.resumo||{},setores=dados?.departamentos||[];
 const concluida=Number(r.finalizadas_registradas||0),confirmada=Number(r.finalizadas_trilha_completa||0);
 const semRegistro=Number(r.sem_historico_inicio||0);
 const osNovas=Number(r.os_recebidas_periodo||0);
 const osNovasTrabalhadas=Number(r.os_recebidas_e_movimentadas||0);
 return <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/30 p-4 shadow-sm sm:p-5">
  <div className="flex flex-wrap items-start justify-between gap-3">
   <div><p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Conciliação operacional do período</p>
    <h2 className="mt-1 text-lg font-black text-slate-900">De onde vieram as máquinas e para onde foram?</h2>
    <p className="mt-1 text-xs leading-5 text-slate-600">
     Entrada na operação é diferente de início de uma etapa. Transferir uma OS para outro setor não significa concluir a máquina inteira.
    </p>
   </div>
   <button type="button" disabled={carregando} onClick={()=>setAtualizar(x=>x+1)}
    className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50">
    <RefreshCw className={"h-4 w-4 "+(carregando?"animate-spin":"")}/>Atualizar fluxo
   </button>
  </div>
  {erro&&<p className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700" role="alert">{erro}</p>}
  {!dados&&carregando?<div className="flex items-center justify-center gap-2 p-6 text-xs text-violet-700"><Loader2 className="h-4 w-4 animate-spin"/>Conciliando etapas...</div>:null}
  {dados&&<>
   <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <Indicador titulo="Recebidas no período" valor={osNovas} descricao="Data de entrada da OS dentro do intervalo" Icon={Truck}/>
    <Indicador titulo="Recebidas e trabalhadas" valor={osNovasTrabalhadas} descricao="Das recebidas, têm atividade ou movimentação registrada" Icon={ClipboardList}/>
    <Indicador titulo="OS anteriores trabalhadas" valor={r.os_anteriores_e_movimentadas} descricao="Entrada anterior ao período, mas com movimentação ou produção nele" Icon={Clock3} principal/>
    <Indicador titulo="OS distintas movimentadas" valor={r.os_movimentadas} descricao="Máquinas únicas com atividade ou troca de etapa" Icon={Factory}/>
   </div>
   <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
    <Indicador titulo="Liberadas tecnicamente" valor={r.liberacoes_tecnicas} descricao="Entraram em status Aprovado; ainda podem seguir a limpeza e qualidade" Icon={CheckCircle2}/>
    <Indicador titulo="Finalizadas no período" valor={concluida} descricao="Transição registrada para status Finalizado" Icon={CheckCircle2} principal/>
    <Indicador titulo="Ponta a ponta comprovada" valor={confirmada} descricao="Finalização com histórico de triagem, higienização e qualidade" Icon={CheckCircle2}/>
    <Indicador titulo="Finalizadas sem trilha completa" valor={r.finalizadas_sem_trilha_completa} descricao="Status final registrado, sem comprovação de todas as etapas" Icon={AlertTriangle}/>
   </div>
   <div className="rounded-xl border border-slate-200 bg-white p-3">
    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700">
     <span>Das <strong>{n(osNovas)}</strong> OS recebidas,</span>
     <span className="rounded-full bg-emerald-50 px-2 py-1 font-black text-emerald-700">{n(osNovasTrabalhadas)} tiveram movimentação ou atividade</span>
     <span>e</span>
     <span className="rounded-full bg-amber-50 px-2 py-1 font-black text-amber-700">{n(Math.max(0,osNovas-osNovasTrabalhadas))} ainda não têm registro de atividade no período</span>
    </div>
   </div>
   <div className="space-y-2">
    <div><h3 className="text-sm font-black text-slate-900">Movimentação por departamento</h3>
     <p className="mt-1 text-xs text-slate-500">
      Entradas e saídas são <strong>passagens efetivas de uma etapa para outra</strong>. A mesma OS pode transitar por mais de um departamento.
     </p>
    </div>
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
     <table className="w-full min-w-[1050px] whitespace-nowrap text-left text-xs">
      <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-500">
       <tr>{["Departamento","Saldo inicial rastreado","Entraram no setor","OS novas","OS anteriores","Saíram do setor","Saldo final rastreado"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}</tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
       {setores.map(s=><tr key={s.departamento} className="hover:bg-violet-50/50">
        <td className="px-3 py-3 font-bold text-violet-700">{s.departamento}</td>
        <td className="px-3 py-3 tabular-nums">{n(s.saldo_inicial_rastreado)}</td>
        <td className="px-3 py-3 font-black tabular-nums text-blue-700">{n(s.entradas_etapa)}</td>
        <td className="px-3 py-3 tabular-nums">{n(s.entradas_novas)}</td>
        <td className="px-3 py-3 tabular-nums">{n(s.entradas_antigas)}</td>
        <td className="px-3 py-3 font-black tabular-nums text-emerald-700">{n(s.saidas_etapa)}</td>
        <td className="px-3 py-3 tabular-nums">{n(s.saldo_final_rastreado)}</td>
       </tr>)}
       {!setores.length&&<tr><td colSpan={7} className="px-3 py-8 text-center text-xs text-slate-500">Nenhuma transição registrada no período.</td></tr>}
      </tbody>
     </table>
    </div>
    <p className="text-[11px] leading-5 text-slate-600">
     <strong>Saldo rastreado:</strong> quantidade com posição reconstruível por histórico de status. Não representa todo o estoque do setor.
     O saldo pode não reconciliar com entradas e saídas quando faltam movimentações antigas ou quando a data de entrada é apenas diária, sem horário.
    </p>
   </div>
   {semRegistro>0&&<div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700"/>
    <p className="text-[11px] leading-5 text-amber-900">
     <strong>Histórico incompleto:</strong> {n(semRegistro)} OSs com entrada anterior ao período não permitem identificar o setor de abertura a partir das transições registradas.
     Não as distribuí artificialmente nos saldos. Para conhecer a <strong>posição atual completa</strong>, utilize o mapa de departamentos.
    </p>
   </div>}
   {tecnico&&<p className="rounded-lg bg-slate-100 p-3 text-[11px] text-slate-600">
    O fluxo acima considera toda a operação da categoria/setor selecionado. O filtro por colaborador afeta os indicadores de produção abaixo,
    mas não os saldos físicos, porque uma máquina pode passar por vários técnicos.
   </p>}
   {dados?.conclusoes?.length>0&&<details className="rounded-xl border border-slate-200 bg-white p-3">
    <summary className="cursor-pointer text-xs font-black text-violet-700">Ver OSs com transição para Finalizado ({dados.conclusoes.length})</summary>
    <div className="mt-3 max-h-60 overflow-auto"><table className="w-full min-w-[530px] text-left text-xs">
     <thead className="bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["OS","Data entrada","Finalização","Trilha"].map(x=><th key={x} className="p-2">{x}</th>)}</tr></thead>
     <tbody className="divide-y divide-slate-100">{dados.conclusoes.map((o,i)=><tr key={o.os_id+"-"+i}>
      <td className="p-2 font-bold">{o.numero_os}</td><td className="p-2">{o.dt_entrada||"—"}</td>
      <td className="p-2">{quando(o.finalizado_em)}</td><td className="p-2">{o.trilha_completa?"Completa":"Não comprovada"}</td>
     </tr>)}</tbody>
    </table></div>
   </details>}
   <p className="text-[11px] text-slate-500">Critérios: a data de entrada vem do cadastro da OS; as transferências vêm do histórico do Liquida; o status Finalizado é diferente de Aprovado. Consultado em {quando(dados.atualizado_em)}.</p>
  </>}
 </section>;
}
