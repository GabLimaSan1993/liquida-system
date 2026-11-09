const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[ch]));

const dataBR = value => value
  ? new Date(value).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
  : '—';

function abrirImpressao(titulo, corpo, estilos = '') {
  const janela = window.open('', '_blank', 'width=1060,height=780');
  if (!janela) throw new Error('Autorize janelas pop-up para imprimir os documentos de reparo.');
  janela.document.open();
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
  <title>${escapeHtml(titulo)}</title>
  <style>
   body{font:12px Arial,sans-serif;color:#192238;margin:28px}
   h1{font-size:23px;margin:10px 0}h2{font-size:16px}
   .kicker{color:#5942a8;font-weight:bold;letter-spacing:1.5px}
   .meta{display:flex;gap:25px;padding:14px 0;border-top:2px solid #222;border-bottom:2px solid #222}
   .meta div{flex:1}p{margin:4px 0}
   table{width:100%;border-collapse:collapse;margin-top:18px}
   td,th{border:1px solid #d5d8de;padding:7px 5px;text-align:left;vertical-align:top}
   th{background:#ececf5}
   .sign{display:flex;gap:40px;margin-top:85px}.sign div{flex:1;text-align:center;border-top:1px solid #444;padding-top:7px}
   .note{color:#526079;font-size:11px;margin-top:20px}
   @page{size:A4 landscape;margin:12mm}
   @media print{body{margin:0}}
   ${estilos}
  </style></head><body>${corpo}
  <script>window.addEventListener('load',()=>{window.focus();window.print()})<\/script>
  </body></html>`);
  janela.document.close();
}

export function imprimirMinutaReparo(pedido, itens, processo) {
  if (!pedido?.id) throw new Error('Selecione o pedido de reparo.');
  const separados = (itens || []).filter(i => ['bipado', 'em_reparo'].includes(i.status));
  if (!separados.length) throw new Error('Não há produtos bipados neste pedido. A minuta inclui apenas itens efetivamente separados.');
  const linhas = separados.map((i, index) => `
    <tr><td>${index + 1}</td><td>${escapeHtml(i.imei)}</td>
    <td>${escapeHtml(i.voucher || '—')}</td>
    <td>${escapeHtml(i.modelo || i.sku || 'Modelo não informado')}</td>
    <td>${escapeHtml(i.grade || '—')}</td>
    <td>${escapeHtml(i.local_wms || '—')}</td></tr>`).join('');
  abrirImpressao('Minuta de envio ao laboratório', `
    <div class="kicker">LIQUIDA SYSTEM · TRANSFERÊNCIA INTERNA</div>
    <h1>Minuta de envio ao laboratório</h1>
    <div class="meta"><div><p><b>Processo:</b> ${escapeHtml(processo)}</p>
      <p><b>Lote:</b> ${escapeHtml(pedido.lote)}</p><p><b>Destino:</b> Laboratório de reparos</p></div>
      <div><p><b>Emissão:</b> ${escapeHtml(dataBR(new Date()))}</p>
      <p><b>Quantidade efetivamente bipada:</b> ${separados.length}</p>
      <p><b>Sem faturamento:</b> Sim</p></div></div>
    <table><thead><tr><th>#</th><th>IMEI / Série</th><th>Voucher</th><th>Descrição do produto</th><th>Grade origem</th><th>Local WMS</th></tr></thead>
    <tbody>${linhas}</tbody></table>
    <div class="sign"><div>Expedição / Warehouse</div><div>Transportador</div><div>Recebimento / Laboratório</div></div>
    <p class="note">Documento interno de conferência; não substitui movimentação Oracle nem documento fiscal. Itens bloqueados ou não bipados foram excluídos.</p>
  `);
}

export function imprimirEtiquetasCaixasReparo(pedido, processo, caixas = 1) {
  if (!pedido?.id) throw new Error('Selecione o pedido de reparo.');
  const quantidade = Number(caixas);
  if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > 100) {
    throw new Error('Informe entre 1 e 100 caixas.');
  }
  const etiquetas = Array.from({ length: quantidade }, (_, n) => `
    <div class="etiqueta">
      <div class="kicker">LIQUIDA SYSTEM · LABORATÓRIO</div>
      <h1>${escapeHtml(processo)}</h1>
      <p><b>Pedido:</b> ${escapeHtml(pedido.lote)}</p>
      <p><b>Caixa:</b> ${n + 1} de ${quantidade}</p>
      <p><b>Destino:</b> LABORATÓRIO DE REPAROS</p>
      <p class="aviso">Conferir IMEIs e descrições na minuta.</p>
    </div>`).join('');
  abrirImpressao('Etiquetas de caixas - reparo', `
    <div class="grade">${etiquetas}</div>
  `, `
    @page{size:A4 portrait;margin:10mm}
    .grade{display:grid;grid-template-columns:1fr 1fr;gap:12mm}
    .etiqueta{border:2px solid #222;min-height:98mm;padding:9mm;box-sizing:border-box;page-break-inside:avoid;break-inside:avoid}
    .etiqueta h1{font-size:21px;text-transform:uppercase;overflow-wrap:anywhere;margin:9mm 0}
    .etiqueta p{margin:5mm 0;font-size:12px}
    .aviso{border-top:1px dashed #aaa;padding-top:5mm;font-size:10px!important}
  `);
}
