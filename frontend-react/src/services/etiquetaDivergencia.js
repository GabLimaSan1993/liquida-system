import { jsPDF } from "jspdf";
export function criarEtiquetaDivergencia(caso) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [105, 50],
  });
  doc.setDrawColor(0);
  doc.setLineWidth(0.7);
  doc.rect(2, 2, 101, 46);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text(caso.tipo_problema === "nao_liga" ? "APARELHO NAO LIGA" : caso.tipo_problema === "sem_ordem" ? "SEM ORDEM" : "IMEI DIVERGENTE", 52.5, 10, { align: "center" });
  doc.setFontSize(8);
  doc.text("SEGREGAR - AGUARDANDO DECISAO ASSURANT", 52.5, 15, { align: "center" });
  const linha = (texto, y, tamanho = 8) => {
    doc.setFontSize(tamanho);
    const largura = doc.getTextWidth(texto);
    if (largura > 94) doc.setFontSize(tamanho * 94 / largura);
    doc.text(texto, 5, y);
  };
  doc.setFont("helvetica", "bold");
  linha(String(caso.voucher || ""), 21, 10);
  doc.setFont("helvetica", "normal");
  linha(String(caso.modelo || ""), 26);
  doc.setFont("courier", "normal");
  linha(`1: ${caso.imei1 || "Nao bipado"}`, 31, 9);
  linha(`2: ${caso.imei2 || "Nao se aplica"}`, 35, 9);
  doc.setFont("helvetica", "normal");
  linha(`Usuario: ${caso.criado_por_nome || "Nao informado"}`, 40);
  const data = caso.criado_em ? new Date(caso.criado_em) : null;
  linha(`Data: ${data && !Number.isNaN(data.getTime()) ? data.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Nao informada"}`, 45);
  return doc;
}
export function etiquetaDivergencia(caso, { baixar = false } = {}) {
  const doc = criarEtiquetaDivergencia(caso);
  if (baixar) {
    doc.save(`DIVERGENCIA_${caso.voucher}.pdf`);
    return;
  }
  doc.autoPrint();
  const url = doc.output("bloburl");
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;bottom:0;right:0;border:0";
  frame.title = "Etiqueta de divergência";
  frame.src = String(url);
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(String(url));
  }, 120000);
}
