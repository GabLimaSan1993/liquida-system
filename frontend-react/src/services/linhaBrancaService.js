import { supabase } from "../lib/supabase";

export const TIPOS_PRODUTO_LINHA_BRANCA = [
  "Refrigeração",
  "Lavadoras",
  "Ar-condicionado",
  "Portáteis",
];

// Listas para Refrigeração (triagem separada)
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

// Mantém vazio para refrigeração — lista unificada acima
export const REPAROS_ELETRICOS = [];
export const REPAROS_ESTETICOS = [];

// Lista para Lavadoras (tela unificada)
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

// Lista para Climatização (tela unificada)
export const REPAROS_CLIMATIZACAO = [
  "AFERIÇÃO DE TEMPERATURA",
  "TESTES ELÉTRICO",
  "AFERIÇÃO DE CORRENTE AC",
  "AFERIÇÃO DE PRESSÃO",
  "ESTÉTICA SEM AVARIA",
  "ESTÉTICA AVARIA LEVE",
  "TESTE PARCIAL",
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