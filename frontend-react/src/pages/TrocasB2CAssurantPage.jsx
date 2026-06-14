import { useState, useRef } from "react";
import { Plus, Trash2, CheckCircle, AlertTriangle, ArrowRight, Loader } from "lucide-react";
import { criarTroca, buscarDescricaoPorSku } from "../services/trocasB2CService.js";
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
      <div className="flex-1 grid grid-cols-1 gap-2">
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

export default function TrocasB2CAssurantPage() {
  const { user } = useAuth();

  const [form, setForm] = useState({
    id_anymarket:      "",
    nome_cliente:      "",
    cpf:               "",
    endereco:          "",
    produto_nome:      "",
    produto_condicao:  "Usado",
    produto_grade:     "",
  });

  const [skus, setSkus]         = useState([{ sku: "", descricao: "" }]);
  const [salvando, setSalvando] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [sucesso, setSucesso]   = useState(false);

  function setField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  // Monta o produto_original juntando os três campos
  function montarProdutoOriginal() {
    const partes = [];
    if (form.produto_condicao) partes.push(form.produto_condicao);
    if (form.produto_nome.trim()) partes.push(form.produto_nome.trim());
    if (form.produto_grade) partes.push(form.produto_grade);
    return partes.join(": ").replace(": ", " ").trim();
    // Ex: "Usado: Samsung Galaxy S23 256GB Preto - Bom"
  }

  function addSku() { setSkus(prev => [...prev, { sku: "", descricao: "" }]); }
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

    setSalvando(true);
    try {
      await criarTroca(
        { ...form, produto_original: produtoOriginal },
        skusValidos,
        user.id
      );
      setSucesso(true);
      setForm({ id_anymarket: "", nome_cliente: "", cpf: "", endereco: "", produto_nome: "", produto_condicao: "Usado", produto_grade: "" });
      setSkus([{ sku: "", descricao: "" }]);
    } catch (e) {
      setFeedback(e.message);
    } finally {
      setSalvando(false);
    }
  }

  if (sucesso) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Solicitação registrada!</h2>
          <p className="text-sm text-slate-500 mb-2">A equipe Furbtech já pode visualizar e processar a troca.</p>
          <p className="text-xs text-slate-400 mb-6 bg-slate-50 rounded-xl px-3 py-2 font-mono">
            {`${form.produto_condicao || "Usado"}: ${form.produto_nome || "—"} - ${form.produto_grade || "—"}`}
          </p>
          <button onClick={() => setSucesso(false)}
            className="bg-[#7F2D92] text-white px-6 py-3 rounded-2xl text-sm font-bold hover:bg-[#5B1E74] transition">
            Nova solicitação
          </button>
        </div>
      </div>
    );
  }

  // Preview do produto montado
  const previewProduto = [
    form.produto_condicao,
    form.produto_nome.trim(),
    form.produto_grade,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-5 max-w-2xl mx-auto">
      <div className="flex items-center gap-3">
        <span className="text-2xl">🔄</span>
        <div>
          <h2 className="text-lg font-black text-slate-800">Nova Solicitação de Troca</h2>
          <p className="text-xs text-slate-500">Preencha os dados do cliente e os SKUs aceitos para substituição</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">

        {/* Dados do pedido */}
        <Card>
          <h3 className="font-black text-slate-700 text-sm mb-4">📋 Dados do Pedido</h3>
          <div className="space-y-3">
            <div>
              <label className={labelCls}>ID AnyMarket *</label>
              <input value={form.id_anymarket} onChange={e => setField("id_anymarket", e.target.value)}
                className={inputCls} placeholder="Ex: 232991879" />
            </div>

            {/* Produto comprado — 3 campos */}
            <div>
              <label className={labelCls}>Produto Comprado Originalmente *</label>

              {/* Condição: Usado / Novo */}
              <div className="flex gap-2 mb-2">
                {["Usado", "Novo"].map(c => (
                  <button key={c} type="button" onClick={() => setField("produto_condicao", c)}
                    className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ring-1 ${
                      form.produto_condicao === c
                        ? "bg-[#7F2D92] text-white ring-[#7F2D92]"
                        : "bg-slate-50 text-slate-600 ring-slate-200 hover:bg-slate-100"
                    }`}>
                    {c}
                  </button>
                ))}
              </div>

              {/* Nome do produto */}
              <input
                value={form.produto_nome}
                onChange={e => setField("produto_nome", e.target.value)}
                className={`${inputCls} mb-2`}
                placeholder="Ex: Samsung Galaxy S23 256GB Preto"
              />

              {/* Grade */}
              <select
                value={form.produto_grade}
                onChange={e => setField("produto_grade", e.target.value)}
                className={inputCls}
              >
                <option value="">Selecione o grade...</option>
                {GRADES.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              {/* Preview */}
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
            <div>
              <label className={labelCls}>Endereço de Entrega</label>
              <textarea value={form.endereco} onChange={e => setField("endereco", e.target.value)}
                className={inputCls + " resize-none"} rows={3}
                placeholder="Rua, número, bairro, cidade, estado, CEP" />
            </div>
          </div>
        </Card>

        {/* SKUs aceitos */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-black text-slate-700 text-sm">📦 SKUs Aceitos para Substituição</h3>
            <span className="text-xs text-slate-400">em ordem de preferência</span>
          </div>

          <div className="bg-blue-50 ring-1 ring-blue-200 rounded-xl px-4 py-2.5 mb-4 text-xs text-blue-700 font-semibold">
            ℹ A descrição será carregada automaticamente ao digitar o SKU.
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
    </div>
  );
}