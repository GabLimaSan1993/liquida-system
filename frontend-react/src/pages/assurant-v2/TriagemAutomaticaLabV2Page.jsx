import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BatteryCharging,
  Cable,
  CheckCircle2,
  CircleDot,
  Copy,
  Cpu,
  ExternalLink,
  HardDrive,
  Monitor,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  TimerReset,
  Usb,
  XCircle,
} from "lucide-react";

import { useAuth } from "../../AuthContext.jsx";
import {
  CELULAR_SEGURO_URL,
  buscarSessaoDiagnostico,
  criarCodigoPareamento,
  iniciarDiagnosticoAutomatico,
  listarEstacoesDiagnostico,
  listarSessoesDiagnosticoRecentes,
  registrarResultadoBlacklist,
} from "../../services/diagnosticoAutomaticoService.js";

const GABRIEL_USER_ID = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";

function fmtDataHora(value) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function bytesToGB(value) {
  if (!value) return "—";
  return (Number(value) / 1024 / 1024 / 1024).toLocaleString("pt-BR", {
    maximumFractionDigits: 1,
  }) + " GB";
}

function pct(value) {
  if (value == null) return "—";
  return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
}

function StatusBadge({ value }) {
  const cfg = {
    pass: ["Aprovado", "bg-emerald-50 text-emerald-700 ring-emerald-200", CheckCircle2],
    fail: ["Falha", "bg-rose-50 text-rose-700 ring-rose-200", XCircle],
    warning: ["Alerta", "bg-amber-50 text-amber-700 ring-amber-200", AlertTriangle],
    manual_required: ["Teste guiado", "bg-violet-50 text-violet-700 ring-violet-200", CircleDot],
    not_supported: ["Não suportado", "bg-slate-50 text-slate-500 ring-slate-200", CircleDot],
    not_run: ["Não executado", "bg-slate-50 text-slate-500 ring-slate-200", CircleDot],
  };
  const [label, cls, Icon] = cfg[value] || cfg.not_run;
  return (
    <span className={"inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-black ring-1 " + cls}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function Card({ children, className = "" }) {
  return <div className={"rounded-2xl border border-slate-200 bg-white shadow-sm " + className}>{children}</div>;
}

export default function TriagemAutomaticaLabV2Page() {
  const { user } = useAuth();
  const [stations, setStations] = useState([]);
  const [stationId, setStationId] = useState("");
  const [voucher, setVoucher] = useState("");
  const [pairName, setPairName] = useState("TRIAGEM-MAC-01");
  const [pairing, setPairing] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [snapshot, setSnapshot] = useState(null);
  const [recentes, setRecentes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState("");

  const selectedStation = stations.find((s) => s.id === stationId) || null;

  async function carregarEstacoes() {
    try {
      const [s, r] = await Promise.all([
        listarEstacoesDiagnostico(),
        listarSessoesDiagnosticoRecentes(),
      ]);
      setStations(s);
      setRecentes(r);
      if (!stationId) {
        const online = s.find((x) => x.online);
        if (online) setStationId(online.id);
      }
    } catch (e) {
      setErro(e.message);
    }
  }

  useEffect(() => {
    carregarEstacoes();
    const id = setInterval(carregarEstacoes, 10000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!sessionId) return undefined;

    let ativo = true;
    async function poll() {
      try {
        const data = await buscarSessaoDiagnostico(sessionId);
        if (!ativo) return;
        setSnapshot(data);
        if (["concluido", "aguardando_manual", "erro", "cancelado"].includes(data.session.status)) {
          setLoading(false);
        }
      } catch (e) {
        if (ativo) setErro(e.message);
      }
    }

    poll();
    const id = setInterval(poll, 1000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [sessionId]);

  const imeis = useMemo(
    () => (snapshot?.identifiers || []).filter((x) => x.kind === "imei"),
    [snapshot]
  );

  const counters = useMemo(() => {
    const tests = snapshot?.tests || [];
    return {
      pass: tests.filter((x) => x.result === "pass").length,
      fail: tests.filter((x) => x.result === "fail").length,
      warning: tests.filter((x) => x.result === "warning").length,
      manual: tests.filter((x) => x.result === "manual_required").length,
    };
  }, [snapshot]);

  async function gerarPareamento() {
    setErro("");
    try {
      const data = await criarCodigoPareamento(pairName);
      setPairing(data);
    } catch (e) {
      setErro(e.message);
    }
  }

  async function iniciar() {
    setErro("");
    if (!selectedStation?.online) {
      setErro("Selecione uma estação Mac online.");
      return;
    }

    setLoading(true);
    setSnapshot(null);

    try {
      const { session } = await iniciarDiagnosticoAutomatico({
        stationId,
        voucher,
        userId: user.id,
      });
      setSessionId(session.id);
    } catch (e) {
      setLoading(false);
      setErro(e.message);
    }
  }

  async function salvarBlacklist(check, status) {
    try {
      await registrarResultadoBlacklist({
        checkId: check.id,
        status,
        userId: user.id,
      });
      const data = await buscarSessaoDiagnostico(sessionId);
      setSnapshot(data);
    } catch (e) {
      setErro(e.message);
    }
  }

  if (user?.id !== GABRIEL_USER_ID) {
    return (
      <Card className="p-10 text-center">
        <ShieldCheck className="mx-auto h-10 w-10 text-slate-300" />
        <div className="mt-3 font-bold text-slate-700">Acesso restrito</div>
      </Card>
    );
  }

  const session = snapshot?.session;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Usb className="h-6 w-6 text-violet-700" />
          <h1 className="text-2xl font-black text-slate-900">Triagem Automática — LAB</h1>
          <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-violet-700 ring-1 ring-violet-200">
            Somente Gabriel
          </span>
        </div>
        <p className="mt-1 max-w-4xl text-sm text-slate-500">
          Diagnóstico automático pelo Mac. O operador trabalha somente no Liquida; o Bridge roda invisível em segundo plano.
        </p>
      </div>

      {erro && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
          {erro}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card className="p-4">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Monitor className="h-4 w-4 text-violet-700" />
            Estação de diagnóstico
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
            <select
              value={stationId}
              onChange={(e) => setStationId(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"
            >
              <option value="">Selecione a estação</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.online ? "ONLINE" : "OFFLINE"} · {s.code}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={carregarEstacoes}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600"
            >
              <RefreshCw className="h-4 w-4" />
              Atualizar
            </button>
          </div>

          {selectedStation && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase text-slate-400">Status</div>
                <div className={"mt-1 text-sm font-black " + (selectedStation.online ? "text-emerald-700" : "text-rose-600")}>
                  {selectedStation.online ? "● Online" : "● Offline"}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase text-slate-400">Bridge</div>
                <div className="mt-1 text-sm font-black text-slate-700">{selectedStation.bridge_version || "—"}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase text-slate-400">Mac</div>
                <div className="mt-1 truncate text-sm font-black text-slate-700">{selectedStation.hostname || "—"}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="text-[10px] font-black uppercase text-slate-400">Último sinal</div>
                <div className="mt-1 text-xs font-bold text-slate-700">{fmtDataHora(selectedStation.last_seen_at)}</div>
              </div>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 font-black text-slate-800">
            <Cable className="h-4 w-4 text-violet-700" />
            Parear novo Mac
          </div>
          <div className="mt-3 flex gap-2">
            <input
              value={pairName}
              onChange={(e) => setPairName(e.target.value)}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              placeholder="Nome da estação"
            />
            <button
              type="button"
              onClick={gerarPareamento}
              className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white"
            >
              Gerar código
            </button>
          </div>
          {pairing && (
            <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-wide text-violet-500">Código válido por 10 minutos</div>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-mono text-xl font-black tracking-[0.18em] text-violet-900">{pairing.code}</span>
                <button type="button" onClick={() => navigator.clipboard?.writeText(pairing.code)} className="rounded-lg p-1.5 text-violet-600 hover:bg-violet-100">
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-wide text-slate-400">
              Voucher
            </label>
            <input
              value={voucher}
              onChange={(e) => setVoucher(e.target.value)}
              placeholder="Bipe ou digite o voucher"
              className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base font-bold outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <button
            type="button"
            disabled={loading || !selectedStation?.online}
            onClick={iniciar}
            className="mt-auto inline-flex h-[50px] items-center justify-center gap-2 rounded-xl bg-violet-700 px-6 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Usb className="h-4 w-4" />}
            {loading ? "Diagnosticando..." : "Detectar e diagnosticar"}
          </button>
        </div>
      </Card>

      {session && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            {[
              ["Plataforma", session.platform?.toUpperCase() || "—", Smartphone],
              ["Modelo", session.model || "—", Cpu],
              ["Armazenamento", bytesToGB(session.storage_bytes), HardDrive],
              ["Bateria", pct(session.battery_pct), BatteryCharging],
              ["Saúde bateria", pct(session.battery_health_pct), BatteryCharging],
              ["Ciclos", session.battery_cycle_count ?? "—", TimerReset],
            ].map(([label, value, Icon]) => (
              <Card key={label} className="p-4">
                <Icon className="h-4 w-4 text-violet-600" />
                <div className="mt-2 text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</div>
                <div className="mt-1 truncate text-lg font-black text-slate-900" title={String(value)}>{value}</div>
              </Card>
            ))}
          </div>

          <div className="grid gap-4 xl:grid-cols-[1fr_1.4fr]">
            <Card className="overflow-hidden">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="font-black text-slate-800">Identificadores do aparelho</div>
                <div className="text-xs text-slate-400">Todos os IMEIs encontrados são preservados individualmente.</div>
              </div>
              <div className="p-4">
                <div className="space-y-2">
                  {imeis.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3">
                      <div>
                        <div className="text-[10px] font-black uppercase text-slate-400">IMEI {item.slot || ""}</div>
                        <div className="font-mono text-base font-black text-slate-800">{item.value}</div>
                        <div className="mt-0.5 text-[10px] text-slate-400">{item.source || "device"} · {item.confidence || "—"}</div>
                      </div>
                      {item.is_primary && <span className="rounded-lg bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-700">PRIMÁRIO</span>}
                    </div>
                  ))}
                  {!imeis.length && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-700">
                      Nenhum IMEI foi exposto automaticamente. O Liquida vai exigir captura guiada antes de concluir.
                    </div>
                  )}

                  {[
                    ["Serial", session.serial],
                    ["UDID", session.udid],
                    ["MEID", session.meid],
                    ["EID", session.eid],
                  ].filter(([, value]) => value).map(([label, value]) => (
                    <div key={label} className="rounded-xl bg-slate-50 p-3">
                      <div className="text-[10px] font-black uppercase text-slate-400">{label}</div>
                      <div className="mt-1 break-all font-mono text-xs font-bold text-slate-700">{value}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
                <div>
                  <div className="font-black text-slate-800">Diagnóstico</div>
                  <div className="text-xs text-slate-400">Automático primeiro; somente o que não for possível fica guiado.</div>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] font-black">
                  <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">{counters.pass} OK</span>
                  <span className="rounded-lg bg-rose-50 px-2 py-1 text-rose-700">{counters.fail} FALHAS</span>
                  <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-700">{counters.warning} ALERTAS</span>
                  <span className="rounded-lg bg-violet-50 px-2 py-1 text-violet-700">{counters.manual} GUIADOS</span>
                </div>
              </div>
              <div className="max-h-[520px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-4 py-2">Categoria</th>
                      <th className="px-3 py-2">Teste</th>
                      <th className="px-3 py-2">Resultado</th>
                      <th className="px-4 py-2 text-right">Tempo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(snapshot.tests || []).map((t) => (
                      <tr key={t.id} className="border-t border-slate-100">
                        <td className="px-4 py-2.5 text-xs font-bold uppercase text-slate-400">{t.category}</td>
                        <td className="px-3 py-2.5">
                          <div className="font-semibold text-slate-700">{t.label}</div>
                          {t.details && <div className="mt-0.5 text-[10px] text-slate-400">{t.details}</div>}
                        </td>
                        <td className="px-3 py-2.5"><StatusBadge value={t.result} /></td>
                        <td className="px-4 py-2.5 text-right text-xs text-slate-400">{t.duration_ms ? t.duration_ms + " ms" : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-100 px-4 py-3">
              <div className="flex items-center gap-2 font-black text-slate-800">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                Restrição / roubo / furto por IMEI
              </div>
              <div className="mt-0.5 text-xs text-slate-400">
                Fonte gratuita oficial atual: Celular Seguro / BNCR. A consulta oficial deve ser feita para cada IMEI.
              </div>
            </div>

            <div className="grid gap-3 p-4 lg:grid-cols-2">
              {(snapshot.blacklist || []).map((check) => (
                <div key={check.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="text-[10px] font-black uppercase text-slate-400">IMEI</div>
                      <div className="font-mono text-sm font-black text-slate-800">{check.imei}</div>
                    </div>
                    {check.status === "clean" && <span className="rounded-lg bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">SEM RESTRIÇÃO</span>}
                    {check.status === "restricted" && <span className="rounded-lg bg-rose-50 px-2 py-1 text-[10px] font-black text-rose-700">RESTRITO</span>}
                    {!["clean", "restricted"].includes(check.status) && <span className="rounded-lg bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">PENDENTE</span>}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <a
                      href={CELULAR_SEGURO_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-black text-white"
                    >
                      Consultar oficial
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button type="button" onClick={() => salvarBlacklist(check, "clean")} className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 ring-1 ring-emerald-200">
                      Sem restrição
                    </button>
                    <button type="button" onClick={() => salvarBlacklist(check, "restricted")} className="rounded-lg bg-rose-50 px-3 py-2 text-xs font-black text-rose-700 ring-1 ring-rose-200">
                      Restrito
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      <Card className="overflow-hidden">
        <div className="border-b border-slate-100 px-4 py-3">
          <div className="font-black text-slate-800">Sessões recentes do LAB</div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-slate-50 text-left text-[10px] font-black uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2">Início</th>
                <th className="px-3 py-2">Voucher</th>
                <th className="px-3 py-2">Plataforma</th>
                <th className="px-3 py-2">Modelo</th>
                <th className="px-4 py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {recentes.map((r) => (
                <tr key={r.id} onClick={() => setSessionId(r.id)} className="cursor-pointer border-t border-slate-100 hover:bg-violet-50/40">
                  <td className="px-4 py-2.5 text-xs font-semibold text-slate-600">{fmtDataHora(r.started_at)}</td>
                  <td className="px-3 py-2.5 font-bold text-slate-700">{r.voucher || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.platform || "—"}</td>
                  <td className="px-3 py-2.5 text-slate-600">{r.model || "—"}</td>
                  <td className="px-4 py-2.5 text-xs font-black uppercase text-slate-500">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
