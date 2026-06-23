import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

const COLUMN_MAP = {
  "ID ANYMARKET":                          "id_anymarket",
  "TIPO DOCUMENTO":                        "tipo_documento",
  "CPF/CNPJ":                              "cpf_cnpj",
  "CLIENTE":                               "cliente",
  "TELEFONE":                              "telefone",
  "EMAIL":                                 "email",
  "CÓDIGO PEDIDO":                         "codigo_pedido",
  "DATA PEDIDO":                           "data_pedido",
  "MARKETPLACE":                           "marketplace",
  "MUNICÍPIO":                             "municipio",
  "ESTADO":                                "estado",
  "CEP":                                   "cep",
  "LOGRADOURO":                            "logradouro",
  "NÚMERO":                                "numero",
  "COMPLEMENTO":                           "complemento",
  "BAIRRO":                                "bairro",
  "FORMA DE ENTREGA":                      "forma_de_entrega",
  "FRETE DO LOJISTA":                      "frete_do_lojista",
  "STATUS":                                "status",
  "DATA DE PAGAMENTO":                     "data_de_pagamento",
  "FRETE":                                 "frete",
  "DESCONTO":                              "desconto",
  "VALOR TOTAL DOS PRODUTOS":              "valor_total_dos_produtos",
  "TOTAL DO PEDIDO":                       "total_do_pedido",
  "FORMA DE PAGAMENTO":                    "forma_de_pagamento",
  "TÍTULO PRODUTO":                        "titulo_produto",
  "QUANTIDADE":                            "quantidade",
  "VALOR UNITÁRIO":                        "valor_unitario",
  "SKU PRODUTO":                           "sku_produto",
  "EAN PRODUTO":                           "ean_produto",
  "CONTA":                                 "conta",
  "NÚMERO DA NOTA FISCAL":                 "numero_da_nota_fiscal",
  "NÚMERO DE SÉRIE":                       "numero_de_serie",
  "CHAVE DE ACESSO NF":                    "chave_de_acesso_nf",
  "CFOP":                                  "cfop",
  "DATA EMISSÃO NF":                       "data_emissao_nf",
  "TRANSPORTADORA":                        "transportadora",
  "CÓDIGO DE RASTREIO":                    "codigo_de_rastreio",
  "DATA OCORRENCIA":                       "data_ocorrencia",
  "QUEM RETIRA":                           "quem_retira",
  "CÓDIGO DA LOJA NO MARKETPLACE":         "codigo_da_loja_no_marketplace",
  "NOME DA LOJA":                          "nome_da_loja",
  "CÓD. NO MARKETPLACE":                   "cod_no_marketplace",
  "STATUS NO MARKETPLACE":                 "status_no_marketplace",
  "ENTREGA ESPERADA":                      "entrega_esperada",
  "PREVISÃO ENTREGA":                      "previsao_entrega",
  "URL DE RASTREIO":                       "url_de_rastreio",
  "DATA ENTREGA":                          "data_entrega",
  "DATA ENTREGA NA TRANSPORTADORA":        "data_entrega_na_transportadora",
  "INSCRIÇÃO ESTADUAL":                    "inscricao_estadual",
  "MOTIVO DO CANCELAMENTO":               "motivo_do_cancelamento",
  "BANDEIRA":                              "bandeira",
  "NOME DA LOJA OFICIAL":                  "nome_da_loja_oficial",
  "ORIGEM CANCELAMENTO":                   "origem_cancelamento",
  "DATA DE CANCELAMENTO":                  "data_de_cancelamento",
  "QUANTIDADE PARCELAS":                   "quantidade_parcelas",
  "TIPO DE LISTAGEM":                      "tipo_de_listagem",
  "CÓD. ENTREGA":                          "cod_entrega",
  "CÓD. PLATAFORMA":                       "cod_plataforma",
  "NÚMERO NO PARCEIRO":                    "numero_no_parceiro",
  "FRETE GRÁTIS":                          "frete_gratis",
  "SKU KIT":                               "sku_kit",
  "É KIT":                                 "e_kit",
  "FULFILLMENT":                           "fulfillment",
  "DESCONTO DO PRODUTO":                   "desconto_do_produto",
  "ID DE PAGAMENTO DO MARKETPLACE":        "id_de_pagamento_do_marketplace",
  "JUROS":                                 "juros",
  "DESCONTO DO MARKETPLACE (METADATA)":   "desconto_do_marketplace_metadata",
  "SKU DO PRODUTO NO MARKETPLACE":         "sku_do_produto_no_marketplace",
  "PRODUTO É CATÁLOGO":                    "produto_e_catalogo",
  "SKU QUE ORIGINOU O CATÁLOGO":           "sku_que_originou_o_catalogo",
  "ALERTA NA IMPORTAÇÃO":                  "alerta_na_importacao",
  "RISCO DE CANCELAMENTO":                 "risco_de_cancelamento",
  "STATUS DA ENTREGA":                     "status_da_entrega",
  "STATUS DA ENTREGA NO MARKETPLACE":      "status_da_entrega_no_marketplace",
  "SUBSTATUS DA ENTREGA NO MARKETPLACE":   "substatus_da_entrega_no_marketplace",
  "TAXAS TOTAL DO MARKETPLACE":            "taxas_total_do_marketplace",
  "TAXAS TOTAL DO MEIO DE PAGAMENTO":      "taxas_total_do_meio_de_pagamento",
  "CÓDIGO DO PEDIDO (PARA PEDIDO CARRINHO)": "codigo_do_pedido_para_pedido_carrinho",
  "CONDIÇÃO DO PRODUTO":                   "condicao_do_produto",
  "TIPO DEVOLUÇÃO":                        "tipo_devolucao",
  "TAXAS DO MARKETPLACE":                  "taxas_do_marketplace",
  "TAXAS DO MEIO DE PAGAMENTO":            "taxas_do_meio_de_pagamento",
  "DATA DE IMPORTAÇÃO":                    "data_de_importacao",
  "UF DO ESTADO":                          "uf_do_estado",
  "NOME DO ESTADO":                        "nome_do_estado",
  "TIPO LOGÍSTICA":                        "tipo_logistica",
  "TIPO LOGÍSTICA MARKETPLACE":            "tipo_logistica_marketplace",
  "LOCAL ESTOQUE":                         "local_estoque",
  "DATA LIMITE DE ENVIO":                  "data_limite_de_envio",
  "DATA AGENDAMENTO DE ENVIO":             "data_agendamento_de_envio",
  "FALHA":                                 "falha",
  "CUSTOMIZAÇÕES":                         "customizacoes",
  "PACOTES":                               "pacotes",
};

const NUMERIC_FIELDS = new Set([
  "id_anymarket", "frete_do_lojista", "frete", "desconto",
  "valor_total_dos_produtos", "total_do_pedido", "quantidade",
  "valor_unitario", "desconto_do_produto", "juros",
  "desconto_do_marketplace_metadata", "taxas_total_do_marketplace",
  "taxas_total_do_meio_de_pagamento", "taxas_do_marketplace",
  "taxas_do_meio_de_pagamento",
]);

function parseVal(field, val) {
  if (val === null || val === undefined || val === "") return null;
  if (NUMERIC_FIELDS.has(field)) {
    const n = parseFloat(String(val).replace(/,/g, "."));
    return isNaN(n) ? null : n;
  }
  return String(val).trim() || null;
}

function mapRow(rawHeaders, values, userId) {
  const row = { importado_por: userId };
  rawHeaders.forEach((h, i) => {
    const col = COLUMN_MAP[String(h).trim()];
    if (!col) return;
    row[col] = parseVal(col, values[i]);
  });
  return row;
}

export async function uploadAnymarketZip(file, userId, onProgress) {
  // Extrai o xlsx do zip
  const JSZip = (await import("jszip")).default;
  const zipData = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(zipData);

  const xlsxEntry = Object.values(zip.files).find(f =>
    f.name.endsWith(".xlsx") || f.name.endsWith(".xls")
  );
  if (!xlsxEntry) throw new Error("Nenhum arquivo .xlsx encontrado no zip.");

  const xlsxBuffer = await xlsxEntry.async("arraybuffer");
  const wb = XLSX.read(xlsxBuffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

  if (!allRows.length) throw new Error("Planilha vazia.");

  const headers = allRows[0];
  const dataRows = allRows.slice(1).filter(r => r.some(v => v !== null));

  if (!dataRows.length) throw new Error("Nenhuma linha de dados encontrada.");

  // Coleta IDs já existentes para upsert inteligente
  const ids = dataRows
    .map(r => {
      const idIdx = headers.indexOf("ID ANYMARKET");
      return idIdx >= 0 ? parseFloat(r[idIdx]) : null;
    })
    .filter(Boolean);

  const rows = dataRows.map(r => mapRow(headers, r, userId));

  // Upsert em chunks de 500
  const CHUNK = 500;
  let inserted = 0;
  let atualizados = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error, data } = await supabase
      .from("anymarket_pedidos")
      .upsert(chunk, { onConflict: "id_anymarket", ignoreDuplicates: false })
      .select("id_anymarket");

    if (error) throw new Error(`Erro ao inserir lote ${i / CHUNK + 1}: ${error.message}`);

    inserted += chunk.length;
    if (onProgress) onProgress({ inserted, total: rows.length });
  }

  return { total: rows.length, arquivo: xlsxEntry.name };
}

export async function buscarPedidoAnymarket(idAnymarket) {
  const { data, error } = await supabase
    .from("anymarket_pedidos")
    .select("*")
    .eq("id_anymarket", idAnymarket)
    .single();
  if (error) return null;
  return data;
}