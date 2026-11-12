import { supabase } from '../lib/supabase.js';

async function executar(acao, campos={}) {
  const { data, error } = await supabase.rpc('assurant_reparo_lab_devolucao', {
    p_acao: acao,
    p_itens: campos.itens ?? null,
    p_todos: campos.todos ?? false,
    p_manifesto_id: campos.manifestoId ?? null
  });
  if (error) throw new Error(error.message || 'Falha na devolução do laboratório.');
  if (!data?.ok) throw new Error('A emissão não foi confirmada pelo sistema.');
  return data;
}

export const listarMinutasLaboratorio = () => executar('listar');
export const detalharMinutaLaboratorio = manifestoId => executar('detalhar', { manifestoId });
export const gerarMinutaLaboratorio = (itens, todos=false) => executar('gerar', { itens, todos });

const esc = valor => String(valor ?? '').replace(/[&<>"']/g, ch => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
}[ch]));
const dataBR = valor => valor ? new Date(valor).toLocaleString('pt-BR', {
  timeZone:'America/Sao_Paulo'
}) : '—';

export function imprimirMinutaLaboratorio(dados, janela) {
  if (!janela || janela.closed) throw new Error('Permita janelas pop-up para imprimir a minuta.');
  const rom=dados?.romaneio, itens=dados?.itens||[];
  if (!rom?.id || !itens.length) throw new Error('Minuta sem itens.');
  const nome='LAB-DEV-'+String(rom.numero).padStart(6,'0');
  const tabela=itens.map((i,k) =>
    '<tr><td>'+ (k+1) +'</td><td>'+esc(i.voucher)+'</td><td>'+
    esc(i.imei||'A validar')+'</td><td>'+esc(i.modelo||'A conferir')+
    '</td><td>'+esc(i.os_numero||'—')+'</td><td>'+
    esc(i.resultado==='reparado'?'Reparado':i.resultado==='sem_reparo'?'Não reparado desbloqueado':i.resultado==='irrecuperavel'?'Scrap / bloqueado':'—')+
    '</td></tr>'
  ).join('');
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>'+esc(nome)+'</title>'+
   '<style>body{font:12px Arial,sans-serif;color:#182033;margin:24px}h1{font-size:22px;margin:6px 0}.kicker{font-weight:bold;color:#5b3aa0;letter-spacing:1.5px}.meta{display:flex;justify-content:space-between;gap:30px;border-top:2px solid #222;border-bottom:2px solid #222;padding:12px 0;margin-top:12px}.meta p{margin:5px 0}table{width:100%;border-collapse:collapse;margin-top:16px}th,td{border:1px solid #cbd0db;padding:6px;text-align:left;vertical-align:top;font-size:10px}th{background:#eee}.ass{display:flex;gap:38px;margin-top:60px}.ass div{flex:1;border-top:1px solid #333;padding-top:7px;text-align:center}.note{margin-top:15px;font-size:10px;color:#555}@page{size:A4 landscape;margin:12mm}@media print{body{margin:0}}</style></head><body>'+
   '<div class="kicker">LIQUIDA SYSTEM · TRANSFERÊNCIA INTERNA</div><h1>Minuta de devolução ao Warehouse</h1>'+
   '<div class="meta"><div><p><b>Número:</b> '+esc(nome)+'</p><p><b>Origem:</b> Laboratório de Reparos</p><p><b>Destino:</b> Warehouse</p></div>'+
   '<div><p><b>Emissão:</b> '+esc(dataBR(rom.criado_em))+'</p><p><b>Emitido por:</b> '+esc(rom.criado_por_nome||'Laboratório')+'</p><p><b>Total de aparelhos:</b> '+itens.length+'</p></div></div>'+
   '<table><thead><tr><th>#</th><th>Voucher</th><th>IMEI / série</th><th>Aparelho</th><th>OS</th><th>Resultado</th></tr></thead><tbody>'+tabela+'</tbody></table>'+
   '<div class="ass"><div>Entrega · Laboratório</div><div>Transporte / conferência</div><div>Recebimento · Warehouse</div></div>'+
   '<p class="note">Documento de transferência interna. Não é documento fiscal. A emissão apenas registra o envio administrativo; o recebimento físico deverá ser conferido e confirmado pelo Warehouse. Não altera o WMS ou o Oracle automaticamente.</p>'+
   '<script>window.addEventListener("load",()=>{window.focus();window.print()})<\\/script></body></html>';
  janela.document.open();
  janela.document.write(html);
  janela.document.close();
}
