import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, Download, Package, RefreshCw, ScanLine, Trash2, Truck } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import {
  biparObjetoCorreios, concluirRecebimentoCorreios,
  estornarObjetoCorreios, listarObjetosCorreios
} from '../../services/correiosRecebimentoService.js';
import { buscarRecebimento } from '../../services/recebimentoService.js';

const formatarData = valor => valor ? new Date(valor).toLocaleString('pt-BR') : '—';
const estiloBotao = 'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

function Aviso({ mensagem, erro = false }) {
  if (!mensagem) return null;
  return <div role={erro ? 'alert' : 'status'} className={`rounded-xl border px-4 py-3 text-xs font-semibold ${erro ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{mensagem}</div>;
}

export function CorreiosBipagem({ recebimento, onVoltar, onConcluir }) {
  const [objetos, setObjetos] = useState([]);
  const [codigo, setCodigo] = useState('');
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [total, setTotal] = useState(0);
  const campoRef = useRef(null);
  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const data = await listarObjetosCorreios(recebimento.id);
      setObjetos(data.objetos || []);
      setTotal(Number(data.total ?? data.objetos?.length ?? 0));
      setErro('');
    } catch (e) { setErro(e.message); }
    finally { setCarregando(false); }
  }, [recebimento.id]);
  useEffect(() => {
    carregar();
    campoRef.current?.focus();
  }, [carregar]);

  async function bipar(evento) {
    evento.preventDefault();
    if (ocupado || !codigo.trim()) return;
    setErro(''); setSucesso(''); setOcupado(true);
    try {
      const data = await biparObjetoCorreios(recebimento.id, codigo);
      setObjetos(atual => [data.objeto, ...atual]);
      setTotal(Number(data.total));
      setSucesso(`Objeto ${data.objeto.codigo_rastreio} recebido. IMEI e voucher serão vinculados posteriormente.`);
      setCodigo('');
    } catch (e) {
      setErro(e.message);
    } finally {
      setOcupado(false);
      campoRef.current?.focus();
    }
  }

  async function estornar(item) {
    if (ocupado || !window.confirm(`Estornar o objeto ${item.codigo_rastreio} desta carga?`)) return;
    setOcupado(true); setErro(''); setSucesso('');
    try {
      const data = await estornarObjetoCorreios(recebimento.id, item.id);
      setObjetos(atual => atual.filter(o => o.id !== item.id));
      setTotal(Number(data.total));
      setSucesso(`Objeto ${item.codigo_rastreio} estornado. O histórico foi preservado.`);
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); campoRef.current?.focus(); }
  }

  async function concluir() {
    if (ocupado || total === 0) return;
    if (!window.confirm(`Concluir recebimento com ${total} objeto(s) bipado(s)? Eles permanecerão aguardando a vinculação de IMEI/voucher.`)) return;
    setOcupado(true); setErro('');
    try {
      const dados = await concluirRecebimentoCorreios(recebimento.id);
      onConcluir(dados.recebimento);
    } catch (e) { setErro(e.message); }
    finally { setOcupado(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <button className={estiloBotao} type="button" onClick={onVoltar}><ArrowLeft size={15}/>Cargas</button>
      <div className="flex-1 text-right text-xs text-slate-600">
        <strong>Correios · {recebimento.destinatario_correios}</strong>
        <span className="ml-2">{recebimento.motorista_nome} · {recebimento.placa}</span>
      </div>
      <button type="button" disabled={ocupado || carregando || !total} onClick={concluir}
        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40">
        <CheckCircle2 size={16}/> Concluir recebimento
      </button>
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2"><ScanLine size={19} className="text-violet-700"/><h2 className="text-base font-black">1ª bipagem · Código do objeto</h2></div>
        <p className="mt-2 text-xs text-slate-600">Bipe os códigos de rastreio de todos os pacotes recebidos. Exemplo: OY733648256BR. Nesta etapa não solicitamos IMEI nem voucher.</p>
        <form onSubmit={bipar} className="mt-5 flex flex-wrap gap-2">
          <input ref={campoRef} value={codigo} onChange={e => setCodigo(e.target.value.toUpperCase())}
            autoComplete="off" spellCheck={false} maxLength={18} disabled={ocupado || carregando}
            placeholder="Bipe o código do objeto..." aria-label="Código de rastreio do objeto Correios"
            className="h-12 min-w-56 flex-1 rounded-xl border border-violet-200 px-4 font-mono text-base font-bold outline-none focus:border-violet-500"/>
          <button type="submit" disabled={ocupado || carregando || !codigo.trim()}
            className="rounded-xl bg-violet-700 px-5 text-xs font-bold text-white disabled:opacity-40">
            {ocupado ? 'Registrando…' : 'Confirmar'}
          </button>
        </form>
        <div className="mt-4 space-y-2"><Aviso mensagem={erro} erro/><Aviso mensagem={sucesso}/></div>
        <div className="mt-5 rounded-xl bg-violet-50 p-4 text-xs text-violet-950">
          <strong>Próxima etapa: vinculação de aparelhos.</strong>
          <p className="mt-1">Cada objeto ficará com identificação própria, data e responsável pela bipagem e status <b>Aguardando vinculação</b>. Nenhuma triagem YBV será aberta automaticamente.</p>
        </div>
      </section>
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2"><Package size={18} className="text-violet-700"/><h2 className="text-base font-black">Objetos recebidos</h2></div>
          <div className="flex items-center gap-3">
            <strong className="text-lg tabular-nums text-violet-800">{total}</strong>
            <button type="button" className={estiloBotao} onClick={carregar} disabled={ocupado || carregando}><RefreshCw size={14}/>Atualizar</button>
          </div>
        </div>
        {carregando && <p className="py-6 text-xs text-slate-500">Carregando objetos…</p>}
        {!carregando && objetos.length === 0 && <p className="py-10 text-center text-xs text-slate-500">Nenhum código de objeto bipado nesta carga.</p>}
        <div className="mt-4 max-h-[460px] space-y-2 overflow-y-auto">
          {objetos.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <CheckCircle2 size={17} className="shrink-0 text-emerald-600"/>
            <div className="min-w-0 flex-1">
              <p className="font-mono text-xs font-black text-slate-800">{item.codigo_rastreio}</p>
              <p className="mt-1 text-[11px] text-slate-500">{formatarData(item.bipado_em)} · {item.bipado_por_nome || 'Operador'}</p>
              <p className="mt-1 text-[10px] text-amber-800">Aguardando vinculação de IMEI / voucher</p>
            </div>
            <button type="button" aria-label={`Estornar ${item.codigo_rastreio}`} onClick={() => estornar(item)}
              disabled={ocupado} className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-40"><Trash2 size={16}/></button>
          </div>)}
        </div>
      </section>
    </div>
  </div>;
}

export function CorreiosRomaneio({ recebimentoId, onNovo }) {
  const [dados,setDados] = useState(null);
  const [erro,setErro] = useState('');
  const [carregando,setCarregando] = useState(true);
  useEffect(() => {
    let ativo = true;
    (async () => {
      try {
        const [rec,lista] = await Promise.all([buscarRecebimento(recebimentoId),listarObjetosCorreios(recebimentoId)]);
        if (!rec.ok) throw new Error(rec.erro || 'Não foi possível consultar a carga.');
        if (ativo) setDados({recebimento:rec.recebimento,objetos:lista.objetos || []});
      } catch(e) { if(ativo)setErro(e.message); }
      finally { if(ativo)setCarregando(false); }
    })();
    return ()=>{ativo=false;};
  },[recebimentoId]);

  function linhas() {
    return dados.objetos.map((item,i)=>({
      '#':i+1,'Código do objeto':item.codigo_rastreio,
      'Bipado em':formatarData(item.bipado_em),
      'Operador':item.bipado_por_nome || '',
      'Situação':item.status_vinculo === 'aguardando_vinculacao' ? 'Aguardando vinculação' : (item.status_vinculo || '—')
    }));
  }
  function excel() {
    const wb=XLSX.utils.book_new();
    const ws=XLSX.utils.json_to_sheet(linhas());
    ws['!cols']=[{wch:7},{wch:25},{wch:25},{wch:32},{wch:27}];
    XLSX.utils.book_append_sheet(wb,ws,'Objetos Correios');
    XLSX.writeFile(wb,`romaneio_correios_${dados.recebimento.id.slice(0,8)}.xlsx`);
  }
  function pdf() {
    const {recebimento:rec,objetos}=dados;
    const doc=new jsPDF();
    doc.setFontSize(15);doc.text('Romaneio de recebimento — Correios',14,18);
    doc.setFontSize(9);
    const info=[
      `Destinatário: ${rec.destinatario_correios}`,
      `Motorista: ${rec.motorista_nome || '—'}`,
      `Placa: ${rec.placa || '—'} · Lacres: ${(rec.lacres||[]).join(', ')||'—'}`,
      `Início: ${formatarData(rec.iniciado_em)} · Conclusão: ${formatarData(rec.concluido_em)}`,
      `Total de objetos: ${objetos.length}`,
      'Identificação dos aparelhos em etapa posterior.'
    ];
    info.forEach((linha,i)=>doc.text(linha,14,28+i*6));
    doc.autoTable({startY:70,head:[['#','Código do objeto','Bipado em','Responsável']],
      body:objetos.map((item,i)=>[i+1,item.codigo_rastreio,formatarData(item.bipado_em),item.bipado_por_nome||'—']),
      styles:{fontSize:8},headStyles:{fillColor:[87,42,164]}});
    doc.save(`romaneio_correios_${rec.id.slice(0,8)}.pdf`);
  }
  if (carregando) return <p className="rounded-xl border bg-white p-5 text-sm text-slate-500">Carregando romaneio dos Correios…</p>;
  if (erro || !dados) return <Aviso mensagem={erro || 'Não foi possível carregar o romaneio.'} erro/>;
  const {recebimento:rec,objetos}=dados;
  return <div className="space-y-4">
    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
      <div className="flex items-center gap-2 text-emerald-900"><CheckCircle2 size={20}/><h2 className="font-black">Recebimento Correios concluído</h2></div>
      <p className="mt-2 text-xs text-emerald-900">{objetos.length} objeto(s) registrados para <b>{rec.destinatario_correios}</b>. Aguardando identificação dos aparelhos.</p>
    </div>
    <section className="rounded-2xl border bg-white p-5 shadow-sm">
      <h3 className="font-black">Romaneio da carga</h3>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
        <p><b>Motorista:</b> {rec.motorista_nome || '—'}</p>
        <p><b>CPF:</b> {rec.motorista_cpf || '—'}</p>
        <p><b>Placa:</b> {rec.placa || '—'}</p>
        <p><b>Lacres:</b> {(rec.lacres || []).join(', ') || 'Não informado'}</p>
        <p><b>Início:</b> {formatarData(rec.iniciado_em)}</p>
        <p><b>Conclusão:</b> {formatarData(rec.concluido_em)}</p>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={excel} className={estiloBotao}><Download size={15}/>Excel</button>
        <button type="button" onClick={pdf} className={estiloBotao}><Download size={15}/>PDF</button>
        <button type="button" onClick={onNovo} className={estiloBotao}><Truck size={15}/>Novo recebimento</button>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[460px] text-left text-xs">
        <thead><tr className="border-b bg-slate-50">{['Código do objeto','Data da bipagem','Responsável','Vínculo'].map(k=><th key={k} className="p-3">{k}</th>)}</tr></thead>
        <tbody>{objetos.map(item=><tr key={item.id} className="border-b">
          <td className="p-3 font-mono font-bold">{item.codigo_rastreio}</td>
          <td className="p-3">{formatarData(item.bipado_em)}</td>
          <td className="p-3">{item.bipado_por_nome || '—'}</td>
          <td className="p-3 text-amber-800">Aguardando vinculação</td>
        </tr>)}</tbody>
      </table></div>
    </section>
  </div>;
}
