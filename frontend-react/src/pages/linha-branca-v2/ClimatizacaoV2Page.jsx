import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  PackageCheck,
  RefreshCw,
  ShieldAlert,
  Snowflake,
  TestTubeDiagonal,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchIndicadoresClimatizacao } from "../../services/climatizacaoService.js";

const FLUXO = [
  { numero: "01", titulo: "Triagem individual", descricao: "Validação de modelo, tensão, unidade, energização e condição técnica." },
  { numero: "02", titulo: "Reparo / decisão", descricao: "Intervenções mecânicas, elétricas e estéticas ou solicitação de condenação." },
  { numero: "03", titulo: "Formação do kit", descricao: "1 condensadora + uma ou mais evaporadoras compatíveis, com etiqueta e QR Code." },
  { numero: "04", titulo: "Operação", descricao: "Vácuo, pressão, corrente, drenagem, tubulação e teste funcional de 30 minutos." },
  { numero: "05", titulo: "Higienização", descricao: "Kit aprovado segue para a próxima etapa com histórico técnico preservado." },
];

function Card({ icon: Icon, value, label, detail }) {
  return (
    <div className="min-h-[126px] bg-white px-5 py-5">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#F3EFF5] text-[#4C1D95]">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="text-2xl font-black tracking-tight text-slate-900">{value}</div>
          <div className="mt-0.5 text-xs font-semibold text-slate-600">{label}</div>
        </div>
      </div>
      {detail ? <div className="mt-3 text-[10px] font-semibold text-slate-400">{detail}</div> : null}
    </div>
  );
}

export default function ClimatizacaoV2Page() {
  const [dados, setDados] = useState({
    aguardandoTriagem: 0,
    aguardandoKit: 0,
    emReparo: 0,
    aguardandoCondenacao: 0,
    kitsFormados: 0,
    kitsEmOperacao: 0,
    kitsAprovados: 0,
    higienizacao: 0,
    componentes: [],
    kits: [],
  });
  const [loading, setLoading] = useState(true);
  const [mensagem, setMensagem] = useState("");

  const carregar = useCallback(async () => {
    try {
      setLoading(true);
      setDados(await fetchIndicadoresClimatizacao());
      setMensagem("");
    } catch (error) {
      setMensagem(`Erro ao carregar Climatização: ${error.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const recentes = useMemo(
    () => [...(dados.componentes || [])]
      .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
      .slice(0, 8),
    [dados.componentes]
  );

  const indicadores = [
    { label: "Aguardando triagem", value: dados.aguardandoTriagem, icon: ClipboardCheck },
    { label: "Aguardando kit", value: dados.aguardandoKit, icon: PackageCheck },
    { label: "Em reparo", value: dados.emReparo, icon: Wrench },
    { label: "Kits em operação", value: dados.kitsEmOperacao, icon: TestTubeDiagonal },
    { label: "Aguard. condenação", value: dados.aguardandoCondenacao, icon: ShieldAlert },
    { label: "Em Higienização", value: dados.higienizacao, icon: CheckCircle2 },
  ];

  return (
    <div className="mx-auto max-w-[1600px]">
      <div className="flex flex-col gap-5 border-b border-slate-200 pb-7 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">
            Linha Branca · Climatização
          </div>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.035em] text-slate-900">Visão Geral</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-500">
            Fluxo conectado à operação real: unidade individual, reparos, formação do conjunto, teste e liberação.
          </p>
        </div>

        <button type="button" onClick={carregar} disabled={loading} className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-600 disabled:opacity-50">
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Atualizar
        </button>
      </div>

      {mensagem ? <div className="mt-5 rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">{mensagem}</div> : null}

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-800">Operação atual</h2>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
            <Activity className="h-4 w-4" />
            Base operacional conectada
          </div>
        </div>

        <div className="grid overflow-hidden rounded-2xl border border-slate-200 bg-white sm:grid-cols-2 xl:grid-cols-3">
          {indicadores.map((item, index) => (
            <div key={item.label} className={`${index >= 2 ? "border-t" : index > 0 ? "border-t sm:border-t-0 sm:border-l" : ""} border-slate-200 xl:border-t-0 xl:[&:nth-child(n+4)]:border-t xl:[&:not(:nth-child(3n+1))]:border-l`}>
              <Card {...item} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-2">
              <Snowflake className="h-4 w-4 text-[#4C1D95]" />
              <h2 className="text-sm font-black text-slate-800">Unidades recentes</h2>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-5 py-3">OS</th>
                  <th className="px-5 py-3">Unidade</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Produto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {recentes.length ? recentes.map((item) => (
                  <tr key={item.id}>
                    <td className="px-5 py-3 font-black text-slate-800">{item.os?.numero_os || "—"}</td>
                    <td className="px-5 py-3 capitalize text-slate-600">{item.tipo_unidade || "—"}</td>
                    <td className="px-5 py-3 text-slate-600">{item.status}</td>
                    <td className="px-5 py-3 text-slate-500">{item.os?.marca || "—"} {item.os?.modelo || ""}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-5 py-10 text-center text-slate-400">Nenhuma unidade triada ainda.</td></tr>
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
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F3EFF5] text-xs font-black text-[#4C1D95]">{etapa.numero}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-black text-slate-800">{etapa.titulo}</div>
                <div className="mt-0.5 text-xs leading-5 text-slate-500">{etapa.descricao}</div>
              </div>
              {index !== FLUXO.length - 1 ? <ArrowRight className="h-4 w-4 shrink-0 text-slate-300" /> : null}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kits disponíveis/ativos</div>
          <div className="mt-2 text-3xl font-black text-slate-900">{dados.kitsFormados}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Kits aprovados</div>
          <div className="mt-2 text-3xl font-black text-emerald-700">{dados.kitsAprovados}</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="text-[10px] font-black uppercase tracking-wide text-slate-400">Fluxo protegido</div>
          <div className="mt-2 text-sm font-black text-slate-800">Condenação exige aprovação gerencial</div>
        </div>
      </section>
    </div>
  );
}
