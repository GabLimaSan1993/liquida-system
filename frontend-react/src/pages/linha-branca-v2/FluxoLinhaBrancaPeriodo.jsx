import {Activity,CheckCircle2,ClipboardCheck,Clock3,Factory,ShieldCheck} from "lucide-react";

const fmt=v=>Number(v||0).toLocaleString("pt-BR");

function Card({titulo,valor,descricao,Icon,principal=false}){
 return <div className={"rounded-xl border p-4 "+(principal?"border-violet-200 bg-violet-50":"border-slate-200 bg-white")}>
  <div className="flex items-center justify-between gap-2">
   <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">{titulo}</span>
   <Icon className="h-4 w-4 text-violet-600"/>
  </div>
  <div className="mt-2 text-2xl font-black tabular-nums text-slate-900">{fmt(valor)}</div>
  <p className="mt-1 text-[11px] leading-5 text-slate-500">{descricao}</p>
 </div>;
}

/**
 * Resumo exclusivo da produção executada no Liquida.
 * Não usa importações de Aging, datas de entrada de sistemas externos
 * nem saldos de setores não controlados pelo sistema.
 */
export default function FluxoLinhaBrancaPeriodo({dados,periodo}){
 if(!dados)return null;
 const r=dados.resumo||{};
 const iniciadas=Number(r.os_iniciadas_liquida||0);
 const anteriores=Number(r.os_anteriores_liquida||0);
 const osPeriodo=Number(r.os_movimentadas||0);
 const entregues=Number(r.os_com_entrega_etapa||0);
 return <section className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/30 p-4 shadow-sm sm:p-5">
  <div>
   <p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Apontamentos internos · Liquida System</p>
   <h2 className="mt-1 text-lg font-black text-slate-900">Produção sob nosso controle</h2>
   <p className="mt-1 text-xs leading-5 text-slate-600">
    Contamos apenas máquinas que passaram pelos módulos do Liquida: ciclos de triagem,
    diagnósticos, reparos e testes pós-reparo. O início é a primeira ação no Liquida,
    não a data de entrada informada pelo Aging.
   </p>
  </div>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   <Card titulo="Iniciadas no Liquida no período" valor={iniciadas}
    descricao="A primeira ação registrada no sistema ocorreu nas datas selecionadas" Icon={Activity}/>
   <Card titulo="Já vinham em andamento" valor={anteriores}
    descricao="Tinham ação anterior no Liquida e foram trabalhadas novamente no período" Icon={Clock3}/>
   <Card titulo="OS trabalhadas no Liquida" valor={osPeriodo}
    descricao="Máquinas distintas com apontamento operacional nas datas selecionadas" Icon={Factory} principal/>
   <Card titulo="OS com etapa entregue" valor={entregues}
    descricao="Máquinas distintas com diagnóstico, reparo ou teste final de etapa registrado" Icon={CheckCircle2}/>
  </div>
  <div className="grid gap-3 sm:grid-cols-2">
   <div className="rounded-xl border border-emerald-200 bg-white p-4">
    <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-emerald-600"/><span className="text-xs font-black text-slate-700">Etapas concluídas pelo Liquida</span></div>
    <p className="mt-2 text-2xl font-black tabular-nums text-slate-900">{fmt(r.etapas_concluidas)}</p>
    <p className="mt-1 text-[11px] leading-5 text-slate-500">Diagnósticos finalizados, reparos aprovados e testes finais aprovados. Uma OS pode concluir mais de uma etapa.</p>
   </div>
   <div className="rounded-xl border border-slate-200 bg-white p-4">
    <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-violet-600"/><span className="text-xs font-black text-slate-700">Critério do acompanhamento</span></div>
    <p className="mt-2 text-xs leading-5 text-slate-700">
     <strong>Sem saldos externos:</strong> não contabilizamos recebimento original, Aging,
     limpeza/qualidade sem apontamento no Liquida nem finalização logística fora do sistema.
    </p>
   </div>
  </div>
  <p className="text-[11px] leading-5 text-slate-600">
   <strong>Reconciliação interna:</strong> {fmt(iniciadas)} OSs iniciadas + {fmt(anteriores)} OSs já em andamento
   = {fmt(osPeriodo)} máquinas distintas trabalhadas, considerando os filtros.
   As {fmt(r.atividades_produtivas)} atividades executadas podem exceder esse total porque a mesma OS
   pode ter mais de um ciclo, diagnóstico ou reparo. Esses resultados não representam
   conclusão de ponta a ponta da máquina.
  </p>
 </section>;
}
