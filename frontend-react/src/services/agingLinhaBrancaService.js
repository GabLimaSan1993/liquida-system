import { supabase } from "../lib/supabase.js";
import { parseAgingLinhaBranca } from "./agingLinhaBrancaParser.js";

export async function lerArquivoAging(arquivo) {
  if (!/\.csv$/i.test(arquivo.name)) throw new Error("Selecione um arquivo CSV.");
  if (arquivo.size > 50 * 1024 * 1024) throw new Error("O limite é de 50 MB por arquivo.");
  const bytes = await arquivo.arrayBuffer();
  let texto;
  try { texto = new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { texto = new TextDecoder("windows-1252").decode(bytes); }
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
  return { ...parseAgingLinhaBranca(texto), sha256, arquivo: arquivo.name };
}

export async function historicoUploadsAging() {
  const { data, error } = await supabase.from("linha_branca_importacoes")
    .select("id,arquivo,data_referencia,status,inseridas,atualizadas,preservadas,total_linha_branca,operador,created_at")
    .order("created_at", { ascending: false }).limit(20);
  if (error) throw error;
  return data || [];
}

async function rpc(nome, args) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw error;
  return data;
}

export async function importarAging(base, dataReferencia, onProgresso = () => {}) {
  if (base.erros.length || !base.registros.length || !dataReferencia) throw new Error("Revise os dados antes de importar.");
  const inicio = await rpc("linha_branca_upload_iniciar", {
    p_arquivo: base.arquivo, p_sha256: base.sha256, p_data_referencia: dataReferencia,
    p_total_arquivo: base.total, p_total_linha_branca: base.registros.length,
  });
  if (inicio.status === "concluido") return { ...inicio, repetido: true };
  for (let offset = 0; offset < base.registros.length; offset += 200) {
    const quantidade = await rpc("linha_branca_upload_lote", {
      p_importacao: inicio.id, p_registros: base.registros.slice(offset, offset + 200),
    });
    onProgresso(Math.round(quantidade / base.registros.length * 95));
  }
  const resultado = await rpc("linha_branca_upload_concluir", { p_importacao: inicio.id });
  onProgresso(100);
  return resultado;
}
