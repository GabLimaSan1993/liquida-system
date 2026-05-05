import { Outlet, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";

const PAGE_META = {
  "/upload": { title: "Uploads", subtitle: "Envie as bases para análise" },
  "/analise-entrada": { title: "Análise de Entrada", subtitle: "Acompanhe entrada, disponibilidade, itens vendidos, PMV e rentabilidade" },
  "/faturamento": { title: "Faturamento", subtitle: "Vendas, cliente, fornecedor, lote e rentabilidade" },
  "/abertura-os": { title: "Abertura de OS", subtitle: "Registro e acompanhamento de ordens de serviço" },
  "/linha-branca/triagem": { title: "Triagem", subtitle: "Linha Branca · Classificação de entrada" },
};

export default function MainLayout() {
  const { pathname } = useLocation();
  const meta = PAGE_META[pathname] ?? { title: "Liquida System", subtitle: "" };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FAF6FF_0%,#F4ECFA_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[325px_1fr]">
        <Sidebar />

        <main className="p-5 lg:p-6">
          <div className="space-y-6">

            {/* Header dinâmico */}
            <div className="flex items-end justify-between border-b border-purple-100 pb-4">
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