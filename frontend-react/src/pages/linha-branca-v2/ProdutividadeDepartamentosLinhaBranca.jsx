import {useEffect,useMemo,useState} from "react";
import {Activity,ArrowLeft,BarChart3,CalendarDays,Clock3,Download,Loader2,RefreshCw,Search,Users,Wrench} from "lucide-react";
import {ResponsiveContainer,BarChart,Bar,XAxis,YAxis,CartesianGrid,Tooltip,Legend} from "recharts";
import {buscarProdutividadeLinhaBranca} from "../../services/mapaDepartamentosLinhaBrancaService.js";
import FluxoLinhaBrancaPeriodo from "./FluxoLinhaBrancaPeriodo.jsx";

const hojeSP=()=>{
 const parts=new Intl.DateTimeFormat("en-US",{timeZone:"America/Sao_Paulo",year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
 const get=k=>parts.find(x=>x.type===k)?.value||"";
 return get("year")+"-"+get("month")+"-"+get("day");
};
const inicioMes=d=>d.slice(0,7)+"-01";
const finalMes=mes=>{
 const [y,m]=mes.split("-").map(Number);
 return new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
};
const numerar=n=>Number(n||0).toLocaleString("pt-BR");
const horas=s=>Number(s)>0?(Number(s)/3600).toLocaleString("pt-BR",{maximumFractionDigits:1})+" h":"—";
const dateLabel=x=>String(x||"").length===10 ? x.slice(8)+"/"+x.slice(5,7) : x||"";
const cssButton="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:border-violet-300";
const areas=["","Lavadoras","Refrigeração","Climatização","Outros / Portáteis"];

function Stat({nome,valor,descricao,Icon}){
 return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
  <div className="flex items-center justify-between gap-2"><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{nome}</span><Icon className="h-4 w-4 text-violet-600"/></div>
  <div className="mt-2 text-2xl font-black tabular-nums text-slate-900">{numerar(valor)}</div>
  <p className="mt-1 text-[11px] text-slate-500">{descricao}</p>
 </div>;
}
export default function ProdutividadeDepartamentosLinhaBranca({onVoltar}){
 const dataHoje=useMemo(hojeSP,[]);
 const [modo,setModo]=useState("mes");
 const [dia,setDia]=useState(dataHoje);
 const [mes,setMes]=useState(dataHoje.slice(0,7));
 const [ano,setAno]=useState(dataHoje.slice(0,4));
 const [customInicio,setCustomInicio]=useState(inicioMes(dataHoje));
 const [customFim,setCustomFim]=useState(dataHoje);
 const [area,setArea]=useState("");
 const [departamento,setDepartamento]=useState("");
 const [tecnico,setTecnico]=useState("");
 const [versao,setVersao]=useState(0);
 const [dados,setDados]=useState(null),[erro,setErro]=useState("");
 const [carregando,setCarregando]=useState(true);
 const [opcoes,setOpcoes]=useState({departamentos:[],tecnicos:[]});
 const periodo=useMemo(()=>{
  if(modo==="dia")return {inicio:dia,fim:dia,agrupar:"dia"};
  if(modo==="ano")return {inicio:ano+"-01-01",fim:ano+"-12-31",agrupar:"mes"};
  if(modo==="personalizado")return {inicio:customInicio,fim:customFim,
   agrupar:Math.round((new Date(customFim)-new Date(customInicio))/86400000)>90?"mes":"dia"};
  return {inicio:inicioMes(mes+"-01"),fim:finalMes(mes),agrupar:"dia"};
 },[modo,dia,mes,ano,customInicio,customFim]);
 const periodoValido=Boolean(periodo.inicio&&periodo.fim&&periodo.fim>=periodo.inicio&&
  (new Date(periodo.fim)-new Date(periodo.inicio))/86400000<=1095);
 const alterarModo=v=>{setModo(v);setDepartamento("");setTecnico("")};
 const mudarArea=v=>{setArea(v);setDepartamento("");setTecnico("")};
 useEffect(()=>{
  if(!periodoValido){setErro("Informe um intervalo válido de até 3 anos.");setDados(null);setCarregando(false);return}
  const ctrl=new AbortController();
  setErro("");setCarregando(true);
  buscarProdutividadeLinhaBranca({...periodo,area,departamento,tecnico,signal:ctrl.signal})
   .then(d=>{
    if(ctrl.signal.aborted)return;
    setDados(d);
    if(!departamento&&!tecnico) setOpcoes({
      departamentos:[...new Set((d?.por_departamento||[]).map(x=>x.departamento))].sort(),
      tecnicos:[...new Set((d?.por_colaborador||[]).map(x=>x.tecnico))].sort()
    });
   })
   .catch(e=>{if(!ctrl.signal.aborted)setErro(e.message||"Falha ao consultar produção")})
   .finally(()=>{if(!ctrl.signal.aborted)setCarregando(false)});
  return ()=>ctrl.abort();
 },[periodo.inicio,periodo.fim,periodo.agrupar,periodoValido,area,departamento,tecnico,versao]);
 const geral=dados?.resumo||{};
 const setores=dados?.por_departamento||[];
 const tecnicos=dados?.por_colaborador||[];
 const evolucao=(dados?.evolucao||[]).map(x=>({...x,rotulo:periodo.agrupar==="mes"?String(x.periodo).slice(0,7):dateLabel(x.periodo)}));
 const movimentos=dados?.ultimos_registros||[];
 const gerarCsv=()=>{
  const cab=["Colaborador","Departamento","OS únicas","Atividades","Ciclos","Reparos","Diagnósticos","Movimentações","Aprovados","Reprovados"];
  const linhas=tecnicos.map(x=>[x.tecnico,x.departamento,x.os_unicas,x.atividades,x.ciclos,x.reparos,x.diagnosticos,x.movimentacoes,x.aprovados,x.reprovados]);
  const csv=[cab,...linhas].map(row=>row.map(v=>'"'+String(v??"").replaceAll('"','""')+'"').join(";")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"}));
  const a=document.createElement("a");a.href=url;a.download="linha-branca-produtividade-"+periodo.inicio+"-"+periodo.fim+".csv";
  document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
 };
 return <div className="space-y-5 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <button type="button" onClick={onVoltar} className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-violet-700"><ArrowLeft className="h-4 w-4"/>Voltar ao mapa de máquinas</button>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">Linha Branca · Gestão da produção</p>
    <h1 className="mt-1 text-2xl font-black sm:text-3xl">Produção por departamento e colaborador</h1>
    <p className="mt-2 text-xs text-slate-500">Dados realizados, separados entre testes, reparos, diagnósticos e movimentações de OS.</p>
   </div>
   <div className="flex gap-2">
    <button type="button" onClick={()=>setVersao(x=>x+1)} disabled={carregando} className={cssButton+" inline-flex items-center gap-2 disabled:opacity-50"}><RefreshCw className={"h-4 w-4 "+(carregando?"animate-spin":"")}/>Atualizar</button>
    <button type="button" disabled={!dados||carregando} onClick={gerarCsv} className={cssButton+" inline-flex items-center gap-2 disabled:opacity-40"}><Download className="h-4 w-4"/>CSV</button>
   </div>
  </header>
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
   <div className="flex flex-wrap gap-2" role="group" aria-label="Período de análise">
    {[["dia","Diário"],["mes","Mensal"],["ano","Anual"],["personalizado","Período específico"]].map(([valor,nome])=>
     <button type="button" key={valor} onClick={()=>alterarModo(valor)} aria-pressed={modo===valor}
       className={"rounded-xl border px-4 py-2 text-xs font-black "+(modo===valor?"border-violet-700 bg-violet-700 text-white":"border-slate-200 bg-white text-slate-600")}>{nome}</button>)}
   </div>
   <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    {modo==="dia"&&<label className="text-xs font-semibold text-slate-700">Data<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3" type="date" value={dia} onChange={e=>setDia(e.target.value)}/></label>}
    {modo==="mes"&&<label className="text-xs font-semibold text-slate-700">Mês<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3" type="month" value={mes} onChange={e=>setMes(e.target.value)}/></label>}
    {modo==="ano"&&<label className="text-xs font-semibold text-slate-700">Ano<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3" type="number" min="2020" max="2099" value={ano} onChange={e=>setAno(e.target.value)}/></label>}
    {modo==="personalizado"&&<>
     <label className="text-xs font-semibold text-slate-700">De<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3" type="date" value={customInicio} onChange={e=>setCustomInicio(e.target.value)}/></label>
     <label className="text-xs font-semibold text-slate-700">Até<input className="mt-1 block h-10 w-full rounded-lg border border-slate-200 px-3" type="date" value={customFim} onChange={e=>setCustomFim(e.target.value)}/></label>
    </>}
    <label className="text-xs font-semibold text-slate-700">Categoria
     <select value={area} onChange={e=>mudarArea(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
      {areas.map(a=><option key={a} value={a}>{a||"Todas as categorias"}</option>)}
     </select>
    </label>
    <label className="text-xs font-semibold text-slate-700">Departamento
     <select value={departamento} onChange={e=>setDepartamento(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
      <option value="">Todos os departamentos</option>
      {Array.from(new Set([...opcoes.departamentos,departamento].filter(Boolean))).sort().map(x=><option key={x} value={x}>{x}</option>)}
     </select>
    </label>
    <label className="text-xs font-semibold text-slate-700">Colaborador
     <select value={tecnico} onChange={e=>setTecnico(e.target.value)} className="mt-1 block h-10 w-full rounded-lg border border-slate-200 bg-white px-3">
      <option value="">Todos os colaboradores</option>
      {Array.from(new Set([...opcoes.tecnicos,tecnico].filter(Boolean))).sort().map(x=><option key={x} value={x}>{x}</option>)}
     </select>
    </label>
   </div>
   <p className="mt-3 text-xs text-slate-500">Período consultado: <strong>{periodo.inicio}</strong> a <strong>{periodo.fim}</strong> · {periodo.agrupar==="mes"?"agrupado por mês":"agrupado por dia"}</p>
   {(departamento||tecnico)&&<button type="button" onClick={()=>{setDepartamento("");setTecnico("")}} className="mt-2 text-xs font-bold text-violet-700">Limpar filtros de equipe e departamento</button>}
  </section>
  <FluxoLinhaBrancaPeriodo periodo={periodo} area={area} departamento={departamento} tecnico={tecnico}/>
  {erro&&<p role="alert" className="rounded-xl bg-rose-50 p-4 text-xs font-semibold text-rose-700">{erro}</p>}
  {!dados&&carregando&&<div className="flex items-center justify-center gap-3 rounded-xl bg-violet-50 p-10 text-sm font-bold text-violet-700"><Loader2 className="h-5 w-5 animate-spin"/>Consultando produção...</div>}
  {dados&&<>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Stat nome="OS movimentadas" valor={geral.os_movimentadas} descricao="Máquinas distintas com registros no período" Icon={Activity}/>
    <Stat nome="Atividades produtivas" valor={geral.atividades_produtivas} descricao="Ciclos + reparos + diagnósticos + outros apontamentos" Icon={BarChart3}/>
    <Stat nome="Ciclos executados" valor={geral.ciclos} descricao="Triagem funcional e bancada pós-reparo" Icon={Clock3}/>
    <Stat nome="Reparos concluídos" valor={geral.reparos} descricao="Execuções técnicas encerradas" Icon={Wrench}/>
   </div>
   <div className="grid gap-3 sm:grid-cols-3">
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs"><strong className="text-xl font-black text-slate-900">{numerar(geral.diagnosticos)}</strong><p className="mt-1 text-slate-500">Diagnósticos de triagem registrados</p></div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs"><strong className="text-xl font-black text-slate-900">{numerar(geral.movimentacoes)}</strong><p className="mt-1 text-slate-500">Mudanças de etapa (não somadas à produção)</p></div>
    <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs"><strong className="text-xl font-black text-slate-900">{horas(geral.tempo_operacao_segundos)}</strong><p className="mt-1 text-slate-500">Tempo registrado de ciclos e reparos — não horas de presença</p></div>
   </div>
   <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <h2 className="text-base font-black">Evolução da produção</h2>
    <p className="mt-1 text-xs text-slate-500">Ciclos, reparos e diagnósticos por {periodo.agrupar==="mes"?"mês":"dia"}. Movimentações de status ficam fora do volume produzido.</p>
    {evolucao.length?<div className="mt-4 h-64 w-full">
     <ResponsiveContainer width="100%" height="100%"><BarChart data={evolucao} margin={{top:8,right:10,bottom:4,left:-20}}>
      <CartesianGrid strokeDasharray="3 3" vertical={false}/>
      <XAxis dataKey="rotulo" interval="preserveStartEnd" tick={{fontSize:10}}/>
      <YAxis allowDecimals={false} tick={{fontSize:10}}/>
      <Tooltip/><Legend wrapperStyle={{fontSize:11}}/>
      <Bar dataKey="ciclos" name="Ciclos" stackId="prod" fill="#7c3aed"/>
      <Bar dataKey="reparos" name="Reparos" stackId="prod" fill="#0d9488"/>
      <Bar dataKey="diagnosticos" name="Diagnósticos" stackId="prod" fill="#f59e0b"/>
     </BarChart></ResponsiveContainer>
    </div>:<p className="mt-4 rounded-lg bg-slate-50 p-5 text-xs text-slate-500">Sem atividades registradas para os filtros.</p>}
   </section>
   <div className="grid gap-4 xl:grid-cols-2">
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
     <div className="p-4"><h2 className="text-sm font-black">Atividades executadas por departamento</h2><p className="mt-1 text-xs text-slate-500">Esta tabela mede <strong>execuções</strong> e OS distintas que receberam registros. Não representa entradas, saldo de fila nem máquinas finalizadas. Para o balanço de etapas, consulte a conciliação acima.</p></div>
     <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[580px] text-left text-xs">
      <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Departamento","OS com registros","Execuções","Ciclos","Reparos","Trocas de etapa"].map(t=><th key={t} className="px-3 py-2">{t}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{setores.map(s=><tr key={s.departamento} className="hover:bg-violet-50/40">
       <td className="px-3 py-3"><button type="button" onClick={()=>setDepartamento(s.departamento)} className="text-left font-bold text-violet-700">{s.departamento}</button></td>
       {[s.os_unicas,s.atividades,s.ciclos,s.reparos,s.movimentacoes].map((v,i)=><td key={i} className="px-3 py-3 tabular-nums">{numerar(v)}</td>)}
      </tr>)}</tbody>
     </table></div>
    </section>
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
     <div className="p-4"><h2 className="text-sm font-black">Produtividade por colaborador e departamento</h2><p className="mt-1 text-xs text-slate-500">Somente registros identificados no Liquida. “Não identificado” evidencia lacunas de apontamento.</p></div>
     <div className="max-h-[520px] overflow-auto"><table className="w-full min-w-[680px] text-left text-xs">
      <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Técnico","Departamento","OS com registros","Execuções","Ciclos","Reparos","Diagnósticos"].map(t=><th key={t} className="px-3 py-2">{t}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{tecnicos.map((t,i)=><tr key={t.tecnico+"-"+t.departamento+"-"+i} className="hover:bg-violet-50/40">
       <td className="px-3 py-3"><button type="button" onClick={()=>setTecnico(t.tecnico)} className="text-left font-bold text-violet-700">{t.tecnico}</button></td>
       <td className="px-3 py-3 text-slate-600">{t.departamento}</td>
       {[t.os_unicas,t.atividades,t.ciclos,t.reparos,t.diagnosticos].map((v,j)=><td key={j} className="px-3 py-3 tabular-nums">{numerar(v)}</td>)}
      </tr>)}</tbody>
     </table></div>
    </section>
   </div>
   <details className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
    <summary className="cursor-pointer text-sm font-black">Últimos registros do período ({Math.min(movimentos.length,100)})</summary>
    <p className="mt-2 text-[11px] text-slate-500">Amostra das 100 movimentações e atividades mais recentes, para auditoria por OS.</p>
    <div className="mt-3 max-h-[360px] overflow-auto"><table className="w-full min-w-[700px] text-left text-xs">
     <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase text-slate-500"><tr>{["Data","OS","Departamento","Colaborador","Registro"].map(t=><th key={t} className="px-3 py-2">{t}</th>)}</tr></thead>
     <tbody className="divide-y divide-slate-100">{movimentos.map((x,i)=><tr key={x.os_id+"-"+x.evento_em+"-"+i}>
      <td className="px-3 py-2">{new Date(x.evento_em).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"})}</td>
      <td className="px-3 py-2 font-bold">{x.numero_os}</td><td className="px-3 py-2">{x.departamento}</td>
      <td className="px-3 py-2">{x.tecnico}</td><td className="px-3 py-2">{x.origem}</td></tr>)}</tbody>
    </table></div>
   </details>
   <p className="rounded-xl bg-slate-50 p-4 text-xs leading-5 text-slate-600"><strong>Critério:</strong> contagem por evento registrado, não por presença ou jornada de trabalho.
    Uma mesma máquina pode ter dois ciclos e um reparo no período; por isso, “OS únicas” é diferente de “atividades”.
    Movimentos de etapa não são considerados produção. Dados históricos sem técnico identificado permanecem sinalizados.</p>
  </>}
 </div>;
}
