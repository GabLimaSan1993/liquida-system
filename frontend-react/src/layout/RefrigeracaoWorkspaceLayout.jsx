import { useState } from "react";

import {
  ArrowLeft,
  ClipboardCheck,
  Gauge,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  TestTubeDiagonal,
  User,
  Wrench,
} from "lucide-react";

import {
  NavLink,
  Outlet,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

const MENU = [
  {
    label: "Visão Geral",
    icon: Gauge,
    to: "/v2/linha-branca/refrigeracao",
    exact: true,
  },
  {
    label: "Triagem",
    icon: ClipboardCheck,
    to: "/v2/linha-branca/refrigeracao/triagem",
  },
  {
    label: "Reparos",
    icon: Wrench,
    to: "/v2/linha-branca/refrigeracao/reparos",
  },
  {
    label: "Bancada de Testes",
    icon: TestTubeDiagonal,
    to: "/v2/linha-branca/refrigeracao/testes",
  },
];

function MenuItem({
  item,
  collapsed,
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.exact}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) => `
        group relative flex h-11 items-center rounded-xl transition-all
        ${
          collapsed
            ? "justify-center px-2"
            : "gap-3 px-3"
        }
        ${
          isActive
            ? "bg-white text-[#4C1D95] shadow-sm"
            : "text-white/65 hover:bg-white/10 hover:text-white"
        }
      `}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />

      {!collapsed && (
        <span className="truncate text-sm font-semibold">
          {item.label}
        </span>
      )}

      {collapsed && (
        <div className="pointer-events-none absolute left-[66px] z-50 hidden whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
          {item.label}
        </div>
      )}
    </NavLink>
  );
}

export default function RefrigeracaoWorkspaceLayout() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  async function sair() {
    await signOut();

    navigate("/login", {
      replace: true,
    });
  }

  return (
    <div className="min-h-screen bg-[#F5F5F6]">
      {/* SIDEBAR DESKTOP */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 hidden flex-col
          bg-[linear-gradient(180deg,#2A1747_0%,#211136_52%,#190D2A_100%)] transition-all duration-200 lg:flex
          ${
            collapsed
              ? "w-[76px]"
              : "w-[260px]"
          }
        `}
      >
        <div className="flex h-[72px] items-center border-b border-slate-200 bg-white px-3">
          <div
            className={`flex w-full items-center ${
              collapsed
                ? "justify-center"
                : "gap-3 px-2"
            }`}
          >
            <img
              src={
                collapsed
                  ? "/brand/liquida-logo-icon.png"
                  : "/brand/liquida-logo-full.png"
              }
              alt="LiquidaPreço"
              className={
                collapsed
                  ? "h-10 w-10 object-contain"
                  : "h-10 max-w-[170px] object-contain"
              }
            />
          </div>
        </div>

        {!collapsed && (
          <div className="px-4 pt-4">
            <button
              type="button"
              onClick={() =>
                navigate("/v2/linha-branca")
              }
              className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10"
            >
              <ArrowLeft className="h-4 w-4 text-white/60" />

              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                  Voltar para
                </div>

                <div className="text-xs font-semibold text-white/80">
                  Linha Branca
                </div>
              </div>
            </button>
          </div>
        )}

        <div
          className={
            collapsed
              ? "px-3 pt-5"
              : "px-4 pt-5"
          }
        >
          {!collapsed ? (
            <div className="rounded-xl bg-white/5 px-3.5 py-3 ring-1 ring-white/10">
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200/60">
  Área
</div>

              <div className="mt-1 text-sm font-bold text-white">
                Refrigeração
              </div>

              <div className="mt-0.5 text-[11px] text-white/40">
                Linha Branca
              </div>
            </div>
          ) : (
            <div className="flex h-10 items-center justify-center rounded-xl bg-white/5 text-white/70 ring-1 ring-white/10">
              <Wrench className="h-[18px] w-[18px]" />
            </div>
          )}
        </div>

        <nav
          className={
            collapsed
              ? "mt-4 flex-1 space-y-1 px-3"
              : "mt-4 flex-1 space-y-1 px-4"
          }
        >
          {MENU.map((item) => (
            <MenuItem
              key={item.label}
              item={item}
              collapsed={collapsed}
            />
          ))}
        </nav>

        <div
          className={
            collapsed
              ? "border-t border-white/10 px-3 py-3"
              : "border-t border-white/10 px-4 py-3"
          }
        >
          {!collapsed && (
            <div className="mb-2 rounded-xl px-3 py-2">
              <div className="truncate text-xs font-semibold text-white/75">
                {profile?.nome || "Usuário"}
              </div>

              <div className="mt-0.5 text-[10px] text-white/35">
                Refrigeração
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={sair}
            className={`
              flex h-10 w-full items-center rounded-xl
              text-white/50 transition
              hover:bg-white/10 hover:text-white
              ${
                collapsed
                  ? "justify-center"
                  : "gap-3 px-3"
              }
            `}
          >
            <LogOut className="h-[17px] w-[17px]" />

            {!collapsed && (
              <span className="text-xs font-semibold">
                Sair
              </span>
            )}
          </button>
        </div>
      </aside>

      {/* CONTEÚDO */}
      <div
        className={`min-h-screen transition-all duration-200 ${
          collapsed
            ? "lg:pl-[76px]"
            : "lg:pl-[260px]"
        }`}
      >
        <header className="sticky top-0 z-30 h-[72px] border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-full items-center gap-3 px-4 lg:px-6">
            <button
              type="button"
              onClick={() =>
                setMobileOpen(true)
              }
              className="rounded-xl border border-slate-200 p-2.5 text-slate-600 lg:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() =>
                setCollapsed(
                  (current) => !current
                )
              }
              className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50 lg:flex"
            >
              {collapsed ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeftClose className="h-5 w-5" />
              )}
            </button>

            <div>
              <div className="text-sm font-black text-slate-900">
                Refrigeração
              </div>

              <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                Linha Branca
              </div>
            </div>

            <div className="ml-auto flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F]">
                <User className="h-[17px] w-[17px]" />
              </div>

              <div className="hidden lg:block">
                <div className="max-w-[160px] truncate text-xs font-bold text-slate-800">
                  {profile?.nome || "Usuário"}
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="px-5 py-8 sm:px-8 lg:py-10">
          <Outlet />
        </main>
      </div>

      {/* MOBILE */}
      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/40 lg:hidden"
            onClick={() =>
              setMobileOpen(false)
            }
          />

          <aside className="fixed inset-y-0 left-0 z-50 w-[280px] bg-[linear-gradient(180deg,#2A1747_0%,#211136_52%,#190D2A_100%)] p-4 lg:hidden">
            <div className="-mx-4 -mt-4 mb-5 flex h-[72px] items-center bg-white px-5">
  <img
    src="/brand/liquida-logo-full.png"
    alt="LiquidaPreço"
    className="h-10 max-w-[180px] object-contain"
  />
</div>

            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                navigate("/v2/linha-branca");
              }}
              className="mb-5 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white/75"
            >
              <ArrowLeft className="h-4 w-4" />
              Linha Branca
            </button>

            <nav className="space-y-1">
              {MENU.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  end={item.exact}
                  onClick={() =>
                    setMobileOpen(false)
                  }
                  className={({ isActive }) => `
                    flex h-11 items-center gap-3 rounded-xl px-3
                    text-sm font-semibold
                    ${
                      isActive
                        ? "bg-white text-[#43284F]"
                        : "text-white/70"
                    }
                  `}
                >
                  <item.icon className="h-[18px] w-[18px]" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </aside>
        </>
      )}
    </div>
  );
}