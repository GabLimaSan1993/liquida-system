import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Search,
  ShieldCheck,
  UserPlus,
} from "lucide-react";

import {
  createUser,
  fetchAllProfiles,
  updateUserPermissions,
} from "../../services/authService.js";

const TELAS_V2 = [
  {
    grupo: "OPERAÇÃO",
    telas: [
      { id: "/v2/assurant", label: "Visão Geral" },
      { id: "/v2/assurant/recebimento", label: "Recebimento Lojas" },
      { id: "/v2/assurant/recebimento/gestao", label: "Gestão de Recebimento" },
    ],
  },
  {
  grupo: "B2B",
  telas: [
    { id: "/v2/assurant/b2b/picking", label: "Picking" },
    { id: "/v2/assurant/b2b/embalagem", label: "Embalagem" },
    { id: "/v2/assurant/b2b/faturamento", label: "Faturamento" },
    { id: "/v2/assurant/b2b/gestao", label: "Gestão B2B" },
  ],
},
  {
    grupo: "TRIAGENS",
    telas: [
      { id: "/v2/assurant/triagens/funcional", label: "Triagem Funcional" },
      { id: "/v2/assurant/triagens/laudo", label: "Laudo" },
      { id: "/v2/assurant/triagens/cosmetica", label: "Triagem Cosmética" },
      { id: "/v2/assurant/triagens/oracle", label: "Entrada Oracle" },
    ],
  },
  {
    grupo: "B2C",
    telas: [
      { id: "/v2/assurant/b2c", label: "Pedidos" },
      { id: "/v2/assurant/b2c/embalagem", label: "Embalagem" },
      { id: "/v2/assurant/b2c/expedicao", label: "Expedição" },
      { id: "/v2/assurant/b2c/etiquetas", label: "Etiquetas" },
      { id: "/v2/assurant/b2c/gestao", label: "Gestão B2C" },
    ],
  },
  {
    grupo: "ESTOQUE",
    telas: [
      { id: "/v2/assurant/estoque/armazenagem", label: "Armazenagem" },
      { id: "/v2/assurant/estoque/consulta", label: "Consulta do Estoque" },
      { id: "/v2/assurant/estoque/inventario", label: "Inventário" },
      { id: "/v2/assurant/estoque/carga-inicial", label: "Carga Inicial" },
    ],
  },
  {
    grupo: "DADOS",
    telas: [
      { id: "/v2/assurant/uploads", label: "Uploads" },
    ],
  },
];

const TODAS_TELAS_V2 = TELAS_V2.flatMap((grupo) => grupo.telas);

function countV2Permissions(usuario) {
  if (usuario.is_master) return TODAS_TELAS_V2.length;

  const permitidas = usuario.telas_permitidas || [];

  return TODAS_TELAS_V2.filter((tela) =>
    permitidas.includes(tela.id)
  ).length;
}

function NovoUsuarioModal({ onClose, onSaved }) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState("");

  async function salvar() {
    if (!nome.trim() || !email.trim() || !senha.trim()) {
      setErro("Preencha nome, e-mail e senha.");
      return;
    }

    if (senha.length < 6) {
      setErro("A senha precisa ter pelo menos 6 caracteres.");
      return;
    }

    try {
      setSaving(true);
      setErro("");

      await createUser(
        email.trim(),
        senha,
        nome.trim(),
        false,
        ["/v2/assurant"],
        "assurant"
      );

      await onSaved();
      onClose();
    } catch (error) {
      setErro(error?.message || "Erro ao criar usuário.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-5">
          <h2 className="text-lg font-black text-slate-900">
            Novo usuário
          </h2>

          <p className="mt-1 text-xs text-slate-500">
            O usuário será criado como operador do Assurant Warehouse.
          </p>
        </div>

        <div className="space-y-4 p-6">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">
              Nome
            </span>

            <input
              value={nome}
              onChange={(event) => setNome(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">
              E-mail
            </span>

            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">
              Senha inicial
            </span>

            <input
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
              className="h-10 w-full rounded-xl border border-slate-200 px-3 text-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
            />
          </label>

          {erro && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
              {erro}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={salvar}
            disabled={saving}
            className="rounded-xl bg-[#211136] px-4 py-2 text-xs font-bold text-white transition hover:bg-[#190D2A] disabled:opacity-50"
          >
            {saving ? "Criando..." : "Criar usuário"}
          </button>
        </div>
      </div>
    </div>
  );
}

function UsuarioExpandido({ usuario, onSaved }) {
  const [isMaster, setIsMaster] = useState(Boolean(usuario.is_master));
  const [telas, setTelas] = useState(usuario.telas_permitidas || []);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  function toggleTela(id) {
    setTelas((atuais) =>
      atuais.includes(id)
        ? atuais.filter((item) => item !== id)
        : [...atuais, id]
    );
  }

  async function salvar() {
    try {
      setSaving(true);
      setStatus("");

      let novasTelas = telas;

      if (!isMaster && !novasTelas.includes("/v2/assurant")) {
        novasTelas = ["/v2/assurant", ...novasTelas];
      }

      await updateUserPermissions(
  usuario.id,
  novasTelas,
  isMaster,
  isMaster ? "" : "assurant"
);

      setStatus("Permissões salvas.");
      await onSaved();
    } catch (error) {
      setStatus(error?.message || "Erro ao salvar permissões.");
    } finally {
      setSaving(false);
    }
  }

  const totalMarcadas = isMaster
    ? TODAS_TELAS_V2.length
    : TODAS_TELAS_V2.filter((tela) => telas.includes(tela.id)).length;

  return (
    <div className="grid gap-4 border-t border-slate-200 bg-slate-50 p-4 lg:grid-cols-[0.9fr_1.1fr]">
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">
            Papel e perfil
          </h3>
        </div>

        <div className="space-y-5 p-4">
          <div>
            <div className="space-y-3">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={!isMaster}
                  onChange={() => setIsMaster(false)}
                />
                Usuário comum
              </label>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  checked={isMaster}
                  onChange={() => setIsMaster(true)}
                />
                Administrador / Master
              </label>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-5">
            <div className="text-xs font-black uppercase tracking-wide text-slate-800">
              Área operacional
            </div>

            <div className="mt-3 rounded-xl border border-violet-100 bg-violet-50 px-4 py-3">
              <div className="text-sm font-bold text-violet-800">
                Assurant Warehouse
              </div>

              <div className="mt-0.5 text-xs text-violet-600">
                Operação dedicada
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wide text-slate-800">
              Telas liberadas
            </h3>

            <div className="mt-1 text-xs font-semibold text-slate-400">
              {totalMarcadas} de {TODAS_TELAS_V2.length}
            </div>
          </div>

          {isMaster && (
            <span className="rounded-lg bg-violet-50 px-2.5 py-1 text-[10px] font-bold text-violet-700">
              Acesso total
            </span>
          )}
        </div>

        <div className="grid gap-x-8 gap-y-6 p-4 md:grid-cols-2 xl:grid-cols-3">
          {TELAS_V2.map((grupo) => (
            <div key={grupo.grupo}>
              <div className="mb-2 text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                {grupo.grupo}
              </div>

              <div className="space-y-2">
                {grupo.telas.map((tela) => (
                  <label
                    key={tela.id}
                    className={`flex items-center gap-2 text-sm ${
                      isMaster
                        ? "cursor-default text-slate-400"
                        : "cursor-pointer text-slate-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isMaster || telas.includes(tela.id)}
                      disabled={isMaster}
                      onChange={() => toggleTela(tela.id)}
                    />

                    {tela.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-3">
          <button
            type="button"
            onClick={salvar}
            disabled={saving}
            className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>

          {status && (
            <span className="text-xs font-semibold text-slate-500">
              {status}
            </span>
          )}
        </div>
      </section>
    </div>
  );
}

export default function UsuariosV2Page() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aberto, setAberto] = useState(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [novoUsuario, setNovoUsuario] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [erro, setErro] = useState("");

  async function carregarUsuarios() {
    try {
      setLoading(true);
      setErro("");

      const data = await fetchAllProfiles();

setUsuarios(
  (data || []).filter(
    (usuario) =>
      usuario.is_master ||
      usuario.area_tecnica === "assurant"
  )
);
      setUpdatedAt(new Date());
    } catch (error) {
      setErro(error?.message || "Erro ao carregar usuários.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregarUsuarios();
  }, []);

  const usuariosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    return usuarios
      .filter((usuario) => {
        if (filtro === "assurant") {
          return usuario.area_tecnica === "assurant";
        }

        if (filtro === "master") {
          return usuario.is_master;
        }

        return true;
      })
      .filter((usuario) => {
        if (!termo) return true;

        return [usuario.nome, usuario.email]
          .some((valor) =>
            String(valor || "")
              .toLowerCase()
              .includes(termo)
          );
      });
  }, [usuarios, busca, filtro]);

  return (
    <>
      {novoUsuario && (
        <NovoUsuarioModal
          onClose={() => setNovoUsuario(false)}
          onSaved={carregarUsuarios}
        />
      )}

      <div className="mx-auto max-w-[1680px] space-y-5">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              Usuários
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Quem acessa o Assurant Warehouse e o que cada um enxerga
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
              ● Supabase conectado
            </div>

            {updatedAt && (
              <div className="text-right">
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  Atualizado
                </div>

                <div className="font-mono text-xs font-bold text-slate-700">
                  {updatedAt.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 px-5 py-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <h2 className="text-sm font-black text-slate-900">
                Acessos
              </h2>

              <p className="mt-1 text-xs text-slate-500">
                Clique no usuário para escolher as telas que ele enxerga.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

                <input
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="nome ou e-mail"
                  className="h-10 w-[220px] rounded-xl border border-slate-200 pl-9 pr-3 text-sm outline-none focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </div>

              <select
                value={filtro}
                onChange={(event) => setFiltro(event.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none"
              >
                <option value="todos">Todos</option>
                <option value="assurant">Assurant</option>
                <option value="master">Master</option>
              </select>

              <button
                type="button"
                onClick={carregarUsuarios}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>

              <button
                type="button"
                onClick={() => setNovoUsuario(true)}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#211136] px-4 text-xs font-bold text-white hover:bg-[#190D2A]"
              >
                <UserPlus className="h-4 w-4" />
                Novo usuário
              </button>
            </div>
          </div>

          {erro && (
            <div className="border-b border-rose-200 bg-rose-50 px-5 py-3 text-xs font-semibold text-rose-700">
              {erro}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Usuário
                  </th>

                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Papel
                  </th>

                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Área
                  </th>

                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Telas
                  </th>

                  <th className="px-5 py-3 text-[10px] font-black uppercase tracking-wide text-slate-400">
                    Ações
                  </th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-sm text-slate-400"
                    >
                      Carregando usuários...
                    </td>
                  </tr>
                ) : usuariosFiltrados.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-5 py-10 text-center text-sm text-slate-400"
                    >
                      Nenhum usuário encontrado.
                    </td>
                  </tr>
                ) : (
                  usuariosFiltrados.map((usuario) => {
                    const expandido = aberto === usuario.id;
                    const telasLiberadas = countV2Permissions(usuario);

                    return (
  <Fragment key={usuario.id}>
                        <tr
                          key={usuario.id}
                          onClick={() =>
                            setAberto(expandido ? null : usuario.id)
                          }
                          className="cursor-pointer border-b border-slate-100 transition hover:bg-slate-50"
                        >
                          <td className="px-5 py-4">
                            <div className="flex items-start gap-2">
                              {expandido ? (
                                <ChevronDown className="mt-0.5 h-4 w-4 text-slate-400" />
                              ) : (
                                <ChevronRight className="mt-0.5 h-4 w-4 text-slate-400" />
                              )}

                              <div>
                                <div className="text-sm font-bold text-slate-800">
                                  {usuario.nome || "Sem nome"}
                                </div>

                                <div className="mt-0.5 text-xs text-slate-400">
                                  {usuario.email || "—"}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {usuario.is_master ? "Administrador" : "Comum"}
                          </td>

                          <td className="px-5 py-4 text-sm text-slate-700">
                            {usuario.area_tecnica === "assurant"
                              ? "Assurant"
                              : usuario.area_tecnica || "—"}
                          </td>

                          <td className="px-5 py-4 text-sm font-bold text-slate-700">
                            {usuario.is_master
                              ? "Todas"
                              : telasLiberadas}
                          </td>

                          <td className="px-5 py-4">
                            <span className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-2.5 py-1.5 text-xs font-bold text-violet-700">
                              <ShieldCheck className="h-3.5 w-3.5" />
                              Permissões
                            </span>
                          </td>
                        </tr>

                        {expandido && (
                          <tr key={`${usuario.id}-expanded`}>
                            <td colSpan={5} className="p-0">
                              <UsuarioExpandido
                                usuario={usuario}
                                onSaved={carregarUsuarios}
                              />
                            </td>
                          </tr>
                        )}
                        </Fragment>
);
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}