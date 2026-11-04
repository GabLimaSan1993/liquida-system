import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, CheckCircle2, ClipboardList, Clock3, History,
  Loader2, PackageCheck, RefreshCcw, Search, Truck, Warehouse, Wrench, X
} from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const BOX="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm";
const BOTAO="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold disabled:cursor-not-allowed disabled:opacity-40";
const CAMPO="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800 outline-none focus:border-violet-400";
const ESTADOS=[
  ["TRIAGEM","Triagem","bg-sky-100 text-sky-800"],
  ["AGUARDANDO_CMP","CMP / Peças","bg-amber-100 text-amber-800"],
  ["REPARO","Em reparo","bg-violet-100 text-violet-800"],
  ["POS_REPARO","Testes / Qualidade","bg-indigo-100 text-indigo-800"],
  ["APROVADO","Aprovados / A transferir","bg-cyan-100 text-cyan-800"],
  ["ESTOQUE_CONFIRMADO","Estoque físico conferido","bg-emerald-100 text-emerald-800"],
  ["FINALIZADA_CONCILIAR","Finalizadas a conciliar","bg-orange-100 text-orange-900"],
  ["SAIDA_INDICADA_GAIA","Expedição indicada no GAIA","bg-slate-100 text-slate-700"],
  ["SAIDA_CONFIRMADA","Saídas confirmadas","bg-slate-200 text-slate-800"],
  ["SCRAP_CONDENADO","Scrap / Condenado","bg-rose-100 text-rose-800"],
  ["DESCARTE_CONFIRMADO","Descarte confirmado","bg-rose-200 text-rose-900"],
  ["CONFERENCIA","Em conferência","bg-amber-100 text-amber-900"],
  ["A_CONFERIR","Outros / A conferir","bg-slate-100 text-slate-700"]
];
const MOVIMENTOS=[
  ["ESTOQUE_CONFIRMADO","Conferir presença em estoque físico"],
  ["TRANSFERIDO_LOJA","Confirmar transferência à loja"],
  ["VENDIDO","Confirmar venda com documento"],
  ["EXPEDIDO","Confirmar expedição física"],
  ["SCRAP_CONFIRMADO","Confirmar saída para descarte"],
  ["EM_CONFERENCIA","Marcar divergência / reabrir conferência"]
];
const FORMAT=v=>Number(v||0).toLocaleString("pt-BR");
const DIA=v=>{
  if(!v)return "—";
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
    const [y,m,d]=v.split("-");
    return d+"/"+m+"/"+y;
  }
  const d=new Date(v);
  return Number.isNaN(d.getTime())?"—":d.toLocaleString("pt-BR",{timeZone:"America/Sao_Paulo"});
};
const labelEstado = v=>ESTADOS.find(x=>x[0]===v)?.[1]||v||"—";
const classeEstado = v=>ESTADOS.find(x=>x[0]===v)?.[2]||"bg-slate-100 text-slate-700";
async function rpc(acao,dados={}) {
  const {data,error}=await supabase.rpc("linha_branca_estoque_maquinas",{
    p_acao:acao,p_dados:dados
  });
  if(error)throw Error(error.message);
  return data;
}
const FORM=()=>({situacao:"EM_CONFERENCIA",referencia:"",destino:"",endereco:"",motivo:""});

export default function EstoqueMaquinasLinhaBranca() {
  const [dados,setDados]=useState(null);
  const [carregando,setCarregando]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const [erro,setErro]=useState("");
  const [ok,setOk]=useState("");
  const [digitado,setDigitado]=useState("");
  const [busca,setBusca]=useState("");
  const [marca,setMarca]=useState("");
  const [familia,setFamilia]=useState("");
  const [status,setStatus]=useState("");
  const [pagina,setPagina]=useState(1);
  const [item,setItem]=useState(null);
  const [historico,setHistorico]=useState([]);
  const [carregandoHistorico,setCarregandoHistorico]=useState(false);
  const [form,setForm]=useState(FORM);
  const tamanho=50;

  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{
      const res=await rpc("listar",{
        pagina,tamanho,busca,marca,categoria:familia,situacao:status
      });
      setDados(res||null);
    }catch(e){setErro("Não foi possível carregar o estoque de máquinas: "+e.message);}
    finally{setCarregando(false);}
  },[pagina,busca,marca,familia,status]);
  useEffect(()=>{void carregar();},[carregar]);
  const resumo=dados?.resumo||{};
  const somar=(...states)=>states.reduce((v,k)=>v+Number(resumo[k]||0),0);
  const emProcesso=somar("TRIAGEM","AGUARDANDO_CMP","REPARO","POS_REPARO","A_CONFERIR");
  const pendentesSaida=somar("FINALIZADA_CONCILIAR","SAIDA_INDICADA_GAIA");
  const filtroAtivo=!!(busca||marca||familia||status);
  const totalPaginas=Math.max(1,Math.ceil(Number(dados?.total_filtrado||0)/tamanho));
  const marcas=useMemo(()=>dados?.por_marca||[],[dados]);
  const familias=useMemo(()=>dados?.por_familia||[],[dados]);

  function mudarFiltro(fn,v){fn(v);setPagina(1);}
  async function abrir(i) {
    setItem(i);setForm(FORM());setHistorico([]);
    setCarregandoHistorico(true);setErro("");setOk("");
    try{const h=await rpc("historico",{os_id:i.id});setHistorico(Array.isArray(h)?h:[]);}
    catch(e){setErro("Histórico da OS: "+e.message);}
    finally{setCarregandoHistorico(false);}
  }
  async function registrar(e){
    e.preventDefault();
    if(!item||salvando)return;
    const f=form;
    const exigeDocumento=["TRANSFERIDO_LOJA","VENDIDO","EXPEDIDO","SCRAP_CONFIRMADO"].includes(f.situacao);
    if(f.motivo.trim().length<10){setErro("Informe uma justificativa de pelo menos 10 caracteres.");return;}
    if(exigeDocumento && f.referencia.trim().length<3){
      setErro("Para a saída física, informe número de NF, romaneio, comprovante ou referência.");return;
    }
    if(f.situacao==="TRANSFERIDO_LOJA"&&!f.destino.trim()){setErro("Informe a loja de destino.");return;}
    if(f.situacao==="ESTOQUE_CONFIRMADO"&&!f.endereco.trim()){setErro("Informe a localização física conferida.");return;}
    const msg=exigeDocumento
      ?"Confirmar a movimentação física da máquina "+item.numero_os+"? O registro ficará auditado e não altera automaticamente a OS ou o estoque de peças."
      :"Registrar esta conferência para a OS "+item.numero_os+"? A situação técnica da OS será preservada.";
    if(!window.confirm(msg))return;
    setSalvando(true);setErro("");setOk("");
    try{
      await rpc("registrar_movimentacao",{
        os_id:item.id,operacao_id:crypto.randomUUID(),...form
      });
      setOk("Movimentação registrada na OS "+item.numero_os+", com justificativa e trilha de auditoria.");
      const h=await rpc("historico",{os_id:item.id});
      setHistorico(Array.isArray(h)?h:[]);
      setItem(null);
      await carregar();
    }catch(ex){setErro(ex.message||"Não foi possível registrar a conferência.");}
    finally{setSalvando(false);}
  }

  return <div className="space-y-4">
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-r from-[#F6F0F8] to-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-black text-[#43284F]">Estoque de máquinas completas — Linha Branca</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Visão de produtos por <b>OS</b> e etapa técnica, separada dos saldos de peças e insumos.
            Situação de saída/loja/venda é registrada com evidência, sem presumir que uma OS finalizada foi vendida.
          </p>
        </div>
        <button type="button" onClick={carregar} disabled={carregando}
          className={BOTAO+" border-slate-200 bg-white text-slate-700"}>
          {carregando?<Loader2 size={15} className="animate-spin"/>:<RefreshCcw size={15}/>} Atualizar
        </button>
      </div>
      <p className="mt-3 text-[11px] text-amber-900">
        <AlertTriangle size={14} className="mr-1 inline"/>
        Quantidade de OSs não equivale necessariamente à quantidade física de máquinas:
        pode haver retornos com séries repetidas, itens em expedição e movimentações ainda não conciliadas.
      </p>
    </section>

    {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{erro}</div>}
    {ok&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{ok}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        [Warehouse,"OSs de máquinas",dados?.os_maquinas,"Registro de máquinas/eletrodomésticos, não saldo confirmado"],
        [Wrench,"Em operação / reparo",emProcesso,"Triagem, CMP, reparo, qualidade, testes e outras etapas"],
        [PackageCheck,"Aprovadas / a transferir",resumo.APROVADO||0,"Aguardando confirmação de estoque ou destino"],
        [ClipboardList,"Finalizadas a conciliar",pendentesSaida,"Sem saída confirmada ou somente indicada pelo GAIA"],
        [CheckCircle2,"Estoque físico conferido",resumo.ESTOQUE_CONFIRMADO||0,"Somente conferências físicas registradas"],
        [Truck,"Saídas confirmadas",resumo.SAIDA_CONFIRMADA||0,"Transferência à loja, venda ou expedição documentada"],
        [AlertTriangle,"CMP / aguardando peça",resumo.AGUARDANDO_CMP||0,"Máquinas aguardando componente para reparo"],
        [History,"OSs com série repetida",dados?.seriais_repetidos||0,"Possíveis retornos; precisam de conciliação"]
      ].map(([Icon,nome,valor,desc])=><div key={nome} className={BOX}>
        <div className="flex items-center gap-2"><Icon size={17} className="text-[#765D81]"/><p className="text-[11px] font-bold text-slate-500">{nome}</p></div>
        <p className="mt-2 text-2xl font-black text-slate-900">{valor==null?"—":FORMAT(valor)}</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{desc}</p>
      </div>)}
    </div>

    <div className={BOX+" space-y-3"}>
      <div className="flex flex-wrap gap-2">
        <form onSubmit={e=>{e.preventDefault();mudarFiltro(setBusca,digitado.trim());}}
          className="flex min-w-[235px] flex-1 gap-2">
          <div className="relative min-w-0 flex-1"><Search size={16} className="absolute left-3 top-2.5 text-slate-400"/>
            <input value={digitado} onChange={e=>setDigitado(e.target.value)}
              placeholder="Buscar OS, número de série, marca, modelo ou SKU"
              className={CAMPO+" pl-9"}/>
          </div>
          <button className={BOTAO+" bg-[#43284F] text-white"} type="submit">Buscar</button>
        </form>
        <select value={familia} onChange={e=>mudarFiltro(setFamilia,e.target.value)}
          aria-label="Filtrar tipo de máquina" className={CAMPO+" max-w-[225px]"}>
          <option value="">Todas as famílias</option>
          {familias.map(f=><option key={f.nome} value={f.nome}>{f.nome} ({FORMAT(f.total)})</option>)}
        </select>
        <select value={marca} onChange={e=>mudarFiltro(setMarca,e.target.value)}
          aria-label="Filtrar marca" className={CAMPO+" max-w-[195px]"}>
          <option value="">Todas as marcas</option>
          {marcas.map(f=><option key={f.nome} value={f.nome==="Sem marca"?"":f.nome}>{f.nome} ({FORMAT(f.total)})</option>)}
        </select>
        {filtroAtivo&&<button type="button" className={BOTAO+" border-slate-200"}
          onClick={()=>{setBusca("");setDigitado("");setMarca("");setFamilia("");setStatus("");setPagina(1);}}>Limpar filtros</button>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={()=>mudarFiltro(setStatus,"")}
          className={"rounded-lg px-2.5 py-1.5 text-[11px] font-bold "+(!status?"bg-[#43284F] text-white":"bg-slate-100 text-slate-600")}>
          Todas
        </button>
        {ESTADOS.map(([id,nome,cor])=><button type="button" key={id}
          onClick={()=>mudarFiltro(setStatus,status===id?"":id)}
          className={"rounded-lg px-2.5 py-1.5 text-[10px] font-bold "+(status===id?"bg-[#43284F] text-white":cor)}>
          {nome} · {FORMAT(resumo[id]||0)}
        </button>)}
      </div>
      <p className="text-[11px] text-slate-500">
        Resultados: <b>{FORMAT(dados?.total_filtrado||0)}</b> OSs · {FORMAT(dados?.os_nao_maquinas||0)} acessórios/componentes separados deste inventário · página {pagina} de {totalPaginas}.
      </p>
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1120px] text-left text-xs">
          <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-600">
            <tr><th className="px-3 py-3">OS / Série</th><th className="px-3 py-3">Máquina / Marca / Modelo</th>
              <th className="px-3 py-3">Etapa operacional</th><th className="px-3 py-3">Situação do estoque</th>
              <th className="px-3 py-3">Origem / Local</th><th className="px-3 py-3 text-right">Aging</th>
              <th className="px-3 py-3">Atualização GAIA</th><th className="px-3 py-3">Ação</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(dados?.itens||[]).map(i=><tr key={i.id} className="hover:bg-purple-50/40">
              <td className="px-3 py-2.5">
                <button className="font-black text-[#43284F] hover:underline" type="button" onClick={()=>abrir(i)}>{i.numero_os}</button>
                <p className="mt-1 max-w-[150px] break-all font-mono text-[10px] text-slate-500">{i.serial||"Sem serial"}</p>
              </td>
              <td className="max-w-[255px] px-3 py-2.5">
                <p className="font-bold">{i.marca||"—"} · {i.modelo||"Sem modelo"}</p>
                <p className="mt-1 text-[10px] text-slate-500">{i.categoria} · {i.sku||"Sem SKU"}</p>
              </td>
              <td className="px-3 py-2.5">
                <p className="font-semibold">{i.status_os||"—"}</p>
                <p className="mt-1 text-[10px] text-slate-500">{i.etapa_os||"—"}</p>
              </td>
              <td className="px-3 py-2.5">
                <span className={"inline-block whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-bold "+classeEstado(i.situacao)}>
                  {labelEstado(i.situacao)}
                </span>
                {i.movimentacao_confirmada&&<p className="mt-1 text-[10px] font-semibold text-emerald-700">Conferência registrada</p>}
              </td>
              <td className="max-w-[215px] px-3 py-2.5">
                <p className="text-[10px]">{i.etapa_gaia||"Etapa GAIA não informada"}</p>
                <p className="mt-1 text-[10px] text-slate-500">{i.destino_movimentacao||i.endereco_movimentacao||i.local_gaia||i.fornecedor||"Local não validado"}</p>
              </td>
              <td className="px-3 py-2.5 text-right font-bold tabular-nums">{i.aging_dias==null?"—":i.aging_dias+"d"}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-[10px]">{DIA(i.referencia_aging)}</td>
              <td className="px-3 py-2.5">
                <button type="button" onClick={()=>abrir(i)}
                  className={BOTAO+" border-violet-200 bg-violet-50 text-[#43284F]"}>Conferir / Histórico</button>
              </td>
            </tr>)}
            {carregando&&<tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">Consultando as máquinas...</td></tr>}
            {!carregando&&!(dados?.itens||[]).length&&<tr><td colSpan={8} className="px-4 py-12 text-center text-slate-500">Nenhuma OS encontrada com estes filtros.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] text-slate-500">50 máquinas por página; filtro aplicado a toda a base, não apenas aos registros visíveis.</p>
        <div className="flex gap-2">
          <button type="button" onClick={()=>setPagina(v=>Math.max(1,v-1))}
            disabled={carregando||pagina===1} className={BOTAO+" bg-white"}>Anterior</button>
          <button type="button" onClick={()=>setPagina(v=>v+1)}
            disabled={carregando||pagina>=totalPaginas} className={BOTAO+" bg-white"}>Próxima</button>
        </div>
      </div>
    </section>

    {item&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3"
      role="dialog" aria-modal="true" aria-labelledby="lb-maquina-titulo"
      onClick={e=>{if(e.target===e.currentTarget&&!salvando)setItem(null);}}>
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="lb-maquina-titulo" className="text-lg font-black">OS {item.numero_os} · {item.marca} {item.modelo}</h3>
            <p className="mt-1 text-xs text-slate-500">{item.categoria} · Série: {item.serial||"Não informada"} · Entrada: {DIA(item.dt_entrada)}</p>
            <p className="mt-1 text-xs text-slate-500">Etapa: {item.status_os} / {item.etapa_os} · GAIA: {item.etapa_gaia||"—"}</p>
          </div>
          <button type="button" disabled={salvando} onClick={()=>setItem(null)}
            aria-label="Fechar" className={BOTAO+" border-slate-200"}><X size={17}/></button>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <b>Conciliação logística:</b> a OS pode estar finalizada tecnicamente sem registro de saída.
          Registre somente movimentações verificadas fisicamente ou com documento. Esta tela não efetua venda,
          transferência de estoque contábil nem altera a etapa de reparo da OS.
        </div>
        <form onSubmit={registrar} className="mt-4 space-y-3 rounded-xl border border-slate-200 p-4">
          <h4 className="text-sm font-black">Registrar situação física/comercial</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Situação confirmada
              <select value={form.situacao} onChange={e=>setForm(v=>({...v,situacao:e.target.value}))}
                disabled={salvando} className={CAMPO+" mt-1"}>
                {MOVIMENTOS.map(([id,label])=><option key={id} value={id}>{label}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-slate-600">Documento / NF / Romaneio
              <input value={form.referencia} onChange={e=>setForm(v=>({...v,referencia:e.target.value}))}
                disabled={salvando} className={CAMPO+" mt-1"}
                placeholder="Referência de comprovação (obrigatória para saída)"/>
            </label>
            {form.situacao==="TRANSFERIDO_LOJA"&&<label className="text-xs font-bold text-slate-600">Loja de destino
              <input required value={form.destino} onChange={e=>setForm(v=>({...v,destino:e.target.value}))}
                disabled={salvando} className={CAMPO+" mt-1"} placeholder="Unidade / destino"/>
            </label>}
            {form.situacao==="ESTOQUE_CONFIRMADO"&&<label className="text-xs font-bold text-slate-600">Endereço físico conferido
              <input required value={form.endereco} onChange={e=>setForm(v=>({...v,endereco:e.target.value}))}
                disabled={salvando} className={CAMPO+" mt-1"} placeholder="Rua, posição ou área"/>
            </label>}
            <label className="text-xs font-bold text-slate-600 sm:col-span-2">Justificativa / observação (obrigatória)
              <textarea required minLength={10} rows={2} value={form.motivo}
                onChange={e=>setForm(v=>({...v,motivo:e.target.value}))}
                disabled={salvando} className={CAMPO+" mt-1"} placeholder="Por que esta condição física foi confirmada?"/>
            </label>
          </div>
          <button type="submit" disabled={salvando||form.motivo.trim().length<10}
            className={BOTAO+" border-[#43284F] bg-[#43284F] text-white"}>
            {salvando?<Loader2 size={15} className="animate-spin"/>:<CheckCircle2 size={15}/>} Registrar e auditar
          </button>
        </form>
        <section className="mt-5">
          <h4 className="mb-2 flex items-center gap-2 text-sm font-black"><History size={17}/> Histórico de conferências da OS</h4>
          {carregandoHistorico?<p className="text-xs text-slate-500">Carregando histórico...</p>:
            historico.length? <div className="max-h-64 divide-y overflow-y-auto rounded-xl border border-slate-200">
              {historico.map(h=><div key={h.id} className="p-3 text-xs">
                <div className="flex flex-wrap justify-between gap-2">
                  <b>{MOVIMENTOS.find(x=>x[0]===h.situacao)?.[1]||h.situacao}</b>
                  <span className="text-slate-500">{DIA(h.registrado_em)} · {h.operador||"Operador não identificado"}</span>
                </div>
                <p className="mt-1 text-slate-600">{h.motivo}</p>
                {(h.referencia||h.destino||h.endereco)&&<p className="mt-1 text-slate-500">
                  {h.referencia&&"Documento: "+h.referencia+" · "}
                  {h.destino&&"Destino: "+h.destino+" · "}
                  {h.endereco&&"Posição: "+h.endereco}
                </p>}
              </div>)}
            </div>:<p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">
              Nenhuma saída ou conferência física confirmada nesta OS. O status técnico é apenas indicação operacional.
            </p>}
        </section>
        <div className="mt-4 flex justify-end"><button type="button" disabled={salvando}
          onClick={()=>setItem(null)} className={BOTAO+" border-slate-200"}>Fechar</button></div>
      </div>
    </div>}
  </div>;
}
