import Papa from "papaparse";
import { supabase } from "../lib/supabase";

function parseDate(val) {
  if (!val || val === "N/A" || val === "") return null;
  const str = String(val).trim();
  const [datePart, timePart] = str.split(" ");
  const parts = datePart.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts;
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

// ── Preview ───────────────────────────────────────────────
export async function previewTriagemAssurant(file) {
  return new Promise((resolve, reject) => {
    const previewRows = [];
    let totalRows = 0;
    let headers = null;

    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      encoding:       "ISO-8859-1",
      delimiter:      ";",
      step: (result, parser) => {
        if (!headers) headers = Object.keys(result.data);

        if (totalRows === 0) {
          const colsObrigatorias = ["Voucher", "IMEI", "Tipo_de_Rede", "Data_Recebimento"];
          const faltando = colsObrigatorias.filter(c => !headers.includes(c));
          if (faltando.length > 0) {
            parser.abort();
            reject(new Error(`Colunas obrigatórias não encontradas: ${faltando.join(", ")}`));
            return;
          }
        }

        totalRows++;

        if (previewRows.length < 5) {
          const r = result.data;
          previewRows.push({
            Voucher:          r["Voucher"],
            IMEI:             r["IMEI"],
            Modelo:           r["Modelo"],
            Tipo_de_Rede:     r["Tipo_de_Rede"],
            Grade:            r["Grade"],
            Data_Recebimento: r["Data_Recebimento"],
          });
        }
      },
      complete: () => resolve({ totalRows, previewRows }),
      error:    (err) => reject(new Error(err.message)),
    });
  });
}

// ── Upload — lê tudo, processa em batches com log de erro ─
export async function uploadTriagemAssurant(file, userId, mesReferencia, onProgress) {
  const allRows = await new Promise((resolve, reject) => {
    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      encoding:       "ISO-8859-1",
      delimiter:      ";",
      complete: (results) => resolve(results.data || []),
      error:    (err)     => reject(new Error(err.message)),
    });
  });

  console.log("=== TOTAL ROWS LIDOS:", allRows.length);
  console.log("=== PRIMEIRO ROW RAW:", JSON.stringify(allRows[0]));

  const total = allRows.length;
  let inserted = 0;

  const CHUNK = 100;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const batch = allRows.slice(i, i + CHUNK).map(r => parseRow(r, userId, mesReferencia));

    if (i === 0) {
      console.log("=== PRIMEIRO BATCH ITEM MAPEADO:", JSON.stringify(batch[0]));
    }

    const { error } = await supabase.rpc("upsert_triagem", { rows: batch });

    if (error) {
      console.error("=== ERRO RPC batch", i, "ao", i + CHUNK, ":", JSON.stringify(error));
      throw new Error(`Erro no batch ${i}-${i + CHUNK}: ${error.message}`);
    }

    inserted += batch.length;
    onProgress?.({ inserted, duplicates: 0, total });
  }

  return { inserted, duplicates: 0, total };
}