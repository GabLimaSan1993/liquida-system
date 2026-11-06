import * as XLSX from 'xlsx';

export const LIMITE_UPLOAD_REPARO = 2000;

// A entrada de picking é por voucher. O IMEI é localizado pelo banco no WMS/Triagem.
export function normalizarVoucherReparo(valor) {
  const s = String(valor ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!s) return '';
  if (/^[0-9]+$/.test(s)) return 'YBV' + s.replace(/^0+(?=[0-9])/, '');
  if (/^YBV[0-9]+$/.test(s)) return 'YBV' + s.slice(3).replace(/^0+(?=[0-9])/, '');
  return s;
}

export function validarLinhasReparo(linhas) {
  const cabecalho = (linhas[0] || []).map(v => String(v ?? '').trim().toUpperCase());
  const coluna = cabecalho.indexOf('VOUCHER');
  if (coluna < 0) {
    if (cabecalho.includes('IMEI')) {
      throw new Error('Este é o modelo antigo por IMEI. Baixe o novo layout e informe a coluna VOUCHER. IMEIs não são mais aceitos para criar o lote.');
    }
    throw new Error('A primeira linha deve conter a coluna VOUCHER. Baixe o layout atualizado nesta tela.');
  }
  if (cabecalho.lastIndexOf('VOUCHER') !== coluna) throw new Error('Há mais de uma coluna VOUCHER. Mantenha apenas uma.');
  const vistos = new Map();
  const vouchers = [];
  const erros = [];
  for (let index = 1; index < linhas.length; index += 1) {
    const valor = linhas[index]?.[coluna];
    if (valor == null || String(valor).trim() === '') continue;
    const texto = String(valor).trim().toUpperCase();
    const voucher = normalizarVoucherReparo(valor);
    if (/^[0-9]{15}$/.test(texto)) {
      erros.push('Linha ' + (index + 1) + ': o número parece um IMEI. Informe o voucher do aparelho.');
    } else if (!/^[A-Z0-9-]{2,60}$/.test(voucher)) {
      erros.push('Linha ' + (index + 1) + ': informe um voucher válido (ex.: YBV123456, SAMV123456 ou DEV1YBV123456).');
    } else if (vistos.has(voucher)) {
      erros.push('Linha ' + (index + 1) + ': voucher repetido da linha ' + vistos.get(voucher) + '.');
    } else {
      vistos.set(voucher, index + 1);
      vouchers.push(voucher);
    }
  }
  if (erros.length) throw new Error(erros.slice(0, 5).join(' ') + (erros.length > 5 ? ' Mais ' + (erros.length - 5) + ' erro(s).' : ''));
  if (!vouchers.length) throw new Error('Preencha pelo menos um voucher abaixo do cabeçalho.');
  if (vouchers.length > LIMITE_UPLOAD_REPARO) throw new Error('Envie no máximo ' + LIMITE_UPLOAD_REPARO + ' vouchers por arquivo.');
  return vouchers;
}

export async function lerUploadReparo(arquivo) {
  if (!/\.(xlsx|xls|csv)$/i.test(arquivo.name)) throw new Error('Selecione uma planilha .xlsx, .xls ou .csv.');
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 10 MB.');
  const book = XLSX.read(await arquivo.arrayBuffer(), { type: 'array', raw: true });
  const sheetName = book.SheetNames.includes('Reparo') ? 'Reparo' : book.SheetNames[0];
  if (!sheetName) throw new Error('O arquivo não contém uma planilha.');
  const sheet = book.Sheets[sheetName];
  const range = sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']);
  if (range && range.e.r > 10000) throw new Error('A planilha ultrapassa 10.000 linhas. Use o modelo com até 2.000 vouchers.');
  return validarLinhasReparo(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true }));
}

// Importador tolerante para planilhas reais: aproveita vouchers válidos,
// apresenta duplicidades/erros por linha e não confunde IMEI com voucher.
export function validarLinhasReparoFlexivel(linhas, { aba = "Reparo" } = {}) {
  const semAcentos = v => String(v ?? "").normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\uFEFF\u200B-\u200D]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toUpperCase().replace(/\s+/g, " ");
  let header = -1, coluna = -1;
  for (let i = 0; i < Math.min(50, linhas.length); i++) {
    const idx = (linhas[i] || []).findIndex(x =>
      /^(VOUCHER|VOUCHER ID|VOUCHER NUMERO|VOUCHER CODIGO|VOUCHER DE REPARO|VOUCHER DO REPARO|CODIGO VOUCHER|CODIGO DO VOUCHER|NUMERO DO VOUCHER|NUMERO VOUCHER|N VOUCHER)$/.test(semAcentos(x)));
    if (idx >= 0) { header = i; coluna = idx; break; }
  }
  if (coluna < 0) {
    const naoVazias = linhas.filter(l => (l || []).some(x => String(x ?? "").trim()));
    const umaColuna = naoVazias.every(l =>
      (l || []).filter(x => String(x ?? "").trim()).length === 1);
    if (!umaColuna || !naoVazias.length) {
      throw new Error("Coluna VOUCHER não localizada. Baixe o layout por voucher; não utilize IMEI como chave.");
    }
    const primeira = semAcentos(naoVazias[0][0]);
    if (["IMEI","NUMERO DO IMEI","OS","PEDIDO","NUMERO DA OS"].includes(primeira)) {
      throw new Error("Planilha por " + primeira + " não é válida para este picking. Informe o voucher.");
    }
    coluna = (linhas.find(l => (l || []).some(x => String(x ?? "").trim())) || [])
      .findIndex(x => String(x ?? "").trim());
  }
  const vistos = new Map(), vouchers = [], invalidos = [], repetidos = [];
  let qtdInvalidos = 0, qtdRepetidos = 0, lidas = 0;
  for (let i = header + 1; i < linhas.length; i++) {
    const celula = linhas[i]?.[coluna];
    if (celula == null || String(celula).trim() === "") continue;
    lidas++;
    const original = typeof celula === "number" && Number.isSafeInteger(celula)
      ? celula.toFixed(0) : String(celula);
    const texto = original.replace(/[\uFEFF\u200B-\u200D]/g, "").trim().toUpperCase();
    const voucher = normalizarVoucherReparo(texto);
    if (/^[0-9]{15}$/.test(texto) ||
        !/^[A-Z0-9-]{3,60}$/.test(voucher) ||
        /^(VOUCHER|IMEI|PEDIDO|OS|NUMERO|TOTAL)$/.test(voucher)) {
      qtdInvalidos++;
      if (invalidos.length < 20) invalidos.push(
        aba + " · linha " + (i + 1) + ": " +
        (/^[0-9]{15}$/.test(texto) ? "parece IMEI, informe o voucher" : original.slice(0,65)));
      continue;
    }
    if (vistos.has(voucher)) {
      qtdRepetidos++;
      if (repetidos.length < 20) repetidos.push(
        aba + " · linha " + (i + 1) + ": " + voucher +
        " (repetido da linha " + vistos.get(voucher) + ")");
      continue;
    }
    vistos.set(voucher, i + 1);
    vouchers.push(voucher);
    if (vouchers.length > LIMITE_UPLOAD_REPARO) {
      throw new Error("Limite de " + LIMITE_UPLOAD_REPARO + " vouchers por arquivo; divida a planilha.");
    }
  }
  if (!vouchers.length) {
    throw new Error("Nenhum voucher válido no arquivo. " +
      (invalidos[0] || "Confira a coluna VOUCHER e não envie IMEIs."));
  }
  return { vouchers, invalidos, repetidos, qtdInvalidos, qtdRepetidos, lidas, aba };
}

export async function lerUploadReparoFlexivel(arquivo) {
  if (!arquivo || !/\.(xlsx|xls|ods|csv)$/i.test(arquivo.name || ""))
    throw new Error("Selecione XLSX, XLS, ODS ou CSV.");
  if (!arquivo.size || arquivo.size > 12 * 1024 * 1024)
    throw new Error("Arquivo vazio ou maior que 12 MB.");
  let livro;
  try {
    livro = XLSX.read(await arquivo.arrayBuffer(), { type: "array", raw: true });
  } catch (err) {
    throw new Error("Não foi possível abrir o arquivo. Confira se ele está íntegro e sem senha. " + (err?.message || ""));
  }
  const abas = [...(livro.SheetNames || [])].sort((a,b) =>
    Number(!/reparo|voucher/i.test(a)) - Number(!/reparo|voucher/i.test(b)));
  let ultimaFalha;
  for (const aba of abas) {
    const sheet = livro.Sheets[aba];
    const ref = sheet?.["!ref"];
    if (!ref) continue;
    const range = XLSX.utils.decode_range(ref);
    if (range.e.r - range.s.r > 10000)
      throw new Error("A aba " + aba + " excede 10.000 linhas. Remova linhas vazias formatadas.");
    const linhas = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "", blankrows: true });
    try {
      return validarLinhasReparoFlexivel(linhas, { aba });
    } catch (err) {
      ultimaFalha = err;
    }
  }
  throw ultimaFalha || new Error("Planilha sem dados. Informe a coluna VOUCHER.");
}

export function baixarModeloReparoVoucher() {
  const book = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([['VOUCHER']]);
  sheet['!cols'] = [{ wch: 27 }];
  XLSX.utils.book_append_sheet(book, sheet, 'Reparo');
  const instrucoes = XLSX.utils.aoa_to_sheet([
    ['IMPORTAÇÃO PARA REPARO — VOUCHER'],
    ['Passo', 'Orientação'],
    ['1. Preencher', 'Na aba Reparo informe um voucher por linha, na coluna A, começando na célula A2.'],
    ['Formato', 'Exemplos: YBV123456, SAMV123456, DEV1YBV123456. Para YBV, também pode informar apenas o número.'],
    ['Não usar', 'Não inclua IMEIs. O Liquida System identifica o IMEI a partir do voucher no WMS/Triagem.'],
    ['Quantidade', 'Até 2.000 vouchers únicos por arquivo.'],
    ['2. Importar', 'Assurant → B2B → Picking → Picking para reparo → Importar para reparo.'],
    ['Picking ativo', 'Vouchers já presentes em outro picking ativo serão ignorados e listados com o lote.'],
    ['Pendências', 'Vouchers sem IMEI vinculado ou aguardando decisão Assurant serão identificados separadamente.'],
    ['Segurança', 'A importação não faz baixa ou retirada física; isso ocorre na bipagem do picking.'],
  ]);
  instrucoes['!cols'] = [{ wch: 28 }, { wch: 115 }];
  XLSX.utils.book_append_sheet(book, instrucoes, 'Como preencher');
  XLSX.writeFile(book, 'Modelo_Upload_Reparo_Voucher.xlsx');
}
