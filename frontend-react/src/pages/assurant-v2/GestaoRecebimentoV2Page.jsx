import { useEffect, useMemo, useState } from "react";

import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileSpreadsheet,
  FileText,
  Package,
  PlayCircle,
  RefreshCw,
  Search,
  Truck,
  Users,
} from "lucide-react";

import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

import {
  buscarGestaoRecebimento,
  buscarRomaneioGestao,
  fmtDuracao,
  fmtDataHora,
} from "../../services/gestaoRecebimentoService.js";

function fmtNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function iniciais(nome) {
  if (!nome) return "—";

  return nome
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("")
    .toUpperCase();
}

function formatDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function dataInicialPadrao() {
  const date = new Date();
  date.setDate(date.getDate() - 30);

  return formatDateInput(date);
}

function dataFinalPadrao() {
  return formatDateInput(new Date());
}

function minutos(inicio, fim) {
  if (!inicio || !fim) return null;

  const a = new Date(inicio).getTime();
  const b = new Date(fim).getTime();

  if (
    Number.isNaN(a) ||
    Number.isNaN(b) ||
    b < a
  ) {
    return null;
  }

  return Math.round((b - a) / 60000);
}

function media(valores) {
  if (!valores.length) return null;

  return Math.round(
    valores.reduce(
      (soma, valor) => soma + valor,
      0
    ) / valores.length
  );
}

function Panel({
  title,
  subtitle,
  icon: Icon,
  action,
  children,
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <Icon className="h-[17px] w-[17px]" />
            </div>
          )}

          <div>
            <h2 className="text-sm font-black text-slate-800">
              {title}
            </h2>

            {subtitle && (
              <p className="mt-0.5 text-[11px] text-slate-400">
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

function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  variant = "violet",
}) {
  const config = {
    violet:
      "bg-violet-50 text-violet-700",

    emerald:
      "bg-emerald-50 text-emerald-700",

    amber:
      "bg-amber-50 text-amber-700",

    blue:
      "bg-blue-50 text-blue-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
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
          className={`flex h-10 w-10 items-center justify-center rounded-xl ${
            config[variant]
          }`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>
      </div>
    </div>
  );
}

function exportarExcel(
  rec,
  vouchers
) {
  const cab = [
    [
      "ROMANEIO DE RECEBIMENTO — LOJAS",
    ],
    [],
    [
      "Transportadora",
      rec.transportadora,
    ],
    [
      "Motorista",
      rec.motorista_nome || "—",
    ],
    [
      "CPF",
      rec.motorista_cpf || "—",
    ],
    [
      "Placa",
      rec.placa || "—",
    ],
    [
      "Lacres",
      (rec.lacres || []).join(", ") || "—",
    ],
    [
      "Colaborador",
      rec.iniciado_por_nome || "—",
    ],
    [
      "Início",
      fmtDataHora(rec.iniciado_em),
    ],
    [
      "Término",
      fmtDataHora(rec.concluido_em),
    ],
    [
      "Total de vouchers",
      vouchers.length,
    ],
    [],
    [
      "#",
      "Voucher",
      "Bipado em",
      "Colaborador",
    ],
  ];

  const linhas =
    vouchers.map(
      (voucher, index) => [
        index + 1,
        voucher.voucher,
        fmtDataHora(
          voucher.bipado_em
        ),
        voucher.bipado_por_nome ||
          "—",
      ]
    );

  const ws =
    XLSX.utils.aoa_to_sheet([
      ...cab,
      ...linhas,
    ]);

  ws["!cols"] = [
    { wch: 6 },
    { wch: 22 },
    { wch: 22 },
    { wch: 22 },
  ];

  const wb =
    XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    wb,
    ws,
    "Romaneio"
  );

  XLSX.writeFile(
    wb,
    `romaneio_${rec.transportadora}_${rec.id.slice(
      0,
      8
    )}.xlsx`
  );
}

function exportarPDF(
  rec,
  vouchers
) {
  const doc =
    new jsPDF();

  doc.setFontSize(14);

  doc.text(
    "Romaneio de Recebimento — Lojas",
    14,
    16
  );

  doc.setFontSize(10);

  const info = [
    `Transportadora: ${rec.transportadora}`,

    `Motorista: ${
      rec.motorista_nome || "—"
    }   CPF: ${
      rec.motorista_cpf || "—"
    }   Placa: ${
      rec.placa || "—"
    }`,

    `Lacres: ${
      (rec.lacres || []).join(", ") || "—"
    }`,

    `Colaborador: ${
      rec.iniciado_por_nome || "—"
    }`,

    `Início: ${fmtDataHora(
      rec.iniciado_em
    )}   Término: ${fmtDataHora(
      rec.concluido_em
    )}`,

    `Total de vouchers: ${vouchers.length}`,
  ];

  info.forEach(
    (texto, index) =>
      doc.text(
        texto,
        14,
        26 + index * 6
      )
  );

  doc.autoTable({
    startY:
      26 +
      info.length * 6 +
      4,

    head: [
      [
        "#",
        "Voucher",
        "Bipado em",
        "Colaborador",
      ],
    ],

    body:
      vouchers.map(
        (voucher, index) => [
          index + 1,
          voucher.voucher,

          fmtDataHora(
            voucher.bipado_em
          ),

          voucher.bipado_por_nome ||
            "—",
        ]
      ),

    styles: {
      fontSize: 9,
    },

    headStyles: {
      fillColor: [
        91,
        33,
        182,
      ],
    },
  });

  doc.save(
    `romaneio_${rec.transportadora}_${rec.id.slice(
      0,
      8
    )}.pdf`
  );
}

export default function GestaoRecebimentoV2Page() {
  const [
    dataDe,
    setDataDe,
  ] = useState(
    dataInicialPadrao
  );

  const [
    dataAte,
    setDataAte,
  ] = useState(
    dataFinalPadrao
  );

  const [
    dados,
    setDados,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    busca,
    setBusca,
  ] = useState("");

  const [
    baixando,
    setBaixando,
  ] = useState(null);

  async function carregar() {
    setLoading(true);

    try {
      /*
       * Carregamos o histórico disponível.
       * O período selecionado é aplicado nesta tela,
       * sem alterar a lógica atual do serviço.
       */
      const res =
        await buscarGestaoRecebimento(
          "tudo"
        );

      setDados(
        res.ok
          ? res
          : null
      );
    } catch (error) {
      console.error(error);
      setDados(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function baixar(
    recebimentoId,
    tipo
  ) {
    setBaixando(
      `${recebimentoId}-${tipo}`
    );

    try {
      const res =
        await buscarRomaneioGestao(
          recebimentoId
        );

      if (res.ok) {
        if (
          tipo === "excel"
        ) {
          exportarExcel(
            res.recebimento,
            res.vouchers
          );
        } else {
          exportarPDF(
            res.recebimento,
            res.vouchers
          );
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      setBaixando(null);
    }
  }

  const historicoCompleto =
    dados?.historico || [];

  const andamentoCompleto =
    dados?.emAndamento || [];

  const intervalo = useMemo(() => {
    const inicio =
      dataDe
        ? new Date(
            `${dataDe}T00:00:00`
          )
        : null;

    const fim =
      dataAte
        ? new Date(
            `${dataAte}T23:59:59.999`
          )
        : null;

    return {
      inicio,
      fim,
    };
  }, [
    dataDe,
    dataAte,
  ]);

  const dataInvalida =
    intervalo.inicio &&
    intervalo.fim &&
    intervalo.inicio >
      intervalo.fim;

  function estaNoPeriodo(
    value
  ) {
    if (!value) return false;

    const data =
      new Date(value);

    if (
      Number.isNaN(
        data.getTime()
      )
    ) {
      return false;
    }

    if (
      intervalo.inicio &&
      data <
        intervalo.inicio
    ) {
      return false;
    }

    if (
      intervalo.fim &&
      data >
        intervalo.fim
    ) {
      return false;
    }

    return true;
  }

  const historicoPeriodo =
    useMemo(() => {
      if (
        dataInvalida
      ) {
        return [];
      }

      return historicoCompleto.filter(
        (item) =>
          estaNoPeriodo(
            item.iniciado_em
          )
      );
    }, [
      historicoCompleto,
      intervalo,
      dataInvalida,
    ]);

  const andamentoPeriodo =
    useMemo(() => {
      if (
        dataInvalida
      ) {
        return [];
      }

      return andamentoCompleto.filter(
        (item) =>
          estaNoPeriodo(
            item.iniciado_em
          )
      );
    }, [
      andamentoCompleto,
      intervalo,
      dataInvalida,
    ]);

  const kpis =
    useMemo(() => {
      const totalVouchers =
        historicoPeriodo.reduce(
          (
            soma,
            recebimento
          ) =>
            soma +
            (
              recebimento.total_vouchers ||
              0
            ),
          0
        );

      const tempos =
        historicoPeriodo
          .map(
            (recebimento) =>
              minutos(
                recebimento.iniciado_em,
                recebimento.concluido_em
              )
          )
          .filter(
            (valor) =>
              valor != null
          );

      return {
        recebimentos:
          historicoPeriodo.length,

        vouchers:
          totalVouchers,

        voucherPorCarga:
          historicoPeriodo.length
            ? Math.round(
                totalVouchers /
                  historicoPeriodo.length
              )
            : 0,

        tempoMedioMin:
          media(tempos),

        emAndamento:
          andamentoPeriodo.length,
      };
    }, [
      historicoPeriodo,
      andamentoPeriodo,
    ]);

  const transportadoras =
    useMemo(() => {
      const agrupado = {};

      historicoPeriodo.forEach(
        (recebimento) => {
          const nome =
            recebimento.transportadora ||
            "—";

          if (
            !agrupado[nome]
          ) {
            agrupado[nome] = {
              transportadora:
                nome,

              qtd: 0,
              vouchers: 0,
              tempos: [],
            };
          }

          agrupado[nome].qtd += 1;

          agrupado[nome].vouchers +=
            recebimento.total_vouchers ||
            0;

          const tempo =
            minutos(
              recebimento.iniciado_em,
              recebimento.concluido_em
            );

          if (
            tempo != null
          ) {
            agrupado[
              nome
            ].tempos.push(
              tempo
            );
          }
        }
      );

      return Object.values(
        agrupado
      )
        .map(
          (item) => ({
            transportadora:
              item.transportadora,

            qtd:
              item.qtd,

            vouchers:
              item.vouchers,

            tempoMedioMin:
              media(
                item.tempos
              ),
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            b.qtd -
            a.qtd
        );
    }, [
      historicoPeriodo,
    ]);

  const colaboradores =
    useMemo(() => {
      const agrupado = {};

      historicoPeriodo.forEach(
        (recebimento) => {
          const nome =
            recebimento.iniciado_por_nome ||
            "—";

          if (
            !agrupado[nome]
          ) {
            agrupado[nome] = {
              nome,
              cargas: 0,
              vouchers: 0,
              tempos: [],
            };
          }

          agrupado[nome].cargas +=
            1;

          agrupado[nome].vouchers +=
            recebimento.total_vouchers ||
            0;

          const tempo =
            minutos(
              recebimento.iniciado_em,
              recebimento.concluido_em
            );

          if (
            tempo != null
          ) {
            agrupado[
              nome
            ].tempos.push(
              tempo
            );
          }
        }
      );

      return Object.values(
        agrupado
      )
        .map(
          (item) => ({
            nome:
              item.nome,

            cargas:
              item.cargas,

            vouchers:
              item.vouchers,

            tempoMedioMin:
              media(
                item.tempos
              ),
          })
        )
        .sort(
          (
            a,
            b
          ) =>
            b.vouchers -
            a.vouchers
        );
    }, [
      historicoPeriodo,
    ]);

  const maxTransportadora =
    Math.max(
      1,
      ...transportadoras.map(
        (item) =>
          item.qtd
      )
    );

  const historicoFiltrado =
    useMemo(() => {
      const termo =
        busca
          .trim()
          .toLowerCase();

      if (!termo) {
        return historicoPeriodo;
      }

      return historicoPeriodo.filter(
        (item) => {
          const campos = [
            item.motorista_nome,
            item.placa,
            item.transportadora,
            item.iniciado_por_nome,
          ];

          return campos.some(
            (campo) =>
              String(
                campo || ""
              )
                .toLowerCase()
                .includes(
                  termo
                )
          );
        }
      );
    }, [
      historicoPeriodo,
      busca,
    ]);

  function limparPeriodo() {
    setDataDe("");
    setDataAte("");
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
              Assurant Warehouse
            </span>

            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              Gestão de Recebimento
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 lg:text-[30px]">
            Gestão de Recebimento Lojas
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Histórico, tempos, produtividade e acompanhamento das cargas.
          </p>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              De
            </span>

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />

              <input
                type="date"
                value={dataDe}
                onChange={(
                  event
                ) =>
                  setDataDe(
                    event.target.value
                  )
                }
                className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-600 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              />
            </div>
          </label>

          <label>
            <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Até
            </span>

            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-violet-500" />

              <input
                type="date"
                value={dataAte}
                onChange={(
                  event
                ) =>
                  setDataAte(
                    event.target.value
                  )
                }
                className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-600 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
              />
            </div>
          </label>

          <button
            type="button"
            onClick={
              limparPeriodo
            }
            className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-50"
          >
            Todo período
          </button>

          <button
            type="button"
            onClick={carregar}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {dataInvalida && (
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />

          A data inicial não pode ser maior que a data final.
        </div>
      )}

      {loading ? (
        <div className="flex h-52 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" />
        </div>
      ) : !dados ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-8 text-center">
          <AlertTriangle className="mx-auto h-7 w-7 text-rose-500" />

          <div className="mt-3 text-sm font-black text-rose-800">
            Não foi possível carregar a gestão
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Recebimentos"
              value={fmtNumber(
                kpis.recebimentos
              )}
              helper="Cargas concluídas no período"
              icon={Truck}
              variant="violet"
            />

            <KpiCard
              label="Vouchers recebidos"
              value={fmtNumber(
                kpis.vouchers
              )}
              helper={`${kpis.voucherPorCarga} por carga`}
              icon={Package}
              variant="blue"
            />

            <KpiCard
              label="Tempo médio"
              value={fmtDuracao(
                kpis.tempoMedioMin
              )}
              helper="Da abertura à conclusão"
              icon={Clock3}
              variant="amber"
            />

            <KpiCard
              label="Em andamento"
              value={fmtNumber(
                kpis.emAndamento
              )}
              helper="Cargas abertas no período"
              icon={PlayCircle}
              variant="emerald"
            />
          </div>

          {andamentoPeriodo.length >
            0 && (
            <Panel
              title="Em andamento agora"
              subtitle="Recebimentos que ainda não foram concluídos."
              icon={PlayCircle}
              action={
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
                  {
                    andamentoPeriodo.length
                  }
                </span>
              }
            >
              <div className="grid gap-3 p-5 lg:grid-cols-2 2xl:grid-cols-3">
                {andamentoPeriodo.map(
                  (
                    recebimento
                  ) => (
                    <div
                      key={
                        recebimento.id
                      }
                      className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                          {
                            recebimento.transportadora
                          }
                        </span>

                        <span className="text-[10px] font-bold text-slate-400">
                          há{" "}
                          {fmtDuracao(
                            recebimento.decorridoMin
                          )}
                        </span>
                      </div>

                      <div className="mt-3 text-sm font-black text-slate-700">
                        {recebimento.motorista_nome ||
                          "Motorista não informado"}
                      </div>

                      <div className="mt-1 font-mono text-xs text-slate-400">
                        {recebimento.placa ||
                          "—"}
                      </div>

                      <div className="mt-4 flex gap-5 text-xs">
                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                            Vouchers
                          </div>

                          <div className="mt-1 font-black text-slate-700">
                            {fmtNumber(
                              recebimento.total_vouchers
                            )}
                          </div>
                        </div>

                        <div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                            Início
                          </div>

                          <div className="mt-1 font-bold text-slate-700">
                            {fmtDataHora(
                              recebimento.iniciado_em
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                )}
              </div>
            </Panel>
          )}

          <div className="grid gap-5 xl:grid-cols-2">
            <Panel
              title="Por transportadora"
              subtitle="Volume e tempo médio por transportadora."
              icon={Truck}
            >
              <div className="space-y-4 p-5">
                {transportadoras.length ===
                0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Sem dados no período.
                  </div>
                ) : (
                  transportadoras.map(
                    (item) => {
                      const percentual =
                        Math.round(
                          (item.qtd /
                            maxTransportadora) *
                            100
                        );

                      return (
                        <div
                          key={
                            item.transportadora
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs font-bold text-slate-700">
                              {
                                item.transportadora
                              }
                            </span>

                            <span className="text-[10px] font-semibold text-slate-400">
                              {
                                item.qtd
                              }{" "}
                              cargas ·{" "}
                              {fmtDuracao(
                                item.tempoMedioMin
                              )}
                            </span>
                          </div>

                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-violet-600"
                              style={{
                                width: `${percentual}%`,
                              }}
                            />
                          </div>
                        </div>
                      );
                    }
                  )
                )}
              </div>
            </Panel>

            <Panel
              title="Produtividade por colaborador"
              subtitle="Volume bipado e tempo médio por colaborador."
              icon={Users}
            >
              <div className="divide-y divide-slate-100 px-5">
                {colaboradores.length ===
                0 ? (
                  <div className="py-8 text-center text-xs text-slate-400">
                    Sem dados no período.
                  </div>
                ) : (
                  colaboradores.map(
                    (
                      colaborador
                    ) => (
                      <div
                        key={
                          colaborador.nome
                        }
                        className="flex items-center gap-3 py-3"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-xs font-black text-violet-700">
                          {iniciais(
                            colaborador.nome
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-bold text-slate-700">
                            {
                              colaborador.nome
                            }
                          </div>

                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {fmtNumber(
                              colaborador.vouchers
                            )}{" "}
                            vouchers
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                            Tempo médio
                          </div>

                          <div className="mt-1 text-xs font-black text-slate-700">
                            {fmtDuracao(
                              colaborador.tempoMedioMin
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </Panel>
          </div>

          <Panel
            title="Histórico de recebimentos"
            subtitle={`${fmtNumber(
              historicoPeriodo.length
            )} cargas no período selecionado.`}
            icon={Package}
            action={
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={busca}
                  onChange={(
                    event
                  ) =>
                    setBusca(
                      event.target.value
                    )
                  }
                  placeholder="Buscar motorista, placa..."
                  className="h-9 w-[260px] max-w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-xs outline-none focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </div>
            }
          >
            {historicoFiltrado.length ===
            0 ? (
              <div className="px-5 py-12 text-center">
                <Package className="mx-auto h-7 w-7 text-slate-300" />

                <p className="mt-2 text-xs text-slate-400">
                  {busca
                    ? "Nenhum recebimento encontrado."
                    : "Nenhum recebimento no período selecionado."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[980px]">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                      {[
                        "Transportadora",
                        "Motorista",
                        "Placa",
                        "Vouchers",
                        "Tempo",
                        "Colaborador",
                        "Início",
                        "Romaneio",
                      ].map(
                        (label) => (
                          <th
                            key={
                              label
                            }
                            className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400"
                          >
                            {
                              label
                            }
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {historicoFiltrado.map(
                      (
                        recebimento
                      ) => {
                        const tempoMin =
                          recebimento.concluido_em
                            ? minutos(
                                recebimento.iniciado_em,
                                recebimento.concluido_em
                              )
                            : null;

                        return (
                          <tr
                            key={
                              recebimento.id
                            }
                            className="border-b border-slate-100 last:border-0 hover:bg-violet-50/30"
                          >
                            <td className="px-4 py-3 text-xs font-bold text-slate-700">
                              {
                                recebimento.transportadora
                              }
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-600">
                              {recebimento.motorista_nome ||
                                "—"}
                            </td>

                            <td className="px-4 py-3 font-mono text-xs text-slate-500">
                              {recebimento.placa ||
                                "—"}
                            </td>

                            <td className="px-4 py-3 text-xs font-bold text-slate-700">
                              {fmtNumber(
                                recebimento.total_vouchers
                              )}
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-600">
                              {fmtDuracao(
                                tempoMin
                              )}
                            </td>

                            <td className="px-4 py-3 text-xs text-slate-600">
                              {recebimento.iniciado_por_nome ||
                                "—"}
                            </td>

                            <td className="px-4 py-3 text-[11px] text-slate-400">
                              {fmtDataHora(
                                recebimento.iniciado_em
                              )}
                            </td>

                            <td className="whitespace-nowrap px-4 py-3">
                              <button
                                type="button"
                                onClick={() =>
                                  baixar(
                                    recebimento.id,
                                    "excel"
                                  )
                                }
                                disabled={
                                  baixando ===
                                  `${recebimento.id}-excel`
                                }
                                className="mr-2 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 disabled:opacity-40"
                              >
                                <FileSpreadsheet className="h-3.5 w-3.5" />

                                Excel
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  baixar(
                                    recebimento.id,
                                    "pdf"
                                  )
                                }
                                disabled={
                                  baixando ===
                                  `${recebimento.id}-pdf`
                                }
                                className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700 disabled:opacity-40"
                              >
                                <FileText className="h-3.5 w-3.5" />

                                PDF
                              </button>
                            </td>
                          </tr>
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </>
      )}
    </div>
  );
}