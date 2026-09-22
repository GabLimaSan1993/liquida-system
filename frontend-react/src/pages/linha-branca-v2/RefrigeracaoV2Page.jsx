import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  RefreshCw,
  TestTubeDiagonal,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { fetchIndicadoresRefrigeracao } from "../../services/refrigeracaoService.js";

const FLUXO = [
  { numero: "01", titulo: "Triagem", descricao: "Diagnóstico inicial e direcionamento técnico." },
  { numero: "02", titulo: "Reparo", descricao: "Execução dos serviços necessários e gestão de peças." },
  { numero: "03", titulo: "Bancada de Testes", descricao: "Validação técnica após intervenção." },
  { numero: "04", titulo: "Encaminhamento", descricao: "Liberação para Higienização, venda no estado, desmembramento ou Scrap." },
];

function Card({ icon: Icon, value, label }) {
  return (
    <div className="flex min-h-[118px] items-center gap-4 border-slate-200 px-5 py-5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#43284F]">
        <Icon className="h-5 w-5" />
      </div>
      <div>
        <div className="text-2xl font-black tracking-tight text-slate-900">{value}</div>
        <div className="mt-0.5 text-xs font-semibold text-slate-500">{label}</div>
      </div>
    </div>
  );
}

export default function RefrigeracaoV2Page() {
  const [dados, setDados] = useState({
    indicadores: { aguardandoTriagem: 0, emReparo: 0, emTestes: 0, concluidas: 0 },
    osList: [],
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      const resultado = await fetchIndicadoresRefrigeracao();
      setDados(resultado);
      setMensagem("");
    } catch (error) {
      setMensagem(`Erro ao carregar indicadores: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const recentes = useMemo(
    () => [...(dados.osList || [])].slice(0, 8),
    [dados.osList]
  );

  const indicadores = [
    { label: "Aguardando triagem", value: dados.indicadores.aguardandoTriagem, icon: ClipboardCheck },
    { label: "Em reparo", value: dados.indicadores.emReparo, icon: Wrench },
    { label: "Em testes", value: dados.indicadores.emTestes, icon: TestTubeDiagonal },
    { label: "Concluídas", value: dados.indicadores.concluidas, icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
            Linha Branca · Refrigeração
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Visão Geral</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Acompanhamento operacional conectado à base real de Refrigeração.
          </p>
        </div>

        <button
          type="button"
          onClick={carregar}
          disabled={loading}
          className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {mensagem ? (
        <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
          {mensagem}
        </div>
      ) : null}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">Operação atual</h2>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
            <Activity className="h-4 w-4" />
            {loading ? "Atualizando base..." : `${dados.total} OS de Refrigeração monitoradas`}
          </div>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-4">
          {indicadores.map((item, index) => (
            <div key={item.label} className={index > 0 ? "border-t border-slate-200 sm:border-t-0 sm:border-l" : ""}>
              <Card {...item} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-black text-slate-800">OS recentes</h2>
            <p className="mt-1 text-xs text-slate-400">Últimas movimentações registradas na operação.</p>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">OS</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Etapa</th>
                  <th className="px-5 py-3">Área</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {recentes.length ? recentes.map((os) => (
                  <tr key={os.id}>
                    <td className="px-5 py-3 font-black text-slate-800">{os.numero_os}</td>
                    <td className="px-5 py-3 text-slate-600">{os.status_atual || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{os.etapa_atual || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{os.area_destino || "—"}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">Nenhuma OS de Refrigeração encontrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <h2 className="text-sm font-black text-slate-800">Fluxo operacional</h2>
          </div>
          {FLUXO.map((etapa, index) => (
            <div key={etapa.numero} className={`flex items-center gap-4 px-5 py-4 ${index !== FLUXO.length - 1 ? "border-b border-slate-100" : ""}`}>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3EFF5] text-xs font-black text-[#43284F]">
                {etapa.numero}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-800">{etapa.titulo}</div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">{etapa.descricao}</div>
              </div>
              {index !== FLUXO.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
