import { supabase } from "../lib/supabase";
import JSZip from "jszip";

// ─────────────────────────────────────────────────────────────
// Etiquetas de envio dos marketplaces (arquivos ZPL)
//
// Cada marketplace entrega o lote de um jeito:
//   Magalu     — 1 arquivo .zpl com várias etiquetas (^XA ... ^XZ), o texto
//                vem hex-encodado no ^FD (_4e_6f_74_61 = "Nota")
//   Mercado L. — 1 arquivo .txt com várias etiquetas, NF em texto puro ("NF: 59174")
//   Via Varejo — 1 arquivo por etiqueta, tudo é imagem (^GFA); a NF só existe
//                no NOME do arquivo: AAAAMMDD_<chave>_<000059038>_<volume>.zpl
//
// O elo com o pedido é o número da NF. A chave de acesso da NF-e carrega o
// número dela nas posições 26–34, então o operador pode bipar a chave da caixa
// e achar a etiqueta sem depender do XML já ter sido importado.
// ─────────────────────────────────────────────────────────────

// Converte o texto hex do ZPL do Magalu (_4e_6f_74_61 -> "Nota")
function decodeHexZpl(s) {
  return String(s || "").replace(/_([0-9a-fA-F]{2})/g, (_, h) =>
    String.fromCharCode(parseInt(h, 16))
  );
}

// Extrai o número da NF de dentro da chave de acesso (44 dígitos).
// Layout: cUF(2) AAMM(4) CNPJ(14) mod(2) serie(3) nNF(9) tpEmis(1) cNF(8) cDV(1)
export function nfDaChave(chave) {
  const d = String(chave || "").replace(/\D/g, "");
  if (d.length !== 44) return null;
  const nnf = d.slice(25, 34);
  const n = parseInt(nnf, 10);
  return Number.isFinite(n) && n > 0 ? String(n) : null;
}

// Aceita tanto a chave de 44 dígitos quanto o número da NF digitado direto.
export function normalizarBuscaEtiqueta(entrada) {
  const bruto = String(entrada || "").trim();
  const digitos = bruto.replace(/\D/g, "");
  if (digitos.length === 44) {
    const nf = nfDaChave(digitos);
    return nf ? { nf, origem: "chave", chave: digitos } : { nf: null, origem: "chave_invalida" };
  }
  if (digitos.length >= 1 && digitos.length <= 12) {
    return { nf: String(parseInt(digitos, 10)), origem: "numero" };
  }
  return { nf: null, origem: "desconhecido" };
}

// Lê o nome do arquivo do Via Varejo: 20260803_52086661801_000059038_1.zpl
function nfDoNomeArquivo(nome) {
  const partes = String(nome || "").replace(/\.[^.]+$/, "").split("_");
  // procura de trás pra frente um bloco de 6+ dígitos que seja a NF
  for (let i = partes.length - 1; i >= 0; i--) {
    const p = partes[i];
    if (/^\d{6,12}$/.test(p)) {
      const n = parseInt(p, 10);
      if (n > 0) {
        const volPart = partes[i + 1];
        const volume = /^\d{1,3}$/.test(volPart || "") ? parseInt(volPart, 10) : 1;
        return { nf: String(n), volume };
      }
    }
  }
  return null;
}

// Quebra um arquivo ZPL em etiquetas individuais (^XA ... ^XZ)
function separarEtiquetas(texto) {
  const partes = String(texto || "").split("^XA");
  return partes
    .slice(1)
    .map(p => {
      const fim = p.indexOf("^XZ");
      const corpo = fim >= 0 ? p.slice(0, fim + 3) : p;
      return "^XA" + corpo;
    })
    .filter(z => z.trim().length > 20);
}

// Descobre NF, marketplace e identificadores de UMA etiqueta ZPL
function lerEtiqueta(zpl) {
  // Mercado Livre: NF em texto puro
  const meli = zpl.match(/\^FDNF:\s*(\d+)/);
  if (meli) {
    const sid = zpl.match(/"id":"(\d+)"/);
    return {
      numero_nf: String(parseInt(meli[1], 10)),
      marketplace: "Mercado Livre",
      tag_code: sid ? sid[1] : null,
      pedido_mkt: (zpl.match(/\^FD(1[0-9]{10})\^FS/) || [])[1] || null,
    };
  }
  // Magalu: texto hex-encodado
  const hex = zpl.match(/\^FD((?:_[0-9a-fA-F]{2})+)\^FS/g) || [];
  for (const bloco of hex) {
    const txt = decodeHexZpl(bloco);
    const m = txt.match(/Nota\s*Fiscal:\s*(\d+)/i);
    if (m) {
      const tag = zpl.match(/"tag_code":"([^"]+)"/);
      const ped = zpl.match(/"external_grouper_code":"([^"]+)"/);
      return {
        numero_nf: String(parseInt(m[1], 10)),
        marketplace: "Magazine Luiza",
        tag_code: tag ? tag[1] : null,
        pedido_mkt: ped ? ped[1] : null,
      };
    }
  }
  return null;
}

// Processa um arquivo (nome + conteúdo texto) e devolve as etiquetas achadas
function processarArquivo(nome, conteudo) {
  const etiquetas = separarEtiquetas(conteudo);
  if (!etiquetas.length) return [];

  // Via Varejo: arquivo único, todo em imagem — a NF vem do nome
  if (etiquetas.length === 1 && !lerEtiqueta(etiquetas[0])) {
    const doNome = nfDoNomeArquivo(nome);
    if (doNome) {
      return [{
        numero_nf: doNome.nf,
        volume: doNome.volume,
        marketplace: "Via Varejo",
        tag_code: null,
        pedido_mkt: null,
        zpl: etiquetas[0],
        arquivo_origem: nome,
      }];
    }
    return [];
  }

  const saida = [];
  etiquetas.forEach(z => {
    const info = lerEtiqueta(z);
    if (info) saida.push({ ...info, volume: 1, zpl: z, arquivo_origem: nome });
  });
  return saida;
}

// Lê os arquivos escolhidos (aceita .zip, .zpl, .txt) e devolve as etiquetas
export async function lerArquivosEtiquetas(files) {
  const achadas = [];
  const problemas = [];

  for (const file of files) {
    const nome = file.name;
    try {
      if (/\.zip$/i.test(nome)) {
        const zip = await JSZip.loadAsync(file);
        const nomes = Object.keys(zip.files).filter(n => !zip.files[n].dir);
        for (const interno of nomes) {
          if (/\.(pdf|png|jpg|jpeg)$/i.test(interno)) continue;  // Controle.pdf do Meli
          const txt = await zip.files[interno].async("string");
          const r = processarArquivo(interno.split("/").pop(), txt);
          if (r.length) achadas.push(...r);
          else problemas.push(`${nome} > ${interno}: nenhuma etiqueta reconhecida`);
        }
      } else {
        const txt = await file.text();
        const r = processarArquivo(nome, txt);
        if (r.length) achadas.push(...r);
        else problemas.push(`${nome}: nenhuma etiqueta reconhecida`);
      }
    } catch (e) {
      problemas.push(`${nome}: ${e.message}`);
    }
  }

  // Dedup dentro do próprio envio (mesma NF + volume no mesmo lote)
  const mapa = new Map();
  achadas.forEach(e => mapa.set(`${e.numero_nf}|${e.volume}`, e));

  return { etiquetas: [...mapa.values()], problemas };
}

// Grava o lote. Reenvio da mesma NF sobrescreve (cobre reemissão de etiqueta).
export async function salvarLoteEtiquetas(etiquetas, userId) {
  if (!etiquetas.length) return { ok: false, erro: "Nenhuma etiqueta para salvar." };

  const loteId = crypto.randomUUID();
  const agora  = new Date().toISOString();
  const linhas = etiquetas.map(e => ({
    numero_nf:      e.numero_nf,
    volume:         e.volume || 1,
    marketplace:    e.marketplace,
    zpl:            e.zpl,
    tag_code:       e.tag_code,
    pedido_mkt:     e.pedido_mkt,
    arquivo_origem: e.arquivo_origem,
    lote_id:        loteId,
    criado_em:      agora,
    criado_por:     userId || null,
  }));

  // Blocos de 200: lista grande num POST só estoura silenciosamente no PostgREST
  const BLOCO = 200;
  let gravadas = 0;
  for (let i = 0; i < linhas.length; i += BLOCO) {
    const { error } = await supabase
      .from("etiquetas_marketplace")
      .upsert(linhas.slice(i, i + BLOCO), { onConflict: "numero_nf,volume" });
    if (error) throw new Error(error.message);
    gravadas += Math.min(BLOCO, linhas.length - i);
  }

  return { ok: true, loteId, gravadas };
}

// Busca a etiqueta pela chave da NF (ou pelo número dela).
// Não depende de o pedido já existir: a NF sai da própria chave bipada.
export async function buscarEtiqueta(entrada) {
  const { nf, origem } = normalizarBuscaEtiqueta(entrada);
  if (!nf) {
    return {
      ok: false,
      erro: origem === "chave_invalida"
        ? "Chave inválida — confira se são os 44 dígitos."
        : "Bipe a chave da NF (44 dígitos) ou digite o número da nota.",
    };
  }

  const { data, error } = await supabase
    .from("etiquetas_marketplace")
    .select("*")
    .eq("numero_nf", nf)
    .order("volume");
  if (error) throw new Error(error.message);

  if (!data?.length) {
    return { ok: false, nf, erro: `Nenhuma etiqueta no sistema para a NF ${nf}. O lote já foi enviado?` };
  }
  return { ok: true, nf, etiquetas: data };
}

// Marca a etiqueta como impressa (mantém o contador para saber de reimpressão)
export async function registrarImpressao(etiquetaId, userId) {
  const { data: atual } = await supabase
    .from("etiquetas_marketplace")
    .select("total_impressoes")
    .eq("id", etiquetaId)
    .maybeSingle();

  const { error } = await supabase
    .from("etiquetas_marketplace")
    .update({
      impresso_em: new Date().toISOString(),
      impresso_por: userId || null,
      total_impressoes: (atual?.total_impressoes || 0) + 1,
    })
    .eq("id", etiquetaId);
  if (error) throw new Error(error.message);
}

// Gera o download do .zpl de uma etiqueta (a Zebra imprime o arquivo direto).
export function baixarZpl(etiqueta) {
  const blob = new Blob([etiqueta.zpl], { type: "application/octet-stream" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `etiqueta_NF${etiqueta.numero_nf}${etiqueta.volume > 1 ? `_v${etiqueta.volume}` : ""}.zpl`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Resumo dos últimos lotes enviados (tela de upload)
export async function listarLotes(limite = 10) {
  const { data, error } = await supabase
    .from("etiquetas_marketplace")
    .select("lote_id, marketplace, criado_em, numero_nf, impresso_em")
    .order("criado_em", { ascending: false })
    .limit(2000);
  if (error) throw new Error(error.message);

  const mapa = {};
  (data || []).forEach(r => {
    const k = r.lote_id || "—";
    if (!mapa[k]) mapa[k] = { lote_id: k, criado_em: r.criado_em, marketplaces: {}, total: 0, impressas: 0 };
    mapa[k].total++;
    if (r.impresso_em) mapa[k].impressas++;
    const m = r.marketplace || "—";
    mapa[k].marketplaces[m] = (mapa[k].marketplaces[m] || 0) + 1;
    if (r.criado_em > mapa[k].criado_em) mapa[k].criado_em = r.criado_em;
  });

  return Object.values(mapa)
    .sort((a, b) => (b.criado_em > a.criado_em ? 1 : -1))
    .slice(0, limite);
}