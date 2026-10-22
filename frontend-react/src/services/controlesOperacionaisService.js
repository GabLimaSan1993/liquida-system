import { supabase } from '../lib/supabase.js';
export async function controleRpc(nome, params, signal) {
 const request=supabase.rpc(nome,params);
 const {data,error}=await(signal?request.abortSignal(signal):request);
 if(error)throw new Error(error.message);
 return data;
}
export const gestaoOperar=(acao,dados,signal)=>controleRpc('assurant_gestao_operacional',{p_acao:acao,p_dados:dados},signal);
export const baixaOperar=(acao,dados={},signal)=>controleRpc('assurant_b2c_baixa_manual',{p_acao:acao,p_dados:dados},signal);
export const hojeOperacao=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
