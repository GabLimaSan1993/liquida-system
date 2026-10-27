import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Boxes, ClipboardList, FileText, History, Loader2, Package, PackageCheck,
  PackagePlus, Plus, RefreshCcw, Search, ShoppingCart, Trash2, Truck, Warehouse, Wrench
} from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const INPUT="mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100";
const BTN="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#43284F] px-4 py-2.5 text-xs font-black text-white transition hover:bg-[#583869] disabled:cursor-not-allowed disabled:opacity-50";
const SOFT="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50";
const BOX="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm";
const fmt=v=>Number(v||0).toLocaleString("pt-BR",{maximumFractionDigits:3});
const dia=s=>s?new Date(s).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";
const novoItem=()=>({id:crypto.randomUUID(),pn:"",descricao:"",quantidade:"1",tipo_item:"PECA",localizacao:"",compra_id:""});
const ETAPAS=[
 ["AGUARDANDO_ENTRADA","Necessidade de entrada"],
 ["PRE_TRATAMENTO","Pré-tratamento"],
 ["LIBERADO_LINHA","Liberado para linha"],
 ["EM_LINHA","Em linha"],
 ["BLOQUEADO","Bloqueado"]
];
const ABAS=[
 ["pecas","Estoque de Peças",Boxes],["insumos","Estoque de Insumos",Package],
 ["requisicoes","Requisições",ClipboardList],["compras","Compras",ShoppingCart],
 ["notas","Entradas NF",FileText],["wip","WIP / Pré-entrada",Warehouse],
 ["movimentos","Movimentações",History],["desmembramento","Desmembramento",Wrench]
];

function Campo({label,children}) {
 return <label className="block min-w-0 text-xs font-bold text-slate-500">{label}{children}</label>;
}
function Vazio({children="Nenhum registro encontrado."}) {
 return <div className="rounded-xl border border-dashed border-slate-200 p-8 text-center text-xs text-slate-400">{children}</div>;
}
function Tabela({colunas,linhas}) {
 return <div className="overflow-x-auto">
  <table className="w-full min-w-[750px] text-left text-xs">
   <thead className="border-b border-slate-100 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
    <tr>{colunas.map(c=><th key={c} className="whitespace-nowrap px-3 py-3">{c}</th>)}</tr>
   </thead>
   <tbody className="divide-y divide-slate-100">{linhas}</tbody>
  </table>
  {!linhas?.length&&<Vazio/>}
 </div>;
}
const TD=({children,forte=false})=><td className={"px-3 py-3 align-top "+(forte?"font-bold text-slate-800":"text-slate-600")}>{children??"—"}</td>;

export default function GestaoEstoqueLinhaBrancaPage() {
 const [aba,setAba]=useState("pecas");
 const [painel,setPainel]=useState({});
 const [loading,setLoading]=useState(false),[saving,setSaving]=useState(false);
 const [erro,setErro]=useState(""),[ok,setOk]=useState("");
 const [busca,setBusca]=useState("");
 const [marcaSelecionada,setMarcaSelecionada]=useState("TODAS");
 const [categoriaInsumo,setCategoriaInsumo]=useState("TODAS");
 const [requisicao,setRequisicao]=useState({numero_os:"",estoque_id:"",quantidade:"1",observacoes:""});
 const [compra,setCompra]=useState({numero_os:"",pn:"",descricao:"",quantidade:"1",observacoes:""});
 const [nota,setNota]=useState({numero_nf:"",serie_nf:"",chave_nfe:"",fornecedor:"",observacoes:""});
 const [itensNota,setItensNota]=useState([novoItem()]);
 const [notaId,setNotaId]=useState(()=>crypto.randomUUID());
 const [consumo,setConsumo]=useState({estoque_id:"",quantidade:"1",numero_os:"",motivo:""});
 const [consumoId,setConsumoId]=useState(()=>crypto.randomUUID());
 const [wip,setWip]=useState({id:"",numero_os:"",identificador:"",categoria:"Linha Branca",marca:"",modelo:"",serial:"",origem:"",etapa:"AGUARDANDO_ENTRADA",endereco:"",motivo:"",observacoes:""});

 async function acao(tipo,dados={}) {
  const {data,error}=await supabase.rpc("linha_branca_estoque_central",{p_acao:tipo,p_dados:dados});
  if(error)throw Error(error.message);
  if(!data)return {};
  if(data.ok===false)throw Error(data.mensagem||"Operação não concluída");
  return data;
 }
 const atualizar=useCallback(async()=>{
  setLoading(true);
  try{const data=await acao("painel");setPainel(data);setErro("");}
  catch(e){setErro("Não foi possível consultar o estoque: "+e.message);}
  finally{setLoading(false);}
 },[]);
 useEffect(()=>{atualizar();},[atualizar]);

 async function executar(tipo,dados,mensagem,apos){
  if(saving)return false;
  setSaving(true);setErro("");setOk("");
  try{
   const r=await acao(tipo,dados);
   setOk(r.repetida?"Operação já registrada. O estoque não foi duplicado.":mensagem);
   if(apos)apos(r);
   await atualizar();
   return true;
  }catch(e){setErro(e.message);return false;}
  finally{setSaving(false);}
 }
 const estoque=painel.estoque||[], requisicoes=painel.requisicoes||[],
  compras=painel.compras||[],movimentos=painel.movimentacoes||[],wips=painel.wip||[];
 const pecas=estoque.filter(x=>x.tipo_item!=="INSUMO"),insumos=estoque.filter(x=>x.tipo_item==="INSUMO");
 const filtrados=lista=>lista.filter(x=>Object.values(x).some(v=>String(v??"").toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"))));
 const marcaDaPeca=item=>item.marca?.trim()||"Sem marca informada";
 const marcas=[...new Set(pecas.map(marcaDaPeca))].sort((a,b)=>{
  if(a==="Sem marca informada")return 1;
  if(b==="Sem marca informada")return -1;
  return a.localeCompare(b,"pt-BR");
 });
 const categoriasInsumos=[...new Set(insumos.map(x=>x.categoria?.trim()||"Sem categoria"))].sort((a,b)=>a.localeCompare(b,"pt-BR"));
 const insumosVisiveis=filtrados(insumos).filter(x=>categoriaInsumo==="TODAS"||(x.categoria?.trim()||"Sem categoria")===categoriaInsumo);
 const gruposPorMarca=marcas.map(marca=>({
  marca,
  itens:filtrados(pecas).filter(p=>marcaDaPeca(p)===marca)
 })).filter(g=>(marcaSelecionada==="TODAS"||g.marca===marcaSelecionada)&&g.itens.length>0);
 const pendencias=requisicoes.filter(x=>x.status!=="entregue").length;
 const comprasPendentes=compras.filter(x=>x.status!=="recebida").length;
 const wipPrev=wips.filter(x=>x.etapa!=="EM_LINHA").length;
 function alterItem(id,campo,valor){setItensNota(v=>v.map(x=>x.id===id?{...x,[campo]:valor}:x));setNotaId(crypto.randomUUID());}
 function novoWip(){setWip({id:"",numero_os:"",identificador:"",categoria:"Linha Branca",marca:"",modelo:"",serial:"",origem:"",etapa:"AGUARDANDO_ENTRADA",endereco:"",motivo:"",observacoes:""});}
 function submitNF(e){
  e.preventDefault();
  if(itensNota.some(i=>!i.descricao.trim()||!i.quantidade||Number(i.quantidade)<=0))return setErro("Informe descrição e quantidade positiva para cada item da NF.");
  if(!window.confirm("Confirmar recebimento da NF e somar as quantidades no saldo real de estoque?"))return;
  executar("entrada_nf",{...nota,operacao_id:notaId,
   itens:itensNota.map(({id,...item})=>item)},"Entrada fiscal registrada e saldo atualizado.",()=>{
    setNota({numero_nf:"",serie_nf:"",chave_nfe:"",fornecedor:"",observacoes:""});
    setItensNota([novoItem()]);setNotaId(crypto.randomUUID());
  });
 }
 return <div className="mx-auto max-w-[1600px] space-y-6 text-slate-900">
  <header className="flex flex-wrap items-start justify-between gap-4">
   <div>
    <Link to="/v2/linha-branca" className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-[#43284F]"><ArrowLeft size={16}/> Linha Branca</Link>
    <p className="mt-5 text-[10px] font-black uppercase tracking-[.2em] text-[#765D81]">Liquida System · Linha Branca</p>
    <h1 className="mt-1 text-3xl font-black tracking-tight">Gestão de Estoque</h1>
    <p className="mt-1 text-sm text-slate-500">Peças, insumos, requisições, notas fiscais e movimentações de produtos na operação.</p>
   </div>
   <button type="button" onClick={atualizar} disabled={loading} className={SOFT}>
    {loading?<Loader2 size={15} className="animate-spin"/>:<RefreshCcw size={15}/>} Atualizar dados
   </button>
  </header>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {[[Boxes,"Peças cadastradas",pecas.length,"pecas"],[Package,"Insumos cadastrados",insumos.length,"insumos"],
      [ClipboardList,"Requisições pendentes",pendencias,"requisicoes"],[Warehouse,"WIP / pré-entrada",wipPrev,"wip"]].map(([Icon,nome,valor,destino])=>
    <button type="button" key={nome} onClick={()=>{setAba(destino);setBusca("");setErro("");}} className={BOX+" text-left transition hover:border-[#765D81] hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#765D81]"}>
     <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F]"><Icon size={19}/></div>
     <p className="text-xs font-bold text-slate-500">{nome}</p><p className="mt-1 text-3xl font-black">{fmt(valor)}</p>
     <span className="mt-2 block text-[11px] font-semibold text-[#765D81]">Ver detalhes</span></button>)}
  </div>
  {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-700">{erro}</div>}
  {ok&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{ok}</div>}
  <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm">
   {ABAS.map(([id,nome,Icon])=><button type="button" key={id} onClick={()=>{setAba(id);setBusca("");setErro("");}}
      className={"flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-bold transition "+(aba===id?"bg-[#43284F] text-white":"text-slate-500 hover:bg-slate-50")}>
      <Icon size={15}/>{nome}</button>)}
  </div>
  {["pecas","insumos","requisicoes","compras","wip","movimentos"].includes(aba)&&<div className="flex justify-between gap-3">
    <p className="text-xs text-slate-500">Consulta operacional</p>
    <label className="relative w-full max-w-xs"><Search size={15} className="absolute left-3 top-2.5 text-slate-400"/>
     <input value={busca} onChange={e=>setBusca(e.target.value)} className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-xs outline-none focus:border-violet-400" placeholder="Pesquisar registros"/></label>
  </div>}
  {aba==="pecas"&&<section className={BOX}>
   <div className="flex flex-wrap items-start justify-between gap-4">
    <div><h2 className="text-base font-black">Estoque de Peças por Marca</h2>
     <p className="mt-1 text-xs text-slate-500">{fmt(pecas.length)} códigos cadastrados · classificação conforme arquivo de origem.</p>
    </div>
    <Campo label="Marca">
     <select className={INPUT+" min-w-[210px]"} value={marcaSelecionada} onChange={e=>setMarcaSelecionada(e.target.value)}>
      <option value="TODAS">Todas as marcas ({pecas.length})</option>
      {marcas.map(m=><option key={m} value={m}>{m} ({pecas.filter(p=>marcaDaPeca(p)===m).length})</option>)}
     </select>
    </Campo>
   </div>
   <div className="my-5 flex flex-wrap gap-2">
    {marcas.map(m=>{
     const subset=pecas.filter(p=>marcaDaPeca(p)===m);
     return <button type="button" key={m} aria-pressed={marcaSelecionada===m}
      onClick={()=>{setMarcaSelecionada(marcaSelecionada===m?"TODAS":m);setBusca("");}}
      className={"rounded-xl border px-3 py-2 text-left transition "+(marcaSelecionada===m?"border-[#43284F] bg-[#43284F] text-white":"border-slate-200 bg-slate-50 text-slate-700 hover:border-[#765D81]")}>
      <span className="block text-xs font-black">{m}</span>
      <span className="mt-1 block text-[11px] opacity-80">{fmt(subset.length)} códigos · {fmt(subset.reduce((a,p)=>a+Number(p.saldo||0),0))} un.</span>
     </button>;
    })}
    {marcaSelecionada!=="TODAS"&&<button type="button" onClick={()=>setMarcaSelecionada("TODAS")} className={SOFT}>Mostrar todas</button>}
   </div>
   <div className="space-y-5">
    {gruposPorMarca.map(grupo=><div key={grupo.marca} className="rounded-xl border border-slate-200">
     <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-3">
      <h3 className="text-sm font-black">{grupo.marca}</h3>
      <span className="text-xs font-semibold text-slate-500">{fmt(grupo.itens.length)} códigos · {fmt(grupo.itens.reduce((a,p)=>a+Number(p.saldo||0),0))} un. exibidas</span>
     </div>
     <Tabela colunas={["Código interno","PN fabricante","Descrição","Categoria","Compatibilidade / modelos","Saldo","Unidade","Localização"]}
      linhas={grupo.itens.map(x=><tr key={x.id}>
       <TD forte>{x.pn}</TD><TD>{x.pn_fabricante||"Não informado"}</TD>
       <TD>{x.descricao}</TD><TD>{x.categoria||"—"}</TD><TD>{x.compatibilidade||"—"}</TD>
       <TD><span className={Number(x.saldo)<=0?"font-black text-rose-600":"font-black text-emerald-700"}>{fmt(x.saldo)}</span></TD>
       <TD>{x.unidade}</TD><TD>{x.localizacao||"—"}</TD>
      </tr>)}/>
    </div>)}
    {!gruposPorMarca.length&&<Vazio>Nenhuma peça corresponde aos filtros.</Vazio>}
   </div>
   <p className="mt-4 text-[11px] text-slate-500">Os itens sem marca continuam identificados como "Sem marca informada"; nenhuma classificação presumida foi aplicada.</p>
  </section>}

  {aba==="requisicoes"&&<>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Solicitar peça para OS em reparo</h2>
    <form className="grid gap-3 md:grid-cols-4" onSubmit={e=>{e.preventDefault();executar("solicitar_peca",requisicao,"Requisição de peça criada.",()=>setRequisicao({numero_os:"",estoque_id:"",quantidade:"1",observacoes:""}));}}>
     <Campo label="Número da OS"><input required className={INPUT} value={requisicao.numero_os} onChange={e=>setRequisicao(v=>({...v,numero_os:e.target.value}))}/></Campo>
     <Campo label="Peça em estoque"><select required className={INPUT} value={requisicao.estoque_id} onChange={e=>setRequisicao(v=>({...v,estoque_id:e.target.value}))}><option value="">Selecione</option>{pecas.map(x=><option key={x.id} value={x.id}>{x.pn} · {x.descricao} ({fmt(x.saldo)})</option>)}</select></Campo>
     <Campo label="Quantidade"><input className={INPUT} type="number" step="0.001" min="0.001" required value={requisicao.quantidade} onChange={e=>setRequisicao(v=>({...v,quantidade:e.target.value}))}/></Campo>
     <div className="flex items-end"><button className={BTN} disabled={saving}><Plus size={15}/> Criar requisição</button></div>
     <div className="md:col-span-4"><Campo label="Observações (opcional)"><input className={INPUT} value={requisicao.observacoes} onChange={e=>setRequisicao(v=>({...v,observacoes:e.target.value}))}/></Campo></div>
    </form>
   </section>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Fila de atendimento das OSs</h2>
    <Tabela colunas={["OS","PN","Quantidade","Status","Solicitante","Ações"]} linhas={filtrados(requisicoes).map(r=><tr key={r.id}>
     <TD forte>{r.numero_os}</TD><TD>{r.pn}</TD><TD>{fmt(r.quantidade)}</TD><TD>{r.status}</TD><TD>{r.solicitado_por_nome}</TD>
     <TD>{["solicitada","separada"].includes(r.status)?<div className="flex flex-wrap gap-2">
       {r.status==="solicitada"&&<button type="button" className={SOFT} disabled={saving} onClick={()=>executar("atender_requisicao",{requisicao_id:r.id,destino:"SEPARADA"},"Peça separada.")}>Separar</button>}
       <button type="button" className={BTN} disabled={saving} onClick={()=>window.confirm("Confirmar entrega e baixa de estoque desta requisição?")&&executar("atender_requisicao",{requisicao_id:r.id,destino:"ENTREGUE"},"Requisição entregue e estoque baixado.")}>Entregar</button>
       <button type="button" className={SOFT} disabled={saving} onClick={()=>window.confirm("Cancelar esta requisição?")&&executar("atender_requisicao",{requisicao_id:r.id,destino:"CANCELADA"},"Requisição cancelada.")}>Cancelar</button>
      </div>:<span className="text-slate-400">Concluída</span>}</TD></tr>)}/>
   </section>
  </>}

  {aba==="compras"&&<>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Nova necessidade de compra</h2>
    <form className="grid gap-3 md:grid-cols-4" onSubmit={e=>{e.preventDefault();executar("solicitar_compra",compra,"Necessidade de compra registrada.",()=>setCompra({numero_os:"",pn:"",descricao:"",quantidade:"1",observacoes:""}));}}>
     <Campo label="OS solicitante"><input className={INPUT} required value={compra.numero_os} onChange={e=>setCompra(v=>({...v,numero_os:e.target.value}))}/></Campo>
     <Campo label="PN (opcional)"><input className={INPUT} value={compra.pn} onChange={e=>setCompra(v=>({...v,pn:e.target.value}))}/></Campo>
     <Campo label="Descrição"><input className={INPUT} required value={compra.descricao} onChange={e=>setCompra(v=>({...v,descricao:e.target.value}))}/></Campo>
     <Campo label="Quantidade"><input className={INPUT} required min="0.001" type="number" step="0.001" value={compra.quantidade} onChange={e=>setCompra(v=>({...v,quantidade:e.target.value}))}/></Campo>
     <div className="md:col-span-3"><Campo label="Observações"><input className={INPUT} value={compra.observacoes} onChange={e=>setCompra(v=>({...v,observacoes:e.target.value}))}/></Campo></div>
     <div className="flex items-end"><button className={BTN} disabled={saving}><Plus size={15}/> Solicitar compra</button></div>
    </form>
   </section>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Acompanhamento de compras</h2>
    <Tabela colunas={["OS","PN","Descrição","Qtd.","Etapa","Ações"]} linhas={filtrados(compras).map(c=><tr key={c.id}>
     <TD forte>{c.numero_os}</TD><TD>{c.pn}</TD><TD>{c.descricao}</TD><TD>{fmt(c.quantidade)}</TD><TD>{c.status.replaceAll("_"," ")}</TD>
     <TD><div className="flex flex-wrap gap-2">
      {c.status==="necessidade_aberta"&&<button className={SOFT} disabled={saving} onClick={()=>executar("atualizar_compra",{compra_id:c.id,status:"em_cotacao"},"Compra em cotação.")}>Em cotação</button>}
      {["necessidade_aberta","em_cotacao"].includes(c.status)&&<button className={SOFT} disabled={saving} onClick={()=>executar("atualizar_compra",{compra_id:c.id,status:"comprada"},"Compra confirmada; entrada de estoque dependerá da NF.")}>Comprada</button>}
      {["necessidade_aberta","em_cotacao","comprada"].includes(c.status)&&<button className={SOFT} disabled={saving} onClick={()=>window.confirm("Cancelar necessidade de compra?")&&executar("atualizar_compra",{compra_id:c.id,status:"cancelada"},"Necessidade cancelada.")}>Cancelar</button>}
      {c.status==="comprada"&&<button className={BTN} type="button" onClick={()=>{setItensNota([{...novoItem(),pn:c.pn.startsWith("SOLICITACAO-SEM-PN-")?"":c.pn,descricao:c.descricao||"",quantidade:String(c.quantidade),compra_id:String(c.id)}]);setAba("notas");}}>Receber com NF</button>}
     </div></TD></tr>)}/>
   </section>
  </>}

  {aba==="notas"&&<>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Entrada fiscal no estoque</h2>
    <form onSubmit={submitNF} className="space-y-5">
     <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[["numero_nf","Número da NF",true],["serie_nf","Série",false],["chave_nfe","Chave NF-e (44 dígitos, opcional)",false],["fornecedor","Fornecedor / emitente",true]].map(([chave,label,required])=>
       <Campo key={chave} label={label}><input required={required} className={INPUT} maxLength={chave==="chave_nfe"?44:200} value={nota[chave]} onChange={e=>{setNota(v=>({...v,[chave]:e.target.value}));setNotaId(crypto.randomUUID());}}/></Campo>)}
     </div>
     <div className="flex items-center justify-between"><h3 className="text-xs font-black text-slate-700">Itens recebidos</h3>
      <button type="button" className={SOFT} disabled={itensNota.length>=30} onClick={()=>{setItensNota(v=>[...v,novoItem()]);setNotaId(crypto.randomUUID());}}><Plus size={15}/> Adicionar item</button>
     </div>
     <div className="space-y-3">{itensNota.map((i,n)=><div key={i.id} className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between"><p className="text-xs font-black">Item {n+1}</p><button type="button" title="Remover" onClick={()=>{setItensNota(v=>v.length===1?[novoItem()]:v.filter(x=>x.id!==i.id));setNotaId(crypto.randomUUID());}} className="text-rose-600"><Trash2 size={16}/></button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
       <Campo label="PN / Código (opcional)"><input className={INPUT} value={i.pn} onChange={e=>alterItem(i.id,"pn",e.target.value.toUpperCase())}/></Campo>
       <Campo label="Descrição"><input className={INPUT} required value={i.descricao} onChange={e=>alterItem(i.id,"descricao",e.target.value)}/></Campo>
       <Campo label="Tipo"><select className={INPUT} value={i.tipo_item} onChange={e=>alterItem(i.id,"tipo_item",e.target.value)}><option value="PECA">Peça</option><option value="INSUMO">Insumo</option></select></Campo>
       <Campo label="Quantidade"><input className={INPUT} type="number" step="0.001" min="0.001" required value={i.quantidade} onChange={e=>alterItem(i.id,"quantidade",e.target.value)}/></Campo>
       <Campo label="Endereço"><input className={INPUT} value={i.localizacao} onChange={e=>alterItem(i.id,"localizacao",e.target.value)}/></Campo>
       <Campo label="Compra vinculada (ID)"><select className={INPUT} value={i.compra_id} onChange={e=>alterItem(i.id,"compra_id",e.target.value)}>
        <option value="">Sem vínculo</option>{compras.filter(c=>["comprada","em_cotacao","necessidade_aberta"].includes(c.status)).map(c=><option key={c.id} value={c.id}>#{c.id} · OS {c.numero_os}</option>)}
       </select></Campo>
      </div>
     </div>)}</div>
     <div className="flex justify-end"><button className={BTN} disabled={saving}><Truck size={16}/> Confirmar entrada da NF</button></div>
    </form>
   </section>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Notas de entrada registradas</h2>
    <Tabela colunas={["NF","Série","Fornecedor","Chave de acesso","Registrada em"]} linhas={(painel.notas||[]).map(n=><tr key={n.id}>
     <TD forte>{n.numero_nf}</TD><TD>{n.serie_nf}</TD><TD>{n.fornecedor}</TD><TD>{n.chave_nfe}</TD><TD>{dia(n.criado_em)}</TD></tr>)}/>
   </section>
  </>}

  {aba==="insumos"&&<>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Baixa de insumos operacionais</h2>
    <form className="grid gap-3 md:grid-cols-4" onSubmit={e=>{e.preventDefault();if(!window.confirm("Confirmar baixa de insumos no estoque?"))return;executar("saida_insumo",{...consumo,operacao_id:consumoId},"Insumo baixado do estoque.",()=>{setConsumo({estoque_id:"",quantidade:"1",numero_os:"",motivo:""});setConsumoId(crypto.randomUUID());});}}>
     <Campo label="Insumo"><select className={INPUT} required value={consumo.estoque_id} onChange={e=>{setConsumo(v=>({...v,estoque_id:e.target.value}));setConsumoId(crypto.randomUUID());}}><option value="">Selecione</option>{insumos.map(x=><option key={x.id} value={x.id}>{x.pn} · {x.descricao} ({fmt(x.saldo)})</option>)}</select></Campo>
     <Campo label="Quantidade"><input className={INPUT} required type="number" min="0.001" step="0.001" value={consumo.quantidade} onChange={e=>{setConsumo(v=>({...v,quantidade:e.target.value}));setConsumoId(crypto.randomUUID());}}/></Campo>
     <Campo label="OS (opcional)"><input className={INPUT} value={consumo.numero_os} onChange={e=>{setConsumo(v=>({...v,numero_os:e.target.value}));setConsumoId(crypto.randomUUID());}}/></Campo>
     <Campo label="Finalidade / área"><input className={INPUT} required value={consumo.motivo} onChange={e=>{setConsumo(v=>({...v,motivo:e.target.value}));setConsumoId(crypto.randomUUID());}} placeholder="Ex.: limpeza, manutenção, bancada"/></Campo>
     <div className="md:col-span-4 flex justify-end"><button className={BTN} disabled={saving}><PackageCheck size={15}/> Registrar consumo</button></div>
    </form>
   </section>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Saldos de insumos</h2>
    <Tabela colunas={["Código","Descrição","Saldo","Localização"]} linhas={insumos.map(x=><tr key={x.id}><TD forte>{x.pn}</TD><TD>{x.descricao}</TD><TD>{fmt(x.saldo)}</TD><TD>{x.localizacao}</TD></tr>)}/>
   </section>
  </>}

  {aba==="wip"&&<>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">{wip.id?"Movimentar produto em WIP":"Cadastrar produto em pré-entrada / WIP"}</h2>
    <form className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={e=>{e.preventDefault();executar("wip_salvar",wip,wip.id?"Movimentação WIP registrada.":"Produto incluído no pré-tratamento.",novoWip);}}>
     {wip.id&&<Campo label="Vincular OS após pré-entrada (opcional)"><input className={INPUT} value={wip.numero_os||""} onChange={e=>setWip(v=>({...v,numero_os:e.target.value}))} placeholder="Número da OS quando disponível"/></Campo>}
     {!wip.id&&<>
      <Campo label="OS (opcional, se já recebida)"><input className={INPUT} value={wip.numero_os} onChange={e=>setWip(v=>({...v,numero_os:e.target.value}))}/></Campo>
      <Campo label="Identificador de pré-entrada"><input className={INPUT} value={wip.identificador} onChange={e=>setWip(v=>({...v,identificador:e.target.value}))} placeholder="Etiqueta ou referência de chegada"/></Campo>
      <Campo label="Máquina / categoria"><input className={INPUT} value={wip.categoria} onChange={e=>setWip(v=>({...v,categoria:e.target.value}))}/></Campo>
      <Campo label="Origem"><input className={INPUT} value={wip.origem} onChange={e=>setWip(v=>({...v,origem:e.target.value}))}/></Campo>
      <Campo label="Marca"><input className={INPUT} value={wip.marca} onChange={e=>setWip(v=>({...v,marca:e.target.value}))}/></Campo>
      <Campo label="Modelo"><input className={INPUT} value={wip.modelo} onChange={e=>setWip(v=>({...v,modelo:e.target.value}))}/></Campo>
      <Campo label="Serial"><input className={INPUT} value={wip.serial} onChange={e=>setWip(v=>({...v,serial:e.target.value}))}/></Campo>
     </>}
     <Campo label="Etapa WIP"><select className={INPUT} value={wip.etapa} onChange={e=>setWip(v=>({...v,etapa:e.target.value}))}>{ETAPAS.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></Campo>
     <Campo label="Posição / endereço"><input className={INPUT} value={wip.endereco} onChange={e=>setWip(v=>({...v,endereco:e.target.value}))}/></Campo>
     {wip.id&&<Campo label="Motivo da movimentação"><input className={INPUT} required value={wip.motivo} onChange={e=>setWip(v=>({...v,motivo:e.target.value}))}/></Campo>}
     <div className="sm:col-span-2 xl:col-span-4"><Campo label="Observações"><input className={INPUT} value={wip.observacoes} onChange={e=>setWip(v=>({...v,observacoes:e.target.value}))}/></Campo></div>
     <div className="flex flex-wrap gap-2 sm:col-span-2 xl:col-span-4"><button className={BTN} disabled={saving}><Warehouse size={16}/> {wip.id?"Salvar movimentação":"Cadastrar WIP"}</button>{wip.id&&<button type="button" className={SOFT} onClick={novoWip}>Cancelar edição</button>}</div>
    </form>
   </section>
   <section className={BOX}><h2 className="mb-4 text-sm font-black">Carteira de pré-entrada e produtos na linha</h2>
    <Tabela colunas={["OS / Etiqueta","Máquina / modelo","Etapa","Posição","Última atualização","Ação"]} linhas={filtrados(wips).map(x=><tr key={x.id}>
     <TD forte>{x.numero_os||x.identificador||x.id.slice(0,8)}</TD><TD>{x.categoria} · {x.marca} {x.modelo}</TD>
     <TD>{ETAPAS.find(e=>e[0]===x.etapa)?.[1]||x.etapa}</TD><TD>{x.endereco}</TD><TD>{dia(x.atualizado_em)}</TD>
     <TD><button type="button" className={SOFT} onClick={()=>{setWip({id:x.id,numero_os:x.numero_os||"",etapa:x.etapa,endereco:x.endereco||"",observacoes:x.observacoes||"",motivo:""});window.scrollTo({top:0,behavior:"smooth"});}}>Movimentar</button></TD>
    </tr>)}/>
    <p className="mt-3 text-[11px] text-slate-400">O WIP é uma camada de controle logístico: não altera automaticamente a etapa técnica ou o status da OS.</p>
   </section>
  </>}

  {aba==="movimentos"&&<section className={BOX}>
   <h2 className="mb-4 text-sm font-black">Razão de entradas e saídas</h2>
   <Tabela colunas={["Data","Tipo","Código","Descrição","OS","Quantidade","Saldo anterior → novo","Operador"]} linhas={filtrados(movimentos).map(x=><tr key={x.id}>
    <TD>{dia(x.criado_em)}</TD><TD forte>{x.tipo.replaceAll("_"," ")}</TD><TD>{x.pn}</TD><TD>{x.descricao}</TD>
    <TD>{x.numero_os}</TD><TD>{fmt(x.quantidade)}</TD><TD>{fmt(x.antes)} → {fmt(x.depois)}</TD><TD>{x.operador}</TD></tr>)}/>
   <h3 className="mb-3 mt-8 text-sm font-black">Peças recuperadas por desmembramento</h3>
   <Tabela colunas={["Data","OS origem","Código interno / PN","Descrição","Quantidade"]} linhas={(painel.desmembramentos||[]).map(x=><tr key={x.id}>
    <TD>{dia(x.criado_em)}</TD><TD forte>{x.numero_os}</TD><TD>{x.codigo_estoque}</TD><TD>{x.descricao}</TD><TD>{fmt(x.quantidade)}</TD></tr>)}/>
  </section>}

  {aba==="desmembramento"&&<section className={BOX}>
    <div className="flex items-center gap-3"><div className="rounded-xl bg-[#F3EFF5] p-3 text-[#43284F]"><Wrench size={24}/></div>
      <div><h2 className="text-sm font-black">Desmembramento de peças</h2>
       <p className="mt-1 text-xs text-slate-500">OS aprovada, identificação de componentes, PN opcional e entrada no mesmo estoque.</p></div></div>
    <div className="mt-5"><Link to="/v2/linha-branca/desmembramento" className={BTN}><Package size={16}/> Abrir bancada de desmembramento</Link></div>
    <h3 className="mb-3 mt-8 text-sm font-black">Últimas recuperações</h3>
    <Tabela colunas={["OS","Peça","Código","Quantidade","Data"]} linhas={(painel.desmembramentos||[]).map(x=><tr key={x.id}>
      <TD forte>{x.numero_os}</TD><TD>{x.descricao}</TD><TD>{x.codigo_estoque}</TD><TD>{fmt(x.quantidade)}</TD><TD>{dia(x.criado_em)}</TD></tr>)}/>
   </section>}
 </div>;
}
