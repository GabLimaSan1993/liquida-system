import { supabase } from "../lib/supabase";

// Janela de operaÃ§Ã£o em SÃ£o Paulo (UTC-3):
// segunda a sexta, 08:00â€“17:48; sÃ¡bado, 07:00â€“16:00; domingo fechado.
const SP_OFFSET_MIN = -180;

const EXPEDIENTE = {
  0: null,
  1: [8 * 60, 17 * 60 + 48],
  2: [8 * 60, 17 * 60 + 48],
  3: [8 * 60, 17 * 60 + 48],
  4: [8 * 60, 17 * 60 + 48],
  5: [8 * 60, 17 * 60 + 48],
  6: [7 * 60, 16 * 60],
};

export function minutosUteis(inicioISO, fimISO) {
  if (!inicioISO || !fimISO) return null;

  const inicio = new Date(inicioISO).getTime();
  const fim = new Date(fimISO).getTime();

  if (Number.isNaN(inicio) || Number.isNaN(fim)) return null;
  if (fim <= inicio) return 0;

  let total = 0;
  let cursor = inicio;
  let guard = 0;

  while (cursor < fim && guard < 400) {
    guard += 1;

    const local = new Date(cursor + SP_OFFSET_MIN * 60000);
    const janela = EXPEDIENTE[local.getUTCDay()];
    const meiaNoiteLocal =
      Date.UTC(
        local.getUTCFullYear(),
        local.getUTCMonth(),
        local.getUTCDate(),
        0,
        0,
        0
      ) - SP_OFFSET_MIN * 60000;

    if (janela) {
      const abertura = meiaNoiteLocal + janela[0] * 60000;
      const fechamento = meiaNoiteLocal + janela[1] * 60000;
      const de = Math.max(inicio, abertura);
      const ate = Math.min(fim, fechamento);

      if (ate > de) total += ate - de;
    }

    cursor = meiaNoiteLocal + 24 * 60 * 60000;
  }

  return Math.round(total / 60000);
}

export function fmtDuracao(minutos) {
  if (minutos == null) return "â€”";
  if (minutos < 1) return "0m";

  const dias = Math.floor(minutos / (60 * 24));
  const horas = Math.floor((minutos % (60 * 24)) / 60);
  const minutosRestantes = minutos % 60;
  const partes = [];

  if (dias) partes.push(`${dias}d`);
  if (horas) partes.push(`${horas}h`);
  if (minutosRestantes || (!dias && !horas)) {
    partes.push(`${minutosRestantes}m`);
  }

  return partes.join(" ");
}

const TAMANHO_PAGINA = 1000;

const STATUS_PICKING = new Set([
  "alocado",
  "em_picking",
]);

const STATUS_FATURAMENTO = new Set([
  "embalado",
]);

const STATUS_VALIDACAO = new Set([
  "em_analise",
]);

const STATUS_DEFINICAO = new Set([
  "aguardando_definicao_produto",
  "aguardando_definicao",
]);

function normalizarTexto(valor) {
  return String(valor || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\s-]+/g, "_");
}

function normalizarHora(valor) {
  if (!valor) return null;

  const partes = String(valor)
    .trim()
    .match(/^(\d{1,2})(?::(\d{2}))?/);

  if (!partes) return null;

  const hora = Number(partes[1]);
  const minuto = Number(partes[2] || 0);

  if (
    hora < 0 ||
    hora > 23 ||
    minuto < 0 ||
    minuto > 59
  ) {
    return null;
  }

  return `${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}`;
}

function deslocarData(dataISO, dias) {
  const [ano, mes, dia] = dataISO
    .split("-")
    .map(Number);

  const data = new Date(
    Date.UTC(ano, mes - 1, dia)
  );

  data.setUTCDate(data.getUTCDate() + dias);

  return data.toISOString().slice(0, 10);
}

function limitesDaJanelaOperacional(dataISO) {
  const dataAnterior = deslocarData(dataISO, -1);

  return {
    dataAnterior,
    inicio: `${dataAnterior}T16:00:00.000Z`,
    fim: `${dataISO}T16:00:00.000Z`,
  };
}

function dataSP(dataISO) {
  if (!dataISO) return null;

  const data = new Date(dataISO);
  if (Number.isNaN(data.getTime())) return null;

  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(data);

  const valor = (tipo) =>
    partes.find((parte) => parte.type === tipo)?.value;

  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

function horaEmMinutos(hora) {
  const normalizada = normalizarHora(hora);
  if (!normalizada) return null;

  const [horas, minutos] = normalizada.split(":").map(Number);
  return horas * 60 + minutos;
}

function chaveDoCorte(dataOperacao, hora) {
  return `${dataOperacao}|${hora}`;
}

function dataCurta(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  return `${dia}/${mes}/${ano}`;
}

function horarioSP(dataISO) {
  if (!dataISO) return "â€”";

  const data = new Date(dataISO);

  if (Number.isNaN(data.getTime())) {
    return "â€”";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(data);
}

function marketplaceResumido(valor) {
  const marketplace = normalizarTexto(valor);

  if (
    marketplace.includes("magazine") ||
    marketplace.includes("magalu")
  ) {
    return "Magalu";
  }

  if (
    marketplace.includes("mercado_livre") ||
    marketplace.includes("meli")
  ) {
    return "Mercado Livre";
  }

  if (
    marketplace.includes("via_varejo") ||
    marketplace.includes("casas_bahia") ||
    marketplace.includes("extra")
  ) {
    return "Via Varejo";
  }

  return valor?.trim() || "NÃ£o informado";
}

function primeiroPreenchido(itens, campo) {
  return (
    itens.find(
      (item) =>
        item[campo] != null &&
        String(item[campo]).trim() !== ""
    )?.[campo] || null
  );
}

function statusDoPedido(itens) {
  const status = itens.map((item) =>
    normalizarTexto(item.status)
  );

  if (
    status.some((valor) =>
      STATUS_DEFINICAO.has(valor)
    )
  ) {
    return {
      chave: "definicao",
      label: "Aguardando definiÃ§Ã£o",
    };
  }

  if (
    status.some((valor) =>
      STATUS_VALIDACAO.has(valor)
    )
  ) {
    return {
      chave: "validacao",
      label: "Em processo de validaÃ§Ã£o",
    };
  }

  if (
    itens.some((item) => {
      const valor = normalizarTexto(
        item.status
      );

      return (
        STATUS_FATURAMENTO.has(valor) &&
        !item.faturado_em
      );
    })
  ) {
    return {
      chave: "faturamento",
      label: "Em faturamento",
    };
  }

  if (
    status.some((valor) =>
      STATUS_PICKING.has(valor)
    )
  ) {
    return {
      chave: "picking",
      label: "Em picking",
    };
  }

  if (
    status.some(
      (valor) =>
        valor === "aguardando_alocacao"
    )
  ) {
    return {
      chave: "aguardando_alocacao",
      label: "Aguardando alocaÃ§Ã£o",
    };
  }

  if (
    status.every(
      (valor) =>
        valor === "concluido" ||
        valor === "faturado"
    )
  ) {
    return {
      chave: "concluido",
      label: "ConcluÃ­do",
    };
  }

  if (
    status.some(
      (valor) => valor === "cancelado"
    )
  ) {
    return {
      chave: "cancelado",
      label: "Cancelado",
    };
  }

  const primeiro = primeiroPreenchido(
    itens,
    "status"
  );

  return {
    chave: "outro",
    label: primeiro || "Sem status",
  };
}

function resumirPedido(
  idAnymarket,
  itens
) {
  const ordenados = itens
    .slice()
    .sort(
      (a, b) =>
        new Date(a.criado_em || 0) -
        new Date(b.criado_em || 0)
    );

  const status = statusDoPedido(ordenados);

  const titulos = [
    ...new Set(
      ordenados
        .map(
          (item) =>
            item.titulo_produto
        )
        .filter(Boolean)
    ),
  ];

  const imeis = [
    ...new Set(
      ordenados
        .map(
          (item) =>
            item.imei_alocado
        )
        .filter(Boolean)
    ),
  ];

  return {
    idAnymarket,
    entradaEm:
      ordenados[0]?.criado_em || null,

    entradaHora: horarioSP(
      ordenados[0]?.criado_em
    ),

    marketplace: marketplaceResumido(
      primeiroPreenchido(
        ordenados,
        "marketplace"
      )
    ),

    cliente:
      primeiroPreenchido(
        ordenados,
        "cliente"
      ) || "NÃ£o informado",

    quantidadeItens: ordenados.length,

    titulo:
      titulos[0] ||
      "Produto nÃ£o informado",

    outrosTitulos: Math.max(
      0,
      titulos.length - 1
    ),

    imeis,

    grupoId: primeiroPreenchido(
      ordenados,
      "grupo_id"
    ),

    numeroNf: primeiroPreenchido(
      ordenados,
      "numero_nf"
    ),

    statusChave: status.chave,
    statusLabel: status.label,
  };
}

async function buscarLinhasDaJanela(
  dataISO
) {
  const { inicio, fim } =
    limitesDaJanelaOperacional(dataISO);

  const linhas = [];

  for (
    let inicioPagina = 0;
    ;
    inicioPagina += TAMANHO_PAGINA
  ) {
    const { data, error } =
      await supabase
        .from("pedidos_b2c")
        .select(`
          id,
          id_anymarket,
          item_seq,
          criado_em,
          hora_corte,
          marketplace,
          cliente,
          titulo_produto,
          sku_produto,
          sku_alocado,
          imei_alocado,
          status,
          faturado_em,
          numero_nf,
          grupo_id
        `)
        .gt("criado_em", inicio)
        .lte("criado_em", fim)
        .not(
          "hora_corte",
          "is",
          null
        )
        .order(
          "criado_em",
          { ascending: true }
        )
        .order(
          "id",
          { ascending: true }
        )
        .range(
          inicioPagina,
          inicioPagina +
            TAMANHO_PAGINA -
            1
        );

    if (error) {
      throw new Error(error.message);
    }

    const pagina = data || [];

    linhas.push(...pagina);

    if (
      pagina.length <
      TAMANHO_PAGINA
    ) {
      break;
    }
  }

  return linhas;
}

async function buscarCortesRegistrados(
  dataISO
) {
  const { dataAnterior } =
    limitesDaJanelaOperacional(dataISO);

  const { data, error } =
    await supabase
      .from("b2c_cortes_importacao")
      .select(`
        data_operacao,
        hora_corte,
        arquivo,
        linhas_arquivo,
        importado_em
      `)
      .in(
        "data_operacao",
        [dataAnterior, dataISO]
      )
      .order(
        "data_operacao",
        { ascending: true }
      )
      .order(
        "hora_corte",
        { ascending: true }
      );

  if (error) {
    throw new Error(error.message);
  }

  return (data || []).filter((corte) => {
    const minutos = horaEmMinutos(corte.hora_corte);
    if (minutos == null) return false;

    if (corte.data_operacao === dataAnterior) {
      return minutos > 13 * 60;
    }

    return corte.data_operacao === dataISO && minutos <= 13 * 60;
  });
}

export function hojeEmSaoPaulo() {
  const partes =
    new Intl.DateTimeFormat(
      "pt-BR",
      {
        timeZone:
          "America/Sao_Paulo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }
    ).formatToParts(new Date());

  const valor = (tipo) =>
    partes.find(
      (parte) =>
        parte.type === tipo
    )?.value;

  return `${valor("year")}-${valor("month")}-${valor("day")}`;
}

export function formatarDataHoraSP(
  dataISO
) {
  if (!dataISO) return "â€”";

  const data = new Date(dataISO);

  if (Number.isNaN(data.getTime())) {
    return "â€”";
  }

  return new Intl.DateTimeFormat(
    "pt-BR",
    {
      timeZone:
        "America/Sao_Paulo",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  ).format(data);
}

export async function buscarCortesPainelGestorB2C(
  dataISO = hojeEmSaoPaulo()
) {
  try {
    const [
      linhas,
      cortesRegistrados,
    ] = await Promise.all([
      buscarLinhasDaJanela(dataISO),
      buscarCortesRegistrados(
        dataISO
      ),
    ]);

    const linhasPorPedido =
      new Map();

    const linhasPorCorte =
      new Map();

    const metadadosPorCorte =
      new Map();

    cortesRegistrados.forEach(
      (corte) => {
        const hora =
          normalizarHora(
            corte.hora_corte
          );

        if (!hora) return;

        const chave = chaveDoCorte(
          corte.data_operacao,
          hora
        );

        metadadosPorCorte.set(
          chave,
          {
            dataOperacao:
              corte.data_operacao,

            arquivo:
              corte.arquivo ||
              null,

            linhasArquivo:
              corte.linhas_arquivo ||
              0,

            importadoEm:
              corte.importado_em ||
              null,
          }
        );
      }
    );

    linhas.forEach((linha) => {
      if (
        linha.id_anymarket ==
        null
      ) {
        return;
      }

      const chave = String(
        linha.id_anymarket
      );

      if (
        !linhasPorPedido.has(
          chave
        )
      ) {
        linhasPorPedido.set(
          chave,
          []
        );
      }

      linhasPorPedido
        .get(chave)
        .push(linha);
    });

    /*
     * Um pedido com vÃ¡rios itens
     * aparece somente uma vez,
     * no primeiro corte em que
     * entrou naquele dia.
     */
    linhasPorPedido.forEach(
      (itens) => {
        const ordenados = itens
          .slice()
          .sort(
            (a, b) =>
              new Date(
                a.criado_em || 0
              ) -
              new Date(
                b.criado_em || 0
              )
          );

        const hora =
          normalizarHora(
            ordenados[0]
              ?.hora_corte
          );

        if (!hora) return;

        const dataOperacao = dataSP(
          ordenados[0]?.criado_em
        );

        if (!dataOperacao) return;

        const chaveCorte = chaveDoCorte(
          dataOperacao,
          hora
        );

        if (
          !linhasPorCorte.has(
            chaveCorte
          )
        ) {
          linhasPorCorte.set(
            chaveCorte,
            []
          );
        }

        linhasPorCorte
          .get(chaveCorte)
          .push(...ordenados);
      }
    );

    const chavesCorte = [
      ...new Set([
        ...metadadosPorCorte.keys(),
        ...linhasPorCorte.keys(),
      ]),
    ].sort((a, b) => a.localeCompare(b));

    const pedidosAcumulados =
      new Set();

    const cortes = chavesCorte.map(
      (chaveCorte) => {
        const [dataDaChave, hora] =
          chaveCorte.split("|");

        const linhasDoCorte =
          linhasPorCorte.get(
            chaveCorte
          ) || [];

        const itensPorPedido =
          new Map();

        const metadados =
          metadadosPorCorte.get(
            chaveCorte
          ) || {};

        const dataOperacao =
          metadados.dataOperacao ||
          dataDaChave;

        linhasDoCorte.forEach(
          (linha) => {
            const chave = String(
              linha.id_anymarket
            );

            if (
              !itensPorPedido.has(
                chave
              )
            ) {
              itensPorPedido.set(
                chave,
                []
              );
            }

            itensPorPedido
              .get(chave)
              .push(linha);
          }
        );

        const pedidos = [
          ...itensPorPedido.entries(),
        ]
          .map(
            ([
              idAnymarket,
              itens,
            ]) =>
              resumirPedido(
                idAnymarket,
                itens
              )
          )
          .sort(
            (a, b) =>
              new Date(
                a.entradaEm || 0
              ) -
              new Date(
                b.entradaEm || 0
              )
          );

        pedidos.forEach(
          (pedido) =>
            pedidosAcumulados.add(
              pedido.idAnymarket
            )
        );

        const faturamentoPorMarketplace =
          {
            Magalu: 0,
            "Mercado Livre": 0,
            "Via Varejo": 0,
            Outros: 0,
          };

        pedidos
          .filter(
            (pedido) =>
              pedido.statusChave ===
              "faturamento"
          )
          .forEach(
            (pedido) => {
              const chave =
                Object.prototype.hasOwnProperty.call(
                  faturamentoPorMarketplace,
                  pedido.marketplace
                )
                  ? pedido.marketplace
                  : "Outros";

              faturamentoPorMarketplace[
                chave
              ]++;
            }
          );

        const emPicking =
          pedidos.filter(
            (pedido) =>
              pedido.statusChave ===
              "picking"
          ).length;

        const emFaturamento =
          pedidos.filter(
            (pedido) =>
              pedido.statusChave ===
              "faturamento"
          ).length;

        const emValidacao =
          pedidos.filter(
            (pedido) =>
              pedido.statusChave ===
              "validacao"
          ).length;

        const emDefinicao =
          pedidos.filter(
            (pedido) =>
              pedido.statusChave ===
              "definicao"
          ).length;

        return {
          chave: chaveCorte,

          dataOperacao,

          dataLabel:
            dataCurta(dataOperacao),

          hora,

          arquivo:
            metadados.arquivo ||
            null,

          linhasArquivo:
            metadados.linhasArquivo ||
            0,

          importadoEm:
            metadados.importadoEm ||
            null,

          pedidosEntraram:
            pedidos.length,

          acumuladoDia:
            pedidosAcumulados.size,

          emPicking,

          emFaturamento,

          aguardandoDefinicao:
            emValidacao +
            emDefinicao,

          definicao: {
            emValidacao,
            aguardando: emDefinicao,
          },

          faturamentoPorMarketplace,

          pedidos,
        };
      }
    );

    const ultimoCorte =
      cortes.at(-1) || null;

    return {
      ok: true,

      data: dataISO,

      janela: {
        inicioData:
          deslocarData(dataISO, -1),
        inicioHora: "13:00",
        fimData: dataISO,
        fimHora: "13:00",
      },

      atualizadoEm:
        new Date().toISOString(),

      resumo: {
        pedidosNoDia:
          pedidosAcumulados.size,

        cortesRealizados:
          cortes.length,

        ultimoCorte:
          ultimoCorte?.hora ||
          null,

        dataUltimoCorte:
          ultimoCorte?.dataOperacao ||
          null,

        pedidosUltimoCorte:
          ultimoCorte
            ?.pedidosEntraram ||
          0,
      },

      cortes,
    };
  } catch (error) {
    console.error(
      "Erro ao carregar cortes do Painel Gestor B2C:",
      error
    );

    return {
      ok: false,

      erro:
        error?.message ||
        "NÃ£o foi possÃ­vel carregar os cortes do B2C.",
    };
  }
}