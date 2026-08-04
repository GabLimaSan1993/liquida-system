import { supabase } from "../lib/supabase";

// Embalagem B2C — mesa única.
// Antes eram 4 mesas em esteira; hoje tudo acontece num posto só, então
// etapa_embalagem serve apenas para marcar quem já está na mesa ("mesa_4")
// e quem já saiu ("saida"). O campo foi mantido para não quebrar o histórico.
const MESA = "mesa_4";

// ══════════════════════════════════════════════════════════
// BIPAGEM NA MESA
// ══════════════════════════════════════════════════════════
export async function biparNaMesa(imeiDigitado, mesa, userId, userNome) {
  const imei = String(imeiDigitado || "").trim();
  if (!imei) return { ok: false, erro: "Bipe um IMEI." };

  const { data: encontrados, error } = await supabase
    .from("pedidos_b2c")
    .select("id, id_anymarket, imei_alocado, imei_bipado, status, etapa_embalagem, titulo_produto, cliente, numero_nf, chave_nf, marketplace, emb_nf_colada, emb_selado, emb_etiquetado")
    .or(`imei_bipado.eq.${imei},imei_alocado.eq.${imei}`)
    .limit(1);
  if (error) return { ok: false, erro: error.message };

  const pedido = encontrados?.[0];
  if (!pedido) return { ok: false, erro: `IMEI ${imei} não encontrado.` };

  // Entra na mesa a partir do "embalado" (bipado no picking)
  if (!["embalado", "faturado", "concluido"].includes(pedido.status)) {
    return { ok: false, erro: "Aparelho ainda não foi bipado no picking." };
  }
  if (pedido.etapa_embalagem === "saida" || pedido.status === "concluido") {
    return { ok: false, erro: "Aparelho já finalizado e liberado para saída." };
  }

  const semNF = !["faturado", "concluido"].includes(pedido.status);

  // Já estava na mesa: só reabre o painel com os passos salvos
  if (pedido.etapa_embalagem === MESA) {
    return { ok: true, mesa: MESA, pedido, semNF, reaberto: true };
  }

  const { error: errUpd } = await supabase
    .from("pedidos_b2c")
    .update({ etapa_embalagem: MESA, atualizado_em: new Date().toISOString() })
    .eq("id", pedido.id);
  if (errUpd) return { ok: false, erro: errUpd.message };

  await registrarEvento(pedido.id, imei, MESA, "entrada", userId, userNome);

  return { ok: true, mesa: MESA, pedido: { ...pedido, etapa_embalagem: MESA }, semNF };
}

// ══════════════════════════════════════════════════════════
// PASSOS: nf_colada -> selado -> etiquetado -> saída
// O passo "etiquetado" é disparado pela impressão da etiqueta, não por clique.
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
  if (pedido.etapa_embalagem !== MESA) {
    return { ok: false, erro: "Aparelho não está na mesa." };
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

  await registrarEvento(pedidoId, imei, MESA, passo, userId, userNome);
  if (finalizou) await registrarEvento(pedidoId, imei, MESA, "saida", userId, userNome);

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
// FILA DA MESA — tudo que saiu do picking e ainda não teve etiqueta impressa
// ══════════════════════════════════════════════════════════
// Entra na fila quem foi bipado no picking (status embalado ou faturado) e
// ainda não fechou o passo da etiqueta. Sai da lista assim que a etiqueta é
// impressa — que é o gesto que conclui a embalagem.
export async function listarPendentesMesa() {
  const { data: pedidos, error } = await supabase
    .from("pedidos_b2c")
    .select("id, imei_bipado, imei_alocado, titulo_produto, grade_alocada, grade_produto, cliente, marketplace, status, numero_nf, etapa_embalagem, emb_nf_colada, emb_selado, emb_etiquetado, grupo_id")
    .in("status", ["embalado", "faturado"])
    .neq("etapa_embalagem", "saida")
    .or("emb_etiquetado.is.null,emb_etiquetado.eq.false");
  if (error) return { ok: false, erro: error.message, grupos: [], total: 0 };

  const lista = pedidos || [];
  if (lista.length === 0) return { ok: true, grupos: [], total: 0 };

  // Número de cada lista de picking (pedidos_b2c_grupos.numero), em blocos de 200
  const gruposIds = [...new Set(lista.map(p => p.grupo_id).filter(Boolean))];
  const numeroPorGrupo = {};
  const BLOCO = 200;
  for (let i = 0; i < gruposIds.length; i += BLOCO) {
    const { data: grupos } = await supabase
      .from("pedidos_b2c_grupos")
      .select("id, numero")
      .in("id", gruposIds.slice(i, i + BLOCO));
    (grupos || []).forEach(g => { numeroPorGrupo[g.id] = g.numero; });
  }

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
      numero_nf:   p.numero_nf,
      semNF:       p.status !== "faturado",
      naMesa:      p.etapa_embalagem === "mesa_4",
      passos:      [p.emb_nf_colada, p.emb_selado, p.emb_etiquetado].filter(Boolean).length,
    });
  });

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
  const { data: pedidos } = await supabase
    .from("pedidos_b2c")
    .select("etapa_embalagem")
    .in("etapa_embalagem", ["mesa_1", "mesa_2", "mesa_3", "mesa_4"]);

  const porMesa = { mesa_1: 0, mesa_2: 0, mesa_3: 0, mesa_4: 0 };
  (pedidos || []).forEach(p => { if (porMesa[p.etapa_embalagem] != null) porMesa[p.etapa_embalagem]++; });

  const inicioHoje = new Date();
  inicioHoje.setHours(0, 0, 0, 0);
  const { data: eventos } = await supabase
    .from("embalagem_eventos")
    .select("acao, usuario_nome, mesa")
    .gte("criado_em", inicioHoje.toISOString());

  const evs = eventos || [];
  const liberadosHoje = evs.filter(e => e.acao === "saida").length;

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

  const ordenadas = Object.entries(porMesa).sort((a, b) => b[1] - a[1]);
  const gargalo = ordenadas[0] && ordenadas[0][1] > 0 ? ordenadas[0][0] : null;

  return { porMesa, liberadosHoje, producao, gargalo };
}