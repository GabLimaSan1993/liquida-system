import { supabase } from "../lib/supabase";
import { erroIdentificacao, tipoDoAparelho } from "./identificacaoAparelho";
export async function identificarAparelho({
  voucher,
  imei1,
  imei2,
  modelo,
  sku,
  aparelhoBloqueado = false,
  danosTela = false,
}) {
  const erro = erroIdentificacao(tipoDoAparelho(modelo), imei1, imei2, { modelo, aparelhoBloqueado, danosTela });
  if (erro) throw new Error(erro);
  const { data, error } = await supabase.rpc("assurant_triagem_identificar", {
    p_voucher: voucher,
    p_imei1: imei1?.trim() || null,
    p_imei2: imei2?.trim() || null,
    p_modelo: modelo,
    p_sku: sku || null,
    p_bloqueado: aparelhoBloqueado,
    p_danos_tela: danosTela,
  });
  if (error) throw new Error(error.message);
  return data;
}
export { etiquetaDivergencia } from "./etiquetaDivergencia";

export async function listarDivergencias() {
  const { data, error } = await supabase.rpc("assurant_divergencias_listar");
  if (error) throw new Error(error.message);
  return data;
}
export async function enviarEmailDivergencia(caso, confirmada) {
  const { data, error } = await supabase.rpc("assurant_divergencia_enviar_email", {
    p_caso: caso,
    p_confirmada: confirmada === true,
  });
  if (error) throw new Error(error.message);
  return data;
}
export async function decidirDivergencia(caso, decisao, diretriz) {
  const { data, error } = await supabase.rpc("assurant_divergencias_decidir", {
    p_caso: caso,
    p_decisao: decisao,
    p_diretriz: diretriz,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function checarOrdem(voucher) {
  const { data, error } = await supabase.rpc("assurant_triagem_checar_ordem", { p_voucher: voucher });
  if (error) throw new Error(error.message);
  return data;
}
export async function registrarNaoLiga(voucher) {
  const { data, error } = await supabase.rpc("assurant_triagem_nao_liga", { p_voucher: voucher });
  if (error) throw new Error(error.message);
  return data;
}
