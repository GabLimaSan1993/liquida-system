import { supabase } from '../lib/supabase.js';

// Enriquecimento somente de leitura: o código operacional continua preservado
// para os vínculos Oracle, WMS, laudo e movimentações.
const normalizar = valor => String(valor ?? '').trim().toUpperCase();
const LIMITE_LOTE = 400;

export async function consultarNomenclaturaVouchers(vouchers = []) {
  const chaves = [...new Set((vouchers || []).map(normalizar).filter(Boolean))];
  if (!chaves.length) return {};
  const resposta = {};
  for (let i = 0; i < chaves.length; i += LIMITE_LOTE) {
    const { data, error } = await supabase.rpc('assurant_voucher_nomenclatura_lote', {
      p_vouchers: chaves.slice(i, i + LIMITE_LOTE),
    });
    if (error) throw new Error(error.message);
    Object.assign(resposta, data || {});
  }
  return resposta;
}

// A busca aceita rastreio de entrada (com ou sem BR) e e-ticket de devolução.
export function codigoPostagemOnline(valor) {
  const chave = normalizar(valor);
  return /^[A-Z]{2}[0-9]{9}(?:BR)?$/.test(chave) || /^[0-9]{12,14}$/.test(chave);
}

// A identificação é somente leitura; a pesquisa operacional continua usando
// o voucher original já registrado nas tabelas de WMS e movimentações.
export async function resolverIdentificadorOnline(valor) {
  const termo = String(valor ?? '').trim();
  const chave = normalizar(termo);
  if (!(/^(?:SAMV|GRV)[0-9]+$/.test(chave)
    || codigoPostagemOnline(chave)
    || /^[0-9]{5,10}$/.test(chave))) {
    return { buscaOperacional: termo, registro: null };
  }
  const referencias = await consultarNomenclaturaVouchers([chave]);
  const registro = referencias[chave] || null;
  return { buscaOperacional: registro?.voucher_original || termo, registro };
}

export function aplicarNomenclatura(item, referencias = {}) {
  if (!item) return item;
  const original = String(item.voucher ?? '').trim();
  const encontrado = referencias[normalizar(original)];
  if (!encontrado) return item;
  const identidade = value => value === undefined || value === null || String(value).trim() === '' ? null : value;
  return {
    ...item,
    voucher_operacional: original,
    voucher: encontrado.voucher || original,
    voucher_exibicao: encontrado.voucher || original,
    // Não inventar dados, nem substituir atributos já confirmados no Warehouse.
    imei: identidade(item.imei) || encontrado.imei || item.imei,
    imei2: identidade(item.imei2) || encontrado.imei2 || item.imei2,
    sku: identidade(item.sku) || encontrado.sku || item.sku,
    marca: identidade(item.marca) || encontrado.marca || item.marca,
    modelo: identidade(item.modelo) || encontrado.modelo || item.modelo,
    capacidade: identidade(item.capacidade) || encontrado.capacidade || item.capacidade,
    cor: identidade(item.cor) || encontrado.cor || item.cor,
    descricao: identidade(item.descricao) || encontrado.descricao || item.descricao,
    objeto_correios: encontrado.codigo_rastreio || null,
    codigo_postagem: encontrado.codigo_postagem || null,
    codigo_rastreio_saida: encontrado.codigo_rastreio_saida || null,
    destinatario_correios: encontrado.destinatario || null,
    etapa_online: encontrado.etapa || null,
    resultado_als: encontrado.resultado_als || null,
    defeitos_als: identidade(item.defeitos_als) || encontrado.defeitos_als || null,
    pedido_origem: identidade(item.pedido_origem) || encontrado.pedido_origem || null,
    observacoes_online: encontrado.observacoes || null,
  };
}

export async function enriquecerNomenclaturaLista(itens = []) {
  if (!itens.length) return itens;
  const numericos = itens.map(item => item?.voucher)
    .filter(value => /^[0-9]+$/.test(normalizar(value)));
  if (!numericos.length) return itens;
  try {
    const refs = await consultarNomenclaturaVouchers(numericos);
    return itens.map(item => aplicarNomenclatura(item, refs));
  } catch (error) {
    console.warn('Nomenclatura Trade-In indisponível; mantendo códigos operacionais originais:', error.message);
    return itens;
  }
}
