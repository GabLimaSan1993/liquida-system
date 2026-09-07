import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Lock,
  Package,
  Plus,
  Printer,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Trash2,
  Truck,
  UserRound,
  X,
} from "lucide-react";

import JsBarcode from "jsbarcode";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";

import {
  criarRecebimento,
  biparVoucher,
  removerVoucher,
  listarVouchers,
  concluirRecebimento,
  buscarRomaneio,
  listarEmAndamento,
  buscarRecebimento,
  TRANSPORTADORAS,
} from "../../services/recebimentoService.js";

import { useAuth } from "../../AuthContext.jsx";

function fmtDataHora(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function fmtHora(value) {
  if (!value) return "—";

  return new Date(value).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function gerarBarcodeSVG(voucher) {
  const svg = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg"
  );

  try {
    JsBarcode(svg, voucher, {
      format: "CODE128",
      width: 2,
      height: 60,
      displayValue: true,
      fontSize: 14,
      margin: 6,
      textMargin: 2,
    });
  } catch (error) {
    console.error("Barcode:", error);
  }

  return svg.outerHTML;
}

function imprimirEtiqueta(voucher) {
  const svg = gerarBarcodeSVG(voucher);

  const win = window.open(
    "",
    "_blank",
    "width=420,height=280"
  );

  if (!win) return;

  win.document.write(`
    <html>
      <head>
        <title>Etiqueta ${voucher}</title>
        <style>
          @page {
            size: 50mm 30mm;
            margin: 0;
          }

          body {
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: sans-serif;
          }

          .etq {
            text-align: center;
          }

          svg {
            max-width: 46mm;
          }
        </style>
      </head>

      <body>
        <div class="etq">${svg}</div>

        <script>
          window.onload = function () {
            window.print();

            setTimeout(function () {
              window.close();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);

  win.document.close();
}

function PageHeader({ etapa }) {
  const steps = [
    {
      key: "lista",
      label: "Cargas",
    },
    {
      key: "carga",
      label: "Dados",
    },
    {
      key: "bipagem",
      label: "Bipagem",
    },
    {
      key: "romaneio",
      label: "Conclusão",
    },
  ];

  const currentIndex = steps.findIndex(
    (step) => step.key === etapa
  );

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            Assurant Warehouse
          </span>

          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Recebimento
          </span>
        </div>

        <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-900 lg:text-[30px]">
          Recebimento YBV
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Registro de chegada, lacres, bipagem de vouchers e romaneio.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
        <div className="flex min-w-[620px] items-center">
          {steps.map((step, index) => {
            const done = index < currentIndex;
            const active = index === currentIndex;

            return (
              <div
                key={step.key}
                className="flex flex-1 items-center"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                        ? "bg-violet-600 text-white"
                        : "bg-slate-100 text-slate-400"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      index + 1
                    )}
                  </div>

                  <div
                    className={`text-xs font-bold ${
                      active
                        ? "text-violet-700"
                        : done
                        ? "text-emerald-700"
                        : "text-slate-400"
                    }`}
                  >
                    {step.label}
                  </div>
                </div>

                {index < steps.length - 1 && (
                  <div
                    className={`mx-4 h-px flex-1 ${
                      done
                        ? "bg-emerald-300"
                        : "bg-slate-200"
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
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
      {(title || action) && (
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
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
                <p className="mt-0.5 text-[11px] text-slate-400">
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

function ErrorBox({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function TelaLista({
  onNovo,
  onContinuar,
}) {
  const { user, profile } = useAuth();

  const [cargas, setCargas] =
    useState([]);

  const [loading, setLoading] =
    useState(true);

  async function carregar() {
    setLoading(true);

    try {
      setCargas(
        await listarEmAndamento()
      );
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  const isMaster =
    !!profile?.is_master;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-black text-slate-900">
            Cargas em andamento
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            Retome uma carga existente ou inicie um novo recebimento.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={carregar}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>

          <button
            type="button"
            onClick={onNovo}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800"
          >
            <Plus className="h-4 w-4" />
            Novo recebimento
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" />
        </div>
      ) : cargas.length === 0 ? (
        <Panel>
          <div className="px-6 py-14 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
              <Package className="h-5 w-5" />
            </div>

            <h3 className="mt-4 text-sm font-black text-slate-700">
              Nenhuma carga em andamento
            </h3>

            <p className="mt-1 text-xs text-slate-400">
              Inicie um novo recebimento para começar a operação.
            </p>
          </div>
        </Panel>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {cargas.map((carga) => {
            const minhaCarga =
              carga.iniciado_por ===
              user?.id;

            const podeAbrir =
              minhaCarga ||
              isMaster;

            return (
              <div
                key={carga.id}
                className={`rounded-2xl border bg-white p-5 shadow-sm ${
                  podeAbrir
                    ? "border-slate-200"
                    : "border-slate-200 opacity-70"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="inline-flex rounded-lg bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700">
                      {carga.transportadora}
                    </span>

                    <div className="mt-3 text-sm font-black text-slate-800">
                      {carga.motorista_nome ||
                        "Motorista não informado"}
                    </div>

                    <div className="mt-1 font-mono text-xs text-slate-400">
                      {carga.placa ||
                        "Placa não informada"}
                    </div>
                  </div>

                  {minhaCarga ? (
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">
                      Minha carga
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                      <Lock className="h-3 w-3" />
                      Outro operador
                    </span>
                  )}
                </div>

                <div className="mt-5 grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Início
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-600">
                      {fmtHora(
                        carga.iniciado_em
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Vouchers
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-600">
                      {carga.total_vouchers ||
                        0}
                    </div>
                  </div>

                  <div>
                    <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400">
                      Lacres
                    </div>

                    <div className="mt-1 text-xs font-bold text-slate-600">
                      {carga.lacres?.length ||
                        0}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  {podeAbrir ? (
                    <button
                      type="button"
                      onClick={() =>
                        onContinuar(
                          carga.id
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-violet-800"
                    >
                      Continuar
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : (
                    <div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-bold text-slate-400">
                      <Lock className="h-4 w-4" />
                      Em uso por{" "}
                      {carga.iniciado_por_nome ||
                        "outro operador"}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TelaCarga({
  onIniciar,
  onVoltar,
}) {
  const { user, profile } =
    useAuth();

  const [
    transportadora,
    setTransportadora,
  ] = useState("");

  const [motorista, setMotorista] =
    useState("");

  const [cpf, setCpf] =
    useState("");

  const [placa, setPlaca] =
    useState("");

  const [
    lacreInput,
    setLacreInput,
  ] = useState("");

  const [lacres, setLacres] =
    useState([]);

  const [erro, setErro] =
    useState("");

  const [criando, setCriando] =
    useState(false);

  const lacreRef =
    useRef(null);

  function addLacre(event) {
    event.preventDefault();

    const lacre = lacreInput
      .trim()
      .toUpperCase();

    if (!lacre) return;

    if (
      !lacres.includes(lacre)
    ) {
      setLacres((prev) => [
        ...prev,
        lacre,
      ]);
    }

    setLacreInput("");

    lacreRef.current?.focus();
  }

  function removerLacre(lacre) {
    setLacres((prev) =>
      prev.filter(
        (item) =>
          item !== lacre
      )
    );
  }

  async function iniciar() {
    setErro("");

    if (!transportadora) {
      setErro(
        "Selecione a transportadora."
      );

      return;
    }

    setCriando(true);

    try {
      const res =
        await criarRecebimento(
          {
            transportadora,
            motorista_nome:
              motorista,
            motorista_cpf: cpf,
            placa,
            lacres,
          },
          user.id,
          profile?.nome
        );

      if (!res.ok) {
        setErro(res.erro);
        return;
      }

      onIniciar(
        res.recebimento
      );
    } catch (error) {
      setErro(error.message);
    } finally {
      setCriando(false);
    }
  }

  const inputClass =
    "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-700 outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100";

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onVoltar}
        className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 transition hover:text-violet-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Voltar para cargas
      </button>

      <Panel
        title="Dados da carga"
        subtitle="Registre os dados de chegada antes de iniciar as bipagens."
        icon={Truck}
      >
        <div className="space-y-6 p-5">
          <div>
            <label className="text-xs font-black uppercase tracking-wide text-slate-500">
              Transportadora
            </label>

            <div className="mt-3 flex flex-wrap gap-2">
              {TRANSPORTADORAS.map(
                (item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      setTransportadora(
                        item
                      )
                    }
                    className={`rounded-xl border px-4 py-2.5 text-xs font-bold transition ${
                      transportadora ===
                      item
                        ? "border-violet-700 bg-violet-700 text-white"
                        : "border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50"
                    }`}
                  >
                    {item}
                  </button>
                )
              )}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <label>
              <span className="text-xs font-bold text-slate-500">
                Nome do motorista
              </span>

              <input
                value={motorista}
                onChange={(event) =>
                  setMotorista(
                    event.target.value
                  )
                }
                className={`mt-2 ${inputClass}`}
              />
            </label>

            <label>
              <span className="text-xs font-bold text-slate-500">
                CPF
              </span>

              <input
                value={cpf}
                onChange={(event) =>
                  setCpf(
                    event.target.value
                  )
                }
                className={`mt-2 font-mono ${inputClass}`}
              />
            </label>

            <label>
              <span className="text-xs font-bold text-slate-500">
                Placa
              </span>

              <input
                value={placa}
                onChange={(event) =>
                  setPlaca(
                    event.target.value.toUpperCase()
                  )
                }
                className={`mt-2 font-mono uppercase ${inputClass}`}
              />
            </label>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-violet-600" />

              <span className="text-xs font-black uppercase tracking-wide text-slate-500">
                Lacres
              </span>

              <span className="rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
                {lacres.length}
              </span>
            </div>

            <form
              onSubmit={addLacre}
              className="mt-3"
            >
              <input
                ref={lacreRef}
                value={lacreInput}
                onChange={(event) =>
                  setLacreInput(
                    event.target.value
                  )
                }
                placeholder="Digite o lacre e pressione Enter"
                className={`font-mono ${inputClass}`}
              />
            </form>

            {lacres.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {lacres.map(
                  (lacre) => (
                    <span
                      key={lacre}
                      className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 font-mono text-xs font-semibold text-violet-700"
                    >
                      {lacre}

                      <button
                        type="button"
                        onClick={() =>
                          removerLacre(
                            lacre
                          )
                        }
                        className="text-violet-400 hover:text-rose-600"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      </Panel>

      {erro && (
        <ErrorBox>
          {erro}
        </ErrorBox>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={iniciar}
          disabled={criando}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white shadow-sm transition hover:bg-violet-800 disabled:opacity-50"
        >
          {criando ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4" />
          )}

          Iniciar bipagem
        </button>
      </div>
    </div>
  );
}

function TelaBipagem({
  recebimento,
  onVoltar,
  onConcluir,
}) {
  const { user, profile } =
    useAuth();

  const [
    voucherInput,
    setVoucherInput,
  ] = useState("");

  const [vouchers, setVouchers] =
    useState([]);

  const [
    feedback,
    setFeedback,
  ] = useState(null);

  const [proc, setProc] =
    useState(false);

  const [
    concluindo,
    setConcluindo,
  ] = useState(false);

  const inputRef =
    useRef(null);

  async function carregar() {
    setVouchers(
      await listarVouchers(
        recebimento.id
      )
    );
  }

  useEffect(() => {
    carregar();
    inputRef.current?.focus();
  }, []);

  async function handleBipar(
    event
  ) {
    event.preventDefault();

    const voucher =
      voucherInput.trim();

    if (!voucher || proc) return;

    setVoucherInput("");
    setProc(true);

    try {
      const res =
        await biparVoucher(
          recebimento.id,
          voucher,
          user.id,
          profile?.nome
        );

      if (!res.ok) {
        setFeedback({
          tipo: "erro",
          msg: res.erro,
        });
      } else {
        setFeedback({
          tipo: "ok",
          msg: `Voucher ${res.voucher.voucher} recebido.`,
        });

        setVouchers((prev) => [
          res.voucher,
          ...prev,
        ]);

        imprimirEtiqueta(
          res.voucher.voucher
        );
      }
    } catch (error) {
      setFeedback({
        tipo: "erro",
        msg: error.message,
      });
    } finally {
      setProc(false);

      inputRef.current?.focus();

      setTimeout(
        () =>
          setFeedback(null),
        3500
      );
    }
  }

  async function handleRemover(
    voucherId
  ) {
    const res =
      await removerVoucher(
        voucherId,
        recebimento.id
      );

    if (res.ok) {
      setVouchers((prev) =>
        prev.filter(
          (voucher) =>
            voucher.id !==
            voucherId
        )
      );
    }

    inputRef.current?.focus();
  }

  async function handleConcluir() {
    setConcluindo(true);

    try {
      const res =
        await concluirRecebimento(
          recebimento.id,
          user.id
        );

      if (res.ok) {
        onConcluir(
          res.recebimento
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setConcluindo(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={onVoltar}
          className="inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-violet-700"
        >
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>

        <div className="flex flex-1 flex-wrap items-center gap-2">
          <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-xs font-bold text-violet-700">
            {recebimento.transportadora}
          </span>

          {recebimento.motorista_nome && (
            <span className="text-xs text-slate-500">
              {recebimento.motorista_nome}
            </span>
          )}

          {recebimento.placa && (
            <span className="font-mono text-xs text-slate-400">
              {recebimento.placa}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={handleConcluir}
          disabled={
            concluindo ||
            vouchers.length === 0
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:opacity-40"
        >
          {concluindo ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}

          Concluir recebimento
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Panel
          title="Bipagem de vouchers"
          subtitle="O foco permanece automaticamente no campo para operação com leitor."
          icon={ScanLine}
        >
          <div className="p-5">
            <form
              onSubmit={
                handleBipar
              }
            >
              <div className="relative">
                <ScanLine className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-violet-500" />

                <input
                  ref={inputRef}
                  value={voucherInput}
                  onChange={(event) =>
                    setVoucherInput(
                      event.target.value
                    )
                  }
                  placeholder="Bipe ou digite o voucher YBV..."
                  autoComplete="off"
                  className="h-14 w-full rounded-xl border border-violet-200 bg-violet-50/30 pl-12 pr-4 font-mono text-base font-bold text-slate-800 outline-none transition focus:border-violet-400 focus:bg-white focus:ring-4 focus:ring-violet-100"
                />
              </div>
            </form>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-400">
              <Printer className="h-3.5 w-3.5" />
              A etiqueta continua sendo impressa automaticamente após a bipagem.
            </div>

            {feedback && (
              <div
                className={`mt-4 flex items-center gap-2 rounded-xl border px-4 py-3 text-xs font-semibold ${
                  feedback.tipo ===
                  "ok"
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {feedback.tipo ===
                "ok" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : (
                  <AlertTriangle className="h-4 w-4" />
                )}

                {feedback.msg}
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Vouchers recebidos"
          subtitle="Controle da carga atual."
          icon={Package}
          action={
            <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-700">
              {vouchers.length}
            </span>
          }
        >
          <div className="max-h-[480px] overflow-y-auto p-4">
            {vouchers.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-400">
                Nenhum voucher bipado ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {vouchers.map(
                  (voucher) => (
                    <div
                      key={voucher.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5"
                    >
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                        <CheckCircle2 className="h-4 w-4" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-mono text-xs font-bold text-slate-700">
                          {voucher.voucher}
                        </div>

                        <div className="mt-0.5 text-[10px] text-slate-400">
                          {fmtDataHora(
                            voucher.bipado_em
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          imprimirEtiqueta(
                            voucher.voucher
                          )
                        }
                        className="rounded-lg p-2 text-violet-600 hover:bg-violet-100"
                        title="Reimprimir"
                      >
                        <Printer className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          handleRemover(
                            voucher.id
                          )
                        }
                        className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                        title="Remover"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function TelaRomaneio({
  recebimentoId,
  onNovo,
}) {
  const [dados, setDados] =
    useState(null);

  const [loading, setLoading] =
    useState(true);

  async function carregar() {
    setLoading(true);

    const res =
      await buscarRomaneio(
        recebimentoId
      );

    setDados(
      res.ok ? res : null
    );

    setLoading(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  function exportarExcel() {
    if (!dados) return;

    const rec =
      dados.recebimento;

    const cab = [
      [
        "ROMANEIO DE RECEBIMENTO — YBV",
      ],
      [],
      [
        "Transportadora",
        rec.transportadora,
      ],
      [
        "Motorista",
        rec.motorista_nome ||
          "—",
      ],
      [
        "CPF",
        rec.motorista_cpf ||
          "—",
      ],
      [
        "Placa",
        rec.placa || "—",
      ],
      [
        "Lacres",
        (
          rec.lacres || []
        ).join(", ") || "—",
      ],
      [
        "Colaborador",
        rec.iniciado_por_nome ||
          "—",
      ],
      [
        "Início",
        fmtDataHora(
          rec.iniciado_em
        ),
      ],
      [
        "Término",
        fmtDataHora(
          rec.concluido_em
        ),
      ],
      [
        "Total de vouchers",
        dados.vouchers.length,
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
      dados.vouchers.map(
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

  function exportarPDF() {
    if (!dados) return;

    const rec =
      dados.recebimento;

    const doc =
      new jsPDF();

    doc.setFontSize(14);

    doc.text(
      "Romaneio de Recebimento — YBV",
      14,
      16
    );

    doc.setFontSize(10);

    const info = [
      `Transportadora: ${rec.transportadora}`,
      `Motorista: ${
        rec.motorista_nome ||
        "—"
      }   CPF: ${
        rec.motorista_cpf ||
        "—"
      }   Placa: ${
        rec.placa || "—"
      }`,
      `Lacres: ${
        (
          rec.lacres || []
        ).join(", ") || "—"
      }`,
      `Colaborador: ${
        rec.iniciado_por_nome ||
        "—"
      }`,
      `Início: ${fmtDataHora(
        rec.iniciado_em
      )}   Término: ${fmtDataHora(
        rec.concluido_em
      )}`,
      `Total de vouchers: ${dados.vouchers.length}`,
    ];

    info.forEach(
      (text, index) =>
        doc.text(
          text,
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
        dados.vouchers.map(
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

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" />
      </div>
    );
  }

  if (!dados) {
    return (
      <ErrorBox>
        Não foi possível carregar o romaneio.
      </ErrorBox>
    );
  }

  const rec =
    dados.recebimento;

  const info = [
    [
      "Transportadora",
      rec.transportadora,
    ],
    [
      "Motorista",
      rec.motorista_nome ||
        "—",
    ],
    [
      "CPF",
      rec.motorista_cpf ||
        "—",
    ],
    [
      "Placa",
      rec.placa || "—",
    ],
    [
      "Colaborador",
      rec.iniciado_por_nome ||
        "—",
    ],
    [
      "Vouchers",
      dados.vouchers.length,
    ],
    [
      "Início",
      fmtDataHora(
        rec.iniciado_em
      ),
    ],
    [
      "Término",
      fmtDataHora(
        rec.concluido_em
      ),
    ],
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <CheckCircle2 className="h-5 w-5" />
          </div>

          <div>
            <h2 className="text-base font-black text-emerald-900">
              Recebimento concluído
            </h2>

            <p className="mt-0.5 text-xs text-emerald-700">
              A carga foi concluída e o romaneio está disponível.
            </p>
          </div>
        </div>
      </div>

      <Panel
        title="Resumo da carga"
        icon={Truck}
      >
        <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-4">
          {info.map(
            ([label, value]) => (
              <div key={label}>
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                  {label}
                </div>

                <div className="mt-1 text-sm font-bold text-slate-700">
                  {value}
                </div>
              </div>
            )
          )}
        </div>
      </Panel>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={
            exportarExcel
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-bold text-white hover:bg-emerald-700"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Excel
        </button>

        <button
          type="button"
          onClick={
            exportarPDF
          }
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-700"
        >
          <FileText className="h-4 w-4" />
          PDF
        </button>

        <button
          type="button"
          onClick={onNovo}
          className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-bold text-white hover:bg-violet-800"
        >
          <Plus className="h-4 w-4" />
          Novo recebimento
        </button>
      </div>

      <Panel
        title={`Vouchers recebidos (${dados.vouchers.length})`}
        icon={Package}
      >
        <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {dados.vouchers.map(
            (voucher, index) => (
              <div
                key={index}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs font-semibold text-slate-600"
              >
                {voucher.voucher}
              </div>
            )
          )}
        </div>
      </Panel>
    </div>
  );
}

export default function RecebimentoV2Page() {
  const [etapa, setEtapa] =
    useState("lista");

  const [
    recebimento,
    setRecebimento,
  ] = useState(null);

  const [
    carregandoCarga,
    setCarregandoCarga,
  ] = useState(false);

  async function continuarCarga(
    recebimentoId
  ) {
    setCarregandoCarga(true);

    try {
      const res =
        await buscarRecebimento(
          recebimentoId
        );

      if (res.ok) {
        setRecebimento(
          res.recebimento
        );

        setEtapa(
          "bipagem"
        );
      }
    } catch (error) {
      console.error(error);
    } finally {
      setCarregandoCarga(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader etapa={etapa} />

      {carregandoCarga ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-100 border-t-violet-600" />
        </div>
      ) : (
        <>
          {etapa ===
            "lista" && (
            <TelaLista
              onNovo={() =>
                setEtapa(
                  "carga"
                )
              }
              onContinuar={
                continuarCarga
              }
            />
          )}

          {etapa ===
            "carga" && (
            <TelaCarga
              onIniciar={(
                rec
              ) => {
                setRecebimento(
                  rec
                );

                setEtapa(
                  "bipagem"
                );
              }}
              onVoltar={() =>
                setEtapa(
                  "lista"
                )
              }
            />
          )}

          {etapa ===
            "bipagem" &&
            recebimento && (
              <TelaBipagem
                recebimento={
                  recebimento
                }
                onVoltar={() =>
                  setEtapa(
                    "lista"
                  )
                }
                onConcluir={(
                  rec
                ) => {
                  setRecebimento(
                    rec
                  );

                  setEtapa(
                    "romaneio"
                  );
                }}
              />
            )}

          {etapa ===
            "romaneio" &&
            recebimento && (
              <TelaRomaneio
                recebimentoId={
                  recebimento.id
                }
                onNovo={() => {
                  setRecebimento(
                    null
                  );

                  setEtapa(
                    "lista"
                  );
                }}
              />
            )}
        </>
      )}
    </div>
  );
}