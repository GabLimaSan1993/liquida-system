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
