import { supabase } from '../lib/supabase.js';
import * as XLSX from 'xlsx';

export async function buscarDadosDevolucaoOnline(aparelhoId) {
 const {data,error}=await supabase.rpc('assurant_tradein_online_dados_devolucao',{p_aparelho_id:aparelhoId});
 if(error) throw new Error(error.message||'Falha ao buscar os dados do cliente.');
 return data;
}

/** Importador do relatório diário GRV Atendimento.
 * Valores de "valor_resultado_pos_triagem" são centavos no layout original.
 */
export async function importarGrvAtendimentoOnline(file,onProgress=()=>{}) {
 if(!file || !/\.xlsx?$/i.test(file.name))throw new Error('Selecione o Excel diário do GRV Atendimento.');
 const workbook=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});
 const planilha=workbook.Sheets[workbook.SheetNames[0]];
 if(!planilha)throw new Error('Arquivo GRV sem planilha.');
 const raw=XLSX.utils.sheet_to_json(planilha,{defval:'',raw:true});
 if(!raw.length || !('numero_pedido' in raw[0]) || !('Nome' in raw[0]) || !('valor_resultado_pos_triagem' in raw[0])){
   throw new Error('Planilha incompatível: esperado relatório GRV com numero_pedido, Nome e valor_resultado_pos_triagem.');
 }
 const trim=v=>String(v??'').trim();
 const map=raw.map(v=>{
   const valorBruto=Number(String(v.valor_resultado_pos_triagem??'').replace(',','.'));
   const valor=Number.isFinite(valorBruto)&&valorBruto>0?(valorBruto/100).toFixed(2):null;
   return {
     numero_pedido:trim(v.numero_pedido),
     trade_id:trim(v.tradeId),
     imei:trim(v.imei),
     cpf_cnpj:trim(v.cpf),
     nome:trim(v.Nome),
     endereco:trim(v.endereco),
     bairro:'', // O GRV Atendimento não traz bairro em coluna própria.
     cidade:trim(v.municipio),
     uf:trim(v.estado).toUpperCase(),
     cep:trim(v.cep).replace(/\D/g,'') ? trim(v.cep).replace(/\D/g,'').padStart(8,'0') : '',
     modelo_item:trim(v.modelo_item),
     valor_declarado:valor
   };
 }).filter(v=>/^\d{1,20}$/.test(v.numero_pedido));
 if(!map.length)throw new Error('Nenhum pedido válido na planilha.');
 let feitos=0,ignorados=0;
 for(let i=0;i<map.length;i+=500){
   const pacote=map.slice(i,i+500);
   const {data,error}=await supabase.rpc('assurant_tradein_online_grv_importar',{
     p_linhas:pacote,p_arquivo:file.name.substring(0,180)
   });
   if(error)throw new Error('Erro após '+feitos+' linhas: '+error.message);
   feitos+=Number(data?.importados||0);
   ignorados+=Number(data?.ignorados||0);
   onProgress({feitos,ignorados,total:map.length});
 }
 return {feitos,ignorados,total:map.length};
}
