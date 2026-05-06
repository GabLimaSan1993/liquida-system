import { useState } from "react";
import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import { Menu } from "lucide-react";

const PAGE_META = {
  "/upload": { title: "Uploads", subtitle: "Envie as bases para análise" },
  "/analise-entrada": { title: "Análise de Entrada", subtitle: "Acompanhe entrada, disponibilidade, itens vendidos, PMV e rentabilidade" },
  "/faturamento": { title: "Faturamento", subtitle: "Vendas, cliente, fornecedor, lote e rentabilidade" },
  "/abertura-os": { title: "Abertura de OS", subtitle: "Registro e acompanhamento de ordens de serviço" },
  "/linha-branca/triagem": { title: "Triagem", subtitle: "Linha Branca · Classificação de entrada" },
  "/linha-branca/reparo-mecanico": { title: "Reparo Mecânico", subtitle: "Linha Branca · Execução de reparos mecânicos" },
  "/linha-branca/reparo-eletrico": { title: "Reparo Elétrico", subtitle: "Linha Branca · Execução de reparos elétricos" },
  "/linha-branca/reparo-estetico": { title: "Reparo Estético", subtitle: "Linha Branca · Execução de reparos estéticos" },
  "/linha-branca/bancada-testes": { title: "Bancada de Testes", subtitle: "Linha Branca · Aprovação ou retorno para reparo" },
  "/linha-branca/limpeza": { title: "Limpeza", subtitle: "Linha Branca · Registro fotográfico pós-limpeza" },
  "/linha-branca/qualidade": { title: "Qualidade", subtitle: "Linha Branca · Checklist de aprovação e descaracterização" },
  "/gerenciar-usuarios": { title: "Gerenciar Usuários", subtitle: "Cadastro e permissões de acesso" },
};

export default function MainLayout() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: "Liquida System", subtitle: "" };
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FAF6FF_0%,#F4ECFA_100%)] text-slate-900">
      <div className="lg:grid lg:min-h-screen lg:grid-cols-[325px_1fr]">

        {/* Sidebar desktop */}
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Overlay mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="min-h-screen p-4 lg:p-6">

          {/* Header mobile */}
          <div className="flex items-center justify-between mb-4 lg:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-2xl bg-[#6B1F87] p-3 text-white shadow-lg"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="text-right">
              <div className="text-xs font-semibold uppercase tracking-widest text-purple-400">Liquida System</div>
              <div className="text-lg font-black text-[#4C1D95]">{meta.title}</div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Header desktop */}
            <div className="hidden lg:flex items-end justify-between border-b border-purple-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-400">
                  Liquida System
                </p>
                <h1 className="mt-1 text-3xl font-black tracking-tight text-[#4C1D95]">
                  {meta.title}
                </h1>
                {meta.subtitle && (
                  <p className="mt-1 text-sm text-slate-500">{meta.subtitle}</p>
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