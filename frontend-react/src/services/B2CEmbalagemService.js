import { supabase } from "../lib/supabase";

// Esteira física de embalagem: mesa_1 -> mesa_2 -> mesa_3 -> mesa_4 -> saida.
// A etapa fica em pedidos_b2c.etapa_embalagem (null = bipado no picking, aguardando a mesa 1).
const SEQUENCIA       = ["mesa_1", "mesa_2", "mesa_3", "mesa_4"];
const ETAPA_ANTERIOR  = { mesa_1: null, mesa_2: "mesa_1", mesa_3: "mesa_2", mesa_4: "mesa_3" };
const MESA_LABEL      = { mesa_1: "Mesa 1", mesa_2: "Mesa 2", mesa_3: "Mesa 3", mesa_4: "Mesa 4", saida: "Saída" };

// ══════════════════════════════════════════════════════════
// BIPAGEM NAS MESAS (1 a 4) — com validação de ordem
// ══════════════════════════════════════════════════════════
export async function biparNaMesa(imeiDigitado, mesa, userId, userNome) {
  const imei = String(imeiDigitado || "").trim();
  if (!imei) return { ok: false, erro: "Bipe um IMEI." };
  if (!SEQUENCIA.includes(mesa)) return { ok: false, erro: "Mesa inválida." };

  // Acha o aparelho pelo IMEI (o bipado no picking, ou o alocado)
  const { data: encontrados, error } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, imei_alocado, imei_bipado, status, etapa_embalagem, titulo_produto, cliente, numero_nf, marketplace, emb_nf_colada, emb_selado, emb_etiquetado")
    .or(`imei_bipado.eq.${imei},imei_alocado.eq.${imei}`)
    .limit(1);
  if (error) return { ok: false, erro: error.message };

  const pedido = encontrados?.[0];
  if (!pedido) return { ok: false, erro: `IMEI ${imei} não encontrado.` };

  // Precisa ter sido bipado no picking (entra na esteira a partir do "embalado")
  if (!["embalado", "faturado", "concluido"].includes(pedido.status)) {
    return { ok: false, erro: "Aparelho ainda não foi bipado no picking." };
  }
  if (pedido.etapa_embalagem === "saida" || pedido.status === "concluido") {
    return { ok: false, erro: "Aparelho já finalizado e liberado para saída." };
  }

  // Validação de ordem: a mesa bipada tem que ser a próxima da sequência
  if (pedido.etapa_embalagem === mesa) {
    // Mesa 4: reabre o painel de finalização (os 3 passos já salvos) — útil quando faltava a NF
    if (mesa === "mesa_4") {
      const semNF = !["faturado", "concluido"].includes(pedido.status);
      return { ok: true, mesa, pedido, semNF, reaberto: true };
    }
    return { ok: false, erro: `Aparelho já está na ${MESA_LABEL[mesa]}.` };
  }
  const anterior = ETAPA_ANTERIOR[mesa];
  if (pedido.etapa_embalagem !== anterior) {
    const faltou = anterior ? MESA_LABEL[anterior] : "o início";
    return { ok: false, erro: `Fora de ordem — ainda não passou por ${faltou}.` };
  }

  // Avança a etapa
  const { error: errUpd } = await supabase
    .from("pedidos_b2c")
    .update({ etapa_embalagem: mesa, atualizado_em: new Date().toISOString() })
    .eq("id", pedido.id);
  if (errUpd) return { ok: false, erro: errUpd.message };

  await registrarEvento(pedido.id, imei, mesa, "entrada", userId, userNome);

  const atualizado = { ...pedido, etapa_embalagem: mesa };
  // Sinaliza a trava fiscal já na chegada da mesa 4 (não bloqueia a chegada, só avisa)
  const semNF = mesa === "mesa_4" && pedido.status !== "faturado" && pedido.status !== "concluido";

  return { ok: true, mesa, pedido: atualizado, semNF };
}

// ══════════════════════════════════════════════════════════
// MESA 4 — três passos: nf_colada -> selado -> etiquetado -> saída
// ══════════════════════════════════════════════════════════
export async function confirmarPassoMesa4(pedidoId, passo, userId, userNome) {
  const CAMPO = { nf_colada: "emb_nf_colada", selado: "emb_selado", etiquetado: "emb_etiquetado" };
  const campo = CAMPO[passo];
  if (!campo) return { ok: false, erro: "Passo inválido." };

  const { data: pedido } = await supabase
    .from("pedidos_b2c")
    .select("id, imei_bipado, imei_alocado, status, etapa_embalagem, emb_nf_colada, emb_selado, emb_etiquetado")
    .eq("id", pedidoId)
    .single();
  if (!pedido) return { ok: false, erro: "Aparelho não encontrado." };
  if (pedido.etapa_embalagem !== "mesa_4") {
    return { ok: false, erro: "Aparelho não está na Mesa 4." };
  }

  // Trava fiscal: a NF só pode ser colada se o pedido já foi faturado
  if (passo === "nf_colada" && !["faturado", "concluido"].includes(pedido.status)) {
    return { ok: false, erro: "Falta faturar — sem NF lançada não dá para colar." };
  }

  const imei = pedido.imei_bipado || pedido.imei_alocado;
  const passos = {
    emb_nf_colada:  pedido.emb_nf_colada,
    emb_selado:     pedido.emb_selado,
    emb_etiquetado: pedido.emb_etiquetado,
    [campo]:        true,
  };
  const finalizou = passos.emb_nf_colada && passos.emb_selado && passos.emb_etiquetado;

  const update = { [campo]: true, atualizado_em: new Date().toISOString() };
  if (finalizou) {
    update.etapa_embalagem = "saida";
    update.status = "concluido";
  }

  const { error: errUpd } = await supabase.from("pedidos_b2c").update(update).eq("id", pedidoId);
  if (errUpd) return { ok: false, erro: errUpd.message };

  await registrarEvento(pedidoId, imei, "mesa_4", passo, userId, userNome);
  if (finalizou) await registrarEvento(pedidoId, imei, "mesa_4", "saida", userId, userNome);

  return { ok: true, finalizou, passos };
}

async function registrarEvento(pedidoId, imei, mesa, acao, userId, userNome) {
  await supabase.from("embalagem_eventos").insert({
    pedido_id:    pedidoId,
    imei,
    mesa,
    acao,
    usuario_id:   userId,
    usuario_nome: userNome || "Usuário",
  });
}

// ══════════════════════════════════════════════════════════
// PENDENTES POR MESA — listagem agrupada pelas listas de picking
// ══════════════════════════════════════════════════════════
// Mesa 1  -> aparelhos bipados no picking e ainda sem etapa (etapa_embalagem null)
// Mesa 2+ -> aparelhos cuja etapa atual é a mesa anterior (fila de entrada da mesa)
// Retorna { ok, total, grupos: [{ grupo_id, numero, itens: [...] }] }
export async function listarPendentesMesa(mesa) {
  if (!SEQUENCIA.includes(mesa)) return { ok: false, erro: "Mesa inválida.", grupos: [], total: 0 };
  const anterior = ETAPA_ANTERIOR[mesa]; // mesa_1 => null

  let query = supabase
    .from("pedidos_b2c")
    .select("id, imei_bipado, imei_alocado, titulo_produto, grade_alocada, grade_produto, cliente, marketplace, status, etapa_embalagem, grupo_id")
    .neq("status", "concluido"); // concluído = já saiu, não é pendente

  if (anterior === null) {
    // Aguardando a Mesa 1: bipado no picking mas ainda não entrou na esteira
    query = query.is("etapa_embalagem", null).in("status", ["embalado", "faturado"]);
  } else {
    // Fila da mesa: itens que terminaram a etapa anterior
    query = query.eq("etapa_embalagem", anterior);
  }

  const { data: pedidos, error } = await query;
  if (error) return { ok: false, erro: error.message, grupos: [], total: 0 };

  const lista = pedidos || [];
  if (lista.length === 0) return { ok: true, grupos: [], total: 0 };

  // Busca o número de cada lista de picking (pedidos_b2c_grupos.numero)
  const gruposIds = [...new Set(lista.map(p => p.grupo_id).filter(Boolean))];
  const numeroPorGrupo = {};
  if (gruposIds.length) {
    const { data: grupos } = await supabase
      .from("pedidos_b2c_grupos")
      .select("id, numero")
      .in("id", gruposIds);
    (grupos || []).forEach(g => { numeroPorGrupo[g.id] = g.numero; });
  }

  // Agrupa por lista de picking
  const mapa = {};
  lista.forEach(p => {
    const chave = p.grupo_id || "sem_grupo";
    if (!mapa[chave]) {
      mapa[chave] = {
        grupo_id: p.grupo_id || null,
        numero:   p.grupo_id ? (numeroPorGrupo[p.grupo_id] ?? null) : null,
        itens:    [],
      };
    }
    mapa[chave].itens.push({
      id:          p.id,
      imei:        p.imei_bipado || p.imei_alocado,
      modelo:      p.titulo_produto,
      grade:       p.grade_alocada || p.grade_produto,
      cliente:     p.cliente,
      marketplace: p.marketplace,
    });
  });

  // Ordena: listas com número primeiro (crescente), "sem grupo" por último
  const grupos = Object.values(mapa).sort((a, b) => {
    if (a.numero == null && b.numero == null) return 0;
    if (a.numero == null) return 1;
    if (b.numero == null) return -1;
    return a.numero - b.numero;
  });

  return { ok: true, grupos, total: lista.length };
}

// ══════════════════════════════════════════════════════════
// PAINEL DE ACOMPANHAMENTO
// ══════════════════════════════════════════════════════════
export async function listarPainelMesas() {
  // Quantos aparelhos estão parados em cada mesa agora
  const { data: pedidos } = await supabase
    .from("pedidos_b2c")
    .select("etapa_embalagem")
    .in("etapa_embalagem", ["mesa_1", "mesa_2", "mesa_3", "mesa_4"]);

  const porMesa = { mesa_1: 0, mesa_2: 0, mesa_3: 0, mesa_4: 0 };
  (pedidos || []).forEach(p => { if (porMesa[p.etapa_embalagem] != null) porMesa[p.etapa_embalagem]++; });

  // Eventos de hoje — para liberados na saída e produção por operador
  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const { data: eventos } = await supabase
    .from("embalagem_eventos")
    .select("acao, usuario_nome, mesa")
    .gte("criado_em", inicioHoje.toISOString());

  const evs = eventos || [];
  const liberadosHoje = evs.filter(e => e.acao === "saida").length;

  // Produção = 1 por aparelho que entrou numa mesa (conta só "entrada", justo entre as mesas)
  const prod = {};
  evs.forEach(e => {
    if (e.acao !== "entrada") return;
    const nome = e.usuario_nome || "—";
    if (!prod[nome]) prod[nome] = { nome, total: 0, mesas: {} };
    prod[nome].total++;
    prod[nome].mesas[e.mesa] = (prod[nome].mesas[e.mesa] || 0) + 1;
  });
  const producao = Object.values(prod)
    .map(p => {
      const top = Object.entries(p.mesas).sort((a, b) => b[1] - a[1])[0];
      return { nome: p.nome, total: p.total, mesa: top ? top[0] : null };
    })
    .sort((a, b) => b.total - a.total);

  // Gargalo = mesa com mais aparelhos parados
  const ordenadas = Object.entries(porMesa).sort((a, b) => b[1] - a[1]);
  const gargalo = ordenadas[0] && ordenadas[0][1] > 0 ? ordenadas[0][0] : null;

  return { porMesa, liberadosHoje, producao, gargalo };
}

export { MESA_LABEL };