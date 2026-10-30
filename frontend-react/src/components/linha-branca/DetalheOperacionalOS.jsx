import {CalendarDays,CheckCircle2,Clock3,ClipboardCheck,History,ShieldCheck,UserRound,Wrench} from "lucide-react";
import HistoricoEtapasOS from "./HistoricoEtapasOS.jsx";

const dataHora = v => v ? new Date(v).toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo",dateStyle:"short",timeStyle:"short"}) : "Não informado";
const dataBR = v => v ? new Date(v+"T12:00:00").toLocaleDateString("pt-BR") : "Não informado";
const duracao = segundos => {
 if(segundos===null||segundos===undefined) return "Não registrada";
 const s=Math.max(0,Number(segundos)||0);
 return Math.floor(s/3600)?(Math.floor(s/3600)+"h "+String(Math.floor(s%3600/60)).padStart(2,"0")+"min"):Math.floor(s/60)+"min "+String(s%60).padStart(2,"0")+"s";
};
const caixa="rounded-xl border border-slate-200 bg-white p-4";
const campo="text-[10px] font-black uppercase tracking-wide text-slate-400";
const labelStatus = x => ({concluido:"Concluído",aprovado:"Aprovado",reprovado:"Reprovado",em_ciclo:"Em ciclo",pausado:"Pausado",aguardando_segundo:"Aguardando ciclo 2",aguardando_higienizacao:"Aguardando liberação",enviado_reparo:"Encaminhado ao reparo"})[String(x||"").toLowerCase()] || x || "Não informado";
function Tag({valor}){
 const norm=String(valor||"").toLowerCase();
 const estilo=/aprov|conclu[ií]do/.test(norm)?"bg-emerald-50 text-emerald-700":/reprov|erro|falh|condenad|enviado_reparo/.test(norm)?"bg-rose-50 text-rose-700":"bg-slate-100 text-slate-700";
 return <span className={"rounded-full px-2.5 py-1 text-[10px] font-bold "+estilo}>{labelStatus(valor)}</span>;
}
function Valor({titulo,valor}) {
 return <div><div className={campo}>{titulo}</div><div className="mt-1 break-words text-xs font-semibold text-slate-700">{valor??"Não informado"}</div></div>;
}
function Secao({titulo,subtitulo,quantidade,children}){
 return <section className="space-y-3">
  <div className="flex items-start justify-between gap-3"><div>
   <h3 className="text-sm font-black text-slate-900">{titulo}</h3>{subtitulo&&<p className="mt-1 text-xs text-slate-500">{subtitulo}</p>}
  </div><span className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">{quantidade}</span></div>
  {children}
 </section>;
}
function SemRegistro({mensagem}){return <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500">{mensagem}</div>}
export default function DetalheOperacionalOS({detalhe}){
 const os=detalhe?.os||{};
 const ciclos=detalhe?.ciclos||[];
 const eventos=detalhe?.eventos_ciclo||[];
 const triagens=detalhe?.triagens||[];
 const triagensLegado=detalhe?.triagens_legado||[];
 const reparos=detalhe?.reparos||[];
 const producao=detalhe?.eventos_producao||[];
 const historico=detalhe?.historico||[];
 const preventivas=detalhe?.interciclos||[];
 const evidencias=detalhe?.evidencias||[];
 return <div className="mt-5 space-y-6">
  <div className="grid gap-3 rounded-xl bg-slate-50 p-4 text-xs sm:grid-cols-2">
   <Valor titulo="Produto" valor={[os.marca,os.modelo].filter(Boolean).join(" ")||"Não informado"}/>
   <Valor titulo="Categoria" valor={os.categoria}/>
   <Valor titulo="Fornecedor" valor={os.fornecedor}/>
   <Valor titulo="Data da entrada" valor={dataBR(os.dt_entrada)}/>
   <Valor titulo="Status atual" valor={os.status_atual}/>
   <Valor titulo="Etapa / departamento" valor={os.area_destino||os.etapa_atual}/>
   <Valor titulo="Responsável pelo reparo" valor={os.tecnico_responsavel}/>
   <Valor titulo="Técnico da triagem" valor={os.tecnico_triagem}/>
   <Valor titulo="Técnico da bancada" valor={os.tecnico_bancada}/>
   <Valor titulo="Técnico da higienização" valor={os.tecnico_limpeza}/>
   <Valor titulo="Técnico de qualidade" valor={os.tecnico_qualidade}/>
   <Valor titulo="Nível do reparo" valor={os.nivel_reparo}/>
   <Valor titulo="Última atualização cadastral" valor={dataHora(os.updated_at)}/>
   <Valor titulo="Retornos para retrabalho" valor={os.retorno_pos_reparo_qtd??0}/>
  </div>
  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
   {[
    ["Ciclos registrados",ciclos.length,Clock3],
    ["Eventos de ciclo",eventos.length,History],
    ["Triagens registradas",triagens.length+triagensLegado.length,ClipboardCheck],
    ["Reparos executados",reparos.length,Wrench]
   ].map(([titulo,total,Icon])=><div key={titulo} className="rounded-xl border border-violet-100 bg-violet-50 p-3">
    <Icon className="h-4 w-4 text-violet-700"/><div className="mt-2 text-xl font-black tabular-nums text-slate-900">{total}</div>
    <p className="mt-0.5 text-[10px] font-semibold text-slate-600">{titulo}</p>
   </div>)}
  </div>
  <HistoricoEtapasOS detalhe={detalhe}/>
  <Secao titulo="Ciclos e bancada de testes" subtitulo="Mostra quem iniciou cada ciclo, o tempo previsto, a duração registrada, o resultado e o horário de conclusão." quantidade={ciclos.length}>
   {ciclos.length?ciclos.map(c=>{
    const eventosDoCiclo=eventos.filter(e=>String(e.ciclo_id)===String(c.id));
    return <div key={c.id} className={caixa}>
     <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
       <Clock3 className="h-4 w-4 text-violet-600"/>
       <span className="text-xs font-black text-slate-900">{c.etapa_teste==="pos_reparo"?"Bancada pós-reparo":"Triagem funcional"} · Ciclo {c.numero_ciclo||1}</span>
       <span className="text-[10px] text-slate-400">Tentativa {c.tentativa||1}</span>
      </div><Tag valor={c.resultado||c.status}/>
     </div>
     <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Valor titulo="Técnico / operador" valor={c.operador}/>
      <Valor titulo="Posição da bancada" valor={c.posicao}/>
      <Valor titulo="Tempo previsto" valor={duracao(c.duracao_alvo_segundos)}/>
      <Valor titulo="Tempo registrado" valor={duracao(c.tempo_executado_segundos)}/>
      <Valor titulo="Iniciado em" valor={dataHora(c.iniciado_em)}/>
      <Valor titulo="Finalizado em" valor={dataHora(c.concluido_em)}/>
     </div>
     {(c.erro_tipo||c.erro_codigo||c.erro_descricao||c.erro_observacoes)&&<div className="mt-3 rounded-lg border border-rose-100 bg-rose-50 p-3 text-xs text-rose-700">
      <div className="font-black">Falha registrada</div>
      <p className="mt-1">{[c.erro_tipo,c.erro_codigo,c.erro_descricao,c.erro_observacoes].filter(Boolean).join(" · ")}</p>
     </div>}
     <details className="mt-3 rounded-lg border border-slate-100 bg-slate-50 p-3">
      <summary className="cursor-pointer text-xs font-bold text-violet-700">Eventos e movimentações deste ciclo ({eventosDoCiclo.length})</summary>
      {eventosDoCiclo.length?<div className="mt-3 space-y-2">
       {eventosDoCiclo.map(e=><div key={e.id} className="border-t border-slate-200 pt-2 text-xs">
        <div className="font-bold text-slate-700">{e.tipo_evento||"Evento"}</div>
        <p className="mt-1 text-slate-500">{e.operador||"Sem operador"} · {dataHora(e.created_at)} {e.tempo_executado_segundos!=null?" · "+duracao(e.tempo_executado_segundos):""}</p>
        {e.detalhes&&<p className="mt-1 whitespace-pre-wrap text-slate-600">{e.detalhes}</p>}
       </div>)}
      </div>:<p className="mt-2 text-xs text-slate-500">Nenhum evento detalhado neste ciclo.</p>}
     </details>
    </div>;
   }):<SemRegistro mensagem="Não existem ciclos de lavadora lançados no Liquida para esta OS. O cadastro histórico não comprova um teste realizado."/>}
  </Secao>
  <Secao titulo="Triagens e diagnóstico" quantidade={triagens.length+triagensLegado.length}>
   {triagens.length?triagens.map(t=><div key={"n"+t.id} className={caixa}>
    <div className="flex flex-wrap items-center justify-between gap-2">
     <span className="text-xs font-black">Triagem técnica · {dataHora(t.created_at)}</span>
     <Tag valor={t.precisa_reparo?"Reparo necessário":"Sem reparo"}/>
    </div>
    <p className="mt-2 text-xs text-slate-600">Técnico: <strong>{t.triado_por||"Não registrado"}</strong> {t.nivel_reparo?" · "+t.nivel_reparo:""}</p>
    {[
     ["Mecânico",t.reparos_mecanicos],["Elétrico",t.reparos_eletricos],["Estético",t.reparos_esteticos]
    ].filter(x=>Array.isArray(x[1])&&x[1].length).map(([titulo,itens])=><div className="mt-2 text-xs" key={titulo}>
     <span className="font-bold text-slate-700">{titulo}: </span><span className="text-slate-600">{itens.join(", ")}</span>
    </div>)}
    {t.observacoes_triagem&&<p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-xs text-slate-600">{t.observacoes_triagem}</p>}
   </div>):null}
   {triagensLegado.map(t=><div key={"l"+t.id} className={caixa}>
     <div className="text-xs font-black">Triagem anterior · {dataHora(t.dt_triagem||t.created_at)}</div>
     <p className="mt-2 text-xs text-slate-600">Técnico: <strong>{t.triado_por||"Não registrado"}</strong></p>
     <p className="mt-1 text-xs text-slate-600">{[t.area_defeito,t.tipo_defeito,t.subdefeito,t.causa_provavel].filter(Boolean).join(" · ")}</p>
     {t.observacoes_tecnicas&&<p className="mt-2 text-xs text-slate-500">{t.observacoes_tecnicas}</p>}
   </div>)}
   {!triagens.length&&!triagensLegado.length&&<SemRegistro mensagem="Sem triagem detalhada registrada nesta OS. Os ciclos aparecem separadamente acima, quando existentes."/>}
  </Secao>
  <Secao titulo="Reparos executados" subtitulo="Técnico, área, diagnóstico, serviços e peças utilizadas." quantidade={reparos.length}>
   {reparos.length?reparos.map(r=><div className={caixa} key={r.id}>
    <div className="flex flex-wrap items-center justify-between gap-2">
     <span className="text-xs font-black">{r.area_execucao||"Reparo"}</span><Tag valor={r.condenado?"Condenado":r.aprovado?"Concluído":"Em reparo"}/>
    </div>
    <div className="mt-3 grid grid-cols-2 gap-3"><Valor titulo="Técnico responsável" valor={r.tecnico}/>
     <Valor titulo="Nível" valor={r.nivel_reparo}/>
     <Valor titulo="Início" valor={dataHora(r.dt_inicio||r.created_at)}/>
     <Valor titulo="Conclusão" valor={dataHora(r.dt_fim)}/></div>
    {r.diagnostico_final&&<p className="mt-3 text-xs text-slate-700"><strong>Diagnóstico:</strong> {r.diagnostico_final}</p>}
    {r.servico_executado&&<p className="mt-2 text-xs text-slate-700"><strong>Serviços:</strong> {r.servico_executado}</p>}
    {r.peca_trocada&&<p className="mt-2 text-xs text-slate-700"><strong>Peças:</strong> {r.descricao_peca_trocada||"Troca informada sem descrição"}</p>}
    {r.observacoes&&<p className="mt-2 text-xs text-slate-500">{r.observacoes}</p>}
    {r.condenado&&r.motivo_condenacao&&<p className="mt-2 text-xs font-semibold text-rose-700">{r.motivo_condenacao}</p>}
   </div>):<SemRegistro mensagem="Nenhum reparo executado foi registrado no Liquida para esta OS."/>}
  </Secao>
  {preventivas.length>0&&<Secao titulo="Preventiva entre ciclos" quantidade={preventivas.length}>
   {preventivas.map(p=><div key={p.id} className={caixa}>
    <div className="flex justify-between gap-3 text-xs font-bold"><span>{p.operador||"Operador não informado"}</span><span>{dataHora(p.concluido_em)}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-2">{Object.entries(p.checklist||{}).map(([chave,status])=><div key={chave} className="rounded-lg bg-slate-50 p-2 text-xs">
      <span className="font-semibold text-slate-600">{chave.replaceAll("_"," ")}: </span><span>{status==="ok"?"OK":status==="nao_ok"?"Não conforme":status}</span></div>)}</div>
    <p className="mt-2 text-xs text-slate-600">{p.estetica_apresenta_defeito?"Defeitos estéticos: "+(p.defeitos_esteticos||[]).join(", "):"Sem defeitos estéticos registrados"}</p>
    <p className="mt-1 text-xs text-slate-500">{evidencias.filter(f=>String(f.ciclo_primeiro_id)===String(p.ciclo_primeiro_id)).length} evidências fotográficas vinculadas</p>
    {p.observacoes_preventiva&&<p className="mt-2 text-xs text-slate-500">{p.observacoes_preventiva}</p>}
   </div>)}
  </Secao>}
  <details className="rounded-xl border border-slate-200 bg-white p-4">
   <summary className="cursor-pointer text-sm font-black">Outros registros de produção ({producao.length})</summary>
   {producao.length?<div className="mt-3 space-y-2">{producao.map(p=><div key={p.id} className="border-t border-slate-100 py-2 text-xs">
    <strong>{p.etapa||"Produção"} · {p.resultado||"Resultado não informado"}</strong>
    <p className="mt-1 text-slate-500">{p.tecnico||"Não identificado"} · {dataHora(p.realizado_em)}</p>
   </div>)}</div>:<p className="mt-2 text-xs text-slate-500">Sem eventos de produção adicionais nesta OS.</p>}
  </details>
  <details className="rounded-xl border border-slate-200 bg-white p-4">
   <summary className="cursor-pointer text-sm font-black">Histórico de status e transferências ({historico.length})</summary>
   {historico.length?<div className="mt-3 space-y-2">{historico.map(h=><div key={h.id} className="border-t border-slate-100 py-2 text-xs">
    <strong>{h.status_anterior||"Entrada"} → {h.status_novo||h.etapa_nova||"Movimentação"}</strong>
    <p className="mt-1 text-slate-500">{h.etapa_nova||""} · {h.responsavel||"Não identificado"} · {dataHora(h.created_at)}</p>
    {h.observacao&&<p className="mt-1 text-slate-600">{h.observacao}</p>}
   </div>)}</div>:<p className="mt-2 text-xs text-slate-500">Sem transições registradas. A posição atual vem do cadastro da OS.</p>}
  </details>
 </div>;
}
