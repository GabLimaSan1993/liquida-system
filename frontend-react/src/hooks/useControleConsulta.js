import {useEffect,useState} from 'react';
import {controleRpc} from '../services/controlesOperacionaisService.js';
// Query identity prevents displaying stale results while another period loads.
export function useControleConsulta(nome,parametros,ativo=true,versao=0){
 const serializado=JSON.stringify(parametros),chave=nome+'|'+serializado+'|'+versao;
 const [resposta,setResposta]=useState(null);
 useEffect(()=>{
  if(!ativo)return;
  const c=new AbortController();
  controleRpc(nome,JSON.parse(serializado),c.signal)
   .then(dados=>{if(!c.signal.aborted)setResposta({chave,dados,erro:''});})
   .catch(e=>{if(!c.signal.aborted)setResposta({chave,dados:null,erro:e.message});});
  return()=>c.abort();
 },[nome,serializado,chave,ativo]);
 return {dados:ativo&&resposta?.chave===chave?resposta.dados:null,erro:ativo&&resposta?.chave===chave?resposta.erro:'',carregando:ativo&&resposta?.chave!==chave};
}
