// src/pages/TrocasB2CAssurantPage.jsx
import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, CheckCircle, AlertTriangle, ArrowRight, Loader, MapPin,
  FilePlus, ListChecks, Search, Truck, Clock, Package, ChevronDown, ChevronUp,
} from "lucide-react";
import { criarTroca, buscarDescricaoPorSku, listarTrocas } from "../services/trocasB2CService.js";
import { useAuth } from "../AuthContext.jsx";

function Card({ children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl p-5 ring-1 ring-slate-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white";
const labelCls = "block text-xs font-bold text-slate-600 mb-1";

const GRADES = ["BOM", "MUITO BOM", "EXCELENTE", "LIKE NEW", "REGULAR", "QUEBRADO"];

function fmtData(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-BR");
}

// ── Campo SKU com autocomplete + grade + observação ───────
function SkuField({ idx, s, onChange, onRemove, showRemove }) {
  const [buscando, setBuscando] = useState(false);
  const debounceRef             = useRef(null);

  function handleSkuChange(valor) {
    onChange(idx, "sku", valor);
    onChange(idx, "descricao", "");
    clearTimeout(debounceRef.current);
    if (valor.trim().length >= 4) {
      setBuscando(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const desc = await buscarDescricaoPorSku(valor.trim());
          if (desc) onChange(idx, "descricao", desc);
        } catch (_) {}
        finally { setBuscando(false); }
      }, 600);
    } else {
      setBuscando(false);
    }
  }

  return (
    <div className="flex gap-2 items-start">
      <div className="h-7 w-7 rounded-xl bg-purple-100 text-purple-700 text-xs font-black flex items-center justify-center shrink-0 mt-3">
        {idx + 1}
      </div>
      <div className="flex-1 grid grid-cols-1 gap-2 bg-slate-50 rounded-2xl p-3 ring-1 ring-slate-100">
        <div className="relative">
          <input
            value={s.sku}
            onChange={e => handleSkuChange(e.target.value)}
            className={inputCls}
            placeholder="SKU (ex: BRZDEV11894)"
          />
          {buscando && (
            <div className="absolute right-3 top-3.5">
              <Loader className="h-4 w-4 text-purple-500 animate-spin" />
            </div>
          )}
        </div>
        <div className="relative">
          <input
            value={s.descricao}
            onChange={e => onChange(idx, "descricao", e.target.value)}
            className={`${inputCls} ${s.descricao && !buscando ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}
            placeholder="Descrição (carregada automaticamente pelo SKU)"
          />
          {s.descricao && !buscando && (
            <div className="absolute right-3 top-3.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
          )}
        </div>
        {s.sku.trim().length >= 4 && !buscando && !s.descricao && (
          <p className="text-xs text-amber-600 font-semibold flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            SKU não encontrado na base — verifique ou preencha a descrição manualmente.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Grade desejada</label>
            <select
              value={s.grade || ""}
              onChange={e => onChange(idx, "grade", e.target.value)}
              className={inputCls}
            >
              <option value="">Qualquer grade</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">Observação</label>
            <input
              value={s.observacao || ""}
              onChange={e => onChange(idx, "observacao", e.target.value)}
              className={inputCls}
              placeholder="Ex: enviar excelente; senão avisar"
            />
          </div>
        </div>
      </div>
      {showRemove && (
        <button type="button" onClick={() => onRemove(idx)}
          className="mt-3 text-slate-400 hover:text-red-500 transition shrink-0">
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// ── Campos de endereço com ViaCEP ─────────────────────────
function EnderecoFields({ endereco, onChange }) {
  const [buscandoCep, setBuscandoCep] = useState(false);
  const [erroCep, setErroCep]         = useState("");
  const debounceRef                   = useRef(null);

  function handleCepChange(valor) {
    const cep = valor.replace(/\D/g, "").slice(0, 8);
    onChange("endereco_cep", cep);
    setErroCep("");

    clearTimeout(debounceRef.current);
    if (cep.length === 8) {
      setBuscandoCep(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
          const data = await res.json();
          if (data.erro) {
            setErroCep("CEP não encontrado.");
          } else {
            onChange("endereco_rua",    data.logradouro || "");
            onChange("endereco_bairro", data.bairro     || "");
            onChange("endereco_cidade", data.localidade || "");
            onChange("endereco_estado", data.uf         || "");
          }
        } catch (_) {
          setErroCep("Erro ao buscar CEP.");
        } finally {
          setBuscandoCep(false);
        }
      }, 500);
    }
  }

  const cepFormatado = endereco.endereco_cep
    ? endereco.endereco_cep.replace(/(\d{5})(\d{1,3})/, "$1-$2")
    : "";

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>CEP</label>
        <div className="relative">
          <input
            value={cepFormatado}
            onChange={e => handleCepChange(e.target.value)}
            className={inputCls}
            placeholder="00000-000"
            maxLength={9}
          />
          {buscandoCep && (
            <div className="absolute right-3 top-3.5">
              <Loader className="h-4 w-4 text-purple-500 animate-spin" />
            </div>
          )}
          {!buscandoCep && endereco.endereco_rua && (
            <div className="absolute right-3 top-3.5">
              <CheckCircle className="h-4 w-4 text-emerald-500" />
            </div>
          )}
        </div>
        {erroCep && (
          <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" /> {erroCep}
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={labelCls}>Rua / Logradouro</label>
          <input
            value={endereco.endereco_rua}
            onChange={e => onChange("endereco_rua", e.target.value)}
            className={`${inputCls} ${endereco.endereco_rua ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}
            placeholder="Rua, Avenida..."
          />
        </div>
        <div>
          <label className={labelCls}>Número</label>
          <input
            value={endereco.endereco_numero}
            onChange={e => onChange("endereco_numero", e.target.value)}
            className={inputCls}
            placeholder="Ex: 123"
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Complemento</label>
        <input
          value={endereco.endereco_complemento}
          onChange={e => onChange("endereco_complemento", e.target.value)}
          className={inputCls}
          placeholder="Apto, Bloco, Casa... (opcional)"
        />
      </div>

      <div>
        <label className={labelCls}>Bairro</label>
        <input
          value={endereco.endereco_bairro}
          onChange={e => onChange("endereco_bairro", e.target.value)}
          className={`${inputCls} ${endereco.endereco_bairro ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}
          placeholder="Bairro"
        />
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="col-span-2">
          <label className={labelCls}>Cidade</label>
          <input
            value={endereco.endereco_cidade}
            onChange={e => onChange("endereco_cidade", e.target.value)}
            className={`${inputCls} ${endereco.endereco_cidade ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}
            placeholder="Cidade"
          />
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <input
            value={endereco.endereco_estado}
            onChange={e => onChange("endereco_estado", e.target.value)}
            className={`${inputCls} ${endereco.endereco_estado ? "border-emerald-200 bg-emerald-50 text-emerald-800" : ""}`}
            placeholder="UF"
            maxLength={2}
          />
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// FORMULÁRIO — Nova Solicitação
// ══════════════════════════════════════════════════════════
function FormNovaSolicitacao() {
  const { user } = useAuth();

  const [form, setForm] = useState({
    id_anymarket:          "",
    nome_cliente:          "",
    cpf:                   "",
    produto_nome:          "",
    produto_condicao:      "Usado",  // fixo — todos entram como Usado
    produto_grade:         "",
    endereco_cep:          "",
    endereco_rua:          "",
    endereco_numero:       "",
    endereco_complemento:  "",
    endereco_bairro:       "",
    endereco_cidade:       "",
    endereco_estado:       "",
  });

  const [skus, setSkus]         = useState([{ sku: "", descricao: "", grade: "", observacao: "" }]);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [sucesso, setSucesso]   = useState(false);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addSku() { setSkus(prev => [...prev, { sku: "", descricao: "", grade: "", observacao: "" }]); }
  function removeSku(idx) { setSkus(prev => prev.filter((_, i) => i !== idx)); }
  function setSku(idx, field, value) {
    setSkus(prev => prev.map((s, i) => i === idx ? { ...s, [field]: value } : s));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFeedback(null);

    if (!form.id_anymarket.trim())  return setFeedback("Informe o ID AnyMarket.");
    if (!form.nome_cliente.trim())  return setFeedback("Informe o nome do cliente.");
    if (!form.produto_nome.trim())  return setFeedback("Informe o nome do produto comprado.");
    if (!form.produto_grade)        return setFeedback("Selecione o grade do produto.");
    if (skus.every(s => !s.sku.trim())) return setFeedback("Informe ao menos um SKU aceito.");

    const skusValidos     = skus.filter(s => s.sku.trim());
    const produtoOriginal = `${form.produto_condicao}: ${form.produto_nome.trim()} - ${form.produto_grade}`;

    const enderecoCompleto = [
      form.endereco_rua,
      form.endereco_numero,
      form.endereco_complemento,
      form.endereco_bairro,
      form.endereco_cidade,
      form.endereco_estado,
      form.endereco_cep,
    ].filter(Boolean).join(", ");

    setSalvando(true);
    try {
      await criarTroca(
        {
          ...form,
          produto_original: produtoOriginal,
          endereco:         enderecoCompleto,
        },
        skusValidos,
        user.id
      );
      setSucesso(true);
      setForm({
        id_anymarket: "", nome_cliente: "", cpf: "",
        produto_nome: "", produto_condicao: "Usado", produto_grade: "",
        endereco_cep: "", endereco_rua: "", endereco_numero: "",
        endereco_complemento: "", endereco_bairro: "", endereco_cidade: "", endereco_estado: "",
      });
      setSkus([{ sku: "", descricao: "", grade: "", observacao: "" }]);
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setSalvando(false);
    }
  }

  const previewProduto = [
    form.produto_condicao,
    form.produto_nome.trim(),
    form.produto_grade,
  ].filter(Boolean).join(" · ");

  if (sucesso) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Solicitação registrada!</h2>
          <p className="text-sm text-slate-500 mb-6">A equipe Furbtech já pode visualizar e processar a troca.</p>
          <button onClick={() => setSucesso(false)}
            className="bg-[#7F2D92] text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-[#5B1E74] transition">
            Nova solicitação
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl mx-auto">
      {/* Dados do pedido */}
      <Card>
        <h3 className="font-black text-slate-700 text-sm mb-4">📋 Dados do Pedido</h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>ID AnyMarket *</label>
            <input value={form.id_anymarket} onChange={e => setField("id_anymarket", e.target.value)}
              className={inputCls} placeholder="Ex: 232991879" />
          </div>

          <div>
            <label className={labelCls}>Produto Comprado Originalmente *</label>
            {/* ── Botões Usado/Novo removidos — todos entram como Usado ── */}
            <input
              value={form.produto_nome}
              onChange={e => setField("produto_nome", e.target.value)}
              className={`${inputCls} mb-2`}
              placeholder="Ex: Samsung Galaxy S23 256GB Preto"
            />
            <select
              value={form.produto_grade}
              onChange={e => setField("produto_grade", e.target.value)}
              className={inputCls}
            >
              <option value="">Selecione o grade...</option>
              {GRADES.map(g => <option key={g} value={g}>{g}</option>)}
            </select>
            {previewProduto && (
              <div className="mt-2 bg-purple-50 ring-1 ring-purple-200 rounded-xl px-4 py-2.5 text-xs text-purple-700 font-semibold">
                📦 {previewProduto}
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Dados do cliente */}
      <Card>
        <h3 className="font-black text-slate-700 text-sm mb-4">👤 Dados do Cliente</h3>
        <div className="space-y-3">
          <div>
            <label className={labelCls}>Nome *</label>
            <input value={form.nome_cliente} onChange={e => setField("nome_cliente", e.target.value)}
              className={inputCls} placeholder="Nome completo" />
          </div>
          <div>
            <label className={labelCls}>CPF</label>
            <input value={form.cpf} onChange={e => setField("cpf", e.target.value)}
              className={inputCls} placeholder="000.000.000-00" />
          </div>
        </div>
      </Card>

      {/* Endereço de entrega */}
      <Card>
        <h3 className="font-black text-slate-700 text-sm mb-4 flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[#7F2D92]" /> Endereço de Entrega
        </h3>
        <div className="bg-blue-50 ring-1 ring-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-700 font-semibold">
          ℹ Digite o CEP para preencher automaticamente o endereço.
        </div>
        <EnderecoFields endereco={form} onChange={setField} />
      </Card>

      {/* SKUs aceitos */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-black text-slate-700 text-sm">📦 SKUs Aceitos para Substituição</h3>
          <span className="text-xs text-slate-400">em ordem de preferência</span>
        </div>
        <div className="bg-blue-50 ring-1 ring-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-700 font-semibold">
          ℹ A descrição é carregada pelo SKU. Defina a grade desejada e observações de cada opção.
        </div>
        <div className="space-y-4">
          {skus.map((s, idx) => (
            <SkuField
              key={idx}
              idx={idx}
              s={s}
              onChange={setSku}
              onRemove={removeSku}
              showRemove={skus.length > 1}
            />
          ))}
        </div>
        <button type="button" onClick={addSku}
          className="mt-4 flex items-center gap-2 text-xs font-semibold text-purple-700 hover:text-purple-900 transition">
          <Plus className="h-4 w-4" /> Adicionar outro SKU
        </button>
      </Card>

      {feedback && (
        <div className="flex items-center gap-2 bg-red-50 ring-1 ring-red-200 rounded-2xl px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="font-semibold">{feedback}</span>
        </div>
      )}

      <button type="submit" disabled={salvando}
        className="w-full flex items-center justify-center gap-2 bg-[#7F2D92] text-white py-4 rounded-2xl text-sm font-bold hover:bg-[#5B1E74] transition disabled:opacity-50">
        {salvando
          ? <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          : <ArrowRight className="h-4 w-4" />
        }
        {salvando ? "Registrando..." : "Registrar Solicitação"}
      </button>
    </form>
  );
}

// ══════════════════════════════════════════════════════════
// ACOMPANHAMENTO (read-only) — SLA D+2
// ══════════════════════════════════════════════════════════
const ETAPAS = ["em_aberto", "em_separacao", "faturado", "postado", "concluido"];
const ETAPA_LABEL = {
  em_aberto:    "Em aberto",
  em_separacao: "Em separação",
  faturado:     "Faturado",
  postado:      "Postado",
  concluido:    "Concluído",
};

function etapaEfetiva(troca) {
  const op = troca.trocas_b2c_operacao?.[0] || {};
  if (troca.status === "concluido" || op.status_furbtech === "postado" || op.rastreio) return "postado";
  if (op.nf || op.status_furbtech === "faturado") return "faturado";
  if (op.imei || op.status_furbtech === "em_separacao") return "em_separacao";
  return "em_aberto";
}

function calcularSLA(troca) {
  const base = troca.data_solicitacao || troca.criado_em;
  if (!base) return { dias: null, prazo: null, vencido: false, venceHoje: false };
  const dataBase = new Date(base);
  const prazo = new Date(dataBase);
  prazo.setDate(prazo.getDate() + 2);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const prazoZ = new Date(prazo);
  prazoZ.setHours(0, 0, 0, 0);

  const diffDias = Math.round((prazoZ - hoje) / (1000 * 60 * 60 * 24));
  return {
    prazo,
    diasRestantes: diffDias,
    vencido: diffDias < 0,
    venceHoje: diffDias === 0,
  };
}

function StatusBadge({ status }) {
  const map = {
    em_aberto:        { label: "Em aberto",    cls: "bg-blue-50 text-blue-700 ring-blue-200"          },
    em_separacao:     { label: "Em separação", cls: "bg-yellow-50 text-yellow-700 ring-yellow-200"    },
    faturado:         { label: "Faturado",     cls: "bg-purple-50 text-purple-700 ring-purple-200"    },
    postado:          { label: "Postado",      cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
    movido_reembolso: { label: "Reembolso",    cls: "bg-red-50 text-red-700 ring-red-200"             },
    concluido:        { label: "Concluído",    cls: "bg-emerald-50 text-emerald-700 ring-emerald-200" },
  };
  const s = map[status] || { label: status, cls: "bg-slate-50 text-slate-500 ring-slate-200" };
  return <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg ring-1 ${s.cls}`}>{s.label}</span>;
}

function Timeline({ etapaAtual, reembolso }) {
  if (reembolso) {
    return (
      <div className="bg-red-50 ring-1 ring-red-200 rounded-xl px-3 py-2 text-xs text-red-700 font-semibold flex items-center gap-1.5">
        <AlertTriangle className="h-3.5 w-3.5" /> Movida para reembolso
      </div>
    );
  }
  const idxAtual = ETAPAS.indexOf(etapaAtual);
  return (
    <div className="flex items-center gap-1">
      {ETAPAS.map((et, i) => {
        const feito = i <= idxAtual;
        const atual = i === idxAtual;
        return (
          <div key={et} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                feito ? "bg-[#7F2D92] text-white" : "bg-slate-200 text-slate-400"
              } ${atual ? "ring-2 ring-purple-300 ring-offset-1" : ""}`}>
                {feito ? <CheckCircle className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <span className={`text-[9px] font-semibold whitespace-nowrap ${feito ? "text-purple-700" : "text-slate-400"}`}>
                {ETAPA_LABEL[et]}
              </span>
            </div>
            {i < ETAPAS.length - 1 && (
              <div className={`h-0.5 flex-1 mx-1 -mt-4 ${i < idxAtual ? "bg-[#7F2D92]" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function CardAcompanhamento({ troca }) {
  const [aberto, setAberto] = useState(false);
  const op     = troca.trocas_b2c_operacao?.[0] || {};
  const skus   = (troca.trocas_b2c_skus || []).sort((a, b) => a.ordem - b.ordem);
  const etapa  = etapaEfetiva(troca);
  const reembolso = troca.status === "movido_reembolso";
  const concluido = etapa === "postado" || troca.status === "concluido";
  const sla    = calcularSLA(troca);

  const mostrarSLA = !concluido && !reembolso;
  const slaCls = !mostrarSLA ? "" :
    sla.vencido   ? "bg-red-50 text-red-700 ring-red-200" :
    sla.venceHoje ? "bg-amber-50 text-amber-700 ring-amber-200" :
    "bg-slate-50 text-slate-600 ring-slate-200";

  return (
    <Card className={`ring-1 ${reembolso ? "ring-red-200" : concluido ? "ring-emerald-200" : sla.vencido ? "ring-red-200" : "ring-slate-200"}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="font-black text-slate-800 text-sm">#{troca.id_anymarket}</span>
            <StatusBadge status={reembolso ? "movido_reembolso" : etapa} />
            {mostrarSLA && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ring-1 flex items-center gap-1 ${slaCls}`}>
                <Clock className="h-3 w-3" />
                {sla.vencido
                  ? `Atrasada ${Math.abs(sla.diasRestantes)}d (SLA D+2)`
                  : sla.venceHoje
                    ? "Vence hoje (D+2)"
                    : `Prazo: ${fmtData(sla.prazo)} (D+2)`}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-slate-700">{troca.nome_cliente}</div>
          <div className="text-xs text-slate-400 mt-0.5 truncate">{troca.produto_original}</div>
          <div className="text-xs text-slate-400 mt-0.5">Solicitada em {fmtData(troca.data_solicitacao || troca.criado_em)}</div>
        </div>
        <button onClick={() => setAberto(p => !p)}
          className="flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-purple-700 transition shrink-0">
          {aberto ? <><ChevronUp className="h-4 w-4" /> Menos</> : <><ChevronDown className="h-4 w-4" /> Detalhes</>}
        </button>
      </div>

      <Timeline etapaAtual={etapa} reembolso={reembolso} />

      {aberto && (
        <div className="mt-4 border-t border-slate-100 pt-4 space-y-3">
          {skus.length > 0 && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1.5">SKUs aceitos</p>
              <div className="flex gap-1.5 flex-wrap">
                {skus.map(s => (
                  <span key={s.id} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-lg font-semibold">
                    {s.sku}{s.grade && ` · ${s.grade}`}
                    {s.observacao && <span className="text-amber-600 ml-1">⚠</span>}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-slate-400 font-semibold mb-0.5">IMEI separado</p>
              <p className="font-mono font-bold text-slate-700">{op.imei || "—"}</p>
              {op.data_separacao && <p className="text-slate-400 mt-0.5">em {fmtData(op.data_separacao)}</p>}
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-slate-400 font-semibold mb-0.5">SKU escolhido</p>
              <p className="font-mono font-bold text-slate-700">{op.sku_escolhido || "—"}</p>
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-slate-400 font-semibold mb-0.5">Nota Fiscal</p>
              <p className="font-bold text-slate-700">{op.nf || "—"}</p>
              {op.data_nf && <p className="text-slate-400 mt-0.5">em {fmtData(op.data_nf)}</p>}
            </div>
            <div className="bg-slate-50 rounded-xl px-3 py-2">
              <p className="text-slate-400 font-semibold mb-0.5">Aut. Postagem</p>
              <p className="font-bold text-slate-700">{op.aut_postagem || "—"}</p>
            </div>
          </div>

          {op.rastreio && (
            <div className="bg-emerald-50 ring-1 ring-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700 font-semibold flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Rastreio: {op.rastreio}
            </div>
          )}

          {troca.endereco && (
            <div>
              <p className="text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Endereço de entrega</p>
              <p className="text-xs text-slate-500 whitespace-pre-line bg-slate-50 rounded-xl px-3 py-2">{troca.endereco}</p>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function AbaAcompanhamento() {
  const [trocas, setTrocas]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca]     = useState("");
  const [filtro, setFiltro]   = useState("todas");

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const data = await listarTrocas();
      setTrocas(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }

  const enriquecidas = trocas.map(t => {
    const etapa     = etapaEfetiva(t);
    const reembolso = t.status === "movido_reembolso";
    const concluido = etapa === "postado" || t.status === "concluido";
    const sla       = calcularSLA(t);
    const atrasada  = !concluido && !reembolso && sla.vencido;
    return { ...t, _etapa: etapa, _reembolso: reembolso, _concluido: concluido, _atrasada: atrasada };
  });

  const kpis = {
    total:       enriquecidas.length,
    emAndamento: enriquecidas.filter(t => !t._concluido && !t._reembolso).length,
    atrasadas:   enriquecidas.filter(t => t._atrasada).length,
    concluidas:  enriquecidas.filter(t => t._concluido).length,
  };

  const filtradas = enriquecidas.filter(t => {
    const matchBusca = !busca
      || t.id_anymarket?.includes(busca)
      || t.nome_cliente?.toLowerCase().includes(busca.toLowerCase())
      || t.cpf?.includes(busca);
    if (!matchBusca) return false;
    if (filtro === "em_andamento") return !t._concluido && !t._reembolso;
    if (filtro === "atrasadas")    return t._atrasada;
    if (filtro === "concluidas")   return t._concluido;
    if (filtro === "reembolso")    return t._reembolso;
    return true;
  });

  const FILTROS = [
    { key: "todas",        label: "Todas",        cor: "bg-[#7F2D92]"  },
    { key: "em_andamento", label: "Em andamento", cor: "bg-blue-600"   },
    { key: "atrasadas",    label: "Atrasadas",    cor: "bg-red-600"    },
    { key: "concluidas",   label: "Concluídas",   cor: "bg-emerald-600"},
    { key: "reembolso",    label: "Reembolso",    cor: "bg-red-500"    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl p-4 ring-1 bg-purple-50 ring-purple-200 text-purple-700">
          <div className="text-2xl font-black">{kpis.total}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Total de trocas</div>
        </div>
        <div className="rounded-xl p-4 ring-1 bg-blue-50 ring-blue-200 text-blue-700">
          <div className="text-2xl font-black">{kpis.emAndamento}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Em andamento</div>
        </div>
        <div className="rounded-xl p-4 ring-1 bg-red-50 ring-red-200 text-red-700">
          <div className="text-2xl font-black">{kpis.atrasadas}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Atrasadas (D+2)</div>
        </div>
        <div className="rounded-xl p-4 ring-1 bg-emerald-50 ring-emerald-200 text-emerald-700">
          <div className="text-2xl font-black">{kpis.concluidas}</div>
          <div className="text-xs font-semibold mt-0.5 opacity-80">Concluídas</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTROS.map(f => (
          <button key={f.key} onClick={() => setFiltro(f.key)}
            className={`text-xs px-3 py-1.5 rounded-xl font-semibold transition-all ${filtro === f.key ? `${f.cor} text-white` : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}>
            {f.label}
            {f.key === "atrasadas" && kpis.atrasadas > 0 && (
              <span className="ml-1.5 bg-white/30 rounded-full px-1.5">{kpis.atrasadas}</span>
            )}
          </button>
        ))}
        <button onClick={carregar} className="text-xs text-slate-500 hover:text-purple-700 font-semibold ml-auto">↻ Atualizar</button>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
        <input value={busca} onChange={e => setBusca(e.target.value)}
          placeholder="Buscar por ID, nome ou CPF..."
          className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#7F2D92] bg-white" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="h-8 w-8 border-4 border-purple-200 border-t-[#7F2D92] rounded-full animate-spin" />
        </div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Nenhuma troca encontrada.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtradas.map(t => <CardAcompanhamento key={t.id} troca={t} />)}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL — abas
// ══════════════════════════════════════════════════════════
export default function TrocasB2CAssurantPage() {
  const [aba, setAba] = useState("nova");

  const ABAS = [
    { key: "nova",           label: "Nova Solicitação", icon: FilePlus   },
    { key: "acompanhamento", label: "Acompanhamento",   icon: ListChecks },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔄</span>
        <div>
          <h2 className="text-lg font-black text-slate-800">Trocas B2C · Assurant</h2>
          <p className="text-xs text-slate-500">Solicite trocas e acompanhe o andamento dos processos</p>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {ABAS.map(a => {
          const Icon = a.icon;
          return (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all whitespace-nowrap ${aba === a.key ? "bg-[#7F2D92] text-white shadow-md" : "text-slate-500 hover:bg-slate-100"}`}>
              <Icon className="h-4 w-4 shrink-0" />
              {a.label}
            </button>
          );
        })}
      </div>

      {aba === "nova"            && <FormNovaSolicitacao />}
      {aba === "acompanhamento"  && <AbaAcompanhamento />}
    </div>
  );
}