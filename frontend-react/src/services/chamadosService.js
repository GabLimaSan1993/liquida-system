import { supabase } from "../lib/supabase.js";

export const STATUS_CHAMADOS = {
  aberto: "Aberto", em_analise: "Em análise", em_desenvolvimento: "Em desenvolvimento",
  aguardando_informacoes: "Aguardando informações", concluido: "Concluído", cancelado: "Cancelado",
};
export const TIPOS_CHAMADOS = { melhoria: "Melhoria", correcao: "Correção de erro", solicitacao: "Solicitação" };
export const PRIORIDADES_CHAMADOS = { baixa: "Baixa", normal: "Normal", alta: "Alta", urgente: "Urgente" };
export const ACEITE_ANEXOS = ".png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip,.ppt,.pptx";
const BUCKET = "sistema-chamados";

export function validarAnexos(files, existentes = 0) {
  if (files.length + existentes > 10) throw new Error("Cada chamado pode ter até 10 anexos.");
  for (const file of files) {
    if (!/\.(png|jpe?g|webp|gif|pdf|docx?|xlsx?|csv|txt|zip|pptx?)$/i.test(file.name)) throw new Error(`Formato não permitido: ${file.name}`);
    if (!file.size || file.size > 20 * 1024 * 1024) throw new Error(`O arquivo ${file.name} deve ter entre 1 byte e 20 MB.`);
    if (file.name.length > 240) throw new Error("O nome do arquivo deve ter até 240 caracteres.");
  }
}

export async function listarChamados() {
  const result = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("sistema_chamados").select("*").order("criado_em", { ascending: false }).order("id").range(offset, offset + 999);
    if (error) throw error;
    result.push(...data);
    if (data.length < 1000) return result;
  }
}

export async function detalhesChamado(id) {
  const results = await Promise.all([
    supabase.from("sistema_chamado_eventos").select("*").eq("chamado_id", id).order("criado_em").order("id"),
    supabase.from("sistema_chamado_anexos").select("*").eq("chamado_id", id).order("criado_em"),
  ]);
  for (const result of results) if (result.error) throw result.error;
  return { eventos: results[0].data, anexos: results[1].data };
}

export async function anexarArquivos(chamadoId, files, existentes = 0) {
  validarAnexos(files, existentes);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw error || new Error("Sua sessão expirou. Entre novamente.");
  const falhas = [];
  for (const file of files) {
    const ext = file.name.split(".").pop().toLowerCase();
    const caminho = `${chamadoId}/${user.id}/${crypto.randomUUID()}.${ext}`;
    try {
      const upload = await supabase.storage.from(BUCKET).upload(caminho, file, { upsert: false, contentType: file.type || "application/octet-stream" });
      if (upload.error) throw upload.error;
      const registro = await supabase.from("sistema_chamado_anexos").insert({ chamado_id: chamadoId, nome: file.name, caminho, tamanho: file.size, mime_type: file.type || "application/octet-stream" });
      if (registro.error) {
        await supabase.storage.from(BUCKET).remove([caminho]);
        throw registro.error;
      }
    } catch (err) { falhas.push({ nome: file.name, motivo: err.message }); }
  }
  return falhas;
}

export async function criarChamado(campos, files) {
  validarAnexos(files);
  const { data, error } = await supabase.from("sistema_chamados").insert(campos).select().single();
  if (error) throw error;
  // A failed attachment never hides an already created ticket or creates a duplicate on retry.
  let falhas;
  try { falhas = await anexarArquivos(data.id, files); }
  catch (err) { falhas = files.map(file => ({ nome: file.name, motivo: err.message })); }
  return { chamado: data, falhas };
}

export async function atualizarStatus(id, status) {
  const { data, error } = await supabase.from("sistema_chamados").update({ status }).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
export async function comentarChamado(id, texto) {
  const { error } = await supabase.from("sistema_chamado_eventos").insert({ chamado_id: id, texto: texto.trim() });
  if (error) throw error;
}
export async function baixarAnexo(anexo) {
  const { data, error } = await supabase.storage.from(BUCKET).download(anexo.caminho);
  if (error) throw error;
  const url = URL.createObjectURL(data);
  const link = document.createElement("a");
  link.href = url; link.download = anexo.nome; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
