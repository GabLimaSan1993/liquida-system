import { createElement, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  Ban,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock3,
  Download,
  History,
  Loader2,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldCheck,
  UserRound,
  Warehouse,
} from "lucide-react";
import {
  listarDevolucoes,
  listarHistoricoDevolucao,
  rotuloResponsavelDevolucao,
  rotuloStatusDevolucao,
} from "../services/devolucoesService.js";
import { listarTrocas } from "../services/trocasB2CService.js";

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-100";

const STATUS_DEV_CORES = {
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

const STATUS_TROCA = {
  em_aberto: ["Em aberto", "bg-blue-50 text-blue-700 ring-blue-200"],
  alocado: ["Alocado", "bg-blue-50 text-blue-700 ring-blue-200"],
  em_separacao: ["Em separação", "bg-amber-50 text-amber-700 ring-amber-200"],
  aprovado: ["Aprovado", "bg-teal-50 text-teal-700 ring-teal-200"],
  reprovado: ["Reprovado", "bg-red-50 text-red-700 ring-red-200"],
  nao_localizado: ["Não localizado", "bg-orange-50 text-orange-700 ring-orange-200"],
  faturado: ["Faturado", "bg-purple-50 text-purple-700 ring-purple-200"],
  postado: ["Postado", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
  movido_reembolso: ["Reembolso", "bg-red-50 text-red-700 ring-red-200"],
  concluido: ["Concluído", "bg-emerald-50 text-emerald-700 ring-emerald-200"],
};

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

function diasDesde(valor) {
  if (!valor) return 0;
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - data.getTime()) / 86_400_000));
}

function Card({ children, className = "" }) {
  return <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>{children}</div>;
}

function Kpi({ icone, titulo, valor, detalhe, cores }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-slate-400">{titulo}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{Number(valor || 0).toLocaleString("pt-BR")}</p>
          {detalhe && <p className="mt-1 text-xs font-semibold text-slate-500">{detalhe}</p>}
        </div>
        <div className={`rounded-xl p-2.5 ${cores}`}>{createElement(icone, { className: "h-5 w-5" })}</div>
      </div>
    </Card>
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

function StatusDevolucao({ status }) {
  return <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${STATUS_DEV_CORES[status] || "bg-slate-50 text-slate-600 ring-slate-200"}`}>{rotuloStatusDevolucao(status)}</span>;
}

function StatusTroca({ status }) {
  const config = STATUS_TROCA[status] || [status || "—", "bg-slate-50 text-slate-600 ring-slate-200"];
  return <span className={`rounded-lg px-2.5 py-1 text-xs font-bold ring-1 ${config[1]}`}>{config[0]}</span>;
}

function Barra({ titulo, valor, total, cor }) {
  const percentual = total ? Math.min(100, (valor / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs"><span className="font-bold text-slate-600">{titulo}</span><span className="font-black text-slate-700">{valor}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full ${cor}`} style={{ width: `${percentual}%` }} /></div>
    </div>
  );
}

function ResumoGeral({ devolucoes, trocas }) {
  const devAbertas = devolucoes.filter(item => !["finalizada", "cancelada"].includes(item.status));
  const trocasConcluidas = trocas.filter(item => item.status === "concluido").length;
  const trocasReembolso = trocas.filter(item => item.status === "movido_reembolso").length;
  const devFinalizadas = devolucoes.filter(item => item.status === "finalizada").length;
  const valorEmDevolucao = devAbertas.reduce((soma, item) => soma + Number(item.valor_venda || 0), 0);
  const totalResponsaveis = Math.max(devAbertas.length, 1);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi icone={ArrowLeftRight} titulo="Processos ativos" valor={devAbertas.length + (trocas.length - trocasConcluidas - trocasReembolso)} detalhe={`${devAbertas.length} devoluções · ${trocas.length - trocasConcluidas - trocasReembolso} trocas`} cores="bg-purple-100 text-purple-700" />
        <Kpi icone={ShieldCheck} titulo="Aguardando Assurant" valor={devAbertas.filter(item => item.responsavel_atual === "assurant").length} detalhe="Postagem, cliente ou RI" cores="bg-amber-100 text-amber-700" />
        <Kpi icone={Warehouse} titulo="Aguardando Furbtech" valor={devAbertas.filter(item => item.responsavel_atual === "furbtech").length} detalhe="Recebimento, triagem ou conclusão" cores="bg-blue-100 text-blue-700" />
        <Kpi icone={Ban} titulo="Bloqueados" valor={devAbertas.filter(item => item.status === "bloqueado_aguardando_cliente").length} detalhe="Aguardando retorno do cliente" cores="bg-red-100 text-red-700" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-purple-100 p-2.5 text-purple-700"><BarChart3 className="h-5 w-5" /></div><div><h2 className="font-black text-slate-800">Distribuição das devoluções ativas</h2><p className="text-xs text-slate-500">Responsabilidade atual do processo</p></div></div>
          <div className="space-y-4">
            <Barra titulo="Assurant" valor={devAbertas.filter(item => item.responsavel_atual === "assurant").length} total={totalResponsaveis} cor="bg-amber-500" />
            <Barra titulo="Furbtech" valor={devAbertas.filter(item => item.responsavel_atual === "furbtech").length} total={totalResponsaveis} cor="bg-purple-600" />
            <Barra titulo="Sistema / transporte" valor={devAbertas.filter(item => item.responsavel_atual === "sistema").length} total={totalResponsaveis} cor="bg-sky-500" />
          </div>
        </Card>

        <Card>
          <div className="mb-5 flex items-center gap-3"><div className="rounded-xl bg-emerald-100 p-2.5 text-emerald-700"><PackageCheck className="h-5 w-5" /></div><div><h2 className="font-black text-slate-800">Resultados acumulados</h2><p className="text-xs text-slate-500">Visão consolidada dos dois processos</p></div></div>
          <div className="grid grid-cols-2 gap-3">
            <Campo rotulo="Devoluções finalizadas" valor={String(devFinalizadas)} />
            <Campo rotulo="Trocas concluídas" valor={String(trocasConcluidas)} />
            <Campo rotulo="Trocas em reembolso" valor={String(trocasReembolso)} />
            <Campo rotulo="Valor em devoluções ativas" valor={formatarMoeda(valorEmDevolucao)} />
          </div>
        </Card>
      </div>

      <Card>
        <div className="mb-4 flex items-center gap-3"><Clock3 className="h-5 w-5 text-purple-700" /><div><h2 className="font-black text-slate-800">Pendências mais antigas</h2><p className="text-xs text-slate-500">Priorize os processos com maior tempo em aberto.</p></div></div>
        {!devAbertas.length ? <p className="py-6 text-center text-sm text-slate-400">Não existem devoluções em aberto.</p> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr className="border-b border-slate-200 text-[10px] font-black uppercase tracking-wide text-slate-400"><th className="px-3 py-2">Protocolo</th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Responsável</th><th className="px-3 py-2 text-right">Dias</th></tr></thead>
              <tbody>{[...devAbertas].sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em)).slice(0, 10).map(item => <tr key={item.id} className="border-b border-slate-100"><td className="px-3 py-3 font-black text-slate-800">#{item.protocolo}</td><td className="px-3 py-3"><p className="font-bold text-slate-700">#{item.id_anymarket}</p><p className="max-w-64 truncate text-xs text-slate-400">{item.produto_original}</p></td><td className="px-3 py-3"><StatusDevolucao status={item.status} /></td><td className="px-3 py-3 text-xs font-bold text-slate-600">{rotuloResponsavelDevolucao(item.responsavel_atual)}</td><td className="px-3 py-3 text-right"><span className={`rounded-lg px-2 py-1 text-xs font-black ${diasDesde(item.criado_em) >= 7 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{diasDesde(item.criado_em)}d</span></td></tr>)}</tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function HistoricoDevolucao({ devolucaoId }) {
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
    try { setLinhas(await listarHistoricoDevolucao(devolucaoId)); }
    catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="mt-3 border-t border-slate-100 pt-3">
      <button onClick={alternar} className="flex items-center gap-1 text-xs font-bold text-purple-700">{aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} {aberto ? "Ocultar histórico" : "Histórico completo"}</button>
      {aberto && <div className="mt-3 space-y-2">
        {loading && <p className="flex items-center gap-2 text-xs text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</p>}
        {erro && <p className="text-xs font-bold text-red-600">{erro}</p>}
        {!loading && !erro && !linhas.length && <p className="text-xs text-slate-400">Nenhuma movimentação registrada.</p>}
        {linhas.map(linha => <div key={linha.id} className="flex gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#7F2D92]" /><div><p className="text-xs font-black text-slate-700">{linha.observacao || linha.acao}</p><p className="mt-0.5 text-[10px] text-slate-400">{formatarData(linha.criado_em)}{linha.status_novo ? ` · ${rotuloStatusDevolucao(linha.status_novo)}` : ""}</p></div></div>)}
      </div>}
    </div>
  );
}

function CardDevolucao({ item }) {
  const [aberto, setAberto] = useState(false);
  const dias = diasDesde(item.criado_em);
  return (
    <Card className={item.status === "bloqueado_aguardando_cliente" ? "ring-2 ring-red-200" : ""}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1"><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">#{item.protocolo}</span><StatusDevolucao status={item.status} />{!["finalizada", "cancelada"].includes(item.status) && <span className={`rounded-lg px-2 py-1 text-[10px] font-black ${dias >= 7 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{dias} dias</span>}</div><p className="text-sm font-bold text-slate-700">{item.produto_original || "Produto não informado"}</p><p className="mt-1 text-xs text-slate-500">AnyMarket #{item.id_anymarket} · {item.nome_cliente || "Cliente não informado"}</p></div>
        <button onClick={() => setAberto(v => !v)} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-purple-700">{aberto ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}{aberto ? "Ocultar" : "Detalhes"}</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Campo rotulo="Responsável" valor={rotuloResponsavelDevolucao(item.responsavel_atual)} /><Campo rotulo="IMEI" valor={item.imei_recebido || item.imei_vendido} mono /><Campo rotulo="Voucher DEV" valor={item.voucher_dev} mono /><Campo rotulo="Atualização" valor={formatarData(item.atualizado_em)} /></div>
      {item.status === "bloqueado_aguardando_cliente" && <div className="mt-3 flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 ring-1 ring-red-200"><AlertTriangle className="h-4 w-4 shrink-0" /><span>{item.motivo_bloqueio || "Aguardando retorno do cliente."}</span></div>}
      {aberto && <div className="mt-4 space-y-3 border-t border-slate-100 pt-4"><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Campo rotulo="Solicitação" valor={formatarData(item.data_solicitacao)} /><Campo rotulo="Recebimento" valor={formatarData(item.data_recebimento)} /><Campo rotulo="Rastreio" valor={item.codigo_rastreio_retorno} mono /><Campo rotulo="NF recebida" valor={item.nf_informada_recebimento} /><Campo rotulo="Status reclamação" valor={item.status_reclamacao} /><Campo rotulo="Causa raiz" valor={item.causa_raiz} /><Campo rotulo="RMA/AUT" valor={item.tipo_rma_aut && item.numero_rma_aut ? `${item.tipo_rma_aut} ${item.numero_rma_aut}` : "—"} /><Campo rotulo="RI" valor={item.numero_ri} /></div><div className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"><p className="text-[10px] font-black uppercase text-slate-400">Motivo</p><p className="mt-1 text-sm font-semibold text-slate-700">{item.motivo || "—"}</p></div><HistoricoDevolucao devolucaoId={item.id} /></div>}
    </Card>
  );
}

function ListaDevolucoes({ devolucoes }) {
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return devolucoes.filter(item => {
      if (status && item.status !== status) return false;
      if (responsavel && item.responsavel_atual !== responsavel) return false;
      if (!termo) return true;
      return [item.protocolo, item.id_anymarket, item.nome_cliente, item.cpf_cnpj, item.imei_vendido, item.imei_recebido, item.voucher_dev, item.numero_ri].some(valor => String(valor || "").toLowerCase().includes(termo));
    });
  }, [busca, devolucoes, responsavel, status]);

  return <div className="space-y-4"><Card><div className="grid gap-3 lg:grid-cols-[1fr_220px_220px]"><div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={busca} onChange={e => setBusca(e.target.value)} className={`${inputCls} pl-9`} placeholder="Pedido, cliente, IMEI, voucher, RI..." /></div><select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}><option value="">Todos os status</option>{Object.keys(STATUS_DEV_CORES).map(chave => <option key={chave} value={chave}>{rotuloStatusDevolucao(chave)}</option>)}</select><select value={responsavel} onChange={e => setResponsavel(e.target.value)} className={inputCls}><option value="">Todos os responsáveis</option><option value="assurant">Assurant</option><option value="furbtech">Furbtech</option><option value="sistema">Sistema / transporte</option><option value="concluido">Concluído</option></select></div><p className="mt-3 text-xs font-bold text-slate-400">{filtradas.length} devolução(ões) encontrada(s)</p></Card>{!filtradas.length ? <Card className="py-12 text-center"><p className="font-bold text-slate-500">Nenhuma devolução encontrada.</p></Card> : filtradas.map(item => <CardDevolucao key={item.id} item={item} />)}</div>;
}

function statusEfetivoTroca(troca) {
  const operacao = troca.trocas_b2c_assurant_operacao?.[0] || {};
  if (troca.status === "movido_reembolso") return "movido_reembolso";
  if (troca.status === "concluido" || operacao.status_furbtech === "postado" || operacao.rastreio) return "concluido";
  return operacao.status_furbtech || troca.status || "em_aberto";
}

function ListaTrocas({ trocas }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("");
  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return trocas.filter(item => {
      const efetivo = statusEfetivoTroca(item);
      if (filtro && efetivo !== filtro) return false;
      if (!termo) return true;
      const op = item.trocas_b2c_assurant_operacao?.[0] || {};
      return [item.id_anymarket, item.nome_cliente, item.cpf, item.produto_original, op.imei, op.nf, op.rastreio].some(valor => String(valor || "").toLowerCase().includes(termo));
    });
  }, [busca, filtro, trocas]);

  return <div className="space-y-4"><Card><div className="grid gap-3 lg:grid-cols-[1fr_240px]"><div className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input value={busca} onChange={e => setBusca(e.target.value)} className={`${inputCls} pl-9`} placeholder="Pedido, cliente, IMEI, NF ou rastreio..." /></div><select value={filtro} onChange={e => setFiltro(e.target.value)} className={inputCls}><option value="">Todos os status</option>{Object.entries(STATUS_TROCA).map(([chave, config]) => <option key={chave} value={chave}>{config[0]}</option>)}</select></div><p className="mt-3 text-xs font-bold text-slate-400">{filtradas.length} troca(s) encontrada(s)</p></Card>{!filtradas.length ? <Card className="py-12 text-center"><p className="font-bold text-slate-500">Nenhuma troca encontrada.</p></Card> : filtradas.map(item => { const op = item.trocas_b2c_assurant_operacao?.[0] || {}; const statusAtual = statusEfetivoTroca(item); return <Card key={item.id}><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="mb-1 flex flex-wrap items-center gap-2"><span className="text-sm font-black text-slate-900">AnyMarket #{item.id_anymarket}</span><StatusTroca status={statusAtual} /></div><p className="text-sm font-bold text-slate-700">{item.produto_original || "Produto não informado"}</p><p className="mt-1 text-xs text-slate-500">{item.nome_cliente || "Cliente não informado"}</p></div><span className="text-xs font-bold text-slate-400">{diasDesde(item.criado_em)} dias</span></div><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><Campo rotulo="IMEI separado" valor={op.imei} mono /><Campo rotulo="NF" valor={op.nf} /><Campo rotulo="Rastreio" valor={op.rastreio} mono /><Campo rotulo="Criada em" valor={formatarData(item.criado_em)} /></div></Card>; })}</div>;
}

function exportarDevolucoes(devolucoes) {
  const colunas = ["protocolo", "id_anymarket", "nome_cliente", "cpf_cnpj", "produto_original", "imei_vendido", "imei_recebido", "voucher_dev", "status", "responsavel_atual", "numero_rma_aut", "numero_ri", "data_solicitacao", "data_recebimento", "data_finalizacao"];
  const escapar = valor => `"${String(valor ?? "").replace(/"/g, '""')}"`;
  const linhas = [colunas.join(";"), ...devolucoes.map(item => colunas.map(coluna => escapar(item[coluna])).join(";"))];
  const blob = new Blob(["\uFEFF" + linhas.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `devolucoes_b2c_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function GestaoTrocasDevolucoesPage() {
  const [aba, setAba] = useState("geral");
  const [devolucoes, setDevolucoes] = useState([]);
  const [trocas, setTrocas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const [dadosDevolucoes, dadosTrocas] = await Promise.all([listarDevolucoes({ limite: 3000 }), listarTrocas()]);
      setDevolucoes(dadosDevolucoes);
      setTrocas(dadosTrocas);
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelado = false;
    Promise.all([listarDevolucoes({ limite: 3000 }), listarTrocas()])
      .then(([dadosDevolucoes, dadosTrocas]) => { if (!cancelado) { setDevolucoes(dadosDevolucoes); setTrocas(dadosTrocas); setErro(""); } })
      .catch(e => { if (!cancelado) setErro(e.message); })
      .finally(() => { if (!cancelado) setLoading(false); });
    return () => { cancelado = true; };
  }, []);

  return (
    <div className="min-h-full bg-slate-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-700"><BarChart3 className="h-4 w-4" /> Gestão e acompanhamento</div><h1 className="text-2xl font-black text-slate-900">Trocas e Devoluções</h1><p className="mt-1 text-sm text-slate-500">Visão consolidada da Assurant, Furbtech e andamento sistêmico.</p></div>
          <div className="flex flex-wrap gap-2"><button onClick={() => exportarDevolucoes(devolucoes)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100"><Download className="h-4 w-4" /> Exportar devoluções</button><button onClick={carregar} disabled={loading} className="flex items-center gap-2 rounded-xl bg-[#7F2D92] px-4 py-3 text-sm font-bold text-white disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Atualizar</button></div>
        </div>

        <div className="flex overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-200">
          {[["geral", BarChart3, "Visão geral"], ["devolucoes", History, "Devoluções"], ["trocas", ArrowLeftRight, "Trocas"]].map(([valor, Icone, rotulo]) => <button key={valor} onClick={() => setAba(valor)} className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold transition ${aba === valor ? "bg-[#7F2D92] text-white" : "text-slate-600 hover:bg-slate-100"}`}>{createElement(Icone, { className: "h-4 w-4" })}{rotulo}</button>)}
        </div>

        {erro && <div className="flex items-start gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700 ring-1 ring-red-200"><AlertTriangle className="h-4 w-4 shrink-0" />{erro}</div>}
        {loading && <Card className="py-14 text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-purple-600" /><p className="mt-3 text-sm font-bold text-slate-500">Carregando gestão...</p></Card>}
        {!loading && aba === "geral" && <ResumoGeral devolucoes={devolucoes} trocas={trocas} />}
        {!loading && aba === "devolucoes" && <ListaDevolucoes devolucoes={devolucoes} />}
        {!loading && aba === "trocas" && <ListaTrocas trocas={trocas} />}
      </div>
    </div>
  );
}