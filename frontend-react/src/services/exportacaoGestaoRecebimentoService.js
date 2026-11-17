import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase.js";

// Recebimentos concluídos filtrados pela DATA DE ABERTURA (mesmo critério da tela).
// Toda consulta é paginada no servidor para não truncar em 1.000 registros.
const PAGE_SIZE = 800;
const MAX_ITENS = 700000;
const EXCEL_MAX_ROWS = 1048576;
const ZONA = "America/Sao_Paulo";
const formato = new Intl.DateTimeFormat("en-GB", {
  timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const DIA_MS = 86400000;

function validarData(valor) {
  if (!valor) return;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new Error("Informe uma data válida.");
  const d = new Date(valor + "T12:00:00Z");
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new Error("Data inválida no filtro.");
  }
}

function intervaloSP(dataDe, dataAte) {
  validarData(dataDe);
  validarData(dataAte);
  if (dataDe && dataAte && dataDe > dataAte) {
    throw new Error("A data inicial não pode ser posterior à final.");
  }
  // O Warehouse opera em São Paulo. "Até" é inclusivo, sem perder as
  // últimas horas do dia. Postgres recebe fim exclusivo (dia seguinte).
  let fimExclusivo = null;
  if (dataAte) {
    const d = new Date(dataAte + "T12:00:00Z");
    d.setUTCDate(d.getUTCDate() + 1);
    fimExclusivo = d.toISOString().slice(0, 10) + "T00:00:00-03:00";
  }
  return {
    p_inicio: dataDe ? dataDe + "T00:00:00-03:00" : null,
    p_fim_exclusivo: fimExclusivo,
  };
}

async function consultarTodasPaginas(tipo, filtro, aoProgresso) {
  const todas = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.rpc("assurant_recebimentos_exportar_periodo", {
      p_tipo: tipo,
      ...filtro,
      p_offset: offset,
      p_limite: PAGE_SIZE,
    });
    if (error) throw new Error("Falha ao consultar " + tipo + ": " + error.message);
    if (!data?.ok || !Array.isArray(data.registros)) {
      throw new Error("Resposta inválida ao exportar " + tipo + ". Nenhum arquivo parcial foi gerado.");
    }
    todas.push(...data.registros);
    if (todas.length > MAX_ITENS) {
      throw new Error("O período ultrapassa " + MAX_ITENS.toLocaleString("pt-BR") +
        " registros. Divida a exportação em meses para manter o Excel leve.");
    }
    aoProgresso?.({ fase: tipo === "resumo" ? "Carregando romaneios" : "Carregando bipagens", quantidade: todas.length });
    if (data.registros.length < PAGE_SIZE) return todas;
  }
}

function texto(v) {
  const s = v == null ? "" : String(v);
  // Evita execução de fórmulas no Excel em campos recebidos de terceiros.
  return /^[\s]*[=+\-@]/.test(s) ? "'" + s : s;
}

// Excel recebe um valor NUMÉRICO com formato de data, permitindo dinâmica,
// agrupamento por mês, filtros e cálculos, em vez de texto DD/MM/YYYY.
function dataExcel(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(formato.formatToParts(d).map(x => [x.type, x.value]));
  const calendario = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (calendario - Date.UTC(1899, 11, 30)) / DIA_MS;
}

function tempoMinutos(inicio, fim) {
  if (!inicio || !fim) return null;
  const diff = new Date(fim).getTime() - new Date(inicio).getTime();
  return diff >= 0 ? Math.round(diff / 60000) : null;
}

function montarAba(cabecalhos, linhas, larguras, colunasData = []) {
  if (linhas.length + 1 > EXCEL_MAX_ROWS) throw new Error("A planilha excede o limite de linhas do Excel.");
  const ws = XLSX.utils.aoa_to_sheet([cabecalhos, ...linhas]);
  ws["!autofilter"] = { ref: ws["!ref"] };
  ws["!cols"] = larguras.map(wch => ({ wch }));
  for (const col of colunasData) {
    for (let r = 1; r <= linhas.length; r++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c: col })];
      if (cell?.t === "n") cell.z = "dd/mm/yyyy hh:mm";
    }
  }
  return ws;
}

export async function exportarRecebimentosConsolidados({ dataDe, dataAte, onProgress }) {
  if (!supabase) throw new Error("Supabase indisponível.");
  const intervalo = intervaloSP(dataDe, dataAte);
  const cargas = await consultarTodasPaginas("resumo", intervalo, onProgress);
  if (!cargas.length) throw new Error("Nenhuma carga concluída encontrada no período escolhido.");
  const itens = await consultarTodasPaginas("itens", intervalo, onProgress);

  const porCarga = new Map();
  const ids = new Set();
  for (const item of itens) {
    const chave = item.tipo_item + ":" + item.item_id;
    if (ids.has(chave)) throw new Error("O banco retornou uma bipagem duplicada: " + chave + ". Exportação interrompida.");
    ids.add(chave);
    porCarga.set(item.recebimento_id, (porCarga.get(item.recebimento_id) || 0) + 1);
  }

  const romaneios = new Set(cargas.map(c => c.id));
  const semCarga = itens.find(i => !romaneios.has(i.recebimento_id));
  if (semCarga) throw new Error("A bipagem " + semCarga.codigo + " não possui romaneio correspondente no período.");

  const resumo = cargas.map(c => {
    const esperado = c.transportadora === "Correios" ? Number(c.total_objetos || 0) : Number(c.total_vouchers || 0);
    const realizado = porCarga.get(c.id) || 0;
    return [
      texto(c.id), texto(c.transportadora), texto(c.destinatario_correios),
      texto(c.motorista_nome), texto(c.motorista_cpf), texto(c.placa),
      texto((c.lacres || []).join(", ")), texto(c.iniciado_por_nome),
      dataExcel(c.iniciado_em), dataExcel(c.concluido_em),
      tempoMinutos(c.iniciado_em, c.concluido_em), esperado, realizado,
      realizado - esperado, texto(c.status),
    ];
  });
  const detalhes = itens.map(i => [
    texto(i.recebimento_id), dataExcel(i.iniciado_em),
    texto(i.transportadora), texto(i.destinatario_correios),
    texto(i.motorista_nome), texto(i.placa), texto(i.iniciado_por_nome),
    texto(i.tipo_item), texto(i.codigo), dataExcel(i.bipado_em),
    texto(i.bipado_por_nome), texto(i.situacao), texto(i.item_id),
  ]);

  onProgress?.({ fase: "Montando Excel", quantidade: itens.length });
  const book = XLSX.utils.book_new();
  const resumoSheet = montarAba(
    ["Romaneio (ID)", "Transportadora", "Destinatário Correios", "Motorista",
      "CPF motorista", "Placa", "Lacres", "Responsável abertura",
      "Início", "Conclusão", "Duração (min)", "Total informado",
      "Bipagens detalhadas", "Diferença", "Status"],
    resumo, [39, 20, 24, 30, 18, 14, 24, 30, 23, 23, 17, 18, 22, 15, 15], [8, 9]
  );
  const detalhesSheet = montarAba(
    ["Romaneio (ID)", "Início da carga", "Transportadora", "Destinatário Correios",
      "Motorista", "Placa", "Responsável abertura", "Tipo", "Voucher / Objeto",
      "Bipado em", "Colaborador bipagem", "Situação Correios", "ID da bipagem"],
    detalhes, [39, 23, 20, 24, 30, 14, 30, 19, 26, 23, 30, 25, 39], [1, 9]
  );
  XLSX.utils.book_append_sheet(book, resumoSheet, "Resumo Romaneios");
  XLSX.utils.book_append_sheet(book, detalhesSheet, "Recebimentos Detalhados");

  const inicioLabel = dataDe || "inicio";
  const fimLabel = dataAte || "hoje";
  const filename = "Recebimentos_Consolidado_" + inicioLabel + "_a_" + fimLabel + ".xlsx";
  XLSX.writeFile(book, filename, { bookType: "xlsx", compression: true });

  return {
    cargas: cargas.length,
    bipagens: itens.length,
    vouchers: itens.filter(i => i.tipo_item === "Voucher").length,
    objetos: itens.filter(i => i.tipo_item === "Objeto Correios").length,
    arquivo: filename,
  };
}
