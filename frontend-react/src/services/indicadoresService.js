import { supabase } from "../lib/supabase";

// ============================================================
// indicadoresService.js
// Leitura das views vw_ind_* (camada de agregacao no Postgres).
// Nenhuma agregacao pesada acontece aqui: o banco ja devolve pronto.
// ============================================================

// ---------- helpers de periodo ----------

// "2026-07" -> { inicio: "2026-07-01", fim: "2026-08-01" }
export function faixaDoMes(mesRef) {
  const [ano, mes] = mesRef.split("-").map(Number);
  const inicio = new Date(Date.UTC(ano, mes - 1, 1));
  const fim = new Date(Date.UTC(ano, mes, 1));
  const iso = (d) => d.toISOString().slice(0, 10);
  return { inicio: iso(inicio), fim: iso(fim) };
}

// primeiro dia do mes, no formato que as views usam na coluna "mes"
export function primeiroDia(mesRef) {
  return `${mesRef}-01`;
}

export function rotuloMes(mesRef) {
  const nomes = ["janeiro","fevereiro","marco","abril","maio","junho",
                 "julho","agosto","setembro","outubro","novembro","dezembro"];
  const [ano, mes] = mesRef.split("-").map(Number);
  return `${nomes[mes - 1]} de ${ano}`;
}

function erro(prefixo, e) {
  if (e) throw new Error(`${prefixo}: ${e.message}`);
}

// ---------- meses disponiveis (alimenta o seletor da tela) ----------

export async function listarMesesDisponiveis() {
  const { data, error } = await supabase
    .from("vw_ind_canal_mes")
    .select("mes")
    .order("mes", { ascending: false });
  erro("Meses disponiveis", error);

  const unicos = [...new Set((data || []).map((r) => String(r.mes).slice(0, 7)))];
  return unicos;
}

// ---------- BLOCO A: expedicao e SLA ----------

export async function buscarExpedicaoDia(mesRef) {
  const { inicio, fim } = faixaDoMes(mesRef);
  const { data, error } = await supabase
    .from("vw_ind_expedicao_dia")
    .select("dia, marketplace, pedidos")
    .gte("dia", inicio)
    .lt("dia", fim)
    .order("dia");
  erro("Expedicao por dia", error);

  // consolida os canais em uma serie unica por dia, mantendo o detalhe
  const mapa = new Map();
  (data || []).forEach((r) => {
    const atual = mapa.get(r.dia) || { dia: r.dia, total: 0, canais: {} };
    atual.total += r.pedidos;
    atual.canais[r.marketplace || "(sem canal)"] = r.pedidos;
    mapa.set(r.dia, atual);
  });
  return [...mapa.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

export async function buscarCanais(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_canal_mes")
    .select("marketplace, pagos, expedidos, cancelados")
    .eq("mes", primeiroDia(mesRef))
    .order("pagos", { ascending: false });
  erro("Volume por canal", error);

  return (data || []).map((r) => ({
    ...r,
    pctCancelamento: r.pagos ? Number(((r.cancelados / r.pagos) * 100).toFixed(1)) : 0,
  }));
}

export async function buscarSlaCanal(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_sla_canal")
    .select("marketplace, usa_prazo_do_canal, avaliados, dentro, fora, pct_dentro")
    .eq("mes", primeiroDia(mesRef))
    .order("avaliados", { ascending: false });
  erro("SLA por canal", error);
  return data || [];
}

export async function buscarSlaFaixas(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_sla_faixas")
    .select("marketplace, faixa, pedidos")
    .eq("mes", primeiroDia(mesRef))
    .order("faixa");
  erro("Faixas de atraso", error);
  return data || [];
}

export async function buscarSlaJanela(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_sla_janela")
    .select("marketplace, pedidos, prazo_dado_h, tempo_real_h")
    .eq("mes", primeiroDia(mesRef))
    .order("pedidos", { ascending: false });
  erro("Janela de prazo", error);

  return (data || []).map((r) => ({
    ...r,
    folga_h: Number((Number(r.prazo_dado_h) - Number(r.tempo_real_h)).toFixed(1)),
  }));
}

// ---------- BLOCO B: ocorrencias de estoque ----------

export async function buscarOcorrencias(mesRef) {
  const alvo = primeiroDia(mesRef);

  const [{ data: ocor, error: e1 }, { data: tot, error: e2 }] = await Promise.all([
    supabase
      .from("vw_ind_ocorrencias")
      .select("categoria, ocorrencias")
      .eq("mes", alvo)
      .order("ocorrencias", { ascending: false }),
    supabase
      .from("vw_ind_pedidos_mes")
      .select("pedidos")
      .eq("mes", alvo)
      .maybeSingle(),
  ]);
  erro("Ocorrencias de estoque", e1);
  erro("Total de pedidos", e2);

  const base = tot?.pedidos || 0;
  return {
    total: base,
    categorias: (ocor || []).map((r) => ({
      ...r,
      pct: base ? Number(((r.ocorrencias / base) * 100).toFixed(2)) : 0,
    })),
    somaOcorrencias: (ocor || []).reduce((s, r) => s + r.ocorrencias, 0),
  };
}

// ---------- BLOCO C: erros de processo ----------

export async function buscarErros(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_erros_mes")
    .select("falhas_integracao, cancelados, pedidos")
    .eq("mes", primeiroDia(mesRef))
    .maybeSingle();
  erro("Erros de processo", error);

  if (!data) return { falhas_integracao: 0, cancelados: 0, pedidos: 0, pctCancelamento: 0 };
  return {
    ...data,
    pctCancelamento: data.pedidos
      ? Number(((data.cancelados / data.pedidos) * 100).toFixed(1))
      : 0,
  };
}

// ---------- BLOCO D: triagem ----------

export async function buscarTriagemDia(mesRef) {
  const { inicio, fim } = faixaDoMes(mesRef);
  const { data, error } = await supabase
    .from("vw_ind_triagem_dia")
    .select("dia, funcional, cosmetica")
    .gte("dia", inicio)
    .lt("dia", fim)
    .order("dia");
  erro("Triagem por dia", error);
  return data || [];
}

export async function buscarGrades(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_grades_mes")
    .select("grade, aparelhos")
    .eq("mes", primeiroDia(mesRef))
    .order("aparelhos", { ascending: false });
  erro("Distribuicao de grades", error);

  const total = (data || []).reduce((s, r) => s + r.aparelhos, 0);
  const NAO_ALOCAVEIS = ["QUEBRADO", "REGULAR"];
  const naoAlocaveis = (data || [])
    .filter((r) => NAO_ALOCAVEIS.includes(String(r.grade).toUpperCase()))
    .reduce((s, r) => s + r.aparelhos, 0);

  return {
    total,
    naoAlocaveis,
    pctNaoAlocavel: total ? Number(((naoAlocaveis / total) * 100).toFixed(1)) : 0,
    grades: (data || []).map((r) => ({
      ...r,
      pct: total ? Number(((r.aparelhos / total) * 100).toFixed(1)) : 0,
      alocavel: !NAO_ALOCAVEIS.includes(String(r.grade).toUpperCase()),
    })),
  };
}

export async function buscarLeadTime(mesRef) {
  const { data, error } = await supabase
    .from("vw_ind_leadtime_mes")
    .select("aparelhos, receb_funcional_h, funcional_cosmetica_h, funcional_laudo_h, cosmetica_oracle_h, ponta_a_ponta_h")
    .eq("mes", primeiroDia(mesRef))
    .maybeSingle();
  erro("Lead time", error);
  if (!data) return null;

  // SLA de cada etapa, conforme desenho do fluxo
  const SLA = {
    receb_funcional_h: 24,
    funcional_cosmetica_h: 24,
    funcional_laudo_h: 48,
    cosmetica_oracle_h: 24,
  };
  const rotulos = {
    receb_funcional_h: "Recebimento ate triagem funcional",
    funcional_cosmetica_h: "Triagem funcional ate cosmetica",
    funcional_laudo_h: "Triagem funcional ate laudo",
    cosmetica_oracle_h: "Cosmetica ate entrada Oracle",
  };

  return {
    aparelhos: data.aparelhos,
    pontaAPonta: Number(data.ponta_a_ponta_h),
    pontaAPontaDias: Number((Number(data.ponta_a_ponta_h) / 24).toFixed(1)),
    etapas: Object.keys(SLA).map((k) => ({
      chave: k,
      etapa: rotulos[k],
      real: Number(data[k]),
      sla: SLA[k],
      dentro: Number(data[k]) <= SLA[k],
    })),
  };
}

export async function buscarFilas() {
  const { data, error } = await supabase
    .from("vw_ind_filas")
    .select("etapa, aparelhos")
    .order("aparelhos", { ascending: false });
  erro("Filas por etapa", error);

  // filas operacionais que interessam no painel (as demais sao posicoes de estoque)
  const FILAS = [
    "Aguardando triagem funcional",
    "Aguardando alocação",
    "Aguardando oracle",
    "Aguardando triagem cosmética",
    "Aguardando laudo",
    "Aguardando laudo ALS",
  ];

  const todas = data || [];
  return {
    filas: todas.filter((r) => FILAS.includes(r.etapa)),
    outras: todas.filter((r) => !FILAS.includes(r.etapa)),
  };
}

// ---------- BLOCO E: estoque ----------

export async function buscarEstoque() {
  const [{ data: pos, error: e1 }, { data: aging, error: e2 }] = await Promise.all([
    supabase.from("vw_ind_estoque_posicao").select("subinventario, aparelhos").order("aparelhos", { ascending: false }),
    supabase.from("vw_ind_estoque_aging").select("faixa, aparelhos").order("faixa"),
  ]);
  erro("Posicao de estoque", e1);
  erro("Aging de estoque", e2);

  const total = (pos || []).reduce((s, r) => s + r.aparelhos, 0);
  const acima60 = (aging || [])
    .filter((r) => !["0. Até 30 dias", "1. 31 a 60"].includes(r.faixa))
    .reduce((s, r) => s + r.aparelhos, 0);

  return {
    total,
    posicao: pos || [],
    aging: aging || [],
    acima60,
    pctAcima60: total ? Number(((acima60 / total) * 100).toFixed(1)) : 0,
    // o data_subinv e reescrito a cada movimentacao entre subinventarios,
    // portanto a idade real e igual ou maior que a exibida.
    ressalva: "Idade calculada sobre a data de subinventario, reescrita a cada movimentacao. A idade real e igual ou maior.",
  };
}

// ---------- BLOCO F: B2B ----------

export async function buscarB2BDia(mesRef) {
  const { inicio, fim } = faixaDoMes(mesRef);
  const { data, error } = await supabase
    .from("vw_ind_b2b_dia")
    .select("dia, itens")
    .gte("dia", inicio)
    .lt("dia", fim)
    .order("dia");
  erro("B2B por dia", error);

  const lista = data || [];
  const total = lista.reduce((s, r) => s + r.itens, 0);
  return {
    serie: lista,
    total,
    diasOperados: lista.length,
    mediaDia: lista.length ? Math.round(total / lista.length) : 0,
  };
}

// ---------- carga consolidada da tela ----------

export async function carregarPainel(mesRef) {
  const [
    expedicao, canais, slaCanal, slaFaixas, slaJanela,
    ocorrencias, erros, triagem, grades, leadTime, filas, estoque, b2b,
  ] = await Promise.all([
    buscarExpedicaoDia(mesRef),
    buscarCanais(mesRef),
    buscarSlaCanal(mesRef),
    buscarSlaFaixas(mesRef),
    buscarSlaJanela(mesRef),
    buscarOcorrencias(mesRef),
    buscarErros(mesRef),
    buscarTriagemDia(mesRef),
    buscarGrades(mesRef),
    buscarLeadTime(mesRef),
    buscarFilas(),
    buscarEstoque(),
    buscarB2BDia(mesRef),
  ]);

  // consolidado de SLA somando todos os canais
  const avaliados = slaCanal.reduce((s, r) => s + r.avaliados, 0);
  const dentro = slaCanal.reduce((s, r) => s + r.dentro, 0);

  const totalExpedido = expedicao.reduce((s, r) => s + r.total, 0);
  const diasOperados = expedicao.length;

  return {
    mesRef,
    rotulo: rotuloMes(mesRef),
    resumo: {
      expedido: totalExpedido,
      diasOperados,
      mediaDia: diasOperados ? Math.round(totalExpedido / diasOperados) : 0,
      picoDia: expedicao.reduce((m, r) => (r.total > m.total ? r : m), { total: 0, dia: null }),
      slaAvaliados: avaliados,
      slaDentro: dentro,
      slaPct: avaliados ? Number(((dentro / avaliados) * 100).toFixed(1)) : 0,
    },
    expedicao, canais, slaCanal, slaFaixas, slaJanela,
    ocorrencias, erros, triagem, grades, leadTime, filas, estoque, b2b,
  };
}

// ---------- atualizacao da materialized view ----------

// Chamar depois do upload diario do AnyMarket para recalcular a base.
export async function atualizarBaseIndicadores() {
  const { error } = await supabase.rpc("refresh_indicadores");
  erro("Atualizacao da base de indicadores", error);
  return true;
}