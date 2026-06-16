import jsPDF from "jspdf";
import "jspdf-autotable";
import { supabase } from "../lib/supabase";

const CAPACIDADE_CAIXA = 30;

// ── Verifica se pedido tem NFs importadas ─────────────────
export async function verificarNFsPedido(pedidoId) {
  const { data } = await supabase
    .from("b2b_nfs")
    .select("id, numero_nf")
    .eq("pedido_id", pedidoId);
  return data || [];
}

export async function buscarCaixaAberta(pedidoId) {
  const { data } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("status", "aberta")
    .order("numero", { ascending: false })
    .limit(1)
    .single();
  return data || null;
}

export async function criarCaixa(pedidoId, userId) {
  const { data: numData } = await supabase
    .rpc("b2b_proximo_numero_caixa", { p_pedido_id: pedidoId });
  const numero = numData || 1;
  const { data, error } = await supabase
    .from("b2b_caixas")
    .insert({ pedido_id: pedidoId, numero, status: "aberta", criado_por: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function listarCaixas(pedidoId) {
  const { data, error } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarItensCaixa(caixaId) {
  const { data, error } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("caixa_id", caixaId)
    .order("embalado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function embalarImei(imeiDigitado, pedidoId, caixaId, userId) {
  const imei = String(imeiDigitado).trim();

  const { data: item, error: errItem } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("imei", imei)
    .single();

  if (errItem || !item)
    return { ok: false, erro: "IMEI não encontrado neste pedido." };

  if (item.status !== "bipado")
    return { ok: false, erro: "IMEI não foi bipado no picking — não pode ser embalado." };

  if (item.caixa_id) {
    const { data: caixaExist } = await supabase
      .from("b2b_caixas").select("numero").eq("id", item.caixa_id).single();
    return { ok: false, erro: `IMEI já embalado na Caixa ${caixaExist?.numero || "—"}.` };
  }

  const { data: caixaAtual } = await supabase
    .from("b2b_caixas").select("*").eq("id", caixaId).single();

  if (!caixaAtual) return { ok: false, erro: "Caixa não encontrada." };

  if (caixaAtual.total_itens >= CAPACIDADE_CAIXA)
    return { ok: false, erro: `Caixa já está cheia (${CAPACIDADE_CAIXA} unidades).`, caixaCheia: true };

  const { error: errUpdate } = await supabase
    .from("b2b_itens")
    .update({ caixa_id: caixaId, embalado_em: new Date().toISOString(), embalado_por: userId })
    .eq("id", item.id);

  if (errUpdate) return { ok: false, erro: errUpdate.message };

  const novoTotal = (caixaAtual.total_itens || 0) + 1;
  await supabase.from("b2b_caixas").update({ total_itens: novoTotal }).eq("id", caixaId);

  const caixaFechou = novoTotal >= CAPACIDADE_CAIXA;
  if (caixaFechou) {
    await supabase.from("b2b_caixas").update({
      status: "fechada", fechado_em: new Date().toISOString(), fechado_por: userId,
    }).eq("id", caixaId);
  }

  return { ok: true, item, totalCaixa: novoTotal, caixaFechou };
}

export async function fecharCaixa(caixaId, userId) {
  const { error } = await supabase
    .from("b2b_caixas")
    .update({ status: "fechada", fechado_em: new Date().toISOString(), fechado_por: userId })
    .eq("id", caixaId);
  if (error) throw new Error(error.message);
}

// ── Romaneio por Caixa ────────────────────────────────────
export async function gerarRomaneio(caixaId, pedido) {
  // Verifica se há NFs importadas para este pedido
  const nfsPedido = await verificarNFsPedido(pedido.id);
  if (!nfsPedido.length) {
    throw new Error("Não é possível gerar o romaneio sem NFs importadas. Importe as NFs primeiro.");
  }

  const itens = await listarItensCaixa(caixaId);

  const { data: caixa } = await supabase
    .from("b2b_caixas").select("*").eq("id", caixaId).single();

  const { data: itensComNF } = await supabase
    .from("b2b_itens").select("nf").eq("caixa_id", caixaId).not("nf", "is", null);

  const nfContagem = {};
  (itensComNF || []).forEach(i => {
    if (!i.nf) return;
    nfContagem[i.nf] = (nfContagem[i.nf] || 0) + 1;
  });

  // Busca NFs da tabela b2b_nfs como fonte principal
  const nfsTabela = nfsPedido.map(n => String(n.numero_nf));

  // Monta contagem por NF usando b2b_nfs
  const { data: itensPedidoNF } = await supabase
    .from("b2b_itens").select("nf, caixa_id")
    .eq("pedido_id", pedido.id).not("nf", "is", null);

  const nfTotalItens  = {};
  const nfCaixasTotal = {};
  (itensPedidoNF || []).forEach(i => {
    if (!i.nf) return;
    nfTotalItens[i.nf] = (nfTotalItens[i.nf] || 0) + 1;
    if (!nfCaixasTotal[i.nf]) nfCaixasTotal[i.nf] = new Set();
    if (i.caixa_id) nfCaixasTotal[i.nf].add(i.caixa_id);
  });

  // Se nfContagem vazio, usa NFs do pedido como referência
  const nfsParaRomaneio = Object.keys(nfContagem).length > 0
    ? nfContagem
    : Object.fromEntries(nfsTabela.map(nf => [nf, "—"]));

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  doc.setFillColor(127, 45, 146);
  doc.rect(0, 0, 210, 32, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ROMANEIO DE CAIXA", 14, 13);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text("Liquida Preço — Assurant Warehouse", 14, 21);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 27);

  doc.setTextColor(0, 0, 0);
  doc.setFillColor(245, 240, 250);
  doc.rect(0, 34, 210, 28, "F");
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text(`CAIXA Nº ${caixa.numero}`, 14, 43);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Pedido: ${pedido.lote}`, 14, 50);
  doc.text(`Cliente: ${pedido.cliente}`, 14, 56);
  doc.text(`Total de itens nesta caixa: ${itens.length}`, 120, 43);
  doc.text(`Status: ${caixa.status === "fechada" ? "Fechada" : "Aberta"}`, 120, 50);
  if (caixa.fechado_em) {
    doc.text(`Fechada em: ${new Date(caixa.fechado_em).toLocaleString("pt-BR")}`, 120, 56);
  }

  let currentY = 66;

  // Seção de NFs — sempre mostra (já garantimos que existe)
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(127, 45, 146);
  doc.text("NOTAS FISCAIS DESTA CAIXA", 14, currentY);
  currentY += 4;

  const nfsBody = Object.keys(nfContagem).length > 0
    ? Object.entries(nfContagem).map(([nf, qtd]) => [
        nf, qtd, nfTotalItens[nf] || qtd, nfCaixasTotal[nf]?.size || 1,
      ])
    : nfsTabela.map(nf => [nf, "—", "—", "—"]);

  doc.autoTable({
    startY: currentY,
    head: [["Nº NF", "Aparelhos nesta caixa", "Total aparelhos na NF", "Total caixas na NF"]],
    body: nfsBody,
    styles:     { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [91, 30, 116], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    columnStyles: {
      0: { cellWidth: 35, halign: "center" },
      1: { cellWidth: 50, halign: "center" },
      2: { cellWidth: 55, halign: "center" },
      3: { cellWidth: 46, halign: "center" },
    },
    margin: { left: 14, right: 14 },
  });

  currentY = (doc.lastAutoTable?.finalY || currentY) + 8;

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("ITENS DA CAIXA", 14, currentY);
  currentY += 4;

  doc.autoTable({
    startY: currentY,
    head: [["#", "IMEI", "Modelo", "Grade", "SKU", "NF"]],
    body: itens.map((item, idx) => [
      idx + 1, item.imei, item.modelo || "—", item.grade || "—",
      item.cod_item || "—", item.nf || "—",
    ]),
    styles:     { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: { fillColor: [127, 45, 146], textColor: [255, 255, 255], fontStyle: "bold", fontSize: 8 },
    alternateRowStyles: { fillColor: [248, 244, 252] },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 62 },
      3: { cellWidth: 22, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 28, halign: "center" },
    },
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc.lastAutoTable?.finalY || 250) + 5;
  doc.setFillColor(245, 240, 250);
  doc.rect(14, finalY, 182, 10, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de itens: ${itens.length}`, 18, finalY + 6.5);

  doc.save(`romaneio_caixa_${caixa.numero}_${pedido.lote}.pdf`);
}

// ── Romaneio do Pedido Completo ───────────────────────────
export async function gerarRomaneioPedido(pedido) {
  // Verifica se há NFs importadas para este pedido
  const nfsPedidoCheck = await verificarNFsPedido(pedido.id);
  if (!nfsPedidoCheck.length) {
    throw new Error("Não é possível gerar o romaneio sem NFs importadas. Importe as NFs primeiro.");
  }

  const { data: caixas } = await supabase
    .from("b2b_caixas").select("*")
    .eq("pedido_id", pedido.id).order("numero", { ascending: true });

  const { data: itensNF } = await supabase
    .from("b2b_itens").select("nf, caixa_id")
    .eq("pedido_id", pedido.id).not("nf", "is", null);

  const nfTotalItens  = {};
  const nfCaixasTotal = {};
  (itensNF || []).forEach(i => {
    if (!i.nf) return;
    nfTotalItens[i.nf] = (nfTotalItens[i.nf] || 0) + 1;
    if (!nfCaixasTotal[i.nf]) nfCaixasTotal[i.nf] = new Set();
    if (i.caixa_id) nfCaixasTotal[i.nf].add(i.caixa_id);
  });

  // NFs da tabela b2b_nfs
  const nfsTabela = await supabase
    .from("b2b_nfs").select("numero_nf")
    .eq("pedido_id", pedido.id)
    .order("importado_em", { ascending: true });

  const { data: itensEmbalados } = await supabase
    .from("b2b_itens").select("id")
    .eq("pedido_id", pedido.id).not("caixa_id", "is", null);

  const totalItens   = itensEmbalados?.length || 0;
  const totalVolumes = caixas?.length || 0;

  const nfs = nfsTabela.data?.length > 0
    ? nfsTabela.data.map(n => String(n.numero_nf))
    : Object.keys(nfTotalItens).sort();

  const doc   = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const margL = 30;
  const margR = 180;
  const colW  = margR - margL;
  const col1W = 50;
  const col2X = margL + col1W;
  const col2W = colW - col1W;
  const rowH  = 14;
  const lineH = 5;

  let y = 40;

  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);

  // ── Header ────────────────────────────────────────────────
  const headerH = 22;
  doc.rect(margL, y, col1W, headerH);
  doc.setFillColor(30, 30, 30);
  doc.rect(margL + 1, y + 1, col1W - 2, headerH - 2, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("liquida", margL + col1W / 2 - 3, y + 9, { align: "center" });
  doc.setFontSize(7);
  doc.text("preço", margL + col1W / 2 + 5, y + 9, { align: "center" });

  doc.rect(col2X, y, col2W, headerH);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("ROMANEIO DE EXPEDIÇÃO", col2X + col2W / 2, y + 9, { align: "center" });

  const loteFormatado = pedido.lote
    .replace(/ - \d+ PRODUTOS.*$/i, "")
    .replace(/_LOTE_\d+$/i, "")
    .replace(/_/g, " ")
    .trim();

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  const loteLinhas = doc.splitTextToSize(loteFormatado, col2W - 6);
  if (loteLinhas.length === 1) {
    doc.text(loteLinhas[0], col2X + col2W / 2, y + 17, { align: "center" });
  } else {
    loteLinhas.forEach((linha, idx) => {
      doc.text(linha, col2X + col2W / 2, y + 15 + idx * 4, { align: "center" });
    });
  }

  y += headerH;

  // ── Funções auxiliares ────────────────────────────────────
  function calcRowH(text, maxW, fontSize = 9) {
    doc.setFontSize(fontSize);
    const linhas = doc.splitTextToSize(String(text), maxW - 6);
    return Math.max(rowH, linhas.length * lineH + 6);
  }

  function drawRow(label, value) {
    const h = calcRowH(value, col2W);
    doc.rect(margL, y, col1W, h);
    doc.rect(col2X, y, col2W, h);

    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 0);
    doc.text(label, margL + col1W / 2, y + h / 2 + 1.5, { align: "center" });

    doc.setFont("helvetica", "normal");
    const linhas = doc.splitTextToSize(String(value), col2W - 6);
    const totalTextH = linhas.length * lineH;
    const startTextY = y + (h - totalTextH) / 2 + lineH - 1;
    linhas.forEach((linha, idx) => {
      doc.text(linha, col2X + col2W / 2, startTextY + idx * lineH, { align: "center" });
    });

    y += h;
  }

  function drawFullRow(text, customH = null, fontSize = 9, fontStyle = "bold") {
    doc.setFontSize(fontSize);
    doc.setFont("helvetica", fontStyle);
    const linhas = doc.splitTextToSize(String(text), colW - 6);
    const h = customH || Math.max(rowH, linhas.length * lineH + 6);

    doc.rect(margL, y, colW, h);
    const totalTextH = linhas.length * lineH;
    const startTextY = y + (h - totalTextH) / 2 + lineH - 1;
    doc.setTextColor(0, 0, 0);
    linhas.forEach((linha, idx) => {
      doc.text(linha, margL + colW / 2, startTextY + idx * lineH, { align: "center" });
    });

    y += h;
  }

  // DATA em branco para preenchimento manual
  drawRow("DATA :", "");
  drawRow("CLIENTE :", pedido.cliente);

  // ── NOTA FISCAL ──────────────────────────────────────────
  drawFullRow("NOTA FISCAL", rowH, 9, "bold");
  nfs.forEach(nf => drawFullRow(String(nf), rowH, 10, "bold"));

  y += 4;
  drawRow("QUANTIDADE :", totalItens);
  drawRow("VOLUMES :", totalVolumes);
  drawRow("ASS :", "");
  drawRow("RG/CPF :", "");

  doc.save(`romaneio_${pedido.lote}.pdf`);
}

// ── Etiqueta PDF ──────────────────────────────────────────
export async function gerarEtiqueta(caixaId, pedido, totalCaixasPedido) {
  const { data: caixa } = await supabase
    .from("b2b_caixas").select("*").eq("id", caixaId).single();

  const JsBarcode = (await import("jsbarcode")).default;
  const codigoBarras = `${pedido.lote}-CX${caixa.numero}-${caixa.total_itens}UN`;
  const canvas = document.createElement("canvas");
  JsBarcode(canvas, codigoBarras, {
    format:       "CODE128",
    width:        2,
    height:       60,
    displayValue: false,
    margin:       0,
  });
  const barcodeDataUrl = canvas.toDataURL("image/png");

  const doc = new jsPDF({
    orientation: "landscape",
    unit:        "mm",
    format:      [50, 105],
  });

  const W = 105;
  const H = 50;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.rect(1.5, 1.5, W - 3, H - 3, "S");

  const loteFormatado = pedido.lote
    .replace(/ - \d+ PRODUTOS.*$/i, "")
    .replace(/_LOTE_\d+$/i, "")
    .replace(/_/g, " ")
    .trim();

  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(loteFormatado, W / 2, 9, { align: "center" });

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(4, 12, W - 4, 12);

  doc.setFontSize(22);
  doc.setFont("helvetica", "bold");
  doc.text(`CAIXA ${caixa.numero}`, W / 2, 23, { align: "center" });

  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(`${caixa.total_itens} UNIDADES`, W / 2, 32, { align: "center" });

  doc.line(4, 35, W - 4, 35);

  const barcodeW = 85;
  const barcodeH = 10;
  const barcodeX = (W - barcodeW) / 2;
  doc.addImage(barcodeDataUrl, "PNG", barcodeX, 36, barcodeW, barcodeH);

  doc.setFontSize(6);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(80, 80, 80);
  doc.text(codigoBarras, W / 2, 48, { align: "center" });

  doc.save(`etiqueta_caixa_${caixa.numero}_${pedido.lote}.pdf`);
}