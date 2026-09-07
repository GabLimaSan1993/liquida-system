import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  BatteryCharging,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Layers3,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  Smartphone,
  Zap,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";

import {
  listarAguardandoCosmetica,
  carregarParaCosmetica,
  buscarOpcoes,
  salvarCosmetica,
  devolverParaFuncional,
  calcularGradeFinal,
  exibicaoGrade,
} from "../../services/cosmeticaService.js";

const PARTES = [
  {
    id: "tela",
    rotulo: "Tela",
  },
  {
    id: "laterais",
    rotulo: "Laterais",
  },
  {
    id: "traseira",
    rotulo: "Traseira",
  },
  {
    id: "funcional",
    rotulo: "Funcionalidades",
  },
];

const ETAPAS_PROCESSO = [
  {
    key: "voucher",
    label: "Aparelho",
    icon: ScanLine,
  },
  {
    key: "perguntas",
    label: "Avaliação",
    icon: ClipboardCheck,
  },
  {
    key: "fim",
    label: "Resultado",
    icon: CheckCircle2,
  },
];

function indiceEtapa(etapa) {
  const index =
    ETAPAS_PROCESSO.findIndex(
      (item) =>
        item.key === etapa
    );

  return index < 0
    ? 0
    : index;
}

function formatarData(value) {
  if (!value) {
    return "—";
  }

  try {
    return new Date(
      value
    ).toLocaleString(
      "pt-BR",
      {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }
    );
  } catch {
    return "—";
  }
}

function Aviso({
  tipo = "ok",
  children,
}) {
  const config = {
    ok: {
      container:
        "border-emerald-200 bg-emerald-50 text-emerald-800",
      Icon:
        CheckCircle2,
      icon:
        "text-emerald-600",
    },

    aviso: {
      container:
        "border-amber-200 bg-amber-50 text-amber-800",
      Icon:
        AlertTriangle,
      icon:
        "text-amber-600",
    },

    erro: {
      container:
        "border-rose-200 bg-rose-50 text-rose-800",
      Icon:
        ShieldAlert,
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
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${cfg.container}`}
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

function Stepper({
  etapa,
}) {
  const atual =
    indiceEtapa(
      etapa
    );

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex min-w-[520px] items-center">
        {ETAPAS_PROCESSO.map(
          (
            item,
            index
          ) => {
            const Icon =
              item.icon;

            const concluida =
              index <
              atual;

            const ativa =
              index ===
              atual;

            return (
              <div
                key={
                  item.key
                }
                className="flex flex-1 items-center"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`
                      flex h-8 w-8 shrink-0 items-center justify-center rounded-lg
                      ${
                        concluida
                          ? "bg-emerald-500 text-white"
                          : ativa
                          ? "bg-violet-700 text-white"
                          : "bg-slate-100 text-slate-400"
                      }
                    `}
                  >
                    {concluida ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Icon className="h-4 w-4" />
                    )}
                  </div>

                  <div>
                    <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                      Etapa{" "}
                      {index + 1}
                    </div>

                    <div
                      className={`mt-0.5 text-xs font-bold ${
                        ativa
                          ? "text-violet-700"
                          : concluida
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }`}
                    >
                      {
                        item.label
                      }
                    </div>
                  </div>
                </div>

                {index <
                  ETAPAS_PROCESSO.length -
                    1 && (
                  <div
                    className={`mx-5 h-px flex-1 ${
                      concluida
                        ? "bg-emerald-300"
                        : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            );
          }
        )}
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
                  {
                    subtitle
                  }
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

function GradeBadge({
  grade,
  destaque = false,
}) {
  if (!grade) {
    return (
      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-400">
        Pendente
      </span>
    );
  }

  return (
    <span
      className={`rounded-lg px-2.5 py-1 text-[10px] font-black ${
        destaque
          ? "bg-violet-700 text-white"
          : "bg-violet-50 text-violet-700"
      }`}
    >
      {grade}
    </span>
  );
}

function PassosCosmetica({
  passo,
  escolhas,
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[620px] items-center">
        {PARTES.map(
          (
            parte,
            index
          ) => {
            const escolha =
              escolhas[
                parte.id
              ];

            const realizada =
              Boolean(
                escolha
              ) ||
              (parte.id ===
                "funcional" &&
                passo >
                  3);

            const ativa =
              index ===
              passo;

            return (
              <div
                key={
                  parte.id
                }
                className="flex flex-1 items-center"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                      ativa
                        ? "bg-violet-700 text-white"
                        : realizada
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {realizada &&
                    !ativa ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div>
                    <div
                      className={`text-xs font-bold ${
                        ativa
                          ? "text-violet-700"
                          : realizada
                          ? "text-emerald-700"
                          : "text-slate-400"
                      }`}
                    >
                      {
                        parte.rotulo
                      }
                    </div>

                    {escolha && (
                      <div className="mt-0.5 text-[9px] font-semibold text-slate-400">
                        {
                          escolha
                        }
                      </div>
                    )}
                  </div>
                </div>

                {index <
                  PARTES.length -
                    1 && (
                  <div
                    className={`mx-4 h-px flex-1 ${
                      realizada
                        ? "bg-emerald-300"
                        : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            );
          }
        )}
      </div>
    </div>
  );
}

function ContextoAparelho({
  dados,
  escolhas,
  previa,
}) {
  if (!dados) {
    return null;
  }

  const display =
    previa
      ? exibicaoGrade(
          previa
        )
      : null;

  const registros = [
    {
      label:
        "Voucher",
      value:
        dados.voucher ||
        "—",
      mono: true,
    },

    {
      label:
        "IMEI",
      value:
        dados.imei ||
        "—",
      mono: true,
    },

    {
      label:
        "SKU",
      value:
        dados.sku ||
        "—",
      mono: true,
    },

    {
      label:
        "Marca",
      value:
        dados.produto
          ?.marca ||
        "—",
    },

    {
      label:
        "Modelo",
      value:
        dados.produto
          ?.modelo ||
        "—",
    },

    {
      label:
        "Armazenamento",
      value:
        dados.produto
          ?.armazenamento ||
        "—",
    },
  ];

  return (
    <div className="space-y-5">
      <Panel
        title="Aparelho em avaliação"
        subtitle="Contexto do equipamento."
        icon={
          Smartphone
        }
      >
        <div className="divide-y divide-slate-100 px-5">
          {registros.map(
            (item) => (
              <div
                key={
                  item.label
                }
                className="flex items-center justify-between gap-4 py-3"
              >
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  {
                    item.label
                  }
                </span>

                <span
                  className={`max-w-[190px] truncate text-right text-xs font-bold text-slate-700 ${
                    item.mono
                      ? "font-mono"
                      : ""
                  }`}
                >
                  {
                    item.value
                  }
                </span>
              </div>
            )
          )}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-3">
          <div className="flex flex-wrap gap-2">
            {dados.bateriaPercentual !=
              null && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[9px] font-bold text-slate-600 ring-1 ring-slate-200">
                <BatteryCharging className="h-3 w-3 text-violet-500" />

                Bateria{" "}
                {
                  dados.bateriaPercentual
                }
                %
              </span>
            )}

            {dados.temDefeitoFuncional ? (
              <span className="rounded-lg bg-rose-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-rose-700 ring-1 ring-rose-200">
                Defeito funcional
              </span>
            ) : (
              <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
                Funcional OK
              </span>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Grade em formação"
        subtitle="Prévia baseada nas respostas já registradas."
        icon={
          Layers3
        }
      >
        <div className="p-5">
          <div className="grid grid-cols-3 gap-2">
            {[
              [
                "Tela",
                escolhas.tela,
              ],
              [
                "Laterais",
                escolhas.laterais,
              ],
              [
                "Traseira",
                escolhas.traseira,
              ],
            ].map(
              ([
                label,
                grade,
              ]) => (
                <div
                  key={
                    label
                  }
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3"
                >
                  <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">
                    {label}
                  </div>

                  <div className="mt-2">
                    <GradeBadge
                      grade={
                        grade
                      }
                    />
                  </div>
                </div>
              )
            )}
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4">
            <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
              Prévia da grade final
            </div>

            {previa ? (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-xl font-black text-slate-900">
                    {
                      display.texto
                    }
                  </span>

                  {display.raio && (
                    <Zap className="h-5 w-5 text-amber-500" />
                  )}
                </div>

                {previa.motivo && (
                  <div className="mt-2 text-[10px] leading-4 text-slate-500">
                    {
                      previa.motivo
                    }
                  </div>
                )}
              </>
            ) : (
              <div className="mt-2 text-xs font-semibold text-slate-400">
                Complete Tela, Laterais e Traseira.
              </div>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function FilaCosmetica({
  fila,
  carregando,
  bloqueado,
  onAtualizar,
  onAbrir,
}) {
  return (
    <Panel
      title="Fila da Triagem Cosmética"
      subtitle="Aparelhos aguardando classificação."
      icon={
        PackageSearch
      }
      action={
        <button
          type="button"
          onClick={
            onAtualizar
          }
          disabled={
            carregando
          }
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[10px] font-bold text-slate-500 transition hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${
              carregando
                ? "animate-spin"
                : ""
            }`}
          />

          Atualizar
        </button>
      }
    >
      {carregando ? (
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />

          Carregando fila...
        </div>
      ) : fila.length ===
        0 ? (
        <div className="px-5 py-10 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />

          <div className="mt-3 text-xs font-bold text-slate-600">
            Fila zerada
          </div>

          <div className="mt-1 text-[10px] text-slate-400">
            Nenhum aparelho aguardando triagem cosmética.
          </div>
        </div>
      ) : (
        <div className="max-h-[650px] divide-y divide-slate-100 overflow-y-auto">
          {fila.map(
            (item) => (
              <div
                key={
                  item.voucher
                }
                className="px-4 py-3 transition hover:bg-violet-50/30"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                      item.defeito
                        ? "bg-rose-50 text-rose-600"
                        : "bg-violet-50 text-violet-600"
                    }`}
                  >
                    <Smartphone className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-black text-slate-700">
                      {
                        item.voucher
                      }
                    </div>

                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                      {item.imei ||
                        "IMEI não informado"}
                    </div>

                    <div className="mt-1 truncate text-[10px] font-semibold text-slate-600">
                      {[
                        item.marca,
                        item.modelo,
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          " "
                        ) ||
                        "Produto não informado"}
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {item.bateria && (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                          {
                            item.bateria
                          }
                        </span>
                      )}

                      {item.defeito ? (
                        <span className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[9px] font-bold text-rose-700">
                          Com defeito funcional
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          Funcional OK
                        </span>
                      )}

                      <span className="text-[9px] text-slate-400">
                        {item.desde
                          ? new Date(
                              item.desde
                            ).toLocaleDateString(
                              "pt-BR"
                            )
                          : "—"}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      onAbrir(
                        item.voucher
                      )
                    }
                    disabled={
                      bloqueado
                    }
                    className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-violet-700 px-2.5 text-[10px] font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
                  >
                    Triar

                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3">
        <span className="text-[10px] font-semibold text-slate-500">
          {
            fila.length
          }{" "}
          {fila.length ===
          1
            ? "aparelho aguardando"
            : "aparelhos aguardando"}
        </span>
      </div>
    </Panel>
  );
}

function OpcaoCosmetica({
  opcao,
  onClick,
}) {
  const linhas =
    String(
      opcao.descricao ||
        ""
    )
      .split("\n")
      .filter(
        Boolean
      );

  return (
    <button
      type="button"
      onClick={
        onClick
      }
      className="group w-full rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-400 hover:bg-violet-50/40 hover:shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition group-hover:bg-violet-100 group-hover:text-violet-700">
          <ClipboardCheck className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <GradeBadge
              grade={
                opcao.grade
              }
            />
          </div>

          <div className="mt-2 space-y-1">
            {linhas.map(
              (
                linha,
                index
              ) => (
                <div
                  key={
                    index
                  }
                  className="text-xs leading-5 text-slate-600"
                >
                  • {linha}
                </div>
              )
            )}
          </div>
        </div>

        <ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-violet-500" />
      </div>
    </button>
  );
}

export default function TriagemCosmeticaV2Page() {
  const { user } =
    useAuth();

  const [
    etapa,
    setEtapa,
  ] = useState(
    "voucher"
  );

  const [
    busca,
    setBusca,
  ] = useState("");

  const [
    carregando,
    setCarregando,
  ] = useState(false);

  const [
    feedback,
    setFeedback,
  ] = useState(null);

  const [
    fila,
    setFila,
  ] = useState([]);

  const [
    carregandoFila,
    setCarregandoFila,
  ] = useState(true);

  const [
    opcoes,
    setOpcoes,
  ] = useState({
    tela: [],
    laterais: [],
    traseira: [],
  });

  const [
    dados,
    setDados,
  ] = useState(null);

  const [
    passo,
    setPasso,
  ] = useState(0);

  const [
    escolhas,
    setEscolhas,
  ] = useState({
    tela: null,
    laterais: null,
    traseira: null,
  });

  const [
    observacao,
    setObservacao,
  ] = useState("");

  const [
    devolvendo,
    setDevolvendo,
  ] = useState(false);

  const [
    resultado,
    setResultado,
  ] = useState(null);

  useEffect(() => {
    carregarFila();

    buscarOpcoes()
      .then(
        setOpcoes
      )
      .catch(
        (error) =>
          mostrarErro(
            error.message
          )
      );
  }, []);

  const previa =
    useMemo(() => {
      if (
        !dados ||
        !escolhas.tela ||
        !escolhas.laterais ||
        !escolhas.traseira
      ) {
        return null;
      }

      return calcularGradeFinal({
        ...escolhas,

        temDefeitoFuncional:
          dados.temDefeitoFuncional,

        bateria:
          dados.bateria,
      });
    }, [
      dados,
      escolhas,
    ]);

  async function carregarFila() {
    setCarregandoFila(
      true
    );

    try {
      setFila(
        await listarAguardandoCosmetica()
      );
    } catch (error) {
      mostrarErro(
        error.message
      );
    } finally {
      setCarregandoFila(
        false
      );
    }
  }

  function mostrarErro(
    mensagem
  ) {
    setFeedback({
      tipo: "erro",
      msg: mensagem,
    });

    setTimeout(
      () =>
        setFeedback(
          null
        ),
      7000
    );
  }

  function reiniciar() {
    setEtapa(
      "voucher"
    );

    setBusca("");

    setDados(
      null
    );

    setPasso(
      0
    );

    setEscolhas({
      tela: null,
      laterais: null,
      traseira: null,
    });

    setObservacao(
      ""
    );

    setDevolvendo(
      false
    );

    setResultado(
      null
    );

    carregarFila();
  }

  async function abrir(
    voucher
  ) {
    if (
      !String(
        voucher ||
          ""
      ).trim()
    ) {
      return;
    }

    setCarregando(
      true
    );

    try {
      const resposta =
        await carregarParaCosmetica(
          voucher
        );

      if (
        !resposta.ok
      ) {
        mostrarErro(
          resposta.erro
        );

        return;
      }

      setDados(
        resposta
      );

      setPasso(
        0
      );

      setEscolhas({
        tela: null,
        laterais: null,
        traseira: null,
      });

      setObservacao(
        ""
      );

      setDevolvendo(
        false
      );

      setEtapa(
        "perguntas"
      );
    } catch (error) {
      mostrarErro(
        error.message
      );
    } finally {
      setCarregando(
        false
      );
    }
  }

  function escolher(
    parte,
    grade
  ) {
    setEscolhas(
      (
        anteriores
      ) => ({
        ...anteriores,
        [parte]:
          grade,
      })
    );

    setPasso(
      (
        atual
      ) =>
        atual + 1
    );
  }

  async function handleSalvar() {
    setCarregando(
      true
    );

    try {
      const resposta =
        await salvarCosmetica({
          dados,
          ...escolhas,
          userId:
            user.id,
        });

      if (
        !resposta.ok
      ) {
        mostrarErro(
          resposta.erro
        );

        return;
      }

      setResultado(
        resposta
      );

      setEtapa(
        "fim"
      );
    } catch (error) {
      mostrarErro(
        error.message
      );
    } finally {
      setCarregando(
        false
      );
    }
  }

  async function handleDevolver() {
    setCarregando(
      true
    );

    try {
      const resposta =
        await devolverParaFuncional({
          voucher:
            dados.voucher,

          ...escolhas,

          observacao,

          userId:
            user.id,
        });

      setResultado({
        devolvido:
          true,

        status:
          resposta.status,
      });

      setEtapa(
        "fim"
      );
    } catch (error) {
      mostrarErro(
        error.message
      );
    } finally {
      setCarregando(
        false
      );
    }
  }

  const parteAtual =
    PARTES[
      passo
    ];

  const opcoesAtuais =
    parteAtual &&
    parteAtual.id !==
      "funcional"
      ? opcoes[
          parteAtual.id
        ] || []
      : [];

  return (
    <div className="space-y-5">
      <Stepper
        etapa={
          etapa
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-800">
            Bancada Cosmética
          </div>

          <div className="mt-0.5 text-[11px] text-slate-400">
            Avaliação estética e definição da grade comercial do aparelho.
          </div>
        </div>

        {etapa !==
          "voucher" && (
          <button
            type="button"
            onClick={
              reiniciar
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <RotateCcw className="h-4 w-4" />

            Novo aparelho
          </button>
        )}
      </div>

      {feedback && (
        <Aviso
          tipo={
            feedback.tipo
          }
        >
          {
            feedback.msg
          }
        </Aviso>
      )}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          {/* =========================
              ETAPA 1 — VOUCHER
          ========================== */}
          {etapa ===
            "voucher" && (
            <Panel
              title="Identificação do aparelho"
              subtitle="Bipe um voucher ou selecione um equipamento da fila."
              icon={
                ScanLine
              }
            >
              <div className="p-5 lg:p-6">
                <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                  <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                    Entrada da bancada
                  </div>

                  <h3 className="mt-2 text-lg font-black text-slate-900">
                    Voucher
                  </h3>

                  <p className="mt-1 text-xs leading-5 text-slate-500">
                    Utilize o leitor ou digite manualmente o voucher do aparelho.
                  </p>

                  <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />

                      <input
                        autoFocus
                        value={
                          busca
                        }
                        onChange={(
                          event
                        ) =>
                          setBusca(
                            event.target.value.toUpperCase()
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                              "Enter" &&
                            busca.trim()
                          ) {
                            abrir(
                              busca
                            );
                          }
                        }}
                        placeholder="Bipe o voucher..."
                        className="h-14 w-full rounded-xl border border-violet-200 bg-white pl-12 pr-4 font-mono text-base font-black tracking-wide text-slate-800 outline-none transition placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        abrir(
                          busca
                        )
                      }
                      disabled={
                        !busca.trim() ||
                        carregando
                      }
                      className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
                    >
                      {carregando ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}

                      {carregando
                        ? "Consultando..."
                        : "Consultar"}
                    </button>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Na fila
                    </div>

                    <div className="mt-1 text-xl font-black text-slate-800">
                      {
                        fila.length
                      }
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Avaliações
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-700">
                      Tela · Laterais · Traseira
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Saída padrão
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-700">
                      Aguardando armazenagem
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* =========================
              ETAPA 2 — AVALIAÇÃO
          ========================== */}
          {etapa ===
            "perguntas" &&
            dados && (
              <div className="space-y-5">
                {dados.temDefeitoFuncional && (
                  <Aviso tipo="aviso">
                    <div>
                      <div className="font-black">
                        Defeito funcional já identificado.
                      </div>

                      <div className="mt-1 font-medium">
                        A grade final será QUEBRADO independentemente da estética. Mesmo assim, conclua Tela, Laterais e Traseira para preservar o histórico da condição física.
                      </div>
                    </div>
                  </Aviso>
                )}

                <Panel
                  title="Avaliação cosmética"
                  subtitle="Selecione a condição que melhor representa o aparelho físico."
                  icon={
                    ClipboardCheck
                  }
                  action={
                    <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                      {Math.min(
                        passo + 1,
                        4
                      )}
                      /4
                    </span>
                  }
                >
                  <div className="p-5">
                    <PassosCosmetica
                      passo={
                        passo
                      }
                      escolhas={
                        escolhas
                      }
                    />
                  </div>
                </Panel>

                {passo <
                  3 ? (
                  <Panel
                    title={
                      parteAtual
                        ?.rotulo
                    }
                    subtitle="Escolha a descrição que mais se aproxima da condição observada."
                    icon={
                      Layers3
                    }
                    action={
                      escolhas[
                        parteAtual
                          ?.id
                      ] && (
                        <GradeBadge
                          grade={
                            escolhas[
                              parteAtual
                                .id
                            ]
                          }
                        />
                      )
                    }
                  >
                    <div className="space-y-3 p-5">
                      {opcoesAtuais.length >
                      0 ? (
                        opcoesAtuais.map(
                          (
                            opcao
                          ) => (
                            <OpcaoCosmetica
                              key={
                                opcao.id
                              }
                              opcao={
                                opcao
                              }
                              onClick={() =>
                                escolher(
                                  parteAtual.id,
                                  opcao.grade
                                )
                              }
                            />
                          )
                        )
                      ) : (
                        <div className="rounded-xl bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-700">
                          Nenhuma opção parametrizada para esta etapa.
                        </div>
                      )}

                      {passo >
                        0 && (
                        <button
                          type="button"
                          onClick={() =>
                            setPasso(
                              (
                                atual
                              ) =>
                                Math.max(
                                  0,
                                  atual -
                                    1
                                )
                            )
                          }
                          className="mt-2 inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 transition hover:text-violet-600"
                        >
                          <ArrowLeft className="h-3.5 w-3.5" />

                          Voltar
                        </button>
                      )}
                    </div>
                  </Panel>
                ) : (
                  <Panel
                    title="Validação funcional complementar"
                    subtitle="Confirme se a Cosmética identificou algum problema funcional não capturado anteriormente."
                    icon={
                      ShieldAlert
                    }
                  >
                    <div className="p-5">
                      {!devolvendo ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <button
                            type="button"
                            onClick={
                              handleSalvar
                            }
                            disabled={
                              carregando
                            }
                            className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-left transition hover:border-emerald-400 hover:bg-emerald-100 disabled:opacity-40"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                                <CheckCircle2 className="h-5 w-5" />
                              </div>

                              <div>
                                <div className="text-sm font-black text-emerald-900">
                                  Sem falhas funcionais
                                </div>

                                <div className="mt-1 text-[10px] leading-4 text-emerald-700">
                                  Concluir a Triagem Cosmética e gravar a grade calculada.
                                </div>
                              </div>
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              setDevolvendo(
                                true
                              )
                            }
                            className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-left transition hover:border-rose-400 hover:bg-rose-100"
                          >
                            <div className="flex items-start gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-white">
                                <ShieldAlert className="h-5 w-5" />
                              </div>

                              <div>
                                <div className="text-sm font-black text-rose-900">
                                  Problema funcional identificado
                                </div>

                                <div className="mt-1 text-[10px] leading-4 text-rose-700">
                                  Devolver o aparelho para a Triagem Funcional.
                                </div>
                              </div>
                            </div>
                          </button>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50/60 p-5">
                          <div className="flex items-start gap-3">
                            <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />

                            <div className="min-w-0 flex-1">
                              <h3 className="text-sm font-black text-rose-900">
                                Devolver para Triagem Funcional
                              </h3>

                              <p className="mt-1 text-[10px] leading-4 text-rose-700">
                                Descreva o problema encontrado. As avaliações estéticas já realizadas serão preservadas.
                              </p>

                              <textarea
                                rows={
                                  4
                                }
                                value={
                                  observacao
                                }
                                onChange={(
                                  event
                                ) =>
                                  setObservacao(
                                    event.target.value
                                  )
                                }
                                placeholder="Ex: aparelho não carrega"
                                className="mt-4 w-full resize-y rounded-xl border border-rose-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-rose-400 focus:ring-4 focus:ring-rose-100"
                              />

                              <div className="mt-4 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={
                                    handleDevolver
                                  }
                                  disabled={
                                    !observacao.trim() ||
                                    carregando
                                  }
                                  className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
                                >
                                  {carregando ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    <RotateCcw className="h-4 w-4" />
                                  )}

                                  {carregando
                                    ? "Devolvendo..."
                                    : "Confirmar devolução"}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setDevolvendo(
                                      false
                                    );

                                    setObservacao(
                                      ""
                                    );
                                  }}
                                  className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {!devolvendo &&
                        previa && (
                          <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
                            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-violet-500">
                              Grade que será gravada
                            </div>

                            <div className="mt-2 flex items-center gap-2">
                              <span className="text-2xl font-black text-slate-900">
                                {
                                  exibicaoGrade(
                                    previa
                                  ).texto
                                }
                              </span>

                              {exibicaoGrade(
                                previa
                              ).raio && (
                                <Zap className="h-5 w-5 text-amber-500" />
                              )}
                            </div>

                            {previa.motivo && (
                              <div className="mt-2 text-xs leading-5 text-slate-500">
                                {
                                  previa.motivo
                                }
                              </div>
                            )}

                            <div className="mt-3 text-[10px] font-semibold text-slate-400">
                              Tela{" "}
                              {
                                escolhas.tela
                              }{" "}
                              · Laterais{" "}
                              {
                                escolhas.laterais
                              }{" "}
                              · Traseira{" "}
                              {
                                escolhas.traseira
                              }
                            </div>
                          </div>
                        )}

                      <button
                        type="button"
                        onClick={() =>
                          setPasso(
                            2
                          )
                        }
                        className="mt-5 inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 transition hover:text-violet-600"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />

                        Voltar para Traseira
                      </button>
                    </div>
                  </Panel>
                )}
              </div>
            )}

          {/* =========================
              ETAPA 3 — RESULTADO
          ========================== */}
          {etapa ===
            "fim" &&
            resultado && (
              <Panel
                title="Resultado da Triagem Cosmética"
                subtitle="Classificação concluída para este aparelho."
                icon={
                  CheckCircle2
                }
              >
                <div className="space-y-5 p-5 lg:p-6">
                  {resultado.devolvido ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                      <div className="flex items-start gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white">
                          <RotateCcw className="h-5 w-5" />
                        </div>

                        <div>
                          <h3 className="text-base font-black text-amber-900">
                            Aparelho devolvido para a Funcional
                          </h3>

                          <p className="mt-1 text-xs leading-5 text-amber-700">
                            O equipamento está agora em{" "}
                            <strong>
                              {
                                resultado.status
                              }
                            </strong>
                            .
                          </p>

                          <p className="mt-2 text-[10px] leading-4 text-amber-600">
                            As avaliações estéticas já registradas foram preservadas para a reanálise.
                          </p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                        <div className="flex items-start gap-4">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                            <CheckCircle2 className="h-5 w-5" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="text-[9px] font-black uppercase tracking-[0.12em] text-emerald-600">
                              Grade final
                            </div>

                            <div className="mt-1 flex items-center gap-2">
                              <span className="text-3xl font-black tracking-tight text-emerald-950">
                                {
                                  exibicaoGrade(
                                    resultado
                                  ).texto
                                }
                              </span>

                              {exibicaoGrade(
                                resultado
                              ).raio && (
                                <Zap className="h-6 w-6 text-amber-500" />
                              )}
                            </div>

                            {resultado.motivo && (
                              <p className="mt-2 text-xs leading-5 text-emerald-700">
                                {
                                  resultado.motivo
                                }
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                            Próxima etapa
                          </div>

                          <div className="mt-1 text-sm font-black text-slate-700">
                            {
                              resultado.status
                            }
                          </div>
                        </div>

                        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                          <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                            Grade cosmética
                          </div>

                          <div className="mt-1 text-sm font-black text-slate-700">
                            {resultado.gradeCosmetica ||
                              resultado.grade ||
                              "—"}
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  <div className="flex justify-end border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={
                        reiniciar
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800"
                    >
                      <RotateCcw className="h-4 w-4" />

                      Próximo aparelho
                    </button>
                  </div>
                </div>
              </Panel>
            )}
        </div>

        <div className="space-y-5 xl:sticky xl:top-[92px]">
          {etapa ===
          "voucher" ? (
            <FilaCosmetica
              fila={
                fila
              }
              carregando={
                carregandoFila
              }
              bloqueado={
                carregando
              }
              onAtualizar={
                carregarFila
              }
              onAbrir={
                abrir
              }
            />
          ) : (
            <>
              <ContextoAparelho
                dados={
                  dados
                }
                escolhas={
                  escolhas
                }
                previa={
                  previa
                }
              />

              <FilaCosmetica
                fila={
                  fila.slice(
                    0,
                    5
                  )
                }
                carregando={
                  carregandoFila
                }
                bloqueado={
                  true
                }
                onAtualizar={
                  carregarFila
                }
                onAbrir={
                  abrir
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}