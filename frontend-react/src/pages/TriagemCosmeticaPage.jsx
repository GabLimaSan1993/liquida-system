import { useState, useEffect } from "react";
import {
  Search, CheckCircle, AlertTriangle, RotateCcw, RefreshCw, Loader, Zap, ArrowLeft,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  listarAguardandoCosmetica,
  carregarParaCosmetica,
  buscarOpcoes,
  salvarCosmetica,
  devolverParaFuncional,
  calcularGradeFinal,
  exibicaoGrade,
} from "../services/cosmeticaService.js";

const PARTES = [
  { id: "tela",     rotulo: "Tela" },
  { id: "laterais", rotulo: "Laterais" },
  { id: "traseira", rotulo: "Traseira" },
  { id: "funcional", rotulo: "Funcionalidades" },
];

function Aviso({ tipo, children }) {
  const cor = tipo === "erro"
    ? "bg-red-50 text-red-700 ring-red-200"
    : tipo === "aviso"
    ? "bg-amber-50 text-amber-800 ring-amber-200"
    : "bg-emerald-50 text-emerald-700 ring-emerald-200";
  return (
    <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 ring-1 text-sm ${cor}`}>
      {tipo === "ok"
        ? <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" />
        : <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />}
      <div className="font-semibold">{children}</div>
    </div>
  );
}

function Passos({ atual, respondidas }) {
  return (
    <div className="mb-6 flex items-center gap-2">
      {PARTES.map((p, i) => {
        const feito = respondidas.includes(p.id);
        const ativo = i === atual;
        return (
          <div key={p.id} className="flex flex-1 items-center gap-2">
            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
              ativo ? "bg-[#7F2D92] text-white"
                    : feito ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-500"
            }`}>
              {feito && !ativo ? "✓" : i + 1}
            </div>
            <span className={`text-[11px] font-semibold ${ativo ? "text-[#7F2D92]" : "text-slate-400"}`}>
              {p.rotulo}
            </span>
            {i < PARTES.length - 1 && <div className="h-px flex-1 bg-slate-200" />}
          </div>
        );
      })}
    </div>
  );
}

export default function TriagemCosmeticaPage() {
  const { user } = useAuth();

  const [etapa, setEtapa]     = useState("voucher");
  const [busca, setBusca]     = useState("");
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [fila, setFila]       = useState([]);
  const [carregandoFila, setCarregandoFila] = useState(true);

  const [opcoes, setOpcoes]   = useState({ tela: [], laterais: [], traseira: [] });
  const [dados, setDados]     = useState(null);
  const [passo, setPasso]     = useState(0);
  const [escolhas, setEscolhas] = useState({ tela: null, laterais: null, traseira: null });
  const [observacao, setObservacao] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);
  const [resultado, setResultado]   = useState(null);

  useEffect(() => {
    carregarFila();
    buscarOpcoes().then(setOpcoes).catch(e => erro(e.message));
  }, []);

  function erro(msg) {
    setFeedback({ tipo: "erro", msg });
    setTimeout(() => setFeedback(null), 7000);
  }

  async function carregarFila() {
    setCarregandoFila(true);
    try { setFila(await listarAguardandoCosmetica()); }
    catch (e) { erro(e.message); }
    finally { setCarregandoFila(false); }
  }

  function reiniciar() {
    setEtapa("voucher"); setBusca(""); setDados(null); setPasso(0);
    setEscolhas({ tela: null, laterais: null, traseira: null });
    setObservacao(""); setDevolvendo(false); setResultado(null);
    carregarFila();
  }

  async function abrir(voucher) {
    setCarregando(true);
    try {
      const r = await carregarParaCosmetica(voucher);
      if (!r.ok) { erro(r.erro); return; }
      setDados(r);
      setPasso(0);
      setEscolhas({ tela: null, laterais: null, traseira: null });
      setEtapa("perguntas");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  function escolher(parte, grade) {
    setEscolhas(prev => ({ ...prev, [parte]: grade }));
    setPasso(p => p + 1);
  }

  async function handleSalvar() {
    setCarregando(true);
    try {
      const r = await salvarCosmetica({ dados, ...escolhas, userId: user.id });
      if (!r.ok) { erro(r.erro); return; }
      setResultado(r);
      setEtapa("fim");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  async function handleDevolver() {
    setCarregando(true);
    try {
      const r = await devolverParaFuncional({
        voucher: dados.voucher, ...escolhas, observacao, userId: user.id,
      });
      setResultado({ devolvido: true, status: r.status });
      setEtapa("fim");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]";
  const respondidas = Object.entries(escolhas).filter(([, v]) => v).map(([k]) => k);

  // Prévia da grade enquanto o operador responde — ajuda a perceber erro antes
  // de confirmar, sem precisar salvar para descobrir o resultado.
  const previa = dados && escolhas.tela && escolhas.laterais && escolhas.traseira
    ? calcularGradeFinal({ ...escolhas, temDefeitoFuncional: dados.temDefeitoFuncional, bateria: dados.bateria })
    : null;

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#6B1F87]">Triagem Cosmética</h2>
        {etapa !== "voucher" && (
          <button onClick={reiniciar}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-200">
            <RotateCcw className="h-3.5 w-3.5" /> Novo aparelho
          </button>
        )}
      </div>

      {feedback && <div className="mb-4"><Aviso tipo={feedback.tipo}>{feedback.msg}</Aviso></div>}

      {/* ── Fila ── */}
      {etapa === "voucher" && (
        <div>
          <p className="mb-2 text-sm text-slate-500">Bipe o voucher ou escolha da fila</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input autoFocus value={busca}
                onChange={e => setBusca(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && busca.trim() && abrir(busca)}
                placeholder="YBV417755"
                className={`${inputCls} pl-9 font-mono`} />
            </div>
            <button onClick={() => abrir(busca)} disabled={!busca.trim() || carregando}
              className="rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
              {carregando ? "Buscando..." : "Consultar"}
            </button>
          </div>

          <div className="mt-7 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">
              Aguardando cosmética ·{" "}
              <span className="font-semibold text-slate-500">
                {fila.length} {fila.length === 1 ? "aparelho" : "aparelhos"}
              </span>
            </p>
            <button onClick={carregarFila} disabled={carregandoFila}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 disabled:opacity-40">
              <RefreshCw className={`h-3 w-3 ${carregandoFila ? "animate-spin" : ""}`} /> Atualizar
            </button>
          </div>

          {carregandoFila ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader className="h-4 w-4 animate-spin" /> Carregando fila...
            </div>
          ) : !fila.length ? (
            <div className="mt-3 rounded-2xl bg-slate-50 py-8 text-center text-sm text-slate-400 ring-1 ring-slate-200">
              Nenhum aparelho aguardando triagem cosmética.
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
              <table className="w-full min-w-[820px] text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-3 py-2.5 font-bold">Voucher</th>
                    <th className="px-3 py-2.5 font-bold">IMEI</th>
                    <th className="px-3 py-2.5 font-bold">Aparelho</th>
                    <th className="px-3 py-2.5 font-bold">Bateria</th>
                    <th className="px-3 py-2.5 font-bold">Funcional</th>
                    <th className="px-3 py-2.5 font-bold">Desde</th>
                    <th className="px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody>
                  {fila.map(i => (
                    <tr key={i.voucher} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 font-mono font-semibold text-slate-700">{i.voucher}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-600">{i.imei || "—"}</td>
                      <td className="px-3 py-2.5 text-slate-700">
                        {[i.marca, i.modelo].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">{i.bateria || "—"}</td>
                      <td className="px-3 py-2.5">
                        {i.defeito
                          ? <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">com defeito</span>
                          : <span className="text-xs text-slate-400">sem defeito</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {i.desde ? new Date(i.desde).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => abrir(i.voucher)} disabled={carregando}
                          className="rounded-lg bg-[#7F2D92] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
                          Triar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Perguntas ── */}
      {etapa === "perguntas" && dados && (
        <div>
          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-[#FCFAFF] px-4 py-2.5 ring-1 ring-[#E9D5FF] text-xs">
            <span className="font-mono font-bold text-[#7F2D92]">{dados.voucher}</span>
            <span className="font-mono text-slate-600">{dados.imei}</span>
            {dados.produto?.marca  && <span className="text-slate-600">{dados.produto.marca}</span>}
            {dados.produto?.modelo && <span className="font-semibold text-slate-700">{dados.produto.modelo}</span>}
            {dados.produto?.armazenamento && <span className="text-slate-600">{dados.produto.armazenamento}</span>}
            {dados.bateriaPercentual != null && <span className="text-slate-500">bateria {dados.bateriaPercentual}%</span>}
          </div>

          {dados.temDefeitoFuncional && (
            <div className="mb-4">
              <Aviso tipo="aviso">
                A triagem funcional diagnosticou defeito. A grade final será QUEBRADO,
                independente da estética — mas responda mesmo assim, o registro é usado
                para histórico e conferência.
              </Aviso>
            </div>
          )}

          <Passos atual={passo} respondidas={respondidas} />

          {passo < 3 ? (
            <div>
              <p className="mb-3 text-sm text-slate-600">
                Selecione a opção que mais se enquadra com o produto:
              </p>
              <p className="mb-2 text-sm font-bold text-[#6B1F87]">{PARTES[passo].rotulo}</p>
              <div className="space-y-2">
                {(opcoes[PARTES[passo].id] || []).map(o => (
                  <button key={o.id} onClick={() => escolher(PARTES[passo].id, o.grade)}
                    className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-[13px] text-slate-600 transition hover:border-[#7F2D92] hover:bg-[#FCFAFF]">
                    {o.descricao.split("\n").map((l, i) => (
                      <span key={i} className="block">- {l}</span>
                    ))}
                  </button>
                ))}
              </div>
              {passo > 0 && (
                <button onClick={() => setPasso(passo - 1)}
                  className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600">
                  <ArrowLeft className="h-3 w-3" /> Voltar
                </button>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-3 text-sm text-slate-600">
                Selecione a opção que mais se enquadra com o produto:
              </p>
              <p className="mb-2 text-sm font-bold text-[#6B1F87]">Funcionalidades</p>

              {!devolvendo ? (
                <div className="space-y-2">
                  <button onClick={handleSalvar} disabled={carregando}
                    className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-[13px] text-slate-600 transition hover:border-emerald-500 hover:bg-emerald-50 disabled:opacity-40">
                    - Sem falhas em nenhuma das funcionalidades
                  </button>
                  <button onClick={() => setDevolvendo(true)}
                    className="block w-full rounded-xl border border-slate-200 px-4 py-3 text-left text-[13px] text-slate-600 transition hover:border-rose-500 hover:bg-rose-50">
                    - Qualquer problema funcional (volta para a triagem funcional)
                  </button>
                </div>
              ) : (
                <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                  <p className="text-sm font-bold text-rose-800">Devolver para triagem funcional</p>
                  <p className="mb-3 text-xs text-rose-700">
                    Descreva o problema encontrado. As respostas de estética já dadas ficam guardadas.
                  </p>
                  <textarea rows={2} value={observacao}
                    onChange={e => setObservacao(e.target.value)}
                    placeholder="Ex: aparelho não carrega"
                    className={inputCls} />
                  <div className="mt-3 flex gap-2">
                    <button onClick={handleDevolver} disabled={!observacao.trim() || carregando}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-rose-700 disabled:opacity-40">
                      {carregando ? "Devolvendo..." : "Confirmar devolução"}
                    </button>
                    <button onClick={() => { setDevolvendo(false); setObservacao(""); }}
                      className="rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {previa && !devolvendo && (
                <div className="mt-5 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                  <p className="text-xs text-slate-500">Grade que será gravada</p>
                  <div className="mt-1 flex items-center gap-2">
                    <span className="text-lg font-bold text-slate-800">
                      {exibicaoGrade(previa).texto}
                    </span>
                    {exibicaoGrade(previa).raio && <Zap className="h-4 w-4 text-amber-500" />}
                  </div>
                  {previa.motivo && <p className="mt-1 text-xs text-slate-500">{previa.motivo}</p>}
                  <p className="mt-2 text-[11px] text-slate-400">
                    Tela {escolhas.tela} · Laterais {escolhas.laterais} · Traseira {escolhas.traseira}
                  </p>
                </div>
              )}

              <button onClick={() => setPasso(2)}
                className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600">
                <ArrowLeft className="h-3 w-3" /> Voltar
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Resultado ── */}
      {etapa === "fim" && resultado && (
        <div>
          {resultado.devolvido ? (
            <Aviso tipo="aviso">
              Aparelho devolvido. Está agora em "{resultado.status}".
            </Aviso>
          ) : (
            <>
              <p className="text-xs text-slate-500">Grade final</p>
              <div className="mt-1 flex items-center gap-2">
                <span className="text-2xl font-bold text-slate-800">
                  {exibicaoGrade(resultado).texto}
                </span>
                {exibicaoGrade(resultado).raio && <Zap className="h-5 w-5 text-amber-500" />}
              </div>
              {resultado.motivo && <p className="mt-1 text-sm text-slate-500">{resultado.motivo}</p>}
              <p className="mt-3 text-sm text-slate-500">
                Próxima etapa: <span className="font-semibold text-slate-700">{resultado.status}</span>
              </p>
            </>
          )}

          <button onClick={reiniciar}
            className="mt-5 rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87]">
            Próximo aparelho
          </button>
        </div>
      )}
    </div>
  );
}