import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowRight, Box, CheckCircle, ClipboardCheck, Loader,
  MapPin, PackageCheck, RotateCcw, ScanLine, SkipForward, Warehouse, X,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  biparImeiCargaInicial,
  carregarContextoCargaInicial,
  confirmarCaixaCargaInicial,
  desfazerCargaInicial,
  finalizarCargaInicial,
  iniciarCargaInicial,
  pularPosicaoCargaInicial,
} from "../services/cargaInicialWmsService.js";

const COLUNAS_SEQUENCIA = ["A", "B", "C", "D", "E", "F"];
const COLUNAS_VISUAIS = ["F", "E", "D", "C", "B", "A"];
const LINHAS = Array.from({ length: 10 }, (_, i) => i + 1);

const GRADES_RUA = {
  1: "QUEBRADO", 2: "QUEBRADO", 3: "QUEBRADO", 4: "QUEBRADO",
  5: "QUEBRADO", 6: "QUEBRADO", 7: "REGULAR", 8: "BOM", 9: "BOM",
  10: "MUITO BOM", 11: "MUITO BOM", 12: "EXCELENTE", 13: "EXCELENTE",
  14: "LIKE NEW", 15: "OUTROS",
};

function enderecoCurto(posicao) {
  return posicao ? `AP ${posicao.coluna}${String(posicao.linha).padStart(2, "0")}` : "Andar concluído";
}

function Aviso({ tipo = "ok", children }) {
  const erro = tipo === "erro";
  return (
    <div className={`flex items-start gap-2 rounded-2xl px-4 py-3 text-sm font-bold ring-1 ${
      erro ? "bg-red-50 text-red-700 ring-red-200" : "bg-emerald-50 text-emerald-700 ring-emerald-200"
    }`}>
      {erro ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>{children}</span>
    </div>
  );
}

function CartaoNumero({ rotulo, valor, cor = "text-slate-800" }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 shadow-sm ring-1 ring-slate-200">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{rotulo}</p>
      <p className={`mt-1 text-2xl font-black ${cor}`}>{valor}</p>
    </div>
  );
}

function ModalSegregacao({ pendente, codigo, setCodigo, carregando, onConfirmar, onDesfazer, inputRef }) {
  if (!pendente) return null;
  const motivo = pendente.motivo || pendente.wms_caixas_analise?.motivo || "Material separado para análise.";
  const caixa = pendente.caixa || pendente.caixa_codigo;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-[32px] bg-white shadow-2xl">
        <div className="bg-amber-500 px-6 py-5 text-white">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-8 w-8" />
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em]">Não armazenar no apartamento</p>
              <h2 className="text-2xl font-black">Material segregado</h2>
            </div>
          </div>
        </div>
        <div className="space-y-5 p-6">
          <div className="rounded-3xl bg-amber-50 p-6 text-center ring-2 ring-amber-300">
            <p className="text-sm font-black uppercase tracking-wider text-amber-700">Colocar na</p>
            <p className="mt-1 text-4xl font-black text-amber-900">{caixa}</p>
            <p className="mt-3 text-sm font-semibold text-amber-800">{motivo}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-[10px] font-black uppercase text-slate-400">IMEI</p>
              <p className="mt-1 font-mono text-lg font-black text-slate-800">{pendente.imei}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-[10px] font-black uppercase text-slate-400">Status Gaia</p>
              <p className="mt-1 text-sm font-black text-slate-800">{pendente.status_gaia || "Sem cadastro"}</p>
            </div>
          </div>

          <form onSubmit={onConfirmar}>
            <label className="text-xs font-black uppercase tracking-wider text-slate-500">Bipe a etiqueta {caixa}</label>
            <div className="mt-2 flex gap-2">
              <input
                ref={inputRef}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoComplete="off"
                className="min-w-0 flex-1 rounded-2xl border-2 border-amber-300 px-4 py-4 font-mono text-lg font-black outline-none focus:border-amber-500"
                placeholder={caixa}
              />
              <button disabled={carregando || !codigo.trim()} className="rounded-2xl bg-amber-500 px-5 font-black text-white disabled:opacity-50">
                {carregando ? <Loader className="h-5 w-5 animate-spin" /> : "Confirmar"}
              </button>
            </div>
          </form>

          <button onClick={onDesfazer} disabled={carregando} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-500 hover:bg-slate-50">
            <X className="h-4 w-4" /> Cancelar esta bipagem
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CargaInicialEstoquePage() {
  const { user } = useAuth();
  const [rua, setRua] = useState(1);
  const [bloco, setBloco] = useState(1);
  const [andar, setAndar] = useState(1);
  const [sessao, setSessao] = useState(null);
  const [mapa, setMapa] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [pendente, setPendente] = useState(null);
  const [imei, setImei] = useState("");
  const [codigoCaixa, setCodigoCaixa] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const scanRef = useRef(null);
  const caixaRef = useRef(null);

  useEffect(() => {
    if (Number(rua) === 15 && Number(bloco) !== 1) setBloco(1);
  }, [rua, bloco]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (pendente) caixaRef.current?.focus();
      else if (sessao) scanRef.current?.focus();
    }, 30);
    return () => clearTimeout(timer);
  }, [sessao, pendente, mapa]);

  const pulados = useMemo(
    () => new Set(eventos.filter((e) => e.resultado === "pulado").map((e) => Number(e.endereco_id))),
    [eventos]
  );

  const mapaPorChave = useMemo(() => {
    const resultado = new Map();
    mapa.forEach((p) => resultado.set(`${p.coluna}-${p.linha}`, p));
    return resultado;
  }, [mapa]);

  const posicoesOrdenadas = useMemo(
    () => COLUNAS_SEQUENCIA.flatMap((coluna) =>
      LINHAS.map((linha) => mapaPorChave.get(`${coluna}-${linha}`)).filter(Boolean)
    ),
    [mapaPorChave]
  );

  const atual = posicoesOrdenadas.find(
    (p) => p.status_endereco === "livre" && !pulados.has(Number(p.endereco_id))
  ) || null;

  const resumo = useMemo(() => ({
    ocupados: mapa.filter((p) => p.status_endereco === "ocupado").length,
    reservados: mapa.filter((p) => p.status_endereco === "reservado").length,
    bloqueados: mapa.filter((p) => p.status_endereco === "bloqueado").length,
    pulados: pulados.size,
    restantes: posicoesOrdenadas.filter((p) => p.status_endereco === "livre" && !pulados.has(Number(p.endereco_id))).length,
  }), [mapa, posicoesOrdenadas, pulados]);

  async function atualizarContexto(sessaoBase = sessao) {
    if (!sessaoBase) return;
    const contexto = await carregarContextoCargaInicial(sessaoBase);
    setSessao(contexto.sessao);
    setMapa(contexto.mapa);
    setEventos(contexto.eventos);
    setPendente(contexto.segregacaoPendente);
    if (contexto.segregacaoPendente) setCodigoCaixa("");
  }

  async function iniciar() {
    setCarregando(true);
    setFeedback(null);
    try {
      const novaSessao = await iniciarCargaInicial(rua, bloco, andar, user.id);
      setSessao(novaSessao);
      await atualizarContexto(novaSessao);
      setFeedback({ tipo: "ok", msg: "Carga iniciada. Bipe o primeiro IMEI indicado." });
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setCarregando(false);
    }
  }

  async function bipar(e) {
    e.preventDefault();
    if (!imei.trim() || !atual || carregando || pendente) return;
    setCarregando(true);
    setFeedback(null);
    try {
      const resultado = await biparImeiCargaInicial(sessao.id, atual.coluna, atual.linha, imei, user.id);
      setImei("");
      if (resultado.decisao === "segregar") {
        setPendente(resultado);
        setFeedback(null);
      } else {
        setFeedback({
          tipo: "ok",
          msg: `${resultado.imei} alocado em ${resultado.local}. ${resultado.modelo || "Produto identificado."}`,
        });
        await atualizarContexto();
      }
    } catch (e) {
      setImei("");
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setCarregando(false);
    }
  }

  async function confirmarCaixa(e) {
    e.preventDefault();
    if (!pendente || !codigoCaixa.trim() || carregando) return;
    setCarregando(true);
    try {
      const resultado = await confirmarCaixaCargaInicial(pendente.evento_id || pendente.id, codigoCaixa, user.id);
      setPendente(null);
      setCodigoCaixa("");
      setFeedback({ tipo: "ok", msg: `${resultado.imei} segregado corretamente na ${resultado.caixa}. O apartamento permanece livre.` });
      await atualizarContexto();
    } catch (e) {
      setCodigoCaixa("");
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setCarregando(false);
    }
  }

  async function pular() {
    if (!atual || carregando || pendente) return;
    setCarregando(true);
    try {
      await pularPosicaoCargaInicial(sessao.id, atual.coluna, atual.linha, user.id);
      setFeedback({ tipo: "ok", msg: `${enderecoCurto(atual)} marcado como vazio.` });
      await atualizarContexto();
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setCarregando(false);
    }
  }

  async function desfazer() {
    if (!sessao || carregando) return;
    setCarregando(true);
    try {
      const resultado = await desfazerCargaInicial(sessao.id, user.id);
      setPendente(null);
      setCodigoCaixa("");
      setFeedback({ tipo: "ok", msg: `Ação desfeita${resultado.imei ? ` para o IMEI ${resultado.imei}` : ""}.` });
      await atualizarContexto();
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setCarregando(false);
    }
  }

  async function finalizar() {
    if (!sessao || carregando || pendente) return;
    if (!window.confirm("Finalizar a carga deste andar?")) return;
    setCarregando(true);
    try {
      await finalizarCargaInicial(sessao.id, user.id);
      setFeedback({ tipo: "ok", msg: `Carga da RUA ${rua} / BL ${String(bloco).padStart(2, "0")} / AD ${String(andar).padStart(2, "0")} finalizada.` });
      setSessao(null);
      setMapa([]);
      setEventos([]);
      setPendente(null);
    } catch (e) {
      setFeedback({ tipo: "erro", msg: e.message });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="space-y-5 pb-10">
      <ModalSegregacao
        pendente={pendente}
        codigo={codigoCaixa}
        setCodigo={setCodigoCaixa}
        carregando={carregando}
        onConfirmar={confirmarCaixa}
        onDesfazer={desfazer}
        inputRef={caixaRef}
      />

      <section className="rounded-[28px] bg-gradient-to-r from-[#5B176F] to-[#8C35A4] p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-purple-200">WMS - Inventário de implantação</p>
            <h1 className="mt-1 text-2xl font-black">Carga Inicial do Estoque</h1>
            <p className="mt-1 text-sm text-purple-100">Bipagem sequencial por apartamento com segregação automática.</p>
          </div>
          <Warehouse className="h-12 w-12 text-white/70" />
        </div>
      </section>

      {feedback && <Aviso tipo={feedback.tipo}>{feedback.msg}</Aviso>}

      {!sessao ? (
        <section className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-purple-100">
          <div className="mb-5 flex items-center gap-3">
            <MapPin className="h-6 w-6 text-[#7F2D92]" />
            <div>
              <h2 className="font-black text-slate-800">Selecione o ponto de início</h2>
              <p className="text-sm text-slate-500">O sistema retomará uma sessão aberta neste mesmo andar, se existir.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-xs font-black uppercase text-slate-500">Rua
              <select value={rua} onChange={(e) => setRua(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-800 outline-none focus:border-purple-400">
                {Array.from({ length: 15 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>RUA {String(n).padStart(2, "0")} - {GRADES_RUA[n]}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase text-slate-500">Bloco
              <select value={bloco} onChange={(e) => setBloco(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-800 outline-none focus:border-purple-400">
                {Array.from({ length: Number(rua) === 15 ? 1 : 5 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>BL {String(n).padStart(2, "0")}</option>)}
              </select>
            </label>
            <label className="text-xs font-black uppercase text-slate-500">Andar
              <select value={andar} onChange={(e) => setAndar(Number(e.target.value))} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-base font-bold text-slate-800 outline-none focus:border-purple-400">
                {[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>AD {String(n).padStart(2, "0")}</option>)}
              </select>
            </label>
          </div>
          <button onClick={iniciar} disabled={carregando} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#7F2D92] px-5 py-4 font-black text-white shadow-lg shadow-purple-200 disabled:opacity-50">
            {carregando ? <Loader className="h-5 w-5 animate-spin" /> : <><ScanLine className="h-5 w-5" /> Iniciar bipagem deste andar</>}
          </button>
        </section>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <CartaoNumero rotulo="Alocados nesta sessão" valor={sessao.total_alocados || 0} cor="text-emerald-600" />
            <CartaoNumero rotulo="Segregados" valor={sessao.total_segregados || 0} cor="text-amber-600" />
            <CartaoNumero rotulo="Posições vazias" valor={sessao.total_pulados || 0} />
            <CartaoNumero rotulo="Já ocupados" valor={resumo.ocupados} cor="text-blue-600" />
            <CartaoNumero rotulo="Restantes" valor={resumo.restantes} cor="text-[#7F2D92]" />
          </section>

          <section className="grid gap-5 xl:grid-cols-[0.85fr_1.15fr]">
            <div className="space-y-4">
              <div className="rounded-[28px] bg-white p-6 shadow-sm ring-1 ring-purple-100">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-wider text-slate-400">Endereço atual</p>
                    <p className="mt-1 text-sm font-bold text-slate-600">RUA {String(sessao.rua).padStart(2, "0")} · BL {String(sessao.bloco).padStart(2, "0")} · AD {String(sessao.andar).padStart(2, "0")}</p>
                  </div>
                  <span className="rounded-full bg-purple-100 px-3 py-1 text-xs font-black text-purple-700">{GRADES_RUA[sessao.rua]}</span>
                </div>

                <div className="my-5 rounded-3xl bg-[#16071D] p-6 text-center text-white">
                  <p className="text-xs font-black uppercase tracking-[0.25em] text-purple-300">Guardar no</p>
                  <p className="mt-1 text-5xl font-black">{enderecoCurto(atual)}</p>
                </div>

                {atual ? (
                  <form onSubmit={bipar}>
                    <label className="text-xs font-black uppercase tracking-wider text-slate-500">Bipe o IMEI ou serial</label>
                    <div className="mt-2 flex gap-2">
                      <input
                        ref={scanRef}
                        value={imei}
                        onChange={(e) => setImei(e.target.value)}
                        disabled={carregando || !!pendente}
                        autoComplete="off"
                        className="min-w-0 flex-1 rounded-2xl border-2 border-purple-200 px-4 py-4 font-mono text-lg font-black outline-none focus:border-[#7F2D92] disabled:bg-slate-100"
                        placeholder="Aguardando bipagem..."
                      />
                      <button disabled={carregando || !imei.trim()} className="rounded-2xl bg-[#7F2D92] px-5 text-white disabled:opacity-50">
                        {carregando ? <Loader className="h-5 w-5 animate-spin" /> : <ArrowRight className="h-5 w-5" />}
                      </button>
                    </div>
                  </form>
                ) : (
                  <Aviso>Não há mais posições livres neste andar. Finalize a carga.</Aviso>
                )}

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button onClick={pular} disabled={!atual || carregando || !!pendente} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    <SkipForward className="h-4 w-4" /> Pular posição vazia
                  </button>
                  <button onClick={desfazer} disabled={!eventos.length || carregando} className="flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                    <RotateCcw className="h-4 w-4" /> Desfazer última ação
                  </button>
                </div>
              </div>

              <button onClick={finalizar} disabled={carregando || !!pendente} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 px-5 py-4 font-black text-white disabled:opacity-50">
                <ClipboardCheck className="h-5 w-5" /> Finalizar carga deste andar
              </button>
            </div>

            <div className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-purple-100">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="font-black text-slate-800">Mapa do andar</h2>
                  <p className="text-xs text-slate-500">A fica à direita; a sequência desce A01 até A10.</p>
                </div>
                <PackageCheck className="h-6 w-6 text-[#7F2D92]" />
              </div>

              <div className="grid grid-cols-6 gap-1.5">
                {COLUNAS_VISUAIS.map((coluna) => <div key={coluna} className="pb-1 text-center text-xs font-black text-slate-400">{coluna}</div>)}
                {LINHAS.flatMap((linha) => COLUNAS_VISUAIS.map((coluna) => {
                  const posicao = mapaPorChave.get(`${coluna}-${linha}`);
                  if (!posicao) return <div key={`${coluna}-${linha}`} />;
                  const ehAtual = atual?.endereco_id === posicao.endereco_id;
                  const foiPulada = pulados.has(Number(posicao.endereco_id));
                  const classe = ehAtual
                    ? "bg-[#7F2D92] text-white ring-2 ring-purple-300 animate-pulse"
                    : foiPulada
                      ? "bg-slate-200 text-slate-500"
                      : posicao.status_endereco === "ocupado"
                        ? "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200"
                        : posicao.status_endereco === "reservado"
                          ? "bg-amber-100 text-amber-700 ring-1 ring-amber-200"
                          : posicao.status_endereco === "bloqueado"
                            ? "bg-red-100 text-red-700 ring-1 ring-red-200"
                            : "bg-white text-slate-500 ring-1 ring-slate-200";
                  return (
                    <div key={`${coluna}-${linha}`} title={posicao.imei || posicao.status_endereco} className={`flex min-h-11 items-center justify-center rounded-xl text-xs font-black ${classe}`}>
                      {coluna}{String(linha).padStart(2, "0")}
                    </div>
                  );
                }))}
              </div>

              <div className="mt-4 flex flex-wrap gap-3 text-[10px] font-bold text-slate-500">
                <span>🟣 Atual</span><span>🟢 Ocupado</span><span>🟡 Reservado</span><span>⬜ Livre</span><span>⬛ Vazio/pulado</span>
              </div>
            </div>
          </section>

          <section className="rounded-[28px] bg-white p-5 shadow-sm ring-1 ring-purple-100">
            <div className="mb-3 flex items-center gap-2"><Box className="h-5 w-5 text-[#7F2D92]" /><h2 className="font-black text-slate-800">Últimas bipagens</h2></div>
            {!eventos.length ? <p className="text-sm text-slate-400">Nenhuma bipagem nesta sessão.</p> : (
              <div className="space-y-2">
                {eventos.slice(0, 8).map((evento) => (
                  <div key={evento.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-slate-50 px-4 py-3 ring-1 ring-slate-100">
                    <div>
                      <p className="font-mono text-sm font-black text-slate-800">{evento.imei || "POSIÇÃO VAZIA"}</p>
                      <p className="text-xs text-slate-500">{evento.status_gaia || evento.regra}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-black ${
                      evento.resultado === "alocado" ? "bg-emerald-100 text-emerald-700"
                        : evento.resultado === "pulado" ? "bg-slate-200 text-slate-600"
                          : "bg-amber-100 text-amber-700"
                    }`}>
                      {evento.resultado === "alocado" ? "ALOCADO" : evento.resultado === "pulado" ? "VAZIO" : evento.caixa_codigo}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}