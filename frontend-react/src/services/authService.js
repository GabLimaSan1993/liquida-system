import { supabase } from "../lib/supabase";

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw error;
  return data;
}

export async function fetchAllProfiles() {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .order("nome");
  if (error) throw error;
  return data || [];
}

export async function createUser(email, password, nome, isMaster, telasPermitidas, areaTecnica) {
  const { data: { session } } = await supabase.auth.getSession();

  const response = await fetch(
    "https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/criar-usuario",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({
        email,
        password,
        nome,
        is_master: isMaster,
        telas_permitidas: telasPermitidas,
        area_tecnica: areaTecnica || null,
      }),
    }
  );

  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Erro ao criar usuário");
  return data;
}

export async function updateUserPermissions(userId, telasPermitidas, isMaster, areaTecnica) {
  const { error } = await supabase
    .from("user_profiles")
    .update({
      telas_permitidas: telasPermitidas,
      is_master: isMaster,
      area_tecnica: areaTecnica || null,
    })
    .eq("id", userId);
  if (error) throw error;
}