import { supabase } from "../lib/supabase";
import { validarImeiTradein } from "./tradeinService";

// ══════════════════════════════════════════════════════════
// TRIAGEM FUNCIONAL
// Primeira tela em que o Liquida ESCREVE na assurant_triagem — até aqui
// só o importador do Gaia escrevia. Por isso toda linha gravada leva
// origem_triagem = 'liquida', para dar pra separar as duas fontes.
// ══════════════════════════════════════════════════════════

const STATUS_APOS_FUNCIONAL = "Aguardando triagem cosmética";
const STATUS_DIVERGENCIA    = "Aguardando análise Assurant";
const STATUS_LAUDO          = "Aguardando laudo";

// O canal sai do prefixo do voucher: YBV417755 -> YBV.
export function canalDoVoucher(voucher) {
  const v = String(voucher || "").trim().toUpperCase();
  const m = v.match(/^([A-Z]+)/);
  const prefixo = m ? m[1] : null;
  if (!prefixo) return null;
  // SAMV e YBV têm 3 ou 4 letras conforme a época; normaliza.
  if (prefixo.startsWith("SAM")) return "SAMV";
  if (prefixo.startsWith("YBV")) return "YBV";
  if (prefixo.startsWith("GRV")) return "GRV";
  if (prefixo.startsWith("DEV")) return "DEV";
  return prefixo;
}

export async function buscarPerguntas(tipo, etapa = "funcional") {
  const { data, error } = await supabase
    .from("triagem_perguntas")
    .select("id, ordem, texto, tipo_resposta, resposta_ok, exige_defeito, gera_laudo")
    .eq("tipo", tipo)
    .eq("etapa", etapa)
    .eq("ativo", true)
    .order("ordem");
  if (error) throw new Error(error.message);
  return data || [];
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

// Tela 1: consulta o voucher. Traz o que a TradeIn sabe e o que já existe
// na triagem, para não deixar refazer aparelho já triado sem aviso.
export async function consultarVoucher(voucher) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v) return { ok: false, erro: "Informe o voucher." };

  const canal = canalDoVoucher(v);

  const { data: existente, error: errT } = await supabase
    .from("assurant_triagem")
    .select("id, imei, sku, modelo, grade, status_atual, data_funcional, local, criado_em")
    .eq("voucher", v)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (errT) throw new Error(errT.message);

  // A TradeIn só cobre YBV. Para os outros canais não há o que validar.
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
    // "APPLE IPHONE 12 PRO 128GB PRATA" -> partes separadas para a tela 1
    produto: tradein ? quebrarAparelho(tradein.aparelho, tradein.marca) : null,
  };
}

// A TradeIn traz o aparelho como string única. Quebra por regra: a capacidade
// é o token com GB/TB, a marca vem de coluna própria, o que sobra antes da
// capacidade é modelo e o que sobra depois é cor. Sem match, devolve nulos e
// a tela deixa o operador preencher.
export function quebrarAparelho(aparelho, marca) {
  const s = String(aparelho || "").trim().toUpperCase();
  if (!s) return { marca: marca || null, modelo: null, armazenamento: null, cor: null };

  const tokens = s.split(/\s+/);
  const iCap = tokens.findIndex(t => /^\d+\s?(GB|TB)$/.test(t) || /^\d+(GB|TB)$/.test(t));
  const marcaUp = String(marca || "").trim().toUpperCase();

  let inicio = 0;
  if (marcaUp && tokens[0] === marcaUp) inicio = 1;

  if (iCap === -1) {
    return {
      marca: marca || tokens[0] || null,
      modelo: tokens.slice(inicio).join(" ") || null,
      armazenamento: null,
      cor: null,
    };
  }

  return {
    marca:         marca || tokens[0] || null,
    modelo:        tokens.slice(inicio, iCap).join(" ") || null,
    armazenamento: tokens[iCap],
    cor:           tokens.slice(iCap + 1).join(" ") || null,
  };
}

// Reexporta para a tela 2 não precisar importar de dois lugares.
export { validarImeiTradein };

// Divergência de IMEI confirmada: sai da fila e vai para análise Assurant.
export async function registrarDivergenciaImei(voucher, imeiBipado, userId, imeiEsperado) {
  const v = String(voucher || "").trim().toUpperCase();
  const registro = {
    voucher:        v,
    imei:           imeiBipado || null,
    status_atual:   STATUS_DIVERGENCIA,
    origem_triagem: "liquida",
    funcional_por:  userId,
    data_funcional: new Date().toISOString(),
    condicao:       `IMEI divergente — TradeIn: ${imeiEsperado || "sem registro"}`,
    atualizado_em:  new Date().toISOString(),
  };
  const { error } = await supabase.from("assurant_triagem").insert(registro);
  if (error) throw new Error(error.message);
  return { ok: true, status: STATUS_DIVERGENCIA };
}

// Grava o resultado da funcional.
// Toda resposta é guardada (não só as negativas, como o Gaia fazia) em JSON,
// para o resumo e a auditoria terem de onde sair.
export async function salvarTriagemFuncional({
  voucher, imei, canal, produto, respostas, bateria, defeitos, userId,
}) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v)    return { ok: false, erro: "Voucher ausente." };
  if (!imei) return { ok: false, erro: "IMEI ausente." };

  const lista = Array.isArray(respostas) ? respostas : [];
  const negativas = lista.filter(r => r.divergente);
  const temLaudo  = negativas.some(r => r.geraLaudo);

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

    // GOOD/BAD é o formato que o Gaia já usava nesta coluna.
    resultado_triagem_funcional: negativas.length ? "BAD" : "GOOD",

    // JSON com TODAS as respostas.
    respostas_funcional: JSON.stringify({
      versao: 1,
      canal,
      respondido_em: agora,
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
    .insert(registro)
    .select("id, voucher, imei, status_atual")
    .single();
  if (error) throw new Error(error.message);

  return {
    ok: true,
    id: data.id,
    status: data.status_atual,
    precisaLaudo: temLaudo,
    divergencias: negativas.length,
  };
}