import { supabase } from "../lib/supabase";
import { buscarSugestaoFifo } from "./pedidosB2CService.js";

// ════════════════════════════════════════════════════════
// Parsing do SKU AnyMarket: extrai SKU limpo + grade-alvo do sufixo -ccN
//   sem sufixo  -> grade EXCELENTE/LIKE NEW
//   -cc2        -> MUITO BOM
//   -cc3        -> BOM
//   -cc4        -> OUTLET (bateria 70-79%)
// Qualquer texto extra após o SKU vira observação.
// ════════════════════════════════════════════════════════
export function parseSkuGrade(bruto) {
  if (!bruto) return { sku: "", gradeAlvo: null, obs: null };
  const texto = String(bruto).trim();

  const m = texto.match(/^(BRZDEV\d+)/i);
  if (!m) return { sku: texto, gradeAlvo: null, obs: null };

  const sku  = m[1].toUpperCase();
  let resto  = texto.slice(m[1].length).trim();

  // Detecta o sufixo -ccN (logo após o SKU)
  const cc = resto.match(/^-cc(\d+)/i);
  let gradeAlvo;
  if (cc) {
    const n = cc[1];
    gradeAlvo = n === "2" ? "MUITO BOM"
              : n === "3" ? "BOM"
              : n === "4" ? "OUTLET"
              : "EXCELENTE/LIKE NEW"; // cc1 ou outros = topo de linha
    resto = resto.replace(/^-cc\d+/i, "").trim();
  } else {
    gradeAlvo = "EXCELENTE/LIKE NEW"; // sem sufixo
  }

  const obs = resto.replace(/^[\s\-,;]+/, "").trim();
  return { sku, gradeAlvo, obs: obs || null };
}

export async function criarTroca(dados, skus, userId) {
  const { data: troca, error } = await supabase
    .from("trocas_b2c_assurant")
    .insert({
      id_anymarket:          dados.id_anymarket,
      nome_cliente:          dados.nome_cliente,
      cpf:                   dados.cpf,
      endereco:              dados.endereco,
      endereco_cep:          dados.endereco_cep,
      endereco_rua:          dados.endereco_rua,
      endereco_numero:       dados.endereco_numero,
      endereco_complemento:  dados.endereco_complemento,
      endereco_bairro:       dados.endereco_bairro,
      endereco_cidade:       dados.endereco_cidade,
      endereco_estado:       dados.endereco_estado,
      produto_original:      dados.produto_original,
      produto_condicao:      dados.produto_condicao,
      produto_grade:         dados.produto_grade,
      status:                "em_aberto",
      criado_por:            userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);

  if (skus?.length > 0) {
    const { error: errSkus } = await supabase
      .from("trocas_b2c_assurant_skus")
      .insert(
        skus.map((s, idx) => {
          const { sku, gradeAlvo, obs } = parseSkuGrade(s.sku);
          return {
            troca_id:   troca.id,
            sku,
            descricao:  s.descricao || null,
            // grade manual do operador prevalece; senão usa a derivada do sufixo
            grade:      s.grade || null,
            grade_alvo: s.grade || gradeAlvo || null,
            observacao: s.observacao?.trim() || obs || null,
            ordem:      idx,
          };
        })
      );
    if (errSkus) throw new Error(errSkus.message);
  }

  return troca;
}

export async function listarTrocas(filtroStatus = null) {
  let query = supabase
    .from("trocas_b2c_assurant")
    .select("*, trocas_b2c_assurant_skus(*), trocas_b2c_assurant_operacao(*)")
    .order("criado_em", { ascending: false });

  if (filtroStatus) query = query.eq("status", filtroStatus);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data || [];
}

export async function buscarTroca(id) {
  const { data, error } = await supabase
    .from("trocas_b2c_assurant")
    .select("*, trocas_b2c_assurant_skus(*), trocas_b2c_assurant_operacao(*)")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function atualizarStatusTroca(id, status) {
  const { error } = await supabase
    .from("trocas_b2c_assurant")
    .update({ status })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function salvarOperacao(trocaId, dados, userId) {
  const { data: existente } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("id")
    .eq("troca_id", trocaId)
    .single();

  if (existente) {
    const { error } = await supabase
      .from("trocas_b2c_assurant_operacao")
      .update({ ...dados, atualizado_em: new Date().toISOString(), atualizado_por: userId })
      .eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_assurant_operacao")
      .insert({ troca_id: trocaId, ...dados, atualizado_por: userId });
    if (error) throw new Error(error.message);
  }
}

export async function buscarDescricaoPorSku(sku) {
  if (!sku || sku.trim().length < 4) return null;
  // Limpa o sufixo antes de buscar, para casar com a triagem
  const { sku: skuLimpo } = parseSkuGrade(sku.trim());
  const { data } = await supabase
    .from("assurant_triagem")
    .select("sku, modelo")
    .eq("sku", skuLimpo)
    .limit(1)
    .single();
  return data?.modelo || null;
}

// ════════════════════════════════════════════════════════
// SUGESTÃO FIFO (visão Oracle via estoque_subinv)
// Passa a grade_alvo de cada SKU para a RPC, que destaca/filtra.
// ════════════════════════════════════════════════════════
// A grade das trocas é gravada em caixa alta e com a variante "EXCELENTE/LIKE NEW";
// o FIFO do B2C espera a grade como aparece no pedido.
function gradeParaB2C(gradeAlvo) {
  const g = String(gradeAlvo || "").trim().toUpperCase();
  if (!g) return null;
  if (g.startsWith("EXCELENTE")) return "Excelente";
  if (g === "LIKE NEW")          return "Like New";
  if (g === "MUITO BOM")         return "Muito Bom";
  if (g === "BOM")               return "Bom";
  if (g.startsWith("OUTLET"))    return "Outlet";
  return gradeAlvo;
}

// IMEIs já presos a outra troca (o FIFO do B2C só enxerga pedidos_b2c).
async function imeisEmTroca() {
  const { data } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("imei, status_furbtech")
    .not("imei", "is", null);
  const usados = new Set();
  (data || []).forEach(o => {
    if (o.status_furbtech !== "reprovado") usados.add(String(o.imei).trim());
  });
  return usados;
}

// Antes isto chamava a RPC buscar_fifo_sku, que aceitava status não alocáveis
// ("Finalizado", "Reservado para pedido B2C") e checava a tabela errada na trava
// de dono. Reusar a função do B2C mantém uma regra só: quando corrigimos lá,
// vale aqui também — status, subinv, local, WH2, grade, bateria e dono.
export async function buscarSugestoesFIFO(skus, limite = 5, excluirImeis = []) {
  if (!skus?.length) return {};

  const emTroca = await imeisEmTroca();
  const excluir = new Set([...emTroca, ...excluirImeis.map(i => String(i).trim())]);

  const resultado = {};
  for (const skuObj of skus) {
    const bruto = skuObj.sku?.trim();
    if (!bruto) continue;

    const { sku: skuLimpo } = parseSkuGrade(bruto);
    const gradeAlvo = skuObj.grade_alvo || parseSkuGrade(bruto).gradeAlvo || null;

    try {
      // O -CCx do SKU original já codifica a grade; passa o SKU cru para o FIFO
      // aproveitar a mesma leitura que faz nos pedidos.
      const candidatos = await buscarSugestaoFifo(bruto, gradeParaB2C(gradeAlvo));
      resultado[skuLimpo] = {
        erro: null,
        gradeAlvo,
        observacao: skuObj.observacao || null,
        candidatos: (candidatos || [])
          .filter(c => !excluir.has(String(c.imei).trim()))
          .slice(0, limite),
      };
    } catch (e) {
      resultado[skuLimpo] = { erro: e.message, candidatos: [], gradeAlvo };
    }
  }
  return resultado;
}

// Retrocompatibilidade
export async function buscarSugestoesPorSku(skus) {
  const fifo = await buscarSugestoesFIFO(skus, 5);
  const legado = {};
  for (const [sku, info] of Object.entries(fifo)) {
    legado[sku] = info.candidatos || [];
  }
  return legado;
}

export async function validarImeiTroca(imei, skusAceitos) {
  const imeiTrim = String(imei).trim();

  const { data: triagem } = await supabase
    .from("assurant_triagem")
    .select("imei, sku, modelo, local, grade, status_atual, status_bateria, criado_em")
    .eq("imei", imeiTrim)
    .order("criado_em", { ascending: false })
    .limit(1)
    .single();

  if (!triagem) return { ok: false, erro: "IMEI não encontrado na base Assurant." };

  // Compara contra os SKUs aceitos já limpos
  const skusAceitosLimpos = skusAceitos
    .map(s => parseSkuGrade(s.sku?.trim() || "").sku)
    .filter(Boolean);
  if (!skusAceitosLimpos.includes(triagem.sku)) {
    return {
      ok: false,
      erro: `SKU do aparelho (${triagem.sku}) não está na lista de SKUs aceitos para esta troca.`,
    };
  }

  const { data: subinv } = await supabase
    .from("estoque_subinv")
    .select("imei, data_subinv")
    .eq("imei", imeiTrim)
    .single();

  if (!subinv) return { ok: false, erro: "IMEI não está no estoque Oracle (subinventory) — indisponível." };

  const { data: b2bItem } = await supabase
    .from("b2b_itens")
    .select("id, status")
    .eq("imei", imeiTrim)
    .in("status", ["pendente", "bipado"])
    .single();

  if (b2bItem) return { ok: false, erro: "IMEI reservado em pedido B2B ativo — não disponível para troca." };

  const { data: trocaAtiva } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("id")
    .eq("imei", imeiTrim)
    .in("status_furbtech", ["em_separacao", "faturado", "postado"])
    .single();

  if (trocaAtiva) return { ok: false, erro: "IMEI já está sendo usado em outra troca B2C." };

  const agingOracle = Math.floor(
    (new Date() - new Date(subinv.data_subinv)) / (1000 * 60 * 60 * 24)
  );

  return { ok: true, item: { ...triagem, data_subinv: subinv.data_subinv, aging_oracle: agingOracle } };
}

// ════════════════════════════════════════════════════════
// ALOCAÇÃO (aba Trocas) → SEPARAÇÃO (aba Separação)
//
// São dois momentos distintos: quem atende escolhe a peça do FIFO (alocação) e
// o separador vai na rua buscar e bipa (separação). Antes as duas coisas
// aconteciam no mesmo passo, o que obrigava o separador a decidir o aparelho.
// ════════════════════════════════════════════════════════

// Escolhe a peça do FIFO e reserva. A troca passa a aparecer na aba Separação.
export async function alocarTroca(trocaId, imei, skuEscolhido, userId) {
  const imeiTrim = String(imei || "").trim();
  if (!imeiTrim) return { ok: false, erro: "IMEI vazio." };

  // Ninguém mais pode estar com esta peça
  const { data: emUso } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("troca_id, status_furbtech")
    .eq("imei", imeiTrim);
  const ocupada = (emUso || []).find(
    o => o.troca_id !== trocaId && o.status_furbtech !== "reprovado",
  );
  if (ocupada) return { ok: false, erro: "Este aparelho já está em outra troca." };

  const { data: noPedido } = await supabase
    .from("pedidos_b2c")
    .select("id_anymarket")
    .eq("imei_alocado", imeiTrim)
    .in("status", ["alocado", "em_picking", "embalado", "em_analise", "aguardando_definicao_produto"])
    .limit(1);
  if (noPedido?.length) {
    return { ok: false, erro: `Aparelho já alocado no pedido #${noPedido[0].id_anymarket}.` };
  }

  const agora = new Date().toISOString();
  const payload = {
    sku_escolhido:   skuEscolhido,
    imei:            imeiTrim,
    status_furbtech: "alocado",
    teste_resultado: null,
    atualizado_em:   agora,
    atualizado_por:  userId,
  };

  const { data: existente } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("id").eq("troca_id", trocaId).maybeSingle();

  if (existente) {
    const { error } = await supabase
      .from("trocas_b2c_assurant_operacao").update(payload).eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_assurant_operacao").insert({ troca_id: trocaId, ...payload });
    if (error) throw new Error(error.message);
  }

  await supabase
    .from("assurant_triagem")
    .update({ status_atual: "Reservado para pedido B2C", atualizado_em: agora })
    .eq("imei", imeiTrim);

  return { ok: true, imei: imeiTrim };
}

// Traz o endereço de cada peça alocada, para a lista da separação e o filtro de rua.
export async function listarParaSeparacao() {
  const { data: ops } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("troca_id, imei, sku_escolhido, status_furbtech")
    .in("status_furbtech", ["alocado"])
    .not("imei", "is", null);
  if (!ops?.length) return {};

  const imeis = ops.map(o => o.imei);
  const locais = {};
  const BLOCO = 200;
  for (let i = 0; i < imeis.length; i += BLOCO) {
    const { data: tri } = await supabase
      .from("assurant_triagem")
      .select("imei, local, modelo, grade, voucher, criado_em")
      .in("imei", imeis.slice(i, i + BLOCO))
      .order("criado_em", { ascending: false });
    (tri || []).forEach(t => { if (!locais[t.imei]) locais[t.imei] = t; });
  }

  const mapa = {};
  ops.forEach(o => {
    mapa[o.troca_id] = { ...o, ...(locais[o.imei] || {}) };
  });
  return mapa;
}

// O separador achou a peça e bipou: confere se é a alocada e libera para o teste.
export async function confirmarSeparacao(trocaId, imeiBipado, userId) {
  const bipado = String(imeiBipado || "").trim();
  const { data: op } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("imei").eq("troca_id", trocaId).single();

  if (!op?.imei) return { ok: false, erro: "Esta troca ainda não tem aparelho alocado." };
  if (String(op.imei).trim() !== bipado) {
    return { ok: false, erro: `IMEI diferente do alocado (${op.imei}).` };
  }

  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .update({
      data_separacao:  agora.split("T")[0],
      status_furbtech: "em_separacao",
      atualizado_em:   agora,
      atualizado_por:  userId,
    })
    .eq("troca_id", trocaId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Separador foi na rua e não achou a peça. Diferente da reprovação no teste:
// aqui o aparelho NÃO volta como disponível — se ninguém acha, o endereço está
// errado ou ele sumiu, então sai do pool até alguém conferir. A troca volta para
// a aba Trocas para receber outra alocação, sem repetir este IMEI.
export async function naoLocalizadoSeparacao(trocaId, userId, observacao) {
  const { data: op } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("imei, tentativas").eq("troca_id", trocaId).single();
  if (!op?.imei) return { ok: false, erro: "Nenhum aparelho alocado nesta troca." };

  const agora = new Date().toISOString();
  const imeiSumido = String(op.imei).trim();

  await supabase
    .from("assurant_triagem")
    .update({ status_atual: "Em análise de estoque", atualizado_em: agora })
    .eq("imei", imeiSumido);

  const tentativas = [
    ...(Array.isArray(op.tentativas) ? op.tentativas : []),
    {
      imei: imeiSumido,
      motivos: ["Não localizado na separação" + (observacao ? ` — ${observacao}` : "")],
      em: agora,
      por: userId || null,
      tipo: "nao_localizado",
    },
  ];

  const { error } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .update({
      imei:            null,
      sku_escolhido:   null,
      data_separacao:  null,
      status_furbtech: "nao_localizado",
      tentativas,
      atualizado_em:   agora,
      atualizado_por:  userId,
    })
    .eq("troca_id", trocaId);
  if (error) throw new Error(error.message);

  return { ok: true, imeiSumido, jaTentados: tentativas.map(t => t.imei) };
}

export async function registrarSeparacao(trocaId, imei, skuEscolhido, userId) {
  const { data: existente } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("id")
    .eq("troca_id", trocaId)
    .single();

  const payload = {
    sku_escolhido:   skuEscolhido,
    imei,
    data_separacao:  new Date().toISOString().split("T")[0],
    status_furbtech: "em_separacao",
    atualizado_em:   new Date().toISOString(),
    atualizado_por:  userId,
  };

  if (existente) {
    const { error } = await supabase
      .from("trocas_b2c_assurant_operacao").update(payload).eq("troca_id", trocaId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("trocas_b2c_assurant_operacao").insert({ troca_id: trocaId, ...payload });
    if (error) throw new Error(error.message);
  }

  await atualizarStatusTroca(trocaId, "em_aberto");
}

// ════════════════════════════════════════════════════════
// FATURAMENTO — planilha e importação dos XMLs (igual ao B2C)
// ════════════════════════════════════════════════════════

// Baixa a planilha das trocas prontas para faturar (aprovadas no teste).
// Trocas não têm agrupamento como os pedidos B2C, então sai tudo de uma vez.
// trocaId opcional: com ele a planilha sai só daquela troca (uma linha).
export async function gerarPlanilhaTrocas(trocaId = null) {
  const { data: trocas, error } = await supabase
    .from("trocas_b2c_assurant")
    .select("*, trocas_b2c_assurant_skus(*), trocas_b2c_assurant_operacao(*)")
    .order("data_solicitacao", { ascending: true });
  if (error) throw new Error(error.message);

  const prontas = (trocas || []).filter(t => {
    if (trocaId && t.id !== trocaId) return false;
    const op = t.trocas_b2c_assurant_operacao?.[0];
    return op?.imei && (trocaId ? true : op.status_furbtech === "aprovado" && !op.nf);
  });
  if (!prontas.length) {
    return { ok: false, erro: trocaId
      ? "Esta troca ainda não tem aparelho separado."
      : "Nenhuma troca aprovada aguardando faturamento." };
  }

  // O voucher vive na triagem — busca pelo IMEI, em blocos de 200.
  const imeis = [...new Set(prontas.map(t => t.trocas_b2c_assurant_operacao[0].imei))];
  const voucherPorImei = {};
  for (let i = 0; i < imeis.length; i += 200) {
    const { data: tri } = await supabase
      .from("assurant_triagem")
      .select("imei, voucher, criado_em")
      .in("imei", imeis.slice(i, i + 200))
      .order("criado_em", { ascending: false });
    (tri || []).forEach(t => {
      if (t.voucher && !voucherPorImei[t.imei]) voucherPorImei[t.imei] = t.voucher;
    });
  }

  const rows = prontas.map(t => {
    const op  = t.trocas_b2c_assurant_operacao[0];
    const sku = (t.trocas_b2c_assurant_skus || []).sort((a, b) => a.ordem - b.ordem)[0] || {};
    return {
      "ID_TROCA":           t.id,
      "PEDIDO_ANY":         t.id_anymarket || "",
      "CLIENTE":            t.nome_cliente || "",
      "CPF":                t.cpf || "",
      "ENDERECO":           t.endereco || "",
      "PRODUTO_ORIGINAL":   t.produto_original || "",
      "SKU_SUBSTITUTO":     op.sku_escolhido || t.novo_sku || sku.sku || "",
      "PRODUTO_SUBSTITUTO": t.produto_substituto || sku.descricao || "",
      "GRADE":              sku.grade_alvo || sku.grade || "",
      "IMEI":               op.imei || "",
      "VOUCHER":            voucherPorImei[op.imei] || "",
      "VALOR":              t.valor_total != null
        ? Number(t.valor_total).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "",
      "NUMERO_NF":          "",
    };
  });

  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Trocas");
  const hoje = new Date().toISOString().split("T")[0];
  const nomeArquivo = trocaId
    ? `troca_${prontas[0].id_anymarket || hoje}.xlsx`
    : `faturamento_trocas_${hoje}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  return { ok: true, total: rows.length, nomeArquivo };
}

// O IMEI vem no fim da descrição do produto (xProd). <nProt> também tem 15 dígitos,
// por isso o IMEI é lido só de dentro de det/prod/xProd, nunca do XML inteiro.
function imeiDoXProd(xProd) {
  const m = String(xProd || "").match(/(\d{15})\s*$/);
  return m ? m[1] : null;
}

function parseNFeXml(texto) {
  const doc = new DOMParser().parseFromString(texto, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return null;
  const um = (ctx, tag) => ctx?.getElementsByTagNameNS("*", tag)[0]?.textContent?.trim() || null;

  const infNFe = doc.getElementsByTagNameNS("*", "infNFe")[0];
  if (!infNFe) return null;
  const ide = infNFe.getElementsByTagNameNS("*", "ide")[0];
  const chave = um(doc, "chNFe")
    || String(infNFe.getAttribute("Id") || "").replace(/^NFe/i, "") || null;

  const itens = [];
  const dets = infNFe.getElementsByTagNameNS("*", "det");
  for (let i = 0; i < dets.length; i++) {
    const prod = dets[i].getElementsByTagNameNS("*", "prod")[0];
    if (!prod) continue;
    const xProd = um(prod, "xProd") || "";
    itens.push({ imei: imeiDoXProd(xProd), xProd });
  }
  return { numeroNf: um(ide, "nNF"), serie: um(ide, "serie"), chave, itens };
}

// Sobe XMLs (um .xml ou um .zip com vários) e fatura casando pelo IMEI.
// trocaId opcional: restringe o casamento àquela troca, evitando que um XML de
// outra nota no mesmo arquivo fature a troca errada.
export async function importarXmlsTrocas(file, userId, trocaId = null) {
  const arquivos = [];
  if (/\.zip$/i.test(file.name)) {
    const JSZip = (await import("jszip")).default;
    const zip = await JSZip.loadAsync(file);
    for (const nome of Object.keys(zip.files)) {
      const entrada = zip.files[nome];
      if (entrada.dir || !/\.xml$/i.test(nome)) continue;
      arquivos.push({ nome: nome.split("/").pop(), texto: await entrada.async("string") });
    }
    if (!arquivos.length) throw new Error("Nenhum arquivo .xml dentro do ZIP.");
  } else {
    arquivos.push({ nome: file.name, texto: await file.text() });
  }

  let q = supabase
    .from("trocas_b2c_assurant_operacao")
    .select("troca_id, imei, nf")
    .not("imei", "is", null);
  if (trocaId) q = q.eq("troca_id", trocaId);
  const { data: ops } = await q;
  const porImei = {};
  (ops || []).forEach(o => { porImei[String(o.imei).trim()] = o; });

  let faturadas = 0, totalItens = 0;
  const ignorados = [];

  for (const arq of arquivos) {
    const nfe = parseNFeXml(arq.texto);
    if (!nfe) { ignorados.push({ arquivo: arq.nome, motivo: "XML inválido ou fora do padrão NF-e" }); continue; }
    if (!nfe.itens.length) { ignorados.push({ arquivo: arq.nome, motivo: "NF sem itens" }); continue; }

    for (const item of nfe.itens) {
      totalItens++;
      if (!item.imei) {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, motivo: "IMEI não encontrado na descrição" });
        continue;
      }
      const op = porImei[item.imei];
      if (!op) {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, imei: item.imei, motivo: "IMEI não está em nenhuma troca" });
        continue;
      }
      if (op.nf) {
        ignorados.push({ arquivo: arq.nome, nf: nfe.numeroNf, imei: item.imei, motivo: `Já faturada com a NF ${op.nf}` });
        continue;
      }

      const agora = new Date().toISOString();
      const { error } = await supabase
        .from("trocas_b2c_assurant_operacao")
        .update({
          nf:              nfe.numeroNf,
          data_nf:         agora.split("T")[0],
          status_furbtech: "faturado",
          atualizado_em:   agora,
          atualizado_por:  userId,
        })
        .eq("troca_id", op.troca_id);
      if (error) throw new Error(error.message);
      faturadas++;
    }
  }

  return { ok: true, faturadas, totalItens, arquivos: arquivos.length, ignorados };
}

export async function registrarFaturamento(trocaId, dados, userId) {
  const { error } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .update({
      nf:              dados.nf,
      aut_postagem:    dados.aut_postagem,
      rastreio:        dados.rastreio,
      status_furbtech: dados.rastreio ? "postado" : "faturado",
      atualizado_em:   new Date().toISOString(),
      atualizado_por:  userId,
    })
    .eq("troca_id", trocaId);

  if (error) throw new Error(error.message);

  await atualizarStatusTroca(trocaId, dados.rastreio ? "concluido" : "em_aberto");
}

// ════════════════════════════════════════════════════════
// TESTE FUNCIONAL — entre a separação e o faturamento
// ════════════════════════════════════════════════════════

// Aprovado: libera a troca para o faturamento.
export async function aprovarTeste(trocaId, userId) {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .update({
      teste_resultado: "aprovado",
      teste_motivos:   null,
      teste_em:        agora,
      teste_por:       userId,
      status_furbtech: "aprovado",
      atualizado_em:   agora,
      atualizado_por:  userId,
    })
    .eq("troca_id", trocaId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

// Reprovado: devolve a peça ao estoque, guarda a tentativa no histórico e busca
// o próximo do FIFO — excluindo os IMEIs que já falharam nesta troca.
export async function reprovarTeste(trocaId, motivos, userId) {
  const lista = (motivos || []).map(m => String(m).trim()).filter(Boolean);
  if (!lista.length) return { ok: false, erro: "Informe ao menos um motivo." };

  const { data: op } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("id, imei, tentativas")
    .eq("troca_id", trocaId)
    .single();
  if (!op?.imei) return { ok: false, erro: "Nenhum aparelho separado nesta troca." };

  const agora = new Date().toISOString();
  const imeiReprovado = String(op.imei).trim();

  // 1. Peça volta ao estoque
  const { error: errTri } = await supabase
    .from("assurant_triagem")
    .update({ status_atual: "Produto disponível", atualizado_em: agora })
    .eq("imei", imeiReprovado);
  if (errTri) throw new Error(errTri.message);

  // 2. Histórico da tentativa — mantém o rastro de quantos aparelhos falharam
  const tentativas = [
    ...(Array.isArray(op.tentativas) ? op.tentativas : []),
    { imei: imeiReprovado, motivos: lista, em: agora, por: userId || null },
  ];

  // 3. Solta o IMEI da operação; a troca volta para a separação
  const { error: errOp } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .update({
      imei:            null,
      sku_escolhido:   null,
      data_separacao:  null,
      teste_resultado: "reprovado",
      teste_motivos:   lista,
      teste_em:        agora,
      teste_por:       userId,
      tentativas,
      status_furbtech: "reprovado",
      atualizado_em:   agora,
      atualizado_por:  userId,
    })
    .eq("troca_id", trocaId);
  if (errOp) throw new Error(errOp.message);

  // 4. Próxima sugestão, sem repetir nenhum dos que já falharam
  const jaFalharam = tentativas.map(t => t.imei);
  const { data: troca } = await supabase
    .from("trocas_b2c_assurant")
    .select("*, trocas_b2c_assurant_skus(*)")
    .eq("id", trocaId)
    .single();

  const sugestoes = await buscarSugestoesFIFO(
    troca?.trocas_b2c_assurant_skus || [], 5, jaFalharam,
  );

  return { ok: true, imeiReprovado, motivos: lista, sugestoes, tentativas: tentativas.length };
}

// Lista os motivos já usados em reprovações — alimenta o autocomplete do campo.
export async function motivosUsados(limite = 40) {
  const { data } = await supabase
    .from("trocas_b2c_assurant_operacao")
    .select("teste_motivos")
    .not("teste_motivos", "is", null)
    .limit(500);
  const cont = {};
  (data || []).forEach(r => (r.teste_motivos || []).forEach(m => {
    const k = String(m).trim();
    if (k) cont[k] = (cont[k] || 0) + 1;
  }));
  return Object.entries(cont)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)
    .map(([motivo, vezes]) => ({ motivo, vezes }));
}

export async function moverParaReembolso(trocaId) {
  await atualizarStatusTroca(trocaId, "movido_reembolso");
}