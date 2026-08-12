import { supabase } from "../lib/supabase";
import {
  buscarSugestaoFifo,
  alocarPedido,
  marcarSemProduto,
} from "./pedidosB2CService.js";

const TAMANHO_LISTA = 20;
const BLOCO_IDS = 200;

function dentroDaHoraCorte(dataPagamento, horaCorte) {
  if (!horaCorte) return true;
  if (!dataPagamento) return false;

  const horario = String(dataPagamento).match(/(\d{2}):(\d{2})(?::\d{2})?$/);
  if (!horario) return false;

  const [horaLimite, minutoLimite] = horaCorte.split(":").map(Number);
  const hora = Number(horario[1]);
  const minuto = Number(horario[2]);

  return hora < horaLimite ||
    (hora === horaLimite && minuto <= minutoLimite);
}

function pagamentoParaOrdenacao(valor) {
  const texto = String(valor || "").trim();
  const match = texto.match(
    /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/
  );

  if (!match) return Number.MAX_SAFE_INTEGER;

  return Date.UTC(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4] || 0),
    Number(match[5] || 0),
    Number(match[6] || 0)
  );
}

async function buscarPedidosDoLote(idsAnymarket, horaCorte) {
  const ids = [...new Set((idsAnymarket || []).filter(v => v != null))];
  if (!ids.length) return [];

  const pedidos = [];

  for (let i = 0; i < ids.length; i += BLOCO_IDS) {
    const { data, error } = await supabase
      .from("pedidos_b2c")
      .select("*")
      .in("id_anymarket", ids.slice(i, i + BLOCO_IDS))
      .eq("status", "aguardando_alocacao")
      .eq("status_anymarket", "Pago");

    if (error) {
      throw new Error(`Falha ao buscar pedidos para alocação: ${error.message}`);
    }

    pedidos.push(...(data || []));
  }

  return pedidos
    .filter(p => dentroDaHoraCorte(p.data_de_pagamento, horaCorte))
    .sort((a, b) => {
      const porPagamento =
        pagamentoParaOrdenacao(a.data_de_pagamento) -
        pagamentoParaOrdenacao(b.data_de_pagamento);

      if (porPagamento !== 0) return porPagamento;
      return String(a.id).localeCompare(String(b.id));
    });
}

async function buscarAlocadosSemGrupo(idsAnymarket) {
  const ids = [...new Set((idsAnymarket || []).filter(v => v != null))];
  const encontrados = [];

  for (let i = 0; i < ids.length; i += BLOCO_IDS) {
    const { data, error } = await supabase
      .from("pedidos_b2c")
      .select("id, id_anymarket, marketplace, status, grupo_id, alocado_em")
      .in("id_anymarket", ids.slice(i, i + BLOCO_IDS));

    if (error) {
      throw new Error(`Falha ao montar as listas automáticas: ${error.message}`);
    }

    encontrados.push(...(data || []));
  }

  return encontrados;
}

function separarPedidosCompletos(itens) {
  const porPedido = new Map();

  for (const item of itens) {
    const chave = String(item.id_anymarket);
    if (!porPedido.has(chave)) porPedido.set(chave, []);
    porPedido.get(chave).push(item);
  }

  const completos = [];

  for (const [idAnymarket, irmaos] of porPedido.entries()) {
    const completo = irmaos.length > 0 &&
      irmaos.every(item => item.status === "alocado" && !item.grupo_id);

    if (!completo) continue;

    completos.push({
      idAnymarket,
      marketplace: irmaos[0].marketplace || "—",
      itemIds: irmaos.map(item => item.id),
      alocadoEm: irmaos
        .map(item => item.alocado_em || "9999-12-31")
        .sort()[0],
    });
  }

  return completos.sort((a, b) =>
    String(a.alocadoEm).localeCompare(String(b.alocadoEm))
  );
}

function montarListas(pedidosCompletos) {
  const porMarketplace = new Map();

  for (const pedido of pedidosCompletos) {
    if (!porMarketplace.has(pedido.marketplace)) {
      porMarketplace.set(pedido.marketplace, []);
    }
    porMarketplace.get(pedido.marketplace).push(pedido);
  }

  const listas = [];

  for (const [marketplace, pedidos] of porMarketplace.entries()) {
    let atual = [];
    let quantidade = 0;

    for (const pedido of pedidos) {
      if (
        atual.length > 0 &&
        quantidade + pedido.itemIds.length > TAMANHO_LISTA
      ) {
        listas.push({ marketplace, pedidos: atual });
        atual = [];
        quantidade = 0;
      }

      atual.push(pedido);
      quantidade += pedido.itemIds.length;

      if (quantidade >= TAMANHO_LISTA) {
        listas.push({ marketplace, pedidos: atual });
        atual = [];
        quantidade = 0;
      }
    }

    if (atual.length) {
      listas.push({ marketplace, pedidos: atual });
    }
  }

  return listas;
}

async function criarGrupoComNumeroSeguro(itemIds, userId, horaCorte) {
  for (let tentativa = 1; tentativa <= 5; tentativa++) {
    const { data: ultimo, error: erroUltimo } = await supabase
      .from("pedidos_b2c_grupos")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (erroUltimo) throw new Error(erroUltimo.message);

    const numero = Number(ultimo?.numero || 0) + 1;
    const { data: grupo, error: erroGrupo } = await supabase
      .from("pedidos_b2c_grupos")
      .insert({
        numero,
        status: "aberto",
        status_faturamento: "pendente",
        total_pedidos: itemIds.length,
        hora_corte: horaCorte || null,
        criado_por: userId,
      })
      .select()
      .single();

    if (erroGrupo?.code === "23505") continue;
    if (erroGrupo) throw new Error(erroGrupo.message);

    const { data: vinculados, error: erroVinculo } = await supabase
      .from("pedidos_b2c")
      .update({
        grupo_id: grupo.id,
        status: "em_picking",
        atualizado_em: new Date().toISOString(),
      })
      .in("id", itemIds)
      .eq("status", "alocado")
      .is("grupo_id", null)
      .select("id");

    if (erroVinculo) {
      throw new Error(
        `A lista #${numero} foi criada, mas houve erro ao vincular os pedidos: ${erroVinculo.message}`
      );
    }

    if ((vinculados || []).length !== itemIds.length) {
      throw new Error(
        `A lista #${numero} não recebeu todos os itens esperados. Atualize a página antes de tentar novamente.`
      );
    }

    return grupo;
  }

  throw new Error("Não foi possível gerar um número único para a lista automática.");
}

async function criarListasAutomaticas(idsAnymarket, userId, horaCorte) {
  const itens = await buscarAlocadosSemGrupo(idsAnymarket);
  const completos = separarPedidosCompletos(itens);
  const listas = montarListas(completos);
  const grupos = [];

  for (const lista of listas) {
    const itemIds = lista.pedidos.flatMap(pedido => pedido.itemIds);
    const grupo = await criarGrupoComNumeroSeguro(
      itemIds,
      userId,
      horaCorte
    );

    grupos.push({
      id: grupo.id,
      numero: grupo.numero,
      marketplace: lista.marketplace,
      total: itemIds.length,
    });
  }

  return grupos;
}

export async function alocarPedidosAutomaticamente({
  idsAnymarket,
  userId,
  horaCorte,
  onProgress,
}) {
  const pedidos = await buscarPedidosDoLote(idsAnymarket, horaCorte);
  const resultado = {
    total: pedidos.length,
    alocados: 0,
    semProduto: 0,
    falhas: 0,
    gruposCriados: 0,
    grupos: [],
    pendencias: [],
  };

  for (let indice = 0; indice < pedidos.length; indice++) {
    const pedido = pedidos[indice];
    let finalizado = false;

    onProgress?.({
      atual: indice + 1,
      total: pedidos.length,
      pedido: pedido.id_anymarket,
    });

    for (let tentativa = 1; tentativa <= 5 && !finalizado; tentativa++) {
      try {
        const candidatos = await buscarSugestaoFifo(
          pedido.sku_definido || pedido.sku_produto,
          pedido.grade_definida || pedido.grade_produto
        );

        const escolhido = candidatos[0];

        if (!escolhido) {
          await marcarSemProduto(pedido.id, userId);
          resultado.semProduto++;
          resultado.pendencias.push({
            pedido: pedido.id_anymarket,
            sku: pedido.sku_definido || pedido.sku_produto,
            motivo: "Nenhum aparelho elegível encontrado no FIFO",
          });
          finalizado = true;
          break;
        }

        const resposta = await alocarPedido(
          pedido.id,
          escolhido.imei,
          escolhido.sku,
          escolhido.grade,
          userId,
          {
            sugestao: escolhido,
            candidatos,
            origem: "upload_anymarket_automatico",
            pedido,
          }
        );

        resultado.alocados++;
        if (resposta?.grupoFormado) {
          resultado.gruposCriados +=
            resposta.grupoFormado.gruposCriados || 1;
        }
        finalizado = true;
      } catch (error) {
        const duplicidade =
          error?.code === "23505" ||
          /já está associado|acabou de ser alocado|duplicate key/i.test(
            String(error?.message || "")
          );

        if (duplicidade && tentativa < 5) continue;

        resultado.falhas++;
        resultado.pendencias.push({
          pedido: pedido.id_anymarket,
          sku: pedido.sku_definido || pedido.sku_produto,
          motivo: String(error?.message || error),
        });
        finalizado = true;
      }
    }
  }

  const gruposFinais = await criarListasAutomaticas(
    idsAnymarket,
    userId,
    horaCorte
  );

  resultado.grupos.push(...gruposFinais);
  resultado.gruposCriados += gruposFinais.length;

  return resultado;
}