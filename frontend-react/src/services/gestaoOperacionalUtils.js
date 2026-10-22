// Each stage keeps its own unit. Dispatch volumes are never treated as devices.
export function compararMetas(metas,dados){
 return metas.map(m=>{const linhas=dados.filter(d=>d.periodo===m.dia&&d.etapa===m.etapa);const realizado=linhas.reduce((s,d)=>s+Number(d.producao||0),0);return {...m,realizado,desvio:realizado-m.quantidade,atingimento:m.quantidade>0?realizado/m.quantidade*100:null};});
}
export function produtividadeDiaria(efetivo,dados){
 const pessoas=new Map();
 for(const e of efetivo)pessoas.set(`${e.dia}|${e.colaborador_id}`,{...e,itens:0,volumes:0,retrabalho:0,informado:true});
 const semResponsavel=new Map();
 for(const d of dados){
  const n=Number(d.producao||0),r=Number(d.retrabalho||0);
  if(!n&&!r)continue;
  if(!d.colaborador_id){const s=semResponsavel.get(d.periodo)||{dia:d.periodo,itens:0,volumes:0};s[d.unidade==='volumes'?'volumes':'itens']+=n;semResponsavel.set(d.periodo,s);continue;}
  const k=`${d.periodo}|${d.colaborador_id}`;
  const p=pessoas.get(k)||{dia:d.periodo,colaborador_id:d.colaborador_id,nome:d.colaborador,equipe:'Sem equipe informada',presente:null,horas:null,itens:0,volumes:0,retrabalho:0,informado:false};
  p[d.unidade==='volumes'?'volumes':'itens']+=n;p.retrabalho+=r;pessoas.set(k,p);
 }
 const linhas=[...pessoas.values()].sort((a,b)=>b.dia.localeCompare(a.dia)||a.equipe.localeCompare(b.equipe)||a.nome.localeCompare(b.nome));
 const equipes=new Map();
 for(const p of linhas){const k=p.dia+'|'+p.equipe;const e=equipes.get(k)||{dia:p.dia,equipe:p.equipe,presentes:0,semPresenca:0,itens:0,volumes:0,horas:0,horasFaltantes:0,inconsistentes:0};e.itens+=p.itens;e.volumes+=p.volumes;if(p.presente===true){e.presentes++;if(p.horas===null)e.horasFaltantes++;else e.horas+=Number(p.horas);}if(!p.informado)e.semPresenca++;if(p.presente===false&&(p.itens||p.volumes))e.inconsistentes++;equipes.set(k,e);}
 return {linhas,equipes:[...equipes.values()],semResponsavel:[...semResponsavel.values()]};
}
