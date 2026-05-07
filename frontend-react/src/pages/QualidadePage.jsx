import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Save, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../AuthContext.jsx";

const CHECKLIST_APROVACAO = [
  "Produto ligando corretamente",
  "Temperatura atingida conforme especificação",
  "Ausência de ruídos anormais",
  "Vedação das portas em perfeito estado",
  "Iluminação interna funcionando",
  "Display e interface sem defeitos",
  "Sem vazamentos aparentes",
];

const CHECKLIST_DESCARACTERIZACAO = [
  "Etiqueta do fabricante removida",
  "Número de série removido ou coberto",
  "Adesivos e lacres originais removidos",
  "Etiquetas de voltagem originais removidas",
  "Vinculação com fabricante encerrada",
];

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
  const base = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";
  const style = primary
    ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
    : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]";
  return <button {...props} className={`${base} ${style}`}>{children}</button>;
}

function CheckItem({ label, checked, onChange }) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
      checked
        ? "border-green-400 bg-green-50 text-green-800"
        : "border-[#E9D5FF] bg-white text-slate-600 hover:bg-[#FCFAFF]"
    }`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5"
      />
      <span className="font-medium">{label}</span>
    </label>
  );
}

export default function QualidadePage() {
  const { profile } = useAuth();
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [aprovacao, setAprovacao] = useState([]);
  const [descaracterizacao, setDescaracterizacao] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  const selectedOs = useMemo(
    () => osList.find((o) => String(o.id) === String(selectedOsId)) || null,
    [osList, selectedOsId]
  );

  const tudoAprovado = aprovacao.length === CHECKLIST_APROVACAO.length;
  const tudoDescaracterizado = descaracterizacao.length === CHECKLIST_DESCARACTERIZACAO.length;
  const podeFinalizar = tudoAprovado && tudoDescaracterizado && selectedOs;

  async function loadOs() {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("ordens_servico")
        .select("*")
        .eq("area_destino", "Qualidade")
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

  function toggleItem(list, setList, item) {
    setList((cur) =>
      cur.includes(item) ? cur.filter((i) => i !== item) : [...cur, item]
    );
  }

  function reset() {
    setSelectedOsId("");
    setAprovacao([]);
    setDescaracterizacao([]);
    setStatus("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!podeFinalizar) {
      setStatus("Complete todos os itens do checklist antes de finalizar.");
      return;
    }

    try {
      setSaving(true);
      setStatus("Salvando...");

      const { error } = await supabase
        .from("ordens_servico")
        .update({
          status_atual: "Concluído",
          etapa_atual: "Concluído",
          area_destino: null,
          checklist_qualidade: { aprovacao, descaracterizacao },
          tecnico_qualidade: profile?.nome,
        })
        .eq("id", selectedOs.id);

      if (error) throw error;

      setStatus(`OS ${selectedOs.numero_os} concluída com sucesso! ✅`);
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
            <h2 className="text-2xl font-black text-[#6B1F87]">Qualidade</h2>
            <p className="mt-1 text-sm text-slate-500">
              Checklist de aprovação final e descaracterização do produto.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
              <div className="text-xs font-semibold text-slate-500">Técnico</div>
              <div className="text-sm font-bold text-[#6B1F87]">{profile?.nome}</div>
            </div>
            <div className="rounded-2xl bg-[#FCFAFF] px-4 py-3 ring-1 ring-[#E9D5FF]">
              <div className="text-xs font-semibold text-slate-500">OS pendentes</div>
              <div className="text-xl font-black text-[#6B1F87]">
                {loading ? "..." : osList.length}
              </div>
            </div>
          </div>
        </div>
      </SectionCard>

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard>
          <div className="mb-5 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
          </div>

          <label>
            <span className="text-sm font-semibold text-slate-600">OS para qualidade</span>
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

          {selectedOs && (
            <div className="mt-5 grid gap-4 grid-cols-2 md:grid-cols-4">
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
          <>
            <SectionCard>
              <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">
                Aprovação final
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {aprovacao.length}/{CHECKLIST_APROVACAO.length}
                </span>
              </h2>
              <div className="space-y-2">
                {CHECKLIST_APROVACAO.map((item) => (
                  <CheckItem
                    key={item}
                    label={item}
                    checked={aprovacao.includes(item)}
                    onChange={() => toggleItem(aprovacao, setAprovacao, item)}
                  />
                ))}
              </div>
            </SectionCard>

            <SectionCard>
              <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">
                Descaracterização
                <span className="ml-2 text-sm font-normal text-slate-400">
                  {descaracterizacao.length}/{CHECKLIST_DESCARACTERIZACAO.length}
                </span>
              </h2>
              <div className="space-y-2">
                {CHECKLIST_DESCARACTERIZACAO.map((item) => (
                  <CheckItem
                    key={item}
                    label={item}
                    checked={descaracterizacao.includes(item)}
                    onChange={() => toggleItem(descaracterizacao, setDescaracterizacao, item)}
                  />
                ))}
              </div>
            </SectionCard>
          </>
        )}

        {status && (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button primary type="submit" disabled={saving || !podeFinalizar}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Finalizar qualidade"}
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