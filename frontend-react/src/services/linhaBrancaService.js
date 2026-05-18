import { supabase } from "../lib/supabase";

export const TIPOS_PRODUTO_LINHA_BRANCA = [
  "Refrigeração",
  "Lavadoras",
  "Ar-condicionado",
  "Portáteis",
];

// =====================
// REFRIGERAÇÃO — Triagem
// =====================
export const REPAROS_MECANICOS = [
  "AFERIÇÃO DE TEMPERATURA FREEZER",
  "AFERIÇÃO DE TEMP. REFRIGERADOR",
  "AFERIÇÃO DE TEMP. MOTOR",
  "PREVENTIVA MOTOVENTILADOR",
  "PREVENTIVA RESISTÊNCIA",
  "DISPLAY",
  "DISPENSER",
  "ICE MAKER",
  "ILUMINAÇÃO INTERNA",
  "CABO AC",
  "VEDAÇÃO",
  "PÉ NIVELADOR",
  "GABINETE",
];

export const REPAROS_ELETRICOS = [];
export const REPAROS_ESTETICOS = [];

// =====================
// REFRIGERAÇÃO — Reparos
// =====================
export const REPAROS_MECANICOS_REFRIG = [
  "COMPRESSOR",
  "VAZAMENTO - LINHA DE ALTA",
  "VAZAMENTO - LINHA DE BAIXA",
  "ENTUPIMENTO - LINHA DE ALTA",
  "ENTUPIMENTO - LINHA DE BAIXA",
  "CONTAMINAÇÃO LEVE",
  "CONTAMINAÇÃO MÉDIA",
  "CONTAMINAÇÃO GRAVE",
  "FILTRO SECANTE",
  "CAPILAR",
  "VÁLVULA STEP",
  "EVAPORADORA",
  "PRÉ CONDENSADORA",
];

export const REPAROS_ELETRICOS_REFRIG = [
  "PLACA PRINCIPAL",
  "PLACA INVERTER",
  "DISPLAY / INTERFACE",
  "FILTRO DE LINHA",
  "RELÉ DE PARTIDA",
  "PROTETOR TÉRMICO - COMPRESSOR",
  "RESISTÊNCIA DE DEGELO",
  "SENSOR",
  "TERMO FUSÍVEL",
  "MOTOVENTILADOR",
  "DUMPER",
  "RESISTÊNCIA DO DRENO",
  "TERMOSTATO",
  "LÂMPADAS / LED",
  "CABO AC",
  "VÁLVULA DE ENTRADA",
  "ROTOR ICE MAKER",
  "MÁQUINA DE DEGELO",
  "TABLET",
  "CHAVE FIM DE CURSO",
  "REPARO DE PLACA",
];

export const REPAROS_ESTETICOS_REFRIG = [
  "GABINETE",
  "PORTA REFRIGERADOR",
  "PORTA DO FREEZER",
  "BASE DO COMPRESSOR",
  "SUPORTE DA PORTA FREEZER",
  "SUPORTE DA PORTA REFRIGERADOR",
  "PUXADOR",
  "PÉ NIVELADOR",
  "RODIZIO",
  "GAXETAS",
];

// =====================
// LAVADORAS — Triagem
// =====================
export const REPAROS_LAVADORAS = [
  "TESTE CICLO DE LAVAGEM",
  "TESTE CICLO DE SECAGEM",
  "VALIDAÇÃO DE VAZAMENTO",
  "VALIDAÇÃO DA SUSPENSÃO",
  "DUTO DE SECAGEM",
  "ESTÉTICA SEM AVARIA",
  "ESTÉTICA AVARIA LEVE",
  "VALIDAÇÃO PARCIAL",
];

// =====================
// LAVADORAS — Reparos
// =====================
export const REPAROS_MECANICOS_LAVADORAS = [
  "CESTO",
  "TAMBOR",
  "EIXO TRIPÉ",
  "AMORTECEDOR",
  "VARETA DE SUSPENSÃO",
  "ROLAMENTO",
  "RETENTOR",
  "PRESSOSTATO",
  "CORREIA",
  "MANGUEIRA DE DRENAGEM",
  "MANGUEIRA CACHIMBO",
  "MANGUEIRA DO DISPENSER",
  "MANGUEIRA FILTRO DE DRENAGEM",
  "GAXETA",
  "CONJUNTO DO CÂMBIO",
];

export const REPAROS_ELETRICOS_LAVADORAS = [
  "MOTOR",
  "MOTOR INVERTER",
  "PLACA PRINCIPAL",
  "PLACA INVERTER",
  "PLACA DE POTÊNCIA",
  "FILTRO DE LINHA",
  "CHICOTE ELÉTRICO",
  "TERMOSTATO",
  "RESISTÊNCIA DE SECAGEM",
  "MOTO-VENTILADOR",
  "PLACA DISPLAY",
  "CABO AC",
  "VÁLVULA DE ENTRADA",
  "BOMBA DE DRENAGEM",
  "COMPRESSOR",
  "SENSOR DE TEMPERATURA",
  "PLACA SELETORA",
  "REPARO DE PLACA",
];

export const REPAROS_ESTETICOS_LAVADORAS = [
  "GABINETE",
  "TAMPA FIXA",
  "TAMPA MÓVEL",
  "PÉ NIVELADOR",
  "PAINEL DISPLAY",
  "DISPENSER",
  "PORTA FRONT LOAD",
  "PAINEL FRONTAL",
  "TAMPA TRASEIRA",
  "BASE DO GABINETE",
];

// =====================
// CLIMATIZAÇÃO — Triagem
// =====================
export const REPAROS_CLIMATIZACAO = [
  "AFERIÇÃO DE TEMPERATURA",
  "TESTES ELÉTRICO",
  "AFERIÇÃO DE CORRENTE AC",
  "AFERIÇÃO DE PRESSÃO",
  "ESTÉTICA SEM AVARIA",
  "ESTÉTICA AVARIA LEVE",
  "TESTE PARCIAL",
];

// =====================
// CLIMATIZAÇÃO — Reparos
// =====================
export const REPAROS_MECANICOS_CLIMATIZACAO = [
  "VAZAMENTO DE GÁS",
  "CONEXÃO EVAPORADORA",
  "VÁLVULA DE SERVIÇO",
  "TURBINA",
  "COMPRESSOR",
  "SERPENTINA",
  "CAPILAR",
  "VÁLVULA SCHRADER",
  "TROCA DO FLUIDO DE GÁS REFRIGERANTE",
  "LIMPEZA DO SISTEMA",
  "VÁLVULA DE PRESSÃO",
  "VÁLVULA DE EXPANSÃO",
  "VÁLVULA SOLENOIDE",
  "CHASSI",
  "COXIM DO COMPRESSOR",
];

export const REPAROS_ELETRICOS_CLIMATIZACAO = [
  "PLACA PRINCIPAL",
  "PLACA DISPLAY",
  "PLACA RECEPTORA",
  "PLACA WI-FI",
  "PLACA SELETORA",
  "PLACA INVERTER",
  "PLACA DE POTÊNCIA",
  "FILTRO DE LINHA",
  "TRANSFORMADOR",
  "MOTO-VENTILADOR",
  "SENSOR DE TEMPERATURA",
  "CHICOTE ELÉTRICO",
  "MOTOR DE PASSO",
  "BOIA DO DRENO",
  "BOMBA DE DRENAGEM",
  "BORNEIRA",
  "REPARO DE PLACA",
];

export const REPAROS_ESTETICOS_CLIMATIZACAO = [
  "CARENAGEM",
  "ALETA",
  "FILTRO DE AR",
  "COLETOR DE DRENO",
  "ISOLAMENTO TÉRMICO",
  "MANGUEIRA DE DRENAGEM",
  "SUPORTE EVAP.",
  "SOLDA PLÁSTICA",
  "GRELHA DO VENTILADOR",
  "TAMPA DA BORNEIRA",
  "PAINEL CASSETE",
  "ALÇA",
  "FUNILARIA",
];

export async function fetchOsAguardandoTriagemLinhaBranca() {
  const { data, error } = await supabase
    .from("ordens_servico")
    .select("*")
    .eq("linha_produto", "Linha Branca")
    .in("status_atual", ["Recebido", "Aguardando triagem", "Em triagem"])
    .order("dt_entrada", { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function salvarTriagemLinhaBranca(os, triagem) {
  const temMecanico = triagem.reparos_mecanicos.length > 0;
  const temEletrico = triagem.reparos_eletricos.length > 0;
  const temEstetico = triagem.reparos_esteticos.length > 0;

  const areasReparo = [];
  if (temMecanico) areasReparo.push("Reparo Mecânico");
  if (temEletrico) areasReparo.push("Reparo Elétrico");
  if (temEstetico) areasReparo.push("Reparo Estético");

  let statusAtual = "Aprovado";
  let etapaAtual = "Aprovado";
  let areaDestino = null;

  if (triagem.precisa_reparo && areasReparo.length > 0) {
    statusAtual = "Triado";
    etapaAtual = areasReparo[0];
    areaDestino = areasReparo[0];
  }

  const { error: triagemError } = await supabase
    .from("linha_branca_triagens")
    .insert({
      os_id: os.id,
      tipo_produto: triagem.tipo_produto,
      precisa_reparo: triagem.precisa_reparo,
      reparos_mecanicos: triagem.reparos_mecanicos,
      reparos_eletricos: triagem.reparos_eletricos,
      reparos_esteticos: triagem.reparos_esteticos,
      observacoes_triagem: triagem.observacoes_triagem,
      triado_por: triagem.triado_por,
    });

  if (triagemError) throw triagemError;

  const { error: osError } = await supabase
    .from("ordens_servico")
    .update({
      status_atual: statusAtual,
      etapa_atual: etapaAtual,
      area_destino: areaDestino,
      areas_reparo: areasReparo,
      areas_concluidas: [],
      tecnico_triagem: triagem.triado_por || null,
    })
    .eq("id", os.id);

  if (osError) throw osError;
  return true;
}