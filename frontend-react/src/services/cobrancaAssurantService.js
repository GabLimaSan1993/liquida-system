import { supabase } from "../lib/supabase.js";

async function chamar(nome, argumentos) {
  const { data, error } = await supabase.rpc(nome, argumentos);
  if (error) throw new Error(error.message || "Falha na consulta de cobrança.");
  return data;
}

export function apurarCobrancaAssurant(competencia) {
  return chamar("assurant_cobranca_apurar", { p_competencia: competencia });
}
export function listarFechamentosAssurant() {
  return chamar("assurant_cobranca_operar", { p_acao: "listar" });
}
export function obterFechamentoAssurant(competencia) {
  return chamar("assurant_cobranca_operar", { p_acao: "obter", p_competencia: competencia });
}
export function salvarFechamentoAssurant(acao, competencia, configuracao, apuracao) {
  return chamar("assurant_cobranca_operar", {
    p_acao: acao,
    p_competencia: competencia,
    p_configuracao: configuracao,
    p_apuracao: apuracao,
  });
}
export function reabrirFechamentoAssurant(competencia, motivo) {
  return chamar("assurant_cobranca_operar", {
    p_acao: "reabrir",
    p_competencia: competencia,
    p_motivo: motivo,
  });
}
