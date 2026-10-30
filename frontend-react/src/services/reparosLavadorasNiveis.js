// Niveis de complexidade de reparos de lavadoras - catalogo operacional.
export const CATALOGO_REPAROS_LAVADORAS = Object.freeze({
  "Mecânico": [
    {
      "nome": "CESTO",
      "nivel": "N3"
    },
    {
      "nome": "TAMBOR",
      "nivel": "N3"
    },
    {
      "nome": "EIXO TRIPÉ",
      "nivel": "N3"
    },
    {
      "nome": "AMORTECEDOR",
      "nivel": "N2"
    },
    {
      "nome": "VARETA DE SUSPENSÃO",
      "nivel": "N2"
    },
    {
      "nome": "ROLAMENTO",
      "nivel": "N3"
    },
    {
      "nome": "RETENTOR",
      "nivel": "N3"
    },
    {
      "nome": "PRESSOSTATO",
      "nivel": "N2"
    },
    {
      "nome": "CORREIA",
      "nivel": "N2"
    },
    {
      "nome": "MANGUEIRA DE DRENAGEM",
      "nivel": "N2"
    },
    {
      "nome": "MANGUEIRA CACHIMBO",
      "nivel": "N2"
    },
    {
      "nome": "MANGUEIRA DO DISPENSER",
      "nivel": "N1"
    },
    {
      "nome": "MANGUEIRA FILTRO DE DRENAGEM",
      "nivel": "N2"
    },
    {
      "nome": "GAXETA",
      "nivel": "N2"
    },
    {
      "nome": "CONJUNTO DO CÂMBIO",
      "nivel": "N3"
    }
  ],
  "Elétrico": [
    {
      "nome": "MOTOR",
      "nivel": "N3"
    },
    {
      "nome": "MOTOR INVERTER",
      "nivel": "N3"
    },
    {
      "nome": "PLACA PRINCIPAL",
      "nivel": "N3"
    },
    {
      "nome": "PLACA INVERTER",
      "nivel": "N3"
    },
    {
      "nome": "PLACA DE POTÊNCIA",
      "nivel": "N3"
    },
    {
      "nome": "FILTRO DE LINHA",
      "nivel": "N3"
    },
    {
      "nome": "CHICOTE ELÉTRICO",
      "nivel": "N3"
    },
    {
      "nome": "TERMOSTATO",
      "nivel": "N3"
    },
    {
      "nome": "RESISTÊNCIA DE SECAGEM",
      "nivel": "N3"
    },
    {
      "nome": "MOTO-VENTILADOR",
      "nivel": "N3"
    },
    {
      "nome": "PLACA DISPLAY",
      "nivel": "N3"
    },
    {
      "nome": "CABO AC",
      "nivel": "N2"
    },
    {
      "nome": "VÁLVULA DE ENTRADA",
      "nivel": "N2"
    },
    {
      "nome": "BOMBA DE DRENAGEM",
      "nivel": "N2"
    },
    {
      "nome": "COMPRESSOR",
      "nivel": "N3"
    },
    {
      "nome": "SENSOR DE TEMPERATURA",
      "nivel": "N3"
    },
    {
      "nome": "PLACA SELETORA",
      "nivel": "N3"
    },
    {
      "nome": "REPARO DE PLACA",
      "nivel": "N3"
    }
  ],
  "Estético": [
    {
      "nome": "GABINETE - RECUPERAÇÃO LEVE",
      "nivel": "N3"
    },
    {
      "nome": "GABINETE - RECUPERAÇÃO MÉDIO",
      "nivel": "N3"
    },
    {
      "nome": "GABINETE - RECUPERAÇÃO GRAVE",
      "nivel": "N3"
    },
    {
      "nome": "GABINETE - TROCA",
      "nivel": "N3"
    },
    {
      "nome": "TAMPA FIXA",
      "nivel": "N2"
    },
    {
      "nome": "TAMPA MÓVEL",
      "nivel": "N2"
    },
    {
      "nome": "PÉ NIVELADOR",
      "nivel": "N2"
    },
    {
      "nome": "PAINEL DISPLAY",
      "nivel": "N2"
    },
    {
      "nome": "DISPENSER",
      "nivel": "N2"
    },
    {
      "nome": "PORTA FRONT LOAD",
      "nivel": "N2"
    },
    {
      "nome": "PAINEL FRONTAL",
      "nivel": "N2"
    },
    {
      "nome": "TAMPA TRASEIRA",
      "nivel": "N2"
    },
    {
      "nome": "BASE DO GABINETE - RECUPERAÇÃO",
      "nivel": "N3"
    },
    {
      "nome": "BASE DO GABINETE - TROCA",
      "nivel": "N2"
    }
  ]
});
export const TECNICOS_REPARO_LAVADORAS = Object.freeze({
  carlos: "6bd05299-fe91-462f-8972-b47202a8a68a",
  kaua: "70a0c481-ff5e-476a-b65c-92c8a30676de",
  alexandre: "cce92a9d-911a-4bf9-b59a-c8af864e312e",
});
const chave = v => String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase().replace(/\s+/g," ");
const mapa = new Map(Object.entries(CATALOGO_REPAROS_LAVADORAS).flatMap(([grupo, itens]) =>
  itens.map(item=>[chave(grupo+"|"+item.nome),item.nivel])));
mapa.set(chave("Estético|GABINETE"),"N3"); // legado, tipo de reparo nao especificado
mapa.set(chave("Estético|BASE DO GABINETE"),"N3");
export function nivelServicoLavadora(area, nome) {
  return mapa.get(chave(String(area||"").replace(/^Reparo\s+/i,"")+"|"+nome)) || null;
}
export function classificarTriagemLavadora(triagem) {
  if(!triagem) return {nivel:null,pendente:true,desconhecidos:[]};
  const servicos=[["Mecânico",triagem.reparos_mecanicos],["Elétrico",triagem.reparos_eletricos],["Estético",triagem.reparos_esteticos]];
  let maior=0;const desconhecidos=[];
  servicos.forEach(([area,itens])=>(itens||[]).forEach(nome=>{
    const n=nivelServicoLavadora(area,nome);
    if(n)maior=Math.max(maior,Number(n[1]));else desconhecidos.push(nome);
  }));
  return {nivel:desconhecidos.length||!maior?null:"N"+maior,pendente:!maior||desconhecidos.length>0,desconhecidos};
}
export function nivelEfetivoLavadora(os) {
  const triagem=classificarTriagemLavadora(os?.__triagem);
  return triagem.pendente?"N3":(os?.nivel_reparo||triagem.nivel||"N3");
}
export function tecnicoHabilitadoLavadora(profile, nivel) {
  const id=String(profile?.id||"");
  return nivel==="N3" ? id===TECNICOS_REPARO_LAVADORAS.carlos : Object.values(TECNICOS_REPARO_LAVADORAS).includes(id);
}
/** Retorno de bancada após falha em reparo de Kaua/Alexandre é exclusivo de Carlos.
 * Nível original da OS permanece N1/N2 para métricas e cor dos cartões.
 */
export function tecnicoPodeAtuarOsLavadora(profile, os) {
  if (!os) return false;
  if (os.retorno_pos_reparo_exclusivo_carlos === true) {
    return String(profile?.id||"") === TECNICOS_REPARO_LAVADORAS.carlos;
  }
  return tecnicoHabilitadoLavadora(profile,nivelEfetivoLavadora(os));
}
export const VISUAL_NIVEIS_LAVADORAS=Object.freeze({
  N1:{card:"border-emerald-300 bg-emerald-50",bolinha:"bg-emerald-500",selo:"bg-emerald-100 text-emerald-800"},
  N2:{card:"border-amber-300 bg-amber-50",bolinha:"bg-amber-400",selo:"bg-amber-100 text-amber-800"},
  N3:{card:"border-rose-300 bg-rose-50",bolinha:"bg-rose-500",selo:"bg-rose-100 text-rose-800"},
});
