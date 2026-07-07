import { supabase } from "../lib/supabase";

// ══════════════════════════════════════════════════════════
// GESTÃO DE RECEBIMENTO YBV — histórico, tempos e produtividade
// periodo: "7d" | "30d" | "tudo"
// ══════════════════════════════════════════════════════════

function desdeISO(periodo) {
  if (periodo === "tudo") return "2000-01-01T00:00:00.000Z";
  const dias = periodo === "7d" ? 7 : 30;
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toISOString();
}

// minutos corridos entre dois instantes (recebimento é rápido, mesmo dia)
function minutos(ini, fim) {
  if (!ini || !fim) return null;
  const a = new Date(ini).getTime();
  const b = new Date(fim).getTime();
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return Math.round((b - a) / 60000);
}

function media(arr) {
  if (!arr.length) return null;
  return Math.round(arr.reduce((s, x) => s + x, 0) / arr.length);
}

export function fmtDuracao(min) {
  if (min == null) return "—";
  if (min < 1) return "0m";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function fmtDataHora(d) {
  return d ? new Date(d).toLocaleString("pt-BR") : "—";
}

// ── Painel completo ──
export async function buscarGestaoRecebimento(periodo = "30d") {
  const desde = desdeISO(periodo);

  const { data: recebimentos, error } = await supabase
    .from("recebimentos")
    .select("id, transportadora, motorista_nome, placa, status, total_vouchers, iniciado_em, concluido_em, iniciado_por_nome")
    .gte("iniciado_em", desde)
    .order("iniciado_em", { ascending: false });
  if (error) return { ok: false, erro: error.message };

  const lista = recebimentos || [];
  const concluidos = lista.filter(r => r.status === "concluido");
  const andamento  = lista.filter(r => r.status === "em_andamento");

  // KPIs
  const totalVouchers = concluidos.reduce((s, r) => s + (r.total_vouchers || 0), 0);
  const temposTotais  = concluidos.map(r => minutos(r.iniciado_em, r.concluido_em)).filter(v => v != null);
  const kpis = {
    recebimentos:   concluidos.length,
    vouchers:       totalVouchers,
    voucherPorCarga: concluidos.length ? Math.round(totalVouchers / concluidos.length) : 0,
    tempoMedioMin:  media(temposTotais),
    emAndamento:    andamento.length,
  };

  // Por transportadora
  const porTransp = {};
  concluidos.forEach(r => {
    const t = r.transportadora || "—";
    if (!porTransp[t]) porTransp[t] = { transportadora: t, qtd: 0, tempos: [], vouchers: 0 };
    porTransp[t].qtd++;
    porTransp[t].vouchers += r.total_vouchers || 0;
    const m = minutos(r.iniciado_em, r.concluido_em);
    if (m != null) porTransp[t].tempos.push(m);
  });
  const transportadoras = Object.values(porTransp)
    .map(t => ({ transportadora: t.transportadora, qtd: t.qtd, vouchers: t.vouchers, tempoMedioMin: media(t.tempos) }))
    .sort((a, b) => b.qtd - a.qtd);

  // Produtividade por colaborador
  const porColab = {};
  concluidos.forEach(r => {
    const nome = r.iniciado_por_nome || "—";
    if (!porColab[nome]) porColab[nome] = { nome, cargas: 0, vouchers: 0, tempos: [] };
    porColab[nome].cargas++;
    porColab[nome].vouchers += r.total_vouchers || 0;
    const m = minutos(r.iniciado_em, r.concluido_em);
    if (m != null) porColab[nome].tempos.push(m);
  });
  const colaboradores = Object.values(porColab)
    .map(c => ({ nome: c.nome, cargas: c.cargas, vouchers: c.vouchers, tempoMedioMin: media(c.tempos) }))
    .sort((a, b) => b.vouchers - a.vouchers);

  // Em andamento (com tempo decorrido)
  const emAndamento = andamento.map(r => ({
    ...r,
    decorridoMin: minutos(r.iniciado_em, new Date().toISOString()),
  }));

  return {
    ok: true,
    periodo,
    kpis,
    transportadoras,
    colaboradores,
    emAndamento,
    historico: concluidos,  // já ordenados por data desc
  };
}

// ── Romaneio (reusa a mesma leitura do módulo de recebimento) ──
export async function buscarRomaneioGestao(recebimentoId) {
  const { data: rec, error } = await supabase
    .from("recebimentos").select("*").eq("id", recebimentoId).single();
  if (error) return { ok: false, erro: error.message };
  const { data: vouchers } = await supabase
    .from("recebimento_vouchers")
    .select("voucher, bipado_em, bipado_por_nome")
    .eq("recebimento_id", recebimentoId)
    .order("bipado_em", { ascending: true });
  return { ok: true, recebimento: rec, vouchers: vouchers || [] };
}