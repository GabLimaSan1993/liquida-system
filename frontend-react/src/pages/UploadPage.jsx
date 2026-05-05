import { useState } from "react";
import { FileSpreadsheet, Upload } from "lucide-react";
import {
  previewFile,
  uploadAgingFile,
  uploadFaturamentoFile,
} from "../services/uploadService.js";

function SectionCard({ children, className = "" }) {
  return (
    <div className={`rounded-[28px] bg-white shadow-xl shadow-violet-100/80 ${className}`}>
      {children}
    </div>
  );
}

function Button({ children, variant = "primary", className = "", ...props }) {
  const base =
    "inline-flex items-center justify-center rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed";

  const styles =
    variant === "outline"
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
  title,
  description,
  icon,
  file,
  onChangeFile,
  onPreview,
  onUpload,
  preview,
  loadingPreview,
  loadingUpload,
}) {
  const Icon = icon;

  return (
    <div className="rounded-[24px] border border-dashed border-[#D8B4FE] bg-[#FCFAFF] p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-lg font-bold text-[#6B1F87]">{title}</div>
          <div className="mt-1 text-sm text-slate-500">{description}</div>
        </div>

        <div className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] p-3 text-white shadow-lg">
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <div className="mt-5 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-[#E9D5FF]">
        <input
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={(e) => onChangeFile(e.target.files?.[0] || null)}
          className="block w-full text-sm text-slate-600"
        />

        <div className="mt-3 text-sm font-medium">
          {file ? file.name : "Nenhum arquivo selecionado"}
        </div>

        <div className="mt-1 text-xs text-slate-500">
          {file ? "Arquivo pronto para validação e envio" : "Selecione um CSV ou Excel"}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onPreview} variant="outline" disabled={!file || loadingPreview || loadingUpload}>
          {loadingPreview ? "Validando..." : "Validar estrutura"}
        </Button>

        <Button onClick={onUpload} disabled={!file || loadingUpload || loadingPreview}>
          {loadingUpload ? "Enviando..." : "Enviar arquivo"}
        </Button>
      </div>

      {preview ? (
        <div className="mt-4 rounded-2xl bg-white p-4 ring-1 ring-[#E9D5FF]">
          <div className="text-sm font-semibold text-[#6B1F87]">
            Linhas válidas encontradas: {preview.totalRows.toLocaleString("pt-BR")}
          </div>

          {preview.previewRows?.length > 0 ? (
            <pre className="mt-3 max-h-72 overflow-auto rounded-2xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(preview.previewRows, null, 2)}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function UploadPage() {
  const [agingFile, setAgingFile] = useState(null);
  const [faturamentoFile, setFaturamentoFile] = useState(null);

  const [agingPreview, setAgingPreview] = useState(null);
  const [faturamentoPreview, setFaturamentoPreview] = useState(null);

  const [loadingAgingPreview, setLoadingAgingPreview] = useState(false);
  const [loadingFaturamentoPreview, setLoadingFaturamentoPreview] = useState(false);

  const [loadingAgingUpload, setLoadingAgingUpload] = useState(false);
  const [loadingFaturamentoUpload, setLoadingFaturamentoUpload] = useState(false);

  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);

  const [historyCards, setHistoryCards] = useState([
    {
      type: "Aging",
      name: "Aguardando upload",
      status: "Pendente",
      rows: "--",
      progress: 0,
    },
    {
      type: "Faturamento",
      name: "Aguardando upload",
      status: "Pendente",
      rows: "--",
      progress: 0,
    },
  ]);

  function updateHistoryCard(type, payload) {
    setHistoryCards((current) =>
      current.map((card) => (card.type === type ? { ...card, ...payload } : card))
    );
  }

  async function handlePreviewAging() {
    try {
      if (!agingFile) {
        setStatus("Selecione um arquivo de Aging.");
        return;
      }

      setLoadingAgingPreview(true);
      setStatus("Validando estrutura do Aging...");
      const preview = await previewFile(agingFile, "aging");
      setAgingPreview(preview);

      updateHistoryCard("Aging", {
        name: agingFile.name,
        status: "Validado",
        rows: preview.totalRows.toLocaleString("pt-BR"),
        progress: 15,
      });

      setStatus(`Aging validado com sucesso. ${preview.totalRows.toLocaleString("pt-BR")} linhas válidas encontradas.`);
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao validar Aging: ${error.message || "falha na leitura"}`);
    } finally {
      setLoadingAgingPreview(false);
    }
  }

  async function handlePreviewFaturamento() {
    try {
      if (!faturamentoFile) {
        setStatus("Selecione um arquivo de Faturamento.");
        return;
      }

      setLoadingFaturamentoPreview(true);
      setStatus("Validando estrutura do Faturamento...");
      const preview = await previewFile(faturamentoFile, "faturamento");
      setFaturamentoPreview(preview);

      updateHistoryCard("Faturamento", {
        name: faturamentoFile.name,
        status: "Validado",
        rows: preview.totalRows.toLocaleString("pt-BR"),
        progress: 15,
      });

      setStatus(`Faturamento validado com sucesso. ${preview.totalRows.toLocaleString("pt-BR")} linhas válidas encontradas.`);
    } catch (error) {
      console.error(error);
      setStatus(`Erro ao validar Faturamento: ${error.message || "falha na leitura"}`);
    } finally {
      setLoadingFaturamentoPreview(false);
    }
  }

  async function handleUploadAging() {
    try {
      if (!agingFile) {
        setStatus("Selecione um arquivo de Aging.");
        return;
      }

      setLoadingAgingUpload(true);
      setProgress(0);
      setStatus("Iniciando upload do Aging...");

      updateHistoryCard("Aging", {
        name: agingFile.name,
        status: "Enviando",
        progress: 5,
      });

      const result = await uploadAgingFile(agingFile, ({ inserted, duplicates, total }) => {
        const pct = total ? Math.round((inserted + duplicates) / total * 100) : 0;
        setProgress(pct);

        updateHistoryCard("Aging", {
          name: agingFile.name,
          status: "Enviando",
          rows: total.toLocaleString("pt-BR"),
          progress: pct,
        });

        setStatus(
          `Aging: ${inserted.toLocaleString("pt-BR")} inseridos, ${duplicates.toLocaleString("pt-BR")} duplicados, de ${total.toLocaleString("pt-BR")} registros.`
        );
      });

      updateHistoryCard("Aging", {
        name: agingFile.name,
        status: "Concluído",
        rows: result.total.toLocaleString("pt-BR"),
        progress: 100,
      });

      setProgress(100);
      setStatus(
        `Upload do Aging concluído. Inseridos: ${result.inserted.toLocaleString("pt-BR")} | Duplicados ignorados: ${result.duplicates.toLocaleString("pt-BR")} | Total processado: ${result.total.toLocaleString("pt-BR")}.`
      );
    } catch (error) {
      console.error(error);
      setStatus(`Erro no upload de Aging: ${error.message || "falha ao enviar arquivo"}`);

      updateHistoryCard("Aging", {
        status: "Erro",
      });
    } finally {
      setLoadingAgingUpload(false);
    }
  }

  async function handleUploadFaturamento() {
    try {
      if (!faturamentoFile) {
        setStatus("Selecione um arquivo de Faturamento.");
        return;
      }

      setLoadingFaturamentoUpload(true);
      setProgress(0);
      setStatus("Iniciando upload do Faturamento...");

      updateHistoryCard("Faturamento", {
        name: faturamentoFile.name,
        status: "Enviando",
        progress: 5,
      });

      const result = await uploadFaturamentoFile(faturamentoFile, ({ inserted, duplicates, total }) => {
        const pct = total ? Math.round((inserted + duplicates) / total * 100) : 0;
        setProgress(pct);

        updateHistoryCard("Faturamento", {
          name: faturamentoFile.name,
          status: "Enviando",
          rows: total.toLocaleString("pt-BR"),
          progress: pct,
        });

        setStatus(
          `Faturamento: ${inserted.toLocaleString("pt-BR")} inseridos, ${duplicates.toLocaleString("pt-BR")} duplicados, de ${total.toLocaleString("pt-BR")} registros.`
        );
      });

      updateHistoryCard("Faturamento", {
        name: faturamentoFile.name,
        status: "Concluído",
        rows: result.total.toLocaleString("pt-BR"),
        progress: 100,
      });

      setProgress(100);
      setStatus(
        `Upload do Faturamento concluído. Inseridos: ${result.inserted.toLocaleString("pt-BR")} | Duplicados ignorados: ${result.duplicates.toLocaleString("pt-BR")} | Total processado: ${result.total.toLocaleString("pt-BR")}.`
      );
    } catch (error) {
      console.error(error);
      setStatus(`Erro no upload de Faturamento: ${error.message || "falha ao enviar arquivo"}`);

      updateHistoryCard("Faturamento", {
        status: "Erro",
      });
    } finally {
      setLoadingFaturamentoUpload(false);
    }
  }

  return (
    <SectionCard>
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#6B1F87]">Central de Upload</h2>
          <Badge color="orange">Operacional</Badge>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-2">
          <UploadBox
            title="Base de Aging"
            description="Entrada de itens, OS, custos e disponibilidade."
            icon={Upload}
            file={agingFile}
            onChangeFile={(file) => {
              setAgingFile(file);
              setAgingPreview(null);
            }}
            onPreview={handlePreviewAging}
            onUpload={handleUploadAging}
            preview={agingPreview}
            loadingPreview={loadingAgingPreview}
            loadingUpload={loadingAgingUpload}
          />

          <UploadBox
            title="Base de Faturamento"
            description="Vendas, cliente, fornecedor, lote e rentabilidade."
            icon={FileSpreadsheet}
            file={faturamentoFile}
            onChangeFile={(file) => {
              setFaturamentoFile(file);
              setFaturamentoPreview(null);
            }}
            onPreview={handlePreviewFaturamento}
            onUpload={handleUploadFaturamento}
            preview={faturamentoPreview}
            loadingPreview={loadingFaturamentoPreview}
            loadingUpload={loadingFaturamentoUpload}
          />
        </div>

        <div className="mt-4 rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
          <div className="text-sm font-semibold text-[#6B1F87]">Status do upload</div>
          <div className="mt-1 text-sm text-slate-600">
            {status || "Selecione um arquivo, valide a estrutura e depois envie a base."}
          </div>
          <div className="mt-3">
            <ProgressBar value={progress} />
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {historyCards.map((item) => (
            <div key={item.type} className="rounded-[24px] bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
              <div className="flex items-center justify-between">
                <span className="inline-flex rounded-full border border-[#D8B4FE] px-3 py-1 text-xs font-semibold text-[#6B1F87]">
                  {item.type}
                </span>
                <span className="text-xs text-slate-500">{item.rows} linhas</span>
              </div>

              <div className="mt-3 font-semibold">{item.name}</div>
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