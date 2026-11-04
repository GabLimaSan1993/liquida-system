import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity, ArrowRight, BarChart3, CalendarDays, CheckCircle2, ChevronRight,
  ClipboardList, Clock3, Database, DownloadCloud, Factory,
  Layers3, PackageCheck, RefreshCcw, ShieldAlert, Timer, TrendingUp,
  Warehouse, WashingMachine, Wrench,
} from "lucide-react";
import { supabase } from "../../lib/supabase.js";
import { useAuth } from "../../AuthContext.jsx";

const N=v=>Number(v||0).toLocaleString("pt-BR");
const DATA=v=>{
  if(!v)return "—";
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
    const [ano,mes,dia]=v.split("-");
    return `${dia}/${mes}/${ano}`;
  }
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"});
};
const DATA_CURTA=v=>{
  const p=String(v||"").slice(0,10).split("-");
  return p.length===3?`${p[2]}/${p[1]}`:"—";
};
const BOX="rounded-2xl border border-slate-200 bg-white shadow-[0_4px_24px_rgba(15,23,42,0.035)]";
const FAMILIAS={
  "Lavadoras":{rota:"/v2/linha-branca/lavadoras",icone:WashingMachine},
  "Climatização":{rota:"/v2/linha-branca/climatizacao",icone:Factory},
  "Refrigeração":{rota:"/v2/linha-branca/refrigeracao",icone:Layers3},
  "Outras categorias":{rota:"/v2/linha-branca/reparos-outros",icone:Warehouse,permissao:"/v2/linha-branca"},
};

function Indicador({icone:Icon,titulo,valor,nota,accent="violet"}){
  const tons={
    violet:"bg-violet-50 text-violet-700",
    blue:"bg-blue-50 text-blue-700",
    amber:"bg-amber-50 text-amber-700",
    emerald:"bg-emerald-50 text-emerald-700",
    slate:"bg-slate-100 text-slate-600",
  };
  return <div className={BOX+" min-w-0 p-4 md:p-5"}>
    <div className="flex items-start justify-between gap-2">
      <p className="text-[11px] font-bold uppercase leading-5 tracking-[.055em] text-slate-500">{titulo}</p>
      <span className={"flex h-9 w-9 shrink-0 items-center justify-center rounded-xl "+(tons[accent]||tons.violet)}>
        <Icon size={18}/>
      </span>
    </div>
    <p className="mt-3 text-3xl font-black tracking-tight text-[#20142D] tabular-nums md:text-[34px]">{N(valor)}</p>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">{nota}</p>
  </div>;
}

export default function LinhaBrancaHomePage(){
  const navigate=useNavigate();
  const {hasAccess}=useAuth();
  const [dados,setDados]=useState(null);
  const [carregando,setCarregando]=useState(true);
  const [erro,setErro]=useState("");
  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{
      const {data,error}=await supabase.rpc("linha_branca_painel_operacional");
      if(error)throw new Error(error.message);
      if(!data?.totais)throw new Error("A consulta não retornou os indicadores esperados.");
      setDados(data);
    }catch(e){setErro(e.message||"Não foi possível atualizar o painel.");}
    finally{setCarregando(false);}
  },[]);
  useEffect(()=>{void carregar();},[carregar]);

  const totais=dados?.totais||{};
  const req=dados?.requisicoes||{};
  const fisico=dados?.inventario_lavadoras||{};
  const producao=dados?.producao||{};
  const filas=dados?.status_sistema||{};
  const familias=dados?.familias||[];
  const serie=dados?.serie_producao||[];
  const escala=useMemo(()=>Math.max(1,...serie.map(p=>Number(p.oss||0))),[serie]);
  const status=[
    {label:"Aguardando triagem",valor:filas.aguardando_triagem,cor:"bg-sky-500"},
    {label:"Em triagem",valor:filas.em_triagem,cor:"bg-blue-500"},
    {label:"Aguardando peça / CMP",valor:filas.aguardando_cmp,cor:"bg-amber-500"},
    {label:"Em reparo",valor:filas.em_reparo,cor:"bg-violet-600"},
    {label:"Bancada de testes",valor:filas.testes,cor:"bg-teal-500"},
    {label:"Limpeza",valor:filas.limpeza,cor:"bg-cyan-500"},
    {label:"Qualidade",valor:filas.qualidade,cor:"bg-emerald-500"},
  ];
  const maxStatus=Math.max(1,...status.map(f=>Number(f.valor||0)));

  function ir(rota,permissao=rota){
    if(hasAccess(permissao))navigate(rota);
  }

  return <div className="space-y-6">
    <section className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-[10px] font-black uppercase tracking-[.19em] text-[#765D81]">Liquida System · Linha Branca</div>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-[#20142D] sm:text-4xl">Visão geral da operação</h1>
        <p className="mt-2 max-w-[770px] text-sm leading-6 text-slate-500">
          Estoque, filas de produção, requisições e movimentações. Indicadores do sistema
          e conferência física apresentados separadamente para permitir a gestão correta.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-right text-[11px] leading-5 text-slate-500">
          <span className="block font-bold text-slate-700">Dados do Liquida</span>
          <span>{dados?DATA(dados.atualizado_em):"Aguardando atualização"}</span>
        </div>
        <button type="button" onClick={()=>void carregar()} disabled={carregando}
          className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#D8CADA] bg-white px-4 text-xs font-black text-[#43284F] transition hover:bg-violet-50 disabled:opacity-50">
          <RefreshCcw size={16} className={carregando?"animate-spin":""}/> Atualizar
        </button>
      </div>
    </section>

    {erro&&<div role="alert" className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-bold text-rose-700">
      <ShieldAlert size={16}/>{erro}
    </div>}
    {carregando&&!dados&&<div className={BOX+" p-14 text-center text-sm text-slate-500"}>
      <RefreshCcw size={20} className="mx-auto mb-3 animate-spin text-violet-600"/>
      Carregando indicadores operacionais...
    </div>}

    {dados&&<>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <Indicador icone={Activity} titulo="Em fluxo na base" valor={totais.em_fluxo_sistema}
          nota="Status em aberto no sistema; não confirma presença física" accent="violet"/>
        <Indicador icone={Database} titulo="OSs cadastradas" valor={totais.total_base}
          nota="Base completa, incluindo histórico e Aging" accent="slate"/>
        <Indicador icone={DownloadCloud} titulo="Entradas datadas hoje" valor={totais.entradas_hoje}
          nota="Data de entrada cadastrada; não comprova recebimento" accent="blue"/>
        <Indicador icone={Wrench} titulo="Requisições abertas" valor={req.abertas}
          nota={`${N(req.oss)} OSs vinculadas · ${N(req.aging_7d)} pedidos acima de 7 dias`} accent="amber"/>
        <Indicador icone={CheckCircle2} titulo="Finalizadas na base" valor={totais.finalizadas}
          nota="Status de finalização; não equivale à venda" accent="emerald"/>
        <Indicador icone={ClipboardList} titulo="Condenadas / Scrap" valor={totais.condenadas}
          nota="Registros acumulados de destinação no sistema" accent="slate"/>
      </div>

      <div className="grid gap-4 2xl:grid-cols-[1.18fr_.82fr]">
        <section className={BOX+" overflow-hidden"}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-black text-slate-900"><Warehouse size={17} className="text-violet-700"/> Conferência física · Lavadoras</p>
              <p className="mt-1 text-[11px] text-slate-500">Referência: {DATA(fisico.data_referencia)} · relação fornecida pela operação</p>
            </div>
            {hasAccess("/v2/linha-branca/gestao/estoque")&&
              <button type="button" onClick={()=>ir("/v2/linha-branca/gestao/estoque")}
                className="flex items-center gap-1 text-xs font-black text-violet-700 hover:underline">Abrir estoque <ArrowRight size={14}/></button>}
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-3">
            {[
              {titulo:"Relação Reparo / CMP",valor:fisico.relacao_cmp,nota:"OSs listadas; etapas atuais podem ter avançado",cor:"bg-violet-50 text-violet-800"},
              {titulo:"Relação Triagem",valor:fisico.relacao_triagem,nota:"OSs da relação física original",cor:"bg-blue-50 text-blue-800"},
              {titulo:"Relação Scrap",valor:fisico.relacao_scrap,nota:"Segregadas da produção",cor:"bg-rose-50 text-rose-800"},
            ].map(item=><div key={item.titulo} className={"rounded-xl p-4 "+item.cor}>
              <p className="text-[11px] font-bold">{item.titulo}</p>
              <p className="mt-2 text-3xl font-black tabular-nums">{N(item.valor)}</p>
              <p className="mt-2 text-[10px] leading-4 opacity-80">{item.nota}</p>
            </div>)}
          </div>
          <p className="border-t border-slate-100 px-5 py-3 text-[11px] leading-5 text-slate-500">
            Este é um recorte de lavadoras encaminhado para conferência, não o inventário físico completo de todas as famílias.
            No estoque, a etapa atual de cada OS prevalece sobre sua classificação na lista original.
          </p>
        </section>

        <section className={BOX+" p-5"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <TrendingUp size={17} className="text-violet-700"/> Atividade documentada · 7 dias
              </h2>
              <p className="mt-1 text-[11px] text-slate-500">OSs distintas com evento de produção registrado</p>
            </div>
            <div className="flex gap-5">
              <div><p className="text-[10px] font-bold text-slate-500">Hoje</p><p className="text-2xl font-black text-[#43284F]">{N(producao.os_hoje)}</p></div>
              <div><p className="text-[10px] font-bold text-slate-500">7 dias</p><p className="text-2xl font-black text-[#43284F]">{N(producao.os_7d)}</p></div>
            </div>
          </div>
          <div className="mt-6 flex h-40 items-end gap-2 border-b border-slate-200 pb-1">
            {serie.map(d=><div key={d.data} title={`${DATA_CURTA(d.data)} · ${N(d.oss)} OS(s)`}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-bold text-slate-600">{N(d.oss)}</span>
              <div className="w-full max-w-11 rounded-t-md bg-gradient-to-t from-[#56316B] to-[#9E72B4] transition-all"
                style={{height:`${Math.max(3,Number(d.oss||0)/escala*102)}px`}}/>
            </div>)}
          </div>
          <div className="mt-2 flex gap-2">
            {serie.map(d=><div key={d.data} className="min-w-0 flex-1 text-center text-[10px] text-slate-500">{DATA_CURTA(d.data)}</div>)}
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 p-3 text-[11px] leading-5 text-slate-600">
            <strong>Cobertura parcial:</strong> atualmente os eventos de produção detalhados vêm principalmente da Bancada de Testes.
            Não representam toda a produção diária da Linha Branca.
          </p>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_.95fr]">
        <section className={BOX+" p-5"}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
                <BarChart3 size={17} className="text-violet-700"/> Filas e etapas no Liquida
              </h2>
              <p className="mt-1 text-[11px] leading-5 text-slate-500">
                Distribuição dos status da base completa, incluindo dados importados do Aging
              </p>
            </div>
            {hasAccess("/v2/linha-branca/gestao/producao")&&
              <button onClick={()=>ir("/v2/linha-branca/gestao/producao")} type="button"
                className="inline-flex items-center gap-1 text-xs font-black text-violet-700 hover:underline">
                Ver gestão <ChevronRight size={15}/>
              </button>}
          </div>
          <div className="mt-5 space-y-4">
            {status.map(f=><div key={f.label} className="space-y-1.5">
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="font-semibold text-slate-700">{f.label}</span>
                <strong className="tabular-nums text-slate-900">{N(f.valor)}</strong>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                <div className={f.cor+" h-full rounded-full transition-all"}
                  style={{width:`${Math.max(0,Number(f.valor||0)/maxStatus*100)}%`}}/>
              </div>
            </div>)}
          </div>
          <p className="mt-5 flex gap-2 rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">
            <ShieldAlert size={15} className="mt-0.5 shrink-0"/>
            <span><strong>Não é contagem física.</strong> As filas indicam o que consta no banco, e precisam de conciliação por área antes de representar máquinas realmente no chão de fábrica.</span>
          </p>
        </section>

        <section className={BOX+" p-5"}>
          <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
            <Layers3 size={17} className="text-violet-700"/> Famílias da Linha Branca
          </h2>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">Total de OSs e status em fluxo por família, segundo registros do sistema</p>
          <div className="mt-4 divide-y divide-slate-100">
            {familias.map(f=>{
              const conf=FAMILIAS[f.familia]||{};
              const Icon=conf.icone||Factory;
              const acesso=conf.rota&&hasAccess(conf.permissao||conf.rota);
              return <div key={f.familia} className="flex flex-wrap items-center gap-3 py-3.5">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                  <Icon size={20}/>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900">{f.familia}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{N(f.total_base)} OSs na base · {N(f.triagem_pendente)} com status Aguardando Triagem</p>
                </div>
                <div className="text-right">
                  <p className="text-xl font-black text-[#43284F] tabular-nums">{N(f.ativos_sistema)}</p>
                  <p className="text-[10px] font-semibold text-slate-500">em fluxo na base</p>
                </div>
                {acesso&&<button type="button" onClick={()=>ir(conf.rota,conf.permissao||conf.rota)}
                  title={`Abrir ${f.familia}`}
                  className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-violet-50 hover:text-violet-700">
                  <ChevronRight size={17}/>
                </button>}
              </div>;
            })}
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-[#F5F1F7] p-4">
            <div><p className="text-[11px] font-bold text-slate-600">Entradas cadastradas · 7 dias</p><p className="mt-1 text-2xl font-black text-[#43284F]">{N(totais.entradas_7d)}</p></div>
            <div><p className="text-[11px] font-bold text-slate-600">Maior aging de requisição</p><p className="mt-1 text-2xl font-black text-[#43284F]">{N(req.maior_aging)}<span className="ml-1 text-sm font-bold">dias</span></p></div>
          </div>
        </section>
      </div>

      <section className={BOX+" p-5"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900">
              <Timer size={17} className="text-violet-700"/> Pendências que exigem acompanhamento
            </h2>
            <p className="mt-1 text-[11px] text-slate-500">Informações acionáveis, sem misturar as relações físicas com o histórico</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-amber-900"><Wrench size={15}/> Peças aguardando atendimento</p>
            <p className="mt-2 text-3xl font-black text-amber-900">{N(req.abertas)}</p>
            <p className="mt-1 text-[11px] text-amber-900/80">{N(req.aging_7d)} solicitações acima de 7 dias; aging máximo {N(req.maior_aging)} dias</p>
            {hasAccess("/v2/linha-branca/lavadoras/reparos")&&
              <button type="button" onClick={()=>ir("/v2/linha-branca/lavadoras/reparos")}
                className="mt-3 inline-flex items-center gap-1 text-xs font-black text-amber-900 hover:underline">Ver reparos de lavadoras <ArrowRight size={14}/></button>}
          </div>
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-blue-900"><Clock3 size={15}/> Aguardando triagem no sistema</p>
            <p className="mt-2 text-3xl font-black text-blue-900">{N(totais.aguardando_triagem)}</p>
            <p className="mt-1 text-[11px] text-blue-900/80">Conferir presença física e origem de cada registro antes de dimensionar a fila</p>
            {hasAccess("/v2/linha-branca/gestao/producao")&&
              <button type="button" onClick={()=>ir("/v2/linha-branca/gestao/producao")}
                className="mt-3 inline-flex items-center gap-1 text-xs font-black text-blue-900 hover:underline">Abrir produção <ArrowRight size={14}/></button>}
          </div>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <p className="flex items-center gap-2 text-xs font-black text-violet-900"><CalendarDays size={15}/> Validar a base importada</p>
            <p className="mt-2 text-3xl font-black text-violet-900">{N(totais.em_fluxo_sistema)}</p>
            <p className="mt-1 text-[11px] text-violet-900/80">Status em fluxo que ainda não equivalem a inventário confirmado</p>
            {hasAccess("/v2/linha-branca/uploads")&&
              <button type="button" onClick={()=>ir("/v2/linha-branca/uploads")}
                className="mt-3 inline-flex items-center gap-1 text-xs font-black text-violet-900 hover:underline">Ver upload de Aging <ArrowRight size={14}/></button>}
          </div>
        </div>
      </section>
    </>}
  </div>;
}
