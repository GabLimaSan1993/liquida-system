import { supabase } from "../lib/supabase.js";

const REQUISICOES_ABERTAS = ["solicitada", "separada"];
const COMPRAS_ABERTAS = ["necessidade_aberta", "em_cotacao", "comprada"];

function verificar(resultado) {
  if (resultado.error) throw resultado.error;
  return resultado.data;
}

export function diasDeAging(data) {
  if (!data) return 0;
  const instante = new Date(data).getTime();
  return Number.isFinite(instante) ? Math.max(0, Math.floor((Date.now() - instante) / 86400000)) : 0;
}

export function pendenciaAberta(item, tipo) {
  return (tipo === "compra" ? COMPRAS_ABERTAS : REQUISICOES_ABERTAS).includes(item.status);
}

// O cadastro de estoque é compartilhado com a Gestão de Estoque LB;
// apenas peças (nunca insumos) podem ser requisitadas nesta tela.
export async function carregarPendenciasLavadora(osId) {
  const [diagnosticos, requisicoes, compras, estoque, reservas] = await Promise.all([
    supabase.from("linha_branca_reparo_diagnosticos").select("*").eq("os_id", osId).order("updated_at", { ascending: false }),
    supabase.from("linha_branca_pecas_requisicoes").select("*").eq("os_id", osId).order("created_at", { ascending: true }),
    supabase.from("linha_branca_necessidades_compra").select("*").eq("os_id", osId).order("created_at", { ascending: true }),
    supabase.from("linha_branca_pecas_estoque").select("id,pn,descricao,saldo,marca,localizacao,tipo_item,ativo")
      .eq("ativo", true).neq("tipo_item", "INSUMO").order("descricao", { ascending: true }).limit(1000),
    supabase.from("linha_branca_pecas_requisicoes").select("estoque_id,quantidade,status")
      .in("status", REQUISICOES_ABERTAS).not("estoque_id", "is", null).limit(1000),
  ]);
  const reservado = new Map();
  verificar(reservas).forEach((item) => {
    const key = String(item.estoque_id);
    reservado.set(key, (reservado.get(key) || 0) + Number(item.quantidade || 0));
  });
  return {
    diagnosticos: verificar(diagnosticos),
    requisicoes: verificar(requisicoes),
    compras: verificar(compras),
    estoque: verificar(estoque).map((item) => ({
      ...item,
      disponivel: Math.max(0, Number(item.saldo || 0) - (reservado.get(String(item.id)) || 0)),
    })),
  };
}

// Não cria execução concluída, não movimenta peças e não altera a fase da OS.
// O mesmo diagnóstico é reeditável, mas a data de criação não é reiniciada.
export async function salvarDiagnosticoPendente(os, area, execucao, profile) {
  const diagnostico = String(execucao.diagnostico_final || "").trim();
  if (!os?.id || !area || !diagnostico) throw new Error("Selecione a área e preencha o diagnóstico.");
  if (!profile?.id) throw new Error("Identifique o usuário antes de registrar o diagnóstico.");
  const original = verificar(await supabase.from("linha_branca_reparo_diagnosticos")
    .select("id,criado_por").eq("os_id", os.id).eq("area_reparo", area).maybeSingle());
  const registro = {
    os_id: os.id,
    area_reparo: area,
    diagnostico,
    servicos: execucao.servicos || [],
    observacoes: String(execucao.observacoes || "").trim() || null,
    tecnico_nome: profile.nome || "Operação",
    updated_at: new Date().toISOString(),
  };
  if (original?.id) {
    return verificar(await supabase.from("linha_branca_reparo_diagnosticos")
      .update(registro).eq("id", original.id).select("*").single());
  }
  return verificar(await supabase.from("linha_branca_reparo_diagnosticos")
    .insert({ ...registro, criado_por: profile.id }).select("*").single());
}

export async function registrarNecessidadePeca({ os, diagnostico, descricao, estoqueId, quantidade, defeito, profile, estoque }) {
  const qtd = Number(quantidade);
  const nomePeca = String(descricao || "").trim();
  if (!os?.id || !diagnostico?.id || !nomePeca || !Number.isFinite(qtd) || qtd <= 0 || qtd > 10000) {
    throw new Error("Preencha a peça, a quantidade e salve o diagnóstico.");
  }
  if (!profile?.id) throw new Error("Usuário sem identificação para requisitar peças.");
  // Procura primeiro no cadastro e confere novamente o saldo no momento do pedido.
  const escolhido = (estoque || []).find((item) => String(item.id) === String(estoqueId))
    || (estoque || []).find((item) =>
      [item.pn, item.descricao].some((valor) => String(valor || "").trim().toLowerCase() === nomePeca.toLowerCase()));
  let peca = null;
  let disponivel = 0;
  if (escolhido) {
    peca = verificar(await supabase.from("linha_branca_pecas_estoque")
      .select("id,pn,descricao,saldo,ativo,tipo_item").eq("id", escolhido.id).maybeSingle());
    if (peca?.ativo && peca.tipo_item !== "INSUMO") {
      const reservas = verificar(await supabase.from("linha_branca_pecas_requisicoes")
        .select("quantidade").eq("estoque_id", peca.id).in("status", REQUISICOES_ABERTAS));
      disponivel = Math.max(0, Number(peca.saldo || 0) - reservas.reduce((s, r) => s + Number(r.quantidade || 0), 0));
    } else peca = null;
  }
  const comum = {
    os_id: os.id,
    quantidade: qtd,
    solicitado_por: profile.id,
    solicitado_por_nome: profile.nome || "Operação",
    diagnostico_id: diagnostico.id,
    defeito_referente: String(defeito || "").trim() || null,
    observacoes: "Reparo de lavadoras: " + diagnostico.area_reparo,
  };
  let destino;
  let registro;
  if (peca && disponivel >= qtd) {
    destino = "requisicao";
    registro = verificar(await supabase.from("linha_branca_pecas_requisicoes")
      .insert({ ...comum, estoque_id: peca.id, pn: peca.pn }).select("*").single());
  } else {
    destino = "compra";
    const pn = peca?.pn || "SOLICITACAO-SEM-PN-" + crypto.randomUUID().replaceAll("-", "");
    registro = verificar(await supabase.from("linha_branca_necessidades_compra")
      .insert({ ...comum, pn, descricao: peca?.descricao || nomePeca }).select("*").single());
  }
  // Apenas OS ainda na fase de reparo podem voltar à espera da peça.
  // Uma OS já avançada nunca é devolvida a CMP por histórico de peça.
  const update = await supabase.from("ordens_servico")
    .update({ status_atual: "Aguardando peça", etapa_atual: "Reparo" })
    .eq("id", os.id).in("status_atual", ["Triado", "Encaminhado para reparo", "Em reparo", "Aguardando peça"]);
  return { destino, registro, disponivel, aviso: update.error?.message || null };
}
