import { supabase } from '../lib/supabase.js';
export const COLUNAS_FECHAMENTO=['Cod_Loja','Voucher','Data_Trade_in','Loja','Estado_loja','Dealer','Rede','Vendedor','Usuário','Status','SKU','Marca','Modelo','Produto','Novo Aparelho','Cliente','CPF_CNPJ','Condicao','Imei','Total','Preço Real','Campanha','Valor Campanha','Status da Divergência','Motivo da Divergência','Laudo','NF_EMITIDA','Agrupamento','Inv_Status'];
export async function consultarFechamento(filters,offset=0,limit=100,summary=true,signal){
 let req=supabase.rpc('assurant_fechamento_lojas_periodo',{p_situacao:filters.situacao,p_laudo:filters.laudo,p_busca:filters.busca.trim(),p_rede:filters.rede,p_offset:offset,p_limite:limit,p_resumo:summary,p_data_inicial:filters.dataInicial||null,p_data_final:filters.dataFinal||null,p_data_referencia:filters.dataReferencia||'tradein'});
 if(signal)req=req.abortSignal(signal);
 const {data,error}=await req;if(error)throw error;return data;
}
function excelDate(value){if(!value)return null;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(value instanceof Date?value:new Date(value)).split('-').map(Number);return new Date(parts[0],parts[1]-1,parts[2]);}
export function linhaFechamento(i){
 return [i.codigo_loja||'',i.voucher?.match(/^YBV(\d+)$/)?.[1]||i.voucher||'',excelDate(i.data_tradein),i.loja||'',i.uf||'','',i.rede||'',i.vendedor||'',i.usuario||'',i.status_atual||'',i.sku||'',i.marca||'',i.modelo||'',i.produto||'',i.novo_aparelho||'',i.cliente||'',i.cpf_cnpj||'',i.condicao||'',i.imei||'',i.total==null?null:Number(i.total),i.preco_real==null?null:Number(i.preco_real),i.campanha||'',i.valor_campanha==null?null:Number(i.valor_campanha),i.tem_laudo?'Divergência':'Sem Divergência',i.tem_laudo?(i.motivo_divergencia||'Laudo registrado — motivo não informado'):'N/A',i.tem_laudo?(i.laudo_url?.startsWith('https://')?i.laudo_url:(i.laudo_url||i.laudo_id?`${window.location.origin}/v2/assurant/gestao/fechamento-lojas?laudo=${encodeURIComponent(i.voucher)}`:'Laudo registrado — PDF não disponível')):'N/A','',i.situacao==='aguardando'?'Aguardando Cosmética':i.situacao==='concluida'?'Produtos Triados':'Histórico de Laudo',i.status_atual||''];
}
export async function exportarFechamento(filters,onProgress){
 const XLSX=await import('xlsx');
 const first=await consultarFechamento(filters,0,5000,true);
 const total=Number(first.resumo.total),items=[...first.itens];onProgress(items.length,total);
 for(let offset=items.length;offset<total;offset+=5000){const next=await consultarFechamento(filters,offset,5000,false);if(!next.itens.length)throw new Error('A fila mudou durante a exportação. Atualize e exporte novamente.');items.push(...next.itens);onProgress(items.length,total);}
 if(items.length!==total||new Set(items.map(i=>i.id)).size!==total)throw new Error('A fila mudou durante a exportação. Atualize e exporte novamente.');
 const sheet=XLSX.utils.aoa_to_sheet([COLUNAS_FECHAMENTO,...items.map(linhaFechamento)],{cellDates:true});
 sheet['!autofilter']={ref:sheet['!ref']};sheet['!cols']=COLUNAS_FECHAMENTO.map((h,index)=>({wch:[1,18].includes(index)?20:Math.max(14,Math.min(30,h.length+5))}));
 for(let row=1;row<=items.length;row++){for(const col of [19,20,22]){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(cell)cell.z='"R$" #,##0.00';}const d=sheet[XLSX.utils.encode_cell({r:row,c:2})];if(d)d.z='dd/mm/yyyy';const link=sheet[XLSX.utils.encode_cell({r:row,c:25})];if(link&&typeof link.v==='string'&&link.v.startsWith('https://'))link.l={Target:link.v,Tooltip:'Abrir o laudo em PDF'};}
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Detalhe Transações');
 XLSX.writeFile(workbook,`Fechamento_Lojas_${filters.situacao}_${new Date().toISOString().slice(0,10)}.xlsx`);return total;
}

export async function baixarLaudoFechamento(item){
 if(item.laudo_url){
  if(/^https:\/\//i.test(item.laudo_url)){const a=document.createElement('a');a.href=item.laudo_url;a.target='_blank';a.rel='noopener noreferrer';a.download=`laudo_${item.voucher}.pdf`;a.click();return;}
  const {data,error}=await supabase.storage.from('triagem-laudos').download(item.laudo_url);
  if(error)throw new Error(`Não foi possível baixar o PDF: ${error.message}`);
  const url=URL.createObjectURL(data),a=document.createElement('a');a.href=url;a.download=`laudo_${item.voucher}.pdf`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return;
 }
 if(!item.laudo_id)throw new Error('O PDF original não está disponível na base.');
 const {data,error}=await supabase.rpc('assurant_fechamento_laudo',{p_laudo_id:item.laudo_id});if(error)throw error;
 const {gerarPdfLaudo}=await import('./laudoService.js');
 const dados=data.dados;let respostas=null;try{respostas=JSON.parse(data.respostas_funcional||'null');}catch{respostas=null;}
 if(respostas?.produto)dados.produto=respostas.produto;
 const doc=gerarPdfLaudo(dados,[],data.observacao,{data:data.criado_em,reemissao:true});doc.save(`laudo_${item.voucher}_reemissao.pdf`);
}
