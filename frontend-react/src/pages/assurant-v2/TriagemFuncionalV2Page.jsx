import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  AlertTriangle,
  ArrowLeft,
  BatteryCharging,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  Smartphone,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";

import {
  consultarVoucher,
  validarImeiTradein,
  registrarDivergenciaImei,
  registrarDivergenciaImeiDevolucao,
  buscarPerguntas,
  listarDefeitos,
  salvarTriagemFuncional,
  carregarCatalogo,
  cadastrarModeloPendente,
  buscarFaixasBateria,
  listarAguardandoFuncional,
  classificarBateria,
  resolverSku,
} from "../../services/triagemFuncionalService.js";

const ETAPAS = [
  {
    key: "voucher",
    label: "Voucher",
    icon: Search,
  },
  {
    key: "produto",
    label: "Produto",
    icon: Smartphone,
  },
  {
    key: "imei",
    label: "IMEI",
    icon: ScanLine,
  },
  {
    key: "perguntas",
    label: "Testes",
    icon: ClipboardCheck,
  },
  {
    key: "bateria",
    label: "Bateria",
    icon: BatteryCharging,
  },
  {
    key: "fim",
    label: "Resultado",
    icon: CheckCircle2,
  },
];

function indiceEtapa(etapa) {
  const index =
    ETAPAS.findIndex(
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
      icon:
        "text-emerald-600",
      Icon:
        CheckCircle2,
    },

    aviso: {
      container:
        "border-amber-200 bg-amber-50 text-amber-800",
      icon:
        "text-amber-600",
      Icon:
        AlertTriangle,
    },

    erro: {
      container:
        "border-rose-200 bg-rose-50 text-rose-800",
      icon:
        "text-rose-600",
      Icon:
        ShieldAlert,
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
      <div className="flex min-w-[720px] items-center">
        {ETAPAS.map(
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
                      flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition
                      ${
                        concluida
                          ? "bg-emerald-500 text-white"
                          : ativa
                          ? "bg-violet-700 text-white shadow-sm"
                          : "bg-slate-100 text-slate-400"
                      }
                    `}
                  >
                    {concluida ? (
                      <CheckCircle2 className="h-4 w-4" />
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
                  ETAPAS.length -
                    1 && (
                  <div
                    className={`mx-4 h-px flex-1 ${
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

function Campo({
  label,
  helper,
  children,
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold text-slate-600">
        {label}
      </span>

      {helper && (
        <span className="ml-1 text-[10px] font-medium text-slate-400">
          {helper}
        </span>
      )}

      <div className="mt-1.5">
        {children}
      </div>
    </label>
  );
}

function ContextoAparelho({
  ctx,
  imei,
  produto,
}) {
  if (!ctx) {
    return null;
  }

  const linhas = [
    {
      label:
        "Voucher",
      value:
        ctx.voucher ||
        "—",
      mono: true,
    },

    {
      label:
        "Canal",
      value:
        ctx.canal ||
        "—",
    },

    {
      label:
        "IMEI",
      value:
        imei ||
        "Ainda não bipado",
      mono: true,
    },

    {
      label:
        "Marca",
      value:
        produto?.marca ||
        "—",
    },

    {
      label:
        "Modelo",
      value:
        produto?.modelo ||
        "—",
    },

    {
      label:
        "Armazenamento",
      value:
        produto?.armazenamento ||
        "—",
    },

    {
      label:
        "Cor",
      value:
        produto?.cor ||
        "—",
    },
  ];

  return (
    <Panel
      title="Aparelho em triagem"
      subtitle="Contexto da operação atual."
      icon={
        Smartphone
      }
    >
      <div className="divide-y divide-slate-100 px-5">
        {linhas.map(
          (item) => (
            <div
              key={
                item.label
              }
              className="flex items-center justify-between gap-4 py-3"
            >
              <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
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
          {ctx.devolucao && (
            <span className="rounded-lg bg-amber-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
              Devolução
            </span>
          )}

          {ctx.temTradein && (
            <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
              TradeIn localizado
            </span>
          )}

          {!ctx.temTradein &&
            ctx.canal ===
              "YBV" && (
              <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
                Sem TradeIn
              </span>
            )}
        </div>
      </div>
    </Panel>
  );
}

function FilaTriagem({
  fila,
  carregando,
  onAtualizar,
  onAbrir,
  bloqueado,
}) {
  return (
    <Panel
      title="Fila da Triagem Funcional"
      subtitle="Aparelhos aguardando atendimento."
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
        <div className="flex items-center justify-center gap-2 px-5 py-10 text-xs font-medium text-slate-400">
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
            Nenhum aparelho aguardando triagem funcional.
          </div>
        </div>
      ) : (
        <div className="max-h-[620px] divide-y divide-slate-100 overflow-y-auto">
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
                      item.devolvido
                        ? "bg-amber-50 text-amber-600"
                        : "bg-violet-50 text-violet-600"
                    }`}
                  >
                    {item.devolvido ? (
                      <RotateCcw className="h-4 w-4" />
                    ) : (
                      <Smartphone className="h-4 w-4" />
                    )}
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

                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {item.devolvido ? (
                        <span
                          title={
                            item.motivo
                          }
                          className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"
                        >
                          Retorno da cosmética
                        </span>
                      ) : (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">
                          Recebimento
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
        <div className="text-[10px] font-semibold text-slate-500">
          {fila.length}{" "}
          {fila.length === 1
            ? "aparelho aguardando"
            : "aparelhos aguardando"}
        </div>
      </div>
    </Panel>
  );
}

export default function TriagemFuncionalV2Page() {
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
    ctx,
    setCtx,
  ] = useState(null);

  const [
    produto,
    setProduto,
  ] = useState({
    marca: "",
    modelo: "",
    armazenamento: "",
    cor: "",
  });

  const [
    imeiDigitado,
    setImeiDigitado,
  ] = useState("");

  const [
    validacao,
    setValidacao,
  ] = useState(null);

  const [
    perguntas,
    setPerguntas,
  ] = useState([]);

  const [
    idx,
    setIdx,
  ] = useState(0);

  const [
    respostas,
    setRespostas,
  ] = useState([]);

  const [
    catalogo,
    setCatalogo,
  ] = useState({
    produtos: [],
  });

  const [
    modeloLivre,
    setModeloLivre,
  ] = useState(false);

  const [
    defeitosCatalogo,
    setDefeitosCatalogo,
  ] = useState([]);

  const [
    pedindoDefeito,
    setPedindoDefeito,
  ] = useState(false);

  const [
    defeitosSel,
    setDefeitosSel,
  ] = useState([]);

  const [
    defeitosTodos,
    setDefeitosTodos,
  ] = useState([]);

  const [
    faixasBateria,
    setFaixasBateria,
  ] = useState([]);

  const [
    valorBateria,
    setValorBateria,
  ] = useState("");

  const [
    resultado,
    setResultado,
  ] = useState(null);

  const [
    fila,
    setFila,
  ] = useState([]);

  const [
    carregandoFila,
    setCarregandoFila,
  ] = useState(true);

  useEffect(() => {
    listarDefeitos()
      .then(
        setDefeitosCatalogo
      )
      .catch(
        () => {}
      );

    carregarCatalogo()
      .then(
        setCatalogo
      )
      .catch(
        () => {}
      );

    buscarFaixasBateria()
      .then(
        setFaixasBateria
      )
      .catch(
        () => {}
      );

    carregarFila();
  }, []);

  const marcas =
    useMemo(
      () =>
        [
          ...new Set(
            catalogo.produtos.map(
              (item) =>
                item.marca
            )
          ),
        ]
          .filter(
            Boolean
          )
          .sort(),
      [
        catalogo,
      ]
    );

  const modelos =
    useMemo(
      () =>
        [
          ...new Set(
            catalogo.produtos
              .filter(
                (item) =>
                  item.marca ===
                  produto.marca
              )
              .map(
                (item) =>
                  item.modelo
              )
          ),
        ]
          .filter(
            Boolean
          )
          .sort(),
      [
        catalogo,
        produto.marca,
      ]
    );

  const capacidades =
    useMemo(
      () =>
        [
          ...new Set(
            catalogo.produtos
              .filter(
                (item) =>
                  item.marca ===
                    produto.marca &&
                  item.modelo ===
                    produto.modelo
              )
              .map(
                (item) =>
                  item.capacidade
              )
          ),
        ]
          .filter(
            Boolean
          )
          .sort(),
      [
        catalogo,
        produto.marca,
        produto.modelo,
      ]
    );

  const cores =
    useMemo(
      () =>
        [
          ...new Set(
            catalogo.produtos
              .filter(
                (item) =>
                  item.marca ===
                    produto.marca &&
                  item.modelo ===
                    produto.modelo &&
                  item.capacidade ===
                    produto.armazenamento
              )
              .map(
                (item) =>
                  item.cor
              )
          ),
        ]
          .filter(
            Boolean
          )
          .sort(),
      [
        catalogo,
        produto.marca,
        produto.modelo,
        produto.armazenamento,
      ]
    );

  const produtoCompleto =
    Boolean(
      produto.marca &&
        produto.modelo &&
        produto.armazenamento &&
        produto.cor
    );

  const classificacaoBateria =
    useMemo(
      () =>
        classificarBateria(
          faixasBateria,
          valorBateria
        ),
      [
        faixasBateria,
        valorBateria,
      ]
    );

  async function carregarFila() {
    setCarregandoFila(
      true
    );

    try {
      setFila(
        await listarAguardandoFuncional()
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
      6000
    );
  }

  function reiniciar() {
    setEtapa(
      "voucher"
    );

    setBusca("");
    setCtx(null);

    setValidacao(
      null
    );

    setImeiDigitado(
      ""
    );

    setPerguntas(
      []
    );

    setIdx(0);

    setRespostas(
      []
    );

    setDefeitosSel(
      []
    );

    setDefeitosTodos(
      []
    );

    setPedindoDefeito(
      false
    );

    setValorBateria(
      ""
    );

    setResultado(
      null
    );

    setProduto({
      marca: "",
      modelo: "",
      armazenamento: "",
      cor: "",
    });

    setModeloLivre(
      false
    );

    carregarFila();
  }

  async function abrirVoucher(
    voucher
  ) {
    setBusca(
      voucher
    );

    setCarregando(
      true
    );

    try {
      const resposta =
        await consultarVoucher(
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

      setCtx(
        resposta
      );

      setProduto({
        marca: "",
        modelo: "",
        armazenamento: "",
        cor: "",
      });

      setModeloLivre(
        false
      );

      setEtapa(
        "produto"
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

  async function handleConsultar() {
    if (
      !busca.trim()
    ) {
      return;
    }

    setCarregando(
      true
    );

    try {
      const resposta =
        await consultarVoucher(
          busca
        );

      if (
        !resposta.ok
      ) {
        mostrarErro(
          resposta.erro
        );

        return;
      }

      setCtx(
        resposta
      );

      /*
       * Mantido propositalmente:
       * os dados não são pré-preenchidos.
       * O operador deve conferir o aparelho físico.
       */
      setProduto({
        marca: "",
        modelo: "",
        armazenamento: "",
        cor: "",
      });

      setModeloLivre(
        false
      );

      setEtapa(
        "produto"
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

  async function handleSalvarProduto() {
    if (
      modeloLivre &&
      produto.marca &&
      produto.modelo
    ) {
      try {
        await cadastrarModeloPendente(
          produto.marca,
          produto.modelo,
          produto.armazenamento,
          produto.cor
        );
      } catch {
        /*
         * Cadastro pendente não pode impedir
         * a continuidade da bancada.
         */
      }
    }

    setEtapa(
      "imei"
    );
  }

  async function handleValidarImei() {
    if (
      !imeiDigitado.trim()
    ) {
      return;
    }

    setCarregando(
      true
    );

    try {
      if (
        ctx.devolucao
      ) {
        const imeiAutorizado =
          ctx.devolucao
            .definicao_assurant_status ===
          "autorizado";

        const imeiEsperado =
          String(
            imeiAutorizado
              ? ctx.devolucao
                  .imei_recebido
              : ctx.devolucao
                  .imei_vendido
          ).replace(
            /\D/g,
            ""
          );

        const imeiBipado =
          String(
            imeiDigitado ||
              ""
          ).replace(
            /\D/g,
            ""
          );

        if (
          imeiEsperado.length !==
          15
        ) {
          throw new Error(
            "A solicitação de devolução não possui um IMEI vendido válido."
          );
        }

        const resposta = {
          ok: true,
          confere:
            imeiBipado ===
            imeiEsperado,
          tipoBase:
            "devolucao",
          imeiEsperado,
        };

        setValidacao(
          resposta
        );

        if (
          resposta.confere
        ) {
          await iniciarPerguntas();
        }

        return;
      }

      if (
        ctx.canal !==
          "YBV" ||
        !ctx.temTradein
      ) {
        setValidacao({
          ok: true,
          confere: true,
          semBase: true,
        });

        await iniciarPerguntas();

        return;
      }

      const resposta =
        await validarImeiTradein(
          ctx.voucher,
          imeiDigitado
        );

      setValidacao(
        resposta
      );

      if (
        resposta.ok &&
        resposta.confere
      ) {
        await iniciarPerguntas();
      }
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

  async function iniciarPerguntas() {
    const tipoPerguntas =
      ctx.tipoPerguntas ||
      ctx.canal ||
      "YBV";

    const lista =
      await buscarPerguntas(
        tipoPerguntas,
        produto.marca
      );

    if (
      !lista.length
    ) {
      mostrarErro(
        `Nenhuma pergunta cadastrada para o canal ${tipoPerguntas}.`
      );

      return;
    }

    setPerguntas(
      lista
    );

    setIdx(0);

    setEtapa(
      "perguntas"
    );
  }

  async function handleConfirmarDivergencia() {
    setCarregando(
      true
    );

    try {
      if (
        ctx.devolucao
      ) {
        await registrarDivergenciaImeiDevolucao(
          ctx.devolucao.id,
          imeiDigitado,
          user.id
        );

        setResultado({
          divergencia: true,
          devolucao: true,
        });
      } else {
        await registrarDivergenciaImei(
          ctx.voucher,
          imeiDigitado,
          user.id,
          validacao?.imeiTradein
        );

        setResultado({
          divergencia: true,
          devolucao: false,
        });
      }

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

  function responder(
    valor
  ) {
    const pergunta =
      perguntas[idx];

    const respostaOk =
      (
        pergunta.resposta_ok ||
        "sim"
      ).toLowerCase();

    const divergente =
      valor.toLowerCase() !==
      respostaOk;

    const novaResposta = {
      perguntaId:
        pergunta.id,

      pergunta:
        pergunta.texto,

      resposta:
        valor,

      divergente,

      geraLaudo:
        divergente &&
        pergunta.gera_laudo,

      bloqueante:
        Boolean(
          pergunta.bloqueante
        ),
    };

    const novaLista = [
      ...respostas,
      novaResposta,
    ];

    setRespostas(
      novaLista
    );

    if (
      divergente &&
      pergunta.exige_defeito
    ) {
      setPedindoDefeito(
        true
      );

      return;
    }

    avancar(
      novaLista
    );
  }

  function avancar(
    lista = respostas
  ) {
    const proximo =
      idx + 1;

    const pergunta =
      perguntas[
        proximo
      ];

    if (
      pergunta &&
      pergunta.tipo_resposta ===
        "bateria"
    ) {
      setEtapa(
        "bateria"
      );

      setValorBateria(
        ""
      );

      return;
    }

    if (
      !pergunta
    ) {
      finalizar(
        lista,
        null
      );

      return;
    }

    setIdx(
      proximo
    );
  }

  function confirmarDefeitos() {
    if (
      !defeitosSel.length
    ) {
      return;
    }

    setDefeitosTodos(
      (anteriores) => [
        ...new Set([
          ...anteriores,
          ...defeitosSel,
        ]),
      ]
    );

    setDefeitosSel(
      []
    );

    setPedindoDefeito(
      false
    );

    avancar();
  }

  function confirmarBateria() {
    const rotulo =
      classificarBateria(
        faixasBateria,
        valorBateria
      );

    if (!rotulo) {
      mostrarErro(
        "Informe a saúde da bateria entre 0 e 100."
      );

      return;
    }

    finalizar(
      respostas,
      rotulo,
      Number(
        valorBateria
      )
    );
  }

  async function finalizar(
    lista,
    bateria,
    percentual = null
  ) {
    setCarregando(
      true
    );

    try {
      const resolucaoSku =
        resolverSku(
          catalogo.produtos,
          {
            marca:
              produto.marca,

            modelo:
              produto.modelo,

            capacidade:
              produto.armazenamento,

            cor:
              produto.cor,
          }
        );

      const resposta =
        await salvarTriagemFuncional({
          voucher:
            ctx.voucher,

          imei:
            imeiDigitado.trim(),

          canal:
            ctx.canal,

          produto: {
            ...produto,

            sku:
              resolucaoSku.sku ||
              ctx.tradein
                ?.sku_base ||
              null,
          },

          respostas:
            lista,

          bateria,

          bateriaPercentual:
            percentual,

          defeitos:
            defeitosTodos,

          userId:
            user.id,

          tradein:
            ctx.tradein,
        });

      if (
        !resposta.ok
      ) {
        mostrarErro(
          resposta.erro
        );

        return;
      }

      setResultado({
        ...resposta,
        bateria,
        bateriaPercentual:
          percentual,
        respostas:
          lista,
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

  const inputClass =
    `
      h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5
      text-sm font-medium text-slate-700 outline-none transition
      placeholder:text-slate-300
      focus:border-violet-300 focus:ring-4 focus:ring-violet-100
      disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400
    `;

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
            Bancada Funcional
          </div>

          <div className="mt-0.5 text-[11px] text-slate-400">
            Processo guiado de identificação, teste e diagnóstico.
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
              subtitle="Bipe ou digite o voucher para iniciar a triagem."
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
                    Utilize o leitor ou digite manualmente. Pressione Enter para consultar.
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
                            "Enter"
                          ) {
                            handleConsultar();
                          }
                        }}
                        placeholder="Bipe o voucher..."
                        className="h-14 w-full rounded-xl border border-violet-200 bg-white pl-12 pr-4 font-mono text-base font-black tracking-wide text-slate-800 outline-none transition placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={
                        handleConsultar
                      }
                      disabled={
                        !busca.trim() ||
                        carregando
                      }
                      className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
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
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Na fila
                    </div>

                    <div className="mt-1 text-xl font-black text-slate-800">
                      {
                        fila.length
                      }
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Origem
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-700">
                      Recebimento / Retorno
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Validação
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-700">
                      TradeIn / Devolução
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* =========================
              ETAPA 2 — PRODUTO
          ========================== */}
          {etapa ===
            "produto" &&
            ctx && (
              <>
                {ctx.bloqueado ? (
                  <Panel
                    title="Aparelho já processado"
                    subtitle="O voucher não pode iniciar uma nova triagem neste momento."
                    icon={
                      ShieldAlert
                    }
                  >
                    <div className="p-5">
                      <Aviso tipo="aviso">
                        <div>
                          <div className="font-black">
                            Este aparelho já foi triado.
                          </div>

                          <div className="mt-2">
                            Etapa atual:{" "}
                            <strong>
                              {ctx.etapa
                                ?.nome ||
                                "Não informada"}
                            </strong>
                          </div>

                          {ctx.etapa
                            ?.onde && (
                            <div className="mt-0.5 font-medium">
                              {
                                ctx.etapa.onde
                              }
                            </div>
                          )}

                          {ctx.etapa
                            ?.desde && (
                            <div className="mt-1 text-[10px] font-medium opacity-80">
                              Desde{" "}
                              {formatarData(
                                ctx.etapa.desde
                              )}
                            </div>
                          )}
                        </div>
                      </Aviso>

                      <button
                        type="button"
                        onClick={
                          reiniciar
                        }
                        className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white transition hover:bg-violet-800"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Bipar outro voucher
                      </button>
                    </div>
                  </Panel>
                ) : (
                  <Panel
                    title="Identificação física do produto"
                    subtitle="Preencha somente com base no aparelho que está na bancada."
                    icon={
                      Smartphone
                    }
                    action={
                      <span className="rounded-lg bg-violet-50 px-2.5 py-1 font-mono text-[10px] font-bold text-violet-700">
                        {
                          ctx.voucher
                        }
                      </span>
                    }
                  >
                    <div className="space-y-5 p-5">
                      {!ctx.temTradein &&
                        ctx.canal ===
                          "YBV" && (
                          <Aviso tipo="aviso">
                            Voucher não encontrado na base TradeIn. A validação de IMEI será pulada conforme a regra atual.
                          </Aviso>
                        )}

                      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <Campo label="Marca">
                          <select
                            value={
                              produto.marca
                            }
                            onChange={(
                              event
                            ) => {
                              setProduto({
                                marca:
                                  event.target.value,
                                modelo:
                                  "",
                                armazenamento:
                                  "",
                                cor:
                                  "",
                              });

                              setModeloLivre(
                                false
                              );
                            }}
                            className={
                              inputClass
                            }
                          >
                            <option value="">
                              Selecione...
                            </option>

                            {marcas.map(
                              (marca) => (
                                <option
                                  key={
                                    marca
                                  }
                                  value={
                                    marca
                                  }
                                >
                                  {
                                    marca
                                  }
                                </option>
                              )
                            )}
                          </select>
                        </Campo>

                        <Campo label="Modelo">
                          {modeloLivre ? (
                            <>
                              <input
                                autoFocus
                                value={
                                  produto.modelo
                                }
                                placeholder="Digite o modelo"
                                onChange={(
                                  event
                                ) =>
                                  setProduto(
                                    {
                                      ...produto,
                                      modelo:
                                        event.target.value.toUpperCase(),
                                    }
                                  )
                                }
                                className={
                                  inputClass
                                }
                              />

                              <button
                                type="button"
                                onClick={() => {
                                  setModeloLivre(
                                    false
                                  );

                                  setProduto(
                                    {
                                      ...produto,
                                      modelo:
                                        "",
                                    }
                                  );
                                }}
                                className="mt-1.5 text-[10px] font-bold text-slate-400 transition hover:text-violet-600"
                              >
                                Voltar para catálogo
                              </button>
                            </>
                          ) : (
                            <select
                              value={
                                produto.modelo
                              }
                              disabled={
                                !produto.marca
                              }
                              onChange={(
                                event
                              ) => {
                                if (
                                  event.target.value ===
                                  "__outro__"
                                ) {
                                  setModeloLivre(
                                    true
                                  );

                                  setProduto(
                                    {
                                      ...produto,
                                      modelo:
                                        "",
                                      armazenamento:
                                        "",
                                      cor:
                                        "",
                                    }
                                  );

                                  return;
                                }

                                setProduto(
                                  {
                                    ...produto,
                                    modelo:
                                      event.target.value,
                                    armazenamento:
                                      "",
                                    cor:
                                      "",
                                  }
                                );
                              }}
                              className={
                                inputClass
                              }
                            >
                              <option value="">
                                {produto.marca
                                  ? "Selecione..."
                                  : "Escolha a marca"}
                              </option>

                              {modelos.map(
                                (modelo) => (
                                  <option
                                    key={
                                      modelo
                                    }
                                    value={
                                      modelo
                                    }
                                  >
                                    {
                                      modelo
                                    }
                                  </option>
                                )
                              )}

                              {produto.marca && (
                                <option value="__outro__">
                                  Não encontrei o modelo
                                </option>
                              )}
                            </select>
                          )}
                        </Campo>

                        <Campo label="Armazenamento">
                          {modeloLivre ||
                          (produto.modelo &&
                            !capacidades.length) ? (
                            <input
                              value={
                                produto.armazenamento
                              }
                              placeholder="Ex: 128GB"
                              onChange={(
                                event
                              ) =>
                                setProduto(
                                  {
                                    ...produto,
                                    armazenamento:
                                      event.target.value.toUpperCase(),
                                  }
                                )
                              }
                              className={
                                inputClass
                              }
                            />
                          ) : (
                            <select
                              value={
                                produto.armazenamento
                              }
                              disabled={
                                !produto.modelo
                              }
                              onChange={(
                                event
                              ) =>
                                setProduto(
                                  {
                                    ...produto,
                                    armazenamento:
                                      event.target.value,
                                    cor:
                                      "",
                                  }
                                )
                              }
                              className={
                                inputClass
                              }
                            >
                              <option value="">
                                {produto.modelo
                                  ? "Selecione..."
                                  : "Escolha o modelo"}
                              </option>

                              {capacidades.map(
                                (
                                  capacidade
                                ) => (
                                  <option
                                    key={
                                      capacidade
                                    }
                                    value={
                                      capacidade
                                    }
                                  >
                                    {
                                      capacidade
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          )}
                        </Campo>

                        <Campo label="Cor">
                          {modeloLivre ||
                          (produto.armazenamento &&
                            !cores.length) ? (
                            <input
                              value={
                                produto.cor
                              }
                              placeholder="Ex: BLACK"
                              onChange={(
                                event
                              ) =>
                                setProduto(
                                  {
                                    ...produto,
                                    cor:
                                      event.target.value.toUpperCase(),
                                  }
                                )
                              }
                              className={
                                inputClass
                              }
                            />
                          ) : (
                            <select
                              value={
                                produto.cor
                              }
                              disabled={
                                !produto.armazenamento
                              }
                              onChange={(
                                event
                              ) =>
                                setProduto(
                                  {
                                    ...produto,
                                    cor:
                                      event.target.value,
                                  }
                                )
                              }
                              className={
                                inputClass
                              }
                            >
                              <option value="">
                                {produto.armazenamento
                                  ? "Selecione..."
                                  : "Escolha a capacidade"}
                              </option>

                              {cores.map(
                                (cor) => (
                                  <option
                                    key={
                                      cor
                                    }
                                    value={
                                      cor
                                    }
                                  >
                                    {
                                      cor
                                    }
                                  </option>
                                )
                              )}
                            </select>
                          )}
                        </Campo>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                        <div className="max-w-[620px] text-[10px] leading-4 text-slate-400">
                          Os campos permanecem em branco propositalmente. O operador deve conferir o equipamento físico, sem confirmar automaticamente o cadastro da loja.
                        </div>

                        <button
                          type="button"
                          onClick={
                            handleSalvarProduto
                          }
                          disabled={
                            !produtoCompleto
                          }
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          Salvar e continuar

                          <ChevronRight className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </Panel>
                )}
              </>
            )}

          {/* =========================
              ETAPA 3 — IMEI
          ========================== */}
          {etapa ===
            "imei" &&
            ctx && (
              <Panel
                title="Validação de IMEI"
                subtitle="Bipe o IMEI físico do aparelho."
                icon={
                  ScanLine
                }
              >
                <div className="space-y-5 p-5">
                  <button
                    type="button"
                    onClick={() =>
                      setEtapa(
                        "produto"
                      )
                    }
                    className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-400 transition hover:text-violet-600"
                  >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Voltar para produto
                  </button>

                  <div className="max-w-[760px] rounded-2xl border border-violet-100 bg-violet-50/40 p-5">
                    <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                      Identificação física
                    </div>

                    <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                      <div className="relative flex-1">
                        <ScanLine className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />

                        <input
                          autoFocus
                          value={
                            imeiDigitado
                          }
                          maxLength={
                            15
                          }
                          placeholder="000000000000000"
                          onChange={(
                            event
                          ) => {
                            setImeiDigitado(
                              event.target.value.replace(
                                /\D/g,
                                ""
                              )
                            );

                            setValidacao(
                              null
                            );
                          }}
                          onKeyDown={(
                            event
                          ) => {
                            if (
                              event.key ===
                              "Enter"
                            ) {
                              handleValidarImei();
                            }
                          }}
                          className="h-14 w-full rounded-xl border border-violet-200 bg-white pl-12 pr-4 font-mono text-lg font-black tracking-[0.08em] text-slate-800 outline-none transition placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={
                          handleValidarImei
                        }
                        disabled={
                          imeiDigitado.length <
                            14 ||
                          carregando
                        }
                        className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {carregando ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4" />
                        )}

                        {carregando
                          ? "Validando..."
                          : "Validar IMEI"}
                      </button>
                    </div>

                    <div className="mt-3 text-[10px] text-slate-400">
                      {ctx.devolucao
                        ? "O IMEI será confrontado com a solicitação de devolução."
                        : ctx.canal ===
                            "YBV" &&
                          ctx.temTradein
                        ? "O IMEI será confrontado com a base TradeIn."
                        : "Não há base de comparação de IMEI para este fluxo."}
                    </div>
                  </div>

                  {validacao &&
                    !validacao.confere && (
                      <div className="max-w-[760px] rounded-2xl border border-rose-200 bg-rose-50 p-5">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-rose-100 text-rose-600">
                            <ShieldAlert className="h-4 w-4" />
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3 className="text-sm font-black text-rose-800">
                              {validacao.tipoBase ===
                              "devolucao"
                                ? "IMEI divergente da solicitação de devolução"
                                : "IMEI divergente do cadastrado na loja"}
                            </h3>

                            <div className="mt-3 grid gap-3 sm:grid-cols-2">
                              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-rose-200">
                                <div className="text-[9px] font-black uppercase tracking-wide text-rose-400">
                                  {validacao.tipoBase ===
                                  "devolucao"
                                    ? "IMEI esperado"
                                    : "IMEI TradeIn"}
                                </div>

                                <div className="mt-1 break-all font-mono text-xs font-bold text-rose-700">
                                  {validacao.imeiEsperado ||
                                    validacao.imeiTradein ||
                                    "Sem registro"}
                                </div>
                              </div>

                              <div className="rounded-xl bg-white/70 p-3 ring-1 ring-rose-200">
                                <div className="text-[9px] font-black uppercase tracking-wide text-rose-400">
                                  IMEI bipado
                                </div>

                                <div className="mt-1 break-all font-mono text-xs font-bold text-rose-700">
                                  {
                                    imeiDigitado
                                  }
                                </div>
                              </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setImeiDigitado(
                                    ""
                                  );

                                  setValidacao(
                                    null
                                  );
                                }}
                                className="h-9 rounded-xl border border-rose-200 bg-white px-4 text-xs font-bold text-rose-700 transition hover:bg-rose-100"
                              >
                                Rebipar
                              </button>

                              <button
                                type="button"
                                onClick={
                                  handleConfirmarDivergencia
                                }
                                disabled={
                                  carregando
                                }
                                className="inline-flex h-9 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white transition hover:bg-rose-700 disabled:opacity-40"
                              >
                                <ShieldAlert className="h-4 w-4" />
                                Confirmar divergência
                              </button>
                            </div>

                            <div className="mt-3 text-[10px] font-semibold leading-4 text-rose-600">
                              Ao confirmar, o equipamento seguirá para definição da Assurant conforme a regra atual.
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                </div>
              </Panel>
            )}

          {/* =========================
              ETAPA 4 — PERGUNTAS
          ========================== */}
          {etapa ===
            "perguntas" &&
            perguntas[
              idx
            ] && (
              <Panel
                title="Testes funcionais"
                subtitle={`Pergunta ${
                  idx + 1
                } de ${
                  perguntas.length
                }`}
                icon={
                  ClipboardCheck
                }
                action={
                  <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                    {Math.round(
                      ((idx +
                        1) /
                        perguntas.length) *
                        100
                    )}
                    %
                  </span>
                }
              >
                <div className="p-5 lg:p-6">
                  <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-violet-600 transition-all duration-300"
                      style={{
                        width: `${Math.round(
                          ((idx +
                            1) /
                            perguntas.length) *
                            100
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="mx-auto mt-8 max-w-[820px]">
                    <div className="text-center">
                      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                        Teste funcional
                      </div>

                      <h3 className="mx-auto mt-3 max-w-[700px] text-xl font-black leading-8 text-slate-900">
                        {
                          perguntas[
                            idx
                          ].texto
                        }
                      </h3>
                    </div>

                    {!pedindoDefeito ? (
                      <div className="mt-8 grid gap-3 sm:grid-cols-2">
                        <button
                          type="button"
                          onClick={() =>
                            responder(
                              "sim"
                            )
                          }
                          className="group rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-5 text-left transition hover:border-emerald-400 hover:bg-emerald-100"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
                              <CheckCircle2 className="h-5 w-5" />
                            </div>

                            <div>
                              <div className="text-sm font-black text-emerald-800">
                                Sim
                              </div>

                              <div className="mt-0.5 text-[10px] text-emerald-700/70">
                                Confirmar resposta positiva
                              </div>
                            </div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            responder(
                              "nao"
                            )
                          }
                          className="group rounded-2xl border border-rose-200 bg-rose-50 px-5 py-5 text-left transition hover:border-rose-400 hover:bg-rose-100"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-600 text-white">
                              <ShieldAlert className="h-5 w-5" />
                            </div>

                            <div>
                              <div className="text-sm font-black text-rose-800">
                                Não
                              </div>

                              <div className="mt-0.5 text-[10px] text-rose-700/70">
                                Registrar resposta negativa
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>
                    ) : (
                      <div className="mt-7 rounded-2xl border border-rose-200 bg-rose-50/50 p-5">
                        <div className="flex items-start gap-3">
                          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />

                          <div>
                            <h4 className="text-sm font-black text-slate-800">
                              Selecione o defeito encontrado
                            </h4>

                            <p className="mt-1 text-[10px] leading-4 text-slate-500">
                              A identificação do defeito é obrigatória para esta resposta e ficará vinculada à pergunta.
                            </p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          {defeitosCatalogo.map(
                            (
                              defeito
                            ) => {
                              const marcado =
                                defeitosSel.includes(
                                  defeito.nome
                                );

                              return (
                                <button
                                  key={
                                    defeito.id
                                  }
                                  type="button"
                                  onClick={() =>
                                    setDefeitosSel(
                                      marcado
                                        ? defeitosSel.filter(
                                            (
                                              nome
                                            ) =>
                                              nome !==
                                              defeito.nome
                                          )
                                        : [
                                            ...defeitosSel,
                                            defeito.nome,
                                          ]
                                    )
                                  }
                                  className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition ${
                                    marcado
                                      ? "border-rose-600 bg-rose-600 text-white"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50"
                                  }`}
                                >
                                  {
                                    defeito.nome
                                  }
                                </button>
                              );
                            }
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={
                            confirmarDefeitos
                          }
                          disabled={
                            !defeitosSel.length
                          }
                          className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Confirmar defeito
                        </button>
                      </div>
                    )}

                    {carregando && (
                      <div className="mt-5 flex items-center justify-center gap-2 text-[10px] font-semibold text-slate-400">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Processando...
                      </div>
                    )}
                  </div>
                </div>
              </Panel>
            )}

          {/* =========================
              ETAPA 5 — BATERIA
          ========================== */}
          {etapa ===
            "bateria" && (
            <Panel
              title="Saúde da bateria"
              subtitle="Registre o percentual apresentado no aparelho."
              icon={
                BatteryCharging
              }
            >
              <div className="p-5 lg:p-6">
                <div className="mx-auto max-w-[680px]">
                  <div className="rounded-2xl border border-violet-100 bg-violet-50/40 p-6 text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
                      <BatteryCharging className="h-6 w-6" />
                    </div>

                    <h3 className="mt-4 text-lg font-black text-slate-900">
                      Qual a saúde da bateria?
                    </h3>

                    <p className="mt-1 text-xs text-slate-500">
                      Informe um valor entre 0 e 100.
                    </p>

                    <div className="mx-auto mt-6 flex max-w-[360px] items-stretch gap-2">
                      <div className="relative flex-1">
                        <input
                          autoFocus
                          type="number"
                          min={
                            0
                          }
                          max={
                            100
                          }
                          value={
                            valorBateria
                          }
                          onChange={(
                            event
                          ) =>
                            setValorBateria(
                              event.target.value
                            )
                          }
                          onKeyDown={(
                            event
                          ) => {
                            if (
                              event.key ===
                              "Enter"
                            ) {
                              confirmarBateria();
                            }
                          }}
                          placeholder="0"
                          className="h-16 w-full rounded-xl border border-violet-200 bg-white px-4 pr-12 text-center font-mono text-2xl font-black text-slate-900 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100"
                        />

                        <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-lg font-bold text-slate-400">
                          %
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={
                          confirmarBateria
                        }
                        disabled={
                          valorBateria ===
                          ""
                        }
                        className="h-16 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
                      >
                        Confirmar
                      </button>
                    </div>

                    {classificacaoBateria && (
                      <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3">
                        <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                          Classificação
                        </div>

                        <div className="mt-1 text-xs font-black text-slate-700">
                          {
                            classificacaoBateria
                          }
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* =========================
              ETAPA 6 — RESULTADO
          ========================== */}
          {etapa ===
            "fim" &&
            resultado && (
              <Panel
                title="Resultado da Triagem Funcional"
                subtitle="Processamento concluído para este aparelho."
                icon={
                  CheckCircle2
                }
              >
                <div className="space-y-5 p-5 lg:p-6">
                  {resultado.divergencia ? (
                    <Aviso tipo="aviso">
                      <div>
                        <div className="font-black">
                          Divergência de IMEI registrada.
                        </div>

                        <div className="mt-1 font-medium">
                          {resultado.devolucao
                            ? "O processo foi bloqueado e encaminhado para definição da Assurant."
                            : "O aparelho foi encaminhado para Aguardando análise Assurant."}
                        </div>
                      </div>
                    </Aviso>
                  ) : (
                    <>
                      <div
                        className={`rounded-2xl border p-5 ${
                          resultado.divergencias
                            ? "border-amber-200 bg-amber-50"
                            : "border-emerald-200 bg-emerald-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                              resultado.divergencias
                                ? "bg-amber-500 text-white"
                                : "bg-emerald-600 text-white"
                            }`}
                          >
                            {resultado.divergencias ? (
                              <AlertTriangle className="h-5 w-5" />
                            ) : (
                              <CheckCircle2 className="h-5 w-5" />
                            )}
                          </div>

                          <div className="min-w-0 flex-1">
                            <h3
                              className={`text-base font-black ${
                                resultado.divergencias
                                  ? "text-amber-900"
                                  : "text-emerald-900"
                              }`}
                            >
                              {resultado.divergencias
                                ? "Triagem concluída com divergências"
                                : "Triagem concluída sem divergências"}
                            </h3>

                            <div
                              className={`mt-1 text-xs ${
                                resultado.divergencias
                                  ? "text-amber-700"
                                  : "text-emerald-700"
                              }`}
                            >
                              Próxima etapa:{" "}
                              <strong>
                                {resultado.precisaLaudo
                                  ? "Laudo"
                                  : "Triagem Cosmética"}
                              </strong>
                            </div>

                            {resultado.motivoDestino && (
                              <div className="mt-1 text-[10px] opacity-75">
                                {
                                  resultado.motivoDestino
                                }
                              </div>
                            )}
                          </div>

                          {resultado.bateria ===
                            "Saúde da bateria entre 70 e 79%" && (
                            <span className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-amber-700 ring-1 ring-amber-200">
                              Bateria 70–79%
                            </span>
                          )}
                        </div>
                      </div>

                      {resultado.respostas
                        ?.length >
                        0 && (
                        <div className="overflow-hidden rounded-2xl border border-slate-200">
                          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                            <div className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                              Resumo dos testes
                            </div>
                          </div>

                          <div className="divide-y divide-slate-100">
                            {resultado.respostas.map(
                              (
                                resposta,
                                index
                              ) => (
                                <div
                                  key={
                                    index
                                  }
                                  className="flex items-center justify-between gap-4 px-4 py-3"
                                >
                                  <span className="text-xs text-slate-500">
                                    {
                                      resposta.pergunta
                                    }
                                  </span>

                                  <span
                                    className={`shrink-0 rounded-lg px-2.5 py-1 text-[10px] font-black ${
                                      resposta.divergente
                                        ? "bg-rose-50 text-rose-700"
                                        : "bg-emerald-50 text-emerald-700"
                                    }`}
                                  >
                                    {resposta.resposta ===
                                    "nao"
                                      ? "Não"
                                      : "Sim"}
                                  </span>
                                </div>
                              )
                            )}

                            {resultado.bateria && (
                              <div className="flex items-center justify-between gap-4 px-4 py-3">
                                <span className="text-xs text-slate-500">
                                  Bateria
                                </span>

                                <span className="text-right text-[10px] font-black text-slate-700">
                                  {
                                    resultado.bateria
                                  }
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {resultado.conferencia
                        ?.divergencias
                        ?.length >
                        0 && (
                        <Aviso tipo="aviso">
                          <div>
                            <div className="font-black">
                              Divergência com a base da loja
                            </div>

                            <div className="mt-2 space-y-1">
                              {resultado.conferencia.divergencias.map(
                                (
                                  divergencia,
                                  index
                                ) => (
                                  <div
                                    key={
                                      index
                                    }
                                    className="font-medium"
                                  >
                                    {
                                      divergencia.campo
                                    }{" "}
                                    — registrado:{" "}
                                    <strong>
                                      {
                                        divergencia.operador
                                      }
                                    </strong>
                                    ; loja:{" "}
                                    <strong>
                                      {
                                        divergencia.tradein
                                      }
                                    </strong>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        </Aviso>
                      )}

                      {defeitosTodos.length >
                        0 && (
                        <div>
                          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                            Defeitos registrados
                          </div>

                          <div className="mt-2 flex flex-wrap gap-2">
                            {defeitosTodos.map(
                              (
                                defeito
                              ) => (
                                <span
                                  key={
                                    defeito
                                  }
                                  className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-[10px] font-bold text-rose-700"
                                >
                                  {
                                    defeito
                                  }
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className="flex justify-end border-t border-slate-100 pt-4">
                    <button
                      type="button"
                      onClick={
                        reiniciar
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800"
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
            <FilaTriagem
              fila={
                fila
              }
              carregando={
                carregandoFila
              }
              onAtualizar={
                carregarFila
              }
              onAbrir={
                abrirVoucher
              }
              bloqueado={
                carregando
              }
            />
          ) : (
            <>
              <ContextoAparelho
                ctx={
                  ctx
                }
                imei={
                  imeiDigitado
                }
                produto={
                  produto
                }
              />

              <FilaTriagem
                fila={
                  fila.slice(
                    0,
                    5
                  )
                }
                carregando={
                  carregandoFila
                }
                onAtualizar={
                  carregarFila
                }
                onAbrir={
                  abrirVoucher
                }
                bloqueado={
                  true
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}ALT-006A: cria Triagem Funcional nativa do Warehouse V2