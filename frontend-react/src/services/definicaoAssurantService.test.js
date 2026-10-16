// node --experimental-vm-modules --test src/services/definicaoAssurantService.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregar() {
  const chamadas = [];
  const supabase = { rpc: async (nome, parametros) => {
    chamadas.push({ nome, parametros });
    return { data: { ok: true, skuBase: parametros.p_sku, opcoes: [] } };
  } };
  const contexto = vm.createContext({ console });
  const modulo = new vm.SourceTextModule(await readFile(new URL('./definicaoAssurantService.js', import.meta.url), 'utf8'), { context: contexto });
  await modulo.link(async () => new vm.SyntheticModule(['supabase'], function () {
    this.setExport('supabase', supabase);
  }, { context: contexto }));
  await modulo.evaluate();
  return { service: modulo.namespace, chamadas };
}
test('consulta da Assurant envia o SKU digitado em cada busca', async () => {
  const { service, chamadas } = await carregar();
  await service.consultarOpcoesAssurant('pedido-1', ' SKU-ORIGINAL ');
  const nova = await service.consultarOpcoesAssurant('pedido-1', ' SKU-SUBSTITUTO ');
  assert.equal(chamadas.length, 2);
  assert.equal(chamadas[0].nome, 'b2c_definicao_opcoes');
  assert.equal(chamadas[0].parametros.p_sku, 'SKU-ORIGINAL');
  assert.equal(chamadas[1].parametros.p_pedido_id, 'pedido-1');
  assert.equal(chamadas[1].parametros.p_sku, 'SKU-SUBSTITUTO');
  assert.equal(nova.skuBase, 'SKU-SUBSTITUTO');
});
test('aprovação usa o SKU e o vínculo da alternativa selecionada', async () => {
  const { service, chamadas } = await carregar();
  await service.aprovarDefinicaoAssurant('pedido-1', {
    sku: 'SKU-SUBSTITUTO', grade: 'Muito Bom', cor: 'WHITE',
    vinculo_tipo: 'B2C', vinculo_referencia: 'pedido-origem',
  }, true, ' troca de modelo ');
  const { nome, parametros: p } = chamadas[0];
  assert.equal(nome, 'b2c_assurant_aprovar_definicao');
  assert.equal(p.p_sku, 'SKU-SUBSTITUTO');
  assert.equal(p.p_grade, 'Muito Bom');
  assert.equal(p.p_cor, 'WHITE');
  assert.equal(p.p_vinculo_referencia, 'pedido-origem');
  assert.equal(p.p_upgrade_confirmado, true);
  assert.equal(p.p_observacoes, 'troca de modelo');
});
