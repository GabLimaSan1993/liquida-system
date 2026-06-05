import jsPDF from "jspdf";
import "jspdf-autotable";
import { supabase } from "../lib/supabase";

const CAPACIDADE_CAIXA = 30;

// ── Buscar caixa aberta do pedido ────────────────────────
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

// ── Criar nova caixa ─────────────────────────────────────
export async function criarCaixa(pedidoId, userId) {
  const { data: numData } = await supabase
    .rpc("b2b_proximo_numero_caixa", { p_pedido_id: pedidoId });

  const numero = numData || 1;

  const { data, error } = await supabase
    .from("b2b_caixas")
    .insert({
      pedido_id:  pedidoId,
      numero,
      status:     "aberta",
      criado_por: userId,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// ── Listar caixas de um pedido ───────────────────────────
export async function listarCaixas(pedidoId) {
  const { data, error } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Listar itens de uma caixa ────────────────────────────
export async function listarItensCaixa(caixaId) {
  const { data, error } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("caixa_id", caixaId)
    .order("embalado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Bipar IMEI na embalagem ──────────────────────────────
export async function embalarImei(imeiDigitado, pedidoId, caixaId, userId) {
  const imei = String(imeiDigitado).trim();

  const { data: item, error: errItem } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("imei", imei)
    .single();

  if (errItem || !item) {
    return { ok: false, erro: "IMEI não encontrado neste pedido." };
  }

  if (item.status !== "bipado") {
    return { ok: false, erro: "IMEI não foi bipado no picking — não pode ser embalado." };
  }

  if (item.caixa_id) {
    const { data: caixaExist } = await supabase
      .from("b2b_caixas")
      .select("numero")
      .eq("id", item.caixa_id)
      .single();
    return {
      ok:   false,
      erro: `IMEI já embalado na Caixa ${caixaExist?.numero || "—"}.`,
    };
  }

  const { data: caixaAtual } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("id", caixaId)
    .single();

  if (!caixaAtual) {
    return { ok: false, erro: "Caixa não encontrada." };
  }

  if (caixaAtual.total_itens >= CAPACIDADE_CAIXA) {
    return {
      ok:         false,
      erro:       `Caixa já está cheia (${CAPACIDADE_CAIXA} unidades). Feche esta caixa para continuar.`,
      caixaCheia: true,
    };
  }

  const { error: errUpdate } = await supabase
    .from("b2b_itens")
    .update({
      caixa_id:     caixaId,
      embalado_em:  new Date().toISOString(),
      embalado_por: userId,
    })
    .eq("id", item.id);

  if (errUpdate) return { ok: false, erro: errUpdate.message };

  const novoTotal = (caixaAtual.total_itens || 0) + 1;
  await supabase
    .from("b2b_caixas")
    .update({ total_itens: novoTotal })
    .eq("id", caixaId);

  const caixaFechou = novoTotal >= CAPACIDADE_CAIXA;
  if (caixaFechou) {
    await supabase
      .from("b2b_caixas")
      .update({
        status:      "fechada",
        fechado_em:  new Date().toISOString(),
        fechado_por: userId,
      })
      .eq("id", caixaId);
  }

  return { ok: true, item, totalCaixa: novoTotal, caixaFechou };
}

// ── Fechar caixa manualmente (permite quantidade parcial) ─
export async function fecharCaixa(caixaId, userId) {
  const { error } = await supabase
    .from("b2b_caixas")
    .update({
      status:      "fechada",
      fechado_em:  new Date().toISOString(),
      fechado_por: userId,
    })
    .eq("id", caixaId);
  if (error) throw new Error(error.message);
}

// ── Gerar Romaneio PDF (com NFs) ─────────────────────────
export async function gerarRomaneio(caixaId, pedido) {
  const itens = await listarItensCaixa(caixaId);

  const { data: caixa } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("id", caixaId)
    .single();

  const { data: itensComNF } = await supabase
    .from("b2b_itens")
    .select("nf")
    .eq("caixa_id", caixaId)
    .not("nf", "is", null);

  const nfContagem = {};
  (itensComNF || []).forEach(i => {
    if (!i.nf) return;
    nfContagem[i.nf] = (nfContagem[i.nf] || 0) + 1;
  });

  const { data: itensPedidoNF } = await supabase
    .from("b2b_itens")
    .select("nf, caixa_id")
    .eq("pedido_id", pedido.id)
    .not("nf", "is", null);

  const nfTotalItens  = {};
  const nfCaixasTotal = {};
  (itensPedidoNF || []).forEach(i => {
    if (!i.nf) return;
    nfTotalItens[i.nf] = (nfTotalItens[i.nf] || 0) + 1;
    if (!nfCaixasTotal[i.nf]) nfCaixasTotal[i.nf] = new Set();
    if (i.caixa_id) nfCaixasTotal[i.nf].add(i.caixa_id);
  });

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Cabeçalho roxo
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

  // Bloco info caixa
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
    doc.text(
      `Fechada em: ${new Date(caixa.fechado_em).toLocaleString("pt-BR")}`,
      120, 56
    );
  }

  let currentY = 66;

  // Bloco NFs
  if (Object.keys(nfContagem).length > 0) {
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(127, 45, 146);
    doc.text("NOTAS FISCAIS DESTA CAIXA", 14, currentY);
    currentY += 4;

    doc.autoTable({
      startY: currentY,
      head: [["Nº NF", "Aparelhos nesta caixa", "Total aparelhos na NF", "Total caixas na NF"]],
      body: Object.entries(nfContagem).map(([nf, qtd]) => [
        nf,
        qtd,
        nfTotalItens[nf]        || qtd,
        nfCaixasTotal[nf]?.size || 1,
      ]),
      styles:     { fontSize: 8, cellPadding: 2.5 },
      headStyles: {
        fillColor: [91, 30, 116],
        textColor: [255, 255, 255],
        fontStyle: "bold",
        fontSize:  8,
      },
      columnStyles: {
        0: { cellWidth: 35, halign: "center" },
        1: { cellWidth: 50, halign: "center" },
        2: { cellWidth: 55, halign: "center" },
        3: { cellWidth: 46, halign: "center" },
      },
      margin: { left: 14, right: 14 },
    });

    currentY = (doc.lastAutoTable?.finalY || currentY) + 8;
  }

  // Tabela de itens
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("ITENS DA CAIXA", 14, currentY);
  currentY += 4;

  doc.autoTable({
    startY: currentY,
    head: [["#", "IMEI", "Modelo", "Grade", "SKU", "NF", "Valor (R$)"]],
    body: itens.map((item, idx) => [
      idx + 1,
      item.imei,
      item.modelo   || "—",
      item.grade    || "—",
      item.cod_item || "—",
      item.nf       || "—",
      item.valor
        ? Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })
        : "—",
    ]),
    styles:     { fontSize: 7.5, cellPadding: 2.5 },
    headStyles: {
      fillColor: [127, 45, 146],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize:  8,
    },
    alternateRowStyles: { fillColor: [248, 244, 252] },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center" },
      1: { cellWidth: 38 },
      2: { cellWidth: 52 },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 26, halign: "center" },
      5: { cellWidth: 22, halign: "center" },
      6: { cellWidth: 20, halign: "right"  },
    },
    margin: { left: 14, right: 14 },
  });

  // Rodapé
  const totalValor = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const finalY     = (doc.lastAutoTable?.finalY || 250) + 5;

  doc.setFillColor(245, 240, 250);
  doc.rect(14, finalY, 182, 10, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(`Total de itens: ${itens.length}`, 18, finalY + 6.5);
  doc.text(
    `Valor total: R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    196, finalY + 6.5,
    { align: "right" }
  );

  doc.save(`romaneio_caixa_${caixa.numero}_${pedido.lote}.pdf`);
}

// ── Gerar Etiqueta PDF ───────────────────────────────────
export async function gerarEtiqueta(caixaId, pedido, totalCaixasPedido) {
  const { data: caixa } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("id", caixaId)
    .single();

  const doc = new jsPDF({
    orientation: "landscape",
    unit:        "mm",
    format:      [70, 100],
  });

  const W = 100;
  const H = 70;

  doc.setFillColor(255, 255, 255);
  doc.rect(0, 0, W, H, "F");

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.4);
  doc.rect(2, 2, W - 4, H - 4, "S");

  const loteFormatado = pedido.lote
    .replace(/ - \d+ PRODUTOS.*$/i, "")
    .replace(/_LOTE_\d+$/i, "")
    .trim();

  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.text(loteFormatado, W / 2, 13, { align: "center" });

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.2);
  doc.line(5, 17, W - 5, 17);

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.text(`CAIXA ${caixa.numero}`, W / 2, 33, { align: "center" });

  doc.line(5, 38, W - 5, 38);

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text(`${caixa.total_itens} UNIDADES`, W / 2, 50, { align: "center" });

  doc.line(5, 55, W - 5, 55);

  const dataEmb = caixa.fechado_em
    ? new Date(caixa.fechado_em).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");

  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text(dataEmb, W / 2, 64, { align: "center" });

  doc.save(`etiqueta_caixa_${caixa.numero}_${pedido.lote}.pdf`);
}