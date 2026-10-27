import { createElement } from 'react';
import { ArrowUpRight, CheckCircle2, ClipboardCheck, Trophy, Users, Wrench } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { CORES_ETAPAS_BRANCA, ETAPAS_BRANCA } from '../../services/gestaoLinhaBrancaUtils.js';

const numero=n=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:1});
const percentual=n=>n===null?'—':`${numero(n)}%`;
const caixa='rounded-2xl border border-slate-200 bg-white p-5 shadow-sm';
const iniciais=nome=>nome.split(/\s+/).filter(Boolean).slice(0,2).map(n=>n[0]).join('');

function Indicador({titulo,valor,detalhe,Icon,cor,destaque=false}) {
 return <div className={`relative overflow-hidden rounded-2xl border p-5 ${destaque?'border-violet-700 bg-violet-700 text-white shadow-lg shadow-violet-100':'border-slate-200 bg-white shadow-sm'}`}>
  <div className="flex items-center justify-between gap-3"><p className={`text-xs font-bold ${destaque?'text-violet-100':'text-slate-500'}`}>{titulo}</p><span className={`rounded-xl p-2 ${destaque?'bg-white/15':cor}`}>{createElement(Icon,{size:20,'aria-hidden':true})}</span></div>
  <p className="mt-4 text-4xl font-black tracking-tight sm:text-5xl">{valor}</p>
  <p className={`mt-3 text-xs leading-5 ${destaque?'text-violet-100':'text-slate-500'}`}>{detalhe}</p>
 </div>;
}

function DistribuicaoDestinoCard({titulo,subtitulo,dados,total,foco='aprovado',rotuloCentro='aprovados',rodape}) {
 const fatia=dados.find(d=>d.id===foco);
 const taxa=total?((fatia?.total||0)/total)*100:null;
 const validas=dados.filter(d=>d.total>0);
 return <section className={caixa}>
  <div className="flex items-start justify-between gap-3">
   <div><h3 className="font-black">{titulo}</h3><p className="mt-1 text-xs text-slate-500">{subtitulo}</p></div>
   <span className="rounded-lg bg-amber-50 p-2 text-amber-600"><ArrowUpRight size={20}/></span>
  </div>
  {total>0?<div className="relative mx-auto h-56 w-64 max-w-full" role="img"
    aria-label={dados.map(d=>`${d.nome}: ${d.total}`).join('; ')}>
   <ResponsiveContainer width="100%" height="100%">
    <PieChart><Pie data={validas} isAnimationActive={false} dataKey="total" nameKey="nome"
      innerRadius={73} outerRadius={98} paddingAngle={3} stroke="none">
      {validas.map(d=><Cell key={d.id} fill={d.cor}/>)}
    </Pie><Tooltip formatter={(valor,nome)=>[`${numero(valor)} OS`,nome]}/></PieChart>
   </ResponsiveContainer>
   <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
    <strong className="text-3xl font-black">{percentual(taxa)}</strong>
    <span className="mt-1 text-xs text-slate-500">{rotuloCentro}</span>
   </div>
  </div>:<div className="flex h-56 items-center justify-center text-center text-sm text-slate-400">
    Nenhuma OS no recorte<br/>selecionado.
  </div>}
  <ul className="space-y-3">{dados.map(d=><li key={d.id} className="flex items-center justify-between gap-3 text-xs">
   <span className="flex items-center gap-2 text-slate-600">
    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{background:d.cor}}/>{d.nome}
   </span>
   <span className="shrink-0 font-bold">{numero(d.total)} <span className="ml-2 font-normal text-slate-400">
     {percentual(total?d.total/total*100:null)}
   </span></span>
  </li>)}</ul>
  <p className="mt-5 border-t border-slate-100 pt-3 text-[10px] leading-5 text-slate-400">{rodape}</p>
 </section>;
}

export default function PainelProducaoBranca({painel,resumo,periodo,etapa,onEtapa,onTecnicos}) {
 const maior=painel.ranking[0]?.total||1;
 const maiorCategoria=Math.max(1,...painel.categorias.map(c=>c.equipamentos));
 return <div className="space-y-5">
  <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.18em] text-violet-600">Resultado da operação</p><h2 className="mt-1 text-xl font-black">{periodo}</h2></div><p className="flex items-center gap-2 text-xs text-slate-500"><Users size={15}/>{numero(painel.equipamentos)} equipamentos · {numero(painel.atividades)} atividades</p></div>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <Indicador titulo="Equipamentos triados" valor={numero(painel.triados)} detalhe="OS únicas com triagem concluída no período." Icon={ClipboardCheck} destaque/>
   <Indicador titulo="Triados enviados para reparo" valor={percentual(painel.taxaReparo)} detalhe={`${numero(painel.reparo)} de ${numero(painel.triados)} equipamentos triados.`} Icon={Wrench} cor="bg-amber-50 text-amber-600"/>
   <Indicador titulo="OS com reparo concluído" valor={numero(painel.reparados)} detalhe="Ao menos uma área de reparo concluída no período." Icon={Wrench} cor="bg-blue-50 text-blue-600"/>
   <Indicador titulo="Aprovados na Qualidade" valor={numero(painel.finalizados)} detalhe={`${numero(painel.higienizados)} equipamentos na Higienização no período.`} Icon={CheckCircle2} cor="bg-emerald-50 text-emerald-600"/>
  </div>

  <div className="grid gap-5 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
   <section className={caixa}>
    <div className="flex items-start justify-between gap-3"><div><h3 className="font-black">Qual foi o destino da triagem?</h3><p className="mt-1 text-xs text-slate-500">Participação sobre os equipamentos triados.</p></div><span className="rounded-lg bg-amber-50 p-2 text-amber-600"><ArrowUpRight size={20}/></span></div>
    {painel.triados>0?<div className="relative mx-auto h-56 w-64 max-w-full" role="img" aria-label={painel.distribuicao.map(d=>`${d.nome}: ${d.total}`).join('; ')}>
     <ResponsiveContainer width="100%" height="100%"><PieChart><Pie isAnimationActive={false} data={painel.distribuicao.filter(d=>d.total>0)} dataKey="total" nameKey="nome" innerRadius={73} outerRadius={98} paddingAngle={3} stroke="none">{painel.distribuicao.filter(d=>d.total>0).map(d=><Cell key={d.id} fill={d.cor}/>)}</Pie><Tooltip formatter={(valor,nome)=>[`${numero(valor)} equipamentos`,nome]}/></PieChart></ResponsiveContainer>
     <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><strong className="text-3xl font-black">{percentual(painel.taxaReparo)}</strong><span className="mt-1 text-xs text-slate-500">para reparo</span></div>
    </div>:<div className="flex h-56 items-center justify-center text-center text-sm text-slate-400">Nenhuma triagem concluída<br/>nos filtros selecionados.</div>}
    <ul className="space-y-3">{painel.distribuicao.map(d=><li key={d.id} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2 text-slate-600"><span className="h-2.5 w-2.5 rounded-full" style={{background:d.cor}}/>{d.nome}</span><span className="font-bold">{numero(d.total)} <span className="ml-2 font-normal text-slate-400">{percentual(painel.triados?d.total/painel.triados*100:null)}</span></span></li>)}</ul>
    <p className="mt-5 border-t border-slate-100 pt-3 text-[10px] leading-5 text-slate-400">Cada OS conta uma vez. Se houve envio para reparo no período, ela entra nessa proporção, mesmo com nova triagem posterior.</p>
   </section>

   <section className={caixa}>
    <div className="mb-5 flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-black"><Trophy size={18} className="text-amber-500"/>Ranking por colaborador</h3><p className="mt-1 text-xs text-slate-500">Atividades concluídas{etapa?` · ${etapa}`:' em todas as etapas de produção'}.</p></div><button type="button" onClick={onTecnicos} className="shrink-0 text-xs font-bold text-violet-700">Ver todos</button></div>
    <ol className="space-y-4">{painel.ranking.slice(0,8).map((p,i)=><li key={p.tecnico} className="flex items-center gap-3">
     <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-black ${i===0?'bg-amber-100 text-amber-700':'text-slate-400'}`}>{i+1}</span>
     <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-50 text-xs font-black text-violet-600 sm:flex">{iniciais(p.tecnico)}</span>
     <div className="min-w-0 flex-1"><div className="mb-2 flex items-end justify-between gap-3"><p className="truncate text-xs font-bold" title={p.tecnico}>{p.tecnico}</p><p className="shrink-0 text-sm font-black">{numero(p.total)} <span className="text-[10px] font-normal text-slate-400">atividades · {numero(p.os)} OS</span></p></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-slate-100"><div className="flex h-full overflow-hidden rounded-full" style={{width:`${p.total/maior*100}%`}}>{ETAPAS_BRANCA.filter(e=>e!=='Recebimento').map(e=><span key={e} title={`${e}: ${p.etapas[e]||0}`} style={{width:`${(p.etapas[e]||0)/p.total*100}%`,background:CORES_ETAPAS_BRANCA[ETAPAS_BRANCA.indexOf(e)]}}/>)}</div></div>
     </div>
    </li>)}</ol>
    {!painel.ranking.length&&<p className="py-14 text-center text-sm text-slate-400">Sem produção com colaborador identificado.</p>}
    <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-t border-slate-100 pt-4">{ETAPAS_BRANCA.slice(1).map((e,i)=><span key={e} className="flex items-center gap-1.5 text-[10px] text-slate-500"><span className="h-2 w-2 rounded-full" style={{background:CORES_ETAPAS_BRANCA[i+1]}}/>{e}</span>)}</div>
    <p className="mt-3 text-[10px] leading-5 text-slate-400">Uma OS pode gerar atividades em várias etapas. Recebimentos não entram no ranking.{painel.semTecnico>0?` Há ${numero(painel.semTecnico)} atividades sem colaborador identificado fora do ranking.`:''}</p>
   </section>
  </div>

  <div className="grid gap-5 xl:grid-cols-2">
   <DistribuicaoDestinoCard
    titulo="Qual foi o destino dos reparos?"
    subtitulo="Situação atual das OS com atividade de reparo no período."
    dados={painel.distribuicaoReparo}
    total={painel.totalReparo}
    foco="aprovado"
    rotuloCentro="finalizados"
    rodape="Cada OS com atividade de reparo no período conta uma vez, independentemente da quantidade de áreas ou retrabalhos. O destino é a situação atual da OS."
   />
   <DistribuicaoDestinoCard
    titulo="Qual é o resultado da operação inteira?"
    subtitulo="Situação atual das OS trabalhadas em qualquer etapa no período."
    dados={painel.distribuicaoOperacao}
    total={painel.totalOperacao}
    foco="aprovado"
    rotuloCentro="finalizados"
    rodape="Cada OS com atividade operacional no período conta uma vez. Mostra o status atual, não uma reconstrução histórica do fechamento naquela data."
   />
  </div>

  <section className={caixa}>
   <h3 className="font-black">Produção por etapa</h3><p className="mt-1 text-xs text-slate-500">Clique em uma etapa para filtrar os indicadores. Uma OS pode ter várias atividades.</p>
   <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-6">{resumo.etapas.map((e,i)=><button type="button" key={e.etapa} onClick={()=>onEtapa(etapa===e.etapa?'':e.etapa)} aria-pressed={etapa===e.etapa} className={`rounded-xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-sm ${etapa===e.etapa?'border-violet-300 bg-violet-50':'border-slate-100 bg-slate-50/70'}`}>
    <span className="mb-3 block h-1 w-9 rounded-full" style={{background:CORES_ETAPAS_BRANCA[i]}}/><p className="text-3xl font-black">{numero(e.total)}</p><p className="mt-1 text-xs font-bold">{e.etapa}</p><p className="mt-2 text-[10px] text-slate-400">{e.retrabalhos} retrabalhos</p>
   </button>)}</div>
  </section>

  <section className={caixa}><h3 className="font-black">Equipamentos trabalhados por categoria</h3><p className="mt-1 text-xs text-slate-500">OS únicas com atividade de produção no período.</p><div className="mt-5 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">{painel.categorias.map(c=><div key={c.nome}><div className="mb-2 flex items-end justify-between gap-2"><p className="text-xs font-bold text-slate-600">{c.nome}</p><p className="text-xl font-black">{numero(c.equipamentos)}</p></div><div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-violet-500" style={{width:`${c.equipamentos/maiorCategoria*100}%`}}/></div><p className="mt-2 text-[10px] text-slate-400">{numero(c.triados)} triados · {numero(c.atividades)} atividades</p></div>)}</div></section>
 </div>;
}
