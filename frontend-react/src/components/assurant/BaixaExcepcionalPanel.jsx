import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../AuthContext.jsx";
import { supabase } from "../../lib/supabase.js";

const RPC = "assurant_b2c_baixa_excepcional";
const BUCKET = "b2c-baixas-xml";
const button = "rounded-xl bg-violet-700 px-4 py-2 text-xs font-bold text-white disabled:opacity-40";
const input = "mt-1 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm";

async function executar(acao, dados = {}) {
  const { data, error } = await supabase.rpc(RPC, { p_acao: acao, p_dados: dados });
  if (error) throw new Error(error.message);
  return data;
}

async function conferirXML(file, numeroNF) {
  if (!file) throw new Error("Anexe o XML relacionado à baixa.");
  if (!/\.xml$/i.test(file.name) || file.size > 2 * 1024 * 1024 || !file.size) {
    throw new Error("Selecione um arquivo .xml válido com até 2 MB.");
  }
  const conteudo = await file.text();
  if (/<!DOCTYPE/i.test(conteudo)) throw new Error("XML com DOCTYPE não é permitido.");
  const parsed = new DOMParser().parseFromString(conteudo, "application/xml");
  if (parsed.querySelector("parsererror")) throw new Error("O arquivo informado não contém XML bem formado.");
  const tags = [...parsed.getElementsByTagName("*")];
  const numeroNoXML = tags.find(node => node.localName === "nNF")?.textContent?.trim() || "";
  const documentoNFe = tags.some(node => node.localName === "infNFe");
  if (!documentoNFe || !/^[0-9]{1,9}$/.test(numeroNoXML)) {
    throw new Error("O XML deve ser de uma NF-e com número de nota.");
  }
  if (numeroNoXML.replace(/^0+/, "") !== String(numeroNF).replace(/^0+/, "")) {
    throw new Error("NF informada não corresponde ao número da nota presente no XML.");
  }
}

export default function BaixaExcepcionalPanel() {
  const { user, profile } = useAuth();
  const [pedido, setPedido] = useState("");
  const [identificador, setIdentificador] = useState("");
  const [numeroNF, setNumeroNF] = useState("");
  const [tipo, setTipo] = useState("imei");
  const [motivo, setMotivo] = useState("");
  const [xml, setXml] = useState(null);
  const [previa, setPrevia] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [podeAprovar, setPodeAprovar] = useState(false);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [revisao, setRevisao] = useState(null);
  const [parecer, setParecer] = useState("");
  const [erro, setErro] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [busy, setBusy] = useState(false);

  const atualizar = useCallback(async () => {
    const r = await executar("listar", {offset});
    setRegistros(r.dados || []);
    setTotal(r.total || 0);
    setPodeAprovar(r.pode_aprovar === true);
  }, [offset]);

  useEffect(() => {
    let ativo = true;
    atualizar().catch(e => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [atualizar]);

  const contexto = () => ({
    pedido: pedido.trim(),
    identificador: identificador.trim().toUpperCase(),
    tipo,
  });

  const resetPrevia = () => setPrevia(null);

  async function consultar(e) {
    e.preventDefault();
    setBusy(true); setErro(""); setMensagem(""); setPrevia(null);
    try { setPrevia(await executar("simular", contexto())); }
    catch (e) { setErro(e.message); }
    finally { setBusy(false); }
  }

  async function solicitar(e) {
    e.preventDefault();
    if (!previa || !user?.id) return;
    setBusy(true); setErro(""); setMensagem("");
    try {
      if (!/^[0-9]{1,9}$/.test(numeroNF.trim())) throw new Error("Informe número da NF (1 a 9 dígitos).");
      await conferirXML(xml, numeroNF.trim());
      const caminho = user.id + "/" + crypto.randomUUID() + ".xml";
      const { error: errUpload } = await supabase.storage.from(BUCKET).upload(caminho, xml, {
        upsert: false, contentType: "application/xml", cacheControl: "3600",
      });
      if (errUpload) throw new Error("Falha ao vincular XML: " + errUpload.message);
      await executar("solicitar", {
        ...contexto(),
        previa,
        xml_path: caminho,
        numero_nf: numeroNF.trim(),
        justificativa: motivo.trim(),
      });
      setMensagem("Baixa excepcional solicitada com XML vinculado. Aguardando outro aprovador.");
      setPrevia(null); setPedido(""); setIdentificador(""); setNumeroNF(""); setMotivo(""); setXml(null);
      setOffset(0);
      await atualizar();
    } catch (e) { setErro(e.message); }
    finally { setBusy(false); }
  }

  async function decidir(e) {
    e.preventDefault();
    if (!revisao) return;
    setBusy(true); setErro(""); setMensagem("");
    try {
      const resposta = await executar(revisao.acao, {id: revisao.item.id, parecer: parecer.trim()});
      setMensagem(revisao.acao === "aprovar"
        ? resposta?.pedido_concluido
          ? `Baixa de estoque efetivada. Pedido #${resposta.pedido || revisao.item.pedido_referencia} removido de Aguardando Definição e movido para Concluídos, com histórico preservado. Nenhum faturamento foi criado.`
          : "Baixa confirmada com rastreabilidade. Nenhum faturamento foi criado."
        : "Solicitação rejeitada sem movimentar o estoque.");
      setRevisao(null); setParecer("");
      await atualizar();
    } catch (e) { setErro(e.message); }
    finally { setBusy(false); }
  }

  async function abrirXML(caminho) {
    try {
      const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(caminho, 60);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) { setErro("Não foi possível abrir o XML: " + e.message); }
  }

  return <section className="space-y-5 rounded-2xl border border-violet-200 bg-white p-5">
    <header>
      <h2 className="text-lg font-black text-slate-800">Baixa excepcional — qualquer etapa</h2>
      <p className="mt-1 text-sm text-slate-500">
        Para produtos ainda não faturados, pedidos faturados com outro IMEI ou equipamentos identificados por serial.
        Aceita pedidos em Aguardando Definição. Exige IMEI/serial, número da NF, XML correspondente, motivo e aprovação por outro responsável.
      </p>
    </header>
    {erro && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{erro}</p>}
    {mensagem && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{mensagem}</p>}
    <form onSubmit={consultar} className="grid gap-3 md:grid-cols-3">
      <label className="text-xs font-semibold">Número do pedido (opcional)
        <input value={pedido} onChange={e=>{setPedido(e.target.value);resetPrevia();}} placeholder="Nº do pedido" className={input}/>
      </label>
      <label className="text-xs font-semibold">Identificação
        <select value={tipo} onChange={e=>{setTipo(e.target.value);resetPrevia();}} className={input}>
          <option value="imei">IMEI</option><option value="serial">Serial (relógio/tablet)</option>
        </select>
      </label>
      <label className="text-xs font-semibold">IMEI ou serial do produto
        <input required minLength={4} value={identificador} onChange={e=>{setIdentificador(e.target.value);resetPrevia();}}
          placeholder={tipo === "imei" ? "15 dígitos" : "Serial do equipamento"} className={input}/>
      </label>
      <div className="md:col-span-3"><button type="submit" disabled={busy} className={button}>Conferir produto</button></div>
    </form>
    {previa && <form onSubmit={solicitar} className="space-y-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="font-black text-slate-800">Conferência e documentação obrigatória</h3>
      <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Pedido",previa.pedido || "Sem pedido vinculado"],
          ["Status do pedido",previa.status_pedido || "—"],
          ["Identificador",previa.identificador],
          ["IMEI do pedido",previa.imei_do_pedido || "Não informado"],
          ["Status do produto",previa.status_produto || "—"],
          ["Alocação WMS",previa.alocacao_id || "Sem alocação ativa"],
          ["Voucher",previa.voucher || "—"],
          ["Reserva ativa",previa.reserva_ativa ? "Sim — será cancelada na aprovação" : "Não"],
        ].map(([k,v])=><div key={k}><dt className="text-xs font-semibold text-slate-500">{k}</dt>
          <dd className="break-all font-bold text-slate-800">{v}</dd></div>)}
      </dl>
      <label className="block text-xs font-semibold">Motivo da baixa
        <textarea required minLength={10} maxLength={2000} value={motivo} onChange={e=>setMotivo(e.target.value)}
          placeholder="Descreva o motivo da baixa, inclusive divergência entre IMEI físico e faturado quando houver."
          className={input} rows={3}/>
      </label>
      <label className="block text-xs font-semibold">Número da NF para esta baixa
        <input required inputMode="numeric" pattern="[0-9]{1,9}" value={numeroNF}
          onChange={e=>setNumeroNF(e.target.value.replace(/\D/g, ""))}
          placeholder="Número da nota fiscal" className={input}/>
      </label>
      <label className="block text-xs font-semibold">XML vinculado à NF (.xml, até 2 MB)
        <input required type="file" accept=".xml,text/xml,application/xml" onChange={e=>setXml(e.target.files?.[0]||null)}
          className={input}/>
      </label>
      <p className="text-xs text-amber-800">
        A baixa não cria nota fiscal, não altera o faturamento e registra quem solicitou e quem aprovou.
        Uma alocação WMS ativa só será retirada após a aprovação.
      </p>
      <button disabled={busy || !xml || !/^[0-9]{1,9}$/.test(numeroNF.trim()) || motivo.trim().length<10} className={button}>Solicitar baixa com NF e XML</button>
    </form>}
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold">Solicitações excepcionais ({total})</h3>
        <button className={button} type="button" onClick={()=>atualizar().catch(e=>setErro(e.message))} disabled={busy}>Atualizar</button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="bg-slate-50"><tr>
            <th className="p-3">Pedido</th><th className="p-3">IMEI / serial</th><th className="p-3">Status</th>
            <th className="p-3">Solicitante</th><th className="p-3">Documentação</th><th className="p-3">Ações</th>
          </tr></thead>
          <tbody>{registros.map(item=><tr className="border-t" key={item.id}>
            <td className="p-3">{item.pedido_referencia || item.antes?.pedido || "—"}</td>
            <td className="p-3 font-semibold">{item.identificador}<div className="text-slate-400">{item.tipo_identificador}</div></td>
            <td className="p-3">{item.status}</td>
            <td className="p-3">{item.solicitante}</td>
            <td className="p-3">
              <div><b>NF:</b> {item.numero_nf || "—"}</div>
              <button type="button" className="font-semibold text-violet-700 underline" onClick={()=>abrirXML(item.xml_path)}>Abrir XML</button>
              <details className="mt-2"><summary>Motivo e parecer</summary><p className="max-w-xs whitespace-pre-wrap">{item.justificativa}</p>
                <p className="max-w-xs whitespace-pre-wrap">{item.parecer || "Aguardando decisão"}</p></details>
            </td>
            <td className="p-3">
              {item.status==="pendente" && podeAprovar && item.solicitado_por!==user?.id
                ? <div className="flex gap-2">
                    <button type="button" className={button} onClick={()=>{setRevisao({acao:"aprovar",item});setParecer("");}}>Aprovar</button>
                    <button type="button" className="rounded-xl border px-3 py-2 font-semibold" onClick={()=>{setRevisao({acao:"rejeitar",item});setParecer("");}}>Rejeitar</button>
                  </div>
                : item.status==="pendente" ? "Aguarda outro aprovador" : item.aprovador || "—"}
            </td>
          </tr>)}</tbody>
        </table>
        {!registros.length && <p className="py-5 text-sm text-slate-500">Nenhuma baixa excepcional registrada.</p>}
      </div>
      <div className="flex items-center justify-end gap-3">
        <button type="button" className="rounded-lg border px-3 py-2 text-xs" disabled={busy || !offset} onClick={()=>setOffset(v=>Math.max(0,v-50))}>Anterior</button>
        <span className="text-xs text-slate-500">{offset+1}–{Math.min(offset+50,total)}</span>
        <button type="button" className="rounded-lg border px-3 py-2 text-xs" disabled={busy || offset+50>=total} onClick={()=>setOffset(v=>v+50)}>Próxima</button>
      </div>
    </div>
    {revisao && <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/60 p-3 sm:p-6" role="presentation">
      <form role="dialog" aria-modal="true" aria-labelledby="baixa-excepcional-titulo-decisao" onSubmit={decidir}
        className="max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-2xl border border-violet-200 bg-white p-5 shadow-2xl sm:p-6">
      <h3 id="baixa-excepcional-titulo-decisao" className="text-lg font-bold text-slate-900">{revisao.acao === "aprovar" ? "Aprovar baixa física / administrativa" : "Rejeitar baixa"}</h3>
      {erro && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{erro}</p>}
      <p className="text-sm">Pedido: <b>{revisao.item.pedido_referencia || "—"}</b> · IMEI/serial: <b>{revisao.item.identificador}</b> · NF: <b>{revisao.item.numero_nf || "—"}</b>. Confira o XML e o motivo antes da decisão.</p>
      <button type="button" className="text-sm font-bold text-violet-700 underline" onClick={()=>abrirXML(revisao.item.xml_path)}>Conferir XML</button>
      <p className="text-sm">{revisao.item.justificativa}</p>
      <textarea autoFocus required minLength={10} maxLength={2000} className={input} value={parecer}
        onChange={e=>setParecer(e.target.value)} placeholder="Parecer obrigatório do aprovador"/>
      <div className="flex gap-3">
        <button type="submit" className={button} disabled={busy || parecer.trim().length<10}>{busy ? "Processando..." : revisao.acao==="aprovar" ? "Confirmar aprovação" : "Confirmar rejeição"}</button>
        <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold" disabled={busy} onClick={()=>{setRevisao(null);setParecer("");setErro("");}}>Cancelar</button>
      </div>
    </form></div>}
  </section>;
}
