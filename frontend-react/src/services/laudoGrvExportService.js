import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';

export const BUCKET_LAUDOS_ONLINE='tradein-online-laudos';

export function dataUrlParaBlob(dataUrl) {
  const [cabecalho,conteudo]=String(dataUrl||'').split(',');
  if(!cabecalho?.includes('base64')||!conteudo)throw new Error('Imagem inválida.');
  const mime=cabecalho.match(/^data:([^;]+)/)?.[1]||'image/jpeg';
  const bytes=atob(conteudo);
  const bin=new Uint8Array(bytes.length);
  for(let i=0;i<bytes.length;i++)bin[i]=bytes.charCodeAt(i);
  return new Blob([bin],{type:mime});
}

function carregarImagem(src){
  return new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error('Não foi possível abrir a fotografia.'));
    img.src=src;
  });
}

export async function prepararFoto(file){
  if(!file?.type?.startsWith('image/'))throw new Error('Selecione uma imagem válida da câmera ou galeria.');
  if(file.size>20*1024*1024)throw new Error('Imagem maior que 20 MB. Reduza a resolução.');
  const bytes=await new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result);
    reader.onerror=()=>reject(new Error('Erro ao ler a imagem.'));
    reader.readAsDataURL(file);
  });
  const img=await carregarImagem(bytes);
  const scale=Math.min(1,1600/Math.max(img.width,img.height));
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(img.width*scale));
  canvas.height=Math.max(1,Math.round(img.height*scale));
  canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
  return canvas.toDataURL('image/jpeg',0.86);
}

function desenharSeta(ctx,x,y,w,h){
  const tipX=x*w,tipY=y*h;
  const vx=0.073*w, vy=0.115*h;
  const origX=tipX-vx,origY=tipY-vy;
  const ang=Math.atan2(tipY-origY,tipX-origX);
  const tamanho=Math.min(w,h)*0.029;
  ctx.save();
  ctx.strokeStyle='#e00000';ctx.lineWidth=Math.max(3,w*0.0035);ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(origX,origY);ctx.lineTo(tipX,tipY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(tipX,tipY);
  ctx.lineTo(tipX-tamanho*Math.cos(ang-Math.PI/6),tipY-tamanho*Math.sin(ang-Math.PI/6));
  ctx.moveTo(tipX,tipY);
  ctx.lineTo(tipX-tamanho*Math.cos(ang+Math.PI/6),tipY-tamanho*Math.sin(ang+Math.PI/6));
  ctx.stroke();ctx.restore();
}

export async function gerarFotoAnotada(src,setas=[]){
  const img=await carregarImagem(src);
  const w=960,h=720,canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,w,h);
  const escala=Math.max(w/img.width,h/img.height);
  ctx.drawImage(img,(w-img.width*escala)/2,(h-img.height*escala)/2,img.width*escala,img.height*escala);
  for(const seta of setas)desenharSeta(ctx,Math.min(1,Math.max(0,Number(seta.x)||0)),Math.min(1,Math.max(0,Number(seta.y)||0)),w,h);
  return canvas.toDataURL('image/jpeg',0.85);
}

const clean=v=>String(v??'').trim();
const nomeArquivo=v=>clean(v).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,65)||'sem_voucher';
const txt=(doc,str,x,y,w,limite=2,tamanho=7.4)=>{
  let linhas=doc.splitTextToSize(clean(str)||'Não informado',w);
  if(linhas.length>limite)linhas=[...linhas.slice(0,limite-1),linhas[limite-1].slice(0,Math.max(2,linhas[limite-1].length-4))+'...'];
  doc.setFont('helvetica','normal');doc.setFontSize(tamanho);doc.text(linhas,x,y);
};
const caixa=(doc,x,y,w,h)=>{doc.setDrawColor(0);doc.setLineWidth(0.28);doc.rect(x,y,w,h);};
const linha=(doc,x1,y1,x2,y2)=>{doc.setDrawColor(0);doc.setLineWidth(0.3);doc.line(x1,y1,x2,y2);};

export function gerarLaudoPdf(info,fotos){
  if(fotos?.length!==4)throw new Error('O laudo precisa das quatro fotos.');
  const doc=new jsPDF({orientation:'portrait',unit:'mm',format:'a4'});
  const x=11,larg=188;
  caixa(doc,x,13,larg,271);
  // Cabeçalho no mesmo grid do modelo Assurant/Itaú.
  const logoX=18,logoY=23;
  const cores=[[0,164,210],[61,150,63],[251,174,17],[0,113,199],[82,179,67],[249,160,29]];
  for(let i=0;i<6;i++){
    const angle=i*Math.PI/3;
    doc.setFillColor(...cores[i]);
    doc.ellipse(logoX+3.1*Math.cos(angle),logoY+3.1*Math.sin(angle),2.8,5.5,'F');
  }
  doc.setFillColor(255,255,255);doc.circle(logoX,logoY,1.7,'F');
  doc.setTextColor(102,102,102);doc.setFont('helvetica','bold');doc.setFontSize(14);
  doc.text('ASSURANT',26,26);
  doc.setTextColor(0);doc.setFontSize(12.2);
  doc.text('LAUDO DA AVALIAÇÃO FINAL',80,25);
  caixa(doc,167,13,32,27);linha(doc,167,22,199,22);
  doc.setFontSize(8.2);doc.text('DATA:',177,19);
  doc.text(new Date().toLocaleDateString('pt-BR'),172,30);

  const etiquetas=[
    ['NOME:',info.nome_cliente],
    ['IMEI:',info.imei_documento],
    ['Nº PEDIDO:',info.numero_pedido]
  ];
  etiquetas.forEach(([rotulo,valor],i)=>{
    const y=41+i*6.5;
    caixa(doc,11,y,116,6.5);linha(doc,43,y,43,y+6.5);
    doc.setFontSize(7.6);doc.setFont('helvetica','bold');doc.text(rotulo,12,y+4.5);
    txt(doc,valor,45,y+4.5,79,1,7.2);
  });
  // Um bloco para modelo, capacidade e cor, como na referência.
  caixa(doc,11,67,116,22);linha(doc,46,67,46,89);
  linha(doc,11,74.33,46,74.33);linha(doc,11,81.66,46,81.66);
  doc.setFont('helvetica','bold');doc.setFontSize(7.5);
  doc.text('MODELO:',12,72);
  doc.text('CAPACIDADE:',12,79);
  doc.text('COR:',12,86);
  txt(doc,[info.modelo_documento,info.capacidade_documento,info.cor_documento].filter(Boolean).join(' ')||'Não informado',49,78,73,3,8.1);

  linha(doc,11,93,199,93);
  doc.setFont('helvetica','bold');doc.setFontSize(8.5);
  doc.text('DESCRIÇÃO DA AVALIAÇÃO FINAL:',12,98);
  txt(doc,info.descricao_final,12,104,185,2,7.5);
  linha(doc,11,110,199,110);

  doc.setFont('helvetica','bold');doc.setFontSize(8.1);
  doc.text('Na pré-avaliação pelo App Itaú:',12,116);
  txt(doc,info.pre_avaliacao,76,116,120,2,7.1);
  linha(doc,11,124,199,124);
  doc.setFont('helvetica','bold');doc.setFontSize(8.1);
  doc.text('Na avaliação física do aparelho:',12,130);
  txt(doc,info.avaliacao_fisica,76,130,120,2,7.1);
  linha(doc,11,138,199,138);
  doc.setFont('helvetica','bold');doc.setFontSize(8.7);
  doc.text('FOTOS DA DIVERGÊNCIA',105,143,{align:'center'});
  linha(doc,11,146,199,146);

  const esquerda=11,direita=105,total=94;
  linha(doc,direita,146,direita,284);
  // Duas linhas, duas colunas: quatro fotos na mesma disposição do modelo.
  for(let i=0;i<4;i++){
    const col=i%2,row=Math.floor(i/2);
    const xx=col?105:11;
    const labelY=row?215:146;
    const imageY=row?220:151;
    const imageH=row?64:59;
    linha(doc,xx,labelY+5,xx+total,labelY+5);
    doc.setFont('helvetica','bold');doc.setFontSize(8.6);
    doc.text(String(i+1),xx+total/2,labelY+3.9,{align:'center'});
    doc.addImage(fotos[i],'JPEG',xx+2,imageY+1,total-4,imageH-2,undefined,'FAST');
  }
  linha(doc,11,215,199,215);
  return doc.output('blob');
}

function xmlEscape(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

export async function gerarLaudoExcel(info,fotos){
  if(fotos?.length!==4)throw new Error('O laudo precisa das quatro fotos.');
  const linhas=[
    ['ASSURANT - LAUDO DA AVALIAÇÃO FINAL'],
    ['DATA',new Date().toLocaleDateString('pt-BR')],
    ['NOME',clean(info.nome_cliente)],
    ['IMEI',clean(info.imei_documento)],
    ['Nº PEDIDO',clean(info.numero_pedido)],
    ['MODELO',clean(info.modelo_documento)],
    ['CAPACIDADE',clean(info.capacidade_documento)],
    ['COR',clean(info.cor_documento)],
    ['DESCRIÇÃO DA AVALIAÇÃO FINAL',clean(info.descricao_final)],
    ['Na pré-avaliação pelo App Itaú',clean(info.pre_avaliacao)],
    ['Na avaliação física do aparelho',clean(info.avaliacao_fisica)],
    [],['FOTOS DA DIVERGÊNCIA'],['FOTO 1','','','','','','','FOTO 2'],[],[],[],[],[],[],
    [],[],[],[],[],[],[],[],[],[],[],[],[],[],[],
    ['FOTO 3','','','','','','','FOTO 4']
  ];
  const ws=XLSX.utils.aoa_to_sheet(linhas);
  ws['!cols']=Array.from({length:14},(_,i)=>({wch:i===0?29:i===1?24:13}));
  ws['!rows']=Array.from({length:65},(_,i)=>({hpt:i<13?21:17}));
  ws['!merges']=[
    {s:{r:0,c:0},e:{r:0,c:11}},
    {s:{r:12,c:0},e:{r:12,c:11}},
    {s:{r:13,c:0},e:{r:13,c:5}},
    {s:{r:13,c:7},e:{r:13,c:12}},
    {s:{r:34,c:0},e:{r:34,c:5}},
    {s:{r:34,c:7},e:{r:34,c:12}}
  ];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Laudo GRV');
  const base=XLSX.write(wb,{bookType:'xlsx',type:'array'});
  const zip=await JSZip.loadAsync(base);
  const rels=[
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    ...fotos.map((_,i)=>'<Relationship Id="rId'+(i+1)+'" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/laudo_foto_'+(i+1)+'.jpg"/>'),
    '</Relationships>'
  ].join('');
  zip.file('xl/drawings/_rels/drawing1.xml.rels',rels);
  const mk=(i,col,row)=>{
    const col2=col+6,row2=row+18;
    const marker=(c,r)=>'<xdr:col>'+c+'</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>'+r+'</xdr:row><xdr:rowOff>0</xdr:rowOff>';
    return '<xdr:twoCellAnchor editAs="oneCell"><xdr:from>'+marker(col,row)+'</xdr:from><xdr:to>'+marker(col2,row2)+'</xdr:to>'+
      '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="'+(i+1)+'" name="Foto '+(i+1)+'"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>'+
      '<xdr:blipFill><a:blip r:embed="rId'+(i+1)+'"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>'+
      '<xdr:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic>'+
      '<xdr:clientData/></xdr:twoCellAnchor>';
  };
  const drawing='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'+
      mk(0,0,14)+mk(1,7,14)+mk(2,0,35)+mk(3,7,35)+'</xdr:wsDr>';
  zip.file('xl/drawings/drawing1.xml',drawing);
  fotos.forEach((img,i)=>zip.file('xl/media/laudo_foto_'+(i+1)+'.jpg',img.split(',')[1],{base64:true}));
  const rel='<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdLaudoDrawing" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
  zip.file('xl/worksheets/_rels/sheet1.xml.rels','<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+rel);
  let sheet=await zip.file('xl/worksheets/sheet1.xml').async('string');
  if(!sheet.includes('xmlns:r='))sheet=sheet.replace('<worksheet ','<worksheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ');
  sheet=sheet.replace('</worksheet>','<drawing r:id="rIdLaudoDrawing"/></worksheet>');
  zip.file('xl/worksheets/sheet1.xml',sheet);
  let ct=await zip.file('[Content_Types].xml').async('string');
  if(!ct.includes('Extension="jpg"'))ct=ct.replace('</Types>','<Default Extension="jpg" ContentType="image/jpeg"/></Types>');
  ct=ct.replace('</Types>','<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>');
  zip.file('[Content_Types].xml',ct);
  return zip.generateAsync({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',compression:'DEFLATE'});
}

export function baixarBlob(blob,nome){
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=nome;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export const nomeArquivoLaudo = voucher => nomeArquivo(voucher);
