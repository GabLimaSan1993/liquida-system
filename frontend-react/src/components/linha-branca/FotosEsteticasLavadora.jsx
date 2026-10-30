import {useEffect,useState} from "react";
import {Camera,CheckCircle2,Loader2,AlertTriangle} from "lucide-react";
import {buscarUltimoIntercicloLavadora,anexarFotoLavadora,urlFotoLavadora} from "../../services/lavadorasPreventivaService.js";

function Evidencia({foto,label}) {
 const [url,setUrl]=useState("");
 useEffect(()=>{
   let live=true;setUrl("");
   if(foto?.caminho)urlFotoLavadora(foto.caminho).then(v=>{if(live)setUrl(v)}).catch(()=>{});
   return ()=>{live=false};
 },[foto?.caminho]);
 return <div className="flex min-h-16 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3">
   {url?<img className="h-16 w-16 rounded-lg object-cover" src={url} alt={label}/>:<Camera className="h-5 w-5 text-slate-400"/>}
   <span className="text-xs font-semibold text-slate-600">{label}: {foto?"Foto registrada":"Sem foto"}</span>
 </div>;
}
export default function FotosEsteticasLavadora({osId,onEstado}) {
 const [check,setCheck]=useState(null),[fotos,setFotos]=useState([]);
 const [loading,setLoading]=useState(true),[up,setUp]=useState(""),[erro,setErro]=useState("");
 useEffect(()=>{
  let vivo=true;setLoading(true);setErro("");setFotos([]);setCheck(null);
  buscarUltimoIntercicloLavadora(osId).then(({check:registro,fotos:itens})=>{
   if(!vivo)return;setCheck(registro);setFotos(itens);
   onEstado?.(registro?.estetica_apresenta_defeito?registro.defeitos_esteticos.some(d=>!itens.some(f=>f.categoria==="estetico"&&f.fase==="depois"&&f.item===d)):false);
  }).catch(e=>{if(vivo)setErro(e.message)}).finally(()=>{if(vivo)setLoading(false)});
  return ()=>{vivo=false};
 },[osId]);
 if(loading)return <div className="rounded-xl border border-slate-200 bg-white p-4 text-xs text-slate-500">Carregando evidências da OS...</div>;
 if(!check?.estetica_apresenta_defeito)return null;
 const pendentes=(check.defeitos_esteticos||[]).filter(item=>!fotos.some(f=>f.categoria==="estetico"&&f.fase==="depois"&&f.item===item));
 async function upload(nome,arquivo){
   if(!arquivo)return;
   try{
    setUp(nome);setErro("");
    const foto=await anexarFotoLavadora({osId,cicloPrimeiroId:check.ciclo_primeiro_id,categoria:"estetico",item:nome,fase:"depois",arquivo});
    const alteradas=[foto,...fotos];setFotos(alteradas);
    onEstado?.(check.defeitos_esteticos.some(d=>!alteradas.some(f=>f.categoria==="estetico"&&f.fase==="depois"&&f.item===d)));
   }catch(e){setErro(e.message)}finally{setUp("")}
 }
 return <section className="rounded-2xl border border-violet-200 bg-white p-5">
  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900"><Camera className="h-4 w-4 text-violet-700"/> Evidências antes e depois do reparo estético</h3>
  <p className="mt-2 text-xs text-slate-600">Cada defeito registrado na triagem exige uma nova foto DEPOIS. Sem evidência final, o reparo não pode ser concluído.</p>
  <div className="mt-3 space-y-3">{(check.defeitos_esteticos||[]).map(item=>{
   const antes=fotos.find(f=>f.categoria==="estetico"&&f.item===item&&f.fase==="antes");
   const depois=fotos.find(f=>f.categoria==="estetico"&&f.item===item&&f.fase==="depois");
   return <div key={item} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <div className="mb-2 text-xs font-bold text-slate-800">{item}</div>
    <div className="grid gap-2 sm:grid-cols-2">
     <Evidencia foto={antes} label="ANTES"/>
     <div className="space-y-2"><Evidencia foto={depois} label="DEPOIS"/>
      <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-violet-300 bg-violet-50 p-2.5 text-xs font-bold text-violet-700">
       {up===item?<Loader2 className="h-4 w-4 animate-spin"/>:<Camera className="h-4 w-4"/>}
       {depois?"Adicionar outra foto":"Fotografar resultado após reparo"}
       <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={Boolean(up)}
         onChange={e=>{const a=e.target.files?.[0];if(a)upload(item,a);e.target.value="";}}/>
      </label>
     </div>
    </div>
   </div>
  })}</div>
  <div className="mt-3 flex items-center gap-2 text-xs font-bold">
   {pendentes.length?<><AlertTriangle className="h-4 w-4 text-amber-600"/><span className="text-amber-700">Faltam {pendentes.length} foto(s) DEPOIS para liberar o reparo.</span></>
   :<><CheckCircle2 className="h-4 w-4 text-emerald-600"/><span className="text-emerald-700">Fotos antes e depois completas. Reparo liberado para conclusão.</span></>}
  </div>
  {erro&&<p role="alert" className="mt-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{erro}</p>}
 </section>;
}
