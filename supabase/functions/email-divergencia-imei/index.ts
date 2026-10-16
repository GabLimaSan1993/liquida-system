import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.103.0';
import nodemailer from 'npm:nodemailer@6.9.14';
const esc = (x: unknown) => String(x ?? '—').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
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
    const text=`IMEI DIVERGENTE\nVoucher: ${c.voucher}\nAparelho: ${c.modelo}\nIdentificação do contrato: ${c.imei_esperado}\nBipado 1: ${c.imei1}\nBipado 2: ${c.imei2 || 'Não se aplica'}\nO aparelho foi segregado. A Assurant deve registrar sua diretriz na tela Triagens > Divergências de IMEI do Liquida System.\nCaso: ${c.id}`;
    await transport.sendMail({from:Deno.env.get('ZOHO_FROM') || Deno.env.get('ZOHO_USER'),to:data.destinatarios.join(', '),
      subject:`IMEI DIVERGENTE — ${c.voucher}`,text,
      html:`<div style="font-family:Arial;color:#334155"><h2 style="color:#b91c1c">IMEI DIVERGENTE</h2><p>O aparelho foi segregado e aguarda decisão da Assurant.</p><table>${[['Voucher',c.voucher],['Modelo',c.modelo],['Contrato',c.imei_esperado],['Bipado 1',c.imei1],['Bipado 2',c.imei2],['Caso',c.id]].map(([a,b])=>`<tr><th style="text-align:left;padding:8px">${esc(a)}</th><td>${esc(b)}</td></tr>`).join('')}</table><p>Acesse Triagens → Divergências de IMEI e registre a diretriz.</p></div>`,
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
