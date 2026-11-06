import { useCallback, useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileSpreadsheet, PackageCheck, RefreshCw, Search, Upload, Wrench, X } from 'lucide-react';
import { laboratorioIndividual, conferirVouchersLaboratorio } from '../../services/laboratorioIndividualService.js';
import { laboratorioReparo } from '../../services/laboratorioReparoService.js';
import { listarDefeitos } from '../../services/triagemFuncionalService.js';

const BOTAO = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40';
const CAMPO = 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-violet-500';
const ESTADOS = [
  ['','Todos'],
  ['recebido','Aguardando técnico'],['em_reparo','Em reparo'],
  ['concluido','Concluído'],['em_devolucao','Em devolução'],
  ['devolvido_warehouse','Devolvido ao Warehouse']
];
const rotulo = {
  recebido:'Aguardando técnico',
  em_reparo:'Em reparo',
  concluido:'Reparo concluído',
  em_devolucao:'Em devolução',
  devolvido_warehouse:'Devolvido ao Warehouse'
};
const cor = {
  recebido:'bg-sky-100 text-sky-800',
  em_reparo:'bg-violet-100 text-violet-800',
  concluido:'bg-emerald-100 text-emerald-800',
  em_devolucao:'bg-orange-100 text-orange-800',
  devolvido_warehouse:'bg-slate-100 text-slate-700'
};
const dataHora = v => v ? new Date(v).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}) : '—';
const limpo = v => String(v ?? '').trim().toUpperCase();
const regraVoucher = /^[A-Z0-9][A-Z0-9_-]{2,59}$/;

function ehColunaVoucher(x) {
  const s=String(x??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[\uFEFF\u200B-\u200D]/g,'').replace(/[^a-zA-Z0-9]+/g,' ')
    .trim().toLowerCase().replace(/\s+/g,' ');
  return /^(voucher|voucher id|voucher numero|voucher codigo|voucher de reparo|voucher do aparelho|voucher para reparo|voucher recebimento|voucher de recebimento|voucher do reparo|codigo voucher|codigo do voucher|numero voucher|numero do voucher|id voucher|n voucher)$/.test(s);
}
function normalizarVoucherLab(x) {
  // Excel pode guardar o número do voucher como célula numérica.
  const original = typeof x === 'number' && Number.isSafeInteger(x)
    ? x.toFixed(0) : String(x??'');
  const v=original.normalize('NFKC').replace(/[\uFEFF\u200B-\u200D\u00A0]/g,'')
    .trim().replace(/^['"]+|['"]+$/g,'').toUpperCase().replace(/\s+/g,'');
  if (!v) return '';
  if (/^\d{15}$/.test(v)) return '__IMEI__';
  if (/^\d+$/.test(v)) return 'YBV'+v.replace(/^0+(?=\d)/,'');
  if (/^YBV\d+$/.test(v)) return 'YBV'+v.slice(3).replace(/^0+(?=\d)/,'');
  return v;
}
async function lerPlanilha(arquivo) {
  if(!arquivo)throw new Error('Selecione uma planilha.');
  if(!/\.(xlsx|xls|csv|ods)$/i.test(arquivo.name||''))
    throw new Error('Formato inválido. Utilize XLSX, XLS, ODS ou CSV.');
  if(!arquivo.size||arquivo.size>15*1024*1024)
    throw new Error('Arquivo vazio ou maior que 15 MB. Divida em arquivos menores.');
  let livro;
  try {
    livro=XLSX.read(await arquivo.arrayBuffer(),{type:'array',raw:true,codepage:65001});
  } catch(e) {
    throw new Error('Não foi possível ler a planilha. Confira se não tem senha ou exporte como XLSX/CSV. '+String(e?.message||''));
  }
  if(!livro.SheetNames?.length)throw new Error('Nenhuma aba encontrada no arquivo.');
  let atual=null,fallback=null;
  for(const nome of livro.SheetNames) {
    const sheet=livro.Sheets[nome],ref=sheet?.['!ref'];
    if(!ref)continue;
    const faixa=XLSX.utils.decode_range(ref);
    if(faixa.e.r-faixa.s.r>25000)
      throw new Error('A aba '+nome+' tem mais de 25 mil linhas. Remova linhas vazias formatadas.');
    const linhas=XLSX.utils.sheet_to_json(sheet,{header:1,raw:true,defval:'',blankrows:true});
    if(!linhas.length)continue;
    let cabecalho=-1,coluna=-1;
    for(let n=0;n<Math.min(60,linhas.length)&&cabecalho<0;n++){
      const c=(linhas[n]||[]).findIndex(ehColunaVoucher);
      if(c>=0){cabecalho=n;coluna=c;}
    }
    if(cabecalho>=0){atual={nome,linhas,coluna,comeco:cabecalho+1};break;}
    if(!fallback&&faixa.e.c-faixa.s.c===0) {
      const primeiro=linhas.find(row=>String(row?.[0]??'').trim())?.[0];
      if (/^(imei|os|pedido|numero de os)$/i.test(String(primeiro||'').trim()))
        throw new Error('Arquivo por '+primeiro+' não é aceito. Envie somente a coluna VOUCHER.');
      if(primeiro!=null)fallback={nome,linhas,coluna:0,
        comeco:ehColunaVoucher(primeiro)?linhas.findIndex(row=>String(row?.[0]??'').trim())+1:0};
    }
  }
  atual=atual||fallback;
  if(!atual)throw new Error('Coluna VOUCHER não encontrada. Use o modelo, sem IMEI/OS como chave.');
  const {nome,linhas,coluna,comeco}=atual;
  const vistos=new Map(),invalidos=[],repetidos=[];
  let total=0,invalidosQuantidade=0,repetidosQuantidade=0;
  for(let i=comeco;i<linhas.length;i++){
    const valor=linhas[i]?.[coluna];
    if(valor==null||!String(valor).trim())continue;
    total++;
    const voucher=normalizarVoucherLab(valor);
    if(voucher==='__IMEI__'||!regraVoucher.test(voucher) ||
      /^(VOUCHER|IMEI|PEDIDO|TOTAL|NUMERO|OS)$/i.test(voucher)){
      invalidosQuantidade++;
      if(invalidos.length<15)invalidos.push('Linha '+(i+1)+': '+(
        voucher==='__IMEI__'?'15 dígitos parecem IMEI; informe o voucher':String(valor).slice(0,70)));
      continue;
    }
    if(vistos.has(voucher)){
      repetidosQuantidade++;
      if(repetidos.length<15)repetidos.push('Linha '+(i+1)+': '+voucher+' (também na linha '+vistos.get(voucher)+')');
      continue;
    }
    vistos.set(voucher,i+1);
    if(vistos.size>5000)throw new Error('Limite de 5.000 vouchers únicos por arquivo. Divida o upload.');
  }
  if(!vistos.size)throw new Error('Nenhum voucher válido encontrado na aba '+nome+'. Confira a coluna Voucher.');
  return {vouchers:[...vistos.keys()],total,
    invalidos,invalidosQuantidade,repetidos,repetidosQuantidade,
    arquivo:arquivo.name,aba:nome};
}

export default function LaboratorioIndividualV2Page() {
  const {user}=useAuth();
  const [dados,setDados]=useState({itens:[],total:0,resumo:{}});
  const [texto,setTexto]=useState('');
  const [busca,setBusca]=useState('');
  const [filtro,setFiltro]=useState('');
  const [pagina,setPagina]=useState(0);
  const [carregando,setCarregando]=useState(true);
  const [ocupado,setOcupado]=useState(false);
  const [progresso,setProgresso]=useState('');
  const [erro,setErro]=useState('');
  const [sucesso,setSucesso]=useState('');
  const [previa,setPrevia]=useState(null);
  const [voucherManual,setVoucherManual]=useState('');
  const [item,setItem]=useState(null);
  const [os,setOs]=useState('');
  const [defeitos,setDefeitos]=useState([]);
  const [novoDefeito,setNovoDefeito]=useState('');
  const [catalogo,setCatalogo]=useState([]);
  const [buscaDefeito,setBuscaDefeito]=useState('');
  const [resultado,setResultado]=useState('reparado');
  const [observacoes,setObservacoes]=useState('');
  const limite=100;

  const carregar=useCallback(async()=>{
    setCarregando(true);
    try {
      const r=await laboratorioIndividual('listar',{busca,status:filtro||null,offset:pagina*limite,limite});
      setDados(r||{itens:[],total:0,resumo:{}});
    } catch(e){setErro(e.message||'Não foi possível consultar os vouchers.');}
    finally{setCarregando(false);}
  },[busca,filtro,pagina]);

  useEffect(()=>{void carregar();},[carregar]);
  useEffect(()=>{
    let ativo=true;
    listarDefeitos().then(r=>{if(ativo) setCatalogo(r||[]);}).catch(()=>{});
    return ()=>{ativo=false;};
  },[]);

  const encontrados=useMemo(()=>{
    const texto=buscaDefeito.toLocaleLowerCase('pt-BR').trim();
    return texto ? catalogo.filter(x=>[x.nome,x.categoria].some(y=>String(y||'').toLocaleLowerCase('pt-BR').includes(texto))) : catalogo.slice(0,45);
  },[catalogo,buscaDefeito]);

  function abrir(i) {
    setItem(i);setOs(i.os_numero||i.os_referencia||'');
    setDefeitos(Array.isArray(i.defeitos_atual)?i.defeitos_atual:[]);
    setResultado(i.resultado||'reparado');setObservacoes(i.observacoes||'');
    setNovoDefeito('');setErro('');
  }

  async function realizar(i,acao,extra={}) {
    if(!i) throw new Error('Selecione o aparelho.');
    if(i.origem==='individual'){
      return laboratorioIndividual(acao,{id:i.id,...extra});
    }
    // Os 1.039 itens antigos seguem com seu ID e trilha do fluxo original,
    // porém a busca e as ações são individuais, sem seleção de lote.
    return laboratorioReparo(acao,{
      p_item_id:i.id,
      p_os:extra.os??null,
      p_defeitos:extra.defeitos??null,
      p_resultado:extra.resultado??null,
      p_observacoes:extra.observacoes??null,
    });
  }

  async function executar(i,acao,extra={},textoSucesso='Operação registrada.') {
    if(ocupado)return null;
    setOcupado(true);setErro('');setSucesso('');
    try {
      const r=await realizar(i,acao,extra);
      if(item?.id===i.id && r?.item) setItem({...r.item,origem:i.origem});
      setSucesso(textoSucesso);
      await carregar();
      return r;
    } catch(e){setErro(e.message||'Falha na operação.');return null;}
    finally{setOcupado(false);}
  }

  async function prepararArquivo(e) {
    const file=e.target.files?.[0];
    if(!file)return;
    setPrevia(null);setErro('');setSucesso('');setOcupado(true);
    try {
      const arquivo = await lerPlanilha(file);
      let conferencia = null;
      let avisoConferencia = '';
      try {
        conferencia = await conferirVouchersLaboratorio(arquivo.vouchers);
      } catch (erroConferencia) {
        avisoConferencia = erroConferencia?.message || 'Conferência indisponível';
      }
      setPrevia({ ...arquivo, conferencia, avisoConferencia });
    } catch (err) {
      setErro(err.message);
    } finally { setOcupado(false); e.target.value=''; }
  }

  async function importar(vouchers,rotuloImportacao) {
    if(ocupado||!vouchers?.length)return;
    setOcupado(true);setErro('');setSucesso('');
    let incluidos=0,existentes=0,liberados=0;
    let loteAtual=0;
    try{
      const loteTamanho=100;
      const lotes=Math.ceil(vouchers.length/loteTamanho);
      for(let i=0;i<vouchers.length;i+=loteTamanho){
        loteAtual=Math.floor(i/loteTamanho)+1;
        const parte=vouchers.slice(i,i+loteTamanho);
        setProgresso('Recebendo lote '+loteAtual+' de '+lotes+
          ' · '+Math.min(vouchers.length,i+parte.length)+' / '+vouchers.length+' vouchers');
        const r=await laboratorioIndividual('importar',{vouchers:parte});
        if(!r?.ok)throw new Error('O banco não confirmou o lote '+loteAtual+'.');
        incluidos+=Number(r.incluidos||0);
        existentes+=Number(r.ja_existentes||0);
        liberados+=Number(r.liberados_pendentes||0);
      }
      const ignorados=previa?.vouchers?.length===vouchers.length
        ? Number(previa.invalidosQuantidade||0)+Number(previa.repetidosQuantidade||0):0;
      if (incluidos===0 && liberados===0) {
        setErro('O total não aumentou: nenhum voucher novo foi cadastrado. '+
          existentes+' voucher(s) já constam no Laboratório (cadastro individual ou histórico). '+
          'Confira a relação da planilha para saber o status de cada um. '+
          'Não duplicamos o recebimento de aparelhos já existentes.');
      } else {
        setSucesso(rotuloImportacao+': '+incluidos+' NOVO(S) cadastrado(s), '+
          liberados+' pendente(s) liberado(s) para o técnico e '+
          existentes+' já cadastrado(s), sem duplicação.'+
          (ignorados?' '+ignorados+' linha(s) inválida(s)/repetida(s) ignorada(s).':'')+
          ' O total aumenta somente pelos novos cadastros.');
        setPrevia(null);setVoucherManual('');setPagina(0);setBusca('');setTexto('');setFiltro('recebido');
      }
      await carregar();
    } catch(e){
      const mensagem=String(e?.message||'Erro de importação');
      const orientacao=/timeout|canceling statement|timed out|504|gateway|tempo limite/i.test(mensagem)
        ? ' Pode ter ocorrido gravação antes do tempo limite. Reenvie a planilha: vouchers existentes não são duplicados.'
        : /permission|permissão|access|acesso|42501|403/i.test(mensagem)
        ? ' Peça liberação do Laboratório de Reparos na Gestão de Usuários.'
        : '';
      setErro('Erro no lote '+loteAtual+': '+mensagem+'. Foram incluídos '+incluidos+
        ' e liberados '+liberados+' antes da falha.'+orientacao+
        ' É seguro reenviar o arquivo para completar a importação.');
      await carregar();
    } finally{setOcupado(false);setProgresso('');}
  }

  async function confirmarOs() {
    if(!item||!os.trim()){setErro('Informe e confira a OS antes de confirmar.');return;}
    await executar(item,'validar_os',{os:os.trim()},'OS confirmada para o voucher '+item.voucher+'.');
  }

  async function salvarDefeitos() {
    if(!item)return;
    await executar(item,'salvar_defeitos',{defeitos},'Revisão dos defeitos salva.');
  }

  async function fecharReparo() {
    if(!item?.os_numero){setErro('Confirme a OS antes de concluir o reparo.');return;}
    if(!window.confirm('Concluir o reparo de '+item.voucher+' com o resultado '+resultado+'?'))return;
    setOcupado(true);setErro('');setSucesso('');
    try{
      await realizar(item,'salvar_defeitos',{defeitos});
      const r=await realizar(item,'concluir',{resultado,observacoes});
      if(r?.item)setItem({...r.item,origem:item.origem});
      setSucesso('Reparo de '+item.voucher+' concluído. Histórico preservado.');
      await carregar();
    }catch(e){setErro(e.message||'Não foi possível fechar o reparo.');}
    finally{setOcupado(false);}
  }

  const totalPaginas=Math.max(1,Math.ceil(Number(dados.total||0)/limite));
  const estados=dados.resumo||{};

  return <div className="min-h-full bg-slate-50 p-4 text-slate-800 md:p-6">
    <div className="mx-auto max-w-[1700px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Assurant Warehouse · Laboratório</p>
          <h1 className="mt-1 text-2xl font-black">Laboratório de Reparos</h1>
          <p className="mt-1 text-sm text-slate-600">Importação por voucher com recebimento confirmado automaticamente e encaminhamento direto à bancada do técnico. A OS continua sujeita à validação técnica.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={carregar} disabled={ocupado||carregando} className={BOTAO+' border-slate-300 bg-white text-slate-700'}>
            <RefreshCw size={15} className={carregando?'animate-spin':''}/> Atualizar
          </button>
          {user?.id==='b517d70a-56be-4b4f-8b9e-a03c769dd3c3'&&<Link to="/v2/assurant/laboratorio/reparos/romaneios-antigos" className={BOTAO+' border-slate-200 bg-white text-slate-600'}>
            Romaneios anteriores
          </Link>}
        </div>
      </header>
      {erro&&<div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800"><AlertTriangle size={17} className="mt-0.5 shrink-0"/>{erro}</div>}
      {sucesso&&<div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800"><CheckCircle2 size={17} className="mt-0.5 shrink-0"/>{sucesso}</div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_330px]">
        <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2"><FileSpreadsheet size={20} className="text-violet-700"/><h2 className="text-base font-black">Importar recebimento por planilha</h2></div>
          <p className="mt-2 text-xs leading-5 text-slate-600">Envie XLSX, XLS, ODS ou CSV. A coluna <b>Voucher</b> é a única utilizada; pedido, lote, IMEI e OS são ignorados. O envio confirma o recebimento e coloca o aparelho diretamente em <b>Aguardando técnico</b>. Vouchers existentes não são duplicados.</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <label className={BOTAO+' cursor-pointer border-violet-300 bg-violet-50 text-violet-800'}>
              <Upload size={16}/> Selecionar planilha
              <input type="file" className="sr-only" accept=".xlsx,.xls,.ods,.csv" disabled={ocupado} onChange={prepararArquivo}/>
            </label>
            <a download="Modelo_Recebimento_Laboratorio.csv"
              href={'data:text/csv;charset=utf-8,'+encodeURIComponent('Voucher\nYBV123456\nSAMV123456\n')}
              className="text-xs font-bold text-violet-700 underline">Baixar modelo (uma coluna)</a>
          </div>
          {previa&&<div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="break-all text-xs font-bold text-slate-900">{previa.arquivo} · aba {previa.aba}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-xs">
              <span className="font-semibold text-emerald-700">{previa.vouchers.length} vouchers válidos e distintos</span>
              <span className="text-amber-700">{previa.repetidosQuantidade} repetidos no arquivo</span>
              <span className="text-rose-700">{previa.invalidosQuantidade} inválidos no arquivo</span>
            </div>
            {!!previa.invalidos.length&&<p className="mt-2 text-[11px] text-rose-700">Inválidos ignorados: {previa.invalidos.join('; ')}</p>}
            {!!previa.repetidos.length&&<p className="mt-2 text-[11px] text-amber-800">Repetidos ignorados: {previa.repetidos.join('; ')}</p>}
            {previa.conferencia ? (
              <div className="mt-3 rounded-xl border border-violet-200 bg-white p-3 text-xs">
                <p className="font-black text-slate-800">Conferência do banco antes de importar</p>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                  <span className="font-bold text-emerald-700">{previa.conferencia.novos} novos (incrementam o total)</span>
                  <span className="font-bold text-slate-700">{previa.conferencia.ja_cadastrados} já cadastrados</span>
                  <span className="font-bold text-amber-800">{previa.conferencia.ja_no_historico} no histórico</span>
                  <span className="font-bold text-violet-700">{previa.conferencia.liberar_pendentes} para liberar</span>
                </div>
                {previa.conferencia.novos===0 && previa.conferencia.liberar_pendentes===0 && (
                  <p className="mt-2 rounded-lg bg-amber-50 p-2 font-semibold text-amber-900">
                    Essa planilha não possui cadastros novos. Reenviá-la não aumenta o total:
                    os vouchers já estão na fila ou no histórico do Laboratório.
                  </p>
                )}
                <details className="mt-2">
                  <summary className="cursor-pointer font-bold text-violet-800">
                    Ver voucher a voucher e por que incrementa (ou não)
                  </summary>
                  <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-slate-200 bg-slate-50">
                    {(previa.conferencia.itens || []).map(item => (
                      <div key={item.voucher} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0">
                        <span className="font-mono font-bold">{item.voucher}</span>
                        <span className="text-slate-600">
                          {item.situacao==='NOVO'?'Novo cadastro'
                            :item.situacao==='LIBERAR_PENDENTE'?'Liberação pendente'
                            :item.situacao==='JA_NO_HISTORICO'?'Já no histórico'
                            :'Já cadastrado'} {item.status_atual?'· '+item.status_atual:''}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ) : !!previa.avisoConferencia && (
              <p className="mt-3 rounded-lg bg-amber-50 p-2 text-xs font-semibold text-amber-900">
                Não foi possível conferir os vouchers antes da importação: {previa.avisoConferencia}.
                A importação ainda está disponível.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button"
                disabled={ocupado || (previa.conferencia &&
                  previa.conferencia.novos===0 && previa.conferencia.liberar_pendentes===0)}
                onClick={()=>importar(previa.vouchers,previa.arquivo)}
                className={BOTAO+' border-violet-700 bg-violet-700 text-white'}>
                <Upload size={16}/>
                {previa.conferencia
                  ? 'Importar '+previa.conferencia.novos+' novo(s) e liberar '+previa.conferencia.liberar_pendentes
                  : 'Receber e liberar '+previa.vouchers.length+' voucher(s)'}
              </button>
              <button type="button" disabled={ocupado} onClick={()=>setPrevia(null)} className={BOTAO+' border-slate-200 text-slate-700'}>Cancelar</button>
            </div>
          </div>}
          {progresso&&<p role="status" className="mt-3 text-xs font-bold text-violet-700">{progresso}</p>}
          <p className="mt-3 text-[11px] leading-5 text-amber-800">A importação confirma administrativamente o recebimento dos vouchers informados, registra o usuário e horário e libera a fila do técnico, sem nova conferência por voucher. A OS e os defeitos ainda são validados na bancada. Não gera pedido/romaneio nem movimenta WMS/Oracle.</p>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-black text-slate-900">Adicionar voucher individualmente</h2>
          <p className="mt-2 text-xs text-slate-500">Sem planilha e sem vínculo de lote.</p>
          <form className="mt-4 space-y-3" onSubmit={e=>{
            e.preventDefault();const v=normalizarVoucherLab(voucherManual);
            if(!regraVoucher.test(v)||v==='__IMEI__'){setErro('Informe um voucher válido.');return;}
            void importar([v],'Cadastro individual');
          }}>
            <input value={voucherManual} disabled={ocupado} onChange={e=>setVoucherManual(e.target.value)} placeholder="Bipar ou digitar voucher"
              className={CAMPO+' w-full'} aria-label="Voucher individual"/>
            <button disabled={ocupado||!regraVoucher.test(normalizarVoucherLab(voucherManual))||normalizarVoucherLab(voucherManual)==='__IMEI__'}
              className={BOTAO+' w-full border-emerald-700 bg-emerald-600 text-white'}>
              <PackageCheck size={16}/> Receber e liberar para técnico
            </button>
          </form>
        </section>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {ESTADOS.map(([chave,nome])=><button type="button" key={chave} onClick={()=>{setFiltro(chave);setPagina(0);}}
            className={'rounded-lg px-3 py-2 text-[11px] font-bold '+(filtro===chave?'bg-violet-700 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200')}>
            {nome} · {chave?Number(estados[chave]||0):Object.values(estados).reduce((a,b)=>a+Number(b||0),0)}
          </button>)}
        </div>
        <form onSubmit={e=>{e.preventDefault();setPagina(0);setBusca(texto.trim());}}
          className="mt-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-48 flex-1">
            <Search size={17} className="absolute left-3 top-3 text-slate-400"/>
            <input value={texto} onChange={e=>setTexto(e.target.value)}
              className={CAMPO+' w-full pl-9'} placeholder="Localizar voucher, IMEI, OS ou modelo em todos os aparelhos"/>
          </div>
          <button className={BOTAO+' border-violet-700 bg-violet-700 text-white'} type="submit">Buscar</button>
          {busca&&<button type="button" onClick={()=>{setBusca('');setTexto('');setPagina(0);}}
            className={BOTAO+' border-slate-200 text-slate-600'}>Limpar</button>}
        </form>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-4">
          <div>
            <h2 className="text-sm font-black">Fila única do laboratório</h2>
            <p className="mt-1 text-xs text-slate-500">{Number(dados.total||0).toLocaleString('pt-BR')} voucher(s) encontrados · sem agrupamento por pedido</p>
          </div>
          <span className="text-xs text-slate-500">Página {pagina+1} de {totalPaginas}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-xs">
            <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-600">
              <tr>
                <th className="p-3">Voucher</th><th className="p-3">IMEI / Série</th>
                <th className="p-3">Aparelho</th><th className="p-3">Status</th>
                <th className="p-3">OS</th><th className="p-3">Entrada</th><th className="p-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dados.itens||[]).map(i=><tr key={i.id} className="hover:bg-violet-50/40">
                <td className="p-3">
                  <button type="button" className="text-left font-black text-violet-700 hover:underline"
                    onClick={()=>abrir(i)}>{i.voucher}</button>
                  <p className="mt-0.5 text-[10px] text-slate-400">{i.origem==='individual'?'Cadastro individual':'Registro histórico'}</p>
                </td>
                <td className="p-3 font-mono">{i.imei||'A validar'}</td>
                <td className="p-3">{i.modelo||'A conferir'}{i.alerta_origem&&<p className="mt-1 max-w-60 text-[10px] text-amber-800">{i.alerta_origem}</p>}</td>
                <td className="p-3"><span className={'inline-flex rounded-md px-2 py-1 text-[10px] font-bold '+(cor[i.status]||'bg-slate-100')}>{rotulo[i.status]||i.status}</span></td>
                <td className="p-3">{i.os_numero||i.os_referencia||'Pendente'}{!i.os_numero&&i.os_referencia&&<p className="text-[10px] text-slate-400">Não validada</p>}</td>
                <td className="p-3 text-[11px] text-slate-500">{dataHora(i.recebido_em||i.criado_em)}</td>
                <td className="p-3">
                  <button type="button" onClick={()=>abrir(i)}
                    className={BOTAO+' border-violet-200 bg-violet-50 text-violet-700'}>
                    {i.status==='concluido'?'Ver registro':'Abrir técnico'}
                  </button>
                </td>
              </tr>)}
              {carregando&&<tr><td colSpan={7} className="p-8 text-center text-slate-500">Carregando vouchers...</td></tr>}
              {!carregando&&!(dados.itens||[]).length&&<tr><td colSpan={7} className="p-8 text-center text-slate-500">Nenhum aparelho encontrado. Você pode importar uma planilha contendo apenas os vouchers.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
          <p className="text-[11px] text-slate-500">Exibindo no máximo 100 vouchers por página.</p>
          <div className="flex gap-2">
            <button type="button" disabled={carregando||pagina===0} onClick={()=>setPagina(n=>Math.max(0,n-1))}
              className={BOTAO+' border-slate-200 bg-white text-slate-600'}><ChevronLeft size={15}/>Anterior</button>
            <button type="button" disabled={carregando||pagina+1>=totalPaginas} onClick={()=>setPagina(n=>n+1)}
              className={BOTAO+' border-slate-200 bg-white text-slate-600'}>Próxima<ChevronRight size={15}/></button>
          </div>
        </div>
      </section>

      {item&&<div role="dialog" aria-modal="true" aria-labelledby="titulo-item-lab"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3"
        onClick={e=>{if(e.target===e.currentTarget&&!ocupado)setItem(null);}}>
        <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold text-violet-700">Recebimento e validação por voucher</p>
              <h2 id="titulo-item-lab" className="mt-1 text-xl font-black">{item.voucher}</h2>
              <p className="mt-1 text-xs text-slate-500">{item.modelo||'Modelo a conferir'} · {item.imei||'IMEI/série não localizado'}</p>
              <span className={'mt-2 inline-flex rounded-md px-2 py-1 text-[10px] font-bold '+(cor[item.status]||'bg-slate-100')}>{rotulo[item.status]||item.status}</span>
            </div>
            <button disabled={ocupado} type="button" aria-label="Fechar" onClick={()=>setItem(null)}
              className={BOTAO+' border-slate-200 bg-white text-slate-700'}><X size={18}/></button>
          </div>
          {item.alerta_origem&&<div className="mt-3 flex gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800"><AlertTriangle size={16} className="shrink-0"/>{item.alerta_origem}</div>}

          {item.status==='aguardando_recebimento'&&
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              Cadastro de um fluxo antigo. Reenvie a planilha para liberação automática à bancada técnica, sem nova confirmação.
            </div>}

          {['recebido','em_reparo','concluido'].includes(item.status)&&<>
            <section className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black"><ClipboardCheck size={17} className="text-violet-700"/> Validação da OS pelo técnico</h3>
              <p className="mt-1 text-xs text-slate-500">A planilha exige somente o voucher. Se houver OS histórica, confira antes de confirmar.</p>
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">Número da OS
                  <input disabled={ocupado||item.status==='concluido'} value={os} maxLength={60} onChange={e=>setOs(e.target.value)}
                    className={CAMPO+' mt-1 block w-full'} placeholder="Digite a OS validada"/>
                </label>
                <button type="button" disabled={ocupado||item.status==='concluido'||!os.trim()||os.trim()===item.os_numero}
                  onClick={confirmarOs} className={BOTAO+' border-violet-700 bg-violet-700 text-white'}>
                  <CheckCircle2 size={16}/> Confirmar OS
                </button>
              </div>
              {item.os_numero&&<p className="mt-2 text-xs font-bold text-emerald-700">OS confirmada: {item.os_numero}</p>}
            </section>
            <section className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black"><Wrench size={17} className="text-violet-700"/> Validação técnica e defeitos</h3>
              <p className="mt-2 text-xs font-semibold text-slate-600">Defeitos históricos da triagem (imutáveis)</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(Array.isArray(item.defeitos_origem)?item.defeitos_origem:[]).map((d,k)=><span key={k} className="rounded-full bg-amber-100 px-2 py-1 text-[11px] text-amber-900">{d}</span>)}
                {!item.defeitos_origem?.length&&<span className="text-xs text-slate-400">Nenhum defeito histórico informado.</span>}
              </div>
              <p className="mt-4 text-xs font-semibold text-slate-600">Defeitos após validação</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {defeitos.map((d,k)=><button disabled={ocupado||item.status==='concluido'} key={k}
                  type="button" onClick={()=>setDefeitos(xs=>xs.filter((_,j)=>j!==k))}
                  className="flex items-center gap-1 rounded-full border border-rose-200 px-2.5 py-1 text-xs text-slate-800">{d}<X size={12}/></button>)}
                {!defeitos.length&&<span className="text-xs text-slate-400">Sem defeitos confirmados.</span>}
              </div>
              {item.status!=='concluido'&&<>
                <div className="mt-3 flex flex-wrap gap-2">
                  <input value={novoDefeito} onChange={e=>setNovoDefeito(e.target.value)}
                    maxLength={150} className={CAMPO+' min-w-36 flex-1'} placeholder="Descrever outro defeito"/>
                  <button type="button" disabled={!novoDefeito.trim()||ocupado}
                    className={BOTAO+' border-slate-300 bg-white text-violet-700'}
                    onClick={()=>{let d=novoDefeito.trim();setDefeitos(xs=>xs.includes(d)?xs:[...xs,d]);setNovoDefeito('');}}>Adicionar</button>
                </div>
                <input value={buscaDefeito} onChange={e=>setBuscaDefeito(e.target.value)}
                  className={CAMPO+' mt-3 w-full'} placeholder="Pesquisar defeitos do catálogo da triagem"/>
                <div className="mt-2 max-h-32 overflow-y-auto rounded-lg border border-slate-100 p-2">
                  {encontrados.map(d=><button type="button" key={d.id} disabled={ocupado}
                    onClick={()=>setDefeitos(xs=>xs.includes(d.nome)?xs.filter(v=>v!==d.nome):[...xs,d.nome])}
                    className={'m-1 rounded-md px-2 py-1.5 text-[11px] font-semibold '+(defeitos.includes(d.nome)?'bg-violet-700 text-white':'bg-slate-100 text-slate-700')}>
                    {d.nome}
                  </button>)}
                  {!encontrados.length&&<p className="p-2 text-xs text-slate-400">Nenhum defeito encontrado.</p>}
                </div>
                <button type="button" disabled={ocupado} onClick={salvarDefeitos}
                  className={BOTAO+' mt-3 border-violet-200 text-violet-700'}>Salvar revisão dos defeitos</button>
              </>}
            </section>
            <section className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-black">Conclusão do reparo</h3>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">Resultado
                  <select value={resultado} disabled={ocupado||item.status==='concluido'} onChange={e=>setResultado(e.target.value)} className={CAMPO+' mt-1 block w-full'}>
                    <option value="reparado">Reparado</option><option value="sem_reparo">Sem reparo</option><option value="irrecuperavel">Irrecuperável</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">Observações técnicas
                  <textarea value={observacoes} rows={2} disabled={ocupado||item.status==='concluido'}
                    onChange={e=>setObservacoes(e.target.value)} className={CAMPO+' mt-1 block w-full'} placeholder="Procedimentos e testes realizados"/>
                </label>
              </div>
              {item.status!=='concluido'
                ? <button type="button" onClick={fecharReparo} disabled={ocupado||!item.os_numero}
                    className={BOTAO+' mt-3 border-emerald-700 bg-emerald-600 text-white'}>
                    <CheckCircle2 size={16}/> Concluir reparo
                  </button>
                : <p className="mt-3 text-xs font-bold text-emerald-700">Reparo concluído em {dataHora(item.concluido_em)}. Consulte o histórico de saída no Warehouse.</p>}
            </section>
          </>}

          {item.origem==='individual'&&<p className="mt-4 text-[11px] text-amber-800">Voucher importado individualmente: o reparo é registrado sem pedido ou romaneio artificial. A devolução física ao Warehouse deve ser conciliada antes de qualquer baixa, entrada Oracle ou movimentação de estoque.</p>}
          {item.origem==='historico'&&<p className="mt-4 text-[11px] text-slate-500">Voucher já existente no histórico do laboratório. O vínculo de origem foi preservado exclusivamente para rastreabilidade e devolução anterior.</p>}
          <div className="mt-4 flex justify-end"><button disabled={ocupado} type="button" className={BOTAO+' border-slate-300'} onClick={()=>setItem(null)}>Fechar</button></div>
        </div>
      </div>}
    </div>
  </div>;
}
