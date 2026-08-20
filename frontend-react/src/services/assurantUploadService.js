import Papa from "papaparse";
import { supabase } from "../lib/supabase";


const TAMANHO_LOTE_INICIAL = 100;
const MAX_TENTATIVAS = 3;
const PAUSA_ENTRE_LOTES_MS = 50;


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
  if (
    !valor ||
    valor === "N/A" ||
    valor === ""
  ) {
    return null;
  }

  const texto = String(valor).trim();
  const [parteData, parteHora] =
    texto.split(" ");
  const partes = parteData.split("/");

  if (partes.length !== 3) {
    return null;
  }

  const [dia, mes, ano] = partes;
  const data = new Date(
    `${ano}-${mes}-${dia}` +
    `T${parteHora || "00:00:00"}`
  );

  if (Number.isNaN(data.getTime())) {
    return null;
  }

  return data.toISOString();
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

    local:
      textoOuNull(
        row["Local"]
      ),

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


async function executarUpsertComRepeticao(
  rows
) {
  let ultimoErro = null;

  for (
    let tentativa = 1;
    tentativa <= MAX_TENTATIVAS;
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

    if (
      !erroPodeRepetir(error) ||
      tentativa === MAX_TENTATIVAS
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
      erroPodeRepetir(erro) &&
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
export async function previewTriagemAssurant(
  file
) {
  return new Promise(
    (resolve, reject) => {
      const previewRows = [];
      let totalRows = 0;
      let headers = null;

      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "ISO-8859-1",
        delimiter: ";",

        step: (result, parser) => {
          if (!headers) {
            headers = Object.keys(
              result.data
            );
          }

          if (totalRows === 0) {
            const obrigatorias = [
              "Voucher",
              "IMEI",
              "Tipo_de_Rede",
              "Data_Recebimento",
            ];

            const faltando =
              obrigatorias.filter(
                (coluna) =>
                  !headers.includes(coluna)
              );

            if (faltando.length > 0) {
              parser.abort();

              reject(
                new Error(
                  "Colunas obrigatórias não encontradas: " +
                  faltando.join(", ")
                )
              );

              return;
            }
          }

          totalRows += 1;

          if (previewRows.length < 5) {
            const row = result.data;

            previewRows.push({
              Voucher:
                row["Voucher"],

              IMEI:
                row["IMEI"],

              Modelo:
                row["Modelo"],

              Tipo_de_Rede:
                row["Tipo_de_Rede"],

              Grade:
                row["Grade"],

              Status_Gaia:
                row["Status_atual"],

              Status_Liquida:
                statusGaiaParaLiquida(
                  row["Status_atual"]
                ),

              Data_Recebimento:
                row["Data_Recebimento"],
            });
          }
        },

        complete: () => {
          resolve({
            totalRows,
            previewRows,
          });
        },

        error: (erro) => {
          reject(
            new Error(erro.message)
          );
        },
      });
    }
  );
}


// ── Upload com repetição e divisão adaptativa dos lotes ──
export async function uploadTriagemAssurant(
  file,
  userId,
  mesReferencia,
  onProgress
) {
  const allRows = await new Promise(
    (resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "ISO-8859-1",
        delimiter: ";",

        complete: (results) => {
          resolve(
            results.data || []
          );
        },

        error: (erro) => {
          reject(
            new Error(erro.message)
          );
        },
      });
    }
  );

  const registros = allRows
    .map((row) =>
      parseRow(
        row,
        userId,
        mesReferencia
      )
    )
    .filter((row) =>
      row.voucher || row.imei
    );

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