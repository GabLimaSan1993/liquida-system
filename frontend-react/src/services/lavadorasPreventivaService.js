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
export async function anexarFotoLavadora({osId,cicloPrimeiroId,categoria,item,fase,arquivo}){
  if(!arquivo?.type?.startsWith("image/") || !["image/jpeg","image/png","image/webp"].includes(arquivo.type))
    throw new Error("Selecione foto JPG, PNG ou WebP.");
  if(arquivo.size>10*1024*1024)throw new Error("Foto acima de 10 MB. Reduza o arquivo.");
  const ext=arquivo.type==="image/png"?"png":arquivo.type==="image/webp"?"webp":"jpg";
  const caminho=`${osId}/${cicloPrimeiroId}/${categoria}/${crypto.randomUUID()}.${ext}`;
  const {error:uploadError}=await supabase.storage.from(BUCKET_EVIDENCIAS_LAVADORA)
    .upload(caminho,arquivo,{contentType:arquivo.type,upsert:false});
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
