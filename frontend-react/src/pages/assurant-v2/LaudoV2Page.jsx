import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  AlertTriangle,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  FileText,
  Image,
  Loader2,
  PackageSearch,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  ShieldAlert,
  Smartphone,
  Upload,
  X,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";

import {
  carregarParaLaudo,
  salvarLaudo,
  listarAguardandoLaudo,
  ETAPAS_FOTO,
} from "../../services/laudoService.js";

const LARGURA_MAX = 1400;
const QUALIDADE = 0.72;

const ETAPAS_PROCESSO = [
  {
    key: "voucher",
    label: "Aparelho",
    icon: ScanLine,
  },
  {
    key: "fotos",
    label: "Evidências",
    icon: Camera,
  },
  {
    key: "fim",
    label: "Conclusão",
    icon: FileText,
  },
];

function comprimir(
  fonte,
  largura,
  altura
) {
  const escala =
    Math.min(
      1,
      LARGURA_MAX /
        largura
    );

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width =
    Math.round(
      largura *
        escala
    );

  canvas.height =
    Math.round(
      altura *
        escala
    );

  canvas
    .getContext("2d")
    .drawImage(
      fonte,
      0,
      0,
      canvas.width,
      canvas.height
    );

  return canvas.toDataURL(
    "image/jpeg",
    QUALIDADE
  );
}

function formatarData(
  value
) {
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

function indiceEtapa(
  etapa
) {
  const index =
    ETAPAS_PROCESSO.findIndex(
      (item) =>
        item.key ===
        etapa
    );

  return index < 0
    ? 0
    : index;
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

function ContextoLaudo({
  dados,
  fotos,
}) {
  if (!dados) {
    return null;
  }

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
        "Cliente",
      value:
        dados.cliente ||
        "—",
    },
  ];

  const fotosProntas =
    fotos.filter(
      Boolean
    ).length;

  return (
    <div className="space-y-5">
      <Panel
        title="Aparelho em laudo"
        subtitle="Contexto da operação atual."
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

        {dados.motivo && (
          <div className="border-t border-slate-100 bg-amber-50/70 px-5 py-3">
            <div className="text-[9px] font-black uppercase tracking-wide text-amber-500">
              Motivo do laudo
            </div>

            <div className="mt-1 text-[11px] font-bold leading-4 text-amber-800">
              {
                dados.motivo
              }
            </div>
          </div>
        )}
      </Panel>

      <Panel
        title="Evidências"
        subtitle="Progresso das fotos obrigatórias."
        icon={
          Camera
        }
      >
        <div className="p-5">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[28px] font-black tracking-tight text-slate-900">
                {fotosProntas}
                <span className="text-base font-bold text-slate-300">
                  /
                  {
                    ETAPAS_FOTO.length
                  }
                </span>
              </div>

              <div className="mt-0.5 text-[10px] text-slate-400">
                Fotos registradas
              </div>
            </div>

            <div
              className={`rounded-lg px-2.5 py-1 text-[9px] font-black uppercase tracking-wide ${
                fotosProntas ===
                ETAPAS_FOTO.length
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-violet-50 text-violet-700"
              }`}
            >
              {fotosProntas ===
              ETAPAS_FOTO.length
                ? "Completo"
                : "Em andamento"}
            </div>
          </div>

          <div className="mt-4 h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-violet-600 transition-all duration-300"
              style={{
                width: `${
                  ETAPAS_FOTO.length
                    ? Math.round(
                        (fotosProntas /
                          ETAPAS_FOTO.length) *
                          100
                      )
                    : 0
                }%`,
              }}
            />
          </div>
        </div>
      </Panel>
    </div>
  );
}

function FilaLaudo({
  fila,
  carregando,
  bloqueado,
  onAtualizar,
  onAbrir,
}) {
  return (
    <Panel
      title="Fila de Laudos"
      subtitle="Aparelhos aguardando evidência documental."
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
            Nenhum aparelho aguardando laudo.
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
                  <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <FileText className="h-4 w-4" />
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
                      <span
                        title={
                          item.motivo
                        }
                        className="max-w-[180px] truncate rounded-md bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700"
                      >
                        {item.motivo ||
                          `${
                            item.divergencias ||
                            0
                          } divergência(s)`}
                      </span>

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
                    Abrir

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

export default function LaudoV2Page() {
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
    dados,
    setDados,
  ] = useState(null);

  const [
    fotos,
    setFotos,
  ] = useState(() =>
    ETAPAS_FOTO.map(
      () => null
    )
  );

  const [
    idxFoto,
    setIdxFoto,
  ] = useState(0);

  const [
    observacao,
    setObservacao,
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

  const [
    camAtiva,
    setCamAtiva,
  ] = useState(false);

  const [
    camErro,
    setCamErro,
  ] = useState(null);

  const videoRef =
    useRef(null);

  const streamRef =
    useRef(null);

  useEffect(
    () => {
      carregarFila();

      return () => {
        pararCamera();
      };
    },
    []
  );

  const fotosCapturadas =
    useMemo(
      () =>
        fotos.filter(
          Boolean
        ).length,
      [
        fotos,
      ]
    );

  const todasFotos =
    fotosCapturadas ===
    ETAPAS_FOTO.length;

  const etapaFotoAtual =
    ETAPAS_FOTO[
      idxFoto
    ];

  async function carregarFila() {
    setCarregandoFila(
      true
    );

    try {
      setFila(
        await listarAguardandoLaudo()
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

  function pararCamera() {
    if (
      streamRef.current
    ) {
      streamRef.current
        .getTracks()
        .forEach(
          (track) =>
            track.stop()
        );

      streamRef.current =
        null;
    }

    setCamAtiva(
      false
    );
  }

  async function abrirCamera() {
    setCamErro(
      null
    );

    try {
      const stream =
        await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: {
              ideal:
                "environment",
            },

            width: {
              ideal:
                1920,
            },
          },
        });

      streamRef.current =
        stream;

      setCamAtiva(
        true
      );

      setTimeout(
        () => {
          if (
            videoRef.current
          ) {
            videoRef.current.srcObject =
              stream;
          }
        },
        50
      );
    } catch {
      setCamErro(
        "Não foi possível abrir a câmera. Utilize a opção de selecionar arquivo."
      );
    }
  }

  function capturar() {
    const video =
      videoRef.current;

    if (
      !video ||
      !video.videoWidth
    ) {
      return;
    }

    const imagem =
      comprimir(
        video,
        video.videoWidth,
        video.videoHeight
      );

    guardarFoto(
      imagem
    );

    pararCamera();
  }

  function selecionarArquivo(
    file
  ) {
    if (!file) {
      return;
    }

    const reader =
      new FileReader();

    reader.onload =
      () => {
        const imagem =
          new window.Image();

        imagem.onload =
          () =>
            guardarFoto(
              comprimir(
                imagem,
                imagem.width,
                imagem.height
              )
            );

        imagem.onerror =
          () =>
            mostrarErro(
              "Não foi possível ler a imagem."
            );

        imagem.src =
          reader.result;
      };

    reader.onerror =
      () =>
        mostrarErro(
          "Não foi possível ler o arquivo."
        );

    reader.readAsDataURL(
      file
    );
  }

  function guardarFoto(
    dataUrl
  ) {
    setFotos(
      (
        anteriores
      ) => {
        const nova = [
          ...anteriores,
        ];

        nova[
          idxFoto
        ] = dataUrl;

        return nova;
      }
    );

    if (
      idxFoto <
      ETAPAS_FOTO.length -
        1
    ) {
      setIdxFoto(
        (
          atual
        ) =>
          atual + 1
      );
    }
  }

  function removerFoto(
    index
  ) {
    setFotos(
      (
        anteriores
      ) => {
        const nova = [
          ...anteriores,
        ];

        nova[
          index
        ] = null;

        return nova;
      }
    );

    setIdxFoto(
      index
    );

    pararCamera();
  }

  function selecionarEtapaFoto(
    index
  ) {
    setIdxFoto(
      index
    );

    pararCamera();
  }

  function reiniciar() {
    pararCamera();

    setEtapa(
      "voucher"
    );

    setBusca("");

    setDados(
      null
    );

    setFotos(
      ETAPAS_FOTO.map(
        () => null
      )
    );

    setIdxFoto(
      0
    );

    setObservacao(
      ""
    );

    setResultado(
      null
    );

    setCamErro(
      null
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
        await carregarParaLaudo(
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

      setFotos(
        ETAPAS_FOTO.map(
          () => null
        )
      );

      setIdxFoto(
        0
      );

      setEtapa(
        "fotos"
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
        await carregarParaLaudo(
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

      setDados(
        resposta
      );

      setFotos(
        ETAPAS_FOTO.map(
          () => null
        )
      );

      setIdxFoto(
        0
      );

      setEtapa(
        "fotos"
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

  async function handleGerar() {
    if (
      !todasFotos
    ) {
      return;
    }

    setCarregando(
      true
    );

    try {
      const resposta =
        await salvarLaudo({
          dados,
          fotos,
          observacao,
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
            Bancada de Laudos
          </div>

          <div className="mt-0.5 text-[11px] text-slate-400">
            Registro visual e documental das divergências identificadas.
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

            Novo laudo
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
              subtitle="Bipe um voucher que esteja aguardando laudo."
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
                      Evidências
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-700">
                      {
                        ETAPAS_FOTO.length
                      }{" "}
                      fotos obrigatórias
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                      Origem
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-700">
                      Triagem Funcional
                    </div>
                  </div>
                </div>
              </div>
            </Panel>
          )}

          {/* =========================
              ETAPA 2 — FOTOS
          ========================== */}
          {etapa ===
            "fotos" &&
            dados && (
              <div className="space-y-5">
                <Panel
                  title="Evidências fotográficas"
                  subtitle="Registre todas as evidências obrigatórias antes de gerar o laudo."
                  icon={
                    Camera
                  }
                  action={
                    <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-[10px] font-black text-violet-700">
                      {
                        fotosCapturadas
                      }
                      /
                      {
                        ETAPAS_FOTO.length
                      }
                    </span>
                  }
                >
                  <div className="p-5">
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      {ETAPAS_FOTO.map(
                        (
                          item,
                          index
                        ) => {
                          const selecionada =
                            index ===
                            idxFoto;

                          const pronta =
                            Boolean(
                              fotos[
                                index
                              ]
                            );

                          return (
                            <button
                              key={
                                item.id
                              }
                              type="button"
                              onClick={() =>
                                selecionarEtapaFoto(
                                  index
                                )
                              }
                              className={`overflow-hidden rounded-xl border p-2 text-left transition ${
                                selecionada
                                  ? "border-violet-400 bg-violet-50 ring-4 ring-violet-100"
                                  : pronta
                                  ? "border-emerald-200 bg-emerald-50/50"
                                  : "border-slate-200 bg-white hover:border-violet-200"
                              }`}
                            >
                              <div className="relative flex h-32 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                                {pronta ? (
                                  <img
                                    src={
                                      fotos[
                                        index
                                      ]
                                    }
                                    alt={
                                      item.titulo
                                    }
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Camera className="h-6 w-6 text-slate-300" />
                                )}

                                {pronta && (
                                  <div className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                                    <Check className="h-3.5 w-3.5" />
                                  </div>
                                )}

                                {selecionada && (
                                  <span className="absolute bottom-2 left-2 rounded-md bg-violet-700 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-white">
                                    Atual
                                  </span>
                                )}
                              </div>

                              <div className="px-1 pb-1 pt-2">
                                <div className="truncate text-[11px] font-black text-slate-700">
                                  {
                                    item.titulo
                                  }
                                </div>

                                <div
                                  className={`mt-0.5 text-[9px] font-semibold ${
                                    pronta
                                      ? "text-emerald-600"
                                      : "text-slate-400"
                                  }`}
                                >
                                  {pronta
                                    ? "Evidência registrada"
                                    : "Foto obrigatória"}
                                </div>
                              </div>
                            </button>
                          );
                        }
                      )}
                    </div>
                  </div>
                </Panel>

                <Panel
                  title={
                    etapaFotoAtual
                      ?.titulo ||
                    "Captura"
                  }
                  subtitle="Utilize a câmera ou selecione uma imagem do dispositivo."
                  icon={
                    Image
                  }
                  action={
                    fotos[
                      idxFoto
                    ] && (
                      <button
                        type="button"
                        onClick={() =>
                          removerFoto(
                            idxFoto
                          )
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-2.5 text-[10px] font-bold text-rose-600 transition hover:bg-rose-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />

                        Refazer
                      </button>
                    )
                  }
                >
                  <div className="p-5">
                    {camAtiva ? (
                      <div>
                        <div className="overflow-hidden rounded-2xl bg-slate-950">
                          <video
                            ref={
                              videoRef
                            }
                            autoPlay
                            playsInline
                            muted
                            className="max-h-[540px] w-full object-contain"
                          />
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={
                              capturar
                            }
                            className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800"
                          >
                            <Camera className="h-4 w-4" />
                            Capturar foto
                          </button>

                          <button
                            type="button"
                            onClick={
                              pararCamera
                            }
                            className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                          >
                            <X className="h-4 w-4" />
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
                        <div
                          className={`flex min-h-[360px] items-center justify-center overflow-hidden rounded-2xl border ${
                            fotos[
                              idxFoto
                            ]
                              ? "border-slate-200 bg-slate-950"
                              : "border-dashed border-slate-300 bg-slate-50"
                          }`}
                        >
                          {fotos[
                            idxFoto
                          ] ? (
                            <img
                              src={
                                fotos[
                                  idxFoto
                                ]
                              }
                              alt={
                                etapaFotoAtual
                                  ?.titulo
                              }
                              className="max-h-[520px] w-full object-contain"
                            />
                          ) : (
                            <div className="px-6 text-center">
                              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100 text-violet-600">
                                <Camera className="h-6 w-6" />
                              </div>

                              <div className="mt-4 text-sm font-black text-slate-700">
                                Evidência ainda não registrada
                              </div>

                              <div className="mx-auto mt-1 max-w-[380px] text-[11px] leading-5 text-slate-400">
                                Posicione o aparelho adequadamente e registre a evidência solicitada.
                              </div>
                            </div>
                          )}
                        </div>

                        <div className="space-y-3">
                          <button
                            type="button"
                            onClick={
                              abrirCamera
                            }
                            className="flex w-full items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-left transition hover:border-violet-400 hover:bg-violet-100"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-700 text-white">
                              <Camera className="h-5 w-5" />
                            </div>

                            <div>
                              <div className="text-xs font-black text-violet-800">
                                Abrir câmera
                              </div>

                              <div className="mt-0.5 text-[9px] leading-4 text-violet-600">
                                Câmera traseira em celular/tablet quando disponível.
                              </div>
                            </div>
                          </button>

                          <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition hover:border-violet-200 hover:bg-violet-50">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
                              <Upload className="h-5 w-5" />
                            </div>

                            <div>
                              <div className="text-xs font-black text-slate-700">
                                Selecionar arquivo
                              </div>

                              <div className="mt-0.5 text-[9px] leading-4 text-slate-400">
                                Utilize uma foto já disponível no dispositivo.
                              </div>
                            </div>

                            <input
                              type="file"
                              accept="image/*"
                              capture="environment"
                              className="hidden"
                              onChange={(
                                event
                              ) => {
                                selecionarArquivo(
                                  event
                                    .target
                                    .files?.[
                                    0
                                  ]
                                );

                                event.target.value =
                                  "";
                              }}
                            />
                          </label>

                          {camErro && (
                            <Aviso tipo="aviso">
                              {
                                camErro
                              }
                            </Aviso>
                          )}

                          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                            <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                              Próxima evidência
                            </div>

                            <div className="mt-1 text-xs font-bold text-slate-700">
                              {idxFoto <
                              ETAPAS_FOTO.length -
                                1
                                ? ETAPAS_FOTO[
                                    idxFoto +
                                      1
                                  ]
                                    ?.titulo
                                : "Após esta foto, revise o conjunto."}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </Panel>

                <div className="grid gap-5 xl:grid-cols-2">
                  <Panel
                    title="Ocorrências da Triagem Funcional"
                    subtitle="Informações trazidas automaticamente da etapa anterior."
                    icon={
                      ShieldAlert
                    }
                  >
                    {dados.divergencias
                      ?.length >
                      0 ||
                    dados.defeitos
                      ?.length >
                      0 ? (
                      <div className="space-y-4 p-5">
                        {dados.divergencias
                          ?.length >
                          0 && (
                          <div className="overflow-hidden rounded-xl border border-slate-200">
                            <div className="divide-y divide-slate-100">
                              {dados.divergencias.map(
                                (
                                  divergencia,
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
                                        divergencia.pergunta
                                      }
                                    </span>

                                    <span className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1 text-[10px] font-black text-rose-700">
                                      {
                                        divergencia.resposta
                                      }
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          </div>
                        )}

                        {dados.defeitos
                          ?.length >
                          0 && (
                          <div>
                            <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                              Defeitos identificados
                            </div>

                            <div className="mt-2 flex flex-wrap gap-2">
                              {dados.defeitos.map(
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
                      </div>
                    ) : (
                      <div className="p-5">
                        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
                          Nenhuma ocorrência detalhada recebida da Triagem Funcional.
                        </div>
                      </div>
                    )}
                  </Panel>

                  <Panel
                    title="Observações do Laudo"
                    subtitle="Insira uma ocorrência por linha."
                    icon={
                      FileText
                    }
                  >
                    <div className="p-5">
                      <textarea
                        rows={
                          7
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
                        placeholder={
                          "Tela quebrada\nTela com mancha preta"
                        }
                        className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700 outline-none transition placeholder:text-slate-300 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                      />

                      <div className="mt-2 text-[9px] text-slate-400">
                        Este campo permanece opcional, conforme a operação atual.
                      </div>
                    </div>
                  </Panel>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div>
                    <div className="text-xs font-black text-slate-700">
                      {todasFotos
                        ? "Evidências completas"
                        : `Faltam ${
                            ETAPAS_FOTO.length -
                            fotosCapturadas
                          } foto(s)`}
                    </div>

                    <div className="mt-0.5 text-[10px] text-slate-400">
                      Todas as etapas fotográficas são obrigatórias para gerar o laudo.
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={
                      handleGerar
                    }
                    disabled={
                      !todasFotos ||
                      carregando
                    }
                    className="inline-flex h-11 items-center gap-2 rounded-xl bg-emerald-600 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {carregando ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}

                    {carregando
                      ? "Gerando laudo..."
                      : "Gerar laudo"}
                  </button>
                </div>
              </div>
            )}

          {/* =========================
              ETAPA 3 — RESULTADO
          ========================== */}
          {etapa ===
            "fim" &&
            resultado && (
              <Panel
                title="Laudo concluído"
                subtitle="O processo documental foi finalizado."
                icon={
                  CheckCircle2
                }
              >
                <div className="p-5 lg:p-6">
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                    <div className="flex items-start gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white">
                        <CheckCircle2 className="h-5 w-5" />
                      </div>

                      <div className="min-w-0">
                        <h3 className="text-base font-black text-emerald-900">
                          Laudo gerado com sucesso
                        </h3>

                        <p className="mt-1 text-xs leading-5 text-emerald-700">
                          O arquivo foi gerado e o aparelho seguiu para{" "}
                          <strong>
                            {resultado.status ||
                              "a próxima etapa"}
                          </strong>
                          .
                        </p>

                        {resultado.arquivo && (
                          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2 font-mono text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                            <FileText className="h-3.5 w-3.5" />

                            {
                              resultado.arquivo
                            }
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex justify-end">
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
            <FilaLaudo
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
                abrirVoucher
              }
            />
          ) : (
            <>
              <ContextoLaudo
                dados={
                  dados
                }
                fotos={
                  fotos
                }
              />

              <FilaLaudo
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
                  abrirVoucher
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}