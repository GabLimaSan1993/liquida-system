import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Grid3X3,
  Loader2,
  LockKeyhole,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Warehouse,
} from "lucide-react";

import {
  GRADES_WMS,
  RUAS_WMS,
  buscarMapaAndarWms,
  buscarResumoEstoqueWms,
  formatarEnderecoWms,
  pesquisarEstoqueWms,
} from "../../services/estoqueWmsService.js";


const COLUNAS_VISUAIS = [
  "F",
  "E",
  "D",
  "C",
  "B",
  "A",
];

const LINHAS = [
  1,
  2,
  3,
  4,
  5,
  6,
  7,
  8,
  9,
  10,
];

const BLOCOS = [
  1,
  2,
  3,
  4,
  5,
];

const ANDARES = [
  5,
  4,
  3,
  2,
  1,
];

const ITENS_POR_PAGINA = 50;


const STATUS_CONFIG = {
  livre: {
    label: "Livre",
    dot: "bg-emerald-500",
    cell:
      "border-emerald-200 bg-emerald-50 text-emerald-800",
  },

  reservado: {
    label: "Reservado",
    dot: "bg-amber-500",
    cell:
      "border-amber-200 bg-amber-50 text-amber-800",
  },

  ocupado: {
    label: "Ocupado",
    dot: "bg-violet-600",
    cell:
      "border-violet-200 bg-violet-50 text-violet-900",
  },

  bloqueado: {
    label: "Bloqueado",
    dot: "bg-slate-600",
    cell:
      "border-slate-300 bg-slate-200 text-slate-700",
  },
};


const FAIXAS_AGING = [
  {
    ate: 30,
    label: "Até 30 dias",
    dot: "bg-emerald-500",
    fundo: "bg-emerald-50",
    classe:
      "bg-emerald-100 text-emerald-900 ring-emerald-300 hover:bg-emerald-200",
  },

  {
    ate: 60,
    label: "31 a 60 dias",
    dot: "bg-lime-500",
    fundo: "bg-lime-50",
    classe:
      "bg-lime-100 text-lime-900 ring-lime-300 hover:bg-lime-200",
  },

  {
    ate: 90,
    label: "61 a 90 dias",
    dot: "bg-amber-500",
    fundo: "bg-amber-50",
    classe:
      "bg-amber-100 text-amber-950 ring-amber-300 hover:bg-amber-200",
  },

  {
    ate: 120,
    label: "91 a 120 dias",
    dot: "bg-orange-500",
    fundo: "bg-orange-50",
    classe:
      "bg-orange-200 text-orange-950 ring-orange-400 hover:bg-orange-300",
  },

  {
    ate: Infinity,
    label: "Acima de 120 dias",
    dot: "bg-rose-600",
    fundo: "bg-rose-50",
    classe:
      "bg-red-600 text-white ring-red-700 hover:bg-red-700",
  },
];


function fmtNumero(
  valor
) {
  return Number(
    valor || 0
  ).toLocaleString(
    "pt-BR"
  );
}


function fmtData(
  valor
) {
  if (!valor) {
    return "—";
  }

  try {
    return new Date(
      valor
    ).toLocaleString(
      "pt-BR"
    );
  } catch {
    return "—";
  }
}


function fmtAging(
  valor
) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return "Sem aging";
  }

  const dias =
    Number(
      valor
    );

  if (
    !Number.isFinite(
      dias
    )
  ) {
    return "Sem aging";
  }

  return `${dias.toLocaleString(
    "pt-BR",
    {
      maximumFractionDigits: 1,
    }
  )}d`;
}


function faixaAging(
  valor
) {
  if (
    valor === null ||
    valor === undefined ||
    valor === ""
  ) {
    return {
  label: "Sem aging",
  dot: "bg-slate-300",
  fundo: "bg-slate-50",
  classe:
    "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
};
  }

  const dias =
    Number(
      valor
    );

  if (
    !Number.isFinite(
      dias
    )
  ) {
    return {
  label: "Sem aging",
  dot: "bg-slate-300",
  fundo: "bg-slate-50",
  classe:
    "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
};
  }

  return (
  FAIXAS_AGING.find(
    (faixa) =>
      dias <=
      faixa.ate
  ) || {
    label: "Sem aging",
    dot: "bg-slate-300",
    fundo: "bg-slate-50",
    classe:
      "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
  }
);
}


function Card({
  children,
  className = "",
}) {
  return (
    <div
      className={`
        rounded-2xl
        border
        border-slate-200
        bg-white
        shadow-sm
        ${className}
      `}
    >
      {children}
    </div>
  );
}


function KpiCard({
  icon: Icon,
  label,
  value,
  helper,
  loading,
}) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3 p-4">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[0.14em] text-slate-400">
            {label}
          </div>

          <div className="mt-1 text-2xl font-black text-slate-900">
            {loading
              ? "—"
              : fmtNumero(
                  value
                )}
          </div>

          <div className="mt-1 text-[10px] text-slate-400">
            {helper}
          </div>
        </div>

        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
          <Icon className="h-[17px] w-[17px]" />
        </div>
      </div>
    </Card>
  );
}


function CampoDetalhe({
  label,
  value,
  mono = false,
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <div className="text-[9px] font-black uppercase tracking-wide text-slate-400">
        {label}
      </div>

      <div
        className={`mt-1 break-words text-xs font-bold text-slate-700 ${
          mono
            ? "font-mono"
            : ""
        }`}
      >
        {value || "—"}
      </div>
    </div>
  );
}


export default function ConsultaEstoqueV2Page() {
  const [
    visao,
    setVisao,
  ] = useState(
    "consulta"
  );

  const [
    resumo,
    setResumo,
  ] = useState(
    null
  );

  const [
    loadingResumo,
    setLoadingResumo,
  ] = useState(
    true
  );

  const [
    erro,
    setErro,
  ] = useState(
    ""
  );


  const [
    filtros,
    setFiltros,
  ] = useState({
    busca: "",
    grade: "",
    status:
      "ocupado",
    rua: "",
  });

  const [
    resultado,
    setResultado,
  ] = useState({
    total: 0,
    linhas: [],
  });

  const [
    pesquisando,
    setPesquisando,
  ] = useState(
    true
  );

  const [
    pagina,
    setPagina,
  ] = useState(
    1
  );


  const [
    rua,
    setRua,
  ] = useState(
    8
  );

  const [
    bloco,
    setBloco,
  ] = useState(
    1
  );

  const [
    andar,
    setAndar,
  ] = useState(
    5
  );

  const [
    mapa,
    setMapa,
  ] = useState([]);

  const [
    loadingMapa,
    setLoadingMapa,
  ] = useState(
    false
  );

  const [
    mapaCarregado,
    setMapaCarregado,
  ] = useState(
    false
  );

  const [
    selecionado,
    setSelecionado,
  ] = useState(
    null
  );

  const alvoEnderecoRef =
    useRef(null);


  useEffect(() => {
    let cancelado =
      false;

    Promise.all([
      buscarResumoEstoqueWms(),

      pesquisarEstoqueWms({
        status:
          "ocupado",

        pagina: 1,

        tamanhoPagina:
          ITENS_POR_PAGINA,
      }),
    ])
      .then(
        ([
          dadosResumo,
          dadosPesquisa,
        ]) => {
          if (
            cancelado
          ) {
            return;
          }

          setResumo(
            dadosResumo
          );

          setResultado(
            dadosPesquisa
          );

          setErro("");
        }
      )
      .catch(
        (e) => {
          if (
            !cancelado
          ) {
            setErro(
              `Não foi possível carregar o estoque: ${e.message}`
            );
          }
        }
      )
      .finally(
        () => {
          if (
            cancelado
          ) {
            return;
          }

          setLoadingResumo(
            false
          );

          setPesquisando(
            false
          );
        }
      );

    return () => {
      cancelado =
        true;
    };
  }, []);


  async function carregarResumo() {
    setLoadingResumo(
      true
    );

    try {
      const dados =
        await buscarResumoEstoqueWms();

      setResumo(
        dados
      );

      setErro("");
    } catch (e) {
      setErro(
        `Não foi possível carregar o resumo: ${e.message}`
      );
    } finally {
      setLoadingResumo(
        false
      );
    }
  }


  async function executarPesquisa(
    paginaAlvo = 1
  ) {
    const dados =
      await pesquisarEstoqueWms({
        ...filtros,

        pagina:
          paginaAlvo,

        tamanhoPagina:
          ITENS_POR_PAGINA,
      });

    setResultado(
      dados
    );

    setPagina(
      paginaAlvo
    );
  }


  async function pesquisar(
    evento
  ) {
    evento?.preventDefault();

    setPesquisando(
      true
    );

    try {
      await executarPesquisa(
        1
      );

      setErro("");
    } catch (e) {
      setErro(
        `Não foi possível pesquisar o estoque: ${e.message}`
      );
    } finally {
      setPesquisando(
        false
      );
    }
  }


  async function carregarMapa() {
    setLoadingMapa(
      true
    );

    try {
      const dados =
        await buscarMapaAndarWms(
          rua,
          bloco,
          andar
        );

      setMapa(
        dados
      );

      setSelecionado(
        (atual) => {
          if (
            alvoEnderecoRef.current
          ) {
            return (
              dados.find(
                (item) =>
                  item.endereco_id ===
                  alvoEnderecoRef.current
              ) || null
            );
          }

          if (
            !atual
          ) {
            return null;
          }

          return (
            dados.find(
              (item) =>
                item.endereco_id ===
                atual.endereco_id
            ) || null
          );
        }
      );

      alvoEnderecoRef.current =
        null;

      setMapaCarregado(
        true
      );

      setErro("");
    } catch (e) {
      setMapa([]);

      setSelecionado(
        null
      );

      setErro(
        `Não foi possível carregar o mapa: ${e.message}`
      );
    } finally {
      setLoadingMapa(
        false
      );
    }
  }


  useEffect(() => {
    if (
      visao !==
      "mapa"
    ) {
      return;
    }

    carregarMapa();
  }, [
    rua,
    bloco,
    andar,
    visao,
  ]);


  async function atualizarAtual() {
    if (
      visao ===
      "mapa"
    ) {
      await Promise.all([
        carregarResumo(),
        carregarMapa(),
      ]);

      return;
    }

    setPesquisando(
      true
    );

    try {
      await Promise.all([
        carregarResumo(),
        executarPesquisa(
          pagina
        ),
      ]);
    } finally {
      setPesquisando(
        false
      );
    }
  }


  const totalPaginas =
    Math.max(
      1,
      Math.ceil(
        Number(
          resultado.total ||
            0
        ) /
          ITENS_POR_PAGINA
      )
    );


  async function mudarPagina(
    novaPagina
  ) {
    if (
      novaPagina < 1 ||
      novaPagina >
        totalPaginas ||
      pesquisando
    ) {
      return;
    }

    setPesquisando(
      true
    );

    try {
      await executarPesquisa(
        novaPagina
      );

      setErro("");
    } catch (e) {
      setErro(
        `Não foi possível pesquisar o estoque: ${e.message}`
      );
    } finally {
      setPesquisando(
        false
      );
    }
  }


  function abrirResultado(
    item
  ) {
    setRua(
      Number(
        item.rua
      )
    );

    setBloco(
      Number(
        item.bloco
      )
    );

    setAndar(
      Number(
        item.andar
      )
    );

    alvoEnderecoRef.current =
      item.endereco_id;

    setVisao(
      "mapa"
    );
  }


  const mapaPorPosicao =
    useMemo(
      () => {
        const indice =
          new Map();

        mapa.forEach(
          (item) =>
            indice.set(
              `${item.coluna}-${item.linha}`,
              item
            )
        );

        return indice;
      },
      [mapa]
    );


  const ruaResumo =
    (
      resumo?.por_rua ||
      []
    ).find(
      (item) =>
        Number(
          item.rua
        ) === rua
    );

    const blocoResumo =
  (
    resumo?.por_bloco ||
    []
  ).find(
    (item) =>
      Number(
        item.rua
      ) === rua &&
      Number(
        item.bloco
      ) === bloco
  );


const andarResumo =
  (
    resumo?.por_andar ||
    []
  ).find(
    (item) =>
      Number(
        item.rua
      ) === rua &&
      Number(
        item.bloco
      ) === bloco &&
      Number(
        item.andar
      ) === andar
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-black text-slate-900">
            Consulta do Estoque
          </h1>

          <p className="mt-1 text-[11px] text-slate-400">
            Visão operacional do WMS, posições físicas e localização de produtos.
          </p>
        </div>

        <button
          type="button"
          onClick={
            atualizarAtual
          }
          disabled={
            loadingResumo ||
            loadingMapa ||
            pesquisando
          }
          className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loadingResumo ||
              loadingMapa ||
              pesquisando
                ? "animate-spin"
                : ""
            }`}
          />

          Atualizar
        </button>
      </div>


      {erro && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
          {erro}
        </div>
      )}


      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon={
            Warehouse
          }
          label="Capacidade"
          value={
            resumo?.total
          }
          helper="Posições físicas ativas"
          loading={
            loadingResumo
          }
        />

        <KpiCard
          icon={
            Package
          }
          label="Ocupadas"
          value={
            resumo?.ocupados
          }
          helper={`${resumo?.ocupacao_percentual || 0}% de ocupação`}
          loading={
            loadingResumo
          }
        />

        <KpiCard
          icon={
            Clock3
          }
          label="Reservadas"
          value={
            resumo?.reservados
          }
          helper="Armazenagens em andamento"
          loading={
            loadingResumo
          }
        />

        <KpiCard
          icon={
            Boxes
          }
          label="Livres"
          value={
            resumo?.livres
          }
          helper="Disponíveis para alocação"
          loading={
            loadingResumo
          }
        />

        <KpiCard
          icon={
            LockKeyhole
          }
          label="Bloqueadas"
          value={
            resumo?.bloqueados
          }
          helper="Posições fora de uso"
          loading={
            loadingResumo
          }
        />
      </div>


      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() =>
            setVisao(
              "consulta"
            )
          }
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold transition ${
            visao ===
            "consulta"
              ? "bg-violet-700 text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Search className="h-4 w-4" />

          Consulta
        </button>

        <button
          type="button"
          onClick={() =>
            setVisao(
              "mapa"
            )
          }
          className={`inline-flex h-9 items-center gap-2 rounded-lg px-4 text-xs font-bold transition ${
            visao ===
            "mapa"
              ? "bg-violet-700 text-white"
              : "text-slate-500 hover:bg-slate-50"
          }`}
        >
          <Grid3X3 className="h-4 w-4" />

          Mapa físico
        </button>
      </div>


      {visao ===
      "consulta" ? (
        <Card>
          <div className="border-b border-slate-100 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <Search className="h-4 w-4" />
              </div>

              <div>
                <h2 className="text-sm font-black text-slate-800">
                  Localizar produto ou posição
                </h2>

                <p className="mt-0.5 text-[10px] text-slate-400">
                  Voucher, IMEI, SKU, produto ou endereço físico.
                </p>
              </div>
            </div>
          </div>


          <form
            onSubmit={
              pesquisar
            }
            className="grid gap-3 p-5 xl:grid-cols-[minmax(300px,1fr)_180px_160px_140px_auto]"
          >
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

              <input
                value={
                  filtros.busca
                }
                onChange={(
                  e
                ) =>
                  setFiltros(
                    (
                      atual
                    ) => ({
                      ...atual,

                      busca:
                        e.target.value,
                    })
                  )
                }
                placeholder="Voucher, IMEI, SKU, produto ou endereço..."
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-xs outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-50"
              />
            </div>


            <select
              value={
                filtros.grade
              }
              onChange={(
                e
              ) =>
                setFiltros(
                  (
                    atual
                  ) => ({
                    ...atual,

                    grade:
                      e.target.value,
                  })
                )
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-violet-300"
            >
              <option value="">
                Todas as grades
              </option>

              {GRADES_WMS.map(
                (grade) => (
                  <option
                    key={
                      grade
                    }
                    value={
                      grade
                    }
                  >
                    {grade}
                  </option>
                )
              )}
            </select>


            <select
              value={
                filtros.status
              }
              onChange={(
                e
              ) =>
                setFiltros(
                  (
                    atual
                  ) => ({
                    ...atual,

                    status:
                      e.target.value,
                  })
                )
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-violet-300"
            >
              <option value="">
                Todos os status
              </option>

              <option value="ocupado">
                Ocupado
              </option>

              <option value="reservado">
                Reservado
              </option>

              <option value="livre">
                Livre
              </option>

              <option value="bloqueado">
                Bloqueado
              </option>
            </select>


            <select
              value={
                filtros.rua
              }
              onChange={(
                e
              ) =>
                setFiltros(
                  (
                    atual
                  ) => ({
                    ...atual,

                    rua:
                      e.target.value,
                  })
                )
              }
              className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600 outline-none focus:border-violet-300"
            >
              <option value="">
                Todas as ruas
              </option>

              {RUAS_WMS.map(
                (item) => (
                  <option
                    key={
                      item.rua
                    }
                    value={
                      item.rua
                    }
                  >
                    RUA{" "}
                    {String(
                      item.rua
                    ).padStart(
                      2,
                      "0"
                    )}
                  </option>
                )
              )}
            </select>


            <button
              type="submit"
              disabled={
                pesquisando
              }
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 text-xs font-bold text-white transition hover:bg-violet-800 disabled:opacity-40"
            >
              {pesquisando ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Search className="h-4 w-4" />
              )}

              Buscar
            </button>
          </form>


          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-5 py-3">
            <div className="text-[10px] font-semibold text-slate-500">
              {fmtNumero(
                resultado.total
              )}{" "}
              resultado(s)
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  mudarPagina(
                    pagina -
                      1
                  )
                }
                disabled={
                  pagina <= 1 ||
                  pesquisando
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              <span className="text-[10px] font-bold text-slate-500">
                Página{" "}
                {fmtNumero(
                  pagina
                )}{" "}
                de{" "}
                {fmtNumero(
                  totalPaginas
                )}
              </span>

              <button
                type="button"
                onClick={() =>
                  mudarPagina(
                    pagina +
                      1
                  )
                }
                disabled={
                  pagina >=
                    totalPaginas ||
                  pesquisando
                }
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>


          <div className="overflow-x-auto border-t border-slate-100">
            <table className="min-w-[1050px] w-full text-left">
              <thead className="bg-slate-50">
                <tr className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3">
                    Endereço
                  </th>

                  <th className="px-4 py-3">
                    Status
                  </th>

                  <th className="px-4 py-3">
                    Voucher
                  </th>

                  <th className="px-4 py-3">
                    IMEI
                  </th>

                  <th className="px-4 py-3">
                    SKU
                  </th>

                  <th className="px-4 py-3">
                    Produto
                  </th>

                  <th className="px-4 py-3">
                    Grade
                  </th>

                  <th className="px-4 py-3">
                    Status produto
                  </th>
                </tr>
              </thead>

              <tbody>
                {resultado.linhas.map(
                  (item) => {
                    const config =
                      STATUS_CONFIG[
                        item.status_endereco
                      ] || {
                        label:
                          item.status_endereco,

                        dot:
                          "bg-slate-400",
                      };

                    return (
                      <tr
                        key={
                          item.endereco_id
                        }
                        onClick={() =>
                          abrirResultado(
                            item
                          )
                        }
                        className="cursor-pointer border-t border-slate-100 text-[11px] text-slate-600 transition hover:bg-violet-50/40"
                      >
                        <td className="whitespace-nowrap px-4 py-3 font-black text-violet-700">
                          {
                            item.endereco
                          }
                        </td>

                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-50 px-2 py-1 font-bold">
                            <span
                              className={`h-2 w-2 rounded-full ${config.dot}`}
                            />

                            {
                              config.label
                            }
                          </span>
                        </td>

                        <td className="px-4 py-3 font-mono font-bold">
                          {item.voucher ||
                            "—"}
                        </td>

                        <td className="px-4 py-3 font-mono">
                          {item.imei ||
                            "—"}
                        </td>

                        <td className="px-4 py-3 font-mono">
                          {item.sku ||
                            "—"}
                        </td>

                        <td className="max-w-[260px] px-4 py-3">
                          <div className="truncate font-semibold text-slate-700">
                            {[
                              item.marca,
                              item.modelo,
                            ]
                              .filter(
                                Boolean
                              )
                              .join(
                                " "
                              ) ||
                              "—"}
                          </div>
                        </td>

                        <td className="px-4 py-3 font-bold">
                          {item.grade_fisica ||
                            "—"}
                        </td>

                        <td className="px-4 py-3">
                          {item.status_produto ||
                            "—"}
                        </td>
                      </tr>
                    );
                  }
                )}


                {!resultado
                  .linhas
                  .length &&
                  !pesquisando && (
                    <tr>
                      <td
                        colSpan="8"
                        className="px-4 py-12 text-center text-xs text-slate-400"
                      >
                        Nenhum endereço encontrado com os filtros informados.
                      </td>
                    </tr>
                  )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                  <MapPin className="h-4 w-4" />
                </div>

                <div>
                  <h2 className="text-sm font-black text-slate-800">
                    Mapa físico do estoque
                  </h2>

                  <p className="mt-0.5 text-[10px] text-slate-400">
                    Navegue por Rua, Bloco, Andar e Apartamento.
                  </p>
                </div>
              </div>
            </div>


            <div className="p-5">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-[repeat(15,minmax(0,1fr))]">
                {RUAS_WMS.map(
  (item) => {
    const dadosRua =
      (
        resumo?.por_rua ||
        []
      ).find(
        (r) =>
          Number(
            r.rua
          ) ===
          item.rua
      );

    const aging =
      faixaAging(
        dadosRua?.aging_medio_dias
      );

    const ativa =
      rua ===
      item.rua;

    return (
      <button
        type="button"
        key={
          item.rua
        }
        onClick={() => {
          setRua(
            item.rua
          );

          if (
            item.rua ===
            15
          ) {
            setBloco(
              1
            );
          }
        }}
        className={`min-h-[66px] rounded-xl px-3 py-3 text-left ring-1 transition ${
          aging.classe
        } ${
          ativa
            ? "outline outline-2 outline-offset-1 outline-violet-600"
            : ""
        }`}
      >
        <div className="text-[10px] font-black">
          RUA{" "}
          {String(
            item.rua
          ).padStart(
            2,
            "0"
          )}
        </div>

        <div className="mt-1 text-[8px] font-black opacity-75">
          {
            item.grade
          }
        </div>

        <div className="mt-2 text-[10px] font-black">
          {fmtAging(
            dadosRua?.aging_medio_dias
          )}
        </div>
      </button>
    );
  }
)}
              </div>


              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="mr-1 text-[10px] font-black uppercase text-slate-400">
                  Bloco
                </span>

                {BLOCOS.map(
  (numero) => {
    const dadosBloco =
      (
        resumo?.por_bloco ||
        []
      ).find(
        (item) =>
          Number(
            item.rua
          ) === rua &&
          Number(
            item.bloco
          ) === numero
      );

    const aging =
      faixaAging(
        dadosBloco?.aging_medio_dias
      );

    return (
      <button
        type="button"
        key={
          numero
        }
        disabled={
          rua === 15 &&
          numero !== 1
        }
        onClick={() =>
          setBloco(
            numero
          )
        }
        className={`min-h-11 rounded-lg px-3 py-1.5 text-left text-[10px] font-bold ring-1 transition ${
          aging.classe
        } ${
          bloco === numero
            ? "outline outline-2 outline-offset-1 outline-violet-600"
            : ""
        } disabled:cursor-not-allowed disabled:opacity-25`}
      >
        <span className="block">
          BL{" "}
          {String(
            numero
          ).padStart(
            2,
            "0"
          )}
        </span>

        <span className="mt-0.5 block text-[9px] font-black opacity-75">
          {fmtAging(
            dadosBloco?.aging_medio_dias
          )}
        </span>
      </button>
    );
  }
)}

                <span className="ml-3 mr-1 text-[10px] font-black uppercase text-slate-400">
                  Andar
                </span>

                {ANDARES.map(
  (numero) => {
    const dadosAndar =
      (
        resumo?.por_andar ||
        []
      ).find(
        (item) =>
          Number(
            item.rua
          ) === rua &&
          Number(
            item.bloco
          ) === bloco &&
          Number(
            item.andar
          ) === numero
      );

    const aging =
      faixaAging(
        dadosAndar?.aging_medio_dias
      );

    return (
      <button
        type="button"
        key={
          numero
        }
        onClick={() =>
          setAndar(
            numero
          )
        }
        className={`min-h-11 rounded-lg px-3 py-1.5 text-left text-[10px] font-bold ring-1 transition ${
          aging.classe
        } ${
          andar === numero
            ? "outline outline-2 outline-offset-1 outline-violet-600"
            : ""
        }`}
      >
        <span className="block">
          AD{" "}
          {String(
            numero
          ).padStart(
            2,
            "0"
          )}
        </span>

        <span className="mt-0.5 block text-[9px] font-black opacity-75">
          {fmtAging(
            dadosAndar?.aging_medio_dias
          )}
        </span>
      </button>
    );
  }
)}
              </div>


              <div className="mt-5 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="text-[9px] font-black uppercase tracking-wide text-slate-400">
                  Aging
                </span>

                {FAIXAS_AGING.map(
                  (faixa) => (
                    <span
                      key={
                        faixa.label
                      }
                      className="flex items-center gap-1.5 text-[9px] font-semibold text-slate-500"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${faixa.dot}`}
                      />

                      {
                        faixa.label
                      }
                    </span>
                  )
                )}

                <span className="ml-auto text-[9px] font-bold text-slate-500">
  Rua{" "}
  {fmtAging(
    ruaResumo?.aging_medio_dias
  )}{" "}
  · Bloco{" "}
  {fmtAging(
    blocoResumo?.aging_medio_dias
  )}{" "}
  · Andar{" "}
  {fmtAging(
    andarResumo?.aging_medio_dias
  )}
</span>
              </div>


              <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                  {loadingMapa ? (
                    <div className="flex min-h-[420px] items-center justify-center gap-2 text-xs font-semibold text-violet-600">
                      <Loader2 className="h-4 w-4 animate-spin" />

                      Carregando andar...
                    </div>
                  ) : (
                    <div className="min-w-[690px]">
                      <div
                        className="grid gap-2"
                        style={{
                          gridTemplateColumns:
                            "38px repeat(6, minmax(92px, 1fr))",
                        }}
                      >
                        <div />

                        {COLUNAS_VISUAIS.map(
                          (coluna) => (
                            <div
                              key={
                                coluna
                              }
                              className="pb-1 text-center text-[10px] font-black text-slate-400"
                            >
                              COL{" "}
                              {
                                coluna
                              }
                            </div>
                          )
                        )}

                        {LINHAS.flatMap(
                          (
                            linha
                          ) => [
                            <div
                              key={`rotulo-${linha}`}
                              className="flex items-center justify-center text-[10px] font-black text-slate-400"
                            >
                              {String(
                                linha
                              ).padStart(
                                2,
                                "0"
                              )}
                            </div>,

                            ...COLUNAS_VISUAIS.map(
                              (
                                coluna
                              ) => {
                                const item =
                                  mapaPorPosicao.get(
                                    `${coluna}-${linha}`
                                  );

                                const status =
  item?.status_endereco ||
  "livre";

const config =
  STATUS_CONFIG[
    status
  ] ||
  STATUS_CONFIG.livre;

const aging =
  faixaAging(
    item?.aging_dias
  );

const ativo =
  selecionado?.endereco_id ===
  item?.endereco_id;

                                return (
                                  <button
                                    type="button"
                                    key={`${coluna}-${linha}`}
                                    disabled={
                                      !item
                                    }
                                    onClick={() =>
                                      setSelecionado(
                                        item
                                      )
                                    }
                                    className={`min-h-[66px] rounded-xl p-2 text-left ring-1 transition ${
  aging.classe
} ${
  ativo
    ? "outline outline-2 outline-offset-2 outline-violet-600"
    : ""
} disabled:opacity-30`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[11px] font-black">
                                        AP{" "}
                                        {
                                          coluna
                                        }
                                        {String(
                                          linha
                                        ).padStart(
                                          2,
                                          "0"
                                        )}
                                      </span>

                                      <span
                                        className={`h-2 w-2 rounded-full ${config.dot}`}
                                      />
                                    </div>

                                    <div className="mt-1 truncate text-[9px] font-bold">
                                      {item?.voucher ||
                                        config.label}
                                    </div>

                                    {item?.modelo && (
                                      <div className="mt-0.5 truncate text-[8px] opacity-70">
                                        {
                                          item.modelo
                                        }
                                      </div>
                                    )}
                                  </button>
                                );
                              }
                            ),
                          ]
                        )}
                      </div>
                    </div>
                  )}
                </div>


                <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                  <div className="text-[9px] font-black uppercase tracking-[0.14em] text-violet-500">
                    Posição selecionada
                  </div>

                  <div className="mt-1 text-lg font-black text-slate-900">
                    {selecionado
                      ? formatarEnderecoWms(
                          selecionado
                        )
                      : "Selecione um AP"}
                  </div>

                  {selecionado ? (
                    <div className="mt-4 space-y-2">
                      <CampoDetalhe
                        label="Status do endereço"
                        value={
                          STATUS_CONFIG[
                            selecionado.status_endereco
                          ]
                            ?.label ||
                          selecionado.status_endereco
                        }
                      />

                      <CampoDetalhe
                        label="Voucher"
                        value={
                          selecionado.voucher
                        }
                        mono
                      />

                      <CampoDetalhe
                        label="IMEI"
                        value={
                          selecionado.imei
                        }
                        mono
                      />

                      <CampoDetalhe
                        label="SKU"
                        value={
                          selecionado.sku
                        }
                        mono
                      />

                      <CampoDetalhe
                        label="Produto"
                        value={[
                          selecionado.marca,
                          selecionado.modelo,
                        ]
                          .filter(
                            Boolean
                          )
                          .join(
                            " "
                          )}
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <CampoDetalhe
                          label="Grade física"
                          value={
                            selecionado.grade_fisica
                          }
                        />

                        <CampoDetalhe
                          label="Grade venda"
                          value={
                            selecionado.grade_venda
                          }
                        />
                      </div>

                      <CampoDetalhe
                        label="Status produto"
                        value={
                          selecionado.status_produto
                        }
                      />

                      <CampoDetalhe
                        label="Aging Oracle"
                        value={
                          selecionado.aging_dias !=
                          null
                            ? `${selecionado.aging_dias} dia(s)`
                            : "Sem aging"
                        }
                      />

                      <CampoDetalhe
                        label="Armazenado em"
                        value={fmtData(
                          selecionado.armazenado_em
                        )}
                      />

                      {selecionado.status_endereco ===
                        "reservado" && (
                        <CampoDetalhe
                          label="Reserva válida até"
                          value={fmtData(
                            selecionado.reservado_ate
                          )}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-xs leading-5 text-slate-400">
                      Clique em uma posição para visualizar o produto e os dados da armazenagem.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </Card>


          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {(
              resumo?.por_grade ||
              []
            ).map(
              (item) => (
                <Card
                  key={
                    item.grade
                  }
                >
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-xs font-black text-slate-700">
                        {
                          item.grade
                        }
                      </div>

                      <div className="text-xs font-black text-violet-700">
                        {
                          item.ocupacao_percentual
                        }
                        %
                      </div>
                    </div>

                    <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-violet-700"
                        style={{
                          width: `${Math.min(
                            100,
                            Number(
                              item.ocupacao_percentual ||
                                0
                            )
                          )}%`,
                        }}
                      />
                    </div>

                    <div className="mt-2 text-[10px] text-slate-400">
                      {fmtNumero(
                        Number(
                          item.ocupados
                        ) +
                          Number(
                            item.reservados
                          )
                      )}{" "}
                      utilizadas de{" "}
                      {fmtNumero(
                        item.total
                      )}
                    </div>
                  </div>
                </Card>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}