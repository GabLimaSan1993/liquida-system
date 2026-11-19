import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, ClipboardCheck, Clock3, FlaskConical, PackageCheck, RefreshCw, ShieldAlert } from "lucide-react";
import { useAuth } from "../../AuthContext.jsx";
import { listarPainelReparo } from "../../services/reparoPickingService.js";
import { laboratorioIndividual } from "../../services/laboratorioIndividualService.js";

const num = n => Number(n || 0).toLocaleString("pt-BR");
const idade = v => v ? Math.max(0, Math.floor((Date.now() - new Date(v).getTime()) / 86400000)) + " dias" : "—";
const estados = { picking: "Em separação", aguardando_oracle: "Aguardando Oracle", em_reparo: "Em reparo" };

export default function ReparosVisaoGeralPage() {
  const { hasAccess } = useAuth();
  const podeLab = hasAccess("/v2/assurant/laboratorio/reparos");
  const podePicking = hasAccess("/v2/assurant/b2b/picking");
  const podeOracle = hasAccess("/v2/assurant/triagens/oracle");
  const podeRetorno = hasAccess("/v2/assurant/estoque/retorno-reparo");
  const podeRastrear = hasAccess("/v2/assurant/estoque/rastreabilidade");
  const [pedidos, setPedidos] = useState([]);
  const [lab, setLab] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [avisoLab, setAvisoLab] = useState("");

  const carregar = useCallback(async (isCancelled = () => false) => {
    setLoading(true); setErro(""); setAvisoLab("");
    const tasks = [listarPainelReparo()];
    if (podeLab) tasks.push(laboratorioIndividual("listar", { limite: 1, offset: 0 }));
    const res = await Promise.allSettled(tasks);
    if (isCancelled()) return;
    if (res[0].status === "fulfilled") {
      setPedidos(Array.isArray(res[0].value) ? res[0].value : []);
    } else {
      setPedidos([]);
      setErro(res[0].reason?.message || "Não foi possível consultar os pedidos.");
    }
    if (podeLab) {
      setLab(res[1]?.status === "fulfilled" ? res[1].value : null);
      if (res[1]?.status !== "fulfilled") setAvisoLab("Indicadores do laboratório indisponíveis.");
    } else setLab(null);
    setLoading(false);
  }, [podeLab]);

  useEffect(() => {
    let cancelled = false;
    void carregar(() => cancelled);
    return () => { cancelled = true; };
  }, [carregar]);

  const kpi = useMemo(() => ({
    picking: pedidos.filter(p => p.status === "picking").length,
    pendentes: pedidos.reduce((n, p) => n + Number(p.pendentes || 0), 0),
    bloqueados: pedidos.reduce((n, p) => n + Number(p.bloqueados || 0), 0),
    prelista: pedidos.filter(p => p.status === "picking").reduce((n, p) => n + Number(p.fila_oracle || 0), 0),
    liberados: pedidos.filter(p => p.status === "aguardando_oracle").reduce((n, p) => n + Number(p.fila_oracle || 0), 0),
    emReparo: pedidos.filter(p => p.status === "em_reparo").length,
  }), [pedidos]);
  const cards = [
    ["Pedidos em picking", kpi.picking, ClipboardCheck, podePicking, "/v2/assurant/reparos/pedidos"],
    ["Itens aguardando bipagem", kpi.pendentes, Clock3, podePicking, "/v2/assurant/reparos/pedidos"],
    ["Itens com pendência", kpi.bloqueados, ShieldAlert, podePicking, "/v2/assurant/reparos/pedidos"],
    ["Pré-lista Oracle", kpi.prelista, Activity, podeOracle, "/v2/assurant/reparos/oracle"],
    ["Liberados Oracle", kpi.liberados, PackageCheck, podeOracle, "/v2/assurant/reparos/oracle"],
    ["Pedidos em reparo", kpi.emReparo, FlaskConical, podePicking, "/v2/assurant/reparos/pedidos"],
  ];
  const labCards = [
    ["Aguardando técnico", lab?.resumo?.recebido],
    ["Reparo concluído", lab?.resumo?.concluido],
    ["Aguardando retorno", lab?.resumo?.em_devolucao],
    ["Recebido no Warehouse", lab?.resumo?.devolvido_warehouse],
  ];
  return <div className="mx-auto max-w-[1700px] space-y-5 p-4 pb-10 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div>
        <div className="text-[10px] font-black uppercase tracking-widest text-violet-700">Assurant Warehouse · Reparos</div>
        <h1 className="mt-1 text-2xl font-black text-slate-900">Visão geral</h1>
        <p className="mt-1 text-sm text-slate-500">Pedidos, picking, laboratório e movimentação Oracle.</p>
      </div>
      <button type="button" disabled={loading} onClick={() => void carregar()}
        className="inline-flex items-center gap-2 rounded-lg border bg-white px-4 py-2.5 text-xs font-bold text-slate-700 disabled:opacity-50">
        <RefreshCw size={15} className={loading ? "animate-spin" : ""}/>Atualizar
      </button>
    </header>
    {erro && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{erro}</p>}
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {cards.filter(c => c[3]).map(([label, value, Icon, enabled, url]) =>
        <Link key={label} to={url} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-violet-300">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[11px] font-bold text-slate-500">{label}</span><Icon size={18} className="text-violet-600"/>
          </div>
          <div className="mt-3 text-3xl font-black tabular-nums text-slate-900">{loading && !pedidos.length ? "—" : num(value)}</div>
        </Link>
      )}
    </section>
    {podeLab && <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-slate-900">Laboratório</h2>
        <Link to="/v2/assurant/laboratorio/reparos" className="inline-flex items-center gap-1 text-xs font-bold text-violet-700">Abrir laboratório <ArrowRight size={14}/></Link>
      </div>
      {avisoLab && <p className="text-xs text-amber-700">{avisoLab}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {labCards.map(([name, value]) => <div key={name} className="rounded-xl border bg-white p-4">
          <div className="text-[11px] font-bold text-slate-500">{name}</div>
          <div className="mt-2 text-2xl font-black tabular-nums text-slate-900">{lab ? num(value) : "—"}</div>
        </div>)}
      </div>
    </section>}
    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <h2 className="text-sm font-bold text-slate-900">Pedidos de reparo e revisão</h2>
        <span className="text-xs text-slate-400">{num(pedidos.length)} pedidos</span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs">
        <thead className="bg-slate-50 text-slate-500"><tr>
          {["Lote", "Situação", "Total", "Bipados", "Pendentes", "Fila Oracle", "Aging"].map(h => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}
        </tr></thead>
        <tbody className="divide-y divide-slate-100">{pedidos.map(p => <tr key={p.id} className="hover:bg-slate-50">
          <td className="px-4 py-3 font-bold text-slate-800">{p.lote || "Sem lote"}</td>
          <td className="px-4 py-3">{estados[p.status] || p.status || "—"}</td>
          <td className="px-4 py-3 tabular-nums">{num(p.total)}</td>
          <td className="px-4 py-3 tabular-nums">{num(p.bipados)}</td>
          <td className="px-4 py-3 tabular-nums">{num(p.pendentes)}</td>
          <td className="px-4 py-3 tabular-nums">{num(p.fila_oracle)}</td>
          <td className="px-4 py-3 tabular-nums">{idade(p.criado_em)}</td>
        </tr>)}
          {!loading && !pedidos.length && <tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhum pedido encontrado.</td></tr>}
        </tbody>
      </table></div>
    </section>
    <div className="flex flex-wrap gap-2">
      {podeRetorno && <Link className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-violet-700" to="/v2/assurant/estoque/retorno-reparo">Retorno do laboratório</Link>}
      {podeRastrear && <Link className="rounded-lg border bg-white px-3 py-2 text-xs font-bold text-violet-700" to="/v2/assurant/estoque/rastreabilidade">Histórico e rastreabilidade</Link>}
    </div>
    <p className="text-xs text-slate-500">Dados somente de leitura das fontes existentes. Cada etapa mantém a própria permissão; esta tela não registra movimentações.</p>
  </div>;
}
