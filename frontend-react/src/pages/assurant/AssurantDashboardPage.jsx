import { useState, useEffect } from "react";
import {
  Package, Clock, AlertTriangle, CheckCircle,
  FileText, Layers, ChevronDown
} from "lucide-react";
import { supabase } from "../../lib/supabase";

// ── Helpers ──────────────────────────────────────────────
function fmtN(v) { return (v || 0).toLocaleString("pt-BR"); }
function fmtPct(v, total) {
  if (!total) return "0,0%";
  return ((v / total) * 100).toFixed(1).replace(".", ",") + "%";
}

// Normaliza triagem funcional
function normalizaFuncional(val) {
  if (!val) return "Sem triagem";
  const v = val.trim().toUpperCase();
  if (["BOM", "BOA", "BOM "].includes(v)) return "Bom";
  if (["EXCELENTE", "LIKE NEW"].includes(v)) return "Excelente/Like New";
  if (["TRINCADO", "TELA TRINCADA"].includes(v)) return "Trincado";
  if (["MUITO BOM"].includes(v)) return "Muito Bom";
  if (["MEDIA", "REGULAR"].includes(v)) return "Regular";
  if (v.includes("NÃO LIGA") || v.includes("BLOQUEADO")) return "Não liga/Bloqueado";
  if (v.includes("DEVOLUÇÃO PROCEDENTE")) return "Dev. Procedente";
  if (v.includes("DEVOLUÇÃO IMPROCEDENTE")) return "Dev. Improcedente";
  if (["RECUSADO", "GENERICO", "ONLINE", "#N/D"].includes(v)) return "Outros";
  return val.trim();
}

// Canal
function normalizaCanal(val) {
  if (!val) return "N/A";
  const v = val.trim();
  if (v === "Loja Vivo" || v === "Loja Samsung") return "YBV (Lojas)";
  if (v === "DEV") return "Devolução";
  return v;
}

// ── Componentes ──────────────────────────────────────────
function TabBtn({ label, icon: Icon, active, onClick, badge }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${
        active
          ? "bg-purple-600 text-white shadow-md"
          : "text-slate-500 hover:bg-slate-100"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
      {badge != null && (
        <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
          active ? "bg-white/20 text-white" : "bg-purple-100 text-purple-700"
        }`}>
          {fmtN(badge)}
        </span>
      )}
    </button>
  );
}

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, icon: Icon, color = "text-purple-600" }) {
  return (
    <h3 className={`font-black text-slate-800 flex items-center gap-2 mb-4 ${color}`}>
      <Icon className="h-4 w-4" />
      {children}
    </h3>
  );
}

function StatRow({ label, value, total, color = "bg-purple-400", pct }) {
  const p = pct ?? (total > 0 ? (value / total) * 100 : 0);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-slate-600">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{fmtPct(value, total)}</span>
          <span className="font-bold text-slate-800">{fmtN(value)}</span>
        </div>
      </div>
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(p, 100)}%` }} />
      </div>
    </div>
  );
}

function KpiMini({ label, value, sub, color = "bg-purple-50 ring-purple-200 text-purple-700" }) {
  return (
    <div className={`rounded-xl p-4 ring-1 ${color}`}>
      <div className="text-2xl font-black">{value}</div>
      <div className="text-xs font-semibold mt-0.5 opacity-80">{label}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function Loader() {
  return (
    <div className="flex items-center justify-center h-48">
      <div className="h-8 w-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
    </div>
  );
}

// ── Seletor de mês ────────────────────────────────────────
function MesSelector({ meses, mesSel, onChange }) {
  return (
    <div className="relative">
      <select
        value={mesSel}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-white border border-slate-200 rounded-xl px-4 py-2 pr-8 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-400 cursor-pointer"
      >
        {meses.map(m => (
          <option key={m} value={m}>{m}</option>
        ))}
      </select>
      <ChevronDown className="absolute right-2 top-2.5 h-4 w-4 text-slate-400 pointer-events-none" />
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 1 — RECEBIMENTO
// ══════════════════════════════════════════════════════════
function TabRecebimento({ mes }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase
        .from("assurant_triagem")
        .select("tipo_de_rede, condicao, modelo, status_atual, data_recebimento, criado_em")
        .eq("mes_referencia", mes);

      if (!rows) { setLoading(false); return; }

      // Por canal
      const canais = {};
      const condicoes = {};
      const modelos = {};
      const statusMap = {};
      let totalRecebidos = 0;
      let recebidosDia = 0; // com data_recebimento preenchida
      let semData = 0;

      rows.forEach(r => {
        totalRecebidos++;

        // Canal
        const canal = normalizaCanal(r.tipo_de_rede);
        canais[canal] = (canais[canal] || 0) + 1;

        // Condição
        const cond = r.condicao || "Não informado";
        condicoes[cond] = (condicoes[cond] || 0) + 1;

        // Modelo
        const mod = r.modelo || "Não informado";
        modelos[mod] = (modelos[mod] || 0) + 1;

        // Status
        const st = r.status_atual || "Não informado";
        statusMap[st] = (statusMap[st] || 0) + 1;

        // SLA recebimento
        if (r.data_recebimento) recebidosDia++;
        else semData++;
      });

      const topModelos = Object.entries(modelos)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      const topStatus = Object.entries(statusMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      setData({ canais, condicoes, topModelos, topStatus, totalRecebidos, recebidosDia, semData });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data) return <p className="text-slate-400 text-sm">Sem dados para este mês.</p>;

  const { canais, condicoes, topModelos, topStatus, totalRecebidos, recebidosDia, semData } = data;
  const canaisArr = Object.entries(canais).sort((a, b) => b[1] - a[1]);
  const condicoesArr = Object.entries(condicoes).sort((a, b) => b[1] - a[1]);

  const CANAL_COLORS = {
    "YBV (Lojas)": "bg-purple-500",
    "Online":      "bg-blue-400",
    "GRV":         "bg-emerald-500",
    "Devolução":   "bg-orange-400",
    "N/A":         "bg-slate-300",
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total Recebido"    value={fmtN(totalRecebidos)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Data Receb."  value={fmtN(recebidosDia)}
          sub={fmtPct(recebidosDia, totalRecebidos)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Data Receb."  value={fmtN(semData)}
          sub={fmtPct(semData, totalRecebidos)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Canais Ativos"    value={canaisArr.length}
          color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Por canal */}
        <Card>
          <SectionTitle icon={Package}>Volume por Canal</SectionTitle>
          <div className="space-y-3">
            {canaisArr.map(([canal, qtd]) => (
              <StatRow key={canal} label={canal} value={qtd} total={totalRecebidos}
                color={CANAL_COLORS[canal] || "bg-slate-400"} />
            ))}
          </div>
        </Card>

        {/* Por condição */}
        <Card>
          <SectionTitle icon={Layers}>Por Condição</SectionTitle>
          <div className="space-y-3">
            {condicoesArr.slice(0, 8).map(([cond, qtd]) => (
              <StatRow key={cond} label={cond} value={qtd} total={totalRecebidos}
                color="bg-blue-400" />
            ))}
          </div>
        </Card>

        {/* Top modelos */}
        <Card>
          <SectionTitle icon={Package}>Top Modelos Recebidos</SectionTitle>
          <div className="space-y-3">
            {topModelos.map(([mod, qtd]) => (
              <StatRow key={mod} label={mod} value={qtd} total={totalRecebidos}
                color="bg-emerald-400" />
            ))}
          </div>
        </Card>

        {/* Status atual */}
        <Card>
          <SectionTitle icon={Clock}>Status Atual</SectionTitle>
          <div className="space-y-3">
            {topStatus.map(([st, qtd]) => (
              <StatRow key={st} label={st} value={qtd} total={totalRecebidos}
                color="bg-purple-400" />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 2 — TRIAGEM FUNCIONAL
// ══════════════════════════════════════════════════════════
function TabTriagemFuncional({ mes }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase
        .from("assurant_triagem")
        .select("triagem_funcional, grade, resultado_triagem_funcional, data_funcional, status_bateria")
        .eq("mes_referencia", mes);

      if (!rows) { setLoading(false); return; }

      const funcionais = {};
      const grades = {};
      const resultados = {};
      const baterias = {};
      let total = 0;
      let semTriagem = 0;
      let comTriagem = 0;

      rows.forEach(r => {
        total++;
        const func = normalizaFuncional(r.triagem_funcional);
        funcionais[func] = (funcionais[func] || 0) + 1;

        if (!r.triagem_funcional) semTriagem++;
        else comTriagem++;

        const grade = r.grade || "Não informado";
        grades[grade] = (grades[grade] || 0) + 1;

        const res = r.resultado_triagem_funcional || "Não informado";
        resultados[res] = (resultados[res] || 0) + 1;

        if (r.status_bateria) {
          baterias[r.status_bateria] = (baterias[r.status_bateria] || 0) + 1;
        }
      });

      setData({ funcionais, grades, resultados, baterias, total, semTriagem, comTriagem });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data) return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { funcionais, grades, resultados, baterias, total, semTriagem, comTriagem } = data;
  const funcionaisArr = Object.entries(funcionais).sort((a, b) => b[1] - a[1]);
  const gradesArr     = Object.entries(grades).sort((a, b) => b[1] - a[1]);
  const resultadosArr = Object.entries(resultados).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const bateriasArr   = Object.entries(baterias).sort((a, b) => b[1] - a[1]);

  const GRADE_COLORS = {
    "EXCELENTE":    "bg-emerald-500",
    "MUITO BOM":    "bg-emerald-400",
    "BOM":          "bg-blue-400",
    "REGULAR":      "bg-yellow-400",
    "QUEBRADO":     "bg-red-400",
    "LIKE NEW":     "bg-teal-400",
    "Não informado":"bg-slate-300",
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Total"          value={fmtN(total)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Triagem"    value={fmtN(comTriagem)}
          sub={fmtPct(comTriagem, total)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Triagem"    value={fmtN(semTriagem)}
          sub={fmtPct(semTriagem, total)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Resultados"     value={Object.keys(resultados).length}
          color="bg-blue-50 ring-blue-200 text-blue-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Resultado funcional */}
        <Card>
          <SectionTitle icon={CheckCircle}>Resultado Funcional</SectionTitle>
          <div className="space-y-3">
            {funcionaisArr.map(([func, qtd]) => (
              <StatRow key={func} label={func} value={qtd} total={total}
                color={func === "Bom" || func === "Excelente/Like New" || func === "Muito Bom"
                  ? "bg-emerald-400" : func === "Trincado" || func === "Não liga/Bloqueado"
                  ? "bg-red-400" : "bg-slate-400"} />
            ))}
          </div>
        </Card>

        {/* Grade */}
        <Card>
          <SectionTitle icon={Layers}>Distribuição por Grade</SectionTitle>
          <div className="space-y-3">
            {gradesArr.map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={total}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>

        {/* Resultado triagem */}
        <Card>
          <SectionTitle icon={CheckCircle}>Resultado da Triagem</SectionTitle>
          <div className="space-y-3">
            {resultadosArr.map(([res, qtd]) => (
              <StatRow key={res} label={res} value={qtd} total={total}
                color="bg-blue-400" />
            ))}
          </div>
        </Card>

        {/* Bateria */}
        {bateriasArr.length > 0 && (
          <Card>
            <SectionTitle icon={Layers}>Status da Bateria</SectionTitle>
            <div className="space-y-3">
              {bateriasArr.map(([bat, qtd]) => (
                <StatRow key={bat} label={bat} value={qtd} total={total}
                  color="bg-purple-400" />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 3 — TRIAGEM ESTÉTICA
// ══════════════════════════════════════════════════════════
function TabTriagemEstetica({ mes }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase
        .from("assurant_triagem")
        .select("tela, laterais, traseira, defeitos_adicionais, grade, data_cosmetico")
        .eq("mes_referencia", mes);

      if (!rows) { setLoading(false); return; }

      const telas = {};
      const lateraisMap = {};
      const traseirasMap = {};
      const defeitosMap = {};
      const gradesMap = {};
      let total = 0;
      let comEstetica = 0;
      let semEstetica = 0;

      rows.forEach(r => {
        total++;
        if (r.data_cosmetico) comEstetica++; else semEstetica++;

        const tela = r.tela || "Não informado";
        telas[tela] = (telas[tela] || 0) + 1;

        const lat = r.laterais || "Não informado";
        lateraisMap[lat] = (lateraisMap[lat] || 0) + 1;

        const tras = r.traseira || "Não informado";
        traseirasMap[tras] = (traseirasMap[tras] || 0) + 1;

        const grade = r.grade || "Não informado";
        gradesMap[grade] = (gradesMap[grade] || 0) + 1;

        if (r.defeitos_adicionais && r.defeitos_adicionais.trim() !== "") {
          const def = r.defeitos_adicionais.trim();
          defeitosMap[def] = (defeitosMap[def] || 0) + 1;
        }
      });

      setData({ telas, lateraisMap, traseirasMap, defeitosMap, gradesMap, total, comEstetica, semEstetica });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data) return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { telas, lateraisMap, traseirasMap, defeitosMap, gradesMap, total, comEstetica, semEstetica } = data;

  const GRADE_COLORS = {
    "EXCELENTE": "bg-emerald-500", "MUITO BOM": "bg-emerald-400",
    "BOM": "bg-blue-400", "REGULAR": "bg-yellow-400",
    "QUEBRADO": "bg-red-400", "LIKE NEW": "bg-teal-400",
    "Não informado": "bg-slate-300",
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <KpiMini label="Total"           value={fmtN(total)}
          color="bg-purple-50 ring-purple-200 text-purple-700" />
        <KpiMini label="Com Estética"    value={fmtN(comEstetica)}
          sub={fmtPct(comEstetica, total)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Estética"    value={fmtN(semEstetica)}
          sub={fmtPct(semEstetica, total)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Tela */}
        <Card>
          <SectionTitle icon={Layers}>Estado da Tela</SectionTitle>
          <div className="space-y-3">
            {Object.entries(telas).sort((a,b) => b[1]-a[1]).map(([v, qtd]) => (
              <StatRow key={v} label={v} value={qtd} total={total}
                color={v === "QUEBRADO" ? "bg-red-400" : v === "LIKE NEW" || v === "EXCELENTE" ? "bg-emerald-400" : "bg-blue-400"} />
            ))}
          </div>
        </Card>

        {/* Laterais */}
        <Card>
          <SectionTitle icon={Layers}>Estado das Laterais</SectionTitle>
          <div className="space-y-3">
            {Object.entries(lateraisMap).sort((a,b) => b[1]-a[1]).map(([v, qtd]) => (
              <StatRow key={v} label={v} value={qtd} total={total}
                color={v === "QUEBRADO" ? "bg-red-400" : v === "LIKE NEW" || v === "EXCELENTE" ? "bg-emerald-400" : "bg-blue-400"} />
            ))}
          </div>
        </Card>

        {/* Traseira */}
        <Card>
          <SectionTitle icon={Layers}>Estado da Traseira</SectionTitle>
          <div className="space-y-3">
            {Object.entries(traseirasMap).sort((a,b) => b[1]-a[1]).map(([v, qtd]) => (
              <StatRow key={v} label={v} value={qtd} total={total}
                color={v === "QUEBRADO" ? "bg-red-400" : v === "LIKE NEW" || v === "EXCELENTE" ? "bg-emerald-400" : "bg-blue-400"} />
            ))}
          </div>
        </Card>

        {/* Grade estética */}
        <Card>
          <SectionTitle icon={CheckCircle}>Grade Estética Geral</SectionTitle>
          <div className="space-y-3">
            {Object.entries(gradesMap).sort((a,b) => b[1]-a[1]).map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={total}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>

        {/* Defeitos adicionais */}
        {Object.keys(defeitosMap).length > 0 && (
          <Card className="lg:col-span-2">
            <SectionTitle icon={AlertTriangle}>Defeitos Adicionais</SectionTitle>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {Object.entries(defeitosMap).sort((a,b) => b[1]-a[1]).slice(0, 10).map(([def, qtd]) => (
                <StatRow key={def} label={def} value={qtd} total={total}
                  color="bg-orange-400" />
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ABA 4 — LAUDOS
// ══════════════════════════════════════════════════════════
function TabLaudos({ mes }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const { data: rows } = await supabase
        .from("assurant_triagem")
        .select("data_laudo, data_alocacao, data_oracle, reanalise, status_atual, grade, modelo")
        .eq("mes_referencia", mes);

      if (!rows) { setLoading(false); return; }

      let total = 0;
      let comLaudo = 0;
      let semLaudo = 0;
      let comReanalise = 0;
      let comAlocacao = 0;
      let comOracle = 0;
      let aguardandoLaudo = 0;
      const gradesLaudo = {};
      const modelosLaudo = {};

      rows.forEach(r => {
        total++;
        if (r.data_laudo) comLaudo++; else semLaudo++;
        if (r.reanalise === "Sim") comReanalise++;
        if (r.data_alocacao) comAlocacao++;
        if (r.data_oracle) comOracle++;

        if (r.status_atual?.toLowerCase().includes("laudo")) aguardandoLaudo++;

        if (r.data_laudo) {
          const grade = r.grade || "Não informado";
          gradesLaudo[grade] = (gradesLaudo[grade] || 0) + 1;

          const mod = r.modelo || "Não informado";
          modelosLaudo[mod] = (modelosLaudo[mod] || 0) + 1;
        }
      });

      const topModelosLaudo = Object.entries(modelosLaudo)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

      setData({ total, comLaudo, semLaudo, comReanalise, comAlocacao, comOracle,
                aguardandoLaudo, gradesLaudo, topModelosLaudo });
      setLoading(false);
    }
    load();
  }, [mes]);

  if (loading) return <Loader />;
  if (!data) return <p className="text-slate-400 text-sm">Sem dados.</p>;

  const { total, comLaudo, semLaudo, comReanalise, comAlocacao,
          comOracle, aguardandoLaudo, gradesLaudo, topModelosLaudo } = data;

  const GRADE_COLORS = {
    "EXCELENTE": "bg-emerald-500", "MUITO BOM": "bg-emerald-400",
    "BOM": "bg-blue-400", "REGULAR": "bg-yellow-400",
    "QUEBRADO": "bg-red-400", "LIKE NEW": "bg-teal-400",
    "Não informado": "bg-slate-300",
  };

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiMini label="Com Laudo"         value={fmtN(comLaudo)}
          sub={fmtPct(comLaudo, total)}
          color="bg-emerald-50 ring-emerald-200 text-emerald-700" />
        <KpiMini label="Sem Laudo"         value={fmtN(semLaudo)}
          sub={fmtPct(semLaudo, total)}
          color="bg-orange-50 ring-orange-200 text-orange-700" />
        <KpiMini label="Aguard. Laudo"     value={fmtN(aguardandoLaudo)}
          sub="em status atual"
          color="bg-yellow-50 ring-yellow-200 text-yellow-700" />
        <KpiMini label="Com Reanálise"     value={fmtN(comReanalise)}
          sub={fmtPct(comReanalise, total)}
          color="bg-red-50 ring-red-200 text-red-700" />
      </div>

      {/* Pipeline de etapas */}
      <Card>
        <SectionTitle icon={FileText}>Pipeline de Etapas Pós-Laudo</SectionTitle>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiMini label="Com Laudo"    value={fmtN(comLaudo)}
            sub={fmtPct(comLaudo, total)}
            color="bg-purple-50 ring-purple-200 text-purple-700" />
          <KpiMini label="Com Alocação" value={fmtN(comAlocacao)}
            sub={fmtPct(comAlocacao, total)}
            color="bg-blue-50 ring-blue-200 text-blue-700" />
          <KpiMini label="Com Oracle"   value={fmtN(comOracle)}
            sub={fmtPct(comOracle, total)}
            color="bg-teal-50 ring-teal-200 text-teal-700" />
          <KpiMini label="Reanálise"    value={fmtN(comReanalise)}
            sub={fmtPct(comReanalise, total)}
            color="bg-red-50 ring-red-200 text-red-700" />
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Grade dos laudados */}
        <Card>
          <SectionTitle icon={Layers}>Grade dos Aparelhos com Laudo</SectionTitle>
          <div className="space-y-3">
            {Object.entries(gradesLaudo).sort((a,b) => b[1]-a[1]).map(([grade, qtd]) => (
              <StatRow key={grade} label={grade} value={qtd} total={comLaudo}
                color={GRADE_COLORS[grade] || "bg-slate-300"} />
            ))}
          </div>
        </Card>

        {/* Top modelos laudados */}
        <Card>
          <SectionTitle icon={Package}>Top Modelos com Laudo</SectionTitle>
          <div className="space-y-3">
            {topModelosLaudo.map(([mod, qtd]) => (
              <StatRow key={mod} label={mod} value={qtd} total={comLaudo}
                color="bg-purple-400" />
            ))}
          </div>
        </Card>
      </div>

      {/* Alerta */}
      {semLaudo > 0 && (
        <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-orange-800">
              {fmtN(semLaudo)} aparelhos ainda sem laudo ({fmtPct(semLaudo, total)})
            </p>
            <p className="text-xs text-orange-600 mt-0.5">
              Desses, {fmtN(aguardandoLaudo)} estão com status "Aguardando laudo" no sistema.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════
export default function AssurantDashboardPage() {
  const [aba, setAba]       = useState("recebimento");
  const [meses, setMeses]   = useState([]);
  const [mesSel, setMesSel] = useState("");
  const [totais, setTotais] = useState(null);

  // Carregar meses disponíveis
  useEffect(() => {
    async function loadMeses() {
      const { data } = await supabase
        .from("assurant_triagem")
        .select("mes_referencia")
        .order("mes_referencia", { ascending: false });

      if (data) {
        const unique = [...new Set(data.map(r => r.mes_referencia))].filter(Boolean);
        setMeses(unique);
        if (unique.length > 0) setMesSel(unique[0]);
      }
    }
    loadMeses();
  }, []);

  // Carregar totais gerais do mês selecionado
  useEffect(() => {
    if (!mesSel) return;
    async function loadTotais() {
      const { count: total }       = await supabase.from("assurant_triagem").select("*", { count: "exact", head: true }).eq("mes_referencia", mesSel);
      const { count: comLaudo }    = await supabase.from("assurant_triagem").select("*", { count: "exact", head: true }).eq("mes_referencia", mesSel).not("data_laudo", "is", null);
      const { count: finalizados } = await supabase.from("assurant_triagem").select("*", { count: "exact", head: true }).eq("mes_referencia", mesSel).eq("status_atual", "Finalizado");
      setTotais({ total, comLaudo, finalizados });
    }
    loadTotais();
  }, [mesSel]);

  const ABAS = [
    { key: "recebimento", label: "Recebimento",       icon: Package,      badge: totais?.total },
    { key: "funcional",   label: "Triagem Funcional", icon: CheckCircle,  badge: null },
    { key: "estetica",    label: "Triagem Estética",  icon: Layers,       badge: null },
    { key: "laudos",      label: "Laudos",            icon: FileText,     badge: totais?.comLaudo },
  ];

  return (
    <div className="space-y-5">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📦</span>
          <div>
            <h2 className="text-lg font-black text-slate-800">Operação Assurant</h2>
            <p className="text-xs text-slate-500">Warehouse · dados reais do Supabase</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {meses.length > 0 && (
            <MesSelector meses={meses} mesSel={mesSel} onChange={setMesSel} />
          )}
          {totais && (
            <span className="text-xs font-semibold text-purple-600 bg-purple-50 ring-1 ring-purple-200 px-3 py-1.5 rounded-xl">
              {fmtN(totais.total)} registros · {fmtN(totais.finalizados)} finalizados
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => (
          <TabBtn
            key={a.key}
            label={a.label}
            icon={a.icon}
            active={aba === a.key}
            onClick={() => setAba(a.key)}
            badge={a.badge}
          />
        ))}
      </div>

      {/* Conteúdo da aba */}
      {mesSel && (
        <>
          {aba === "recebimento" && <TabRecebimento mes={mesSel} />}
          {aba === "funcional"   && <TabTriagemFuncional mes={mesSel} />}
          {aba === "estetica"    && <TabTriagemEstetica mes={mesSel} />}
          {aba === "laudos"      && <TabLaudos mes={mesSel} />}
        </>
      )}

      {/* Alerta reparo */}
      <div className="bg-orange-50 ring-1 ring-orange-200 rounded-2xl p-4 flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-orange-500 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">
            Operação de Reparo sem contrato formal
          </p>
          <p className="text-xs text-orange-600 mt-0.5">
            Cláusula 6.2 do Apêndice A exclui reparo do contrato atual.
            Incluir no próximo aditivo com precificação própria.
          </p>
        </div>
      </div>

    </div>
  );
}