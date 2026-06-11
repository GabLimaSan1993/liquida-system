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

// ── Upload com streaming — usa RPC para garantir upsert ──
export async function uploadTriagemAssurant(file, userId, mesReferencia, onProgress) {
  return new Promise((resolve, reject) => {
    let chunk      = [];
    let inserted   = 0;
    let duplicates = 0;
    let total      = 0;
    let hasError   = false;

    const insertQueue = [];
    let processing = false;

    async function processQueue() {
      if (processing || insertQueue.length === 0) return;
      processing = true;

      while (insertQueue.length > 0) {
        const batch = insertQueue.shift();
        try {
          console.log("=== CHAMANDO RPC upsert_triagem, batch size:", batch.length);
          console.log("=== PRIMEIRO ITEM:", JSON.stringify(batch[0]));

          const { error } = await supabase.rpc("upsert_triagem", {
            rows: batch,
          });

          if (error) {
            console.error("=== ERRO RPC:", error);
            throw new Error(error.message);
          }

          console.log("=== RPC OK");
          inserted   += batch.length;
          duplicates  = 0;
          onProgress?.({ inserted, duplicates, total });
        } catch (e) {
          hasError = true;
          reject(e);
          return;
        }
      }

      processing = false;
    }

    Papa.parse(file, {
      header:         true,
      skipEmptyLines: true,
      encoding:       "ISO-8859-1",
      delimiter:      ";",
      step: (result) => {
        if (hasError) return;

        total++;
        chunk.push(parseRow(result.data, userId, mesReferencia));

        if (chunk.length >= 500) {
          insertQueue.push([...chunk]);
          chunk = [];
          processQueue();
        }
      },
      complete: async () => {
        if (chunk.length > 0) {
          insertQueue.push([...chunk]);
        }

        while (insertQueue.length > 0 || processing) {
          await new Promise(r => setTimeout(r, 200));
        }

        if (!hasError) {
          resolve({ inserted, duplicates, total });
        }
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}