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

function parseRow(row, userId) {
  return {
    usuario:     row["Usuário"]     || row["Usuario"]  || null,
    etapa:       row["Etapa"]                          || null,
    voucher:     row["Voucher"]                        || null,
    serial_imei: row["Serial/IMEI"]                   || null,
    data_etapa:  parseDate(row["Data"]),
    uploaded_by: userId,
  };
}

export async function previewMovimentacao(file) {
  return new Promise((resolve, reject) => {
    const previewRows = [];
    let totalRows = 0;
    let headers = null;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      delimiter: ";",
      step: (result, parser) => {
        if (!headers) {
          headers = Object.keys(result.data);
          const colsObrigatorias = ["Etapa", "Voucher", "Data"];
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
            Usuario: r["Usuário"] || r["Usuario"],
            Etapa:   r["Etapa"],
            Voucher: r["Voucher"],
            Serial:  r["Serial/IMEI"],
            Data:    r["Data"],
          });
        }
      },
      complete: () => resolve({ totalRows, previewRows }),
      error: (err) => reject(new Error(err.message)),
    });
  });
}

export async function uploadMovimentacao(file, userId, onProgress) {
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
          const { error } = await supabase
            .from("assurant_movimentacao")
            .insert(batch);

          if (error) throw new Error(error.message);

          inserted += batch.length;
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
      header: true,
      skipEmptyLines: true,
      encoding: "UTF-8",
      delimiter: ";",
      step: (result) => {
        if (hasError) return;

        total++;
        const parsed = parseRow(result.data, userId);

        // Ignorar linhas sem voucher ou etapa
        if (!parsed.voucher || !parsed.etapa) return;

        chunk.push(parsed);

        if (chunk.length >= 500) {
          insertQueue.push([...chunk]);
          chunk = [];
          processQueue();
        }
      },
      complete: async () => {
        if (chunk.length > 0) insertQueue.push([...chunk]);

        while (insertQueue.length > 0 || processing) {
          await new Promise(r => setTimeout(r, 200));
        }

        if (!hasError) resolve({ inserted, duplicates, total });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}