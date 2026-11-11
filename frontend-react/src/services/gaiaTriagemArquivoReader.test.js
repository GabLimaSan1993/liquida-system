import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { lerArquivoGaiaTriagem } from './gaiaTriagemArquivoReader.js';

const fakeFile=(name,data)=>({
  name,
  async arrayBuffer(){
    const bytes=data instanceof Uint8Array ? data : new TextEncoder().encode(data);
    return bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
  }
});

function excelFixture(){
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,
    XLSX.utils.aoa_to_sheet([['Resumo de estoque do GAIA'],[],[
      'VOUCHER','IMEI','Modelo','Tipo de Rede','Status Atual','Grade','Data Recebimento'
    ],['YBV123456',351234567890123,'Modelo A','TRAON','Aguardando Alocação','Bom',46336],
      ['YBV123457',351234567890124,'Modelo B','GRV','Aguardando oracle','Muito Bom',46337]]),
    'Relatório Estoque');
  return fakeFile('Relatório_Estoque (18).xlsx',
    XLSX.write(wb,{type:'array',bookType:'xlsx'}));
}

describe('leitura de relatórios GAIA',()=>{
  it('reconhece Excel real com título antes do cabeçalho, cabeçalhos alternativos e IMEIs numéricos',async()=>{
    const r=await lerArquivoGaiaTriagem(excelFixture());
    expect(r.source).toBe('Excel');
    expect(r.sheet).toBe('Relatório Estoque');
    expect(r.headerRow).toBe(3);
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0].Voucher).toBe('YBV123456');
    expect(String(r.rows[0].IMEI)).toBe('351234567890123');
    expect(r.rows[0].Tipo_de_Rede).toBe('TRAON');
    expect(r.rows[0].Status_atual).toBe('Aguardando Alocação');
    expect(r.rows[0].Grade).toBe('Bom');
  });

  it('mantém o formato CSV GAIA, separador ponto e vírgula, com acentos',async()=>{
    const csv='Voucher;IMEI;Status_atual;Grade;Data_Recebimento\n'
      +'YBV765432;359876543210987;Aguardando alocação;Excelente;11/11/2026 11:30:00\n';
    const r=await lerArquivoGaiaTriagem(fakeFile('Relatório_Estoque.csv',csv));
    expect(r.source).toBe('CSV');
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].Voucher).toBe('YBV765432');
    expect(r.rows[0].Grade).toBe('Excelente');
  });

  it('não conta linhas sem voucher como importadas',async()=>{
    const csv='Voucher;IMEI;Status\n'
      +';351111111111111;Aguardando oracle\n'
      +'YBV999999;352222222222222;Aguardando armazenagem\n';
    const r=await lerArquivoGaiaTriagem(fakeFile('gaia.csv',csv));
    expect(r.rows).toHaveLength(1);
    expect(r.ignored).toBe(1);
  });

  it('retorna erro explícito para Excel de outro layout em vez de 0 linhas válidas',async()=>{
    const wb=XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([
      ['Descrição','Quantidade'],['Produto X',2]
    ]),'Dados');
    const arquivo=fakeFile('gaia.xlsx',XLSX.write(wb,{type:'array',bookType:'xlsx'}));
    await expect(lerArquivoGaiaTriagem(arquivo)).rejects.toThrow(/nenhuma aba contém vouchers/i);
  });
});
