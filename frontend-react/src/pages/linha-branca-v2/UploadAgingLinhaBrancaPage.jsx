import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle } from "lucide-react";
import { historicoUploadsAging, importarAging, lerArquivoAging } from "../../services/agingLinhaBrancaService.js";
import { dataNomeArquivo } from "../../services/agingLinhaBrancaParser.js";

const hoje = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const numero = n => Number(n || 0).toLocaleString("pt-BR");
const dataBr = s => s ? s.slice(0, 10).split("-").reverse().join("/") : "—";
const card = "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm";

export default function UploadAgingLinhaBrancaPage() {
  const [base, setBase] = useState(null);
  const [referencia, setReferencia] = useState(hoje);
  const [historico, setHistorico] = useState([]);
  const [erro, setErro] = useState("");
  const [erroHistorico, setErroHistorico] = useState("");
  const [ocupado, setOcupado] = useState("");
  const [progresso, setProgresso] = useState(0);
  const [resultado, setResultado] = useState(null);
  const bloqueio = useRef(false);

  useEffect(() => {
    let ativo = true;
    historicoUploadsAging().then(d => { if (ativo) setHistorico(d); })
      .catch(e => { if (ativo) setErroHistorico(e.message); });
    return () => { ativo = false; };
  }, []);

  async function selecionar(arquivo) {
    if (!arquivo || bloqueio.current) return;
    bloqueio.current = true;
    setOcupado("leitura"); setErro(""); setBase(null); setResultado(null); setProgresso(0);
    try {
      const dados = await lerArquivoAging(arquivo);
      setBase(dados); setReferencia(dataNomeArquivo(arquivo.name) || hoje());
    } catch (e) { setErro(e.message || "Não foi possível ler o arquivo."); }
    finally { setOcupado(""); bloqueio.current = false; }
  }

  async function importar() {
    if (bloqueio.current) return;
    bloqueio.current = true; setOcupado("importacao"); setErro(""); setResultado(null); setProgresso(0);
    try {
      const res = await importarAging(base, referencia, setProgresso);
      setResultado(res);
      try { setHistorico(await historicoUploadsAging()); setErroHistorico(""); }
      catch (e) { setErroHistorico(e.message); }
    } catch (e) { setErro(`${e.message || "Falha na importação."} Você pode tentar novamente com o mesmo arquivo; os lotes recebidos serão reaproveitados.`); }
    finally { setOcupado(""); bloqueio.current = false; }
  }

  function baixarErros() {
    const linhas = ["Linha;OS;Motivo", ...base.erros.map(e => [e.linha, e.os || "", e.motivo].map(v => `"${String(v).replaceAll('"', '""')}"`).join(";"))];
    const url = URL.createObjectURL(new Blob(["\uFEFF" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = "Erros_Upload_Linha_Branca.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const podeImportar = base && base.registros.length > 0 && !base.erros.length && referencia && referencia <= hoje() && !ocupado && !resultado;

  return <div className="space-y-6">
    <Link to="/v2/linha-branca" className="inline-flex items-center gap-2 text-sm font-bold text-[#43284F]"><ArrowLeft size={16} />Linha Branca</Link>
    <div><p className="text-xs font-black uppercase tracking-widest text-[#765D81]">Dados · Linha Branca</p>
      <h1 className="mt-2 text-3xl font-black text-slate-900">Upload diário de Aging</h1>
      <p className="mt-2 text-sm text-slate-500">Envie o Relatório Aging Personalizado para incluir OSs e atualizar os dados de origem.</p>
    </div>

    <section className={card}>
      <div className="grid gap-6 md:grid-cols-[1fr_240px]">
        <label className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#C7B9CE] bg-[#FAF8FB] p-8 text-center ${ocupado ? "opacity-60" : "hover:bg-[#F3EFF5]"}`}
          onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); selecionar(e.dataTransfer.files[0]); }}>
          <Upload className="text-[#43284F]" size={28} />
          <span className="font-bold text-[#43284F]">{ocupado === "leitura" ? "Lendo relatório…" : "Selecionar ou arrastar relatório CSV"}</span>
          <span className="text-xs text-slate-500">Relatório Aging Personalizado · até 50 MB</span>
          <input aria-label="Selecionar relatório Aging" type="file" accept=".csv,text/csv" disabled={Boolean(ocupado)} className="max-w-full text-sm" onChange={e => { selecionar(e.target.files[0]); e.target.value = ""; }} />
        </label>
        <div><label className="text-sm font-bold text-slate-700" htmlFor="data-aging">Data de referência do relatório</label>
          <input id="data-aging" type="date" value={referencia} max={hoje()} disabled={Boolean(ocupado) || Boolean(resultado)} onChange={e => setReferencia(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 p-3 text-sm" />
          <p className="mt-3 text-xs leading-5 text-slate-500">A data é sugerida pelo nome do arquivo. Confira antes de importar.</p>
        </div>
      </div>
      <p className="mt-5 text-xs leading-5 text-slate-500">Seleciona somente categoria_produto = Linha Branca e classifica por tipo_prod. OSs existentes mantêm identificação física, etapas, ciclos, triagens e reparos; a atualização diária fica registrada nos dados de origem. OSs novas entram na etapa correspondente à origem.</p>
    </section>

    {erro && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</div>}
    {base && <section className={card}>
      <div className="flex items-center gap-2 font-bold text-slate-800"><FileSpreadsheet size={20} /><span className="break-all">{base.arquivo}</span></div>
      <div className="my-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[["Linhas do arquivo", base.total], ["OSs de Linha Branca", base.registros.length], ["Outras categorias ignoradas", base.outrasCategorias], ["Erros para corrigir", base.erros.length]].map(([label, valor]) => <div key={label} className="rounded-xl bg-slate-50 p-4"><div className="text-2xl font-black text-[#43284F]">{numero(valor)}</div><div className="mt-1 text-xs text-slate-500">{label}</div></div>)}
      </div>
      {base.repetidas > 0 && <p className="mb-3 text-sm text-slate-500">{numero(base.repetidas)} linhas idênticas repetidas foram desconsideradas.</p>}
      <details className="mb-5 text-sm"><summary className="cursor-pointer font-bold text-slate-600">Produtos por tipo</summary><div className="mt-3 grid gap-2 sm:grid-cols-3">{Object.entries(base.tipos).map(([tipo, qtd]) => <div key={tipo} className="flex justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2"><span>{tipo}</span><b>{numero(qtd)}</b></div>)}</div></details>
      {base.erros.length > 0 && <div role="alert" className="mb-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800"><p className="flex items-center gap-2 font-bold"><AlertTriangle size={18} />Corrija os erros antes de importar.</p><ul className="my-3 list-inside list-disc">{base.erros.slice(0, 8).map((e, i) => <li key={i}>Linha {e.linha}{e.os ? ` · OS ${e.os}` : ""}: {e.motivo}</li>)}</ul><button type="button" onClick={baixarErros} className="font-bold underline">Baixar lista completa de erros</button></div>}
      <div className="max-h-72 overflow-auto rounded-xl border border-slate-100"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr>{["OS", "Tipo", "Marca / Modelo", "Abertura", "Etapa de origem"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{base.registros.slice(0, 30).map(r => <tr key={r.numero_os} className="border-t border-slate-100"><td className="p-3 font-bold">{r.numero_os}</td><td className="p-3">{r.dados_origem.tipo_prod}</td><td className="p-3">{r.marca} {r.modelo}</td><td className="p-3 whitespace-nowrap">{dataBr(r.dt_entrada)}</td><td className="p-3">{r.dados_origem.ETAPA}</td></tr>)}</tbody></table></div>
      <p className="mt-2 text-xs text-slate-400">Prévia das primeiras 30 OSs.</p>
      {ocupado === "importacao" && <div role="status" className="mt-5"><progress aria-label="Progresso do upload" max="100" value={progresso} className="h-3 w-full accent-[#43284F]" /><p className="mt-1 text-sm text-slate-600">{progresso < 95 ? `Enviando OSs… ${progresso}%` : "Concluindo importação…"} Mantenha esta tela aberta.</p></div>}
      <button type="button" disabled={!podeImportar} onClick={importar} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#43284F] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"><Upload size={17} />{ocupado === "importacao" ? "Importando…" : "Importar Linha Branca"}</button>
    </section>}

    {resultado && <section role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-emerald-900"><h2 className="flex items-center gap-2 font-black"><CheckCircle2 size={20} />{resultado.repetido ? "Este arquivo já foi importado nesta data." : "Importação concluída"}</h2><p className="mt-3 text-sm">{numero(resultado.inseridas)} OSs incluídas · {numero(resultado.atualizadas)} origens atualizadas · {numero(resultado.preservadas)} sem alteração.</p><p className="mt-2 text-xs">O progresso operacional das OSs existentes foi preservado.</p></section>}
    <section className={card}><h2 className="mb-4 text-lg font-black text-slate-800">Últimos uploads</h2>
      {erroHistorico && <p role="alert" className="mb-3 text-sm text-red-600">Não foi possível carregar o histórico: {erroHistorico}</p>}
      {!historico.length ? <p className="text-sm text-slate-400">Nenhum upload registrado.</p> : <div className="overflow-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>{["Referência / arquivo", "Enviado em", "Responsável", "Situação", "Incluídas", "Origens atualizadas", "Sem alteração"].map(t => <th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{historico.map(r => <tr key={r.id} className="border-t border-slate-100"><td className="p-3"><b>{dataBr(r.data_referencia)}</b><div className="mt-1 max-w-64 break-all text-slate-400">{r.arquivo}</div></td><td className="whitespace-nowrap p-3">{new Date(r.created_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td className="p-3">{r.operador}</td><td className="p-3">{r.status === "concluido" ? "Concluído" : "Pendente — reenvie o arquivo"}</td><td className="p-3">{numero(r.inseridas)}</td><td className="p-3">{numero(r.atualizadas)}</td><td className="p-3">{numero(r.preservadas)}</td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}
