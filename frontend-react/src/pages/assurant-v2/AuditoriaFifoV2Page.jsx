import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  UserRound,
  XCircle,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";
import {
  buscarFilaAuditoriaFifo,
  carregarAuditoriaFifoAno,
} from "../../services/fifoAuditoriaService.js";

const GABRIEL_USER_ID = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";
const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

function ymdSaoPaulo(value) {
  const date = value ? new Date(value) : new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  return get("year") + "-" + get("month") + "-" + get("day");
}

function fmtDataHora(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtData(value) {
  if (!value) return "—";
  return new Date(value + "T12:00:00-03:00").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function fmtPct(value) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(1).replace(".", ",") + "%";
}

function metricas(rows) {
  const total = rows.length;
  const auditados = rows.filter((r) => r.auditavel).length;
  const acertos = rows.filter((r) => r.fifo_correto).length;
  const divergencias = rows.filter((r) => r.divergente).length;
  const semRastro = total - auditados;
  return {
    total,
    auditados,
    acertos,
    divergencias,
    semRastro,
    acuracia: auditados ? (acertos / auditados) * 100 : null,
    cobertura: total ? (auditados / total) * 100 : null,
  };
}

function Card({ children, className = "" }) {
  return (
    <div className={"rounded-2xl border border-slate-200 bg-white shadow-sm " + className}>
      {children}
    </div>
  );
}

function Kpi({ label, value, sub, tone = "slate" }) {
  const tones = {
    slate: "bg-slate-50 text-slate-800 border-slate-200",
    emerald: "bg-emerald-50 text-emerald-800 border-emerald-200",
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    rose: "bg-rose-50 text-rose-800 border-rose-200",
    violet: "bg-violet-50 text-violet-800 border-violet-200",
  };
  return (
    <div className={"rounded-2xl border p-4 " + (tones[tone] || tones.slate)}>
      <div className="text-xs font-bold uppercase tracking-wide opacity-65">{label}</div>
      <div className="mt-2 text-3xl font-black">{value}</div>
      {sub && <div className="mt-1 text-xs font-semibold opacity-65">{sub}</div>}
    </div>
  );
}

function AccuracyCard({ label, rows, active, onClick }) {
  const m = metricas(rows);
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-2xl border p-4 text-left transition " +
        (active
          ? "border-violet-300 bg-violet-50 ring-2 ring-violet-100"
          : "border-slate-200 bg-white hover:border-violet-200 hover:bg-violet-50/40")
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black uppercase tracking-wide text-slate-500">{label}</div>
        <TrendingUp className="h-4 w-4 text-violet-500" />
      </div>
      <div className="mt-2 text-3xl font-black text-slate-900">{fmtPct(m.acuracia)}</div>
      <div className="mt-1 text-xs text-slate-500">
        {m.acertos} corretos de {m.auditados} auditáveis · cobertura {fmtPct(m.cobertura)}
      </div>
    </button>
  );
}

function ResultadoBadge({ row }) {
  if (row.fifo_correto) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">
        <CheckCircle2 className="h-3.5 w-3.5" />
        FIFO correto
      </span>
    );
  }

  if (row.divergente) {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-700 ring-1 ring-rose-200">
        <XCircle className="h-3.5 w-3.5" />
        Divergência
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
      <AlertTriangle className="h-3.5 w-3.5" />
      Sem rastro final
    </span>
  );
}

export default function AuditoriaFifoV2Page() {
  const { user } = useAuth();
  const [dataRef, setDataRef] = useState(() => ymdSaoPaulo());
  const [escopo, setEscopo] = useState("dia");
  const [rowsAno, setRowsAno] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtroResultado, setFiltroResultado] = useState("todos");
  const [expandido, setExpandido] = useState(null);
  const [filas, setFilas] = useState({});

  const anoRef = Number(dataRef.slice(0, 4));
  const mesRef = dataRef.slice(0, 7);

  async function carregar() {
    setLoading(true);
    setErro(null);
    try {
      const data = await carregarAuditoriaFifoAno(anoRef);
      setRowsAno(data);
    } catch (e) {
      setErro(e.message || "Falha ao carregar auditoria FIFO.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, [anoRef]);

  const rowsDia = useMemo(
    () => rowsAno.filter((r) => ymdSaoPaulo(r.faturado_em) === dataRef),
    [rowsAno, dataRef]
  );

  const rowsMes = useMemo(
    () => rowsAno.filter((r) => ymdSaoPaulo(r.faturado_em).slice(0, 7) === mesRef),
    [rowsAno, mesRef]
  );

  const rowsEscopo = escopo === "ano" ? rowsAno : escopo === "mes" ? rowsMes : rowsDia;
  const metricasEscopo = useMemo(() => metricas(rowsEscopo), [rowsEscopo]);

  const mesesAno = useMemo(() => {
    return MESES.map((label, idx) => {
      const chave = anoRef + "-" + String(idx + 1).padStart(2, "0");
      const rows = rowsAno.filter((r) => ymdSaoPaulo(r.faturado_em).slice(0, 7) === chave);
      return { label, chave, rows, ...metricas(rows) };
    });
  }, [rowsAno, anoRef]);

  const diasMes = useMemo(() => {
    const mapa = new Map();
    for (const row of rowsMes) {
      const chave = ymdSaoPaulo(row.faturado_em);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(row);
    }

    return [...mapa.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([dia, rows]) => ({ dia, rows, ...metricas(rows) }));
  }, [rowsMes]);

  const rowsFiltradas = useMemo(() => {
    const q = busca.trim().toLowerCase();

    return rowsEscopo
      .filter((row) => {
        if (filtroResultado === "correto" && !row.fifo_correto) return false;
        if (filtroResultado === "divergente" && !row.divergente) return false;
        if (filtroResultado === "sem_rastro" && !row.sem_rastro_final) return false;
        if (!q) return true;

        return [
          row.id_anymarket,
          row.numero_nf,
          row.imei_faturado,
          row.sku_produto,
          row.titulo_produto,
          row.marketplace,
          row.operador_nome,
        ]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q));
      })
      .sort((a, b) => new Date(b.faturado_em) - new Date(a.faturado_em));
  }, [rowsEscopo, busca, filtroResultado]);

  async function toggleFila(row) {
    if (expandido === row.id) {
      setExpandido(null);
      return;
    }

    setExpandido(row.id);
    if (!row.auditoria_id || filas[row.auditoria_id]) return;

    setFilas((prev) => ({
      ...prev,
      [row.auditoria_id]: { loading: true, data: null, erro: null },
    }));

    try {
      const data = await buscarFilaAuditoriaFifo(row.auditoria_id);
      setFilas((prev) => ({
        ...prev,
        [row.auditoria_id]: { loading: false, data, erro: null },
      }));
    } catch (e) {
      setFilas((prev) => ({
        ...prev,
        [row.auditoria_id]: { loading: false, data: null, erro: e.message },
      }));
    }
  }

  function selecionarMes(chave) {
    setDataRef(chave + "-01");
    setEscopo("mes");
  }

  function selecionarDia(dia) {
    setDataRef(dia);
    setEscopo("dia");
  }

  if (user?.id !== GABRIEL_USER_ID) {
    return (
      <Card className="p-8 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <div className="mt-3 text-sm font-bold text-slate-700">Acesso restrito</div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6 text-violet-700" />
            <h1 className="text-2xl font-black text-slate-900">Auditoria FIFO</h1>
            <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
              Acesso restrito
            </span>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Confere o IMEI efetivamente faturado contra a fotografia do FIFO registrada no momento da alocação.
            A escolha é correta quando o IMEI faturado possui rastro correspondente e ocupava a posição #1 da fila elegível.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 shadow-sm transition hover:bg-slate-50"
        >
          <RefreshCw className={"h-4 w-4 " + (loading ? "animate-spin" : "")} />
          Atualizar
        </button>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Data de referência
            </label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="date"
                value={dataRef}
                onChange={(e) => setDataRef(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Detalhamento
            </label>
            <div className="flex rounded-xl bg-slate-100 p-1">
              {[["dia","Dia"],["mes","Mês"],["ano","Ano"]].map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setEscopo(key)}
                  className={
                    "rounded-lg px-4 py-1.5 text-xs font-bold transition " +
                    (escopo === key
                      ? "bg-white text-violet-700 shadow-sm"
                      : "text-slate-500 hover:text-slate-700")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[240px] flex-1">
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Buscar no detalhe
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Pedido, NF, IMEI, SKU, operador..."
                className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>
        </div>
      </Card>

      {erro && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
          {erro}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-3">
        <AccuracyCard
          label={"Dia · " + fmtData(dataRef)}
          rows={rowsDia}
          active={escopo === "dia"}
          onClick={() => setEscopo("dia")}
        />
        <AccuracyCard
          label={"Mês · " + MESES[Number(dataRef.slice(5, 7)) - 1] + "/" + anoRef}
          rows={rowsMes}
          active={escopo === "mes"}
          onClick={() => setEscopo("mes")}
        />
        <AccuracyCard
          label={"Ano · " + anoRef}
          rows={rowsAno}
          active={escopo === "ano"}
          onClick={() => setEscopo("ano")}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Kpi label="Itens faturados" value={metricasEscopo.total.toLocaleString("pt-BR")} sub="Linhas faturadas no período" />
        <Kpi label="Auditáveis" value={metricasEscopo.auditados.toLocaleString("pt-BR")} sub={"Cobertura " + fmtPct(metricasEscopo.cobertura)} tone="violet" />
        <Kpi label="FIFO correto" value={metricasEscopo.acertos.toLocaleString("pt-BR")} sub={"Acurácia " + fmtPct(metricasEscopo.acuracia)} tone="emerald" />
        <Kpi label="Divergências" value={metricasEscopo.divergencias.toLocaleString("pt-BR")} sub="Escolha fora da posição #1" tone="rose" />
        <Kpi label="Sem rastro final" value={metricasEscopo.semRastro.toLocaleString("pt-BR")} sub="Fora do denominador da acurácia" tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-black text-slate-800">
              Controle diário · {MESES[Number(dataRef.slice(5, 7)) - 1]}/{anoRef}
            </div>
            <div className="mt-0.5 text-xs text-slate-400">Clique em um dia para abrir o detalhe.</div>
          </div>
          <div className="max-h-[330px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Dia</th>
                  <th className="px-3 py-2 text-right">Faturados</th>
                  <th className="px-3 py-2 text-right">Auditáveis</th>
                  <th className="px-3 py-2 text-right">Diverg.</th>
                  <th className="px-4 py-2 text-right">Acurácia</th>
                </tr>
              </thead>
              <tbody>
                {diasMes.map((d) => (
                  <tr
                    key={d.dia}
                    onClick={() => selecionarDia(d.dia)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50"
                  >
                    <td className="px-4 py-2.5 font-bold text-slate-700">{fmtData(d.dia)}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{d.total}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{d.auditados}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-rose-600">{d.divergencias}</td>
                    <td className="px-4 py-2.5 text-right font-black text-slate-800">{fmtPct(d.acuracia)}</td>
                  </tr>
                ))}
                {!diasMes.length && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                      Nenhum faturamento neste mês.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="text-sm font-black text-slate-800">Controle mensal · {anoRef}</div>
            <div className="mt-0.5 text-xs text-slate-400">Clique em um mês para abrir o detalhe mensal.</div>
          </div>
          <div className="max-h-[330px] overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-2">Mês</th>
                  <th className="px-3 py-2 text-right">Faturados</th>
                  <th className="px-3 py-2 text-right">Auditáveis</th>
                  <th className="px-3 py-2 text-right">Diverg.</th>
                  <th className="px-4 py-2 text-right">Acurácia</th>
                </tr>
              </thead>
              <tbody>
                {mesesAno.map((m) => (
                  <tr
                    key={m.chave}
                    onClick={() => selecionarMes(m.chave)}
                    className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/50"
                  >
                    <td className="px-4 py-2.5 font-bold text-slate-700">{m.label}/{anoRef}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{m.total}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{m.auditados}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-rose-600">{m.divergencias}</td>
                    <td className="px-4 py-2.5 text-right font-black text-slate-800">{fmtPct(m.acuracia)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-base font-black text-slate-800">Auditoria pedido a pedido</div>
            <div className="mt-0.5 text-xs text-slate-400">
              {rowsFiltradas.length.toLocaleString("pt-BR")} itens no detalhe · uma linha por item/IMEI faturado.
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {[["todos","Todos"],["correto","Corretos"],["divergente","Divergências"],["sem_rastro","Sem rastro"]].map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFiltroResultado(key)}
                className={
                  "rounded-lg px-3 py-1.5 text-xs font-bold transition " +
                  (filtroResultado === key
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200")
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm font-semibold text-slate-400">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Carregando auditoria do ano...
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1280px] text-sm">
              <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Pedido / NF</th>
                  <th className="px-3 py-3">Faturado em</th>
                  <th className="px-3 py-3">Produto</th>
                  <th className="px-3 py-3">IMEI faturado</th>
                  <th className="px-3 py-3">Posição FIFO</th>
                  <th className="px-3 py-3">Opções</th>
                  <th className="px-3 py-3">Operador</th>
                  <th className="px-3 py-3">Resultado</th>
                  <th className="px-4 py-3 text-right">Fila</th>
                </tr>
              </thead>
              <tbody>
                {rowsFiltradas.map((row) => {
                  const aberto = expandido === row.id;
                  const filaState = row.auditoria_id ? filas[row.auditoria_id] : null;

                  return [
                    <tr key={row.id} className="border-t border-slate-100 align-top hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <div className="font-black text-slate-800">#{row.id_anymarket}</div>
                        <div className="mt-0.5 text-xs text-slate-400">NF {row.numero_nf || "—"} · {row.marketplace || "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-xs font-semibold text-slate-600">{fmtDataHora(row.faturado_em)}</td>
                      <td className="max-w-[280px] px-3 py-3">
                        <div className="truncate font-semibold text-slate-700" title={row.titulo_produto || ""}>
                          {row.titulo_produto || row.sku_produto || "—"}
                        </div>
                        <div className="mt-0.5 text-xs text-slate-400">
                          {row.sku_produto || "—"} · {row.grade_produto || row.grade_alocada || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-mono text-xs font-bold text-slate-700">{row.imei_faturado || "—"}</div>
                        {row.imei_auditado && row.imei_auditado !== row.imei_faturado && (
                          <div className="mt-1 text-[10px] font-semibold text-amber-600">
                            último auditado: {row.imei_auditado}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {row.auditavel ? (
                          <span
                            className={
                              "inline-flex rounded-lg px-2.5 py-1 text-xs font-black " +
                              (row.posicao_fifo === 1
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-rose-50 text-rose-700")
                            }
                          >
                            #{row.posicao_fifo}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-black text-slate-700">{row.total_candidatos ?? "—"}</div>
                        <div className="text-[10px] text-slate-400">elegíveis no snapshot</div>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                          <UserRound className="h-3.5 w-3.5 text-slate-400" />
                          {row.operador_nome || "Não identificado"}
                        </div>
                        {row.teve_reescolha && (
                          <div className="mt-1 text-[10px] font-semibold text-violet-600">
                            {row.total_eventos_fifo} eventos FIFO
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3"><ResultadoBadge row={row} /></td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          disabled={!row.auditoria_id}
                          onClick={() => toggleFila(row)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {aberto ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          Ver opções
                        </button>
                      </td>
                    </tr>,
                    aberto && (
                      <tr key={row.id + "-fila"} className="border-t border-violet-100 bg-violet-50/30">
                        <td colSpan={9} className="px-5 py-4">
                          {!row.auditoria_id ? (
                            <div className="text-sm text-slate-500">Não há snapshot de FIFO para este item.</div>
                          ) : filaState?.loading ? (
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Carregando fila registrada...
                            </div>
                          ) : filaState?.erro ? (
                            <div className="text-sm font-semibold text-rose-600">{filaState.erro}</div>
                          ) : filaState?.data ? (
                            <div>
                              <div className="mb-3 flex flex-wrap items-center gap-3">
                                <div className="text-sm font-black text-slate-800">
                                  Opções disponíveis em {fmtDataHora(filaState.data.criado_em)}
                                </div>
                                <span className="rounded-lg bg-white px-2 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
                                  Origem: {filaState.data.origem || "—"}
                                </span>
                                {filaState.data.historico_truncado && (
                                  <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-bold text-amber-700 ring-1 ring-amber-200">
                                    Histórico antigo: {filaState.data.candidatos.length} de {filaState.data.total_candidatos} opções preservadas
                                  </span>
                                )}
                              </div>

                              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                                {filaState.data.candidatos.map((candidate) => (
                                  <div
                                    key={filaState.data.id + "-" + candidate.posicao + "-" + candidate.imei}
                                    className={
                                      "rounded-xl border p-3 " +
                                      (Number(candidate.posicao) === 1
                                        ? "border-emerald-200 bg-emerald-50"
                                        : candidate.escolhido
                                        ? "border-violet-200 bg-violet-50"
                                        : "border-slate-200 bg-white")
                                    }
                                  >
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-black text-slate-700">
                                        #{candidate.posicao} · {candidate.imei}
                                      </span>
                                      {Number(candidate.posicao) === 1 && (
                                        <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-emerald-700">
                                          FIFO correto
                                        </span>
                                      )}
                                      {candidate.escolhido && Number(candidate.posicao) !== 1 && (
                                        <span className="rounded-md bg-violet-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-violet-700">
                                          Escolhido
                                        </span>
                                      )}
                                    </div>
                                    <div className="mt-2 text-[11px] text-slate-500">
                                      {candidate.grade || "—"} · subinv {candidate.data_subinv || "—"}
                                    </div>
                                    <div className="mt-0.5 text-[11px] text-slate-400">
                                      {candidate.local || "sem localização"} · {candidate.local_subinv || "sem subinv"}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    ),
                  ];
                })}

                {!rowsFiltradas.length && !loading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-sm text-slate-400">
                      Nenhum item encontrado para este filtro.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-500">
        <div className="flex items-center gap-2 font-black text-slate-700">
          <FileText className="h-4 w-4" />
          Regra da auditoria
        </div>
        <p className="mt-1">
          Acurácia = itens cujo IMEI faturado possui snapshot correspondente e estava na posição #1 do FIFO ÷ itens auditáveis.
          Itens sem snapshot correspondente ao IMEI efetivamente faturado ficam em “Sem rastro final” e não entram no denominador.
          A base de snapshots começa em 24/07/2026. Nos registros históricos anteriores à implantação desta tela, filas muito grandes
          podem ter apenas as 10 primeiras opções preservadas; novas alocações passam a guardar a fila elegível completa.
        </p>
      </div>
    </div>
  );
}
