import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  Boxes,
  CheckCircle2,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Clock3,
  FileSearch,
  FileText,
  Fingerprint,
  History,
  Loader2,
  MapPin,
  Package,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Tag,
  Truck,
  User,
  Warehouse,
  XCircle,
} from "lucide-react";

import { Navigate, useSearchParams } from "react-router-dom";

import { useAuth } from "../../AuthContext.jsx";
import { supabase } from "../../lib/supabase.js";

const OWNER_ID = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";

const TABS = [
  { id: "historico", label: "Histórico completo", icon: History },
  { id: "triagem", label: "Triagem", icon: ClipboardCheck },
  { id: "wms", label: "WMS / Localizações", icon: Warehouse },
  { id: "pedidos", label: "Pedidos / Expedição", icon: ShoppingCart },
];

const CATEGORY_META = {
  Recebimento: { icon: Truck, badge: "bg-blue-50 text-blue-700 ring-blue-200", dot: "bg-blue-500" },
  Triagem: { icon: ClipboardCheck, badge: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500" },
  Oracle: { icon: Activity, badge: "bg-cyan-50 text-cyan-700 ring-cyan-200", dot: "bg-cyan-500" },
  WMS: { icon: Warehouse, badge: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
  Estoque: { icon: Boxes, badge: "bg-teal-50 text-teal-700 ring-teal-200", dot: "bg-teal-500" },
  B2C: { icon: ShoppingCart, badge: "bg-amber-50 text-amber-700 ring-amber-200", dot: "bg-amber-500" },
  B2B: { icon: Package, badge: "bg-orange-50 text-orange-700 ring-orange-200", dot: "bg-orange-500" },
  Faturamento: { icon: ReceiptText, badge: "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200", dot: "bg-fuchsia-500" },
  FIFO: { icon: ShieldCheck, badge: "bg-slate-100 text-slate-700 ring-slate-200", dot: "bg-slate-500" },
  Expedição: { icon: Truck, badge: "bg-indigo-50 text-indigo-700 ring-indigo-200", dot: "bg-indigo-500" },
  Marketplace: { icon: Tag, badge: "bg-pink-50 text-pink-700 ring-pink-200", dot: "bg-pink-500" },
};

function fmtDateTime(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return "—";
  }
}

function fmtDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("pt-BR");
  } catch {
    return "—";
  }
}

function pretty(value) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value)
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function statusTone(status) {
  const value = String(status || "").toLowerCase();

  if (["concluido", "faturado", "finalizado", "confirmado", "retirado", "entregue"].some((x) => value.includes(x))) {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (["cancelado", "erro", "não localizado", "nao localizado", "nao_faturar"].some((x) => value.includes(x))) {
    return "bg-rose-50 text-rose-700 ring-rose-200";
  }

  if (["aguardando", "pendente", "analise", "análise", "reservado"].some((x) => value.includes(x))) {
    return "bg-amber-50 text-amber-700 ring-amber-200";
  }

  return "bg-slate-100 text-slate-600 ring-slate-200";
}

function StatCard({ label, value, helper, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.13em] text-slate-400">{label}</div>
          <div className="mt-2 text-xl font-black tracking-tight text-slate-900">{value ?? "—"}</div>
          {helper && <div className="mt-1 text-[10px] leading-4 text-slate-400">{helper}</div>}
        </div>
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Icon size={17} />
        </div>
      </div>
    </div>
  );
}

function DetailField({ label, value, mono = false, wide = false }) {
  return (
    <div className={wide ? "sm:col-span-2 xl:col-span-2" : ""}>
      <div className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className={`mt-1.5 break-words text-xs font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>
        {value || "—"}
      </div>
    </div>
  );
}

function EmptyState({ title, description }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center px-6 py-12 text-center">
      <FileSearch className="h-10 w-10 text-slate-300" />
      <div className="mt-4 text-sm font-black text-slate-700">{title}</div>
      <div className="mt-1 max-w-lg text-xs leading-5 text-slate-400">{description}</div>
    </div>
  );
}

function Timeline({ events }) {
  if (!events.length) {
    return (
      <EmptyState
        title="Nenhum evento nesta visão"
        description="O item foi localizado, mas não existem eventos gravados para o filtro selecionado."
      />
    );
  }

  return (
    <div className="divide-y divide-slate-100">
      {events.map((event, index) => {
        const meta = CATEGORY_META[event.categoria] || {
          icon: CircleDot,
          badge: "bg-slate-100 text-slate-600 ring-slate-200",
          dot: "bg-slate-400",
        };
        const Icon = meta.icon;
        const hasExtra = event.extra && Object.keys(event.extra).length > 0;

        return (
          <div key={`${event.data}-${event.evento}-${event.referencia}-${index}`} className="grid gap-4 px-5 py-4 lg:grid-cols-[190px_1fr_170px]">
            <div>
              <div className="text-xs font-black text-slate-700">{fmtDateTime(event.data)}</div>
              <div className="mt-1 text-[9px] font-semibold text-slate-400">{event.origem || "Liquida System"}</div>
            </div>

            <div className="relative pl-7">
              <span className={`absolute left-0 top-1.5 h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-black uppercase ring-1 ring-inset ${meta.badge}`}>
                  <Icon size={11} />
                  {event.categoria}
                </span>
                {event.status && (
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ring-1 ring-inset ${statusTone(event.status)}`}>
                    {pretty(event.status)}
                  </span>
                )}
              </div>

              <div className="mt-2 text-sm font-black text-slate-900">{event.evento}</div>
              {event.descricao && (
                <div className="mt-1 text-xs leading-5 text-slate-500">{event.descricao}</div>
              )}

              {hasExtra && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-[10px] font-bold text-violet-700">
                    Ver dados técnicos do evento
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-950 p-3 text-[9px] leading-4 text-slate-200">
                    {JSON.stringify(event.extra, null, 2)}
                  </pre>
                </details>
              )}
            </div>

            <div className="lg:text-right">
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                <User size={12} />
                {event.usuario || "Sistema / não identificado"}
              </div>
              {event.referencia && (
                <div className="mt-1 truncate font-mono text-[9px] text-slate-300" title={event.referencia}>
                  {event.referencia}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function WmsCycles({ cycles }) {
  if (!cycles.length) {
    return (
      <EmptyState
        title="Sem ciclo físico no novo WMS"
        description="O item pode existir no legado, Triagem ou SubInv sem ter sido armazenado no WMS atual."
      />
    );
  }

  return (
    <div className="space-y-3 p-4">
      {cycles.map((cycle, index) => (
        <div key={cycle.id || index} className="rounded-2xl border border-slate-200 bg-white p-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">
                  Ciclo físico #{cycles.length - index}
                </span>
                <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ring-1 ring-inset ${statusTone(cycle.status)}`}>
                  {pretty(cycle.status)}
                </span>
              </div>
              <div className="mt-2 text-sm font-black text-slate-900">{cycle.local || "Sem endereço físico"}</div>
              <div className="mt-1 text-[10px] text-slate-500">
                {cycle.voucher || "Sem voucher"} · {cycle.sku || "Sem SKU"} · {cycle.grade_venda || cycle.grade_fisica || "Sem grade"}
              </div>
            </div>

            <div className="grid min-w-[420px] grid-cols-2 gap-3 text-xs">
              <div>
                <div className="text-[9px] font-black uppercase text-slate-400">Confirmado</div>
                <div className="mt-1 font-bold text-slate-700">{fmtDateTime(cycle.confirmado_em)}</div>
              </div>
              <div>
                <div className="text-[9px] font-black uppercase text-slate-400">Retirado</div>
                <div className="mt-1 font-bold text-slate-700">{fmtDateTime(cycle.retirado_em)}</div>
              </div>
            </div>
          </div>

          {(cycle.saida_canal || cycle.saida_referencia) && (
            <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-[10px] font-semibold text-slate-500">
              Saída: <span className="font-black text-slate-700">{cycle.saida_canal || "—"}</span>
              {cycle.saida_referencia ? ` · referência ${cycle.saida_referencia}` : ""}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function OrdersPanel({ b2c, b2b }) {
  return (
    <div className="space-y-5 p-4">
      <div>
        <div className="mb-3 flex items-center gap-2">
          <ShoppingCart size={15} className="text-violet-700" />
          <div className="text-xs font-black text-slate-800">Histórico B2C</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{b2c.length}</span>
        </div>

        {b2c.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[1050px] border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left">
                  {["Pedido","Canal / Cliente","Status","Produto","IMEI","NF","Grupo","Faturado"].map((label) => (
                    <th key={label} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b2c.map((item) => (
                  <tr key={item.id}>
                    <td className="px-3 py-3 font-mono text-xs font-black text-slate-800">{item.pedido || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="text-xs font-bold text-slate-700">{item.marketplace || "—"}</div>
                      <div className="mt-0.5 text-[10px] text-slate-400">{item.cliente || "—"}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`rounded-full px-2 py-1 text-[9px] font-black ring-1 ring-inset ${statusTone(item.status)}`}>{pretty(item.status)}</span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-mono text-[10px] font-bold text-slate-700">{item.sku_produto || "—"}</div>
                      <div className="mt-0.5 text-[9px] text-slate-400">{item.grade_produto || "—"}</div>
                    </td>
                    <td className="px-3 py-3 font-mono text-[10px] text-slate-600">{item.imei_bipado || item.imei_alocado || "—"}</td>
                    <td className="px-3 py-3">
                      <div className="text-xs font-black text-slate-700">{item.numero_nf || "—"}</div>
                      <div className="mt-0.5 max-w-[180px] truncate font-mono text-[8px] text-slate-300">{item.chave_nf || ""}</div>
                    </td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-600">{item.grupo ? `#${item.grupo}` : "—"}</td>
                    <td className="px-3 py-3 text-[10px] font-semibold text-slate-500">{fmtDateTime(item.faturado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-xs text-slate-400">Nenhum vínculo B2C encontrado.</div>
        )}
      </div>

      <div>
        <div className="mb-3 flex items-center gap-2">
          <Package size={15} className="text-orange-600" />
          <div className="text-xs font-black text-slate-800">Histórico B2B</div>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black text-slate-500">{b2b.length}</span>
        </div>

        {b2b.length ? (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="bg-slate-50 text-left">
                  {["Lote","Cliente","Status pedido","Status item","Voucher","Local","NF","Embalado"].map((label) => (
                    <th key={label} className="px-3 py-2.5 text-[9px] font-black uppercase tracking-wide text-slate-400">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {b2b.map((item) => (
                  <tr key={item.item_id}>
                    <td className="px-3 py-3 text-[10px] font-bold text-slate-700">{item.lote || "—"}</td>
                    <td className="px-3 py-3 text-xs font-bold text-slate-700">{item.cliente || "—"}</td>
                    <td className="px-3 py-3 text-[10px] text-slate-500">{pretty(item.pedido_status)}</td>
                    <td className="px-3 py-3 text-[10px] text-slate-500">{pretty(item.item_status)}</td>
                    <td className="px-3 py-3 font-mono text-[10px] text-slate-600">{item.voucher || "—"}</td>
                    <td className="px-3 py-3 text-[10px] text-slate-500">{item.local_estoque || "—"}</td>
                    <td className="px-3 py-3 text-xs font-black text-slate-700">{item.nf || "—"}</td>
                    <td className="px-3 py-3 text-[10px] text-slate-500">{fmtDateTime(item.embalado_em)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 p-5 text-xs text-slate-400">Nenhum vínculo B2B encontrado.</div>
        )}
      </div>
    </div>
  );
}

export default function RastreabilidadeItemV2Page() {
  const { profile } = useAuth();
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("q") || "");
  const [activeTab, setActiveTab] = useState("historico");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isOwner = profile?.id === OWNER_ID;

  async function consultar(busca, imei = null, updateUrl = true) {
    const term = String(busca || "").trim();
    if (!term) return;

    setLoading(true);
    setError("");

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "assurant_rastreabilidade_privada",
        {
          p_busca: term,
          p_imei: imei || null,
        }
      );

      if (rpcError) throw rpcError;

      setData(result || null);
      setActiveTab("historico");

      if (updateUrl) {
        const next = new URLSearchParams();
        next.set("q", term);
        if (imei) next.set("imei", imei);
        setParams(next, { replace: true });
      }
    } catch (err) {
      console.error(err);
      setError(err?.message || "Não foi possível consultar a rastreabilidade.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!isOwner) return;

    const q = params.get("q");
    const imei = params.get("imei");

    if (q) {
      setInput(q);
      consultar(q, imei, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const events = data?.eventos || [];
  const summary = data?.resumo || null;
  const matches = data?.matches || [];
  const cycles = data?.wms_ciclos || [];
  const b2c = data?.pedidos_b2c || [];
  const b2b = data?.pedidos_b2b || [];

  const filteredEvents = useMemo(() => {
    if (activeTab === "triagem") {
      return events.filter((event) => ["Recebimento", "Triagem", "Oracle"].includes(event.categoria));
    }

    if (activeTab === "wms") {
      return events.filter((event) => ["WMS", "Estoque", "FIFO"].includes(event.categoria));
    }

    if (activeTab === "pedidos") {
      return events.filter((event) =>
        ["B2C", "B2B", "Faturamento", "Expedição", "Marketplace"].includes(event.categoria)
      );
    }

    return events;
  }, [events, activeTab]);

  if (!isOwner) {
    return <Navigate to="/sem-acesso" replace />;
  }

  function submit(event) {
    event.preventDefault();
    consultar(input, null, true);
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-950 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.14em] text-white">
                <Fingerprint size={12} />
                Rastreabilidade do Item
              </span>
              <span className="rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-violet-700">
                Acesso privado
              </span>
            </div>

            <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950">
              Consulta completa de histórico
            </h1>
            <p className="mt-1 max-w-4xl text-xs leading-5 text-slate-500">
              Pesquisa unificada por voucher, IMEI/serial, pedido, NF, chave da NF, SKU ou modelo. A timeline consolida Triagem, Oracle, ciclos físicos do WMS, B2C, B2B, FIFO, etiquetas, romaneio e snapshots do AnyMarket.
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-[10px] font-bold text-emerald-700">
            <ShieldCheck size={14} />
            Somente leitura
          </div>
        </div>

        <form onSubmit={submit} className="mt-5 flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400" />
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Voucher, IMEI, pedido, NF, chave NF, SKU ou modelo..."
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 text-xs font-black text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
            Consultar
          </button>

          {data && (
            <button
              type="button"
              onClick={() => consultar(input, data?.selecionado_imei || null, true)}
              disabled={loading}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50"
            >
              <RefreshCw size={14} />
              Atualizar
            </button>
          )}
        </form>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex min-h-[380px] items-center justify-center">
            <div className="text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-violet-700" />
              <div className="mt-3 text-sm font-black text-slate-700">Montando a rastreabilidade completa...</div>
              <div className="mt-1 text-xs text-slate-400">Cruzando Triagem, WMS, pedidos e expedição.</div>
            </div>
          </div>
        </div>
      ) : !data ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <EmptyState
            title="Pesquise um item para iniciar"
            description="Use um IMEI ou voucher para a visão mais completa. Também é possível localizar pelo pedido, NF, chave fiscal, SKU ou modelo."
          />
        </div>
      ) : (
        <>
          {matches.length > 1 && (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="text-xs font-black text-slate-800">Resultados encontrados</div>
                <div className="mt-0.5 text-[10px] text-slate-400">
                  {matches.length} aparelhos correspondem à busca. Selecione o item correto.
                </div>
              </div>

              <div className="grid gap-2 p-3 md:grid-cols-2 2xl:grid-cols-3">
                {matches.map((match) => {
                  const selected = match.imei === data?.selecionado_imei;
                  return (
                    <button
                      key={match.imei}
                      type="button"
                      onClick={() => consultar(input, match.imei, true)}
                      className={`flex items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${
                        selected
                          ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100"
                          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40"
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-mono text-xs font-black text-slate-800">{match.imei}</div>
                        <div className="mt-1 truncate text-[10px] font-semibold text-slate-500">
                          {match.voucher || "Sem voucher"} · {match.sku || "Sem SKU"}
                        </div>
                        <div className="mt-0.5 truncate text-[9px] text-slate-400">{match.modelo || "Modelo não informado"}</div>
                      </div>
                      <ChevronRight size={15} className="shrink-0 text-slate-300" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {summary ? (
            <>
              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-[linear-gradient(135deg,#faf8ff_0%,#ffffff_55%,#f8fafc_100%)] p-5">
                  <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-start 2xl:justify-between">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                        <Fingerprint size={22} />
                      </div>
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">Identidade rastreada</div>
                        <div className="mt-1 font-mono text-xl font-black tracking-tight text-slate-950">
                          {summary.imei || `Pedido ${data?.selecionado_pedido || "—"}`}
                        </div>
                        <div className="mt-1 text-xs font-semibold text-slate-500">
                          {summary.voucher || "Sem voucher identificado"} · {summary.sku || "Sem SKU"}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {summary.status_triagem && (
                        <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ring-1 ring-inset ${statusTone(summary.status_triagem)}`}>
                          Triagem: {pretty(summary.status_triagem)}
                        </span>
                      )}
                      {summary.status_wms && (
                        <span className={`rounded-full px-3 py-1.5 text-[10px] font-black ring-1 ring-inset ${statusTone(summary.status_wms)}`}>
                          WMS: {pretty(summary.status_wms)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-x-6 gap-y-5 p-5 sm:grid-cols-2 xl:grid-cols-6">
                  <DetailField label="Voucher" value={summary.voucher} mono />
                  <DetailField label="IMEI / Serial" value={summary.imei} mono />
                  <DetailField label="SKU" value={summary.sku} mono />
                  <DetailField label="Grade" value={summary.grade} />
                  <DetailField label="Condição" value={summary.condicao} />
                  <DetailField label="Status bateria" value={summary.status_bateria} />
                  <DetailField label="Produto / modelo" value={summary.modelo} wide />
                  <DetailField label="Local atual / último local" value={summary.local} wide />
                  <DetailField label="Recebido em" value={fmtDateTime(summary.data_recebimento)} />
                  <DetailField label="Oracle em" value={fmtDateTime(summary.data_oracle)} />
                  <DetailField label="Data SubInv" value={fmtDate(summary.data_subinv)} />
                  <DetailField label="Local SubInv" value={summary.local_subinv} />
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={History} label="Eventos registrados" value={events.length.toLocaleString("pt-BR")} helper="timeline unificada" />
                <StatCard icon={Warehouse} label="Ciclos físicos WMS" value={summary.ciclos_wms || 0} helper="reentradas preservadas" />
                <StatCard icon={ShoppingCart} label="Vínculos B2C" value={summary.pedidos_b2c || 0} helper="histórico de pedidos" />
                <StatCard icon={Package} label="Vínculos B2B" value={summary.pedidos_b2b || 0} helper="lotes e saídas B2B" />
              </div>

              <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="overflow-x-auto border-b border-slate-100">
                  <div className="flex min-w-max gap-1 p-2">
                    {TABS.map((tab) => {
                      const Icon = tab.icon;
                      const active = activeTab === tab.id;
                      return (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setActiveTab(tab.id)}
                          className={`inline-flex h-10 items-center gap-2 rounded-xl px-3.5 text-xs font-black transition ${
                            active
                              ? "bg-slate-950 text-white shadow-sm"
                              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                          }`}
                        >
                          <Icon size={14} />
                          {tab.label}
                          {tab.id === "historico" && (
                            <span className={`rounded-full px-1.5 py-0.5 text-[8px] ${active ? "bg-white/15 text-white" : "bg-slate-100 text-slate-400"}`}>
                              {events.length}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {activeTab === "wms" ? (
                  <>
                    <WmsCycles cycles={cycles} />
                    <div className="border-t border-slate-100">
                      <Timeline events={filteredEvents} />
                    </div>
                  </>
                ) : activeTab === "pedidos" ? (
                  <>
                    <OrdersPanel b2c={b2c} b2b={b2b} />
                    <div className="border-t border-slate-100">
                      <Timeline events={filteredEvents} />
                    </div>
                  </>
                ) : (
                  <Timeline events={filteredEvents} />
                )}
              </div>

              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
                <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Consulta auditável e somente leitura
                </div>
                <div className="text-[10px] font-medium text-slate-500">
                  Ciclos físicos são tratados por <span className="font-mono font-bold">wms_alocacao_id</span>; reentradas do mesmo IMEI aparecem separadas no histórico.
                </div>
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <EmptyState
                title="Nenhum item identificado"
                description="A busca não localizou um IMEI/serial ou pedido correspondente nas bases integradas."
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
