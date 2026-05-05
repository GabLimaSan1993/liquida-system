import { useEffect, useMemo, useState } from "react";
import { Wrench, Save, RotateCcw, Plus } from "lucide-react";
import {
  fetchOsParaReparo,
  fetchTriagemDaOs,
  salvarExecucaoReparo,
} from "../services/reparoLinhaBrancaService.js";

const REPAROS_POR_AREA = {
  "Reparo Mecânico": "reparos_mecanicos",
  "Reparo Elétrico": "reparos_eletricos",
  "Reparo Estético": "reparos_esteticos",
};

const EMPTY_EXECUCAO = {
  tecnico: "",
  diagnostico_final: "",
  servico_executado: "",
  peca_trocada: false,
  descricao_peca: "",
  observacoes: "",
  reparos_adicionais: [],
  novoReparo: "",
  dt_inicio: new Date().toISOString(),
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

export default function ReparoLinhaBrancaPage({ areaExecucao }) {
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [triagem, setTriagem] = useState(null);
  const [execucao, setExecucao] = useState({ ...EMPTY_EXECUCAO });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const selectedOs = useMemo(
    () => osList.find((o) => String(o.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  const reparosTriados = useMemo(() => {
    if (!triagem) return [];
    const campo = REPAROS_POR_AREA[areaExecucao];
    return triagem[campo] || [];
  }, [triagem, areaExecucao]);

  async function loadOs() {
    try {
      setLoading(true);
      const data = await fetchOsParaReparo(areaExecucao);
      setOsList(data);
    } catch (err) {
      setStatus(`Erro ao carregar OS: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOs(); }, [areaExecucao]);

  async function handleSelectOs(osId) {
    setSelectedOsId(osId);
    setTriagem(null);
    if (!osId) return;
    try {
      const t = await fetchTriagemDaOs(osId);
      setTriagem(t);
    } catch (err) {
      setStatus(`Erro ao buscar triagem: ${err.message}`);
    }
  }

  function update(field, value) {
    setExecucao((cur) => ({ ...cur, [field]: value }));
  }

  function adicionarReparoExtra() {
    const novo = execucao.novoReparo.trim();
    if (!novo) return;
    setExecucao((cur) => ({
      ...cur,
      reparos_adicionais: [...cur.reparos_adicionais, novo],
      novoReparo: "",
    }));
  }

  function removerReparoExtra(item) {
    setExecucao((cur) => ({
      ...cur,
      reparos_adicionais: cur.reparos_adicionais.filter((r) => r !== item),
    }));
  }

  function reset() {
    setSelectedOsId("");
    setTriagem(null);
    setExecucao({ ...EMPTY_EXECUCAO });
    setStatus("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedOs || !execucao.tecnico || !execucao.diagnostico_final) {
      setStatus("Preencha a OS, técnico e diagnóstico final.");
      return;
    }
    try {
      setSaving(true);
      setStatus("Salvando...");
      const servicoCompleto = [
        ...reparosTriados,
        ...execucao.reparos_adicionais,
      ].join(", ");
      await salvarExecucaoReparo(
        selectedOs,
        { ...execucao, servico_executado: servicoCompleto },
        areaExecucao
      );
      setStatus(`Reparo da OS ${selectedOs.numero_os} salvo com sucesso!`);
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <SectionCard>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-black text-[#6B1F87]">{areaExecucao}</h2>
            <p className="mt-1 text-sm text-slate-500">
              Execute os reparos triados e registre o diagnóstico final.
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
            <Wrench className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <label>
              <span className="text-sm font-semibold text-slate-600">OS para reparo</span>
              <select
                value={selectedOsId}
                onChange={(e) => handleSelectOs(e.target.value)}
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
                value={execucao.tecnico}
                onChange={(e) => update("tecnico", e.target.value)}
                disabled={!selectedOs}
                className={inputClass(!selectedOs)}
                placeholder="Nome do técnico"
              />
            </label>

            <label>
              <span className="text-sm font-semibold text-slate-600">Peça trocada?</span>
              <select
                value={execucao.peca_trocada ? "Sim" : "Não"}
                onChange={(e) => update("peca_trocada", e.target.value === "Sim")}
                disabled={!selectedOs}
                className={inputClass(!selectedOs)}
              >
                <option>Não</option>
                <option>Sim</option>
              </select>
            </label>

            {execucao.peca_trocada && (
              <label>
                <span className="text-sm font-semibold text-slate-600">Descrição da peça</span>
                <input
                  value={execucao.descricao_peca}
                  onChange={(e) => update("descricao_peca", e.target.value)}
                  disabled={!selectedOs}
                  className={inputClass(!selectedOs)}
                  placeholder="Ex: Compressor 220v"
                />
              </label>
            )}
          </div>

          {selectedOs && (
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              {[
                ["Fornecedor", selectedOs.fornecedor],
                ["Lote", selectedOs.lote],
                ["Serial", selectedOs.serial_number],
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
            <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Reparos da triagem</h2>
            <div className="flex flex-wrap gap-2">
              {reparosTriados.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhum reparo triado para esta área.</p>
              ) : (
                reparosTriados.map((r) => (
                  <span key={r} className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-[#6B1F87]">
                    {r}
                  </span>
                ))
              )}
            </div>

            <div className="mt-6">
              <h3 className="mb-3 text-sm font-bold text-slate-600">Reparos adicionais encontrados</h3>
              <div className="flex gap-2">
                <input
                  value={execucao.novoReparo}
                  onChange={(e) => update("novoReparo", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarReparoExtra())}
                  className={inputClass()}
                  placeholder="Descreva o reparo adicional e pressione Enter"
                />
                <Button type="button" onClick={adicionarReparoExtra}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {execucao.reparos_adicionais.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {execucao.reparos_adicionais.map((r) => (
                    <span
                      key={r}
                      onClick={() => removerReparoExtra(r)}
                      className="cursor-pointer rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-200"
                    >
                      {r} ✕
                    </span>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        )}

        <SectionCard>
          <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Diagnóstico e observações</h2>
          <div className="space-y-4">
            <label>
              <span className="text-sm font-semibold text-slate-600">Diagnóstico final *</span>
              <textarea
                value={execucao.diagnostico_final}
                onChange={(e) => update("diagnostico_final", e.target.value)}
                disabled={!selectedOs}
                rows={3}
                className={inputClass(!selectedOs)}
                placeholder="Descreva o diagnóstico final do reparo."
              />
            </label>
            <label>
              <span className="text-sm font-semibold text-slate-600">Observações</span>
              <textarea
                value={execucao.observacoes}
                onChange={(e) => update("observacoes", e.target.value)}
                disabled={!selectedOs}
                rows={2}
                className={inputClass(!selectedOs)}
                placeholder="Observações adicionais."
              />
            </label>
          </div>
        </SectionCard>

        {status && (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button primary type="submit" disabled={saving || !selectedOs}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Concluir reparo"}
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