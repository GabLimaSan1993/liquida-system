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

export async function detalheOSLinhaBranca(osId,signal){
 let osq=supabase.from("ordens_servico")
   .select("id,numero_os,categoria,marca,modelo,fornecedor,origem,dt_entrada,status_atual,etapa_atual,area_destino,tecnico_responsavel,tecnico_triagem,tecnico_bancada,tecnico_limpeza,tecnico_qualidade,nivel_reparo,areas_reparo,areas_concluidas,updated_at")
   .eq("id",osId).single();
 let histq=supabase.from("ordens_servico_historico")
   .select("id,status_anterior,status_novo,etapa_anterior,etapa_nova,responsavel,created_at")
   .eq("os_id",osId).order("created_at",{ascending:false}).limit(15);
 if(signal){osq=osq.abortSignal(signal);histq=histq.abortSignal(signal)}
 const [os,hist]=await Promise.all([osq,histq]);
 if(os.error)throw os.error;
 if(hist.error)throw hist.error;
 return {os:os.data,historico:hist.data||[]};
}
