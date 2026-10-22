export const META_ACURACIDADE_INVENTARIO=97;
// The initial physical count remains the reference even after missing items are
// reconciled elsewhere. Only completed counts enter the reported accuracy.
export function calcularAcuracidade(contagens,itens){
 const concluidas=contagens.filter(c=>c.status==='concluida');
 const ids=new Set(concluidas.map(c=>c.id));const avaliados=itens.filter(i=>ids.has(i.contagem_id));
 const conferidos=avaliados.filter(i=>i.veredito==='conferido').length;
 const sobras=avaliados.filter(i=>i.veredito==='sobra').length;
 const conflitos=avaliados.filter(i=>i.veredito==='conflito').length;
 const faltas=avaliados.filter(i=>i.veredito==='falta');
 const reconciliadas=faltas.filter(i=>i.reconciliado_em).length;
 const fantasmas=faltas.length-reconciliadas;
 const denominadorBruto=conferidos+sobras+conflitos+faltas.length;
 const denominadorAjustado=conferidos+sobras+conflitos+fantasmas;
 const problemas=new Set(avaliados.filter(i=>i.veredito!=='conferido').map(i=>i.contagem_id));
 const perfeitos=concluidas.filter(c=>!problemas.has(c.id)).length;
 return {totalEnderecos:contagens.length,concluidas:concluidas.length,conferidos,sobras,conflitos,reconciliadas,fantasmas,perfeitos,
  faltasBrutas:faltas.length,avaliadosBrutos:denominadorBruto,
  acuraciaPecaBruta:denominadorBruto?conferidos/denominadorBruto*100:null,
  acuraciaPeca:denominadorAjustado?conferidos/denominadorAjustado*100:null,
  acuraciaEndereco:concluidas.length?perfeitos/concluidas.length*100:null};
}
export function situacaoMetaAcuracidade(valor){return valor==null?'Sem contagem concluída avaliável':valor>=META_ACURACIDADE_INVENTARIO?'Referência atingida':'Abaixo da referência';}
