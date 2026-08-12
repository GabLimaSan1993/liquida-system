import { createElement, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FlaskConical,
  Loader2,
  PackageCheck,
  RefreshCw,
  Save,
  Search,
  Send,
  Warehouse,
  Wrench,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  bloquearDevolucaoAguardandoCliente,
  finalizarDevolucaoFurbtech,
  informarRmaAutDevolucao,
  listarDevolucoes,
  listarHistoricoDevolucao,
  registrarRecebimentoDevolucao,
  registrarResultadoTriagemDevolucao,
  rotuloResponsavelDevolucao,
  rotuloStatusDevolucao,
} from "../services/devolucoesService.js";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100 disabled:cursor-not-allowed disabled:bg-slate-100";
const labelCls = "mb-1 block text-xs font-bold text-slate-600";

const STATUS_RECLAMACAO = [
  "Procedente",
  "Improcedente",
  "Arrependimento",
  "Venda Cancelada",
  "Sem Reclamação",
  "Em análise",
  "Outro",
];

const DESTINOS_FINAIS = [
  ["estoque", "Retornar ao estoque"],
  ["cliente", "Retornar ao cliente"],
  ["reembolso", "Reembolso"],
  ["reparo", "Enviar para reparo"],
  ["descarte", "Descarte"],
  ["outro", "Outro destino"],
];

const CORES_STATUS = {
  solicitada: "bg-blue-50 text-blue-700 ring-blue-200",
  aguardando_postagem: "bg-amber-50 text-amber-700 ring-amber-200",
  em_transito: "bg-sky-50 text-sky-700 ring-sky-200",
  aguardando_recebimento: "bg-cyan-50 text-cyan-700 ring-cyan-200",
  aguardando_triagem: "bg-violet-50 text-violet-700 ring-violet-200",
  em_triagem: "bg-violet-50 text-violet-700 ring-violet-200",
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

function agoraLocal() {
  const data = new Date();
  const deslocamento = data.getTimezoneOffset() * 60_000;
  return new Date(data.getTime() - deslocamento).toISOString().slice(0, 16);
}

function formatarData(valor) {
  if (!valor) return "—";
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatarMoeda(valor) {
  if (valor == null || valor === "") return "—";
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function somenteNumeros(valor) {
  return String(valor || "").replace(/\D/g, "").slice(0, 15);
}

function Card({ children, className = "" }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

function Aviso({ tipo = "erro", children }) {
  const sucesso = tipo === "sucesso";
  return (
    <div className={`flex items-start gap-2 rounded-xl px-3 py-2.5 text-xs font-bold ring-1 ${
      sucesso ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
    }`}>
      {sucesso ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function Campo({ rotulo, valor, mono = false }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 break-words text-sm font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>{valor || "—"}</p>
    </div>
  );
}

function StatusBadge({ status }) {
  return (
    <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${CORES_STATUS[status] || "bg-slate-50 text-slate-600 ring-slate-200"}`}>
      {rotuloStatusDevolucao(status)}
    </span>
  );
}

function CaixaAcao({ titulo, detalhe, cor = "purple", children }) {
  const cores = {
    purple: "bg-purple-50 ring-purple-200 text-purple-700",
    cyan: "bg-cyan-50 ring-cyan-200 text-cyan-700",
    orange: "bg-orange-50 ring-orange-200 text-orange-700",
    indigo: "bg-indigo-50 ring-indigo-200 text-indigo-700",
    red: "bg-red-50 ring-red-200 text-red-700",
  };
  return (
    <div className={`mt-4 rounded-2xl p-4 ring-1 ${cores[cor]}`}>
      <p className="text-xs font-black uppercase tracking-wide">{titulo}</p>
      {detalhe && <p className="mt-1 text-xs opacity-80">{detalhe}</p>}
      <div className="mt-3 text-slate-700">{children}</div>
    </div>
  );
}

function RecebimentoForm({ devolucao, userId, onConcluida }) {
  const [form, setForm] = useState({
    dataRecebimento: agoraLocal(),
    imei: devolucao.imei_vendido || "",
    nf: devolucao.nf_venda || "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento) {
    evento.preventDefault();
    setErro("");
    if (somenteNumeros(form.imei).length !== 15) return setErro("O IMEI precisa possuir exatamente 15 números.");
    if (!form.nf.trim()) return setErro("Informe a NF do aparelho recebido.");
    setSalvando(true);
    try {
      const resultado = await registrarRecebimentoDevolucao({
        devolucaoId: devolucao.id,
        dataRecebimento: form.dataRecebimento,
        imei: form.imei,
        nf: form.nf,
        usuarioId: userId,
      });
      onConcluida(`Recebimento confirmado. Voucher ${resultado.voucher_dev} criado automaticamente.`);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <CaixaAcao titulo="Ação Furbtech: registrar recebimento" detalhe="Confira fisicamente o IMEI e a NF antes de confirmar." cor="cyan">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-3">
          <div><label className={labelCls}>Data do recebimento *</label><input type="datetime-local" value={form.dataRecebimento} onChange={e => setForm(v => ({ ...v, dataRecebimento: e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>IMEI recebido *</label><input value={form.imei} onChange={e => setForm(v => ({ ...v, imei: somenteNumeros(e.target.value) }))} className={inputCls} inputMode="numeric" placeholder="15 números" /></div>
          <div><label className={labelCls}>Nota Fiscal *</label><input value={form.nf} onChange={e => setForm(v => ({ ...v, nf: e.target.value }))} className={inputCls} placeholder="Número da NF" /></div>
        </div>
        {devolucao.imei_vendido && form.imei !== devolucao.imei_vendido && (
          <Aviso>O IMEI recebido é diferente do IMEI vendido. Confirme se o aparelho físico está correto.</Aviso>
        )}
        {erro && <Aviso>{erro}</Aviso>}
        <button type="submit" disabled={salvando} className="flex items-center gap-2 rounded-xl bg-cyan-700 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <PackageCheck className="h-4 w-4" />}
          {salvando ? "Registrando..." : "Confirmar recebimento e gerar DEV"}
        </button>
      </form>
    </CaixaAcao>
  );
}

function TriagemForm({ devolucao, userId, onConcluida }) {
  const [form, setForm] = useState({
    apresentouDefeito: "",
    statusReclamacao: "",
    causaRaiz: "",
    analiseCausaRaiz: "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento) {
    evento.preventDefault();
    setErro("");
    if (form.apresentouDefeito === "") return setErro("Informe se o aparelho apresentou defeito.");
    if (!form.statusReclamacao) return setErro("Selecione o status da reclamação.");
    if (!form.causaRaiz.trim()) return setErro("Informe a causa raiz.");
    setSalvando(true);
    try {
      await registrarResultadoTriagemDevolucao({
        devolucaoId: devolucao.id,
        apresentouDefeito: form.apresentouDefeito === "sim",
        statusReclamacao: form.statusReclamacao,
        causaRaiz: form.causaRaiz,
        analiseCausaRaiz: form.analiseCausaRaiz,
        usuarioId: userId,
      });
      onConcluida("Resultado da nova triagem registrado com sucesso.");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <CaixaAcao titulo="Ação Furbtech: nova triagem do aparelho" detalhe={`Use o voucher ${devolucao.voucher_dev || "DEV"} em todas as etapas da triagem.`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-4 py-3 ring-1 ring-purple-200">
        <div><p className="text-[10px] font-black uppercase text-purple-500">Voucher da devolução</p><p className="font-mono text-lg font-black text-purple-800">{devolucao.voucher_dev}</p></div>
        <Link to="/triagens/funcional" className="flex items-center gap-2 rounded-xl bg-purple-100 px-4 py-2.5 text-xs font-bold text-purple-700 hover:bg-purple-200">
          <Wrench className="h-4 w-4" /> Abrir Triagem Funcional
        </Link>
      </div>
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Apresentou o defeito reclamado? *</label>
            <select value={form.apresentouDefeito} onChange={e => setForm(v => ({ ...v, apresentouDefeito: e.target.value }))} className={inputCls}>
              <option value="">Selecione...</option><option value="sim">Sim</option><option value="nao">Não</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Status da reclamação *</label>
            <select value={form.statusReclamacao} onChange={e => setForm(v => ({ ...v, statusReclamacao: e.target.value }))} className={inputCls}>
              <option value="">Selecione...</option>{STATUS_RECLAMACAO.map(status => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <div className="md:col-span-2"><label className={labelCls}>Causa raiz *</label><input value={form.causaRaiz} onChange={e => setForm(v => ({ ...v, causaRaiz: e.target.value }))} className={inputCls} placeholder="Ex.: falha de bateria, dano cosmético, sem defeito..." /></div>
          <div className="md:col-span-2"><label className={labelCls}>Análise da causa raiz</label><textarea value={form.analiseCausaRaiz} onChange={e => setForm(v => ({ ...v, analiseCausaRaiz: e.target.value }))} className={`${inputCls} min-h-20 resize-y`} placeholder="Detalhe os testes e evidências encontrados" /></div>
        </div>
        {erro && <Aviso>{erro}</Aviso>}
        <button type="submit" disabled={salvando} className="flex items-center gap-2 rounded-xl bg-[#7F2D92] px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
          {salvando ? "Salvando..." : "Concluir análise da devolução"}
        </button>
      </form>
    </CaixaAcao>
  );
}

function RmaAutForm({ devolucao, userId, onConcluida }) {
  const [tipo, setTipo] = useState("RMA");
  const [numero, setNumero] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento) {
    evento.preventDefault();
    setErro("");
    if (!numero.trim()) return setErro(`Informe o número do ${tipo}.`);
    setSalvando(true);
    try {
      await informarRmaAutDevolucao(devolucao.id, tipo, numero, userId);
      onConcluida(`${tipo} ${numero} registrado. O processo foi enviado para a Assurant informar a RI.`);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <CaixaAcao titulo="Ação Furbtech: informar RMA ou AUT" detalhe="Após salvar, a responsabilidade passa para a Assurant informar a RI." cor="orange">
      <form onSubmit={salvar} className="flex flex-col gap-2 sm:flex-row">
        <select value={tipo} onChange={e => setTipo(e.target.value)} className={`${inputCls} sm:w-36`}><option value="RMA">RMA</option><option value="AUT">AUT</option></select>
        <input value={numero} onChange={e => setNumero(e.target.value)} className={inputCls} placeholder={`Número do ${tipo}`} />
        <button type="submit" disabled={salvando} className="flex shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar {tipo}
        </button>
      </form>
      {erro && <div className="mt-2"><Aviso>{erro}</Aviso></div>}
    </CaixaAcao>
  );
}

function FinalizacaoForm({ devolucao, userId, onConcluida }) {
  const [form, setForm] = useState({ dataFinalizacao: agoraLocal(), destinoFinal: "estoque", comentarios: "" });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar(evento) {
    evento.preventDefault();
    setErro("");
    setSalvando(true);
    try {
      const resultado = await finalizarDevolucaoFurbtech({
        devolucaoId: devolucao.id,
        dataFinalizacao: form.dataFinalizacao,
        destinoFinal: form.destinoFinal,
        comentarios: form.comentarios,
        usuarioId: userId,
      });
      const complemento = resultado.status === "aguardando_armazenagem"
        ? " O aparelho foi encaminhado para a Armazenagem WMS."
        : " Processo finalizado.";
      onConcluida(`Finalização registrada.${complemento}`);
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <CaixaAcao titulo="Ação Furbtech: finalizar processo" detalhe={`RI informada: ${devolucao.numero_ri || "—"}`} cor="indigo">
      <form onSubmit={salvar} className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <div><label className={labelCls}>Data de finalização *</label><input type="datetime-local" value={form.dataFinalizacao} onChange={e => setForm(v => ({ ...v, dataFinalizacao: e.target.value }))} className={inputCls} /></div>
          <div><label className={labelCls}>Destino final *</label><select value={form.destinoFinal} onChange={e => setForm(v => ({ ...v, destinoFinal: e.target.value }))} className={inputCls}>{DESTINOS_FINAIS.map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>
          <div className="md:col-span-2"><label className={labelCls}>Comentários Furbtech</label><textarea value={form.comentarios} onChange={e => setForm(v => ({ ...v, comentarios: e.target.value }))} className={`${inputCls} min-h-20 resize-y`} placeholder="Observações da finalização" /></div>
        </div>
        {form.destinoFinal === "estoque" && <div className="rounded-xl bg-purple-100 px-3 py-2 text-xs font-bold text-purple-700">O voucher {devolucao.voucher_dev} será enviado para Armazenagem WMS e, depois, Entrada no Oracle.</div>}
        {erro && <Aviso>{erro}</Aviso>}
        <button type="submit" disabled={salvando} className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-bold text-white disabled:opacity-50">
          {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileCheck2 className="h-4 w-4" />}
          {salvando ? "Finalizando..." : "Registrar finalização"}
        </button>
      </form>
    </CaixaAcao>
  );
}

function BloqueioForm({ devolucao, userId, onConcluida }) {
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    setErro("");
    if (!motivo.trim()) return setErro("Informe o que precisa ser confirmado com o cliente.");
    setSalvando(true);
    try {
      await bloquearDevolucaoAguardandoCliente(devolucao.id, motivo, userId);
      onConcluida("Processo bloqueado e encaminhado para a Assurant tratar com o cliente.");
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button onClick={() => setAberto(v => !v)} className="flex items-center gap-2 text-xs font-bold text-red-600 hover:text-red-800">
        <Ban className="h-4 w-4" /> {aberto ? "Cancelar bloqueio" : "Bloquear aguardando cliente"}
      </button>
      {aberto && (
        <div className="mt-3 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
          <textarea value={motivo} onChange={e => setMotivo(e.target.value)} className={`${inputCls} min-h-20 resize-y`} placeholder="Descreva a informação necessária do cliente" />
          {erro && <div className="mt-2"><Aviso>{erro}</Aviso></div>}
          <button onClick={salvar} disabled={salvando} className="mt-2 flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Encaminhar para Assurant
          </button>
        </div>
      )}
    </div>
  );
}

function Historico({ devolucaoId }) {
  const [aberto, setAberto] = useState(false);
  const [linhas, setLinhas] = useState([]);
  const [loading, setLoading] = useState(false);
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
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button onClick={alternar} className="flex items-center gap-1 text-xs font-bold text-purple-700">
        {aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{aberto ? "Ocultar histórico" : "Ver histórico"}
      </button>
      {aberto && <div className="mt-3 space-y-2">
        {loading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
        {erro && <Aviso>{erro}</Aviso>}
        {!loading && !erro && !linhas.length && <p className="text-xs text-slate-400">Nenhuma movimentação registrada.</p>}
        {linhas.map(linha => <div key={linha.id} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#7F2D92]" /><div><p className="text-xs font-black text-slate-700">{linha.observacao || linha.acao}</p><p className="mt-0.5 text-[10px] text-slate-400">{formatarData(linha.criado_em)}{linha.status_novo ? ` · ${rotuloStatusDevolucao(linha.status_novo)}` : ""}</p></div></div>)}
      </div>}
    </div>
  );
}

function OrientacaoFluxo({ devolucao }) {
  if (devolucao.status === "aguardando_ri") return <CaixaAcao titulo="Aguardando Assurant" detalhe={`A Assurant precisa informar a RI. ${devolucao.tipo_rma_aut || "RMA/AUT"}: ${devolucao.numero_rma_aut || "—"}`} cor="orange"><p className="text-xs font-semibold">Nenhuma ação Furbtech é necessária neste momento.</p></CaixaAcao>;
  if (devolucao.status === "aguardando_armazenagem") return <CaixaAcao titulo="Encaminhar para Armazenagem WMS" detalhe={`Bipe o voucher ${devolucao.voucher_dev} na tela de Armazenagem.`}><Link to="/triagens/armazenagem" className="inline-flex items-center gap-2 rounded-xl bg-[#7F2D92] px-4 py-2.5 text-xs font-bold text-white"><Warehouse className="h-4 w-4" /> Abrir Armazenagem</Link></CaixaAcao>;
  if (devolucao.status === "aguardando_oracle") return <CaixaAcao titulo="Aguardando Entrada no Oracle" detalhe="A armazenagem física já foi concluída."><p className="text-xs font-semibold">O processo será finalizado automaticamente quando o produto ficar disponível.</p></CaixaAcao>;
  if (devolucao.status === "bloqueado_aguardando_cliente") return <CaixaAcao titulo="Aguardando retorno da Assurant" detalhe={devolucao.motivo_bloqueio || "Aguardando cliente"} cor="red"><p className="text-xs font-semibold">A Assurant precisa registrar a resolução para o processo retornar à etapa anterior.</p></CaixaAcao>;
  return null;
}

function CardDevolucao({ devolucao, userId, onAtualizar }) {
  const [detalhes, setDetalhes] = useState(false);
  const [mensagem, setMensagem] = useState("");

  function concluida(texto) {
    setMensagem(texto);
    onAtualizar();
  }

  const podeReceber = !devolucao.voucher_dev && ["em_transito", "aguardando_recebimento"].includes(devolucao.status);
  const podeTriar = devolucao.voucher_dev && ["aguardando_triagem", "em_triagem"].includes(devolucao.status);
  const podeBloquear = devolucao.responsavel_atual === "furbtech" && !["finalizada", "cancelada", "aguardando_armazenagem", "aguardando_oracle"].includes(devolucao.status);

  return (
    <Card className={devolucao.responsavel_atual === "furbtech" ? "ring-2 ring-purple-200" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">Devolução #{devolucao.protocolo}</span><StatusBadge status={devolucao.status} />{devolucao.responsavel_atual === "furbtech" && <span className="rounded-lg bg-purple-100 px-2 py-1 text-[10px] font-black uppercase text-purple-700">Ação Furbtech</span>}</div>
          <p className="text-sm font-bold text-slate-700">{devolucao.produto_original || "Produto não informado"}</p>
          <p className="mt-1 text-xs text-slate-500">AnyMarket #{devolucao.id_anymarket} · {devolucao.nome_cliente || "Cliente não informado"}</p>
        </div>
        <button onClick={() => setDetalhes(v => !v)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-purple-700">{detalhes ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{detalhes ? "Ocultar" : "Detalhes"}</button>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Campo rotulo="Responsável atual" valor={rotuloResponsavelDevolucao(devolucao.responsavel_atual)} />
        <Campo rotulo="IMEI vendido" valor={devolucao.imei_vendido} mono />
        <Campo rotulo="Voucher DEV" valor={devolucao.voucher_dev} mono />
        <Campo rotulo="Atualizado em" valor={formatarData(devolucao.atualizado_em)} />
      </div>

      {mensagem && <div className="mt-3"><Aviso tipo="sucesso">{mensagem}</Aviso></div>}
      {podeReceber && <RecebimentoForm devolucao={devolucao} userId={userId} onConcluida={concluida} />}
      {podeTriar && <TriagemForm devolucao={devolucao} userId={userId} onConcluida={concluida} />}
      {devolucao.status === "aguardando_rma_aut" && <RmaAutForm devolucao={devolucao} userId={userId} onConcluida={concluida} />}
      {devolucao.status === "aguardando_finalizacao" && <FinalizacaoForm devolucao={devolucao} userId={userId} onConcluida={concluida} />}
      <OrientacaoFluxo devolucao={devolucao} />
      {podeBloquear && <BloqueioForm devolucao={devolucao} userId={userId} onConcluida={concluida} />}

      {detalhes && (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <Campo rotulo="Cliente" valor={devolucao.nome_cliente} />
            <Campo rotulo="CPF/CNPJ" valor={devolucao.cpf_cnpj} mono />
            <Campo rotulo="NF venda" valor={devolucao.nf_venda} />
            <Campo rotulo="Valor da venda" valor={formatarMoeda(devolucao.valor_venda)} />
            <Campo rotulo="Rastreio" valor={devolucao.codigo_rastreio_retorno} mono />
            <Campo rotulo="Recebimento" valor={formatarData(devolucao.data_recebimento)} />
            <Campo rotulo="IMEI recebido" valor={devolucao.imei_recebido} mono />
            <Campo rotulo="NF recebimento" valor={devolucao.nf_informada_recebimento} />
            <Campo rotulo="Status reclamação" valor={devolucao.status_reclamacao} />
            <Campo rotulo="Causa raiz" valor={devolucao.causa_raiz} />
            <Campo rotulo="RMA/AUT" valor={devolucao.tipo_rma_aut && devolucao.numero_rma_aut ? `${devolucao.tipo_rma_aut} ${devolucao.numero_rma_aut}` : "—"} />
            <Campo rotulo="RI" valor={devolucao.numero_ri} />
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">Motivo informado pela Assurant</p><p className="mt-1 text-sm font-semibold text-slate-700">{devolucao.motivo || "—"}</p></div>
          <Historico devolucaoId={devolucao.id} />
        </div>
      )}
    </Card>
  );
}

export default function DevolucoesFurbtechPage() {
  const { user } = useAuth();
  const [devolucoes, setDevolucoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("furbtech");

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
      .then(dados => { if (!cancelado) { setDevolucoes(dados); setErro(""); } })
      .catch(e => { if (!cancelado) setErro(e.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, []);

  const kpis = useMemo(() => ({
    receber: devolucoes.filter(item => ["em_transito", "aguardando_recebimento"].includes(item.status) && !item.voucher_dev).length,
    triar: devolucoes.filter(item => ["aguardando_triagem", "em_triagem"].includes(item.status)).length,
    rma: devolucoes.filter(item => item.status === "aguardando_rma_aut").length,
    finalizar: devolucoes.filter(item => item.status === "aguardando_finalizacao").length,
  }), [devolucoes]);

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return devolucoes.filter(item => {
      if (filtro === "furbtech" && item.responsavel_atual !== "furbtech") return false;
      if (filtro === "receber" && !(["em_transito", "aguardando_recebimento"].includes(item.status) && !item.voucher_dev)) return false;
      if (filtro === "triar" && !["aguardando_triagem", "em_triagem"].includes(item.status)) return false;
      if (filtro === "rma" && item.status !== "aguardando_rma_aut") return false;
      if (filtro === "finalizar" && item.status !== "aguardando_finalizacao") return false;
      if (!termo) return true;
      return [item.protocolo, item.id_anymarket, item.nome_cliente, item.cpf_cnpj, item.imei_vendido, item.imei_recebido, item.voucher_dev, item.numero_ri]
        .some(valor => String(valor || "").toLowerCase().includes(termo));
    });
  }, [busca, devolucoes, filtro]);

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-700"><Warehouse className="h-4 w-4" /> Portal Furbtech</div>
            <h1 className="text-2xl font-black text-slate-900">Operação de Devoluções B2C</h1>
            <p className="mt-1 text-sm text-slate-500">Recebimento, voucher DEV, nova triagem, RMA/AUT e finalização.</p>
          </div>
          <button onClick={carregar} disabled={loading} className="flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            [PackageCheck, "Receber", kpis.receber, "bg-cyan-50 text-cyan-700 ring-cyan-200"],
            [FlaskConical, "Triar", kpis.triar, "bg-purple-50 text-purple-700 ring-purple-200"],
            [ClipboardCheck, "RMA/AUT", kpis.rma, "bg-orange-50 text-orange-700 ring-orange-200"],
            [FileCheck2, "Finalizar", kpis.finalizar, "bg-indigo-50 text-indigo-700 ring-indigo-200"],
          ].map(([Icone, titulo, valor, cores]) => <div key={titulo} className={`rounded-2xl p-4 ring-1 ${cores}`}><div className="flex items-center justify-between"><div><p className="text-2xl font-black">{valor}</p><p className="text-xs font-bold opacity-80">{titulo}</p></div>{createElement(Icone, { className: "h-5 w-5 opacity-70" })}</div></div>)}
        </div>

        <Card>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-wrap gap-2">
              {[["furbtech", "Minhas pendências"], ["receber", "Receber"], ["triar", "Triar"], ["rma", "RMA/AUT"], ["finalizar", "Finalizar"], ["todas", "Todas"]].map(([valor, rotulo]) => <button key={valor} onClick={() => setFiltro(valor)} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${filtro === valor ? "bg-[#7F2D92] text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>{rotulo}</button>)}
            </div>
            <div className="relative min-w-0 flex-1 xl:max-w-sm"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={busca} onChange={e => setBusca(e.target.value)} className={`${inputCls} pl-9`} placeholder="Pedido, IMEI, cliente, voucher..." /></div>
          </div>
        </Card>

        {erro && <Aviso>{erro}</Aviso>}
        {loading && <Card className="py-12 text-center"><Loader2 className="mx-auto h-7 w-7 animate-spin text-purple-600" /><p className="mt-3 text-sm font-semibold text-slate-500">Carregando devoluções...</p></Card>}
        {!loading && !filtradas.length && <Card className="py-12 text-center"><Boxes className="mx-auto h-9 w-9 text-slate-300" /><p className="mt-3 font-bold text-slate-600">Nenhuma devolução encontrada.</p><p className="mt-1 text-xs text-slate-400">Não existem processos para este filtro.</p></Card>}
        {!loading && filtradas.map(devolucao => <CardDevolucao key={devolucao.id} devolucao={devolucao} userId={user.id} onAtualizar={carregar} />)}
      </div>
    </div>
  );
}
