import { useState, useEffect, useRef } from "react";
import {
  Upload, Tag, CheckCircle, AlertTriangle, Loader, RefreshCw, FileText, Printer,
} from "lucide-react";
import {
  lerArquivosEtiquetas, salvarLoteEtiquetas, listarLotes,
} from "../services/etiquetasService.js";
import { useAuth } from "../AuthContext.jsx";

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function fmtData(d) { if (!d) return "—"; return new Date(d).toLocaleString("pt-BR"); }

export default function EtiquetasEnvioPage() {
  const { user } = useAuth();
  const [lendo, setLendo]         = useState(false);
  const [salvando, setSalvando]   = useState(false);
  const [previa, setPrevia]       = useState(null);   // { etiquetas, problemas }
  const [resultado, setResultado] = useState(null);
  const [lotes, setLotes]         = useState([]);
  const [loadingLotes, setLoadingLotes] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { carregarLotes(); }, []);

  async function carregarLotes() {
    setLoadingLotes(true);
    try { setLotes(await listarLotes(10)); }
    catch (e) { console.error(e); }
    finally { setLoadingLotes(false); }
  }

  async function handleArquivos(e) {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    setLendo(true);
    setResultado(null);
    try {
      const r = await lerArquivosEtiquetas(files);
      setPrevia(r);
    } catch (err) {
      setPrevia({ etiquetas: [], problemas: [err.message] });
    } finally {
      setLendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSalvar() {
    if (!previa?.etiquetas?.length || salvando) return;
    setSalvando(true);
    try {
      const r = await salvarLoteEtiquetas(previa.etiquetas, user?.id);
      setResultado({ ok: true, msg: `${r.gravadas} etiqueta(s) disponíveis para a embalagem.` });
      setPrevia(null);
      carregarLotes();
    } catch (err) {
      setResultado({ ok: false, msg: err.message });
    } finally {
      setSalvando(false);
    }
  }

  const porMkt = {};
  (previa?.etiquetas || []).forEach(e => {
    const m = e.marketplace || "—";
    porMkt[m] = (porMkt[m] || 0) + 1;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Tag className="h-6 w-6 text-[#7F2D92]" />
        <div>
          <h2 className="text-lg font-black text-slate-800">Etiquetas de envio</h2>
          <p className="text-xs text-slate-500">
            Suba os lotes baixados dos marketplaces — a embalagem imprime bipando a chave da NF
          </p>
        </div>
      </div>

      <Card>
        <label className="block cursor-pointer">
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".zip,.zpl,.txt"
            onChange={handleArquivos}
            className="hidden"
            disabled={lendo || salvando}
          />
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-8 text-center hover:border-purple-400 hover:bg-purple-50/40 transition">
            {lendo ? (
              <>
                <Loader className="h-8 w-8 mx-auto mb-2 text-purple-500 animate-spin" />
                <p className="text-sm font-semibold text-slate-600">Lendo arquivos...</p>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 mx-auto mb-2 text-slate-400" />
                <p className="text-sm font-bold text-slate-700">Clique para escolher os arquivos</p>
                <p className="text-xs text-slate-500 mt-1">
                  ZIP do Mercado Livre e do Magalu, ou os .zpl soltos do Via Varejo — pode mandar todos juntos
                </p>
              </>
            )}
          </div>
        </label>

        {resultado && (
          <div className={`mt-4 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${
            resultado.ok ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                         : "bg-red-50 text-red-700 ring-red-200"}`}>
            {resultado.ok ? <CheckCircle className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            {resultado.msg}
          </div>
        )}
      </Card>

      {previa && (
        <Card>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div>
              <h3 className="font-black text-slate-800 text-sm">
                {previa.etiquetas.length} etiqueta(s) encontrada(s)
              </h3>
              <div className="flex gap-1.5 flex-wrap mt-1.5">
                {Object.entries(porMkt).map(([m, q]) => (
                  <span key={m} className="text-xs font-semibold px-2 py-0.5 rounded-lg bg-purple-50 text-[#7F2D92] ring-1 ring-purple-200">
                    {m} · {q}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setPrevia(null); setResultado(null); }}
                className="text-sm font-bold px-4 py-2 rounded-xl ring-1 ring-slate-200 text-slate-600 hover:bg-slate-50">
                Cancelar
              </button>
              <button onClick={handleSalvar} disabled={salvando || !previa.etiquetas.length}
                className="text-sm font-bold px-4 py-2 rounded-xl bg-[#7F2D92] text-white hover:bg-purple-800 disabled:opacity-50 flex items-center gap-1.5">
                {salvando ? <Loader className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
                Confirmar envio
              </button>
            </div>
          </div>

          {previa.problemas?.length > 0 && (
            <div className="mb-3 rounded-xl bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 mb-1">
                <AlertTriangle className="h-3.5 w-3.5" /> Não reconhecidos
              </div>
              {previa.problemas.map((p, i) => (
                <div key={i} className="text-xs text-amber-700">{p}</div>
              ))}
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-xl ring-1 ring-slate-100">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 sticky top-0">
                <tr className="text-left text-slate-500">
                  <th className="px-3 py-2 font-semibold">NF</th>
                  <th className="px-3 py-2 font-semibold">Marketplace</th>
                  <th className="px-3 py-2 font-semibold">Rastreio / pedido</th>
                  <th className="px-3 py-2 font-semibold">Arquivo</th>
                </tr>
              </thead>
              <tbody>
                {previa.etiquetas.map((e, i) => (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="px-3 py-2 font-bold text-slate-700">{e.numero_nf}</td>
                    <td className="px-3 py-2 text-slate-600">{e.marketplace}</td>
                    <td className="px-3 py-2 font-mono text-slate-400">{e.tag_code || e.pedido_mkt || "—"}</td>
                    <td className="px-3 py-2 text-slate-400 truncate max-w-[180px]">{e.arquivo_origem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-black text-slate-700 text-xs flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 text-purple-500" /> Últimos envios
          </h3>
          <button onClick={carregarLotes} className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1">
            <RefreshCw className="h-3.5 w-3.5" /> Atualizar
          </button>
        </div>

        {loadingLotes ? (
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Loader className="h-4 w-4 animate-spin" /> Carregando...
          </div>
        ) : lotes.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Nenhum lote enviado ainda.</p>
        ) : (
          <div className="space-y-2">
            {lotes.map(l => (
              <div key={l.lote_id} className="flex items-center justify-between gap-3 flex-wrap bg-slate-50 rounded-xl px-4 py-3">
                <div className="flex items-center gap-3 flex-wrap text-xs">
                  <span className="font-black text-slate-700">{fmtData(l.criado_em)}</span>
                  {Object.entries(l.marketplaces).map(([m, q]) => (
                    <span key={m} className="text-slate-500">{m} · {q}</span>
                  ))}
                </div>
                <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                  <Printer className="h-3.5 w-3.5 text-emerald-600" />
                  {l.impressas}/{l.total} impressas
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}