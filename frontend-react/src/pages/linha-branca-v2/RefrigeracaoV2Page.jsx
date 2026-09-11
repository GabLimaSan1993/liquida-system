import {
  ArrowRight,
  ClipboardCheck,
  FlaskConical,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";

const ETAPAS = [
  {
    titulo: "Triagem",
    descricao: "Recebimento técnico, diagnóstico inicial e classificação da OS.",
    icon: ClipboardCheck,
    status: "Próxima etapa",
  },
  {
    titulo: "Reparo",
    descricao: "Execução dos reparos necessários conforme diagnóstico técnico.",
    icon: Wrench,
    status: "Em construção",
  },
  {
    titulo: "Bancada de Testes",
    descricao: "Validação funcional e testes após reparo.",
    icon: FlaskConical,
    status: "Em construção",
  },
  {
    titulo: "Higienização",
    descricao: "Limpeza, preparação e acabamento do equipamento.",
    icon: Sparkles,
    status: "Em construção",
  },
  {
    titulo: "QCC",
    descricao: "Controle final de qualidade e liberação da OS.",
    icon: ShieldCheck,
    status: "Em construção",
  },
];

export default function RefrigeracaoV2Page() {
  return (
    <div>
      <div className="mb-10">
        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#765D81]">
          Linha Branca / Refrigeração
        </div>

        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900 sm:text-4xl">
          Operação de Refrigeração
        </h1>

        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
          Novo fluxo operacional da Refrigeração, construído a partir das regras
          e aprendizados do processo anterior.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
        {ETAPAS.map((etapa, index) => {
          const Icon = etapa.icon;
          const ativa = index === 0;

          return (
            <div
              key={etapa.titulo}
              className={`
                relative flex min-h-[220px] flex-col rounded-2xl border p-6
                ${
                  ativa
                    ? "border-slate-200 bg-white shadow-sm"
                    : "border-slate-200 bg-slate-50/70"
                }
              `}
            >
              <div
                className={`
                  absolute right-5 top-5 rounded-full px-3 py-1
                  text-[10px] font-bold uppercase tracking-[0.12em]
                  ${
                    ativa
                      ? "bg-[#F3EFF5] text-[#5C4168]"
                      : "bg-white text-slate-400 ring-1 ring-slate-200"
                  }
                `}
              >
                {etapa.status}
              </div>

              <div
                className={`
                  flex h-12 w-12 items-center justify-center rounded-xl
                  ${
                    ativa
                      ? "bg-[#F3EFF5] text-[#43284F] ring-1 ring-[#43284F]/10"
                      : "bg-white text-slate-400 ring-1 ring-slate-200"
                  }
                `}
              >
                <Icon className="h-6 w-6" />
              </div>

              <div className="mt-7">
                <h2
                  className={`text-[17px] font-black tracking-tight ${
                    ativa ? "text-slate-900" : "text-slate-500"
                  }`}
                >
                  {etapa.titulo}
                </h2>

                <p
                  className={`mt-1 text-sm leading-5 ${
                    ativa ? "text-slate-500" : "text-slate-400"
                  }`}
                >
                  {etapa.descricao}
                </p>
              </div>

              {ativa && (
                <div className="mt-auto flex items-center gap-2 pt-6 text-xs font-bold text-[#43284F]">
                  Estruturar fluxo
                  <ArrowRight className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}