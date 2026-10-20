import JsBarcode from "jsbarcode";
import { buscarTradeinPorVoucher } from "./tradeinService";
import { codigoCondicaoCompra } from "./condicaoCompra.js";

const escaparHtml = (valor) => String(valor || "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export function htmlEtiquetaRecebimento(voucher, svg, codigo) {
  const classe = ["BM", "TR"].includes(codigo) ? codigo : "SEM CLASSIFICAÇÃO";
  return `<!doctype html><html><head><title>Etiqueta ${escaparHtml(voucher)}</title><style>
    @page { size: 50mm 30mm; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; width: 50mm; height: 30mm; font-family: Arial, sans-serif; }
    .etq { width: 50mm; height: 30mm; padding: 1mm 2mm; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .condicao { border: 1px solid black; font-size: ${codigo ? "20" : "10"}px; font-weight: 900; padding: 0 3mm; line-height: 1.1; margin-bottom: 1mm; }
    svg { max-width: 46mm; width: 46mm; max-height: 20mm; }
  </style></head><body><div class="etq"><div class="condicao">${classe}</div>${svg}</div>
  <script>window.onload=function(){window.print();setTimeout(function(){window.close();},300);};</script></body></html>`;
}

export async function imprimirEtiquetaRecebimento(voucher) {
  // Open before awaiting the lookup to keep automatic printing available after scanning.
  const win = window.open("", "_blank", "width=420,height=280");
  if (!win) return;
  win.document.write("<p>Carregando etiqueta...</p>");
  try {
    const v = String(voucher || "").trim().toUpperCase();
    const tradein = /^(?:YBV)+\d+$/.test(v) ? await buscarTradeinPorVoucher(v) : null;
    const codigo = codigoCondicaoCompra(tradein?.condicao_aparelho, tradein?.condicao_sufixo);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, v, { format: "CODE128", width: 2, height: 60, displayValue: true, fontSize: 14, margin: 6, textMargin: 2 });
    win.document.open();
    win.document.write(htmlEtiquetaRecebimento(v, svg.outerHTML, codigo));
    win.document.close();
  } catch (error) {
    win.close();
    window.alert(`O recebimento foi mantido, mas não foi possível imprimir a etiqueta: ${error.message}. Utilize Reimprimir.`);
  }
}
