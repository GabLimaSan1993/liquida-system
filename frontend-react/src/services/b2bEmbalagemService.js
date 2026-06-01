import { supabase } from "../lib/supabase";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Buscar ou criar caixa aberta do pedido ───────────────
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
  const CAPACIDADE = 50;

  // Verificar se IMEI existe no pedido e foi bipado no picking
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
    // Buscar número da caixa
    const { data: caixaExist } = await supabase
      .from("b2b_caixas")
      .select("numero")
      .eq("id", item.caixa_id)
      .single();
    return {
      ok: false,
      erro: `IMEI já embalado na Caixa ${caixaExist?.numero || "—"}.`,
    };
  }

  // Verificar capacidade da caixa atual
  const { data: caixaAtual } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("id", caixaId)
    .single();

  if (!caixaAtual) {
    return { ok: false, erro: "Caixa não encontrada." };
  }

  if (caixaAtual.total_itens >= CAPACIDADE) {
    return { ok: false, erro: "Caixa já está cheia (50 unidades). Feche esta caixa para continuar.", caixaCheia: true };
  }

  // Alocar item na caixa
  const { error: errUpdate } = await supabase
    .from("b2b_itens")
    .update({
      caixa_id:    caixaId,
      embalado_em: new Date().toISOString(),
      embalado_por: userId,
    })
    .eq("id", item.id);

  if (errUpdate) return { ok: false, erro: errUpdate.message };

  // Atualizar contador da caixa
  const novoTotal = (caixaAtual.total_itens || 0) + 1;
  await supabase
    .from("b2b_caixas")
    .update({ total_itens: novoTotal })
    .eq("id", caixaId);

  // Verificar se caixa ficou cheia após este item
  const caixaFechou = novoTotal >= CAPACIDADE;
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

  return {
    ok: true,
    item,
    totalCaixa: novoTotal,
    caixaFechou,
  };
}

// ── Fechar caixa manualmente ─────────────────────────────
export async function fecharCaixa(caixaId, userId) {
  const { error } = await supabase
    .from("b2b_caixas")
    .update({
      status:     "fechada",
      fechado_em: new Date().toISOString(),
      fechado_por: userId,
    })
    .eq("id", caixaId);
  if (error) throw new Error(error.message);
}

// ── Gerar Romaneio PDF ───────────────────────────────────
export async function gerarRomaneio(caixaId, pedido) {
  const itens = await listarItensCaixa(caixaId);

  const { data: caixa } = await supabase
    .from("b2b_caixas")
    .select("*")
    .eq("id", caixaId)
    .single();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  // Cabeçalho
  doc.setFillColor(127, 45, 146);
  doc.rect(0, 0, 210, 32, "F");

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text("ROMANEIO DE CAIXA", 14, 13);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Liquida Preço — Assurant Warehouse`, 14, 21);
  doc.text(`Emitido em: ${new Date().toLocaleString("pt-BR")}`, 14, 27);

  // Informações da caixa
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
  doc.text(`Total de itens: ${itens.length}`, 120, 43);
  doc.text(`Status: ${caixa.status === "fechada" ? "Fechada" : "Aberta"}`, 120, 50);
  if (caixa.fechado_em) {
    doc.text(`Fechada em: ${new Date(caixa.fechado_em).toLocaleString("pt-BR")}`, 120, 56);
  }

  // Tabela de itens
  autoTable(doc, {
    startY: 66,
    head: [["#", "IMEI", "Modelo", "Grade", "SKU", "Valor (R$)"]],
    body: itens.map((item, idx) => [
      idx + 1,
      item.imei,
      item.modelo || "—",
      item.grade  || "—",
      item.cod_item || "—",
      item.valor ? Number(item.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : "—",
    ]),
    styles: {
      fontSize: 7.5,
      cellPadding: 2.5,
    },
    headStyles: {
      fillColor: [127, 45, 146],
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
    },
    alternateRowStyles: {
      fillColor: [248, 244, 252],
    },
    columnStyles: {
      0: { cellWidth: 8,  halign: "center" },
      1: { cellWidth: 42, font: "courier" },
      2: { cellWidth: 60 },
      3: { cellWidth: 20, halign: "center" },
      4: { cellWidth: 28, halign: "center" },
      5: { cellWidth: 24, halign: "right" },
    },
    margin: { left: 14, right: 14 },
  });

  // Rodapé
  const totalValor = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const finalY = doc.lastAutoTable.finalY + 5;

  doc.setFillColor(245, 240, 250);
  doc.rect(14, finalY, 182, 10, "F");
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text(`Total de itens: ${itens.length}`, 18, finalY + 6.5);
  doc.text(
    `Valor total: R$ ${totalValor.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
    196,
    finalY + 6.5,
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

  // Etiqueta no formato A5 landscape (148x210mm) — ideal para imprimir em A4 e dobrar
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a5" });

  // Fundo roxo superior
  doc.setFillColor(127, 45, 146);
  doc.rect(0, 0, 210, 40, "F");

  // Logo / título
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(11);
  doc.setFont("helvetica", "normal");
  doc.text("LIQUIDA PREÇO — ASSURANT WAREHOUSE", 105, 12, { align: "center" });

  doc.setFontSize(28);
  doc.setFont("helvetica", "bold");
  doc.text(`CAIXA ${caixa.numero}`, 105, 32, { align: "center" });

  // Corpo
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");

  const col1x = 14;
  const col2x = 110;
  let y = 52;

  // Linha: Pedido
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.text("PEDIDO / LOTE", col1x, y);
  doc.text("CLIENTE", col2x, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  const loteTexto = pedido.lote.length > 38 ? pedido.lote.slice(0, 35) + "..." : pedido.lote;
  doc.text(loteTexto, col1x, y);
  const clienteTexto = pedido.cliente.length > 30 ? pedido.cliente.slice(0, 27) + "..." : pedido.cliente;
  doc.text(clienteTexto, col2x, y);

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(11);
  doc.text("QUANTIDADE DE ITENS", col1x, y);
  doc.text("TOTAL DE CAIXAS DO PEDIDO", col2x, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(22);
  doc.text(`${caixa.total_itens} unidades`, col1x, y);
  doc.text(`${totalCaixasPedido} caixas`, col2x, y);

  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 100, 100);
  doc.setFontSize(11);
  doc.text("DATA DE EMBALAGEM", col1x, y);

  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(13);
  const dataEmb = caixa.fechado_em
    ? new Date(caixa.fechado_em).toLocaleDateString("pt-BR")
    : new Date().toLocaleDateString("pt-BR");
  doc.text(dataEmb, col1x, y);

  // Borda inferior colorida
  doc.setFillColor(249, 115, 22);
  doc.rect(0, 133, 210, 5, "F");

  doc.save(`etiqueta_caixa_${caixa.numero}_${pedido.lote}.pdf`);
}