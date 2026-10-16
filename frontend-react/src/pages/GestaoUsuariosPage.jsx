import { ArrowLeft, LogOut, Users } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";
import GerenciarUsuariosPage from "./GerenciarUsuariosPage.jsx";

export default function GestaoUsuariosPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  async function sair() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F5F5F6]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex min-h-[76px] max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <Link to="/sistemas" aria-label="Voltar para Sistemas">
            <img src="/brand/liquida-logo-full.png" alt="LiquidaPreço" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold text-slate-600 sm:inline">{profile?.nome}</span>
            <Link to="/sistemas" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-[#43284F]">
              <ArrowLeft className="h-4 w-4" />Sistemas
            </Link>
            <button type="button" onClick={sair} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600">
              <LogOut className="h-4 w-4" />Sair
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8">
        <div className="mb-6 flex items-center gap-3 text-[#43284F]">
          <Users className="h-6 w-6" />
          <h1 className="text-2xl font-black">Gestão de usuários</h1>
        </div>
        <GerenciarUsuariosPage />
      </main>
    </div>
  );
}
