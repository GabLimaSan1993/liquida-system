import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  CheckCircle2,
  Clock3,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  ShoppingCart,
  Warehouse,
  X,
} from "lucide-react";

import {
  cancelarSolicitacaoDesvinculacao,
  listarSolicitacoesDesvinculacao,
  processarSolicitacaoDesvinculacao,
} from "../../services/desvinculacaoLiquidaService.js";

function fmtData(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
}

function VinculoBadge({ tipo }) {
  const label =
    tipo === "B2B" ? "B2B" :
    tipo === "TROCA" ? "TROCA" :
    tipo === "VENDA_FUNCIONARIO" ? "VENDA FUNCIONÁRIO" :
    tipo || "—";

  return (
    <span className="rounded-lg bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700 ring-1 ring-orange-200">
      {label}
    </span>
  );
}

function StatusBadge({ status }) {
  const cfg = {
    pendente: ["PENDENTE LIQUIDA", "bg-amber-50 text-amber-700 ring-amber-200"],
    concluido: ["TRANSFERIDO", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
    cancelado: ["DEVOLVIDO", "bg-slate-100 text-slate-600 ring-slate-200"],
    erro: ["ERRO", "bg-rose-50 text-rose-700 ring-rose-200"],
    processando: ["PROCESSANDO", "bg-blue-50 text-blue-700 ring-blue-200"],
  };
  const [label, cls] = cfg[status] || [status, "bg-slate-100 text-slate-600 ring-slate-200"];
  return <span className={"rounded-lg px-2 py-1 text-[10px] font-black ring-1 " + cls}>{label}</span>;
}

export default function DesvinculacoesLiquidaV2Page() {
  const [items, setItems] = useState([]);
  const [aba, setAba] = useState("pendentes");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState("");
  const [acao, setAcao] = useState(null);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      setItems(await listarSolicitacoesDesvinculacao());
    } catch (e) {
      setErro(e.message || "Não foi possível carregar a fila.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const pendentes = useMemo(
    () => items.filter((x) => ["pendente", "processando"].includes(x.status)),
    [items]
  );
  const historico = useMemo(
    () => items.filter((x) => !["pendente", "processando"].includes(x.status)),
    [items]
  );
  const lista = aba === "pendentes" ? pendentes : historico;

  function abrir(item, tipo) {
    setAcao({ item, tipo });
    setMotivo(
      tipo === "transferir"
        ? "Transferência autorizada pela Liquida Preço para atendimento do pedido B2C."
        : "Devolver para a Assurant realizar nova definição."
    );
    setErro("");
    setFeedback("");
  }

  async function confirmar() {
    if (!acao?.item || motivo.trim().length < 3) {
      setErro("Informe uma justificativa com pelo menos 3 caracteres.");
      return;
    }
    setSalvando(true);
    setErro("");
    try {
      if (acao.tipo === "transferir") {
        const res = await processarSolicitacaoDesvinculacao(acao.item.id, motivo);
        setFeedback(
          `IMEI ${res.imei} transferido para o B2C #${res.id_anymarket}. O vínculo anterior foi encerrado sem rearmazenagem.`
        );
      } else {
        await cancelarSolicitacaoDesvinculacao(acao.item.id, motivo);
        setFeedback("Solicitação devolvida para a Assurant realizar uma nova definição.");
      }
      setAcao(null);
      setMotivo("");
      await carregar();
    } catch (e) {
      setErro(e.message || "Não foi possível concluir a ação.");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5 text-violet-700" />
              <h1 className="text-lg font-black text-slate-900">Desvinculações para B2C</h1>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              Fila exclusiva da Liquida Preço. A Assurant escolhe o produto; a Liquida valida e transfere vínculos B2B, Troca ou Venda Funcionário para o B2C sem retirar o aparelho da posição física do WMS.
            </p>
          </div>
          <button
            type="button"
            onClick={carregar}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"
          >
            <RefreshCw className={"h-3.5 w-3.5 " + (loading ? "animate-spin" : "")} />
            Atualizar
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200">
            <div className="text-[9px] font-black uppercase text-amber-700">Pendentes</div>
            <div className="mt-1 text-2xl font-black text-amber-900">{pendentes.length}</div>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-200">
            <div className="text-[9px] font-black uppercase text-emerald-700">Transferidos</div>
            <div className="mt-1 text-2xl font-black text-emerald-900">
              {items.filter((x) => x.status === "concluido").length}
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="text-[9px] font-black uppercase text-slate-500">Total histórico</div>
            <div className="mt-1 text-2xl font-black text-slate-900">{items.length}</div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
          {feedback}
        </div>
      )}
      {erro && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
          {erro}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ["pendentes", "Pendentes", pendentes.length],
          ["historico", "Histórico", historico.length],
        ].map(([key, label, qtd]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            className={
              "border-b-2 px-4 py-2 text-sm font-semibold " +
              (aba === key ? "border-violet-700 text-violet-800" : "border-transparent text-slate-500")
            }
          >
            {label}
            <span className="ml-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{qtd}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-36 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-violet-700" />
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          Nenhuma solicitação nesta situação.
        </div>
      ) : (
        <div className="space-y-3">
          {lista.map((item) => {
            const d = item.vinculo_detalhes || {};
            const local = d.local || item.resultado?.local || "—";
            const exportado = Boolean(d.b2b_exportado);
            return (
              <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={item.status} />
                      <VinculoBadge tipo={item.vinculo_tipo} />
                      <span className="text-sm font-black text-slate-900">B2C #{item.id_anymarket}</span>
                      <span className="text-xs text-slate-400">{item.marketplace || "—"}</span>
                    </div>
                    <div className="mt-2 text-sm font-bold text-slate-700">{item.titulo_produto || "—"}</div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
                      <span className="rounded-lg bg-slate-50 px-2 py-1 font-mono font-bold">IMEI {item.imei}</span>
                      <span className="rounded-lg bg-slate-50 px-2 py-1">{item.sku_destino}</span>
                      <span className="rounded-lg bg-slate-50 px-2 py-1">{item.grade_destino}</span>
                      {item.cor_destino && <span className="rounded-lg bg-slate-50 px-2 py-1">{item.cor_destino}</span>}
                    </div>
                  </div>
                  <div className="text-right text-[10px] text-slate-400">
                    <div>Solicitado em {fmtData(item.solicitado_em)}</div>
                    <div>{item.solicitado_por_nome || "Usuário Assurant"}</div>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-slate-400">
                      <Warehouse className="h-3 w-3" /> WMS
                    </div>
                    <div className="mt-1 text-xs font-black text-slate-800">{local}</div>
                    <div className="mt-1 text-[10px] text-slate-400">Posição física será preservada</div>
                  </div>

                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-orange-700">
                      <Package className="h-3 w-3" /> Vínculo atual
                    </div>
                    <div className="mt-1 text-xs font-black text-orange-900">
                      {d.descricao || item.vinculo_referencia || item.vinculo_tipo}
                    </div>
                    {d.b2b_status && <div className="mt-1 text-[10px] text-orange-700">Status B2B: {d.b2b_status}</div>}
                  </div>

                  <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                    <div className="flex items-center gap-1.5 text-[9px] font-black uppercase text-violet-700">
                      <ShoppingCart className="h-3 w-3" /> Destino
                    </div>
                    <div className="mt-1 text-xs font-black text-violet-900">Pedido B2C #{item.id_anymarket}</div>
                    <div className="mt-1 text-[10px] text-violet-700">Após aprovação segue para Picking</div>
                  </div>
                </div>

                {exportado && item.status === "pendente" && (
                  <div className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-800">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Este item B2B já foi exportado para faturamento. A transferência marcará o item como Não Faturar e ficará registrada para revisão.
                  </div>
                )}

                {item.status === "pendente" ? (
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => abrir(item, "devolver")}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-700"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      Devolver para Assurant
                    </button>
                    <button
                      type="button"
                      onClick={() => abrir(item, "transferir")}
                      className="inline-flex items-center gap-2 rounded-xl bg-violet-800 px-4 py-2 text-xs font-black text-white"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Transferir para B2C
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 border-t border-slate-100 pt-3 text-[10px] text-slate-500">
                    {item.resolvido_em ? `Resolvido em ${fmtData(item.resolvido_em)} por ${item.resolvido_por_nome || "Liquida Preço"}` : "—"}
                    {item.motivo_resolucao ? ` · ${item.motivo_resolucao}` : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {acao && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4" onMouseDown={() => !salvando && setAcao(null)}>
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between border-b border-slate-100 p-5">
              <div>
                <div className="text-base font-black text-slate-900">
                  {acao.tipo === "transferir" ? "Confirmar transferência para B2C" : "Devolver para nova definição"}
                </div>
                <div className="mt-1 text-xs text-slate-400">
                  IMEI {acao.item.imei} · B2C #{acao.item.id_anymarket}
                </div>
              </div>
              <button type="button" disabled={salvando} onClick={() => setAcao(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-5">
              {acao.tipo === "transferir" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  A ação encerra o vínculo operacional atual e reserva o mesmo ciclo físico do WMS para o B2C. <strong>Não haverá retorno para Aguardando armazenagem.</strong>
                </div>
              )}
              <div>
                <label className="mb-1 block text-[10px] font-black uppercase text-slate-400">Justificativa *</label>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-slate-200 p-3 text-sm outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" disabled={salvando} onClick={() => setAcao(null)} className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600">
                  Voltar
                </button>
                <button
                  type="button"
                  disabled={salvando || motivo.trim().length < 3}
                  onClick={confirmar}
                  className={
                    "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black text-white disabled:opacity-40 " +
                    (acao.tipo === "transferir" ? "bg-violet-800" : "bg-slate-800")
                  }
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : acao.tipo === "transferir" ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}
                  {acao.tipo === "transferir" ? "Confirmar transferência" : "Devolver solicitação"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
