import { useState, useRef, useEffect } from "react";
import {
  Truck, Lock, X, ArrowRight, ArrowLeft, Scan, CheckCircle,
  AlertTriangle, Printer, FileSpreadsheet, FileText, Loader, Trash2,
} from "lucide-react";
import JsBarcode from "jsbarcode";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import {
  criarRecebimento, biparVoucher, removerVoucher, listarVouchers,
  concluirRecebimento, buscarRomaneio, TRANSPORTADORAS,
} from "../services/recebimentoService.js";
import { useAuth } from "../AuthContext.jsx";

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function Header() {
  return (
    <div className="flex items-center gap-3">
      <span className="text-2xl">🚚</span>
      <div>
        <h2 className="text-lg font-black text-slate-800">Recebimento YBV</h2>
        <p className="text-xs text-slate-500">Registro da carga, bipagem de vouchers e romaneio</p>
      </div>
    </div>
  );
}

function fmtDataHora(d) {
  if (!d) return "—";
  return new Date(d).toLocaleString("pt-BR");
}

// Gera o SVG do código de barras (Code 128) para um voucher
function gerarBarcodeSVG(voucher) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  try {
    JsBarcode(svg, voucher, {
      format: "CODE128", width: 2, height: 60, displayValue: true,
      fontSize: 14, margin: 6, textMargin: 2,
    });
  } catch (e) { console.error("Barcode:", e); }
  return svg.outerHTML;
}

// Abre uma janela só com a etiqueta e dispara a impressão
function imprimirEtiqueta(voucher) {
  const svg = gerarBarcodeSVG(voucher);
  const win = window.open("", "_blank", "width=420,height=280");
  if (!win) return;
  win.document.write(`
    <html><head><title>Etiqueta ${voucher}</title>
    <style>
      @page { size: 50mm 30mm; margin: 0; }
      body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }
      .etq { text-align: center; }
      svg { max-width: 46mm; }
    </style></head>
    <body><div class="etq">${svg}</div>
    <script>
      window.onload = function () { window.print(); setTimeout(function(){ window.close(); }, 300); };
    </script>
    </body></html>
  `);
  win.document.close();
}

// ══════════════════════════════════════════════════════════
// TELA 1 — DADOS DA CARGA
// ══════════════════════════════════════════════════════════
function TelaCarga({ onIniciar }) {
  const { user, profile } = useAuth();
  const [transportadora, setTransportadora] = useState("");
  const [motorista, setMotorista]           = useState("");
  const [cpf, setCpf]                       = useState("");
  const [placa, setPlaca]                   = useState("");
  const [lacreInput, setLacreInput]         = useState("");
  const [lacres, setLacres]                 = useState([]);
  const [erro, setErro]                     = useState(null);
  const [criando, setCriando]               = useState(false);
  const lacreRef = useRef(null);

  function addLacre(e) {
    e.preventDefault();
    const l = lacreInput.trim().toUpperCase();
    if (!l) return;
    if (lacres.includes(l)) { setLacreInput(""); return; }
    setLacres(prev => [...prev, l]);
    setLacreInput("");
    lacreRef.current?.focus();
  }

  function removerLacre(l) {
    setLacres(prev => prev.filter(x => x !== l));
  }

  async function iniciar() {
    setErro(null);
    if (!transportadora) { setErro("Selecione a transportadora."); return; }
    setCriando(true);
    try {
      const res = await criarRecebimento(
        { transportadora, motorista_nome: motorista, motorista_cpf: cpf, placa, lacres },
        user.id, profile?.nome
      );
      if (!res.ok) { setErro(res.erro); return; }
      onIniciar(res.recebimento);
    } catch (e) { setErro(e.message); }
    finally { setCriando(false); }
  }

  return (
    <div className="space-y-5">
      <Header />
      <p className="text-sm text-slate-500">Passo 1 de 2 — registre a chegada antes de bipar.</p>

      <Card>
        <div className="mb-4">
          <div className="text-sm font-bold text-slate-700 mb-2">Transportadora</div>
          <div className="flex gap-2 flex-wrap">
            {TRANSPORTADORAS.map(t => (
              <button key={t} onClick={() => setTransportadora(t)}
                className={`text-sm font-semibold px-5 py-2 rounded-xl ring-1 transition ${
                  transportadora === t
                    ? "bg-[#7F2D92] text-white ring-[#7F2D92]"
                    : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}>
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">Nome do motorista</label>
            <input value={motorista} onChange={e => setMotorista(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">CPF</label>
            <input value={cpf} onChange={e => setCpf(e.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </div>
        </div>

        <div className="mb-5 max-w-[220px]">
          <label className="block text-sm font-bold text-slate-700 mb-1.5">Placa do carro</label>
          <input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono uppercase text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-[#7F2D92]" />
            <span className="text-sm font-bold text-slate-700">Lacres</span>
            {lacres.length > 0 && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                {lacres.length} {lacres.length > 1 ? "lacres" : "lacre"}
              </span>
            )}
          </div>
          <form onSubmit={addLacre}>
            <input ref={lacreRef} value={lacreInput} onChange={e => setLacreInput(e.target.value)}
              placeholder="Digite o lacre e tecle Enter…" autoComplete="off"
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </form>
          {lacres.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-3">
              {lacres.map(l => (
                <span key={l} className="inline-flex items-center gap-1.5 text-sm font-mono px-2.5 py-1 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                  {l}
                  <button onClick={() => removerLacre(l)} className="hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      {erro && (
        <div className="flex items-center gap-2 rounded-2xl px-4 py-3 ring-1 bg-red-50 text-red-700 ring-red-200 text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" /> <span className="font-semibold">{erro}</span>
        </div>
      )}

      <div className="flex justify-end">
        <button onClick={iniciar} disabled={criando}
          className="flex items-center gap-2 bg-[#7F2D92] text-white px-6 py-3 rounded-xl text-sm font-bold hover:bg-[#5B1E74] transition disabled:opacity-50">
          {criando ? <Loader className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          Iniciar bipagem
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// TELA 2 — BIPAGEM E ENTRADA
// ══════════════════════════════════════════════════════════
function TelaBipagem({ recebimento, onVoltar, onConcluir }) {
  const { user, profile } = useAuth();
  const [voucherInput, setVoucherInput] = useState("");
  const [vouchers, setVouchers]         = useState([]);
  const [feedback, setFeedback]         = useState(null);
  const [proc, setProc]                 = useState(false);
  const [concluindo, setConcluindo]     = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { carregar(); inputRef.current?.focus(); }, []);

  async function carregar() {
    setVouchers(await listarVouchers(recebimento.id));
  }

  async function handleBipar(e) {
    e.preventDefault();
    const v = voucherInput.trim();
    if (!v || proc) return;
    setVoucherInput("");
    setProc(true);
    try {
      const res = await biparVoucher(recebimento.id, v, user.id, profile?.nome);
      if (!res.ok) {
        setFeedback({ tipo: "erro", msg: res.erro });
      } else {
        setFeedback({ tipo: "ok", msg: `Voucher ${res.voucher.voucher} recebido.` });
        setVouchers(prev => [res.voucher, ...prev]);
        imprimirEtiqueta(res.voucher.voucher); // impressão automática
      }
    } catch (err) {
      setFeedback({ tipo: "erro", msg: err.message });
    } finally {
      setProc(false);
      inputRef.current?.focus();
      setTimeout(() => setFeedback(null), 3500);
    }
  }

  async function handleRemover(vId) {
    const res = await removerVoucher(vId, recebimento.id);
    if (res.ok) setVouchers(prev => prev.filter(v => v.id !== vId));
    inputRef.current?.focus();
  }

  async function handleConcluir() {
    setConcluindo(true);
    try {
      const res = await concluirRecebimento(recebimento.id, user.id);
      if (res.ok) onConcluir(res.recebimento);
    } catch (e) { console.error(e); }
    finally { setConcluindo(false); }
  }

  return (
    <div className="space-y-4">
      <Header />

      <div className="flex items-center gap-3 flex-wrap">
        <button onClick={onVoltar} className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1">
          <ArrowLeft className="h-3 w-3" /> Voltar
        </button>
        <div className="flex-1 flex items-center gap-2 flex-wrap text-xs text-slate-500">
          <span className="font-black text-slate-700">{recebimento.transportadora}</span>
          {recebimento.motorista_nome && <><span>·</span><span>{recebimento.motorista_nome}</span></>}
          {recebimento.placa && <><span>·</span><span className="font-mono">{recebimento.placa}</span></>}
          {recebimento.lacres?.length > 0 && <><span>·</span><span>{recebimento.lacres.length} lacres</span></>}
        </div>
        <button onClick={handleConcluir} disabled={concluindo || vouchers.length === 0}
          className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-700 transition disabled:opacity-50">
          {concluindo ? <Loader className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle className="h-3.5 w-3.5" />}
          Concluir recebimento
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Card>
          <h3 className="font-black text-slate-800 text-sm mb-3 flex items-center gap-2">
            <Scan className="h-4 w-4 text-[#7F2D92]" /> Bipar voucher
            <span className="ml-auto text-xs font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              {vouchers.length} recebidos
            </span>
          </h3>
          <form onSubmit={handleBipar}>
            <input ref={inputRef} value={voucherInput} onChange={e => setVoucherInput(e.target.value)}
              placeholder="Bipe ou digite o voucher (YBV…)" autoComplete="off"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-mono font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92]" />
          </form>
          <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-400">
            <span>Só aceita códigos que começam com YBV. A etiqueta imprime sozinha ao bipar.</span>
          </div>
          {feedback && (
            <div className={`mt-3 flex items-center gap-2 text-sm rounded-xl px-4 py-3 ring-1 ${
              feedback.tipo === "ok" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-red-50 text-red-700 ring-red-200"
            }`}>
              {feedback.tipo === "ok" ? <CheckCircle className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
              <span className="font-semibold">{feedback.msg}</span>
            </div>
          )}
        </Card>

        <Card>
          <h3 className="font-black text-slate-800 text-sm mb-3">Vouchers recebidos</h3>
          {vouchers.length === 0 ? (
            <p className="text-xs text-slate-400">Nenhum voucher bipado ainda.</p>
          ) : (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {vouchers.map(v => (
                <div key={v.id} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-slate-50 ring-1 ring-slate-200">
                  <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-sm font-mono text-slate-700">{v.voucher}</span>
                  <div className="ml-auto flex items-center gap-2 shrink-0">
                    <button onClick={() => imprimirEtiqueta(v.voucher)}
                      className="flex items-center gap-1 text-xs text-[#7F2D92] hover:text-[#5B1E74] font-semibold">
                      <Printer className="h-3.5 w-3.5" /> Reimprimir
                    </button>
                    <button onClick={() => handleRemover(v.id)} className="text-slate-300 hover:text-red-500">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// TELA 3 — ROMANEIO / CONCLUSÃO
// ══════════════════════════════════════════════════════════
function TelaRomaneio({ recebimentoId, onNovo }) {
  const [dados, setDados]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    const res = await buscarRomaneio(recebimentoId);
    setDados(res.ok ? res : null);
    setLoading(false);
  }

  function exportarExcel() {
    if (!dados) return;
    const r = dados.recebimento;
    const cab = [
      ["ROMANEIO DE RECEBIMENTO — YBV"],
      [],
      ["Transportadora", r.transportadora],
      ["Motorista", r.motorista_nome || "—"],
      ["CPF", r.motorista_cpf || "—"],
      ["Placa", r.placa || "—"],
      ["Lacres", (r.lacres || []).join(", ") || "—"],
      ["Colaborador", r.iniciado_por_nome || "—"],
      ["Início", fmtDataHora(r.iniciado_em)],
      ["Término", fmtDataHora(r.concluido_em)],
      ["Total de vouchers", dados.vouchers.length],
      [],
      ["#", "Voucher", "Bipado em", "Colaborador"],
    ];
    const linhas = dados.vouchers.map((v, i) => [i + 1, v.voucher, fmtDataHora(v.bipado_em), v.bipado_por_nome || "—"]);
    const ws = XLSX.utils.aoa_to_sheet([...cab, ...linhas]);
    ws["!cols"] = [{ wch: 6 }, { wch: 22 }, { wch: 22 }, { wch: 22 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Romaneio");
    XLSX.writeFile(wb, `romaneio_${r.transportadora}_${r.id.slice(0, 8)}.xlsx`);
  }

  function exportarPDF() {
    if (!dados) return;
    const r = dados.recebimento;
    const doc = new jsPDF();
    doc.setFontSize(14);
    doc.text("Romaneio de Recebimento — YBV", 14, 16);
    doc.setFontSize(10);
    const info = [
      `Transportadora: ${r.transportadora}`,
      `Motorista: ${r.motorista_nome || "—"}   CPF: ${r.motorista_cpf || "—"}   Placa: ${r.placa || "—"}`,
      `Lacres: ${(r.lacres || []).join(", ") || "—"}`,
      `Colaborador: ${r.iniciado_por_nome || "—"}`,
      `Início: ${fmtDataHora(r.iniciado_em)}   Término: ${fmtDataHora(r.concluido_em)}`,
      `Total de vouchers: ${dados.vouchers.length}`,
    ];
    info.forEach((t, i) => doc.text(t, 14, 26 + i * 6));

    autoTable(doc, {
      startY: 26 + info.length * 6 + 4,
      head: [["#", "Voucher", "Bipado em", "Colaborador"]],
      body: dados.vouchers.map((v, i) => [i + 1, v.voucher, fmtDataHora(v.bipado_em), v.bipado_por_nome || "—"]),
      styles: { fontSize: 9 },
      headStyles: { fillColor: [127, 45, 146] },
    });
    doc.save(`romaneio_${r.transportadora}_${r.id.slice(0, 8)}.pdf`);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
    </div>;
  }
  if (!dados) return <p className="text-sm text-slate-400">Não foi possível carregar o romaneio.</p>;

  const r = dados.recebimento;
  return (
    <div className="space-y-5">
      <Header />
      <Card className="ring-emerald-200">
        <div className="flex items-center gap-2 mb-4">
          <CheckCircle className="h-6 w-6 text-emerald-600" />
          <h3 className="font-black text-slate-800">Recebimento concluído</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
          <Info label="Transportadora" valor={r.transportadora} />
          <Info label="Motorista" valor={r.motorista_nome || "—"} />
          <Info label="CPF" valor={r.motorista_cpf || "—"} />
          <Info label="Placa" valor={r.placa || "—"} />
          <Info label="Colaborador" valor={r.iniciado_por_nome || "—"} />
          <Info label="Total vouchers" valor={dados.vouchers.length} />
          <Info label="Início" valor={fmtDataHora(r.iniciado_em)} />
          <Info label="Término" valor={fmtDataHora(r.concluido_em)} />
          <Info label="Lacres" valor={(r.lacres || []).join(", ") || "—"} />
        </div>
      </Card>

      <div className="flex gap-3 flex-wrap">
        <button onClick={exportarExcel}
          className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-emerald-700 transition">
          <FileSpreadsheet className="h-4 w-4" /> Baixar Excel
        </button>
        <button onClick={exportarPDF}
          className="flex items-center gap-2 bg-red-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition">
          <FileText className="h-4 w-4" /> Baixar PDF
        </button>
        <button onClick={onNovo}
          className="flex items-center gap-2 bg-[#7F2D92] text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-[#5B1E74] transition">
          <Truck className="h-4 w-4" /> Novo recebimento
        </button>
      </div>

      <Card>
        <h3 className="font-black text-slate-800 text-sm mb-3">Vouchers ({dados.vouchers.length})</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5">
          {dados.vouchers.map((v, i) => (
            <div key={i} className="text-xs font-mono text-slate-600 bg-slate-50 rounded-lg px-2.5 py-1.5 ring-1 ring-slate-200">{v.voucher}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Info({ label, valor }) {
  return (
    <div>
      <div className="text-xs text-slate-400 font-semibold">{label}</div>
      <div className="text-slate-700 font-semibold">{valor}</div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function RecebimentoPage() {
  const [etapa, setEtapa]             = useState("carga");   // carga | bipagem | romaneio
  const [recebimento, setRecebimento] = useState(null);

  return (
    <>
      {etapa === "carga" && (
        <TelaCarga onIniciar={rec => { setRecebimento(rec); setEtapa("bipagem"); }} />
      )}
      {etapa === "bipagem" && recebimento && (
        <TelaBipagem
          recebimento={recebimento}
          onVoltar={() => setEtapa("carga")}
          onConcluir={rec => { setRecebimento(rec); setEtapa("romaneio"); }}
        />
      )}
      {etapa === "romaneio" && recebimento && (
        <TelaRomaneio
          recebimentoId={recebimento.id}
          onNovo={() => { setRecebimento(null); setEtapa("carga"); }}
        />
      )}
    </>
  );
}