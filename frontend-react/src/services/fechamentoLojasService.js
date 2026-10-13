import { supabase } from '../lib/supabase.js';
export const VALIDADE_LINK_LAUDO = 30 * 24 * 60 * 60;
// External legacy reports must be actual PDFs, never an application/login route.
function pdfExterno(url){
 try { const u=new URL(url);return u.protocol==='https:'&&u.hostname==='s3.sa-east-1.amazonaws.com'&&/^\/xpcell\.s3\.centercell\.com\.br\/report\/YBV\d+-report\.pdf$/.test(u.pathname); } catch { return false; }
}
export const COLUNAS_FECHAMENTO=['Cod_Loja','Voucher','Data_Trade_in','Loja','Estado_loja','Dealer','Rede','Vendedor','Usuário','Status','SKU','Marca','Modelo','Produto','Novo Aparelho','Cliente','CPF_CNPJ','Condicao','Imei','Total','Preço Real','Campanha','Valor Campanha','Status da Divergência','Motivo da Divergência','Laudo','NF_EMITIDA','Agrupamento','Inv_Status'];
export async function consultarFechamento(filters,offset=0,limit=100,summary=true,signal){
 let req=supabase.rpc('assurant_fechamento_lojas_periodo',{p_situacao:filters.situacao,p_laudo:filters.laudo,p_busca:filters.busca.trim(),p_rede:filters.rede,p_offset:offset,p_limite:limit,p_resumo:summary,p_data_inicial:filters.dataInicial||null,p_data_final:filters.dataFinal||null,p_data_referencia:'cosmetica'});
 if(signal)req=req.abortSignal(signal);
 const {data,error}=await req;if(error)throw error;return data;
}
function excelDate(value){if(!value)return null;const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(value instanceof Date?value:new Date(value)).split('-').map(Number);return new Date(parts[0],parts[1]-1,parts[2]);}
export function linhaFechamento(i,linkPdf){
 return [i.codigo_loja||'',i.voucher?.match(/^YBV(\d+)$/)?.[1]||i.voucher||'',excelDate(i.data_tradein),i.loja||'',i.uf||'','',i.rede||'',i.vendedor||'',i.usuario||'',i.status_atual||'',i.sku||'',i.marca||'',i.modelo||'',i.produto||'',i.novo_aparelho||'',i.cliente||'',i.cpf_cnpj||'',i.condicao||'',i.imei||'',i.total==null?null:Number(i.total),i.preco_real==null?null:Number(i.preco_real),i.campanha||'',i.valor_campanha==null?null:Number(i.valor_campanha),i.tem_laudo?'Divergência':'Sem Divergência',i.tem_laudo?(i.motivo_divergencia||'Laudo registrado — motivo não informado'):'N/A',i.tem_laudo?(linkPdf||(pdfExterno(i.laudo_url)?i.laudo_url:'Laudo registrado — PDF não disponível')):'N/A','',i.situacao==='aguardando'?'Aguardando Cosmética':i.situacao==='concluida'?'Produtos Triados':'Histórico de Laudo',i.status_atual||''];
}
async function arquivarReemissao(item){
 const {data,error}=await supabase.rpc('assurant_fechamento_laudo',{p_laudo_id:item.laudo_id});if(error)throw error;
 const {data:auth,error:authError}=await supabase.auth.getUser();if(authError||!auth.user)throw new Error('Sua sessão expirou. Entre novamente.');
 const {gerarPdfLaudo}=await import('./laudoService.js');
 const dados=data.dados;
 const doc=gerarPdfLaudo(dados,[],data.observacao,{data:data.criado_em,reemissao:true});
 const path=`${auth.user.id}/reemissoes/${item.laudo_id}.pdf`;
 const {error:uploadError}=await supabase.storage.from('triagem-laudos').upload(path,doc.output('blob'),{contentType:'application/pdf',upsert:false});
 if(uploadError&&String(uploadError.statusCode)!=='409'&&uploadError.message!=='The resource already exists')throw new Error(`Não foi possível arquivar o laudo ${item.voucher}: ${uploadError.message}`);
 const {data:pdfPath,error:archiveError}=await supabase.rpc('assurant_fechamento_laudo_arquivar',{p_laudo_id:item.laudo_id});
 if(archiveError)throw archiveError;return pdfPath;
}
export async function linksPdfFechamento(items){
 const links=new Map(),paths=new Map();
 const antigos=[];
 for(const item of items){
  if(!item.tem_laudo)continue;
  if(pdfExterno(item.laudo_url)){links.set(item.id,item.laudo_url);continue;}
  if(item.laudo_url&&!/^https?:/i.test(item.laudo_url)){paths.set(item.id,item.laudo_url);continue;}
  if(item.laudo_id)antigos.push(item);
 }
 // Limit concurrent reissues so exports don't overload storage or the database.
 let index=0;
 await Promise.all(Array.from({length:Math.min(4,antigos.length)},async()=>{
  while(index<antigos.length){const item=antigos[index++];paths.set(item.id,await arquivarReemissao(item));}
 }));
 const unique=[...new Set(paths.values())],signed=new Map();
 for(let start=0;start<unique.length;start+=100){
  const {data,error}=await supabase.storage.from('triagem-laudos').createSignedUrls(unique.slice(start,start+100),VALIDADE_LINK_LAUDO);
  if(error)throw new Error(`Não foi possível gerar os links dos PDFs: ${error.message}`);
  for(const file of data||[]){if(file.error||!file.signedUrl)throw new Error('Não foi possível gerar o link de um laudo. Exporte novamente.');signed.set(file.path,file.signedUrl);}
 }
 for(const [id,path] of paths){if(!signed.has(path))throw new Error('Um laudo ficou sem link PDF. Exporte novamente.');links.set(id,signed.get(path));}
 return links;
}
export async function exportarFechamento(filters,onProgress){
 const XLSX=await import('xlsx');
 const first=await consultarFechamento(filters,0,5000,true);
 const total=Number(first.resumo.total),items=[...first.itens];onProgress(items.length,total);
 for(let offset=items.length;offset<total;offset+=5000){const next=await consultarFechamento(filters,offset,5000,false);if(!next.itens.length)throw new Error('A fila mudou durante a exportação. Atualize e exporte novamente.');items.push(...next.itens);onProgress(items.length,total);}
 if(items.length!==total||new Set(items.map(i=>i.id)).size!==total)throw new Error('A fila mudou durante a exportação. Atualize e exporte novamente.');
 onProgress(items.length,total,'Preparando links diretos dos PDFs…');
 const links=await linksPdfFechamento(items);
 const sheet=XLSX.utils.aoa_to_sheet([COLUNAS_FECHAMENTO,...items.map(i=>linhaFechamento(i,links.get(i.id)))],{cellDates:true});
 sheet['!autofilter']={ref:sheet['!ref']};sheet['!cols']=COLUNAS_FECHAMENTO.map((h,index)=>({wch:[1,18].includes(index)?20:Math.max(14,Math.min(30,h.length+5))}));
 for(let row=1;row<=items.length;row++){for(const col of [19,20,22]){const cell=sheet[XLSX.utils.encode_cell({r:row,c:col})];if(cell)cell.z='"R$" #,##0.00';}const d=sheet[XLSX.utils.encode_cell({r:row,c:2})];if(d)d.z='dd/mm/yyyy';const link=sheet[XLSX.utils.encode_cell({r:row,c:25})];if(link&&typeof link.v==='string'&&link.v.startsWith('https://'))link.l={Target:link.v,Tooltip:'Abrir o laudo em PDF'};}
 const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,sheet,'Detalhe Transações');
 XLSX.writeFile(workbook,`Fechamento_Lojas_${filters.situacao}_${new Date().toISOString().slice(0,10)}.xlsx`);return total;
}

export async function baixarLaudoFechamento(item){
 const links=await linksPdfFechamento([item]),url=links.get(item.id);
 if(!url)throw new Error('O PDF não está disponível na base.');
 const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener noreferrer';a.download=`laudo_${item.voucher}.pdf`;a.click();
}
