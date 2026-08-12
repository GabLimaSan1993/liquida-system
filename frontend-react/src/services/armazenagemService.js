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


/*
 * Organiza os dados do produto.
 *
 * Primeiro tenta utilizar as informações da triagem.
 * Se elas estiverem vazias, busca no catálogo pelo SKU.
 *
 * Isso corrige os vouchers antigos, que guardavam
 * tudo dentro do campo modelo.
 */
function normalizarTriagem(
  triagem,
  laudo = null,
  catalogo = null
) {
  const respostas =
    jsonSeguro(
      triagem?.respostas_funcional
    );

  return {
    ...triagem,

    produto: {
      marca:
        respostas?.produto?.marca ||
        catalogo?.marca ||
        null,

      modelo:
        respostas?.produto?.modelo ||
        catalogo?.modelo ||
        triagem?.modelo ||
        null,

      armazenamento:
        respostas?.produto?.armazenamento ||
        catalogo?.capacidade ||
        null,

      cor:
        respostas?.produto?.cor ||
        catalogo?.cor ||
        null,
    },

    respostasFuncionais:
      respostas?.respostas || [],

    destinoFuncional:
      respostas?.destino || null,

    laudo,
  };
}


/*
 * Lista os produtos que estão aguardando
 * a etapa de armazenagem.
 */
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


/*
 * Busca todas as informações do produto
 * que será armazenado.
 */
export async function buscarDetalhesArmazenagem(
  voucher
) {
  const codigo =
    String(voucher || "")
      .trim()
      .toUpperCase();


  const {
    data: triagem,
    error,
  } = await supabase

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


  /*
   * Busca marca, modelo, capacidade e cor
   * no catálogo utilizando o SKU.
   */
  let catalogo = null;


  if (triagem.sku) {
    const {
      data: produtoCatalogo,
      error: erroCatalogo,
    } = await supabase

      .from("produtos_catalogo")

      .select(`
        tipo,
        marca,
        modelo,
        capacidade,
        cor,
        sku_als,
        sku_oracle
      `)

      .eq(
        "sku_als",
        String(triagem.sku)
          .trim()
          .toUpperCase()
      )

      .eq(
        "ativo",
        true
      )

      .order(
        "pendente",
        {
          ascending: true,
        }
      )

      .limit(1)

      .maybeSingle();


    if (erroCatalogo) {
      throw new Error(
        erroCatalogo.message
      );
    }


    catalogo =
      produtoCatalogo || null;
  }


  /*
   * Busca o laudo quando o produto
   * tiver passado por essa etapa.
   */
  let laudo = null;


  if (triagem.data_laudo) {
    const {
      data: dadosLaudo,
      error: erroLaudo,
    } = await supabase

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


    if (erroLaudo) {
      throw new Error(
        erroLaudo.message
      );
    }


    laudo =
      dadosLaudo || null;
  }


  return normalizarTriagem(
    triagem,
    laudo,
    catalogo
  );
}


/*
 * Solicita ao banco a reserva automática
 * do melhor endereço disponível.
 */
export async function reservarEndereco(
  voucher,
  userId
) {
  const detalhes =
    await buscarDetalhesArmazenagem(
      voucher
    );


  const {
    data,
    error,
  } = await supabase.rpc(
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


/*
 * Registra as validações físicas:
 * rua, bloco, andar, coluna e linha.
 */
export async function registrarBipagem(
  reservaId,
  etapa,
  codigo,
  userId
) {
  const {
    data,
    error,
  } = await supabase.rpc(
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


/*
 * Cancela uma reserva e libera
 * novamente o endereço.
 */
export async function cancelarReserva(
  reservaId,
  userId
) {
  const {
    data,
    error,
  } = await supabase.rpc(
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


/*
 * Formata o endereço para exibição na tela.
 */
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


/*
 * Gera uma imagem do código de barras
 * para inserir dentro do PDF.
 */
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


/*
 * Função auxiliar para escrever
 * textos dentro do PDF.
 */
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


/*
 * Gera a etiqueta no tamanho
 * 105 mm de largura por 50 mm de altura.
 */
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
   * Contorno externo da etiqueta.
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
   * Linha que separa os dados
   * do produto e o endereço.
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


  /*
   * Nome do produto utilizando
   * marca e modelo separados.
   */
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


  /*
   * Capacidade e cor.
   */
  escreverTexto(
    doc,
    [
      produto.armazenamento,
      produto.cor,
    ]
      .filter(Boolean)
      .join(" · ") || "—",
    4,
    25,
    6.5
  );


  /*
   * SKU somente como texto.
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
   * Área reservada para colar a bolinha do grade.
   *
   * Não existe contorno ao redor dessa área,
   * conforme solicitado.
   */
  escreverTexto(
    doc,
    "GRADE",
    71,
    5.2,
    6,
    "bold"
  );


  /*
   * Classificação física escrita
   * abaixo da área da bolinha.
   */
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
   * Apartamento destacado em preto.
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


/*
 * Baixa o PDF no computador.
 */
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