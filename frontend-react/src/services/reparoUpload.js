import * as XLSX from 'xlsx';

export const LIMITE_UPLOAD_REPARO = 2000;

export function validarLinhasReparo(linhas) {
  const cabecalho = (linhas[0] || []).map(valor => String(valor ?? '').trim().toUpperCase());
  const coluna = cabecalho.indexOf('IMEI');
  if (coluna < 0) throw new Error('A primeira linha deve conter a coluna IMEI. Use o modelo disponível nesta tela.');
  if (cabecalho.lastIndexOf('IMEI') !== coluna) throw new Error('A planilha contém mais de uma coluna IMEI. Mantenha apenas uma.');
  const vistos = new Map();
  const imeis = [];
  const erros = [];
  for (let index = 1; index < linhas.length; index += 1) {
    const valor = linhas[index]?.[coluna];
    if (valor == null || String(valor).trim() === '') continue;
    const imei = String(valor).trim();
    if (!/^\d{15}$/.test(imei)) {
      erros.push(`Linha ${index + 1}: informe um IMEI com 15 números, em formato Texto.`);
    } else if (vistos.has(imei)) {
      erros.push(`Linha ${index + 1}: IMEI repetido da linha ${vistos.get(imei)}.`);
    } else {
      vistos.set(imei, index + 1);
      imeis.push(imei);
    }
  }
  if (erros.length) throw new Error(`${erros.slice(0, 5).join(' ')}${erros.length > 5 ? ` Mais ${erros.length - 5} erro(s).` : ''}`);
  if (!imeis.length) throw new Error('Preencha pelo menos um IMEI abaixo do cabeçalho.');
  if (imeis.length > LIMITE_UPLOAD_REPARO) throw new Error(`Envie no máximo ${LIMITE_UPLOAD_REPARO} IMEIs por arquivo.`);
  return imeis;
}

export async function lerUploadReparo(arquivo) {
  if (!/\.(xlsx|xls|csv)$/i.test(arquivo.name)) throw new Error('Selecione uma planilha .xlsx, .xls ou .csv.');
  if (arquivo.size > 10 * 1024 * 1024) throw new Error('O arquivo deve ter no máximo 10 MB.');
  const book = XLSX.read(await arquivo.arrayBuffer(), { type: 'array', raw: true });
  const sheetName = book.SheetNames.includes('Reparo') ? 'Reparo' : book.SheetNames[0];
  if (!sheetName) throw new Error('O arquivo não contém uma planilha.');
  const sheet = book.Sheets[sheetName];
  const range = sheet['!ref'] && XLSX.utils.decode_range(sheet['!ref']);
  if (range && range.e.r > 10000) throw new Error('A planilha ultrapassa 10.000 linhas. Use o modelo com até 2.000 IMEIs.');
  return validarLinhasReparo(XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '', blankrows: true }));
}
