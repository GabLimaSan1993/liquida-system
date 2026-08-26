import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Clock3,
  DollarSign,
  Ban,
  PackageCheck,
  RefreshCw,
  Store,
  Users,
} from "lucide-react";
import {
  buscarCortesPainelGestorB2C,
  formatarDataHoraSP,
  hojeEmSaoPaulo,
} from "../services/B2CPainelGestorService.js";

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 ${className}`}
    >
      {children}
    </div>
  );
}

function fmtMoeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function fmtNumero(valor) {
  return Number(valor || 0).toLocaleString("pt-BR");
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
}) {
  return (
    <Card className="min-w-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">
            {label}
          </p>

          <p className="mt-1 text-2xl font-black text-slate-800">
            {value}
          </p>

          <p className="mt-0.5 text-xs text-slate-400">
            {sub}
          </p>
        </div>

        <div className="rounded-xl bg-purple-50 p-2 text-[#7F2D92]">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({
  chave,
  label,
}) {
  const cores = {
    picking:
      "bg-purple-50 text-purple-700 ring-purple-200",

    faturamento:
      "bg-amber-50 text-amber-700 ring-amber-200",

    validacao:
      "bg-orange-50 text-orange-700 ring-orange-200",

    definicao:
      "bg-blue-50 text-blue-700 ring-blue-200",

    aguardando_alocacao:
      "bg-slate-50 text-slate-600 ring-slate-200",

    concluido:
      "bg-emerald-50 text-emerald-700 ring-emerald-200",

    cancelado:
      "bg-red-50 text-red-700 ring-red-200",

    outro:
      "bg-slate-50 text-slate-600 ring-slate-200",
  };

  return (
    <span
      className={`inline-flex rounded-lg px-2 py-1 text-[11px] font-semibold ring-1 ${
        cores[chave] || cores.outro
      }`}
    >
      {label}
    </span>
  );
}

function MarketplaceResumo({
  corte,
}) {
  const valores =
    corte.faturamentoPorMarketplace || {};

  const linhas = [
    [
      "Magalu",
      valores.Magalu || 0,
    ],
    [
      "Mercado Livre",
      valores["Mercado Livre"] || 0,
    ],
    [
      "Via Varejo",
      valores["Via Varejo"] || 0,
    ],
  ];

  if (valores.Outros) {
    linhas.push([
      "Outros",
      valores.Outros,
    ]);
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
        Em faturamento
      </h4>

      <div className="space-y-1.5">
        {linhas.map(
          ([
            nome,
            quantidade,
          ]) => (
            <div
              key={nome}
              className="flex items-center justify-between gap-4 text-xs"
            >
              <span className="text-slate-600">
                {nome}
              </span>

              <strong className="text-slate-800">
                {quantidade}
              </strong>
            </div>
          )
        )}
      </div>
    </div>
  );
}

function DefinicaoResumo({
  corte,
}) {
  return (
    <div>
      <h4 className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">
        Definição de produto
      </h4>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-slate-600">
            Em processo de validação
          </span>

          <strong className="text-slate-800">
            {corte.definicao
              ?.emValidacao || 0}
          </strong>
        </div>

        <div className="flex items-center justify-between gap-4 text-xs">
          <span className="text-slate-600">
            Aguardando definição
          </span>

          <strong className="text-slate-800">
            {corte.definicao
              ?.aguardando || 0}
          </strong>
        </div>
      </div>
    </div>
  );
}

function DetalhesDoCorte({
  corte,
}) {
  return (
    <div className="space-y-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <div className="grid gap-4 sm:grid-cols-2">
        <MarketplaceResumo
          corte={corte}
        />

        <DefinicaoResumo
          corte={corte}
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-slate-200">
        <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="whitespace-nowrap px-3 py-2.5 font-bold">
                Entrada
              </th>

              <th className="whitespace-nowrap px-3 py-2.5 font-bold">
                Pedido AnyMarket
              </th>

              <th className="whitespace-nowrap px-3 py-2.5 font-bold">
                Marketplace
              </th>

              <th className="px-3 py-2.5 font-bold">
                Cliente
              </th>

              <th className="px-3 py-2.5 font-bold">
                Produto
              </th>

              <th className="whitespace-nowrap px-3 py-2.5 text-center font-bold">
                Itens
              </th>

              <th className="whitespace-nowrap px-3 py-2.5 font-bold">
                Status atual
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">
            {corte.pedidos.length ===
            0 ? (
              <tr>
                <td
                  colSpan={7}
                  className="px-3 py-8 text-center text-sm text-slate-400"
                >
                  Este corte foi
                  realizado, mas nenhum
                  pedido novo entrou na
                  esteira.
                </td>
              </tr>
            ) : (
              corte.pedidos.map(
                (pedido) => (
                  <tr
                    key={
                      pedido.idAnymarket
                    }
                    className="align-top hover:bg-slate-50"
                  >
                    <td className="whitespace-nowrap px-3 py-3 font-semibold text-slate-700">
                      {
                        pedido.entradaHora
                      }
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 font-bold text-slate-800">
                      {
                        pedido.idAnymarket
                      }
                    </td>

                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">
                      {
                        pedido.marketplace
                      }
                    </td>

                    <td className="min-w-[160px] px-3 py-3 text-slate-600">
                      {pedido.cliente}
                    </td>

                    <td className="min-w-[240px] px-3 py-3 text-slate-600">
                      <span>
                        {pedido.titulo}
                      </span>

                      {pedido.outrosTitulos >
                        0 && (
                        <span className="ml-1 text-[11px] text-slate-400">
                          +
                          {
                            pedido.outrosTitulos
                          }{" "}
                          produto(s)
                        </span>
                      )}
                    </td>

                    <td className="px-3 py-3 text-center font-bold text-slate-700">
                      {
                        pedido.quantidadeItens
                      }
                    </td>

                    <td className="whitespace-nowrap px-3 py-3">
                      <StatusBadge
                        chave={
                          pedido.statusChave
                        }
                        label={
                          pedido.statusLabel
                        }
                      />
                    </td>
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ConsolidadoDaJanela({
  consolidado,
}) {
  const dados =
    consolidado || {};

  const marketplaces =
    dados.porMarketplace || [];

  const status =
    dados.porStatus || [];

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-black text-slate-800">
          Consolidado da janela
          operacional
        </h3>

        <p className="text-xs text-slate-500">
          Pedidos distintos, valores e
          cancelamentos entre as duas
          viradas de 13h.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          icon={DollarSign}
          label="Valor total"
          value={fmtMoeda(
            dados.valorTotal
          )}
          sub={`${fmtNumero(
            dados.pedidos
          )} pedidos · ${fmtNumero(
            dados.itens
          )} itens`}
        />

        <KpiCard
          icon={PackageCheck}
          label="Valor ativo"
          value={fmtMoeda(
            dados.valorAtivo
          )}
          sub={`${fmtNumero(
            dados.pedidosAtivos
          )} pedidos não cancelados`}
        />

        <KpiCard
          icon={Ban}
          label="Cancelamentos"
          value={fmtNumero(
            dados.pedidosCancelados
          )}
          sub={`${fmtNumero(
            dados.itensCancelados
          )} itens cancelados`}
        />

        <KpiCard
          icon={Ban}
          label="Valor cancelado"
          value={fmtMoeda(
            dados.valorCancelado
          )}
          sub="retirado do valor ativo"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <Store className="h-4 w-4 text-[#7F2D92]" />

            <div>
              <h4 className="text-sm font-black text-slate-800">
                Consolidado por
                marketplace
              </h4>

              <p className="text-xs text-slate-500">
                Quantidades e valores
                sem duplicar pedidos com
                vários produtos.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left font-bold">
                    Marketplace
                  </th>

                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                    Pedidos
                  </th>

                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                    Itens
                  </th>

                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                    Valor total
                  </th>

                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                    Cancelados
                  </th>

                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                    Valor cancelado
                  </th>

                  <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                    Valor ativo
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {marketplaces.length ===
                0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-slate-400"
                    >
                      Nenhum pedido
                      encontrado na
                      janela.
                    </td>
                  </tr>
                ) : (
                  marketplaces.map(
                    (item) => (
                      <tr
                        key={
                          item.marketplace
                        }
                        className="hover:bg-slate-50"
                      >
                        <td className="px-3 py-3 text-left font-bold text-slate-700">
                          {
                            item.marketplace
                          }
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-slate-700">
                          {fmtNumero(
                            item.pedidos
                          )}
                        </td>

                        <td className="px-3 py-3 text-right text-slate-600">
                          {fmtNumero(
                            item.itens
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-slate-700">
                          {fmtMoeda(
                            item.valorTotal
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-red-600">
                          {fmtNumero(
                            item.pedidosCancelados
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-red-600">
                          {fmtMoeda(
                            item.valorCancelado
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-black text-emerald-700">
                          {fmtMoeda(
                            item.valorAtivo
                          )}
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>

              {marketplaces.length >
                0 && (
                <tfoot className="bg-purple-50 text-slate-800">
                  <tr>
                    <td className="px-3 py-3 font-black">
                      Total
                    </td>

                    <td className="px-3 py-3 text-right font-black">
                      {fmtNumero(
                        dados.pedidos
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-black">
                      {fmtNumero(
                        dados.itens
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-black">
                      {fmtMoeda(
                        dados.valorTotal
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-black text-red-600">
                      {fmtNumero(
                        dados.pedidosCancelados
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-black text-red-600">
                      {fmtMoeda(
                        dados.valorCancelado
                      )}
                    </td>

                    <td className="px-3 py-3 text-right font-black text-emerald-700">
                      {fmtMoeda(
                        dados.valorAtivo
                      )}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-[#7F2D92]" />

            <div>
              <h4 className="text-sm font-black text-slate-800">
                Consolidado por status
              </h4>

              <p className="text-xs text-slate-500">
                Situação operacional
                atual dos pedidos.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left font-bold">
                    Status
                  </th>

                  <th className="px-3 py-3 text-right font-bold">
                    Pedidos
                  </th>

                  <th className="px-3 py-3 text-right font-bold">
                    Valor
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {status.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-3 py-8 text-center text-slate-400"
                    >
                      Nenhum status
                      encontrado.
                    </td>
                  </tr>
                ) : (
                  status.map(
                    (item) => (
                      <tr
                        key={item.chave}
                        className="hover:bg-slate-50"
                      >
                        <td className="px-3 py-3 text-left">
                          <StatusBadge
                            chave={
                              item.chave
                            }
                            label={
                              item.label
                            }
                          />
                        </td>

                        <td className="px-3 py-3 text-right font-black text-slate-700">
                          {fmtNumero(
                            item.pedidos
                          )}
                        </td>

                        <td className="px-3 py-3 text-right font-semibold text-slate-700">
                          {fmtMoeda(
                            item.valor
                          )}
                        </td>
                      </tr>
                    )
                  )
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default function B2CPainelGestorPage() {
  const [
    dataSelecionada,
    setDataSelecionada,
  ] = useState(
    hojeEmSaoPaulo()
  );

  const [
    dados,
    setDados,
  ] = useState(null);

  const [
    loading,
    setLoading,
  ] = useState(true);

  const [
    erro,
    setErro,
  ] = useState("");

  const [
    corteAberto,
    setCorteAberto,
  ] = useState(null);

  const carregar = useCallback(
    async (
      silencioso = false
    ) => {
      if (!silencioso) {
        setLoading(true);
      }

      setErro("");

      try {
        const resposta =
          await buscarCortesPainelGestorB2C(
            dataSelecionada
          );

        if (!resposta.ok) {
          throw new Error(
            resposta.erro
          );
        }

        setDados(resposta);

        setCorteAberto(
          (atual) => {
            if (
              atual &&
              resposta.cortes.some(
                (corte) =>
                  corte.chave ===
                  atual
              )
            ) {
              return atual;
            }

            return (
              resposta.cortes.at(-1)
                ?.chave || null
            );
          }
        );
      } catch (error) {
        console.error(error);

        setDados(null);

        setErro(
          error?.message ||
            "Não foi possível carregar o painel."
        );
      } finally {
        if (!silencioso) {
          setLoading(false);
        }
      }
    },
    [dataSelecionada]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    let intervaloId;

    const agora =
      new Date();

    const proximaHora =
      new Date(agora);

    proximaHora.setMinutes(
      60,
      5,
      0
    );

    const espera = Math.max(
      1000,
      proximaHora.getTime() -
        agora.getTime()
    );

    const timeoutId =
      window.setTimeout(() => {
        carregar(true);

        intervaloId =
          window.setInterval(
            () => carregar(true),
            60 * 60 * 1000
          );
      }, espera);

    return () => {
      window.clearTimeout(
        timeoutId
      );

      if (intervaloId) {
        window.clearInterval(
          intervaloId
        );
      }
    };
  }, [carregar]);

  const resumo =
    dados?.resumo || {};

  const cortes =
    dados?.cortes || [];

  const ultimoCorte =
    cortes.at(-1) || null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <BarChart3 className="h-6 w-6 text-[#7F2D92]" />

        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-slate-800">
            Painel Gestor · B2C
          </h2>

          <p className="text-xs text-slate-500">
            Entrada e andamento dos
            pedidos por janela
            operacional do AnyMarket
          </p>
        </div>
      </div>

      <div className="border-b border-slate-200">
        <button
          type="button"
          className="inline-flex items-center gap-2 border-b-2 border-[#7F2D92] px-3 py-2 text-sm font-bold text-[#7F2D92]"
        >
          <Clock3 className="h-4 w-4" />
          Cortes da janela operacional
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-slate-600">
            Data operacional
          </span>

          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />

            <input
              type="date"
              value={
                dataSelecionada
              }
              onChange={(
                event
              ) =>
                setDataSelecionada(
                  event.target
                    .value
                )
              }
              className="rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-100"
            />
          </div>
        </label>

        <button
          type="button"
          onClick={() =>
            carregar()
          }
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl bg-[#7F2D92] px-4 py-2 text-sm font-bold text-white transition hover:bg-purple-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <RefreshCw
            className={`h-4 w-4 ${
              loading
                ? "animate-spin"
                : ""
            }`}
          />

          Atualizar
        </button>

        <span className="rounded-xl bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 ring-1 ring-blue-200">
          Atualização automática a cada
          hora
        </span>
      </div>

      <p className="text-xs text-slate-500">
        A data selecionada considera os
        cortes do dia anterior após
        13:00 até 13:00 do dia
        escolhido.
      </p>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-200 border-t-[#7F2D92]" />
        </div>
      ) : erro ? (
        <Card className="py-10 text-center">
          <AlertTriangle className="mx-auto mb-2 h-8 w-8 text-amber-500" />

          <p className="text-sm font-semibold text-slate-700">
            Não foi possível carregar o
            painel.
          </p>

          <p className="mt-1 text-xs text-slate-500">
            {erro}
          </p>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <KpiCard
              icon={Users}
              label="Entraram na janela"
              value={
                resumo.pedidosNoDia ||
                0
              }
              sub="pedidos AnyMarket distintos"
            />

            <KpiCard
              icon={Clock3}
              label="Cortes realizados"
              value={
                resumo.cortesRealizados ||
                0
              }
              sub="entre as duas viradas de 13h"
            />

            <KpiCard
              icon={PackageCheck}
              label={
                ultimoCorte
                  ? `Último corte · ${ultimoCorte.dataLabel} · ${ultimoCorte.hora}`
                  : "Último corte"
              }
              value={
                resumo.pedidosUltimoCorte ||
                0
              }
              sub="pedidos que entraram no corte"
            />
          </div>

          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-black text-slate-800">
                  Cortes da janela
                  operacional
                </h3>

                <p className="text-xs text-slate-500">
                  Clique na data e no
                  horário para abrir
                  todos os pedidos que
                  entraram naquele
                  corte.
                </p>
              </div>

              {dados?.atualizadoEm && (
                <span className="text-[11px] text-slate-400">
                  Atualizado em{" "}
                  {formatarDataHoraSP(
                    dados.atualizadoEm
                  )}
                </span>
              )}
            </div>

            {cortes.length ===
            0 ? (
              <div className="py-10 text-center text-slate-400">
                <Clock3 className="mx-auto mb-2 h-8 w-8 opacity-40" />

                <p className="text-sm font-semibold">
                  Nenhum corte
                  encontrado nesta
                  data.
                </p>

                <p className="mt-1 text-xs">
                  Os cortes aparecem
                  após a entrada dos
                  pedidos pelo upload
                  do AnyMarket.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="whitespace-nowrap px-3 py-3 font-bold">
                        Corte
                      </th>

                      <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                        Entraram na
                        esteira
                      </th>

                      <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                        Acumulado da
                        janela
                      </th>

                      <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                        Em picking
                      </th>

                      <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                        Em faturamento
                      </th>

                      <th className="whitespace-nowrap px-3 py-3 text-right font-bold">
                        Aguard. definição
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {cortes.map(
                      (corte) => {
                        const aberto =
                          corteAberto ===
                          corte.chave;

                        return (
                          <FragmentoCorte
                            key={
                              corte.chave
                            }
                            corte={
                              corte
                            }
                            aberto={
                              aberto
                            }
                            onToggle={() =>
                              setCorteAberto(
                                aberto
                                  ? null
                                  : corte.chave
                              )
                            }
                          />
                        );
                      }
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <ConsolidadoDaJanela
            consolidado={
              dados?.consolidado
            }
          />
        </>
      )}
    </div>
  );
}

function FragmentoCorte({
  corte,
  aberto,
  onToggle,
}) {
  return (
    <>
      <tr
        className={
          aberto
            ? "bg-purple-50/60"
            : "hover:bg-slate-50"
        }
      >
        <td className="px-3 py-2.5">
          <button
            type="button"
            onClick={onToggle}
            className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-black transition ${
              aberto
                ? "bg-[#7F2D92] text-white"
                : "bg-white text-[#7F2D92] ring-1 ring-purple-200 hover:bg-purple-50"
            }`}
          >
            {corte.dataLabel} ·{" "}
            {corte.hora}

            {aberto ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </button>
        </td>

        <td className="px-3 py-2.5 text-right font-black text-slate-800">
          {corte.pedidosEntraram}
        </td>

        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
          {corte.acumuladoDia}
        </td>

        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
          {corte.emPicking}
        </td>

        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
          {corte.emFaturamento}
        </td>

        <td className="px-3 py-2.5 text-right font-semibold text-slate-700">
          {corte.aguardandoDefinicao}
        </td>
      </tr>

      {aberto && (
        <tr>
          <td
            colSpan={6}
            className="px-3 py-4"
          >
            <DetalhesDoCorte
              corte={corte}
            />
          </td>
        </tr>
      )}
    </>
  );
}