import {
  ArrowLeft,
  LogOut,
  User,
} from "lucide-react";

import {
  Outlet,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

export default function LinhaBrancaWorkspaceLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  async function sair() {
    await signOut();
    navigate("/login", {
      replace: true,
    });
  }

  return (
    <div className="min-h-screen bg-[#F5F5F6]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[72px] max-w-[1600px] items-center gap-5 px-5 sm:px-8">
          <button
            type="button"
            onClick={() => navigate("/sistemas")}
            className="
              flex h-10 w-10 shrink-0 items-center justify-center
              rounded-xl border border-slate-200 text-slate-500
              transition hover:bg-slate-50 hover:text-slate-800
            "
            title="Voltar para sistemas"
          >
            <ArrowLeft className="h-[18px] w-[18px]" />
          </button>

          <div className="flex min-w-0 items-center gap-4">
            <img
              src="/brand/liquida-logo-icon.png"
              alt="LiquidaPreço"
              className="h-10 w-10 shrink-0 object-contain"
            />

            <div className="min-w-0">
              <div className="truncate text-sm font-black text-slate-900">
                Linha Branca
              </div>

              <div className="truncate text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Liquida System
              </div>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2.5 sm:flex">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F2EEF4] text-[#43284F]">
                <User className="h-[17px] w-[17px]" />
              </div>

              <div className="hidden lg:block">
                <div className="max-w-[170px] truncate text-xs font-bold text-slate-800">
                  {profile?.nome || "Usuário"}
                </div>

                <div className="text-[10px] font-medium text-slate-400">
                  Linha Branca
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={sair}
              className="
                flex h-10 items-center gap-2 rounded-xl
                border border-slate-200 px-3
                text-xs font-bold text-slate-500
                transition hover:bg-slate-50 hover:text-slate-800
              "
            >
              <LogOut className="h-4 w-4" />

              <span className="hidden sm:inline">
                Sair
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] px-5 py-8 sm:px-8 lg:py-10">
        <Outlet />
      </main>

      <footer className="px-6 pb-8 pt-2 text-center">
        <span className="text-[10px] font-medium tracking-wide text-slate-400">
          Powered by{" "}
        </span>

        <span className="text-[10px] font-bold tracking-wide text-slate-500">
          Redoma Advisory
        </span>
      </footer>
    </div>
  );
}