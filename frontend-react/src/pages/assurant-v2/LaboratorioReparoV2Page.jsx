import { useCallback, useEffect, useMemo, useState } from 'react';
import { ClipboardList, Wrench, Truck, PackageCheck, Printer, RefreshCw, ArrowLeft, Plus, X, CheckCircle2, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../AuthContext.jsx';
import { laboratorioReparo } from '../../services/laboratorioReparoService.js';

const formatarData = v => v ? new Date(v).toLocaleString('pt-BR', {timeZone:'America/Sao_Paulo'}) : '—';
const nRom = r => 'LAB-' + (r.tipo === 'envio' ? 'ENV-' : 'DEV-') + String(r.numero || 0).padStart(6,'0');
const statusNome = {aguardando_recebimento:'Aguardando recebimento',recebido:'Recebido no laboratório',em_reparo:'Em reparo',concluido:'Reparo concluído',em_devolucao:'Aguardando warehouse',devolvido_warehouse:'Devolvido ao warehouse'};
const escapar = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function imprimirRomaneio(rom, itens, lote) {
  const linhas = itens.filter(i => rom.tipo === 'envio' ? i.romaneio_saida_id === rom.id : i.romaneio_retorno_id === rom.id);
  if (!linhas.length) return;
  const janela = window.open('', '_blank', 'width=1050,height=800');
  if (!janela) { window.alert('Permita a abertura de janelas para imprimir o romaneio.'); return; }
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>${escapar(nRom(rom))}</title>
  <style>body{font:13px Arial,sans-serif;color:#182033;margin:28px}h1{margin:4px 0;font-size:25px}p{margin:5px 0}.meta{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 0;border-block:2px solid #222}.tag{font-weight:700;letter-spacing:2px;color:#6030a5}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{padding:9px 6px;border:1px solid #ccc;text-align:left;vertical-align:top;font-size:11px}th{background:#eee}.assinaturas{display:flex;gap:50px;margin-top:75px}.assinaturas div{flex:1;text-align:center;border-top:1px solid #222;padding-top:8px}.rodape{margin-top:25px;font-size:11px;color:#555}@media print{button{display:none}}@page{size:A4 landscape;margin:13mm}</style></head><body>
  <div class="tag">LIQUIDA SYSTEM · CONTROLE INTERNO</div><h1>Romaneio de ${rom.tipo === 'envio' ? 'envio ao laboratório' : 'devolução ao warehouse'}</h1>
  <div class="meta"><div><p><b>Número:</b> ${escapar(nRom(rom))}</p><p><b>Lote:</b> ${escapar(lote)}</p><p><b>Origem:</b> ${rom.tipo==='envio'?'Warehouse':'Laboratório'}</p></div>
  <div><p><b>Emissão:</b> ${escapar(formatarData(rom.criado_em))}</p><p><b>Total:</b> ${linhas.length} aparelhos</p><p><b>Destino:</b> ${rom.tipo==='envio'?'Laboratório':'Warehouse'}</p></div></div>
  <table><thead><tr><th>#</th><th>Voucher</th><th>IMEI / Série</th><th>Modelo</th><th>OS vinculada</th><th>Resultado</th></tr></thead><tbody>
  ${linhas.map((i,k)=>`<tr><td>${k+1}</td><td>${escapar(i.voucher)}</td><td>${escapar(i.imei)}</td><td>${escapar(i.modelo)}</td><td>${escapar(i.os_numero || '—')}</td><td>${escapar(i.resultado || '—')}</td></tr>`).join('')}
  </tbody></table><div class="assinaturas"><div>Conferido / saída</div><div>Transportador</div><div>Conferido / recebimento</div></div>
  <p class="rodape">Transferência interna; não é documento fiscal. Conferir os vouchers fisicamente na entrega e no recebimento. O recebimento pelo warehouse não equivale à alocação no estoque ou à entrada no Oracle.</p>
  <script>window.addEventListener('load',()=>{window.focus();window.print()})<\/script></body></html>`;
  janela.document.open(); janela.document.write(html); janela.document.close();
}

const campo = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-600';
const botao = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-40';

export default function LaboratorioReparoV2Page() {
  const { user } = useAuth();
  const [painel,setPainel]=useState({envios:[],retornos:[]});
  const [detalhe,setDetalhe]=useState(null);
  const [aba,setAba]=useState('recebimento');
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');
  const [voucher,setVoucher]=useState('');
  const [os,setOs]=useState('');
  const [buscaTec,setBuscaTec]=useState('');
  const [buscaDevolucao,setBuscaDevolucao]=useState('');
  const [edicao,setEdicao]=useState(null);
  const [defeitos,setDefeitos]=useState([]);
  const [novoDefeito,setNovoDefeito]=useState('');
  const [resultado,setResultado]=useState('reparado');
  const [observacoes,setObservacoes]=useState('');
  const pedidoId=detalhe?.pedido?.id;

  const atualizar=useCallback(async (id, silencio=false)=>{
    if (!silencio) setLoading(true);
    try {
      const l=await laboratorioReparo('listar');
      setPainel(l || {envios:[],retornos:[]});
      const alvo=id || l?.envios?.[0]?.pedido_id;
      if (alvo) {
        const d=await laboratorioReparo('detalhar',{p_pedido_id:alvo});
        setDetalhe(d);
      } else setDetalhe(null);
    } catch(e) {setErro(e.message);}
    finally {setLoading(false);}
  },[]);

  useEffect(()=>{atualizar();},[atualizar]);
  const itens=detalhe?.itens || [];
  const manifests=detalhe?.romaneios || [];
  const envio=manifests.find(r=>r.tipo==='envio');
  const concluidos=itens.filter(i=>i.status==='concluido'&&!i.romaneio_retorno_id).length;
  const pendentes=itens.filter(i=>i.status==='aguardando_recebimento');
  const prontos=itens.filter(i=>['recebido','em_reparo'].includes(i.status));
  const paraWarehouse=itens.filter(i=>i.status==='em_devolucao');
  const filtros=useMemo(()=>({pendentes,prontos,paraWarehouse}),[detalhe]); // atualizado junto com o lote

  async function executar(acao, extra={}, mensagem='Operação registrada.') {
    if (busy) return null;
    setErro(''); setSucesso(''); setBusy(true);
    try {
      const r=await laboratorioReparo(acao,{p_pedido_id:pedidoId,...extra});
      await atualizar(pedidoId,true);
      setSucesso(mensagem);
      return r;
    } catch(e){setErro(e.message);return null;}
    finally{setBusy(false);}
  }

  async function receber(e){
    e.preventDefault();
    const localizado=itens.find(i=>i.voucher?.trim().toUpperCase()===voucher.trim().toUpperCase());
    if(!localizado){setErro('Voucher não pertence ao lote selecionado.');return;}
    if(localizado.status!=='aguardando_recebimento'){setErro('Este voucher já foi recebido.');return;}
    const retorno=await executar('receber',{p_item_id:localizado.id,p_os:os},'Voucher recebido e OS vinculada.');
    if(retorno){setVoucher('');setOs('');}
  }

  function abrirTecnico(v,clear=false){
    const localizado=itens.find(i=>i.voucher?.trim().toUpperCase()===v.trim().toUpperCase()||i.imei===v.trim());
    if(!localizado){setErro('Voucher ou IMEI não encontrado neste lote.');return;}
    if(!['recebido','em_reparo'].includes(localizado.status)){setErro('Este aparelho ainda não está disponível na bancada.');return;}
    setErro('');setEdicao(localizado);setDefeitos(Array.isArray(localizado.defeitos_atual)?[...localizado.defeitos_atual]:[]);
    setResultado(localizado.resultado||'reparado');setObservacoes(localizado.observacoes||'');setNovoDefeito('');
    if(clear) setBuscaTec('');
  }

  async function salvarDefeitos(){
    if (!edicao) return;
    const r=await executar('salvar_defeitos',{p_item_id:edicao.id,p_defeitos:defeitos},'Defeitos atualizados, com histórico preservado.');
    if(r) setEdicao(r.item);
  }
  async function concluir(){
    if (!edicao || busy) return;
    setBusy(true);setErro('');setSucesso('');
    try {
      await laboratorioReparo('salvar_defeitos',{p_pedido_id:pedidoId,p_item_id:edicao.id,p_defeitos:defeitos});
      await laboratorioReparo('concluir',{p_pedido_id:pedidoId,p_item_id:edicao.id,p_resultado:resultado,p_observacoes:observacoes});
      setEdicao(null);await atualizar(pedidoId,true);setSucesso('Reparo fechado. Aparelho liberado para romaneio de devolução.');
    }catch(e){setErro(e.message);}finally{setBusy(false);}
  }
  async function devolver(e){
    e.preventDefault();
    const i=itens.find(x=>x.voucher?.trim().toUpperCase()===buscaDevolucao.trim().toUpperCase()||x.imei===buscaDevolucao.trim());
    if(!i){setErro('Voucher não localizado neste lote.');return;}
    if(i.status!=='em_devolucao'){setErro('Este voucher não possui romaneio de devolução pendente.');return;}
    const r=await executar('receber_warehouse',{p_item_id:i.id},'Recebimento físico confirmado. Enviado para aguardando armazenagem.');
    if(r)setBuscaDevolucao('');
  }
  const contagem=(status)=>itens.filter(i=>i.status===status).length;
  return <div className="min-h-screen bg-slate-50 px-4 py-6 md:px-8">
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div><div className="text-xs font-bold uppercase tracking-[.2em] text-violet-700">Piloto restrito · Liquida System</div>
          <h1 className="mt-1 text-2xl font-black text-slate-900">Laboratório de Reparos — Smartphones</h1>
          <p className="mt-1 text-sm text-slate-500">Picking → romaneio de envio → recebimento e OS → bancada técnica → romaneio de retorno → warehouse.</p></div>
        <button type="button" onClick={()=>atualizar(pedidoId)} className={botao+' border bg-white text-slate-700'} disabled={busy}><RefreshCw size={16}/>Atualizar</button>
      </div>
      {erro&&<div role="alert" className="flex items-center gap-2 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"><AlertTriangle size={17}/>{erro}</div>}
      {sucesso&&<div role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{sucesso}</div>}
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="space-y-3 rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between"><h2 className="font-bold text-slate-900">Lotes do picking</h2><span className="rounded-full bg-violet-100 px-2 py-1 text-xs font-bold text-violet-700">{painel.envios?.length||0}</span></div>
          <p className="text-xs text-slate-500">O romaneio de envio é gerado automaticamente quando o picking para reparo é concluído.</p>
          {(painel.envios||[]).map(p=><button key={p.id} onClick={()=>{setErro('');setEdicao(null);atualizar(p.pedido_id);}} className={`w-full rounded-xl border p-3 text-left transition ${pedidoId===p.pedido_id?'border-violet-500 bg-violet-50':'border-slate-200 hover:bg-slate-50'}`}>
            <div className="break-all text-xs font-bold text-slate-800">{p.lote}</div><div className="mt-1 text-xs text-slate-500">{p.total} aparelhos • {p.pendentes} aguardando</div><div className="mt-1 text-[11px] text-slate-400">{formatarData(p.criado_em)}</div></button>)}
          {!loading&&!painel.envios?.length&&<div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Nenhum picking de reparo concluído desde a implantação do piloto.</div>}
        </aside>
        <section className="min-w-0 space-y-4">
          {!detalhe?<div className="rounded-2xl border bg-white p-8 text-center text-slate-500">{loading?'Carregando lotes...':'Conclua um picking de reparo para iniciar o novo fluxo.'}</div>:<>
            <div className="rounded-2xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="font-black text-slate-900">{detalhe.pedido?.lote}</h2><p className="mt-1 text-xs text-slate-500">{itens.length} vouchers • Pedido interno {String(pedidoId).slice(0,8)}</p></div>
                {envio&&<button className={botao+' bg-violet-700 text-white'} onClick={()=>imprimirRomaneio(envio,itens,detalhe.pedido?.lote)}><Printer size={16}/>Romaneio de envio {nRom(envio)}</button>}
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">{[
                ['Aguardando laboratório',contagem('aguardando_recebimento')],['Recebidos e reparando',contagem('recebido')+contagem('em_reparo')],
                ['Concluídos',contagem('concluido')],['Devolução / warehouse',contagem('em_devolucao')+contagem('devolvido_warehouse')]
                ].map(([k,v])=><div key={k} className="rounded-xl bg-slate-50 px-3 py-3"><div className="text-2xl font-black text-violet-700">{v}</div><div className="text-xs text-slate-500">{k}</div></div>)}</div>
            </div>
            <div className="flex flex-wrap gap-2 rounded-2xl border bg-white p-2">{[
              ['recebimento','Recebimento / OS',ClipboardList],['tecnicos','Bancada dos técnicos',Wrench],
              ['devolucao','Devolução ao warehouse',Truck],['romaneios','Romaneios',Printer]
              ].map(([k,label,Icon])=><button key={k} onClick={()=>{setAba(k);setEdicao(null);setErro('');}} className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold ${aba===k?'bg-violet-700 text-white':'text-slate-600 hover:bg-slate-50'}`}><Icon size={15}/>{label}</button>)}</div>
            {aba==='recebimento'&&<div className="space-y-4 rounded-2xl border bg-white p-5">
              <h3 className="font-black text-slate-800">Recebimento físico do laboratório</h3><p className="text-sm text-slate-500">Bipe ou digite o voucher separado no picking e informe a OS fornecida pelo laboratório. Não é permitido usar uma OS já vinculada a outro aparelho.</p>
              <form onSubmit={receber} className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                <label className="text-xs font-bold text-slate-600">Voucher<input autoFocus value={voucher} onChange={e=>setVoucher(e.target.value)} placeholder="Bipar voucher" className={'mt-1 '+campo} required/></label>
                <label className="text-xs font-bold text-slate-600">Número da OS (manual)<input value={os} onChange={e=>setOs(e.target.value)} placeholder="Digite a OS" className={'mt-1 '+campo} required maxLength={60}/></label>
                <button className={botao+' self-end bg-emerald-600 text-white'} disabled={busy||!voucher.trim()||!os.trim()}><PackageCheck size={16}/>Confirmar recebimento</button>
              </form>
              <h4 className="pt-2 text-sm font-bold text-slate-700">Aguardando conferência: {filtros.pendentes.length}</h4>
              <Tabela itens={itens} filtro={i=>i.status==='aguardando_recebimento'||i.status==='recebido'} />
            </div>}
            {aba==='tecnicos'&&<div className="space-y-4 rounded-2xl border bg-white p-5">
              <h3 className="font-black text-slate-800">Bancada de reparos</h3>
              <p className="text-sm text-slate-500">Bipe o voucher: os defeitos identificados na triagem serão apresentados. Você pode remover os que não se confirmarem ou acrescentar novos. O histórico original fica preservado.</p>
              <form onSubmit={e=>{e.preventDefault();abrirTecnico(buscaTec,true);}} className="flex flex-wrap gap-2">
                <input className={campo+' min-w-56 flex-1'} value={buscaTec} onChange={e=>setBuscaTec(e.target.value)} placeholder="Bipar voucher ou IMEI / série" aria-label="Voucher para bancada"/>
                <button disabled={!buscaTec.trim()||busy} className={botao+' bg-violet-700 text-white'}><Wrench size={15}/>Abrir reparo</button>
              </form>
              {!edicao?<><h4 className="text-sm font-bold text-slate-700">Disponíveis para o técnico: {filtros.prontos.length}</h4>
                <Tabela itens={itens} filtro={i=>['recebido','em_reparo','concluido'].includes(i.status)} onOpen={i=>['recebido','em_reparo'].includes(i.status)&&abrirTecnico(i.voucher||i.imei)}/></>:
              <div className="space-y-4 rounded-2xl border border-violet-200 bg-violet-50/40 p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs text-slate-500">Voucher / OS</p>
                  <h4 className="break-all font-black text-slate-900">{edicao.voucher||edicao.imei} · {edicao.os_numero}</h4><p className="mt-1 text-xs text-slate-500">{edicao.modelo} · {edicao.imei}</p></div>
                  <button className="rounded-lg border bg-white p-2" title="Fechar" onClick={()=>setEdicao(null)}><X size={16}/></button></div>
                <div className="rounded-xl bg-white p-3"><div className="text-xs font-black uppercase text-violet-700">Defeitos originais da triagem (imutáveis)</div>
                <div className="mt-2 flex flex-wrap gap-2">{(edicao.defeitos_origem||[]).length?(edicao.defeitos_origem||[]).map((x,k)=><span key={k} className="rounded-full bg-amber-100 px-3 py-1 text-xs text-amber-900">{String(x)}</span>):<p className="text-sm text-slate-400">Nenhum defeito descrito na triagem de origem.</p>}</div></div>
                <div><label className="mb-2 block text-xs font-black uppercase text-violet-700">Defeitos confirmados após revisão</label>
                  <div className="flex flex-wrap gap-2">{defeitos.map((x,k)=><button key={k} onClick={()=>setDefeitos(a=>a.filter((_,j)=>j!==k))} title="Remover defeito" className="flex items-center gap-1 rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800">{x}<X size={13} className="text-rose-600"/></button>)}
                    {!defeitos.length&&<span className="text-sm text-slate-500">Nenhum defeito ativo.</span>}</div>
                  <form onSubmit={e=>{e.preventDefault();const v=novoDefeito.trim();if(v&&!defeitos.some(d=>d.toLowerCase()===v.toLowerCase()))setDefeitos(a=>[...a,v]);setNovoDefeito('');}} className="mt-3 flex flex-wrap gap-2">
                    <input className={campo+' min-w-48 flex-1'} value={novoDefeito} onChange={e=>setNovoDefeito(e.target.value)} placeholder="Adicionar outro defeito" maxLength={150}/>
                    <button disabled={!novoDefeito.trim()} className={botao+' border bg-white text-violet-700'}><Plus size={15}/>Adicionar</button></form>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs font-bold text-slate-700">Resultado do reparo<select className={'mt-1 '+campo} value={resultado} onChange={e=>setResultado(e.target.value)}><option value="reparado">Reparado</option><option value="sem_reparo">Sem reparo</option><option value="irrecuperavel">Irrecuperável</option></select></label>
                  <label className="text-xs font-bold text-slate-700">Observações técnicas<textarea className={'mt-1 '+campo} rows={2} value={observacoes} onChange={e=>setObservacoes(e.target.value)} placeholder="Serviço realizado, peças, testes e pendências"/></label>
                </div>
                <div className="flex flex-wrap gap-2"><button className={botao+' border bg-white text-violet-700'} onClick={salvarDefeitos} disabled={busy}>Salvar revisão dos defeitos</button>
                  <button className={botao+' bg-emerald-600 text-white'} onClick={concluir} disabled={busy}><CheckCircle2 size={16}/>Fechar reparo</button></div>
              </div>}
            </div>}
            {aba==='devolucao'&&<div className="space-y-4 rounded-2xl border bg-white p-5">
              <h3 className="font-black text-slate-800">Romaneio de devolução ao warehouse</h3>
              <p className="text-sm text-slate-500">Os reparos concluídos podem ser agrupados em um romaneio de retorno. A conferência física deve ser bipada no warehouse; somente depois o produto irá para <b>Aguardando armazenagem</b>.</p>
              <div className="flex flex-wrap items-center gap-3"><span className="rounded-lg bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-700">{concluidos} prontos para envio</span>
                <button className={botao+' bg-violet-700 text-white'} disabled={busy||!concluidos} onClick={async()=>{const r=await executar('gerar_retorno',{},'Romaneio de devolução gerado.');if(r) setAba('romaneios');}}><ClipboardList size={16}/>Gerar romaneio de retorno</button></div>
              <form onSubmit={devolver} className="flex flex-wrap gap-2"><input className={campo+' min-w-52 flex-1'} value={buscaDevolucao} onChange={e=>setBuscaDevolucao(e.target.value)} placeholder="Bipar voucher recebido pelo warehouse"/>
                <button className={botao+' bg-emerald-600 text-white'} disabled={busy||!buscaDevolucao.trim()}><PackageCheck size={16}/>Confirmar chegada</button></form>
              <Tabela itens={itens} filtro={i=>['concluido','em_devolucao','devolvido_warehouse'].includes(i.status)}/>
            </div>}
            {aba==='romaneios'&&<div className="space-y-3 rounded-2xl border bg-white p-5"><h3 className="font-black text-slate-800">Romaneios do lote</h3>
              {manifests.map(r=><div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                <div><p className="font-bold text-slate-900">{nRom(r)} <span className="ml-2 text-xs font-medium text-slate-500">{r.tipo==='envio'?'Envio ao laboratório':'Devolução ao warehouse'}</span></p>
                <p className="text-xs text-slate-500">{formatarData(r.criado_em)} · {r.status?.replaceAll('_',' ')}</p></div>
                <button onClick={()=>imprimirRomaneio(r,itens,detalhe.pedido?.lote)} className={botao+' border text-violet-700'}><Printer size={16}/>Imprimir / salvar PDF</button>
              </div>)}
            </div>}
          </>}
        </section>
      </div>
      <p className="text-xs text-slate-500">Piloto privado • Visualização e ações limitadas ao usuário autorizado. Os registros originais da triagem e os movimentos WMS são preservados; este módulo registra cada etapa de laboratório separadamente.</p>
    </div>
  </div>;
}
function Tabela({itens,filtro,onOpen}){
 const linhas=itens.filter(filtro);
 return <div className="overflow-x-auto rounded-xl border"><table className="min-w-[660px] w-full text-left text-xs"><thead className="bg-slate-100 text-slate-600"><tr><th className="p-3">Voucher</th><th className="p-3">IMEI / Série</th><th className="p-3">OS</th><th className="p-3">Modelo</th><th className="p-3">Situação</th><th className="p-3">Ação</th></tr></thead><tbody className="divide-y">{linhas.map(i=><tr key={i.id}><td className="p-3 font-bold">{i.voucher||'—'}</td><td className="p-3 font-mono">{i.imei}</td><td className="p-3">{i.os_numero||'—'}</td><td className="p-3">{i.modelo||'—'}</td><td className="p-3">{statusNome[i.status]||i.status}</td>
 <td className="p-3">{onOpen&&['recebido','em_reparo'].includes(i.status)?<button onClick={()=>onOpen(i)} className="rounded-lg bg-violet-50 px-3 py-2 font-bold text-violet-700">Abrir</button>:'—'}</td></tr>)}
 {!linhas.length&&<tr><td colSpan={6} className="p-6 text-center text-slate-400">Nenhum aparelho nesta etapa.</td></tr>}</tbody></table></div>;
}
