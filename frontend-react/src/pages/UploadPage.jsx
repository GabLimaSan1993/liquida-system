import { useState } from "react";
import { FileSpreadsheet, Upload, Landmark, Package, GitBranch } from "lucide-react";
import {
  previewFile,
  uploadAgingFile,
  uploadFaturamentoFile,
  uploadOfxFile,
} from "../services/uploadService.js";
import {
  previewTriagemAssurant,
  uploadTriagemAssurant,
} from "../services/assurantUploadService.js";
import {
  previewMovimentacao,
  uploadMovimentacao,
} from "../services/assurantMovimentacaoService.js";
import { useAuth } from "../AuthContext.jsx";

function SectionCard({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] bg-white shadow-xl shadow-violet-100/80 ${className}`}>
      {children}
    </div>
  );
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const base = "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";
  const styles = variant === "outline"
    ? "border border-[#E9D5FF] text-[#6B1F87] bg-white hover:bg-[#FCFAFF]"
    : "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white hover:opacity-95";
  return (
    <button className={`${base} ${styles} ${className}`} {...props}>
      {children}
    </button>
  );
}

function Badge({ children, color = "purple" }) {
  const colors = {
    purple: "bg-[#7F2D92] text-white",
    orange: "bg-[#F59E0B] text-white",
    blue:   "bg-blue-600 text-white",
    teal:   "bg-teal-600 text-white",
  };
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${colors[color]}`}>
      {children}
    </span>
  );
}

function ProgressBar({ value }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-[#F3E8FF]">
      <div
        className="h-full rounded-full bg-[linear-gradient(90deg,#7F2D92_0%,#F97316_100%)]"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function UploadBox({
  title, description, icon, accept, file, onChangeFile,
  onPreview, onUpload, preview, loadingPreview, loadingUpload,
  showPreview = true, extra = null,
}) {
  const Icon = icon;
  return (
    <div className="rounded-[24px] border border-dashed border-[#D8B4FE] bg-[#FCFAFF] p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-bold text-[#6B1F87]">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{description}</div>
        </div>
        <div className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] p-3 text-white shadow-lg shrink-0 ml-3">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      {extra && <div className="mt-4">{extra}</div>}

      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E9D5FF]">
        <input
          type="file"
          accept={accept}
          onChange={(e) => onChangeFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600"
        />
        <div className="mt-3 text-sm font-medium">
          {file ? file.name : "Nenhum arquivo selecionado"}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          {file ? "Arquivo pronto para envio" : `Selecione um arquivo ${accept}`}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {showPreview && (
          <Button
            onClick={onPreview}
            variant="outline"
            disabled={!file || loadingPreview || loadingUpload}
          >
            {loadingPreview ? "Validando..." : "Validar estrutura"}
          </Button>
        )}
        <Button onClick={onUpload} disabled={!file || loadingUpload || loadingPreview}>
          {loadingUpload ? "Enviando..." : "Enviar arquivo"}
        </Button>
      </div>

      {preview && (
        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#E9D5FF]">
          <div className="text-sm font-semibold text-[#6B1F87]">
            Linhas válidas encontradas: {preview.totalRows.toLocaleString("pt-BR")}
          </div>
          {preview.previewRows?.length > 0 && (
            <pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(preview.previewRows, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

export default function UploadPage() {
  const { profile, user } = useAuth();

  // ── Estados existentes ────────────────────────────────
  const [agingFile, setAgingFile]                   = useState(null);
  const [faturamentoFile, setFaturamentoFile]       = useState(null);
  const [ofxFile, setOfxFile]                       = useState(null);
  const [agingPreview, setAgingPreview]             = useState(null);
  const [faturamentoPreview, setFaturamentoPreview] = useState(null);
  const [loadingAgingPreview, setLoadingAgingPreview]             = useState(false);
  const [loadingFaturamentoPreview, setLoadingFaturamentoPreview] = useState(false);
  const [loadingAgingUpload, setLoadingAgingUpload]               = useState(false);
  const [loadingFaturamentoUpload, setLoadingFaturamentoUpload]   = useState(false);
  const [loadingOfxUpload, setLoadingOfxUpload]                   = useState(false);

  // ── Estados Triagem Assurant ──────────────────────────
  const [triagemFile, setTriagemFile]               = useState(null);
  const [triagemPreview, setTriagemPreview]         = useState(null);
  const [loadingTriagemPreview, setLoadingTriagemPreview] = useState(false);
  const [loadingTriagemUpload, setLoadingTriagemUpload]   = useState(false);
  const [mesRefTriagem, setMesRefTriagem]           = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // ── Estados Movimentação Assurant ─────────────────────
  const [movFile, setMovFile]                       = useState(null);
  const [movPreview, setMovPreview]                 = useState(null);
  const [loadingMovPreview, setLoadingMovPreview]   = useState(false);
  const [loadingMovUpload, setLoadingMovUpload]     = useState(false);

  // ── Status global ─────────────────────────────────────
  const [status, setStatus]     = useState("");
  const [progress, setProgress] = useState(0);

  const [historyCards, setHistoryCards] = useState([
    { type: "Aging",                  name: "Aguardando upload", status: "Pendente", rows: "--", progress: 0 },
    { type: "Faturamento",            name: "Aguardando upload", status: "Pendente", rows: "--", progress: 0 },
    { type: "Extrato OFX",            name: "Aguardando upload", status: "Pendente", rows: "--", progress: 0 },
    { type: "Triagem Assurant",       name: "Aguardando upload", status: "Pendente", rows: "--", progress: 0 },
    { type: "Movimentação Assurant",  name: "Aguardando upload", status: "Pendente", rows: "--", progress: 0 },
  ]);

  function updateHistoryCard(type, payload) {
    setHistoryCards((current) =>
      current.map((card) => (card.type === type ? { ...card, ...payload } : card))
    );
  }

  // ── Handlers existentes ───────────────────────────────
  async function handlePreviewAging() {
    try {
      if (!agingFile) { setStatus("Selecione um arquivo de Aging."); return; }
      setLoadingAgingPreview(true);
      setStatus("Validando estrutura do Aging...");
      const preview = await previewFile(agingFile, "aging");
      setAgingPreview(preview);
      updateHistoryCard("Aging", { name: agingFile.name, status: "Validado", rows: preview.totalRows.toLocaleString("pt-BR"), progress: 15 });
      setStatus(`Aging validado. ${preview.totalRows.toLocaleString("pt-BR")} linhas válidas.`);
    } catch (error) {
      setStatus(`Erro ao validar Aging: ${error.message}`);
    } finally {
      setLoadingAgingPreview(false);
    }
  }

  async function handlePreviewFaturamento() {
    try {
      if (!faturamentoFile) { setStatus("Selecione um arquivo de Faturamento."); return; }
      setLoadingFaturamentoPreview(true);
      setStatus("Validando estrutura do Faturamento...");
      const preview = await previewFile(faturamentoFile, "faturamento");
      setFaturamentoPreview(preview);
      updateHistoryCard("Faturamento", { name: faturamentoFile.name, status: "Validado", rows: preview.totalRows.toLocaleString("pt-BR"), progress: 15 });
      setStatus(`Faturamento validado. ${preview.totalRows.toLocaleString("pt-BR")} linhas válidas.`);
    } catch (error) {
      setStatus(`Erro ao validar Faturamento: ${error.message}`);
    } finally {
      setLoadingFaturamentoPreview(false);
    }
  }

  async function handleUploadAging() {
    try {
      if (!agingFile) { setStatus("Selecione um arquivo de Aging."); return; }
      setLoadingAgingUpload(true);
      setProgress(0);
      setStatus("Iniciando upload do Aging...");
      updateHistoryCard("Aging", { name: agingFile.name, status: "Enviando", progress: 5 });
      const result = await uploadAgingFile(agingFile, ({ inserted, duplicates, total }) => {
        const pct = total ? Math.round((inserted + duplicates) / total * 100) : 0;
        setProgress(pct);
        updateHistoryCard("Aging", { name: agingFile.name, status: "Enviando", rows: total.toLocaleString("pt-BR"), progress: pct });
        setStatus(`Aging: ${inserted.toLocaleString("pt-BR")} inseridos, ${duplicates.toLocaleString("pt-BR")} duplicados.`);
      });
      updateHistoryCard("Aging", { name: agingFile.name, status: "Concluído", rows: result.total.toLocaleString("pt-BR"), progress: 100 });
      setProgress(100);
      setStatus(`Upload do Aging concluído. Inseridos: ${result.inserted.toLocaleString("pt-BR")} | Total: ${result.total.toLocaleString("pt-BR")}.`);
    } catch (error) {
      setStatus(`Erro no upload de Aging: ${error.message}`);
      updateHistoryCard("Aging", { status: "Erro" });
    } finally {
      setLoadingAgingUpload(false);
    }
  }

  async function handleUploadFaturamento() {
    try {
      if (!faturamentoFile) { setStatus("Selecione um arquivo de Faturamento."); return; }
      setLoadingFaturamentoUpload(true);
      setProgress(0);
      setStatus("Iniciando upload do Faturamento...");
      updateHistoryCard("Faturamento", { name: faturamentoFile.name, status: "Enviando", progress: 5 });
      const result = await uploadFaturamentoFile(faturamentoFile, ({ inserted, duplicates, total }) => {
        const pct = total ? Math.round((inserted + duplicates) / total * 100) : 0;
        setProgress(pct);
        updateHistoryCard("Faturamento", { name: faturamentoFile.name, status: "Enviando", rows: total.toLocaleString("pt-BR"), progress: pct });
        setStatus(`Faturamento: ${inserted.toLocaleString("pt-BR")} inseridos, ${duplicates.toLocaleString("pt-BR")} duplicados.`);
      });
      updateHistoryCard("Faturamento", { name: faturamentoFile.name, status: "Concluído", rows: result.total.toLocaleString("pt-BR"), progress: 100 });
      setProgress(100);
      setStatus(`Upload do Faturamento concluído. Inseridos: ${result.inserted.toLocaleString("pt-BR")} | Total: ${result.total.toLocaleString("pt-BR")}.`);
    } catch (error) {
      setStatus(`Erro no upload de Faturamento: ${error.message}`);
      updateHistoryCard("Faturamento", { status: "Erro" });
    } finally {
      setLoadingFaturamentoUpload(false);
    }
  }

  async function handleUploadOfx() {
    try {
      if (!ofxFile) { setStatus("Selecione um arquivo OFX."); return; }
      setLoadingOfxUpload(true);
      setProgress(0);
      setStatus("Processando extrato OFX...");
      updateHistoryCard("Extrato OFX", { name: ofxFile.name, status: "Enviando", progress: 5 });
      const result = await uploadOfxFile(ofxFile, profile?.nome, ({ inserted, total }) => {
        const pct = total ? Math.round(inserted / total * 100) : 0;
        setProgress(pct);
        updateHistoryCard("Extrato OFX", { name: ofxFile.name, status: "Enviando", rows: total.toLocaleString("pt-BR"), progress: pct });
        setStatus(`OFX: ${inserted.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} transações enviadas.`);
      });
      updateHistoryCard("Extrato OFX", { name: ofxFile.name, status: "Concluído", rows: result.total.toLocaleString("pt-BR"), progress: 100 });
      setProgress(100);
      setStatus(`Extrato OFX importado! ${result.inserted.toLocaleString("pt-BR")} transações inseridas.`);
    } catch (error) {
      setStatus(`Erro no upload do OFX: ${error.message}`);
      updateHistoryCard("Extrato OFX", { status: "Erro" });
    } finally {
      setLoadingOfxUpload(false);
    }
  }

  // ── Handler Triagem Assurant ──────────────────────────
  async function handlePreviewTriagem() {
    try {
      if (!triagemFile) { setStatus("Selecione um arquivo de Triagem."); return; }
      setLoadingTriagemPreview(true);
      setStatus("Validando estrutura da Triagem Assurant...");
      const preview = await previewTriagemAssurant(triagemFile);
      setTriagemPreview(preview);
      updateHistoryCard("Triagem Assurant", { name: triagemFile.name, status: "Validado", rows: preview.totalRows.toLocaleString("pt-BR"), progress: 15 });
      setStatus(`Triagem validada. ${preview.totalRows.toLocaleString("pt-BR")} linhas encontradas.`);
    } catch (error) {
      setStatus(`Erro ao validar Triagem: ${error.message}`);
    } finally {
      setLoadingTriagemPreview(false);
    }
  }

  async function handleUploadTriagem() {
    try {
      if (!triagemFile) { setStatus("Selecione um arquivo de Triagem."); return; }
      if (!mesRefTriagem) { setStatus("Selecione o mês de referência."); return; }
      setLoadingTriagemUpload(true);
      setProgress(0);
      setStatus("Iniciando upload da Triagem Assurant...");
      updateHistoryCard("Triagem Assurant", { name: triagemFile.name, status: "Enviando", progress: 5 });
      const result = await uploadTriagemAssurant(
        triagemFile, user.id, mesRefTriagem,
        ({ inserted, duplicates, total }) => {
          const pct = total ? Math.round((inserted + duplicates) / total * 100) : 0;
          setProgress(pct);
          updateHistoryCard("Triagem Assurant", { name: triagemFile.name, status: "Enviando", rows: total.toLocaleString("pt-BR"), progress: pct });
          setStatus(`Triagem: ${inserted.toLocaleString("pt-BR")} inseridos, ${duplicates.toLocaleString("pt-BR")} duplicados.`);
        }
      );
      updateHistoryCard("Triagem Assurant", { name: triagemFile.name, status: "Concluído", rows: result.total.toLocaleString("pt-BR"), progress: 100 });
      setProgress(100);
      setStatus(`Upload da Triagem Assurant concluído! Inseridos: ${result.inserted.toLocaleString("pt-BR")} | Total: ${result.total.toLocaleString("pt-BR")}.`);
    } catch (error) {
      setStatus(`Erro no upload da Triagem: ${error.message}`);
      updateHistoryCard("Triagem Assurant", { status: "Erro" });
    } finally {
      setLoadingTriagemUpload(false);
    }
  }

  // ── Handler Movimentação Assurant ─────────────────────
  async function handlePreviewMovimentacao() {
    try {
      if (!movFile) { setStatus("Selecione um arquivo de Movimentação."); return; }
      setLoadingMovPreview(true);
      setStatus("Validando estrutura da Movimentação Assurant...");
      const preview = await previewMovimentacao(movFile);
      setMovPreview(preview);
      updateHistoryCard("Movimentação Assurant", { name: movFile.name, status: "Validado", rows: preview.totalRows.toLocaleString("pt-BR"), progress: 15 });
      setStatus(`Movimentação validada. ${preview.totalRows.toLocaleString("pt-BR")} linhas encontradas.`);
    } catch (error) {
      setStatus(`Erro ao validar Movimentação: ${error.message}`);
    } finally {
      setLoadingMovPreview(false);
    }
  }

  async function handleUploadMovimentacao() {
    try {
      if (!movFile) { setStatus("Selecione um arquivo de Movimentação."); return; }
      setLoadingMovUpload(true);
      setProgress(0);
      setStatus("Iniciando upload da Movimentação Assurant...");
      updateHistoryCard("Movimentação Assurant", { name: movFile.name, status: "Enviando", progress: 5 });
      const result = await uploadMovimentacao(
        movFile, user.id,
        ({ inserted, duplicates, total }) => {
          const pct = total ? Math.round((inserted + duplicates) / total * 100) : 0;
          setProgress(pct);
          updateHistoryCard("Movimentação Assurant", { name: movFile.name, status: "Enviando", rows: total.toLocaleString("pt-BR"), progress: pct });
          setStatus(`Movimentação: ${inserted.toLocaleString("pt-BR")} inseridos.`);
        }
      );
      updateHistoryCard("Movimentação Assurant", { name: movFile.name, status: "Concluído", rows: result.total.toLocaleString("pt-BR"), progress: 100 });
      setProgress(100);
      setStatus(`Upload da Movimentação concluído! ${result.inserted.toLocaleString("pt-BR")} registros inseridos.`);
    } catch (error) {
      setStatus(`Erro no upload da Movimentação: ${error.message}`);
      updateHistoryCard("Movimentação Assurant", { status: "Erro" });
    } finally {
      setLoadingMovUpload(false);
    }
  }

  // ── Render ────────────────────────────────────────────
  return (
    <SectionCard>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#6B1F87]">Central de Upload</h2>
          <Badge color="orange">Operacional</Badge>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">

          {/* Aging */}
          <UploadBox
            title="Base de Aging"
            description="Entrada de itens, OS, custos e disponibilidade."
            icon={Upload}
            accept=".csv,.xlsx,.xls"
            file={agingFile}
            onChangeFile={(file) => { setAgingFile(file); setAgingPreview(null); }}
            onPreview={handlePreviewAging}
            onUpload={handleUploadAging}
            preview={agingPreview}
            loadingPreview={loadingAgingPreview}
            loadingUpload={loadingAgingUpload}
          />

          {/* Faturamento */}
          <UploadBox
            title="Base de Faturamento"
            description="Vendas, cliente, fornecedor, lote e rentabilidade."
            icon={FileSpreadsheet}
            accept=".csv,.xlsx,.xls"
            file={faturamentoFile}
            onChangeFile={(file) => { setFaturamentoFile(file); setFaturamentoPreview(null); }}
            onPreview={handlePreviewFaturamento}
            onUpload={handleUploadFaturamento}
            preview={faturamentoPreview}
            loadingPreview={loadingFaturamentoPreview}
            loadingUpload={loadingFaturamentoUpload}
          />

          {/* OFX */}
          <UploadBox
            title="Extrato Bancário (OFX)"
            description="Importe o extrato bancário para o fluxo de caixa realizado."
            icon={Landmark}
            accept=".ofx,.OFX"
            file={ofxFile}
            onChangeFile={(file) => setOfxFile(file)}
            onUpload={handleUploadOfx}
            loadingPreview={false}
            loadingUpload={loadingOfxUpload}
            showPreview={false}
          />

          {/* Triagem Assurant */}
          <UploadBox
            title="Triagem Assurant — Diária"
            description="Importe a planilha de triagem, recebimento e expedição do Warehouse."
            icon={Package}
            accept=".csv,.xlsx,.xls"
            file={triagemFile}
            onChangeFile={(file) => { setTriagemFile(file); setTriagemPreview(null); }}
            onPreview={handlePreviewTriagem}
            onUpload={handleUploadTriagem}
            preview={triagemPreview}
            loadingPreview={loadingTriagemPreview}
            loadingUpload={loadingTriagemUpload}
            extra={
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">
                  Mês de referência
                </label>
                <input
                  type="month"
                  value={mesRefTriagem}
                  onChange={(e) => setMesRefTriagem(e.target.value)}
                  disabled={loadingTriagemUpload || loadingTriagemPreview}
                  className="rounded-xl border border-[#D8B4FE] px-3 py-2 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400 disabled:opacity-50 bg-white"
                />
              </div>
            }
          />

          {/* Movimentação Assurant */}
          <UploadBox
            title="Movimentação Assurant — Histórico"
            description="Importe o histórico de etapas por voucher para análise de SLA e rastreabilidade."
            icon={GitBranch}
            accept=".csv,.txt,.xlsx,.xls"
            file={movFile}
            onChangeFile={(file) => { setMovFile(file); setMovPreview(null); }}
            onPreview={handlePreviewMovimentacao}
            onUpload={handleUploadMovimentacao}
            preview={movPreview}
            loadingPreview={loadingMovPreview}
            loadingUpload={loadingMovUpload}
            extra={
              <div className="text-xs text-slate-500 bg-blue-50 ring-1 ring-blue-200 rounded-xl px-3 py-2">
                📋 Formato esperado: Usuário · Etapa · Voucher · Serial/IMEI · Data (separado por tab)
              </div>
            }
          />

        </div>

        {/* Status global */}
        <div className="mt-4 rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
          <div className="text-sm font-semibold text-[#6B1F87]">Status do upload</div>
          <div className="mt-1 text-sm text-slate-600">
            {status || "Selecione um arquivo, valide a estrutura e depois envie a base."}
          </div>
          <div className="mt-3">
            <ProgressBar value={progress} />
          </div>
        </div>

        {/* Cards de histórico */}
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {historyCards.map((item) => (
            <div key={item.type} className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
              <div className="flex items-center justify-between">
                <span className="inline-flex rounded-full border border-[#D8B4FE] px-3 py-1 text-xs font-semibold text-[#6B1F87]">
                  {item.type}
                </span>
                <span className="text-xs text-slate-500">{item.rows} linhas</span>
              </div>
              <div className="mt-3 font-semibold text-sm">{item.name}</div>
              <div className="mt-1 text-sm text-slate-500">{item.status}</div>
              <div className="mt-4">
                <ProgressBar value={item.progress} />
              </div>
            </div>
          ))}
        </div>

      </div>
    </SectionCard>
  );
}