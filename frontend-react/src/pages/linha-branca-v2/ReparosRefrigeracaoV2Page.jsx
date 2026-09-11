import {
  Check,
  PackagePlus,
  RotateCcw,
  Save,
  Search,
  Wrench,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../../AuthContext.jsx";

import {
  fetchOsParaReparo,
  fetchTriagemDaOs,
  salvarExecucaoReparo,
} from "../../services/reparoLinhaBrancaService.js";

import {
  REPAROS_MECANICOS_REFRIG,
  REPAROS_ELETRICOS_REFRIG,
  REPAROS_ESTETICOS_REFRIG,
} from "../../services/linhaBrancaService.js";

const EMPTY_EXECUCAO = {
  diagnostico_final: "",
  observacoes: "",
  pecas: [],
  novaPeca: "",
  dt_inicio: "",
};

const EMPTY_REPAROS = {
  mecanico: [],
  eletrico: [],
  estetico: [],
};

function InfoField({ label, value }) {
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

function Checklist({
  titulo,
  itens,
  selecionados,
  onToggle,
  disabled,
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200 bg-white p-5 ${
        disabled ? "pointer-events-none opacity-40" : ""
      }`}
    >
      <div className="mb-4 text-sm font-black text-slate-800">
        {titulo}
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {itens.map((item) => {
          const ativo = selecionados.includes(item);

          return (
            <button
              key={item}
              type="button"
              onClick={() => onToggle(item)}
              className={`
                flex min-h-[52px] items-center gap-3 rounded-xl
                border px-4 py-3 text-left text-xs font-bold
                transition
                ${
                  ativo
                    ? "border-[#765D81] bg-[#F3EFF5] text-[#43284F]"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }
              `}
            >
              <div
                className={`
                  flex h-5 w-5 shrink-0 items-center justify-center
                  rounded-md border
                  ${
                    ativo
                      ? "border-[#765D81] bg-[#765D81] text-white"
                      : "border-slate-300"
                  }
                `}
              >
                {ativo && <Check className="h-3 w-3" />}
              </div>

              {item}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function ReparosRefrigeracaoV2Page() {
  const { profile } = useAuth();

  const [osList, setOsList] = useState([]);
  const [busca, setBusca] = useState("");
  const [selectedOsId, setSelectedOsId] = useState("");
  const [triagem, setTriagem] = useState(null);

  const [execucao, setExecucao] = useState({
    ...EMPTY_EXECUCAO,
    dt_inicio: new Date().toISOString(),
  });

  const [reparos, setReparos] = useState({
    ...EMPTY_REPAROS,
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
    const termo = busca.trim().toLowerCase();

    if (!termo) return osList;

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

  const totalServicos = useMemo(() => {
    return (
      reparos.mecanico.length +
      reparos.eletrico.length +
      reparos.estetico.length
    );
  }, [reparos]);

  const canSave = Boolean(
    selectedOs &&
      execucao.diagnostico_final.trim() &&
      totalServicos > 0
  );

  async function carregarOs() {
    try {
      setLoading(true);
      setMensagem("");

      const data = await fetchOsParaReparo(
        "Reparo Mecânico"
      );

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

  async function selecionarOs(os) {
    setSelectedOsId(os.id);
    setBusca("");
    setMensagem("");
    setTriagem(null);

    setExecucao({
      ...EMPTY_EXECUCAO,
      dt_inicio: new Date().toISOString(),
    });

    setReparos({
      ...EMPTY_REPAROS,
    });

    try {
      const data = await fetchTriagemDaOs(os.id);
      setTriagem(data);
    } catch (error) {
      setMensagem(
        `OS selecionada, mas não foi possível carregar a triagem: ${error.message}`
      );
    }
  }

  function toggleReparo(area, item) {
    setReparos((current) => {
      const lista = current[area] || [];
      const existe = lista.includes(item);

      return {
        ...current,
        [area]: existe
          ? lista.filter(
              (currentItem) =>
                currentItem !== item
            )
          : [...lista, item],
      };
    });
  }

  function adicionarPeca() {
    const novaPeca =
      execucao.novaPeca.trim();

    if (!novaPeca) return;

    setExecucao((current) => ({
      ...current,
      pecas: [
        ...current.pecas,
        novaPeca,
      ],
      novaPeca: "",
    }));
  }

  function removerPeca(index) {
    setExecucao((current) => ({
      ...current,
      pecas: current.pecas.filter(
        (_, itemIndex) =>
          itemIndex !== index
      ),
    }));
  }

  function limpar() {
    setSelectedOsId("");
    setBusca("");
    setTriagem(null);
    setMensagem("");

    setExecucao({
      ...EMPTY_EXECUCAO,
      dt_inicio: new Date().toISOString(),
    });

    setReparos({
      ...EMPTY_REPAROS,
    });
  }

  async function salvar() {
    if (!canSave) {
      setMensagem(
        "Informe o diagnóstico final e selecione ao menos um serviço executado."
      );
      return;
    }

    try {
      setSaving(true);
      setMensagem(
        "Registrando reparo..."
      );

      const servicos = [
        ...reparos.mecanico,
        ...reparos.eletrico,
        ...reparos.estetico,
      ];

      await salvarExecucaoReparo(
        selectedOs,
        {
          tecnico: profile?.nome,
          dt_inicio:
            execucao.dt_inicio,
          diagnostico_final:
            execucao.diagnostico_final,
          servico_executado:
            servicos.join(", "),
          peca_trocada:
            execucao.pecas.length > 0,
          descricao_peca:
            execucao.pecas.join(", "),
          observacoes:
            execucao.observacoes,
        },
        "Reparo Mecânico"
      );

      const numeroOs =
        selectedOs.numero_os;

      limpar();
      await carregarOs();

      setMensagem(
        `Reparo da OS ${numeroOs} concluído. Equipamento encaminhado para Bancada de Testes.`
      );
    } catch (error) {
      setMensagem(
        `Erro ao salvar reparo: ${error.message}`
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
          Reparos
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Registre o diagnóstico, os serviços executados e as peças utilizadas no equipamento.
        </p>
      </div>

      {/* IDENTIFICAR OS */}
      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">
            1. Identificar equipamento
          </h2>

          <span className="text-xs font-semibold text-slate-400">
            {loading
              ? "Carregando..."
              : `${osList.length} OS aguardando reparo`}
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
                    setBusca(event.target.value)
                  }
                  placeholder="Busque por OS, serial, modelo, fornecedor ou lote"
                  className="
                    h-12 w-full rounded-xl border border-slate-200
                    bg-slate-50 pl-11 pr-4 text-sm text-slate-800
                    outline-none transition
                    focus:border-[#765D81] focus:bg-white
                    focus:ring-2 focus:ring-[#765D81]/10
                  "
                />
              </div>
<div className="mt-3">
  <select
    value=""
    onChange={(event) => {
      const osSelecionada =
        osFiltradas.find(
          (os) =>
            String(os.id) ===
            String(event.target.value)
        );

      if (osSelecionada) {
        selecionarOs(osSelecionada);
      }
    }}
    disabled={
      loading ||
      osFiltradas.length === 0
    }
    className="
      h-12 w-full rounded-xl
      border border-slate-200
      bg-white px-4
      text-sm font-semibold
      text-slate-700
      outline-none transition
      focus:border-[#765D81]
      focus:ring-2
      focus:ring-[#765D81]/10
      disabled:cursor-not-allowed
      disabled:bg-slate-100
      disabled:text-slate-400
    "
  >
    <option value="">
      {loading
        ? "Carregando OS..."
        : osFiltradas.length === 0
        ? "Nenhuma OS disponível"
        : "Selecione uma OS"}
    </option>

    {osFiltradas.map((os) => (
      <option
        key={os.id}
        value={os.id}
      >
        {os.numero_os}
        {" — "}
        {os.marca || "Sem marca"}
        {" "}
        {os.modelo || ""}
        {os.serial_number
          ? ` — ${os.serial_number}`
          : ""}
      </option>
    ))}
  </select>
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
                            flex w-full items-center justify-between gap-4
                            border-b border-slate-100 px-4 py-3
                            text-left transition last:border-b-0
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
                    <Wrench className="h-5 w-5" />
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
                  value={selectedOs.serial_number}
                />

                <InfoField
                  label="Fornecedor"
                  value={selectedOs.fornecedor}
                />

                <InfoField
                  label="Lote"
                  value={selectedOs.lote}
                />

                <InfoField
                  label="Status"
                  value={selectedOs.status_atual}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* TRIAGEM */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          2. Diagnóstico da triagem
        </h2>

        <div
          className={`rounded-2xl border border-slate-200 bg-white p-5 ${
            !selectedOs
              ? "pointer-events-none opacity-40"
              : ""
          }`}
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <InfoField
              label="Triado por"
              value={triagem?.triado_por}
            />

            <InfoField
              label="Necessita reparo"
              value={
                triagem
                  ? triagem.precisa_reparo
                    ? "Sim"
                    : "Não"
                  : "—"
              }
            />

            <InfoField
              label="Data da triagem"
              value={
                triagem?.created_at
                  ? new Date(
                      triagem.created_at
                    ).toLocaleString(
                      "pt-BR"
                    )
                  : "—"
              }
            />

            <InfoField
              label="Observações"
              value={
                triagem?.observacoes_triagem
              }
            />
          </div>

          {triagem?.reparos_mecanicos?.length >
            0 && (
            <div className="mt-5 border-t border-slate-100 pt-5">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                Classificação indicada na triagem
              </div>

              <div className="flex flex-wrap gap-2">
                {triagem.reparos_mecanicos.map(
                  (item) => (
                    <span
                      key={item}
                      className="rounded-lg bg-[#F3EFF5] px-3 py-1.5 text-xs font-bold text-[#43284F]"
                    >
                      {item}
                    </span>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* DIAGNÓSTICO FINAL */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          3. Diagnóstico técnico
        </h2>

        <textarea
          value={execucao.diagnostico_final}
          onChange={(event) =>
            setExecucao((current) => ({
              ...current,
              diagnostico_final:
                event.target.value,
            }))
          }
          disabled={!selectedOs}
          rows={4}
          placeholder="Descreva o diagnóstico técnico encontrado no equipamento."
          className="
            w-full resize-none rounded-2xl border border-slate-200
            bg-white p-4 text-sm text-slate-700 outline-none
            transition placeholder:text-slate-400
            focus:border-[#765D81] focus:ring-2
            focus:ring-[#765D81]/10 disabled:bg-slate-100
          "
        />
      </section>

      {/* SERVIÇOS */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          4. Serviços executados
        </h2>

        <div className="space-y-4">
          <Checklist
            titulo="Mecânico"
            itens={REPAROS_MECANICOS_REFRIG}
            selecionados={reparos.mecanico}
            onToggle={(item) =>
              toggleReparo(
                "mecanico",
                item
              )
            }
            disabled={!selectedOs}
          />

          <Checklist
            titulo="Elétrico"
            itens={REPAROS_ELETRICOS_REFRIG}
            selecionados={reparos.eletrico}
            onToggle={(item) =>
              toggleReparo(
                "eletrico",
                item
              )
            }
            disabled={!selectedOs}
          />

          <Checklist
            titulo="Estético"
            itens={REPAROS_ESTETICOS_REFRIG}
            selecionados={reparos.estetico}
            onToggle={(item) =>
              toggleReparo(
                "estetico",
                item
              )
            }
            disabled={!selectedOs}
          />
        </div>
      </section>

      {/* PEÇAS */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          5. Peças utilizadas
        </h2>

        <div
          className={`rounded-2xl border border-slate-200 bg-white p-5 ${
            !selectedOs
              ? "pointer-events-none opacity-40"
              : ""
          }`}
        >
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <PackagePlus className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

              <input
                value={execucao.novaPeca}
                onChange={(event) =>
                  setExecucao(
                    (current) => ({
                      ...current,
                      novaPeca:
                        event.target.value,
                    })
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter"
                  ) {
                    event.preventDefault();
                    adicionarPeca();
                  }
                }}
                placeholder="Informe a peça utilizada"
                className="
                  h-11 w-full rounded-xl border border-slate-200
                  bg-slate-50 pl-11 pr-4 text-sm outline-none
                  focus:border-[#765D81] focus:bg-white
                  focus:ring-2 focus:ring-[#765D81]/10
                "
              />
            </div>

            <button
              type="button"
              onClick={adicionarPeca}
              className="
                h-11 rounded-xl border border-slate-200 bg-white
                px-5 text-sm font-bold text-slate-600
                transition hover:bg-slate-50
              "
            >
              Adicionar
            </button>
          </div>

          {execucao.pecas.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {execucao.pecas.map(
                (peca, index) => (
                  <div
                    key={`${peca}-${index}`}
                    className="flex items-center gap-2 rounded-lg bg-[#F3EFF5] px-3 py-2 text-xs font-bold text-[#43284F]"
                  >
                    {peca}

                    <button
                      type="button"
                      onClick={() =>
                        removerPeca(index)
                      }
                      className="text-[#765D81] hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </section>

      {/* OBSERVAÇÕES */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          6. Observações
        </h2>

        <textarea
          value={execucao.observacoes}
          onChange={(event) =>
            setExecucao((current) => ({
              ...current,
              observacoes:
                event.target.value,
            }))
          }
          disabled={!selectedOs}
          rows={4}
          placeholder="Registre observações adicionais sobre o reparo realizado."
          className="
            w-full resize-none rounded-2xl border border-slate-200
            bg-white p-4 text-sm text-slate-700 outline-none
            transition placeholder:text-slate-400
            focus:border-[#765D81] focus:ring-2
            focus:ring-[#765D81]/10 disabled:bg-slate-100
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
            inline-flex h-11 items-center gap-2 rounded-xl
            bg-[#43284F] px-5 text-sm font-bold text-white
            transition hover:bg-[#35203E]
            disabled:cursor-not-allowed disabled:opacity-40
          "
        >
          <Save className="h-4 w-4" />

          {saving
            ? "Salvando..."
            : "Concluir reparo"}
        </button>

        <button
          type="button"
          onClick={limpar}
          className="
            inline-flex h-11 items-center gap-2 rounded-xl
            border border-slate-200 bg-white px-5
            text-sm font-bold text-slate-500
            transition hover:bg-slate-50
          "
        >
          <RotateCcw className="h-4 w-4" />
          Limpar
        </button>
      </div>
    </div>
  );
}
