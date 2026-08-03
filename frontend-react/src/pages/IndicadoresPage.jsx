import { useState, useEffect } from "react";
import {
  BarChart3, RefreshCw, AlertTriangle, TrendingUp, Package,
  Clock, Layers, Boxes, Truck, Info,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import {
  carregarPainel, listarMesesDisponiveis, atualizarBaseIndicadores, rotuloMes,
} from "../services/indicadoresService.js";

const ROXO   = "#7F2D92";
const AZUL   = "#1E2761";
const GELO   = "#A9BCE8";
const VERDE  = "#1F7A5C";
const AMBAR  = "#C08A16";
const VERMELHO = "#A32638";

const num = (v) => (v ?? 0).toLocaleString("pt-BR");
const diaCurto = (iso) => (iso ? iso.slice(8, 10) : "");

function Card({ children, className = "" }) {
  return <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>{children}</div>;
}

function Titulo({ icone: Icone, children, sub }) {
  return (
    <div className="flex items-start gap-2 mb-4">
      {Icone && <Icone className="h-4 w-4 text-[#7F2D92] mt-0.5 shrink-0" />}
      <div>
        <h3 className="text-sm font-black text-slate-800">{children}</h3>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function Kpi({ label, value, sub, cor = "slate" }) {
  const cores = {
    slate: "bg-white ring-slate-200 text-slate-800 text-slate-500 text-slate-400",
    verde: "bg-emerald-50 ring-emerald-200 text-emerald-800 text-emerald-700 text-emerald-600",
    ambar: "bg-amber-50 ring-amber-200 text-amber-800 text-amber-700 text-amber-600",
    vermelho: "bg-rose-50 ring-rose-200 text-rose-800 text-rose-700 text-rose-600",
  };
  const [bg, ring, vTxt, lTxt, sTxt] = cores[cor].split(" ");
  return (
    <div className={`rounded-2xl p-4 ring-1 shadow-sm ${bg} ${ring}`}>
      <div className={`text-xs font-semibold ${lTxt}`}>{label}</div>
      <div className={`text-2xl font-black mt-0.5 ${vTxt}`}>{value}</div>
      {sub && <div className={`text-xs mt-0.5 ${sTxt}`}>{sub}</div>}
    </div>
  );
}

function Aviso({ children }) {
  return (
    <div className="flex gap-2 text-xs text-slate-500 bg-slate-50 rounded-xl p-3 ring-1 ring-slate-200">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400" />
      <span>{children}</span>
    </div>
  );
}

const eixo = { fontSize: 11, fill: "#94A3B8" };
const tooltipStyle = {
  contentStyle: { fontSize: 12, borderRadius: 12, border: "1px solid #E2E8F0" },
  labelStyle: { fontWeight: 700, color: "#334155" },
};

export default function IndicadoresPage() {
  const [meses, setMeses]     = useState([]);
  const [mesRef, setMesRef]   = useState(null);
  const [dados, setDados]     = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro]       = useState(null);
  const [atualizando, setAtualizando] = useState(false);

  useEffect(() => { iniciar(); }, []);
  useEffect(() => { if (mesRef) carregar(mesRef); }, [mesRef]);

  async function iniciar() {
    try {
      const lista = await listarMesesDisponiveis();
      setMeses(lista);
      if (lista.length) setMesRef(lista[0]);
      else { setLoading(false); setErro("Nenhum periodo disponivel na base."); }
    } catch (e) {
      setErro(e.message); setLoading(false);
    }
  }

  async function carregar(mes) {
    setLoading(true); setErro(null);
    try {
      setDados(await carregarPainel(mes));
    } catch (e) {
      console.error(e); setErro(e.message); setDados(null);
    } finally { setLoading(false); }
  }

  async function handleAtualizarBase() {
    setAtualizando(true);
    try {
      await atualizarBaseIndicadores();
      await carregar(mesRef);
    } catch (e) { setErro(e.message); }
    finally { setAtualizando(false); }
  }

  const d = dados;

  // --- series derivadas para os graficos ---
  const serieExpedicao = (d?.expedicao || []).map((r) => ({ dia: diaCurto(r.dia), pedidos: r.total }));
  const serieTriagem   = (d?.triagem || []).map((r) => ({ dia: diaCurto(r.dia), funcional: r.funcional, cosmetica: r.cosmetica }));
  const serieB2B       = (d?.b2b?.serie || []).map((r) => ({ dia: diaCurto(r.dia), itens: r.itens }));
  const serieJanela    = (d?.slaJanela || []).map((r) => ({
    canal: r.marketplace, prazo: Number(r.prazo_dado_h), real: Number(r.tempo_real_h),
  }));
  const serieLead = (d?.leadTime?.etapas || []).map((e) => ({
    etapa: e.etapa.replace(" ate ", " → "), real: e.real, sla: e.sla, dentro: e.dentro,
  }));

  // faixas de atraso -> uma linha por canal, uma coluna por faixa
  const faixasCanais = [...new Set((d?.slaFaixas || []).map((r) => r.marketplace))];
  const faixasNomes  = [...new Set((d?.slaFaixas || []).map((r) => r.faixa))].sort();
  const serieFaixas  = faixasCanais.map((canal) => {
    const linha = { canal };
    faixasNomes.forEach((f) => {
      linha[f] = (d?.slaFaixas || []).find((r) => r.marketplace === canal && r.faixa === f)?.pedidos || 0;
    });
    return linha;
  });
  const corFaixa = (nome) =>
    nome.startsWith("0.") ? AZUL :
    nome.startsWith("1.") ? AMBAR :
    nome.startsWith("2.") ? "#D97706" :
    nome.startsWith("3.") ? "#B91C1C" : VERMELHO;

  return (
    <div className="space-y-5">
      {/* Cabecalho */}
      <div className="flex items-center gap-3 flex-wrap">
        <BarChart3 className="h-6 w-6 text-[#7F2D92]" />
        <div className="flex-1 min-w-[240px]">
          <h2 className="text-lg font-black text-slate-800">Painel de Indicadores · Operação Assurant</h2>
          <p className="text-xs text-slate-500">
            {d ? `Referência: ${d.rotulo}` : "Carregando período..."}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <select
            value={mesRef || ""}
            onChange={(e) => setMesRef(e.target.value)}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            {meses.map((m) => <option key={m} value={m}>{rotuloMes(m)}</option>)}
          </select>
          <button
            onClick={() => carregar(mesRef)}
            className="text-xs text-slate-500 hover:text-purple-700 font-semibold flex items-center gap-1 px-2 py-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Recarregar
          </button>
          <button
            onClick={handleAtualizarBase}
            disabled={atualizando}
            className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-[#7F2D92] text-white hover:bg-purple-800 disabled:opacity-50 flex items-center gap-1.5"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${atualizando ? "animate-spin" : ""}`} />
            {atualizando ? "Recalculando..." : "Atualizar base"}
          </button>
        </div>
      </div>

      {erro && (
        <div className="rounded-2xl p-4 bg-rose-50 ring-1 ring-rose-200 text-sm text-rose-800 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div><span className="font-bold">Falha ao carregar:</span> {erro}</div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : !d ? (
        <div className="text-center py-12 text-slate-400">
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Sem dados para o período selecionado.</p>
        </div>
      ) : (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Kpi label="Pedidos expedidos" value={num(d.resumo.expedido)} sub={`${d.resumo.diasOperados} dias operados`} />
            <Kpi label="Média por dia" value={num(d.resumo.mediaDia)} sub={d.resumo.picoDia?.dia ? `pico ${num(d.resumo.picoDia.total)} em ${diaCurto(d.resumo.picoDia.dia)}` : null} />
            <Kpi
              label="SLA de expedição"
              value={`${d.resumo.slaPct}%`}
              sub={`${num(d.resumo.slaDentro)} de ${num(d.resumo.slaAvaliados)}`}
              cor={d.resumo.slaPct >= 95 ? "verde" : d.resumo.slaPct >= 80 ? "ambar" : "vermelho"}
            />
            <Kpi
              label="Ocorrências de estoque"
              value={num(d.ocorrencias.somaOcorrencias)}
              sub={d.ocorrencias.total ? `${((d.ocorrencias.somaOcorrencias / d.ocorrencias.total) * 100).toFixed(1)}% dos pedidos` : null}
              cor="ambar"
            />
            <Kpi
              label="Cancelamentos"
              value={num(d.erros.cancelados)}
              sub={`${d.erros.pctCancelamento}% dos pedidos`}
              cor={d.erros.pctCancelamento > 10 ? "vermelho" : "slate"}
            />
          </div>

          {/* Expedicao por dia */}
          <Card>
            <Titulo icone={Truck} sub="Pedidos por data de entrega à transportadora">Expedição B2C por dia</Titulo>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={serieExpedicao} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="dia" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis tick={eixo} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="pedidos" fill={AZUL} radius={[4, 4, 0, 0]} name="Pedidos" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Canais + SLA */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <Titulo icone={Package} sub="Volume pago, expedido e cancelado">Canais de venda</Titulo>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-100">
                    <th className="text-left font-semibold pb-2">Canal</th>
                    <th className="text-right font-semibold pb-2">Pagos</th>
                    <th className="text-right font-semibold pb-2">Expedidos</th>
                    <th className="text-right font-semibold pb-2">Cancel.</th>
                    <th className="text-right font-semibold pb-2">%</th>
                  </tr>
                </thead>
                <tbody>
                  {d.canais.map((c) => (
                    <tr key={c.marketplace} className="border-b border-slate-50 last:border-0">
                      <td className="py-2 font-semibold text-slate-700">{c.marketplace}</td>
                      <td className="py-2 text-right text-slate-600">{num(c.pagos)}</td>
                      <td className="py-2 text-right text-slate-600">{num(c.expedidos)}</td>
                      <td className="py-2 text-right text-slate-600">{num(c.cancelados)}</td>
                      <td className={`py-2 text-right font-bold ${c.pctCancelamento > 10 ? "text-rose-700" : "text-slate-500"}`}>
                        {c.pctCancelamento}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>

            <Card>
              <Titulo icone={TrendingUp} sub="Entrega à transportadora dentro do prazo">SLA por canal</Titulo>
              <div className="space-y-3">
                {d.slaCanal.map((s) => (
                  <div key={s.marketplace}>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-700">
                        {s.marketplace}
                        {!s.usa_prazo_do_canal && (
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            régua D+1
                          </span>
                        )}
                      </span>
                      <span className={`font-bold ${s.pct_dentro >= 95 ? "text-emerald-700" : s.pct_dentro >= 80 ? "text-amber-700" : "text-rose-700"}`}>
                        {s.pct_dentro}%
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, s.pct_dentro)}%`,
                          background: s.pct_dentro >= 95 ? VERDE : s.pct_dentro >= 80 ? AMBAR : VERMELHO,
                        }}
                      />
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {num(s.dentro)} dentro · {num(s.fora)} fora · {num(s.avaliados)} avaliados
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* Janela x tempo real + faixas */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <Titulo icone={Clock} sub="Mediana em horas: prazo concedido pelo canal x tempo até o handover">
                Prazo concedido x tempo real
              </Titulo>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={serieJanela} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="canal" tick={eixo} axisLine={false} tickLine={false} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}h`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="prazo" name="Prazo concedido" fill={GELO} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="real"  name="Tempo real"      fill={AZUL} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              <Aviso>Barra escura acima da clara significa canal atendido fora da janela concedida.</Aviso>
            </Card>

            <Card>
              <Titulo icone={AlertTriangle} sub="Distribuição do atraso entre os pedidos fora do prazo">Faixas de atraso</Titulo>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={serieFaixas} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="canal" tick={eixo} axisLine={false} tickLine={false} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {faixasNomes.map((f) => (
                    <Bar key={f} dataKey={f} stackId="a" name={f.replace(/^\d\.\s*/, "")} fill={corFaixa(f)} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          {/* Ocorrencias de estoque */}
          <Card>
            <Titulo icone={Boxes} sub={`${num(d.ocorrencias.somaOcorrencias)} ocorrências sobre ${num(d.ocorrencias.total)} pedidos do mês`}>
              Pedidos vendidos sem estoque disponível
            </Titulo>
            <div className="space-y-2.5">
              {d.ocorrencias.categorias.map((c) => {
                const max = Math.max(1, ...d.ocorrencias.categorias.map((x) => x.ocorrencias));
                return (
                  <div key={c.categoria}>
                    <div className="flex justify-between items-center text-xs mb-1">
                      <span className="font-semibold text-slate-700">{c.categoria}</span>
                      <span className="text-slate-500">{num(c.ocorrencias)} · {c.pct}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(c.ocorrencias / max) * 100}%`, background: ROXO }} />
                    </div>
                  </div>
                );
              })}
              {!d.ocorrencias.categorias.length && (
                <p className="text-xs text-slate-400 py-4 text-center">Nenhuma ocorrência registrada no período.</p>
              )}
            </div>
          </Card>

          {/* Erros de processo */}
          <Card>
            <Titulo icone={AlertTriangle} sub="Integração, cancelamentos e volume do mês">Erros durante o processo</Titulo>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Kpi label="Falhas de integração" value={num(d.erros.falhas_integracao)} sub="marketplace / envio de XML" cor={d.erros.falhas_integracao > 0 ? "ambar" : "verde"} />
              <Kpi label="Pedidos cancelados"  value={num(d.erros.cancelados)} sub={`${d.erros.pctCancelamento}% do volume`} />
              <Kpi label="Pedidos no mês"      value={num(d.erros.pedidos)} sub="base de comparação" />
            </div>
          </Card>

          {/* Triagem */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <Titulo icone={Layers} sub="Eventos de triagem funcional e cosmética">Triagem por dia</Titulo>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={serieTriagem} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="dia" tick={eixo} axisLine={false} tickLine={false} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="funcional" name="Funcional" fill={AZUL} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="cosmetica" name="Cosmética" fill={ROXO} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <Titulo icone={Layers} sub={`${d.grades.pctNaoAlocavel}% do triado é não alocável (${num(d.grades.naoAlocaveis)} aparelhos)`}>
                Distribuição de grades
              </Titulo>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={d.grades.grades} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="grade" tick={{ ...eixo, fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="aparelhos" name="Aparelhos" radius={[4, 4, 0, 0]}>
                    {d.grades.grades.map((g) => (
                      <Cell key={g.grade} fill={g.alocavel ? AZUL : VERMELHO} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <Aviso>Barras em vermelho são grades não alocáveis (QUEBRADO e REGULAR).</Aviso>
            </Card>
          </div>

          {/* Lead time */}
          {d.leadTime && (
            <Card>
              <Titulo icone={Clock} sub={`Mediana em horas sobre ${num(d.leadTime.aparelhos)} aparelhos · ponta a ponta ${d.leadTime.pontaAPonta}h (${d.leadTime.pontaAPontaDias} dias)`}>
                Lead time por etapa
              </Titulo>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={serieLead} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="etapa" tick={{ ...eixo, fontSize: 9 }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={eixo} axisLine={false} tickLine={false} />
                  <Tooltip {...tooltipStyle} formatter={(v) => `${v}h`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="real" name="Tempo real" radius={[4, 4, 0, 0]}>
                    {serieLead.map((e) => <Cell key={e.etapa} fill={e.dentro ? VERDE : VERMELHO} />)}
                  </Bar>
                  <Bar dataKey="sla" name="SLA da etapa" fill={GELO} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Filas + estoque */}
          <div className="grid lg:grid-cols-2 gap-4">
            <Card>
              <Titulo icone={Layers} sub="Aparelhos aguardando processamento agora">Filas por etapa</Titulo>
              <div className="space-y-2.5">
                {d.filas.filas.map((f) => {
                  const max = Math.max(1, ...d.filas.filas.map((x) => x.aparelhos));
                  return (
                    <div key={f.etapa}>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="font-semibold text-slate-700">{f.etapa}</span>
                        <span className="text-slate-500">{num(f.aparelhos)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(f.aparelhos / max) * 100}%`, background: AZUL }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card>
              <Titulo icone={Boxes} sub={`${num(d.estoque.total)} aparelhos em subinventário · ${d.estoque.pctAcima60}% com mais de 60 dias`}>
                Posição e idade do estoque
              </Titulo>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Posição</p>
                  {d.estoque.posicao.map((p) => (
                    <div key={p.subinventario} className="flex justify-between text-xs">
                      <span className="text-slate-600 truncate pr-2">{p.subinventario}</span>
                      <span className="font-semibold text-slate-700 shrink-0">{num(p.aparelhos)}</span>
                    </div>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase">Idade</p>
                  {d.estoque.aging.map((a) => (
                    <div key={a.faixa} className="flex justify-between text-xs">
                      <span className="text-slate-600 truncate pr-2">{a.faixa.replace(/^\d\.\s*/, "")}</span>
                      <span className="font-semibold text-slate-700 shrink-0">{num(a.aparelhos)}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3"><Aviso>{d.estoque.ressalva}</Aviso></div>
            </Card>
          </div>

          {/* B2B */}
          <Card>
            <Titulo icone={Truck} sub={`${num(d.b2b.total)} itens em ${d.b2b.diasOperados} dias operados · média de ${num(d.b2b.mediaDia)} por dia`}>
              Expedição B2B por dia
            </Titulo>
            <ResponsiveContainer width="100%" height={230}>
              <BarChart data={serieB2B} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="dia" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis tick={eixo} axisLine={false} tickLine={false} />
                <Tooltip {...tooltipStyle} />
                <Bar dataKey="itens" name="Itens" fill={ROXO} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <Aviso>
              O SLA contratual de B2B (90% em 24h) ainda não é apurado aqui: depende de validar a data de origem
              do pedido, que hoje pode divergir da data de importação do lote.
            </Aviso>
          </Card>
        </>
      )}
    </div>
  );
}