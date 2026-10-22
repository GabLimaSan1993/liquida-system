import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { fetchProfile } from "./services/authService";

import { hasLinhaBrancaAccess } from "./services/linhaBrancaAccess.js";

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
    if (tela === "/chamados/gestao") return profile.id === "b517d70a-56be-4b4f-8b9e-a03c769dd3c3" && profile.telas_permitidas?.includes(tela) === true && profile.telas_permitidas?.includes("/chamados") === true;
    if (tela === "/chamados") return profile.telas_permitidas?.includes(tela) === true;
    if (tela === "/v2/linha-branca" || tela.startsWith("/v2/linha-branca/")) return hasLinhaBrancaAccess(profile, tela);
    if (["/v2/assurant/b2c/baixas", "/v2/assurant/b2c/baixas/aprovar", "/v2/assurant/gestao/producao", "/v2/assurant/b2c/validacao-meli", "/v2/assurant/gestao/esteira", "/v2/assurant/gestao/fechamento-lojas", "/v2/assurant/gestao/relatorio-estoque"].includes(tela)) return profile.telas_permitidas?.includes(tela) === true;
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
