import { useEffect, useState } from "react";
import { Download, LoaderCircle, X } from "lucide-react";
import { supabase } from "../lib/supabase.js";

const moeda = valor => valor === null || valor === undefined ? "—" :
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const mes = valor => new Date(valor + "-01T12:00:00").toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export default function SantanderConferencia({ upload, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true;
    setDados(null);
    setErro("");
    async function consultar() {
      const { data, error } = await supabase.rpc("financeiro_extrato_conferencia_mensal", {
        p_upload_id: upload.id,
      });
      if (!ativo) return;
      if (error) setErro(error.message);
      else setDados(Array.isArray(data) ? data : []);
    }
    void consultar();
    return () => { ativo = false; };
  }, [upload.id]);

  const pendentes = (dados || []).filter(m => Number(m.pendentes) > 0);
  const exportar = () => {
    if (!pendentes.length) return;
    const csv = [
      ["Competência","Banco","Conta","Lançamentos pendentes","Créditos PDF","Créditos extraídos","Diferença créditos",
        "Débitos PDF","Débitos extraídos","Diferença débitos","PDF de referência"],
      ...pendentes.map(m => [m.competencia,upload.banco,upload.conta,m.pendentes,
        m.creditos_oficiais,m.creditos_extraidos,m.diferenca_creditos,
        m.debitos_oficiais,m.debitos_extraidos,m.diferenca_debitos,m.arquivo_pdf || ""]),
    ].map(linha => linha.map(campo => '"' + String(campo ?? "").replaceAll('"','""') + '"').join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = "Conferencia_Santander_" + upload.conta + ".csv"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-900">Conferência mensal · {upload.banco} · {upload.conta}</h3>
          <p className="mt-1 max-w-3xl text-xs text-slate-600">
            O CSV foi processado, mas alguns lançamentos extraídos dos PDFs não fecham com os totais oficiais.
            Essas competências ficam fora dos totais do Fluxo de Caixa até a correção.
            Processar novamente o mesmo CSV não resolve a divergência.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendentes.length > 0 && (
            <button type="button" onClick={exportar}
              className="inline-flex items-center gap-2 rounded-lg border border-amber-300 px-3 py-2 text-xs font-bold text-amber-900 hover:bg-amber-50">
              <Download size={14}/> Exportar divergências
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Fechar conferência"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={17}/></button>
        </div>
      </div>
      {erro && <p className="mt-4 text-xs font-semibold text-red-700">{erro}</p>}
      {!dados && !erro && <p className="mt-4 flex items-center gap-2 text-xs text-slate-500"><LoaderCircle size={15} className="animate-spin"/> Consultando extratos...</p>}
      {dados && (
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {["Competência","Pendentes","Créditos PDF","Extraídos","Diferença","Débitos PDF","Extraídos","Diferença"].map((h,i) => (
                  <th key={h + i} className={"px-3 py-2 font-bold" + (i ? " text-right" : "")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {pendentes.map(r => <tr key={r.competencia}>
                <td className="whitespace-nowrap px-3 py-3 font-bold capitalize text-slate-900">{mes(r.competencia)}</td>
                <td className="px-3 py-3 text-right font-bold text-amber-800">{Number(r.pendentes).toLocaleString("pt-BR")}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{moeda(r.creditos_oficiais)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{moeda(r.creditos_extraidos)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-amber-800">{moeda(r.diferenca_creditos)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{moeda(r.debitos_oficiais)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right">{moeda(r.debitos_extraidos)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-amber-800">{moeda(r.diferenca_debitos)}</td>
              </tr>)}
            </tbody>
          </table>
          {pendentes.length === 0 && <p className="py-4 text-xs text-slate-500">Não existem pendências neste upload.</p>}
          <p className="mt-3 text-xs text-slate-500">
            Valores de referência: extratos PDF Santander auditados. O relatório identifica diferenças;
            a correção de cada lançamento exige conferir o PDF original. Não há liberação automática de valores divergentes.
          </p>
        </div>
      )}
    </section>
  );
}
