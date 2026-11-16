import {useCallback,useEffect,useMemo,useState} from "react";
import {
 AlertCircle,ArrowLeftRight,CalendarDays,Check,
 Loader2,MapPinned,PackagePlus,RefreshCw,Search,
 Trash2,Warehouse,X
} from "lucide-react";
import {supabase} from "../../lib/supabase.js";
import {useAuth} from "../../AuthContext.jsx";

const TRIAGEM=Array.from({length:20},(_,i)=>String(i+1).padStart(2,"0"));
const COLUNAS=["A","B","C"];
const hojeSP=()=>{
 const p=new Intl.DateTimeFormat("en-CA",{
  year:"numeric",month:"2-digit",day:"2-digit",timeZone:"America/Sao_Paulo"
 }).formatToParts(new Date());
 const f=k=>p.find(x=>x.type===k)?.value;
 return [f("year"),f("month"),f("day")].join("-");
};
const num=n=>Number(n||0).toLocaleString("pt-BR");
const dataBR=d=>d?new Intl.DateTimeFormat("pt-BR",{
 dateStyle:"short",timeStyle:"short",timeZone:"America/Sao_Paulo"
}).format(new Date(d)):"—";
const tempoDecorrido=d=>{
 if(!d)return "—";
 const diff=Date.now()-new Date(d).getTime();
 if(diff<0)return "—";
 const horas=Math.floor(diff/3600000);
 return horas>=24?Math.floor(horas/24)+"d "+(horas%24)+"h":
   horas>=1?horas+"h "+Math.floor((diff%3600000)/60000)+"min":
   Math.max(0,Math.floor(diff/60000))+"min";
};
function nivelStatus(item){
 if(!item?.os_id)return "vazio";
 if(Number(item.ocupantes||0)>1)return "conflito";
 const s=(item.status||item.status_atual||"").toLocaleLowerCase("pt-BR");
 if(/erro|bloqueado|parad|reprovad|diverg/.test(s))return "erro";
 if(/aguard|pausad|penden/.test(s))return "aguarda";
 if(/conclui|aprov|liberad/.test(s))return "concluido";
 return "ocupado";
}
const TONALIDADE={
 vazio:"border-slate-200 bg-white text-slate-600 hover:border-violet-300",
 ocupado:"border-blue-200 bg-blue-50 text-blue-950 hover:border-blue-400",
 aguarda:"border-amber-200 bg-amber-50 text-amber-950 hover:border-amber-400",
 erro:"border-rose-300 bg-rose-50 text-rose-950 hover:border-rose-500",
 concluido:"border-emerald-200 bg-emerald-50 text-emerald-950 hover:border-emerald-400",
 conflito:"border-red-400 bg-red-100 text-red-950 hover:border-red-600"
};
function Posicao({item,codigo,tipo,selecionar,modo,exibirVazias,busca,tecnico}){
 const estado=nivelStatus(item);
 const ativo=!!item?.os_id;
 const visivel=exibirVazias||ativo;
 const buscaOk=!busca||[codigo,item?.numero_os,item?.modelo,item?.marca]
 .some(v=>String(v||"").toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR")));
 const tecnicoOk=!tecnico||String(item?.responsavel||"")===tecnico;
 return <button type="button" title={tipo==="triagem"?"Posto "+codigo:"Endereço "+codigo}
  onClick={()=>selecionar({tipo,codigo,item})}
  aria-label={(tipo==="triagem"?"Posto ":"Estoque ")+codigo+
    (ativo?", OS "+item.numero_os:", vazio")}
  className={"group block w-full min-w-0 rounded-xl border p-2.5 text-left transition "+
    (tipo==="triagem"?"min-h-[88px]":"min-h-[60px]")+
    " "+TONALIDADE[estado]+
    (!visivel?" invisible pointer-events-none":(!buscaOk||!tecnicoOk)?" opacity-30":"")}>
  <div className="flex items-center justify-between gap-1">
   <strong className="font-mono text-[11px] font-black tracking-wide">{codigo}</strong>
   <span className="rounded-md bg-white/75 px-1.5 py-0.5 text-[9px] font-bold" title="OS distintas que passaram na data selecionada">
    {num(item?.passaram_hoje)} / dia
   </span>
  </div>
  {ativo?<div className="mt-1.5 min-w-0">
   <p className="truncate text-[11px] font-black">OS {item.numero_os}</p>
   <p className="mt-0.5 truncate text-[10px] opacity-80">{modo==="modelo"?(item.modelo||"Modelo não informado"):(item.status_atual||item.status||"Em operação")}</p>
   {Number(item.ocupantes||0)>1&&<p className="mt-1 truncate text-[9px] font-bold text-red-700">Conferir ocupação</p>}
  </div>:
  <p className="mt-2 text-[10px] font-semibold opacity-65">Livre</p>}
 </button>;
}
function Indicador({rotulo,valor,descricao}){
 return <div className="rounded-xl border border-slate-200 bg-white p-3.5">
  <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{rotulo}</p>
  <p className="mt-1 text-2xl font-black tabular-nums text-slate-900">{num(valor)}</p>
  <p className="mt-1 text-[11px] text-slate-500">{descricao}</p>
 </div>;
}
function DetalhePosicao({selecionada,mapa,onFechar,onAlterar,editavel}){
 const {item,tipo,codigo}=selecionada;
 const livre=!item?.os_id;
 const [historico,setHistorico]=useState([]),[historicoErro,setHistoricoErro]=useState("");
 const [busca,setBusca]=useState(""),[resultados,setResultados]=useState([]);
 const [pesquisando,setPesquisando]=useState(false),[osEscolhida,setOsEscolhida]=useState(null);
 const [destino,setDestino]=useState(""),[observacao,setObservacao]=useState("");
 const [executando,setExecutando]=useState(false),[erro,setErro]=useState("");
 const [confirmarRetirada,setConfirmarRetirada]=useState(false);
 useEffect(()=>{
  let vivo=true;
  supabase.rpc("linha_branca_lavadora_historico_posicao",{p_codigo:codigo})
   .then(({data,error})=>{
    if(!vivo)return;
    if(error)throw error;
    setHistorico(data||[]);
   }).catch(e=>{if(vivo)setHistoricoErro(e.message);});
  return()=>{vivo=false;};
 },[codigo,tipo]);
 useEffect(()=>{
  if(tipo!=="temporario"||!livre||!editavel||busca.trim().length<2){
   setResultados([]);setPesquisando(false);return;
  }
  const ctrl=new AbortController();
  const tid=setTimeout(()=>{
   setPesquisando(true);
   supabase.rpc("linha_branca_lavadora_buscar_para_linha",{p_busca:busca.trim()})
    .abortSignal(ctrl.signal).then(({data,error})=>{
     if(ctrl.signal.aborted)return;
     if(error)throw error;
     setResultados(data||[]);
    }).catch(e=>{if(!ctrl.signal.aborted)setErro(e.message);})
    .finally(()=>{if(!ctrl.signal.aborted)setPesquisando(false);});
  },260);
  return()=>{clearTimeout(tid);ctrl.abort();};
 },[busca,tipo,livre,editavel]);
 async function movimentar(acao){
  setExecutando(true);setErro("");
  try{
   const {error}=await supabase.rpc("linha_branca_lavadora_movimentar_estoque_linha",{
    p_acao:acao,p_codigo:codigo,p_numero_os:acao==="alocar"?osEscolhida?.numero_os:null,
    p_destino:acao==="transferir"?destino:null,p_observacao:observacao.trim()||null
   });
   if(error)throw error;
   await onAlterar();
   onFechar();
  }catch(e){setErro(e.message||"Falha na movimentação");}
  finally{setExecutando(false);}
 }
 const livres=(mapa?.temporario||[]).filter(p=>!p.os_id&&p.codigo!==codigo);
 return <div className="fixed inset-0 z-[90] flex justify-end bg-slate-950/40" role="presentation">
  <button type="button" className="absolute inset-0" onClick={onFechar} aria-label="Fechar detalhes"/>
  <aside role="dialog" aria-modal="true" aria-label={"Detalhes da posição "+codigo}
   className="relative flex h-full w-full max-w-[470px] flex-col overflow-y-auto bg-white shadow-2xl">
   <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-5">
    <div>
     <p className="text-[10px] font-bold uppercase tracking-widest text-violet-700">
      {tipo==="triagem"?"Posto de Triagem":"Estoque Temporário Linha"}
     </p>
     <h3 className="mt-1 text-xl font-black text-slate-900">Posição {codigo}</h3>
     <p className="mt-1 text-xs text-slate-500">
      {livre?"Disponível para alocação":item?.status_atual||item?.status||"Ocupada"}
     </p>
    </div>
    <button type="button" onClick={onFechar} aria-label="Fechar" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={20}/></button>
   </div>
   <div className="space-y-5 p-5">
    <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-xs">
     <div><p className="font-medium text-slate-500">OS atual</p><p className="mt-1 text-base font-black text-slate-900">{item?.numero_os||"Livre"}</p></div>
     <div><p className="font-medium text-slate-500">Passaram no dia</p><p className="mt-1 text-base font-black">{num(item?.passaram_hoje)}</p></div>
     <div className="col-span-2"><p className="font-medium text-slate-500">Modelo / máquina</p><p className="mt-1 font-bold">{item?.modelo||"—"}</p></div>
     <div><p className="font-medium text-slate-500">Responsável</p><p className="mt-1 font-semibold">{item?.responsavel||"—"}</p></div>
     <div><p className="font-medium text-slate-500">Tempo na posição</p><p className="mt-1 font-semibold">{item?.entrada_em?tempoDecorrido(item.entrada_em):"—"}</p></div>
     {Number(item?.ocupantes||0)>1&&<p className="col-span-2 rounded-lg bg-rose-100 p-2 font-bold text-rose-700">Há mais de uma OS ativa nesta posição. Conferir fisicamente antes de movimentar.</p>}
    </div>
    {tipo==="triagem"?
     <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs leading-5 text-slate-600">
      As posições de Triagem refletem os ciclos registrados no Liquida. Iniciar, encerrar e
      trocar máquinas continua sendo realizado na tela de Triagem, preservando os controles de ciclo.
     </p>:
     !editavel?<p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Seu perfil tem acesso à consulta, mas não à movimentação deste estoque.</p>:
     livre?<div className="space-y-3">
      <h4 className="text-sm font-black">Alocar lavadora nesta posição</h4>
      <label className="block text-xs font-semibold text-slate-700">Localizar OS ou modelo
       <div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"/>
        <input value={busca} onChange={e=>{setBusca(e.target.value);setOsEscolhida(null)}} placeholder="Digite a OS para alocar"
         className="w-full rounded-lg border border-slate-200 p-2.5 pl-9 text-sm" />
       </div>
      </label>
      {pesquisando&&<p className="text-xs text-slate-500">Buscando OS…</p>}
      {!!resultados.length&&<div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200">
       {resultados.map(o=><button type="button" key={o.id}
        onClick={()=>setOsEscolhida(o)}
        className={"flex w-full items-start justify-between border-b border-slate-100 p-3 text-left text-xs last:border-0 "+
          (osEscolhida?.id===o.id?"bg-violet-50":"hover:bg-slate-50")}>
        <div><strong>OS {o.numero_os}</strong><p className="mt-0.5 text-slate-500">{o.modelo} · {o.status_atual}</p>
        {(o.temporario_atual||o.em_posto_triagem)&&<p className="mt-1 font-bold text-amber-700">
         {o.temporario_atual?"Já alocada em "+o.temporario_atual:"Em ciclo ativo da Triagem"}
        </p>}</div>
        {osEscolhida?.id===o.id&&<Check size={16} className="text-violet-700"/>}
       </button>)}
      </div>}
      <label className="block text-xs font-semibold text-slate-700">Observação opcional
       <input value={observacao} onChange={e=>setObservacao(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 p-2.5 text-sm" maxLength={250}/>
      </label>
      <button type="button" disabled={executando||!osEscolhida||osEscolhida.em_posto_triagem||!!osEscolhida.temporario_atual}
       onClick={()=>movimentar("alocar")}
       className="flex w-full items-center justify-center gap-2 rounded-lg bg-violet-700 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-40">
       <PackagePlus size={15}/> Confirmar alocação
      </button>
     </div>:
     <div className="space-y-3">
      <h4 className="text-sm font-black">Movimentação do estoque temporário</h4>
      <label className="block text-xs font-semibold text-slate-700">Transferir para
       <select value={destino} onChange={e=>setDestino(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 p-2.5">
        <option value="">Selecione posição livre</option>
        {livres.map(p=><option key={p.codigo} value={p.codigo}>{p.codigo}</option>)}
       </select>
      </label>
      <button type="button" disabled={executando||!destino}
       onClick={()=>movimentar("transferir")}
       className="flex w-full items-center justify-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2.5 text-xs font-bold text-violet-700 disabled:opacity-40">
       <ArrowLeftRight size={15}/> Transferir OS
      </button>
      {!confirmarRetirada?<button type="button" onClick={()=>setConfirmarRetirada(true)}
       className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">
       <Trash2 size={15}/> Retirar da posição
      </button>:<div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs">
        <p className="font-semibold text-amber-900">Confirmar retirada da OS {item.numero_os}?</p>
        <div className="mt-3 flex gap-2">
         <button type="button" disabled={executando} onClick={()=>movimentar("retirar")}
          className="rounded-md bg-amber-700 px-3 py-2 font-bold text-white">Confirmar retirada</button>
         <button type="button" onClick={()=>setConfirmarRetirada(false)}
          className="rounded-md border border-amber-200 px-3 py-2 font-bold">Cancelar</button>
        </div>
       </div>}
     </div>
    }
    {erro&&<p role="alert" className="rounded-lg bg-rose-50 p-3 text-xs font-semibold text-rose-700">{erro}</p>}
    <div>
     <h4 className="mb-2 text-sm font-black text-slate-900">Histórico da posição</h4>
     {historicoErro?<p className="text-xs text-rose-700">{historicoErro}</p>:
      !historico.length?<p className="text-xs text-slate-500">Ainda não há movimentações registradas.</p>:
      <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto rounded-lg border border-slate-200">
       {historico.map((m,i)=><div key={i} className="p-3 text-xs">
        <div className="flex items-center justify-between"><strong>OS {m.numero_os}</strong>
         <span className="text-slate-500">{dataBR(m.criado_em)}</span></div>
        <p className="mt-1 text-slate-600">{m.acao} {m.operador?"· "+m.operador:""}</p>
       </div>)}
      </div>}
    </div>
   </div>
  </aside>
 </div>;
}

export default function MapaFisicoLavadorasPage(){
 const {hasAccess,profile}=useAuth();
 const editavel=Boolean(profile?.is_master||hasAccess("/v2/linha-branca/lavadoras/triagem")||
  hasAccess("/v2/linha-branca/gestao/estoque"));
 const [dia,setDia]=useState(hojeSP);
 const [dados,setDados]=useState(null),[carregando,setCarregando]=useState(true);
 const [erro,setErro]=useState("");
 const [versao,setVersao]=useState(0);
 const [selecionada,setSelecionada]=useState(null);
 const [busca,setBusca]=useState(""),[tecnico,setTecnico]=useState("");
 const [modo,setModo]=useState("modelo"),[vazias,setVazias]=useState(true);
 const atualizar=useCallback(async()=>{setVersao(x=>x+1)},[]);
 useEffect(()=>{
  const ctrl=new AbortController();setCarregando(true);setErro("");
  supabase.rpc("linha_branca_lavadora_mapa_linha",{p_dia:dia})
   .abortSignal(ctrl.signal).then(({data,error})=>{
    if(ctrl.signal.aborted)return;
    if(error)throw error;
    setDados(data);
   }).catch(e=>{
    if(!ctrl.signal.aborted){setErro(e.message||"Falha ao carregar o mapa");setDados(null);}
   }).finally(()=>{if(!ctrl.signal.aborted)setCarregando(false);});
  return()=>ctrl.abort();
 },[dia,versao]);
 useEffect(()=>{
  const timer=window.setInterval(atualizar,60000);
  return()=>window.clearInterval(timer);
 },[atualizar]);
 const postos=useMemo(()=>new Map((dados?.postos||[]).map(x=>[x.codigo,x])),[dados]);
 const estoque=useMemo(()=>new Map((dados?.temporario||[]).map(x=>[x.codigo,x])),[dados]);
 const responsaveis=useMemo(()=>[...new Set((dados?.postos||[])
  .concat(dados?.temporario||[]).map(x=>x.responsavel).filter(Boolean))].sort(),[dados]);
 const pos=(codigo,tipo)=>{
  const item=tipo==="triagem"?postos.get(codigo):estoque.get(codigo);
  return <Posicao key={codigo} codigo={codigo} tipo={tipo} item={item}
   selecionar={setSelecionada} modo={modo} exibirVazias={vazias} busca={busca} tecnico={tecnico}/>;
 };
 const resumo=dados?.resumo||{};
 return <div className="space-y-4 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-3">
   <div>
    <p className="text-[10px] font-black uppercase tracking-[.17em] text-violet-700">Linha Branca · Lavadoras</p>
    <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Mapa da Linha</h1>
    <p className="mt-1 text-xs text-slate-500">20 postos de Triagem · Estoque Temporário Linha A1–C10 · ocupação atual e fluxo do dia</p>
   </div>
   <div className="flex flex-wrap items-center gap-2">
    <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
     <CalendarDays size={15}/><input type="date" value={dia} max={hojeSP()}
      onChange={e=>setDia(e.target.value)} className="bg-transparent text-xs outline-none"/>
    </label>
    <button type="button" onClick={atualizar} disabled={carregando}
     className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">
     <RefreshCw size={16} className={carregando?"animate-spin":""}/> Atualizar
    </button>
   </div>
  </header>
  <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 xl:grid-cols-6">
   <Indicador rotulo="Triagem ocupada" valor={resumo.postos_ocupados} descricao="de 20 posições"/>
   <Indicador rotulo="Triagem livre" valor={resumo.postos_livres} descricao="disponíveis agora"/>
   <Indicador rotulo="Temporário ocupado" valor={resumo.temporario_ocupado} descricao="de 30 posições"/>
   <Indicador rotulo="Temporário livre" valor={resumo.temporario_livre} descricao="endereços disponíveis"/>
   <Indicador rotulo="Passagens na Triagem" valor={resumo.triagem_passagens} descricao="OS por posto na data"/>
   <Indicador rotulo="Passagens no Temporário" valor={resumo.estoque_passagens} descricao="entradas por endereço na data"/>
  </div>
  <section className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-3">
   <label className="min-w-[190px] flex-1 text-[11px] font-semibold text-slate-600">Localizar posição, OS ou modelo
    <div className="relative mt-1"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/>
     <input type="search" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Pesquisar no mapa"
      className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-violet-500"/>
    </div>
   </label>
   <label className="text-[11px] font-semibold text-slate-600">Responsável
    <select value={tecnico} onChange={e=>setTecnico(e.target.value)}
     className="mt-1 block min-w-[170px] rounded-lg border border-slate-200 px-3 py-2 text-xs">
     <option value="">Todos</option>
     {responsaveis.map(x=><option key={x} value={x}>{x}</option>)}
    </select>
   </label>
   <label className="text-[11px] font-semibold text-slate-600">Exibir nos cards
    <select value={modo} onChange={e=>setModo(e.target.value)}
     className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-xs">
     <option value="modelo">Modelo</option><option value="status">Status</option>
    </select>
   </label>
   <label className="flex items-center gap-2 px-2 py-2 text-xs font-semibold text-slate-700">
    <input type="checkbox" checked={vazias} onChange={e=>setVazias(e.target.checked)} className="accent-violet-700"/> Exibir vazias
   </label>
  </section>
  {erro&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
    {erro} <button type="button" onClick={atualizar} className="ml-2 underline">Tentar novamente</button></p>}
  {Number(resumo.postos_com_conflito||0)>0&&
   <p className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
    <AlertCircle size={15}/> {resumo.postos_com_conflito} posições com mais de uma OS ativa registrada. Conferir fisicamente.
   </p>}
  {carregando&&!dados&&<div className="flex min-h-64 items-center justify-center gap-3 text-xs font-bold text-violet-700">
   <Loader2 size={18} className="animate-spin"/> Consultando posições da linha…
  </div>}
  {dados&&<section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
   <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
    <div>
     <h2 className="flex items-center gap-2 text-sm font-black"><MapPinned size={16} className="text-violet-700"/> Planta operacional</h2>
     <p className="mt-1 text-[11px] text-slate-500">Superior 01–07 · Lateral 08–20 · Centro: estoque temporário 3 × 10</p>
    </div>
    <div className="flex flex-wrap gap-2 text-[10px]">
     {[["Ocupada","bg-blue-100"],["Aguardando","bg-amber-100"],["Erro","bg-rose-100"],["Livre","bg-slate-100"]].map(([v,cor])=>
      <span key={v} className="flex items-center gap-1.5 text-slate-600">
       <span className={"h-2.5 w-2.5 rounded-sm "+cor}/>{v}
      </span>)}
    </div>
   </div>
   <div className="overflow-x-auto pb-2">
    <div className="mx-auto w-full min-w-[840px] max-w-[960px] rounded-3xl border border-slate-200 bg-[#F6F7FA] p-4 sm:p-5">
     <div className="ml-[122px] grid grid-cols-7 gap-2.5">
      {TRIAGEM.slice(0,7).map(c=>pos(c,"triagem"))}
     </div>
     <div className="mt-3 grid grid-cols-[112px_minmax(0,1fr)] gap-3">
      <div className="grid grid-rows-[repeat(13,minmax(75px,1fr))] gap-2">
       {TRIAGEM.slice(7).map(c=>pos(c,"triagem"))}
      </div>
      <div className="relative flex min-h-[1080px] flex-col items-center justify-start rounded-2xl border border-dashed border-slate-300 bg-white/55 px-4 py-10">
       <div className="mb-5 text-center">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">Centro da sala</p>
        <h3 className="mt-1 flex items-center justify-center gap-2 text-sm font-black text-slate-900"><Warehouse size={16}/> Estoque Temporário Linha</h3>
        <p className="mt-1 text-[11px] text-slate-500">30 posições · 1 lavadora por endereço</p>
       </div>
       <div className="grid w-full max-w-[540px] grid-cols-3 gap-3">
        {COLUNAS.map(letra=><div key={letra} className="flex min-w-0 flex-col gap-2">
          <div className="rounded-lg bg-slate-100 p-2 text-center text-xs font-black text-violet-800">Coluna {letra}</div>
          {Array.from({length:10},(_,i)=>pos(letra+(i+1),"temporario"))}
        </div>)}
       </div>
       <p className="mt-6 text-center text-[11px] text-slate-500">Clique em uma posição para consultar a OS, o histórico ou movimentar o estoque.</p>
      </div>
     </div>
    </div>
   </div>
   <p className="mt-3 text-[11px] leading-5 text-slate-500">
    Ocupação exibida: posição atual no Liquida. O contador “/ dia” considera OS distintas que passaram em cada posto na data selecionada.
    A soma de passagens pode superar a quantidade total de OS, pois a mesma máquina pode passar em mais de uma posição.
   </p>
  </section>}
  {selecionada&&<DetalhePosicao key={selecionada.tipo+selecionada.codigo}
    selecionada={selecionada} mapa={dados}
    onFechar={()=>setSelecionada(null)} onAlterar={atualizar} editavel={editavel}/>}
 </div>;
}
