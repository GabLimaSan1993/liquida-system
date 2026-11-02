import { useMemo, useState } from "react";
import { FileText, Mail, RefreshCw, Search, X } from "lucide-react";
import { reenviarEmailConclusaoB2B } from "../../services/B2BPainelGestorService.js";

const STATUS = [
  "AG. SEPARAÇÃO",
  "EM SEPARAÇÃO",
  "AG. FATURAMENTO",
  "EM FATURAMENTO",
  "FATURAMENTO PARCIAL",
  "FATURADO",
];

const COR = {
  "AG. SEPARAÇÃO": "bg-sky-100 text-sky-800 ring-sky-200",
  "EM SEPARAÇÃO": "bg-yellow-200 text-yellow-900 ring-yellow-300",
  "AG. FATURAMENTO": "bg-amber-300 text-amber-950 ring-amber-400",
  "EM FATURAMENTO": "bg-indigo-100 text-indigo-800 ring-indigo-200",
  "FATURAMENTO PARCIAL": "bg-orange-200 text-orange-900 ring-orange-300",
  "FATURADO": "bg-emerald-100 text-emerald-800 ring-emerald-200",
};

const dt = (valor) => {
  if (!valor) return "—";
  const texto = String(valor);
  if (/T\d{2}:\d{2}|\s\d{2}:\d{2}/.test(texto)) {
    const data = new Date(texto);
    if (!Number.isNaN(data.getTime())) return data.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  }
  const partes = texto.slice(0, 10).split("-");
  return partes.length === 3 ? partes.reverse().join("/") : texto;
};
const num = (v) => Number(v || 0).toLocaleString("pt-BR");
const moeda = (v) => v == null ? "—" : Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const dataHora = (v) => v ? new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";

function Situacao({ status }) {
  return <span className={`inline-flex whitespace-nowrap rounded-md px-2.5 py-1 text-[10px] font-black ring-1 ${COR[status] || "bg-slate-100 text-slate-600 ring-slate-200"}`}>{status}</span>;
}

export default function GestaoPedidosB2B({ pedidos = [], carregando = false, aoAtualizar }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const [selecionadoId, setSelecionadoId] = useState(null);
  const [confirmarReenvio, setConfirmarReenvio] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [mensagem, setMensagem] = useState(null);
  const selecionado = pedidos.find(p => p.id === selecionadoId) || null;

  const totaisStatus = useMemo(() => {
    const map = {};
    pedidos.forEach(p => { map[p.status] = (map[p.status] || 0) + 1; });
    return map;
  }, [pedidos]);

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pedidos.filter(p =>
      (!filtro || p.status === filtro) &&
      (!q || [p.cliente, p.lote, p.dataPedido, ...(p.nfs || []).map(n => n.numero)]
        .some(v => String(v || "").toLowerCase().includes(q)))
    ).sort((a, b) => (b.dataPedido || "").localeCompare(a.dataPedido || "") ||
      (b.lote || "").localeCompare(a.lote || ""));
  }, [pedidos, filtro, busca]);

  function abrir(p) {
    setSelecionadoId(p.id);
    setConfirmarReenvio(false);
    setMensagem(null);
  }

  async function reenviar() {
    if (!selecionado || reenviando || selecionado.status !== "FATURADO" || selecionado.pedidoStatus !== "concluido") return;
    setReenviando(true);
    setMensagem(null);
    try {
      const resultado = await reenviarEmailConclusaoB2B(selecionado.id);
      setMensagem({ erro: false, texto: `E-mail reenviado. ${num(resultado.enviados || 0)} destinatário(s) confirmado(s) pelo servidor.` });
      setConfirmarReenvio(false);
      await aoAtualizar?.();
    } catch (erro) {
      setMensagem({ erro: true, texto: erro.message || "Falha no reenvio." });
    } finally {
      setReenviando(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-black text-slate-900">Gestão B2B — Acompanhamento dos pedidos</h2>
            <p className="mt-1 text-xs text-slate-500">Bipagem, planilhas de faturamento, NFs importadas e resoluções de análise. Clique no cliente ou pedido para abrir as notas.</p>
          </div>
          <button type="button" onClick={aoAtualizar} disabled={carregando} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} className={carregando ? "animate-spin" : ""}/> Atualizar
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setFiltro("")} className={`rounded-lg px-3 py-1.5 text-[11px] font-bold ${!filtro ? "bg-[#211136] text-white" : "bg-slate-100 text-slate-600"}`}>Todos · {pedidos.length}</button>
          {STATUS.filter(k => totaisStatus[k]).map(k =>
            <button key={k} type="button" onClick={() => setFiltro(filtro === k ? "" : k)}
              className={`rounded-lg px-3 py-1.5 text-[10px] font-bold ring-1 ${filtro === k ? COR[k] : "bg-white text-slate-600 ring-slate-200"}`}>
              {k} · {num(totaisStatus[k])}
            </button>
          )}
        </div>
        <div className="relative mt-3">
          <Search size={16} className="absolute left-3 top-3 text-slate-400"/>
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar cliente, pedido/lote, data ou número de NF..."
            aria-label="Buscar pedidos B2B" className="w-full rounded-lg border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-xs outline-none focus:border-violet-400"/>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[970px] text-xs">
            <thead className="bg-slate-100">
              <tr className="border-b border-slate-200 text-left text-[10px] font-black uppercase text-slate-700">
                <th className="px-3 py-3">Cliente / pedido</th>
                <th className="px-3 py-3 text-center">Data pedido</th>
                <th className="px-3 py-3 text-right">Pedido</th>
                <th className="px-3 py-3 text-right">Separado</th>
                <th className="px-3 py-3 text-right">Faturado</th>
                <th className="px-3 py-3 text-center">Status</th>
                <th className="px-3 py-3 text-center">Dt. faturamento</th>
                <th className="px-3 py-3 text-right">Aging atend.</th>
                <th className="px-3 py-3">Detalhes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtrados.map(p => (
                <tr key={p.id} className="hover:bg-violet-50/50">
                  <td className="max-w-[290px] px-3 py-2">
                    <button type="button" className="block max-w-[270px] text-left font-black text-slate-800 hover:text-violet-700" onClick={() => abrir(p)} title="Ver notas fiscais deste pedido">{p.cliente || "—"}</button>
                    <button type="button" className="mt-0.5 block max-w-[270px] truncate text-left text-[10px] text-violet-700 underline decoration-dotted hover:underline" onClick={() => abrir(p)} title={p.lote || "Ver pedido"}>{p.lote || "Abrir pedido"}</button>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-600">{dt(p.dataPedido)}</td>
                  <td className="px-3 py-2 text-right font-bold tabular-nums">{num(p.total)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-blue-800">{num(p.separado)}</td>
                  <td className="px-3 py-2 text-right font-black tabular-nums text-emerald-700">{num(p.faturados)}</td>
                  <td className="px-3 py-2 text-center"><Situacao status={p.status}/></td>
                  <td className="px-3 py-2 text-center text-slate-600">{dt(p.dataFaturamento)}</td>
                  <td className={`px-3 py-2 text-right font-semibold tabular-nums ${p.agingAberto && p.aging > 2 ? "text-red-700" : "text-slate-600"}`}>{p.aging == null ? "—" : `${p.aging}d`}</td>
                  <td className="px-3 py-2"><button type="button" onClick={() => abrir(p)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-bold text-slate-700 hover:border-violet-300 hover:text-violet-700"><FileText size={13}/> NFs {p.nfs?.length ? `(${p.nfs.length})` : ""}</button></td>
                </tr>
              ))}
              {!carregando && !filtrados.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Nenhum pedido encontrado para os filtros selecionados.</td></tr>}
              {carregando && !pedidos.length && <tr><td colSpan={9} className="px-4 py-12 text-center text-sm text-slate-500">Carregando pedidos B2B...</td></tr>}
            </tbody>
            {filtrados.length > 0 && <tfoot className="border-t-2 border-slate-200 bg-slate-50 text-xs font-bold text-slate-700">
              <tr>
                <td className="px-3 py-3">Total · {num(filtrados.length)} pedidos</td>
                <td/>
                <td className="px-3 py-3 text-right">{num(filtrados.reduce((s,p)=>s+Number(p.total||0),0))}</td>
                <td className="px-3 py-3 text-right text-blue-800">{num(filtrados.reduce((s,p)=>s+Number(p.separado||0),0))}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{num(filtrados.reduce((s,p)=>s+Number(p.faturados||0),0))}</td>
                <td colSpan={4}/>
              </tr>
            </tfoot>}
          </table>
        </div>
      </div>

      {selecionado && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3" role="dialog" aria-modal="true" aria-labelledby="b2b-detalhe-titulo">
        <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 id="b2b-detalhe-titulo" className="text-lg font-black text-slate-900">{selecionado.cliente}</h3>
              <p className="mt-1 break-all text-xs text-violet-700">{selecionado.lote}</p>
              <div className="mt-2"><Situacao status={selecionado.status}/></div>
            </div>
            <button type="button" onClick={() => setSelecionadoId(null)} aria-label="Fechar detalhes do pedido" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"><X size={17}/></button>
          </div>

          <div className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              ["Pedido",selecionado.total],
              ["Separado",selecionado.separado],
              ["Faturado",selecionado.faturados],
              ["Resolvido / Não faturar",selecionado.naoFaturar],
            ].map(([label,val]) => <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[10px] text-slate-500">{label}</p><p className="mt-1 text-xl font-black text-slate-800">{num(val)}</p></div>)}
          </div>
          <p className="mb-3 text-xs text-slate-600">Planilhas exportadas: <b>{num(selecionado.exportacoes)}</b> · Em análise: <b>{num(selecionado.emAnalise)}</b> · Separado e faturado: <b>{num(selecionado.faturados)} / {num(selecionado.separado)}</b></p>

          <div className="rounded-lg border border-slate-200">
            <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-3 text-xs font-black text-slate-800"><FileText size={15}/> Notas fiscais do pedido · {selecionado.nfs?.length || 0}</div>
            {selecionado.nfs?.length ? <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead><tr className="border-b text-left text-[10px] uppercase text-slate-500"><th className="p-3">NF</th><th className="p-3">Situação</th><th className="p-3 text-right">Itens</th><th className="p-3 text-right">Valor</th><th className="p-3">Data</th></tr></thead>
                <tbody>{selecionado.nfs.map((nf,j)=><tr key={`${nf.numero}-${j}`} className="border-b border-slate-100">
                  <td className="p-3 font-black">{nf.numero}</td>
                  <td className="p-3"><span className={nf.status === "erro" ? "text-red-700 font-bold" : "text-emerald-700 font-bold"}>{nf.status === "erro" ? "Erro de NF" : "Importada"}</span>{nf.motivoErro&&<p className="mt-1 text-[10px] text-red-700">{nf.motivoErro}</p>}</td>
                  <td className="p-3 text-right">{num(nf.itens)}</td>
                  <td className="p-3 text-right">{moeda(nf.valor)}</td>
                  <td className="p-3">{dt(nf.data)}</td>
                </tr>)}</tbody>
              </table>
            </div> : <p className="px-3 py-6 text-xs text-slate-500">Nenhuma nota fiscal importada para este pedido. Exportar uma planilha não significa faturar.</p>}
          </div>

          <div className="mt-4 rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-xs font-black text-slate-800"><Mail size={15}/> E-mail de conclusão B2B</p>
                <p className="mt-1 text-xs text-slate-500">Último envio: {dataHora(selecionado.emailEnviadoEm)}</p>
                {selecionado.emailEnviadoPara && <p className="mt-1 break-words text-[10px] text-slate-500">Para: {selecionado.emailEnviadoPara}</p>}
              </div>
              <button type="button" disabled={reenviando || selecionado.status !== "FATURADO" || selecionado.pedidoStatus !== "concluido"}
                onClick={() => {setConfirmarReenvio(true);setMensagem(null);}}
                title={selecionado.status !== "FATURADO" || selecionado.pedidoStatus !== "concluido" ? "Disponível somente após pedido totalmente concluído" : "Reenviar resumo do pedido por e-mail"}
                className="shrink-0 rounded-lg bg-[#211136] px-3 py-2 text-xs font-bold text-white hover:bg-[#2a1747] disabled:cursor-not-allowed disabled:opacity-40">
                Reenviar e-mail
              </button>
            </div>
            {confirmarReenvio && <div className="mt-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-950">
              <p>Confirmar novo envio do e-mail de conclusão deste pedido aos destinatários configurados?</p>
              <div className="mt-2 flex gap-2">
                <button type="button" disabled={reenviando} onClick={reenviar} className="rounded-lg bg-violet-800 px-3 py-2 font-bold text-white disabled:opacity-50">{reenviando ? "Enviando…" : "Confirmar reenvio"}</button>
                <button type="button" disabled={reenviando} onClick={() => setConfirmarReenvio(false)} className="rounded-lg border border-slate-300 px-3 py-2 font-bold">Cancelar</button>
              </div>
            </div>}
            {mensagem && <p className={`mt-3 rounded-lg px-3 py-2 text-xs font-semibold ${mensagem.erro?"bg-red-50 text-red-800":"bg-emerald-50 text-emerald-800"}`}>{mensagem.texto}</p>}
          </div>
          <div className="mt-4 flex justify-end"><button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700" onClick={()=>setSelecionadoId(null)}>Fechar</button></div>
        </div>
      </div>}
    </div>
  );
}
