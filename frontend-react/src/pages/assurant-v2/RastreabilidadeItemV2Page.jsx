import { useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
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
  Unlink2,
  User,
  Warehouse,
  XCircle,
} from "lucide-react";

import { useSearchParams } from "react-router-dom";

import { supabase } from "../../lib/supabase.js";

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
  Troca: { icon: ShieldCheck, badge: "bg-purple-50 text-purple-700 ring-purple-200", dot: "bg-purple-500" },
  "Venda Funcionário": { icon: User, badge: "bg-sky-50 text-sky-700 ring-sky-200", dot: "bg-sky-500" },
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

  const raw = String(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (match) {
    return `${match[3]}/${match[2]}/${match[1]}`;
  }

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

function specialTypeLabel(tipo) {
  return tipo === "VENDA_FUNCIONARIO"
    ? "Venda Funcionário"
    : "Troca";
}

function specialHistoryEvents(history = []) {
  return history.flatMap((item) => {
    const categoria = specialTypeLabel(item.tipo);
    const base = {
      categoria,
      origem: "assurant_reservas_especiais",
      referencia: item.id,
    };

    const events = [];

    if (item.reservado_em) {
      events.push({
        ...base,
        data: item.reservado_em,
        evento:
          item.tipo === "VENDA_FUNCIONARIO"
            ? "Produto reservado para venda funcionário"
            : "Produto reservado para troca",
        status: "reservado",
        descricao: "Produto testado e validado · indisponível para alocação B2C.",
        usuario: item.reservado_por_nome || item.reservado_por || "Sistema",
        extra: {
          wms_alocacao_id: item.wms_alocacao_id,
          tipo: item.tipo,
        },
      });
    }

    if (item.cancelado_em) {
      events.push({
        ...base,
        data: item.cancelado_em,
        evento: "Reserva liberada para B2C",
        status: "cancelado",
        descricao: item.cancelamento_motivo || "Reserva removida e produto liberado para B2C.",
        usuario: item.cancelado_por_nome || item.cancelado_por || "Sistema",
        extra: {
          tipo: item.tipo,
        },
      });
    }

    if (item.finalizado_em) {
      events.push({
        ...base,
        data: item.finalizado_em,
        evento: "Saída especial finalizada",
        status: "finalizado",
        descricao: `Pedido AnyMarket ${item.pedido_anymarket || "—"} · NF ${item.nf || "—"} · E-Ticket ${item.e_ticket || "—"}`,
        usuario: item.finalizado_por_nome || item.finalizado_por || "Sistema",
        extra: {
          tipo: item.tipo,
          pedido_anymarket: item.pedido_anymarket,
          nf: item.nf,
          e_ticket: item.e_ticket,
        },
      });
    }

    return events;
  });
}

function unlinkHistoryEvents(history = []) {
  return history.map((item) => {
    const b2cCount = Array.isArray(item.b2c_vinculos) ? item.b2c_vinculos.length : 0;
    const b2bCount = Array.isArray(item.b2b_vinculos) ? item.b2b_vinculos.length : 0;
    const afetados = [
      b2cCount ? `${b2cCount} vínculo(s) B2C` : null,
      b2bCount ? `${b2bCount} vínculo(s) B2B` : null,
    ].filter(Boolean).join(" · ");

    return {
      data: item.criado_em,
      categoria: "Estoque",
      evento: "Aparelho desvinculado de pedido",
      status: "desvinculado",
      descricao: `${item.motivo || "Sem motivo informado"}${afetados ? ` · ${afetados}` : ""}`,
      origem: "assurant_desvinculacoes_pedido",
      referencia: item.id,
      usuario_id: item.usuario_id,
      usuario: item.usuario_nome || item.usuario_id || "Sistema",
      extra: {
        b2c_vinculos: item.b2c_vinculos || [],
        b2b_vinculos: item.b2b_vinculos || [],
        wms_alocacao_id: item.wms_alocacao_id,
        b2b_exportados: item.b2b_exportados || 0,
      },
    };
  });
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
  const [params, setParams] = useSearchParams();
  const [input, setInput] = useState(params.get("q") || "");
  const [activeTab, setActiveTab] = useState("historico");
  const [data, setData] = useState(null);
  const [special, setSpecial] = useState({ ativa: null, historico: [] });
  const [unlinkHistory, setUnlinkHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [finalizeOpen, setFinalizeOpen] = useState(false);
  const [unlinkOpen, setUnlinkOpen] = useState(false);
  const [unlinkReason, setUnlinkReason] = useState("");
  const [finalizeForm, setFinalizeForm] = useState({
    pedidoAnyMarket: "",
    nf: "",
    eTicket: "",
  });

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

      let specialResult = { ativa: null, historico: [] };
      let unlinkResult = [];

      if (result?.selecionado_imei) {
        const [specialResponse, unlinkResponse] = await Promise.all([
          supabase.rpc(
            "assurant_reserva_especial_status",
            { p_imei: result.selecionado_imei }
          ),
          supabase.rpc(
            "assurant_desvinculacoes_item",
            { p_imei: result.selecionado_imei }
          ),
        ]);

        if (specialResponse.error) throw specialResponse.error;
        if (unlinkResponse.error) throw unlinkResponse.error;

        specialResult = specialResponse.data || specialResult;
        unlinkResult = unlinkResponse.data || [];
      }

      setData(result || null);
      setSpecial(specialResult);
      setUnlinkHistory(unlinkResult);
      setActionError("");
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
      setSpecial({ ativa: null, historico: [] });
      setUnlinkHistory([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const q = params.get("q");
    const imei = params.get("imei");

    if (q) {
      setInput(q);
      consultar(q, imei, false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const events = useMemo(() => {
    const base = data?.eventos || [];
    const especiais = specialHistoryEvents(special?.historico || []);
    const desvinculacoes = unlinkHistoryEvents(unlinkHistory);

    return [...base, ...especiais, ...desvinculacoes].sort(
      (a, b) => new Date(b.data || 0).getTime() - new Date(a.data || 0).getTime()
    );
  }, [data, special, unlinkHistory]);

  const summary = data?.resumo || null;
  const matches = data?.matches || [];
  const cycles = data?.wms_ciclos || [];
  const b2c = data?.pedidos_b2c || [];
  const b2b = data?.pedidos_b2b || [];

  const unlinkableB2C = b2c.filter(
    (item) =>
      ["alocado", "em_picking", "em_analise", "aguardando_definicao_produto", "embalado"].includes(item.status) &&
      !item.numero_nf &&
      !item.chave_nf &&
      !item.faturado_em
  );

  const unlinkableB2B = b2b.filter(
    (item) =>
      ["pendente", "nao_localizado", "em_analise", "bipado"].includes(item.item_status) &&
      !item.nf &&
      item.pedido_status !== "concluido"
  );

  const canUnlink =
    Boolean(summary?.imei) &&
    (unlinkableB2C.length > 0 || unlinkableB2B.length > 0);

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

  async function reservarEspecial(tipo) {
    if (!summary?.imei || actionLoading) return;

    const label = specialTypeLabel(tipo);
    const confirmado = window.confirm(
      `Confirma que o produto ${summary.imei} foi testado e validado para ${label}? Ao confirmar, ele ficará indisponível para B2C.`
    );

    if (!confirmado) return;

    setActionLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "assurant_reservar_item_especial",
        {
          p_imei: summary.imei,
          p_tipo: tipo,
        }
      );

      if (rpcError) throw rpcError;
      if (!result?.ok) throw new Error(result?.erro || "Não foi possível criar a reserva.");

      setActionMessage(
        `${label} reservada. O produto está bloqueado para alocação B2C.`
      );

      await consultar(input, summary.imei, false);
    } catch (err) {
      console.error(err);
      setActionError(err?.message || "Não foi possível reservar o produto.");
    } finally {
      setActionLoading(false);
    }
  }

  async function liberarParaB2C() {
    const ativa = special?.ativa;
    if (!ativa?.id || actionLoading) return;

    const confirmado = window.confirm(
      `Liberar o IMEI ${ativa.imei} da reserva de ${specialTypeLabel(ativa.tipo)} e deixá-lo novamente disponível para B2C?`
    );

    if (!confirmado) return;

    setActionLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "assurant_liberar_item_especial",
        {
          p_reserva_id: ativa.id,
          p_motivo: "Liberado manualmente para atender B2C",
        }
      );

      if (rpcError) throw rpcError;
      if (!result?.ok) throw new Error(result?.erro || "Não foi possível liberar a reserva.");

      setActionMessage("Reserva removida. O produto voltou a ficar disponível para B2C.");
      await consultar(input, ativa.imei, false);
    } catch (err) {
      console.error(err);
      setActionError(err?.message || "Não foi possível liberar o produto.");
    } finally {
      setActionLoading(false);
    }
  }

  async function finalizarEspecial(event) {
    event.preventDefault();

    const ativa = special?.ativa;
    if (!ativa?.id || actionLoading) return;

    const pedido = finalizeForm.pedidoAnyMarket.trim();
    const nf = finalizeForm.nf.trim();
    const eTicket = finalizeForm.eTicket.trim();

    if (!pedido || !nf || !eTicket) {
      setActionError("Pedido AnyMarket, NF e E-Ticket são obrigatórios.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "assurant_finalizar_item_especial",
        {
          p_reserva_id: ativa.id,
          p_pedido_anymarket: pedido,
          p_nf: nf,
          p_e_ticket: eTicket,
        }
      );

      if (rpcError) throw rpcError;
      if (!result?.ok) throw new Error(result?.erro || "Não foi possível finalizar a saída.");

      setFinalizeOpen(false);
      setFinalizeForm({
        pedidoAnyMarket: "",
        nf: "",
        eTicket: "",
      });
      setActionMessage(
        `${specialTypeLabel(ativa.tipo)} finalizada e retirada do WMS.`
      );

      await consultar(input, ativa.imei, false);
    } catch (err) {
      console.error(err);
      setActionError(err?.message || "Não foi possível finalizar a saída.");
    } finally {
      setActionLoading(false);
    }
  }

  async function desvincularPedidos(event) {
    event.preventDefault();

    const motivo = unlinkReason.trim();
    if (!summary?.imei || actionLoading) return;

    if (motivo.length < 3) {
      setActionError("Informe o motivo da desvinculação com pelo menos 3 caracteres.");
      return;
    }

    setActionLoading(true);
    setActionError("");
    setActionMessage("");

    try {
      const { data: result, error: rpcError } = await supabase.rpc(
        "assurant_desvincular_item_pedidos",
        {
          p_imei: summary.imei,
          p_motivo: motivo,
        }
      );

      if (rpcError) throw rpcError;
      if (!result?.ok) {
        throw new Error(result?.erro || "Não foi possível desvincular o aparelho.");
      }

      setUnlinkOpen(false);
      setUnlinkReason("");

      const partes = [
        result.b2c_desvinculados
          ? `${result.b2c_desvinculados} vínculo(s) B2C`
          : null,
        result.b2b_desvinculados
          ? `${result.b2b_desvinculados} vínculo(s) B2B`
          : null,
      ].filter(Boolean);

      const avisoExportacao = result.b2b_exportados > 0
        ? ` Atenção: ${result.b2b_exportados} item(ns) B2B já haviam sido exportados para faturamento e devem ser revisados.`
        : "";

      setActionMessage(
        `Aparelho desvinculado (${partes.join(" · ")}). Status alterado para Aguardando armazenagem.${avisoExportacao}`
      );

      await consultar(input, summary.imei, false);
    } catch (err) {
      console.error(err);
      setActionError(err?.message || "Não foi possível desvincular o aparelho.");
    } finally {
      setActionLoading(false);
    }
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
                Acesso controlado
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
            Consulta + ações controladas
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

      {actionError && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          <XCircle size={16} className="mt-0.5 shrink-0" />
          {actionError}
        </div>
      )}

      {actionMessage && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700">
          <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
          {actionMessage}
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

              <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-violet-700" />
                      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-700">
                        Reserva Operacional
                      </div>
                    </div>

                    {special?.ativa ? (
                      <>
                        <div className="mt-2 text-sm font-black text-slate-950">
                          Reservado para {specialTypeLabel(special.ativa.tipo)}
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          Testado e validado em {fmtDateTime(special.ativa.validado_em)} ·
                          {" "}local {special.ativa.local || summary.local || "—"} ·
                          {" "}indisponível para B2C enquanto esta reserva estiver ativa.
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mt-2 text-sm font-black text-slate-950">
                          Produto sem reserva especial ativa
                        </div>
                        <div className="mt-1 text-xs leading-5 text-slate-500">
                          Após teste e validação, reserve o ciclo físico atual para Troca ou Venda Funcionário.
                          A reserva entra no WMS e retira o produto da fila de candidatos do B2C.
                        </div>
                      </>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {special?.ativa ? (
                      <>
                        <button
                          type="button"
                          onClick={liberarParaB2C}
                          disabled={actionLoading}
                          className="inline-flex h-10 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 text-xs font-black text-amber-700 transition hover:bg-amber-100 disabled:opacity-50"
                        >
                          <RefreshCw size={14} />
                          Liberar para B2C
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActionError("");
                            setFinalizeOpen(true);
                          }}
                          disabled={actionLoading}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 size={14} />
                          Finalizar saída
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => reservarEspecial("TROCA")}
                          disabled={actionLoading || !summary.imei || String(summary.status_wms || "").toLowerCase() !== "confirmado"}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-700 px-4 text-xs font-black text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <ShieldCheck size={14} />
                          Reservar para Troca
                        </button>

                        <button
                          type="button"
                          onClick={() => reservarEspecial("VENDA_FUNCIONARIO")}
                          disabled={actionLoading || !summary.imei || String(summary.status_wms || "").toLowerCase() !== "confirmado"}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-sky-700 px-4 text-xs font-black text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <User size={14} />
                          Reservar para Venda Funcionário
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {!special?.ativa && String(summary.status_wms || "").toLowerCase() !== "confirmado" && (
                  <div className="border-t border-amber-100 bg-amber-50/70 px-5 py-3 text-[10px] font-semibold text-amber-700">
                    A reserva só pode ser criada quando o ciclo físico atual estiver confirmado e ocupando uma posição no WMS.
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-rose-200 bg-white shadow-sm">
                <div className="flex flex-col gap-4 p-5 xl:flex-row xl:items-center xl:justify-between">
                  <div className="max-w-4xl">
                    <div className="flex items-center gap-2">
                      <Unlink2 size={16} className="text-rose-600" />
                      <div className="text-xs font-black uppercase tracking-[0.1em] text-slate-700">
                        Desvincular de pedido
                      </div>
                    </div>

                    {canUnlink ? (
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        Vínculos operacionais encontrados:
                        <span className="ml-1 font-black text-slate-700">
                          {unlinkableB2C.length} B2C · {unlinkableB2B.length} B2B
                        </span>.
                        A ação afeta somente o IMEI/serial selecionado: encerra o ciclo físico atual no WMS, libera a posição e devolve este aparelho para
                        <span className="font-black text-slate-700"> Aguardando armazenagem</span>.
                      </div>
                    ) : (
                      <div className="mt-2 text-xs leading-5 text-slate-500">
                        Não há vínculo B2B/B2C aberto elegível para desvinculação. Pedidos faturados ou concluídos permanecem apenas como histórico.
                      </div>
                    )}

                    {special?.ativa && (
                      <div className="mt-2 text-[10px] font-semibold text-amber-700">
                        Existe uma reserva especial ativa. Libere essa reserva antes de desvincular o aparelho de pedidos.
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setUnlinkReason("");
                      setUnlinkOpen(true);
                    }}
                    disabled={!canUnlink || actionLoading || Boolean(special?.ativa)}
                    className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Unlink2 size={14} />
                    Desvincular este aparelho
                  </button>
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
                  Consulta auditável + ações operacionais controladas
                </div>
                <div className="text-[10px] font-medium text-slate-500">
                  Ciclos físicos são tratados por <span className="font-mono font-bold">wms_alocacao_id</span>; reentradas do mesmo IMEI aparecem separadas no histórico.
                </div>
              </div>

              {unlinkOpen && canUnlink && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]">
                  <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                      <div>
                        <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.14em] text-rose-600">
                          <AlertTriangle size={13} />
                          Ação administrativa
                        </div>
                        <h2 className="mt-1 text-lg font-black text-slate-950">
                          Desvincular este aparelho do pedido
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          Somente o IMEI/serial selecionado será tratado. O vínculo operacional dele será encerrado, a posição WMS atual será liberada e este produto voltará para a fila de armazenagem.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setUnlinkOpen(false)}
                        disabled={actionLoading}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                      >
                        <XCircle size={19} />
                      </button>
                    </div>

                    <form onSubmit={desvincularPedidos} className="space-y-4 p-5">
                      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                        <div className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-400">
                          Aparelho
                        </div>
                        <div className="mt-1 font-mono text-sm font-black text-slate-900">
                          {summary.imei}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {unlinkableB2C.length > 0 && (
                            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[9px] font-black text-amber-700 ring-1 ring-amber-200">
                              {unlinkableB2C.length} vínculo(s) B2C
                            </span>
                          )}
                          {unlinkableB2B.length > 0 && (
                            <span className="rounded-full bg-orange-50 px-2.5 py-1 text-[9px] font-black text-orange-700 ring-1 ring-orange-200">
                              {unlinkableB2B.length} vínculo(s) B2B
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                          Motivo da desvinculação *
                        </label>
                        <textarea
                          value={unlinkReason}
                          onChange={(event) => setUnlinkReason(event.target.value)}
                          autoFocus
                          rows={4}
                          maxLength={1000}
                          placeholder="Descreva por que o aparelho está sendo retirado do pedido..."
                          className="mt-1.5 w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:border-rose-300 focus:ring-4 focus:ring-rose-100"
                        />
                        <div className="mt-1 text-right text-[9px] font-semibold text-slate-400">
                          {unlinkReason.length}/1000
                        </div>
                      </div>

                      <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[10px] leading-5 text-amber-800">
                        <span className="font-black">Importante:</span> pedidos já faturados/concluídos não são alterados.
                        No B2C, o pedido volta para aguardando alocação. No B2B, o item fica como Não Faturar com este motivo.
                        O aparelho deverá passar novamente pela armazenagem antes de ser alocado a outro pedido.
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setUnlinkOpen(false)}
                          disabled={actionLoading}
                          className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>

                        <button
                          type="submit"
                          disabled={actionLoading || unlinkReason.trim().length < 3}
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-rose-600 px-4 text-xs font-black text-white transition hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <Unlink2 size={14} />}
                          Confirmar desvinculação
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}

              {finalizeOpen && special?.ativa && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]">
                  <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
                    <div className="flex items-start justify-between gap-4 border-b border-slate-100 p-5">
                      <div>
                        <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-600">
                          {specialTypeLabel(special.ativa.tipo)}
                        </div>
                        <h2 className="mt-1 text-lg font-black text-slate-950">
                          Finalizar saída especial
                        </h2>
                        <p className="mt-1 text-xs leading-5 text-slate-500">
                          O fechamento retira o ciclo físico do WMS. Os três campos abaixo são obrigatórios e ficam gravados no histórico do aparelho.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => setFinalizeOpen(false)}
                        className="rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      >
                        <XCircle size={19} />
                      </button>
                    </div>

                    <form onSubmit={finalizarEspecial} className="space-y-4 p-5">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                          Número do pedido AnyMarket *
                        </label>
                        <input
                          value={finalizeForm.pedidoAnyMarket}
                          onChange={(event) =>
                            setFinalizeForm((current) => ({
                              ...current,
                              pedidoAnyMarket: event.target.value,
                            }))
                          }
                          autoFocus
                          className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                          placeholder="Ex.: 398123456"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div>
                          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                            NF *
                          </label>
                          <input
                            value={finalizeForm.nf}
                            onChange={(event) =>
                              setFinalizeForm((current) => ({
                                ...current,
                                nf: event.target.value,
                              }))
                            }
                            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                            placeholder="Número da NF"
                          />
                        </div>

                        <div>
                          <label className="text-[10px] font-black uppercase tracking-[0.1em] text-slate-500">
                            E-Ticket *
                          </label>
                          <input
                            value={finalizeForm.eTicket}
                            onChange={(event) =>
                              setFinalizeForm((current) => ({
                                ...current,
                                eTicket: event.target.value,
                              }))
                            }
                            className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                            placeholder="E-Ticket da saída"
                          />
                        </div>
                      </div>

                      <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-[10px] leading-4 text-amber-700">
                        IMEI <span className="font-mono font-black">{special.ativa.imei}</span> ·
                        {" "}ao finalizar, a reserva WMS passa para retirada e a posição física é liberada.
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setFinalizeOpen(false)}
                          disabled={actionLoading}
                          className="h-10 rounded-xl border border-slate-200 px-4 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          Cancelar
                        </button>

                        <button
                          type="submit"
                          disabled={
                            actionLoading ||
                            !finalizeForm.pedidoAnyMarket.trim() ||
                            !finalizeForm.nf.trim() ||
                            !finalizeForm.eTicket.trim()
                          }
                          className="inline-flex h-10 items-center gap-2 rounded-xl bg-emerald-600 px-4 text-xs font-black text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {actionLoading ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                          Confirmar finalização
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              )}
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
