import { supabase } from "../lib/supabase.js";

export const REFRIGERACAO_CATEGORIA = "Refrigerador";
export const DESTINOS_CONDENACAO = ["Scrap", "Venda no estado", "Desmembramento"];

const STATUS_AGUARDANDO = ["Recebido", "Aguardando triagem", "Em triagem"];
const STATUS_REPARO = ["Triado", "Encaminhado para reparo", "Em reparo", "Aguardando peça"];
const STATUS_TESTES = ["Bancada de Testes", "Em teste final"];
const STATUS_CONCLUIDAS = ["Aprovado", "Limpeza", "Higienização", "Qualidade", "Finalizado"];

function normalizarArea(area) {
  if (area === "Eletrônica") return "Reparo Elétrico";
  if (area === "Reparo") return "Reparo Mecânico";
  return area || null;
}

export async function fetchIndicadoresRefrigeracao() {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("id,numero_os,status_atual,etapa_atual,area_destino,updated_at")
    .eq("linha_produto", "Linha Branca")
    .eq("categoria", REFRIGERACAO_CATEGORIA)
    .order("updated_at", { ascending: false });

  if (error) throw error;
  const osList = data || [];

  const aguardandoTriagem = osList.filter((os) => STATUS_AGUARDANDO.includes(os.status_atual));
  const emReparo = osList.filter(
    (os) =>
      STATUS_REPARO.includes(os.status_atual) ||
      String(os.area_destino || "").startsWith("Reparo") ||
      os.area_destino === "Eletrônica"
  );
  const emTestes = osList.filter(
    (os) => STATUS_TESTES.includes(os.status_atual) || os.area_destino === "Bancada de Testes"
  );
  const concluidas = osList.filter((os) => STATUS_CONCLUIDAS.includes(os.status_atual));

  return {
    total: osList.length,
    osList,
    aguardandoTriagem,
    emReparo,
    emTestes,
    concluidas,
    indicadores: {
      aguardandoTriagem: aguardandoTriagem.length,
      emReparo: emReparo.length,
      emTestes: emTestes.length,
      concluidas: concluidas.length,
    },
  };
}

export async function fetchOsRefrigeracaoParaReparo() {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .eq("linha_produto", "Linha Branca")
    .eq("categoria", REFRIGERACAO_CATEGORIA)
    .in("status_atual", STATUS_REPARO)
    .order("dt_entrada", { ascending: true });

  if (error) throw error;

  const lista = data || [];
  if (!lista.length) return [];

  const ids = lista.map((os) => os.id);
  const [{ data: triagens, error: triagemError }, { data: condenacoes, error: condenacaoError }] =
    await Promise.all([
      supabase
        .from("linha_branca_triagens")
        .select("*")
        .in("os_id", ids)
        .eq("tipo_produto", "Refrigeração")
        .order("created_at", { ascending: false }),
      supabase
        .from("linha_branca_condenacoes")
        .select("os_id")
        .in("os_id", ids)
        .eq("status", "aguardando_aprovacao"),
    ]);

  if (triagemError) throw triagemError;
  if (condenacaoError) throw condenacaoError;

  const triagemPorOs = new Map();
  (triagens || []).forEach((triagem) => {
    const key = String(triagem.os_id);
    if (!triagemPorOs.has(key)) triagemPorOs.set(key, triagem);
  });

  const pendentesCondenacao = new Set((condenacoes || []).map((item) => String(item.os_id)));

  return lista
    .filter((os) => !pendentesCondenacao.has(String(os.id)))
    .map((os) => {
      let areas = Array.isArray(os.areas_reparo) ? [...os.areas_reparo] : [];
      if (!areas.length && normalizarArea(os.area_destino)) {
        const area = normalizarArea(os.area_destino);
        if (["Reparo Mecânico", "Reparo Elétrico", "Reparo Estético"].includes(area)) areas = [area];
      }

      return {
        ...os,
        areas_reparo: areas,
        area_destino: normalizarArea(os.area_destino),
        etapa_atual: normalizarArea(os.etapa_atual),
        __triagem: triagemPorOs.get(String(os.id)) || null,
      };
    });
}

export async function fetchHistoricoRefrigeracao(osId) {
  if (!osId) return { triagens: [], reparos: [], condenacoes: [], requisicoes: [], compras: [] };

  const respostas = await Promise.all([
    supabase
      .from("linha_branca_triagens")
      .select("*")
      .eq("os_id", osId)
      .eq("tipo_produto", "Refrigeração")
      .order("created_at", { ascending: true }),
    supabase
      .from("ordens_servico_execucao")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_condenacoes")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_pecas_requisicoes")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
    supabase
      .from("linha_branca_necessidades_compra")
      .select("*")
      .eq("os_id", osId)
      .order("created_at", { ascending: true }),
  ]);

  respostas.forEach((resposta) => {
    if (resposta.error) throw resposta.error;
  });

  return {
    triagens: respostas[0].data || [],
    reparos: respostas[1].data || [],
    condenacoes: respostas[2].data || [],
    requisicoes: respostas[3].data || [],
    compras: respostas[4].data || [],
  };
}

export async function consultarPecaPorPn(pn) {
  const codigo = String(pn || "").trim();
  if (!codigo) return null;

  const { data, error } = await supabase
    .from("linha_branca_pecas_estoque")
    .select("*")
    .ilike("pn", codigo)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function gerenteLinhaBranca() {
  const { data, error } = await supabase
    .from("linha_branca_responsaveis")
    .select("user_id")
    .eq("papel", "gerente_linha_branca")
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.user_id || null;
}

export async function isGerenteLinhaBranca(userId) {
  if (!userId) return false;
  const { data, error } = await supabase
    .from("linha_branca_responsaveis")
    .select("id")
    .eq("papel", "gerente_linha_branca")
    .eq("user_id", userId)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

export async function registrarDemandaPeca({ os, pn, quantidade = 1, usuario }) {
  if (!os?.id) throw new Error("Selecione uma OS antes de adicionar a peça.");
  const codigo = String(pn || "").trim().toUpperCase();
  if (!codigo) throw new Error("Informe o PN da peça.");

  const peca = await consultarPecaPorPn(codigo);

  if (peca && Number(peca.saldo || 0) >= Number(quantidade)) {
    const { data: existente, error: existenteError } = await supabase
      .from("linha_branca_pecas_requisicoes")
      .select("*")
      .eq("os_id", os.id)
      .ilike("pn", codigo)
      .in("status", ["solicitada", "separada"])
      .limit(1)
      .maybeSingle();

    if (existenteError) throw existenteError;
    if (existente) return { tipo: "estoque", peca, demanda: existente };

    const { data, error } = await supabase
      .from("linha_branca_pecas_requisicoes")
      .insert({
        os_id: os.id,
        estoque_id: peca.id,
        pn: codigo,
        quantidade,
        status: "solicitada",
        solicitado_por: usuario?.id || null,
        solicitado_por_nome: usuario?.nome || null,
        observacoes: "Requisição gerada automaticamente pelo reparo de Refrigeração.",
      })
      .select("*")
      .single();

    if (error) throw error;
    return { tipo: "estoque", peca, demanda: data };
  }

  const { data: existenteCompra, error: compraExistenteError } = await supabase
    .from("linha_branca_necessidades_compra")
    .select("*")
    .eq("os_id", os.id)
    .ilike("pn", codigo)
    .in("status", ["necessidade_aberta", "em_cotacao"])
    .limit(1)
    .maybeSingle();

  if (compraExistenteError) throw compraExistenteError;
  if (existenteCompra) {
    return { tipo: "compra", peca, demanda: existenteCompra };
  }

  const responsavelId = await gerenteLinhaBranca();
  const { data, error } = await supabase
    .from("linha_branca_necessidades_compra")
    .insert({
      os_id: os.id,
      pn: codigo,
      descricao: peca?.descricao || null,
      quantidade,
      status: "necessidade_aberta",
      solicitado_por: usuario?.id || null,
      solicitado_por_nome: usuario?.nome || null,
      responsavel_id: responsavelId,
      observacoes: peca
        ? "PN cadastrado, porém sem saldo disponível."
        : "PN não encontrado no estoque de peças.",
    })
    .select("*")
    .single();

  if (error) throw error;
  return { tipo: "compra", peca, demanda: data };
}

export async function uploadFotosCondenacao({ osId, files, userId }) {
  const lista = Array.from(files || []);
  if (!lista.length) return [];

  const caminhos = [];
  for (let index = 0; index < lista.length; index += 1) {
    const file = lista[index];
    const safeName = String(file.name || "foto")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${osId}/${userId || "usuario"}/${Date.now()}-${index}-${safeName}`;

    const { error } = await supabase.storage
      .from("linha-branca-condenacoes")
      .upload(path, file, { upsert: false, contentType: file.type || undefined });

    if (error) throw error;
    caminhos.push(path);
  }

  return caminhos;
}

export async function solicitarCondenacao({
  os,
  motivo,
  temReposicaoTroca,
  fotos,
  usuario,
}) {
  if (!os?.id) throw new Error("Selecione a OS.");
  if (!String(motivo || "").trim()) throw new Error("Informe a justificativa da condenação.");
  if (temReposicaoTroca === null || temReposicaoTroca === undefined) {
    throw new Error("Informe se haverá reposição ou troca.");
  }

  const { data, error } = await supabase
    .from("linha_branca_condenacoes")
    .insert({
      os_id: os.id,
      categoria: os.categoria || REFRIGERACAO_CATEGORIA,
      motivo: motivo.trim(),
      area_retorno: os.area_destino || os.etapa_atual || "Reparo Mecânico",
      tem_reposicao_troca: Boolean(temReposicaoTroca),
      fotos: fotos || [],
      solicitado_por: usuario?.id || null,
      solicitado_por_nome: usuario?.nome || null,
      status: "aguardando_aprovacao",
    })
    .select("*")
    .single();

  if (error) throw error;
  return data;
}

async function assinarFotos(paths) {
  const lista = Array.isArray(paths) ? paths : [];
  if (!lista.length) return [];

  const resultados = await Promise.all(
    lista.map(async (path) => {
      const { data, error } = await supabase.storage
        .from("linha-branca-condenacoes")
        .createSignedUrl(path, 60 * 60);
      return {
        path,
        url: error ? null : data?.signedUrl || null,
      };
    })
  );

  return resultados;
}

export async function fetchCondenacoesPendentes() {
  const { data, error } = await supabase
    .from("linha_branca_condenacoes")
    .select("*, ordens_servico(*)")
    .eq("status", "aguardando_aprovacao")
    .order("solicitado_em", { ascending: true });

  if (error) throw error;

  return Promise.all(
    (data || []).map(async (item) => ({
      ...item,
      fotos_assinadas: await assinarFotos(item.fotos),
    }))
  );
}

export async function decidirCondenacao({
  condenacao,
  aprovar,
  destino,
  observacoes,
  usuario,
}) {
  if (!condenacao?.id) throw new Error("Solicitação de condenação inválida.");
  if (aprovar && !DESTINOS_CONDENACAO.includes(destino)) {
    throw new Error("Selecione o destino aprovado pelo gerente.");
  }

  const gerente = await isGerenteLinhaBranca(usuario?.id);
  if (!gerente) throw new Error("A decisão de condenação é restrita ao gerente da Linha Branca.");

  const { data, error } = await supabase
    .from("linha_branca_condenacoes")
    .update({
      status: aprovar ? "aprovada" : "rejeitada",
      destino: aprovar ? destino : null,
      decidido_por: usuario?.id || null,
      decidido_por_nome: usuario?.nome || null,
      decidido_em: new Date().toISOString(),
      decisao_observacoes: observacoes?.trim() || null,
    })
    .eq("id", condenacao.id)
    .eq("status", "aguardando_aprovacao")
    .select("*")
    .single();

  if (error) throw error;

  if (aprovar) {
    const atualizacao =
      destino === "Scrap"
        ? { status_atual: "Scrap", etapa_atual: "Scrap", area_destino: "Scrap" }
        : destino === "Venda no estado"
          ? {
              status_atual: "Venda no estado",
              etapa_atual: "Venda no estado",
              area_destino: "Venda no estado",
            }
          : {
              status_atual: "Condenado",
              etapa_atual: "Condenado",
              area_destino: "Desmembramento",
            };

    const { error: osError } = await supabase
      .from("ordens_servico")
      .update({
        ...atualizacao,
        tecnico_responsavel: usuario?.nome || null,
      })
      .eq("id", condenacao.os_id);

    if (osError) throw osError;
  }

  return data;
}

export async function fetchNecessidadesCompraPendentes() {
  const { data, error } = await supabase
    .from("linha_branca_necessidades_compra")
    .select("*, ordens_servico(numero_os,marca,modelo,categoria)")
    .in("status", ["necessidade_aberta", "em_cotacao"])
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function atualizarNecessidadeCompraStatus(id, status, userId) {
  if (!["necessidade_aberta", "em_cotacao", "comprada", "recebida", "cancelada"].includes(status)) {
    throw new Error("Status de compra inválido.");
  }
  const gerente = await isGerenteLinhaBranca(userId);
  if (!gerente) throw new Error("A gestão das compras é restrita ao gerente da Linha Branca.");

  const { data, error } = await supabase
    .from("linha_branca_necessidades_compra")
    .update({ status })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return data;
}
