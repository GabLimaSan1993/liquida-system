import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// JANELA DE OPERAÇÃO (fuso São Paulo, UTC-3, sem horário de verão)
// Seg–Sex 08:00–17:48 · Sáb 07:00–16:00 · Dom fechado
// ══════════════════════════════════════════════════════════
const SP_OFFSET_MIN = -180; // São Paulo = UTC-3

// minutos desde 00:00 local; null = fechado
const EXPEDIENTE = {
  0: null,                    // domingo
  1: [8 * 60, 17 * 60 + 48],  // segunda
  2: [8 * 60, 17 * 60 + 48],
  3: [8 * 60, 17 * 60 + 48],
  4: [8 * 60, 17 * 60 + 48],
  5: [8 * 60, 17 * 60 + 48],  // sexta
  6: [7 * 60, 16 * 60],       // sábado
};

// Minutos ÚTEIS (só dentro do expediente) entre dois instantes.
// Retorna null se faltar algum dos carimbos.
export function minutosUteis(inicioISO, fimISO) {
  if (!inicioISO || !fimISO) return null;
  const ini = new Date(inicioISO).getTime();
  const fim = new Date(fimISO).getTime();
  if (isNaN(ini) || isNaN(fim)) return null;
  if (fim <= ini) return 0;

  let total = 0;
  let cursor = ini;
  let guard = 0;
  while (cursor < fim && guard < 400) {
    guard++;
    // dia local (São Paulo) do cursor
    const local = new Date(cursor + SP_OFFSET_MIN * 60000);
    const dow = local.getUTCDay();
    const janela = EXPEDIENTE[dow];
    // meia-noite local desse dia, em epoch
    const midnightLocalMs =
      Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0)
      - SP_OFFSET_MIN * 60000;
    if (janela) {
      const abreMs  = midnightLocalMs + janela[0] * 60000;
      const fechaMs = midnightLocalMs + janela[1] * 60000;
      const a = Math.max(ini, abreMs);
      const b = Math.min(fim, fechaMs);
      if (b > a) total += (b - a);
    }
    cursor = midnightLocalMs + 24 * 60 * 60000; // próxima meia-noite local
  }
  return Math.round(total / 60000);
}

// Formata minutos -> "2h 10m" / "45m" / "1d 3h"
export function fmtDuracao(min) {
  if (min == null) return "—";
  if (min < 1) return "0m";
  const d = Math.floor(min / (60 * 24));
  const h = Math.floor((min % (60 * 24)) / 60);
  const m = min % 60;
  const partes = [];
  if (d) partes.push(`${d}d`);
  if (h) partes.push(`${h}h`);
  if (m || (!d && !h)) partes.push(`${m}m`);
  return partes.join(" ");
}

function media(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
}

function desdePeriodo(periodo) {
  if (periodo === "tudo") return "2000-01-01T00:00:00.000Z";
  const dias = periodo === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

function inicioHojeSPISO() {
  const local = new Date(Date.now() + SP_OFFSET_MIN * 60000);
  const midnightLocalMs =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), 0, 0, 0)
    - SP_OFFSET_MIN * 60000;
  return new Date(midnightLocalMs).toISOString();
}

// ══════════════════════════════════════════════════════════
// PAINEL GESTOR — panorama de tempos por etapa e por mesa
// periodo: "7d" | "30d" | "tudo"
// ══════════════════════════════════════════════════════════
export async function buscarPainelGestorB2C(periodo = "30d") {
  const desdeISO = desdePeriodo(periodo);

  // ── 1. Conjunto de tempos: pedidos concluídos no período ──
  const { data: concluidos, error: e1 } = await supabase
    .from("pedidos_b2c")
    .select("id, criado_em, alocado_em, bipado_em, faturado_em, atualizado_em")
    .eq("status", "concluido")
    .gte("atualizado_em", desdeISO);
  if (e1) return { ok: false, erro: e1.message };

  const lista = concluidos || [];
  const ids = lista.map(p => p.id);

  // eventos de embalagem desses pedidos (para tempos por mesa)
  const eventosPorPedido = {};
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const { data: evs } = await supabase
      .from("embalagem_eventos")
      .select("pedido_id, mesa, acao, criado_em")
      .in("pedido_id", chunk);
    (evs || []).forEach(ev => {
      if (!eventosPorPedido[ev.pedido_id]) eventosPorPedido[ev.pedido_id] = [];
      eventosPorPedido[ev.pedido_id].push(ev);
    });
  }

  const T = { alocacao: [], picking: [], embalagem: [], faturamento: [] };
  const M = { mesa_1: [], mesa_2: [], mesa_3: [], mesa_4: [] };
  const totais = [];

  lista.forEach(p => {
    const dAloc = minutosUteis(p.criado_em, p.alocado_em);
    const dPick = minutosUteis(p.alocado_em, p.bipado_em);
    const dFat  = minutosUteis(p.bipado_em, p.faturado_em);
    if (dAloc != null) T.alocacao.push(dAloc);
    if (dPick != null) T.picking.push(dPick);
    if (dFat  != null) T.faturamento.push(dFat);

    // eventos ordenados por data
    const evs = (eventosPorPedido[p.id] || [])
      .slice()
      .sort((a, b) => new Date(a.criado_em) - new Date(b.criado_em));
    const entrada = {};
    let saida = null;
    evs.forEach(ev => {
      if (ev.acao === "entrada" && !entrada[ev.mesa]) entrada[ev.mesa] = ev.criado_em;
      if (ev.acao === "saida") saida = ev.criado_em;
    });

    // embalagem total: chegada na mesa 1 (ou bipado) -> saída
    const iniEmb = entrada.mesa_1 || p.bipado_em;
    const fimEmb = saida || p.atualizado_em;
    const dEmb = minutosUteis(iniEmb, fimEmb);
    if (dEmb != null) T.embalagem.push(dEmb);

    // tempo dentro de cada mesa
    if (entrada.mesa_1 && entrada.mesa_2) { const v = minutosUteis(entrada.mesa_1, entrada.mesa_2); if (v != null) M.mesa_1.push(v); }
    if (entrada.mesa_2 && entrada.mesa_3) { const v = minutosUteis(entrada.mesa_2, entrada.mesa_3); if (v != null) M.mesa_2.push(v); }
    if (entrada.mesa_3 && entrada.mesa_4) { const v = minutosUteis(entrada.mesa_3, entrada.mesa_4); if (v != null) M.mesa_3.push(v); }
    if (entrada.mesa_4 && saida)          { const v = minutosUteis(entrada.mesa_4, saida);          if (v != null) M.mesa_4.push(v); }

    const tot = minutosUteis(p.criado_em, fimEmb);
    if (tot != null) totais.push(tot);
  });

  const etapas = [
    { chave: "alocacao",    label: "Aguardando alocação", mediaMin: media(T.alocacao),    qtd: T.alocacao.length },
    { chave: "picking",     label: "Picking",             mediaMin: media(T.picking),     qtd: T.picking.length },
    { chave: "embalagem",   label: "Embalagem",           mediaMin: media(T.embalagem),   qtd: T.embalagem.length },
    { chave: "faturamento", label: "Faturamento",         mediaMin: media(T.faturamento), qtd: T.faturamento.length, paralela: true },
  ];

  const mesas = [
    { chave: "mesa_1", label: "Mesa 1 · recebimento", mediaMin: media(M.mesa_1), qtd: M.mesa_1.length },
    { chave: "mesa_2", label: "Mesa 2 · limpeza",     mediaMin: media(M.mesa_2), qtd: M.mesa_2.length },
    { chave: "mesa_3", label: "Mesa 3 · caixa",       mediaMin: media(M.mesa_3), qtd: M.mesa_3.length },
    { chave: "mesa_4", label: "Mesa 4 · NF/saída",    mediaMin: media(M.mesa_4), qtd: M.mesa_4.length },
  ];

  const comTempo = etapas.filter(e => e.mediaMin != null);
  const gargalo = comTempo.length
    ? comTempo.reduce((a, b) => (b.mediaMin > a.mediaMin ? b : a))
    : null;

  // ── 2. WIP agora (snapshot, independe do período) ──
  const { data: wipRows } = await supabase
    .from("pedidos_b2c")
    .select("status, etapa_embalagem, faturado_em")
    .neq("status", "concluido");

  const wip = {
    aguardando_alocacao: 0, picking: 0, analise: 0,
    aguardando_mesa_1: 0, mesa_1: 0, mesa_2: 0, mesa_3: 0, mesa_4: 0,
    aguardando_faturamento: 0,
  };
  (wipRows || []).forEach(r => {
    if (r.status === "aguardando_alocacao") wip.aguardando_alocacao++;
    else if (r.status === "alocado" || r.status === "em_picking") wip.picking++;
    else if (r.status === "em_analise") wip.analise++;
    else if (r.status === "embalado" || r.status === "faturado") {
      if (!r.etapa_embalagem) wip.aguardando_mesa_1++;
      else if (wip[r.etapa_embalagem] != null) wip[r.etapa_embalagem]++;
      if (r.status === "embalado" && !r.faturado_em) wip.aguardando_faturamento++;
    }
  });
  const emProcessoAgora = (wipRows || []).length;

  // concluídos hoje
  const { count: concluidosHoje } = await supabase
    .from("pedidos_b2c")
    .select("id", { count: "exact", head: true })
    .eq("status", "concluido")
    .gte("atualizado_em", inicioHojeSPISO());

  return {
    ok: true,
    periodo,
    kpis: {
      tempoMedioTotalMin: media(totais),
      concluidos: lista.length,
      emProcessoAgora,
      gargalo: gargalo ? { label: gargalo.label, mediaMin: gargalo.mediaMin } : null,
    },
    etapas,
    mesas,
    wip: { ...wip, concluidos_hoje: concluidosHoje || 0 },
  };
}