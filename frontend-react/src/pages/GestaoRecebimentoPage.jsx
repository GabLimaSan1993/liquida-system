import { useState, useEffect } from "react";
import {
  ClipboardList, RefreshCw, PlayCircle, Truck, Users, Clock,
  Search, FileSpreadsheet, FileText, Package, AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  buscarGestaoRecebimento, buscarRomaneioGestao, fmtDuracao, fmtDataHora,
} from "../services/gestaoRecebimentoService.js";

const PERIODOS = [
  { key: "7d",   label: "7 dias"  },
  { key: "30d",  label: "30 dias" },
  { key: "tudo", label: "Tudo"    },
];

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function KpiCard({ label, value, sub, destaque }) {
  return (
    <div className={`rounded-2xl p-4 ring-1 ${destaque ? "bg-emerald-50 ring-emerald-200" : "bg-white ring-slate-200"} shadow-sm`}>
      <div className={`text-xs font-semibold ${destaque ? "text-emerald-700" : "text-slate-500"}`}>{label}</div>
      <div className={`text-2xl font-black mt-0.5 ${destaque ? "text-emerald-800" : "text-slate-800"}`}>{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${destaque ? "text-emerald-600" : "text-slate-400"}`}>{sub}</div>}
    </div>
  );
}

function iniciais(nome) {
  if (!nome) return "—";
  return nome.split(" ").filter(Boolean).slice(0, 2).map(p => p[0]).join("").toUpperCase();
}

function exportarExcel(rec, vouchers) {
  const cab = [
    ["ROMANEIO DE RECEBIMENTO — YBV"],
    [],
    ["Transportadora", rec.transportadora],
    ["Motorista", rec.motorista_nome || "—"],
    ["CPF", rec.motorista_cpf || "—"],
    ["Placa", rec.placa || "—"],
    ["Lacres", (rec.lacres || []).join(", ") || "—"],
    ["Colaborador", rec.iniciado_por_nome || "—"],
    ["Início", fmtDataHora(rec.iniciado_em)],
    ["Término", fmtDataHora(rec.concluido_em)],
    ["Total de vouchers", vouchers.length],
    [],
    ["#", "Voucher", "Bipado em", "Colaborador"],
  ];
  const linhas = vouchers.map((v, i) => [i + 1, v.voucher, fmtDataHora(v.bipado_em), v.bipado_por_nome || "—"]);
  const ws = XLSX.utils.aoa_to_sheet([...cab, ...linhas]);
  ws["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Romaneio");
  XLSX.writeFile(wb, `romaneio_${rec.transportadora}_${rec.id.slice(0, 8)}.xlsx`);
}

function exportarPDF(rec, vouchers) {
  const doc = new jsPDF();
  doc.setFontSize(14);
  doc.text("Romaneio de Recebimento — YBV", 14, 16);
  doc.setFontSize(10);
  const info = [
    `Transportadora: ${rec.transportadora}`,
    `Motorista: ${rec.motorista_nome || "—"}   CPF: ${rec.motorista_cpf || "—"}   Placa: ${rec.placa || "—"}`,
    `Lacres: ${(rec.lacres || []).join(", ") || "—"}`,
    `Colaborador: ${rec.iniciado_por_nome || "—"}`,
    `Início: ${fmtDataHora(rec.iniciado_em)}   Término: ${fmtDataHora(rec.concluido_em)}`,
    `Total de vouchers: ${vouchers.length}`,
  ];
  info.forEach((t, i) => doc.text(t, 14, 26 + i * 6));
  doc.autoTable({
    startY: 26 + info.length * 6 + 4,
    head: [["#", "Voucher", "Bipado em", "Colaborador"]],
    body: vouchers.map((v, i) => [i + 1, v.voucher, fmtDataHora(v.bipado_em), v.bipado_por_nome || "—"]),
    styles: { fontSize: 9 },
    headStyles: { fillColor: [127, 45, 146] },
  });
  doc.save(`romaneio_${rec.transportadora}_${rec.id.slice(0, 8)}.pdf`);
}

export default function GestaoRecebimentoPage() {
  const [periodo, setPeriodo] = useState("30d");
  const [dados, setDados]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [baixando, setBaixando] = useState(null);

  useEffect(() => { carregar(); }, [periodo]);

  async function carregar() {
    setLoading(true);
    try {
      const res = await buscarGestaoRecebimento(periodo);
      setDados(res.ok ? res : null);
    } catch (e) { console.error(e); setDados(null); }
    finally { setLoading(false); }
  }

  async function baixar(recId, tipo) {
    setBaixando(`${recId}-${tipo}`);
    try {
      const res = await buscarRomaneioGestao(recId);
      if (res.ok) {
        if (tipo === "excel") exportarExcel(res.recebimento, res.vouchers);
        else exportarPDF(res.recebimento, res.vouchers);
      }
    } catch (e) { console.error(e); }
    finally { setBaixando(null); }
  }

  const kpis   = dados?.kpis;
  const transp = dados?.transportadoras || [];
  const colabs = dados?.colaboradores || [];
  const andamento = dados?.emAndamento || [];
  const historico = dados?.historico || [];

  const maxTransp = Math.max(1, ...transp.map(t => t.qtd));

  const historicoFiltrado = historico.filter(r => {
    if (!busca) return true;
    const b = busca.toLowerCase();
    return (r.motorista_nome || "").toLowerCase().includes(b)
      || (r.placa || "").toLowerCase().includes(b)
      || (r.transportadora || "").toLowerCase().includes(b)
      || (r.iniciado_por_nome || "").toLowerCase().includes(b);
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 flex-wrap">
        <ClipboardList className="h-6 w-6 text-[#7F2D92]" />
        <div className="flex-1">
          <h2 className="text-lg font-black text-slate-800">Gestão de Recebimento YBV</h2>
          <p className="text-xs text-slate-500">Histórico, tempos, produtividade e cargas em andamento</p>
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODOS.map(p => (
            <button key={p.key} onClick={() => setPeriodo(p.key)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-xl transition ${
                periodo === p.key ? "bg-[#7F2D92] text-white" : "bg-white text-slate-500 ring-1 ring-slate-200 hover:bg-slate-50"
              }`}>
              {p.label}
            </button>
          ))}
          <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1 ml-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : !dados ? (
        <div className="text-center py-12 text-slate-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Não foi possível carregar a gestão.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KpiCard label="Recebimentos"     value={kpis.recebimentos} sub="no período" />
            <KpiCard label="Vouchers recebidos" value={kpis.vouchers.toLocaleString("pt-BR")} sub={`${kpis.voucherPorCarga} por carga`} />
            <KpiCard label="Tempo médio"      value={fmtDuracao(kpis.tempoMedioMin)} sub="início → término" />
            <KpiCard label="Em andamento"     value={kpis.emAndamento} sub="agora" destaque={kpis.emAndamento > 0} />
          </div>

          {/* Em andamento */}
          {andamento.length > 0 && (
            <Card>
              <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-emerald-600" /> Em andamento agora
              </h3>
              <div className="space-y-2">
                {andamento.map(r => (
                  <div key={r.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 bg-slate-50 ring-1 ring-slate-200">
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">{r.transportadora}</span>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-700">{r.motorista_nome || "—"} <span className="text-slate-400 font-mono text-xs">· {r.placa || "—"}</span></div>
                      <div className="text-xs text-slate-500">iniciado {fmtDataHora(r.iniciado_em)} · {r.total_vouchers || 0} vouchers · há {fmtDuracao(r.decorridoMin)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Transportadora + Colaborador */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                <Truck className="h-4 w-4 text-[#7F2D92]" /> Por transportadora
              </h3>
              {transp.length === 0 ? (
                <p className="text-xs text-slate-400">Sem dados no período.</p>
              ) : (
                <div className="space-y-3">
                  {transp.map(t => (
                    <div key={t.transportadora}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-slate-700 font-semibold">{t.transportadora}</span>
                        <span className="text-slate-500">{t.qtd} cargas · {fmtDuracao(t.tempoMedioMin)}</span>
                      </div>
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full rounded-full bg-[#7F2D92]" style={{ width: `${Math.round((t.qtd / maxTransp) * 100)}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <h3 className="font-black text-slate-800 text-sm mb-4 flex items-center gap-2">
                <Users className="h-4 w-4 text-[#7F2D92]" /> Produtividade por colaborador
              </h3>
              {colabs.length === 0 ? (
                <p className="text-xs text-slate-400">Sem dados no período.</p>
              ) : (
                <div className="space-y-2.5">
                  {colabs.map(c => (
                    <div key={c.nome} className="flex items-center gap-3 text-sm">
                      <div className="h-7 w-7 rounded-full bg-purple-50 text-[#7F2D92] flex items-center justify-center text-xs font-bold shrink-0">
                        {iniciais(c.nome)}
                      </div>
                      <span className="text-slate-700 truncate">{c.nome}</span>
                      <span className="ml-auto text-slate-500 text-xs shrink-0">{c.vouchers.toLocaleString("pt-BR")} vouchers · {fmtDuracao(c.tempoMedioMin)}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Histórico */}
          <Card>
            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <h3 className="font-black text-slate-800 text-sm">Histórico</h3>
              <div className="ml-auto relative">
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input value={busca} onChange={e => setBusca(e.target.value)}
                  placeholder="Buscar por motorista, placa, transportadora…"
                  className="w-72 max-w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
              </div>
            </div>

            {historicoFiltrado.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">{busca ? "Nenhum recebimento encontrado." : "Nenhum recebimento concluído ainda."}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-400 border-b border-slate-100">
                      <th className="text-left font-semibold py-2 pr-3">Transp.</th>
                      <th className="text-left font-semibold py-2 pr-3">Motorista</th>
                      <th className="text-left font-semibold py-2 pr-3">Placa</th>
                      <th className="text-left font-semibold py-2 pr-3">Vouchers</th>
                      <th className="text-left font-semibold py-2 pr-3">Tempo</th>
                      <th className="text-left font-semibold py-2 pr-3">Colaborador</th>
                      <th className="text-left font-semibold py-2 pr-3">Início</th>
                      <th className="text-right font-semibold py-2">Romaneio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {historicoFiltrado.map(r => {
                      const tempoMin = r.concluido_em ? Math.round((new Date(r.concluido_em) - new Date(r.iniciado_em)) / 60000) : null;
                      return (
                        <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50">
                          <td className="py-2.5 pr-3 font-semibold text-slate-700">{r.transportadora}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{r.motorista_nome || "—"}</td>
                          <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">{r.placa || "—"}</td>
                          <td className="py-2.5 pr-3 text-slate-700">{r.total_vouchers || 0}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{fmtDuracao(tempoMin)}</td>
                          <td className="py-2.5 pr-3 text-slate-600">{r.iniciado_por_nome || "—"}</td>
                          <td className="py-2.5 pr-3 text-slate-400 text-xs">{fmtDataHora(r.iniciado_em)}</td>
                          <td className="py-2.5 text-right whitespace-nowrap">
                            <button onClick={() => baixar(r.id, "excel")} disabled={baixando === `${r.id}-excel`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 mr-3 disabled:opacity-40">
                              <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
                            </button>
                            <button onClick={() => baixar(r.id, "pdf")} disabled={baixando === `${r.id}-pdf`}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 disabled:opacity-40">
                              <FileText className="h-3.5 w-3.5" /> PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}