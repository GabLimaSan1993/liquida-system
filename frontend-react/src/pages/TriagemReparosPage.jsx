import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Wrench, Save, RotateCcw, Plus, AlertTriangle, X } from "lucide-react";
import {
  fetchOsAguardandoTriagemLinhaBranca,
  salvarTriagemLinhaBranca,
  TIPOS_PRODUTO_LINHA_BRANCA,
  REPAROS_LAVADORAS,
  REPAROS_CLIMATIZACAO,
  REPAROS_MECANICOS_LAVADORAS,
  REPAROS_ELETRICOS_LAVADORAS,
  REPAROS_ESTETICOS_LAVADORAS,
  REPAROS_MECANICOS_CLIMATIZACAO,
  REPAROS_ELETRICOS_CLIMATIZACAO,
  REPAROS_ESTETICOS_CLIMATIZACAO,
} from "../services/linhaBrancaService.js";
import {
  fetchOsParaReparo,
  salvarExecucaoReparo,
  condenarOs,
} from "../services/reparoLinhaBrancaService.js";
import { useAuth } from "../AuthContext.jsx";

const EMPTY_TRIAGEM = {
  tipo_produto: "",
  precisa_reparo: false,
  reparos_mecanicos: [],
  reparos_eletricos: [],
  reparos_esteticos: [],
  observacoes_triagem: "",
};

const EMPTY_EXECUCAO = {
  diagnostico_final: "",
  pecas: [],
  novaPeca: "",
  observacoes: "",
  dt_inicio: new Date().toISOString(),
};

const ETAPA = { TRIAGEM: "triagem", REPARO: "reparo" };

function getReparosListas(tipoProduto) {
  if (tipoProduto === "Lavadoras") return {
    mecanico: REPAROS_MECANICOS_LAVADORAS,
    eletrico: REPAROS_ELETRICOS_LAVADORAS,
    estetico: REPAROS_ESTETICOS_LAVADORAS,
  };
  if (tipoProduto === "Ar-condicionado") return {
    mecanico: REPAROS_MECANICOS_CLIMATIZACAO,
    eletrico: REPAROS_ELETRICOS_CLIMATIZACAO,
    estetico: REPAROS_ESTETICOS_CLIMATIZACAO,
  };
  return { mecanico: [], eletrico: [], estetico: [] };
}

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

function CheckboxGroup({ title, options, selected, onToggle, disabled }) {
  return (
    <div className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
      <h3 className="text-sm font-black uppercase tracking-wide text-[#6B1F87] mb-4">{title}</h3>
      <div className="grid gap-2">
        {options.map((item) => {
          const checked = selected.includes(item);
          return (
            <label
              key={item}
              className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2 text-sm transition ${
                checked ? "border-[#F59E0B] bg-white text-[#6B1F87]" : "border-[#E9D5FF] bg-white text-slate-600 hover:bg-[#FCFAFF]"
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              <input type="checkbox" checked={checked} disabled={disabled} onChange={() => onToggle(item)} className="mt-1" />
              <span className="font-medium">{item}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
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
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-sm text-slate-500 mb-6">O produto será encaminhado para o <strong>Scrap</strong>. Essa ação não pode ser desfeita.</p>
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
            <div className="text-xs font-semibold text-slate-500">Técnico responsável</div>
            <div className="mt-1 text-sm font-bold text-[#6B1F87]">{tecnico}</div>
          </div>
          <label>
            <span className="text-sm font-semibold text-slate-600">Motivo da condenação *</span>
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} className={inputClass()} placeholder="Descreva o motivo." />
          </label>
        </div>
        <div className="mt-6 flex gap-3">
          <button onClick={() => onConfirm(motivo, tecnico)} disabled={!motivo || saving} className="flex-1 rounded-2xl bg-red-500 py-3 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition">
            {saving ? "Condenando..." : "Confirmar condenação"}
          </button>
          <button onClick={onCancel} className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
}

export default function TriagemReparosPage() {
  const { profile } = useAuth();

  const [osTriagem, setOsTriagem] = useState([]);
  const [osReparo, setOsReparo] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [etapa, setEtapa] = useState(ETAPA.TRIAGEM);
  const [triagem, setTriagem] = useState({ ...EMPTY_TRIAGEM });
  const [execucao, setExecucao] = useState({ ...EMPTY_EXECUCAO });
  const [reparosSelecionados, setReparosSelecionados] = useState({ mecanico: [], eletrico: [], estetico: [] });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [condenando, setCondenando] = useState(false);
  const [showModalCondenar, setShowModalCondenar] = useState(false);
  const [status, setStatus] = useState("");

  const selectedOsTriagem = useMemo(
    () => osTriagem.find((o) => String(o.id) === String(selectedOsId)) || null,
    [osTriagem, selectedOsId]
  );

  const selectedOsReparo = useMemo(
    () => osReparo.find((o) => String(o.id) === String(selectedOsId)) || null,
    [osReparo, selectedOsId]
  );

  const selectedOs = etapa === ETAPA.TRIAGEM ? selectedOsTriagem : selectedOsReparo;

  // Lista de triagem baseada no tipo de produto
  const listaTriagem = useMemo(() => {
    if (triagem.tipo_produto === "Lavadoras") return REPAROS_LAVADORAS;
    if (triagem.tipo_produto === "Ar-condicionado") return REPAROS_CLIMATIZACAO;
    return [];
  }, [triagem.tipo_produto]);

  // Listas de reparo baseadas no tipo de produto da OS selecionada
  const listasReparo = useMemo(() => {
    if (!selectedOsReparo) return { mecanico: [], eletrico: [], estetico: [] };
    return getReparosListas(selectedOsReparo.tipo_produto);
  }, [selectedOsReparo]);

  // Verificações da triagem
  const verificacoesTriagem = useMemo(() => {
    if (!selectedOsReparo) return [];
    return [
      ...(selectedOsReparo.reparos_mecanicos || []),
      ...(selectedOsReparo.reparos_eletricos || []),
      ...(selectedOsReparo.reparos_esteticos || []),
    ];
  }, [selectedOsReparo]);

  async function loadOs() {
    try {
      setLoading(true);
      const [triagens, mec, ele, est] = await Promise.all([
        fetchOsAguardandoTriagemLinhaBranca(),
        fetchOsParaReparo("Reparo Mecânico"),
        fetchOsParaReparo("Reparo Elétrico"),
        fetchOsParaReparo("Reparo Estético"),
      ]);
      setOsTriagem(triagens);
      const map = new Map();
      [...mec, ...ele, ...est].forEach((os) => map.set(os.id, os));
      setOsReparo([...map.values()]);
    } catch (err) {
      setStatus(`Erro ao carregar OS: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadOs(); }, []);

  function updateTriagem(field, value) {
    setTriagem((cur) => ({ ...cur, [field]: value }));
  }

  function toggleReparoTriagem(item) {
    setTriagem((cur) => {
      const list = cur.reparos_mecanicos || [];
      return {
        ...cur,
        reparos_mecanicos: list.includes(item) ? list.filter((i) => i !== item) : [...list, item],
      };
    });
  }

  function handlePrecisaReparo(value) {
    setTriagem((cur) => ({
      ...cur,
      precisa_reparo: value,
      reparos_mecanicos: value ? cur.reparos_mecanicos : [],
      reparos_eletricos: [],
      reparos_esteticos: [],
    }));
  }

  function toggleReparo(area, item) {
    setReparosSelecionados((cur) => {
      const list = cur[area] || [];
      return {
        ...cur,
        [area]: list.includes(item) ? list.filter((r) => r !== item) : [...list, item],
      };
    });
  }

  function updateExecucao(field, value) {
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

  function reset() {
    setSelectedOsId("");
    setTriagem({ ...EMPTY_TRIAGEM });
    setExecucao({ ...EMPTY_EXECUCAO });
    setReparosSelecionados({ mecanico: [], eletrico: [], estetico: [] });
    setStatus("");
  }

  async function handleSalvarTriagem(e) {
    e.preventDefault();
    if (!selectedOsTriagem || !triagem.tipo_produto) {
      setStatus("Selecione uma OS e informe o tipo do produto.");
      return;
    }
    if (triagem.precisa_reparo && triagem.reparos_mecanicos.length === 0) {
      setStatus("Selecione ao menos uma verificação.");
      return;
    }
    try {
      setSaving(true);
      await salvarTriagemLinhaBranca(selectedOsTriagem, { ...triagem, triado_por: profile?.nome });
      setStatus(`Triagem da OS ${selectedOsTriagem.numero_os} salva!`);
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleSalvarReparo(e) {
    e.preventDefault();
    if (!selectedOsReparo || !execucao.diagnostico_final) {
      setStatus("Preencha a OS e o diagnóstico final.");
      return;
    }
    try {
      setSaving(true);
      const servicoCompleto = [
        ...reparosSelecionados.mecanico,
        ...reparosSelecionados.eletrico,
        ...reparosSelecionados.estetico,
      ].join(", ");
      await salvarExecucaoReparo(
        selectedOsReparo,
        {
          ...execucao,
          tecnico: profile?.nome,
          servico_executado: servicoCompleto,
          peca_trocada: execucao.pecas.length > 0,
          descricao_peca: execucao.pecas.join(", "),
        },
        "Reparo Mecânico"
      );
      setStatus(`Reparos da OS ${selectedOsReparo.numero_os} salvos!`);
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handleCondenar(motivo, tecnico) {
    try {
      setCondenando(true);
      await condenarOs(selectedOs, motivo, tecnico);
      setShowModalCondenar(false);
      setStatus(`OS condenada e encaminhada para Scrap.`);
      reset();
      await loadOs();
    } catch (err) {
      setStatus(`Erro ao condenar: ${err.message}`);
    } finally {
      setCondenando(false);
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
              <h2 className="text-2xl font-black text-[#6B1F87]">Triagem + Reparos</h2>
              <p className="mt-1 text-sm text-slate-500">Triagem e reparo unificados para Climatização, Lavadoras e Diversos.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Técnico</div>
                <div className="text-sm font-bold text-[#6B1F87]">{profile?.nome}</div>
              </div>
              <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Triagem pendente</div>
                <div className="text-xl font-black text-[#6B1F87]">{loading ? "..." : osTriagem.length}</div>
              </div>
              <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
                <div className="text-xs font-semibold text-slate-500">Reparo pendente</div>
                <div className="text-xl font-black text-[#6B1F87]">{loading ? "..." : osReparo.length}</div>
              </div>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => { setEtapa(ETAPA.TRIAGEM); setSelectedOsId(""); setStatus(""); }}
              className={`rounded-2xl px-5 py-2.5 text-sm font-bold transition ${etapa === ETAPA.TRIAGEM ? "bg-[#6B1F87] text-white" : "bg-[#FCFAFF] text-[#6B1F87] ring-1 ring-[#E9D5FF]"}`}
            >
              <ClipboardCheck className="h-4 w-4 inline mr-1" />
              Triagem
            </button>
            <button
              onClick={() => { setEtapa(ETAPA.REPARO); setSelectedOsId(""); setStatus(""); }}
              className={`rounded-2xl px-5 py-2.5 text-sm font-bold transition ${etapa === ETAPA.REPARO ? "bg-[#6B1F87] text-white" : "bg-[#FCFAFF] text-[#6B1F87] ring-1 ring-[#E9D5FF]"}`}
            >
              <Wrench className="h-4 w-4 inline mr-1" />
              Reparos
            </button>
          </div>
        </SectionCard>

        {/* ETAPA TRIAGEM */}
        {etapa === ETAPA.TRIAGEM && (
          <form onSubmit={handleSalvarTriagem} className="space-y-6">
            <SectionCard>
              <div className="mb-5 flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 text-[#F97316]" />
                <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <label>
                  <span className="text-sm font-semibold text-slate-600">OS aguardando triagem</span>
                  <select value={selectedOsId} onChange={(e) => setSelectedOsId(e.target.value)} className={inputClass()}>
                    <option value="">Selecione uma OS</option>
                    {osTriagem.map((os) => (
                      <option key={os.id} value={os.id}>{os.numero_os} — {os.marca || "Sem marca"} {os.modelo || ""}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-600">Tipo do produto</span>
                  <select value={triagem.tipo_produto} onChange={(e) => updateTriagem("tipo_produto", e.target.value)} disabled={!selectedOsTriagem} className={inputClass(!selectedOsTriagem)}>
                    <option value="">Selecione</option>
                    {TIPOS_PRODUTO_LINHA_BRANCA.filter((t) => t !== "Refrigeração").map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-600">Precisa de reparo?</span>
                  <select value={triagem.precisa_reparo ? "Sim" : "Não"} onChange={(e) => handlePrecisaReparo(e.target.value === "Sim")} disabled={!selectedOsTriagem} className={inputClass(!selectedOsTriagem)}>
                    <option>Não</option>
                    <option>Sim</option>
                  </select>
                </label>
              </div>
              {selectedOsTriagem && (
                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {[["Fornecedor", selectedOsTriagem.fornecedor], ["Lote", selectedOsTriagem.lote], ["Serial", selectedOsTriagem.serial_number], ["Status", selectedOsTriagem.status_atual]].map(([label, val]) => (
                    <div key={label} className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                      <div className="text-xs font-semibold text-slate-500">{label}</div>
                      <div className="mt-1 text-sm font-bold text-[#6B1F87]">{val || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {triagem.tipo_produto && listaTriagem.length > 0 && (
              <div className={!triagem.precisa_reparo ? "pointer-events-none opacity-40" : ""}>
                <CheckboxGroup
                  title={`Verificações — ${triagem.tipo_produto}`}
                  options={listaTriagem}
                  selected={triagem.reparos_mecanicos}
                  disabled={!selectedOsTriagem || !triagem.precisa_reparo}
                  onToggle={toggleReparoTriagem}
                />
              </div>
            )}

            <SectionCard>
              <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Observações da triagem</h2>
              <textarea value={triagem.observacoes_triagem} onChange={(e) => updateTriagem("observacoes_triagem", e.target.value)} disabled={!selectedOsTriagem} rows={4} className={inputClass(!selectedOsTriagem)} placeholder="Detalhe o diagnóstico inicial." />
            </SectionCard>

            {status && <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">{status}</div>}

            <div className="flex flex-wrap gap-3">
              <Button primary type="submit" disabled={saving || !selectedOsTriagem}><Save className="h-4 w-4" />{saving ? "Salvando..." : "Salvar triagem"}</Button>
              <Button type="button" danger disabled={!selectedOsTriagem} onClick={() => setShowModalCondenar(true)}><AlertTriangle className="h-4 w-4" />Condenar</Button>
              <Button type="button" onClick={reset}><RotateCcw className="h-4 w-4" />Limpar</Button>
            </div>
          </form>
        )}

        {/* ETAPA REPARO */}
        {etapa === ETAPA.REPARO && (
          <form onSubmit={handleSalvarReparo} className="space-y-6">
            <SectionCard>
              <div className="mb-5 flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[#F97316]" />
                <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
              </div>
              <label>
                <span className="text-sm font-semibold text-slate-600">OS para reparo</span>
                <select value={selectedOsId} onChange={(e) => setSelectedOsId(e.target.value)} className={inputClass()}>
                  <option value="">Selecione uma OS</option>
                  {osReparo.map((os) => (
                    <option key={os.id} value={os.id}>{os.numero_os} — {os.marca || "Sem marca"} {os.modelo || ""}</option>
                  ))}
                </select>
              </label>
              {selectedOsReparo && (
                <div className="mt-5 grid gap-4 grid-cols-2 md:grid-cols-4">
                  {[["Fornecedor", selectedOsReparo.fornecedor], ["Lote", selectedOsReparo.lote], ["Serial", selectedOsReparo.serial_number], ["Modelo", selectedOsReparo.modelo]].map(([label, val]) => (
                    <div key={label} className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
                      <div className="text-xs font-semibold text-slate-500">{label}</div>
                      <div className="mt-1 text-sm font-bold text-[#6B1F87]">{val || "-"}</div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {selectedOsReparo && verificacoesTriagem.length > 0 && (
              <SectionCard>
                <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Verificações da triagem</h2>
                <div className="flex flex-wrap gap-2">
                  {verificacoesTriagem.map((r) => (
                    <span key={r} className="rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-[#6B1F87]">{r}</span>
                  ))}
                </div>
              </SectionCard>
            )}

            {selectedOsReparo && (
              <div className="grid gap-6 xl:grid-cols-3">
                <CheckboxGroup
                  title="Reparo Mecânico"
                  options={listasReparo.mecanico}
                  selected={reparosSelecionados.mecanico}
                  onToggle={(item) => toggleReparo("mecanico", item)}
                />
                <CheckboxGroup
                  title="Reparo Elétrico"
                  options={listasReparo.eletrico}
                  selected={reparosSelecionados.eletrico}
                  onToggle={(item) => toggleReparo("eletrico", item)}
                />
                <CheckboxGroup
                  title="Reparo Estético"
                  options={listasReparo.estetico}
                  selected={reparosSelecionados.estetico}
                  onToggle={(item) => toggleReparo("estetico", item)}
                />
              </div>
            )}

            {selectedOsReparo && (
              <SectionCard>
                <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Peças trocadas</h2>
                <div className="flex gap-2">
                  <input value={execucao.novaPeca} onChange={(e) => updateExecucao("novaPeca", e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), adicionarPeca())} className={inputClass()} placeholder="Descreva a peça e pressione Enter ou +" />
                  <button type="button" onClick={adicionarPeca} className="rounded-2xl bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF] px-4"><Plus className="h-4 w-4" /></button>
                </div>
                {execucao.pecas.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {execucao.pecas.map((p, i) => (
                      <span key={i} onClick={() => removerPeca(i)} className="cursor-pointer rounded-full bg-purple-100 px-3 py-1 text-xs font-semibold text-[#6B1F87] hover:bg-purple-200">{p} ✕</span>
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
                  <textarea value={execucao.diagnostico_final} onChange={(e) => updateExecucao("diagnostico_final", e.target.value)} disabled={!selectedOsReparo} rows={3} className={inputClass(!selectedOsReparo)} placeholder="Descreva o diagnóstico final." />
                </label>
                <label>
                  <span className="text-sm font-semibold text-slate-600">Observações</span>
                  <textarea value={execucao.observacoes} onChange={(e) => updateExecucao("observacoes", e.target.value)} disabled={!selectedOsReparo} rows={2} className={inputClass(!selectedOsReparo)} placeholder="Observações adicionais." />
                </label>
              </div>
            </SectionCard>

            {status && <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">{status}</div>}

            <div className="flex flex-wrap gap-3">
              <Button primary type="submit" disabled={saving || !selectedOsReparo}><Save className="h-4 w-4" />{saving ? "Salvando..." : "Concluir reparos"}</Button>
              <Button type="button" danger disabled={!selectedOsReparo} onClick={() => setShowModalCondenar(true)}><AlertTriangle className="h-4 w-4" />Condenar</Button>
              <Button type="button" onClick={reset}><RotateCcw className="h-4 w-4" />Limpar</Button>
            </div>
          </form>
        )}
      </div>
    </>
  );
}