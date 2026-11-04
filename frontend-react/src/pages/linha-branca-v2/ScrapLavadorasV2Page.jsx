import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Camera, RefreshCcw, Search, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const DATA=v=>v?new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"}):"—";

export default function ScrapLavadorasV2Page(){
  const [dados,setDados]=useState([]);
  const [busca,setBusca]=useState("");
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState("");
  const [abrindoFoto,setAbrindoFoto]=useState("");
  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try {
      const {data,error}=await supabase.rpc("linha_branca_lavadoras_scrap_fila");
      if(error)throw new Error(error.message);
      setDados(data?.itens||[]);
    }catch(e){setErro(e.message||"Falha ao consultar Scrap.");}
    finally{setCarregando(false);}
  },[]);
  useEffect(()=>{void carregar();},[carregar]);
  const filtradas=useMemo(()=>dados.filter(i=>
    [i.numero_os,i.marca,i.modelo,i.motivo,i.serial_number].join(" ").toLowerCase().includes(busca.toLowerCase())
  ),[dados,busca]);
  async function abrirFoto(caminho){
    setAbrindoFoto(caminho);setErro("");
    try{
      const {data,error}=await supabase.storage.from("linha-branca-condenacoes").createSignedUrl(caminho,600);
      if(error||!data?.signedUrl)throw new Error(error?.message||"Foto não localizada.");
      window.open(data.signedUrl,"_blank","noopener,noreferrer");
    }catch(e){setErro("Foto não disponível: "+e.message);}
    finally{setAbrindoFoto("");}
  }
  return <div className="mx-auto max-w-[1480px] space-y-5 p-4 text-slate-900 md:p-7">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[.15em] text-rose-600">Linha Branca · Lavadoras</p>
        <h1 className="mt-1 flex items-center gap-2 text-3xl font-black"><Trash2 className="text-rose-600"/> Scrap</h1>
        <p className="mt-2 text-sm text-slate-500">Lavadoras condenadas sem peças aproveitáveis. Justificativas, responsáveis e fotografias permanecem vinculadas à OS.</p>
      </div>
      <button type="button" onClick={()=>void carregar()} disabled={carregando}
        className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold disabled:opacity-50">
        <RefreshCcw size={15}/> Atualizar
      </button>
    </div>
    {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">{erro}</div>}
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
      <div><strong className="text-xl">{dados.length}</strong><span className="ml-2 text-xs text-slate-500">OSs em Scrap</span></div>
      <label className="relative block w-full max-w-[360px]">
        <Search size={16} className="absolute left-3 top-3 text-slate-400"/>
        <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar OS, modelo, serial ou motivo"
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-rose-300"/>
      </label>
    </div>
    {carregando&&<p className="rounded-xl bg-white p-6 text-sm text-slate-500">Carregando OSs...</p>}
    {!carregando&&!filtradas.length&&<p className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">Nenhuma OS encontrada.</p>}
    <div className="grid gap-3 xl:grid-cols-2">
      {filtradas.map(i=><article key={i.os_id} className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2">
          <div>
            <h2 className="text-base font-black">OS {i.numero_os}</h2>
            <p className="mt-1 text-xs text-slate-600">{[i.marca,i.modelo,i.serial_number].filter(Boolean).join(" · ")||"Modelo não informado"}</p>
          </div>
          <span className="rounded-lg bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">Scrap</span>
        </div>
        <p className="text-xs text-slate-600"><strong>Condenado por:</strong> {i.condenado_por||i.tecnico_responsavel||"Não informado"} · {DATA(i.data_condenacao)}</p>
        {i.motivo?<p className="whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-700"><strong>Motivo:</strong> {i.motivo}</p>:
          <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle size={16}/><span>Registro histórico sem laudo de condenação com fotos. Não criar evidências retroativas.</span>
          </div>}
        {Array.isArray(i.fotos)&&i.fotos.length>0&&<div>
          <p className="mb-2 text-xs font-black text-slate-700">Fotos da condenação ({i.fotos.length})</p>
          <div className="flex flex-wrap gap-2">
            {i.fotos.map((f,k)=><button key={f} type="button" disabled={abrindoFoto===f}
              onClick={()=>void abrirFoto(f)}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-800 disabled:opacity-50">
              <Camera size={14}/> Foto {k+1}
            </button>)}
          </div>
        </div>}
      </article>)}
    </div>
  </div>;
}
