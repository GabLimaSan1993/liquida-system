import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// LAUDO DE TRIAGEM
// As fotos ficam incorporadas no PDF completo, arquivado em bucket privado.
// Laudos antigos podem ser reemitidos pelos metadados, sem as fotos originais.
// ══════════════════════════════════════════════════════════

const STATUS_APOS_LAUDO = "Aguardando triagem cosmética";
const primeiroTexto = (...valores) => valores.find(v => typeof v === 'string' && v.trim())?.trim() || null;

export function completarIdentificacao(dados, triagem = {}, tradein = {}, catalogo = {}) {
  const produto = dados.produto || {};
  return {
    ...dados,
    cliente: primeiroTexto(dados.cliente, tradein?.cliente, triagem.cliente),
    loja: primeiroTexto(dados.loja, tradein?.loja, triagem.loja),
    produto: {
      ...produto,
      marca: primeiroTexto(produto.marca, catalogo?.marca, tradein?.marca),
      modelo: primeiroTexto(produto.modelo, catalogo?.modelo, triagem.modelo, tradein?.aparelho),
      armazenamento: primeiroTexto(produto.armazenamento, produto.capacidade, catalogo?.capacidade,
        catalogo?.tamanho ? `${catalogo.tamanho} (tamanho)` : null),
      cor: primeiroTexto(produto.cor, catalogo?.cor),
    },
  };
}

export function camposAusentesLaudo(dados) {
  return [
    ['cliente', dados.cliente], ['loja', dados.loja],
    ['marca', dados.produto?.marca], ['modelo', dados.produto?.modelo],
    ['capacidade', dados.produto?.armazenamento], ['cor', dados.produto?.cor],
    ['IMEI', dados.imei], ['voucher', dados.voucher],
  ].filter(([, valor]) => !primeiroTexto(valor)).map(([campo]) => campo);
}

// Etapas de foto do laudo. As quatro são obrigatórias e a ordem importa:
// IMEI, traseira e duas do defeito. O PDF sai nessa mesma sequência.
export const ETAPAS_FOTO = [
  { id: "imei",     titulo: "Foto do IMEI",         obrigatoria: true },
  { id: "traseira", titulo: "Foto da traseira",     obrigatoria: true },
  { id: "defeito1", titulo: "Foto do defeito (1)",  obrigatoria: true },
  { id: "defeito2", titulo: "Foto do defeito (2)",  obrigatoria: true },
];

// Busca o que a funcional já apurou. O operador do laudo não redigita nada:
// divergências, defeitos e dados do aparelho vêm prontos daqui.
export async function carregarParaLaudo(voucher) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v) return { ok: false, erro: "Informe o voucher." };

  const { data: t, error } = await supabase
    .from("assurant_triagem")
    .select("id, voucher, imei, sku, modelo, cliente, loja, condicao, status_atual, respostas_funcional, defeitos_adicionais, data_funcional")
    .eq("voucher", v)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return { ok: false, erro: `Voucher ${v} não encontrado na triagem.` };

  if (t.status_atual !== "Aguardando laudo") {
    return {
      ok: false,
      erro: `Este aparelho não está aguardando laudo (status atual: ${t.status_atual || "sem status"}).`,
      status: t.status_atual,
    };
  }

  // Use the exact voucher; numeric matching could mix GRV/YBV registrations.
  // Historical triage keeps customer/store data when TradeIn has no registration.
  let tradein = null;
  if (/^YBV\d+$/.test(v)) {
    const { data, error: erroTradein } = await supabase
      .from("tradein_geral")
      .select("cliente, loja, marca, aparelho, condicao_aparelho")
      .eq("voucher_ybv", v)
      .maybeSingle();
    if (erroTradein) throw new Error(`Não foi possível carregar o cadastro do cliente: ${erroTradein.message}`);
    tradein = data || null;
  }

  // GAIA stores functional answers as plain text, without a product snapshot.
  // Fill each missing field from the exact SKU, never from a similar model.
  let catalogo = null;
  const sku = String(t.sku || '').trim().toUpperCase().split('-')[0];
  if (/^[A-Z0-9]+$/.test(sku)) {
    const { data, error: erroCatalogo } = await supabase
      .from('produtos_catalogo')
      .select('marca, modelo, capacidade, tamanho, cor')
      .eq('ativo', true)
      .or(`sku_als.eq.${sku},sku_oracle.eq.${sku}`)
      .limit(20);
    if (erroCatalogo) throw new Error(`Não foi possível carregar o aparelho: ${erroCatalogo.message}`);
    const registros = data || [];
    catalogo = Object.fromEntries(['marca', 'modelo', 'capacidade', 'tamanho', 'cor'].map(campo => {
      const valores = [...new Set(registros.map(p => primeiroTexto(p[campo])).filter(Boolean))];
      return [campo, valores.length === 1 ? valores[0] : null];
    }));
  }

  // O JSON da funcional guarda produto, divergências e o motivo do destino.
  let respostas = null;
  try { respostas = JSON.parse(t.respostas_funcional || "null"); } catch { respostas = null; }

  const divergencias = (respostas?.respostas || [])
    .filter(r => r.divergente)
    .map(r => ({ pergunta: r.pergunta, resposta: r.resposta === "nao" ? "NÃO" : "SIM" }));

  return completarIdentificacao({
    ok: true,
    triagemId: t.id,
    voucher: t.voucher,
    imei: t.imei,
    produto: respostas?.produto || null,
    cliente: primeiroTexto(tradein?.cliente, t.cliente),
    loja: primeiroTexto(tradein?.loja, t.loja),
    condicaoDeclarada: primeiroTexto(tradein?.condicao_aparelho, t.condicao),
    motivo: respostas?.destino?.motivo || null,
    divergencias,
    defeitos: t.defeitos_adicionais
      ? t.defeitos_adicionais.split(";").map(s => s.trim()).filter(Boolean)
      : [],
  }, t, tradein, catalogo);
}

// Fila de aparelhos parados aguardando laudo. É o que a tela mostra ao abrir,
// em vez de exigir que o operador saiba de cor qual voucher bipar.
export async function listarAguardandoLaudo() {
  const { data, error } = await supabase
    .from("assurant_triagem")
    .select("voucher, imei, modelo, sku, data_funcional, respostas_funcional, defeitos_adicionais")
    .eq("status_atual", "Aguardando laudo")
    .order("data_funcional", { ascending: true });
  if (error) throw new Error(error.message);

  return (data || []).map(t => {
    let r = null;
    try { r = JSON.parse(t.respostas_funcional || "null"); } catch { r = null; }
    const divergencias = (r?.respostas || []).filter(x => x.divergente).length;
    return {
      voucher:   t.voucher,
      imei:      t.imei,
      modelo:    r?.produto?.modelo || t.modelo || null,
      marca:     r?.produto?.marca || null,
      motivo:    r?.destino?.motivo || null,
      divergencias,
      defeitos:  t.defeitos_adicionais || null,
      desde:     t.data_funcional,
    };
  });
}

function linha(doc, y, titulo) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(titulo, 14, y);
  return y + 2;
}

export function gerarPdfLaudo(dados, fotos, observacao, opcoes = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("LAUDO DE TRIAGEM", largura / 2, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `DATA: ${new Date(opcoes.data || Date.now()).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
    largura - 14, 28, { align: "right" }
  );

  let y = 42;
  if (opcoes.reemissao) {
    doc.setFontSize(9);
    const aviso = doc.splitTextToSize("REEMISSÃO A PARTIR DOS DADOS REGISTRADOS. As fotografias do laudo original não foram arquivadas e não estão disponíveis nesta cópia.", largura - 28);
    doc.text(aviso, 14, y); y += aviso.length * 4 + 6;
  }

  y = linha(doc, y, "Informações do Aparelho");
  doc.autoTable({
    startY: y + 2,
    theme: "grid",
    styles: { fontSize: 9, halign: "center", cellPadding: 2.5, lineColor: [150, 150, 150] },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [255, 255, 255] },
      2: { fontStyle: "bold", fillColor: [255, 255, 255] },
    },
    body: [
      ["Nome do cliente:", dados.cliente || "—", "Loja:", dados.loja || "—"],
      ["Marca:", dados.produto?.marca || "—", "Modelo:", dados.produto?.modelo || "—"],
      ["Capacidade:", dados.produto?.armazenamento || "—", "Cor:", dados.produto?.cor || "—"],
      ["IMEI:", dados.imei || "—", "Voucher:", dados.voucher || "—"],
    ],
  });
  y = doc.lastAutoTable.finalY + 8;

  if (observacao && observacao.trim()) {
    y = linha(doc, y, "Observação");
    doc.autoTable({
      startY: y + 2,
      theme: "grid",
      styles: { fontSize: 9, halign: "center", cellPadding: 2.5, lineColor: [150, 150, 150] },
      body: observacao.split("\n").filter(l => l.trim()).map(l => [l.trim()]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (dados.divergencias?.length) {
    y = linha(doc, y, "Divergências Identificadas");
    doc.autoTable({
      startY: y + 2,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2.5, lineColor: [150, 150, 150] },
      columnStyles: { 0: { fontStyle: "bold" }, 1: { halign: "center", cellWidth: 40 } },
      body: dados.divergencias.map(d => [d.pergunta, d.resposta]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  if (dados.defeitos?.length) {
    y = linha(doc, y, "Defeitos Adicionais");
    doc.autoTable({
      startY: y + 2,
      theme: "grid",
      styles: { fontSize: 9, halign: "center", cellPadding: 2.5, lineColor: [150, 150, 150] },
      body: dados.defeitos.map(d => [d]),
    });
    y = doc.lastAutoTable.finalY + 8;
  }

  const lista = (fotos || []).filter(Boolean);
  if (lista.length) {
    y = linha(doc, y, "Fotos do Aparelho");
    y += 4;

    const margem = 14;
    const larguraFoto = (largura - margem * 2 - 6) / 2;
    const alturaFoto  = larguraFoto * 0.75;
    const alturaPagina = doc.internal.pageSize.getHeight();

    lista.forEach((foto, i) => {
      const col = i % 2;
      if (col === 0 && i > 0) y += alturaFoto + 6;
      if (y + alturaFoto > alturaPagina - 14) {
        doc.addPage();
        y = 20;
      }
      const x = margem + col * (larguraFoto + 6);
      doc.setDrawColor(150);
      doc.rect(x, y, larguraFoto, alturaFoto);
      try {
        doc.addImage(foto, "JPEG", x + 1, y + 1, larguraFoto - 2, alturaFoto - 2, undefined, "FAST");
      } catch {
        // Foto corrompida não pode derrubar o laudo inteiro.
      }
    });
  }

  return doc;
}

export async function salvarLaudo({ dados, fotos, observacao, userId }) {
  if (!dados?.voucher) return { ok: false, erro: "Voucher ausente." };

  const obrigatorias = ETAPAS_FOTO.filter(e => e.obrigatoria).length;
  const preenchidas  = (fotos || []).filter(Boolean).length;
  if (preenchidas < obrigatorias) {
    return { ok: false, erro: `Faltam fotos: ${preenchidas} de ${obrigatorias} obrigatórias.` };
  }

  // Recheck at save time, including screens opened before a deployment.
  const atualizado = await carregarParaLaudo(dados.voucher);
  if (!atualizado.ok) return atualizado;
  dados = completarIdentificacao(dados, atualizado, {}, {
    ...atualizado.produto, capacidade: atualizado.produto?.armazenamento,
  });
  const ausentes = camposAusentesLaudo(dados);
  if (ausentes.length) return { ok: false, erro: `Laudo incompleto: faltam ${ausentes.join(', ')}. Complete o cadastro do aparelho antes de gerar o PDF.` };

  const doc = gerarPdfLaudo(dados, fotos, observacao);
  const nome = `laudo_${dados.voucher}_${new Date().toISOString().slice(0, 10)}.pdf`;
  const laudoId = crypto.randomUUID();
  const pdfPath = `${userId}/${laudoId}.pdf`;
  const { error: errPdf } = await supabase.storage.from("triagem-laudos").upload(pdfPath, doc.output("blob"), { contentType: "application/pdf", upsert: false });
  if (errPdf) throw new Error(`Não foi possível arquivar o PDF do laudo: ${errPdf.message}`);
  const agora = new Date().toISOString();

  const { error: errL } = await supabase.from("triagem_laudos").insert({
    id:           laudoId,
    voucher:      dados.voucher,
    imei:         dados.imei || null,
    motivo:       dados.motivo || null,
    divergencias: dados.divergencias || [],
    defeitos:     (dados.defeitos || []).join("; ") || null,
    observacao:   observacao?.trim() || null,
    qtd_fotos:    preenchidas,
    pdf_path:     pdfPath, // PDF completo, incluindo fotos, no bucket privado
    criado_por:   userId,
  });
  if (errL) throw new Error(errL.message);

  const { error: errT } = await supabase
    .from("assurant_triagem")
    .update({
      status_atual:  STATUS_APOS_LAUDO,
      data_laudo:    agora,
      laudo_por:     userId,
      atualizado_em: agora,
    })
    .eq("voucher", dados.voucher);
  if (errT) throw new Error(errT.message);

  doc.save(nome);
  return { ok: true, arquivo: nome, pdfPath, fotos: preenchidas, status: STATUS_APOS_LAUDO };
}
