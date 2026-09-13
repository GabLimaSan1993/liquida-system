import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CheckCircle2,
  Clock3,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import {
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
  fetchIndicadoresExecutivos,
} from "../../services/assurantIndicadoresService.js";


/* =========================================================
   FORMATADORES
========================================================= */

function fmtNumero(
  value,
  casas = 0
) {
  if (
    value == null ||
    Number.isNaN(
      Number(value)
    )
  ) {
    return "—";
  }

  return Number(
    value
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

function fmtPercentual(
  value,
  casas = 1
) {
  if (
    value == null ||
    Number.isNaN(
      Number(value)
    )
  ) {
    return "—";
  }

  return `${fmtNumero(
    value,
    casas
  )}%`;
}

function fmtPP(
  value
) {
  if (
    value == null ||
    Number.isNaN(
      Number(value)
    )
  ) {
    return "—";
  }

  const numero =
    Number(value);

  return `${
    numero > 0
      ? "+"
      : ""
  }${fmtNumero(
    numero,
    1
  )} p.p.`;
}

function fmtVariacao(
  value
) {
  if (
    value == null ||
    Number.isNaN(
      Number(value)
    )
  ) {
    return "—";
  }

  const numero =
    Number(value);

  return `${
    numero > 0
      ? "+"
      : ""
  }${fmtNumero(
    numero,
    1
  )}%`;
}

function fmtDuracao(
  minutos
) {
  if (
    minutos == null ||
    Number.isNaN(
      Number(minutos)
    )
  ) {
    return "—";
  }

  const total =
    Math.max(
      0,
      Math.round(
        Number(minutos)
      )
    );

  if (total < 60) {
    return `${total} min`;
  }

  const horas =
    Math.floor(
      total / 60
    );

  const resto =
    total % 60;

  if (horas < 24) {
    return resto
      ? `${horas}h ${resto}m`
      : `${horas}h`;
  }

  const dias =
    Math.floor(
      horas / 24
    );

  const horasRestantes =
    horas % 24;

  return horasRestantes
    ? `${dias}d ${horasRestantes}h`
    : `${dias}d`;
}

function fmtSemana(
  value
) {
  if (!value) {
    return "—";
  }

  const [
    ano,
    mes,
    dia,
  ] =
    String(value)
      .slice(0, 10)
      .split("-");

  if (
    !ano ||
    !mes ||
    !dia
  ) {
    return value;
  }

  return `${dia}/${mes}`;
}

function fmtMes(
  value
) {
  if (!value) {
    return "—";
  }

  const [
    ano,
    mes,
  ] =
    String(value)
      .slice(0, 10)
      .split("-");

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
      Number(mes)
    ] || mes
  }/${String(
    ano
  ).slice(-2)}`;
}


/* =========================================================
   COMPONENTES VISUAIS
========================================================= */

function VariacaoBadge({
  value,
  inverso = false,
  sufixo = "%",
}) {
  if (
    value == null ||
    Number.isNaN(
      Number(value)
    )
  ) {
    return (
      <span className="text-[11px] font-semibold text-slate-400">
        Sem comparativo
      </span>
    );
  }

  const numero =
    Number(value);

  const positivo =
    numero > 0;

  const bom =
    inverso
      ? numero < 0
      : numero > 0;

  const neutro =
    numero === 0;

  const Icon =
    positivo
      ? ArrowUpRight
      : numero < 0
      ? ArrowDownRight
      : Activity;

  return (
    <span
      className={`
        inline-flex items-center gap-1 rounded-full
        px-2 py-1 text-[10px] font-black
        ${
          neutro
            ? "bg-slate-100 text-slate-500"
            : bom
            ? "bg-emerald-50 text-emerald-700"
            : "bg-rose-50 text-rose-700"
        }
      `}
    >
      <Icon className="h-3 w-3" />

      {numero > 0
        ? "+"
        : ""}

      {fmtNumero(
        numero,
        1
      )}

      {sufixo}
    </span>
  );
}

function KpiCard({
  title,
  value,
  subtitle,
  variation,
  icon: Icon,
  inverso = false,
  accent = "violet",
}) {
  const accents = {
    violet: {
      icon:
        "bg-violet-50 text-violet-700",
      line:
        "bg-violet-500",
    },

    blue: {
      icon:
        "bg-blue-50 text-blue-700",
      line:
        "bg-blue-500",
    },

    emerald: {
      icon:
        "bg-emerald-50 text-emerald-700",
      line:
        "bg-emerald-500",
    },

    amber: {
      icon:
        "bg-amber-50 text-amber-700",
      line:
        "bg-amber-500",
    },

    rose: {
      icon:
        "bg-rose-50 text-rose-700",
      line:
        "bg-rose-500",
    },

    slate: {
      icon:
        "bg-slate-100 text-slate-700",
      line:
        "bg-slate-500",
    },
  };

  const cfg =
    accents[accent] ||
    accents.violet;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`absolute bottom-0 left-0 h-[3px] w-full ${cfg.line}`}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-400">
            {title}
          </div>

          <div className="mt-2 text-[27px] font-black tracking-tight text-slate-900">
            {value}
          </div>

          <div className="mt-1 text-[11px] font-medium text-slate-400">
            {subtitle}
          </div>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.icon}`}
        >
          <Icon className="h-[19px] w-[19px]" />
        </div>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-3">
        <VariacaoBadge
          value={
            variation
          }
          inverso={
            inverso
          }
        />

        <span className="ml-2 text-[10px] text-slate-400">
          vs. período anterior
        </span>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  action,
  className = "",
}) {
  return (
    <section
      className={`
        overflow-hidden rounded-2xl
        border border-slate-200
        bg-white shadow-sm
        ${className}
      `}
    >
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-black text-slate-800">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-1 text-[11px] leading-4 text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function CanalButton({
  active,
  onClick,
  label,
  icon: Icon,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`
        inline-flex h-9 items-center gap-2
        rounded-xl px-3.5
        text-xs font-bold transition
        ${
          active
            ? "bg-[#211136] text-white shadow-sm"
            : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        }
      `}
    >
      <Icon className="h-4 w-4" />

      {label}
    </button>
  );
}

function PeriodButton({
  active,
  onClick,
  children,
}) {
  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className={`
        rounded-lg px-3 py-1.5
        text-[11px] font-black transition
        ${
          active
            ? "bg-white text-[#211136] shadow-sm"
            : "text-slate-500 hover:text-slate-800"
        }
      `}
    >
      {children}
    </button>
  );
}


/* =========================================================
   TOOLTIP DO GRÁFICO
========================================================= */

function CustomTooltip({
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
      <div className="mb-2 text-[11px] font-black text-slate-700">
        Semana de{" "}
        {label}
      </div>

      <div className="space-y-1.5">
        {payload.map(
          (item) => (
            <div
              key={
                item.dataKey
              }
              className="flex min-w-[170px] items-center justify-between gap-5 text-[11px]"
            >
              <span className="font-semibold text-slate-500">
                {
                  item.name
                }
              </span>

              <span className="font-black text-slate-800">
                {fmtDuracao(
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
   ETAPA
========================================================= */

function EtapaCard({
  etapa,
}) {
  const variacao =
    Number(
      etapa
        ?.variacao_mediana_pct
    );

  const melhorou =
    Number.isFinite(
      variacao
    )
      ? variacao < 0
      : null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-black text-slate-700">
            {
              etapa.etapa
            }
          </div>

          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {fmtDuracao(
              etapa.mediana_min
            )}
          </div>

          <div className="mt-1 text-[10px] text-slate-400">
            Mediana
          </div>
        </div>

        <div
          className={`
            flex h-9 w-9 shrink-0 items-center justify-center rounded-xl
            ${
              melhorou === true
                ? "bg-emerald-50 text-emerald-700"
                : melhorou === false
                ? "bg-rose-50 text-rose-700"
                : "bg-slate-100 text-slate-500"
            }
          `}
        >
          {melhorou ===
          true ? (
            <TrendingDown className="h-4 w-4" />
          ) : melhorou ===
            false ? (
            <TrendingUp className="h-4 w-4" />
          ) : (
            <Timer className="h-4 w-4" />
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            P90
          </div>

          <div className="mt-1 text-xs font-black text-slate-700">
            {fmtDuracao(
              etapa.p90_min
            )}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
            Amostra
          </div>

          <div className="mt-1 text-xs font-black text-slate-700">
            {fmtNumero(
              etapa.amostra
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[10px] text-slate-400">
          vs. semana anterior
        </span>

        <VariacaoBadge
          value={
            etapa
              .variacao_mediana_pct
          }
          inverso
        />
      </div>
    </div>
  );
}


/* =========================================================
   PÁGINA
========================================================= */

export default function IndicadoresExecutivosV2Page() {
  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    dados,
    setDados,
  ] =
    useState({
      comparativoAtual: [],
      kpisSemanais: [],
      kpisMensais: [],
      etapasSemanais: [],
      etapasMensais: [],
    });

  const [
    granularidade,
    setGranularidade,
  ] =
    useState("MTD");

  const [
    canal,
    setCanal,
  ] =
    useState("B2C");

  const [
    visualizacaoEtapa,
    setVisualizacaoEtapa,
  ] =
    useState("semanal");


  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  async function carregar() {
    try {
      setLoading(
        true
      );

      setError("");

      const resultado =
        await fetchIndicadoresExecutivos();

      setDados(
        resultado
      );
    } catch (
      err
    ) {
      console.error(
        err
      );

      setError(
        err?.message ||
          "Não foi possível carregar os indicadores."
      );
    } finally {
      setLoading(
        false
      );
    }
  }

  useEffect(() => {
    carregar();
  }, []);


  /* =======================================================
     COMPARATIVO MTD / WTD
  ======================================================= */

  const comparativos =
    useMemo(() => {
      return (
        dados
          .comparativoAtual ||
        []
      ).filter(
        (item) =>
          item.granularidade ===
          granularidade
      );
    }, [
      dados,
      granularidade,
    ]);

  const atualB2C =
    useMemo(
      () =>
        comparativos.find(
          (item) =>
            item.canal ===
            "B2C"
        ) || null,
      [comparativos]
    );

  const atualB2B =
    useMemo(
      () =>
        comparativos.find(
          (item) =>
            item.canal ===
            "B2B"
        ) || null,
      [comparativos]
    );

  const atual =
    canal === "B2C"
      ? atualB2C
      : atualB2B;


  /* =======================================================
     ETAPAS
  ======================================================= */

  const etapasFonte =
    visualizacaoEtapa ===
    "semanal"
      ? dados.etapasSemanais
      : dados.etapasMensais;

  const periodoMaisRecente =
    useMemo(() => {
      const filtradas =
        (
          etapasFonte ||
          []
        ).filter(
          (item) =>
            item.canal ===
            canal
        );

      if (
        !filtradas.length
      ) {
        return null;
      }

      return filtradas
        .map(
          (item) =>
            item.periodo_inicio
        )
        .sort()
        .reverse()[0];
    }, [
      etapasFonte,
      canal,
    ]);

  const etapasAtuais =
    useMemo(() => {
      if (
        !periodoMaisRecente
      ) {
        return [];
      }

      return (
        etapasFonte ||
        []
      ).filter(
        (item) =>
          item.canal ===
            canal &&
          item.periodo_inicio ===
            periodoMaisRecente
      );
    }, [
      etapasFonte,
      canal,
      periodoMaisRecente,
    ]);


  /* =======================================================
     EVOLUÇÃO SEMANAL
  ======================================================= */

  const evolucaoSemanal =
    useMemo(() => {
      const mapa =
        new Map();

      (
        dados.kpisSemanais ||
        []
      ).forEach(
        (item) => {
          const chave =
            item.periodo_inicio;

          if (
            !mapa.has(
              chave
            )
          ) {
            mapa.set(
              chave,
              {
                periodo_inicio:
                  chave,
                semana:
                  fmtSemana(
                    chave
                  ),
                B2C: null,
                B2B: null,
              }
            );
          }

          const registro =
            mapa.get(
              chave
            );

          registro[
            item.canal
          ] =
            item.mediana_leadtime_min !=
            null
              ? Number(
                  item.mediana_leadtime_min
                )
              : null;
        }
      );

      return Array.from(
        mapa.values()
      )
        .sort(
          (
            a,
            b
          ) =>
            String(
              a.periodo_inicio
            ).localeCompare(
              String(
                b.periodo_inicio
              )
            )
        )
        .slice(-8);
    }, [
      dados.kpisSemanais,
    ]);


  /* =======================================================
     EVOLUÇÃO MENSAL
  ======================================================= */

  const evolucaoMensal =
    useMemo(() => {
      const mapa =
        new Map();

      (
        dados.kpisMensais ||
        []
      ).forEach(
        (item) => {
          const chave =
            item.periodo_inicio;

          if (
            !mapa.has(
              chave
            )
          ) {
            mapa.set(
              chave,
              {
                periodo_inicio:
                  chave,
                periodo:
                  fmtMes(
                    chave
                  ),
                B2C: null,
                B2B: null,
              }
            );
          }

          mapa.get(
            chave
          )[
            item.canal
          ] =
            item.mediana_leadtime_min !=
            null
              ? Number(
                  item.mediana_leadtime_min
                )
              : null;
        }
      );

      return Array.from(
        mapa.values()
      )
        .sort(
          (
            a,
            b
          ) =>
            String(
              a.periodo_inicio
            ).localeCompare(
              String(
                b.periodo_inicio
              )
            )
        )
        .slice(-8);
    }, [
      dados.kpisMensais,
    ]);


  /* =======================================================
     GARGALOS
  ======================================================= */

  const gargalos =
    useMemo(() => {
      return [
        ...(dados
          .etapasSemanais ||
          []),
      ]
        .filter(
          (item) =>
            item
              .variacao_mediana_pct !=
              null &&
            Number(
              item
                .variacao_mediana_pct
            ) > 0 &&
            Number(
              item.amostra ||
                0
            ) > 0
        )
        .sort(
          (
            a,
            b
          ) =>
            Number(
              b
                .variacao_mediana_pct
            ) -
            Number(
              a
                .variacao_mediana_pct
            )
        )
        .slice(
          0,
          5
        );
    }, [
      dados.etapasSemanais,
    ]);


  /* =======================================================
     LOADING
  ======================================================= */

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#4C1D95]" />

          <div className="mt-3 text-sm font-bold text-slate-700">
            Carregando indicadores...
          </div>

          <div className="mt-1 text-xs text-slate-400">
            Consolidando B2C, B2B e comparativos.
          </div>
        </div>
      </div>
    );
  }


  /* =======================================================
     ERRO
  ======================================================= */

  if (error) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 text-rose-600" />

          <div>
            <div className="text-sm font-black text-rose-800">
              Falha ao carregar indicadores
            </div>

            <div className="mt-1 text-xs text-rose-600">
              {error}
            </div>

            <button
              type="button"
              onClick={
                carregar
              }
              className="mt-4 rounded-xl bg-rose-700 px-4 py-2 text-xs font-bold text-white"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }


  return (
    <div className="space-y-5 pb-8">

      {/* ===================================================
          CABEÇALHO
      =================================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-5 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">

          <div>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#211136] text-white">
                <BarChart3 className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  Indicadores Executivos
                </h1>

                <p className="mt-0.5 text-xs text-slate-400">
                  Performance operacional • Assurant Warehouse
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">

            <div className="flex rounded-xl bg-slate-100 p-1">
              <PeriodButton
                active={
                  granularidade ===
                  "MTD"
                }
                onClick={() =>
                  setGranularidade(
                    "MTD"
                  )
                }
              >
                Mês atual
              </PeriodButton>

              <PeriodButton
                active={
                  granularidade ===
                  "WTD"
                }
                onClick={() =>
                  setGranularidade(
                    "WTD"
                  )
                }
              >
                Semana atual
              </PeriodButton>
            </div>

            <button
              type="button"
              onClick={
                carregar
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />

              Atualizar
            </button>
          </div>
        </div>
      </div>


      {/* ===================================================
          COMPARATIVO B2C x B2B
      =================================================== */}

      <div className="grid gap-4 xl:grid-cols-2">

        <div
          className={`
            rounded-2xl border p-5 shadow-sm
            ${
              canal ===
              "B2C"
                ? "border-violet-300 bg-violet-50/40"
                : "border-slate-200 bg-white"
            }
          `}
        >
          <button
            type="button"
            onClick={() =>
              setCanal(
                "B2C"
              )
            }
            className="w-full text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                  <ShoppingCart className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-sm font-black text-slate-800">
                    B2C
                  </div>

                  <div className="text-[10px] text-slate-400">
                    Marketplaces
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xl font-black text-slate-900">
                  {fmtNumero(
                    atualB2C
                      ?.pedidos_atual
                  )}
                </div>

                <div className="text-[10px] text-slate-400">
                  pedidos
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <div className="text-[9px] font-bold uppercase text-slate-400">
                  Itens
                </div>

                <div className="mt-1 text-sm font-black text-slate-700">
                  {fmtNumero(
                    atualB2C
                      ?.itens_atual
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <div className="text-[9px] font-bold uppercase text-slate-400">
                  Conclusão
                </div>

                <div className="mt-1 text-sm font-black text-slate-700">
                  {fmtPercentual(
                    atualB2C
                      ?.pct_concluidos_atual
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <div className="text-[9px] font-bold uppercase text-slate-400">
                  Lead time
                </div>

                <div className="mt-1 text-sm font-black text-slate-700">
                  {fmtDuracao(
                    atualB2C
                      ?.mediana_leadtime_atual_min
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>


        <div
          className={`
            rounded-2xl border p-5 shadow-sm
            ${
              canal ===
              "B2B"
                ? "border-violet-300 bg-violet-50/40"
                : "border-slate-200 bg-white"
            }
          `}
        >
          <button
            type="button"
            onClick={() =>
              setCanal(
                "B2B"
              )
            }
            className="w-full text-left"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                  <Boxes className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-sm font-black text-slate-800">
                    B2B
                  </div>

                  <div className="text-[10px] text-slate-400">
                    Pedidos corporativos
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-xl font-black text-slate-900">
                  {fmtNumero(
                    atualB2B
                      ?.pedidos_atual
                  )}
                </div>

                <div className="text-[10px] text-slate-400">
                  pedidos
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <div className="text-[9px] font-bold uppercase text-slate-400">
                  Itens
                </div>

                <div className="mt-1 text-sm font-black text-slate-700">
                  {fmtNumero(
                    atualB2B
                      ?.itens_atual
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <div className="text-[9px] font-bold uppercase text-slate-400">
                  Conclusão
                </div>

                <div className="mt-1 text-sm font-black text-slate-700">
                  {fmtPercentual(
                    atualB2B
                      ?.pct_concluidos_atual
                  )}
                </div>
              </div>

              <div className="rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100">
                <div className="text-[9px] font-bold uppercase text-slate-400">
                  Lead time
                </div>

                <div className="mt-1 text-sm font-black text-slate-700">
                  {fmtDuracao(
                    atualB2B
                      ?.mediana_leadtime_atual_min
                  )}
                </div>
              </div>
            </div>
          </button>
        </div>
      </div>


      {/* ===================================================
          KPIs DO CANAL SELECIONADO
      =================================================== */}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-800">
            Performance{" "}
            {canal}
          </div>

          <div className="mt-0.5 text-[11px] text-slate-400">
            Comparação com o mesmo período anterior
          </div>
        </div>

        <div className="flex gap-2">
          <CanalButton
            active={
              canal ===
              "B2C"
            }
            onClick={() =>
              setCanal(
                "B2C"
              )
            }
            label="B2C"
            icon={
              ShoppingCart
            }
          />

          <CanalButton
            active={
              canal ===
              "B2B"
            }
            onClick={() =>
              setCanal(
                "B2B"
              )
            }
            label="B2B"
            icon={
              Boxes
            }
          />
        </div>
      </div>


      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">

        <KpiCard
          title="Pedidos"
          value={fmtNumero(
            atual
              ?.pedidos_atual
          )}
          subtitle={`Anterior: ${fmtNumero(
            atual
              ?.pedidos_anterior
          )}`}
          variation={
            atual
              ?.variacao_pedidos_pct
          }
          icon={
            PackageCheck
          }
          accent="violet"
        />

        <KpiCard
          title="Itens"
          value={fmtNumero(
            atual
              ?.itens_atual
          )}
          subtitle={`Anterior: ${fmtNumero(
            atual
              ?.itens_anterior
          )}`}
          variation={
            atual
              ?.variacao_itens_pct
          }
          icon={
            Boxes
          }
          accent="blue"
        />

        <KpiCard
          title="Conclusão"
          value={fmtPercentual(
            atual
              ?.pct_concluidos_atual
          )}
          subtitle={`Anterior: ${fmtPercentual(
            atual
              ?.pct_concluidos_anterior
          )}`}
          variation={
            atual
              ?.variacao_conclusao_pp
          }
          icon={
            CheckCircle2
          }
          accent="emerald"
        />

        <KpiCard
          title="Lead time"
          value={fmtDuracao(
            atual
              ?.mediana_leadtime_atual_min
          )}
          subtitle="Mediana ponta a ponta"
          variation={
            atual
              ?.variacao_mediana_leadtime_pct
          }
          inverso
          icon={
            Clock3
          }
          accent="amber"
        />

        <KpiCard
          title="P90"
          value={fmtDuracao(
            atual
              ?.p90_leadtime_atual_min
          )}
          subtitle="90% da operação"
          variation={
            atual
              ?.p90_leadtime_anterior_min !=
              null &&
            atual
              ?.p90_leadtime_atual_min !=
              null &&
            Number(
              atual
                .p90_leadtime_anterior_min
            ) !== 0
              ? (
                  (Number(
                    atual
                      .p90_leadtime_atual_min
                  ) -
                    Number(
                      atual
                        .p90_leadtime_anterior_min
                    )) /
                  Number(
                    atual
                      .p90_leadtime_anterior_min
                  )
                ) *
                100
              : null
          }
          inverso
          icon={
            Target
          }
          accent="rose"
        />

        <KpiCard
          title="Cobertura"
          value={fmtNumero(
            atual
              ?.amostra_leadtime_atual
          )}
          subtitle="Pedidos com ciclo completo"
          variation={
            atual
              ?.amostra_leadtime_anterior !=
                null &&
            atual
              ?.amostra_leadtime_atual !=
                null &&
            Number(
              atual
                .amostra_leadtime_anterior
            ) !== 0
              ? (
                  (Number(
                    atual
                      .amostra_leadtime_atual
                  ) -
                    Number(
                      atual
                        .amostra_leadtime_anterior
                    )) /
                  Number(
                    atual
                      .amostra_leadtime_anterior
                  )
                ) *
                100
              : null
          }
          icon={
            Activity
          }
          accent="slate"
        />
      </div>


      {/* ===================================================
          EVOLUÇÃO
      =================================================== */}

      <div className="grid gap-5 2xl:grid-cols-2">

        <SectionCard
          title="Evolução semanal do lead time"
          subtitle="Mediana ponta a ponta • últimas 8 semanas"
        >
          <div className="h-[310px] p-4">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={
                  evolucaoSemanal
                }
                margin={{
                  top: 10,
                  right: 12,
                  left: 0,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#E2E8F0"
                  vertical={
                    false
                  }
                />

                <XAxis
                  dataKey="semana"
                  tick={{
                    fill:
                      "#94A3B8",
                    fontSize: 10,
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
                    fill:
                      "#94A3B8",
                    fontSize: 10,
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
                    value >=
                    60
                      ? `${fmtNumero(
                          value /
                            60,
                          0
                        )}h`
                      : `${fmtNumero(
                          value,
                          0
                        )}m`
                  }
                />

                <Tooltip
                  content={
                    <CustomTooltip />
                  }
                />

                <Legend
                  wrapperStyle={{
                    fontSize:
                      "11px",
                    paddingTop:
                      "10px",
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="B2C"
                  name="B2C"
                  stroke="#6D28D9"
                  strokeWidth={
                    2.5
                  }
                  dot={{
                    r: 3,
                  }}
                  activeDot={{
                    r: 5,
                  }}
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="B2B"
                  name="B2B"
                  stroke="#475569"
                  strokeWidth={
                    2.5
                  }
                  dot={{
                    r: 3,
                  }}
                  activeDot={{
                    r: 5,
                  }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>


        <SectionCard
          title="Evolução mensal do lead time"
          subtitle="Mediana ponta a ponta • histórico mensal"
        >
          <div className="h-[310px] p-4">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={
                  evolucaoMensal
                }
                margin={{
                  top: 10,
                  right: 12,
                  left: 0,
                  bottom: 0,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="#E2E8F0"
                  vertical={
                    false
                  }
                />

                <XAxis
                  dataKey="periodo"
                  tick={{
                    fill:
                      "#94A3B8",
                    fontSize: 10,
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
                    fill:
                      "#94A3B8",
                    fontSize: 10,
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
                    value >=
                    60
                      ? `${fmtNumero(
                          value /
                            60,
                          0
                        )}h`
                      : `${fmtNumero(
                          value,
                          0
                        )}m`
                  }
                />

                <Tooltip
                  content={
                    <CustomTooltip />
                  }
                />

                <Legend
                  wrapperStyle={{
                    fontSize:
                      "11px",
                    paddingTop:
                      "10px",
                  }}
                />

                <Line
                  type="monotone"
                  dataKey="B2C"
                  name="B2C"
                  stroke="#6D28D9"
                  strokeWidth={
                    2.5
                  }
                  dot={{
                    r: 3,
                  }}
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="B2B"
                  name="B2B"
                  stroke="#475569"
                  strokeWidth={
                    2.5
                  }
                  dot={{
                    r: 3,
                  }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>


      {/* ===================================================
          TEMPOS POR ETAPA
      =================================================== */}

      <SectionCard
        title={`Tempos por etapa — ${canal}`}
        subtitle={
          periodoMaisRecente
            ? `${
                visualizacaoEtapa ===
                "semanal"
                  ? "Semana"
                  : "Mês"
              } iniciado em ${fmtSemana(
                periodoMaisRecente
              )}`
            : "Sem dados disponíveis"
        }
        action={
          <div className="flex rounded-xl bg-slate-100 p-1">
            <PeriodButton
              active={
                visualizacaoEtapa ===
                "semanal"
              }
              onClick={() =>
                setVisualizacaoEtapa(
                  "semanal"
                )
              }
            >
              Semanal
            </PeriodButton>

            <PeriodButton
              active={
                visualizacaoEtapa ===
                "mensal"
              }
              onClick={() =>
                setVisualizacaoEtapa(
                  "mensal"
                )
              }
            >
              Mensal
            </PeriodButton>
          </div>
        }
      >
        <div className="p-5">
          {etapasAtuais.length >
          0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {etapasAtuais.map(
                (
                  etapa
                ) => (
                  <EtapaCard
                    key={`${etapa.canal}-${etapa.etapa}`}
                    etapa={
                      etapa
                    }
                  />
                )
              )}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-slate-400">
              Nenhum indicador de etapa disponível.
            </div>
          )}
        </div>

        {canal ===
          "B2C" && (
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

              <p className="text-[10px] leading-4 text-amber-700">
                A etapa
                {" "}
                <strong>
                  Embalagem → Faturamento
                </strong>
                {" "}
                ainda contempla o intervalo de etiquetagem, pois a base atual não possui carimbo de data/hora exclusivo para etiquetagem.
              </p>
            </div>
          </div>
        )}
      </SectionCard>


      {/* ===================================================
          TABELA DE ETAPAS
      =================================================== */}

      <SectionCard
        title="Detalhamento operacional"
        subtitle="Mediana, P90, amostra e variação contra o período anterior"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Etapa
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Mediana
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">
                  P90
                </th>

                <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Anterior
                </th>

                <th className="px-4 py-3 text-center text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Variação
                </th>

                <th className="px-5 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Amostra
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {etapasAtuais.map(
                (
                  etapa
                ) => (
                  <tr
                    key={`table-${etapa.canal}-${etapa.etapa}`}
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-3">
                      <div className="text-xs font-bold text-slate-700">
                        {
                          etapa.etapa
                        }
                      </div>
                    </td>

                    <td className="px-4 py-3 text-right text-xs font-black text-slate-800">
                      {fmtDuracao(
                        etapa.mediana_min
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtDuracao(
                        etapa.p90_min
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-xs text-slate-500">
                      {fmtDuracao(
                        etapa.mediana_anterior_min
                      )}
                    </td>

                    <td className="px-4 py-3 text-center">
                      <VariacaoBadge
                        value={
                          etapa
                            .variacao_mediana_pct
                        }
                        inverso
                      />
                    </td>

                    <td className="px-5 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtNumero(
                        etapa.amostra
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>


      {/* ===================================================
          GARGALOS
      =================================================== */}

      <SectionCard
        title="Principais gargalos da semana"
        subtitle="Etapas com maior deterioração de mediana contra a semana anterior"
      >
        {gargalos.length >
        0 ? (
          <div className="divide-y divide-slate-100">
            {gargalos.map(
              (
                item,
                index
              ) => (
                <div
                  key={`${item.canal}-${item.etapa}-${index}`}
                  className="flex flex-wrap items-center gap-4 px-5 py-4"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-sm font-black text-rose-700">
                    {index +
                      1}
                  </div>

                  <div className="min-w-[220px] flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-black text-slate-700">
                        {
                          item.etapa
                        }
                      </span>

                      <span
                        className={`
                          rounded-full px-2 py-0.5 text-[9px] font-black
                          ${
                            item.canal ===
                            "B2C"
                              ? "bg-violet-50 text-violet-700"
                              : "bg-slate-100 text-slate-600"
                          }
                        `}
                      >
                        {
                          item.canal
                        }
                      </span>
                    </div>

                    <div className="mt-1 text-[10px] text-slate-400">
                      Mediana atual{" "}
                      {fmtDuracao(
                        item.mediana_min
                      )}
                      {" • "}
                      semana anterior{" "}
                      {fmtDuracao(
                        item.mediana_anterior_min
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-black text-rose-700">
                      {fmtVariacao(
                        item.variacao_mediana_pct
                      )}
                    </div>

                    <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                      deterioração
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />

            Nenhuma deterioração relevante identificada.
          </div>
        )}
      </SectionCard>


      {/* ===================================================
          QUALIDADE DO DADO
      =================================================== */}

      <div className="grid gap-4 lg:grid-cols-3">

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
            </div>

            <div>
              <div className="text-xs font-black text-slate-700">
                Cobertura B2C
              </div>

              <div className="mt-0.5 text-[10px] text-slate-400">
                Ciclos completos no período
              </div>
            </div>
          </div>

          <div className="mt-4 text-2xl font-black text-slate-900">
            {fmtNumero(
              atualB2C
                ?.amostra_leadtime_atual
            )}
          </div>
        </div>


        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <Boxes className="h-4 w-4" />
            </div>

            <div>
              <div className="text-xs font-black text-slate-700">
                Cobertura B2B
              </div>

              <div className="mt-0.5 text-[10px] text-slate-400">
                Pedidos com ciclo completo
              </div>
            </div>
          </div>

          <div className="mt-4 text-2xl font-black text-slate-900">
            {fmtNumero(
              atualB2B
                ?.amostra_leadtime_atual
            )}
          </div>
        </div>


        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <AlertTriangle className="h-4 w-4" />
            </div>

            <div>
              <div className="text-xs font-black text-amber-800">
                Qualidade do dado
              </div>

              <div className="mt-0.5 text-[10px] text-amber-700/70">
                Pontos em evolução
              </div>
            </div>
          </div>

          <div className="mt-4 text-[11px] leading-5 text-amber-800">
            Etiquetagem B2C ainda não possui timestamp exclusivo. Indicadores não inventam tempos quando o carimbo não existe.
          </div>
        </div>
      </div>

    </div>
  );
}