import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileSpreadsheet, RefreshCw, Search, ClipboardCheck } from "lucide-react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase.js";

const moedaN = value => Number(value || 0).toLocaleString("pt-BR");
const momento = valor => valor ? new Date(valor).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
const datasExportacao = [
  ["Recebimento físico", "recebido_em"],
  ["Vinculação objeto/voucher", "vinculacao_criada_em"],
  ["Triagem ALS", "triagem_als_em"],
  ["Laudo", "laudo_em"],
  ["Finalização OMNI", "omni_em"],
  ["Decisão do cliente", "decisao_cliente_em"],
  ["Devolução / declaração", "devolucao_em"],
  ["Triagem cosmética", "cosmetica_em"],
  ["Alocação", "alocacao_em"],
  ["Movimentação Oracle", "oracle_em"],
  ["Confirmação Oracle", "oracle_confirmado_em"],
];

const CAMPOS_OBJETO = [
  ["ID do objeto", "objeto_id"],
  ["Número de objeto Correios", "codigo_rastreio"],
  ["ID do recebimento", "recebimento_id"],
  ["Transportadora", "transportadora"],
  ["Destinatário", "destinatario_correios"],
  ["Situação do objeto", "status_objeto"],
  ["Situação do vínculo", "status_vinculo"],
  ["Carga iniciada em", "carga_iniciada_em"],
  ["Carga concluída em", "carga_concluida_em"],
  ["Recebido em", "recebido_em"],
  ["Recebido por", "recebido_por"],
  ["Voucher ativo", "voucher"],
  ["IMEI ALS", "imei_als"],
  ["IMEI 2 ALS", "imei2_als"],
  ["IMEI Warehouse", "imei_warehouse"],
  ["IMEI 2 Warehouse", "imei2_warehouse"],
  ["SKU", "sku"],
  ["Modelo", "modelo"],
  ["Marca", "marca"],
  ["Tipo", "tipo_aparelho"],
  ["Modalidade", "modalidade"],
  ["Vinculação criada em", "vinculacao_criada_em"],
  ["Resultado ALS", "resultado_als"],
  ["Defeitos ALS", "defeitos_als"],
  ["Triagem ALS em", "triagem_als_em"],
  ["Laudo em", "laudo_em"],
  ["OMNI finalizado em", "omni_em"],
  ["Decisão cliente", "decisao_cliente"],
  ["Decisão em", "decisao_cliente_em"],
  ["Devolução em", "devolucao_em"],
  ["Triagem cosmética em", "cosmetica_em"],
  ["Alocação em", "alocacao_em"],
  ["Movimentação Oracle em", "oracle_em"],
  ["Confirmação Oracle em", "oracle_confirmado_em"],
  ["Grade", "grade"],
  ["Local / endereço", "local_warehouse"],
  ["Etapa atual Online", "etapa_online"],
  ["Status atual Warehouse", "status_warehouse"],
  ["Passagens históricas vinculadas", "total_vinculacoes_historicas"],
];
const CAMPOS_VINCULOS = [
  ["ID aparelho / vínculo", "aparelho_id"], ["ID objeto", "objeto_id"],
  ["Objeto Correios", "codigo_rastreio"], ["Vínculo ativo", "ativo"],
  ["Voucher informado", "voucher"], ["IMEI", "imei"], ["IMEI 2", "imei2"],
  ["Modelo", "modelo"], ["Etapa online", "etapa"], ["Resultado ALS", "resultado_als"],
  ["Vinculação em", "vinculacao_em"], ["Triagem ALS em", "triagem_als_em"],
  ["Desvinculado em", "desvinculado_em"], ["ID triagem convencional", "triagem_convencional_id"],
];
const datasKeys = new Set([...datasExportacao.map(([, key]) => key), "carga_iniciada_em", "carga_concluida_em", "vinculacao_em", "desvinculado_em"]);
const asCell = (row, key) => {
  const value = row?.[key];
  if (value === undefined || value === null || value === "") return "";
  if (datasKeys.has(key)) return momento(value);
  if (Array.isArray(value)) return value.join(" | ");
  if (typeof value === "boolean") return value ? "SIM" : "NÃO";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};
const COLUNAS_LINHA_TEMPO = ["Objeto Correios", "Voucher", "Etapa", "Data/hora da passagem", "Resultado ALS", "Status Warehouse"];
const porEtapa = row => {
  if (row.status_objeto === "estornado") return "Estornado";
  if (!row.aparelho_id) return row.total_vinculacoes_historicas ? "Aguardando novo vínculo" : "Aguardando vinculação";
  if (row.oracle_confirmado_em || row.oracle_em) return "Oracle";
  if (row.alocacao_em) return "Alocação";
  if (row.cosmetica_em) return "Cosmética";
  if (row.devolucao_em) return "Devolução";
  if (row.decisao_cliente_em) return "Decisão cliente";
  if (row.laudo_em) return "Laudo";
  if (row.triagem_als_em) return "ALS concluída";
  return "Aguardando ALS";
};
const PAGE = 40;
function gerarAba(wb, nome, headers, rows) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }),
  };
  sheet["!cols"] = headers.map((name) => ({ wch: name.includes("Data") || name.includes(" em") ? 22 : name.includes("IMEI") || name.includes("Voucher") ? 22 : Math.min(38, Math.max(17, name.length + 2)) }));
  XLSX.utils.book_append_sheet(wb, sheet, nome);
}

export default function RelatorioALSFluxoV2Page() {
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [filtrosAplicados, setFiltrosAplicados] = useState({ inicio: "", fim: "" });
  const [textoBusca, setTextoBusca] = useState("");
  const [etapa, setEtapa] = useState("");
  const [apenasAtivos, setApenasAtivos] = useState(false);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState("");
  const [pagina, setPagina] = useState(0);

  const consultar = useCallback(async (filtros) => {
    setCarregando(true);
    setErro("");
    try {
      const { data, error } = await supabase.rpc("assurant_relatorio_als_fluxo", {
        p_data_inicial: filtros.inicio || null,
        p_data_final: filtros.fim || null,
      });
      if (error) throw new Error(error.message);
      if (!data || !Array.isArray(data.objetos) || !Array.isArray(data.historico_vinculos)) {
        throw new Error("Resposta inválida ao consultar a rastreabilidade ALS.");
      }
      setDados(data);
      setFiltrosAplicados(filtros);
      setPagina(0);
    } catch (err) {
      setErro("Não foi possível carregar o relatório: " + err.message);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { void consultar({ inicio: "", fim: "" }); }, [consultar]);

  const objetos = useMemo(() => dados?.objetos || [], [dados]);
  const historico = useMemo(() => dados?.historico_vinculos || [], [dados]);
  const totais = useMemo(() => ({
    recebidos: objetos.length,
    ativos: objetos.filter(x => Boolean(x.aparelho_id)).length,
    semVinculo: objetos.filter(x => !x.aparelho_id && x.status_objeto !== "estornado").length,
    estornados: objetos.filter(x => x.status_objeto === "estornado").length,
    triadosALS: objetos.filter(x => Boolean(x.triagem_als_em)).length,
    cosmetica: objetos.filter(x => Boolean(x.cosmetica_em)).length,
    laudo: objetos.filter(x => Boolean(x.laudo_em)).length,
    oracle: objetos.filter(x => Boolean(x.oracle_em || x.oracle_confirmado_em)).length,
    desvinculados: historico.filter(x => !x.ativo).length,
  }), [objetos, historico]);

  const filtrados = useMemo(() => {
    const busca = textoBusca.trim().toLowerCase();
    return objetos.filter(row => (
      (!apenasAtivos || Boolean(row.aparelho_id)) &&
      (!etapa || porEtapa(row) === etapa) &&
      (!busca || [
        row.codigo_rastreio, row.voucher, row.imei_als, row.imei2_als,
        row.imei_warehouse, row.modelo, row.sku, row.status_warehouse,
      ].some(x => String(x || "").toLowerCase().includes(busca)))
    ));
  }, [objetos, etapa, textoBusca, apenasAtivos]);

  const visualizar = filtrados.slice(pagina * PAGE, (pagina + 1) * PAGE);
  const paginas = Math.max(1, Math.ceil(filtrados.length / PAGE));

  function baixarExcel() {
    if (!dados || exportando) return;
    setExportando(true);
    setErro("");
    try {
      const wb = XLSX.utils.book_new();
      const etapas = ["Recebimento físico", "Vinculação objeto/voucher", "Triagem ALS",
        "Laudo", "Finalização OMNI", "Decisão do cliente", "Devolução / declaração",
        "Triagem cosmética", "Alocação", "Movimentação Oracle", "Confirmação Oracle"];
      gerarAba(wb, "Resumo", ["Indicador", "Quantidade"], [
        ["Objetos de Correios bipados no período", totais.recebidos],
        ["Objetos com vínculo ativo", totais.ativos],
        ["Objetos sem vínculo atual, excluindo estornados", totais.semVinculo],
        ["Objetos estornados (preservados para auditoria)", totais.estornados],
        ["Triagens ALS concluídas, com vínculo ativo", totais.triadosALS],
        ["Laudos registrados, com vínculo ativo", totais.laudo],
        ["Triagens cosméticas registradas, com vínculo ativo", totais.cosmetica],
        ["Oracle registrado, com vínculo ativo", totais.oracle],
        ["Vinculações históricas (ativas e desfeitas)", historico.length],
        ["Vinculações desfeitas", totais.desvinculados],
        ["Referência de data", "Data da bipagem física do objeto no recebimento Correios"],
        ["Início do filtro", filtrosAplicados.inicio || "Todo o histórico"],
        ["Fim do filtro", filtrosAplicados.fim || "Todo o histórico"],
        ["Regra", "Sem data de passagem não significa que a etapa ocorreu. Vínculos antigos ficam em aba separada."],
      ]);
      gerarAba(wb, "Objetos e etapas", CAMPOS_OBJETO.map(x => x[0]),
        filtrados.map(row => CAMPOS_OBJETO.map(([, key]) => asCell(row, key))));
      const listaTempo = filtrados.flatMap(row => datasExportacao
        .filter(([, key]) => Boolean(row[key]))
        .map(([titulo, key]) => [
          row.codigo_rastreio || "", row.voucher || "", titulo,
          asCell(row, key), row.resultado_als || "", row.status_warehouse || "",
        ]));
      gerarAba(wb, "Linha do tempo", COLUNAS_LINHA_TEMPO, listaTempo);
      const ids = new Set(filtrados.map(x => x.objeto_id));
      gerarAba(wb, "Historico de vinculos", CAMPOS_VINCULOS.map(x => x[0]),
        historico.filter(row => ids.has(row.objeto_id))
          .map(row => CAMPOS_VINCULOS.map(([, key]) => asCell(row, key))));
      gerarAba(wb, "Dicionario", ["Campo / etapa", "Interpretação"], [
        ["Recebimento físico", "Data/hora de bipagem de objeto Correios; não implica triagem ALS concluída"],
        ["Vinculação", "Data do vínculo objeto/voucher; pode ter sido desfeito posteriormente"],
        ["Triagem ALS", "Data da triagem ALS registrada no aparelho com vínculo ativo"],
        ["Laudo", "Data de evento de laudo GRV/SAMV na esteira online"],
        ["Decisão cliente", "Data da decisão no fluxo online, quando registrada"],
        ["Cosmética", "Passagem registrada na triagem convencional vinculada ao aparelho ALS"],
        ["Oracle", "Data do movimento/confirmacão registrada na triagem convencional"],
        ["Histórico de vínculos", "Mostra também vínculos desfeitos; não devem contar como vínculo atual"],
        ["Linha do tempo", "Somente passagens com data efetivamente registrada"],
        ["Total de objetos", "Contagem de objetos físicos únicos no filtro (não soma linhas de vínculo)"],
        ["Dado vazio", "Sem registro nesta fonte; não presumir passagem nem que foi pulada"],
      ]);
      const sufixo = (filtrosAplicados.inicio || "inicio") + "_" + (filtrosAplicados.fim || "atual");
      XLSX.writeFile(wb, "Relatorio_Recebimento_ALS_Etapas_" + sufixo + ".xlsx", { compression: true });
    } catch (e) { setErro("Não foi possível gerar o Excel: " + e.message); }
    finally { setExportando(false); }
  }

  return <div className="mx-auto max-w-[1700px] space-y-5 p-4 lg:p-7">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="text-[10px] font-bold uppercase tracking-widest text-violet-700">Assurant · Gestão</div>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">Recebimento ALS · Histórico por etapas</h1>
        <p className="mt-1 text-sm text-slate-500">
          Rastreabilidade desde o recebimento dos objetos Correios até ALS, laudo, decisão, cosmética, armazenagem e Oracle.
        </p>
      </div>
      <button type="button" onClick={baixarExcel} disabled={!dados || carregando || exportando}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-40">
        <Download className="h-4 w-4"/>{exportando ? "Gerando Excel..." : "Exportar Excel"}
      </button>
    </header>

    <section className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <label className="text-xs font-semibold text-slate-600">Recebido de
        <input type="date" value={inicio} max={fim || undefined} onChange={e=>setInicio(e.target.value)}
          className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"/>
      </label>
      <label className="text-xs font-semibold text-slate-600">Recebido até
        <input type="date" value={fim} min={inicio || undefined} onChange={e=>setFim(e.target.value)}
          className="mt-1 block rounded-lg border border-slate-200 px-3 py-2 text-sm"/>
      </label>
      <button type="button" disabled={carregando || Boolean(inicio && fim && inicio > fim)}
        onClick={() => void consultar({ inicio, fim })}
        className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">
        <RefreshCw className={"h-4 w-4 " + (carregando ? "animate-spin" : "")}/>Consultar
      </button>
      <button type="button" onClick={() => {setInicio("");setFim("");void consultar({inicio:"",fim:""});}}
        disabled={carregando} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-40">Todo o período</button>
      <p className="ml-auto text-xs text-slate-500">Referência: data da bipagem no recebimento físico</p>
    </section>

    {erro && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{erro}</p>}
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
      {[
        ["Recebidos",totais.recebidos],["Vínculo ativo",totais.ativos],
        ["Aguardando vínculo",totais.semVinculo],["ALS concluída",totais.triadosALS],
        ["Cosmética",totais.cosmetica],["Vínculos desfeitos",totais.desvinculados],
      ].map(([titulo,valor]) => <div key={titulo} className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="text-[11px] font-semibold text-slate-500">{titulo}</div>
        <div className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{moedaN(valor)}</div>
      </div>)}
    </div>

    <section className="rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
        <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-violet-700"/>
          <h2 className="text-sm font-bold text-slate-800">Objetos e etapas</h2>
          <span className="text-xs text-slate-400">({moedaN(filtrados.length)} de {moedaN(objetos.length)})</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={apenasAtivos} onChange={e=>{setApenasAtivos(e.target.checked);setPagina(0);}}/>
            Somente vinculados
          </label>
          <select value={etapa} onChange={e=>{setEtapa(e.target.value);setPagina(0);}} aria-label="Etapa registrada"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs">
            <option value="">Todas as etapas</option>
            {["Aguardando vinculação","Aguardando novo vínculo","Aguardando ALS","ALS concluída","Laudo","Decisão cliente","Devolução","Cosmética","Alocação","Oracle","Estornado"]
              .map(x=><option key={x} value={x}>{x}</option>)}
          </select>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-slate-400"/>
            <input value={textoBusca} onChange={e=>{setTextoBusca(e.target.value);setPagina(0);}}
              placeholder="Objeto, voucher ou IMEI" className="w-56 rounded-lg border border-slate-200 py-2 pl-8 pr-3 text-xs"/>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1150px] text-left text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>{["Objeto Correios","Voucher","IMEI","Recebimento","Vinculação","Triagem ALS","Laudo","Cosmética","Status atual"].map(x=><th key={x} className="px-4 py-3 font-semibold">{x}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visualizar.map((row) => <tr key={row.objeto_id} className="hover:bg-slate-50">
              <td className="px-4 py-3 font-mono font-semibold">{row.codigo_rastreio}</td>
              <td className="px-4 py-3 font-mono">{row.voucher || "—"}</td>
              <td className="px-4 py-3 font-mono">{row.imei_als || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">{momento(row.recebido_em) || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">{momento(row.vinculacao_criada_em) || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">
                {momento(row.triagem_als_em) || "—"}
                {row.resultado_als && <div className="mt-1 text-violet-700">{row.resultado_als}</div>}
              </td>
              <td className="whitespace-nowrap px-4 py-3">{momento(row.laudo_em) || "—"}</td>
              <td className="whitespace-nowrap px-4 py-3">{momento(row.cosmetica_em) || "—"}</td>
              <td className="px-4 py-3">
                <span className="font-semibold text-slate-700">{row.status_warehouse || row.etapa_online || porEtapa(row)}</span>
                {row.status_objeto === "estornado" && <div className="text-red-700">Objeto estornado</div>}
              </td>
            </tr>)}
            {!visualizar.length && <tr><td colSpan={9} className="p-10 text-center text-slate-500">{carregando?"Consultando...":"Nenhum registro encontrado no filtro."}</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
        <span>Página {pagina+1} de {paginas}</span>
        <div className="flex gap-2">
          <button type="button" disabled={pagina===0} onClick={()=>setPagina(p=>Math.max(0,p-1))}
            className="rounded-md border px-3 py-2 disabled:opacity-40">Anterior</button>
          <button type="button" disabled={pagina+1>=paginas} onClick={()=>setPagina(p=>p+1)}
            className="rounded-md border px-3 py-2 disabled:opacity-40">Próxima</button>
        </div>
      </div>
    </section>
    <p className="text-xs text-slate-500">
      A planilha contém o fluxo por objeto, linha do tempo das etapas com datas registradas e histórico completo de vínculos, inclusive desfeitos.
      Etapas sem data ficam em branco. O campo “Encerrado” no fluxo online não significa necessariamente que o Warehouse concluiu todas as etapas.
    </p>
  </div>;
}
