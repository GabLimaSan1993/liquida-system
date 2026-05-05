import { useEffect, useMemo, useState } from "react";
import { Camera, Save, RotateCcw, X } from "lucide-react";
import { supabase } from "../lib/supabase";

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

export default function LimpezaPage() {
  const [osList, setOsList] = useState([]);
  const [selectedOsId, setSelectedOsId] = useState("");
  const [tecnico, setTecnico] = useState("");
  const [fotos, setFotos] = useState([]);
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
        .eq("area_destino", "Limpeza")
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

  function handleFotos(e) {
    const files = Array.from(e.target.files);
    files.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFotos((cur) => [...cur, { name: file.name, url: ev.target.result }]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removerFoto(index) {
    setFotos((cur) => cur.filter((_, i) => i !== index));
  }

  function reset() {
    setSelectedOsId("");
    setTecnico("");
    setFotos([]);
    setStatus("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedOs || !tecnico) {
      setStatus("Preencha o técnico responsável.");
      return;
    }
    if (fotos.length === 0) {
      setStatus("Adicione ao menos uma foto do produto limpo.");
      return;
    }

    try {
      setSaving(true);
      setStatus("Salvando...");

      const { error } = await supabase
        .from("ordens_servico")
        .update({
          status_atual: "Qualidade",
          etapa_atual: "Qualidade",
          area_destino: "Qualidade",
          fotos_limpeza: fotos.map((f) => f.name),
          tecnico_limpeza: tecnico,
        })
        .eq("id", selectedOs.id);

      if (error) throw error;

      setStatus(`OS ${selectedOs.numero_os} finalizada! Segue para Qualidade.`);
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
            <h2 className="text-2xl font-black text-[#6B1F87]">Limpeza</h2>
            <p className="mt-1 text-sm text-slate-500">
              Registre as fotos do produto após a limpeza e finalize a etapa.
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
            <Camera className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-bold text-[#6B1F87]">Selecionar OS</h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="text-sm font-semibold text-slate-600">OS para limpeza</span>
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
                value={tecnico}
                onChange={(e) => setTecnico(e.target.value)}
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
            <h2 className="mb-4 text-lg font-bold text-[#6B1F87]">Fotos do produto limpo</h2>

            <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#E9D5FF] bg-[#FCFAFF] p-8 hover:border-purple-400 transition">
              <Camera className="h-8 w-8 text-purple-300 mb-2" />
              <span className="text-sm font-semibold text-slate-500">
                Clique para tirar foto ou selecionar imagem
              </span>
              <span className="text-xs text-slate-400 mt-1">JPG, PNG — múltiplas fotos</span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="hidden"
                onChange={handleFotos}
              />
            </label>

            {fotos.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {fotos.map((foto, i) => (
                  <div key={i} className="relative rounded-2xl overflow-hidden">
                    <img src={foto.url} alt={foto.name} className="w-full h-32 object-cover" />
                    <button
                      type="button"
                      onClick={() => removerFoto(i)}
                      className="absolute top-2 right-2 rounded-full bg-red-500 p-1 text-white hover:bg-red-600"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        )}

        {status && (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button primary type="submit" disabled={saving || !selectedOs}>
            <Save className="h-4 w-4" />
            {saving ? "Salvando..." : "Finalizar limpeza"}
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