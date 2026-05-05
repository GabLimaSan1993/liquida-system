import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Save, RotateCcw } from "lucide-react";
import {
  fetchOsAguardandoTriagemLinhaBranca,
  salvarTriagemLinhaBranca,
  TIPOS_PRODUTO_LINHA_BRANCA,
  REPAROS_MECANICOS,
  REPAROS_ELETRICOS,
  REPAROS_ESTETICOS,
} from "../services/linhaBrancaService.js";

const EMPTY_TRIAGEM = {
  tipo_produto: "",
  precisa_reparo: false,
  reparos_mecanicos: [],
  reparos_eletricos: [],
  reparos_esteticos: [],
  observacoes_triagem: "",
  triado_por: "",
};

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

function Button({ children, primary = false, ...props }) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${
        primary
          ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
          : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]"
      }`}
    >
      {children}
    </button>
  );
}

function CheckboxGroup({ title, options, selected, onToggle, disabled }) {
  return (
    <div className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
      <h3 className="text-sm font-black uppercase tracking-wide text-[#6B1F87]">
        {title}
      </h3>

      <div className="mt-4 grid gap-2">
        {options.map((item) => {
          const checked = selected.includes(item);

          return (
            <label
              key={item}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                checked
                  ? "border-[#F59E0B] bg-white text-[#6B1F87]"
                  : "border-[#E9D5FF] bg-white text-slate-600 hover:bg-[#FCFAFF]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(item)}
                className="mt-1"
              />
              <span className="font-medium">{item}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

export default function LinhaBrancaTriagemPage() {
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [triagem, setTriagem] = useState({ ...EMPTY_TRIAGEM });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const selectedOs = useMemo(() => {
    return osList.find((item) => String(item.id) === String(selectedOsId)) || null;
  }, [osList, selectedOsId]);

  const canSave = useMemo(() => {
    if (!selectedOs) return false;
    if (!triagem.tipo_produto) return false;

    if (triagem.precisa_reparo) {
      const totalReparos =
        triagem.reparos_mecanicos.length +
        triagem.reparos_eletricos.length +
        triagem.reparos_esteticos.length;

      return totalReparos > 0;
    }

    return true;
  }, [selectedOs, triagem]);

  async function loadOs() {
    try {
      setLoading(true);
      setStatus("Carregando OS aguardando triagem...");
      const data = await fetchOsAguardandoTriagemLinhaBranca();
      setOsList(data);
      setStatus("");
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao carregar OS: ${error.message || "falha na consulta"}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOs();
  }, []);

  function update(field, value) {
    setTriagem((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function toggleArray(field, value) {
    setTriagem((current) => {
      const list = current[field] || [];
      const exists = list.includes(value);

      return {
        ...current,
        [field]: exists ? list.filter((item) => item !== value) : [...list, value],
      };
    });
  }

  function handlePrecisaReparo(value) {
    setTriagem((current) => ({
      ...current,
      precisa_reparo: value,
      reparos_mecanicos: value ? current.reparos_mecanicos : [],
      reparos_eletricos: value ? current.reparos_eletricos : [],
      reparos_esteticos: value ? current.reparos_esteticos : [],
    }));
  }

  function resetTriagem() {
    setSelectedOsId("");
    setTriagem({ ...EMPTY_TRIAGEM });
    setStatus("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!canSave) {
      setStatus(
        "Selecione uma OS, informe o tipo do produto e, se precisar reparo, selecione ao menos uma classificação."
      );
      return;
    }

    try {
      setSaving(true);
      setStatus("Salvando triagem e encaminhando OS...");

      await salvarTriagemLinhaBranca(selectedOs, triagem);

      setStatus(`Triagem da OS ${selectedOs.numero_os} salva com sucesso.`);

      setSelectedOsId("");
      setTriagem({ ...EMPTY_TRIAGEM });
      await loadOs();
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao salvar triagem: ${error.message || "falha no registro"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-[#6B1F87]">
              Gestão de Linha Branca — Triagem
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Classifique a OS, identifique se há necessidade de reparo e direcione para a fila correta.
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
            <ClipboardCheck className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="text-sm font-semibold text-slate-600">OS aguardando triagem</span>
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
              <span className="text-sm font-semibold text-slate-600">Tipo do produto</span>
              <select
                value={triagem.tipo_produto}
                onChange={(e) => update("tipo_produto", e.target.value)}
                disabled={!selectedOs}
                className={inputClass(!selectedOs)}
              >
                <option value="">Selecione</option>
                {TIPOS_PRODUTO_LINHA_BRANCA.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-600">Precisa de reparo?</span>
              <select
                value={triagem.precisa_reparo ? "Sim" : "Não"}
                onChange={(e) => handlePrecisaReparo(e.target.value === "Sim")}
                disabled={!selectedOs}
                className={inputClass(!selectedOs)}
              >
                <option>Não</option>
                <option>Sim</option>
              </select>
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-600">Triado por</span>
              <input
                value={triagem.triado_por}
                onChange={(e) => update("triado_por", e.target.value)}
                disabled={!selectedOs}
                className={inputClass(!selectedOs)}
                placeholder="Nome do técnico"
              />
            </label>
          </div>

          {selectedOs ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Fornecedor</div>
                <div className="mt-1 text-sm font-bold text-[#6B1F87]">
                  {selectedOs.fornecedor || "-"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Lote</div>
                <div className="mt-1 text-sm font-bold text-[#6B1F87]">
                  {selectedOs.lote || "-"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Serial</div>
                <div className="mt-1 text-sm font-bold text-[#6B1F87]">
                  {selectedOs.serial_number || "-"}
                </div>
              </div>

              <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Status atual</div>
                <div className="mt-1 text-sm font-bold text-[#6B1F87]">
                  {selectedOs.status_atual || "-"}
                </div>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <div className={!triagem.precisa_reparo ? "pointer-events-none opacity-40" : ""}>
          <div className="grid gap-6 xl:grid-cols-3">
            <CheckboxGroup
              title="Reparo Mecânico"
              options={REPAROS_MECANICOS}
              selected={triagem.reparos_mecanicos}
              disabled={!selectedOs || !triagem.precisa_reparo}
              onToggle={(item) => toggleArray("reparos_mecanicos", item)}
            />

            <CheckboxGroup
              title="Reparo Elétrico"
              options={REPAROS_ELETRICOS}
              selected={triagem.reparos_eletricos}
              disabled={!selectedOs || !triagem.precisa_reparo}
              onToggle={(item) => toggleArray("reparos_eletricos", item)}
            />

            <CheckboxGroup
              title="Reparo Estético"
              options={REPAROS_ESTETICOS}
              selected={triagem.reparos_esteticos}
              disabled={!selectedOs || !triagem.precisa_reparo}
              onToggle={(item) => toggleArray("reparos_esteticos", item)}
            />
          </div>
        </div>

        <SectionCard>
          <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Observações da triagem</h2>

          <textarea
            value={triagem.observacoes_triagem}
            onChange={(e) => update("observacoes_triagem", e.target.value)}
            disabled={!selectedOs}
            rows={4}
            className={inputClass(!selectedOs)}
            placeholder="Detalhe o diagnóstico inicial, evidências visuais, testes realizados e recomendações."
          />
        </SectionCard>

        {status ? (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <Button primary type="submit" disabled={saving || !canSave}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Salvar triagem"}
          </Button>

          <Button type="button" onClick={resetTriagem}>
            <RotateCcw className="h-4 w-4" />
            Limpar
          </Button>
        </div>
      </form>
    </div>
  );
}