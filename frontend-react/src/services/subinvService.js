import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// DATA À PROVA DE FUSO
// A carga antiga gravou tudo 1 dia atrasado porque converteu a data
// para timestamp e o UTC-3 puxou a meia-noite para o dia anterior.
// Aqui nunca criamos Date local: serial do Excel vira "YYYY-MM-DD"
// por aritmética pura, e Date (se vier) é lido pelos getters UTC.
// ══════════════════════════════════════════════════════════

// Serial do Excel: dia 1 = 1900-01-01, com o bug do ano 1900 bissexto,
// por isso a epoch efetiva é 1899-12-30.
function serialParaISO(serial) {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000;
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function normalizarData(valor) {
  if (valor == null || valor === "") return null;

  if (typeof valor === "number") return serialParaISO(valor);

  if (valor instanceof Date) {
    const yyyy = valor.getUTCFullYear();
    const mm = String(valor.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(valor.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  const str = String(valor).trim();
  // Já ISO (YYYY-MM-DD)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  // DD/MM/AAAA
  m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // Número em texto (serial)
  if (/^\d+([.,]\d+)?$/.test(str)) return serialParaISO(Number(str.replace(",", ".")));

  return null;
}

// A data da extração vem do nome do arquivo (AAAAMMDD.xlsx).
// Sem esse padrão, cai para a data do upload (hoje, no fuso local).
export function dataExtracaoDoArquivo(nomeArquivo) {
  const m = String(nomeArquivo || "").match(/(\d{4})(\d{2})(\d{2})/);
  if (m) {
    const iso = `${m[1]}-${m[2]}-${m[3]}`;
    const d = new Date(`${iso}T12:00:00Z`);
    if (!isNaN(d) && d.getUTCFullYear() > 2000) return { data: iso, origem: "nome do arquivo" };
  }
  const hoje = new Date();
  const yyyy = hoje.getFullYear();
  const mm = String(hoje.getMonth() + 1).padStart(2, "0");
  const dd = String(hoje.getDate()).padStart(2, "0");
  return { data: `${yyyy}-${mm}-${dd}`, origem: "data do upload" };
}

// ══════════════════════════════════════════════════════════
// LEITURA DO ARQUIVO
// ══════════════════════════════════════════════════════════
function lerArquivo(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        // raw:true mantém a data como serial — evitamos o Date local do SheetJS
        const wb = XLSX.read(e.target.result, { type: "binary", raw: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: true });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

function mapearLinhas(rows) {
  const validas = [];
  let invalidas = 0;

  for (const row of rows) {
    // IMEI sempre como texto: a base mistura IMEIs de 15 dígitos com
    // seriais alfanuméricos e códigos curtos. Converter para número corrompe.
    const imei = String(row["NUM_IMEI"] ?? "").trim();
    const data = normalizarData(row["DATA_SUBINV"]);
    // LOCAL = armazém/subinventário do Oracle (ex.: "WH2 B2C", "WH2 CENTER CELL",
    // "CENTER CELL", "ALPHA"). É o que diz se a peça está fisicamente no nosso WH2.
    const local = String(row["LOCAL"] ?? "").trim() || null;
    if (!imei || !data) { invalidas++; continue; }
    validas.push({ imei, data_subinv: data, local_subinv: local });
  }

  // Se o mesmo IMEI vier repetido, a última linha manda
  const mapa = new Map();
  validas.forEach(v => mapa.set(v.imei, v));
  const unicas = Array.from(mapa.values());

  return { linhas: unicas, invalidas, duplicadas: validas.length - unicas.length };
}

// Só o estoque do WH2 é elegível para o FIFO (WH2 B2C e WH2 CENTER CELL).
// Atenção: existe "CENTER CELL" e "WH2 CENTER CELL" — nomes parecidos, armazéns
// diferentes. Por isso o teste é pelo PREFIXO "WH2", nunca por "contém".
export function ehWH2(localSubinv) {
  return String(localSubinv || "").trim().toUpperCase().startsWith("WH2");
}

// Prévia antes de gravar: o operador confere o que vai subir
export async function previewSubinv(file) {
  const rows = await lerArquivo(file);
  if (!rows.length) throw new Error("Planilha vazia.");
  if (!("NUM_IMEI" in rows[0]) || !("DATA_SUBINV" in rows[0])) {
    throw new Error("Colunas esperadas não encontradas: NUM_IMEI e DATA_SUBINV.");
  }
  // LOCAL é obrigatório: o FIFO só sugere peças do WH2. Sem essa coluna, todo o
  // estoque entraria sem armazém — melhor recusar aqui do que afrouxar o filtro.
  if (!("LOCAL" in rows[0])) {
    throw new Error("Coluna LOCAL não encontrada. A planilha do subinv precisa ter NUM_IMEI, LOCAL e DATA_SUBINV.");
  }

  const { linhas, invalidas, duplicadas } = mapearLinhas(rows);
  if (!linhas.length) throw new Error("Nenhuma linha válida na planilha.");

  const datas = linhas.map(l => l.data_subinv).sort();
  const { data: dataExtracao, origem } = dataExtracaoDoArquivo(file.name);

  // Quebra por armazém, para o operador ver o que entra no FIFO e o que fica de fora
  const porLocal = {};
  linhas.forEach(l => {
    const k = l.local_subinv || "(sem local)";
    porLocal[k] = (porLocal[k] || 0) + 1;
  });
  const locais = Object.entries(porLocal)
    .map(([nome, qtd]) => ({ nome, qtd, wh2: ehWH2(nome) }))
    .sort((a, b) => b.qtd - a.qtd);
  const totalWH2 = linhas.filter(l => ehWH2(l.local_subinv)).length;

  return {
    totalLinhas: linhas.length,
    invalidas,
    duplicadas,
    dataMin: datas[0],
    dataMax: datas[datas.length - 1],
    dataExtracao,
    origemData: origem,
    amostra: linhas.slice(0, 5),
    locais,
    totalWH2,
    totalForaWH2: linhas.length - totalWH2,
  };
}

// ══════════════════════════════════════════════════════════
// IMPORTAÇÃO
// Grava a carga inteira no histórico e substitui a foto atual
// (estoque_subinv), que é a tabela que o FIFO consulta.
// ══════════════════════════════════════════════════════════
export async function importarSubinv(file, userId, userNome, onProgress) {
  const rows = await lerArquivo(file);
  if (rows.length && !("LOCAL" in rows[0])) {
    throw new Error("Coluna LOCAL não encontrada. A planilha do subinv precisa ter NUM_IMEI, LOCAL e DATA_SUBINV.");
  }
  const { linhas, invalidas, duplicadas } = mapearLinhas(rows);
  if (!linhas.length) throw new Error("Nenhuma linha válida na planilha.");

  const { data: dataExtracao, origem } = dataExtracaoDoArquivo(file.name);

  // 1) Registra a carga (cabeçalho do histórico)
  const { data: carga, error: errCarga } = await supabase
    .from("estoque_subinv_cargas")
    .insert({
      data_extracao:   dataExtracao,
      arquivo_nome:    file.name,
      total_linhas:    linhas.length,
      criado_por:      userId,
      criado_por_nome: userNome || "Usuário",
    })
    .select()
    .single();
  if (errCarga) throw new Error(`Falha ao criar a carga: ${errCarga.message}`);

  const LOTE = 1000;
  const totalPassos = Math.ceil(linhas.length / LOTE) * 2; // histórico + foto
  let passo = 0;

  // 2) Histórico: todas as linhas desta carga
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE).map(l => ({ ...l, carga_id: carga.id }));
    const { error } = await supabase.from("estoque_subinv_historico").insert(lote);
    if (error) throw new Error(`Falha ao gravar histórico: ${error.message}`);
    passo++;
    onProgress?.({ fase: "histórico", pct: Math.round((passo / totalPassos) * 100) });
  }

  // 3) Foto atual: limpa e reinsere (a última extração manda)
  const { error: errDel } = await supabase
    .from("estoque_subinv").delete().neq("imei", "__nunca__");
  if (errDel) throw new Error(`Falha ao limpar a foto atual: ${errDel.message}`);

  const agora = new Date().toISOString();
  for (let i = 0; i < linhas.length; i += LOTE) {
    const lote = linhas.slice(i, i + LOTE).map(l => ({ ...l, atualizado_em: agora }));
    const { error } = await supabase.from("estoque_subinv").insert(lote);
    if (error) throw new Error(`Falha ao gravar a foto atual: ${error.message}`);
    passo++;
    onProgress?.({ fase: "foto atual", pct: Math.round((passo / totalPassos) * 100) });
  }

  // Quebra por armazém: o que entra no FIFO (WH2) e o que fica de fora
  const porLocal = {};
  linhas.forEach(l => {
    const k = l.local_subinv || "(sem local)";
    porLocal[k] = (porLocal[k] || 0) + 1;
  });
  const locais = Object.entries(porLocal)
    .map(([nome, qtd]) => ({ nome, qtd, wh2: ehWH2(nome) }))
    .sort((a, b) => b.qtd - a.qtd);
  const totalWH2 = linhas.filter(l => ehWH2(l.local_subinv)).length;

  return {
    ok: true,
    cargaId: carga.id,
    dataExtracao,
    origemData: origem,
    inseridas: linhas.length,
    invalidas,
    duplicadas,
    locais,
    totalWH2,
    totalForaWH2: linhas.length - totalWH2,
  };
}

// Histórico de cargas já importadas
export async function listarCargasSubinv() {
  const { data, error } = await supabase
    .from("estoque_subinv_cargas")
    .select("*")
    .order("data_extracao", { ascending: false })
    .limit(20);
  if (error) throw new Error(error.message);
  return data || [];
}