import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { fetchProfile } from "./services/authService";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  async function loadProfile(userId) {
    try {
      const p = await fetchProfile(userId);
      setProfile(p);
    } catch {
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) {
        loadProfile(u.id);
      } else {
        setLoading(false);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        setLoading(true);
        loadProfile(u.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  function hasAccess(tela) {
    if (!profile) return false;
    if (profile.is_master) return true;
    return profile.telas_permitidas?.includes(tela);
  }

  // Área técnica do usuário logado
  const areaTecnica = profile?.area_tecnica || null;

  // Verifica se é técnico de refrigeração
  const isRefrigeracao = areaTecnica === "refrigeracao";

  // Verifica se é técnico de outras linhas (climatizacao, lavadoras, diversos)
  const isOutrasLinhas = ["climatizacao", "lavadoras", "diversos"].includes(areaTecnica);

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading,
      hasAccess,
      areaTecnica,
      isRefrigeracao,
      isOutrasLinhas,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}