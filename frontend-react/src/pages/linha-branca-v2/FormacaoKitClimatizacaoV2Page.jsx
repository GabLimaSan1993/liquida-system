import { Barcode, Check, PackagePlus, QrCode, RefreshCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import {
  fetchComponentesAguardandoKit,
  formarKitClimatizacao,
} from "../../services/climatizacaoService.js";

function CardComponente({ item, selecionado, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-2xl border bg-white p-4 text-left transition ${
        selecionado ? "border-violet-500 ring-2 ring-violet-100" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.12em] text-slate-400">
            {item.tipo_unidade}
          </div>
          <div className="mt-1 text-base font-black text-slate-900">{item.os?.numero_os || `OS ${item.os_id}`}</div>
          <div className="mt-1 text-xs text-slate-500">{item.os?.marca || "—"} {item.os?.modelo || ""}</div>
        </div>
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg border ${selecionado ? "border-violet-500 bg-violet-500 text-white" : "border-slate-300 text-transparent"}`}>
          <Check className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3 border-t border-slate-100 pt-3 text-xs">
        <div><div className="text-slate-400">BTU</div><div className="font-bold text-slate-700">{item.capacidade_btu || "—"}</div></div>
        <div><div className="text-slate-400">Tensão</div><div className="font-bold text-slate-700">{item.tensao || "—"}</div></div>
        <div><div className="text-slate-400">Gás</div><div className="font-bold text-slate-700">{item.gas_refrigerante || "—"}</div></div>
      </div>
    </button>
  );
}

export default function FormacaoKitClimatizacaoV2Page() {
  const { profile } = useAuth();
  const [componentes, setComponentes] = useState([]);
  const [selecionados, setSelecionados] = useState([]);
  const [observacoes, setObservacoes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [ultimoKit, setUltimoKit] = useState(null);

  async function carregar() {
    try {
      setLoading(true);
      setMensagem("");
      setComponentes(await fetchComponentesAguardandoKit());
    } catch (error) {
      setMensagem(`Erro ao carregar componentes: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const condensadoras = useMemo(() => componentes.filter((c) => c.tipo_unidade === "condensadora"), [componentes]);
  const evaporadoras = useMemo(() => componentes.filter((c) => c.tipo_unidade === "evaporadora"), [componentes]);
  const itensSelecionados = useMemo(() => componentes.filter((c) => selecionados.includes(c.id)), [componentes, selecionados]);
  const qtdCond = itensSelecionados.filter((c) => c.tipo_unidade === "condensadora").length;
  const qtdEvap = itensSelecionados.filter((c) => c.tipo_unidade === "evaporadora").length;
  const podeFormar = qtdCond >= 1 && qtdEvap >= 1;

  function toggle(id) {
    setSelecionados((current) => current.includes(id) ? current.filter((x) => x !== id) : [...current, id]);
  }

  async function formar() {
    if (!podeFormar) {
      setMensagem("Selecione pelo menos uma condensadora e uma evaporadora.");
      return;
    }
    try {
      setSaving(true);
      setMensagem("Formando kit...");
      const kit = await formarKitClimatizacao(selecionados, profile?.nome, observacoes);
      setUltimoKit(kit);
      setSelecionados([]);
      setObservacoes("");
      await carregar();
      setMensagem(`Kit ${kit.codigo} formado com sucesso.`);
    } catch (error) {
      setMensagem(`Erro ao formar kit: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  function imprimirEtiqueta() {
    if (!ultimoKit) return;
    const conteudo = itensSelecionados.map((i) => i.os?.numero_os).filter(Boolean).join(" | ");
    const win = window.open("", "_blank", "width=520,height=680");
    if (!win) return;
    win.document.write(`
      <html><head><title>${ultimoKit.codigo}</title>
      <style>body{font-family:Arial;padding:24px}.box{border:3px solid #111;padding:22px;border-radius:10px}.code{font-size:28px;font-weight:800;text-align:center}.meta{margin-top:14px;font-size:14px}.fakebar{height:78px;margin:18px 0;background:repeating-linear-gradient(90deg,#000 0,#000 3px,#fff 3px,#fff 6px)}.qr{width:160px;height:160px;margin:20px auto;background:repeating-conic-gradient(#000 0 25%,#fff 0 50%) 0/28px 28px;border:8px solid #000}</style>
      </head><body><div class="box"><div class="code">${ultimoKit.codigo}</div><div class="fakebar"></div><div class="qr"></div><div class="meta"><b>Conteúdo do QR:</b><br>${ultimoKit.codigo}</div><div class="meta">${conteudo || "Componentes vinculados ao kit"}</div></div><script>window.print()</script></body></html>
    `);
    win.document.close();
  }

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="border-b border-slate-200 pb-7">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Climatização</div>
        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Formação de kits</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">Associe as OS individuais em um conjunto comercial e operacional antes do teste de 30 minutos.</p>
      </div>

      <div className="mt-8 grid gap-5 lg:grid-cols-2">
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-800">Condensadoras disponíveis</h2><span className="text-xs text-slate-400">{condensadoras.length}</span></div>
          <div className="space-y-3">{condensadoras.map((item) => <CardComponente key={item.id} item={item} selecionado={selecionados.includes(item.id)} onToggle={() => toggle(item.id)} />)}</div>
        </section>
        <section>
          <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-black text-slate-800">Evaporadoras disponíveis</h2><span className="text-xs text-slate-400">{evaporadoras.length}</span></div>
          <div className="space-y-3">{evaporadoras.map((item) => <CardComponente key={item.id} item={item} selecionado={selecionados.includes(item.id)} onToggle={() => toggle(item.id)} />)}</div>
        </section>
      </div>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-sm font-black text-slate-900">Kit em montagem</div>
            <div className="mt-1 text-xs text-slate-500">{qtdCond} condensadora(s) + {qtdEvap} evaporadora(s)</div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={carregar} className="flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-600"><RefreshCcw className="h-4 w-4" />Atualizar</button>
            <button type="button" onClick={formar} disabled={!podeFormar || saving} className="flex items-center gap-2 rounded-xl bg-[#4C1D95] px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40"><PackagePlus className="h-4 w-4" />{saving ? "Formando..." : "Formar kit"}</button>
          </div>
        </div>
        <textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={3} placeholder="Observações sobre a compatibilidade ou composição do kit..." className="mt-4 w-full resize-none rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-[#765D81]" />
      </section>

      {ultimoKit && (
        <section className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div><div className="text-xs font-black uppercase tracking-[0.12em] text-emerald-700">Kit gerado</div><div className="mt-1 text-2xl font-black text-emerald-950">{ultimoKit.codigo}</div></div>
            <button type="button" onClick={imprimirEtiqueta} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-emerald-800 shadow-sm"><Barcode className="h-4 w-4" /><QrCode className="h-4 w-4" />Imprimir etiqueta</button>
          </div>
        </section>
      )}

      {mensagem && <div className="mt-5 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-600">{loading ? "Carregando..." : mensagem}</div>}
    </div>
  );
}
