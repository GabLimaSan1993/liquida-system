export const GESTOR_CHAMADOS_ID = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";
export const fechado = item => ["concluido", "cancelado"].includes(item.status);
export const diaBrasilia = value => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
export function entradaDataLocal(value) {
  return value ? new Date(value).toLocaleString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 16).replace(" ", "T") : "";
}
export function dataLocalIso(value) { return value ? new Date(`${value}:00-03:00`).toISOString() : null; }
export function prazoSla(prazo, realizado, agora = Date.now(), encerrado = false) {
  if (!prazo) return "sem_sla";
  if (realizado) return new Date(realizado).getTime() <= new Date(prazo).getTime() ? "cumprido" : "violado";
  if (encerrado) return "sem_registro";
  const falta = new Date(prazo).getTime() - Number(agora);
  return falta < 0 ? "atrasado" : falta <= 86400000 ? "atencao" : "no_prazo";
}
export function situacaoSla(item, agora = Date.now()) {
  if (item.status === "cancelado") return { resposta: "cancelado", resolucao: "cancelado", geral: "cancelado" };
  const encerrado = item.status === "concluido";
  const resposta = prazoSla(item.prazo_primeira_resposta_em, item.primeira_resposta_em, agora, encerrado);
  const resolucao = prazoSla(item.prazo_resolucao_em, item.resolvido_em, agora, encerrado);
  const states = [resposta, resolucao].filter(s => s !== "sem_sla");
  const geral = ["violado", "atrasado", "atencao", "sem_registro", "no_prazo"].find(s => states.includes(s)) || (states.length ? "cumprido" : "sem_sla");
  return { resposta, resolucao, geral };
}
export function atrasoPlanejado(item, agora = Date.now()) { return !fechado(item) && Boolean(item.prazo_planejado_em) && new Date(item.prazo_planejado_em).getTime() < Number(agora); }
export function ordenarFila(items, agora = Date.now()) {
  const prioridade = { urgente: 0, alta: 1, normal: 2, baixa: 3 };
  const score = item => {
    if (fechado(item)) return 10;
    if (["atrasado", "violado"].includes(situacaoSla(item, agora).geral)) return 0;
    if (atrasoPlanejado(item, agora)) return 1;
    if (situacaoSla(item, agora).geral === "atencao") return 2;
    return 3;
  };
  return [...items].sort((a, b) => score(a) - score(b) || prioridade[a.prioridade] - prioridade[b.prioridade] ||
    (new Date(a.prazo_planejado_em || a.prazo_resolucao_em || "9999-01-01").getTime() - new Date(b.prazo_planejado_em || b.prazo_resolucao_em || "9999-01-01").getTime()) || new Date(a.criado_em) - new Date(b.criado_em));
}
export function metricasGestao(items, agora = Date.now()) {
  const abertos = items.filter(i => !fechado(i));
  const concluidosComSla = items.filter(i => i.status === "concluido" && i.resolvido_em && i.prazo_resolucao_em);
  const cumpridos = concluidosComSla.filter(i => prazoSla(i.prazo_resolucao_em, i.resolvido_em) === "cumprido").length;
  const dia = diaBrasilia(agora);
  return {
    abertos: abertos.length,
    slaAtrasado: abertos.filter(i => ["atrasado", "violado"].includes(situacaoSla(i, agora).geral)).length,
    vence24h: abertos.filter(i => situacaoSla(i, agora).geral === "atencao").length,
    semProgramacao: abertos.filter(i => !i.prazo_planejado_em).length,
    hoje: abertos.filter(i => i.prazo_planejado_em && diaBrasilia(i.prazo_planejado_em) === dia).length,
    planoAtrasado: abertos.filter(i => atrasoPlanejado(i, agora)).length,
    horasPlanejadas: abertos.filter(i => i.prazo_planejado_em).reduce((sum, i) => sum + Number(i.esforco_estimado_h || 0), 0),
    semSla: abertos.filter(i => situacaoSla(i, agora).geral === "sem_sla").length,
    semResponsavel: abertos.filter(i => !i.responsavel_id).length,
    taxaSla: concluidosComSla.length ? 100 * cumpridos / concluidosComSla.length : null,
    baseTaxa: concluidosComSla.length,
  };
}
