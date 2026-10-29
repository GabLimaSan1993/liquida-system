import { useEffect, useState } from "react";
import {
  listarDivergencias,
  decidirDivergencia,
  regularizarDivergencia,
  enviarEmailDivergencia,
  etiquetaDivergencia,
} from "../../services/divergenciasImeiService";
const PROBLEMAS = { nao_liga: "Aparelhos não ligam", imei_divergente: "IMEI divergente", sem_ordem: "Sem Ordem" };
const problema = c => c.tipo_problema || "imei_divergente";
const hora = (x) => (x ? new Date(x).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—");
const envioEmAndamento = c => c.email_validado_em && ["pendente", "enviando"].includes(c.email_status)
  && Date.now() - new Date(c.email_atualizado_em).getTime() < (c.email_status === "enviando" ? 300000 : 120000);
export default function DivergenciasImeiV2Page() {
  const [casos, setCasos] = useState([]),
    [filtro, setFiltro] = useState("pendente"),
    [busca, setBusca] = useState(""),
    [tipo, setTipo] = useState("");
  const [loading, setLoading] = useState(true),
    [erro, setErro] = useState(""),
    [aviso, setAviso] = useState(""),
    [caso, setCaso] = useState(null),
    [decisao, setDecisao] = useState(""),
    [diretriz, setDiretriz] = useState("");
  const [correcao, setCorrecao] = useState(null);
  const [novoValor, setNovoValor] = useState("");
  const [justificativa, setJustificativa] = useState("");
  const [podeEnviarEmail, setPodeEnviarEmail] = useState(false);
  const [casoEmail, setCasoEmail] = useState(null);
  const [conferido, setConferido] = useState(false);
  const [enviandoEmail, setEnviandoEmail] = useState(false);
  async function carregar() {
    setLoading(true);
    setErro("");
    try {
      const r = await listarDivergencias();
      setCasos(r.casos || []);
      setPodeEnviarEmail(r.pode_enviar_email === true);
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
          setPodeEnviarEmail(r.pode_enviar_email === true);
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
  async function salvarCorrecao(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await regularizarDivergencia(correcao.id, correcao.acao, novoValor, justificativa);
      setCorrecao(null);
      setAviso("Correção registrada. Produto encaminhado à triagem funcional.");
      await carregar();
    } catch (e) { setErro(e.message); }
    finally { setLoading(false); }
  }
  async function enviarEmail(e) {
    e.preventDefault();
    if (!conferido || enviandoEmail) return;
    setEnviandoEmail(true);
    setErro("");
    setAviso("");
    try {
      const r = await enviarEmailDivergencia(casoEmail.id, conferido);
      setCasoEmail(null);
      setAviso(r.ja_enviado ? "O e-mail deste caso já foi enviado." : r.em_andamento
        ? "O envio deste caso já está em andamento. Atualize para consultar o resultado."
        : "Divergência validada. Envio do e-mail solicitado; atualize para acompanhar a confirmação.");
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviandoEmail(false);
    }
  }
  async function decidir(e) {
    e.preventDefault();
    setLoading(true);
    setErro("");
    try {
      await decidirDivergencia(caso.id, decisao, diretriz);
      setCaso(null);
      setAviso(decisao === "reconferencia"
        ? "Produto devolvido para a fila da Triagem Funcional, pronto para nova identificação e testes."
        : "Diretriz registrada e situação do aparelho atualizada.");
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
      (!tipo || problema(c) === tipo) &&
      `${c.voucher} ${c.imei1} ${c.imei2 || ""} ${c.modelo}`
        .toLowerCase()
        .includes(busca.toLowerCase()),
  );
  return (
    <div className="space-y-5 p-4 lg:p-7">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-black text-slate-900">
            Divergências — Assurant
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Aparelhos que não ligam, com IMEI divergente ou Sem Ordem. Validação do Leandro antes do envio à Assurant.
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
      <div className="space-y-3">
        <button type="button" onClick={() => setTipo("")} aria-pressed={!tipo} className="rounded-lg border bg-white px-4 py-2 text-sm font-bold">Todos os problemas</button>
        <div className="grid gap-3 sm:grid-cols-3">
          {Object.entries(PROBLEMAS).map(([chave, titulo]) => <button key={chave} type="button" onClick={() => setTipo(chave)} aria-pressed={tipo === chave}
            className={`rounded-2xl border p-4 text-left ${tipo === chave ? "border-violet-300 bg-violet-50" : "bg-white"}`}>
            <div className="text-xs font-bold text-slate-500">{titulo}</div>
            <div className="mt-2 text-2xl font-black">{casos.filter(c => problema(c) === chave && (!filtro || c.status === filtro)).length}</div>
          </button>)}
        </div>
      </div>
      <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">
        Cada caso aguarda a conferência do Leandro. Após validar, use o botão de envio do caso para avisar Luiz Affonso, Edyelves Bezerra e Alex Feliciano, com Jhonatan Nascimento e Gabriel Lima em cópia.
      </p>
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
            <option value="reconferencia">Retornado para triagem</option>
          </select>
        </label>
      </div>
      <div className="space-y-3">
        {lista.map((c) => (
          <article key={c.id} className="rounded-2xl border bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="font-black text-rose-700">
                  {c.voucher} · {PROBLEMAS[problema(c)]} · {c.status === "reconferencia" ? "Retornado para triagem" : c.status}
                </div>
                <p className="mt-1 text-sm font-bold">{c.modelo || "Modelo ainda não identificado"}</p>
                {c.motivo && <p className="mt-2 text-sm text-slate-600">{c.motivo}</p>}
                <p className="mt-1 text-xs text-slate-500">
                  Registrado por {c.criado_por_nome || c.criado_por} em {hora(c.criado_em)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => etiquetaDivergencia(c)}
                  className="rounded-xl border p-3 text-xs font-bold"
                >
                  Etiqueta
                </button>
                {podeEnviarEmail && c.status === "pendente" && !c.email_enviado_em && (
                  <button
                    disabled={loading || enviandoEmail || envioEmAndamento(c)}
                    onClick={() => {
                      setCasoEmail(c);
                      setConferido(false);
                      setErro("");
                      setAviso("");
                    }}
                    className="rounded-xl bg-emerald-700 p-3 text-xs font-bold text-white disabled:opacity-40"
                  >
                    {envioEmAndamento(c) ? "Envio em andamento" : c.email_validado_em ? "Tentar envio novamente" : "Validar e enviar e-mail"}
                  </button>
                )}
                {c.status === "pendente" && <button onClick={() => {setCorrecao({...c,acao:"voucher"});setNovoValor("");setJustificativa("");}} className="rounded-xl border p-3 text-xs font-bold">Corrigir voucher</button>}
                {c.status === "pendente" && problema(c)==="imei_divergente" && <button onClick={() => {setCorrecao({...c,acao:"imei"});setNovoValor(c.imei1||"");setJustificativa("");}} className="rounded-xl border p-3 text-xs font-bold">Corrigir IMEI</button>}
                {(c.status === "pendente" || c.status === "devolver") && (
                  <button
                    onClick={() => {
                      setCaso(c);
                      setDiretriz("");
                      setDecisao(c.status === "devolver" ? "reconferencia" : "");
                    }}
                    className="rounded-xl bg-violet-700 px-4 py-3 text-xs font-bold text-white"
                  >
                    {c.status === "devolver" ? "Voltar para funcional" : "Definir diretriz"}
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
                    {v || (t.startsWith("Bipado") ? "Não bipado" : "Sem referência")}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              Aviso:{" "}
              {c.email_enviado_em
                ? `enviado em ${hora(c.email_enviado_em)}`
                : c.email_erro || (c.email_validado_em ? "Envio solicitado" : "Aguardando validação do Leandro")}
            </p>
            {c.email_validado_em && (
              <p className="mt-1 text-xs text-slate-500">
                Validado por {c.email_validado_por_nome || "Gestão"} em {hora(c.email_validado_em)}
              </p>
            )}
            {c.diretriz && (
              <div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                <strong>{c.status === "reconferencia" ? "Motivo do retorno:" : "Diretriz Assurant:"}</strong> {c.diretriz}
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
      {correcao && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
        <form onSubmit={salvarCorrecao} className="w-full max-w-lg space-y-4 rounded-xl bg-white p-6">
          <h2 className="font-black">Regularizar {correcao.acao==="voucher"?"voucher":"IMEI"} — {correcao.voucher}</h2>
          <input aria-label="Identificador correto" required value={novoValor} onChange={e=>setNovoValor(e.target.value)} placeholder="Identificador correto" className="w-full rounded border p-3" />
          <textarea aria-label="Justificativa" required minLength={8} value={justificativa} onChange={e=>setJustificativa(e.target.value)} placeholder="Justificativa da correção" className="w-full rounded border p-3" />
          <div className="flex gap-3"><button type="button" onClick={()=>setCorrecao(null)}>Cancelar</button><button disabled={loading} className="rounded bg-violet-700 px-4 py-2 text-white">Confirmar correção</button></div>
        </form>
      </div>}
      {casoEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <form onSubmit={enviarEmail} role="dialog" aria-modal="true" aria-labelledby="email-titulo"
            className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-6">
            <h2 id="email-titulo" className="text-lg font-black">Validar e enviar e-mail — {casoEmail.voucher}</h2>
            <p className="text-sm text-slate-600">Confira o aparelho e os dados registrados antes de confirmar a divergência para a Assurant.</p>
            <dl className="space-y-2 rounded-xl bg-slate-50 p-4 text-sm">
              {[["Problema", PROBLEMAS[problema(casoEmail)]], ["Modelo", casoEmail.modelo], ["Contrato", casoEmail.imei_esperado], ["Bipado 1", casoEmail.imei1], ["Bipado 2", casoEmail.imei2]].map(([titulo, valor]) => (
                <div key={titulo} className="flex justify-between gap-3"><dt className="font-bold">{titulo}</dt><dd className="break-all text-right">{valor || "Não informado"}</dd></div>
              ))}
            </dl>
            <label className="flex items-start gap-3 text-sm">
              <input type="checkbox" required checked={conferido} onChange={e => setConferido(e.target.checked)} className="mt-1" />
              Conferi o aparelho e confirmo que a divergência é real, sem erro de digitação ou da operação.
            </label>
            {erro && <p role="alert" className="text-sm text-rose-700">{erro}</p>}
            <div className="flex justify-end gap-3">
              <button type="button" disabled={enviandoEmail} onClick={() => setCasoEmail(null)} className="rounded-xl border px-4 py-3">Cancelar</button>
              <button disabled={!conferido || enviandoEmail} className="rounded-xl bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-40">
                {enviandoEmail ? "Solicitando envio…" : "Confirmar divergência e enviar e-mail"}
              </button>
            </div>
          </form>
        </div>
      )}
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
              {caso.status === "devolver"
                ? "Este aparelho foi segregado para devolução à origem. Ao confirmar, voltará para a fila da Triagem Funcional sem apagar o registro da decisão anterior."
                : problema(caso) === "nao_liga"
                ? "Escolha entre encaminhar para laudo, retornar para uma nova triagem ou segregar para devolução. A decisão e a justificativa ficarão registradas."
                : problema(caso) === "sem_ordem"
                ? "Autorizar libera a triagem sem ordem ativa. A referência consultada e a justificativa serão preservadas."
                : "Autorizar devolve o aparelho à triagem funcional, com nova bipagem e preservação do contrato original."}
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
                {caso.status === "pendente" && (
                  <option value="autorizado">
                    {problema(caso) === "nao_liga" ? "Encaminhar para laudo" : problema(caso) === "sem_ordem" ? "Autorizar triagem sem ordem" : "Autorizar triagem com o aparelho recebido"}
                  </option>
                )}
                <option value="reconferencia">Voltar para Triagem Funcional</option>
                {caso.status === "pendente" && (
                  <option value="devolver">Manter segregado para devolução à origem</option>
                )}
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
