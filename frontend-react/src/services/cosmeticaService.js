import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// TRIAGEM COSMÉTICA
// Última etapa antes da armazenagem. É aqui que a grade final é fechada,
// combinando estética (tela, laterais, traseira), defeito funcional e bateria.
//
// O status de saída é "Aguardando armazenagem" de propósito: "Aguardando
// alocação" já é aceito pelo FIFO (STATUS_ALOCAVEIS no pedidosB2CService),
// e usá-lo aqui faria o aparelho ser prometido a um pedido antes de ter
// endereço e antes de entrar no Oracle.
// ══════════════════════════════════════════════════════════

const STATUS_ENTRADA = "Aguardando triagem cosmética";
const STATUS_SAIDA   = "Aguardando armazenagem";
const STATUS_VOLTA   = "Aguardando laudo";

const BATERIA_REBAIXA = "Saúde da bateria entre 70 e 79%";

// Da pior para a melhor.
const HIERARQUIA  = ["QUEBRADO", "REGULAR", "BOM", "MUITO BOM", "EXCELENTE", "LIKE NEW"];
const REBAIXAVEIS = ["LIKE NEW", "EXCELENTE", "MUITO BOM", "BOM"];

export function piorGrade(...grades) {
  const validas = grades.filter(Boolean).map(g => String(g).toUpperCase().trim())
    .filter(g => HIERARQUIA.includes(g));
  if (!validas.length) return null;
  return validas.reduce((a, b) => (HIERARQUIA.indexOf(a) < HIERARQUIA.indexOf(b) ? a : b));
}

// grade      = o que vale para venda e precificação
// gradeCosmetica = a estética pura, preservada para exibir "BOM ⚡" quando
//                  a bateria rebaixou para Outlet
export function calcularGradeFinal({ tela, laterais, traseira, temDefeitoFuncional, bateria }) {
  const base = piorGrade(tela, laterais, traseira);

  if (temDefeitoFuncional) {
    return {
      grade: "QUEBRADO",
      gradeCosmetica: base,
      rebaixado: false,
      motivo: "Defeito funcional diagnosticado — grade Quebrado independente da estética",
    };
  }

  const bateriaBaixa = String(bateria || "").trim() === BATERIA_REBAIXA;
  if (!bateriaBaixa) {
    return { grade: base, gradeCosmetica: base, rebaixado: false, motivo: null };
  }

  if (REBAIXAVEIS.includes(base)) {
    return {
      grade: "OUTLET",
      gradeCosmetica: base,
      rebaixado: true,
      motivo: `Bateria 70-79% rebaixou ${base} para Outlet`,
    };
  }

  return {
    grade: "QUEBRADO",
    gradeCosmetica: base,
    rebaixado: true,
    motivo: `Bateria 70-79% com estética ${base} — grade Quebrado`,
  };
}

// Como a grade aparece na tela e nos relatórios. O Outlet é o único caso em
// que a estética continua visível — nele o raio explica por que um aparelho
// esteticamente bom não está sendo vendido como bom. Nos demais, vale a grade
// final, com raio quando a bateria foi o motivo.
export function exibicaoGrade({ grade, gradeCosmetica, rebaixado }) {
  const g = String(grade || "").toUpperCase().trim();
  if (!g) return { texto: "—", raio: false };
  if (g === "OUTLET") {
    return { texto: gradeCosmetica || "OUTLET", raio: true };
  }
  return { texto: g, raio: !!rebaixado };
}

export async function buscarOpcoes() {
  const { data, error } = await supabase
    .from("cosmetica_opcoes")
    .select("id, parte, ordem, descricao, grade")
    .eq("ativo", true)
    .order("parte").order("ordem");
  if (error) throw new Error(error.message);

  const porParte = { tela: [], laterais: [], traseira: [] };
  (data || []).forEach(o => {
    if (porParte[o.parte]) porParte[o.parte].push(o);
  });
  return porParte;
}

// Fila da cosmética. Só o que a triagem nova produziu — a base do Gaia tem
// 181 mil linhas de histórico e puxaria passivo antigo junto.
export async function listarAguardandoCosmetica() {
  const { data, error } = await supabase
    .from("assurant_triagem")
    .select("voucher, imei, modelo, status_bateria, data_funcional, respostas_funcional, resultado_triagem_funcional, defeitos_adicionais")
    .eq("status_atual", STATUS_ENTRADA)
    .eq("origem_triagem", "liquida")
    .order("data_funcional", { ascending: true });
  if (error) throw new Error(error.message);

  return (data || []).map(t => {
    let r = null;
    try { r = JSON.parse(t.respostas_funcional || "null"); } catch { r = null; }
    return {
      voucher:  t.voucher,
      imei:     t.imei,
      marca:    r?.produto?.marca || null,
      modelo:   r?.produto?.modelo || t.modelo || null,
      bateria:  t.status_bateria,
      defeito:  t.resultado_triagem_funcional === "BAD",
      desde:    t.data_funcional,
    };
  });
}

export async function carregarParaCosmetica(voucher) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v) return { ok: false, erro: "Informe o voucher." };

  const { data: t, error } = await supabase
    .from("assurant_triagem")
    .select("id, voucher, imei, sku, modelo, status_atual, status_bateria, bateria_percentual, resultado_triagem_funcional, defeitos_adicionais, respostas_funcional")
    .eq("voucher", v)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!t) return { ok: false, erro: `Voucher ${v} não encontrado na triagem.` };

  if (t.status_atual !== STATUS_ENTRADA) {
    return { ok: false, erro: `Este aparelho não está aguardando triagem cosmética (status atual: ${t.status_atual || "sem status"}).` };
  }

  let r = null;
  try { r = JSON.parse(t.respostas_funcional || "null"); } catch { r = null; }

  return {
    ok: true,
    voucher: t.voucher,
    imei: t.imei,
    sku: t.sku,
    produto: r?.produto || null,
    bateria: t.status_bateria,
    bateriaPercentual: t.bateria_percentual,
    temDefeitoFuncional: t.resultado_triagem_funcional === "BAD",
    defeitos: t.defeitos_adicionais
      ? t.defeitos_adicionais.split(";").map(s => s.trim()).filter(Boolean)
      : [],
  };
}

// Quarta pergunta: se o operador da cosmética encontrar problema funcional que
// a funcional não pegou, o aparelho volta. As respostas de estética já dadas
// ficam guardadas para ele não ter que refazer.
export async function devolverParaFuncional({ voucher, tela, laterais, traseira, observacao, userId }) {
  const agora = new Date().toISOString();
  const { error } = await supabase
    .from("assurant_triagem")
    .update({
      status_atual:  STATUS_VOLTA,
      tela:          tela     || null,
      laterais:      laterais || null,
      traseira:      traseira || null,
      reanalise:     "Sim",
      condicao:      observacao ? `Devolvido pela cosmética: ${observacao}` : "Devolvido pela cosmética",
      cosmetico_por: userId,
      data_cosmetico: agora,
      atualizado_em: agora,
    })
    .eq("voucher", voucher)
    .eq("status_atual", STATUS_ENTRADA);
  if (error) throw new Error(error.message);
  return { ok: true, status: STATUS_VOLTA };
}

export async function salvarCosmetica({ dados, tela, laterais, traseira, userId }) {
  if (!dados?.voucher) return { ok: false, erro: "Voucher ausente." };
  if (!tela || !laterais || !traseira) {
    return { ok: false, erro: "Responda tela, laterais e traseira." };
  }

  const calc = calcularGradeFinal({
    tela, laterais, traseira,
    temDefeitoFuncional: dados.temDefeitoFuncional,
    bateria: dados.bateria,
  });

  const agora = new Date().toISOString();

  const { data, error } = await supabase
    .from("assurant_triagem")
    .update({
      tela, laterais, traseira,
      grade:             calc.grade,
      grade_cosmetica:   calc.gradeCosmetica,
      rebaixado_bateria: calc.rebaixado,
      status_atual:      STATUS_SAIDA,
      data_cosmetico:    agora,
      cosmetico_por:     userId,
      atualizado_em:     agora,
    })
    .eq("voucher", dados.voucher)
    .eq("status_atual", STATUS_ENTRADA) // trava: dois operadores no mesmo aparelho
    .select("voucher, grade, status_atual")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) {
    return { ok: false, erro: "Este aparelho já saiu da triagem cosmética. Recarregue a fila." };
  }

  return { ok: true, ...calc, status: data.status_atual };
}