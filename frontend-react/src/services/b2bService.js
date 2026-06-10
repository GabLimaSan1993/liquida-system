import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ── Buscar cliente da base pelo nome do Ganhador ─────────
async function resolverCliente(ganhador) {
  if (!ganhador) return "Cliente não identificado";

  const termo = ganhador.substring(0, 30).trim();
  const { data } = await supabase
    .from("b2b_clientes")
    .select("nome, nome_cnpj")
    .ilike("nome_cnpj", `%${termo}%`)
    .limit(1)
    .single();

  if (data?.nome) return data.nome;

  const { data: data2 } = await supabase
    .from("b2b_clientes")
    .select("nome, nome_cnpj")
    .ilike("nome", `%${ganhador.split(" ")[0]}%`)
    .limit(1)
    .single();

  return data2?.nome || ganhador;
}

// ── Parser da planilha de picking ────────────────────────
export async function importarPedidoB2B(file, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];

        const rows = XLSX.utils.sheet_to_json(ws, {
          defval: null,
          range:  1,
        });

        if (!rows.length) throw new Error("Planilha vazia ou formato inválido.");

        // ── Lote: prioriza coluna, fallback para nome do arquivo ──
        const loteColuna = rows.find(r => r["RESERVA"] || r["LOTE"])?.[("RESERVA")] ||
                           rows.find(r => r["RESERVA"] || r["LOTE"])?.[("LOTE")];

        const loteArquivo = file.name
          .replace(/^PICKING[\s_|]+/i, "")  // remove "PICKING_", "PICKING | ", "PICKING| " etc
          .replace(/\.xlsx?$/i, "")
          .replace(/\s*\(\d+\)\s*$/, "")    // remove (2), (3) etc
          .replace(/__\d+_$/g, "")          // remove __2_, __3_ etc
          .replace(/\s+/g, "_")             // espaços viram underscore
          .replace(/_+/g, "_")              // underscores duplos viram um
          .replace(/^_|_$/g, "")
          .trim();

        const lote = loteColuna || loteArquivo || "SEM_LOTE";

        // ── Cliente: busca na base pelo Ganhador ──────────────
        const ganhador = rows[0]["Ganhador"] || "";
        const cliente  = await resolverCliente(ganhador);

        // ── Verificar duplicata ───────────────────────────────
        const { data: existing } = await supabase
          .from("b2b_pedidos")
          .select("id")
          .eq("lote", lote)
          .single();

        if (existing) throw new Error(`Pedido "${lote}" já foi importado.`);

        // ── Criar pedido ──────────────────────────────────────
        const { data: pedido, error: errPedido } = await supabase
          .from("b2b_pedidos")
          .insert({ lote, cliente, total_itens: rows.length, criado_por: userId })
          .select()
          .single();

        if (errPedido) throw new Error(errPedido.message);

        // ── Buscar locais E vouchers reais da assurant_triagem ─
        const imeisLista = rows
          .map(r => String(r["IMEI"] || r["NUM_IMEI"] || "").trim())
          .filter(i => i.length > 5);

        const { data: triagem } = await supabase
          .from("assurant_triagem")
          .select("imei, local, voucher")
          .in("imei", imeisLista);

        const localMap   = {};
        const voucherMap = {};
        (triagem || []).forEach(t => {
          if (t.imei && t.local)   localMap[t.imei]   = t.local;
          if (t.imei && t.voucher) voucherMap[t.imei] = t.voucher;
        });

        // ── Mapear itens ──────────────────────────────────────
        const itens = rows.map(r => {
          const imei = String(r["IMEI"] || r["NUM_IMEI"] || "").trim();
          return {
            pedido_id:     pedido.id,
            imei,
            voucher:       voucherMap[imei] || String(r["NUM_IMEI"] || "").trim(),
            modelo:        r["MODELO"]     || r["CNN"]   || null,
            grade:         r["GRADE"]      || null,
            grade2:        r["GRADE2"]     || null,
            desc_item:     r["DESC_ITEM"]  || null,
            cod_item:      r["COD_ITEM"]   || null,
            local_estoque: localMap[imei]  || r["LOCAL"] || null,
            aging:         r["AGING"]      ? parseInt(r["AGING"])        : null,
            valor:         r["Alocação $"] ? parseFloat(r["Alocação $"]) : null,
            status:        "pendente",
          };
        }).filter(i => i.imei && i.imei.length > 5);

        await supabase
          .from("b2b_pedidos")
          .update({ total_itens: itens.length })
          .eq("id", pedido.id);

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

// ── Buscar histórico de exportações ─────────────────────
export async function listarExportacoes(pedidoId) {
  const { data, error } = await supabase
    .from("b2b_exportacoes")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("exportado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Registrar bipagem ────────────────────────────────────
export async function registrarBipagem(imeiDigitado, pedidoId, userId) {
  const imei = String(imeiDigitado).trim();

  const { data: item, error: errItem } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("imei", imei)
    .single();

  if (errItem || !item) {
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

  await supabase.rpc("b2b_atualizar_contador", { p_pedido_id: pedidoId });

  return { ok: true, item };
}

// ── Marcar como Não Localizado ───────────────────────────
export async function marcarNaoLocalizado(itemId, userId) {
  const { error } = await supabase
    .from("b2b_itens")
    .update({
      status:             "nao_localizado",
      nao_localizado_em:  new Date().toISOString(),
      nao_localizado_por: userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

// ── Reverter Não Localizado → Pendente ───────────────────
export async function reverterNaoLocalizado(itemId, novoLocal) {
  const { error } = await supabase
    .from("b2b_itens")
    .update({
      status:               "pendente",
      local_estoque:        novoLocal,
      nao_localizado_em:    null,
      nao_localizado_por:   null,
      nao_localizado_local: novoLocal,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

// ── Exportar para faturamento (com controle de delta) ────
export async function exportarFaturamento(pedidoId, userId, nomeUsuario) {

  const { data: exportacoes } = await supabase
    .from("b2b_exportacoes")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("exportado_em", { ascending: false });

  const ultimaExportacao = exportacoes?.[0] || null;

  let idsJaExportados = new Set();
  if (exportacoes?.length > 0) {
    const { data: jaExportados } = await supabase
      .from("b2b_itens_exportados")
      .select("item_id")
      .in("exportacao_id", exportacoes.map(e => e.id));
    (jaExportados || []).forEach(e => idsJaExportados.add(e.item_id));
  }

  const { data: itensBipados } = await supabase
    .from("b2b_itens")
    .select("*")
    .eq("pedido_id", pedidoId)
    .eq("status", "bipado")
    .order("local_estoque");

  if (!itensBipados?.length) {
    throw new Error("Nenhum item bipado para exportar.");
  }

  const itensNovos = itensBipados.filter(i => !idsJaExportados.has(i.id));

  if (itensNovos.length === 0) {
    return {
      bloqueado: true,
      ultimaExportacao,
      msg: `Nenhum item novo para exportar. A última versão (${ultimaExportacao.total_itens} itens) já foi baixada por ${ultimaExportacao.nome_usuario} em ${new Date(ultimaExportacao.exportado_em).toLocaleString("pt-BR")}.`,
    };
  }

  const { data: pedido } = await supabase
    .from("b2b_pedidos")
    .select("*")
    .eq("id", pedidoId)
    .single();

  const { data: novaExportacao, error: errExp } = await supabase
    .from("b2b_exportacoes")
    .insert({
      pedido_id:     pedidoId,
      exportado_por: userId,
      nome_usuario:  nomeUsuario,
      total_itens:   itensNovos.length,
    })
    .select()
    .single();

  if (errExp) throw new Error(errExp.message);

  const CHUNK = 500;
  const linksItens = itensNovos.map(i => ({
    exportacao_id: novaExportacao.id,
    item_id:       i.id,
  }));
  for (let i = 0; i < linksItens.length; i += CHUNK) {
    await supabase
      .from("b2b_itens_exportados")
      .insert(linksItens.slice(i, i + CHUNK));
  }

  const numeroExportacao = (exportacoes?.length || 0) + 1;
  const rows = itensNovos.map(i => ({
    "LOTE":      pedido.lote,
    "CLIENTE":   pedido.cliente,
    "VOUCHER":   i.voucher,
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
  const nomeArquivo = `faturamento_${pedido.lote}_v${numeroExportacao}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  return {
    bloqueado:        false,
    total:            itensNovos.length,
    numeroExportacao,
    nomeArquivo,
  };
}