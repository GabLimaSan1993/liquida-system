import {
  ClipboardCheck,
  FileText,
  FlaskConical,
  ScanLine,
  ServerCog,
} from "lucide-react";

import TriagemFuncionalPage from "../TriagemFuncionalPage.jsx";
import LaudoPage from "../LaudoPage.jsx";
import TriagemCosmeticaPage from "../TriagemCosmeticaPage.jsx";
import EntradaOraclePage from "../EntradaOraclePage.jsx";

const CONFIG = {
  funcional: {
    label: "Triagem Funcional",
    description:
      "Identificação do aparelho, conferência de IMEI, testes funcionais, bateria e diagnóstico.",
    icon: ScanLine,
    component: TriagemFuncionalPage,
  },

  laudo: {
    label: "Laudo",
    description:
      "Registro fotográfico e formalização de laudos para aparelhos com divergências ou defeitos.",
    icon: FileText,
    component: LaudoPage,
  },

  cosmetica: {
    label: "Triagem Cosmética",
    description:
      "Avaliação estética do aparelho e definição da classificação cosmética.",
    icon: ClipboardCheck,
    component: TriagemCosmeticaPage,
  },

  oracle: {
    label: "Entrada Oracle",
    description:
      "Controle dos aparelhos aguardando entrada, RI e confirmação no Oracle.",
    icon: ServerCog,
    component: EntradaOraclePage,
  },
};

export default function TriagensV2Page({
  tipo = "funcional",
}) {
  const config =
    CONFIG[tipo] ||
    CONFIG.funcional;

  const Icon =
    config.icon;

  const Component =
    config.component;

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      {/* Cabeçalho do Workspace */}
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            Assurant Warehouse
          </span>

          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Triagens
          </span>
        </div>

        <div className="mt-3 flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Icon className="h-5 w-5" />
          </div>

          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900 lg:text-[30px]">
              {config.label}
            </h1>

            <p className="mt-1 max-w-[900px] text-sm text-slate-500">
              {config.description}
            </p>
          </div>
        </div>
      </div>

      {/* Aviso de migração controlada */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-100 bg-violet-50/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-4 w-4 text-violet-600" />

          <div>
            <div className="text-[11px] font-bold text-violet-800">
              Operação integrada ao Warehouse V2
            </div>

            <div className="mt-0.5 text-[10px] text-violet-600/70">
              A lógica operacional permanece a mesma da versão atual durante esta etapa da migração.
            </div>
          </div>
        </div>

        <span className="rounded-lg bg-white px-2.5 py-1 text-[9px] font-black uppercase tracking-wide text-violet-600 ring-1 ring-violet-200">
          Migração controlada
        </span>
      </div>

      {/* Tela operacional atual */}
      <div className="triagem-v2-operacional">
        <Component />
      </div>
    </div>
  );
}