import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

const IMEI = (value) => String(value ?? "").trim();
const NORMALIZAR = (value) => IMEI(value).toUpperCase();
const LISTAR = (value) => IMEI(value).split(",").map(s => s.trim()).filter(Boolean);
const ROW_HEADERS = [
  "ID do caso", "Voucher", "Status do caso", "Data da ocorrência",
  "IMEI do contrato atual", "IMEI esperado registrado", "IMEI histórico do contrato",
  "IMEI 1 digitado", "IMEI 2 digitado", "IMEI 1 cadastro", "IMEI 2 cadastro",
  "Contrato do IMEI 1", "Contrato do IMEI 2",
  "IMEI 1 confere contrato?", "IMEI 2 confere contrato?",
  "Indício para conferência", "Possível cruzamento recíproco?",
  "Modelo triagem", "Modelo contrato", "SKU", "Tipo de aparelho",
  "Status atual do produto", "Criado por",
  "Validação manual", "IMEI físico correto", "Voucher correto", "Observações da conferência",
];

function conferir(valor, contrato) {
  if (!IMEI(valor)) return "Não informado";
  if (!IMEI(contrato)) return "Sem contrato";
  return NORMALIZAR(valor) === NORMALIZAR(contrato) ? "SIM" : "NÃO";
}
function distanciaSubstituicoes(a, b) {
  const x = IMEI(a), y = IMEI(b);
  if (!/^\d{15}$/.test(x) || !/^\d{15}$/.test(y)) return null;
  return Array.from(x).filter((char, i) => char !== y[i]).length;
}
function classificar(c) {
  const contrato = c.imei_contrato_atual || c.imei_contrato_registrado;
  if (conferir(c.imei_fisico_1, contrato) === "SIM" || conferir(c.imei_fisico_2, contrato) === "SIM")
    return "CONFERE COM CONTRATO DO VOUCHER";
  if (c.contrato_outro_voucher_imei1 || c.contrato_outro_voucher_imei2)
    return "IMEI CONSTA EM OUTRO CONTRATO";
  const d1 = distanciaSubstituicoes(c.imei_fisico_1, contrato);
  const d2 = distanciaSubstituicoes(c.imei_fisico_2, contrato);
  const dm = [d1, d2].filter(n => n !== null);
  if (dm.length && Math.min(...dm) <= 2) return "POSSÍVEL ERRO DE DIGITAÇÃO (1–2 DÍGITOS)";
  return "SEM CORRESPONDÊNCIA EXATA";
}
function montarPlanilha(rows) {
  const listaPorVoucher = new Map();
  for (const row of rows) {
    const arr = listaPorVoucher.get(row.voucher) || [];
    arr.push(row);
    listaPorVoucher.set(row.voucher, arr);
  }
  return rows.map(c => {
    const contrato = c.imei_contrato_atual || c.imei_contrato_registrado;
    const outros = [
      ...LISTAR(c.contrato_outro_voucher_imei1),
      ...LISTAR(c.contrato_outro_voucher_imei2),
    ];
    const reciproco = outros.some(voucher =>
      (listaPorVoucher.get(voucher) || []).some(outro => {
        const i1 = NORMALIZAR(outro.imei_fisico_1);
        const i2 = NORMALIZAR(outro.imei_fisico_2);
        return Boolean(contrato) && [i1, i2].includes(NORMALIZAR(contrato));
      })
    );
    return [
      c.caso_id, c.voucher, c.status_caso,
      c.criado_em ? new Date(c.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "",
      c.imei_contrato_atual || "", c.imei_contrato_registrado || "", c.imei_contrato_historico || "",
      c.imei_fisico_1 || "", c.imei_fisico_2 || "",
      c.imei_cadastro_1 || "", c.imei_cadastro_2 || "",
      c.contrato_outro_voucher_imei1 || "", c.contrato_outro_voucher_imei2 || "",
      conferir(c.imei_fisico_1, contrato), conferir(c.imei_fisico_2, contrato),
      classificar(c), reciproco ? "SIM — conferir fisicamente" : "",
      c.modelo_triagem || "", c.modelo_contrato || "", c.sku || "",
      c.tipo_aparelho || "", c.status_produto || "", c.criado_por_nome || "",
      "", "", "", "",
    ];
  });
}
function adicionarAba(workbook, name, headers, rows) {
  const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  worksheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } })
  };
  worksheet["!cols"] = headers.map((header, idx) => ({
    wch: idx === 0 ? 38 : idx === 3 ? 21 :
      idx === 16 ? 29 : idx === 15 ? 42 : idx >= 23 ? 25 :
      header.startsWith("IMEI") ? 22 : header.startsWith("Contrato") ? 30 :
      Math.min(32, Math.max(14, header.length + 3)),
  }));
  XLSX.utils.book_append_sheet(workbook, worksheet, name);
}
export async function exportarBaseValidacaoImei() {
  const { data, error } = await supabase.rpc("assurant_divergencias_imei_base_validacao", {
    p_incluir_resolvidos: false,
  });
  if (error) throw new Error("Falha na consulta dos IMEIs: " + error.message);
  if (!Array.isArray(data) || !data.length) throw new Error("Nenhum caso de IMEI em análise para exportação.");

  const all = montarPlanilha(data);
  const indice = ROW_HEADERS.indexOf("Indício para conferência");
  const cruzados = all.filter(row => row[indice] === "IMEI CONSTA EM OUTRO CONTRATO");
  const demais = all.filter(row => row[indice] !== "IMEI CONSTA EM OUTRO CONTRATO");
  const troca = all.filter(row => String(row[16]).startsWith("SIM")).length;
  const pendentes = data.filter(c => c.status_caso === "pendente").length;
  const reconferencias = data.filter(c => c.status_caso === "reconferencia").length;
  const wb = XLSX.utils.book_new();

  adicionarAba(wb, "Resumo", ["Indicador", "Quantidade"], [
    ["Casos de divergência de IMEI em análise", data.length],
    ["Pendentes", pendentes],
    ["Em reconferência", reconferencias],
    ["IMEI físico identificado em outro contrato", cruzados.length],
    ["Demais divergências", demais.length],
    ["Possível troca cruzada recíproca", troca],
    ["Data de geração", new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })],
    ["Origem", "Supabase: assurant_divergencias_imei + tradein_geral + tradein_historico + assurant_triagem"],
    ["Critério", "O IMEI de contrato atual vem do Trade-In Geral. Histórico e registro original são exibidos separadamente."],
    ["Conferência", "Um IMEI em outro contrato é indício, não comprovação de troca física."],
    ["Uso", "Preencher as colunas Validação manual, IMEI físico correto, Voucher correto e Observações."],
    ["Segurança", "A exportação não altera status, vínculo ou cadastro de nenhum produto."],
  ]);
  adicionarAba(wb, "Todos os casos", ROW_HEADERS, all);
  adicionarAba(wb, "IMEI em outro contrato", ROW_HEADERS, cruzados);
  adicionarAba(wb, "Outras divergencias", ROW_HEADERS, demais);

  XLSX.writeFile(wb, "Validacao_Divergencias_IMEI_" + new Date().toISOString().slice(0,10) + ".xlsx", {
    bookType: "xlsx", compression: true,
  });
  return { total: data.length, cruzados: cruzados.length, demais: demais.length, reciprocos: troca };
}
