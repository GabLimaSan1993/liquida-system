import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { ArrowLeft, Banknote, ChevronDown, FileUp, Landmark, LogOut, Menu, X } from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import { supabase } from "../lib/supabase.js";
import { signOut } from "../services/authService.js";

const ROOT = "/backoffice/financeiro";

function MenuFinanceiro({ onNavigate }) {
  const [open, setOpen] = useState(true);
  const itemClass = ({ isActive }) =>
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition " +
    (isActive ? "bg-[#F1EDF5] font-semibold text-[#43284F]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900");

  return (
    <nav className="mt-6 px-3" aria-label="Navegação Back Office">
      <button type="button" onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        <span className="flex items-center gap-3"><Landmark className="h-4 w-4" /> Financeiro</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>
      {open && <div className="ml-5 mt-1 space-y-1 border-l border-slate-200 pl-3">
        <NavLink to={ROOT + "/fluxo-caixa"} className={itemClass} onClick={onNavigate}>
          <Banknote className="h-4 w-4" /> Fluxo de Caixa
        </NavLink>
        <NavLink to={ROOT + "/extratos-bancarios"} className={itemClass} onClick={onNavigate}>
          <FileUp className="h-4 w-4" /> Extratos Bancários
        </NavLink>
      </div>}
    </nav>
  );
}

export default function BackOfficeWorkspaceLayout() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [autorizado, setAutorizado] = useState(null);
  const [erro, setErro] = useState("");
  const [menuAberto, setMenuAberto] = useState(false);

  useEffect(() => {
    let ativo = true;
    if (!user?.id) { setAutorizado(false); return; }
    setAutorizado(null);
    setErro("");
    supabase.from("financeiro_acessos").select("usuario_id").eq("usuario_id", user.id).maybeSingle()
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) { setAutorizado(false); setErro("Não foi possível validar a permissão financeira."); }
        else setAutorizado(Boolean(data));
      });
    return () => { ativo = false; };
  }, [user?.id]);

  async function sair() {
    await signOut();
    navigate("/login", { replace: true });
  }

  if (autorizado === null) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F6F6F7] text-sm text-slate-500">Validando acesso ao Back Office...</div>;
  }
  if (!autorizado) {
    return <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#F6F6F7] text-slate-700">
      <Landmark className="h-8 w-8 text-[#43284F]" />
      <h1 className="font-semibold">Back Office — acesso restrito</h1>
      <p className="text-sm text-slate-500">{erro || "Seu usuário não possui acesso ao financeiro."}</p>
      <button onClick={() => navigate("/sistemas")} className="rounded-lg bg-[#43284F] px-4 py-2 text-sm text-white">Voltar aos sistemas</button>
    </div>;
  }

  return <div className="min-h-screen bg-[#F6F6F7] text-slate-900">
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 lg:hidden">
      <button type="button" aria-label="Abrir menu" onClick={() => setMenuAberto(true)}><Menu className="h-5 w-5" /></button>
      <span className="text-sm font-bold">LiquidaPreço · Back Office</span>
      <button type="button" aria-label="Voltar aos sistemas" onClick={() => navigate("/sistemas")}><ArrowLeft className="h-5 w-5" /></button>
    </header>
    {menuAberto && <button type="button" aria-label="Fechar menu" onClick={() => setMenuAberto(false)}
      className="fixed inset-0 z-40 bg-black/30 lg:hidden" />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0 ${menuAberto ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-6">
        <div><div className="text-xl font-extrabold tracking-tight text-[#43284F]">liquida<span className="text-[#D69A35]">preço</span></div>
          <div className="mt-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">Back Office</div></div>
        <button type="button" aria-label="Fechar menu" className="lg:hidden" onClick={() => setMenuAberto(false)}><X className="h-5 w-5" /></button>
      </div>
      <MenuFinanceiro onNavigate={() => setMenuAberto(false)} />
      <div className="mt-auto border-t border-slate-100 p-3">
        <button type="button" onClick={() => navigate("/sistemas")}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100">
          <ArrowLeft className="h-4 w-4" /> Todos os sistemas
        </button>
        <button type="button" onClick={sair}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut className="h-4 w-4" /> Sair
        </button>
        <div className="truncate px-3 pt-3 text-xs text-slate-400">{profile?.nome || user?.email}</div>
      </div>
    </aside>
    <main className="min-h-screen px-4 py-7 sm:px-7 lg:ml-[252px] lg:px-10 lg:py-9">
      <div className="mx-auto max-w-7xl"><Outlet /></div>
    </main>
  </div>;
}
