import { createElement, useEffect, useMemo, useRef, useState } from "react";
import {
  Boxes,
  Clock3,
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
} from "../services/estoqueWmsService.js";

const COLUNAS_VISUAIS = ["F", "E", "D", "C", "B", "A"];
const LINHAS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const BLOCOS = [1, 2, 3, 4, 5];
const ANDARES = [5, 4, 3, 2, 1];
const ITENS_POR_PAGINA = 250;

const FAIXAS_AGING = [
  {
    ate: 30,
    rotulo: "Até 30 dias",
    classe: "bg-emerald-100 text-emerald-900 ring-emerald-300 hover:bg-emerald-200",
    ponto: "bg-emerald-500",
  },
  {
    ate: 60,
    rotulo: "31 a 60 dias",
    classe: "bg-lime-100 text-lime-900 ring-lime-300 hover:bg-lime-200",
    ponto: "bg-lime-500",
  },
  {
    ate: 90,
    rotulo: "61 a 90 dias",
    classe: "bg-amber-100 text-amber-950 ring-amber-300 hover:bg-amber-200",
    ponto: "bg-amber-500",
  },
  {
    ate: 120,
    rotulo: "91 a 120 dias",
    classe: "bg-orange-200 text-orange-950 ring-orange-400 hover:bg-orange-300",
    ponto: "bg-orange-500",
  },
  {
    ate: Infinity,
    rotulo: "Acima de 120 dias",
    classe: "bg-red-600 text-white ring-red-700 hover:bg-red-700",
    ponto: "bg-red-600",
  },
];

const AGING_SEM_DADOS = {
  rotulo: "Sem aging",
  classe: "bg-slate-50 text-slate-700 ring-slate-200 hover:bg-slate-100",
  ponto: "bg-slate-300",
};

const STATUS_CONFIG = {
  livre: {
    label: "Livre",
    celula: "bg-emerald-50 text-emerald-800 ring-emerald-200 hover:bg-emerald-100",
    ponto: "bg-emerald-500",
  },
  reservado: {
    label: "Reservado",
    celula: "bg-amber-50 text-amber-800 ring-amber-300 hover:bg-amber-100",
    ponto: "bg-amber-500",
  },
  ocupado: {
    label: "Ocupado",
    celula: "bg-purple-100 text-purple-900 ring-purple-300 hover:bg-purple-200",
    ponto: "bg-[#7F2D92]",
  },
  bloqueado: {
    label: "Bloqueado",
    celula: "bg-slate-200 text-slate-700 ring-slate-400 hover:bg-slate-300",
    ponto: "bg-slate-600",
  },
};

function fmtNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function fmtData(valor) {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("pt-BR");
}

function faixaAging(valor) {
  if (valor === null || valor === undefined || valor === "") return AGING_SEM_DADOS;
  const dias = Number(valor);
  if (!Number.isFinite(dias)) return AGING_SEM_DADOS;
  return FAIXAS_AGING.find(faixa => dias <= faixa.ate) || AGING_SEM_DADOS;
}

function fmtAging(valor) {
  if (valor === null || valor === undefined || valor === "") return "Sem aging";
  const dias = Number(valor);
  if (!Number.isFinite(dias)) return "Sem aging";
  return `${dias.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}d méd.`;
}

function fmtAgingProduto(valor) {
  if (valor === null || valor === undefined || valor === "") return "Sem aging";
  const dias = Number(valor);
  if (!Number.isFinite(dias)) return "Sem aging";
  return `${dias.toLocaleString("pt-BR")} ${dias === 1 ? "dia" : "dias"}`;
}

function tituloCoberturaAging(item) {
  if (!item) return "Nenhum produto com aging neste grupo";
  const comAging = Number(item.produtos_com_aging || 0);
  const semAging = Number(item.produtos_sem_aging || 0);
  return `${fmtAging(item.aging_medio_dias)} · ${fmtNumero(comAging)} com aging · ${fmtNumero(semAging)} sem aging`;
}

function Card({ children, className = "" }) {
  return (
    <div className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}>
      {children}
    </div>
  );
}

function Kpi({ icon, titulo, valor, detalhe, cor }) {
  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{titulo}</p>
          <p className="mt-1 text-2xl font-black text-slate-900">{fmtNumero(valor)}</p>
          {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
        </div>
        <div className={`rounded-xl p-2.5 text-white ${cor}`}>
          {createElement(icon, { className: "h-5 w-5" })}
        </div>
      </div>
    </Card>
  );
}

function CampoDetalhe({ rotulo, valor, mono = false }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
      <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{rotulo}</p>
      <p className={`mt-0.5 break-words text-sm font-bold text-slate-800 ${mono ? "font-mono" : ""}`}>
        {valor || "—"}
      </p>
    </div>
  );
}

export default function EstoqueWmsPage() {
  const [resumo, setResumo] = useState(null);
  const [rua, setRua] = useState(8);
  const [bloco, setBloco] = useState(1);
  const [andar, setAndar] = useState(5);
  const [mapa, setMapa] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const alvoEnderecoRef = useRef(null);
  const [loadingResumo, setLoadingResumo] = useState(true);
  const [loadingMapa, setLoadingMapa] = useState(true);
  const [erro, setErro] = useState("");

  const [filtros, setFiltros] = useState({
    busca: "",
    grade: "",
    status: "ocupado",
    rua: "",
  });
  const [resultado, setResultado] = useState({ total: 0, linhas: [] });
  const [pesquisando, setPesquisando] = useState(false);
  const [pagina, setPagina] = useState(1);

  async function carregarResumo() {
    setLoadingResumo(true);
    try {
      setResumo(await buscarResumoEstoqueWms());
      setErro("");
    } catch (e) {
      setErro(`Não foi possível carregar o resumo: ${e.message}`);
    } finally {
      setLoadingResumo(false);
    }
  }

  async function carregarMapa() {
    setLoadingMapa(true);
    try {
      const dados = await buscarMapaAndarWms(rua, bloco, andar);
      setMapa(dados);
      setSelecionado(atual => {
        if (alvoEnderecoRef.current) {
          return dados.find(item => item.endereco_id === alvoEnderecoRef.current) || null;
        }
        if (!atual) return null;
        return dados.find(item => item.endereco_id === atual.endereco_id) || null;
      });
      alvoEnderecoRef.current = null;
      setErro("");
    } catch (e) {
      setMapa([]);
      setSelecionado(null);
      setErro(`Não foi possível carregar o mapa: ${e.message}`);
    } finally {
      setLoadingMapa(false);
    }
  }

  async function executarPesquisa(paginaAlvo = 1) {
    const dados = await pesquisarEstoqueWms({
      ...filtros,
      pagina: paginaAlvo,
      tamanhoPagina: ITENS_POR_PAGINA,
    });
    setResultado(dados);
    setPagina(paginaAlvo);
  }

  async function pesquisar(evento) {
    evento?.preventDefault();
    setPesquisando(true);
    try {
      await executarPesquisa(1);
      setErro("");
    } catch (e) {
      setErro(`Não foi possível pesquisar o estoque: ${e.message}`);
    } finally {
      setPesquisando(false);
    }
  }

  async function atualizarTudo() {
    await Promise.all([carregarResumo(), carregarMapa(), executarPesquisa(pagina)]);
  }

  useEffect(() => {
    let cancelado = false;

    Promise.all([
      buscarResumoEstoqueWms(),
      pesquisarEstoqueWms({
        status: "ocupado",
        pagina: 1,
        tamanhoPagina: ITENS_POR_PAGINA,
      }),
    ])
      .then(([dadosResumo, dadosPesquisa]) => {
        if (cancelado) return;
        setResumo(dadosResumo);
        setResultado(dadosPesquisa);
        setErro("");
      })
      .catch(e => {
        if (!cancelado) setErro(`Não foi possível carregar o estoque: ${e.message}`);
      })
      .finally(() => {
        if (cancelado) return;
        setLoadingResumo(false);
        setPesquisando(false);
      });

    return () => { cancelado = true; };
  }, []);

  const totalPaginas = Math.max(
    1,
    Math.ceil(Number(resultado.total || 0) / ITENS_POR_PAGINA),
  );

  async function mudarPagina(novaPagina) {
    if (novaPagina < 1 || novaPagina > totalPaginas || pesquisando) return;
    setPesquisando(true);
    try {
      await executarPesquisa(novaPagina);
      setErro("");
    } catch (e) {
      setErro(`Não foi possível pesquisar o estoque: ${e.message}`);
    } finally {
      setPesquisando(false);
    }
  }

  useEffect(() => {
    let cancelado = false;

    buscarMapaAndarWms(rua, bloco, andar)
      .then(dados => {
        if (cancelado) return;
        setMapa(dados);
        setSelecionado(atual => {
          if (alvoEnderecoRef.current) {
            return dados.find(item => item.endereco_id === alvoEnderecoRef.current) || null;
          }
          if (!atual) return null;
          return dados.find(item => item.endereco_id === atual.endereco_id) || null;
        });
        alvoEnderecoRef.current = null;
        setErro("");
      })
      .catch(e => {
        if (cancelado) return;
        setMapa([]);
        setSelecionado(null);
        setErro(`Não foi possível carregar o mapa: ${e.message}`);
      })
      .finally(() => {
        if (!cancelado) setLoadingMapa(false);
      });

    return () => { cancelado = true; };
  }, [rua, bloco, andar]);

  const mapaPorPosicao = useMemo(() => {
    const indice = new Map();
    mapa.forEach(item => indice.set(`${item.coluna}-${item.linha}`, item));
    return indice;
  }, [mapa]);

  const ruaResumo = (resumo?.por_rua || []).find(item => Number(item.rua) === rua);
  const blocoResumo = (resumo?.por_bloco || []).find(
    item => Number(item.rua) === rua && Number(item.bloco) === bloco,
  );
  const andarResumo = (resumo?.por_andar || []).find(
    item => Number(item.rua) === rua && Number(item.bloco) === bloco && Number(item.andar) === andar,
  );

  function abrirResultado(item) {
    setLoadingMapa(true);
    setRua(Number(item.rua));
    setBloco(Number(item.bloco));
    setAndar(Number(item.andar));
    alvoEnderecoRef.current = item.endereco_id;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selecionarRua(numero) {
    setLoadingMapa(true);
    setRua(numero);
    if (numero === 15) setBloco(1);
  }

  return (
    <div className="space-y-5">
      {erro && (
        <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
          {erro}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi icon={Warehouse} titulo="Capacidade" valor={resumo?.total} detalhe="Posições físicas ativas" cor="bg-[#7F2D92]" />
        <Kpi icon={Package} titulo="Ocupadas" valor={resumo?.ocupados} detalhe={`${resumo?.ocupacao_percentual || 0}% com reserva`} cor="bg-purple-600" />
        <Kpi icon={Clock3} titulo="Reservadas" valor={resumo?.reservados} detalhe="Armazenagens em andamento" cor="bg-amber-500" />
        <Kpi icon={Boxes} titulo="Livres" valor={resumo?.livres} detalhe="Disponíveis para alocação" cor="bg-emerald-600" />
        <Kpi icon={LockKeyhole} titulo="Bloqueadas" valor={resumo?.bloqueados} detalhe="Fora de uso" cor="bg-slate-600" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-black text-[#4C1D95]">
              <MapPin className="h-5 w-5" /> Mapa físico do estoque
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Rua, bloco e andar usam a média do aging Oracle. Coluna A fica à direita; linhas seguem de cima para baixo.
            </p>
          </div>
          <button
            onClick={atualizarTudo}
            disabled={loadingResumo || loadingMapa || pesquisando}
            className="flex items-center gap-2 rounded-xl bg-[#7F2D92] px-4 py-2 text-sm font-bold text-white hover:bg-[#652276] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loadingResumo || loadingMapa ? "animate-spin" : ""}`} />
            Atualizar
          </button>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-5 xl:grid-cols-[repeat(15,minmax(0,1fr))]">
          {RUAS_WMS.map(item => {
            const ocupacao = (resumo?.por_rua || []).find(r => Number(r.rua) === item.rua);
            const ativo = rua === item.rua;
            const corAging = faixaAging(ocupacao?.aging_medio_dias);
            return (
              <button
                key={item.rua}
                onClick={() => selecionarRua(item.rua)}
                title={tituloCoberturaAging(ocupacao)}
                className={`rounded-xl px-2 py-2.5 text-left ring-1 transition ${corAging.classe} ${
                  ativo ? "outline outline-2 outline-offset-2 outline-[#7F2D92] shadow-md" : ""
                }`}
              >
                <p className="text-sm font-black">RUA {String(item.rua).padStart(2, "0")}</p>
                <p className="truncate text-[9px] font-bold opacity-70">
                  {item.grade}
                </p>
                <p className="mt-1 text-[10px] font-black">
                  {fmtAging(ocupacao?.aging_medio_dias)}
                </p>
                <p className="text-[9px] opacity-70">
                  {ocupacao?.ocupacao_percentual || 0}% ocup.
                </p>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold text-slate-500">Bloco:</span>
          {BLOCOS.map(numero => {
            const dadosBloco = (resumo?.por_bloco || []).find(
              item => Number(item.rua) === rua && Number(item.bloco) === numero,
            );
            const corAging = faixaAging(dadosBloco?.aging_medio_dias);
            return (
              <button
                key={numero}
                disabled={rua === 15 && numero !== 1}
                onClick={() => { setLoadingMapa(true); setBloco(numero); }}
                title={tituloCoberturaAging(dadosBloco)}
                className={`rounded-lg px-3 py-1.5 text-left text-xs font-bold ring-1 ${corAging.classe} ${
                  bloco === numero ? "outline outline-2 outline-offset-1 outline-[#7F2D92]" : ""
                } disabled:cursor-not-allowed disabled:opacity-25`}
              >
                <span className="block">BL {String(numero).padStart(2, "0")}</span>
                <span className="block text-[9px] font-black opacity-75">{fmtAging(dadosBloco?.aging_medio_dias)}</span>
              </button>
            );
          })}

          <span className="ml-3 mr-1 text-xs font-bold text-slate-500">Andar:</span>
          {ANDARES.map(numero => {
            const dadosAndar = (resumo?.por_andar || []).find(
              item => Number(item.rua) === rua && Number(item.bloco) === bloco && Number(item.andar) === numero,
            );
            const corAging = faixaAging(dadosAndar?.aging_medio_dias);
            return (
              <button
                key={numero}
                onClick={() => { setLoadingMapa(true); setAndar(numero); }}
                title={tituloCoberturaAging(dadosAndar)}
                className={`rounded-lg px-3 py-1.5 text-left text-xs font-bold ring-1 ${corAging.classe} ${
                  andar === numero ? "outline outline-2 outline-offset-1 outline-[#7F2D92]" : ""
                }`}
              >
                <span className="block">AD {String(numero).padStart(2, "0")}</span>
                <span className="block text-[9px] font-black opacity-75">{fmtAging(dadosAndar?.aging_medio_dias)}</span>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
          <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">Mapa de calor · aging médio</span>
          {FAIXAS_AGING.map(faixa => (
            <span key={faixa.rotulo} className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${faixa.ponto}`} />
              {faixa.rotulo}
            </span>
          ))}
          <span className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-600">
            <span className={`h-2.5 w-2.5 rounded-full ${AGING_SEM_DADOS.ponto}`} />
            Sem aging
          </span>
          <span className="ml-auto text-[10px] font-bold text-slate-600">
            Rua {fmtAging(ruaResumo?.aging_medio_dias)} · Bloco {fmtAging(blocoResumo?.aging_medio_dias)} · Andar {fmtAging(andarResumo?.aging_medio_dias)}
          </span>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="overflow-x-auto rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="min-w-[690px]">
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "38px repeat(6, minmax(92px, 1fr))" }}
              >
                <div />
                {COLUNAS_VISUAIS.map(coluna => (
                  <div key={coluna} className="pb-1 text-center text-xs font-black text-slate-500">
                    COL {coluna}
                  </div>
                ))}

                {LINHAS.flatMap(linha => [
                  <div key={`rotulo-${linha}`} className="flex items-center justify-center text-xs font-black text-slate-400">
                    {String(linha).padStart(2, "0")}
                  </div>,
                  ...COLUNAS_VISUAIS.map(coluna => {
                    const item = mapaPorPosicao.get(`${coluna}-${linha}`);
                    const status = item?.status_endereco || "livre";
                    const config = STATUS_CONFIG[status] || STATUS_CONFIG.livre;
                    const corAging = faixaAging(item?.aging_dias);
                    const ativo = selecionado?.endereco_id === item?.endereco_id;
                    return (
                      <button
                        key={`${coluna}-${linha}`}
                        disabled={!item || loadingMapa}
                        onClick={() => setSelecionado(item)}
                        className={`min-h-[66px] rounded-xl p-2 text-left ring-1 transition ${corAging.classe} ${
                          ativo ? "outline outline-3 outline-offset-2 outline-[#7F2D92]" : ""
                        } disabled:opacity-40`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-sm font-black">AP {coluna}{String(linha).padStart(2, "0")}</span>
                          <span className={`h-2 w-2 rounded-full ${config.ponto}`} />
                        </div>
                        <p className="mt-1 truncate text-[10px] font-semibold opacity-80">
                          {item?.voucher || config.label}
                        </p>
                        {item?.modelo && (
                          <p className="truncate text-[9px] opacity-70">{item.modelo}</p>
                        )}
                      </button>
                    );
                  }),
                ])}
              </div>
              {loadingMapa && (
                <div className="py-6 text-center text-xs font-bold text-purple-600">Carregando andar...</div>
              )}
            </div>
          </div>

          <div className="rounded-2xl bg-[#FCFAFF] p-4 ring-1 ring-purple-200">
            <p className="text-xs font-bold uppercase tracking-wide text-purple-400">Posição selecionada</p>
            <p className="mt-1 text-xl font-black text-[#4C1D95]">
              {selecionado ? formatarEnderecoWms(selecionado) : "Selecione um AP"}
            </p>

            {selecionado ? (
              <div className="mt-4 space-y-2">
                <CampoDetalhe rotulo="Status do endereço" valor={STATUS_CONFIG[selecionado.status_endereco]?.label || selecionado.status_endereco} />
                <CampoDetalhe rotulo="Voucher" valor={selecionado.voucher} mono />
                <CampoDetalhe rotulo="IMEI" valor={selecionado.imei} mono />
                <CampoDetalhe rotulo="SKU" valor={selecionado.sku} mono />
                <CampoDetalhe rotulo="Produto" valor={[selecionado.marca, selecionado.modelo].filter(Boolean).join(" ")} />
                <div className="grid grid-cols-2 gap-2">
                  <CampoDetalhe rotulo="Grade física" valor={selecionado.grade_fisica} />
                  <CampoDetalhe rotulo="Grade venda" valor={selecionado.grade_venda} />
                </div>
                <CampoDetalhe rotulo="Status do produto" valor={selecionado.status_produto} />
                {selecionado.reserva_referencia && (
                  <div className="grid grid-cols-2 gap-2">
                    <CampoDetalhe rotulo="Canal da alocação" valor={selecionado.reserva_canal} />
                    <CampoDetalhe rotulo="Pedido" valor={selecionado.reserva_referencia} mono />
                  </div>
                )}
                <CampoDetalhe rotulo="Aging Oracle" valor={fmtAgingProduto(selecionado.aging_dias)} />
                <CampoDetalhe rotulo="Armazenado em" valor={fmtData(selecionado.armazenado_em)} />
                {selecionado.status_endereco === "reservado" && (
                  <CampoDetalhe rotulo="Reserva válida até" valor={fmtData(selecionado.reservado_ate)} />
                )}
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">
                Clique em qualquer posição da matriz para visualizar o produto e os dados da armazenagem.
              </p>
            )}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-slate-100 pt-4">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <div key={status} className="flex items-center gap-2 text-xs font-semibold text-slate-600">
              <span className={`h-2.5 w-2.5 rounded-full ${config.ponto}`} />
              {config.label}
            </div>
          ))}
          <span className="ml-auto text-xs font-semibold text-slate-500">
            RUA {String(rua).padStart(2, "0")} · {ruaResumo?.grade || "—"} · {ruaResumo?.ocupacao_percentual || 0}% ocupado/reservado
          </span>
        </div>
      </Card>

      <Card>
        <div>
          <h2 className="flex items-center gap-2 text-lg font-black text-[#4C1D95]">
            <Search className="h-5 w-5" /> Consulta do estoque
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Pesquise por voucher, IMEI, SKU, marca, modelo ou endereço físico.
          </p>
        </div>

        <form onSubmit={pesquisar} className="mt-4 grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_160px_130px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
            <input
              value={filtros.busca}
              onChange={e => setFiltros(f => ({ ...f, busca: e.target.value }))}
              placeholder="Voucher, IMEI, SKU, produto ou endereço"
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-purple-300"
            />
          </div>

          <select
            value={filtros.grade}
            onChange={e => setFiltros(f => ({ ...f, grade: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Todas as grades</option>
            {GRADES_WMS.map(grade => <option key={grade} value={grade}>{grade}</option>)}
          </select>

          <select
            value={filtros.status}
            onChange={e => setFiltros(f => ({ ...f, status: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Todos os status</option>
            <option value="ocupado">Ocupado</option>
            <option value="reservado">Reservado</option>
            <option value="livre">Livre</option>
            <option value="bloqueado">Bloqueado</option>
          </select>

          <select
            value={filtros.rua}
            onChange={e => setFiltros(f => ({ ...f, rua: e.target.value }))}
            className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-300"
          >
            <option value="">Todas as ruas</option>
            {RUAS_WMS.map(item => (
              <option key={item.rua} value={item.rua}>RUA {String(item.rua).padStart(2, "0")}</option>
            ))}
          </select>

          <button
            type="submit"
            disabled={pesquisando}
            className="rounded-xl bg-[#7F2D92] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#652276] disabled:opacity-50"
          >
            {pesquisando ? "Buscando..." : "Buscar"}
          </button>
        </form>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-500">
            {fmtNumero(resultado.total)} resultado{Number(resultado.total) !== 1 ? "s" : ""}
          </p>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <button
              type="button"
              onClick={() => mudarPagina(pagina - 1)}
              disabled={pagina <= 1 || pesquisando}
              className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Anterior
            </button>
            <span>
              Página {fmtNumero(pagina)} de {fmtNumero(totalPaginas)}
            </span>
            <button
              type="button"
              onClick={() => mudarPagina(pagina + 1)}
              disabled={pagina >= totalPaginas || pesquisando}
              className="rounded-lg border border-slate-200 px-3 py-1.5 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        </div>

        <div className="mt-3 overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-[1050px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-3 py-3 font-bold">Endereço</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Voucher</th>
                <th className="px-3 py-3 font-bold">IMEI</th>
                <th className="px-3 py-3 font-bold">SKU</th>
                <th className="px-3 py-3 font-bold">Produto</th>
                <th className="px-3 py-3 font-bold">Grade</th>
                <th className="px-3 py-3 font-bold">Status produto</th>
              </tr>
            </thead>
            <tbody>
              {resultado.linhas.map(item => (
                <tr
                  key={item.endereco_id}
                  onClick={() => abrirResultado(item)}
                  className="cursor-pointer border-t border-slate-100 hover:bg-purple-50/60"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-bold text-purple-700">{item.endereco}</td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-slate-100 px-2 py-1 font-bold text-slate-700">
                      <span className={`h-2 w-2 rounded-full ${STATUS_CONFIG[item.status_endereco]?.ponto || "bg-slate-400"}`} />
                      {STATUS_CONFIG[item.status_endereco]?.label || item.status_endereco}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono font-bold">{item.voucher || "—"}</td>
                  <td className="px-3 py-3 font-mono">{item.imei || "—"}</td>
                  <td className="px-3 py-3 font-mono">{item.sku || "—"}</td>
                  <td className="max-w-[260px] px-3 py-3">
                    <p className="truncate font-semibold">{[item.marca, item.modelo].filter(Boolean).join(" ") || "—"}</p>
                  </td>
                  <td className="px-3 py-3 font-bold">{item.grade_fisica}</td>
                  <td className="px-3 py-3">{item.status_produto || "—"}</td>
                </tr>
              ))}
              {!resultado.linhas.length && !pesquisando && (
                <tr>
                  <td colSpan="8" className="px-3 py-10 text-center text-sm text-slate-400">
                    Nenhum endereço encontrado com os filtros informados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {(resumo?.por_grade || []).map(item => (
          <div key={item.grade} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-black text-slate-700">{item.grade}</p>
              <p className="text-xs font-bold text-purple-700">{item.ocupacao_percentual}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-[#7F2D92]" style={{ width: `${Math.min(100, Number(item.ocupacao_percentual || 0))}%` }} />
            </div>
            <p className="mt-2 text-[11px] text-slate-500">
              {fmtNumero(Number(item.ocupados) + Number(item.reservados))} utilizadas de {fmtNumero(item.total)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

