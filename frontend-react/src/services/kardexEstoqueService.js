import { supabase } from '../lib/supabase.js';

export const PERIODOS_KARDEX = [
  { id:'dia', nome:'Diária', plural:'Dias' },
  { id:'semana', nome:'Semanal', plural:'Semanas' },
  { id:'mes', nome:'Mensal', plural:'Meses' },
  { id:'trimestre', nome:'Trimestral', plural:'Trimestres' },
  { id:'ano', nome:'Anual', plural:'Anos' },
];

export async function consultarKardexWms({ inicio, fim, periodo='semana', busca='', sku='', grade='', pagina=1 }) {
  const { data,error } = await supabase.rpc('assurant_estoque_kardex', {
    p_inicio: inicio,
    p_fim: fim,
    p_periodo: periodo,
    p_busca: busca.trim() || null,
    p_sku: sku.trim() || null,
    p_grade: grade || null,
    p_pagina: pagina,
  });
  if (error) throw new Error(error.message || 'Não foi possível carregar o Kardex WMS.');
  if (!data?.ok) throw new Error(data?.erro || 'Consulta do Kardex não concluída.');
  return data;
}
