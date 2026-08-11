import JsBarcode from "jsbarcode";
import { jsPDF } from "jspdf";
import { supabase } from "../lib/supabase";


export const ETAPAS_BIPAGEM = [
  {
    id: "rua",
    rotulo: "Rua",
    exemplo: "RUA01",
  },
  {
    id: "bloco",
    rotulo: "Bloco",
    exemplo: "BL01",
  },
  {
    id: "andar",
    rotulo: "Andar",
    exemplo: "AD05",
  },
  {
    id: "coluna",
    rotulo: "Coluna",
    exemplo: "COLA",
  },
  {
    id: "linha",
    rotulo: "Linha",
    exemplo: "LIN01",
  },
];


function jsonSeguro(valor) {
  if (!valor) {
    return {};
  }

  if (typeof valor === "object") {
    return valor;
  }

  try {
    return JSON.parse(valor);
  } catch {
    return {};
  }
}


function normalizarTriagem(triagem, laudo = null) {
  const respostas =
    jsonSeguro(triagem?.respostas_funcional);

  return {
    ...triagem,

    produto: {
      marca:
        respostas?.produto?.marca || null,

      modelo:
        respostas?.produto?.modelo ||
        triagem?.modelo ||
        null,

      armazenamento:
        respostas?.produto?.armazenamento ||
        null,

      cor:
        respostas?.produto?.cor ||
        null,
    },

    respostasFuncionais:
      respostas?.respostas || [],

    destinoFuncional:
      respostas?.destino || null,

    laudo,
  };
}


export async function listarAguardandoArmazenagem() {
  const { data, error } = await supabase

    .from("assurant_triagem")

    .select(`
      voucher,
      imei,
      sku,
      modelo,
      grade,
      grade_cosmetica,
      respostas_funcional,
      data_cosmetico
    `)

    .eq(
      "status_atual",
      "Aguardando armazenagem"
    )

    .eq(
      "origem_triagem",
      "liquida"
    )

    .order(
      "data_cosmetico",
      {
        ascending: true,
        nullsFirst: false,
      }
    )

    .limit(100);


  if (error) {
    throw new Error(error.message);
  }


  return (data || []).map(
    (triagem) =>
      normalizarTriagem(triagem)
  );
}


export async function buscarDetalhesArmazenagem(
  voucher
) {
  const codigo =
    String(voucher || "")
      .trim()
      .toUpperCase();


  const { data: triagem, error } =
    await supabase

      .from("assurant_triagem")

      .select(`
        id,
        voucher,
        imei,
        sku,
        modelo,
        status_atual,
        local,
        grade,
        grade_cosmetica,
        tela,
        laterais,
        traseira,
        status_bateria,
        bateria_percentual,
        resultado_triagem_funcional,
        defeitos_adicionais,
        respostas_funcional,
        data_funcional,
        data_laudo,
        data_cosmetico
      `)

      .eq(
        "voucher",
        codigo
      )

      .maybeSingle();


  if (error) {
    throw new Error(error.message);
  }


  if (!triagem) {
    throw new Error(
      `Voucher ${codigo} não encontrado na triagem.`
    );
  }


  let laudo = null;


  if (triagem.data_laudo) {
    const { data } = await supabase

      .from("triagem_laudos")

      .select(`
        motivo,
        divergencias,
        defeitos,
        observacao,
        qtd_fotos,
        criado_em
      `)

      .eq(
        "voucher",
        codigo
      )

      .order(
        "criado_em",
        {
          ascending: false,
        }
      )

      .limit(1)

      .maybeSingle();


    laudo = data || null;
  }


  return normalizarTriagem(
    triagem,
    laudo
  );
}


export async function reservarEndereco(
  voucher,
  userId
) {
  const detalhes =
    await buscarDetalhesArmazenagem(
      voucher
    );


  const { data, error } =
    await supabase.rpc(
      "wms_reservar_endereco",
      {
        p_voucher:
          String(voucher || "")
            .trim()
            .toUpperCase(),

        p_usuario:
          userId,
      }
    );


  if (error) {
    throw new Error(error.message);
  }


  if (!data?.ok) {
    throw new Error(
      data?.erro ||
      "Não foi possível reservar um endereço."
    );
  }


  return {
    ...data,
    detalhes,
  };
}


export async function registrarBipagem(
  reservaId,
  etapa,
  codigo,
  userId
) {
  const { data, error } =
    await supabase.rpc(
      "wms_registrar_bipagem",
      {
        p_reserva:
          reservaId,

        p_etapa:
          etapa,

        p_codigo:
          codigo,

        p_usuario:
          userId,
      }
    );


  if (error) {
    throw new Error(error.message);
  }


  return data || {
    ok: false,
    erro:
      "A bipagem não retornou resultado.",
  };
}


export async function cancelarReserva(
  reservaId,
  userId
) {
  const { data, error } =
    await supabase.rpc(
      "wms_cancelar_reserva",
      {
        p_reserva:
          reservaId,

        p_usuario:
          userId,
      }
    );


  if (error) {
    throw new Error(error.message);
  }


  return data || {
    ok: false,
    erro:
      "O cancelamento não retornou resultado.",
  };
}


export function enderecoExibicao(
  endereco
) {
  if (!endereco) {
    return "—";
  }


  const rua =
    String(endereco.rua)
      .padStart(2, "0");


  const bloco =
    String(endereco.bloco)
      .padStart(2, "0");


  const andar =
    String(endereco.andar)
      .padStart(2, "0");


  const linha =
    String(endereco.linha)
      .padStart(2, "0");


  return (
    `RUA ${rua} · ` +
    `BL ${bloco} · ` +
    `AD ${andar} · ` +
    `AP ${endereco.coluna}${linha}`
  );
}


function barcodePng(codigo) {
  const canvas =
    document.createElement("canvas");


  JsBarcode(
    canvas,
    String(codigo || ""),
    {
      format: "CODE128",
      width: 2,
      height: 52,
      displayValue: false,
      margin: 0,
      background: "#ffffff",
      lineColor: "#000000",
    }
  );


  return canvas.toDataURL(
    "image/png"
  );
}


function escreverTexto(
  doc,
  valor,
  x,
  y,
  tamanho = 8,
  estilo = "normal",
  opcoes = {}
) {
  doc.setFont(
    "helvetica",
    estilo
  );

  doc.setFontSize(
    tamanho
  );

  doc.text(
    String(valor || "—"),
    x,
    y,
    opcoes
  );
}


export function gerarEtiquetaArmazenagem({
  detalhes,
  endereco,
}) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [105, 50],
    compress: true,
  });


  const produto =
    detalhes?.produto || {};


  const voucher =
    detalhes?.voucher || "";


  const imei =
    detalhes?.imei || "";


  const sku =
    detalhes?.sku || "—";


  const gradeFisica =
    endereco?.grade_fisica ||
    detalhes?.grade_cosmetica ||
    detalhes?.grade ||
    "—";


  /*
   * Contorno da etiqueta.
   */
  doc.setDrawColor(0);
  doc.setLineWidth(0.25);

  doc.rect(
    1.5,
    1.5,
    102,
    47
  );


  /*
   * Linha que separa os dados do endereço.
   */
  doc.line(
    68,
    1.5,
    68,
    48.5
  );


  escreverTexto(
    doc,
    "ARMAZENAGEM WMS",
    4,
    5.2,
    6.5,
    "bold"
  );


  escreverTexto(
    doc,
    `VOUCHER: ${voucher}`,
    4,
    9,
    7.5,
    "bold"
  );


  /*
   * Código de barras do voucher.
   */
  if (voucher) {
    doc.addImage(
      barcodePng(voucher),
      "PNG",
      4,
      10.2,
      60.5,
      8.2
    );
  }


  const nomeProduto =
    [
      produto.marca,
      produto.modelo,
    ]
      .filter(Boolean)
      .join(" ") ||

    detalhes?.modelo ||

    "PRODUTO NÃO INFORMADO";


  escreverTexto(
    doc,
    nomeProduto.slice(0, 38),
    4,
    21.5,
    8,
    "bold"
  );


  escreverTexto(
    doc,
    [
      produto.armazenamento,
      produto.cor,
    ]
      .filter(Boolean)
      .join(" ") || "—",
    4,
    25,
    6.5
  );


  /*
   * O SKU aparece apenas como texto.
   * Não possui código de barras.
   */
  escreverTexto(
    doc,
    `SKU: ${sku}`,
    4,
    28.2,
    6.2
  );


  escreverTexto(
    doc,
    `IMEI: ${imei || "—"}`,
    4,
    32.2,
    7,
    "bold"
  );


  /*
   * Código de barras do IMEI.
   */
  if (imei) {
    doc.addImage(
      barcodePng(imei),
      "PNG",
      4,
      33.5,
      60.5,
      9.2
    );
  }


  escreverTexto(
    doc,
    imei,
    34.2,
    46.3,
    6,
    "normal",
    {
      align: "center",
    }
  );


  /*
   * Quadrado para colar a bolinha do grade.
   */
  escreverTexto(
    doc,
    "GRADE",
    71,
    5.2,
    6,
    "bold"
  );


  doc.rect(
    71,
    7,
    17,
    17
  );


  escreverTexto(
    doc,
    gradeFisica,
    79.5,
    27.2,
    6,
    "bold",
    {
      align: "center",
      maxWidth: 24,
    }
  );


  /*
   * Rua.
   */
  escreverTexto(
    doc,
    `RUA ${String(
      endereco?.rua || ""
    ).padStart(2, "0")}`,
    91.5,
    9.5,
    10,
    "bold",
    {
      align: "center",
    }
  );


  /*
   * Bloco.
   */
  escreverTexto(
    doc,
    `BL ${String(
      endereco?.bloco || ""
    ).padStart(2, "0")}`,
    91.5,
    15.2,
    9,
    "bold",
    {
      align: "center",
    }
  );


  /*
   * Andar.
   */
  escreverTexto(
    doc,
    `AD ${String(
      endereco?.andar || ""
    ).padStart(2, "0")}`,
    91.5,
    21,
    11,
    "bold",
    {
      align: "center",
    }
  );


  /*
   * Apartamento destacado.
   */
  doc.setFillColor(0);

  doc.rect(
    70.5,
    30,
    31,
    15.5,
    "F"
  );


  doc.setTextColor(255);


  escreverTexto(
    doc,
    `AP ${endereco?.coluna || ""}${String(
      endereco?.linha || ""
    ).padStart(2, "0")}`,
    86,
    40.3,
    16,
    "bold",
    {
      align: "center",
    }
  );


  doc.setTextColor(0);


  return doc;
}


export function baixarEtiquetaArmazenagem(
  dados
) {
  const doc =
    gerarEtiquetaArmazenagem(
      dados
    );


  const endereco =
    dados?.endereco || {};


  const rua =
    String(
      endereco.rua || ""
    ).padStart(2, "0");


  const bloco =
    String(
      endereco.bloco || ""
    ).padStart(2, "0");


  const andar =
    String(
      endereco.andar || ""
    ).padStart(2, "0");


  const linha =
    String(
      endereco.linha || ""
    ).padStart(2, "0");


  const nomeEndereco =
    `R${rua}` +
    `-BL${bloco}` +
    `-AD${andar}` +
    `-AP${endereco.coluna || ""}${linha}`;


  const nomeArquivo =
    `etiqueta_` +
    `${dados?.detalhes?.voucher || "voucher"}` +
    `_${nomeEndereco}.pdf`;


  doc.save(
    nomeArquivo
  );
}