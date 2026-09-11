import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  TestTubeDiagonal,
  Wrench,
} from "lucide-react";

const INDICADORES = [
  {
    label: "Aguardando triagem",
    value: "—",
    icon: ClipboardCheck,
  },
  {
    label: "Em reparo",
    value: "—",
    icon: Wrench,
  },
  {
    label: "Em testes",
    value: "—",
    icon: TestTubeDiagonal,
  },
  {
    label: "Concluídas",
    value: "—",
    icon: CheckCircle2,
  },
];

const FLUXO = [
  {
    numero: "01",
    titulo: "Triagem",
    descricao: "Diagnóstico inicial e direcionamento técnico.",
  },
  {
    numero: "02",
    titulo: "Reparo",
    descricao: "Execução dos serviços necessários.",
  },
  {
    numero: "03",
    titulo: "Bancada de Testes",
    descricao: "Validação funcional após a intervenção.",
  },
  {
    numero: "04",
    titulo: "Encaminhamento",
    descricao: "Liberação para a próxima área do processo.",
  },
];

export default function LavadorasV2Page() {
  return (
    <div className="mx-auto max-w-[1500px]">
      {/* CABEÇALHO */}
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
            Linha Branca · Lavadoras
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">
            Visão Geral
          </h1>

          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Acompanhamento operacional do fluxo de lavadoras.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <Activity className="h-4 w-4 text-[#765D81]" />
          Operação em implantação
        </div>
      </div>

      {/* INDICADORES */}
      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">
            Operação atual
          </h2>

          <div className="text-xs text-slate-400">
            Dados serão conectados à base operacional
          </div>
        </div>

        <div className="grid border-y border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          {INDICADORES.map((item, index) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className={`
                  flex min-h-[118px] items-center gap-4 px-5 py-5
                  ${
                    index > 0
                      ? "border-t border-slate-200 sm:border-t-0 sm:border-l"
                      : ""
                  }
                `}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#4C1D95]">
                  <Icon className="h-5 w-5" />
                </div>

                <div>
                  <div className="text-2xl font-black tracking-tight text-slate-900">
                    {item.value}
                  </div>

                  <div className="mt-0.5 text-xs font-semibold text-slate-500">
                    {item.label}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* FLUXO OPERACIONAL */}
      <section className="mt-10">
        <div className="mb-5">
          <h2 className="text-lg font-black tracking-tight text-slate-900">
            Fluxo operacional
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Jornada da OS dentro da operação de Lavadoras.
          </p>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {FLUXO.map((etapa, index) => (
            <div
              key={etapa.numero}
              className={`
                flex flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center
                ${
                  index !== FLUXO.length - 1
                    ? "border-b border-slate-100"
                    : ""
                }
              `}
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3EFF5] text-xs font-black text-[#4C1D95]">
                {etapa.numero}
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-800">
                  {etapa.titulo}
                </div>

                <div className="mt-0.5 text-xs leading-5 text-slate-500">
                  {etapa.descricao}
                </div>
              </div>

              {index !== FLUXO.length - 1 && (
                <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ACOMPANHAMENTO */}
      <section className="mt-10 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-black text-slate-800">
              Situação das OS
            </h2>
          </div>

          <div className="flex min-h-[220px] items-center justify-center px-5 py-8 text-center">
            <div>
              <Activity className="mx-auto h-7 w-7 text-slate-300" />

              <div className="mt-3 text-sm font-bold text-slate-500">
                Indicadores em preparação
              </div>

              <div className="mt-1 text-xs text-slate-400">
                Aqui entraremos com volume, backlog e distribuição por etapa.
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-black text-slate-800">
              Tempo de processo
            </h2>
          </div>

          <div className="flex min-h-[220px] items-center justify-center px-5 py-8 text-center">
            <div>
              <Clock3 className="mx-auto h-7 w-7 text-slate-300" />

              <div className="mt-3 text-sm font-bold text-slate-500">
                Lead time
              </div>

              <div className="mt-1 text-xs text-slate-400">
                Vamos medir os tempos entre as etapas do processo.
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
