import * as XLSX from "xlsx";

function normalizarColuna(valor) {
  return String(valor ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
    .replace(/[\uFEFF\u200B-\u200D]/g,"")
    .toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
}

const ehVoucher = nome =>
  /^(voucher|voucher id|id voucher|codigo voucher|codigo do voucher|numero voucher|numero do voucher|voucher recebido|voucher do aparelho|voucher recebimento)$/.test(normalizarColuna(nome));
const ehOsGaia = nome =>
  /^(os|os gaia|osgaia|n os|numero os|numero da os|numero de os|numero os gaia|ordem de servico|ordem servico|ordem de servico gaia|os numero|os numero gaia)$/.test(normalizarColuna(nome));

function voucherNormalizado(value) {
  const texto = (typeof value === "number" && Number.isSafeInteger(value) ? value.toFixed(0) : String(value ?? ""))
    .normalize("NFKC").replace(/[\uFEFF\u200B-\u200D\u00A0]/g,"")
    .trim().replace(/^['"]+|['"]+$/g,"").toUpperCase().replace(/\s+/g,"");
  if (/^\d{15}$/.test(texto)) return null; // Parece IMEI, jamais usar como voucher.
  if (/^\d+$/.test(texto)) return "YBV" + texto.replace(/^0+(?=\d)/,"");
  if (/^YBV\d+$/.test(texto)) return "YBV" + texto.slice(3).replace(/^0+(?=\d)/,"");
  return /^[A-Z0-9][A-Z0-9_-]{2,59}$/.test(texto) &&
    !/^(VOUCHER|IMEI|OS|TOTAL|PEDIDO|NUMERO)$/.test(texto) ? texto : null;
}

async function lerArquivo(arquivo) {
  if (!arquivo || !/\.(xlsx|xls|csv|ods)$/i.test(arquivo.name))
    throw new Error("Selecione uma planilha XLSX, XLS, ODS ou CSV.");
  if (arquivo.size > 15 * 1024 * 1024 || !arquivo.size)
    throw new Error("Arquivo vazio ou maior que 15 MB.");
  const livro = XLSX.read(await arquivo.arrayBuffer(), { type: "array", raw: true, codepage: 65001 });
  for (const aba of livro.SheetNames) {
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets[aba], { header: 1, raw: true, defval: "" });
    if (!linhas.length) continue;
    for (let i=0; i<Math.min(35,linhas.length); i++) {
      const cabecalho = linhas[i] || [];
      const colVoucher = cabecalho.findIndex(ehVoucher);
      if (colVoucher >= 0) return { arquivo: arquivo.name, aba, linhas, cabecalho: i, colVoucher, colOs: cabecalho.findIndex(ehOsGaia) };
    }
  }
  throw new Error("Não encontrei a coluna Voucher. Confira o cabeçalho do arquivo.");
}

export async function lerVoucherOsGaia(arquivo) {
  const dados = await lerArquivo(arquivo);
  if (dados.colOs < 0 || dados.colOs === dados.colVoucher)
    throw new Error("A planilha deve conter duas colunas: Voucher e OS GAIA.");
  const pares = [];
  const porVoucher = new Set(), porOs = new Set(), erros = [];
  for (let i=dados.cabecalho+1;i<dados.linhas.length;i++) {
    const linha = dados.linhas[i] || [];
    if (linha.every(v => String(v ?? "").trim() === "")) continue;
    const voucher = voucherNormalizado(linha[dados.colVoucher]);
    const os_gaia = String(linha[dados.colOs] ?? "").trim().replace(/\.0$/,"");
    if (!voucher || !/^[A-Za-z0-9._/-]{2,60}$/.test(os_gaia)) {
      erros.push("Linha " + (i+1) + ": voucher ou OS GAIA inválido");
      continue;
    }
    if (porVoucher.has(voucher) || porOs.has(os_gaia.toUpperCase())) {
      erros.push("Linha " + (i+1) + ": voucher ou OS GAIA duplicado");
      continue;
    }
    porVoucher.add(voucher);
    porOs.add(os_gaia.toUpperCase());
    pares.push({ voucher, os_gaia });
    if (pares.length>5000) throw new Error("Limite de 5.000 registros por arquivo.");
  }
  if (erros.length) throw new Error(erros.slice(0,12).join("; ") +
    (erros.length>12 ? " e mais " + (erros.length-12) + " linhas com erro." : "") +
    " Nenhum recebimento foi confirmado.");
  if (!pares.length) throw new Error("Não encontrei registros de Voucher + OS GAIA.");
  return { ...dados, pares };
}

export async function lerVouchersMinuta(arquivo) {
  const dados = await lerArquivo(arquivo);
  const vouchers = [], unicos = new Set(), erros = [];
  for (let i=dados.cabecalho+1;i<dados.linhas.length;i++) {
    const linha = dados.linhas[i] || [];
    if (!String(linha[dados.colVoucher] ?? "").trim()) continue;
    const v = voucherNormalizado(linha[dados.colVoucher]);
    if (!v) { erros.push("Linha " + (i+1) + ": voucher inválido"); continue; }
    if (unicos.has(v)) { erros.push("Linha " + (i+1) + ": voucher repetido " + v); continue; }
    unicos.add(v);
    vouchers.push(v);
    if (vouchers.length>5000) throw new Error("Limite de 5.000 vouchers por minuta.");
  }
  if (erros.length) throw new Error(erros.slice(0,12).join("; ") + ". Corrija a planilha antes de gerar a minuta.");
  if (!vouchers.length) throw new Error("Nenhum voucher na planilha.");
  return { ...dados, vouchers };
}
