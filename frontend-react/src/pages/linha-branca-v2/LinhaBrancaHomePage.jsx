import {Link} from "react-router-dom";
import {ArrowUpRight,Clock3,Refrigerator,Snowflake,WashingMachine} from "lucide-react";
import MapaFisicoLavadorasPage from "./MapaFisicoLavadorasPage.jsx";

const LINHAS=[
 {
  nome:"Lavadoras",
  descricao:"Mapa físico da Triagem e estoque temporário",
  icon:WashingMachine,
  ativa:true,
  rota:"/v2/linha-branca/lavadoras",
 },
 {
  nome:"Refrigeração",
  descricao:"Estrutura operacional em preparação",
  icon:Refrigerator,
  ativa:false,
 },
 {
  nome:"Climatização",
  descricao:"Estrutura operacional em preparação",
  icon:Snowflake,
  ativa:false,
 },
];

function LinhaCard({linha}){
 const Icon=linha.icon;
 return <article aria-label={linha.nome+(linha.ativa?" em operação":" em desenvolvimento")}
  className={"flex min-w-0 flex-col rounded-2xl border p-4 sm:p-5 "+
   (linha.ativa?"border-violet-200 bg-white shadow-sm":"border-slate-200 bg-white/70")}>
  <div className="flex items-start justify-between gap-3">
   <span className={"flex h-10 w-10 items-center justify-center rounded-xl "+
    (linha.ativa?"bg-violet-100 text-violet-700":"bg-slate-100 text-slate-500")}>
    <Icon size={20}/>
   </span>
   <span className={"inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-bold "+
    (linha.ativa?"bg-emerald-50 text-emerald-700":"bg-slate-100 text-slate-600")}>
    {!linha.ativa&&<Clock3 size={12}/>}
    {linha.ativa?"Em operação":"Em desenvolvimento"}
   </span>
  </div>
  <h2 className="mt-4 text-base font-black text-slate-900">{linha.nome}</h2>
  <p className="mt-1 flex-1 text-xs leading-5 text-slate-500">{linha.descricao}</p>
  {linha.ativa
   ? <Link to={linha.rota} className="mt-4 inline-flex items-center gap-1 self-start text-xs font-black text-violet-700 hover:underline">
      Abrir linha <ArrowUpRight size={15}/>
     </Link>
   : <p className="mt-4 text-[11px] font-semibold text-slate-400">Disponível em uma próxima etapa</p>}
 </article>;
}

export default function LinhaBrancaHomePage(){
 return <div className="space-y-5">
  <header>
   <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-700">
    Liquida System · Linha Branca
   </p>
   <h1 className="mt-1.5 text-2xl font-black tracking-tight text-[#20142D] sm:text-3xl">
    Visão geral da operação
   </h1>
   <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
    Mapa físico da operação de Lavadoras. As demais linhas serão integradas
    conforme a implantação de Refrigeração e Climatização.
   </p>
  </header>
  <section aria-label="Linhas da operação" className="grid gap-3 md:grid-cols-3">
   {LINHAS.map(linha=><LinhaCard key={linha.nome} linha={linha}/>)}
  </section>
  <MapaFisicoLavadorasPage embutido/>
 </div>;
}
