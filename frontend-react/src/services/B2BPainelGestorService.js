import { supabase } from "../lib/supabase";
import { minutosUteis, fmtDuracao } from "./B2CPainelGestorService.js";

// Reexporta pra página importar de um lugar só
export { fmtDuracao };

// São Paulo = UTC-3 (fuso do Supabase). Timestamps naive são tratados como hora local de SP.
const SP_OFFSET_MIN = -180;

// Limite de pausa: intervalo entre bipes acima disso não conta como cadência e é apontado.
const PAUSA_LIMITE_SEG = 5 * 60;

// Faixas de tamanho de lote (1º → último bipe)
const FAIXAS_LOTE = [
  { chave: "1-50",    label: "1–50",    min: 1,   max: 50   },
  { chave: "51-100",  label: "51–100",  min: 51,  max: 100  },
  { chave: "101-200", label: "101–200", min: 101, max: 200  },
  { chave: "201-500", label: "201–500", min: 201, max: 500  },
  { chave: "500+",    label: "500+",    min: 501, max: Infinity },
];

function naiveISO(dSP) {
  const p = n => String(n).padStart(2, "0");
  return `${dSP.getUTCFullYear()}-${p(dSP.getUTCMonth() + 1)}-${p(dSP.getUTCDate())}` +
         `T${p(dSP.getUTCHours())}:${p(dSP.getUTCMinutes())}:${p(dSP.getUTCSeconds())}`;
}
function desdePeriodoNaive(periodo) {
  if (periodo === "tudo") return "2000-01-01T00:00:00";
  const dias = periodo === "7d" ? 7 : 30;
  const sp = new Date(Date.now() + SP_OFFSET_MIN * 60000);
  sp.setUTCDate(sp.getUTCDate() - dias);
  sp.setUTCHours(0, 0, 0, 0);
  return naiveISO(sp);
}
function inicioHojeNaive() {
  const sp = new Date(Date.now() + SP_OFFSET_MIN * 60000);
  sp.setUTCHours(0, 0, 0, 0);
  return naiveISO(sp);
}

function media(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
}

// Formata segundos -> "4s" / "1m 20s" / "2m"
export function fmtCadencia(seg) {
  if (seg == null) return "—";
  const s = Math.round(seg);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

// Marco inicial do pedido: usa data_pedido (DATE) quando existe; senão o criado_em (timestamp).
function marcoInicialISO(pedido) {
  if (pedido?.data_pedido) return `${pedido.data_pedido}T00:00:00-03:00`;
  if (pedido?.criado_em)   return pedido.criado_em;
  return null;
}

async function fetchEmChunks(tabela, colunas, ids, campoIn = "pedido_id") {
  const out = [];
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data } = await supabase.from(tabela).select(colunas).in(campoIn, chunk);
    if (data) out.push(...data);
  }
  return out;
}

function mesmaDataLocal(aISO, bISO) {
  const a = new Date(new Date(aISO).getTime() + SP_OFFSET_MIN * 60000);
  const b = new Date(new Date(bISO).getTime() + SP_OFFSET_MIN * 60000);
  return a.getUTCFullYear() === b.getUTCFullYear()
      && a.getUTCMonth()    === b.getUTCMonth()
      && a.getUTCDate()     === b.getUTCDate();
}

// ══════════════════════════════════════════════════════════
// PAINEL GESTOR B2B — tempos por etapa, caixas e NFs
// periodo: "7d" | "30d" | "tudo"
// ══════════════════════════════════════════════════════════
export async function buscarPainelGestorB2B(periodo = "30d") {
  const desde = desdePeriodoNaive(periodo);

  // ── 1. Pedidos do período (por criado_em do lote) ──
  const { data: pedidos, error: e1 } = await supabase
    .from("b2b_pedidos")
    .select("id, lote, data_pedido, criado_em")
    .gte("criado_em", desde);
  if (e1) return { ok: false, erro: e1.message };

  const lista = pedidos || [];
  const ids = lista.map(p => p.id);
  const pedidoPorId = {};
  lista.forEach(p => { pedidoPorId[p.id] = p; });

  if (ids.length === 0) {
    return {
      ok: true, periodo,
      kpis: { tempoMedioTotalMin: null, itensFaturados: 0, emProcessoAgora: 0, gargalo: null },
      etapas: [
        { chave: "picking",     label: "Picking",     mediaMin: null, qtd: 0 },
        { chave: "embalagem",   label: "Embalagem",   mediaMin: null, qtd: 0 },
        { chave: "faturamento", label: "Faturamento", mediaMin: null, qtd: 0, paralela: true },
      ],
      picking: {
        separacaoMin: null, ateAnaliseMin: null, analiseLocalizadoMin: null, analiseNaoFaturarMin: null,
        qtdSeparacao: 0, qtdAnalise: 0, qtdLocalizado: 0, qtdNaoFaturar: 0,
        cadenciaSeg: null, faixasLote: [], pausas: { qtd: 0, totalMin: 0, maior: null },
      },
      caixas: { tempoMedioMin: null, fechadas: 0, abertas: 0, mediaItens: null },
      nfs: { pctOk: null, comErro: 0, total: 0, naoFaturar: 0 },
      wip: await calcularWip(),
    };
  }

  // ── 2. Itens, NFs e caixas desses pedidos ──
  const itens = await fetchEmChunks("b2b_itens",
    "pedido_id, bipado_em, bipado_por, embalado_em, nf, nao_faturar_em, nao_localizado_em, localizado_em", ids);
  const nfs = await fetchEmChunks("b2b_nfs",
    "pedido_id, numero_nf, importado_em, data_faturamento, status, total_itens", ids);
  const caixas = await fetchEmChunks("b2b_caixas",
    "pedido_id, status, criado_em, fechado_em, total_itens", ids);

  // Resolve os nomes dos operadores que biparam (bipado_por -> nome)
  const bipadoPorIds = [...new Set(itens.map(it => it.bipado_por).filter(Boolean))];
  const nomePorId = {};
  if (bipadoPorIds.length) {
    for (let i = 0; i < bipadoPorIds.length; i += 200) {
      const { data: profs } = await supabase
        .from("user_profiles").select("id, nome")
        .in("id", bipadoPorIds.slice(i, i + 200));
      (profs || []).forEach(p => { nomePorId[p.id] = p.nome; });
    }
  }

  // mapa NF -> data de faturamento
  const nfDate = {};
  nfs.forEach(n => { nfDate[`${n.pedido_id}|${n.numero_nf}`] = n.data_faturamento || n.importado_em; });

  const T = { picking: [], embalagem: [], faturamento: [] };
  const P = { separacao: [], ateAnalise: [], analiseLocalizado: [], analiseNaoFaturar: [] };
  const totais = [];
  let itensFaturados = 0;

  // Bipes por pedido (pra cadência, lote e pausas)
  const bipesPorPedido = {};

  itens.forEach(it => {
    const dpISO = marcoInicialISO(pedidoPorId[it.pedido_id]);
    const dtNF = it.nf ? nfDate[`${it.pedido_id}|${it.nf}`] : null;

    if (it.bipado_em) {
      const v = minutosUteis(dpISO, it.bipado_em);
      if (v != null) { T.picking.push(v); P.separacao.push(v); }
      if (!bipesPorPedido[it.pedido_id]) bipesPorPedido[it.pedido_id] = [];
      bipesPorPedido[it.pedido_id].push({ em: it.bipado_em, quem: nomePorId[it.bipado_por] || "—" });
    }
    if (it.bipado_em && it.embalado_em) {
      const v = minutosUteis(it.bipado_em, it.embalado_em);
      if (v != null) T.embalagem.push(v);
    }
    if (it.bipado_em && dtNF) {
      const v = minutosUteis(it.bipado_em, dtNF);
      if (v != null) T.faturamento.push(v);
    }
    if (it.nf && dtNF) {
      itensFaturados++;
      const tot = minutosUteis(dpISO, dtNF);
      if (tot != null) totais.push(tot);
    }

    // Detalhe do picking: análise
    if (it.nao_localizado_em) {
      const v = minutosUteis(dpISO, it.nao_localizado_em);
      if (v != null) P.ateAnalise.push(v);
      if (it.localizado_em) {
        const l = minutosUteis(it.nao_localizado_em, it.localizado_em);
        if (l != null) P.analiseLocalizado.push(l);
      }
      if (it.nao_faturar_em) {
        const nf2 = minutosUteis(it.nao_localizado_em, it.nao_faturar_em);
        if (nf2 != null) P.analiseNaoFaturar.push(nf2);
      }
    }
  });

  // ── Cadência, lote por faixa e pausas ──
  const intervalosCadencia = [];
  const pausas = [];
  const lotePorFaixa = {};
  FAIXAS_LOTE.forEach(f => { lotePorFaixa[f.chave] = []; });

  Object.entries(bipesPorPedido).forEach(([pedidoId, bipes]) => {
    if (bipes.length < 1) return;
    bipes.sort((a, b) => new Date(a.em) - new Date(b.em));

    for (let i = 1; i < bipes.length; i++) {
      if (!mesmaDataLocal(bipes[i - 1].em, bipes[i].em)) continue;
      const seg = (new Date(bipes[i].em) - new Date(bipes[i - 1].em)) / 1000;
      if (seg < 0) continue;
      if (seg <= PAUSA_LIMITE_SEG) {
        intervalosCadencia.push(seg);
      } else {
        pausas.push({
          seg,
          quem: bipes[i].quem || "—",
          lote: pedidoPorId[pedidoId]?.lote || "—",
        });
      }
    }

    const qtd = bipes.length;
    const dur = minutosUteis(bipes[0].em, bipes[bipes.length - 1].em);
    if (dur != null && qtd >= 1) {
      const faixa = FAIXAS_LOTE.find(f => qtd >= f.min && qtd <= f.max);
      if (faixa) lotePorFaixa[faixa.chave].push(dur);
    }
  });

  const maiorPausa = pausas.length
    ? pausas.reduce((a, b) => (b.seg > a.seg ? b : a))
    : null;

  const picking = {
    separacaoMin:         media(P.separacao),
    ateAnaliseMin:        media(P.ateAnalise),
    analiseLocalizadoMin: media(P.analiseLocalizado),
    analiseNaoFaturarMin: media(P.analiseNaoFaturar),
    qtdSeparacao:  P.separacao.length,
    qtdAnalise:    P.ateAnalise.length,
    qtdLocalizado: P.analiseLocalizado.length,
    qtdNaoFaturar: P.analiseNaoFaturar.length,
    cadenciaSeg:   media(intervalosCadencia),
    faixasLote: FAIXAS_LOTE.map(f => ({
      chave: f.chave, label: f.label,
      mediaMin: media(lotePorFaixa[f.chave]),
      qtdLotes: lotePorFaixa[f.chave].length,
    })),
    pausas: {
      qtd:      pausas.length,
      totalMin: Math.round(pausas.reduce((s, p) => s + p.seg, 0) / 60),
      maior:    maiorPausa ? { min: Math.round(maiorPausa.seg / 60), quem: maiorPausa.quem, lote: maiorPausa.lote } : null,
    },
  };

  const etapas = [
    { chave: "picking",     label: "Picking",     mediaMin: media(T.picking),     qtd: T.picking.length },
    { chave: "embalagem",   label: "Embalagem",   mediaMin: media(T.embalagem),   qtd: T.embalagem.length },
    { chave: "faturamento", label: "Faturamento", mediaMin: media(T.faturamento), qtd: T.faturamento.length, paralela: true },
  ];
  const comTempo = etapas.filter(e => e.mediaMin != null);
  const gargalo = comTempo.length ? comTempo.reduce((a, b) => (b.mediaMin > a.mediaMin ? b : a)) : null;

  // ── caixas ──
  const tempoCaixas = [];
  let fechadas = 0, abertas = 0;
  const itensCaixa = [];
  caixas.forEach(c => {
    if (c.fechado_em) {
      fechadas++;
      const v = minutosUteis(c.criado_em, c.fechado_em);
      if (v != null) tempoCaixas.push(v);
    } else {
      abertas++;
    }
    if (c.total_itens) itensCaixa.push(c.total_itens);
  });

  // ── NFs ──
  const totalNF = nfs.length;
  const nfErro = nfs.filter(n => n.status && n.status !== "ok").length;
  const pctOk = totalNF ? Math.round(((totalNF - nfErro) / totalNF) * 100) : null;
  const naoFaturarPeriodo = itens.filter(it => it.nao_faturar_em).length;

  return {
    ok: true, periodo,
    kpis: {
      tempoMedioTotalMin: media(totais),
      itensFaturados,
      emProcessoAgora: null,
      gargalo: gargalo ? { label: gargalo.label, mediaMin: gargalo.mediaMin } : null,
    },
    etapas,
    picking,
    caixas: {
      tempoMedioMin: media(tempoCaixas),
      fechadas, abertas,
      mediaItens: media(itensCaixa),
    },
    nfs: { pctOk, comErro: nfErro, total: totalNF, naoFaturar: naoFaturarPeriodo },
    wip: await calcularWip(),
  };
}

// ── WIP: fila viva de itens agora (independe do período) ──
async function calcularWip() {
  const wip = {
    aguard_picking: 0, nao_localizado: 0, aguard_embalagem: 0, aguard_nf: 0,
    nao_faturar: 0, faturados_hoje: 0, em_processo: 0,
  };

  const abertos = [];
  let from = 0;
  const passo = 1000;
  while (true) {
    const { data } = await supabase
      .from("b2b_itens")
      .select("bipado_em, embalado_em, nao_localizado_em, localizado_em")
      .is("nf", null).is("nao_faturar_em", null)
      .range(from, from + passo - 1);
    if (!data || data.length === 0) break;
    abertos.push(...data);
    if (data.length < passo) break;
    from += passo;
  }

  abertos.forEach(it => {
    const emAnalise = it.nao_localizado_em && !it.localizado_em && !it.bipado_em;
    if (emAnalise) wip.nao_localizado++;
    else if (!it.bipado_em) wip.aguard_picking++;
    else if (!it.embalado_em) wip.aguard_embalagem++;
    else wip.aguard_nf++;
  });
  wip.em_processo = abertos.length;

  const { count: naoFat } = await supabase
    .from("b2b_itens").select("id", { count: "exact", head: true })
    .not("nao_faturar_em", "is", null);
  wip.nao_faturar = naoFat || 0;

  const { data: nfsHoje } = await supabase
    .from("b2b_nfs").select("total_itens, status")
    .gte("importado_em", inicioHojeNaive());
  wip.faturados_hoje = (nfsHoje || [])
    .filter(n => !n.status || n.status === "ok")
    .reduce((s, n) => s + (n.total_itens || 0), 0);

  return wip;
}