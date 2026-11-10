import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Camera, CheckCircle2, ClipboardCheck, Download, FileSpreadsheet, FileText,
  ImagePlus, Loader2, RefreshCw, Search, Undo2, X
} from 'lucide-react';
import { listarEtapaOnline } from '../../services/tradeinOnlineService.js';
import {
  consultarLaudoOnline,confirmarLaudoSamv,salvarLaudoGrv,registrarDocumentosGrv,
  finalizarOmniGrv,enviarFotoLaudo,enviarDocumentosLaudo,
  baixarArquivoLaudo,recuperarFotoLaudo
} from '../../services/tradeinOnlineLaudoService.js';
import { prepararFoto, gerarFotoAnotada, gerarLaudoPdf, gerarLaudoExcel, nomeArquivoLaudo } from '../../services/laudoGrvExportService.js';

const inicial=()=>({
  nome_cliente:'',numero_pedido:'',imei_documento:'',
  modelo_documento:'',capacidade_documento:'',cor_documento:'',
  descricao_final:'O dispositivo possui condições divergentes daquelas informadas na pré-avaliação pelo App Itaú.',
  pre_avaliacao:'',avaliacao_fisica:''
});
const campo='mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500';
const botao='inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-bold text-slate-700 transition hover:border-violet-300 disabled:opacity-40';
const normalizar=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const fotoVazia=()=>Array.from({length:4},()=>null);
const arquivoPdf=voucher=>'laudo_grv_'+nomeArquivoLaudo(voucher)+'.pdf';
const arquivoXlsx=voucher=>'laudo_grv_'+nomeArquivoLaudo(voucher)+'.xlsx';
const isSamv=voucher=>/^SAMV/i.test(String(voucher||''));

export default function LaudosTradeinOnlinePanel(){
  const [fila,setFila]=useState([]);
  const [busca,setBusca]=useState('');
  const [aberto,setAberto]=useState(null);
  const [dadosLaudo,setDadosLaudo]=useState(null);
  const [form,setForm]=useState(inicial);
  const [fotos,setFotos]=useState(fotoVazia);
  const [carregando,setCarregando]=useState(false);
  const [abrindo,setAbrindo]=useState(false);
  const [processando,setProcessando]=useState(false);
  const [mudou,setMudou]=useState(false);
  const [etapa,setEtapa]=useState('');
  const [erro,setErro]=useState('');
  const [mensagem,setMensagem]=useState('');
  const [erroModal,setErroModal]=useState('');
  const camRefs=useRef([]);
  const galRefs=useRef([]);

  const carregar=useCallback(async()=>{
    setCarregando(true);setErro('');
    try{
      const r=await listarEtapaOnline('aguardando_laudo');
      setFila(r.aparelhos||[]);
    }catch(e){setErro(e.message);}
    finally{setCarregando(false);}
  },[]);
  useEffect(()=>{carregar();},[carregar]);
  const visiveis=useMemo(()=>fila.filter(a=>
    [a.voucher,a.codigo_rastreio,a.modelo,a.imei,a.defeitos_als?.join('; ')].some(v=>normalizar(v).includes(normalizar(busca)))
  ),[fila,busca]);

  async function confirmarSamv(item){
    if(processando)return;
    if(!window.confirm('Confirmar LAUDO REALIZADO para '+item.voucher+'? O voucher será encaminhado para Aguardando Definição do Cliente.'))return;
    setProcessando(true);setErro('');setMensagem('');
    try{
      await confirmarLaudoSamv(item.id);
      setMensagem('Laudo SAMV de '+item.voucher+' confirmado. Encaminhado para Aguardando Definição do Cliente.');
      await carregar();
    }catch(e){setErro(e.message);}
    finally{setProcessando(false);}
  }

  async function abrirGrv(item){
    if(abrindo||processando)return;
    setAbrindo(true);setErro('');setErroModal('');
    try{
      const resposta=await consultarLaudoOnline(item.id);
      const a=resposta.aparelho||item,l=resposta.laudo;
      const base={
        ...inicial(),
        numero_pedido:a.pedido_origem||'',
        imei_documento:[a.imei,a.imei2].filter(Boolean).join(' / '),
        modelo_documento:a.modelo||'',
        capacidade_documento:a.capacidade||'',
        cor_documento:a.cor||'',
        avaliacao_fisica:(a.defeitos_als||[]).length
          ?'Na avaliação física foram identificados: '+a.defeitos_als.join('; ')+'.'
          :''
      };
      if(l){
        for(const key of Object.keys(base)){
          if(l[key]!=null)base[key]=l[key];
        }
      }
      const refs=Array.isArray(l?.fotos)?l.fotos:[];
      const carregadas=await Promise.all(Array.from({length:4},async(_,i)=>{
        const ref=refs.find(x=>Number(x.pos)===i+1);
        if(!ref?.path)return null;
        const dataUrl=await recuperarFotoLaudo(ref.path);
        return {dataUrl,path:ref.path,arrows:Array.isArray(ref.arrows)?ref.arrows:[],
          bakedCount:Array.isArray(ref.arrows)?ref.arrows.length:0,dirty:false};
      }));
      setAberto(a);setDadosLaudo(l||null);setForm(base);
      setFotos(carregadas);setMudou(false);setEtapa('');
    }catch(e){setErro(e.message);}
    finally{setAbrindo(false);}
  }

  function atualizarCampo(key,value){
    setForm(prev=>({...prev,[key]:value}));
    setMudou(true);setErroModal('');
  }
  async function escolherFoto(i,file){
    if(!file||processando)return;
    setErroModal('');
    try{
      const dataUrl=await prepararFoto(file);
      setFotos(prev=>prev.map((a,j)=>i===j?{dataUrl,path:null,arrows:[],bakedCount:0,dirty:true}:a));
      setMudou(true);
    }catch(e){setErroModal(e.message);}
    if(camRefs.current[i])camRefs.current[i].value='';
    if(galRefs.current[i])galRefs.current[i].value='';
  }
  function colocarSeta(i,event){
    if(processando||!fotos[i])return;
    const rect=event.currentTarget.getBoundingClientRect();
    const x=Math.max(0,Math.min(1,(event.clientX-rect.left)/rect.width));
    const y=Math.max(0,Math.min(1,(event.clientY-rect.top)/rect.height));
    setFotos(prev=>prev.map((a,j)=>i===j?{...a,arrows:[...a.arrows,{x,y}],dirty:true}:a));
    setMudou(true);
  }
  function desfazerSeta(i){
    if(processando)return;
    setFotos(prev=>prev.map((a,j)=>{
      if(i!==j||!a||a.arrows.length<=a.bakedCount)return a;
      return {...a,arrows:a.arrows.slice(0,-1),dirty:true};
    }));
    setMudou(true);
  }
  function fechar(){
    if(processando)return;
    if(mudou&&!window.confirm('Fechar o laudo? Alterações não salvas serão perdidas.'))return;
    setAberto(null);setDadosLaudo(null);setErroModal('');
  }
  useEffect(()=>{
    if(!aberto)return;
    const listener=e=>{if(e.key==='Escape'&&!processando){/* O fechamento com aviso de rascunho fica no botão Fechar. */}};
    window.addEventListener('keydown',listener);
    return()=>window.removeEventListener('keydown',listener);
  },[aberto,processando]);

  async function gerarDocumentos(e){
    e.preventDefault();if(!aberto||processando)return;
    if(fotos.some(f=>!f?.dataUrl)){setErroModal('Anexe as quatro fotos (1 a 4) antes de gerar o laudo.');return;}
    if(!form.pre_avaliacao.trim()||!form.avaliacao_fisica.trim()||!form.descricao_final.trim()){
      setErroModal('Preencha a pré-avaliação, a avaliação física e a descrição final.');return;
    }
    setProcessando(true);setErroModal('');setEtapa('Preparando as quatro fotografias...');
    try{
      const imagens=await Promise.all(fotos.map(f=>gerarFotoAnotada(f.dataUrl,f.arrows.slice(f.bakedCount||0))));
      const novasFotos=[];
      for(let i=0;i<4;i++){
        setEtapa('Armazenando fotografia '+(i+1)+' de 4...');
        const existente=fotos[i];
        const path=existente.path&&!existente.dirty
          ?existente.path
          :await enviarFotoLaudo(aberto.id,i+1,imagens[i]);
        novasFotos.push({pos:i+1,path,arrows:fotos[i].arrows});
      }
      setEtapa('Gravando os dados do laudo...');
      await salvarLaudoGrv(aberto.id,{...form,fotos:novasFotos});
      setEtapa('Gerando PDF e Excel com as quatro fotos...');
      const pdf=gerarLaudoPdf(form,imagens);
      const excel=await gerarLaudoExcel(form,imagens);
      setEtapa('Salvando PDF e Excel no armazenamento privado...');
      const arquivos=await enviarDocumentosLaudo(aberto.id,aberto.voucher,pdf,excel);
      const response=await registrarDocumentosGrv(aberto.id,arquivos.pdf_path,arquivos.excel_path);
      setDadosLaudo(response.laudo);
      setFotos(fotos.map((f,i)=>({...f,dataUrl:imagens[i],path:novasFotos[i].path,
        bakedCount:f.arrows.length,dirty:false})));
      setMudou(false);setEtapa('');
      setMensagem('Laudo do voucher '+aberto.voucher+' salvo. PDF e Excel gerados com quatro fotos. Confirme Omni finalizado após o registro no Omni.');
    }catch(err){setErroModal(err.message);}
    finally{setProcessando(false);setEtapa('');}
  }

  async function finalizarOmni(){
    if(!aberto||processando||mudou||dadosLaudo?.status!=='documentos_gerados')return;
    if(!window.confirm('Confirmar OMNI FINALIZADO para '+aberto.voucher+'? O voucher seguirá para Aguardando Definição do Cliente.'))return;
    setProcessando(true);setErroModal('');
    try{
      await finalizarOmniGrv(aberto.id);
      setMensagem('Omni finalizado para '+aberto.voucher+'. O voucher foi encaminhado para Aguardando Definição do Cliente.');
      setAberto(null);setDadosLaudo(null);await carregar();
    }catch(e){setErroModal(e.message);}
    finally{setProcessando(false);}
  }
  async function baixar(path,nome){
    try{await baixarArquivoLaudo(path,nome);}catch(e){setErroModal(e.message);}
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div><h2 className="text-lg font-black">Laudos · fila por voucher</h2>
        <p className="mt-1 text-xs text-slate-500">SAMV: confirmar laudo realizado. GRV: quatro fotos, setas vermelhas, PDF, Excel e Omni finalizado.</p></div>
      <div className="flex items-center gap-3"><strong className="text-2xl text-violet-700">{fila.length}</strong>
        <button type="button" onClick={carregar} disabled={carregando||processando||abrindo} className={botao}><RefreshCw size={15}/>Atualizar fila</button></div>
    </div>
    {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs font-semibold text-rose-800">{erro}</div>}
    {mensagem&&<div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-900">{mensagem}</div>}
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-black">Produtos aguardando Laudo</h3>
        <div className="relative"><Search size={16} className="absolute left-3 top-3.5 text-slate-400"/>
          <input value={busca} onChange={e=>setBusca(e.target.value)} placeholder="Buscar voucher ou objeto" className={campo+' pl-9'}/></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[860px] text-left text-xs">
        <thead><tr className="border-b bg-slate-50 text-slate-600">{['Voucher','Objeto Correios','Resultado ALS','Aparelho / IMEI','Defeitos ALS','Ação'].map(t=><th className="p-3" key={t}>{t}</th>)}</tr></thead>
        <tbody>{visiveis.map(a=><tr key={a.id} className="border-b">
          <td className="p-3 font-mono font-black text-violet-700">{a.voucher}</td>
          <td className="p-3 font-mono">{a.codigo_rastreio}</td>
          <td className="p-3">{a.resultado_als==='TRINCADO'?'Trincado':a.resultado_als==='RECUSADO'?'Recusado':a.resultado_als||'—'}</td>
          <td className="p-3">{a.modelo||'Modelo não informado'}<p className="mt-1 font-mono text-slate-500">{a.imei||'IMEI não bipado'}</p></td>
          <td className="max-w-[260px] p-3">{(a.defeitos_als||[]).join('; ')||'—'}</td>
          <td className="p-3">{isSamv(a.voucher)
            ?<button type="button" onClick={()=>confirmarSamv(a)} disabled={processando} className="rounded-xl bg-emerald-700 px-4 py-2.5 font-bold text-white disabled:opacity-50">Laudo realizado?</button>
            :<button type="button" onClick={()=>abrirGrv(a)} disabled={processando||abrindo} className="rounded-xl bg-violet-700 px-4 py-2.5 font-bold text-white disabled:opacity-50">{abrindo?'Abrindo…':'Elaborar laudo GRV'}</button>}
          </td>
        </tr>)}</tbody>
      </table>
      {!carregando&&!visiveis.length&&<p className="py-9 text-center text-xs text-slate-500">Nenhum voucher aguardando laudo.</p>}
      </div>
    </section>

    {aberto&&<div className="fixed inset-0 z-[125] overflow-y-auto bg-slate-950/70 p-3 pt-[3vh] sm:p-5" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="laudo-online-titulo" className="mx-auto max-w-[1100px] rounded-2xl bg-white p-4 shadow-2xl sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-4">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-violet-700">Assurant · Laudo da Avaliação Final</p>
            <h2 id="laudo-online-titulo" className="mt-1 text-xl font-black">GRV · {aberto.voucher}</h2>
            <p className="mt-1 text-xs text-slate-500">Objeto: {aberto.objeto} · Resultado ALS: {aberto.resultado_als||'—'} · Data: {new Date().toLocaleDateString('pt-BR')}</p></div>
          <button type="button" className={botao} onClick={fechar} disabled={processando}><X size={15}/>Fechar</button>
        </header>
        {erroModal&&<div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-800">{erroModal}</div>}
        <form onSubmit={gerarDocumentos} className="mt-5 space-y-5">
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-black">Identificação do aparelho e pedido</h3>
            <p className="mt-1 text-xs text-slate-500">Campos conhecidos são preenchidos pela Triagem ALS. Se nome, pedido ou pré-avaliação não constarem na base, preencha manualmente.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[
                ['nome_cliente','Nome do cliente'],['imei_documento','IMEI / Serial'],
                ['numero_pedido','Nº pedido'],['modelo_documento','Modelo'],
                ['capacidade_documento','Capacidade'],['cor_documento','Cor']
              ].map(([id,rotulo])=><label key={id} className="text-xs font-bold text-slate-700">{rotulo}
                <input className={campo} value={form[id]} onChange={e=>atualizarCampo(id,e.target.value)} placeholder={rotulo}/>
              </label>)}
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <h3 className="text-sm font-black">Descrição da avaliação final</h3>
            <div className="mt-3 grid gap-3">
              <label className="text-xs font-bold">Descrição da avaliação final *
                <textarea required value={form.descricao_final} onChange={e=>atualizarCampo('descricao_final',e.target.value)} className={campo+' min-h-[70px]'} rows={2}/></label>
              <label className="text-xs font-bold">Na pré-avaliação pelo App Itaú *
                <textarea required value={form.pre_avaliacao} onChange={e=>atualizarCampo('pre_avaliacao',e.target.value)} className={campo+' min-h-[70px]'} rows={2} placeholder="Condições declaradas pelo cliente no App Itaú"/></label>
              <label className="text-xs font-bold">Na avaliação física do aparelho *
                <textarea required value={form.avaliacao_fisica} onChange={e=>atualizarCampo('avaliacao_fisica',e.target.value)} className={campo+' min-h-[70px]'} rows={2} placeholder="Condições observadas e divergências encontradas"/></label>
            </div>
          </section>
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 className="text-sm font-black">Fotos da divergência · 4 fotos obrigatórias</h3>
                <p className="mt-1 text-xs text-slate-500">Mesma disposição do laudo anexo: 1 e 2 na primeira linha, 3 e 4 na segunda. Clique diretamente na foto para acrescentar uma seta vermelha apontando o defeito.</p></div>
              <span className="text-xs font-bold text-violet-700">{fotos.filter(Boolean).length}/4 fotos</span>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {fotos.map((foto,i)=><div key={i} className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-3 py-2"><b className="text-xs">Foto {i+1}</b><span className="text-[11px] text-slate-500">{foto?.arrows?.length||0} seta(s)</span></div>
                <div className="relative aspect-[4/3] bg-slate-100">
                  {foto?<div onClick={e=>colocarSeta(i,e)} role="button" tabIndex={0} aria-label={'Adicionar seta na foto '+(i+1)}
                    className="relative h-full w-full cursor-crosshair overflow-hidden">
                    <img src={foto.dataUrl} className="h-full w-full object-cover" alt={'Fotografia da divergência '+(i+1)}/>
                    <svg viewBox="0 0 1000 750" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
                      <defs><marker id={'seta-online-'+i} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="4.5" markerHeight="4.5" orient="auto-start-reverse"><path d="M 1 1 L 9 5 L 1 9" fill="none" stroke="red" strokeWidth="1.7"/></marker></defs>
                      {foto.arrows.slice(foto.bakedCount||0).map((a,j)=>
                        <line key={j} x1={a.x*1000-73} y1={a.y*750-86} x2={a.x*1000} y2={a.y*750} stroke="#e00000" strokeWidth="4"
                          strokeLinecap="round" markerEnd={'url(#seta-online-'+i+')'}/>)}
                    </svg>
                  </div>:<div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400"><ImagePlus size={30}/><p className="text-xs">Sem fotografia</p></div>}
                </div>
                <div className="flex flex-wrap gap-2 p-3">
                  <input type="file" accept="image/*" capture="environment" className="hidden"
                    ref={el=>{camRefs.current[i]=el;}} onChange={e=>escolherFoto(i,e.target.files?.[0])}/>
                  <input type="file" accept="image/*" className="hidden"
                    ref={el=>{galRefs.current[i]=el;}} onChange={e=>escolherFoto(i,e.target.files?.[0])}/>
                  <button type="button" disabled={processando} onClick={()=>camRefs.current[i]?.click()} className={botao}><Camera size={14}/>Câmera</button>
                  <button type="button" disabled={processando} onClick={()=>galRefs.current[i]?.click()} className={botao}><ImagePlus size={14}/>Arquivo</button>
                  <button type="button" disabled={processando||!foto||foto.arrows.length<=foto.bakedCount}
                    onClick={()=>desfazerSeta(i)} className={botao}><Undo2 size={14}/>Desfazer seta</button>
                </div>
              </div>)}
            </div>
          </section>
          <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm font-black text-violet-950">Finalização do laudo GRV</p>
                <p className="mt-1 text-xs text-violet-800">Primeiro salve e gere os dois arquivos. Depois marque Omni finalizado quando concluir o registro no Omni.</p></div>
              <button type="submit" disabled={processando} className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-3 text-xs font-black text-white disabled:opacity-40">
                {processando?<Loader2 size={16} className="animate-spin"/>:<FileText size={16}/>}
                {processando?'Processando…':'Salvar e gerar PDF + Excel'}
              </button>
            </div>
            {etapa&&<p className="mt-3 text-xs font-semibold text-violet-900">{etapa}</p>}
            {dadosLaudo?.pdf_path&&dadosLaudo?.excel_path&&!mudou&&<div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={processando} className={botao}
                  onClick={()=>baixar(dadosLaudo.pdf_path,arquivoPdf(aberto.voucher))}><Download size={15}/>Baixar PDF</button>
                <button type="button" disabled={processando} className={botao}
                  onClick={()=>baixar(dadosLaudo.excel_path,arquivoXlsx(aberto.voucher))}><FileSpreadsheet size={15}/>Baixar Excel com fotos</button>
              </div>
              <label className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-bold text-slate-800">
                <input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={false}
                  disabled={processando||dadosLaudo.status!=='documentos_gerados'}
                  onChange={e=>{if(e.target.checked)finalizarOmni();}}/>
                Omni finalizado
              </label>
            </div>}
            {mudou&&dadosLaudo?.pdf_path&&<p className="mt-3 text-xs text-amber-800">Existem alterações não salvas. Gere novamente os documentos antes de marcar Omni finalizado.</p>}
          </div>
        </form>
      </div>
    </div>}
  </div>;
}
