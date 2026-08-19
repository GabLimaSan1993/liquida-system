import {
  useEffect,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  CheckCircle,
  Loader,
  MapPin,
  Package,
  Printer,
  RefreshCw,
  ScanLine,
  Tag,
  X,
} from "lucide-react";

import { useAuth } from "../AuthContext.jsx";

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
} from "../services/armazenagemService.js";


function Card({
  children,
  className = "",
}) {
  return (
    <div
      className={`
        rounded-2xl
        bg-white
        p-5
        shadow-sm
        ring-1
        ring-slate-200
        ${className}
      `}
    >
      {children}
    </div>
  );
}


function Aviso({
  tipo,
  children,
}) {
  const erro =
    tipo === "erro";

  return (
    <div
      className={`
        flex
        items-start
        gap-2
        rounded-2xl
        px-4
        py-3
        text-sm
        font-semibold
        ring-1

        ${
          erro
            ? "bg-red-50 text-red-700 ring-red-200"
            : "bg-emerald-50 text-emerald-700 ring-emerald-200"
        }
      `}
    >
      {erro ? (
        <AlertTriangle
          className="
            mt-0.5
            h-4
            w-4
            shrink-0
          "
        />
      ) : (
        <CheckCircle
          className="
            mt-0.5
            h-4
            w-4
            shrink-0
          "
        />
      )}

      <div>
        {children}
      </div>
    </div>
  );
}


function Valor({
  rotulo,
  valor,
  mono = false,
}) {
  return (
    <div
      className="
        rounded-xl
        bg-slate-50
        px-3
        py-2.5
        ring-1
        ring-slate-100
      "
    >
      <p
        className="
          text-[10px]
          font-bold
          uppercase
          tracking-wide
          text-slate-400
        "
      >
        {rotulo}
      </p>

      <p
        className={`
          mt-0.5
          text-sm
          font-bold
          text-slate-800

          ${
            mono
              ? "font-mono"
              : ""
          }
        `}
      >
        {valor || "—"}
      </p>
    </div>
  );
}


function Grade({
  rotulo,
  valor,
  destaque = false,
}) {
  return (
    <div
      className={`
        rounded-xl
        px-3
        py-2.5
        ring-1

        ${
          destaque
            ? "bg-purple-50 ring-purple-200"
            : "bg-white ring-slate-200"
        }
      `}
    >
      <p
        className="
          text-[10px]
          font-bold
          uppercase
          tracking-wide
          text-slate-400
        "
      >
        {rotulo}
      </p>

      <p
        className={`
          mt-0.5
          text-sm
          font-black

          ${
            destaque
              ? "text-[#6B1F87]"
              : "text-slate-700"
          }
        `}
      >
        {valor || "—"}
      </p>
    </div>
  );
}


function Progresso({
  atual,
}) {
  return (
    <div
      className="
        grid
        grid-cols-5
        gap-2
      "
    >
      {ETAPAS_BIPAGEM.map(
        (etapa, indice) => {
          const concluida =
            indice < atual;

          const ativa =
            indice === atual;

          return (
            <div
              key={etapa.id}
              className="text-center"
            >
              <div
                className={`
                  mx-auto
                  flex
                  h-9
                  w-9
                  items-center
                  justify-center
                  rounded-full
                  text-xs
                  font-black
                  ring-2

                  ${
                    concluida
                      ? "bg-emerald-500 text-white ring-emerald-200"
                      : ativa
                        ? "bg-[#7F2D92] text-white ring-purple-200"
                        : "bg-slate-100 text-slate-400 ring-slate-200"
                  }
                `}
              >
                {concluida
                  ? "✓"
                  : indice + 1}
              </div>

              <p
                className={`
                  mt-1
                  text-[10px]
                  font-bold

                  ${
                    ativa
                      ? "text-[#6B1F87]"
                      : "text-slate-400"
                  }
                `}
              >
                {etapa.rotulo}
              </p>
            </div>
          );
        }
      )}
    </div>
  );
}


function DetalhesTriagem({
  dados,
  gradeFisica,
}) {
  const detalhes =
    dados.detalhes;

  const produto =
    detalhes.produto || {};

  const laudo =
    detalhes.laudo;

  return (
    <div className="space-y-4">

      <div>
        <h3
          className="
            mb-2
            text-xs
            font-black
            uppercase
            tracking-wider
            text-slate-500
          "
        >
          Produto
        </h3>

        <div
          className="
            grid
            gap-2
            sm:grid-cols-2
            lg:grid-cols-4
          "
        >
          <Valor
            rotulo="Marca"
            valor={produto.marca}
          />

          <Valor
            rotulo="Modelo"
            valor={
              produto.modelo ||
              detalhes.modelo
            }
          />

          <Valor
            rotulo="Armazenamento"
            valor={
              produto.armazenamento
            }
          />

          <Valor
            rotulo="Cor"
            valor={produto.cor}
          />

          <Valor
            rotulo="Voucher"
            valor={detalhes.voucher}
            mono
          />

          <Valor
            rotulo="IMEI"
            valor={detalhes.imei}
            mono
          />

          <Valor
            rotulo="SKU"
            valor={detalhes.sku}
            mono
          />

          <Valor
            rotulo="Bateria"
            valor={
              detalhes.bateria_percentual
                != null

                ? `${
                    detalhes.bateria_percentual
                  }% · ${
                    detalhes.status_bateria ||
                    "—"
                  }`

                : detalhes.status_bateria
            }
          />
        </div>
      </div>


      <div>
        <h3
          className="
            mb-2
            text-xs
            font-black
            uppercase
            tracking-wider
            text-slate-500
          "
        >
          Classificações
        </h3>

        <div
          className="
            grid
            gap-2
            sm:grid-cols-3
            lg:grid-cols-5
          "
        >
          <Grade
            rotulo="Grade física"
            valor={gradeFisica}
            destaque
          />

          <Grade
            rotulo="Grade de venda"
            valor={detalhes.grade}
          />

          <Grade
            rotulo="Tela"
            valor={detalhes.tela}
          />

          <Grade
            rotulo="Laterais"
            valor={detalhes.laterais}
          />

          <Grade
            rotulo="Traseira"
            valor={detalhes.traseira}
          />
        </div>
      </div>


      <div
        className="
          grid
          gap-3
          lg:grid-cols-2
        "
      >
        <div
          className="
            rounded-xl
            bg-slate-50
            p-3
            ring-1
            ring-slate-100
          "
        >
          <p
            className="
              text-[10px]
              font-bold
              uppercase
              tracking-wide
              text-slate-400
            "
          >
            Triagem funcional
          </p>

          <p
            className={`
              mt-1
              text-sm
              font-black

              ${
                detalhes
                  .resultado_triagem_funcional
                  === "BAD"

                  ? "text-red-600"
                  : "text-emerald-600"
              }
            `}
          >
            {
              detalhes
                .resultado_triagem_funcional
              || "—"
            }
          </p>

          <p
            className="
              mt-1
              text-xs
              text-slate-600
            "
          >
            {
              detalhes
                .defeitos_adicionais
              ||
              "Nenhum defeito adicional registrado."
            }
          </p>
        </div>


        <div
          className="
            rounded-xl
            bg-slate-50
            p-3
            ring-1
            ring-slate-100
          "
        >
          <p
            className="
              text-[10px]
              font-bold
              uppercase
              tracking-wide
              text-slate-400
            "
          >
            Laudo
          </p>

          {laudo ? (
            <>
              <p
                className="
                  mt-1
                  text-sm
                  font-bold
                  text-slate-700
                "
              >
                {
                  laudo.motivo ||
                  "Laudo realizado"
                }
              </p>

              <p
                className="
                  mt-1
                  text-xs
                  text-slate-600
                "
              >
                {
                  laudo.observacao ||
                  laudo.defeitos ||
                  "Sem observação adicional."
                }
              </p>
            </>
          ) : (
            <p
              className="
                mt-1
                text-sm
                font-semibold
                text-slate-500
              "
            >
              Não houve laudo neste fluxo.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}


export default function ArmazenagemPage() {
  const { user } =
    useAuth();


  const [voucher, setVoucher] =
    useState("");


  const [fila, setFila] =
    useState([]);


  const [
    carregandoFila,
    setCarregandoFila,
  ] = useState(true);


  const [
    carregando,
    setCarregando,
  ] = useState(false);


  const [dados, setDados] =
    useState(null);


  const [
    etapaAtual,
    setEtapaAtual,
  ] = useState(0);


  const [codigo, setCodigo] =
    useState("");


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
    if (dados && !concluido) {
      scanRef.current?.focus();
    } else if (!dados) {
      voucherRef.current?.focus();
    }
  }, [
    dados,
    etapaAtual,
    concluido,
  ]);


  async function carregarFila() {
    setCarregandoFila(true);

    try {
      const resultado =
        await listarAguardandoArmazenagem();

      setFila(resultado);
    } catch (erro) {
      setFeedback({
        tipo: "erro",
        msg: erro.message,
      });
    } finally {
      setCarregandoFila(false);
    }
  }


  async function abrirVoucher(
    valor = voucher
  ) {
    const voucherInformado =
      String(valor || "")
        .trim()
        .toUpperCase();


    if (
      !voucherInformado ||
      carregando
    ) {
      return;
    }


    setCarregando(true);
    setFeedback(null);


    try {
      const resultado =
        await reservarEndereco(
          voucherInformado,
          user.id
        );


      setDados(resultado);

      setVoucher(
        voucherInformado
      );

      setEtapaAtual(
        Number(
          resultado.reserva
            ?.etapa_atual || 0
        )
      );

      setConcluido(null);
      setCodigo("");


      /*
       * Gera automaticamente o PDF
       * quando o endereço é reservado.
       */
      baixarEtiquetaArmazenagem(
        resultado
      );


      setFeedback({
        tipo: "ok",

        msg: resultado.reaberta

          ? "Reserva reaberta. A etiqueta foi gerada novamente."

          : "Endereço reservado e etiqueta PDF gerada.",
      });

    } catch (erro) {
      const mensagem =
        erro.message?.includes(
          "wms_reservar_endereco"
        )

          ? "A estrutura do WMS ainda não foi instalada no Supabase."

          : erro.message;


      setFeedback({
        tipo: "erro",
        msg: mensagem,
      });

    } finally {
      setCarregando(false);
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


    setCarregando(true);
    setFeedback(null);


    try {
      const resultado =
        await registrarBipagem(
          dados.reserva.id,
          etapa.id,
          codigo,
          user.id
        );


      if (!resultado.ok) {
        setFeedback({
          tipo: "erro",
          msg: resultado.erro,
        });

        setCodigo("");

        return;
      }


      setCodigo("");


      if (resultado.concluido) {
        setEtapaAtual(5);

        setConcluido(
          resultado
        );

        setFeedback({
          tipo: "ok",

          msg:
            "Armazenagem confirmada. " +
            `Produto enviado para ${
              resultado.status
            }.`,
        });

        carregarFila();

      } else {
        setEtapaAtual(
          Number(
            resultado.etapa_atual
          )
        );

        setFeedback({
          tipo: "ok",

          msg:
            `${etapa.rotulo} ` +
            "validada corretamente.",
        });
      }

    } catch (erro) {
      setFeedback({
        tipo: "erro",
        msg: erro.message,
      });

      setCodigo("");

    } finally {
      setCarregando(false);

      setTimeout(() => {
        scanRef.current?.focus();
      }, 0);
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
        "Confirma que o produto foi colocado fisicamente em " +
        `${enderecoExibicao(dados.endereco)}?`
      );


    if (!confirmou) {
      return;
    }


    setCarregando(true);
    setFeedback(null);


    try {
      const resultado =
        await confirmarArmazenagemSemBipagem(
          dados.reserva.id,
          dados.endereco,
          user.id,
          etapaAtual
        );


      setEtapaAtual(5);

      setConcluido(
        resultado
      );

      setFeedback({
        tipo: "ok",

        msg:
          "Armazenagem confirmada sem bipagem das etiquetas de localização. " +
          `Produto enviado para ${resultado.status}.`,
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
        tipo: "erro",
        msg:
          erro.message +
          " Você pode tentar confirmar novamente.",
      });

    } finally {
      setCarregando(false);
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
        "Cancelar esta reserva? " +
        "A etiqueta já impressa não deverá ser utilizada."
      );


    if (!confirmou) {
      return;
    }


    setCarregando(true);


    try {
      const resultado =
        await cancelarReserva(
          dados.reserva.id,
          user.id
        );


      if (!resultado.ok) {
        throw new Error(
          resultado.erro
        );
      }


      reiniciar();


      setFeedback({
        tipo: "ok",

        msg:
          "Reserva cancelada e " +
          "endereço liberado.",
      });

    } catch (erro) {
      setFeedback({
        tipo: "erro",
        msg: erro.message,
      });

    } finally {
      setCarregando(false);
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


  const etapa =
    ETAPAS_BIPAGEM[
      etapaAtual
    ];


  const endereco =
    dados?.endereco;


  return (
    <div className="space-y-5">

      <div
        className="
          flex
          flex-wrap
          items-center
          gap-3
        "
      >
        <div
          className="
            flex
            h-11
            w-11
            items-center
            justify-center
            rounded-2xl
            bg-[#7F2D92]
            text-white
            shadow
          "
        >
          <Package className="h-5 w-5" />
        </div>


        <div className="flex-1">
          <h2
            className="
              text-lg
              font-black
              text-slate-800
            "
          >
            Armazenagem dirigida
          </h2>

          <p
            className="
              text-xs
              text-slate-500
            "
          >
            Voucher → endereço automático →
            {MODO_SEM_BIPAGEM_LOCALIZACAO
              ? " confirmação provisória → Oracle"
              : " validação física → Oracle"}
          </p>
        </div>


        <button
          onClick={
            carregarFila
          }
          disabled={
            carregandoFila
          }
          className="
            inline-flex
            items-center
            gap-1.5
            rounded-xl
            bg-white
            px-3
            py-2
            text-xs
            font-bold
            text-slate-600
            ring-1
            ring-slate-200
            hover:bg-slate-50
            disabled:opacity-50
          "
        >
          <RefreshCw
            className={`
              h-3.5
              w-3.5

              ${
                carregandoFila
                  ? "animate-spin"
                  : ""
              }
            `}
          />

          Atualizar fila
        </button>
      </div>


      {feedback && (
        <Aviso
          tipo={feedback.tipo}
        >
          {feedback.msg}
        </Aviso>
      )}


      {!dados && (
        <div
          className="
            grid
            gap-5
            lg:grid-cols-[minmax(0,1fr)_380px]
          "
        >
          <Card>
            <div
              className="
                mx-auto
                max-w-2xl
                py-8
                text-center
              "
            >
              <ScanLine
                className="
                  mx-auto
                  h-10
                  w-10
                  text-[#7F2D92]
                "
              />

              <h3
                className="
                  mt-3
                  text-xl
                  font-black
                  text-slate-800
                "
              >
                Bipe o voucher
              </h3>

              <p
                className="
                  mt-1
                  text-sm
                  text-slate-500
                "
              >
                O endereço será escolhido
                automaticamente e reservado
                por duas horas.
              </p>


              <div
                className="
                  mx-auto
                  mt-5
                  flex
                  max-w-xl
                  gap-2
                "
              >
                <input
                  ref={voucherRef}

                  value={voucher}

                  disabled={
                    carregando
                  }

                  onChange={
                    (evento) =>
                      setVoucher(
                        evento
                          .target
                          .value
                          .toUpperCase()
                      )
                  }

                  onKeyDown={
                    (evento) => {
                      if (
                        evento.key
                        === "Enter"
                      ) {
                        abrirVoucher();
                      }
                    }
                  }

                  placeholder="YBV..."

                  className="
                    min-w-0
                    flex-1
                    rounded-2xl
                    border-2
                    border-purple-200
                    px-5
                    py-4
                    font-mono
                    text-lg
                    font-bold
                    uppercase
                    outline-none
                    focus:border-[#7F2D92]
                    disabled:opacity-50
                  "
                />


                <button
                  onClick={
                    () =>
                      abrirVoucher()
                  }

                  disabled={
                    !voucher.trim() ||
                    carregando
                  }

                  className="
                    rounded-2xl
                    bg-[#7F2D92]
                    px-6
                    py-3
                    font-bold
                    text-white
                    hover:bg-[#6B1F87]
                    disabled:opacity-40
                  "
                >
                  {carregando ? (
                    <Loader
                      className="
                        h-5
                        w-5
                        animate-spin
                      "
                    />
                  ) : (
                    "Buscar"
                  )}
                </button>
              </div>
            </div>
          </Card>


          <Card>
            <div
              className="
                mb-3
                flex
                items-center
                justify-between
              "
            >
              <div>
                <h3
                  className="
                    font-black
                    text-slate-800
                  "
                >
                  Fila de armazenagem
                </h3>

                <p
                  className="
                    text-xs
                    text-slate-400
                  "
                >
                  {fila.length} item(ns)
                  aguardando
                </p>
              </div>

              <Tag
                className="
                  h-5
                  w-5
                  text-purple-300
                "
              />
            </div>


            <div
              className="
                max-h-[430px]
                space-y-2
                overflow-y-auto
                pr-1
              "
            >
              {carregandoFila ? (
                <div
                  className="
                    flex
                    justify-center
                    py-12
                  "
                >
                  <Loader
                    className="
                      h-6
                      w-6
                      animate-spin
                      text-[#7F2D92]
                    "
                  />
                </div>

              ) : fila.length === 0 ? (
                <p
                  className="
                    py-12
                    text-center
                    text-sm
                    text-slate-400
                  "
                >
                  Nenhum produto aguardando.
                </p>

              ) : (
                fila.map(
                  (item) => (
                    <button
                      key={
                        item.voucher
                      }

                      onClick={
                        () =>
                          abrirVoucher(
                            item.voucher
                          )
                      }

                      className="
                        w-full
                        rounded-xl
                        bg-slate-50
                        p-3
                        text-left
                        ring-1
                        ring-slate-100
                        transition
                        hover:bg-purple-50
                        hover:ring-purple-200
                      "
                    >
                      <div
                        className="
                          flex
                          items-center
                          justify-between
                          gap-2
                        "
                      >
                        <span
                          className="
                            font-mono
                            text-xs
                            font-bold
                            text-[#6B1F87]
                          "
                        >
                          {item.voucher}
                        </span>

                        <span
                          className="
                            rounded-full
                            bg-white
                            px-2
                            py-0.5
                            text-[10px]
                            font-bold
                            text-slate-500
                            ring-1
                            ring-slate-200
                          "
                        >
                          {
                            item.grade ||
                            "—"
                          }
                        </span>
                      </div>

                      <p
                        className="
                          mt-1
                          truncate
                          text-sm
                          font-bold
                          text-slate-700
                        "
                      >
                        {
                          [
                            item.produto
                              ?.marca,

                            item.produto
                              ?.modelo,
                          ]

                            .filter(
                              Boolean
                            )

                            .join(" ")

                          ||

                          item.modelo

                          ||

                          "Produto"
                        }
                      </p>

                      <p
                        className="
                          truncate
                          font-mono
                          text-[10px]
                          text-slate-400
                        "
                      >
                        {
                          item.imei ||
                          "IMEI não informado"
                        }
                      </p>
                    </button>
                  )
                )
              )}
            </div>
          </Card>
        </div>
      )}


      {dados && (
        <>
          <Card>
            <div
              className="
                flex
                flex-wrap
                items-start
                gap-4
              "
            >
              <div
                className="
                  flex
                  h-12
                  w-12
                  items-center
                  justify-center
                  rounded-2xl
                  bg-emerald-50
                  text-emerald-600
                  ring-1
                  ring-emerald-200
                "
              >
                <MapPin
                  className="
                    h-6
                    w-6
                  "
                />
              </div>


              <div
                className="
                  min-w-0
                  flex-1
                "
              >
                <p
                  className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-400
                  "
                >
                  Endereço reservado
                </p>

                <p
                  className="
                    mt-1
                    text-xl
                    font-black
                    text-slate-800
                    sm:text-2xl
                  "
                >
                  {
                    enderecoExibicao(
                      endereco
                    )
                  }
                </p>

                <p
                  className="
                    mt-1
                    text-xs
                    text-slate-500
                  "
                >
                  {MODO_SEM_BIPAGEM_LOCALIZACAO
                    ? "Coloque o produto nesta posição e confirme a armazenagem pelo botão abaixo."
                    : "Siga este endereço e valide cada identificação física na sequência."}
                </p>
              </div>


              <div
                className="
                  flex
                  flex-wrap
                  gap-2
                "
              >
                <button
                  onClick={
                    () =>
                      baixarEtiquetaArmazenagem(
                        dados
                      )
                  }

                  className="
                    inline-flex
                    items-center
                    gap-2
                    rounded-xl
                    bg-[#7F2D92]
                    px-4
                    py-2.5
                    text-sm
                    font-bold
                    text-white
                    hover:bg-[#6B1F87]
                  "
                >
                  <Printer
                    className="
                      h-4
                      w-4
                    "
                  />

                  PDF da etiqueta
                </button>


                {!concluido && (
                  <button
                    onClick={
                      cancelar
                    }

                    disabled={
                      carregando
                    }

                    className="
                      inline-flex
                      items-center
                      gap-2
                      rounded-xl
                      bg-white
                      px-4
                      py-2.5
                      text-sm
                      font-bold
                      text-red-600
                      ring-1
                      ring-red-200
                      hover:bg-red-50
                      disabled:opacity-40
                    "
                  >
                    <X
                      className="
                        h-4
                        w-4
                      "
                    />

                    Cancelar
                  </button>
                )}
              </div>
            </div>
          </Card>


          {!concluido ? (
            <Card
              className="
                border-t-4
                border-t-[#7F2D92]
              "
            >
              <div
                className="
                  mx-auto
                  max-w-3xl
                "
              >
                {MODO_SEM_BIPAGEM_LOCALIZACAO ? (
                  <div
                    className="
                      py-3
                      text-center
                    "
                  >
                    <div
                      className="
                        mx-auto
                        flex
                        h-12
                        w-12
                        items-center
                        justify-center
                        rounded-2xl
                        bg-amber-50
                        text-amber-600
                        ring-1
                        ring-amber-200
                      "
                    >
                      <AlertTriangle
                        className="h-6 w-6"
                      />
                    </div>

                    <p
                      className="
                        mt-4
                        text-xs
                        font-black
                        uppercase
                        tracking-wider
                        text-amber-600
                      "
                    >
                      Modo provisório sem bipagem
                    </p>

                    <h3
                      className="
                        mt-2
                        text-2xl
                        font-black
                        text-slate-800
                      "
                    >
                      Confirme a colocação física
                    </h3>

                    <p
                      className="
                        mx-auto
                        mt-2
                        max-w-xl
                        text-sm
                        text-slate-500
                      "
                    >
                      Coloque o produto em
                      <strong className="text-[#6B1F87]">
                        {` ${enderecoExibicao(endereco)} `}
                      </strong>
                      e confirme somente depois que ele estiver
                      fisicamente nessa posição.
                    </p>

                    <button
                      onClick={
                        confirmarSemBipagem
                      }

                      disabled={
                        carregando
                      }

                      className="
                        mt-6
                        inline-flex
                        items-center
                        justify-center
                        gap-2
                        rounded-2xl
                        bg-emerald-600
                        px-7
                        py-4
                        text-sm
                        font-black
                        text-white
                        hover:bg-emerald-700
                        disabled:opacity-40
                      "
                    >
                      {carregando ? (
                        <Loader
                          className="
                            h-5
                            w-5
                            animate-spin
                          "
                        />
                      ) : (
                        <CheckCircle
                          className="h-5 w-5"
                        />
                      )}

                      {carregando
                        ? "Confirmando..."
                        : "Confirmar armazenagem sem bipagem"}
                    </button>

                    <p
                      className="
                        mt-3
                        text-xs
                        font-semibold
                        text-red-500
                      "
                    >
                      Não confirme antes de colocar o produto na posição indicada.
                    </p>
                  </div>
                ) : (
                  <>
                    <Progresso
                      atual={etapaAtual}
                    />


                    <div
                      className="
                        mt-6
                        text-center
                      "
                    >
                      <p
                        className="
                          text-sm
                          text-slate-500
                        "
                      >
                        Agora bipe
                      </p>

                      <h3
                        className="
                          mt-1
                          text-2xl
                          font-black
                          text-[#6B1F87]
                        "
                      >
                        {etapa?.rotulo}
                      </h3>

                      <p
                        className="
                          mt-1
                          text-xs
                          text-slate-400
                        "
                      >
                        Formato da identificação
                        física: {etapa?.exemplo}
                      </p>


                      <div
                        className="
                          mx-auto
                          mt-4
                          flex
                          max-w-xl
                          gap-2
                        "
                      >
                        <input
                          ref={scanRef}

                          value={codigo}

                          disabled={
                            carregando
                          }

                          onChange={
                            (evento) =>
                              setCodigo(
                                evento
                                  .target
                                  .value
                                  .toUpperCase()
                              )
                          }

                          onKeyDown={
                            (evento) => {
                              if (
                                evento.key
                                === "Enter"
                              ) {
                                bipar();
                              }
                            }
                          }

                          placeholder={
                            `Bipe ${
                              etapa?.rotulo
                                .toLowerCase()
                            }...`
                          }

                          className="
                            min-w-0
                            flex-1
                            rounded-2xl
                            border-2
                            border-purple-200
                            px-5
                            py-4
                            text-center
                            font-mono
                            text-xl
                            font-black
                            uppercase
                            outline-none
                            focus:border-[#7F2D92]
                            disabled:opacity-50
                          "
                        />


                        <button
                          onClick={
                            bipar
                          }

                          disabled={
                            !codigo.trim() ||
                            carregando
                          }

                          className="
                            rounded-2xl
                            bg-[#7F2D92]
                            px-6
                            py-3
                            font-bold
                            text-white
                            hover:bg-[#6B1F87]
                            disabled:opacity-40
                          "
                        >
                          {carregando ? (
                            <Loader
                              className="
                                h-5
                                w-5
                                animate-spin
                              "
                            />
                          ) : (
                            "Validar"
                          )}
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </Card>
          ) : (
            <Card
              className="
                bg-emerald-50
                ring-emerald-200
              "
            >
              <div
                className="
                  py-5
                  text-center
                "
              >
                <CheckCircle
                  className="
                    mx-auto
                    h-12
                    w-12
                    text-emerald-600
                  "
                />

                <h3
                  className="
                    mt-3
                    text-xl
                    font-black
                    text-emerald-800
                  "
                >
                  Produto armazenado
                </h3>

                <p
                  className="
                    mt-1
                    text-sm
                    font-semibold
                    text-emerald-700
                  "
                >
                  {concluido.local}
                </p>

                <p
                  className="
                    mt-1
                    text-xs
                    text-emerald-600
                  "
                >
                  Próxima etapa:
                  Entrada no Oracle
                </p>

                <button
                  onClick={
                    reiniciar
                  }

                  className="
                    mt-5
                    rounded-xl
                    bg-emerald-600
                    px-6
                    py-2.5
                    text-sm
                    font-bold
                    text-white
                    hover:bg-emerald-700
                  "
                >
                  Armazenar próximo produto
                </button>
              </div>
            </Card>
          )}


          <Card>
            <DetalhesTriagem
              dados={dados}

              gradeFisica={
                dados.reserva
                  ?.grade_fisica
              }
            />
          </Card>
        </>
      )}
    </div>
  );
}
