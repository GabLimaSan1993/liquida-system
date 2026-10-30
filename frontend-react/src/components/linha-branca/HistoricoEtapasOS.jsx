import {useMemo} from "react";
import {Clock3,ClipboardList,Package,UserRound,AlertTriangle} from "lucide-react";

const dataHora=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}):"Não mensurado";
function tempo(sec){
 if(sec===null||sec===undefined||!Number.isFinite(Number(sec)))return "Não mensurado";
 const s=Math.max(0,Number(sec)),dias=Math.floor(s/86400),horas=Math.floor(s%86400/3600),minutos=Math.floor(s%3600/60);
 if(dias)return dias+"d "+horas+"h "+minutos+"min";
 if(horas)return horas+"h "+minutos+"min";
 return minutos+"min";
}
const cx="rounded-xl border border-slate-200 bg-white p-3.5";
const texto="text-[11px] text-slate-500";
function TecnicoEtapa({item,detalhe}){
 if(item.responsavel)return <span className="font-bold text-slate-800">{item.responsavel}<span className="ml-1 text-[10px] font-normal text-slate-400">(histórico)</span></span>;
 const inicio=new Date(item.iniciou_em).getTime(),fim=item.terminou_em?new Date(item.terminou_em).getTime():Date.now();
 const tecnicoCiclo=(detalhe.ciclos||[])
  .filter(c=>c.operador&&c.iniciado_em&&new Date(c.iniciado_em).getTime()>=inicio&&new Date(c.iniciado_em).getTime()<=fim)
  .map(c=>c.operador);
 const tecnicoReparo=(detalhe.reparos||[])
  .filter(r=>r.tecnico&&(r.dt_inicio||r.dt_fim)&&new Date(r.dt_inicio||r.dt_fim).getTime()>=inicio&&new Date(r.dt_inicio||r.dt_fim).getTime()<=fim)
  .map(r=>r.tecnico);
 const nomes=[...new Set([...tecnicoCiclo,...tecnicoReparo])];
 return nomes.length?<span className="font-bold text-slate-800">{nomes.join(", ")}<span className="ml-1 text-[10px] font-normal text-slate-400">(atividade registrada na etapa)</span></span>
  :<span className="font-semibold text-amber-700">Não identificado</span>;
}
export default function HistoricoEtapasOS({detalhe}){
 const etapas=detalhe?.tempos_por_etapa||[];
 const requisicoes=detalhe?.pecas_requisitadas||[];
 const consumos=detalhe?.pecas_consumidas||[];
 const necessidades=detalhe?.necessidades_compra||[];
 const reparos=detalhe?.reparos||[];
 const grupos=useMemo(()=>{
  const mapa=new Map();
  for(const item of etapas){
   const nome=item.departamento||"Etapa não identificada";
   const atual=mapa.get(nome)||{nome,qtd:0,medidos:0,tempo:0,semMedida:0};
   atual.qtd++;
   if(item.duracao_segundos!==null&&item.duracao_segundos!==undefined){atual.medidos++;atual.tempo+=Number(item.duracao_segundos)||0}
   else atual.semMedida++;
   mapa.set(nome,atual);
  }
  return [...mapa.values()];
 },[etapas]);
 const totalMedido=grupos.reduce((s,x)=>s+x.tempo,0);
 const marcacoesPeca=reparos.filter(r=>r.peca_trocada);
 return <div className="space-y-5">
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
   <div className="flex items-start gap-2">
    <Clock3 className="mt-0.5 h-4 w-4 text-violet-600"/>
    <div><h3 className="text-sm font-black text-slate-900">Tempo de permanência por etapa</h3>
     <p className="mt-1 text-xs text-slate-500">Cronologia a partir das transições registradas no Liquida. Tempo na etapa não significa tempo ocioso; ciclo e reparo aparecem nos registros abaixo.</p>
    </div>
   </div>
   {etapas.length?<>
    <div className="mt-4 grid gap-2 sm:grid-cols-2">
     <div className="rounded-xl bg-violet-50 p-3"><p className="text-[10px] font-bold uppercase text-violet-600">Permanência total mensurável</p>
      <p className="mt-1 text-xl font-black text-slate-900">{tempo(totalMedido)}</p></div>
     <div className="rounded-xl bg-slate-50 p-3"><p className="text-[10px] font-bold uppercase text-slate-500">Transições registradas</p>
      <p className="mt-1 text-xl font-black">{etapas.length}</p></div>
    </div>
    <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-xs">
     <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500"><tr>
      {["Departamento / etapa","Passagens","Tempo mensurado","Sem medição"].map(x=><th key={x} className="px-3 py-2">{x}</th>)}
     </tr></thead>
     <tbody className="divide-y divide-slate-100">{grupos.map(g=><tr key={g.nome}>
      <td className="px-3 py-2 font-bold">{g.nome}</td>
      <td className="px-3 py-2">{g.qtd}</td>
      <td className="px-3 py-2 font-bold text-violet-700">{g.medidos?tempo(g.tempo):"Não mensurado"}</td>
      <td className="px-3 py-2">{g.semMedida}</td>
     </tr>)}</tbody>
    </table></div>
    <div className="mt-4 space-y-2">{etapas.map((item,i)=><div key={item.id||i} className="relative rounded-xl border border-slate-200 bg-slate-50 p-3">
     <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-xs font-black text-slate-800">{i+1}. {item.departamento}</span>
      <span className={"rounded-lg px-2.5 py-1 text-xs font-black "+(item.medicao==="em_andamento"?"bg-blue-50 text-blue-700":"bg-white text-violet-700")}>
       {tempo(item.duracao_segundos)}{item.medicao==="em_andamento"?" · em andamento":""}
      </span></div>
     <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <p className={texto}>Entrada: <strong className="text-slate-700">{dataHora(item.iniciou_em)}</strong></p>
      <p className={texto}>{item.medicao==="em_andamento"?"Até agora":"Saída"}: <strong className="text-slate-700">{item.medicao==="em_andamento"?"Em andamento":dataHora(item.terminou_em)}</strong></p>
     </div>
     <div className="mt-2 flex items-start gap-2 text-xs"><UserRound className="mt-0.5 h-3.5 w-3.5 text-slate-400"/><TécnicoEtapa item={item} detalhe={detalhe}/></div>
     {item.observacao&&<p className="mt-2 text-xs text-slate-600">{item.observacao}</p>}
    </div>)}</div>
   </>:<p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Não existem transições suficientes para mensurar o tempo por etapa desta OS. Os testes e reparos disponíveis continuam listados nas seções seguintes.</p>}
   <p className="mt-3 text-[11px] leading-5 text-amber-700">
    <AlertTriangle className="mr-1 inline h-3.5 w-3.5"/>
    O período anterior à primeira movimentação registrada não possui horário inicial confiável. Não será atribuído tempo fictício. Etapas em andamento são calculadas até o momento da consulta.
   </p>
  </section>
  <section className="rounded-2xl border border-slate-200 bg-white p-4">
   <div className="flex items-start gap-2"><Package className="mt-0.5 h-4 w-4 text-violet-600"/>
    <div><h3 className="text-sm font-black">Peças vinculadas à OS · status operacional</h3>
     <p className="mt-1 text-xs text-slate-500">Solicitações, necessidades de compra e utilização — sem valores. Custos terão gestão própria posteriormente.</p>
    </div>
   </div>
   <div className="mt-3 grid grid-cols-3 gap-2">
    {[["Requisitadas",requisicoes.length],["Consumos",consumos.length],["Compras pendentes",necessidades.length]].map(([n,v])=>
      <div key={n} className="rounded-lg bg-slate-50 p-3 text-center"><div className="text-lg font-black">{v}</div><div className="text-[10px] text-slate-500">{n}</div></div>)}
   </div>
   {requisicoes.map(p=><div key={"req-"+p.id} className={cx+" mt-2"}>
    <div className="text-xs font-bold">{p.pn||"PN não informado"} · {p.descricao||"Peça"}</div>
    <p className="mt-1 text-xs text-slate-600">{p.quantidade} unidade(s) · {p.status||"Status não identificado"} · Solicitado por {p.solicitado_por||"não informado"}</p>
   </div>)}
   {consumos.map(p=><div key={"cons-"+p.id} className={cx+" mt-2"}>
    <div className="text-xs font-bold">{p.pn||"PN não informado"} · {p.descricao||"Peça utilizada"}</div>
    <p className="mt-1 text-xs text-slate-600">{p.quantidade} unidade(s) · Técnico: {p.tecnico||"Não identificado"} · {dataHora(p.utilizado_em)}</p>
   </div>)}
   {necessidades.map(p=><div key={"comp-"+p.id} className={cx+" mt-2"}>
    <div className="text-xs font-bold">Necessidade de compra: {p.pn||"Sem PN"} · {p.descricao||"Peça"}</div>
    <p className="mt-1 text-xs text-slate-600">{p.quantidade} unidade(s) · {p.status||"Sem status"}</p>
   </div>)}
   {marcacoesPeca.length>0&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-800">
    {marcacoesPeca.length} execução(ões) de reparo informaram troca de peça{consumos.length===0?", mas ainda não há baixa de consumo registrada nesta OS.":". Confirme se os consumos já foram registrados no estoque."}
   </p>}
   {!requisicoes.length&&!consumos.length&&!necessidades.length&&!marcacoesPeca.length&&
     <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-500">Nenhuma solicitação ou utilização de peça consta registrada para esta OS.</p>}
  </section>
 </div>;
}
