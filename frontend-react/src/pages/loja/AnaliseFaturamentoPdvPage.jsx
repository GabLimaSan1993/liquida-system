import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Download, FilterX, LoaderCircle, RefreshCw, TrendingUp } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const CORES_ANO = ["#A28DB5", "#5B7C9E", "#4D315C", "#C29E6A"];
const VAZIO = { ano: "", mes: "", categoria: "", sub_categoria: "", marca: "", modelo: "", vendedor: "", cidade: "", uf: "", incluir_devolvidos: false };
const DIMENSOES = [
  { titulo: "Linha de produto", chave: "categorias", filtro: "categoria" },
  { titulo: "Linha secundária", chave: "subcategorias", filtro: "sub_categoria" },
  { titulo: "Marca", chave: "marcas", filtro: "marca" },
  { titulo: "Modelo", chave: "modelos", filtro: "modelo" },
  { titulo: "Vendedor", chave: "vendedores", filtro: "vendedor" },
  { titulo: "Cidade do cliente", chave: "cidades", filtro: "cidade" },
  { titulo: "Estado do cliente", chave: "estados", filtro: "uf" },
];
const moeda = (valor) => Number(valor || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const numero = (valor) => Number(valor || 0).toLocaleString("pt-BR");
const compacto = (valor) => {
  const n = Number(valor || 0);
  return n >= 1e6 ? "R$ " + (n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi"
    : n >= 1000 ? "R$ " + (n / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil" : moeda(n);
};

function FiltroSelect({ titulo, valor, options, onChange, vazio = "Todos" }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titulo}</span>
      <select value={valor} onChange={(e) => onChange(e.target.value)}
        className="w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#765D81] focus:ring-1 focus:ring-[#765D81]">
        <option value="">{vazio}</option>
        {options.map((item) => <option key={String(item.value)} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  );
}

function CardKpi({ titulo, valor, extra }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
      <div className="text-xs text-slate-500">{titulo}</div>
      <div className="mt-2 text-xl font-bold tabular-nums tracking-tight text-slate-900 lg:text-2xl">{valor}</div>
      {extra && <div className="mt-1 text-xs text-slate-400">{extra}</div>}
    </div>
  );
}

function Ranking({ item, linhas = [], ativo, onSelect, total }) {
  const maximo = Math.max(...linhas.map((r) => Number(r.faturamento || 0)), 1);
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-bold text-slate-800">{item.titulo}</h2>
        <span className="text-[11px] text-slate-400">Faturamento</span>
      </div>
      <div className="max-h-[480px] overflow-y-auto">
        {!linhas.length && <p className="px-5 py-8 text-center text-sm text-slate-400">Sem vendas para os filtros selecionados.</p>}
        {linhas.map((linha, index) => {
          const valor = Number(linha.faturamento || 0);
          const selecionado = ativo === linha.chave;
          return (
            <button type="button" key={String(linha.chave)} onClick={() => onSelect(item.filtro, linha.chave)}
              title={"Filtrar por " + linha.nome}
              className={"w-full border-b border-slate-50 px-5 py-3 text-left transition last:border-0 hover:bg-slate-50 " + (selecionado ? "bg-[#F5F0F8]" : "")}>
              <div className="flex items-baseline gap-3">
                <span className="w-5 shrink-0 text-[11px] tabular-nums text-slate-400">{index + 1}</span>
                <span className="min-w-0 flex-1 break-words text-xs font-medium text-slate-700">{linha.nome}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-slate-900">{moeda(valor)}</span>
              </div>
              <div className="ml-8 mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-[#8B7199]" style={{ width: Math.max(0, valor / maximo * 100) + "%" }} />
              </div>
              <div className="ml-8 mt-1 flex justify-between text-[10px] text-slate-400">
                <span>{numero(linha.quantidade)} un.</span>
                <span>{total ? (valor / total * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "% do total" : "—"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default function AnaliseFaturamentoPdvPage() {
  const [filtros, setFiltros] = useState(VAZIO);
  const [dados, setDados] = useState(null);
  const [catalogo, setCatalogo] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [revisao, setRevisao] = useState(0);

  useEffect(() => {
    let cancelado = false;
    const timer = setTimeout(async () => {
      setCarregando(true);
      setErro("");
      const parametros = {
        p_ano: filtros.ano ? Number(filtros.ano) : null,
        p_mes: filtros.mes ? Number(filtros.mes) : null,
        p_categoria: filtros.categoria || null,
        p_sub_categoria: filtros.sub_categoria || null,
        p_marca: filtros.marca || null,
        p_modelo: filtros.modelo ? filtros.modelo.trim().toUpperCase() : null,
        p_vendedor: filtros.vendedor || null,
        p_cidade: filtros.cidade || null,
        p_uf: filtros.uf || null,
        p_incluir_devolvidos: filtros.incluir_devolvidos,
      };
      try {
        const { data, error } = await supabase.rpc("loja_pdv_curva", parametros);
        if (error) throw error;
        if (!cancelado) {
          setDados(data);
          setCatalogo((atual) => atual || data);
        }
      } catch (error) {
        if (!cancelado) setErro(error?.message || "Não foi possível consultar o faturamento.");
      } finally {
        if (!cancelado) setCarregando(false);
      }
    }, filtros.modelo ? 400 : 0);
    return () => { cancelado = true; clearTimeout(timer); };
  }, [filtros, revisao]);

  const alterar = (campo, valor) => setFiltros((atual) => ({ ...atual, [campo]: valor }));
  const selecionarRanking = (campo, valor) => setFiltros((atual) => ({ ...atual, [campo]: atual[campo] === valor ? "" : valor }));
  const lista = (tipo) => (catalogo?.[tipo] || []).map((item) => ({ value: item.chave, label: item.nome }));
  const anos = (catalogo?.anual || []).map((item) => ({ value: String(item.ano), label: String(item.ano) }));
  const meses = MESES.map((m, i) => ({ value: String(i + 1), label: m }));

  const serieMensal = useMemo(() => (dados?.mensal || []).map((r) => ({
    ...r, label: MESES[r.mes - 1] + "/" + String(r.ano).slice(-2), faturamento: Number(r.faturamento || 0),
  })), [dados]);

  const serieComparativa = useMemo(() => {
    const resultado = MESES.map((mes, i) => ({ mes, numero: i + 1 }));
    for (const item of dados?.mensal || []) {
      resultado[item.mes - 1]["ano" + item.ano] = Number(item.faturamento || 0);
    }
    return resultado;
  }, [dados]);
  const anosGrafico = useMemo(() => (dados?.anual || []).map((a) => a.ano), [dados]);
  const total = Number(dados?.total || 0);
  const filtrosAtivos = Object.entries(filtros).filter(([key, val]) => key === "incluir_devolvidos" ? Boolean(val) : Boolean(val)).length;

  function exportarCsv() {
    if (!dados) return;
    const linhas = [["Visão", "Descrição", "Valor (R$)", "Quantidade", "Registros"]];
    for (const item of dados.mensal || []) linhas.push(["Mês", String(item.ano) + "-" + String(item.mes).padStart(2, "0"), item.faturamento, item.quantidade, item.vendas]);
    for (const secao of DIMENSOES) {
      for (const item of dados[secao.chave] || []) linhas.push([secao.titulo, item.nome, item.faturamento, item.quantidade, item.vendas]);
    }
    const arquivo = "\uFEFF" + linhas.map((r) => r.map((v) => '"' + String(v ?? "").replace(/"/g, '""') + '"').join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([arquivo], { type: "text/csv;charset=utf-8;" }));
    const ancora = document.createElement("a");
    ancora.href = url;
    ancora.download = "curva_faturamento_loja_pdv.csv";
    ancora.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-[1450px] space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#765D81]">Loja / Inteligência comercial</div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Análise de faturamento</h1>
          <p className="mt-1.5 text-sm text-slate-500">Evolução de vendas e composição por produto, vendedor e cidade do cliente.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setRevisao((x) => x + 1)} disabled={carregando}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <RefreshCw size={14} /> Atualizar
          </button>
          <button type="button" disabled={!dados || carregando} onClick={exportarCsv}
            className="flex items-center gap-2 rounded-lg bg-[#43284F] px-3 py-2.5 text-xs font-semibold text-white hover:bg-[#2F1B39] disabled:opacity-40">
            <Download size={14} /> Exportar CSV
          </button>
        </div>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between gap-4">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Filtros</span>
          <button type="button" onClick={() => setFiltros(VAZIO)} className="flex items-center gap-1.5 text-xs font-semibold text-[#765D81] hover:underline">
            <FilterX size={14} /> Limpar {filtrosAtivos ? "(" + filtrosAtivos + ")" : ""}
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <FiltroSelect titulo="Ano" valor={filtros.ano} options={anos} onChange={(v) => alterar("ano", v)} vazio="Todos os anos" />
          <FiltroSelect titulo="Mês" valor={filtros.mes} options={meses} onChange={(v) => alterar("mes", v)} vazio="Todos os meses" />
          <FiltroSelect titulo="Linha de produto" valor={filtros.categoria} options={lista("categorias")} onChange={(v) => alterar("categoria", v)} />
          <FiltroSelect titulo="Linha secundária" valor={filtros.sub_categoria} options={lista("subcategorias")} onChange={(v) => alterar("sub_categoria", v)} />
          <FiltroSelect titulo="Marca" valor={filtros.marca} options={lista("marcas")} onChange={(v) => alterar("marca", v)} />
          <FiltroSelect titulo="Vendedor" valor={filtros.vendedor} options={lista("vendedores")} onChange={(v) => alterar("vendedor", v)} />
          <FiltroSelect titulo="Estado do cliente" valor={filtros.uf} options={lista("estados")} onChange={(v) => alterar("uf", v)} />
          <FiltroSelect titulo="Cidade do cliente" valor={filtros.cidade} options={lista("cidades")} onChange={(v) => alterar("cidade", v)} />
          <label className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Modelo (código do fabricante)</span>
            <input list="loja-pdv-modelos" value={filtros.modelo} onChange={(e) => alterar("modelo", e.target.value)}
              placeholder="Digite o código ou selecione um modelo"
              className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#765D81] focus:ring-1 focus:ring-[#765D81]" />
            <datalist id="loja-pdv-modelos">{(catalogo?.modelos || []).map((item) => <option key={item.chave} value={item.chave} />)}</datalist>
          </label>
          <label className="flex items-center gap-2 self-end rounded-lg border border-slate-200 px-3 py-2.5 text-xs text-slate-600 sm:col-span-2 lg:col-span-2">
            <input type="checkbox" checked={filtros.incluir_devolvidos} onChange={(e) => alterar("incluir_devolvidos", e.target.checked)}
              className="accent-[#765D81]" />
            Incluir produtos devolvidos no faturamento bruto
          </label>
        </div>
        <p className="mt-3 text-[11px] text-slate-400">Base por data de emissão e valor final. Notas pendentes e operações de devolução de compra não entram nos indicadores.</p>
      </section>

      {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{erro}</div>}
      {carregando && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle size={17} className="animate-spin" /> Atualizando indicadores...</div>}

      {dados && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <CardKpi titulo={filtros.incluir_devolvidos ? "Faturamento bruto" : "Faturamento"} valor={moeda(total)} extra="Soma do valor final" />
            <CardKpi titulo="Vendas / linhas" valor={numero(dados.vendas)} extra="Registros de venda considerados" />
            <CardKpi titulo="Unidades vendidas" valor={numero(dados.quantidade)} />
            <CardKpi titulo="Ticket médio por registro" valor={moeda(dados.vendas ? total / Number(dados.vendas) : 0)} />
          </div>

          <section className="grid gap-4 xl:grid-cols-2">
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="mb-5 flex items-center gap-2"><TrendingUp size={17} className="text-[#765D81]" /><h2 className="text-sm font-bold text-slate-800">Evolução mensal</h2></div>
              {serieMensal.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={serieMensal} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <defs><linearGradient id="pdv-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#765D81" stopOpacity={0.2} /><stop offset="100%" stopColor="#765D81" stopOpacity={0.01} /></linearGradient></defs>
                      <CartesianGrid stroke="#F0F1F4" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={compacto} width={80} tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => [moeda(v), "Faturamento"]} />
                      <Area dataKey="faturamento" type="monotone" stroke="#765D81" strokeWidth={2.5} fill="url(#pdv-area)" dot={false} activeDot={{ r: 4 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex h-72 items-center justify-center text-sm text-slate-400">Sem dados para o período.</div>}
            </div>
            <div className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 md:p-5">
              <div className="mb-5 flex items-center gap-2"><BarChart3 size={17} className="text-[#765D81]" /><h2 className="text-sm font-bold text-slate-800">Comparativo mês a mês entre anos</h2></div>
              {serieMensal.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={serieComparativa} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                      <CartesianGrid stroke="#F0F1F4" vertical={false} />
                      <XAxis dataKey="mes" tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                      <YAxis tickFormatter={compacto} width={80} tick={{ fontSize: 10, fill: "#94A3B8" }} tickLine={false} axisLine={false} />
                      <Tooltip formatter={(v) => moeda(v)} />
                      <Legend verticalAlign="bottom" height={28} wrapperStyle={{ fontSize: 11 }} />
                      {anosGrafico.map((ano, i) => <Line key={ano} type="monotone" dataKey={"ano" + ano} name={String(ano)}
                        stroke={CORES_ANO[i % CORES_ANO.length]} strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} connectNulls={false} />)}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              ) : <div className="flex h-72 items-center justify-center text-sm text-slate-400">Sem dados para o período.</div>}
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-bold text-slate-800">Consolidado por ano</h2></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500"><tr>
                <th className="px-5 py-3 font-medium">Ano</th><th className="px-5 py-3 text-right font-medium">Faturamento</th>
                <th className="px-5 py-3 text-right font-medium">Unidades</th><th className="px-5 py-3 text-right font-medium">Registros</th>
              </tr></thead>
              <tbody>
                {(dados.anual || []).map((a) => <tr key={a.ano} className="border-t border-slate-100">
                  <td className="px-5 py-3 font-semibold">{a.ano}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{moeda(a.faturamento)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{numero(a.quantidade)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{numero(a.vendas)}</td>
                </tr>)}
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                  <td className="px-5 py-3">Total</td><td className="px-5 py-3 text-right">{moeda(total)}</td>
                  <td className="px-5 py-3 text-right">{numero(dados.quantidade)}</td><td className="px-5 py-3 text-right">{numero(dados.vendas)}</td>
                </tr>
              </tbody>
            </table></div>
          </section>

          <div>
            <h2 className="mb-3 text-sm font-bold text-slate-800">Composição do faturamento</h2>
            <div className="grid gap-4 xl:grid-cols-2">
              {DIMENSOES.map((secao) => <Ranking key={secao.chave} item={secao} linhas={dados[secao.chave] || []}
                total={total} ativo={filtros[secao.filtro]} onSelect={selecionarRanking} />)}
            </div>
          </div>
          <p className="text-[11px] text-slate-400">Agrupamentos padronizados sem modificar o arquivo original. Modelo identificado pela descrição; quando indisponível, o SKU é usado como referência. Listas extensas exibem os principais grupos por faturamento.</p>
        </>
      )}
    </div>
  );
}
