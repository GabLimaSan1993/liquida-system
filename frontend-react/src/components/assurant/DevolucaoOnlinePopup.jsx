import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, FileText, Package, ScanLine, X } from 'lucide-react';
import { consultarDevolucaoOnline, concluirDevolucaoOnline, enviarDocumentosDevolucao, baixarDeclaracaoDevolucao } from '../../services/tradeinOnlineDevolucaoService.js';
import { gerarDeclaracaoConteudoPDF, REMETENTE_DECLARACAO } from '../../services/declaracaoConteudoOnlinePdfService.js';
import { gerarDeclaracaoConteudoExcel } from '../../services/declaracaoConteudoOnlineExcelService.js';
import { buscarDadosDevolucaoOnline } from '../../services/tradeinOnlineGrvImportService.js';

const campo='mt-1 block w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-violet-500';
const titulo='text-[11px] font-bold text-slate-600';
const inicial={nome:'',endereco:'',bairro:'',cidade:'',uf:'',cep:'',cpf_cnpj:''};
const clean=v=>String(v||'').trim();

export default function DevolucaoOnlinePopup({ item, onClose, onConcluido }) {
  const [eticket,setEticket]=useState('');
  const [destinatario,setDestinatario]=useState(inicial);
  const [conteudo,setConteudo]=useState('CELULAR');
  const [valor,setValor]=useState('');
  const [origemDados,setOrigemDados]=useState('');
  const [peso,setPeso]=useState('');
  const [carregando,setCarregando]=useState(true);
  const [salvando,setSalvando]=useState(false);
  const [erro,setErro]=useState('');
  const [resultado,setResultado]=useState(null);
  const [baixando,setBaixando]=useState('');
  const inputEticket=useRef(null);

  useEffect(()=>{
    let ativo=true;
    consultarDevolucaoOnline(item.id)
      .then(async r=>{
        if(!ativo)return;
        if(r.documento){
          setEticket(r.documento.eticket||'');
          setDestinatario({...inicial,...(r.documento.destinatario||{})});
          setConteudo(r.documento.conteudo||'CELULAR');
          setValor(String(r.documento.valor_declarado??''));
          setPeso(r.documento.peso_total_kg ? String(r.documento.peso_total_kg) : '');
          setResultado(r.documento);
          return;
        }
        setConteudo(item.tipo_aparelho==='TABLET'?'TABLET':item.tipo_aparelho==='RELOGIO'?'RELÓGIO':'CELULAR');
        const dados=await buscarDadosDevolucaoOnline(item.id);
        if(!ativo)return;
        if(dados?.encontrado&&dados?.dados){
          const p=dados.dados;
          setOrigemDados(p.fonte||'Base importada');
          setDestinatario({
            nome:clean(p.nome),cpf_cnpj:clean(p.cpf_cnpj),
            endereco:clean(p.endereco),bairro:clean(p.bairro),
            cidade:clean(p.cidade),uf:clean(p.uf).toUpperCase(),cep:clean(p.cep)
          });
          if(clean(p.conteudo))setConteudo(clean(p.conteudo));
          if(p.valor_declarado!=null&&Number(p.valor_declarado)>0)
            setValor(Number(p.valor_declarado).toFixed(2));
          // Peso não é pré-preenchido em nenhuma hipótese.
          setPeso('');
        }else{
          setOrigemDados('Voucher ainda não localizado nas importações diárias');
          setValor('');setPeso('');
        }
      })
      .catch(e=>{if(ativo)setErro(e.message);})
      .finally(()=>{if(ativo){setCarregando(false);setTimeout(()=>inputEticket.current?.focus(),70);}});
    return()=>{ativo=false;};
  },[item.id,item.tipo_aparelho]);

  function mudarDestinatario(chave,valor){
    setDestinatario(prev=>({...prev,[chave]:valor}));
  }

  async function baixar(tipo) {
    if(!resultado)return;
    setBaixando(tipo);setErro('');
    try {
      await baixarDeclaracaoDevolucao(tipo==='pdf'?resultado.pdf_path:resultado.excel_path,item.voucher,tipo);
    }catch(e){setErro(e.message);}
    finally{setBaixando('');}
  }

  async function gerar(e){
    e.preventDefault();
    if(salvando||resultado)return;
    const numeroTicket=clean(eticket).toUpperCase();
    if(!/^[A-Z0-9._/-]{6,80}$/.test(numeroTicket)){
      setErro('Bipe um e-ticket válido: mínimo 6 caracteres alfanuméricos.');inputEticket.current?.focus();return;
    }
    if(!clean(destinatario.nome)||!clean(destinatario.endereco)||!clean(destinatario.bairro)||!clean(destinatario.cidade)||!clean(destinatario.uf)||!clean(destinatario.cep)){
      setErro('Preencha os dados completos do destinatário antes de gerar a declaração.');return;
    }
    if(!/^\d{5}-?\d{3}$/.test(clean(destinatario.cep))){
      setErro('O CEP do destinatário deve ter 8 dígitos.');return;
    }
    const preco=Number(String(valor).replace(',','.'));
    if(!Number.isFinite(preco)||preco<=0){
      setErro('O valor declarado precisa ser maior que zero.');return;
    }
    const p=clean(peso).replace(',','.');
    if(p&&(!Number.isFinite(Number(p))||Number(p)<=0)){
      setErro('Informe o peso em quilogramas, por exemplo: 0,350.');return;
    }
    const info={
      voucher:item.voucher,eticket:numeroTicket,
      destinatario:{
        nome:clean(destinatario.nome),endereco:clean(destinatario.endereco),
        bairro:clean(destinatario.bairro),cidade:clean(destinatario.cidade),
        uf:clean(destinatario.uf).toUpperCase(),cep:clean(destinatario.cep),
        cpf_cnpj:clean(destinatario.cpf_cnpj)
      },
      conteudo:clean(conteudo).toUpperCase(),
      valor_declarado:preco.toFixed(2),peso_total_kg:p||null
    };
    setErro('');setSalvando(true);
    try {
      // PDFs e XLSXs são montados e gravados antes de mudar o status do voucher.
      const pdf=gerarDeclaracaoConteudoPDF(info);
      const excel=await gerarDeclaracaoConteudoExcel(info);
      const paths=await enviarDocumentosDevolucao(item.id,item.voucher,pdf,excel);
      const r=await concluirDevolucaoOnline(item.id,{...info,...paths});
      setResultado({...info,...paths,gerado_em:new Date().toISOString()});
      onConcluido?.(r);
    }catch(err){setErro(err.message||'Não foi possível concluir a declaração.');}
    finally{setSalvando(false);}
  }

  return <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
      role="dialog" aria-modal="true" aria-label={'Devolução do voucher '+item.voucher}>
    <div className="max-h-[94vh] w-full max-w-[760px] overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-violet-700">Trade-In Online · Aguardando Devolução</p>
          <h2 className="mt-1 text-xl font-black text-slate-900">Coleta e-ticket e Declaração de Conteúdo</h2>
          <p className="mt-1 text-xs text-slate-500">Voucher <strong className="font-mono text-violet-800">{item.voucher}</strong> · Objeto Correios {item.codigo_rastreio}</p>
        </div>
        <button type="button" onClick={onClose} disabled={salvando} aria-label="Fechar" className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"><X size={20}/></button>
      </header>
      <div className="space-y-4 px-5 py-5">
        <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs sm:grid-cols-2">
          <div><span className="font-bold text-slate-500">Produto</span><p className="mt-1 font-semibold">{[item.modelo,item.capacidade,item.cor].filter(Boolean).join(' ')||'—'}</p></div>
          <div><span className="font-bold text-slate-500">IMEI / serial</span><p className="mt-1 font-mono font-bold">{item.imei||'—'}</p></div>
          <div><span className="font-bold text-slate-500">Remetente do modelo</span><p className="mt-1 font-semibold">{REMETENTE_DECLARACAO.nome} · {REMETENTE_DECLARACAO.cidade}/{REMETENTE_DECLARACAO.uf}</p></div>
          <div><span className="font-bold text-slate-500">Situação</span><p className="mt-1 font-semibold text-rose-800">{resultado?'Declaração gerada':'Cliente não aprovou a divergência'}</p></div>
        </div>
        {!resultado&&origemDados&&<p className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs font-semibold text-violet-950">
          {origemDados==='Voucher ainda não localizado nas importações diárias'
            ? 'Sem cadastro nas bases importadas para este voucher. Complete os campos manualmente ou importe o relatório do GRV Atendimento.'
            : 'Dados do destinatário carregados automaticamente da fonte: '+origemDados+'. Confira antes de gerar. O peso permanece para preenchimento manual.'}
        </p>}
        {erro&&<div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-900">{erro}</div>}

        {resultado ? <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center gap-2 text-sm font-black text-emerald-900"><CheckCircle2 size={20}/>Declaração gerada e devolução concluída</div>
          <p className="text-xs text-emerald-900">E-ticket <strong>{resultado.eticket}</strong> registrado. O voucher foi encaminhado à tela de <strong>Expedição B2C existente</strong>, na seção de devoluções Trade-ins Online. Os documentos podem ser baixados novamente.</p>
          <div className="flex flex-wrap gap-2">
            <Link to="/v2/assurant/b2c/expedicao" className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-black text-white">
              Abrir Expedição B2C
            </Link>
            <button type="button" disabled={Boolean(baixando)} onClick={()=>baixar('pdf')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-sm"><FileText size={16}/> Baixar PDF <Download size={13}/></button>
            <button type="button" disabled={Boolean(baixando)} onClick={()=>baixar('xlsx')} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-bold text-emerald-900 shadow-sm"><FileSpreadsheet size={16}/> Baixar Excel <Download size={13}/></button>
          </div>
        </div> : <form className="space-y-4" onSubmit={gerar}>
          <label className={titulo}><span className="inline-flex items-center gap-1.5"><ScanLine size={16} className="text-violet-700"/> E-ticket da devolução *</span>
            <input ref={inputEticket} autoFocus className={campo+' font-mono text-base font-bold uppercase'} value={eticket}
              onChange={e=>setEticket(e.target.value.toUpperCase().replace(/\s/g,''))}
              placeholder="Bipe ou digite o e-ticket" autoComplete="off" maxLength={80} disabled={salvando||carregando} required/>
          </label>
          <p className="-mt-2 text-[11px] text-slate-500">A leitora pode bipar diretamente neste campo. O e-ticket fica vinculado ao voucher e não poderá ser reutilizado.</p>
          <div className="border-t border-slate-100 pt-3">
            <h3 className="mb-3 text-sm font-black text-slate-900">Destinatário — campos da declaração</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ['nome','Nome completo *','text'],['cpf_cnpj','CPF/CNPJ (quando informado)','text'],
                ['endereco','Endereço e número *','text'],['bairro','Bairro *','text'],
                ['cidade','Cidade *','text'],['uf','UF *','text'],['cep','CEP *','text']
              ].map(([chave,rotulo,tipo])=><label key={chave} className={titulo}>{rotulo}
                <input className={campo} type={tipo} value={destinatario[chave]}
                  maxLength={chave==='uf'?2:chave==='cep'?9:160} required={['nome','endereco','bairro','cidade','uf','cep'].includes(chave)}
                  onChange={e=>mudarDestinatario(chave,chave==='uf'?e.target.value.toUpperCase():e.target.value)}
                  placeholder={chave==='cep'?'00000-000':''} disabled={salvando||carregando}/>
              </label>)}
            </div>
          </div>
          <div className="grid gap-3 border-t border-slate-100 pt-3 sm:grid-cols-3">
            <label className={titulo}>Conteúdo *
              <input className={campo} value={conteudo} maxLength={120} onChange={e=>setConteudo(e.target.value)} disabled={salvando||carregando} required/>
            </label>
            <label className={titulo}>Valor declarado (R$) *
              <input className={campo} inputMode="decimal" value={valor} onChange={e=>setValor(e.target.value)} disabled={salvando||carregando} required/>
            </label>
            <label className={titulo}>Peso total (kg) — informar manualmente
              <input className={campo} inputMode="decimal" value={peso} onChange={e=>setPeso(e.target.value)} placeholder="Ex.: 0,350" disabled={salvando||carregando}/>
            </label>
          </div>
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle size={17} className="mt-0.5 shrink-0"/> Confira destinatário e valor antes de concluir. A declaração será gerada com campos legais e espaço para assinatura física; a ação moverá o voucher para a Expedição já existente, na seção de devoluções Online.
          </div>
          <button type="submit" disabled={salvando||carregando} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-700 px-5 py-3 text-sm font-black text-white transition hover:bg-violet-800 disabled:opacity-50">
            <Package size={18}/>{salvando?'Gerando e salvando declaração...':'Gerar Declaração de Conteúdo'}
          </button>
        </form>}
        {carregando&&!resultado&&<p className="text-xs text-slate-500">Carregando dados da devolução...</p>}
      </div>
    </div>
  </div>;
}
