import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  PackageSearch,
  Percent,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";
import {
  buscarDetalheMargemB2C,
  buscarMargemMensalB2C,
  buscarResumoMargemB2C,
} from "../../services/margemB2CService.js";

const GABRIEL_USER_ID = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function money(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function pct(v) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }) + "%";
}

function num(v) {
  return Number(v || 0).toLocaleString("pt-BR");
}

function data(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function Kpi({ label, value, sub, icon: Icon }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex min-w-0 items-start justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[10px] font-black uppercase tracking-[0.06em] text-slate-400">
            {label}
          </div>
          <div className="mt-2 whitespace-nowrap text-[clamp(1.3rem,1.55vw,1.9rem)] font-black leading-none tracking-[-0.035em] text-slate-900">
            {value}
          </div>
          {sub && (
            <div className="mt-2 truncate text-[11px] font-semibold leading-tight text-slate-500" title={sub}>
              {sub}
            </div>
          )}
        </div>
        <div className="shrink-0 rounded-xl bg-violet-50 p-2 text-violet-700">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function StatusMargem({ status }) {
  if (status === "margem_calculavel") {
    return (
      <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">
        COM MARGEM
      </span>
    );
  }

  const labels = {
    sem_imei_final: "SEM IMEI",
    sem_voucher_triagem: "SEM VOUCHER",
    sem_custo_historico: "SEM CUSTO",
  };

  return (
    <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700 ring-1 ring-amber-200">
      {labels[status] || "SEM MARGEM"}
    </span>
  );
}

export default function MargemB2CV2Page() {
  const { user } = useAuth();
  const agora = new Date();
  const anoAtual = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(agora)
  );
  const mesAtual = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      month: "numeric",
    }).format(agora)
  );

  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(mesAtual);
  const [resumo, setResumo] = useState(null);
  const [mensal, setMensal] = useState([]);
  const [detalhe, setDetalhe] = useState({ rows: [], total: 0 });
  const [status, setStatus] = useState("todos");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [pagina, setPagina] = useState(1);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  const porPagina = 50;
  const totalPaginas = Math.max(1, Math.ceil((detalhe.total || 0) / porPagina));

  async function carregarResumo() {
    const [r, m] = await Promise.all([
      buscarResumoMargemB2C({ ano, mes }),
      buscarMargemMensalB2C(ano),
    ]);
    setResumo(r);
    setMensal(m);
  }

  async function carregarDetalhe() {
    const d = await buscarDetalheMargemB2C({
      ano,
      mes,
      status,
      busca: buscaAplicada,
      pagina,
      porPagina,
    });
    setDetalhe(d);
  }

  async function carregarTudo() {
    setLoading(true);
    setErro("");
    try {
      await Promise.all([carregarResumo(), carregarDetalhe()]);
    } catch (e) {
      setErro(e.message || "Falha ao carregar margem B2C.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarTudo();
  }, [ano, mes, status, pagina, buscaAplicada]);

  const mensalMap = useMemo(() => {
    const map = new Map();
    for (const item of mensal) map.set(Number(item.mes), item);
    return map;
  }, [mensal]);

  function aplicarBusca(event) {
    event?.preventDefault();
    setPagina(1);
    setBuscaAplicada(busca.trim());
  }

  if (user?.id !== GABRIEL_USER_ID) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <div className="mt-3 font-bold text-slate-700">Acesso restrito</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-6 w-6 text-violet-700" />
            <h1 className="text-2xl font-black text-slate-900">Margem B2C</h1>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
              Acesso restrito
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Margem por aparelho vendido, ligada ao custo histórico do trade-in por IMEI + voucher.
          </p>
        </div>

        <button
          type="button"
          onClick={carregarTudo}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm hover:bg-slate-50"
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Atualizar
        </button>
      </div>

      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex items-center gap-2 text-sm font-black text-violet-900">
          <Percent className="h-4 w-4" />
          Fórmula atual
        </div>
        <div className="mt-1 text-sm font-semibold text-violet-800">
          Margem % = (Preço de Venda − Custo de Entrada) ÷ Preço de Venda × 100
        </div>
        <div className="mt-1 text-xs text-violet-700/80">
          Preço de Venda = valor unitário do item B2C. Custo de Entrada = VALOR TOTAL A PAGAR do trade-in.
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Ano</label>
          <select
            value={ano}
            onChange={(e) => { setAno(Number(e.target.value)); setPagina(1); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
          >
            {[2024, 2025, 2026].map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Mês</label>
          <select
            value={mes}
            onChange={(e) => { setMes(Number(e.target.value)); setPagina(1); }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700"
          >
            {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select>
        </div>

        <form onSubmit={aplicarBusca} className="min-w-[280px] flex-1">
          <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">Pesquisar</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Pedido, IMEI, voucher, NF, SKU..."
              className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </div>
        </form>

        <div className="flex rounded-xl bg-slate-100 p-1">
          {[["todos","Todos"],["com_margem","Com margem"],["sem_margem","Sem custo"]].map(([k,l]) => (
            <button
              key={k}
              type="button"
              onClick={() => { setStatus(k); setPagina(1); }}
              className={
                "rounded-lg px-3 py-1.5 text-xs font-bold " +
                (status === k ? "bg-white text-violet-700 shadow-sm" : "text-slate-500")
              }
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {erro && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {erro}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        <Kpi label="Receita vinculada" value={money(resumo?.receita_vinculada)} sub={num(resumo?.itens_com_margem) + " itens com custo"} icon={TrendingUp} />
        <Kpi label="Custo de entrada" value={money(resumo?.custo_entrada)} sub="VALOR TOTAL A PAGAR" icon={PackageSearch} />
        <Kpi label="Margem bruta" value={money(resumo?.margem_rs)} sub="Venda − custo de entrada" icon={CircleDollarSign} />
        <Kpi label="Margem %" value={pct(resumo?.margem_pct_ponderada)} sub="Ponderada pela receita" icon={Percent} />
        <Kpi label="Cobertura" value={pct(resumo?.cobertura_pct)} sub={num(resumo?.itens_com_margem) + " de " + num(resumo?.itens_faturados) + " itens"} icon={BarChart3} />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="text-sm font-black text-slate-800">Evolução mensal · {ano}</div>
          <div className="mt-0.5 text-xs text-slate-400">Margem calculada somente nos itens com custo histórico vinculado.</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">Mês</th>
                <th className="px-3 py-2 text-right">Itens</th>
                <th className="px-3 py-2 text-right">Cobertura</th>
                <th className="px-3 py-2 text-right">Receita</th>
                <th className="px-3 py-2 text-right">Custo</th>
                <th className="px-3 py-2 text-right">Margem R$</th>
                <th className="px-4 py-2 text-right">Margem %</th>
              </tr>
            </thead>
            <tbody>
              {MESES.map((label, i) => {
                const item = mensalMap.get(i + 1);
                return (
                  <tr
                    key={label}
                    onClick={() => { setMes(i + 1); setPagina(1); }}
                    className={"cursor-pointer border-t border-slate-100 hover:bg-violet-50/40 " + (mes === i + 1 ? "bg-violet-50/50" : "")}
                  >
                    <td className="px-4 py-2.5 font-bold text-slate-700">{label}/{ano}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{num(item?.itens_faturados)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-slate-700">{pct(item?.cobertura_pct)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{money(item?.receita_vinculada)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{money(item?.custo_entrada)}</td>
                    <td className="px-3 py-2.5 text-right font-bold text-slate-800">{money(item?.margem_rs)}</td>
                    <td className="px-4 py-2.5 text-right font-black text-slate-900">{pct(item?.margem_pct_ponderada)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div>
            <div className="text-sm font-black text-slate-800">Margem por item vendido</div>
            <div className="text-xs text-slate-400">{num(detalhe.total)} registros encontrados</div>
          </div>

          {resumo?.itens_sem_margem > 0 && (
            <div className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
              <AlertTriangle className="h-3.5 w-3.5" />
              {num(resumo.itens_sem_margem)} sem custo vinculado
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1500px] text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-3">Pedido / NF</th>
                <th className="px-3 py-3">Venda</th>
                <th className="px-3 py-3">Produto</th>
                <th className="px-3 py-3">IMEI</th>
                <th className="px-3 py-3">Voucher</th>
                <th className="px-3 py-3 text-right">Preço venda</th>
                <th className="px-3 py-3 text-right">Custo entrada</th>
                <th className="px-3 py-3 text-right">Margem R$</th>
                <th className="px-3 py-3 text-right">Margem %</th>
                <th className="px-3 py-3 text-right">Aging</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.rows.map((row) => (
                <tr key={row.pedido_item_id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                  <td className="px-4 py-3">
                    <div className="font-black text-slate-800">#{row.id_anymarket}</div>
                    <div className="mt-0.5 text-xs text-slate-400">NF {row.numero_nf || "—"} · {row.marketplace || "—"}</div>
                  </td>
                  <td className="px-3 py-3 text-xs font-semibold text-slate-600">{data(row.faturado_em)}</td>
                  <td className="max-w-[300px] px-3 py-3">
                    <div className="truncate font-semibold text-slate-700" title={row.titulo_produto || ""}>{row.titulo_produto || "—"}</div>
                    <div className="mt-0.5 text-xs text-slate-400">{row.sku_alocado || row.sku_produto || "—"} · {row.grade_alocada || row.grade_produto || "—"}</div>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs font-bold text-slate-700">{row.imei_final || "—"}</td>
                  <td className="px-3 py-3">
                    <div className="font-mono text-xs font-bold text-slate-700">{row.voucher_tradein || "—"}</div>
                    {row.data_tradein && <div className="mt-0.5 text-[10px] text-slate-400">{data(row.data_tradein)}</div>}
                  </td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-700">{money(row.preco_venda)}</td>
                  <td className="px-3 py-3 text-right font-semibold text-slate-700">{money(row.custo_entrada)}</td>
                  <td className="px-3 py-3 text-right font-black text-slate-900">{money(row.margem_rs)}</td>
                  <td className="px-3 py-3 text-right font-black text-slate-900">{pct(row.margem_pct)}</td>
                  <td className="px-3 py-3 text-right text-slate-600">{row.aging_ate_venda_dias == null ? "—" : row.aging_ate_venda_dias + "d"}</td>
                  <td className="px-4 py-3"><StatusMargem status={row.status_margem} /></td>
                </tr>
              ))}

              {!detalhe.rows.length && !loading && (
                <tr>
                  <td colSpan={11} className="px-4 py-14 text-center text-sm text-slate-400">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
          <div className="text-xs font-semibold text-slate-400">
            Página {pagina} de {totalPaginas}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pagina <= 1}
              onClick={() => setPagina((p) => Math.max(1, p - 1))}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={pagina >= totalPaginas}
              onClick={() => setPagina((p) => Math.min(totalPaginas, p + 1))}
              className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
