import { PDFDocument, PDFArray, PDFRawStream, PDFName, StandardFonts, rgb, decodePDFRawStream } from 'npm:pdf-lib@1.17.1';

function imageCount(doc) { return doc.context.enumerateIndirectObjects().filter(([, o]) => o instanceof PDFRawStream && o.dict.get(PDFName.of('Subtype'))?.toString() === '/Image').length; }
function content(doc, page) {
  const value = page.node.Contents();
  const streams = value instanceof PDFArray ? Array.from({ length: value.size() }, (_, i) => doc.context.lookup(value.get(i))) : [value];
  return streams.filter(x => x instanceof PDFRawStream).map(x => new TextDecoder('latin1').decode(decodePDFRawStream(x).decode())).join('\n');
}
function decodeLiteral(v) { return v.replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_, x) => /^[0-7]/.test(x) ? String.fromCharCode(parseInt(x, 8)) : ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' }[x] || x)); }
const normal = s => s.replace(/\s+/g, '').toLowerCase();
function locateCell(text, label) {
  const tokens = [...text.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)];
  for (let i = 0; i < tokens.length; i++) {
    let combined = '';
    for (let j = i; j < Math.min(i + 4, tokens.length); j++) {
      if (tokens[j].index - tokens[i].index > 900) break;
      combined += decodeLiteral(tokens[j][1]);
      if (normal(combined) !== normal(label)) continue;
      const tail = text.slice(tokens[j].index + tokens[j][0].length);
      const rect = /([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+([-\d.]+)\s+re\b/.exec(tail);
      if (!rect) throw Error(`Célula de ${label} não localizada`);
      const cell = tail.slice(rect.index + rect[0].length);
      const end = /[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+[-\d.]+\s+re\b/.exec(cell);
      const values = [...cell.slice(0, end?.index ?? cell.length).matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map(x => decodeLiteral(x[1]));
      if (!values.length) throw Error(`Valor de ${label} não localizado`);
      return { rect: rect.slice(1).map(Number), value: values.join(' ') };
    }
  }
  throw Error(`Campo ${label} não localizado no PDF`);
}
function wrap(value, font, size, width) {
  const lines = [''];
  for (const word of value.split(/\s+/)) {
    const i = lines.length - 1, next = lines[i] ? lines[i] + ' ' + word : word;
    if (font.widthOfTextAtSize(next, size) <= width) lines[i] = next;
    else if (lines[i]) lines.push(word);
    else lines[i] = word;
  }
  return lines;
}

export async function completarPdf(original, dados) {
  const doc = await PDFDocument.load(original, { updateMetadata: false });
  if (doc.getForm().getFields().some(f => f.constructor.name.includes('Signature'))) throw Error('PDF com assinatura requer revisão manual');
  const page = doc.getPages()[0], text = content(doc, page), font = await doc.embedFont(StandardFonts.Helvetica);
  const before = { paginas: doc.getPageCount(), imagens: imageCount(doc) };
  const fields = [
    ['Nome do cliente:', dados.cliente], ['Loja:', dados.loja],
    ['Marca:', dados.produto?.marca], ['Modelo:', dados.produto?.modelo],
    ['Capacidade:', dados.produto?.armazenamento], ['Cor:', dados.produto?.cor],
    ['IMEI:', dados.imei], ['Voucher:', dados.voucher],
  ];
  const changed = [], unavailable = [];
  for (const [label, raw] of fields) {
    const cell = locateCell(text, label);
    if (cell.value.replace(/[\s\-—–\u0096\u0097]/g, '')) continue;
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) { unavailable.push(label); continue; }
    font.encodeText(value);
    const [x, y, w, h] = cell.rect, bottom = y + Math.min(0, h), height = Math.abs(h);
    if (w < 10 || height < 8) throw Error(`Dimensão inesperada em ${label}`);
    let size = 9, lines = wrap(value, font, size, w - 8);
    while (size > 6 && (lines.length * size * 1.15 > height - 6 || lines.some(l => font.widthOfTextAtSize(l, size) > w - 8))) {
      size -= .25; lines = wrap(value, font, size, w - 8);
    }
    if (lines.length * size * 1.15 > height - 6 || lines.some(l => font.widthOfTextAtSize(l, size) > w - 8)) throw Error(`Texto de ${label} exige diagramação manual`);
    page.drawRectangle({ x: x + 1, y: bottom + 1, width: w - 2, height: height - 2, color: rgb(1, 1, 1) });
    const firstY = bottom + (height + (lines.length - 1) * size * 1.15) / 2 - size * .35;
    lines.forEach((line, i) => page.drawText(line, { x: x + (w - font.widthOfTextAtSize(line, size)) / 2, y: firstY - i * size * 1.15, size, font, color: rgb(0, 0, 0) }));
    changed.push(label);
  }
  if (!changed.length) return { changed: false, info: { ...before, campos_completados: [], campos_sem_fonte: unavailable } };
  // Leave any prior customer correction note intact.
  page.drawText(`Cadastro complementado em ${new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. Conteúdo original preservado.`, { x: 40, y: 12, size: 6, font, color: rgb(.35, .35, .35) });
  doc.setModificationDate(new Date());
  const bytes = await doc.save(), verified = await PDFDocument.load(bytes, { updateMetadata: false });
  if (before.paginas !== verified.getPageCount() || before.imagens !== imageCount(verified)) throw Error('Falha na preservação das páginas/fotos');
  return { changed: true, bytes, info: { tipo: 'complementacao_cadastro', ...before, campos_completados: changed, campos_sem_fonte: unavailable } };
}
