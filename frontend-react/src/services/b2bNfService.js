import * as XLSX from "xlsx";
import { supabase } from "../lib/supabase";

// ── Upload da planilha de NF ─────────────────────────────
export async function importarNFs(file, pedidoId, userId) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const wb   = XLSX.read(e.target.result, { type: "binary" });
        const ws   = wb.Sheets[wb.SheetNames[0]];

        // Pula linha 1 (agrupamento), usa linha 2 como cabeçalho
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null, range: 1 });

        if (!rows.length) throw new Error("Planilha vazia ou formato inválido.");

        // Filtrar apenas linhas com IMEI e NF preenchidos
        const linhasValidas = rows.filter(r => {
          const imei = String(r["IMEI"] || r["NUM_IMEI"] || "").trim();
          const nf   = String(r["Nº NF"] || r["Nº NF.1"] || "").trim();
          return imei.length > 5 && nf && nf !== "null" && nf !== "undefined";
        });

        if (!linhasValidas.length) throw new Error("Nenhum IMEI com NF encontrado na planilha.");

        // Montar mapa IMEI → NF
        const mapa = {};
        linhasValidas.forEach(r => {
          const imei = String(r["IMEI"] || r["NUM_IMEI"] || "").trim();
          // NF pode vir como número serial do Excel — converte para string limpa
          let nf = String(r["Nº NF"] || r["Nº NF.1"] || "").trim();
          // Remove casas decimais se vier como float (ex: "45548.0" → "45548")
          nf = nf.replace(/\.0$/, "");
          mapa[imei] = nf;
        });

        // Buscar itens do pedido que estão nesse mapa
        const imeis = Object.keys(mapa);
        let atualizados = 0;
        let naoEncontrados = 0;

        // Atualizar em chunks de 500
        const CHUNK = 500;
        for (let i = 0; i < imeis.length; i += CHUNK) {
          const chunk = imeis.slice(i, i + CHUNK);

          // Para cada IMEI do chunk, atualizar a NF
          for (const imei of chunk) {
            const { data, error } = await supabase
              .from("b2b_itens")
              .update({ nf: mapa[imei] })
              .eq("pedido_id", pedidoId)
              .eq("imei", imei)
              .select("id");

            if (error || !data?.length) {
              naoEncontrados++;
            } else {
              atualizados++;
            }
          }
        }

        // Calcular totais por NF (itens e caixas distintas)
        const { data: itensPedido } = await supabase
          .from("b2b_itens")
          .select("imei, nf, caixa_id")
          .eq("pedido_id", pedidoId)
          .not("nf", "is", null);

        // Agrupar por NF
        const nfsMap = {};
        (itensPedido || []).forEach(item => {
          if (!item.nf) return;
          if (!nfsMap[item.nf]) nfsMap[item.nf] = { itens: 0, caixas: new Set() };
          nfsMap[item.nf].itens++;
          if (item.caixa_id) nfsMap[item.nf].caixas.add(item.caixa_id);
        });

        // Limpar NFs antigas deste pedido e reinserir
        await supabase.from("b2b_nfs").delete().eq("pedido_id", pedidoId);

        const nfsParaInserir = Object.entries(nfsMap).map(([numero_nf, dados]) => ({
          pedido_id:    pedidoId,
          numero_nf,
          total_itens:  dados.itens,
          total_caixas: dados.caixas.size,
          importado_por: userId,
        }));

        if (nfsParaInserir.length) {
          await supabase.from("b2b_nfs").insert(nfsParaInserir);
        }

        resolve({
          total:         imeis.length,
          atualizados,
          naoEncontrados,
          nfs:           nfsParaInserir,
        });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Erro ao ler o arquivo."));
    reader.readAsBinaryString(file);
  });
}

// ── Listar NFs de um pedido ──────────────────────────────
export async function listarNFs(pedidoId) {
  const { data, error } = await supabase
    .from("b2b_nfs")
    .select("*")
    .eq("pedido_id", pedidoId)
    .order("numero_nf", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ── Buscar resumo NF por caixa ───────────────────────────
export async function resumoNFsPorCaixa(caixaId) {
  const { data, error } = await supabase
    .from("b2b_itens")
    .select("nf")
    .eq("caixa_id", caixaId)
    .not("nf", "is", null);

  if (error) throw new Error(error.message);

  // Contar aparelhos por NF dentro desta caixa
  const contagem = {};
  (data || []).forEach(item => {
    if (!item.nf) return;
    contagem[item.nf] = (contagem[item.nf] || 0) + 1;
  });

  return contagem; // { "45548": 15, "45581": 12 }
}

// ── Buscar resumo global NFs do pedido ───────────────────
export async function resumoNFsPedido(pedidoId) {
  // Buscar todos os itens com NF do pedido
  const { data: itens } = await supabase
    .from("b2b_itens")
    .select("nf, caixa_id")
    .eq("pedido_id", pedidoId)
    .not("nf", "is", null);

  // Buscar todas as caixas do pedido
  const { data: caixas } = await supabase
    .from("b2b_caixas")
    .select("id, numero")
    .eq("pedido_id", pedidoId);

  const caixaNumero = {};
  (caixas || []).forEach(c => { caixaNumero[c.id] = c.numero; });

  // Agrupar por NF
  const nfsMap = {};
  (itens || []).forEach(item => {
    if (!item.nf) return;
    if (!nfsMap[item.nf]) nfsMap[item.nf] = { itens: 0, caixas: new Set() };
    nfsMap[item.nf].itens++;
    if (item.caixa_id) nfsMap[item.nf].caixas.add(caixaNumero[item.caixa_id] || item.caixa_id);
  });

  return Object.entries(nfsMap).map(([nf, dados]) => ({
    nf,
    total_itens:  dados.itens,
    total_caixas: dados.caixas.size,
    caixas:       [...dados.caixas].sort((a, b) => a - b),
  })).sort((a, b) => a.nf.localeCompare(b.nf));
}