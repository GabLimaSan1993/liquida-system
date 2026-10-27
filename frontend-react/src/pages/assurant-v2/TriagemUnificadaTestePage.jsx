import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Camera, CheckCircle2, ClipboardCheck, FlaskConical, ScanLine, Search, ShieldAlert, Smartphone } from "lucide-react";
import { useAuth } from "../../AuthContext.jsx";
import { supabase } from "../../lib/supabase.js";
import { consultarVoucher, listarDefeitos, carregarCatalogo, resolverSku } from "../../services/triagemFuncionalService.js";
import { buscarOpcoes, calcularGradeFinal } from "../../services/cosmeticaService.js";
import { codigoCondicaoCompra } from "../../services/condicaoCompra.js";
import { tipoDoAparelho, exigeDoisImeis, erroIdentificacao } from "../../services/identificacaoAparelho.js";

const CAMPO = "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-violet-300 focus:ring-4 focus:ring-violet-100";
const BOTAO = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40";
const STEPS = ["Voucher", "Produto", "IMEI", "Câmeras e defeitos", "Cosmética", "Resultado"];
const PARTES = [{id:"tela",nome:"Tela"},{id:"laterais",nome:"Laterais"},{id:"traseira",nome:"Traseira"}];
const PILOT_USERS = new Set(["b517d70a-56be-4b4f-8b9e-a03c769dd3c3","490cfecb-4ba4-4670-9a53-5775c0b15bef","8549de55-3657-4042-86c6-822cd3d49941","6e0ac557-93a2-42ae-8595-12648b2ac0de"]);


const ICONES = [Search,Smartphone,ScanLine,Camera,ClipboardCheck,CheckCircle2];
function Progresso({etapa}){
 return <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
   <div className="flex min-w-[780px] items-center">{STEPS.map((nome,i)=>{
    const Icon=ICONES[i],feito=i<etapa,ativo=i===etapa;
    return <div key={nome} className="flex flex-1 items-center">
     <div className="flex items-center gap-2.5">
      <div className={"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition "+(feito?"bg-emerald-500 text-white":ativo?"bg-violet-700 text-white shadow-sm":"bg-slate-100 text-slate-400")}>
       {feito?<CheckCircle2 className="h-4 w-4"/>:<Icon className="h-4 w-4"/>}
      </div>
      <div><div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Etapa {i+1}</div>
      <div className={"mt-0.5 text-xs font-bold "+(feito?"text-emerald-700":ativo?"text-violet-700":"text-slate-400")}>{nome}</div></div>
     </div>
     {i<STEPS.length-1&&<div className={"mx-4 h-px flex-1 "+(feito?"bg-emerald-300":"bg-slate-200")}/>}
    </div>;
   })}</div>
 </div>;
}
function Painel({titulo,subtitulo,icone:Icon,children}){
 return <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
  <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4">
   <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700"><Icon className="h-[17px] w-[17px]"/></div>
   <div><h2 className="text-sm font-black text-slate-800">{titulo}</h2>
    <p className="mt-0.5 text-[11px] leading-4 text-slate-400">{subtitulo}</p></div>
  </div>
  <div className="space-y-5 p-5 lg:p-6">{children}</div>
 </section>;
}

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
  return <label className="block space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
    <span className="text-sm font-bold">{titulo} — foto obrigatória</span>

    <input type="file" accept="image/jpeg,image/png,image/webp" capture={titulo.toLowerCase().includes("frontal") ? "user" : "environment"} onChange={escolher} className={CAMPO}/>
    {valor?.preview&&<img src={valor.preview} alt={"Evidência "+titulo} className="h-40 w-full rounded-lg object-contain bg-slate-100"/>}
    {aviso&&<span className="block text-xs text-red-700">{aviso}</span>}
  </label>;
}

export default function TriagemUnificadaTestePage(){
 const {user}=useAuth();
 const [voucher,setVoucher]=useState(""),[ctx,setCtx]=useState(null);
 const [etapa,setEtapa]=useState(0),[busy,setBusy]=useState(false);
 const [erro,setErro]=useState(""),[resultado,setResultado]=useState(null);
 const [condicao,setCondicao]=useState("");
 const [produto,setProduto]=useState({marca:"",modelo:"",armazenamento:"",cor:""});
 const [catalogo,setCatalogo]=useState({produtos:[]});
 const [imei,setImei]=useState("");
 const [imei2,setImei2]=useState("");
 const [cameras,setCameras]=useState({frontal:null,traseira:null});
 const [telaSemFalhasOuDanos,setTelaSemFalhasOuDanos]=useState(null);
 const [botaoFaltando,setBotaoFaltando]=useState(null);
 const [fotos,setFotos]=useState({frontal:null,traseira:null});
 const [defeitos,setDefeitos]=useState([]),[catalogoDefeitos,setCatalogoDefeitos]=useState([]);
 const [buscaDefeito,setBuscaDefeito]=useState("");
 const [opcoes,setOpcoes]=useState({tela:[],laterais:[],traseira:[]});
 const [escolhas,setEscolhas]=useState({tela:"",laterais:"",traseira:""});
 const tipo=ctx?codigoCondicaoCompra(ctx.tradein?.condicao_aparelho,ctx.tradein?.condicao_sufixo):null;
 // Mesma origem e mesma seleção encadeada da triagem funcional atual.
 const marcas=useMemo(()=>[...new Set(catalogo.produtos.map(p=>p.marca))].filter(Boolean).sort(),[catalogo]);
 const modelos=useMemo(()=>[...new Set(catalogo.produtos.filter(p=>p.marca===produto.marca).map(p=>p.modelo))].filter(Boolean).sort(),[catalogo,produto.marca]);
 const capacidades=useMemo(()=>[...new Set(catalogo.produtos.filter(p=>p.marca===produto.marca&&p.modelo===produto.modelo).map(p=>p.capacidade))].filter(Boolean).sort(),[catalogo,produto.marca,produto.modelo]);
 const cores=useMemo(()=>[...new Set(catalogo.produtos.filter(p=>p.marca===produto.marca&&p.modelo===produto.modelo&&(p.capacidade||"")===produto.armazenamento).map(p=>p.cor))].filter(Boolean).sort(),[catalogo,produto.marca,produto.modelo,produto.armazenamento]);
 const sku=useMemo(()=>resolverSku(catalogo.produtos,{marca:produto.marca,modelo:produto.modelo,capacidade:produto.armazenamento,cor:produto.cor}),[catalogo,produto]);
 const produtoCompleto=Boolean(produto.marca&&produto.modelo&&produto.armazenamento&&produto.cor);
 const tipoCatalogo=catalogo.produtos.find(p=>p.modelo===produto.modelo&&p.marca===produto.marca)?.tipo;
 const tipoAparelho=tipoDoAparelho(produto.modelo,tipoCatalogo);
 const doisImeis=exigeDoisImeis(produto.modelo,tipoAparelho,condicao==="bloqueado",condicao==="danos_tela");
 const erroCodigo=erroIdentificacao(tipoAparelho,imei,doisImeis?imei2:null,
   {modelo:produto.modelo,aparelhoBloqueado:condicao==="bloqueado",danosTela:condicao==="danos_tela"});
 const defeitosEfetivos=useMemo(()=>[...new Set([
    ...defeitos,
    ...(telaSemFalhasOuDanos===false||condicao==="danos_tela"?["Danos da tela"]:[]),
    ...(botaoFaltando===true?["Botão faltando"]:[])
 ])],[defeitos,telaSemFalhasOuDanos,botaoFaltando,condicao]);
 const grade=useMemo(()=>escolhas.tela&&escolhas.laterais&&escolhas.traseira
  ? calcularGradeFinal({...escolhas,temDefeitoFuncional:cameras.frontal===false||cameras.traseira===false||defeitosEfetivos.length>0,bateria:ctx?.existente?.status_bateria})
  : null,[escolhas,cameras,defeitosEfetivos,ctx]);
 const validoFotos=!!fotos.frontal?.file&&!!fotos.traseira?.file;
 const falha=(e)=>setErro(e?.message||String(e));
 function reiniciar(){setVoucher("");setCtx(null);setEtapa(0);setErro("");setResultado(null);setCondicao("");setProduto({marca:"",modelo:"",armazenamento:"",cor:""});setImei("");setImei2("");setCameras({frontal:null,traseira:null});setTelaSemFalhasOuDanos(null);setBotaoFaltando(null);setFotos({frontal:null,traseira:null});setDefeitos([]);setBuscaDefeito("");setEscolhas({tela:"",laterais:"",traseira:""});}
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
   setCtx(r);setProduto({marca:"",modelo:"",armazenamento:"",cor:""});setCondicao("");setImei("");setImei2("");setEtapa(1);
   if(c==="TR"){
     const [d,o,catalogoAtual]=await Promise.all([listarDefeitos(),buscarOpcoes(),carregarCatalogo()]);
     setCatalogoDefeitos(d);setOpcoes(o);setCatalogo(catalogoAtual);
   }
  }catch(e){falha(e);}finally{setBusy(false);}
 }
 function avancarProduto(){
  setErro("");
  // Exatamente como a funcional atual: "Não liga" não exige o catálogo.
  if(condicao==="nao_liga"){setEtapa(5);return;}
  if(!produtoCompleto){setErro("Selecione marca, modelo, armazenamento e cor.");return;}
  setEtapa(2);
 }
 function avancarImei(){
  setErro("");
  if(erroCodigo){setErro(erroCodigo);return;}
  if(imei.trim()&&ctx.tradein?.imei && String(ctx.tradein.imei).trim()!==imei.trim()){
    setErro("O IMEI não confere com a compra. Utilize a tela de Divergências, sem concluir esta triagem.");return;
  }
  if(imei.trim()&&ctx.existente?.imei && String(ctx.existente.imei).trim()!==imei.trim()){
    setErro("IMEI diferente do recebimento. Regularize na tela de Divergências.");return;
  }
  setEtapa(condicao==="bloqueado"?5:3);
 }
 function avancarCamera(){
  setErro("");
  if(cameras.frontal===null||cameras.traseira===null||!validoFotos){setErro("Responda funcionamento e fotografe as duas câmeras.");return;}
  if(telaSemFalhasOuDanos===null||botaoFaltando===null){setErro("Responda às perguntas sobre tela e botões.");return;}
  if(condicao==="danos_tela"&&telaSemFalhasOuDanos===true){setErro("A condição inicial indica danos na tela. Revise a resposta sobre a tela.");return;}
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
  if(tipo!=="TR"||!PILOT_USERS.has(user?.id)){setErro("Somente TR na conta piloto pode usar este fechamento.");return;}
  if(!["nao_liga","bloqueado"].includes(condicao)&&(!grade||!validoFotos||cameras.frontal===null||cameras.traseira===null||telaSemFalhasOuDanos===null||botaoFaltando===null)){setErro("Complete os testes de câmera, tela, botões e cosmética.");return;}
  if(condicao==="danos_tela"&&telaSemFalhasOuDanos===true){setErro("A condição inicial registra danos na tela. Revise a resposta.");return;}
  if(condicao!=="nao_liga"&&erroCodigo){setErro(erroCodigo);return;}
  if(!window.confirm("Confirmar a triagem de TESTE no banco operacional? O status do voucher será atualizado."))return;
  setBusy(true);
  try{
   const paths=!["nao_liga","bloqueado"].includes(condicao)?await enviarFotos():{};
   const dados={voucher:ctx.voucher,
     marca:produto.marca,modelo:produto.modelo,capacidade:produto.armazenamento,cor:produto.cor,
     sku:sku.sku,imei:imei.trim()||null,imei2:doisImeis?imei2.trim()||null:null,condicao:condicao||"normal",
     camera_frontal_funciona:cameras.frontal,camera_traseira_funciona:cameras.traseira,
     foto_frontal_path:paths.frontal||null,foto_traseira_path:paths.traseira||null,
     tela_sem_falhas_ou_danos:telaSemFalhasOuDanos,botao_faltando:botaoFaltando,
     defeitos:defeitosEfetivos,
     tela:escolhas.tela,laterais:escolhas.laterais,traseira:escolhas.traseira};
   const {data,error}=await supabase.rpc("assurant_triagem_unificada_tr_teste",{p_dados:dados});
   if(error)throw Error(error.message);
   if(!data?.ok)throw Error(data?.erro||"Falha ao concluir.");
   setResultado(data);setEtapa(5);
  }catch(e){falha(e);}finally{setBusy(false);}
 }
 if(!PILOT_USERS.has(user?.id))return <p className="p-6">Tela restrita aos quatro integrantes autorizados para o piloto.</p>;
 return <div className="mx-auto max-w-[1680px] space-y-5">
  <div className="space-y-3">
  <div className="flex flex-wrap items-center gap-2">
   <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Assurant Warehouse</span>
   <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Triagens</span>
   <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-slate-500"><FlaskConical className="h-3.5 w-3.5"/> Teste</span>
  </div>
  <div className="flex items-start gap-3">
   <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><ScanLine className="h-5 w-5"/></div>
   <div><h1 className="text-2xl font-black tracking-tight text-slate-900 lg:text-[30px]">Triagem Unificada — TR / BM</h1>
    
   </div>
  </div>
 </div>
 <Progresso etapa={etapa}/>

 {erro&&<div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800"><AlertTriangle className="h-4 w-4 shrink-0"/>{erro}</div>}
  {etapa>0&&<div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-xs text-slate-500 shadow-sm"><span className="font-mono font-black text-violet-700">{ctx?.voucher}</span><span>Condição: <b className="text-slate-800">{tipo}</b></span><span>Status: <b className="text-slate-800">{ctx?.existente?.status_atual||"—"}</b></span></div>}
  {etapa===0&&<form onSubmit={consultar}><Painel titulo="Identificação por voucher" subtitulo="" icone={Search}>
    
    <label className="block space-y-2 text-sm font-bold">Voucher<input required className={CAMPO} value={voucher} onChange={e=>setVoucher(e.target.value.toUpperCase())} placeholder="YBV..."/></label>
    <button className={BOTAO} disabled={busy||!voucher.trim()}>{busy?"Consultando...":"Consultar e identificar BM/TR"}</button>
  </Painel></form>}
  {etapa===1&&<Painel titulo="Identificação física do produto" subtitulo="" icone={Smartphone}>
    
    {tipo==="BM"?<div className="flex flex-wrap gap-3">
       <Link className={BOTAO} to="/v2/assurant/triagens/funcional">Triagem Funcional</Link>
       <Link className={BOTAO} to="/v2/assurant/triagens/cosmetica">Triagem Cosmética</Link>
      </div>:<>
      <label className="block space-y-2 text-xs font-bold text-slate-700">Condição inicial do aparelho
       <select className={CAMPO} value={condicao} onChange={e=>{setCondicao(e.target.value);setImei("");setImei2("");setDefeitos(v=>e.target.value==="danos_tela"?[...new Set([...v,"Danos da tela"])]:v.filter(x=>x!=="Danos da tela"));}}>
        <option value="">Sem ocorrência</option>
        <option value="nao_liga">Produto não liga</option>
        <option value="bloqueado">Bloqueado</option>
        <option value="danos_tela">Danos da tela</option>
       </select>
      </label>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
       <label className="block space-y-2 text-xs font-bold text-slate-700">Marca
        <input list="unificada-tr-marcas" className={CAMPO} value={produto.marca}
         onChange={e=>setProduto({marca:e.target.value.toUpperCase(),modelo:"",armazenamento:"",cor:""})} placeholder="Pesquise ou digite a marca"/>
        <datalist id="unificada-tr-marcas">{marcas.map(v=><option key={v} value={v}/>)}</datalist>
       </label>
       <label className="block space-y-2 text-xs font-bold text-slate-700">Modelo
        <input list="unificada-tr-modelos" className={CAMPO} value={produto.modelo}
         disabled={!produto.marca} onChange={e=>setProduto(v=>({...v,modelo:e.target.value.toUpperCase(),armazenamento:"",cor:""}))}
         placeholder={produto.marca?"Pesquise ou digite o modelo":"Informe a marca primeiro"}/>
        <datalist id="unificada-tr-modelos">{modelos.map(v=><option key={v} value={v}/>)}</datalist>
       </label>
       <label className="block space-y-2 text-xs font-bold text-slate-700">Armazenamento
        <input list="unificada-tr-capacidades" className={CAMPO} value={produto.armazenamento} disabled={!produto.modelo}
         onChange={e=>setProduto(v=>({...v,armazenamento:e.target.value.toUpperCase(),cor:""}))}
         placeholder={produto.modelo?"Ex: 128GB":"Informe o modelo primeiro"}/>
        <datalist id="unificada-tr-capacidades">{capacidades.map(v=><option key={v} value={v}/>)}</datalist>
       </label>
       <label className="block space-y-2 text-xs font-bold text-slate-700">Cor
        <input list="unificada-tr-cores" className={CAMPO} value={produto.cor} disabled={!produto.modelo}
         onChange={e=>setProduto(v=>({...v,cor:e.target.value.toUpperCase()}))}
         placeholder={produto.modelo?"Pesquise ou digite a cor":"Informe o modelo primeiro"}/>
        <datalist id="unificada-tr-cores">{cores.map(v=><option key={v} value={v}/>)}</datalist>
       </label>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-100 pt-4">
       <button type="button" className={BOTAO} onClick={avancarProduto} disabled={busy||(condicao!=="nao_liga"&&!produtoCompleto)}>
        {condicao==="nao_liga"?"Encaminhar para laudo":"Salvar e continuar"}
       </button>
      </div>
      </>}
  </Painel>}
  {etapa===2&&<Painel titulo="Conferência do IMEI" subtitulo="" icone={ScanLine}>
    

    <div className="max-w-[760px] space-y-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
      <label className="block space-y-2 text-xs font-bold text-slate-700">{tipoAparelho==="CELULAR"?(condicao==="danos_tela"?"IMEI (opcional)":"IMEI 1"):"Referência / serial"}
        <input autoFocus type="text" inputMode={tipoAparelho==="CELULAR"?"numeric":"text"}
         autoComplete="off" spellCheck={false} maxLength={tipoAparelho==="CELULAR"?15:64}
         className={CAMPO} placeholder={tipoAparelho==="CELULAR"?"Bipe o IMEI 1":"Bipe a referência / serial"}
         value={imei} onChange={e=>setImei(tipoAparelho==="CELULAR"?e.target.value.replace(/\D/g,""):e.target.value.trim())}
         onKeyDown={e=>{if(e.key==="Enter"&&doisImeis){e.preventDefault();document.getElementById("unificada-imei2")?.focus();}}}
        />
      </label>
      {doisImeis&&<label className="block space-y-2 text-xs font-bold text-slate-700">IMEI 2
        <input id="unificada-imei2" type="text" inputMode="numeric" autoComplete="off" spellCheck={false}
          maxLength={15} className={CAMPO} placeholder="Bipe o IMEI 2" value={imei2}
          onChange={e=>setImei2(e.target.value.replace(/\D/g,""))}/>
      </label>}
      {erroCodigo&&(imei||imei2)&&<p role="alert" className="text-xs font-bold text-rose-700">{erroCodigo}</p>}
    </div>
    <div className="flex gap-3"><button type="button" className={BOTAO} disabled={!!erroCodigo} onClick={avancarImei}>Validar identificação</button><button type="button" onClick={()=>setEtapa(1)} className={CAMPO}>Voltar</button></div>
  </Painel>}
  {etapa===3&&<Painel titulo="Câmeras e defeitos adicionais" subtitulo="" icone={Camera}>
    
 
    <div className="grid gap-4 md:grid-cols-2">{[["frontal","Câmera frontal"],["traseira","Câmera traseira"]].map(([k,nome])=><div key={k} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <h3 className="font-bold">{nome} funciona?</h3>
      <div className="flex gap-3">{[[true,"Sim"],[false,"Não"]].map(([ok,rot])=><button key={rot} type="button" onClick={()=>setCameras(v=>({...v,[k]:ok}))} className={"rounded-lg border px-5 py-2 text-sm "+(cameras[k]===ok?"bg-violet-700 text-white":"bg-white")}>{rot}</button>)}</div>
      <FotoCamera titulo={nome} valor={fotos[k]} onChange={f=>setFotos(v=>({...v,[k]:f}))}/>
    </div>)}</div>
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <h3 className="text-sm font-bold text-slate-800">O aparelho está sem falhas ou danos na tela?</h3>
        <div className="mt-3 flex gap-3">{[[true,"Sim"],[false,"Não"]].map(([valor,rotulo])=>
          <button type="button" key={rotulo} aria-pressed={telaSemFalhasOuDanos===valor}
           onClick={()=>setTelaSemFalhasOuDanos(valor)}
           className={"rounded-lg border px-5 py-2 text-sm font-semibold transition "+(telaSemFalhasOuDanos===valor?"border-violet-700 bg-violet-700 text-white":"border-slate-200 bg-white text-slate-700 hover:border-violet-200")}>
            {rotulo}
          </button>)}</div>
      </div>
      <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
        <h3 className="text-sm font-bold text-slate-800">O aparelho está com algum botão faltando?</h3>
        <div className="mt-3 flex gap-3">{[[true,"Sim"],[false,"Não"]].map(([valor,rotulo])=>
          <button type="button" key={rotulo} aria-pressed={botaoFaltando===valor}
           onClick={()=>setBotaoFaltando(valor)}
           className={"rounded-lg border px-5 py-2 text-sm font-semibold transition "+(botaoFaltando===valor?"border-violet-700 bg-violet-700 text-white":"border-slate-200 bg-white text-slate-700 hover:border-violet-200")}>
            {rotulo}
          </button>)}</div>
      </div>
    </div>
    <h3 className="font-bold">Defeitos adicionais — catálogo da funcional</h3>
    <input className={CAMPO} value={buscaDefeito} onChange={e=>setBuscaDefeito(e.target.value)} placeholder="Pesquisar defeitos"/>
    <div className="flex max-h-52 flex-wrap gap-2 overflow-auto">{catalogoDefeitos.filter(d=>d.nome.toLowerCase().includes(buscaDefeito.toLowerCase())).map(d=><button type="button" key={d.id} onClick={()=>alternarDefeito(d.nome)} className={"rounded-lg border px-3 py-2 text-xs font-semibold "+(defeitos.includes(d.nome)?"bg-violet-700 text-white":"bg-white text-slate-700")}>{d.nome}</button>)}</div>
    <div className="text-xs font-semibold text-slate-500">Defeitos registrados: {defeitosEfetivos.length}</div>
    <button type="button" className={BOTAO} onClick={avancarCamera}>Prosseguir para cosmética</button>
  </Painel>}
  {etapa===4&&<Painel titulo="Avaliação cosmética" subtitulo="" icone={ClipboardCheck}>
    
    {PARTES.map(p=><div key={p.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
      <h3 className="font-bold">{p.nome}</h3>
      <div className="grid gap-2 sm:grid-cols-2">{(opcoes[p.id]||[]).map(o=><button type="button" key={o.id} onClick={()=>setEscolhas(v=>({...v,[p.id]:o.grade}))} className={"rounded-xl border p-3 text-left text-sm "+(escolhas[p.id]===o.grade?"border-violet-700 bg-violet-50":"border-slate-200")}>
        <b>{o.grade}</b><span className="mt-1 block whitespace-pre-line text-xs text-slate-500">{o.descricao}</span>
      </button>)}</div>
    </div>)}
    {grade&&<div className="rounded-xl bg-violet-50 p-4 text-sm"><b>Grade final:</b> {grade.grade} · <b>Estética:</b> {grade.gradeCosmetica}{grade.motivo&&<p className="mt-1">{grade.motivo}</p>}</div>}
    <button type="button" className={BOTAO} disabled={!grade||busy} onClick={concluir}>{busy?"Salvando...":"Concluir TR → Aguardando armazenagem"}</button>
  </Painel>}
  {etapa===5&&<Painel titulo="Resultado e encaminhamento" subtitulo="" icone={CheckCircle2}>
    
    {resultado?<div className="rounded-xl bg-emerald-50 p-4 text-sm"><p><b>Destino:</b> {resultado.status}</p><p><b>Grade:</b> {resultado.grade||"Não se aplica"}</p><p><b>Voucher:</b> {resultado.voucher}</p></div>:<div className="space-y-3"><p className="text-sm">Condição informada: <b>{condicao==="nao_liga"?"Não liga":"Bloqueado"}</b>. O aparelho seguirá para <b>Aguardando laudo</b>, sem avaliação cosmética.</p>
     <label className="block space-y-2 text-sm">IMEI físico (quando disponível)<input className={CAMPO} value={imei} onChange={e=>setImei(e.target.value.replace(/\D/g,""))} placeholder="IMEI, opcional quando não liga"/></label>
     <button className={BOTAO} disabled={busy} onClick={concluir}>{busy?"Encaminhando...":"Confirmar encaminhamento para laudo"}</button></div>}
    {resultado&&<button className={BOTAO} onClick={reiniciar}>Triar outro voucher</button>}
  </Painel>}
  {etapa!==0&&etapa!==5&&<div className="flex justify-end"><button className="rounded-lg border px-4 py-2 text-xs font-bold" onClick={reiniciar}>Cancelar e iniciar outro voucher</button></div>}
 </div>;
}
