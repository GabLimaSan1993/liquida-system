import {
  useEffect,
  useMemo,
  useState,
} from "react";

import * as XLSX from "xlsx";

import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Clock3,
  Database,
  Download,
  FileSpreadsheet,
  Filter,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ServerCog,
  ShieldCheck,
  Zap,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";

import {
  listarAguardandoOracle,
  listarConfirmadosOracle,
  confirmarOracle,
} from "../../services/entradaOracleService.js";

const ABAS = [
  {
    key: "entrada",
    label: "Entrada no Oracle",
  },

  {
    key: "saida",
    label: "Saída no Oracle",
  },

  {
    key: "devolucao",
    label: "Devolução aguardando RI",
  },
];

const GRADES_ORACLE_FILTRO = [
  {
    codigo: 200,
    rotulo: "200 · Like New",
    ativo:
      "border-emerald-600 bg-emerald-600 text-white",
    inativo:
      "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50",
  },

  {
    codigo: 201,
    rotulo: "201 · Excelente",
    ativo:
      "border-blue-600 bg-blue-600 text-white",
    inativo:
      "border-blue-200 bg-white text-blue-700 hover:bg-blue-50",
  },

  {
    codigo: 202,
    rotulo: "202 · Muito Bom",
    ativo:
      "border-violet-700 bg-violet-700 text-white",
    inativo:
      "border-violet-200 bg-white text-violet-700 hover:bg-violet-50",
  },

  {
    codigo: 203,
    rotulo: "203 · Bom",
    ativo:
      "border-amber-500 bg-amber-500 text-white",
    inativo:
      "border-amber-200 bg-white text-amber-700 hover:bg-amber-50",
  },

  {
    codigo: 204,
    rotulo: "204 · Outlet",
    ativo:
      "border-orange-500 bg-orange-500 text-white",
    inativo:
      "border-orange-200 bg-white text-orange-700 hover:bg-orange-50",
  },

  {
    codigo: 4,
    rotulo: "4 · Regular",
    ativo:
      "border-slate-600 bg-slate-600 text-white",
    inativo:
      "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
  },

  {
    codigo: 5,
    rotulo: "5 · Quebrado",
    ativo:
      "border-rose-600 bg-rose-600 text-white",
    inativo:
      "border-rose-200 bg-white text-rose-700 hover:bg-rose-50",
  },

  {
    codigo: "sem",
    rotulo: "Sem código",
    ativo:
      "border-slate-400 bg-slate-400 text-white",
    inativo:
      "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
  },
];

function fmtNumber(value) {
  return Number(
    value || 0
  ).toLocaleString(
    "pt-BR"
  );
}

function dataHora(iso) {
  if (!iso) {
    return "—";
  }

  const date =
    new Date(iso);

  return date.toLocaleString(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }
  );
}

function Aviso({
  tipo = "ok",
  children,
}) {
  const config = {
    ok: {
      Icon:
        CheckCircle2,

      className:
        "border-emerald-200 bg-emerald-50 text-emerald-800",

      icon:
        "text-emerald-600",
    },

    aviso: {
      Icon:
        AlertTriangle,

      className:
        "border-amber-200 bg-amber-50 text-amber-800",

      icon:
        "text-amber-600",
    },

    erro: {
      Icon:
        AlertTriangle,

      className:
        "border-rose-200 bg-rose-50 text-rose-800",

      icon:
        "text-rose-600",
    },
  };

  const cfg =
    config[tipo] ||
    config.ok;

  const Icon =
    cfg.Icon;

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.className}`}
    >
      <Icon
        className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.icon}`}
      />

      <div className="text-xs font-semibold leading-5">
        {children}
      </div>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
  className = "",
}) {
  return (
    <section
      className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      {(title ||
        action) && (
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div className="flex items-start gap-3">
            {Icon && (
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Icon className="h-[17px] w-[17px]" />
              </div>
            )}

            <div>
              <h2 className="text-sm font-black text-slate-800">
                {title}
              </h2>

              {subtitle && (
                <p className="mt-0.5 text-[11px] leading-4 text-slate-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>

          {action}
        </div>
      )}

      {children}
    </section>
  );
}

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  variant = "violet",
  active = false,
  onClick,
}) {
  const config = {
    violet:
      "bg-violet-50 text-violet-700",

    amber:
      "bg-amber-50 text-amber-700",

    blue:
      "bg-blue-50 text-blue-700",

    emerald:
      "bg-emerald-50 text-emerald-700",
  };

  const Component =
    onClick
      ? "button"
      : "div";

  return (
    <Component
      type={
        onClick
          ? "button"
          : undefined
      }
      onClick={
        onClick
      }
      className={`
        w-full rounded-2xl border bg-white p-5 text-left shadow-sm transition
        ${
          active
            ? "border-violet-400 ring-4 ring-violet-100"
            : "border-slate-200"
        }
        ${
          onClick
            ? "hover:border-violet-300 hover:shadow-md"
            : ""
        }
      `}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold text-slate-500">
            {label}
          </div>

          <div className="mt-2 text-[28px] font-black tracking-tight text-slate-900">
            {value}
          </div>

          <div className="mt-1 text-[11px] text-slate-400">
            {helper}
          </div>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
            config[
              variant
            ]
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </Component>
  );
}

function OracleBadge({
  valor,
}) {
  if (
    valor == null
  ) {
    return (
      <span className="inline-flex rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-400">
        —
      </span>
    );
  }

  const styles = {
    200:
      "bg-emerald-50 text-emerald-700 ring-emerald-200",

    201:
      "bg-blue-50 text-blue-700 ring-blue-200",

    202:
      "bg-violet-50 text-violet-700 ring-violet-200",

    203:
      "bg-amber-50 text-amber-700 ring-amber-200",

    204:
      "bg-orange-50 text-orange-700 ring-orange-200",

    4:
      "bg-slate-100 text-slate-700 ring-slate-200",

    5:
      "bg-rose-50 text-rose-700 ring-rose-200",
  };

  return (
    <span
      className={`inline-flex min-w-[38px] justify-center rounded-lg px-2 py-1 text-[10px] font-black ring-1 ${
        styles[valor] ||
        "bg-slate-100 text-slate-600 ring-slate-200"
      }`}
    >
      {valor}
    </span>
  );
}

function AbaEmBreve({
  nome,
}) {
  return (
    <Panel
      title={nome}
      subtitle="Esta etapa ainda não foi mapeada operacionalmente no sistema atual."
      icon={
        ServerCog
      }
    >
      <div className="px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Clock3 className="h-6 w-6" />
        </div>

        <h3 className="mt-4 text-sm font-black text-slate-700">
          Etapa em planejamento
        </h3>

        <p className="mx-auto mt-1 max-w-[520px] text-xs leading-5 text-slate-400">
          Manteremos esta área reservada no Warehouse V2 até concluirmos o mapeamento AS IS e a regra de negócio correspondente.
        </p>
      </div>
    </Panel>
  );
}

function TabEntrada() {
  const { user } =
    useAuth();

  const [
    visao,
    setVisao,
  ] = useState(
    "pendente"
  );

  const [
    pendentesLista,
    setPendentesLista,
  ] = useState([]);

  const [
    concluidosLista,
    setConcluidosLista,
  ] = useState([]);

  const [
  concluidosCarregados,
  setConcluidosCarregados,
] = useState(false);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busca,
    setBusca,
  ] = useState("");

  const [
    selecao,
    setSelecao,
  ] = useState(
    () => new Set()
  );

  const [
    filtroRi,
    setFiltroRi,
  ] = useState(null);

  const [
    gradesSel,
    setGradesSel,
  ] = useState(
    () => new Set()
  );

  const [
    confirmando,
    setConfirmando,
  ] = useState(false);

  const [
    feedback,
    setFeedback,
  ] = useState(null);

 useEffect(() => {
  carregarPendentes();
}, []);

async function carregarPendentes() {
  setLoading(true);

  try {
    const pendentes =
      await listarAguardandoOracle();

    setPendentesLista(
      pendentes
    );

    setSelecao(
      new Set()
    );
  } catch (error) {
    setFeedback({
      tipo: "erro",
      msg:
        error.message,
    });
  } finally {
    setLoading(false);
  }
}

async function carregarConcluidos({
  forcar = false,
} = {}) {
  if (
    concluidosCarregados &&
    !forcar
  ) {
    return;
  }

  setLoading(true);

  try {
    const concluidos =
      await listarConfirmadosOracle();

    setConcluidosLista(
      concluidos
    );

    setConcluidosCarregados(
      true
    );
  } catch (error) {
    setFeedback({
      tipo: "erro",
      msg:
        error.message,
    });
  } finally {
    setLoading(false);
  }
}

async function carregarAtual() {
  if (
    visao ===
    "concluido"
  ) {
    await carregarConcluidos({
      forcar: true,
    });

    return;
  }

  await carregarPendentes();
}
  const base =
    visao ===
    "pendente"
      ? pendentesLista
      : concluidosLista;

  const semRi =
    useMemo(
      () =>
        pendentesLista.filter(
          (item) =>
            item.pendenteRi
        ).length,

      [
        pendentesLista,
      ]
    );

  const comRi =
    pendentesLista.length -
    semRi;

  const contagemGrades =
    useMemo(() => {
      const mapa =
        new Map();

      for (
        const item of base
      ) {
        if (
          visao ===
          "pendente"
        ) {
          if (
            filtroRi ===
              "sem_ri" &&
            !item.pendenteRi
          ) {
            continue;
          }

          if (
            filtroRi ===
              "com_ri" &&
            item.pendenteRi
          ) {
            continue;
          }
        }

        const chave =
          item.gradeOracle ??
          "sem";

        mapa.set(
          chave,
          (
            mapa.get(
              chave
            ) || 0
          ) + 1
        );
      }

      return mapa;
    }, [
      base,
      filtroRi,
      visao,
    ]);

  const filtrados =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      return base.filter(
        (item) => {
          if (
            visao ===
            "pendente"
          ) {
            if (
              filtroRi ===
                "sem_ri" &&
              !item.pendenteRi
            ) {
              return false;
            }

            if (
              filtroRi ===
                "com_ri" &&
              item.pendenteRi
            ) {
              return false;
            }
          }

          const gradeKey =
            item.gradeOracle ??
            "sem";

          if (
            gradesSel.size &&
            !gradesSel.has(
              gradeKey
            )
          ) {
            return false;
          }

          if (!termo) {
            return true;
          }

          return [
            item.voucher,
            item.imei,
            item.sku,
            item.produto,
            item.documento,
            item.nomeCliente,
            item.ri,
            item.nf,
            item.poStatus,
          ].some(
            (value) =>
              String(
                value ||
                  ""
              )
                .toLowerCase()
                .includes(
                  termo
                )
          );
        }
      );
    }, [
      base,
      busca,
      filtroRi,
      visao,
      gradesSel,
    ]);

  const podeSelecionar =
    visao ===
    "pendente";

  const todosMarcados =
    podeSelecionar &&
    filtrados.length >
      0 &&
    filtrados.every(
      (item) =>
        selecao.has(
          item.imei
        )
    );

  function alternarGrade(
    codigo
  ) {
    setGradesSel(
      (
        anteriores
      ) => {
        const novo =
          new Set(
            anteriores
          );

        if (
          novo.has(
            codigo
          )
        ) {
          novo.delete(
            codigo
          );
        } else {
          novo.add(
            codigo
          );
        }

        return novo;
      }
    );
  }

  function alternarTodos() {
    const novo =
      new Set(
        selecao
      );

    if (
      todosMarcados
    ) {
      filtrados.forEach(
        (item) =>
          novo.delete(
            item.imei
          )
      );
    } else {
      filtrados.forEach(
        (item) =>
          novo.add(
            item.imei
          )
      );
    }

    setSelecao(
      novo
    );
  }

  function alternarUm(
    imei
  ) {
    const novo =
      new Set(
        selecao
      );

    if (
      novo.has(
        imei
      )
    ) {
      novo.delete(
        imei
      );
    } else {
      novo.add(
        imei
      );
    }

    setSelecao(
      novo
    );
  }

  async function trocarVisao(
  nova
) {
  setVisao(
    nova
  );

  setSelecao(
    new Set()
  );

  setFiltroRi(
    null
  );

  setGradesSel(
    new Set()
  );

  if (
    nova ===
      "concluido" &&
    !concluidosCarregados
  ) {
    await carregarConcluidos();
  }
}

  function alternarFiltro(
    valor
  ) {
    setFiltroRi(
      (atual) =>
        atual ===
        valor
          ? null
          : valor
    );
  }

  async function handleConfirmar() {
    if (
      !selecao.size
    ) {
      return;
    }

    setConfirmando(
      true
    );

    setFeedback(
      null
    );

    try {
      const resposta =
        await confirmarOracle(
          [
            ...selecao,
          ],
          user.id
        );

      if (
        !resposta.ok
      ) {
        setFeedback({
          tipo: "erro",
          msg:
            resposta.erro,
        });

        return;
      }

      const parcial =
        resposta.confirmados <
        resposta.solicitados;

      setFeedback({
        tipo:
          parcial
            ? "aviso"
            : "ok",

        msg:
          parcial
            ? `${resposta.confirmados} de ${resposta.solicitados} confirmados. Os demais já haviam saído de "Aguardando oracle".`
            : `${resposta.confirmados} ${
                resposta.confirmados ===
                1
                  ? "item confirmado"
                  : "itens confirmados"
              } no Oracle. Os aparelhos foram movidos para Produto disponível.`,
      });

      setSelecao(
        new Set()
      );

      setConcluidosLista(
  []
);

setConcluidosCarregados(
  false
);

await carregarPendentes();
    } catch (error) {
      setFeedback({
        tipo: "erro",
        msg:
          error.message,
      });
    } finally {
      setConfirmando(
        false
      );

      setTimeout(
        () =>
          setFeedback(
            null
          ),
        7000
      );
    }
  }

  function handleBaixar() {
    const alvo =
      selecao.size
        ? filtrados.filter(
            (item) =>
              selecao.has(
                item.imei
              )
          )
        : filtrados;

    if (!alvo.length) {
      return;
    }

    const linhas =
      alvo.map(
        (item) => ({
          Voucher:
            item.voucher,

          IMEI:
            item.imei,

          SKU:
            item.sku,

          Produto:
            item.produto,

          Grade:
            item.grade,

          "Grade Oracle":
            item.gradeOracle,

          "Bateria 70-79%":
            item.rebaixado
              ? "Sim"
              : "",

          Local:
            item.local,

          Documento:
            item.documento,

          "Número RI":
            item.ri,

          "Nota Fiscal":
            item.nf,

          "Status PO":
            item.poStatus,

          Situação:
            visao ===
            "concluido"
              ? "Confirmado no Oracle"
              : item.pendenteRi
              ? "Pendente RI"
              : "Pendente entrada",

          "Confirmado em":
            visao ===
            "concluido"
              ? dataHora(
                  item.confirmadoEm
                )
              : "",

          "Confirmado por":
            visao ===
            "concluido"
              ? item.confirmadoPor ||
                ""
              : "",
        })
      );

    const ws =
      XLSX.utils.json_to_sheet(
        linhas
      );

    const wb =
      XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      wb,
      ws,
      visao ===
        "concluido"
        ? "Concluídos"
        : "Pendentes"
    );

    const hoje =
      new Date()
        .toISOString()
        .slice(
          0,
          10
        );

    XLSX.writeFile(
      wb,
      `entrada_oracle_${visao}_${hoje}.xlsx`
    );
  }

  const selectedVisible =
    filtrados.filter(
      (item) =>
        selecao.has(
          item.imei
        )
    ).length;

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Aguardando Oracle"
          value={fmtNumber(
            pendentesLista.length
          )}
          helper="Total ainda não confirmado"
          icon={
            ServerCog
          }
          variant="violet"
          active={
            visao ===
              "pendente" &&
            filtroRi == null
          }
          onClick={() => {
            trocarVisao(
              "pendente"
            );
          }}
        />

        <KpiCard
          label="Pendente RI"
          value={fmtNumber(
            semRi
          )}
          helper="Relatório AP ainda sem RI"
          icon={
            Clock3
          }
          variant="amber"
          active={
            visao ===
              "pendente" &&
            filtroRi ===
              "sem_ri"
          }
          onClick={() => {
            setVisao(
              "pendente"
            );

            setSelecao(
              new Set()
            );

            setGradesSel(
              new Set()
            );

            setFiltroRi(
              filtroRi ===
                "sem_ri"
                ? null
                : "sem_ri"
            );
          }}
        />

        <KpiCard
          label="Prontos para entrada"
          value={fmtNumber(
            comRi
          )}
          helper="RI recebido no relatório AP"
          icon={
            PackageCheck
          }
          variant="blue"
          active={
            visao ===
              "pendente" &&
            filtroRi ===
              "com_ri"
          }
          onClick={() => {
            setVisao(
              "pendente"
            );

            setSelecao(
              new Set()
            );

            setGradesSel(
              new Set()
            );

            setFiltroRi(
              filtroRi ===
                "com_ri"
                ? null
                : "com_ri"
            );
          }}
        />

        <KpiCard
  label="Confirmados"
  value={
    concluidosCarregados
      ? fmtNumber(
          concluidosLista.length
        )
      : "—"
  }
  helper={
    concluidosCarregados
      ? "Histórico de entradas Oracle"
      : "Clique para carregar o histórico"
  }
  icon={
    ShieldCheck
  }
  variant="emerald"
  active={
    visao ===
    "concluido"
  }
  onClick={() =>
    trocarVisao(
      "concluido"
    )
  }
/>
      </div>

      {feedback && (
        <Aviso
          tipo={
            feedback.tipo
          }
        >
          {feedback.msg}
        </Aviso>
      )}

      <Panel
        title={
          visao ===
          "pendente"
            ? "Aguardando Entrada no Oracle"
            : "Histórico de confirmações"
        }
        subtitle={
          visao ===
          "pendente"
            ? "Cruza a operação do Warehouse com a versão mais recente do relatório AP."
            : "Itens já confirmados e liberados para Produto disponível."
        }
        icon={
          Database
        }
        action={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={
  carregarAtual
}
              disabled={
                loading
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-[10px] font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${
                  loading
                    ? "animate-spin"
                    : ""
                }`}
              />

              Atualizar
            </button>

            <button
              type="button"
              onClick={
                handleBaixar
              }
              disabled={
                !filtrados.length
              }
              className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-bold text-violet-700 transition hover:bg-violet-100 disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" />

              {selecao.size
                ? `Baixar selecionados (${selecao.size})`
                : "Baixar relatório"}
            </button>
          </div>
        }
      >
        <div className="space-y-5 p-5">
          {/* Visão */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                trocarVisao(
                  "pendente"
                )
              }
              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                visao ===
                "pendente"
                  ? "border-violet-700 bg-violet-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Pendentes ·{" "}
              {
                pendentesLista.length
              }
            </button>

            <button
              type="button"
              onClick={() =>
                trocarVisao(
                  "concluido"
                )
              }
              className={`rounded-xl border px-4 py-2 text-xs font-bold transition ${
                visao ===
                "concluido"
                  ? "border-violet-700 bg-violet-700 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              }`}
            >
              Concluídos ·{" "}
{
  concluidosCarregados
    ? concluidosLista.length
    : "carregar"
}
            </button>
          </div>

          {/* Filtros RI */}
          {visao ===
            "pendente" && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Filter className="h-3.5 w-3.5 text-slate-400" />

                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Situação da RI
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() =>
                    alternarFiltro(
                      "sem_ri"
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                    filtroRi ===
                    "sem_ri"
                      ? "border-amber-500 bg-amber-500 text-white"
                      : "border-amber-200 bg-white text-amber-700 hover:bg-amber-50"
                  }`}
                >
                  Pendente RI ·{" "}
                  {semRi}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    alternarFiltro(
                      "com_ri"
                    )
                  }
                  className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                    filtroRi ===
                    "com_ri"
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-blue-200 bg-white text-blue-700 hover:bg-blue-50"
                  }`}
                >
                  Pendente Entrada ·{" "}
                  {comRi}
                </button>

                {filtroRi && (
                  <button
                    type="button"
                    onClick={() =>
                      setFiltroRi(
                        null
                      )
                    }
                    className="rounded-xl px-3 py-2 text-[10px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    Limpar filtro
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Filtros Oracle */}
          {contagemGrades.size >
            0 && (
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-slate-400" />

                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Código Oracle
                </span>

                {gradesSel.size >
                  0 && (
                  <span className="rounded-md bg-violet-50 px-1.5 py-0.5 text-[8px] font-bold text-violet-600">
                    Multiseleção
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {GRADES_ORACLE_FILTRO
                  .filter(
                    (grade) =>
                      contagemGrades.has(
                        grade.codigo
                      )
                  )
                  .map(
                    (grade) => {
                      const ativo =
                        gradesSel.has(
                          grade.codigo
                        );

                      return (
                        <button
                          key={
                            String(
                              grade.codigo
                            )
                          }
                          type="button"
                          onClick={() =>
                            alternarGrade(
                              grade.codigo
                            )
                          }
                          className={`rounded-xl border px-3 py-2 text-[10px] font-bold transition ${
                            ativo
                              ? grade.ativo
                              : grade.inativo
                          }`}
                        >
                          {
                            grade.rotulo
                          }{" "}
                          ·{" "}
                          {contagemGrades.get(
                            grade.codigo
                          )}
                        </button>
                      );
                    }
                  )}

                {gradesSel.size >
                  0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setGradesSel(
                        new Set()
                      )
                    }
                    className="rounded-xl px-3 py-2 text-[10px] font-bold text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    Limpar grades
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Busca */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              value={
                busca
              }
              onChange={(
                event
              ) =>
                setBusca(
                  event.target.value
                )
              }
              placeholder="Buscar voucher, IMEI, SKU, produto, documento, RI ou NF..."
              className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-xs font-medium text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>

          {/* Seleção */}
          {podeSelecionar &&
            selecao.size >
              0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
              <div>
                <div className="text-xs font-black text-violet-800">
                  {selecao.size}{" "}
                  {selecao.size ===
                  1
                    ? "item selecionado"
                    : "itens selecionados"}
                </div>

                <div className="mt-0.5 text-[9px] font-medium text-violet-600">
                  {selectedVisible} visível(is) no filtro atual
                </div>
              </div>

              <button
                type="button"
                onClick={
                  handleConfirmar
                }
                disabled={
                  confirmando
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
              >
                {confirmando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}

                {confirmando
                  ? "Confirmando..."
                  : `Confirmar Oracle (${selecao.size})`}
              </button>
            </div>
          )}

          {/* Tabela */}
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-14 text-xs font-medium text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />

              Carregando dados do Oracle...
            </div>
          ) : !filtrados.length ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-12 text-center">
              <Database className="mx-auto h-7 w-7 text-slate-300" />

              <div className="mt-3 text-xs font-bold text-slate-600">
                {base.length
                  ? "Nenhum item corresponde aos filtros selecionados."
                  : visao ===
                    "pendente"
                  ? "Nenhum item aguardando Oracle."
                  : "Nenhuma confirmação Oracle registrada."}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1180px] border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-left">
                      {podeSelecionar && (
                        <th className="w-12 px-4 py-3">
                          <input
                            type="checkbox"
                            checked={
                              todosMarcados
                            }
                            onChange={
                              alternarTodos
                            }
                            className="h-4 w-4 cursor-pointer accent-violet-700"
                          />
                        </th>
                      )}

                      {[
                        "Voucher",
                        "IMEI",
                        "SKU",
                        "Produto",
                        "Grade",
                        "Oracle",
                        "Documento",
                        "RI",
                        "Nota Fiscal",
                      ].map(
                        (label) => (
                          <th
                            key={
                              label
                            }
                            className="whitespace-nowrap px-4 py-3 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400"
                          >
                            {
                              label
                            }
                          </th>
                        )
                      )}

                      {visao ===
                        "concluido" && (
                        <th className="whitespace-nowrap px-4 py-3 text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                          Confirmado
                        </th>
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {filtrados.map(
                      (item) => {
                        const marcado =
                          selecao.has(
                            item.imei
                          );

                        return (
                          <tr
                            key={
                              item.imei
                            }
                            className={`border-b border-slate-100 last:border-0 transition ${
                              marcado
                                ? "bg-violet-50/60"
                                : "hover:bg-slate-50/70"
                            }`}
                          >
                            {podeSelecionar && (
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={
                                    marcado
                                  }
                                  onChange={() =>
                                    alternarUm(
                                      item.imei
                                    )
                                  }
                                  className="h-4 w-4 cursor-pointer accent-violet-700"
                                />
                              </td>
                            )}

                            <td className="px-4 py-3">
                              <div className="font-mono text-xs font-black text-violet-700">
                                {item.voucher ||
                                  "—"}
                              </div>

                              {item.poStatus && (
                                <div className="mt-0.5 text-[9px] font-medium text-slate-400">
                                  PO:{" "}
                                  {
                                    item.poStatus
                                  }
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3 font-mono text-[11px] font-semibold text-slate-600">
                              {
                                item.imei
                              }
                            </td>

                            <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                              {item.sku ||
                                "—"}
                            </td>

                            <td className="max-w-[220px] px-4 py-3">
                              <div className="truncate text-xs font-semibold text-slate-700">
                                {item.produto ||
                                  "—"}
                              </div>

                              {item.local && (
                                <div className="mt-0.5 truncate text-[9px] text-slate-400">
                                  {
                                    item.local
                                  }
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-bold text-slate-700">
                                  {item.grade ||
                                    "—"}
                                </span>

                                {item.rebaixado && (
                                  <Zap
                                    className="h-3.5 w-3.5 text-amber-500"
                                    title="Grade rebaixada pela bateria 70-79%"
                                  />
                                )}
                              </div>

                              {item.statusBateria && (
                                <div className="mt-0.5 max-w-[150px] truncate text-[9px] text-slate-400">
                                  {
                                    item.statusBateria
                                  }
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              <OracleBadge
                                valor={
                                  item.gradeOracle
                                }
                              />
                            </td>

                            <td className="px-4 py-3">
                              <div className="font-mono text-[10px] font-semibold text-slate-600">
                                {item.documento ||
                                  "—"}
                              </div>

                              {item.nomeCliente && (
                                <div className="mt-0.5 max-w-[180px] truncate text-[9px] text-slate-400">
                                  {
                                    item.nomeCliente
                                  }
                                </div>
                              )}
                            </td>

                            <td className="px-4 py-3">
                              {item.ri ? (
                                <span className="font-mono text-[10px] font-bold text-blue-700">
                                  {
                                    item.ri
                                  }
                                </span>
                              ) : (
                                <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">
                                  Pendente RI
                                </span>
                              )}
                            </td>

                            <td className="px-4 py-3 font-mono text-[10px] text-slate-600">
                              {item.nf ||
                                "—"}
                            </td>

                            {visao ===
                              "concluido" && (
                              <td className="whitespace-nowrap px-4 py-3">
                                <div className="text-[10px] font-bold text-slate-600">
                                  {dataHora(
                                    item.confirmadoEm
                                  )}
                                </div>

                                {item.confirmadoPor && (
                                  <div className="mt-0.5 text-[9px] text-slate-400">
                                    {
                                      item.confirmadoPor
                                    }
                                  </div>
                                )}
                              </td>
                            )}
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3">
                <span className="text-[10px] font-semibold text-slate-500">
                  {fmtNumber(
                    filtrados.length
                  )}{" "}
                  {filtrados.length ===
                  1
                    ? "registro exibido"
                    : "registros exibidos"}
                </span>

                {podeSelecionar && (
                  <span className="text-[9px] text-slate-400">
                    Marque as linhas para confirmar a entrada no Oracle.
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-amber-100 bg-amber-50/60 p-4">
          <div className="flex items-start gap-3">
            <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />

            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-amber-700">
                Pendente RI
              </div>

              <div className="mt-1 text-[10px] leading-4 text-amber-700/80">
                O relatório AP ainda não trouxe o número do RI para o voucher.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-start gap-3">
            <Database className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />

            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-blue-700">
                Pendente Entrada
              </div>

              <div className="mt-1 text-[10px] leading-4 text-blue-700/80">
                O RI já existe no relatório AP e o aparelho está pronto para confirmação.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />

            <div>
              <div className="text-[10px] font-black uppercase tracking-wide text-emerald-700">
                Produto disponível
              </div>

              <div className="mt-1 text-[10px] leading-4 text-emerald-700/80">
                Após a confirmação Oracle, o aparelho passa a este status e fica elegível ao FIFO.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EntradaOracleV2Page() {
  const [
    aba,
    setAba,
  ] = useState(
    "entrada"
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="text-sm font-black text-slate-800">
          Integração Oracle
        </div>

        <div className="mt-0.5 text-[11px] text-slate-400">
          Conciliação do Warehouse com o relatório AP e liberação dos aparelhos após entrada no ERP.
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-2 shadow-sm">
        <div className="flex min-w-[620px]">
          {ABAS.map(
            (item) => {
              const ativa =
                aba ===
                item.key;

              return (
                <button
                  key={
                    item.key
                  }
                  type="button"
                  onClick={() =>
                    setAba(
                      item.key
                    )
                  }
                  className={`relative px-5 py-4 text-xs font-bold transition ${
                    ativa
                      ? "text-violet-700"
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {
                    item.label
                  }

                  {ativa && (
                    <span className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-violet-700" />
                  )}
                </button>
              );
            }
          )}
        </div>
      </div>

      {aba ===
        "entrada" && (
        <TabEntrada />
      )}

      {aba ===
        "saida" && (
        <AbaEmBreve nome="Saída no Oracle" />
      )}

      {aba ===
        "devolucao" && (
        <AbaEmBreve nome="Devolução aguardando RI" />
      )}
    </div>
  );
}