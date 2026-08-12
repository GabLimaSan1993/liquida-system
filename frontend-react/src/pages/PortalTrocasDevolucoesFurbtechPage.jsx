import { useState } from "react";
import { ArrowLeftRight, RotateCcw, Warehouse } from "lucide-react";
import TrocasB2CFurbtechPage from "./TrocasB2CFurbtechPage.jsx";
import DevolucoesFurbtechPage from "./DevolucoesFurbtechPage.jsx";

export default function PortalTrocasDevolucoesFurbtechPage() {
  const [processo, setProcesso] = useState("trocas");

  return (
    <div className="space-y-5">
      <div className="rounded-3xl bg-gradient-to-r from-[#67217D] to-[#8F38A4] p-5 text-white shadow-lg shadow-purple-100 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-1 flex items-center gap-2 text-xs font-black uppercase tracking-wider text-purple-100">
              <Warehouse className="h-4 w-4" /> Portal Furbtech
            </div>
            <h1 className="text-2xl font-black">Trocas e Devoluções</h1>
            <p className="mt-1 text-sm text-white/75">
              Execução operacional dos processos da Furbtech.
            </p>
          </div>

          <div className="flex rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/20">
            <button
              type="button"
              onClick={() => setProcesso("trocas")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition sm:flex-none ${
                processo === "trocas"
                  ? "bg-white text-[#6B1F87] shadow-sm"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <ArrowLeftRight className="h-4 w-4" /> Trocas
            </button>
            <button
              type="button"
              onClick={() => setProcesso("devolucoes")}
              className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition sm:flex-none ${
                processo === "devolucoes"
                  ? "bg-white text-[#6B1F87] shadow-sm"
                  : "text-white/80 hover:bg-white/10 hover:text-white"
              }`}
            >
              <RotateCcw className="h-4 w-4" /> Devoluções
            </button>
          </div>
        </div>
      </div>

      {processo === "trocas"
        ? <TrocasB2CFurbtechPage />
        : <DevolucoesFurbtechPage />}
    </div>
  );
}