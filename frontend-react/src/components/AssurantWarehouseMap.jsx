import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

function fmtTempo(horas) {
  if (!horas && horas !== 0) return null;
  if (horas < 1)  return `${Math.round(horas * 60)}min`;
  if (horas < 24) return `${horas.toFixed(1)}h`;
  return `${(horas / 24).toFixed(1)}d`;
}

function corTempo(horas, sla) {
  if (!horas) return { bg: "#F1EFE8", color: "#5F5E5A", border: "#C8C6C0" };
  if (sla && horas <= sla)      return { bg: "#EAF3DE", color: "#27500A", border: "#639922" };
  if (sla && horas <= sla * 2)  return { bg: "#FAEEDA", color: "#633806", border: "#BA7517" };
  if (sla)                      return { bg: "#FCEBEB", color: "#791F1F", border: "#E24B4A" };
  return { bg: "#E6F1FB", color: "#0C447C", border: "#378ADD" };
}

const ETAPA_SLA = {
  "Recebimento":      24,
  "Triagem Funcional": 24,
  "Triagem Cosmética": 24,
  "Laudo":             48,
  "Alocação":          24,
  "Oracle":            24,
  "Produto expedido":  24,
};

const STATION_DEFS = {
  expedicao:          { name: "Expedição",             etapa: "Produto expedido",   cor: "#F97316", icon: "📤" },
  reparo:             { name: "Envio Reparo",           etapa: "Reservado para reparo", cor: "#E24B4A", icon: "🔧" },
  oracle:             { name: "Oracle",                 etapa: "Oracle",             cor: "#1D9E75", icon: "💻" },
  laudo:              { name: "Laudo",                  etapa: "Laudo",              cor: "#7F2D92", icon: "📋" },
  triagem_cosmetica:  { name: "Triagem Cosmética",      etapa: "Triagem Cosmética",  cor: "#7F2D92", icon: "🔍" },
  triagem_funcional:  { name: "Triagem Funcional",      etapa: "Triagem Funcional",  cor: "#9B3AAD", icon: "⚡" },
  alocacao:           { name: "Alocação",               etapa: "Alocação",           cor: "#1D9E75", icon: "📦" },
  recebimento:        { name: "Recebimento",            etapa: "Recebimento",        cor: "#3B8BD4", icon: "📥" },
  bateria:            { name: "Carga Bateria",          etapa: null,                 cor: "#BA7517", icon: "🔋" },
  faturamento:        { name: "Faturamento",            etapa: null,                 cor: "#888780", icon: "💰" },
  seguradora:         { name: "Assurant Seguradora",    etapa: null,                 cor: "#888780", icon: "🏢" },
};

// Fluxo principal com posições das setas
// de → para → [texto âncora de/para em %]
const FLUXO = [
  { de: "recebimento",       para: "triagem_funcional",  label: null },
  { de: "triagem_funcional", para: "triagem_cosmetica",  label: null },
  { de: "triagem_cosmetica", para: "laudo",              label: null },
  { de: "laudo",             para: "alocacao",           label: null },
  { de: "alocacao",          para: "oracle",             label: null },
  { de: "oracle",            para: "expedicao",          label: null },
  { de: "triagem_funcional", para: "reparo",             label: null },
];

// Posições absolutas em % de cada estação
const POSITIONS = {
  expedicao:         { left: 2,  top: 17, w: 13, h: 15 },
  reparo:            { left: 2,  top: 68, w: 13, h: 14 },
  oracle:            { left: 18, top: 17, w: 12, h: 13 },
  oracle2:           { left: 32, top: 17, w: 12, h: 13 },
  laudo:             { left: 18, top: 35, w: 12, h: 14 },
  triagem_cosmetica: { left: 32, top: 35, w: 12, h: 14 },
  triagem_funcional: { left: 18, top: 53, w: 12, h: 14 },
  triagem_funcional2:{ left: 32, top: 53, w: 12, h: 14 },
  bateria:           { left: 18, top: 76, w: 12, h: 12 },
  bateria2:          { left: 32, top: 76, w: 12, h: 12 },
  alocacao:          { left: 46, top: 17, w: 12, h: 13 },
  recebimento:       { left: 46, top: 62, w: 13, h: 20 },
  faturamento:       { right: 2, top: 17, w: 16, h: 20 },
  seguradora:        { right: 2, top: 60, w: 17, h: 14 },
};

function Station({ def, pos, active, onClick, tempo, sla, disabled }) {
  const c = corTempo(tempo?.media_horas, sla);
  const style = {
    position: "absolute",
    borderRadius: 8,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    cursor: disabled ? "default" : "pointer",
    textAlign: "center",
    padding: "5px 3px",
    border: active ? `2px solid #7F2D92` : `1.5px solid ${def.cor}22`,
    boxShadow: active ? "0 0 0 3px rgba(127,45,146,0.15)" : "none",
    background: `${def.cor}12`,
    transition: "transform 0.15s",
    zIndex: active ? 10 : 1,
    width: `${pos.w}%`,
    height: `${pos.h}%`,
    top: pos.top !== undefined ? `${pos.top}%` : undefined,
    left: pos.left !== undefined ? `${pos.left}%` : undefined,
    right: pos.right !== undefined ? `${pos.right}%` : undefined,
  };

  return (
    <div onClick={disabled ? undefined : onClick} style={style}>
      <div style={{ fontSize: 14, marginBottom: 1 }}>{def.icon}</div>
      <div style={{ fontSize: 8, fontWeight: 600, lineHeight: 1.2, color: "#1a1a1a" }}>
        {def.name}
      </div>
      {tempo?.media_horas != null && (
        <div style={{
          fontSize: 8, marginTop: 2, fontWeight: 700,
          background: c.bg, color: c.color,
          border: `1px solid ${c.border}`,
          padding: "1px 4px", borderRadius: 5,
        }}>
          {fmtTempo(tempo.media_horas)}
        </div>
      )}
    </div>
  );
}

const LEGEND = [
  { cor: "#EAF3DE", border: "#639922", color: "#27500A", label: "Dentro do SLA" },
  { cor: "#FAEEDA", border: "#BA7517", color: "#633806", label: "Atenção" },
  { cor: "#FCEBEB", border: "#E24B4A", color: "#791F1F", label: "Fora do SLA" },
];

export default function AssurantWarehouseMap({ meses }) {
  const [tempos, setTempos]   = useState({});
  const [sel, setSel]         = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!meses?.length) return;
    async function load() {
      setLoading(true);
      const { data } = await supabase.rpc("assurant_sla_tempo_etapas", { meses });
      if (data) {
        // Mapear etapa → próxima etapa → tempo
        const map = {};
        data.forEach(r => {
          const key = `${r.etapa}→${r.prox_etapa}`;
          map[key] = r;
        });
        setTempos(map);
      }
      setLoading(false);
    }
    load();
  }, [meses]);

  // Pegar tempo de uma transição
  function getT(etapaA, etapaB) {
    return tempos[`${etapaA}→${etapaB}`] || null;
  }

  // Tempos por estação (tempo ATÉ a próxima etapa)
  const T = {
    recebimento:       getT("Recebimento",       "Triagem Funcional"),
    triagem_funcional: getT("Triagem Funcional",  "Triagem Cosmética"),
    triagem_cosmetica: getT("Triagem Cosmética",  "Laudo"),
    laudo:             getT("Laudo",              "Alocação"),
    alocacao:          getT("Alocação",           "Oracle"),
    oracle:            getT("Oracle",             "Produto expedido"),
    expedicao:         null,
    reparo:            getT("Triagem Funcional",  "Reservado para reparo"),
  };

  const selDef = sel ? STATION_DEFS[sel] : null;
  const selT   = sel ? T[sel] : null;
  const selSLA = sel ? ETAPA_SLA[STATION_DEFS[sel]?.etapa] : null;
  const selCor = selT ? corTempo(selT.media_horas, selSLA) : null;

  return (
    <div className="space-y-4">

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: l.cor, border: `1px solid ${l.border}` }} />
            <span className="text-xs" style={{ color: l.color }}>{l.label}</span>
          </div>
        ))}
        <span className="text-xs text-slate-400 ml-auto">
          {loading ? "Carregando tempos..." : "Clique em uma estação para ver detalhes"}
        </span>
      </div>

      {/* Mapa */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div style={{ position: "relative", width: "100%", paddingBottom: "62%", minHeight: 340 }}>
          <div style={{ position: "absolute", inset: 0 }}>

            {/* Fundo */}
            <div style={{ position: "absolute", inset: 0, background: "#F8F7F5", borderRadius: 16 }} />

            {/* Prateleiras */}
            <div style={{ position: "absolute", top: "2%", left: "1%", right: "42%", height: "11%",
              display: "flex", gap: "1%" }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ flex: 1, background: "#E8E6E0",
                  border: "0.5px solid #C8C6C0", borderRadius: 4, opacity: 0.6 }} />
              ))}
            </div>
            <div style={{ position:"absolute", top:"2%", left:"1%",
              fontSize:7, color:"#999", fontWeight:500, letterSpacing:0.5 }}>ESTOQUE ↑</div>

            {/* Divisória */}
            <div style={{ position:"absolute", top:0, bottom:0, right:"40%",
              width:1, background:"#D0CEC8", opacity:0.5 }} />

            {/* Área administrativa */}
            <div style={{ position:"absolute", top:0, right:0, bottom:0, width:"40%",
              background:"#F2F0EC", borderLeft:"0.5px solid #D0CEC8",
              borderRadius:"0 16px 16px 0" }} />
            <div style={{ position:"absolute", top:"2%", right:"2%",
              fontSize:7, color:"#999", fontWeight:500, letterSpacing:0.5 }}>ÁREA ADMINISTRATIVA</div>

            {/* Estações */}
            <Station def={STATION_DEFS.expedicao} pos={POSITIONS.expedicao}
              active={sel==="expedicao"} onClick={() => setSel(sel==="expedicao"?null:"expedicao")}
              tempo={T.expedicao} sla={ETAPA_SLA["Produto expedido"]} />

            <Station def={STATION_DEFS.reparo} pos={POSITIONS.reparo}
              active={sel==="reparo"} onClick={() => setSel(sel==="reparo"?null:"reparo")}
              tempo={T.reparo} sla={null} />

            <Station def={STATION_DEFS.oracle} pos={POSITIONS.oracle}
              active={sel==="oracle"} onClick={() => setSel(sel==="oracle"?null:"oracle")}
              tempo={T.oracle} sla={ETAPA_SLA["Oracle"]} />

            <Station def={STATION_DEFS.oracle} pos={POSITIONS.oracle2}
              active={sel==="oracle"} onClick={() => setSel(sel==="oracle"?null:"oracle")}
              tempo={T.oracle} sla={ETAPA_SLA["Oracle"]} />

            <Station def={STATION_DEFS.laudo} pos={POSITIONS.laudo}
              active={sel==="laudo"} onClick={() => setSel(sel==="laudo"?null:"laudo")}
              tempo={T.laudo} sla={ETAPA_SLA["Laudo"]} />

            <Station def={STATION_DEFS.triagem_cosmetica} pos={POSITIONS.triagem_cosmetica}
              active={sel==="triagem_cosmetica"} onClick={() => setSel(sel==="triagem_cosmetica"?null:"triagem_cosmetica")}
              tempo={T.triagem_cosmetica} sla={ETAPA_SLA["Triagem Cosmética"]} />

            <Station def={STATION_DEFS.triagem_funcional} pos={POSITIONS.triagem_funcional}
              active={sel==="triagem_funcional"} onClick={() => setSel(sel==="triagem_funcional"?null:"triagem_funcional")}
              tempo={T.triagem_funcional} sla={ETAPA_SLA["Triagem Funcional"]} />

            <Station def={STATION_DEFS.triagem_funcional} pos={POSITIONS.triagem_funcional2}
              active={sel==="triagem_funcional"} onClick={() => setSel(sel==="triagem_funcional"?null:"triagem_funcional")}
              tempo={T.triagem_funcional} sla={ETAPA_SLA["Triagem Funcional"]} />

            <Station def={STATION_DEFS.bateria} pos={POSITIONS.bateria}
              active={false} disabled tempo={null} sla={null} />
            <Station def={STATION_DEFS.bateria} pos={POSITIONS.bateria2}
              active={false} disabled tempo={null} sla={null} />

            <Station def={STATION_DEFS.alocacao} pos={POSITIONS.alocacao}
              active={sel==="alocacao"} onClick={() => setSel(sel==="alocacao"?null:"alocacao")}
              tempo={T.alocacao} sla={ETAPA_SLA["Alocação"]} />

            <Station def={STATION_DEFS.recebimento} pos={POSITIONS.recebimento}
              active={sel==="recebimento"} onClick={() => setSel(sel==="recebimento"?null:"recebimento")}
              tempo={T.recebimento} sla={ETAPA_SLA["Recebimento"]} />

            <Station def={STATION_DEFS.faturamento} pos={POSITIONS.faturamento}
              active={false} disabled tempo={null} sla={null} />

            <Station def={STATION_DEFS.seguradora} pos={POSITIONS.seguradora}
              active={false} disabled tempo={null} sla={null} />

            {/* SVG setas com tempo nas setas */}
            <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none" }}
              viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                {["blue","purple","orange","red","green"].map(c => {
                  const stroke = c==="blue"?"#3B8BD4":c==="purple"?"#7F2D92":c==="orange"?"#F97316":c==="red"?"#E24B4A":"#1D9E75";
                  return (
                    <marker key={c} id={`arr-${c}`} viewBox="0 0 10 10" refX="8" refY="5"
                      markerWidth="3.5" markerHeight="3.5" orient="auto-start-reverse">
                      <path d="M2 1L8 5L2 9" fill="none" stroke={stroke}
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </marker>
                  );
                })}
              </defs>

              {/* Recebimento → Triagem Funcional */}
              <path d="M52 72 L52 62 L38 62 L38 67"
                fill="none" stroke="#3B8BD4" strokeWidth="0.5"
                strokeDasharray="2 1.2" markerEnd="url(#arr-blue)"/>

              {/* Triagem Funcional → Triagem Cosmética */}
              <path d="M30 53 L30 48 L38 48 L38 42"
                fill="none" stroke="#7F2D92" strokeWidth="0.5"
                strokeDasharray="2 1.2" markerEnd="url(#arr-purple)"/>

              {/* Triagem Cosmética → Laudo */}
              <path d="M32 42 L24 42"
                fill="none" stroke="#7F2D92" strokeWidth="0.5"
                strokeDasharray="2 1.2" markerEnd="url(#arr-purple)"/>

              {/* Laudo → Alocação */}
              <path d="M24 35 L24 27 L46 27 L46 23"
                fill="none" stroke="#1D9E75" strokeWidth="0.5"
                strokeDasharray="2 1.2" markerEnd="url(#arr-green)"/>

              {/* Alocação → Oracle */}
              <path d="M46 23 L38 23 L38 24"
                fill="none" stroke="#1D9E75" strokeWidth="0.5"
                strokeDasharray="2 1.2" markerEnd="url(#arr-green)"/>

              {/* Oracle → Expedição */}
              <path d="M18 23 L15 23 L15 24"
                fill="none" stroke="#F97316" strokeWidth="0.5"
                strokeDasharray="2 1.2" markerEnd="url(#arr-orange)"/>

              {/* Triagem Funcional → Reparo */}
              <path d="M18 60 L8 60 L8 72"
                fill="none" stroke="#E24B4A" strokeWidth="0.4"
                strokeDasharray="1.5 1.2" markerEnd="url(#arr-red)"/>
            </svg>

            {/* Badges de tempo nas setas */}
            {/* Recebimento → T.Funcional */}
            {T.recebimento && (
              <div style={{ position:"absolute", left:"46%", top:"60%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.recebimento} sla={ETAPA_SLA["Recebimento"]} />
              </div>
            )}
            {/* T.Funcional → T.Cosmética */}
            {T.triagem_funcional && (
              <div style={{ position:"absolute", left:"35%", top:"46%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.triagem_funcional} sla={ETAPA_SLA["Triagem Funcional"]} />
              </div>
            )}
            {/* T.Cosmética → Laudo */}
            {T.triagem_cosmetica && (
              <div style={{ position:"absolute", left:"25%", top:"39%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.triagem_cosmetica} sla={ETAPA_SLA["Triagem Cosmética"]} />
              </div>
            )}
            {/* Laudo → Alocação */}
            {T.laudo && (
              <div style={{ position:"absolute", left:"36%", top:"27%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.laudo} sla={ETAPA_SLA["Laudo"]} />
              </div>
            )}
            {/* Alocação → Oracle */}
            {T.alocacao && (
              <div style={{ position:"absolute", left:"42%", top:"20%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.alocacao} sla={ETAPA_SLA["Alocação"]} />
              </div>
            )}
            {/* Oracle → Expedição */}
            {T.oracle && (
              <div style={{ position:"absolute", left:"13%", top:"19%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.oracle} sla={ETAPA_SLA["Oracle"]} />
              </div>
            )}
            {/* T.Funcional → Reparo */}
            {T.reparo && (
              <div style={{ position:"absolute", left:"10%", top:"62%", transform:"translateX(-50%)",
                zIndex:5, pointerEvents:"none" }}>
                <TimeBadge t={T.reparo} sla={null} />
              </div>
            )}

            {/* Label fluxo */}
            <div style={{ position:"absolute", bottom:"1%", left:"1%",
              fontSize:7, color:"#BBB", lineHeight:1.4 }}>
              Fluxo principal: Recebimento → T.Funcional → T.Cosmética → Laudo → Alocação → Oracle → Expedição
            </div>
          </div>
        </div>
      </div>

      {/* Painel detalhe */}
      {sel && selDef && (
        <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <div className="h-3 w-3 rounded-full shrink-0" style={{ background: selDef.cor }} />
            <h3 className="font-bold text-slate-800 text-sm">{selDef.name}</h3>
            {selT && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
                style={{ background: selCor.bg, color: selCor.color, border: `1px solid ${selCor.border}` }}>
                {fmtTempo(selT.media_horas)} até próx. etapa
              </span>
            )}
            {selT && selSLA && (
              <span className="text-xs font-semibold"
                style={{ color: selT.media_horas <= selSLA ? "#27500A" : "#791F1F" }}>
                {selT.media_horas <= selSLA ? "✓ Dentro do SLA" : "✗ Fora do SLA"}
              </span>
            )}
          </div>
          <div className="flex gap-6 flex-wrap">
            {selT && (
              <>
                <div>
                  <div className="text-lg font-black text-slate-800">{fmtTempo(selT.media_horas)}</div>
                  <div className="text-xs text-slate-400">Tempo médio até próx. etapa</div>
                </div>
                <div>
                  <div className="text-lg font-black text-slate-800">{fmtTempo(selT.media_dias * 24)}</div>
                  <div className="text-xs text-slate-400">Em dias</div>
                </div>
                <div>
                  <div className="text-lg font-black text-slate-800">{(selT.total || 0).toLocaleString("pt-BR")}</div>
                  <div className="text-xs text-slate-400">Casos analisados</div>
                </div>
              </>
            )}
            {selSLA && (
              <div>
                <div className="text-lg font-black text-slate-800">{selSLA}h</div>
                <div className="text-xs text-slate-400">Meta SLA contratual</div>
              </div>
            )}
            {!selT && (
              <p className="text-xs text-slate-400">Sem dados de tempo para esta estação no período selecionado.</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

function TimeBadge({ t, sla }) {
  if (!t?.media_horas) return null;
  const c = corTempo(t.media_horas, sla);
  return (
    <div style={{
      background: c.bg, color: c.color,
      border: `1px solid ${c.border}`,
      borderRadius: 5, padding: "1px 4px",
      fontSize: 7, fontWeight: 700,
      whiteSpace: "nowrap",
    }}>
      {t.media_horas < 24
        ? `${t.media_horas.toFixed(1)}h`
        : `${(t.media_horas/24).toFixed(1)}d`}
    </div>
  );
}