import { useState, useEffect, useRef } from "react";
import { useAuth } from "../AuthContext.jsx";
import jsPDF from "jspdf";
import "jspdf-autotable";
import {
  canaisExpedicao, abrirRomaneio, listarItens,
  biparVolume, removerItem, fecharRomaneio,
} from "../services/expedicaoService";

const NOME_CANAL = {
  magalu: "Magalu", meli: "Meli", via_varejo: "Via Varejo", seguradora: "Seguradora",
};

function bipErro() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = 220;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (_) { /* ambiente sem áudio: ignora */ }
}

export default function ExpedicaoPage() {
  const { user, profile } = useAuth();
  const nomeOperador = profile?.nome || user?.email || "Operador";

  const [canal, setCanal] = useState(null);
  const [romaneio, setRomaneio] = useState(null);
  const [itens, setItens] = useState([]);
  const [chave, setChave] = useState("");
  const [etiqueta, setEtiqueta] = useState("");
  const [msg, setMsg] = useState(null);
  const [alerta, setAlerta] = useState(null);
  const [carregando, setCarregando] = useState(false);

  const chaveRef = useRef(null);
  const etiquetaRef = useRef(null);

  function feedback(texto, tipo = "info") {
    setMsg({ texto, tipo });
    if (tipo === "ok") setTimeout(() => setMsg(null), 2500);
  }

  function abrirAlerta(texto) {
    bipErro();
    setAlerta(texto);
  }

  function fecharAlerta() {
    setAlerta(null);
    setChave("");
    setEtiqueta("");
    setTimeout(() => chaveRef.current?.focus(), 50);
  }

  async function selecionarCanal(c) {
    setCarregando(true);
    try {
      const rom = await abrirRomaneio(c, user.id, nomeOperador);
      setCanal(c);
      setRomaneio(rom);
      const its = await listarItens(rom.id);
      setItens(its);
      feedback(`Romaneio nº ${rom.numero} — ${NOME_CANAL[c]}. Bipe a chave da NF.`, "info");
      setTimeout(() => chaveRef.current?.focus(), 50);
    } catch (e) {
      feedback(e.message, "erro");
    } finally {
      setCarregando(false);
    }
  }

  function onChaveInput(v) {
    const num = v.replace(/\D/g, "").slice(0, 44);
    setChave(num);
    if (num.length === 44) {
      etiquetaRef.current?.focus();
      feedback("Chave OK. Bipe a etiqueta.", "info");
    }
  }

  async function salvar() {
    if (!romaneio) return;
    try {
      await biparVolume(romaneio.id, chave, etiqueta, user.id);
      const its = await listarItens(romaneio.id);
      setItens(its);
      setChave("");
      setEtiqueta("");
      chaveRef.current?.focus();
      feedback(`Volume ${its.length} registrado.`, "ok");
    } catch (e) {
      const dup = /já foi bipada/i.test(e.message);
      if (dup) {
        abrirAlerta(e.message);
      } else {
        feedback(e.message, "erro");
        setChave("");
        setEtiqueta("");
        chaveRef.current?.focus();
      }
    }
  }

  async function remover(id) {
    try {
      await removerItem(id, romaneio.id);
      const its = await listarItens(romaneio.id);
      setItens(its);
      chaveRef.current?.focus();
    } catch (e) {
      feedback(e.message, "erro");
    }
  }

  function gerarPdf(rom, lista) {
    const doc = new jsPDF();
    const dataStr = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    doc.setFontSize(16);
    doc.text("Romaneio de Expedição", 14, 18);
    doc.setFontSize(10);
    doc.text(`Nº ${rom.numero}`, 14, 26);
    doc.text(`Canal: ${NOME_CANAL[rom.canal] || rom.canal}`, 14, 32);
    doc.text(`Volumes: ${lista.length}`, 14, 38);
    doc.text(`Operador: ${nomeOperador}`, 120, 26);
    doc.text(`Emitido: ${dataStr}`, 120, 32);

    doc.autoTable({
      startY: 44,
      head: [["#", "Chave da NF", "Etiqueta"]],
      body: lista.map((i, ix) => [ix + 1, i.chave_nf, i.etiqueta]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [127, 45, 146] },
      columnStyles: { 0: { cellWidth: 12 }, 1: { cellWidth: 110 }, 2: { cellWidth: 60 } },
    });

    const fimY = doc.lastAutoTable?.finalY || 44;
    doc.setFontSize(9);
    doc.text("Conferente: __________________________", 14, fimY + 20);
    doc.text("Transportadora: __________________________", 14, fimY + 30);

    doc.save(`romaneio_${rom.numero}_${rom.canal}.pdf`);
  }

  async function fecharEGerar() {
    if (!romaneio || !itens.length) {
      feedback("Bipe ao menos um volume antes de fechar.", "erro");
      return;
    }
    setCarregando(true);
    try {
      const fechado = await fecharRomaneio(romaneio.id);
      gerarPdf(fechado, itens);
      feedback(`Romaneio nº ${fechado.numero} fechado e PDF gerado.`, "ok");
      setRomaneio(null);
      setCanal(null);
      setItens([]);
      setChave("");
      setEtiqueta("");
    } catch (e) {
      feedback(e.message, "erro");
    } finally {
      setCarregando(false);
    }
  }

  const canais = canaisExpedicao();

  return (
    <div className="max-w-4xl mx-auto">
      <p className="text-sm text-gray-500 mb-2">Canal</p>
      <div className="grid grid-cols-4 gap-2 mb-6">
        {canais.map((c) => (
          <button
            key={c.id}
            onClick={() => selecionarCanal(c.id)}
            disabled={carregando}
            className={`py-2 rounded-lg border text-sm font-medium transition
              ${canal === c.id
                ? "bg-purple-100 border-purple-400 text-purple-800"
                : "bg-white border-gray-200 hover:border-gray-300"}`}
          >
            {c.nome}
          </button>
        ))}
      </div>

      {romaneio && (
        <>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-600">
              Romaneio <b className="text-purple-800">nº {romaneio.numero}</b> · {NOME_CANAL[canal]}
            </span>
            <span className="text-sm text-gray-600">
              Volumes: <b className="text-gray-900">{itens.length}</b>
            </span>
          </div>

          <div className="flex gap-3 mb-3">
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">1 · Chave da NF (44 dígitos)</label>
              <input
                ref={chaveRef}
                value={chave}
                inputMode="numeric"
                onChange={(e) => onChaveInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.stopPropagation();
                    if (chave.length === 44) etiquetaRef.current?.focus();
                  }
                }}
                placeholder="Bipe o código de barras da DANFE"
                className="w-full font-mono border rounded-lg px-3 py-2"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-gray-500 mb-1">2 · Etiqueta (rastreio)</label>
              <input
                ref={etiquetaRef}
                value={etiqueta}
                onChange={(e) => setEtiqueta(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.target.value.trim()) salvar();
                  }
                }}
                placeholder="Bipe a etiqueta do canal"
                className="w-full font-mono border rounded-lg px-3 py-2"
              />
            </div>
          </div>

          {msg && (
            <p className={`text-sm mb-3 ${
              msg.tipo === "erro" ? "text-red-600" :
              msg.tipo === "ok" ? "text-green-600" : "text-gray-600"}`}>
              {msg.texto}
            </p>
          )}

          <div className="flex justify-end mb-3">
            <button
              onClick={fecharEGerar}
              disabled={carregando || !itens.length}
              className="px-4 py-2 rounded-lg border border-purple-300 text-purple-800 hover:bg-purple-50 disabled:opacity-40"
            >
              Fechar e gerar PDF
            </button>
          </div>

          <div className="border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 w-10">#</th>
                  <th className="px-3 py-2">Chave da NF</th>
                  <th className="px-3 py-2 w-48">Etiqueta</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {itens.length === 0 ? (
                  <tr><td colSpan={4} className="px-3 py-5 text-center text-gray-400">Nenhum volume bipado ainda</td></tr>
                ) : (
                  itens.map((i, ix) => (
                    <tr key={i.id} className="border-t">
                      <td className="px-3 py-2 text-gray-400">{ix + 1}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{i.chave_nf}</td>
                      <td className="px-3 py-2 font-mono text-xs break-all">{i.etiqueta}</td>
                      <td className="px-3 py-2 text-center">
                        <button onClick={() => remover(i.id)} className="text-red-500 hover:text-red-700">✕</button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {alerta && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={(e) => { if (e.target === e.currentTarget) fecharAlerta(); }}
        >
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 border-t-8 border-red-500">
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">⚠️</span>
              <h2 className="text-lg font-bold text-red-700">Chave já bipada</h2>
            </div>
            <p className="text-sm text-gray-600 mb-1">Esta chave de NF já foi registrada neste romaneio:</p>
            <p className="font-mono text-xs break-all bg-gray-50 rounded-lg p-2 mb-4">{chave}</p>
            <button
              onClick={fecharAlerta}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700 transition"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}