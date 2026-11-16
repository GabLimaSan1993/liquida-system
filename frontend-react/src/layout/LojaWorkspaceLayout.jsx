import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ArrowLeft, Database, LogOut, Store } from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

export default function LojaWorkspaceLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  async function sair() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F6F7F9] text-slate-900">
      <header className="h-[72px] border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-full max-w-[1560px] items-center justify-between px-5 lg:px-10">
          <div className="flex items-center gap-4">
            <button type="button" onClick={() => navigate("/sistemas")} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100" title="Sistemas">
              <ArrowLeft size={19} />
            </button>
            <img src="/brand/liquida-logo-full.png" alt="Liquida Preço" className="h-9 w-auto object-contain" />
            <span className="hidden h-6 w-px bg-slate-200 sm:block" />
            <div className="hidden items-center gap-2 font-semibold text-slate-700 sm:flex"><Store size={17} /> Loja</div>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-slate-500 sm:inline">{profile?.nome || "Usuário"}</span>
            <button type="button" onClick={sair} title="Sair" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><LogOut size={18}/></button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-[1560px] flex-col md:min-h-[calc(100vh-72px)] md:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-200 bg-white p-4 md:w-60 md:border-b-0 md:border-r md:p-5">
          <p className="mb-3 px-3 text-[10px] font-bold uppercase tracking-[0.15em] text-slate-400">Operação Loja</p>
          <NavLink to="/v2/loja/vendas/upload" className={({isActive}) => "flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-semibold " + (isActive ? "bg-[#F1EDF5] text-[#43284F]" : "text-slate-600 hover:bg-slate-50")}>
            <Database size={17} /> Base de vendas PDV
          </NavLink>
        </aside>
        <main className="min-w-0 flex-1 p-5 md:p-8 lg:p-10"><Outlet /></main>
      </div>
    </div>
  );
}
