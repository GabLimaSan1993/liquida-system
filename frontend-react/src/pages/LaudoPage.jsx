import { useState, useEffect, useRef } from "react";
import {
  Search, Camera, Upload, RotateCcw, AlertTriangle, CheckCircle,
  FileText, X, RefreshCw, Loader,
} from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import {
  carregarParaLaudo,
  salvarLaudo,
  listarAguardandoLaudo,
  ETAPAS_FOTO,
} from "../services/laudoService.js";

// Reduz a foto antes de embutir no PDF. Sem isso, quatro fotos de 12MP
// geram um PDF de dezenas de MB que trava o navegador da bancada.
const LARGURA_MAX = 1400;
const QUALIDADE   = 0.72;

function comprimir(fonte, largura, altura) {
  const escala = Math.min(1, LARGURA_MAX / largura);
  const canvas = document.createElement("canvas");
  canvas.width  = Math.round(largura * escala);
  canvas.height = Math.round(altura * escala);
  canvas.getContext("2d").drawImage(fonte, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALIDADE);
}

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

export default function LaudoPage() {
  const { user } = useAuth();

  const [etapa, setEtapa]         = useState("voucher");
  const [busca, setBusca]         = useState("");
  const [carregando, setCarregando] = useState(false);
  const [feedback, setFeedback]   = useState(null);

  const [dados, setDados]         = useState(null);
  const [fotos, setFotos]         = useState([null, null, null, null]);
  const [idxFoto, setIdxFoto]     = useState(0);
  const [observacao, setObservacao] = useState("");
  const [resultado, setResultado] = useState(null);

  const [fila, setFila]           = useState([]);
  const [carregandoFila, setCarregandoFila] = useState(true);

  const [camAtiva, setCamAtiva]   = useState(false);
  const [camErro, setCamErro]     = useState(null);
  const videoRef  = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => () => pararCamera(), []);
  useEffect(() => { carregarFila(); }, []);

  async function carregarFila() {
    setCarregandoFila(true);
    try { setFila(await listarAguardandoLaudo()); }
    catch (e) { erro(e.message); }
    finally { setCarregandoFila(false); }
  }

  function erro(msg) {
    setFeedback({ tipo: "erro", msg });
    setTimeout(() => setFeedback(null), 7000);
  }

  function pararCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCamAtiva(false);
  }

  async function abrirCamera() {
    setCamErro(null);
    try {
      // environment = câmera traseira em tablet/celular, que é a que foca
      // de perto o suficiente para ler etiqueta de IMEI. Em desktop cai na
      // webcam disponível e o operador pode preferir o upload.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
      });
      streamRef.current = stream;
      setCamAtiva(true);
      setTimeout(() => { if (videoRef.current) videoRef.current.srcObject = stream; }, 50);
    } catch (e) {
      setCamErro("Não foi possível abrir a câmera. Use 'Selecionar arquivo'.");
    }
  }

  function capturar() {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const img = comprimir(v, v.videoWidth, v.videoHeight);
    guardarFoto(img);
    pararCamera();
  }

  function selecionarArquivo(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => guardarFoto(comprimir(img, img.width, img.height));
      img.onerror = () => erro("Não foi possível ler a imagem.");
      img.src = reader.result;
    };
    reader.onerror = () => erro("Não foi possível ler o arquivo.");
    reader.readAsDataURL(file);
  }

  function guardarFoto(dataUrl) {
    setFotos(prev => {
      const novo = [...prev];
      novo[idxFoto] = dataUrl;
      return novo;
    });
    if (idxFoto < ETAPAS_FOTO.length - 1) setIdxFoto(idxFoto + 1);
  }

  function reiniciar() {
    pararCamera();
    setEtapa("voucher"); setBusca(""); setDados(null);
    setFotos([null, null, null, null]); setIdxFoto(0);
    setObservacao(""); setResultado(null); setCamErro(null);
    carregarFila();
  }

  async function abrirVoucher(v) {
    setBusca(v);
    setCarregando(true);
    try {
      const r = await carregarParaLaudo(v);
      if (!r.ok) { erro(r.erro); return; }
      setDados(r);
      setEtapa("fotos");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  async function handleConsultar() {
    if (!busca.trim()) return;
    setCarregando(true);
    try {
      const r = await carregarParaLaudo(busca);
      if (!r.ok) { erro(r.erro); return; }
      setDados(r);
      setEtapa("fotos");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  async function handleGerar() {
    setCarregando(true);
    try {
      const r = await salvarLaudo({ dados, fotos, observacao, userId: user.id });
      if (!r.ok) { erro(r.erro); return; }
      setResultado(r);
      setEtapa("fim");
    } catch (e) { erro(e.message); }
    finally { setCarregando(false); }
  }

  const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92]";
  const todasFotos = fotos.filter(Boolean).length === ETAPAS_FOTO.length;

  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-bold text-[#6B1F87]">Laudo de Triagem</h2>
        {etapa !== "voucher" && (
          <button onClick={reiniciar}
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2 text-[13px] font-bold text-slate-600 hover:bg-slate-200">
            <RotateCcw className="h-3.5 w-3.5" /> Novo laudo
          </button>
        )}
      </div>

      {feedback && <div className="mb-4"><Aviso tipo={feedback.tipo}>{feedback.msg}</Aviso></div>}

      {/* ── 1. Voucher ── */}
      {etapa === "voucher" && (
        <div>
          <p className="mb-2 text-sm text-slate-500">
            Bipe o voucher do aparelho que está aguardando laudo
          </p>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input autoFocus value={busca}
                onChange={e => setBusca(e.target.value.toUpperCase())}
                onKeyDown={e => e.key === "Enter" && handleConsultar()}
                placeholder="YBV413734"
                className={`${inputCls} pl-9 font-mono`} />
            </div>
            <button onClick={handleConsultar} disabled={!busca.trim() || carregando}
              className="rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
              {carregando ? "Buscando..." : "Consultar"}
            </button>
          </div>

          <div className="mt-7 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-800">
              Aguardando laudo ·{" "}
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
              Nenhum aparelho aguardando laudo.
            </div>
          ) : (
            <div className="mt-3 overflow-x-auto rounded-2xl ring-1 ring-slate-200">
              <table className="w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="px-3 py-2.5 font-bold">Voucher</th>
                    <th className="px-3 py-2.5 font-bold">IMEI</th>
                    <th className="px-3 py-2.5 font-bold">Aparelho</th>
                    <th className="px-3 py-2.5 font-bold">Motivo</th>
                    <th className="px-3 py-2.5 font-bold">Parado desde</th>
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
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {i.motivo || `${i.divergencias} divergência(s)`}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-500">
                        {i.desde ? new Date(i.desde).toLocaleDateString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => abrirVoucher(i.voucher)} disabled={carregando}
                          className="rounded-lg bg-[#7F2D92] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#6B1F87] disabled:opacity-40">
                          Fazer laudo
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

      {/* ── 2. Fotos ── */}
      {etapa === "fotos" && dados && (
        <div>
          <div className="mb-5 flex flex-wrap gap-x-6 gap-y-1 rounded-2xl bg-[#FCFAFF] px-4 py-2.5 ring-1 ring-[#E9D5FF] text-xs">
            <span className="font-mono font-bold text-[#7F2D92]">{dados.voucher}</span>
            <span className="font-mono text-slate-600">{dados.imei}</span>
            {dados.produto?.marca  && <span className="text-slate-600">{dados.produto.marca}</span>}
            {dados.produto?.modelo && <span className="font-semibold text-slate-700">{dados.produto.modelo}</span>}
            {dados.cliente && <span className="text-slate-500">{dados.cliente}</span>}
          </div>

          {dados.motivo && (
            <p className="mb-4 text-xs text-slate-500">
              Motivo do laudo: <span className="font-semibold text-slate-700">{dados.motivo}</span>
            </p>
          )}

          {/* Miniaturas das 4 etapas */}
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {ETAPAS_FOTO.map((e, i) => (
              <button key={e.id} onClick={() => { setIdxFoto(i); pararCamera(); }}
                className={`rounded-2xl p-2 text-left ring-1 transition ${
                  i === idxFoto
                    ? "bg-[#FCFAFF] ring-[#7F2D92]"
                    : fotos[i] ? "bg-emerald-50 ring-emerald-200" : "bg-slate-50 ring-slate-200"
                }`}>
                <div className="flex h-20 items-center justify-center overflow-hidden rounded-xl bg-white">
                  {fotos[i]
                    ? <img src={fotos[i]} alt={e.titulo} className="h-full w-full object-cover" />
                    : <Camera className="h-5 w-5 text-slate-300" />}
                </div>
                <p className="mt-1.5 text-[11px] font-bold text-slate-600">{e.titulo}</p>
                <p className="text-[10px] text-slate-400">
                  {fotos[i] ? "capturada" : "obrigatória"}
                </p>
              </button>
            ))}
          </div>

          <p className="mb-2 text-sm font-bold text-slate-700">
            {ETAPAS_FOTO[idxFoto].titulo}
          </p>

          {camAtiva ? (
            <div>
              <video ref={videoRef} autoPlay playsInline muted
                className="w-full max-w-lg rounded-2xl bg-black" />
              <div className="mt-3 flex gap-2">
                <button onClick={capturar}
                  className="rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87]">
                  Capturar
                </button>
                <button onClick={pararCamera}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-200">
                  <X className="h-3.5 w-3.5" /> Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button onClick={abrirCamera}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#7F2D92] px-4 py-2 text-sm font-bold text-white hover:bg-[#6B1F87]">
                <Camera className="h-4 w-4" /> Tirar foto
              </button>
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-sm font-bold text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]">
                <Upload className="h-4 w-4" /> Selecionar arquivo
                <input type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={e => { selecionarArquivo(e.target.files?.[0]); e.target.value = ""; }} />
              </label>
              {fotos[idxFoto] && (
                <button onClick={() => setFotos(prev => { const n = [...prev]; n[idxFoto] = null; return n; })}
                  className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-red-600 ring-1 ring-red-200 hover:bg-red-50">
                  Refazer esta
                </button>
              )}
            </div>
          )}

          {camErro && <p className="mt-2 text-xs text-amber-700">{camErro}</p>}

          <div className="mt-6">
            <label className="mb-1 block text-xs font-bold text-slate-600">
              Observação <span className="font-normal text-slate-400">(uma por linha)</span>
            </label>
            <textarea rows={3} value={observacao}
              onChange={e => setObservacao(e.target.value)}
              placeholder={"Tela Quebrada\nTela Com Mancha Preta"}
              className={inputCls} />
          </div>

          {(dados.divergencias?.length > 0 || dados.defeitos?.length > 0) && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <p className="text-xs font-bold text-slate-500">Vem da triagem funcional</p>
              {dados.divergencias.map((d, i) => (
                <div key={i} className="mt-1.5 flex justify-between gap-4 text-[13px]">
                  <span className="text-slate-600">{d.pergunta}</span>
                  <span className="font-bold text-red-600">{d.resposta}</span>
                </div>
              ))}
              {dados.defeitos.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {dados.defeitos.map(d => (
                    <span key={d} className="rounded-lg bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                      {d}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <button onClick={handleGerar} disabled={!todasFotos || carregando}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed">
            <FileText className="h-4 w-4" />
            {carregando ? "Gerando..." : todasFotos ? "Gerar laudo" : `Faltam ${ETAPAS_FOTO.length - fotos.filter(Boolean).length} foto(s)`}
          </button>
        </div>
      )}

      {/* ── 3. Fim ── */}
      {etapa === "fim" && resultado && (
        <div>
          <Aviso tipo="ok">
            Laudo gerado e baixado ({resultado.arquivo}). O aparelho seguiu para {resultado.status}.
          </Aviso>
          <button onClick={reiniciar}
            className="mt-5 rounded-xl bg-[#7F2D92] px-5 py-2 text-sm font-bold text-white hover:bg-[#6B1F87]">
            Próximo aparelho
          </button>
        </div>
      )}
    </div>
  );
}