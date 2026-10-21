import { useEffect, useState } from 'react';
import { Modal } from './ChamadosPage.jsx';
import { chamadosWhatsapp } from '../services/chamadosWhatsappService.js';

const input = 'mt-1 w-full rounded-xl border border-slate-200 p-3 text-sm disabled:opacity-50';
const button = 'rounded-xl bg-[#6B1F87] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50';
const estados = { pendente:'Pendente', despachado:'Aguardando serviço', enviando:'Enviando', aceito:'Aceito pela Twilio — aguardando entrega', entregue:'Entregue', erro:'Falha', incerto:'Sem confirmação — conferir na Twilio' };
const vazio = { modo:'teste', ativo:false, destinatario:'', remetente:'', account_sid:'', content_sid:'', auth_token:'' };

export default function ChamadosWhatsappConfig({ onClose }) {
  const [form,setForm] = useState(vazio);
  const [envios,setEnvios] = useState([]);
  const [temToken,setTemToken] = useState(false);
  const [busy,setBusy] = useState(true);
  const [erro,setErro] = useState('');
  const [aviso,setAviso] = useState('');
  const aguardando = envios.some(r=>['pendente','despachado','enviando','aceito'].includes(r.estado));
  useEffect(()=>{
    if (!aguardando) return;
    let ativo=true;
    const timer=setInterval(()=>{
      chamadosWhatsapp().then(d=>{if(ativo)setEnvios(d.envios);}).catch(e=>{if(ativo)setErro(e.message);});
    },5000);
    return ()=>{ativo=false;clearInterval(timer);};
  },[aguardando]);
  useEffect(()=>{
    let ativo = true;
    chamadosWhatsapp().then(d=>{
      if (!ativo) return;
      const c=d.config;
      setForm({...vazio,modo:c.modo,ativo:c.ativo,destinatario:c.destinatario||'',remetente:c.remetente||'',account_sid:c.account_sid||'',content_sid:c.content_sid||''});
      setTemToken(d.token_configurado);setEnvios(d.envios);
    }).catch(e=>{if(ativo)setErro(e.message);}).finally(()=>{if(ativo)setBusy(false);});
    return ()=>{ativo=false;};
  },[]);
  function mudar(k,v) { setForm(p=>({...p,[k]:v,...(k==='modo'&&v==='teste'?{ativo:false}:{})})); }
  async function salvar(e) {
    e.preventDefault();setBusy(true);setErro('');setAviso('');
    try {
      const d=await chamadosWhatsapp('salvar',form);
      setForm(p=>({...p,auth_token:''}));setTemToken(d.token_configurado);setEnvios(d.envios);
      setAviso(d.config.ativo?'Avisos automáticos ativados para novos chamados.':'Configuração salva. Avisos automáticos desativados.');
    } catch(e) {setErro(e.message);} finally {setBusy(false);}
  }
  async function testar() {
    setBusy(true);setErro('');setAviso('');
    try {const d=await chamadosWhatsapp('teste');setEnvios(d.envios);setAviso('Teste solicitado. A situação do envio será atualizada automaticamente abaixo.');}
    catch(e){setErro(e.message);}finally{setBusy(false);}
  }
  async function atualizar() {
    setBusy(true);setErro('');
    try {const d=await chamadosWhatsapp();setEnvios(d.envios);setTemToken(d.token_configurado);}
    catch(e){setErro(e.message);}finally{setBusy(false);}
  }
  return <Modal titulo="Avisos de chamados no WhatsApp" onClose={onClose} ocupado={busy}>
    <div className="space-y-5">
      <p className="text-sm text-slate-600">Cada novo chamado pode gerar um aviso com número, título, prioridade, solicitante, área e link do Liquida. A configuração é exclusiva da gestão.</p>
      <form onSubmit={salvar} className="space-y-4">
        <fieldset disabled={busy} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-xs font-bold text-slate-600">Modo<select className={input} value={form.modo} onChange={e=>mudar('modo',e.target.value)}><option value="teste">Teste de conexão</option><option value="producao">Produção</option></select></label>
            <label className="text-xs font-bold text-slate-600">Número que receberá os avisos<input className={input} type="tel" required value={form.destinatario} onChange={e=>mudar('destinatario',e.target.value)} placeholder="+5511999999999" /></label>
            <label className="text-xs font-bold text-slate-600">Remetente habilitado na Twilio<input className={input} type="tel" required value={form.remetente} onChange={e=>mudar('remetente',e.target.value)} placeholder="+código do país e número" /></label>
            <label className="text-xs font-bold text-slate-600">Account SID<input className={input} required autoComplete="off" value={form.account_sid} onChange={e=>mudar('account_sid',e.target.value)} placeholder="AC..." /></label>
          </div>
          <label className="block text-xs font-bold text-slate-600">Auth Token da Twilio<input className={input} type="password" autoComplete="new-password" value={form.auth_token} onChange={e=>mudar('auth_token',e.target.value)} placeholder={temToken?'Token já salvo. Deixe em branco para manter.':'Cole o Auth Token diretamente aqui.'} /><span className="mt-1 block font-normal text-slate-400">O token é guardado criptografado e não pode ser consultado por esta tela.</span></label>
          <label className="block text-xs font-bold text-slate-600">{form.modo==='teste'?'Content SID do modelo de teste da Twilio':'Content SID do modelo aprovado'}<input className={input} value={form.content_sid} onChange={e=>mudar('content_sid',e.target.value)} placeholder="HX..." pattern="HX[0-9a-fA-F]{32}" />{form.modo==='teste'&&<span className="mt-1 block font-normal text-slate-400">Copie o ContentSid do exemplo de API exibido em Try out WhatsApp na sua conta Twilio.</span>}</label>
          {form.modo==='teste'?<p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">A conta de teste aceita somente mensagens prontas da Twilio, que podem estar em inglês. Vincule seu celular, copie o Content SID do modelo de teste e salve antes de enviar. Os avisos automáticos com dados dos chamados exigem conta e remetente de produção e um modelo aprovado.</p>:<>
            <label className="flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-sm"><input type="checkbox" checked={form.ativo} onChange={e=>mudar('ativo',e.target.checked)} /><span>Ativar aviso para cada novo chamado. Confirmo que a conta e o remetente estão habilitados para produção e que o modelo foi aprovado.</span></label>
          </>}
          <details className="text-xs text-slate-500"><summary className="cursor-pointer font-bold">Modelo de mensagem para cadastrar na Twilio</summary><pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans leading-6">{'Novo chamado no Liquida System\nNúmero: {{1}}\nTítulo: {{2}}\nPrioridade: {{3}}\nSolicitante: {{4}}\nÁrea: {{5}}\nAbertura: {{6}}\nAcesse: https://liquida-system.vercel.app/chamados'}</pre></details>
        </fieldset>
        <button className={button} disabled={busy}>{busy?'Aguarde…':'Salvar configuração'}</button>
      </form>
      {erro&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
      {aviso&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{aviso}</p>}
      {envios[0]?.estado==='erro'&&<p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">O último envio falhou: {envios[0].erro||'Confira os detalhes na Twilio.'}</p>}
      {envios[0]?.estado==='entregue'&&<p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">A Twilio confirmou a entrega do último envio ao WhatsApp.</p>}
      <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||!temToken} onClick={testar}>Enviar teste para configuração salva</button><button type="button" className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold" disabled={busy} onClick={atualizar}>Atualizar envios</button></div>
      <div className="overflow-auto rounded-xl border border-slate-100"><table className="w-full text-left text-xs"><thead className="bg-slate-50"><tr>{['Chamado','Situação','Data','Detalhe'].map(t=><th key={t} className="p-3">{t}</th>)}</tr></thead><tbody>{envios.map(r=><tr key={r.id} className="border-t border-slate-100"><td className="p-3">{r.teste?'Teste':`CH-${String(r.numero).padStart(5,'0')}`}</td><td className="p-3">{estados[r.estado]||r.estado}</td><td className="whitespace-nowrap p-3">{new Date(r.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})}</td><td className="max-w-80 p-3">{r.erro||r.message_sid||'—'}</td></tr>)}</tbody></table>{!envios.length&&<p className="p-4 text-sm text-slate-400">Nenhum envio registrado.</p>}</div>
    </div>
  </Modal>;
}
