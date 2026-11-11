import * as XLSX from "xlsx";
import { lerArquivoGaiaTriagem } from "./gaiaTriagemArquivoReader.js";
import { supabase } from "../lib/supabase";

/*
 * 500 registros reduzem uma carga de 160 mil linhas
 * de aproximadamente 1.600 chamadas para cerca de 320.
 * Se o banco não suportar um lote desse tamanho, a rotina
 * divide automaticamente o lote até ele ser processado.
 */
const TAMANHO_LOTE_INICIAL = 100;
const MAX_TENTATIVAS_REDE = 3;
const PAUSA_ENTRE_LOTES_MS = 25;

function aguardar(tempoMs) {
  return new Promise((resolve) => {
    setTimeout(resolve, tempoMs);
  });
}

function textoOuNull(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const texto = String(valor).trim();
  return texto || null;
}

function identificadorOuNull(valor) {
  const texto = textoOuNull(valor);

  return texto
    ? texto.toUpperCase()
    : null;
}

function textoComparacao(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/*
 * Enquanto as triagens continuam sendo realizadas no Gaia,
 * o status recebido no relatório é a fonte de verdade.
 *
 * Os dois status abaixo representam que o produto já pode
 * entrar no fluxo físico do novo WMS.
 */
function statusGaiaParaLiquida(valor) {
  const statusOriginal = textoOuNull(valor);
  const statusNormalizado =
    textoComparacao(statusOriginal);

  if (
    statusNormalizado === "aguardando alocacao" ||
    statusNormalizado === "aguardando locacao"
  ) {
    return "Aguardando armazenagem";
  }

  return statusOriginal;
}

function parseDate(valor) {
  if (valor == null || valor === "" || valor === "N/A") return null;
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? null : valor.toISOString();

  // Datas numéricas são comuns em XLSX; não podem ser tratadas como "dd/mm/aaaa".
  const texto = String(valor).trim();
  if (/^\\d{5}(?:\\.\\d+)?$/.test(texto)) {
    const excel = XLSX.SSF.parse_date_code(Number(texto));
    if (excel?.y && excel?.m && excel?.d) {
      return new Date(Date.UTC(excel.y,excel.m-1,excel.d,excel.H||0,excel.M||0,excel.S||0)).toISOString();
    }
  }

  const partes = texto.match(/^(\\d{1,2})\\/(\\d{1,2})\\/(\\d{2,4})(?:\\s+(\\d{1,2}:\\d{2}(?::\\d{2})?))?/);
  if (partes) {
    const dia=partes[1].padStart(2,'0');
    const mes=partes[2].padStart(2,'0');
    const ano=partes[3].length===2 ? '20'+partes[3] : partes[3];
    const hora=partes[4] ? (partes[4].length===5?partes[4]+':00':partes[4]) : '00:00:00';
    const data=new Date(ano+'-'+mes+'-'+dia+'T'+hora);
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }

  // Algumas abas já trazem datas ISO.
  if (/^\\d{4}-\\d{2}-\\d{2}/.test(texto)) {
    const data=new Date(texto.replace(' ','T'));
    return Number.isNaN(data.getTime()) ? null : data.toISOString();
  }
  return null;
}
function parseRow(
  row,
  userId,
  mesReferencia
) {
  return {
    voucher:
      identificadorOuNull(
        row["Voucher"]
      ),

    imei:
      textoOuNull(
        row["IMEI"]
      ),

    sku:
      identificadorOuNull(
        row["SKU"]
      ),

    modelo:
      textoOuNull(
        row["Modelo"]
      ),

    // A importação GAIA é operacional, sem alteração de endereço físico.
    // As posições oficiais permanecem sob gestão do Liquida WMS.
    local: null,

    cliente:
      textoOuNull(
        row["Cliente"]
      ),

    loja:
      textoOuNull(
        row["Loja"]
      ),

    rede:
      textoOuNull(
        row["Rede"]
      ),

    tipo_de_rede:
      textoOuNull(
        row["Tipo_de_Rede"]
      ),

    lote:
      textoOuNull(
        row["Lote"]
      ),

    status_atual:
      statusGaiaParaLiquida(
        row["Status_atual"]
      ),

    condicao:
      textoOuNull(
        row["Condicao"]
      ),

    triagem_funcional:
      textoOuNull(
        row["Triagem_funcional"]
      ),

    grade:
      textoOuNull(
        row["Grade"]
      ),

    criado_em:
      parseDate(
        row["Criado_em"]
      ),

    atualizado_em:
      parseDate(
        row["Atualizado_em"]
      ),

    tela:
      textoOuNull(
        row["Tela"]
      ),

    laterais:
      textoOuNull(
        row["Laterais"]
      ),

    traseira:
      textoOuNull(
        row["Traseira"]
      ),

    defeitos_adicionais:
      textoOuNull(
        row["Defeitos_Adicionais"]
      ),

    resultado_triagem_funcional:
      textoOuNull(
        row["Resultado_Triagem_Funcional"]
      ),

    data_recebimento:
      parseDate(
        row["Data_Recebimento"]
      ),

    data_funcional:
      parseDate(
        row["Data_Funcional"]
      ),

    data_cosmetico:
      parseDate(
        row["Data_Cosmetico"]
      ),

    data_laudo:
      parseDate(
        row["Data_Laudo"]
      ),

    data_alocacao:
      parseDate(
        row["Data_Alocacao"]
      ),

    data_oracle:
      parseDate(
        row["Data_Oracle"]
      ),

    respostas_funcional:
      row["Respostas_Funcional"] ||
      null,

    status_bateria:
      textoOuNull(
        row["status_bateria"]
      ),

    reanalise:
      textoOuNull(
        row["Reanalise"]
      ),

    aging:
      textoOuNull(
        row["Aging"]
      ),

    uploaded_by:
      userId,

    mes_referencia:
      mesReferencia,
  };
}

function erroPodeRepetir(erro) {
  const mensagem = String(
    erro?.message ||
    erro ||
    ""
  ).toLowerCase();

  const status = Number(
    erro?.status ||
    erro?.statusCode ||
    0
  );

  return (
    mensagem.includes("statement timeout") ||
    mensagem.includes("canceling statement") ||
    mensagem.includes("failed to fetch") ||
    mensagem.includes("network") ||
    mensagem.includes("fetch") ||
    mensagem.includes("gateway") ||
    mensagem.includes("temporarily unavailable") ||
    status === 408 ||
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  );
}

function erroDeTimeoutBanco(erro) {
  const mensagem = String(
    erro?.message ||
    erro ||
    ""
  ).toLowerCase();

  return (
    mensagem.includes("statement timeout") ||
    mensagem.includes("canceling statement")
  );
}

async function executarUpsertComRepeticao(
  rows
) {
  let ultimoErro = null;

  for (
    let tentativa = 1;
    tentativa <= MAX_TENTATIVAS_REDE;
    tentativa += 1
  ) {
    const { error } = await supabase.rpc(
      "upsert_triagem",
      {
        rows,
      }
    );

    if (!error) {
      return;
    }

    ultimoErro = error;

    /*
     * Repetir o mesmo lote que excedeu o tempo do banco
     * apenas atrasaria a carga. Devolve imediatamente o erro
     * para que enviarLoteAdaptativo divida o lote ao meio.
     */
    if (erroDeTimeoutBanco(error)) {
      throw error;
    }

    if (
      !erroPodeRepetir(error) ||
      tentativa === MAX_TENTATIVAS_REDE
    ) {
      break;
    }

    await aguardar(
      500 * tentativa
    );
  }

  throw ultimoErro || new Error(
    "O banco não retornou o resultado do lote."
  );
}

/*
 * Se um lote continuar excedendo o tempo máximo do banco,
 * ele é dividido ao meio até que as partes sejam processadas.
 *
 * O upsert é idempotente: repetir uma parte não duplica
 * o produto quando a função SQL está configurada corretamente.
 */
async function enviarLoteAdaptativo({
  rows,
  inicio,
  aoConcluir,
}) {
  try {
    await executarUpsertComRepeticao(
      rows
    );

    aoConcluir(rows.length);
  } catch (erro) {
    if (
      erroDeTimeoutBanco(erro) &&
      rows.length > 1
    ) {
      const metade = Math.ceil(
        rows.length / 2
      );

      await enviarLoteAdaptativo({
        rows: rows.slice(0, metade),
        inicio,
        aoConcluir,
      });

      await enviarLoteAdaptativo({
        rows: rows.slice(metade),
        inicio: inicio + metade,
        aoConcluir,
      });

      return;
    }

    const fim =
      inicio + rows.length;

    throw new Error(
      `Erro no batch ${inicio}-${fim}: ` +
      `${erro?.message || erro}`
    );
  }
}

// ── Preview ───────────────────────────────────────────────

export async function previewTriagemAssurant(file) {
  const documento = await lerArquivoGaiaTriagem(file);
  const previewRows = documento.rows.slice(0, 5).map(row => ({
    Voucher: row["Voucher"],
    IMEI: row["IMEI"],
    Modelo: row["Modelo"],
    Tipo_de_Rede: row["Tipo_de_Rede"],
    Grade: row["Grade"],
    Status_Gaia: row["Status_atual"],
    Status_Liquida: statusGaiaParaLiquida(row["Status_atual"]),
    Data_Recebimento: row["Data_Recebimento"],
  }));
  return {
    totalRows: documento.rows.length,
    previewRows,
    formato: documento.source,
    aba: documento.sheet,
    linhaCabecalho: documento.headerRow,
    descartadas: documento.ignored,
    avisos: [
      ...(documento.ignored>0
        ? [documento.ignored+' linhas sem voucher serão ignoradas (o banco exige voucher).']
        : []),
      ...(documento.missingRecommended.length
        ? ['Colunas opcionais não localizadas: '+documento.missingRecommended.join(', ')+'.']
        : []),
    ],
  };
}

// ── Upload com repetição e divisão adaptativa dos lotes ──

export async function uploadTriagemAssurant(
  file,
  userId,
  mesReferencia,
  onProgress
) {
  const documento = await lerArquivoGaiaTriagem(file);
  const registros = documento.rows
    .map(row => parseRow(row,userId,mesReferencia))
    .filter(row => row.voucher); // upsert_triagem requer voucher como chave

  const total = registros.length;
  let inserted = 0;

  if (total === 0) {
    throw new Error(
      "Nenhum registro válido foi encontrado no arquivo."
    );
  }

  const notificarProgresso =
    (quantidade) => {
      inserted += quantidade;

      onProgress?.({
        inserted,
        duplicates: 0,
        total,
      });
    };

  for (
    let inicio = 0;
    inicio < total;
    inicio += TAMANHO_LOTE_INICIAL
  ) {
    const rows = registros.slice(
      inicio,
      inicio + TAMANHO_LOTE_INICIAL
    );

    await enviarLoteAdaptativo({
      rows,
      inicio,
      aoConcluir:
        notificarProgresso,
    });

    if (
      inicio + TAMANHO_LOTE_INICIAL < total
    ) {
      await aguardar(
        PAUSA_ENTRE_LOTES_MS
      );
    }
  }

  return {
    inserted,
    duplicates: 0,
    total,
  };
}