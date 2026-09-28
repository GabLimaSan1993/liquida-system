import { supabase } from "../lib/supabase.js";

export async function listarSolicitacoesDesvinculacao(status = null) {
  const { data, error } = await supabase.rpc(
    "assurant_listar_solicitacoes_desvinculacao",
    { p_status: status }
  );
  if (error) throw new Error(error.message);
  return data || [];
}

export async function processarSolicitacaoDesvinculacao(id, motivo) {
  const { data, error } = await supabase.rpc(
    "assurant_processar_solicitacao_desvinculacao",
    { p_solicitacao_id: id, p_motivo: String(motivo || "").trim() }
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível transferir o aparelho.");
  return data;
}

export async function cancelarSolicitacaoDesvinculacao(id, motivo) {
  const { data, error } = await supabase.rpc(
    "assurant_cancelar_solicitacao_desvinculacao",
    { p_solicitacao_id: id, p_motivo: String(motivo || "").trim() }
  );
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível devolver a solicitação.");
  return data;
}
