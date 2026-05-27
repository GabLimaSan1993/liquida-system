import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

function parseDate(val) {
  if (!val || val === "N/A" || val === "") return null;
  const [datePart, timePart] = String(val).split(" ");
  const [d, m, y] = datePart.split("/");
  return new Date(`${y}-${m}-${d}T${timePart || "00:00:00"}`).toISOString();
}

function parseRow(row, userId, mesReferencia) {
  return {
    voucher:                     row["Voucher"]                      || null,
    imei:                        String(row["IMEI"] || "")           || null,
    sku:                         row["SKU"]                          || null,
    modelo:                      row["Modelo"]                       || null,
    local:                       row["Local"]                        || null,
    cliente:                     row["Cliente"]                      || null,
    loja:                        row["Loja"]                         || null,
    rede:                        row["Rede"]                         || null,
    tipo_de_rede:                row["Tipo_de_Rede"]                 || null,
    lote:                        row["Lote"]                         || null,
    status_atual:                row["Status_atual"]                 || null,
    condicao:                    row["Condicao"]                     || null,
    triagem_funcional:           row["Triagem_funcional"]            || null,
    grade:                       row["Grade"]                        || null,
    criado_em:                   parseDate(row["Criado_em"]),
    atualizado_em:               parseDate(row["Atualizado_em"]),
    tela:                        row["Tela"]                         || null,
    laterais:                    row["Laterais"]                     || null,
    traseira:                    row["Traseira"]                     || null,
    defeitos_adicionais:         row["Defeitos_Adicionais"]          || null,
    resultado_triagem_funcional: row["Resultado_Triagem_Funcional"]  || null,
    data_recebimento:            parseDate(row["Data_Recebimento"]),
    data_funcional:              parseDate(row["Data_Funcional"]),
    data_cosmetico:              parseDate(row["Data_Cosmetico"]),
    data_laudo:                  parseDate(row["Data_Laudo"]),
    data_alocacao:               parseDate(row["Data_Alocacao"]),
    data_oracle:                 parseDate(row["Data_Oracle"]),
    respostas_funcional:         row["Respostas_Funcional"]          || null,
    status_bateria:              row["status_bateria"]               || null,
    reanalise:                   row["Reanalise"]                    || null,
    aging:                       row["Aging"]                        || null,
    uploaded_by:                 userId,
    mes_referencia:              mesReferencia,
  };
}

export async function previewTriagemAssurant(file) {
  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: "array", cellDates: false });
  const ws     = wb.Sheets[wb.SheetNames[0]];
  const rows   = XLSX.utils.sheet_to_json(ws, { defval: "" });

  if (rows.length === 0) throw new Error("Planilha vazia ou formato inválido.");

  const colsObrigatorias = ["Voucher", "IMEI", "Tipo_de_Rede", "Data_Recebimento"];
  const colsArquivo = Object.keys(rows[0]);
  const faltando = colsObrigatorias.filter(c => !colsArquivo.includes(c));
  if (faltando.length > 0) {
    throw new Error(`Colunas obrigatórias não encontradas: ${faltando.join(", ")}`);
  }

  return {
    totalRows: rows.length,
    previewRows: rows.slice(0, 3).map(r => ({
      Voucher:       r.Voucher,
      IMEI:          r.IMEI,
      Modelo:        r.Modelo,
      Tipo_de_Rede:  r.Tipo_de_Rede,
      Grade:         r.Grade,
      Data_Recebimento: r.Data_Recebimento,
    })),
  };
}

export async function uploadTriagemAssurant(file, userId, mesReferencia, onProgress) {
  const buffer = await file.arrayBuffer();
  const wb     = XLSX.read(buffer, { type: "array", cellDates: false });
  const ws     = wb.Sheets[wb.SheetNames[0]];
  const rows   = XLSX.utils.sheet_to_json(ws, { defval: "" });

  const parsed  = rows.map(r => parseRow(r, userId, mesReferencia));
  const BATCH   = 500;
  let inserted  = 0;
  let duplicates = 0;
  const total   = parsed.length;

  for (let i = 0; i < parsed.length; i += BATCH) {
    const lote = parsed.slice(i, i + BATCH);
    const { data, error } = await supabase
      .from("assurant_triagem")
      .upsert(lote, { onConflict: "voucher", ignoreDuplicates: true })
      .select();

    if (error) throw new Error(error.message);

    inserted   += data?.length || 0;
    duplicates += lote.length - (data?.length || 0);

    onProgress?.({ inserted, duplicates, total });
  }

  return { inserted, duplicates, total };
}