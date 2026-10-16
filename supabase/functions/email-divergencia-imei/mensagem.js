const esc = x => String(x ?? "—").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
export function mensagemDivergencia(c) {
  const data = c.criado_em ? new Date(c.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "Não informada";
  const campos = [["Voucher", c.voucher], ["Modelo", c.modelo], ["Identificação do contrato", c.imei_esperado],
    ["Bipado 1", c.imei1], ["Bipado 2", c.imei2 || "Não se aplica"], ["Usuário da triagem", c.criado_por_nome],
    ["Data do registro", data], ["Caso", c.id]];
  const aviso = "Há um novo item com divergência de IMEI pendente de avaliação. O aparelho foi segregado e aguarda a diretriz da Assurant.";
  const acao = "Acesse Triagens → Divergências de IMEI no Liquida System para avaliar o item e registrar a decisão.";
  return { subject: `Novo item com IMEI divergente — avaliação pendente — ${c.voucher}`,
    text: [aviso, ...campos.map(([a,b]) => `${a}: ${b ?? "—"}`), acao].join("\n"),
    html: `<div style="font-family:Arial;color:#334155"><h2 style="color:#b91c1c">IMEI DIVERGENTE — Avaliação pendente</h2><p>${aviso}</p><table>${campos.map(([a,b])=>`<tr><th style="text-align:left;padding:8px">${esc(a)}</th><td>${esc(b)}</td></tr>`).join("")}</table><p>${acao}</p></div>` };
}
