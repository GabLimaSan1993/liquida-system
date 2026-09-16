import { AlertTriangle, Save, Search, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import {
  fetchComponentesEmReparo,
  registrarReparoClimatizacao,
} from "../../services/climatizacaoService.js";

const EMPTY = {
  diagnostico: "",
  servico: "",
  pecas: "",
  observacoes: "",
  destino: "",
};

export default function ReparosClimatizacaoV2Page() {
  const { profile } = useAuth();
  const [componentes, setComponentes] = useState([]);
  const [selecionadoId, setSelecionadoId] = useState("");
  const [busca, setBusca] = useState("");
  const [form, setForm] = useState({ ...EMPTY });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");

  const selecionado = useMemo(
    () => componentes.find((c) => String(c.id) === String(selecionadoId)) || null,
    [componentes, selecionadoId]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return componentes;
    return componentes.filter((c) =>
      [c.os?.numero_os, c.os?.serial_number, c.os?.marca, c.os?.modelo, c.tipo_unidade]
        .some((campo) => String(campo || "").toLowerCase().includes(termo))
    );
  }, [componentes, busca]);

  async function carregar() {
    try {
      setLoading(true);
      setComponentes(await fetchComponentesEmReparo());
    } catch (error) {
      setMensagem(`Erro ao carregar reparos: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function salvar() {
    if (!selecionado || !form.diagnostico.trim() || !form.servico.trim() || !form.destino) {
      setMensagem("Informe diagnóstico, serviço e destino após o reparo.");
      return;
    }
    try {
      setSaving(true);
      await registrarReparoClimatizacao(selecionado, {
        ...form,
        tecnico: profile?.nome || null,
        dt_inicio: new Date().toISOString(),
      });
      const numero = selecionado.os?.numero_os;
      setSelecionadoId("");
      setForm({ ...EMPTY });
      await carregar();
      setMensagem(`Reparo da OS ${numero} registrado com sucesso.`);
    } catch (error) {
      setMensagem(`Erro ao salvar reparo: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Climatização</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Reparos</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Trate a unidade individualmente. Quando reparada, ela volta ao estoque de peças triadas e aguarda a formação de um novo kit.</p>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-800">Unidades aguardando reparo</h2><span className="text-xs text-slate-400">{loading ? "Carregando..." : componentes.length}</span></div>
        <div className="relative"><Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar OS, serial, marca ou modelo" className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm" /></div>
        <div className="mt-3 max-h-[360px] overflow-y-auto rounded-xl border border-slate-200">
          {filtrados.map((item) => (
            <button key={item.id} type="button" onClick={() => { setSelecionadoId(item.id); setForm({ ...EMPTY }); }} className={`flex w-full items-center justify-between border-b border-slate-100 px-4 py-3 text-left last:border-0 ${String(selecionadoId) === String(item.id) ? "bg-violet-50" : "hover:bg-slate-50"}`}>
              <div><div className="text-sm font-black text-slate-800">{item.os?.numero_os || "—"}</div><div className="text-xs text-slate-500">{item.tipo_unidade} · {item.os?.marca} {item.os?.modelo}</div></div>
              <Wrench className="h-4 w-4 text-slate-400" />
            </button>
          ))}
        </div>
      </section>

      {selecionado && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Diagnóstico final<textarea value={form.diagnostico} onChange={(e) => setForm((c) => ({ ...c, diagnostico: e.target.value }))} rows={4} className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">Serviço executado<textarea value={form.servico} onChange={(e) => setForm((c) => ({ ...c, servico: e.target.value }))} rows={4} className="mt-2 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">Peças utilizadas<input value={form.pecas} onChange={(e) => setForm((c) => ({ ...c, pecas: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm" /></label>
            <label className="text-xs font-bold text-slate-600">Destino após reparo<select value={form.destino} onChange={(e) => setForm((c) => ({ ...c, destino: e.target.value }))} className="mt-2 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm"><option value="">Selecione</option><option value="reparado">Reparado → Aguardar novo kit</option><option value="venda_no_estado">Venda no estado</option><option value="scrap">Scrap</option></select></label>
          </div>
          <textarea value={form.observacoes} onChange={(e) => setForm((c) => ({ ...c, observacoes: e.target.value }))} rows={3} placeholder="Observações adicionais" className="mt-4 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm" />
          {form.destino === "scrap" && <div className="mt-3 flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700"><AlertTriangle className="h-4 w-4" />A unidade será retirada do fluxo produtivo.</div>}
          <button type="button" onClick={salvar} disabled={saving} className="mt-5 flex items-center gap-2 rounded-xl bg-[#4C1D95] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Save className="h-4 w-4" />{saving ? "Salvando..." : "Concluir reparo"}</button>
        </section>
      )}

      {mensagem && <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">{mensagem}</div>}
    </div>
  );
}
