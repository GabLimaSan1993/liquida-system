import { supabase } from "../lib/supabase.js";

export const CELULAR_SEGURO_URL = "https://celularseguro.mj.gov.br/";

export async function listarEstacoesDiagnostico() {
  const { data, error } = await supabase
    .from("assurant_diag_stations")
    .select("id,code,name,hostname,platform,arch,bridge_version,status,capabilities,last_seen_at,paired_at,active")
    .eq("active", true)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const agora = Date.now();
  return (data || []).map((item) => {
    const last = item.last_seen_at ? new Date(item.last_seen_at).getTime() : 0;
    const online = Boolean(last && agora - last < 45000);
    return { ...item, online };
  });
}

export async function criarCodigoPareamento(stationName = "TRIAGEM-MAC") {
  const { data, error } = await supabase.rpc("assurant_diag_criar_pareamento", {
    p_station_name: stationName,
  });

  if (error) throw new Error(error.message);
  return data?.[0] || null;
}

export async function iniciarDiagnosticoAutomatico({ stationId, voucher, userId }) {
  if (!stationId) throw new Error("Selecione uma estação online.");

  const { data: session, error: sessionError } = await supabase
    .from("assurant_diag_sessions")
    .insert({
      station_id: stationId,
      voucher: voucher?.trim() || null,
      operator_id: userId,
      status: "detectando",
    })
    .select("*")
    .single();

  if (sessionError) throw new Error(sessionError.message);

  const { data: command, error: commandError } = await supabase
    .from("assurant_diag_commands")
    .insert({
      station_id: stationId,
      session_id: session.id,
      command: "detect_and_diagnose",
      payload: { voucher: voucher?.trim() || null },
      created_by: userId,
    })
    .select("*")
    .single();

  if (commandError) throw new Error(commandError.message);

  return { session, command };
}

export async function buscarSessaoDiagnostico(sessionId) {
  const [
    sessionRes,
    idsRes,
    testsRes,
    blacklistRes,
    commandRes,
  ] = await Promise.all([
    supabase
      .from("assurant_diag_sessions")
      .select("*")
      .eq("id", sessionId)
      .single(),
    supabase
      .from("assurant_diag_identifiers")
      .select("*")
      .eq("session_id", sessionId)
      .order("kind", { ascending: true })
      .order("slot", { ascending: true }),
    supabase
      .from("assurant_diag_tests")
      .select("*")
      .eq("session_id", sessionId)
      .order("category", { ascending: true })
      .order("label", { ascending: true }),
    supabase
      .from("assurant_imei_blacklist_checks")
      .select("*")
      .eq("session_id", sessionId)
      .order("imei", { ascending: true }),
    supabase
      .from("assurant_diag_commands")
      .select("id,status,error,created_at,claimed_at,finished_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (sessionRes.error) throw new Error(sessionRes.error.message);
  if (idsRes.error) throw new Error(idsRes.error.message);
  if (testsRes.error) throw new Error(testsRes.error.message);
  if (blacklistRes.error) throw new Error(blacklistRes.error.message);
  if (commandRes.error) throw new Error(commandRes.error.message);

  return {
    session: sessionRes.data,
    identifiers: idsRes.data || [],
    tests: testsRes.data || [],
    blacklist: blacklistRes.data || [],
    command: commandRes.data || null,
  };
}

export async function registrarResultadoBlacklist({
  checkId,
  status,
  reason = null,
  userId,
}) {
  const isRestricted =
    status === "restricted" ? true : status === "clean" ? false : null;

  const { data, error } = await supabase
    .from("assurant_imei_blacklist_checks")
    .update({
      status,
      is_restricted: isRestricted,
      reason: reason?.trim() || null,
      checked_by: userId,
      checked_at: new Date().toISOString(),
    })
    .eq("id", checkId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function listarSessoesDiagnosticoRecentes(limit = 20) {
  const { data, error } = await supabase
    .from("assurant_diag_sessions")
    .select("id,voucher,status,platform,manufacturer,model,serial,started_at,finished_at,station_id")
    .order("started_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function cancelarSessaoDiagnostico(sessionId) {
  const { error } = await supabase
    .from("assurant_diag_sessions")
    .update({ status: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", sessionId);

  if (error) throw new Error(error.message);
}
