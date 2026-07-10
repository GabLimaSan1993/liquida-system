import { supabase } from "../lib/supabase";

// Peças que não estão fisicamente no armazém não entram na contagem.
const STATUS_FORA_DO_ESTOQUE = ["Finalizado"];

// ══════════════════════════════════════════════════════════
// NORMALIZAÇÃO DE ENDEREÇO
// A base tem "RA 12/BL01/AD01/A", "R12/BL4/AD1/A" e "RUA 12/BL02/AD05/A".
// São blocos diferentes da mesma rua, escritos de formas diferentes.
// A forma canônica é RUA {n}/BL{nn}/AD{nn}/{resto}.
// A coluna local_normalizado (mantida por trigger) espelha esta regra no banco.
// ══════════════════════════════════════════════════════════
export function normalizarEndereco(local) {
  if (!local) return null;
  const bruto = String(local).trim().toUpperCase();
  if (!bruto || bruto === "GENERICO") return bruto || null;

  const partes = bruto.split("/").map(p => p.trim()).filter(Boolean);
  if (!partes.length) return null;

  // RUA: "RA 12", "R12", "RUA 12" -> "RUA 12"
  const mRua = partes[0].match(/(\d+)/);
  const rua = mRua ? `RUA ${parseInt(mRua[1], 10)}` : partes[0];

  // BLOCO: "BL4", "BL04" -> "BL04"
  let bloco = partes[1] || "";
  const mBloco = bloco.match(/BL\s*0*(\d+)/);
  if (mBloco) bloco = `BL${String(mBloco[1]).padStart(2, "0")}`;

  // ENDEREÇO: "AD1", "AD01" -> "AD01"
  let ad = partes[2] || "";
  const mAd = ad.match(/AD\s*0*(\d+)/);
  if (mAd) ad = `AD${String(mAd[1]).padStart(2, "0")}`;

  return [rua, bloco, ad, ...partes.slice(3)].filter(Boolean).join("/");
}

function bloco(endereco) {
  const p = String(endereco || "").split("/");
  return p.length >= 2 ? `${p[0]}/${p[1]}` : endereco;
}

// ══════════════════════════════════════════════════════════
// CICLOS
// ══════════════════════════════════════════════════════════
export async function cicloAberto() {
  const { data } = await supabase
    .from("inventario_ciclos")
    .select("*")
    .eq("status", "aberto")
    .order("inicio", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function abrirCiclo(nome, userId) {
  const existente = await cicloAberto();
  if (existente) return { ok: false, erro: `Já existe um ciclo aberto: ${existente.nome}` };

  const hoje = new Date();
  const inicio = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;

  const { data, error } = await supabase
    .from("inventario_ciclos")
    .insert({ nome, inicio, criado_por: userId })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ok: true, ciclo: data };
}

// ══════════════════════════════════════════════════════════
// SORTEIO DO DIA
// Pega os endereços ainda não contados no ciclo, agrupa por bloco
// (para o operador não atravessar o armazém) e cria as contagens pendentes.
// ══════════════════════════════════════════════════════════
export async function sortearDia(cicloId, quantidade = 131) {
  // Endereços que existem no estoque (a coluna local_normalizado é mantida por trigger)
  const { data: pecas, error } = await supabase
    .from("assurant_triagem")
    .select("local_normalizado")
    .not("local_normalizado", "is", null)
    .neq("local_normalizado", "GENERICO")
    .not("status_atual", "in", `(${STATUS_FORA_DO_ESTOQUE.map(s => `"${s}"`).join(",")})`);
  if (error) throw new Error(error.message);

  const enderecos = new Set();
  (pecas || []).forEach(p => enderecos.add(p.local_normalizado));

  // Os que já foram contados neste ciclo
  const { data: jaContados } = await supabase
    .from("inventario_contagens")
    .select("endereco")
    .eq("ciclo_id", cicloId);
  const contados = new Set((jaContados || []).map(c => c.endereco));

  const pendentes = Array.from(enderecos).filter(e => !contados.has(e));
  if (!pendentes.length) return { ok: false, erro: "Todos os endereços já foram contados neste ciclo." };

  // Agrupa por bloco e vai preenchendo bloco a bloco, para minimizar deslocamento
  const porBloco = {};
  pendentes.forEach(e => {
    const b = bloco(e);
    (porBloco[b] = porBloco[b] || []).push(e);
  });

  const blocos = Object.keys(porBloco).sort();
  const doDia = [];
  for (const b of blocos) {
    for (const e of porBloco[b].sort()) {
      if (doDia.length >= quantidade) break;
      doDia.push(e);
    }
    if (doDia.length >= quantidade) break;
  }

  const linhas = doDia.map(e => ({ ciclo_id: cicloId, endereco: e, status: "pendente" }));
  const { error: errIns } = await supabase.from("inventario_contagens").insert(linhas);
  if (errIns) throw new Error(errIns.message);

  return { ok: true, criadas: doDia.length, restantes: pendentes.length - doDia.length };
}

export async function listarContagensPendentes(cicloId) {
  const { data, error } = await supabase
    .from("inventario_contagens")
    .select("*")
    .eq("ciclo_id", cicloId)
    .in("status", ["pendente", "em_contagem"])
    .order("endereco", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ══════════════════════════════════════════════════════════
// ABRIR CONTAGEM — congela os esperados
// A peça é identificada pelo voucher (chave real da triagem): dois aparelhos
// podem compartilhar o mesmo IMEI por erro de cadastro (13 casos na base).
// ══════════════════════════════════════════════════════════
export async function abrirContagem(contagemId, userId, userNome) {
  const { data: cont } = await supabase
    .from("inventario_contagens").select("*").eq("id", contagemId).single();
  if (!cont) return { ok: false, erro: "Contagem não encontrada." };
  if (cont.status === "concluida") return { ok: false, erro: "Contagem já concluída." };

  // Já congelada? Devolve o que está lá.
  if (cont.status === "em_contagem") {
    const itens = await listarItens(contagemId);
    return { ok: true, contagem: cont, itens, reaberta: true };
  }

  // Peças que o sistema espera neste endereço — filtro direto no banco, via índice.
  const { data: esperadas, error } = await supabase
    .from("assurant_triagem")
    .select("imei, voucher, local, sku, grade, status_atual")
    .eq("local_normalizado", cont.endereco)
    .not("status_atual", "in", `(${STATUS_FORA_DO_ESTOQUE.map(s => `"${s}"`).join(",")})`);
  if (error) throw new Error(error.message);

  const linhas = (esperadas || []).map(p => ({
    contagem_id:       contagemId,
    ciclo_id:          cont.ciclo_id,
    imei:              p.imei,
    veredito:          "esperado",
    endereco_anterior: p.local,
  }));

  if (linhas.length) {
    const { error: errIns } = await supabase.from("inventario_itens").insert(linhas);
    if (errIns) throw new Error(errIns.message);
  }

  const { error: errUpd } = await supabase
    .from("inventario_contagens")
    .update({
      status:          "em_contagem",
      esperadas:       linhas.length,
      operador_id:     userId,
      operador_nome:   userNome || "Operador",
      aberta_em:       new Date().toISOString(),
      endereco_origem: esperadas?.[0]?.local || null,
    })
    .eq("id", contagemId);
  if (errUpd) throw new Error(errUpd.message);

  const itens = await listarItens(contagemId);
  return { ok: true, contagem: { ...cont, status: "em_contagem", esperadas: linhas.length }, itens };
}

export async function listarItens(contagemId) {
  const { data, error } = await supabase
    .from("inventario_itens")
    .select("*")
    .eq("contagem_id", contagemId)
    .order("criado_em", { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// ══════════════════════════════════════════════════════════
// BIPAR
// ══════════════════════════════════════════════════════════
export async function biparItem(contagemId, imeiDigitado) {
  const imei = String(imeiDigitado || "").trim();
  if (!imei) return { ok: false, erro: "Bipe um identificador." };

  const { data: cont } = await supabase
    .from("inventario_contagens").select("*").eq("id", contagemId).single();
  if (!cont || cont.status !== "em_contagem") {
    return { ok: false, erro: "Contagem não está aberta." };
  }

  // Estava na lista de esperados deste endereço?
  const { data: esperado } = await supabase
    .from("inventario_itens")
    .select("*")
    .eq("contagem_id", contagemId)
    .eq("imei", imei)
    .eq("veredito", "esperado")
    .limit(1)
    .maybeSingle();

  const agora = new Date().toISOString();

  if (esperado) {
    await supabase
      .from("inventario_itens")
      .update({ veredito: "conferido", bipado_em: agora })
      .eq("id", esperado.id);
    await supabase
      .from("inventario_contagens")
      .update({ encontradas: cont.encontradas + 1 })
      .eq("id", contagemId);
    return { ok: true, veredito: "conferido", imei };
  }

  // Já foi bipado nesta contagem?
  const { data: repetido } = await supabase
    .from("inventario_itens")
    .select("id")
    .eq("contagem_id", contagemId)
    .eq("imei", imei)
    .in("veredito", ["conferido", "sobra", "conflito"])
    .limit(1)
    .maybeSingle();
  if (repetido) return { ok: false, erro: `${imei} já foi bipado nesta contagem.` };

  // SOBRA: a peça está aqui, mas o sistema a esperava em outro lugar (ou lugar nenhum).
  const { data: linhas } = await supabase
    .from("assurant_triagem")
    .select("id, imei, voucher, local, criado_em, atualizado_em")
    .eq("imei", imei)
    .not("status_atual", "in", `(${STATUS_FORA_DO_ESTOQUE.map(s => `"${s}"`).join(",")})`)
    .order("atualizado_em", { ascending: false })
    .order("criado_em", { ascending: false });

  if (!linhas?.length) {
    return { ok: false, erro: `${imei} não existe no estoque (ou já foi expedido).` };
  }

  const conflito = linhas.length > 1;
  const alvo = linhas[0];  // a mais recente
  const anterior = alvo.local;

  // Corrige o local na linha mais recente, já na forma canônica.
  // A trigger do banco atualiza o local_normalizado sozinha.
  await supabase
    .from("assurant_triagem")
    .update({ local: cont.endereco })
    .eq("id", alvo.id);

  await supabase.from("inventario_itens").insert({
    contagem_id:       contagemId,
    ciclo_id:          cont.ciclo_id,
    imei,
    veredito:          conflito ? "conflito" : "sobra",
    endereco_anterior: anterior,
    bipado_em:         agora,
  });

  await supabase
    .from("inventario_contagens")
    .update({ encontradas: cont.encontradas + 1 })
    .eq("id", contagemId);

  // Reconciliação: essa peça era uma "falta" de outra contagem deste ciclo?
  const { data: falta } = await supabase
    .from("inventario_itens")
    .select("id")
    .eq("ciclo_id", cont.ciclo_id)
    .eq("imei", imei)
    .eq("veredito", "falta")
    .is("reconciliado_em", null)
    .limit(1)
    .maybeSingle();

  let reconciliou = false;
  if (falta) {
    await supabase
      .from("inventario_itens")
      .update({ reconciliado_em: agora, reconciliado_por: contagemId })
      .eq("id", falta.id);
    reconciliou = true;
  }

  return {
    ok: true,
    veredito: conflito ? "conflito" : "sobra",
    imei,
    anterior,
    reconciliou,
  };
}

// ══════════════════════════════════════════════════════════
// FECHAR CONTAGEM — o que restou como "esperado" vira "falta"
// ══════════════════════════════════════════════════════════
export async function fecharContagem(contagemId) {
  const { data: cont } = await supabase
    .from("inventario_contagens").select("*").eq("id", contagemId).single();
  if (!cont || cont.status !== "em_contagem") {
    return { ok: false, erro: "Contagem não está aberta." };
  }

  const { data: faltas } = await supabase
    .from("inventario_itens")
    .update({ veredito: "falta" })
    .eq("contagem_id", contagemId)
    .eq("veredito", "esperado")
    .select("id");

  await supabase
    .from("inventario_contagens")
    .update({ status: "concluida", fechada_em: new Date().toISOString() })
    .eq("id", contagemId);

  const itens = await listarItens(contagemId);
  const conferidos = itens.filter(i => i.veredito === "conferido").length;
  const sobras     = itens.filter(i => ["sobra", "conflito"].includes(i.veredito)).length;
  const qtdFaltas  = faltas?.length || 0;
  const perfeito   = qtdFaltas === 0 && sobras === 0;

  return { ok: true, conferidos, sobras, faltas: qtdFaltas, perfeito };
}

// ══════════════════════════════════════════════════════════
// PAINEL — as duas acuracidades
// ══════════════════════════════════════════════════════════
export async function painelCiclo(cicloId) {
  const { data: contagens } = await supabase
    .from("inventario_contagens")
    .select("id, status")
    .eq("ciclo_id", cicloId);

  const { data: itens } = await supabase
    .from("inventario_itens")
    .select("contagem_id, veredito, reconciliado_em")
    .eq("ciclo_id", cicloId);

  const todas       = contagens || [];
  const concluidas  = todas.filter(c => c.status === "concluida");
  const evs         = itens || [];

  const conferidos    = evs.filter(i => i.veredito === "conferido").length;
  const sobras        = evs.filter(i => i.veredito === "sobra").length;
  const conflitos     = evs.filter(i => i.veredito === "conflito").length;
  const faltasTotais  = evs.filter(i => i.veredito === "falta");
  const reconciliadas = faltasTotais.filter(i => i.reconciliado_em).length;
  const fantasmas     = faltasTotais.length - reconciliadas;

  // Acuracidade por peça: das contadas, quantas estavam onde deviam.
  const denominadorPeca = conferidos + sobras + conflitos + fantasmas;
  const acuraciaPeca = denominadorPeca > 0
    ? (conferidos / denominadorPeca) * 100
    : null;

  // Acuracidade por endereço: um endereço só é perfeito se tudo que era esperado
  // estava lá e nada estranho apareceu. Uma falta reconciliada depois continua
  // sendo um erro deste endereço — a peça não estava onde o sistema dizia.
  const problemasPorContagem = {};
  evs.forEach(i => {
    if (i.veredito !== "conferido") problemasPorContagem[i.contagem_id] = true;
  });
  const perfeitos = concluidas.filter(c => !problemasPorContagem[c.id]).length;
  const acuraciaEndereco = concluidas.length > 0
    ? (perfeitos / concluidas.length) * 100
    : null;

  return {
    totalEnderecos:   todas.length,
    concluidas:       concluidas.length,
    conferidos,
    sobras,
    conflitos,
    reconciliadas,
    fantasmas,
    acuraciaPeca,
    acuraciaEndereco,
    perfeitos,
  };
}

// Lista os conflitos do ciclo (mesmo IMEI em mais de um registro) para tratar com a Assurant.
export async function listarConflitos(cicloId) {
  const { data, error } = await supabase
    .from("inventario_itens")
    .select("imei, endereco_anterior, bipado_em, contagem_id")
    .eq("ciclo_id", cicloId)
    .eq("veredito", "conflito")
    .order("bipado_em", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// ══════════════════════════════════════════════════════════
// FECHAMENTO DIÁRIO
// O ciclo é mensal, mas as contagens são fechadas ao longo dos dias.
// Aqui consolidamos tudo que foi concluído num dia (fuso São Paulo),
// gravamos um snapshot assinável e alimentamos o histórico + o PDF.
// ══════════════════════════════════════════════════════════

// "Hoje" no fuso do armazém (São Paulo), no formato YYYY-MM-DD.
export function hojeSP() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

// Dia seguinte a uma data YYYY-MM-DD, sem depender do fuso do navegador.
function proximoDia(data) {
  const [y, m, d] = String(data).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + 1);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// Intervalo [início, fim) que cobre o dia inteiro em São Paulo (UTC-3).
function rangeDiaSP(data) {
  return { inicio: `${data}T00:00:00-03:00`, fim: `${proximoDia(data)}T00:00:00-03:00` };
}

function resumirContagem(itens) {
  const conferidas = itens.filter(i => i.veredito === "conferido").length;
  const sobras     = itens.filter(i => i.veredito === "sobra").length;
  const conflitos  = itens.filter(i => i.veredito === "conflito").length;
  const faltas     = itens.filter(i => i.veredito === "falta").length;
  const perfeito   = itens.length > 0 && itens.every(i => i.veredito === "conferido");
  return { conferidas, sobras, conflitos, faltas, perfeito };
}

// Resumo consolidado de um dia: contagens concluídas, seus itens (para o
// drill-down e o anexo do PDF), os totais e o registro de fechamento se já existir.
export async function resumoDoDia(cicloId, data) {
  const { inicio, fim } = rangeDiaSP(data);

  const { data: contagens, error } = await supabase
    .from("inventario_contagens")
    .select("*")
    .eq("ciclo_id", cicloId)
    .eq("status", "concluida")
    .gte("fechada_em", inicio)
    .lt("fechada_em", fim)
    .order("endereco", { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (contagens || []).map(c => c.id);
  let itens = [];
  if (ids.length) {
    const { data: its, error: e2 } = await supabase
      .from("inventario_itens")
      .select("*")
      .in("contagem_id", ids)
      .order("bipado_em", { ascending: true });
    if (e2) throw new Error(e2.message);
    itens = its || [];
  }

  const porContagem = {};
  itens.forEach(i => { (porContagem[i.contagem_id] = porContagem[i.contagem_id] || []).push(i); });

  const detalhadas = (contagens || []).map(c => {
    const its = porContagem[c.id] || [];
    return { ...c, itens: its, ...resumirContagem(its) };
  });

  const conferidas = detalhadas.reduce((s, c) => s + c.conferidas, 0);
  const sobras     = detalhadas.reduce((s, c) => s + c.sobras, 0);
  const conflitos  = detalhadas.reduce((s, c) => s + c.conflitos, 0);
  const faltas     = detalhadas.reduce((s, c) => s + c.faltas, 0);
  const perfeitos  = detalhadas.filter(c => c.perfeito).length;

  // Acuracidade do dia (bruta): das peças avaliadas, quantas estavam onde deviam.
  const denomPeca = conferidas + sobras + conflitos + faltas;
  const acuraciaPeca     = denomPeca > 0 ? (conferidas / denomPeca) * 100 : null;
  const acuraciaEndereco = detalhadas.length > 0 ? (perfeitos / detalhadas.length) * 100 : null;

  const { data: fechamento } = await supabase
    .from("inventario_fechamentos")
    .select("*")
    .eq("ciclo_id", cicloId)
    .eq("data", data)
    .maybeSingle();

  return {
    data,
    contagens: detalhadas,
    totais: {
      enderecos: detalhadas.length,
      conferidas, sobras, conflitos, faltas, perfeitos,
      acuraciaPeca, acuraciaEndereco,
    },
    fechamento: fechamento || null,
  };
}

// Grava (ou atualiza) o fechamento do dia. Um registro por ciclo+data.
export async function fecharDia(cicloId, data, userId, userNome) {
  const resumo = await resumoDoDia(cicloId, data);
  if (!resumo.contagens.length) {
    return { ok: false, erro: `Nenhuma contagem concluída em ${data}.` };
  }
  const t = resumo.totais;

  const { data: reg, error } = await supabase
    .from("inventario_fechamentos")
    .upsert({
      ciclo_id:          cicloId,
      data,
      enderecos:         t.enderecos,
      conferidas:        t.conferidas,
      sobras:            t.sobras,
      conflitos:         t.conflitos,
      faltas:            t.faltas,
      acuracia_peca:     t.acuraciaPeca,
      acuracia_endereco: t.acuraciaEndereco,
      fechado_por:       userId,
      fechado_por_nome:  userNome || "Operador",
      fechado_em:        new Date().toISOString(),
    }, { onConflict: "ciclo_id,data" })
    .select()
    .single();
  if (error) throw new Error(error.message);

  return { ok: true, fechamento: reg, resumo };
}

export async function listarFechamentos(cicloId) {
  const { data, error } = await supabase
    .from("inventario_fechamentos")
    .select("*")
    .eq("ciclo_id", cicloId)
    .order("data", { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}