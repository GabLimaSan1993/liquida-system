import { supabase } from "../lib/supabase";
import { validarImeiTradein } from "./tradeinService";

// ══════════════════════════════════════════════════════════
// TRIAGEM FUNCIONAL
// A assurant_triagem tem UNIQUE (voucher): um voucher, uma linha.
// Por isso gravamos com upsert — retriagem atualiza a linha existente
// em vez de criar outra. Colunas fora do payload ficam intactas, então
// o que a cosmética já preencheu não é apagado.
// ══════════════════════════════════════════════════════════

const STATUS_APOS_FUNCIONAL = "Aguardando triagem cosmética";
const STATUS_DIVERGENCIA    = "Aguardando análise Assurant";
const STATUS_LAUDO          = "Aguardando laudo";

export function canalDoVoucher(voucher) {
  const v = String(voucher || "").trim().toUpperCase();
  const m = v.match(/^([A-Z]+)/);
  const prefixo = m ? m[1] : null;
  if (!prefixo) return null;
  if (prefixo.startsWith("SAM")) return "SAMV";
  if (prefixo.startsWith("YBV")) return "YBV";
  if (prefixo.startsWith("GRV")) return "GRV";
  if (prefixo.startsWith("DEV")) return "DEV";
  return prefixo;
}

// As perguntas vêm do catálogo. so_marcas nulo = vale para todas as marcas;
// preenchido = só aparece para as marcas listadas. É assim que a pergunta de
// bateria fica restrita a Apple, sem exceção chumbada no código.
export async function buscarPerguntas(tipo, marca = null, etapa = "funcional") {
  const { data, error } = await supabase
    .from("triagem_perguntas")
    .select("id, ordem, texto, tipo_resposta, resposta_ok, exige_defeito, gera_laudo, so_marcas")
    .eq("tipo", tipo)
    .eq("etapa", etapa)
    .eq("ativo", true)
    .order("ordem");
  if (error) throw new Error(error.message);

  const m = String(marca || "").trim().toUpperCase();
  return (data || []).filter(p => {
    if (!p.so_marcas || !p.so_marcas.length) return true;
    return p.so_marcas.map(x => String(x).toUpperCase()).includes(m);
  });
}

export async function listarDefeitos() {
  const { data, error } = await supabase
    .from("triagem_defeitos")
    .select("id, nome, categoria")
    .eq("ativo", true)
    .order("categoria")
    .order("nome");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function consultarVoucher(voucher) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v) return { ok: false, erro: "Informe o voucher." };

  const canal = canalDoVoucher(v);

  const { data: existente, error: errT } = await supabase
    .from("assurant_triagem")
    .select("id, imei, sku, modelo, grade, status_atual, data_funcional, local, criado_em")
    .eq("voucher", v)
    .maybeSingle();
  if (errT) throw new Error(errT.message);

  // A TradeIn só cobre YBV, e serve apenas para validar o IMEI e para a
  // conferência silenciosa depois. NÃO alimenta os campos da tela: o triador
  // preenche pelo que tem na mão, senão a conferência perde a função.
  let tradein = null;
  if (canal === "YBV") {
    const numero = v.replace(/\D/g, "");
    if (numero) {
      const { data } = await supabase
        .from("tradein_geral")
        .select("voucher, imei, sku_base, condicao_sufixo, marca, aparelho, condicao_aparelho, loja, status_atual")
        .eq("voucher", parseInt(numero, 10))
        .maybeSingle();
      tradein = data || null;
    }
  }

  return {
    ok: true,
    voucher: v,
    canal,
    tradein,
    temTradein: !!tradein,
    jaTriado: !!existente?.data_funcional,
    existente: existente || null,
  };
}

// Compara em silêncio o que o operador preencheu com o que a TradeIn diz.
// Roda DEPOIS do preenchimento, nunca antes — é conferência, não sugestão.
export function conferirComTradein(produto, tradein) {
  if (!tradein) return { verificado: false, divergencias: [] };
  const ap = String(tradein.aparelho || "").toUpperCase();
  const div = [];

  const marcaTd = String(tradein.marca || "").toUpperCase().trim();
  const marcaOp = String(produto?.marca || "").toUpperCase().trim();
  if (marcaTd && marcaOp && marcaTd !== marcaOp) {
    div.push({ campo: "Marca", operador: produto.marca, tradein: tradein.marca });
  }

  const modeloOp = String(produto?.modelo || "").toUpperCase().trim();
  if (modeloOp && ap && !ap.includes(modeloOp)) {
    div.push({ campo: "Modelo", operador: produto.modelo, tradein: tradein.aparelho });
  }

  const capOp = String(produto?.armazenamento || "").toUpperCase().replace(/\s/g, "");
  if (capOp && ap && !ap.replace(/\s/g, "").includes(capOp)) {
    div.push({ campo: "Armazenamento", operador: produto.armazenamento, tradein: tradein.aparelho });
  }

  return { verificado: true, divergencias: div };
}

export { validarImeiTradein };

export async function registrarDivergenciaImei(voucher, imeiBipado, userId, imeiEsperado) {
  const v = String(voucher || "").trim().toUpperCase();
  const agora = new Date().toISOString();
  const registro = {
    voucher:        v,
    imei:           imeiBipado || null,
    status_atual:   STATUS_DIVERGENCIA,
    origem_triagem: "liquida",
    funcional_por:  userId,
    data_funcional: agora,
    condicao:       `IMEI divergente — TradeIn: ${imeiEsperado || "sem registro"}`,
    atualizado_em:  agora,
  };
  const { error } = await supabase
    .from("assurant_triagem")
    .upsert(registro, { onConflict: "voucher" });
  if (error) throw new Error(error.message);
  return { ok: true, status: STATUS_DIVERGENCIA };
}

export async function salvarTriagemFuncional({
  voucher, imei, canal, produto, respostas, bateria, defeitos, userId, tradein,
}) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v)    return { ok: false, erro: "Voucher ausente." };
  if (!imei) return { ok: false, erro: "IMEI ausente." };

  const lista = Array.isArray(respostas) ? respostas : [];
  const negativas = lista.filter(r => r.divergente);
  const temLaudo  = negativas.some(r => r.geraLaudo);
  const conferencia = conferirComTradein(produto, tradein);

  const agora = new Date().toISOString();

  const registro = {
    voucher:        v,
    imei:           String(imei).trim(),
    sku:            produto?.sku    || null,
    modelo:         produto?.modelo || null,
    origem_triagem: "liquida",
    funcional_por:  userId,
    data_funcional: agora,
    atualizado_em:  agora,

    status_atual: temLaudo ? STATUS_LAUDO : STATUS_APOS_FUNCIONAL,
    resultado_triagem_funcional: negativas.length ? "BAD" : "GOOD",

    respostas_funcional: JSON.stringify({
      versao: 2,
      canal,
      respondido_em: agora,
      produto: {
        marca:         produto?.marca         || null,
        modelo:        produto?.modelo        || null,
        armazenamento: produto?.armazenamento || null,
        cor:           produto?.cor           || null,
      },
      conferencia_tradein: conferencia,
      respostas: lista.map(r => ({
        pergunta_id: r.perguntaId,
        pergunta:    r.pergunta,
        resposta:    r.resposta,
        divergente:  !!r.divergente,
      })),
    }),

    status_bateria:      bateria || null,
    defeitos_adicionais: (defeitos || []).length ? defeitos.join("; ") : null,
  };

  const { data, error } = await supabase
    .from("assurant_triagem")
    .upsert(registro, { onConflict: "voucher" })
    .select("id, voucher, imei, status_atual")
    .single();
  if (error) throw new Error(error.message);

  return {
    ok: true,
    id: data.id,
    status: data.status_atual,
    precisaLaudo: temLaudo,
    divergencias: negativas.length,
    conferencia,
  };
}