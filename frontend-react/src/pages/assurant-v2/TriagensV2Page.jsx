import {
  lazy,
  Suspense,
} from "react";

import {
  ClipboardCheck,
  FileText,
  Loader2,
  ScanLine,
  ServerCog,
  ShieldCheck,
} from "lucide-react";

const TriagemFuncionalV2Page =
  lazy(() =>
    import(
      "./TriagemFuncionalV2Page.jsx"
    )
  );

const LaudoV2Page =
  lazy(() =>
    import(
      "./LaudoV2Page.jsx"
    )
  );

const TriagemCosmeticaV2Page =
  lazy(() =>
    import(
      "./TriagemCosmeticaV2Page.jsx"
    )
  );

const EntradaOracleV2Page =
  lazy(() =>
    import(
      "./EntradaOracleV2Page.jsx"
    )
  );

const CONFIG = {
  funcional: {
    label:
      "Triagem Funcional",

    description:
      "Identificação do aparelho, conferência de IMEI, testes funcionais, bateria e diagnóstico.",

    icon:
      ScanLine,

    component:
      TriagemFuncionalV2Page,
  },

  laudo: {
    label:
      "Laudo",

    description:
      "Registro fotográfico e formalização das evidências dos aparelhos com divergências ou defeitos.",

    icon:
      FileText,

    component:
      LaudoV2Page,
  },

  cosmetica: {
    label:
      "Triagem Cosmética",

    description:
      "Avaliação estética do aparelho, validação complementar e definição da classificação final.",

    icon:
      ClipboardCheck,

    component:
      TriagemCosmeticaV2Page,
  },

  oracle: {
    label:
      "Entrada Oracle",

    description:
      "Conciliação com o relatório AP, controle de RI e confirmação da entrada no Oracle.",

    icon:
      ServerCog,

    component:
      EntradaOracleV2Page,
  },
};

function LoadingScreen({
  label,
}) {
  return (
    <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="text-center">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>

        <div className="mt-3 text-xs font-black text-slate-700">
          Carregando {label}
        </div>

        <div className="mt-1 text-[10px] text-slate-400">
          Preparando a bancada operacional...
        </div>
      </div>
    </div>
  );
}

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
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-violet-100 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-violet-700">
            Assurant Warehouse
          </span>

          <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
            Triagens
          </span>

          <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.12em] text-emerald-700">
            <ShieldCheck className="h-3 w-3" />

            V2 Nativo
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

      <Suspense
        fallback={
          <LoadingScreen
            label={
              config.label
            }
          />
        }
      >
        <Component />
      </Suspense>
    </div>
  );
}