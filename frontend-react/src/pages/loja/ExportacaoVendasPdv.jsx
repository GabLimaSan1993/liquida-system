import { useState } from "react";
import JSZip from "jszip";
import { Download, FileArchive, LoaderCircle, AlertCircle, CheckCircle2 } from "lucide-react";
import { supabase } from "../../lib/supabase.js";

const COLUMNS = [
  ["Status da Nota","status_da_nota"], ["Data de Emissão","data_de_emissao"],
  ["Número Nota","numero_nota"], ["Cliente","cliente"], ["Telefone","telefone"],
  ["Sku","sku"], ["Grade","grade"], ["Descrição","descricao"], ["Serial","serial"],
  ["Valor Produto","valor_produto"], ["Valor Vendido","valor_vendido"],
  ["GE","ge"], ["Valor GE","valor_ge"], ["Valor Final","valor_final"],
  ["Devolvido","devolvido"], ["Fornecedor","fornecedor"], ["Lote","lote"],
  ["Custo","custo"], ["Cidade Cliente","cidade_cliente"],
  ["Cidade Empresa","cidade_empresa"], ["Cnpj Empresa","cnpj_empresa"],
  ["Marca","marca"], ["Natureza de Operação","natureza_de_operacao"],
  ["Pagamento","pagamento"], ["Qtd","qtd"], ["Categoria","categoria"],
  ["Sub Categoria","sub_categoria"], ["Vendedor","vendedor"],
  ["Caixa","caixa"], ["SPLIT","split"]
];
const ESSENTIAL_KEYS = new Set([
  "status_da_nota","data_de_emissao","numero_nota","cliente",
  "sku","grade","descricao","serial","valor_produto","valor_vendido",
  "valor_ge","valor_final","devolvido","fornecedor","lote","custo",
  "cnpj_empresa","pagamento","qtd","vendedor"
]);
const YEARS = ["2024","2025","2026"];
const PAGE_SIZE = 1000;
const format = (v) => Number(v || 0).toLocaleString("pt-BR");
const megabytes = (size) => (size / 1024 / 1024).toFixed(2).replace(".",",") + " MB";

function csvCell(value) {
  if (value == null) return "";
  let text = String(value).replace(/\u0000/g, "");
  // Impede fórmulas provenientes de campos de texto ao abrir o CSV no Excel.
  if (/^[\s]*[=+@\t\r]/.test(text) || (/^[\s]*-/.test(text) && !/^\s*-\d+(?:[.,]\d+)?\s*$/.test(text))) {
    text = "'" + text;
  }
  return /[;"\n\r]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}

function businessKey(record) {
  const p = ["numero_nota","serial","sku","valor_final"].map((key) => String(record[key] ?? "").trim());
  if (p.every(Boolean)) return JSON.stringify(p);
  // Não tratar campos incompletos como a mesma venda sem equivalência integral.
  return JSON.stringify(COLUMNS.map(([,key]) => record[key] ?? ""));
}

export default function ExportacaoVendasPdv() {
  const [periodo, setPeriodo] = useState("todos");
  const [mes, setMes] = useState("todos");
  const [layout, setLayout] = useState("completo");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null);
  const [message, setMessage] = useState(null);

  async function exportar() {
    if (busy) return;
    setBusy(true);
    setMessage(null);
    const anos = periodo === "todos" ? YEARS : [periodo];
    const inicioMes = mes === "todos" ? null : periodo + "-" + String(mes).padStart(2, "0") + "-01";
    const mesSeguinte = mes === "todos" ? null : new Date(Date.UTC(Number(periodo), Number(mes), 1)).toISOString().slice(0, 10);
    const cols = layout === "completo" ? COLUMNS : COLUMNS.filter(([,key]) => ESSENTIAL_KEYS.has(key));
    const fetchKeys = Array.from(new Set(["id","numero_nota","serial","sku","valor_final",...cols.map(([,key]) => key)]));
    const zip = new JSZip();
    const seen = new Set();
    let rowsSaved = 0;
    let duplicatesSkipped = 0;
    try {
      for (const ano of anos) {
        let lastId = 0;
        let lines = [cols.map(([label]) => csvCell(label)).join(";")];
        let rowsInYear = 0;
        setProgress({ ano, linhas: rowsSaved, etapa: "Buscando dados" });
        while (true) {
          const { data, error } = await supabase
            .from("loja_pdv_vendas")
            .select(fetchKeys.join(","))
            .gte("emissao_em", inicioMes || ano + "-01-01")
            .lt("emissao_em", mesSeguinte || (Number(ano) + 1) + "-01-01")
            .gt("id", lastId)
            .order("id", { ascending: true })
            .limit(PAGE_SIZE);
          if (error) throw new Error("Consulta de " + ano + ": " + error.message);
          if (!data?.length) break;
          for (const record of data) {
            const key = businessKey(record);
            if (seen.has(key)) { duplicatesSkipped += 1; continue; }
            seen.add(key);
            lines.push(cols.map(([,field]) => csvCell(record[field])).join(";"));
            rowsInYear++;
            rowsSaved++;
          }
          lastId = data[data.length - 1].id;
          setProgress({ ano, linhas: rowsSaved, etapa: "Carregando dados" });
          if (data.length < PAGE_SIZE) break;
        }
        if (rowsInYear > 0) {
          // BOM UTF-8 para Excel em português; CSV sem formatação desnecessária.
          zip.file("Vendas_PDV_" + ano + (mes === "todos" ? "" : "_" + String(mes).padStart(2, "0")) + ".csv", "\uFEFF" + lines.join("\r\n") + "\r\n");
        }
        lines = null;
      }
      if (!rowsSaved) throw new Error("Nenhuma venda encontrada para o período selecionado.");
      setProgress({ ano: null, linhas: rowsSaved, etapa: "Compactando com compressão máxima" });
      const blob = await zip.generateAsync(
        { type: "blob", compression: "DEFLATE", compressionOptions: { level: 9 } },
        ({ percent }) => setProgress((old) => ({ ...old, etapa: "Compactando " + Math.round(percent) + "%" }))
      );
      const href = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = href;
      a.download = "Loja_PDV_" + (periodo === "todos" ? "2024_2026" : periodo + (mes === "todos" ? "" : "_" + String(mes).padStart(2,"0"))) + "_" + layout + ".zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(href), 60000);
      setMessage({ ok:true, text: format(rowsSaved) + " vendas exportadas · " + megabytes(blob.size) + " · " + duplicatesSkipped + " repetição(ões) ignorada(s)." });
    } catch (error) {
      setMessage({ ok: false, text: String(error?.message || error) });
    } finally {
      setProgress(null);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 md:p-7">
      <div className="mb-2 flex items-center gap-2 text-base font-semibold text-slate-900">
        <FileArchive size={19} className="text-[#765D81]"/> Exportar para Excel
      </div>
      <p className="mb-6 text-sm text-slate-500">
        CSV em ZIP com compressão máxima. Em exportações completas, cada ano é salvo em um arquivo separado para facilitar o trabalho no Excel.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-slate-600">Período</span>
          <select value={periodo} onChange={(e) => { setPeriodo(e.target.value); setMes("todos"); }} disabled={busy} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
            <option value="todos">2024 a 2026 — separado por ano</option>
            <option value="2026">Somente 2026</option>
            <option value="2025">Somente 2025</option>
            <option value="2024">Somente 2024</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold text-slate-600">Colunas</span>
          <select value={layout} onChange={(e) => setLayout(e.target.value)} disabled={busy} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
            <option value="completo">Completa — 30 colunas</option>
            <option value="essencial">Compacta — 20 colunas principais</option>
          </select>
        </label>
      </div>
      {periodo !== "todos" && <label className="mt-4 block max-w-sm">
        <span className="mb-2 block text-xs font-semibold text-slate-600">Filtrar mês (opcional, para um ZIP menor)</span>
        <select value={mes} disabled={busy} onChange={(e) => setMes(e.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm">
          <option value="todos">Ano completo</option>
          {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m,i) => <option key={m} value={i+1}>{m}</option>)}
        </select>
      </label>}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
        <span className="max-w-2xl text-xs leading-5 text-slate-500">
          O ZIP precisa ser extraído antes de abrir o CSV. Para preservar seriais, SKU e CNPJ com zeros à esquerda, importe pelo menu Dados → De Texto/CSV do Excel, definindo essas colunas como Texto.
        </span>
        <button type="button" onClick={exportar} disabled={busy} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-[#43284F] px-5 py-3 text-sm font-semibold text-white hover:bg-[#2F1B39] disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? <LoaderCircle size={17} className="animate-spin"/> : <Download size={17} />}
          {busy ? "Preparando ZIP..." : "Exportar ZIP compacto"}
        </button>
      </div>
      {progress && <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
        {progress.etapa}{progress.ano ? " — " + progress.ano : ""} · {format(progress.linhas)} linhas
      </div>}
      {message && <div role="status" className={"mt-4 flex items-center gap-2 rounded-lg px-4 py-3 text-sm " + (message.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
        {message.ok ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}{message.text}
      </div>}
    </section>
  );
}
