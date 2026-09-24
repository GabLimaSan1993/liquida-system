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

const GRADES_OUTLET_ELEGIVEIS = new Set([
  "BOM",
  "MUITO BOM",
  "EXCELENTE",
  "LIKE NEW",
]);

function normalizarTexto(valor) {
  return String(valor || "").trim().toUpperCase();
}

export function ehProdutoOutlet({
  gradeFisica,
  grade,
  statusBateria,
  bateriaPercentual,
} = {}) {
  const gradeNormalizada = normalizarTexto(gradeFisica || grade);

  if (!GRADES_OUTLET_ELEGIVEIS.has(gradeNormalizada)) {
    return false;
  }

  const bateria = Number(bateriaPercentual);
  if (Number.isFinite(bateria) && bateria >= 70 && bateria <= 79) {
    return true;
  }

  const status = String(statusBateria || "").trim().toLowerCase();
  return /entre\s+70\s+e\s+79%?/.test(status);
}

async function enriquecerIndicadorOutlet(linhas = []) {
  const imeis = [...new Set(
    linhas
      .map((item) => String(item?.imei || "").trim())
      .filter(Boolean)
  )];

  if (!imeis.length) {
    return linhas.map((item) => ({
      ...item,
      eh_outlet: false,
    }));
  }

  const porImei = new Map();
  const BLOCO = 400;

  for (let i = 0; i < imeis.length; i += BLOCO) {
    const { data, error } = await supabase
      .from("assurant_triagem")
      .select("id,imei,grade,status_bateria,bateria_percentual,atualizado_em,criado_em")
      .in("imei", imeis.slice(i, i + BLOCO));

    if (error) {
      // O indicador é complementar: uma falha nessa leitura não pode derrubar a consulta do estoque.
      return linhas.map((item) => ({
        ...item,
        eh_outlet: false,
      }));
    }

    for (const triagem of data || []) {
      const imei = String(triagem.imei || "").trim();
      if (!imei) continue;

      const atual = porImei.get(imei);
      const dataTriagem = new Date(
        triagem.atualizado_em || triagem.criado_em || 0
      ).getTime();
      const dataAtual = atual
        ? new Date(atual.atualizado_em || atual.criado_em || 0).getTime()
        : -1;

      if (!atual || dataTriagem >= dataAtual) {
        porImei.set(imei, triagem);
      }
    }
  }

  return linhas.map((item) => {
    const triagem = porImei.get(String(item?.imei || "").trim());

    return {
      ...item,
      status_bateria: triagem?.status_bateria || null,
      bateria_percentual: triagem?.bateria_percentual ?? null,
      eh_outlet: ehProdutoOutlet({
        gradeFisica: item?.grade_fisica,
        grade: triagem?.grade || item?.grade_venda,
        statusBateria: triagem?.status_bateria,
        bateriaPercentual: triagem?.bateria_percentual,
      }),
    };
  });
}

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
  const { data, error } = await supabase.rpc("wms_mapa_andar_expedicao", {
    p_rua: Number(rua),
    p_bloco: Number(bloco),
    p_andar: Number(andar),
  });
  if (error) throw new Error(error.message);
  return enriquecerIndicadorOutlet(data || []);
}

export async function pesquisarEstoqueWms({
  busca = "",
  grade = "",
  status = "ocupado",
  rua = "",
  pagina = 1,
  tamanhoPagina = 50,
} = {}) {
  const paginaSegura = Math.max(1, Number(pagina) || 1);
  const tamanhoSeguro = Math.min(100, Math.max(1, Number(tamanhoPagina) || 50));
  const { data, error } = await supabase.rpc("wms_buscar_estoque_expedicao_pagina", {
    p_busca: busca.trim() || null,
    p_grade: grade || null,
    p_status: status || null,
    p_rua: rua ? Number(rua) : null,
    p_offset: (paginaSegura - 1) * tamanhoSeguro,
    p_tamanho: tamanhoSeguro,
  });
  if (error) throw new Error(error.message);

  const linhas = data || [];
  const linhasEnriquecidas = await enriquecerIndicadorOutlet(linhas);

  return {
    total: linhas[0]?.total_encontrado || 0,
    linhas: linhasEnriquecidas,
  };
}
