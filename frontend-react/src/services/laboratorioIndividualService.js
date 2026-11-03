import { supabase } from "../lib/supabase.js";

export async function laboratorioIndividual(acao, campos={}) {
  const {data,error}=await supabase.rpc("assurant_reparo_lab_individual",{
    p_acao:acao,
    p_vouchers:campos.vouchers??null,
    p_item_id:campos.id??null,
    p_busca:campos.busca??null,
    p_status:campos.status??null,
    p_limite:campos.limite??100,
    p_offset:campos.offset??0,
    p_os:campos.os??null,
    p_defeitos:campos.defeitos??null,
    p_resultado:campos.resultado??null,
    p_observacoes:campos.observacoes??null
  });
  if(error)throw new Error(error.message||"Falha na operação individual do laboratório.");
  return data;
}
