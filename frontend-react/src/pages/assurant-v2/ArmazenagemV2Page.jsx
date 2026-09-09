import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Loader2,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  RotateCcw,
  ScanLine,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";

import {
  ETAPAS_BIPAGEM,
  MODO_SEM_BIPAGEM_LOCALIZACAO,
  baixarEtiquetaArmazenagem,
  cancelarReserva,
  confirmarArmazenagemSemBipagem,
  enderecoExibicao,
  listarAguardandoArmazenagem,
  registrarBipagem,
  reservarEndereco,
} from "../../services/armazenagemService.js";

const ETAPAS_PROCESSO = [
  "Identificação",
  "Reserva",
  "Validação física",
  "Conclusão",
];

function Aviso({
  tipo = "ok",
  children,
}) {
  const erro =
    tipo === "erro";

  const aviso =
    tipo === "aviso";

  return (
    <div
      className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
        erro
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : aviso
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800"
      }`}
    >
      {erro || aviso ? (
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
      )}

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
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {(title || action) && (
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

function Processo({
  etapa,
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
      <div className="flex min-w-[620px] items-center">
        {ETAPAS_PROCESSO.map(
          (
            label,
            index
          ) => {
            const concluida =
              index < etapa;

            const ativa =
              index === etapa;

            return (
              <div
                key={label}
                className="flex flex-1 items-center"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-black ${
                      concluida
                        ? "bg-emerald-500 text-white"
                        : ativa
                        ? "bg-violet-700 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {concluida ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div>
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Etapa {index + 1}
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
                      {label}
                    </div>
                  </div>
                </div>

                {index <
                  ETAPAS_PROCESSO.length -
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

function Valor({
  label,
  value,
  mono = false,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div
        className={`mt-1 truncate text-xs font-bold text-slate-700 ${
          mono
            ? "font-mono"
            : ""
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}

function ContextoProduto({
  dados,
}) {
  if (!dados) {
    return null;
  }

  const detalhes =
    dados.detalhes || {};

  const produto =
    detalhes.produto || {};

  return (
    <Panel
      title="Produto"
      subtitle="Contexto do equipamento armazenado."
      icon={Package}
    >
      <div className="space-y-3 p-4">
        <Valor
          label="Voucher"
          value={detalhes.voucher}
          mono
        />

        <Valor
          label="IMEI"
          value={detalhes.imei}
          mono
        />

        <Valor
          label="SKU"
          value={detalhes.sku}
          mono
        />

        <Valor
          label="Produto"
          value={[
            produto.marca,
            produto.modelo,
          ]
            .filter(Boolean)
            .join(" ")}
        />

        <div className="grid grid-cols-2 gap-2">
          <Valor
            label="Capacidade"
            value={
              produto.armazenamento
            }
          />

          <Valor
            label="Cor"
            value={
              produto.cor
            }
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Valor
            label="Grade física"
            value={
              dados.reserva
                ?.grade_fisica
            }
          />

          <Valor
            label="Grade venda"
            value={
              detalhes.grade
            }
          />
        </div>

        {detalhes.bateria_percentual !=
          null && (
          <Valor
            label="Bateria"
            value={`${detalhes.bateria_percentual}% · ${
              detalhes.status_bateria ||
              "—"
            }`}
          />
        )}
      </div>
    </Panel>
  );
}

function EnderecoHero({
  endereco,
}) {
  if (!endereco) {
    return null;
  }

  const rua =
    String(
      endereco.rua
    ).padStart(
      2,
      "0"
    );

  const bloco =
    String(
      endereco.bloco
    ).padStart(
      2,
      "0"
    );

  const andar =
    String(
      endereco.andar
    ).padStart(
      2,
      "0"
    );

  const linha =
    String(
      endereco.linha
    ).padStart(
      2,
      "0"
    );

  const apartamento =
    `${endereco.coluna}${linha}`;

  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-violet-600">
            <MapPin className="h-4 w-4" />

            <span className="text-[10px] font-black uppercase tracking-[0.14em]">
              Endereço reservado
            </span>
          </div>

          <div className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            {enderecoExibicao(
              endereco
            )}
          </div>
        </div>

        <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-emerald-700 ring-1 ring-emerald-200">
          Reserva ativa
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
          <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Rua
          </div>

          <div className="mt-1 text-lg font-black text-violet-700">
            {rua}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
          <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Bloco
          </div>

          <div className="mt-1 text-lg font-black text-violet-700">
            {bloco}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
          <div className="text-[8px] font-black uppercase tracking-wide text-slate-400">
            Andar
          </div>

          <div className="mt-1 text-lg font-black text-violet-700">
            {andar}
          </div>
        </div>

        <div className="rounded-xl border border-violet-200 bg-violet-700 p-3 text-center text-white">
          <div className="text-[8px] font-black uppercase tracking-wide text-white/60">
            Apartamento
          </div>

          <div className="mt-1 text-lg font-black">
            {apartamento}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProgressoBipagem({
  atual,
}) {
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[650px] items-center">
        {ETAPAS_BIPAGEM.map(
          (
            item,
            index
          ) => {
            const concluida =
              index < atual;

            const ativa =
              index === atual;

            return (
              <div
                key={
                  item.id
                }
                className="flex flex-1 items-center"
              >
                <div className="text-center">
                  <div
                    className={`mx-auto flex h-9 w-9 items-center justify-center rounded-full text-xs font-black ${
                      concluida
                        ? "bg-emerald-500 text-white"
                        : ativa
                        ? "bg-violet-700 text-white ring-4 ring-violet-100"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {concluida ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div
                    className={`mt-2 text-[10px] font-bold ${
                      ativa
                        ? "text-violet-700"
                        : concluida
                        ? "text-emerald-700"
                        : "text-slate-400"
                    }`}
                  >
                    {
                      item.rotulo
                    }
                  </div>
                </div>

                {index <
                  ETAPAS_BIPAGEM.length -
                    1 && (
                  <div
                    className={`mx-3 h-px flex-1 ${
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

function FilaArmazenagem({
  fila,
  carregando,
  bloqueado,
  onAbrir,
  onAtualizar,
}) {
  return (
    <Panel
      title="Fila de armazenagem"
      subtitle="Até 100 itens aguardando endereçamento."
      icon={Package}
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
        <div className="flex items-center justify-center gap-2 px-5 py-12 text-xs text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />

          Carregando fila...
        </div>
      ) : fila.length ===
        0 ? (
        <div className="px-5 py-12 text-center">
          <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />

          <div className="mt-3 text-xs font-bold text-slate-600">
            Fila zerada
          </div>

          <div className="mt-1 text-[10px] text-slate-400">
            Nenhum produto aguardando armazenagem.
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
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 text-violet-600">
                    <Package className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-xs font-black text-violet-700">
                      {
                        item.voucher
                      }
                    </div>

                    <div className="mt-1 truncate text-[10px] font-semibold text-slate-600">
                      {[
                        item.produto
                          ?.marca,
                        item.produto
                          ?.modelo,
                      ]
                        .filter(
                          Boolean
                        )
                        .join(
                          " "
                        ) ||
                        item.modelo ||
                        "Produto"}
                    </div>

                    <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400">
                      {item.imei ||
                        "IMEI não informado"}
                    </div>

                    <div className="mt-2">
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-500">
                        {item.grade ||
                          "Sem grade"}
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
                    Armazenar

                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )
          )}
        </div>
      )}

      <div className="border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[10px] font-semibold text-slate-500">
        {fila.length}{" "}
        {fila.length === 1
          ? "produto aguardando"
          : "produtos aguardando"}
      </div>
    </Panel>
  );
}

export default function ArmazenagemV2Page() {
  const { user } =
    useAuth();

  const [
    voucher,
    setVoucher,
  ] = useState("");

  const [
    fila,
    setFila,
  ] = useState([]);

  const [
    carregandoFila,
    setCarregandoFila,
  ] = useState(true);

  const [
    carregando,
    setCarregando,
  ] = useState(false);

  const [
    dados,
    setDados,
  ] = useState(null);

  const [
    etapaAtual,
    setEtapaAtual,
  ] = useState(0);

  const [
    codigo,
    setCodigo,
  ] = useState("");

  const [
    feedback,
    setFeedback,
  ] = useState(null);

  const [
    concluido,
    setConcluido,
  ] = useState(null);

  const scanRef =
    useRef(null);

  const voucherRef =
    useRef(null);

  useEffect(() => {
    carregarFila();
  }, []);

  useEffect(() => {
    if (
      dados &&
      !concluido &&
      !MODO_SEM_BIPAGEM_LOCALIZACAO
    ) {
      scanRef.current?.focus();
    } else if (
      !dados
    ) {
      voucherRef.current?.focus();
    }
  }, [
    dados,
    etapaAtual,
    concluido,
  ]);

  async function carregarFila() {
    setCarregandoFila(
      true
    );

    try {
      const resultado =
        await listarAguardandoArmazenagem();

      setFila(
        resultado
      );
    } catch (erro) {
      setFeedback({
        tipo:
          "erro",

        msg:
          erro.message,
      });
    } finally {
      setCarregandoFila(
        false
      );
    }
  }

  async function abrirVoucher(
    valor = voucher
  ) {
    const informado =
      String(
        valor || ""
      )
        .trim()
        .toUpperCase();

    if (
      !informado ||
      carregando
    ) {
      return;
    }

    setCarregando(
      true
    );

    setFeedback(
      null
    );

    try {
      const resultado =
        await reservarEndereco(
          informado,
          user.id
        );

      setDados(
        resultado
      );

      setVoucher(
        informado
      );

      setEtapaAtual(
        Number(
          resultado.reserva
            ?.etapa_atual ||
            0
        )
      );

      setCodigo("");
      setConcluido(
        null
      );

      baixarEtiquetaArmazenagem(
        resultado
      );

      setFeedback({
        tipo:
          "ok",

        msg:
          resultado.reaberta
            ? "Reserva reaberta. A etiqueta foi gerada novamente."
            : "Endereço reservado. A etiqueta de armazenagem foi gerada.",
      });
    } catch (erro) {
      const mensagem =
        erro.message?.includes(
          "wms_reservar_endereco"
        )
          ? "A estrutura do WMS ainda não foi instalada no Supabase."
          : erro.message;

      setFeedback({
        tipo:
          "erro",

        msg:
          mensagem,
      });
    } finally {
      setCarregando(
        false
      );
    }
  }

  async function bipar() {
    const etapa =
      ETAPAS_BIPAGEM[
        etapaAtual
      ];

    if (
      !etapa ||
      !codigo.trim() ||
      carregando
    ) {
      return;
    }

    setCarregando(
      true
    );

    setFeedback(
      null
    );

    try {
      const resultado =
        await registrarBipagem(
          dados.reserva.id,
          etapa.id,
          codigo,
          user.id
        );

      if (
        !resultado.ok
      ) {
        setFeedback({
          tipo:
            "erro",

          msg:
            resultado.erro,
        });

        setCodigo("");

        return;
      }

      setCodigo("");

      if (
        resultado.concluido
      ) {
        setEtapaAtual(
          ETAPAS_BIPAGEM.length
        );

        setConcluido(
          resultado
        );

        setFeedback({
          tipo:
            "ok",

          msg:
            `Armazenagem confirmada. Produto enviado para ${resultado.status}.`,
        });

        carregarFila();
      } else {
        setEtapaAtual(
          Number(
            resultado.etapa_atual
          )
        );

        setFeedback({
          tipo:
            "ok",

          msg:
            `${etapa.rotulo} validada corretamente.`,
        });
      }
    } catch (erro) {
      setFeedback({
        tipo:
          "erro",

        msg:
          erro.message,
      });

      setCodigo("");
    } finally {
      setCarregando(
        false
      );

      setTimeout(
        () => {
          scanRef.current?.focus();
        },
        0
      );
    }
  }

  async function confirmarSemBipagem() {
    if (
      !dados?.reserva?.id ||
      !dados?.endereco ||
      carregando
    ) {
      return;
    }

    const confirmou =
      window.confirm(
        `Confirma que o produto foi colocado fisicamente em ${enderecoExibicao(
          dados.endereco
        )}?`
      );

    if (
      !confirmou
    ) {
      return;
    }

    setCarregando(
      true
    );

    setFeedback(
      null
    );

    try {
      const resultado =
        await confirmarArmazenagemSemBipagem(
          dados.reserva.id,
          dados.endereco,
          user.id,
          etapaAtual
        );

      setEtapaAtual(
        ETAPAS_BIPAGEM.length
      );

      setConcluido(
        resultado
      );

      setFeedback({
        tipo:
          "ok",

        msg:
          `Armazenagem confirmada. Produto enviado para ${resultado.status}.`,
      });

      carregarFila();
    } catch (erro) {
      if (
        Number.isInteger(
          erro.etapaAtual
        )
      ) {
        setEtapaAtual(
          erro.etapaAtual
        );
      }

      setFeedback({
        tipo:
          "erro",

        msg:
          `${erro.message} Você pode tentar confirmar novamente.`,
      });
    } finally {
      setCarregando(
        false
      );
    }
  }

  async function cancelar() {
    if (
      !dados?.reserva?.id ||
      carregando
    ) {
      return;
    }

    const confirmou =
      window.confirm(
        "Cancelar esta reserva? A etiqueta já impressa não deverá ser utilizada."
      );

    if (
      !confirmou
    ) {
      return;
    }

    setCarregando(
      true
    );

    try {
      const resultado =
        await cancelarReserva(
          dados.reserva.id,
          user.id
        );

      if (
        !resultado.ok
      ) {
        throw new Error(
          resultado.erro
        );
      }

      reiniciar();

      setFeedback({
        tipo:
          "ok",

        msg:
          "Reserva cancelada e endereço liberado.",
      });
    } catch (erro) {
      setFeedback({
        tipo:
          "erro",

        msg:
          erro.message,
      });
    } finally {
      setCarregando(
        false
      );
    }
  }

  function reiniciar() {
    setVoucher("");
    setDados(null);
    setEtapaAtual(0);
    setCodigo("");
    setConcluido(null);
    setFeedback(null);

    carregarFila();
  }

  const endereco =
    dados?.endereco;

  const etapa =
    ETAPAS_BIPAGEM[
      etapaAtual
    ];

  const etapaProcesso =
    !dados
      ? 0
      : concluido
      ? 3
      : 2;

  return (
    <div className="space-y-5">
      <Processo
        etapa={
          etapaProcesso
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-black text-slate-800">
            Armazenagem dirigida
          </div>

          <div className="mt-0.5 text-[11px] text-slate-400">
            Reserva automática de endereço e confirmação física no WMS.
          </div>
        </div>

        {dados && (
          <button
            type="button"
            onClick={
              reiniciar
            }
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <RotateCcw className="h-4 w-4" />

            Outro produto
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

      {!dados ? (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Panel
            title="Identificação do produto"
            subtitle="Bipe o voucher para solicitar o melhor endereço disponível."
            icon={ScanLine}
          >
            <div className="p-5 lg:p-6">
              <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
                <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                  Entrada da armazenagem
                </div>

                <h3 className="mt-2 text-lg font-black text-slate-900">
                  Voucher
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Ao localizar o produto, o WMS reservará automaticamente uma posição compatível.
                </p>

                <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                  <div className="relative flex-1">
                    <ScanLine className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />

                    <input
                      ref={
                        voucherRef
                      }
                      autoFocus
                      value={
                        voucher
                      }
                      disabled={
                        carregando
                      }
                      onChange={(
                        evento
                      ) =>
                        setVoucher(
                          evento.target.value.toUpperCase()
                        )
                      }
                      onKeyDown={(
                        evento
                      ) => {
                        if (
                          evento.key ===
                          "Enter"
                        ) {
                          abrirVoucher();
                        }
                      }}
                      placeholder="Bipe o voucher..."
                      className="h-14 w-full rounded-xl border border-violet-200 bg-white pl-12 pr-4 font-mono text-base font-black tracking-wide text-slate-800 outline-none transition placeholder:font-sans placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-300 focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:opacity-50"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      abrirVoucher()
                    }
                    disabled={
                      !voucher.trim() ||
                      carregando
                    }
                    className="inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-40"
                  >
                    {carregando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <MapPin className="h-4 w-4" />
                    )}

                    {carregando
                      ? "Reservando..."
                      : "Reservar endereço"}
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
                    Endereçamento
                  </div>

                  <div className="mt-1 text-xs font-bold text-slate-700">
                    Automático por WMS
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                    Modo atual
                  </div>

                  <div className="mt-1 text-xs font-bold text-slate-700">
                    {MODO_SEM_BIPAGEM_LOCALIZACAO
                      ? "Confirmação física"
                      : "5 bipagens"}
                  </div>
                </div>
              </div>
            </div>
          </Panel>

          <FilaArmazenagem
            fila={
              fila
            }
            carregando={
              carregandoFila
            }
            bloqueado={
              carregando
            }
            onAbrir={
              abrirVoucher
            }
            onAtualizar={
              carregarFila
            }
          />
        </div>
      ) : (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-5">
            <Panel
              title="Posição destinada"
              subtitle="O endereço abaixo está reservado para este aparelho."
              icon={MapPin}
              action={
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      baixarEtiquetaArmazenagem(
                        dados
                      )
                    }
                    className="inline-flex h-9 items-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-3 text-[10px] font-bold text-violet-700 transition hover:bg-violet-100"
                  >
                    <Printer className="h-3.5 w-3.5" />

                    Reimprimir etiqueta
                  </button>

                  {!concluido && (
                    <button
                      type="button"
                      onClick={
                        cancelar
                      }
                      disabled={
                        carregando
                      }
                      className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-white px-3 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50 disabled:opacity-40"
                    >
                      <XCircle className="h-3.5 w-3.5" />

                      Cancelar reserva
                    </button>
                  )}
                </div>
              }
            >
              <div className="p-5">
                <EnderecoHero
                  endereco={
                    endereco
                  }
                />
              </div>
            </Panel>

            {!concluido ? (
              <Panel
                title="Confirmação física"
                subtitle={
                  MODO_SEM_BIPAGEM_LOCALIZACAO
                    ? "Operação provisória sem leitura das etiquetas físicas."
                    : "Valide a estrutura física na sequência definida pelo WMS."
                }
                icon={ShieldCheck}
              >
                <div className="p-5 lg:p-6">
                  {MODO_SEM_BIPAGEM_LOCALIZACAO ? (
                    <div className="mx-auto max-w-[760px]">
                      <Aviso tipo="aviso">
                        O modo provisório sem bipagem está ativo. A confirmação deve ser feita somente depois que o aparelho estiver fisicamente na posição reservada.
                      </Aviso>

                      <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                        <MapPin className="mx-auto h-8 w-8 text-violet-600" />

                        <div className="mt-3 text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">
                          Coloque o produto em
                        </div>

                        <div className="mt-2 text-2xl font-black text-slate-900">
                          {enderecoExibicao(
                            endereco
                          )}
                        </div>

                        <p className="mx-auto mt-2 max-w-[520px] text-xs leading-5 text-slate-500">
                          Confira Rua, Bloco, Andar e Apartamento antes de concluir.
                        </p>

                        <button
                          type="button"
                          onClick={
                            confirmarSemBipagem
                          }
                          disabled={
                            carregando
                          }
                          className="mt-6 inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 text-sm font-black text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-40"
                        >
                          {carregando ? (
                            <Loader2 className="h-5 w-5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="h-5 w-5" />
                          )}

                          {carregando
                            ? "Confirmando..."
                            : "Confirmar produto na posição"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <ProgressoBipagem
                        atual={
                          etapaAtual
                        }
                      />

                      <div className="mx-auto mt-7 max-w-[650px] rounded-2xl border border-violet-100 bg-violet-50/50 p-5 text-center">
                        <div className="text-[10px] font-black uppercase tracking-[0.14em] text-violet-500">
                          Próxima leitura
                        </div>

                        <h3 className="mt-2 text-2xl font-black text-slate-900">
                          {
                            etapa?.rotulo
                          }
                        </h3>

                        <div className="mt-1 text-[10px] text-slate-400">
                          Formato esperado:{" "}
                          <strong>
                            {
                              etapa?.exemplo
                            }
                          </strong>
                        </div>

                        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
                          <input
                            ref={
                              scanRef
                            }
                            value={
                              codigo
                            }
                            disabled={
                              carregando
                            }
                            onChange={(
                              evento
                            ) =>
                              setCodigo(
                                evento.target.value.toUpperCase()
                              )
                            }
                            onKeyDown={(
                              evento
                            ) => {
                              if (
                                evento.key ===
                                "Enter"
                              ) {
                                bipar();
                              }
                            }}
                            placeholder={`Bipe ${etapa?.rotulo?.toLowerCase()}...`}
                            className="h-14 min-w-0 flex-1 rounded-xl border border-violet-200 bg-white px-4 text-center font-mono text-lg font-black uppercase text-slate-800 outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-100 disabled:opacity-50"
                          />

                          <button
                            type="button"
                            onClick={
                              bipar
                            }
                            disabled={
                              !codigo.trim() ||
                              carregando
                            }
                            className="h-14 rounded-xl bg-violet-700 px-6 text-sm font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
                          >
                            {carregando
                              ? "Validando..."
                              : "Validar"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </Panel>
            ) : (
              <Panel
                title="Armazenagem concluída"
                subtitle="A ocupação física foi confirmada no WMS."
                icon={CheckCircle2}
              >
                <div className="p-5 lg:p-6">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-600">
                          Produto armazenado
                        </div>

                        <div className="mt-1 text-xl font-black text-emerald-950">
                          {concluido.local ||
                            enderecoExibicao(
                              endereco
                            )}
                        </div>

                        <div className="mt-2 text-xs text-emerald-700">
                          Status:{" "}
                          <strong>
                            {concluido.status ||
                              "Concluído"}
                          </strong>
                        </div>

                        <div className="mt-1 text-[10px] text-emerald-600">
                          Próxima etapa operacional: Entrada no Oracle.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end">
                    <button
                      type="button"
                      onClick={
                        reiniciar
                      }
                      className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800"
                    >
                      <RotateCcw className="h-4 w-4" />

                      Armazenar próximo produto
                    </button>
                  </div>
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-5 xl:sticky xl:top-[92px]">
            <ContextoProduto
              dados={
                dados
              }
            />

            <FilaArmazenagem
              fila={
                fila.slice(
                  0,
                  5
                )
              }
              carregando={
                carregandoFila
              }
              bloqueado
              onAbrir={
                abrirVoucher
              }
              onAtualizar={
                carregarFila
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}