import jsPDF from 'jspdf';

export const BUCKET_DECLARACOES_ONLINE = 'tradein-online-devolucoes';
export const MIME_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Conteúdo legal e dados do remetente transcritos do modelo Assurant anexado.
export const REMETENTE_DECLARACAO = {
 nome:'ASSURANT',endereco:'AVENIDA LIBERDADE, 4565 – IPORANGA',
 complemento:'BLOCO C MEZANINO, SALA B',cidade:'SOROCABA',uf:'SP',cep:'18087-170'
};
export const DECLARACAO_TEXTO_1 = 'Declaro que não me enquadro no conceito de contribuinte previsto no art. 4º da Lei Complementar nº 87/1996, uma vez que não realizo, com habitualidade ou em volume que caracterize intuito comercial, operações de circulação de mercadoria, ainda que se iniciem no exterior, ou estou dispensado da emissão da nota fiscal por força da legislação tributária vigente, responsabilizando-me, nos termos da lei e a quem de direito, por informações inverídicas.';
export const DECLARACAO_TEXTO_2 = 'Declaro ainda que não estou postando conteúdo inflamável, explosivo, causador de combustão espontânea, tóxico, corrosivo, gás ou qualquer outro conteúdo que conste na lista de proibições e restrições disponível no site dos Correios: https://www.correios.com.br/enviar/proibicoes-e-restricoes/proibicoes-e-restricoes.';
export const OBSERVACAO_DECLARACAO = 'Constitui crime contra a ordem tributária suprimir ou reduzir tributo, ou contribuição social e qualquer acessório (Lei 8.137/90 Art. 1º, V).';
export const nomeDeclaracao = voucher => 'Declaracao_Conteudo_'+String(voucher||'').replace(/[^a-z0-9_-]+/gi,'_');
export const dataDeclaracao = () => new Intl.DateTimeFormat('pt-BR', {
 timeZone:'America/Sao_Paulo', day:'2-digit', month:'long', year:'numeric'
}).format(new Date());
const txt = valor => String(valor??'').trim();
const brl = valor => Number(valor||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});

export function gerarDeclaracaoConteudoPDF(info) {
 const dest=info.destinatario||{}, pdf=new jsPDF({unit:'mm',format:'a4'});
 const margem=12, largura=186, metade=105;
 const borda=(x,y,w,h,p=.35)=>{pdf.setLineWidth(p);pdf.rect(x,y,w,h);};
 const texto=(v,x,y,o={})=>pdf.text(String(v??''),x,y,o);
 const faixa=(rotulo,y)=>{
   pdf.setFont('helvetica','bold');pdf.setFontSize(10.5);
   borda(margem,y,largura,9,.6);texto(rotulo,105,y+6.2,{align:'center'});
 };
 const campo=(rotulo,valor,x,y,larg=84)=>{
   pdf.setFont('helvetica','normal');pdf.setFontSize(8.4);
   const linha=rotulo+(rotulo?' ':'')+txt(valor);
   texto(pdf.splitTextToSize(linha,larg)[0]||'',x,y);
 };
 pdf.setTextColor(10,10,10);
 pdf.setFont('helvetica','bold');pdf.setFontSize(15);
 texto('DECLARAÇÃO DE CONTEÚDO',105,20,{align:'center'});
 pdf.setFont('helvetica','normal');pdf.setFontSize(7.5);
 texto('E-TICKET: '+info.eticket+'     VOUCHER: '+info.voucher,105,26,{align:'center'});
 borda(margem,13,largura,16,.65);
 const y=34;
 borda(margem,y,largura,45,.6);
 pdf.line(metade,y,metade,y+45);pdf.line(margem,y+9,margem+largura,y+9);
 pdf.setFont('helvetica','bold');pdf.setFontSize(11);
 texto('REMETENTE',58,y+6,{align:'center'});texto('DESTINATÁRIO',151,y+6,{align:'center'});
 campo('NOME:',REMETENTE_DECLARACAO.nome,14,y+14);
 campo('ENDEREÇO:',REMETENTE_DECLARACAO.endereco,14,y+20);
 campo('',REMETENTE_DECLARACAO.complemento,14,y+26);
 campo('CIDADE:',REMETENTE_DECLARACAO.cidade,14,y+32,56);
 campo('UF:',REMETENTE_DECLARACAO.uf,79,y+32,20);
 campo('CEP:',REMETENTE_DECLARACAO.cep,14,y+39);
 campo('NOME:',dest.nome,107,y+14);
 campo('ENDEREÇO:',dest.endereco,107,y+20);
 campo('BAIRRO:',dest.bairro,107,y+26);
 campo('CIDADE:',dest.cidade,107,y+32,66);
 campo('UF:',dest.uf,178,y+32,20);
 campo('CEP:',dest.cep,107,y+39,37);
 campo('CPF/CNPJ:',dest.cpf_cnpj,149,y+39,47);
 faixa('IDENTIFICAÇÃO DOS BENS',85);
 borda(12,98,186,42,.65);
 [40,159,174].forEach(x=>pdf.line(x,98,x,140));
 [108,116,124,132].forEach(y2=>pdf.line(12,y2,198,y2));
 pdf.setFont('helvetica','bold');pdf.setFontSize(9);
 texto('ITEM',26,104,{align:'center'});
 texto('CONTEÚDO',99,104,{align:'center'});
 texto('QUANT.',166.5,104,{align:'center'});
 texto('VALOR',186,104,{align:'center'});
 pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 texto('1',26,113,{align:'center'});
 texto(pdf.splitTextToSize(txt(info.conteudo),115)[0]||'',43,113);
 texto('1',166.5,113,{align:'center'});texto(brl(info.valor_declarado),196,113,{align:'right'});
 pdf.setFillColor(225,225,225);pdf.rect(12,140,147,15,'F');borda(12,140,186,15,.65);
 pdf.line(159,140,159,155);pdf.line(174,140,174,155);pdf.line(12,147.5,198,147.5);
 pdf.setFont('helvetica','bold');pdf.setFontSize(9);
 texto('TOTAIS',156,145.3,{align:'right'});
 texto('1',166.5,145.3,{align:'center'});
 texto(brl(info.valor_declarado),196,145.3,{align:'right'});
 texto('PESO TOTAL (KG)',156,153,{align:'right'});
 pdf.setFont('helvetica','normal');texto(info.peso_total_kg?txt(info.peso_total_kg).replace('.',','):'—',196,153,{align:'right'});
 faixa('DECLARAÇÃO',160);
 pdf.setFont('helvetica','normal');pdf.setFontSize(9);
 const p1=pdf.splitTextToSize('  '+DECLARACAO_TEXTO_1,181);
 const p2=pdf.splitTextToSize('  '+DECLARACAO_TEXTO_2,181);
 texto(p1,14,177);
 const y2=177+p1.length*4.5+5;
 texto(p2,14,y2);
 const yData=Math.max(232,y2+p2.length*4.5+10);
 pdf.setFontSize(9.5);
 texto(REMETENTE_DECLARACAO.cidade+', '+dataDeclaracao(),14,yData);
 texto('___________________________________',185,yData,{align:'right'});
 pdf.setFontSize(8.3);
 texto('Assinatura do Declarante/Remetente',185,yData+5,{align:'right'});
 faixa('OBSERVAÇÃO:',263);
 pdf.setFont('helvetica','normal');pdf.setFontSize(8.5);
 texto(pdf.splitTextToSize(OBSERVACAO_DECLARACAO,181),14,278);
 return pdf.output('blob');
}
