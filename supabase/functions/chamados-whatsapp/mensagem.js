const texto = v => String(v ?? "").replace(/[\r\n\t]+/g, " ").trim();
export function variaveisChamado(p) {
  const prioridades = { urgente: "Urgente", alta: "Alta", normal: "Normal", baixa: "Baixa" };
  return {
    "1": `CH-${String(p.numero).padStart(5, "0")}`,
    "2": texto(p.titulo).slice(0, 180),
    "3": prioridades[p.prioridade] || "Normal",
    "4": texto(p.solicitante).slice(0, 120) || "Não informado",
    "5": texto(p.tela).slice(0, 200) || "Não informada",
    "6": new Date(p.criado_em).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }),
  };
}
export function corpoMensagem(job) {
  const c = job.config;
  const body = new URLSearchParams({ To: `whatsapp:${c.destinatario}`, From: `whatsapp:${c.remetente}` });
  if (job.teste && c.modo === "teste") {
    const modelo = c.content_sid;
    if (!/^HX[0-9a-f]{32}$/i.test(modelo)) throw new Error("Modelo de teste inválido.");
    body.set("ContentSid", modelo);
  } else if (job.teste) {
    body.set("Body", "Liquida System: teste de conexão do WhatsApp. Os avisos automáticos só serão ativados após configurar o remetente de produção e o modelo aprovado.");
  } else {
    if (c.modo !== "producao" || !/^HX[0-9a-f]{32}$/i.test(c.content_sid || "")) throw new Error("Modelo de produção não configurado.");
    body.set("ContentSid", c.content_sid);
    body.set("ContentVariables", JSON.stringify(variaveisChamado(job.payload)));
  }
  return body;
}
export function resultadoTwilio(data) {
  if (["delivered", "read"].includes(data.status)) return "entregue";
  if (["failed", "undelivered", "canceled"].includes(data.status)) return "erro";
  return "aceito";
}
export function erroTwilio(code) {
  const textos = {
    20003: "Credenciais da Twilio inválidas. Confira o Account SID e o Auth Token.",
    21654: "A conta de teste da Twilio exige um modelo pronto (Content SID); mensagens livres não são permitidas.",
    21655: "Este modelo não está disponível nesta conta Twilio. Use o Content SID exibido no teste de WhatsApp da sua conta.",
    63007: "Remetente de WhatsApp não encontrado na Twilio.",
    63015: "Vincule seu WhatsApp ao ambiente de teste da Twilio antes de enviar.",
    63016: "A janela de conversa expirou. Use um modelo aprovado em produção ou reconecte o teste.",
    63038: "A Twilio restringiu o envio de teste para este destino. Consulte a configuração da conta.",
    21211: "Número de destino inválido ou não habilitado para receber o teste.",
    63003: "O número de destino não é válido para WhatsApp.",
  };
  return textos[code] || `Falha na Twilio${Number.isInteger(Number(code)) && code ? ` (código ${Number(code)})` : ""}. Confira o histórico de mensagens no serviço.`;
}
