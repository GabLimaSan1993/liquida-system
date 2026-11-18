import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, FileArchive, FileText, Landmark, LoaderCircle, UploadCloud, Play, RefreshCw } from "lucide-react";
import { useAuth } from "../AuthContext.jsx";
import { supabase } from "../lib/supabase.js";

const BUCKET = "financeiro-extratos";
const LIMITE_BYTES = 50 * 1024 * 1024;
const FORMATOS = new Set(["ofx", "zip", "csv", "pdf"]);
const BANCOS = ["Itaú", "Safra", "Santander", "Banco do Brasil", "Bradesco", "Outro"];
const moeda = (bytes) => new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + " MB";
const dataHora = (value) => value ? new Date(value).toLocaleString("pt-BR") : "—";
const nomeSeguro = (value) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);

async function calcularHash(file) {
  const buffer = await file.arrayBuffer();
  const hash = await window.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export default function ExtratosBancariosPage() {
  const { user } = useAuth();
  const fileRef = useRef(null);
  const [banco, setBanco] = useState("Itaú");
  const [outroBanco, setOutroBanco] = useState("");
  const [conta, setConta] = useState("");
  const [arquivos, setArquivos] = useState([]);
  const [historico, setHistorico] = useState([]);
  const [autorizado, setAutorizado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [progresso, setProgresso] = useState("");
  const [mensagem, setMensagem] = useState(null);
  const [processandoId, setProcessandoId] = useState(null);
  const [andamento, setAndamento] = useState(null);
  const [resumosArquivos, setResumosArquivos] = useState({});
  const bancoSelecionado = (banco === "Outro" ? outroBanco : banco).trim();
  const resumo = useMemo(() => ({
    arquivos: historico.length,
    bancos: new Set(historico.map((item) => item.banco + "|" + item.conta)).size,
  }), [historico]);

  const atualizarHistorico = useCallback(async () => {
    if (!user?.id) return;
    setCarregando(true);
    try {
      const { data: acesso, error: erroAcesso } = await supabase
        .from("financeiro_acessos").select("usuario_id").eq("usuario_id", user.id).maybeSingle();
      if (erroAcesso) throw erroAcesso;
      setAutorizado(Boolean(acesso));
      if (!acesso) { setHistorico([]); return; }
      const { data, error } = await supabase
        .from("financeiro_extratos_uploads")
        .select("id,banco,conta,arquivo_nome,arquivo_tipo,arquivo_tamanho,storage_path,status,criado_em")
        .order("criado_em", { ascending: false })
        .limit(100);
      if (error) throw error;
      setHistorico(data || []);
      if (data?.length) {
        const { data: detalhes, error: erroDetalhes } = await supabase
          .from("financeiro_extratos_arquivos_processados")
          .select("upload_id,status,registros_brutos,saldos_informativos,lancamentos_novos,lancamentos_repetidos")
          .in("upload_id", data.map(item => item.id));
        if (!erroDetalhes) {
          const resumo = {};
          for (const registro of detalhes || []) {
            const atual = resumo[registro.upload_id] || { arquivos: 0, brutos: 0, saldos: 0, novos: 0, repetidos: 0 };
            if (registro.status === "processado") {
              atual.arquivos += 1;
              atual.brutos += registro.registros_brutos || 0;
              atual.saldos += registro.saldos_informativos || 0;
              atual.novos += registro.lancamentos_novos || 0;
              atual.repetidos += registro.lancamentos_repetidos || 0;
            }
            resumo[registro.upload_id] = atual;
          }
          setResumosArquivos(resumo);
        }
      }
    } catch (error) {
      setAutorizado(false);
      setMensagem({ tipo: "erro", texto: "Não foi possível consultar os extratos: " + error.message });
    } finally {
      setCarregando(false);
    }
  }, [user?.id]);

  useEffect(() => { void atualizarHistorico(); }, [atualizarHistorico]);

  async function baixarArquivo(item) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(item.storage_path, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      setMensagem({ tipo: "erro", texto: "Falha ao abrir arquivo: " + error.message });
    }
  }

  async function chamarProcessamento(uploadId, mode, indices) {
    const { data, error } = await supabase.functions.invoke("financeiro-processar-extrato", {
      body: { uploadId, mode, ...(indices ? { indices } : {}) },
    });
    if (error) {
      let motivo = error.message || "Falha ao processar arquivo";
      if (error.context && typeof error.context.json === "function") {
        try { const body = await error.context.json(); motivo = body?.error || motivo; } catch { /* resposta sem JSON */ }
      }
      throw new Error(motivo);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }

  async function processarUpload(item) {
    if (processandoId || enviando) return;
    if (!["zip", "ofx"].includes(item.arquivo_tipo)) {
      setMensagem({ tipo: "erro", texto: "Processamento disponível para OFX ou ZIP contendo OFX." });
      return;
    }
    setProcessandoId(item.id);
    setMensagem(null);
    setAndamento({ id: item.id, total: 0, concluidos: 0, atual: "Lendo o arquivo original..." });
    try {
      const inicio = await chamarProcessamento(item.id, "inspect");
      const pendentes = (inicio.arquivos || [])
        .filter(arquivo => arquivo.status !== "processado")
        .map(arquivo => arquivo.index);
      if (!pendentes.length) {
        setMensagem({ tipo: "sucesso", texto: "Todos os OFXs deste upload já estavam processados." });
      } else {
        for (let i = 0; i < pendentes.length; i += 4) {
          const indices = pendentes.slice(i, i + 4);
          setAndamento({
            id: item.id,
            total: inicio.arquivos_total,
            concluidos: inicio.arquivos_processados + i,
            atual: "Processando arquivos " + (i + 1) + " a " + (i + indices.length) + " de " + pendentes.length,
          });
          const retorno = await chamarProcessamento(item.id, "process", indices);
          setAndamento({
            id: item.id, total: retorno.arquivos_total,
            concluidos: retorno.arquivos_processados,
            atual: retorno.concluido ? "Processamento concluído" : "Importação em andamento...",
          });
        }
        setMensagem({
          tipo: "sucesso",
          texto: "Extrato processado. Os lançamentos já podem ser consultados em Fluxo de Caixa. Linhas informativas de saldo não entram nos totais.",
        });
      }
    } catch (error) {
      setMensagem({
        tipo: "erro",
        texto: "Processamento interrompido: " + error.message + ". Os arquivos concluídos foram preservados; clique em Retomar processamento.",
      });
    } finally {
      setProcessandoId(null);
      await atualizarHistorico();
    }
  }

  async function importarArquivos(event) {
    event.preventDefault();
    if (!autorizado || !user?.id || enviando) return;
    if (bancoSelecionado.length < 2 || conta.trim().length < 2) {
      setMensagem({ tipo: "erro", texto: "Informe o banco e a conta para identificar o extrato." });
      return;
    }
    if (!arquivos.length) {
      setMensagem({ tipo: "erro", texto: "Selecione pelo menos um arquivo." });
      return;
    }
    setEnviando(true);
    setMensagem(null);
    const resultados = { novos: 0, repetidos: 0, erros: [] };
    for (const [indice, file] of arquivos.entries()) {
      setProgresso("Enviando " + (indice + 1) + " de " + arquivos.length + ": " + file.name);
      const extensao = file.name.split(".").pop().toLowerCase();
      if (!FORMATOS.has(extensao) || file.size === 0 || file.size > LIMITE_BYTES) {
        resultados.erros.push(file.name + ": formato inválido ou arquivo acima de 50 MB.");
        continue;
      }
      let caminho = null;
      try {
        const hash = await calcularHash(file);
        const { data: jaExiste, error: erroConsulta } = await supabase
          .from("financeiro_extratos_uploads").select("id")
          .eq("banco", bancoSelecionado).eq("conta", conta.trim())
          .eq("arquivo_sha256", hash).maybeSingle();
        if (erroConsulta) throw erroConsulta;
        if (jaExiste) { resultados.repetidos += 1; continue; }
        caminho = user.id + "/" + window.crypto.randomUUID() + "-" + nomeSeguro(file.name);
        const { error: erroUpload } = await supabase.storage.from(BUCKET)
          .upload(caminho, file, { upsert: false, contentType: file.type || "application/octet-stream" });
        if (erroUpload) throw erroUpload;
        const { error: erroRegistro } = await supabase.from("financeiro_extratos_uploads").insert({
          banco: bancoSelecionado,
          conta: conta.trim(),
          arquivo_nome: file.name,
          arquivo_tipo: extensao,
          arquivo_tamanho: file.size,
          arquivo_sha256: hash,
          storage_path: caminho,
          usuario_id: user.id,
        });
        if (erroRegistro) {
          await supabase.storage.from(BUCKET).remove([caminho]);
          caminho = null;
          if (erroRegistro.code === "23505") { resultados.repetidos += 1; continue; }
          throw erroRegistro;
        }
        resultados.novos += 1;
      } catch (error) {
        resultados.erros.push(file.name + ": " + error.message);
      }
    }
    setEnviando(false);
    setProgresso("");
    setArquivos([]);
    if (fileRef.current) fileRef.current.value = "";
    setMensagem({
      tipo: resultados.erros.length ? "erro" : "sucesso",
      texto: resultados.novos + " arquivo(s) recebido(s). " + resultados.repetidos + " duplicado(s) ignorado(s)." +
        (resultados.erros.length ? " Problemas: " + resultados.erros.slice(0, 3).join(" | ") : "") +
        (resultados.erros.length > 3 ? " (mais " + (resultados.erros.length - 3) + " erros)" : ""),
    });
    await atualizarHistorico();
  }

  if (carregando && autorizado === null) {
    return <div className="flex items-center gap-2 py-10 text-slate-500"><LoaderCircle className="h-5 w-5 animate-spin" /> Carregando extratos...</div>;
  }
  if (autorizado === false) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-600">Acesso financeiro restrito. Solicite autorização ao administrador.</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">Extratos Bancários</h2>
          <p className="text-sm text-slate-500">Recebimento e histórico de arquivos por banco e conta.</p>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-600">
          <span><strong className="text-slate-900">{resumo.arquivos}</strong> arquivos recentes</span>
          <span><strong className="text-slate-900">{resumo.bancos}</strong> contas</span>
        </div>
      </div>

      <form onSubmit={importarArquivos} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2 border-b border-slate-100 pb-4 text-slate-800">
          <UploadCloud className="h-5 w-5 text-[#6B1F87]" />
          <h3 className="font-semibold">Novo upload</h3>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700">Banco
            <select value={banco} onChange={(e) => setBanco(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none focus:border-purple-500">
              {BANCOS.map((nome) => <option key={nome} value={nome}>{nome}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-700">Conta / identificação
            <input value={conta} onChange={(e) => setConta(e.target.value)} placeholder="Ex.: 9254" maxLength={80}
              className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-purple-500" />
          </label>
          {banco === "Outro" && (
            <label className="block text-sm font-medium text-slate-700">Nome do banco
              <input value={outroBanco} onChange={(e) => setOutroBanco(e.target.value)} maxLength={80}
                className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none focus:border-purple-500" />
            </label>
          )}
        </div>
        <label className="mt-5 block cursor-pointer rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center transition hover:border-purple-300">
          <UploadCloud className="mx-auto mb-2 h-7 w-7 text-[#6B1F87]" />
          <span className="block text-sm font-semibold text-slate-800">Selecionar arquivos</span>
          <span className="block pt-1 text-xs text-slate-500">OFX, ZIP, CSV ou PDF · até 50 MB por arquivo · seleção múltipla</span>
          <input ref={fileRef} type="file" multiple accept=".ofx,.zip,.csv,.pdf" className="sr-only"
            onChange={(e) => setArquivos(Array.from(e.target.files || []))} />
        </label>
        {arquivos.length > 0 && (
          <div className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-700">
            {arquivos.length} arquivo(s) selecionado(s) · {moeda(arquivos.reduce((total, file) => total + file.size, 0))}
          </div>
        )}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-slate-500">Os arquivos ficam privados e aguardam validação antes de entrar no fluxo de caixa.</span>
          <button type="submit" disabled={enviando || !arquivos.length || !autorizado}
            className="inline-flex items-center gap-2 rounded-lg bg-[#6B1F87] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#55206d] disabled:cursor-not-allowed disabled:opacity-40">
            {enviando ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
            {enviando ? "Enviando..." : "Enviar extratos"}
          </button>
        </div>
        {progresso && <p role="status" className="mt-3 text-sm text-slate-600">{progresso}</p>}
        {mensagem && (
          <p role="status" className={"mt-3 rounded-lg p-3 text-sm " + (mensagem.tipo === "erro" ? "bg-amber-50 text-amber-800" : "bg-emerald-50 text-emerald-800")}>{mensagem.texto}</p>
        )}
      </form>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <Landmark className="h-4 w-4 text-[#6B1F87]" />
          <h3 className="font-semibold text-slate-800">Arquivos recebidos</h3>
          <span className="ml-auto text-xs text-slate-400">Últimos 100 envios · mantenha esta página aberta durante o processamento</span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr><th className="px-5 py-3">Arquivo</th><th className="px-5 py-3">Banco / Conta</th><th className="px-5 py-3">Enviado em</th><th className="px-5 py-3">Situação</th><th className="px-5 py-3 text-right">Ação</th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {historico.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2 font-medium text-slate-800">
                      {item.arquivo_tipo === "zip" ? <FileArchive className="h-4 w-4 shrink-0 text-slate-400" /> : <FileText className="h-4 w-4 shrink-0 text-slate-400" />}
                      <span className="max-w-72 truncate" title={item.arquivo_nome}>{item.arquivo_nome}</span>
                    </div>
                    <span className="ml-6 text-xs text-slate-400">{moeda(item.arquivo_tamanho)}</span>
                  </td>
                  <td className="px-5 py-3 text-slate-600">{item.banco} · {item.conta}</td>
                  <td className="whitespace-nowrap px-5 py-3 text-slate-600">{dataHora(item.criado_em)}</td>
                  <td className="px-5 py-3">
                    <span className={"rounded-md px-2 py-1 text-xs font-medium " +
                      (item.status === "processado" ? "bg-green-50 text-green-700" :
                        item.status === "erro" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                      {item.status === "recebido" ? "Aguardando processamento" :
                        item.status === "em_processamento" ? "Parcial" :
                        item.status === "processado" ? "Processado" :
                        item.status === "erro" ? "Verificar erro" : item.status}
                    </span>
                    {resumosArquivos[item.id] && (
                      <div className="mt-1 text-xs text-slate-500">
                        {resumosArquivos[item.id].novos.toLocaleString("pt-BR")} registros novos ·
                        {" "}{resumosArquivos[item.id].saldos.toLocaleString("pt-BR")} saldos informativos ·
                        {" "}{resumosArquivos[item.id].repetidos.toLocaleString("pt-BR")} repetidos
                      </div>
                    )}
                    {andamento?.id === item.id && processandoId === item.id && (
                      <div className="mt-2 text-xs font-medium text-purple-700" role="status">
                        {andamento.atual} ({andamento.concluidos}/{andamento.total || "?"})
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1">
                      {["zip", "ofx"].includes(item.arquivo_tipo) && item.status !== "processado" && (
                        <button type="button" disabled={Boolean(processandoId) || enviando}
                          onClick={() => processarUpload(item)}
                          className="inline-flex items-center gap-1 rounded-lg bg-[#43284F] px-3 py-2 text-xs font-semibold text-white hover:bg-[#5A3966] disabled:opacity-40">
                          {processandoId === item.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> :
                            item.status === "recebido" ? <Play className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
                          {processandoId === item.id ? "Processando" :
                            item.status === "recebido" ? "Processar extrato" : "Retomar"}
                        </button>
                      )}
                      <button type="button" onClick={() => baixarArquivo(item)} title="Baixar arquivo original"
                        className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[#6B1F87] hover:bg-purple-50">
                        <Download className="h-4 w-4" /> Baixar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!historico.length && <tr><td colSpan={5} className="px-5 py-12 text-center text-sm text-slate-400">{carregando ? "Carregando..." : "Nenhum extrato enviado ainda."}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
