import JsBarcode from 'jsbarcode';

const escaparHtml = valor => String(valor ?? '').replace(/[&<>"']/g, c => (
  {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]
));

/** Etiqueta 50 x 30 mm como o Recebimento de Lojas, apenas voucher em CODE128. */
export function htmlEtiquetaVoucherOnline(voucher, svg) {
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" />' +
    '<title>Voucher '+escaparHtml(voucher)+'</title><style>' +
    '@page { size: 50mm 30mm; margin: 0; }' +
    '* { box-sizing: border-box; }' +
    'html, body { margin: 0; width: 50mm; height: 30mm; overflow: hidden; }' +
    'body { font-family: Arial, sans-serif; }' +
    '.etiqueta { display:flex; flex-direction:column; align-items:center; justify-content:center;' +
    'width:50mm; height:30mm; padding:1.2mm 1.5mm; }' +
    'svg { display:block; max-width:47mm; width:100%; max-height:27mm; }' +
    '</style></head><body><div class="etiqueta">'+svg+'</div>' +
    '<script>window.onload=function(){setTimeout(function(){window.focus();window.print();},100);};' +
    'window.onafterprint=function(){window.close();};</script></body></html>';
}

/** Abrir ainda durante o clique evita bloqueio do popup depois de aguardar o RPC. */
export function prepararJanelaEtiquetaVoucherOnline() {
  const janela=window.open('','_blank','width=420,height=280');
  if(janela) {
    janela.document.write('<!doctype html><html><meta charset="utf-8"><body style="font-family:Arial;padding:20px">Confirmando vinculação...</body></html>');
    janela.document.close();
  }
  return janela;
}

export function fecharJanelaEtiquetaVoucherOnline(janela) {
  if(janela && !janela.closed) janela.close();
}

/** Retorna falso caso popup esteja bloqueado, sem comprometer o vínculo salvo. */
export function imprimirEtiquetaVoucherOnline(voucher, janelaExistente=null) {
  const v=String(voucher??'').trim().toUpperCase();
  if(!v) throw new Error('Voucher não informado para impressão da etiqueta.');
  const janela=janelaExistente||prepararJanelaEtiquetaVoucherOnline();
  if(!janela||janela.closed) return false;
  try {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    JsBarcode(svg,v,{
      format:'CODE128',width:2,height:65,displayValue:true,
      fontSize:15,font:'Arial',fontOptions:'bold',margin:3,textMargin:3,
      lineColor:'#000000',background:'#ffffff'
    });
    janela.document.open();
    janela.document.write(htmlEtiquetaVoucherOnline(v,svg.outerHTML));
    janela.document.close();
    return true;
  }catch(error){
    fecharJanelaEtiquetaVoucherOnline(janela);
    throw error;
  }
}
