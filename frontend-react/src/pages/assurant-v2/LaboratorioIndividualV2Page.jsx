import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { Link } from 'react-router-dom';
import { useAuth } from '../../AuthContext.jsx';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, FileSpreadsheet, PackageCheck, RefreshCw, Search, Upload, Wrench, X, Truck, Printer, Download, ScanLine, Trash2 } from 'lucide-react';
import { laboratorioIndividual, conferirVouchersLaboratorio, confirmarRecebimentoLaboratorio, receberVoucherOsGaia, resolverVouchersMinuta, corrigirLaudoEtapaAdmin } from '../../services/laboratorioIndividualService.js';
import { lerVoucherOsGaia, lerVouchersMinuta } from '../../services/laboratorioPlanilhasGaia.js';
import { laboratorioReparo } from '../../services/laboratorioReparoService.js';
import { listarDefeitos } from '../../services/triagemFuncionalService.js';
import { DEFEITOS_SCRAP, validarConclusaoLaboratorio, selecionarDefeitoScrap } from '../../services/laboratorioConclusaoValidacao.js';
import { gerarMinutaLaboratorio, listarMinutasLaboratorio, detalharMinutaLaboratorio, imprimirMinutaLaboratorio } from '../../services/laboratorioDevolucaoService.js';
import MalotesReparoLaboratorio from '../../components/assurant/MalotesReparoLaboratorio.jsx';
import { CLASSIFICACOES_LAB, classificacaoLaboratorio, validarClassificacaoUnica } from '../../services/laboratorioClassificacao.js';

const BOTAO = 'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold transition disabled:cursor-not-allowed disabled:opacity-40';
const CAMPO = 'rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none focus:border-violet-500';
const ESTADOS = [
  ['','Todos'],['aguardando_recebimento','Aguardando recebimento'],
  ['recebido','Aguardando técnico'],
  ['concluido','Concluído'],['em_devolucao','Aguardando Recebimento Warehouse'],
  ['devolvido_warehouse','Recebido pelo Warehouse']
];
const rotulo = {
  aguardando_recebimento:'Aguardando recebimento',
  recebido:'Aguardando técnico',
  em_reparo:'Aguardando técnico',
  concluido:'Reparo concluído',
  em_devolucao:'Aguardando Recebimento Warehouse',
  devolvido_warehouse:'Recebido pelo Warehouse',
  divergencia_voucher:'Pendente de regularização'
};
const cor = {
  aguardando_recebimento:'bg-amber-100 text-amber-800',
  recebido:'bg-sky-100 text-sky-800',
  em_reparo:'bg-violet-100 text-violet-800',
  concluido:'bg-emerald-100 text-emerald-800',
  em_devolucao:'bg-orange-100 text-orange-800',
  devolvido_warehouse:'bg-slate-100 text-slate-700',
  divergencia_voucher:'bg-rose-100 text-rose-800'
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
  const {user,profile}=useAuth();
  const admin=Boolean(profile?.is_master);
  const [dados,setDados]=useState({itens:[],total:0,resumo:{}});
  const [texto,setTexto]=useState('');
  const [busca,setBusca]=useState('');
  const [filtro,setFiltro]=useState('');
  const [resultadoFiltro,setResultadoFiltro]=useState('');
  const [recusasGaia,setRecusasGaia]=useState([]);
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
  const [selecionados,setSelecionados]=useState([]);
  const [minutas,setMinutas]=useState([]);
  const [arquivoGaia,setArquivoGaia]=useState(null);
  const [arquivoMinuta,setArquivoMinuta]=useState(null);
  const [modalMinuta,setModalMinuta]=useState(false);
  const [tipoMinuta,setTipoMinuta]=useState('');
  const [codigoMinuta,setCodigoMinuta]=useState('');
  const [erroMinuta,setErroMinuta]=useState('');
  const [ultimoScan,setUltimoScan]=useState('');
  const scanMinutaRef=useRef(null);
  const [etapaAdmin,setEtapaAdmin]=useState('');
  const [motivoAdmin,setMotivoAdmin]=useState('');
  const limite=100;

  const carregar=useCallback(async()=>{
    setCarregando(true);
    try {
      const r=await laboratorioIndividual('listar',{busca,status:filtro||null,resultado:resultadoFiltro||null,offset:pagina*limite,limite});
      setDados(r||{itens:[],total:0,resumo:{}});
    } catch(e){setErro(e.message||'Não foi possível consultar os vouchers.');}
    finally{setCarregando(false);}
  },[busca,filtro,resultadoFiltro,pagina]);

  const carregarMinutas=useCallback(async()=>{
    try{
      const retorno=await listarMinutasLaboratorio();
      setMinutas(retorno.romaneios||[]);
    }catch(e){
      setErro(e.message||'Não foi possível listar as minutas.');
    }
  },[]);

  useEffect(()=>{void carregar();},[carregar]);
  useEffect(()=>{void carregarMinutas();},[carregarMinutas]);
  useEffect(()=>{
    if(modalMinuta&&tipoMinuta)scanMinutaRef.current?.focus();
  },[modalMinuta,tipoMinuta]);
  useEffect(()=>{
    let ativo=true;
    listarDefeitos(true).then(r=>{if(ativo) setCatalogo(r||[]);}).catch(()=>{});
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
    setNovoDefeito('');setErro('');setEtapaAdmin(i.status==='em_reparo'?'recebido':(i.status||''));setMotivoAdmin('');
  }

  async function abrirVoucherJaCadastrado(voucher) {
    if(ocupado) return;
    setOcupado(true);setErro('');
    try {
      const r = await laboratorioIndividual('listar',{
        busca:voucher,status:null,offset:0,limite:50
      });
      const exato=(r?.itens||[]).find(x=>String(x.voucher||'').toUpperCase()===voucher.toUpperCase());
      if(!exato) throw new Error('Voucher já registrado, mas não localizado na página. Consulte-o na busca geral.');
      setFiltro('');setPagina(0);setBusca(voucher);setTexto(voucher);
      abrir(exato);
    } catch(e) {setErro(e.message||'Falha ao consultar voucher existente.');}
    finally {setOcupado(false);}
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

  async function prepararArquivoGaia(e) {
    const arquivo=e.target.files?.[0]; e.target.value='';
    if(!arquivo||ocupado)return;
    setOcupado(true);setErro('');setSucesso('');setArquivoGaia(null);setRecusasGaia([]);
    try{
      const previa=await lerVoucherOsGaia(arquivo);
      setArquivoGaia(previa);
      setSucesso('Arquivo lido: '+previa.pares.length+' pares válidos em formato; '+previa.erros.length+' linhas com erro de preenchimento. Apenas itens em Aguardando recebimento serão confirmados.');
    }catch(err){setErro(err.message||'Falha na leitura de Voucher + OS GAIA.');}
    finally{setOcupado(false);}
  }

  async function confirmarArquivoGaia() {
    if(ocupado||!arquivoGaia?.pares.length)return;
    if(!window.confirm('Conferir '+arquivoGaia.pares.length+' pares de OS GAIA? Apenas aparelhos em Aguardando recebimento serão aceitos, os demais recusados.'))return;
    setOcupado(true);setErro('');setSucesso('');
    try{
      const r=await receberVoucherOsGaia(arquivoGaia.pares);
      const todasRecusas=[...(arquivoGaia.erros||[]).map(motivo=>({motivo})),...(r.recusados||[])];
      setRecusasGaia(todasRecusas);
      setSucesso(r.confirmados+' recebimento(s) com OS confirmado(s); '+todasRecusas.length+' linha(s) recusada(s), sem entrar no Laboratório.');
      setArquivoGaia(null);setFiltro('recebido');setPagina(0);setBusca('');setTexto('');
      await carregar();
    }catch(err){setErro(err.message||'Falha no recebimento via GAIA.');}
    finally{setOcupado(false);}
  }

  async function prepararArquivoMinuta(e){
    const arquivo=e.target.files?.[0];e.target.value='';
    if(!arquivo||ocupado||!tipoMinuta)return;
    setOcupado(true);setErroMinuta('');setUltimoScan('');
    try{
      const previa=await lerVouchersMinuta(arquivo);
      const conferencia=await resolverVouchersMinuta(previa.identificadores);
      if(conferencia.falhas.length)
        throw new Error(conferencia.falhas.slice(0,6).map(x=>(x.identificador||x.voucher)+': '+x.motivo).join('; ')+
          '. Nenhum aparelho desta planilha foi adicionado.');
      validarClassificacaoUnica(conferencia.itens,tipoMinuta);
      const existentes=new Set(selecionados.map(chaveItem));
      const novos=conferencia.itens.filter(i=>!existentes.has(chaveItem(i)));
      setSelecionados(atuais=>[...atuais,...novos]);
      setArquivoMinuta({arquivo:previa.arquivo,adicionados:novos.length});
      setUltimoScan(novos.length+' aparelho(s) adicionado(s) pela planilha.');
    }catch(err){setErroMinuta(err.message||'Falha na planilha de minuta.');}
    finally{setOcupado(false);scanMinutaRef.current?.focus();}
  }

  async function salvarCorrecaoAdmin() {
    if(!admin||!item||ocupado)return;
    if(motivoAdmin.trim().length<10){setErro('Informe pelo menos 10 caracteres no motivo da correção administrativa.');return;}
    if(etapaAdmin==='concluido'){
      const erroValidacao=validarConclusaoLaboratorio(resultado,defeitos);
      if(erroValidacao){setErro(erroValidacao);return;}
    }
    if(!window.confirm('Registrar correção auditada do laudo técnico e da etapa para '+item.voucher+'?'))return;
    setOcupado(true);setErro('');setSucesso('');
    try {
      const r=await corrigirLaudoEtapaAdmin({
        origem:item.origem,id:item.id,status:etapaAdmin,resultado,
        defeitos,observacoes,motivo:motivoAdmin.trim()
      });
      setItem({...r.item,origem:item.origem});
      setSucesso('Correção administrativa registrada para '+item.voucher+'. Histórico anterior preservado.');
      setMotivoAdmin('');
      await carregar();
    }catch(err){setErro(err.message||'Correção administrativa não autorizada.');}
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
      const dadosArquivo = { ...arquivo, conferencia, avisoConferencia };
      setPrevia(dadosArquivo);
      // A escolha do arquivo não confirma recebimento nem cria registros.
      if (conferencia) {
        const invalidos=Number(conferencia.nao_encontrados||0);
        if(invalidos) setErro(invalidos+' voucher(s) sem histórico de recebimento/triagem ou sem envio do Warehouse. Importação bloqueada.');
        else setSucesso('Planilha conferida. Importe para Aguardando recebimento e confirme a chegada física em uma etapa separada.');
      } else {
        setErro('Não foi possível validar a planilha. Nenhum voucher foi cadastrado. '+avisoConferencia);
      }
    } catch (err) {
      setErro(err.message);
    } finally { setOcupado(false); e.target.value=''; }
  }

  async function importar(vouchers,rotuloImportacao) {
    if(!vouchers?.length || ocupado || (previa?.conferencia &&
      vouchers.length===previa.vouchers.length &&
      vouchers.every((v,i)=>v===previa.vouchers[i]) &&
      Number(previa.conferencia.nao_encontrados||0)>0))return;
    setOcupado(true);setErro('');setSucesso('');
    let incluidos=0,existentes=0,liberados=0;
    let loteAtual=0;
    try{
      const loteTamanho=100;
      const lotes=Math.ceil(vouchers.length/loteTamanho);
      for(let i=0;i<vouchers.length;i+=loteTamanho){
        loteAtual=Math.floor(i/loteTamanho)+1;
        const parte=vouchers.slice(i,i+loteTamanho);
        setProgresso('Importando lote '+loteAtual+' de '+lotes+
          ' · '+Math.min(vouchers.length,i+parte.length)+' / '+vouchers.length+' vouchers');
        const r=await laboratorioIndividual('importar',{vouchers:parte});
        if(!r?.ok)throw new Error('O banco não confirmou o lote '+loteAtual+'.');
        incluidos+=Number(r.incluidos||0);
        existentes+=Number(r.ja_existentes||0);
        liberados+=Number(r.liberados_pendentes||0);
      }
      const contexto=previa;
      const ignorados=contexto?.vouchers?.length===vouchers.length
        ? Number(contexto.invalidosQuantidade||0)+Number(contexto.repetidosQuantidade||0):0;
      if (incluidos===0 && liberados===0) {
        setSucesso('Planilha conferida: nenhum voucher novo foi cadastrado. '+
          existentes+' voucher(s) já constam no Laboratório (cadastro individual ou histórico). '+
          'Confira a relação da planilha para saber o status de cada um. '+
          'Não duplicamos o recebimento de aparelhos já existentes.');
      } else {
        setSucesso(rotuloImportacao+': '+incluidos+' novo(s) em Aguardando recebimento e '+
          existentes+' já cadastrado(s), sem duplicação.'+
          (ignorados?' '+ignorados+' linha(s) inválida(s)/repetida(s) ignorada(s).':'')+
          ' O total aumenta somente pelos novos cadastros.');
        setPrevia(null);setVoucherManual('');setPagina(0);setBusca('');setTexto('');setFiltro('aguardando_recebimento');
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

  async function confirmarFisicamente(vouchers) {
    if(ocupado||!vouchers?.length)return;
    if(!window.confirm('Confirma o recebimento físico de '+vouchers.length+' aparelho(s)? Os vouchers serão liberados ao técnico.'))return;
    setOcupado(true);setErro('');setSucesso('');
    try{
      const count=await confirmarRecebimentoLaboratorio(vouchers);
      setSucesso(count+' voucher(s) recebidos fisicamente e liberados ao técnico.');
      setPrevia(null);setFiltro('recebido');setPagina(0);await carregar();
    }catch(e){setErro(e.message||'Erro na confirmação de recebimento.');}
    finally{setOcupado(false);}
  }

  async function exportarBase() {
    if(ocupado)return;
    setOcupado(true);setErro('');
    try{
      const result=await laboratorioIndividual('exportar');
      const colunas=[
        'Voucher',
        'IMEI',
        'Status',
        'Número da OS',
        'Defeitos históricos da triagem (imutáveis)',
        'Defeitos após validação',
        'Resultado',
        'Observações técnicas'
      ];
      const listaDefeitos=valor=>Array.isArray(valor)
        ? valor.map(defeito=>String(defeito??'').trim()).filter(Boolean).join('; ')
        : '';
      const resultados={
        reparado:'Reparado',
        sem_reparo:'Não Reparado Desbloqueado',
        irrecuperavel:'Scrap - Não Liga / Bloqueado'
      };
      const linhas=(result?.itens||[]).map(i=>({
        Voucher:i.voucher||'',
        IMEI:i.imei||'',
        Status:rotulo[i.status]||i.status||'',
        'Número da OS':i.os_numero||'',
        'Defeitos históricos da triagem (imutáveis)':listaDefeitos(i.defeitos_origem),
        'Defeitos após validação':listaDefeitos(i.defeitos_atual),
        Resultado:resultados[i.resultado]||i.resultado||'',
        'Observações técnicas':i.observacoes||''
      }));
      const folha=XLSX.utils.json_to_sheet(linhas,{header:colunas});
      if(!linhas.length)XLSX.utils.sheet_add_aoa(folha,[colunas],{origin:'A1'});
      folha['!cols']=[{wch:24},{wch:24},{wch:32},{wch:24},{wch:66},{wch:60},{wch:34},{wch:80}];
      folha['!autofilter']={ref:folha['!ref']};
      const livro=XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro,folha,'Laboratorio');
      XLSX.writeFile(livro,'Base_Laboratorio_'+new Date().toISOString().slice(0,10)+'.xlsx');
      setSucesso('Exportação realizada: '+linhas.length+' registros.');
    }catch(e){setErro(e.message||'Não foi possível exportar a base.');}
    finally{setOcupado(false);}
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
    const erroValidacao=validarConclusaoLaboratorio(resultado,defeitos);
    if(erroValidacao){setErro(erroValidacao);return;}
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

  const chaveItem=i=>i.origem+':'+i.id;

  function abrirModalMinuta(){
    setModalMinuta(true);
    setTipoMinuta('');
    setCodigoMinuta('');
    setSelecionados([]);
    setErroMinuta('');
    setUltimoScan('');
    setArquivoMinuta(null);
  }

  function fecharModalMinuta(){
    if(ocupado)return;
    setModalMinuta(false);
    setTipoMinuta('');
    setCodigoMinuta('');
    setSelecionados([]);
    setErroMinuta('');
    setUltimoScan('');
    setArquivoMinuta(null);
  }

  function escolherTipoMinuta(tipo){
    if(tipo&&!classificacaoLaboratorio(tipo))return;
    if(selecionados.length&&!window.confirm('Mudar a classificação irá limpar os IMEIs bipados. Continuar?'))return;
    setTipoMinuta(tipo);
    setSelecionados([]);
    setCodigoMinuta('');
    setErroMinuta('');
    setUltimoScan('');
    setArquivoMinuta(null);
  }

  async function biparImeiMinuta(e){
    e.preventDefault();
    if(ocupado||!tipoMinuta)return;
    const imei=codigoMinuta.trim();
    if(!/^\d{15}$/.test(imei)){
      setErroMinuta('Bipe um IMEI válido de 15 dígitos.');
      setCodigoMinuta('');
      scanMinutaRef.current?.focus();
      return;
    }
    if(selecionados.some(i=>i.imei===imei)){
      setErroMinuta('O IMEI '+imei+' já foi bipado nesta minuta.');
      setCodigoMinuta('');
      scanMinutaRef.current?.focus();
      return;
    }
    setOcupado(true);
    setErroMinuta('');
    try{
      const r=await resolverVouchersMinuta([imei]);
      const itemResolvido=r.itens?.[0];
      if(r.falhas?.length||!itemResolvido)
        throw new Error(r.falhas?.[0]?.motivo||'IMEI não localizado em Concluídos.');
      if(itemResolvido.resultado!==tipoMinuta)
        throw new Error('IMEI '+imei+' classificado como '+(classificacaoLaboratorio(itemResolvido.resultado)?.rotulo||'sem resultado')+
          '. Esta minuta aceita somente '+classificacaoLaboratorio(tipoMinuta).rotulo+'.');
      if(selecionados.some(i=>chaveItem(i)===chaveItem(itemResolvido)))
        throw new Error('Este aparelho já consta nesta minuta.');
      setSelecionados(atuais=>[...atuais,itemResolvido]);
      setUltimoScan('Adicionado: '+itemResolvido.voucher+' · '+imei);
      setCodigoMinuta('');
    }catch(err){
      setErroMinuta(err.message||'Falha na bipagem do IMEI.');
      setCodigoMinuta('');
    }finally{setOcupado(false);scanMinutaRef.current?.focus();}
  }

  async function emitirMinuta(){
    if(ocupado||!tipoMinuta)return;
    try {validarClassificacaoUnica(selecionados,tipoMinuta);}
    catch(e){setErroMinuta(e.message);return;}
    if(!window.confirm('Emitir minuta de '+classificacaoLaboratorio(tipoMinuta).rotulo+
      ' com '+selecionados.length+' aparelho(s) bipado(s)?'))return;
    setOcupado(true);setErroMinuta('');setErro('');setSucesso('');
    try{
      // Revalidar todos os aparelhos imediatamente antes da emissão.
      const revisao=await resolverVouchersMinuta(selecionados.map(i=>i.imei||i.voucher));
      if(revisao.falhas?.length||revisao.itens?.length!==selecionados.length)
        throw new Error('Um ou mais aparelhos mudaram de etapa ou já estão em outra minuta. Refaça a conferência.');
      validarClassificacaoUnica(revisao.itens,tipoMinuta);
      const anterior=new Set(selecionados.map(chaveItem));
      if(revisao.itens.some(i=>!anterior.has(chaveItem(i))))
        throw new Error('Houve divergência entre os IMEIs bipados e a conferência. Revise a lista.');
      const retorno=await gerarMinutaLaboratorio(revisao.itens.map(i=>({id:i.id,origem:i.origem})),false);
      setModalMinuta(false);setSelecionados([]);setTipoMinuta('');setCodigoMinuta('');
      setArquivoMinuta(null);setErroMinuta('');setUltimoScan('');
      setSucesso('Minuta LAB-DEV-'+String(retorno.numero).padStart(6,'0')+
        ' emitida com '+retorno.total+' aparelho(s) '+classificacaoLaboratorio(tipoMinuta).rotulo+
        '. Use Imprimir minuta abaixo para o documento físico.');
      await carregar();await carregarMinutas();
    }catch(e){setErroMinuta(e.message||'Falha ao gerar a minuta. Nenhum aparelho novo foi selecionado.');}
    finally{setOcupado(false);}
  }
  async function imprimirMinuta(id) {
    const janela=window.open('','_blank','width=1100,height=800');
    if(!janela){setErro('Libere janelas pop-up para imprimir a minuta.');return;}
    try{
      const dados=await detalharMinutaLaboratorio(id);
      imprimirMinutaLaboratorio(dados,janela);
    }catch(e){janela.close();setErro(e.message||'Não foi possível imprimir a minuta.');}
  }

  const totalPaginas=Math.max(1,Math.ceil(Number(dados.total||0)/limite));
  const estados=dados.resumo||{};

  return <div className="min-h-full bg-slate-50 p-4 text-slate-800 md:p-6">
    <div className="mx-auto max-w-[1700px] space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-violet-700">Assurant Warehouse · Laboratório</p>
          <h1 className="mt-1 text-2xl font-black">Laboratório de Reparos</h1>
          <p className="mt-1 text-sm text-slate-600">A entrada é gerada automaticamente pelo picking do Warehouse. Confira o malote e vincule a OS GAIA antes de liberar ao técnico.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={exportarBase} disabled={ocupado} className={BOTAO+' border-emerald-700 bg-white text-emerald-800'}><Download size={15}/> Exportar base (XLSX)</button>
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

      <MalotesReparoLaboratorio onRecebimentoAtualizado={carregar}/>

      <section className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black text-slate-900">Vinculação GAIA — importar OS do malote conferido</h2>
            <p className="mt-1 text-xs text-slate-500">Após conferir 100% do malote acima, baixe a minuta, abra as OS no GAIA e importe o mesmo arquivo com <b>Voucher</b> e <b>OS GAIA</b> preenchidos.</p>
          </div>
          <label className={BOTAO+' cursor-pointer border-violet-300 bg-violet-50 text-violet-800'}>
            <Upload size={16}/> Importar Voucher + OS GAIA
            <input type="file" className="sr-only" accept=".xlsx,.xls,.ods,.csv" disabled={ocupado} onChange={prepararArquivoGaia}/>
          </label>
        </div>
        {arquivoGaia&&<div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 p-4">
          <div><p className="text-sm font-bold text-slate-800">{arquivoGaia.arquivo}</p>
            <p className="mt-1 text-xs text-slate-500">{arquivoGaia.pares.length.toLocaleString('pt-BR')} pares de OS · {arquivoGaia.erros.length} linhas inválidas · aba {arquivoGaia.aba}</p></div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} onClick={()=>setArquivoGaia(null)} className={BOTAO+' border-slate-200 bg-white'}>Cancelar</button>
            <button type="button" disabled={ocupado} onClick={()=>void confirmarArquivoGaia()}
              className={BOTAO+' border-emerald-700 bg-emerald-600 text-white'}>
              <PackageCheck size={16}/> Confirmar recebimento da planilha
            </button>
          </div>
        </div>}
        {!!recusasGaia.length&&<div role="alert" className="mt-3 max-h-36 overflow-auto rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
          <p className="mb-1 font-bold">{recusasGaia.length} linha(s) recusada(s) na vinculação:</p>
          {recusasGaia.map((e,i)=><p key={i}>{e.voucher||e.imei||e.identificador||'Linha'} — {e.motivo}</p>)}
        </div>}
        <p className="mt-3 text-[11px] text-slate-500">A abertura das OS ocorre no GAIA. A importação apenas confirma a OS de aparelhos já conferidos no malote; não movimenta WMS nem Oracle.</p>
      </section>

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

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-3">
          <span className="text-xs font-bold text-slate-600">Filtrar fila por resultado:</span>
          <button type="button" className={BOTAO+' '+(!resultadoFiltro?'border-violet-700 bg-violet-700 text-white':'border-slate-200 bg-white')}
            onClick={()=>{setResultadoFiltro('');setPagina(0);}}>Todos</button>
          {CLASSIFICACOES_LAB.map(op=><button key={op.valor} type="button"
            aria-pressed={resultadoFiltro===op.valor}
            className={BOTAO+' border '+op.classe+(resultadoFiltro===op.valor?' ring-2 ring-violet-500':'')}
            onClick={()=>{setResultadoFiltro(op.valor);setPagina(0);}}>{op.rotulo}</button>)}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-black text-slate-900"><Truck size={17} className="text-violet-700"/> Devolução ao Warehouse</h2>
            <p className="mt-1 text-xs text-slate-500"><b>{Number(estados.concluido||0).toLocaleString('pt-BR')}</b> aparelhos concluídos. Gere a minuta escolhendo primeiro o resultado e depois bipando os IMEIs.</p>
          </div>
          <button type="button" onClick={abrirModalMinuta} disabled={ocupado}
            className={BOTAO+' border-violet-700 bg-violet-700 px-5 py-3 text-white hover:bg-violet-800'}>
            <Truck size={16}/> Gerar minuta
          </button>
        </div>
        {!!minutas.length&&<div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-bold text-slate-600">Minutas emitidas · imprimir ou salvar como PDF</p>
          <div className="flex flex-wrap gap-2">
            {minutas.slice(0,8).map(m=><button type="button" key={m.id} disabled={ocupado}
              onClick={()=>void imprimirMinuta(m.id)}
              className={BOTAO+' border-slate-200 bg-slate-50 text-slate-700 hover:bg-violet-50'}>
              <Printer size={14}/> LAB-DEV-{String(m.numero).padStart(6,'0')} · {m.total} aparelhos
            </button>)}
          </div>
        </div>}
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
                <th className="p-3">Aparelho</th><th className="p-3">Status</th><th className="p-3">Resultado final</th>
                <th className="p-3">OS</th><th className="p-3">Entrada</th><th className="p-3">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(dados.itens||[]).map(i=><tr key={i.origem+':'+i.id}
                className={['concluido','em_devolucao','devolvido_warehouse'].includes(i.status)
                  ? (classificacaoLaboratorio(i.resultado)?.linha||'hover:bg-violet-50/40')
                  : 'hover:bg-violet-50/40'}>
                <td className="p-3">
                  <button type="button" className="text-left font-black text-violet-700 hover:underline"
                    onClick={()=>abrir(i)}>{i.voucher}</button>
                  <p className="mt-0.5 text-[10px] text-slate-400">{i.origem==='individual'?'Cadastro individual':'Registro histórico'}</p>
                </td>
                <td className="p-3 font-mono">{i.imei||'A validar'}</td>
                <td className="p-3">{i.modelo||'A conferir'}{i.alerta_origem&&<p className="mt-1 max-w-60 text-[10px] text-amber-800">{i.alerta_origem}</p>}</td>
                <td className="p-3"><span className={'inline-flex rounded-md px-2 py-1 text-[10px] font-bold '+(cor[i.status]||'bg-slate-100')}>{rotulo[i.status]||i.status}</span></td>
                <td className="p-3">{classificacaoLaboratorio(i.resultado)
                  ? <span className={'inline-flex rounded-md border px-2 py-1 text-[10px] font-black '+classificacaoLaboratorio(i.resultado).classe}>{classificacaoLaboratorio(i.resultado).rotulo}</span>
                  : <span className="text-slate-400">—</span>}</td>
                <td className="p-3">{i.os_numero||i.os_referencia||'Pendente'}{!i.os_numero&&i.os_referencia&&<p className="text-[10px] text-slate-400">Não validada</p>}</td>
                <td className="p-3 text-[11px] text-slate-500">{dataHora(i.recebido_em||i.criado_em)}</td>
                <td className="p-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={()=>abrir(i)}
                      className={BOTAO+' border-violet-200 bg-violet-50 text-violet-700'}>
                      {i.status==='concluido'?'Ver registro':i.status==='aguardando_recebimento'?'Confirmar recebimento':'Abrir técnico'}
                    </button>
                  </div>
                </td>
              </tr>)}
              {carregando&&<tr><td colSpan={8} className="p-8 text-center text-slate-500">Carregando vouchers...</td></tr>}
              {!carregando&&!(dados.itens||[]).length&&<tr><td colSpan={8} className="p-8 text-center text-slate-500">Nenhum aparelho encontrado. Confira seus filtros.</td></tr>}
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

      {modalMinuta&&<div role="dialog" aria-modal="true" aria-labelledby="titulo-gerar-minuta"
        className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-3">
        <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Laboratório · Devolução ao Warehouse</p>
              <h2 id="titulo-gerar-minuta" className="mt-1 text-xl font-black text-slate-900">Gerar minuta de devolução</h2>
              <p className="mt-1 text-xs text-slate-500">{tipoMinuta?'Bipe os IMEIs para formar a minuta.':'Selecione primeiro o resultado final dos aparelhos.'}</p>
            </div>
            <button type="button" aria-label="Fechar janela de minuta" disabled={ocupado}
              onClick={fecharModalMinuta} className={BOTAO+' border-slate-200 bg-white text-slate-700'}>
              <X size={17}/>
            </button>
          </div>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
            {!tipoMinuta?<>
              <p className="text-sm font-semibold text-slate-700">Qual tipo de minuta deseja gerar?</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {CLASSIFICACOES_LAB.map(op=><button type="button" key={op.valor}
                  onClick={()=>escolherTipoMinuta(op.valor)} className={'rounded-xl border-2 p-5 text-center text-base font-black transition hover:shadow-md '+op.classe}>
                  {op.rotulo}
                </button>)}
              </div>
            </>:<>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-bold text-slate-600">Tipo:</span>
                  <span className={'rounded-md border px-3 py-1.5 text-xs font-black '+classificacaoLaboratorio(tipoMinuta).classe}>
                    {classificacaoLaboratorio(tipoMinuta).rotulo}
                  </span>
                </div>
                <button type="button" disabled={ocupado} onClick={()=>escolherTipoMinuta('')}
                  className={BOTAO+' border-slate-200 bg-white text-slate-600'}>Alterar tipo</button>
              </div>
              <form onSubmit={biparImeiMinuta} className="flex flex-wrap gap-2">
                <input ref={scanMinutaRef} autoFocus inputMode="numeric" autoComplete="off"
                  aria-label="Bipar IMEI para a minuta" placeholder="Bipar IMEI de 15 dígitos"
                  value={codigoMinuta} onChange={e=>setCodigoMinuta(e.target.value)}
                  disabled={ocupado} className={CAMPO+' min-w-52 flex-1 font-mono text-base'}/>
                <button type="submit" disabled={ocupado||!codigoMinuta.trim()}
                  className={BOTAO+' border-violet-700 bg-violet-700 px-5 text-white'}>
                  <ScanLine size={16}/> Adicionar IMEI
                </button>
              </form>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-600">
                  Ou adicione pela planilha de Voucher/IMEI:
                </p>
                <label className={BOTAO+' cursor-pointer border-slate-200 bg-white text-slate-700'}>
                  <Upload size={15}/> Importar planilha
                  <input type="file" accept=".xlsx,.xls,.ods,.csv" disabled={ocupado}
                    onChange={prepararArquivoMinuta} className="sr-only"/>
                </label>
              </div>
              {arquivoMinuta&&<p className="text-[11px] text-slate-500">
                {arquivoMinuta.arquivo} · {arquivoMinuta.adicionados} adicionado(s)
              </p>}
              {erroMinuta&&<p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
                {erroMinuta}
              </p>}
              {ultimoScan&&<p role="status" className="rounded-lg bg-emerald-50 p-3 text-xs font-semibold text-emerald-800">{ultimoScan}</p>}
              <div className="overflow-hidden rounded-xl border border-slate-200">
                <div className="flex items-center justify-between bg-slate-50 px-4 py-3">
                  <p className="text-sm font-black text-slate-800">Aparelhos bipados</p>
                  <span className="text-sm font-black text-violet-700">{selecionados.length}</span>
                </div>
                <div className="max-h-64 overflow-y-auto">
                  {selecionados.length?<table className="w-full text-left text-xs">
                    <thead className="sticky top-0 bg-white text-slate-500"><tr>
                      <th className="p-3">Voucher</th><th className="p-3">IMEI</th><th className="p-3">Resultado</th><th className="p-3 text-right">Ação</th>
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">{selecionados.map(i=><tr key={chaveItem(i)}>
                      <td className="p-3 font-bold">{i.voucher||'—'}</td>
                      <td className="p-3 font-mono">{i.imei||'—'}</td>
                      <td className="p-3">{classificacaoLaboratorio(i.resultado)?.rotulo||'—'}</td>
                      <td className="p-3 text-right"><button type="button" aria-label={'Remover '+(i.imei||i.voucher)}
                        disabled={ocupado} onClick={()=>setSelecionados(a=>a.filter(x=>chaveItem(x)!==chaveItem(i)))}
                        className={BOTAO+' border-rose-200 bg-white text-rose-700'}><Trash2 size={14}/></button></td>
                    </tr>)}</tbody>
                  </table>:<p className="p-6 text-center text-sm text-slate-500">Nenhum IMEI bipado.</p>}
                </div>
              </div>
            </>}
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-white p-4">
            <button type="button" disabled={ocupado} onClick={fecharModalMinuta}
              className={BOTAO+' border-slate-200 bg-white text-slate-600'}>Cancelar</button>
            {tipoMinuta&&<button type="button" disabled={ocupado||!selecionados.length}
              onClick={()=>void emitirMinuta()} className={BOTAO+' border-emerald-700 bg-emerald-600 px-5 py-3 text-white'}>
              <Truck size={16}/> Gerar minuta · {selecionados.length} aparelho(s)
            </button>}
          </div>
        </div>
      </div>}

      {item&&<div role="dialog" aria-modal="true" aria-labelledby="titulo-item-lab"
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3">
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

          {item.status==='divergencia_voucher'&&<p className="mt-4 rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-800">Voucher sem correspondência no GAIA/triagem. Bloqueado para reparo e recebimento até regularização da origem.</p>}
          {item.status==='aguardando_recebimento'&&
            <div className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-900">
              <p>Voucher cadastrado, aguardando conferência física. Confirme somente após identificar o aparelho.</p>
              <button type="button" disabled={ocupado||item.origem!=='individual'}
                onClick={async()=>{
                  if(!window.confirm('Confirma que o voucher '+item.voucher+' foi recebido fisicamente?'))return;
                  const retorno=await executar(item,'receber',{},'Recebimento confirmado. Voucher liberado ao técnico.');
                  if(retorno?.item)setItem({...retorno.item,origem:item.origem});
                }} className={BOTAO+' border-emerald-700 bg-emerald-600 text-white'}>
                <PackageCheck size={16}/> Confirmar recebimento físico
              </button>
            </div>}

          {['recebido','em_reparo','concluido'].includes(item.status)&&<>
            <section className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="flex items-center gap-2 text-sm font-black"><ClipboardCheck size={17} className="text-violet-700"/> Validação da OS pelo técnico</h3>
              <p className="mt-1 text-xs text-slate-500">A OS pode ser vinculada na abertura pela planilha Voucher + OS GAIA. Se estiver pendente, valide manualmente.</p>
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
                {defeitos.map((d,k)=><button disabled={ocupado||(item.status==='concluido'&&!admin)} key={k}
                  type="button" onClick={()=>setDefeitos(xs=>xs.filter((_,j)=>j!==k))}
                  className="flex items-center gap-1 rounded-full border border-rose-200 px-2.5 py-1 text-xs text-slate-800">{d}<X size={12}/></button>)}
                {!defeitos.length&&<span className="text-xs text-slate-400">Sem defeitos confirmados.</span>}
              </div>
              {(item.status!=='concluido'||admin)&&<>
                {!admin&&<p className="mt-3 text-xs font-semibold text-amber-800">Selecione livremente os defeitos do catálogo abaixo. Apenas cadastrar um defeito novo, fora do catálogo, exige perfil administrador.</p>}
                {admin&&<div className="mt-3 flex flex-wrap gap-2">
                  <input value={novoDefeito} onChange={e=>setNovoDefeito(e.target.value)}
                    maxLength={150} className={CAMPO+' min-w-36 flex-1'} placeholder="Descrever outro defeito"/>
                  <button type="button" disabled={!novoDefeito.trim()||ocupado}
                    className={BOTAO+' border-slate-300 bg-white text-violet-700'}
                    onClick={()=>{let d=novoDefeito.trim();setDefeitos(xs=>xs.includes(d)?xs:[...xs,d]);setNovoDefeito('');}}>Adicionar</button>
                </div>}
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
                {item.status!=='concluido'&&<button type="button" disabled={ocupado} onClick={salvarDefeitos}
                  className={BOTAO+' mt-3 border-violet-200 text-violet-700'}>Salvar revisão dos defeitos</button>}
              </>}
            </section>
            <section className="mt-4 rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-black">Conclusão do reparo</h3><p className="mt-1 text-xs text-slate-500">Classificação técnica para o retorno: Scrap - Não Liga / Bloqueado → sub 1000; Não Reparado Desbloqueado → sub 7; Reparado → nova triagem cosmética. Importações individuais não autorizam movimentação WMS/Oracle automática sem vínculo físico validado.</p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <label className="text-xs font-semibold text-slate-600">Resultado
                  <select value={resultado} disabled={ocupado||item.status==='concluido'} onChange={e=>setResultado(e.target.value)} className={CAMPO+' mt-1 block w-full'}>
                    <option value="reparado">Reparado</option><option value="sem_reparo">Não Reparado Desbloqueado</option><option value="irrecuperavel">Scrap - Não Liga / Bloqueado</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">Observações técnicas
                  <textarea value={observacoes} rows={2} disabled={ocupado||item.status==='concluido'}
                    onChange={e=>setObservacoes(e.target.value)} className={CAMPO+' mt-1 block w-full'} placeholder="Procedimentos e testes realizados"/>
                </label>
              </div>
              {resultado==='irrecuperavel'&&(item.status!=='concluido'||admin)&&
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-bold text-amber-900">Motivo do Scrap (obrigatório)</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {DEFEITOS_SCRAP.map(nome=><button type="button" key={nome} disabled={ocupado}
                      onClick={()=>setDefeitos(atuais=>selecionarDefeitoScrap(atuais,nome))}
                      className={BOTAO+' '+(defeitos.includes(nome)?'border-violet-700 bg-violet-700 text-white':'border-amber-300 bg-white text-amber-900')}>{nome}</button>)}
                  </div>
                </div>}
              {(item.status!=='concluido'||admin)&&!!validarConclusaoLaboratorio(resultado,defeitos)&&
                <p role="status" className="mt-3 text-xs font-semibold text-rose-700">{validarConclusaoLaboratorio(resultado,defeitos)}</p>}
              {item.status!=='concluido'
                ? <button type="button" onClick={fecharReparo} disabled={ocupado||!item.os_numero||!!validarConclusaoLaboratorio(resultado,defeitos)}
                    className={BOTAO+' mt-3 border-emerald-700 bg-emerald-600 text-white'}>
                    <CheckCircle2 size={16}/> Concluir reparo
                  </button>
                : <p className="mt-3 text-xs font-bold text-emerald-700">Reparo concluído em {dataHora(item.concluido_em)}. Consulte o histórico de saída no Warehouse.</p>}
            </section>
          </>}

          {admin && ['recebido','em_reparo','concluido'].includes(item.status) &&
            <section className="mt-4 space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <h3 className="text-sm font-black text-amber-900">Administrador · correção de laudo técnico e etapa</h3>
              <p className="text-xs text-amber-800">Correções auditadas somente antes da devolução ao Warehouse. Itens já vinculados a uma minuta precisam ser regularizados antes.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="text-xs font-semibold">Etapa
                  <select className={CAMPO+' mt-1 block w-full'} value={etapaAdmin} onChange={e=>setEtapaAdmin(e.target.value)} disabled={ocupado}>
                    <option value="recebido">Aguardando técnico</option>
                    <option value="concluido">Concluído</option>
                  </select>
                </label>
                <label className="text-xs font-semibold">Resultado do laudo técnico
                  <select className={CAMPO+' mt-1 block w-full'} value={resultado} onChange={e=>setResultado(e.target.value)} disabled={ocupado}>
                    <option value="reparado">Reparado</option><option value="sem_reparo">Não Reparado Desbloqueado</option><option value="irrecuperavel">Scrap - Não Liga / Bloqueado</option>
                  </select>
                </label>
              </div>
              <label className="block text-xs font-semibold">Observações do laudo técnico
                <textarea className={CAMPO+' mt-1 block w-full'} value={observacoes} onChange={e=>setObservacoes(e.target.value)}
                  rows={2} maxLength={5000} disabled={ocupado}/>
              </label>
              <label className="block text-xs font-semibold">Motivo da correção (obrigatório)
                <textarea className={CAMPO+' mt-1 block w-full'} value={motivoAdmin} onChange={e=>setMotivoAdmin(e.target.value)}
                  rows={2} maxLength={500} placeholder="Descreva por que a etapa ou laudo técnico precisa ser ajustado" disabled={ocupado}/>
              </label>
              <button type="button" onClick={()=>void salvarCorrecaoAdmin()} disabled={ocupado||motivoAdmin.trim().length<10}
                className={BOTAO+' border-amber-700 bg-amber-800 text-white'}>
                <ClipboardCheck size={15}/> Salvar correção auditada
              </button>
            </section>}

          {item.origem==='individual'&&<p className="mt-4 text-[11px] text-amber-800">Voucher importado individualmente: o reparo é registrado sem pedido ou romaneio artificial. A devolução física ao Warehouse deve ser conciliada antes de qualquer baixa, entrada Oracle ou movimentação de estoque.</p>}
          {item.origem==='historico'&&<p className="mt-4 text-[11px] text-slate-500">Voucher já existente no histórico do laboratório. O vínculo de origem foi preservado exclusivamente para rastreabilidade e devolução anterior.</p>}
          <div className="mt-4 flex justify-end"><button disabled={ocupado} type="button" className={BOTAO+' border-slate-300'} onClick={()=>setItem(null)}>Fechar</button></div>
        </div>
      </div>}
    </div>
  </div>;
}
