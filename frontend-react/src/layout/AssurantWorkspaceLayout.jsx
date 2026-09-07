import { useCallback, useEffect, useMemo, useState } from "react";

import {
  Activity,
  AlertTriangle,
  BarChart3,
  Boxes,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
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

import {
  NavLink,
  Outlet,
  useLocation,
  useNavigate,
} from "react-router-dom";

import { useAuth } from "../AuthContext.jsx";
import { supabase } from "../lib/supabase.js";
import { signOut } from "../services/authService.js";

const SIDEBAR_STORAGE_KEY =
  "liquida.assurant.sidebarCollapsed";

const ACTIVE_B2C_STATUSES = [
  "aguardando_alocacao",
  "aguardando_definicao_produto",
  "alocado",
  "em_picking",
  "em_analise",
  "embalado",
];

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
        enabled: true,

        children: [
          {
            label: "Recebimento Lojas",
            icon: Truck,
            to: "/v2/assurant/recebimento",
            exact: true,
          },

          {
            label: "Gestão de Recebimento",
            icon: BarChart3,
            to: "/v2/assurant/recebimento/gestao",
            exact: true,
          },
        ],
      },

      {
        label: "Triagens",
        icon: FlaskConical,
        enabled: true,

        children: [
          {
            label: "Triagem Funcional",
            icon: FlaskConical,
            to: "/v2/assurant/triagens/funcional",
            exact: true,
          },

          {
            label: "Laudo",
            icon: FileText,
            to: "/v2/assurant/triagens/laudo",
            exact: true,
          },

          {
            label: "Triagem Cosmética",
            icon: ClipboardCheck,
            to: "/v2/assurant/triagens/cosmetica",
            exact: true,
          },

          {
            label: "Entrada Oracle",
            icon: Activity,
            to: "/v2/assurant/triagens/oracle",
            exact: true,
          },
        ],
      },

      {
  label: "B2B",
  icon: Boxes,
  to: "/v2/assurant/b2b",
  exact: true,
  enabled: true,
},

      {
  label: "B2C",
  icon: ShoppingCart,
  to: "/v2/assurant/b2c",
  exact: true,
  enabled: true,
},
    ],
  },

  {
    label: "ESTOQUE",
    items: [
      {
  label: "Armazenagem",
  icon: Package,
  to: "/v2/assurant/estoque/armazenagem",
  exact: true,
  enabled: true,
},

      {
  label: "Consulta do Estoque",
  icon: Warehouse,
  to: "/v2/assurant/estoque/consulta",
  exact: true,
  enabled: true,
},

      {
  label: "Inventário",
  icon: ClipboardCheck,
  to: "/v2/assurant/estoque/inventario",
  exact: true,
  enabled: true,
},

      {
  label: "Carga Inicial",
  icon: Activity,
  to: "/v2/assurant/estoque/carga-inicial",
  exact: true,
  enabled: true,
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

const STATUS_LABELS = {
  aguardando_alocacao:
    "Aguardando alocação",

  aguardando_definicao_produto:
    "Aguardando definição",

  alocado: "Alocado",
  em_picking: "Picking",
  em_analise: "Em análise",
  embalado: "Embalado",
  faturado: "Faturado",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

function fmtNumber(value) {
  return Number(
    value || 0
  ).toLocaleString("pt-BR");
}

function fmtDateTime(value) {
  if (!value) return "—";

  try {
    return new Date(
      value
    ).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function getStatusLabel(status) {
  if (!status) {
    return "Não informado";
  }

  return (
    STATUS_LABELS[status] ||
    status
      .replaceAll("_", " ")
      .replace(
        /\b\w/g,
        (letter) =>
          letter.toUpperCase()
      )
  );
}

function getStatusClasses(status) {
  switch (status) {
    case "faturado":
    case "concluido":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";

    case "alocado":
      return "bg-violet-50 text-violet-700 ring-violet-200";

    case "em_picking":
      return "bg-amber-50 text-amber-700 ring-amber-200";

    case "em_analise":
      return "bg-rose-50 text-rose-700 ring-rose-200";

    case "embalado":
      return "bg-blue-50 text-blue-700 ring-blue-200";

    case "aguardando_definicao_produto":
    case "aguardando_alocacao":
      return "bg-slate-100 text-slate-600 ring-slate-200";

    default:
      return "bg-slate-100 text-slate-600 ring-slate-200";
  }
}

function Logo({
  collapsed = false,
}) {
  return (
    <div
      className={`flex items-center ${
        collapsed
          ? "justify-center"
          : "gap-3"
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/15">
        <span className="text-sm font-black tracking-tight text-white">
          LP
        </span>
      </div>

      {!collapsed && (
        <div className="min-w-0">
          <div className="truncate text-[17px] font-black tracking-tight text-white">
            liquida
            <span className="text-violet-300">
              preço
            </span>
          </div>

          <div className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-white/45">
            Liquida System
          </div>
        </div>
      )}
    </div>
  );
}

function DisabledSidebarItem({
  item,
  collapsed,
}) {
  const Icon = item.icon;

  return (
    <div
      title={
        collapsed
          ? `${item.label} — Em migração`
          : undefined
      }
      className={`
        group relative flex h-11 cursor-default items-center rounded-xl
        text-white/35 transition
        ${
          collapsed
            ? "justify-center px-2"
            : "gap-3 px-3"
        }
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

function SimpleSidebarItem({
  item,
  collapsed,
  closeMobile,
}) {
  const Icon = item.icon;

  return (
    <NavLink
      to={item.to}
      end={item.exact}
      onClick={
        closeMobile
      }
      title={
        collapsed
          ? item.label
          : undefined
      }
      className={({
        isActive,
      }) => `
        group relative flex h-11 items-center rounded-xl transition-all
        ${
          collapsed
            ? "justify-center px-2"
            : "gap-3 px-3"
        }

        ${
          isActive
            ? "bg-white text-[#4C1D95] shadow-sm"
            : "text-white/70 hover:bg-white/10 hover:text-white"
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

function ExpandableSidebarItem({
  item,
  collapsed,
  closeMobile,
  pathname,
}) {
  const Icon = item.icon;

  const hasActiveChild =
    item.children.some(
      (child) =>
        pathname === child.to
    );

  const [open, setOpen] =
    useState(
      hasActiveChild
    );

  useEffect(() => {
    if (hasActiveChild) {
      setOpen(true);
    }
  }, [hasActiveChild]);

  if (collapsed) {
    const firstChild =
      item.children[0];

    return (
      <NavLink
        to={firstChild.to}
        title={item.label}
        onClick={
          closeMobile
        }
        className={`
          group relative flex h-11 items-center justify-center rounded-xl px-2 transition-all
          ${
            hasActiveChild
              ? "bg-white text-[#4C1D95] shadow-sm"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }
        `}
      >
        <Icon className="h-[18px] w-[18px]" />

        <div className="pointer-events-none absolute left-[66px] z-[100] hidden whitespace-nowrap rounded-lg bg-slate-950 px-3 py-2 text-xs font-semibold text-white shadow-xl group-hover:block">
          {item.label}

          <div className="mt-1 text-[10px] font-medium text-white/45">
            Clique para abrir
          </div>
        </div>
      </NavLink>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        className={`
          flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left transition-all
          ${
            hasActiveChild
              ? "bg-white/10 text-white"
              : "text-white/70 hover:bg-white/10 hover:text-white"
          }
        `}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />

        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {item.label}
        </span>

        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-200 ${
            open
              ? "rotate-180"
              : ""
          }`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 ${
          open
            ? "mt-1 max-h-[360px] opacity-100"
            : "max-h-0 opacity-0"
        }`}
      >
        <div className="ml-[21px] border-l border-white/10 pl-3">
          <div className="space-y-1 py-1">
            {item.children.map(
              (child) => {
                const ChildIcon =
                  child.icon;

                return (
                  <NavLink
                    key={
                      child.to
                    }
                    to={
                      child.to
                    }
                    end={
                      child.exact
                    }
                    onClick={
                      closeMobile
                    }
                    className={({
                      isActive,
                    }) => `
                      flex min-h-10 items-center gap-2.5 rounded-xl px-3 py-2 text-xs transition
                      ${
                        isActive
                          ? "bg-white text-[#4C1D95] shadow-sm font-bold"
                          : "text-white/55 hover:bg-white/8 hover:text-white"
                      }
                    `}
                  >
                    <ChildIcon className="h-4 w-4 shrink-0" />

                    <span className="min-w-0 truncate">
                      {
                        child.label
                      }
                    </span>
                  </NavLink>
                );
              }
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarMenuItem({
  item,
  collapsed,
  closeMobile,
  pathname,
}) {
  if (!item.enabled) {
    return (
      <DisabledSidebarItem
        item={item}
        collapsed={
          collapsed
        }
      />
    );
  }

  if (
    item.children?.length
  ) {
    return (
      <ExpandableSidebarItem
        item={item}
        collapsed={
          collapsed
        }
        closeMobile={
          closeMobile
        }
        pathname={
          pathname
        }
      />
    );
  }

  return (
    <SimpleSidebarItem
      item={item}
      collapsed={
        collapsed
      }
      closeMobile={
        closeMobile
      }
    />
  );
}

function SidebarGroup({
  group,
  collapsed,
  closeMobile,
  pathname,
}) {
  const temRotaAtiva =
    group.items.some(
      (item) =>
        pathname === item.to ||
        item.children?.some(
          (child) =>
            pathname === child.to
        )
    );

  const [
    open,
    setOpen,
  ] = useState(
    temRotaAtiva
  );

  useEffect(() => {
    if (temRotaAtiva) {
      setOpen(true);
    }
  }, [temRotaAtiva]);

  if (!group.label) {
    return (
      <div className="space-y-1">
        {group.items.map(
          (item) => (
            <SidebarMenuItem
              key={item.label}
              item={item}
              collapsed={
                collapsed
              }
              closeMobile={
                closeMobile
              }
              pathname={
                pathname
              }
            />
          )
        )}
      </div>
    );
  }

  if (collapsed) {
    return (
      <div>
        <div className="mx-auto mb-2 h-px w-7 bg-white/10" />

        <div className="space-y-1">
          {group.items.map(
            (item) => (
              <SidebarMenuItem
                key={item.label}
                item={item}
                collapsed
                closeMobile={
                  closeMobile
                }
                pathname={
                  pathname
                }
              />
            )
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() =>
          setOpen(
            (current) =>
              !current
          )
        }
        className={`
          flex h-9 w-full items-center
          justify-between rounded-lg
          px-3 text-left transition
          ${
            temRotaAtiva
              ? "bg-white/5 text-violet-200"
              : "text-white/40 hover:bg-white/5 hover:text-white/70"
          }
        `}
      >
        <span className="text-[10px] font-black tracking-[0.16em]">
          {group.label}
        </span>

        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform ${
            open
              ? "rotate-180"
              : ""
          }`}
        />
      </button>

      <div
        className={`overflow-hidden ${
          open
            ? "mt-1 max-h-[700px] opacity-100"
            : "max-h-0 opacity-0"
        }`}
      >
        <div className="space-y-1">
          {group.items.map(
            (item) => (
              <SidebarMenuItem
                key={item.label}
                item={item}
                collapsed={
                  collapsed
                }
                closeMobile={
                  closeMobile
                }
                pathname={
                  pathname
                }
              />
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SidebarContent({
  collapsed,
  onToggleCollapsed,
  onCloseMobile,
  onBack,
  profile,
  onLogout,
  pathname,
  mobile = false,
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={`
          flex h-[72px] shrink-0 items-center border-b border-white/10

          ${
            collapsed
              ? "justify-center px-3"
              : "justify-between px-5"
          }
        `}
      >
        <Logo
          collapsed={
            collapsed
          }
        />

        {!collapsed &&
          mobile && (
            <button
              type="button"
              onClick={
                onCloseMobile
              }
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
          ${
            collapsed
              ? "px-3 pt-4"
              : "px-4 pt-5"
          }
        `}
      >
        {!collapsed ? (
          <div className="rounded-xl bg-white/5 px-3.5 py-3 ring-1 ring-white/10">
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
            className="flex h-10 items-center justify-center rounded-xl bg-white/5 text-violet-200 ring-1 ring-white/10"
          >
            <Warehouse className="h-[18px] w-[18px]" />
          </div>
        )}
      </div>

      <nav
        className={`
          assurant-sidebar-scroll mt-4 flex-1 overflow-y-auto overflow-x-hidden pb-4

          ${
            collapsed
              ? "px-3"
              : "px-4 pr-3"
          }
        `}
      >
        <div className="space-y-5">
          {MENU_GROUPS.map(
  (
    group,
    groupIndex
  ) => (
    <SidebarGroup
      key={
        group.label ||
        groupIndex
      }
      group={
        group
      }
      collapsed={
        collapsed
      }
      closeMobile={
        onCloseMobile
      }
      pathname={
        pathname
      }
    />
  )
)}
        </div>
      </nav>

      <div
        className={`
          shrink-0 border-t border-white/10 py-3

          ${
            collapsed
              ? "px-3"
              : "px-4"
          }
        `}
      >
        {!collapsed && (
          <div className="mb-2 rounded-xl px-3 py-2">
            <div className="truncate text-xs font-semibold text-white/75">
              {profile?.nome ||
                "Usuário"}
            </div>

            <div className="mt-0.5 truncate text-[10px] text-white/35">
              Assurant Warehouse
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={onLogout}
          title={
            collapsed
              ? "Sair"
              : undefined
          }
          className={`
            flex h-10 w-full items-center rounded-xl text-white/50 transition
            hover:bg-white/10 hover:text-white

            ${
              collapsed
                ? "justify-center"
                : "gap-3 px-3"
            }
          `}
        >
          <LogOut className="h-[17px] w-[17px] shrink-0" />

          {!collapsed && (
            <span className="text-xs font-semibold">
              Sair
            </span>
          )}
        </button>
      </div>
    </div>
  );
}

function Topbar({
  onOpenMobileMenu,
  collapsed,
  onToggleCollapsed,
  profile,
  searchValue,
  onSearchValueChange,
}) {
  return (
    <header className="sticky top-0 z-30 h-[72px] border-b border-slate-200/80 bg-white/95 backdrop-blur">
      <div className="flex h-full items-center gap-4 px-4 lg:px-6">
        <button
          type="button"
          onClick={
            onOpenMobileMenu
          }
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 transition hover:bg-slate-50 lg:hidden"
          aria-label="Abrir menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={
            onToggleCollapsed
          }
          className="hidden rounded-xl border border-slate-200 p-2.5 text-slate-500 transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700 lg:flex"
          aria-label={
            collapsed
              ? "Expandir menu"
              : "Recolher menu"
          }
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
            value={
              searchValue
            }
            onChange={(
              event
            ) =>
              onSearchValueChange(
                event
                  .target
                  .value
              )
            }
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
                {profile?.nome ||
                  "Usuário"}
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

function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  variant = "violet",
}) {
  const variants = {
    violet: {
      icon:
        "bg-violet-50 text-violet-700 ring-violet-100",

      line:
        "from-violet-500 to-fuchsia-400",
    },

    emerald: {
      icon:
        "bg-emerald-50 text-emerald-700 ring-emerald-100",

      line:
        "from-emerald-500 to-teal-400",
    },

    amber: {
      icon:
        "bg-amber-50 text-amber-700 ring-amber-100",

      line:
        "from-amber-500 to-orange-400",
    },

    rose: {
      icon:
        "bg-rose-50 text-rose-700 ring-rose-100",

      line:
        "from-rose-500 to-pink-400",
    },
  };

  const cfg =
    variants[variant] ||
    variants.violet;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div
        className={`absolute bottom-0 left-0 h-[3px] w-full bg-gradient-to-r ${cfg.line}`}
      />

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-semibold text-slate-500">
            {label}
          </div>

          <div className="mt-2 text-[28px] font-black tracking-tight text-slate-900">
            {value}
          </div>

          <div className="mt-1 text-[11px] font-medium text-slate-400">
            {helper}
          </div>
        </div>

        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ${cfg.icon}`}
        >
          <Icon className="h-[19px] w-[19px]" />
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className = "",
}) {
  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm ${className}`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-black text-slate-800">
            {title}
          </h2>

          {subtitle && (
            <p className="mt-0.5 text-[11px] text-slate-400">
              {subtitle}
            </p>
          )}
        </div>

        {action}
      </div>

      {children}
    </section>
  );
}

function PipelineStage({
  icon: Icon,
  label,
  value,
  detail,
  accent,
  last = false,
}) {
  return (
    <>
      <div className="min-w-[112px] flex-1 text-center">
        <div
          className={`mx-auto flex h-11 w-11 items-center justify-center rounded-full ${accent}`}
        >
          <Icon className="h-[18px] w-[18px]" />
        </div>

        <div className="mt-2 text-[11px] font-bold text-slate-500">
          {label}
        </div>

        <div className="mt-0.5 text-xl font-black text-slate-900">
          {fmtNumber(
            value
          )}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          {detail}
        </div>
      </div>

      {!last && (
        <ChevronRight className="mx-1 h-4 w-4 shrink-0 text-slate-300" />
      )}
    </>
  );
}

function AlertRow({
  icon: Icon,
  title,
  description,
  value,
  variant = "amber",
}) {
  const variants = {
    amber: {
      icon:
        "bg-amber-50 text-amber-600",

      badge:
        "bg-amber-50 text-amber-700",
    },

    rose: {
      icon:
        "bg-rose-50 text-rose-600",

      badge:
        "bg-rose-50 text-rose-700",
    },

    violet: {
      icon:
        "bg-violet-50 text-violet-600",

      badge:
        "bg-violet-50 text-violet-700",
    },
  };

  const cfg =
    variants[variant] ||
    variants.amber;

  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3 last:border-0">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${cfg.icon}`}
      >
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-bold text-slate-700">
          {title}
        </div>

        <div className="mt-0.5 truncate text-[10px] text-slate-400">
          {
            description
          }
        </div>
      </div>

      <div
        className={`rounded-lg px-2 py-1 text-xs font-black ${cfg.badge}`}
      >
        {fmtNumber(
          value
        )}
      </div>
    </div>
  );
}

function StatusBadge({
  status,
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${getStatusClasses(
        status
      )}`}
    >
      {getStatusLabel(
        status
      )}
    </span>
  );
}

function WmsOccupancy({
  total,
  occupied,
  blocked,
}) {
  const occupiedPercent =
    total > 0
      ? Math.min(
          100,
          (occupied /
            total) *
            100
        )
      : 0;

  const blockedPercent =
    total > 0
      ? Math.min(
          100,
          (blocked /
            total) *
            100
        )
      : 0;

  const cells = 36;

  const occupiedCells =
    Math.round(
      (occupiedPercent /
        100) *
        cells
    );

  const blockedCells =
    Math.min(
      cells -
        occupiedCells,

      Math.round(
        (blockedPercent /
          100) *
          cells
      )
    );

  return (
    <div className="p-5">
      <div className="grid grid-cols-9 gap-1.5">
        {Array.from({
          length: cells,
        }).map(
          (
            _,
            index
          ) => {
            const occupiedCell =
              index <
              occupiedCells;

            const blockedCell =
              index >=
                occupiedCells &&
              index <
                occupiedCells +
                  blockedCells;

            return (
              <div
                key={
                  index
                }
                className={`h-8 rounded-md border ${
                  blockedCell
                    ? "border-rose-200 bg-rose-100"
                    : occupiedCell
                    ? "border-emerald-200 bg-emerald-100"
                    : "border-slate-200 bg-slate-50"
                }`}
              />
            );
          }
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-emerald-200 ring-1 ring-emerald-300" />
          Ocupado
        </div>

        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-slate-100 ring-1 ring-slate-300" />
          Disponível
        </div>

        <div className="flex items-center gap-2 text-[10px] font-semibold text-slate-500">
          <span className="h-2.5 w-2.5 rounded-sm bg-rose-100 ring-1 ring-rose-300" />
          Bloqueado
        </div>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Ocupação
          </div>

          <div className="mt-1 text-lg font-black text-slate-800">
            {occupiedPercent.toFixed(
              1
            )}
            %
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Ocupadas
          </div>

          <div className="mt-1 text-lg font-black text-slate-800">
            {fmtNumber(
              occupied
            )}
          </div>
        </div>

        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Bloqueadas
          </div>

          <div className="mt-1 text-lg font-black text-slate-800">
            {fmtNumber(
              blocked
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="animate-pulse space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({
          length: 4,
        }).map(
          (
            _,
            index
          ) => (
            <div
              key={
                index
              }
              className="h-32 rounded-2xl bg-slate-200/60"
            />
          )
        )}
      </div>

      <div className="h-48 rounded-2xl bg-slate-200/60" />

      <div className="grid gap-5 xl:grid-cols-3">
        <div className="h-80 rounded-2xl bg-slate-200/60 xl:col-span-2" />

        <div className="h-80 rounded-2xl bg-slate-200/60" />
      </div>
    </div>
  );
}

function AssurantDashboard({
  searchValue,
}) {
  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    warning,
    setWarning,
  ] = useState("");

  const [
    updatedAt,
    setUpdatedAt,
  ] = useState(null);

  const [
    metrics,
    setMetrics,
  ] = useState({
    b2cActive: 0,
    b2cAnalysis: 0,
    b2cDefinition: 0,
    b2cBilled: 0,

    triageTotal: 0,
    awaitingStorage: 0,

    wmsConfirmed: 0,

    addressTotal: 0,
    addressOccupied: 0,
    addressBlocked: 0,

    activeReservations: 0,
    analysisReservations: 0,
  });

  const [
    recentOrders,
    setRecentOrders,
  ] = useState([]);

  const loadDashboard =
    useCallback(
      async () => {
        setLoading(true);
        setWarning("");

        const results =
          await Promise.all([
            supabase
              .from(
                "pedidos_b2c"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .in(
                "status",
                ACTIVE_B2C_STATUSES
              ),

            supabase
              .from(
                "pedidos_b2c"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "status",
                "em_analise"
              ),

            supabase
              .from(
                "pedidos_b2c"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "status",
                "aguardando_definicao_produto"
              ),

            supabase
              .from(
                "pedidos_b2c"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .not(
                "faturado_em",
                "is",
                null
              ),

            supabase
              .from(
                "assurant_triagem"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              ),

            supabase
              .from(
                "assurant_triagem"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "status_atual",
                "Aguardando armazenagem"
              ),

            supabase
              .from(
                "wms_alocacoes"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "status",
                "confirmado"
              ),

            supabase
              .from(
                "wms_enderecos"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "ativo",
                true
              ),

            supabase
              .from(
                "wms_enderecos"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "ativo",
                true
              )
              .eq(
                "status",
                "ocupado"
              ),

            supabase
              .from(
                "wms_enderecos"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .eq(
                "ativo",
                true
              )
              .eq(
                "status",
                "bloqueado"
              ),

            supabase
              .from(
                "wms_reservas_saida"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .in(
                "status",
                [
                  "reservado",
                  "analise",
                  "reconciliar",
                ]
              ),

            supabase
              .from(
                "wms_reservas_saida"
              )
              .select(
                "id",
                {
                  count:
                    "exact",
                  head: true,
                }
              )
              .in(
                "status",
                [
                  "analise",
                  "reconciliar",
                ]
              ),

            supabase
              .from(
                "pedidos_b2c"
              )
              .select(`
                id,
                id_anymarket,
                marketplace,
                cliente,
                status,
                status_anymarket,
                sku_produto,
                imei_alocado,
                atualizado_em
              `)
              .order(
                "atualizado_em",
                {
                  ascending:
                    false,
                }
              )
              .limit(8),
          ]);

        const [
          b2cActive,
          b2cAnalysis,
          b2cDefinition,
          b2cBilled,
          triageTotal,
          awaitingStorage,
          wmsConfirmed,
          addressTotal,
          addressOccupied,
          addressBlocked,
          activeReservations,
          analysisReservations,
          recent,
        ] = results;

        const queryErrors =
          results
            .map(
              (
                result
              ) =>
                result?.error
            )
            .filter(
              Boolean
            );

        if (
          queryErrors.length >
          0
        ) {
          console.warn(
            "Dashboard Assurant V2 - consultas com erro:",
            queryErrors
          );

          setWarning(
            "Alguns indicadores não puderam ser carregados. Os demais dados continuam disponíveis."
          );
        }

        setMetrics({
          b2cActive:
            b2cActive.count ||
            0,

          b2cAnalysis:
            b2cAnalysis.count ||
            0,

          b2cDefinition:
            b2cDefinition.count ||
            0,

          b2cBilled:
            b2cBilled.count ||
            0,

          triageTotal:
            triageTotal.count ||
            0,

          awaitingStorage:
            awaitingStorage.count ||
            0,

          wmsConfirmed:
            wmsConfirmed.count ||
            0,

          addressTotal:
            addressTotal.count ||
            0,

          addressOccupied:
            addressOccupied.count ||
            0,

          addressBlocked:
            addressBlocked.count ||
            0,

          activeReservations:
            activeReservations.count ||
            0,

          analysisReservations:
            analysisReservations.count ||
            0,
        });

        setRecentOrders(
          recent.data || []
        );

        setUpdatedAt(
          new Date()
        );

        setLoading(false);
      },
      []
    );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const filteredOrders =
    useMemo(() => {
      const term =
        searchValue
          .trim()
          .toLowerCase();

      if (!term) {
        return recentOrders;
      }

      return recentOrders.filter(
        (
          order
        ) => {
          const values = [
            order.id_anymarket,
            order.marketplace,
            order.cliente,
            order.status,
            order.status_anymarket,
            order.sku_produto,
            order.imei_alocado,
          ];

          return values.some(
            (
              value
            ) =>
              String(
                value || ""
              )
                .toLowerCase()
                .includes(
                  term
                )
          );
        }
      );
    }, [
      recentOrders,
      searchValue,
    ]);

  const occupancy =
    metrics.addressTotal >
    0
      ? (
          (metrics.addressOccupied /
            metrics.addressTotal) *
          100
        ).toFixed(1)
      : "0,0";

  if (loading) {
    return (
      <DashboardSkeleton />
    );
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
              Assurant Warehouse
            </span>

            <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
              V2 · Piloto
            </span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-slate-900 lg:text-[30px]">
            Painel Operacional
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Visão executiva e operacional do Assurant Warehouse.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {updatedAt && (
            <div className="hidden text-right sm:block">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Última atualização
              </div>

              <div className="mt-0.5 text-xs font-bold text-slate-600">
                {updatedAt.toLocaleTimeString(
                  "pt-BR",
                  {
                    hour:
                      "2-digit",
                    minute:
                      "2-digit",
                  }
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={
              loadDashboard
            }
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-600 shadow-sm transition hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700"
          >
            <RefreshCw className="h-4 w-4" />

            Atualizar
          </button>
        </div>
      </div>

      {warning && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />

          {warning}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={
            ShoppingCart
          }
          label="Pedidos B2C em operação"
          value={fmtNumber(
            metrics.b2cActive
          )}
          helper="Pedidos ainda em fluxo operacional"
          variant="violet"
        />

        <KpiCard
          icon={
            Warehouse
          }
          label="Estoque WMS confirmado"
          value={fmtNumber(
            metrics.wmsConfirmed
          )}
          helper="IMEIs com alocação física confirmada"
          variant="emerald"
        />

        <KpiCard
          icon={
            Package
          }
          label="Ocupação do armazém"
          value={`${occupancy}%`}
          helper={`${fmtNumber(
            metrics.addressOccupied
          )} posições ocupadas`}
          variant="amber"
        />

        <KpiCard
          icon={
            AlertTriangle
          }
          label="Itens em análise"
          value={fmtNumber(
            metrics.b2cAnalysis
          )}
          helper="Pedidos B2C atualmente em análise"
          variant="rose"
        />
      </div>

      <SectionCard
        title="Pipeline Operacional"
        subtitle="Indicadores reais das etapas atualmente disponíveis no Liquida"
        action={
          <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
            Leitura em tempo real
          </span>
        }
      >
        <div className="overflow-x-auto px-5 py-6">
          <div className="flex min-w-[760px] items-start">
            <PipelineStage
              icon={
                FlaskConical
              }
              label="Triagens"
              value={
                metrics.triageTotal
              }
              detail="Registros acumulados"
              accent="bg-violet-50 text-violet-700"
            />

            <PipelineStage
              icon={
                Clock3
              }
              label="Ag. armazenagem"
              value={
                metrics.awaitingStorage
              }
              detail="Fila atual"
              accent="bg-amber-50 text-amber-700"
            />

            <PipelineStage
              icon={
                Warehouse
              }
              label="WMS"
              value={
                metrics.wmsConfirmed
              }
              detail="Confirmados"
              accent="bg-emerald-50 text-emerald-700"
            />

            <PipelineStage
              icon={
                ShoppingCart
              }
              label="Pedidos B2C"
              value={
                metrics.b2cActive
              }
              detail="Em operação"
              accent="bg-blue-50 text-blue-700"
            />

            <PipelineStage
              icon={
                Package
              }
              label="Reservas saída"
              value={
                metrics.activeReservations
              }
              detail="Ativas no WMS"
              accent="bg-fuchsia-50 text-fuchsia-700"
            />

            <PipelineStage
              icon={
                CheckCircle2
              }
              label="Faturados"
              value={
                metrics.b2cBilled
              }
              detail="Histórico B2C"
              accent="bg-teal-50 text-teal-700"
              last
            />
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          title="Últimos pedidos B2C"
          subtitle="Atualizações mais recentes registradas no sistema"
          className="xl:col-span-2"
          action={
            <span className="text-[10px] font-semibold text-slate-400">
              {
                filteredOrders.length
              }{" "}
              registros
            </span>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-left">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Pedido
                  </th>

                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Cliente
                  </th>

                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Canal
                  </th>

                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    SKU / IMEI
                  </th>

                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Status
                  </th>

                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Atualização
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredOrders.length >
                0 ? (
                  filteredOrders.map(
                    (
                      order
                    ) => (
                      <tr
                        key={
                          order.id
                        }
                        className="border-b border-slate-100 last:border-0 hover:bg-violet-50/30"
                      >
                        <td className="px-4 py-3">
                          <div className="text-xs font-black text-violet-700">
                            {order.id_anymarket ||
                              "—"}
                          </div>

                          <div className="mt-0.5 text-[10px] text-slate-400">
                            {order.status_anymarket ||
                              "AnyMarket"}
                          </div>
                        </td>

                        <td className="max-w-[190px] px-4 py-3">
                          <div className="truncate text-xs font-semibold text-slate-700">
                            {order.cliente ||
                              "—"}
                          </div>
                        </td>

                        <td className="px-4 py-3 text-xs text-slate-500">
                          {order.marketplace ||
                            "—"}
                        </td>

                        <td className="px-4 py-3">
                          <div className="max-w-[180px] truncate text-xs font-semibold text-slate-600">
                            {order.sku_produto ||
                              "—"}
                          </div>

                          <div className="mt-0.5 font-mono text-[10px] text-slate-400">
                            {order.imei_alocado ||
                              "Sem IMEI"}
                          </div>
                        </td>

                        <td className="px-4 py-3">
                          <StatusBadge
                            status={
                              order.status
                            }
                          />
                        </td>

                        <td className="whitespace-nowrap px-4 py-3 text-[11px] font-medium text-slate-500">
                          {fmtDateTime(
                            order.atualizado_em
                          )}
                        </td>
                      </tr>
                    )
                  )
                ) : (
                  <tr>
                    <td
                      colSpan={
                        6
                      }
                      className="px-5 py-10 text-center text-xs text-slate-400"
                    >
                      Nenhum pedido encontrado para a busca atual.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </SectionCard>

        <SectionCard
          title="Alertas e pendências"
          subtitle="Pontos que merecem atenção operacional"
        >
          <div>
            <AlertRow
              icon={
                AlertTriangle
              }
              title="Aguardando definição"
              description="Pedidos sem produto definido"
              value={
                metrics.b2cDefinition
              }
              variant="amber"
            />

            <AlertRow
              icon={
                ShieldCheck
              }
              title="Pedidos em análise"
              description="Pedidos segregados para avaliação"
              value={
                metrics.b2cAnalysis
              }
              variant="rose"
            />

            <AlertRow
              icon={
                Warehouse
              }
              title="Posições bloqueadas"
              description="Endereços indisponíveis no WMS"
              value={
                metrics.addressBlocked
              }
              variant="rose"
            />

            <AlertRow
              icon={
                RefreshCw
              }
              title="Reservas para analisar"
              description="Reservas WMS em análise ou reconciliação"
              value={
                metrics.analysisReservations
              }
              variant="violet"
            />
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Mapa do Armazém — WMS"
          subtitle="Representação proporcional da ocupação atual"
          action={
            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />

              Tempo real
            </div>
          }
        >
          <WmsOccupancy
            total={
              metrics.addressTotal
            }
            occupied={
              metrics.addressOccupied
            }
            blocked={
              metrics.addressBlocked
            }
          />
        </SectionCard>

        <SectionCard
          title="Resumo da operação"
          subtitle="Indicadores de acompanhamento rápido"
        >
          <div className="grid gap-4 p-5 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Aguardando armazenagem
                </div>

                <Clock3 className="h-4 w-4 text-amber-500" />
              </div>

              <div className="mt-3 text-2xl font-black text-slate-800">
                {fmtNumber(
                  metrics.awaitingStorage
                )}
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Status atual na triagem
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Reservas de saída
                </div>

                <Package className="h-4 w-4 text-violet-500" />
              </div>

              <div className="mt-3 text-2xl font-black text-slate-800">
                {fmtNumber(
                  metrics.activeReservations
                )}
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Reservado, análise ou reconciliação
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Posições ativas
                </div>

                <Warehouse className="h-4 w-4 text-emerald-500" />
              </div>

              <div className="mt-3 text-2xl font-black text-slate-800">
                {fmtNumber(
                  metrics.addressTotal
                )}
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Endereços ativos no WMS
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">
                  Faturados B2C
                </div>

                <CheckCircle2 className="h-4 w-4 text-teal-500" />
              </div>

              <div className="mt-3 text-2xl font-black text-slate-800">
                {fmtNumber(
                  metrics.b2cBilled
                )}
              </div>

              <div className="mt-1 text-[10px] text-slate-400">
                Registros com data de faturamento
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-4 py-3">
        <div className="flex items-center gap-2 text-[10px] font-semibold text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" />

          Somente leitura
        </div>

        <div className="text-[10px] font-medium text-slate-500">
          Nenhuma ação desta dashboard altera pedidos, WMS ou estoque.
        </div>
      </div>
    </div>
  );
}

export default function AssurantWorkspaceLayout() {
  const {
    profile,
  } = useAuth();

  const location =
    useLocation();

  const navigate =
    useNavigate();

  const [
    collapsed,
    setCollapsed,
  ] = useState(() => {
    try {
      return (
        localStorage.getItem(
          SIDEBAR_STORAGE_KEY
        ) === "true"
      );
    } catch {
      return false;
    }
  });

  const [
    mobileOpen,
    setMobileOpen,
  ] = useState(false);

  const [
    searchValue,
    setSearchValue,
  ] = useState("");

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_STORAGE_KEY,
        collapsed
          ? "true"
          : "false"
      );
    } catch {
      // Interface continua funcionando mesmo sem localStorage.
    }
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(
      false
    );
  }, [
    location.pathname,
  ]);

  const sidebarWidth =
    collapsed
      ? 76
      : 268;

  const hasNestedRoute =
    useMemo(
      () =>
        location.pathname !==
        "/v2/assurant",

      [
        location.pathname,
      ]
    );

  function toggleCollapsed() {
    setCollapsed(
      (
        current
      ) =>
        !current
    );
  }

  function backToLiquida() {
    navigate("/");
  }

  async function handleLogout() {
    await signOut();

    navigate(
      "/login"
    );
  }

  return (
    <div className="min-h-screen bg-[#F7F7FA] text-slate-900">
      <style>{`
        .assurant-sidebar-scroll {
          scrollbar-width: thin;
          scrollbar-color: #654A82 #211136;
          scrollbar-gutter: stable;
        }

        .assurant-sidebar-scroll::-webkit-scrollbar {
          width: 8px;
        }

        .assurant-sidebar-scroll::-webkit-scrollbar-track {
          background: #211136;
          border-radius: 999px;
        }

        .assurant-sidebar-scroll::-webkit-scrollbar-thumb {
          background: #654A82;
          border-radius: 999px;
          border: 2px solid #211136;
        }

        .assurant-sidebar-scroll::-webkit-scrollbar-thumb:hover {
          background: #80619F;
        }
      `}</style>

      <aside
        className="
          fixed inset-y-0 left-0 z-40 hidden border-r border-violet-950/30
          bg-[linear-gradient(180deg,#2A1747_0%,#211136_52%,#190D2A_100%)]
          lg:block
        "
        style={{
          width: `${sidebarWidth}px`,
        }}
      >
        <div className="relative h-full">
          <SidebarContent
            collapsed={
              collapsed
            }
            onToggleCollapsed={
              toggleCollapsed
            }
            profile={
              profile
            }
            onBack={
              backToLiquida
            }
            onLogout={
              handleLogout
            }
            pathname={
              location.pathname
            }
          />
        </div>
      </aside>

      {mobileOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-[2px] lg:hidden"
            onClick={() =>
              setMobileOpen(
                false
              )
            }
          />

          <aside className="fixed inset-y-0 left-0 z-50 w-[286px] bg-[linear-gradient(180deg,#2A1747_0%,#211136_52%,#190D2A_100%)] shadow-2xl lg:hidden">
            <SidebarContent
              collapsed={
                false
              }
              mobile
              onCloseMobile={() =>
                setMobileOpen(
                  false
                )
              }
              profile={
                profile
              }
              onBack={
                backToLiquida
              }
              onLogout={
                handleLogout
              }
              pathname={
                location.pathname
              }
            />
          </aside>
        </>
      )}

      <div
        className="min-h-screen lg:ml-[var(--sidebar-width)]"
        style={{
          "--sidebar-width": `${sidebarWidth}px`,
        }}
      >
        <Topbar
          onOpenMobileMenu={() =>
            setMobileOpen(
              true
            )
          }
          collapsed={
            collapsed
          }
          onToggleCollapsed={
            toggleCollapsed
          }
          profile={
            profile
          }
          searchValue={
            searchValue
          }
          onSearchValueChange={
            setSearchValue
          }
        />

        <main className="p-4 md:p-6 lg:p-7">
          {hasNestedRoute ? (
            <Outlet />
          ) : (
            <AssurantDashboard
              searchValue={
                searchValue
              }
            />
          )}
        </main>
      </div>
    </div>
  );
}