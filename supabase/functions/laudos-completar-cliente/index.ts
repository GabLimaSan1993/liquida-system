import { createClient } from 'npm:@supabase/supabase-js@2.103.0';
import { PDFDocument, PDFArray, PDFRawStream, PDFName, StandardFonts, rgb, decodePDFRawStream } from 'npm:pdf-lib@1.17.1';
import { gerarPdfLaudo } from './pdf-reemissao.ts';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=db.storage.from('triagem-laudos');
function imageCount(doc){return doc.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream&&o.dict.get(PDFName.of('Subtype'))?.toString()==='/Image').length;}
function content(doc,page){const value=page.node.Contents();const streams=value instanceof PDFArray?Array.from({length:value.size()},(_,i)=>doc.context.lookup(value.get(i))):[value];return streams.filter(x=>x instanceof PDFRawStream).map(x=>new TextDecoder('latin1').decode(decodePDFRawStream(x).decode())).join('\n');}
function decodeLiteral(v){return v.replace(/\\([0-7]{1,3}|[nrtbf()\\])/g,(_,x)=>/^[0-7]/.test(x)?String.fromCharCode(parseInt(x,8)):({n:'\n',r:'\r',t:'\t',b:'\b',f:'\f'}[x]||x));}
async function corrigir(original,cliente){
 const doc=await PDFDocument.load(original,{updateMetadata:false});
 if(doc.getForm().getFields().some(f=>f.constructor.name.includes('Signature')))throw Error('PDF com assinatura requer revisão manual');
 const page=doc.getPages()[0],text=content(doc,page);
 let label=/\(Nome do cliente:\)\s*Tj/.exec(text);
 // AutoTable can wrap this label over two or three lines in populated PDFs.
 if(!label){const first=/\(Nome(?: do)?\)\s*Tj/.exec(text);if(first){const last=/\(cliente:\)\s*Tj/.exec(text.slice(first.index+first[0].length));if(last&&last.index<700)label={index:first.index+first[0].length+last.index,0:last[0]};}}
 if(!label)throw Error('Campo do cliente não localizado no PDF original');
 const segment=text.slice(label.index+label[0].length);
 const rect=/([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+re\b/.exec(segment);
 if(!rect)throw Error('Célula do cliente não localizada');
 const cell=segment.slice(rect.index+rect[0].length);
 const value=/\(((?:\\.|[^\\)])*)\)\s*Tj/.exec(cell);if(!value)throw Error('Valor do cliente não localizado');
 const current=decodeLiteral(value[1]).trim();
 if(current.replace(/[\s\-—–\u0096\u0097]/g,''))return {changed:false,info:{motivo:'Cliente já identificado no PDF',paginas:doc.getPageCount(),imagens:imageCount(doc)}};
 const [x,y,w,h]=rect.slice(1).map(Number),bottom=y+Math.min(0,h),height=Math.abs(h);
 if(w<10||height<8)throw Error('Dimensão da célula inesperada');
 const before={paginas:doc.getPageCount(),imagens:imageCount(doc)};
 const font=await doc.embedFont(StandardFonts.Helvetica);font.encodeText(cliente);
 const available=w-8;
 let size=Math.min(9,available/font.widthOfTextAtSize(cliente,1));
 page.drawRectangle({x:x+1,y:bottom+1,width:w-2,height:height-2,color:rgb(1,1,1)});
 page.drawText(cliente,{x:x+(w-font.widthOfTextAtSize(cliente,size))/2,y:bottom+(height-size)/2+1,size,font,color:rgb(0,0,0)});
 // Long names remain fully legible above the table as well.
 if(size<7){
  const full='Cliente: '+cliente,captionSize=Math.min(9,(page.getWidth()-80)/font.widthOfTextAtSize(full,1));
  if(captionSize<6)throw Error('Nome exige diagramação manual');
  page.drawText(full,{x:40,y:page.getHeight()-100,size:captionSize,font,color:rgb(0,0,0)});
 }
 const date=new Date().toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});
 page.drawText(`Identificação do cliente complementada em ${date}. Data e conteúdo original preservados.`,{x:40,y:22,size:6.5,font,color:rgb(.35,.35,.35)});
 doc.setModificationDate(new Date());
 const bytes=await doc.save(),verified=await PDFDocument.load(bytes,{updateMetadata:false});
 const after={paginas:verified.getPageCount(),imagens:imageCount(verified)};
 if(before.paginas!==after.paginas||before.imagens!==after.imagens)throw Error('Falha na preservação das páginas/fotos');
 return {changed:true,bytes,info:{tipo:'complementacao_cliente',...before,fonte_cliente:'triagem',tamanho_fonte:size,caption: size<7}};
}
async function preparar(item){
 if(item.pdf_original){const {data,error}=await bucket.download(item.pdf_original);if(error)throw error;const result=await corrigir(await data.arrayBuffer(),item.cliente);if(result.changed)result.info.fonte_cliente=item.dados.fonte_cliente||'triagem';return result;}
 const d=item.dados;const dados={...d.dados,cliente:item.cliente};
 try{const r=JSON.parse(d.respostas_funcional||'null');if(r?.produto)dados.produto=r.produto;}catch{}
 const doc=gerarPdfLaudo(dados,[],d.observacao,{data:d.criado_em,reemissao:true});
 const bytes=new Uint8Array(doc.output('arraybuffer'));const verified=await PDFDocument.load(bytes);
 return {changed:true,bytes,info:{tipo:'reemissao_sem_pdf_original',paginas:verified.getPageCount(),imagens:imageCount(verified),fotos_originais_indisponiveis:true,fonte_cliente:item.dados.fonte_cliente||'triagem'}};
}
Deno.serve(async req=>{
 if(req.method!=='POST')return new Response('Method not allowed',{status:405});
 const token=(req.headers.get('Authorization')||'').replace(/^Bearer\s+/i,'');
 if(!/^[a-f0-9]{64}$/.test(token))return new Response('Unauthorized',{status:401});
 const body=await req.json().catch(()=>({}));
 const {data:job,error}=await db.rpc('laudos_cliente_job',{p_token:token,p_limite:body.mode==='preview'?1:8});
 if(error)return new Response('Unauthorized',{status:401});
 try{
  if(body.mode==='verify'){
   const ids=Array.isArray(body.ids)?body.ids.slice(0,3):[];
   if(!ids.length)return Response.json({error:'IDs required'},{status:400});
   const {data:files,error:e}=await db.from('triagem_laudos').select('id,voucher,pdf_path').like('pdf_path',`retificacoes/clientes/${job.job_id}/%`).in('id',ids);
   if(e)throw e;
   const result=[];
   for(const file of files||[]){const {data,error:e}=await bucket.createSignedUrl(file.pdf_path,600);if(e)throw e;result.push({id:file.id,voucher:file.voucher,url:data.signedUrl});}
   return Response.json({files:result});
  }
  if(body.mode==='preview'){
   const item=job.itens[0];if(!item)return Response.json({done:true});
   const result=await preparar(item);if(!result.changed)return Response.json({voucher:item.voucher,info:result.info,unchanged:true});
   const path=`retificacoes/clientes/${job.job_id}/preview-${item.laudo_id}.pdf`;
   const {error:uploadError}=await bucket.upload(path,result.bytes,{contentType:'application/pdf',upsert:true});if(uploadError)throw uploadError;
   const {data:preview}=await bucket.createSignedUrl(path,600);
   const {data:original}=item.pdf_original?await bucket.createSignedUrl(item.pdf_original,600):{data:null};
   return Response.json({voucher:item.voucher,cliente:item.cliente,info:result.info,preview:preview?.signedUrl,original:original?.signedUrl});
  }
  const results=[];
  for(const item of job.itens){
   try{
    const result=await preparar(item);let path=null;
    if(result.changed){path=`retificacoes/clientes/${job.job_id}/${item.laudo_id}.pdf`;const {error:e}=await bucket.upload(path,result.bytes,{contentType:'application/pdf',upsert:true});if(e)throw e;}
    const {error:e}=await db.rpc('laudos_cliente_finalizar',{p_token:token,p_laudo_id:item.laudo_id,p_status:result.changed?'corrigido':'ja_identificado',p_path:path,p_info:result.info});if(e)throw e;
    results.push({voucher:item.voucher,status:result.changed?'corrigido':'ja_identificado',info:result.info});
   }catch(e){const message=String(e?.message||e).slice(0,500);await db.rpc('laudos_cliente_finalizar',{p_token:token,p_laudo_id:item.laudo_id,p_status:'erro',p_path:null,p_info:{erro:message}});results.push({voucher:item.voucher,status:'erro',erro:message});}
  }
  return Response.json({job_id:job.job_id,resultados:results});
 }catch(e){return Response.json({error:String(e?.message||e)},{status:500});}
});
