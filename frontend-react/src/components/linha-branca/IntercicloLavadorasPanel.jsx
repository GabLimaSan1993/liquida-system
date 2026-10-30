import {useEffect,useMemo,useState} from "react";
import {Camera,CheckCircle2,ShieldCheck,AlertTriangle,Loader2,Play,Wrench} from "lucide-react";
import {REPAROS_ESTETICOS_LAVADORAS} from "../../services/linhaBrancaService.js";
import {
 ITENS_PREVENTIVA_LAVADORA,buscarIntercicloLavadora,
 anexarFotoLavadora,salvarIntercicloLavadora,urlFotoLavadora
} from "../../services/lavadorasPreventivaService.js";

function FotoObrigatoria({osId,cicloId,categoria,item,fase="antes",fotos,onUploaded,disabled}) {
 const [arquivoCarregando,setArquivoCarregando]=useState(false);
 const [url,setUrl]=useState("");
 const foto=useMemo(()=>fotos.find(f=>f.categoria===categoria&&f.item===item&&f.fase===fase),[fotos,categoria,item,fase]);
 useEffect(()=>{
  let ativo=true;
  setUrl("");
  if(foto?.caminho)urlFotoLavadora(foto.caminho).then(u=>{if(ativo)setUrl(u)}).catch(()=>{});
  return ()=>{ativo=false};
 },[foto?.caminho]);
 async function upload(e){
   const file=e.target.files?.[0]; if(!file)return;
   try{
     setArquivoCarregando(true);
     const dado=await anexarFotoLavadora({osId,cicloPrimeiroId:cicloId,categoria,item,fase,arquivo:file});
     onUploaded(dado);
   }catch(err){onUploaded(null,err.message)}finally{setArquivoCarregando(false);e.target.value="";}
 }
 return <label className="flex min-h-16 cursor-pointer flex-wrap items-center gap-3 rounded-xl border border-dashed border-violet-200 bg-white p-3">
   <Camera className="h-5 w-5 text-violet-600"/>
   <span className="flex-1 text-xs font-semibold text-slate-700">Foto {fase.toUpperCase()} · {item} <span className="text-rose-600">*</span>
     <span className="mt-0.5 block text-[10px] text-slate-500">{foto?"Foto vinculada à OS":"Toque para fotografar ou selecionar"}</span>
   </span>
   {url&&<img src={url} alt={"Evidência "+item} className="h-14 w-14 rounded-lg object-cover"/>}
   {arquivoCarregando?<Loader2 className="h-5 w-5 animate-spin text-violet-600"/>:<span className={foto?"text-xs font-bold text-emerald-700":"text-xs text-violet-700"}>{foto?"Registrada":"Adicionar"}</span>}
   <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" disabled={disabled||arquivoCarregando} onChange={upload}/>
 </label>;
}

export default function IntercicloLavadorasPanel({ciclo,operador,saving,onIniciar,onOxidacao}) {
 const [checklist,setChecklist]=useState({});
 const [vazamento,setVazamento]=useState("");
 const [lgAplicada,setLgAplicada]=useState("");
 const [estetica,setEstetica]=useState("");
 const [defeitos,setDefeitos]=useState([]);
 const [fotos,setFotos]=useState([]);
 const [carregando,setCarregando]=useState(true);
 const [ocupado,setOcupado]=useState(false);
 const [salvo,setSalvo]=useState(false);
 const [erro,setErro]=useState("");
 const lg=/^LG(?:\b|\W)/i.test(ciclo?.os?.marca||"");
 useEffect(()=>{
  let vivo=true;
  setCarregando(true);setErro("");setSalvo(false);setChecklist({});setVazamento("");setLgAplicada("");setEstetica("");setDefeitos([]);setFotos([]);
  buscarIntercicloLavadora(ciclo.id).then(({check,fotos:itens})=>{
   if(!vivo)return;
   if(check){
    setChecklist(check.checklist||{});
    setVazamento(check.vazamento===true?"sim":check.vazamento===false?"nao":"");
    setLgAplicada(check.lg_preventiva_aplicada===true?"sim":check.lg_preventiva_aplicada===false?"nao":"");
    setEstetica(check.estetica_apresenta_defeito?"sim":"nao");
    setDefeitos(check.defeitos_esteticos||[]);
    setSalvo(true);
   }
   setFotos(itens);
  }).catch(e=>{if(vivo)setErro(e.message)}).finally(()=>{if(vivo)setCarregando(false)});
  return ()=>{vivo=false};
 },[ciclo.id]);
 const fotoExiste=(categoria,item,fase="antes")=>fotos.some(f=>f.categoria===categoria&&f.item===item&&f.fase===fase);
 const pendentes=ITENS_PREVENTIVA_LAVADORA.filter(i=>!["ok","nao_ok"].includes(checklist[i.chave]));
 const faltandoFoto=ITENS_PREVENTIVA_LAVADORA.filter(i=>i.foto&&!fotoExiste("preventiva",i.label==="Pés niveladores"?"PÉ NIVELADOR":"OXIDAÇÃO"));
 const fotosEsteticasPendentes=estetica==="sim"?defeitos.filter(d=>!fotoExiste("estetico",d)):[];
 const oxidação=checklist.oxidacao==="nao_ok";
 const naoConforme=ITENS_PREVENTIVA_LAVADORA.some(i=>i.chave!=="oxidacao"&&checklist[i.chave]==="nao_ok") || vazamento==="sim";
 const pronto=pendentes.length===0 && faltandoFoto.length===0 && fotosEsteticasPendentes.length===0
  && vazamento!=="" && estetica!=="" && (!lg || lgAplicada!=="")
  && (estetica!=="sim"||defeitos.length>0);
 const alterado=()=>setSalvo(false);
 const selectClass="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700";
 const salvar=async()=>{
  if(!pronto){setErro("Preencha o checklist, a avaliação estética e todas as fotos obrigatórias.");return false}
  try{
   setOcupado(true);setErro("");
   await salvarIntercicloLavadora(ciclo,{
     checklist,vazamento:vazamento==="sim",lg_preventiva_aplicada:lg?lgAplicada==="sim":null,
     estetica_apresenta_defeito:estetica==="sim",defeitos_esteticos:defeitos,operador
   });
   setSalvo(true);return true;
  }catch(e){setErro(e.message);return false}finally{setOcupado(false)}
 };
 const fotoProps={osId:ciclo.os_id,cicloId:ciclo.id,fotos,disabled:saving||ocupado,
  onUploaded:(d,err)=>{if(err)setErro(err);if(d){setFotos(p=>[d,...p]);alterado();}}};
 if(carregando)return <section className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Carregando checklist entre ciclos...</section>;
 return <section id="checklist-preventiva" className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm md:p-6">
  <div className="flex flex-wrap items-center gap-3">
   <ShieldCheck className="h-6 w-6 text-violet-700"/>
   <div className="flex-1"><h2 className="text-base font-bold text-slate-900">Preventiva obrigatória entre ciclos · OS {ciclo.os?.numero_os}</h2>
     <p className="mt-1 text-xs text-slate-500">Conclua a conferência física, registre as fotos e verifique defeitos estéticos antes do ciclo 2.</p></div>
   <span className={`rounded-lg px-3 py-1 text-xs font-bold ${salvo?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800"}`}>{salvo?"Checklist registrado":"Pendente"}</span>
  </div>
  <div className="mt-4 grid gap-3 md:grid-cols-2">
   {ITENS_PREVENTIVA_LAVADORA.map(item=><div key={item.chave} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
    <span className="text-xs font-bold text-slate-800">{item.label} *</span>
    <select className={selectClass} value={checklist[item.chave]||""} onChange={e=>{setChecklist(p=>({...p,[item.chave]:e.target.value}));alterado()}}>
     <option value="">Selecione o resultado</option><option value="ok">OK / Sem ocorrência</option>
     <option value="nao_ok">{item.chave==="oxidacao"?"Oxidação detectada":"Não conforme"}</option>
    </select>
    {item.chave==="vedacao_painel"&&lg&&<p className="mt-2 text-xs font-semibold text-violet-700">LG: confirmar preventiva aplicada na vedação do painel frontal</p>}
   </div>)}
   <label className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs font-bold text-slate-800">Apresentou vazamentos? *
    <select value={vazamento} onChange={e=>{setVazamento(e.target.value);alterado()}} className={selectClass}>
     <option value="">Selecione</option><option value="nao">Não</option><option value="sim">Sim — tratar antes do ciclo 2</option>
    </select>
   </label>
   {lg&&<label className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-bold text-slate-800">LG · Preventiva na vedação do painel aplicada? *
    <select value={lgAplicada} onChange={e=>{setLgAplicada(e.target.value);alterado()}} className={selectClass}>
     <option value="">Selecione</option><option value="sim">Sim, aplicada</option><option value="nao">Não aplicada (registrar motivo)</option>
    </select>
   </label>}
  </div>
  <div className="mt-3 grid gap-3 md:grid-cols-2">
   <FotoObrigatoria {...fotoProps} categoria="preventiva" item="PÉ NIVELADOR"/>
   <FotoObrigatoria {...fotoProps} categoria="preventiva" item="OXIDAÇÃO"/>
  </div>
  <div className="mt-5 rounded-xl border border-slate-200 p-4">
   <h3 className="text-sm font-bold text-slate-900">Inspeção estética · não representa falha do ciclo</h3>
   <p className="mt-1 text-xs text-slate-500">Apareceu dano estético na máquina? Se sim, fotografe o estado ANTES de qualquer intervenção.</p>
   <div className="mt-3 flex gap-2">
    {[["nao","Não apresentou"],["sim","Sim, apresentou"]].map(([v,n])=><button type="button" key={v}
      onClick={()=>{setEstetica(v);if(v==="nao")setDefeitos([]);alterado()}}
      className={`rounded-lg border px-4 py-2 text-xs font-bold ${estetica===v?"border-violet-500 bg-violet-50 text-violet-800":"border-slate-200 bg-white text-slate-600"}`}>{n}</button>)}
   </div>
   {estetica==="sim"&&<>
     <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {REPAROS_ESTETICOS_LAVADORAS.map(nome=><label key={nome} className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 text-xs text-slate-700">
       <input type="checkbox" checked={defeitos.includes(nome)} onChange={()=>{setDefeitos(a=>a.includes(nome)?a.filter(x=>x!==nome):[...a,nome]);alterado()}}/>
       <span>{nome}</span>
      </label>)}
     </div>
     <div className="mt-4 space-y-2">{defeitos.map(nome=><FotoObrigatoria key={nome} {...fotoProps} categoria="estetico" item={nome} fase="antes"/>)}</div>
   </>}
  </div>
  {oxidação&&<p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800"><AlertTriangle className="mr-2 inline h-4 w-4"/>Oxidação identificada: não iniciar o 2º ciclo. Encaminhamento obrigatório para Carlos, reparo N3, com foto.</p>}
  {naoConforme&&!oxidação&&<p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">Há não conformidade preventiva ou vazamento. Corrija e atualize o checklist antes de liberar o segundo ciclo.</p>}
  {erro&&<p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{erro}</p>}
  <div className="mt-4 flex flex-wrap items-center gap-3">
   <button type="button" onClick={salvar} disabled={saving||ocupado||!pronto}
     className="inline-flex h-11 items-center gap-2 rounded-xl border border-violet-300 bg-violet-50 px-5 text-xs font-bold text-violet-800 disabled:opacity-40">
    {ocupado?<Loader2 className="h-4 w-4 animate-spin"/>:<CheckCircle2 className="h-4 w-4"/>} Salvar checklist e evidências
   </button>
   {oxidação?<button type="button" disabled={!salvo||saving||ocupado} onClick={()=>onOxidacao(ciclo)}
     className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-bold text-white disabled:opacity-40">
     <Wrench className="h-4 w-4"/> Encaminhar oxidação para Carlos N3
    </button>:<button type="button" disabled={!salvo||saving||ocupado||naoConforme} onClick={()=>onIniciar(ciclo)}
     className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white disabled:opacity-40">
     <Play className="h-4 w-4"/> Iniciar 2º ciclo
    </button>}
  </div>
 </section>;
}
