import Papa from 'papaparse';
import * as XLSX from 'xlsx';

// O Relatório_Estoque do GAIA é entregue em CSV (;) OU planilha Excel.
// NUNCA interpretar o binário XLSX usando o parser de CSV.
const ALIASES = {
  voucher:'Voucher', numero_voucher:'Voucher', numero_do_voucher:'Voucher',
  nr_voucher:'Voucher', no_voucher:'Voucher', id_voucher:'Voucher',
  voucher_id:'Voucher', codigo_voucher:'Voucher', cod_voucher:'Voucher',
  imei:'IMEI', imei_1:'IMEI', imei1:'IMEI', imei_principal:'IMEI',
  imei_primario:'IMEI', numero_imei:'IMEI', numero_do_imei:'IMEI',
  sku:'SKU', codigo_sku:'SKU', cod_sku:'SKU',
  modelo:'Modelo', modelo_aparelho:'Modelo', modelo_do_aparelho:'Modelo',
  cliente:'Cliente', loja:'Loja', rede:'Rede',
  tipo_de_rede:'Tipo_de_Rede', tipo_rede:'Tipo_de_Rede',
  lote:'Lote', status_atual:'Status_atual', status:'Status_atual',
  situacao_atual:'Status_atual', situacao:'Status_atual',
  condicao:'Condicao', condicao_compra:'Condicao',
  triagem_funcional:'Triagem_funcional', grade:'Grade',
  grade_faturamento:'Grade', grade_final:'Grade',
  criado_em:'Criado_em', data_criacao:'Criado_em',
  atualizado_em:'Atualizado_em', data_atualizacao:'Atualizado_em',
  tela:'Tela', laterais:'Laterais', traseira:'Traseira',
  defeitos_adicionais:'Defeitos_Adicionais',
  resultado_triagem_funcional:'Resultado_Triagem_Funcional',
  data_recebimento:'Data_Recebimento', data_de_recebimento:'Data_Recebimento',
  recebido_em:'Data_Recebimento',
  data_funcional:'Data_Funcional', data_triagem_funcional:'Data_Funcional',
  data_cosmetico:'Data_Cosmetico', data_cosmetica:'Data_Cosmetico',
  data_triagem_cosmetica:'Data_Cosmetico',
  data_laudo:'Data_Laudo', data_alocacao:'Data_Alocacao',
  data_oracle:'Data_Oracle',
  respostas_funcional:'Respostas_Funcional',
  status_bateria:'status_bateria', reanalise:'Reanalise', aging:'Aging',
};

const normalizarNome = input => String(input ?? '')
  .replace(/\uFEFF/g, '').normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
  .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

const canonico = raw => ALIASES[normalizarNome(raw)] || String(raw ?? '').trim();
const preenchido = valor => valor != null && String(valor).trim() !== '';
const reconheceVoucher = cabecalho => cabecalho.some(x => canonico(x) === 'Voucher');

function mapearLinhas(matriz, origem, nomeAba) {
  if (!Array.isArray(matriz) || matriz.length === 0) {
    throw new Error('O arquivo do GAIA está vazio ou não possui uma tabela legível.');
  }

  // Arquivos GAIA podem conter título, data ou filtros antes da linha de cabeçalho.
  let indiceCabecalho=-1;
  let melhorNota=0;
  const limite=Math.min(matriz.length,60);
  for(let i=0;i<limite;i++){
    const linha=matriz[i] || [];
    if(!reconheceVoucher(linha))continue;
    const nomes=new Set(linha.map(canonico));
    const nota=['Voucher','IMEI','Status_atual','Grade','Modelo','Data_Recebimento','Tipo_de_Rede']
      .filter(key=>nomes.has(key)).length;
    if(nota>melhorNota){melhorNota=nota;indiceCabecalho=i;}
  }
  if(indiceCabecalho<0){
    const primeiras=matriz.slice(0,4).flat().filter(preenchido).slice(0,12)
      .map(v=>String(v).slice(0,70));
    throw new Error('Coluna Voucher não identificada no relatório GAIA. '
      +'Confira a aba e o cabeçalho. Primeiros campos lidos: '
      +(primeiras.join(' | ')||'nenhum')+'.');
  }

  const nomes=matriz[indiceCabecalho].map(canonico);
  // Se houver duas colunas com mesmo nome, preserva a primeira não vazia.
  const linhas=[];
  let descartadas=0;
  for(let i=indiceCabecalho+1;i<matriz.length;i++){
    const row=matriz[i]||[];
    if(!row.some(preenchido))continue;
    const obj={};
    nomes.forEach((nome,index)=>{
      if(!nome)return;
      if(!preenchido(obj[nome]) && preenchido(row[index])) obj[nome]=row[index];
    });
    // A RPC upsert_triagem usa voucher como chave. Nunca contar IMEI isolado
    // como importação bem-sucedida: o banco ignoraria essa linha.
    if(!preenchido(obj.Voucher)){
      descartadas++;
      continue;
    }
    linhas.push(obj);
  }

  if(linhas.length===0){
    throw new Error('Nenhum voucher válido encontrado em '+origem
      +(nomeAba?' (aba '+nomeAba+')':'')+'. '
      +'Verifique se a coluna Voucher tem dados abaixo do cabeçalho.');
  }
  return {
    rows:linhas,
    ignored:descartadas,
    sheet:nomeAba||null,
    source:origem,
    headers:nomes.filter(Boolean),
    missingRecommended:['IMEI','Status_atual','Grade'].filter(k=>!nomes.includes(k)),
    headerRow:indiceCabecalho+1,
  };
}

async function lerExcel(file){
  let workbook;
  try{
    const bytes=await file.arrayBuffer();
    workbook=XLSX.read(bytes,{type:'array',cellDates:false,cellFormula:false});
  }catch(e){throw new Error('Não foi possível abrir o Excel do GAIA: '+e.message);}
  const candidatos=[];
  for(const nome of workbook.SheetNames){
    const folha=workbook.Sheets[nome];
    if(!folha?.['!ref'])continue;
    const dados=XLSX.utils.sheet_to_json(folha,{
      header:1,defval:'',raw:true,blankrows:false,
    });
    try{
      const result=mapearLinhas(dados,'Excel',nome);
      const pontos=result.headers.filter(h=>[
        'Voucher','IMEI','Status_atual','Grade','Modelo','Data_Recebimento','Tipo_de_Rede'
      ].includes(h)).length;
      candidatos.push({...result,pontos});
    }catch(e){
      // Outra aba pode ser o relatório; só falhar depois de avaliar todas.
    }
  }
  candidatos.sort((a,b)=>b.pontos-a.pontos || b.rows.length-a.rows.length);
  if(!candidatos.length){
    const abas=workbook.SheetNames.join(', ');
    throw new Error('O Excel foi aberto, mas nenhuma aba contém vouchers válidos '
      +'em uma coluna Voucher. Abas encontradas: '+abas+'.');
  }
  const {pontos,...resultado}=candidatos[0];
  return resultado;
}

async function lerCsv(file){
  let texto;
  try{
    const array=await file.arrayBuffer();
    try{texto=new TextDecoder('utf-8',{fatal:true}).decode(array);}
    catch{texto=new TextDecoder('windows-1252').decode(array);}
  }catch(e){throw new Error('Falha ao ler o CSV do GAIA: '+e.message);}
  const r=Papa.parse(texto,{header:false,skipEmptyLines:'greedy',delimiter:''});
  if(r.errors?.length && !r.data?.length){
    throw new Error('CSV do GAIA inválido: '+r.errors[0].message);
  }
  return mapearLinhas(r.data,'CSV',null);
}

/**
 * Lê GAIA XLSX/XLS/CSV retornando sempre as mesmas chaves do upsert_triagem.
 * Não lê nem altera campos de endereço WMS (local no parseRow continua null).
 */
export async function lerArquivoGaiaTriagem(file){
  if(!file)throw new Error('Selecione o relatório do GAIA.');
  const nome=String(file.name||'').toLowerCase();
  if(/\.(xlsx|xls)$/.test(nome))return lerExcel(file);
  if(/\.csv$/.test(nome))return lerCsv(file);
  throw new Error('Formato não suportado. Envie .xlsx, .xls ou .csv do GAIA.');
}
