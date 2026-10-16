import { Camera, Loader2, ScanLine, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

function mensagemErroCamera(error) {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "Este navegador não permite acessar a câmera. Digite o número da OS no campo de busca.";
  }
  if (error?.name === "NotAllowedError") {
    return "A câmera foi bloqueada. Libere a permissão do site nas configurações do navegador.";
  }
  if (error?.name === "NotFoundError") {
    return "Nenhuma câmera foi encontrada neste aparelho.";
  }
  return "Não foi possível abrir a câmera. Digite o número da OS no campo de busca.";
}

export default function OsBarcodeScanner({ onClose, onDetected }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const onDetectedRef = useRef(onDetected);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState("");

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let ativo = true;
    let reconhecido = false;
    let ultimoCodigo = "";
    let ultimaLeitura = 0;
    async function iniciarLeitor() {
      const { BrowserMultiFormatReader } = await import("@zxing/browser");
      if (!ativo) return;
      const leitor = new BrowserMultiFormatReader(undefined, {
        delayBetweenScanAttempts: 120,
        delayBetweenScanSuccess: 700,
      });
      const controls = await leitor.decodeFromConstraints(
        {
          audio: false,
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        },
        videoRef.current,
        (resultado) => {
          if (!ativo || reconhecido || !resultado) return;
          const codigo = resultado.getText()?.trim();
          if (!codigo) return;

          const agora = Date.now();
          if (codigo === ultimoCodigo && agora - ultimaLeitura < 1500) return;
          ultimoCodigo = codigo;
          ultimaLeitura = agora;

          const aceito = onDetectedRef.current?.(codigo) !== false;
          if (aceito) {
            reconhecido = true;
            if (navigator.vibrate) navigator.vibrate(120);
          } else {
            setErro(`O código “${codigo}” não corresponde a uma OS disponível nesta etapa.`);
          }
        }
      );
      if (!ativo) {
        controls.stop();
        return;
      }
      controlsRef.current = controls;
      setLoading(false);
    }

    iniciarLeitor().catch((error) => {
      if (!ativo) return;
      setLoading(false);
      setErro(mensagemErroCamera(error));
    });

    return () => {
      ativo = false;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/80 p-0 sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="scanner-os-title">
      <div className="w-full overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 id="scanner-os-title" className="flex items-center gap-2 text-base font-black text-slate-900">
              <ScanLine className="h-5 w-5 text-[#5B35C9]" /> Bipar etiqueta da OS
            </h2>
            <p className="mt-1 text-xs text-slate-500">Aponte a câmera traseira para o código de barras da etiqueta.</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500" aria-label="Fechar leitor">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="bg-slate-950 p-4">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
            <div className="pointer-events-none absolute inset-x-[9%] top-1/2 h-28 -translate-y-1/2 rounded-2xl border-2 border-white/90 shadow-[0_0_0_999px_rgba(2,6,23,0.38)]">
              <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.9)]" />
            </div>
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/75 text-white">
                <Loader2 className="h-7 w-7 animate-spin" />
                <span className="mt-3 text-xs font-bold">Abrindo câmera...</span>
              </div>
            ) : null}
          </div>
        </div>

        <div className="px-5 py-4">
          {erro ? (
            <div className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">{erro}</div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
              <Camera className="h-4 w-4 text-[#5B35C9]" /> Mantenha o código inteiro dentro do quadro.
            </div>
          )}
          <button type="button" onClick={onClose} className="mt-4 h-11 w-full rounded-xl border border-slate-200 text-xs font-black text-slate-600">
            Digitar OS manualmente
          </button>
        </div>
      </div>
    </div>
  );
}
