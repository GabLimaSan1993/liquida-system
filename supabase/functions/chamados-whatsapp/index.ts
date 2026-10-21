import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import { corpoMensagem, erroTwilio, resultadoTwilio } from './mensagem.js';

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let id: string | undefined; let token: string | undefined;
  let job: any; let acceptedSid: string | undefined;
  const finalizar = async (estado: string, sid?: string, erro?: string) => {
    const { error } = await db.rpc('chamados_whatsapp_finalizar', { p_id: id, p_token: token, p_estado: estado, p_sid: sid || null, p_erro: erro || null });
    if (error) throw new Error('Falha ao registrar resultado.');
  };
  try {
    ({ id, token } = await req.json());
    if (![id, token].every(v => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v || ''))) return new Response('Forbidden', { status: 403 });
    const claim = await db.rpc('chamados_whatsapp_claim', { p_id: id, p_token: token });
    if (claim.error) throw new Error('Falha no processamento.');
    job = claim.data;
    if (!job) return Response.json({ ok: true, ignorado: true });
    const c = job.config;
    if (!/^AC[0-9a-f]{32}$/i.test(c.account_sid || '')) throw new Error('Conta inválida.');
    const consultar = job.acao === 'consultar';
    if (consultar && !/^SM[0-9a-f]{32}$/i.test(job.message_sid || '')) throw new Error('Mensagem inválida.');
    if (!consultar && job.teste && c.modo === 'teste' && !/^HX[0-9a-f]{32}$/i.test(c.content_sid || '')) {
      await finalizar('erro', undefined, 'Falta o modelo de teste da sua conta Twilio. Copie o Content SID (HX...) exibido em Try out WhatsApp, salve a configuração e envie outro teste.');
      return Response.json({ ok: false });
    }
    if (!consultar && !job.teste) {
      const accountResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${c.account_sid}.json`, {
        headers: { Authorization: `Basic ${btoa(`${c.account_sid}:${c.auth_token}`)}` }, signal: AbortSignal.timeout(10000),
      });
      const account = await accountResponse.json().catch(() => ({}));
      if (!accountResponse.ok || account.type !== 'Full' || account.status !== 'active') {
        await finalizar('erro', undefined, accountResponse.ok ? 'A conta Twilio ainda não está habilitada para produção. O modo de teste permite somente testes manuais.' : erroTwilio(account.code));
        return Response.json({ ok: false });
      }
    }
    const root = `https://api.twilio.com/2010-04-01/Accounts/${c.account_sid}/Messages`;
    const url = consultar ? `${root}/${job.message_sid}.json` : `${root}.json`;
    const response = await fetch(url, {
      method: consultar ? 'GET' : 'POST',
      headers: { Authorization: `Basic ${btoa(`${c.account_sid}:${c.auth_token}`)}`, ...(consultar ? {} : { 'Content-Type': 'application/x-www-form-urlencoded' }) },
      ...(consultar ? {} : { body: corpoMensagem(job) }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429 && !consultar) await finalizar('pendente', undefined, 'Limite temporário da Twilio; nova tentativa em até um minuto.');
      else if (response.status >= 500) await finalizar(consultar ? 'aceito' : 'incerto', job.message_sid, 'Serviço temporariamente indisponível. Confira o histórico na Twilio.');
      else await finalizar('erro', job.message_sid, erroTwilio(data.code));
      return Response.json({ ok: false }, { status: 200 });
    }
    if (!/^SM[0-9a-f]{32}$/i.test(data.sid || '')) {
      await finalizar(consultar ? 'aceito' : 'incerto', job.message_sid, 'Resposta sem confirmação válida. Confira o histórico na Twilio.');
      return Response.json({ ok: false });
    }
    acceptedSid = data.sid;
    const estado = resultadoTwilio(data);
    await finalizar(estado, data.sid, estado === 'erro' ? erroTwilio(data.error_code) : undefined);
    return Response.json({ ok: true, estado });
  } catch {
    if (job && id && token) {
      try { await finalizar(job.acao === 'consultar' || acceptedSid ? 'aceito' : 'incerto', acceptedSid || job.message_sid, 'Não foi possível confirmar o resultado; consulte o histórico na Twilio.'); } catch { /* A fila será marcada como incerta, sem duplicar o envio. */ }
    }
    return Response.json({ ok: false, erro: 'Envio sem confirmação.' }, { status: 500 });
  }
});
