import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Clock3,
  RefreshCw,
  Warehouse,
} from "lucide-react";

import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  LabelList,
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
} from "react-router-dom";

import {
  fetchIndicadoresExecutivos,
} from "../../services/assurantIndicadoresService.js";


/* =========================================================
   CONSTANTES
========================================================= */

const ORDEM_AGING = [
  "Até 30 dias",
  "31 a 60 dias",
  "61 a 90 dias",
  "91 a 180 dias",
  "Mais de 180 dias",
];

const FAIXAS_B2C = [
  "Até 12h",
  "12 a 24h",
  "24 a 48h",
  "Mais de 48h",
];


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
      Number(
        value
      )
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
      Number(
        value
      )
    )
  ) {
    return "—";
  }

  return `${fmtNumero(
    value,
    casas
  )}%`;
}


function fmtVariacao(
  value
) {
  if (
    value == null ||
    Number.isNaN(
      Number(
        value
      )
    )
  ) {
    return "—";
  }

  const numero =
    Number(
      value
    );

  return `${
    numero >
    0
      ? "+"
      : ""
  }${fmtNumero(
    numero,
    1
  )}%`;
}


function calcularVariacao(
  atual,
  anterior
) {
  const a =
    Number(
      atual
    );

  const b =
    Number(
      anterior
    );

  if (
    !Number.isFinite(
      a
    ) ||
    !Number.isFinite(
      b
    ) ||
    b ===
      0
  ) {
    return null;
  }

  return (
    (
      a -
      b
    ) /
    b
  ) *
    100;
}


function fmtDuracao(
  minutos
) {
  if (
    minutos == null ||
    Number.isNaN(
      Number(
        minutos
      )
    )
  ) {
    return "—";
  }

  const total =
    Math.max(
      0,
      Math.round(
        Number(
          minutos
        )
      )
    );

  if (
    total <
    60
  ) {
    return `${total} min`;
  }

  const horas =
    Math.floor(
      total /
        60
    );

  const minutosRestantes =
    total %
    60;

  if (
    horas <
    24
  ) {
    return minutosRestantes
      ? `${horas}h ${minutosRestantes}m`
      : `${horas}h`;
  }

  const dias =
    Math.floor(
      horas /
        24
    );

  const horasRestantes =
    horas %
    24;

  return horasRestantes
    ? `${dias}d ${horasRestantes}h`
    : `${dias}d`;
}


function fmtHoras(
  horas
) {
  if (
    horas == null ||
    Number.isNaN(
      Number(
        horas
      )
    )
  ) {
    return "—";
  }

  const valor =
    Number(
      horas
    );

  if (
    valor <
    1
  ) {
    return `${fmtNumero(
      valor *
        60,
      0
    )} min`;
  }

  return `${fmtNumero(
    valor,
    1
  )}h`;
}


function fmtDataCurta(
  value
) {
  if (
    !value
  ) {
    return "—";
  }

  const [
    ano,
    mes,
    dia,
  ] =
    String(
      value
    )
      .slice(
        0,
        10
      )
      .split(
        "-"
      );

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
  if (
    !value
  ) {
    return "—";
  }

  const [
    ano,
    mes,
  ] =
    String(
      value
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


function fmtMesLongo(
  value
) {
  if (
    !value
  ) {
    return "—";
  }

  const [
    ano,
    mes,
  ] =
    String(
      value
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
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ];

  return `${
    meses[
      Number(
        mes
      )
    ] ||
    mes
  }/${ano}`;
}


function normalizarTexto(
  value
) {
  return String(
    value ||
      ""
  )
    .normalize(
      "NFD"
    )
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toUpperCase();
}


function normalizarFaixaAging(
  value
) {
  const texto =
    String(
      value ||
        ""
    )
      .replace(
        /^\s*\d+\.\s*/,
        ""
      )
      .trim();

  const normalizado =
    normalizarTexto(
      texto
    );

  if (
    normalizado.includes(
      "ATE 30"
    )
  ) {
    return "Até 30 dias";
  }

  if (
    normalizado.includes(
      "31 A 60"
    )
  ) {
    return "31 a 60 dias";
  }

  if (
    normalizado.includes(
      "61 A 90"
    )
  ) {
    return "61 a 90 dias";
  }

  if (
    normalizado.includes(
      "91 A 180"
    )
  ) {
    return "91 a 180 dias";
  }

  if (
    normalizado.includes(
      "MAIS DE 180"
    ) ||
    normalizado.includes(
      "> 180"
    )
  ) {
    return "Mais de 180 dias";
  }

  return texto;
}


function chaveMesAtual() {
  const agora =
    new Date();

  return `${agora.getFullYear()}-${String(
    agora.getMonth() +
      1
  ).padStart(
    2,
    "0"
  )}-01`;
}


function rotuloComparacao(
  mesSelecionado
) {
  if (
    mesSelecionado !==
    chaveMesAtual()
  ) {
    return "vs mês anterior";
  }

  const hoje =
    new Date();

  const dia =
    String(
      hoje.getDate()
    ).padStart(
      2,
      "0"
    );

  return `01–${dia} vs mesmo período anterior`;
}


/* =========================================================
   COMPONENTES VISUAIS
========================================================= */

function Section({
  index,
  title,
  subtitle,
  action,
  children,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          {index && (
            <div className="mt-0.5 flex h-7 min-w-7 items-center justify-center rounded-lg bg-slate-950 px-2 text-[10px] font-black text-white">
              {index}
            </div>
          )}

          <div>
            <h2 className="text-sm font-black text-slate-900">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-1 max-w-5xl text-[10px] leading-4 text-slate-400">
                {subtitle}
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


function MetricStrip({
  items,
}) {
  return (
    <div
      className="grid border-b border-slate-100 bg-slate-50/40"
      style={{
        gridTemplateColumns:
          `repeat(${Math.max(
            1,
            items.length
          )}, minmax(0, 1fr))`,
      }}
    >
      {items.map(
        (
          item,
          index
        ) => (
          <div
            key={`${item.label}-${index}`}
            className="min-w-0 border-r border-slate-100 px-4 py-4 last:border-r-0"
          >
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              {item.label}
            </div>

            <div
              className={[
                "mt-1.5 truncate text-xl font-black tracking-tight",
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
                        : "text-slate-900",
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
      className={[
        "rounded-lg px-3 py-1.5 text-[10px] font-black transition",
        active
          ? "bg-slate-950 text-white shadow-sm"
          : "text-slate-500 hover:bg-white hover:text-slate-900",
      ].join(
        " "
      )}
    >
      {children}
    </button>
  );
}


function ToggleButton({
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
      className={[
        "rounded-lg px-3 py-2 text-[10px] font-black transition",
        active
          ? "bg-slate-950 text-white"
          : "border border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
      ].join(
        " "
      )}
    >
      {children}
    </button>
  );
}


function EmptyState({
  children,
  height = 260,
}) {
  return (
    <div
      className="flex items-center justify-center text-center text-xs font-medium text-slate-400"
      style={{
        minHeight:
          height,
      }}
    >
      {children}
    </div>
  );
}


function NumeroTooltip({
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
                {fmtNumero(
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


function TempoTooltipHoras({
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
              className="flex min-w-[190px] items-center justify-between gap-4 text-[10px]"
            >
              <span className="font-semibold text-slate-500">
                {item.name}
              </span>

              <span className="font-black text-slate-800">
                {fmtHoras(
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


function TempoTooltip({
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
              className="flex min-w-[180px] items-center justify-between gap-4 text-[10px]"
            >
              <span className="font-semibold text-slate-500">
                {item.name}
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


function VariacaoTexto({
  value,
  inverso = false,
}) {
  if (
    value == null ||
    Number.isNaN(
      Number(
        value
      )
    )
  ) {
    return (
      <span className="text-slate-400">
        —
      </span>
    );
  }

  const numero =
    Number(
      value
    );

  const bom =
    numero ===
    0
      ? null
      : inverso
        ? numero <
          0
        : numero >
          0;

  return (
    <span
      className={
        bom ===
        true
          ? "font-black text-emerald-700"
          : bom ===
              false
            ? "font-black text-rose-700"
            : "font-black text-slate-500"
      }
    >
      {fmtVariacao(
        numero
      )}
    </span>
  );
}


/* =========================================================
   PÁGINA
========================================================= */

export default function IndicadoresExecutivosV2Page() {
  const navigate =
    useNavigate();

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    dados,
    setDados,
  ] =
    useState({
      comparativoAtual:
        [],

      operacaoComparativoAtual:
        [],

      b2bComparativoAtual:
        [],

      b2cCanaisComparativoAtual:
        [],

      etapasComparativoAtual:
        [],

      kpisSemanais:
        [],

      kpisMensais:
        [],

      etapasSemanais:
        [],

      etapasMensais:
        [],

      operacaoDiaria:
        [],

      operacaoMensal:
        [],

      leadtimeTriagemMensal:
        [],

      gradesMensais:
        [],

      b2bOperacaoDiaria:
        [],

      b2bOperacaoMensal:
        [],

      b2cCanaisMensal:
        [],

      b2cCanaisFaixasMensal:
        [],

      b2cColetasMensal:
        [],

      expedicaoDiaria:
        [],

      errosProcessoMensais:
        [],

      estoquePosicaoAtual:
        [],

      estoqueAgingAtual:
        [],

      estoqueQualidadeAtual:
        {},
    });

  const [
    canalTempos,
    setCanalTempos,
  ] =
    useState(
      "B2C"
    );

  const [
    mesSelecionado,
    setMesSelecionado,
  ] =
    useState(
      ""
    );


  /* =======================================================
     CARREGAMENTO
  ======================================================= */

  async function carregar() {
    try {
      setLoading(
        true
      );

      setError(
        ""
      );

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


  useEffect(
    () => {
      carregar();
    },
    []
  );


  /* =======================================================
     MESES
  ======================================================= */

  const mesesDisponiveis =
    useMemo(
      () => {
        const meses =
          new Set();

        [
          dados.operacaoMensal,
          dados.kpisMensais,
          dados.gradesMensais,
          dados.b2bOperacaoMensal,
          dados.b2cCanaisMensal,
          dados.errosProcessoMensais,
        ].forEach(
          (
            fonte
          ) => {
            (
              fonte ||
              []
            ).forEach(
              (
                row
              ) => {
                const valor =
                  row.mes ||
                  row.periodo_inicio;

                if (
                  valor
                ) {
                  meses.add(
                    String(
                      valor
                    ).slice(
                      0,
                      10
                    )
                  );
                }
              }
            );
          }
        );

        return Array.from(
          meses
        ).sort();
      },
      [
        dados,
      ]
    );


  useEffect(
    () => {
      if (
        !mesSelecionado &&
        mesesDisponiveis.length
      ) {
        setMesSelecionado(
          mesesDisponiveis[
            mesesDisponiveis.length -
              1
          ]
        );
      }
    },
    [
      mesesDisponiveis,
      mesSelecionado,
    ]
  );


  const indiceMesAtual =
    mesesDisponiveis.indexOf(
      mesSelecionado
    );

  const mesAnterior =
    indiceMesAtual >
    0
      ? mesesDisponiveis[
          indiceMesAtual -
            1
        ]
      : null;

  const prefixoMes =
    String(
      mesSelecionado ||
        ""
    ).slice(
      0,
      7
    );

  const ehMesCorrente =
    mesSelecionado ===
    chaveMesAtual();

  const textoComparacao =
    rotuloComparacao(
      mesSelecionado
    );


  /* =======================================================
     RECEBIMENTO / PRODUÇÃO
  ======================================================= */

  const operacaoMes =
    (
      dados.operacaoMensal ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) ||
    {};

  const operacaoMesAnterior =
    (
      dados.operacaoMensal ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesAnterior
    ) ||
    {};

  const operacaoComparativo =
    dados.operacaoComparativoAtual?.[0] ||
    {};

  const operacaoResumo =
    ehMesCorrente
      ? {
          recebidos:
            operacaoComparativo.recebidos_atual,

          variacaoRecebidos:
            operacaoComparativo.variacao_recebidos_pct,

          funcional:
            operacaoComparativo.funcional_atual,

          variacaoFuncional:
            operacaoComparativo.variacao_funcional_pct,

          cosmetica:
            operacaoComparativo.cosmetica_atual,

          variacaoCosmetica:
            operacaoComparativo.variacao_cosmetica_pct,

          laudos:
            operacaoComparativo.laudos_atual,

          variacaoLaudos:
            operacaoComparativo.variacao_laudos_pct,

          oracle:
            operacaoComparativo.oracle_atual,

          variacaoOracle:
            operacaoComparativo.variacao_oracle_pct,

          maiorEntradaDia:
            operacaoComparativo.maior_entrada_dia,

          deficit:
            operacaoComparativo.deficit_recebimento_funcional,
        }
      : {
          recebidos:
            operacaoMes.recebidos,

          variacaoRecebidos:
            calcularVariacao(
              operacaoMes.recebidos,
              operacaoMesAnterior.recebidos
            ),

          funcional:
            operacaoMes.funcional,

          variacaoFuncional:
            calcularVariacao(
              operacaoMes.funcional,
              operacaoMesAnterior.funcional
            ),

          cosmetica:
            operacaoMes.cosmetica,

          variacaoCosmetica:
            calcularVariacao(
              operacaoMes.cosmetica,
              operacaoMesAnterior.cosmetica
            ),

          laudos:
            operacaoMes.laudos,

          variacaoLaudos:
            calcularVariacao(
              operacaoMes.laudos,
              operacaoMesAnterior.laudos
            ),

          oracle:
            operacaoMes.oracle,

          variacaoOracle:
            calcularVariacao(
              operacaoMes.oracle,
              operacaoMesAnterior.oracle
            ),

          maiorEntradaDia:
            operacaoMes.maior_entrada_dia,

          deficit:
            operacaoMes.deficit_recebimento_funcional,
        };

  const operacaoDiariaMes =
    useMemo(
      () =>
        (
          dados.operacaoDiaria ||
          []
        )
          .filter(
            (
              row
            ) =>
              String(
                row.dia
              ).slice(
                0,
                7
              ) ===
              prefixoMes
          )
          .map(
            (
              row
            ) => ({
              ...row,

              label:
                fmtDataCurta(
                  row.dia
                ),
            })
          ),
      [
        dados.operacaoDiaria,
        prefixoMes,
      ]
    );


  /* =======================================================
     LEAD TIME WAREHOUSE
  ======================================================= */

  const leadtimeWarehouse =
    (
      dados.leadtimeTriagemMensal ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) ||
    {};

  const leadtimeWarehouseAnterior =
    (
      dados.leadtimeTriagemMensal ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesAnterior
    ) ||
    {};

  const leadtimeTemComparativoEspecial =
    leadtimeWarehouse.receb_funcional_mediana_atual_h !=
      null;

  const recebFuncionalMediana =
    leadtimeTemComparativoEspecial
      ? Number(
          leadtimeWarehouse.receb_funcional_mediana_atual_h
        )
      : Number(
          leadtimeWarehouse.receb_funcional_h ||
            0
        );

  const recebFuncionalAnterior =
    leadtimeTemComparativoEspecial
      ? Number(
          leadtimeWarehouse.receb_funcional_mediana_anterior_h
        )
      : (
          leadtimeWarehouseAnterior.receb_funcional_h !=
          null
            ? Number(
                leadtimeWarehouseAnterior.receb_funcional_h
              )
            : null
        );

  const recebFuncionalVariacao =
    leadtimeTemComparativoEspecial
      ? Number(
          leadtimeWarehouse.receb_funcional_variacao_mediana_pct
        )
      : calcularVariacao(
          recebFuncionalMediana,
          recebFuncionalAnterior
        );

  const recebFuncionalMedia =
    leadtimeWarehouse.receb_funcional_media_atual_h !=
      null
      ? Number(
          leadtimeWarehouse.receb_funcional_media_atual_h
        )
      : null;

  const recebFuncionalP90 =
    leadtimeWarehouse.receb_funcional_p90_atual_h !=
      null
      ? Number(
          leadtimeWarehouse.receb_funcional_p90_atual_h
        )
      : null;

  const recebFuncionalAmostra =
    Number(
      leadtimeWarehouse.receb_funcional_amostra_atual ??
        leadtimeWarehouse.aparelhos ??
        0
    );

  const prioridadesMenor1h =
    Number(
      leadtimeWarehouse.receb_funcional_prioridades_menor_1h ??
        leadtimeWarehouse.excluidos_tempo_zero ??
        0
    );

  const timestampsSimultaneos =
    Number(
      leadtimeWarehouse.receb_funcional_timestamps_simultaneos ||
        0
    );


  const funcionalCosmeticaMediana =
    leadtimeTemComparativoEspecial
      ? Number(
          leadtimeWarehouse.funcional_cosmetica_mediana_atual_h
        )
      : Number(
          leadtimeWarehouse.funcional_cosmetica_h ||
            0
        );

  const funcionalCosmeticaAnterior =
    leadtimeTemComparativoEspecial
      ? Number(
          leadtimeWarehouse.funcional_cosmetica_mediana_anterior_h
        )
      : (
          leadtimeWarehouseAnterior.funcional_cosmetica_h !=
          null
            ? Number(
                leadtimeWarehouseAnterior.funcional_cosmetica_h
              )
            : null
        );

  const funcionalCosmeticaVariacao =
    leadtimeTemComparativoEspecial
      ? Number(
          leadtimeWarehouse.funcional_cosmetica_variacao_mediana_pct
        )
      : calcularVariacao(
          funcionalCosmeticaMediana,
          funcionalCosmeticaAnterior
        );

  const funcionalCosmeticaMedia =
    leadtimeWarehouse.funcional_cosmetica_media_atual_h !=
      null
      ? Number(
          leadtimeWarehouse.funcional_cosmetica_media_atual_h
        )
      : null;

  const funcionalCosmeticaP90 =
    leadtimeWarehouse.funcional_cosmetica_p90_atual_h !=
      null
      ? Number(
          leadtimeWarehouse.funcional_cosmetica_p90_atual_h
        )
      : null;

  const funcionalCosmeticaAmostra =
    Number(
      leadtimeWarehouse.funcional_cosmetica_amostra_atual ||
        0
    );


  const cosmeticaWmsMediana =
    leadtimeWarehouse.cosmetica_wms_mediana_h !=
      null
      ? Number(
          leadtimeWarehouse.cosmetica_wms_mediana_h
        )
      : null;

  const cosmeticaWmsMedia =
    leadtimeWarehouse.cosmetica_wms_media_h !=
      null
      ? Number(
          leadtimeWarehouse.cosmetica_wms_media_h
        )
      : null;

  const cosmeticaWmsP90 =
    leadtimeWarehouse.cosmetica_wms_p90_h !=
      null
      ? Number(
          leadtimeWarehouse.cosmetica_wms_p90_h
        )
      : null;

  const cosmeticaWmsAmostra =
    Number(
      leadtimeWarehouse.cosmetica_wms_amostra ||
        0
    );

  const cosmeticaWmsAte48 =
    Number(
      leadtimeWarehouse.cosmetica_wms_ate_48h ||
        0
    );

  const cosmeticaWmsPctAte48 =
    leadtimeWarehouse.cosmetica_wms_pct_ate_48h !=
      null
      ? Number(
          leadtimeWarehouse.cosmetica_wms_pct_ate_48h
        )
      : null;

  const cosmeticaWmsPendentes =
    Number(
      leadtimeWarehouse.cosmetica_wms_pendentes ||
        0
    );

  const baselineWmsInicio =
    leadtimeWarehouse.baseline_wms_inicio ||
    "2026-08-15";

  const corteLeadtime =
    leadtimeWarehouse.corte_operacional ||
    null;

  const leadtimeEtapas =
    [
      {
        etapa:
          "Recebimento → Funcional",

        horas:
          recebFuncionalMediana,

        anterior:
          recebFuncionalAnterior,

        variacao:
          recebFuncionalVariacao,
      },

      {
        etapa:
          "Funcional → Cosmética",

        horas:
          funcionalCosmeticaMediana,

        anterior:
          funcionalCosmeticaAnterior,

        variacao:
          funcionalCosmeticaVariacao,
      },

      {
        etapa:
          "Cosmética → Alocação WMS",

        horas:
          cosmeticaWmsMediana,

        anterior:
          null,

        variacao:
          null,
      },
    ].filter(
      (
        item
      ) =>
        item.horas !=
          null &&
        Number.isFinite(
          Number(
            item.horas
          )
        )
    );


  /* =======================================================
     QUALIDADE
  ======================================================= */

  const gradesMes =
    useMemo(
      () => {
        const linhas =
          (
            dados.gradesMensais ||
            []
          )
            .filter(
              (
                row
              ) =>
                String(
                  row.mes
                ).slice(
                  0,
                  10
                ) ===
                mesSelecionado
            );

        const total =
          linhas.reduce(
            (
              soma,
              row
            ) =>
              soma +
              Number(
                row.aparelhos ||
                  0
              ),
            0
          );

        return linhas
          .map(
            (
              row
            ) => ({
              ...row,

              aparelhos:
                Number(
                  row.aparelhos ||
                    0
                ),

              percentual:
                total >
                0
                  ? (
                      Number(
                        row.aparelhos ||
                          0
                      ) /
                      total
                    ) *
                    100
                  : 0,
            })
          )
          .sort(
            (
              a,
              b
            ) =>
              b.aparelhos -
              a.aparelhos
          );
      },
      [
        dados.gradesMensais,
        mesSelecionado,
      ]
    );

  const totalGrades =
    gradesMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.aparelhos ||
            0
        ),
      0
    );

  const naoAlocaveis =
    gradesMes.reduce(
      (
        total,
        row
      ) => {
        const gradeNormalizada =
          normalizarTexto(
            row.grade
          );

        const naoAlocavel =
          gradeNormalizada.includes(
            "QUEBRAD"
          ) ||
          gradeNormalizada.includes(
            "REGULAR"
          );

        return total +
          (
            naoAlocavel
              ? Number(
                  row.aparelhos ||
                    0
                )
              : 0
          );
      },
      0
    );

  const pctNaoAlocavel =
    totalGrades >
    0
      ? (
          naoAlocaveis /
          totalGrades
        ) *
        100
      : null;


  /* =======================================================
     B2B
  ======================================================= */

  const b2bMes =
    (
      dados.b2bOperacaoMensal ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) ||
    {};

  const b2bMesAnterior =
    (
      dados.b2bOperacaoMensal ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesAnterior
    ) ||
    {};

  const b2bComparativo =
    dados.b2bComparativoAtual?.[0] ||
    {};

  const b2bResumo =
    ehMesCorrente
      ? {
          pedidos:
            b2bComparativo.pedidos_recebidos_atual,

          pedidosAnterior:
            b2bComparativo.pedidos_recebidos_anterior,

          variacaoPedidos:
            b2bComparativo.variacao_pedidos_pct,

          itensRecebidos:
            b2bComparativo.itens_recebidos_atual,

          itensRecebidosAnterior:
            b2bComparativo.itens_recebidos_anterior,

          variacaoItensRecebidos:
            b2bComparativo.variacao_itens_recebidos_pct,

          itensFaturados:
            b2bComparativo.itens_faturados_atual,

          itensFaturadosAnterior:
            b2bComparativo.itens_faturados_anterior,

          variacaoItensFaturados:
            b2bComparativo.variacao_itens_faturados_pct,

          notas:
            b2bComparativo.notas_emitidas_atual,

          notasAnterior:
            b2bComparativo.notas_emitidas_anterior,

          variacaoNotas:
            b2bComparativo.variacao_notas_pct,

          erros:
            b2bComparativo.erros_nf_atual,

          errosAnterior:
            b2bComparativo.erros_nf_anterior,

          variacaoErros:
            b2bComparativo.variacao_erros_nf_pct,
        }
      : {
          pedidos:
            b2bMes.pedidos_recebidos,

          pedidosAnterior:
            b2bMesAnterior.pedidos_recebidos,

          variacaoPedidos:
            calcularVariacao(
              b2bMes.pedidos_recebidos,
              b2bMesAnterior.pedidos_recebidos
            ),

          itensRecebidos:
            b2bMes.itens_recebidos,

          itensRecebidosAnterior:
            b2bMesAnterior.itens_recebidos,

          variacaoItensRecebidos:
            calcularVariacao(
              b2bMes.itens_recebidos,
              b2bMesAnterior.itens_recebidos
            ),

          itensFaturados:
            b2bMes.itens_faturados,

          itensFaturadosAnterior:
            b2bMesAnterior.itens_faturados,

          variacaoItensFaturados:
            calcularVariacao(
              b2bMes.itens_faturados,
              b2bMesAnterior.itens_faturados
            ),

          notas:
            b2bMes.notas_emitidas,

          notasAnterior:
            b2bMesAnterior.notas_emitidas,

          variacaoNotas:
            calcularVariacao(
              b2bMes.notas_emitidas,
              b2bMesAnterior.notas_emitidas
            ),

          erros:
            b2bMes.erros_nf,

          errosAnterior:
            b2bMesAnterior.erros_nf,

          variacaoErros:
            calcularVariacao(
              b2bMes.erros_nf,
              b2bMesAnterior.erros_nf
            ),
        };

  const b2bDiarioMes =
    useMemo(
      () =>
        (
          dados.b2bOperacaoDiaria ||
          []
        )
          .filter(
            (
              row
            ) =>
              String(
                row.dia
              ).slice(
                0,
                7
              ) ===
              prefixoMes
          )
          .map(
            (
              row
            ) => ({
              ...row,

              label:
                fmtDataCurta(
                  row.dia
                ),
            })
          ),
      [
        dados.b2bOperacaoDiaria,
        prefixoMes,
      ]
    );


  /* =======================================================
     ETAPAS
  ======================================================= */

  function etapasCanal(
    canal
  ) {
    if (
      ehMesCorrente
    ) {
      return (
        dados.etapasComparativoAtual ||
        []
      )
        .filter(
          (
            item
          ) =>
            item.canal ===
            canal
        )
        .map(
          (
            item
          ) => ({
            canal:
              item.canal,

            etapa:
              item.etapa,

            amostra:
              item.amostra_atual,

            amostraAnterior:
              item.amostra_anterior,

            media_min:
              item.media_atual_min,

            media_anterior_min:
              item.media_anterior_min,

            mediana_min:
              item.mediana_atual_min,

            mediana_anterior_min:
              item.mediana_anterior_min,

            p90_min:
              item.p90_atual_min,

            p90_anterior_min:
              item.p90_anterior_min,

            variacao_mediana_pct:
              item.variacao_mediana_pct,
          })
        );
    }

    return (
      dados.etapasMensais ||
      []
    )
      .filter(
        (
          item
        ) =>
          item.canal ===
            canal &&
          String(
            item.periodo_inicio
          ).slice(
            0,
            10
          ) ===
            mesSelecionado
      )
      .map(
        (
          item
        ) => ({
          canal:
            item.canal,

          etapa:
            item.etapa,

          amostra:
            item.amostra,

          amostraAnterior:
            item.amostra_anterior,

          media_min:
            item.media_min,

          mediana_min:
            item.mediana_min,

          mediana_anterior_min:
            item.mediana_anterior_min,

          p90_min:
            item.p90_min,

          p90_anterior_min:
            item.p90_anterior_min,

          variacao_mediana_pct:
            item.variacao_mediana_pct,
        })
      );
  }

  const etapasB2B =
    etapasCanal(
      "B2B"
    );

  const etapasB2C =
    etapasCanal(
      "B2C"
    );

  const etapasAtuais =
    canalTempos ===
    "B2C"
      ? etapasB2C
      : etapasB2B;


  /* =======================================================
     RESUMO DE TEMPOS POR CANAL
  ======================================================= */

  function resumoCanal(
    canal
  ) {
    if (
      ehMesCorrente
    ) {
      return (
        (
          dados.comparativoAtual ||
          []
        ).find(
          (
            item
          ) =>
            item.granularidade ===
              "MTD" &&
            item.canal ===
              canal
        ) ||
        {}
      );
    }

    const atual =
      (
        dados.kpisMensais ||
        []
      ).find(
        (
          item
        ) =>
          item.canal ===
            canal &&
          String(
            item.periodo_inicio
          ).slice(
            0,
            10
          ) ===
            mesSelecionado
      ) ||
      {};

    const anterior =
      (
        dados.kpisMensais ||
        []
      ).find(
        (
          item
        ) =>
          item.canal ===
            canal &&
          String(
            item.periodo_inicio
          ).slice(
            0,
            10
          ) ===
            mesAnterior
      ) ||
      {};

    return {
      pedidos_atual:
        atual.pedidos,

      pedidos_anterior:
        anterior.pedidos,

      variacao_pedidos_pct:
        calcularVariacao(
          atual.pedidos,
          anterior.pedidos
        ),

      itens_atual:
        atual.itens,

      itens_anterior:
        anterior.itens,

      variacao_itens_pct:
        calcularVariacao(
          atual.itens,
          anterior.itens
        ),

      pct_concluidos_atual:
        atual.pct_concluidos,

      pct_concluidos_anterior:
        anterior.pct_concluidos,

      variacao_conclusao_pp:
        atual.pct_concluidos !=
          null &&
        anterior.pct_concluidos !=
          null
          ? Number(
              atual.pct_concluidos
            ) -
            Number(
              anterior.pct_concluidos
            )
          : null,

      mediana_leadtime_atual_min:
        atual.mediana_leadtime_min,

      mediana_leadtime_anterior_min:
        anterior.mediana_leadtime_min,

      variacao_mediana_leadtime_pct:
        calcularVariacao(
          atual.mediana_leadtime_min,
          anterior.mediana_leadtime_min
        ),

      p90_leadtime_atual_min:
        atual.p90_leadtime_min,

      p90_leadtime_anterior_min:
        anterior.p90_leadtime_min,

      amostra_leadtime_atual:
        atual.amostra_leadtime,

      amostra_leadtime_anterior:
        anterior.amostra_leadtime,
    };
  }

  const resumoTempos =
    resumoCanal(
      canalTempos
    );


  /* =======================================================
     EVOLUÇÃO SEMANAL
  ======================================================= */

  const evolucaoSemanal =
    useMemo(
      () => {
        const mapa =
          new Map();

        (
          dados.kpisSemanais ||
          []
        ).forEach(
          (
            item
          ) => {
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
                    fmtDataCurta(
                      chave
                    ),

                  B2C:
                    null,

                  B2B:
                    null,
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
        ).sort(
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
        );
      },
      [
        dados.kpisSemanais,
      ]
    );


  /* =======================================================
     B2C
  ======================================================= */

  const canaisMes =
    useMemo(
      () => {
        if (
          ehMesCorrente
        ) {
          return (
            dados.b2cCanaisComparativoAtual ||
            []
          )
            .map(
              (
                row
              ) => ({
                marketplace:
                  row.marketplace,

                pagos:
                  Number(
                    row.pagos_atual ||
                      0
                  ),

                pagosAnterior:
                  Number(
                    row.pagos_anterior ||
                      0
                  ),

                embalados:
                  Number(
                    row.embalados_atual ||
                      0
                  ),

                cancelados:
                  Number(
                    row.cancelados_atual ||
                      0
                  ),

                coletas:
                  Number(
                    row.coletas_efetivas_atual ||
                      0
                  ),

                coletasAnterior:
                  Number(
                    row.coletas_efetivas_anterior ||
                      0
                  ),

                ciclos_validos:
                  Number(
                    row.ciclos_validos_atual ||
                      0
                  ),

                ate_24h:
                  Number(
                    row.ate_24h_atual ||
                      0
                  ),

                pct_ate_24h:
                  row.pct_ate_24h_atual,

                pct_ate_24h_anterior:
                  row.pct_ate_24h_anterior,

                mediana_h:
                  row.mediana_h_atual,

                mediana_h_anterior:
                  row.mediana_h_anterior,

                variacao_mediana_pct:
                  row.variacao_mediana_pct,

                p90_h:
                  row.p90_h_atual,
              })
            )
            .sort(
              (
                a,
                b
              ) =>
                b.pagos -
                a.pagos
            );
        }

        const linhas =
          (
            dados.b2cCanaisMensal ||
            []
          )
            .filter(
              (
                row
              ) =>
                String(
                  row.mes
                ).slice(
                  0,
                  10
                ) ===
                mesSelecionado
            );

        return linhas
          .map(
            (
              row
            ) => {
              const anterior =
                (
                  dados.b2cCanaisMensal ||
                  []
                ).find(
                  (
                    item
                  ) =>
                    item.marketplace ===
                      row.marketplace &&
                    String(
                      item.mes
                    ).slice(
                      0,
                      10
                    ) ===
                      mesAnterior
                ) ||
                {};

              const coleta =
                (
                  dados.b2cColetasMensal ||
                  []
                ).find(
                  (
                    item
                  ) =>
                    item.marketplace ===
                      row.marketplace &&
                    String(
                      item.mes
                    ).slice(
                      0,
                      10
                    ) ===
                      mesSelecionado
                ) ||
                {};

              const coletaAnterior =
                (
                  dados.b2cColetasMensal ||
                  []
                ).find(
                  (
                    item
                  ) =>
                    item.marketplace ===
                      row.marketplace &&
                    String(
                      item.mes
                    ).slice(
                      0,
                      10
                    ) ===
                      mesAnterior
                ) ||
                {};

              const pagos =
                Number(
                  row.pagos ||
                    0
                );

              const cancelados =
                Number(
                  row.cancelados ||
                    0
                );

              return {
                marketplace:
                  row.marketplace,

                pagos,

                pagosAnterior:
                  Number(
                    anterior.pagos ||
                      0
                  ),

                embalados:
                  Math.max(
                    0,
                    pagos -
                      cancelados
                  ),

                cancelados,

                coletas:
                  Number(
                    coleta.coletas_efetivas ||
                      0
                  ),

                coletasAnterior:
                  Number(
                    coletaAnterior.coletas_efetivas ||
                      0
                  ),

                ciclos_validos:
                  Number(
                    row.ciclos_validos ||
                      0
                  ),

                ate_24h:
                  Number(
                    row.ate_24h ||
                      0
                  ),

                pct_ate_24h:
                  row.pct_ate_24h,

                pct_ate_24h_anterior:
                  anterior.pct_ate_24h,

                mediana_h:
                  row.mediana_h,

                mediana_h_anterior:
                  anterior.mediana_h,

                variacao_mediana_pct:
                  calcularVariacao(
                    row.mediana_h,
                    anterior.mediana_h
                  ),

                p90_h:
                  row.p90_h,
              };
            }
          )
          .sort(
            (
              a,
              b
            ) =>
              b.pagos -
              a.pagos
          );
      },
      [
        dados.b2cCanaisComparativoAtual,
        dados.b2cCanaisMensal,
        dados.b2cColetasMensal,
        ehMesCorrente,
        mesSelecionado,
        mesAnterior,
      ]
    );

  const faixasMes =
    (
      dados.b2cCanaisFaixasMensal ||
      []
    ).filter(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    );

  const faixasB2CChart =
    FAIXAS_B2C.map(
      (
        faixa
      ) => ({
        faixa,

        pedidos:
          faixasMes
            .filter(
              (
                row
              ) =>
                normalizarTexto(
                  row.faixa
                ) ===
                normalizarTexto(
                  faixa
                )
            )
            .reduce(
              (
                total,
                row
              ) =>
                total +
                Number(
                  row.pedidos ||
                    0
                ),
              0
            ),
      })
    );

  const expedicaoMes =
    useMemo(
      () => {
        const mapa =
          new Map();

        (
          dados.expedicaoDiaria ||
          []
        )
          .filter(
            (
              row
            ) =>
              String(
                row.dia
              ).slice(
                0,
                7
              ) ===
              prefixoMes
          )
          .forEach(
            (
              row
            ) => {
              const chave =
                String(
                  row.dia
                ).slice(
                  0,
                  10
                );

              const atual =
                mapa.get(
                  chave
                ) ||
                {
                  dia:
                    chave,

                  volumes:
                    0,
                };

              atual.volumes +=
                Number(
                  row.pedidos ||
                    0
                );

              mapa.set(
                chave,
                atual
              );
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
                a.dia
              ).localeCompare(
                String(
                  b.dia
                )
              )
          )
          .map(
            (
              row
            ) => ({
              ...row,

              label:
                fmtDataCurta(
                  row.dia
                ),
            })
          );
      },
      [
        dados.expedicaoDiaria,
        prefixoMes,
      ]
    );

  const volumesExpedidos =
    expedicaoMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.volumes ||
            0
        ),
      0
    );

  const totalPagos =
    canaisMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.pagos ||
            0
        ),
      0
    );

  const totalEmbalados =
    canaisMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.embalados ||
            0
        ),
      0
    );

  const totalCancelados =
    canaisMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.cancelados ||
            0
        ),
      0
    );

  const totalColetas =
    canaisMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.coletas ||
            0
        ),
      0
    );


  /* =======================================================
     ERROS
  ======================================================= */

  const errosMes =
    (
      dados.errosProcessoMensais ||
      []
    ).find(
      (
        row
      ) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) ||
    {};

  const errosChart =
    [
      {
        categoria:
          "Falha integração",

        valor:
          Number(
            errosMes.falhas_integracao ||
              0
          ),
      },

      {
        categoria:
          "Cancelado antes embalagem",

        valor:
          Number(
            errosMes.cancelados_marketplace ||
              0
          ),
      },

      {
        categoria:
          "Cancelado após embalagem",

        valor:
          Number(
            errosMes.cancelados_pos_embalagem ||
              0
          ),
      },

      {
        categoria:
          "Cancelado após faturamento",

        valor:
          Number(
            errosMes.cancelados_pos_faturamento ||
              0
          ),
      },

      {
        categoria:
          "Erro NF B2B",

        valor:
          Number(
            errosMes.erros_nf_b2b ||
              0
          ),
      },
    ];

  const totalErros =
    errosChart.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.valor ||
            0
        ),
      0
    );


  /* =======================================================
     ESTOQUE
  ======================================================= */

  const estoqueQualidade =
    dados.estoqueQualidadeAtual ||
    {};

  const estoquePosicao =
    useMemo(
      () =>
        [
          ...(
            dados.estoquePosicaoAtual ||
            []
          ),
        ].sort(
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
        dados.estoquePosicaoAtual,
      ]
    );

  const estoqueAging =
    useMemo(
      () => {
        const agrupado =
          new Map();

        (
          dados.estoqueAgingAtual ||
          []
        ).forEach(
          (
            row
          ) => {
            const faixa =
              normalizarFaixaAging(
                row.faixa
              );

            if (
              !faixa
            ) {
              return;
            }

            agrupado.set(
              faixa,
              (
                agrupado.get(
                  faixa
                ) ||
                0
              ) +
                Number(
                  row.aparelhos ||
                    0
                )
            );
          }
        );

        return ORDEM_AGING.map(
          (
            faixa
          ) => ({
            faixa,

            aparelhos:
              agrupado.get(
                faixa
              ) ||
              0,
          })
        );
      },
      [
        dados.estoqueAgingAtual,
      ]
    );

  const totalEstoque =
    Number(
      estoqueQualidade.total_estoque ||
        0
    );

  const mais90 =
    Number(
      estoqueQualidade.mais_90_dias ||
        0
    );

  const pctMais90 =
    totalEstoque >
    0
      ? (
          mais90 /
          totalEstoque
        ) *
        100
      : null;

  const pctIntegro =
    totalEstoque >
    0
      ? (
          Number(
            estoqueQualidade.integros ||
              0
          ) /
          totalEstoque
        ) *
        100
      : null;


  /* =======================================================
     NAVEGAÇÃO
  ======================================================= */

  function abrirAgingEstoque(
    faixa
  ) {
    const faixaNormalizada =
      normalizarFaixaAging(
        faixa
      );

    if (
      !faixaNormalizada
    ) {
      return;
    }

    navigate(
      `/v2/assurant/indicadores/estoque/aging?faixa=${encodeURIComponent(
        faixaNormalizada
      )}`
    );
  }


  /* =======================================================
     LOADING / ERROR
  ======================================================= */

  if (
    loading
  ) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-violet-700" />

          <div className="mt-3 text-sm font-bold text-slate-700">
            Consolidando operação...
          </div>

          <div className="mt-1 text-xs text-slate-400">
            Warehouse, B2B, B2C, estoque e qualidade.
          </div>
        </div>
      </div>
    );
  }

  if (
    error
  ) {
    return (
      <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-rose-600" />

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


  /* =======================================================
     RENDER
  ======================================================= */

  return (
    <div className="space-y-6 pb-10">

      {/* ===================================================
          CABEÇALHO EXECUTIVO
      =================================================== */}

      <header className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-5 px-5 py-5 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-950 text-white">
                <BarChart3 className="h-5 w-5" />
              </div>

              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.15em] text-slate-400">
                  Assurant Warehouse
                </div>

                <h1 className="mt-0.5 text-xl font-black tracking-tight text-slate-950">
                  Cockpit Operacional
                </h1>

                <p className="mt-0.5 text-xs text-slate-400">
                  Operação, qualidade, SLA, exceções e estoque em uma leitura contínua.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {mesesDisponiveis.map(
                (
                  mes
                ) => (
                  <PeriodButton
                    key={
                      mes
                    }
                    active={
                      mesSelecionado ===
                      mes
                    }
                    onClick={() =>
                      setMesSelecionado(
                        mes
                      )
                    }
                  >
                    {fmtMes(
                      mes
                    )}
                  </PeriodButton>
                )
              )}
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

        <MetricStrip
          items={[
            {
              label:
                "Recebidos",

              value:
                fmtNumero(
                  operacaoResumo.recebidos
                ),

              detail:
                `${fmtVariacao(
                  operacaoResumo.variacaoRecebidos
                )} · ${textoComparacao}`,

              tone:
                "violet",
            },

            {
              label:
                "Funcional",

              value:
                fmtNumero(
                  operacaoResumo.funcional
                ),

              detail:
                `${fmtNumero(
                  operacaoResumo.deficit
                )} de déficit`,
            },

            {
              label:
                "B2C saída física",

              value:
                fmtNumero(
                  volumesExpedidos
                ),

              detail:
                "volumes bipados em romaneios",

              tone:
                "good",
            },

            {
              label:
                "B2B faturado",

              value:
                fmtNumero(
                  b2bResumo.itensFaturados
                ),

              detail:
                `${fmtNumero(
                  b2bResumo.itensRecebidos
                )} itens recebidos`,
            },

            {
              label:
                "Estoque",

              value:
                fmtNumero(
                  totalEstoque
                ),

              detail:
                `${fmtPercentual(
                  pctMais90
                )} acima de 90 dias`,

              tone:
                pctMais90 !=
                  null &&
                pctMais90 >
                  15
                  ? "danger"
                  : "warning",
            },

            {
              label:
                "Receb. → Funcional",

              value:
                fmtHoras(
                  recebFuncionalMediana
                ),

              detail:
                `${fmtVariacao(
                  recebFuncionalVariacao
                )} na mediana`,

              tone:
                recebFuncionalVariacao !=
                  null &&
                recebFuncionalVariacao <
                  0
                  ? "good"
                  : undefined,
            },
          ]}
        />
      </header>


      {/* ===================================================
          1. RECEBIMENTO E PRODUÇÃO
      =================================================== */}

      <Section
        index="01"
        title={`Recebimento & Produção — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle={`Curva diária do fluxo físico. Comparativos: ${textoComparacao}.`}
      >
        <MetricStrip
          items={[
            {
              label:
                "Recebidos",

              value:
                fmtNumero(
                  operacaoResumo.recebidos
                ),

              detail:
                `${fmtVariacao(
                  operacaoResumo.variacaoRecebidos
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Funcional",

              value:
                fmtNumero(
                  operacaoResumo.funcional
                ),

              detail:
                `${fmtVariacao(
                  operacaoResumo.variacaoFuncional
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Cosmética",

              value:
                fmtNumero(
                  operacaoResumo.cosmetica
                ),

              detail:
                `${fmtVariacao(
                  operacaoResumo.variacaoCosmetica
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Laudos",

              value:
                fmtNumero(
                  operacaoResumo.laudos
                ),

              detail:
                `${fmtVariacao(
                  operacaoResumo.variacaoLaudos
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Oracle",

              value:
                fmtNumero(
                  operacaoResumo.oracle
                ),

              detail:
                `${fmtVariacao(
                  operacaoResumo.variacaoOracle
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Pico de entrada",

              value:
                fmtNumero(
                  operacaoResumo.maiorEntradaDia
                ),

              detail:
                "maior entrada diária",

              tone:
                "warning",
            },
          ]}
        />

        <div className="h-[340px] p-5">
          {operacaoDiariaMes.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <ComposedChart
                data={
                  operacaoDiariaMes
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
                  dataKey="label"
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
                  content={
                    <NumeroTooltip />
                  }
                />

                <Legend
                  wrapperStyle={{
                    fontSize:
                      "10px",
                  }}
                />

                <Area
                  type="monotone"
                  dataKey="recebidos"
                  name="Recebidos"
                  fill="#EDE9FE"
                  stroke="#6D28D9"
                  strokeWidth={
                    2
                  }
                />

                <Line
                  type="monotone"
                  dataKey="funcional"
                  name="Funcional"
                  stroke="#0F172A"
                  strokeWidth={
                    2.4
                  }
                  dot={
                    false
                  }
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="cosmetica"
                  name="Cosmética"
                  stroke="#0284C7"
                  strokeWidth={
                    2
                  }
                  dot={
                    false
                  }
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="laudos"
                  name="Laudos"
                  stroke="#F59E0B"
                  strokeWidth={
                    1.8
                  }
                  dot={
                    false
                  }
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="oracle"
                  name="Oracle"
                  stroke="#059669"
                  strokeWidth={
                    2
                  }
                  dot={
                    false
                  }
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState>
              Sem produção diária disponível para este mês.
            </EmptyState>
          )}
        </div>
      </Section>


      {/* ===================================================
          2. LEAD TIME WAREHOUSE
      =================================================== */}

      <Section
        index="02"
        title="Lead Time do Warehouse"
        subtitle={`Medianas das transições operacionais. Recebimento → Funcional desconsidera sábados e domingos. Prioridades abaixo de 1h permanecem no cálculo.${
          corteLeadtime
            ? ` Corte operacional da base: ${fmtDataCurta(
                corteLeadtime
              )}.`
            : ""
        }`}
      >
        <MetricStrip
          items={[
            {
              label:
                "Recebimento → Funcional",

              value:
                fmtHoras(
                  recebFuncionalMediana
                ),

              detail:
                recebFuncionalAnterior !=
                null
                  ? `${fmtHoras(
                      recebFuncionalAnterior
                    )} anterior · ${fmtVariacao(
                      recebFuncionalVariacao
                    )}`
                  : "mediana",

              tone:
                recebFuncionalVariacao !=
                  null &&
                recebFuncionalVariacao <
                  0
                  ? "good"
                  : undefined,
            },

            {
              label:
                "Funcional → Cosmética",

              value:
                fmtHoras(
                  funcionalCosmeticaMediana
                ),

              detail:
                funcionalCosmeticaAnterior !=
                null
                  ? `${fmtHoras(
                      funcionalCosmeticaAnterior
                    )} anterior · ${fmtVariacao(
                      funcionalCosmeticaVariacao
                    )}`
                  : "mediana",

              tone:
                funcionalCosmeticaVariacao !=
                  null &&
                funcionalCosmeticaVariacao <
                  0
                  ? "good"
                  : undefined,
            },

            {
              label:
                "Cosmética → Alocação WMS",

              value:
                fmtHoras(
                  cosmeticaWmsMediana
                ),

              detail:
                cosmeticaWmsPctAte48 !=
                null
                  ? `${fmtPercentual(
                      cosmeticaWmsPctAte48
                    )} em até 48h`
                  : "baseline WMS",

              tone:
                "violet",
            },

            {
              label:
                "Prioridades < 1h",

              value:
                fmtNumero(
                  prioridadesMenor1h
                ),

              detail:
                `${fmtNumero(
                  timestampsSimultaneos
                )} timestamps simultâneos`,
            },
          ]}
        />

        <div className="grid gap-6 p-5 xl:grid-cols-[1fr_1fr]">
          <div>
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Mediana por etapa
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Tempo típico de passagem entre as principais etapas do Warehouse.
              </div>
            </div>

            <div className="h-[310px]">
              {leadtimeEtapas.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={
                      leadtimeEtapas
                    }
                    layout="vertical"
                    margin={{
                      left:
                        40,

                      right:
                        35,
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
                      tickFormatter={(
                        value
                      ) =>
                        `${fmtNumero(
                          value,
                          0
                        )}h`
                      }
                    />

                    <YAxis
                      type="category"
                      dataKey="etapa"
                      width={
                        175
                      }
                      tick={{
                        fontSize:
                          10,

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
                        <TempoTooltipHoras />
                      }
                    />

                    <Bar
                      dataKey="horas"
                      name="Mediana"
                      fill="#475569"
                      radius={[
                        0,
                        5,
                        5,
                        0,
                      ]}
                    >
                      <LabelList
                        dataKey="horas"
                        position="right"
                        formatter={(
                          value
                        ) =>
                          fmtHoras(
                            value
                          )
                        }
                        style={{
                          fill:
                            "#475569",

                          fontSize:
                            10,

                          fontWeight:
                            800,
                        }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>
                  Sem dados de Lead Time disponíveis.
                </EmptyState>
              )}
            </div>
          </div>

          <div>
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Comparativo operacional
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Média, mediana, P90 e cobertura da amostra.
              </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                      Etapa
                    </th>

                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                      Média
                    </th>

                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                      Mediana
                    </th>

                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                      P90
                    </th>

                    <th className="px-4 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                      N
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="px-4 py-3 text-[10px] font-black text-slate-700">
                      Receb. → Funcional
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-600">
                      {fmtHoras(
                        recebFuncionalMedia
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-black text-slate-900">
                      {fmtHoras(
                        recebFuncionalMediana
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-600">
                      {fmtHoras(
                        recebFuncionalP90
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-[10px] font-black text-slate-700">
                      {fmtNumero(
                        recebFuncionalAmostra
                      )}
                    </td>
                  </tr>

                  <tr>
                    <td className="px-4 py-3 text-[10px] font-black text-slate-700">
                      Funcional → Cosmética
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-600">
                      {fmtHoras(
                        funcionalCosmeticaMedia
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-black text-slate-900">
                      {fmtHoras(
                        funcionalCosmeticaMediana
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-600">
                      {fmtHoras(
                        funcionalCosmeticaP90
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-[10px] font-black text-slate-700">
                      {fmtNumero(
                        funcionalCosmeticaAmostra
                      )}
                    </td>
                  </tr>

                  <tr>
                    <td className="px-4 py-3 text-[10px] font-black text-slate-700">
                      Cosmética → WMS
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-600">
                      {fmtHoras(
                        cosmeticaWmsMedia
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-black text-slate-900">
                      {fmtHoras(
                        cosmeticaWmsMediana
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-[10px] font-semibold text-slate-600">
                      {fmtHoras(
                        cosmeticaWmsP90
                      )}
                    </td>

                    <td className="px-4 py-3 text-right text-[10px] font-black text-slate-700">
                      {fmtNumero(
                        cosmeticaWmsAmostra
                      )}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="grid gap-4 border-t border-slate-100 bg-slate-50/60 p-5 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              R → F · variação mediana
            </div>

            <div className="mt-2 text-xl font-black text-emerald-700">
              {fmtVariacao(
                recebFuncionalVariacao
              )}
            </div>

            <div className="mt-1 text-[9px] leading-4 text-slate-400">
              {fmtHoras(
                recebFuncionalAnterior
              )}{" "}
              no mesmo período anterior.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              F → C · variação mediana
            </div>

            <div className="mt-2 text-xl font-black text-emerald-700">
              {fmtVariacao(
                funcionalCosmeticaVariacao
              )}
            </div>

            <div className="mt-1 text-[9px] leading-4 text-slate-400">
              {fmtHoras(
                funcionalCosmeticaAnterior
              )}{" "}
              no mesmo período anterior.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              Cosmética → WMS ≤ 48h
            </div>

            <div className="mt-2 text-xl font-black text-violet-800">
              {fmtPercentual(
                cosmeticaWmsPctAte48
              )}
            </div>

            <div className="mt-1 text-[9px] leading-4 text-slate-400">
              {fmtNumero(
                cosmeticaWmsAte48
              )}{" "}
              aparelhos da amostra.
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
              Aguardando WMS
            </div>

            <div className="mt-2 text-xl font-black text-amber-700">
              {fmtNumero(
                cosmeticaWmsPendentes
              )}
            </div>

            <div className="mt-1 text-[9px] leading-4 text-slate-400">
              Cosméticas do período ainda sem confirmação de alocação.
            </div>
          </div>
        </div>

        {ehMesCorrente && (
          <div className="border-t border-slate-100 px-5 py-4">
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[10px] leading-4 text-violet-800">
                <strong>
                  {fmtNumero(
                    prioridadesMenor1h
                  )} casos abaixo de 1h
                </strong>{" "}
                permanecem normalmente no cálculo de Recebimento → Funcional.
                Desses,{" "}
                <strong>
                  {fmtNumero(
                    timestampsSimultaneos
                  )}
                </strong>{" "}
                possuem timestamp simultâneo.
              </div>

              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[10px] leading-4 text-amber-800">
                <strong>
                  Cosmética → Alocação WMS ainda não possui comparação histórica homogênea.
                </strong>{" "}
                O baseline do WMS começou em{" "}
                {fmtDataCurta(
                  baselineWmsInicio
                )}; portanto agosto contém implantação e absorção de backlog.
              </div>
            </div>
          </div>
        )}
      </Section>


      {/* ===================================================
          3. QUALIDADE
      =================================================== */}

      <Section
        index="03"
        title={`Qualidade do Inbound — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Distribuição das classificações cosméticas com participação percentual de cada grade."
      >
        <MetricStrip
          items={[
            {
              label:
                "Total classificado",

              value:
                fmtNumero(
                  totalGrades
                ),

              detail:
                "aparelhos com grade",
            },

            {
              label:
                "Quebrado + Regular",

              value:
                fmtNumero(
                  naoAlocaveis
                ),

              detail:
                fmtPercentual(
                  pctNaoAlocavel
                ),

              tone:
                "danger",
            },
          ]}
        />

        <div className="h-[350px] p-5">
          {gradesMes.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={
                  gradesMes
                }
                margin={{
                  top:
                    30,

                  right:
                    15,

                  left:
                    0,

                  bottom:
                    0,
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
                  dataKey="grade"
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

                <Tooltip
                  formatter={(
                    value,
                    name,
                    props
                  ) => {
                    if (
                      name ===
                      "Aparelhos"
                    ) {
                      return [
                        `${fmtNumero(
                          value
                        )} · ${fmtPercentual(
                          props?.payload?.percentual
                        )}`,
                        "Aparelhos",
                      ];
                    }

                    return [
                      value,
                      name,
                    ];
                  }}
                />

                <Bar
                  dataKey="aparelhos"
                  name="Aparelhos"
                  fill="#475569"
                  radius={[
                    5,
                    5,
                    0,
                    0,
                  ]}
                >
                  <LabelList
                    dataKey="percentual"
                    position="top"
                    formatter={(
                      value
                    ) =>
                      fmtPercentual(
                        value
                      )
                    }
                    style={{
                      fill:
                        "#475569",

                      fontSize:
                        10,

                      fontWeight:
                        800,
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState>
              Sem classificação cosmética disponível.
            </EmptyState>
          )}
        </div>
      </Section>


      {/* ===================================================
          4. B2B
      =================================================== */}

      <Section
        index="04"
        title={`Performance B2B — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle={`Entrada de pedidos, itens, faturamento e tempos entre etapas. Comparativos: ${textoComparacao}.`}
      >
        <MetricStrip
          items={[
            {
              label:
                "Pedidos",

              value:
                fmtNumero(
                  b2bResumo.pedidos
                ),

              detail:
                `${fmtVariacao(
                  b2bResumo.variacaoPedidos
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Itens recebidos",

              value:
                fmtNumero(
                  b2bResumo.itensRecebidos
                ),

              detail:
                `${fmtVariacao(
                  b2bResumo.variacaoItensRecebidos
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Itens faturados",

              value:
                fmtNumero(
                  b2bResumo.itensFaturados
                ),

              detail:
                `${fmtVariacao(
                  b2bResumo.variacaoItensFaturados
                )} · ${textoComparacao}`,

              tone:
                "good",
            },

            {
              label:
                "Notas emitidas",

              value:
                fmtNumero(
                  b2bResumo.notas
                ),

              detail:
                `${fmtVariacao(
                  b2bResumo.variacaoNotas
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Erros NF",

              value:
                fmtNumero(
                  b2bResumo.erros
                ),

              detail:
                `${fmtVariacao(
                  b2bResumo.variacaoErros
                )} · ${textoComparacao}`,

              tone:
                Number(
                  b2bResumo.erros ||
                    0
                ) >
                0
                  ? "danger"
                  : "good",
            },
          ]}
        />

        <div className="h-[320px] p-5">
          {b2bDiarioMes.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <ComposedChart
                data={
                  b2bDiarioMes
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
                  dataKey="label"
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
                  content={
                    <NumeroTooltip />
                  }
                />

                <Legend
                  wrapperStyle={{
                    fontSize:
                      "10px",
                  }}
                />

                <Bar
                  dataKey="itens_recebidos"
                  name="Itens recebidos"
                  fill="#DDD6FE"
                  radius={[
                    4,
                    4,
                    0,
                    0,
                  ]}
                />

                <Line
                  type="monotone"
                  dataKey="itens_faturados"
                  name="Itens faturados"
                  stroke="#059669"
                  strokeWidth={
                    2.5
                  }
                  dot={
                    false
                  }
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="erros_nf"
                  name="Erros NF"
                  stroke="#E11D48"
                  strokeWidth={
                    1.8
                  }
                  dot={
                    false
                  }
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState>
              Sem histórico diário B2B para este mês.
            </EmptyState>
          )}
        </div>

        <div className="border-t border-slate-100">
          <div className="px-5 py-4">
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
              Tempo entre etapas
            </div>

            <div className="mt-1 text-[10px] text-slate-400">
              Entrada pedido → Separação → Embalagem → Faturamento.
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Etapa
                  </th>

                  <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Média
                  </th>

                  <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Mediana
                  </th>

                  <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    P90
                  </th>

                  <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Registros
                  </th>

                  <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                    Δ Mediana
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {etapasB2B.map(
                  (
                    etapa
                  ) => (
                    <tr
                      key={
                        etapa.etapa
                      }
                    >
                      <td className="px-5 py-3 text-xs font-black text-slate-700">
                        {etapa.etapa}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                        {fmtDuracao(
                          etapa.media_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-black text-slate-800">
                        {fmtDuracao(
                          etapa.mediana_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                        {fmtDuracao(
                          etapa.p90_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                        {fmtNumero(
                          etapa.amostra
                        )}
                      </td>

                      <td className="px-5 py-3 text-right text-xs">
                        <VariacaoTexto
                          value={
                            etapa.variacao_mediana_pct
                          }
                          inverso
                        />
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Section>


      {/* ===================================================
          5. B2C
      =================================================== */}

      <Section
        index="05"
        title={`Performance B2C por Canal — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle={`Embalados operacionais = pagos menos cancelados. Mediana comparada por ${textoComparacao}. Expedição física proveniente dos romaneios.`}
      >
        <MetricStrip
          items={[
            {
              label:
                "Pagos",

              value:
                fmtNumero(
                  totalPagos
                ),

              detail:
                "pedidos pagos",
            },

            {
              label:
                "Embalados operacionais",

              value:
                fmtNumero(
                  totalEmbalados
                ),

              detail:
                "pagos menos cancelados",

              tone:
                "good",
            },

            {
              label:
                "Cancelados",

              value:
                fmtNumero(
                  totalCancelados
                ),

              detail:
                "cancelamentos do período",

              tone:
                totalCancelados >
                0
                  ? "warning"
                  : "good",
            },

            {
              label:
                "Coletas efetivas",

              value:
                fmtNumero(
                  totalColetas
                ),

              detail:
                "romaneios fechados com bipagem",
            },

            {
              label:
                "Volumes expedidos",

              value:
                fmtNumero(
                  volumesExpedidos
                ),

              detail:
                "bipagens na estação de saída",

              tone:
                "violet",
            },
          ]}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1350px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Marketplace
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Pagos
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Embalados
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Cancelados
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Coletas efetivas
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Ciclos válidos
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  ≤ 24h
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  SLA
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Mediana atual
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Mediana anterior
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Δ mediana
                </th>

                <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  P90
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {canaisMes.map(
                (
                  row
                ) => (
                  <tr
                    key={
                      row.marketplace
                    }
                    className="transition hover:bg-slate-50/70"
                  >
                    <td className="px-5 py-3 text-xs font-black text-slate-700">
                      {row.marketplace}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                      {fmtNumero(
                        row.pagos
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                      {fmtNumero(
                        row.embalados
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                      {fmtNumero(
                        row.cancelados
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                      {fmtNumero(
                        row.coletas
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                      {fmtNumero(
                        row.ciclos_validos
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                      {fmtNumero(
                        row.ate_24h
                      )}
                    </td>

                    <td
                      className={[
                        "px-3 py-3 text-right text-xs font-black",
                        Number(
                          row.pct_ate_24h ||
                            0
                        ) >=
                        90
                          ? "text-emerald-700"
                          : Number(
                                row.pct_ate_24h ||
                                  0
                              ) >=
                              80
                            ? "text-amber-700"
                            : "text-rose-700",
                      ].join(
                        " "
                      )}
                    >
                      {fmtPercentual(
                        row.pct_ate_24h
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-black text-slate-800">
                      {fmtHoras(
                        row.mediana_h
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-semibold text-slate-500">
                      {fmtHoras(
                        row.mediana_h_anterior
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs">
                      <VariacaoTexto
                        value={
                          row.variacao_mediana_pct
                        }
                        inverso
                      />
                    </td>

                    <td className="px-5 py-3 text-right text-xs font-black text-slate-700">
                      {fmtHoras(
                        row.p90_h
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <div className="grid gap-6 border-t border-slate-100 p-5 xl:grid-cols-2">
          <div>
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Distribuição dos ciclos
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Tempo Pago → Embalagem para ciclos que possuem os dois timestamps.
              </div>
            </div>

            <div className="h-[270px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    faixasB2CChart
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
                    dataKey="faixa"
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
                    content={
                      <NumeroTooltip />
                    }
                  />

                  <Bar
                    dataKey="pedidos"
                    name="Pedidos"
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
          </div>

          <div>
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Expedição física diária
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Todos os volumes bipados na estação dos romaneios de saída B2C.
              </div>
            </div>

            <div className="h-[270px]">
              {expedicaoMes.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <LineChart
                    data={
                      expedicaoMes
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
                      dataKey="label"
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
                      content={
                        <NumeroTooltip />
                      }
                    />

                    <Line
                      type="monotone"
                      dataKey="volumes"
                      name="Volumes bipados"
                      stroke="#6D28D9"
                      strokeWidth={
                        2.5
                      }
                      dot={{
                        r:
                          2.5,
                      }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>
                  Sem bipagens de romaneio para este mês.
                </EmptyState>
              )}
            </div>
          </div>
        </div>
      </Section>


      {/* ===================================================
          6. TEMPOS OPERACIONAIS
      =================================================== */}

      <Section
        index="06"
        title="Tempos Operacionais B2C & B2B"
        subtitle="Tempos construídos diretamente sobre as etapas efetivas do processo, sem separar Picking e Separação artificialmente."
        action={
          <div className="flex flex-wrap gap-2">
            <ToggleButton
              active={
                canalTempos ===
                "B2C"
              }
              onClick={() =>
                setCanalTempos(
                  "B2C"
                )
              }
            >
              B2C
            </ToggleButton>

            <ToggleButton
              active={
                canalTempos ===
                "B2B"
              }
              onClick={() =>
                setCanalTempos(
                  "B2B"
                )
              }
            >
              B2B
            </ToggleButton>
          </div>
        }
      >
        <MetricStrip
          items={[
            {
              label:
                "Pedidos",

              value:
                fmtNumero(
                  resumoTempos?.pedidos_atual
                ),

              detail:
                `${fmtVariacao(
                  resumoTempos?.variacao_pedidos_pct
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Itens",

              value:
                fmtNumero(
                  resumoTempos?.itens_atual
                ),

              detail:
                `${fmtVariacao(
                  resumoTempos?.variacao_itens_pct
                )} · ${textoComparacao}`,
            },

            {
              label:
                "Conclusão",

              value:
                fmtPercentual(
                  resumoTempos?.pct_concluidos_atual
                ),

              detail:
                `${
                  resumoTempos?.variacao_conclusao_pp !=
                  null
                    ? `${fmtNumero(
                        resumoTempos.variacao_conclusao_pp,
                        1
                      )} p.p.`
                    : "—"
                }`,
            },

            {
              label:
                "Lead time",

              value:
                fmtDuracao(
                  resumoTempos?.mediana_leadtime_atual_min
                ),

              detail:
                `${fmtVariacao(
                  resumoTempos?.variacao_mediana_leadtime_pct
                )} · ${textoComparacao}`,

              tone:
                Number(
                  resumoTempos?.variacao_mediana_leadtime_pct ||
                    0
                ) >
                0
                  ? "danger"
                  : "good",
            },

            {
              label:
                "P90",

              value:
                fmtDuracao(
                  resumoTempos?.p90_leadtime_atual_min
                ),

              detail:
                "cauda operacional",
            },

            {
              label:
                "Amostra ponta a ponta",

              value:
                fmtNumero(
                  resumoTempos?.amostra_leadtime_atual
                ),

              detail:
                "pedidos com ciclo completo",
            },
          ]}
        />

        <div className="overflow-x-auto border-b border-slate-100">
          <table className="w-full min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Etapa
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Média
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Mediana
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Mediana anterior
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  P90
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Registros
                </th>

                <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Variação
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {etapasAtuais.map(
                (
                  etapa
                ) => {
                  const definicao =
                    normalizarTexto(
                      etapa.etapa
                    ).includes(
                      "AGUARDANDO DEFINICAO"
                    );

                  return (
                    <tr
                      key={`${canalTempos}-${etapa.etapa}`}
                      className={
                        definicao
                          ? "bg-violet-50/40"
                          : ""
                      }
                    >
                      <td className="px-5 py-3 text-xs font-black text-slate-700">
                        {etapa.etapa}

                        {definicao && (
                          <span className="ml-2 rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[8px] font-black uppercase text-violet-700">
                            etapa excepcional
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                        {fmtDuracao(
                          etapa.media_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-black text-slate-800">
                        {fmtDuracao(
                          etapa.mediana_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-500">
                        {fmtDuracao(
                          etapa.mediana_anterior_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                        {fmtDuracao(
                          etapa.p90_min
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                        {fmtNumero(
                          etapa.amostra
                        )}
                      </td>

                      <td className="px-5 py-3 text-right text-xs">
                        <VariacaoTexto
                          value={
                            etapa.variacao_mediana_pct
                          }
                          inverso
                        />
                      </td>
                    </tr>
                  );
                }
              )}
            </tbody>
          </table>
        </div>

        <div className="p-5">
          <div className="mb-3">
            <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
              Evolução semanal do lead time ponta a ponta
            </div>

            <div className="mt-1 text-[10px] text-slate-400">
              Comparativo de tendência entre B2C e B2B.
            </div>
          </div>

          <div className="h-[300px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <LineChart
                data={
                  evolucaoSemanal
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
                  dataKey="semana"
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
                    fmtDuracao(
                      value
                    )
                  }
                  width={
                    65
                  }
                />

                <Tooltip
                  content={
                    <TempoTooltip />
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
                  dataKey="B2C"
                  stroke="#6D28D9"
                  strokeWidth={
                    2.5
                  }
                  dot={{
                    r:
                      3,
                  }}
                  connectNulls
                />

                <Line
                  type="monotone"
                  dataKey="B2B"
                  stroke="#0F172A"
                  strokeWidth={
                    2.5
                  }
                  dot={{
                    r:
                      3,
                  }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Section>


      {/* ===================================================
          7. ERROS & RETRABALHOS
      =================================================== */}

      <Section
        index="07"
        title={`Erros & Retrabalhos — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Categorias exclusivas: cada cancelamento é contado somente no estágio mais avançado que atingiu."
      >
        <MetricStrip
          items={[
            {
              label:
                "Eventos de erro / retrabalho",

              value:
                fmtNumero(
                  totalErros
                ),

              detail:
                "somatório das categorias",

              tone:
                totalErros >
                0
                  ? "warning"
                  : "good",
            },
          ]}
        />

        <div className="h-[330px] p-5">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={
                errosChart
              }
              margin={{
                top:
                  15,

                right:
                  15,

                left:
                  0,

                bottom:
                  20,
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
                dataKey="categoria"
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

              <Tooltip
                content={
                  <NumeroTooltip />
                }
              />

              <Bar
                dataKey="valor"
                name="Eventos"
                fill="#E11D48"
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

        <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[9px] font-black uppercase text-slate-400">
                Falha integração
              </div>

              <div className="mt-1 text-lg font-black text-slate-900">
                {fmtNumero(
                  errosMes.falhas_integracao
                )}
              </div>

              <div className="mt-1 text-[9px] leading-4 text-slate-400">
                Falha registrada na integração do AnyMarket.
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[9px] font-black uppercase text-slate-400">
                Antes embalagem
              </div>

              <div className="mt-1 text-lg font-black text-slate-900">
                {fmtNumero(
                  errosMes.cancelados_marketplace
                )}
              </div>

              <div className="mt-1 text-[9px] leading-4 text-slate-400">
                Cancelado antes de concluir embalagem.
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[9px] font-black uppercase text-slate-400">
                Pós embalagem
              </div>

              <div className="mt-1 text-lg font-black text-slate-900">
                {fmtNumero(
                  errosMes.cancelados_pos_embalagem
                )}
              </div>

              <div className="mt-1 text-[9px] leading-4 text-slate-400">
                Cancelado após embalagem e antes do faturamento.
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[9px] font-black uppercase text-slate-400">
                Pós faturamento
              </div>

              <div className="mt-1 text-lg font-black text-slate-900">
                {fmtNumero(
                  errosMes.cancelados_pos_faturamento
                )}
              </div>

              <div className="mt-1 text-[9px] leading-4 text-slate-400">
                Cancelado depois de já existir faturamento.
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="text-[9px] font-black uppercase text-slate-400">
                Erro NF B2B
              </div>

              <div className="mt-1 text-lg font-black text-slate-900">
                {fmtNumero(
                  errosMes.erros_nf_b2b
                )}
              </div>

              <div className="mt-1 text-[9px] leading-4 text-slate-400">
                NF B2B com status ou motivo de erro.
              </div>
            </div>
          </div>
        </div>
      </Section>


      {/* ===================================================
          8. STOCK INTELLIGENCE
      =================================================== */}

      <Section
        index="08"
        title="Stock Intelligence"
        subtitle="Estoque atual, envelhecimento e investigação por faixa de aging, SKU, grade e IMEI."
        action={
          <button
            type="button"
            onClick={() =>
              abrirAgingEstoque(
                "Mais de 180 dias"
              )
            }
            className="inline-flex items-center gap-2 rounded-lg bg-slate-950 px-3 py-2 text-[10px] font-black text-white transition hover:bg-slate-800"
          >
            Abrir Aging

            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      >
        <MetricStrip
          items={[
            {
              label:
                "Estoque total",

              value:
                fmtNumero(
                  totalEstoque
                ),

              detail:
                "posição física atual",

              tone:
                "violet",
            },

            {
              label:
                "> 90 dias",

              value:
                fmtNumero(
                  mais90
                ),

              detail:
                fmtPercentual(
                  pctMais90
                ),

              tone:
                "warning",
            },

            {
              label:
                "IMEI inválido",

              value:
                fmtNumero(
                  estoqueQualidade.imei_invalido
                ),

              detail:
                "requer saneamento",

              tone:
                "danger",
            },

            {
              label:
                "Sem triagem",

              value:
                fmtNumero(
                  estoqueQualidade.sem_triagem
                ),

              detail:
                "sem vínculo de triagem",

              tone:
                "danger",
            },

            {
              label:
                "Íntegros",

              value:
                fmtNumero(
                  estoqueQualidade.integros
                ),

              detail:
                fmtPercentual(
                  pctIntegro
                ),

              tone:
                "good",
            },
          ]}
        />

        <div className="grid gap-6 p-5 xl:grid-cols-[1.1fr_0.9fr]">
          <div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  Aging do estoque
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  Clique em uma barra para investigar a composição.
                </div>
              </div>

              <Clock3 className="h-4 w-4 text-slate-300" />
            </div>

            <div className="h-[320px]">
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    estoqueAging
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
                    dataKey="faixa"
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

                  <Tooltip
                    content={
                      <NumeroTooltip />
                    }
                  />

                  <Bar
                    dataKey="aparelhos"
                    name="Aparelhos"
                    fill="#6D28D9"
                    radius={[
                      5,
                      5,
                      0,
                      0,
                    ]}
                    cursor="pointer"
                    onClick={(
                      payload
                    ) => {
                      const faixa =
                        payload?.faixa ||
                        payload?.payload?.faixa;

                      if (
                        faixa
                      ) {
                        abrirAgingEstoque(
                          faixa
                        );
                      }
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                  Subinventários
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  Maiores concentrações da posição atual.
                </div>
              </div>

              <Warehouse className="h-4 w-4 text-slate-300" />
            </div>

            <div className="h-[320px]">
              {estoquePosicao.length ? (
                <ResponsiveContainer
                  width="100%"
                  height="100%"
                >
                  <BarChart
                    data={
                      estoquePosicao.slice(
                        0,
                        12
                      )
                    }
                    layout="vertical"
                    margin={{
                      left:
                        25,

                      right:
                        15,
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
                      dataKey="subinventario"
                      width={
                        120
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
                        <NumeroTooltip />
                      }
                    />

                    <Bar
                      dataKey="aparelhos"
                      name="Aparelhos"
                      fill="#475569"
                      radius={[
                        0,
                        5,
                        5,
                        0,
                      ]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState>
                  Sem posição por subinventário.
                </EmptyState>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Fluxo de investigação
              </div>

              <div className="mt-1 text-[10px] text-slate-500">
                Cockpit → Aging → SKU / Grade → Vendas reais → Giro → Cobertura → Score → Recomendação de preço
              </div>
            </div>

            <div className="flex items-center gap-2 text-[9px] font-black text-slate-500">
              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                Cockpit
              </span>

              <ArrowRight className="h-3 w-3 text-slate-300" />

              <span className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-violet-700">
                Aging
              </span>

              <ArrowRight className="h-3 w-3 text-slate-300" />

              <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
                SKU Intelligence
              </span>
            </div>
          </div>
        </div>
      </Section>


      {/* ===================================================
          CRITÉRIOS
      =================================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex items-start gap-3">
          <Activity className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />

          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
              Critérios de leitura
            </div>

            <div className="mt-1 max-w-6xl text-[10px] leading-5 text-slate-500">
              O mês corrente é comparado com o mesmo intervalo disponível
              do mês anterior. Em Recebimento → Funcional, sábados e
              domingos são retirados do tempo transcorrido, enquanto casos
              abaixo de 1h permanecem na amostra. O Lead Time do Warehouse
              utiliza Recebimento → Funcional, Funcional → Cosmética e
              Cosmética → Alocação WMS. A última etapa cruza a triagem pelo
              Voucher com a confirmação física do Liquida System. Como o
              WMS passou a registrar a alocação a partir de 15/08, agosto
              ainda não é utilizado como benchmark homogêneo dessa etapa.
              No B2C, a visão operacional considera Entrada do Pedido →
              Separação → Faturamento; no B2B, Entrada do Pedido →
              Separação → Embalagem → Faturamento. Aguardando Definição é
              tratado como etapa excepcional independente. Coletas efetivas
              representam romaneios fechados com bipagem e a expedição
              representa as bipagens físicas realizadas na estação de
              romaneios.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}