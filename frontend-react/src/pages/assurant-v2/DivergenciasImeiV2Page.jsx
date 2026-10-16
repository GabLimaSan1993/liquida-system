import { useEffect, useState } from "react";
import {
  listarDivergencias,
  decidirDivergencia,
  configurarDestinatarios,
  etiquetaDivergencia,
} from "../../services/divergenciasImeiService";
const hora = (x) => (x ? new Date(x).toLocaleString("pt-BR") : "—");
export default function DivergenciasImeiV2Page() {
  const [casos, setCasos] = useState([]),
    [emails, setEmails] = useState(""),
    [filtro, setFiltro] = useState("pendente"),
    [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [caso, setCaso] = useState(null),
    [decisao, setDecisao] = useState(""),
    [diretriz, setDiretriz] = useState("");
  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const r = await listarDivergencias();
      setCasos(r.casos || []);
      setEmails((r.destinatarios || []).join("; "));
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    let ativo = true;
    listarDivergencias()
      .then((r) => {
        if (ativo) {
          setCasos(r.casos || []);
          setEmails((r.destinatarios || []).join("; "));
        }
      })
      .catch((e) => {
        if (ativo) setErro(e.message);
      })
      .finally(() => {
        if (ativo) setLoading(false);
      });
    return () => {
      ativo = false;
    };
  }, []);
  async function salvarEmails(e) {
    e.preventDefault();
    setLoading(true);
    setErro("");
    try {
      await configurarDestinatarios(
        emails
          .split(/[;,\n]+/)
          .map((x) => x.trim())
          .filter(Boolean),
      );
      setAviso("Destinatários salvos. Os avisos pendentes serão processados.");
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function decidir(e) {
    e.preventDefault();
    setLoading(true);
    setErro("");
    try {
      await decidirDivergencia(caso.id, decisao, diretriz);
      setCaso(null);
      setAviso("Diretriz registrada e situação do aparelho atualizada.");
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setLoading(false);
    }
  }
  const lista = casos.filter(
    (c) =>
      (!filtro || c.status === filtro) &&
      `${c.voucher} ${c.imei1} ${c.imei2 || ""} ${c.modelo}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  return (
    <div className="space-y-5 p-4 lg:p-7">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">
            Divergências de IMEI — Assurant
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Aparelhos segregados aguardando diretriz sobre a identificação
            física.
          </p>
        </div>
        <button
          onClick={carregar}
          disabled={loading}
          className="rounded-xl border bg-white p-3"
        >
          Atualizar
        </button>
      </header>
      {erro && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-4 text-sm font-bold text-rose-700"
        >
          {erro}
        </p>
      )}
      {aviso && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          {aviso}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["pendente", "Aguardando decisão"],
          ["autorizado", "Triagem autorizada"],
          ["devolver", "Devolução à origem"],
        ].map(([s, t]) => (
          <button
            key={s}
            onClick={() => setFiltro(s)}
            className={`rounded-2xl border p-4 text-left ${filtro === s ? "border-violet-300 bg-violet-50" : "bg-white"}`}
          >
            <div className="text-xs font-bold text-slate-500">{t}</div>
            <div className="mt-2 text-2xl font-black">
              {casos.filter((c) => c.status === s).length}
            </div>
          </button>
        ))}
      </div>
      <details className="rounded-2xl border bg-white p-4">
        <summary className="cursor-pointer text-sm font-bold">
          Destinatários dos avisos por e-mail
        </summary>
        <form onSubmit={salvarEmails} className="mt-4 space-y-3">
          <label className="block text-xs font-bold">
            E-mails separados por ponto e vírgula
            <textarea
              value={emails}
              onChange={(e) => setEmails(e.target.value)}
              className="mt-2 w-full rounded-xl border p-3"
              placeholder="Informe os destinatários autorizados"
            />
          </label>
          <p className="text-xs text-slate-500">
            Sem destinatários cadastrados, os avisos permanecem pendentes. A
            segregação e a etiqueta funcionam normalmente.
          </p>
          <button
            disabled={loading}
            className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white"
          >
            Salvar destinatários
          </button>
        </form>
      </details>
      <div className="flex flex-wrap gap-3">
        <label className="flex-1 text-xs font-bold">
          Buscar voucher, código ou modelo
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="mt-2 w-full rounded-xl border bg-white p-3"
          />
        </label>
        <label className="text-xs font-bold">
          Situação
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="mt-2 block rounded-xl border bg-white p-3"
          >
            <option value="">Todas</option>
            <option value="pendente">Pendente</option>
            <option value="autorizado">Autorizado</option>
            <option value="devolver">Devolver</option>
          </select>
        </label>
      </div>
      <div className="space-y-3">
        {lista.map((c) => (
          <article key={c.id} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-black text-rose-700">
                  {c.voucher} · {c.status}
                </div>
                <p className="mt-1 text-sm font-bold">{c.modelo}</p>
                <p className="mt-1 text-xs text-slate-500">
                  Registrado em {hora(c.criado_em)}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => etiquetaDivergencia(c)}
                  className="rounded-xl border p-3 text-xs font-bold"
                >
                  Etiqueta
                </button>
                {c.status === "pendente" && (
                  <button
                    onClick={() => {
                      setCaso(c);
                      setDiretriz("");
                      setDecisao("");
                    }}
                    className="rounded-xl bg-violet-700 px-4 text-xs font-bold text-white"
                  >
                    Definir diretriz
                  </button>
                )}
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              {[
                ["Contrato", c.imei_esperado],
                ["Bipado 1", c.imei1],
                ["Bipado 2", c.imei2],
              ].map(([t, v]) => (
                <div key={t}>
                  <dt className="font-bold text-slate-400">{t}</dt>
                  <dd className="mt-1 break-all font-mono font-bold">
                    {v || "Não se aplica"}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Aviso:{" "}
              {c.email_enviado_em
                ? `enviado em ${hora(c.email_enviado_em)}`
                : c.email_erro || "Pendente de envio"}
            </p>
            {c.diretriz && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <strong>Diretriz Assurant:</strong> {c.diretriz}
                <div className="mt-1 text-xs text-slate-400">
                  {hora(c.decidido_em)}
                </div>
              </div>
            )}
          </article>
        ))}
        {!lista.length && (
          <p className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
            {loading ? "Carregando…" : "Nenhuma divergência nesta visão."}
          </p>
        )}
      </div>
      {caso && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form
            onSubmit={decidir}
            role="dialog"
            aria-modal="true"
            aria-labelledby="decisao-titulo"
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6"
          >
            <h2 id="decisao-titulo" className="text-lg font-black">
              Diretriz — {caso.voucher}
            </h2>
            <p className="text-sm text-slate-600">
              Autorizar devolve o aparelho à triagem funcional. A bipagem será
              exigida novamente e o contrato original será preservado.
            </p>
            <label className="block text-sm font-bold">
              Decisão
              <select
                required
                value={decisao}
                onChange={(e) => setDecisao(e.target.value)}
                className="mt-2 w-full rounded-xl border p-3"
              >
                <option value="">Selecione</option>
                <option value="autorizado">
                  Autorizar triagem com o aparelho recebido
                </option>
                <option value="devolver">
                  Manter segregado para devolução à origem
                </option>
              </select>
            </label>
            <label className="block text-sm font-bold">
              Diretriz / justificativa
              <textarea
                required
                minLength={5}
                value={diretriz}
                onChange={(e) => setDiretriz(e.target.value)}
                className="mt-2 w-full rounded-xl border p-3"
              />
            </label>
            {erro && (
              <p role="alert" className="text-sm text-rose-700">
                {erro}
              </p>
            )}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCaso(null)}
                className="rounded-xl border px-4 py-3"
              >
                Cancelar
              </button>
              <button
                disabled={loading || !decisao || diretriz.trim().length < 5}
                className="rounded-xl bg-violet-700 px-4 py-3 font-bold text-white disabled:opacity-40"
              >
                Registrar decisão
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
