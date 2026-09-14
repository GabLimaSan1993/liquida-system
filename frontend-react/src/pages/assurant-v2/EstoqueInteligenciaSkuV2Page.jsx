import React, { useEffect, useMemo, useState } from "react";

import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Gauge,
  Layers3,
  Loader2,
  PackageSearch,
  RefreshCw,
  ShoppingCart,
  Target,
  TrendingUp,
  Warehouse,
} from "lucide-react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useNavigate, useSearchParams } from "react-router-dom";

import { fetchPricingInteligenciaSku } from "../../services/assurantIndicadoresService.js";

function formatarNumero(valor, casas = 0) {
  if (valor == null || Number.isNaN(Number(valor))) return "—";

  return Number(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function formatarMoeda(valor) {
  if (valor == null || Number.isNaN(Number(valor))) return "Sem referência";

  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatarPercentual(valor, casas = 1) {
  if (valor == null || Number.isNaN(Number(valor))) return "Sem histórico";
  return `${formatarNumero(valor, casas)}%`;
}

function formatarData(valor) {
  if (!valor) return "Sem histórico";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "Sem histórico";
  return data.toLocaleDateString("pt-BR");
}

function formatarMes(valor) {
  if (!valor) return "—";

  const [ano, mes] = String(valor).slice(0, 10).split("-");
  const meses = [
    "",
    "Jan",
    "Fev",
    "Mar",
    "Abr",
    "Mai",
    "Jun",
    "Jul",
    "Ago",
    "Set",
    "Out",
    "Nov",
    "Dez",
  ];

  return `${meses[Number(mes)] || mes}/${String(ano).slice(-2)}`;
}

function normalizarTexto(valor) {
  return String(valor || "").trim().toUpperCase();
}

function classeGrade(grade) {
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

function classeAcao(acao) {
  const valor = normalizarTexto(acao);

  if (valor.includes("LIQUID")) return "border-rose-200 bg-rose-50 text-rose-700";
  if (valor.includes("ACELER")) return "border-amber-200 bg-amber-50 text-amber-700";
  if (valor.includes("PRESERV")) return "border-emerald-200 bg-emerald-50 text-emerald-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function origemLabel(origem, tipo) {
  const valor = normalizarTexto(origem);

  if (valor === "GRADE") return `${tipo} da própria grade`;
  if (valor === "PRODUTO") return `${tipo} recuperado do produto`;
  if (valor === "SEM GIRO") return "Sem histórico de giro";
  if (valor === "SEM PRECO") return "Sem referência de preço";

  return valor ? valor.replaceAll("_", " ") : `Sem ${tipo.toLowerCase()}`;
}

function obterResumo(resumo) {
  if (Array.isArray(resumo)) return resumo[0] || {};
  return resumo || {};
}

function valorCobertura(resumo) {
  if (resumo.cobertura_dias != null) {
    return `${formatarNumero(resumo.cobertura_dias, 1)} dias`;
  }

  if (Number(resumo.estoque_atual || 0) > 0) return "Sem giro";
  return "—";
}

function MetricCard({ label, value, detail, tone = "default" }) {
  const tones = {
    default: "text-slate-950",
    violet: "text-violet-800",
    good: "text-emerald-700",
    warning: "text-amber-700",
    danger: "text-rose-700",
  };

  return (
    <div className="min-w-0 border-b border-r border-slate-100 px-4 py-4 last:border-r-0 xl:border-b-0">
      <div className="text-[9px] font-black uppercase tracking-[0.11em] text-slate-400">
        {label}
      </div>
      <div className={`mt-1.5 truncate text-lg font-black tracking-tight ${tones[tone] || tones.default}`}>
        {value}
      </div>
      <div className="mt-1 truncate text-[9px] text-slate-400">{detail || "—"}</div>
    </div>
  );
}

function Section({ icon: Icon, eyebrow, title, description, action, children }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600">
              <Icon size={17} />
            </div>
          )}
          <div>
            {eyebrow && (
              <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
                {eyebrow}
              </div>
            )}
            <h2 className="mt-0.5 text-sm font-black text-slate-900">{title}</h2>
            {description && (
              <p className="mt-1 max-w-4xl text-[10px] leading-4 text-slate-400">
                {description}
              </p>
            )}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyState({ title, description, height = 260 }) {
  return (
    <div
      className="flex flex-col items-center justify-center px-6 text-center"
      style={{ minHeight: height }}
    >
      <PackageSearch size={32} className="text-slate-300" />
      <div className="mt-3 text-sm font-black text-slate-700">{title}</div>
      <div className="mt-1 max-w-lg text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

function ProductField({ label, value, mono = false }) {
  return (
    <div className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
        {label}
      </div>
      <div className={`mt-1 truncate text-sm font-black text-slate-900 ${mono ? "font-mono" : ""}`}>
        {value || "Não identificado"}
      </div>
    </div>
  );
}

export default function EstoqueInteligenciaSkuV2Page() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const sku = searchParams.get("sku") || "";
  const grade = searchParams.get("grade") || "";
  const imei = searchParams.get("imei") || "";

  const [marketplace, setMarketplace] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [dados, setDados] = useState({
    resumo: null,
    grades: [],
    canais: [],
    curvaMensal: [],
    historicoPrecos: [],
  });

  async function carregar() {
    if (!sku) {
      setErro("SKU não informado.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setErro("");

      const resposta = await fetchPricingInteligenciaSku({
        skuBase: sku,
        grade: grade || undefined,
        marketplace,
      });

      setDados(
        resposta || {
          resumo: null,
          grades: [],
          canais: [],
          curvaMensal: [],
          historicoPrecos: [],
        }
      );
    } catch (error) {
      console.error(error);
      setErro(error?.message || "Não foi possível carregar a inteligência comercial.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [sku, grade, marketplace]);

  const resumo = obterResumo(dados.resumo);
  const grades = Array.isArray(dados.grades) ? dados.grades : [];
  const canais = Array.isArray(dados.canais) ? dados.canais : [];
  const curvaMensal = Array.isArray(dados.curvaMensal) ? dados.curvaMensal : [];
  const historicoPrecos = Array.isArray(dados.historicoPrecos) ? dados.historicoPrecos : [];

  const modeloComercial =
    resumo.modelo_comercial ||
    String(resumo.modelo || "").split("·")[0]?.trim() ||
    "Produto não identificado";

  const capacidade =
    resumo.capacidade ||
    String(resumo.modelo || "").split("·")[1]?.trim() ||
    "Não identificada";

  const cor =
    resumo.cor ||
    String(resumo.modelo || "").split("·")[2]?.trim() ||
    "Não identificada";

  const marketplaces = useMemo(
    () =>
      Array.from(new Set(canais.map((item) => item.marketplace).filter(Boolean))).sort(),
    [canais]
  );

  const curvaGrafico = useMemo(
    () =>
      curvaMensal.map((item) => ({
        ...item,
        label: formatarMes(item.mes),
        saidas_liquidas_estimadas: Number(item.saidas_liquidas_estimadas || 0),
        preco_medio: item.preco_medio != null ? Number(item.preco_medio) : null,
        preco_mediano: item.preco_mediano != null ? Number(item.preco_mediano) : null,
      })),
    [curvaMensal]
  );

  const comparativoGrades = useMemo(
    () =>
      grades.map((item) => ({
        ...item,
        nome: item.grade || "SEM GRADE",
        estoque_atual: Number(item.estoque_atual || 0),
        saidas_liq_30d: Number(item.saidas_liq_30d || 0),
      })),
    [grades]
  );

  const chancesSaida = useMemo(
    () => [
      { janela: "7 dias", valor: resumo.chance_estimada_saida_7d_pct },
      { janela: "15 dias", valor: resumo.chance_estimada_saida_15d_pct },
      { janela: "30 dias", valor: resumo.chance_estimada_saida_30d_pct },
      { janela: "60 dias", valor: resumo.chance_estimada_saida_60d_pct },
    ],
    [resumo]
  );

  const agingCritico = Number(resumo.aging_medio_dias || 0) > 90;
  const coberturaCritica = Number(resumo.cobertura_dias || 0) > 60;
  const liquidezBaixa =
    resumo.score_liquidez != null && Number(resumo.score_liquidez) < 40;
  const possuiPreco = resumo.preco_recomendado != null;
  const possuiResumo = Boolean(resumo.sku_base);

  const leituraExecutiva = useMemo(() => {
    if (!possuiResumo) {
      return "Não existe consolidação suficiente para este produto na base atual.";
    }

    const partes = [
      `${formatarNumero(resumo.estoque_atual)} unidades em estoque`,
      `aging médio de ${formatarNumero(resumo.aging_medio_dias, 1)} dias`,
      `${formatarNumero(resumo.saidas_liq_30d)} saídas líquidas em 30 dias`,
    ];

    if (resumo.cobertura_dias != null) {
      partes.push(`cobertura estimada de ${formatarNumero(resumo.cobertura_dias, 1)} dias`);
    } else if (Number(resumo.estoque_atual || 0) > 0) {
      partes.push("sem giro suficiente para calcular cobertura");
    }

    if (resumo.preco_recomendado != null) {
      partes.push(`preço recomendado de ${formatarMoeda(resumo.preco_recomendado)}`);
    } else {
      partes.push("sem referência histórica suficiente para recomendação de preço");
    }

    return `${partes.join(", ")}. Ação recomendada: ${resumo.acao_recomendada || "MONITORAR"}.`;
  }, [possuiResumo, resumo]);

  function selecionarGrade(novaGrade) {
    const params = new URLSearchParams(searchParams);

    if (novaGrade) params.set("grade", novaGrade);
    else params.delete("grade");

    setSearchParams(params);
  }

  if (loading) {
    return (
      <div className="flex min-h-[560px] items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-700" />
          <div className="mt-3 text-sm font-black text-slate-700">
            Consolidando Stock Intelligence...
          </div>
          <div className="mt-1 text-xs text-slate-400">
            Produto, estoque, giro, aging e preço.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto w-full max-w-[1750px] px-5 py-6 lg:px-8">
        <header className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-5 px-5 py-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="mb-4 inline-flex items-center gap-2 text-xs font-bold text-slate-400 transition hover:text-slate-950"
              >
                <ArrowLeft size={15} />
                Voltar ao Aging
              </button>

              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-white">
                  <CircleDollarSign size={21} />
                </div>

                <div className="min-w-0">
                  <div className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">
                    Stock Intelligence
                  </div>
                  <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
                    {modeloComercial}
                  </h1>
                  <div className="mt-1 text-xs font-semibold text-slate-500">
                    {resumo.marca || "Marca não identificada"} · {capacidade} · {cor}
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {grade && (
                      <span
                        className={`inline-flex rounded-lg border px-2.5 py-1 text-[10px] font-black ${classeGrade(grade)}`}
                      >
                        {grade}
                      </span>
                    )}
                    <span className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-[10px] font-black text-slate-600">
                      SKU {sku}
                    </span>
                    {imei && (
                      <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-mono text-[10px] font-semibold text-slate-400">
                        IMEI {imei}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={marketplace}
                onChange={(event) => setMarketplace(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none transition focus:border-slate-400"
              >
                <option value="">Todos os canais</option>
                {marketplaces.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>

              <button
                type="button"
                onClick={carregar}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-600 transition hover:bg-slate-50"
              >
                <RefreshCw size={14} />
                Atualizar
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-t border-slate-100 bg-slate-50/60 p-4 sm:grid-cols-2 lg:grid-cols-5">
            <ProductField label="Marca" value={resumo.marca} />
            <ProductField label="Modelo" value={modeloComercial} />
            <ProductField label="Capacidade" value={capacidade} />
            <ProductField label="Cor" value={cor} />
            <ProductField label="SKU técnico" value={sku} mono />
          </div>
        </header>

        {erro && (
          <div className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-xs font-semibold text-rose-700">
            {erro}
          </div>
        )}

        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm sm:grid-cols-2 xl:grid-cols-6">
          <MetricCard
            label="Estoque atual"
            value={formatarNumero(resumo.estoque_atual)}
            detail={`${formatarNumero(resumo.estoque_mais_90_dias)} acima de 90d`}
            tone="violet"
          />
          <MetricCard
            label="Aging médio"
            value={
              resumo.aging_medio_dias == null
                ? "Sem aging"
                : `${formatarNumero(resumo.aging_medio_dias, 1)} dias`
            }
            detail={`${formatarNumero(resumo.aging_min_dias)}–${formatarNumero(resumo.aging_max_dias)} dias`}
            tone={agingCritico ? "danger" : "default"}
          />
          <MetricCard
            label="Saídas 30d"
            value={formatarNumero(resumo.saidas_liq_30d)}
            detail={`${formatarNumero(resumo.saidas_liq_90d)} em 90d · ${origemLabel(resumo.origem_giro, "Giro")}`}
            tone={Number(resumo.saidas_liq_30d || 0) > 0 ? "good" : "warning"}
          />
          <MetricCard
            label="Cobertura"
            value={valorCobertura(resumo)}
            detail={resumo.cobertura_dias == null ? "sem demanda observável" : "demanda ponderada"}
            tone={resumo.cobertura_dias == null || coberturaCritica ? "warning" : "default"}
          />
          <MetricCard
            label="Preço referência"
            value={formatarMoeda(resumo.preco_mediano_ref)}
            detail={origemLabel(resumo.origem_preco, "Preço")}
          />
          <MetricCard
            label="Preço recomendado"
            value={formatarMoeda(resumo.preco_recomendado)}
            detail={resumo.confianca_recomendacao || "Sem confiança"}
            tone={possuiPreco ? "violet" : "warning"}
          />
        </div>

        <div className="mt-6 grid gap-6 2xl:grid-cols-[1.35fr_0.65fr]">
          <div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-5 py-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="max-w-5xl">
                <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-700">
                  Leitura executiva
                </div>
                <p className="mt-1 text-xs leading-5 text-slate-700">{leituraExecutiva}</p>
              </div>
              <span
                className={`inline-flex w-fit shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.06em] ${classeAcao(
                  resumo.acao_recomendada
                )}`}
              >
                {resumo.acao_recomendada || "MONITORAR"}
              </span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 2xl:grid-cols-1">
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                Fonte do preço
              </div>
              <div className="mt-1 text-xs font-black text-slate-800">
                {origemLabel(resumo.origem_preco, "Preço")}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                Fonte do giro
              </div>
              <div className="mt-1 text-xs font-black text-slate-800">
                {origemLabel(resumo.origem_giro, "Giro")}
              </div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                Score liquidez
              </div>
              <div className={`mt-1 text-xs font-black ${liquidezBaixa ? "text-rose-700" : "text-slate-800"}`}>
                {formatarNumero(resumo.score_liquidez, 1)} / 100
              </div>
            </div>
          </div>
        </div>

        {grades.length > 0 && (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Condição cosmética
                </div>
                <div className="mt-1 text-sm font-black text-slate-900">
                  Navegue entre as grades do produto
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {grades.map((item) => {
                  const ativa = normalizarTexto(item.grade) === normalizarTexto(grade);
                  return (
                    <button
                      key={item.grade}
                      type="button"
                      onClick={() => selecionarGrade(item.grade)}
                      className={`rounded-lg border px-3 py-2 text-[10px] font-black transition ${
                        ativa
                          ? classeGrade(item.grade)
                          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      {item.grade || "SEM GRADE"} · {formatarNumero(item.estoque_atual)}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 grid gap-6 2xl:grid-cols-[1.35fr_0.65fr]">
          <Section
            icon={TrendingUp}
            eyebrow="Preço × Giro"
            title="Curva comercial"
            description="Preço realizado ao longo do tempo versus volume líquido de saída."
          >
            <div className="h-[390px] p-5">
              {curvaGrafico.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={curvaGrafico} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 9, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      yAxisId="preco"
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(valor) => `R$ ${formatarNumero(valor)}`}
                      width={75}
                    />
                    <YAxis
                      yAxisId="volume"
                      orientation="right"
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                      width={45}
                    />
                    <Tooltip
                      formatter={(value, name) => [
                        String(name).toLowerCase().includes("preço")
                          ? formatarMoeda(value)
                          : formatarNumero(value),
                        name,
                      ]}
                    />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Bar
                      yAxisId="volume"
                      dataKey="saidas_liquidas_estimadas"
                      name="Saídas líquidas"
                      fill="#DDD6FE"
                      radius={[4, 4, 0, 0]}
                    />
                    <Line
                      yAxisId="preco"
                      type="monotone"
                      dataKey="preco_mediano"
                      name="Preço mediano"
                      stroke="#6D28D9"
                      strokeWidth={2.8}
                      dot={{ r: 3 }}
                      connectNulls
                    />
                    <Line
                      yAxisId="preco"
                      type="monotone"
                      dataKey="preco_medio"
                      name="Preço médio"
                      stroke="#0F172A"
                      strokeWidth={1.8}
                      dot={false}
                      connectNulls
                    />
                    {possuiPreco && (
                      <ReferenceLine
                        yAxisId="preco"
                        y={Number(resumo.preco_recomendado)}
                        stroke="#059669"
                        strokeDasharray="6 4"
                        label={{
                          value: "Recomendado",
                          position: "insideTopRight",
                          fontSize: 9,
                          fill: "#059669",
                        }}
                      />
                    )}
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Curva específica da grade indisponível"
                  description={
                    normalizarTexto(resumo.origem_preco) === "PRODUTO"
                      ? "A recomendação foi recuperada pelo histórico do produto, mas esta grade ainda não possui uma série própria suficiente."
                      : "Não existem eventos suficientes para formar uma curva comercial neste recorte."
                  }
                  height={340}
                />
              )}
            </div>
          </Section>

          <Section
            icon={Target}
            eyebrow="Probabilidade"
            title="Chance estimada de saída"
            description="Quando não existe giro suficiente, a ausência é explicitada em vez de aparecer como null."
          >
            <div className="grid gap-3 p-5 sm:grid-cols-2 2xl:grid-cols-1">
              {chancesSaida.map((item) => {
                const semHistorico = item.valor == null;
                const largura = semHistorico
                  ? 0
                  : Math.min(100, Math.max(0, Number(item.valor || 0)));

                return (
                  <div key={item.janela} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="flex items-end justify-between gap-3">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                          {item.janela}
                        </div>
                        <div className={`mt-1 text-xl font-black ${semHistorico ? "text-slate-400" : "text-slate-950"}`}>
                          {formatarPercentual(item.valor)}
                        </div>
                      </div>
                      {semHistorico && (
                        <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black uppercase text-amber-700">
                          Sem giro
                        </span>
                      )}
                    </div>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
                      <div className="h-full rounded-full bg-violet-700" style={{ width: `${largura}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="mt-6 grid gap-6 2xl:grid-cols-[0.85fr_1.15fr]">
          <Section
            icon={Layers3}
            eyebrow="Produto"
            title="Comparativo entre grades"
            description="Estoque e giro por classificação cosmética do mesmo produto."
          >
            <div className="h-[330px] p-5">
              {comparativoGrades.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={comparativoGrades}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 9, fill: "#64748B" }}
                      axisLine={false}
                      tickLine={false}
                      interval={0}
                    />
                    <YAxis
                      tick={{ fontSize: 9, fill: "#94A3B8" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: "10px" }} />
                    <Bar dataKey="estoque_atual" name="Estoque" fill="#475569" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="saidas_liq_30d" name="Saídas 30d" fill="#10B981" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState
                  title="Sem comparação entre grades"
                  description="Este produto ainda não possui outras grades consolidadas."
                />
              )}
            </div>
          </Section>

          <Section
            icon={ShoppingCart}
            eyebrow="Canal"
            title="Performance por marketplace"
            description="Saída líquida e preço observado nos últimos 30 e 90 dias por canal."
          >
            {canais.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="px-5 py-3 text-left text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Marketplace
                      </th>
                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Saídas 30d
                      </th>
                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Saídas 90d
                      </th>
                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Preço médio
                      </th>
                      <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Mediana
                      </th>
                      <th className="px-5 py-3 text-right text-[9px] font-black uppercase tracking-[0.09em] text-slate-400">
                        Última saída
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {canais.map((item, index) => (
                      <tr key={`${item.marketplace}-${index}`} className="transition hover:bg-slate-50/70">
                        <td className="px-5 py-3 text-xs font-black text-slate-800">
                          {item.marketplace || "Sem canal"}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                          {formatarNumero(item.saidas_liq_30d)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                          {formatarNumero(item.saidas_liq_90d)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-semibold text-slate-600">
                          {item.preco_medio_90d == null ? "Sem referência" : formatarMoeda(item.preco_medio_90d)}
                        </td>
                        <td className="px-3 py-3 text-right text-xs font-black text-slate-800">
                          {item.preco_mediano_90d == null ? "Sem referência" : formatarMoeda(item.preco_mediano_90d)}
                        </td>
                        <td className="px-5 py-3 text-right text-xs font-medium text-slate-500">
                          {formatarData(item.ultima_saida_em)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="Sem performance específica por canal"
                description="Nenhum marketplace possui movimentação válida para este produto e grade no recorte selecionado."
              />
            )}
          </Section>
        </div>

        <div className="mt-6">
          <Section
            icon={CheckCircle2}
            eyebrow="Decisão"
            title="Base da recomendação"
            description="Sinais que sustentam a decisão comercial atual."
          >
            <div className="grid gap-5 p-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="flex items-start gap-3">
                <CalendarDays className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Última saída
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-800">
                    {formatarData(resumo.ultima_saida_em)}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {resumo.dias_desde_ultima_saida != null
                      ? `${formatarNumero(resumo.dias_desde_ultima_saida)} dias atrás`
                      : "Sem histórico da grade"}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <TrendingUp className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Demanda ponderada
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-800">
                    {Number(resumo.demanda_diaria_ponderada || 0) > 0
                      ? `${formatarNumero(resumo.demanda_diaria_ponderada, 3)}/dia`
                      : "Sem giro"}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {origemLabel(resumo.origem_giro, "Giro")}
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Warehouse className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Estoque envelhecido
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-800">
                    {formatarNumero(resumo.estoque_mais_180_dias)}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">acima de 180 dias</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Gauge className="mt-0.5 h-4 w-4 text-slate-400" />
                <div>
                  <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                    Confiança do preço
                  </div>
                  <div className="mt-1 text-sm font-black text-slate-800">
                    {resumo.confianca_recomendacao || "Sem confiança"}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">
                    {origemLabel(resumo.origem_preco, "Preço")}
                  </div>
                </div>
              </div>
            </div>
          </Section>
        </div>

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <div className="flex items-start gap-3">
            <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-500">
                Critério da inteligência
              </div>
              <p className="mt-1 max-w-6xl text-[10px] leading-5 text-slate-500">
                O produto é identificado por Marca, Modelo, Capacidade e Cor. A grade permanece como dimensão de condição cosmética. Quando uma grade não possui massa histórica suficiente, o sistema pode recuperar giro e referência de preço do mesmo produto, identificando explicitamente a origem. Quando nem o produto possui histórico adequado, a tela apresenta “Sem giro”, “Sem histórico” ou “Sem referência” em vez de null.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
