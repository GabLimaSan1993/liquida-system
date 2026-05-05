import { Outlet } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";

function StatBox({ title, value, helper }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-4 opacity-80">
      <div className="text-sm text-white/75">{title}</div>
      <div className="mt-2 text-2xl font-black text-white">{value}</div>
      <div className="mt-1 text-sm text-white/75">{helper}</div>
    </div>
  );
}

export default function MainLayout() {
  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#FAF6FF_0%,#F4ECFA_100%)] text-slate-900">
      <div className="grid min-h-screen lg:grid-cols-[325px_1fr]">
        <Sidebar />

        <main className="p-5 lg:p-6">
          <div className="space-y-6">
            <section className="rounded-[36px] border border-white/10 bg-[linear-gradient(135deg,#4C1D95_0%,#6B1F87_42%,#A12A7D_70%,#F97316_100%)] px-8 py-10 shadow-2xl shadow-purple-900/20">
              <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr] xl:items-start">
                <div>
                  <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
                    Liquida System
                  </h1>
                  <p className="mt-4 max-w-2xl text-lg text-white/90">
                    Pricing &amp; Margem
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <StatBox
                    title="Base"
                    value="Aging"
                    helper="Operação ativa"
                  />
                  <StatBox
                    title="Análises"
                    value="Drilldown"
                    helper="Fornecedor, lote e etapa"
                  />
                  <StatBox
                    title="Identificação"
                    value="IMEI/Serial"
                    helper="Rastreabilidade"
                  />
                  <StatBox
                    title="Objetivo"
                    value="Margem"
                    helper="Leitura gerencial"
                  />
                </div>
              </div>
            </section>

            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}