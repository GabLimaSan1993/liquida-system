import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

async function resolverCliente(ganhador) {
  if (!ganhador) return "Cliente não identificado";
  const termo = ganhador.substring(0, 30).trim();
  const { data } = await supabase
    .from("b2b_clientes").select("nome, nome_cnpj").ilike("nome_cnpj", `%${termo}%`).limit(1).single();
  if (data?.nome) return data.nome;
  const { data: data2 } = await supabase
    .from("b2b_clientes").select("nome, nome_cnpj").ilike("nome", `%${ganhador.split(" ")[0]}%`).limit(1).single();
  return data2?.nome || ganhador;
}

export async function importarPedidoB2B(file, userId, extras = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "binary" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const allRows    = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
        const rawHeaders = allRows[1] || [];

        const valorIdx = rawHeaders.findIndex(h => {
          if (!h) return false;
          const norm = String(h).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
          return norm.includes("alocacao") && String(h).includes("$");
        });

        const rows = XLSX.utils.sheet_to_json(ws, { defval: null, range: 1 });
        if (!rows.length) throw new Error("Planilha vazia ou formato inválido.");

        const loteColuna = rows.find(r => r["RESERVA"] || r["LOTE"])?.[("RESERVA")] ||
                           rows.find(r => r["RESERVA"] || r["LOTE"])?.[("LOTE")];
        const loteArquivo = file.name
          .replace(/^PICKING[\s_|]+/i, "").replace(/\.xlsx?$/i, "")
          .replace(/\s*\(\d+\)\s*$/, "").replace(/__\d+_$/g, "")
          .replace(/\s+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "").trim();
        const lote = loteColuna || loteArquivo || "SEM_LOTE";

        const ganhador = rows[0]["Ganhador"] || "";
        const cliente  = await resolverCliente(ganhador);

        const { data: existing } = await supabase.from("b2b_pedidos").select("id").eq("lote", lote).single();
        if (existing) throw new Error(`Pedido "${lote}" já foi importado.`);

        const { data: pedido, error: errPedido } = await supabase
          .from("b2b_pedidos")
          .insert({
            lote,
            cliente,
            total_itens:        rows.length,
            criado_por:         userId,
            condicao_pagamento: extras.condicao_pagamento || null,
            cnpj_agregado:      extras.cnpj_agregado      || null,
            status_picking:     "em_andamento",
            status_faturamento: "pendente",
          })
          .select().single();
        if (errPedido) throw new Error(errPedido.message);

        const imeisLista = rows.map(r => String(r["IMEI"] || r["NUM_IMEI"] || "").trim()).filter(i => i.length > 5);

        const { data: triagem } = await supabase
          .from("assurant_triagem")
          .select("imei, local, voucher, criado_em")
          .in("imei", imeisLista)
          .order("criado_em", { ascending: false });

        const localMap = {}, voucherMap = {};
        (triagem || []).forEach(t => {
          if (!t.imei) return;
          if (t.local   && !localMap[t.imei])   localMap[t.imei]   = t.local;
          if (t.voucher && !voucherMap[t.imei]) voucherMap[t.imei] = t.voucher;
        });

        const itens = rows.map((r, rowIdx) => {
          const imei = String(r["IMEI"] || r["NUM_IMEI"] || "").trim();
          let valor = null;
          if (valorIdx >= 0) {
            const rawVal = allRows[rowIdx + 2]?.[valorIdx];
            if (rawVal != null && !isNaN(parseFloat(rawVal))) valor = parseFloat(rawVal);
          }
          if (valor === null) {
            const k = Object.keys(r).find(k => k.includes("$"));
            if (k && r[k] != null) valor = parseFloat(r[k]);
          }
          return {
            pedido_id: pedido.id, imei,
            voucher:       voucherMap[imei] || null,
            modelo:        r["MODELO"]  || r["CNN"]  || null,
            grade:         r["GRADE"]   || null,
            grade2:        r["GRADE2"]  || null,
            desc_item:     r["DESC_ITEM"] || null,
            cod_item:      r["COD_ITEM"]  || null,
            local_estoque: localMap[imei] || r["LOCAL"] || null,
            aging:         r["AGING"] ? parseInt(r["AGING"]) : null,
            valor, status: "pendente",
          };
        }).filter(i => i.imei && i.imei.length > 5);

        await supabase.from("b2b_pedidos").update({ total_itens: itens.length }).eq("id", pedido.id);

        const CHUNK = 500;
        for (let i = 0; i < itens.length; i += CHUNK) {
          const { error } = await supabase.from("b2b_itens").insert(itens.slice(i, i + CHUNK));
          if (error) throw new Error(error.message);
        }
        resolve({ pedido, total: itens.length, lote, cliente });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

export async function listarPedidosB2B() {
  const { data, error } = await supabase.from("b2b_pedidos").select("*").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarItens(pedidoId) {
  const { data, error } = await supabase.from("b2b_itens").select("*").eq("pedido_id", pedidoId).order("local_estoque", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function listarItensComStatusGaia(pedidoId) {
  const { data: itens, error } = await supabase
    .from("b2b_itens").select("*").eq("pedido_id", pedidoId).order("local_estoque", { ascending: true });
  if (error) throw new Error(error.message);
  if (!itens?.length) return [];

  const imeis = itens.map(i => i.imei).filter(Boolean);
  const { data: triagem } = await supabase
    .from("assurant_triagem").select("imei, status_atual, local").in("imei", imeis);

  const gaiaMap = {};
  (triagem || []).forEach(t => { if (t.imei) gaiaMap[t.imei] = t; });

  return itens.map(i => ({
    ...i,
    status_gaia: gaiaMap[i.imei]?.status_atual || null,
    local_gaia:  gaiaMap[i.imei]?.local || null,
  }));
}

export async function listarExportacoes(pedidoId) {
  const { data, error } = await supabase.from("b2b_exportacoes").select("*").eq("pedido_id", pedidoId).order("exportado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

export async function registrarBipagem(imeiDigitado, pedidoId, userId) {
  const imei = String(imeiDigitado).trim();
  const { data: item, error: errItem } = await supabase.from("b2b_itens").select("*").eq("pedido_id", pedidoId).eq("imei", imei).single();
  if (errItem || !item) {
    const { data: outroItem } = await supabase.from("b2b_itens").select("pedido_id, status").eq("imei", imei).eq("status", "bipado").single();
    if (outroItem) return { ok: false, erro: "IMEI já bipado em outro pedido — reservado." };
    return { ok: false, erro: "IMEI não encontrado neste pedido." };
  }
  if (item.status === "bipado") return { ok: false, erro: "IMEI já bipado neste pedido.", item };
  const { error: errUpdate } = await supabase.from("b2b_itens")
    .update({ status: "bipado", imei_bipado: imei, bipado_em: new Date().toISOString(), bipado_por: userId })
    .eq("id", item.id);
  if (errUpdate) return { ok: false, erro: errUpdate.message };
  await supabase.rpc("b2b_atualizar_contador", { p_pedido_id: pedidoId });
  await verificarConclusaoPicking(pedidoId);
  await verificarConclusaoFaturamento(pedidoId);
  return { ok: true, item };
}

export async function marcarNaoLocalizado(itemId, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "nao_localizado",
      nao_localizado_em:  new Date().toISOString(),
      nao_localizado_por: userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function marcarEmAnalise(itemId, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "em_analise",
      nao_localizado_em:  new Date().toISOString(),
      nao_localizado_por: userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);
}

export async function marcarLocalizado(itemId, novaLocalizacao, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "bipado",
      local_estoque:      novaLocalizacao,
      localizado_em:      new Date().toISOString(),
      localizado_por:     userId,
      localizado_local:   novaLocalizacao,
      nao_localizado_em:  null,
      nao_localizado_por: null,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  const { data: item } = await supabase.from("b2b_itens").select("pedido_id").eq("id", itemId).single();
  if (item?.pedido_id) {
    await supabase.rpc("b2b_atualizar_contador", { p_pedido_id: item.pedido_id });
    await verificarConclusaoPicking(item.pedido_id);
    await verificarConclusaoFaturamento(item.pedido_id);
  }
}

export async function marcarNaoFaturar(itemId, motivo, observacao, userId) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:             "nao_faturar",
      motivo_nao_faturar: motivo,
      obs_nao_faturar:    observacao || null,
      nao_faturar_em:     new Date().toISOString(),
      nao_faturar_por:    userId,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  const { data: item } = await supabase.from("b2b_itens").select("pedido_id").eq("id", itemId).single();
  if (item?.pedido_id) {
    await verificarConclusaoPicking(item.pedido_id);
    await verificarConclusaoFaturamento(item.pedido_id);
  }
}

export async function reverterNaoLocalizado(itemId, novoLocal) {
  const { error } = await supabase.from("b2b_itens")
    .update({
      status:               "pendente",
      local_estoque:        novoLocal,
      nao_localizado_em:    null,
      nao_localizado_por:   null,
      nao_localizado_local: novoLocal,
    })
    .eq("id", itemId);
  if (error) throw new Error(error.message);

  // Reverter pode "reabrir" o picking se ele estava concluído
  const { data: item } = await supabase.from("b2b_itens").select("pedido_id").eq("id", itemId).single();
  if (item?.pedido_id) await reabrirPickingSeNecessario(item.pedido_id);
}

export async function exportarFaturamento(pedidoId, userId, nomeUsuario) {
  const { data: exportacoes } = await supabase.from("b2b_exportacoes").select("*").eq("pedido_id", pedidoId).order("exportado_em", { ascending: false });
  const ultimaExportacao = exportacoes?.[0] || null;

  let idsJaExportados = new Set();
  if (exportacoes?.length > 0) {
    const { data: jaExportados } = await supabase.from("b2b_itens_exportados").select("item_id").in("exportacao_id", exportacoes.map(e => e.id));
    (jaExportados || []).forEach(e => idsJaExportados.add(e.item_id));
  }

  const { data: itensBipados } = await supabase
    .from("b2b_itens").select("*")
    .eq("pedido_id", pedidoId)
    .eq("status", "bipado")
    .order("local_estoque");
  if (!itensBipados?.length) throw new Error("Nenhum item bipado para exportar.");

  const itensNovos = itensBipados.filter(i => !idsJaExportados.has(i.id));
  if (itensNovos.length === 0) {
    return {
      bloqueado: true, ultimaExportacao,
      msg: `Nenhum item novo para exportar. A última versão (${ultimaExportacao.total_itens} itens) já foi baixada por ${ultimaExportacao.nome_usuario} em ${new Date(ultimaExportacao.exportado_em).toLocaleString("pt-BR")}.`,
    };
  }

  const { data: pedido } = await supabase.from("b2b_pedidos").select("*").eq("id", pedidoId).single();
  const { data: clienteData } = await supabase.from("b2b_clientes").select("cnpj").eq("nome", pedido.cliente).single();
  const cnpj = clienteData?.cnpj || "";

  const { data: novaExportacao, error: errExp } = await supabase.from("b2b_exportacoes")
    .insert({ pedido_id: pedidoId, exportado_por: userId, nome_usuario: nomeUsuario, total_itens: itensNovos.length })
    .select().single();
  if (errExp) throw new Error(errExp.message);

  const CHUNK = 500;
  const linksItens = itensNovos.map(i => ({ exportacao_id: novaExportacao.id, item_id: i.id }));
  for (let i = 0; i < linksItens.length; i += CHUNK) {
    await supabase.from("b2b_itens_exportados").insert(linksItens.slice(i, i + CHUNK));
  }

  const numeroExportacao = (exportacoes?.length || 0) + 1;
  const rows = itensNovos.map(i => ({
    "LOTE":      pedido.lote,
    "CLIENTE":   pedido.cliente,
    "CNPJ":      cnpj,
    "VOUCHER":   i.voucher,
    "IMEI":      i.imei,
    "MODELO":    i.modelo,
    "GRADE":     i.grade,
    "DESC_ITEM": i.desc_item,
    "COD_ITEM":  i.cod_item,
    "LOCAL":     i.local_estoque,
    "VALOR":     i.valor != null ? i.valor.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "",
    "BIPADO_EM": i.bipado_em ? new Date(i.bipado_em).toLocaleString("pt-BR") : "",
    "NF":        i.nf || "",
    "OBSERVAÇÕES": i.obs_nf || "",
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Faturamento");
  const nomeArquivo = `faturamento_${pedido.lote}_v${numeroExportacao}.xlsx`;
  XLSX.writeFile(wb, nomeArquivo);

  return { bloqueado: false, total: itensNovos.length, numeroExportacao, nomeArquivo };
}

// ══════════════════════════════════════════════════════════
// CONCLUSÃO DE PICKING — independente de NF
// Conclui quando todos os itens estão em estado terminal
// (bipado ou nao_faturar), sem pendentes nem em análise.
// ══════════════════════════════════════════════════════════
async function verificarConclusaoPicking(pedidoId) {
  const { data: itens } = await supabase
    .from("b2b_itens").select("status")
    .eq("pedido_id", pedidoId);

  const todos           = itens || [];
  const total           = todos.length;
  const totalPendentes  = todos.filter(i => i.status === "pendente").length;
  const totalAnalise    = todos.filter(i => ["nao_localizado", "em_analise"].includes(i.status)).length;
  const totalBipados    = todos.filter(i => i.status === "bipado").length;
  const totalNaoFaturar = todos.filter(i => i.status === "nao_faturar").length;

  const pickingCompleto = total > 0
    && totalPendentes === 0
    && totalAnalise === 0
    && (totalBipados + totalNaoFaturar) === total;

  if (pickingCompleto) {
    await supabase
      .from("b2b_pedidos")
      .update({ status_picking: "concluido" })
      .eq("id", pedidoId);
    return true;
  }
  return false;
}

// ══════════════════════════════════════════════════════════
// CONCLUSÃO DE FATURAMENTO — depende de NF
// pendente  → nenhuma NF importada
// parcial   → NFs cobrem parte dos bipados
// concluido → NFs cobrem todos os bipados
// ══════════════════════════════════════════════════════════
async function verificarConclusaoFaturamento(pedidoId) {
  const { data: itens } = await supabase
    .from("b2b_itens").select("status, nf, nf_erro")
    .eq("pedido_id", pedidoId);

  const { data: todasNFs } = await supabase
    .from("b2b_nfs").select("total_itens")
    .eq("pedido_id", pedidoId);

  const todos          = itens || [];
  const total          = todos.length;
  const totalBipados   = todos.filter(i => i.status === "bipado").length;
  const bipadosComNF   = todos.filter(i => i.status === "bipado" && i.nf && !i.nf_erro).length;
  const bipadosComErro = todos.filter(i => i.status === "bipado" && i.nf_erro).length;
  const totalComNF     = (todasNFs || []).reduce((s, n) => s + (n.total_itens || 0), 0);

  // Cobertura por qualquer um dos dois sinais (item.nf OU total_itens da NF)
  const cobertura = Math.max(bipadosComNF, totalComNF);

  let statusFaturamento;
  if (totalBipados === 0) {
    // Pedido sem nenhum bipado (tudo nao_faturar) — faturamento não se aplica, conclui
    statusFaturamento = "concluido";
  } else if (bipadosComErro > 0) {
    // Algum item bipado teve erro na emissão da NF — sinaliza e bloqueia a conclusão
    statusFaturamento = "erro_nf";
  } else if (cobertura === 0) {
    statusFaturamento = "pendente";
  } else if (cobertura >= totalBipados) {
    statusFaturamento = "concluido";
  } else {
    statusFaturamento = "parcial";
  }

  await supabase
    .from("b2b_pedidos")
    .update({ status_faturamento: statusFaturamento })
    .eq("id", pedidoId);

  // Mantém o status legado sincronizado: concluído só quando ambas etapas fecham
  const { data: pedido } = await supabase
    .from("b2b_pedidos").select("status_picking").eq("id", pedidoId).single();
  if (pedido?.status_picking === "concluido" && statusFaturamento === "concluido") {
    await supabase.from("b2b_pedidos").update({ status: "concluido" }).eq("id", pedidoId);
  }

  return statusFaturamento;
}

// ══════════════════════════════════════════════════════════
// REABRIR PICKING — quando um item volta para pendente/análise
// ══════════════════════════════════════════════════════════
async function reabrirPickingSeNecessario(pedidoId) {
  const { data: itens } = await supabase
    .from("b2b_itens").select("status")
    .eq("pedido_id", pedidoId);

  const todos          = itens || [];
  const temNaoTerminal = todos.some(i => ["pendente", "nao_localizado", "em_analise"].includes(i.status));

  if (temNaoTerminal) {
    await supabase
      .from("b2b_pedidos")
      .update({ status_picking: "em_andamento", status: "aberto" })
      .eq("id", pedidoId);
  }
}

export async function importarNFPlanilha(file, pedidoId, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: "binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

        if (!rows.length) throw new Error("Planilha vazia.");

        // "Erro" na coluna NF marca o item com falha de emissão (sem NF real)
        const ehErro = (v) => String(v ?? "").trim().toLowerCase() === "erro";
        const lerObs = (r) =>
          r["OBSERVAÇÕES"] ?? r["OBSERVACOES"] ?? r["Observações"] ?? r["OBS"] ?? null;

        const linhasComNF = rows.filter(r => r["NF"] && String(r["NF"]).trim() !== "");
        if (!linhasComNF.length) throw new Error("Nenhuma linha com NF preenchida encontrada.");

        // Duas trilhas no mesmo arquivo: linhas com NF real e linhas marcadas como "Erro"
        const linhasErro = linhasComNF.filter(r =>  ehErro(r["NF"]));
        const linhasNF   = linhasComNF.filter(r => !ehErro(r["NF"]));

        const { data: pedido, error: errPedido } = await supabase
          .from("b2b_pedidos").select("*").eq("id", pedidoId).single();
        if (errPedido || !pedido) throw new Error("Pedido não encontrado.");

        // ───── Trilha 1: linhas com número de NF real ─────
        const nfMap = {};
        for (const row of linhasNF) {
          const nf       = String(row["NF"]).trim();
          const imei     = String(row["IMEI"] || "").trim();
          const valorRaw = row["VALOR"] ? String(row["VALOR"]).replace(/,/g, "") : "0";
          const valor    = parseFloat(valorRaw) || 0;

          if (!nfMap[nf]) nfMap[nf] = { itens: [], valorTotal: 0 };
          nfMap[nf].itens.push(imei);
          nfMap[nf].valorTotal += valor;
        }

        const { data: nfsExistentes } = await supabase
          .from("b2b_nfs").select("numero_nf").eq("pedido_id", pedidoId);
        const nfsJaCadastradas = new Set((nfsExistentes || []).map(n => String(n.numero_nf)));

        const nfsParaInserir  = Object.entries(nfMap).filter(([nf]) => !nfsJaCadastradas.has(nf));
        const nfsParaRelinkar = Object.entries(nfMap).filter(([nf]) =>  nfsJaCadastradas.has(nf));

        const nfsInseridas  = [];
        const nfsRelinkadas = [];

        for (const [numeroNf, dados] of nfsParaInserir) {
          const { data: nfInserida, error: errNF } = await supabase
            .from("b2b_nfs")
            .insert({
              pedido_id:        pedidoId,
              numero_nf:        numeroNf,
              total_itens:      dados.itens.length,
              total_caixas:     0,
              valor_total:      dados.valorTotal,
              data_faturamento: new Date().toISOString(),
              importado_por:    userId,
            })
            .select().single();
          if (errNF) throw new Error(`Erro ao inserir NF ${numeroNf}: ${errNF.message}`);
          nfsInseridas.push(nfInserida);

          // NF real chegou: vincula e limpa qualquer erro anterior desses itens
          const imeisNF = dados.itens.filter(i => i.length > 5);
          if (imeisNF.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < imeisNF.length; i += CHUNK) {
              await supabase
                .from("b2b_itens")
                .update({ nf: numeroNf, nf_erro: false, obs_nf: null })
                .eq("pedido_id", pedidoId)
                .in("imei", imeisNF.slice(i, i + CHUNK));
            }
          }
        }

        for (const [numeroNf, dados] of nfsParaRelinkar) {
          const imeisNF = dados.itens.filter(i => i.length > 5);
          if (imeisNF.length > 0) {
            const CHUNK = 500;
            for (let i = 0; i < imeisNF.length; i += CHUNK) {
              await supabase
                .from("b2b_itens")
                .update({ nf: numeroNf, nf_erro: false, obs_nf: null })
                .eq("pedido_id", pedidoId)
                .in("imei", imeisNF.slice(i, i + CHUNK));
            }
          }
          nfsRelinkadas.push(numeroNf);
        }

        // ───── Trilha 2: linhas marcadas como "Erro" (por item, via IMEI) ─────
        let totalErros = 0;
        for (const row of linhasErro) {
          const imei = String(row["IMEI"] || "").trim();
          if (imei.length <= 5) continue;
          const { error: errErro } = await supabase
            .from("b2b_itens")
            .update({ nf: null, nf_erro: true, obs_nf: lerObs(row) })
            .eq("pedido_id", pedidoId)
            .eq("imei", imei);
          if (!errErro) totalErros++;
        }

        const totalNFs = nfsInseridas.length + nfsRelinkadas.length;
        if (totalNFs === 0 && totalErros === 0) {
          throw new Error("Nenhuma NF nem erro foi processado.");
        }

        // Recalcula o status do faturamento do zero, olhando o estado real dos itens
        await verificarConclusaoFaturamento(pedidoId);

        const todasAsNFs = [...nfsInseridas.map(n => n.numero_nf), ...nfsRelinkadas];

        resolve({
          ok:         true,
          totalNFs,
          totalErros,
          totalItens: linhasNF.length,
          nfs:        todasAsNFs,
          relinkadas: nfsRelinkadas.length,
        });
      } catch (err) { reject(err); }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

export async function importarNFPedido(pedidoId, numeroNf, totalItens, totalCaixas, userId) {
  const { data: itensData } = await supabase
    .from("b2b_itens").select("valor").eq("pedido_id", pedidoId).eq("status", "bipado");
  const valor = (itensData || []).reduce((s, i) => s + (i.valor || 0), 0);

  const { data, error } = await supabase.from("b2b_nfs")
    .insert({
      pedido_id:        pedidoId,
      numero_nf:        numeroNf,
      total_itens:      totalItens,
      total_caixas:     totalCaixas,
      valor_total:      valor,
      data_faturamento: new Date().toISOString(),
      importado_por:    userId,
    })
    .select().single();
  if (error) throw new Error(error.message);

  await verificarConclusaoFaturamento(pedidoId);
  return data;
}

// ══════════════════════════════════════════════════════════
// MARCAR ERRO DE NF MANUALMENTE (pela tela, sem planilha)
// Para casos em que a emissão falhou no outro sistema e o
// pedido já está em andamento (não dá pra reexportar a planilha).
// ══════════════════════════════════════════════════════════
export async function marcarErroNFManual(pedidoId, imeiDigitado, observacao, userId) {
  const imei = String(imeiDigitado || "").trim();
  if (!imei) return { ok: false, erro: "Informe o IMEI do item." };

  const { data: item, error: errItem } = await supabase
    .from("b2b_itens").select("id, status")
    .eq("pedido_id", pedidoId).eq("imei", imei).single();
  if (errItem || !item) return { ok: false, erro: "IMEI não encontrado neste pedido." };
  if (item.status !== "bipado") {
    return { ok: false, erro: "Só é possível marcar erro de NF em item bipado." };
  }

  const { error: errUpd } = await supabase
    .from("b2b_itens")
    .update({ nf: null, nf_erro: true, obs_nf: (observacao || "").trim() || null })
    .eq("id", item.id);
  if (errUpd) return { ok: false, erro: errUpd.message };

  await verificarConclusaoFaturamento(pedidoId);
  return { ok: true };
}

// ══════════════════════════════════════════════════════════
// LIMPAR ERRO DE NF de um item (desfaz a marcação)
// ══════════════════════════════════════════════════════════
export async function limparErroNF(pedidoId, imeiDigitado, userId) {
  const imei = String(imeiDigitado || "").trim();
  if (!imei) return { ok: false, erro: "IMEI inválido." };

  const { error } = await supabase
    .from("b2b_itens")
    .update({ nf_erro: false, obs_nf: null })
    .eq("pedido_id", pedidoId).eq("imei", imei);
  if (error) return { ok: false, erro: error.message };

  await verificarConclusaoFaturamento(pedidoId);
  return { ok: true };
}

export async function buscarResumoValorPedido(pedidoId) {
  const [{ data: itensData }, { data: nfsData }] = await Promise.all([
    supabase.from("b2b_itens").select("status, valor, nf, nf_erro, obs_nf, imei").eq("pedido_id", pedidoId),
    supabase.from("b2b_nfs").select("total_itens, valor_total").eq("pedido_id", pedidoId),
  ]);

  const itens = itensData || [];
  const nfs   = nfsData   || [];

  const totalValor      = itens.reduce((s, i) => s + (i.valor || 0), 0);
  const itensBipados    = itens.filter(i => i.status === "bipado");
  const valorBipado     = itensBipados.reduce((s, i) => s + (i.valor || 0), 0);
  const qtdBipados      = itensBipados.length;
  const itensNaoFaturar = itens.filter(i => i.status === "nao_faturar");
  const valorNaoFaturar = itensNaoFaturar.reduce((s, i) => s + (i.valor || 0), 0);
  const qtdNaoFaturar   = itensNaoFaturar.length;
  const qtdEmAnalise    = itens.filter(i => ["nao_localizado", "em_analise"].includes(i.status)).length;

  // Itens bipados que tiveram erro na emissão da NF
  const itensErro = itensBipados
    .filter(i => i.nf_erro)
    .map(i => ({ imei: i.imei, obs: i.obs_nf || "", valor: i.valor || 0 }));
  const qtdErro   = itensErro.length;
  const valorErro = itensErro.reduce((s, i) => s + (i.valor || 0), 0);

  const valorFaturado = nfs.reduce((s, n) => s + (n.valor_total || 0), 0);
  const qtdFaturada   = nfs.reduce((s, n) => s + (n.total_itens || 0), 0);

  return {
    totalValor, valorBipado, qtdBipados,
    valorFaturado, qtdFaturada,
    valorNaoFaturar, qtdNaoFaturar, qtdEmAnalise,
    itensErro, qtdErro, valorErro,
  };
}

export async function listarNFsPedido(pedidoId) {
  const { data: nfs } = await supabase
    .from("b2b_nfs")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("data_faturamento", { ascending: true });

  if (!nfs?.length) return [];

  const userIds = [...new Set(nfs.map(n => n.importado_por).filter(Boolean))];
  let nomeMap = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, nome")
      .in("id", userIds);
    (profiles || []).forEach(p => { nomeMap[p.id] = p.nome; });
  }

  return nfs.map(n => ({
    ...n,
    nome_importador: nomeMap[n.importado_por] || "—",
  }));
}

export async function listarExportacoesPedido(pedidoId) {
  const { data } = await supabase
    .from("b2b_exportacoes")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("exportado_em", { ascending: true });
  return data || [];
}

export async function listarPedidosConcluidos() {
  const { data: pedidos, error } = await supabase
    .from("b2b_pedidos").select("*").eq("status", "concluido").order("criado_em", { ascending: false });
  if (error) throw new Error(error.message);
  if (!pedidos?.length) return [];

  const pedidoIds = pedidos.map(p => p.id);

  const { data: nfsRaw } = await supabase
    .from("b2b_nfs")
    .select("*")
    .in("pedido_id", pedidoIds)
    .order("data_faturamento", { ascending: true });

  const nfUserIds = [...new Set((nfsRaw || []).map(n => n.importado_por).filter(Boolean))];
  let nfNomeMap = {};
  if (nfUserIds.length > 0) {
    const { data: profiles } = await supabase
      .from("user_profiles")
      .select("id, nome")
      .in("id", nfUserIds);
    (profiles || []).forEach(p => { nfNomeMap[p.id] = p.nome; });
  }

  const nfs = (nfsRaw || []).map(n => ({
    ...n,
    nome_importador: nfNomeMap[n.importado_por] || "—",
  }));

  const { data: exportacoesRaw } = await supabase
    .from("b2b_exportacoes")
    .select("*")
    .in("pedido_id", pedidoIds)
    .order("exportado_em", { ascending: true });

  const { data: itens } = await supabase
    .from("b2b_itens").select("pedido_id, valor, status")
    .in("pedido_id", pedidoIds);

  return pedidos.map(p => {
    const nfsPedido         = nfs.filter(n => n.pedido_id === p.id);
    const exportacoesPedido = (exportacoesRaw || []).filter(e => e.pedido_id === p.id);
    const itensPedido       = (itens || []).filter(i => i.pedido_id === p.id);

    const valorFat = nfsPedido.length > 0
      ? nfsPedido.reduce((s, n) => s + (n.valor_total || 0), 0)
      : itensPedido.filter(i => i.status === "bipado").reduce((s, i) => s + (i.valor || 0), 0);

    const dataPedido = p.data_pedido ? new Date(p.data_pedido) : new Date(p.criado_em);
    const datasNF    = nfsPedido.map(n => new Date(n.data_faturamento || n.importado_em));
    const tempoMedio = datasNF.length > 0
      ? datasNF.reduce((s, d) => s + (d - dataPedido), 0) / datasNF.length / (1000 * 60 * 60 * 24)
      : null;

    return {
      ...p,
      nfs:         nfsPedido,
      exportacoes: exportacoesPedido,
      valorFat,
      tempoMedio:  tempoMedio ? Math.round(tempoMedio) : null,
      anoPedido:   dataPedido.getFullYear(),
      mesPedido:   dataPedido.getMonth() + 1,
    };
  });
}