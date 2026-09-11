import {
  Check,
  FlaskConical,
  RotateCcw,
  Save,
  Search,
  X,
} from "lucide-react";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import { useAuth } from "../../AuthContext.jsx";
import { supabase } from "../../lib/supabase.js";
import { fetchTriagemDaOs } from "../../services/reparoLinhaBrancaService.js";

const EMPTY = {
  aprovado: null,
  etapa_retorno: "",
  obs_bancada: "",
};

const ETAPAS_REPARO = [
  "Reparo Mecânico",
  "Reparo Elétrico",
  "Reparo Estético",
];

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

export default function BancadaTestesClimatizacaoV2Page() {
  const { profile } = useAuth();

  const [osList, setOsList] = useState([]);
  const [busca, setBusca] = useState("");
  const [selectedOsId, setSelectedOsId] = useState("");
  const [form, setForm] = useState({ ...EMPTY });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const selectedOs = useMemo(
    () =>
      osList.find(
        (item) =>
          String(item.id) === String(selectedOsId)
      ) || null,
    [osList, selectedOsId]
  );

  const osFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return osList;

    return osList.filter((os) =>
      [
        os.numero_os,
        os.serial_number,
        os.marca,
        os.modelo,
        os.fornecedor,
        os.lote,
      ].some((campo) =>
        String(campo || "")
          .toLowerCase()
          .includes(termo)
      )
    );
  }, [osList, busca]);

  const canSave = Boolean(
    selectedOs &&
      form.aprovado !== null &&
      (form.aprovado || form.etapa_retorno)
  );

  async function carregarOs() {
    try {
      setLoading(true);
      setMensagem("");

      const { data, error } = await supabase
        .from("ordens_servico")
        .select("*")
        .eq("area_destino", "Bancada de Testes")
        .order("dt_entrada", { ascending: true });

      if (error) throw error;

      const filtradas = await Promise.all(
        (data || []).map(async (os) => {
          try {
            const triagem = await fetchTriagemDaOs(os.id);

            if (triagem?.tipo_produto !== "Ar-condicionado") {
              return null;
            }

            return os;
          } catch {
            return null;
          }
        })
      );

      setOsList(filtradas.filter(Boolean));
    } catch (error) {
      setMensagem(`Erro ao carregar OS: ${error.message}`);
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
    setForm({ ...EMPTY });
    setMensagem("");
  }

  function definirResultado(aprovado) {
    setForm((current) => ({
      ...current,
      aprovado,
      etapa_retorno: aprovado ? "" : current.etapa_retorno,
    }));
  }

  function limpar() {
    setSelectedOsId("");
    setBusca("");
    setForm({ ...EMPTY });
    setMensagem("");
  }

  async function salvar() {
    if (!canSave) {
      setMensagem("Selecione a OS e defina o resultado do teste.");
      return;
    }

    try {
      setSaving(true);
      setMensagem("Registrando resultado da bancada...");

      const numeroOs = selectedOs.numero_os;

      if (form.aprovado) {
        const { error } = await supabase
          .from("ordens_servico")
          .update({
            status_atual: "Limpeza",
            etapa_atual: "Limpeza",
            area_destino: "Limpeza",
            aprovado_bancada: true,
            obs_bancada: form.obs_bancada,
            tecnico_bancada: profile?.nome,
          })
          .eq("id", selectedOs.id);

        if (error) throw error;
      } else {
        const novasConcluidas = (
          selectedOs.areas_concluidas || []
        ).filter(
          (area) =>
            area !== form.etapa_retorno
        );

        const { error } = await supabase
          .from("ordens_servico")
          .update({
            status_atual: "Triado",
            etapa_atual: form.etapa_retorno,
            area_destino: form.etapa_retorno,
            areas_concluidas: novasConcluidas,
            aprovado_bancada: false,
            obs_bancada: form.obs_bancada,
            tecnico_bancada: profile?.nome,
          })
          .eq("id", selectedOs.id);

        if (error) throw error;
      }

      const mensagemFinal = form.aprovado
        ? `OS ${numeroOs} aprovada. Encaminhada para Higienização.`
        : `OS ${numeroOs} reprovada. Retorna para ${form.etapa_retorno}.`;

      limpar();
      await carregarOs();
      setMensagem(mensagemFinal);
    } catch (error) {
      setMensagem(`Erro ao salvar resultado: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
          Climatização
        </div>

        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">
          Bancada de Testes
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Valide o funcionamento após o reparo e defina a liberação ou o retorno técnico.
        </p>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">
            1. Identificar equipamento
          </h2>

          <span className="text-xs font-semibold text-slate-400">
            {loading ? "Carregando..." : `${osList.length} OS aguardando teste`}
          </span>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!selectedOs ? (
            <>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />

                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Busque por OS, serial, modelo, fornecedor ou lote"
                  className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm text-slate-800 outline-none transition focus:border-[#765D81] focus:bg-white focus:ring-2 focus:ring-[#765D81]/10"
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
                    osFiltradas.slice(0, 20).map((os) => (
                      <button
                        key={os.id}
                        type="button"
                        onClick={() => selecionarOs(os)}
                        className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left transition last:border-b-0 hover:bg-slate-50"
                      >
                        <div>
                          <div className="text-sm font-black text-slate-800">
                            {os.numero_os}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {os.marca || "—"} {os.modelo || ""}
                          </div>
                        </div>

                        <div className="text-right text-[11px] text-slate-400">
                          {os.serial_number || "Sem serial"}
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
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#4C1D95]">
                    <FlaskConical className="h-5 w-5" />
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
                <InfoField label="Marca" value={selectedOs.marca} />
                <InfoField label="Modelo" value={selectedOs.modelo} />
                <InfoField label="Serial" value={selectedOs.serial_number} />
                <InfoField label="Fornecedor" value={selectedOs.fornecedor} />
                <InfoField label="Lote" value={selectedOs.lote} />
                <InfoField label="Status" value={selectedOs.status_atual} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          2. Resultado do teste
        </h2>

        <div className={`grid gap-3 sm:grid-cols-2 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
          <button
            type="button"
            onClick={() => definirResultado(true)}
            className={`flex items-center gap-4 rounded-2xl border bg-white p-5 text-left transition ${
              form.aprovado === true
                ? "border-emerald-500 ring-2 ring-emerald-100"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <Check className="h-5 w-5" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Aprovado
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Equipamento segue para Higienização.
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={() => definirResultado(false)}
            className={`flex items-center gap-4 rounded-2xl border bg-white p-5 text-left transition ${
              form.aprovado === false
                ? "border-rose-500 ring-2 ring-rose-100"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <X className="h-5 w-5" />
            </div>

            <div>
              <div className="text-sm font-black text-slate-800">
                Reprovado
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Equipamento retorna para a especialidade indicada.
              </div>
            </div>
          </button>
        </div>
      </section>

      {form.aprovado === false && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-black text-slate-800">
            3. Retorno técnico
          </h2>

          <select
            value={form.etapa_retorno}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                etapa_retorno: event.target.value,
              }))
            }
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 outline-none focus:border-[#765D81] focus:ring-2 focus:ring-[#765D81]/10"
          >
            <option value="">
              Selecione a etapa de retorno
            </option>

            {ETAPAS_REPARO.map((etapa) => (
              <option key={etapa} value={etapa}>
                {etapa}
              </option>
            ))}
          </select>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-black text-slate-800">
          {form.aprovado === false ? "4. Problema identificado" : "3. Observações"}
        </h2>

        <textarea
          value={form.obs_bancada}
          onChange={(event) =>
            setForm((current) => ({
              ...current,
              obs_bancada: event.target.value,
            }))
          }
          disabled={!selectedOs}
          rows={4}
          placeholder={
            form.aprovado === false
              ? "Descreva o problema identificado durante o teste."
              : "Registre observações finais da bancada."
          }
          className="w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-[#765D81] focus:ring-2 focus:ring-[#765D81]/10 disabled:bg-slate-100"
        />
      </section>

      {mensagem && (
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">
          {mensagem}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-slate-200 pt-6">
        <button
          type="button"
          disabled={!canSave || saving}
          onClick={salvar}
          className="inline-flex h-11 items-center gap-2 rounded-xl bg-[#4C1D95] px-5 text-sm font-bold text-white transition hover:bg-[#3F177D] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save className="h-4 w-4" />
          {saving ? "Salvando..." : "Confirmar resultado"}
        </button>

        <button
          type="button"
          onClick={limpar}
          className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-sm font-bold text-slate-500 transition hover:bg-slate-50"
        >
          <RotateCcw className="h-4 w-4" />
          Limpar
        </button>
      </div>
    </div>
  );
}
