import { supabase } from "../lib/supabase";

export async function iniciarCargaInicial(rua, bloco, andar, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_iniciar", {
    p_rua: Number(rua),
    p_bloco: Number(bloco),
    p_andar: Number(andar),
    p_usuario: userId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível iniciar a carga.");
  return data.sessao;
}

export async function carregarContextoCargaInicial(sessao) {
  const [mapaRes, eventosRes, sessaoRes] = await Promise.all([
    supabase.rpc("wms_mapa_andar", {
      p_rua: Number(sessao.rua),
      p_bloco: Number(sessao.bloco),
      p_andar: Number(sessao.andar),
    }),
    supabase
      .from("wms_carga_inicial_eventos")
      .select("id, endereco_id, imei, resultado, regra, caixa_codigo, status_gaia, possui_subinv, data_subinv, proximo_status, criado_em, snapshot, wms_caixas_analise(nome, motivo)")
      .eq("sessao_id", sessao.id)
      .is("estornado_em", null)
      .order("criado_em", { ascending: false }),
    supabase
      .from("wms_carga_inicial_sessoes")
      .select("*")
      .eq("id", sessao.id)
      .single(),
  ]);

  if (mapaRes.error) throw new Error(mapaRes.error.message);
  if (eventosRes.error) throw new Error(eventosRes.error.message);
  if (sessaoRes.error) throw new Error(sessaoRes.error.message);

  const eventos = eventosRes.data || [];
  return {
    mapa: mapaRes.data || [],
    eventos,
    sessao: sessaoRes.data,
    segregacaoPendente: eventos.find((e) => e.resultado === "aguardando_caixa") || null,
  };
}

export async function biparImeiCargaInicial(sessaoId, coluna, linha, imei, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_bipar", {
    p_sessao: sessaoId,
    p_coluna: coluna,
    p_linha: Number(linha),
    p_imei: String(imei || "").trim(),
    p_usuario: userId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível registrar o IMEI.");
  return data;
}

export async function confirmarCaixaCargaInicial(eventoId, codigo, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_confirmar_caixa", {
    p_evento: eventoId,
    p_codigo: String(codigo || "").trim(),
    p_usuario: userId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível confirmar a caixa.");
  return data;
}

export async function pularPosicaoCargaInicial(sessaoId, coluna, linha, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_pular", {
    p_sessao: sessaoId,
    p_coluna: coluna,
    p_linha: Number(linha),
    p_usuario: userId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível pular a posição.");
  return data;
}

export async function desfazerCargaInicial(sessaoId, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_desfazer", {
    p_sessao: sessaoId,
    p_usuario: userId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível desfazer.");
  return data;
}

export async function finalizarCargaInicial(sessaoId, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_finalizar", {
    p_sessao: sessaoId,
    p_usuario: userId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.erro || "Não foi possível finalizar a carga.");
  return data.sessao;
}