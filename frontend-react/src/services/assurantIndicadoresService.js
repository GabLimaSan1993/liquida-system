import { supabase } from "../lib/supabase";


/* =========================================================
   PERÍODO OFICIAL DO COCKPIT
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
   OCORRÊNCIAS — VENDA SEM ESTOQUE / DIVERGÊNCIAS
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
   ESTOQUE — AGING
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
   ESTOQUE — QUALIDADE DO DADO
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