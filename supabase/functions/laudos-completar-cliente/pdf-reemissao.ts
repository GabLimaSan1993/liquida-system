import { jsPDF } from "npm:jspdf@2.5.2";
import autoTableModule from "npm:jspdf-autotable@3.8.4";
const autoTable = typeof autoTableModule === "function" ? autoTableModule : autoTableModule.default;
function linha(doc, y, titulo) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text(titulo, 14, y);
  return y + 2;
}

export function gerarPdfLaudo(dados, fotos, observacao, opcoes = {}) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.autoTable = (options) => autoTable(doc, options);
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

