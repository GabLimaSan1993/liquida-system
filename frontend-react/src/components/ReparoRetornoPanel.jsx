import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, RefreshCw, ScanLine } from 'lucide-react';
import { supabase } from '../lib/supabase.js';
import { classificacaoLaboratorio } from '../services/laboratorioClassificacao.js';
import RetornoLaboratorioMinutas from './assurant/RetornoLaboratorioMinutas.jsx';

const resultadoLabel = {
  irrecuperavel: 'Scrap / irrecuperável',
  sem_reparo: 'Sem reparo',
  reparado: 'Reparado — exige cosmética'
};

const defeitosLista = valor => Array.isArray(valor)
  ? valor.map(x=>String(x||'').trim()).filter(Boolean) : [];
const chaveDefeito = valor => String(valor||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function alteracoesDefeitos(item) {
  const origem=defeitosLista(item.defeitos_origem);
  const finais=defeitosLista(item.defeitos_atual);
  const origens=new Set(origem.map(chaveDefeito));
  const fim=new Set(finais.map(chaveDefeito));
  return {
    origem,finais,
    adicionados:finais.filter(x=>!origens.has(chaveDefeito(x))),
    removidos:origem.filter(x=>!fim.has(chaveDefeito(x))),
  };
}
const statusLab = {
  concluido:'Concluído — aguardando minuta',
  em_devolucao:'Em devolução — pronto para recebimento',
  devolucao_pendente_warehouse:'Falta no malote — devolução solicitada',
};
const statusLabel = {
  bipado: 'Separado para reparo',
  em_reparo: 'Em reparo',
  retorno_armazenagem: 'Retornou — alocação/Oracle',
  retorno_scrap_oracle: 'Retornou — Oracle scrap'
};

function etapa(item) {
  if (item.status === 'retorno_scrap_oracle') return 'Aguardando Oracle 6 → 1000';
  if (item.status === 'retorno_armazenagem') {
    if (item.resultado_lab === 'reparado' && !item.subinv_destino) return 'Aguardando nova triagem cosmética';
    if (!item.retorno_alocado_em) return 'Aguardando alocação física WMS';
    return item.apto_oracle ? 'Aguardando confirmação Oracle' : item.status_atual || 'Aguardando Oracle';
  }
  if (!item.liberado_laboratorio) return 'Laboratório ainda não liberou retorno';
  return statusLabel[item.status] || item.status;
}

export default function ReparoRetornoPanel({ modo = 'armazenagem' }) {
  const oracle = modo === 'oracle';
  const [itens, setItens] = useState([]);
  const [filtro, setFiltro] = useState('');
  const [pagina, setPagina] = useState(0);
  const [leitura, setLeitura] = useState('');
  const [busy, setBusy] = useState('');
  const [loading, setLoading] = useState(false);
  const [mensagem, setMensagem] = useState('');
  const [erro, setErro] = useState('');
  const inputRef = useRef(null);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const { data, error } = await supabase.rpc(
        oracle ? 'assurant_reparo_retorno' : 'assurant_reparo_retorno_laboratorio',
        { p_acao: oracle ? 'listar_oracle' : 'listar' }
      );
      if (error) throw error;
      setItens(Array.isArray(data) ? data : []);
    } catch (e) { setErro(e.message || 'Não foi possível consultar os retornos.'); }
    finally { setLoading(false); }
  }, [oracle]);
  useEffect(() => { if(oracle)void carregar(); }, [oracle,carregar]);

  async function executar(item) {
    if (busy) return;
    if (!oracle) {
      if (!['em_devolucao','devolucao_pendente_warehouse'].includes(item.status) || !item.liberado_laboratorio) {
        setErro('Este aparelho não está liberado para recebimento físico no Warehouse.');
        return;
      }
      if (!window.confirm('Confirmar chegada física do voucher '+(item.voucher||item.imei)+
        ' ao Warehouse? '+(item.status==='devolucao_pendente_warehouse'
          ? 'Trata-se de item faltante no malote e NÃO recebido pelo Laboratório; não haverá movimentação automática WMS/Oracle.'
          : 'O resultado e os defeitos finais serão preservados.'))) return;
      setBusy(item.id);setErro('');setMensagem('');
      try {
        const {data,error}=await supabase.rpc('assurant_reparo_retorno_laboratorio',{
          p_acao:'receber',p_item_id:item.id,p_origem:item.origem
        });
        if (error) throw error;
        setMensagem('Voucher '+(item.voucher||item.imei)+' recebido. Status no Laboratório: Devolvido ao Warehouse. '+
          (data?.mensagem||data?.etapa||''));
        setLeitura('');
        setPagina(0);
        await carregar();
        inputRef.current?.focus();
      } catch(e){setErro(e.message||'Não foi possível confirmar o recebimento físico.');}
      finally {setBusy('');}
      return;
    }
    const acao = 'confirmar_entrada';
    if (!oracle && !item.liberado_laboratorio) {
      setErro('O laboratório deve concluir o reparo e gerar o romaneio de devolução antes do retorno físico.');
      return;
    }
    if (oracle && !item.apto_oracle) {
      setErro('A movimentação não está liberada: confira a nova cosmética e a alocação WMS.');
      return;
    }
    const destino = item.subinv_destino;
    const referencia = oracle
      ? window.prompt(`Confirme que a movimentação Oracle Sub 6 → ${destino} já foi executada. Informe a referência para o IMEI ${item.imei}:`)
      : null;
    if (oracle && !referencia?.trim()) return;
    const pergunta = oracle
      ? `Confirmar movimentação já executada no Oracle, Sub 6 → ${destino}, IMEI ${item.imei}?`
      : `Confirmar retorno físico do IMEI ${item.imei}? Resultado: ${resultadoLabel[item.resultado_lab] || 'Sem resultado'}.`;
    if (!window.confirm(pergunta)) return;
    setBusy(item.id); setErro(''); setMensagem('');
    try {
      const { data, error } = await supabase.rpc('assurant_reparo_retorno', {
        p_acao: acao, p_item_id: item.id, p_referencia: referencia?.trim() || null
      });
      if (error) throw error;
      setMensagem(oracle
        ? `Movimentação Sub 6 → ${data?.subinv_destino} confirmada no sistema. Referência: ${data?.referencia_oracle}.`
        : `Retorno registrado: ${data?.etapa}. ${data?.subinv_destino ? `Destino Oracle Sub 6 → ${data.subinv_destino}.` : 'A grade será definida após a cosmética.'}`);
      setLeitura('');
      await carregar();
      inputRef.current?.focus();
    } catch (e) { setErro(e.message || 'Não foi possível registrar esta movimentação.'); }
    finally { setBusy(''); }
  }

  const filtrados = useMemo(() => itens.filter(i =>
    [i.imei, i.voucher, i.lote, i.modelo, i.resultado_lab, i.os_numero,i.status,
     ...defeitosLista(i.defeitos_origem),...defeitosLista(i.defeitos_atual)].some(x =>
      String(x || '').toLocaleLowerCase('pt-BR').includes(filtro.toLocaleLowerCase('pt-BR'))
    )), [itens, filtro]);

  function bipar(event) {
    event.preventDefault();
    const codigo = leitura.trim().toUpperCase();
    if (!codigo) return;
    const correspondencias = itens.filter(i =>
      String(i.imei||'').trim().toUpperCase()===codigo ||
      String(i.voucher||'').trim().toUpperCase()===codigo
    );
    if (correspondencias.length !== 1) {
      setErro(correspondencias.length ? 'Mais de um retorno encontrado. Confira o voucher e o IMEI.' : 'IMEI/voucher não encontrado nesta fila. Confira se o laboratório concluiu e liberou o retorno.');
      return;
    }
    executar(correspondencias[0]);
  }

  async function baixarRelatorio() {
    if (busy) return;
    setBusy('relatorio'); setErro('');
    try {
      if (!oracle) {
        if (!itens.length) throw new Error('Nenhum registro em Concluído ou Em devolução.');
        const XLSX=await import('xlsx');
        const linhas=itens.map(i=>{
          const diff=alteracoesDefeitos(i);
          return {
            Voucher:i.voucher||'',IMEI:i.imei||'',Modelo:i.modelo||'',
            'OS laboratório':i.os_numero||'',Origem:i.origem||'',
            'Status laboratório':statusLab[i.status]||i.status,
            'Minuta':i.minuta_numero?'LAB-DEV-'+String(i.minuta_numero).padStart(6,'0'):'',
            'Resultado técnico':resultadoLabel[i.resultado_lab]||'',
            'Defeitos da triagem':diff.origem.join('; '),
            'Defeitos finais do laboratório':diff.finais.join('; '),
            'Defeitos adicionados':diff.adicionados.join('; '),
            'Defeitos removidos':diff.removidos.join('; '),
          };
        });
        const aba=XLSX.utils.json_to_sheet(linhas);
        aba['!autofilter']={ref:aba['!ref']};
        aba['!cols']=Object.keys(linhas[0]).map(k=>({wch:k.includes('Defeitos')?48:24}));
        const wb=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb,aba,'Retorno Laboratorio');
        XLSX.writeFile(wb,'Retorno_Laboratorio_Concluidos_e_Devolucao.xlsx');
        setMensagem('Exportados '+linhas.length+' vouchers da fila do laboratório.');
        return;
      }
      const { data, error } = await supabase.rpc('assurant_reparo_relatorio', { p_inicio: null, p_fim: null });
      if (error) throw error;
      if (!data?.itens?.length) throw new Error('Não existem registros de reparo para exportar.');
      const XLSX = await import('xlsx');
      const linhas = data.itens.map(i => ({
        'Lote': i.lote,
        'Processo': i.origem_lab,
        'IMEI': String(i.imei || ''),
        'Voucher': i.voucher || '',
        'Modelo': i.modelo || '',
        'SKU': i.sku || '',
        'Grade envio': i.grade_envio || '',
        'Status picking': i.status_item,
        'Bipagem saída': i.envio_bipado_em || '',
        'Oracle envio confirmado': i.oracle_envio_confirmado_em || '',
        'Referência Oracle envio': i.oracle_envio_referencia || '',
        'OS laboratório': i.os_numero || '',
        'Resultado laboratório': resultadoLabel[i.resultado_laboratorio] || '',
        'Conclusão laboratório': i.concluido_em || '',
        'Recebimento retorno': i.retorno_recebido_em || '',
        'Nova grade cosmética': i.grade_cosmetica || '',
        'Sub origem retorno': i.resultado_laboratorio ? '6' : '',
        'Sub destino retorno': i.subinv_retorno_destino || '',
        'Situação Oracle retorno': i.status_oracle_retorno,
        'Oracle retorno confirmado': i.status_oracle_retorno === 'confirmado' ? (i.oracle_retorno_confirmado_em || '') : '',
        'Status atual': i.status_atual || ''
      }));
      const planilha = XLSX.utils.json_to_sheet(linhas);
      planilha['!autofilter'] = { ref: planilha['!ref'] };
      planilha['!cols'] = Object.keys(linhas[0]).map(k => ({ wch: /Modelo|Status|Resultado|Processo/.test(k) ? 32 : 22 }));
      const livro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(livro, planilha, 'Envios e Retornos');
      const avulsos = (data.laboratorio_avulsos || []).map(i => ({
        'Origem': 'Laboratório individual — sem confirmação WMS',
        'Voucher': i.voucher || '',
        'IMEI': String(i.imei || ''),
        'Modelo': i.modelo || '',
        'SKU': i.sku || '',
        'Grade origem': i.grade || '',
        'OS laboratório': i.os_numero || i.os_referencia || '',
        'Status laboratório': i.status,
        'Resultado': resultadoLabel[i.resultado] || '',
        'Recebido em': i.recebido_em || '',
        'Concluído em': i.concluido_em || '',
        'Observações': i.observacoes || '',
        'Movimentação física WMS': 'Não comprovada pela importação',
        'Oracle envio/retorno': 'Não confirmado pelo sistema'
      }));
      if (avulsos.length) {
        const abaAvulsos = XLSX.utils.json_to_sheet(avulsos);
        abaAvulsos['!autofilter'] = { ref: abaAvulsos['!ref'] };
        abaAvulsos['!cols'] = Object.keys(avulsos[0]).map(k => ({ wch: /Origem|Modelo|Observações/.test(k) ? 42 : 24 }));
        XLSX.utils.book_append_sheet(livro, abaAvulsos, 'Laboratório sem WMS');
      }
      XLSX.writeFile(livro, 'Historico_Envios_Retornos_Reparos.xlsx');
      setMensagem(`Relatório exportado: ${linhas.length.toLocaleString('pt-BR')} registros vinculados ao picking e ${avulsos.length.toLocaleString('pt-BR')} importações de laboratório em aba separada, sem movimentação WMS comprovada.`);
    } catch (e) { setErro(e.message || 'Erro ao exportar histórico.'); }
    finally { setBusy(''); }
  }


  // Fora da rotina Oracle, a tela de retorno é estritamente por minuta:
  // nada de listar os aparelhos Concluídos antes de gerar o romaneio.
  if (!oracle) return <RetornoLaboratorioMinutas />;

  return <section className="space-y-4 rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-base font-black text-slate-800">{oracle ? 'Retorno de reparo — movimentação Oracle' : 'Retorno do laboratório — bipagem de recebimento'}</h2>
        <p className="mt-1 text-xs text-slate-500">{oracle
          ? 'Fila de transferências prontas para confirmação: Scrap 6 → 1000; sem reparo 6 → 7; reparado 6 → grade da nova triagem cosmética.'
          : 'Bipe IMEI ou voucher após o laboratório concluir e emitir o romaneio. O sistema direciona por resultado, sem liberar o estoque antes do Oracle.'}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={baixarRelatorio} disabled={!!busy} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><Download size={14}/>Relatório de envios e retornos</button>
        <button type="button" onClick={carregar} disabled={loading || !!busy} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"><RefreshCw size={14}/>Atualizar</button>
      </div>
    </div>
    <form onSubmit={bipar} className="flex flex-wrap gap-2">
      <input ref={inputRef} value={leitura} onChange={e => setLeitura(e.target.value)} autoComplete="off"
        placeholder="Bipar IMEI ou voucher do retorno" aria-label="Bipar retorno reparo"
        className="min-w-64 flex-1 rounded-xl border border-slate-200 px-3 py-3 font-mono text-sm" />
      <button disabled={!!busy || !leitura.trim()} className="flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><ScanLine size={16}/>{oracle ? 'Conferir e confirmar Oracle' : 'Receber retorno'}</button>
    </form>
    {erro && <p className="rounded-xl bg-rose-50 p-3 text-sm text-red-700" role="alert">{erro}</p>}
    {mensagem && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-green-800" role="status">{mensagem}</p>}
    {loading && <p className="text-xs text-slate-500">Carregando retornos...</p>}
    <input value={filtro} onChange={e => setFiltro(e.target.value)}
      placeholder="Filtrar IMEI, voucher, OS, resultado ou lote"
      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" />
    <div className="overflow-x-auto rounded-xl border">
      <table className="min-w-[1020px] w-full text-left text-xs">
        <thead><tr className="border-b bg-slate-50">{['IMEI / voucher','Lote / OS','Classificação','Sub Oracle','Etapa atual','Ação'].map(h=><th key={h} className="p-3">{h}</th>)}</tr></thead>
        <tbody>{filtrados.map(i => <tr key={i.id} className="border-b">
          <td className="p-3"><span className="font-mono font-bold">{i.imei}</span><p className="mt-1">{i.voucher || '—'}</p></td>
          <td className="p-3">{i.lote}<p className="mt-1 text-slate-500">OS {i.os_numero || '—'}</p></td>
          <td className="p-3 font-semibold">{resultadoLabel[i.resultado_lab] || 'Aguardando conclusão'}</td>
          <td className="whitespace-nowrap p-3 font-semibold">6 → {i.subinv_destino || 'Após cosmética'}</td>
          <td className="p-3">{etapa(i)}<p className="mt-1 text-slate-500">{i.status_atual || ''}</p></td>
          <td className="p-3">{oracle
            ? <button type="button" onClick={() => executar(i)} disabled={!!busy || !i.apto_oracle}
                className="rounded-lg bg-violet-700 px-3 py-2 font-bold text-white disabled:opacity-40">Confirmar Oracle</button>
            : i.status === 'retorno_armazenagem' || i.status === 'retorno_scrap_oracle'
              ? <span className="text-amber-700">Retorno registrado</span>
              : <button type="button" onClick={() => executar(i)}
                disabled={!!busy || !i.liberado_laboratorio}
                className="rounded-lg bg-violet-700 px-3 py-2 font-bold text-white disabled:opacity-40">Receber</button>}
          </td>
        </tr>)}</tbody>
      </table>
      {!loading && filtrados.length === 0 && <p className="p-4 text-sm text-slate-500">Nenhum aparelho nesta etapa.</p>}
    </div>
    <p className="text-xs text-slate-500">A bipagem confirma o recebimento físico. A alocação exige endereço WMS e conferência; a transferência Oracle só é marcada como concluída após informar a referência real da movimentação.</p>
  </section>;
}
