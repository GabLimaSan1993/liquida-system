import {ArrowLeft,Clock3,Refrigerator,Snowflake} from "lucide-react";
import {Link} from "react-router-dom";

export default function LinhaBrancaModuloEmDesenvolvimento({familia="Refrigeração"}){
 const refrigeracao=familia==="Refrigeração";
 const Icon=refrigeracao?Refrigerator:Snowflake;
 return <div className="mx-auto w-full max-w-[920px] space-y-5">
  <div>
   <p className="text-[10px] font-black uppercase tracking-[.18em] text-violet-700">
    Liquida System · Linha Branca
   </p>
   <h1 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">{familia}</h1>
  </div>
  <section className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-9">
   <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
    <Icon size={24}/>
   </span>
   <h2 className="mt-5 text-xl font-black text-slate-900">Linha em desenvolvimento</h2>
   <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
    O módulo operacional de {familia} ainda não está disponível nesta nova estrutura
    da Linha Branca. Por enquanto, o mapa físico e o estoque temporário estão
    implantados para Lavadoras.
   </p>
   <p className="mt-4 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
    <Clock3 size={14}/> Em desenvolvimento
   </p>
   <div className="mt-7 flex flex-wrap gap-3">
    <Link to="/v2/linha-branca" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-800">
     <ArrowLeft size={15}/> Voltar à visão geral
    </Link>
    <Link to="/v2/linha-branca/lavadoras" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-violet-700 hover:bg-violet-50">
     Abrir mapa de Lavadoras
    </Link>
   </div>
  </section>
 </div>;
}
