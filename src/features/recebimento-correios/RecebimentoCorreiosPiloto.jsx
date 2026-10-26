import React, { useEffect, useState } from "react";

/**
 * Módulo piloto. O componente recebe o cliente Supabase autenticado da aplicação,
 * em vez de criar uma sessão paralela. RLS restringe persistência ao usuário master.
 */
export default function RecebimentoCorreiosPiloto({ supabase }) {
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [modalidade, setModalidade] = useState("GRV");
  const [rastreio, setRastreio] = useState("");
  const [voucher, setVoucher] = useState("");
  const [imei, setImei] = useState("");
  const [modelo, setModelo] = useState("");
  const [obs, setObs] = useState("");
  const [match, setMatch] = useState(null);
  const [registros, setRegistros] = useState([]);
  const [message, setMessage] = useState("");
  const MASTER_ID = "b517d70a-56be-4b4f-8b9e-a03c769dd3c3";

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      const ok = !error && data?.user?.id === MASTER_ID;
      setAuthorized(ok); setLoading(false);
      if (ok) carregar();
    })();
    return () => { active = false; };
  }, [supabase]);

  async function carregar() {
    const { data, error } = await supabase.from("recebimento_correios_piloto")
      .select("id,modalidade,codigo_rastreio,voucher_tradein,status_vinculo,recebido_em")
      .order("recebido_em", { ascending: false }).limit(100);
    if (!error) setRegistros(data ?? []);
  }

  async function buscarVoucher() {
    setMessage(""); setMatch(null);
    if (!voucher.trim()) { setMessage("Informe o voucher do Trade-in para consultar."); return; }
    const { data, error } = await supabase.from("tradein_geral")
      .select("voucher_ybv,imei,aparelho,sku,loja,status_atual")
      .eq("voucher_ybv", voucher.trim().toUpperCase()).limit(2);
    if (error) { setMessage("Consulta Trade-in indisponível: " + error.message); return; }
    if (data?.length !== 1) { setMessage(data?.length ? "Mais de um contrato localizado. Encaminhe à análise." : "Contrato não localizado. Registre como pendente e investigue."); return; }
    setMatch(data[0]); setModelo(data[0].aparelho ?? "");
    setMessage("Contrato localizado. Confirme fisicamente o IMEI antes de vincular.");
  }

  async function salvar(e) {
    e.preventDefault(); setMessage("");
    const codigo = rastreio.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(codigo)) { setMessage("Código Correios inválido. Esperado: AA123456789BR."); return; }
    const idVoucher = voucher.trim().toUpperCase();
    const imeiFisico = imei.trim();
    if (imeiFisico && !/^\d{15}$/.test(imeiFisico)) { setMessage("IMEI deve ter 15 dígitos."); return; }
    const vinculado = Boolean(match && match.voucher_ybv === idVoucher && match.imei === imeiFisico);
    const divergente = Boolean(match && imeiFisico && match.imei !== imeiFisico);
    const status = vinculado ? "vinculado" : divergente ? "divergente" : "pendente";
    const { error } = await supabase.from("recebimento_correios_piloto").insert({
      modalidade, codigo_rastreio: codigo, voucher_tradein: idVoucher || null,
      imei_informado: imeiFisico || null, modelo_informado: modelo.trim() || null,
      observacoes: obs.trim() || null, status_vinculo: status
    });
    if (error) { setMessage("Não foi possível registrar: " + error.message); return; }
    setMessage(status === "vinculado"
      ? "Recebimento registrado e vínculo confirmado. Liberação à triagem ainda depende da integração do fluxo."
      : "Recebimento salvo para análise, sem vinculação automática.");
    setRastreio(""); setVoucher(""); setImei(""); setModelo(""); setObs(""); setMatch(null);
    await carregar();
  }

  if (loading) return <div className="p-6">Validando acesso…</div>;
  if (!authorized) return <div className="p-6" role="alert">Acesso restrito ao gestor autorizado.</div>;
  return (
    <main className="mx-auto max-w-6xl p-6 space-y-6">
      <header>
        <p className="text-sm text-slate-500">Liquida System / Piloto restrito</p>
        <h1 className="text-2xl font-bold">Recebimento Correios — GRV / TRAON</h1>
        <p className="text-sm text-slate-600">Código dos Correios é obrigatório; contrato do Trade-in pode ser vinculado posteriormente. Os dados desta etapa não geram entrada Oracle.</p>
      </header>
      <form onSubmit={salvar} className="rounded-xl border p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="grid gap-1">Modalidade
            <select className="border rounded p-2" value={modalidade} onChange={e=>setModalidade(e.target.value)}>
              <option value="GRV">GRV</option><option value="TRAON">Online / TRAON</option>
            </select>
          </label>
          <label className="grid gap-1">Etiqueta Correios (bipar)
            <input className="border rounded p-2" autoFocus required value={rastreio} onChange={e=>setRastreio(e.target.value)} placeholder="AA123456789BR" />
          </label>
          <label className="grid gap-1">Voucher / Contrato Trade-in (opcional no recebimento)
            <input className="border rounded p-2" value={voucher} onChange={e=>{setVoucher(e.target.value);setMatch(null)}} placeholder="YBV..." />
          </label>
          <div className="flex items-end"><button type="button" className="rounded bg-slate-700 px-4 py-2 text-white" onClick={buscarVoucher}>Buscar no Trade-in</button></div>
          <label className="grid gap-1">IMEI físico conferido
            <input className="border rounded p-2" value={imei} onChange={e=>setImei(e.target.value)} inputMode="numeric" maxLength={15}/>
          </label>
          <label className="grid gap-1">Modelo físico
            <input className="border rounded p-2" value={modelo} onChange={e=>setModelo(e.target.value)}/>
          </label>
        </div>
        {match && <section className="border rounded p-3 bg-slate-50">
          <strong>Trade-in encontrado</strong>
          <p>Voucher: {match.voucher_ybv} • IMEI esperado: {match.imei} • Produto: {match.aparelho}</p>
          <p>Loja: {match.loja} • Status: {match.status_atual}</p>
          <p className="text-xs">A associação só será confirmada se o IMEI físico informado coincidir com o IMEI do Trade-in.</p>
        </section>}
        <label className="grid gap-1">Observações
          <textarea className="border rounded p-2" value={obs} onChange={e=>setObs(e.target.value)} rows={2}/>
        </label>
        <button type="submit" className="rounded bg-indigo-700 px-5 py-2 text-white">Registrar recebimento</button>
        {message && <p role="status" className="text-sm">{message}</p>}
      </form>
      <section className="space-y-3">
        <h2 className="font-semibold">Recebimentos do piloto</h2>
        <div className="overflow-x-auto"><table className="w-full text-sm text-left">
          <thead><tr className="border-b"><th className="p-2">Data</th><th className="p-2">Modalidade</th><th className="p-2">Correios</th><th className="p-2">Voucher</th><th className="p-2">Vínculo</th></tr></thead>
          <tbody>{registros.map(r=><tr key={r.id} className="border-b"><td className="p-2">{new Date(r.recebido_em).toLocaleString("pt-BR")}</td><td className="p-2">{r.modalidade}</td><td className="p-2">{r.codigo_rastreio}</td><td className="p-2">{r.voucher_tradein||"—"}</td><td className="p-2">{r.status_vinculo}</td></tr>)}</tbody>
        </table></div>
      </section>
    </main>
  );
}
