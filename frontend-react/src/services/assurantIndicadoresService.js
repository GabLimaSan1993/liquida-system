import { supabase } from "../lib/supabase";


/* =========================================================
   PERÍODO OFICIAL DO COCKPIT OPERACIONAL
========================================================= */

export const DATA_INICIAL_ANALISE = "2026-08-01";
export const DATA_FINAL_ANALISE = "2026-09-30";


/* =========================================================
   CAMPOS NUMÉRICOS
========================================================= */

const NUMERIC_FIELDS = new Set([
  /* KPIs B2C / B2B */
  "pedidos",
  "itens",
  "pct_concluidos",
  "mediana_leadtime_min",
  "p90_leadtime_min",
  "amostra_leadtime",
  "pedidos_periodo_anterior",
  "variacao_pedidos_pct",
  "mediana_leadtime_anterior_min",
  "variacao_leadtime_pct",

  "pedidos_atual",
  "pedidos_anterior",
  "itens_atual",
  "itens_anterior",
  "variacao_itens_pct",

  "pct_concluidos_atual",
  "pct_concluidos_anterior",
  "variacao_conclusao_pp",

  "mediana_leadtime_atual_min",
  "mediana_leadtime_anterior_min",
  "variacao_mediana_leadtime_pct",

  "p90_leadtime_atual_min",
  "p90_leadtime_anterior_min",

  "amostra_leadtime_atual",
  "amostra_leadtime_anterior",

  /* Etapas */
  "amostra",
  "media_min",
  "mediana_min",
  "p90_min",
  "mediana_anterior_min",
  "p90_anterior_min",
  "amostra_anterior",
  "variacao_mediana_pct",
  "variacao_p90_pct",

  /* Operação / Triagem */
  "recebidos",
  "funcional",
  "cosmetica",
  "laudos",
  "oracle",
  "eventos_triagem",
  "deficit_recebimento_funcional",
  "maior_entrada_dia",

  /* Lead time Triagem */
  "aparelhos",
  "excluidos_tempo_zero",
  "receb_funcional_h",
  "funcional_cosmetica_h",
  "funcional_laudo_h",
  "cosmetica_oracle_h",
  "ponta_a_ponta_h",

  /* B2B */
  "pedidos_recebidos",
  "itens_recebidos",
  "itens_faturados",
  "notas_emitidas",
  "erros_nf",

  /* B2C canais */
  "pagos",
  "embalados",
  "cancelados",
  "ciclos_validos",
  "ate_24h",
  "pct_ate_24h",
  "mediana_h",
  "p90_h",

  /* Erros e ocorrências */
  "ocorrencias",
  "falhas_integracao",
  "cancelados_marketplace",
  "cancelados_pos_embalagem",
  "cancelados_pos_faturamento",
  "erros_nf_b2b",

  /* Estoque */
  "total_estoque",
  "mais_90_dias",
  "imei_invalido",
  "sem_triagem",
  "integros",

  /* Drill-down estoque */
  "dias_estoque",
  "aging_medio_dias",
  "aging_min_dias",
  "aging_max_dias",
  "rua",
  "bloco",
  "andar",
  "linha",

  /* Pricing Intelligence */
  "quantidade",
  "valor_unitario",
  "valor_produtos",

  "estoque_atual",
  "estoque_mais_90_dias",
  "estoque_mais_180_dias",

  "saidas_brutas_total",
  "saidas_liquidas_total",

  "saidas_liq_7d",
  "saidas_liq_15d",
  "saidas_liq_30d",
  "saidas_liq_60d",
  "saidas_liq_90d",

  "saidas_brutas_30d",
  "saidas_brutas_90d",

  "registros_preco_90d",
  "registros_preco_365d",

  "preco_medio_90d",
  "preco_p25_90d",
  "preco_mediano_90d",
  "preco_p75_90d",
  "preco_min_90d",
  "preco_max_90d",

  "preco_p25_365d",
  "preco_mediano_365d",
  "preco_p75_365d",

  "preco_p25_total",
  "preco_mediano_total",
  "preco_p75_total",

  "ultimo_preco_saida",

  "demanda_diaria_ponderada",
  "cobertura_dias",

  "pct_rank_demanda_30d",

  "score_recencia",
  "score_cobertura",
  "score_aging",
  "score_liquidez",

  "chance_estimada_saida_7d_pct",
  "chance_estimada_saida_15d_pct",
  "chance_estimada_saida_30d_pct",
  "chance_estimada_saida_60d_pct",

  "preco_p25_ref",
  "preco_mediano_ref",
  "preco_p75_ref",
  "preco_recomendado",

  "saidas_brutas",
  "saidas_liquidas_estimadas",

  "preco_medio",
  "preco_mediano",
  "preco_min",
  "preco_max",
]);


/* =========================================================
   NORMALIZAÇÃO
========================================================= */

function normalizarLinha(row) {
  if (!row) {
    return row;
  }

  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      if (
        !NUMERIC_FIELDS.has(key) ||
        value == null ||
        value === ""
      ) {
        return [key, value];
      }

      const numero =
        Number(value);

      return [
        key,
        Number.isFinite(numero)
          ? numero
          : null,
      ];
    })
  );
}


function normalizarLinhas(rows) {
  return (
    rows || []
  ).map(
    normalizarLinha
  );
}


function normalizarSkuBase(
  sku
) {
  if (!sku) {
    return "";
  }

  return String(sku)
    .trim()
    .replace(
      /-CC\d+$/i,
      ""
    );
}


function normalizarGrade(
  grade
) {
  return String(
    grade || ""
  )
    .trim()
    .toUpperCase();
}


/* =========================================================
   CONSULTA GENÉRICA
========================================================= */

async function consultarView(
  view,
  {
    campoPeriodo = null,
    order = null,
    ascending = true,
  } = {}
) {
  let query =
    supabase
      .from(view)
      .select("*");

  if (campoPeriodo) {
    query =
      query
        .gte(
          campoPeriodo,
          DATA_INICIAL_ANALISE
        )
        .lte(
          campoPeriodo,
          DATA_FINAL_ANALISE
        );
  }

  if (order) {
    query =
      query.order(
        order,
        {
          ascending,
        }
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `${view}: ${error.message}`
    );
  }

  return normalizarLinhas(
    data
  );
}


/* =========================================================
   CONSULTA PAGINADA COMPLETA

   IMPORTANTE:
   não utiliza amostragem.

   Continua buscando páginas até trazer 100% dos registros
   elegíveis para o filtro solicitado.
========================================================= */

async function consultarTodasPaginas(
  criarQuery,
  {
    tamanhoPagina = 1000,
  } = {}
) {
  const resultado = [];

  let inicio = 0;

  while (true) {
    const fim =
      inicio +
      tamanhoPagina -
      1;

    const query =
      criarQuery()
        .range(
          inicio,
          fim
        );

    const {
      data,
      error,
    } = await query;

    if (error) {
      throw error;
    }

    const lote =
      data || [];

    resultado.push(
      ...lote
    );

    if (
      lote.length <
      tamanhoPagina
    ) {
      break;
    }

    inicio +=
      tamanhoPagina;
  }

  return normalizarLinhas(
    resultado
  );
}


/* =========================================================
   B2C / B2B — COMPARATIVOS EXECUTIVOS
========================================================= */

export async function fetchComparativoPeriodoAtual() {
  return consultarView(
    "vw_assurant_comparativo_periodo_atual"
  );
}


export async function fetchKpisSemanais() {
  return consultarView(
    "vw_assurant_kpis_semanais",
    {
      campoPeriodo:
        "periodo_inicio",

      order:
        "periodo_inicio",

      ascending:
        true,
    }
  );
}


export async function fetchKpisMensais() {
  return consultarView(
    "vw_assurant_kpis_mensais",
    {
      campoPeriodo:
        "periodo_inicio",

      order:
        "periodo_inicio",

      ascending:
        true,
    }
  );
}


export async function fetchEtapasSemanais() {
  return consultarView(
    "vw_assurant_etapas_semanais",
    {
      campoPeriodo:
        "periodo_inicio",

      order:
        "periodo_inicio",

      ascending:
        true,
    }
  );
}


export async function fetchEtapasMensais() {
  return consultarView(
    "vw_assurant_etapas_mensais",
    {
      campoPeriodo:
        "periodo_inicio",

      order:
        "periodo_inicio",

      ascending:
        true,
    }
  );
}


/* =========================================================
   RECEBIMENTO + PRODUÇÃO
========================================================= */

export async function fetchOperacaoDiaria() {
  return consultarView(
    "vw_assurant_operacao_dia",
    {
      campoPeriodo:
        "dia",

      order:
        "dia",

      ascending:
        true,
    }
  );
}


export async function fetchOperacaoMensal() {
  return consultarView(
    "vw_assurant_operacao_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


/* =========================================================
   LEAD TIME TRIAGEM
========================================================= */

export async function fetchLeadtimeTriagemMensal() {
  return consultarView(
    "vw_assurant_leadtime_triagem_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


/* =========================================================
   FILAS ATUAIS
========================================================= */

export async function fetchFilasAtuais() {
  return consultarView(
    "vw_ind_filas",
    {
      order:
        "aparelhos",

      ascending:
        false,
    }
  );
}


/* =========================================================
   QUALIDADE DO INBOUND
========================================================= */

export async function fetchGradesMensais() {
  return consultarView(
    "vw_ind_grades_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


/* =========================================================
   OPERAÇÃO B2B
========================================================= */

export async function fetchB2BOperacaoDiaria() {
  return consultarView(
    "vw_assurant_b2b_operacao_dia",
    {
      campoPeriodo:
        "dia",

      order:
        "dia",

      ascending:
        true,
    }
  );
}


export async function fetchB2BOperacaoMensal() {
  return consultarView(
    "vw_assurant_b2b_operacao_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


/* =========================================================
   B2C POR CANAL
========================================================= */

export async function fetchB2CCanaisMensal() {
  return consultarView(
    "vw_assurant_b2c_canal_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


export async function fetchB2CCanaisFaixasMensal() {
  return consultarView(
    "vw_assurant_b2c_canal_faixas_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


export async function fetchExpedicaoDiaria() {
  return consultarView(
    "vw_ind_expedicao_dia",
    {
      campoPeriodo:
        "dia",

      order:
        "dia",

      ascending:
        true,
    }
  );
}


/* =========================================================
   OCORRÊNCIAS
========================================================= */

export async function fetchOcorrenciasMensais() {
  return consultarView(
    "vw_ind_ocorrencias",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


/* =========================================================
   ERROS E RETRABALHO
========================================================= */

export async function fetchErrosProcessoMensais() {
  return consultarView(
    "vw_assurant_erros_processo_mes",
    {
      campoPeriodo:
        "mes",

      order:
        "mes",

      ascending:
        true,
    }
  );
}


/* =========================================================
   ESTOQUE — POSIÇÃO
========================================================= */

export async function fetchEstoquePosicaoAtual() {
  return consultarView(
    "vw_ind_estoque_posicao",
    {
      order:
        "aparelhos",

      ascending:
        false,
    }
  );
}


/* =========================================================
   ESTOQUE — AGING EXECUTIVO
========================================================= */

export async function fetchEstoqueAgingAtual() {
  return consultarView(
    "vw_ind_estoque_aging",
    {
      order:
        "faixa",

      ascending:
        true,
    }
  );
}


/* =========================================================
   ESTOQUE — QUALIDADE
========================================================= */

export async function fetchEstoqueQualidadeAtual() {
  const linhas =
    await consultarView(
      "vw_assurant_estoque_qualidade_atual"
    );

  return (
    linhas?.[0] ||
    {
      total_estoque: 0,
      mais_90_dias: 0,
      imei_invalido: 0,
      sem_triagem: 0,
      integros: 0,
    }
  );
}


/* =========================================================
   ESTOQUE — DRILL-DOWN POR AGING
========================================================= */

function limparBuscaFiltro(
  value
) {
  return String(
    value || ""
  )
    .replace(
      /[,()%]/g,
      " "
    )
    .trim();
}


export async function fetchEstoqueAgingResumoSku({
  faixa,
  limite = 100,
} = {}) {
  let query =
    supabase
      .from(
        "vw_assurant_estoque_aging_resumo_sku"
      )
      .select("*")
      .order(
        "aparelhos",
        {
          ascending:
            false,
        }
      );

  if (faixa) {
    query =
      query.eq(
        "faixa_aging",
        faixa
      );
  }

  if (limite) {
    query =
      query.limit(
        limite
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `vw_assurant_estoque_aging_resumo_sku: ${error.message}`
    );
  }

  return normalizarLinhas(
    data
  );
}


export async function fetchEstoqueAgingDetalhe({
  faixa,
  busca = "",
  grade = "",
  sku = "",
  pagina = 1,
  tamanhoPagina = 50,
} = {}) {
  const page =
    Math.max(
      1,
      Number(
        pagina || 1
      )
    );

  const pageSize =
    Math.min(
      200,
      Math.max(
        10,
        Number(
          tamanhoPagina ||
            50
        )
      )
    );

  const inicio =
    (
      page -
      1
    ) *
    pageSize;

  const fim =
    inicio +
    pageSize -
    1;

  let query =
    supabase
      .from(
        "vw_assurant_estoque_detalhe_atual"
      )
      .select(
        "*",
        {
          count:
            "exact",
        }
      );

  if (faixa) {
    query =
      query.eq(
        "faixa_aging",
        faixa
      );
  }

  if (grade) {
    query =
      query.eq(
        "grade",
        grade
      );
  }

  if (sku) {
    query =
      query.eq(
        "sku",
        sku
      );
  }

  const termo =
    limparBuscaFiltro(
      busca
    );

  if (termo) {
    query =
      query.or(
        [
          `imei.ilike.%${termo}%`,
          `sku.ilike.%${termo}%`,
          `modelo.ilike.%${termo}%`,
          `marca.ilike.%${termo}%`,
          `voucher.ilike.%${termo}%`,
          `local_subinv.ilike.%${termo}%`,
        ].join(",")
      );
  }

  query =
    query
      .order(
        "dias_estoque",
        {
          ascending:
            false,
          nullsFirst:
            false,
        }
      )
      .range(
        inicio,
        fim
      );

  const {
    data,
    error,
    count,
  } = await query;

  if (error) {
    throw new Error(
      `vw_assurant_estoque_detalhe_atual: ${error.message}`
    );
  }

  return {
    itens:
      normalizarLinhas(
        data
      ),

    total:
      Number(
        count || 0
      ),

    pagina:
      page,

    tamanhoPagina:
      pageSize,

    totalPaginas:
      Math.max(
        1,
        Math.ceil(
          Number(
            count || 0
          ) /
            pageSize
        )
      ),
  };
}


/* =========================================================
   ESTOQUE — ITEM / IMEI
========================================================= */

export async function fetchEstoqueItem(
  imei
) {
  if (!imei) {
    return null;
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "vw_assurant_estoque_detalhe_atual"
      )
      .select("*")
      .eq(
        "imei",
        imei
      )
      .limit(1);

  if (error) {
    throw new Error(
      `vw_assurant_estoque_detalhe_atual: ${error.message}`
    );
  }

  return normalizarLinha(
    data?.[0] ||
      null
  );
}


/* =========================================================
   PRICING INTELLIGENCE — RESUMO SKU × GRADE
========================================================= */

export async function fetchPricingResumoSkuGrade({
  skuBase,
  grade,
} = {}) {
  const sku =
    normalizarSkuBase(
      skuBase
    );

  if (!sku) {
    return null;
  }

  let query =
    supabase
      .from(
        "vw_assurant_pricing_recomendacao"
      )
      .select("*")
      .eq(
        "sku_base",
        sku
      );

  if (grade) {
    query =
      query.eq(
        "grade",
        normalizarGrade(
          grade
        )
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `vw_assurant_pricing_recomendacao: ${error.message}`
    );
  }

  if (grade) {
    return normalizarLinha(
      data?.[0] ||
        null
    );
  }

  return normalizarLinhas(
    data
  );
}


/* =========================================================
   PRICING INTELLIGENCE — COMPARATIVO ENTRE GRADES
========================================================= */

export async function fetchPricingComparativoGrades(
  skuBase
) {
  const sku =
    normalizarSkuBase(
      skuBase
    );

  if (!sku) {
    return [];
  }

  const {
    data,
    error,
  } =
    await supabase
      .from(
        "vw_assurant_pricing_recomendacao"
      )
      .select("*")
      .eq(
        "sku_base",
        sku
      )
      .order(
        "estoque_atual",
        {
          ascending:
            false,
        }
      );

  if (error) {
    throw new Error(
      `vw_assurant_pricing_recomendacao: ${error.message}`
    );
  }

  return normalizarLinhas(
    data
  );
}


/* =========================================================
   PRICING INTELLIGENCE — PERFORMANCE POR CANAL
========================================================= */

export async function fetchPricingCanaisSku({
  skuBase,
  grade,
} = {}) {
  const sku =
    normalizarSkuBase(
      skuBase
    );

  if (!sku) {
    return [];
  }

  let query =
    supabase
      .from(
        "vw_assurant_pricing_sku_canal"
      )
      .select("*")
      .eq(
        "sku_base",
        sku
      );

  if (grade) {
    query =
      query.eq(
        "grade",
        normalizarGrade(
          grade
        )
      );
  }

  query =
    query.order(
      "saidas_liq_90d",
      {
        ascending:
          false,
      }
    );

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `vw_assurant_pricing_sku_canal: ${error.message}`
    );
  }

  return normalizarLinhas(
    data
  );
}


/* =========================================================
   PRICING INTELLIGENCE — CURVA MENSAL
========================================================= */

export async function fetchPricingCurvaMensalSku({
  skuBase,
  grade,
  marketplace = "",
} = {}) {
  const sku =
    normalizarSkuBase(
      skuBase
    );

  if (!sku) {
    return [];
  }

  let query =
    supabase
      .from(
        "vw_assurant_pricing_sku_mes"
      )
      .select("*")
      .eq(
        "sku_base",
        sku
      );

  if (grade) {
    query =
      query.eq(
        "grade",
        normalizarGrade(
          grade
        )
      );
  }

  if (marketplace) {
    query =
      query.eq(
        "marketplace",
        marketplace
      );
  }

  query =
    query.order(
      "mes",
      {
        ascending:
          true,
      }
    );

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `vw_assurant_pricing_sku_mes: ${error.message}`
    );
  }

  return normalizarLinhas(
    data
  );
}


/* =========================================================
   PRICING INTELLIGENCE — HISTÓRICO COMPLETO DE PREÇOS

   Sem amostragem.
   Busca todas as páginas elegíveis.
========================================================= */

export async function fetchPricingHistoricoPrecos({
  skuBase,
  grade,
  marketplace = "",
} = {}) {
  const sku =
    normalizarSkuBase(
      skuBase
    );

  if (!sku) {
    return [];
  }

  try {
    return await consultarTodasPaginas(
      () => {
        let query =
          supabase
            .from(
              "vw_assurant_pricing_venda_eventos"
            )
            .select("*")
            .eq(
              "sku_base",
              sku
            );

        if (grade) {
          query =
            query.eq(
              "grade",
              normalizarGrade(
                grade
              )
            );
        }

        if (marketplace) {
          query =
            query.eq(
              "marketplace",
              marketplace
            );
        }

        return query.order(
          "data_venda",
          {
            ascending:
              true,
          }
        );
      }
    );
  } catch (error) {
    throw new Error(
      `vw_assurant_pricing_venda_eventos: ${error.message}`
    );
  }
}


/* =========================================================
   PRICING INTELLIGENCE — RANKING DE ESTOQUE
========================================================= */

export async function fetchPricingRankingEstoque({
  limite = 100,
  ordenarPor = "score_liquidez",
  ascending = true,
} = {}) {
  const camposPermitidos =
    new Set([
      "score_liquidez",
      "aging_medio_dias",
      "estoque_atual",
      "estoque_mais_90_dias",
      "estoque_mais_180_dias",
      "cobertura_dias",
      "saidas_liq_30d",
      "saidas_liq_90d",
    ]);

  const campo =
    camposPermitidos.has(
      ordenarPor
    )
      ? ordenarPor
      : "score_liquidez";

  let query =
    supabase
      .from(
        "vw_assurant_pricing_recomendacao"
      )
      .select("*")
      .gt(
        "estoque_atual",
        0
      )
      .order(
        campo,
        {
          ascending,
          nullsFirst:
            false,
        }
      );

  if (limite) {
    query =
      query.limit(
        limite
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      `vw_assurant_pricing_recomendacao: ${error.message}`
    );
  }

  return normalizarLinhas(
    data
  );
}


/* =========================================================
   PRICING INTELLIGENCE — PACOTE COMPLETO DO SKU
========================================================= */

export async function fetchPricingInteligenciaSku({
  skuBase,
  grade,
  marketplace = "",
} = {}) {
  const sku =
    normalizarSkuBase(
      skuBase
    );

  if (!sku) {
    return {
      resumo: null,
      grades: [],
      canais: [],
      curvaMensal: [],
      historicoPrecos: [],
    };
  }

  const [
    resumo,
    grades,
    canais,
    curvaMensal,
    historicoPrecos,
  ] =
    await Promise.all([
      fetchPricingResumoSkuGrade({
        skuBase:
          sku,

        grade,
      }),

      fetchPricingComparativoGrades(
        sku
      ),

      fetchPricingCanaisSku({
        skuBase:
          sku,

        grade,
      }),

      fetchPricingCurvaMensalSku({
        skuBase:
          sku,

        grade,

        marketplace,
      }),

      fetchPricingHistoricoPrecos({
        skuBase:
          sku,

        grade,

        marketplace,
      }),
    ]);

  return {
    resumo,
    grades,
    canais,
    curvaMensal,
    historicoPrecos,
  };
}


/* =========================================================
   PRICING INTELLIGENCE — ITEM DO ESTOQUE + SKU
========================================================= */

export async function fetchInteligenciaEstoqueItem(
  imei
) {
  const item =
    await fetchEstoqueItem(
      imei
    );

  if (!item) {
    return {
      item: null,
      inteligencia: null,
    };
  }

  const skuBase =
    normalizarSkuBase(
      item.sku
    );

  const inteligencia =
    await fetchPricingInteligenciaSku({
      skuBase,

      grade:
        item.grade,
    });

  return {
    item: {
      ...item,
      sku_base:
        skuBase,
    },

    inteligencia,
  };
}


/* =========================================================
   CARREGAMENTO COMPLETO DO COCKPIT
========================================================= */

export async function fetchIndicadoresExecutivos() {
  const [
    comparativoAtual,
    kpisSemanais,
    kpisMensais,
    etapasSemanais,
    etapasMensais,

    operacaoDiaria,
    operacaoMensal,
    leadtimeTriagemMensal,
    filasAtuais,
    gradesMensais,

    b2bOperacaoDiaria,
    b2bOperacaoMensal,

    b2cCanaisMensal,
    b2cCanaisFaixasMensal,
    expedicaoDiaria,

    ocorrenciasMensais,
    errosProcessoMensais,

    estoquePosicaoAtual,
    estoqueAgingAtual,
    estoqueQualidadeAtual,
  ] =
    await Promise.all([
      fetchComparativoPeriodoAtual(),
      fetchKpisSemanais(),
      fetchKpisMensais(),
      fetchEtapasSemanais(),
      fetchEtapasMensais(),

      fetchOperacaoDiaria(),
      fetchOperacaoMensal(),
      fetchLeadtimeTriagemMensal(),
      fetchFilasAtuais(),
      fetchGradesMensais(),

      fetchB2BOperacaoDiaria(),
      fetchB2BOperacaoMensal(),

      fetchB2CCanaisMensal(),
      fetchB2CCanaisFaixasMensal(),
      fetchExpedicaoDiaria(),

      fetchOcorrenciasMensais(),
      fetchErrosProcessoMensais(),

      fetchEstoquePosicaoAtual(),
      fetchEstoqueAgingAtual(),
      fetchEstoqueQualidadeAtual(),
    ]);

  return {
    /* Executivo */
    comparativoAtual,
    kpisSemanais,
    kpisMensais,
    etapasSemanais,
    etapasMensais,

    /* Warehouse */
    operacaoDiaria,
    operacaoMensal,
    leadtimeTriagemMensal,
    filasAtuais,
    gradesMensais,

    /* B2B */
    b2bOperacaoDiaria,
    b2bOperacaoMensal,

    /* B2C */
    b2cCanaisMensal,
    b2cCanaisFaixasMensal,
    expedicaoDiaria,

    /* Ocorrências */
    ocorrenciasMensais,
    errosProcessoMensais,

    /* Estoque */
    estoquePosicaoAtual,
    estoqueAgingAtual,
    estoqueQualidadeAtual,

    periodoAnalise: {
      inicio:
        DATA_INICIAL_ANALISE,

      fim:
        DATA_FINAL_ANALISE,
    },
  };
}