import {
  AlertTriangle,
  Check,
  ClipboardCheck,
  PackageCheck,
  RotateCcw,
  Save,
  Search,
  Snowflake,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import {
  CHECKLIST_CLIMATIZACAO,
  fetchOsClimatizacaoAguardandoTriagem,
  salvarTriagemClimatizacao,
} from "../../services/climatizacaoService.js";

const EMPTY = {
  tipo_unidade: "",
  capacidade_btu: "",
  tensao: "",
  gas_refrigerante: "",
  modelo_validado: false,
  energiza: null,
  checklist: {},
  faltando_pecas: false,
  oxidacao: false,
  pecas_quebradas: false,
  resultado: "",
  observacoes: "",
};

function InfoField({ label, value }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-bold text-slate-800">{value || "—"}</div>
    </div>
  );
}

function StatusChoice({ value, current, onClick, children, tone = "violet" }) {
  const active = current === value;
  const styles = {
    violet: active ? "border-violet-500 bg-violet-50 ring-2 ring-violet-100" : "border-slate-200",
    emerald: active ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100" : "border-slate-200",
    amber: active ? "border-amber-500 bg-amber-50 ring-2 ring-amber-100" : "border-slate-200",
    rose: active ? "border-rose-500 bg-rose-50 ring-2 ring-rose-100" : "border-slate-200",
  };
  return (
    <button type="button" onClick={onClick} className={`rounded-xl border px-4 py-3 text-left text-sm font-bold transition ${styles[tone]}`}>
      {children}
    </button>
  );
}

export default function TriagemClimatizacaoV2Page() {
  const { profile } = useAuth();
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const selectedOs = useMemo(
    () => osList.find((item) => String(item.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return osList;
    return osList.filter((os) =>
      [os.numero_os, os.serial_number, os.marca, os.modelo, os.categoria, os.fornecedor]
        .some((campo) => String(campo || "").toLowerCase().includes(termo))
    );
  }, [osList, busca]);

  async function carregar() {
    try {
      setLoading(true);
      setMensagem("");
      setOsList(await fetchOsClimatizacaoAguardandoTriagem());
    } catch (error) {
      setMensagem(`Erro ao carregar OS: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  function selecionarOs(os) {
    setSelectedOsId(os.id);
    setBusca("");
    setMensagem("");
    setForm({ ...EMPTY, tensao: os.voltagem || "" });
  }

  function limpar() {
    setSelectedOsId("");
    setBusca("");
    setForm({ ...EMPTY });
    setMensagem("");
  }

  function setChecklist(item, valor) {
    setForm((current) => ({
      ...current,
      checklist: { ...current.checklist, [item]: valor },
    }));
  }

  const checklistCompleto = CHECKLIST_CLIMATIZACAO.every((item) => form.checklist[item]);
  const podeSalvar = Boolean(
    selectedOs &&
    form.tipo_unidade &&
    form.modelo_validado &&
    form.energiza !== null &&
    checklistCompleto &&
    form.resultado
  );

  async function salvar() {
    if (!podeSalvar) {
      setMensagem("Preencha identificação, energização, checklist completo e destino da unidade.");
      return;
    }
    try {
      setSaving(true);
      setMensagem("Registrando triagem...");
      const numero = selectedOs.numero_os;
      await salvarTriagemClimatizacao(selectedOs, {
        ...form,
        triado_por: profile?.nome || null,
      });
      limpar();
      await carregar();
      setMensagem(`OS ${numero} triada com sucesso.`);
    } catch (error) {
      setMensagem(`Erro ao salvar triagem: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Climatização</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Triagem técnica</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Valide a unidade individual, confirme energização e condição elétrica, e direcione a peça para kit, reparo, venda no estado ou scrap.
        </p>
      </div>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">1. Identificar OS</h2>
          <span className="text-xs font-semibold text-slate-400">{loading ? "Carregando..." : `${osList.length} OS aguardando`}</span>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          {!selectedOs ? (
            <>
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-400" />
                <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Busque por OS, serial, marca, modelo ou categoria" className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-11 pr-4 text-sm outline-none focus:border-[#765D81] focus:bg-white" />
              </div>
              <div className="mt-3 max-h-[320px] overflow-y-auto rounded-xl border border-slate-200">
                {filtradas.slice(0, 30).map((os) => (
                  <button key={os.id} type="button" onClick={() => selecionarOs(os)} className="flex w-full items-center justify-between gap-4 border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50">
                    <div><div className="text-sm font-black text-slate-800">{os.numero_os}</div><div className="mt-0.5 text-xs text-slate-500">{os.marca || "—"} {os.modelo || ""}</div></div>
                    <div className="text-right text-[11px] text-slate-400">{os.serial_number || "Sem serial"}</div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-[#4C1D95]"><Snowflake className="h-5 w-5" /></div>
                  <div><div className="text-lg font-black text-slate-900">{selectedOs.numero_os}</div><div className="text-xs text-slate-500">Unidade selecionada</div></div>
                </div>
                <button type="button" onClick={limpar} className="text-xs font-bold text-slate-500 hover:text-slate-800">Trocar OS</button>
              </div>
              <div className="mt-6 grid gap-5 border-t border-slate-100 pt-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <InfoField label="Marca" value={selectedOs.marca} />
                <InfoField label="Modelo" value={selectedOs.modelo} />
                <InfoField label="Serial" value={selectedOs.serial_number} />
                <InfoField label="Categoria" value={selectedOs.categoria} />
                <InfoField label="Voltagem" value={selectedOs.voltagem} />
                <InfoField label="Status" value={selectedOs.status_atual} />
              </div>
            </div>
          )}
        </div>
      </section>

      <section className={`mt-8 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
        <h2 className="mb-3 text-sm font-black text-slate-800">2. Identificação técnica</h2>
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-5 md:grid-cols-2 xl:grid-cols-5">
          <label className="text-xs font-bold text-slate-600">Tipo da unidade
            <select value={form.tipo_unidade} onChange={(e) => setForm((c) => ({ ...c, tipo_unidade: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm">
              <option value="">Selecione</option><option value="condensadora">Condensadora</option><option value="evaporadora">Evaporadora</option>
            </select>
          </label>
          <label className="text-xs font-bold text-slate-600">Capacidade BTU
            <input type="number" value={form.capacidade_btu} onChange={(e) => setForm((c) => ({ ...c, capacidade_btu: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="Ex.: 12000" />
          </label>
          <label className="text-xs font-bold text-slate-600">Tensão
            <input value={form.tensao} onChange={(e) => setForm((c) => ({ ...c, tensao: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" />
          </label>
          <label className="text-xs font-bold text-slate-600">Gás refrigerante
            <input value={form.gas_refrigerante} onChange={(e) => setForm((c) => ({ ...c, gas_refrigerante: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" placeholder="R32, R410A..." />
          </label>
          <button type="button" onClick={() => setForm((c) => ({ ...c, modelo_validado: !c.modelo_validado }))} className={`mt-5 flex h-11 items-center justify-center gap-2 rounded-xl border text-sm font-bold ${form.modelo_validado ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 text-slate-500"}`}>
            <PackageCheck className="h-4 w-4" /> Modelo validado
          </button>
        </div>
      </section>

      <section className={`mt-8 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
        <h2 className="mb-3 text-sm font-black text-slate-800">3. Energização inicial</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <StatusChoice value={true} current={form.energiza} onClick={() => setForm((c) => ({ ...c, energiza: true }))} tone="emerald">Liga / energiza normalmente</StatusChoice>
          <StatusChoice value={false} current={form.energiza} onClick={() => setForm((c) => ({ ...c, energiza: false }))} tone="rose">Não liga / não energiza</StatusChoice>
        </div>
      </section>

      <section className={`mt-8 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
        <div className="mb-3 flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-[#765D81]" /><h2 className="text-sm font-black text-slate-800">4. Validação elétrica</h2></div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="grid grid-cols-[1fr_110px_110px] bg-slate-50 px-5 py-3 text-[11px] font-black uppercase tracking-[0.12em] text-slate-500"><span>Componente</span><span className="text-center">Bom</span><span className="text-center">Ruim</span></div>
          {CHECKLIST_CLIMATIZACAO.map((item) => (
            <div key={item} className="grid grid-cols-[1fr_110px_110px] items-center border-t border-slate-100 px-5 py-3">
              <span className="text-sm font-bold text-slate-700">{item}</span>
              <button type="button" onClick={() => setChecklist(item, "bom")} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border ${form.checklist[item] === "bom" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent"}`}><Check className="h-4 w-4" /></button>
              <button type="button" onClick={() => setChecklist(item, "ruim")} className={`mx-auto flex h-8 w-8 items-center justify-center rounded-lg border ${form.checklist[item] === "ruim" ? "border-rose-500 bg-rose-500 text-white" : "border-slate-300 text-transparent"}`}><X className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[["faltando_pecas","Faltando peças"],["oxidacao","Oxidação"],["pecas_quebradas","Peças quebradas"]].map(([key,label]) => (
            <button key={key} type="button" onClick={() => setForm((c) => ({ ...c, [key]: !c[key] }))} className={`rounded-xl border px-4 py-3 text-sm font-bold ${form[key] ? "border-amber-400 bg-amber-50 text-amber-800" : "border-slate-200 bg-white text-slate-600"}`}><AlertTriangle className="mr-2 inline h-4 w-4" />{label}</button>
          ))}
        </div>
      </section>

      <section className={`mt-8 ${!selectedOs ? "pointer-events-none opacity-40" : ""}`}>
        <h2 className="mb-3 text-sm font-black text-slate-800">5. Destino da unidade</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <StatusChoice value="aprovado" current={form.resultado} onClick={() => setForm((c) => ({ ...c, resultado: "aprovado" }))} tone="emerald">Aprovado · Aguardar kit</StatusChoice>
          <StatusChoice value="reparo" current={form.resultado} onClick={() => setForm((c) => ({ ...c, resultado: "reparo" }))} tone="violet">Enviar para reparo</StatusChoice>
          <StatusChoice value="venda_no_estado" current={form.resultado} onClick={() => setForm((c) => ({ ...c, resultado: "venda_no_estado" }))} tone="amber">Venda no estado</StatusChoice>
          <StatusChoice value="scrap" current={form.resultado} onClick={() => setForm((c) => ({ ...c, resultado: "scrap" }))} tone="rose">Scrap</StatusChoice>
        </div>
        <textarea value={form.observacoes} onChange={(e) => setForm((c) => ({ ...c, observacoes: e.target.value }))} rows={4} placeholder="Observações da triagem, falhas percebidas, ruídos, detalhes do equipamento..." className="mt-4 w-full resize-none rounded-2xl border border-slate-200 bg-white p-4 text-sm outline-none focus:border-[#765D81]" />
      </section>

      {mensagem && <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">{mensagem}</div>}

      <div className="mt-6 flex flex-wrap gap-3">
        <button type="button" onClick={salvar} disabled={!podeSalvar || saving} className="flex items-center gap-2 rounded-xl bg-[#4C1D95] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Concluir triagem"}</button>
        <button type="button" onClick={limpar} className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600"><RotateCcw className="h-4 w-4" />Limpar</button>
      </div>
    </div>
  );
}
