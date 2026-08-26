import { supabase } from "../lib/supabase";
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
  if (minutos == null) return "—";
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

const STATUS_TEAMS = new Set([
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

function proximaData(dataISO) {
  const [ano, mes, dia] = dataISO
    .split("-")
    .map(Number);

  const data = new Date(
    Date.UTC(ano, mes - 1, dia)
  );

  data.setUTCDate(data.getUTCDate() + 1);

  return data.toISOString().slice(0, 10);
}

function limitesDoDiaEmSaoPaulo(dataISO) {
  return {
    inicio: `${dataISO}T03:00:00.000Z`,
    fim: `${proximaData(dataISO)}T03:00:00.000Z`,
  };
}

function horarioSP(dataISO) {
  if (!dataISO) return "—";

  const data = new Date(dataISO);

  if (Number.isNaN(data.getTime())) {
    return "—";
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

  return valor?.trim() || "Não informado";
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
      STATUS_TEAMS.has(valor)
    )
  ) {
    return {
      chave: "teams",
      label: "Já enviado ao Teams",
    };
  }

  if (
    status.some((valor) =>
      STATUS_VALIDACAO.has(valor)
    )
  ) {
    return {
      chave: "validacao",
      label: "Em processo de validação",
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
      label: "Aguardando alocação",
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
      label: "Concluído",
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
      ) || "Não informado",

    quantidadeItens: ordenados.length,

    titulo:
      titulos[0] ||
      "Produto não informado",

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

async function buscarLinhasDoDia(
  dataISO
) {
  const { inicio, fim } =
    limitesDoDiaEmSaoPaulo(dataISO);

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
        .gte("criado_em", inicio)
        .lt("criado_em", fim)
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
  const { data, error } =
    await supabase
      .from("b2c_cortes_importacao")
      .select(`
        hora_corte,
        arquivo,
        linhas_arquivo,
        importado_em
      `)
      .eq(
        "data_operacao",
        dataISO
      )
      .order(
        "hora_corte",
        { ascending: true }
      );

  if (error) {
    throw new Error(error.message);
  }

  return data || [];
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
  if (!dataISO) return "—";

  const data = new Date(dataISO);

  if (Number.isNaN(data.getTime())) {
    return "—";
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
      buscarLinhasDoDia(dataISO),
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

        metadadosPorCorte.set(
          hora,
          {
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
     * Um pedido com vários itens
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

        if (
          !linhasPorCorte.has(
            hora
          )
        ) {
          linhasPorCorte.set(
            hora,
            []
          );
        }

        linhasPorCorte
          .get(hora)
          .push(...ordenados);
      }
    );

    const horas = [
      ...new Set([
        ...metadadosPorCorte.keys(),
        ...linhasPorCorte.keys(),
      ]),
    ].sort(
      (a, b) =>
        a.localeCompare(b)
    );

    const pedidosAcumulados =
      new Set();

    const cortes = horas.map(
      (hora) => {
        const linhasDoCorte =
          linhasPorCorte.get(
            hora
          ) || [];

        const itensPorPedido =
          new Map();

        const metadados =
          metadadosPorCorte.get(
            hora
          ) || {};

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

        const noTeams =
          pedidos.filter(
            (pedido) =>
              pedido.statusChave ===
              "teams"
          ).length;

        return {
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
            noTeams,

          definicao: {
            emValidacao,
            noTeams,
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
        "Não foi possível carregar os cortes do B2C.",
    };
  }
}