import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Download, FileText, MessageSquare, Paperclip, Plus, RefreshCw, Search, Send, Ticket, X } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../AuthContext.jsx";
import { TELAS } from "../config/telasSistema.js";
import { ACEITE_ANEXOS, PRIORIDADES_CHAMADOS, STATUS_CHAMADOS, TIPOS_CHAMADOS, anexarArquivos, atualizarStatus, baixarAnexo, comentarChamado, criarChamado, detalhesChamado, listarChamados, validarAnexos } from "../services/chamadosService.js";

const input = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-[#7F2D92] focus:ring-2 focus:ring-purple-100 disabled:opacity-50";
const primary = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#6B1F87] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#532069] disabled:opacity-50";
const secondary = "inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50";
const dataHora = value => new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const protocolo = numero => `CH-${String(numero).padStart(5, "0")}`;
const encerrar = status => ["concluido", "cancelado"].includes(status);

function StatusBadge({ status }) {
  const cores = { aberto: "bg-blue-50 text-blue-700", em_analise: "bg-amber-50 text-amber-800", em_desenvolvimento: "bg-purple-50 text-purple-700", aguardando_informacoes: "bg-orange-50 text-orange-800", concluido: "bg-emerald-50 text-emerald-700", cancelado: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${cores[status] || cores.aberto}`}>{STATUS_CHAMADOS[status] || status}</span>;
}
function Aviso({ children, erro = false }) {
  return children ? <div role={erro ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${erro ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{children}</div> : null;
}
function Campo({ titulo, children }) {
  return <label className="block space-y-1.5"><span className="text-xs font-bold text-slate-600">{titulo}</span>{children}</label>;
}
function Modal({ titulo, onClose, ocupado, children }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} aria-label={titulo} onCancel={event => { event.preventDefault(); if (!ocupado) onClose(); }} className="m-auto max-h-[92dvh] w-[min(960px,96vw)] rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-slate-900/50">
    <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-4 sm:px-7"><h2 className="text-lg font-black text-[#43284F]">{titulo}</h2><button type="button" aria-label="Fechar" disabled={ocupado} onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><X className="h-5 w-5" /></button></div>
    <div className="p-5 sm:p-7">{children}</div>
  </dialog>;
}
function ArquivoSelecionado({ file, remover }) {
  const imagem = /\.(png|jpe?g|webp|gif)$/i.test(file.name);
  const imageRef = useRef(null);
  useEffect(() => {
    if (!imagem || !imageRef.current) return;
    const url = URL.createObjectURL(file);
    imageRef.current.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file, imagem]);
  return <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2">
    {imagem ? <img ref={imageRef} alt={`Prévia de ${file.name}`} className="h-12 w-14 rounded-lg object-cover" /> : <FileText className="m-2 h-7 w-7 shrink-0 text-slate-400" />}
    <div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-slate-700">{file.name}</p><p className="text-[11px] text-slate-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p></div>
    <button type="button" aria-label={`Remover ${file.name}`} onClick={remover} className="rounded-lg p-2 hover:bg-slate-100"><X className="h-4 w-4" /></button>
  </div>;
}
function SeletorAnexos({ files, setFiles, existentes = 0, ocupado = false }) {
  const [erro, setErro] = useState("");
  function adicionar(novos) {
    try {
      const todos = [...files, ...Array.from(novos)].filter((file, i, lista) => lista.findIndex(outro => outro.name === file.name && outro.size === file.size && outro.lastModified === file.lastModified) === i);
      validarAnexos(todos, existentes); setFiles(todos); setErro("");
    } catch (err) { setErro(err.message); }
  }
  return <div className="space-y-3" onPaste={event => { if (!ocupado && event.clipboardData.files.length) { event.preventDefault(); adicionar(event.clipboardData.files); } }}>
    <label tabIndex={ocupado ? -1 : 0} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!ocupado) adicionar(event.dataTransfer.files); }} className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-purple-200 bg-purple-50/30 px-4 py-5 text-center focus-within:ring-2 focus-within:ring-purple-300">
      <Paperclip className="h-5 w-5 text-[#7F2D92]" /><span className="text-sm font-bold text-[#6B1F87]">Anexar prints e arquivos</span>
      <span className="text-xs text-slate-500">Clique, arraste arquivos ou cole um print aqui (Ctrl+V).</span><span className="text-[11px] text-slate-400">Até 10 anexos por chamado · 20 MB por arquivo · Imagens, PDF, Office, CSV, TXT e ZIP</span>
      <input type="file" aria-label="Selecionar anexos" multiple accept={ACEITE_ANEXOS} disabled={ocupado} onChange={event => { adicionar(event.target.files); event.target.value = ""; }} className="w-full max-w-xs text-xs text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-purple-100 file:px-3 file:py-2 file:font-bold file:text-purple-800" />
    </label>
    <Aviso erro>{erro}</Aviso>
    <div className="grid gap-2 sm:grid-cols-2">{files.map((file, index) => <ArquivoSelecionado key={`${file.name}-${file.size}-${file.lastModified}`} file={file} remover={() => { if (!ocupado) setFiles(files.filter((_, i) => i !== index)); }} />)}</div>
  </div>;
}
function NovoChamado({ onClose, onCreated }) {
  const [campos, setCampos] = useState({ titulo: "", tipo: "melhoria", prioridade: "normal", tela_nome: "", tela_rota: "", descricao: "", resultado_esperado: "" });
  const [tela, setTela] = useState("");
  const [files, setFiles] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  function alterar(key, value) { setCampos(prev => ({ ...prev, [key]: value })); }
  function selecionarTela(id) {
    setTela(id);
    const item = TELAS.find(t => t.id === id);
    setCampos(prev => ({ ...prev, tela_nome: item ? `${item.grupo} — ${item.label}` : "", tela_rota: item?.id || "" }));
  }
  async function enviar(event) {
    event.preventDefault(); if (ocupado) return;
    setErro(""); setOcupado(true);
    try {
      const payload = Object.fromEntries(Object.entries(campos).map(([key, value]) => [key, value.trim()]));
      if (payload.titulo.length < 3 || payload.descricao.length < 10 || payload.tela_nome.length < 2) throw new Error("Preencha o título, a tela de referência e uma descrição com pelo menos 10 caracteres.");
      if (payload.tela_rota && !/^(\/[^/]|https:\/\/)/.test(payload.tela_rota)) throw new Error("Informe o caminho da tela iniciado por / ou um link HTTPS.");
      const result = await criarChamado({ ...payload, tela_rota: payload.tela_rota || null }, files);
      onCreated(result);
    } catch (err) { setErro(err.message || "Não foi possível abrir o chamado."); }
    finally { setOcupado(false); }
  }
  return <Modal titulo="Novo chamado ou solicitação" onClose={onClose} ocupado={ocupado}><form onSubmit={enviar} className="space-y-5"><fieldset disabled={ocupado} className="space-y-5">
    <Campo titulo="Título da solicitação *"><input className={input} required minLength={3} maxLength={180} value={campos.titulo} onChange={e => alterar("titulo", e.target.value)} placeholder="Ex.: Incluir filtro por loja no fechamento" /></Campo>
    <div className="grid gap-4 sm:grid-cols-2"><Campo titulo="Tipo *"><select className={input} value={campos.tipo} onChange={e => alterar("tipo", e.target.value)}>{Object.entries(TIPOS_CHAMADOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Campo><Campo titulo="Prioridade *"><select className={input} value={campos.prioridade} onChange={e => alterar("prioridade", e.target.value)}>{Object.entries(PRIORIDADES_CHAMADOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Campo></div>
    <Campo titulo="Qual parte do sistema? *"><select className={input} required value={tela} onChange={e => selecionarTela(e.target.value)}><option value="">Selecione a tela ou área</option>{[...new Set(TELAS.map(t => t.grupo))].map(grupo => <optgroup key={grupo} label={grupo}>{TELAS.filter(t => t.grupo === grupo).map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</optgroup>)}<option value="outra">Outra tela / nova funcionalidade</option></select></Campo>
    {tela === "outra" && <Campo titulo="Nome da área ou nova funcionalidade *"><input className={input} required minLength={2} maxLength={200} value={campos.tela_nome} onChange={e => alterar("tela_nome", e.target.value)} /></Campo>}
    <Campo titulo="Caminho ou link da tela (opcional)"><input className={input} maxLength={500} value={campos.tela_rota} onChange={e => alterar("tela_rota", e.target.value)} placeholder="/v2/assurant/... ou https://..." /></Campo>
    <Campo titulo="Descreva o que precisa ser ajustado *"><textarea className={input} rows={4} required minLength={10} maxLength={15000} value={campos.descricao} onChange={e => alterar("descricao", e.target.value)} placeholder="Explique a necessidade. Se for um erro, informe o que aconteceu e como reproduzir." /></Campo>
    <Campo titulo="Como você espera que funcione? (opcional)"><textarea className={input} rows={3} maxLength={10000} value={campos.resultado_esperado} onChange={e => alterar("resultado_esperado", e.target.value)} placeholder="Descreva o resultado esperado." /></Campo>
    <SeletorAnexos files={files} setFiles={setFiles} ocupado={ocupado} />
  </fieldset><Aviso erro>{erro}</Aviso><div className="flex justify-end gap-3 border-t border-slate-100 pt-4"><button type="button" disabled={ocupado} onClick={onClose} className={secondary}>Cancelar</button><button disabled={ocupado} className={primary}><Send className="h-4 w-4" />{ocupado ? "Salvando chamado e anexos…" : "Abrir chamado"}</button></div></form></Modal>;
}
function DetalheChamado({ item, onClose, onUpdate }) {
  const [detalhes, setDetalhes] = useState(null);
  const [comentario, setComentario] = useState("");
  const [files, setFiles] = useState([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState(item.anexoErro || "");
  const [aviso, setAviso] = useState("");
  const carregar = useCallback(async () => { const result = await detalhesChamado(item.id); setDetalhes(result); }, [item.id]);
  useEffect(() => { let ativo = true; detalhesChamado(item.id).then(data => { if (ativo) setDetalhes(data); }).catch(err => { if (ativo) setErro(err.message); }); return () => { ativo = false; }; }, [item.id]);
  async function executar(fn) { setOcupado(true); setErro(""); setAviso(""); try { await fn(); } catch (err) { setErro(err.message || "Não foi possível salvar."); } finally { setOcupado(false); } }
  async function mudarStatus(status) { await executar(async () => { const novo = await atualizarStatus(item.id, status); onUpdate(novo); await carregar(); setAviso("Status atualizado."); }); }
  async function comentar(event) { event.preventDefault(); if (!comentario.trim()) return; await executar(async () => { await comentarChamado(item.id, comentario); setComentario(""); await carregar(); }); }
  async function anexar() { await executar(async () => { const falhas = await anexarArquivos(item.id, files, detalhes.anexos.length); setFiles([]); await carregar(); if (falhas.length) setErro(`Não foi possível anexar: ${falhas.map(f => `${f.nome} (${f.motivo})`).join("; ")}. Selecione os arquivos para tentar novamente.`); else setAviso("Anexos salvos."); }); }
  return <Modal titulo={`${protocolo(item.numero)} · ${item.titulo}`} onClose={onClose} ocupado={ocupado}><div className="space-y-6">
    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={item.status} /><span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">{TIPOS_CHAMADOS[item.tipo]}</span><span className="text-xs font-bold text-slate-600">Prioridade {PRIORIDADES_CHAMADOS[item.prioridade]?.toLowerCase()}</span></div>
    <div className="rounded-xl bg-slate-50 p-4 text-sm"><p className="font-bold text-[#43284F]">{item.tela_nome}</p>{item.tela_rota && <p className="mt-1 break-all text-xs text-slate-500">{item.tela_rota}</p>}<p className="mt-3 text-xs text-slate-500">Aberto por {item.solicitante_nome} em {dataHora(item.criado_em)}</p></div>
    <div><h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Solicitação</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{item.descricao}</p></div>
    {item.resultado_esperado && <div><h3 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-400">Resultado esperado</h3><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{item.resultado_esperado}</p></div>}
    <Campo titulo="Atualizar andamento"><select className={input} disabled={ocupado} value={item.status} onChange={e => mudarStatus(e.target.value)}>{Object.entries(STATUS_CHAMADOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></Campo>
    <Aviso erro>{erro}</Aviso><Aviso>{aviso}</Aviso>
    {!detalhes ? <p className="text-sm text-slate-500">Carregando anexos e histórico…</p> : <>
      <section className="space-y-3"><h3 className="flex items-center gap-2 text-sm font-black text-[#43284F]"><Paperclip className="h-4 w-4" />Anexos ({detalhes.anexos.length})</h3>
        {detalhes.anexos.length === 0 && <p className="text-xs text-slate-400">Nenhum anexo neste chamado.</p>}
        <div className="grid gap-2 sm:grid-cols-2">{detalhes.anexos.map(anexo => <button key={anexo.id} type="button" disabled={ocupado} onClick={() => executar(() => baixarAnexo(anexo))} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:bg-purple-50"><FileText className="h-5 w-5 shrink-0 text-purple-600" /><span className="min-w-0 flex-1"><span className="block truncate text-xs font-bold text-slate-700">{anexo.nome}</span><span className="text-[11px] text-slate-400">{(anexo.tamanho / 1024 / 1024).toFixed(2)} MB</span></span><Download className="h-4 w-4 shrink-0 text-slate-400" /></button>)}</div>
        {detalhes.anexos.length < 10 && <><SeletorAnexos files={files} setFiles={setFiles} existentes={detalhes.anexos.length} ocupado={ocupado} />{files.length > 0 && <button className={primary} disabled={ocupado} onClick={anexar} type="button">{ocupado ? "Enviando…" : "Salvar anexos"}</button>}</>}
      </section>
      <section className="space-y-4 border-t border-slate-100 pt-5"><h3 className="flex items-center gap-2 text-sm font-black text-[#43284F]"><MessageSquare className="h-4 w-4" />Comentários e histórico</h3>
        <div className="space-y-3">{detalhes.eventos.map(evento => <div key={evento.id} className="rounded-xl bg-slate-50 p-3"><p className="text-xs font-bold text-slate-600">{evento.autor_nome} <span className="ml-2 font-normal text-slate-400">{dataHora(evento.criado_em)}</span></p><p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">{evento.tipo === "status" ? evento.texto.split(" → ").map(s => STATUS_CHAMADOS[s] || s).join(" → ") : evento.texto}</p></div>)}</div>
        <form onSubmit={comentar} className="space-y-2"><Campo titulo="Adicionar comentário"><textarea className={input} rows={3} required maxLength={10000} disabled={ocupado} value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Adicione informações ou uma atualização sobre a solicitação." /></Campo><div className="flex justify-end"><button className={primary} disabled={ocupado || !comentario.trim()}><Send className="h-4 w-4" />Comentar</button></div></form>
      </section>
    </>}
  </div></Modal>;
}
export default function ChamadosPage() {
  const { profile } = useAuth();
  const [items, setItems] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");
  const [novo, setNovo] = useState(false);
  const [selecionado, setSelecionado] = useState(null);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("");
  const [tipo, setTipo] = useState("");
  const carregar = useCallback(async () => { setCarregando(true); setErro(""); try { setItems(await listarChamados()); } catch (err) { setErro(err.message || "Não foi possível carregar os chamados."); } finally { setCarregando(false); } }, []);
  useEffect(() => { let ativo = true; listarChamados().then(data => { if (ativo) setItems(data); }).catch(err => { if (ativo) setErro(err.message); }).finally(() => { if (ativo) setCarregando(false); }); return () => { ativo = false; }; }, []);
  const filtrados = useMemo(() => items.filter(item => (!status || item.status === status) && (!tipo || item.tipo === tipo) && `${protocolo(item.numero)} ${item.titulo} ${item.descricao} ${item.tela_nome} ${item.solicitante_nome}`.toLocaleLowerCase("pt-BR").includes(busca.toLocaleLowerCase("pt-BR"))), [items, status, tipo, busca]);
  function criado({ chamado, falhas }) { setItems(prev => [chamado, ...prev]); setNovo(false); setSelecionado({ ...chamado, anexoErro: falhas.length ? `Não foi possível anexar: ${falhas.map(f => `${f.nome} (${f.motivo})`).join("; ")}. Anexe os arquivos novamente abaixo.` : "" }); setAviso(`${protocolo(chamado.numero)} criado com sucesso.`); if (falhas.length) setErro(`O chamado foi salvo, mas estes anexos falharam: ${falhas.map(f => `${f.nome} (${f.motivo})`).join("; ")}. Abra o chamado e anexe novamente.`); }
  function atualizado(item) { setItems(prev => prev.map(c => c.id === item.id ? item : c)); setSelecionado(item); }
  const cards = [["Total de chamados", items.length], ["Em aberto", items.filter(i => !encerrar(i.status)).length], ["Em desenvolvimento", items.filter(i => i.status === "em_desenvolvimento").length], ["Concluídos", items.filter(i => i.status === "concluido").length]];
  return <div className="min-h-screen bg-[#F5F5F6] text-slate-800">
    <header className="border-b border-slate-200 bg-white"><div className="mx-auto flex min-h-[76px] max-w-[1440px] flex-wrap items-center justify-between gap-3 px-5 py-3 sm:px-8"><Link to="/sistemas" aria-label="Sistemas"><img src="/brand/liquida-logo-full.png" alt="LiquidaPreço" className="h-10 w-auto" /></Link><div className="flex items-center gap-4"><span className="hidden text-xs font-bold text-slate-600 sm:block">{profile?.nome}</span><Link to="/sistemas" className={secondary}><ArrowLeft className="h-4 w-4" />Sistemas</Link></div></div></header>
    <main className="mx-auto max-w-[1440px] space-y-6 px-5 py-8 sm:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><div className="mb-2 text-[10px] font-black uppercase tracking-[0.2em] text-[#765D81]">Liquida System</div><h1 className="flex items-center gap-3 text-2xl font-black tracking-tight text-[#43284F] sm:text-3xl"><Ticket className="h-7 w-7" />Chamados e solicitações</h1><p className="mt-2 text-sm text-slate-500">Registre melhorias, correções e ajustes e acompanhe o andamento.</p></div><button type="button" onClick={() => setNovo(true)} className={primary}><Plus className="h-4 w-4" />Novo chamado</button></div>
      <Aviso erro>{erro}</Aviso><Aviso>{aviso}</Aviso>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{cards.map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-3xl font-black text-[#43284F]">{carregando ? "—" : value}</p></div>)}</div>
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="flex flex-wrap gap-3 border-b border-slate-100 p-4"><label className="relative min-w-52 flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input aria-label="Buscar chamados" className={`${input} pl-9`} value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar por número, título, tela ou solicitante" /></label><select aria-label="Filtrar por status" className={`${input} sm:w-52`} value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos os status</option>{Object.entries(STATUS_CHAMADOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><select aria-label="Filtrar por tipo" className={`${input} sm:w-44`} value={tipo} onChange={e => setTipo(e.target.value)}><option value="">Todos os tipos</option>{Object.entries(TIPOS_CHAMADOS).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select><button type="button" aria-label="Atualizar chamados" disabled={carregando} className={secondary} onClick={carregar}><RefreshCw className={`h-4 w-4 ${carregando ? "animate-spin" : ""}`} /></button></div>
        {carregando ? <div className="p-12 text-center text-sm text-slate-500">Carregando chamados…</div> : filtrados.length === 0 ? <div className="px-5 py-16 text-center"><CheckCircle2 className="mx-auto mb-3 h-9 w-9 text-purple-200" /><h2 className="font-bold text-slate-700">{items.length ? "Nenhum chamado encontrado" : "Nenhum chamado aberto ainda"}</h2><p className="mt-2 text-sm text-slate-400">{items.length ? "Ajuste os filtros para ver outras solicitações." : "Use Novo chamado para registrar a primeira solicitação."}</p></div> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-400"><tr>{["Chamado / solicitação", "Tela / área", "Prioridade", "Status", "Solicitante", "Abertura"].map(label => <th key={label} className="px-4 py-3 font-bold">{label}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{filtrados.map(item => <tr key={item.id} className="hover:bg-purple-50/30"><td className="min-w-60 px-4 py-4"><button onClick={() => setSelecionado(item)} type="button" className="text-left"><span className="text-[10px] font-bold text-purple-500">{protocolo(item.numero)} · {TIPOS_CHAMADOS[item.tipo]}</span><span className="mt-1 block font-bold text-[#43284F] hover:underline">{item.titulo}</span></button></td><td className="max-w-64 px-4 py-4 text-xs text-slate-500">{item.tela_nome}</td><td className={`px-4 py-4 text-xs font-bold ${["urgente", "alta"].includes(item.prioridade) ? "text-orange-700" : "text-slate-500"}`}>{PRIORIDADES_CHAMADOS[item.prioridade]}</td><td className="whitespace-nowrap px-4 py-4"><StatusBadge status={item.status} /></td><td className="px-4 py-4 text-xs text-slate-500">{item.solicitante_nome}</td><td className="whitespace-nowrap px-4 py-4 text-xs text-slate-400">{dataHora(item.criado_em)}</td></tr>)}</tbody></table></div>}
        {!carregando && <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-400">{filtrados.length} de {items.length} chamado(s)</p>}
      </section>
    </main>
    {novo && <NovoChamado onClose={() => setNovo(false)} onCreated={criado} />}
    {selecionado && <DetalheChamado key={selecionado.id} item={selecionado} onClose={() => setSelecionado(null)} onUpdate={atualizado} />}
  </div>;
}
