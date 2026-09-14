import React, { useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Filter,
  Layers3,
  Loader2,
  MapPin,
  PackageSearch,
  Search,
  Smartphone,
  Tags,
  Warehouse,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useNavigate, useSearchParams } from "react-router-dom";

import {
  fetchEstoqueAgingDetalhe,
  fetchEstoqueAgingResumoSku,
} from "../../services/assurantIndicadoresService";

const FAIXAS_AGING = [
  "Até 30 dias",
  "31 a 60 dias",
  "61 a 90 dias",
  "91 a 180 dias",
  "Mais de 180 dias",
];

const PAGE_SIZE = 50;
const SEM_IDENTIFICACAO = "SEM IDENTIFICAÇÃO";

function formatarNumero(valor) {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  return new Intl.NumberFormat("pt-BR").format(Number(valor));
}

function formatarDecimal(valor, casas = 1) {
  if (valor == null || Number.isNaN(Number(valor))) return "—";

  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  }).format(Number(valor));
}

function formatarPercentual(valor, casas = 1) {
  if (valor == null || Number.isNaN(Number(valor))) return "—";
  return `${formatarDecimal(valor, casas)}%`;
}

function formatarData(data) {
  if (!data) return "—";

  const valor = new Date(data);
  if (Number.isNaN(valor.getTime())) return "—";

  return new Intl.DateTimeFormat("pt-BR").format(valor);
}

function normalizarTexto(texto) {
  return String(texto || "").trim().toUpperCase();
}

function badgeGrade(grade) {
  const valor = normalizarTexto(grade);

  if (valor === "LIKE NEW") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (valor === "EXCELENTE") return "border-sky-200 bg-sky-50 text-sky-700";
  if (valor === "MUITO BOM") return "border-blue-200 bg-blue-50 text-blue-700";
  if (valor === "BOM") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (valor === "REGULAR") return "border-amber-200 bg-amber-50 text-amber-700";
  if (valor === "QUEBRADO") return "border-rose-200 bg-rose-50 text-rose-700";
  if (valor.includes("OUTLET")) return "border-orange-200 bg-orange-50 text-orange-700";

  return "border-slate-200 bg-slate-50 text-slate-600";
}

function classeAging(dias) {
  const valor = Number(dias || 0);

  if (valor > 180) return "text-rose-700";
  if (valor > 90) return "text-orange-700";
  if (valor > 60) return "text-amber-700";
  return "text-slate-700";
}

function construirEndereco(item) {
  if (item?.endereco_wms) return item.endereco_wms;

  const partes = [];

  if (item?.rua != null) partes.push(`RUA ${item.rua}`);
  if (item?.bloco != null) partes.push(`B${item.bloco}`);
  if (item?.andar != null) partes.push(`A${item.andar}`);

  if (item?.coluna) {
    partes.push(`AP${item.coluna}${String(item?.linha || "").padStart(2, "0")}`);
  }

  return partes.join(" · ") || "—";
}

function separarProduto(item) {
  const marca = normalizarTexto(item?.marca) || SEM_IDENTIFICACAO;
  const modeloOriginal = normalizarTexto(item?.modelo);
  const capacidadeInformada = normalizarTexto(item?.capacidade);
  const corInformada = normalizarTexto(item?.cor);

  if (!modeloOriginal) {
    return {
      marca,
      modelo: "MODELO NÃO IDENTIFICADO",
      capacidade: capacidadeInformada || "—",
      cor: corInformada || "—",
      busca: marca === SEM_IDENTIFICACAO ? "" : marca,
      modeloOriginal: "",
    };
  }

  let descricao = modeloOriginal;

  if (marca !== SEM_IDENTIFICACAO && descricao.startsWith(`${marca} `)) {
    descricao = descricao.slice(marca.length).trim();
  }

  const matchCapacidade = descricao.match(/\b(\d+(?:[.,]\d+)?\s?(?:GB|TB))\b/i);

  let modelo = descricao;
  let capacidade = capacidadeInformada;
  let cor = corInformada;

  if (matchCapacidade) {
    const indice = matchCapacidade.index ?? -1;
    const fim = indice + matchCapacidade[0].length;

    modelo = descricao.slice(0, indice).trim();
    capacidade = normalizarTexto(matchCapacidade[1]).replace(/\s+/g, "");

    const corDoModelo = descricao.slice(fim).trim();
    if (corDoModelo) cor = corDoModelo;
  } else {
    if (capacidadeInformada) {
      modelo = modelo.replace(capacidadeInformada, "").trim();
    }

    if (corInformada && modelo.endsWith(corInformada)) {
      modelo = modelo.slice(0, -corInformada.length).trim();
    }
  }

  return {
    marca,
    modelo: modelo || "MODELO NÃO IDENTIFICADO",
    capacidade: capacidade || "—",
    cor: cor || "—",
    busca: modeloOriginal,
    modeloOriginal,
  };
}

function MetricStrip({ items }) {
  return (
    <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item, index) => (
        <div
          key={`${item.label}-${index}`}
          className="min-w-0 border-b border-slate-100 px-5 py-4 last:border-b-0 sm:border-r xl:border-b-0"
        >
          <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
            {item.label}
          </div>

          <div
            className={[
              "mt-2 text-2xl font-black tracking-tight",
              item.tone === "warning"
                ? "text-amber-700"
                : item.tone === "violet"
                  ? "text-violet-800"
                  : item.tone === "good"
                    ? "text-emerald-700"
                    : "text-slate-950",
            ].join(" ")}
          >
            {item.value}
          </div>

          <div className="mt-1 text-[10px] leading-4 text-slate-400">
            {item.description || "—"}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
            <Icon size={17} strokeWidth={1.8} />
          </div>
        )}

        <div>
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
          {description && (
            <p className="mt-1 max-w-3xl text-[10px] leading-4 text-slate-400">
              {description}
            </p>
          )}
        </div>
      </div>

      {action}
    </div>
  );
}

function EmptyState({ titulo, descricao, compact = false }) {
  return (
    <div
      className={[
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 px-8 text-center",
        compact ? "min-h-[180px]" : "min-h-[280px]",
      ].join(" ")}
    >
      <PackageSearch size={32} className="text-slate-300" />
      <h3 className="mt-4 text-sm font-black text-slate-700">{titulo}</h3>
      <p className="mt-2 max-w-md text-xs leading-5 text-slate-500">{descricao}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;

  const item = payload[0]?.payload || {};

  return (
    <div className="min-w-[190px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl">
      <div className="text-[10px] font-black text-slate-800">{label}</div>
      <div className="mt-2 space-y-1 text-[10px]">
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Aparelhos</span>
          <strong className="text-slate-900">{formatarNumero(item.aparelhos)}</strong>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-slate-500">Aging médio</span>
          <strong className="text-slate-900">{formatarDecimal(item.aging, 1)} dias</strong>
        </div>
      </div>
    </div>
  );
}

export default function EstoqueAgingDetalheV2Page() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const faixaInicial = searchParams.get("faixa") || "Mais de 180 dias";

  const [faixa, setFaixa] = useState(
    FAIXAS_AGING.includes(faixaInicial) ? faixaInicial : "Mais de 180 dias"
  );
  const [resumoSkus, setResumoSkus] = useState([]);
  const [detalhes, setDetalhes] = useState({
    itens: [],
    total: 0,
    pagina: 1,
    tamanhoPagina: PAGE_SIZE,
    totalPaginas: 1,
  });
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingDetalhes, setLoadingDetalhes] = useState(true);
  const [erro, setErro] = useState("");
  const [grade, setGrade] = useState("");
  const [pagina, setPagina] = useState(1);
  const [buscaDigitada, setBuscaDigitada] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [marcaSelecionada, setMarcaSelecionada] = useState("");
  const [produtoSelecionadoKey, setProdutoSelecionadoKey] = useState("");

  useEffect(() => {
    const faixaUrl = searchParams.get("faixa");
    if (faixaUrl && FAIXAS_AGING.includes(faixaUrl) && faixaUrl !== faixa) {
      setFaixa(faixaUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    async function carregarResumo() {
      try {
        setLoadingResumo(true);
        setErro("");

        const linhas = await fetchEstoqueAgingResumoSku({
          faixa,
          limite: null,
        });

        setResumoSkus(Array.isArray(linhas) ? linhas : []);
      } catch (error) {
        console.error(error);
        setErro(error?.message || "Não foi possível carregar a composição do aging.");
      } finally {
        setLoadingResumo(false);
      }
    }

    carregarResumo();
  }, [faixa]);

  const marcas = useMemo(() => {
    const mapa = new Map();

    resumoSkus.forEach((linha) => {
      const produto = separarProduto(linha);
      const aparelhos = Number(linha.aparelhos || 0);
      const aging = Number(linha.aging_medio_dias || 0);

      if (!mapa.has(produto.marca)) {
        mapa.set(produto.marca, {
          marca: produto.marca,
          aparelhos: 0,
          agingPonderado: 0,
          skus: new Set(),
          modelos: new Set(),
        });
      }

      const atual = mapa.get(produto.marca);
      atual.aparelhos += aparelhos;
      atual.agingPonderado += aging * aparelhos;
      if (linha.sku) atual.skus.add(linha.sku);
      atual.modelos.add(`${produto.modelo}|${produto.capacidade}|${produto.cor}`);
    });

    return Array.from(mapa.values())
      .map((item) => ({
        marca: item.marca,
        aparelhos: item.aparelhos,
        aging: item.aparelhos ? item.agingPonderado / item.aparelhos : 0,
        skus: item.skus.size,
        modelos: item.modelos.size,
      }))
      .sort((a, b) => b.aparelhos - a.aparelhos);
  }, [resumoSkus]);

  const modelos = useMemo(() => {
    const mapa = new Map();

    resumoSkus.forEach((linha) => {
      const produto = separarProduto(linha);

      if (marcaSelecionada && produto.marca !== marcaSelecionada) return;

      const chave = `${produto.marca}|${produto.modelo}|${produto.capacidade}|${produto.cor}`;
      const aparelhos = Number(linha.aparelhos || 0);
      const aging = Number(linha.aging_medio_dias || 0);

      if (!mapa.has(chave)) {
        mapa.set(chave, {
          key: chave,
          marca: produto.marca,
          modelo: produto.modelo,
          capacidade: produto.capacidade,
          cor: produto.cor,
          aparelhos: 0,
          agingPonderado: 0,
          grades: new Set(),
          skus: new Set(),
          busca: produto.busca,
          modeloOriginal: produto.modeloOriginal,
        });
      }

      const atual = mapa.get(chave);
      atual.aparelhos += aparelhos;
      atual.agingPonderado += aging * aparelhos;
      if (linha.grade) atual.grades.add(normalizarTexto(linha.grade));
      if (linha.sku) atual.skus.add(linha.sku);
      if (!atual.busca && produto.busca) atual.busca = produto.busca;
    });

    return Array.from(mapa.values())
      .map((item) => ({
        ...item,
        aging: item.aparelhos ? item.agingPonderado / item.aparelhos : 0,
        gradesLista: Array.from(item.grades),
        skusLista: Array.from(item.skus),
        label: `${item.modelo} · ${item.capacidade} · ${item.cor}`,
      }))
      .sort((a, b) => b.aparelhos - a.aparelhos);
  }, [resumoSkus, marcaSelecionada]);

  const produtoSelecionado = useMemo(
    () => modelos.find((item) => item.key === produtoSelecionadoKey) || null,
    [modelos, produtoSelecionadoKey]
  );

  const filtroDetalhe = useMemo(() => {
    if (buscaAplicada) return buscaAplicada;
    if (produtoSelecionado?.busca) return produtoSelecionado.busca;
    if (marcaSelecionada && marcaSelecionada !== SEM_IDENTIFICACAO) return marcaSelecionada;
    return "";
  }, [buscaAplicada, produtoSelecionado, marcaSelecionada]);

  useEffect(() => {
    async function carregarDetalhes() {
      try {
        setLoadingDetalhes(true);
        setErro("");

        const resposta = await fetchEstoqueAgingDetalhe({
          faixa,
          busca: filtroDetalhe,
          grade,
          pagina,
          tamanhoPagina: PAGE_SIZE,
        });

        setDetalhes(
          resposta || {
            itens: [],
            total: 0,
            pagina: 1,
            tamanhoPagina: PAGE_SIZE,
            totalPaginas: 1,
          }
        );
      } catch (error) {
        console.error(error);
        setErro(error?.message || "Não foi possível carregar a composição física.");
      } finally {
        setLoadingDetalhes(false);
      }
    }

    carregarDetalhes();
  }, [faixa, filtroDetalhe, grade, pagina]);

  const gradesDisponiveis = useMemo(
    () =>
      Array.from(
        new Set(resumoSkus.map((item) => normalizarTexto(item.grade)).filter(Boolean))
      ).sort(),
    [resumoSkus]
  );

  const totalAparelhos = useMemo(
    () => resumoSkus.reduce((soma, item) => soma + Number(item.aparelhos || 0), 0),
    [resumoSkus]
  );

  const agingMedio = useMemo(() => {
    if (!totalAparelhos) return 0;

    const ponderado = resumoSkus.reduce(
      (soma, item) =>
        soma + Number(item.aparelhos || 0) * Number(item.aging_medio_dias || 0),
      0
    );

    return ponderado / totalAparelhos;
  }, [resumoSkus, totalAparelhos]);

  const totalModelos = useMemo(() => {
    const chaves = new Set();

    resumoSkus.forEach((item) => {
      const produto = separarProduto(item);
      chaves.add(`${produto.marca}|${produto.modelo}|${produto.capacidade}|${produto.cor}`);
    });

    return chaves.size;
  }, [resumoSkus]);

  const marcaDominante = marcas[0] || null;
  const participacaoMarcaDominante =
    totalAparelhos > 0 && marcaDominante
      ? (marcaDominante.aparelhos / totalAparelhos) * 100
      : 0;

  const dadosMarcasGrafico = useMemo(() => marcas.slice(0, 12), [marcas]);
  const dadosModelosGrafico = useMemo(() => modelos.slice(0, 12), [modelos]);

  function trocarFaixa(novaFaixa) {
    setFaixa(novaFaixa);
    setMarcaSelecionada("");
    setProdutoSelecionadoKey("");
    setBuscaDigitada("");
    setBuscaAplicada("");
    setGrade("");
    setPagina(1);

    const params = new URLSearchParams(searchParams);
    params.set("faixa", novaFaixa);
    setSearchParams(params);
  }

  function selecionarMarca(marca) {
    setMarcaSelecionada(marca);
    setProdutoSelecionadoKey("");
    setBuscaDigitada("");
    setBuscaAplicada("");
    setPagina(1);
  }

  function selecionarModelo(item) {
    setMarcaSelecionada(item.marca);
    setProdutoSelecionadoKey(item.key);
    setBuscaDigitada("");
    setBuscaAplicada("");
    setPagina(1);
  }

  function limparSelecaoAnalitica() {
    setMarcaSelecionada("");
    setProdutoSelecionadoKey("");
    setPagina(1);
  }

  function aplicarBusca(event) {
    event?.preventDefault?.();
    setBuscaAplicada(buscaDigitada.trim());
    setMarcaSelecionada("");
    setProdutoSelecionadoKey("");
    setPagina(1);
  }

  function limparFiltros() {
    setBuscaDigitada("");
    setBuscaAplicada("");
    setMarcaSelecionada("");
    setProdutoSelecionadoKey("");
    setGrade("");
    setPagina(1);
  }

  function abrirInteligencia(item) {
    if (!item?.sku) return;

    const params = new URLSearchParams();
    params.set("sku", item.sku);
    if (item.grade) params.set("grade", item.grade);
    if (item.imei) params.set("imei", item.imei);

    navigate(`/v2/assurant/indicadores/estoque/inteligencia?${params.toString()}`);
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1750px] px-4 py-5 lg:px-7">
        <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 px-5 py-5 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-slate-950"
              >
                <ArrowLeft size={15} />
                Voltar aos Indicadores
              </button>

              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <Warehouse size={21} />
                </div>

                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Stock Intelligence
                  </div>
                  <h1 className="mt-1 text-xl font-black tracking-tight text-slate-950">
                    Aging de Estoque
                  </h1>
                  <p className="mt-1 text-xs text-slate-400">
                    Leitura hierárquica por marca, modelo, capacidade, cor, grade e aparelho.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                Faixa atual
              </div>
              <div className="mt-1 text-sm font-black text-slate-950">{faixa}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-3">
            {FAIXAS_AGING.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => trocarFaixa(item)}
                className={[
                  "rounded-lg border px-3 py-2 text-[10px] font-black transition",
                  item === faixa
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                ].join(" ")}
              >
                {item}
              </button>
            ))}
          </div>
        </header>

        {erro && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs font-semibold text-rose-700">
            {erro}
          </div>
        )}

        <MetricStrip
          items={[
            {
              label: "Aparelhos",
              value: formatarNumero(totalAparelhos),
              description: "posição física da faixa",
              tone: "violet",
            },
            {
              label: "Marcas",
              value: formatarNumero(marcas.length),
              description: marcaDominante
                ? `${marcaDominante.marca} concentra ${formatarPercentual(participacaoMarcaDominante)}`
                : "sem concentração apurada",
            },
            {
              label: "Modelos",
              value: formatarNumero(totalModelos),
              description: "modelo + capacidade + cor",
            },
            {
              label: "Aging médio",
              value: `${formatarDecimal(agingMedio, 1)} dias`,
              description: "média ponderada da faixa",
              tone: agingMedio > 180 ? "warning" : undefined,
            },
          ]}
        />

        <div className="mt-6 grid gap-6 2xl:grid-cols-[0.8fr_1.2fr]">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader
              icon={Tags}
              title="Concentração por marca"
              description="Primeiro nível do drill-down. Clique em uma marca para enxergar somente os modelos dela."
              action={
                marcaSelecionada ? (
                  <button
                    type="button"
                    onClick={limparSelecaoAnalitica}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 hover:bg-slate-50"
                  >
                    Todas as marcas
                  </button>
                ) : null
              }
            />

            <div className="h-[390px] p-5">
              {loadingResumo ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-700" />
                </div>
              ) : dadosMarcasGrafico.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dadosMarcasGrafico}
                    layout="vertical"
                    margin={{ top: 5, right: 25, bottom: 5, left: 15 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="marca"
                      axisLine={false}
                      tickLine={false}
                      width={115}
                      tick={{ fontSize: 9, fill: "#64748B" }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="aparelhos"
                      name="Aparelhos"
                      fill="#0F172A"
                      radius={[0, 5, 5, 0]}
                      cursor="pointer"
                      onClick={(entry) => {
                        const valor = entry?.payload?.marca || entry?.marca;
                        if (valor) selecionarMarca(valor);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  titulo="Sem concentração por marca"
                  descricao="Não existem aparelhos consolidados para esta faixa de aging."
                  compact
                />
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-3">
              <div className="flex flex-wrap gap-2">
                {marcas.slice(0, 8).map((item) => (
                  <button
                    type="button"
                    key={item.marca}
                    onClick={() => selecionarMarca(item.marca)}
                    className={[
                      "rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition",
                      marcaSelecionada === item.marca
                        ? "border-violet-200 bg-violet-50 text-violet-700"
                        : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50",
                    ].join(" ")}
                  >
                    {item.marca} · {formatarNumero(item.aparelhos)}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <SectionHeader
              icon={Smartphone}
              title={marcaSelecionada ? `Modelos · ${marcaSelecionada}` : "Principais modelos"}
              description="Segundo nível do drill-down. Modelo comercial separado de capacidade e cor."
              action={
                produtoSelecionado ? (
                  <button
                    type="button"
                    onClick={() => {
                      setProdutoSelecionadoKey("");
                      setPagina(1);
                    }}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 hover:bg-slate-50"
                  >
                    Todos os modelos
                  </button>
                ) : null
              }
            />

            <div className="h-[390px] p-5">
              {loadingResumo ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-violet-700" />
                </div>
              ) : dadosModelosGrafico.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={dadosModelosGrafico}
                    layout="vertical"
                    margin={{ top: 5, right: 25, bottom: 5, left: 15 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                    <XAxis
                      type="number"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                    />
                    <YAxis
                      type="category"
                      dataKey="label"
                      axisLine={false}
                      tickLine={false}
                      width={245}
                      tick={{ fontSize: 8, fill: "#64748B" }}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="aparelhos"
                      name="Aparelhos"
                      fill="#6D28D9"
                      radius={[0, 5, 5, 0]}
                      cursor="pointer"
                      onClick={(entry) => {
                        const item = entry?.payload || entry;
                        if (item?.key) selecionarModelo(item);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  titulo="Sem modelos identificados"
                  descricao="A marca selecionada não possui modelos consolidados nesta faixa."
                  compact
                />
              )}
            </div>
          </section>
        </div>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={BarChart3}
            title="Ranking por modelo"
            description="A concentração deixa de ser lida por SKU e passa a ser apresentada por marca, modelo, capacidade e cor."
          />

          {loadingResumo ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet-700" />
            </div>
          ) : modelos.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px]">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">#</th>
                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Marca</th>
                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Modelo</th>
                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Capacidade</th>
                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Cor</th>
                    <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Grades</th>
                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Aparelhos</th>
                    <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Aging médio</th>
                    <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Ação</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {modelos.slice(0, 40).map((item, index) => (
                    <tr
                      key={item.key}
                      className={[
                        "transition hover:bg-slate-50/70",
                        produtoSelecionadoKey === item.key ? "bg-violet-50/50" : "",
                      ].join(" ")}
                    >
                      <td className="px-5 py-3 text-xs font-black text-slate-400">{index + 1}</td>
                      <td className="px-3 py-3 text-xs font-black text-slate-800">{item.marca}</td>
                      <td className="px-3 py-3 text-xs font-black text-slate-900">{item.modelo}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-600">{item.capacidade}</td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-600">{item.cor}</td>
                      <td className="px-3 py-3">
                        <div className="flex max-w-[310px] flex-wrap gap-1">
                          {item.gradesLista.length ? (
                            item.gradesLista.slice(0, 5).map((gradeItem) => (
                              <span
                                key={gradeItem}
                                className={`rounded-md border px-2 py-1 text-[8px] font-black ${badgeGrade(gradeItem)}`}
                              >
                                {gradeItem}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] text-slate-400">Sem grade</span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-black text-slate-900">
                        {formatarNumero(item.aparelhos)}
                      </td>
                      <td className="px-3 py-3 text-right text-xs font-black text-slate-700">
                        {formatarDecimal(item.aging, 1)} dias
                      </td>
                      <td className="px-5 py-3 text-right">
                        {item.marca === SEM_IDENTIFICACAO ? (
                          <span className="text-[9px] font-black uppercase text-amber-600">Dados a tratar</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => selecionarModelo(item)}
                            className="inline-flex items-center gap-1.5 text-[10px] font-black text-violet-700 hover:text-violet-900"
                          >
                            Ver estoque
                            <ArrowRight size={13} />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-5">
              <EmptyState
                titulo="Sem ranking por modelo"
                descricao="Não existem modelos consolidados para os filtros atuais."
              />
            </div>
          )}
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <SectionHeader
            icon={Boxes}
            title="Composição física"
            description={`${formatarNumero(detalhes.total)} aparelhos encontrados nos filtros atuais.`}
            action={
              marcaSelecionada || produtoSelecionado || buscaAplicada || grade ? (
                <button
                  type="button"
                  onClick={limparFiltros}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-500 hover:bg-slate-50"
                >
                  Limpar filtros
                </button>
              ) : null
            }
          />

          <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                {marcaSelecionada && (
                  <span className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-[10px] font-black text-violet-700">
                    Marca · {marcaSelecionada}
                  </span>
                )}
                {produtoSelecionado && (
                  <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[10px] font-black text-slate-600">
                    {produtoSelecionado.modelo} · {produtoSelecionado.capacidade} · {produtoSelecionado.cor}
                  </span>
                )}
                {marcaSelecionada === SEM_IDENTIFICACAO && (
                  <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700">
                    Itens sem identificação devem ser tratados na qualidade da base
                  </span>
                )}
              </div>

              <form onSubmit={aplicarBusca} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative min-w-[290px]">
                  <Search
                    size={14}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                  />
                  <input
                    value={buscaDigitada}
                    onChange={(event) => setBuscaDigitada(event.target.value)}
                    placeholder="IMEI, SKU, modelo, marca ou voucher"
                    className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-slate-400"
                  />
                </div>

                <select
                  value={grade}
                  onChange={(event) => {
                    setGrade(event.target.value);
                    setPagina(1);
                  }}
                  className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none focus:border-slate-400"
                >
                  <option value="">Todas as grades</option>
                  {gradesDisponiveis.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white"
                >
                  <Filter size={14} />
                  Filtrar
                </button>
              </form>
            </div>
          </div>

          {loadingDetalhes ? (
            <div className="flex min-h-[300px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-violet-700" />
            </div>
          ) : detalhes.itens?.length ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1450px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">IMEI</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Marca</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Modelo</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Capacidade</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Cor</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Grade</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Aging</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Entrada</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Subinventário</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">WMS</th>
                      <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Voucher</th>
                      <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Ação</th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {detalhes.itens.map((item) => {
                      const produto = separarProduto(item);

                      return (
                        <tr key={`${item.imei}-${item.sku}`} className="transition hover:bg-slate-50/70">
                          <td className="px-5 py-4 font-mono text-[10px] font-black text-slate-800">
                            {item.imei || "—"}
                          </td>
                          <td className="px-3 py-4 text-xs font-black text-slate-800">
                            {produto.marca}
                          </td>
                          <td className="px-3 py-4">
                            <div className="text-xs font-black text-slate-900">{produto.modelo}</div>
                            <div className="mt-1 font-mono text-[9px] font-semibold text-slate-400">
                              {item.sku || "SEM SKU"}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-xs font-semibold text-slate-600">
                            {produto.capacidade}
                          </td>
                          <td className="px-3 py-4 text-xs font-semibold text-slate-600">
                            {produto.cor}
                          </td>
                          <td className="px-3 py-4">
                            <span className={`rounded-lg border px-2 py-1 text-[9px] font-black ${badgeGrade(item.grade)}`}>
                              {item.grade || "SEM GRADE"}
                            </span>
                          </td>
                          <td className="px-3 py-4">
                            <div className={`text-xs font-black ${classeAging(item.dias_estoque)}`}>
                              {formatarNumero(item.dias_estoque)} dias
                            </div>
                            <div className="mt-1 text-[9px] text-slate-400">{item.faixa_aging || faixa}</div>
                          </td>
                          <td className="px-3 py-4 text-xs font-semibold text-slate-600">
                            {formatarData(item.data_subinv)}
                          </td>
                          <td className="px-3 py-4 text-xs font-black text-slate-700">
                            {item.local_subinv || "—"}
                          </td>
                          <td className="px-3 py-4 text-xs font-semibold text-slate-600">
                            <div className="flex items-center gap-1.5">
                              <MapPin size={12} className="text-slate-400" />
                              {construirEndereco(item)}
                            </div>
                          </td>
                          <td className="px-3 py-4 text-[10px] font-semibold text-slate-500">
                            {item.voucher || "—"}
                          </td>
                          <td className="px-5 py-4 text-right">
                            {item.sku ? (
                              <button
                                type="button"
                                onClick={() => abrirInteligencia(item)}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-black text-slate-700 transition hover:border-violet-200 hover:text-violet-700"
                              >
                                Analisar
                                <ArrowRight size={13} />
                              </button>
                            ) : (
                              <span className="text-[9px] font-black uppercase text-slate-300">Sem SKU</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-[10px] font-semibold text-slate-400">
                  Página {formatarNumero(detalhes.pagina)} de {formatarNumero(detalhes.totalPaginas)} · {formatarNumero(detalhes.total)} aparelhos
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pagina <= 1}
                    onClick={() => setPagina((atual) => Math.max(1, atual - 1))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft size={14} />
                    Anterior
                  </button>

                  <button
                    type="button"
                    disabled={pagina >= detalhes.totalPaginas}
                    onClick={() => setPagina((atual) => Math.min(detalhes.totalPaginas, atual + 1))}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Próxima
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="p-5">
              <EmptyState
                titulo="Nenhum aparelho encontrado"
                descricao="Revise marca, modelo, grade ou busca para esta faixa de aging."
              />
            </div>
          )}
        </section>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <Layers3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                Critério da análise
              </div>
              <p className="mt-1 max-w-6xl text-[10px] leading-5 text-slate-500">
                O aging agora é lido em camadas: faixa → marca → modelo → capacidade → cor → grade → aparelho. O SKU permanece como chave técnica para rastreabilidade e acesso à inteligência comercial, mas deixa de ser a principal dimensão de concentração do estoque.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
