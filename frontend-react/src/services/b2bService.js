import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ── Parser da planilha de picking ────────────────────────
export async function importarPedidoB2B(file, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];

        // range: 1 pula a linha 1 (ALOCAÇÃO/ESTOQUE/WAREHOUSE)
        // e usa a linha 2 (GRADE, MODELO, IMEI...) como cabeçalho real
        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: null,
          range:  1,
        });

        if (!rows.length) throw new Error("Planilha vazia ou formato inválido.");

        // Extrair lote e cliente
        const lote    = rows[0]["RESERVA"] || rows[0]["LOTE"] || "SEM_LOTE";
        const cliente = rows[0]["Ganhador"] || "Cliente não identificado";

        // Verificar se pedido já existe
        const { data: existing } = await supabase
          .from("b2b_pedidos")
          .select("id")
          .eq("lote", lote)
          .single();

        if (existing) throw new Error(`Pedido "${lote}" já foi importado.`);

        // Criar pedido (total_itens provisório, atualizado depois)
        const { data: pedido, error: errPedido } = await supabase
          .from("b2b_pedidos")
          .insert({
            lote,
            cliente,
            total_itens: rows.length,
            criado_por:  userId,
          })
          .select()
          .single();

        if (errPedido) throw new Error(errPedido.message);

        // Mapear itens
        const itens = rows.map(r => ({
          pedido_id:     pedido.id,
          imei:          String(r["IMEI"] || r["NUM_IMEI"] || "").trim(),
          voucher:       String(r["NUM_IMEI"] || "").trim(),
          modelo:        r["MODELO"]     || r["CNN"]   || null,
          grade:         r["GRADE"]      || null,
          grade2:        r["GRADE2"]     || null,
          desc_item:     r["DESC_ITEM"]  || null,
          cod_item:      r["COD_ITEM"]   || null,
          local_estoque: r["LOCAL"]      || null,
          aging:         r["AGING"]      ? parseInt(r["AGING"])        : null,
          valor:         r["Alocação $"] ? parseFloat(r["Alocação $"]) : null,
          status:        "pendente",
        })).filter(i => i.imei && i.imei.length > 5);

        // Atualizar total com contagem real de IMEIs válidos
        await supabase
          .from("b2b_pedidos")
          .update({ total_itens: itens.length })
          .eq("id", pedido.id);

        // Inserir itens em chunks de 500
        const CHUNK = 500;
        for (let i = 0; i < itens.length; i += CHUNK) {
          const { error } = await supabase
            .from("b2b_itens")
            .insert(itens.slice(i, i + CHUNK));
          if (error) throw new Error(error.message);
        }

        resolve({ pedido, total: itens.length, lote, cliente });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

// ── Buscar pedidos ───────────────────────────────────────
export async function listarPedidosB2B() {
  const { data, error } = await supabase
    .from("b2b_pedidos")
    .select("*")
    .order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Buscar itens de um pedido ────────────────────────────
export async function listarItens(pedidoId) {
  const { data, error } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("local_estoque", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Registrar bipagem ────────────────────────────────────
export async function registrarBipagem(imeiDigitado, pedidoId, userId) {
  const imei = String(imeiDigitado).trim();

  // Buscar item pelo IMEI no pedido atual
  const { data: item, error: errItem } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("imei", imei)
    .single();

  if (errItem || !item) {
    // Verificar se IMEI está em outro pedido já bipado
    const { data: outroItem } = await supabase
      .from("b2b_itens")
      .select("pedido_id, status")
      .eq("imei", imei)
      .eq("status", "bipado")
      .single();

    if (outroItem) {
      return { ok: false, erro: "IMEI já bipado em outro pedido — reservado." };
    }
    return { ok: false, erro: "IMEI não encontrado neste pedido." };
  }

  if (item.status === "bipado") {
    return { ok: false, erro: "IMEI já bipado neste pedido.", item };
  }

  // Registrar bipagem
  const { error: errUpdate } = await supabase
    .from("b2b_itens")
    .update({
      status:      "bipado",
      imei_bipado: imei,
      bipado_em:   new Date().toISOString(),
      bipado_por:  userId,
    })
    .eq("id", item.id);

  if (errUpdate) return { ok: false, erro: errUpdate.message };

  // Atualizar contador do pedido
  await supabase.rpc("b2b_atualizar_contador", { p_pedido_id: pedidoId });

  return { ok: true, item };
}

// ── Exportar para faturamento ────────────────────────────
export async function exportarFaturamento(pedidoId) {
  const { data: pedido } = await supabase
    .from("b2b_pedidos")
    .select("*")
    .eq("id", pedidoId)
    .single();

  const { data: itens } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("status", "bipado")
    .order("local_estoque");

  if (!itens?.length) throw new Error("Nenhum item bipado para exportar.");

  const rows = itens.map(i => ({
    "LOTE":      pedido.lote,
    "CLIENTE":   pedido.cliente,
    "IMEI":      i.imei,
    "MODELO":    i.modelo,
    "GRADE":     i.grade,
    "DESC_ITEM": i.desc_item,
    "COD_ITEM":  i.cod_item,
    "LOCAL":     i.local_estoque,
    "VALOR":     i.valor ? i.valor.toFixed(2).replace(".", ",") : "",
    "BIPADO_EM": i.bipado_em ? new Date(i.bipado_em).toLocaleString("pt-BR") : "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
  XLSX.writeFile(wb, `faturamento_${pedido.lote}.xlsx`);
}