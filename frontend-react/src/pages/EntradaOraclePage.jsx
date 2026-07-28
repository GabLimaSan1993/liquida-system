import { useState, useEffect, useMemo } from "react";
import * as XLSX from "xlsx";
import {
  Search, CheckCircle, AlertTriangle, Download, Loader, Zap, RefreshCw,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  listarAguardandoOracle,
  listarConfirmadosOracle,
  confirmarOracle,
} from "../services/entradaOracleService.js";

const ABAS = [
  { key: "entrada",   label: "Entrada no Oracle" },
  { key: "saida",     label: "Saída no Oracle" },
  { key: "devolucao", label: "Devolução aguardando RI" },
];

function Badge({ valor }) {
  if (valor == null) return <span className="text-slate-300">—</span>;
  return (
    <span className="inline-flex min-w-[34px] justify-center rounded-lg bg-[#EEEDFE] px-2 py-0.5 text-xs font-bold text-[#3C3489]">
      {valor}
    </span>
  );
}

function dataHora(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function TabEntrada() {
  const { user } = useAuth();

  // Visão principal: Pendente (aguardando Oracle) ou Concluído (já confirmado).
  const [visao, setVisao] = useState("pendente");

  const [pendentesLista, setPendentesLista]   = useState([]);
  const [concluidosLista, setConcluidosLista] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [busca, setBusca]         = useState("");
  const [selecao, setSelecao]     = useState(() => new Set());
  const [filtroRi, setFiltroRi]   = useState(null); // null | "sem_ri" | "com_ri"
  const [confirmando, setConfirmando] = useState(false);
  const [feedback, setFeedback]   = useState(null);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [pend, conc] = await Promise.all([
        listarAguardandoOracle(),
        listarConfirmadosOracle(),
      ]);
      setPendentesLista(pend);
      setConcluidosLista(conc);
      setSelecao(new Set());
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setLoading(false);
    }
  }

  const base = visao === "pendente" ? pendentesLista : concluidosLista;

  const semRi = pendentesLista.filter(i => i.pendenteRi).length;
  const comRi = pendentesLista.length - semRi;

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return base.filter(i => {
      if (visao === "pendente") {
        if (filtroRi === "sem_ri" && !i.pendenteRi) return false;
        if (filtroRi === "com_ri" &&  i.pendenteRi) return false;
      }
      if (!q) return true;
      return [i.voucher, i.imei, i.sku, i.produto, i.documento, i.ri, i.nf]
        .some(v => String(v || "").toLowerCase().includes(q));
    });
  }, [base, busca, filtroRi, visao]);

  const podeSelecionar = visao === "pendente";
  const todosMarcados = podeSelecionar && filtrados.length > 0 && filtrados.every(i => selecao.has(i.imei));

  function alternarTodos() {
    const novo = new Set(selecao);
    if (todosMarcados) filtrados.forEach(i => novo.delete(i.imei));
    else               filtrados.forEach(i => novo.add(i.imei));
    setSelecao(novo);
  }

  function alternarUm(imei) {
    const novo = new Set(selecao);
    if (novo.has(imei)) novo.delete(imei);
    else                novo.add(imei);
    setSelecao(novo);
  }

  function trocarVisao(nova) {
    setVisao(nova);
    setSelecao(new Set());
    setFiltroRi(null);
  }

  function alternarFiltro(valor) {
    setFiltroRi(atual => (atual === valor ? null : valor));
  }

  async function handleConfirmar() {
    if (!selecao.size) return;
    setConfirmando(true);
    setFeedback(null);
    try {
      const res = await confirmarOracle([...selecao], user.id);
      if (!res.ok) {
        setFeedback({ tipo: "erro", msg: res.erro });
      } else {
        const parcial = res.confirmados < res.solicitados;
        setFeedback({
          tipo: parcial ? "aviso" : "ok",
          msg: parcial
            ? `${res.confirmados} de ${res.solicitados} confirmados. Os demais já haviam saído de "Aguardando oracle".`
            : `✓ ${res.confirmados} ${res.confirmados === 1 ? "item confirmado" : "itens confirmados"} no Oracle. Já estão em Concluídos e disponíveis para o FIFO.`,
        });
        setSelecao(new Set());
        await carregar();
      }
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setConfirmando(false);
      setTimeout(() => setFeedback(null), 7000);
    }
  }

  function handleBaixar() {
    const alvo = selecao.size ? filtrados.filter(i => selecao.has(i.imei)) : filtrados;
    if (!alvo.length) return;
    const linhas = alvo.map(i => ({
      Voucher:      i.voucher,
      IMEI:         i.imei,
      SKU:          i.sku,
      Produto:      i.produto,
      Grade:        i.grade,
      "Grade Oracle": i.gradeOracle,
      "Bateria 70-79%": i.rebaixado ? "Sim" : "",
      Local:        i.local,
      Documento:    i.documento,
      "Número RI":  i.ri,
      "Nota Fiscal": i.nf,
      "Status PO":  i.poStatus,
      Situação:     visao === "concluido"
        ? "Confirmado no Oracle"
        : (i.pendenteRi ? "Pendente RI" : "Pendente entrada"),
      "Confirmado em":  visao === "concluido" ? dataHora(i.confirmadoEm) : "",
      "Confirmado por": visao === "concluido" ? (i.confirmadoPor || "") : "",
    }));
    const ws = XLSX.utils.json_to_sheet(linhas);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, visao === "concluido" ? "Concluídos" : "Pendentes");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `entrada_oracle_${visao}_${hoje}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {/* Pendente x Concluído */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => trocarVisao("pendente")}
          className={`rounded-2xl px-4 py-2 text-sm font-bold ring-1 transition ${
            visao === "pendente"
              ? "bg-[#7F2D92] text-white ring-[#7F2D92]"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
          }`}>
          Pendentes · {pendentesLista.length}
        </button>
        <button onClick={() => trocarVisao("concluido")}
          className={`rounded-2xl px-4 py-2 text-sm font-bold ring-1 transition ${
            visao === "concluido"
              ? "bg-[#7F2D92] text-white ring-[#7F2D92]"
              : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
          }`}>
          Concluídos · {concluidosLista.length}
        </button>
      </div>

      {feedback && (
        <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${
          feedback.tipo === "ok"    ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
          feedback.tipo === "aviso" ? "bg-amber-50 text-amber-800 ring-amber-200" :
                                      "bg-red-50 text-red-700 ring-red-200"
        }`}>
          {feedback.tipo === "ok"
            ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
            : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
          <span className="font-semibold">{feedback.msg}</span>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-base font-bold text-slate-800">
          {visao === "pendente" ? "Aguardando Oracle" : "Confirmados no Oracle"} ·{" "}
          <span className="font-semibold text-slate-500">
            {filtrados.length} {filtrados.length === 1 ? "item" : "itens"}
          </span>
        </div>
        <div className="flex gap-2">
          <button onClick={carregar} disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
          </button>
          <button onClick={handleBaixar} disabled={!filtrados.length}
            className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[13px] font-bold text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF] disabled:opacity-40">
            <Download className="h-3.5 w-3.5" /> Baixar relatório
          </button>
          {podeSelecionar && (
            <button onClick={handleConfirmar} disabled={!selecao.size || confirmando}
              className="rounded-xl bg-emerald-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
              {confirmando ? "Confirmando..." : selecao.size ? `Confirmar Oracle (${selecao.size})` : "Confirmar Oracle"}
            </button>
          )}
        </div>
      </div>

      {/* Filtro de RI — só faz sentido na lista de pendentes */}
      {visao === "pendente" && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => alternarFiltro("sem_ri")}
            className={`rounded-xl px-3 py-1.5 text-[13px] font-bold ring-1 transition ${
              filtroRi === "sem_ri"
                ? "bg-amber-500 text-white ring-amber-500"
                : "bg-white text-amber-700 ring-amber-200 hover:bg-amber-50"
            }`}>
            Pendente RI · {semRi}
          </button>
          <button onClick={() => alternarFiltro("com_ri")}
            className={`rounded-xl px-3 py-1.5 text-[13px] font-bold ring-1 transition ${
              filtroRi === "com_ri"
                ? "bg-sky-600 text-white ring-sky-600"
                : "bg-white text-sky-700 ring-sky-200 hover:bg-sky-50"
            }`}>
            Pendente Entrada · {comRi}
          </button>
          {filtroRi && (
            <button onClick={() => setFiltroRi(null)}
              className="rounded-xl px-3 py-1.5 text-[13px] font-semibold text-slate-500 hover:bg-slate-100">
              Limpar filtro
            </button>
          )}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por voucher, IMEI, SKU, produto ou documento"
          className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-400">
          <Loader className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : !filtrados.length ? (
        <div className="rounded-2xl bg-slate-50 py-10 text-center text-sm text-slate-400 ring-1 ring-slate-200">
          {base.length
            ? "Nenhum item corresponde ao filtro ou à busca."
            : visao === "pendente" ? "Nenhum item aguardando Oracle." : "Nenhuma confirmação registrada ainda."}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl ring-1 ring-slate-200">
          <table className="w-full min-w-[1020px] text-[13px]">
            <thead>
              <tr className="bg-slate-50 text-left text-slate-500">
                {podeSelecionar && (
                  <th className="w-10 px-3 py-2.5">
                    <input type="checkbox" checked={todosMarcados} onChange={alternarTodos} />
                  </th>
                )}
                <th className="px-3 py-2.5 font-bold">Voucher</th>
                <th className="px-3 py-2.5 font-bold">IMEI</th>
                <th className="px-3 py-2.5 font-bold">SKU</th>
                <th className="px-3 py-2.5 font-bold">Produto</th>
                <th className="px-3 py-2.5 font-bold">Grade</th>
                <th className="px-3 py-2.5 font-bold">Oracle</th>
                <th className="px-3 py-2.5 font-bold">Documento</th>
                <th className="px-3 py-2.5 font-bold">RI</th>
                <th className="px-3 py-2.5 font-bold">Nota fiscal</th>
                {visao === "concluido" && <th className="px-3 py-2.5 font-bold">Confirmado</th>}
              </tr>
            </thead>
            <tbody>
              {filtrados.map(i => (
                <tr key={i.imei} className="border-t border-slate-100 hover:bg-slate-50/60">
                  {podeSelecionar && (
                    <td className="px-3 py-2.5">
                      <input type="checkbox" checked={selecao.has(i.imei)} onChange={() => alternarUm(i.imei)} />
                    </td>
                  )}
                  <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{i.voucher || "—"}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{i.imei}</td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{i.sku || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-700">{i.produto || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-700">
                    {i.grade || "—"}
                    {i.rebaixado && (
                      <Zap className="ml-1 inline h-3 w-3 text-amber-500" title="Bateria 70-79% — grade rebaixada" />
                    )}
                  </td>
                  <td className="px-3 py-2.5"><Badge valor={i.gradeOracle} /></td>
                  <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{i.documento || "—"}</td>
                  <td className="px-3 py-2.5">
                    {i.ri || <span className="rounded-md bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-700">Pendente RI</span>}
                  </td>
                  <td className="px-3 py-2.5 text-slate-700">{i.nf || "—"}</td>
                  {visao === "concluido" && (
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {dataHora(i.confirmadoEm)}
                      {i.confirmadoPor && <div className="text-slate-400">{i.confirmadoPor}</div>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Pendente RI = o relatório AP ainda não trouxe o número do RI desse voucher.
        Pendente Entrada = já tem RI e está pronto para confirmar no Oracle.
        Ao confirmar, o item vai para Concluídos e passa a "Produto disponível" — a partir daí entra no FIFO.
      </p>
    </div>
  );
}

function AbaEmBreve({ nome }) {
  return (
    <div className="rounded-2xl bg-slate-50 py-16 text-center ring-1 ring-slate-200">
      <p className="text-sm font-bold text-slate-500">{nome}</p>
      <p className="mt-1 text-xs text-slate-400">Em breve — etapa ainda não mapeada.</p>
    </div>
  );
}

export default function EntradaOraclePage() {
  const [aba, setAba] = useState("entrada");

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      <div className="mb-5 flex gap-5 border-b border-slate-200 text-sm">
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`-mb-px border-b-2 pb-2.5 font-semibold transition ${
              aba === a.key
                ? "border-[#7F2D92] text-[#7F2D92]"
                : "border-transparent text-slate-400 hover:text-slate-600"
            }`}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === "entrada"   && <TabEntrada />}
      {aba === "saida"     && <AbaEmBreve nome="Saída no Oracle" />}
      {aba === "devolucao" && <AbaEmBreve nome="Devolução aguardando RI" />}
    </div>
  );
}