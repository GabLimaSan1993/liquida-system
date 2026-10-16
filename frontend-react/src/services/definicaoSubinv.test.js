// node --experimental-vm-modules --test src/services/definicaoSubinv.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function carregar(candidatos) {
  const vinculos = [{ imei: 'SEM-DATA', canal: 'B2C' }];
  const consultados = [];
  const supabase = {
    rpc: async (nome) => ({ data: nome === 'assurant_definicao_candidatos' ? candidatos : vinculos }),
    from: (tabela) => ({
      select: () => ({
        in: async (_, imeis) => {
          consultados.push(...imeis);
          return { data: imeis.map(imei => ({ imei, cor: 'BLACK' })) };
        },
        eq: () => ({ limit: async () => ({ data: [{ modelo: 'QA' }] }) }),
      }),
    }),
  };
  const contexto = vm.createContext({ console });
  const modulo = new vm.SourceTextModule(await readFile(new URL('./pedidosB2CService.js', import.meta.url), 'utf8'), { context: contexto });
  await modulo.link(async (specifier) => {
    const exports = specifier.includes('supabase') ? { supabase }
      : specifier.includes('meliValidacao') ? { filtrarMeliFaturaveis: () => [] } : {};
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [nome, valor] of Object.entries(exports)) this.setExport(nome, valor);
    }, { context: contexto });
  });
  await modulo.evaluate();
  return { buscar: modulo.namespace.buscarOpcoesDefinicao, consultados };
}
const item = (imei, data_subinv, extra = {}) => ({ imei, data_subinv, grade: 'BOM', disponivel: true, modelo: 'QA', ...extra });
test('Furb calcula quantidade e FIFO somente com data; vínculo sem data fica apenas na consulta', async () => {
  const { buscar, consultados } = await carregar([
    item('SEM-DATA', null, { vinculo_tipo: 'B2C', disponivel: false }),
    item('VAZIO', ''), item('SEM-CAMPO', undefined),
    item('NOVO', '2026-10-16'), item('ANTIGO', '2026-10-01'),
  ]);
  const r = await buscar('BRZDEV-QA', { id: 'QA-PEDIDO', grade_produto: 'Bom' });
  assert.equal(r.opcoes.length, 1);
  assert.equal(r.opcoes[0].quantidade, 2);
  assert.equal(r.opcoes[0].fifo.imei, 'ANTIGO');
  assert.deepEqual(consultados, ['NOVO', 'ANTIGO']);
  assert.equal(r.vinculosSku[0].imei, 'SEM-DATA');
});
test('Furb retorna zero opções quando todos estão sem data, preservando consulta de vínculos', async () => {
  const { buscar, consultados } = await carregar([item('SEM-DATA', null)]);
  const r = await buscar('BRZDEV-QA', 'Bom');
  assert.equal(r.opcoes.length, 0);
  assert.equal(r.vinculosSku.length, 1);
  assert.equal(consultados.length, 0);
});
