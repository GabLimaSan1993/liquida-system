import { supabase } from '../lib/supabase.js';
import { BUCKET_DECLARACOES_ONLINE, MIME_XLSX, nomeDeclaracao } from './declaracaoConteudoOnlinePdfService.js';

async function operar(acao,aparelhoId,dados={}) {
 const { data,error }=await supabase.rpc('assurant_tradein_online_devolucao',{
   p_acao:acao,p_aparelho_id:aparelhoId,p_dados:dados
 });
 if(error)throw new Error(error.message||'Não foi possível registrar a devolução.');
 if(!data?.ok)throw new Error(data?.erro||'Operação de devolução não concluída.');
 return data;
}
export const consultarDevolucaoOnline=id=>operar('consultar',id);
export const concluirDevolucaoOnline=(id,dados)=>operar('concluir',id,dados);

async function usuarioAtual(){
 const {data,error}=await supabase.auth.getUser();
 if(error||!data?.user?.id)throw new Error('Sessão encerrada. Entre novamente no sistema.');
 return data.user.id;
}
async function subir(path,blob,contentType){
 const {error}=await supabase.storage.from(BUCKET_DECLARACOES_ONLINE).upload(path,blob,{
   contentType,upsert:false,cacheControl:'0'
 });
 if(error)throw new Error('Falha ao salvar documento da devolução: '+error.message);
 return path;
}
export async function enviarDocumentosDevolucao(aparelhoId,voucher,pdfBlob,excelBlob){
 const userId=await usuarioAtual();
 const name=userId+'/'+aparelhoId+'/'+nomeDeclaracao(voucher)+'-'+crypto.randomUUID();
 const pdf_path=await subir(name+'.pdf',pdfBlob,'application/pdf');
 const excel_path=await subir(name+'.xlsx',excelBlob,MIME_XLSX);
 return {pdf_path,excel_path};
}
export async function baixarDeclaracaoDevolucao(path,voucher,tipo){
 if(!path)throw new Error('Documento não gerado.');
 const {data,error}=await supabase.storage.from(BUCKET_DECLARACOES_ONLINE).download(path);
 if(error)throw new Error('Não foi possível baixar a declaração: '+error.message);
 const url=URL.createObjectURL(data);
 const a=document.createElement('a');
 a.href=url;a.download=nomeDeclaracao(voucher)+(tipo==='xlsx'?'.xlsx':'.pdf');
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
