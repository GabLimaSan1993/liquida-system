import { useEffect, useMemo, useState } from "react";
import { FlaskConical, Save, RotateCcw, AlertTriangle } from "lucide-react";
import { supabase } from "../lib/supabase";

const EMPTY = {
  tecnico: "",
  aprovado: null,
  obs_bancada: "",
  etapa_retorno: "",
};

const ETAPAS_REPARO = ["Reparo Mecânico", "Reparo Elétrico", "Reparo Estético"];

function SectionCard({ children }) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      {children}
    </div>
  );
}

function inputClass(disabled = false) {
  return `w-full rounded-2xl border border-[#E9D5FF] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#F59E0B]/40 ${
    disabled ? "bg-slate-100 text-slate-500 cursor-not-allowed" : "bg-white"
  }`;
}

function Button({ children, primary = false, danger = false, ...props }) {
  const base = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";
  const style = danger
    ? "bg-red-500 text-white hover:bg-red-600"
    : primary
    ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
    : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]";
  return <button {...props} className={`${base} ${style}`}>{children}</button>;
}

export default function BancadaTestesPage() {
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const selectedOs = useMemo(
    () => osList.find((o) => String(o.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  async function loadOs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("ordens_servico")
        .select("*")
        .eq("area_destino", "Bancada de Testes")
        .order("dt_entrada", { ascending: true });
      if (error) throw error;
      setOsList(data || []);
    } catch (err) {
      setStatus(`Erro ao carregar OS: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOs(); }, []);

  function update(field, value) {
    setForm((cur) => ({ ...cur, [field]: value }));
  }

  function reset() {
    setSelectedOsId("");
    setForm({ ...EMPTY });
    setStatus("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedOs || form.aprovado === null || !form.tecnico) {
      setStatus("Preencha técnico e o resultado do teste.");
      return;
    }
    if (!form.aprovado && !form.etapa_retorno) {
      setStatus("Informe para qual etapa o produto deve retornar.");
      return;
    }

    try {
      setSaving(true);
      setStatus("Salvando...");

      const novoStatus = form.aprovado ? "Limpeza" : "Triado";
      const novaEtapa = form.aprovado ? "Limpeza" : form.etapa_retorno;
      const novaArea = form.aprovado ? "Limpeza" : form.etapa_retorno;

      const { error } = await supabase
        .from("ordens_servico")
        .update({
          status_atual: novoStatus,
          etapa_atual: novaEtapa,
          area_destino: novaArea,
          aprovado_bancada: form.aprovado,
          obs_bancada: form.obs_bancada,
          tecnico_bancada: form.tecnico,
        })
        .eq("id", selectedOs.id);

      if (error) throw error;

      setStatus(
        form.aprovado
          ? `OS ${selectedOs.numero_os} aprovada! Segue para Limpeza.`
          : `OS ${selectedOs.numero_os} reprovada. Retorna para ${form.etapa_retorno}.`
      );
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#6B1F87]">Bancada de Testes</h2>
            <p className="mt-1 text-sm text-slate-500">
              Aprove o produto ou retorne para a etapa de reparo correspondente.
            </p>
          </div>
          <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
            <div className="text-xs font-semibold text-slate-500">OS pendentes</div>
            <div className="text-xl font-black text-[#6B1F87]">
              {loading ? "..." : osList.length}
            </div>
          </div>
        </div>
      </SectionCard>

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard>
          <div className="mb-5 flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-sm font-semibold text-slate-600">OS para teste</span>
              <select
                value={selectedOsId}
                onChange={(e) => setSelectedOsId(e.target.value)}
                className={inputClass()}
              >
                <option value="">Selecione uma OS</option>
                {osList.map((os) => (
                  <option key={os.id} value={os.id}>
                    {os.numero_os} — {os.marca || "Sem marca"} {os.modelo || ""}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-600">Técnico responsável</span>
              <input
                value={form.tecnico}
                onChange={(e) => update("tecnico", e.target.value)}
                disabled={!selectedOs}
                className={inputClass(!selectedOs)}
                placeholder="Nome do técnico"
              />
            </label>
          </div>

          {selectedOs && (
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              {[
                ["Fornecedor", selectedOs.fornecedor],
                ["Lote", selectedOs.lote],
                ["Marca", selectedOs.marca],
                ["Modelo", selectedOs.modelo],
              ].map(([label, val]) => (
                <div key={label} className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                  <div className="text-xs font-semibold text-slate-500">{label}</div>
                  <div className="mt-1 text-sm font-bold text-[#6B1F87]">{val || "-"}</div>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {selectedOs && (
          <SectionCard>
            <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Resultado do teste</h2>

            <div className="flex gap-4 mb-6">
              <button
                type="button"
                onClick={() => update("aprovado", true)}
                className={`flex-1 rounded-2xl border-2 py-4 font-bold transition ${
                  form.aprovado === true
                    ? "border-green-500 bg-green-50 text-green-700"
                    : "border-[#E9D5FF] text-slate-400 hover:border-green-300"
                }`}
              >
                ✓ Aprovado
              </button>
              <button
                type="button"
                onClick={() => update("aprovado", false)}
                className={`flex-1 rounded-2xl border-2 py-4 font-bold transition ${
                  form.aprovado === false
                    ? "border-red-500 bg-red-50 text-red-700"
                    : "border-[#E9D5FF] text-slate-400 hover:border-red-300"
                }`}
              >
                ✗ Reprovado
              </button>
            </div>

            {form.aprovado === false && (
              <label className="mb-4 block">
                <span className="text-sm font-semibold text-slate-600">Retornar para</span>
                <select
                  value={form.etapa_retorno}
                  onChange={(e) => update("etapa_retorno", e.target.value)}
                  className={inputClass()}
                >
                  <option value="">Selecione a etapa</option>
                  {ETAPAS_REPARO.map((e) => (
                    <option key={e} value={e}>{e}</option>
                  ))}
                </select>
              </label>
            )}

            <label>
              <span className="text-sm font-semibold text-slate-600">
                {form.aprovado === false ? "Descrição do problema *" : "Observações"}
              </span>
              <textarea
                value={form.obs_bancada}
                onChange={(e) => update("obs_bancada", e.target.value)}
                rows={3}
                className={inputClass()}
                placeholder={
                  form.aprovado === false
                    ? "Descreva o problema encontrado no teste."
                    : "Observações finais do teste."
                }
              />
            </label>
          </SectionCard>
        )}

        {status && (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button primary type="submit" disabled={saving || !selectedOs || form.aprovado === null}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Confirmar resultado"}
          </Button>
          <Button type="button" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            Limpar
          </Button>
        </div>
      </form>
    </div>
  );
}