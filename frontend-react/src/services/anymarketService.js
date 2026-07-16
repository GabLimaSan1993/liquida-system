import * as XLSX from "xlsx";
import JSZip from "jszip";
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
  "MOTIVO DO CANCELAMENTO":                "motivo_do_cancelamento",
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
  "DESCONTO DO MARKETPLACE (METADATA)":    "desconto_do_marketplace_metadata",
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

export const GRADE_ORDEM = {
  "like new":           1,
  "excelente":          2,
  "muito bom":          3,
  "bom":                4,
  "outlet":             5,
  "outlet bateria 70%": 5,
};

export function extrairGrade(tituloProduto) {
  if (!tituloProduto) return null;
  const partes = tituloProduto.split(" - ");
  if (partes.length < 2) return null;
  return partes[partes.length - 1].trim();
}

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

async function sincronizarPedidosB2C(rows, horaCorte, userId) {
  const pedidoMap = new Map();
  for (const row of rows) {
    const id = row.id_anymarket;
    if (!id) continue;
    if (!pedidoMap.has(id)) {
      pedidoMap.set(id, row);
    } else {
      const existing = pedidoMap.get(id);
      if (row.status && row.status !== existing.status) {
        pedidoMap.set(id, { ...existing, status: row.status });
      }
    }
  }

  const pedidos = Array.from(pedidoMap.values());

  // Busca os já existentes em BLOCOS. Mandar todos os ids de uma vez monta uma URL
  // gigante e a requisição falha — e, se falhasse em silêncio, todo pedido seria tratado
  // como novo e a base inteira duplicaria (aconteceu em 16/07/2026).
  // Por isso: fatia em blocos E aborta no erro, em vez de seguir com a lista vazia.
  const existentes = [];
  const idsTodos = pedidos.map(p => p.id_anymarket);
  const BLOCO_IDS = 200;
  for (let i = 0; i < idsTodos.length; i += BLOCO_IDS) {
    const bloco = idsTodos.slice(i, i + BLOCO_IDS);
    const { data, error } = await supabase
      .from("pedidos_b2c")
      .select("id, id_anymarket, status, status_anymarket, codigo_de_rastreio")
      .in("id_anymarket", bloco);
    if (error) {
      throw new Error(
        `Falha ao verificar pedidos já existentes (bloco ${i / BLOCO_IDS + 1}): ${error.message}. ` +
        `Nenhum pedido foi criado — tente novamente.`
      );
    }
    existentes.push(...(data || []));
  }

  const existentesMap = new Map(existentes.map(e => [e.id_anymarket, e]));

  const paraInserir  = [];
  const paraAtualizar = [];
  let ignorados = 0;
  let inalterados = 0;

  for (const pedido of pedidos) {
    const grade = extrairGrade(pedido.titulo_produto);
    const registro = {
      id_anymarket:       pedido.id_anymarket,
      hora_corte:         horaCorte || null,
      cpf_cnpj:           pedido.cpf_cnpj,
      cliente:            pedido.cliente,
      telefone:           pedido.telefone,
      email:              pedido.email,
      marketplace:        pedido.marketplace,
      data_pedido:        pedido.data_pedido,
      data_de_pagamento:  pedido.data_de_pagamento,
      titulo_produto:     pedido.titulo_produto,
      sku_produto:        pedido.sku_produto,
      grade_produto:      grade,
      valor_unitario:     pedido.valor_unitario,
      total_do_pedido:    pedido.total_do_pedido,
      codigo_de_rastreio: pedido.codigo_de_rastreio,
      logradouro:         pedido.logradouro,
      numero:             pedido.numero,
      complemento:        pedido.complemento,
      bairro:             pedido.bairro,
      municipio:          pedido.municipio,
      estado:             pedido.estado,
      cep:                pedido.cep,
      criado_por:         userId,
      atualizado_em:      new Date().toISOString(),
    };

    const existente = existentesMap.get(pedido.id_anymarket);

    if (existente) {
      // Só atualiza quem REALMENTE mudou. Cada update é um request próprio; mandar
      // a base inteira a cada hora de corte seriam milhares de chamadas em fila
      // (minutos de tela travada). Numa hora típica, só um punhado muda de status.
      const mudouStatus   = (pedido.status ?? null) !== (existente.status_anymarket ?? null);
      const mudouRastreio = (pedido.codigo_de_rastreio ?? null) !== (existente.codigo_de_rastreio ?? null);
      if (mudouStatus || mudouRastreio) {
        paraAtualizar.push({
          id:                 existente.id,
          status_anymarket:   pedido.status,
          codigo_de_rastreio: pedido.codigo_de_rastreio,
          data_entrega:       pedido.data_entrega,
          atualizado_em:      new Date().toISOString(),
        });
      } else {
        inalterados++;
      }
    } else if (pedido.status === "Pago") {
      // Só entra na fila quem está PAGO. Um export completo traz Cancelado/Entregue/
      // Enviado de semanas atrás — criar pedido para eles inunda a operação com fantasmas.
      registro.status          = "aguardando_alocacao";
      registro.status_anymarket = pedido.status;
      paraInserir.push(registro);
    } else {
      // Linha nova que não está Paga: não vira pedido. Fica registrada na
      // anymarket_pedidos como histórico.
      ignorados++;
    }
  }

  const CHUNK = 500;
  let inseridos = 0;
  for (let i = 0; i < paraInserir.length; i += CHUNK) {
    const chunk = paraInserir.slice(i, i + CHUNK);
    const { error } = await supabase.from("pedidos_b2c").insert(chunk);
    if (error) throw new Error(`Erro ao inserir pedidos B2C: ${error.message}`);
    inseridos += chunk.length;
  }

  let atualizados = 0;
  for (const upd of paraAtualizar) {
    const { id, ...campos } = upd;
    const { error } = await supabase
      .from("pedidos_b2c")
      .update(campos)
      .eq("id", id);
    if (error) console.warn(`Erro ao atualizar pedido ${id}: ${error.message}`);
    else atualizados++;
  }

  return { inseridos, atualizados, ignorados, inalterados };
}

export async function uploadAnymarketZip(file, userId, horaCorte, onProgress) {
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
  const rows = allRows
    .slice(1)
    .filter(r => r.some(v => v !== null))
    .map(r => mapRow(headers, r, userId))
    .filter(r => r.id_anymarket != null);

  if (!rows.length) throw new Error("Nenhum registro válido encontrado.");

  const CHUNK = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error } = await supabase
      .from("anymarket_pedidos")
      .insert(chunk);

    if (error) throw new Error(`Erro ao inserir lote ${i / CHUNK + 1}: ${error.message}`);

    inserted += chunk.length;
    if (onProgress) onProgress({ inserted, total: rows.length, fase: "anymarket" });
  }

  if (onProgress) onProgress({ inserted: 0, total: 1, fase: "b2c" });

  const { inseridos, atualizados, ignorados, inalterados } = await sincronizarPedidosB2C(rows, horaCorte, userId);

  if (onProgress) onProgress({ inserted: 1, total: 1, fase: "b2c" });

  return { total: rows.length, arquivo: xlsxEntry.name, inseridos, atualizados, ignorados, inalterados };
}

export async function buscarPedidoAnymarket(idAnymarket) {
  const { data, error } = await supabase
    .from("anymarket_pedidos")
    .select("*")
    .eq("id_anymarket", idAnymarket)
    .limit(1)
    .single();
  if (error) return null;
  return data;
}