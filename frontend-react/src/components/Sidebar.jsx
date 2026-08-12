import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Upload, BarChart3, Bell, DollarSign, ClipboardList,
  ClipboardCheck, Wrench, Zap, Sparkles, FlaskConical,
  Camera, ShieldCheck, ChevronDown, ChevronRight, Layers,
  Truck, TrendingUp, Users, LogOut, X, ShoppingCart,
  Landmark, BarChart2, Lock, TrendingDown, Database,
  Package, Clock, LayoutDashboard, ScanLine, RefreshCw,
  PlusCircle, Box, Store, Send, FileText, Tag,
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

function NavItemDisabled({ icon: Icon, label, indent = false }) {
  return (
    <div className={`w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/30 cursor-not-allowed ${indent ? "pl-6" : ""}`}>
      <Icon className="h-4 w-4 shrink-0" />
      <span className="font-medium">{label}</span>
      <Lock className="h-3 w-3 ml-auto" />
    </div>
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

function SubGroup({ icon: Icon, label, paths, children }) {
  const location = useLocation();
  const isActive = paths.some((p) => location.pathname.startsWith(p));
  const [open, setOpen] = useState(isActive);

  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`w-full flex items-center justify-between rounded-2xl pl-6 pr-4 py-2.5 transition-all text-sm ${
          isActive ? "text-white font-bold" : "text-white/70 hover:text-white hover:bg-white/10"
        }`}
      >
        <div className="flex items-center gap-2">
          <Icon className="h-3.5 w-3.5 shrink-0" />
          <span className="font-semibold">{label}</span>
        </div>
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      </button>
      {open && (
        <div className="ml-4 border-l border-white/10 pl-2 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function LinhaBrancaMaster({ onClose }) {
  return (
    <CollapseGroup icon={Layers} label="Linha Branca" paths={["/linha-branca"]}>
      <NavItem to="/linha-branca/triagem"          icon={ClipboardCheck} label="Triagem"           indent onClick={onClose} />
      <NavItem to="/linha-branca/reparo-mecanico"  icon={Wrench}         label="Reparo Mecânico"   indent onClick={onClose} />
      <NavItem to="/linha-branca/reparo-eletrico"  icon={Zap}            label="Reparo Elétrico"   indent onClick={onClose} />
      <NavItem to="/linha-branca/reparo-estetico"  icon={Sparkles}       label="Reparo Estético"   indent onClick={onClose} />
      <NavItem to="/linha-branca/bancada-testes"   icon={FlaskConical}   label="Bancada de Testes" indent onClick={onClose} />
      <NavItem to="/linha-branca/limpeza"          icon={Camera}         label="Limpeza"           indent onClick={onClose} />
      <NavItem to="/linha-branca/qualidade"        icon={ShieldCheck}    label="Qualidade"         indent onClick={onClose} />
    </CollapseGroup>
  );
}

function LinhaBrancaRefrigeracao({ onClose }) {
  return (
    <CollapseGroup icon={Layers} label="Linha Branca" paths={["/linha-branca"]}>
      <NavItem to="/linha-branca/triagem"         icon={ClipboardCheck} label="Triagem"           indent onClick={onClose} />
      <NavItem to="/linha-branca/reparos"         icon={Wrench}         label="Reparos"           indent onClick={onClose} />
      <NavItem to="/linha-branca/bancada-testes"  icon={FlaskConical}   label="Bancada de Testes" indent onClick={onClose} />
      <NavItem to="/linha-branca/limpeza"         icon={Camera}         label="Limpeza"           indent onClick={onClose} />
      <NavItem to="/linha-branca/qualidade"       icon={ShieldCheck}    label="Qualidade"         indent onClick={onClose} />
    </CollapseGroup>
  );
}

function LinhaBrancaOutras({ onClose }) {
  return (
    <CollapseGroup icon={Layers} label="Linha Branca" paths={["/linha-branca"]}>
      <NavItem to="/linha-branca/triagem-reparos" icon={Wrench}       label="Triagem + Reparos" indent onClick={onClose} />
      <NavItem to="/linha-branca/bancada-testes"  icon={FlaskConical} label="Bancada de Testes" indent onClick={onClose} />
      <NavItem to="/linha-branca/limpeza"         icon={Camera}       label="Limpeza"           indent onClick={onClose} />
      <NavItem to="/linha-branca/qualidade"       icon={ShieldCheck}  label="Qualidade"         indent onClick={onClose} />
    </CollapseGroup>
  );
}

// ── Menu Operador Assurant ────────────────────────────────
function MenuAssurant({ onClose, telas }) {
  const tem = (rota) => telas?.includes(rota);
  return (
    <>
      {tem("/upload") && (
        <NavItem to="/upload" icon={Upload} label="Uploads" onClick={onClose} />
      )}
      <CollapseGroup icon={Package} label="Assurant Warehouse" paths={["/assurant", "/recebimento", "/triagens", "/wms", "/b2b", "/b2c", "/trocas-b2c", "/inventario"]}>
        {(tem("/recebimento") || tem("/recebimento/gestao")) && (
          <SubGroup icon={Truck} label="Recebimento" paths={["/recebimento"]}>
            {tem("/recebimento") && (
              <NavItem to="/recebimento"        icon={Truck}         label="Recebimento YBV"    indent onClick={onClose} />
            )}
            {tem("/recebimento/gestao") && (
              <NavItem to="/recebimento/gestao" icon={ClipboardList} label="Gestão Recebimento" indent onClick={onClose} />
            )}
          </SubGroup>
        )}
        {(
  tem("/triagens/entrada-oracle") ||
  tem("/triagens/funcional") ||
  tem("/triagens/laudo") ||
  tem("/triagens/cosmetica")
) && (
          <SubGroup icon={FlaskConical} label="Triagens" paths={["/triagens"]}>
            {tem("/triagens/funcional") && (
              <NavItem to="/triagens/funcional" icon={Wrench} label="Triagem Funcional" indent onClick={onClose} />
            )}
            {tem("/triagens/laudo") && (
              <NavItem to="/triagens/laudo" icon={FileText} label="Laudo" indent onClick={onClose} />
            )}
            {tem("/triagens/cosmetica") && (
  <NavItem
    to="/triagens/cosmetica"
    icon={Sparkles}
    label="Triagem Cosmética"
    indent
    onClick={onClose}
  />
)}

            {tem("/triagens/entrada-oracle") && (
              <NavItem to="/triagens/entrada-oracle" icon={ClipboardList} label="Entrada no Oracle" indent onClick={onClose} />
            )}
          </SubGroup>
        )}
        {(tem("/b2b/picking") || tem("/b2b/embalagem") || tem("/b2b/faturamento") || tem("/b2b/painel")) && (
          <SubGroup icon={Box} label="B2B" paths={["/b2b"]}>
            {tem("/b2b/picking") && (
              <NavItem to="/b2b/picking"        icon={ScanLine}        label="Picking B2B"       indent onClick={onClose} />
            )}
            {tem("/b2b/embalagem") && (
              <NavItem to="/b2b/embalagem"      icon={Box}             label="Embalagem B2B"     indent onClick={onClose} />
            )}
            {tem("/b2b/faturamento") && (
              <NavItem to="/b2b/faturamento"    icon={BarChart3}       label="Faturamento B2B"   indent onClick={onClose} />
            )}
            {tem("/b2b/painel") && (
              <NavItem to="/b2b/painel"         icon={LayoutDashboard} label="Painel Gestor B2B" indent onClick={onClose} />
            )}
          </SubGroup>
        )}
        {(tem("/b2c/pedidos") || tem("/b2c/embalagem") || tem("/b2c/painel") || tem("/b2c/etiquetas") || tem("/b2c/expedicao")) && (
          <SubGroup icon={Store} label="B2C" paths={["/b2c"]}>
            {tem("/b2c/pedidos") && (
              <NavItem to="/b2c/pedidos"        icon={Store}           label="Pedidos B2C"       indent onClick={onClose} />
            )}
            {tem("/b2c/embalagem") && (
              <NavItem to="/b2c/embalagem"      icon={Box}             label="Embalagem B2C"     indent onClick={onClose} />
            )}
            {tem("/b2c/painel") && (
              <NavItem to="/b2c/painel"         icon={LayoutDashboard} label="Painel Gestor B2C" indent onClick={onClose} />
            )}
            {tem("/b2c/etiquetas") && (
              <NavItem to="/b2c/etiquetas"      icon={Tag}             label="Etiquetas de envio" indent onClick={onClose} />
            )}
            {tem("/b2c/expedicao") && (
              <NavItem to="/b2c/expedicao"      icon={Send}            label="Expedição B2C"     indent onClick={onClose} />
            )}
          </SubGroup>
        )}
        {tem("/indicadores") && (
          <NavItem to="/indicadores" icon={BarChart3} label="Indicadores" onClick={onClose} />
        )}
        {(tem("/triagens/armazenagem") || tem("/wms/estoque") || tem("/inventario")) && (
          <SubGroup icon={ClipboardCheck} label="Gestão de Estoque" paths={["/triagens/armazenagem", "/wms", "/inventario"]}>
            {tem("/triagens/armazenagem") && (
              <NavItem to="/triagens/armazenagem" icon={Package} label="Armazenagem" indent onClick={onClose} />
            )}
            {tem("/wms/estoque") && (
              <NavItem to="/wms/estoque" icon={Package} label="Consulta Estoque WMS" indent onClick={onClose} />
            )}
            {tem("/inventario") && (
              <NavItem to="/inventario" icon={ClipboardCheck} label="Inventário Cíclico" indent onClick={onClose} />
            )}
          </SubGroup>
        )}
        {tem("/trocas-b2c/gestao") && (
          <SubGroup icon={RefreshCw} label="Trocas" paths={["/trocas-b2c"]}>
            <NavItem to="/trocas-b2c/gestao"    icon={RefreshCw}       label="Trocas B2C"        indent onClick={onClose} />
          </SubGroup>
        )}
      </CollapseGroup>
    </>
  );
}

// ── Menu Assurant Trocas (usuário externo) ────────────────
function MenuAssurantTrocas({ onClose }) {
  return (
    <CollapseGroup icon={RefreshCw} label="Trocas B2C" paths={["/trocas-b2c"]}>
      <NavItem to="/trocas-b2c/nova" icon={PlusCircle} label="Nova Solicitação" indent onClick={onClose} />
    </CollapseGroup>
  );
}

function SidebarContent({ profile, onClose, handleLogout }) {
  const { isRefrigeracao, isOutrasLinhas } = useAuth();
  const isMaster         = profile?.is_master;
  const isAssurant       = profile?.area_tecnica === "assurant" && !isMaster;
  const isAssurantTrocas = profile?.area_tecnica === "assurant_trocas" && !isMaster;

  function renderLinhaBranca() {
    if (isMaster)       return <LinhaBrancaMaster       onClose={onClose} />;
    if (isRefrigeracao) return <LinhaBrancaRefrigeracao  onClose={onClose} />;
    if (isOutrasLinhas) return <LinhaBrancaOutras        onClose={onClose} />;
    return null;
  }

  const perfilLabel = isMaster
    ? "Master"
    : isAssurant
    ? "Operador Assurant"
    : isAssurantTrocas
    ? "Assurant — Trocas"
    : profile?.area_tecnica || "Usuário";

  return (
    <>
      <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/10">
        <div className="text-xs text-white/70">Usuário</div>
        <div className="mt-0.5 text-sm font-bold">{profile?.nome || "..."}</div>
        <div className="text-xs text-white/50">{perfilLabel}</div>
      </div>

      <nav className="flex-1 space-y-1">

        {/* ── Master ── */}
        {isMaster && (
          <>
            <NavItem to="/upload" icon={Upload} label="Uploads" onClick={onClose} />

            <CollapseGroup
              icon={TrendingUp}
              label="Tesouraria"
              paths={["/analise-entrada", "/faturamento", "/financeiro"]}
            >
              <SubGroup icon={ShoppingCart} label="Vendas" paths={["/faturamento"]}>
                <NavItem to="/faturamento" icon={DollarSign} label="Faturamento" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={BarChart3} label="Compras" paths={["/analise-entrada"]}>
                <NavItem to="/analise-entrada" icon={BarChart3} label="Análise de Entrada" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={Landmark} label="Financeiro" paths={["/financeiro"]}>
                <NavItem to="/financeiro/fluxo-realizado" icon={BarChart2}    label="Fluxo Realizado"  indent onClick={onClose} />
                <NavItem to="/financeiro/contas-pagar"    icon={TrendingDown} label="Contas a Pagar"   indent onClick={onClose} />
                <NavItem to="/financeiro/contas-receber"  icon={TrendingUp}   label="Contas a Receber" indent onClick={onClose} />
                <NavItem to="/financeiro/carga-historica" icon={Database}     label="Carga Histórica"  indent onClick={onClose} />
                <NavItemDisabled icon={BarChart2} label="Conciliação"     indent />
                <NavItemDisabled icon={BarChart2} label="Fluxo Projetado" indent />
              </SubGroup>
              <SubGroup icon={BarChart2} label="Fechamentos" paths={["/fechamentos"]}>
                <NavItemDisabled icon={BarChart2} label="Em breve" indent />
              </SubGroup>
            </CollapseGroup>

            <CollapseGroup icon={Truck} label="Logística" paths={["/abertura-os"]}>
              <NavItem to="/abertura-os" icon={ClipboardList} label="Abertura de OS" indent onClick={onClose} />
            </CollapseGroup>

            <CollapseGroup icon={Package} label="Assurant Warehouse" paths={["/assurant", "/recebimento", "/triagens", "/wms", "/b2b", "/b2c", "/trocas-b2c", "/inventario"]}>
              <SubGroup icon={Truck} label="Recebimento" paths={["/recebimento"]}>
                <NavItem to="/recebimento"        icon={Truck}           label="Recebimento YBV"    indent onClick={onClose} />
                <NavItem to="/recebimento/gestao" icon={ClipboardList}   label="Gestão Recebimento" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={FlaskConical} label="Triagens" paths={["/triagens"]}>
                <NavItem to="/triagens/funcional"      icon={Wrench}        label="Triagem Funcional" indent onClick={onClose} />
                <NavItem to="/triagens/laudo"          icon={FileText}      label="Laudo"             indent onClick={onClose} />
                <NavItem to="/triagens/cosmetica"      icon={Sparkles}      label="Triagem Cosmética" indent onClick={onClose} />
                <NavItem to="/triagens/entrada-oracle" icon={ClipboardList} label="Entrada no Oracle" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={Box} label="B2B" paths={["/b2b"]}>
                <NavItem to="/b2b/picking"        icon={ScanLine}        label="Picking B2B"       indent onClick={onClose} />
                <NavItem to="/b2b/embalagem"      icon={Box}             label="Embalagem B2B"     indent onClick={onClose} />
                <NavItem to="/b2b/faturamento"    icon={BarChart3}       label="Faturamento B2B"   indent onClick={onClose} />
                <NavItem to="/b2b/painel"         icon={LayoutDashboard} label="Painel Gestor B2B" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={Store} label="B2C" paths={["/b2c"]}>
                <NavItem to="/b2c/pedidos"        icon={Store}           label="Pedidos B2C"       indent onClick={onClose} />
                <NavItem to="/b2c/embalagem"      icon={Box}             label="Embalagem B2C"     indent onClick={onClose} />
                <NavItem to="/b2c/painel"         icon={LayoutDashboard} label="Painel Gestor B2C" indent onClick={onClose} />
                <NavItem to="/b2c/etiquetas"      icon={Tag}             label="Etiquetas de envio" indent onClick={onClose} />
                <NavItem to="/b2c/expedicao"      icon={Send}            label="Expedição B2C"     indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={BarChart3} label="Indicadores" paths={["/indicadores"]}>
                <NavItem to="/indicadores"        icon={BarChart3}       label="Painel de Indicadores" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={ClipboardCheck} label="Gestão de Estoque" paths={["/triagens/armazenagem", "/wms", "/inventario"]}>
                <NavItem to="/triagens/armazenagem" icon={Package}        label="Armazenagem"         indent onClick={onClose} />
                <NavItem to="/wms/estoque"           icon={Package}        label="Consulta Estoque WMS" indent onClick={onClose} />
                <NavItem to="/inventario"             icon={ClipboardCheck} label="Inventário Cíclico" indent onClick={onClose} />
              </SubGroup>
              <SubGroup icon={RefreshCw} label="Trocas" paths={["/trocas-b2c"]}>
                <NavItem to="/trocas-b2c/nova"    icon={PlusCircle}      label="Trocas — Assurant" indent onClick={onClose} />
                <NavItem to="/trocas-b2c/gestao"  icon={RefreshCw}       label="Trocas — Furbtech" indent onClick={onClose} />
              </SubGroup>
            </CollapseGroup>
          </>
        )}

        {/* ── Operador Assurant ── */}
        {isAssurant && (
          <MenuAssurant onClose={onClose} telas={profile?.telas_permitidas} />
        )}

        {/* ── Assurant Trocas (externo) ── */}
        {isAssurantTrocas && (
          <MenuAssurantTrocas onClose={onClose} />
        )}

        {/* ── Linha Branca ── */}
        {renderLinhaBranca()}

        {/* ── Sistema (só master) ── */}
        {isMaster && (
          <>
            <div className="pt-2">
              <div className="px-4 text-xs font-bold text-white/50 uppercase">Sistema</div>
            </div>
            <NavItem to="/gerenciar-usuarios" icon={Users} label="Gerenciar Usuários" onClick={onClose} />
            <button className="w-full flex items-center gap-3 rounded-2xl px-4 py-3 text-white/60 cursor-default">
              <Bell className="h-4 w-4" />
              <span>Alertas</span>
            </button>
          </>
        )}
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
      <aside className="hidden lg:flex flex-col h-full w-[325px] gap-4 bg-[linear-gradient(180deg,#7F2D92_0%,#5B1E74_100%)] p-6 text-white overflow-y-auto">
        <div className="flex items-center justify-between">
          <Logo />
          <button onClick={onDesktopClose} className="text-white/70 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent profile={profile} onClose={onDesktopClose} handleLogout={handleLogout} />
      </aside>

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