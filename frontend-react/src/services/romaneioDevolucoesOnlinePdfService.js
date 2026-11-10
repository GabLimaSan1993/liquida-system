import jsPDF from 'jspdf';
import 'jspdf-autotable';

const tz='America/Sao_Paulo';
const agoraBrasil=()=>new Date().toLocaleString('pt-BR',{timeZone:tz});
const trunc=(value,n=60)=>String(value??'—').trim().slice(0,n)||'—';
const brl=value=>Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function gerarCodigoRomaneioOnline(){
  const partes=new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'})
    .format(new Date()).replace(/-/g,'');
  return 'RTON-'+partes+'-'+crypto.randomUUID().replace(/-/g,'').slice(0,12).toUpperCase();
}

/** Monta PDF de romaneio com exatamente os itens autenticados na conferência do Supabase. */
export function gerarRomaneioDevolucaoOnlinePdf({codigo,itens,operador}){
  if(!Array.isArray(itens)||!itens.length)throw new Error('O romaneio precisa de ao menos um volume.');
  const doc=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
  const largura=doc.internal.pageSize.getWidth();
  doc.setFillColor(39,21,63);
  doc.rect(0,0,largura,27,'F');
  doc.setTextColor(255,255,255);
  doc.setFont('helvetica','bold');
  doc.setFontSize(16);
  doc.text('ROMANEIO DE EXPEDIÇÃO',14,13);
  doc.setFontSize(10);
  doc.text('DEVOLUÇÕES TRADE-INS ONLINE  |  ASSURANT',14,20);
  doc.setTextColor(30,30,40);
  doc.setFontSize(11);
  doc.text('Nº '+codigo,14,36);
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text('Gerado em: '+agoraBrasil(),14,43);
  doc.text('Responsável: '+trunc(operador,85),115,43);
  doc.text('Total de volumes: '+itens.length,14,50);
  doc.text('Conferência: e-ticket individual por voucher; documentos de conteúdo vinculados no Liquida System.',85,50);

  const ordenados=[...itens].sort((a,b)=>String(a.voucher||'').localeCompare(String(b.voucher||'')));
  const rows=ordenados.map((item,index)=>[
    String(index+1),trunc(item.voucher,22),trunc(item.eticket,28),
    trunc(item.modelo,38),trunc(item.imei,23),trunc(item.codigo_rastreio,23),
    brl(item.valor_declarado)
  ]);
  doc.autoTable({
    startY:56,
    head:[['#','Voucher','E-ticket','Aparelho / modelo','IMEI / Serial','Objeto Correios','Valor declarado']],
    body:rows,
    theme:'grid',
    styles:{fontSize:8,cellPadding:2.3,overflow:'linebreak',valign:'middle',lineColor:[216,222,231],lineWidth:.15},
    headStyles:{fillColor:[80,49,128],textColor:[255,255,255],fontStyle:'bold'},
    alternateRowStyles:{fillColor:[248,246,251]},
    margin:{left:14,right:14,top:14,bottom:30},
    columnStyles:{
      0:{cellWidth:9,halign:'center'},1:{cellWidth:30},2:{cellWidth:37},
      3:{cellWidth:66},4:{cellWidth:40},5:{cellWidth:45},6:{cellWidth:41,halign:'right'}
    }
  });
  const fimY=doc.lastAutoTable?.finalY||56;
  const altura=doc.internal.pageSize.getHeight();
  if(fimY+21>altura-12)doc.addPage();
  const y=doc.lastAutoTable?.finalY && fimY+21<=altura-12 ? fimY+10 : 25;
  doc.setTextColor(20,20,25);
  doc.setFont('helvetica','normal');doc.setFontSize(9);
  doc.text('Transportadora / responsável pela coleta: __________________________________________',14,y);
  doc.text('Assinatura da conferência: __________________________________________',160,y);
  doc.text('Data / horário de saída: ______ / ______ / __________   ______ : ______',14,y+9);

  const paginas=doc.internal.getNumberOfPages();
  for(let i=1;i<=paginas;i++){
    doc.setPage(i);
    doc.setDrawColor(210,210,218);
    doc.line(14,altura-12,largura-14,altura-12);
    doc.setFontSize(8);doc.setTextColor(95,101,113);
    doc.text('Liquida System  •  Romaneio '+codigo+'  •  '+itens.length+' volume(s)',14,altura-7);
    doc.text('Página '+i+' de '+paginas,largura-14,altura-7,{align:'right'});
  }
  return doc.output('blob');
}
