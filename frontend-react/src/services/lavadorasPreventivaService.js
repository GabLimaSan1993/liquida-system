import { supabase } from "../lib/supabase.js";

export const ITENS_PREVENTIVA_LAVADORA = [
  {chave:"vedacao_painel",label:"Vedação do painel frontal"},
  {chave:"mangueiras",label:"Conexões e fixações das mangueiras"},
  {chave:"gaxetas",label:"Gaxetas"},
  {chave:"pes",label:"Pés niveladores",foto:true},
  {chave:"suspensao",label:"Suspensão"},
  {chave:"eletrica",label:"Conexões elétricas"},
  {chave:"oxidacao",label:"Oxidação / corrosão",foto:true},
];
export const BUCKET_EVIDENCIAS_LAVADORA="linha-branca-evidencias";

export async function buscarIntercicloLavadora(cicloPrimeiroId){
  const {data:check,error}=await supabase.from("linha_branca_lavadora_interciclo")
    .select("*").eq("ciclo_primeiro_id",cicloPrimeiroId).maybeSingle();
  if(error)throw error;
  const {data:fotos,error:e}=await supabase.from("linha_branca_lavadora_evidencias")
    .select("*").eq("ciclo_primeiro_id",cicloPrimeiroId).order("criado_em",{ascending:false});
  if(e)throw e;
  return {check,fotos:fotos||[]};
}
export async function buscarUltimoIntercicloLavadora(osId){
  const {data:check,error}=await supabase.from("linha_branca_lavadora_interciclo")
    .select("*").eq("os_id",osId).order("concluido_em",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  if(!check)return {check:null,fotos:[]};
  return buscarIntercicloLavadora(check.ciclo_primeiro_id);
}
// Fotos grandes dos celulares são reduzidas antes do envio, mantendo a
// qualidade suficiente para evidenciar peças, corrosão e avarias.
async function prepararFotoLavadora(arquivo){
 const formatosPermitidos=["image/jpeg","image/png","image/webp"];
 const podeConverter=["image/heic","image/heif"].includes(arquivo?.type);
 if(!formatosPermitidos.includes(arquivo?.type)&&!podeConverter)
   throw new Error("Foto incompatível. Use JPG, PNG ou WebP.");
 if(arquivo.size<=8*1024*1024&&!podeConverter)return arquivo;
 if(typeof createImageBitmap!=="function")
   throw new Error("Foto muito grande ou incompatível. Selecione uma foto JPG menor que 10 MB.");
 let bitmap;
 try{
  bitmap=await createImageBitmap(arquivo);
  const fator=Math.min(1,1920/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");
  canvas.width=Math.max(1,Math.round(bitmap.width*fator));
  canvas.height=Math.max(1,Math.round(bitmap.height*fator));
  const context=canvas.getContext("2d");
  if(!context)throw new Error("Não foi possível processar a imagem");
  context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/jpeg",0.82));
  if(!blob||blob.size>10*1024*1024)throw new Error("Falha ao compactar a foto");
  return new File([blob],(arquivo.name||"foto").replace(/\.[^.]+$/,"")+".jpg",{type:"image/jpeg"});
 }catch(error){
  throw new Error("Não foi possível preparar a foto do celular. Fotografe em JPG ou selecione outra imagem. "+(error.message||""));
 }finally{bitmap?.close?.()}
}
export async function anexarFotoLavadora({osId,cicloPrimeiroId,categoria,item,fase,arquivo}){
  const fotoPronta=await prepararFotoLavadora(arquivo);
  const ext=fotoPronta.type==="image/png"?"png":fotoPronta.type==="image/webp"?"webp":"jpg";
  const caminho=`${osId}/${cicloPrimeiroId}/${categoria}/${crypto.randomUUID()}.${ext}`;
  const {error:uploadError}=await supabase.storage.from(BUCKET_EVIDENCIAS_LAVADORA)
    .upload(caminho,fotoPronta,{contentType:fotoPronta.type,upsert:false});
  if(uploadError)throw uploadError;
  const {data,error}=await supabase.from("linha_branca_lavadora_evidencias")
    .insert({os_id:osId,ciclo_primeiro_id:cicloPrimeiroId,categoria,item,fase,caminho})
    .select("*").single();
  if(error)throw new Error("Foto enviada, mas não vinculada à OS: "+error.message);
  return data;
}
export async function urlFotoLavadora(caminho){
  if(!caminho)return null;
  const {data,error}=await supabase.storage.from(BUCKET_EVIDENCIAS_LAVADORA).createSignedUrl(caminho,600);
  if(error)throw error;
  return data.signedUrl;
}
export async function salvarIntercicloLavadora(ciclo,payload){
  const dados={
    os_id:ciclo.os_id,
    ciclo_primeiro_id:ciclo.id,
    checklist:payload.checklist,
    lg_preventiva_aplicada:payload.lg_preventiva_aplicada,
    vazamento:payload.vazamento,
    estetica_apresenta_defeito:payload.estetica_apresenta_defeito,
    defeitos_esteticos:payload.estetica_apresenta_defeito?payload.defeitos_esteticos:[],
    operador:payload.operador,
    observacoes_preventiva:payload.observacoes_preventiva || null,
    concluido_em:new Date().toISOString(),
  };
  const {data,error}=await supabase.from("linha_branca_lavadora_interciclo")
    .upsert(dados,{onConflict:"ciclo_primeiro_id"}).select("*").single();
  if(error)throw error;
  const {error:verificar}=await supabase.rpc("linha_branca_lavadora_validar_interciclo",{p_ciclo_id:ciclo.id});
  if(verificar)throw verificar;
  return data;
}
export async function encaminharPreventivaLavadora(cicloId,tipo,operador){
  const {data,error}=await supabase.rpc("lavadora_encaminhar_preventiva",{
    p_ciclo_id:cicloId,p_tipo:tipo,p_operador:operador,
  });
  if(error)throw error;
  return data;
}
export async function conferirEvidenciasEsteticas(osId){
  const {check,fotos}=await buscarUltimoIntercicloLavadora(osId);
  if(!check?.estetica_apresenta_defeito)return {check:null,fotos:[],pendentes:[]};
  const pendentes=(check.defeitos_esteticos||[]).filter(item=>
    !fotos.some(f=>f.categoria==="estetico"&&f.item===item&&f.fase==="depois"));
  return {check,fotos,pendentes};
}

export async function encaminharNaoConformidadeLavadora(cicloId,operador){
 const {data,error}=await supabase.rpc("lavadora_encaminhar_nao_conformidade",{
  p_ciclo_id:cicloId,p_operador:operador
 });
 if(error)throw error;
 return data;
}
