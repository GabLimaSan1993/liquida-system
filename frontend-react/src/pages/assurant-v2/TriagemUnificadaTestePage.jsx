import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../AuthContext.jsx";
import { supabase } from "../../lib/supabase.js";
import { consultarVoucher, listarDefeitos } from "../../services/triagemFuncionalService.js";
import { buscarOpcoes, calcularGradeFinal } from "../../services/cosmeticaService.js";
import { codigoCondicaoCompra } from "../../services/condicaoCompra.js";

const CAMPO = "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none focus:border-violet-400";
const BOTAO = "rounded-xl bg-violet-700 px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40";
const STEPS = ["Voucher", "Produto", "IMEI", "Câmeras e defeitos", "Cosmética", "Resultado"];
const PARTES = [{id:"tela",nome:"Tela"},{id:"laterais",nome:"Laterais"},{id:"traseira",nome:"Traseira"}];
const OWNER = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";

function FotoCamera({titulo,valor,onChange}){
  const [aviso,setAviso]=useState("");
  function escolher(e){
    const file=e.target.files?.[0];
    setAviso("");
    if(!file){onChange(null);return;}
    if(!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>5*1024*1024 || !file.size){
      setAviso("Use JPG, PNG ou WebP até 5 MB.");onChange(null);return;
    }
    const reader=new FileReader();
    reader.onload=()=>onChange({file,preview:reader.result});
    reader.onerror=()=>setAviso("Não foi possível ler a imagem.");
    reader.readAsDataURL(file);
  }
  return <label className="block space-y-2 rounded-xl border border-slate-200 p-4">
    <span className="text-sm font-bold">{titulo} — foto obrigatória</span>
    <span className="block text-xs text-slate-500">Tire uma foto de teste com a câmera indicada e confira o resultado.</span>
    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={escolher} className={CAMPO}/>
    {valor?.preview&&<img src={valor.preview} alt={"Evidência "+titulo} className="h-40 w-full rounded-lg object-contain bg-slate-100"/>}
    {aviso&&<span className="block text-xs text-red-700">{aviso}</span>}
  </label>;
}

export default function TriagemUnificadaTestePage(){
 const {user}=useAuth();
 const [voucher,setVoucher]=useState(""),[ctx,setCtx]=useState(null);
 const [etapa,setEtapa]=useState(0),[busy,setBusy]=useState(false);
 const [erro,setErro]=useState(""),[resultado,setResultado]=useState(null);
 const [condicao,setCondicao]=useState("normal"),[modelo,setModelo]=useState("");
 const [imei,setImei]=useState("");
 const [cameras,setCameras]=useState({frontal:null,traseira:null});
 const [fotos,setFotos]=useState({frontal:null,traseira:null});
 const [defeitos,setDefeitos]=useState([]),[catalogoDefeitos,setCatalogoDefeitos]=useState([]);
 const [buscaDefeito,setBuscaDefeito]=useState("");
 const [opcoes,setOpcoes]=useState({tela:[],laterais:[],traseira:[]});
 const [escolhas,setEscolhas]=useState({tela:"",laterais:"",traseira:""});
 const tipo=ctx?codigoCondicaoCompra(ctx.tradein?.condicao_aparelho,ctx.tradein?.condicao_sufixo):null;
 const grade=useMemo(()=>escolhas.tela&&escolhas.laterais&&escolhas.traseira
  ? calcularGradeFinal({...escolhas,temDefeitoFuncional:cameras.frontal===false||cameras.traseira===false||defeitos.length>0,bateria:ctx?.existente?.status_bateria})
  : null,[escolhas,cameras,defeitos,ctx]);
 const validoFotos=!!fotos.frontal?.file&&!!fotos.traseira?.file;
 const falha=(e)=>setErro(e?.message||String(e));
 function reiniciar(){setVoucher("");setCtx(null);setEtapa(0);setErro("");setResultado(null);setCondicao("normal");setModelo("");setImei("");setCameras({frontal:null,traseira:null});setFotos({frontal:null,traseira:null});setDefeitos([]);setBuscaDefeito("");setEscolhas({tela:"",laterais:"",traseira:""});}
 async function consultar(e){
  e.preventDefault();setErro("");setBusy(true);
  try{
   const r=await consultarVoucher(voucher);
   if(!r.ok)throw Error(r.erro||"Não foi possível consultar o voucher");
   if(r.divergencia)throw Error("Voucher com divergência ou ordem ausente. Resolva na tela de Divergências.");
   if(r.bloqueado||r.jaTriado)throw Error("Voucher já triado: não é permitido sobrescrever o histórico.");
   if(!r.tradein)throw Error("Piloto liberado apenas para vouchers YBV com referência TradeIn.");
   const c=codigoCondicaoCompra(r.tradein.condicao_aparelho,r.tradein.condicao_sufixo);
   if(!["TR","BM"].includes(c))throw Error("Condição de compra não identificada. Não é permitido escolher BM/TR manualmente.");
   setCtx(r);setModelo("");setImei("");setEtapa(1);
   if(c==="TR"){
     const [d,o]=await Promise.all([listarDefeitos(),buscarOpcoes()]);
     setCatalogoDefeitos(d);setOpcoes(o);
   }
  }catch(e){falha(e);}finally{setBusy(false);}
 }
 function avancarProduto(){
  setErro("");
  if(modelo.trim().length<3){setErro("Informe o modelo verificado fisicamente.");return;}
  if(condicao!=="normal"){setEtapa(5);return;}
  setEtapa(2);
 }
 function avancarImei(){
  setErro("");
  if(!/^[0-9]{14,16}$/.test(imei.trim())){setErro("Bipe um IMEI válido de 14 a 16 dígitos.");return;}
  if(ctx.tradein?.imei && String(ctx.tradein.imei).trim()!==imei.trim()){
    setErro("O IMEI não confere com a compra. Utilize a tela de Divergências, sem concluir esta triagem.");return;
  }
  if(ctx.existente?.imei && String(ctx.existente.imei).trim()!==imei.trim()){
    setErro("IMEI diferente do recebimento. Regularize na tela de Divergências.");return;
  }
  setEtapa(3);
 }
 function avancarCamera(){
  setErro("");
  if(cameras.frontal===null||cameras.traseira===null||!validoFotos){setErro("Responda funcionamento e fotografe as duas câmeras.");return;}
  setEtapa(4);
 }
 function alternarDefeito(nome){setDefeitos(v=>v.includes(nome)?v.filter(x=>x!==nome):[...v,nome]);}
 async function enviarFotos(){
   const paths={};
   for(const lado of ["frontal","traseira"]){
    const f=fotos[lado]?.file;
    if(!f)throw Error("Fotos obrigatórias ausentes.");
    const ext=f.type==="image/png"?"png":f.type==="image/webp"?"webp":"jpg";
    const path=user.id+"/"+crypto.randomUUID()+"_"+lado+"."+ext;
    const {error}=await supabase.storage.from("triagem-tr-teste").upload(path,f,{contentType:f.type,upsert:false});
    if(error)throw Error("Upload "+lado+": "+error.message);
    paths[lado]=path;
   }
   return paths;
 }
 async function concluir(){
  setErro("");
  if(tipo!=="TR"||user?.id!==OWNER){setErro("Somente TR na conta piloto pode usar este fechamento.");return;}
  if(condicao==="normal"&&(!grade||!validoFotos||cameras.frontal===null||cameras.traseira===null)){setErro("Complete testes de câmera e as três perguntas cosméticas.");return;}
  if(condicao==="normal"&&!/^[0-9]{14,16}$/.test(imei)){setErro("IMEI físico obrigatório.");return;}
  if(!window.confirm("Confirmar a triagem de TESTE no banco operacional? O status do voucher será atualizado."))return;
  setBusy(true);
  try{
   const paths=condicao==="normal"?await enviarFotos():{};
   const dados={voucher:ctx.voucher,modelo:modelo.trim(),imei:imei.trim()||null,condicao,
     camera_frontal_funciona:cameras.frontal,camera_traseira_funciona:cameras.traseira,
     foto_frontal_path:paths.frontal||null,foto_traseira_path:paths.traseira||null,
     defeitos,tela:escolhas.tela,laterais:escolhas.laterais,traseira:escolhas.traseira};
   const {data,error}=await supabase.rpc("assurant_triagem_unificada_tr_teste",{p_dados:dados});
   if(error)throw Error(error.message);
   if(!data?.ok)throw Error(data?.erro||"Falha ao concluir.");
   setResultado(data);setEtapa(5);
  }catch(e){falha(e);}finally{setBusy(false);}
 }
 if(user?.id!==OWNER)return <p className="p-6">Tela restrita ao responsável pelo piloto.</p>;
 return <div className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
  <header className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
    <div className="text-xs font-black uppercase tracking-wide text-violet-700">Assurant · Laboratório restrito</div>
    <h1 className="mt-2 text-2xl font-black text-slate-900">Triagem unificada — TR / BM</h1>
    <p className="mt-2 text-sm text-slate-600">TR: Voucher → Produto → IMEI → Câmeras + defeitos → Tela/Laterais/Traseira → Armazenagem. Não liga ou bloqueado: Laudo. BM: processo funcional e cosmético separados, sem mudanças.</p>
    <p className="mt-2 text-xs font-bold text-amber-800">Piloto com gravação real somente para a sua conta. Use um voucher TR liberado para testes e confira antes de concluir.</p>
  </header>
  <div className="flex flex-wrap gap-2">{STEPS.map((nome,i)=><div key={nome} className={"rounded-lg px-3 py-2 text-xs font-bold "+(etapa===i?"bg-violet-700 text-white":"bg-slate-100 text-slate-600")}>{i+1}. {nome}</div>)}</div>
  {erro&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">{erro}</div>}
  {etapa>0&&<div className="rounded-xl border bg-white p-4 text-sm"><b>Voucher:</b> {ctx?.voucher} · <b>Compra:</b> {tipo} · <b>Registro:</b> {ctx?.existente?.status_atual||"—"}</div>}
  {etapa===0&&<form onSubmit={consultar} className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">1. Identificação por voucher</h2>
    <label className="block space-y-2 text-sm font-bold">Voucher<input required className={CAMPO} value={voucher} onChange={e=>setVoucher(e.target.value.toUpperCase())} placeholder="YBV..."/></label>
    <button className={BOTAO} disabled={busy||!voucher.trim()}>{busy?"Consultando...":"Consultar e identificar BM/TR"}</button>
  </form>}
  {etapa===1&&<section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">2. Identificação física do produto</h2>
    {tipo==="BM"?<div className="space-y-4"><div className="rounded-xl bg-sky-50 p-4 text-sm text-sky-900">Compra BM: mantenha as duas triagens já utilizadas. A tela piloto não movimenta este voucher.</div>
      <div className="flex flex-wrap gap-3"><Link className={BOTAO} to="/v2/assurant/triagens/funcional">Abrir triagem funcional BM</Link><Link className={BOTAO} to="/v2/assurant/triagens/cosmetica">Abrir triagem cosmética BM</Link></div></div>
      :<><label className="block space-y-2 text-sm font-bold">Modelo observado fisicamente<input value={modelo} onChange={e=>setModelo(e.target.value)} className={CAMPO} placeholder="Marca e modelo do aparelho"/></label>
      <div className="space-y-2"><div className="text-sm font-bold">Condição inicial — verificação física</div>
       {[["normal","Liga e está desbloqueado"],["nao_liga","Não liga → Laudo"],["bloqueado","Bloqueado → Laudo"]].map(([valor,nome])=><label key={valor} className="flex items-center gap-3 rounded-xl border p-3"><input type="radio" checked={condicao===valor} onChange={()=>setCondicao(valor)}/>{nome}</label>)}
      </div><button type="button" className={BOTAO} onClick={avancarProduto}>Continuar</button></>}
  </section>}
  {etapa===2&&<section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">3. Conferência do IMEI</h2>
    <p className="text-sm text-slate-500">O IMEI deve ser obtido fisicamente do aparelho; divergências são tratadas na tela atual.</p>
    <input autoFocus inputMode="numeric" className={CAMPO} placeholder="Bipe o IMEI" value={imei} onChange={e=>setImei(e.target.value.replace(/\D/g,""))}/>
    <div className="flex gap-3"><button type="button" className={BOTAO} onClick={avancarImei}>Conferir e continuar</button><button type="button" onClick={()=>setEtapa(1)} className={CAMPO}>Voltar</button></div>
  </section>}
  {etapa===3&&<section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">4. Testes guiados de câmeras e defeitos adicionais</h2>
    <p className="text-sm text-slate-500">Teste as câmeras do telefone. É necessário fotografar evidências das duas, inclusive em caso de falha.</p>
    <div className="grid gap-4 md:grid-cols-2">{[["frontal","Câmera frontal"],["traseira","Câmera traseira"]].map(([k,nome])=><div key={k} className="space-y-3 rounded-xl border p-3">
      <h3 className="font-bold">{nome} funciona?</h3>
      <div className="flex gap-3">{[[true,"Sim"],[false,"Não"]].map(([ok,rot])=><button key={rot} type="button" onClick={()=>setCameras(v=>({...v,[k]:ok}))} className={"rounded-lg border px-5 py-2 text-sm "+(cameras[k]===ok?"bg-violet-700 text-white":"bg-white")}>{rot}</button>)}</div>
      <FotoCamera titulo={nome} valor={fotos[k]} onChange={f=>setFotos(v=>({...v,[k]:f}))}/>
    </div>)}</div>
    <h3 className="font-bold">Defeitos adicionais — catálogo da funcional</h3>
    <input className={CAMPO} value={buscaDefeito} onChange={e=>setBuscaDefeito(e.target.value)} placeholder="Pesquisar defeitos"/>
    <div className="flex max-h-52 flex-wrap gap-2 overflow-auto">{catalogoDefeitos.filter(d=>d.nome.toLowerCase().includes(buscaDefeito.toLowerCase())).map(d=><button type="button" key={d.id} onClick={()=>alternarDefeito(d.nome)} className={"rounded-lg border px-3 py-2 text-xs font-semibold "+(defeitos.includes(d.nome)?"bg-violet-700 text-white":"bg-white text-slate-700")}>{d.nome}</button>)}</div>
    <div className="text-sm">Selecionados: <b>{defeitos.length}</b> · Falha de câmera ou defeito adicional determina grade QUEBRADO.</div>
    <button type="button" className={BOTAO} onClick={avancarCamera}>Prosseguir para cosmética</button>
  </section>}
  {etapa===4&&<section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">5. As três perguntas cosméticas existentes</h2>
    {PARTES.map(p=><div key={p.id} className="space-y-3 rounded-xl border p-4">
      <h3 className="font-bold">{p.nome}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{(opcoes[p.id]||[]).map(o=><button type="button" key={o.id} onClick={()=>setEscolhas(v=>({...v,[p.id]:o.grade}))} className={"rounded-xl border p-3 text-left text-sm "+(escolhas[p.id]===o.grade?"border-violet-700 bg-violet-50":"border-slate-200")}>
        <b>{o.grade}</b><span className="mt-1 block whitespace-pre-line text-xs text-slate-500">{o.descricao}</span>
      </button>)}</div>
    </div>)}
    {grade&&<div className="rounded-xl bg-violet-50 p-4 text-sm"><b>Grade final:</b> {grade.grade} · <b>Estética:</b> {grade.gradeCosmetica}{grade.motivo&&<p className="mt-1">{grade.motivo}</p>}</div>}
    <button type="button" className={BOTAO} disabled={!grade||busy} onClick={concluir}>{busy?"Salvando...":"Concluir TR → Aguardando armazenagem"}</button>
  </section>}
  {etapa===5&&<section className="space-y-4 rounded-2xl border bg-white p-5">
    <h2 className="text-lg font-black">{resultado?"Triagem gravada":"Encaminhamento direto para laudo"}</h2>
    {resultado?<div className="rounded-xl bg-emerald-50 p-4 text-sm"><p><b>Destino:</b> {resultado.status}</p><p><b>Grade:</b> {resultado.grade||"Não se aplica"}</p><p><b>Voucher:</b> {resultado.voucher}</p></div>:<div className="space-y-3"><p className="text-sm">Condição informada: <b>{condicao==="nao_liga"?"Não liga":"Bloqueado"}</b>. O aparelho seguirá para <b>Aguardando laudo</b>, sem avaliação cosmética.</p>
     <label className="block space-y-2 text-sm">IMEI físico (quando disponível)<input className={CAMPO} value={imei} onChange={e=>setImei(e.target.value.replace(/\D/g,""))} placeholder="IMEI, opcional quando não liga"/></label>
     <button className={BOTAO} disabled={busy} onClick={concluir}>{busy?"Encaminhando...":"Confirmar encaminhamento para laudo"}</button></div>}
    {resultado&&<button className={BOTAO} onClick={reiniciar}>Triar outro voucher</button>}
  </section>}
  {etapa!==0&&etapa!==5&&<div className="flex justify-end"><button className="rounded-lg border px-4 py-2 text-xs font-bold" onClick={reiniciar}>Cancelar e iniciar outro voucher</button></div>}
 </div>;
}
