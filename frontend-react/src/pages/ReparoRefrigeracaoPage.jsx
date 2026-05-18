import { useEffect, useMemo, useState } from "react";
import { Wrench, Save, RotateCcw, Plus, AlertTriangle, X } from "lucide-react";
import {
  fetchOsParaReparo,
  fetchTriagemDaOs,
  salvarExecucaoReparo,
  condenarOs,
} from "../services/reparoLinhaBrancaService.js";
import {
  REPAROS_MECANICOS,
  REPAROS_ELETRICOS,
  REPAROS_ESTETICOS,
} from "../services/linhaBrancaService.js";
import { useAuth } from "../AuthContext.jsx";

const TODAS_AREAS = [
  { label: "Mecânico", campo: "reparos_mecanicos", lista: REPAROS_MECANICOS },
  { label: "Elétrico", campo: "reparos_eletricos", lista: REPAROS_ELETRICOS },
  { label: "Estético", campo: "reparos_esteticos", lista: REPAROS_ESTETICOS },
];

const EMPTY_EXECUCAO = {
  diagnostico_final: "",
  pecas: [],
  novaPeca: "",
  observacoes: "",
  reparos_adicionais: [],
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

function Button({ children, primary = false, danger = false, ...props }) {
  const base = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";
  const style = danger
    ? "bg-red-500 text-white hover:bg-red-600"
    : primary
    ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
    : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]";
  return <button {...props} className={`${base} ${style}`}>{children}</button>;
}

function ModalCondenar({ onConfirm, onCancel, saving, tecnico }) {
  const [motivo, setMotivo] = useState("");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-[28px] bg-white p-8 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <h2 className="text-lg font-black text-red-600">Condenar material</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          O produto será encaminhado para o <strong>Scrap</strong>. Essa ação não pode ser desfeita.
        </p>
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
            <div className="text-xs font-semibold text-slate-500">Técnico responsável</div>
            <div className="mt-1 text-sm font-bold text-[#6B1F87]">{tecnico}</div>
          </div>
          <label>
            <span className="text-sm font-semibold text-slate-600">Motivo da condenação *</span>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className={inputClass()}
              placeholder="Descreva o motivo pelo qual o produto está sendo condenado."
            />
          </label>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            onClick={() => onConfirm(motivo, tecnico)}
            disabled={!motivo || saving}
            className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition"
          >
            {saving ? "Condenando..." : "Confirmar condenação"}
          </button>
          <button
            onClick={onCancel}
            className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ReparosRefrigeracaoPage() {
  const { profile } = useAuth();
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [triagem, setTriagem] = useState(null);
  const [execucao, setExecucao] = useState({ ...EMPTY_EXECUCAO });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [condenando, setCondenando] = useState(false);
  const [showModalCondenar, setShowModalCondenar] = useState(false);
  const [status, setStatus] = useState("");
  const [areaAdicional, setAreaAdicional] = useState("");
  const [reparoAdicionalSelecionado, setReparoAdicionalSelecionado] = useState("");

  const selectedOs = useMemo(
    () => osList.find((o) => String(o.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  // Todos os reparos triados de todas as áreas
  const reparosTriados = useMemo(() => {
    if (!triagem) return [];
    return TODAS_AREAS.flatMap(({ campo, label }) =>
      (triagem[campo] || []).map((r) => ({ reparo: r, area: label }))
    );
  }, [triagem]);

  // Lista completa de reparos disponíveis para adicionar
  const listaAdicional = useMemo(() => {
    const area = TODAS_AREAS.find((a) => a.label === areaAdicional);
    if (!area) return [];
    const jaTriados = reparosTriados.map((r) => r.reparo);
    const jaAdicionados = execucao.reparos_adicionais.map((r) => r.reparo);
    return area.lista.filter((r) => !jaTriados.includes(r) && !jaAdicionados.includes(r));
  }, [areaAdicional, reparosTriados, execucao.reparos_adicionais]);

  async function loadOs() {
    try {
      setLoading(true);
      // Busca OS de todas as áreas de reparo
      const [mec, ele, est] = await Promise.all([
        fetchOsParaReparo("Reparo Mecânico"),
        fetchOsParaReparo("Reparo Elétrico"),
        fetchOsParaReparo("Reparo Estético"),
      ]);
      // Une e deduplica por id
      const map = new Map();
      [...mec, ...ele, ...est].forEach((os) => map.set(os.id, os));
      setOsList([...map.values()]);
    } catch (err) {
      setStatus(`Erro ao carregar OS: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOs(); }, []);

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

  function adicionarPeca() {
    const nova = execucao.novaPeca.trim();
    if (!nova) return;
    setExecucao((cur) => ({ ...cur, pecas: [...cur.pecas, nova], novaPeca: "" }));
  }

  function removerPeca(index) {
    setExecucao((cur) => ({ ...cur, pecas: cur.pecas.filter((_, i) => i !== index) }));
  }

  function adicionarReparoAdicional() {
    if (!reparoAdicionalSelecionado || !areaAdicional) return;
    setExecucao((cur) => ({
      ...cur,
      reparos_adicionais: [...cur.reparos_adicionais, { reparo: reparoAdicionalSelecionado, area: areaAdicional }],
    }));
    setReparoAdicionalSelecionado("");
  }

  function removerReparoAdicional(reparo) {
    setExecucao((cur) => ({
      ...cur,
      reparos_adicionais: cur.reparos_adicionais.filter((r) => r.reparo !== reparo),
    }));
  }

  function reset() {
    setSelectedOsId("");
    setTriagem(null);
    setExecucao({ ...EMPTY_EXECUCAO });
    setAreaAdicional("");
    setReparoAdicionalSelecionado("");
    setStatus("");
  }

  async function handleCondenar(motivo, tecnico) {
    try {
      setCondenando(true);
      await condenarOs(selectedOs, motivo, tecnico);
      setShowModalCondenar(false);
      setStatus(`OS ${selectedOs.numero_os} condenada e encaminhada para Scrap.`);
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro ao condenar: ${err.message}`);
    } finally {
      setCondenando(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedOs || !execucao.diagnostico_final) {
      setStatus("Preencha a OS e o diagnóstico final.");
      return;
    }
    try {
      setSaving(true);
      setStatus("Salvando...");
      const servicoCompleto = [
        ...reparosTriados.map((r) => r.reparo),
        ...execucao.reparos_adicionais.map((r) => r.reparo),
      ].join(", ");

      // Salva como Reparo Mecânico (área principal) mas com todos os reparos
      await salvarExecucaoReparo(
        selectedOs,
        {
          ...execucao,
          tecnico: profile?.nome,
          servico_executado: servicoCompleto,
          peca_trocada: execucao.pecas.length > 0,
          descricao_peca: execucao.pecas.join(", "),
        },
        "Reparo Mecânico"
      );
      setStatus(`Reparos da OS ${selectedOs.numero_os} salvos com sucesso!`);
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro ao salvar: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {showModalCondenar && (
        <ModalCondenar
          onConfirm={handleCondenar}
          onCancel={() => setShowModalCondenar(false)}
          saving={condenando}
          tecnico={profile?.nome}
        />
      )}

      <div className="space-y-6">
        <SectionCard>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#6B1F87]">Reparos — Refrigeração</h2>
              <p className="mt-1 text-sm text-slate-500">
                Reparo unificado — Mecânico, Elétrico e Estético.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Técnico</div>
                <div className="text-sm font-bold text-[#6B1F87]">{profile?.nome}</div>
              </div>
              <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">OS pendentes</div>
                <div className="text-xl font-black text-[#6B1F87]">{loading ? "..." : osList.length}</div>
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
            <label>
              <span className="text-sm font-semibold text-slate-600">OS para reparo</span>
              <select value={selectedOsId} onChange={(e) => handleSelectOs(e.target.value)} className={inputClass()}>
                <option value="">Selecione uma OS</option>
                {osList.map((os) => (
                  <option key={os.id} value={os.id}>
                    {os.numero_os} — {os.marca || "Sem marca"} {os.modelo || ""}
                  </option>
                ))}
              </select>
            </label>
            {selectedOs && (
              <div className="mt-5 grid gap-4 grid-cols-2 md:grid-cols-4">
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
              {TODAS_AREAS.map(({ label }) => {
                const reparosDaArea = reparosTriados.filter((r) => r.area === label);
                if (reparosDaArea.length === 0) return null;
                return (
                  <div key={label} className="mb-4">
                    <div className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-2">{label}</div>
                    <div className="flex flex-wrap gap-2">
                      {reparosDaArea.map((r) => (
                        <span key={r.reparo} className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-[#6B1F87]">
                          {r.reparo}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="mt-6">
                <h3 className="mb-3 text-sm font-bold text-slate-600">Reparos adicionais encontrados</h3>
                <div className="flex gap-2">
                  <select value={areaAdicional} onChange={(e) => { setAreaAdicional(e.target.value); setReparoAdicionalSelecionado(""); }} className={inputClass()}>
                    <option value="">Área do reparo</option>
                    {TODAS_AREAS.map((a) => <option key={a.label} value={a.label}>{a.label}</option>)}
                  </select>
                  <select value={reparoAdicionalSelecionado} onChange={(e) => setReparoAdicionalSelecionado(e.target.value)} className={inputClass()} disabled={!areaAdicional}>
                    <option value="">Selecione o reparo</option>
                    {listaAdicional.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  <button type="button" onClick={adicionarReparoAdicional} className="rounded-2xl bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF] px-4">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {execucao.reparos_adicionais.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {execucao.reparos_adicionais.map((r) => (
                      <span key={r.reparo} onClick={() => removerReparoAdicional(r.reparo)} className="cursor-pointer rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-200">
                        {r.area} — {r.reparo} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {selectedOs && (
            <SectionCard>
              <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Peças trocadas</h2>
              <div className="flex gap-2">
                <input
                  value={execucao.novaPeca}
                  onChange={(e) => update("novaPeca", e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarPeca())}
                  className={inputClass()}
                  placeholder="Descreva a peça e pressione Enter ou +"
                />
                <button type="button" onClick={adicionarPeca} className="rounded-2xl bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF] px-4">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {execucao.pecas.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {execucao.pecas.map((p, i) => (
                    <span key={i} onClick={() => removerPeca(i)} className="cursor-pointer rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-[#6B1F87] hover:bg-purple-200">
                      {p} ✕
                    </span>
                  ))}
                </div>
              )}
            </SectionCard>
          )}

          <SectionCard>
            <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Diagnóstico e observações</h2>
            <div className="space-y-4">
              <label>
                <span className="text-sm font-semibold text-slate-600">Diagnóstico final *</span>
                <textarea value={execucao.diagnostico_final} onChange={(e) => update("diagnostico_final", e.target.value)} disabled={!selectedOs} rows={3} className={inputClass(!selectedOs)} placeholder="Descreva o diagnóstico final do reparo." />
              </label>
              <label>
                <span className="text-sm font-semibold text-slate-600">Observações</span>
                <textarea value={execucao.observacoes} onChange={(e) => update("observacoes", e.target.value)} disabled={!selectedOs} rows={2} className={inputClass(!selectedOs)} placeholder="Observações adicionais." />
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
              {saving ? "Salvando..." : "Concluir reparos"}
            </Button>
            <Button type="button" danger disabled={!selectedOs} onClick={() => setShowModalCondenar(true)}>
              <AlertTriangle className="h-4 w-4" />
              Condenar material
            </Button>
            <Button type="button" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Limpar
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}