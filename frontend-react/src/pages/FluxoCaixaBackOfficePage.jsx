import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Landmark, UploadCloud, Wallet } from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import { supabase } from "../lib/supabase.js";

function Indicador({ label, icon: Icon }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-5">
    <div className="flex items-center justify-between text-sm font-medium text-slate-500">
      {label}<Icon className="h-4 w-4 text-slate-400" />
    </div>
    <div className="mt-4 text-2xl font-semibold tabular-nums text-slate-700">—</div>
    <div className="mt-1 text-xs text-slate-400">Aguardando lançamentos processados</div>
  </div>;
}

export default function FluxoCaixaBackOfficePage() {
  const { user } = useAuth();
  const [arquivos, setArquivos] = useState(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    let ativo = true;
    if (!user?.id) return;
    supabase.from("financeiro_extratos_uploads").select("id,banco,conta,status", { count: "exact" }).limit(100)
      .then(({ data, error, count }) => {
        if (!ativo) return;
        if (error) setErro("Não foi possível consultar os arquivos bancários.");
        else setArquivos({ total: count || 0, contas: new Set((data || []).map((item) => item.banco + "|" + item.conta)).size });
      });
    return () => { ativo = false; };
  }, [user?.id]);

  return <div className="space-y-6">
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7A6685]">Financeiro</div>
      <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Fluxo de Caixa</h1>
      <p className="mt-1 text-sm text-slate-500">Movimentações bancárias consolidadas da Liquida Preço.</p>
    </div>
    <div className="grid gap-4 md:grid-cols-3">
      <Indicador label="Entradas" icon={ArrowUpRight} />
      <Indicador label="Saídas" icon={ArrowDownRight} />
      <Indicador label="Movimento líquido" icon={Wallet} />
    </div>
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-6 py-5">
        <div>
          <h2 className="font-semibold text-slate-900">Lançamentos</h2>
          <p className="mt-1 text-xs text-slate-500">Os arquivos aguardam processamento e conciliação antes de compor este painel.</p>
        </div>
        <Link to="/backoffice/financeiro/extratos-bancarios"
          className="inline-flex items-center gap-2 rounded-lg bg-[#43284F] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#5B3866]">
          <UploadCloud className="h-4 w-4" /> Extratos Bancários
        </Link>
      </div>
      <div className="flex flex-col items-center justify-center px-5 py-16 text-center">
        <div className="mb-4 rounded-xl bg-[#F4F0F6] p-4"><Landmark className="h-6 w-6 text-[#6B1F87]" /></div>
        <h3 className="font-semibold text-slate-800">Nenhum lançamento processado neste módulo</h3>
        <p className="mt-2 max-w-md text-sm text-slate-500">Esta é a estrutura nova do Back Office. Não estamos reutilizando os lançamentos nem os relatórios da Tesouraria antiga.</p>
        {arquivos && <p className="mt-3 text-xs text-slate-400">{arquivos.total} arquivo(s) recebido(s) para processamento.</p>}
        {erro && <p role="alert" className="mt-3 text-xs text-amber-700">{erro}</p>}
      </div>
    </section>
  </div>;
}
