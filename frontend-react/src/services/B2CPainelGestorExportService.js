import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// Mesmo intervalo do Painel Gestor: (13h do dia anterior, 13h do último dia] em SP.
const SELECAO = [
  "id","id_anymarket","item_seq","criado_em","hora_corte","data_pedido",
  "data_de_pagamento","marketplace","cliente","titulo_produto","sku_produto",
  "grade_produto","sku_definido","grade_definida","sku_alocado","grade_alocada",
  "status","status_anymarket","definicao_status","definicao_etapa","imei_alocado",
  "imei_bipado","alocado_em","bipado_em","embalado_em","faturado_em",
  "numero_nf","chave_nf","codigo_de_rastreio","valor_unitario","total_do_pedido",
  "motivo_analise","grupo_id"
].join(",");
const paginaTamanho=1000;
const formatoData=new Intl.DateTimeFormat("pt-BR",{
  timeZone:"America/Sao_Paulo",day:"2-digit",month:"2-digit",
  year:"numeric",hour:"2-digit",minute:"2-digit",hour12:false
});
const norm=x=>String(x??"").trim();
const unico=xs=>[...new Set(xs.map(norm).filter(Boolean))];
const valor=x=>Number.isFinite(Number(x))?Number(x):0;
const idExcel=x=>{
  const s=norm(x),n=Number(s);
  return /^\d{1,15}$/.test(s)&&Number.isSafeInteger(n)?n:s;
};
const dataHora=x=>{
  if(!x)return "";
  const d=new Date(x);
  return Number.isNaN(d.getTime())?"":formatoData.format(d);
};
const dataSP=x=>{
  const d=new Date(x);
  if(Number.isNaN(d.getTime()))return "";
  const ps=formatoData.formatToParts(d);
  const v=t=>ps.find(p=>p.type===t)?.value;
  return [v("year"),v("month"),v("day")].join("-");
};
const dia= (iso,dif)=>{
  const [a,m,d]=iso.split("-").map(Number);
  return new Date(Date.UTC(a,m-1,d+dif)).toISOString().slice(0,10);
};
const hora=x=>{
  const m=norm(x).match(/^(\d{1,2}):(\d{2})/);
  return m?m[1].padStart(2,"0")+":"+m[2]:"";
};
const chaveCorte=x=>dataSP(x.criado_em)+"|"+hora(x.hora_corte);
function statusPedido(itens){
  const st=itens.map(i=>norm(i.status).toLowerCase());
  if(itens.some(i=>st.includes("cancelado")||norm(i.status_anymarket).toLowerCase().includes("cancel")))return "Cancelado";
  if(st.some(x=>["aguardando_definicao_produto","aguardando_definicao"].includes(x)))return "Aguardando definição";
  if(st.includes("em_analise"))return "Em processo de validação";
  if(itens.some(i=>i.status==="embalado"&&!i.faturado_em))return "Em faturamento";
  if(st.some(x=>["alocado","em_picking"].includes(x)))return "Em picking";
  if(st.includes("aguardando_alocacao"))return "Aguardando alocação";
  if(st.every(x=>["concluido","faturado"].includes(x)))return "Concluído";
  return itens[0]?.status||"Sem status";
}
function criarAba(wb,nome,cabecalho,linhas,larguras=[]){
  const sh=XLSX.utils.aoa_to_sheet([cabecalho,...linhas]);
  sh["!cols"]=cabecalho.map((_,i)=>({wch:larguras[i]||21}));
  if(linhas.length)sh["!autofilter"]={
    ref:XLSX.utils.encode_range({s:{r:0,c:0},e:{r:linhas.length,c:cabecalho.length-1}})
  };
  XLSX.utils.book_append_sheet(wb,sh,nome);
  return sh;
}
async function buscarItens(inicio,fim,progresso){
  const inicioUTC=dia(inicio,-1)+"T16:00:00.000Z";
  const fimUTC=fim+"T16:00:00.000Z";
  const itens=[];
  for(let pagina=0;;pagina++){
    const {data,error}=await supabase.from("pedidos_b2c")
      .select(SELECAO).gt("criado_em",inicioUTC).lte("criado_em",fimUTC)
      .not("hora_corte","is",null)
      .order("criado_em",{ascending:true}).order("id",{ascending:true})
      .range(pagina*paginaTamanho,(pagina+1)*paginaTamanho-1);
    if(error)throw new Error("Falha na consulta dos pedidos: "+error.message);
    itens.push(...(data||[]));
    progresso?.("Consultados "+itens.length.toLocaleString("pt-BR")+" itens...");
    if(!data||data.length<paginaTamanho)break;
    if(itens.length>=200000)throw new Error("Mais de 200 mil itens: divida o período para evitar um relatório incompleto.");
  }
  return itens;
}
async function buscarCortes(inicio,fim){
  const anterior=dia(inicio,-1);
  const {data,error}=await supabase.from("b2c_cortes_importacao")
    .select("data_operacao,hora_corte,arquivo,linhas_arquivo,importado_em")
    .gte("data_operacao",anterior).lte("data_operacao",fim)
    .order("data_operacao",{ascending:true}).order("hora_corte",{ascending:true});
  if(error)throw new Error("Falha ao buscar os cortes AnyMarket: "+error.message);
  return (data||[]).filter(c=>{
    const h=hora(c.hora_corte);
    if(!h)return false;
    if(c.data_operacao===anterior)return h>"13:00";
    if(c.data_operacao===fim)return h<="13:00";
    return c.data_operacao>anterior&&c.data_operacao<fim;
  });
}
export async function baixarRelatorioPainelGestorB2C(inicio,fim,progresso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(inicio)||!/^\d{4}-\d{2}-\d{2}$/.test(fim)||inicio>fim)
    throw new Error("Informe um período válido para exportação.");
  progresso?.("Lendo o período selecionado...");
  const [itens,cortes]=await Promise.all([buscarItens(inicio,fim,progresso),buscarCortes(inicio,fim)]);
  progresso?.("Consolidando por ID AnyMarket...");
  const grupos=new Map();
  for(const i of itens){
    if(i.id_anymarket==null)continue;
    const k=String(i.id_anymarket);
    if(!grupos.has(k))grupos.set(k,[]);
    grupos.get(k).push(i);
  }
  const pedidos=[...grupos.entries()].map(([id,lista])=>{
    const first=lista[0],todos=lista.map(i=>i.total_do_pedido).find(x=>x!=null&&x!=="");
    return {
      id,first,itens:lista,status:statusPedido(lista),
      nfs:unico(lista.map(x=>x.numero_nf)),
      imeis:unico(lista.map(x=>x.imei_alocado)),
      skus:unico(lista.map(x=>x.sku_produto)),
      statusesAny:unico(lista.map(x=>x.status_anymarket)),
      valor:todos!=null?valor(todos):lista.reduce((s,x)=>s+valor(x.valor_unitario),0)
    };
  }).sort((a,b)=>String(a.first.criado_em).localeCompare(String(b.first.criado_em))||a.id.localeCompare(b.id));
  const porCorte=new Map();
  pedidos.forEach(p=>{
    const k=chaveCorte(p.first);
    porCorte.set(k,(porCorte.get(k)||0)+1);
  });
  const wb=XLSX.utils.book_new();
  criarAba(wb,"Pedidos",[
    "Pedido AnyMarket","Pedido (texto)","Entrada Liquida (SP)","Data do corte",
    "Hora do corte","Data pedido AnyMarket","Data pagamento AnyMarket",
    "Marketplace","Cliente","Qtd itens","Status atual Liquida","Status atual AnyMarket",
    "SKUs","IMEIs alocados","NFs","Valor pedido (R$)","Conferido no AnyMarket?","Observações"
  ],pedidos.map(p=>[
    idExcel(p.id),p.id,dataHora(p.first.criado_em),dataSP(p.first.criado_em),
    hora(p.first.hora_corte),p.first.data_pedido||"",p.first.data_de_pagamento||"",
    p.first.marketplace||"",p.first.cliente||"",p.itens.length,p.status,
    p.statusesAny.join(" | "),p.skus.join(" | "),p.imeis.join(" | "),
    p.nfs.join(" | "),p.valor,"",""
  ]),[21,23,26,18,18,25,26,22,30,16,27,28,42,38,25,21,24,35]);
  criarAba(wb,"Itens",[
    "Pedido AnyMarket","ID item Liquida","Sequencia do item","Entrada (SP)","Data corte",
    "Hora corte","Data pedido AnyMarket","Marketplace","Cliente","Produto",
    "SKU pedido","Grade pedido","SKU definido","Grade definida","SKU alocado",
    "Grade alocada","IMEI alocado","IMEI bipado","Status Liquida","Status AnyMarket",
    "Status definição","Etapa definição","Data alocação","Data picking","Data embalagem",
    "Data faturamento","NF","Chave NF","Rastreio","Valor unitario (R$)",
    "Valor pedido (R$)","Motivo analise","Grupo B2C"
  ],itens.map(i=>[
    idExcel(i.id_anymarket),i.id||"",i.item_seq??"",dataHora(i.criado_em),
    dataSP(i.criado_em),hora(i.hora_corte),i.data_pedido||"",i.marketplace||"",
    i.cliente||"",i.titulo_produto||"",i.sku_produto||"",i.grade_produto||"",
    i.sku_definido||"",i.grade_definida||"",i.sku_alocado||"",i.grade_alocada||"",
    i.imei_alocado||"",i.imei_bipado||"",i.status||"",i.status_anymarket||"",
    i.definicao_status||"",i.definicao_etapa||"",dataHora(i.alocado_em),
    dataHora(i.bipado_em),dataHora(i.embalado_em),dataHora(i.faturado_em),
    i.numero_nf||"",i.chave_nf||"",i.codigo_de_rastreio||"",
    valor(i.valor_unitario),valor(i.total_do_pedido),i.motivo_analise||"",i.grupo_id||""
  ]));
  const conf=criarAba(wb,"Conferencia",[
    "Pedido AnyMarket","Marketplace","Itens Liquida","Itens AnyMarket (preencher)",
    "Diferença itens","Consta no AnyMarket?","Status Liquida","Status AnyMarket",
    "NF(s)","Conferencia OK?","Observações"
  ],pedidos.map(p=>[
    idExcel(p.id),p.first.marketplace||"",p.itens.length,"","",
    "",p.status,p.statusesAny.join(" | "),p.nfs.join(" | "),"",""
  ]),[23,24,18,29,18,25,29,25,28,20,40]);
  pedidos.forEach((_,i)=>{const n=i+2;conf["E"+n]={t:"n",f:"IF(D"+n+'="","",C'+n+"-D"+n+")"};});
  const status=new Map(),market=new Map();
  pedidos.forEach(p=>{
    status.set(p.status,(status.get(p.status)||0)+1);
    const mk=p.first.marketplace||"Não informado";
    market.set(mk,(market.get(mk)||0)+1);
  });
  criarAba(wb,"Resumo",["Métrica","Valor"],[
    ["Data inicial",inicio],["Data final",fim],
    ["Início da janela SP",dia(inicio,-1)+" 13:00 (exclusive)"],
    ["Fim da janela SP",fim+" 13:00 (inclusive)"],
    ["Gerado em",dataHora(new Date().toISOString())],
    ["Pedidos AnyMarket distintos",pedidos.length],
    ["Itens B2C",itens.length],["Cortes importados",cortes.length],
    ["Itens com NF",itens.filter(x=>norm(x.numero_nf)).length],
    ["Itens sem NF",itens.filter(x=>!norm(x.numero_nf)).length],
    ["Valor somado por pedido (R$)",pedidos.reduce((s,p)=>s+p.valor,0)],
    ["",""],["Status Liquida","Pedidos"],
    ...[...status.entries()].sort((a,b)=>b[1]-a[1]),
    ["",""],["Marketplace","Pedidos"],
    ...[...market.entries()].sort((a,b)=>b[1]-a[1])
  ],[47,80]);
  criarAba(wb,"Cortes AnyMarket",[
    "Data corte","Hora corte","Arquivo importado","Linhas do arquivo (total)",
    "Pedidos novos na base Liquida","Importação em SP","Critério"
  ],cortes.map(c=>[
    c.data_operacao,hora(c.hora_corte),c.arquivo||"",
    Number(c.linhas_arquivo||0),
    porCorte.get(c.data_operacao+"|"+hora(c.hora_corte))||0,
    dataHora(c.importado_em),"Arquivo pode incluir carteira acumulada"
  ]),[20,18,40,29,33,27,48]);
  criarAba(wb,"Criterios",["Item","Regra"],[
    ["Filtro","Entrada no Liquida (criado_em) após 13:00 do dia anterior até 13:00 do dia final, SP."],
    ["Fonte","pedidos_b2c com hora_corte preenchida; mesma janela do Painel Gestor B2C."],
    ["Pedido","Uma linha por ID AnyMarket na aba Pedidos; sem duplicar pedidos com mais de um item."],
    ["Itens","Uma linha por aparelho/item cadastrado."],
    ["Status e NF","Situação ATUAL no momento da exportação, mesmo para pedidos antigos do período."],
    ["Cortes","Linhas do arquivo de origem são cumulativas, não necessariamente novos pedidos."],
    ["Conferência","Preencha a coluna D na aba Conferencia, a coluna E calcula a diferença em itens."],
    ["Limitação","O arquivo não detecta IDs ausentes no Liquida sem comparar com a planilha externa do AnyMarket."],
    ["Privacidade","Dados operacionais de uso interno."]
  ],[31,115]);
  progresso?.("Gerando Excel...");
  const nome="B2C_GESTOR_ANYMARKET_"+inicio.replaceAll("-","")+"_a_"+fim.replaceAll("-","")+".xlsx";
  XLSX.writeFile(wb,nome,{compression:true});
  return {pedidos:pedidos.length,itens:itens.length,cortes:cortes.length,nome};
}
