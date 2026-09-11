import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Briefcase,
  LogOut,
  Monitor,
  ShoppingBag,
  Smartphone,
  Snowflake,
  Store,
  Truck,
  Warehouse,
} from "lucide-react";

import { useAuth } from "../AuthContext.jsx";
import { signOut } from "../services/authService.js";

const MODULOS_FUTUROS = [
  {
    nome: "Linha Mobile",
    descricao: "Operação Mobile",
    icon: Smartphone,
  },
  {
    nome: "Linha Marrom",
    descricao: "Eletrônicos e equipamentos",
    icon: Monitor,
  },
  {
    nome: "Loja",
    descricao: "Operação de loja",
    icon: ShoppingBag,
  },
  {
    nome: "Back Office",
    descricao: "Gestão administrativa",
    icon: Briefcase,
  },
  {
    nome: "Logística",
    descricao: "Transportes e expedição",
    icon: Truck,
  },
];

function ModuloDisponivel({
  nome,
  descricao,
  icon: Icon,
  onClick,
  destaque,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="
        group relative flex min-h-[210px] flex-col overflow-hidden
        rounded-2xl border border-slate-200 bg-white p-6 text-left
        shadow-sm transition-all duration-200
        hover:-translate-y-1 hover:border-[#7A6685]/35
        hover:shadow-[0_18px_45px_rgba(15,23,42,0.08)]
      "
    >
      {destaque && (
        <div className="absolute right-5 top-5 rounded-full bg-[#F3EFF5] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-[#5C4168]">
          {destaque}
        </div>
      )}

      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F] ring-1 ring-[#43284F]/10">
        <Icon className="h-6 w-6" />
      </div>

      <div className="mt-7">
        <h2 className="text-[17px] font-black tracking-tight text-slate-900">
          {nome}
        </h2>

        <p className="mt-1 text-sm text-slate-500">
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

function ModuloIndisponivel({
  nome,
  descricao,
  icon: Icon,
}) {
  return (
    <div className="relative flex min-h-[210px] flex-col rounded-2xl border border-slate-200/80 bg-slate-50/70 p-6">
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

        <p className="mt-1 text-sm text-slate-400">
          {descricao}
        </p>
      </div>
    </div>
  );
}

export default function SistemasPage() {
  const navigate = useNavigate();
  const { profile } = useAuth();

  const telas = profile?.telas_permitidas || [];
  const areaTecnica = profile?.area_tecnica;

  const acessoAssurant = useMemo(() => {
    if (profile?.is_master) return true;

    return (
      areaTecnica === "assurant" ||
      telas.some(
        (rota) =>
          rota.startsWith("/v2/assurant") ||
          rota.startsWith("/assurant") ||
          rota.startsWith("/b2b") ||
          rota.startsWith("/b2c")
      )
    );
  }, [profile, areaTecnica, telas]);

  const acessoLinhaBranca = useMemo(() => {
    if (profile?.is_master) return true;

    return (
      [
        "refrigeracao",
        "climatizacao",
        "lavadoras",
        "diversos",
      ].includes(areaTecnica) ||
      telas.some((rota) =>
        rota.startsWith("/linha-branca")
      )
    );
  }, [profile, areaTecnica, telas]);

  function abrirLinhaBranca() {
  navigate("/v2/linha-branca");
}

  async function sair() {
    await signOut();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-[#F5F5F6]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-[76px] max-w-[1440px] items-center justify-between px-5 sm:px-8 lg:px-10">
          <img
            src="/brand/liquida-logo-full.png"
            alt="LiquidaPreço"
            className="h-10 w-auto object-contain"
          />

          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <div className="text-xs font-bold text-slate-800">
                {profile?.nome || "Usuário"}
              </div>

              <div className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                Liquida System
              </div>
            </div>

            <button
              type="button"
              onClick={sair}
              className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 transition hover:bg-slate-50 hover:text-slate-800"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">
                Sair
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-5 py-10 sm:px-8 lg:px-10 lg:py-12">
        <div className="mb-10">
          <div className="text-[11px] font-black uppercase tracking-[0.22em] text-[#765D81]">
            Liquida System
          </div>

          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900 sm:text-4xl">
            Sistemas
          </h1>

          <p className="mt-2 text-sm text-slate-500">
            Selecione o ambiente que deseja acessar.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {acessoAssurant ? (
            <ModuloDisponivel
              nome="Assurant Warehouse"
              descricao="Operação Warehouse"
              icon={Warehouse}
              onClick={() =>
                navigate("/v2/assurant")
              }
            />
          ) : (
            <ModuloIndisponivel
              nome="Assurant Warehouse"
              descricao="Operação Warehouse"
              icon={Warehouse}
            />
          )}

          {acessoLinhaBranca ? (
            <ModuloDisponivel
              nome="Linha Branca"
              descricao="Operação Linha Branca"
              icon={Snowflake}
              onClick={abrirLinhaBranca}
              destaque="Teste"
            />
          ) : (
            <ModuloIndisponivel
              nome="Linha Branca"
              descricao="Operação Linha Branca"
              icon={Snowflake}
            />
          )}

          {MODULOS_FUTUROS.map((modulo) => (
            <ModuloIndisponivel
              key={modulo.nome}
              {...modulo}
            />
          ))}

          <ModuloIndisponivel
            nome="Outras Operações"
            descricao="Novos módulos"
            icon={Store}
          />
        </div>
      </main>

      <footer className="px-6 py-8 text-center">
        <span className="text-[10px] font-medium tracking-wide text-slate-400">
          Powered by{" "}
        </span>

        <span className="text-[10px] font-bold tracking-wide text-slate-500">
          Redoma Advisory
        </span>
      </footer>
    </div>
  );
}