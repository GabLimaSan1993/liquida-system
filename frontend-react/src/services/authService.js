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
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;

  const { error: profileError } = await supabase
    .from("user_profiles")
    .insert({
      id: data.user.id,
      nome,
      email,
      is_master: isMaster,
      telas_permitidas: telasPermitidas,
      area_tecnica: areaTecnica || null,
    });

  if (profileError) throw profileError;
  return data.user;
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