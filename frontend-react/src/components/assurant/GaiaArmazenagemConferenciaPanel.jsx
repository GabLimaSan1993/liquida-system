import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, RefreshCw, Upload } from "lucide-react";

const rotulos = {
  PRONTO: "Apto para armazenagem",
  MULTIPLOS_VOUCHERS: "IMEI com mais de um voucher",
  SEM_GRADE_FINAL: "GAIA / triagem sem grade final",
  JA_NO_WMS: "Já possui alocação WMS",
  ETAPA_PENDENTE: "Etapa operacional pendente",
  CONFERIR_LEGADO: "Conferir fluxo legado do GAIA",
  RESERVADO_B2C: "Reservado para pedido B2C",
  NAO_ENCONTRADO: "Não localizado",
};
const colors = {
  PRONTO: "bg-emerald-50 text-emerald-800",
  MULTIPLOS_VOUCHERS: "bg-amber-50 text-amber-800",
  SEM_GRADE_FINAL: "bg-rose-50 text-rose-700",
  JA_NO_WMS: "bg-sky-50 text-sky-700",
  RESERVADO_B2C: "bg-orange-50 text-orange-800",
};
function normalizar(v) {
  const s = String(v ?? "").trim().replace(/\u200B|\uFEFF/g, "").toUpperCase();
  if (/^\d{15}$/.test(s) || /^YBV\d+$/.test(s)) return s;
  return null;
}
function textoCabecalho(v) {
  return String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
async function lerChaves(file) {
  if (!file || !/\.(xlsx|xls|ods|csv)$/i.test(file.name))
    throw new Error("Selecione XLSX, XLS, ODS ou CSV.");
  if (file.size > 15 * 1024 * 1024) throw new Error("A planilha excede 15 MB.");
  let livro;
  try {
    livro = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch (e) {
    throw new Error("Não foi possível ler o arquivo: " + String(e?.message || e));
  }
  const chaves = [], invalidos = [];
  let totalLinhas = 0;
  for (const nome of livro.SheetNames || []) {
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets[nome], {
      header: 1, raw: false, defval: "", blankrows: false,
    });
    if (!linhas.length) continue;
    let cabecalho = -1, colunas = [];
    for (let i = 0; i < Math.min(15, linhas.length); i++) {
      const cols = (linhas[i] || []).map((v, j) =>
        ["imei", "imei1", "imei2", "voucher", "numerovoucher"].includes(textoCabecalho(v)) ? j : -1
      ).filter(j => j >= 0);
      if (cols.length) { cabecalho = i; colunas = cols; break; }
    }
    if (!colunas.length) {
      if (linhas.some(l => (l || []).filter(v => String(v).trim()).length > 1))
        continue;
      colunas = [0];
    }
    for (let i = cabecalho + 1; i < linhas.length; i++) {
      for (const col of colunas) {
        const original = linhas[i]?.[col];
        if (!String(original ?? "").trim()) continue;
        totalLinhas++;
        const chave = normalizar(original);
        if (chave) chaves.push(chave);
        else if (invalidos.length < 12) invalidos.push(nome + ", linha " + (i + 1) + ": " + String(original).slice(0,55));
      }
    }
  }
  const unicos = [...new Set(chaves)];
  if (!unicos.length) throw new Error("Nenhum IMEI de 15 dígitos ou voucher YBV encontrado.");
  if (unicos.length > 600) throw new Error("Máximo de 600 identificadores por consulta. Divida a planilha.");
  return { unicos, repetidos: chaves.length - unicos.length, invalidos, totalLinhas };
}
function baixarCSV(dados) {
  const cab = ["Identificador", "Tipo", "Situação", "Vouchers vinculados", "Status por voucher", "Grades", "GAIA", "WMS ativo"];
  const linhas = (dados?.itens || []).map(i => [
    i.identificador, i.tipo, rotulos[i.classificacao] || i.classificacao,
    (i.candidatos || []).map(c => c.voucher).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.status || "sem status")).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.grade || "sem grade")).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.gaia_status || "—") + "/" + (c.gaia_grade || "—")).join(" | "),
    (i.candidatos || []).map(c => c.wms_ativo ? c.voucher : "").filter(Boolean).join(" | "),
  ]);
  const esc = x => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  const csv = [cab, ...linhas].map(l => l.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url; link.download = "Conciliacao_Armazenagem_GAIA.csv";
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

export default function GaiaArmazenagemConferenciaPanel({ onSelecionarVoucher }) {
  const [aberto,setAberto] = useState(false);
  const [carregando,setCarregando] = useState(false);
  const [dados,setDados] = useState(null);
  const [erro,setErro] = useState("");
  const [info,setInfo] = useState("");
  const ref = useRef(null);

  async function consultar(chaves, infoLocal) {
    setCarregando(true); setErro("");
    try {
      const {data,error} = await supabase.rpc("assurant_armazenagem_diagnostico_planilha", { p_chaves: chaves });
      if (error) throw error;
      setDados(data);
      setInfo(infoLocal || "Relação de 06/11/2026, importada para conciliação.");
      setAberto(true);
    } catch (e) { setErro(e?.message || "Falha na conciliação."); }
    finally { setCarregando(false); }
  }

  async function selecionarArquivo(event) {
    const file=event.target.files?.[0];
    event.target.value="";
    if (!file) return;
    setCarregando(true); setErro("");
    try {
      const r=await lerChaves(file);
      const {data,error}=await supabase.rpc("assurant_armazenagem_diagnostico_planilha", {
        p_chaves:r.unicos
      });
      if (error) throw error;
      setDados(data);
      setInfo(file.name + " · " + r.totalLinhas + " valores, " + r.unicos.length +
        " únicos; " + r.repetidos + " repetidos." +
        (r.invalidos.length ? " Linhas inválidas: " + r.invalidos.join("; ") : ""));
      setAberto(true);
    } catch(e) { setErro(e?.message || "Falha no arquivo."); }
    finally { setCarregando(false); }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-violet-700" />
            Conciliação de Armazenagem · GAIA legado
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Identifica IMEIs e vouchers de planilhas antigas, localiza o cadastro correto
            e separa os prontos dos bloqueados. Não confirma armazenagem sem bipagem.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={carregando} onClick={() => void consultar(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-50">
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Ver lista enviada (196)
          </button>
          <input ref={ref} type="file" className="hidden" accept=".xlsx,.xls,.ods,.csv" onChange={selecionarArquivo}/>
          <button type="button" disabled={carregando} onClick={() => ref.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
            <Upload className="h-4 w-4"/> Conferir outra planilha
          </button>
        </div>
      </div>
      {erro && <div className="mx-4 mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{erro}</div>}
      {aberto && dados && (
        <div className="border-t border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">{info}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => baixarCSV(dados)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
                <Download className="h-4 w-4"/> Exportar CSV
              </button>
              <button type="button" onClick={() => setAberto(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Ocultar</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 xl:grid-cols-7">
            {[
              ["Identificadores",dados.total],
              ["Aptos",dados.prontos],
              ["Vários vouchers",dados.ambiguos],
              ["Sem grade final",dados.sem_grade],
              ["No WMS",dados.ja_no_wms],
              ["Reserva B2C",dados.reservados_b2c],
              ["Outras pendências",(dados.etapa_pendente||0)+(dados.conferir_legado||0)+(dados.nao_encontrados||0)]
            ].map(([label,n]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xl font-black text-slate-950">{Number(n||0).toLocaleString("pt-BR")}</div>
                <div className="mt-1 text-[10px] font-semibold text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
            Quando o mesmo IMEI possui vários vouchers, confira a etiqueta física antes de selecionar.
            Aparelhos sem grade final no GAIA precisam concluir a classificação ou ter o relatório final conciliado.
          </div>
          <div className="mt-3 max-h-[450px] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[920px] w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>{["Identificador","Classificação","Vouchers / situação / grade","Ação segura"].map(h=>(
                  <th key={h} className="px-3 py-3 font-black">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dados.itens||[]).map(item=>(
                  <tr key={item.identificador} className="align-top">
                    <td className="px-3 py-3 font-mono font-bold text-slate-800">{item.identificador}
                      <div className="text-[10px] font-medium text-slate-400">{item.tipo}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-bold ${colors[item.classificacao]||"bg-slate-100 text-slate-700"}`}>
                        {rotulos[item.classificacao]||item.classificacao}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {(item.candidatos||[]).map(c=>(
                        <div key={c.voucher} className="mb-1">
                          <strong>{c.voucher}</strong> · {c.status || "—"} · {c.grade || c.gaia_grade || "sem grade"}
                          {c.wms_ativo ? " · WMS ativo" : ""}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(item.candidatos||[]).filter(c=>c.status==="Aguardando armazenagem"&&c.grade&&!c.wms_ativo).map(c=>(
                          <button key={c.voucher} type="button"
                            onClick={() => onSelecionarVoucher?.(c.voucher)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">
                            Abrir {c.voucher}
                          </button>
                        ))}
                        {!(item.candidatos||[]).some(c=>c.status==="Aguardando armazenagem"&&c.grade&&!c.wms_ativo)&&
                          <span className="text-[10px] text-slate-400">Necessita conciliação</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
