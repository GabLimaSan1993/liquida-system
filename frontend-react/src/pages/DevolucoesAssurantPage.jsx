import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  FileText,
  Loader2,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  Truck,
  UserRound,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  CATEGORIAS_DEVOLUCAO,
  atualizarPostagemDevolucao,
  buscarPedidoParaDevolucao,
  criarSolicitacaoDevolucao,
  definirImeiDivergenteDevolucao,
  informarRiDestinoDevolucao,
  listarDevolucoes,
  listarHistoricoDevolucao,
  resolverBloqueioDevolucao,
  rotuloResponsavelDevolucao,
  rotuloStatusDevolucao,
} from "../services/devolucoesService.js";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-slate-100";
const labelCls = "mb-1 block text-xs font-bold text-slate-600";

const DESTINOS_FINAIS = [
  ["estoque", "Retornar ao estoque"],
  ["cliente", "Retornar ao cliente"],
  ["reembolso", "Reembolso"],
  ["reparo", "Enviar para reparo"],
  ["descarte", "Descarte"],
  ["outro", "Outro destino"],
];

function agoraLocal() {
  const data = new Date();
  const deslocamento = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 16);
}

function formatarData(valor, incluirHora = true) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR", incluirHora
    ? { dateStyle: "short", timeStyle: "short" }
    : { dateStyle: "short" });
}

function formatarMoeda(valor) {
  if (valor == null || valor === "") return "—";
  return Number(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {children}
    </div>
  );
}

function Aviso({ tipo = "erro", children }) {
  const sucesso = tipo === "sucesso";
  return (
    <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-semibold ring-1 ${
      sucesso
        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
        : "bg-red-50 text-red-700 ring-red-200"
    }`}>
      {sucesso
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function Campo({ rotulo, valor, mono = false }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 break-words text-sm font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>
        {valor || "—"}
      </p>
    </div>
  );
}

const CORES_STATUS = {
  solicitada: "bg-blue-50 text-blue-700 ring-blue-200",
  aguardando_postagem: "bg-amber-50 text-amber-700 ring-amber-200",
  em_transito: "bg-sky-50 text-sky-700 ring-sky-200",
  aguardando_recebimento: "bg-sky-50 text-sky-700 ring-sky-200",
  aguardando_triagem: "bg-violet-50 text-violet-700 ring-violet-200",
  em_triagem: "bg-violet-50 text-violet-700 ring-violet-200",
  aguardando_definicao_assurant: "bg-red-50 text-red-700 ring-red-200",
  bloqueado_aguardando_cliente: "bg-red-50 text-red-700 ring-red-200",
  aguardando_rma_aut: "bg-orange-50 text-orange-700 ring-orange-200",
  aguardando_ri: "bg-amber-50 text-amber-700 ring-amber-200",
  aguardando_finalizacao: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  aguardando_armazenagem: "bg-purple-50 text-purple-700 ring-purple-200",
  aguardando_oracle: "bg-purple-50 text-purple-700 ring-purple-200",
  em_estoque: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  finalizada: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  cancelada: "bg-slate-100 text-slate-600 ring-slate-200",
};

function StatusBadge({ status }) {
  return (
    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${
      CORES_STATUS[status] || "bg-slate-50 text-slate-600 ring-slate-200"
    }`}>
      {rotuloStatusDevolucao(status)}
    </span>
  );
}

function ItemPedido({ item, selecionado, onSelecionar }) {
  return (
    <button
      type="button"
      disabled={item.devolucao_aberta}
      onClick={() => onSelecionar(item)}
      className={`w-full rounded-2xl p-4 text-left ring-1 transition ${
        selecionado
          ? "bg-purple-50 ring-2 ring-[#7F2D92]"
          : item.devolucao_aberta
            ? "cursor-not-allowed bg-slate-50 opacity-70 ring-slate-200"
            : "bg-white ring-slate-200 hover:bg-purple-50 hover:ring-purple-300"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-black text-purple-700">
              Item {item.item_seq ?? "—"}
            </span>
            <span className="text-xs font-semibold text-slate-400">{item.marketplace || "Marketplace não informado"}</span>
          </div>
          <p className="text-sm font-black text-slate-800">{item.produto || "Produto não informado"}</p>
          <p className="mt-1 text-xs text-slate-500">
            SKU: <span className="font-mono font-bold">{item.sku || "—"}</span>
            {item.grade ? ` · Grade: ${item.grade}` : ""}
          </p>
        </div>
        {item.devolucao_aberta ? (
          <div className="text-right">
            <StatusBadge status={item.status_devolucao} />
            <p className="mt-2 text-[10px] font-bold text-slate-400">DEVOLUÇÃO #{item.protocolo_devolucao}</p>
          </div>
        ) : (
          <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-2 ${
            selecionado ? "bg-[#7F2D92] text-white ring-purple-200" : "bg-white text-transparent ring-slate-300"
          }`}>
            <CheckCircle2 className="h-4 w-4" />
          </div>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <div><span className="text-slate-400">Cliente</span><p className="truncate font-bold text-slate-700">{item.nome_cliente || "—"}</p></div>
        <div><span className="text-slate-400">IMEI vendido</span><p className="truncate font-mono font-bold text-slate-700">{item.imei_vendido || "—"}</p></div>
        <div><span className="text-slate-400">NF venda</span><p className="font-bold text-slate-700">{item.numero_nf || "—"}</p></div>
        <div><span className="text-slate-400">Valor</span><p className="font-bold text-slate-700">{formatarMoeda(item.valor_venda)}</p></div>
      </div>
      {item.devolucao_aberta && (
        <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
          Este item já possui uma devolução em andamento e não pode ser selecionado novamente.
        </p>
      )}
    </button>
  );
}

function NovaSolicitacao({ onCriada }) {
  const { user } = useAuth();
  const [idAnymarket, setIdAnymarket] = useState("");
  const [itens, setItens] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [sucesso, setSucesso] = useState("");
  const [form, setForm] = useState({
    dataSolicitacao: agoraLocal(),
    pedidoPortal: "",
    categoriaMotivo: "",
    motivo: "",
    comentarios: "",
    codigoRastreio: "",
    statusPostagem: "Aguardando postagem",
    reembolsoFinalizado: false,
  });

  function setCampo(campo, valor) {
    setForm(anterior => ({ ...anterior, [campo]: valor }));
  }

  async function pesquisar(evento) {
    evento?.preventDefault();
    setErro("");
    setSucesso("");
    setSelecionado(null);
    setItens([]);
    if (!idAnymarket.trim()) {
      setErro("Informe o ID AnyMarket.");
      return;
    }

    setBuscando(true);
    try {
      const resultado = await buscarPedidoParaDevolucao(idAnymarket);
      setItens(resultado);
      if (!resultado.length) setErro("Nenhum pedido foi encontrado com esse ID AnyMarket.");
      if (resultado.length === 1 && !resultado[0].devolucao_aberta) setSelecionado(resultado[0]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setBuscando(false);
    }
  }

  async function salvar(evento) {
    evento.preventDefault();
    setErro("");
    setSucesso("");
    if (!selecionado) return setErro("Selecione o item que está sendo devolvido.");
    if (!form.motivo.trim()) return setErro("Informe o motivo da devolução.");
    if (!form.categoriaMotivo) return setErro("Selecione a categoria do motivo.");

    setSalvando(true);
    try {
      const resultado = await criarSolicitacaoDevolucao({
        pedidoB2cId: selecionado.pedido_b2c_id,
        dataSolicitacao: form.dataSolicitacao,
        pedidoPortal: form.pedidoPortal,
        motivo: form.motivo,
        categoriaMotivo: form.categoriaMotivo,
        comentarios: form.comentarios,
        codigoRastreio: form.codigoRastreio,
        statusPostagem: form.statusPostagem,
        reembolsoFinalizado: form.reembolsoFinalizado,
        usuarioId: user.id,
      });

      setSucesso(`Devolução #${resultado.protocolo} criada com sucesso.`);
      setItens(anterior => anterior.map(item => item.pedido_b2c_id === selecionado.pedido_b2c_id
        ? {
            ...item,
            devolucao_aberta: true,
            devolucao_id: resultado.devolucao_id,
            protocolo_devolucao: resultado.protocolo,
            status_devolucao: resultado.status,
          }
        : item));
      setSelecionado(null);
      setForm({
        dataSolicitacao: agoraLocal(),
        pedidoPortal: "",
        categoriaMotivo: "",
        motivo: "",
        comentarios: "",
        codigoRastreio: "",
        statusPostagem: "Aguardando postagem",
        reembolsoFinalizado: false,
      });
      onCriada?.();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Card>
        <div className="mb-4 flex items-center gap-3">
          <div className="rounded-xl bg-purple-100 p-2.5 text-purple-700"><Search className="h-5 w-5" /></div>
          <div>
            <h2 className="font-black text-slate-800">Localizar pedido</h2>
            <p className="text-xs text-slate-500">O sistema buscará todos os itens pertencentes ao pedido.</p>
          </div>
        </div>
        <form onSubmit={pesquisar} className="flex flex-col gap-2 sm:flex-row">
          <input
            value={idAnymarket}
            onChange={e => setIdAnymarket(e.target.value)}
            className={inputCls}
            placeholder="Digite o ID AnyMarket"
          />
          <button
            type="submit"
            disabled={buscando}
            className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-[#7F2D92] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#632276] disabled:opacity-50"
          >
            {buscando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            {buscando ? "Buscando..." : "Buscar pedido"}
          </button>
        </form>
      </Card>

      {erro && <Aviso>{erro}</Aviso>}
      {sucesso && <Aviso tipo="sucesso">{sucesso}</Aviso>}

      {itens.length > 0 && (
        <Card>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-black text-slate-800">Itens encontrados</h2>
              <p className="text-xs text-slate-500">Selecione exatamente o produto que retornará.</p>
            </div>
            <span className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
              {itens.length} {itens.length === 1 ? "item" : "itens"}
            </span>
          </div>
          <div className="space-y-3">
            {itens.map(item => (
              <ItemPedido
                key={item.pedido_b2c_id}
                item={item}
                selecionado={selecionado?.pedido_b2c_id === item.pedido_b2c_id}
                onSelecionar={setSelecionado}
              />
            ))}
          </div>
        </Card>
      )}

      {selecionado && (
        <form onSubmit={salvar} className="space-y-4">
          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><Package className="h-5 w-5" /></div>
              <div>
                <h2 className="font-black text-slate-800">Produto selecionado</h2>
                <p className="text-xs text-slate-500">Confira os dados antes de registrar.</p>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo="ID AnyMarket" valor={selecionado.id_anymarket} mono />
              <Campo rotulo="Cliente" valor={selecionado.nome_cliente} />
              <Campo rotulo="CPF/CNPJ" valor={selecionado.cpf_cnpj} mono />
              <Campo rotulo="Marketplace" valor={selecionado.marketplace} />
              <Campo rotulo="Produto" valor={selecionado.produto} />
              <Campo rotulo="SKU" valor={selecionado.sku} mono />
              <Campo rotulo="IMEI vendido" valor={selecionado.imei_vendido} mono />
              <Campo rotulo="Voucher original" valor={selecionado.voucher_origem} mono />
            </div>
          </Card>

          <Card>
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-xl bg-amber-100 p-2.5 text-amber-700"><FileText className="h-5 w-5" /></div>
              <div>
                <h2 className="font-black text-slate-800">Dados da solicitação</h2>
                <p className="text-xs text-slate-500">Campos preenchidos pela Assurant.</p>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className={labelCls}>Data da solicitação *</label>
                <input type="datetime-local" value={form.dataSolicitacao} onChange={e => setCampo("dataSolicitacao", e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Número do pedido no portal</label>
                <input value={form.pedidoPortal} onChange={e => setCampo("pedidoPortal", e.target.value)} className={inputCls} placeholder="Opcional" />
              </div>
              <div>
                <label className={labelCls}>Categoria do motivo *</label>
                <select value={form.categoriaMotivo} onChange={e => setCampo("categoriaMotivo", e.target.value)} className={inputCls}>
                  <option value="">Selecione...</option>
                  {CATEGORIAS_DEVOLUCAO.map(categoria => <option key={categoria} value={categoria}>{categoria}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Situação da postagem</label>
                <select value={form.statusPostagem} onChange={e => setCampo("statusPostagem", e.target.value)} className={inputCls}>
                  <option value="Aguardando postagem">Aguardando postagem</option>
                  <option value="Código enviado ao cliente">Código enviado ao cliente</option>
                  <option value="Postado">Postado</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className={labelCls}>Motivo detalhado *</label>
                <textarea value={form.motivo} onChange={e => setCampo("motivo", e.target.value)} className={`${inputCls} min-h-24 resize-y`} placeholder="Descreva o motivo informado pelo cliente" />
              </div>
              <div>
                <label className={labelCls}>Código de rastreio do retorno</label>
                <input value={form.codigoRastreio} onChange={e => setCampo("codigoRastreio", e.target.value)} className={inputCls} placeholder="Preencha se já estiver disponível" />
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                <input type="checkbox" checked={form.reembolsoFinalizado} onChange={e => setCampo("reembolsoFinalizado", e.target.checked)} className="h-4 w-4 accent-[#7F2D92]" />
                <span className="text-sm font-bold text-slate-700">Reembolso já finalizado</span>
              </label>
              <div className="md:col-span-2">
                <label className={labelCls}>Comentários da Assurant</label>
                <textarea value={form.comentarios} onChange={e => setCampo("comentarios", e.target.value)} className={`${inputCls} min-h-20 resize-y`} placeholder="Informações complementares" />
              </div>
            </div>
          </Card>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setSelecionado(null)} className="flex items-center justify-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
              <ArrowLeft className="h-4 w-4" /> Trocar item
            </button>
            <button type="submit" disabled={salvando} className="flex items-center justify-center gap-2 rounded-xl bg-[#7F2D92] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#632276] disabled:opacity-50">
              {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {salvando ? "Registrando..." : "Registrar devolução"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

function AcaoAssurant({ devolucao, userId, onConcluida }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [rastreio, setRastreio] = useState(devolucao.codigo_rastreio_retorno || "");
  const [statusPostagem, setStatusPostagem] = useState(devolucao.status_postagem || "Postado");
  const [numeroRi, setNumeroRi] = useState("");
  const [destinoFinal, setDestinoFinal] = useState("estoque");
  const [observacaoDefinicao, setObservacaoDefinicao] = useState("");
  const [resolucao, setResolucao] = useState("");

  async function executar(acao) {
    setErro("");
    setSalvando(true);
    try {
      if (acao === "postagem") {
        if (!rastreio.trim()) throw new Error("Informe o código de rastreio.");
        await atualizarPostagemDevolucao({
          devolucaoId: devolucao.id,
          codigoRastreio: rastreio,
          statusPostagem,
          reembolsoFinalizado: devolucao.reembolso_finalizado,
          usuarioId: userId,
        });
      }
      if (acao === "ri") {
        if (!numeroRi.trim()) throw new Error("Informe o número da RI.");
        await informarRiDestinoDevolucao(devolucao.id, numeroRi, destinoFinal, userId);
      }
      if (acao === "autorizar_imei" || acao === "devolver_imei") {
        await definirImeiDivergenteDevolucao({
          devolucaoId: devolucao.id,
          decisao: acao === "autorizar_imei" ? "autorizar" : "devolver_cliente",
          observacao: observacaoDefinicao,
          usuarioId: userId,
        });
      }
      if (acao === "bloqueio") {
        if (!resolucao.trim()) throw new Error("Descreva a resolução informada pelo cliente.");
        await resolverBloqueioDevolucao(devolucao.id, resolucao, userId);
      }
      onConcluida();
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  if (devolucao.status === "aguardando_postagem") {
    return (
      <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <p className="mb-3 text-xs font-black uppercase tracking-wide text-amber-700">Ação Assurant: informar postagem</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <input value={rastreio} onChange={e => setRastreio(e.target.value)} className={inputCls} placeholder="Código de rastreio" />
          <select value={statusPostagem} onChange={e => setStatusPostagem(e.target.value)} className={inputCls}>
            <option value="Código enviado ao cliente">Código enviado ao cliente</option>
            <option value="Postado">Postado</option>
          </select>
        </div>
        {erro && <p className="mt-2 text-xs font-bold text-red-600">{erro}</p>}
        <button onClick={() => executar("postagem")} disabled={salvando} className="mt-3 flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Confirmar postagem
        </button>
      </div>
    );
  }

  if (devolucao.status === "aguardando_definicao_assurant") {
    return (
      <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
        <p className="text-xs font-black uppercase tracking-wide text-red-700">Ação Assurant: definir IMEI divergente</p>
        <p className="mt-1 text-xs text-red-600">A triagem está bloqueada até esta decisão.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <Campo rotulo="IMEI da solicitação" valor={devolucao.imei_esperado_definicao || devolucao.imei_vendido} mono />
          <Campo rotulo="IMEI bipado na funcional" valor={devolucao.imei_bipado_funcional} mono />
        </div>
        <textarea
          value={observacaoDefinicao}
          onChange={e => setObservacaoDefinicao(e.target.value)}
          className={`${inputCls} mt-3 min-h-20 resize-y`}
          placeholder="Observação da decisão (opcional)"
        />
        {erro && <p className="mt-2 text-xs font-bold text-red-600">{erro}</p>}
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <button onClick={() => executar("autorizar_imei")} disabled={salvando} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Autorizar IMEI bipado e continuar
          </button>
          <button onClick={() => executar("devolver_imei")} disabled={salvando} className="flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowLeft className="h-4 w-4" />} Não autorizar — devolver ao cliente
          </button>
        </div>
      </div>
    );
  }

  if (devolucao.status === "aguardando_ri") {
    return (
      <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
        <p className="mb-3 text-xs font-black uppercase tracking-wide text-amber-700">Ação Assurant: informar RI e destino final</p>
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
          <input value={numeroRi} onChange={e => setNumeroRi(e.target.value)} className={inputCls} placeholder="Número da RI" />
          <select value={destinoFinal} onChange={e => setDestinoFinal(e.target.value)} className={inputCls}>
            {DESTINOS_FINAIS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}
          </select>
          <button onClick={() => executar("ri")} disabled={salvando} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Salvar RI e destino
          </button>
        </div>
        {erro && <p className="mt-2 text-xs font-bold text-red-600">{erro}</p>}
      </div>
    );
  }

  if (devolucao.status === "bloqueado_aguardando_cliente") {
    return (
      <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
        <p className="text-xs font-black uppercase tracking-wide text-red-700">Ação Assurant: retorno do cliente</p>
        <p className="mt-1 text-xs text-red-600">Motivo do bloqueio: {devolucao.motivo_bloqueio || "—"}</p>
        <textarea value={resolucao} onChange={e => setResolucao(e.target.value)} className={`${inputCls} mt-3 min-h-20 resize-y`} placeholder="Descreva a resposta ou resolução do cliente" />
        {erro && <p className="mt-2 text-xs font-bold text-red-600">{erro}</p>}
        <button onClick={() => executar("bloqueio")} disabled={salvando} className="mt-3 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Liberar processo
        </button>
      </div>
    );
  }

  return null;
}

function Historico({ devolucaoId }) {
  const [aberto, setAberto] = useState(false);
  const [loading, setLoading] = useState(false);
  const [linhas, setLinhas] = useState([]);
  const [erro, setErro] = useState("");

  async function alternar() {
    const proximo = !aberto;
    setAberto(proximo);
    if (!proximo || linhas.length) return;
    setLoading(true);
    setErro("");
    try {
      setLinhas(await listarHistoricoDevolucao(devolucaoId));
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <button onClick={alternar} className="flex items-center gap-1 text-xs font-bold text-purple-700">
        {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {aberto ? "Ocultar histórico" : "Ver histórico completo"}
      </button>
      {aberto && (
        <div className="mt-3 space-y-2">
          {loading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
          {erro && <p className="text-xs font-bold text-red-600">{erro}</p>}
          {!loading && !erro && !linhas.length && <p className="text-xs text-slate-400">Nenhuma movimentação registrada.</p>}
          {linhas.map(linha => (
            <div key={linha.id} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#7F2D92]" />
              <div className="min-w-0">
                <p className="text-xs font-black text-slate-700">{linha.observacao || linha.acao}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">
                  {formatarData(linha.criado_em)}
                  {linha.status_novo ? ` · ${rotuloStatusDevolucao(linha.status_novo)}` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CardDevolucao({ devolucao, userId, onAtualizar }) {
  const [detalhes, setDetalhes] = useState(false);
  return (
    <Card className={devolucao.responsavel_atual === "assurant" ? "ring-2 ring-amber-200" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-slate-900">Devolução #{devolucao.protocolo}</span>
            <StatusBadge status={devolucao.status} />
            {devolucao.responsavel_atual === "assurant" && (
              <span className="rounded-lg bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Ação Assurant</span>
            )}
          </div>
          <p className="text-sm font-bold text-slate-700">{devolucao.produto_original || "Produto não informado"}</p>
          <p className="mt-1 text-xs text-slate-500">
            AnyMarket #{devolucao.id_anymarket} · {devolucao.nome_cliente || "Cliente não informado"}
          </p>
        </div>
        <button onClick={() => setDetalhes(valor => !valor)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-purple-700">
          {detalhes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {detalhes ? "Ocultar" : "Detalhes"}
        </button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Campo rotulo="Responsável atual" valor={rotuloResponsavelDevolucao(devolucao.responsavel_atual)} />
        <Campo rotulo="IMEI vendido" valor={devolucao.imei_vendido} mono />
        <Campo rotulo="Voucher DEV" valor={devolucao.voucher_dev} mono />
        <Campo rotulo="Atualizado em" valor={formatarData(devolucao.atualizado_em)} />
      </div>

      <AcaoAssurant devolucao={devolucao} userId={userId} onConcluida={onAtualizar} />

      {detalhes && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Solicitação" valor={formatarData(devolucao.data_solicitacao)} />
            <Campo rotulo="NF de venda" valor={devolucao.nf_venda} />
            <Campo rotulo="Código de rastreio" valor={devolucao.codigo_rastreio_retorno} mono />
            <Campo rotulo="RI" valor={devolucao.numero_ri} />
            <Campo rotulo="Recebimento" valor={formatarData(devolucao.data_recebimento)} />
            <Campo rotulo="IMEI recebido" valor={devolucao.imei_recebido} mono />
            <Campo rotulo="RMA/AUT" valor={devolucao.tipo_rma_aut && devolucao.numero_rma_aut ? `${devolucao.tipo_rma_aut} ${devolucao.numero_rma_aut}` : "—"} />
            <Campo rotulo="Finalização" valor={formatarData(devolucao.data_finalizacao)} />
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Motivo</p>
            <p className="mt-1 text-sm font-semibold text-slate-700">{devolucao.motivo || "—"}</p>
          </div>
          <Historico devolucaoId={devolucao.id} />
        </div>
      )}
    </Card>
  );
}

function AcompanhamentoAssurant({ atualizacao }) {
  const { user } = useAuth();
  const [devolucoes, setDevolucoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("pendencias");

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      setDevolucoes(await listarDevolucoes({ limite: 1000 }));
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelado = false;

    listarDevolucoes({ limite: 1000 })
      .then(dados => {
        if (cancelado) return;
        setDevolucoes(dados);
        setErro("");
      })
      .catch(e => {
        if (!cancelado) setErro(e.message);
      })
      .finally(() => {
        if (!cancelado) setLoading(false);
      });

    return () => { cancelado = true; };
  }, [atualizacao]);

  const kpis = useMemo(() => ({
    total: devolucoes.length,
    pendencias: devolucoes.filter(item => item.responsavel_atual === "assurant").length,
    emAndamento: devolucoes.filter(item => !["finalizada", "cancelada"].includes(item.status)).length,
    finalizadas: devolucoes.filter(item => item.status === "finalizada").length,
  }), [devolucoes]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return devolucoes.filter(item => {
      if (filtro === "pendencias" && item.responsavel_atual !== "assurant") return false;
      if (filtro === "andamento" && ["finalizada", "cancelada"].includes(item.status)) return false;
      if (filtro === "finalizadas" && item.status !== "finalizada") return false;
      if (!termo) return true;
      return [item.protocolo, item.id_anymarket, item.nome_cliente, item.cpf_cnpj, item.imei_vendido, item.imei_recebido, item.voucher_dev]
        .some(valor => String(valor || "").toLowerCase().includes(termo));
    });
  }, [busca, devolucoes, filtro]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total", kpis.total, "bg-purple-50 text-purple-700 ring-purple-200"],
          ["Ações Assurant", kpis.pendencias, "bg-amber-50 text-amber-700 ring-amber-200"],
          ["Em andamento", kpis.emAndamento, "bg-blue-50 text-blue-700 ring-blue-200"],
          ["Finalizadas", kpis.finalizadas, "bg-emerald-50 text-emerald-700 ring-emerald-200"],
        ].map(([titulo, valor, cores]) => (
          <div key={titulo} className={`rounded-2xl p-4 ring-1 ${cores}`}>
            <p className="text-2xl font-black">{valor}</p>
            <p className="mt-0.5 text-xs font-bold opacity-80">{titulo}</p>
          </div>
        ))}
      </div>

      <Card>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {[
              ["pendencias", "Ações Assurant"],
              ["andamento", "Em andamento"],
              ["finalizadas", "Finalizadas"],
              ["todas", "Todas"],
            ].map(([valor, rotulo]) => (
              <button key={valor} onClick={() => setFiltro(valor)} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${filtro === valor ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
                {rotulo}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <div className="relative min-w-0 flex-1 lg:w-80">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input value={busca} onChange={e => setBusca(e.target.value)} className={`${inputCls} pl-9`} placeholder="Pedido, IMEI, cliente, voucher..." />
            </div>
            <button onClick={carregar} disabled={loading} className="rounded-xl bg-slate-100 p-3 text-slate-600 hover:bg-slate-200 disabled:opacity-50" title="Atualizar">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>
      </Card>

      {erro && <Aviso>{erro}</Aviso>}
      {loading && (
        <Card className="py-12 text-center">
          <Loader2 className="mx-auto h-7 w-7 animate-spin text-purple-600" />
          <p className="mt-3 text-sm font-semibold text-slate-500">Carregando devoluções...</p>
        </Card>
      )}
      {!loading && !filtradas.length && (
        <Card className="py-12 text-center">
          <ClipboardList className="mx-auto h-9 w-9 text-slate-300" />
          <p className="mt-3 font-bold text-slate-600">Nenhuma devolução encontrada.</p>
          <p className="mt-1 text-xs text-slate-400">Altere o filtro ou faça uma nova solicitação.</p>
        </Card>
      )}
      {!loading && filtradas.map(devolucao => (
        <CardDevolucao key={devolucao.id} devolucao={devolucao} userId={user.id} onAtualizar={carregar} />
      ))}
    </div>
  );
}

export default function DevolucoesAssurantPage() {
  const [aba, setAba] = useState("nova");
  const [atualizacao, setAtualizacao] = useState(0);

  function criada() {
    setAtualizacao(valor => valor + 1);
  }

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-700">
              <UserRound className="h-4 w-4" /> Portal Assurant
            </div>
            <h1 className="text-2xl font-black text-slate-900">Devoluções B2C</h1>
            <p className="mt-1 text-sm text-slate-500">Solicitação, postagem, retorno do cliente e número de RI.</p>
          </div>
          <div className="flex rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
            <button onClick={() => setAba("nova")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${aba === "nova" ? "bg-[#7F2D92] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <Plus className="h-4 w-4" /> Nova solicitação
            </button>
            <button onClick={() => setAba("acompanhar")} className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition sm:flex-none ${aba === "acompanhar" ? "bg-[#7F2D92] text-white" : "text-slate-600 hover:bg-slate-100"}`}>
              <Clock3 className="h-4 w-4" /> Acompanhamento
            </button>
          </div>
        </div>

        {aba === "nova"
          ? <NovaSolicitacao onCriada={criada} />
          : <AcompanhamentoAssurant atualizacao={atualizacao} />}
      </div>
    </div>
  );
}
