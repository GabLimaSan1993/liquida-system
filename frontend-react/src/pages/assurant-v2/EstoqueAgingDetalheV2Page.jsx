import React, {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Filter,
  Layers3,
  Loader2,
  MapPin,
  PackageSearch,
  Search,
  Smartphone,
  TrendingDown,
  Warehouse,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  fetchEstoqueAgingDetalhe,
  fetchEstoqueAgingResumoSku,
} from "../../services/assurantIndicadoresService";


/* =========================================================
   CONSTANTES
========================================================= */

const FAIXAS_AGING = [
  "Até 30 dias",
  "31 a 60 dias",
  "61 a 90 dias",
  "91 a 180 dias",
  "Mais de 180 dias",
];

const PAGE_SIZE = 50;


/* =========================================================
   FORMATADORES
========================================================= */

function formatarNumero(
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

  return new Intl.NumberFormat(
    "pt-BR"
  ).format(
    Number(
      valor
    )
  );
}


function formatarDecimal(
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

  return new Intl.NumberFormat(
    "pt-BR",
    {
      minimumFractionDigits:
        casas,

      maximumFractionDigits:
        casas,
    }
  ).format(
    Number(
      valor
    )
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

  return `${formatarDecimal(
    valor,
    casas
  )}%`;
}


function formatarData(
  data
) {
  if (!data) {
    return "—";
  }

  const valor =
    new Date(
      data
    );

  if (
    Number.isNaN(
      valor.getTime()
    )
  ) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "pt-BR"
  ).format(
    valor
  );
}


function normalizarTexto(
  texto
) {
  return String(
    texto ||
      ""
  )
    .trim()
    .toUpperCase();
}


/* =========================================================
   HELPERS VISUAIS
========================================================= */

function badgeGrade(
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


function classeAging(
  dias
) {
  const valor =
    Number(
      dias ||
        0
    );

  if (
    valor >
    180
  ) {
    return "text-rose-700";
  }

  if (
    valor >
    90
  ) {
    return "text-orange-700";
  }

  if (
    valor >
    60
  ) {
    return "text-amber-700";
  }

  return "text-slate-700";
}


function construirEndereco(
  item
) {
  if (
    item?.endereco_wms
  ) {
    return item.endereco_wms;
  }

  const partes = [];

  if (
    item?.rua !=
    null
  ) {
    partes.push(
      `R${item.rua}`
    );
  }

  if (
    item?.bloco !=
    null
  ) {
    partes.push(
      `B${item.bloco}`
    );
  }

  if (
    item?.andar !=
    null
  ) {
    partes.push(
      `A${item.andar}`
    );
  }

  if (
    item?.coluna
  ) {
    partes.push(
      `${item.coluna}${String(
        item?.linha ||
          ""
      ).padStart(
        2,
        "0"
      )}`
    );
  }

  return (
    partes.join(
      " · "
    ) ||
    "—"
  );
}


/* =========================================================
   COMPONENTES
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
              border-slate-100
              px-5
              py-4
              last:border-b-0
              sm:border-r
              xl:border-b-0
            "
          >
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
              {item.label}
            </div>

            <div
              className={[
                "mt-2 text-2xl font-black tracking-tight",
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

            <div className="mt-1 text-[10px] leading-4 text-slate-400">
              {item.description ||
                "—"}
            </div>
          </div>
        )
      )}
    </div>
  );
}


function SectionHeader({
  icon: Icon,
  title,
  description,
  action,
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon
              size={17}
              strokeWidth={1.8}
            />
          </div>
        )}

        <div>
          <h2 className="text-sm font-black text-slate-900">
            {title}
          </h2>

          {description && (
            <p className="mt-1 max-w-3xl text-[10px] leading-4 text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}


function EmptyState({
  titulo,
  descricao,
  compact = false,
}) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 text-center",
        compact
          ? "min-h-[180px]"
          : "min-h-[280px]",
      ].join(
        " "
      )}
    >
      <PackageSearch
        size={32}
        className="text-slate-300"
      />

      <h3 className="mt-4 text-sm font-black text-slate-700">
        {titulo}
      </h3>

      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">
        {descricao}
      </p>
    </div>
  );
}


function GraficoTooltip({
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
    <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="mb-2 text-[10px] font-black text-slate-700">
        {label}
      </div>

      <div className="space-y-1">
        {payload.map(
          (
            item
          ) => (
            <div
              key={`${item.dataKey}-${item.name}`}
              className="flex min-w-[170px] items-center justify-between gap-4 text-[10px]"
            >
              <span className="font-semibold text-slate-500">
                {item.name}
              </span>

              <span className="font-black text-slate-800">
                {item.dataKey ===
                "aging"
                  ? `${formatarDecimal(
                      item.value,
                      1
                    )} dias`
                  : formatarNumero(
                      item.value
                    )}
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}


/* =========================================================
   PÁGINA
========================================================= */

export default function EstoqueAgingDetalheV2Page() {
  const navigate =
    useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] =
    useSearchParams();

  const faixaInicial =
    searchParams.get(
      "faixa"
    ) ||
    "Mais de 180 dias";

  const [
    faixa,
    setFaixa,
  ] =
    useState(
      FAIXAS_AGING.includes(
        faixaInicial
      )
        ? faixaInicial
        : "Mais de 180 dias"
    );

  const [
    resumoSkus,
    setResumoSkus,
  ] =
    useState([]);

  const [
    detalhes,
    setDetalhes,
  ] =
    useState({
      itens: [],
      total: 0,
      pagina: 1,
      tamanhoPagina:
        PAGE_SIZE,
      totalPaginas: 1,
    });

  const [
    loadingResumo,
    setLoadingResumo,
  ] =
    useState(
      true
    );

  const [
    loadingDetalhes,
    setLoadingDetalhes,
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
    buscaDigitada,
    setBuscaDigitada,
  ] =
    useState(
      ""
    );

  const [
    buscaAplicada,
    setBuscaAplicada,
  ] =
    useState(
      ""
    );

  const [
    grade,
    setGrade,
  ] =
    useState(
      ""
    );

  const [
    skuSelecionado,
    setSkuSelecionado,
  ] =
    useState(
      ""
    );

  const [
    pagina,
    setPagina,
  ] =
    useState(
      1
    );


  /* =========================================================
     SINCRONIZA FAIXA DA URL
  ========================================================= */

  useEffect(
    () => {
      const faixaUrl =
        searchParams.get(
          "faixa"
        );

      if (
        faixaUrl &&
        FAIXAS_AGING.includes(
          faixaUrl
        ) &&
        faixaUrl !==
          faixa
      ) {
        setFaixa(
          faixaUrl
        );

        setPagina(
          1
        );

        setGrade(
          ""
        );

        setSkuSelecionado(
          ""
        );

        setBuscaDigitada(
          ""
        );

        setBuscaAplicada(
          ""
        );
      }
    },
    [
      searchParams,
      faixa,
    ]
  );


  /* =========================================================
     RESUMO DE SKU
  ========================================================= */

  useEffect(
    () => {
      let ativo =
        true;

      async function carregarResumo() {
        try {
          setLoadingResumo(
            true
          );

          setErro(
            ""
          );

          const data =
            await fetchEstoqueAgingResumoSku({
              faixa,

              limite:
                null,
            });

          if (
            !ativo
          ) {
            return;
          }

          setResumoSkus(
            data ||
              []
          );
        } catch (
          error
        ) {
          if (
            !ativo
          ) {
            return;
          }

          console.error(
            error
          );

          setErro(
            error?.message ||
              "Não foi possível carregar o resumo de estoque."
          );
        } finally {
          if (
            ativo
          ) {
            setLoadingResumo(
              false
            );
          }
        }
      }

      carregarResumo();

      return () => {
        ativo =
          false;
      };
    },
    [
      faixa,
    ]
  );


  /* =========================================================
     DETALHES PAGINADOS
  ========================================================= */

  useEffect(
    () => {
      let ativo =
        true;

      async function carregarDetalhes() {
        try {
          setLoadingDetalhes(
            true
          );

          setErro(
            ""
          );

          const data =
            await fetchEstoqueAgingDetalhe({
              faixa,

              busca:
                buscaAplicada,

              grade,

              sku:
                skuSelecionado,

              pagina,

              tamanhoPagina:
                PAGE_SIZE,
            });

          if (
            !ativo
          ) {
            return;
          }

          setDetalhes(
            data
          );
        } catch (
          error
        ) {
          if (
            !ativo
          ) {
            return;
          }

          console.error(
            error
          );

          setErro(
            error?.message ||
              "Não foi possível carregar os aparelhos."
          );
        } finally {
          if (
            ativo
          ) {
            setLoadingDetalhes(
              false
            );
          }
        }
      }

      carregarDetalhes();

      return () => {
        ativo =
          false;
      };
    },
    [
      faixa,
      buscaAplicada,
      grade,
      skuSelecionado,
      pagina,
    ]
  );


  /* =========================================================
     TOTAL DA FAIXA
  ========================================================= */

  const totalAparelhosResumo =
    useMemo(
      () =>
        resumoSkus.reduce(
          (
            total,
            item
          ) =>
            total +
            Number(
              item.aparelhos ||
                0
            ),
          0
        ),
      [
        resumoSkus,
      ]
    );


  /* =========================================================
     AGING MÉDIO PONDERADO
  ========================================================= */

  const agingMedioFaixa =
    useMemo(
      () => {
        if (
          !resumoSkus.length ||
          !totalAparelhosResumo
        ) {
          return null;
        }

        const ponderado =
          resumoSkus.reduce(
            (
              total,
              item
            ) =>
              total +
              Number(
                item.aging_medio_dias ||
                  0
              ) *
                Number(
                  item.aparelhos ||
                    0
                ),
            0
          );

        return (
          ponderado /
          totalAparelhosResumo
        );
      },
      [
        resumoSkus,
        totalAparelhosResumo,
      ]
    );


  /* =========================================================
     GRADES DISPONÍVEIS
  ========================================================= */

  const gradesDisponiveis =
    useMemo(
      () =>
        Array.from(
          new Set(
            resumoSkus
              .map(
                (
                  item
                ) =>
                  item.grade
              )
              .filter(
                Boolean
              )
          )
        ).sort(),
      [
        resumoSkus,
      ]
    );


  /* =========================================================
     RESUMO FILTRADO
  ========================================================= */

  const resumoFiltrado =
    useMemo(
      () => {
        if (
          !grade
        ) {
          return resumoSkus;
        }

        return resumoSkus.filter(
          (
            item
          ) =>
            normalizarTexto(
              item.grade
            ) ===
            normalizarTexto(
              grade
            )
        );
      },
      [
        resumoSkus,
        grade,
      ]
    );


  /* =========================================================
     RANKING
  ========================================================= */

  const rankingCompleto =
    useMemo(
      () =>
        resumoFiltrado
          .slice()
          .sort(
            (
              a,
              b
            ) =>
              Number(
                b.aparelhos ||
                  0
              ) -
              Number(
                a.aparelhos ||
                  0
              )
          ),
      [
        resumoFiltrado,
      ]
    );


  const rankingGrafico =
    useMemo(
      () =>
        rankingCompleto
          .slice(
            0,
            12
          )
          .map(
            (
              item
            ) => ({
              nome:
                item.modelo ||
                item.sku ||
                "Sem identificação",

              sku:
                item.sku,

              grade:
                item.grade,

              aparelhos:
                Number(
                  item.aparelhos ||
                    0
                ),

              aging:
                Number(
                  item.aging_medio_dias ||
                    0
                ),
            })
          ),
      [
        rankingCompleto,
      ]
    );


  /* =========================================================
     TOP 10
  ========================================================= */

  const concentracaoTop10 =
    useMemo(
      () => {
        if (
          !totalAparelhosResumo
        ) {
          return 0;
        }

        const top10 =
          resumoSkus
            .slice()
            .sort(
              (
                a,
                b
              ) =>
                Number(
                  b.aparelhos ||
                    0
                ) -
                Number(
                  a.aparelhos ||
                    0
                )
            )
            .slice(
              0,
              10
            )
            .reduce(
              (
                total,
                item
              ) =>
                total +
                Number(
                  item.aparelhos ||
                    0
                ),
              0
            );

        return (
          top10 /
          totalAparelhosResumo
        ) *
          100;
      },
      [
        resumoSkus,
        totalAparelhosResumo,
      ]
    );


  /* =========================================================
     SKU SELECIONADO
  ========================================================= */

  const skuSelecionadoResumo =
    useMemo(
      () => {
        if (
          !skuSelecionado
        ) {
          return null;
        }

        return (
          resumoSkus.find(
            (
              item
            ) =>
              item.sku ===
                skuSelecionado &&
              (
                !grade ||
                normalizarTexto(
                  item.grade
                ) ===
                  normalizarTexto(
                    grade
                  )
              )
          ) ||
          resumoSkus.find(
            (
              item
            ) =>
              item.sku ===
              skuSelecionado
          ) ||
          null
        );
      },
      [
        resumoSkus,
        skuSelecionado,
        grade,
      ]
    );


  /* =========================================================
     AÇÕES
  ========================================================= */

  function alterarFaixa(
    novaFaixa
  ) {
    setFaixa(
      novaFaixa
    );

    setPagina(
      1
    );

    setGrade(
      ""
    );

    setSkuSelecionado(
      ""
    );

    setBuscaDigitada(
      ""
    );

    setBuscaAplicada(
      ""
    );

    setSearchParams({
      faixa:
        novaFaixa,
    });
  }


  function aplicarBusca(
    event
  ) {
    event.preventDefault();

    setPagina(
      1
    );

    setBuscaAplicada(
      buscaDigitada.trim()
    );
  }


  function limparFiltros() {
    setBuscaDigitada(
      ""
    );

    setBuscaAplicada(
      ""
    );

    setGrade(
      ""
    );

    setSkuSelecionado(
      ""
    );

    setPagina(
      1
    );
  }


  function selecionarSku(
    sku
  ) {
    if (
      !sku
    ) {
      return;
    }

    setSkuSelecionado(
      (
        atual
      ) =>
        atual ===
        sku
          ? ""
          : sku
    );

    setPagina(
      1
    );
  }


  function abrirInteligenciaSku(
    item
  ) {
    const sku =
      item?.sku;

    if (
      !sku
    ) {
      return;
    }

    const params =
      new URLSearchParams();

    params.set(
      "sku",
      sku
    );

    if (
      item?.grade
    ) {
      params.set(
        "grade",
        item.grade
      );
    }

    navigate(
      `/v2/assurant/indicadores/estoque/inteligencia?${params.toString()}`
    );
  }


  /*
   * Antes esse clique apontava para:
   *
   * /v2/assurant/indicadores/estoque/imei/:imei
   *
   * Essa rota não existe no App atual e resultava em tela branca.
   *
   * Agora o aparelho abre dentro da própria Inteligência Comercial
   * do SKU. Enviamos também o IMEI como contexto.
   */
  function abrirInteligenciaImei(
    item
  ) {
    if (
      !item?.sku
    ) {
      return;
    }

    const params =
      new URLSearchParams();

    params.set(
      "sku",
      item.sku
    );

    if (
      item?.grade
    ) {
      params.set(
        "grade",
        item.grade
      );
    }

    if (
      item?.imei
    ) {
      params.set(
        "imei",
        item.imei
      );
    }

    navigate(
      `/v2/assurant/indicadores/estoque/inteligencia?${params.toString()}`
    );
  }


  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1700px] px-5 py-6 lg:px-8">

        {/* ===================================================
            HEADER
        =================================================== */}

        <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 px-5 py-5 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    "/v2/assurant/indicadores"
                  )
                }
                className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-slate-900"
              >
                <ArrowLeft
                  size={15}
                />

                Voltar ao Cockpit
              </button>

              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Warehouse
                    size={20}
                  />
                </div>

                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Stock Intelligence
                  </p>

                  <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Aging de Estoque
                  </h1>

                  <p className="mt-1 text-xs text-slate-400">
                    Concentração física, envelhecimento, SKU, grade e aparelho.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Faixa em análise
              </div>

              <div className="mt-1 text-sm font-black text-slate-900">
                {faixa}
              </div>
            </div>
          </div>


          {/* =================================================
              FAIXAS
          ================================================= */}

          <div className="overflow-x-auto border-t border-slate-100 px-5 py-3">
            <div className="flex min-w-max gap-2">
              {FAIXAS_AGING.map(
                (
                  item
                ) => {
                  const ativo =
                    item ===
                    faixa;

                  return (
                    <button
                      key={
                        item
                      }
                      type="button"
                      onClick={() =>
                        alterarFaixa(
                          item
                        )
                      }
                      className={[
                        "rounded-lg border px-3 py-2 text-[10px] font-black transition",
                        ativo
                          ? "border-slate-950 bg-slate-950 text-white"
                          : "border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-950",
                      ].join(
                        " "
                      )}
                    >
                      {item}
                    </button>
                  );
                }
              )}
            </div>
          </div>
        </div>


        {/* ===================================================
            ERRO
        =================================================== */}

        {erro && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs font-semibold text-rose-700">
            {erro}
          </div>
        )}


        {/* ===================================================
            RESUMO
        =================================================== */}

        <MetricStrip
          items={[
            {
              label:
                "Aparelhos",

              value:
                loadingResumo
                  ? "—"
                  : formatarNumero(
                      totalAparelhosResumo
                    ),

              description:
                "posição física da faixa",

              tone:
                "violet",
            },

            {
              label:
                "SKU × Grade",

              value:
                loadingResumo
                  ? "—"
                  : formatarNumero(
                      resumoSkus.length
                    ),

              description:
                "combinações identificadas",
            },

            {
              label:
                "Aging médio",

              value:
                loadingResumo ||
                agingMedioFaixa ==
                  null
                  ? "—"
                  : `${formatarDecimal(
                      agingMedioFaixa,
                      1
                    )} dias`,

              description:
                "média ponderada",

              tone:
                agingMedioFaixa >
                180
                  ? "danger"
                  : agingMedioFaixa >
                      90
                    ? "warning"
                    : undefined,
            },

            {
              label:
                "Concentração Top 10",

              value:
                loadingResumo
                  ? "—"
                  : formatarPercentual(
                      concentracaoTop10
                    ),

              description:
                "participação dos 10 maiores",

              tone:
                concentracaoTop10 >
                60
                  ? "warning"
                  : undefined,
            },
          ]}
        />


        {/* ===================================================
            CONCENTRAÇÃO + AGING POR SKU
        =================================================== */}

        <div className="mt-6 grid gap-6 2xl:grid-cols-[1.35fr_0.65fr]">

          {/* CONCENTRAÇÃO */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader
              icon={
                BarChart3
              }
              title="Concentração do estoque"
              description="Principais SKUs da faixa. Clique em uma barra para filtrar a composição física."
            />

            <div className="p-5">
              {loadingResumo ? (
                <div className="flex h-[360px] items-center justify-center">
                  <Loader2
                    size={25}
                    className="animate-spin text-slate-400"
                  />
                </div>
              ) : rankingGrafico.length ? (
                <div className="h-[390px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <BarChart
                      data={
                        rankingGrafico
                      }
                      layout="vertical"
                      margin={{
                        top:
                          0,

                        right:
                          25,

                        left:
                          10,

                        bottom:
                          0,
                      }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        horizontal={
                          false
                        }
                        stroke="#E2E8F0"
                      />

                      <XAxis
                        type="number"
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

                      <YAxis
                        type="category"
                        dataKey="sku"
                        width={
                          115
                        }
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

                      <Tooltip
                        content={
                          <GraficoTooltip />
                        }
                      />

                      <Bar
                        dataKey="aparelhos"
                        name="Aparelhos"
                        fill="#0F172A"
                        radius={[
                          0,
                          5,
                          5,
                          0,
                        ]}
                        cursor="pointer"
                        onClick={(
                          payload
                        ) => {
                          const sku =
                            payload?.sku ||
                            payload?.payload?.sku;

                          if (
                            sku
                          ) {
                            selecionarSku(
                              sku
                            );
                          }
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  titulo="Nenhum SKU encontrado"
                  descricao="Não existem itens para a faixa e filtros selecionados."
                />
              )}
            </div>
          </section>


          {/* AGING DOS PRINCIPAIS */}

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader
              icon={
                Clock3
              }
              title="Aging dos principais SKUs"
              description="Envelhecimento médio dos maiores estoques da faixa."
            />

            <div className="p-5">
              {loadingResumo ? (
                <div className="flex h-[360px] items-center justify-center">
                  <Loader2
                    size={25}
                    className="animate-spin text-slate-400"
                  />
                </div>
              ) : rankingGrafico.length ? (
                <div className="h-[390px]">
                  <ResponsiveContainer
                    width="100%"
                    height="100%"
                  >
                    <LineChart
                      data={
                        rankingGrafico
                      }
                      margin={{
                        top:
                          15,

                        right:
                          15,

                        left:
                          0,

                        bottom:
                          45,
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
                        dataKey="sku"
                        angle={
                          -35
                        }
                        textAnchor="end"
                        interval={
                          0
                        }
                        height={
                          70
                        }
                        tick={{
                          fontSize:
                            8,

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
                        tickFormatter={(
                          value
                        ) =>
                          `${formatarNumero(
                            value
                          )}d`
                        }
                      />

                      <Tooltip
                        content={
                          <GraficoTooltip />
                        }
                      />

                      <Legend
                        wrapperStyle={{
                          fontSize:
                            "10px",
                        }}
                      />

                      <Line
                        type="monotone"
                        dataKey="aging"
                        name="Aging médio"
                        stroke="#6D28D9"
                        strokeWidth={
                          2.5
                        }
                        dot={{
                          r:
                            3,
                        }}
                        activeDot={{
                          r:
                            5,
                        }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState
                  titulo="Sem aging disponível"
                  descricao="Não há informação suficiente para construir esta leitura."
                />
              )}
            </div>
          </section>
        </div>


        {/* ===================================================
            RANKING COMPLETO
        =================================================== */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={
              TrendingDown
            }
            title="Ranking de concentração"
            description="Maiores posições físicas da faixa por SKU e grade. Selecione um SKU para abrir sua composição."
          />

          {loadingResumo ? (
            <div className="flex min-h-[250px] items-center justify-center">
              <Loader2
                size={24}
                className="animate-spin text-slate-400"
              />
            </div>
          ) : rankingCompleto.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      #
                    </th>

                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      SKU
                    </th>

                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Modelo
                    </th>

                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Grade
                    </th>

                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Aparelhos
                    </th>

                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Aging médio
                    </th>

                    <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                      Ação
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {rankingCompleto
                    .slice(
                      0,
                      40
                    )
                    .map(
                      (
                        item,
                        index
                      ) => {
                        const ativo =
                          skuSelecionado ===
                          item.sku;

                        return (
                          <tr
                            key={`${item.sku}-${item.grade}-${index}`}
                            className={[
                              "transition",
                              ativo
                                ? "bg-violet-50/70"
                                : "hover:bg-slate-50",
                            ].join(
                              " "
                            )}
                          >
                            <td className="px-5 py-3 text-xs font-black text-slate-400">
                              {index +
                                1}
                            </td>

                            <td className="px-3 py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  selecionarSku(
                                    item.sku
                                  )
                                }
                                className="font-mono text-xs font-black text-slate-800 hover:text-violet-800"
                              >
                                {item.sku ||
                                  "—"}
                              </button>
                            </td>

                            <td className="max-w-[420px] px-3 py-3">
                              <div className="truncate text-xs font-semibold text-slate-700">
                                {item.modelo ||
                                  "—"}
                              </div>
                            </td>

                            <td className="px-3 py-3">
                              <span
                                className={[
                                  "inline-flex rounded-lg border px-2 py-1 text-[10px] font-black",
                                  badgeGrade(
                                    item.grade
                                  ),
                                ].join(
                                  " "
                                )}
                              >
                                {item.grade ||
                                  "SEM GRADE"}
                              </span>
                            </td>

                            <td className="px-3 py-3 text-right text-xs font-black text-slate-900">
                              {formatarNumero(
                                item.aparelhos
                              )}
                            </td>

                            <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                              {formatarDecimal(
                                item.aging_medio_dias,
                                1
                              )}{" "}
                              dias
                            </td>

                            <td className="px-5 py-3 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  abrirInteligenciaSku(
                                    item
                                  )
                                }
                                className="inline-flex items-center gap-1.5 text-[10px] font-black text-violet-700 transition hover:text-violet-950"
                              >
                                Inteligência

                                <ArrowRight
                                  size={13}
                                />
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                titulo="Nenhuma concentração encontrada"
                descricao="Nenhum SKU foi encontrado para a combinação selecionada."
                compact
              />
            </div>
          )}
        </section>


        {/* ===================================================
            FILTROS
        =================================================== */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={
              Filter
            }
            title="Investigação física"
            description="Filtre o detalhe por IMEI, produto, voucher, subinventário, grade ou SKU."
          />

          <div className="p-5">
            <div className="grid gap-3 xl:grid-cols-[1fr_260px_auto]">
              <form
                onSubmit={
                  aplicarBusca
                }
                className="flex min-w-0 gap-2"
              >
                <div className="relative min-w-0 flex-1">
                  <Search
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />

                  <input
                    value={
                      buscaDigitada
                    }
                    onChange={(
                      event
                    ) =>
                      setBuscaDigitada(
                        event.target.value
                      )
                    }
                    placeholder="IMEI, SKU, modelo, marca, voucher ou subinventário..."
                    className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-xs font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
                  />
                </div>

                <button
                  type="submit"
                  className="h-11 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800"
                >
                  Buscar
                </button>
              </form>

              <select
                value={
                  grade
                }
                onChange={(
                  event
                ) => {
                  setGrade(
                    event.target.value
                  );

                  setSkuSelecionado(
                    ""
                  );

                  setPagina(
                    1
                  );
                }}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-slate-400"
              >
                <option value="">
                  Todas as grades
                </option>

                {gradesDisponiveis.map(
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
                  limparFiltros
                }
                className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
              >
                Limpar filtros
              </button>
            </div>


            {/* ===============================================
                SKU SELECIONADO
            =============================================== */}

            {skuSelecionadoResumo && (
              <div className="mt-4 flex flex-col gap-3 rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-500">
                    SKU selecionado
                  </div>

                  <div className="mt-1 truncate text-sm font-black text-slate-900">
                    {skuSelecionadoResumo.modelo ||
                      skuSelecionadoResumo.sku}
                  </div>

                  <div className="mt-1 text-[10px] font-semibold text-slate-500">
                    {skuSelecionadoResumo.sku} ·{" "}
                    {skuSelecionadoResumo.grade ||
                      "Sem grade"}{" "}
                    ·{" "}
                    {formatarNumero(
                      skuSelecionadoResumo.aparelhos
                    )}{" "}
                    aparelhos
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    abrirInteligenciaSku(
                      skuSelecionadoResumo
                    )
                  }
                  className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800"
                >
                  Inteligência comercial

                  <ArrowRight
                    size={15}
                  />
                </button>
              </div>
            )}
          </div>
        </section>


        {/* ===================================================
            TABELA DE APARELHOS
        =================================================== */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={
              Smartphone
            }
            title="Composição física"
            description={
              loadingDetalhes
                ? "Consultando estoque..."
                : `${formatarNumero(
                    detalhes.total
                  )} aparelhos encontrados nos filtros atuais.`
            }
            action={
              (
                buscaAplicada ||
                grade ||
                skuSelecionado
              ) && (
                <span className="inline-flex w-fit rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-violet-700">
                  Filtros ativos
                </span>
              )
            }
          />

          {loadingDetalhes ? (
            <div className="flex min-h-[380px] items-center justify-center">
              <div className="text-center">
                <Loader2
                  size={28}
                  className="mx-auto animate-spin text-slate-400"
                />

                <p className="mt-3 text-xs font-semibold text-slate-500">
                  Consultando estoque físico...
                </p>
              </div>
            </div>
          ) : detalhes.itens.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1300px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50">
                      <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        IMEI
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Produto
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Grade
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Aging
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Entrada
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Subinventário
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        WMS
                      </th>

                      <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Voucher
                      </th>

                      <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                        Ação
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {detalhes.itens.map(
                      (
                        item,
                        index
                      ) => (
                        <tr
                          key={`${item.imei}-${index}`}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                abrirInteligenciaImei(
                                  item
                                )
                              }
                              className="font-mono text-xs font-black text-slate-800 transition hover:text-violet-800 hover:underline"
                            >
                              {item.imei ||
                                "—"}
                            </button>
                          </td>

                          <td className="px-4 py-4">
                            <div className="max-w-[390px]">
                              <div className="truncate text-xs font-black text-slate-800">
                                {item.modelo ||
                                  item.descricao ||
                                  "Produto sem descrição"}
                              </div>

                              <div className="mt-1 text-[10px] font-medium text-slate-400">
                                {item.sku ||
                                  "SKU não informado"}

                                {item.capacidade
                                  ? ` · ${item.capacidade}`
                                  : ""}

                                {item.cor
                                  ? ` · ${item.cor}`
                                  : ""}
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={[
                                "inline-flex rounded-lg border px-2 py-1 text-[10px] font-black",
                                badgeGrade(
                                  item.grade
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {item.grade ||
                                "SEM GRADE"}
                            </span>
                          </td>

                          <td className="px-4 py-4">
                            <div
                              className={[
                                "text-xs font-black",
                                classeAging(
                                  item.dias_estoque
                                ),
                              ].join(
                                " "
                              )}
                            >
                              {formatarNumero(
                                item.dias_estoque
                              )}{" "}
                              dias
                            </div>

                            <div className="mt-1 text-[9px] font-medium text-slate-400">
                              {item.faixa_aging ||
                                faixa}
                            </div>
                          </td>

                          <td className="px-4 py-4 text-xs font-semibold text-slate-600">
                            {formatarData(
                              item.data_subinv
                            )}
                          </td>

                          <td className="px-4 py-4 text-xs font-bold text-slate-700">
                            {item.local_subinv ||
                              "—"}
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                              <MapPin
                                size={13}
                                className="shrink-0 text-slate-400"
                              />

                              {construirEndereco(
                                item
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <div className="max-w-[170px] truncate text-[10px] font-medium text-slate-500">
                              {item.voucher ||
                                "—"}
                            </div>
                          </td>

                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                abrirInteligenciaImei(
                                  item
                                )
                              }
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-800"
                            >
                              Analisar

                              <ArrowRight
                                size={13}
                              />
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>


              {/* =============================================
                  PAGINAÇÃO
              ============================================= */}

              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[10px] font-medium text-slate-500">
                  Página{" "}
                  <strong className="text-slate-800">
                    {detalhes.pagina}
                  </strong>{" "}
                  de{" "}
                  <strong className="text-slate-800">
                    {detalhes.totalPaginas}
                  </strong>{" "}
                  ·{" "}
                  {formatarNumero(
                    detalhes.total
                  )}{" "}
                  aparelhos
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={
                      pagina <=
                      1
                    }
                    onClick={() =>
                      setPagina(
                        (
                          atual
                        ) =>
                          Math.max(
                            1,
                            atual -
                              1
                          )
                      )
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft
                      size={14}
                    />

                    Anterior
                  </button>

                  <button
                    type="button"
                    disabled={
                      pagina >=
                      detalhes.totalPaginas
                    }
                    onClick={() =>
                      setPagina(
                        (
                          atual
                        ) =>
                          Math.min(
                            detalhes.totalPaginas,
                            atual +
                              1
                          )
                      )
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Próxima

                    <ChevronRight
                      size={14}
                    />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              <EmptyState
                titulo="Nenhum aparelho encontrado"
                descricao="Remova algum filtro ou selecione outra faixa de aging."
              />
            </div>
          )}
        </section>


        {/* ===================================================
            METODOLOGIA
        =================================================== */}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Boxes
                size={15}
              />
            </div>

            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                Critério da análise
              </div>

              <p className="mt-1 max-w-6xl text-[10px] leading-5 text-slate-500">
                O aging representa a diferença entre a posição atual e a
                data de entrada disponível no subinventário. Os volumes
                representam registros físicos atuais e não projeções.
                A partir do SKU ou de um IMEI, a investigação segue para a
                Inteligência Comercial, onde serão analisados histórico de
                preços realizados, saída, giro, cobertura, liquidez e
                recomendação de preço.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}