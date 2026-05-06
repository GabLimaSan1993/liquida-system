import { useEffect, useState } from "react";
import { Users, Plus, Save, X, Shield } from "lucide-react";
import { fetchAllProfiles, createUser, updateUserPermissions } from "../services/authService";

const TELAS = [
  { id: "/upload", label: "Uploads" },
  { id: "/analise-entrada", label: "Análise de Entrada" },
  { id: "/faturamento", label: "Faturamento" },
  { id: "/abertura-os", label: "Abertura de OS" },
  { id: "/linha-branca/triagem", label: "Linha Branca — Triagem" },
  { id: "/linha-branca/reparo-mecanico", label: "Linha Branca — Reparo Mecânico" },
  { id: "/linha-branca/reparo-eletrico", label: "Linha Branca — Reparo Elétrico" },
  { id: "/linha-branca/reparo-estetico", label: "Linha Branca — Reparo Estético" },
  { id: "/linha-branca/bancada-testes", label: "Linha Branca — Bancada de Testes" },
  { id: "/linha-branca/limpeza", label: "Linha Branca — Limpeza" },
  { id: "/linha-branca/qualidade", label: "Linha Branca — Qualidade" },
];

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

function ModalNovoUsuario({ onSave, onCancel }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [isMaster, setIsMaster] = useState(false);
  const [telas, setTelas] = useState([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function toggleTela(id) {
    setTelas((cur) =>
      cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]
    );
  }

  async function handleSave() {
    if (!nome || !email || !senha) {
      setError("Preencha nome, e-mail e senha.");
      return;
    }
    try {
      setSaving(true);
      await onSave(email, senha, nome, isMaster, telas);
    } catch (err) {
      setError(err.message);
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
            <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputClass()} placeholder="Nome do usuário" />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-600">E-mail *</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass()} placeholder="email@exemplo.com" />
          </label>
          <label>
            <span className="text-sm font-semibold text-slate-600">Senha *</span>
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} className={inputClass()} placeholder="Mínimo 6 caracteres" />
          </label>

          <label className="flex items-center gap-3 cursor-pointer rounded-2xl border border-[#E9D5FF] px-4 py-3">
            <input
              type="checkbox"
              checked={isMaster}
              onChange={(e) => setIsMaster(e.target.checked)}
            />
            <div>
              <div className="text-sm font-semibold text-slate-700">Usuário master</div>
              <div className="text-xs text-slate-400">Acesso total ao sistema</div>
            </div>
          </label>

          {!isMaster && (
            <div>
              <div className="text-sm font-semibold text-slate-600 mb-2">Telas permitidas</div>
              <div className="space-y-2">
                {TELAS.map((tela) => (
                  <label
                    key={tela.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
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
          )}

          {error && (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-600 ring-1 ring-red-200">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "Criando..." : "Criar usuário"}
            </button>
            <button
              onClick={onCancel}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600 hover:bg-slate-200"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ModalPermissoes({ usuario, onSave, onCancel }) {
  const [telas, setTelas] = useState(usuario.telas_permitidas || []);
  const [isMaster, setIsMaster] = useState(usuario.is_master || false);
  const [saving, setSaving] = useState(false);

  function toggleTela(id) {
    setTelas((cur) =>
      cur.includes(id) ? cur.filter((t) => t !== id) : [...cur, id]
    );
  }

  async function handleSave() {
    try {
      setSaving(true);
      await onSave(usuario.id, telas, isMaster);
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
            <input
              type="checkbox"
              checked={isMaster}
              onChange={(e) => setIsMaster(e.target.checked)}
            />
            <div>
              <div className="text-sm font-semibold text-slate-700">Usuário master</div>
              <div className="text-xs text-slate-400">Acesso total ao sistema</div>
            </div>
          </label>

          {!isMaster && (
            <div>
              <div className="text-sm font-semibold text-slate-600 mb-2">Telas permitidas</div>
              <div className="space-y-2">
                {TELAS.map((tela) => (
                  <label
                    key={tela.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 text-sm transition ${
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
          )}

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 rounded-2xl bg-[linear-gradient(135deg,#F97316_0%,#F59E0B_100%)] py-3 text-sm font-bold text-white disabled:opacity-50"
            >
              {saving ? "Salvando..." : "Salvar permissões"}
            </button>
            <button
              onClick={onCancel}
              className="flex-1 rounded-2xl bg-slate-100 py-3 text-sm font-bold text-slate-600"
            >
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
  const [loading, setLoading] = useState(false);
  const [showNovo, setShowNovo] = useState(false);
  const [editando, setEditando] = useState(null);
  const [status, setStatus] = useState("");

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

  async function handleCreateUser(email, senha, nome, isMaster, telas) {
    await createUser(email, senha, nome, isMaster, telas);
    setShowNovo(false);
    setStatus("Usuário criado com sucesso!");
    await loadUsuarios();
  }

  async function handleUpdatePermissions(userId, telas, isMaster) {
    await updateUserPermissions(userId, telas, isMaster);
    setEditando(null);
    setStatus("Permissões atualizadas!");
    await loadUsuarios();
  }

  return (
    <>
      {showNovo && (
        <ModalNovoUsuario
          onSave={handleCreateUser}
          onCancel={() => setShowNovo(false)}
        />
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
            <div className="space-y-3">
              {usuarios.map((u) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between rounded-2xl bg-[#FCFAFF] px-5 py-4 ring-1 ring-[#E9D5FF]"
                >
                  <div>
                    <div className="font-bold text-[#6B1F87]">{u.nome}</div>
                    <div className="text-xs text-slate-400">{u.email}</div>
                    <div className="mt-1">
                      {u.is_master ? (
                        <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-semibold text-purple-700">
                          Master
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                          {u.telas_permitidas?.length || 0} tela(s)
                        </span>
                      )}
                    </div>
                  </div>
                  <Button onClick={() => setEditando(u)}>
                    <Shield className="h-4 w-4" />
                    Permissões
                  </Button>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </>
  );
}