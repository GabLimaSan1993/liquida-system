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


function fmtCobertura(
  validos,
  total
) {
  const qtdValidos =
    Number(
      validos ||
        0
    );

  const qtdTotal =
    Number(
      total ||
        0
    );

  if (
    !qtdTotal
  ) {
    return "—";
  }

  const percentual =
    (
      qtdValidos /
      qtdTotal
    ) *
    100;

  return `${fmtNumero(
    qtdValidos
  )} de ${fmtNumero(
    qtdTotal
  )} · ${fmtNumero(
    percentual,
    1
  )}%`;
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
              <p className="mt-1 max-w-4xl text-[10px] leading-4 text-slate-400">
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

      filasAtuais:
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

      expedicaoDiaria:
        [],

      ocorrenciasMensais:
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
    granularidade,
    setGranularidade,
  ] =
    useState(
      "MTD"
    );

  const [
    canal,
    setCanal,
  ] =
    useState(
      "B2C"
    );

  const [
    visualizacaoEtapa,
    setVisualizacaoEtapa,
  ] =
    useState(
      "semanal"
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
          dados.ocorrenciasMensais,
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


  /* =======================================================
     COMPARATIVO EXECUTIVO
  ======================================================= */

  const comparativos =
    useMemo(
      () =>
        (
          dados.comparativoAtual ||
          []
        ).filter(
          (
            item
          ) =>
            item.granularidade ===
            granularidade
        ),
      [
        dados.comparativoAtual,
        granularidade,
      ]
    );

  const atualB2C =
    comparativos.find(
      (
        item
      ) =>
        item.canal ===
        "B2C"
    ) ||
    null;

  const atualB2B =
    comparativos.find(
      (
        item
      ) =>
        item.canal ===
        "B2B"
    ) ||
    null;

  const atual =
    canal ===
    "B2C"
      ? atualB2C
      : atualB2B;


  /* =======================================================
     WAREHOUSE
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

  const leadtimeEtapas =
    [
      {
        etapa:
          "Recebimento → Funcional",

        horas:
          Number(
            leadtimeWarehouse.receb_funcional_h ||
              0
          ),
      },

      {
        etapa:
          "Funcional → Cosmética",

        horas:
          Number(
            leadtimeWarehouse.funcional_cosmetica_h ||
              0
          ),
      },

      {
        etapa:
          "Funcional → Laudo",

        horas:
          Number(
            leadtimeWarehouse.funcional_laudo_h ||
              0
          ),
      },

      {
        etapa:
          "Cosmética → Oracle",

        horas:
          Number(
            leadtimeWarehouse.cosmetica_oracle_h ||
              0
          ),
      },

      {
        etapa:
          "Ponta a ponta",

        horas:
          Number(
            leadtimeWarehouse.ponta_a_ponta_h ||
              0
          ),
      },
    ];


  /* =======================================================
     FILAS
  ======================================================= */

  const filasOrdenadas =
    useMemo(
      () =>
        [
          ...(
            dados.filasAtuais ||
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
        dados.filasAtuais,
      ]
    );


  /* =======================================================
     QUALIDADE / GRADES
  ======================================================= */

  const gradesMes =
    useMemo(
      () =>
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
          )
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
     B2C
  ======================================================= */

  const canaisMes =
    useMemo(
      () =>
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
          )
          .sort(
            (
              a,
              b
            ) =>
              Number(
                b.pagos ||
                  0
              ) -
              Number(
                a.pagos ||
                  0
              )
          ),
      [
        dados.b2cCanaisMensal,
        mesSelecionado,
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
      () =>
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
        dados.expedicaoDiaria,
        prefixoMes,
      ]
    );

  const expedidosMes =
    expedicaoMes.reduce(
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
    );

  const diasExpedicao =
    new Set(
      expedicaoMes.map(
        (
          row
        ) =>
          String(
            row.dia
          ).slice(
            0,
            10
          )
      )
    ).size;

  const mediaExpedicao =
    diasExpedicao >
    0
      ? expedidosMes /
        diasExpedicao
      : 0;


  /* =======================================================
     OCORRÊNCIAS
  ======================================================= */

  const ocorrenciasMes =
    useMemo(
      () =>
        (
          dados.ocorrenciasMensais ||
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
          )
          .sort(
            (
              a,
              b
            ) =>
              Number(
                b.ocorrencias ||
                  0
              ) -
              Number(
                a.ocorrencias ||
                  0
              )
          ),
      [
        dados.ocorrenciasMensais,
        mesSelecionado,
      ]
    );

  const totalOcorrencias =
    ocorrenciasMes.reduce(
      (
        total,
        row
      ) =>
        total +
        Number(
          row.ocorrencias ||
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
          "Integração",

        valor:
          Number(
            errosMes.falhas_integracao ||
              0
          ),
      },

      {
        categoria:
          "Cancelado marketplace",

        valor:
          Number(
            errosMes.cancelados_marketplace ||
              0
          ),
      },

      {
        categoria:
          "Pós embalagem",

        valor:
          Number(
            errosMes.cancelados_pos_embalagem ||
              0
          ),
      },

      {
        categoria:
          "Pós faturamento",

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
     TEMPOS B2C / B2B
  ======================================================= */

  const etapasFonte =
    visualizacaoEtapa ===
    "semanal"
      ? dados.etapasSemanais
      : dados.etapasMensais;

  const kpisFonte =
    visualizacaoEtapa ===
    "semanal"
      ? dados.kpisSemanais
      : dados.kpisMensais;

  const periodoEtapaAtual =
    useMemo(
      () => {
        const periodos =
          (
            etapasFonte ||
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
              ) =>
                item.periodo_inicio
            )
            .sort()
            .reverse();

        return periodos[0] ||
          null;
      },
      [
        etapasFonte,
        canal,
      ]
    );

  const etapasAtuais =
    (
      etapasFonte ||
      []
    ).filter(
      (
        item
      ) =>
        item.canal ===
          canal &&
        item.periodo_inicio ===
          periodoEtapaAtual
    );

  const kpiPeriodoEtapa =
    (
      kpisFonte ||
      []
    ).find(
      (
        item
      ) =>
        item.canal ===
          canal &&
        item.periodo_inicio ===
          periodoEtapaAtual
    ) ||
    {};

  const totalBaseEtapa =
    Number(
      kpiPeriodoEtapa.itens ||
        0
    );

  function coberturaEtapa(
    etapa
  ) {
    if (
      !totalBaseEtapa
    ) {
      return null;
    }

    return (
      Number(
        etapa.amostra ||
          0
      ) /
      totalBaseEtapa
    ) *
      100;
  }

  function etapaBaixaCobertura(
    etapa
  ) {
    const cobertura =
      coberturaEtapa(
        etapa
      );

    return cobertura !=
      null &&
      cobertura <
        20;
  }

  const gargalos =
    etapasAtuais
      .filter(
        (
          item
        ) =>
          item.variacao_mediana_pct !=
            null &&
          Number(
            item.variacao_mediana_pct
          ) >
            0 &&
          !etapaBaixaCobertura(
            item
          )
      )
      .sort(
        (
          a,
          b
        ) =>
          Number(
            b.variacao_mediana_pct
          ) -
          Number(
            a.variacao_mediana_pct
          )
      )
      .slice(
        0,
        5
      );

  const sinaisBaixaCobertura =
    etapasAtuais.filter(
      etapaBaixaCobertura
    );

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
                  operacaoMes.recebidos
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    operacaoMes.recebidos,
                    operacaoMesAnterior.recebidos
                  )
                )} vs mês anterior`,

              tone:
                "violet",
            },

            {
              label:
                "Funcional",

              value:
                fmtNumero(
                  operacaoMes.funcional
                ),

              detail:
                `${fmtNumero(
                  operacaoMes.deficit_recebimento_funcional
                )} de déficit`,
            },

            {
              label:
                "B2C expedido",

              value:
                fmtNumero(
                  expedidosMes
                ),

              detail:
                `${fmtNumero(
                  mediaExpedicao,
                  1
                )} pedidos/dia`,

              tone:
                "good",
            },

            {
              label:
                "B2B faturado",

              value:
                fmtNumero(
                  b2bMes.itens_faturados
                ),

              detail:
                `${fmtNumero(
                  b2bMes.itens_recebidos
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
                "Lead time ponta a ponta",

              value:
                fmtHoras(
                  leadtimeWarehouse.ponta_a_ponta_h
                ),

              detail:
                `${fmtNumero(
                  leadtimeWarehouse.aparelhos
                )} registros válidos`,
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
        subtitle="Curva diária do fluxo físico, permitindo enxergar descompasso entre entrada, triagens, laudos e Oracle."
      >
        <MetricStrip
          items={[
            {
              label:
                "Recebidos",

              value:
                fmtNumero(
                  operacaoMes.recebidos
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    operacaoMes.recebidos,
                    operacaoMesAnterior.recebidos
                  )
                )} vs anterior`,
            },

            {
              label:
                "Funcional",

              value:
                fmtNumero(
                  operacaoMes.funcional
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    operacaoMes.funcional,
                    operacaoMesAnterior.funcional
                  )
                )} vs anterior`,
            },

            {
              label:
                "Cosmética",

              value:
                fmtNumero(
                  operacaoMes.cosmetica
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    operacaoMes.cosmetica,
                    operacaoMesAnterior.cosmetica
                  )
                )} vs anterior`,
            },

            {
              label:
                "Laudos",

              value:
                fmtNumero(
                  operacaoMes.laudos
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    operacaoMes.laudos,
                    operacaoMesAnterior.laudos
                  )
                )} vs anterior`,
            },

            {
              label:
                "Oracle",

              value:
                fmtNumero(
                  operacaoMes.oracle
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    operacaoMes.oracle,
                    operacaoMesAnterior.oracle
                  )
                )} vs anterior`,
            },

            {
              label:
                "Pico de entrada",

              value:
                fmtNumero(
                  operacaoMes.maior_entrada_dia
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
        subtitle="Comparação das medianas de cada transição do fluxo operacional."
      >
        <div className="grid gap-5 p-5 xl:grid-cols-[1.45fr_0.55fr]">
          <div className="h-[310px]">
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
                    35,

                  right:
                    20,
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
                      1
                    )}h`
                  }
                />

                <YAxis
                  type="category"
                  dataKey="etapa"
                  width={
                    150
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
                  formatter={(
                    value
                  ) => [
                    fmtHoras(
                      value
                    ),
                    "Mediana",
                  ]}
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
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-slate-200 bg-slate-50 p-5">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                Tempo ponta a ponta
              </div>

              <div className="mt-2 text-4xl font-black tracking-tight text-slate-950">
                {fmtHoras(
                  leadtimeWarehouse.ponta_a_ponta_h
                )}
              </div>

              <div className="mt-2 text-xs leading-5 text-slate-500">
                Mediana calculada sobre{" "}
                <strong className="text-slate-700">
                  {fmtNumero(
                    leadtimeWarehouse.aparelhos
                  )}
                </strong>{" "}
                registros válidos.
              </div>
            </div>

            {Number(
              leadtimeWarehouse.excluidos_tempo_zero ||
                0
            ) >
              0 && (
              <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-[10px] leading-4 text-amber-800">
                {fmtNumero(
                  leadtimeWarehouse.excluidos_tempo_zero
                )}{" "}
                registros inferiores a 1h foram segregados para não distorcer o tempo Recebimento → Funcional.
              </div>
            )}
          </div>
        </div>
      </Section>


      {/* ===================================================
          3. FILAS
      =================================================== */}

      <Section
        index="03"
        title="Filas Operacionais"
        subtitle="Concentração do backlog atual por estágio da operação."
      >
        <div className="grid gap-5 p-5 xl:grid-cols-[1.45fr_0.55fr]">
          <div className="h-[330px]">
            {filasOrdenadas.length ? (
              <ResponsiveContainer
                width="100%"
                height="100%"
              >
                <BarChart
                  data={
                    filasOrdenadas.slice(
                      0,
                      12
                    )
                  }
                  layout="vertical"
                  margin={{
                    left:
                      30,

                    right:
                      20,
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
                    dataKey="etapa"
                    width={
                      155
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
                    fill="#0F172A"
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
                Nenhuma fila operacional retornada.
              </EmptyState>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
              Maiores concentrações
            </div>

            <div className="mt-3 divide-y divide-slate-200">
              {filasOrdenadas
                .slice(
                  0,
                  6
                )
                .map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={`${item.etapa}-${index}`}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white text-[9px] font-black text-slate-500">
                          {index +
                            1}
                        </span>

                        <span className="truncate text-[10px] font-semibold text-slate-600">
                          {item.etapa}
                        </span>
                      </div>

                      <span className="text-xs font-black text-slate-900">
                        {fmtNumero(
                          item.aparelhos
                        )}
                      </span>
                    </div>
                  )
                )}
            </div>
          </div>
        </div>
      </Section>


      {/* ===================================================
          4. QUALIDADE
      =================================================== */}

      <Section
        index="04"
        title={`Qualidade do Inbound — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Distribuição das classificações cosméticas e exposição das grades de menor qualidade."
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

        <div className="h-[330px] p-5">
          {gradesMes.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={
                  gradesMes
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
                  content={
                    <NumeroTooltip />
                  }
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
                />
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
          5. B2B
      =================================================== */}

      <Section
        index="05"
        title={`Performance B2B — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Recebimento de demanda, volume de itens, faturamento e erros de nota ao longo do mês."
      >
        <MetricStrip
          items={[
            {
              label:
                "Pedidos",

              value:
                fmtNumero(
                  b2bMes.pedidos_recebidos
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    b2bMes.pedidos_recebidos,
                    b2bMesAnterior.pedidos_recebidos
                  )
                )} vs anterior`,
            },

            {
              label:
                "Itens recebidos",

              value:
                fmtNumero(
                  b2bMes.itens_recebidos
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    b2bMes.itens_recebidos,
                    b2bMesAnterior.itens_recebidos
                  )
                )} vs anterior`,
            },

            {
              label:
                "Itens faturados",

              value:
                fmtNumero(
                  b2bMes.itens_faturados
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    b2bMes.itens_faturados,
                    b2bMesAnterior.itens_faturados
                  )
                )} vs anterior`,

              tone:
                "good",
            },

            {
              label:
                "Notas emitidas",

              value:
                fmtNumero(
                  b2bMes.notas_emitidas
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    b2bMes.notas_emitidas,
                    b2bMesAnterior.notas_emitidas
                  )
                )} vs anterior`,
            },

            {
              label:
                "Erros NF",

              value:
                fmtNumero(
                  b2bMes.erros_nf
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    b2bMes.erros_nf,
                    b2bMesAnterior.erros_nf
                  )
                )} vs anterior`,

              tone:
                Number(
                  b2bMes.erros_nf ||
                    0
                ) >
                0
                  ? "danger"
                  : "good",
            },
          ]}
        />

        <div className="h-[330px] p-5">
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
      </Section>


      {/* ===================================================
          6. B2C
      =================================================== */}

      <Section
        index="06"
        title={`Performance B2C por Canal — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Pagamento, processamento, cancelamento, SLA e expedição por canal."
      >
        <MetricStrip
          items={[
            {
              label:
                "Expedidos",

              value:
                fmtNumero(
                  expedidosMes
                ),

              detail:
                "pedidos no mês",

              tone:
                "good",
            },

            {
              label:
                "Dias com expedição",

              value:
                fmtNumero(
                  diasExpedicao
                ),

              detail:
                "dias produtivos",
            },

            {
              label:
                "Média / dia",

              value:
                fmtNumero(
                  mediaExpedicao,
                  1
                ),

              detail:
                "pedidos por dia",
            },

            {
              label:
                "Canais ativos",

              value:
                fmtNumero(
                  canaisMes.length
                ),

              detail:
                "marketplaces",
            },
          ]}
        />

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
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
                  Ciclos válidos
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  ≤ 24h
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  SLA
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Mediana
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

                    <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                      {fmtHoras(
                        row.mediana_h
                      )}
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
                Faixas reais de tempo de processamento.
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
                Expedição diária
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Distribuição diária dos pedidos expedidos.
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
                      dataKey="pedidos"
                      name="Expedidos"
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
                  Sem expedição diária para este mês.
                </EmptyState>
              )}
            </div>
          </div>
        </div>
      </Section>


      {/* ===================================================
          7. TEMPOS B2C / B2B
      =================================================== */}

      <Section
        index="07"
        title="Tempos Operacionais B2C & B2B"
        subtitle="Mediana, P90, cobertura, evolução histórica e gargalos por etapa."
        action={
          <div className="flex flex-wrap gap-2">
            <ToggleButton
              active={
                canal ===
                "B2C"
              }
              onClick={() =>
                setCanal(
                  "B2C"
                )
              }
            >
              B2C
            </ToggleButton>

            <ToggleButton
              active={
                canal ===
                "B2B"
              }
              onClick={() =>
                setCanal(
                  "B2B"
                )
              }
            >
              B2B
            </ToggleButton>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
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
              Etapas semanais
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
              Etapas mensais
            </PeriodButton>
          </div>
        </div>

        <MetricStrip
          items={[
            {
              label:
                "Pedidos",

              value:
                fmtNumero(
                  atual?.pedidos_atual
                ),

              detail:
                `${fmtVariacao(
                  atual?.variacao_pedidos_pct
                )} vs anterior`,
            },

            {
              label:
                "Itens",

              value:
                fmtNumero(
                  atual?.itens_atual
                ),

              detail:
                `${fmtVariacao(
                  atual?.variacao_itens_pct
                )} vs anterior`,
            },

            {
              label:
                "Conclusão",

              value:
                fmtPercentual(
                  atual?.pct_concluidos_atual
                ),

              detail:
                `${
                  atual?.variacao_conclusao_pp !=
                  null
                    ? `${fmtNumero(
                        atual.variacao_conclusao_pp,
                        1
                      )} p.p.`
                    : "—"
                }`,

              tone:
                "good",
            },

            {
              label:
                "Lead time",

              value:
                fmtDuracao(
                  atual?.mediana_leadtime_atual_min
                ),

              detail:
                `${fmtVariacao(
                  atual?.variacao_mediana_leadtime_pct
                )} vs anterior`,

              tone:
                Number(
                  atual?.variacao_mediana_leadtime_pct ||
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
                  atual?.p90_leadtime_atual_min
                ),

              detail:
                `${fmtVariacao(
                  calcularVariacao(
                    atual?.p90_leadtime_atual_min,
                    atual?.p90_leadtime_anterior_min
                  )
                )} vs anterior`,
            },

            {
              label:
                "Cobertura",

              value:
                fmtCobertura(
                  atual?.amostra_leadtime_atual,
                  atual?.pedidos_atual
                ),

              detail:
                "ciclos calculáveis",
            },
          ]}
        />

        <div className="overflow-x-auto border-b border-slate-100">
          <table className="w-full min-w-[900px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Etapa
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

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">
                  Cobertura
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
                  const cobertura =
                    coberturaEtapa(
                      etapa
                    );

                  return (
                    <tr
                      key={`${etapa.canal}-${etapa.etapa}`}
                      className={
                        etapaBaixaCobertura(
                          etapa
                        )
                          ? "bg-amber-50/40"
                          : ""
                      }
                    >
                      <td className="px-5 py-3 text-xs font-black text-slate-700">
                        {etapa.etapa}

                        {etapaBaixaCobertura(
                          etapa
                        ) && (
                          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-black uppercase text-amber-700">
                            baixa cobertura
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
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

                      <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                        {fmtPercentual(
                          cobertura
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

        <div className="grid gap-6 p-5 xl:grid-cols-[1.5fr_0.5fr]">
          <div>
            <div className="mb-3">
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Evolução semanal do lead time
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Mediana ponta a ponta B2C × B2B.
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

          <div className="space-y-4">
            <div>
              <div className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                Gargalos
              </div>

              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-slate-50 px-3">
                {gargalos.length ? (
                  gargalos.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={`${item.etapa}-${index}`}
                        className="py-3"
                      >
                        <div className="text-[10px] font-black text-slate-700">
                          {index +
                            1}
                          .{" "}
                          {item.etapa}
                        </div>

                        <div className="mt-1 flex items-center justify-between gap-2">
                          <span className="text-[9px] text-slate-400">
                            {fmtDuracao(
                              item.mediana_min
                            )}
                          </span>

                          <span className="text-[10px] font-black text-rose-700">
                            {fmtVariacao(
                              item.variacao_mediana_pct
                            )}
                          </span>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="py-5 text-[10px] font-semibold text-emerald-700">
                    Sem deterioração relevante com cobertura suficiente.
                  </div>
                )}
              </div>
            </div>

            {sinaisBaixaCobertura.length >
              0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-[9px] font-black uppercase tracking-[0.1em] text-amber-700">
                  Cobertura insuficiente
                </div>

                <div className="mt-2 space-y-1.5">
                  {sinaisBaixaCobertura.map(
                    (
                      item
                    ) => (
                      <div
                        key={item.etapa}
                        className="text-[10px] text-amber-800"
                      >
                        {item.etapa} ·{" "}
                        {fmtNumero(
                          item.amostra
                        )}{" "}
                        registros
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>


      {/* ===================================================
          8. OCORRÊNCIAS
      =================================================== */}

      <Section
        index="08"
        title={`Venda sem Estoque & Ocorrências — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Concentração dos problemas identificados durante alocação e atendimento dos pedidos."
      >
        <MetricStrip
          items={[
            {
              label:
                "Total de ocorrências",

              value:
                fmtNumero(
                  totalOcorrencias
                ),

              detail:
                "eventos identificados",

              tone:
                totalOcorrencias >
                0
                  ? "warning"
                  : "good",
            },
          ]}
        />

        <div className="h-[330px] p-5">
          {ocorrenciasMes.length ? (
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
                data={
                  ocorrenciasMes.slice(
                    0,
                    12
                  )
                }
                layout="vertical"
                margin={{
                  left:
                    35,

                  right:
                    20,
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
                  dataKey="categoria"
                  width={
                    190
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
                  dataKey="ocorrencias"
                  name="Ocorrências"
                  fill="#F59E0B"
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
              Nenhuma ocorrência registrada no período.
            </EmptyState>
          )}
        </div>
      </Section>


      {/* ===================================================
          9. ERROS
      =================================================== */}

      <Section
        index="09"
        title={`Erros & Retrabalho — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Eventos sistêmicos e operacionais capazes de gerar exceção, cancelamento ou retrabalho."
      >
        <div className="h-[330px] p-5">
          <ResponsiveContainer
            width="100%"
            height="100%"
          >
            <BarChart
              data={
                errosChart
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
      </Section>


      {/* ===================================================
          10. STOCK INTELLIGENCE
      =================================================== */}

      <Section
        index="10"
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
              Todos os volumes utilizam os registros disponíveis no período analítico.
              Tempos de processo são calculados somente quando os timestamps necessários
              existem e respeitam a cronologia válida. Etapas com cobertura histórica
              inferior a 20% são sinalizadas e não entram automaticamente no ranking de
              gargalos. A etiquetagem B2C ainda não possui timestamp exclusivo, portanto
              o intervalo Embalagem → Faturamento contempla esse período. O estoque
              representa a posição física atual e não uma fotografia histórica do mês.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}