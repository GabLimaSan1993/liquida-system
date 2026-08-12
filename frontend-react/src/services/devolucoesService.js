import { supabase } from "../lib/supabase";

export const STATUS_DEVOLUCAO = {
  solicitada: "Solicitada",
  aguardando_postagem: "Aguardando postagem",
  em_transito: "Em trânsito",
  aguardando_recebimento: "Aguardando recebimento",
  aguardando_triagem: "Aguardando triagem",
  em_triagem: "Em triagem",
  aguardando_definicao_assurant: "Aguardando definição Assurant",
  bloqueado_aguardando_cliente: "Bloqueado — aguardando cliente",
  aguardando_rma_aut: "Aguardando RMA/AUT",
  aguardando_ri: "Aguardando RI",
  aguardando_finalizacao: "Aguardando finalização",
  aguardando_armazenagem: "Aguardando armazenagem",
  aguardando_oracle: "Aguardando Oracle",
  em_estoque: "Em estoque",
  finalizada: "Finalizada",
  cancelada: "Cancelada",
};

export const RESPONSAVEL_DEVOLUCAO = {
  assurant: "Assurant",
  furbtech: "Furbtech",
  sistema: "Sistema / transporte",
  concluido: "Concluído",
};

export const CATEGORIAS_DEVOLUCAO = [
  "Defeito",
  "Arrependimento",
  "Venda cancelada",
  "Fraude",
  "Mau uso",
  "Bloqueado aguardando cliente",
  "Problema na entrega",
  "Outro",
];

function erroMensagem(error, padrao) {
  return error?.message || padrao;
}

function validarRetornoRpc(data, mensagemPadrao) {
  if (data?.ok === false) {
    throw new Error(data.erro || mensagemPadrao);
  }
  return data;
}

// ══════════════════════════════════════════════════════════
// PORTAL ASSURANT
// ══════════════════════════════════════════════════════════

export async function buscarPedidoParaDevolucao(idAnymarket) {
  const id = String(idAnymarket || "").trim();
  if (!id) throw new Error("Informe o ID AnyMarket.");

  const { data, error } = await supabase.rpc(
    "devolucao_buscar_pedido_anymarket",
    { p_id_anymarket: id }
  );

  if (error) throw new Error(erroMensagem(error, "Não foi possível localizar o pedido."));
  return data || [];
}

export async function criarSolicitacaoDevolucao({
  pedidoB2cId,
  dataSolicitacao,
  pedidoPortal = "",
  motivo,
  categoriaMotivo = "",
  comentarios = "",
  codigoRastreio = "",
  statusPostagem = "",
  reembolsoFinalizado = false,
  usuarioId,
}) {
  const { data, error } = await supabase.rpc("devolucao_criar_solicitacao", {
    p_pedido_b2c_id: pedidoB2cId,
    p_data_solicitacao: dataSolicitacao,
    p_pedido_portal: pedidoPortal || null,
    p_motivo: String(motivo || "").trim(),
    p_categoria_motivo: categoriaMotivo || null,
    p_comentarios: comentarios || null,
    p_codigo_rastreio: codigoRastreio || null,
    p_status_postagem: statusPostagem || null,
    p_reembolso_finalizado: Boolean(reembolsoFinalizado),
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível criar a devolução."));
  return validarRetornoRpc(data, "Não foi possível criar a devolução.");
}

export async function atualizarPostagemDevolucao({
  devolucaoId,
  codigoRastreio = "",
  statusPostagem = "",
  reembolsoFinalizado = false,
  usuarioId,
}) {
  const { data, error } = await supabase.rpc("devolucao_atualizar_postagem", {
    p_devolucao_id: devolucaoId,
    p_codigo_rastreio: codigoRastreio || null,
    p_status_postagem: statusPostagem || null,
    p_reembolso_finalizado: Boolean(reembolsoFinalizado),
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível atualizar a postagem."));
  return validarRetornoRpc(data, "Não foi possível atualizar a postagem.");
}

export async function informarRiDestinoDevolucao(
  devolucaoId,
  numeroRi,
  destinoFinal,
  usuarioId
) {
  const { data, error } = await supabase.rpc("devolucao_informar_ri_destino", {
    p_devolucao_id: devolucaoId,
    p_numero_ri: String(numeroRi || "").trim(),
    p_destino_final: destinoFinal,
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível informar a RI e o destino."));
  return validarRetornoRpc(data, "Não foi possível informar a RI e o destino.");
}

export async function definirImeiDivergenteDevolucao({
  devolucaoId,
  decisao,
  observacao = "",
  usuarioId,
}) {
  const { data, error } = await supabase.rpc("devolucao_definir_imei_divergente", {
    p_devolucao_id: devolucaoId,
    p_decisao: decisao,
    p_observacao: observacao || null,
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível registrar a definição do IMEI."));
  return validarRetornoRpc(data, "Não foi possível registrar a definição do IMEI.");
}

export async function resolverBloqueioDevolucao(devolucaoId, resolucao, usuarioId) {
  const { data, error } = await supabase.rpc("devolucao_resolver_bloqueio", {
    p_devolucao_id: devolucaoId,
    p_resolucao: String(resolucao || "").trim(),
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível resolver o bloqueio."));
  return validarRetornoRpc(data, "Não foi possível resolver o bloqueio.");
}

// ══════════════════════════════════════════════════════════
// PORTAL FURBTECH
// ══════════════════════════════════════════════════════════

export async function registrarRecebimentoDevolucao({
  devolucaoId,
  dataRecebimento,
  imei,
  nf,
  usuarioId,
}) {
  const { data, error } = await supabase.rpc("devolucao_registrar_recebimento", {
    p_devolucao_id: devolucaoId,
    p_data_recebimento: dataRecebimento,
    p_imei: String(imei || "").trim(),
    p_nf: String(nf || "").trim(),
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível registrar o recebimento."));
  return validarRetornoRpc(data, "Não foi possível registrar o recebimento.");
}

export async function registrarResultadoTriagemDevolucao({
  devolucaoId,
  apresentouDefeito,
  statusReclamacao,
  causaRaiz,
  analiseCausaRaiz = "",
  usuarioId,
}) {
  const { data, error } = await supabase.rpc("devolucao_registrar_resultado_triagem", {
    p_devolucao_id: devolucaoId,
    p_apresentou_defeito: apresentouDefeito,
    p_status_reclamacao: statusReclamacao,
    p_causa_raiz: causaRaiz,
    p_analise_causa_raiz: analiseCausaRaiz || null,
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível concluir a análise da triagem."));
  return validarRetornoRpc(data, "Não foi possível concluir a análise da triagem.");
}

export async function informarRmaAutDevolucao(devolucaoId, tipo, numero, usuarioId) {
  const { data, error } = await supabase.rpc("devolucao_informar_rma_aut", {
    p_devolucao_id: devolucaoId,
    p_tipo: tipo,
    p_numero: String(numero || "").trim(),
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível informar RMA/AUT."));
  return validarRetornoRpc(data, "Não foi possível informar RMA/AUT.");
}

export async function bloquearDevolucaoAguardandoCliente(devolucaoId, motivo, usuarioId) {
  const { data, error } = await supabase.rpc("devolucao_bloquear_aguardando_cliente", {
    p_devolucao_id: devolucaoId,
    p_motivo: String(motivo || "").trim(),
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível bloquear a devolução."));
  return validarRetornoRpc(data, "Não foi possível bloquear a devolução.");
}

export async function finalizarDevolucaoFurbtech({
  devolucaoId,
  dataFinalizacao,
  comentarios = "",
  usuarioId,
}) {
  const { data, error } = await supabase.rpc("devolucao_finalizar_furbtech_v2", {
    p_devolucao_id: devolucaoId,
    p_data_finalizacao: dataFinalizacao,
    p_comentarios: comentarios || null,
    p_usuario: usuarioId,
  });

  if (error) throw new Error(erroMensagem(error, "Não foi possível finalizar a devolução."));
  return validarRetornoRpc(data, "Não foi possível finalizar a devolução.");
}

// ══════════════════════════════════════════════════════════
// LISTAGENS COMPARTILHADAS
// ══════════════════════════════════════════════════════════

export async function listarDevolucoes({
  status = "",
  responsavel = "",
  busca = "",
  limite = 500,
} = {}) {
  let query = supabase
    .from("devolucoes_b2c")
    .select("*")
    .order("atualizado_em", { ascending: false })
    .limit(limite);

  if (status) query = query.eq("status", status);
  if (responsavel) query = query.eq("responsavel_atual", responsavel);

  const { data, error } = await query;
  if (error) throw new Error(erroMensagem(error, "Não foi possível carregar as devoluções."));

  const termo = String(busca || "").trim().toLowerCase();
  if (!termo) return data || [];

  return (data || []).filter((item) => [
    item.protocolo,
    item.id_anymarket,
    item.nome_cliente,
    item.cpf_cnpj,
    item.imei_vendido,
    item.imei_recebido,
    item.voucher_origem,
    item.voucher_dev,
    item.numero_ri,
    item.numero_rma_aut,
  ].some((valor) => String(valor || "").toLowerCase().includes(termo)));
}

export async function buscarDevolucaoPorId(devolucaoId) {
  const { data, error } = await supabase
    .from("devolucoes_b2c")
    .select("*")
    .eq("id", devolucaoId)
    .single();

  if (error) throw new Error(erroMensagem(error, "Devolução não encontrada."));
  return data;
}

export async function buscarTriagemDevolucao(devolucaoId) {
  const { data, error } = await supabase
    .from("assurant_triagem")
    .select([
      "id",
      "voucher",
      "imei",
      "status_atual",
      "data_funcional",
      "resultado_triagem_funcional",
      "status_bateria",
      "bateria_percentual",
      "defeitos_adicionais",
      "respostas_funcional",
      "data_cosmetico",
      "tela",
      "laterais",
      "traseira",
      "grade",
      "grade_cosmetica",
      "rebaixado_bateria",
    ].join(","))
    .eq("devolucao_id", devolucaoId)
    .maybeSingle();

  if (error) throw new Error(erroMensagem(error, "Não foi possível carregar as triagens da devolução."));
  return data || null;
}

export async function listarHistoricoDevolucao(devolucaoId) {
  const { data, error } = await supabase
    .from("devolucoes_b2c_historico")
    .select("*")
    .eq("devolucao_id", devolucaoId)
    .order("criado_em", { ascending: true });

  if (error) throw new Error(erroMensagem(error, "Não foi possível carregar o histórico."));
  return data || [];
}

export function rotuloStatusDevolucao(status) {
  return STATUS_DEVOLUCAO[status] || status || "—";
}

export function rotuloResponsavelDevolucao(responsavel) {
  return RESPONSAVEL_DEVOLUCAO[responsavel] || responsavel || "—";
}
