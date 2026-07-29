import { useEffect, useState } from "react";
import { Plus, X, Shield } from "lucide-react";
import { fetchAllProfiles, createUser, updateUserPermissions } from "../services/authService";

const TELAS = [
  { id: "/upload",                        label: "Uploads",                          grupo: "Geral" },
  { id: "/analise-entrada",               label: "Análise de Entrada",               grupo: "Geral" },
  { id: "/faturamento",                   label: "Faturamento",                      grupo: "Geral" },
  { id: "/abertura-os",                   label: "Abertura de OS",                   grupo: "Geral" },
  { id: "/financeiro/fluxo-realizado",    label: "Financeiro — Fluxo Realizado",     grupo: "Financeiro" },
  { id: "/financeiro/contas-pagar",       label: "Financeiro — Contas a Pagar",      grupo: "Financeiro" },
  { id: "/financeiro/contas-receber",     label: "Financeiro — Contas a Receber",    grupo: "Financeiro" },
  { id: "/financeiro/carga-historica",    label: "Financeiro — Carga Histórica",     grupo: "Financeiro" },
  { id: "/linha-branca/triagem",          label: "Linha Branca — Triagem",           grupo: "Linha Branca" },
  { id: "/linha-branca/reparo-mecanico",  label: "Linha Branca — Reparo Mecânico",   grupo: "Linha Branca" },
  { id: "/linha-branca/reparo-eletrico",  label: "Linha Branca — Reparo Elétrico",   grupo: "Linha Branca" },
  { id: "/linha-branca/reparo-estetico",  label: "Linha Branca — Reparo Estético",   grupo: "Linha Branca" },
  { id: "/linha-branca/bancada-testes",   label: "Linha Branca — Bancada de Testes", grupo: "Linha Branca" },
  { id: "/linha-branca/limpeza",          label: "Linha Branca — Limpeza",           grupo: "Linha Branca" },
  { id: "/linha-branca/qualidade",        label: "Linha Branca — Qualidade",         grupo: "Linha Branca" },
  { id: "/recebimento",                   label: "Assurant — Recebimento YBV",       grupo: "Assurant" },
  { id: "/recebimento/gestao",            label: "Assurant — Gestão de Recebimento", grupo: "Assurant" },
  { id: "/assurant/dashboard",            label: "Assurant — Dashboard",             grupo: "Assurant" },
  { id: "/assurant/sla",                  label: "Assurant — SLA & Rastreabilidade", grupo: "Assurant" },
  { id: "/assurant/layout",               label: "Assurant — Layout Warehouse",      grupo: "Assurant" },
  { id: "/b2b/picking",                   label: "Assurant — Picking B2B",           grupo: "Assurant" },
  { id: "/b2b/embalagem",                 label: "Assurant — Embalagem B2B",         grupo: "Assurant" },
  { id: "/b2b/faturamento",               label: "Assurant — Faturamento B2B",       grupo: "Assurant" },
  { id: "/b2b/painel",                    label: "Assurant — Painel Gestor B2B",     grupo: "Assurant" },
  { id: "/b2c/pedidos",                   label: "Assurant — Pedidos B2C",           grupo: "Assurant" },
  { id: "/triagens/entrada-oracle",       label: "Triagens — Entrada no Oracle",     grupo: "Assurant" },
  { id: "/triagens/funcional",            label: "Triagens — Funcional",             grupo: "Assurant" },
  { id: "/triagens/laudo",                label: "Triagens — Laudo",                 grupo: "Assurant" },
  { id: "/b2c/embalagem",                 label: "Assurant — Embalagem B2C",         grupo: "Assurant" },
  { id: "/b2c/painel",                    label: "Assurant — Painel Gestor B2C",     grupo: "Assurant" },
  { id: "/b2c/expedicao",                 label: "Assurant — Expedição B2C",         grupo: "Assurant" },
  { id: "/trocas-b2c/gestao",             label: "Assurant — Trocas B2C (Gestão)",   grupo: "Assurant" },
  { id: "/trocas-b2c/nova",               label: "Assurant — Trocas B2C (Nova)",     grupo: "Assurant" },
  { id: "/inventario",                    label: "Assurant — Inventário Cíclico",    grupo: "Assurant" },
  { id: "/inventario/sortear",            label: "Assurant — Inventário: sortear o dia", grupo: "Assurant" },
];

const AREAS_TECNICAS = [
  { value: "",                label: "Nenhuma (não é técnico)"  },
  { value: "assurant",        label: "Operador Assurant"        },
  { value: "assurant_trocas", label: "Assurant — Trocas"        },
  { value: "refrigeracao",    label: "Refrigeração"             },
  { value: "climatizacao",    label: "Climatização"             },
  { value: "lavadoras",       label: "Lavadoras"                },
  { value: "diversos",        label: "Diversos"                 },
];

const TELAS_ASSURANT_PADRAO = [];
const GRUPOS = [...new Set(TELAS.map(t => t.grupo))];

function SectionCard({ children }) {
  return (
    <div className="rounded-[28px] bg-white p-6 shadow-xl shadow-violet-100/80">
      {children}
    </div>
  );
}

function inputClass() {
  return "w-full rounded-2xl border border-[#E9D5FF] px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-[#F59E0B]/40 bg-white";
}

function Button({ children, primary = false, ...props }) {
  const base = "inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50";
  const style = primary
    ? "bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] text-white"
    : "bg-white text-[#6B1F87] ring-1 ring-[#E9D5FF] hover:bg-[#FCFAFF]";
  return <button {...props} className={`${base} ${style}`}>{children}</button>;
}

function AreaBadge({ area }) {
  const styles = {
    assurant:        "bg-purple-100 text-purple-700",
    assurant_trocas: "bg-pink-100 text-pink-700",
    refrigeracao:    "bg-blue-100 text-blue-700",
    climatizacao:    "bg-cyan-100 text-cyan-700",
    lavadoras:       "bg-green-100 text-green-700",
    diversos:        "bg-orange-100 text-orange-700",
  };
  const labels = {
    assurant:        "Operador Assurant",
    assurant_trocas: "Assurant — Trocas",
    refrigeracao:    "Refrigeração",
    climatizacao:    "Climatização",
    lavadoras:       "Lavadoras",
    diversos:        "Diversos",
  };
  if (!area) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${styles[area] || "bg-slate-100 text-slate-600"}`}>
      {labels[area] || area}
    </span>
  );
}

function TelasSeletor({ telas, onChange }) {
  function toggleTela(id) {
    onChange(telas.includes(id) ? telas.filter(t => t !== id) : [...telas, id]);
  }

  function toggleGrupo(grupo) {
    const ids = TELAS.filter(t => t.grupo === grupo).map(t => t.id);
    const todosMarcados = ids.every(id => telas.includes(id));
    if (todosMarcados) {
      onChange(telas.filter(t => !ids.includes(t)));
    } else {
      onChange([...new Set([...telas, ...ids])]);
    }
  }

  return (
    <div className="space-y-4">
      {GRUPOS.map(grupo => {
        const telasDgrupo   = TELAS.filter(t => t.grupo === grupo);
        const todosMarcados = telasDgrupo.every(t => telas.includes(t.id));
        return (
          <div key={grupo}>
            <button
              type="button"
              onClick={() => toggleGrupo(grupo)}
              className="flex items-center gap-2 mb-2 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-purple-700 transition"
            >
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 ${
                todosMarcados ? "border-[#7F2D92] bg-[#7F2D92]" : "border-slate-300"
              }`}>
                {todosMarcados && (
                  <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="none">
                    <path d="M1.5 5L4 7.5L8.5 2.5" stroke="white" strokeWidth="1.5"
                      strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
              </div>
              {grupo}
            </button>
            <div className="space-y-1.5 ml-2">
              {telasDgrupo.map(tela => (
                <label
                  key={tela.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-2.5 text-sm transition ${
                    telas.includes(tela.id)
                      ? "border-[#F59E0B] bg-amber-50 text-amber-800"
                      : "border-[#E9D5FF] text-slate-600 hover:bg-[#FCFAFF]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={telas.includes(tela.id)}
                    onChange={() => toggleTela(tela.id)}
                  />
                  <span className="font-medium">{tela.label}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ModalNovoUsuario({ onSave, onCancel }) {
  const [nome, setNome]               = useState("");
  const [email, setEmail]             = useState("");
  const [senha, setSenha]             = useState("");
  const [isMaster, setIsMaster]       = useState(false);
  const [telas, setTelas]             = useState([]);
  const [areaTecnica, setAreaTecnica] = useState("");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  function handleAreaChange(value) {
    setAreaTecnica(value);
    setTelas([]);
  }

  async function handleSave() {
    setError("");
    if (!nome.trim())  { setError("Preencha o nome do usuário."); return; }
    if (!email.trim()) { setError("Preencha o e-mail."); return; }
    if (!senha.trim()) { setError("Preencha a senha."); return; }
    if (senha.length < 6) { setError("A senha deve ter pelo menos 6 caracteres."); return; }

    try {
      setSaving(true);
      await onSave(email.trim(), senha, nome.trim(), isMaster, telas, areaTecnica);
    } catch (err) {
      setError(
        typeof err === "string" ? err : err?.message ? err.message : "Erro ao criar usuário. Tente novamente."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-black text-[#6B1F87]">Novo usuário</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label>
            <span className="text-sm font-semibold text-slate-600">Nome completo *</span>
            <input value={nome} onChange={e => setNome(e.target.value)}
              className={inputClass()} placeholder="Nome do usuário" />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-600">E-mail *</span>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              className={inputClass()} placeholder="email@exemplo.com" />
          </label>

          <label>
            <span className="text-sm font-semibold text-slate-600">Senha *</span>
            <input type="password" value={senha} onChange={e => setSenha(e.target.value)}
              className={inputClass()} placeholder="Mínimo 6 caracteres" />
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-[#E9D5FF] px-4 py-3">
            <input type="checkbox" checked={isMaster} onChange={e => setIsMaster(e.target.checked)} />
            <div>
              <div className="text-sm font-semibold text-slate-700">Usuário master</div>
              <div className="text-xs text-slate-400">Acesso total ao sistema</div>
            </div>
          </label>

          {!isMaster && (
            <>
              <div>
                <span className="text-sm font-semibold text-slate-600">Perfil / Área</span>
                <select value={areaTecnica} onChange={e => handleAreaChange(e.target.value)}
                  className={inputClass()}>
                  {AREAS_TECNICAS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-600 mb-2">Telas permitidas</div>
                <TelasSeletor telas={telas} onChange={setTelas} />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] py-3 text-sm font-bold text-white disabled:opacity-50">
              {saving ? "Criando..." : "Criar usuário"}
            </button>
            <button onClick={onCancel}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalPermissoes({ usuario, onSave, onCancel }) {
  const [telas, setTelas]             = useState(usuario.telas_permitidas || []);
  const [isMaster, setIsMaster]       = useState(usuario.is_master || false);
  const [areaTecnica, setAreaTecnica] = useState(usuario.area_tecnica || "");
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");

  function handleAreaChange(value) {
    setAreaTecnica(value);
  }

  async function handleSave() {
    try {
      setSaving(true);
      setError("");
      await onSave(usuario.id, telas, isMaster, areaTecnica);
    } catch (err) {
      setError(
        typeof err === "string" ? err : err?.message ? err.message : "Erro ao salvar permissões."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-[28px] bg-white p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-[#F97316]" />
            <h2 className="text-lg font-black text-[#6B1F87]">Permissões — {usuario.nome}</h2>
          </div>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-[#E9D5FF] px-4 py-3">
            <input type="checkbox" checked={isMaster} onChange={e => setIsMaster(e.target.checked)} />
            <div>
              <div className="text-sm font-semibold text-slate-700">Usuário master</div>
              <div className="text-xs text-slate-400">Acesso total ao sistema</div>
            </div>
          </label>

          {!isMaster && (
            <>
              <div>
                <span className="text-sm font-semibold text-slate-600">Perfil / Área</span>
                <select value={areaTecnica} onChange={e => handleAreaChange(e.target.value)}
                  className={inputClass()}>
                  {AREAS_TECNICAS.map(a => (
                    <option key={a.value} value={a.value}>{a.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="text-sm font-semibold text-slate-600 mb-2">Telas permitidas</div>
                <TelasSeletor telas={telas} onChange={setTelas} />
              </div>
            </>
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] py-3 text-sm font-bold text-white disabled:opacity-50">
              {saving ? "Salvando..." : "Salvar permissões"}
            </button>
            <button onClick={onCancel}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600">
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GerenciarUsuariosPage() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading]   = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [status, setStatus]     = useState("");

  async function loadUsuarios() {
    try {
      setLoading(true);
      const data = await fetchAllProfiles();
      setUsuarios(data);
    } catch (err) {
      setStatus(`Erro: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadUsuarios(); }, []);

  async function handleCreateUser(email, senha, nome, isMaster, telas, areaTecnica) {
    await createUser(email, senha, nome, isMaster, telas, areaTecnica);
    setShowNovo(false);
    setStatus("Usuário criado com sucesso!");
    await loadUsuarios();
  }

  async function handleUpdatePermissions(userId, telas, isMaster, areaTecnica) {
    await updateUserPermissions(userId, telas, isMaster, areaTecnica);
    setEditando(null);
    setStatus("Permissões atualizadas!");
    await loadUsuarios();
  }

  const gruposUsuarios = {
    master:          usuarios.filter(u => u.is_master),
    assurant:        usuarios.filter(u => !u.is_master && u.area_tecnica === "assurant"),
    assurantTrocas:  usuarios.filter(u => !u.is_master && u.area_tecnica === "assurant_trocas"),
    outros:          usuarios.filter(u => !u.is_master && u.area_tecnica !== "assurant" && u.area_tecnica !== "assurant_trocas"),
  };

  function renderUsuario(u) {
    return (
      <div key={u.id}
        className="flex items-center justify-between rounded-2xl bg-[#FCFAFF] px-5 py-4 ring-1 ring-[#E9D5FF]">
        <div>
          <div className="font-bold text-[#6B1F87]">{u.nome}</div>
          <div className="text-xs text-slate-400">{u.email}</div>
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            {u.is_master ? (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                Master
              </span>
            ) : (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                {u.telas_permitidas?.length || 0} tela(s)
              </span>
            )}
            <AreaBadge area={u.area_tecnica} />
          </div>
        </div>
        <Button onClick={() => setEditando(u)}>
          <Shield className="h-4 w-4" />
          Permissões
        </Button>
      </div>
    );
  }

  return (
    <>
      {showNovo && (
        <ModalNovoUsuario onSave={handleCreateUser} onCancel={() => setShowNovo(false)} />
      )}
      {editando && (
        <ModalPermissoes
          usuario={editando}
          onSave={handleUpdatePermissions}
          onCancel={() => setEditando(null)}
        />
      )}

      <div className="space-y-6">
        <SectionCard>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-black text-[#6B1F87]">Gerenciar Usuários</h2>
              <p className="mt-1 text-sm text-slate-500">
                Crie e gerencie os acessos dos usuários ao sistema.
              </p>
            </div>
            <Button primary onClick={() => setShowNovo(true)}>
              <Plus className="h-4 w-4" />
              Novo usuário
            </Button>
          </div>
        </SectionCard>

        {status && (
          <div className="rounded-2xl bg-[#FCFAFF] p-4 text-sm font-semibold text-[#6B1F87] ring-1 ring-[#E9D5FF]">
            {status}
          </div>
        )}

        <SectionCard>
          {loading ? (
            <p className="text-sm text-slate-400">Carregando usuários...</p>
          ) : usuarios.length === 0 ? (
            <p className="text-sm text-slate-400">Nenhum usuário cadastrado.</p>
          ) : (
            <div className="space-y-6">
              {gruposUsuarios.master.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Master</p>
                  <div className="space-y-3">{gruposUsuarios.master.map(renderUsuario)}</div>
                </div>
              )}
              {gruposUsuarios.assurant.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Operadores Assurant</p>
                  <div className="space-y-3">{gruposUsuarios.assurant.map(renderUsuario)}</div>
                </div>
              )}
              {gruposUsuarios.assurantTrocas.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Assurant — Trocas</p>
                  <div className="space-y-3">{gruposUsuarios.assurantTrocas.map(renderUsuario)}</div>
                </div>
              )}
              {gruposUsuarios.outros.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Outros Usuários</p>
                  <div className="space-y-3">{gruposUsuarios.outros.map(renderUsuario)}</div>
                </div>
              )}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}