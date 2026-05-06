import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Upload, BarChart3, Bell, DollarSign, ClipboardList,
  ClipboardCheck, Wrench, Zap, Sparkles, FlaskConical,
  Camera, ShieldCheck, ChevronDown, ChevronRight, Layers,
  Truck, TrendingUp, Users, LogOut, X,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 rounded-2xl bg-[#7F2D92] shadow-lg shadow-fuchsia-300/30 ring-1 ring-white/20 overflow-hidden shrink-0">
        <div className="absolute inset-0 flex items-center justify-center text-white font-black text-lg">LP</div>
      </div>
      <div>
        <div className="text-2xl font-black text-white">liquida<span className="text-[#F59E0B]">preço</span></div>
        <div className="text-xs text-white/70 -mt-1">Liquida System</div>
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label, indent = false, onClick }) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${indent ? "pl-6" : ""} ${
          isActive ? "bg-white text-[#6B1F87] shadow-lg" : "text-white/85 hover:bg-white/10"
        }`
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

function CollapseGroup({ icon: Icon, label, paths, children }) {
  const location = useLocation();
  const isActive = paths.some((p) => location.pathname.startsWith(p));
  const [open, setOpen] = useState(isActive);

  return (
    <div className="pt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-2xl px-4 py-3 transition-all ${
          isActive ? "bg-white/20 text-white" : "text-white/85 hover:bg-white/10"
        }`}
      >
        <div className="flex items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{label}</span>
        </div>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>
      {open && (
        <div className="mt-1 space-y-1 border-l-2 border-white/20 ml-4 pl-2">
          {children}
        </div>
      )}
    </div>
  );
}

function SidebarContent({ profile, onClose, handleLogout }) {
  return (
    <>
      <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
        <div className="text-xs text-white/70">Usuário</div>
        <div className="mt-0.5 text-sm font-bold">{profile?.nome || "..."}</div>
        <div className="text-xs text-white/50">{profile?.is_master ? "Master" : "Usuário"}</div>
      </div>

      <nav className="flex-1 space-y-1">
        <NavItem to="/upload" icon={Upload} label="Uploads" onClick={onClose} />

        <CollapseGroup icon={TrendingUp} label="Tesouraria" paths={["/analise-entrada", "/faturamento"]}>
          <NavItem to="/analise-entrada" icon={BarChart3} label="Análise de Entrada" indent onClick={onClose} />
          <NavItem to="/faturamento" icon={DollarSign} label="Faturamento" indent onClick={onClose} />
        </CollapseGroup>

        <CollapseGroup icon={Truck} label="Logística" paths={["/abertura-os"]}>
          <NavItem to="/abertura-os" icon={ClipboardList} label="Abertura de OS" indent onClick={onClose} />
        </CollapseGroup>

        <CollapseGroup icon={Layers} label="Linha Branca" paths={["/linha-branca"]}>
          <NavItem to="/linha-branca/triagem" icon={ClipboardCheck} label="Triagem" indent onClick={onClose} />
          <NavItem to="/linha-branca/reparo-mecanico" icon={Wrench} label="Reparo Mecânico" indent onClick={onClose} />
          <NavItem to="/linha-branca/reparo-eletrico" icon={Zap} label="Reparo Elétrico" indent onClick={onClose} />
          <NavItem to="/linha-branca/reparo-estetico" icon={Sparkles} label="Reparo Estético" indent onClick={onClose} />
          <NavItem to="/linha-branca/bancada-testes" icon={FlaskConical} label="Bancada de Testes" indent onClick={onClose} />
          <NavItem to="/linha-branca/limpeza" icon={Camera} label="Limpeza" indent onClick={onClose} />
          <NavItem to="/linha-branca/qualidade" icon={ShieldCheck} label="Qualidade" indent onClick={onClose} />
        </CollapseGroup>

        <div className="pt-2">
          <div className="px-4 text-xs font-bold text-white/50 uppercase">Sistema</div>
        </div>

        {profile?.is_master && (
          <NavItem to="/gerenciar-usuarios" icon={Users} label="Gerenciar Usuários" onClick={onClose} />
        )}

        <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/60 cursor-default">
          <Bell className="h-4 w-4" />
          <span>Alertas</span>
        </button>
      </nav>

      <button
        onClick={handleLogout}
        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-white/70 hover:bg-white/10 transition-all"
      >
        <LogOut className="h-4 w-4" />
        <span className="text-sm font-medium">Sair</span>
      </button>
    </>
  );
}

export default function Sidebar({ open, onClose, onDesktopClose }) {
  const { profile } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await signOut();
    onClose?.();
    onDesktopClose?.();
    navigate("/login");
  }

  return (
    <>
      {/* Desktop drawer */}
      <aside className="hidden lg:flex flex-col h-full w-[325px] gap-4 bg-[linear-gradient(180deg,#7F2D92_0%,#5B1E74_100%)] p-6 text-white overflow-y-auto">
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={onDesktopClose} className="text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent profile={profile} onClose={onDesktopClose} handleLogout={handleLogout} />
      </aside>

      {/* Mobile drawer */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-[300px] flex flex-col gap-4 bg-[linear-gradient(180deg,#7F2D92_0%,#5B1E74_100%)] p-6 text-white overflow-y-auto transition-transform duration-300 lg:hidden ${
        open ? "translate-x-0" : "-translate-x-full"
      }`}>
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={onClose} className="text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent profile={profile} onClose={onClose} handleLogout={handleLogout} />
      </aside>
    </>
  );
}