import { supabase } from '../lib/supabase.js';
async function carregarTudo(tabela,colunas,signal,branca=false) {
 const rows=[],tamanho=500;
 for(let inicio=0;;inicio+=tamanho){
  let query=supabase.from(tabela).select(colunas).order('id').range(inicio,inicio+tamanho-1);
  if(branca)query=query.eq('linha_produto','Linha Branca');
  if(signal)query=query.abortSignal(signal);
  const {data,error}=await query;if(error)throw error;rows.push(...(data||[]));if(!data||data.length<tamanho)return rows;
 }
}
export async function fetchGestaoLinhaBranca(signal) {
 const campos='id,numero_os,dt_entrada,created_at,criado_por,fornecedor,categoria,marca,modelo,status_atual,etapa_atual,tecnico_responsavel,tecnico_triagem,tecnico_bancada,tecnico_limpeza,tecnico_qualidade';
 const nomes=['os','triagens','triagensLegado','execucoes','ciclos','historico','eventos','consumos'];
 const resultados=await Promise.all([
  carregarTudo('ordens_servico',campos,signal,true),
  carregarTudo('linha_branca_triagens','id,os_id,triado_por,precisa_reparo,created_at',signal),
  carregarTudo('ordens_servico_triagem','id,os_id,triado_por,dt_triagem,created_at',signal),
  carregarTudo('ordens_servico_execucao','id,os_id,area_execucao,tecnico,dt_inicio,dt_fim,peca_trocada,descricao_peca_trocada,aprovado,condenado',signal),
  carregarTudo('linha_branca_lavadora_ciclos','id,os_id,etapa_teste,numero_ciclo,resultado,operador,iniciado_em,concluido_em,tempo_executado_segundos',signal),
  carregarTudo('ordens_servico_historico','id,os_id,status_anterior,status_novo,etapa_anterior,etapa_nova,responsavel,created_at',signal),
  carregarTudo('linha_branca_producao_eventos','*',signal),
  carregarTudo('linha_branca_pecas_consumos','*',signal),
 ]);
 return {...Object.fromEntries(nomes.map((n,i)=>[n,resultados[i]])),atualizadoEm:new Date().toISOString()};
}
export async function registrarConsumoPecaBranca(payload) {
 const quantidade=Number(payload.quantidade),custo=payload.custo_unitario===''?null:Number(payload.custo_unitario);
 if(!payload.os_id||!String(payload.pn||'').trim()||!String(payload.tecnico||'').trim()||!Number.isFinite(quantidade)||quantidade<=0||!Number.isFinite(Date.parse(payload.utilizado_em))||Date.parse(payload.utilizado_em)>Date.now()+60000)throw new Error('Informe OS, PN, técnico, quantidade e uma data de utilização válida, até o momento atual.');
 if(custo!==null&&(!Number.isFinite(custo)||custo<0))throw new Error('Informe um custo válido ou deixe o custo pendente.');
 const {error}=await supabase.from('linha_branca_pecas_consumos').insert({...payload,quantidade,custo_unitario:custo,pn:payload.pn.trim().toUpperCase(),tecnico:payload.tecnico.trim()});if(error)throw error;
}
export async function atualizarCustoPecaBranca(id,custo) {
 const valor=Number(custo);if(custo===''||!Number.isFinite(valor)||valor<0)throw new Error('Informe um custo válido.');
 const {data,error}=await supabase.from('linha_branca_pecas_consumos').update({custo_unitario:valor,updated_at:new Date().toISOString()}).eq('id',id).select('id').single();if(error)throw error;return data;
}
