import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BarChart3,
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  HelpCircle,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  ShieldCheck,
  ShoppingCart,
  Truck,
  User,
  Warehouse,
  X,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

const SIDEBAR_STORAGE_KEY = "liquida.assurant.sidebarCollapsed";

const MENU_GROUPS = [
  {
    label: null,
    items: [
      {
        label: "Visão Geral",
        icon: LayoutDashboard,
        to: "/v2/assurant",
        exact: true,
        enabled: true,
      },
    ],
  },

  {
    label: "OPERAÇÃO",
    items: [
      {
        label: "Recebimento",
        icon: Truck,
        enabled: false,
      },
      {
        label: "Triagens",
        icon: FlaskConical,
        enabled: false,
      },
      {
        label: "B2B",
        icon: Boxes,
        enabled: false,
      },
      {
        label: "B2C",
        icon: ShoppingCart,
        enabled: false,
      },
    ],
  },

  {
    label: "ESTOQUE",
    items: [
      {
        label: "Armazenagem",
        icon: Package,
        enabled: false,
      },
      {
        label: "Consulta do Estoque",
        icon: Warehouse,
        enabled: false,
      },
      {
        label: "Inventário",
        icon: ClipboardCheck,
        enabled: false,
      },
      {
        label: "Carga Inicial",
        icon: Activity,
        enabled: false,
      },
    ],
  },

  {
    label: "PÓS-VENDA",
    items: [
      {
        label: "Trocas e Devoluções",
        icon: RefreshCw,
        enabled: false,
      },
    ],
  },

  {
    label: "GESTÃO",
    items: [
      {
        label: "Indicadores",
        icon: BarChart3,
        enabled: false,
      },
      {
        label: "SLA & Rastreabilidade",
        icon: ShieldCheck,
        enabled: false,
      },
      {
        label: "Documentação",
        icon: FileText,
        enabled: false,
      },
    ],
  },
];

function Logo({ collapsed = false }) {
  return (
    <div
      className={`flex items-center ${
        collapsed ? "justify-center" : "gap-3"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
        <span className="text-sm font-black tracking-tight text-white">LP</span>
      </div>

      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-[17px] font-black tracking-tight text-white">
            liquida
            <span className="text-violet-300">preço</span>
          </div>

          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Liquida System
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarNavItem({
  item,
  collapsed,
  closeMobile,
}) {
  const Icon = item.icon;

  if (!item.enabled) {
    return (
      <div
        title={collapsed ? `${item.label} — Em migração` : undefined}
        className={`
          group relative flex h-11 cursor-default items-center rounded-xl
          text-white/35 transition
          ${collapsed ? "justify-center px-2" : "gap-3 px-3"}
        `}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />

        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">
              {item.label}
            </span>

            <span className="rounded-md bg-white/5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white/30">
              Em migração
            </span>
          </>
        )}

        {collapsed && (
          <div className="pointer-events-none absolute left-[66px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
            {item.label}
            <div className="mt-0.5 text-[10px] font-medium text-white/45">
              Em migração
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={closeMobile}
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
            : "text-white/70 hover:bg-white/8 hover:text-white"
        }
      `}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />

      {!collapsed && (
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {item.label}
        </span>
      )}

      {collapsed && (
        <div className="pointer-events-none absolute left-[66px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
          {item.label}
        </div>
      )}
    </NavLink>
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onCloseMobile,
  onBack,
  profile,
  onLogout,
  mobile = false,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`
          flex h-[72px] shrink-0 items-center border-b border-white/10
          ${collapsed ? "justify-center px-3" : "justify-between px-5"}
        `}
      >
        <Logo collapsed={collapsed} />

        {!collapsed && mobile && (
          <button
            type="button"
            onClick={onCloseMobile}
            className="rounded-lg p-2 text-white/60 transition hover:bg-white/10 hover:text-white"
            aria-label="Fechar menu"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="shrink-0 px-4 pt-4">
          <button
            type="button"
            onClick={onBack}
            className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-left transition hover:bg-white/10"
          >
            <ChevronLeft className="h-4 w-4 shrink-0 text-white/60" />

            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">
                Voltar para
              </div>

              <div className="truncate text-xs font-semibold text-white/80">
                Liquida System
              </div>
            </div>
          </button>
        </div>
      )}

      <div
        className={`
          shrink-0
          ${collapsed ? "px-3 pt-4" : "px-4 pt-5"}
        `}
      >
        {!collapsed ? (
          <div className="rounded-xl bg-white/6 px-3.5 py-3 ring-1 ring-white/8">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-violet-200/60">
              Workspace
            </div>

            <div className="mt-1 text-sm font-bold text-white">
              Assurant Warehouse
            </div>

            <div className="mt-0.5 text-[11px] leading-4 text-white/40">
              Operação dedicada
            </div>
          </div>
        ) : (
          <div
            title="Assurant Warehouse"
            className="flex h-10 items-center justify-center rounded-xl bg-white/6 text-violet-200 ring-1 ring-white/8"
          >
            <Warehouse className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>

      <nav
        className={`
          mt-4 flex-1 overflow-y-auto overflow-x-visible pb-4
          ${collapsed ? "px-3" : "px-4"}
        `}
      >
        <div className="space-y-5">
          {MENU_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex}>
              {group.label && !collapsed && (
                <div className="mb-1.5 px-3 text-[10px] font-black tracking-[0.16em] text-white/30">
                  {group.label}
                </div>
              )}

              {group.label && collapsed && (
                <div className="mx-auto mb-2 h-px w-7 bg-white/10" />
              )}

              <div className="space-y-1">
                {group.items.map((item) => (
                  <SidebarNavItem
                    key={item.label}
                    item={item}
                    collapsed={collapsed}
                    closeMobile={onCloseMobile}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div
        className={`
          shrink-0 border-t border-white/10 py-3
          ${collapsed ? "px-3" : "px-4"}
        `}
      >
        {!collapsed && (
          <div className="mb-2 rounded-xl px-3 py-2">
            <div className="truncate text-xs font-semibold text-white/75">
              {profile?.nome || "Usuário"}
            </div>

            <div className="mt-0.5 truncate text-[10px] text-white/35">
              Assurant Warehouse
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          title={collapsed ? "Sair" : undefined}
          className={`
            flex h-10 w-full items-center rounded-xl text-white/50 transition
            hover:bg-white/8 hover:text-white
            ${collapsed ? "justify-center" : "gap-3 px-3"}
          `}
        >
          <LogOut className="h-[17px] w-[17px] shrink-0" />

          {!collapsed && (
            <span className="text-xs font-semibold">Sair</span>
          )}
        </button>
      </div>

      {!mobile && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="
            absolute -right-3 top-[92px] z-50 flex h-7 w-7
            items-center justify-center rounded-full border border-violet-200
            bg-white text-[#5B21B6] shadow-md transition
            hover:border-violet-300 hover:bg-violet-50
          "
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}

function Topbar({
  onOpenMobileMenu,
  collapsed,
  onToggleCollapsed,
  profile,
}) {
  const [searchValue, setSearchValue] = useState("");

  return (
    <header className="sticky top-0 z-30 h-[72px] border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="flex h-full items-center gap-4 px-4 lg:px-6">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={onToggleCollapsed}
          className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 lg:flex"
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>

        <div className="relative hidden max-w-[620px] flex-1 md:block">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-slate-400" />

          <input
            type="text"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
            placeholder="Buscar pedido, IMEI, voucher, SKU..."
            className="
              h-10 w-full rounded-xl border border-slate-200 bg-slate-50
              pl-10 pr-20 text-sm text-slate-700 outline-none transition
              placeholder:text-slate-400
              focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100
            "
          />

          <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
            V2
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 xl:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />

            <span className="text-[11px] font-bold text-violet-700">
              Workspace piloto
            </span>
          </div>

          <button
            type="button"
            className="rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:bg-slate-50"
            title="Ajuda"
          >
            <HelpCircle className="h-[18px] w-[18px]" />
          </button>

          <div className="hidden h-8 w-px bg-slate-200 sm:block" />

          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <User className="h-[17px] w-[17px]" />
            </div>

            <div className="hidden min-w-0 lg:block">
              <div className="max-w-[150px] truncate text-xs font-bold text-slate-800">
                {profile?.nome || "Usuário"}
              </div>

              <div className="text-[10px] font-medium text-slate-400">
                Assurant Warehouse
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function WorkspacePlaceholder() {
  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            Assurant Warehouse
          </span>

          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            V2 · Piloto
          </span>
        </div>

        <h1 className="text-2xl font-black tracking-tight text-slate-900 lg:text-[30px]">
          Visão Geral
        </h1>

        <p className="mt-1 text-sm text-slate-500">
          Nova experiência do Assurant Warehouse.
        </p>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
              <LayoutDashboard className="h-5 w-5" />
            </div>

            <div>
              <h2 className="text-sm font-black text-slate-800">
                Shell do Warehouse criado
              </h2>

              <p className="mt-0.5 text-xs text-slate-400">
                Nenhuma funcionalidade operacional foi migrada nesta etapa.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              title: "Recebimento",
              icon: Truck,
            },
            {
              title: "Triagens",
              icon: FlaskConical,
            },
            {
              title: "B2B / B2C",
              icon: Boxes,
            },
            {
              title: "Gestão de Estoque",
              icon: Warehouse,
            },
          ].map(({ title, icon: Icon }) => (
            <div
              key={title}
              className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-violet-600 shadow-sm ring-1 ring-slate-200">
                  <Icon className="h-[17px] w-[17px]" />
                </div>

                <span className="rounded-md bg-slate-200/70 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-slate-500">
                  Próxima etapa
                </span>
              </div>

              <div className="mt-4 text-sm font-bold text-slate-700">
                {title}
              </div>

              <div className="mt-1 text-xs leading-5 text-slate-400">
                Estrutura preparada para migração controlada.
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100 bg-slate-50/70 px-6 py-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px] font-medium text-slate-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Sistema atual preservado
            </span>

            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Sem alteração no Supabase
            </span>

            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Sem alteração no WMS
            </span>

            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Sem alteração nos fluxos operacionais
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AssurantWorkspaceLayout() {
  const { profile } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
    } catch {
      return false;
    }
  });

  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        collapsed ? "true" : "false"
      );
    } catch {
      // localStorage indisponível: interface continua funcionando normalmente.
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const sidebarWidth = collapsed ? 76 : 268;

  const hasNestedRoute = useMemo(() => {
    return location.pathname !== "/v2/assurant";
  }, [location.pathname]);

  function toggleCollapsed() {
    setCollapsed((current) => !current);
  }

  function backToLiquida() {
    navigate("/");
  }

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-slate-900">
      <aside
        className="
          fixed inset-y-0 left-0 z-40 hidden border-r border-violet-950/30
          bg-[linear-gradient(180deg,#2A1747_0%,#211136_52%,#190D2A_100%)]
          transition-[width] duration-300 ease-out lg:block
        "
        style={{ width: `${sidebarWidth}px` }}
      >
        <div className="relative h-full">
          <SidebarContent
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            profile={profile}
            onBack={backToLiquida}
            onLogout={handleLogout}
          />
        </div>
      </aside>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
            onClick={() => setMobileOpen(false)}
          />

          <aside className="fixed inset-y-0 left-0 z-50 w-[286px] bg-[linear-gradient(180deg,#2A1747_0%,#211136_52%,#190D2A_100%)] shadow-2xl lg:hidden">
            <SidebarContent
              collapsed={false}
              mobile
              onCloseMobile={() => setMobileOpen(false)}
              profile={profile}
              onBack={backToLiquida}
              onLogout={handleLogout}
            />
          </aside>
        </>
      )}

      <div
        className="min-h-screen transition-[margin] duration-300 ease-out lg:ml-[var(--sidebar-width)]"
        style={{
          "--sidebar-width": `${sidebarWidth}px`,
        }}
      >
        <Topbar
          onOpenMobileMenu={() => setMobileOpen(true)}
          collapsed={collapsed}
          onToggleCollapsed={toggleCollapsed}
          profile={profile}
        />

        <main className="p-4 md:p-6 lg:p-7">
          {hasNestedRoute ? <Outlet /> : <WorkspacePlaceholder />}
        </main>
      </div>
    </div>
  );
}