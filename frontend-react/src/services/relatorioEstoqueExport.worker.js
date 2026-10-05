import * as XLSX from 'xlsx';
import { COLUNAS_ESTOQUE, DATAS_ESTOQUE, linhaEstoque } from './relatorioEstoqueColumns.js';

let sheet;
let rows = 0;
self.onmessage = ({ data }) => {
  try {
    if (data.type === 'init') {
      sheet = XLSX.utils.aoa_to_sheet([COLUNAS_ESTOQUE], { dense: true });
      rows = 0;
    } else if (data.type === 'chunk') {
      const values = data.items.map(linhaEstoque);
      XLSX.utils.sheet_add_aoa(sheet, values, { origin: rows + 1, cellDates: true });
      for (let r = rows + 1; r <= rows + values.length; r++) {
        for (const c of DATAS_ESTOQUE) if (sheet[r]?.[c]) sheet[r][c].z = 'dd/mm/yyyy hh:mm:ss';
      }
      rows += values.length;
    } else if (data.type === 'finish') {
      sheet['!autofilter'] = { ref: sheet['!ref'] };
      sheet['!cols'] = COLUNAS_ESTOQUE.map((h, i) => ({ wch: DATAS_ESTOQUE.has(i) ? 22 : Math.max(18, Math.min(38, h.length + 5)) }));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, sheet, 'warehouse');
      const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array', compression: true });
      self.postMessage({ buffer, rows }, [buffer]);
      sheet = null;
      return;
    }
    self.postMessage({ rows });
  } catch (error) {
    self.postMessage({ error: error.message });
  }
};
