import { useCallback, useEffect, useRef, useState } from "react";
import JSZip from "jszip";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { AlertCircle, CheckCircle2, Database, FileSpreadsheet, FileUp, LoaderCircle, RotateCcw, UploadCloud } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const FIELDS = [
  ["Status da Nota", "status_da_nota"],
  ["Data de Emissão", "data_de_emissao"],
  ["Número Nota", "numero_nota"],
  ["Cliente", "cliente"],
  ["Telefone", "telefone"],
  ["Sku", "sku"],
  ["Grade", "grade"],
  ["Descrição", "descricao"],
  ["Serial", "serial"],
  ["Valor Produto", "valor_produto"],
  ["Valor Vendido", "valor_vendido"],
  ["GE", "ge"],
  ["Valor GE", "valor_ge"],
  ["Valor Final", "valor_final"],
  ["Devolvido", "devolvido"],
  ["Fornecedor", "fornecedor"],
  ["Lote", "lote"],
  ["Custo", "custo"],
  ["Cidade Cliente", "cidade_cliente"],
  ["Cidade Empresa", "cidade_empresa"],
  ["Cnpj Empresa", "cnpj_empresa"],
  ["Marca", "marca"],
  ["Natureza de Operação", "natureza_de_operacao"],
  ["Pagamento", "pagamento"],
  ["Qtd", "qtd"],
  ["Categoria", "categoria"],
  ["Sub Categoria", "sub_categoria"],
  ["Vendedor", "vendedor"],
  ["Caixa", "caixa"],
  ["SPLIT", "split"],
];
const EXT_OK = /\.(csv|xlsx|zip)$/i;
const SOURCE_OK = /\.(csv|xlsx)$/i;
const BATCH_SIZE = 250;
const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const fmt = (n) => Number(n || 0).toLocaleString("pt-BR");
const txt = (value) => value == null ? "" : String(value).trim();

function validateHeader(header, name) {
  if (header.length !== FIELDS.length || FIELDS.some((col, i) => normalize(header[i]) !== normalize(col[0]))) {
    throw new Error("Layout divergente em " + name + ". A planilha precisa conter as 30 colunas do PDV, na ordem do arquivo original.");
  }
}

function parseCsv(content, name) {
  const firstLine = content.split(/\r?\n/, 1)[0].replace(/^\uFEFF/, "");
  const sep = firstLine.includes(";") ? ";" : firstLine.includes("\t") ? "\t" : ",";
  const parsed = Papa.parse(content, { delimiter: sep, header: false, skipEmptyLines: "greedy" });
  if (!parsed.data.length) throw new Error(name + ": arquivo vazio.");
  const header = parsed.data[0].map(txt);
  validateHeader(header, name);
  const output = [];
  let pending = null;

  for (let i = 1; i < parsed.data.length; i++) {
    let cells = parsed.data[i].map(txt);
    const rowNumber = pending?.line ?? i + 1;
    if (pending) {
      // PDV antigo traz algumas quebras de linha sem aspas dentro do SKU/Descrição.
      // Reune o campo partido sem deslocar nenhuma coluna.
      cells = [...pending.cells.slice(0, -1), txt(pending.cells[pending.cells.length - 1] + " " + cells[0]), ...cells.slice(1)];
      pending = null;
    }
    if (cells.length === 31 && cells[30] === "") cells = cells.slice(0, 30);
    if (cells.length === 30) {
      output.push({ cells, line: rowNumber });
    } else if (cells.length < 30) {
      pending = { cells, line: rowNumber };
    } else {
      throw new Error(name + ": registro com " + cells.length + " colunas, próximo à linha " + rowNumber + ".");
    }
  }
  if (pending) throw new Error(name + ": linha incompleta ao final do arquivo (" + pending.line + ").");
  return output;
}

function parseXlsx(buffer, name) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: false });
  const result = [];
  for (const sheetName of workbook.SheetNames) {
    const data = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, raw: false, defval: "", blankrows: false });
    if (!data.length) continue;
    let header = data[0].map(txt);
    while (header.length > 30 && header[header.length - 1] === "") header.pop();
    validateHeader(header, name + " / " + sheetName);
    for (let i = 1; i < data.length; i++) {
      const row = data[i].map(txt);
      if (row.every((v) => v === "")) continue;
      while (row.length > 30 && row[row.length - 1] === "") row.pop();
      if (row.length > 30) throw new Error(name + " / " + sheetName + ": colunas adicionais na linha " + (i + 1));
      while (row.length < 30) row.push("");
      result.push({ cells: row, line: i + 1 });
    }
  }
  if (!result.length) throw new Error(name + ": nenhuma linha de vendas encontrada.");
  return result;
}

function parseDatePt(value) {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(value);
  if (!match) return null;
  const [, d, m, y, hh = "00", mm = "00", ss = "00"] = match;
  const date = new Date(Number(y), Number(m) - 1, Number(d), Number(hh), Number(mm), Number(ss));
  if (date.getFullYear() !== Number(y) || date.getMonth() !== Number(m) - 1 || date.getDate() !== Number(d)) return null;
  return y + "-" + m + "-" + d + " " + hh + ":" + mm + ":" + ss;
}

async function expandFiles(selected) {
  const items = [];
  for (const file of selected) {
    if (!EXT_OK.test(file.name)) throw new Error("Formato não aceito: " + file.name);
    if (/\.zip$/i.test(file.name)) {
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const entries = Object.values(zip.files).filter((entry) => !entry.dir && SOURCE_OK.test(entry.name) && !entry.name.startsWith("__MACOSX/"));
      if (!entries.length) throw new Error(file.name + ": o ZIP não contém CSV ou XLSX.");
      for (const entry of entries) {
        items.push({ name: entry.name, file: await entry.async("blob") });
      }
    } else {
      items.push({ name: file.name, file });
    }
  }
  return items;
}

async function readSource(item) {
  if (/\.xlsx$/i.test(item.name)) return parseXlsx(await item.file.arrayBuffer(), item.name);
  const bytes = await item.file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
  return parseCsv(text, item.name);
}

export default function VendasPdvUploadPage() {
  const inputRef = useRef(null);
  const [selected, setSelected] = useState([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ file: "", done: 0, total: 0, processedFiles: 0, totalFiles: 0 });
  const [feedback, setFeedback] = useState(null);
  const [history, setHistory] = useState([]);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.from("loja_pdv_vendas_importacoes")
      .select("id,arquivo_nome,quantidade_linhas,linhas_importadas,status,erro,iniciado_em")
      .order("iniciado_em", { ascending: false }).limit(25);
    if (!error) setHistory(data || []);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function addFiles(files) {
    const valid = Array.from(files || []);
    setFeedback(null);
    const bad = valid.find((file) => !EXT_OK.test(file.name));
    if (bad) { setFeedback({ ok: false, message: "Formato inválido: " + bad.name }); return; }
    setSelected((current) => [...current, ...valid]);
  }

  async function startImport() {
    if (!selected.length || importing) return;
    setImporting(true);
    setFeedback(null);
    let uploaded = 0;
    let total = 0;
    try {
      const files = await expandFiles(selected);
      if (!files.length) throw new Error("Nenhuma planilha válida encontrada.");
      setProgress({ file: "", done: 0, total: 0, processedFiles: 0, totalFiles: files.length });
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const item = files[fileIndex];
        const rows = await readSource(item);
        total += rows.length;
        const { data: job, error: jobError } = await supabase.from("loja_pdv_vendas_importacoes")
          .insert({ arquivo_nome: item.name, quantidade_linhas: rows.length, linhas_importadas: 0, status: "processando" })
          .select("id").single();
        if (jobError) throw new Error(item.name + ": " + jobError.message);
        let fileDone = 0;
        try {
          for (let start = 0; start < rows.length; start += BATCH_SIZE) {
            const chunk = rows.slice(start, start + BATCH_SIZE).map(({ cells, line }) => {
              const record = { importacao_id: job.id, arquivo_origem: item.name, linha_origem: line, emissao_em: parseDatePt(cells[1]) };
              FIELDS.forEach(([, key], index) => { record[key] = cells[index]; });
              return record;
            });
            const { error } = await supabase.from("loja_pdv_vendas")
              .upsert(chunk, { onConflict: "arquivo_origem,linha_origem" });
            if (error) throw new Error(error.message);
            fileDone += chunk.length;
            uploaded += chunk.length;
            setProgress({ file: item.name, done: fileDone, total: rows.length, processedFiles: fileIndex, totalFiles: files.length });
            if (fileDone % 1000 === 0 || fileDone === rows.length) {
              await supabase.from("loja_pdv_vendas_importacoes").update({ linhas_importadas: fileDone }).eq("id", job.id);
            }
          }
          const { error: doneError } = await supabase.from("loja_pdv_vendas_importacoes")
            .update({ linhas_importadas: fileDone, status: "concluido", finalizado_em: new Date().toISOString() })
            .eq("id", job.id);
          if (doneError) throw doneError;
          setProgress({ file: item.name, done: fileDone, total: rows.length, processedFiles: fileIndex + 1, totalFiles: files.length });
        } catch (err) {
          await supabase.from("loja_pdv_vendas_importacoes")
            .update({ linhas_importadas: fileDone, status: "erro", erro: String(err.message || err), finalizado_em: new Date().toISOString() })
            .eq("id", job.id);
          throw new Error(item.name + ": " + String(err.message || err));
        }
      }
      setFeedback({ ok: true, message: fmt(uploaded) + " linhas processadas em " + files.length + " arquivo(s). Reenvios substituem linhas de mesma origem, sem duplicação." });
      setSelected([]);
    } catch (error) {
      setFeedback({ ok: false, message: String(error?.message || error) });
    } finally {
      setImporting(false);
      await refresh();
    }
  }

  const percent = progress.total ? Math.min(100, Math.round((progress.done / progress.total) * 100)) : 0;
  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <div>
        <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-[#765D81]">Loja / Vendas</div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 md:text-3xl">Importação de vendas PDV</h1>
        <p className="mt-2 text-sm text-slate-500">Envie a base de vendas com as 30 colunas do relatório original.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">Colunas do layout</p><p className="mt-1 text-2xl font-semibold">30</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">Importações concluídas</p><p className="mt-1 text-2xl font-semibold">{fmt(history.filter(x => x.status === "concluido").length)}</p></div>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><p className="text-xs text-slate-500">Linhas registradas no histórico recente</p><p className="mt-1 text-2xl font-semibold">{fmt(history.reduce((n, x) => n + (x.linhas_importadas || 0), 0))}</p></div>
      </div>
      <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-7">
        <div className="mb-5 flex items-center gap-2 text-base font-semibold"><FileUp size={19} className="text-[#765D81]" /> Enviar arquivos</div>
        <input ref={inputRef} type="file" multiple accept=".csv,.xlsx,.zip" className="hidden" disabled={importing}
          onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }} />
        <button type="button" disabled={importing} onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); if (!importing) addFiles(e.dataTransfer.files); }}
          className={"flex w-full flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-12 text-center transition " + (dragOver ? "border-[#765D81] bg-[#F6F2F8]" : "border-slate-300 bg-slate-50 hover:border-[#765D81]")}>
          <UploadCloud className="mb-4 text-[#765D81]" size={32} />
          <strong className="text-sm text-slate-800">Selecionar arquivos ou arrastar para cá</strong>
          <span className="mt-2 text-xs text-slate-500">CSV, XLSX ou ZIP contendo vários arquivos. Importação em lotes.</span>
        </button>
        {selected.length > 0 && (
          <div className="mt-5">
            <div className="mb-3 flex items-center justify-between"><span className="text-sm font-semibold">Arquivos selecionados ({selected.length})</span>
              <button disabled={importing} type="button" onClick={() => setSelected([])} className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-50">Limpar</button>
            </div>
            <div className="max-h-44 space-y-2 overflow-y-auto">
              {selected.map((file, index) => <div key={index} className="flex items-center gap-3 rounded-lg border border-slate-100 px-3 py-2 text-sm"><FileSpreadsheet size={17} className="text-slate-500" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="text-xs text-slate-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span></div>)}
            </div>
          </div>
        )}
        {importing && (
          <div className="mt-5 space-y-2">
            <div className="flex justify-between gap-3 text-xs"><span className="truncate font-semibold text-slate-700">{progress.file || "Preparando arquivos..."}</span><span className="shrink-0 text-slate-500">{fmt(progress.done)} / {fmt(progress.total)}</span></div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#765D81] transition-all" style={{ width: percent + "%" }}/></div>
            <p className="text-xs text-slate-500">Arquivo {Math.min(progress.processedFiles + 1, progress.totalFiles)} de {progress.totalFiles}. Mantenha esta tela aberta até concluir.</p>
          </div>
        )}
        {feedback && <div role="alert" className={"mt-5 flex gap-2 rounded-lg px-4 py-3 text-sm " + (feedback.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800")}>{feedback.ok ? <CheckCircle2 size={18} className="shrink-0"/> : <AlertCircle size={18} className="shrink-0"/>}<span>{feedback.message}</span></div>}
        <div className="mt-6 flex justify-end">
          <button type="button" onClick={startImport} disabled={!selected.length || importing} className="flex items-center gap-2 rounded-lg bg-[#43284F] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2F1B39] disabled:cursor-not-allowed disabled:opacity-40">
            {importing ? <LoaderCircle size={17} className="animate-spin"/> : <Database size={17}/>}
            {importing ? "Importando..." : "Importar base"}
          </button>
        </div>
      </section>
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4"><h2 className="text-sm font-semibold">Histórico de uploads</h2><button type="button" onClick={refresh} title="Atualizar" className="rounded-md p-1 text-slate-400 hover:text-slate-700"><RotateCcw size={16}/></button></div>
        <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500"><tr><th className="px-5 py-3 font-semibold">Arquivo</th><th className="px-5 py-3 font-semibold">Data</th><th className="px-5 py-3 text-right font-semibold">Linhas</th><th className="px-5 py-3 text-right font-semibold">Importadas</th><th className="px-5 py-3 font-semibold">Status</th></tr></thead>
          <tbody className="divide-y divide-slate-100">{history.map((job) => <tr key={job.id}><td className="max-w-[290px] truncate px-5 py-3 font-medium" title={job.arquivo_nome}>{job.arquivo_nome}</td><td className="whitespace-nowrap px-5 py-3 text-slate-500">{new Date(job.iniciado_em).toLocaleString("pt-BR")}</td><td className="px-5 py-3 text-right tabular-nums">{fmt(job.quantidade_linhas)}</td><td className="px-5 py-3 text-right tabular-nums">{fmt(job.linhas_importadas)}</td><td className="px-5 py-3"><span title={job.erro || ""} className={"whitespace-nowrap text-xs font-semibold " + (job.status === "concluido" ? "text-emerald-700" : job.status === "erro" ? "text-red-700" : "text-amber-700")}>{job.status === "concluido" ? "Concluído" : job.status === "erro" ? "Erro" : "Processando"}</span></td></tr>)}</tbody>
        </table>{history.length === 0 && <div className="px-5 py-8 text-center text-sm text-slate-400">Nenhuma importação registrada.</div>}</div>
      </section>
      <p className="flex items-start gap-2 text-xs text-slate-500"><AlertCircle size={15} className="shrink-0"/><span>Os campos são preservados como no relatório do PDV. Um mesmo arquivo pode ser reenviado sem duplicar suas linhas.</span></p>
    </div>
  );
}
