import { supabase } from "../lib/supabase";

export const RUAS_WMS = [
  { rua: 1, grade: "QUEBRADO", tipo: "CELULAR" },
  { rua: 2, grade: "QUEBRADO", tipo: "CELULAR" },
  { rua: 3, grade: "QUEBRADO", tipo: "CELULAR" },
  { rua: 4, grade: "QUEBRADO", tipo: "CELULAR" },
  { rua: 5, grade: "QUEBRADO", tipo: "CELULAR" },
  { rua: 6, grade: "QUEBRADO", tipo: "CELULAR" },
  { rua: 7, grade: "REGULAR", tipo: "CELULAR" },
  { rua: 8, grade: "BOM", tipo: "CELULAR" },
  { rua: 9, grade: "BOM", tipo: "CELULAR" },
  { rua: 10, grade: "MUITO BOM", tipo: "CELULAR" },
  { rua: 11, grade: "MUITO BOM", tipo: "CELULAR" },
  { rua: 12, grade: "EXCELENTE", tipo: "CELULAR" },
  { rua: 13, grade: "EXCELENTE", tipo: "CELULAR" },
  { rua: 14, grade: "LIKE NEW", tipo: "CELULAR" },
  { rua: 15, grade: "OUTROS", tipo: "TABLETS E RELÓGIOS" },
];

export const GRADES_WMS = [
  "QUEBRADO",
  "REGULAR",
  "BOM",
  "MUITO BOM",
  "EXCELENTE",
  "LIKE NEW",
  "OUTROS",
];

export function formatarEnderecoWms(item) {
  if (!item) return "—";
  return `RUA ${String(item.rua).padStart(2, "0")} · ` +
    `BL ${String(item.bloco).padStart(2, "0")} · ` +
    `AD ${String(item.andar).padStart(2, "0")} · ` +
    `AP ${item.coluna}${String(item.linha).padStart(2, "0")}`;
}

export async function buscarResumoEstoqueWms() {
  const { error: erroLimpeza } = await supabase.rpc("wms_limpar_reservas_expiradas");
  if (erroLimpeza) throw new Error(erroLimpeza.message);

  const { data, error } = await supabase.rpc("wms_resumo_estoque");
  if (error) throw new Error(error.message);
  return data || {
    total: 0,
    livres: 0,
    reservados: 0,
    ocupados: 0,
    bloqueados: 0,
    ocupacao_percentual: 0,
    aging_medio_dias: null,
    produtos_com_aging: 0,
    produtos_sem_aging: 0,
    por_grade: [],
    por_rua: [],
    por_bloco: [],
    por_andar: [],
  };
}

export async function buscarMapaAndarWms(rua, bloco, andar) {
  const { data, error } = await supabase.rpc("wms_mapa_andar_aging", {
    p_rua: Number(rua),
    p_bloco: Number(bloco),
    p_andar: Number(andar),
  });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function pesquisarEstoqueWms({
  busca = "",
  grade = "",
  status = "ocupado",
  rua = "",
  limite = 100,
} = {}) {
  const { data, error } = await supabase.rpc("wms_buscar_estoque", {
    p_busca: busca.trim() || null,
    p_grade: grade || null,
    p_status: status || null,
    p_rua: rua ? Number(rua) : null,
    p_limite: limite,
  });
  if (error) throw new Error(error.message);

  const linhas = data || [];
  return {
    total: linhas[0]?.total_encontrado || 0,
    linhas,
  };
}
