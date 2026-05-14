import { useState } from "react";
import { supabase } from "../lib/supabase";

const ANOS = [2023, 2024, 2025, 2026];
const MESES = [
  { num: 1, label: "Jan" }, { num: 2, label: "Fev" }, { num: 3, label: "Mar" },
  { num: 4, label: "Abr" }, { num: 5, label: "Mai" }, { num: 6, label: "Jun" },
  { num: 7, label: "Jul" }, { num: 8, label: "Ago" }, { num: 9, label: "Set" },
  { num: 10, label: "Out" }, { num: 11, label: "Nov" }, { num: 12, label: "Dez" },
];

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function sincronizarMes(ano, mes) {
  const session = await getSession();
  const response = await fetch(
    "https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/sincronizar-tiny",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ ano_inicio: ano, mes }),
    }
  );
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Erro");
  return data;
}

async function buscarCategorias(tipo, offset) {
  const session = await getSession();
  const response = await fetch(
    "https://fndkyainfdiyorwdsvkr.supabase.co/functions/v1/buscar-categorias-tiny",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ tipo, limite: 50, offset }),
    }
  );
  const data = await response.json();
  if (!data.success) throw new Error(data.error || "Erro");
  return data;
}

export default function CargaHistoricaPage() {
  const [status, setStatus] = useState({});
  const [loading, setLoading] = useState(null);
  const [log, setLog] = useState([]);
  const [syncingCat, setSyncingCat] = useState(false);
  const [catProgress, setCatProgress] = useState(null);

  async function handleMes(ano, mes) {
    const key = `${ano}-${mes}`;
    try {
      setLoading(key);
      setStatus((s) => ({ ...s, [key]: "loading" }));
      const result = await sincronizarMes(ano, mes);
      setStatus((s) => ({ ...s, [key]: "done" }));
      setLog((l) => [`✅ ${mes.toString().padStart(2, "0")}/${ano} — CP: ${result.contas_pagar} | CR: ${result.contas_receber}`, ...l]);
    } catch (err) {
      setStatus((s) => ({ ...s, [key]: "error" }));
      setLog((l) => [`❌ ${mes.toString().padStart(2, "0")}/${ano} — ${err.message}`, ...l]);
    } finally {
      setLoading(null);
    }
  }

  async function handleAno(ano) {
    for (const mes of MESES) {
      const key = `${ano}-${mes.num}`;
      if (status[key] === "done") continue;
      await handleMes(ano, mes.num);
    }
  }

  async function handleBuscarCategorias(tipo) {
    try {
      setSyncingCat(tipo);
      let offset = 0;
      let restantes = 1;

      while (restantes > 0) {
        const result = await buscarCategorias(tipo, offset);
        restantes = result.restantes;
        offset += result.processados || 50;
        setCatProgress({
          tipo,
          atualizados: offset,
          restantes,
          mensagem: result.mensagem || null,
        });
        setLog((l) => [
          `🏷️ Categorias ${tipo} — ${result.atualizados} atualizadas, ${restantes} restantes`,
          ...l,
        ]);
        if (result.processados === 0) break;
      }

      setLog((l) => [`✅ Categorias ${tipo} concluído!`, ...l]);
    } catch (err) {
      setLog((l) => [`❌ Erro categorias ${tipo}: ${err.message}`, ...l]);
    } finally {
      setSyncingCat(false);
      setCatProgress(null);
    }
  }

  function getBtnClass(key) {
    const s = status[key];
    if (s === "done") return "bg-green-500 text-white";
    if (s === "error") return "bg-red-500 text-white";
    if (loading === key) return "bg-yellow-400 text-white animate-pulse";
    return "bg-[#FCFAFF] text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-purple-100";
  }

  const totalDone = Object.values(status).filter((s) => s === "done").length;
  const totalMeses = ANOS.length * 12;

  return (
    <div className="space-y-6">
      {/* Carga Histórica */}
      <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
        <h2 className="text-xl font-black text-[#6B1F87] mb-1">Carga Histórica — Tiny</h2>
        <p className="text-sm text-slate-500 mb-4">
          Clique em cada mês para carregar os dados. Ou clique no ano para carregar todos os meses sequencialmente.
        </p>

        <div className="flex items-center gap-4 mb-6">
          <div className="rounded-2xl bg-purple-50 px-4 py-2">
            <span className="text-sm font-bold text-[#6B1F87]">{totalDone}/{totalMeses} meses carregados</span>
          </div>
          <div className="flex-1 h-2 rounded-full bg-[#F3E8FF] overflow-hidden">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,#7F2D92,#F97316)]"
              style={{ width: `${(totalDone / totalMeses) * 100}%` }}
            />
          </div>
        </div>

        <div className="space-y-4">
          {ANOS.map((ano) => (
            <div key={ano} className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
              <div className="flex items-center gap-3 mb-3">
                <span className="font-black text-[#6B1F87] text-lg">{ano}</span>
                <button
                  onClick={() => handleAno(ano)}
                  disabled={loading !== null}
                  className="rounded-xl bg-[#6B1F87] px-3 py-1 text-xs font-bold text-white hover:bg-[#5B1E74] disabled:opacity-50 transition"
                >
                  Carregar tudo
                </button>
                <span className="text-xs text-slate-400">
                  {MESES.filter((m) => status[`${ano}-${m.num}`] === "done").length}/12 meses
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {MESES.map((mes) => {
                  const key = `${ano}-${mes.num}`;
                  return (
                    <button
                      key={mes.num}
                      onClick={() => handleMes(ano, mes.num)}
                      disabled={loading !== null}
                      className={`rounded-xl px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed ${getBtnClass(key)}`}
                    >
                      {loading === key ? "..." : mes.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Buscar Categorias */}
      <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
        <h2 className="text-xl font-black text-[#6B1F87] mb-1">Buscar Categorias do Tiny</h2>
        <p className="text-sm text-slate-500 mb-4">
          Busca a categoria de cada conta diretamente do Tiny. Processa 50 por vez automaticamente.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => handleBuscarCategorias("pagar")}
            disabled={syncingCat !== false}
            className="rounded-2xl bg-[#6B1F87] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#5B1E74] disabled:opacity-50 transition"
          >
            {syncingCat === "pagar" ? "Buscando CP..." : "Buscar Categorias CP"}
          </button>
          <button
            onClick={() => handleBuscarCategorias("receber")}
            disabled={syncingCat !== false}
            className="rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 transition"
          >
            {syncingCat === "receber" ? "Buscando CR..." : "Buscar Categorias CR"}
          </button>
        </div>

        {catProgress && (
          <div className="mt-4 rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-[#E9D5FF]">
            <div className="text-sm font-semibold text-[#6B1F87]">
              {catProgress.mensagem || `Processando... ${catProgress.atualizados} atualizadas, ${catProgress.restantes} restantes`}
            </div>
            <div className="mt-2 h-2 rounded-full bg-[#F3E8FF] overflow-hidden">
              <div
                className="h-full rounded-full bg-[linear-gradient(90deg,#7F2D92,#F97316)] transition-all"
                style={{ width: catProgress.restantes === 0 ? "100%" : `${Math.min((catProgress.atualizados / (catProgress.atualizados + catProgress.restantes)) * 100, 100)}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Log */}
      {log.length > 0 && (
        <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
          <h3 className="font-bold text-[#6B1F87] mb-3">Log de sincronização</h3>
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {log.map((l, i) => (
              <div key={i} className="text-sm font-mono text-slate-600 py-1 border-b border-[#F4ECFA]">{l}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}