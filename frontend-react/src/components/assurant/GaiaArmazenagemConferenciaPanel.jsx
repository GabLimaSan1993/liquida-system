import { useEffect, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../../lib/supabase";
import { AlertTriangle, Download, FileSpreadsheet, Loader2, RefreshCw, Upload } from "lucide-react";

const rotulos = {
  PRONTO: "Apto para armazenagem",
  MULTIPLOS_VOUCHERS: "IMEI com mais de um voucher",
  SEM_GRADE_FINAL: "Sem grade registrada no voucher",
  GRADE_COSMETICA_ETAPA_PENDENTE: "Grade existente · etapa pendente",
  JA_NO_WMS: "Já possui alocação WMS",
  ETAPA_PENDENTE: "Etapa operacional pendente",
  CONFERIR_LEGADO: "Conferir fluxo legado do GAIA",
  RESERVADO_B2C: "Reservado para pedido B2C",
  NAO_ENCONTRADO: "Não localizado",
};
const colors = {
  PRONTO: "bg-emerald-50 text-emerald-800",
  MULTIPLOS_VOUCHERS: "bg-amber-50 text-amber-800",
  SEM_GRADE_FINAL: "bg-rose-50 text-rose-700",
  GRADE_COSMETICA_ETAPA_PENDENTE: "bg-amber-50 text-amber-900",
  JA_NO_WMS: "bg-sky-50 text-sky-700",
  RESERVADO_B2C: "bg-orange-50 text-orange-800",
};
function normalizar(v) {
  const s = String(v ?? "").trim().replace(/\u200B|\uFEFF/g, "").toUpperCase();
  if (/^\d{15}$/.test(s) || /^YBV\d+$/.test(s)) return s;
  return null;
}
function textoCabecalho(v) {
  return String(v ?? "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "").toLowerCase();
}
async function lerChaves(file) {
  if (!file || !/\.(xlsx|xls|ods|csv)$/i.test(file.name))
    throw new Error("Selecione XLSX, XLS, ODS ou CSV.");
  if (file.size > 15 * 1024 * 1024) throw new Error("A planilha excede 15 MB.");
  let livro;
  try {
    livro = XLSX.read(await file.arrayBuffer(), { type: "array" });
  } catch (e) {
    throw new Error("Não foi possível ler o arquivo: " + String(e?.message || e));
  }
  const chaves = [], invalidos = [];
  let totalLinhas = 0;
  for (const nome of livro.SheetNames || []) {
    const linhas = XLSX.utils.sheet_to_json(livro.Sheets[nome], {
      header: 1, raw: true, defval: "", blankrows: false,
    });
    if (!linhas.length) continue;
    let cabecalho = -1, colunas = [];
    for (let i = 0; i < Math.min(15, linhas.length); i++) {
      const cols = (linhas[i] || []).map((v, j) =>
        ["imei", "imei1", "imei2", "voucher", "numerovoucher"].includes(textoCabecalho(v)) ? j : -1
      ).filter(j => j >= 0);
      if (cols.length) { cabecalho = i; colunas = cols; break; }
    }
    if (!colunas.length) {
      if (linhas.some(l => (l || []).filter(v => String(v).trim()).length > 1))
        continue;
      colunas = [0];
    }
    for (let i = cabecalho + 1; i < linhas.length; i++) {
      for (const col of colunas) {
        const original = linhas[i]?.[col];
        if (!String(original ?? "").trim()) continue;
        totalLinhas++;
        const chave = normalizar(original);
        if (chave) chaves.push(chave);
        else if (invalidos.length < 12) invalidos.push(nome + ", linha " + (i + 1) + ": " + String(original).slice(0,55));
      }
    }
  }
  const unicos = [...new Set(chaves)];
  if (!unicos.length) throw new Error("Nenhum IMEI de 15 dígitos ou voucher YBV encontrado.");
  if (unicos.length > 600) throw new Error("Máximo de 600 identificadores por consulta. Divida a planilha.");
  return { unicos, repetidos: chaves.length - unicos.length, invalidos, totalLinhas };
}
function baixarCSV(dados) {
  const cab = ["Identificador", "Tipo", "Situação física", "Pendência operacional", "Vouchers vinculados", "Status por voucher", "Grade final", "Grade cosmética já cadastrada", "Grade GAIA", "GAIA status", "WMS ativo"];
  const linhas = (dados?.itens || []).map(i => [
    i.identificador, i.tipo, i.status_fisico || "Fora do lote físico", rotulos[i.classificacao] || i.classificacao,
    (i.candidatos || []).map(c => c.voucher).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.status || "sem status")).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.grade || "pendente")).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.grade_cosmetica || "não registrada")).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.gaia_grade || "não registrada")).join(" | "),
    (i.candidatos || []).map(c => c.voucher + ": " + (c.gaia_status || "—")).join(" | "),
    (i.candidatos || []).map(c => c.wms_ativo ? c.voucher : "").filter(Boolean).join(" | "),
  ]);
  const esc = x => '"' + String(x ?? "").replace(/"/g, '""') + '"';
  const csv = [cab, ...linhas].map(l => l.map(esc).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], {type: "text/csv;charset=utf-8"}));
  const link = document.createElement("a");
  link.href = url; link.download = "Conciliacao_Armazenagem_GAIA.csv";
  document.body.appendChild(link); link.click(); link.remove();
  URL.revokeObjectURL(url);
}

export default function GaiaArmazenagemConferenciaPanel({ onSelecionarVoucher }) {
  const [aberto,setAberto] = useState(false);
  const [carregando,setCarregando] = useState(false);
  const [dados,setDados] = useState(null);
  const [erro,setErro] = useState("");
  const [info,setInfo] = useState("");
  const [regularizando,setRegularizando] = useState(null);
  const [voucherDigitado,setVoucherDigitado] = useState("");
  const [gradeFisica,setGradeFisica] = useState("");
  const [bateriaInformada,setBateriaInformada] = useState("");
  const [observacao,setObservacao] = useState("");
  const [confirmadoFisicamente,setConfirmadoFisicamente] = useState(false);
  const [salvando,setSalvando] = useState(false);
  const [sucesso,setSucesso] = useState("");
  const [filtro,setFiltro] = useState("TODOS");
  const ref = useRef(null);
  // Consulta inicial compacta; a relação permanece recolhida para preservar
  // a função principal de bipagem acima da dobra.
  useEffect(() => {
    let ativo = true;
    supabase.rpc("assurant_armazenagem_diagnostico_planilha", {p_chaves:null})
      .then(({data,error}) => {if(ativo && !error && data) setDados(data);})
      .catch(() => {});
    return () => {ativo=false;};
  }, []);

  function selecionarRegularizacao(c) {
    // A grade cosmética pode existir mesmo sem a coluna grade final.
    // Exibir a existente para mera conferência física, não exigir nova classificação.
    const gradeExistente=String(c.grade_cosmetica || c.grade || c.gaia_grade || "").toUpperCase().trim();
    setRegularizando(c);setVoucherDigitado("");
    setGradeFisica(["QUEBRADO","REGULAR","BOM","MUITO BOM","EXCELENTE","LIKE NEW"].includes(gradeExistente)
      ? gradeExistente : "");
    setBateriaInformada("");setObservacao("");setConfirmadoFisicamente(false);
    setErro("");setSucesso("");
  }

  async function confirmarRegularizacao() {
    if (!regularizando || salvando) return;
    if (voucherDigitado.trim().toUpperCase() !== regularizando.voucher) {
      setErro("Digite exatamente o voucher da etiqueta física para evitar vínculo incorreto.");
      return;
    }
    if (!/^[0-9]{15}$/.test(String(regularizando.imei||"")) || !gradeFisica || !confirmadoFisicamente) {
      setErro("Confirme o IMEI, escolha a grade conferida e marque a declaração de conferência física.");
      return;
    }
    setSalvando(true);setErro("");setSucesso("");
    try {
      const {data,error} = await supabase.rpc("assurant_gaia_legado_liberar_armazenagem",{
        p_voucher:regularizando.voucher,
        p_imei:regularizando.imei,
        p_grade_fisica:gradeFisica,
        p_voucher_confirmado:voucherDigitado.trim().toUpperCase(),
        p_confirmacao:confirmadoFisicamente,
        p_bateria_percentual:bateriaInformada==="" ? null : Number(bateriaInformada),
        p_observacao:observacao.trim() || "Conferência física de legado GAIA na área de armazenagem"
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.erro || "Não foi possível regularizar o cadastro.");
      const liberado=regularizando.voucher;
      setRegularizando(null);
      setSucesso(liberado+" liberado para reserva e bipagem. Classificação final: "+
        data.grade_final+". Histórico das triagens anteriores mantido.");
      const {data:atualizado,error:erroAtualizacao}=await supabase.rpc(
        "assurant_armazenagem_diagnostico_planilha",{p_chaves:null});
      if (!erroAtualizacao && atualizado) setDados(atualizado);
      onSelecionarVoucher?.(liberado);
    } catch(e) {setErro(e?.message || "Falha na regularização. Nada foi liberado.");}
    finally {setSalvando(false);}
  }

  async function consultar(chaves, infoLocal) {
    setCarregando(true); setErro("");
    try {
      const {data,error} = await supabase.rpc("assurant_armazenagem_diagnostico_planilha", { p_chaves: chaves });
      if (error) throw error;
      setDados(data);
      setInfo(infoLocal || "Relação de 06/11/2026, importada para conciliação.");
      setAberto(true);
    } catch (e) { setErro(e?.message || "Falha na conciliação."); }
    finally { setCarregando(false); }
  }

  async function selecionarArquivo(event) {
    const file=event.target.files?.[0];
    event.target.value="";
    if (!file) return;
    setCarregando(true); setErro("");
    try {
      const r=await lerChaves(file);
      const {data,error}=await supabase.rpc("assurant_armazenagem_diagnostico_planilha", {
        p_chaves:r.unicos
      });
      if (error) throw error;
      setDados(data);
      setInfo(file.name + " · " + r.totalLinhas + " valores, " + r.unicos.length +
        " únicos; " + r.repetidos + " repetidos." +
        (r.invalidos.length ? " Linhas inválidas: " + r.invalidos.join("; ") : ""));
      setAberto(true);
    } catch(e) { setErro(e?.message || "Falha no arquivo."); }
    finally { setCarregando(false); }
  }

  return (
    <section className="rounded-2xl border border-violet-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 p-4">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-slate-900">
            <FileSpreadsheet className="h-5 w-5 text-violet-700" />
            Fila física de Armazenagem · GAIA legado
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-500">
            Os identificadores do lote foram declarados fisicamente como Aguardando armazenagem.
            Vínculos de voucher, grade, WMS e B2C continuam rastreáveis. A alocação final
            exige bipagem e não é simulada pelo lote físico.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {dados?.fisico_aguardando != null && (
            <span className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-900">
              {Number(dados.fisico_aguardando).toLocaleString("pt-BR")} aguardando armazenagem · físico
            </span>
          )}
          <button type="button" disabled={carregando} onClick={() => void consultar(null)}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-50">
            {carregando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Ver lista enviada (196)
          </button>
          <input ref={ref} type="file" className="hidden" accept=".xlsx,.xls,.ods,.csv" onChange={selecionarArquivo}/>
          <button type="button" disabled={carregando} onClick={() => ref.current?.click()}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-3 py-2 text-xs font-black text-white disabled:opacity-50">
            <Upload className="h-4 w-4"/> Conferir outra planilha
          </button>
        </div>
      </div>
      {erro && <div role="alert" className="mx-4 mb-4 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">{erro}</div>}
      {sucesso && <div role="status" className="mx-4 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{sucesso}</div>}
      {aberto && dados && (
        <div className="border-t border-slate-100 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-600">{info}</p>
            <div className="flex gap-2">
              <button type="button" onClick={() => baixarCSV(dados)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">
                <Download className="h-4 w-4"/> Exportar CSV
              </button>
              <button type="button" onClick={() => setAberto(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Ocultar</button>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-center sm:grid-cols-4 xl:grid-cols-8">
            {[
              ["Aguardando fisicamente",dados.fisico_aguardando],
              ["Aptos à bipagem",dados.prontos],
              ["Múltiplos vouchers",dados.ambiguos],
              ["Sem grade final",dados.sem_grade],
              ["Já no WMS (únicos)",dados.ja_no_wms],
              ["Reserva B2C (únicos)",dados.reservados_b2c],
              ["Divergências WMS (todo lote)",dados.fisico_divergencias_wms],
              ["Divergências B2C (todo lote)",dados.fisico_divergencias_b2c]
            ].map(([label,n]) => (
              <div key={label} className="rounded-lg bg-slate-50 p-3">
                <div className="text-xl font-black text-slate-950">{Number(n||0).toLocaleString("pt-BR")}</div>
                <div className="mt-1 text-[10px] font-semibold text-slate-500">{label}</div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>
            Aguardando armazenagem é a situação física confirmada para todo o lote.
            Apenas os itens aptos à bipagem recebem novo endereço diretamente.
            Os IMEIs com múltiplos vouchers exigem conferência da etiqueta;
            vínculos WMS/B2C existentes não foram apagados e não autorizam alocação duplicada.
          </div>

          {regularizando && (
            <section className="mt-3 rounded-xl border border-violet-300 bg-violet-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-black text-violet-950">Regularizar legado GAIA antes da armazenagem</h3>
                  <p className="mt-1 text-xs text-violet-800">
                    Voucher <strong>{regularizando.voucher}</strong> · IMEI <strong>{regularizando.imei}</strong>
                    · {regularizando.modelo || "Modelo não informado"}
                  </p>
                  <p className="mt-1 text-xs text-violet-800">
                    Status no GAIA: {regularizando.gaia_status || "não informado"}.
                    {regularizando.grade_cosmetica
                      ? " Grade cosmética já registrada: " + regularizando.grade_cosmetica + "."
                      : " Sem grade cosmética no cadastro atual."}
                    A regularização ficará auditada com seu usuário e horário.
                  </p>
                </div>
                <button type="button" disabled={salvando} onClick={()=>setRegularizando(null)}
                  className="rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-bold text-violet-900">
                  Fechar
                </button>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <label className="text-xs font-bold text-slate-800">
                  Confirme o voucher que está na etiqueta física
                  <input type="text" value={voucherDigitado} onChange={e=>setVoucherDigitado(e.target.value.toUpperCase())}
                    placeholder={regularizando.voucher}
                    className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 font-mono font-semibold outline-none focus:border-violet-500"/>
                </label>
                <label className="text-xs font-bold text-slate-800">
                  Grade física do aparelho — confirme a grade cadastrada *
                  <select value={gradeFisica} onChange={e=>setGradeFisica(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 outline-none focus:border-violet-500">
                    <option value="">Selecione após conferir</option>
                    {["QUEBRADO","REGULAR","BOM","MUITO BOM","EXCELENTE","LIKE NEW"].map(g=>(
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                  {regularizando.grade_cosmetica && (
                    <span className="mt-1 block text-[11px] font-normal text-slate-600">
                      Pré-preenchida pela grade cosmética já existente.
                      Confira no aparelho antes de confirmar; não é uma nova triagem.
                    </span>
                  )}
                </label>
                <label className="text-xs font-bold text-slate-800">
                  Saúde da bateria (%) — se medida
                  <input type="number" min="1" max="100" step="1" value={bateriaInformada}
                    onChange={e=>setBateriaInformada(e.target.value)}
                    placeholder="Ex.: 78 · deixe vazio se sem medição"
                    className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 outline-none focus:border-violet-500"/>
                  <span className="mt-1 block font-normal text-slate-600">
                    Abaixo de 70% vai para QUEBRADO; 70–79% aplica OUTLET.
                  </span>
                </label>
                <label className="text-xs font-bold text-slate-800">
                  Observação da conferência (opcional)
                  <input type="text" value={observacao} onChange={e=>setObservacao(e.target.value)}
                    placeholder="Etiqueta, laudo ou condição física observada"
                    className="mt-1 w-full rounded-lg border border-violet-200 bg-white px-3 py-2 outline-none focus:border-violet-500"/>
                </label>
              </div>
              <label className="mt-4 flex cursor-pointer items-start gap-2 text-xs font-semibold leading-5 text-slate-800">
                <input type="checkbox" className="mt-1" checked={confirmadoFisicamente}
                  onChange={e=>setConfirmadoFisicamente(e.target.checked)}/>
                Confirmo que tenho o aparelho em mãos, conferi voucher, IMEI e grade física
                na etiqueta/produto e autorizo a regularização excepcional do cadastro legado.
                Isso não substitui testes técnicos, não registra triagem como concluída e
                não movimenta o WMS sem a bipagem posterior.
              </label>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button type="button" disabled={salvando||!confirmadoFisicamente||!gradeFisica||
                  voucherDigitado.trim().toUpperCase()!==regularizando.voucher}
                  onClick={()=>void confirmarRegularizacao()}
                  className="rounded-lg bg-violet-700 px-4 py-2 text-xs font-black text-white disabled:opacity-50">
                  {salvando ? "Registrando conferência..." : "Liberar para reservar endereço"}
                </button>
                <span className="text-[11px] text-slate-600">
                  Cadastro de triagem e movimentações anteriores permanecem rastreáveis.
                </span>
              </div>
            </section>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="text-xs font-bold text-slate-600" htmlFor="gaia-filtro-situacao">Mostrar</label>
            <select id="gaia-filtro-situacao" value={filtro} onChange={e=>setFiltro(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold">
              <option value="TODOS">Todos os identificadores</option>
              {Object.entries(rotulos).map(([codigo,titulo])=>(
                <option key={codigo} value={codigo}>{titulo}</option>
              ))}
            </select>
            <span className="text-[11px] text-slate-500">
              {(dados.itens||[]).filter(item=>filtro==="TODOS"||item.classificacao===filtro).length} exibidos
            </span>
          </div>
          <div className="mt-3 max-h-[450px] overflow-auto rounded-xl border border-slate-200">
            <table className="min-w-[920px] w-full text-left text-xs">
              <thead className="sticky top-0 bg-slate-100 text-slate-700">
                <tr>{["Identificador","Posição física","Condição para bipagem","Vouchers / situação / grade","Ação segura"].map(h=>(
                  <th key={h} className="px-3 py-3 font-black">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(dados.itens||[]).filter(item=>filtro==="TODOS"||item.classificacao===filtro).map(item=>(
                  <tr key={item.identificador} className="align-top">
                    <td className="px-3 py-3 font-mono font-bold text-slate-800">{item.identificador}
                      <div className="text-[10px] font-medium text-slate-400">{item.tipo}</div>
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block rounded-lg border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">
                        {item.status_fisico || "Não declarado"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span className={`inline-block rounded-md px-2 py-1 text-[10px] font-bold ${colors[item.classificacao]||"bg-slate-100 text-slate-700"}`}>
                        {rotulos[item.classificacao]||item.classificacao}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-slate-700">
                      {(item.candidatos||[]).map(c=>(
                        <div key={c.voucher} className="mb-1">
                          <strong>{c.voucher}</strong> · {c.status || "—"} ·
                          {c.grade ? " Grade final: " + c.grade : c.grade_cosmetica
                            ? " Grade cosmética existente: " + c.grade_cosmetica + " (etapa pendente)"
                            : c.gaia_grade ? " Grade no GAIA: " + c.gaia_grade
                            : " Sem grade neste voucher"}
                          {c.wms_ativo ? " · WMS ativo" : ""}
                        </div>
                      ))}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(item.candidatos||[]).filter(c=>c.status==="Aguardando armazenagem"&&c.grade&&!c.wms_ativo).map(c=>(
                          <button key={c.voucher} type="button"
                            onClick={() => onSelecionarVoucher?.(c.voucher)}
                            className="rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-800">
                            Abrir {c.voucher}
                          </button>
                        ))}
                        {(item.candidatos||[]).filter(c=>c.origem==="gaia"&&!c.wms_ativo&&!c.grade&&
                          (["Aguardando triagem funcional","Aguardando triagem cosmética"].includes(c.status) ||
                            (c.status==="Aguardando armazenagem" && !c.grade_cosmetica))).map(c=>(
                          <button key={"regularizar-"+c.voucher} type="button" disabled={salvando}
                            onClick={()=>selecionarRegularizacao(c)}
                            className="rounded-md border border-violet-200 bg-violet-50 px-2 py-1 text-[10px] font-black text-violet-800">
                            Conferir e regularizar {c.voucher}
                          </button>
                        ))}
                        {!(item.candidatos||[]).some(c=>(c.status==="Aguardando armazenagem"&&c.grade&&!c.wms_ativo)||
                           (c.origem==="gaia"&&!c.wms_ativo&&!c.grade&&
                            (["Aguardando triagem funcional","Aguardando triagem cosmética"].includes(c.status) ||
                            (c.status==="Aguardando armazenagem" && !c.grade_cosmetica))))&&
                          <span className="text-[10px] text-slate-400">Necessita conciliação / atendimento da etapa</span>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
