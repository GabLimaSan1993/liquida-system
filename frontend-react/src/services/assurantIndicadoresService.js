import { supabase } from "../lib/supabase";

const NUMERIC_FIELDS = new Set([
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

  "amostra",
  "media_min",
  "mediana_min",
  "p90_min",

  "mediana_anterior_min",
  "p90_anterior_min",
  "amostra_anterior",

  "variacao_mediana_pct",
  "variacao_p90_pct",
]);

function normalizarLinha(row) {
  if (!row) {
    return row;
  }

  return Object.fromEntries(
    Object.entries(row).map(
      ([key, value]) => {
        if (
          !NUMERIC_FIELDS.has(key) ||
          value == null ||
          value === ""
        ) {
          return [
            key,
            value,
          ];
        }

        const numero =
          Number(value);

        return [
          key,
          Number.isFinite(numero)
            ? numero
            : null,
        ];
      }
    )
  );
}

function normalizarLinhas(rows) {
  return (
    rows || []
  ).map(
    normalizarLinha
  );
}

async function consultarView(
  view,
  {
    limit = 500,
    order = "periodo_inicio",
  } = {}
) {
  let query =
    supabase
      .from(view)
      .select("*");

  if (order) {
    query =
      query.order(
        order,
        {
          ascending: false,
        }
      );
  }

  if (limit) {
    query =
      query.limit(
        limit
      );
  }

  const {
    data,
    error,
  } = await query;

  if (error) {
    throw new Error(
      error.message
    );
  }

  return normalizarLinhas(
    data
  );
}

export async function fetchComparativoPeriodoAtual() {
  const {
    data,
    error,
  } =
    await supabase
      .from(
        "vw_assurant_comparativo_periodo_atual"
      )
      .select("*");

  if (error) {
    throw new Error(
      error.message
    );
  }

  return normalizarLinhas(
    data
  );
}

export async function fetchKpisSemanais() {
  return consultarView(
    "vw_assurant_kpis_semanais",
    {
      limit: 40,
    }
  );
}

export async function fetchKpisMensais() {
  return consultarView(
    "vw_assurant_kpis_mensais",
    {
      limit: 30,
    }
  );
}

export async function fetchEtapasSemanais() {
  return consultarView(
    "vw_assurant_etapas_semanais",
    {
      limit: 220,
    }
  );
}

export async function fetchEtapasMensais() {
  return consultarView(
    "vw_assurant_etapas_mensais",
    {
      limit: 180,
    }
  );
}

export async function fetchIndicadoresExecutivos() {
  const [
    comparativoAtual,
    kpisSemanais,
    kpisMensais,
    etapasSemanais,
    etapasMensais,
  ] =
    await Promise.all([
      fetchComparativoPeriodoAtual(),
      fetchKpisSemanais(),
      fetchKpisMensais(),
      fetchEtapasSemanais(),
      fetchEtapasMensais(),
    ]);

  return {
    comparativoAtual,
    kpisSemanais,
    kpisMensais,
    etapasSemanais,
    etapasMensais,
  };
}