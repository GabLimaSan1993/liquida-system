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
  Database,
  FileWarning,
  Gauge,
  Layers3,
  PackageCheck,
  RefreshCw,
  ShoppingCart,
  Target,
  Timer,
  TrendingDown,
  TrendingUp,
  Truck,
  Warehouse,
  Wrench,
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
    Number.isNaN(Number(value))
  ) {
    return "—";
  }

  return Number(value).toLocaleString(
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
    Number.isNaN(Number(value))
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
    Number.isNaN(Number(value))
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

function calcularVariacao(
  atual,
  anterior
) {
  const a =
    Number(atual);

  const b =
    Number(anterior);

  if (
    !Number.isFinite(a) ||
    !Number.isFinite(b) ||
    b === 0
  ) {
    return null;
  }

  return (
    (a - b) /
    b
  ) * 100;
}

function fmtDuracao(
  minutos
) {
  if (
    minutos == null ||
    Number.isNaN(Number(minutos))
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

function fmtHoras(
  horas
) {
  if (
    horas == null ||
    Number.isNaN(Number(horas))
  ) {
    return "—";
  }

  const valor =
    Number(horas);

  if (valor < 1) {
    return `${fmtNumero(
      valor * 60,
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
    Number(validos || 0);

  const qtdTotal =
    Number(total || 0);

  if (!qtdTotal) {
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
  )} • ${fmtNumero(
    percentual,
    1
  )}%`;
}

function fmtDataCurta(
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

function fmtMesLongo(
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
      Number(mes)
    ] || mes
  }/${ano}`;
}

function normalizarTexto(
  value
) {
  return String(
    value || ""
  )
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .trim()
    .toUpperCase();
}


/* =========================================================
   COMPONENTES VISUAIS
========================================================= */

function VariacaoBadge({
  value,
  inverso = false,
  sufixo = "%",
  neutro = false,
}) {
  if (
    value == null ||
    Number.isNaN(Number(value))
  ) {
    return (
      <span className="text-[10px] font-semibold text-slate-400">
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

  const semVariacao =
    numero === 0;

  const Icon =
    positivo
      ? ArrowUpRight
      : numero < 0
      ? ArrowDownRight
      : Activity;

  let classes =
    "bg-slate-100 text-slate-600";

  if (!neutro) {
    if (semVariacao) {
      classes =
        "bg-slate-100 text-slate-500";
    } else if (bom) {
      classes =
        "bg-emerald-50 text-emerald-700";
    } else {
      classes =
        "bg-rose-50 text-rose-700";
    }
  }

  return (
    <span
      className={`
        inline-flex items-center gap-1
        rounded-full px-2 py-1
        text-[10px] font-black
        ${classes}
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
  neutro = false,
  suffix = "%",
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
          <div className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-400">
            {title}
          </div>

          <div className="mt-2 text-[26px] font-black tracking-tight text-slate-900">
            {value}
          </div>

          <div className="mt-1 min-h-[30px] text-[10px] font-medium leading-4 text-slate-400">
            {subtitle}
          </div>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${cfg.icon}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>

      <div className="mt-3 border-t border-slate-100 pt-3">
        <VariacaoBadge
          value={
            variation
          }
          inverso={
            inverso
          }
          neutro={
            neutro
          }
          sufixo={
            suffix
          }
        />

        <span className="ml-2 text-[9px] text-slate-400">
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
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-black text-slate-800">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-1 text-[10px] leading-4 text-slate-400">
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
        text-[10px] font-black
        transition
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

function CanalButton({
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
        rounded-xl px-4 py-2
        text-[11px] font-black
        transition
        ${
          active
            ? "bg-[#211136] text-white shadow-sm"
            : "border border-slate-200 bg-white text-slate-500"
        }
      `}
    >
      {children}
    </button>
  );
}

function StatusBadge({
  children,
  type = "neutral",
}) {
  const classes = {
    neutral:
      "bg-slate-100 text-slate-600",

    good:
      "bg-emerald-50 text-emerald-700",

    warning:
      "bg-amber-50 text-amber-700",

    danger:
      "bg-rose-50 text-rose-700",

    violet:
      "bg-violet-50 text-violet-700",
  };

  return (
    <span
      className={`
        inline-flex rounded-full
        px-2 py-1 text-[9px] font-black
        ${classes[type]}
      `}
    >
      {children}
    </span>
  );
}


/* =========================================================
   TOOLTIP
========================================================= */

function TempoTooltip({
  active,
  payload,
  label,
  unidade = "min",
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
          (item) => (
            <div
              key={`${item.dataKey}-${item.name}`}
              className="flex min-w-[160px] items-center justify-between gap-4 text-[10px]"
            >
              <span className="font-semibold text-slate-500">
                {item.name}
              </span>

              <span className="font-black text-slate-800">
                {unidade ===
                "min"
                  ? fmtDuracao(
                      item.value
                    )
                  : fmtNumero(
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
   ETAPAS B2C / B2B
========================================================= */

function EtapaCard({
  etapa,
  totalBase,
}) {
  const variacao =
    Number(
      etapa
        ?.variacao_mediana_pct
    );

  const cobertura =
    totalBase > 0
      ? (
          Number(
            etapa.amostra ||
              0
          ) /
          Number(totalBase)
        ) *
        100
      : null;

  const baixaCobertura =
    cobertura != null &&
    cobertura < 20;

  const melhorou =
    Number.isFinite(
      variacao
    )
      ? variacao < 0
      : null;

  return (
    <div
      className={`
        rounded-xl border p-4
        ${
          baixaCobertura
            ? "border-amber-200 bg-amber-50/40"
            : "border-slate-200 bg-white"
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-black text-slate-700">
            {
              etapa.etapa
            }
          </div>

          <div className="mt-2 text-2xl font-black text-slate-900">
            {fmtDuracao(
              etapa.mediana_min
            )}
          </div>

          <div className="mt-1 text-[9px] uppercase tracking-wider text-slate-400">
            Mediana
          </div>
        </div>

        <div
          className={`
            flex h-9 w-9
            items-center justify-center
            rounded-xl
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

      {baixaCobertura && (
        <div className="mt-3">
          <StatusBadge type="warning">
            BAIXA COBERTURA HISTÓRICA
          </StatusBadge>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[8px] font-black uppercase text-slate-400">
            P90
          </div>

          <div className="mt-1 text-xs font-black text-slate-700">
            {fmtDuracao(
              etapa.p90_min
            )}
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 px-3 py-2">
          <div className="text-[8px] font-black uppercase text-slate-400">
            Registros válidos
          </div>

          <div className="mt-1 text-xs font-black text-slate-700">
            {fmtNumero(
              etapa.amostra
            )}
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="text-[9px] text-slate-400">
          Cobertura
        </span>

        <span className="text-[10px] font-black text-slate-700">
          {cobertura != null
            ? fmtPercentual(
                cobertura
              )
            : "—"}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[9px] text-slate-400">
          Variação
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
   BARRA HORIZONTAL SIMPLES
========================================================= */

function BarraLinha({
  label,
  value,
  max,
  detalhe,
}) {
  const percentual =
    max > 0
      ? Math.min(
          100,
          (
            Number(
              value || 0
            ) /
            max
          ) *
            100
        )
      : 0;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between gap-4">
        <div className="truncate text-[10px] font-bold text-slate-600">
          {label}
        </div>

        <div className="shrink-0 text-[10px] font-black text-slate-800">
          {fmtNumero(
            value
          )}

          {detalhe && (
            <span className="ml-1 font-medium text-slate-400">
              {detalhe}
            </span>
          )}
        </div>
      </div>

      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full bg-[#4C1D95]"
          style={{
            width: `${percentual}%`,
          }}
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

      operacaoDiaria: [],
      operacaoMensal: [],
      leadtimeTriagemMensal: [],
      filasAtuais: [],
      gradesMensais: [],

      b2bOperacaoDiaria: [],
      b2bOperacaoMensal: [],

      b2cCanaisMensal: [],
      b2cCanaisFaixasMensal: [],
      expedicaoDiaria: [],

      ocorrenciasMensais: [],
      errosProcessoMensais: [],

      estoquePosicaoAtual: [],
      estoqueAgingAtual: [],
      estoqueQualidadeAtual: {},
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

  const [
    mesSelecionado,
    setMesSelecionado,
  ] =
    useState("");


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
     MESES DISPONÍVEIS
  ======================================================= */

  const mesesDisponiveis =
    useMemo(() => {
      const meses =
        new Set();

      const fontes = [
        dados.operacaoMensal,
        dados.kpisMensais,
        dados.gradesMensais,
        dados.b2bOperacaoMensal,
        dados.b2cCanaisMensal,
        dados.ocorrenciasMensais,
        dados.errosProcessoMensais,
      ];

      fontes.forEach(
        (fonte) => {
          (
            fonte || []
          ).forEach(
            (row) => {
              const valor =
                row.mes ||
                row.periodo_inicio;

              if (valor) {
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
    }, [
      dados,
    ]);

  useEffect(() => {
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
  }, [
    mesesDisponiveis,
    mesSelecionado,
  ]);

  const indiceMesAtual =
    mesesDisponiveis.indexOf(
      mesSelecionado
    );

  const mesAnterior =
    indiceMesAtual > 0
      ? mesesDisponiveis[
          indiceMesAtual -
            1
        ]
      : null;


  /* =======================================================
     COMPARATIVO EXECUTIVO B2C / B2B
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
      dados.comparativoAtual,
      granularidade,
    ]);

  const atualB2C =
    comparativos.find(
      (item) =>
        item.canal ===
        "B2C"
    ) || null;

  const atualB2B =
    comparativos.find(
      (item) =>
        item.canal ===
        "B2B"
    ) || null;

  const atual =
    canal === "B2C"
      ? atualB2C
      : atualB2B;


  /* =======================================================
     WAREHOUSE MENSAL
  ======================================================= */

  const operacaoMes =
    (
      dados.operacaoMensal ||
      []
    ).find(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) || {};

  const operacaoMesAnterior =
    (
      dados.operacaoMensal ||
      []
    ).find(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesAnterior
    ) || {};

  const operacaoDiariaMes =
    (
      dados.operacaoDiaria ||
      []
    ).filter(
      (row) =>
        String(
          row.dia
        ).slice(
          0,
          7
        ) ===
        String(
          mesSelecionado
        ).slice(
          0,
          7
        )
    )
    .map(
      (row) => ({
        ...row,
        label:
          fmtDataCurta(
            row.dia
          ),
      })
    );


  /* =======================================================
     LEAD TIME WAREHOUSE
  ======================================================= */

  const leadtimeWarehouse =
    (
      dados
        .leadtimeTriagemMensal ||
      []
    ).find(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) || {};


  /* =======================================================
     FILAS
  ======================================================= */

  const filasOrdenadas =
    useMemo(() => {
      return [
        ...(dados
          .filasAtuais ||
          []),
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
      );
    }, [
      dados.filasAtuais,
    ]);

  const maxFila =
    Math.max(
      1,
      ...filasOrdenadas.map(
        (item) =>
          Number(
            item.aparelhos ||
              0
          )
      )
    );


  /* =======================================================
     GRADES / QUALIDADE
  ======================================================= */

  const gradesMes =
    (
      dados.gradesMensais ||
      []
    ).filter(
      (row) =>
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
        const grade =
          normalizarTexto(
            row.grade
          );

        const naoAlocavel =
          grade.includes(
            "QUEBRAD"
          ) ||
          grade.includes(
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
    totalGrades > 0
      ? (
          naoAlocaveis /
          totalGrades
        ) *
        100
      : null;

  const maxGrade =
    Math.max(
      1,
      ...gradesMes.map(
        (row) =>
          Number(
            row.aparelhos ||
              0
          )
      )
    );


  /* =======================================================
     B2B
  ======================================================= */

  const b2bMes =
    (
      dados
        .b2bOperacaoMensal ||
      []
    ).find(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) || {};

  const b2bMesAnterior =
    (
      dados
        .b2bOperacaoMensal ||
      []
    ).find(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesAnterior
    ) || {};


  /* =======================================================
     B2C CANAIS
  ======================================================= */

  const canaisMes =
    (
      dados
        .b2cCanaisMensal ||
      []
    ).filter(
      (row) =>
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
    );

  const faixasMes =
    (
      dados
        .b2cCanaisFaixasMensal ||
      []
    ).filter(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    );

  const expedicaoMes =
    (
      dados.expedicaoDiaria ||
      []
    ).filter(
      (row) =>
        String(
          row.dia
        ).slice(
          0,
          7
        ) ===
        String(
          mesSelecionado
        ).slice(
          0,
          7
        )
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
        (row) =>
          String(
            row.dia
          ).slice(
            0,
            10
          )
      )
    ).size;

  const mediaExpedicao =
    diasExpedicao > 0
      ? expedidosMes /
        diasExpedicao
      : 0;


  /* =======================================================
     OCORRÊNCIAS
  ======================================================= */

  const ocorrenciasMes =
    (
      dados
        .ocorrenciasMensais ||
      []
    ).filter(
      (row) =>
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

  const maxOcorrencia =
    Math.max(
      1,
      ...ocorrenciasMes.map(
        (row) =>
          Number(
            row.ocorrencias ||
              0
          )
      )
    );


  /* =======================================================
     ERROS
  ======================================================= */

  const errosMes =
    (
      dados
        .errosProcessoMensais ||
      []
    ).find(
      (row) =>
        String(
          row.mes
        ).slice(
          0,
          10
        ) ===
        mesSelecionado
    ) || {};


  /* =======================================================
     ESTOQUE
  ======================================================= */

  const estoqueQualidade =
    dados
      .estoqueQualidadeAtual ||
    {};

  const estoquePosicao =
    [
      ...(dados
        .estoquePosicaoAtual ||
        []),
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
    );

  const estoqueAging =
    dados
      .estoqueAgingAtual ||
    [];

  const maxEstoque =
    Math.max(
      1,
      ...estoquePosicao.map(
        (row) =>
          Number(
            row.aparelhos ||
              0
          )
      )
    );

  const maxAging =
    Math.max(
      1,
      ...estoqueAging.map(
        (row) =>
          Number(
            row.aparelhos ||
              0
          )
      )
    );

  const pctMais90 =
    Number(
      estoqueQualidade
        .total_estoque ||
        0
    ) > 0
      ? (
          Number(
            estoqueQualidade
              .mais_90_dias ||
              0
          ) /
          Number(
            estoqueQualidade
              .total_estoque
          )
        ) *
        100
      : null;

  const pctIntegro =
    Number(
      estoqueQualidade
        .total_estoque ||
        0
    ) > 0
      ? (
          Number(
            estoqueQualidade
              .integros ||
              0
          ) /
          Number(
            estoqueQualidade
              .total_estoque
          )
        ) *
        100
      : null;


  /* =======================================================
     ETAPAS B2C / B2B
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
    useMemo(() => {
      const periodos =
        (
          etapasFonte ||
          []
        )
          .filter(
            (item) =>
              item.canal ===
              canal
          )
          .map(
            (item) =>
              item.periodo_inicio
          )
          .sort()
          .reverse();

      return (
        periodos[0] ||
        null
      );
    }, [
      etapasFonte,
      canal,
    ]);

  const etapasAtuais =
    (
      etapasFonte ||
      []
    ).filter(
      (item) =>
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
      (item) =>
        item.canal ===
          canal &&
        item.periodo_inicio ===
          periodoEtapaAtual
    ) || {};

  const totalBaseEtapa =
    Number(
      kpiPeriodoEtapa
        .itens ||
        0
    );

  const etapaBaixaCobertura =
    (
      etapa
    ) => {
      if (
        !totalBaseEtapa
      ) {
        return false;
      }

      return (
        Number(
          etapa.amostra ||
            0
        ) /
        totalBaseEtapa
      ) *
        100 <
        20;
    };

  const gargalos =
    etapasAtuais
      .filter(
        (item) =>
          item
            .variacao_mediana_pct !=
            null &&
          Number(
            item
              .variacao_mediana_pct
          ) > 0 &&
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

  const sinaisBaixaCobertura =
    etapasAtuais.filter(
      etapaBaixaCobertura
    );


  /* =======================================================
     EVOLUÇÃO LEAD TIME B2C/B2B
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
    }, [
      dados.kpisSemanais,
    ]);


  /* =======================================================
     LOADING / ERRO
  ======================================================= */

  if (loading) {
    return (
      <div className="flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <RefreshCw className="mx-auto h-6 w-6 animate-spin text-[#4C1D95]" />

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

  if (error) {
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


  return (
    <div className="space-y-6 pb-10">

      {/* ===================================================
          HEADER
      =================================================== */}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#211136] text-white">
                <BarChart3 className="h-5 w-5" />
              </div>

              <div>
                <h1 className="text-xl font-black tracking-tight text-slate-900">
                  Cockpit Operacional
                </h1>

                <p className="mt-0.5 text-xs text-slate-400">
                  Liquida Preço · Assurant Warehouse
                </p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <StatusBadge type="violet">
                Base analítica · Ago/2026 → Set/2026
              </StatusBadge>

              <StatusBadge type="good">
                100% dos registros disponíveis
              </StatusBadge>

              <StatusBadge>
                Sem amostragem · Sem projeção
              </StatusBadge>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl bg-slate-100 p-1">
              {mesesDisponiveis.map(
                (mes) => (
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
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              <RefreshCw className="h-4 w-4" />

              Atualizar
            </button>
          </div>
        </div>
      </div>


      {/* ===================================================
          1. WAREHOUSE
      =================================================== */}

      <SectionCard
        title={`1. Recebimento & Produção — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Fluxo operacional desde entrada física até Oracle"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
          <KpiCard
            title="Recebidos"
            value={fmtNumero(
              operacaoMes.recebidos
            )}
            subtitle="Vouchers recebidos"
            variation={calcularVariacao(
              operacaoMes.recebidos,
              operacaoMesAnterior.recebidos
            )}
            neutro
            icon={
              Truck
            }
            accent="violet"
          />

          <KpiCard
            title="Triagem Funcional"
            value={fmtNumero(
              operacaoMes.funcional
            )}
            subtitle="Aparelhos processados"
            variation={calcularVariacao(
              operacaoMes.funcional,
              operacaoMesAnterior.funcional
            )}
            neutro
            icon={
              Wrench
            }
            accent="blue"
          />

          <KpiCard
            title="Triagem Cosmética"
            value={fmtNumero(
              operacaoMes.cosmetica
            )}
            subtitle="Classificações cosméticas"
            variation={calcularVariacao(
              operacaoMes.cosmetica,
              operacaoMesAnterior.cosmetica
            )}
            neutro
            icon={
              Layers3
            }
            accent="emerald"
          />

          <KpiCard
            title="Laudos"
            value={fmtNumero(
              operacaoMes.laudos
            )}
            subtitle="Laudos gerados"
            variation={calcularVariacao(
              operacaoMes.laudos,
              operacaoMesAnterior.laudos
            )}
            neutro
            icon={
              FileWarning
            }
            accent="amber"
          />

          <KpiCard
            title="Entrada Oracle"
            value={fmtNumero(
              operacaoMes.oracle
            )}
            subtitle="Entradas registradas"
            variation={calcularVariacao(
              operacaoMes.oracle,
              operacaoMesAnterior.oracle
            )}
            neutro
            icon={
              Database
            }
            accent="slate"
          />

          <KpiCard
            title="Déficit Entrada → Funcional"
            value={fmtNumero(
              operacaoMes
                .deficit_recebimento_funcional
            )}
            subtitle={`Pico diário: ${fmtNumero(
              operacaoMes
                .maior_entrada_dia
            )}`}
            variation={null}
            icon={
              AlertTriangle
            }
            accent="rose"
          />
        </div>

        <div className="border-t border-slate-100 p-5">
          <div className="mb-4">
            <div className="text-xs font-black text-slate-700">
              Produção diária
            </div>

            <div className="mt-1 text-[10px] text-slate-400">
              Recebimento, funcional e cosmética
            </div>
          </div>

          <div className="h-[290px]">
            <ResponsiveContainer
              width="100%"
              height="100%"
            >
              <BarChart
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
                    fontSize: 9,
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
                    fontSize: 9,
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
                    <TempoTooltip unidade="numero" />
                  }
                />

                <Legend
                  wrapperStyle={{
                    fontSize:
                      "10px",
                  }}
                />

                <Bar
                  dataKey="recebidos"
                  name="Recebidos"
                  fill="#6D28D9"
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                />

                <Bar
                  dataKey="funcional"
                  name="Funcional"
                  fill="#475569"
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                />

                <Bar
                  dataKey="cosmetica"
                  name="Cosmética"
                  fill="#94A3B8"
                  radius={[
                    3,
                    3,
                    0,
                    0,
                  ]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </SectionCard>


      {/* ===================================================
          2. LEAD TIME WAREHOUSE
      =================================================== */}

      <SectionCard
        title="2. Lead Time do Warehouse"
        subtitle="Medianas das etapas de triagem e entrada Oracle"
      >
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Recebimento → Funcional"
            value={fmtHoras(
              leadtimeWarehouse
                .receb_funcional_h
            )}
            subtitle="Mediana"
            icon={
              Clock3
            }
            accent="violet"
          />

          <KpiCard
            title="Funcional → Cosmética"
            value={fmtHoras(
              leadtimeWarehouse
                .funcional_cosmetica_h
            )}
            subtitle="Mediana"
            icon={
              Clock3
            }
            accent="blue"
          />

          <KpiCard
            title="Funcional → Laudo"
            value={fmtHoras(
              leadtimeWarehouse
                .funcional_laudo_h
            )}
            subtitle="Mediana"
            icon={
              Clock3
            }
            accent="amber"
          />

          <KpiCard
            title="Cosmética → Oracle"
            value={fmtHoras(
              leadtimeWarehouse
                .cosmetica_oracle_h
            )}
            subtitle="Mediana"
            icon={
              Clock3
            }
            accent="emerald"
          />

          <KpiCard
            title="Ponta a ponta"
            value={fmtHoras(
              leadtimeWarehouse
                .ponta_a_ponta_h
            )}
            subtitle={`Registros válidos: ${fmtNumero(
              leadtimeWarehouse
                .aparelhos
            )}`}
            icon={
              Gauge
            }
            accent="rose"
          />
        </div>

        {Number(
          leadtimeWarehouse
            .excluidos_tempo_zero ||
            0
        ) > 0 && (
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-[10px] text-amber-800">
            <strong>
              Transparência:
            </strong>{" "}
            {fmtNumero(
              leadtimeWarehouse
                .excluidos_tempo_zero
            )} registros de Recebimento → Funcional com intervalo inferior a 1h foram identificados separadamente para não distorcer a mediana operacional.
          </div>
        )}
      </SectionCard>


      {/* ===================================================
          3. FILAS
      =================================================== */}

      <SectionCard
        title="3. Filas Operacionais"
        subtitle="Posição atual da operação por status"
      >
        <div className="grid gap-5 p-5 xl:grid-cols-2">
          <div className="space-y-4">
            {filasOrdenadas
              .slice(
                0,
                10
              )
              .map(
                (item) => (
                  <BarraLinha
                    key={
                      item.etapa
                    }
                    label={
                      item.etapa
                    }
                    value={
                      item.aparelhos
                    }
                    max={
                      maxFila
                    }
                  />
                )
              )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-xs font-black text-slate-700">
              Leitura operacional
            </div>

            <div className="mt-4 space-y-3">
              {filasOrdenadas
                .slice(
                  0,
                  5
                )
                .map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={`fila-${item.etapa}`}
                      className="flex items-center justify-between rounded-lg bg-white px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-50 text-[9px] font-black text-violet-700">
                          {index +
                            1}
                        </div>

                        <span className="text-[10px] font-bold text-slate-600">
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
      </SectionCard>


      {/* ===================================================
          4. QUALIDADE INBOUND
      =================================================== */}

      <SectionCard
        title="4. Qualidade do Inbound"
        subtitle={`Distribuição cosmética • ${fmtMesLongo(
          mesSelecionado
        )}`}
      >
        <div className="grid gap-5 p-5 xl:grid-cols-[1.6fr_1fr]">
          <div className="space-y-4">
            {gradesMes.map(
              (item) => (
                <BarraLinha
                  key={
                    item.grade
                  }
                  label={
                    item.grade
                  }
                  value={
                    item.aparelhos
                  }
                  max={
                    maxGrade
                  }
                  detalhe={
                    totalGrades >
                    0
                      ? `• ${fmtPercentual(
                          (
                            Number(
                              item.aparelhos
                            ) /
                            totalGrades
                          ) *
                            100
                        )}`
                      : ""
                  }
                />
              )
            )}
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-[9px] font-black uppercase text-slate-400">
                Total classificado
              </div>

              <div className="mt-2 text-3xl font-black text-slate-900">
                {fmtNumero(
                  totalGrades
                )}
              </div>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
              <div className="text-[9px] font-black uppercase text-rose-500">
                Quebrado + Regular
              </div>

              <div className="mt-2 text-3xl font-black text-rose-800">
                {fmtPercentual(
                  pctNaoAlocavel
                )}
              </div>

              <div className="mt-1 text-[10px] text-rose-600">
                {fmtNumero(
                  naoAlocaveis
                )} aparelhos classificados
              </div>
            </div>
          </div>
        </div>
      </SectionCard>


      {/* ===================================================
          5. B2B
      =================================================== */}

      <SectionCard
        title={`5. Performance B2B — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Entrada de pedidos, separação e faturamento"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Pedidos recebidos"
            value={fmtNumero(
              b2bMes
                .pedidos_recebidos
            )}
            subtitle="Pedidos B2B"
            variation={calcularVariacao(
              b2bMes
                .pedidos_recebidos,
              b2bMesAnterior
                .pedidos_recebidos
            )}
            neutro
            icon={
              PackageCheck
            }
            accent="violet"
          />

          <KpiCard
            title="Itens recebidos"
            value={fmtNumero(
              b2bMes
                .itens_recebidos
            )}
            subtitle="Volume contratado"
            variation={calcularVariacao(
              b2bMes
                .itens_recebidos,
              b2bMesAnterior
                .itens_recebidos
            )}
            neutro
            icon={
              Boxes
            }
            accent="blue"
          />

          <KpiCard
            title="Itens faturados"
            value={fmtNumero(
              b2bMes
                .itens_faturados
            )}
            subtitle="Itens com faturamento"
            variation={calcularVariacao(
              b2bMes
                .itens_faturados,
              b2bMesAnterior
                .itens_faturados
            )}
            neutro
            icon={
              CheckCircle2
            }
            accent="emerald"
          />

          <KpiCard
            title="Notas emitidas"
            value={fmtNumero(
              b2bMes
                .notas_emitidas
            )}
            subtitle="NFs B2B"
            variation={calcularVariacao(
              b2bMes
                .notas_emitidas,
              b2bMesAnterior
                .notas_emitidas
            )}
            neutro
            icon={
              Database
            }
            accent="slate"
          />

          <KpiCard
            title="Erros de NF"
            value={fmtNumero(
              b2bMes
                .erros_nf
            )}
            subtitle="Itens sinalizados"
            variation={calcularVariacao(
              b2bMes
                .erros_nf,
              b2bMesAnterior
                .erros_nf
            )}
            inverso
            icon={
              AlertTriangle
            }
            accent="rose"
          />
        </div>
      </SectionCard>


      {/* ===================================================
          6. B2C CANAIS
      =================================================== */}

      <SectionCard
        title={`6. Performance B2C por Canal — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Pagamento, processamento, cancelamentos e tempo de ciclo"
      >
        <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[9px] font-black uppercase text-slate-400">
              Expedidos
            </div>

            <div className="mt-2 text-3xl font-black text-slate-900">
              {fmtNumero(
                expedidosMes
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[9px] font-black uppercase text-slate-400">
              Dias com expedição
            </div>

            <div className="mt-2 text-3xl font-black text-slate-900">
              {fmtNumero(
                diasExpedicao
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="text-[9px] font-black uppercase text-slate-400">
              Média / dia expedido
            </div>

            <div className="mt-2 text-3xl font-black text-slate-900">
              {fmtNumero(
                mediaExpedicao,
                1
              )}
            </div>
          </div>

          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="text-[9px] font-black uppercase text-violet-500">
              Canais ativos
            </div>

            <div className="mt-2 text-3xl font-black text-violet-800">
              {fmtNumero(
                canaisMes.length
              )}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1050px]">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-5 py-3 text-left text-[9px] font-black uppercase text-slate-400">
                  Marketplace
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  Pagos
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  Embalados
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  Cancelados
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  Ciclos válidos
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  ≤ 24h
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  SLA ≤24h
                </th>

                <th className="px-3 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  Mediana
                </th>

                <th className="px-5 py-3 text-right text-[9px] font-black uppercase text-slate-400">
                  P90
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {canaisMes.map(
                (row) => (
                  <tr
                    key={
                      row.marketplace
                    }
                    className="hover:bg-slate-50"
                  >
                    <td className="px-5 py-3 text-xs font-black text-slate-700">
                      {row.marketplace}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtNumero(
                        row.pagos
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtNumero(
                        row.embalados
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtNumero(
                        row.cancelados
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtNumero(
                        row.ciclos_validos
                      )}
                    </td>

                    <td className="px-3 py-3 text-right text-xs font-bold text-slate-600">
                      {fmtNumero(
                        row.ate_24h
                      )}
                    </td>

                    <td className="px-3 py-3 text-right">
                      <StatusBadge
                        type={
                          Number(
                            row.pct_ate_24h ||
                              0
                          ) >=
                          90
                            ? "good"
                            : Number(
                                row.pct_ate_24h ||
                                  0
                              ) >=
                              80
                            ? "warning"
                            : "danger"
                        }
                      >
                        {fmtPercentual(
                          row.pct_ate_24h
                        )}
                      </StatusBadge>
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

        <div className="border-t border-slate-100 p-5">
          <div className="mb-4">
            <div className="text-xs font-black text-slate-700">
              Distribuição dos tempos de ciclo
            </div>

            <div className="mt-1 text-[10px] text-slate-400">
              Todos os ciclos com timestamps válidos
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {[
              "Até 12h",
              "12 a 24h",
              "24 a 48h",
              "Mais de 48h",
            ].map(
              (faixa) => {
                const total =
                  faixasMes
                    .filter(
                      (row) =>
                        normalizarTexto(
                          row.faixa
                        ) ===
                        normalizarTexto(
                          faixa
                        )
                    )
                    .reduce(
                      (
                        soma,
                        row
                      ) =>
                        soma +
                        Number(
                          row.pedidos ||
                            0
                        ),
                      0
                    );

                return (
                  <div
                    key={
                      faixa
                    }
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="text-[9px] font-black uppercase text-slate-400">
                      {faixa}
                    </div>

                    <div className="mt-2 text-2xl font-black text-slate-900">
                      {fmtNumero(
                        total
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </div>
      </SectionCard>


      {/* ===================================================
          7. TEMPOS B2C / B2B
      =================================================== */}

      <SectionCard
        title="7. Tempos Operacionais B2C & B2B"
        subtitle="Tempos reais por etapa, cobertura histórica e evolução"
        action={
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
            >
              B2C
            </CanalButton>

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
            >
              B2B
            </CanalButton>
          </div>
        }
      >
        <div className="border-b border-slate-100 p-5">
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
              neutro
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
              neutro
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
              suffix=" p.p."
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
              subtitle="90% dos ciclos válidos"
              variation={calcularVariacao(
                atual
                  ?.p90_leadtime_atual_min,
                atual
                  ?.p90_leadtime_anterior_min
              )}
              inverso
              icon={
                Target
              }
              accent="rose"
            />

            <KpiCard
              title="Registros válidos"
              value={fmtCobertura(
                atual
                  ?.amostra_leadtime_atual,
                atual
                  ?.pedidos_atual
              )}
              subtitle="Ciclos ponta a ponta calculáveis"
              variation={null}
              icon={
                Activity
              }
              accent="slate"
            />
          </div>

          <div className="mt-4 flex rounded-xl bg-slate-100 p-1">
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
        </div>

        <div className="grid gap-5 border-b border-slate-100 p-5 xl:grid-cols-[1.1fr_1.9fr]">
          <div>
            <div className="mb-3 flex rounded-xl bg-slate-100 p-1">
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

            <div className="text-[10px] text-slate-400">
              Base da cobertura:{" "}
              <strong className="text-slate-600">
                {fmtNumero(
                  totalBaseEtapa
                )} itens
              </strong>
            </div>

            {sinaisBaixaCobertura.length >
              0 && (
              <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="text-[9px] font-black uppercase text-amber-700">
                  Atenção à cobertura histórica
                </div>

                <div className="mt-2 space-y-1">
                  {sinaisBaixaCobertura.map(
                    (item) => (
                      <div
                        key={`baixa-${item.etapa}`}
                        className="text-[10px] text-amber-800"
                      >
                        • {item.etapa}:{" "}
                        {fmtNumero(
                          item.amostra
                        )} registros
                      </div>
                    )
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {etapasAtuais.map(
              (etapa) => (
                <EtapaCard
                  key={`${etapa.canal}-${etapa.etapa}`}
                  etapa={
                    etapa
                  }
                  totalBase={
                    totalBaseEtapa
                  }
                />
              )
            )}
          </div>
        </div>

        <div className="grid gap-5 p-5 xl:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="mb-4">
              <div className="text-xs font-black text-slate-700">
                Evolução semanal do lead time
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Mediana ponta a ponta
              </div>
            </div>

            <div className="h-[280px]">
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
                      fontSize: 9,
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
                      fontSize: 9,
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
                      r: 3,
                    }}
                    connectNulls
                  />

                  <Line
                    type="monotone"
                    dataKey="B2B"
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
          </div>

          <div>
            <div className="mb-4 text-xs font-black text-slate-700">
              Gargalos com cobertura representativa
            </div>

            {gargalos.length >
            0 ? (
              <div className="space-y-2">
                {gargalos.map(
                  (
                    item,
                    index
                  ) => (
                    <div
                      key={`gargalo-${item.etapa}`}
                      className="rounded-xl border border-rose-100 bg-rose-50/50 p-3"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <div className="text-[10px] font-black text-slate-700">
                            {index +
                              1}.{" "}
                            {item.etapa}
                          </div>

                          <div className="mt-1 text-[9px] text-slate-400">
                            {fmtDuracao(
                              item.mediana_min
                            )}
                          </div>
                        </div>

                        <div className="text-xs font-black text-rose-700">
                          {fmtVariacao(
                            item
                              .variacao_mediana_pct
                          )}
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-[10px] font-bold text-emerald-700">
                Nenhuma deterioração relevante com cobertura suficiente.
              </div>
            )}
          </div>
        </div>
      </SectionCard>


      {/* ===================================================
          8. OCORRÊNCIAS
      =================================================== */}

      <SectionCard
        title={`8. Venda sem Estoque & Ocorrências — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Problemas identificados durante alocação e atendimento dos pedidos"
      >
        <div className="grid gap-5 p-5 xl:grid-cols-[1.5fr_1fr]">
          <div className="space-y-4">
            {ocorrenciasMes.map(
              (item) => (
                <BarraLinha
                  key={
                    item.categoria
                  }
                  label={
                    item.categoria
                  }
                  value={
                    item.ocorrencias
                  }
                  max={
                    maxOcorrencia
                  }
                />
              )
            )}
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
            <div className="text-[9px] font-black uppercase tracking-wider text-amber-600">
              Total de ocorrências
            </div>

            <div className="mt-2 text-4xl font-black text-amber-900">
              {fmtNumero(
                totalOcorrencias
              )}
            </div>

            <div className="mt-2 text-[10px] leading-5 text-amber-800">
              Inclui ausência de estoque em lista, ausência física, divergências e ocorrências ainda não classificadas.
            </div>
          </div>
        </div>
      </SectionCard>


      {/* ===================================================
          9. ERROS
      =================================================== */}

      <SectionCard
        title={`9. Erros & Retrabalho — ${fmtMesLongo(
          mesSelecionado
        )}`}
        subtitle="Eventos sistêmicos e operacionais que geram exceção ou retrabalho"
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Falhas integração"
            value={fmtNumero(
              errosMes
                .falhas_integracao
            )}
            subtitle="Falhas identificadas"
            icon={
              AlertTriangle
            }
            accent="rose"
          />

          <KpiCard
            title="Cancelados marketplace"
            value={fmtNumero(
              errosMes
                .cancelados_marketplace
            )}
            subtitle="Pedidos cancelados"
            icon={
              FileWarning
            }
            accent="amber"
          />

          <KpiCard
            title="Cancelados pós embalagem"
            value={fmtNumero(
              errosMes
                .cancelados_pos_embalagem
            )}
            subtitle="Já processados fisicamente"
            icon={
              Boxes
            }
            accent="rose"
          />

          <KpiCard
            title="Cancelados pós faturamento"
            value={fmtNumero(
              errosMes
                .cancelados_pos_faturamento
            )}
            subtitle="Com faturamento registrado"
            icon={
              Database
            }
            accent="rose"
          />

          <KpiCard
            title="Erro NF B2B"
            value={fmtNumero(
              errosMes
                .erros_nf_b2b
            )}
            subtitle="Itens com erro de NF"
            icon={
              AlertTriangle
            }
            accent="rose"
          />
        </div>
      </SectionCard>


      {/* ===================================================
          10. ESTOQUE
      =================================================== */}

      <SectionCard
        title="10. Estoque & Aging"
        subtitle="Posição atual do estoque físico — fotografia do momento"
      >
        <div className="grid gap-4 border-b border-slate-100 p-5 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard
            title="Estoque total"
            value={fmtNumero(
              estoqueQualidade
                .total_estoque
            )}
            subtitle="Aparelhos na base de estoque"
            icon={
              Warehouse
            }
            accent="violet"
          />

          <KpiCard
            title="+90 dias"
            value={fmtNumero(
              estoqueQualidade
                .mais_90_dias
            )}
            subtitle={fmtPercentual(
              pctMais90
            )}
            icon={
              Clock3
            }
            accent="amber"
          />

          <KpiCard
            title="IMEI inválido"
            value={fmtNumero(
              estoqueQualidade
                .imei_invalido
            )}
            subtitle="Registros para saneamento"
            icon={
              AlertTriangle
            }
            accent="rose"
          />

          <KpiCard
            title="Sem triagem"
            value={fmtNumero(
              estoqueQualidade
                .sem_triagem
            )}
            subtitle="Sem vínculo na triagem"
            icon={
              FileWarning
            }
            accent="amber"
          />

          <KpiCard
            title="Íntegros"
            value={fmtNumero(
              estoqueQualidade
                .integros
            )}
            subtitle={fmtPercentual(
              pctIntegro
            )}
            icon={
              CheckCircle2
            }
            accent="emerald"
          />
        </div>

        <div className="grid gap-6 p-5 xl:grid-cols-2">
          <div>
            <div className="mb-4">
              <div className="text-xs font-black text-slate-700">
                Posição por subinventário
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Quantidade atual de aparelhos
              </div>
            </div>

            <div className="space-y-4">
              {estoquePosicao
                .slice(
                  0,
                  12
                )
                .map(
                  (item) => (
                    <BarraLinha
                      key={
                        item.subinventario
                      }
                      label={
                        item.subinventario
                      }
                      value={
                        item.aparelhos
                      }
                      max={
                        maxEstoque
                      }
                    />
                  )
                )}
            </div>
          </div>

          <div>
            <div className="mb-4">
              <div className="text-xs font-black text-slate-700">
                Aging do estoque
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Tempo em subinventário
              </div>
            </div>

            <div className="space-y-4">
              {estoqueAging.map(
                (item) => (
                  <BarraLinha
                    key={
                      item.faixa
                    }
                    label={
                      item.faixa
                    }
                    value={
                      item.aparelhos
                    }
                    max={
                      maxAging
                    }
                  />
                )
              )}
            </div>
          </div>
        </div>
      </SectionCard>


      {/* ===================================================
          RODAPÉ / QUALIDADE DO DADO
      =================================================== */}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />

          <div>
            <div className="text-xs font-black text-amber-900">
              Critérios de leitura dos indicadores
            </div>

            <div className="mt-2 max-w-6xl text-[10px] leading-5 text-amber-800">
              Todos os volumes utilizam 100% dos registros disponíveis de agosto e setembro.
              Tempos de processo são calculados somente quando os timestamps necessários existem e respeitam a cronologia válida.
              Etapas com cobertura histórica inferior a 20% são destacadas e não entram automaticamente no ranking de principais gargalos.
              A etiquetagem B2C ainda não possui timestamp exclusivo, portanto o intervalo Embalagem → Faturamento contempla esse período.
              Indicadores de estoque representam a posição atual e não uma fotografia histórica do mês selecionado.
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}