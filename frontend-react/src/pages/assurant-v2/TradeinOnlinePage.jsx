import { useCallback, useEffect, useMemo, useState } from 'react';
import TriagemAlsOnlinePanel from '../../components/assurant/TriagemAlsOnlinePanel.jsx';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, FileText, Link2, Package, RefreshCw, Search, Trash2, Truck } from 'lucide-react';
import {
  ROTAS_TRADEIN_ONLINE, listarEtapaOnline, listarObjetosOnline, listarVinculosOnline,
  vincularAparelhoOnline, desvincularAparelhoOnline
} from '../../services/tradeinOnlineService.js';

const ICONES = {
  vinculacao: Link2, 'triagem-als': ClipboardCheck, laudo: FileText,
  'decisao-cliente': AlertTriangle, devolucao: Package, expedicao: Truck
};
const ETAPAS = {
  identificacao_pendente: 'Identificação pendente',
  aguardando_triagem_als: 'Aguardando Triagem ALS',
  aguardando_laudo: 'Aguardando Laudo',
  aguardando_decisao_cliente: 'Aguardando Decisão do Cliente',
  aguardando_devolucao: 'Aguardando Devolução',
  aguardando_expedicao: 'Aguardando Expedição',
  expedido: 'Expedido', encerrado: 'Encerrado'
};

const estiloInput = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800 outline-none focus:border-violet-500';
const btn = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40';
const fmtData = value => value ? new Date(value).toLocaleString('pt-BR') : '—';
const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();

function Mensagem({ texto, erro }) {
  if (!texto) return null;
  return <div role={erro ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-xs font-semibold ${erro ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-900'}`}>{texto}</div>;
}

function VinculacaoObjetos() {
  const [objetos,setObjetos] = useState([]);
  const [aparelhos,setAparelhos] = useState([]);
  const [objetoId,setObjetoId] = useState('');
  const [busca,setBusca] = useState('');
  const [form,setForm] = useState({ voucher:'',observacoes:'' });
  const [erro,setErro] = useState('');
  const [sucesso,setSucesso] = useState('');
  const [carregando,setCarregando] = useState(false);
  const [salvando,setSalvando] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);setErro('');
    try {
      const [obj, vinc] = await Promise.all([listarObjetosOnline(),listarVinculosOnline()]);
      setObjetos(obj.objetos || []);setAparelhos(vinc.aparelhos || []);
    } catch(e) {setErro(e.message);}
    finally{setCarregando(false);}
  }, []);
  useEffect(()=>{carregar();},[carregar]);

  const filtrados = useMemo(() => objetos.filter(o =>
    [o.codigo_rastreio,o.destinatario_correios].some(v=>normalize(v).includes(normalize(busca)))
  ),[objetos,busca]);
  const selecionado = objetos.find(o=>o.id===objetoId);
  const doObjeto = aparelhos.filter(a=>a.objeto_id===objetoId);
  async function salvar(e) {
    e.preventDefault();if(salvando||!objetoId)return;
    setSalvando(true);setErro('');setSucesso('');
    try {
      const dados = await vincularAparelhoOnline({objeto_id:objetoId,...form});
      setSucesso(`Voucher ${form.voucher.trim().toUpperCase()} vinculado ao objeto ${dados.codigo_rastreio} e encaminhado à fila de Triagem ALS.`);
      setForm({ voucher:'',observacoes:'' });
      await carregar();
    } catch(err){setErro(err.message);}
    finally{setSalvando(false);}
  }
  async function remover(item){
    if(salvando||!window.confirm(`Desfazer vínculo do voucher ${item.voucher||'—'}? O evento ficará auditado.`))return;
    setSalvando(true);setErro('');setSucesso('');
    try{await desvincularAparelhoOnline(item.id);setSucesso('Vínculo desfeito com auditoria.');await carregar();}
    catch(e){setErro(e.message);}finally{setSalvando(false);}
  }

  return <div className="space-y-5">
    <div className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500">Objetos Correios disponíveis</p>
        <div className="mt-2 text-3xl font-black tabular-nums text-violet-800">{objetos.length.toLocaleString('pt-BR')}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500">Aparelhos vinculados</p>
        <div className="mt-2 text-3xl font-black tabular-nums text-violet-800">{aparelhos.length.toLocaleString('pt-BR')}</div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold text-slate-500">Com identificação pendente</p>
        <div className="mt-2 text-3xl font-black tabular-nums text-amber-700">{aparelhos.filter(a=>a.etapa==='identificacao_pendente').length.toLocaleString('pt-BR')}</div>
      </div>
    </div>
    <Mensagem erro texto={erro}/><Mensagem texto={sucesso}/>
    <div className="grid gap-5 xl:grid-cols-[minmax(290px,0.75fr)_minmax(0,1.25fr)]">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="font-black text-slate-800">Objetos recebidos</h2>
          <button type="button" onClick={carregar} disabled={carregando||salvando} className={btn}><RefreshCw size={14}/>Atualizar</button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Somente objetos de cargas Correios concluídas. Um objeto pode conter vários aparelhos.</p>
        <div className="relative mt-4">
          <Search className="absolute left-3 top-3.5 h-4 w-4 text-slate-400"/>
          <input className={estiloInput+' pl-9'} value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Código do objeto ou destinatário"/>
        </div>
        <div className="mt-4 max-h-[560px] space-y-2 overflow-auto">
          {carregando&&<p className="py-6 text-xs text-slate-500">Carregando objetos…</p>}
          {!carregando&&!filtrados.length&&<p className="py-8 text-center text-xs text-slate-500">Nenhuma carga Correios concluída com objetos disponíveis.</p>}
          {filtrados.map(o=><button key={o.id} type="button" onClick={()=>setObjetoId(o.id)}
            className={`w-full rounded-xl border p-3 text-left transition ${objetoId===o.id?'border-violet-500 bg-violet-50':'border-slate-200 hover:border-violet-200'}`}>
            <div className="flex items-center justify-between gap-2"><span className="font-mono text-sm font-black">{o.codigo_rastreio}</span><span className="text-xs font-bold text-violet-700">{o.aparelhos_vinculados} aparelho(s)</span></div>
            <p className="mt-1 text-xs text-slate-500">{o.destinatario_correios} · {fmtData(o.bipado_em)}</p>
          </button>)}
        </div>
      </section>
      <div className="space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><Link2 className="h-5 w-5 text-violet-700"/><h2 className="font-black text-slate-800">Vincular aparelho ao objeto</h2></div>
          {!selecionado?<p className="mt-5 text-sm text-slate-500">Selecione um código de objeto na lista para iniciar os vínculos.</p>:<>
            <p className="mt-2 rounded-xl bg-violet-50 p-3 text-xs text-violet-900"><b>Objeto: {selecionado.codigo_rastreio}</b> · {selecionado.destinatario_correios}</p>
            <form onSubmit={salvar} className="mt-4 grid gap-4">
              <label className="text-xs font-bold text-slate-700">Voucher *
                <input required className={estiloInput+' mt-1 font-mono'} value={form.voucher}
                  onChange={e=>setForm({...form,voucher:e.target.value.toUpperCase()})}
                  placeholder="Bipe ou digite o voucher" autoComplete="off" />
              </label>
              <label className="text-xs font-bold text-slate-700">Observações (opcional)
                <textarea className={estiloInput+' mt-1 min-h-[90px] resize-y'} value={form.observacoes}
                  onChange={e=>setForm({...form,observacoes:e.target.value})}
                  placeholder="Informações adicionais sobre o objeto ou aparelho" rows={3}/>
              </label>
              <div>
                <button type="submit" disabled={salvando||!form.voucher.trim()}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-sm font-bold text-white disabled:opacity-40">
                  <CheckCircle2 size={17}/>{salvando?'Gravando…':'Confirmar vinculação'}
                </button>
                <p className="mt-2 text-xs text-slate-500">Voucher obrigatório. Não é necessário informar IMEI, origem, modelo ou pedido. Ao confirmar, o aparelho entra na fila de Triagem ALS.</p>
              </div>
            </form>
          </>}
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-800">Aparelhos deste objeto</h2>
          {!selecionado?<p className="mt-3 text-xs text-slate-500">Selecione um objeto para ver seus aparelhos.</p>:doObjeto.length===0?
            <p className="mt-3 text-xs text-slate-500">Ainda não há aparelho vinculado.</p>:
            <div className="mt-3 space-y-2">{doObjeto.map(a=><div key={a.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-slate-200 p-3 text-xs">
              <div className="flex-1"><p className="font-mono font-bold text-slate-800">Voucher: {a.voucher||'—'}</p>
              {a.observacoes && <p className="mt-1 text-slate-600">Observações: {a.observacoes}</p>}
              <p className="mt-1 text-violet-700">{ETAPAS[a.etapa]||a.etapa}</p></div>
              <button type="button" onClick={()=>remover(a)} disabled={salvando} className={btn} aria-label="Desfazer vínculo"><Trash2 size={14}/></button>
            </div>)}</div>}
        </section>
      </div>
    </div>
  </div>;
}

function FilaEtapa({ config }) {
  const [aparelhos,setAparelhos] = useState([]);
  const [busca,setBusca] = useState('');
  const [erro,setErro] = useState('');
  const [carregando,setCarregando] = useState(false);
  const carregar=useCallback(async()=>{setCarregando(true);setErro('');try{
    const d=await listarEtapaOnline(config.etapa);setAparelhos(d.aparelhos||[]);
  }catch(e){setErro(e.message);}finally{setCarregando(false);}},[config.etapa]);
  useEffect(()=>{carregar();},[carregar]);
  const filtrados=useMemo(()=>aparelhos.filter(a=>[a.codigo_rastreio,a.voucher,a.observacoes,a.destinatario_correios].some(v=>normalize(v).includes(normalize(busca)))),[aparelhos,busca]);
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-xl bg-violet-50 p-3 text-violet-700"><Boxes size={22}/></div>
        <div><p className="text-xs text-slate-500">Fila desta etapa</p><p className="text-3xl font-black tabular-nums">{aparelhos.length.toLocaleString('pt-BR')}</p></div>
      </div>
      <button type="button" onClick={carregar} disabled={carregando} className={btn}><RefreshCw size={15}/>Atualizar fila</button>
    </div>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
      <strong>Etapa em implantação.</strong> A fila já é separada do processo de Lojas. As ações técnicas e os critérios específicos de cada modalidade ainda dependem da parametrização dos questionários, laudos e regras de decisão. Nenhuma movimentação será feita automaticamente nesta tela.
    </div>
    <Mensagem erro texto={erro}/>
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-black text-slate-800">{config.titulo}</h2>
        <div className="relative">
          <Search size={16} className="absolute left-3 top-3.5 text-slate-400"/>
          <input className={estiloInput+' pl-9'} value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar objeto ou voucher"/>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-xs">
          <thead><tr className="border-b bg-slate-50 text-slate-600">{['Voucher','Objeto Correios','Resultado ALS','IMEI / Serial','Defeitos adicionais','Data do vínculo'].map(t=><th key={t} className="p-3">{t}</th>)}</tr></thead>
          <tbody>{filtrados.map(item=><tr key={item.id} className="border-b">
            <td className="p-3 font-mono font-black text-violet-700">{item.voucher||'—'}</td>
            <td className="p-3 font-mono">{item.codigo_rastreio}</td>
            <td className="p-3 font-bold">{item.resultado_als==='TRINCADO'?'Trincado':item.resultado_als==='RECUSADO'?'Recusado':item.resultado_als||'—'}</td>
            <td className="p-3 font-mono">{item.imei||'Não bipado'}{item.imei2?' / '+item.imei2:''}</td>
            <td className="p-3">{(item.defeitos_als||[]).join('; ')||'—'}</td>
            <td className="p-3">{fmtData(item.triado_em||item.criado_em)}</td>
          </tr>)}</tbody>
        </table>
        {!carregando&&!filtrados.length&&<p className="py-9 text-center text-xs text-slate-500">Nenhum produto nesta etapa.</p>}
      </div>
    </section>
  </div>;
}

export default function TradeinOnlinePage({ tipo='vinculacao' }) {
  const config=ROTAS_TRADEIN_ONLINE.find(item=>item.id===tipo)||ROTAS_TRADEIN_ONLINE[0];
  const Icon=ICONES[config.id]||Link2;
  return <div className="mx-auto max-w-[1500px] space-y-6">
    <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-[10px] font-black uppercase tracking-widest text-violet-700">Operação – Trade-In Online</div>
      <div className="mt-2 flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-3 text-violet-700"><Icon size={22}/></div>
        <div><h1 className="text-2xl font-black text-slate-900">{config.titulo}</h1>
          <p className="mt-1 text-xs text-slate-500">GRV · Online · TRAON · MELI · Rastreabilidade por código do objeto Correios</p>
        </div></div>
    </header>
    {tipo==='vinculacao'?<VinculacaoObjetos/>:tipo==='triagem-als'?<TriagemAlsOnlinePanel/>:<FilaEtapa config={config}/>}
  </div>;
}
