import { useState } from "react";

const STATIONS = {
  recebimento: {
    name: "Recebimento / Filmagem",
    desc: "Entrada dos aparelhos no warehouse. Registro, conferência e filmagem dos dispositivos recebidos.",
    cor: "#3B8BD4",
    sla: 24,
    horas: 18.2,
  },
  triagem_funcional: {
    name: "Triagem Funcional",
    desc: "Verificação do funcionamento do dispositivo. Teste de ligar, bateria, tela e funções básicas.",
    cor: "#9B3AAD",
    sla: 24,
    horas: 31.5,
  },
  triagem_cosmetica: {
    name: "Triagem Cosmética",
    desc: "Avaliação do estado físico: tela, laterais, traseira e defeitos adicionais. Classificação da grade estética.",
    cor: "#7F2D92",
    sla: 24,
    horas: 28.4,
  },
  laudo: {
    name: "Laudo / Triagem ALS",
    desc: "Emissão de laudo técnico detalhado para aparelhos com necessidade de avaliação especializada.",
    cor: "#7F2D92",
    sla: 48,
    horas: 72.1,
  },
  alocacao: {
    name: "Alocação",
    desc: "Organização e separação dos aparelhos por destino: B2B, B2C, Seguradora ou Reparo.",
    cor: "#1D9E75",
    sla: 24,
    horas: 22.3,
  },
  oracle: {
    name: "Entrada Oracle",
    desc: "Registro e entrada dos aparelhos no sistema Oracle para controle de estoque e rastreabilidade.",
    cor: "#1D9E75",
    sla: 24,
    horas: 19.8,
  },
  expedicao: {
    name: "Expedição",
    desc: "Separação, embalagem e envio dos aparelhos para os destinos finais (B2B, B2C, Seguradora).",
    cor: "#F97316",
    sla: 24,
    horas: 15.6,
  },
  reparo: {
    name: "Envio para Reparo",
    desc: "Aparelhos destinados ao processo de reparo técnico. Inclui laudos de retorno após conserto.",
    cor: "#E24B4A",
    sla: 48,
    horas: null,
  },
  faturamento: {
    name: "Faturamento",
    desc: "Área administrativa de emissão e gestão de notas fiscais para os pedidos expedidos.",
    cor: "#888780",
    sla: null,
    horas: null,
  },
  seguradora: {
    name: "Assurant Seguradora",
    desc: "Área dedicada à operação da Assurant Seguradora S.A. — sinistros e substituições.",
    cor: "#888780",
    sla: null,
    horas: null,
  },
  bateria: {
    name: "Carga de Bateria",
    desc: "Estações de carga para aparelhos que chegam descarregados e precisam de energia para triagem.",
    cor: "#BA7517",
    sla: null,
    horas: null,
  },
};

function fmtTempo(horas) {
  if (!horas) return "—";
  if (horas < 24) return `${horas.toFixed(1)}h`;
  return `${(horas / 24).toFixed(1)}d`;
}

function classeTempo(horas, sla) {
  if (!horas || !sla) return { bg: "#F1EFE8", color: "#5F5E5A" };
  if (horas <= sla)      return { bg: "#EAF3DE", color: "#27500A" };
  if (horas <= sla * 2)  return { bg: "#FAEEDA", color: "#633806" };
  return                        { bg: "#FCEBEB", color: "#791F1F" };
}

function Station({ id, style, icon, label, active, onClick, horas, sla, disabled = false }) {
  const cls = classeTempo(horas, sla);
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        position: "absolute",
        borderRadius: 8,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        cursor: disabled ? "default" : "pointer",
        textAlign: "center",
        padding: "6px 4px",
        border: active ? "2px solid #7F2D92" : "1.5px solid transparent",
        boxShadow: active ? "0 0 0 3px rgba(127,45,146,0.15)" : "none",
        transition: "transform 0.15s, box-shadow 0.15s",
        zIndex: active ? 10 : 1,
        ...style,
      }}
    >
      <div style={{ fontSize: 16, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 9, fontWeight: 500, lineHeight: 1.2, color: "#1a1a1a" }}>{label}</div>
      {horas !== undefined && (
        <div style={{
          fontSize: 8, marginTop: 2, fontWeight: 600,
          background: cls.bg, color: cls.color,
          padding: "1px 5px", borderRadius: 6,
        }}>
          {fmtTempo(horas)}
        </div>
      )}
    </div>
  );
}

const LEGEND = [
  { cor: "#7F2D92", label: "Triagem" },
  { cor: "#F97316", label: "Expedição/Envio" },
  { cor: "#3B8BD4", label: "Recebimento" },
  { cor: "#1D9E75", label: "Oracle/Alocação" },
  { cor: "#888780", label: "Administrativo" },
];

export default function AssurantLayoutPage() {
  const [sel, setSel] = useState("recebimento");

  const s  = STATIONS[sel];
  const cls = classeTempo(s.horas, s.sla);

  function toggle(id) {
    setSel(id === sel ? "recebimento" : id);
  }

  return (
    <div className="space-y-4">

      {/* Legenda */}
      <div className="flex items-center gap-4 flex-wrap">
        {LEGEND.map(l => (
          <div key={l.label} className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: l.cor }} />
            <span className="text-xs text-slate-500">{l.label}</span>
          </div>
        ))}
        <span className="text-xs text-slate-400 ml-auto">Clique em uma estação para ver os detalhes</span>
      </div>

      {/* Mapa */}
      <div className="bg-white rounded-2xl ring-1 ring-slate-200 shadow-sm overflow-hidden">
        <div style={{ position: "relative", width: "100%", paddingBottom: "62%", minHeight: 320 }}>
          <div style={{ position: "absolute", inset: 0 }}>

            {/* Fundo */}
            <div style={{ position: "absolute", inset: 0, background: "#F8F7F5", borderRadius: 16 }} />

            {/* Prateleiras estoque (topo) */}
            <div style={{ position: "absolute", top: "2%", left: "1%", right: "42%", height: "12%",
              display: "flex", gap: "1%", alignItems: "stretch" }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} style={{ flex: 1, background: "#E8E6E0", border: "0.5px solid #C8C6C0",
                  borderRadius: 4, opacity: 0.7 }} />
              ))}
            </div>
            <div style={{ position: "absolute", top: "2%", left: "1%",
              fontSize: 8, color: "#888", fontWeight: 500, letterSpacing: 0.5 }}>
              ESTOQUE ↑
            </div>

            {/* Divisória */}
            <div style={{ position: "absolute", top: 0, bottom: 0, right: "40%", width: 1,
              background: "#D0CEC8", opacity: 0.6 }} />

            {/* Área administrativa (fundo direito) */}
            <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: "40%",
              background: "#F2F0EC", borderLeft: "0.5px solid #D0CEC8",
              borderRadius: "0 16px 16px 0", opacity: 0.8 }} />
            <div style={{ position: "absolute", top: "2%", right: "2%",
              fontSize: 8, color: "#888", fontWeight: 500, letterSpacing: 0.5 }}>
              ÁREA ADMINISTRATIVA
            </div>

            {/* EXPEDIÇÃO */}
            <Station id="expedicao"
              style={{ left:"2%", top:"17%", width:"13%", height:"15%", background:"#FFF2E8", borderColor:"#F97316" }}
              icon="📤" label="Expedição" active={sel==="expedicao"}
              onClick={() => toggle("expedicao")}
              horas={STATIONS.expedicao.horas} sla={STATIONS.expedicao.sla}
            />

            {/* ENVIO REPARO */}
            <Station id="reparo"
              style={{ left:"2%", top:"68%", width:"13%", height:"14%", background:"#FEF3F3", borderColor:"#E24B4A" }}
              icon="🔧" label="Envio Reparo" active={sel==="reparo"}
              onClick={() => toggle("reparo")}
              horas={STATIONS.reparo.horas} sla={STATIONS.reparo.sla}
            />

            {/* ORACLE 1 */}
            <Station id="oracle"
              style={{ left:"18%", top:"17%", width:"12%", height:"13%", background:"#E8F5F0", borderColor:"#1D9E75" }}
              icon="💻" label="Oracle" active={sel==="oracle"}
              onClick={() => toggle("oracle")}
              horas={STATIONS.oracle.horas} sla={STATIONS.oracle.sla}
            />

            {/* ORACLE 2 */}
            <Station id="oracle2"
              style={{ left:"32%", top:"17%", width:"12%", height:"13%", background:"#E8F5F0", borderColor:"#1D9E75" }}
              icon="💻" label="Oracle" active={sel==="oracle"}
              onClick={() => toggle("oracle")}
              horas={STATIONS.oracle.horas} sla={STATIONS.oracle.sla}
            />

            {/* LAUDO */}
            <Station id="laudo"
              style={{ left:"18%", top:"35%", width:"12%", height:"14%", background:"#F0EBFE", borderColor:"#7F2D92" }}
              icon="📋" label="Laudo" active={sel==="laudo"}
              onClick={() => toggle("laudo")}
              horas={STATIONS.laudo.horas} sla={STATIONS.laudo.sla}
            />

            {/* TRIAGEM COSMÉTICA */}
            <Station id="triagem_cosmetica"
              style={{ left:"32%", top:"35%", width:"12%", height:"14%", background:"#F0EBFE", borderColor:"#7F2D92" }}
              icon="🔍" label="T. Cosmética" active={sel==="triagem_cosmetica"}
              onClick={() => toggle("triagem_cosmetica")}
              horas={STATIONS.triagem_cosmetica.horas} sla={STATIONS.triagem_cosmetica.sla}
            />

            {/* TRIAGEM FUNCIONAL 1 */}
            <Station id="triagem_funcional"
              style={{ left:"18%", top:"53%", width:"12%", height:"14%", background:"#F0EBFE", borderColor:"#9B3AAD" }}
              icon="⚡" label="T. Funcional" active={sel==="triagem_funcional"}
              onClick={() => toggle("triagem_funcional")}
              horas={STATIONS.triagem_funcional.horas} sla={STATIONS.triagem_funcional.sla}
            />

            {/* TRIAGEM FUNCIONAL 2 */}
            <Station id="triagem_funcional2"
              style={{ left:"32%", top:"53%", width:"12%", height:"14%", background:"#F0EBFE", borderColor:"#9B3AAD" }}
              icon="⚡" label="T. Funcional" active={sel==="triagem_funcional"}
              onClick={() => toggle("triagem_funcional")}
              horas={STATIONS.triagem_funcional.horas} sla={STATIONS.triagem_funcional.sla}
            />

            {/* CARGA BATERIA */}
            <Station id="bateria"
              style={{ left:"18%", top:"76%", width:"12%", height:"12%", background:"#FFF8E8", borderColor:"#BA7517" }}
              icon="🔋" label="Carga Bateria" active={sel==="bateria"}
              onClick={() => toggle("bateria")}
            />
            <Station id="bateria2"
              style={{ left:"32%", top:"76%", width:"12%", height:"12%", background:"#FFF8E8", borderColor:"#BA7517" }}
              icon="🔋" label="Carga Bateria" active={sel==="bateria"}
              onClick={() => toggle("bateria")}
            />

            {/* ALOCAÇÃO */}
            <Station id="alocacao"
              style={{ left:"46%", top:"17%", width:"12%", height:"13%", background:"#E8F5F0", borderColor:"#1D9E75" }}
              icon="📦" label="Alocação" active={sel==="alocacao"}
              onClick={() => toggle("alocacao")}
              horas={STATIONS.alocacao.horas} sla={STATIONS.alocacao.sla}
            />

            {/* RECEBIMENTO */}
            <Station id="recebimento"
              style={{ left:"46%", top:"62%", width:"13%", height:"20%", background:"#E6F1FB", borderColor:"#3B8BD4" }}
              icon="📥" label="Recebimento / Filmagem" active={sel==="recebimento"}
              onClick={() => toggle("recebimento")}
              horas={STATIONS.recebimento.horas} sla={STATIONS.recebimento.sla}
            />

            {/* SALA REUNIÃO */}
            <Station id="reuniao"
              style={{ left:"46%", top:"88%", width:"12%", height:"10%", background:"#F5F5F0", borderColor:"#888780" }}
              icon="📅" label="Sala Reunião" disabled
            />

            {/* FATURAMENTO */}
            <Station id="faturamento"
              style={{ right:"2%", top:"17%", width:"16%", height:"20%", background:"#F5F5F0", borderColor:"#888780" }}
              icon="💰" label="Faturamento" active={sel==="faturamento"}
              onClick={() => toggle("faturamento")}
            />

            {/* LÍDER */}
            <Station id="lider"
              style={{ right:"20%", top:"38%", width:"10%", height:"12%", background:"#F5F5F0", borderColor:"#888780" }}
              icon="👤" label="Líder" disabled
            />

            {/* CONSULTOR */}
            <Station id="consultor"
              style={{ right:"8%", top:"44%", width:"11%", height:"12%", background:"#F5F5F0", borderColor:"#888780" }}
              icon="🤝" label="Consultor" disabled
            />

            {/* ASSURANT SEGURADORA */}
            <Station id="seguradora"
              style={{ right:"2%", top:"60%", width:"17%", height:"14%", background:"#F5F5F0", borderColor:"#888780" }}
              icon="🏢" label="Assurant Seguradora" active={sel==="seguradora"}
              onClick={() => toggle("seguradora")}
            />

            {/* Setas SVG */}
            <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none" }}
              viewBox="0 0 100 100" preserveAspectRatio="none">
              <defs>
                <marker id="a1" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#7F2D92" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
                <marker id="a2" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#3B8BD4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
                <marker id="a3" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#F97316" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
                <marker id="a4" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                  <path d="M2 1L8 5L2 9" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </marker>
              </defs>
              {/* Recebimento → Triagem Funcional */}
              <path d="M52 72 L52 62 L38 62 L38 67" fill="none" stroke="#3B8BD4" strokeWidth="0.4" strokeDasharray="1.5 1" markerEnd="url(#a2)"/>
              {/* Triagem Funcional → Triagem Cosmética */}
              <path d="M30 53 L30 48 L38 48" fill="none" stroke="#7F2D92" strokeWidth="0.4" strokeDasharray="1.5 1" markerEnd="url(#a1)"/>
              {/* Triagem Cosmética → Laudo */}
              <path d="M32 42 L24 42" fill="none" stroke="#7F2D92" strokeWidth="0.4" strokeDasharray="1.5 1" markerEnd="url(#a1)"/>
              {/* Laudo → Alocação */}
              <path d="M24 35 L24 28 L46 28 L46 23" fill="none" stroke="#1D9E75" strokeWidth="0.4" strokeDasharray="1.5 1" markerEnd="url(#a4)"/>
              {/* Oracle → Expedição */}
              <path d="M18 24 L15 24 L15 25" fill="none" stroke="#F97316" strokeWidth="0.4" strokeDasharray="1.5 1" markerEnd="url(#a3)"/>
              {/* Triagem Funcional → Reparo */}
              <path d="M18 60 L8 60 L8 72" fill="none" stroke="#E24B4A" strokeWidth="0.3" strokeDasharray="1 1"/>
            </svg>

            {/* Label fluxo */}
            <div style={{ position:"absolute", bottom:"1%", left:"1%",
              fontSize: 7, color:"#AAA", lineHeight: 1.4 }}>
              Fluxo: Recebimento → T.Funcional → T.Cosmética → Laudo → Alocação → Oracle → Expedição
            </div>
          </div>
        </div>
      </div>

      {/* Painel de informações */}
      <div className="bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-3 w-3 rounded-full shrink-0" style={{ background: s.cor }} />
          <h3 className="font-bold text-slate-800 text-sm">{s.name}</h3>
          {s.horas && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-lg"
              style={{ background: cls.bg, color: cls.color }}>
              {fmtTempo(s.horas)} tempo médio
            </span>
          )}
          {s.horas && s.sla && (
            <span className="text-xs font-semibold"
              style={{ color: s.horas <= s.sla ? "#27500A" : "#791F1F" }}>
              {s.horas <= s.sla ? "✓ Dentro do SLA" : "✗ Fora do SLA"}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 leading-relaxed">{s.desc}</p>
        <div className="flex gap-6 mt-3">
          <div>
            <div className="text-lg font-black text-slate-800">{fmtTempo(s.horas)}</div>
            <div className="text-xs text-slate-400">Tempo médio até próx. etapa</div>
          </div>
          {s.sla && (
            <div>
              <div className="text-lg font-black text-slate-800">{s.sla}h</div>
              <div className="text-xs text-slate-400">Meta SLA contratual</div>
            </div>
          )}
        </div>
      </div>

      {/* Aviso dados mockados */}
      <div className="bg-blue-50 ring-1 ring-blue-200 rounded-2xl p-4 flex items-start gap-3">
        <div className="text-blue-600 shrink-0 mt-0.5">ℹ</div>
        <p className="text-xs text-blue-700">
          Os tempos exibidos são provisórios. Em breve serão conectados ao banco de dados real via <code className="bg-blue-100 px-1 rounded">assurant_sla_tempo_etapas</code>.
        </p>
      </div>
    </div>
  );
}