import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import { Menu } from "lucide-react";

const PAGE_META = {
  "/upload": { title: "Uploads", subtitle: "Envie as bases para análise" },
  "/analise-entrada": { title: "Análise de Entrada", subtitle: "Compras · Acompanhe entrada, disponibilidade, itens vendidos, PMV e rentabilidade" },
  "/faturamento": { title: "Faturamento", subtitle: "Vendas · Vendas, cliente, fornecedor, lote e rentabilidade" },
  "/abertura-os": { title: "Abertura de OS", subtitle: "Logística · Registro e acompanhamento de ordens de serviço" },
  "/financeiro/fluxo-realizado": { title: "Fluxo de Caixa Realizado", subtitle: "Financeiro · Lançamentos do extrato bancário" },
  "/financeiro/contas-pagar": { title: "Contas a Pagar", subtitle: "Financeiro · Obrigações financeiras sincronizadas do Tiny" },
  "/financeiro/contas-receber": { title: "Contas a Receber", subtitle: "Financeiro · Recebimentos sincronizados do Tiny" },
  "/financeiro/carga-historica": { title: "Carga Histórica", subtitle: "Financeiro · Sincronização histórica de dados do Tiny" },
  "/linha-branca/triagem": { title: "Triagem", subtitle: "Linha Branca · Classificação de entrada" },
  "/linha-branca/reparo-mecanico": { title: "Reparo Mecânico", subtitle: "Linha Branca · Execução de reparos mecânicos" },
  "/linha-branca/reparo-eletrico": { title: "Reparo Elétrico", subtitle: "Linha Branca · Execução de reparos elétricos" },
  "/linha-branca/reparo-estetico": { title: "Reparo Estético", subtitle: "Linha Branca · Execução de reparos estéticos" },
  "/linha-branca/bancada-testes": { title: "Bancada de Testes", subtitle: "Linha Branca · Aprovação ou retorno para reparo" },
  "/linha-branca/limpeza": { title: "Limpeza", subtitle: "Linha Branca · Registro fotográfico pós-limpeza" },
  "/linha-branca/qualidade": { title: "Qualidade", subtitle: "Linha Branca · Checklist de aprovação e descaracterização" },
  "/gerenciar-usuarios": { title: "Gerenciar Usuários", subtitle: "Sistema · Cadastro e permissões de acesso" },
};

export default function MainLayout() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: "Liquida System", subtitle: "" };
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FAF6FF_0%,#F4ECFA_100%)] text-slate-900">

      {/* Header fixo mobile */}
      <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between bg-white/90 backdrop-blur-md border-b border-purple-100 px-4 py-3 lg:hidden shadow-sm">
        <button
          onClick={() => setSidebarOpen(true)}
          className="rounded-xl bg-[#6B1F87] p-2.5 text-white shadow"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-purple-400">Liquida System</div>
          <div className="text-base font-black text-[#4C1D95] leading-tight">{meta.title}</div>
        </div>
        <div className="w-10" />
      </header>

      <div className="flex min-h-screen">

        {/* Sidebar desktop */}
        <div className={`hidden lg:block fixed top-0 left-0 h-full z-40 transition-transform duration-300 ${desktopOpen ? "translate-x-0" : "-translate-x-full"}`}
          style={{ width: "325px" }}
        >
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} onDesktopClose={() => setDesktopOpen(false)} />
        </div>

        {desktopOpen && (
          <div
            className="hidden lg:block fixed inset-0 z-30 bg-black/30"
            onClick={() => setDesktopOpen(false)}
          />
        )}

        {/* Sidebar mobile */}
        <div className="lg:hidden">
          <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        </div>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 pt-16 lg:pt-0 p-4 lg:p-6 min-h-screen w-full">
          <div className="space-y-6">

            {/* Header desktop */}
            <div className="hidden lg:flex items-center gap-4 border-b border-purple-100 pb-4">
              <button
                onClick={() => setDesktopOpen((o) => !o)}
                className="rounded-xl bg-[#6B1F87] p-2.5 text-white shadow hover:bg-[#5B1E74] transition shrink-0"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-400">
                  Liquida System
                </p>
                <h1 className="mt-0.5 text-3xl font-black tracking-tight text-[#4C1D95]">
                  {meta.title}
                </h1>
                {meta.subtitle && (
                  <p className="mt-0.5 text-sm text-slate-500">{meta.subtitle}</p>
                )}
              </div>
            </div>

            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}