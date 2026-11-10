import { supabase } from '../lib/supabase.js';
import { BUCKET_LAUDOS_ONLINE, dataUrlParaBlob, nomeArquivoLaudo } from './laudoGrvExportService.js';

const mimeXlsx='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
async function operar(acao,aparelho_id,dados={}){
  const {data,error}=await supabase.rpc('assurant_tradein_online_laudo',{
    p_acao:acao,p_aparelho_id:aparelho_id,p_dados:dados
  });
  if(error)throw new Error(error.message||'Erro ao operar o Laudo Trade-In Online.');
  if(!data?.ok)throw new Error(data?.erro||'Operação de laudo não concluída.');
  return data;
}
export const consultarLaudoOnline=id=>operar('consultar',id);
export const confirmarLaudoSamv=id=>operar('samv_realizado',id);
export const salvarLaudoGrv=(id,dados)=>operar('salvar_grv',id,dados);
export const registrarDocumentosGrv=(id,pdf_path,excel_path)=>
  operar('documentos_gerados',id,{pdf_path,excel_path});
export const finalizarOmniGrv=id=>operar('omni_finalizado',id);

async function usuarioAtual(){
  const {data,error}=await supabase.auth.getUser();
  if(error||!data?.user?.id)throw new Error('Sessão encerrada. Faça login novamente.');
  return data.user.id;
}
async function enviar(path,blob,mime){
  const {error}=await supabase.storage.from(BUCKET_LAUDOS_ONLINE).upload(path,blob,{
    contentType:mime,upsert:false,cacheControl:'0'
  });
  if(error)throw new Error('Falha no upload privado ('+path.split('/').at(-1)+'): '+error.message);
  return path;
}
export async function enviarFotoLaudo(aparelhoId,indice,dataUrl){
  const userId=await usuarioAtual();
  const nome=userId+'/'+aparelhoId+'/foto-'+indice+'-'+crypto.randomUUID()+'.jpg';
  return enviar(nome,dataUrlParaBlob(dataUrl),'image/jpeg');
}
export async function enviarDocumentosLaudo(aparelhoId,voucher,pdfBlob,excelBlob){
  const userId=await usuarioAtual();
  const prefix=userId+'/'+aparelhoId+'/'+nomeArquivoLaudo(voucher)+'-'+crypto.randomUUID();
  const pdf_path=await enviar(prefix+'.pdf',pdfBlob,'application/pdf');
  const excel_path=await enviar(prefix+'.xlsx',excelBlob,mimeXlsx);
  return {pdf_path,excel_path};
}
export async function baixarArquivoLaudo(path,nome){
  if(!path)throw new Error('Arquivo não gerado.');
  const {data,error}=await supabase.storage.from(BUCKET_LAUDOS_ONLINE).download(path);
  if(error)throw new Error('Não foi possível baixar o arquivo: '+error.message);
  const url=URL.createObjectURL(data);
  const a=document.createElement('a');
  a.href=url;a.download=nome||path.split('/').at(-1);
  document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export async function recuperarFotoLaudo(path){
  const {data,error}=await supabase.storage.from(BUCKET_LAUDOS_ONLINE).download(path);
  if(error)throw new Error('Não foi possível recuperar uma foto do laudo: '+error.message);
  const reader=new FileReader();
  return new Promise((resolve,reject)=>{
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Não foi possível abrir uma foto salva.'));
    reader.readAsDataURL(data);
  });
}
