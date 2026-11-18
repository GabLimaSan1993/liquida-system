import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpRight, FileUp, Landmark, RefreshCw, Wallet } from "lucide-react";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../AuthContext.jsx";

const PAGE_SIZE = 50;
const brl = (value) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) || 0);
const num = (value) => Number(value || 0).toLocaleString("pt-BR");
const dataBR = (value) => value ? value.slice(8, 10) + "/" + value.slice(5, 7) + "/" + value.slice(0, 4) : "—";
const monthBR = (value) => value ? new Date(value + "T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" }) : "—";

function Indicador({ label, value, icon: Icon, hint }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between text-sm font-medium text-slate-500">
      {label}<Icon className="h-4 w-4 text-slate-400" />
    </div>
    <div className="mt-3 text-2xl font-semibold tabular-nums text-slate-900">{brl(value)}</div>
    {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
  </div>;
}

export default function FluxoCaixaBackOfficePage() {
  const { user } = useAuth();
  const [resumo, setResumo] = useState([]);
  const [uploads, setUploads] = useState([]);
  const [conta, setConta] = useState("todas");
  const [ano, setAno] = useState(String(new Date().getFullYear()));
  const [pagina, setPagina] = useState(0);
  const [lancamentos, setLancamentos] = useState([]);
  const [quantidade, setQuantidade] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [carregandoLancamentos, setCarregandoLancamentos] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    if (!user?.id) return;
    let ativo = true;
    async function buscarResumo() {
      setCarregando(true);
      setErro("");
      try {
        const [resultadoResumo, resultadoUploads] = await Promise.all([
          supabase.from("financeiro_fluxo_mensal")
            .select("mes,banco,conta,lancamentos,entradas_brutas,saidas_brutas,movimento_liquido,aplicacoes,resgates,linhas_saldo_informativo")
            .order("mes", { ascending: false }).limit(1000),
          supabase.from("financeiro_extratos_uploads").select("id,status,banco,conta"),
        ]);
        if (resultadoResumo.error) throw resultadoResumo.error;
        if (resultadoUploads.error) throw resultadoUploads.error;
        if (!ativo) return;
        setResumo(resultadoResumo.data || []);
        setUploads(resultadoUploads.data || []);
      } catch (error) {
        if (ativo) setErro("Não foi possível carregar o fluxo de caixa: " + error.message);
      } finally {
        if (ativo) setCarregando(false);
      }
    }
    void buscarResumo();
    return () => { ativo = false; };
  }, [user?.id]);

  const contas = useMemo(() => [...new Set([
    ...resumo.map((r) => r.banco + "|" + r.conta),
    ...uploads.map((r) => r.banco + "|" + r.conta),
  ])].sort(), [resumo, uploads]);

  const anos = useMemo(() => [...new Set([
    String(new Date().getFullYear()),
    ...resumo.map((r) => r.mes.slice(0, 4)),
  ])].sort((a, b) => b.localeCompare(a)), [resumo]);

  const resumoFiltrado = useMemo(() => resumo.filter((r) =>
    r.mes.startsWith(ano) && (conta === "todas" || r.banco + "|" + r.conta === conta)
  ), [resumo, ano, conta]);

  const totais = useMemo(() => resumoFiltrado.reduce((acc, r) => {
    acc.credito += Number(r.entradas_brutas || 0);
    acc.debito += Number(r.saidas_brutas || 0);
    acc.liquido += Number(r.movimento_liquido || 0);
    acc.aplicacoes += Number(r.aplicacoes || 0);
    acc.resgates += Number(r.resgates || 0);
    acc.registros += Number(r.lancamentos || 0);
    return acc;
  }, { credito: 0, debito: 0, liquido: 0, aplicacoes: 0, resgates: 0, registros: 0 }), [resumoFiltrado]);

  const meses = useMemo(() => {
    const map = new Map();
    for (const r of resumoFiltrado) {
      const atual = map.get(r.mes) || { mes: r.mes, entradas: 0, saidas: 0, liquido: 0, quantidade: 0 };
      atual.entradas += Number(r.entradas_brutas || 0);
      atual.saidas += Number(r.saidas_brutas || 0);
      atual.liquido += Number(r.movimento_liquido || 0);
      atual.quantidade += Number(r.lancamentos || 0);
      map.set(r.mes, atual);
    }
    return [...map.values()].sort((a, b) => b.mes.localeCompare(a.mes));
  }, [resumoFiltrado]);

  useEffect(() => {
    if (!user?.id) return;
    let ativo = true;
    async function buscarLancamentos() {
      setCarregandoLancamentos(true);
      try {
        let query = supabase.from("financeiro_lancamentos_bancarios")
          .select("id,data,banco,conta,historico,valor,natureza,fitid", { count: "exact" })
          .neq("natureza", "saldo_informativo")
          .gte("data", ano + "-01-01")
          .lte("data", ano + "-12-31")
          .order("data", { ascending: false })
          .order("id", { ascending: false })
          .range(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE - 1);
        if (conta !== "todas") {
          const sep = conta.indexOf("|");
          query = query.eq("banco", conta.slice(0, sep)).eq("conta", conta.slice(sep + 1));
        }
        const { data, count, error } = await query;
        if (error) throw error;
        if (ativo) { setLancamentos(data || []); setQuantidade(count || 0); }
      } catch (error) {
        if (ativo) { setLancamentos([]); setQuantidade(0); setErro("Erro ao consultar lançamentos: " + error.message); }
      } finally {
        if (ativo) setCarregandoLancamentos(false);
      }
    }
    void buscarLancamentos();
    return () => { ativo = false; };
  }, [user?.id, ano, conta, pagina]);

  const pendentes = uploads.filter((r) => r.status !== "processado").length;
  const temDados = totais.registros > 0;

  return <div className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7A6685]">Back Office / Financeiro</div>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Fluxo de Caixa</h1>
        <p className="mt-1 text-sm text-slate-500">Movimentações bancárias importadas no novo módulo financeiro.</p>
      </div>
      <Link to="/backoffice/financeiro/extratos-bancarios"
        className="inline-flex items-center gap-2 rounded-lg bg-[#43284F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5B3866]">
        <FileUp className="h-4 w-4" /> Extratos Bancários
      </Link>
    </div>

    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="text-sm font-medium text-slate-700">Ano
        <select value={ano} onChange={(e) => { setAno(e.target.value); setPagina(0); }}
          className="ml-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          {anos.map((a) => <option value={a} key={a}>{a}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Conta
        <select value={conta} onChange={(e) => { setConta(e.target.value); setPagina(0); }}
          className="ml-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option value="todas">Todas as contas</option>
          {contas.map((value) => <option key={value} value={value}>{value.replace("|", " · ")}</option>)}
        </select>
      </label>
      <div className="ml-auto text-xs text-slate-500">
        {num(totais.registros)} movimentos · {uploads.length} upload(s)
        {pendentes > 0 ? " · " + pendentes + " aguardando conclusão" : ""}
      </div>
    </div>

    {erro && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{erro}</p>}

    <div className="grid gap-4 md:grid-cols-3">
      <Indicador label="Entradas bancárias brutas" value={totais.credito} icon={ArrowUpRight} />
      <Indicador label="Saídas bancárias brutas" value={totais.debito} icon={ArrowDownRight} />
      <Indicador label="Movimento líquido" value={totais.liquido} icon={Wallet} />
    </div>

    <p className="text-xs text-slate-500">
      Valores bancários brutos, ainda sem conciliação com títulos. Aplicações ({brl(totais.aplicacoes)})
      e resgates ({brl(totais.resgates)}) estão segregados na base, mas incluídos nos totais bancários.
      Saldos informativos não são contabilizados como entradas ou saídas.
    </p>

    {temDados && (
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-5 py-4"><h2 className="font-semibold text-slate-900">Movimentação mês a mês</h2></div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3">Mês</th><th className="px-5 py-3 text-right">Entradas</th><th className="px-5 py-3 text-right">Saídas</th><th className="px-5 py-3 text-right">Líquido</th><th className="px-5 py-3 text-right">Movimentos</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {meses.map((m) => <tr key={m.mes}>
                <td className="px-5 py-3 capitalize text-slate-700">{monthBR(m.mes)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">{brl(m.entradas)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-slate-700">{brl(m.saidas)}</td>
                <td className={"px-5 py-3 text-right tabular-nums font-medium " + (m.liquido < 0 ? "text-red-700" : "text-green-700")}>{brl(m.liquido)}</td>
                <td className="px-5 py-3 text-right text-slate-600">{num(m.quantidade)}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </section>
    )}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div><h2 className="font-semibold text-slate-900">Lançamentos bancários</h2>
          <p className="mt-1 text-xs text-slate-500">Somente a nova base financeira · {num(quantidade)} lançamentos no filtro</p>
        </div>
        {carregandoLancamentos && <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />}
      </div>
      {carregando && !temDados ? (
        <p className="p-10 text-center text-sm text-slate-500">Carregando dados...</p>
      ) : !quantidade ? (
        <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
          <div className="mb-3 rounded-xl bg-[#F4F0F6] p-4"><Landmark className="h-6 w-6 text-[#6B1F87]" /></div>
          <h3 className="font-semibold text-slate-800">Nenhum lançamento processado neste filtro</h3>
          <p className="mt-2 max-w-md text-sm text-slate-500">Processe os OFXs na tela de Extratos Bancários. Os lançamentos antigos da Tesouraria não são utilizados aqui.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr><th className="px-5 py-3">Data</th><th className="px-5 py-3">Banco / Conta</th><th className="px-5 py-3">Histórico</th><th className="px-5 py-3">Natureza</th><th className="px-5 py-3 text-right">Entrada</th><th className="px-5 py-3 text-right">Saída</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {lancamentos.map((l) => <tr key={l.id} className="hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-3 text-slate-600">{dataBR(l.data)}</td>
                <td className="whitespace-nowrap px-5 py-3 text-slate-600">{l.banco} · {l.conta}</td>
                <td className="max-w-sm truncate px-5 py-3 text-slate-800" title={l.historico}>{l.historico}</td>
                <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-500">{({
                  movimento: "Movimento", aplicacao: "Aplicação", resgate: "Resgate", rendimento: "Rendimento",
                })[l.natureza] || l.natureza}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-green-700">{Number(l.valor) > 0 ? brl(l.valor) : "—"}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right tabular-nums text-red-700">{Number(l.valor) < 0 ? brl(-Number(l.valor)) : "—"}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-xs text-slate-500">
        <span>Página {pagina + 1} de {Math.max(1, Math.ceil(quantidade / PAGE_SIZE))}</span>
        <div className="flex gap-2">
          <button type="button" disabled={pagina === 0 || carregandoLancamentos}
            onClick={() => setPagina(Math.max(0, pagina - 1))}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 disabled:opacity-40"><ArrowLeft className="h-3 w-3" /> Anterior</button>
          <button type="button" disabled={(pagina + 1) * PAGE_SIZE >= quantidade || carregandoLancamentos}
            onClick={() => setPagina(pagina + 1)}
            className="flex items-center gap-1 rounded-md border border-slate-200 px-3 py-2 disabled:opacity-40">Próxima <ArrowRight className="h-3 w-3" /></button>
        </div>
      </div>
    </section>
  </div>;
}
