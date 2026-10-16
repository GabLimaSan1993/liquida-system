import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import nodemailer from 'npm:nodemailer@6.9.14';
import { mensagemDivergencia } from './mensagem.js';
Deno.serve(async req => {
  if(req.method !== 'POST') return new Response('Method not allowed',{status:405});
  let caso_id: string | undefined; let token: string | undefined;
  const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  try {
    ({caso_id,token}=await req.json());
    if(!/^[0-9a-f-]{36}$/i.test(caso_id || '') || !/^[0-9a-f-]{36}$/i.test(token || '')) return new Response('Forbidden',{status:403});
    // Autenticação própria do webhook: nonce privado e claim atômico no banco.
    const {data,error}=await db.rpc('assurant_divergencia_email_claim',{p_caso:caso_id,p_token:token});
    if(error) throw new Error(error.message);
    if(!data) return Response.json({ok:true,ignorado:true});
    const c=data.caso;
    const transport=nodemailer.createTransport({host:Deno.env.get('ZOHO_HOST') || 'smtp.zoho.com',port:465,secure:true,
      auth:{user:Deno.env.get('ZOHO_USER'),pass:Deno.env.get('ZOHO_PASS')}});
    const mensagem = mensagemDivergencia(c);
    await transport.sendMail({from:Deno.env.get('ZOHO_FROM') || Deno.env.get('ZOHO_USER'),
      to:data.destinatarios, cc:data.copias || [], ...mensagem,
      messageId:`<divergencia-${c.id}@liquidapreco.com.br>`});
    const result=await db.rpc('assurant_divergencia_email_finalizar',{p_caso:caso_id,p_token:token,p_erro:null});
    if(result.error) throw new Error('SMTP aceitou o e-mail; não foi possível registrar confirmação.');
    return Response.json({ok:true});
  } catch(e) {
    // O erro operacional fica no painel; dados SMTP e nonces não são retornados.
    if(caso_id && token) await db.rpc('assurant_divergencia_email_finalizar',{p_caso:caso_id,p_token:token,p_erro:'Falha no envio ou confirmação do aviso; verificar o serviço de e-mail.'});
    return Response.json({ok:false,erro:'Aviso pendente de envio.'},{status:500});
  }
});
