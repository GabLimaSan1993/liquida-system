import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  Dices,
  FileDown,
  History,
  Loader2,
  Lock,
  MapPin,
  PenLine,
  RefreshCw,
  Search,
  ShieldCheck,
  Warehouse,
} from "lucide-react";

import jsPDF from "jspdf";
import "jspdf-autotable";

import {
  abrirCiclo,
  abrirContagem,
  biparItem,
  cicloAberto,
  fecharContagem,
  fecharDia,
  hojeSP,
  listarConflitos,
  listarContagensPendentes,
  listarFechamentos,
  listarItens,
  mapaInventarioCiclo,
  painelCiclo,
  resumoDoDia,
  sortearDia,
} from "../../services/inventarioService.js";

import {
  useAuth,
} from "../../AuthContext.jsx";


const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const COLUNAS_INVENTARIO = [
  "F",
  "E",
  "D",
  "C",
  "B",
  "A",
];

const LINHAS_INVENTARIO = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
];

const STATUS_MAPA_INVENTARIO = {
  validado: {
    label: "Validado",
    dot: "bg-emerald-600",
    cell:
      "bg-emerald-100 text-emerald-950 ring-emerald-300 hover:bg-emerald-200",
  },

  divergencia: {
    label: "Divergência",
    dot: "bg-red-600",
    cell:
      "bg-red-100 text-red-950 ring-red-300 hover:bg-red-200",
  },

  pendente: {
    label: "Pendente",
    dot: "bg-amber-500",
    cell:
      "bg-amber-100 text-amber-950 ring-amber-300 hover:bg-amber-200",
  },

  sem_estoque: {
    label: "Sem estoque",
    dot: "bg-slate-300",
    cell:
      "bg-slate-50 text-slate-400 ring-slate-200",
  },
};

function nomeDoCicloAtual() {
  const d =
    new Date();

  return `Ciclo de ${
    MESES[
      d.getMonth()
    ]
  }/${d.getFullYear()}`;
}


function fmtN(
  valor
) {
  return Number(
    valor || 0
  ).toLocaleString(
    "pt-BR"
  );
}


function fmtPct(
  valor
) {
  if (
    valor === null ||
    valor === undefined
  ) {
    return "—";
  }

  return `${Number(
    valor
  )
    .toFixed(1)
    .replace(
      ".",
      ","
    )}%`;
}


function fmtData(
  valor
) {
  if (!valor) {
    return "—";
  }

  return new Date(
    valor
  ).toLocaleString(
    "pt-BR"
  );
}


function fmtDataBR(
  valor
) {
  if (!valor) {
    return "—";
  }

  const [
    ano,
    mes,
    dia,
  ] = String(
    valor
  ).split("-");

  return `${dia}/${mes}/${ano}`;
}


function Card({
  children,
  className = "",
}) {
  return (
    <div
      className={`
        rounded-2xl
        border
        border-slate-200
        bg-white
        shadow-sm
        ${className}
      `}
    >
      {children}
    </div>
  );
}


function KpiCard({
  label,
  value,
  helper,
  icon: Icon,
  variant = "violet",
}) {
  const variants = {
    violet:
      "bg-violet-50 text-violet-700",
    emerald:
      "bg-emerald-50 text-emerald-700",
    amber:
      "bg-amber-50 text-amber-700",
    rose:
      "bg-rose-50 text-rose-700",
    blue:
      "bg-blue-50 text-blue-700",
  };

  return (
    <Card>
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            {label}
          </div>

          <div className="mt-1 text-2xl font-black text-slate-900">
            {value}
          </div>

          {helper && (
            <div className="mt-1 text-[10px] text-slate-400">
              {helper}
            </div>
          )}
        </div>

        <div
          className={`
            flex
            h-9
            w-9
            shrink-0
            items-center
            justify-center
            rounded-xl
            ${
              variants[
                variant
              ] ||
              variants.violet
            }
          `}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}


function ProgressBar({
  pct = 0,
}) {
  const largura =
    Math.max(
      0,
      Math.min(
        100,
        Number(
          pct || 0
        )
      )
    );

  return (
    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-violet-700 transition-all"
        style={{
          width: `${largura}%`,
        }}
      />
    </div>
  );
}


function Feedback({
  feedback,
}) {
  if (!feedback) {
    return null;
  }

  const config =
    feedback.tipo ===
    "ok"
      ? {
          className:
            "border-emerald-200 bg-emerald-50 text-emerald-700",
          icon:
            CheckCircle2,
        }
      : feedback.tipo ===
        "aviso"
      ? {
          className:
            "border-amber-200 bg-amber-50 text-amber-700",
          icon:
            AlertTriangle,
        }
      : {
          className:
            "border-rose-200 bg-rose-50 text-rose-700",
          icon:
            AlertTriangle,
        };

  const Icon =
    config.icon;

  return (
    <div
      className={`
        flex
        items-start
        gap-2
        rounded-xl
        border
        px-4
        py-3
        text-xs
        font-semibold
        ${config.className}
      `}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />

      <span>
        {feedback.msg}
      </span>
    </div>
  );
}


function TabContagem({
  ciclo,
}) {
  const {
    user,
    profile,
  } = useAuth();

  const [
    pendentes,
    setPendentes,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    ativa,
    setAtiva,
  ] = useState(null);

  const [
    itens,
    setItens,
  ] = useState([]);

  const [
    imeiInput,
    setImeiInput,
  ] = useState("");

  const [
    historico,
    setHistorico,
  ] = useState([]);

  const [
    proc,
    setProc,
  ] = useState(false);

  const [
    resumo,
    setResumo,
  ] = useState(null);

  const [
    ruasSel,
    setRuasSel,
  ] = useState([]);

  const inputRef =
    useRef(null);


  useEffect(() => {
    if (ciclo) {
      carregar();
    }
  }, [ciclo]);


  useEffect(() => {
    if (ativa) {
      inputRef.current?.focus();
    }
  }, [ativa]);


  async function carregar() {
    setLoading(
      true
    );

    try {
      const dados =
        await listarContagensPendentes(
          ciclo.id
        );

      setPendentes(
        dados
      );
    } catch (e) {
      console.error(
        e
      );
    } finally {
      setLoading(
        false
      );
    }
  }


  const ruasDisponiveis =
    [
      ...new Set(
        pendentes
          .map(
            (contagem) => {
              const match =
                String(
                  contagem.endereco ||
                    ""
                ).match(
                  /^RUA\s+(\d+)/i
                );

              return match
                ? `RUA ${match[1]}`
                : null;
            }
          )
          .filter(
            Boolean
          )
      ),
    ].sort(
      (a, b) =>
        parseInt(
          a.replace(
            "RUA ",
            ""
          )
        ) -
        parseInt(
          b.replace(
            "RUA ",
            ""
          )
        )
    );


  function toggleRua(
    rua
  ) {
    setRuasSel(
      (atual) =>
        atual.includes(
          rua
        )
          ? atual.filter(
              (item) =>
                item !== rua
            )
          : [
              ...atual,
              rua,
            ]
    );
  }


  const pendentesFiltrados =
    pendentes.filter(
      (contagem) =>
        ruasSel.length ===
          0 ||
        ruasSel.some(
          (rua) =>
            String(
              contagem.endereco ||
                ""
            ).match(
              new RegExp(
                `^RUA\\s+${rua.replace(
                  "RUA ",
                  ""
                )}\\b`,
                "i"
              )
            )
        )
    );


  function addHist(
    item
  ) {
    setHistorico(
      (atual) => [
        {
          ...item,
          ts:
            Date.now() +
            Math.random(),
        },
        ...atual,
      ].slice(
        0,
        30
      )
    );
  }


  async function handleAbrir(
    contagem
  ) {
    setProc(
      true
    );

    setResumo(
      null
    );

    try {
      const resposta =
        await abrirContagem(
          contagem.id,
          user.id,
          profile?.nome
        );

      if (
        !resposta.ok
      ) {
        addHist({
          tipo: "erro",
          msg:
            resposta.erro,
        });

        return;
      }

      setAtiva(
        resposta.contagem
      );

      setItens(
        resposta.itens
      );

      setHistorico(
        []
      );
    } catch (e) {
      addHist({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );
    }
  }


  async function handleBipar(
    evento
  ) {
    evento.preventDefault();

    const imei =
      imeiInput.trim();

    if (
      !imei ||
      proc ||
      !ativa
    ) {
      return;
    }

    setImeiInput(
      ""
    );

    setProc(
      true
    );

    try {
      const resposta =
        await biparItem(
          ativa.id,
          imei
        );

      if (
        !resposta.ok
      ) {
        addHist({
          tipo: "erro",
          imei,
          msg:
            resposta.erro,
        });
      } else if (
        resposta.veredito ===
        "conferido"
      ) {
        addHist({
          tipo: "ok",
          imei,
          msg: "Conferido",
        });
      } else if (
        resposta.veredito ===
        "conflito"
      ) {
        addHist({
          tipo: "erro",
          imei,
          msg:
            "Conflito · identificador duplicado no cadastro",
        });
      } else {
        const de =
          resposta.anterior ||
          "sem endereço";

        addHist({
          tipo: "aviso",
          imei,
          msg: `Sobra · era esperado em ${de} — corrigido${
            resposta.reconciliou
              ? " · falta reconciliada"
              : ""
          }`,
        });
      }

      const dados =
        await listarItens(
          ativa.id
        );

      setItens(
        dados
      );
    } catch (e) {
      addHist({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );

      inputRef.current?.focus();
    }
  }


  async function handleFechar() {
    if (
      !ativa ||
      proc
    ) {
      return;
    }

    setProc(
      true
    );

    try {
      const resposta =
        await fecharContagem(
          ativa.id
        );

      if (
        !resposta.ok
      ) {
        addHist({
          tipo: "erro",
          msg:
            resposta.erro,
        });

        return;
      }

      setResumo(
        resposta
      );

      setAtiva(
        null
      );

      setItens(
        []
      );

      await carregar();
    } catch (e) {
      addHist({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );
    }
  }


  if (!ciclo) {
    return (
      <Card>
        <div className="py-16 text-center">
          <ClipboardList className="mx-auto h-9 w-9 text-slate-300" />

          <div className="mt-3 text-sm font-black text-slate-700">
            Nenhum ciclo aberto
          </div>

          <div className="mt-1 text-xs text-slate-400">
            Um gestor precisa abrir um ciclo antes de iniciar as contagens.
          </div>
        </div>
      </Card>
    );
  }


  if (!ativa) {
    return (
      <div className="space-y-4">
        {resumo && (
          <Feedback
            feedback={{
              tipo:
                resumo.perfeito
                  ? "ok"
                  : "aviso",

              msg: `Contagem fechada — ${
                resumo.conferidos
              } conferidas${
                resumo.sobras >
                0
                  ? ` · ${resumo.sobras} sobra(s)`
                  : ""
              }${
                resumo.faltas >
                0
                  ? ` · ${resumo.faltas} falta(s)`
                  : ""
              }${
                resumo.perfeito
                  ? " · endereço perfeito"
                  : ""
              }`,
            }}
          />
        )}


        <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-black text-slate-800">
                  Endereços para contagem
                </div>

                <div className="mt-1 text-[10px] text-slate-400">
                  Selecione um endereço sorteado para iniciar a conferência física.
                </div>
              </div>

              <button
                type="button"
                onClick={
                  carregar
                }
                disabled={
                  loading
                }
                className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-40"
              >
                <RefreshCw
                  className={`h-4 w-4 ${
                    loading
                      ? "animate-spin"
                      : ""
                  }`}
                />

                Atualizar
              </button>
            </div>
          </div>


          <div className="p-5">
            {ruasDisponiveis.length >
              0 && (
              <div className="mb-5">
                <div className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-wide text-slate-400">
                  <MapPin className="h-3.5 w-3.5" />
                  Filtrar por rua
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setRuasSel(
                        []
                      )
                    }
                    className={`rounded-lg px-3 py-2 text-[10px] font-bold transition ${
                      ruasSel.length ===
                      0
                        ? "bg-violet-700 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    Todas
                  </button>

                  {ruasDisponiveis.map(
                    (
                      rua
                    ) => (
                      <button
                        type="button"
                        key={
                          rua
                        }
                        onClick={() =>
                          toggleRua(
                            rua
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-[10px] font-bold transition ${
                          ruasSel.includes(
                            rua
                          )
                            ? "bg-violet-700 text-white"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        {rua}
                      </button>
                    )
                  )}
                </div>
              </div>
            )}


            {loading ? (
              <div className="flex min-h-[220px] items-center justify-center gap-2 text-xs font-semibold text-violet-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando endereços...
              </div>
            ) : pendentes.length ===
              0 ? (
              <div className="py-14 text-center">
                <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-400" />

                <div className="mt-3 text-sm font-black text-emerald-700">
                  Nenhum endereço pendente
                </div>

                <div className="mt-1 text-xs text-slate-400">
                  Solicite um novo sorteio na aba Gestão.
                </div>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
                {pendentesFiltrados.map(
                  (
                    contagem
                  ) => (
                    <button
                      type="button"
                      key={
                        contagem.id
                      }
                      disabled={
                        proc
                      }
                      onClick={() =>
                        handleAbrir(
                          contagem
                        )
                      }
                      className="rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-300 hover:bg-violet-50/40 disabled:opacity-40"
                    >
                      <div className="flex items-start gap-3">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                          <MapPin className="h-4 w-4" />
                        </div>

                        <div className="min-w-0">
                          <div className="break-words font-mono text-xs font-black text-slate-800">
                            {
                              contagem.endereco
                            }
                          </div>

                          <div className="mt-1 text-[10px] text-slate-400">
                            {contagem.status ===
                            "em_contagem"
                              ? `Em contagem · ${
                                  contagem.encontradas ||
                                  0
                                } de ${
                                  contagem.esperadas ||
                                  0
                                }`
                              : "Pendente de contagem"}
                          </div>
                        </div>
                      </div>
                    </button>
                  )
                )}
              </div>
            )}
          </div>
        </Card>
      </div>
    );
  }


  const esperados =
    itens.filter(
      (item) =>
        item.veredito ===
        "esperado"
    );

  const conferidos =
    itens.filter(
      (item) =>
        item.veredito ===
        "conferido"
    ).length;

  const sobras =
    itens.filter(
      (item) =>
        [
          "sobra",
          "conflito",
        ].includes(
          item.veredito
        )
    ).length;

  const total =
    ativa.esperadas ||
    0;

  const pct =
    total > 0
      ? Math.round(
          (conferidos /
            total) *
            100
        )
      : 0;


  return (
    <div className="space-y-4">
      <Card>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <button
                type="button"
                onClick={() => {
                  setAtiva(
                    null
                  );

                  setItens(
                    []
                  );

                  carregar();
                }}
                className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-400 transition hover:text-violet-700"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Trocar endereço
              </button>

              <div className="mt-3 font-mono text-sm font-black text-slate-900">
                {
                  ativa.endereco
                }
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                {total} esperadas ·{" "}
                {conferidos} conferidas ·{" "}
                {sobras} sobra(s)
              </div>
            </div>

            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[10px] font-black uppercase tracking-wide text-violet-700">
              Em contagem
            </div>
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>
                Progresso
              </span>

              <span>
                {pct}%
              </span>
            </div>

            <ProgressBar
              pct={
                pct
              }
            />
          </div>
        </div>
      </Card>


      <Card>
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
              <Search className="h-4 w-4" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Bipar identificador
              </div>

              <div className="mt-0.5 text-[10px] text-slate-400">
                Leia o IMEI ou serial encontrado fisicamente neste endereço.
              </div>
            </div>
          </div>
        </div>

        <form
          onSubmit={
            handleBipar
          }
          className="flex flex-col gap-3 p-5 sm:flex-row"
        >
          <input
            ref={
              inputRef
            }
            type="text"
            value={
              imeiInput
            }
            onChange={(
              e
            ) =>
              setImeiInput(
                e.target.value
              )
            }
            placeholder="Bipe o IMEI ou serial..."
            autoComplete="off"
            className="h-12 flex-1 rounded-xl border border-slate-200 bg-white px-4 font-mono text-sm font-semibold text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
          />

          <button
            type="submit"
            disabled={
              !imeiInput.trim() ||
              proc
            }
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
          >
            {proc ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}

            Confirmar
          </button>
        </form>
      </Card>


      {historico.length >
        0 && (
        <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="text-sm font-black text-slate-800">
              Últimos bipes
            </div>
          </div>

          <div className="space-y-2 p-5">
            {historico.map(
              (
                item
              ) => {
                const sucesso =
                  item.tipo ===
                  "ok";

                const aviso =
                  item.tipo ===
                  "aviso";

                const Icon =
                  sucesso
                    ? CheckCircle2
                    : aviso
                    ? ArrowLeftRight
                    : AlertTriangle;

                return (
                  <div
                    key={
                      item.ts
                    }
                    className={`flex items-start gap-3 rounded-xl border px-3 py-3 ${
                      sucesso
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : aviso
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                        : "border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0" />

                    <div className="min-w-0">
                      {item.imei && (
                        <div className="break-all font-mono text-xs font-black">
                          {
                            item.imei
                          }
                        </div>
                      )}

                      <div className="mt-0.5 text-[10px] font-semibold">
                        {
                          item.msg
                        }
                      </div>
                    </div>
                  </div>
                );
              }
            )}
          </div>
        </Card>
      )}


      <Card>
        <div className="p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-800">
                Ainda não apareceram
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                {esperados.length} identificador(es) ainda aguardando conferência.
              </div>
            </div>

            <div className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">
              {
                esperados.length
              }
            </div>
          </div>

          {esperados.length >
          0 ? (
            <div className="mt-4 flex max-h-[220px] flex-wrap gap-2 overflow-y-auto">
              {esperados.map(
                (
                  item
                ) => (
                  <span
                    key={
                      item.id
                    }
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[10px] font-semibold text-slate-500"
                  >
                    {item.imei ||
                      "—"}
                  </span>
                )
              )}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
              Tudo que era esperado foi encontrado.
            </div>
          )}

          <button
            type="button"
            onClick={
              handleFechar
            }
            disabled={
              proc
            }
            className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
          >
            {proc ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Lock className="h-4 w-4" />
            )}

            Fechar contagem
          </button>

          {esperados.length >
            0 && (
            <div className="mt-2 text-[10px] font-semibold text-amber-600">
              Ao fechar,{" "}
              {esperados.length} peça(s) serão marcadas como falta.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}


function TabFechamento({
  ciclo,
}) {
  const {
    user,
    profile,
  } = useAuth();

  const [
    data,
    setData,
  ] = useState(
    hojeSP()
  );

  const [
    resumo,
    setResumo,
  ] = useState(null);

  const [
    fechamentos,
    setFechamentos,
  ] = useState([]);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    proc,
    setProc,
  ] = useState(false);

  const [
    expandido,
    setExpandido,
  ] = useState(null);

  const [
    feedback,
    setFeedback,
  ] = useState(null);


  useEffect(() => {
    if (ciclo) {
      carregar();
    } else {
      setLoading(
        false
      );
    }
  }, [
    ciclo,
    data,
  ]);


  async function carregar() {
    if (!ciclo) {
      setLoading(
        false
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const [
        resumoDia,
        historico,
      ] =
        await Promise.all([
          resumoDoDia(
            ciclo.id,
            data
          ),

          listarFechamentos(
            ciclo.id
          ),
        ]);

      setResumo(
        resumoDia
      );

      setFechamentos(
        historico
      );
    } catch (e) {
      setFeedback({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setLoading(
        false
      );
    }
  }


  function gerarPDF(
    dataAlvo,
    resumoAlvo
  ) {
    const doc =
      new jsPDF();

    const roxo = [
      127,
      45,
      146,
    ];

    const totais =
      resumoAlvo.totais;


    doc.setFillColor(
      ...roxo
    );

    doc.rect(
      0,
      0,
      210,
      24,
      "F"
    );

    doc.setTextColor(
      255,
      255,
      255
    );

    doc.setFontSize(
      14
    );

    doc.text(
      "Relatório de fechamento diário — Inventário cíclico",
      14,
      13
    );

    doc.setFontSize(
      9
    );

    doc.text(
      "Liquida Preço · Assurant Warehouse",
      14,
      19
    );

    doc.setTextColor(
      20,
      20,
      20
    );

    doc.setFontSize(
      10
    );

    doc.text(
      `Ciclo: ${ciclo.nome}`,
      14,
      33
    );

    doc.text(
      `Data: ${fmtDataBR(
        dataAlvo
      )}`,
      14,
      39
    );

    doc.text(
      `Emitido: ${new Date().toLocaleString(
        "pt-BR"
      )}`,
      120,
      39
    );


    if (
      resumoAlvo.fechamento
    ) {
      doc.text(
        `Fechado por: ${
          resumoAlvo
            .fechamento
            .fechado_por_nome
        } · ${fmtData(
          resumoAlvo
            .fechamento
            .fechado_em
        )}`,
        14,
        45
      );
    }


    doc.autoTable({
      startY:
        resumoAlvo.fechamento
          ? 51
          : 47,

      head: [[
        "Endereços",
        "Conferidas",
        "Sobras",
        "Faltas",
        "Conflitos",
        "Acur. peça",
        "Acur. endereço",
      ]],

      body: [[
        totais.enderecos,
        totais.conferidas,
        totais.sobras,
        totais.faltas,
        totais.conflitos,
        fmtPct(
          totais.acuraciaPeca
        ),
        fmtPct(
          totais.acuraciaEndereco
        ),
      ]],

      styles: {
        fontSize: 9,
        halign: "center",
      },

      headStyles: {
        fillColor:
          roxo,
        halign: "center",
      },
    });


    doc.autoTable({
      startY:
        doc.lastAutoTable
          .finalY + 6,

      head: [[
        "Endereço",
        "Operador",
        "Esp.",
        "Conf.",
        "Sob.",
        "Falt.",
        "Status",
      ]],

      body:
        resumoAlvo.contagens.map(
          (
            contagem
          ) => [
            contagem.endereco,
            contagem.operador_nome ||
              "—",
            contagem.esperadas ||
              0,
            contagem.conferidas,
            contagem.sobras,
            contagem.faltas,
            contagem.perfeito
              ? "Perfeito"
              : "Divergência",
          ]
        ),

      styles: {
        fontSize: 8,
      },

      headStyles: {
        fillColor:
          roxo,
      },
    });


    const divergentes =
      [];

    resumoAlvo.contagens.forEach(
      (
        contagem
      ) => {
        contagem.itens.forEach(
          (
            item
          ) => {
            if (
              [
                "falta",
                "sobra",
                "conflito",
              ].includes(
                item.veredito
              )
            ) {
              divergentes.push([
                item.imei ||
                  "—",
                contagem.endereco,
                item.veredito ===
                "falta"
                  ? "Falta"
                  : item.veredito ===
                    "sobra"
                  ? "Sobra"
                  : "Conflito",
                item.endereco_anterior ||
                  "—",
              ]);
            }
          }
        );
      }
    );


    if (
      divergentes.length
    ) {
      const yTit =
        doc.lastAutoTable
          .finalY + 8;

      doc.setFontSize(
        10
      );

      doc.text(
        "Anexo — Divergências detalhadas",
        14,
        yTit
      );

      doc.autoTable({
        startY:
          yTit + 3,

        head: [[
          "IMEI",
          "Endereço",
          "Tipo",
          "Era esperado em",
        ]],

        body:
          divergentes,

        styles: {
          fontSize: 8,
        },

        headStyles: {
          fillColor:
            roxo,
        },
      });
    }


    let y =
      doc.lastAutoTable
        .finalY + 26;

    if (
      y > 250
    ) {
      doc.addPage();

      y = 40;
    }

    doc.setDrawColor(
      60,
      60,
      60
    );

    doc.line(
      20,
      y,
      90,
      y
    );

    doc.line(
      120,
      y,
      190,
      y
    );

    doc.setFontSize(
      10
    );

    doc.text(
      "Contado por",
      20,
      y + 6
    );

    doc.text(
      "Conferido por",
      120,
      y + 6
    );

    doc.save(
      `fechamento_inventario_${dataAlvo}.pdf`
    );
  }


  async function handleFechar() {
    if (
      proc ||
      !resumo
    ) {
      return;
    }

    if (
      !resumo.contagens
        .length
    ) {
      setFeedback({
        tipo: "aviso",
        msg: `Nenhuma contagem concluída em ${fmtDataBR(
          data
        )}.`,
      });

      return;
    }

    setProc(
      true
    );

    setFeedback(
      null
    );

    try {
      const resposta =
        await fecharDia(
          ciclo.id,
          data,
          user.id,
          profile?.nome
        );

      if (
        !resposta.ok
      ) {
        setFeedback({
          tipo: "aviso",
          msg:
            resposta.erro,
        });

        return;
      }

      setFeedback({
        tipo: "ok",
        msg: `Dia ${fmtDataBR(
          data
        )} fechado · PDF gerado.`,
      });

      gerarPDF(
        data,
        resposta.resumo
      );

      await carregar();
    } catch (e) {
      setFeedback({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );
    }
  }


  async function handleReimprimir(
    dataAlvo
  ) {
    if (proc) {
      return;
    }

    setProc(
      true
    );

    try {
      const dados =
        await resumoDoDia(
          ciclo.id,
          dataAlvo
        );

      gerarPDF(
        dataAlvo,
        dados
      );
    } catch (e) {
      setFeedback({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );
    }
  }


  if (!ciclo) {
    return (
      <Card>
        <div className="py-16 text-center">
          <ClipboardList className="mx-auto h-9 w-9 text-slate-300" />

          <div className="mt-3 text-sm font-black text-slate-700">
            Nenhum ciclo aberto
          </div>
        </div>
      </Card>
    );
  }


  const totais =
    resumo?.totais;

  const jaFechado =
    resumo?.fechamento;


  return (
    <div className="space-y-4">
      <Feedback
        feedback={
          feedback
        }
      />


      <Card>
        <div className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-black text-slate-800">
                Fechamento diário
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Consolidação das contagens concluídas no dia.
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-violet-700" />

              <input
                type="date"
                value={
                  data
                }
                max={
                  hojeSP()
                }
                onChange={(
                  e
                ) =>
                  setData(
                    e.target.value
                  )
                }
                className="h-9 rounded-xl border border-slate-200 px-3 text-xs font-bold text-slate-600 outline-none focus:border-violet-300"
              />

              <button
                type="button"
                onClick={
                  carregar
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          {jaFechado && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[10px] font-semibold text-emerald-700">
              Dia fechado por{" "}
              {
                jaFechado.fechado_por_nome
              }{" "}
              em{" "}
              {fmtData(
                jaFechado.fechado_em
              )}
            </div>
          )}
        </div>
      </Card>


      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-xs font-semibold text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando fechamento...
        </div>
      ) : !totais ||
        totais.enderecos ===
          0 ? (
        <Card>
          <div className="py-16 text-center">
            <ClipboardCheck className="mx-auto h-9 w-9 text-slate-300" />

            <div className="mt-3 text-sm font-black text-slate-700">
              Nenhuma contagem concluída
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Não há contagens concluídas em{" "}
              {fmtDataBR(
                data
              )}.
            </div>
          </div>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Endereços"
              value={fmtN(
                totais.enderecos
              )}
              helper="Contagens concluídas"
              icon={
                Warehouse
              }
            />

            <KpiCard
              label="Conferidas"
              value={fmtN(
                totais.conferidas
              )}
              helper="Peças localizadas"
              icon={
                CheckCircle2
              }
              variant="emerald"
            />

            <KpiCard
              label="Acuracidade peça"
              value={fmtPct(
                totais.acuraciaPeca
              )}
              helper="Acuracidade física"
              icon={
                ShieldCheck
              }
              variant="blue"
            />

            <KpiCard
              label="Acuracidade endereço"
              value={fmtPct(
                totais.acuraciaEndereco
              )}
              helper="Endereços perfeitos"
              icon={
                MapPin
              }
              variant="violet"
            />
          </div>


          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="text-sm font-black text-slate-800">
                Resultado por endereço
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {resumo.contagens.map(
                (
                  contagem
                ) => {
                  const aberto =
                    expandido ===
                    contagem.id;

                  return (
                    <div
                      key={
                        contagem.id
                      }
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandido(
                            aberto
                              ? null
                              : contagem.id
                          )
                        }
                        className="flex w-full items-center gap-3 px-5 py-4 text-left transition hover:bg-slate-50"
                      >
                        {aberto ? (
                          <ChevronDown className="h-4 w-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400" />
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="font-mono text-xs font-black text-slate-800">
                            {
                              contagem.endereco
                            }
                          </div>

                          <div className="mt-1 text-[10px] text-slate-400">
                            {
                              contagem.operador_nome ||
                              "—"
                            }{" "}
                            ·{" "}
                            {
                              contagem.conferidas
                            }{" "}
                            conferidas ·{" "}
                            {
                              contagem.sobras
                            }{" "}
                            sobras ·{" "}
                            {
                              contagem.faltas
                            }{" "}
                            faltas
                          </div>
                        </div>

                        <div
                          className={`rounded-lg px-2.5 py-1 text-[9px] font-black uppercase ${
                            contagem.perfeito
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {contagem.perfeito
                            ? "Perfeito"
                            : "Divergência"}
                        </div>
                      </button>

                      {aberto && (
                        <div className="bg-slate-50 px-5 py-4">
                          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            {contagem.itens
                              .filter(
                                (
                                  item
                                ) =>
                                  [
                                    "falta",
                                    "sobra",
                                    "conflito",
                                  ].includes(
                                    item.veredito
                                  )
                              )
                              .map(
                                (
                                  item
                                ) => (
                                  <div
                                    key={
                                      item.id
                                    }
                                    className="rounded-xl border border-slate-200 bg-white p-3"
                                  >
                                    <div className="font-mono text-[10px] font-black text-slate-700">
                                      {
                                        item.imei
                                      }
                                    </div>

                                    <div className="mt-1 text-[9px] font-bold uppercase text-rose-600">
                                      {
                                        item.veredito
                                      }
                                    </div>

                                    <div className="mt-1 text-[9px] text-slate-400">
                                      Anterior:{" "}
                                      {
                                        item.endereco_anterior ||
                                        "—"
                                      }
                                    </div>
                                  </div>
                                )
                              )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }
              )}
            </div>

            <div className="border-t border-slate-100 p-5">
              <button
                type="button"
                onClick={
                  handleFechar
                }
                disabled={
                  proc
                }
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
              >
                {proc ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : jaFechado ? (
                  <FileDown className="h-4 w-4" />
                ) : (
                  <PenLine className="h-4 w-4" />
                )}

                {jaFechado
                  ? "Refazer fechamento e gerar PDF"
                  : "Fechar o dia e gerar PDF"}
              </button>
            </div>
          </Card>
        </>
      )}


      {fechamentos.length >
        0 && (
        <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-violet-700" />

              <div className="text-sm font-black text-slate-800">
                Fechamentos anteriores
              </div>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {fechamentos.map(
              (
                item
              ) => (
                <div
                  key={
                    item.id
                  }
                  className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setData(
                        item.data
                      )
                    }
                    className="text-left"
                  >
                    <div className="text-xs font-black text-slate-800">
                      {fmtDataBR(
                        item.data
                      )}
                    </div>

                    <div className="mt-1 text-[10px] text-slate-400">
                      {fmtN(
                        item.enderecos
                      )}{" "}
                      endereços ·{" "}
                      {fmtN(
                        item.conferidas
                      )}{" "}
                      conferidas ·{" "}
                      {fmtN(
                        item.faltas
                      )}{" "}
                      faltas ·{" "}
                      {fmtPct(
                        item.acuracia_peca
                      )}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      handleReimprimir(
                        item.data
                      )
                    }
                    disabled={
                      proc
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 px-3 text-[10px] font-bold text-slate-600 transition hover:border-violet-300 hover:text-violet-700 disabled:opacity-40"
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    Reimprimir
                  </button>
                </div>
              )
            )}
          </div>
        </Card>
      )}
    </div>
  );
}


function TabGestao({
  ciclo,
  onCicloMudou,
  podeSortear,
}) {
  const {
    user,
  } = useAuth();

  const [
    painel,
    setPainel,
  ] = useState(null);

  const [
    conflitos,
    setConflitos,
  ] = useState([]);

  const [
  mapaInventario,
  setMapaInventario,
] = useState([]);

const [
  ruaMapa,
  setRuaMapa,
] = useState(null);

const [
  blocoMapa,
  setBlocoMapa,
] = useState(null);

const [
  andarMapa,
  setAndarMapa,
] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    proc,
    setProc,
  ] = useState(false);

  const [
    feedback,
    setFeedback,
  ] = useState(null);


  useEffect(() => {
    carregar();
  }, [ciclo]);

  useEffect(() => {
  if (
    mapaInventario.length ===
    0
  ) {
    setRuaMapa(
      null
    );

    setBlocoMapa(
      null
    );

    setAndarMapa(
      null
    );

    return;
  }


  const ruas =
    [
      ...new Set(
        mapaInventario
          .map(
            (item) =>
              Number(
                item.rua
              )
          )
          .filter(
            (numero) =>
              Number.isFinite(
                numero
              ) &&
              numero > 0
          )
      ),
    ].sort(
      (a, b) =>
        a - b
    );


  const ruaAtual =
    ruas.includes(
      ruaMapa
    )
      ? ruaMapa
      : ruas[0] ||
        null;


  if (
    ruaAtual !==
    ruaMapa
  ) {
    setRuaMapa(
      ruaAtual
    );
  }


  const blocos =
    [
      ...new Set(
        mapaInventario
          .filter(
            (item) =>
              Number(
                item.rua
              ) ===
              ruaAtual
          )
          .map(
            (item) =>
              Number(
                item.bloco
              )
          )
          .filter(
            (numero) =>
              Number.isFinite(
                numero
              ) &&
              numero > 0
          )
      ),
    ].sort(
      (a, b) =>
        a - b
    );


  const blocoAtual =
    blocos.includes(
      blocoMapa
    )
      ? blocoMapa
      : blocos[0] ||
        null;


  if (
    blocoAtual !==
    blocoMapa
  ) {
    setBlocoMapa(
      blocoAtual
    );
  }


  const andares =
    [
      ...new Set(
        mapaInventario
          .filter(
            (item) =>
              Number(
                item.rua
              ) ===
                ruaAtual &&
              Number(
                item.bloco
              ) ===
                blocoAtual
          )
          .map(
            (item) =>
              Number(
                item.andar
              )
          )
          .filter(
            (numero) =>
              Number.isFinite(
                numero
              ) &&
              numero > 0
          )
      ),
    ].sort(
      (a, b) =>
        a - b
    );


  const andarAtual =
    andares.includes(
      andarMapa
    )
      ? andarMapa
      : andares[0] ||
        null;


  if (
    andarAtual !==
    andarMapa
  ) {
    setAndarMapa(
      andarAtual
    );
  }
}, [
  mapaInventario,
  ruaMapa,
  blocoMapa,
  andarMapa,
]);

  async function carregar() {
    if (!ciclo) {
      setLoading(
        false
      );

      return;
    }

    setLoading(
      true
    );

    try {
      const [
  dadosPainel,
  dadosConflitos,
  dadosMapa,
] =
  await Promise.all([
    painelCiclo(
      ciclo.id
    ),

    listarConflitos(
      ciclo.id
    ),

    mapaInventarioCiclo(
      ciclo.id
    ),
  ]);

setPainel(
  dadosPainel
);

setConflitos(
  dadosConflitos
);

setMapaInventario(
  dadosMapa
);
    } catch (e) {
      console.error(
        e
      );
    } finally {
      setLoading(
        false
      );
    }
  }


  async function handleAbrirCiclo() {
    setProc(
      true
    );

    try {
      const resposta =
        await abrirCiclo(
          nomeDoCicloAtual(),
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

      setFeedback({
        tipo: "ok",
        msg: `${resposta.ciclo.nome} aberto.`,
      });

      await onCicloMudou();
    } catch (e) {
      setFeedback({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );
    }
  }


  async function handleSortear() {
    setProc(
      true
    );

    setFeedback(
      null
    );

    try {
      const resposta =
        await sortearDia(
          ciclo.id
        );

      if (
        !resposta.ok
      ) {
        setFeedback({
          tipo: "aviso",
          msg:
            resposta.erro,
        });
      } else {
        setFeedback({
          tipo: "ok",
          msg: `${resposta.criadas} endereços sorteados · ${fmtN(
            resposta.restantes
          )} restantes no ciclo.`,
        });
      }

      await carregar();
    } catch (e) {
      setFeedback({
        tipo: "erro",
        msg: e.message,
      });
    } finally {
      setProc(
        false
      );
    }
  }

const ruasMapa =
  [
    ...new Set(
      mapaInventario
        .map(
          (item) =>
            Number(
              item.rua
            )
        )
        .filter(
          (numero) =>
            Number.isFinite(
              numero
            ) &&
            numero > 0
        )
    ),
  ].sort(
    (a, b) =>
      a - b
  );


const blocosMapa =
  [
    ...new Set(
      mapaInventario
        .filter(
          (item) =>
            Number(
              item.rua
            ) ===
            ruaMapa
        )
        .map(
          (item) =>
            Number(
              item.bloco
            )
        )
        .filter(
          (numero) =>
            Number.isFinite(
              numero
            ) &&
            numero > 0
        )
    ),
  ].sort(
    (a, b) =>
      a - b
  );


const andaresMapa =
  [
    ...new Set(
      mapaInventario
        .filter(
          (item) =>
            Number(
              item.rua
            ) ===
              ruaMapa &&
            Number(
              item.bloco
            ) ===
              blocoMapa
        )
        .map(
          (item) =>
            Number(
              item.andar
            )
        )
        .filter(
          (numero) =>
            Number.isFinite(
              numero
            ) &&
            numero > 0
        )
    ),
  ].sort(
    (a, b) =>
      b - a
  );


const apartamentosMapa =
  mapaInventario
    .filter(
      (item) =>
        Number(
          item.rua
        ) ===
          ruaMapa &&
        Number(
          item.bloco
        ) ===
          blocoMapa &&
        Number(
          item.andar
        ) ===
          andarMapa
    )
    .sort(
      (a, b) =>
        String(
          a.apartamento || ""
        ).localeCompare(
          String(
            b.apartamento || ""
          ),
          "pt-BR",
          {
            numeric: true,
          }
        )
    );


const resumoMapa = {
  validado:
    mapaInventario.filter(
      (item) =>
        item.status_mapa ===
        "validado"
    ).length,

  divergencia:
    mapaInventario.filter(
      (item) =>
        item.status_mapa ===
        "divergencia"
    ).length,

  pendente:
    mapaInventario.filter(
      (item) =>
        item.status_mapa ===
        "pendente"
    ).length,
};

const mapaPorPosicaoInventario =
  new Map();

apartamentosMapa.forEach(
  (item) => {
    const apartamento =
      String(
        item.apartamento || ""
      )
        .trim()
        .toUpperCase()
        .replace(
          /\s+/g,
          ""
        )
        .replace(
          /^AP[-_/]?/,
          ""
        );

    const match =
      apartamento.match(
        /^([A-F])0?(\d{1,2})$/
      );

    if (!match) {
      return;
    }

    const coluna =
      match[1];

    const linha =
      Number(
        match[2]
      );

    if (
      linha < 1 ||
      linha > 10
    ) {
      return;
    }

    mapaPorPosicaoInventario.set(
      `${coluna}-${linha}`,
      item
    );
  }
);

function statusGrupoInventario(
  itensGrupo
) {
  if (
    !itensGrupo ||
    itensGrupo.length === 0
  ) {
    return "sem_estoque";
  }

  if (
    itensGrupo.some(
      (item) =>
        item.status_mapa ===
        "divergencia"
    )
  ) {
    return "divergencia";
  }

  if (
    itensGrupo.some(
      (item) =>
        item.status_mapa ===
        "pendente"
    )
  ) {
    return "pendente";
  }

  return "validado";
}
function resumoGrupoInventario(
  itensGrupo
) {
  const itens =
    itensGrupo || [];


  const concluidos =
    itens.filter(
      (item) =>
        [
          "validado",
          "divergencia",
        ].includes(
          item.status_mapa
        )
    );


  const validados =
    concluidos.filter(
      (item) =>
        item.status_mapa ===
        "validado"
    ).length;


  const divergentes =
    concluidos.filter(
      (item) =>
        item.status_mapa ===
        "divergencia"
    ).length;


  const pendentes =
    itens.filter(
      (item) =>
        item.status_mapa ===
        "pendente"
    ).length;


  const acuracidade =
    concluidos.length > 0
      ? (
          validados /
          concluidos.length
        ) * 100
      : null;


  return {
    total:
      itens.length,

    concluidos:
      concluidos.length,

    validados,

    divergentes,

    pendentes,

    acuracidade,
  };
  
}

function corAcuracidadeInventario(
  acuracidade
) {
  if (
    acuracidade === null ||
    acuracidade === undefined
  ) {
    return {
      dot: "bg-slate-300",
      cell:
        "bg-slate-50 text-slate-500 ring-slate-200 hover:bg-slate-100",
    };
  }


  if (
    acuracidade >= 100
  ) {
    return {
      dot: "bg-emerald-700",
      cell:
        "bg-emerald-200 text-emerald-950 ring-emerald-400 hover:bg-emerald-300",
    };
  }


  if (
    acuracidade >= 95
  ) {
    return {
      dot: "bg-emerald-600",
      cell:
        "bg-emerald-100 text-emerald-950 ring-emerald-300 hover:bg-emerald-200",
    };
  }


  if (
    acuracidade >= 80
  ) {
    return {
      dot: "bg-lime-600",
      cell:
        "bg-lime-100 text-lime-950 ring-lime-300 hover:bg-lime-200",
    };
  }


  if (
    acuracidade >= 60
  ) {
    return {
      dot: "bg-amber-500",
      cell:
        "bg-amber-100 text-amber-950 ring-amber-300 hover:bg-amber-200",
    };
  }


  if (
    acuracidade >= 40
  ) {
    return {
      dot: "bg-orange-500",
      cell:
        "bg-orange-100 text-orange-950 ring-orange-300 hover:bg-orange-200",
    };
  }


  if (
    acuracidade >= 20
  ) {
    return {
      dot: "bg-rose-500",
      cell:
        "bg-rose-100 text-rose-950 ring-rose-300 hover:bg-rose-200",
    };
  }


  return {
    dot: "bg-red-700",
    cell:
      "bg-red-200 text-red-950 ring-red-400 hover:bg-red-300",
  };
}

  if (!ciclo) {
    return (
      <div className="space-y-4">
        <Feedback
          feedback={
            feedback
          }
        />

        <Card>
          <div className="py-16 text-center">
            <ClipboardList className="mx-auto h-10 w-10 text-slate-300" />

            <div className="mt-3 text-sm font-black text-slate-700">
              Nenhum ciclo aberto
            </div>

            <div className="mt-1 text-xs text-slate-400">
              Abra um novo ciclo para iniciar o inventário cíclico.
            </div>

            {podeSortear && (
              <button
                type="button"
                onClick={
                  handleAbrirCiclo
                }
                disabled={
                  proc
                }
                className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
              >
                {proc ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ClipboardCheck className="h-4 w-4" />
                )}

                Abrir{" "}
                {nomeDoCicloAtual()}
              </button>
            )}
          </div>
        </Card>
      </div>
    );
  }


  const pctCiclo =
    painel &&
    painel.totalEnderecos >
      0
      ? Math.round(
          (painel.concluidas /
            painel.totalEnderecos) *
            100
        )
      : 0;


  return (
    <div className="space-y-4">
      <Feedback
        feedback={
          feedback
        }
      />


      <Card>
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="text-sm font-black text-slate-900">
                {
                  ciclo.nome
                }
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Aberto em{" "}
                {fmtData(
                  ciclo.inicio
                )}
                {painel &&
                  ` · ${fmtN(
                    painel.concluidas
                  )} de ${fmtN(
                    painel.totalEnderecos
                  )} endereços`}
              </div>
            </div>

            {podeSortear && (
              <button
                type="button"
                onClick={
                  handleSortear
                }
                disabled={
                  proc
                }
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
              >
                {proc ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Dices className="h-4 w-4" />
                )}

                Sortear o dia
              </button>
            )}
          </div>

          <div className="mt-5">
            <div className="mb-2 flex items-center justify-between text-[10px] font-bold text-slate-400">
              <span>
                Progresso do ciclo
              </span>

              <span>
                {pctCiclo}%
              </span>
            </div>

            <ProgressBar
              pct={
                pctCiclo
              }
            />
          </div>
        </div>
      </Card>


      {loading ? (
        <div className="flex min-h-[220px] items-center justify-center gap-2 text-xs font-semibold text-violet-600">
          <Loader2 className="h-4 w-4 animate-spin" />
          Carregando gestão...
        </div>
      ) : (
        painel && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <KpiCard
                label="Acuracidade por peça"
                value={fmtPct(
                  painel.acuraciaPeca
                )}
                helper={`${fmtN(
                  painel.conferidos
                )} peças conferidas`}
                icon={
                  ShieldCheck
                }
                variant="emerald"
              />

              <KpiCard
                label="Acuracidade por endereço"
                value={fmtPct(
                  painel.acuraciaEndereco
                )}
                helper={`${fmtN(
                  painel.perfeitos
                )} endereços perfeitos`}
                icon={
                  MapPin
                }
                variant="blue"
              />
            </div>

<Card>
  <div className="border-b border-slate-100 px-5 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Warehouse className="h-4 w-4" />
        </div>

        <div>
          <div className="text-sm font-black text-slate-800">
            Mapa do inventário
          </div>

          <div className="mt-0.5 text-[10px] text-slate-400">
            Status físico dos endereços neste ciclo.
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[9px] font-bold">
  <span className="text-slate-400">
    Acuracidade:
  </span>

  <span className="flex items-center gap-1.5 text-emerald-800">
    <span className="h-2.5 w-2.5 rounded-full bg-emerald-700" />
    100%
  </span>

  <span className="flex items-center gap-1.5 text-emerald-700">
    <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" />
    95–99,9%
  </span>

  <span className="flex items-center gap-1.5 text-lime-700">
    <span className="h-2.5 w-2.5 rounded-full bg-lime-600" />
    80–94,9%
  </span>

  <span className="flex items-center gap-1.5 text-amber-700">
    <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
    60–79,9%
  </span>

  <span className="flex items-center gap-1.5 text-orange-700">
    <span className="h-2.5 w-2.5 rounded-full bg-orange-500" />
    40–59,9%
  </span>

  <span className="flex items-center gap-1.5 text-rose-700">
    <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
    20–39,9%
  </span>

  <span className="flex items-center gap-1.5 text-red-800">
    <span className="h-2.5 w-2.5 rounded-full bg-red-700" />
    0–19,9%
  </span>

  <span className="flex items-center gap-1.5 text-slate-400">
    <span className="h-2.5 w-2.5 rounded-full bg-slate-300" />
    Sem contagem
  </span>
</div>
    </div>
  </div>


  <div className="p-5">
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-[repeat(15,minmax(0,1fr))]">
      {ruasMapa.map(
        (numero) => {
          const itensRua =
            mapaInventario.filter(
              (item) =>
                Number(item.rua) ===
                numero
            );

          const resumoRua =
  resumoGrupoInventario(
    itensRua
  );

const config =
  corAcuracidadeInventario(
    resumoRua.acuracidade
  );

          return (
            <button
              type="button"
              key={numero}
              onClick={() =>
                setRuaMapa(
                  numero
                )
              }
              className={`min-h-[58px] rounded-xl px-3 py-2 text-left ring-1 transition ${
                config.cell
              } ${
                ruaMapa === numero
                  ? "outline outline-2 outline-offset-1 outline-violet-600"
                  : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black">
                  RUA{" "}
                  {String(
                    numero
                  ).padStart(
                    2,
                    "0"
                  )}
                </span>

                <span
                  className={`h-2 w-2 rounded-full ${config.dot}`}
                />
              </div>

              <div className="mt-2 text-[10px] font-black">
  {resumoRua.acuracidade !== null
    ? `${resumoRua.acuracidade
        .toFixed(1)
        .replace(".", ",")}%`
    : "—"}
</div>

<div className="mt-0.5 text-[8px] font-bold opacity-75">
  {resumoRua.concluidos} de{" "}
  {resumoRua.total} APs
</div>
            </button>
          );
        }
      )}
    </div>


    <div className="mt-5 flex flex-wrap items-center gap-2">
      <span className="mr-1 text-[10px] font-black uppercase text-slate-400">
        Bloco
      </span>

      {blocosMapa.map(
        (numero) => {
          const itensBloco =
            mapaInventario.filter(
              (item) =>
                Number(item.rua) ===
                  ruaMapa &&
                Number(item.bloco) ===
                  numero
            );

          const resumoBloco =
  resumoGrupoInventario(
    itensBloco
  );

const config =
  corAcuracidadeInventario(
    resumoBloco.acuracidade
  );

          return (
            <button
              type="button"
              key={numero}
              onClick={() =>
                setBlocoMapa(
                  numero
                )
              }
              className={`min-h-11 rounded-lg px-3 py-1.5 text-[10px] font-bold ring-1 transition ${
                config.cell
              } ${
                blocoMapa === numero
                  ? "outline outline-2 outline-offset-1 outline-violet-600"
                  : ""
              }`}
            >
              <div>
  <div className="flex items-center gap-2">
    <span>
      BL{" "}
      {String(
        numero
      ).padStart(
        2,
        "0"
      )}
    </span>

    <span
      className={`h-2 w-2 rounded-full ${config.dot}`}
    />
  </div>

  <div className="mt-1 text-[10px] font-black">
    {resumoBloco.acuracidade !== null
      ? `${resumoBloco.acuracidade
          .toFixed(1)
          .replace(".", ",")}%`
      : "—"}
  </div>

  <div className="mt-0.5 text-[8px] font-bold opacity-75">
    {resumoBloco.concluidos} de{" "}
    {resumoBloco.total} APs
  </div>
</div>
            </button>
          );
        }
      )}


      <span className="ml-3 mr-1 text-[10px] font-black uppercase text-slate-400">
        Andar
      </span>

      {andaresMapa.map(
        (numero) => {
          const itensAndar =
            mapaInventario.filter(
              (item) =>
                Number(item.rua) ===
                  ruaMapa &&
                Number(item.bloco) ===
                  blocoMapa &&
                Number(item.andar) ===
                  numero
            );

          const resumoAndar =
  resumoGrupoInventario(
    itensAndar
  );

const config =
  corAcuracidadeInventario(
    resumoAndar.acuracidade
  );

          return (
            <button
              type="button"
              key={numero}
              onClick={() =>
                setAndarMapa(
                  numero
                )
              }
              className={`min-h-11 rounded-lg px-3 py-1.5 text-[10px] font-bold ring-1 transition ${
                config.cell
              } ${
                andarMapa === numero
                  ? "outline outline-2 outline-offset-1 outline-violet-600"
                  : ""
              }`}
            >
              <div>
  <div className="flex items-center gap-2">
    <span>
      AD{" "}
      {String(
        numero
      ).padStart(
        2,
        "0"
      )}
    </span>

    <span
      className={`h-2 w-2 rounded-full ${config.dot}`}
    />
  </div>

  <div className="mt-1 text-[10px] font-black">
    {resumoAndar.acuracidade !== null
      ? `${resumoAndar.acuracidade
          .toFixed(1)
          .replace(".", ",")}%`
      : "—"}
  </div>

  <div className="mt-0.5 text-[8px] font-bold opacity-75">
    {resumoAndar.concluidos} de{" "}
    {resumoAndar.total} APs
  </div>
</div>
            </button>
          );
        }
      )}
    </div>
    <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
  <div className="min-w-[690px]">
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns:
          "38px repeat(6, minmax(92px, 1fr))",
      }}
    >
      <div />

      {COLUNAS_INVENTARIO.map(
        (coluna) => (
          <div
            key={coluna}
            className="pb-1 text-center text-[10px] font-black text-slate-400"
          >
            COL {coluna}
          </div>
        )
      )}


      {LINHAS_INVENTARIO.flatMap(
        (linha) => [
          <div
            key={`linha-${linha}`}
            className="flex items-center justify-center text-[10px] font-black text-slate-400"
          >
            {String(
              linha
            ).padStart(
              2,
              "0"
            )}
          </div>,

          ...COLUNAS_INVENTARIO.map(
            (coluna) => {
              const item =
                mapaPorPosicaoInventario.get(
                  `${coluna}-${linha}`
                );

              const status =
                item?.status_mapa ||
                "sem_estoque";

              const config =
                STATUS_MAPA_INVENTARIO[
                  status
                ] ||
                STATUS_MAPA_INVENTARIO
                  .sem_estoque;

              const textoSecundario =
                status ===
                "divergencia"
                  ? `${fmtN(
                      item?.divergencias ||
                        0
                    )} divergência(s)`
                  : status ===
                    "validado"
                  ? "Validado"
                  : status ===
                    "pendente"
                  ? item?.status_contagem ===
                    "em_contagem"
                    ? "Em contagem"
                    : "Pendente"
                  : "Sem estoque";

              return (
                <div
                  key={`${coluna}-${linha}`}
                  title={
                    item?.endereco ||
                    `AP ${coluna}${String(
                      linha
                    ).padStart(
                      2,
                      "0"
                    )}`
                  }
                  className={`min-h-[66px] rounded-xl p-2 text-left ring-1 transition ${config.cell}`}
                >
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[11px] font-black">
                      AP{" "}
                      {coluna}
                      {String(
                        linha
                      ).padStart(
                        2,
                        "0"
                      )}
                    </span>

                    <span
                      className={`h-2.5 w-2.5 shrink-0 rounded-full ${config.dot}`}
                    />
                  </div>

                  <div className="mt-1 truncate text-[9px] font-black">
                    {
                      config.label
                    }
                  </div>

                  <div className="mt-0.5 truncate text-[8px] font-semibold opacity-70">
                    {
                      textoSecundario
                    }
                  </div>
                </div>
              );
            }
          ),
        ]
      )}
    </div>
  </div>
</div>
  </div>
</Card>

            <Card>
              <div className="border-b border-slate-100 px-5 py-4">
                <div className="text-sm font-black text-slate-800">
                  Divergências do ciclo
                </div>
              </div>

              <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-5">
                <KpiCard
                  label="Conferidas"
                  value={fmtN(
                    painel.conferidos
                  )}
                  icon={
                    CheckCircle2
                  }
                  variant="emerald"
                />

                <KpiCard
                  label="Sobras"
                  value={fmtN(
                    painel.sobras
                  )}
                  icon={
                    ArrowLeftRight
                  }
                  variant="amber"
                />

                <KpiCard
                  label="Reconciliadas"
                  value={fmtN(
                    painel.reconciliadas
                  )}
                  icon={
                    RefreshCw
                  }
                  variant="blue"
                />

                <KpiCard
                  label="Fantasmas"
                  value={fmtN(
                    painel.fantasmas
                  )}
                  icon={
                    AlertTriangle
                  }
                  variant="rose"
                />

                <KpiCard
                  label="Conflitos"
                  value={fmtN(
                    painel.conflitos
                  )}
                  icon={
                    AlertTriangle
                  }
                  variant="rose"
                />
              </div>

              <div className="border-t border-slate-100 px-5 py-3 text-[10px] text-slate-400">
                Fantasmas somente se tornam perda quando o ciclo é encerrado.
              </div>
            </Card>


            {conflitos.length >
              0 && (
              <Card className="border-rose-200">
                <div className="border-b border-rose-100 px-5 py-4">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-rose-600" />

                    <div className="text-sm font-black text-slate-800">
                      Conflitos para tratar com a Assurant
                    </div>

                    <div className="rounded-lg bg-rose-50 px-2 py-1 text-[9px] font-black text-rose-700">
                      {
                        conflitos.length
                      }
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-rose-100">
                  {conflitos.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={`${item.imei}-${index}`}
                        className="flex flex-wrap items-center justify-between gap-3 px-5 py-4"
                      >
                        <div>
                          <div className="font-mono text-xs font-black text-rose-800">
                            {
                              item.imei
                            }
                          </div>

                          <div className="mt-1 text-[10px] text-rose-600">
                            Era esperado em{" "}
                            {
                              item.endereco_anterior ||
                              "sem endereço"
                            }
                          </div>
                        </div>

                        <div className="text-[9px] font-semibold text-slate-400">
                          {fmtData(
                            item.bipado_em
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </Card>
            )}
          </>
        )
      )}
    </div>
  );
}


export default function InventarioV2Page() {
  const {
    profile,
  } = useAuth();

  const [
    aba,
    setAba,
  ] = useState(
    "contagem"
  );

  const [
    ciclo,
    setCiclo,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);


  const podeSortear =
    profile?.is_master ||
    profile?.telas_permitidas?.includes(
      "/inventario/sortear"
    );


  useEffect(() => {
    carregarCiclo();
  }, []);


  async function carregarCiclo() {
    setLoading(
      true
    );

    try {
      const dados =
        await cicloAberto();

      setCiclo(
        dados
      );
    } catch (e) {
      console.error(
        e
      );
    } finally {
      setLoading(
        false
      );
    }
  }


  const ABAS = [
    {
      key: "contagem",
      label: "Contagem",
      icon:
        ClipboardList,
    },

    {
      key: "fechamento",
      label:
        "Fechamento",
      icon:
        FileDown,
    },

    {
      key: "gestao",
      label: "Gestão",
      icon:
        BarChart3,
    },
  ];


  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center gap-2 text-xs font-semibold text-violet-600">
        <Loader2 className="h-4 w-4 animate-spin" />
        Carregando inventário...
      </div>
    );
  }


  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900">
            Inventário Cíclico
          </h1>

          <p className="mt-1 text-[11px] text-slate-400">
            Contagem física por endereço, tratamento de divergências e acompanhamento de acuracidade.
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white px-4 py-2 shadow-sm">
          <div className="text-[8px] font-black uppercase tracking-[0.14em] text-slate-400">
            Ciclo atual
          </div>

          <div className="mt-0.5 text-xs font-black text-slate-700">
            {ciclo
              ? ciclo.nome
              : "Nenhum ciclo aberto"}
          </div>
        </div>
      </div>


      <div className="inline-flex max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        {ABAS.map(
          (
            item
          ) => {
            const Icon =
              item.icon;

            const ativa =
              aba ===
              item.key;

            return (
              <button
                type="button"
                key={
                  item.key
                }
                onClick={() =>
                  setAba(
                    item.key
                  )
                }
                className={`inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg px-4 text-xs font-bold transition ${
                  ativa
                    ? "bg-violet-700 text-white"
                    : "text-slate-500 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />

                {
                  item.label
                }
              </button>
            );
          }
        )}
      </div>


      {aba ===
        "contagem" && (
        <TabContagem
          ciclo={
            ciclo
          }
        />
      )}

      {aba ===
        "fechamento" && (
        <TabFechamento
          ciclo={
            ciclo
          }
        />
      )}

      {aba ===
        "gestao" && (
        <TabGestao
          ciclo={
            ciclo
          }
          onCicloMudou={
            carregarCiclo
          }
          podeSortear={
            podeSortear
          }
        />
      )}
    </div>
  );
}