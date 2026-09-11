import {
  ArrowRight,
  ClipboardCheck,
  Droplets,
  Snowflake,
  Refrigerator,
  WashingMachine,
  PackageSearch,
} from "lucide-react";

import { useNavigate } from "react-router-dom";

const AREAS = [
  {
    nome: "QCC",
    descricao: "Qualidade, conferência e controle.",
    icon: ClipboardCheck,
    rota: "/v2/linha-branca/qcc",
    disponivel: false,
  },
  {
    nome: "Higienização",
    descricao: "Limpeza, preparação e acabamento.",
    icon: Droplets,
    rota: "/v2/linha-branca/higienizacao",
    disponivel: false,
  },
  {
    nome: "Climatização",
    descricao: "Operação de equipamentos de climatização.",
    icon: Snowflake,
    rota: "/v2/linha-branca/climatizacao",
    disponivel: false,
  },
  {
    nome: "Refrigeração",
    descricao: "Fluxo operacional de refrigeradores e freezers.",
    icon: Refrigerator,
    rota: "/v2/linha-branca/refrigeracao",
    disponivel: true,
  },
  {
    nome: "Lavadoras",
    descricao: "Operação de lavadoras e equipamentos relacionados.",
    icon: WashingMachine,
    rota: "/v2/linha-branca/lavadoras",
    disponivel: true,
  },
  {
    nome: "Portáteis",
    descricao: "Operação de eletroportáteis.",
    icon: PackageSearch,
    rota: "/v2/linha-branca/portateis",
    disponivel: false,
  },
];

function AreaCard({
  nome,
  descricao,
  icon: Icon,
  disponivel,
  onClick,
}) {
  if (!disponivel) {
    return (
      <div className="relative flex min-h-[210px] flex-col rounded-2xl border border-slate-200 bg-slate-50/70 p-6">
        <div className="absolute right-5 top-5 rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 ring-1 ring-slate-200">
          Em implantação
        </div>

        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-white text-slate-400 ring-1 ring-slate-200">
          <Icon className="h-6 w-6" />
        </div>

        <div className="mt-7">
          <h2 className="text-[17px] font-black tracking-tight text-slate-500">
            {nome}
          </h2>

          <p className="mt-1 text-sm leading-5 text-slate-400">
            {descricao}
          </p>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group relative flex min-h-[210px] flex-col rounded-2xl
        border border-slate-200 bg-white p-6 text-left shadow-sm
        transition-all duration-200
        hover:-translate-y-1
        hover:border-[#7A6685]/35
        hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]
      "
    >
      <div className="absolute right-5 top-5 rounded-full bg-[#F3EFF5] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C4168]">
        Disponível
      </div>

      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F] ring-1 ring-[#43284F]/10">
        <Icon className="h-6 w-6" />
      </div>

      <div className="mt-7">
        <h2 className="text-[17px] font-black tracking-tight text-slate-900">
          {nome}
        </h2>

        <p className="mt-1 text-sm leading-5 text-slate-500">
          {descricao}
        </p>
      </div>

      <div className="mt-auto flex items-center gap-2 pt-6 text-xs font-bold text-[#43284F]">
        Acessar
        <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
      </div>
    </button>
  );
}

export default function LinhaBrancaHomePage() {
  const navigate = useNavigate();

  return (
    <div>
      <div className="mb-10">
        <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#765D81]">
          Linha Branca
        </div>

        <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900 sm:text-4xl">
          Áreas de operação
        </h1>

        <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
          Selecione a área operacional que deseja acessar.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {AREAS.map((area) => (
          <AreaCard
            key={area.nome}
            {...area}
            onClick={() => navigate(area.rota)}
          />
        ))}
      </div>
    </div>
  );
}