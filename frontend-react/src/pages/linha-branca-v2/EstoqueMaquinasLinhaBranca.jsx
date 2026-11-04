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
  ["LOJA_POR_CONCILIACAO","Loja por conciliação (sem comprovante)","bg-slate-100 text-slate-700"],
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
  const [escopo,setEscopo]=useState("INVENTARIO");
  const [tipo,setTipo]=useState("");
  const [pagina,setPagina]=useState(1);
  const [item,setItem]=useState(null);
  const [historico,setHistorico]=useState([]);
  const [rastreio,setRastreio]=useState(null);
  const [cmpDetalhes,setCmpDetalhes]=useState(null);
  const [requisicoes,setRequisicoes]=useState([]);
  const [requisicaoAtenderId,setRequisicaoAtenderId]=useState(null);
  const [comprovanteReq,setComprovanteReq]=useState("");
  const [salvandoReq,setSalvandoReq]=useState(false);
  const [mensagemReq,setMensagemReq]=useState("");
  const [carregandoHistorico,setCarregandoHistorico]=useState(false);
  const [form,setForm]=useState(FORM);
  const tamanho=50;

  const carregar=useCallback(async()=>{
    setCarregando(true);setErro("");
    try{
      const filtros={pagina,tamanho,busca,marca,categoria:familia,tipo,situacao:status};
      const res=escopo==="INVENTARIO"
        ? await (async()=>{
          const {data,error}=await supabase.rpc("linha_branca_inventario_fisico",{p_dados:filtros});
          if(error)throw Error(error.message);
          return data;
        })()
        : await rpc("listar",{...filtros,escopo});
      setDados(res||null);
    }catch(e){setErro("Não foi possível carregar o estoque de máquinas: "+e.message);}
    finally{setCarregando(false);}
  },[pagina,busca,marca,familia,tipo,status,escopo]);
  useEffect(()=>{void carregar();},[carregar]);
  const resumo=dados?.resumo||{};
  const somar=(...states)=>states.reduce((v,k)=>v+Number(resumo[k]||0),0);
  const emProcesso=somar("TRIAGEM","AGUARDANDO_CMP","REPARO","POS_REPARO","A_CONFERIR");
  const pendentesSaida=somar("FINALIZADA_CONCILIAR","SAIDA_INDICADA_GAIA");
  const filtroAtivo=!!(busca||marca||familia||tipo||status);
  const totalPaginas=Math.max(1,Math.ceil(Number(dados?.total_filtrado||0)/tamanho));
  const marcas=useMemo(()=>dados?.por_marca||[],[dados]);
  const familias=useMemo(()=>dados?.por_familia||[],[dados]);
  const tipos=useMemo(()=>dados?.por_tipo||[],[dados]);

  function mudarFiltro(fn,v){fn(v);setPagina(1);}
  async function abrir(i) {
    if(!i?.id){setErro("Esta OS está na planilha, mas o Liquida não possui a ficha operacional correspondente. Não há histórico técnico disponível para consultar.");return;}
    setItem(i);setForm(FORM());setHistorico([]);setRastreio(null);
    setCmpDetalhes(null);setRequisicoes([]);
    setRequisicaoAtenderId(null);setComprovanteReq("");setMensagemReq("");
    setCarregandoHistorico(true);setErro("");setOk("");
    try{
      const isCmp=i.situacao==="AGUARDANDO_CMP";
      const [h,t,c,q]=await Promise.all([
        rpc("historico",{os_id:i.id}),
        supabase.rpc("linha_branca_rastreabilidade_os",{p_os_id:i.id}),
        isCmp?supabase.rpc("linha_branca_cmp_detalhes",{p_os_id:i.id}):Promise.resolve({data:null,error:null}),
        isCmp?supabase.rpc("linha_branca_requisicoes_diagnostico",{p_acao:"listar_os",p_dados:{os_id:i.id}}):Promise.resolve({data:null,error:null})
      ]);
      for(const v of [t,c,q])if(v.error)throw new Error(v.error.message);
      setHistorico(Array.isArray(h)?h:[]);
      setRastreio(t.data||null);
      setCmpDetalhes(c.data||null);
      setRequisicoes(q.data?.requisicoes||[]);
    }catch(e){setMensagemReq("Falha ao carregar os detalhes: "+e.message);}
    finally{setCarregandoHistorico(false);}
  }
  async function confirmarAtendimentoRequisicao(req){
    if(!item||!req||salvandoReq)return;
    if(comprovanteReq.trim().length<8){
      setMensagemReq("Informe o que comprova que a peça foi atendida (mínimo de 8 caracteres).");
      return;
    }
    setSalvandoReq(true);setMensagemReq("");
    try{
      const {error}=await supabase.rpc("linha_branca_requisicoes_diagnostico",{
        p_acao:"atender",
        p_dados:{os_id:item.id,requisicao_id:req.id,justificativa:comprovanteReq.trim()}
      });
      if(error)throw new Error(error.message);
      const {data,error:refreshError}=await supabase.rpc("linha_branca_requisicoes_diagnostico",{
        p_acao:"listar_os",p_dados:{os_id:item.id}
      });
      if(refreshError)throw new Error(refreshError.message);
      setRequisicoes(data?.requisicoes||[]);
      setRequisicaoAtenderId(null);setComprovanteReq("");
      setMensagemReq("Atendimento da peça registrado. O aging da requisição foi encerrado; a etapa técnica da OS não foi alterada.");
      await carregar();
    }catch(e){setMensagemReq("Não foi possível registrar o atendimento: "+e.message);}
    finally{setSalvandoReq(false);}
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
          <h2 className="text-base font-black text-[#43284F]">Estoque</h2>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            Máquinas de lavar e lava e seca: CMP, triagem, scrap e concluídas para loja, com requisições de peças e acompanhamento das OSs.
           </p>
        </div>
        <button type="button" onClick={carregar} disabled={carregando}
          className={BOTAO+" border-slate-200 bg-white text-slate-700"}>
          {carregando?<Loader2 size={15} className="animate-spin"/>:<RefreshCcw size={15}/>} Atualizar
        </button>
      </div>
      <p className="mt-3 text-[11px] text-amber-900">
        <AlertTriangle size={14} className="mr-1 inline"/>
        {escopo==="INVENTARIO"?"O estoque foi conciliado com a relação enviada. "+FORMAT(dados?.cadastros_pendentes||0)+" OSs da lista ainda não têm ficha no Liquida; para essas OSs, diagnóstico, técnico e etapas não podem ser consultados até localizar o cadastro original. O resumo do arquivo aponta 54 CMP, mas identifica 51.":"As OSs encaminhadas à loja foram separadas do estoque atual por conciliação, sem presumir expedição física documentada."}
       </p>
    </section>

    {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{erro}</div>}
    {ok&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{ok}</div>}

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {(escopo==="INVENTARIO" ? [
        [Warehouse,"CMP",dados?.total_cmp,"Máquinas aguardando atendimento das peças"],
        [Wrench,"Triagem",dados?.total_triagem,"Equipamentos ainda em análise"],
        [AlertTriangle,"Scrap",dados?.total_scrap,"Segregados do estoque produtivo"],
        [ClipboardList,"Requisições abertas",dados?.total_requisicoes_abertas,"Geradas pelos componentes do diagnóstico"],
        [Clock3,"Maior aging de requisição (dias)",dados?.maior_aging_pecas,"Dias corridos desde a abertura"],
        [AlertTriangle,"CMP sem peça identificada",dados?.cmp_sem_requisicao,"OSs que precisam ter a requisição registrada"]
      ] : [
        [Truck,"Concluídas / Loja",dados?.total_filtrado,"Fora da relação física atual por conciliação"],
        [ClipboardList,"Acompanhar OS",dados?.total_filtrado,"Consulte etapas, diagnósticos e técnicos por OS"]
      ]).map(([Icon,nome,valor,desc])=><div key={nome} className={BOX}>
        <div className="flex items-center gap-2"><Icon size={17} className="text-[#765D81]"/><p className="text-[11px] font-bold text-slate-500">{nome}</p></div>
        <p className="mt-2 text-2xl font-black text-slate-900">{valor==null?"—":FORMAT(valor)}</p>
        <p className="mt-1 text-[10px] leading-4 text-slate-500">{desc}</p>
      </div>)}
    </div>

    <div className={BOX+" space-y-3"}>
      <div className="flex flex-wrap gap-2">
        {[["INVENTARIO","Estoque"],["CONCLUIDAS","Concluídas / Loja"]].map(([v,n])=><button key={v} type="button" onClick={()=>{setEscopo(v);setPagina(1);setFamilia("");setTipo("");setMarca("");setStatus("");setBusca("");setDigitado("");}} className={"rounded-lg px-3 py-2 text-xs font-bold "+(escopo===v?"bg-[#43284F] text-white":"bg-slate-100 text-slate-700")}>{n}</button>)}
      </div>
      <p className="text-[11px] text-slate-500">{escopo==="INVENTARIO"?"Somente estoque e scrap da relação enviada; o próximo relatório diário atualizará as novas entradas. Para CMP, a peça do diagnóstico equivale à requisição, com aging desde o registro.":"Máquinas enviadas para loja por conciliação gerencial, fora do estoque físico atual. A classificação não substitui o comprovante de expedição."}</p>
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
        <select value={tipo} onChange={e=>mudarFiltro(setTipo,e.target.value)}
          aria-label="Filtrar tipo de produto" className={CAMPO+" max-w-[240px]"}>
          <option value="">Todos os tipos de produto</option>
          {tipos.map(f=><option key={f.nome} value={f.nome}>{f.nome} ({FORMAT(f.total)})</option>)}
        </select>
        <select value={marca} onChange={e=>mudarFiltro(setMarca,e.target.value)}
          aria-label="Filtrar marca" className={CAMPO+" max-w-[195px]"}>
          <option value="">Todas as marcas</option>
          {marcas.map(f=><option key={f.nome} value={f.nome==="Sem marca"?"":f.nome}>{f.nome} ({FORMAT(f.total)})</option>)}
        </select>
        {filtroAtivo&&<button type="button" className={BOTAO+" border-slate-200"}
          onClick={()=>{setBusca("");setDigitado("");setMarca("");setFamilia("");setTipo("");setStatus("");setPagina(1);}}>Limpar filtros</button>}
      </div>
      {escopo==="INVENTARIO"&&<div className="flex flex-wrap items-center gap-2">
        <label className="text-xs font-bold text-slate-600" htmlFor="filtro-etapa-lb">Situação</label>
        <select id="filtro-etapa-lb" value={status} onChange={e=>mudarFiltro(setStatus,e.target.value)} className={CAMPO+" max-w-[300px]"}>
          <option value="">Todas as situações</option>
          {ESTADOS.filter(x=>["TRIAGEM","AGUARDANDO_CMP","SCRAP_CONDENADO"].includes(x[0]))
            .map(([id,nome])=><option key={id} value={id}>{nome} ({FORMAT(resumo[id]||0)})</option>)}
        </select>
      </div>}
      <p className="text-[11px] text-slate-500">
        Resultados: <b>{FORMAT(dados?.total_filtrado||0)}</b> OSs · página {pagina} de {totalPaginas}. Peças e insumos são controlados separadamente.
      </p>
    </div>

    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-left text-xs">
          <thead className="bg-slate-100 text-[10px] font-black uppercase tracking-wide text-slate-600">
            <tr>
              <th className="px-3 py-3">OS / Equipamento</th>
              <th className="px-3 py-3">Situação / Etapa</th>
              <th className="px-3 py-3">Técnico</th>
              <th className="px-3 py-3">Requisições de peças / Aging</th>
              <th className="px-3 py-3">Detalhes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(dados?.itens||[]).map(i=><tr key={i.id||i.numero_os} className="hover:bg-purple-50/40">
              <td className="px-3 py-3">
                <p className="font-black text-[#43284F]">OS {i.numero_os}</p>
                <p className="mt-1 max-w-[260px] font-semibold text-slate-700">{i.marca||"Marca não informada"} · {i.modelo||"Modelo não informado"}</p>
                <p className="mt-1 text-[10px] text-slate-500">{i.categoria||"—"} · Série {i.serial||"não informada"}</p>
                {i.categoria_divergente&&<p className="mt-1 text-[10px] font-bold text-amber-700">Categoria diferente da relação</p>}
                {i.cadastro_pendente&&<p className="mt-1 text-[10px] font-bold text-rose-700">OS da lista sem ficha no Liquida</p>}
              </td>
              <td className="px-3 py-3">
                <span className={"inline-block rounded-md px-2 py-1 text-[10px] font-bold "+classeEstado(i.situacao)}>{labelEstado(i.situacao)}</span>
                {i.status_os&&<p className="mt-1 text-[10px] text-slate-500">Etapa sistema: {i.status_os}{i.etapa_os&&i.etapa_os!==i.status_os?" · "+i.etapa_os:""}</p>}
                {i.situacao==="LOJA_POR_CONCILIACAO"&&<p className="mt-1 text-[10px] text-slate-500">Saída gerencial; sem comprovante de envio</p>}
              </td>
              <td className="px-3 py-3">
                <p className="font-semibold text-slate-800">{i.responsavel||"Não atribuído"}</p>
                {i.situacao==="AGUARDANDO_CMP"&&i.pecas_abertas?.[0]?.solicitante&&
                  <p className="mt-1 text-[10px] text-slate-500">Solicitou: {i.pecas_abertas[0].solicitante}</p>}
              </td>
              <td className="min-w-[230px] px-3 py-3">
                {i.situacao==="AGUARDANDO_CMP" ? (
                  i.pecas_abertas?.length ?
                    <div className="space-y-1.5">
                      {i.pecas_abertas.map(p=><div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="max-w-[200px] font-semibold text-slate-800">{p.peca}</span>
                        <span className="whitespace-nowrap rounded-md bg-amber-100 px-2 py-0.5 font-black text-amber-900">{FORMAT(p.aging_dias)} dias</span>
                      </div>)}
                      <p className="text-[10px] text-slate-500">{FORMAT(i.requisicoes_abertas)} aberta(s) · da data do diagnóstico</p>
                    </div>
                    : <span className="font-semibold text-rose-700">Peça não informada no diagnóstico</span>
                ) : <span className="text-slate-400">—</span>}
              </td>
              <td className="px-3 py-3">
                {i.id ? <button type="button" onClick={()=>abrir(i)}
                  className={BOTAO+" border-violet-200 bg-violet-50 text-[#43284F]"}>
                    {i.situacao==="AGUARDANDO_CMP"?"Peças e diagnóstico":"Ver trajetória"}
                  </button>
                  : <span className="text-[10px] font-semibold text-rose-700">Sem registro técnico no Liquida</span>}
              </td>
            </tr>)}
            {carregando&&<tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Carregando estoque...</td></tr>}
            {!carregando&&!(dados?.itens||[]).length&&<tr><td colSpan={5} className="px-4 py-12 text-center text-slate-500">Nenhuma OS encontrada.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 p-3">
        <p className="text-[11px] text-slate-500">{FORMAT(dados?.total_filtrado||0)} OSs no filtro · página {pagina} de {totalPaginas} · 50 por página.</p>
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
        {item.situacao!=="AGUARDANDO_CMP"&&<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-950">
          <b>Conciliação logística:</b> a OS pode estar finalizada tecnicamente sem registro de saída.
          Registre somente movimentações verificadas fisicamente ou com documento. Esta tela não efetua venda,
          transferência de estoque contábil nem altera a etapa de reparo da OS.
        </div>}
        {item.situacao==="AGUARDANDO_CMP"&&<section className="mt-5 space-y-4 rounded-xl border border-amber-200 bg-amber-50/40 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 className="flex items-center gap-2 text-sm font-black text-amber-950"><Wrench size={17}/> CMP — Requisições de peças</h4>
              <p className="mt-1 text-[11px] text-slate-600">A peça selecionada no diagnóstico abre a requisição. O aging conta dias corridos desde o lançamento original, até o atendimento documentado.</p>
            </div>
            <span className="rounded-lg bg-white px-3 py-1 text-xs font-black text-amber-900">
              {FORMAT(requisicoes.filter(r=>r.status==="aberta").length)} aberta(s)
            </span>
          </div>
          <div className="rounded-lg bg-white p-3 text-xs text-slate-700">
            <strong>Responsável registrado:</strong> {cmpDetalhes?.responsavel_atual||"Não atribuído"}
            <span className="ml-3"><strong>Triagem:</strong> {cmpDetalhes?.triagem_responsavel||"Não informado"}</span>
            {cmpDetalhes?.area_destino&&<span className="ml-3"><strong>Área:</strong> {cmpDetalhes.area_destino}</span>}
          </div>
          {mensagemReq&&<p role="status" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold">{mensagemReq}</p>}
          {carregandoHistorico?<p className="text-xs text-slate-500">Carregando requisições...</p>:
            requisicoes.length?
              <div className="space-y-2">
                {requisicoes.map(req=><div key={req.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <strong className="text-xs text-[#43284F]">{req.descricao} <span className="font-normal text-slate-500">· {req.area}</span></strong>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={"rounded px-2 py-1 text-[10px] font-black "+(req.status==="aberta"?"bg-amber-100 text-amber-900":"bg-slate-100 text-slate-600")}>{req.status==="aberta"?"Em aberto":req.status==="atendida"?"Atendida":req.status==="substituida"?"Substituída em retriagem":"Cancelada"}</span>
                      <span className="rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-black text-amber-900">{FORMAT(req.aging_dias)} dias</span>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-slate-700">Abertura: <strong>{DIA(req.aberta_em)}</strong> · Solicitante: <strong>{req.solicitante||"Não informado"}</strong></p>
                  {req.diagnostico&&<p className="mt-1 whitespace-pre-wrap text-[11px] text-slate-600">Diagnóstico: {req.diagnostico}</p>}
                  {req.status!=="aberta"&&req.motivo_encerramento&&<p className="mt-1 text-[11px] text-slate-600">Encerramento: {req.motivo_encerramento} · {DIA(req.encerrada_em)}</p>}
                  {req.status==="aberta"&&<div className="mt-2">
                    {requisicaoAtenderId===req.id?
                      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                        <label className="block text-[11px] font-bold text-slate-700">Comprovação do atendimento da peça
                          <textarea value={comprovanteReq} onChange={e=>setComprovanteReq(e.target.value)}
                            className={CAMPO+" mt-1 min-h-[70px]"} rows={2}
                            placeholder="Informe a entrega, retirada ou documento que comprova o atendimento."/>
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" disabled={salvandoReq||comprovanteReq.trim().length<8}
                            onClick={()=>void confirmarAtendimentoRequisicao(req)}
                            className={BOTAO+" border-emerald-200 bg-emerald-50 text-emerald-800"}>
                            {salvandoReq?<Loader2 size={14} className="animate-spin"/>:<CheckCircle2 size={14}/>} Confirmar atendimento
                          </button>
                          <button type="button" disabled={salvandoReq}
                            onClick={()=>{setRequisicaoAtenderId(null);setComprovanteReq("");}}
                            className={BOTAO+" bg-white"}>Cancelar</button>
                        </div>
                      </div>
                    :<button type="button" onClick={()=>{setRequisicaoAtenderId(req.id);setComprovanteReq("");setMensagemReq("");}}
                      className={BOTAO+" border-slate-200 bg-slate-50 text-slate-700"}>Registrar peça atendida</button>}
                  </div>}
                </div>)}
              </div>
            :<p className="rounded-lg border border-amber-200 bg-white p-3 text-xs font-semibold text-amber-900">
              Nenhuma requisição encontrada nesta OS. A classificação CMP veio da relação operacional, mas não há componente lançado no diagnóstico da triagem para gerar a requisição. É necessário lançar o componente correto no fluxo técnico.
            </p>}
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <h5 className="mb-2 text-xs font-black text-slate-800">Diagnósticos e técnicos responsáveis</h5>
            {cmpDetalhes?.diagnosticos?.length?
              <div className="max-h-56 space-y-2 overflow-y-auto">
                {cmpDetalhes.diagnosticos.map((d,k)=><div key={k} className="border-b border-slate-100 pb-2 text-[11px] last:border-0">
                  <p className="font-bold text-slate-700">{d.origem} · {DIA(d.data)} · {d.tecnico||"Técnico não informado"}</p>
                  <p className="mt-1 whitespace-pre-wrap text-slate-600">{d.diagnostico||"Diagnóstico sem descrição"}</p>
                </div>)}
              </div>
            : <p className="text-[11px] text-slate-500">Sem diagnóstico técnico registrado no Liquida.</p>}
            {cmpDetalhes?.tecnicos?.length>0&&<details className="mt-3 text-[11px]">
              <summary className="cursor-pointer font-bold text-violet-700">Ver todos os técnicos e participações</summary>
              <div className="mt-2 space-y-1">{cmpDetalhes.tecnicos.map((t,k)=><p key={k}>{t.nome} — {t.papel}</p>)}</div>
            </details>}
          </div>
        </section>}

        <section className="mt-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-black"><History size={17}/> Rastreabilidade operacional da OS</h4>
            <span className="rounded-lg bg-violet-50 px-3 py-1 text-xs font-bold text-[#43284F]">
              {FORMAT(rastreio?.total_eventos||0)} eventos registrados
            </span>
          </div>
          <p className="text-[11px] leading-5 text-slate-600">
            Histórico cronológico dos eventos efetivamente registrados: triagem, reparos, peças, ciclos e testes,
            evidências, laudos, qualidade, retornos, mudanças de status e movimentações. Eventos ausentes não são presumidos.
          </p>
          {item.situacao==="LOJA_POR_CONCILIACAO"&&
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Encaminhamento para loja classificado por conciliação gerencial, sem comprovante de saída confirmado.
              Consulte os registros abaixo antes de afirmar que houve expedição ou entrega.
            </p>}
          {carregandoHistorico?<p className="text-xs text-slate-500">Carregando rastreabilidade...</p>:
            rastreio?.eventos?.length?
              <div className="max-h-[350px] divide-y overflow-y-auto rounded-xl border border-slate-200">
                {rastreio.eventos.map((ev,k)=><div key={k} className="px-3 py-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">{ev.tipo}</span>
                      <strong className="text-[#43284F]">{ev.titulo}</strong>
                    </div>
                    <span className="text-[10px] text-slate-500">{DIA(ev.data)}</span>
                  </div>
                  {ev.descricao&&<p className="mt-1.5 whitespace-pre-wrap text-slate-700">{ev.descricao}</p>}
                  {ev.tecnico&&<p className="mt-1 text-[11px] text-slate-500">Registrado por: {ev.tecnico}</p>}
                  {ev.detalhes&&Object.keys(ev.detalhes).length>0&&
                    <details className="mt-2 text-[11px] text-slate-600">
                      <summary className="cursor-pointer font-bold text-violet-700">Ver dados e origem do registro</summary>
                      <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-slate-50 p-2 text-[10px]">{JSON.stringify(ev.detalhes,null,2)}</pre>
                    </details>}
                </div>)}
              </div>
            :<p className="rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500">
              Não existem eventos operacionais disponíveis para esta OS nas tabelas consultadas.
            </p>}
          {rastreio?.total_eventos>400&&<p className="text-xs text-amber-700">Mostrando os 400 eventos mais recentes de {FORMAT(rastreio.total_eventos)}. A consulta permanece preservada no banco.</p>}
        </section>
        <details className="mt-5 rounded-xl border border-slate-200 bg-slate-50/50 p-3">
          <summary className="cursor-pointer text-xs font-black text-slate-700">Movimentações físicas documentadas (opcional)</summary>
          <form onSubmit={registrar} className="mt-3 space-y-3 rounded-xl border border-slate-200 bg-white p-4">
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
        </details>
        <div className="mt-4 flex justify-end"><button type="button" disabled={salvando}
          onClick={()=>setItem(null)} className={BOTAO+" border-slate-200"}>Fechar</button></div>
      </div>
    </div>}
  </div>;
}
