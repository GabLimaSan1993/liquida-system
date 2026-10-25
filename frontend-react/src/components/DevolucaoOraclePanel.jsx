import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../AuthContext.jsx";
import { supabase } from "../lib/supabase.js";

const STATUS_DEV = "Em processo de devolução Agd RI";

export default function DevolucaoOraclePanel() {
  const { user } = useAuth();
  const [itens, setItens] = useState([]);
  const [pesquisa, setPesquisa] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [confirmando, setConfirmando] = useState(null);
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [pagina, setPagina] = useState(0);
  const [mais, setMais] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro("");
    try {
      let req = supabase.from("assurant_triagem")
        .select("id,imei,voucher,produto,modelo,sku,local,status_atual,data_alocacao,devolucao_id")
        .eq("status_atual", STATUS_DEV)
        .not("data_alocacao", "is", null)
        .order("data_alocacao", { ascending: false })
        .range(pagina * 100, pagina * 100 + 100);
      const termo = pesquisa.trim().replace(/[%(),]/g, "");
      if (termo) req = req.or(`imei.ilike.%${termo}%,voucher.ilike.%${termo}%`);
      const { data, error } = await req;
      if (error) throw error;
      const dados = data || [];
      setMais(dados.length > 100);
      setItens(dados.slice(0, 100));
    } catch (e) { setErro(e.message || "Não foi possível carregar devoluções."); }
    finally { setCarregando(false); }
  }, [pagina, pesquisa]);

  useEffect(() => { carregar(); }, [carregar]);

  async function confirmar(item) {
    if (!user?.id || confirmando) return;
    if (!window.confirm(`Confirmar que o IMEI ${item.imei} já teve entrada registrada no Oracle e liberar como Produto disponível?`)) return;
    setConfirmando(item.id);
    setErro("");
    setMensagem("");
    try {
      // A confirmação é permitida somente para devoluções efetivamente alocadas
      // e ainda pendentes. Não altera a alocação física nem gera uma nova RI.
      const { data, error } = await supabase.from("assurant_triagem")
        .update({
          status_atual: "Produto disponível",
          oracle_confirmado_em: new Date().toISOString(),
          oracle_confirmado_por: user.id,
        })
        .eq("id", item.id)
        .eq("status_atual", STATUS_DEV)
        .not("data_alocacao", "is", null)
        .is("oracle_confirmado_em", null)
        .select("id");
      if (error) throw error;
      if (!data?.length) throw new Error("Registro já alterado ou sem alocação confirmada. Atualize a fila.");
      setMensagem(`IMEI ${item.imei}: entrada Oracle confirmada e produto liberado.`);
      await carregar();
    } catch (e) { setErro(e.message || "Não foi possível confirmar o Oracle."); }
    finally { setConfirmando(null); }
  }

  return (
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div>
        <h2 className="text-base font-bold text-slate-800">Em processo de devolução — confirmação Oracle</h2>
        <p className="text-sm text-slate-500">Produtos de devolução já alocados permanecem nesta fila até a confirmação manual da entrada no Oracle. Apenas após confirmar passam a Produto disponível.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Buscar IMEI ou voucher" className="min-w-64 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Buscar IMEI ou voucher" value={pesquisa} onChange={e => {setPesquisa(e.target.value); setPagina(0);}} />
        <button type="button" onClick={carregar} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold">Atualizar</button>
      </div>
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      {mensagem && <p role="status" className="text-sm text-emerald-700">{mensagem}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-left text-sm">
          <thead className="border-b bg-slate-50 text-slate-600"><tr><th className="p-3">IMEI</th><th className="p-3">Voucher</th><th className="p-3">Produto</th><th className="p-3">Local</th><th className="p-3">Situação</th><th className="p-3">Ação</th></tr></thead>
          <tbody>
            {itens.map(item => <tr key={item.id} className="border-b">
              <td className="p-3 font-semibold">{item.imei || "—"}</td>
              <td className="p-3">{item.voucher || "—"}</td>
              <td className="p-3">{item.produto || item.modelo || item.sku || "—"}</td>
              <td className="p-3">{item.local || "—"}</td>
              <td className="p-3 text-amber-700">Aguardando confirmação Oracle</td>
              <td className="p-3"><button type="button" disabled={Boolean(confirmando)} onClick={() => confirmar(item)} className="rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">{confirmando === item.id ? "Confirmando..." : "Confirmar entrada Oracle"}</button></td>
            </tr>)}
          </tbody>
        </table>
        {!carregando && !itens.length && <p className="p-5 text-sm text-slate-500">Nenhuma devolução alocada aguardando confirmação nesta pesquisa.</p>}
        {carregando && <p className="p-5 text-sm text-slate-500">Carregando...</p>}
      </div>
      <div className="flex justify-end gap-3">
        <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40" disabled={pagina === 0} onClick={() => setPagina(v => Math.max(0,v-1))}>Anterior</button>
        <span className="self-center text-xs text-slate-500">Página {pagina+1}</span>
        <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-40" disabled={!mais} onClick={() => setPagina(v => v+1)}>Próxima</button>
      </div>
    </section>
  );
}
