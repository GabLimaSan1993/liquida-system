import {useEffect,useMemo,useState} from "react";
import {Activity, AlertTriangle, ArrowRight, Boxes, ChevronLeft, ChevronRight, Clock3, Factory, Loader2, RefreshCw, Search, X} from "lucide-react";
import {buscarMapaDepartamentosLinhaBranca,detalheOSLinhaBranca} from "../../services/mapaDepartamentosLinhaBrancaService.js";
import DetalheOperacionalOS from "../../components/linha-branca/DetalheOperacionalOS.jsx";

const AREAS=["","Lavadoras","Refrigeração","Climatização","Outros / Portáteis"];
const qtd=n=>Number(n||0).toLocaleString("pt-BR");
const dataBR=d=>d?new Date(d.length===10?d+"T12:00:00":d).toLocaleDateString("pt-BR"):"—";
const quando=d=>d?new Date(d).toLocaleString("pt-BR",{dateStyle:"short",timeStyle:"short"}):"—";
const TONALIDADES={
 "Aguardando triagem":"bg-slate-100 text-slate-700",
 "Triagem":"bg-blue-50 text-blue-700",
 "Formação de kit":"bg-blue-50 text-blue-700",
 "Reparo mecânico":"bg-violet-50 text-violet-700",
 "Reparo elétrico":"bg-violet-50 text-violet-700",
 "Reparo estético":"bg-violet-50 text-violet-700",
 "Reparo sem área definida":"bg-rose-50 text-rose-700",
 "Aguardando peças":"bg-amber-50 text-amber-800",
 "Bancada de testes":"bg-cyan-50 text-cyan-800",
 "Higienização":"bg-teal-50 text-teal-800",
 "Qualidade":"bg-indigo-50 text-indigo-800",
 "Aprovados / liberação":"bg-emerald-50 text-emerald-700",
 "Operação":"bg-blue-50 text-blue-700",
 "Scrap":"bg-rose-50 text-rose-700",
 "Outros / revisar":"bg-rose-50 text-rose-700"
};
const PRIORIDADE=[
 "Aguardando triagem","Triagem","Formação de kit","Reparo mecânico","Reparo elétrico",
 "Reparo estético","Reparo sem área definida","Aguardando peças","Bancada de testes",
 "Higienização","Qualidade","Aprovados / liberação","Operação","Scrap","Outros / revisar",
 "Finalizados","Cancelados","Condenados"
];
const pill=(nome)=>"rounded-full px-2.5 py-1 text-[10px] font-bold "+(TONALIDADES[nome]||"bg-slate-100 text-slate-700");
function Indicador({rotulo,valor,descricao,icone:Icon,atencao=false}){
 return <div className={"rounded-2xl border p-4 shadow-sm "+(atencao?"border-rose-200 bg-rose-50":"border-slate-200 bg-white")}>
  <div className="flex items-center justify-between gap-2"><span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</span>
    <Icon className={"h-4 w-4 "+(atencao?"text-rose-600":"text-violet-600")}/></div>
  <div className="mt-2 text-3xl font-black tabular-nums text-slate-900">{qtd(valor)}</div>
  <p className="mt-1 text-[11px] text-slate-500">{descricao}</p>
 </div>;
}
export default function MapaDepartamentosLinhaBranca({onIndicadores}){
 const [area,setArea]=useState(""),[departamento,setDepartamento]=useState("");
 const [busca,setBusca]=useState(""),[buscaAplicada,setBuscaAplicada]=useState("");
 const [somenteAtivos,setSomenteAtivos]=useState(true),[pagina,setPagina]=useState(1);
 const [atualizar,setAtualizar]=useState(0),[dados,setDados]=useState(null),[carregando,setCarregando]=useState(true),[erro,setErro]=useState("");
 const [selecionada,setSelecionada]=useState(null),[detalhe,setDetalhe]=useState(null),[erroDetalhe,setErroDetalhe]=useState(""),[carregandoDetalhe,setCarregandoDetalhe]=useState(false);
 useEffect(()=>{
  const t=setTimeout(()=>setBuscaAplicada(busca.trim()),320);
  return ()=>clearTimeout(t);
 },[busca]);
 useEffect(()=>{
  const ctrl=new AbortController();setCarregando(true);setErro("");
  buscarMapaDepartamentosLinhaBranca({area,departamento,busca:buscaAplicada,somenteAtivos,pagina,tamanho:50,signal:ctrl.signal})
   .then(d=>{if(!ctrl.signal.aborted)setDados(d)})
   .catch(e=>{if(!ctrl.signal.aborted)setErro(e.message||"Falha ao carregar mapa operacional")})
   .finally(()=>{if(!ctrl.signal.aborted)setCarregando(false)});
  return ()=>ctrl.abort();
 },[area,departamento,buscaAplicada,somenteAtivos,pagina,atualizar]);
 useEffect(()=>{
  if(!selecionada)return;
  const ctrl=new AbortController();setCarregandoDetalhe(true);setErroDetalhe("");setDetalhe(null);
  detalheOSLinhaBranca(selecionada.id,ctrl.signal)
    .then(d=>{if(!ctrl.signal.aborted)setDetalhe(d)})
    .catch(e=>{if(!ctrl.signal.aborted)setErroDetalhe(e.message)})
    .finally(()=>{if(!ctrl.signal.aborted)setCarregandoDetalhe(false)});
  return ()=>ctrl.abort();
 },[selecionada?.id]);
 const resumo=dados?.resumo||[];
 const departamentos=useMemo(()=>[...resumo].sort((a,b)=>PRIORIDADE.indexOf(a.departamento)-PRIORIDADE.indexOf(b.departamento)),[resumo]);
 const acima30=resumo.reduce((a,d)=>a+Number(d.acima_30_dias||0),0);
 const itens=dados?.itens||[],totalFiltrado=Number(dados?.total_filtrado||0);
 const totalPaginas=Math.max(1,Math.ceil(totalFiltrado/50));
 const mudarArea=a=>{setArea(a);setDepartamento("");setPagina(1)};
 const mudarBusca=v=>{setBusca(v);setPagina(1)};
 return <div className="space-y-5 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-violet-600">Gestão · Linha Branca</p>
    <h1 className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Mapa de máquinas por departamento</h1>
    <p className="mt-2 text-sm text-slate-500">Posição atual de cada OS, sem depender do carregamento do histórico de produção.</p>
    <p className="mt-1 text-[11px] text-slate-400">Consulta atualizada: {quando(dados?.atualizado_em)}</p></div>
   <div className="flex gap-2">
    <button type="button" disabled={carregando} onClick={()=>setAtualizar(n=>n+1)}
      className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">
      <RefreshCw className={"h-4 w-4 "+(carregando?"animate-spin":"")}/>Atualizar</button>
    {onIndicadores&&<button type="button" onClick={onIndicadores}
      className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white">
      <Activity className="h-4 w-4"/>Indicadores históricos<ArrowRight className="h-4 w-4"/></button>}
   </div>
  </header>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <Indicador rotulo="OS no fluxo" valor={dados?.total_geral} descricao="Inclui todas as filas do filtro selecionado" icone={Boxes}/>
   <Indicador rotulo="Departamentos ocupados" valor={resumo.length} descricao="Com pelo menos uma OS registrada" icone={Factory}/>
   <Indicador rotulo="Aging acima de 30 dias" valor={acima30} descricao="Tempo desde entrada; não é tempo no setor" icone={Clock3}/>
   <Indicador rotulo="Sem setor definido" valor={dados?.sem_definicao} descricao="Reparos genéricos / situações a revisar" icone={AlertTriangle} atencao={Number(dados?.sem_definicao||0)>0}/>
  </div>
  <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <h2 className="text-sm font-black">Filtros operacionais</h2>
    <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
     <input type="checkbox" checked={somenteAtivos} onChange={e=>{setSomenteAtivos(e.target.checked);setDepartamento("");setPagina(1)}}/>
     Somente OS não finalizadas</label>
   </div>
   <div className="mt-3 flex flex-wrap gap-2">{AREAS.map(a=><button type="button" key={a||"Todas"}
      onClick={()=>mudarArea(a)} aria-pressed={area===a}
      className={"rounded-xl border px-3 py-2 text-xs font-bold "+(a===area?"border-violet-700 bg-violet-700 text-white":"border-slate-200 bg-white text-slate-600")}>
      {a||"Todas as categorias"}</button>)}</div>
   <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(210px,300px)]">
    <label className="relative"><Search className="absolute left-3.5 top-3.5 h-4 w-4 text-slate-400"/>
     <input aria-label="Buscar OS, marca, modelo ou fornecedor" value={busca} onChange={e=>mudarBusca(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-violet-500"
      placeholder="Buscar OS, marca, modelo, fornecedor..."/></label>
    <select aria-label="Departamento" value={departamento} onChange={e=>{setDepartamento(e.target.value);setPagina(1)}}
      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
     <option value="">Todos os departamentos</option>
     {departamentos.map(d=><option key={d.departamento} value={d.departamento}>{d.departamento} ({qtd(d.total)})</option>)}
    </select>
   </div>
  </section>
  {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
   {erro}<button type="button" className="ml-3 underline" onClick={()=>setAtualizar(n=>n+1)}>Tentar novamente</button></div>}
  {!dados&&carregando&&<div className="flex min-h-44 items-center justify-center gap-3 rounded-xl bg-violet-50 text-sm font-bold text-violet-700">
   <Loader2 className="h-5 w-5 animate-spin"/>Consultando posição operacional...</div>}
  {dados&&<section>
   <div className="mb-3 flex flex-wrap items-center justify-between">
    <div><h2 className="text-base font-black">Departamentos e filas</h2><p className="mt-1 text-xs text-slate-500">
      Selecione o setor para localizar as máquinas dentro dele.</p></div>
    {departamento&&<button type="button" onClick={()=>{setDepartamento("");setPagina(1)}} className="text-xs font-bold text-violet-700">Mostrar todos</button>}
   </div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
    {departamentos.map(d=><button type="button" key={d.departamento}
     onClick={()=>{setDepartamento(x=>x===d.departamento?"":d.departamento);setPagina(1)}}
     aria-pressed={departamento===d.departamento}
     className={"rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md "+
       (departamento===d.departamento?"border-violet-500 ring-2 ring-violet-100":"border-slate-200")}>
      <div className="flex items-start justify-between gap-3">
       <span className="text-xs font-bold leading-5 text-slate-700">{d.departamento}</span>
       <span className={pill(d.departamento)+" text-lg tabular-nums"}>{qtd(d.total)}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-semibold text-slate-500">
       <span>{qtd(d.acima_7_dias)} aging +7d</span><span>{qtd(d.sem_responsavel)} sem técnico identificado</span>
      </div>
     </button>)}
   </div>
  </section>}
  {dados&&<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
    <div><h2 className="text-sm font-black">{departamento?"Fila · "+departamento:"Posição de cada máquina"}</h2>
     <p className="mt-1 text-xs text-slate-500">{qtd(totalFiltrado)} OS · Entrada mais antiga primeiro · 50 por página</p></div>
    {carregando&&<span className="inline-flex items-center gap-2 text-xs font-semibold text-violet-600"><Loader2 className="h-4 w-4 animate-spin"/>Atualizando</span>}
   </div>
   <div className="overflow-x-auto">
    <table className="w-full min-w-[1250px] whitespace-nowrap text-left text-xs">
     <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-500"><tr>
      {["OS / tipo","Produto","Departamento atual","Status / área do sistema","Responsável","Entrada","Última etapa / conclusão","Aging total","Detalhes"].map(h=><th key={h} className="px-4 py-3">{h}</th>)}
     </tr></thead>
     <tbody className="divide-y divide-slate-100">
      {itens.map(o=><tr key={o.id} className="hover:bg-violet-50/40">
       <td className="px-4 py-3"><div className="font-black">{o.numero_os}</div><div className="mt-1 text-[10px] text-slate-400">{o.categoria||"Sem categoria"}</div></td>
       <td className="px-4 py-3"><div className="font-semibold">{o.marca||"—"} {o.modelo||""}</div><div className="mt-1 max-w-48 truncate text-[10px] text-slate-400">{o.fornecedor||"Sem fornecedor"}</div></td>
       <td className="px-4 py-3"><span className={pill(o.departamento)}>{o.departamento}</span></td>
       <td className="px-4 py-3"><div>{o.status_atual||"—"}</div><div className="mt-1 text-[10px] text-slate-400">{o.area_destino||o.etapa_atual||"Não informado"}</div></td>
       <td className="px-4 py-3"><span className={o.responsavel?"font-semibold text-slate-700":"font-semibold text-amber-700"}>{o.responsavel||"Não identificado"}</span></td>
       <td className="px-4 py-3 text-slate-600">{dataBR(o.dt_entrada)}</td>
       <td className="px-4 py-3">
         <div className="font-bold text-slate-700">{o.ultima_etapa_em?quando(o.ultima_etapa_em):"Não registrada"}</div>
         <div className={"mt-1 text-[10px] "+(o.ultima_etapa_confirmada?"text-emerald-700":"text-amber-700")}>
           {o.ultima_etapa_tipo||"Sem movimentação"}
         </div>
       </td>
       <td className="px-4 py-3"><span className={"rounded-lg px-2 py-1 font-bold "+(o.aging_dias>30?"bg-rose-50 text-rose-700":o.aging_dias>7?"bg-amber-50 text-amber-700":"bg-slate-100 text-slate-600")}>
        {o.aging_dias===null?"Sem data":qtd(o.aging_dias)+" dias"}</span></td>
       <td className="px-4 py-3"><button type="button" onClick={()=>setSelecionada(o)} className="rounded-lg border border-violet-200 px-3 py-2 text-[11px] font-bold text-violet-700">Ver OS</button></td>
      </tr>)}
      {!itens.length&&<tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-400">Não há OS para os filtros selecionados.</td></tr>}
     </tbody>
    </table>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 p-4 text-xs text-slate-600">
    <span>Página {qtd(pagina)} de {qtd(totalPaginas)} · {qtd(itens.length)} registros exibidos</span>
    <div className="flex gap-2">
     <button type="button" disabled={pagina===1||carregando} onClick={()=>setPagina(p=>Math.max(1,p-1))}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40"><ChevronLeft className="h-4 w-4"/>Anterior</button>
     <button type="button" disabled={pagina>=totalPaginas||carregando} onClick={()=>setPagina(p=>Math.min(totalPaginas,p+1))}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 font-bold disabled:opacity-40">Próxima<ChevronRight className="h-4 w-4"/></button>
    </div>
   </div>
  </section>}
  <p className="text-[11px] leading-5 text-slate-500"><strong>Critério:</strong> posição por status/área registrada na OS; não representa endereço físico.
   Aging é o tempo desde a entrada, não o tempo dentro do departamento. Reparos sem especialidade definida ficam separados para correção cadastral.</p>
  {selecionada&&<div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" onClick={()=>{setSelecionada(null);setDetalhe(null)}}>
   <div role="dialog" aria-modal="true" aria-label={"OS "+selecionada.numero_os} onClick={e=>e.stopPropagation()}
    className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
    <div className="flex items-start justify-between gap-3">
     <div><p className="text-[10px] font-black uppercase text-violet-600">Localização atual · Histórico</p>
      <h2 className="mt-1 text-xl font-black">OS {selecionada.numero_os}</h2><div className="mt-2"><span className={pill(selecionada.departamento)}>{selecionada.departamento}</span></div>
     </div>
     <button type="button" aria-label="Fechar detalhes" className="rounded-lg border border-slate-200 p-2" onClick={()=>{setSelecionada(null);setDetalhe(null)}}><X className="h-5 w-5"/></button>
    </div>
    {carregandoDetalhe&&<p className="mt-5 flex items-center gap-2 text-sm text-violet-600"><Loader2 className="h-4 w-4 animate-spin"/>Carregando histórico...</p>}
    {erroDetalhe&&<p className="mt-4 text-sm text-rose-700">{erroDetalhe}</p>}
    {detalhe&&<DetalheOperacionalOS detalhe={detalhe}/>}
   </div>
  </div>}
 </div>;
}
