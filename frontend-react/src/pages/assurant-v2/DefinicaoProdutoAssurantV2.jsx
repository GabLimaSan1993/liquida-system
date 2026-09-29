import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CornerUpLeft,
  Loader2,
  Palette,
  RefreshCw,
  Search,
  ShieldCheck,
  Smartphone,
  X,
  Zap,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";
import {
  aprovarDefinicaoProduto,
  buscarOpcoesDefinicao,
  cancelarPedidoDefinicao,
  listarDefinicaoCancelados,
  listarDefinicaoConcluidos,
  listarPedidosAguardandoDefinicao,
} from "../../services/pedidosB2CService.js";

function fmtN(v) {
  return Number(v || 0).toLocaleString("pt-BR");
}

function fmtData(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
  });
}

function skuBase(v) {
  return String(v || "").replace(/-CC\d+$/i, "").trim();
}

function Card({ children, className = "" }) {
  return (
    <div className={"rounded-2xl border border-slate-200 bg-white shadow-sm " + className}>
      {children}
    </div>
  );
}

function GradePill({ grade, outlet = false }) {
  const g = String(grade || "").toLowerCase();
  const cls =
    g.includes("like new") ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
    g.includes("excelente") ? "bg-blue-50 text-blue-700 ring-blue-200" :
    g.includes("muito bom") ? "bg-violet-50 text-violet-700 ring-violet-200" :
    g === "bom" ? "bg-amber-50 text-amber-700 ring-amber-200" :
    g.includes("outlet") ? "bg-orange-50 text-orange-700 ring-orange-200" :
    "bg-slate-50 text-slate-600 ring-slate-200";

  return (
    <span className={"inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ring-1 " + cls}>
      {outlet && <Zap className="h-3 w-3 fill-current" />}
      {grade || "—"}
    </span>
  );
}

function RelationPill({ relacao }) {
  if (relacao === "upgrade") {
    return (
      <span className="rounded-lg bg-fuchsia-50 px-2 py-1 text-[10px] font-black text-fuchsia-700 ring-1 ring-fuchsia-200">
        UPGRADE
      </span>
    );
  }

  if (relacao === "downgrade") {
    return (
      <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700 ring-1 ring-rose-200">
        GRADE INFERIOR
      </span>
    );
  }

  return (
    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">
      MESMA GRADE
    </span>
  );
}

export default function DefinicaoProdutoAssurantV2() {
  const { user } = useAuth();
  const [pedidos, setPedidos] = useState([]);
  const [concluidos, setConcluidos] = useState([]);
  const [cancelados, setCancelados] = useState([]);
  const [aba, setAba] = useState("pendentes");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [feedback, setFeedback] = useState(null);

  const [pedido, setPedido] = useState(null);
  const [sku, setSku] = useState("");
  const [consulta, setConsulta] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [opcao, setOpcao] = useState(null);
  const [cienteUpgrade, setCienteUpgrade] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [cancelar, setCancelar] = useState(null);
  const [cancelando, setCancelando] = useState(false);

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const [p, c, x] = await Promise.all([
        listarPedidosAguardandoDefinicao(),
        listarDefinicaoConcluidos(),
        listarDefinicaoCancelados(),
      ]);
      setPedidos(p || []);
      setConcluidos(c || []);
      setCancelados(x || []);
    } catch (e) {
      setErro(e.message || "Não foi possível carregar as definições.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
  }, []);

  async function consultarSku(valor = sku, pedidoAtual = pedido) {
    const q = String(valor || "").trim();
    if (!q || !pedidoAtual) {
      setConsulta(null);
      return;
    }

    setBuscando(true);
    setErro("");
    setOpcao(null);
    setCienteUpgrade(false);

    try {
      const data = await buscarOpcoesDefinicao(q, pedidoAtual);
      setConsulta(data);
    } catch (e) {
      setConsulta(null);
      setErro(e.message || "Falha ao consultar opções.");
    } finally {
      setBuscando(false);
    }
  }

  function abrir(p) {
    const base = skuBase(p.sku_produto);
    setPedido(p);
    setSku(base);
    setConsulta(null);
    setOpcao(null);
    setCienteUpgrade(false);
    setTimeout(() => consultarSku(base, p), 0);
  }

  function fechar() {
    if (salvando) return;
    setPedido(null);
    setConsulta(null);
    setOpcao(null);
    setCienteUpgrade(false);
  }

  async function confirmar() {
    if (!pedido || !opcao?.fifo) return;

    if (opcao.relacao === "downgrade") {
      setFeedback({
        tipo: "erro",
        msg: "Grade inferior ao pedido não pode ser aprovada.",
      });
      return;
    }

    if (opcao.relacao === "upgrade" && !cienteUpgrade) {
      setFeedback({
        tipo: "erro",
        msg: "Confirme a ciência do upgrade antes de continuar.",
      });
      return;
    }

    setSalvando(true);
    setErro("");

    try {
      const res = await aprovarDefinicaoProduto(
        pedido.id,
        {
          sku: consulta.skuBase,
          grade: opcao.grade,
          cor: opcao.cor,
          imei: opcao.fifo.imei,
          upgradeConfirmado: opcao.relacao === "upgrade" ? cienteUpgrade : false,
          vinculoTipo: opcao.vinculo_tipo || null,
          vinculoReferencia: opcao.vinculo_referencia || null,
        },
        user.id
      );

      setFeedback({
        tipo: "ok",
        msg: res.aguardandoDesvinculacao
          ? `Produto selecionado. O IMEI ${res.imei} está vinculado a ${res.vinculoDescricao || res.vinculoTipo}. A solicitação foi enviada para a Liquida Preço realizar a transferência para o B2C.`
          : res.relacao === "upgrade"
            ? `Upgrade aprovado e registrado: ${consulta.gradeOrigem} → ${res.grade}. IMEI FIFO ${res.imei} alocado.`
            : `Definição aprovada. IMEI FIFO ${res.imei} alocado em ${res.grade} · ${res.cor}.`,
      });

      fechar();
      await carregar();
    } catch (e) {
      const msg = e.message || "Não foi possível concluir a definição.";
      const estoqueMudou =
        /mudou no WMS|não está mais disponível|posição ocupada e confirmada|acabou de ser reservada|reservada por outro fluxo/i.test(msg);

      if (estoqueMudou) {
        await consultarSku(sku, pedido);
        setFeedback({
          tipo: "erro",
          msg: "O estoque mudou enquanto a definição era confirmada. As opções já foram atualizadas automaticamente; selecione uma das alternativas exibidas.",
        });
        setErro("");
      } else {
        setErro(msg);
      }
    } finally {
      setSalvando(false);
    }
  }

  async function confirmarCancelamento() {
    if (!cancelar) return;
    setCancelando(true);
    try {
      await cancelarPedidoDefinicao(cancelar.id, user.id);
      setFeedback({
        tipo: "ok",
        msg: `Pedido #${cancelar.id_anymarket} cancelado.`,
      });
      setCancelar(null);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setCancelando(false);
    }
  }

  const lista = useMemo(() => {
    if (aba === "concluidos") return concluidos;
    if (aba === "cancelados") return cancelados;
    return pedidos;
  }, [aba, pedidos, concluidos, cancelados]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-[#7F2D92]" />
              <h3 className="text-sm font-black text-slate-800">
                Aguardando Definição · Assurant
              </h3>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
              A Assurant escolhe a alternativa comercial. Itens livres seguem direto para o B2C; itens vinculados a B2B, Troca ou Venda Funcionário geram uma solicitação para a Liquida Preço autorizar a transferência.
            </p>
          </div>
          <button
            type="button"
            onClick={carregar}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </button>
        </div>
      </Card>

      {erro && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
          {erro}
        </div>
      )}

      {feedback && (
        <div
          className={
            "rounded-xl px-4 py-3 text-xs font-bold ring-1 " +
            (feedback.tipo === "ok"
              ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
              : "bg-rose-50 text-rose-700 ring-rose-200")
          }
        >
          {feedback.msg}
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {[
          ["pendentes", "Pendentes", pedidos.length],
          ["concluidos", "Concluídos", concluidos.length],
          ["cancelados", "Cancelados", cancelados.length],
        ].map(([key, label, qtd]) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            className={
              "border-b-2 px-4 py-2 text-sm font-semibold transition " +
              (aba === key
                ? "border-[#7F2D92] text-[#7F2D92]"
                : "border-transparent text-slate-500")
            }
          >
            {label}
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
              {fmtN(qtd)}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#7F2D92]" />
        </div>
      ) : lista.length === 0 ? (
        <Card className="p-10 text-center text-sm text-slate-400">
          Nenhum pedido nesta situação.
        </Card>
      ) : (
        <div className="space-y-3">
          {lista.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-black text-slate-900">
                      #{p.id_anymarket}
                    </span>
                    <span className="text-xs text-slate-400">{p.marketplace || "—"}</span>
                    <GradePill grade={p.grade_definida || p.grade_produto} />
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-700">
                    {p.titulo_produto || "—"}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="font-mono">{p.sku_definido || p.sku_produto || "—"}</span>
                    {p.definicao_solicitada_em && (
                      <span className="inline-flex items-center gap-1 text-amber-600">
                        <Clock3 className="h-3 w-3" />
                        desde {fmtData(p.definicao_solicitada_em)}
                      </span>
                    )}
                  </div>
                  {p.definicao_status === "aguardando_desvinculacao" && (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 px-2.5 py-1.5 text-[10px] font-black text-orange-700 ring-1 ring-orange-200">
                      <Clock3 className="h-3 w-3" />
                      Aguardando ação da Liquida Preço
                    </div>
                  )}
                  {p.definicao_resumo && (
                    <div className={"mt-2 text-xs font-semibold " + (p.definicao_status === "aguardando_desvinculacao" ? "text-orange-700" : "text-emerald-700")}>
                      {p.definicao_resumo}
                    </div>
                  )}
                </div>

                {aba === "pendentes" && (
                  p.definicao_status === "aguardando_desvinculacao" ? (
                    <div className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-black text-orange-700 ring-1 ring-orange-200">
                      Liquida Preço
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => abrir(p)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-[#7F2D92] px-3 py-2 text-xs font-black text-white hover:bg-[#682378]"
                      >
                        <CornerUpLeft className="h-3.5 w-3.5" />
                        Definir
                      </button>
                      <button
                        type="button"
                        onClick={() => setCancelar(p)}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 ring-1 ring-rose-200"
                      >
                        <Ban className="h-3.5 w-3.5" />
                        Cancelado
                      </button>
                    </div>
                  )
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {pedido && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={fechar}
        >
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white px-5 py-4">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  Definição pela Assurant
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Pedido #{pedido.id_anymarket} · grade comprada:{" "}
                  <span className="font-black">{consulta?.gradeOrigem || pedido.grade_produto || "—"}</span>
                </p>
              </div>
              <button type="button" onClick={fechar} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Produto originalmente vendido
                </div>
                <div className="mt-1 text-sm font-bold text-slate-800">
                  {pedido.titulo_produto}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono">{pedido.sku_produto}</span>
                  <GradePill grade={consulta?.gradeOrigem || pedido.grade_produto} />
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  consultarSku();
                }}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <div className="relative flex-1">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    placeholder="Digite o SKU substituto"
                    className="h-10 w-full rounded-xl border border-slate-200 pl-9 pr-3 text-sm font-semibold outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                <button
                  type="submit"
                  disabled={buscando || !sku.trim()}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 text-xs font-black text-white disabled:opacity-40"
                >
                  {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  Consultar estoque
                </button>
              </form>

              {consulta && !consulta.existe && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                  SKU não encontrado.
                </div>
              )}

              {consulta?.existe && consulta.opcoes.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-700">
                  SKU encontrado, mas não há estoque elegível no WMS. Regular e Quebrado não são exibidos.
                </div>
              )}

              {consulta?.existe && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-slate-800">
                        Vínculos deste SKU sem NF
                      </div>
                      <div className="mt-0.5 text-xs text-slate-400">
                        Pedidos B2B e B2C ainda não faturados para {consulta.skuBase}.
                      </div>
                    </div>
                    <div className="flex gap-2 text-[10px] font-black">
                      <span className="rounded-lg bg-violet-50 px-2 py-1 text-violet-700 ring-1 ring-violet-200">
                        B2C {(consulta.vinculosSku || []).filter((v) => v.canal === "B2C").length}
                      </span>
                      <span className="rounded-lg bg-orange-50 px-2 py-1 text-orange-700 ring-1 ring-orange-200">
                        B2B {(consulta.vinculosSku || []).filter((v) => v.canal === "B2B").length}
                      </span>
                    </div>
                  </div>

                  {(consulta.vinculosSku || []).length === 0 ? (
                    <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-white p-3 text-xs text-slate-400">
                      Nenhum pedido B2B ou B2C sem NF encontrado para este SKU.
                    </div>
                  ) : (
                    <div className="mt-3 max-h-52 space-y-2 overflow-y-auto pr-1">
                      {(consulta.vinculosSku || []).map((v) => (
                        <div
                          key={[v.canal, v.item_id, v.referencia].join("|")}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={
                                "rounded-lg px-2 py-1 text-[10px] font-black ring-1 " +
                                (v.canal === "B2C"
                                  ? "bg-violet-50 text-violet-700 ring-violet-200"
                                  : "bg-orange-50 text-orange-700 ring-orange-200")
                              }>
                                {v.canal}
                              </span>
                              <span className="text-xs font-black text-slate-800">
                                {v.canal === "B2C"
                                  ? `Pedido #${v.referencia}`
                                  : `Lote ${v.lote || v.referencia}`}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400">
                                {v.status || "—"}
                              </span>
                            </div>
                            <span className="font-mono text-[10px] font-bold text-slate-500">
                              {v.imei ? `IMEI ${v.imei}` : "sem IMEI alocado"}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-500">
                            {v.grade && <span>Grade: <strong>{v.grade}</strong></span>}
                            {v.marketplace && <span>{v.marketplace}</span>}
                            {v.cliente && <span>{v.cliente}</span>}
                            {v.local && <span>WMS: {v.local}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {consulta?.opcoes?.length > 0 && (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-sm font-black text-slate-800">
                        Opções de atendimento
                      </div>
                      <div className="text-xs text-slate-400">
                        {consulta.modelo || consulta.skuBase} · itens livres e vínculos operacionais elegíveis
                      </div>
                    </div>
                    <div className="text-xs font-bold text-slate-500">
                      {consulta.opcoes.reduce((s, x) => s + Number(x.quantidade || 0), 0)} aparelho(s)
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {consulta.opcoes.map((o) => {
                      const selecionada =
                        opcao?.grade === o.grade &&
                        opcao?.cor === o.cor &&
                        opcao?.fifo?.imei === o.fifo?.imei;
                      const bloqueada = o.relacao === "downgrade";
                      const vinculada = Boolean(o.vinculo_tipo);

                      return (
                        <button
                          key={[o.grade, o.cor, o.vinculo_tipo || "LIVRE", o.vinculo_referencia || "", o.fifo?.imei].join("|")}
                          type="button"
                          disabled={bloqueada}
                          onClick={() => {
                            setOpcao(o);
                            setCienteUpgrade(false);
                          }}
                          className={
                            "rounded-2xl border p-4 text-left transition " +
                            (selecionada
                              ? "border-violet-400 bg-violet-50 ring-2 ring-violet-100"
                              : bloqueada
                              ? "cursor-not-allowed border-slate-200 bg-slate-50 opacity-55"
                              : "border-slate-200 bg-white hover:border-violet-300 hover:bg-violet-50/30")
                          }
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <GradePill grade={o.grade} outlet={o.outlet} />
                              <RelationPill relacao={o.relacao} />
                              {vinculada ? (
                                <span className="rounded-lg bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700 ring-1 ring-orange-200">
                                  {o.vinculo_tipo === "B2C"
                                    ? "VÍNCULO B2C"
                                    : o.vinculo_tipo === "B2B"
                                      ? "VÍNCULO B2B"
                                      : o.vinculo_tipo === "TROCA"
                                        ? "RESERVADO TROCA"
                                        : "VENDA FUNCIONÁRIO"}
                                </span>
                              ) : (
                                <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700 ring-1 ring-emerald-200">
                                  LIVRE
                                </span>
                              )}
                            </div>
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600">
                              {o.quantidade} un.
                            </span>
                          </div>

                          <div className="mt-3 flex items-center gap-2">
                            <Palette className="h-4 w-4 text-slate-400" />
                            <span className="text-sm font-black text-slate-800">{o.cor}</span>
                          </div>

                          <div className="mt-3 rounded-xl bg-slate-50 p-3">
                            <div className="text-[10px] font-black uppercase text-slate-400">
                              IMEI selecionado · FIFO
                            </div>
                            <div className="mt-1 font-mono text-xs font-black text-slate-700">
                              {o.fifo?.imei}
                            </div>
                            <div className="mt-1 text-[10px] text-slate-400">
                              Subinv {o.fifo?.data_subinv || "—"} · {o.fifo?.local || "sem posição"}
                            </div>
                            {vinculada && (
                              <div className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-2 text-[10px] font-bold leading-4 text-orange-800">
                                {o.vinculo_descricao || o.vinculo_tipo}
                                {o.vinculo_detalhes?.b2c_status ? ` · status ${o.vinculo_detalhes.b2c_status}` : ""}
                                {o.vinculo_detalhes?.b2b_status ? ` · status ${o.vinculo_detalhes.b2b_status}` : ""}
                                {o.vinculo_detalhes?.b2b_exportado ? " · já exportado para faturamento" : ""}
                                <div className="mt-1 font-semibold text-orange-700">
                                  Se esta opção for escolhida, a Liquida Preço precisará autorizar a desvinculação antes do B2C seguir.
                                </div>
                              </div>
                            )}
                          </div>

                          {bloqueada && (
                            <div className="mt-2 text-[10px] font-bold text-rose-600">
                              Grade inferior ao produto comprado — não permitida.
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {opcao?.relacao === "upgrade" && (
                <div className="rounded-2xl border border-fuchsia-200 bg-fuchsia-50 p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-fuchsia-700" />
                    <div className="flex-1">
                      <div className="text-sm font-black text-fuchsia-900">
                        Você está ciente de que está realizando um upgrade?
                      </div>
                      <p className="mt-1 text-xs leading-5 text-fuchsia-800">
                        O pedido foi vendido como <strong>{consulta.gradeOrigem}</strong> e será atendido com{" "}
                        <strong>{opcao.grade}</strong>. Esta aprovação ficará registrada com usuário, data, IMEI, SKU e cor.
                      </p>
                      <label className="mt-3 flex cursor-pointer items-start gap-2 rounded-xl bg-white/70 p-3 ring-1 ring-fuchsia-200">
                        <input
                          type="checkbox"
                          checked={cienteUpgrade}
                          onChange={(e) => setCienteUpgrade(e.target.checked)}
                          className="mt-0.5 h-4 w-4 rounded border-fuchsia-300 text-fuchsia-700"
                        />
                        <span className="text-xs font-bold text-fuchsia-900">
                          Sim. Estou ciente e aprovo este upgrade.
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {opcao && (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Definição selecionada
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-black text-slate-700">
                      {consulta.skuBase}
                    </span>
                    <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
                    <GradePill grade={opcao.grade} outlet={opcao.outlet} />
                    <span className="text-xs font-black text-slate-700">{opcao.cor}</span>
                    <span className="font-mono text-xs text-slate-500">{opcao.fifo?.imei}</span>
                  </div>
                  {opcao.vinculo_tipo && (
                    <div className="mt-2 rounded-xl border border-orange-200 bg-orange-50 p-3 text-xs font-bold text-orange-800">
                      Este aparelho está vinculado a {opcao.vinculo_descricao || opcao.vinculo_tipo}. A escolha gera uma solicitação para a Liquida Preço; a Assurant não executa a desvinculação.
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
                <button
                  type="button"
                  onClick={fechar}
                  className="rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-600"
                >
                  Voltar
                </button>
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={
                    salvando ||
                    !opcao ||
                    opcao.relacao === "downgrade" ||
                    (opcao.relacao === "upgrade" && !cienteUpgrade)
                  }
                  className="inline-flex items-center gap-2 rounded-xl bg-[#7F2D92] px-5 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {opcao?.vinculo_tipo ? "Solicitar desvinculação à Liquida" : "Aprovar e alocar FIFO"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelar && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4"
          onMouseDown={() => setCancelar(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 text-rose-700">
              <AlertTriangle className="h-5 w-5" />
              <h3 className="font-black">Cancelar pedido?</h3>
            </div>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              O pedido #{cancelar.id_anymarket} será marcado como cancelado no fluxo de definição.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelar(null)}
                className="rounded-xl bg-slate-100 px-4 py-2 text-xs font-black text-slate-600"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={cancelando}
                onClick={confirmarCancelamento}
                className="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
              >
                {cancelando && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirmar cancelamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
