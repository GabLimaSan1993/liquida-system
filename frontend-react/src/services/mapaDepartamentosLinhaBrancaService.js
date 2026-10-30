import { supabase } from "../lib/supabase.js";

// Consultas resumidas, agregadas no PostgreSQL, com paginação de 50 OS.
// Não carrega o histórico de ciclos, triagens e produção para mostrar a localização atual.
export async function buscarMapaDepartamentosLinhaBranca({
 area="",departamento="",busca="",somenteAtivos=true,pagina=1,tamanho=50,signal
}={}) {
 let q=supabase.rpc("linha_branca_mapa_departamentos",{
  p_area:area||null,p_departamento:departamento||null,p_busca:busca.trim()||null,
  p_somente_ativos:somenteAtivos,p_pagina:pagina,p_tamanho:tamanho
 });
 if(signal)q=q.abortSignal(signal);
 const {data,error}=await q;
 if(error)throw error;
 return data||{resumo:[],itens:[],total_geral:0,total_filtrado:0,sem_definicao:0};
}

// Detalhamento sob demanda: uma única RPC carrega ciclos, responsáveis,
 // intervenções, checklist e eventos vinculados à OS específica.
export async function detalheOSLinhaBranca(osId,signal){
 let query=supabase.rpc("linha_branca_detalhe_operacional",{p_os_id:osId});
 if(signal)query=query.abortSignal(signal);
 const {data,error}=await query;
 if(error)throw error;
 return data;
}
