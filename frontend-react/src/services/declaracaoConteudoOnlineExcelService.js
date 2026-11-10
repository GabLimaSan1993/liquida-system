import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  MIME_XLSX, REMETENTE_DECLARACAO, DECLARACAO_TEXTO_1,
  DECLARACAO_TEXTO_2, OBSERVACAO_DECLARACAO, dataDeclaracao
} from './declaracaoConteudoOnlinePdfService.js';

const txt = valor => String(valor??'').trim();

// Formatação OOXML: as células, mesclagens, bordas e textos seguem a planilha de referência.
// As informações do destinatário substituem os campos vazios do exemplo.
const EXCEL_ESTILOS = [
 '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
 '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
 '<fonts count="3">',
 '<font><sz val="10"/><name val="Arial"/></font>',
 '<font><b/><sz val="10"/><name val="Arial"/></font>',
 '<font><b/><sz val="15"/><name val="Arial"/></font>',
 '</fonts>',
 '<fills count="3">',
 '<fill><patternFill patternType="none"/></fill>',
 '<fill><patternFill patternType="gray125"/></fill>',
 '<fill><patternFill patternType="solid"><fgColor rgb="FFD8D8D8"/><bgColor indexed="64"/></patternFill></fill>',
 '</fills>',
 '<borders count="3">',
 '<border><left/><right/><top/><bottom/><diagonal/></border>',
 '<border><left style="thin"><color indexed="64"/></left><right style="thin"><color indexed="64"/></right><top style="thin"><color indexed="64"/></top><bottom style="thin"><color indexed="64"/></bottom><diagonal/></border>',
 '<border><left style="medium"><color indexed="64"/></left><right style="medium"><color indexed="64"/></right><top style="medium"><color indexed="64"/></top><bottom style="medium"><color indexed="64"/></bottom><diagonal/></border>',
 '</borders>',
 '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>',
 '<cellXfs count="8">',
 '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',
 '<xf numFmtId="0" fontId="2" fillId="0" borderId="2" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
 '<xf numFmtId="0" fontId="1" fillId="0" borderId="2" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>',
 '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
 '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>',
 '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>',
 '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>',
 '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>',
 '</cellXfs>',
 '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>',
 '</styleSheet>'
].join('');

function estilo(ref){
  const match=String(ref).match(/^([A-Z]+)(\d+)$/);
  if(!match)return 0;
  const row=Number(match[2]);
  if(row===2)return 1;
  if([4,11,21].includes(row))return 2;
  if(row===28)return 7;
  if(row===13)return 4;
  if([18,19].includes(row))return 5;
  if([23,24,25,26,29,3].includes(row))return 6;
  if((row>=5&&row<=9)||(row>=14&&row<=17))return 3;
  return 0;
}

export async function gerarDeclaracaoConteudoExcel(info){
  const d=info.destinatario||{};
  const linhas=Array.from({length:29},()=>Array.from({length:10},()=>''));
  function set(col,row,valor){linhas[row-1][XLSX.utils.decode_col(col)]=valor;}
  set('A',2,'DECLARAÇÃO DE CONTEÚDO');
  set('A',3,'E-TICKET: '+txt(info.eticket)+'   |   VOUCHER: '+txt(info.voucher));
  set('A',4,'REMETENTE');set('F',4,'DESTINATÁRIO');
  set('A',5,'NOME: '+REMETENTE_DECLARACAO.nome);
  set('A',6,'ENDEREÇO: '+REMETENTE_DECLARACAO.endereco);
  set('A',7,REMETENTE_DECLARACAO.complemento);
  set('A',8,'CIDADE: '+REMETENTE_DECLARACAO.cidade);
  set('C',8,'UF: '+REMETENTE_DECLARACAO.uf);
  set('A',9,'CEP: '+REMETENTE_DECLARACAO.cep);set('B',9,'CPF/CNPJ:');
  set('F',5,'NOME:');set('G',5,txt(d.nome));
  set('F',6,'ENDEREÇO:');set('G',6,txt(d.endereco));
  set('F',7,'BAIRRO:');set('G',7,txt(d.bairro));
  set('F',8,'CIDADE: '+txt(d.cidade));set('H',8,'UF: '+txt(d.uf));
  set('F',9,'CEP: '+txt(d.cep));set('G',9,'CPF/CNPJ:');
  set('H',9,txt(d.cpf_cnpj));
  set('A',11,'IDENTIFICAÇÃO DOS BENS');
  set('A',13,'ITEM');set('B',13,'CONTEÚDO');set('I',13,'QUANT.');set('J',13,'VALOR');
  set('A',14,1);set('B',14,txt(info.conteudo));set('I',14,1);
  set('J',14,Number(info.valor_declarado));
  set('A',18,'TOTAIS');set('I',18,1);set('J',18,Number(info.valor_declarado));
  set('A',19,'PESO TOTAL (KG)');
  if(info.peso_total_kg)set('J',19,Number(info.peso_total_kg));
  set('A',21,'DECLARAÇÃO');
  set('A',23,'  '+DECLARACAO_TEXTO_1);
  set('A',24,'  '+DECLARACAO_TEXTO_2);
  set('A',25,REMETENTE_DECLARACAO.cidade+', '+dataDeclaracao());
  set('H',26,'Assinatura do Declarante/Remetente');
  set('A',28,'OBSERVAÇÃO:');set('A',29,OBSERVACAO_DECLARACAO);
  const sheet=XLSX.utils.aoa_to_sheet(linhas);
  sheet['!merges']=[
    'A2:J2','A3:J3','A4:E4','F4:J4','G5:J5','G6:J6','G7:J7',
    'I8:J8','H9:J9','A11:J11','B13:H13','B14:H14','B15:H15',
    'B16:H16','B17:H17','A18:H18','A19:H19','A21:J21',
    'A23:J23','A24:J24','A25:G25','H26:J26','A28:J28','A29:J29'
  ].map(XLSX.utils.decode_range);
  sheet['!cols']=Array.from({length:10},()=>({wch:12}));
  sheet['!cols'][0]={wch:25};sheet['!cols'][1]={wch:19};
  sheet['!cols'][5]={wch:18};sheet['!cols'][6]={wch:20};
  sheet['!cols'][9]={wch:14};
  sheet['!rows']=Array.from({length:29},()=>({hpt:22}));
  sheet['!rows'][1]={hpt:27};
  sheet['!rows'][22]={hpt:115};
  sheet['!rows'][23]={hpt:82};
  sheet['!rows'][28]={hpt:52};
  sheet['!margins']={left:.2,right:.2,top:.3,bottom:.3,header:.1,footer:.1};
  const work=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(work,sheet,'Declaração de Conteúdo');
  const zip=await JSZip.loadAsync(XLSX.write(work,{bookType:'xlsx',type:'array'}));
  const file=zip.file('xl/worksheets/sheet1.xml');
  if(!file)throw new Error('Não foi possível montar a planilha da declaração.');
  const parser=new DOMParser();
  const doc=parser.parseFromString(await file.async('string'),'application/xml');
  for(const el of Array.from(doc.getElementsByTagName('c'))){
    const style=estilo(el.getAttribute('r'));
    if(style)el.setAttribute('s',String(style));
  }
  zip.file('xl/worksheets/sheet1.xml',new XMLSerializer().serializeToString(doc));
  zip.file('xl/styles.xml',EXCEL_ESTILOS);
  return zip.generateAsync({type:'blob',compression:'DEFLATE',mimeType:MIME_XLSX});
}
