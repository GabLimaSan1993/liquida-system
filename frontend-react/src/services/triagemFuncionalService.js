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
    .select("id, ordem, texto, tipo_resposta, resposta_ok, exige_defeito, gera_laudo, so_marcas, bloqueante")
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

  // Aparelho que já passou pela funcional não pode ser retriado por aqui:
  // o UNIQUE (voucher) faria o upsert apagar a triagem anterior. Em vez de
  // sobrescrever, a tela informa em que etapa ele está e manda o operador
  // para o lugar certo.
  const etapa = etapaAtual(existente);

  return {
    ok: true,
    voucher: v,
    canal,
    tradein,
    temTradein: !!tradein,
    jaTriado: !!existente?.data_funcional,
    bloqueado: !!etapa,
    etapa,
    existente: existente || null,
  };
}

// Traduz o status_atual para uma etapa que o operador entenda, e diz onde
// o aparelho deve ser tratado. Status desconhecido cai no genérico em vez
// de liberar a triagem por engano.
const ETAPAS = {
  "Aguardando análise Assurant":      { nome: "Análise Assurant",      onde: "Aguardando tratativa da Assurant" },
  "Aguardando laudo":                 { nome: "Laudo",                 onde: "Tela de Laudo" },
  "Aguardando triagem cosmética":     { nome: "Triagem Cosmética",     onde: "Tela de Triagem Cosmética" },
  "Aguardando oracle":                { nome: "Entrada no Oracle",     onde: "Tela de Entrada no Oracle" },
  "Produto disponível":               { nome: "Disponível em estoque", onde: "Já entrou no Oracle e está no FIFO" },
  "Em análise de estoque":            { nome: "Análise de estoque",    onde: "Aparelho não localizado na prateleira" },
  "Aguardando alocação":              { nome: "Aguardando alocação",   onde: "Pronto para ser alocado em pedido" },
};

// Status em que a retriagem é permitida de propósito. Aparelho devolvido pela
// cosmética precisa passar pela funcional de novo — sem isso ele bateria no
// bloqueio de "já foi triado" e travaria na bancada.
const STATUS_LIBERADOS = ["Aguardando triagem funcional"];

function etapaAtual(existente) {
  if (!existente) return null;
  const st = String(existente.status_atual || "").trim();
  if (STATUS_LIBERADOS.includes(st)) return null;
  const conhecida = ETAPAS[st];
  if (conhecida) return { ...conhecida, status: st, desde: existente.data_funcional || existente.criado_em };
  if (existente.data_funcional) {
    return { nome: st || "Já triado", onde: "Etapa não mapeada — confira com a supervisão", status: st, desde: existente.data_funcional };
  }
  return null;
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

// ══════════════════════════════════════════════════════════
// DESTINO APÓS A FUNCIONAL
// O laudo existe para sustentar divergência: a loja declarou uma condição
// e o aparelho chegou em outra. Se a loja já declarou "Defeituoso", achar
// defeito é o esperado e não precisa de laudo.
// Exceção: pergunta marcada como bloqueante (aparelho que não liga) manda
// para laudo sempre — não se compra aparelho que não liga, em nenhuma condição.
// ══════════════════════════════════════════════════════════
export function decidirDestino({ condicaoDeclarada, respostas }) {
  const lista = Array.isArray(respostas) ? respostas : [];
  const negativas = lista.filter(r => r.divergente);
  const bloqueio  = negativas.find(r => r.bloqueante);

  if (bloqueio) {
    return { laudo: true, motivo: `Reprovou em pergunta eliminatória: ${bloqueio.pergunta}` };
  }

  const cond = String(condicaoDeclarada || "").toUpperCase().trim();
  const declaradoDefeituoso = cond.startsWith("DEFEIT");

  if (!negativas.length) {
    return { laudo: false, motivo: declaradoDefeituoso
      ? "Sem divergências, embora a loja tenha declarado defeituoso"
      : "Sem divergências" };
  }

  if (declaradoDefeituoso) {
    return { laudo: false, motivo: `Defeito esperado — loja declarou ${condicaoDeclarada}` };
  }

  // Sem condição declarada (canal fora da TradeIn) cai aqui de propósito:
  // na dúvida, exige laudo em vez de deixar passar.
  return { laudo: true, motivo: condicaoDeclarada
    ? `Loja declarou ${condicaoDeclarada}, mas foram encontradas ${negativas.length} divergência(s)`
    : `Sem condição declarada e ${negativas.length} divergência(s)` };
}

export async function salvarTriagemFuncional({
  voucher, imei, canal, produto, respostas, bateria, bateriaPercentual,
  defeitos, userId, tradein,
}) {
  const v = String(voucher || "").trim().toUpperCase();
  if (!v)    return { ok: false, erro: "Voucher ausente." };
  if (!imei) return { ok: false, erro: "IMEI ausente." };

  const lista = Array.isArray(respostas) ? respostas : [];
  const negativas = lista.filter(r => r.divergente);
  const decisao   = decidirDestino({
    condicaoDeclarada: tradein?.condicao_aparelho,
    respostas: lista,
  });
  const temLaudo  = decisao.laudo;
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
      destino: { laudo: decisao.laudo, motivo: decisao.motivo, condicao_declarada: tradein?.condicao_aparelho || null },
      bateria: { percentual: bateriaPercentual ?? null, faixa: bateria || null },
      respostas: lista.map(r => ({
        pergunta_id: r.perguntaId,
        pergunta:    r.pergunta,
        resposta:    r.resposta,
        divergente:  !!r.divergente,
      })),
    }),

    status_bateria:      bateria || null,
    bateria_percentual:  Number.isFinite(Number(bateriaPercentual)) ? Number(bateriaPercentual) : null,
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
    motivoDestino: decisao.motivo,
    divergencias: negativas.length,
    conferencia,
  };
}
// ══════════════════════════════════════════════════════════
// CATÁLOGO — marca, modelo, capacidade e cor
// Carregado inteiro de uma vez (poucas centenas de linhas) e filtrado
// na tela. Evita uma consulta a cada dropdown aberto na bancada.
// ══════════════════════════════════════════════════════════

export async function carregarCatalogo(tipo = "APARELHO") {
  // Traz o catálogo inteiro de aparelhos (~3.6 mil linhas) numa consulta só.
  // A cor vem daqui, em inglês, porque é parte da chave que resolve o SKU.
  const { data, error } = await supabase
    .from("produtos_catalogo")
    .select("marca, modelo, capacidade, cor, sku_als, sku_oracle, pendente")
    .eq("tipo", tipo)
    .eq("ativo", true)
    .order("marca").order("modelo")
    .limit(10000);
  if (error) throw new Error(error.message);
  return { produtos: data || [] };
}

// Resolve o SKU a partir dos quatro campos escolhidos. Se houver mais de um
// cadastro para a mesma combinação (existe 1 caso na base), fica o não-pendente.
export function resolverSku(produtos, { marca, modelo, capacidade, cor }) {
  const eq = (a, b) => String(a || "").toUpperCase().trim() === String(b || "").toUpperCase().trim();
  const achados = (produtos || []).filter(p =>
    eq(p.marca, marca) && eq(p.modelo, modelo) &&
    eq(p.capacidade, capacidade) && eq(p.cor, cor)
  );
  if (!achados.length) return { sku: null, skuOracle: null, ambiguo: false, achados: 0 };
  const escolhido = achados.find(p => !p.pendente) || achados[0];
  return {
    sku:       escolhido.sku_als || null,
    skuOracle: escolhido.sku_oracle || null,
    ambiguo:   achados.length > 1,
    achados:   achados.length,
  };
}

// Modelo que o operador não achou na lista. Entra como pendente para
// revisão depois, sem travar a bancada esperando cadastro.
export async function cadastrarModeloPendente(marca, modelo, capacidade, cor) {
  const registro = {
    tipo:       "APARELHO",
    marca:      String(marca || "").trim().toUpperCase(),
    modelo:     String(modelo || "").trim().toUpperCase(),
    capacidade: String(capacidade || "").trim().toUpperCase() || null,
    cor:        String(cor || "").trim().toUpperCase() || null,
    pendente:   true,
  };
  if (!registro.marca || !registro.modelo) {
    return { ok: false, erro: "Marca e modelo são obrigatórios." };
  }
  // Sem onConflict: a tabela não tem mais UNIQUE na combinação, porque a
  // base oficial tem um caso legítimo de duplicata.
  const { error } = await supabase.from("produtos_catalogo").insert(registro);
  if (error) throw new Error(error.message);
  return { ok: true, ...registro };
}
// ══════════════════════════════════════════════════════════
// BATERIA — o operador digita o número, o sistema classifica
// As faixas ficam em tabela para ajuste sem deploy. O rótulo
// "Saúde da bateria entre 70 e 79%" é o que a Entrada no Oracle
// compara para rebaixar a grade — não pode mudar de forma.
// ══════════════════════════════════════════════════════════

export async function buscarFaixasBateria() {
  const { data, error } = await supabase
    .from("bateria_faixas")
    .select("minimo, maximo, rotulo")
    .eq("ativo", true)
    .order("ordem");
  if (error) throw new Error(error.message);
  return data || [];
}

export function classificarBateria(faixas, valor) {
  const n = Number(valor);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  const f = (faixas || []).find(x => n >= x.minimo && n <= x.maximo);
  return f ? f.rotulo : null;
}