import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// LAUDO DE TRIAGEM
// As fotos NÃO são armazenadas soltas: elas só existem dentro do PDF,
// que é baixado pelo operador. No banco fica apenas o registro de que o
// laudo foi feito, com as divergências e a observação.
// ══════════════════════════════════════════════════════════

const STATUS_APOS_LAUDO = "Aguardando triagem cosmética";

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
    .select("id, voucher, imei, sku, modelo, status_atual, respostas_funcional, defeitos_adicionais, data_funcional")
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

  // Dados de cliente e loja saem da TradeIn, como no laudo atual.
  let tradein = null;
  const numero = v.replace(/\D/g, "");
  if (numero) {
    const { data } = await supabase
      .from("tradein_geral")
      .select("cliente, loja, marca, aparelho, condicao_aparelho")
      .eq("voucher", parseInt(numero, 10))
      .maybeSingle();
    tradein = data || null;
  }

  // O JSON da funcional guarda produto, divergências e o motivo do destino.
  let respostas = null;
  try { respostas = JSON.parse(t.respostas_funcional || "null"); } catch { respostas = null; }

  const divergencias = (respostas?.respostas || [])
    .filter(r => r.divergente)
    .map(r => ({ pergunta: r.pergunta, resposta: r.resposta === "nao" ? "NÃO" : "SIM" }));

  return {
    ok: true,
    triagemId: t.id,
    voucher: t.voucher,
    imei: t.imei,
    produto: respostas?.produto || null,
    cliente: tradein?.cliente || null,
    loja: tradein?.loja || null,
    condicaoDeclarada: tradein?.condicao_aparelho || null,
    motivo: respostas?.destino?.motivo || null,
    divergencias,
    defeitos: t.defeitos_adicionais
      ? t.defeitos_adicionais.split(";").map(s => s.trim()).filter(Boolean)
      : [],
  };
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

export function gerarPdfLaudo(dados, fotos, observacao) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const largura = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.text("LAUDO DE TRIAGEM", largura / 2, 20, { align: "center" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(
    `DATA: ${new Date().toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
    largura - 14, 28, { align: "right" }
  );

  let y = 42;

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

  const doc = gerarPdfLaudo(dados, fotos, observacao);
  const nome = `laudo_${dados.voucher}_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(nome);

  const agora = new Date().toISOString();

  const { error: errL } = await supabase.from("triagem_laudos").insert({
    voucher:      dados.voucher,
    imei:         dados.imei || null,
    motivo:       dados.motivo || null,
    divergencias: dados.divergencias || [],
    defeitos:     (dados.defeitos || []).join("; ") || null,
    observacao:   observacao?.trim() || null,
    qtd_fotos:    preenchidas,
    pdf_path:     null, // o PDF só é baixado pelo operador, não fica no Storage
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

  return { ok: true, arquivo: nome, fotos: preenchidas, status: STATUS_APOS_LAUDO };
}