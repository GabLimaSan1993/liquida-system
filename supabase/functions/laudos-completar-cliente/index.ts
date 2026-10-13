import { createClient } from 'npm:@supabase/supabase-js@2.103.0';
import { PDFDocument, PDFRawStream, PDFName } from 'npm:pdf-lib@1.17.1';
import { completarPdf } from './pdf-completar.ts';
function imageCount(doc){return doc.context.enumerateIndirectObjects().filter(([,o])=>o instanceof PDFRawStream&&o.dict.get(PDFName.of('Subtype'))?.toString()==='/Image').length;}
import { gerarPdfLaudo } from './pdf-reemissao.ts';

const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const bucket=db.storage.from('triagem-laudos');
async function preparar(item){
 if(item.pdf_original){const {data,error}=await bucket.download(item.pdf_original);if(error)throw error;const result=await completarPdf(await data.arrayBuffer(),item.dados.dados);if(result.changed)result.info.fonte_cliente=item.dados.fonte_cliente||'triagem';return result;}
 const d=item.dados;const dados=d.dados;
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
  let next=0;
  await Promise.all(Array.from({length:Math.min(4,job.itens.length)},async()=>{
   while(next<job.itens.length){
   const item=job.itens[next++];
   try{
    const result=await preparar(item);let path=null;
    if(result.changed){path=`retificacoes/clientes/${job.job_id}/${item.laudo_id}.pdf`;const {error:e}=await bucket.upload(path,result.bytes,{contentType:'application/pdf',upsert:true});if(e)throw e;}
    const {error:e}=await db.rpc('laudos_cliente_finalizar',{p_token:token,p_laudo_id:item.laudo_id,p_status:result.changed?'corrigido':'ja_identificado',p_path:path,p_info:result.info});if(e)throw e;
    results.push({voucher:item.voucher,status:result.changed?'corrigido':'ja_identificado',info:result.info});
   }catch(e){const message=String(e?.message||e).slice(0,500);await db.rpc('laudos_cliente_finalizar',{p_token:token,p_laudo_id:item.laudo_id,p_status:'erro',p_path:null,p_info:{erro:message}});results.push({voucher:item.voucher,status:'erro',erro:message});}
   }
  }));
  return Response.json({job_id:job.job_id,resultados:results});
 }catch(e){return Response.json({error:String(e?.message||e)},{status:500});}
});
