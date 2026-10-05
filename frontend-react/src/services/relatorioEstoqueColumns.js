export const COLUNAS_ESTOQUE = [
  'Voucher', 'IMEI', 'SKU', 'Modelo', 'Local', 'Cliente', 'Loja', 'Rede', 'Tipo_de_Rede', 'Lote',
  'Status_atual', 'Condicao', 'Triagem_funcional', 'Grade', 'Criado_em', 'Atualizado_em',
  'Tela', 'Laterais', 'Traseira', 'Defeitos_Adicionais', 'Resultado_Triagem_Funcional',
  'Data_Recebimento', 'Data_Funcional', 'Data_Cosmetico', 'Data_Laudo', 'Data_Alocacao', 'Data_Oracle',
  'Respostas_Funcional', 'status_bateria', 'Reanalise', 'Aging',
];
export const CAMPOS_ESTOQUE = COLUNAS_ESTOQUE.map(c => c.toLowerCase());
export const DATAS_ESTOQUE = new Set([14, 15, 21, 22, 23, 24, 25, 26]);
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});
// Excel stores a local calendar value; convert explicitly to Brasília before writing.
function excelDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('Data inválida no relatório de estoque.');
  const p = Object.fromEntries(formatter.formatToParts(date).map(x => [x.type, x.value]));
  // Numeric Excel dates avoid browser timezone/DST changes during XLSX serialization.
  return (Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second)) - Date.UTC(1899, 11, 30)) / 86400000;
}
export function linhaEstoque(item) {
  return CAMPOS_ESTOQUE.map((key, index) => {
    const value = item[key];
    if (DATAS_ESTOQUE.has(index)) return excelDate(value);
    if (value == null || value === '') return null;
    // Identifiers remain text, including long IMEIs and SKUs with leading zeros.
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (text.length > 32767) throw new Error(`O campo ${COLUNAS_ESTOQUE[index]} do voucher ${item.voucher} excede o limite de uma célula do Excel.`);
    return text;
  });
}
