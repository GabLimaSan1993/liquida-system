export const ETAPAS_BRANCA = ['Recebimento','Triagem','Reparo','Bancada de Testes','Higienização','Qualidade'];
export const CORES_ETAPAS_BRANCA = ['#64748b','#7c3aed','#2563eb','#0891b2','#0d9488','#16a34a'];
export const normalizar = v => String(v ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ');
export const diaBrasilia = value => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
const horaBrasilia = value => new Intl.DateTimeFormat('en-GB',{timeZone:'America/Sao_Paulo',hour:'2-digit',hourCycle:'h23'}).format(new Date(value));
const iso = d => d.toISOString().slice(0,10);
export function limitesPeriodo(f) {
  if(f.modo==='dia') return {inicio:f.dia,fim:f.dia};
  if(f.modo==='mes') {const [y,m]=f.mes.split('-').map(Number);return {inicio:f.mes+'-01',fim:iso(new Date(Date.UTC(y,m,0)))};}
  if(f.modo==='ano') return {inicio:f.ano+'-01-01',fim:f.ano+'-12-31'};
  if(f.modo==='semana') {
    const [y,w]=f.semana.split('-W').map(Number), jan4=new Date(Date.UTC(y,0,4));
    jan4.setUTCDate(jan4.getUTCDate()-((jan4.getUTCDay()+6)%7)+(w-1)*7);
    const fim=new Date(jan4);fim.setUTCDate(fim.getUTCDate()+6);return {inicio:iso(jan4),fim:iso(fim)};
  }
  return {inicio:f.inicio,fim:f.fim};
}
export function semanaISO(dia) {
 const d=new Date(dia+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+4-(d.getUTCDay()||7));
 const ano=d.getUTCFullYear(), n=Math.ceil((((d-new Date(Date.UTC(ano,0,1)))/86400000)+1)/7);
 return `${ano}-W${String(n).padStart(2,'0')}`;
}
export function grupoTemporal(dia,grupo) {
 if(grupo==='mes')return dia.slice(0,7);if(grupo==='ano')return dia.slice(0,4);if(grupo==='semana')return semanaISO(dia);return dia;
}
const noPeriodo=(data,f)=>{const d=diaBrasilia(data);return d>=f.inicio&&d<=f.fim;};
const terminal=s=>['finalizado','concluido','expedido','cancelado','scrap'].includes(normalizar(s));
const importado=os=>/import|carga|aging/i.test(os.criado_por||'');
export function areaLinhaBranca(categoria) {
 const c=normalizar(categoria);
 if(/lav|secadora/.test(c))return 'Lavadoras';
 if(/refriger|geladeira|freezer|adega|cervejeira|frigobar|expositor/.test(c))return 'Refrigeração';
 if(/ar.condicionado|climatiza/.test(c))return 'Climatização';
 return 'Outros / Portáteis';
}
export function referenciaRecebimentoBranca(os) {
 const criada=Boolean(os.created_at)&&Number.isFinite(Date.parse(os.created_at));
 // Na base importada, dt_entrada preserva o dia original de abertura da OS.
 // created_at representa a inclusão no sistema e só fornece horário para cadastros operacionais.
 const abertura=os.dt_entrada||(!importado(os)&&criada?diaBrasilia(os.created_at):null);
 if(!abertura||!Number.isFinite(Date.parse(abertura+'T00:00:00-03:00')))return null;
 const horaConhecida=!importado(os)&&criada&&diaBrasilia(os.created_at)===abertura;
 return {data:horaConhecida?os.created_at:abertura+'T00:00:00-03:00',horaConhecida};
}
function entradaMs(os) {
 const referencia=referenciaRecebimentoBranca(os);
 return referencia?Date.parse(referencia.data):null;
}
export function montarEventosBranca(base) {
 const mapa=new Map(base.os.map(o=>[String(o.id),o])), eventos=[];
 function add(row,etapa,data,tecnico,fonte,resultado='concluido',minutos=null,area=etapa,horaConhecida=true) {
  const os=mapa.get(String(row.os_id??row.id));if(!os||!data||!Number.isFinite(Date.parse(data)))return;
  eventos.push({id:`${fonte}:${row.id}`,os_id:os.id,numero_os:os.numero_os,etapa,area,data,tecnico:String(tecnico||'Sem técnico identificado').trim(),resultado,minutos,fonte,os,horaConhecida});
 }
 base.os.forEach(os=>{
  const referencia=referenciaRecebimentoBranca(os);if(!referencia)return;
  add(os,'Recebimento',referencia.data,importado(os)?null:os.criado_por,'recebimento','Referência: abertura da OS',null,'Recebimento',referencia.horaConhecida);
 });
 const ciclos=base.ciclos||[];
 const falhaPosReparo=t=>ciclos.some(c=>String(c.os_id)===String(t.os_id)&&c.etapa_teste==='pos_reparo'&&c.status==='enviado_reparo'&&c.concluido_em&&Math.abs(Date.parse(c.concluido_em)-Date.parse(t.created_at))<=120000);
 (base.triagens||[]).forEach(t=>add(t,falhaPosReparo(t)?'Bancada de Testes':'Triagem',t.created_at,t.triado_por,'triagem',falhaPosReparo(t)?'reprovado':t.precisa_reparo===true?'reparo':t.precisa_reparo===false?'aprovado':'sem_resultado'));
 (base.triagensLegado||[]).forEach(t=>{const destino=normalizar(t.destino_pos_triagem);add(t,'Triagem',t.dt_triagem||t.created_at,t.triado_por,'triagem_legado',/reparo/.test(destino)?'reparo':/scrap|conden/.test(destino)?'condenado':/limpeza|higien|aprov/.test(destino)?'aprovado':'sem_resultado');});
 (base.execucoes||[]).filter(t=>t.dt_fim).forEach(t=>{
  const area=normalizar(t.area_execucao),etapa=/triagem/.test(area)?'Triagem':/bancada|teste final/.test(area)?'Bancada de Testes':/limpeza|higien/.test(area)?'Higienização':/qualidade/.test(area)?'Qualidade':'Reparo';
  add(t,etapa,t.dt_fim,t.tecnico,'reparo',t.condenado?'condenado':t.aprovado===false?'reprovado':'concluido',t.dt_inicio?Math.max(0,(Date.parse(t.dt_fim)-Date.parse(t.dt_inicio))/60000):null,etapa==='Reparo'?(t.area_execucao||'Reparo'):etapa);
 });
 ciclos.filter(c=>c.concluido_em && (c.etapa_teste==='pos_reparo'||c.status==='enviado_reparo'||c.status==='reprovado'||(Number(c.numero_ciclo)===2&&c.resultado==='aprovado'))).forEach(c=>{
  const anteriores=c.etapa_teste==='triagem'?ciclos.filter(a=>String(a.os_id)===String(c.os_id)&&a.etapa_teste==='triagem'&&Number(a.numero_ciclo)===1&&a.concluido_em&&a.concluido_em<=c.iniciado_em).sort((a,b)=>b.concluido_em.localeCompare(a.concluido_em)):[];
  const segundos=Number(c.tempo_executado_segundos||0)+Number(anteriores[0]?.tempo_executado_segundos||0);
  const resultado=c.status==='enviado_reparo'?(c.etapa_teste==='triagem'?'reparo':'reprovado'):c.status==='reprovado'?'condenado':c.resultado||'concluido';
  add(c,c.etapa_teste==='triagem'?'Triagem':'Bancada de Testes',c.concluido_em,c.operador,'ciclo',resultado,segundos/60);
 });
 const testeComCiclo=(osId,data)=>ciclos.some(c=>String(c.os_id)===String(osId)&&c.etapa_teste==='pos_reparo'&&c.concluido_em&&c.concluido_em<=data&& !ciclos.some(proximo=>String(proximo.os_id)===String(osId)&&proximo.etapa_teste==='pos_reparo'&&proximo.iniciado_em>c.iniciado_em&&proximo.iniciado_em<=data));
 (base.eventos||[]).filter(e=>e.etapa!=='Bancada de Testes'||!testeComCiclo(e.os_id,e.realizado_em)).forEach(e=>add(e,e.etapa,e.realizado_em,e.tecnico,'evento',e.resultado));
 // Históricos só completam lacunas com uma transição real de etapa e executor conhecido.
 (base.historico||[]).forEach(h=>{
  const os=mapa.get(String(h.os_id));if(!os)return;
  let etapa, tecnico,resultado='aprovado';
  if(['Limpeza','Higienização'].includes(h.status_anterior)&&h.status_novo==='Qualidade'){etapa='Higienização';tecnico=os.tecnico_limpeza;}
  else if(h.status_anterior==='Qualidade'&&['Concluído','Concluido','Finalizado','Aprovado','Em reparo','Triado','Limpeza'].includes(h.status_novo)){etapa='Qualidade';tecnico=os.tecnico_qualidade;resultado=['Em reparo','Triado','Limpeza'].includes(h.status_novo)?'reprovado':'aprovado';}
  else if(['Bancada de Testes','Em teste final'].includes(h.status_anterior)&&['Aprovado','Limpeza','Higienização','Em reparo','Triado'].includes(h.status_novo)){etapa='Bancada de Testes';tecnico=os.tecnico_bancada;resultado=['Em reparo','Triado'].includes(h.status_novo)?'reprovado':'aprovado';}
  if(etapa&&tecnico&&!/import/i.test(tecnico)&& !(etapa==='Bancada de Testes'&&testeComCiclo(h.os_id,h.created_at))) add(h,etapa,h.created_at,tecnico,'historico',resultado);
 });
 const vistos=[], prioridades={evento:0,ciclo:1,triagem:2,triagem_legado:3,reparo:1,historico:5,recebimento:1};
 for(const e of eventos.sort((a,b)=>(prioridades[a.fonte]??9)-(prioridades[b.fonte]??9))){
  if(vistos.some(v=>String(v.os_id)===String(e.os_id)&&v.etapa===e.etapa&&v.area===e.area&&v.fonte!==e.fonte&&Math.abs(Date.parse(v.data)-Date.parse(e.data))<=120000))continue;
  vistos.push(e);
 }
 const repeticoes=new Map();
 return vistos.sort((a,b)=>a.data.localeCompare(b.data)).map(e=>{
  const chave=`${e.os_id}|${e.etapa}|${e.area}`, anterior=repeticoes.get(chave)||0;repeticoes.set(chave,anterior+1);
  const entrada=entradaMs(e.os), horas=entrada===null?null:(Date.parse(e.data)-entrada)/3600000;
  return {...e,retrabalho:anterior>0,lead_horas:horas!==null&&horas>=0?horas:null,dia:diaBrasilia(e.data),hora:e.horaConhecida?horaBrasilia(e.data):null};
 });
}
function corresponde(os,f) {
 return ['marca','modelo','fornecedor','categoria'].every(k=>!f[k]||normalizar(os[k])===normalizar(f[k]))&&(!f.area||areaLinhaBranca(os.categoria)===f.area);
}
const media=values=>values.length?values.reduce((s,n)=>s+n,0)/values.length:null;
export function resumirGestaoBranca(base,f,agora=Date.now()) {
 const todos=montarEventosBranca(base), eventos=todos.filter(e=>corresponde(e.os,f)&&noPeriodo(e.data,f)&&(!f.tecnico||normalizar(e.tecnico)===normalizar(f.tecnico))&&(!f.etapa||e.etapa===f.etapa));
 const osMap=new Map(base.os.map(o=>[String(o.id),o]));
 const consumos=(base.consumos||[]).filter(c=>osMap.has(String(c.os_id))&&corresponde(osMap.get(String(c.os_id)),f)&&noPeriodo(c.utilizado_em,f)&&(!f.tecnico||normalizar(c.tecnico)===normalizar(f.tecnico))).map(c=>({...c,os:osMap.get(String(c.os_id)),total:c.custo_unitario===null||c.custo_unitario===undefined?null:Number(c.quantidade)*Number(c.custo_unitario)}));
 const totaisCustos=consumos.filter(c=>c.total!==null), semCusto=consumos.filter(c=>c.total===null);
 const qualidade=eventos.filter(e=>e.etapa==='Qualidade'), concluidas=[...new Map(qualidade.filter(e=>e.resultado==='aprovado').map(e=>[String(e.os_id),e])).values()];
 const meta=Number(f.sla)>0?Number(f.sla):null, avaliadas=concluidas.filter(e=>e.lead_horas!==null), dentro=meta===null?null:avaliadas.filter(e=>e.lead_horas<=meta).length;
 const carteira=base.os.filter(o=>corresponde(o,f)&&!terminal(o.status_atual)&&(!f.tecnico||[o.tecnico_responsavel,o.tecnico_triagem,o.tecnico_bancada,o.tecnico_limpeza,o.tecnico_qualidade].some(t=>normalizar(t)===normalizar(f.tecnico)))).map(os=>{const inicio=entradaMs(os);const aging=inicio===null?null:Math.max(0,(agora-inicio)/3600000);return {...os,aging_horas:aging,atrasada:meta!==null&&aging!==null&&aging>meta};}).sort((a,b)=>(b.aging_horas??-1)-(a.aging_horas??-1));
 const series=new Map();
 for(let d=new Date(f.inicio+'T12:00:00Z'),fim=new Date(f.fim+'T12:00:00Z');d<=fim;d.setUTCDate(d.getUTCDate()+1)){
  const periodo=grupoTemporal(iso(d),f.grupo||'dia');if(!series.has(periodo))series.set(periodo,{periodo,total:0,...Object.fromEntries(ETAPAS_BRANCA.map(e=>[e,0]))});
 }
 eventos.forEach(e=>{const linha=series.get(grupoTemporal(e.dia,f.grupo||'dia'));if(linha){linha[e.etapa]=(linha[e.etapa]||0)+1;linha.total++;}});
 const horas=Array.from({length:24},(_,h)=>({hora:String(h).padStart(2,'0')+':00',total:0}));eventos.filter(e=>e.hora!==null).forEach(e=>horas[Number(e.hora)].total++);
 const ranking=new Map();
 for(const e of eventos){const k=normalizar(e.tecnico);if(!ranking.has(k))ranking.set(k,{tecnico:e.tecnico,total:0,os:new Set(),dias:new Set(),retrabalhos:0,minutos:[],etapas:{},custo:0});const r=ranking.get(k);r.total++;r.os.add(e.os_id);r.dias.add(e.dia);r.retrabalhos+=Number(e.retrabalho);if(e.minutos!==null)r.minutos.push(e.minutos);r.etapas[e.etapa]=(r.etapas[e.etapa]||0)+1;}
 for(const c of consumos){const k=normalizar(c.tecnico);if(!ranking.has(k))ranking.set(k,{tecnico:c.tecnico,total:0,os:new Set(),dias:new Set(),retrabalhos:0,minutos:[],etapas:{},custo:0});const r=ranking.get(k);if(c.total!==null)r.custo+=c.total;}
 const etapas=ETAPAS_BRANCA.map(etapa=>{const linhas=eventos.filter(e=>e.etapa===etapa);return {etapa,total:linhas.length,mediaMinutos:media(linhas.filter(e=>e.minutos!==null).map(e=>e.minutos)),reprovadas:linhas.filter(e=>e.resultado==='reprovado'||e.resultado==='condenado').length,retrabalhos:linhas.filter(e=>e.retrabalho).length};});
 const trocasSemLancamento=(base.execucoes||[]).filter(e=>e.peca_trocada&&e.dt_fim&&osMap.has(String(e.os_id))&&corresponde(osMap.get(String(e.os_id)),f)&&noPeriodo(e.dt_fim,f)&&(!f.tecnico||normalizar(e.tecnico)===normalizar(f.tecnico))&&!(base.consumos||[]).some(c=>String(c.os_id)===String(e.os_id)&&c.utilizado_em&&Math.abs(Date.parse(c.utilizado_em)-Date.parse(e.dt_fim))<86400000));
 return {eventos,consumos,carteira,etapas,serie:[...series.values()],horas,semHorario:eventos.filter(e=>e.hora===null).length,concluidas,avaliadas:avaliadas.length,dentro,meta,leadMedio:media(avaliadas.map(e=>e.lead_horas)),qualidadeTotal:qualidade.length,qualidadeAprovadas:qualidade.filter(e=>e.resultado==='aprovado').length,unicas:new Set(eventos.map(e=>e.os_id)).size,custo:totaisCustos.reduce((s,c)=>s+c.total,0),semCusto:semCusto.length,trocasSemLancamento:trocasSemLancamento.length,ranking:[...ranking.values()].map(r=>({...r,os:r.os.size,dias:r.dias.size,media:r.dias.size?r.total/r.dias.size:0,mediaMinutos:media(r.minutos)})).sort((a,b)=>b.total-a.total)};
}
export function agruparProdutosBranca(resumo,campo) {
 const grupos=new Map(), obter=os=>{const raw=campo==='modelo'?`${os.marca||'Sem marca'} · ${os.modelo||'Sem modelo'}`:os[campo]||'Não informado';const k=normalizar(raw);if(!grupos.has(k))grupos.set(k,{nome:raw,total:0,os:new Set(),concluidas:new Set(),custo:0,semCusto:0});return grupos.get(k);};
 resumo.eventos.forEach(e=>{const g=obter(e.os);g.total++;g.os.add(e.os_id);if(e.etapa==='Qualidade'&&e.resultado==='aprovado')g.concluidas.add(e.os_id);});
 resumo.consumos.forEach(c=>{const g=obter(c.os);if(c.total===null)g.semCusto++;else g.custo+=c.total;});
 return [...grupos.values()].map(g=>({...g,os:g.os.size,concluidas:g.concluidas.size})).sort((a,b)=>b.total-a.total||b.custo-a.custo);
}

// Equipamentos únicos para os destinos; atividades para comparar a produção por pessoa.
export function resumirPainelBranca(resumo) {
 const operacionais=resumo.eventos.filter(e=>e.etapa!=='Recebimento');
 const destinos=new Map(),prioridade={sem_resultado:0,aprovado:1,condenado:2,reparo:3};
 for(const e of operacionais.filter(e=>e.etapa==='Triagem')) {
  const resultado=Object.hasOwn(prioridade,e.resultado)?e.resultado:'sem_resultado';
  const chave=String(e.os_id),anterior=destinos.get(chave);
  if(!anterior||prioridade[resultado]>prioridade[anterior])destinos.set(chave,resultado);
 }
 const distribuicao=[
  {id:'reparo',nome:'Encaminhados para reparo',cor:'#f59e0b'},
  {id:'aprovado',nome:'Aprovados sem reparo',cor:'#10b981'},
  {id:'condenado',nome:'Condenados / scrap',cor:'#f43f5e'},
  {id:'sem_resultado',nome:'Destino não informado',cor:'#94a3b8'},
 ].map(d=>({...d,total:[...destinos.values()].filter(v=>v===d.id).length}));
 const pessoas=new Map(),custos=new Map(resumo.ranking.map(r=>[normalizar(r.tecnico),r.custo]));
 for(const e of operacionais) {
  const chave=normalizar(e.tecnico);
  if(!chave||chave==='sem tecnico identificado')continue;
  if(!pessoas.has(chave))pessoas.set(chave,{tecnico:e.tecnico,total:0,os:new Set(),dias:new Set(),etapas:{},retrabalhos:0,minutos:[],custo:custos.get(chave)||0});
  const pessoa=pessoas.get(chave);pessoa.total++;pessoa.os.add(String(e.os_id));
  pessoa.dias.add(e.dia);pessoa.retrabalhos+=Number(e.retrabalho);if(e.minutos!==null)pessoa.minutos.push(e.minutos);
  pessoa.etapas[e.etapa]=(pessoa.etapas[e.etapa]||0)+1;
 }
 const ranking=[...pessoas.values()].map(p=>({...p,os:p.os.size,dias:p.dias.size,media:p.dias.size?p.total/p.dias.size:0,mediaMinutos:media(p.minutos)})).sort((a,b)=>b.total-a.total||a.tecnico.localeCompare(b.tecnico,'pt-BR'));
 const unicas=etapa=>new Set(operacionais.filter(e=>e.etapa===etapa).map(e=>String(e.os_id))).size;
 const categorias=['Lavadoras','Refrigeração','Climatização','Outros / Portáteis'].map(nome=>{
  const eventos=operacionais.filter(e=>areaLinhaBranca(e.os.categoria)===nome);
  return {nome,equipamentos:new Set(eventos.map(e=>String(e.os_id))).size,triados:new Set(eventos.filter(e=>e.etapa==='Triagem').map(e=>String(e.os_id))).size,atividades:eventos.length};
 });
 const triados=destinos.size,reparo=distribuicao[0].total;
 return {triados,reparo,taxaReparo:triados?reparo/triados*100:null,distribuicao,ranking,categorias,
  reparados:new Set(operacionais.filter(e=>e.etapa==='Reparo'&&['concluido','aprovado'].includes(e.resultado)).map(e=>String(e.os_id))).size,
  higienizados:unicas('Higienização'),finalizados:resumo.concluidas.length,
  equipamentos:new Set(operacionais.map(e=>String(e.os_id))).size,atividades:operacionais.length,
  semTecnico:operacionais.filter(e=>!normalizar(e.tecnico)||normalizar(e.tecnico)==='sem tecnico identificado').length};
}
