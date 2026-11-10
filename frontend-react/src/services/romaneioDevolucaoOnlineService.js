import { supabase } from '../lib/supabase.js';
import { gerarCodigoRomaneioOnline, gerarRomaneioDevolucaoOnlinePdf } from './romaneioDevolucoesOnlinePdfService.js';

const BUCKET='tradein-online-devolucoes';

async function executar(acao,dados={}) {
 const {data,error}=await supabase.rpc('assurant_tradein_online_romaneio',{
   p_acao:acao,p_dados:dados
 });
 if(error)throw new Error(error.message||'Erro ao processar o romaneio Online.');
 if(!data?.ok)throw new Error(data?.erro||'Romaneio não concluído.');
 return data;
}

export const listarRomaneiosDevolucaoOnline=()=>executar('listar');

export async function fecharRomaneioDevolucaoOnline(aparelhos,operador) {
 const ids=[...new Set((aparelhos||[]).filter(Boolean))];
 if(ids.length<1)throw new Error('Selecione ao menos um voucher para fechar o romaneio.');
 if(ids.length>500)throw new Error('Limite de 500 volumes por romaneio.');
 // Reconsulta os dados atuais: documentos, e-tickets e estado dos vouchers são
 // conferidos pelo banco antes de gerar o PDF e novamente ao fechar.
 const conferencia=await executar('conferir',{aparelhos:ids});
 const codigo=gerarCodigoRomaneioOnline();
 const pdf=gerarRomaneioDevolucaoOnlinePdf({
   codigo,itens:conferencia.itens,operador
 });
 const {data:user,error:authError}=await supabase.auth.getUser();
 if(authError||!user?.user?.id)throw new Error('Sessão expirada. Entre novamente.');
 const pdf_path=user.user.id+'/romaneios/'+codigo+'.pdf';
 const {error:uploadError}=await supabase.storage.from(BUCKET).upload(pdf_path,pdf,{
   contentType:'application/pdf',cacheControl:'0',upsert:false
 });
 if(uploadError)throw new Error('Não foi possível gravar o PDF: '+uploadError.message);
 // É uma transação indivisível. Se um item sair da fila, o banco rejeita todo o lote.
 // O arquivo privado fica preservado para diagnóstico caso a confirmação falhe.
 return executar('fechar',{
   aparelhos:ids,assinatura:conferencia.assinatura,codigo,pdf_path
 });
}

export async function baixarRomaneioDevolucaoOnline(pdfPath,codigo) {
 if(!pdfPath)throw new Error('Romaneio não possui documento PDF.');
 const {data,error}=await supabase.storage.from(BUCKET).download(pdfPath);
 if(error)throw new Error('Falha ao baixar o romaneio: '+error.message);
 const url=URL.createObjectURL(data);
 const a=document.createElement('a');
 a.href=url;a.download=(codigo||'Romaneio_Tradein_Online')+'.pdf';
 document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
