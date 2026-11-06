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


// Pré-conciliação informativa e somente leitura: explica por que reenviar uma
// planilha de vouchers já cadastrados não aumenta o estoque do laboratório.
export async function conferirVouchersLaboratorio(vouchers) {
  if (!Array.isArray(vouchers) || vouchers.length < 1) {
    throw new Error("Nenhum voucher informado para conferência.");
  }
  const resultado = {
    total: 0, novos: 0, ja_cadastrados: 0,
    ja_no_historico: 0, liberar_pendentes: 0, itens: []
  };
  const tamanhoLote = 250;
  for (let i = 0; i < vouchers.length; i += tamanhoLote) {
    const parte = vouchers.slice(i, i + tamanhoLote);
    const { data, error } = await supabase.rpc(
      "assurant_reparo_lab_conferir_importacao",
      { p_vouchers: parte }
    );
    if (error) throw new Error(error.message || "Falha na conferência do lote.");
    if (!data || !Array.isArray(data.itens)) {
      throw new Error("A conferência do banco não retornou os vouchers esperados.");
    }
    for (const chave of ["total","novos","ja_cadastrados","ja_no_historico","liberar_pendentes"]) {
      resultado[chave] += Number(data[chave] || 0);
    }
    resultado.itens.push(...data.itens);
  }
  return resultado;
}
