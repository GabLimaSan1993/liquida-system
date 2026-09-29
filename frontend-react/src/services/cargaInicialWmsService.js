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

function erroTransitorioCargaInicial(error) {
  const mensagem = String(error?.message || error || "").toLowerCase();

  return (
    mensagem.includes("timeout") ||
    mensagem.includes("timed out") ||
    mensagem.includes("failed to fetch") ||
    mensagem.includes("network") ||
    mensagem.includes("gateway") ||
    mensagem.includes("connection") ||
    mensagem.includes("canceling statement")
  );
}

async function consultarResultadoCargaInicial(sessaoId, imei, userId) {
  const { data, error } = await supabase.rpc("wms_carga_inicial_resultado", {
    p_sessao: sessaoId,
    p_imei: String(imei || "").trim(),
    p_usuario: userId,
  });

  if (error) return null;
  return data?.ok && data?.encontrado ? data : null;
}

export async function biparImeiCargaInicial(sessaoId, coluna, linha, imei, userId) {
  const imeiNormalizado = String(imei || "").trim();

  const payload = {
    p_sessao: sessaoId,
    p_coluna: coluna,
    p_linha: Number(linha),
    p_imei: imeiNormalizado,
    p_usuario: userId,
  };

  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    const { data, error } = await supabase.rpc("wms_carga_inicial_bipar", payload);

    if (!error) {
      if (!data?.ok) {
        throw new Error(data?.erro || "Não foi possível registrar o IMEI.");
      }

      return data;
    }

    /*
     * Em caso de timeout/rede, a resposta HTTP pode se perder mesmo depois
     * de a transação ter sido concluída no banco. Antes de repetir a bipagem,
     * confirma se o evento já existe para evitar dupla alocação.
     */
    const confirmado = await consultarResultadoCargaInicial(
      sessaoId,
      imeiNormalizado,
      userId
    );

    if (confirmado) {
      return confirmado;
    }

    if (tentativa === 0 && erroTransitorioCargaInicial(error)) {
      await new Promise((resolve) => window.setTimeout(resolve, 450));
      continue;
    }

    throw new Error(
      error.message ||
        "A bipagem não foi confirmada. O IMEI foi mantido para nova tentativa."
    );
  }

  throw new Error("A bipagem não foi confirmada. Tente novamente.");
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