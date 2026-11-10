import { useCallback, useEffect, useMemo, useState } from 'react';
import TriagemAlsOnlinePanel from '../../components/assurant/TriagemAlsOnlinePanel.jsx';
import LaudosTradeinOnlinePanel from '../../components/assurant/LaudosTradeinOnlinePanel.jsx';
import DevolucaoOnlinePopup from '../../components/assurant/DevolucaoOnlinePopup.jsx';
import { consultarLaudoOnline, baixarArquivoLaudo } from '../../services/tradeinOnlineLaudoService.js';
import { nomeArquivoLaudo } from '../../services/laudoGrvExportService.js';
import { AlertTriangle, Boxes, CheckCircle2, ClipboardCheck, FileText, Link2, Package, RefreshCw, Search, Trash2, Truck } from 'lucide-react';
import {
  ROTAS_TRADEIN_ONLINE, listarEtapaOnline, listarObjetosOnline, listarVinculosOnline,
  vincularAparelhoOnline, desvincularAparelhoOnline, registrarDecisaoClienteOnline
} from '../../services/tradeinOnlineService.js';

const ICONES = {
  vinculacao: Link2, 'triagem-als': ClipboardCheck, laudo: FileText,
  'decisao-cliente': AlertTriangle, devolucao: Package, expedicao: Truck
};
// Aging da fila de decisão: parte exclusivamente da finalização da Triagem ALS.
function formatarAgingAls(triadoEm, agora) {
  if (!triadoEm) return '—';
  const inicio = new Date(triadoEm).getTime();
  if (!Number.isFinite(inicio)) return '—';
  const minutos = Math.max(0, Math.floor((agora - inicio) / 60000));
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const minutosRestantes = minutos % 60;
  if (dias > 0) return `${dias}d ${horas}h`;
  if (horas > 0) return `${horas}h ${minutosRestantes}min`;
  return `${minutosRestantes}min`;
}

const ETAPAS = {
  identificacao_pendente: 'Identificação pendente',
  aguardando_triagem_als: 'Aguardando Triagem ALS',
  aguardando_laudo: 'Aguardando Laudo',
  aguardando_decisao_cliente: 'Aguardando Definição do Cliente',
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
  const [baixando,setBaixando] = useState('');
  const [salvandoDecisao,setSalvandoDecisao] = useState('');
  const [sucesso,setSucesso] = useState('');
  const [voucherDevolucao,setVoucherDevolucao] = useState(null);
  const [agora,setAgora] = useState(() => Date.now());
  useEffect(() => {
    if (config.id !== 'decisao-cliente') return undefined;
    const timer = setInterval(() => setAgora(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [config.id]);
  async function abrirDocumento(item,tipo){
    const chave=item.id+tipo;
    setBaixando(chave);setErro('');
    try{
      const r=await consultarLaudoOnline(item.id);
      const path=tipo==='pdf'?r.laudo?.pdf_path:r.laudo?.excel_path;
      if(!path)throw new Error('Este voucher não possui '+(tipo==='pdf'?'PDF':'Excel')+' registrado.');
      const nome='laudo_grv_'+nomeArquivoLaudo(item.voucher)+(tipo==='pdf'?'.pdf':'.xlsx');
      await baixarArquivoLaudo(path,nome);
    }catch(e){setErro(e.message);}
    finally{setBaixando('');}
  }
  const carregar=useCallback(async()=>{setCarregando(true);setErro('');try{
    const d=await listarEtapaOnline(config.etapa);setAparelhos(d.aparelhos||[]);
  }catch(e){setErro(e.message);}finally{setCarregando(false);}},[config.etapa]);
  async function decidirDivergencia(item,aprovou) {
    if (salvandoDecisao || carregando) return;
    const destino = aprovou ? 'Triagem Cosmética de Lojas' : 'Aguardando Devolução (Trade-In Online)';
    const texto = aprovou
      ? 'O cliente APROVOU a divergência do voucher '+item.voucher+'?\\n\\nO produto será encaminhado à '+destino+'. O laudo e o resultado original da ALS serão preservados.'
      : 'O cliente NÃO APROVOU a divergência do voucher '+item.voucher+'?\\n\\nO produto será encaminhado à fila '+destino+'.';
    if (!window.confirm(texto.replace(/\\n/g,'\n'))) return;
    setSalvandoDecisao(item.id);setErro('');setSucesso('');
    try {
      const r = await registrarDecisaoClienteOnline(item.id,aprovou);
      setSucesso('Decisão registrada para '+r.voucher+'. Destino: '+r.destino+'.');
      await carregar();
    } catch (e) { setErro(e.message); }
    finally { setSalvandoDecisao(''); }
  }
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
    {config.id==='decisao-cliente'
      ? <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-xs leading-relaxed text-violet-950">
          <strong>Decisão sobre divergência do laudo.</strong> Cada voucher exige confirmação:
          se o cliente <strong>aprovou</strong>, o produto segue para a <strong>Triagem Cosmética (Lojas)</strong>;
          se <strong>não aprovou</strong>, segue para <strong>Aguardando Devolução (Online)</strong>.
          As decisões ficam auditadas e não podem ser registradas duas vezes.
        </div>
      : <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-950">
          <strong>Etapa em implantação.</strong> A fila já é separada do processo de Lojas. As ações técnicas e os critérios específicos de cada modalidade ainda dependem da parametrização.
        </div>}
    <Mensagem erro texto={erro}/>
    <Mensagem texto={sucesso}/>
    {config.id==='devolucao'&&<p className="text-xs text-slate-600">
      Clique no <strong>voucher</strong> para abrir a coleta de e-ticket e gerar a Declaração de Conteúdo em <strong>PDF e Excel</strong>.
      Ao concluir, o produto segue para Expedição.
    </p>}
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
          <thead><tr className="border-b bg-slate-50 text-slate-600">{['Voucher','Objeto Correios','Resultado ALS','IMEI / Serial','Defeitos adicionais',config.id==='decisao-cliente'?'Conclusão ALS':'Data do vínculo',...(config.id==='decisao-cliente'?['Aging desde ALS','Documento do laudo','Decisão do cliente']:[]),...(config.id==='devolucao'?['Decisão do cliente']:[])].map(t=><th key={t} className="p-3">{t}</th>)}</tr></thead>
          <tbody>{filtrados.map(item=><tr key={item.id} className="border-b">
            <td className="p-3 font-mono font-black text-violet-700">
              {config.id==='devolucao'?
                <button type="button" onClick={()=>setVoucherDevolucao(item)}
                  className="rounded py-1 text-left font-mono font-black text-violet-700 underline underline-offset-2 hover:text-violet-900"
                  title="Abrir coleta de e-ticket e Declaração de Conteúdo">
                  {item.voucher||'—'}
                </button>
                :(item.voucher||'—')}
            </td>
            <td className="p-3 font-mono">{item.codigo_rastreio}</td>
            <td className="p-3 font-bold">{item.resultado_als==='TRINCADO'?'Trincado':item.resultado_als==='RECUSADO'?'Recusado':item.resultado_als||'—'}</td>
            <td className="p-3 font-mono">{item.imei||'Não bipado'}{item.imei2?' / '+item.imei2:''}</td>
            <td className="p-3">{(item.defeitos_als||[]).join('; ')||'—'}</td>
            <td className="p-3">{fmtData(item.triado_em||item.criado_em)}</td>
            {config.id==='decisao-cliente'&&<td className="p-3 whitespace-nowrap font-semibold tabular-nums text-slate-800" title={item.triado_em ? 'Contagem iniciada em '+fmtData(item.triado_em) : 'Sem registro de conclusão da Triagem ALS'}>
              {formatarAgingAls(item.triado_em,agora)}
            </td>}
            {config.id==='decisao-cliente'&&<td className="p-3">
              {/^SAMV/i.test(item.voucher||'')
                ? <span className="text-xs font-bold text-emerald-800">Laudo realizado</span>
                : <div className="flex gap-2">
                    <button type="button" className={btn} disabled={Boolean(baixando)} onClick={()=>abrirDocumento(item,'pdf')}>PDF</button>
                    <button type="button" className={btn} disabled={Boolean(baixando)} onClick={()=>abrirDocumento(item,'xlsx')}>Excel</button>
                  </div>}
            </td>}
            {config.id==='decisao-cliente'&&<td className="p-3">
              <div className="flex min-w-[190px] flex-col gap-2">
                <button type="button"
                  disabled={Boolean(salvandoDecisao)||carregando}
                  onClick={()=>decidirDivergencia(item,true)}
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-[11px] font-black text-emerald-800 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50">
                  <CheckCircle2 size={14}/>
                  {salvandoDecisao===item.id?'Registrando...':'Cliente aprovou'}
                </button>
                <button type="button"
                  disabled={Boolean(salvandoDecisao)||carregando}
                  onClick={()=>decidirDivergencia(item,false)}
                  className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-[11px] font-black text-rose-800 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50">
                  <AlertTriangle size={14}/>
                  {salvandoDecisao===item.id?'Registrando...':'Cliente não aprovou'}
                </button>
              </div>
            </td>}
            {config.id==='devolucao'&&<td className="p-3">
              {item.decisao_cliente==='nao_aprovou'
                ? <span className="font-bold text-rose-800">Divergência reprovada</span>
                : '—'}
              {item.decisao_cliente_em&&<p className="mt-1 text-[11px] text-slate-500">{fmtData(item.decisao_cliente_em)}</p>}
            </td>}
          </tr>)}</tbody>
        </table>
        {!carregando&&!filtrados.length&&<p className="py-9 text-center text-xs text-slate-500">Nenhum produto nesta etapa.</p>}
      </div>
    </section>
    {config.id==='devolucao'&&voucherDevolucao&&<DevolucaoOnlinePopup
      item={voucherDevolucao}
      onClose={()=>setVoucherDevolucao(null)}
      onConcluido={r=>{
        setSucesso('Declaração de Conteúdo gerada para '+r.voucher+
          ' · E-ticket '+r.eticket+'. Encaminhado para Expedição.');
        carregar();
      }}
    />}
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
    {tipo==='vinculacao'?<VinculacaoObjetos/>:tipo==='triagem-als'?<TriagemAlsOnlinePanel/>:tipo==='laudo'?<LaudosTradeinOnlinePanel/>:<FilaEtapa config={config}/>}
  </div>;
}
