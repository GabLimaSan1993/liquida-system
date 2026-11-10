import { useRef,useState } from 'react';
import { FileSpreadsheet,UploadCloud,CheckCircle2 } from 'lucide-react';
import { importarGrvAtendimentoOnline } from '../../services/tradeinOnlineGrvImportService.js';

/** Recebe os relatórios GRV Atendimento em seu formato de exportação diário. */
export default function ImportarGrvAtendimentoOnline() {
 const input=useRef(null);
 const [importando,setImportando]=useState(false);
 const [progresso,setProgresso]=useState('');
 const [erro,setErro]=useState('');
 const [sucesso,setSucesso]=useState('');
 async function selecionarArquivo(e) {
   const file=e.target.files?.[0];
   e.target.value='';
   if(!file||importando)return;
   setErro('');setSucesso('');setProgresso('Lendo planilha...');setImportando(true);
   try{
     const r=await importarGrvAtendimentoOnline(file,p=>
       setProgresso(p.feitos.toLocaleString('pt-BR')+' / '+p.total.toLocaleString('pt-BR')+' registros'));
     setSucesso(r.feitos.toLocaleString('pt-BR')+' pedidos do GRV Atendimento importados/atualizados. O preenchimento automático já consulta esta base por voucher.');
   }catch(err){setErro(err.message||'Erro ao importar GRV Atendimento.');}
   finally{setImportando(false);setProgresso('');}
 }
 return <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
   <div className="flex items-start gap-3">
     <div className="rounded-xl bg-violet-100 p-2.5 text-violet-700"><FileSpreadsheet size={19}/></div>
     <div>
       <h3 className="text-xs font-black text-violet-950">Atualização diária — GRV Atendimento</h3>
       <p className="mt-1 max-w-[650px] text-[11px] leading-relaxed text-violet-800">
         Importe o relatório GRV Atendimento (.xlsx) para preencher automaticamente nome, CPF, endereço, cidade, UF, CEP e valor da declaração por número do pedido. O bairro só virá preenchido quando constar na base. O peso permanece manual.
       </p>
       {progresso&&<p className="mt-2 text-xs font-bold text-violet-900">{progresso}</p>}
       {sucesso&&<p className="mt-2 flex items-center gap-1 text-xs font-bold text-emerald-800"><CheckCircle2 size={14}/>{sucesso}</p>}
       {erro&&<p className="mt-2 text-xs font-bold text-rose-700" role="alert">{erro}</p>}
     </div>
   </div>
   <input ref={input} type="file" accept=".xlsx,.xls" onChange={selecionarArquivo} className="hidden" aria-label="Importar GRV Atendimento"/>
   <button type="button" disabled={importando} onClick={()=>input.current?.click()}
      className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-violet-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-violet-800 disabled:opacity-50">
     <UploadCloud size={16}/>{importando?'Importando...':'Importar GRV Atendimento'}
   </button>
 </div>;
}
