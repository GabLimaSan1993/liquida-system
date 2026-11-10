import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, CheckCircle2, ClipboardCheck, FileText, RefreshCw, Search, ScanLine, X } from 'lucide-react';
import { finalizarTriagemAlsOnline, listarEtapaOnline } from '../../services/tradeinOnlineService.js';
import { carregarCatalogo, listarDefeitos } from '../../services/triagemFuncionalService.js';
import { erroIdentificacao, exigeDoisImeis, tipoDoAparelho } from '../../services/identificacaoAparelho.js';

const OPCOES = [
  { valor:'GRADE_MATCH', nome:'Grade Match', detalhe:'Defeito opcional. Conclusão encaminha à Triagem Cosmética de Lojas.' },
  { valor:'TRINCADO', nome:'Trincado', detalhe:'Defeito obrigatório. Conclusão encaminha ao Laudo do Trade-In Online.' },
  { valor:'RECUSADO', nome:'Recusado', detalhe:'IMEIs opcionais e defeito obrigatório. Conclusão encaminha ao Laudo do Trade-In Online.' }
];
const campo='mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500';
const botao='rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 hover:border-violet-300 disabled:opacity-40';
const limpar=txt=>String(txt||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const unicos=lista=>[...new Set(lista.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
const vazio=()=>({marca:'',modelo:'',capacidade:'',cor:''});

export default function TriagemAlsOnlinePanel(){
  const [fila,setFila]=useState([]);
  const [catalogo,setCatalogo]=useState([]);
  const [catalogoDefeitos,setCatalogoDefeitos]=useState([]);
  const [busca,setBusca]=useState('');
  const [item,setItem]=useState(null);
  const [resultado,setResultado]=useState('');
  const [produto,setProduto]=useState(vazio);
  const [imei1,setImei1]=useState('');
  const [imei2,setImei2]=useState('');
  const [defeitos,setDefeitos]=useState([]);
  const [buscaDefeito,setBuscaDefeito]=useState('');
  const [carregando,setCarregando]=useState(false);
  const [salvando,setSalvando]=useState(false);
  const [erro,setErro]=useState('');
  const [erroModal,setErroModal]=useState('');
  const [sucesso,setSucesso]=useState('');

  const carregar=useCallback(async()=>{
    setCarregando(true);setErro('');
    try{const r=await listarEtapaOnline('aguardando_triagem_als');setFila(r.aparelhos||[]);}
    catch(e){setErro(e.message);}finally{setCarregando(false);}
  },[]);
  useEffect(()=>{carregar();},[carregar]);
  useEffect(()=>{
    let ativo=true;
    Promise.all([carregarCatalogo(),listarDefeitos()]).then(([modelos,def])=>{
      if(!ativo)return;
      setCatalogo(modelos.produtos||[]);
      // Mesma lista completa usada na Triagem Funcional: id, nome e categoria, sem cortes ou exclusões adicionais.
      setCatalogoDefeitos(def||[]);
    }).catch(e=>{if(ativo)setErro('Erro no catálogo de modelos ou defeitos: '+e.message);});
    return()=>{ativo=false;};
  },[]);

  const marcas=useMemo(()=>unicos(catalogo.map(p=>p.marca)),[catalogo]);
  const modelos=useMemo(()=>unicos(catalogo.filter(p=>p.marca===produto.marca).map(p=>p.modelo)),[catalogo,produto.marca]);
  const capacidades=useMemo(()=>unicos(catalogo.filter(p=>p.marca===produto.marca&&p.modelo===produto.modelo).map(p=>p.capacidade)),[catalogo,produto.marca,produto.modelo]);
  const cores=useMemo(()=>unicos(catalogo.filter(p=>p.marca===produto.marca&&p.modelo===produto.modelo&&String(p.capacidade||'')===produto.capacidade).map(p=>p.cor)),[catalogo,produto]);
  const selecionado=catalogo.find(p=>p.marca===produto.marca&&p.modelo===produto.modelo&&String(p.capacidade||'')===produto.capacidade&&p.cor===produto.cor);
  const tipo=tipoDoAparelho(produto.modelo,selecionado?.tipo);
  const segundoObrigatorio=tipo==='CELULAR'&&exigeDoisImeis(produto.modelo,tipo,false,false);
  const imeisOpcionais=resultado==='RECUSADO';
  const visiveis=useMemo(()=>fila.filter(a=>[a.voucher,a.codigo_rastreio,a.destinatario_correios,a.observacoes].some(v=>limpar(v).includes(limpar(busca)))),[fila,busca]);
  const defeitosVisiveis=useMemo(()=>{
    const termo=limpar(buscaDefeito.trim());
    return !termo ? catalogoDefeitos : catalogoDefeitos.filter(d =>
      limpar(d.nome).includes(termo)||limpar(d.categoria).includes(termo)
    );
  },[catalogoDefeitos,buscaDefeito]);
  const opcao=OPCOES.find(o=>o.valor===resultado);

  function abrir(a){setItem(a);setResultado('');setProduto(vazio());setImei1('');setImei2('');setDefeitos([]);setBuscaDefeito('');setErroModal('');setSucesso('');}
  function fechar(){if(!salvando){setItem(null);setResultado('');setErroModal('');}}
  useEffect(()=>{
    if(!item)return;
    const listener=e=>{if(e.key==='Escape'&&!salvando){setItem(null);setResultado('');}};
    window.addEventListener('keydown',listener);
    return()=>window.removeEventListener('keydown',listener);
  },[item,salvando]);
  function alterarDefeito(nome){setDefeitos(a=>a.includes(nome)?a.filter(x=>x!==nome):[...a,nome]);}
  function erroValidacao(){
    if(!selecionado)return 'Selecione marca, modelo, capacidade e cor do catálogo.';
    if(imeisOpcionais){
      if(imei2&&!imei1)return 'Bipe o IMEI 1 antes do IMEI 2.';
      if(tipo==='CELULAR'){
        if(imei1&&!/^\d{15}$/.test(imei1))return 'IMEI 1 deve conter 15 dígitos.';
        if(imei2&&!/^\d{15}$/.test(imei2))return 'IMEI 2 deve conter 15 dígitos.';
        if(imei1&&imei2&&imei1===imei2)return 'Os dois IMEIs devem ser diferentes.';
      }else{
        if(imei2)return 'Tablet/relógio usa somente um serial.';
        if(imei1&&!/^[A-Za-z0-9][A-Za-z0-9._/-]{2,63}$/.test(imei1))return 'Serial inválido.';
      }
    }else{
      const msg=erroIdentificacao(tipo,imei1,imei2,{modelo:produto.modelo});
      if(msg)return msg;
    }
    if(resultado!=='GRADE_MATCH'&&defeitos.length===0)return 'Selecione pelo menos um defeito adicional.';
    if(resultado==='GRADE_MATCH'&&!selecionado?.sku_als)return 'Modelo sem SKU ALS cadastrado para a Cosmética.';
    return null;
  }
  async function concluir(e){
    e.preventDefault();if(!item||salvando||!resultado)return;
    const erro=erroValidacao();if(erro){setErroModal(erro);return;}
    setSalvando(true);setErroModal('');
    try{
      const r=await finalizarTriagemAlsOnline({aparelho_id:item.id,resultado,produto,imei1:imei1.trim(),imei2:imei2.trim(),defeitos});
      setSucesso('Voucher '+r.voucher+' concluído como '+opcao.nome+'. Destino: '+r.proxima_etapa+'.');
      setItem(null);setResultado('');await carregar();
    }catch(err){setErroModal(err.message);}finally{setSalvando(false);}
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3"><div className="rounded-xl bg-violet-50 p-3 text-violet-700"><ClipboardCheck size={22}/></div>
        <div><p className="text-xs text-slate-500">Vouchers aguardando Triagem ALS</p><p className="text-3xl font-black">{fila.length.toLocaleString('pt-BR')}</p></div></div>
      <button type="button" onClick={carregar} disabled={carregando||salvando} className={botao}><RefreshCw size={15} className="mr-1 inline"/> Atualizar fila</button>
    </div>
    {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-800">{erro}</div>}
    {sucesso&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-bold text-emerald-900">{sucesso}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-black">Fila por voucher</h2><p className="mt-1 text-xs text-slate-500">Clique no voucher para iniciar a Triagem ALS.</p></div>
        <div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-slate-400"/>
          <input className={campo+' pl-9'} placeholder="Buscar voucher ou objeto" value={busca} onChange={e=>setBusca(e.target.value)}/></div>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs">
        <thead className="bg-slate-50">{['Voucher','Objeto Correios','Destinatário','Observações','Data do vínculo','Ação'].map(x=><th className="border-b p-3" key={x}>{x}</th>)}</thead>
        <tbody>{visiveis.map(a=><tr key={a.id} className="border-b hover:bg-violet-50/30">
          <td className="p-3"><button type="button" className="font-mono font-black text-violet-700 hover:underline" onClick={()=>abrir(a)}>{a.voucher}</button></td>
          <td className="p-3 font-mono">{a.codigo_rastreio}</td><td className="p-3">{a.destinatario_correios}</td>
          <td className="p-3">{a.observacoes||'—'}</td><td className="p-3">{a.criado_em?new Date(a.criado_em).toLocaleString('pt-BR'):'—'}</td>
          <td className="p-3"><button type="button" className={botao} onClick={()=>abrir(a)}>Abrir triagem</button></td>
        </tr>)}</tbody></table>
        {!carregando&&visiveis.length===0&&<p className="py-10 text-center text-xs text-slate-500">Nenhum voucher aguardando ALS.</p>}
      </div>
    </section>
    {item&&<div className="fixed inset-0 z-[120] flex items-start justify-center overflow-y-auto bg-slate-950/60 p-3 pt-[5vh] sm:p-6"
        onMouseDown={e=>{if(e.target===e.currentTarget)fechar();}}>
      <div role="dialog" aria-modal="true" aria-labelledby="triagem-als-title" className="w-full max-w-3xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-start justify-between gap-4 border-b pb-4">
          <div><p className="text-[10px] font-black uppercase text-violet-700">Triagem ALS · Objeto {item.codigo_rastreio}</p>
            <h2 id="triagem-als-title" className="mt-1 text-xl font-black">{item.voucher}</h2>
            <p className="mt-1 text-xs text-slate-500">{item.destinatario_correios} · {item.observacoes||'Sem observações'}</p></div>
          <button type="button" disabled={salvando} onClick={fechar} className="rounded-lg p-2 hover:bg-slate-100" aria-label="Fechar"><X size={19}/></button>
        </div>
        {erroModal&&<div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800">{erroModal}</div>}
        {!resultado?<div className="mt-5 space-y-3">
          <p className="text-sm font-black">Selecione o resultado da Triagem ALS</p>
          {OPCOES.map(o=><button type="button" key={o.valor} onClick={()=>{setResultado(o.valor);setErroModal('');}}
            className="flex w-full items-center gap-3 rounded-xl border border-slate-200 p-4 text-left transition hover:border-violet-500 hover:bg-violet-50">
            <div className="rounded-lg bg-violet-100 p-2 text-violet-700">{o.valor==='GRADE_MATCH'?<CheckCircle2 size={19}/>:o.valor==='TRINCADO'?<AlertTriangle size={19}/>:<FileText size={19}/>}</div>
            <div><p className="text-sm font-black">{o.nome}</p><p className="mt-1 text-xs text-slate-500">{o.detalhe}</p></div>
          </button>)}
        </div>:<form onSubmit={concluir} className="mt-5 space-y-5">
          <div className="flex items-center gap-3 rounded-xl bg-violet-50 p-3">
            <button type="button" className={botao} disabled={salvando} onClick={()=>{setResultado('');setErroModal('');}}><ArrowLeft size={14} className="inline"/> Voltar</button>
            <div><p className="text-xs font-black text-violet-950">{opcao?.nome}</p><p className="text-[11px] text-violet-800">{opcao?.detalhe}</p></div>
          </div>
          <section>
            <h3 className="text-sm font-black">Identificação do modelo</h3>
            <p className="mt-1 text-xs text-slate-500">Mesmo catálogo usado na Triagem Funcional de Lojas.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">Marca *
                <select required className={campo} value={produto.marca} onChange={e=>setProduto({marca:e.target.value,modelo:'',capacidade:'',cor:''})}>
                  <option value="">Selecione a marca</option>{marcas.map(m=><option key={m} value={m}>{m}</option>)}</select>
              </label>
              <label className="text-xs font-bold">Modelo *
                <select required className={campo} disabled={!produto.marca} value={produto.modelo} onChange={e=>setProduto(p=>({...p,modelo:e.target.value,capacidade:'',cor:''}))}>
                  <option value="">Selecione o modelo</option>{modelos.map(m=><option key={m} value={m}>{m}</option>)}</select>
              </label>
              <label className="text-xs font-bold">Capacidade / armazenamento
                <select className={campo} required={capacidades.length>0} disabled={!produto.modelo} value={produto.capacidade}
                  onChange={e=>setProduto(p=>({...p,capacidade:e.target.value,cor:''}))}>
                  <option value="">{capacidades.length?'Selecione a capacidade':'Não se aplica'}</option>{capacidades.map(c=><option key={c} value={c}>{c}</option>)}</select>
              </label>
              <label className="text-xs font-bold">Cor *
                <select required className={campo} disabled={!produto.modelo} value={produto.cor} onChange={e=>setProduto(p=>({...p,cor:e.target.value}))}>
                  <option value="">Selecione a cor</option>{cores.map(c=><option key={c} value={c}>{c}</option>)}</select>
              </label>
            </div>
            {selecionado&&<p className="mt-2 text-xs text-violet-700">Tipo: {tipo} · SKU ALS: {selecionado.sku_als||'Pendente'} · {segundoObrigatorio?'2 IMEIs':'Identificação simples'}</p>}
          </section>
          <section>
            <div className="flex items-center gap-2"><ScanLine size={16} className="text-violet-700"/><h3 className="text-sm font-black">Bipagem de IMEIs {imeisOpcionais?'(opcional)':'*'}</h3></div>
            <p className="mt-1 text-xs text-slate-500">{tipo==='CELULAR'?'IMEI de celular: 15 dígitos.':'Tablet/relógio: serial de 3 a 64 caracteres.'} {imeisOpcionais?'Recusado permite deixar ambos os códigos em branco.':segundoObrigatorio?'Este modelo exige dois IMEIs.':''}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-bold">{tipo==='CELULAR'?'IMEI 1':'Serial'} {!imeisOpcionais?'*':''}
                <input className={campo+' font-mono'} value={imei1} required={!imeisOpcionais}
                  maxLength={tipo==='CELULAR'?15:64} inputMode={tipo==='CELULAR'?'numeric':'text'}
                  onChange={e=>setImei1(tipo==='CELULAR'?e.target.value.replace(/\D/g,''):e.target.value.trim())}
                  placeholder={tipo==='CELULAR'?'Bipe o IMEI 1':'Bipe o serial'}/></label>
              {tipo==='CELULAR'&&<label className="text-xs font-bold">IMEI 2 {!imeisOpcionais&&segundoObrigatorio?'*':''}
                <input className={campo+' font-mono'} value={imei2} maxLength={15} inputMode="numeric"
                  required={!imeisOpcionais&&segundoObrigatorio}
                  onChange={e=>setImei2(e.target.value.replace(/\D/g,''))} placeholder="Bipe o IMEI 2"/></label>}
            </div>
          </section>
          <section>
            <div className="flex items-center justify-between gap-2"><h3 className="text-sm font-black">Defeitos adicionais {resultado==='GRADE_MATCH'?'(opcional)':'*'}</h3>
              <span className="text-xs text-slate-500">{defeitos.length} selecionado(s) · {catalogoDefeitos.length} opções</span></div>
            <div className="mt-2 flex flex-wrap gap-2">{defeitos.map(d=><button key={d} type="button" onClick={()=>alterarDefeito(d)} className="rounded-full border border-violet-300 bg-violet-50 px-3 py-1.5 text-[11px] text-violet-950">{d} <X size={12} className="inline"/></button>)}</div>
            <input className={campo} placeholder="Pesquisar defeitos" value={buscaDefeito} onChange={e=>setBuscaDefeito(e.target.value)}/>
            <div className="mt-2 max-h-[300px] overflow-y-auto rounded-xl border border-slate-100 bg-slate-50/60 p-3">
              {defeitosVisiveis.length ? <div className="flex flex-wrap gap-2">
                {defeitosVisiveis.map(d=>{
                  const marcado=defeitos.includes(d.nome);
                  return <button key={d.id} type="button" onClick={()=>alterarDefeito(d.nome)}
                    aria-pressed={marcado}
                    className={`rounded-xl border px-3 py-2 text-[11px] font-bold transition ${marcado
                      ? 'border-violet-700 bg-violet-700 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50'}`}>
                    {d.nome}
                  </button>;
                })}
              </div> : <p className="py-6 text-center text-xs font-semibold text-slate-400">Nenhum defeito encontrado para esta pesquisa.</p>}
            </div>
          </section>
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <button className={botao} type="button" disabled={salvando} onClick={fechar}>Cancelar</button>
            <button type="submit" disabled={salvando||!selecionado||(!imeisOpcionais&&!imei1)||(resultado!=='GRADE_MATCH'&&!defeitos.length)}
              className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-xs font-black text-white disabled:opacity-40">
              <CheckCircle2 size={16}/>{salvando?'Concluindo…':'Concluir Triagem ALS'}</button>
          </div>
        </form>}
      </div>
    </div>}
  </div>;
}
