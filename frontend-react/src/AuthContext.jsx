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

  // A revogação global do Supabase impede novos refreshes, mas um JWT antigo
  // pode durar até a expiração. Conferimos a sessão no servidor para encerrar
  // imediatamente na navegação/foco ou dentro de 20 segundos (versões novas).
  useEffect(() => {
    if (!supabase) return;
    let disposed = false;
    let checking = false;

    const verificarSessao = async () => {
      if (disposed || checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session || disposed) return;
        const { data: autorizada, error } = await supabase.rpc("liquida_sessao_autorizada");
        if (error) {
          console.warn("Não foi possível verificar a sessão Liquida:", error.message);
          return;
        }
        if (autorizada === false && !disposed) {
          // Limpa o navegador sem revogar um login novo do mesmo usuário.
          await supabase.auth.signOut({ scope: "local" });
          if (!disposed) window.location.replace("/login?atualizacao=" + Date.now());
        }
      } catch (error) {
        console.warn("Erro na validação da sessão Liquida:", error);
      } finally {
        checking = false;
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void verificarSessao();
    };
    const onFocus = () => void verificarSessao();
    void verificarSessao();
    const interval = window.setInterval(verificarSessao, 20000);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onFocus);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  function hasAccess(tela) {
    if (!profile) return false;
    // Administradores master não dependem de permissões avulsas de tela.
    if (profile.is_master) return true;
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
