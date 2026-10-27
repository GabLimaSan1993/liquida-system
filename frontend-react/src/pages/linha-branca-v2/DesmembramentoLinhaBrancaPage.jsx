import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, ClipboardList, History, PackageCheck, PackagePlus, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const ESTADO_PECA=()=>({id:crypto.randomUUID(),descricao:"",pn:"",quantidade:"1",localizacao:""});
const campo="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
const botao="inline-flex items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50";
const br=n=>Number(n||0).toLocaleString("pt-BR");
const dataBR=s=>s?new Date(s).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";

async function operar(acao,dados={}){
 const {data,error}=await supabase.rpc("linha_branca_desmembramento",{p_acao:acao,p_dados:dados});
 if(error)throw Error(error.message);
 if(!data?.ok)throw Error(data?.mensagem||"Não foi possível processar a solicitação.");
 return data;
}

export default function DesmembramentoLinhaBrancaPage(){
 const [numero,setNumero]=useState("");
 const [consulta,setConsulta]=useState(null);
 const [pecas,setPecas]=useState([ESTADO_PECA()]);
 const [lote,setLote]=useState(()=>crypto.randomUUID());
 const [recentes,setRecentes]=useState([]);
 const [fila,setFila]=useState([]);
 const [filaErro,setFilaErro]=useState("");
 const [busy,setBusy]=useState(false);
 const [carregando,setCarregando]=useState(false);
 const [erro,setErro]=useState("");
 const [sucesso,setSucesso]=useState("");
 const [listaErro,setListaErro]=useState("");
 const [busca,setBusca]=useState("");
 
 async function carregarRecentes(){
  try{const r=await operar("listar");setRecentes(r.itens||[]);setListaErro("");}
  catch(e){setListaErro(e.message);}
 }
 async function carregarFila(){
  try{
   const {data,error}=await supabase.rpc("linha_branca_desmembramento_fila");
   if(error)throw Error(error.message);
   if(!data?.ok)throw Error("A consulta da fila não retornou dados");
   setFila(data.oss||[]);setFilaErro("");
  }catch(e){setFilaErro(e.message);}
 }
 useEffect(()=>{carregarRecentes();carregarFila();},[]);
 function editarPeca(id,chave,valor){
  setPecas(v=>v.map(p=>p.id===id?{...p,[chave]:valor}:p));
  setLote(crypto.randomUUID());
 }
 function trocarOS(v){setNumero(v);setConsulta(null);setPecas([ESTADO_PECA()]);setLote(crypto.randomUUID());setErro("");setSucesso("");}
 async function abrirOS(numeroOS){
  const numeroSelecionado=String(numeroOS||"").trim();
  if(!numeroSelecionado)return;
  trocarOS(numeroSelecionado);
  setCarregando(true);
  try{
   const res=await operar("consultar",{numero_os:numeroSelecionado});
   setConsulta(res);setPecas([ESTADO_PECA()]);setLote(crypto.randomUUID());
  }catch(err){setConsulta(null);setErro(err.message);}
  finally{setCarregando(false);}
 }
 async function consultar(e){
  e?.preventDefault();
  await abrirOS(numero);
 }
 function adicionar(){if(pecas.length>=30)return;setPecas(v=>[...v,ESTADO_PECA()]);setLote(crypto.randomUUID());}
 function excluir(id){setPecas(v=>v.length>1?v.filter(p=>p.id!==id):[ESTADO_PECA()]);setLote(crypto.randomUUID());}
 async function confirmar(e){
  e.preventDefault();setErro("");setSucesso("");
  if(!consulta?.os)return setErro("Selecione ou consulte uma OS liberada para desmembramento.");
  if(!pecas.length||pecas.some(p=>!p.descricao.trim()||!/^[0-9]+$/.test(p.quantidade)||Number(p.quantidade)<1||Number(p.quantidade)>10000))
   return setErro("Confira a descrição e a quantidade inteira das peças.");
  if(!window.confirm(`Confirmar entrada de ${pecas.length} tipo(s) de peça(s) da OS ${consulta.os.numero_os} no estoque da Linha Branca?`))return;
  setBusy(true);
  try{
   const res=await operar("registrar",{numero_os:consulta.os.numero_os,solicitacao_id:lote,pecas:pecas.map(p=>({
    descricao:p.descricao.trim(),pn:p.pn.trim(),quantidade:p.quantidade,localizacao:p.localizacao.trim()
   }))});
   setSucesso(`Entrada registrada: ${br(res.itens?.reduce((n,p)=>n+Number(p.quantidade),0))} unidade(s) de ${res.itens?.length||0} item(ns) vinculados à OS ${consulta.os.numero_os}.`);
   const [atual]=await Promise.all([operar("consultar",{numero_os:consulta.os.numero_os}),carregarRecentes(),carregarFila()]);
   setConsulta(atual);setPecas([ESTADO_PECA()]);setLote(crypto.randomUUID());
  }catch(err){setErro(err.message);}
  finally{setBusy(false);}
 }
 const filtradas=recentes.filter(r=>[r.numero_os,r.descricao,r.pn,r.codigo_estoque,r.modelo_origem].join(" ").toLowerCase().includes(busca.toLowerCase()));
 return <div className="mx-auto max-w-[1540px] space-y-6 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div>
    <Link to="/v2/linha-branca" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-violet-700"><ArrowLeft size={15}/> Áreas da Linha Branca</Link>
    <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-violet-600">Linha Branca · Estoque</p>
    <h1 className="mt-2 text-3xl font-black tracking-tight">Desmembramento de peças</h1>
    <p className="mt-1 text-sm text-slate-500">Peças recuperadas com vínculo à OS de origem e entrada rastreável no estoque.</p>
   </div>
   <button onClick={()=>{carregarRecentes();carregarFila();}} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-black text-slate-600"><RefreshCw size={16}/> Atualizar dados</button>
  </header>
  {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">{erro}</div>}
  {sucesso&&<div role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-700"><CheckCircle2 size={18}/>{sucesso}</div>}
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
    <div><h2 className="text-sm font-black">OSs indicadas para desmembramento</h2>
     <p className="mt-1 text-xs text-slate-500">As quatro OSs autorizadas para o piloto podem ser desmembradas em paralelo, sem alterar o fluxo atual. Peças registradas entram no estoque com rastreabilidade.</p>
    </div>
    <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-black text-violet-700">{fila.length} OS(s)</span>
   </div>
   {filaErro&&<p role="alert" className="mb-3 text-xs text-rose-700">{filaErro}</p>}
   <div className="overflow-x-auto">
    <table className="w-full min-w-[750px] text-left text-xs">
     <thead className="border-b border-slate-100 bg-slate-50 text-slate-500"><tr>
      {["OS","Máquina / modelo","Situação atual","Situação do desmembramento","Ação"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}
     </tr></thead>
     <tbody className="divide-y divide-slate-100">{fila.map(x=><tr key={x.numero_os}>
      <td className="px-3 py-3 font-black text-slate-800">{x.numero_os}</td>
      <td className="px-3 py-3">{x.os_id?[x.categoria,x.marca,x.modelo].filter(Boolean).join(" · "):"Piloto — identificada pelo número da OS"}</td>
      <td className="px-3 py-3">{x.status_atual||(x.liberado_estoque?"Piloto paralelo":"Sem cadastro operacional")}</td>
      <td className="px-3 py-3">
       <span className={"inline-flex rounded-lg px-2.5 py-1 font-bold "+(x.liberado_estoque?"bg-emerald-50 text-emerald-700":"bg-amber-50 text-amber-800")}>
        {x.situacao}
       </span>
      </td>
      <td className="px-3 py-3"><button type="button"
       onClick={()=>abrirOS(x.numero_os)} disabled={carregando}
       className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 font-bold text-violet-700 hover:bg-violet-100">
       Selecionar OS
      </button></td>
     </tr>)}</tbody>
    </table>
    {!fila.length&&!filaErro&&<p className="py-5 text-center text-xs text-slate-400">Nenhuma OS na fila.</p>}
   </div>
  </section>
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="mb-5 flex items-center gap-2"><div className="rounded-xl bg-violet-50 p-2 text-violet-700"><Search size={20}/></div><h2 className="text-sm font-black">1. OS de origem</h2></div>
   <form onSubmit={consultar} className="flex flex-col gap-3 sm:flex-row sm:items-end">
    <label className="min-w-0 flex-1 text-xs font-bold text-slate-500">Número da OS
     <input required value={numero} onChange={e=>trocarOS(e.target.value)} className={campo} placeholder="Bipe ou informe a OS" maxLength={40}/>
    </label>
    <button type="submit" disabled={carregando||!numero.trim()} className={botao}>{carregando?"Consultando...":"Consultar OS"}</button>
   </form>
   {consulta?.os&&<div className="mt-5 grid gap-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
    {[["OS",consulta.os.numero_os],["Máquina",consulta.os.maquina],["Marca",consulta.os.marca],["Modelo anterior",consulta.os.modelo],["Número de série",consulta.os.serial],["Situação",consulta.os.status],["Autorização",consulta.os.condenacao_id?"Desmembramento aprovado":"Piloto paralelo — liberado"]].map(([chave,valor])=><div key={chave}><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{chave}</p><p className="mt-1 text-sm font-bold text-slate-800">{valor||"—"}</p></div>)}
   </div>}
  </section>
  {consulta?.os&&<form onSubmit={confirmar} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="flex flex-wrap items-center justify-between gap-4">
    <div className="flex items-center gap-2"><div className="rounded-xl bg-violet-50 p-2 text-violet-700"><PackagePlus size={19}/></div><h2 className="text-sm font-black">2. Peças aproveitáveis</h2></div>
    <button type="button" className="inline-flex items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-700 disabled:opacity-50" onClick={adicionar} disabled={pecas.length>=30}><Plus size={16}/> Adicionar peça</button>
   </div>
   <div className="space-y-3">{pecas.map((p,i)=><div key={p.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
    <div className="mb-3 flex items-center justify-between gap-3"><h3 className="text-xs font-black text-slate-700">Peça {i+1}</h3><button type="button" aria-label="Retirar peça" onClick={()=>excluir(p.id)} className="rounded-lg p-2 text-rose-600 hover:bg-rose-50"><Trash2 size={16}/></button></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-12">
     <label className="text-xs font-bold text-slate-500 sm:col-span-2 xl:col-span-5">Descrição da peça
      <input className={campo} required maxLength={400} value={p.descricao} onChange={e=>editarPeca(p.id,"descricao",e.target.value)} placeholder="Ex.: placa eletrônica principal"/>
     </label>
     <label className="text-xs font-bold text-slate-500 xl:col-span-3">PN (opcional)
      <input className={campo} maxLength={100} value={p.pn} onChange={e=>editarPeca(p.id,"pn",e.target.value.toUpperCase())} placeholder="Sem PN"/>
     </label>
     <label className="text-xs font-bold text-slate-500 xl:col-span-2">Quantidade
      <input className={campo} type="number" min="1" max="10000" step="1" required value={p.quantidade} onChange={e=>editarPeca(p.id,"quantidade",e.target.value)}/>
     </label>
     <label className="text-xs font-bold text-slate-500 xl:col-span-2">Localização
      <input className={campo} maxLength={120} value={p.localizacao} onChange={e=>editarPeca(p.id,"localizacao",e.target.value)} placeholder="Opcional"/>
     </label>
    </div>
   </div>)}</div>
   <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
    <p className="text-xs text-slate-500">PN em branco: código interno gerado automaticamente. A entrada será vinculada à OS e registrada no histórico.</p>
    <button type="submit" className={botao} disabled={busy}>{busy?"Registrando...":<><PackageCheck size={16}/> Confirmar entrada no estoque</>}</button>
   </div>
  </form>}
  {consulta?.os&&<section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <h2 className="mb-4 flex items-center gap-2 text-sm font-black"><ClipboardList size={18} className="text-violet-700"/> Peças já retiradas desta OS</h2>
   <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b bg-slate-50 text-slate-500"><tr>{["Descrição","PN informado","Código de estoque","Quantidade","Saldo atual"].map(x=><th key={x} className="p-3">{x}</th>)}</tr></thead><tbody className="divide-y">{(consulta.itens||[]).map(x=><tr key={x.id}><td className="p-3 font-semibold">{x.descricao}</td><td className="p-3">{x.pn||"Sem PN"}</td><td className="p-3 font-mono">{x.codigo_estoque}</td><td className="p-3">{br(x.quantidade)}</td><td className="p-3">{br(x.saldo)}</td></tr>)}</tbody></table>{!consulta.itens?.length&&<p className="py-6 text-center text-xs text-slate-400">Nenhuma peça registrada nesta OS.</p>}</div>
  </section>}
  <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
   <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="flex items-center gap-2 text-sm font-black"><History size={18} className="text-violet-700"/> Histórico de desmembramentos</h2>
    <input className="rounded-xl border border-slate-200 px-3 py-2 text-xs outline-none focus:border-violet-500" value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar OS, peça, PN ou modelo"/>
   </div>
   {listaErro&&<p role="alert" className="mb-4 text-xs text-rose-600">{listaErro}</p>}
   <div className="overflow-x-auto"><table className="w-full min-w-[920px] text-left text-xs"><thead className="border-b bg-slate-50 text-slate-500"><tr>{["OS","Máquina / modelo anterior","Peça aproveitada","PN / código","Qtd.","Saldo","Operador","Data"].map(x=><th key={x} className="px-3 py-3">{x}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtradas.map(x=><tr key={x.id} className="hover:bg-slate-50"><td className="px-3 py-3 font-bold">{x.numero_os}</td><td className="px-3 py-3">{x.maquina_origem||"—"} · {x.marca_origem||"—"} {x.modelo_origem||""}</td><td className="px-3 py-3 font-semibold">{x.descricao}</td><td className="px-3 py-3 font-mono">{x.pn||"Sem PN"}<span className="block text-[10px] text-slate-400">{x.codigo_estoque}</span></td><td className="px-3 py-3">{br(x.quantidade)}</td><td className="px-3 py-3">{br(x.saldo)}</td><td className="px-3 py-3">{x.operador||"—"}</td><td className="px-3 py-3">{dataBR(x.criado_em)}</td></tr>)}</tbody></table>{!filtradas.length&&<p className="py-8 text-center text-xs text-slate-400">Nenhum registro encontrado.</p>}</div>
  </section>
 </div>;
}
