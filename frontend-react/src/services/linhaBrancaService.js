import { supabase } from "../lib/supabase";

export const TIPOS_PRODUTO_LINHA_BRANCA = [
  "Refrigeração",
  "Lavadoras",
  "Ar-condicionado",
  "Portáteis",
];

export const REPAROS_MECANICOS = [
  "BAIXA EFICIÊNCIA",
  "SEM GÁS",
  "COMPRESSOR QUEIMADO",
  "COMPRESSOR NÃO LIGA",
  "VAZAMENTO APARENTE NAS SOLDAS",
  "VAZAMENTO NA EVAPORADORA",
  "SISTEMA DE GÁS ABERTO",
  "SEM CONDENSAÇÃO",
  "COMPRESSOR C/ TEMPERATURA ALTA",
  "ENTUPIMENTO NO SISTEMA DE GÁS",
];

export const REPAROS_ELETRICOS = [
  "PRODUTO NÃO LIGA",
  "PLACA PRINCIPAL EM CURTO",
  "INTERFACE C/ DEFEITO",
  "RESISTENCIA DE DEGELO ABERTO",
  "PROTETOR TÉRMICO DEGELO - ABERTO",
  "MOTOVENTILADOR QUEIMADO",
  "MOTOVENTILADOR PRÉ COND. QUEIMADO",
  "SENSOR DE DEGELO",
  "SENSOR DE TEMPERATURA",
  "DUMPER",
  "ILUMINAÇÃO DO REFRIGERADOR C/DEFEITO",
  "ILUMINAÇÃO DO FREEZER C/ DEFEITO",
  "RELÉ DE PARTIDA",
  "PROTETOR TÉRMICO - COMPRESSOR",
  "CHICOTE ELÉTRICO ROMPIDO",
  "CHICOTE ELÉTRICO EM CURTO",
  "ICE MAKER NÃO FABRICA GELO",
  "VALVULA DE ENTRADA QUEIMADA",
  "RESISTÊNCIA DE DEGELO ICE - QUEIMADO",
  "NÃO SAI ÁGUA NO DISPENSER",
  "TABLET C/ DEFEITO",
  "TENSÃO ERRADA",
];

export const REPAROS_ESTETICOS = [
  "BASE DO COMPRESSOR AMASSADO",
  "BASE DO COMPRESSOR OXIDADO",
  "RODIZIO FALTANTE",
  "RODIZIO QUEBRADO",
  "PÉ NIVELADOR FALTANTE",
  "PÉ NIVELADOR QUEBRADO",
  "SUPORTE DO PÉ NIVELADOR FALTANTE",
  "SUPORTE DO PÉ NIVELADOR QUEBRADO",
  "GABINETE AMASSADO (ESTRUTURAL)",
  "PORTA REFRIGERADOR AMASSADO (ESTRUTURAL)",
  "PORTA FREEZER AMASSADO (ESTRUTURAL)",
  "GABINETE - ROSCA DE FIXAÇÃO DO PÉ NIVELADOR ESPANADO",
  "DISPLAY QUEBRADO",
  "VIDRO DA PORTA FREEZER QUEBRADO",
  "VIDRO DA PORTA DO REFRIGERADOR QUEBRADO",
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

  // Monta lista de todas as áreas com reparo
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