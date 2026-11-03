import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { AlertTriangle, CheckCircle2, Download, FileImage, FileText, Lock, RefreshCw, RotateCcw, Save } from "lucide-react";
import {
  apurarCobrancaAssurant, listarFechamentosAssurant, obterFechamentoAssurant,
  salvarFechamentoAssurant, reabrirFechamentoAssurant,
} from "../../services/cobrancaAssurantService.js";

// Referências do demonstrativo de setembro/2026, editáveis em cada competência.
// Não são preços contratuais automaticamente ratificados.
const ITENS = [
  { id:"recebimento_loja", nome:"Recebimento de Produtos LOJA (com leitura de IMEI)", unidade:"Unidade", preco:2.32, volume:2.09, auto:true },
  { id:"recebimento_online", nome:"Recebimento de Produtos ONLINE (com leitura de IMEI)", unidade:"Unidade", preco:2.32, volume:2.32 },
  { id:"recebimento_dev_grv_online", nome:"Recebimento de Produtos Dev GRV/ONLINE (com leitura de IMEI)", unidade:"Unidade", preco:2.32, volume:2.32 },
  { id:"recebimento_grv", nome:"Recebimento de Produtos GRV (com leitura de IMEI)", unidade:"Unidade", preco:2.32, volume:2.32 },
  { id:"recebimento_devolucao", nome:"Recebimento de Devolução de Produtos", unidade:"Unidade", preco:2.32, volume:2.32 },
  { id:"recebimento_seguradora", nome:"Recebimento de Produtos (Seguradora)", unidade:"Unidade", preco:2.32, seguradora:true },
  { id:"triagem", nome:"Triagem e classificação dos aparelhos", unidade:"Unidade", preco:9, volume:8.12, auto:true },
  { id:"triagem_devolucao", nome:"Triagem e classificação dos aparelhos (Devolução)", unidade:"Unidade", preco:9, volume:9 },
  { id:"expedicao_b2b", nome:"Expedição B2B", unidade:"Unidade", preco:4.63, volume:4.18, auto:true },
  { id:"expedicao_b2c", nome:"Expedição B2C", unidade:"Unidade", preco:11.58, volume:11, auto:true },
  { id:"expedicao_b2c_troca", nome:"Expedição B2C (Troca)", unidade:"Unidade", preco:11.58 },
  { id:"expedicao_seguradora", nome:"Expedição Seguradora", unidade:"Unidade", preco:11.58, seguradora:true },
  { id:"devolucao_online_grv", nome:"Devolução Online/GRV", unidade:"Unidade", preco:11.58 },
  { id:"expedicao_reparo", nome:"Expedição para Reparo", unidade:"Unidade", preco:4.63, auto:true, historicoParcial:true },
  { id:"recebimento_reparo", nome:"Recebimento de Reparo", unidade:"Unidade", preco:2.32, auto:true, historicoParcial:true },
  { id:"recebimento_acessorios", nome:"Recebimento de acessórios", unidade:"Unidade", preco:1.16 },
  { id:"custo_infraestrutura", nome:"Custo de infraestrutura", unidade:"Unidade", preco:0.50, auto:true, estoque:true },
  { id:"area", nome:"Área", unidade:"m²", preco:50, padraoC:393, padraoS:25 },
  { id:"seguro", nome:"Seguro", unidade:"% valor máximo Estoque Mensal", preco:0.0015, direta:true, percentual:true },
  { id:"gestao", nome:"Gestão do processo logístico", unidade:"Fixo", preco:10000, padraoC:0.5, padraoS:0.5 },
  { id:"recurso_administrativo", nome:"Recurso administrativo", unidade:"Fixo", preco:5638.41, padraoC:1, padraoS:0 },
  { id:"hora_extra", nome:"Hora Extra", unidade:"Valor informado", preco:0, direta:true },
  { id:"sac_marketplace", nome:"Sac Marketplace", unidade:"Interações", preco:2.5 },
];
const formNumber = v => v == null || v === "" ? "" : String(v);
const number = v => { const n=Number(v); return v === "" || v == null || !Number.isFinite(n) ? 0 : n; };
const brl = v => Number(v || 0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const inteiro = v => Number(v || 0).toLocaleString("pt-BR",{maximumFractionDigits:2});
const mesNome = mes => new Date(mes+"-01T12:00:00Z").toLocaleDateString("pt-BR",{timeZone:"UTC",month:"long",year:"numeric"}).toUpperCase();
const asCompetencia = mes => mes+"-01";
const input = "w-full min-w-[72px] rounded-md border border-slate-200 bg-white px-2 py-1.5 text-right text-xs tabular-nums outline-none focus:border-violet-500 disabled:bg-slate-50 disabled:text-slate-400";
const inicial = () => ({triagemTipo:"funcional",linhas:{}});

function resolver(it,config,apuracao) {
  const x=(config?.linhas||{})[it.id]||{};
  let auto=it.id==="triagem" ? number(apuracao?.["triagem_"+(config?.triagemTipo || "funcional")]) : number(apuracao?.[it.id]);
  const segQt=x.qtdS==null ? (it.estoque ? null : (it.padraoS ?? (it.seguradora ? null : 0))) : x.qtdS;
  const comQt=x.qtdC==null ? it.padraoC ?? (it.seguradora ? null : 0) : x.qtdC;
  const qtdC=it.auto && !x.substituirAuto ? (it.estoque ? Math.max(0,auto-number(segQt)) : auto) : comQt;
  const qtdS=segQt;
  const preco=x.preco==null ? it.preco : number(x.preco);
  const volume=x.volume==null ? (it.volume??null) : number(x.volume);
  const usarVolume=x.usarVolume==null ? it.volume!=null : !!x.usarVolume;
  const tarifa=usarVolume && volume!=null ? volume : preco;
  const totalC=it.direta ? number(x.valorC) : number(qtdC)*tarifa;
  const totalS=it.direta ? number(x.valorS) : number(qtdS)*tarifa;
  return {...it,...x,autoValor:auto,qtdC,qtdS,preco,volume,usarVolume,tarifa,totalC,totalS,
    fonte:it.auto ? (apuracao?.fontes?.[it.id==="triagem"?"triagem_"+(config?.triagemTipo||"funcional"):it.id] || "Apuração interna"):"Informação manual / fixa",
    revisado:!!x.revisado};
}
const tituloColunas=["Etapa/Custo","Unidade de medida","Vlr. Unit","Vlr. Unit (Tabela Volume)","Qtd Comercio","Qtd Seguradora","Vlr. Comercio","Vlr. Seguradora"];

function recortar(ctx,texto,largura) {
  let s=String(texto||"");
  while(s.length && ctx.measureText(s).width>largura) s=s.slice(0,-2);
  return s===String(texto||"")?s:s+"…";
}
function montarImagem(mes,linhas,estado) {
  const cols=[706,320,185,269,200,210,247,253];
  const largura=cols.reduce((a,b)=>a+b,0), alturaLinha=46, head=103, footer=176;
  const altura=head+alturaLinha*linhas.length+footer;
  const c=document.createElement("canvas");c.width=largura;c.height=altura;
  const ctx=c.getContext("2d");
  ctx.fillStyle="#ffffff";ctx.fillRect(0,0,largura,altura);
  ctx.fillStyle="#1c334d";ctx.fillRect(0,0,largura,50);
  ctx.fillStyle="#ffffff";ctx.font="bold 27px Arial";ctx.textAlign="center";
  ctx.fillText(mesNome(mes).replace(" DE "," - "),largura/2,35);
  ctx.fillStyle="#1c334d";ctx.fillRect(0,50,largura,53);
  ctx.strokeStyle="#1a2c40";ctx.lineWidth=1;
  let x=0;
  tituloColunas.forEach((nome,i)=>{
    const w=cols[i];ctx.fillStyle="#ffffff";ctx.font="bold 20px Arial";
    ctx.textAlign=i<2?"left":"center";ctx.fillText(nome,x+(i<2?10:w/2),84);
    ctx.strokeRect(x,50,w,53);x+=w;
  });
  linhas.forEach((l,j)=>{
    const y=head+j*alturaLinha;
    ctx.fillStyle=j%2?"#cbdcf0":"#ffffff";ctx.fillRect(0,y,largura,alturaLinha);
    x=0;
    const cells=[
      l.nome,l.unidade,l.percentual?"0,15%":brl(l.preco),
      l.volume!=null?brl(l.volume):"",
      l.direta?"":(l.qtdC==null?"":inteiro(l.qtdC)),
      l.direta?"":(l.qtdS==null?"":inteiro(l.qtdS)),
      brl(l.totalC),brl(l.totalS)
    ];
    cells.forEach((v,i)=>{
      const w=cols[i];ctx.fillStyle="#111827";ctx.font=(i===0?"bold 18px Arial":i>=6?"bold 19px Arial":"19px Arial");
      ctx.textAlign=(i===0||i===1)?"left":"right";
      ctx.fillText(recortar(ctx,v,w-20),x+(i<2?9:w-9),y+30);
      ctx.strokeStyle="#3a4756";ctx.strokeRect(x,y,w,alturaLinha);x+=w;
    });
  });
  const totC=linhas.reduce((t,l)=>t+l.totalC,0),totS=linhas.reduce((t,l)=>t+l.totalS,0);
  const y=head+linhas.length*alturaLinha;
  ctx.fillStyle="#d4e3f2";ctx.fillRect(0,y,largura,58);
  ctx.fillStyle="#142940";ctx.font="bold 25px Arial";
  ctx.textAlign="left";ctx.fillText("TOTAL COMÉRCIO",12,y+38);
  ctx.textAlign="right";ctx.fillText(brl(totC),largura-15,y+38);
  ctx.fillStyle="#e6eff9";ctx.fillRect(0,y+58,largura,46);
  ctx.fillStyle="#142940";ctx.textAlign="left";ctx.fillText("TOTAL SEGURADORA",12,y+89);
  ctx.textAlign="right";ctx.fillText(brl(totS),largura-15,y+89);
  ctx.fillStyle="#1c334d";ctx.fillRect(0,y+104,largura,51);
  ctx.fillStyle="#ffffff";ctx.textAlign="left";ctx.fillText("TOTAL GERAL",12,y+139);
  ctx.textAlign="right";ctx.fillText(brl(totC+totS),largura-15,y+139);
  ctx.fillStyle="#556579";ctx.font="16px Arial";ctx.textAlign="left";
  ctx.fillText(estado==="fechado"?"Competência fechada — valores preservados em histórico":"PRÉVIA — NÃO EMITIR COBRANÇA SEM CONFERÊNCIA",12,altura-8);
  return c;
}
function baixarCanvas(canvas,nome) {
  const a=document.createElement("a");a.download=nome;a.href=canvas.toDataURL("image/png");document.body.appendChild(a);a.click();a.remove();
}
function exportar(mes,linhas,estado,tipo) {
  const c=montarImagem(mes,linhas,estado);
  const nome="FECHAMENTO_ASSURANT_"+mes.replace("-","_");
  if(tipo==="png"){baixarCanvas(c,nome+".png");return;}
  const pdf=new jsPDF({orientation:"landscape",unit:"mm",format:"a3"});
  const w=420,h=(c.height/c.width)*w;
  pdf.addImage(c.toDataURL("image/png"),"PNG",0,0,w,h,"", "FAST");
  pdf.save(nome+".pdf");
}

export default function FechamentoCobrancaAssurantV2Page() {
  const [mes,setMes]=useState("2026-09");
  const [config,setConfig]=useState(inicial);
  const [apuracao,setApuracao]=useState(null);
  const [registro,setRegistro]=useState(null);
  const [historico,setHistorico]=useState([]);
  const [ocupado,setOcupado]=useState(false);
  const [erro,setErro]=useState("");
  const [aviso,setAviso]=useState("");
  const [motivoReabertura,setMotivoReabertura]=useState("");
  const fechado=registro?.situacao==="fechado";
  const competencia=asCompetencia(mes);
  const carregar=useCallback(async()=> {
    setOcupado(true);setErro("");setAviso("");
    try{
      const [r,a,h]=await Promise.all([
        obterFechamentoAssurant(competencia),
        apurarCobrancaAssurant(competencia),
        listarFechamentosAssurant(),
      ]);
      setRegistro(r?.competencia ? r : null);
      setConfig(r?.configuracao && Object.keys(r.configuracao).length ? r.configuracao : inicial());
      setApuracao(r?.situacao==="fechado" && r?.apuracao?.competencia ? r.apuracao : a);
      setHistorico(Array.isArray(h)?h:[]);
    }catch(e){setErro(e.message||"Erro ao buscar dados da competência.");}
    finally{setOcupado(false);}
  },[competencia]);
  useEffect(()=>{carregar();},[carregar]);

  function mudarLinha(id,novo) {
    setConfig(atual=>({
      ...atual,
      linhas:{
        ...(atual.linhas||{}),
        [id]:{...(atual.linhas?.[id]||{}),...novo}
      }
    }));
    setAviso("");
  }

  const linhas=useMemo(()=>ITENS.map(it=>resolver(it,config,apuracao)),[config,apuracao]);
  const totalC=linhas.reduce((s,l)=>s+l.totalC,0),totalS=linhas.reduce((s,l)=>s+l.totalS,0);
  const pendentes=linhas.filter(l=>
    !l.revisado ||
    (!l.auto && !l.direta && (l.qtdC==null || l.qtdS==null)) ||
    (l.direta && (l.valorC==null || l.valorS==null)) ||
    (l.estoque && l.qtdS==null) ||
    (l.auto && l.substituirAuto && !String(l.justificativa||"").trim())
  );
  async function persistir(acao) {
    if(!apuracao){setErro("Apuração indisponível.");return;}
    if(acao==="fechar" && pendentes.length) {
      setErro("Confira todas as linhas, preencha zero explicitamente onde não houve movimento, distribua o estoque e justifique ajustes automáticos: "+pendentes.length+" linha(s) pendente(s).");
      return;
    }
    if(acao==="fechar" && !window.confirm("Fechar "+mesNome(mes)+" e bloquear alterações sem justificativa?"))return;
    setOcupado(true);setErro("");setAviso("");
    try {
      const novo=await salvarFechamentoAssurant(acao,competencia,config,apuracao);
      setRegistro(novo);
      setAviso(acao==="fechar"?"Competência fechada e histórico congelado.":"Rascunho salvo no banco.");
      const h=await listarFechamentosAssurant();setHistorico(h||[]);
    }catch(e){setErro(e.message);}
    finally{setOcupado(false);}
  }
  async function reabrir() {
    if(motivoReabertura.trim().length<8){setErro("Informe justificativa de pelo menos 8 caracteres para reabrir.");return;}
    setOcupado(true);setErro("");setAviso("");
    try{const r=await reabrirFechamentoAssurant(competencia,motivoReabertura);
      setRegistro(r);setMotivoReabertura("");setAviso("Competência reaberta com justificativa registrada no histórico.");
    }catch(e){setErro(e.message);}
    finally{setOcupado(false);}
  }

  const numInput=(val,onChange,disabled=false,step="1")=>(
    <input type="number" min="0" step={step} value={formNumber(val)} disabled={disabled||fechado||ocupado}
      onChange={e=>onChange(e.target.value===""?null:Number(e.target.value))}
      className={input} aria-label="Quantidade ou valor" />
  );

  return (
    <div className="space-y-5 pb-10">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-900">Fechamento Mensal — Serviços Assurant</h1>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-600">Demonstrativo de cobrança por competência: atividades controladas no Liquida System, complemento manual, tabela de preços ajustável e histórico de revisões. Os valores de referência iniciais são os do demonstrativo de setembro de 2026; confirme a tabela vigente antes de fechar.</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-bold text-slate-700">Competência
              <input type="month" min="2024-01" max="2030-12" value={mes} disabled={ocupado} onChange={e=>e.target.value&&setMes(e.target.value)} className="mt-1 block rounded-lg border border-slate-200 p-2 text-sm"/>
            </label>
            <button type="button" onClick={carregar} disabled={ocupado} className="flex items-center gap-1.5 rounded-lg border border-slate-200 p-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"><RefreshCw size={15}/> Atualizar</button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className={"rounded-full px-3 py-1 text-[11px] font-bold "+(fechado?"bg-emerald-100 text-emerald-800":"bg-amber-100 text-amber-800")}>{fechado?"Fechado / histórico preservado":"Rascunho / em conciliação"}</span>
          {registro?.atualizado_em && <span className="text-xs text-slate-500">Atualizado: {new Date(registro.atualizado_em).toLocaleString("pt-BR")}</span>}
          <span className="text-xs text-slate-500">Versão {registro?.versao||"não salva"}</span>
        </div>
        {!!historico.length && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs"><strong>Histórico:</strong>{historico.slice(0,18).map(h=>(
          <button key={h.competencia} type="button" onClick={()=>setMes(String(h.competencia).slice(0,7))} className={"rounded-md border px-2 py-1 font-bold "+(h.situacao==="fechado"?"border-emerald-200 bg-emerald-50 text-emerald-700":"border-slate-200 text-slate-600")}>{String(h.competencia).slice(0,7)} {h.situacao==="fechado"?"✓":""}</button>
        ))}</div>}
      </div>

      {erro && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800" role="alert">{erro}</div>}
      {aviso && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17}/>{aviso}</div>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Total Comércio",brl(totalC),"Cálculo pelo preço escolhido por linha"],
          ["Total Seguradora",brl(totalS),"Preencher serviços exclusivos da Seguradora"],
          ["Total geral",brl(totalC+totalS),"Pendências de revisão: "+pendentes.length]
        ].map(([nome,valor,det])=><div key={nome} className="rounded-xl border border-slate-200 bg-white p-4"><p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{nome}</p><p className="mt-2 text-2xl font-black text-slate-900">{valor}</p><p className="mt-1 text-xs text-slate-500">{det}</p></div>)}
      </div>

      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-bold text-slate-800">Critério de cobrança de triagem (escolher somente uma etapa):</p>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="radio" checked={(config.triagemTipo||"funcional")==="funcional"} disabled={fechado} onChange={()=>setConfig(c=>({...c,triagemTipo:"funcional"}))}/> Funcional · {inteiro(apuracao?.triagem_funcional)}</label>
          <label className="flex items-center gap-2 text-xs font-bold"><input type="radio" checked={config.triagemTipo==="cosmetica"} disabled={fechado} onChange={()=>setConfig(c=>({...c,triagemTipo:"cosmetica"}))}/> Cosmética · {inteiro(apuracao?.triagem_cosmetica)}</label>
        </div>
        <p className="mt-2 text-[11px] text-violet-800">A outra etapa permanece como evidência, sem cobrança duplicada. Retriagens importadas podem exigir conciliação da data original.</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-300 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1530px] border-collapse text-xs">
            <thead>
              <tr><th colSpan={9} className="border border-slate-800 bg-[#1c334d] p-2 text-center text-base font-black text-white">{mesNome(mes).replace(" DE "," - ")}</th></tr>
              <tr className="bg-[#1c334d] text-white">
                {tituloColunas.map((col,i)=><th key={col} className={"border border-slate-800 px-2 py-3 "+(i<2?"text-left":"text-right")}>{col}</th>)}
                <th className="border border-slate-800 px-3 py-2">Fonte / Conferência</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l,j)=><tr key={l.id} className={j%2?"bg-[#d8e5f3]":"bg-white"}>
                <td className="min-w-[350px] border border-slate-300 px-2 py-2 font-bold text-slate-900">{l.nome}
                  {l.auto && <span className="ml-2 rounded bg-emerald-100 px-1 py-0.5 text-[9px] text-emerald-800">AUTO</span>}
                  {l.historicoParcial && <span className="ml-1 text-[9px] text-amber-800">histórico parcial</span>}
                </td>
                <td className="min-w-[155px] border border-slate-300 px-2 py-2">{l.unidade}</td>
                <td className="w-[106px] border border-slate-300 p-1">
                  {l.percentual ? <span className="block px-2 text-right">0,15%</span> : numInput(l.preco,v=>mudarLinha(l.id,{preco:v}),false,"0.01")}
                </td>
                <td className="w-[130px] border border-slate-300 p-1">
                  {l.volume!=null ? <div className="flex items-center gap-1">
                    <input type="checkbox" title="Cobrar pelo valor da tabela volume" checked={l.usarVolume} disabled={fechado} onChange={e=>mudarLinha(l.id,{usarVolume:e.target.checked})} />
                    {numInput(l.volume,v=>mudarLinha(l.id,{volume:v}),false,"0.01")}
                  </div> : <span className="block text-center text-slate-400">—</span>}
                </td>
                <td className="w-[115px] border border-slate-300 p-1">
                  {l.direta ? <span className="text-[10px] text-slate-500">Valor R$</span> :
                    numInput(l.qtdC,v=>mudarLinha(l.id,l.auto?{substituirAuto:true,qtdC:v,revisado:false}:{qtdC:v,revisado:false}),l.auto&&!l.substituirAuto,"0.5")}
                </td>
                <td className="w-[115px] border border-slate-300 p-1">
                  {l.direta ? <span className="text-[10px] text-slate-500">Valor R$</span> :
                    numInput(l.qtdS,v=>mudarLinha(l.id,{qtdS:v,revisado:false}),false,"0.5")}
                </td>
                <td className="w-[115px] border border-slate-300 p-1">
                  {l.direta ? numInput(l.valorC,v=>mudarLinha(l.id,{valorC:v,revisado:false}),false,"0.01") :
                    <div className="px-2 text-right font-bold text-slate-900">{brl(l.totalC)}</div>}
                </td>
                <td className="w-[115px] border border-slate-300 p-1">
                  {l.direta ? numInput(l.valorS,v=>mudarLinha(l.id,{valorS:v,revisado:false}),false,"0.01") :
                    <div className="px-2 text-right font-bold text-slate-900">{brl(l.totalS)}</div>}
                </td>
                <td className="min-w-[180px] border border-slate-300 px-2 py-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span title={l.fonte} className={"max-w-[155px] truncate text-[10px] "+(l.auto?"text-emerald-800":"text-slate-500")}>{l.fonte}</span>
                    <label title="Conferido para cobrança" className="flex shrink-0 items-center gap-1 text-[10px]">
                      <input type="checkbox" checked={l.revisado} disabled={fechado} onChange={e=>mudarLinha(l.id,{revisado:e.target.checked})}/> OK
                    </label>
                  </div>
                  {l.auto && !fechado && <button type="button" className="mt-1 text-[10px] font-bold text-violet-700 underline" onClick={()=>mudarLinha(l.id,{substituirAuto:!l.substituirAuto,revisado:false,qtdC:l.qtdC})}>{l.substituirAuto?"Restaurar apuração":"Ajustar quantidade"}</button>}
                  {l.auto && l.substituirAuto && !fechado && <input className="mt-1 w-full rounded border border-amber-300 bg-amber-50 p-1 text-[10px]" value={l.justificativa||""} onChange={e=>mudarLinha(l.id,{justificativa:e.target.value,revisado:false})} placeholder="Justificativa obrigatória"/>}
                  {l.estoque && <p className="mt-1 text-[9px] text-amber-800">Posição total {inteiro(l.autoValor)}; conferir rateio.</p>}
                </td>
              </tr>)}
            </tbody>
            <tfoot className="font-black">
              <tr className="border border-slate-400 bg-[#d8e5f3]">
                <td colSpan={6} className="px-3 py-3 text-right">TOTAIS</td><td className="border border-slate-400 px-2 py-3 text-right">{brl(totalC)}</td><td className="border border-slate-400 px-2 py-3 text-right">{brl(totalS)}</td><td/>
              </tr>
              <tr className="border bg-[#1c334d] text-white"><td colSpan={6} className="px-3 py-3 text-right">TOTAL GERAL</td><td colSpan={2} className="px-3 py-3 text-right text-base">{brl(totalC+totalS)}</td><td/></tr>
            </tfoot>
          </table>
        </div>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <p className="flex items-center gap-2 text-xs font-bold text-amber-900"><AlertTriangle size={16}/> Pontos para conciliação antes do faturamento</p>
        <p className="mt-2 text-xs leading-5 text-amber-900">Preços carregados apenas como referência do demonstrativo. Seguradora e serviços sem captura nativa são preenchidos manualmente. O estoque histórico é apurado como posição de final do mês, não média mensal. Serviços de reparo anteriores ao fluxo interno precisam de complemento comprovado. Ao substituir um número automático, informe a justificativa. Quantidades manuais sem movimento devem ser preenchidas com zero e marcadas como conferidas.</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          {!fechado && <>
            <button type="button" disabled={ocupado||!apuracao} onClick={()=>persistir("salvar")} className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Save size={16}/> Salvar rascunho</button>
            <button type="button" disabled={ocupado||!apuracao} onClick={()=>persistir("fechar")} className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><Lock size={16}/> Concluir fechamento</button>
          </>}
          <button type="button" disabled={ocupado||!apuracao} onClick={()=>exportar(mes,linhas,registro?.situacao,"png")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40"><FileImage size={16}/> Gerar print (PNG)</button>
          <button type="button" disabled={ocupado||!apuracao} onClick={()=>exportar(mes,linhas,registro?.situacao,"pdf")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-40"><FileText size={16}/> Baixar PDF</button>
          <span className="text-[11px] text-slate-500">Em rascunho, a imagem vem identificada como prévia.</span>
        </div>
        {fechado && <div className="mt-4 flex flex-wrap items-end gap-2">
          <label className="min-w-[270px] flex-1 text-xs font-semibold text-slate-600">Justificativa para reabrir
            <input value={motivoReabertura} onChange={e=>setMotivoReabertura(e.target.value)} placeholder="Por que é necessário corrigir o mês fechado?" className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2"/>
          </label>
          <button type="button" onClick={reabrir} disabled={ocupado||motivoReabertura.trim().length<8} className="inline-flex items-center gap-2 rounded-lg border border-amber-200 px-4 py-2.5 text-xs font-bold text-amber-900 disabled:opacity-40"><RotateCcw size={16}/> Reabrir com auditoria</button>
        </div>}
        {apuracao?.capturadoEm && <p className="mt-3 text-[10px] text-slate-500">Apuração: {new Date(apuracao.capturadoEm).toLocaleString("pt-BR")} · {fechado?"Dados congelados no fechamento":"Dados sujeitos a atualização até a conclusão"}</p>}
      </div>
    </div>
  );
}
