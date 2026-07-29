import { useState, useEffect } from "react";
import {
  Search, CheckCircle, AlertTriangle, Loader, RotateCcw, ArrowLeft,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  consultarVoucher,
  validarImeiTradein,
  registrarDivergenciaImei,
  buscarPerguntas,
  listarDefeitos,
  salvarTriagemFuncional,
  carregarCatalogo,
  cadastrarModeloPendente,
  buscarFaixasBateria,
  classificarBateria,
  resolverSku,
} from "../services/triagemFuncionalService.js";



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

function BarraContexto({ voucher, imei, produto }) {
  return (
    <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-[#FCFAFF] px-4 py-2.5 ring-1 ring-[#E9D5FF] text-xs">
      <span className="font-mono font-bold text-[#7F2D92]">{voucher}</span>
      <span className="font-mono text-slate-600">{imei}</span>
      {produto?.marca  && <span className="text-slate-600">{produto.marca}</span>}
      {produto?.modelo && <span className="font-semibold text-slate-700">{produto.modelo}</span>}
      {produto?.armazenamento && <span className="text-slate-600">{produto.armazenamento}</span>}
      {produto?.cor    && <span className="text-slate-500">{produto.cor}</span>}
    </div>
  );
}

function Progresso({ atual, total }) {
  return (
    <div className="mt-5 flex justify-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${
          i <= atual ? "bg-[#7F2D92]" : "bg-slate-200"
        }`} />
      ))}
    </div>
  );
}

export default function TriagemFuncionalPage() {
  const { user } = useAuth();

  const [etapa, setEtapa]         = useState("voucher");
  const [busca, setBusca]         = useState("");
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback]   = useState(null);

  const [ctx, setCtx]             = useState(null);
  const [produto, setProduto]     = useState({ marca: "", modelo: "", armazenamento: "", cor: "" });

  const [imeiDigitado, setImeiDigitado] = useState("");
  const [validacao, setValidacao] = useState(null);

  const [perguntas, setPerguntas] = useState([]);
  const [idx, setIdx]             = useState(0);
  const [respostas, setRespostas] = useState([]);

  const [catalogo, setCatalogo]   = useState({ produtos: [] });
  const [modeloLivre, setModeloLivre] = useState(false);

  const [defeitosCatalogo, setDefeitosCatalogo] = useState([]);
  const [pedindoDefeito, setPedindoDefeito]     = useState(false);
  const [defeitosSel, setDefeitosSel]           = useState([]);
  const [defeitosTodos, setDefeitosTodos]       = useState([]);

  const [faixasBateria, setFaixasBateria] = useState([]);
  const [valorBateria, setValorBateria]   = useState("");
  const [bateria, setBateria]           = useState(null);
  const [resultado, setResultado]       = useState(null);

  useEffect(() => {
    listarDefeitos().then(setDefeitosCatalogo).catch(() => {});
    carregarCatalogo().then(setCatalogo).catch(() => {});
    buscarFaixasBateria().then(setFaixasBateria).catch(() => {});
  }, []);

  // Listas derivadas: modelo depende da marca, capacidade depende do modelo.
  const marcas = [...new Set(catalogo.produtos.map(p => p.marca))].sort();
  const modelos = [...new Set(catalogo.produtos
    .filter(p => p.marca === produto.marca).map(p => p.modelo))].sort();
  const capacidades = [...new Set(catalogo.produtos
    .filter(p => p.marca === produto.marca && p.modelo === produto.modelo)
    .map(p => p.capacidade).filter(Boolean))].sort();
  const cores = [...new Set(catalogo.produtos
    .filter(p => p.marca === produto.marca && p.modelo === produto.modelo
              && p.capacidade === produto.armazenamento)
    .map(p => p.cor).filter(Boolean))].sort();
  const produtoCompleto = produto.marca && produto.modelo && produto.armazenamento && produto.cor;

  function erro(msg) {
    setFeedback({ tipo: "erro", msg });
    setTimeout(() => setFeedback(null), 6000);
  }

  function reiniciar() {
    setEtapa("voucher"); setBusca(""); setCtx(null); setValidacao(null);
    setImeiDigitado(""); setPerguntas([]); setIdx(0); setRespostas([]);
    setDefeitosSel([]); setDefeitosTodos([]); setPedindoDefeito(false);
    setPassoBateria(0); setBateria(null); setResultado(null);
    setProduto({ marca: "", modelo: "", armazenamento: "", cor: "" });
    setModeloLivre(false);
  }

  async function handleConsultar() {
    if (!busca.trim()) return;
    setCarregando(true);
    try {
      const r = await consultarVoucher(busca);
      if (!r.ok) { erro(r.erro); return; }
      setCtx(r);
      // Campos ficam EM BRANCO de propósito: o triador preenche pelo que tem
      // na mão. Pré-preencher faria ele confirmar em vez de conferir.
      setProduto({ marca: "", modelo: "", armazenamento: "", cor: "" });
      setModeloLivre(false);
      setEtapa("produto");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  async function handleSalvarProduto() {
    if (modeloLivre && produto.marca && produto.modelo) {
      try { await cadastrarModeloPendente(produto.marca, produto.modelo, produto.armazenamento, produto.cor); }
      catch { /* cadastro pendente não pode travar a bancada */ }
    }
    setEtapa("imei");
  }

  async function handleValidarImei() {
    if (!imeiDigitado.trim()) return;
    setCarregando(true);
    try {
      if (ctx.canal !== "YBV" || !ctx.temTradein) {
        setValidacao({ ok: true, confere: true, semBase: true });
        await iniciarPerguntas();
        return;
      }
      const r = await validarImeiTradein(ctx.voucher, imeiDigitado);
      setValidacao(r);
      if (r.ok && r.confere) await iniciarPerguntas();
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  async function iniciarPerguntas() {
    const ps = await buscarPerguntas(ctx.canal || "YBV", produto.marca);
    if (!ps.length) { erro(`Nenhuma pergunta cadastrada para o canal ${ctx.canal}.`); return; }
    setPerguntas(ps);
    setIdx(0);
    setEtapa("perguntas");
  }

  async function handleConfirmarDivergencia() {
    setCarregando(true);
    try {
      await registrarDivergenciaImei(ctx.voucher, imeiDigitado, user.id, validacao?.imeiTradein);
      setResultado({ divergencia: true });
      setEtapa("fim");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  function responder(valor) {
    const p = perguntas[idx];
    const ok = (p.resposta_ok || "sim").toLowerCase();
    const divergente = valor.toLowerCase() !== ok;

    const nova = [...respostas, {
      perguntaId: p.id, pergunta: p.texto, resposta: valor,
      divergente, geraLaudo: divergente && p.gera_laudo,
    }];
    setRespostas(nova);

    if (divergente && p.exige_defeito) { setPedindoDefeito(true); return; }
    avancar(nova);
  }

  function avancar(lista = respostas) {
    const proximo = idx + 1;
    const p = perguntas[proximo];
    if (p && p.tipo_resposta === "bateria") { setEtapa("bateria"); setValorBateria(""); return; }
    if (!p) { finalizar(lista, null); return; }
    setIdx(proximo);
  }

  function confirmarDefeitos() {
    if (!defeitosSel.length) return;
    setDefeitosTodos(prev => [...new Set([...prev, ...defeitosSel])]);
    setDefeitosSel([]);
    setPedindoDefeito(false);
    avancar();
  }

  function confirmarBateria() {
    const rotulo = classificarBateria(faixasBateria, valorBateria);
    if (!rotulo) { erro("Informe a saúde da bateria entre 0 e 100."); return; }
    finalizar(respostas, rotulo, Number(valorBateria));
  }

  async function finalizar(lista, bat, pct = null) {
    setBateria(bat);
    setCarregando(true);
    try {
      const r = await salvarTriagemFuncional({
        voucher: ctx.voucher,
        imei:    imeiDigitado.trim(),
        canal:   ctx.canal,
        produto: {
          ...produto,
          // SKU resolvido pela combinação escolhida. Não aparece na triagem —
          // o operador só vê o SKU na alocação.
          sku: resolverSku(catalogo.produtos, {
            marca: produto.marca, modelo: produto.modelo,
            capacidade: produto.armazenamento, cor: produto.cor,
          }).sku || ctx.tradein?.sku_base || null,
        },
        respostas: lista,
        bateria: bat,
        bateriaPercentual: pct,
        defeitos: defeitosTodos,
        userId: user.id,
        tradein: ctx.tradein,
      });
      if (!r.ok) { erro(r.erro); return; }
      setResultado({ ...r, bateria: bat,
        bateriaPercentual: pct, respostas: lista });
      setEtapa("fim");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]";

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#6B1F87]">Triagem Funcional</h2>
        {etapa !== "voucher" && (
          <button onClick={reiniciar}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-200">
            <RotateCcw className="h-3.5 w-3.5" /> Novo aparelho
          </button>
        )}
      </div>

      {feedback && <div className="mb-4"><Aviso tipo={feedback.tipo}>{feedback.msg}</Aviso></div>}

      {/* ── 1. Voucher ── */}
      {etapa === "voucher" && (
        <div>
          <p className="mb-2 text-sm text-slate-500">Bipe ou digite o voucher</p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input autoFocus value={busca}
                onChange={e => setBusca(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleConsultar()}
                placeholder="YBV417755"
                className={`${inputCls} pl-9 font-mono`} />
            </div>
            <button onClick={handleConsultar} disabled={!busca.trim() || carregando}
              className="rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
              {carregando ? "Buscando..." : "Consultar"}
            </button>
          </div>
        </div>
      )}

      {/* ── 2. Produto ── */}
      {etapa === "produto" && ctx && (
        <div>
          {ctx.bloqueado && (
            <div className="rounded-2xl bg-amber-50 p-5 ring-1 ring-amber-200">
              <p className="text-base font-bold text-amber-800">
                <AlertTriangle className="mr-1.5 inline h-4 w-4" />
                Este aparelho já foi triado
              </p>
              <p className="mt-2 text-sm text-amber-800">
                Etapa atual: <span className="font-bold">{ctx.etapa.nome}</span>
              </p>
              <p className="text-sm text-amber-700">{ctx.etapa.onde}</p>
              {ctx.etapa.desde && (
                <p className="mt-1 text-xs text-amber-600">
                  Desde {new Date(ctx.etapa.desde).toLocaleString("pt-BR", {
                    day: "2-digit", month: "2-digit", year: "numeric",
                    hour: "2-digit", minute: "2-digit",
                  })}
                </p>
              )}
              <button onClick={reiniciar}
                className="mt-4 rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87]">
                Bipar outro voucher
              </button>
            </div>
          )}

          {!ctx.bloqueado && (
          <>
          {!ctx.temTradein && ctx.canal === "YBV" && (
            <div className="mb-4">
              <Aviso tipo="aviso">
                Voucher não encontrado na base TradeIn. A validação de IMEI será pulada.
              </Aviso>
            </div>
          )}

          <p className="mb-3 text-sm font-bold text-slate-700">
            Informações do produto
            <span className="ml-2 font-mono text-xs font-normal text-slate-400">{ctx.voucher} · {ctx.canal}</span>
          </p>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Marca</label>
              <select value={produto.marca} className={inputCls}
                onChange={e => { setProduto({ marca: e.target.value, modelo: "", armazenamento: "", cor: "" }); setModeloLivre(false); }}>
                <option value="">Selecione...</option>
                {marcas.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Modelo</label>
              {modeloLivre ? (
                <input autoFocus value={produto.modelo} placeholder="Digite o modelo"
                  onChange={e => setProduto({ ...produto, modelo: e.target.value.toUpperCase() })}
                  className={inputCls} />
              ) : (
                <select value={produto.modelo} disabled={!produto.marca} className={inputCls}
                  onChange={e => {
                    if (e.target.value === "__outro__") { setModeloLivre(true); setProduto({ ...produto, modelo: "", armazenamento: "", cor: "" }); return; }
                    setProduto({ ...produto, modelo: e.target.value, armazenamento: "", cor: "" });
                  }}>
                  <option value="">{produto.marca ? "Selecione..." : "Escolha a marca"}</option>
                  {modelos.map(m => <option key={m} value={m}>{m}</option>)}
                  {produto.marca && <option value="__outro__">Não encontrei o modelo</option>}
                </select>
              )}
              {modeloLivre && (
                <button onClick={() => { setModeloLivre(false); setProduto({ ...produto, modelo: "" }); }}
                  className="mt-1 text-[11px] font-semibold text-slate-400 hover:text-slate-600">
                  Voltar para a lista
                </button>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Armazenamento</label>
              {modeloLivre || (produto.modelo && !capacidades.length) ? (
                <input value={produto.armazenamento} placeholder="Ex: 128GB"
                  onChange={e => setProduto({ ...produto, armazenamento: e.target.value.toUpperCase() })}
                  className={inputCls} />
              ) : (
                <select value={produto.armazenamento} disabled={!produto.modelo} className={inputCls}
                  onChange={e => setProduto({ ...produto, armazenamento: e.target.value, cor: "" })}>
                  <option value="">{produto.modelo ? "Selecione..." : "Escolha o modelo"}</option>
                  {capacidades.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Cor</label>
              {modeloLivre || (produto.armazenamento && !cores.length) ? (
                <input value={produto.cor} placeholder="Ex: BLACK"
                  onChange={e => setProduto({ ...produto, cor: e.target.value.toUpperCase() })}
                  className={inputCls} />
              ) : (
                <select value={produto.cor} disabled={!produto.armazenamento} className={inputCls}
                  onChange={e => setProduto({ ...produto, cor: e.target.value })}>
                  <option value="">{produto.armazenamento ? "Selecione..." : "Escolha a capacidade"}</option>
                  {cores.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              )}
            </div>
          </div>

          <p className="mt-3 text-xs text-slate-400">
            Preencha pelo aparelho que está na sua mão. A conferência com a base da loja é feita depois.
          </p>

          <button onClick={handleSalvarProduto} disabled={!produtoCompleto}
            className="mt-5 rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40 disabled:cursor-not-allowed">
            Salvar e continuar
          </button>
          </>
          )}
        </div>
      )}

      {/* ── 3. IMEI ── */}
      {etapa === "imei" && ctx && (
        <div>
          <button onClick={() => setEtapa("produto")}
            className="mb-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600">
            <ArrowLeft className="h-3 w-3" /> Voltar
          </button>
          <p className="mb-2 text-sm text-slate-500">Bipe o IMEI do aparelho</p>
          <div className="flex gap-2">
            <input autoFocus value={imeiDigitado}
              onChange={e => { setImeiDigitado(e.target.value.replace(/\D/g, "")); setValidacao(null); }}
              onKeyDown={e => e.key === "Enter" && handleValidarImei()}
              placeholder="000000000000000" maxLength={15}
              className={`${inputCls} font-mono`} />
            <button onClick={handleValidarImei} disabled={imeiDigitado.length < 14 || carregando}
              className="rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
              {carregando ? "Validando..." : "Validar"}
            </button>
          </div>

          {validacao && !validacao.confere && (
            <div className="mt-4 rounded-2xl bg-red-50 p-4 ring-1 ring-red-200">
              <p className="text-sm font-bold text-red-700">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                IMEI diverge do cadastrado na loja
              </p>
              <p className="mt-2 font-mono text-xs text-red-700">
                TradeIn: {validacao.imeiTradein || "sem registro"}<br />
                Bipado: {imeiDigitado}
              </p>
              <div className="mt-3 flex gap-2">
                <button onClick={() => { setImeiDigitado(""); setValidacao(null); }}
                  className="rounded-xl bg-white px-4 py-2 text-[13px] font-bold text-red-700 ring-1 ring-red-200 hover:bg-red-50">
                  Rebipar
                </button>
                <button onClick={handleConfirmarDivergencia} disabled={carregando}
                  className="rounded-xl bg-red-600 px-4 py-2 text-[13px] font-bold text-white hover:bg-red-700 disabled:opacity-40">
                  Confirmar divergência
                </button>
              </div>
              <p className="mt-3 text-[11px] leading-tight text-red-600">
                Confirmando, o aparelho vai para "Aguardando análise Assurant" e sai desta fila.
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── 4. Perguntas ── */}
      {etapa === "perguntas" && perguntas[idx] && (
        <div>
          <BarraContexto voucher={ctx.voucher} imei={imeiDigitado} produto={produto} />
          <p className="mb-4 text-[15px] font-semibold text-slate-800">{perguntas[idx].texto}</p>

          {!pedindoDefeito ? (
            <div className="flex gap-3">
              <button onClick={() => responder("sim")}
                className="flex-1 rounded-xl bg-[#7F2D92] py-3 text-sm font-bold text-white hover:bg-[#6B1F87]">
                Sim
              </button>
              <button onClick={() => responder("nao")}
                className="flex-1 rounded-xl bg-rose-600 py-3 text-sm font-bold text-white hover:bg-rose-700">
                Não
              </button>
            </div>
          ) : (
            <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-red-200">
              <p className="text-sm font-bold text-slate-700">Selecione o defeito encontrado</p>
              <p className="mb-3 text-xs text-slate-500">
                Obrigatório para resposta negativa · fica vinculado a esta pergunta
              </p>
              <div className="flex flex-wrap gap-2">
                {defeitosCatalogo.map(d => {
                  const marcado = defeitosSel.includes(d.nome);
                  return (
                    <button key={d.id}
                      onClick={() => setDefeitosSel(marcado
                        ? defeitosSel.filter(x => x !== d.nome)
                        : [...defeitosSel, d.nome])}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold ring-1 transition ${
                        marcado
                          ? "bg-rose-600 text-white ring-rose-600"
                          : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                      }`}>
                      {d.nome}
                    </button>
                  );
                })}
              </div>
              <button onClick={confirmarDefeitos} disabled={!defeitosSel.length}
                className="mt-3 rounded-xl bg-[#7F2D92] px-4 py-2 text-[13px] font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
                Confirmar
              </button>
            </div>
          )}

          <Progresso atual={idx} total={perguntas.length} />
        </div>
      )}

      {/* ── 5. Bateria ── */}
      {etapa === "bateria" && (
        <div>
          <BarraContexto voucher={ctx.voucher} imei={imeiDigitado} produto={produto} />
          <p className="mb-4 text-[15px] font-semibold text-slate-800">
            Qual a saúde da bateria?
          </p>
          <div className="flex items-center gap-3">
            <div className="relative w-40">
              <input autoFocus type="number" min={0} max={100} value={valorBateria}
                onChange={e => setValorBateria(e.target.value)}
                onKeyDown={e => e.key === "Enter" && confirmarBateria()}
                placeholder="0 a 100"
                className={`${inputCls} pr-8 text-center font-mono text-lg`} />
              <span className="absolute right-3 top-2.5 text-sm text-slate-400">%</span>
            </div>
            <button onClick={confirmarBateria} disabled={valorBateria === ""}
              className="rounded-xl bg-[#7F2D92] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
              Confirmar
            </button>
          </div>
          {classificarBateria(faixasBateria, valorBateria) && (
            <p className="mt-3 text-xs text-slate-500">
              Classificação: <span className="font-bold text-slate-700">{classificarBateria(faixasBateria, valorBateria)}</span>
            </p>
          )}
          <Progresso atual={perguntas.length - 1} total={perguntas.length} />
        </div>
      )}

      {/* ── 6. Resultado ── */}
      {etapa === "fim" && resultado && (
        <div>
          {resultado.divergencia ? (
            <Aviso tipo="aviso">
              Divergência registrada. O aparelho foi para "Aguardando análise Assurant".
            </Aviso>
          ) : (
            <>
              <div className="mb-1 flex flex-wrap items-baseline gap-3">
                <span className="text-lg font-bold text-slate-800">
                  {resultado.divergencias ? "Triagem com divergências" : "Triagem sem divergências"}
                </span>
                {resultado.bateria === "Saúde da bateria entre 70 e 79%" && (
                  <span className="rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                    bateria 70-79%
                  </span>
                )}
              </div>
              <p className="mb-4 text-sm text-slate-500">
                Próxima etapa: <span className="font-semibold text-slate-700">
                  {resultado.precisaLaudo ? "Laudo" : "Triagem cosmética"}
                </span>
              </p>

              <div className="border-t border-slate-100 pt-3">
                {resultado.respostas?.map((r, i) => (
                  <div key={i} className="flex justify-between gap-4 py-1.5 text-[13px]">
                    <span className="text-slate-500">{r.pergunta}</span>
                    <span className={`font-bold ${r.divergente ? "text-red-600" : "text-slate-700"}`}>
                      {r.resposta === "nao" ? "Não" : "Sim"}
                    </span>
                  </div>
                ))}
                {resultado.bateria && (
                  <div className="flex justify-between gap-4 border-t border-slate-100 py-1.5 text-[13px]">
                    <span className="text-slate-500">Bateria</span>
                    <span className="font-bold text-slate-700">{resultado.bateria}</span>
                  </div>
                )}
              </div>

              {resultado.conferencia?.divergencias?.length > 0 && (
                <div className="mt-4">
                  <Aviso tipo="aviso">
                    <div>
                      Divergência com a base da loja:
                      {resultado.conferencia.divergencias.map((d, i) => (
                        <div key={i} className="mt-1 font-normal">
                          {d.campo} — você registrou <span className="font-bold">{d.operador}</span>,
                          a loja declarou <span className="font-bold">{d.tradein}</span>
                        </div>
                      ))}
                    </div>
                  </Aviso>
                </div>
              )}

              {defeitosTodos.length > 0 && (
                <div className="mt-3">
                  <p className="mb-1.5 text-xs text-slate-400">Defeitos adicionais</p>
                  <div className="flex flex-wrap gap-1.5">
                    {defeitosTodos.map(d => (
                      <span key={d} className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                        {d}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          <button onClick={reiniciar}
            className="mt-5 rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87]">
            Próximo aparelho
          </button>
        </div>
      )}

      {carregando && etapa === "perguntas" && (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Loader className="h-3 w-3 animate-spin" /> Salvando...
        </div>
      )}
    </div>
  );
}