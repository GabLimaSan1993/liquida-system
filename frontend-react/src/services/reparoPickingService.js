import { supabase } from '../lib/supabase.js';

export async function operarReparo(acao, pedidoId = null, extra = {}, signal) {
  let request = supabase.rpc('assurant_reparo_operar', {
    p_acao: acao, p_pedido_id: pedidoId, ...extra,
  });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return data;
}

// Novo importador: a planilha contém vouchers; o banco resolve os IMEIs.
export async function operarReparoPorVouchers(vouchers) {
  const { data, error } = await supabase.rpc('assurant_reparo_criar_por_vouchers', {
    p_vouchers: vouchers,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function exportarReparo(pedido, itens, modo, statusDestino = '') {
  if (modo === 'oracle' && !statusDestino.trim() && !pedido.status_destino_oracle) {
    throw new Error('Informe o status de destino no Oracle antes de exportar.');
  }
  const XLSX = await import('xlsx');
  const rows = itens.map(i => ({
    Pedido: pedido.lote, IMEI: String(i.imei), Voucher: i.voucher || '',
    SKU: i.sku || '', Modelo: i.modelo || '', Grade: i.grade || '', 'Defeitos Adicionais': i.defeitos_adicionais || '',
    'Local WMS': i.local_wms || '', 'Status Picking': i.status,
    Pendência: i.pendencia || '', 'Bipado em': i.bipado_em || '',
    'Status anterior Liquida': i.status_anterior || '',
    ...(modo === 'oracle' ? {
      'Status destino Oracle': statusDestino.trim() || pedido.status_destino_oracle,
      'Referência Oracle': pedido.referencia_oracle || '',
    } : {}),
    Finalidade: 'REPARO INTERNO — SEM FATURAMENTO',
  }));
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!autofilter'] = { ref: sheet['!ref'] };
  sheet['!cols'] = Object.keys(rows[0] || {}).map(k => ({ wch: k === 'Modelo' || k === 'Pendência' ? 55 : 25 }));
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, modo === 'oracle' ? 'Movimentação Oracle' : 'Picking Reparo');
  XLSX.writeFile(book, `${modo === 'oracle' ? 'Movimentacao_Oracle' : 'Picking'}_${pedido.lote}.xlsx`);
}

/**
 * A bipagem alimenta esta fila automaticamente, sem movimentar o Oracle.
 * Os lotes em picking são pré-lista; apenas os concluídos são liberados.
 */
export async function exportarFilaOracleReparo() {
  const { data, error } = await supabase.rpc('assurant_reparo_fila_oracle_envio');
  if (error) throw new Error(error.message);
  if (!Array.isArray(data) || !data.length) throw new Error('Não existem IMEIs bipados aguardando envio ao Oracle.');
  const XLSX = await import('xlsx');
  const linhas = data.map(i => ({
    'Lote': i.lote,
    'Situação': i.situacao_fila === 'LIBERADO_PARA_MOVIMENTACAO' ? 'Liberado — picking concluído' : 'Pré-lista — picking em andamento',
    'IMEI': String(i.imei || ''),
    'Voucher': i.voucher || '',
    'Modelo': i.modelo || '',
    'SKU': i.sku || '',
    'Grade': i.grade || '',
    'Local WMS': i.local_wms || '',
    'Subinventário atual (conferir)': i.subinv_estoque_origem || '',
    'Subinventário destino': '6',
    'Bipado em': i.bipado_em || '',
    'Picking concluído em': i.picking_concluido_em || '',
    'Finalidade': i.finalidade
  }));
  const planilha = XLSX.utils.json_to_sheet(linhas);
  planilha['!autofilter'] = { ref: planilha['!ref'] };
  planilha['!cols'] = Object.keys(linhas[0]).map(k => ({ wch: /Modelo|Situação|Finalidade/.test(k) ? 40 : 23 }));
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, planilha, 'Fila Envios Oracle');
  XLSX.writeFile(livro, 'Fila_Oracle_Envio_Reparos.xlsx');
  return { total: linhas.length, liberados: linhas.filter(i => i['Situação'] === 'Liberado — picking concluído').length };
}


export async function exportarPlanilhaWarehouseGaia(pedidoId) {
  const {data,error}=await supabase.rpc("assurant_reparo_warehouse_planilha_gaia",{p_pedido_id:pedidoId});
  if (error) throw new Error(error.message);
  if (!data?.ok || !data?.itens?.length) throw new Error("Não há produtos destinados ao Laboratório neste picking.");
  const XLSX = await import("xlsx");
  const rows=data.itens.map(x=>({
    "Voucher": x.voucher || "",
    "IMEI": String(x.imei || ""),
    "Modelo comercial": x.modelo_comercial || "",
    "SKU": String(x.sku || ""),
    "Grade": x.grade || "",
    "Defeitos Adicionais": x.defeitos_adicionais || "",
    "Modelo Fabricante": x.modelo_fabricante || "",
    "Marca": x.marca || "",
    "Defeito da triagem": x.defeito_triagem || "",
    "OS GAIA": x.os_gaia || ""
  }));
  const sheet=XLSX.utils.json_to_sheet(rows,{header:["Voucher","IMEI","Modelo comercial","SKU","Grade","Defeitos Adicionais","Modelo Fabricante","Marca","Defeito da triagem","OS GAIA"]});
  sheet["!autofilter"]={ref:sheet["!ref"]};
  sheet["!cols"]=[{wch:25},{wch:21},{wch:55},{wch:25},{wch:16},{wch:65},{wch:30},{wch:24},{wch:70},{wch:22}];
  const livro=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro,sheet,"Envio ao Gaia");
  XLSX.writeFile(livro,"Warehouse_Envio_Laboratorio_"+new Date().toISOString().slice(0,10)+".xlsx");
  return rows.length;
}
