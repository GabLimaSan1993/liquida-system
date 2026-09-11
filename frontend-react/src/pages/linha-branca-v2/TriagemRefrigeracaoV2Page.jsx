import {
  Check,
  ClipboardCheck,
  RotateCcw,
  Save,
  Search,
  Wrench,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../../AuthContext.jsx";

import {
  fetchOsAguardandoTriagemLinhaBranca,
  REPAROS_MECANICOS,
  salvarTriagemLinhaBranca,
} from "../../services/linhaBrancaService.js";

const EMPTY_TRIAGEM = {
  precisa_reparo: null,
  reparos_mecanicos: [],
  observacoes_triagem: "",
};

function InfoField({
  label,
  value,
}) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </div>

      <div className="mt-1 text-sm font-bold text-slate-800">
        {value || "—"}
      </div>
    </div>
  );
}

export default function TriagemRefrigeracaoV2Page() {
  const { profile } = useAuth();

  const [osList, setOsList] = useState([]);
  const [busca, setBusca] = useState("");
  const [selectedOsId, setSelectedOsId] = useState("");
  const [triagem, setTriagem] = useState({
    ...EMPTY_TRIAGEM,
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const selectedOs = useMemo(() => {
    return (
      osList.find(
        (item) =>
          String(item.id) ===
          String(selectedOsId)
      ) || null
    );
  }, [osList, selectedOsId]);

  const osFiltradas = useMemo(() => {
    const termo = busca
      .trim()
      .toLowerCase();

    if (!termo) {
      return osList;
    }

    return osList.filter((os) => {
      const campos = [
        os.numero_os,
        os.serial_number,
        os.marca,
        os.modelo,
        os.fornecedor,
        os.lote,
      ];

      return campos.some((campo) =>
        String(campo || "")
          .toLowerCase()
          .includes(termo)
      );
    });
  }, [osList, busca]);

  const canSave = useMemo(() => {
    if (!selectedOs) return false;

    if (triagem.precisa_reparo === null) {
      return false;
    }

    if (
      triagem.precisa_reparo &&
      triagem.reparos_mecanicos.length === 0
    ) {
      return false;
    }

    return true;
  }, [selectedOs, triagem]);

  async function carregarOs() {
    try {
      setLoading(true);
      setMensagem("");

      const data =
        await fetchOsAguardandoTriagemLinhaBranca();

      setOsList(data);
    } catch (error) {
      setMensagem(
        `Erro ao carregar OS: ${error.message}`
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarOs();
  }, []);

  function selecionarOs(os) {
    setSelectedOsId(os.id);
    setBusca("");
    setMensagem("");

    setTriagem({
      ...EMPTY_TRIAGEM,
    });
  }

  function toggleVerificacao(item) {
    setTriagem((current) => {
      const selecionados =
        current.reparos_mecanicos;

      const existe =
        selecionados.includes(item);

      return {
        ...current,
        reparos_mecanicos: existe
          ? selecionados.filter(
              (currentItem) =>
                currentItem !== item
            )
          : [
              ...selecionados,
              item,
            ],
      };
    });
  }

  function definirResultado(valor) {
    setTriagem((current) => ({
      ...current,
      precisa_reparo: valor,
      reparos_mecanicos: valor
        ? current.reparos_mecanicos
        : [],
    }));
  }

  function limpar() {
    setSelectedOsId("");
    setBusca("");

    setTriagem({
      ...EMPTY_TRIAGEM,
    });

    setMensagem("");
  }

  async function salvar() {
    if (!canSave) {
      setMensagem(
        "Conclua a avaliação antes de salvar a triagem."
      );

      return;
    }

    try {
      setSaving(true);

      setMensagem(
        "Registrando triagem..."
      );

      await salvarTriagemLinhaBranca(
        selectedOs,
        {
          tipo_produto:
            "Refrigeração",

          precisa_reparo:
            triagem.precisa_reparo,

          reparos_mecanicos:
            triagem.reparos_mecanicos,

          reparos_eletricos: [],

          reparos_esteticos: [],

          observacoes_triagem:
            triagem.observacoes_triagem,

          triado_por:
            profile?.nome,
        }
      );

      setMensagem(
        `OS ${selectedOs.numero_os} triada com sucesso.`
      );

      setSelectedOsId("");

      setTriagem({
        ...EMPTY_TRIAGEM,
      });

      await carregarOs();
    } catch (error) {
      setMensagem(
        `Erro ao salvar triagem: ${error.message}`
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      {/* CABEÇALHO */}
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
          Refrigeração
        </div>

        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">
          Triagem
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Identifique a OS, execute as
          verificações técnicas e defina o
          direcionamento do equipamento.
        </p>
      </div>

      {/* LOCALIZAR OS */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">
            1. Identificar equipamento
          </h2>

          <span className="text-xs font-semibold text-slate-400">
            {loading
              ? "Carregando..."
              : `${osList.length} OS aguardando`}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!selectedOs ? (
            <>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                <input
                  value={busca}
                  onChange={(event) =>
                    setBusca(
                      event.target.value
                    )
                  }
                  placeholder="Busque por OS, serial, modelo, fornecedor ou lote"
                  className="
                    h-12 w-full rounded-xl
                    border border-slate-200
                    bg-slate-50 pl-11 pr-4
                    text-sm text-slate-800
                    outline-none
                    transition
                    focus:border-[#765D81]
                    focus:bg-white
                    focus:ring-2
                    focus:ring-[#765D81]/10
                  "
                />
              </div>

              {busca && (
                <div className="mt-3 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200">
                  {osFiltradas.length === 0 ? (
                    <div className="p-5 text-center text-sm text-slate-400">
                      Nenhuma OS encontrada.
                    </div>
                  ) : (
                    osFiltradas
                      .slice(0, 20)
                      .map((os) => (
                        <button
                          key={os.id}
                          type="button"
                          onClick={() =>
                            selecionarOs(os)
                          }
                          className="
                            flex w-full items-center
                            justify-between gap-4
                            border-b border-slate-100
                            px-4 py-3 text-left
                            transition
                            last:border-b-0
                            hover:bg-slate-50
                          "
                        >
                          <div>
                            <div className="text-sm font-black text-slate-800">
                              {os.numero_os}
                            </div>

                            <div className="mt-0.5 text-xs text-slate-500">
                              {os.marca || "—"}{" "}
                              {os.modelo || ""}
                            </div>
                          </div>

                          <div className="text-right text-[11px] text-slate-400">
                            {os.serial_number ||
                              "Sem serial"}
                          </div>
                        </button>
                      ))
                  )}
                </div>
              )}
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F]">
                    <ClipboardCheck className="h-5 w-5" />
                  </div>

                  <div>
                    <div className="text-lg font-black text-slate-900">
                      {selectedOs.numero_os}
                    </div>

                    <div className="text-xs text-slate-500">
                      Equipamento selecionado
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={limpar}
                  className="text-xs font-bold text-slate-500 hover:text-slate-800"
                >
                  Trocar OS
                </button>
              </div>

              <div className="mt-6 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <InfoField
                  label="Marca"
                  value={selectedOs.marca}
                />

                <InfoField
                  label="Modelo"
                  value={selectedOs.modelo}
                />

                <InfoField
                  label="Serial"
                  value={
                    selectedOs.serial_number
                  }
                />

                <InfoField
                  label="Fornecedor"
                  value={
                    selectedOs.fornecedor
                  }
                />

                <InfoField
                  label="Lote"
                  value={selectedOs.lote}
                />

                <InfoField
                  label="Status"
                  value={
                    selectedOs.status_atual
                  }
                />
              </div>
            </div>
          )}
        </div>
      </section>
{/* RESULTADO */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          2. Resultado da triagem
        </h2>

        <div
          className={`grid gap-3 sm:grid-cols-2 ${
            !selectedOs
              ? "pointer-events-none opacity-40"
              : ""
          }`}
        >
          <button
            type="button"
            onClick={() =>
              definirResultado(false)
            }
            className={`
              flex items-center gap-4
              rounded-2xl border bg-white
              p-5 text-left transition
              ${
                triagem.precisa_reparo ===
                false
                  ? "border-emerald-500 ring-2 ring-emerald-100"
                  : "border-slate-200 hover:border-slate-300"
              }
            `}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Check className="h-5 w-5" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Sem necessidade de reparo
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Equipamento aprovado na
                triagem.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              definirResultado(true)
            }
            className={`
              flex items-center gap-4
              rounded-2xl border bg-white
              p-5 text-left transition
              ${
                triagem.precisa_reparo ===
                true
                  ? "border-[#765D81] ring-2 ring-[#765D81]/10"
                  : "border-slate-200 hover:border-slate-300"
              }
            `}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F]">
              <Wrench className="h-5 w-5" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Encaminhar para reparo
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Equipamento necessita
                intervenção técnica.
              </div>
            </div>
          </button>
        </div>
      </section>
      {/* VERIFICAÇÕES */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
  3. Classificação do reparo
</h2>

        className={`rounded-2xl border border-slate-200 bg-white p-5 ${
  !selectedOs || triagem.precisa_reparo !== true
    ? "pointer-events-none opacity-40"
    : ""
}`}
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {REPAROS_MECANICOS.map(
              (item) => {
                const selecionado =
                  triagem.reparos_mecanicos.includes(
                    item
                  );

                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() =>
                      toggleVerificacao(item)
                    }
                    className={`
                      flex min-h-[54px]
                      items-center gap-3
                      rounded-xl border
                      px-4 py-3 text-left
                      text-xs font-bold
                      transition
                      ${
                        selecionado
                          ? "border-[#765D81] bg-[#F3EFF5] text-[#43284F]"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      }
                    `}
                  >
                    <div
                      className={`
                        flex h-5 w-5
                        shrink-0 items-center
                        justify-center rounded-md
                        border
                        ${
                          selecionado
                            ? "border-[#765D81] bg-[#765D81] text-white"
                            : "border-slate-300"
                        }
                      `}
                    >
                      {selecionado && (
                        <Check className="h-3 w-3" />
                      )}
                    </div>

                    {item}
                  </button>
                );
              }
            )}
          </div>
        </div>
      </section>

      {/* RESULTADO */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          3. Resultado da triagem
        </h2>

        <div
          className={`grid gap-3 sm:grid-cols-2 ${
            !selectedOs
              ? "pointer-events-none opacity-40"
              : ""
          }`}
        >
          <button
            type="button"
            onClick={() =>
              definirResultado(false)
            }
            className={`
              flex items-center gap-4
              rounded-2xl border bg-white
              p-5 text-left transition
              ${
                triagem.precisa_reparo ===
                false
                  ? "border-emerald-500 ring-2 ring-emerald-100"
                  : "border-slate-200 hover:border-slate-300"
              }
            `}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Check className="h-5 w-5" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Sem necessidade de reparo
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Equipamento aprovado na
                triagem.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() =>
              definirResultado(true)
            }
            className={`
              flex items-center gap-4
              rounded-2xl border bg-white
              p-5 text-left transition
              ${
                triagem.precisa_reparo ===
                true
                  ? "border-[#765D81] ring-2 ring-[#765D81]/10"
                  : "border-slate-200 hover:border-slate-300"
              }
            `}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F]">
              <Wrench className="h-5 w-5" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Encaminhar para reparo
              </div>

              <div className="mt-1 text-xs text-slate-500">
                Equipamento necessita
                intervenção técnica.
              </div>
            </div>
          </button>
        </div>
      </section>

      {/* OBSERVAÇÕES */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          4. Observações
        </h2>

        <textarea
          value={
            triagem.observacoes_triagem
          }
          onChange={(event) =>
            setTriagem((current) => ({
              ...current,
              observacoes_triagem:
                event.target.value,
            }))
          }
          disabled={!selectedOs}
          rows={4}
          placeholder="Registre observações, evidências e informações adicionais da triagem."
          className="
            w-full resize-none rounded-2xl
            border border-slate-200
            bg-white p-4
            text-sm text-slate-700
            outline-none
            transition
            placeholder:text-slate-400
            focus:border-[#765D81]
            focus:ring-2
            focus:ring-[#765D81]/10
            disabled:bg-slate-100
          "
        />
      </section>

      {mensagem && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
          {mensagem}
        </div>
      )}

      {/* AÇÕES */}
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={salvar}
          className="
            inline-flex h-11 items-center
            gap-2 rounded-xl bg-[#43284F]
            px-5 text-sm font-bold
            text-white transition
            hover:bg-[#35203E]
            disabled:cursor-not-allowed
            disabled:opacity-40
          "
        >
          <Save className="h-4 w-4" />

          {saving
            ? "Salvando..."
            : "Concluir triagem"}
        </button>

        <button
          type="button"
          onClick={limpar}
          className="
            inline-flex h-11 items-center
            gap-2 rounded-xl
            border border-slate-200
            bg-white px-5
            text-sm font-bold
            text-slate-500
            transition
            hover:bg-slate-50
          "
        >
          <RotateCcw className="h-4 w-4" />

          Limpar
        </button>
      </div>
    </div>
  );
}