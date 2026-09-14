import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gauge,
  Layers3,
  Loader2,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingDown,
  TrendingUp,
  Warehouse,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  fetchPricingInteligenciaSku,
} from "../../services/assurantIndicadoresService.js";


/* =========================================================
   FORMATADORES
========================================================= */

function formatarNumero(
  valor,
  casas = 0
) {
  if (
    valor == null ||
    Number.isNaN(
      Number(
        valor
      )
    )
  ) {
    return "—";
  }

  return Number(
    valor
  ).toLocaleString(
    "pt-BR",
    {
      minimumFractionDigits:
        casas,

      maximumFractionDigits:
        casas,
    }
  );
}


function formatarMoeda(
  valor
) {
  if (
    valor == null ||
    Number.isNaN(
      Number(
        valor
      )
    )
  ) {
    return "—";
  }

  return Number(
    valor
  ).toLocaleString(
    "pt-BR",
    {
      style:
        "currency",

      currency:
        "BRL",

      minimumFractionDigits:
        2,

      maximumFractionDigits:
        2,
    }
  );
}


function formatarPercentual(
  valor,
  casas = 1
) {
  if (
    valor == null ||
    Number.isNaN(
      Number(
        valor
      )
    )
  ) {
    return "—";
  }

  return `${formatarNumero(
    valor,
    casas
  )}%`;
}


function formatarData(
  valor
) {
  if (
    !valor
  ) {
    return "—";
  }

  const data =
    new Date(
      valor
    );

  if (
    Number.isNaN(
      data.getTime()
    )
  ) {
    return "—";
  }

  return data.toLocaleDateString(
    "pt-BR"
  );
}


function formatarMes(
  valor
) {
  if (
    !valor
  ) {
    return "—";
  }

  const [
    ano,
    mes,
  ] =
    String(
      valor
    )
      .slice(
        0,
        10
      )
      .split(
        "-"
      );

  const meses = [
    "",
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  return `${
    meses[
      Number(
        mes
      )
    ] ||
    mes
  }/${String(
    ano
  ).slice(
    -2
  )}`;
}


function formatarDataTimestamp(
  valor
) {
  if (
    valor == null
  ) {
    return "—";
  }

  const data =
    new Date(
      Number(
        valor
      )
    );

  if (
    Number.isNaN(
      data.getTime()
    )
  ) {
    return "—";
  }

  return data.toLocaleDateString(
    "pt-BR"
  );
}


function normalizarTexto(
  valor
) {
  return String(
    valor ||
      ""
  )
    .trim()
    .toUpperCase();
}


/* =========================================================
   HELPERS
========================================================= */

function classeGrade(
  grade
) {
  const valor =
    normalizarTexto(
      grade
    );

  if (
    valor ===
    "LIKE NEW"
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  if (
    valor ===
    "EXCELENTE"
  ) {
    return "border-sky-200 bg-sky-50 text-sky-700";
  }

  if (
    valor ===
    "MUITO BOM"
  ) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }

  if (
    valor ===
    "BOM"
  ) {
    return "border-indigo-200 bg-indigo-50 text-indigo-700";
  }

  if (
    valor ===
    "REGULAR"
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    valor ===
    "QUEBRADO"
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (
    valor.includes(
      "OUTLET"
    )
  ) {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-600";
}


function classeAcao(
  acao
) {
  const valor =
    normalizarTexto(
      acao
    );

  if (
    valor.includes(
      "LIQUID"
    )
  ) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }

  if (
    valor.includes(
      "ACELER"
    ) ||
    valor.includes(
      "REDUZ"
    )
  ) {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }

  if (
    valor.includes(
      "PRESERV"
    ) ||
    valor.includes(
      "MANT"
    )
  ) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}


function obterResumo(
  resumo
) {
  if (
    Array.isArray(
      resumo
    )
  ) {
    return (
      resumo[0] ||
      {}
    );
  }

  return resumo ||
    {};
}


/* =========================================================
   COMPONENTES VISUAIS
========================================================= */

function MetricStrip({
  items,
}) {
  return (
    <div
      className="
        grid
        overflow-hidden
        rounded-2xl
        border
        border-slate-200
        bg-white
        shadow-sm
        sm:grid-cols-2
        xl:grid-cols-4
        2xl:grid-cols-8
      "
    >
      {items.map(
        (
          item,
          index
        ) => (
          <div
            key={`${item.label}-${index}`}
            className="
              min-w-0
              border-b
              border-r
              border-slate-100
              px-4
              py-4
              last:border-r-0
              2xl:border-b-0
            "
          >
            <div className="text-[9px] font-black uppercase tracking-[0.11em] text-slate-400">
              {item.label}
            </div>

            <div
              className={[
                "mt-1.5 truncate text-lg font-black tracking-tight",
                item.tone ===
                "danger"
                  ? "text-rose-700"
                  : item.tone ===
                      "warning"
                    ? "text-amber-700"
                    : item.tone ===
                        "good"
                      ? "text-emerald-700"
                      : item.tone ===
                          "violet"
                        ? "text-violet-800"
                        : "text-slate-950",
              ].join(
                " "
              )}
            >
              {item.value}
            </div>

            <div className="mt-1 truncate text-[9px] text-slate-400">
              {item.detail ||
                "—"}
            </div>
          </div>
        )
      )}
    </div>
  );
}


function Section({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  children,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Icon
                size={17}
              />
            </div>
          )}

          <div>
            {eyebrow && (
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                {eyebrow}
              </div>
            )}

            <h2 className="mt-0.5 text-sm font-black text-slate-900">
              {title}
            </h2>

            {description && (
              <p className="mt-1 max-w-4xl text-[10px] leading-4 text-slate-400">
                {description}
              </p>
            )}
          </div>
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}


function EmptyState({
  title,
  description,
  height = 280,
}) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 text-center"
      style={{
        minHeight:
          height,
      }}
    >
      <PackageSearch
        size={34}
        className="text-slate-300"
      />

      <div className="mt-3 text-sm font-black text-slate-700">
        {title}
      </div>

      <div className="mt-1 max-w-lg text-xs leading-5 text-slate-400">
        {description}
      </div>
    </div>
  );
}


function PricingTooltip({
  active,
  payload,
  label,
}) {
  if (
    !active ||
    !payload?.length
  ) {
    return null;
  }

  return (
    <div className="min-w-[210px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-2 text-[10px] font-black text-slate-700">
        {label}
      </div>

      <div className="space-y-1">
        {payload.map(
          (
            item
          ) => {
            const preco =
              String(
                item.dataKey ||
                  ""
              ).includes(
                "preco"
              );

            return (
              <div
                key={`${item.dataKey}-${item.name}`}
                className="flex items-center justify-between gap-4 text-[10px]"
              >
                <span className="font-semibold text-slate-500">
                  {item.name}
                </span>

                <span className="font-black text-slate-800">
                  {preco
                    ? formatarMoeda(
                        item.value
                      )
                    : formatarNumero(
                        item.value
                      )}
                </span>
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}


/* =========================================================
   PÁGINA
========================================================= */

export default function EstoqueInteligenciaSkuV2Page() {
  const navigate =
    useNavigate();

  const [
    searchParams,
  ] =
    useSearchParams();

  const sku =
    searchParams.get(
      "sku"
    ) ||
    "";

  const grade =
    searchParams.get(
      "grade"
    ) ||
    "";

  const imei =
    searchParams.get(
      "imei"
    ) ||
    "";

  const [
    marketplace,
    setMarketplace,
  ] =
    useState(
      ""
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    erro,
    setErro,
  ] =
    useState(
      ""
    );

  const [
    dados,
    setDados,
  ] =
    useState({
      resumo:
        null,

      grades:
        [],

      canais:
        [],

      curvaMensal:
        [],

      historicoPrecos:
        [],
    });


  /* =========================================================
     CARREGAMENTO
  ========================================================= */

  async function carregar() {
    if (
      !sku
    ) {
      setErro(
        "SKU não informado."
      );

      setLoading(
        false
      );

      return;
    }

    try {
      setLoading(
        true
      );

      setErro(
        ""
      );

      const resposta =
        await fetchPricingInteligenciaSku({
          skuBase:
            sku,

          grade:

            grade ||
            undefined,

          marketplace,
        });

      setDados(
        resposta || {
          resumo:
            null,

          grades:
            [],

          canais:
            [],

          curvaMensal:
            [],

          historicoPrecos:
            [],
        }
      );
    } catch (
      error
    ) {
      console.error(
        error
      );

      setErro(
        error?.message ||
          "Não foi possível carregar a inteligência comercial."
      );
    } finally {
      setLoading(
        false
      );
    }
  }


  useEffect(
    () => {
      carregar();
    },
    [
      sku,
      grade,
      marketplace,
    ]
  );


  /* =========================================================
     DADOS NORMALIZADOS
  ========================================================= */

  const resumo =
    obterResumo(
      dados.resumo
    );

  const grades =
    Array.isArray(
      dados.grades
    )
      ? dados.grades
      : [];

  const canais =
    Array.isArray(
      dados.canais
    )
      ? dados.canais
      : [];

  const curvaMensal =
    Array.isArray(
      dados.curvaMensal
    )
      ? dados.curvaMensal
      : [];

  const historicoPrecos =
    Array.isArray(
      dados.historicoPrecos
    )
      ? dados.historicoPrecos
      : [];


  /* =========================================================
     CANAIS
  ========================================================= */

  const marketplaces =
    useMemo(
      () =>
        Array.from(
          new Set(
            canais
              .map(
                (
                  item
                ) =>
                  item.marketplace
              )
              .filter(
                Boolean
              )
          )
        ).sort(),
      [
        canais,
      ]
    );


  /* =========================================================
     CURVA MENSAL
  ========================================================= */

  const curvaGrafico =
    useMemo(
      () =>
        curvaMensal.map(
          (
            item
          ) => ({
            ...item,

            label:
              formatarMes(
                item.mes
              ),

            saidas_brutas:
              Number(
                item.saidas_brutas ||
                  0
              ),

            saidas_liquidas_estimadas:
              Number(
                item.saidas_liquidas_estimadas ||
                  0
              ),

            preco_medio:
              item.preco_medio !=
              null
                ? Number(
                    item.preco_medio
                  )
                : null,

            preco_mediano:
              item.preco_mediano !=
              null
                ? Number(
                    item.preco_mediano
                  )
                : null,

            preco_min:
              item.preco_min !=
              null
                ? Number(
                    item.preco_min
                  )
                : null,

            preco_max:
              item.preco_max !=
              null
                ? Number(
                    item.preco_max
                  )
                : null,
          })
        ),
      [
        curvaMensal,
      ]
    );


  /* =========================================================
     DISPERSÃO DAS VENDAS
  ========================================================= */

  const dispersao =
    useMemo(
      () =>
        historicoPrecos
          .filter(
            (
              item
            ) =>
              item.data_venda &&
              item.valor_unitario !=
                null &&
              Number(
                item.valor_unitario
              ) >
                0
          )
          .map(
            (
              item
            ) => ({
              x:
                new Date(
                  item.data_venda
                ).getTime(),

              y:
                Number(
                  item.valor_unitario
                ),

              data_venda:
                item.data_venda,

              marketplace:
                item.marketplace ||
                "Sem canal",

              quantidade:
                Number(
                  item.quantidade ||
                    0
                ),

              saida_liquida_estimada:
                Number(
                  item.saida_liquida_estimada ||
                    0
                ),

              id_anymarket:
                item.id_anymarket,

              origem:
                item.origem,

              titulo_produto:
                item.titulo_produto,
            })
          ),
      [
        historicoPrecos,
      ]
    );


  /* =========================================================
     COMPARAÇÃO ENTRE GRADES
  ========================================================= */

  const comparativoGrades =
    useMemo(
      () =>
        grades.map(
          (
            item
          ) => ({
            ...item,

            nome:
              item.grade ||
              "SEM GRADE",

            estoque_atual:
              Number(
                item.estoque_atual ||
                  0
              ),

            saidas_liq_30d:
              Number(
                item.saidas_liq_30d ||
                  0
              ),

            saidas_liq_90d:
              Number(
                item.saidas_liq_90d ||
                  0
              ),

            aging_medio_dias:
              Number(
                item.aging_medio_dias ||
                  0
              ),

            score_liquidez:
              Number(
                item.score_liquidez ||
                  0
              ),
          })
        ),
      [
        grades,
      ]
    );


  /* =========================================================
     SAÍDAS POR JANELA
  ========================================================= */

  const saidasJanelas =
    useMemo(
      () => [
        {
          janela:
            "7d",

          valor:
            Number(
              resumo.saidas_liq_7d ||
                0
            ),
        },

        {
          janela:
            "15d",

          valor:
            Number(
              resumo.saidas_liq_15d ||
                0
            ),
        },

        {
          janela:
            "30d",

          valor:
            Number(
              resumo.saidas_liq_30d ||
                0
            ),
        },

        {
          janela:
            "60d",

          valor:
            Number(
              resumo.saidas_liq_60d ||
                0
            ),
        },

        {
          janela:
            "90d",

          valor:
            Number(
              resumo.saidas_liq_90d ||
                0
            ),
        },
      ],
      [
        resumo,
      ]
    );


  /* =========================================================
     CHANCE DE SAÍDA
  ========================================================= */

  const chancesSaida =
    useMemo(
      () => [
        {
          janela:
            "7 dias",

          valor:
            resumo.chance_estimada_saida_7d_pct,
        },

        {
          janela:
            "15 dias",

          valor:
            resumo.chance_estimada_saida_15d_pct,
        },

        {
          janela:
            "30 dias",

          valor:
            resumo.chance_estimada_saida_30d_pct,
        },

        {
          janela:
            "60 dias",

          valor:
            resumo.chance_estimada_saida_60d_pct,
        },
      ],
      [
        resumo,
      ]
    );


  /* =========================================================
     SCORES
  ========================================================= */

  const scores =
    useMemo(
      () => [
        {
          nome:
            "Recência",

          valor:
            Number(
              resumo.score_recencia ||
                0
            ),
        },

        {
          nome:
            "Cobertura",

          valor:
            Number(
              resumo.score_cobertura ||
                0
            ),
        },

        {
          nome:
            "Aging",

          valor:
            Number(
              resumo.score_aging ||
                0
            ),
        },

        {
          nome:
            "Liquidez",

          valor:
            Number(
              resumo.score_liquidez ||
                0
            ),
        },
      ],
      [
        resumo,
      ]
    );


  /* =========================================================
     SINAIS
  ========================================================= */

  const possuiHistorico =
    historicoPrecos.length >
    0;

  const possuiPreco =
    resumo.preco_recomendado !=
    null;

  const possuiResumo =
    Boolean(
      resumo.sku_base
    );

  const agingCritico =
    Number(
      resumo.aging_medio_dias ||
        0
    ) >
    90;

  const coberturaCritica =
    Number(
      resumo.cobertura_dias ||
        0
    ) >
    60;

  const liquidezBaixa =
    Number(
      resumo.score_liquidez ||
        0
    ) <
      40 &&
    resumo.score_liquidez !=
      null;


  /* =========================================================
     LEITURA EXECUTIVA
  ========================================================= */

  const leituraExecutiva =
    useMemo(
      () => {
        if (
          !possuiResumo
        ) {
          return "Não existe consolidação suficiente para este SKU e grade na base atual.";
        }

        if (
          !possuiHistorico
        ) {
          return `O SKU possui ${formatarNumero(
            resumo.estoque_atual
          )} unidades em estoque e aging médio de ${formatarNumero(
            resumo.aging_medio_dias,
            1
          )} dias. Não há histórico real de venda com preço suficiente para formar uma recomendação comercial confiável neste recorte.`;
        }

        const partes = [];

        partes.push(
          `${formatarNumero(
            resumo.estoque_atual
          )} unidades em estoque`
        );

        partes.push(
          `aging médio de ${formatarNumero(
            resumo.aging_medio_dias,
            1
          )} dias`
        );

        partes.push(
          `${formatarNumero(
            resumo.saidas_liq_30d
          )} saídas líquidas em 30 dias`
        );

        if (
          resumo.cobertura_dias !=
          null
        ) {
          partes.push(
            `cobertura estimada de ${formatarNumero(
              resumo.cobertura_dias,
              1
            )} dias`
          );
        }

        if (
          resumo.score_liquidez !=
          null
        ) {
          partes.push(
            `score de liquidez ${formatarNumero(
              resumo.score_liquidez,
              1
            )}`
          );
        }

        if (
          possuiPreco
        ) {
          partes.push(
            `preço recomendado de ${formatarMoeda(
              resumo.preco_recomendado
            )}`
          );
        }

        return `${partes.join(
          ", "
        )}. Ação recomendada: ${
          resumo.acao_recomendada ||
          "MONITORAR"
        }.`;
      },
      [
        possuiResumo,
        possuiHistorico,
        possuiPreco,
        resumo,
      ]
    );


  /* =========================================================
     LOADING
  ========================================================= */

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[560px] items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-700" />

          <div className="mt-3 text-sm font-black text-slate-700">
            Consolidando Stock Intelligence...
          </div>

          <div className="mt-1 text-xs text-slate-400">
            Estoque, aging, giro, vendas e preço.
          </div>
        </div>
      </div>
    );
  }


  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1750px] px-5 py-6 lg:px-8">

        {/* ===================================================
            CABEÇALHO
        =================================================== */}

        <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() =>
                  navigate(
                    -1
                  )
                }
                className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-slate-950"
              >
                <ArrowLeft
                  size={15}
                />

                Voltar ao Aging
              </button>

              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <CircleDollarSign
                    size={21}
                  />
                </div>

                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Stock Intelligence
                  </div>

                  <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Inteligência Comercial
                  </h1>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-800">
                      {sku}
                    </span>

                    {grade && (
                      <span
                        className={[
                          "inline-flex rounded-lg border px-2 py-1 text-[10px] font-black",
                          classeGrade(
                            grade
                          ),
                        ].join(
                          " "
                        )}
                      >
                        {grade}
                      </span>
                    )}

                    {resumo.modelo && (
                      <span className="text-xs font-semibold text-slate-500">
                        {resumo.modelo}
                      </span>
                    )}

                    {resumo.marca && (
                      <span className="text-xs text-slate-400">
                        · {resumo.marca}
                      </span>
                    )}
                  </div>

                  {imei && (
                    <div className="mt-2 font-mono text-[10px] font-semibold text-slate-400">
                      Origem da análise · IMEI {imei}
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={
                  marketplace
                }
                onChange={(
                  event
                ) =>
                  setMarketplace(
                    event.target.value
                  )
                }
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none transition focus:border-slate-400"
              >
                <option value="">
                  Todos os canais
                </option>

                {marketplaces.map(
                  (
                    item
                  ) => (
                    <option
                      key={
                        item
                      }
                      value={
                        item
                      }
                    >
                      {item}
                    </option>
                  )
                )}
              </select>

              <button
                type="button"
                onClick={
                  carregar
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw
                  size={14}
                />

                Atualizar
              </button>
            </div>
          </div>
        </header>


        {/* ===================================================
            ERRO
        =================================================== */}

        {erro && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs font-semibold text-rose-700">
            {erro}
          </div>
        )}


        {/* ===================================================
            MÉTRICAS PRINCIPAIS
        =================================================== */}

        <MetricStrip
          items={[
            {
              label:
                "Estoque atual",

              value:
                formatarNumero(
                  resumo.estoque_atual
                ),

              detail:
                `${formatarNumero(
                  resumo.estoque_mais_90_dias
                )} acima de 90d`,

              tone:
                "violet",
            },

            {
              label:
                "Aging médio",

              value:
                resumo.aging_medio_dias ==
                null
                  ? "—"
                  : `${formatarNumero(
                      resumo.aging_medio_dias,
                      1
                    )} dias`,

              detail:
                `${formatarNumero(
                  resumo.aging_min_dias
                )}–${formatarNumero(
                  resumo.aging_max_dias
                )} dias`,

              tone:
                agingCritico
                  ? "danger"
                  : undefined,
            },

            {
              label:
                "Saídas 30d",

              value:
                formatarNumero(
                  resumo.saidas_liq_30d
                ),

              detail:
                `${formatarNumero(
                  resumo.saidas_liq_90d
                )} em 90d`,

              tone:
                "good",
            },

            {
              label:
                "Cobertura",

              value:
                resumo.cobertura_dias ==
                null
                  ? "—"
                  : `${formatarNumero(
                      resumo.cobertura_dias,
                      1
                    )} dias`,

              detail:
                "demanda ponderada",

              tone:
                coberturaCritica
                  ? "warning"
                  : undefined,
            },

            {
              label:
                "Score liquidez",

              value:
                formatarNumero(
                  resumo.score_liquidez,
                  1
                ),

              detail:
                "escala 0–100",

              tone:
                liquidezBaixa
                  ? "danger"
                  : "good",
            },

            {
              label:
                "Preço mediano",

              value:
                formatarMoeda(
                  resumo.preco_mediano_ref
                ),

              detail:
                "referência histórica",
            },

            {
              label:
                "Último preço",

              value:
                formatarMoeda(
                  resumo.ultimo_preco_saida
                ),

              detail:
                formatarData(
                  resumo.ultima_saida_em
                ),
            },

            {
              label:
                "Preço recomendado",

              value:
                formatarMoeda(
                  resumo.preco_recomendado
                ),

              detail:
                resumo.confianca_recomendacao ||
                "sem confiança",

              tone:
                possuiPreco
                  ? "violet"
                  : undefined,
            },
          ]}
        />


        {/* ===================================================
            LEITURA ANALÍTICA
        =================================================== */}

        <div className="mt-6 rounded-2xl border border-violet-100 bg-violet-50/60 px-5 py-4">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div className="max-w-6xl">
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-700">
                Leitura analítica
              </div>

              <p className="mt-1 text-xs leading-5 text-slate-700">
                {leituraExecutiva}
              </p>
            </div>

            <span
              className={[
                "inline-flex w-fit shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.06em]",
                classeAcao(
                  resumo.acao_recomendada
                ),
              ].join(
                " "
              )}
            >
              {resumo.acao_recomendada ||
                "MONITORAR"}
            </span>
          </div>
        </div>


        {/* ===================================================
            CURVA PREÇO × GIRO
        =================================================== */}

        <div className="mt-6 grid gap-6 2xl:grid-cols-[1.4fr_0.6fr]">
          <Section
            icon={
              TrendingUp
            }
            eyebrow="Preço × Giro"
            title="Curva histórica de preço e saída"
            description="Preço realizado ao longo do tempo versus volume líquido de saída. Esta é a curva principal para avaliar direção comercial."
          >
            <div className="h-[400px] p-5">
              {curvaGrafico.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <ComposedChart
                    data={
                      curvaGrafico
                    }
                    margin={{
                      top:
                        15,

                      right:
                        20,

                      left:
                        0,

                      bottom:
                        5,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={
                        false
                      }
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      dataKey="label"
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#64748B",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                    />

                    <YAxis
                      yAxisId="preco"
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#94A3B8",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                      tickFormatter={(
                        valor
                      ) =>
                        `R$ ${formatarNumero(
                          valor
                        )}`
                      }
                      width={
                        75
                      }
                    />

                    <YAxis
                      yAxisId="volume"
                      orientation="right"
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#94A3B8",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                      width={
                        45
                      }
                    />

                    <Tooltip
                      content={
                        <PricingTooltip />
                      }
                    />

                    <Legend
                      wrapperStyle={{
                        fontSize:
                          "10px",
                      }}
                    />

                    <Bar
                      yAxisId="volume"
                      dataKey="saidas_liquidas_estimadas"
                      name="Saídas líquidas"
                      fill="#DDD6FE"
                      radius={[
                        4,
                        4,
                        0,
                        0,
                      ]}
                    />

                    <Line
                      yAxisId="preco"
                      type="monotone"
                      dataKey="preco_mediano"
                      name="Preço mediano"
                      stroke="#6D28D9"
                      strokeWidth={
                        2.8
                      }
                      dot={{
                        r:
                          3,
                      }}
                      connectNulls
                    />

                    <Line
                      yAxisId="preco"
                      type="monotone"
                      dataKey="preco_medio"
                      name="Preço médio"
                      stroke="#0F172A"
                      strokeWidth={
                        1.8
                      }
                      dot={
                        false
                      }
                      connectNulls
                    />

                    <Line
                      yAxisId="preco"
                      type="monotone"
                      dataKey="preco_min"
                      name="Mínimo"
                      stroke="#94A3B8"
                      strokeWidth={
                        1.2
                      }
                      strokeDasharray="4 4"
                      dot={
                        false
                      }
                      connectNulls
                    />

                    <Line
                      yAxisId="preco"
                      type="monotone"
                      dataKey="preco_max"
                      name="Máximo"
                      stroke="#475569"
                      strokeWidth={
                        1.2
                      }
                      strokeDasharray="4 4"
                      dot={
                        false
                      }
                      connectNulls
                    />

                    {possuiPreco && (
                      <ReferenceLine
                        yAxisId="preco"
                        y={Number(
                          resumo.preco_recomendado
                        )}
                        stroke="#059669"
                        strokeDasharray="6 4"
                        label={{
                          value:
                            "Recomendado",

                          position:
                            "insideTopRight",

                          fontSize:
                            9,

                          fill:
                            "#059669",
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Curva de preço ainda indisponível"
                  description="Não existem eventos mensais suficientes para formar a curva neste SKU, grade e canal."
                  height={
                    360
                  }
                />
              )}
            </div>
          </Section>


          {/* =================================================
              REFERÊNCIAS DE PREÇO
          ================================================= */}

          <Section
            icon={
              CircleDollarSign
            }
            eyebrow="Pricing"
            title="Faixa de preço observada"
            description="Quartis históricos usados como referência para a recomendação."
          >
            <div className="p-5">
              <div className="divide-y divide-slate-100">
                {[
                  [
                    "P25 referência",
                    resumo.preco_p25_ref,
                  ],

                  [
                    "Mediana referência",
                    resumo.preco_mediano_ref,
                  ],

                  [
                    "P75 referência",
                    resumo.preco_p75_ref,
                  ],

                  [
                    "Média 90 dias",
                    resumo.preco_medio_90d,
                  ],

                  [
                    "Mínimo 90 dias",
                    resumo.preco_min_90d,
                  ],

                  [
                    "Máximo 90 dias",
                    resumo.preco_max_90d,
                  ],

                  [
                    "Último preço",
                    resumo.ultimo_preco_saida,
                  ],

                  [
                    "Recomendado",
                    resumo.preco_recomendado,
                  ],
                ].map(
                  ([
                    label,
                    valor,
                  ]) => (
                    <div
                      key={
                        label
                      }
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <span className="text-[10px] font-semibold text-slate-500">
                        {label}
                      </span>

                      <span
                        className={[
                          "text-xs font-black",
                          label ===
                          "Recomendado"
                            ? "text-emerald-700"
                            : "text-slate-900",
                        ].join(
                          " "
                        )}
                      >
                        {formatarMoeda(
                          valor
                        )}
                      </span>
                    </div>
                  )
                )}
              </div>

              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                  Base de preço
                </div>

                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] text-slate-400">
                      90 dias
                    </div>

                    <div className="mt-1 text-lg font-black text-slate-900">
                      {formatarNumero(
                        resumo.registros_preco_90d
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] text-slate-400">
                      365 dias
                    </div>

                    <div className="mt-1 text-lg font-black text-slate-900">
                      {formatarNumero(
                        resumo.registros_preco_365d
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </div>


        {/* ===================================================
            DISPERSÃO DE VENDAS REAIS
        =================================================== */}

        <div className="mt-6">
          <Section
            icon={
              ShoppingCart
            }
            eyebrow="Vendas reais"
            title="Dispersão dos preços praticados"
            description="Cada ponto representa um evento real de venda com preço válido. Permite enxergar dispersão, recência e estabilidade comercial."
          >
            <div className="h-[410px] p-5">
              {dispersao.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <ScatterChart
                    margin={{
                      top:
                        15,

                      right:
                        20,

                      bottom:
                        10,

                      left:
                        10,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      type="number"
                      dataKey="x"
                      domain={[
                        "dataMin",
                        "dataMax",
                      ]}
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#64748B",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                      tickFormatter={
                        formatarDataTimestamp
                      }
                    />

                    <YAxis
                      type="number"
                      dataKey="y"
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#94A3B8",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                      tickFormatter={(
                        valor
                      ) =>
                        `R$ ${formatarNumero(
                          valor
                        )}`
                      }
                      width={
                        75
                      }
                    />

                    <Tooltip
                      cursor={{
                        strokeDasharray:
                          "3 3",
                      }}
                      content={({
                        active,
                        payload,
                      }) => {
                        if (
                          !active ||
                          !payload?.length
                        ) {
                          return null;
                        }

                        const item =
                          payload[0]?.payload ||
                          {};

                        return (
                          <div className="min-w-[210px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
                            <div className="text-[10px] font-black text-slate-800">
                              {formatarData(
                                item.data_venda
                              )}
                            </div>

                            <div className="mt-2 space-y-1 text-[10px]">
                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                  Preço
                                </span>

                                <strong className="text-slate-900">
                                  {formatarMoeda(
                                    item.y
                                  )}
                                </strong>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                  Canal
                                </span>

                                <strong className="text-slate-900">
                                  {item.marketplace}
                                </strong>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                  Quantidade
                                </span>

                                <strong className="text-slate-900">
                                  {formatarNumero(
                                    item.quantidade
                                  )}
                                </strong>
                              </div>

                              <div className="flex justify-between gap-4">
                                <span className="text-slate-500">
                                  Saída líquida
                                </span>

                                <strong className="text-slate-900">
                                  {formatarNumero(
                                    item.saida_liquida_estimada
                                  )}
                                </strong>
                              </div>
                            </div>
                          </div>
                        );
                      }}
                    />

                    <Scatter
                      data={
                        dispersao
                      }
                      fill="#6D28D9"
                    />

                    {resumo.preco_mediano_ref !=
                      null && (
                      <ReferenceLine
                        y={Number(
                          resumo.preco_mediano_ref
                        )}
                        stroke="#0F172A"
                        strokeDasharray="5 4"
                      />
                    )}

                    {possuiPreco && (
                      <ReferenceLine
                        y={Number(
                          resumo.preco_recomendado
                        )}
                        stroke="#059669"
                        strokeDasharray="6 4"
                      />
                    )}
                  </ScatterChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Sem vendas com preço observável"
                  description="Há estoque para este SKU/grade, mas a base ainda não possui eventos reais de venda com preço válido suficientes para esta análise."
                  height={
                    370
                  }
                />
              )}
            </div>
          </Section>
        </div>


        {/* ===================================================
            GIRO + SCORES
        =================================================== */}

        <div className="mt-6 grid gap-6 2xl:grid-cols-[1fr_1fr]">
          <Section
            icon={
              TrendingDown
            }
            eyebrow="Giro"
            title="Saídas líquidas por janela"
            description="Velocidade recente de movimentação do SKU/grade."
          >
            <div className="h-[310px] p-5">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    saidasJanelas
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={
                      false
                    }
                    stroke="#E2E8F0"
                  />

                  <XAxis
                    dataKey="janela"
                    tick={{
                      fontSize:
                        9,

                      fill:
                        "#64748B",
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <YAxis
                    tick={{
                      fontSize:
                        9,

                      fill:
                        "#94A3B8",
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) => [
                      formatarNumero(
                        value
                      ),
                      "Saídas",
                    ]}
                  />

                  <Bar
                    dataKey="valor"
                    name="Saídas líquidas"
                    fill="#059669"
                    radius={[
                      5,
                      5,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>


          <Section
            icon={
              Gauge
            }
            eyebrow="Score"
            title="Composição do score de liquidez"
            description="Recência, cobertura, aging e liquidez consolidados em escala de 0 a 100."
          >
            <div className="h-[310px] p-5">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    scores
                  }
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={
                      false
                    }
                    stroke="#E2E8F0"
                  />

                  <XAxis
                    dataKey="nome"
                    tick={{
                      fontSize:
                        9,

                      fill:
                        "#64748B",
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <YAxis
                    domain={[
                      0,
                      100,
                    ]}
                    tick={{
                      fontSize:
                        9,

                      fill:
                        "#94A3B8",
                    }}
                    axisLine={
                      false
                    }
                    tickLine={
                      false
                    }
                  />

                  <Tooltip
                    formatter={(
                      value
                    ) => [
                      formatarNumero(
                        value,
                        1
                      ),
                      "Score",
                    ]}
                  />

                  <Bar
                    dataKey="valor"
                    name="Score"
                    fill="#475569"
                    radius={[
                      5,
                      5,
                      0,
                      0,
                    ]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>


        {/* ===================================================
            CHANCE DE SAÍDA
        =================================================== */}

        <div className="mt-6">
          <Section
            icon={
              Target
            }
            eyebrow="Probabilidade"
            title="Chance estimada de saída"
            description="Probabilidade estimada para diferentes horizontes, calculada a partir do comportamento observado e da situação atual do estoque."
          >
            <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-4">
              {chancesSaida.map(
                (
                  item
                ) => (
                  <div
                    key={
                      item.janela
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4"
                  >
                    <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      {item.janela}
                    </div>

                    <div className="mt-2 text-2xl font-black tracking-tight text-slate-950">
                      {formatarPercentual(
                        item.valor
                      )}
                    </div>

                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full bg-violet-700"
                        style={{
                          width:
                            `${Math.min(
                              100,
                              Math.max(
                                0,
                                Number(
                                  item.valor ||
                                    0
                                )
                              )
                            )}%`,
                        }}
                      />
                    </div>
                  </div>
                )
              )}
            </div>
          </Section>
        </div>


        {/* ===================================================
            COMPARATIVO ENTRE GRADES
        =================================================== */}

        <div className="mt-6 grid gap-6 2xl:grid-cols-[0.85fr_1.15fr]">
          <Section
            icon={
              Layers3
            }
            eyebrow="Produto"
            title="Comparativo entre grades"
            description="Estoque atual e giro recente do mesmo SKU nas demais classificações cosméticas."
          >
            <div className="h-[350px] p-5">
              {comparativoGrades.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={
                      comparativoGrades
                    }
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={
                        false
                      }
                      stroke="#E2E8F0"
                    />

                    <XAxis
                      dataKey="nome"
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#64748B",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                      interval={
                        0
                      }
                    />

                    <YAxis
                      tick={{
                        fontSize:
                          9,

                        fill:
                          "#94A3B8",
                      }}
                      axisLine={
                        false
                      }
                      tickLine={
                        false
                      }
                    />

                    <Tooltip />

                    <Legend
                      wrapperStyle={{
                        fontSize:
                          "10px",
                      }}
                    />

                    <Bar
                      dataKey="estoque_atual"
                      name="Estoque"
                      fill="#475569"
                      radius={[
                        4,
                        4,
                        0,
                        0,
                      ]}
                    />

                    <Bar
                      dataKey="saidas_liq_30d"
                      name="Saídas 30d"
                      fill="#10B981"
                      radius={[
                        4,
                        4,
                        0,
                        0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Sem comparação entre grades"
                  description="Este SKU ainda não possui outras grades consolidadas na base."
                />
              )}
            </div>
          </Section>


          {/* =================================================
              MARKETPLACES
          ================================================= */}

          <Section
            icon={
              ShoppingCart
            }
            eyebrow="Canal"
            title="Performance por marketplace"
            description="Saída líquida e preço observado nos últimos 30 e 90 dias por canal."
          >
            {canais.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Marketplace
                      </th>

                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Saídas 30d
                      </th>

                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Saídas 90d
                      </th>

                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Registros preço
                      </th>

                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Preço médio
                      </th>

                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Mediana
                      </th>

                      <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Última saída
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {canais.map(
                      (
                        item,
                        index
                      ) => (
                        <tr
                          key={`${item.marketplace}-${index}`}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-3 text-xs font-black text-slate-800">
                            {item.marketplace ||
                              "Sem canal"}
                          </td>

                          <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                            {formatarNumero(
                              item.saidas_liq_30d
                            )}
                          </td>

                          <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                            {formatarNumero(
                              item.saidas_liq_90d
                            )}
                          </td>

                          <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                            {formatarNumero(
                              item.registros_preco_90d
                            )}
                          </td>

                          <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                            {formatarMoeda(
                              item.preco_medio_90d
                            )}
                          </td>

                          <td className="px-3 py-3 text-right text-xs font-black text-slate-800">
                            {formatarMoeda(
                              item.preco_mediano_90d
                            )}
                          </td>

                          <td className="px-5 py-3 text-right text-xs font-medium text-slate-500">
                            {formatarData(
                              item.ultima_saida_em
                            )}
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Sem performance por canal"
                description="Nenhum marketplace possui movimentação válida para este SKU/grade."
              />
            )}
          </Section>
        </div>


        {/* ===================================================
            STATUS COMERCIAL
        =================================================== */}

        <div className="mt-6">
          <Section
            icon={
              CheckCircle2
            }
            eyebrow="Decisão"
            title="Resumo da recomendação"
            description="Informações que sustentam a decisão comercial atual."
          >
            <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Última saída
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-800">
                    {formatarData(
                      resumo.ultima_saida_em
                    )}
                  </div>

                  <div className="mt-1 text-[10px] text-slate-400">
                    {resumo.dias_desde_ultima_saida !=
                    null
                      ? `${formatarNumero(
                          resumo.dias_desde_ultima_saida
                        )} dias atrás`
                      : "sem histórico"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 h-4 w-4 text-slate-400" />

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Demanda ponderada
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-800">
                    {formatarNumero(
                      resumo.demanda_diaria_ponderada,
                      3
                    )}
                    /dia
                  </div>

                  <div className="mt-1 text-[10px] text-slate-400">
                    base para cobertura
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Warehouse className="mt-0.5 h-4 w-4 text-slate-400" />

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Estoque envelhecido
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-800">
                    {formatarNumero(
                      resumo.estoque_mais_180_dias
                    )}
                  </div>

                  <div className="mt-1 text-[10px] text-slate-400">
                    acima de 180 dias
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Target className="mt-0.5 h-4 w-4 text-slate-400" />

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Confiança
                  </div>

                  <div className="mt-1 text-sm font-black text-slate-800">
                    {resumo.confianca_recomendacao ||
                      "—"}
                  </div>

                  <div className="mt-1 text-[10px] text-slate-400">
                    recomendação de preço
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </div>


        {/* ===================================================
            METODOLOGIA
        =================================================== */}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                Critério da inteligência
              </div>

              <p className="mt-1 max-w-6xl text-[10px] leading-5 text-slate-500">
                A recomendação combina posição física atual, aging,
                comportamento real de saída, recência, cobertura,
                histórico de preços e distribuição comercial observada.
                Quando a base de vendas não possui massa suficiente, o
                sistema não cria artificialmente um preço recomendado:
                a recomendação permanece sem confiança até existir
                evidência comercial adequada.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}