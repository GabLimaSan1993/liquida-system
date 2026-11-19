
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.103.0";
import JSZip from "npm:jszip@3.10.1";

const URL = Deno.env.get("SUPABASE_URL") || "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const BUCKET = "financeiro-extratos";
const encoder = new TextEncoder();
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const respond = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });
const field = (src: string, name: string): string => {
  const match = new RegExp("<" + name + ">\\s*([^<\\r\\n]*)", "i").exec(src);
  return match?.[1]?.trim() || "";
};
const normalize = (value: string) => value.trim().replace(/\s+/g, " ").toUpperCase();
const digits = (value: string) => value.replace(/\D/g, "");
const hex = async (value: string) => {
  const hash = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(hash), v => v.toString(16).padStart(2, "0")).join("");
};

function ofxEntries(zip: JSZip) {
  return Object.values(zip.files).filter(f => !f.dir && f.name.toLowerCase().endsWith(".ofx")).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

async function openArchive(data: Uint8Array, type: string) {
  if (type === "ofx" || type === "csv") {
    const file = new JSZip();
    file.file(type === "csv" ? "extrato.csv" : "extrato.ofx", data);
    return file;
  }
  if (type !== "zip") throw new Error("Processamento disponível para OFX, CSV Santander ou ZIP contendo OFX.");
  const zip = await JSZip.loadAsync(data, { checkCRC32: false });
  const entries = ofxEntries(zip);
  if (entries.length < 1) throw new Error("Nenhum OFX encontrado no ZIP.");
  if (entries.length > 250) throw new Error("ZIP excede o limite de 250 arquivos OFX.");
  const total = entries.reduce((acc, entry) => acc + (entry._data?.uncompressedSize || 0), 0);
  if (total > 120 * 1024 * 1024) throw new Error("ZIP excede 120 MB de dados descompactados.");
  return zip;
}

function parseOfx(text: string, arquivo: string, banco: string, conta: string) {
  const bancoNoArquivo = field(text, "BANKID");
  const contaNoArquivo = field(text, "ACCTID");
  if (!contaNoArquivo) throw new Error("OFX sem identificador de conta: " + arquivo);
  if (digits(contaNoArquivo) !== digits(conta)) {
    throw new Error("Conta do OFX (" + contaNoArquivo + ") difere da conta cadastrada (" + conta + ") em " + arquivo);
  }
  const conhecidos: Record<string, string> = { "Itaú": "341", "Safra": "422", "Santander": "33", "Banco do Brasil": "1", "Bradesco": "237" };
  if (conhecidos[banco] && bancoNoArquivo && Number(digits(bancoNoArquivo)) !== Number(conhecidos[banco])) {
    throw new Error("Banco do OFX (" + bancoNoArquivo + ") difere do selecionado (" + banco + ") em " + arquivo);
  }
  const matches = [...text.matchAll(/<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi)];
  if (!matches.length) throw new Error("Nenhuma transação STMTTRN encontrada em " + arquivo);
  const parsed = matches.map((m, index) => {
    const bloco = m[1];
    const dataOfx = field(bloco, "DTPOSTED").slice(0, 8);
    if (!/^\d{8}$/.test(dataOfx)) throw new Error("Data OFX inválida em " + arquivo + ", linha " + (index + 1));
    const data = dataOfx.slice(0, 4) + "-" + dataOfx.slice(4, 6) + "-" + dataOfx.slice(6, 8);
    const valorTexto = field(bloco, "TRNAMT").replace(",", ".");
    const numero = Number(valorTexto);
    if (!valorTexto || !Number.isFinite(numero)) throw new Error("Valor OFX inválido em " + arquivo + ", linha " + (index + 1));
    const valor = Number(numero.toFixed(2));
    const historico = (field(bloco, "MEMO") || field(bloco, "NAME") || "(sem histórico)").slice(0, 1000);
    const fitid = field(bloco, "FITID").slice(0, 200);
    const tipoOfx = field(bloco, "TRNTYPE");
    let natureza = "movimento";
    if (/^SALDO(?:\s|$)/i.test(historico)) natureza = "saldo_informativo";
    else if (/^(?:APL\s+APLIC|APLICAC[AÃ]O|APLIC\s)/i.test(historico)) natureza = "aplicacao";
    else if (/^(?:RES\s+APLIC|RESGATE\s)/i.test(historico)) natureza = "resgate";
    else if (/^(?:REND\s+PAGO|RENDIMENTO\s)/i.test(historico)) natureza = "rendimento";
    return { data, valor, historico, fitid, tipoOfx, natureza };
  });
  return { bancoCodigo: bancoNoArquivo, contaOfx: contaNoArquivo, parsed };
}

async function prepareRows(parsed: ReturnType<typeof parseOfx>, banco: string, conta: string, uploadId: string, arquivo: string) {
  const result = [];
  for (const row of parsed.parsed) {
    const normalized = banco === "Santander" && row.fitid
      ? JSON.stringify(["SANTANDER_FITID", digits(conta), row.data, row.valor.toFixed(2), row.fitid])
      : JSON.stringify([
        digits(parsed.bancoCodigo), digits(parsed.contaOfx), row.data,
        row.valor.toFixed(2), row.fitid, normalize(row.historico), normalize(row.tipoOfx),
      ]);
    result.push({
      banco, conta,
      banco_codigo: parsed.bancoCodigo,
      data: row.data, valor: row.valor,
      historico: row.historico,
      tipo: row.natureza === "saldo_informativo" ? "informativo" : row.valor < 0 ? "saida" : "entrada",
      natureza: row.natureza, fitid: row.fitid || null,
      status_extracao: "ofx_original",
      chave_unica: await hex(normalized),
      upload_id: uploadId, arquivo_interno: arquivo,
    });
  }
  return result;
}


// Layout histórico Santander (gerado da consolidação PDF/OFX).
// A validação ocorre integralmente antes de inserir qualquer lançamento.
type CsvRecord = Record<string, string>;
function parseSemicolonCsv(raw: string): CsvRecord[] {
  const table: string[][] = [];
  let cell = "", row: string[] = [], quoted = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') {
      if (quoted && raw[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || !cell) quoted = !quoted;
      else throw new Error("CSV malformado: aspas fora de um campo");
    } else if (ch === ";" && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\r" || ch === "\n") && !quoted) {
      if (ch === "\r" && raw[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some(c => c.trim() !== "")) table.push(row);
      row = [];
    } else cell += ch;
  }
  if (quoted) throw new Error("CSV malformado: aspas não fechadas");
  if (cell || row.length) { row.push(cell); if (row.some(c => c.trim())) table.push(row); }
  if (table.length < 2) throw new Error("CSV vazio ou sem lançamentos");
  if (table.length > 20001) throw new Error("CSV excede 20.000 lançamentos; divida por ano ou mês");
  const names = table.shift()!.map(c => c.replace(/^\uFEFF/, "").trim());
  const required = ["Data", "Banco", "Conta", "Histórico bancário", "Valor líquido (R$)", "ID controle", "Status do detalhe"];
  const missing = required.filter(col => !names.includes(col));
  if (missing.length) throw new Error(
    "CSV sem colunas do modelo Santander (" + missing.join(", ") + "). Envie o CSV histórico por conta; arquivos de auditoria e resumo não são extratos de lançamentos."
  );
  const rows: CsvRecord[] = [];
  for (const [index, values] of table.entries()) {
    if (values.length !== names.length) throw new Error("CSV linha " + (index + 2) + ": número de colunas inesperado");
    const record: CsvRecord = {};
    names.forEach((col, k) => { record[col] = values[k].trim(); });
    rows.push(record);
  }
  return rows;
}
function parseBRMoney(input: string, line: number) {
  const raw = input.replace(/^R\$\s*/, "").replace(/\s/g, "");
  if (!/^-?\d+(?:\.\d{3})*(?:,\d{1,2})?$/.test(raw))
    throw new Error("CSV linha " + line + ": valor monetário inválido (" + input + ")");
  const result = Number(raw.replace(/\./g, "").replace(",", "."));
  if (!Number.isFinite(result)) throw new Error("CSV linha " + line + ": valor monetário fora do intervalo");
  return Number(result.toFixed(2));
}
function parseBRDate(input: string, line: number) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input);
  if (!m) throw new Error("CSV linha " + line + ": data inválida (" + input + ")");
  const day = Number(m[1]), month = Number(m[2]), year = Number(m[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    throw new Error("CSV linha " + line + ": data inexistente (" + input + ")");
  return m[3] + "-" + m[2] + "-" + m[1];
}
async function prepareCsvRows(data: Uint8Array, banco: string, conta: string, uploadId: string, arquivo: string) {
  if (data.byteLength > 12 * 1024 * 1024) throw new Error("CSV excede o limite de 12 MB para processamento");
  let csv: string;
  try { csv = new TextDecoder("utf-8", { fatal: true }).decode(data); }
  catch { csv = new TextDecoder("windows-1252").decode(data); }
  const source = parseSemicolonCsv(csv);
  const seenIds = new Set<string>();
  const rows = [];
  for (const [index, r] of source.entries()) {
    const line = index + 2;
    if (normalize(r["Banco"]) !== normalize(banco))
      throw new Error("CSV linha " + line + ": banco " + r["Banco"] + " diferente de " + banco);
    const sourceAccount = digits(r["Conta"].split("/").at(-1) || "");
    if (sourceAccount !== digits(conta))
      throw new Error("CSV linha " + line + ": conta " + r["Conta"] + " diferente de " + conta + ". Importe as contas separadamente.");
    const date = parseBRDate(r["Data"], line);
    if (r["Competência"] && r["Competência"] !== date.slice(0, 7))
      throw new Error("CSV linha " + line + ": competência diferente da data");
    const value = parseBRMoney(r["Valor líquido (R$)"], line);
    if (r["Entradas (R$)"] !== undefined && r["Saídas (R$)"] !== undefined) {
      const credit = parseBRMoney(r["Entradas (R$)"], line);
      const debit = parseBRMoney(r["Saídas (R$)"], line);
      if (Math.abs(value - (credit - debit)) > 0.011)
        throw new Error("CSV linha " + line + ": entradas, saídas e valor líquido divergentes");
    }
    const control = r["ID controle"];
    if (!control || control.length > 200 || seenIds.has(control))
      throw new Error("CSV linha " + line + ": ID controle ausente ou repetido");
    seenIds.add(control);
    const history = r["Histórico bancário"].slice(0, 1000);
    if (!history) throw new Error("CSV linha " + line + ": histórico vazio");
    const fitid = (r["FITID"] || "").slice(0, 200);
    const status = /^(conferido por saldo|ofx deduplicado)/i.test(r["Status do detalhe"])
      ? "csv_conferido" : "csv_pendente";
    const category = normalize((r["Categoria preliminar"] || "") + " " + (r["Subcategoria preliminar"] || ""));
    let nature = "movimento";
    if (/^SALDO(?:\s|$)/i.test(history)) nature = "saldo_informativo";
    else if (/RESGATE|RESGATADO/.test(category)) nature = "resgate";
    else if (/APLICAC|APLICADO/.test(category)) nature = "aplicacao";
    else if (/RENDIMENTO/.test(category)) nature = "rendimento";
    const ref = fitid
      ? JSON.stringify(["SANTANDER_FITID", digits(conta), date, value.toFixed(2), fitid])
      : JSON.stringify(["CSV_CONTROLE", digits(conta), control]);
    rows.push({
      banco, conta, banco_codigo: "33",
      data: date, valor: value, historico: history,
      tipo: nature === "saldo_informativo" ? "informativo" : value < 0 ? "saida" : "entrada",
      natureza: nature, fitid: fitid || null,
      chave_unica: await hex(ref), upload_id: uploadId, arquivo_interno: arquivo,
      status_extracao: status,
      metadados_origem: {
        id_controle: control, origem: r["Origem"] || null, arquivo_fonte: r["Arquivo fonte"] || null,
        pagina_pdf: r["Página PDF"] || null, status_detalhe: r["Status do detalhe"],
        categoria_preliminar: r["Categoria preliminar"] || null, subcategoria_preliminar: r["Subcategoria preliminar"] || null,
        natureza_preliminar: r["Natureza"] || null, complemento: r["Complemento histórico"] || null,
        documento_bancario: r["Documento bancário"] || null,
        observacoes: r["Observações"] || null,
      },
    });
  }
  return rows;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return respond({ error: "Método não suportado" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return respond({ error: "Sessão obrigatória" }, 401);
  try {
    const admin = createClient(URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth?.user?.id) return respond({ error: "Sessão inválida" }, 401);
    const { data: access, error: accessError } = await admin
      .from("financeiro_acessos").select("usuario_id").eq("usuario_id", auth.user.id).maybeSingle();
    if (accessError) throw accessError;
    if (!access) return respond({ error: "Acesso financeiro não autorizado" }, 403);
    const body = await req.json();
    const uploadId = typeof body.uploadId === "string" ? body.uploadId : "";
    const mode = body.mode === "inspect" ? "inspect" : body.mode === "process" ? "process" : "";
    if (!/^[0-9a-f-]{36}$/i.test(uploadId) || !mode) return respond({ error: "Requisição inválida" }, 400);
    const { data: upload, error: uploadError } = await admin.from("financeiro_extratos_uploads")
      .select("id,banco,conta,arquivo_tipo,storage_path,status")
      .eq("id", uploadId).single();
    if (uploadError || !upload) return respond({ error: "Upload não encontrado" }, 404);
    if (!["zip", "ofx", "csv"].includes(upload.arquivo_tipo)) {
      return respond({ error: "Este arquivo é " + upload.arquivo_tipo.toUpperCase() + ". O processamento suporta OFX, CSV do modelo Santander ou ZIP com OFX." }, 422);
    }
    const { data: file, error: storageError } = await admin.storage.from(BUCKET).download(upload.storage_path);
    if (storageError || !file) throw new Error("Falha ao recuperar arquivo original: " + (storageError?.message || "não localizado"));
    const zip = await openArchive(new Uint8Array(await file.arrayBuffer()), upload.arquivo_tipo);
    const entries = upload.arquivo_tipo === "csv"
      ? Object.values(zip.files).filter(e => !e.dir && e.name.endsWith(".csv"))
      : ofxEntries(zip);
    const names = entries.map(e => e.name);
    const { data: completed, error: completedError } = await admin.from("financeiro_extratos_arquivos_processados")
      .select("arquivo_interno,status,registros_brutos,saldos_informativos,lancamentos_novos,lancamentos_repetidos,lancamentos_pendentes")
      .eq("upload_id", uploadId);
    if (completedError) throw completedError;
    const byName = new Map((completed || []).map(e => [e.arquivo_interno, e]));
    if (mode === "inspect") {
      return respond({
        arquivos_total: names.length,
        arquivos_processados: names.filter(name => byName.get(name)?.status === "processado").length,
        arquivos: names.map((name, index) => ({ index, name, status: byName.get(name)?.status || "pendente" })),
        status: upload.status,
      });
    }
    const indices = body.indices;
    if (!Array.isArray(indices) || indices.length < 1 || indices.length > 4 ||
      indices.some(index => !Number.isInteger(index) || index < 0 || index >= names.length) ||
      new Set(indices).size !== indices.length) return respond({ error: "Seleção de arquivos inválida (máximo 4)" }, 400);

    const completedThisCall: unknown[] = [];
    for (const index of indices) {
      const entry = entries[index];
      if (byName.get(entry.name)?.status === "processado") {
        completedThisCall.push({ name: entry.name, status: "ja_processado" });
        continue;
      }
      try {
        const content = await entry.async("uint8array");
        if (content.byteLength > 12 * 1024 * 1024) throw new Error("OFX excede 12 MB.");
        let rows;
        if (upload.arquivo_tipo === "csv") {
          rows = await prepareCsvRows(content, upload.banco, upload.conta, uploadId, entry.name);
        } else {
          let text = new TextDecoder("windows-1252").decode(content);
          if (/\bENCODING:UTF-8\b/i.test(text)) text = new TextDecoder("utf-8").decode(content);
          const result = parseOfx(text, entry.name, upload.banco, upload.conta);
          rows = await prepareRows(result, upload.banco, upload.conta, uploadId, entry.name);
        }
        let inserted = 0;
        for (let i = 0; i < rows.length; i += 400) {
          const { data: newRows, error: insertError } = await admin
            .from("financeiro_lancamentos_bancarios")
            .upsert(rows.slice(i, i + 400), { onConflict: "banco,conta,chave_unica", ignoreDuplicates: true })
            .select("id");
          if (insertError) throw insertError;
          inserted += (newRows || []).length;
        }
        const stats = {
          upload_id: uploadId, arquivo_interno: entry.name,
          status: "processado",
          registros_brutos: rows.length,
          saldos_informativos: rows.filter(r => r.natureza === "saldo_informativo").length,
          lancamentos_pendentes: rows.filter(r => r.status_extracao === "csv_pendente").length,
          lancamentos_novos: inserted,
          lancamentos_repetidos: rows.length - inserted,
          erro: null, processado_em: new Date().toISOString(),
        };
        const { error: checkpointError } = await admin.from("financeiro_extratos_arquivos_processados")
          .upsert(stats, { onConflict: "upload_id,arquivo_interno" });
        if (checkpointError) throw checkpointError;
        byName.set(entry.name, stats);
        completedThisCall.push({ name: entry.name, status: "processado", registros: rows.length, novos: inserted, duplicados: rows.length - inserted,
          pendentes_conferencia: rows.filter(r => r.status_extracao === "csv_pendente").length });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        await admin.from("financeiro_extratos_arquivos_processados").upsert({
          upload_id: uploadId, arquivo_interno: entry.name, status: "erro", erro: errorMsg.slice(0, 500),
          processado_em: new Date().toISOString(),
        }, { onConflict: "upload_id,arquivo_interno" });
        await admin.from("financeiro_extratos_uploads").update({
          status: "erro", ultimo_erro: entry.name + ": " + errorMsg.slice(0, 350),
        }).eq("id", uploadId);
        return respond({ error: "Falha no arquivo " + entry.name + ": " + errorMsg, concluidos: completedThisCall }, 422);
      }
    }
    const done = names.filter(name => byName.get(name)?.status === "processado").length;
    const finished = done === names.length;
    const { error: statusError } = await admin.from("financeiro_extratos_uploads").update({
      status: finished ? "processado" : "em_processamento",
      ultimo_erro: null, processado_em: finished ? new Date().toISOString() : null,
    }).eq("id", uploadId);
    if (statusError) throw statusError;
    return respond({
      arquivos_total: names.length, arquivos_processados: done,
      concluido: finished, arquivos_processados_nesta_chamada: completedThisCall,
    });
  } catch (e) {
    console.error("financeiro-processar-extrato", e instanceof Error ? e.message : String(e));
    return respond({ error: e instanceof Error ? e.message : "Erro interno ao processar extrato" }, 500);
  }
});
