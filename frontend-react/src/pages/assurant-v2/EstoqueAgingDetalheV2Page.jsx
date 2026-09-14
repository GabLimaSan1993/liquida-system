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
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
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
   HELPERS
========================================================= */

function formatarNumero(
  valor
) {
  return new Intl.NumberFormat(
    "pt-BR"
  ).format(
    Number(
      valor || 0
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
    texto || ""
  )
    .trim()
    .toUpperCase();
}


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
      dias || 0
    );

  if (
    valor >
    180
  ) {
    return "text-rose-600";
  }

  if (
    valor >
    90
  ) {
    return "text-orange-600";
  }

  if (
    valor >
    60
  ) {
    return "text-amber-600";
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
    item?.rua != null
  ) {
    partes.push(
      `R${item.rua}`
    );
  }

  if (
    item?.bloco != null
  ) {
    partes.push(
      `B${item.bloco}`
    );
  }

  if (
    item?.andar != null
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
        item?.linha || ""
      ).padStart(
        2,
        "0"
      )}`
    );
  }

  return (
    partes.join(
      " · "
    ) || "—"
  );
}


/* =========================================================
   COMPONENTES VISUAIS
========================================================= */

function CardResumo({
  icon: Icon,
  titulo,
  valor,
  descricao,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
            {titulo}
          </p>

          <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">
            {valor}
          </p>

          {descricao && (
            <p className="mt-2 text-xs leading-5 text-slate-500">
              {descricao}
            </p>
          )}
        </div>

        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
          <Icon
            size={19}
            strokeWidth={1.8}
          />
        </div>
      </div>
    </div>
  );
}


function EmptyState({
  titulo,
  descricao,
}) {
  return (
    <div className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-8 text-center">
      <PackageSearch
        size={34}
        className="text-slate-300"
      />

      <h3 className="mt-4 text-base font-semibold text-slate-700">
        {titulo}
      </h3>

      <p className="mt-2 max-w-md text-sm leading-6 text-slate-500">
        {descricao}
      </p>
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
    useState(true);

  const [
    loadingDetalhes,
    setLoadingDetalhes,
  ] =
    useState(true);

  const [
    erro,
    setErro,
  ] =
    useState("");

  const [
    buscaDigitada,
    setBuscaDigitada,
  ] =
    useState("");

  const [
    buscaAplicada,
    setBuscaAplicada,
  ] =
    useState("");

  const [
    grade,
    setGrade,
  ] =
    useState("");

  const [
    skuSelecionado,
    setSkuSelecionado,
  ] =
    useState("");

  const [
    pagina,
    setPagina,
  ] =
    useState(1);


  /* =========================================================
     CARREGA RESUMO DOS SKUs
  ========================================================= */

  useEffect(
    () => {
      let ativo = true;

      async function carregarResumo() {
        try {
          setLoadingResumo(
            true
          );

          setErro("");

          const data =
            await fetchEstoqueAgingResumoSku({
              faixa,
              limite:
                null,
            });

          if (!ativo) {
            return;
          }

          setResumoSkus(
            data || []
          );
        } catch (error) {
          if (!ativo) {
            return;
          }

          setErro(
            error?.message ||
              "Não foi possível carregar o resumo de estoque."
          );
        } finally {
          if (ativo) {
            setLoadingResumo(
              false
            );
          }
        }
      }

      carregarResumo();

      return () => {
        ativo = false;
      };
    },
    [
      faixa,
    ]
  );


  /* =========================================================
     CARREGA APARELHOS
  ========================================================= */

  useEffect(
    () => {
      let ativo = true;

      async function carregarDetalhes() {
        try {
          setLoadingDetalhes(
            true
          );

          setErro("");

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

          if (!ativo) {
            return;
          }

          setDetalhes(
            data
          );
        } catch (error) {
          if (!ativo) {
            return;
          }

          setErro(
            error?.message ||
              "Não foi possível carregar os aparelhos."
          );
        } finally {
          if (ativo) {
            setLoadingDetalhes(
              false
            );
          }
        }
      }

      carregarDetalhes();

      return () => {
        ativo = false;
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
     DADOS DERIVADOS
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


  const resumoFiltrado =
    useMemo(
      () => {
        if (!grade) {
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


  const rankingGrafico =
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
          )
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
        resumoFiltrado,
      ]
    );


  const skuSelecionadoResumo =
    useMemo(
      () =>
        resumoSkus.find(
          (
            item
          ) =>
            item.sku ===
            skuSelecionado
        ) || null,
      [
        resumoSkus,
        skuSelecionado,
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

    if (!sku) {
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


  function abrirInteligenciaImei(
    item
  ) {
    if (
      !item?.imei
    ) {
      return;
    }

    navigate(
      `/v2/assurant/indicadores/estoque/imei/${encodeURIComponent(
        item.imei
      )}`
    );
  }


  /* =========================================================
     RENDER
  ========================================================= */

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1700px] px-5 py-6 lg:px-8">
        {/* =====================================================
            CABEÇALHO
        ===================================================== */}

        <div className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <button
              type="button"
              onClick={() =>
                navigate(
                  "/v2/assurant/indicadores"
                )
              }
              className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-900"
            >
              <ArrowLeft
                size={16}
              />

              Voltar ao Cockpit
            </button>

            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
                <Clock3
                  size={21}
                />
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Stock Intelligence
                </p>

                <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950">
                  Aging de Estoque
                </h1>
              </div>
            </div>

            <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-500">
              Drill-down completo do estoque físico por faixa de aging,
              SKU, grade e aparelho. Selecione uma concentração para
              investigar os itens responsáveis e avançar para a
              inteligência comercial.
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">
              Faixa selecionada
            </p>

            <p className="mt-2 text-lg font-semibold text-slate-900">
              {faixa}
            </p>
          </div>
        </div>


        {/* =====================================================
            FAIXAS
        ===================================================== */}

        <div className="mb-6 overflow-x-auto">
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
                      "rounded-xl border px-4 py-2.5 text-sm font-medium transition",
                      ativo
                        ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:text-slate-950",
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


        {/* =====================================================
            ERRO
        ===================================================== */}

        {erro && (
          <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
            {erro}
          </div>
        )}


        {/* =====================================================
            RESUMO EXECUTIVO
        ===================================================== */}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CardResumo
            icon={
              Boxes
            }
            titulo="Aparelhos"
            valor={
              loadingResumo
                ? "—"
                : formatarNumero(
                    totalAparelhosResumo
                  )
            }
            descricao="Total físico identificado nesta faixa de aging."
          />

          <CardResumo
            icon={
              Layers3
            }
            titulo="SKUs / grades"
            valor={
              loadingResumo
                ? "—"
                : formatarNumero(
                    resumoSkus.length
                  )
            }
            descricao="Combinações de SKU e grade atualmente presentes."
          />

          <CardResumo
            icon={
              Clock3
            }
            titulo="Aging médio"
            valor={
              loadingResumo
                ? "—"
                : agingMedioFaixa == null
                  ? "—"
                  : `${formatarDecimal(
                      agingMedioFaixa,
                      1
                    )} dias`
            }
            descricao="Média ponderada pela quantidade física."
          />

          <CardResumo
            icon={
              TrendingDown
            }
            titulo="Concentração Top 10"
            valor={
              loadingResumo
                ? "—"
                : `${formatarDecimal(
                    totalAparelhosResumo
                      ? (
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
                                soma,
                                item
                              ) =>
                                soma +
                                Number(
                                  item.aparelhos ||
                                    0
                                ),
                              0
                            ) /
                          totalAparelhosResumo
                        ) *
                        100
                      : 0,
                    1
                  )}%`
            }
            descricao="Participação dos 10 maiores SKUs/grades da faixa."
          />
        </div>


        {/* =====================================================
            GRÁFICO + RANKING
        ===================================================== */}

        <div className="mt-6 grid gap-6 2xl:grid-cols-[1.5fr_1fr]">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart3
                    size={18}
                    className="text-slate-500"
                  />

                  <h2 className="text-base font-semibold text-slate-900">
                    Concentração de estoque
                  </h2>
                </div>

                <p className="mt-1 text-sm text-slate-500">
                  Maiores concentrações de aparelhos dentro da faixa selecionada.
                </p>
              </div>
            </div>

            {loadingResumo ? (
              <div className="flex h-[360px] items-center justify-center">
                <Loader2
                  size={26}
                  className="animate-spin text-slate-400"
                />
              </div>
            ) : rankingGrafico.length ? (
              <div className="h-[360px]">
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
                      top: 0,
                      right: 24,
                      left: 10,
                      bottom: 0,
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      horizontal={false}
                      stroke="#e2e8f0"
                    />

                    <XAxis
                      type="number"
                      tick={{
                        fontSize: 11,
                        fill: "#64748b",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <YAxis
                      type="category"
                      dataKey="sku"
                      width={115}
                      tick={{
                        fontSize: 10,
                        fill: "#64748b",
                      }}
                      axisLine={false}
                      tickLine={false}
                    />

                    <Tooltip
                      cursor={{
                        fill: "#f8fafc",
                      }}
                      formatter={(
                        value
                      ) => [
                        formatarNumero(
                          value
                        ),
                        "Aparelhos",
                      ]}
                    />

                    <Bar
                      dataKey="aparelhos"
                      fill="#0f172a"
                      radius={[
                        0,
                        6,
                        6,
                        0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <EmptyState
                titulo="Nenhum SKU encontrado"
                descricao="Não há itens disponíveis nesta faixa para os filtros atuais."
              />
            )}
          </section>


          <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-900">
                SKUs com maior concentração
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Clique em um SKU para filtrar os aparelhos.
              </p>
            </div>

            <div className="max-h-[405px] overflow-y-auto">
              {loadingResumo ? (
                <div className="flex min-h-[260px] items-center justify-center">
                  <Loader2
                    size={24}
                    className="animate-spin text-slate-400"
                  />
                </div>
              ) : resumoFiltrado.length ? (
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
                  )
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
                        <button
                          key={`${item.sku}-${item.grade}-${index}`}
                          type="button"
                          onClick={() =>
                            selecionarSku(
                              item.sku
                            )
                          }
                          className={[
                            "flex w-full items-center justify-between gap-4 border-b border-slate-100 px-5 py-3.5 text-left transition last:border-b-0",
                            ativo
                              ? "bg-slate-900 text-white"
                              : "bg-white hover:bg-slate-50",
                          ].join(
                            " "
                          )}
                        >
                          <div className="min-w-0">
                            <p
                              className={[
                                "truncate text-sm font-semibold",
                                ativo
                                  ? "text-white"
                                  : "text-slate-800",
                              ].join(
                                " "
                              )}
                            >
                              {item.modelo ||
                                item.sku}
                            </p>

                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <span
                                className={[
                                  "text-xs",
                                  ativo
                                    ? "text-slate-300"
                                    : "text-slate-400",
                                ].join(
                                  " "
                                )}
                              >
                                {item.sku}
                              </span>

                              {item.grade && (
                                <span
                                  className={[
                                    "rounded-md border px-1.5 py-0.5 text-[10px] font-semibold",
                                    ativo
                                      ? "border-white/20 bg-white/10 text-white"
                                      : badgeGrade(
                                          item.grade
                                        ),
                                  ].join(
                                    " "
                                  )}
                                >
                                  {item.grade}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="shrink-0 text-right">
                            <p
                              className={[
                                "text-sm font-semibold",
                                ativo
                                  ? "text-white"
                                  : "text-slate-900",
                              ].join(
                                " "
                              )}
                            >
                              {formatarNumero(
                                item.aparelhos
                              )}
                            </p>

                            <p
                              className={[
                                "mt-0.5 text-[11px]",
                                ativo
                                  ? "text-slate-300"
                                  : "text-slate-400",
                              ].join(
                                " "
                              )}
                            >
                              {formatarDecimal(
                                item.aging_medio_dias,
                                0
                              )}{" "}
                              dias
                            </p>
                          </div>
                        </button>
                      );
                    }
                  )
              ) : (
                <div className="p-5">
                  <EmptyState
                    titulo="Sem concentração"
                    descricao="Nenhum SKU foi encontrado para esta combinação de filtros."
                  />
                </div>
              )}
            </div>
          </section>
        </div>


        {/* =====================================================
            FILTROS
        ===================================================== */}

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Filter
              size={17}
              className="text-slate-500"
            />

            <h2 className="text-sm font-semibold text-slate-800">
              Filtros do estoque
            </h2>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1.7fr_0.8fr_auto]">
            <form
              onSubmit={
                aplicarBusca
              }
              className="relative"
            >
              <Search
                size={17}
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
                placeholder="Buscar por IMEI, SKU, modelo, marca, voucher ou subinventário..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-slate-400"
              />
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-slate-400"
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
              className="h-11 rounded-xl border border-slate-200 bg-white px-4 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
            >
              Limpar filtros
            </button>
          </div>

          {skuSelecionadoResumo && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">
                  SKU selecionado
                </p>

                <p className="mt-1 text-sm font-semibold text-slate-800">
                  {skuSelecionadoResumo.modelo ||
                    skuSelecionadoResumo.sku}
                </p>

                <p className="mt-0.5 text-xs text-slate-500">
                  {skuSelecionadoResumo.sku} ·{" "}
                  {skuSelecionadoResumo.grade ||
                    "Sem grade"}{" "}
                  ·{" "}
                  {formatarNumero(
                    skuSelecionadoResumo.aparelhos
                  )}{" "}
                  aparelhos
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  abrirInteligenciaSku(
                    skuSelecionadoResumo
                  )
                }
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
              >
                Inteligência comercial

                <ArrowRight
                  size={16}
                />
              </button>
            </div>
          )}
        </section>


        {/* =====================================================
            TABELA DE APARELHOS
        ===================================================== */}

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <Smartphone
                  size={17}
                  className="text-slate-500"
                />

                <h2 className="text-base font-semibold text-slate-900">
                  Aparelhos
                </h2>
              </div>

              <p className="mt-1 text-sm text-slate-500">
                {loadingDetalhes
                  ? "Carregando estoque..."
                  : `${formatarNumero(
                      detalhes.total
                    )} aparelhos encontrados`}
              </p>
            </div>

            {(buscaAplicada ||
              grade ||
              skuSelecionado) && (
              <span className="inline-flex w-fit rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-500">
                Filtros ativos
              </span>
            )}
          </div>

          {loadingDetalhes ? (
            <div className="flex min-h-[360px] items-center justify-center">
              <div className="text-center">
                <Loader2
                  size={28}
                  className="mx-auto animate-spin text-slate-400"
                />

                <p className="mt-3 text-sm text-slate-500">
                  Consultando estoque físico...
                </p>
              </div>
            </div>
          ) : detalhes.itens.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-[1250px] w-full">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/80">
                      <th className="px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        IMEI
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Produto
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Grade
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Aging
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Entrada estoque
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Subinventário
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        WMS
                      </th>

                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Voucher
                      </th>

                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-400">
                        Ação
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {detalhes.itens.map(
                      (
                        item,
                        index
                      ) => (
                        <tr
                          key={`${item.imei}-${index}`}
                          className="border-b border-slate-100 transition last:border-b-0 hover:bg-slate-50/70"
                        >
                          <td className="px-5 py-4">
                            <button
                              type="button"
                              onClick={() =>
                                abrirInteligenciaImei(
                                  item
                                )
                              }
                              className="font-mono text-xs font-semibold text-slate-800 hover:text-slate-950 hover:underline"
                            >
                              {item.imei ||
                                "—"}
                            </button>
                          </td>

                          <td className="px-4 py-4">
                            <div className="max-w-[360px]">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {item.modelo ||
                                  item.descricao ||
                                  "Produto sem descrição"}
                              </p>

                              <p className="mt-1 text-xs text-slate-400">
                                {item.sku ||
                                  "SKU não informado"}

                                {item.capacidade
                                  ? ` · ${item.capacidade}`
                                  : ""}

                                {item.cor
                                  ? ` · ${item.cor}`
                                  : ""}
                              </p>
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <span
                              className={[
                                "inline-flex rounded-lg border px-2 py-1 text-[11px] font-semibold",
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
                            <p
                              className={[
                                "text-sm font-semibold",
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
                            </p>

                            <p className="mt-1 text-[11px] text-slate-400">
                              {item.faixa_aging}
                            </p>
                          </td>

                          <td className="px-4 py-4 text-sm text-slate-600">
                            {formatarData(
                              item.data_subinv
                            )}
                          </td>

                          <td className="px-4 py-4">
                            <p className="text-sm font-medium text-slate-700">
                              {item.local_subinv ||
                                "—"}
                            </p>
                          </td>

                          <td className="px-4 py-4">
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <MapPin
                                size={14}
                                className="text-slate-400"
                              />

                              {construirEndereco(
                                item
                              )}
                            </div>
                          </td>

                          <td className="px-4 py-4">
                            <p className="max-w-[160px] truncate text-xs text-slate-500">
                              {item.voucher ||
                                "—"}
                            </p>
                          </td>

                          <td className="px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                abrirInteligenciaImei(
                                  item
                                )
                              }
                              className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
                            >
                              Analisar

                              <ArrowRight
                                size={14}
                              />
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>
              </div>


              {/* =================================================
                  PAGINAÇÃO
              ================================================= */}

              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs text-slate-500">
                  Página{" "}
                  <span className="font-semibold text-slate-700">
                    {detalhes.pagina}
                  </span>{" "}
                  de{" "}
                  <span className="font-semibold text-slate-700">
                    {detalhes.totalPaginas}
                  </span>
                </p>

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
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft
                      size={15}
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
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Próxima

                    <ChevronRight
                      size={15}
                    />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-6">
              <EmptyState
                titulo="Nenhum aparelho encontrado"
                descricao="Tente remover algum filtro ou selecionar outra faixa de aging."
              />
            </div>
          )}
        </section>


        {/* =====================================================
            RODAPÉ ANALÍTICO
        ===================================================== */}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
              <Boxes
                size={16}
              />
            </div>

            <div>
              <p className="text-sm font-semibold text-slate-800">
                Leitura do estoque
              </p>

              <p className="mt-1 text-xs leading-5 text-slate-500">
                O aging considera a data de entrada disponível no
                subinventário atual. As quantidades apresentadas são
                registros físicos atuais, não projeções. A inteligência
                de preço será construída a partir do histórico real de
                faturamento e das vendas posteriores registradas pelo
                sistema.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}