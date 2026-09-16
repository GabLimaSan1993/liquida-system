import { useState } from "react";
import { PackagePlus, TestTubeDiagonal } from "lucide-react";
import FormacaoKitClimatizacaoV2Page from "./FormacaoKitClimatizacaoV2Page.jsx";
import OperacaoClimatizacaoV2Page from "./OperacaoClimatizacaoV2Page.jsx";

export default function BancadaTestesClimatizacaoV2Page() {
  const [aba, setAba] = useState("kits");

  return (
    <div>
      <div className="mx-auto mb-6 flex max-w-[1500px] gap-2 rounded-2xl border border-slate-200 bg-white p-2">
        <button
          type="button"
          onClick={() => setAba("kits")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
            aba === "kits"
              ? "bg-[#4C1D95] text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <PackagePlus className="h-4 w-4" />
          Formação de Kits
        </button>

        <button
          type="button"
          onClick={() => setAba("operacao")}
          className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition ${
            aba === "operacao"
              ? "bg-[#4C1D95] text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <TestTubeDiagonal className="h-4 w-4" />
          Operação
        </button>
      </div>

      {aba === "kits" ? (
        <FormacaoKitClimatizacaoV2Page />
      ) : (
        <OperacaoClimatizacaoV2Page />
      )}
    </div>
  );
}
