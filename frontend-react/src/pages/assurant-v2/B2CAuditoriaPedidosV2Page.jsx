import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Eye,
  Filter,
  Link2,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import { supabase } from "../../lib/supabase.js";

const ACTIVE_STATUSES = [
  "aguardando_alocacao",
  "aguardando_definicao_produto",
  "alocado",
  "em_picking",
  "em_analise",
  "embalado",
];

const STATUS_LABELS = {
  aguardando_alocacao: "Aguardando alocação",
  aguardando_definicao_produto: "Aguardando definição",
  alocado: "Alocado",
  em_picking: "Picking",
  em_analise: "Em análise",
  embalado: "Embalado",
  faturado: "Faturado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const SEVERITY_ORDER = {
  critical: 0,
  risk: 1,
  attention: 2,
  normal: 3,
};

function fmtNumber(value) {
  return Number(value || 0).toLocaleString("pt-BR");
}

function fmtDateTime(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtElapsed(minutes) {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  if (minutes < 60) return `${Math.max(0, Math.round(minutes))} min`;

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours < 24) return `${hours}h ${mins}m`;

  const days = Math.floor(hours / 24);
  const remHours = hours % 24;
  return `${days}d ${remHours}h`;
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function statusLabel(status) {
  if (!status) return "Não informado";
  return (
    STATUS_LABELS[status] ||
    String(status)
      .replaceAll("_", " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
  );
}

function stageStart(order) {
  switch (order.status) {
    case "aguardando_definicao_produto":
      return order.definicao_solicitada_em || order.criado_em;
    case "aguardando_alocacao":
      return order.criado_em;
    case "alocado":
    case "em_picking":
      return order.alocado_em || order.criado_em;
    case "em_analise":
      return order.analise_em || order.atualizado_em || order.criado_em;
    case "embalado":
      return order.embalado_em || order.atualizado_em || order.criado_em;
    default:
      return order.atualizado_em || order.criado_em;
  }
}

function minutesSince(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, (Date.now() - date.getTime()) / 60000);
}

function classifyOrder(order) {
  const elapsed = minutesSince(stageStart(order));
  const overall = minutesSince(order.criado_em);

  let riskAt = 120;
  let criticalAt = 240;
  let diagnosis = "Monitorar andamento";
  let stage = statusLabel(order.status);

  switch (order.status) {
    case "aguardando_definicao_produto":
      riskAt = 60;
      criticalAt = 120;
      diagnosis = "Definição de produto pendente";
      stage = "Definição do produto";
      break;
    case "aguardando_alocacao":
      riskAt = 60;
      criticalAt = 120;
      diagnosis = "Pedido ainda sem alocação";
      stage = "Alocação FIFO";
      break;
    case "alocado":
    case "em_picking":
      riskAt = 60;
      criticalAt = 120;
      diagnosis = order.bipado_em
        ? "Picking iniciado; aguardando próxima etapa"
        : "Alocado, ainda sem bipagem de picking";
      stage = "Picking";
      break;
    case "em_analise":
      riskAt = 60;
      criticalAt = 180;
      diagnosis = order.motivo_analise
        ? `Em análise: ${order.motivo_analise}`
        : "Pedido segregado em análise";
      stage = "Análise";
      break;
    case "embalado":
      riskAt = 45;
      criticalAt = 120;
      diagnosis = !order.emb_etiquetado
        ? "Embalado, mas etiqueta ainda não confirmada"
        : !order.numero_nf
          ? "Etiqueta concluída; aguardando NF"
          : "Embalado; aguardando faturamento/expedição";
      stage = "Pós-embalagem";
      break;
    default:
      break;
  }

  let severity = "normal";

  if (elapsed != null && elapsed >= criticalAt) severity = "critical";
  else if (elapsed != null && elapsed >= riskAt) severity = "risk";
  else if (elapsed != null && elapsed >= Math.max(30, riskAt * 0.5)) severity = "attention";

  if (overall != null && overall >= 480 && severity !== "critical") {
    severity = "risk";
  }

  return {
    elapsed,
    overall,
    diagnosis,
    stage,
    severity,
  };
}

function severityMeta(severity) {
  if (severity === "critical") {
    return {
      label: "Crítico",
      dot: "bg-rose-500",
      badge: "border-rose-200 bg-rose-50 text-rose-700",
      row: "bg-rose-50/30",
    };
  }

  if (severity === "risk") {
    return {
      label: "Em risco",
      dot: "bg-orange-500",
      badge: "border-orange-200 bg-orange-50 text-orange-700",
      row: "bg-orange-50/20",
    };
  }

  if (severity === "attention") {
    return {
      label: "Atenção",
      dot: "bg-amber-400",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      row: "",
    };
  }

  return {
    label: "Normal",
    dot: "bg-emerald-500",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-700",
    row: "",
  };
}

function statusClass(status) {
  if (["faturado", "concluido"].includes(status)) {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (["em_analise"].includes(status)) {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  if (["embalado"].includes(status)) {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (["alocado", "em_picking"].includes(status)) {
    return "border-violet-200 bg-violet-50 text-violet-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function SourcePill({ label, value, tone = "neutral" }) {
  const tones = {
    neutral: "border-slate-200 bg-slate-50 text-slate-600",
    good: "border-emerald-200 bg-emerald-50 text-emerald-700",
    warning: "border-amber-200 bg-amber-50 text-amber-700",
    violet: "border-violet-200 bg-violet-50 text-violet-700",
  };

  return (
    <div className={`rounded-lg border px-2.5 py-2 ${tones[tone] || tones.neutral}`}>
      <div className="text-[8px] font-black uppercase tracking-[0.1em] opacity-60">{label}</div>
      <div className="mt-0.5 max-w-[180px] truncate text-[10px] font-black">{value}</div>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, helper, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-100 text-slate-700",
    rose: "bg-rose-50 text-rose-700",
    orange: "bg-orange-50 text-orange-700",
    amber: "bg-amber-50 text-amber-700",
    violet: "bg-violet-50 text-violet-700",
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">{label}</div>
          <div className="mt-1 text-2xl font-black tracking-tight text-slate-950">{value}</div>
          <div className="mt-1 text-[10px] text-slate-400">{helper}</div>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}

export default function B2CAuditoriaPedidosV2Page() {
  const navigate = useNavigate();

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updatedAt, setUpdatedAt] = useState(null);
  const [search, setSearch] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");
  const [marketplaceFilter, setMarketplaceFilter] = useState("all");
  const [windowFilter, setWindowFilter] = useState("48h");

  async function loadOrders() {
    try {
      setLoading(true);
      setError("");

      const { data, error: queryError } = await supabase
        .from("pedidos_b2c")
        .select(`
          id,
          id_anymarket,
          marketplace,
          cliente,
          status,
          status_anymarket,
          data_pedido,
          data_de_pagamento,
          titulo_produto,
          sku_produto,
          sku_marketplace,
          grade_produto,
          codigo_de_rastreio,
          imei_alocado,
          imei_bipado,
          alocado_em,
          bipado_em,
          analise_em,
          motivo_analise,
          embalado_em,
          faturado_em,
          numero_nf,
          emb_nf_colada,
          emb_selado,
          emb_etiquetado,
          etapa_embalagem,
          definicao_solicitada_em,
          definicao_status,
          criado_em,
          atualizado_em,
          hora_corte
        `)
        .in("status", ACTIVE_STATUSES)
        .order("criado_em", { ascending: false })
        .limit(1500);

      if (queryError) throw queryError;

      const enriched = (data || []).map((order) => ({
        ...order,
        audit: classifyOrder(order),
      }));

      setOrders(enriched);
      setUpdatedAt(new Date());
    } catch (err) {
      console.error(err);
      setError(err?.message || "Não foi possível carregar a auditoria de pedidos.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadOrders();
  }, []);

  const marketplaces = useMemo(
    () => Array.from(new Set(orders.map((order) => order.marketplace).filter(Boolean))).sort(),
    [orders]
  );

  const filtered = useMemo(() => {
    const now = Date.now();
    const term = normalizeText(search);

    const maxAgeMinutes =
      windowFilter === "24h"
        ? 24 * 60
        : windowFilter === "48h"
          ? 48 * 60
          : windowFilter === "7d"
            ? 7 * 24 * 60
            : null;

    return orders
      .filter((order) => {
        if (maxAgeMinutes != null) {
          const created = new Date(order.criado_em).getTime();
          if (Number.isFinite(created) && (now - created) / 60000 > maxAgeMinutes) return false;
        }

        if (severityFilter !== "all" && order.audit.severity !== severityFilter) return false;
        if (marketplaceFilter !== "all" && order.marketplace !== marketplaceFilter) return false;

        if (!term) return true;

        return [
          order.id_anymarket,
          order.cliente,
          order.marketplace,
          order.titulo_produto,
          order.sku_produto,
          order.sku_marketplace,
          order.imei_alocado,
          order.imei_bipado,
          order.numero_nf,
          order.codigo_de_rastreio,
          order.status,
          order.status_anymarket,
          order.audit.diagnosis,
        ].some((value) => normalizeText(value).includes(term));
      })
      .sort((a, b) => {
        const severityDiff = SEVERITY_ORDER[a.audit.severity] - SEVERITY_ORDER[b.audit.severity];
        if (severityDiff !== 0) return severityDiff;
        return (b.audit.elapsed || 0) - (a.audit.elapsed || 0);
      });
  }, [orders, search, severityFilter, marketplaceFilter, windowFilter]);

  const metrics = useMemo(() => {
    const base = filtered;
    return {
      monitored: base.length,
      critical: base.filter((order) => order.audit.severity === "critical").length,
      risk: base.filter((order) => order.audit.severity === "risk").length,
      definition: base.filter((order) => order.status === "aguardando_definicao_produto").length,
      postPack: base.filter((order) => order.status === "embalado" && !order.faturado_em).length,
    };
  }, [filtered]);

  return (
    <div className="mx-auto max-w-[1800px] space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-slate-950 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white">
              Auditoria Privada
            </span>
            <span className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-violet-700">
              B2C · Torre de Controle
            </span>
          </div>

          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
            Auditoria de Pedidos
          </h1>
          <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
            Detecta pedidos que podem estar ficando para trás no fluxo interno. Nesta primeira versão, a leitura usa o Liquida System e o status do AnyMarket já gravado no pedido. As consultas diretas ao Mercado Livre e Magalu entram na próxima camada da mesma tela.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {updatedAt && (
            <div className="mr-2 text-right">
              <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">Atualizado</div>
              <div className="mt-0.5 text-xs font-black text-slate-700">
                {updatedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => navigate("/v2/assurant/b2c")}
            className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50"
          >
            Voltar aos pedidos
          </button>

          <button
            type="button"
            onClick={loadOrders}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-4 text-xs font-black text-white transition hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Atualizar
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard icon={ShoppingCart} label="Monitorados" value={fmtNumber(metrics.monitored)} helper="pedidos ativos no recorte" tone="violet" />
        <MetricCard icon={ShieldAlert} label="Críticos" value={fmtNumber(metrics.critical)} helper="tempo acima do limite provisório" tone="rose" />
        <MetricCard icon={AlertTriangle} label="Em risco" value={fmtNumber(metrics.risk)} helper="podem virar atraso" tone="orange" />
        <MetricCard icon={Clock3} label="Sem definição" value={fmtNumber(metrics.definition)} helper="produto ainda não resolvido" tone="amber" />
        <MetricCard icon={PackageCheck} label="Pós-embalagem" value={fmtNumber(metrics.postPack)} helper="embalados ainda sem faturamento" tone="slate" />
      </div>

      <div className="grid gap-3 lg:grid-cols-4">
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4">
          <div className="flex items-center gap-2 text-emerald-700">
            <ShieldCheck size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.08em]">Liquida System</span>
          </div>
          <div className="mt-2 text-sm font-black text-emerald-900">Conectado</div>
          <div className="mt-1 text-[10px] leading-4 text-emerald-700/70">Etapas, timestamps, NF, embalagem, IMEI e status interno.</div>
        </div>

        <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
          <div className="flex items-center gap-2 text-violet-700">
            <Link2 size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.08em]">AnyMarket</span>
          </div>
          <div className="mt-2 text-sm font-black text-violet-900">Status espelhado</div>
          <div className="mt-1 text-[10px] leading-4 text-violet-700/70">Já mostramos o status AnyMarket salvo no pedido. API direta entra na próxima etapa.</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Eye size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.08em]">Mercado Livre</span>
          </div>
          <div className="mt-2 text-sm font-black text-slate-800">API direta pendente</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">Estrutura visual já reservada para order + shipment.</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2 text-slate-500">
            <Eye size={16} />
            <span className="text-[10px] font-black uppercase tracking-[0.08em]">Magalu</span>
          </div>
          <div className="mt-2 text-sm font-black text-slate-800">API direta pendente</div>
          <div className="mt-1 text-[10px] leading-4 text-slate-400">Estrutura pronta para prazo, status, NF e entrega.</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex items-center gap-2">
            <Filter size={15} className="text-slate-400" />
            <div>
              <div className="text-xs font-black text-slate-800">Fila auditada</div>
              <div className="text-[10px] text-slate-400">Regras provisórias de risco baseadas no tempo parado por etapa.</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[250px]">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pedido, cliente, SKU, IMEI, NF..."
                className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-700 outline-none focus:border-violet-300"
              />
            </div>

            <select
              value={windowFilter}
              onChange={(event) => setWindowFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"
            >
              <option value="24h">Últimas 24h</option>
              <option value="48h">Últimas 48h</option>
              <option value="7d">Últimos 7 dias</option>
              <option value="all">Todos os ativos</option>
            </select>

            <select
              value={severityFilter}
              onChange={(event) => setSeverityFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"
            >
              <option value="all">Todas severidades</option>
              <option value="critical">Críticos</option>
              <option value="risk">Em risco</option>
              <option value="attention">Atenção</option>
              <option value="normal">Normal</option>
            </select>

            <select
              value={marketplaceFilter}
              onChange={(event) => setMarketplaceFilter(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none"
            >
              <option value="all">Todos os canais</option>
              {marketplaces.map((marketplace) => (
                <option key={marketplace} value={marketplace}>{marketplace}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="border-b border-rose-100 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex min-h-[360px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-7 w-7 animate-spin text-violet-700" />
              <div className="mt-3 text-xs font-black text-slate-600">Auditando pedidos ativos...</div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1650px] border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Risco</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Pedido</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Canal / Cliente</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Produto</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Marketplace direto</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">AnyMarket</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Liquida</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Etapa auditada</th>
                  <th className="px-3 py-3 text-right text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Parado há</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Diagnóstico</th>
                  <th className="px-3 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">NF / Etiqueta</th>
                  <th className="px-4 py-3 text-left text-[9px] font-black uppercase tracking-[0.08em] text-slate-400">Criado</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {filtered.length ? (
                  filtered.map((order) => {
                    const severity = severityMeta(order.audit.severity);
                    const directMarketplace = /mercado livre/i.test(order.marketplace || "")
                      ? "Meli · API pendente"
                      : /magazine|magalu/i.test(order.marketplace || "")
                        ? "Magalu · API pendente"
                        : "Canal · API pendente";

                    return (
                      <tr key={order.id} className={`${severity.row} transition hover:bg-violet-50/30`}>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${severity.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />
                            {severity.label}
                          </span>
                        </td>

                        <td className="px-3 py-3">
                          <div className="font-mono text-xs font-black text-slate-900">{order.id_anymarket || "—"}</div>
                          <div className="mt-1 text-[9px] font-semibold text-slate-400">{order.codigo_de_rastreio || "Sem rastreio"}</div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-xs font-black text-slate-800">{order.marketplace || "—"}</div>
                          <div className="mt-1 max-w-[200px] truncate text-[10px] text-slate-500">{order.cliente || "—"}</div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="max-w-[270px] truncate text-xs font-semibold text-slate-700">{order.titulo_produto || order.sku_produto || "—"}</div>
                          <div className="mt-1 font-mono text-[9px] text-slate-400">{order.sku_produto || order.sku_marketplace || "Sem SKU"} · {order.imei_alocado || "Sem IMEI"}</div>
                        </td>

                        <td className="px-3 py-3">
                          <SourcePill label="Fonte" value={directMarketplace} tone="warning" />
                        </td>

                        <td className="px-3 py-3">
                          <SourcePill label="AnyMarket" value={order.status_anymarket || "Sem status espelhado"} tone="violet" />
                        </td>

                        <td className="px-3 py-3">
                          <span className={`inline-flex rounded-lg border px-2.5 py-1.5 text-[10px] font-black ${statusClass(order.status)}`}>
                            {statusLabel(order.status)}
                          </span>
                        </td>

                        <td className="px-3 py-3 text-xs font-black text-slate-700">{order.audit.stage}</td>

                        <td className="px-3 py-3 text-right">
                          <div className="text-xs font-black text-slate-900">{fmtElapsed(order.audit.elapsed)}</div>
                          <div className="mt-1 text-[9px] text-slate-400">na etapa</div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="max-w-[280px] text-[10px] font-semibold leading-4 text-slate-600">{order.audit.diagnosis}</div>
                        </td>

                        <td className="px-3 py-3">
                          <div className="text-[10px] font-black text-slate-700">NF {order.numero_nf || "—"}</div>
                          <div className={`mt-1 text-[9px] font-bold ${order.emb_etiquetado ? "text-emerald-600" : "text-amber-600"}`}>
                            {order.emb_etiquetado ? "Etiqueta confirmada" : "Etiqueta não confirmada"}
                          </div>
                        </td>

                        <td className="px-4 py-3 whitespace-nowrap text-[10px] font-semibold text-slate-500">{fmtDateTime(order.criado_em)}</td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={12} className="px-6 py-14 text-center">
                      <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-400" />
                      <div className="mt-3 text-sm font-black text-slate-700">Nenhum pedido encontrado neste recorte</div>
                      <div className="mt-1 text-xs text-slate-400">Altere os filtros ou atualize a auditoria.</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-3 text-[9px] leading-4 text-slate-500 lg:flex-row lg:items-center lg:justify-between">
          <div>
            Os limites de risco desta primeira versão são heurísticos e servem para encontrar pedidos parados. Eles serão substituídos/ajustados pelos prazos reais do AnyMarket, Mercado Livre e Magalu quando os conectores diretos forem ativados.
          </div>
          <div className="shrink-0 font-black text-slate-600">{fmtNumber(filtered.length)} pedidos exibidos</div>
        </div>
      </div>
    </div>
  );
}
