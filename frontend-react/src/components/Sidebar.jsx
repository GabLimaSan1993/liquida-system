import { NavLink } from "react-router-dom";
import {
  Upload,
  BarChart3,
  Database,
  Bell,
  DollarSign,
  ClipboardList,
  ClipboardCheck,
} from "lucide-react";

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-12 w-12 rounded-2xl bg-[#7F2D92] shadow-lg shadow-fuchsia-300/30 ring-1 ring-white/20 overflow-hidden">
        <div className="absolute inset-0 flex items-center justify-center text-white font-black text-lg">
          LP
        </div>
      </div>

      <div>
        <div className="text-2xl font-black text-white">
          liquida<span className="text-[#F59E0B]">preço</span>
        </div>
        <div className="text-xs text-white/70 -mt-1">Liquida System</div>
      </div>
    </div>
  );
}

function NavItem({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `w-full flex items-center gap-3 rounded-2xl px-4 py-3 transition-all ${
          isActive
            ? "bg-white text-[#6B1F87] shadow-lg"
            : "text-white/85 hover:bg-white/10"
        }`
      }
    >
      <Icon className="h-4 w-4" />
      <span className="font-medium">{label}</span>
    </NavLink>
  );
}

export default function Sidebar() {
  return (
    <aside className="hidden lg:flex flex-col gap-6 bg-[linear-gradient(180deg,#7F2D92_0%,#5B1E74_100%)] p-6 text-white">
      <Logo />

      <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
        <div className="text-sm text-white/70">Plataforma</div>
        <div className="mt-1 text-lg font-semibold">Pricing & Margem</div>
      </div>

      <nav className="space-y-2">

        {/* Upload */}
        <NavItem to="/upload" icon={Upload} label="Uploads" />

        {/* Entrada */}
        <NavItem to="/analise-entrada" icon={BarChart3} label="Análise de Entrada" />

        {/* Faturamento */}
        <NavItem to="/faturamento" icon={DollarSign} label="Faturamento" />

        {/* Abertura de OS */}
        <NavItem to="/abertura-os" icon={ClipboardList} label="Abertura de OS" />

        {/* -------- LINHA BRANCA -------- */}
        <div className="pt-4">
          <div className="px-4 text-xs font-bold text-white/50 uppercase">
            Linha Branca
          </div>
        </div>

        <NavItem
          to="/linha-branca/triagem"
          icon={ClipboardCheck}
          label="Triagem"
        />

        {/* placeholders futuros */}
        <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/40 cursor-default">
          <Database className="h-4 w-4" />
          <span>Reparo Mecânico</span>
        </button>

        <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/40 cursor-default">
          <Database className="h-4 w-4" />
          <span>Reparo Elétrico</span>
        </button>

        <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/40 cursor-default">
          <Database className="h-4 w-4" />
          <span>Reparo Estético</span>
        </button>

        {/* Outros */}
        <div className="pt-4">
          <div className="px-4 text-xs font-bold text-white/50 uppercase">
            Sistema
          </div>
        </div>

        <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/60 cursor-default">
          <Bell className="h-4 w-4" />
          <span>Alertas</span>
        </button>

      </nav>
    </aside>
  );
}