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
  doc.setFontSize(18);
  doc.text("IMEI DIVERGENTE", 52.5, 11, { align: "center" });
  doc.setFontSize(9);
  doc.text("SEGREGAR - AGUARDANDO DECISAO ASSURANT", 52.5, 17, {
    align: "center",
  });
  doc.setFontSize(11);
  doc.text(String(caso.voucher || ""), 5, 24);
  doc.setFont("courier", "normal");
  doc.setFontSize(9);
  doc.text(`1: ${caso.imei1 || ""}`, 5, 30);
  doc.text(`2: ${caso.imei2 || "Nao se aplica"}`, 5, 35);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(
    doc.splitTextToSize(String(caso.modelo || ""), 94).slice(0, 2),
    5,
    41,
  );
  return doc;
}
export function etiquetaDivergencia(caso, { baixar = false } = {}) {
  const doc = criarEtiquetaDivergencia(caso);
  if (baixar) {
    doc.save(`IMEI_DIVERGENTE_${caso.voucher}.pdf`);
    return;
  }
  doc.autoPrint();
  const url = doc.output("bloburl");
  const frame = document.createElement("iframe");
  frame.style.cssText =
    "position:fixed;width:1px;height:1px;bottom:0;right:0;border:0";
  frame.title = "Etiqueta IMEI DIVERGENTE";
  frame.src = String(url);
  document.body.appendChild(frame);
  setTimeout(() => {
    frame.remove();
    URL.revokeObjectURL(String(url));
  }, 120000);
}
