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
 let query=supabase.rpc("linha_branca_gestao_historico_os",{p_os_id:osId});
 if(signal)query=query.abortSignal(signal);
 const {data,error}=await query;
 if(error)throw error;
 return data;
}

/** KPIs de produtividade agrupados no banco: nunca baixar milhares de eventos para processar no navegador. */
export async function buscarProdutividadeLinhaBranca({inicio,fim,area="",departamento="",tecnico="",agrupar="dia",signal}){
 let query=supabase.rpc("linha_branca_produtividade_liquida",{
  p_inicio:inicio,p_fim:fim,p_area:area||null,p_departamento:departamento||null,
  p_tecnico:tecnico||null,p_agrupar:agrupar
 });
 if(signal)query=query.abortSignal(signal);
 const {data,error}=await query;
 if(error)throw error;
 return data;
}

/** Reconciliação do fluxo com transições registradas. Saldo rastreado nunca é tratado como estoque histórico completo. */
export async function buscarFluxoLinhaBranca({inicio,fim,area="",departamento="",signal}){
 let q=supabase.rpc("linha_branca_fluxo_periodo",{
   p_inicio:inicio,p_fim:fim,p_area:area||null,p_departamento:departamento||null
 });
 if(signal)q=q.abortSignal(signal);
 const {data,error}=await q;
 if(error)throw error;
 return data;
}

/** Drilldown dos reparos concluídos: nível máximo, especialidade e itens efetivamente executados por técnico. */
export async function buscarReparosDrilldownLinhaBranca({
 inicio,fim,area="",tecnico="",nivel="",tipo="",signal
}){
 let q=supabase.rpc("linha_branca_reparos_drilldown",{
  p_inicio:inicio,p_fim:fim,p_area:area||null,p_tecnico:tecnico||null,
  p_nivel:nivel||null,p_tipo:tipo||null
 });
 if(signal)q=q.abortSignal(signal);
 const {data,error}=await q;
 if(error)throw error;
 return data;
}
