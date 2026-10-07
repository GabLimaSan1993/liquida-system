import { useState } from 'react';
import { ClipboardCheck, FileSpreadsheet } from 'lucide-react';
import DefinicaoProdutoAssurantV2 from './DefinicaoProdutoAssurantV2.jsx';
import RelatorioDefinicaoAssurant from './RelatorioDefinicaoAssurant.jsx';

export default function DefinicaoAssurantV2Page() {
  const [aba, setAba] = useState('fila');
  return <div className="mx-auto min-w-0 max-w-7xl space-y-5 p-4 sm:p-6">
    <div><p className="text-xs font-bold uppercase tracking-wider text-violet-700">B2C • Decisão comercial</p><h1 className="mt-1 text-2xl font-black text-slate-900">Aguardando definição · Assurant</h1><p className="mt-1 text-sm text-slate-500">Pedidos encaminhados pela Liquida após a tentativa de alocação. Escolha a alternativa por cor e grade e aprove o upgrade quando necessário.</p></div>
    <div className="flex flex-wrap gap-2">{[['fila', 'Fila da Assurant'], ['relatorio', 'Relatório por período']].map(([key, label]) => <button key={key} type="button" onClick={() => setAba(key)} className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold ${aba === key ? 'bg-[#211136] text-white' : 'border border-slate-200 bg-white text-slate-600'}`}>{key === 'fila' ? <ClipboardCheck size={16} /> : <FileSpreadsheet size={16} />}{label}</button>)}</div>
    {aba === 'fila' ? <DefinicaoProdutoAssurantV2 etapa="assurant" /> : <RelatorioDefinicaoAssurant />}
  </div>;
}
